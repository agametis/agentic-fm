import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { noisyMbsBasenames, sourcePaths } from './paths.mjs';
import { allSql, runSql, saveMemoryToCache } from './db.mjs';
import { appendJsonl, nowIso, pruneJsonl, sqlStringLiteral } from './utils.mjs';

function toUnixPath(filePath) {
  return String(filePath).split(path.sep).join('/');
}

function normalizedProjectPath(filePath) {
  const unix = toUnixPath(filePath);
  return unix.startsWith('/') ? unix : `/${unix}`;
}

function sourceGroupsForMode(mode) {
  if (mode === 'scripts') {
    return new Set(['scripts_sanitized', 'script_stubs', 'scripts', 'xml']);
  }
  if (mode === 'docs') {
    return new Set(['docs_filemaker', 'docs_mbs']);
  }
  if (mode === 'xml') {
    return new Set(['scripts_sanitized', 'script_stubs', 'scripts', 'xml']);
  }
  return new Set(['scripts_sanitized', 'script_stubs', 'scripts', 'docs_filemaker', 'docs_mbs', 'xml']);
}

function isScriptFocusedXmlPath(unixPath) {
  const normalized = normalizedProjectPath(unixPath);
  return (
    normalized.includes('/agent/xml_parsed/scripts_sanitized/') ||
    normalized.includes('/agent/xml_parsed/script_stubs/') ||
    normalized.includes('/agent/xml_parsed/scripts/') ||
    normalized.includes('/agent/xml_parsed/layouts/') ||
    normalized.includes('/agent/xml_parsed/custom_menus/') ||
    normalized.includes('/agent/xml_parsed/custom_menu_sets/') ||
    /\/agent\/xml_parsed\/_\/[^/]+\/metadata\.xml$/i.test(normalized)
  );
}

function classifySourceGroup(filePath) {
  const unixPath = normalizedProjectPath(filePath);

  if (unixPath.includes('/agent/xml_parsed/scripts_sanitized/')) {
    return 'scripts_sanitized';
  }
  if (unixPath.includes('/agent/xml_parsed/script_stubs/')) {
    return 'script_stubs';
  }
  if (unixPath.includes('/agent/xml_parsed/scripts/')) {
    return 'scripts';
  }
  if (unixPath.includes('/agent/docs/filemaker/')) {
    return 'docs_filemaker';
  }
  if (unixPath.includes('/agent/docs/mbs/functions/')) {
    return 'docs_mbs';
  }
  return 'xml';
}

function pathBelongsToMode(sourcePath, mode) {
  const normalizedPath = normalizedProjectPath(sourcePath);
  const sourceGroup = classifySourceGroup(sourcePath);
  if (mode === 'scripts') {
    if (sourceGroup === 'xml') {
      return isScriptFocusedXmlPath(normalizedPath);
    }
    return sourceGroupsForMode(mode).has(sourceGroup);
  }
  return sourceGroupsForMode(mode).has(sourceGroup);
}

async function walkFiles(rootPath, out) {
  let entries;
  try {
    entries = await fs.readdir(rootPath, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    const fullPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(fullPath, out);
      continue;
    }
    if (entry.isFile()) {
      out.push(fullPath);
    }
  }
}

const scriptFocusedXmlDomains = [
  "_",
  "custom_menu_sets",
  "custom_menus",
  "layouts",
  "script_stubs",
  "scripts",
  "scripts_sanitized",
];

const allXmlDomains = [
  "_",
  "accounts",
  "base_directory",
  "custom_function_calcs",
  "custom_function_stubs",
  "custom_functions",
  "custom_menu_sets",
  "custom_menus",
  "extended_privileges",
  "external_data_sources",
  "file_access",
  "layouts",
  "layouts__modify_action",
  "libraries",
  "privilege_sets",
  "relationships",
  "script_stubs",
  "scripts",
  "scripts_sanitized",
  "table_occurrences",
  "table_stubs",
  "tables",
  "tables__modify_action",
  "themes",
  "value_list_stubs",
  "value_lists",
];

async function xmlRootsForMode(mode, solutionName) {
  if (!solutionName) {
    return [sourcePaths.xmlParsed];
  }

  if (mode === "scripts") {
    return scriptFocusedXmlDomains.map((domain) =>
      path.join(sourcePaths.xmlParsed, domain, solutionName),
    );
  }

  // xml mode means all XML domains (no docs); only scripts mode is script-focused.
  // agent/xml_parsed stays domain-first (<domain>/<solution>/...), unlike agent/context.
  return allXmlDomains.map((domain) =>
    path.join(sourcePaths.xmlParsed, domain, solutionName),
  );
}

