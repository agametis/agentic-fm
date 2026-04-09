import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

import {
  cacheDbPath,
  errorsPath,
  sessionRpcRoot,
  sessionStatePath,
  statsPath,
} from './paths.mjs';
import {
  allSql,
  closeDb,
  enforceSchemaConstraints,
  initSchema,
  loadCacheIntoMemory,
  openMemoryDb,
} from './db.mjs';
import { refreshIndex, detectStaleness } from './indexer.mjs';
import { searchDocuments } from './search.mjs';
import { scriptCalls, scriptExplain, scriptWhereUsed } from './script-intel.mjs';
import {
  ensureDir,
  newRunId,
  nowIso,
  readJson,
  sqlStringLiteral,
  writeJson,
} from './utils.mjs';
import { AsyncLock } from './lock.mjs';

const CLIENT_TIMEOUT_MS = 120000;
const STARTUP_TIMEOUT_MS = 120000;
const DAEMON_POLL_INTERVAL_MS = 120;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && error.code === 'EPERM') {
      return true;
    }
    return false;
  }
}

async function removePathIfExists(targetPath) {
  try {
    await fs.rm(targetPath, { recursive: true, force: true });
  } catch (error) {
    if (!error || error.code !== 'ENOENT') {
      throw error;
    }
  }
}

async function cleanupStaleState() {
  const state = await readJson(sessionStatePath);
  if (!state) {
    return null;
  }
  return state;
}

async function requestViaFiles(state, payload, timeoutMs = CLIENT_TIMEOUT_MS) {
  const requestsDir = state.rpc_requests_dir || path.join(sessionRpcRoot, 'requests');
  const responsesDir = state.rpc_responses_dir || path.join(sessionRpcRoot, 'responses');

  await ensureDir(requestsDir);
  await ensureDir(responsesDir);

  const requestId = newRunId();
  const reqPath = path.join(requestsDir, `${requestId}.json`);
  const resPath = path.join(responsesDir, `${requestId}.json`);

  await writeJson(reqPath, {
    request_id: requestId,
    command: payload.command,
    args: payload.args || {},
    ts: nowIso(),
  });

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await readJson(resPath);
      if (response) {
        await removePathIfExists(reqPath);
        await removePathIfExists(resPath);
        if (!response.ok) {
          throw new Error(response.error || 'Session RPC failed');
        }
        return response.result ?? null;
      }
    } catch (error) {
      if (error && error.code !== 'ENOENT') {
        throw error;
      }
    }
    await sleep(60);
  }

  await removePathIfExists(reqPath);
  throw new Error(`Session RPC timeout (${timeoutMs}ms)`);
}

export async function readSessionState() {
  return cleanupStaleState();
}

export async function rpcCall(command, args = {}, timeoutMs = CLIENT_TIMEOUT_MS) {
  const state = await cleanupStaleState();
  if (!state) {
    throw new Error('DuckDB session is not running');
  }
  return requestViaFiles(state, { command, args }, timeoutMs);
}

async function waitForReady(spawnedPid = null) {
  const started = Date.now();
  while (Date.now() - started < STARTUP_TIMEOUT_MS) {
    if (spawnedPid && !isPidAlive(spawnedPid)) {
      throw new Error(
        "DuckDB session daemon exited during startup. Ensure dependencies are installed (`npm install`) and retry."
      );
    }

    try {
      const result = await rpcCall('status');
      if (result && result.ready) {
        return result;
      }
    } catch {
      // Wait and retry until daemon writes state and starts polling.
    }

    await sleep(200);
  }

  throw new Error('Timed out waiting for DuckDB session startup');
}

export async function startSessionDaemon({ mainScriptPath, solutionName, mode = 'full' }) {
  await ensureDir(path.dirname(sessionStatePath));
  const existing = await cleanupStaleState();

  if (existing) {
    try {
      const status = await rpcCall("status");
      if (
        solutionName &&
        existing.solution_name &&
        existing.solution_name !== solutionName
      ) {
        throw new Error(
          `DuckDB session is already running for solution '${existing.solution_name}'. Stop it before starting '${solutionName}'.`,
        );
      }
      return status;
    } catch (error) {
      if (
        solutionName &&
        existing.solution_name &&
        existing.solution_name !== solutionName
      ) {
        throw error;
      }
      await removePathIfExists(sessionStatePath);
      await removePathIfExists(existing.rpc_root || sessionRpcRoot);
    }
  }

  const args = [mainScriptPath, 'daemon'];
  if (solutionName) {
    args.push('--solution', solutionName);
  }
  if (mode) {
    args.push('--mode', mode);
  }

  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  return waitForReady(child.pid);
}

