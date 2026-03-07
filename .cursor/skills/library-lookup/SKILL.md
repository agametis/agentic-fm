---
name: library-lookup
description: Look up and integrate reusable code from the curated snippet library — scripts, step patterns, custom functions, layout objects, and web viewer components. Use when the developer says "use this from the library", "look up the snippet for", "include the library script", "add a timeout loop", or references any library item by name or keyword.
---

# Library Lookup

The library is a curated collection of reusable fmxmlsnippet code.

## Must Rules

1. Use DuckDB-backed retrieval first when library metadata is indexed.
2. Read only matched library files; do not bulk-read the library directory.
3. If manifest is missing/outdated, rebuild it before relying on library matches.
4. Keep output in valid fmxmlsnippet form when returning reusable steps.

## Primary source

- `agent/library/MANIFEST.md` is the canonical library catalog.
- Use DuckDB search for manifest-style lookup if available.

## Deterministic Workflow

1. Ensure library indexability:
- Verify `agent/library/MANIFEST.md` exists.
- If missing or stale, regenerate it before lookup.

2. Find candidates:
- Ensure session first (`npm run duckdb:session:status`, then `npm run duckdb:session:start` if needed, `npm run duckdb:session:refresh` if stale).
- DuckDB first (when available) using task keywords.
- Fallback: direct manifest keyword scan.

3. Read only matched snippet files listed in the manifest.

4. Adapt and integrate:
- Replace placeholder field/table/ID references with values from CONTEXT.json.
- Adjust placeholder variable names to match the current script's conventions.
- Keep structural and purpose comments; remove or update comments that describe the template itself.
- When incorporating a library Script item, extract the inner `<Step>` elements only — do not include the enclosing `<Script>` wrapper unless explicitly requested. Output remains in `<fmxmlsnippet type="FMObjectList">` format.

5. On direct developer reference:
- If the user names a library item, resolve that item first from manifest/index.

## Updating the manifest

Manifest upkeep options:

### Ask AI to regenerate

Ask AI:

> "Scan the `agent/library` folder, compare it against `agent/library/MANIFEST.md`, and update the manifest — adding entries for any new files and removing entries for any deleted files. For new files, read each one to write an accurate description and relevant keyword tags."

AI will list the folder, diff against the current manifest, read any new files, and rewrite `MANIFEST.md` in place.

### Edit manually

Open `agent/library/MANIFEST.md` and add or remove rows directly. Follow the existing column format:

```
| `Category/filename` | One-sentence description of what the code does | keyword1, keyword2, keyword3 |
```

Keep keywords concrete and drawn from how a developer would describe the need — not from the file name itself.

## Fallback behavior

If DuckDB retrieval is unavailable:

1. Use manifest-only lookup.
2. Read only matched files.
3. Return adapted snippets with the same output rules.
