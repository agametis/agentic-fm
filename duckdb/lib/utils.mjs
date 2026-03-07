import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

function jsonReplacer(_key, value) {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

export function safeJsonStringify(value, space = 0) {
  return JSON.stringify(value, jsonReplacer, space);
}

export function nowIso() {
  return new Date().toISOString();
}

export function newRunId() {
  return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function readJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${safeJsonStringify(value, 2)}\n`, 'utf8');
}

export async function appendJsonl(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.appendFile(filePath, `${safeJsonStringify(value)}\n`, 'utf8');
}

export async function pruneJsonl(filePath, keepLast) {
  if (!Number.isInteger(keepLast) || keepLast <= 0) {
    return;
  }

  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  const lines = raw.split('\n').filter(Boolean);
  if (lines.length <= keepLast) {
    return;
  }

  const kept = lines.slice(lines.length - keepLast).join('\n');
  await fs.writeFile(filePath, `${kept}\n`, 'utf8');
}

export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function sqlStringLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function tokenizeQuery(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]+/gi, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export async function withTimeout(promise, timeoutMs, message) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeout);
  }
}
