# DuckDB Integration Plan (Node ESM, No External CLI Dependencies)

## Goal

Use DuckDB as a fast searchable index over project data, with no external DuckDB CLI requirement.

Target searchable sources:

- `agent/xml_parsed` (dynamic)
- `agent/docs/filemaker` (mostly stable)
- `agent/docs/mbs` (mostly stable, noisy generic pages excluded)

Required capability from database content:

- Explain script logic ("what does script X do?")
- Where-used analysis ("where is script X used?")
- Script relationship graph (callers/callees)

Primary usage model:

- AI agents are the primary consumers of the indexed data.
- Skills define when and how AI should query this index.
- Human CLI commands are support/debug interfaces, not the main product goal.

Important boundary:

- The DB stores indexed source content and source-derived relationships only.
- The DB does **not** store user prompts, chat history, or persistent query history.

## Current Findings

- Current fast lookup already exists via `agent/context/*.index` from `fmcontext.sh`.
- Root `package.json` is now present and configured as ESM tooling.
- The MBS docs tree includes many generic pages that should be excluded from ranking/indexing.
- `scripts_sanitized` is high-value for script logic summaries.

## Locked Decisions

- Node.js ESM project at repo root (`"type": "module"`).
- No assumption that `duckdb` CLI is installed.
- DuckDB accessed via Node package/API only.
- In-memory DB is primary runtime mode.
- Minimal script surface (single command entrypoint + internal modules).
- AI-first access model: database value is realized through skill-guided AI retrieval.

## Decision Log (Interactive Review)

### Schema Alignment Update (2026-03-02)

- `script_steps` is in scope for implementation (DB-backed script logic introspection).
- `terms` inverted-token table is deferred in first iteration.
- Text retrieval continues via `documents` ranking until/if `terms` is introduced.

### Section 1: Goal + Boundaries (Locked)

- DuckDB is an internal searchable index over repository source data.
- DB content scope:
  - indexed source text/content
  - source-derived script relationships/usage links
- Explicitly excluded:
  - user prompts
  - chat/session history
  - persistent query history
- Persistent diagnostics are allowed:
  - indexing/error statistics file is permitted.
- Search behavior:
  - if search is called before session start, session startup and initial indexing should run automatically.
- Persistence strategy:
  - persistent cache is allowed and preferred when it improves startup/search responsiveness.

### Section 2: Runtime + Cache Refresh (Locked)

- Cache path:
  - `duckdb-session/duckdb-cache.duckdb`
- Cache purpose:
  - avoid full re-parse on each new session by loading indexed state quickly into memory.
- Refresh policy:
  - automatic lightweight staleness check on query commands.
  - run incremental refresh only when changes are detected or when explicitly requested.
- Corrupt cache handling:
  - auto-rebuild cache
  - notify user that rebuild occurred.
- Change detection policy:
  - use content-hash-based checks, not only mtime/path.
  - rewritten-but-identical files are skipped.
  - added/removed/changed files are reflected incrementally.

### Section 3: Source Coverage + Parsing Depth (Locked)

- Full indexing is required (default behavior), so cross-domain references can be resolved (for example script usage from layouts/objects).
- Partial indexing should also be supported as optional modes.
- MBS recurring/story-like generic pages should be excluded from indexing.
- MBS reference docs should still be indexed in DuckDB for fast repeated retrieval.
- Script explanation strategy:
  - `scripts_sanitized` is primary for human-readable logic summaries.
  - `scripts/*.xml` is primary for structured call/reference extraction.
- Index modes (approved):
  - `full` (default): all configured sources/domains
  - `scripts`: script-focused subset
  - `docs`: FileMaker + MBS docs
  - `xml`: all `xml_parsed` domains

### Section 4: Schema + Output Contracts (Locked)

- Identity scope must always include `solution_name`.
- Storage should be optimized for lower memory footprint.
- Default command output must be human-readable.
- Optional `--json` flag is allowed for debugging/integration use cases.

### Section 5: Ranking + Resolution Logic (Locked)

- Source ranking order is locked as:
  1. `scripts_sanitized`
  2. `script_stubs`
  3. `scripts`
  4. FileMaker docs
  5. MBS docs
  6. other XML domains
- Script names are expected to be unique, but duplicate-name scenarios must be handled context-aware.
- Context-aware disambiguation should leverage existing project context sources:
  - `agent/CONTEXT.json` (current layout + base TO context)
  - `agent/context/layouts.index`
  - `agent/context/table_occurrences.index`
  - source-derived usage links in DB (`script_usages`)
