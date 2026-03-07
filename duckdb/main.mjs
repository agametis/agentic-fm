#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';

import {
  readSessionState,
  rpcCall,
  runSessionDaemon,
  startSessionDaemon,
  stopSessionDaemon,
} from './lib/session.mjs';
import { sourcePaths } from './lib/paths.mjs';
import { safeJsonStringify } from './lib/utils.mjs';

function parseArgs(argv) {
  const args = {
    json: false,
    verbose: false,
    quiet: false,
    solution: null,
    mode: 'full',
    port: null,
    limit: 10,
    source: 'all',
    positionals: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--json') {
      args.json = true;
      continue;
    }
    if (token === '--verbose') {
      args.verbose = true;
      continue;
    }
    if (token === '--quiet') {
      args.quiet = true;
      continue;
    }
    if (token === '--solution') {
      args.solution = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (token === '--mode') {
      args.mode = argv[i + 1] ?? 'full';
      i += 1;
      continue;
    }
    if (token === '--port') {
      const parsed = Number.parseInt(argv[i + 1] ?? '', 10);
      args.port = Number.isFinite(parsed) ? parsed : null;
      i += 1;
      continue;
    }
    if (token === '--limit') {
      const parsed = Number.parseInt(argv[i + 1] ?? '10', 10);
      args.limit = Number.isFinite(parsed) ? parsed : 10;
      i += 1;
      continue;
    }
    if (token === '--source') {
      args.source = argv[i + 1] ?? 'all';
      i += 1;
      continue;
    }

    args.positionals.push(token);
  }

  return args;
}

async function detectSolutionName() {
  try {
    const fs = await import('node:fs/promises');
    const scriptsDir = path.join(sourcePaths.xmlParsed, 'scripts_sanitized');
    const entries = await fs.readdir(scriptsDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
    if (dirs.length > 0) {
      return dirs[0];
    }
  } catch {
    // fall through
  }
  return 'default';
}

function printHeader(context = {}) {
  console.log(`Command: ${context.command_summary || '-'}`);
  console.log(`Solution: ${context.solution_name || '-'} | Mode: ${context.mode || '-'}`);
  console.log(`Run ID: ${context.run_id || '-'}`);
  console.log('');
}

function printFooter(value, context = {}, options = {}) {
  console.log('');
  const elapsed = Number.isFinite(context.elapsed_ms) ? `${context.elapsed_ms}ms` : '-';
  console.log(`Elapsed: ${elapsed}`);

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return;
  }

  if (typeof value.files_discovered !== 'undefined') {
    const discovered = Number(value.files_discovered ?? 0);
    const changed = Number(value.files_changed ?? 0);
    const skipped = Number(value.files_skipped ?? 0);
    const indexed = Number(value.files_indexed ?? 0);
    const deleted = Number(value.files_deleted ?? 0);
    const errors = Number(value.file_errors ?? 0);
    console.log(
      `Counts: discovered=${discovered}, changed=${changed}, skipped=${skipped}, indexed=${indexed}, deleted=${deleted}, errors=${errors}`
    );

    if (value.stats_path || value.errors_path) {
      console.log(`Diagnostics: stats=${value.stats_path || '-'} errors=${value.errors_path || '-'}`);
    }
  }

  if (options.verbose && value && typeof value === 'object' && !Array.isArray(value)) {
    if (typeof value.lock_wait_ms !== 'undefined') {
      console.log(`Lock wait: ${Number(value.lock_wait_ms) || 0}ms`);
    }
    if (value.cache_action) {
      console.log(`Cache action: ${value.cache_action}`);
    }
    if (Array.isArray(value.slowest_files) && value.slowest_files.length > 0) {
      console.log('Slowest files:');
      for (const item of value.slowest_files.slice(0, 5)) {
        console.log(
          `- ${item.path || '-'} (${Number(item.duration_ms) || 0}ms, ${item.source_group || 'unknown'})`
        );
      }
    }
    if (Array.isArray(value.error_samples) && value.error_samples.length > 0) {
      console.log('Error samples:');
      for (const item of value.error_samples.slice(0, 5)) {
        console.log(`- [${item.parser || 'parser'}] ${item.path || '-'}: ${item.error || ''}`);
      }
    }
  }
}

