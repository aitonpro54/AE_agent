# AE MCP Bridge MVP

Minimal local MCP bridge for Adobe After Effects.

It has two parts:

- `mcp-server/bridge-daemon.js` - a persistent local HTTP daemon that owns port `3456`, the AE panel queue, command IDs, results, logs, and backups.
- `mcp-server/mcp-adapter.js` - a dependency-free stdio MCP adapter that exposes tools to Codex and calls the daemon over HTTP.
- `cep-panel/` - a CEP panel that runs inside After Effects, polls the local bridge, executes ExtendScript through `evalScript`, and posts results back.

`mcp-server/server.js` remains as a compatibility wrapper. By default it starts the MCP adapter; with `--bridge-only`, `--daemon`, or `AE_BRIDGE_ONLY=1`, it starts the daemon. The adapter auto-starts the daemon when the daemon is not already listening.

## Current MVP tools

- `get_bridge_status` - returns bridge diagnostics, connection state, paths, and recent events.
- `get_command_log` - returns recent local JSONL log events.
- `backup_project_file` - copies the currently saved `.aep` into `backups/` without modifying the open project.
- `checkpoint_project` - creates a named checkpoint copy of the currently saved `.aep`.
- `list_project_checkpoints` - lists checkpoint `.aep` files in `backups/`.
- `restore_project_checkpoint` - verifies a checkpoint and returns safe manual restore instructions without overwriting the open project.
- `ping_ae` - verifies that After Effects is connected and can run a tiny script.
- `run_extendscript` - runs an ExtendScript function body in After Effects.
- `run_extendscript_file` - runs a local `.jsx`, `.jsxinc`, `.js`, or `.txt` script file.
- `list_comps` - lists project compositions.
- `list_layers` - lists layers in a composition by index.
- `get_project_info` - returns basic project info.
- `get_project_snapshot` - returns a compact snapshot of comps, footage, and folders.
- `find_project_items` - finds project items by name and optional type.
- `get_comp_details` - returns detailed comp settings and optional layer summaries.
- `get_layer_details` - returns one layer's source, transform, text, effects, masks, and optional property tree.
- `list_effect_presets` - returns curated effect matchName presets and automation hints.
- `list_effects` - lists effects applied to a layer.
- `get_effect_details` - returns one effect's metadata and optional property tree.
- `get_active_comp` - returns active composition details and selected layers.
- `get_selected_layers` - returns selected layers in the active composition.
- `get_selected_properties` - returns selected properties with path, expression, and optional value previews.
- `find_comps` - finds compositions by name substring.
- `create_text_layer` - creates a text layer in the active comp or a comp by project item index.
- `import_footage` - imports a local file as footage.
- `create_solid_layer` - creates a solid layer.
- `create_null_layer` - creates a null layer.
- `create_adjustment_layer` - creates an adjustment layer.
- `add_project_item_to_comp` - adds existing footage or a comp as a layer.
- `duplicate_comp` - duplicates a composition.
- `add_effect` - adds an effect to a layer.
- `set_effect_property` - sets a property on an existing layer effect.
- `set_property_value` - sets an arbitrary layer property by property path.
- `set_layer_transform` - sets position, scale, rotation, opacity, or anchor point.
- `apply_transform_expression` - applies an expression to a common transform property.
- `add_layer_marker` - adds a marker to a layer.
- `create_test_comp` - creates a temporary development comp.
- `cleanup_test_items` - removes temporary project items by name prefix with explicit confirmation.

## Run daemon

Use a working Node runtime:

```powershell
node .\mcp-server\bridge-daemon.js
```

Optional environment variables:

```powershell
$env:AE_BRIDGE_PORT="3456"
$env:AE_BRIDGE_TOKEN="change-me"
node .\mcp-server\bridge-daemon.js
```

Or use the helper:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-bridge-only.ps1 -Port 3456 -Token codex-ae-local
```

The bridge listens only on `127.0.0.1`.

The adapter is what MCP clients should launch:

```powershell
node .\mcp-server\mcp-adapter.js
```

Adapter helper:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-server.ps1 -Port 3456 -Token codex-ae-local
```

The adapter does not open an HTTP port itself. If the daemon is not already running, the adapter starts `bridge-daemon.js` as a detached background process. Set `AE_DAEMON_AUTO_START=0` to disable this behavior.

Default lifecycle: do not install a Windows logon startup task. Let Codex start the adapter, let the adapter start the daemon in the background, and let the CEP panel connect when the daemon is available. This keeps the bridge out of Windows autostart and avoids visible PowerShell windows.

