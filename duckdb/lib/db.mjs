import fs from 'node:fs/promises';
import path from 'node:path';
import { fileExists, ensureDir, sqlStringLiteral } from './utils.mjs';
let duckdbModule = null;

async function loadDuckdbModule() {
  if (duckdbModule) {
    return duckdbModule;
  }
  try {
    const imported = await import('duckdb');
    duckdbModule = imported.default ?? imported;
    return duckdbModule;
  } catch (error) {
    const wrapped = new Error(
      "Missing dependency 'duckdb'. Run `npm install` at the repository root to install project packages."
    );
    wrapped.cause = error;
    throw wrapped;
  }
}

function runRaw(db, sql) {
  return new Promise((resolve, reject) => {
    db.run(sql, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function allRaw(db, sql) {
  return new Promise((resolve, reject) => {
    db.all(sql, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows ?? []);
    });
  });
}

export async function openMemoryDb() {
  const duckdb = await loadDuckdbModule();
  const db = new duckdb.Database(':memory:');
  return db;
}

export async function closeDb(db) {
  await new Promise((resolve, reject) => {
    db.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export async function runSql(db, sql) {
  return runRaw(db, sql);
}

export async function allSql(db, sql) {
  return allRaw(db, sql);
}

export async function initSchema(db) {
  const statements = [
    `
    CREATE TABLE IF NOT EXISTS sources (
      solution_name VARCHAR,
      path VARCHAR,
      source_group VARCHAR,
      size BIGINT,
      mtime_ms BIGINT,
      hash VARCHAR,
      indexed_at TIMESTAMP
    )
    `,
    `
    CREATE TABLE IF NOT EXISTS documents (
      solution_name VARCHAR,
      doc_id VARCHAR,
      path VARCHAR,
      source_group VARCHAR,
      category VARCHAR,
      title VARCHAR,
      text VARCHAR,
      indexed_at TIMESTAMP
    )
    `,
    `
    CREATE TABLE IF NOT EXISTS scripts (
      solution_name VARCHAR,
      script_id BIGINT,
      script_name VARCHAR,
      source_group VARCHAR,
      path VARCHAR,
      indexed_at TIMESTAMP
    )
    `,
    `
    CREATE TABLE IF NOT EXISTS script_calls (
      solution_name VARCHAR,
      caller_script_id BIGINT,
      caller_script_name VARCHAR,
      callee_script_id BIGINT,
      callee_script_name VARCHAR,
      source_path VARCHAR,
      line_no BIGINT,
      confidence DOUBLE,
      indexed_at TIMESTAMP
    )
    `,
    `
    CREATE TABLE IF NOT EXISTS script_steps (
      solution_name VARCHAR,
      script_id BIGINT,
      step_index BIGINT,
      step_name VARCHAR,
      raw_step_text VARCHAR,
      source_path VARCHAR,
      line_no BIGINT,
      indexed_at TIMESTAMP
    )
    `,
    `
    CREATE TABLE IF NOT EXISTS script_usages (
      solution_name VARCHAR,
      script_id BIGINT,
      script_name VARCHAR,
      usage_type VARCHAR,
      container_type VARCHAR,
      container_name VARCHAR,
      container_base_to VARCHAR,
      container_base_to_id BIGINT,
      source_file VARCHAR,
      source_object_id BIGINT,
      trigger_action VARCHAR,
      confidence DOUBLE,
      indexed_at TIMESTAMP
    )
    `,
    `
    CREATE TABLE IF NOT EXISTS run_meta (
      key VARCHAR,
      value VARCHAR,
      updated_at TIMESTAMP
    )
    `,
    'ALTER TABLE script_calls ADD COLUMN IF NOT EXISTS callee_script_id BIGINT',
    'ALTER TABLE script_steps ADD COLUMN IF NOT EXISTS line_no BIGINT',
  ];

  for (const sql of statements) {
    await runRaw(db, sql);
  }
}

async function schemaHardeningApplied(db) {
  try {
    const rows = await allRaw(
      db,
      "SELECT value FROM run_meta WHERE key = 'schema_hardening_v1' ORDER BY updated_at DESC LIMIT 1"
    );
    return String(rows?.[0]?.value ?? '') === '1';
  } catch {
    return false;
  }
}

async function dedupeForUniqueKeys(db) {
  const statements = [
    `
    CREATE OR REPLACE TABLE sources AS
    SELECT solution_name, path, source_group, size, mtime_ms, hash, indexed_at
    FROM (
      SELECT *,
        ROW_NUMBER() OVER (
          PARTITION BY solution_name, path
          ORDER BY indexed_at DESC NULLS LAST
        ) AS rn
      FROM sources
    ) t
    WHERE rn = 1
    `,
    `
    CREATE OR REPLACE TABLE documents AS
    SELECT solution_name, doc_id, path, source_group, category, title, text, indexed_at
    FROM (
      SELECT *,
        ROW_NUMBER() OVER (
          PARTITION BY solution_name, doc_id
          ORDER BY indexed_at DESC NULLS LAST
        ) AS rn
      FROM documents
    ) t
    WHERE rn = 1
    `,
    `
    CREATE OR REPLACE TABLE scripts AS
    SELECT solution_name, script_id, script_name, source_group, path, indexed_at
    FROM (
      SELECT *,
        ROW_NUMBER() OVER (
          PARTITION BY solution_name, script_id, source_group
          ORDER BY indexed_at DESC NULLS LAST
        ) AS rn
      FROM scripts
    ) t
    WHERE rn = 1
    `,
    `
    CREATE OR REPLACE TABLE script_calls AS
    SELECT solution_name, caller_script_id, caller_script_name, callee_script_id, callee_script_name, source_path, line_no, confidence, indexed_at
    FROM (
      SELECT *,
        ROW_NUMBER() OVER (
          PARTITION BY
            solution_name,
            source_path,
            line_no,
            COALESCE(callee_script_id, -1),
            lower(COALESCE(callee_script_name, '')),
            COALESCE(caller_script_id, -1)
          ORDER BY indexed_at DESC NULLS LAST
        ) AS rn
      FROM script_calls
    ) t
    WHERE rn = 1
    `,
    `
    CREATE OR REPLACE TABLE script_steps AS
    SELECT solution_name, script_id, step_index, step_name, raw_step_text, source_path, line_no, indexed_at
    FROM (
      SELECT *,
        ROW_NUMBER() OVER (
          PARTITION BY solution_name, source_path, step_index
          ORDER BY indexed_at DESC NULLS LAST
        ) AS rn
      FROM script_steps
    ) t
    WHERE rn = 1
    `,
    `
    CREATE OR REPLACE TABLE script_usages AS
    SELECT
      solution_name,
      script_id,
      script_name,
      usage_type,
      container_type,
      container_name,
      container_base_to,
      container_base_to_id,
      source_file,
      source_object_id,
      trigger_action,
      confidence,
      indexed_at
    FROM (
      SELECT *,
        ROW_NUMBER() OVER (
          PARTITION BY
            solution_name,
            usage_type,
            container_type,
            source_file,
            COALESCE(source_object_id, -1),
            COALESCE(script_id, -1),
            lower(COALESCE(script_name, '')),
            lower(COALESCE(container_name, '')),
            COALESCE(trigger_action, '')
          ORDER BY indexed_at DESC NULLS LAST
        ) AS rn
      FROM script_usages
    ) t
    WHERE rn = 1
    `,
    `
    CREATE OR REPLACE TABLE run_meta AS
    SELECT key, value, updated_at
    FROM (
      SELECT *,
        ROW_NUMBER() OVER (
          PARTITION BY key
          ORDER BY updated_at DESC NULLS LAST
        ) AS rn
      FROM run_meta
    ) t
    WHERE rn = 1
    `,
  ];

  for (const sql of statements) {
    await runRaw(db, sql);
  }
}

async function ensureIndexes(db) {
  const statements = [
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_sources_solution_path ON sources(solution_name, path)',
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_solution_docid ON documents(solution_name, doc_id)',
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_scripts_solution_script_group ON scripts(solution_name, script_id, source_group)',
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_calls_solution_callsite
      ON script_calls(
        solution_name,
        source_path,
        line_no,
        COALESCE(callee_script_id, -1),
        lower(COALESCE(callee_script_name, '')),
        COALESCE(caller_script_id, -1)
      )`,
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_steps_solution_source_step ON script_steps(solution_name, source_path, step_index)',
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_usages_solution_usage
      ON script_usages(
        solution_name,
        usage_type,
        container_type,
        source_file,
        COALESCE(source_object_id, -1),
        COALESCE(script_id, -1),
        lower(COALESCE(script_name, '')),
        lower(COALESCE(container_name, '')),
        COALESCE(trigger_action, '')
      )`,
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_run_meta_key ON run_meta(key)',
    'CREATE INDEX IF NOT EXISTS idx_documents_solution_group ON documents(solution_name, source_group)',
    'CREATE INDEX IF NOT EXISTS idx_documents_solution_title ON documents(solution_name, title)',
    'CREATE INDEX IF NOT EXISTS idx_scripts_solution_id ON scripts(solution_name, script_id)',
    'CREATE INDEX IF NOT EXISTS idx_scripts_solution_name ON scripts(solution_name, script_name)',
    'CREATE INDEX IF NOT EXISTS idx_calls_solution_callee ON script_calls(solution_name, callee_script_name)',
    'CREATE INDEX IF NOT EXISTS idx_calls_solution_caller ON script_calls(solution_name, caller_script_id)',
    'CREATE INDEX IF NOT EXISTS idx_calls_solution_callee_id ON script_calls(solution_name, callee_script_id)',
    'CREATE INDEX IF NOT EXISTS idx_steps_solution_script ON script_steps(solution_name, script_id)',
    'CREATE INDEX IF NOT EXISTS idx_steps_solution_script_order ON script_steps(solution_name, script_id, step_index)',
    'CREATE INDEX IF NOT EXISTS idx_usages_solution_script ON script_usages(solution_name, script_id)',
    'CREATE INDEX IF NOT EXISTS idx_usages_solution_usage_type ON script_usages(solution_name, usage_type)',
    'CREATE INDEX IF NOT EXISTS idx_usages_solution_container ON script_usages(solution_name, container_name)',
  ];
  for (const sql of statements) {
    await runRaw(db, sql);
  }
}

export async function enforceSchemaConstraints(db) {
  const hardened = await schemaHardeningApplied(db);
  if (!hardened) {
    await dedupeForUniqueKeys(db);
    await runRaw(db, "DELETE FROM run_meta WHERE key = 'schema_hardening_v1'");
    await runRaw(
      db,
      "INSERT INTO run_meta(key, value, updated_at) VALUES ('schema_hardening_v1', '1', current_timestamp)"
    );
  }
  await ensureIndexes(db);
}

function knownTables() {
  return ['sources', 'documents', 'scripts', 'script_calls', 'script_steps', 'script_usages', 'run_meta'];
}

export async function loadCacheIntoMemory(db, cachePath) {
  if (!(await fileExists(cachePath))) {
    return { loaded: false };
  }

  const literal = sqlStringLiteral(cachePath);
  await runRaw(db, `ATTACH ${literal} AS cache (READ_ONLY)`);
  try {
    const tableRows = await allRaw(
      db,
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'cache'"
    );
    const available = new Set(tableRows.map((row) => row.table_name));

    for (const table of knownTables()) {
      if (!available.has(table)) {
        continue;
      }
      await runRaw(db, `DELETE FROM main.${table}`);
      await runRaw(db, `INSERT INTO main.${table} SELECT * FROM cache.${table}`);
    }
  } finally {
    await runRaw(db, 'DETACH cache');
  }

  return { loaded: true };
}

export async function saveMemoryToCache(db, cachePath) {
  await ensureDir(path.dirname(cachePath));
  const tmpPath = `${cachePath}.tmp.${process.pid}.${Date.now()}`;

  try {
    await fs.unlink(tmpPath);
  } catch (error) {
    if (!error || error.code !== 'ENOENT') {
      throw error;
    }
  }

  const tmpLiteral = sqlStringLiteral(tmpPath);
  await runRaw(db, `ATTACH ${tmpLiteral} AS cache`);
  try {
    for (const table of knownTables()) {
      await runRaw(db, `CREATE OR REPLACE TABLE cache.${table} AS SELECT * FROM main.${table}`);
    }
  } finally {
    await runRaw(db, 'DETACH cache');
  }

  await fs.rename(tmpPath, cachePath);
}