function printHuman(value, options = {}) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      console.log('No results.');
      return;
    }
    value.forEach((row, index) => {
      console.log(`${index + 1}. [${row.source_group}] ${row.title || row.doc_id}`);
      console.log(`   path: ${row.path}`);
      if (typeof row.score !== 'undefined') {
        console.log(`   score: ${row.score}`);
      }
      if (row.snippet) {
        console.log(`   snippet: ${String(row.snippet).slice(0, 220)}`);
      }
    });
    if (options.verbose) {
      console.log(`Results: ${value.length}`);
    }
    return;
  }

  if (!value || typeof value !== 'object') {
    console.log(String(value));
    return;
  }

  if (value.found === false) {
    console.log(value.reason || 'No result found.');
    return;
  }

  if (value.script && value.calls) {
    console.log(`Script: ${value.script.script_name || value.script.name} (ID ${value.script.script_id || value.script.id})`);
    if (value.calls.length === 0) {
      console.log('No outgoing script calls found.');
    } else {
      for (const item of value.calls) {
        console.log(`- line ${item.line_no}: ${item.callee} (confidence ${item.confidence})`);
      }
    }
    return;
  }

  if (value.script && value.usages) {
    console.log(`Script: ${value.script.script_name || value.script.name} (ID ${value.script.script_id || value.script.id})`);
    if (value.usages.length === 0) {
      console.log('No incoming usages found.');
    } else {
      for (const item of value.usages) {
        const container = item.container_name || item.caller_script_name || 'unknown';
        const objectId =
          typeof item.source_object_id !== 'undefined' && item.source_object_id !== null
            ? item.source_object_id
            : item.line_no;
        console.log(`- [${item.usage_type}] ${container} @ ${item.source_file || item.source_path} (${objectId ?? '-'})`);
      }
    }
    return;
  }

  if (value.script && value.preview !== undefined) {
    console.log(`Script: ${value.script.name} (ID ${value.script.id})`);
    console.log(`Confidence: ${value.script.confidence}`);
    if (value.script.source_path) {
      console.log(`Source: ${value.script.source_group} -> ${value.script.source_path}`);
    }
    console.log('Control flow:');
    if (typeof value.step_count !== 'undefined') {
      console.log(`- Indexed steps: ${value.step_count}`);
    }
    console.log(`- If blocks: ${value.control_flow.if_count}`);
    console.log(`- Loop blocks: ${value.control_flow.loop_count}`);
    console.log(`- Set Variable steps: ${value.control_flow.set_variable_count}`);
    console.log(`- Perform Script steps: ${value.control_flow.perform_script_count}`);

    if (value.called_scripts.length > 0) {
      console.log('Called scripts:');
      for (const item of value.called_scripts) {
        console.log(`- line ${item.line_no}: ${item.callee} (confidence ${item.confidence})`);
      }
    }

    if (value.preview) {
      console.log('Preview:');
      console.log(value.preview);
    }

    if (value.alternates && value.alternates.length > 0) {
      console.log('Alternates:');
      for (const alt of value.alternates) {
        console.log(`- ${alt.script_name} (ID ${alt.script_id}, confidence ${alt.confidence})`);
      }
    }
    return;
  }

  if (value.status && value.files_discovered !== undefined) {
    console.log(`Status: ${value.status}`);
    console.log(`Mode: ${value.mode} | Solution: ${value.solution_name}`);
    return;
  }

  if (value.run_id || value.ready !== undefined) {
    console.log(`Run ID: ${value.run_id ?? '-'} | Ready: ${value.ready ?? false}`);
    if (typeof value.stale !== 'undefined') {
      console.log(`Stale: ${value.stale} (estimated changes: ${value.estimated_changes ?? 0})`);
    }
    if (value.solution_name) {
      console.log(`Solution: ${value.solution_name}`);
    }
    if (value.last_refresh_status) {
      console.log(`Last refresh status: ${value.last_refresh_status}`);
    }
    if (typeof value.last_refresh_lock_wait_ms !== 'undefined') {
      console.log(`Last refresh lock wait: ${value.last_refresh_lock_wait_ms}ms`);
    }
    return;
  }

  console.log(safeJsonStringify(value, 2));
}

function output(value, asJson, context = {}, options = {}) {
  if (asJson) {
    console.log(safeJsonStringify(value, 2));
    return;
  }
  if (options.quiet) {
    return;
  }
  printHeader(context);
  printHuman(value, options);
  printFooter(value, context, options);
}

async function ensureSession({ mainScriptPath, solutionName }) {
  const state = await readSessionState();
  if (state) {
    const session = await rpcCall('status');
    return { session, initialized: false };
  }
  const session = await startSessionDaemon({ mainScriptPath, solutionName, mode: 'full' });
  return { session, initialized: true };
}

