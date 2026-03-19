# Gradual Implementation Plan

How to execute the agentic-fm build phases using a sequential, confidence-building approach. Each phase validates the workflow before the next scales up.

---

## Dependency graph

```
   Phase 1 (Multi-Script) ← proof-of-concept ✅ merged
        │
   Phase 2 (Script Tooling)
        │
   Phase 3a (Layout) ──┐
                        ├── parallel pair
   Phase 3b (OData)  ──┘
        │
   Phase 4 (Data Tooling) ← depends on Phase 3b
```

---

## Execution approach

The original plan called for 5 agents running in parallel from day one. This revision takes a gradual approach:

1. **Prove the workflow** with a single low-risk phase (Phase 1) ✅
2. **Expand incrementally** — one phase at a time, then a parallel pair
3. **Defer ambitious orchestration** — solution-level and migration skills are future potential
4. **Validate continuously** — `validate_snippet.py` gates every build; FM paste-testing confirms final output

This reduces coordination overhead, surfaces process issues early, and builds confidence before scaling up.

---

## Prerequisites

These must be in place before Phase 1 begins.

### 1. `plans/SKILL_INTERFACES.md` is final

Every agent reads this before authoring any skill that calls or is called by another skill. The interface contracts (inputs, outputs, calls, called-by) define the seams between skills.

### 3. Deployment module built ✅ Done

`agent/scripts/deploy.py` — CLI + importable module. Dispatches fmxmlsnippet output through the appropriate automation tier:

- **Tier 1** (universal): companion `/clipboard` loads clipboard via `clipboard.py`, returns paste instructions
- **Tier 2** (MBS + AppleScript, macOS): two-phase — Phase 1: FM opens target script tab via `MBS("ScriptWorkspace.OpenScript")` (the only MBS function used); Phase 2: companion fires AppleScript from outside FM to AXPress tab + paste via System Events keystrokes
- **Tier 3** (AppleScript only, macOS): single monolithic AppleScript creates, renames, and pastes into a new script — no MBS required

The module reads the developer's opt-in preference from `agent/config/automation.json`. Every skill calls it after validation; no skill hardcodes a deployment tier. See `plans/DEPLOYMENT_STATUS.md` for full status and quirks.

### 4. Shared infrastructure is locked

The following files must not be modified by any agent without coordinator approval:
- `agent/scripts/clipboard.py`
- `agent/scripts/validate_snippet.py`
- `agent/scripts/deploy.py` (deployment module)
- `agent/catalogs/step-catalog-en.json`
- `.claude/CLAUDE.md`
- Companion server endpoints

### 5. Webviewer output channel is wired ✅ Mostly done

Every skill that produces HR output uses this channel. See `plans/WEBVIEWER_STATUS.md` for full status.

**Status**:
- ✅ `POST /webviewer/push` endpoint writes to `.agent-output.json` on companion
- ✅ Webviewer polls `GET /api/agent-output` (Vite endpoint) and renders in Monaco — SSE/WebSocket are unreliable in FM WebKit, so polling is used
- ✅ `automation.json` includes `webviewer_url`
- 🔵 Not yet tested inside FM WebViewer object (works in browser)

### 6. AGFMEvaluation + snapshot infrastructure is in place

Required before `calc-eval` skill can be used. See `PHASES.md` → AGFMEvaluation + Snapshot for scope.

**Done when**:
- `AGFMEvaluation` FM script installed in solution
- Push Context writes `agent/context/snapshot.xml` and includes `snapshot_path` in CONTEXT.json output
- First reference snapshot confirmed present after a Push Context run

### 7. `fm-debug` skill is stable

Phase 2's `script-test` skill depends on it. Confirm the current `fm-debug` implementation is production-ready before Phase 2 starts.

### 8. Target solution XML is current

Phase 3a (XML2 generation) validates against `xml_parsed/` layout exports. Run `solution-export` to ensure these are up to date before Phase 3a begins. The agentic-fm scripts are exported from `agentic-fm.fmp12` (the authoritative source); layout and schema exports come from whatever solution is being developed against.

---

## Execution sequence

### Phase 1 — Multi-Script Scaffold (proof-of-concept) ✅ Merged

Skill built and available at `.claude/skills/multi-script-scaffold/` and `.cursor/skills/multi-script-scaffold/`.

---

### Phase 2 — Script Tooling

**Purpose**: Expand the core script development capabilities with four complementary skills.

**Setup**:
```bash
git worktree add /worktrees/script-tooling -b feature/script-tooling
```