async function collectCandidateFiles(mode, solutionName) {
  const files = [];

  const wantsXml = mode === "full" || mode === "xml" || mode === "scripts";
  const wantsDocs = mode === "full" || mode === "docs";

  if (wantsXml) {
    const xmlRoots = await xmlRootsForMode(mode, solutionName);
    for (const rootPath of xmlRoots) {
      await walkFiles(rootPath, files);
    }
  }
  if (wantsDocs) {
    await walkFiles(sourcePaths.docsFilemaker, files);
    await walkFiles(sourcePaths.docsMbsFunctions, files);
  }

  return files.filter((filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (![".xml", ".txt", ".md"].includes(ext)) {
      return false;
    }

    const unixPath = normalizedProjectPath(filePath);

    if (mode === "scripts") {
      return isScriptFocusedXmlPath(unixPath);
    }

    if (unixPath.includes("/agent/docs/mbs/functions/")) {
      const base = path.basename(filePath).toLowerCase();
      if (noisyMbsBasenames.has(base) || /^newinversion.*\.md$/i.test(base)) {
        return false;
      }
    }

    return true;
  });
}

function parseScriptFromBasename(filePath) {
  const base = path.basename(filePath);
  const match = base.match(/^(.*) - ID (\d+)\.(txt|xml)$/i);
  if (!match) {
    return null;
  }

  const scriptName = match[1].trim();
  const scriptId = Number.parseInt(match[2], 10);
  if (!Number.isFinite(scriptId)) {
    return null;
  }

  return { scriptId, scriptName };
}

function parseLayoutFromText(text) {
  const layoutMatch = text.match(/<Layout\s+id="(\d+)"\s+name="([^"]+)"/i);
  const tableOccurrenceMatch = text.match(/<TableOccurrenceReference\s+id="(\d+)"\s+name="([^"]+)"/i);

  return {
    layoutId: layoutMatch ? Number.parseInt(layoutMatch[1], 10) : null,
    layoutName: layoutMatch ? layoutMatch[2] : null,
    baseToId: tableOccurrenceMatch ? Number.parseInt(tableOccurrenceMatch[1], 10) : null,
    baseToName: tableOccurrenceMatch ? tableOccurrenceMatch[2] : null,
  };
}

function parseCustomMenuFromText(text) {
  const match = text.match(/<CustomMenu\s+name="([^"]+)"\s+id="(\d+)"/i);
  return {
    menuId: match ? Number.parseInt(match[2], 10) : null,
    menuName: match ? match[1] : null,
  };
}

function parseCustomMenuSetFromText(text) {
  const match = text.match(/<CustomMenuSet\s+name="([^"]+)"\s+id="(\d+)"/i);
  return {
    menuSetId: match ? Number.parseInt(match[2], 10) : null,
    menuSetName: match ? match[1] : null,
  };
}

function lineNoAt(text, index) {
  return text.slice(0, Math.max(0, index)).split(/\r?\n/).length;
}

function unwrapQuotedCalculation(value) {
  const trimmed = String(value || '').trim();
  const quoted = trimmed.match(/^["']([\s\S]*)["']$/);
  return (quoted ? quoted[1] : trimmed).trim();
}

function extractScriptCallsFromText(text) {
  const calls = [];
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!/perform script/i.test(line)) {
      continue;
    }

    const bracketMatch = line.match(/\[(.*)\]/);
    const payload = (bracketMatch ? bracketMatch[1] : line).trim();
    const quoted = payload.match(/["“](.*?)["”]/);
    const calleeScriptName = (quoted ? quoted[1] : payload).trim();

    if (!calleeScriptName) {
      continue;
    }

    calls.push({
      calleeScriptId: null,
      calleeScriptName,
      lineNo: i + 1,
      confidence: quoted ? 0.9 : 0.6,
    });
  }

  return calls;
}

function extractScriptCallsFromXml(text) {
  const calls = [];
  const regex = /<Step[^>]*name="Perform Script"[^>]*>[\s\S]*?<ScriptReference\s+id="(\d+)"\s+name="([^"]*)"/gi;

  let match;
  while ((match = regex.exec(text)) !== null) {
    const calleeScriptId = Number.parseInt(match[1], 10);
    const calleeScriptName = (match[2] || '').trim();
    if (!Number.isFinite(calleeScriptId)) {
      continue;
    }

    calls.push({
      calleeScriptId,
      calleeScriptName,
      lineNo: lineNoAt(text, match.index),
      confidence: 1,
    });
  }

  return calls;
}

function extractScriptStepsFromXml(text) {
  const steps = [];
  const stepRegex = /<Step\b[^>]*?(?:\/>|>[\s\S]*?<\/Step>)/gi;
  let match;
  let order = 0;
  while ((match = stepRegex.exec(text)) !== null) {
    const stepXml = match[0];
    const attrs = stepXml.match(/<Step\b([^>]*)/i)?.[1] ?? '';
    const stepName = (attrs.match(/\bname="([^"]+)"/i)?.[1] ?? '').trim() || 'Unknown Step';
    const lineNo = lineNoAt(text, match.index);

    const flattened = stepXml
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, ' $1 ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const rawStepText = `${stepName}${flattened ? `: ${flattened}` : ''}`.slice(0, 600);
    order += 1;
    steps.push({
      stepIndex: order,
      stepName,
      rawStepText,
      lineNo,
    });
  }
  return steps;
}

