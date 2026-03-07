---
name: repo-data-map
description: Apply the repository data hierarchy correctly so AI chooses the right source for context, IDs, broad text retrieval, and deep XML fallback.
---

# Repo Data Map

## Trigger Cues

Use this skill when the question depends on source-of-truth selection, for example:

- "Where should we look for this information?"
- "Which file has the correct ID mapping?"
- "Why did we use XML instead of context/index?"
- "Use the right context for this script/layout question."

Reference:

- For analysis and compare/check routing, align with `docs/projects/duckdb-search/ai-usage-guide.md`.

## Must Rules

1. Apply the source hierarchy strictly unless the user explicitly overrides it.
2. Prefer scoped context and compact indexes before broad scans.
3. Use DuckDB for broad retrieval, not as last resort.
4. Use raw XML only when higher layers cannot answer.
5. For compare/check/audit tasks across scripts/docs/XML domains, run DuckDB queries first, then use context/index layers for disambiguation.

## Source Hierarchy

Apply this order unless the user explicitly requests otherwise:

1. `agent/CONTEXT.json`
- Task-scoped, layout-scoped truth for current work.

2. `agent/context/*.index`
- Compact solution-wide ID/name/reference lookups.

3. DuckDB index
- Broad, fast retrieval across XML/docs/script text.

4. `agent/xml_parsed` raw files
- Deep fallback when higher layers are insufficient.

Special case for compare/check requests:

1. DuckDB index first (collect evidence fast across all domains).
2. `agent/CONTEXT.json` and `agent/context/*.index` second (ID/context tie-break and mapping).
3. Raw XML fallback only for unresolved gaps.

## Deterministic Rules

1. If the question is task-scoped ("for this layout/current task"), start at `CONTEXT.json`.
2. If the question is exact ID/name mapping, use `agent/context/*.index`.
3. If the question needs broad or cross-domain retrieval, use DuckDB first.
4. If a required fact is still missing, fall back to targeted raw XML reads.
5. If the user asks to compare or verify, produce at least two DuckDB-backed evidence points before using raw XML.

## Script Intelligence Rules

For script logic/relationship questions:

1. Use DuckDB script commands first:
- Ensure DuckDB session first (`duckdb:session:status`, then `duckdb:session:start` if needed, `duckdb:session:refresh` if stale).
- `script-explain`
- `script-where-used`
- `script-calls`

2. Resolve ambiguity context-aware using:
- `agent/CONTEXT.json`
- layout/TO indexes
- source usage links

## Output Contract

- Return human-readable answers by default.
- Mention which source layer(s) were used when it improves clarity.
- Highlight uncertainty explicitly when fallback layers were required.
