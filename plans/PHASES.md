# Build Phases

Tracks the active and planned development phases of the agentic-fm vision. Each phase maps to one or more skills from `VISION.md` and lives in its own git worktree.

## Worktree conventions

- Worktrees are created under `/worktrees/` inside the container, which maps to `./worktrees/agentic-fm/` on the host.
- Branch naming: `feature/{phase-slug}`
- Worktree path: `/worktrees/{phase-slug}`

```bash
# Create a worktree for a phase
git worktree add /worktrees/schema-build feature/schema-build

# List active worktrees
git worktree list

# Remove a worktree after merge
git worktree remove /worktrees/schema-build
```

---

## Phase status legend

| Symbol | Meaning |
|---|---|
| `planned` | Scoped in VISION.md, not yet started |
| `active` | Worktree exists, work in progress |
| `merged` | Branch merged to main, worktree removed |
| `future` | Identified in VISION.md, deferred to a future cycle |

---

## Prerequisites

### Deployment Module (automation tiers) ✅ Done

The pluggable deployment module described in `VISION.md` → Automation Tiers. Cross-cutting infrastructure consumed by every skill that produces fmxmlsnippet output. See `plans/DEPLOYMENT_STATUS.md` for full build status and quirks.

**What was built**:
- `agent/scripts/deploy.py` — CLI + importable module that selects the deployment tier at runtime
- **Tier 1 (universal)**: companion `/clipboard` loads clipboard via `clipboard.py`, returns paste instructions
- **Tier 2 (MBS + AppleScript, two-phase)**: Phase 1 — companion triggers `Agentic-fm Paste` FM script via `osascript do script`, which opens the target script tab via `MBS("ScriptWorkspace.OpenScript")` (the only MBS function used). Phase 2 — companion fires a second `raw_applescript` that AXPresses the tab to focus the step editor, then pastes via System Events keystrokes.
- **Tier 3 (AppleScript only, no MBS)**: companion fires a single monolithic `raw_applescript` that creates a new script, renames it, and pastes steps — all via System Events UI automation
- Developer opt-in via `agent/config/automation.json` (default tier, per-invocation override, auto-save, multi-file targeting)
- Interactive test suite (`agent/scripts/test_deploy.py`) — 9/9 tests passing across all tiers

**Design constraint**: Tier 1 must always work. Tiers 2 and 3 are enhancements — if they fail, the module falls back to Tier 1 and reports what happened. No skill should break because a plugin is missing or Accessibility access is denied.

---

### Webviewer Output Channel

Cross-cutting output infrastructure consumed by every skill that produces HR script output. Must be built alongside the first HR-output skill — retrofitting later requires touching every skill. See `SKILL_INTERFACES.md` → Webviewer output channel for the full interface spec. See `plans/WEBVIEWER_STATUS.md` for build status, what is already built, and the test plan.

**Scope**:
- `automation.json` — add `webviewer_url` field (Vite dev server URL; distinct from process-management endpoints already built)
- **Companion endpoints**:
  - `GET /webviewer/status` — checks whether companion-spawned Vite process is alive (process state, not URL reachability)
  - `POST /webviewer/push` — accepts `{ type, content, before? }`, writes payload to `agent/config/.agent-output.json`
- **Vite API endpoint**: `GET /api/agent-output` — webviewer polls this on ~1s interval; returns payload from `.agent-output.json` or `{ "available": false }`
- **Webviewer**: "Agent output" panel with Monaco editor; polls `/api/agent-output`; diff editor for `type: "diff"` payloads
- **Payload types**: `preview` (HR display), `diff` (before/after Monaco diff editor), `result` (evaluation or structured output)

**Design constraint**: webviewer channel is always additive. Skills must still produce useful terminal output when the webviewer is unavailable. No skill should require the Vite server to be running.

**Done when**:
1. ✅ `automation.json` has `webviewer_url` field
2. ✅ `GET /webviewer/status` returns process state; URL reachability checked directly by skills
3. ✅ `POST /webviewer/push` writes payload to `.agent-output.json`
4. ✅ Webviewer "Agent output" panel displays pushed HR content in Monaco with FileMaker syntax highlighting
5. ✅ `POST /webviewer/push` with `{ "type": "diff", "content": "...", "before": "..." }` opens Monaco diff editor
6. ✅ When Vite is not running, skills detect unavailability and fall back to terminal-only output without error
7. 🔵 End-to-end test inside FM WebViewer object (polling confirmed in browser, untested in FM WebKit)

---

### ~~AGFMEvaluation + Snapshot~~ ✅ Done

FM-side infrastructure for runtime calculation validation and data context capture. See `DEPLOYMENT_STATUS.md` → AGFMEvaluation + Snapshot for full design.

- **`AGFMEvaluation` FM script** — installed in agentic-fm.fmp12. Confirmed working 2026-03-18.
- **Push Context update** — `snapshot_path` and `snapshot_timestamp` in CONTEXT.json, `agent/context/snapshot.xml` written on each Push Context run. Confirmed 2026-03-19.
- **`calc-eval` skill** — deferred; not yet implemented.

---

## Phase 1 — Multi-Script Scaffold

**Status**: `merged`
**Vision ref**: What Makes This Hard → Placeholder Technique; Skills → `multi-script-scaffold`