- Confidence thresholds remain at default bands.
- Low-confidence/unresolved edges remain included by default and are explicitly grouped/labeled.

### Section 6: Indexing Pipeline + Failure Handling (Locked)

- Indexing pipeline stages are approved:
  1. discover files by mode (`full`, `scripts`, `docs`, `xml`)
  2. snapshot metadata (`path`, `size`, `mtime`)
  3. run hash-based change detection
  4. parse changed/new files only
  5. write parsed output to staging tables
  6. atomically replace target rows from staging
  7. update cache metadata + diagnostics
  8. serve queries from in-memory DB
- Commit model:
  - commit per source group (`scripts`, `docs`, `xml`) so one failing group does not block successful groups.
- File-level parsing failures:
  - skip failing file
  - log error entry
  - continue run
  - finalize run as `completed_with_errors` when any file errors occurred.
- Cache failure behavior:
  - if cache load fails, auto-rebuild once
  - fail only if rebuild also fails.
- Concurrency policy:
  - concurrent index processes must wait on a lock
  - lock waiting uses timeout to avoid indefinite blocking.
- Diagnostics/run semantics:
  - one run = one memory-load session
  - unloading and reloading memory DB starts a new run id/session
  - diagnostics should be persisted per run.

### Section 7: Command UX + Output Contract (Locked)

- Global flags (all commands):
  - `--solution <name>` (required unless auto-detected)
  - `--json` (optional machine-readable output)
  - `--verbose` (detailed progress)
  - `--quiet` (errors only)
- Session lifecycle defaults:
  - `duckdb:session:start` loads cache into in-memory DB and performs staleness check.
  - `duckdb:session:refresh` runs incremental refresh (`--mode <full|scripts|docs|xml>`, default `full`).
  - `duckdb:session:status` returns health/run metadata.
  - `duckdb:session:stop` cleanly closes the in-memory session.
  - exit code `0` for success and `completed_with_errors`.
  - exit code `1` for hard failure.
- `duckdb:search` defaults:
  - required positional query argument
  - default `--limit 10`
  - optional source filter `--source <scripts|docs|xml|all>` (default `all`)
  - if session is not running, auto-start it first and print initialization notice
  - if staleness is detected, auto-run incremental refresh before query execution
- Script command defaults (`script:explain`, `script:where-used`, `script:calls`):
  - accept script id or script name
  - ambiguous target handling:
    - return best match + alternates section
    - include confidence and context tie-break hints
    - do not hard-fail by default
- Human-readable output contract:
  - header:
    - command summary line
    - solution name + mode
    - run id
  - body:
    - command-specific result content
  - footer:
    - elapsed time
    - indexed/changed/skipped/error counts when relevant

### Section 8: Observability + Diagnostics Retention (Locked)

- Diagnostics files:
  - `duckdb-session/duckdb-index-stats.jsonl` (run-level events)
  - `duckdb-session/duckdb-index-errors.jsonl` (file-level/parsing errors)
- JSONL format:
  - append-only
  - one JSON object per run/event.
- Required run fields:
  - `run_id`, `started_at`, `finished_at`, `duration_ms`
  - `solution_name`, `mode`
  - `status` (`success`, `completed_with_errors`, `failed`)
  - `files_discovered`, `files_changed`, `files_skipped`, `files_indexed`, `file_errors`
  - `cache_action` (`loaded`, `rebuilt`, `created`, `none`)
  - `lock_wait_ms`
- Retention policy (default):
  - keep latest 200 run entries in stats log
  - keep latest 5000 entries in error log
  - older entries are pruned automatically
- Output visibility:
  - every run prints:
    - `run_id`
    - `status`
    - summary counts
    - diagnostics file paths
  - `--verbose` adds:
    - top slowest files
    - parser error samples
- Safety/privacy:
  - do not log full source text/content
  - errors may include only:
    - file path
    - parser/component name
    - short error message.

## Runtime Architecture

### DB Access Mode

- Open DuckDB in-memory (`:memory:`) from Node.
- Load indexed content at session start from persistent cache.
- Keep the in-memory DB alive for repeated queries within the same session.
- Rebuild or incremental update from source files as needed.

### Process Model

First iteration uses one command entrypoint with a session-oriented process model:

- `session start` (boot in-memory DB from cache and prepare metadata)
- `session refresh` (incremental update from sources)
- `session status` (health/run metadata)
- `session stop` (graceful shutdown)
- `search`
- `script-explain`
- `script-where-used`
- `script-calls`
- `sql` (debug only)

Run/session semantics:

- Every in-memory DB load creates a new `run_id`.
- All indexing/search activity within that memory lifespan belongs to that run.
- A fresh memory load starts the next run.
- Query commands must reuse the active session instead of starting a new DB per query.

## Node Tooling Scope (Minimal)

### 1. NPM Scripts

Use a small command set in `package.json`:

- `duckdb:session:start`
- `duckdb:session:status`
- `duckdb:session:refresh`
- `duckdb:session:stop`
- `duckdb:index` (compatibility alias to `session refresh`)
- `duckdb:search`
- `duckdb:script:explain`
- `duckdb:script:where-used`
- `duckdb:script:calls`
- `duckdb:sql`

### 2. Files to Add

Keep implementation compact:

- `duckdb/main.mjs` (single CLI/subcommand entrypoint)
- `duckdb/lib/session.mjs` (session lifecycle and run state)
- `duckdb/lib/lock.mjs` (lock wait/timeout behavior)
- `duckdb/lib/db.mjs`
- `duckdb/lib/indexer.mjs`
- `duckdb/lib/search.mjs`
- `duckdb/lib/script-intel.mjs`

No external CLI tools and no separate daemon binary are required.

## Command UX (Locked)

### Global Flags

- `--solution <name>`
  - required unless auto-detected from indexed XML metadata.
- `--json`
  - returns structured output; default remains human-readable.
- `--verbose`
  - includes progress and diagnostic details in output.
- `--quiet`
  - suppresses non-error informational output.

### Session Commands

Default behavior:

- `duckdb:session:start`
  - boots the in-memory DB from cache and initializes `run_id`.
  - performs staleness check and runs incremental refresh only when needed.
- `duckdb:session:refresh`
  - performs incremental refresh in selected mode.
  - mode selectable with:
    - `--mode <full|scripts|docs|xml>` (default `full`)
- `duckdb:session:status`
  - reports whether a session is active and returns run metadata.
- `duckdb:session:stop`
  - closes the active in-memory session.

Exit behavior:

- exit code `0`:
  - success
  - success with file-level errors (`completed_with_errors`)
- exit code `1`:
  - hard failure where usable index state cannot be produced.

When completed with file-level errors:

- print compact summary
- print diagnostics file path for run details.

### `duckdb:search`

Default behavior:

- requires a positional query argument.
- returns top `10` hits by default.

Optional flags:

- `--limit <n>` (default `10`)
- `--source <scripts|docs|xml|all>` (default `all`)

If no active session is available:

- auto-start session first
- print short "session initialized" notice before results.

If staleness is detected:

- run incremental refresh before query execution.

### Script Commands

Commands:

- `duckdb:script:explain "<script id|name>"`
- `duckdb:script:where-used "<script id|name>"`
- `duckdb:script:calls "<script id|name>"`

Ambiguity handling:

- return best match + alternates section by default
- include confidence and context-based tie-break notes
- avoid hard-failure unless no valid candidates exist.

### Human-Readable Output Layout

Header block:

- command summary
- `solution_name`
- active mode
- `run_id`

Body block:

- command-specific result content.

Footer block:

- elapsed duration
- changed/skipped/error counters (where applicable).

## Schema Scope

### Core Tables

- `sources`:
  - file metadata (`solution_name`, `path`, `source_group`, `mtime`, `size`, `hash`, `indexed_at`)
- `documents`:
  - searchable units (`solution_name`, `doc_id`, `source_group`, `category`, `title`, `text`, `normalized_text`)
- `terms` (deferred):
  - inverted tokens (`solution_name`, `term`, `doc_id`, `weight`)
- `scripts`:
  - script catalog (`solution_name`, `script_id`, `script_name`, `folder_path`, `source_file`)
- `script_steps`:
  - normalized steps (`solution_name`, `script_id`, `step_index`, `step_name`, `raw_step_text`)
- `script_calls`:
  - call edges (`solution_name`, `caller_script_id`, `callee_script_id`, `source_path`, `line_no`, `confidence`)
- `script_usages`:
  - non-call references (`solution_name`, `script_id`, `usage_type`, `container_type`, `container_name`, `source_file`, `source_object_id`, `confidence`)