**Agent prompt**:
> You are building the script tooling skills for the agentic-fm project. Your scope is: `script-refactor`, `script-test`, `script-debug`, and `implementation-plan`. Read `plans/VISION.md` (Skills section), `plans/SKILL_INTERFACES.md`, and existing skill files for format reference. `script-test` must use `fm-debug` per the interface spec. Do not modify shared infrastructure files.

**Done when**:
- All four skill files validate via `validate_snippet.py`
- `script-test` companion scripts validate in FM via `fm-debug`
- Branch merged to main

---

### Phase 3 — Layout & OData (parallel pair)

**Purpose**: Two independent workstreams that can run concurrently. This is the first use of parallelism, after the workflow has been proven in Phases 1–2.

**Setup**:
```bash
git worktree add /worktrees/layout-design -b feature/layout-design
git worktree add /worktrees/schema-tooling -b feature/schema-tooling
```

**Agent prompt (3a — Layout & XML2)**:
> You are building the layout skills for the agentic-fm project. Your scope is: `layout-design`, `layout-spec`, and `webviewer-build`. Read `plans/VISION.md` (Layout Objects section and Tooling Infrastructure → Layout Object Reference), `plans/SKILL_INTERFACES.md`, and existing skill files for format reference. Validate XML2 output against `agent/xml_parsed/` layout exports. Do not modify shared infrastructure files.

**Agent prompt (3b — OData Schema)**:
> You are building the schema tooling skills for the agentic-fm project. Your scope is: `schema-plan` and `schema-build` (a single skill covering OData connection, table/field creation, and relationship specification). Read `plans/VISION.md` (API-Managed Schema section), `plans/SKILL_INTERFACES.md`, and existing skill files for format reference. Document OData field type mappings. Do not modify shared infrastructure files.

**Done when**:
- Layout: XML2 objects paste correctly into FM Layout Mode
- OData: Tables and fields created successfully via OData against a live FM Server
- Both branches merged to main

---

### Phase 4 — Data Tooling

**Purpose**: Complete the data lifecycle — seed and migrate records via OData.

**Depends on**: Phase 3b merged (OData connectivity proven).

**Setup**:
```bash
git worktree add /worktrees/data-tooling -b feature/data-tooling
```

**Agent prompt**:
> You are building the data tooling skills for the agentic-fm project. Your scope is: `data-seed` and `data-migrate`. Read `plans/VISION.md` (Skills → Data section), `plans/SKILL_INTERFACES.md`, and existing skill files for format reference. Both skills require OData connectivity — reference the `schema-build` skill for connection patterns. Do not modify shared infrastructure files.

**Done when**:
- Seed data creates realistic records in a live FM solution
- Data migration handles field mapping and type coercion correctly
- Branch merged to main

---

## FM validation

Agents can produce skill files and fmxmlsnippet artifacts autonomously. They cannot validate them in FileMaker. This creates a testing bottleneck.

**Handling it**:
- `validate_snippet.py` is the primary development-time gate — agents don't block on FM validation
- FM validation is batched per phase — paste and verify each artifact as a phase nears completion
- Each agent flags artifacts as ready for FM validation when produced
- The agent continues with non-FM-dependent work (prompt logic, edge cases) rather than blocking

**Validation checklist per skill**:
- [ ] Trigger phrases invoke the skill correctly
- [ ] Generated fmxmlsnippet passes `validate_snippet.py`
- [ ] Clipboard write succeeds without corruption
- [ ] Pasted result appears correctly in the target FM workspace
- [ ] Generated FM objects behave as expected at runtime

---

## Merge sequence

Phases merge in order: 1 → 2 → 3a/3b (either order) → 4.

Each merge includes:
1. Generated XML passes `validate_snippet.py`
2. FM validation checklist complete
3. Skill interfaces match `SKILL_INTERFACES.md` contracts
4. `PHASES.md` status updated (`planned` → `merged`)

---

## Coordinator responsibilities

One human should own:

- Approving any proposed changes to locked shared infrastructure files
- Reviewing and merging PRs in sequence
- Running the FM validation queue and unblocking agents when results are ready
- Updating `plans/PHASES.md` status as work progresses
- Resolving any interface contract disagreements before they diverge
- Conducting a brief retrospective after Phase 1 to adjust process for subsequent phases

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| FM validation bottleneck delays merge | High | Medium | `validate_snippet.py` gates development; FM validation is batched |
| XML2 format assumptions incorrect | Medium | Medium | Phase 3a validates against `xml_parsed/` before finalising |
| OData API behaviour differs from docs | Medium | Medium | Phase 3b documents deviations in `plans/schema/odata-notes.md` |
| `fm-debug` instability blocks Phase 2 | Low | Medium | Confirm fm-debug stability as prerequisite |
| Combined `schema-build` skill too large | Low | Medium | Sub-modes keep concerns separated within one skill file |