## Panel says offline

The CEP panel is only a client. It becomes online when the bridge daemon is listening on `127.0.0.1:3456`.

Usually, calling any `after-effects` MCP tool from Codex is enough to start the daemon. If you want to start it manually:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-bridge-only.ps1 -Port 3456 -Token codex-ae-local
```

Codex can use MCP tools while the daemon stays online because the MCP adapter no longer tries to bind port `3456`.

After you connect once, the panel remembers the URL/token and starts polling automatically when it opens again. If the daemon is not up yet, the panel keeps retrying until Codex starts it.

If an old logon startup task was installed during testing, remove it:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-daemon-startup-task.ps1
```

## Install CEP panel

Copy `cep-panel` into:

```text
C:\Users\<you>\AppData\Roaming\Adobe\CEP\extensions\com.codex.aemcpbridge
```

If unsigned CEP extensions are disabled, enable PlayerDebugMode for your CEP version in the Windows registry.

Typical locations:

```text
HKEY_CURRENT_USER\Software\Adobe\CSXS.11
HKEY_CURRENT_USER\Software\Adobe\CSXS.12
HKEY_CURRENT_USER\Software\Adobe\CSXS.13
```

Create string value:

```text
PlayerDebugMode = 1
```

Then restart After Effects and open:

```text
Window > Extensions > Codex AE MCP Bridge
```

## MCP client config

For a stdio MCP client, point it at:

```json
{
  "command": "node",
  "args": ["C:\\path\\to\\ae-mcp-bridge\\mcp-server\\mcp-adapter.js"],
  "env": {
    "AE_BRIDGE_PORT": "3456",
    "AE_BRIDGE_TOKEN": "change-me"
  }
}
```

There is also a ready local example in `mcp-config.example.json`.

## Smoke test

This test verifies the MCP server and HTTP bridge without After Effects:
This test starts a temporary daemon and adapter, then simulates the CEP panel:

```powershell
node .\scripts\smoke-test.js
```

Daemon-only health:

```powershell
node .\scripts\bridge-only-smoke-test.js
```

Manual MCP tool call, with the daemon already running:

```powershell
node .\scripts\mcp-call-tool.js get_bridge_status
```

Useful project inspection calls:

```powershell
node .\scripts\mcp-call-tool.js get_project_snapshot

$env:MCP_CALL_ARGS_JSON='{"compItemIndex":1,"includeLayers":true}'
node .\scripts\mcp-call-tool.js get_comp_details
Remove-Item Env:MCP_CALL_ARGS_JSON

$env:MCP_CALL_ARGS_JSON='{"compItemIndex":1,"layerIndex":1}'
node .\scripts\mcp-call-tool.js get_layer_details
Remove-Item Env:MCP_CALL_ARGS_JSON
```

`get_layer_details` returns a compact response by default. Pass `includeProperties: true`, `propertyDepth`, and `propertyLimit` when you need a deeper property tree.

For JSON arguments from PowerShell, use `MCP_CALL_ARGS_JSON` to avoid native argument quoting quirks:

```powershell
$env:MCP_CALL_ARGS_JSON='{"text":"Codex test","compItemIndex":1}'
node .\scripts\mcp-call-tool.js create_text_layer
Remove-Item Env:MCP_CALL_ARGS_JSON
```

`run_extendscript_file` reads files inside the bridge project by default:

```powershell
$env:MCP_CALL_ARGS_JSON='{"filePath":"scripts/ae-file-smoke.jsx"}'
node .\scripts\mcp-call-tool.js run_extendscript_file
Remove-Item Env:MCP_CALL_ARGS_JSON
```

Set `AE_ALLOW_SCRIPT_FILES_OUTSIDE_PROJECT=1` only when you intentionally want the daemon to execute script files from outside this project folder.

When a script file fails inside After Effects, the tool returns the file path, duration, reported line, and nearby line context when After Effects provides a line number.

In the Codex desktop runtime, this Node executable worked during initial validation:

```text
C:\Users\Ant\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe
```

## Local AE ping

With the server running and the CEP panel connected in After Effects, open:

```text
http://127.0.0.1:3456/dev/ping-ae?token=codex-ae-local
```

Expected result:

```json
{
  "ok": true,
  "result": {
    "appName": "Adobe After Effects",
    "appVersion": "...",
    "projectItems": 0
  }
}
```

You can also exercise the same tool handlers that MCP clients use:

```text
http://127.0.0.1:3456/dev/tools?token=codex-ae-local
http://127.0.0.1:3456/tools?token=codex-ae-local
http://127.0.0.1:3456/dev/tool/ping_ae?token=codex-ae-local
http://127.0.0.1:3456/dev/tool/get_project_info?token=codex-ae-local
http://127.0.0.1:3456/dev/tool/list_comps?token=codex-ae-local
http://127.0.0.1:3456/dev/tool/get_active_comp?token=codex-ae-local
http://127.0.0.1:3456/dev/tool/find_comps?token=codex-ae-local&query=Comp
http://127.0.0.1:3456/dev/tool/get_bridge_status?token=codex-ae-local
http://127.0.0.1:3456/dev/logs?token=codex-ae-local&limit=25
```

The MCP adapter uses:

```text
POST http://127.0.0.1:3456/tools/call
```

For layers, use a composition project item index:

```text
http://127.0.0.1:3456/dev/tool/list_layers?token=codex-ae-local&compItemIndex=1
```

For tools that change a project, prefer POST from PowerShell or an MCP client. Example:

```powershell
Invoke-RestMethod `
  -Method Post `
  -ContentType "application/json" `
  -Uri "http://127.0.0.1:3456/dev/tool/create_text_layer?token=codex-ae-local" `
  -Body '{"text":"Codex test","position":[960,540],"fontSize":96,"fillColor":[1,1,1]}'
```

All project-changing tools use After Effects Undo Groups, so a normal AE undo can roll back the last operation.

## Diagnostics and backups

The server writes local JSONL events to:

```text
logs\bridge-events.jsonl
```

The log includes server startup, tool calls, queued AE commands, AE command results, and project backup events. Long strings are truncated before logging.

Create a non-destructive backup of the currently saved `.aep`:

```powershell
Invoke-RestMethod `
  -Method Post `
  -ContentType "application/json" `
  -Uri "http://127.0.0.1:3456/dev/tool/backup_project_file?token=codex-ae-local" `
  -Body '{"label":"before-big-edit"}'
```

Backups are written to:

```text
backups\
```

`backup_project_file` copies the project file currently on disk. It does not save unsaved After Effects changes and does not change the open project path.

Create a named checkpoint before a risky edit:

```powershell
Invoke-RestMethod `
  -Method Post `
  -ContentType "application/json" `
  -Uri "http://127.0.0.1:3456/dev/tool/checkpoint_project?token=codex-ae-local" `
  -Body '{"label":"before-title-pass"}'
```

List checkpoints:

```powershell
Invoke-RestMethod `
  -Uri "http://127.0.0.1:3456/dev/tool/list_project_checkpoints?token=codex-ae-local"
```

Prepare a restore from a checkpoint:

```powershell
Invoke-RestMethod `
  -Method Post `
  -ContentType "application/json" `
  -Uri "http://127.0.0.1:3456/dev/tool/restore_project_checkpoint?token=codex-ae-local" `
  -Body '{"checkpointFile":"My_Project-checkpoint-before-title-pass-2026-05-05T18-30-00-000Z.aep","confirm":true}'
```

`restore_project_checkpoint` is intentionally non-destructive in v0.12: it validates the checkpoint and returns manual After Effects restore instructions instead of overwriting the currently open project file.

Mutating tools can opt in to a preflight checkpoint:

```powershell
Invoke-RestMethod `
  -Method Post `
  -ContentType "application/json" `
  -Uri "http://127.0.0.1:3456/dev/tool/create_text_layer?token=codex-ae-local" `
  -Body '{"text":"Checkpointed title","checkpointLabel":"before-title-layer"}'
```

Any mutating tool can use either `checkpointLabel` or `autoCheckpoint:true`. The checkpoint is created before the project-changing operation and is included in the tool result. This remains opt-in so routine inspection and tiny test calls do not create extra `.aep` files.

## Security note

Enabling CEP `PlayerDebugMode` allows unsigned CEP panels to load for the selected Adobe CEP runtime versions. That is convenient for local development, but it is a real trust setting. Only install panels from local code you control, and turn it off later if you want a stricter Adobe extension setup.

## Reliability notes

This MVP intentionally uses a simple HTTP polling bridge instead of WebSocket dependencies. That makes the first version easier to install and inspect. The tradeoff is that long-running scripts still depend on After Effects staying responsive while `evalScript` runs.

Keep scripts small while testing. Once the bridge is stable, add safer higher-level tools instead of sending large arbitrary scripts every time.