export async function stopSessionDaemon() {
  const state = await cleanupStaleState();
  if (!state) {
    return { stopped: false, message: 'Session is not running' };
  }

  try {
    const result = await requestViaFiles(state, { command: 'stop', args: {} }, 30000);
    return { stopped: true, result };
  } catch {
    if (isPidAlive(state.pid)) {
      process.kill(state.pid, 'SIGTERM');
    }
    await removePathIfExists(sessionStatePath);
    await removePathIfExists(state.rpc_root || sessionRpcRoot);
    return { stopped: true, message: 'Session process terminated' };
  }
}

async function writeState(state) {
  await writeJson(sessionStatePath, state);
}

async function handleCommand({ db, solutionName, lock, state, command, args }) {
  const runRefresh = async (refreshMode) => {
    const { result, lockWaitMs } = await lock.runWithMetrics(() =>
      refreshIndex({
        db,
        solutionName,
        mode: refreshMode,
        cachePath: cacheDbPath,
        statsPath,
        errorsPath,
        runId: state.run_id,
        cacheAction: state.cache_action || 'none',
      })
    );

    // Persist lock timing in the run summary and state for visibility.
    result.lock_wait_ms = lockWaitMs;
    state.last_refresh = result.finished_at;
    state.last_refresh_status = result.status;
    state.last_refresh_lock_wait_ms = lockWaitMs;
    await writeState(state);
    return result;
  };

  if (command === 'ping') {
    return { ok: true };
  }

  if (command === 'status') {
    const activeMode = state.mode || 'full';
    const staleness = await detectStaleness(db, solutionName, activeMode);
    return {
      ready: state.ready,
      run_id: state.run_id,
      pid: process.pid,
      solution_name: solutionName,
      mode: activeMode,
      started_at: state.started_at,
      cache_action: state.cache_action,
      stale: staleness.stale,
      estimated_changes: staleness.estimated_changes,
      files_discovered: staleness.files_discovered,
      last_refresh: state.last_refresh,
      last_refresh_status: state.last_refresh_status,
      last_refresh_lock_wait_ms: state.last_refresh_lock_wait_ms ?? 0,
    };
  }

  if (command === 'refresh') {
    const refreshMode = args.mode || 'full';
    return runRefresh(refreshMode);
  }

  if (command === 'search') {
    const staleness = await detectStaleness(db, solutionName, 'full');
    if (staleness.stale) {
      await runRefresh('full');
    }

    return searchDocuments({
      db,
      solutionName,
      query: args.query,
      limit: args.limit,
      source: args.source,
    });
  }

  if (command === 'script-explain') {
    const staleness = await detectStaleness(db, solutionName, 'scripts');
    if (staleness.stale) {
      await runRefresh('scripts');
    }
    return scriptExplain({ db, solutionName, target: args.target });
  }

  if (command === 'script-where-used') {
    const staleness = await detectStaleness(db, solutionName, 'scripts');
    if (staleness.stale) {
      await runRefresh('scripts');
    }
    return scriptWhereUsed({ db, solutionName, target: args.target });
  }

  if (command === 'script-calls') {
    const staleness = await detectStaleness(db, solutionName, 'scripts');
    if (staleness.stale) {
      await runRefresh('scripts');
    }
    return scriptCalls({ db, solutionName, target: args.target });
  }

  if (command === 'sql') {
    const query = String(args.query ?? '').trim();
    if (!query) {
      throw new Error('Missing SQL query');
    }
    return allSql(db, query);
  }

  if (command === 'stop') {
    return { stopped: true };
  }

  throw new Error(`Unknown command: ${String(command)}`);
}

