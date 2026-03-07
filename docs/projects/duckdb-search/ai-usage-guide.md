# DuckDB AI Usage Guide

## Purpose

Define the default AI retrieval behavior for this repository so that compare/check/review questions use DuckDB as the primary evidence source.

## Core Rule

- For repository questions, script intelligence, comparisons, and validation checks, query DuckDB first.
- Use `agent/context/*.index` and `agent/CONTEXT.json` for ID mapping and context tie-breaks.
- Use raw `agent/xml_parsed` files only when DuckDB/context cannot answer sufficiently.

## DuckDB-First Commands

- `npm run duckdb:search -- "<query>"`
- `npm run duckdb:script:explain -- "<script id|name>"`
- `npm run duckdb:script:where-used -- "<script id|name>"`
- `npm run duckdb:script:calls -- "<script id|name>"`

Session behavior:

- Ensure session status first: `npm run duckdb:session:status`
- If not running: `npm run duckdb:session:start`
- If stale or data changed: `npm run duckdb:session:refresh`

## Compare/Check Contract

When user intent is compare/check/validate/audit:

1. Run at least two relevant DuckDB queries/commands for evidence.
2. Summarize differences using DuckDB result data.
3. Mention ambiguity and confidence where applicable.
4. Only read raw XML directly for unresolved edge cases.

Examples:

- Compare two scripts:
  - `script:explain` on each script
  - `script:calls` on each script
  - optionally `script:where-used` for impact comparison
- Check if logic is used:
  - `script:where-used` first
  - optional `search` for related references
- Validate if script A calls script B:
  - `script:calls` for A
  - fallback to `search` only if unresolved

## Output Requirements

- Default output should be human-readable.
- Include evidence pointers (script names/IDs, usage types, source paths).
- If fallback to raw files was required, state that clearly.

## Notes

- DuckDB is an indexed copy of repository data for fast retrieval, not user-chat storage.
- Persistent cache is used to speed startup; the active query session runs in memory.