function findNearestLayoutObjectId(text, index) {
  const start = Math.max(0, index - 1200);
  const slice = text.slice(start, index);
  const regex = /<LayoutObject[^>]*\sid="(\d+)"[^>]*>/gi;

  let match;
  let last = null;
  while ((match = regex.exec(slice)) !== null) {
    const id = Number.parseInt(match[1], 10);
    if (Number.isFinite(id)) {
      last = id;
    }
  }

  return last;
}

function extractLayoutUsagesFromXml(text) {
  const meta = parseLayoutFromText(text);
  const usages = [];
  const capturedRanges = [];

  const triggerRegex = /<ScriptTrigger[^>]*\sid="(\d+)"[^>]*action="([^"]+)"[^>]*>[\s\S]*?<ScriptReference\s+id="(\d+)"\s+name="([^"]*)"/gi;
  let triggerMatch;
  while ((triggerMatch = triggerRegex.exec(text)) !== null) {
    const triggerId = Number.parseInt(triggerMatch[1], 10);
    const action = (triggerMatch[2] || '').trim();
    const scriptId = Number.parseInt(triggerMatch[3], 10);
    const scriptName = (triggerMatch[4] || '').trim();

    if (!Number.isFinite(scriptId)) {
      continue;
    }

    capturedRanges.push({ start: triggerMatch.index, end: triggerMatch.index + triggerMatch[0].length });

    usages.push({
      scriptId,
      scriptName,
      usageType: action.startsWith('OnLayout') ? 'layout_trigger' : 'script_trigger',
      containerType: 'layout',
      containerName: meta.layoutName,
      containerBaseTo: meta.baseToName,
      containerBaseToId: meta.baseToId,
      sourceObjectId: Number.isFinite(triggerId) ? triggerId : meta.layoutId,
      triggerAction: action,
      confidence: 1,
    });
  }

  const refRegex = /<ScriptReference\s+id="(\d+)"\s+name="([^"]*)"/gi;
  let refMatch;
  while ((refMatch = refRegex.exec(text)) !== null) {
    const idx = refMatch.index;
    const insideTrigger = capturedRanges.some((range) => idx >= range.start && idx <= range.end);
    if (insideTrigger) {
      continue;
    }

    const scriptId = Number.parseInt(refMatch[1], 10);
    const scriptName = (refMatch[2] || '').trim();
    if (!Number.isFinite(scriptId)) {
      continue;
    }

    usages.push({
      scriptId,
      scriptName,
      usageType: 'button_action',
      containerType: 'layout_object',
      containerName: meta.layoutName,
      containerBaseTo: meta.baseToName,
      containerBaseToId: meta.baseToId,
      sourceObjectId: findNearestLayoutObjectId(text, idx) ?? meta.layoutId,
      triggerAction: null,
      confidence: 0.9,
    });
  }

  return usages;
}

function parseCustomMenuItemLabel(itemText, itemIndex) {
  const command = itemText.match(/<Command[^>]*\sname="([^"]+)"/i);
  if (command && command[1]) {
    return command[1].trim();
  }

  const calcName = itemText.match(/<Name>[\s\S]*?<Text><!\[CDATA\[(.*?)\]\]><\/Text>/i);
  if (calcName && calcName[1]) {
    return unwrapQuotedCalculation(calcName[1]);
  }

  const textName = itemText.match(/<Name>[\s\S]*?<Text>(.*?)<\/Text>/i);
  if (textName && textName[1]) {
    return unwrapQuotedCalculation(textName[1]);
  }

  return `Menu item ${itemIndex}`;
}

function extractCustomMenuUsagesFromXml(text) {
  const meta = parseCustomMenuFromText(text);
  const usages = [];
  const itemRegex = /<CustomMenuItem\b[\s\S]*?<\/CustomMenuItem>/gi;
  let itemMatch;
  let itemIndex = 0;

  while ((itemMatch = itemRegex.exec(text)) !== null) {
    itemIndex += 1;
    const itemText = itemMatch[0];
    const itemLabel = parseCustomMenuItemLabel(itemText, itemIndex);
    const scriptRefRegex = /<ScriptReference\s+id="(\d+)"\s+name="([^"]*)"/gi;
    let refMatch;
    while ((refMatch = scriptRefRegex.exec(itemText)) !== null) {
      const scriptId = Number.parseInt(refMatch[1], 10);
      const scriptName = (refMatch[2] || '').trim();
      if (!Number.isFinite(scriptId)) {
        continue;
      }

      usages.push({
        scriptId,
        scriptName,
        usageType: 'custom_menu_action',
        containerType: 'custom_menu',
        containerName: meta.menuName,
        containerBaseTo: null,
        containerBaseToId: null,
        sourceObjectId: itemIndex,
        triggerAction: itemLabel,
        confidence: 1,
      });
    }
  }

  return usages;
}

