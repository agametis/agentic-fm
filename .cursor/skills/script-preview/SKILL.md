---
name: script-preview
description: Generates a human-readable preview of a proposed FileMaker script before XML generation. Use when the user wants to preview, outline, draft, or review script steps in plain English before committing to fmxmlsnippet output. Triggers on phrases like "preview the script", "show me the steps", "outline the logic", "draft the script", or "before you generate".
---

# Script Preview

Produce a human-readable script outline for review and iteration before generating fmxmlsnippet XML.

## Must Rules

1. Use current context and DuckDB retrieval to ground the preview in existing project logic.
2. Keep preview human-readable and structured like `scripts_sanitized`.
3. Prefer reuse of existing script patterns when related scripts already exist.
4. Do not emit final fmxmlsnippet XML during preview stage.

## Step 1: Read context + related logic

Read `agent/CONTEXT.json` and extract:

- `task`
- `current_layout`
- relevant fields/scripts/layouts/value lists

Then query related logic via DuckDB:

- Ensure session first:
  - `npm run duckdb:session:status`
  - if needed: `npm run duckdb:session:start`
  - if stale: `npm run duckdb:session:refresh`
- `npm run duckdb:search -- "<task keywords>"`
- `npm run duckdb:script:explain -- "<related script name|id>"` when references exist
- `npm run duckdb:script:calls -- "<related script name|id>"` for dependency awareness

## Step 2: Output the preview

Format the script as a numbered, indented step list — the same style as `xml_parsed/scripts_sanitized/`. Rules:

- One step per line, numbered sequentially from `1`
- Nested blocks (If/End If, Loop/End Loop, etc.) are indented with 4 spaces per level
- Show parameters inline: `Set Variable [ $name ; Value: <expression> ]`
- Use plain-English calculations where exact syntax isn't critical yet — the goal is clarity, not precision
- Lead with the script name as a heading

**Example format:**

```
Script: Process Invoice

1. Set Variable [ $invoiceID ; Value: Get ( ScriptParameter ) ]
2. If [ IsEmpty ( $invoiceID ) ]
3.     Show Custom Dialog [ "No invoice ID provided." ]
4.     Exit Script [ False ]
5. End If
6. Go to Layout [ "Invoice Details" (Invoice) ]
7. Perform Find [ invoiceID = $invoiceID ]
8. If [ Get ( FoundCount ) = 0 ]
9.     Show Custom Dialog [ "Invoice not found." ]
10.    Exit Script [ False ]
11. End If
12. Set Field [ Invoice::Status ; "Processed" ]
13. Commit Records [ No dialog ]
14. Exit Script [ True ]
```

## Step 3: Invite iteration

After presenting the preview, ask the user whether to:

1. accept and generate XML,
2. revise logic, or
3. inspect a related existing script first.

If revisions are requested, update the full preview and repeat Step 3.
If accepted, proceed to XML generation workflow.

## Notes

- The preview is a planning artifact — calculations don't need to be exact FileMaker syntax yet
- Line numbers in the preview are for the developer's reference during iteration, not final output
- When iterating, show the full updated preview each time (not just the changed lines)

## Fallback behavior

If DuckDB retrieval is unavailable:

1. Continue using `agent/CONTEXT.json` plus direct file lookup.
2. Prefer `scripts_sanitized` for related logic examples.
3. Note fallback mode briefly if relevant.
