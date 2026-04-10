---
name: duckdb-search
description: Use the project DuckDB index as the primary retrieval backend for repository questions, including script logic and script relationship queries.
---

# DuckDB Search

## Trigger Cues

Use this skill when the user asks broad repository or script-intelligence questions, for example:

- "What does script X do?"
- "Where is script X used?"
- "Which scripts call script X?"
- "Find references to Y in XML/docs."
- "Search this project quickly."
- "What is using this layout/script/object?"
- "Compare script A and script B."
- "Check where this logic is used."
- "Validate whether two implementations differ."

Reference:

- Follow `docs/projects/duckdb-search/ai-usage-guide.md` for the DuckDB-first compare/check workflow contract.

## Must Rules

1. DuckDB is the primary retrieval backend for broad repository lookup.
2. Use a long-lived in-memory DuckDB session; do not start a new DB per query.
3. Default output is human-readable.
4. Use script ID over script name whenever an ID is available.
5. If script name resolution is ambiguous, include alternates and confidence context.
6. Use raw `agent/xml_parsed` only as fallback after DuckDB and `agent/context/<solution>/*.index`.
7. For compare/check/audit requests, DuckDB must be the first retrieval layer for evidence collection.

## Deterministic Workflow

1. Classify the request:
- `search` for broad text/reference lookup
- `script-explain` for logic summary
- `script-where-used` for incoming references
- `script-calls` for outgoing script graph
- for compare/check tasks, run a multi-query DuckDB pass (at minimum two relevant queries/commands).

2. Ensure session availability:
- Check active session with `npm run duckdb:session:status`.
- By default, DuckDB uses `agent/CONTEXT.json.solution` when available.
- If no active session exists, start one with `npm run duckdb:session:start`.
- `session:status` reports `stale` / `estimated_changes` for the active solution and mode.
- If staleness is reported, run `npm run duckdb:session:refresh`.
- If you need to switch solutions, stop the current DuckDB session first.
- Do not run full refresh unless needed.

3. Execute query command:
- `npm run duckdb:search -- "<query>"`
- `npm run duckdb:script:explain -- "<script id|name>"`
- `npm run duckdb:script:where-used -- "<script id|name>"`
- `npm run duckdb:script:calls -- "<script id|name>"`

Compare/check pattern:

- Compare script logic:
  - run `script-explain` for each target script
  - run `script-calls` for each target script
  - optionally run `script-where-used` when impact comparison is requested
- Compare references/usage:
  - run `script-where-used` for each target script
  - supplement with `search` for shared terms/objects where needed
- Validate claim ("is X used/defined/called?"):
  - run the most direct DuckDB command first (`script-where-used`, `script-calls`, or `search`)
  - cite DuckDB result evidence in the answer

4. Resolve ambiguity with context in this order:
- Prefer script ID over script name.
- For ambiguous names, apply tie-break using:
  - `agent/CONTEXT.json`
  - `agent/context/<solution>/layouts.index`
  - `agent/context/<solution>/table_occurrences.index`
  - usage links from query results
- If unresolved, return best candidate + alternates + confidence notes.

## Output Contract

- Human-readable by default.
- Include:
  - what was found
  - confidence/ambiguity notes when relevant
  - source paths where it improves traceability
- Use `--json` only for debugging or structured downstream tooling.

## Retrieval Order

1. DuckDB index first (primary).
2. `agent/context/<solution>/*.index` second for exact ID checks.
3. Raw `agent/xml_parsed` fallback only when index/context cannot answer.

## Fallback Behavior

If DuckDB commands are unavailable or fail hard:

1. State that DuckDB retrieval is unavailable.
2. Fall back to `agent/context/<solution>/*.index` and targeted XML/docs search.
3. Return results with a fallback note.
