# AE MCP Bridge MVP

Minimal local MCP bridge for Adobe After Effects.

It has two parts:

- `mcp-server/server.js` - a dependency-free Node MCP server over stdio. It also starts a local HTTP bridge for the AE panel.
- `cep-panel/` - a CEP panel that runs inside After Effects, polls the local bridge, executes ExtendScript through `evalScript`, and posts results back.

## Current MVP tools

- `ping_ae` - verifies that After Effects is connected and can run a tiny script.
- `run_extendscript` - runs an ExtendScript function body in After Effects.
- `list_comps` - lists project compositions.
- `list_layers` - lists layers in a composition by index.
- `get_project_info` - returns basic project info.
- `get_active_comp` - returns active composition details and selected layers.
- `find_comps` - finds compositions by name substring.
- `create_text_layer` - creates a text layer in the active comp or a comp by project item index.
- `set_layer_transform` - sets position, scale, rotation, opacity, or anchor point.
- `apply_transform_expression` - applies an expression to a common transform property.
- `add_layer_marker` - adds a marker to a layer.

## Run server

Use a working Node runtime:

```powershell
node .\mcp-server\server.js
```

Optional environment variables:

```powershell
$env:AE_BRIDGE_PORT="3456"
$env:AE_BRIDGE_TOKEN="change-me"
node .\mcp-server\server.js
```

Or use the helper:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-server.ps1 -Port 3456 -Token codex-ae-local
```

The bridge listens only on `127.0.0.1`.

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
  "args": ["C:\\path\\to\\ae-mcp-bridge\\mcp-server\\server.js"],
  "env": {
    "AE_BRIDGE_PORT": "3456",
    "AE_BRIDGE_TOKEN": "change-me"
  }
}
```

There is also a ready local example in `mcp-config.example.json`.

## Smoke test

This test verifies the MCP server and HTTP bridge without After Effects:

```powershell
node .\scripts\smoke-test.js
```

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
http://127.0.0.1:3456/dev/tool/ping_ae?token=codex-ae-local
http://127.0.0.1:3456/dev/tool/get_project_info?token=codex-ae-local
http://127.0.0.1:3456/dev/tool/list_comps?token=codex-ae-local
http://127.0.0.1:3456/dev/tool/get_active_comp?token=codex-ae-local
http://127.0.0.1:3456/dev/tool/find_comps?token=codex-ae-local&query=Comp
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

## Security note

Enabling CEP `PlayerDebugMode` allows unsigned CEP panels to load for the selected Adobe CEP runtime versions. That is convenient for local development, but it is a real trust setting. Only install panels from local code you control, and turn it off later if you want a stricter Adobe extension setup.

## Reliability notes

This MVP intentionally uses a simple HTTP polling bridge instead of WebSocket dependencies. That makes the first version easier to install and inspect. The tradeoff is that long-running scripts still depend on After Effects staying responsive while `evalScript` runs.

Keep scripts small while testing. Once the bridge is stable, add safer higher-level tools instead of sending large arbitrary scripts every time.
