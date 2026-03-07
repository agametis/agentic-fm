---
name: script-lookup
description: Locate a specific FileMaker script in the parsed XML export by script ID or script name, returning the matching `scripts_sanitized` and Save-As-XML paths (and any existing fmxmlsnippet version). Use when the user says "review/refactor/optimize/open/show" a script, mentions "script ID", or asks about a specific script by name.
---

# Script Lookup

Locate a FileMaker script by ID or name, resolving to the paired human-readable and Save-As-XML files. Optimized for minimum tool calls.

Prefer DuckDB-backed resolution when available; fall back to index and file lookups when it is not.

**Performance target**: 4 tool calls for ID-based lookups, 5 for name-based fallback.

## Trigger Cues

Use this skill for script-targeting requests such as:

- "review script X"
- "open script ID 123"
- "show me where script Y is used"
- "find script by name"

## Must Rules

1. DuckDB is the primary lookup backend for script selection and relationship checks.
2. Prefer script ID over script name.
3. If name is ambiguous, use context-aware tie-break and return alternates.
4. Use file-based search only as fallback when DuckDB retrieval is unavailable.

## Primary Sources

- DuckDB commands:
  - `npm run duckdb:script:explain -- "<script id|name>"`
  - `npm run duckdb:script:where-used -- "<script id|name>"`
  - `npm run duckdb:script:calls -- "<script id|name>"`
- File artifacts (for path mapping and editable base):
  - `agent/xml_parsed/scripts_sanitized/`
  - `agent/xml_parsed/scripts/`
  - `agent/scripts/`
  - `agent/sandbox/`

## Deterministic Workflow

1. Extract script target from user request:
- script ID if present
- otherwise script name hint

2. Ensure DuckDB session availability:
- run `npm run duckdb:session:status`.
- if no active session exists, run `npm run duckdb:session:start`.
- if staleness is detected, run `npm run duckdb:session:refresh`.

3. Resolve script via DuckDB first:
- ID match first
- exact normalized name match second
- fuzzy/contains fallback with confidence notes

4. Resolve ambiguity using context:
- `agent/CONTEXT.json`
- `agent/context/layouts.index`
- `agent/context/table_occurrences.index`
- usage/call information from DuckDB results

5. Locate editable/reference files:
- fmxmlsnippet base in `agent/sandbox` or `agent/scripts`
- readable source in `scripts_sanitized`
- Save-As-XML reference in `scripts`

6. Return Script Match Report.

## Script Match Report (Required)

- Selected script:
  - name
  - ID
  - confidence and reason
- Paths:
  - sanitized script path
  - Save-As-XML path
  - fmxmlsnippet base path
- Alternates:
  - top 3–5 candidates when ambiguity exists
- Optional quick excerpt:
  - short logic snippet from `scripts_sanitized` or DuckDB explain output

## Handoff for review/refactor

If user requests review/refactor:

1. Prefer existing fmxmlsnippet file in `agent/sandbox` or `agent/scripts`.
2. If none exists, translate from `agent/xml_parsed/scripts/*.xml` using `agent/scripts/fm_xml_to_snippet.py`.
3. Continue with `script-review` workflow.

## Fallback Behavior

If DuckDB lookup is unavailable:

1. Prefer `agent/context/{solution}/scripts.index` as the file-based lookup source.
2. Search `scripts_sanitized` and `scripts` file paths directly only when the index is unavailable or insufficient.
3. Apply the same ID-first, name-second logic.
4. Return output with a fallback note.
