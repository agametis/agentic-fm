# fm-debug Skill

Use this skill when a FileMaker script is producing unexpected results, an error dialog, or incorrect behavior that you cannot diagnose from the source code alone. FileMaker script execution is **opaque to the agent** — the agent cannot trigger scripts, observe runtime state, or read FileMaker variables directly. This skill defines the two supported methods for bridging that gap.

---

## How to use this skill

When invoked, do the following in order:

1. **State the diagnosis gap** — identify specifically what runtime information is needed to diagnose the issue (e.g. variable values, exit codes, script result, error number).
2. **Check for an existing debug output file** at `agent/debug/output.json`. If it exists and is recent, read it and skip to step 5.
3. **Choose the appropriate method** based on what's available in the solution (see below).
4. **Give the developer clear run instructions** — the agent cannot execute FileMaker scripts. Tell the developer exactly which script to run and how.
5. **Read and analyze the output** once the developer confirms it's ready.

---

## Method 1: Agentic-fm Debug Script (preferred)

The solution should contain a script named **"Agentic-fm Debug"** (or similar). This script accepts a JSON parameter specifying what to capture, then writes the result to `agent/debug/output.json` so the agent can read it directly — no copy/paste required.

### When to use
- Any time the solution has the Agentic-fm Debug script available
- Preferred because output is machine-readable and the agent reads it directly

### Instructions to give the developer

> To debug this, I need runtime variable state from the script. Please do the following:
>
> 1. Open FileMaker and navigate to the layout where you run this script
> 2. Run the script **"[Script Name]"** as you normally would
> 3. When done, run the script **"Agentic-fm Debug"** with this parameter:
>    ```
>    [JSON parameter you specify]
>    ```
>    (Or the debug script may run automatically as part of the failing script.)
> 4. Let me know when it's done — I'll read `agent/debug/output.json` directly.

### Reading the output

Once the developer confirms the script ran:
```bash
cat agent/debug/output.json
```

---

## Method 2: $$DEBUG Global Variable (fallback)

If the solution does not have an Agentic-fm Debug script, the developer can add a temporary `Set Variable` step in the failing script to collect debug state into a `$$DEBUG` global, then show it via a custom dialog or copy it manually.

### When to use
- Solution does not have the Agentic-fm Debug script
- Quick one-off diagnostic for a simple script

### Instructions to give the developer

> I need to see the runtime variable state. Please:
>
> 1. Temporarily add this step to the script just before the failing condition:
>    ```
>    Set Variable [ $$DEBUG ; JSONSetElement ( "{}" ;
>        [ "varName1" ; $varName1 ; JSONString ] ;
>        [ "varName2" ; $varName2 ; JSONString ] ;
>        [ "exitCode" ; $exitCode ; JSONString ]
>    ) ]
>    ```
>    (Replace with the actual variables you want to inspect.)
> 2. Run the script
> 3. Open the Data Viewer (Tools > Data Viewer) and find `$$DEBUG`, or add a Show Custom Dialog step to display it
> 4. Copy the full JSON value and paste it here

### What to ask for

Be specific about which variables to capture. Common patterns:

- Shell/HTTP calls: `$exitCode`, `$stderr`, `$stdout`, `$response`, `$httpError`
- Script calls: `Get ( ScriptResult )`, `Get ( LastError )`
- Conditional failures: the specific variables involved in the failing `If` condition

---

## After receiving debug output

1. Parse the JSON and identify the root cause
2. Explain the issue clearly to the developer
3. Propose the fix
4. If the Agentic-fm Debug script doesn't exist yet, offer to help create it (see `agent/docs/AGENTIC_DEBUG.md`)