Skill built and available at `.claude/skills/multi-script-scaffold/` and `.cursor/skills/multi-script-scaffold/`.

**What was delivered**:
- `multi-script-scaffold` skill — guides placeholder creation, captures IDs via Push Context, generates all scripts with correct Perform Script wiring, deploys per tier
- Integrated with `context-refresh` for ID capture
- Integrated with the deployment module across all three tiers
- Webviewer preview output support

---

## Phase 2 — Script Tooling Expansion

**Status**: `planned`
**Branch**: `feature/script-tooling`
**Worktree**: `/worktrees/script-tooling`
**Vision ref**: Skills → `script-refactor`, `script-test`, `script-debug`, `implementation-plan`

**Scope**:
- Complete the `script-refactor` skill
- Complete the `script-test` skill — companion verification script via `fm-debug`
- Complete the `script-debug` skill — systematic reproduce/isolate/fix workflow
- Complete the `implementation-plan` skill — decompose requirements before generation

**Prerequisite**: Confirm `fm-debug` skill is stable before starting `script-test`.

---

## Phase 3 — Layout Design & OData Schema (parallel pair)

Two independent workstreams that can run concurrently once Phases 1–2 have validated the workflow.

### Phase 3a — Layout Design & XML2 Generation

**Status**: `planned`
**Branch**: `feature/layout-design`
**Worktree**: `/worktrees/layout-design`
**Vision ref**: Tooling Infrastructure → Layout Object Reference; Skills → `layout-design`, `layout-spec`, `webviewer-build`

**Scope**:
- Complete the `layout-design` skill — design conversation, XML2 object generation, clipboard load
- Complete the `layout-spec` skill — written blueprint output for manual builds
- Complete the `webviewer-build` skill — full HTML/CSS/JS web viewer app + FM bridge scripts
- Validate XML2 output format against `xml_parsed/` layout exports from a real solution

**Explicitly out of scope**: Layout container creation (permanently manual), responsive design for native FM layouts.

### Phase 3b — OData Schema Tooling

**Status**: `planned`
**Branch**: `feature/schema-tooling`
**Worktree**: `/worktrees/schema-tooling`
**Vision ref**: Tooling Infrastructure → Field Definition and Schema Reference; Skills → `schema-plan`, `schema-build`

**Scope**:
- Complete the `schema-plan` skill — ERD as Mermaid in `plans/schema/`, extended to FM table occurrences
- Complete the `schema-build` skill — a single skill with sub-modes covering OData connection setup, table/field creation via OData REST calls, and relationship specification output as a click-through checklist
- Validate OData field type mappings against live FM Server responses

**Explicitly out of scope**: Relationship creation via API (permanently manual).

**Note**: The original plan had `odata-connect`, `schema-build`, and `relationship-spec` as three separate skills. These are combined into a single `schema-build` skill with sub-modes to reduce interface overhead for what is a single sequential workflow.

---

## Phase 4 — Data Tooling

**Status**: `planned`
**Branch**: `feature/data-tooling`
**Worktree**: `/worktrees/data-tooling`
**Vision ref**: Skills → `data-seed`, `data-migrate`

**Depends on**: Phase 3b (OData Schema Tooling)

**Scope**:
- Complete the `data-seed` skill — realistic seed/test data via OData
- Complete the `data-migrate` skill — external source → FM via OData with field mapping and type coercion

---

## Future Potential

The following phases are identified in `VISION.md` but deferred to a future cycle. They depend on the current phases being complete and stable, and some represent a different product category (migration) that should not compete for attention with core FM development skills.

### Solution-Level Skills

**Status**: `future`
**Vision ref**: Skills → `solution-blueprint`, `solution-audit`, `solution-docs`, `function-create`, `privilege-design`

**Depends on**: All current phases merged and stable.

`solution-blueprint` is the most ambitious skill in the roadmap — it orchestrates multiple sub-skills in sequence. When implemented, it should ship first as a **planning-only skill** that produces a build sequence document and guides the developer through manual invocations of each sub-skill. Full orchestration can follow once all sub-skills are proven stable.

**Scope** (when activated):
- `solution-blueprint` — full ordered build sequence from plain-English description (planning-only v1)
- `solution-audit` — technical debt, naming, anti-pattern analysis
- `solution-docs` — auto-generated documentation from xml_parsed
- `function-create` — custom function generation
- `privilege-design` — privilege sets and account structure

### Web Migration

**Status**: `future`
**Vision ref**: Tooling Infrastructure → Migration Tooling; Skills → `migrate-out`

Migration out of FileMaker is a different product category from core FM development assistance. While there is demand for it, the developers using agentic-fm are primarily building in FileMaker. Deferred until core skills are mature.

**Scope** (when activated):
- `migrate-out` — DDR XML → SQL schema, REST API design, UI component specs
- Build on the `migrate-filemaker` open-source foundation
- Opinionated patterns for React + Supabase and Next.js target stacks

### Native & Inbound Migration

**Status**: `future`
**Vision ref**: Skills → `migrate-native`, `migrate-in`

**Depends on**: Layout Design (Phase 3a) + OData Schema (Phase 3b).

**Scope** (when activated):
- `migrate-native` — FM layout XML → SwiftUI/UIKit Xcode project
- `migrate-in` — SQL DDL / ORM / spreadsheet → FM via OData + clipboard
