import fs from 'node:fs/promises';
import path from 'node:path';

import { allSql } from './db.mjs';
import { agentRoot, contextRoot } from './paths.mjs';
import { sqlStringLiteral } from './utils.mjs';

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

function sourceRank(sourceGroup) {
  if (sourceGroup === 'scripts_sanitized') return 3;
  if (sourceGroup === 'script_stubs') return 2;
  if (sourceGroup === 'scripts') return 1;
  return 0;
}

function confidenceFromScores(best, second) {
  if (!Number.isFinite(best)) return 0.5;
  if (!Number.isFinite(second)) return 0.95;
  const delta = best - second;
  if (delta >= 40) return 0.95;
  if (delta >= 20) return 0.88;
  if (delta >= 10) return 0.8;
  return 0.7;
}

function usageTypeOrder(value) {
  const order = {
    perform_script_call: 1,
    layout_trigger: 2,
    file_trigger: 3,
    button_action: 4,
    custom_menu_action: 5,
    script_trigger: 6,
    unknown_reference: 7,
  };
  return order[value] ?? 999;
}

function nullableNumber(value) {
  if (value === null || typeof value === 'undefined' || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function readContextIndexFile(solutionName, fileName) {
  const candidates = [];
  if (solutionName) {
    candidates.push(path.join(contextRoot, solutionName, fileName));
  }
  candidates.push(path.join(contextRoot, fileName));

  for (const candidate of candidates) {
    try {
      return await fs.readFile(candidate, "utf8");
    } catch (error) {
      if (!error || error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  return null;
}

async function readCurrentContextHints(solutionName) {
  const hints = {
    currentLayoutName: null,
    currentBaseTo: null,
    currentBaseToId: null,
    currentBaseTable: null,
    currentBaseTableId: null,
    currentBaseTableTOs: [],
  };

  try {
    const raw = await fs.readFile(path.join(agentRoot, "CONTEXT.json"), "utf8");
    const parsed = JSON.parse(raw);
    const layout = parsed?.current_layout ?? {};

    if (layout?.name) hints.currentLayoutName = String(layout.name);
    if (layout?.base_to) hints.currentBaseTo = String(layout.base_to);
    if (layout?.base_to_id) hints.currentBaseToId = Number(layout.base_to_id);
  } catch {
    // Optional context file.
  }

  if (hints.currentLayoutName && hints.currentBaseTo) {
    return hints;
  }

  try {
    const raw = await readContextIndexFile(solutionName, "layouts.index");
    if (!raw) {
      return hints;
    }
    const lines = raw.split(/\r?\n/).filter(Boolean);

    if (!hints.currentLayoutName) {
      return hints;
    }

    for (const line of lines) {
      if (line.startsWith("#")) continue;
      const parts = line.split("|");
      if (parts.length < 4) continue;
      const layoutName = parts[0];
      const baseToName = parts[2];
      const baseToId = Number.parseInt(parts[3], 10);
      if (layoutName === hints.currentLayoutName) {
        if (!hints.currentBaseTo) {
          hints.currentBaseTo = baseToName;
        }
        if (!hints.currentBaseToId && Number.isFinite(baseToId)) {
          hints.currentBaseToId = baseToId;
        }
        break;
      }
    }
  } catch {
    // Optional index file.
  }

  try {
    const raw = await readContextIndexFile(
      solutionName,
      "table_occurrences.index",
    );
    if (!raw) {
      return hints;
    }
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const byName = new Map();
    const byId = new Map();
    const tosByBaseTable = new Map();

    for (const line of lines) {
      if (line.startsWith("#")) continue;
      const parts = line.split("|");
      if (parts.length < 4) continue;
      const toName = String(parts[0] || "").trim();
      const toId = Number.parseInt(parts[1], 10);
      const baseTableName = String(parts[2] || "").trim();
      const baseTableId = Number.parseInt(parts[3], 10);
      if (!toName) continue;

      const entry = {
        toName,
        toId: Number.isFinite(toId) ? toId : null,
        baseTableName: baseTableName || null,
        baseTableId: Number.isFinite(baseTableId) ? baseTableId : null,
      };
      byName.set(normalize(toName), entry);
      if (entry.toId !== null) {
        byId.set(entry.toId, entry);
      }
      if (entry.baseTableName) {
        const baseKey = normalize(entry.baseTableName);
        const set = tosByBaseTable.get(baseKey) || new Set();
        set.add(normalize(toName));
        tosByBaseTable.set(baseKey, set);
      }
    }

    let match = null;
    if (hints.currentBaseTo) {
      match = byName.get(normalize(hints.currentBaseTo)) || null;
    }
    if (!match && Number.isFinite(hints.currentBaseToId)) {
      match = byId.get(Number(hints.currentBaseToId)) || null;
    }

    if (match?.baseTableName) {
      hints.currentBaseTable = match.baseTableName;
      hints.currentBaseTableId = match.baseTableId;
      hints.currentBaseTableTOs = [
        ...(tosByBaseTable.get(normalize(match.baseTableName)) || new Set()),
      ];
    }
  } catch {
    // Optional index file.
  }

  return hints;
}

async function scriptUsageSignals(db, solutionName, scriptIds, contextHints) {
  if (!Array.isArray(scriptIds) || scriptIds.length === 0) {
    return new Map();
  }

  const ids = scriptIds.filter((id) => Number.isFinite(id));
  if (ids.length === 0) {
    return new Map();
  }

  const inList = ids.join(', ');
  const layoutName = normalize(contextHints.currentLayoutName);
  const baseToName = normalize(contextHints.currentBaseTo);
  const toSet = new Set((contextHints.currentBaseTableTOs || []).map((v) => normalize(v)).filter(Boolean));
  if (baseToName) {
    toSet.add(baseToName);
  }
  const toListExpr =
    toSet.size > 0
      ? `lower(container_base_to) IN (${[...toSet].map((v) => sqlStringLiteral(v)).join(', ')})`
      : 'FALSE';

  const rows = await allSql(
    db,
    `
    SELECT
      script_id,
      COUNT(*) AS usage_count,
      MAX(CASE WHEN lower(container_name) = ${sqlStringLiteral(layoutName)} THEN 1 ELSE 0 END) AS on_current_layout,
      MAX(CASE WHEN lower(container_base_to) = ${sqlStringLiteral(baseToName)} THEN 1 ELSE 0 END) AS on_current_base_to,
      MAX(CASE WHEN ${toListExpr} THEN 1 ELSE 0 END) AS on_current_base_table
    FROM script_usages
    WHERE solution_name = ${sqlStringLiteral(solutionName)}
      AND script_id IN (${inList})
    GROUP BY script_id
    `
  );

  return new Map(
    rows.map((row) => [
      Number(row.script_id),
      {
        usageCount: Number(row.usage_count) || 0,
        onCurrentLayout: Number(row.on_current_layout) || 0,
        onCurrentBaseTo: Number(row.on_current_base_to) || 0,
        onCurrentBaseTable: Number(row.on_current_base_table) || 0,
      },
    ])
  );
}

export async function resolveScript({ db, solutionName, target }) {
  const trimmed = String(target ?? '').trim();
  if (!trimmed) {
    throw new Error('Missing script target');
  }

  const scriptId = /^\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : null;

  if (Number.isFinite(scriptId)) {
    const rows = await allSql(
      db,
      `
      SELECT script_id, script_name, source_group, path
      FROM scripts
      WHERE solution_name = ${sqlStringLiteral(solutionName)}
        AND script_id = ${scriptId}
      `
    );

    if (rows.length === 0) {
      return { match: null, alternates: [], context: null };
    }

    const sorted = [...rows].sort((a, b) => sourceRank(b.source_group) - sourceRank(a.source_group));
    const top = sorted[0];

    return {
      match: {
        script_id: Number(top.script_id),
        script_name: String(top.script_name),
        confidence: 1,
      },
      alternates: [],
      context: {
        method: 'id',
      },
    };
  }

  const lower = normalize(trimmed);
  const rows = await allSql(
    db,
    `
    SELECT script_id, MIN(script_name) AS script_name
    FROM scripts
    WHERE solution_name = ${sqlStringLiteral(solutionName)}
      AND lower(script_name) LIKE ${sqlStringLiteral(`%${lower}%`)}
    GROUP BY script_id
    `
  );

  if (rows.length === 0) {
    return { match: null, alternates: [], context: null };
  }

  const contextHints = await readCurrentContextHints(solutionName);
  const usageSignals = await scriptUsageSignals(
    db,
    solutionName,
    rows.map((r) => Number(r.script_id)),
    contextHints
  );

  const scored = rows
    .map((row) => {
      const id = Number(row.script_id);
      const name = String(row.script_name);
      const nameNorm = normalize(name);
      const exact = nameNorm === lower;
      const startsWith = nameNorm.startsWith(lower);
      const contains = nameNorm.includes(lower);
      const signal = usageSignals.get(id) || {
        usageCount: 0,
        onCurrentLayout: 0,
        onCurrentBaseTo: 0,
        onCurrentBaseTable: 0,
      };

      let score = 0;
      if (exact) score += 120;
      else if (startsWith) score += 95;
      else if (contains) score += 75;
      else score += 40;

      score += Math.max(0, 20 - Math.abs(nameNorm.length - lower.length));
      score += signal.onCurrentLayout ? 35 : 0;
      score += signal.onCurrentBaseTo ? 15 : 0;
      score += signal.onCurrentBaseTable ? 10 : 0;
      score += Math.min(20, signal.usageCount);

      return {
        script_id: id,
        script_name: name,
        score,
        signal,
      };
    })
    .sort((a, b) => b.score - a.score || a.script_name.localeCompare(b.script_name));

  const best = scored[0];
  const second = scored[1];
  const confidence = confidenceFromScores(best?.score, second?.score);

  return {
    match: {
      script_id: best.script_id,
      script_name: best.script_name,
      confidence,
    },
    alternates: scored.slice(1, 6).map((row) => ({
      script_id: row.script_id,
      script_name: row.script_name,
      confidence: confidenceFromScores(row.score, best.score),
    })),
    context: {
      method: 'name',
      current_layout: contextHints.currentLayoutName,
      current_base_to: contextHints.currentBaseTo,
      current_base_table: contextHints.currentBaseTable,
      tie_break: {
        on_current_layout: Boolean(best.signal.onCurrentLayout),
        on_current_base_to: Boolean(best.signal.onCurrentBaseTo),
        on_current_base_table: Boolean(best.signal.onCurrentBaseTable),
      },
    },
  };
}

async function getBestScriptText({ db, solutionName, scriptId }) {
  const pathRows = await allSql(
    db,
    `
    SELECT source_group, path
    FROM scripts
    WHERE solution_name = ${sqlStringLiteral(solutionName)}
      AND script_id = ${scriptId}
    `
  );

  const ranked = [...pathRows].sort((a, b) => sourceRank(b.source_group) - sourceRank(a.source_group));
  for (const row of ranked) {
    const docRows = await allSql(
      db,
      `
      SELECT text
      FROM documents
      WHERE solution_name = ${sqlStringLiteral(solutionName)}
        AND path = ${sqlStringLiteral(row.path)}
      LIMIT 1
      `
    );
    if (docRows.length > 0) {
      return { text: String(docRows[0].text), path: String(row.path), source_group: String(row.source_group) };
    }
  }

  return null;
}

async function getScriptSteps({ db, solutionName, scriptId }) {
  const rows = await allSql(
    db,
    `
    SELECT step_index, step_name, raw_step_text, line_no
    FROM script_steps
    WHERE solution_name = ${sqlStringLiteral(solutionName)}
      AND script_id = ${scriptId}
    ORDER BY step_index ASC
    `
  );

  return rows.map((row) => ({
    step_index: Number(row.step_index),
    step_name: String(row.step_name || ''),
    raw_step_text: String(row.raw_step_text || ''),
    line_no: nullableNumber(row.line_no),
  }));
}

export async function scriptExplain({ db, solutionName, target }) {
  const resolved = await resolveScript({ db, solutionName, target });
  if (!resolved.match) {
    return { found: false, reason: 'Script not found', alternates: [] };
  }

  const scriptId = resolved.match.script_id;
  const scriptName = resolved.match.script_name;
  const content = await getBestScriptText({ db, solutionName, scriptId });
  const steps = await getScriptSteps({ db, solutionName, scriptId });

  const calls = await allSql(
    db,
    `
    SELECT callee_script_id, callee_script_name, line_no, confidence
    FROM script_calls
    WHERE solution_name = ${sqlStringLiteral(solutionName)}
      AND caller_script_id = ${scriptId}
    ORDER BY line_no ASC
    `
  );

  const text = content?.text ?? '';
  const lines = text.split(/\r?\n/);
  const preview = steps.length > 0 ? steps.slice(0, 20).map((s) => s.raw_step_text).join('\n').trim() : lines.slice(0, 20).join('\n').trim();

  const controlFlow =
    steps.length > 0
      ? {
          if_count: steps.filter((s) => normalize(s.step_name) === 'if').length,
          loop_count: steps.filter((s) => normalize(s.step_name) === 'loop').length,
          set_variable_count: steps.filter((s) => normalize(s.step_name) === 'set variable').length,
          perform_script_count: steps.filter((s) => normalize(s.step_name) === 'perform script').length,
        }
      : {
          if_count: (text.match(/\bIf\b/gi) ?? []).length,
          loop_count: (text.match(/\bLoop\b/gi) ?? []).length,
          set_variable_count: (text.match(/Set Variable/gi) ?? []).length,
          perform_script_count: (text.match(/Perform Script/gi) ?? []).length,
        };

  return {
    found: true,
    script: {
      id: scriptId,
      name: scriptName,
      confidence: resolved.match.confidence,
      source_path: content?.path ?? null,
      source_group: content?.source_group ?? null,
    },
    context: resolved.context,
    step_count: steps.length,
    control_flow: controlFlow,
    called_scripts: calls.map((row) => ({
      callee_id: nullableNumber(row.callee_script_id),
      callee: String(row.callee_script_name),
      line_no: Number(row.line_no),
      confidence: Number(row.confidence),
    })),
    preview,
    alternates: resolved.alternates,
  };
}

export async function scriptCalls({ db, solutionName, target }) {
  const resolved = await resolveScript({ db, solutionName, target });
  if (!resolved.match) {
    return { found: false, reason: 'Script not found', alternates: [] };
  }

  const calls = await allSql(
    db,
    `
    SELECT callee_script_id, callee_script_name, line_no, confidence
    FROM script_calls
    WHERE solution_name = ${sqlStringLiteral(solutionName)}
      AND caller_script_id = ${resolved.match.script_id}
    ORDER BY line_no ASC
    `
  );

  return {
    found: true,
    script: resolved.match,
    context: resolved.context,
    calls: calls.map((row) => ({
      callee_id: nullableNumber(row.callee_script_id),
      callee: String(row.callee_script_name),
      line_no: Number(row.line_no),
      confidence: Number(row.confidence),
    })),
    alternates: resolved.alternates,
  };
}

export async function scriptWhereUsed({ db, solutionName, target }) {
  const resolved = await resolveScript({ db, solutionName, target });
  if (!resolved.match) {
    return { found: false, reason: 'Script not found', alternates: [] };
  }

  const byId = await allSql(
    db,
    `
    SELECT
      usage_type,
      container_type,
      container_name,
      container_base_to,
      source_file,
      source_object_id,
      trigger_action,
      confidence
    FROM script_usages
    WHERE solution_name = ${sqlStringLiteral(solutionName)}
      AND script_id = ${resolved.match.script_id}
    `
  );

  const byNameFallback = await allSql(
    db,
    `
    SELECT caller_script_id, caller_script_name, source_path, line_no, confidence
    FROM script_calls
    WHERE solution_name = ${sqlStringLiteral(solutionName)}
      AND callee_script_id IS NULL
      AND lower(callee_script_name) = ${sqlStringLiteral(normalize(resolved.match.script_name))}
    ORDER BY caller_script_name ASC, line_no ASC
    `
  );

  const mergedUsages = [
    ...byId.map((row) => ({
      usage_type: String(row.usage_type),
      container_type: String(row.container_type),
      container_name: String(row.container_name || ''),
      container_base_to: String(row.container_base_to || ''),
      source_file: String(row.source_file || ''),
      source_object_id: nullableNumber(row.source_object_id),
      trigger_action: String(row.trigger_action || ''),
      confidence: Number(row.confidence || 0),
    })),
    ...byNameFallback.map((row) => ({
      usage_type: 'perform_script_call',
      container_type: 'script',
      container_name: String(row.caller_script_name),
      container_base_to: '',
      source_file: String(row.source_path),
      source_object_id: Number(row.line_no),
      trigger_action: '',
      confidence: Number(row.confidence),
      caller_script_id: Number(row.caller_script_id),
    })),
  ];

  // Keep a stable unique set so fallback rows do not duplicate id-linked usage rows.
  const usageKey = (row) =>
    [
      row.usage_type,
      row.container_type,
      row.container_name,
      row.container_base_to,
      row.source_file,
      row.source_object_id ?? '',
      row.trigger_action ?? '',
    ].join('|');

  const deduped = [];
  const seen = new Set();
  for (const row of mergedUsages) {
    const key = usageKey(row);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(row);
  }

  const usages = deduped.sort((a, b) => {
    const byType = usageTypeOrder(a.usage_type) - usageTypeOrder(b.usage_type);
    if (byType !== 0) return byType;
    return a.container_name.localeCompare(b.container_name);
  });

  return {
    found: true,
    script: resolved.match,
    context: resolved.context,
    usages,
    alternates: resolved.alternates,
  };
}