function extractCustomMenuSetUsagesFromXml(text) {
  const meta = parseCustomMenuSetFromText(text);
  const usages = [];
  const scriptRefRegex = /<ScriptReference\s+id="(\d+)"\s+name="([^"]*)"/gi;
  let refMatch;
  let order = 0;
  while ((refMatch = scriptRefRegex.exec(text)) !== null) {
    const scriptId = Number.parseInt(refMatch[1], 10);
    const scriptName = (refMatch[2] || '').trim();
    if (!Number.isFinite(scriptId)) {
      continue;
    }

    order += 1;
    usages.push({
      scriptId,
      scriptName,
      usageType: 'custom_menu_action',
      containerType: 'custom_menu_set',
      containerName: meta.menuSetName,
      containerBaseTo: null,
      containerBaseToId: null,
      sourceObjectId: Number.isFinite(meta.menuSetId) ? meta.menuSetId : order,
      triggerAction: null,
      confidence: 1,
    });
  }

  return usages;
}

function stripMetadataHeavySections(text) {
  return text.replace(/<IconData[\s\S]*?<\/IconData>/gi, '');
}

function extractFileTriggerUsagesFromMetadataXml(text) {
  const usages = [];
  const trimmedText = stripMetadataHeavySections(text);
  const triggerRegex = /<ScriptTrigger[^>]*\sid="(\d+)"[^>]*action="([^"]+)"[^>]*>[\s\S]*?<ScriptReference\s+id="(\d+)"\s+name="([^"]*)"/gi;
  let match;
  while ((match = triggerRegex.exec(trimmedText)) !== null) {
    const triggerId = Number.parseInt(match[1], 10);
    const action = (match[2] || '').trim();
    const scriptId = Number.parseInt(match[3], 10);
    const scriptName = (match[4] || '').trim();
    if (!Number.isFinite(scriptId)) {
      continue;
    }

    usages.push({
      scriptId,
      scriptName,
      usageType: 'file_trigger',
      containerType: 'file',
      containerName: 'Database File',
      containerBaseTo: null,
      containerBaseToId: null,
      sourceObjectId: Number.isFinite(triggerId) ? triggerId : null,
      triggerAction: action,
      confidence: 1,
    });
  }

  return usages;
}

function docCategoryForGroup(sourceGroup, filePath) {
  if (sourceGroup.startsWith('docs_')) {
    return 'docs';
  }
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.txt') {
    return 'text';
  }
  return 'xml';
}

function selectTitle(filePath, text) {
  const firstLine = text.split(/\r?\n/)[0]?.trim();
  if (firstLine && firstLine.length <= 140) {
    return firstLine;
  }
  return path.basename(filePath, path.extname(filePath));
}

function fileHash(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex');
}

async function insertScriptCall(
  db,
  solutionName,
  callerScriptId,
  callerScriptName,
  sourcePath,
  call,
  indexedAt,
  targetTable = 'script_calls'
) {
  const calleeIdSql = Number.isFinite(call.calleeScriptId) ? String(call.calleeScriptId) : 'NULL';

  await runSql(
    db,
    `
    INSERT INTO ${targetTable}(
      solution_name,
      caller_script_id,
      caller_script_name,
      callee_script_id,
      callee_script_name,
      source_path,
      line_no,
      confidence,
      indexed_at
    )
    VALUES (
      ${sqlStringLiteral(solutionName)},
      ${callerScriptId},
      ${sqlStringLiteral(callerScriptName)},
      ${calleeIdSql},
      ${sqlStringLiteral(call.calleeScriptName || '')},
      ${sqlStringLiteral(sourcePath)},
      ${Number(call.lineNo) || 0},
      ${Number(call.confidence) || 0},
      ${sqlStringLiteral(indexedAt)}
    )
    `
  );
}

async function insertScriptUsage(db, solutionName, usage, sourceFile, indexedAt, targetTable = 'script_usages') {
  const scriptIdSql = Number.isFinite(usage.scriptId) ? String(usage.scriptId) : 'NULL';
  const sourceObjectIdSql = Number.isFinite(usage.sourceObjectId) ? String(usage.sourceObjectId) : 'NULL';
  const baseToIdSql = Number.isFinite(usage.containerBaseToId) ? String(usage.containerBaseToId) : 'NULL';

  await runSql(
    db,
    `
    INSERT INTO ${targetTable}(
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
    )
    VALUES (
      ${sqlStringLiteral(solutionName)},
      ${scriptIdSql},
      ${sqlStringLiteral(usage.scriptName || '')},
      ${sqlStringLiteral(usage.usageType || 'unknown_reference')},
      ${sqlStringLiteral(usage.containerType || 'unknown')},
      ${sqlStringLiteral(usage.containerName || '')},
      ${sqlStringLiteral(usage.containerBaseTo || '')},
      ${baseToIdSql},
      ${sqlStringLiteral(sourceFile)},
      ${sourceObjectIdSql},
      ${sqlStringLiteral(usage.triggerAction || '')},
      ${Number(usage.confidence) || 0},
      ${sqlStringLiteral(indexedAt)}
    )
    `
  );
}

async function insertScriptStep(
  db,
  solutionName,
  scriptId,
  sourcePath,
  step,
  indexedAt,
  targetTable = 'script_steps'
) {
  await runSql(
    db,
    `
    INSERT INTO ${targetTable}(
      solution_name,
      script_id,
      step_index,
      step_name,
      raw_step_text,
      source_path,
      line_no,
      indexed_at
    )
    VALUES (
      ${sqlStringLiteral(solutionName)},
      ${Number(scriptId)},
      ${Number(step.stepIndex) || 0},
      ${sqlStringLiteral(step.stepName || '')},
      ${sqlStringLiteral(step.rawStepText || '')},
      ${sqlStringLiteral(sourcePath)},
      ${Number(step.lineNo) || 0},
      ${sqlStringLiteral(indexedAt)}
    )
    `
  );
}

