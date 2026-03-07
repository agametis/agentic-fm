import path from "node:path";
import {fileURLToPath} from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Current location: <repo>/duckdb/lib/paths.mjs
export const repoRoot = path.resolve(__dirname, "..", "..");
export const agentRoot = path.join(repoRoot, "agent");
export const contextRoot = path.join(agentRoot, "context");
export const sessionRoot = path.join(repoRoot, "duckdb-session");

export const cacheDbPath = path.join(sessionRoot, "duckdb-cache.duckdb");
export const sessionStatePath = path.join(sessionRoot, "duckdb-session.json");
export const sessionRpcRoot = path.join(sessionRoot, "duckdb-rpc");
export const sessionRpcRequestsDir = path.join(sessionRpcRoot, "requests");
export const sessionRpcResponsesDir = path.join(sessionRpcRoot, "responses");

export const statsPath = path.join(sessionRoot, "duckdb-index-stats.jsonl");
export const errorsPath = path.join(sessionRoot, "duckdb-index-errors.jsonl");

export const sourcePaths = {
  xmlParsed: path.join(agentRoot, "xml_parsed"),
  docsFilemaker: path.join(agentRoot, "docs", "filemaker"),
  docsMbsFunctions: path.join(agentRoot, "docs", "mbs", "functions"),
};

export const noisyMbsBasenames = new Set([
  "all.md",
  "blog-entries.md",
  "client.md",
  "cross.md",
  "dash.md",
  "deprecated.md",
  "filemaker-magazin-functions.md",
  "ios.md",
  "linux.md",
  "mac.md",
  "new.md",
  "old.md",
  "server.md",
  "stat.md",
  "win.md",
]);