### Keys, Constraints, and Indexes (Locked)

Primary/unique keys:

- `sources`: unique (`solution_name`, `path`)
- `documents`: unique (`solution_name`, `doc_id`)
- `terms` (deferred): unique (`solution_name`, `term`, `doc_id`)
- `scripts`: unique (`solution_name`, `script_id`, `source_group`)
- `script_steps`: unique (`solution_name`, `source_path`, `step_index`)
- `script_calls`: unique (`solution_name`, `source_path`, `line_no`, `callee_script_id|callee_script_name`, `caller_script_id`)
- `script_usages`: unique (`solution_name`, `usage_type`, `container_type`, `source_file`, `source_object_id`, `script_id|script_name`, `container_name`, `trigger_action`)

Required secondary indexes:

- `documents`: (`solution_name`, `source_group`, `category`)
- `terms`: (`solution_name`, `term`)
- `scripts`: (`solution_name`, `script_name`)
- `script_calls`: (`solution_name`, `callee_script_id`), (`solution_name`, `caller_script_id`)
- `script_usages`: (`solution_name`, `script_id`), (`solution_name`, `usage_type`)

### Storage Optimization Policy (Locked)

- Keep full source text in `documents.text` only.
- Keep `script_steps.raw_step_text` compact (single-line normalized text, no duplicated full XML blobs).
- Do not persist large derived debug payloads in DB tables.
- Avoid duplicate token rows by enforcing table uniqueness.

### `script_usages.usage_type` (Locked)

- `perform_script_call`
- `layout_trigger`
- `file_trigger`
- `button_action`
- `custom_menu_action`
- `script_trigger`
- `unknown_reference`

Resolution rules:

1. Prefer direct script ID links.
2. Fallback to exact case-insensitive name match.
3. Ambiguous name matches remain queryable with lower confidence.
4. Unresolved references are retained as `unknown_reference`.

Confidence bands (default):

- `exact`: `1.00` (ID match)
- `strong`: `>= 0.85` (exact normalized name match)
- `ambiguous`: `0.50 - 0.84`
- `unresolved`: `< 0.50`

Low-confidence handling (default):

- include low-confidence rows in output
- group/label them as `ambiguous` or `unknown_reference`
- optional implementation flag may filter them later, but default output must remain complete

## Source Coverage

- XML dynamic:
  - `agent/xml_parsed/**/*.xml`
  - `agent/xml_parsed/scripts_sanitized/**/*.txt`
  - with targeted parsing from:
    - `script_stubs`
    - `scripts`
    - `scripts_sanitized`
    - trigger-bearing XML where available
- FileMaker docs:
  - `agent/docs/filemaker/**/*.md`
- MBS docs:
  - `agent/docs/mbs/functions/**/*.md`
  - exclude generic noisy basenames:
    - `all.md`, `blog-entries.md`, `client.md`, `cross.md`, `dash.md`, `deprecated.md`,
      `filemaker-magazin-functions.md`, `ios.md`, `linux.md`, `mac.md`, `new.md`,
      `old.md`, `server.md`, `stat.md`, `win.md`, `newinversion*.md`

## Search and Script Intelligence Behavior

### `duckdb:search`

- Tokenize and normalize query.
- Rank by source weight and token coverage.
- Source priority:
  - `scripts_sanitized` > `script_stubs` > `scripts` > FileMaker docs > MBS docs > other XML.
- Output mode:
  - default: human-readable list with score/source/path/snippet
  - optional: `--json` for machine-readable output

### `duckdb:script:explain`

- Resolve target script by ID first, then name.
- If name is ambiguous, resolve using context in this order:
  1. active context from `agent/CONTEXT.json` (layout/base TO)
  2. matching usage containers from `script_usages` (`layout_trigger`, `button_action`, etc.)
  3. layout/TO mappings from `agent/context/*.index`
  4. remaining tie: return top candidate + alternates, marked ambiguous
- Return:
  - purpose (from leading comments when present)
  - major control-flow blocks
  - key data actions
  - called scripts
- Output mode:
  - default: human-readable narrative summary
  - optional: `--json`

### `duckdb:script:where-used`

- Return incoming references grouped by locked `usage_type` order.
- Include `container_type`, `container_name`, `source_file`, `source_object_id`, `confidence`.
- Output mode:
  - default: human-readable grouped sections
  - optional: `--json`