const stagingTables = {
  paths: '__stg_group_paths',
  sources: '__stg_sources',
  documents: '__stg_documents',
  scripts: '__stg_scripts',
  scriptCalls: '__stg_script_calls',
  scriptSteps: '__stg_script_steps',
  scriptUsages: '__stg_script_usages',
};

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function dropStagingTables(db) {
  for (const table of Object.values(stagingTables)) {
    await runSql(db, `DROP TABLE IF EXISTS ${table}`);
  }
}

async function insertPathsIntoTempTable(db, tableName, paths) {
  const uniquePaths = [...new Set(paths.map((value) => String(value)))];
  if (uniquePaths.length === 0) {
    return;
  }

  for (const chunk of chunkArray(uniquePaths, 200)) {
    const valuesSql = chunk.map((value) => `(${sqlStringLiteral(value)})`).join(', ');
    await runSql(db, `INSERT INTO ${tableName}(path) VALUES ${valuesSql}`);
  }
}

async function prepareGroupStagingTables(db, solutionName, sourceGroup, existingGroupPaths) {
  await dropStagingTables(db);
  await runSql(db, `CREATE TEMP TABLE ${stagingTables.paths}(path VARCHAR)`);
  await insertPathsIntoTempTable(db, stagingTables.paths, existingGroupPaths);

  await runSql(
    db,
    `
    CREATE TEMP TABLE ${stagingTables.sources} AS
    SELECT * FROM sources
    WHERE solution_name = ${sqlStringLiteral(solutionName)}
      AND source_group = ${sqlStringLiteral(sourceGroup)}
    `
  );
  await runSql(
    db,
    `
    CREATE TEMP TABLE ${stagingTables.documents} AS
    SELECT * FROM documents
    WHERE solution_name = ${sqlStringLiteral(solutionName)}
      AND source_group = ${sqlStringLiteral(sourceGroup)}
    `
  );
  await runSql(
    db,
    `
    CREATE TEMP TABLE ${stagingTables.scripts} AS
    SELECT * FROM scripts
    WHERE solution_name = ${sqlStringLiteral(solutionName)}
      AND source_group = ${sqlStringLiteral(sourceGroup)}
    `
  );
  await runSql(
    db,
    `
    CREATE TEMP TABLE ${stagingTables.scriptCalls} AS
    SELECT c.* FROM script_calls c
    JOIN ${stagingTables.paths} p ON p.path = c.source_path
    WHERE c.solution_name = ${sqlStringLiteral(solutionName)}
    `
  );
  await runSql(
    db,
    `
    CREATE TEMP TABLE ${stagingTables.scriptSteps} AS
    SELECT s.* FROM script_steps s
    JOIN ${stagingTables.paths} p ON p.path = s.source_path
    WHERE s.solution_name = ${sqlStringLiteral(solutionName)}
    `
  );
  await runSql(
    db,
    `
    CREATE TEMP TABLE ${stagingTables.scriptUsages} AS
    SELECT u.* FROM script_usages u
    JOIN ${stagingTables.paths} p ON p.path = u.source_file
    WHERE u.solution_name = ${sqlStringLiteral(solutionName)}
    `
  );
}

async function removePathFromStaging(db, solutionName, sourcePath) {
  await runSql(
    db,
    `DELETE FROM ${stagingTables.sources} WHERE solution_name = ${sqlStringLiteral(solutionName)} AND path = ${sqlStringLiteral(sourcePath)}`
  );
  await runSql(
    db,
    `DELETE FROM ${stagingTables.documents} WHERE solution_name = ${sqlStringLiteral(solutionName)} AND path = ${sqlStringLiteral(sourcePath)}`
  );
  await runSql(
    db,
    `DELETE FROM ${stagingTables.scripts} WHERE solution_name = ${sqlStringLiteral(solutionName)} AND path = ${sqlStringLiteral(sourcePath)}`
  );
  await runSql(
    db,
    `DELETE FROM ${stagingTables.scriptCalls} WHERE solution_name = ${sqlStringLiteral(solutionName)} AND source_path = ${sqlStringLiteral(sourcePath)}`
  );
  await runSql(
    db,
    `DELETE FROM ${stagingTables.scriptSteps} WHERE solution_name = ${sqlStringLiteral(solutionName)} AND source_path = ${sqlStringLiteral(sourcePath)}`
  );
  await runSql(
    db,
    `DELETE FROM ${stagingTables.scriptUsages} WHERE solution_name = ${sqlStringLiteral(solutionName)} AND source_file = ${sqlStringLiteral(sourcePath)}`
  );
}