async function processRequests({ db, solutionName, lock, state, rpcRequestsDir, rpcResponsesDir }) {
  await ensureDir(rpcRequestsDir);
  await ensureDir(rpcResponsesDir);

  const requestEntries = (await fs.readdir(rpcRequestsDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .sort((a, b) => a.name.localeCompare(b.name));

  let stopRequested = false;

  for (const entry of requestEntries) {
    const reqPath = path.join(rpcRequestsDir, entry.name);
    const resPath = path.join(rpcResponsesDir, entry.name);

    let request;
    try {
      request = await readJson(reqPath);
    } catch (error) {
      await writeJson(resPath, { ok: false, error: String(error?.message ?? error) });
      await removePathIfExists(reqPath);
      continue;
    }

    try {
      const result = await handleCommand({
        db,
        solutionName,
        lock,
        state,
        command: request?.command,
        args: request?.args || {},
      });
      await writeJson(resPath, { ok: true, result });
      if (request?.command === 'stop') {
        stopRequested = true;
      }
    } catch (error) {
      await writeJson(resPath, {
        ok: false,
        error: String(error?.message ?? error),
      });
    } finally {
      await removePathIfExists(reqPath);
    }
  }

  return stopRequested;
}

export async function runSessionDaemon({ solutionName, mode = 'full' }) {
  const runId = newRunId();
  const lock = new AsyncLock();
  const rpcRoot = path.join(sessionRpcRoot, runId);
  const rpcRequestsDir = path.join(rpcRoot, 'requests');
  const rpcResponsesDir = path.join(rpcRoot, 'responses');

  await ensureDir(path.dirname(sessionStatePath));
  await removePathIfExists(sessionStatePath);
  await ensureDir(rpcRequestsDir);
  await ensureDir(rpcResponsesDir);

  const db = await openMemoryDb();
  await initSchema(db);

  const state = {
    pid: process.pid,
    run_id: runId,
    started_at: nowIso(),
    solution_name: solutionName,
    mode,
    rpc_root: rpcRoot,
    rpc_requests_dir: rpcRequestsDir,
    rpc_responses_dir: rpcResponsesDir,
    ready: false,
    last_refresh: null,
    last_refresh_status: null,
  };

  await writeState(state);

  let cacheAction = 'none';
  try {
    const loaded = await loadCacheIntoMemory(db, cacheDbPath);
    cacheAction = loaded.loaded ? 'loaded' : 'created';
  } catch {
    cacheAction = 'rebuilt';
    await initSchema(db);
  }
  await enforceSchemaConstraints(db);

  try {
    const sourceRows = await allSql(
      db,
      `SELECT COUNT(*) AS c FROM sources WHERE solution_name = ${sqlStringLiteral(solutionName)}`
    );
    const hasRows = Number(sourceRows?.[0]?.c ?? 0) > 0;
    const staleness = hasRows ? await detectStaleness(db, solutionName, mode) : { stale: true };

    if (!hasRows || staleness.stale) {
      const { result: bootRefresh, lockWaitMs } = await lock.runWithMetrics(() =>
        refreshIndex({
          db,
          solutionName,
          mode,
          cachePath: cacheDbPath,
          statsPath,
          errorsPath,
          runId: runId,
          cacheAction: cacheAction,
        })
      );
      state.last_refresh = bootRefresh.finished_at;
      state.last_refresh_status = bootRefresh.status;
      state.last_refresh_lock_wait_ms = lockWaitMs;
    }
  } catch (error) {
    state.last_refresh_status = `startup_error: ${String(error?.message ?? error)}`;
  }

  state.ready = true;
  state.cache_action = cacheAction;
  await writeState(state);

  let stopping = false;

  const shutdown = async () => {
    if (stopping) {
      return;
    }
    stopping = true;
    try {
      await closeDb(db);
    } finally {
      await removePathIfExists(sessionStatePath);
      await removePathIfExists(rpcRoot);
      process.exit(0);
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  while (!stopping) {
    const stopRequested = await processRequests({
      db,
      solutionName,
      lock,
      state,
      rpcRequestsDir,
      rpcResponsesDir,
    });
    if (stopRequested) {
      await shutdown();
      return;
    }
    await sleep(DAEMON_POLL_INTERVAL_MS);
  }
}
