# FileMaker Layout Classification

## Overview

FileMaker layouts serve a number of distinct purposes within a solution. Accurately classifying layouts informs topology analysis, script flow understanding, and overall solution architecture.

## Classification Types

### UI (User Interface)

Layouts the user sees and interacts with. This includes:

- **Navigation layouts**: List/Detail pairs for entity browsing (Events List, Customer Detail)
- **Primary entry points**: The main screens users land on (Invoice Details)
- **Card window layouts**: Dialogs, pickers, tools, and interactive overlays that open as card windows. **These are UI, not utility** — they are integral to the user experience even though they use a different window style.
- **Status layouts**: PIN prompts, error screens, startup splash — shown to the user even if interaction is minimal
- **Device-specific variants**: Desktop vs iPad vs iPhone layouts for the same functionality

**Key insight**: Modern FileMaker development uses card windows extensively as the primary interaction surface. A layout that opens as a card but shows data and accepts user input is UI, not utility.

### Output (Print/PDF)

Layouts designed for rendering to PDF, print, or display-only export:

- **Report PDFs**: Results, statistics, summaries formatted for paper/PDF
- **Cover pages**: PDF title pages

These layouts are typically navigated to by scripts that immediately call Save Records as PDF or Print, then navigate away. The user may never see them on screen. Most output-only layouts have few or no buttons.

### Output/UI (Dual-Purpose)

Some layouts serve both as interactive UI **and** as PDF/print output targets. This is a legitimate dual-purpose classification unique to FileMaker, where the same layout can be displayed on screen for user interaction and also rendered to PDF by a script.

- **Interactive output layouts**: Layouts with buttons for user interaction that are also targets of `Save Records as PDF`. The user works with the layout on screen, and the same layout is used to generate a printable version.
- **Common example**: Tournament bracket layouts — users interact with them to manage matches, and the same layout is exported as a PDF bracket sheet.

**Detection signal**: A layout has output signals (naming or PDF script) AND a **high button count** (`buttons >= 10`). The high threshold is important — output layouts commonly have a small number of buttons (2-7) that serve as developer-assist tools for testing, debugging, or previewing the output. These are not user-facing interaction and should not trigger dual-purpose classification.

Most output layouts in typical solutions are **not** dual-purpose — they are navigated to by script, rendered, and immediately left. The dual-purpose pattern is less common but important to recognize when it occurs.

### Utility

Layouts that exist for implementation mechanics, not user presentation:

- **Blank record layouts**: `Blank *` prefix — used by scripts to create records on a specific TO context, then immediately navigate away. The user never sees these.
- **Data exchange layouts**: JSON export, API, import staging layouts, dedicated Execute Data API use
- **Virtual list/value list layouts**: VLIST, used for scripted value generation
- **Export layouts**: Data export formatting

### Developer

Layouts for developer access to raw table data, not part of the user experience:

- **`@` prefix convention**: `@Customers`, `@Invoices`, etc. — direct access to base table data for debugging, data entry, data preview or development tasks
- Typically one per base table or TO
- Never shown to end users in production

### Unused

Layouts that exist in the solution but are not actively used:

- Deprecated layouts kept for reference
- In-progress layouts not yet wired into navigation
- Legacy layouts from earlier versions

## Classification Signals (for automated detection)

### Universal signals (structural, not convention-dependent)

These signals derive from layout XML content, not from naming conventions. They work regardless of the developer's style.

| Signal                                                      | Classification        | How detected           | Accuracy |
| ----------------------------------------------------------- | --------------------- | ---------------------- | -------- |
| **Button count >= 2** (from layout XML `<Button>` elements) | **UI or Output**      | Parse layout XML       | 97%      |
| **Button count <= 1** + no other signals                    | **Utility/Developer** | Parse layout XML       | 95%      |
| **`Save Records as PDF`** in calling script                 | **Output**            | Grep sanitized scripts | 100%     |
| **`Print Setup`** in calling script                         | **Output**            | Grep sanitized scripts | ~95%     |

### Convention-dependent signals (vary by developer)

These naming patterns were observed in specific solutions and validated against developer ground truth. **Not all developers use these conventions.** The patterns listed here are defaults — they can be overridden per-solution via `agent/config/layout-signals.json` (see below).

| Default Signal               | Classification | Notes                                                                            |
| ---------------------------- | -------------- | -------------------------------------------------------------------------------- |
| `@` prefix                   | Developer      | Common but not universal. Some developers use `DEV_`, `_`, or `#` prefixes       |
| `Blank ` prefix              | Utility        | Some developers use `New `, `Create `, or `_` prefix for record-creation layouts |
| `JSON ` prefix               | Utility        | Data exchange layouts                                                            |
| `* PDF` suffix               | Output         | PDF-targeted layouts                                                             |
| Bracket format names         | Output         | Domain-specific (tournament solutions)                                           |
| `List`/`Detail` suffix pairs | UI             | Common but varies — some use `Browse`/`Form`, `Index`/`Record`, etc.             |

### Layout signal configuration

All convention-dependent signals are defined in `agent/config/layout-signals.json.example`. This file ships with the project and contains the defaults. Developers can copy it to `agent/config/layout-signals.json` to override any signals for their solution.

The `.example` file is always loaded as the baseline. When a `.json` override file exists, its keys replace the corresponding defaults. This means developers only need to specify the keys they want to change.

```bash
# To customize signals for your solution:
cp agent/config/layout-signals.json.example agent/config/layout-signals.json
# Edit layout-signals.json to match your conventions
```

**Available keys** (see `layout-signals.json.example` for current defaults):