async function commitGroupFromStaging(db, solutionName, sourceGroup) {
  await runSql(db, 'BEGIN TRANSACTION');
  try {
    await runSql(
      db,
      `DELETE FROM sources WHERE solution_name = ${sqlStringLiteral(solutionName)} AND source_group = ${sqlStringLiteral(sourceGroup)}`
    );
    await runSql(db, `INSERT INTO sources SELECT * FROM ${stagingTables.sources}`);

    await runSql(
      db,
      `DELETE FROM documents WHERE solution_name = ${sqlStringLiteral(solutionName)} AND source_group = ${sqlStringLiteral(sourceGroup)}`
    );
    await runSql(db, `INSERT INTO documents SELECT * FROM ${stagingTables.documents}`);

    await runSql(
      db,
      `DELETE FROM scripts WHERE solution_name = ${sqlStringLiteral(solutionName)} AND source_group = ${sqlStringLiteral(sourceGroup)}`
    );
    await runSql(db, `INSERT INTO scripts SELECT * FROM ${stagingTables.scripts}`);

    await runSql(
      db,
      `
      DELETE FROM script_calls
      WHERE solution_name = ${sqlStringLiteral(solutionName)}
        AND source_path IN (SELECT path FROM ${stagingTables.paths})
      `
    );
    await runSql(
      db,
      `
      INSERT INTO script_calls
      SELECT
        solution_name,
        caller_script_id,
        caller_script_name,
        callee_script_id,
        callee_script_name,
        source_path,
        line_no,
        confidence,
        indexed_at
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
        FROM ${stagingTables.scriptCalls}
      ) t
      WHERE rn = 1
      `
    );

    await runSql(
      db,
      `
      DELETE FROM script_steps
      WHERE solution_name = ${sqlStringLiteral(solutionName)}
        AND source_path IN (SELECT path FROM ${stagingTables.paths})
      `
    );
    await runSql(
      db,
      `
      INSERT INTO script_steps
      SELECT
        solution_name,
        script_id,
        step_index,
        step_name,
        raw_step_text,
        source_path,
        line_no,
        indexed_at
      FROM (
        SELECT *,
          ROW_NUMBER() OVER (
            PARTITION BY solution_name, source_path, step_index
            ORDER BY indexed_at DESC NULLS LAST
          ) AS rn
        FROM ${stagingTables.scriptSteps}
      ) t
      WHERE rn = 1
      `
    );

    await runSql(
      db,
      `
      DELETE FROM script_usages
      WHERE solution_name = ${sqlStringLiteral(solutionName)}
        AND source_file IN (SELECT path FROM ${stagingTables.paths})
      `
    );
    await runSql(
      db,
      `
      INSERT INTO script_usages
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
        FROM ${stagingTables.scriptUsages}
      ) t
      WHERE rn = 1
      `
    );

    await runSql(db, 'COMMIT');
  } catch (error) {
    try {
      await runSql(db, 'ROLLBACK');
    } catch {
      // Best effort rollback.
    }
    throw error;
  }
}

export async function detectStaleness(db, solutionName, mode = 'full') {
  const files = await collectCandidateFiles(mode, solutionName);
  const dbRows = await allSql(
    db,
    `SELECT path, size, mtime_ms FROM sources WHERE solution_name = ${sqlStringLiteral(solutionName)}`
  );
  const filteredRows = dbRows.filter((row) => pathBelongsToMode(row.path, mode));
  const dbMap = new Map(filteredRows.map((row) => [String(row.path), row]));

  let changed = 0;
  for (const filePath of files) {
    const rel = path.relative(process.cwd(), filePath);
    const key = rel.startsWith("..") ? filePath : rel;
    const existing = dbMap.get(key);
    if (!existing) {
      changed += 1;
      continue;
    }
    if (
      Number(existing.size) !== Number((await fs.stat(filePath)).size) ||
      Number(existing.mtime_ms) !==
        Math.trunc(Number((await fs.stat(filePath)).mtimeMs))
    ) {
      changed += 1;
    }
  }

  const dbUniqueCount = dbMap.size;
  if (dbUniqueCount !== files.length) {
    changed += Math.abs(dbUniqueCount - files.length);
  }

  return {
    stale: changed > 0,
    estimated_changes: changed,
    files_discovered: files.length,
  };
}

