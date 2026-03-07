---
name: mbs-reference-lookup
description: Retrieve MBS function definitions quickly and accurately, preferring DuckDB-indexed component/function pages and excluding noisy generic pages.
---

# MBS Reference Lookup

## Trigger Cues

Use this skill when the user asks for MBS API/reference details, for example:

- "How does `Shell.Execute` work?"
- "What parameters does this MBS function take?"
- "Is this function supported on Server/macOS/Windows?"
- "What does this MBS function return?"

## Must Rules

1. Prefer component/function-specific MBS pages.
2. Exclude generic recurring pages unless explicitly requested.
3. Return practical reference details, not long narrative.
4. Default output must be human-readable.

## Deterministic Workflow

1. Normalize function target:
- Prefer exact function name if provided (for example `Shell.Execute`).
- If only a partial name is provided, search by best keyword set.

2. Query source via DuckDB first:
- Ensure session first:
  - `npm run duckdb:session:status`
  - if needed: `npm run duckdb:session:start`
  - if stale: `npm run duckdb:session:refresh`
- Use DuckDB search first, filtered to MBS docs source.
- Prefer component/function-specific pages.
- Exclude generic recurring pages (`all`, `blog-entries`, platform summary pages, version summary pages).

3. Build answer with:
- Function purpose (short)
- Parameter list and behavior notes
- Return value/format
- Platform or server compatibility caveats
- Direct source file path

4. Handle ambiguity:
- If multiple functions match, return top candidate plus concise alternates.
- Include a short note on why top candidate was chosen.

## Output Contract

- Human-readable by default.
- Keep response practical and exact.
- Avoid long narrative; focus on definition and usage-relevant details.

## Fallback Behavior

If DuckDB retrieval is unavailable:

1. Search under `agent/docs/mbs/functions/` directly.
2. Continue to prefer component/function-specific pages.
3. Keep the same output contract.