async function run() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const args = parseArgs(argv.slice(1));
  const outputOptions = {
    quiet: args.quiet,
    verbose: args.verbose,
  };

  const solutionName = args.solution || (await detectSolutionName());
  const mainScriptPath = path.resolve(process.argv[1]);

  if (command === 'daemon') {
    await runSessionDaemon({ solutionName, mode: args.mode || 'full', port: args.port });
    return;
  }

  if (command === 'session') {
    const sub = args.positionals[0];

    if (sub === 'start') {
      const startedAt = Date.now();
      const result = await startSessionDaemon({
        mainScriptPath,
        solutionName,
        mode: args.mode || 'full',
      });
      output(result, args.json, {
        command_summary: 'session start',
        solution_name: result.solution_name || solutionName,
        mode: result.mode || args.mode || 'full',
        run_id: result.run_id || '-',
        elapsed_ms: Date.now() - startedAt,
      }, outputOptions);
      return;
    }

    if (sub === 'status') {
      const startedAt = Date.now();
      const state = await readSessionState();
      if (!state) {
        output(
          { ready: false, running: false, message: 'Session not running' },
          args.json,
          {
            command_summary: 'session status',
            solution_name: solutionName,
            mode: args.mode || 'full',
            run_id: '-',
            elapsed_ms: Date.now() - startedAt,
          },
          outputOptions
        );
        return;
      }
      const result = await rpcCall('status');
      output(result, args.json, {
        command_summary: 'session status',
        solution_name: result.solution_name || solutionName,
        mode: result.mode || state.mode || args.mode || 'full',
        run_id: result.run_id || state.run_id || '-',
        elapsed_ms: Date.now() - startedAt,
      }, outputOptions);
      return;
    }

    if (sub === 'refresh') {
      const startedAt = Date.now();
      const ensured = await ensureSession({ mainScriptPath, solutionName });
      const session = ensured.session;
      const result = await rpcCall('refresh', { mode: args.mode || 'full' });
      output(result, args.json, {
        command_summary: `session refresh (${args.mode || 'full'})`,
        solution_name: result.solution_name || session.solution_name || solutionName,
        mode: result.mode || args.mode || session.mode || 'full',
        run_id: result.run_id || session.run_id || '-',
        elapsed_ms: Date.now() - startedAt,
      }, outputOptions);
      return;
    }

    if (sub === 'stop') {
      const startedAt = Date.now();
      const state = await readSessionState();
      const result = await stopSessionDaemon();
      output(result, args.json, {
        command_summary: 'session stop',
        solution_name: state?.solution_name || solutionName,
        mode: state?.mode || args.mode || 'full',
        run_id: state?.run_id || '-',
        elapsed_ms: Date.now() - startedAt,
      }, outputOptions);
      return;
    }

    throw new Error('Usage: session <start|status|refresh|stop> [--solution <name>] [--mode <mode>]');
  }

  if (command === 'index') {
    const startedAt = Date.now();
    const ensured = await ensureSession({ mainScriptPath, solutionName });
    const session = ensured.session;
    const result = await rpcCall('refresh', { mode: args.mode || 'full' });
    output(result, args.json, {
      command_summary: `index refresh (${args.mode || 'full'})`,
      solution_name: result.solution_name || session.solution_name || solutionName,
      mode: result.mode || args.mode || session.mode || 'full',
      run_id: result.run_id || session.run_id || '-',
      elapsed_ms: Date.now() - startedAt,
    }, outputOptions);
    return;
  }

  if (command === 'search') {
    const startedAt = Date.now();
    const query = args.positionals.join(' ').trim();
    if (!query) {
      throw new Error('Usage: search "<query>" [--limit <n>] [--source <scripts|docs|xml|all>]');
    }
    const ensured = await ensureSession({ mainScriptPath, solutionName });
    const session = ensured.session;
    const result = await rpcCall('search', {
      query,
      limit: args.limit,
      source: args.source,
    });
    if (!args.json && !args.quiet && ensured.initialized) {
      console.log('Session initialized.');
    }
    output(result, args.json, {
      command_summary: `search "${query}"`,
      solution_name: session.solution_name || solutionName,
      mode: session.mode || 'full',
      run_id: session.run_id || '-',
      elapsed_ms: Date.now() - startedAt,
    }, outputOptions);
    return;
  }

  if (command === 'script-explain' || command === 'script-where-used' || command === 'script-calls') {
    const startedAt = Date.now();
    const target = args.positionals.join(' ').trim();
    if (!target) {
      throw new Error(`Usage: ${command} "<script id|name>"`);
    }
    const ensured = await ensureSession({ mainScriptPath, solutionName });
    const session = ensured.session;
    const result = await rpcCall(command, { target });
    if (!args.json && !args.quiet && ensured.initialized) {
      console.log('Session initialized.');
    }
    output(result, args.json, {
      command_summary: `${command} "${target}"`,
      solution_name: session.solution_name || solutionName,
      mode: session.mode || 'scripts',
      run_id: session.run_id || '-',
      elapsed_ms: Date.now() - startedAt,
    }, outputOptions);
    return;
  }

  if (command === 'sql') {
    const startedAt = Date.now();
    const query = args.positionals.join(' ').trim();
    if (!query) {
      throw new Error('Usage: sql "<query>"');
    }
    const ensured = await ensureSession({ mainScriptPath, solutionName });
    const session = ensured.session;
    const result = await rpcCall('sql', { query });
    if (!args.json && !args.quiet && ensured.initialized) {
      console.log('Session initialized.');
    }
    output(result, args.json, {
      command_summary: 'sql query',
      solution_name: session.solution_name || solutionName,
      mode: session.mode || 'full',
      run_id: session.run_id || '-',
      elapsed_ms: Date.now() - startedAt,
    }, outputOptions);
    return;
  }

  throw new Error(
    'Usage: main.mjs <session|index|search|script-explain|script-where-used|script-calls|sql> [args]'
  );
}

run().catch((error) => {
  console.error(`duckdb-cli error: ${String(error?.message ?? error)}`);
  process.exitCode = 1;
});