export async function refreshIndex({
  db,
  solutionName,
  mode,
  cachePath,
  statsPath,
  errorsPath,
  runId = null,
  cacheAction = 'none',
  lockWaitMs = 0,
}) {
  const startedAt = Date.now();
  const indexedAt = nowIso();

  const files = await collectCandidateFiles(mode, solutionName);
  const existingRows = await allSql(
    db,
    `SELECT path, hash FROM sources WHERE solution_name = ${sqlStringLiteral(solutionName)}`
  );
  const existingForMode = existingRows.filter((row) => pathBelongsToMode(row.path, mode));
  const filesByGroup = new Map();
  for (const filePath of files) {
    const group = classifySourceGroup(filePath);
    if (!filesByGroup.has(group)) {
      filesByGroup.set(group, []);
    }
    filesByGroup.get(group).push(filePath);
  }

  const existingByGroup = new Map();
  for (const row of existingForMode) {
    const group = classifySourceGroup(String(row.path));
    if (!existingByGroup.has(group)) {
      existingByGroup.set(group, []);
    }
    existingByGroup.get(group).push({
      path: String(row.path),
      hash: String(row.hash),
    });
  }

  const groups = new Set([...filesByGroup.keys(), ...existingByGroup.keys()]);

  let filesChanged = 0;
  let filesSkipped = 0;
  let filesIndexed = 0;
  let fileErrors = 0;
  let filesDeleted = 0;
  const fileTimings = [];
  const errorSamples = [];

  for (const sourceGroup of groups) {
    const groupFiles = filesByGroup.get(sourceGroup) || [];
    const groupExistingRows = existingByGroup.get(sourceGroup) || [];
    const groupExistingMap = new Map(groupExistingRows.map((row) => [row.path, row.hash]));
    const groupExistingPaths = groupExistingRows.map((row) => row.path);
    const seenInGroup = new Set();

    await prepareGroupStagingTables(db, solutionName, sourceGroup, groupExistingPaths);

    try {
      for (const filePath of groupFiles) {
        const rel = path.relative(process.cwd(), filePath);
        const key = rel.startsWith('..') ? filePath : rel;
        seenInGroup.add(key);
        const fileStartedAt = Date.now();

        try {
          const stat = await fs.stat(filePath);
          const buf = await fs.readFile(filePath);
          const hash = fileHash(buf);
          const oldHash = groupExistingMap.get(key);
          if (oldHash && oldHash === hash) {
            filesSkipped += 1;
            continue;
          }

          filesChanged += 1;

          const text = buf.toString('utf8');
          const docId = `${solutionName}:${key}`;
          const title = selectTitle(filePath, text);
          const category = docCategoryForGroup(sourceGroup, filePath);

          await removePathFromStaging(db, solutionName, key);

          await runSql(
            db,
            `
            INSERT INTO ${stagingTables.sources}(solution_name, path, source_group, size, mtime_ms, hash, indexed_at)
            VALUES (
              ${sqlStringLiteral(solutionName)},
              ${sqlStringLiteral(key)},
              ${sqlStringLiteral(sourceGroup)},
              ${Number(stat.size)},
              ${Math.trunc(Number(stat.mtimeMs))},
              ${sqlStringLiteral(hash)},
              ${sqlStringLiteral(indexedAt)}
            )
            `
          );

          await runSql(
            db,
            `
            INSERT INTO ${stagingTables.documents}(solution_name, doc_id, path, source_group, category, title, text, indexed_at)
            VALUES (
              ${sqlStringLiteral(solutionName)},
              ${sqlStringLiteral(docId)},
              ${sqlStringLiteral(key)},
              ${sqlStringLiteral(sourceGroup)},
              ${sqlStringLiteral(category)},
              ${sqlStringLiteral(title)},
              ${sqlStringLiteral(text)},
              ${sqlStringLiteral(indexedAt)}
            )
            `
          );

          const parsedScript = parseScriptFromBasename(filePath);
          if (parsedScript && ['scripts_sanitized', 'script_stubs', 'scripts'].includes(sourceGroup)) {
            const { scriptId, scriptName } = parsedScript;

            await runSql(
              db,
              `
              INSERT INTO ${stagingTables.scripts}(solution_name, script_id, script_name, source_group, path, indexed_at)
              VALUES (
                ${sqlStringLiteral(solutionName)},
                ${scriptId},
                ${sqlStringLiteral(scriptName)},
                ${sqlStringLiteral(sourceGroup)},
                ${sqlStringLiteral(key)},
                ${sqlStringLiteral(indexedAt)}
              )
              `
            );

            if (sourceGroup === 'scripts_sanitized') {
              const calls = extractScriptCallsFromText(text);
              for (const call of calls) {
                await insertScriptCall(
                  db,
                  solutionName,
                  scriptId,
                  scriptName,
                  key,
                  call,
                  indexedAt,
                  stagingTables.scriptCalls
                );
                await insertScriptUsage(
                  db,
                  solutionName,
                  {
                    scriptId: null,
                    scriptName: call.calleeScriptName,
                    usageType: 'unknown_reference',
                    containerType: 'script',
                    containerName: scriptName,
                    sourceObjectId: call.lineNo,
                    triggerAction: null,
                    confidence: Math.max(0.1, Math.min(0.8, Number(call.confidence) || 0.5)),
                  },
                  key,
                  indexedAt,
                  stagingTables.scriptUsages
                );
              }
            }

            if (sourceGroup === 'scripts') {
              const calls = extractScriptCallsFromXml(text);
              const steps = extractScriptStepsFromXml(text);
              let order = 0;
              for (const call of calls) {
                order += 1;
                await insertScriptCall(
                  db,
                  solutionName,
                  scriptId,
                  scriptName,
                  key,
                  call,
                  indexedAt,
                  stagingTables.scriptCalls
                );

                if (Number.isFinite(call.calleeScriptId)) {
                  await insertScriptUsage(
                    db,
                    solutionName,
                    {
                      scriptId: call.calleeScriptId,
                      scriptName: call.calleeScriptName,
                      usageType: 'perform_script_call',
                      containerType: 'script',
                      containerName: scriptName,
                      sourceObjectId: order,
                      triggerAction: null,
                      confidence: call.confidence,
                    },
                    key,
                    indexedAt,
                    stagingTables.scriptUsages
                  );
                }
              }
              for (const step of steps) {
                await insertScriptStep(
                  db,
                  solutionName,
                  scriptId,
                  key,
                  step,
                  indexedAt,
                  stagingTables.scriptSteps
                );
              }
            }
          }

          if (sourceGroup === 'xml') {
            const unixPath = toUnixPath(filePath);

            if (unixPath.includes('/agent/xml_parsed/layouts/')) {
              const layoutUsages = extractLayoutUsagesFromXml(text);
              for (const usage of layoutUsages) {
                await insertScriptUsage(db, solutionName, usage, key, indexedAt, stagingTables.scriptUsages);
              }
            }

            if (unixPath.includes('/agent/xml_parsed/custom_menus/')) {
              const customMenuUsages = extractCustomMenuUsagesFromXml(text);
              for (const usage of customMenuUsages) {
                await insertScriptUsage(db, solutionName, usage, key, indexedAt, stagingTables.scriptUsages);
              }
            }

            if (unixPath.includes('/agent/xml_parsed/custom_menu_sets/')) {
              const menuSetUsages = extractCustomMenuSetUsagesFromXml(text);
              for (const usage of menuSetUsages) {
                await insertScriptUsage(db, solutionName, usage, key, indexedAt, stagingTables.scriptUsages);
              }
            }

            if (/\/agent\/xml_parsed\/_\/[^/]+\/metadata\.xml$/i.test(unixPath)) {
              const fileTriggerUsages = extractFileTriggerUsagesFromMetadataXml(text);
              for (const usage of fileTriggerUsages) {
                await insertScriptUsage(db, solutionName, usage, key, indexedAt, stagingTables.scriptUsages);
              }
            }
          }

          filesIndexed += 1;
          fileTimings.push({
            path: key,
            source_group: sourceGroup,
            duration_ms: Date.now() - fileStartedAt,
          });
        } catch (error) {
          fileErrors += 1;
          const errorMessage = String(error?.message ?? error);
          await appendJsonl(errorsPath, {
            ts: nowIso(),
            run_id: runId,
            solution_name: solutionName,
            mode,
            source_group: sourceGroup,
            path: key,
            parser: 'indexer',
            error: errorMessage,
          });
          if (errorSamples.length < 10) {
            errorSamples.push({
              path: key,
              source_group: sourceGroup,
              parser: 'indexer',
              error: errorMessage.slice(0, 240),
            });
          }
        }
      }

      const deletedPaths = groupExistingPaths.filter((existingPath) => !seenInGroup.has(existingPath));
      filesDeleted += deletedPaths.length;
      for (const deletedPath of deletedPaths) {
        await removePathFromStaging(db, solutionName, deletedPath);
      }

      await commitGroupFromStaging(db, solutionName, sourceGroup);
    } catch (groupError) {
      fileErrors += 1;
      const errorMessage = String(groupError?.message ?? groupError);
      await appendJsonl(errorsPath, {
        ts: nowIso(),
        run_id: runId,
        solution_name: solutionName,
        mode,
        source_group: sourceGroup,
        path: '',
        parser: 'group_commit',
        error: errorMessage,
      });
      if (errorSamples.length < 10) {
        errorSamples.push({
          path: '',
          source_group: sourceGroup,
          parser: 'group_commit',
          error: errorMessage.slice(0, 240),
        });
      }
    } finally {
      await dropStagingTables(db);
    }
  }

  await runSql(db, `DELETE FROM run_meta WHERE key = 'last_refresh'`);
  await runSql(
    db,
    `INSERT INTO run_meta(key, value, updated_at) VALUES ('last_refresh', ${sqlStringLiteral(indexedAt)}, ${sqlStringLiteral(indexedAt)})`
  );

  await saveMemoryToCache(db, cachePath);

  const durationMs = Date.now() - startedAt;
  const status = fileErrors > 0 ? 'completed_with_errors' : 'success';
  const slowestFiles = [...fileTimings]
    .sort((a, b) => Number(b.duration_ms) - Number(a.duration_ms))
    .slice(0, 10);
  const summary = {
    run_id: runId,
    status,
    mode,
    solution_name: solutionName,
    started_at: new Date(startedAt).toISOString(),
    finished_at: nowIso(),
    duration_ms: durationMs,
    files_discovered: files.length,
    files_changed: filesChanged,
    files_skipped: filesSkipped,
    files_indexed: filesIndexed,
    files_deleted: filesDeleted,
    file_errors: fileErrors,
    cache_action: cacheAction,
    lock_wait_ms: Number(lockWaitMs) || 0,
    stats_path: statsPath,
    errors_path: errorsPath,
    slowest_files: slowestFiles,
    error_samples: errorSamples,
  };

  await appendJsonl(statsPath, summary);
  await pruneJsonl(statsPath, 200);
  await pruneJsonl(errorsPath, 5000);

  return summary;
}