### `duckdb:script:calls`

- Return outgoing call graph.
- Mark unresolved edges explicitly.
- Output mode:
  - default: human-readable graph-style listing
  - optional: `--json`

## Skills Direction

Skills should teach lookup order and DB usage, not duplicate all parser logic:

- `duckdb-search`:
  - DB-first retrieval for broad text/script questions
- `mbs-reference-lookup`:
  - component/function-specific MBS retrieval, noise-aware
- `repo-data-map`:
  - directory semantics and fallback order (`CONTEXT` -> `context/*.index` -> DuckDB -> raw XML)

## AI-First Retrieval Contract (Locked)

1. The intended workflow is:
   - user asks AI a project question
   - AI uses skills to select retrieval strategy
   - AI ensures DuckDB session is active (start/refresh only when needed)
   - AI queries DuckDB index for fast lookup
   - AI returns human-readable answer to user
2. Direct human use of CLI commands is optional and primarily for:
   - debugging
   - validation
   - operational diagnostics
3. Skills must make DuckDB the primary retrieval backend for broad repository questions.
4. Existing context hierarchy remains valid, but with DuckDB integrated as a first-class lookup layer for large text retrieval.

## Documentation Updates

- Update `README.md` with Node-only setup (no external CLI dependency) and command examples.
- Update `ARCHITECTURE.md` with DuckDB in-memory indexing role.
- Keep AI retrieval guidance aligned with `docs/projects/duckdb-search/ai-usage-guide.md`.
- Keep this file as the living implementation reference.

## Observability and Diagnostics (Locked)

### Diagnostics Files

- `duckdb-session/duckdb-index-stats.jsonl`
  - run-level indexing/search diagnostics.
- `duckdb-session/duckdb-index-errors.jsonl`
  - file-level parsing/index errors.

Both files use JSONL:

- one JSON object per line
- append-only writes
- periodic pruning by retention policy.

### Run Event Contract

Each run-level event must include:

- `run_id`
- `started_at`
- `finished_at`
- `duration_ms`
- `solution_name`
- `mode`
- `status` (`success`, `completed_with_errors`, `failed`)
- `files_discovered`
- `files_changed`
- `files_skipped`
- `files_indexed`
- `file_errors`
- `cache_action` (`loaded`, `rebuilt`, `created`, `none`)
- `lock_wait_ms`

### Retention

Default retention limits:

- stats log: latest `200` runs
- error log: latest `5000` error entries.

Pruning behavior:

- automatic after each completed run
- keeps newest entries and drops oldest overflow.

### Runtime Visibility

Standard run output must include:

- run id
- final status
- key counters
- diagnostics file locations.

Verbose mode should additionally include:

- top slowest parsed/indexed files
- representative parser error samples.

### Safety Policy

- Never persist full source content in diagnostics logs.
- Error entries are limited to metadata and concise failure messages.

## Validation Scenarios

1. Fresh indexing loads all configured sources from Node-only runtime.
2. Incremental XML update touches changed files only.
3. `duckdb:search "Shell.Execute"` returns MBS shell references.
4. `duckdb:search "GetTableDDL"` returns FileMaker references.
5. `duckdb:script:explain` returns coherent logic summary.
6. `duckdb:script:where-used` returns grouped usage references.
7. `duckdb:script:calls` returns outgoing graph with unresolved edges flagged.
8. Excluded noisy MBS pages do not dominate top results.
9. All identity-sensitive queries are scoped by `solution_name`.
10. Default outputs are human-readable; `--json` returns structured equivalents.
11. Duplicate script names are resolved using layout/TO context before falling back to ambiguous alternates.
12. Low-confidence rows are still included by default and clearly labeled.
13. Group-level failure does not block successful source groups from committing.
14. Corrupt cache triggers one automatic rebuild attempt before hard failure.
15. Concurrent indexing waits on lock and exits with timeout if lock cannot be acquired in time.
16. Run diagnostics are grouped by memory-load session (`run_id`).
17. `duckdb:search` auto-initializes index when missing and then returns results.
18. Script commands return best-match + alternates for ambiguous names by default.
19. Human-readable output includes standardized header/body/footer layout.
20. Run/error diagnostics are persisted as JSONL with retention pruning.
21. Diagnostics never store full source text.

## Out of Scope (First Iteration)

- Auto-hooking into `fmparse.sh`.
- Embedding/vector search.
