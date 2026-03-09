# Agentic-fm Debug Script

## Purpose

FileMaker script execution is opaque to the agent — the agent cannot trigger scripts or observe runtime state directly. The **Agentic-fm Debug** script bridges this gap by writing runtime debug output to `agent/debug/output.json`, a file the agent can read directly without the developer needing to copy/paste anything.

## How it works

1. The failing script (or a temporary modification of it) calls **Agentic-fm Debug** via `Perform Script`, passing a JSON payload as the script parameter
2. Agentic-fm Debug sends that payload to the companion server's `/debug` endpoint
3. The companion server writes `agent/debug/output.json`
4. The agent reads the file and analyzes the output

## Script design

The script accepts a single parameter: a JSON object with any keys the calling script wants to expose. It forwards that object to the companion server along with metadata (timestamp, calling script name).

**Script parameter format** (passed by the calling script):
```json
{
  "label": "optional description of where this debug point is",
  "vars": {
    "exitCode": "1",
    "stderr": "",
    "stdout": "...",
    "httpError": "0"
  }
}
```

**Agentic-fm Debug script steps (HR format):**
```
# PURPOSE: Write runtime debug state to agent/debug/output.json for agent inspection.
# Called by other scripts via Perform Script with a JSON parameter.
#
# lastError and lastErrorLocation are captured as the very first step so they
# reflect the caller's error state — any successful Set Variable resets Get(LastError) to 0.

# Capture caller's error state before any other step can clear it
Set Variable [ $errorContext ; JSONSetElement ( "{}" ;
    [ "lastError" ; Get ( LastError ) ; JSONNumber ] ;
    [ "lastErrorLocation" ; Get ( LastErrorLocation ) ; JSONString ]
) ]

Set Variable [ $param ; Get ( ScriptParameter ) ]

Set Variable [ $payload ; JSONSetElement ( "{}" ;
    [ "label" ; JSONGetElement ( $param ; "label" ) ; JSONString ] ;
    [ "vars" ; JSONGetElement ( $param ; "vars" ) ; JSONRaw ] ;
    [ "timestamp" ; Get ( CurrentTimestamp ) ; JSONString ] ;
    [ "lastError" ; JSONGetElement ( $errorContext ; "lastError" ) ; JSONNumber ] ;
    [ "lastErrorLocation" ; JSONGetElement ( $errorContext ; "lastErrorLocation" ) ; JSONString ]
) ]

Insert from URL [ Verify SSL Certificates: OFF ; With dialog: OFF ; Target: $response ;
    "http://127.0.0.1:8765/debug" ;
    "-X POST -H \"Content-Type: application/json\" -d " & Quote ( $payload ) ]

If [ Get ( LastError ) ≠ 0 ]
    Show Custom Dialog [ "Agentic-fm Debug" ; "Companion server not running. Start it with:¶¶python3 agent/scripts/companion_server.py" ]
End If
```

## Get ( LastErrorLocation ) and line numbers

`Get ( LastErrorLocation )` (added in FM 19.6.1) returns the script name, step name, and line number of the last error — e.g. `"Explode XML > Set Field, line 24"`. It is automatically captured in the debug payload.

**When a real error occurred:** `lastErrorLocation` will already be populated with the exact failure point. No extra work needed in the calling script.

**When no error occurred but you need the current line number:** Force a harmless error in the calling script immediately before `Perform Script`, then let the debug script capture it:

```
Set Error Capture [ On ]
Set Field []   # error 102 — no field specified; populates LastErrorLocation with current line
Perform Script [ "Agentic-fm Debug" ; Parameter: $debugParam ]
Set Error Capture [ Off ]
```

The `Set Field []` step must be the **last step before `Perform Script`** — any intervening successful step resets `Get ( LastError )` to 0. The forced error line number appears in `lastErrorLocation` in `output.json`.

## Companion server endpoint

Add a `/debug` endpoint to `companion_server.py` that writes the received JSON to `agent/debug/output.json`:

```python
elif self.path == "/debug":
    self._handle_debug()
```

```python
def _handle_debug(self):
    try:
        body = self._read_body()
        payload = json.loads(body)
    except (ValueError, OSError) as exc:
        self._send_json({"success": False, "error": str(exc)}, status=400)
        return

    debug_dir = os.path.join(os.path.dirname(__file__), "..", "debug")
    os.makedirs(debug_dir, exist_ok=True)
    output_path = os.path.join(debug_dir, "output.json")

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    log.info("Debug output written to agent/debug/output.json")
    self._send_json({"success": True, "path": output_path})
```

## Using $$DEBUG as a quick alternative

For a one-off diagnostic without creating the Agentic-fm Debug script, collect state into a `$$DEBUG` global:

```filemaker
Set Variable [ $$DEBUG ; JSONSetElement ( "{}" ;
    [ "exitCode" ; $exitCode ; JSONString ] ;
    [ "stderr"   ; $stderr   ; JSONString ] ;
    [ "stdout"   ; $stdout   ; JSONString ]
) ]
```

Then retrieve it from the Data Viewer (Tools > Data Viewer) and paste the JSON value to the agent. This is less convenient than the file-write approach but requires no script or server changes.

## Agent workflow

When the agent needs runtime debug information:

1. The agent uses the `fm-debug` skill (`.claude/skills/fm-debug/SKILL.md`)
2. The skill instructs the developer to run the appropriate script
3. Once the developer confirms, the agent reads `agent/debug/output.json` directly
4. The agent analyzes the output and proposes a fix

The agent cannot trigger FileMaker scripts. The developer must always run them manually.