| Key | Type | Purpose |
|-----|------|---------|
| `developer_prefixes` | array | Prefixes that mark developer-only layouts |
| `utility_prefixes` | array | Prefixes that mark utility layouts |
| `utility_names` | array | Exact names that are utility layouts |
| `output_suffixes` | array | Suffixes that mark output layouts |
| `output_names` | array | Exact names that are output layouts |
| `output_patterns` | array | Substrings anywhere in the name that indicate output |
| `ignore_names` | array | Layouts to skip entirely |
| `dual_purpose_button_threshold` | number | Button count above which an output layout is classified as output/ui (default: 10) |

The button count signal (`<Button>` elements in layout XML) is always applied regardless of configuration. It serves as the structural fallback when naming signals are ambiguous or absent.

### Button count as a classification signal

The `<Button>` element count in layout XML is a strong indicator of whether a layout is user-facing. This can be extracted by parsing the layout XML and counting `<Button>` elements.

**Validated distribution** (SolutionApp, 150 layouts):

| Classification | Avg Buttons | Has 2+ Buttons | Has 0 Buttons |
| -------------- | ----------- | -------------- | ------------- |
| UI             | 20.7        | 97% (57/59)    | 2% (1/59)     |
| Output         | 25.4        | 93% (28/30)    | 7% (2/30)     |
| Utility        | 1.4         | 0% (0/25)      | 24% (6/25)    |
| Developer      | 0.2         | 12% (4/33)     | 88% (29/33)   |

**Key insight**: The **buttons >= 2** threshold cleanly separates UI/Output from Utility/Developer with zero false positives on the utility side. Utility layouts (Blank dialogs, JSON exports, VLISTs) have at most 1 button. Developer `@` layouts almost always have 0.

**Dual-purpose detection**: When a layout has `buttons >= 2` AND is referenced by a `Save Records as PDF` script, it is likely **output/ui** (dual-purpose). Most output-only layouts have few or no buttons — high button counts on an output layout indicate that it also serves as interactive UI. Pure output layouts (report PDFs, cover pages) typically have 0-3 buttons.

**Decision tree** (applied in order; steps 1-3 use configurable signals from `layout-signals.json` when present, otherwise defaults):

1. Developer prefix match (`@` by default) → **developer**
2. Utility prefix match (`Blank `, `JSON ` by default) → **utility**
3. Output suffix/name match OR `Save Records as PDF` in calling script, AND `buttons >= 10` → **output/ui** (dual-purpose, genuinely interactive)
4. Output suffix/name match OR `Save Records as PDF` in calling script, AND `buttons < 10` → **output** (low button counts are typically developer-assist, not user interaction)
5. `buttons >= 2` → **UI** (always applied, structural signal)
6. `buttons <= 1` → **utility** (fallback)

### Medium-confidence signals (70-90%)

| Signal                          | Classification       | Notes                                                            |
| ------------------------------- | -------------------- | ---------------------------------------------------------------- |
| Opens as card window            | **UI** (not utility) | Common misconception — card windows are user-facing in modern FM |
| In `Output/` folder             | Output               | Folder path in layout XML                                        |
| In `Startup/` folder            | UI                   | Shown to users, even if briefly                                  |
| `Print Setup` in calling script | Output               | Page formatting for print                                        |
| Device suffix (`iPad`/`iPhone`) | UI                   | Device-specific UI variants                                      |
| `List`/`Detail` suffix pairs    | UI                   | Navigation list/detail pattern                                   |

### Low-confidence signals (requires context)

| Signal                        | Depends on...                                   |
| ----------------------------- | ----------------------------------------------- |
| In `Developer/` folder        | Could be utility if not @-prefixed              |
| Single Go to Layout reference | Could be any type                               |
| No script references at all   | Likely unused, but could be triggered by button |

## Impact on Topology Classification

Layout classification provides a critical signal for relationship graph topology analysis:

**UI layout concentration** measures how focused the user experience is on a few entry points vs spread across many:

- **Anchor-buoy solutions** distribute UI layouts evenly across entity TOs — each entity has its own list/detail layouts. The `top_to_pct` (percentage of UI layouts on the most-used TO) is low (< 10%).

- **Tiered-hub solutions** concentrate UI layouts on a dominant entity TO that serves as the primary workspace. `top_to_pct` is high (> 12%). The "single-page app" pattern in FileMaker.

- **Star solutions** concentrate UI on globals/context TOs rather than entity TOs.

**Utility/Developer layouts do not indicate topology** — a solution with 50% developer layouts doesn't have a "utility-driven" topology; those layouts are invisible to the user experience. Only UI layouts should inform topology classification.

## Validation

### Single-solution validation (150 layouts)

The classification system was validated against developer-provided ground truth for one solution using the default naming conventions (`@` prefix for developer, `Blank ` for utility). Results with button count signal enabled:

- **Developer**: 33/33 (100%) — `@` prefix matched perfectly for this solution
- **Output**: 31/30 (one extra due to naming match) — PDF/bracket naming + script detection
- **UI**: 55/59 (93%) — button count >= 2 caught most card window layouts
- **Utility**: 31/25 (absorbs 4 low-button UI layouts + 2 edge cases)

**Ground truth distribution**: 59 UI (39%), 30 Output (20%), 25 Utility (17%), 33 Developer (22%), 3 Unused (2%).

### Important caveats

- These naming conventions (`@`, `Blank `) are **one developer's approach**. Other developers may use entirely different conventions or no consistent naming at all.
- The **button count signal is universal** — it derives from layout XML structure, not naming. It remains reliable regardless of convention.
- For solutions without recognizable naming conventions, the button count becomes the primary classifier, with all convention-dependent signals producing no matches.
- Developers can declare their conventions via `agent/config/layout-signals.json` to improve accuracy for their specific solutions.
