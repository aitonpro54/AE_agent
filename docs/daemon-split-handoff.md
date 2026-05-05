# Daemon Split Handoff

Date: 2026-05-04

## Current Checkpoint

- Current saved checkpoint: `v0.3.0-diagnostics`
- Commit: `781c140`
- Snapshot archive: `snapshots/ae-mcp-bridge-v0.3.0-diagnostics-2026-05-04.zip`
- Previous stable MVP: `v0.2.0-mvp`

## v0.4.0 Implementation Notes

Implemented the daemon split without changing `cep-panel/`.

- `mcp-server/bridge-daemon.js` owns HTTP port `3456`, `/bridge/next`, `/bridge/result`, `/health`, `/dev/*`, `/tools`, `/tools/call`, logs, backups, command IDs, and retained recent results.
- `mcp-server/mcp-adapter.js` owns stdio MCP and forwards `tools/list` plus `tools/call` to the daemon.
- `mcp-server/server.js` is now a compatibility wrapper. Default mode starts the adapter; `--bridge-only`, `--daemon`, or `AE_BRIDGE_ONLY=1` starts the daemon.
- Existing CEP endpoints are stable.
- `/bridge/next` uses short polling rather than long-poll retention, which avoids losing commands to stale CEP HTTP responses.
- ExtendScript results are serialized by an injected serializer instead of relying on `JSON.stringify` existing inside After Effects.
- `scripts/start-bridge-only.ps1` starts the daemon directly.
- `scripts/start-server.ps1` starts the adapter only.
- `scripts/mcp-call-tool.js` now expects a daemon to already be running and supports `MCP_CALL_ARGS_JSON`.

Local validation passed on temporary ports and live `127.0.0.1:3456` with CEP online. `ping_ae`, `get_project_info`, `run_extendscript`, and `create_text_layer` worked through `mcp-call-tool.js`. `backup_project_file` correctly returned an error because the live AE project was unsaved.

## v0.5.0 Dev Workflow Notes

Scope: enough tooling for iterative AE script/panel development, not broad Atom-like scene generation.

Added tools:

- `run_extendscript_file`
- `get_selected_layers`
- `get_selected_properties`
- `create_test_comp`
- `cleanup_test_items`

Safety choices:

- `run_extendscript_file` is limited to files inside the bridge project unless `AE_ALLOW_SCRIPT_FILES_OUTSIDE_PROJECT=1`.
- `cleanup_test_items` requires `confirm: true`, a name prefix, and a max item limit.
- `scripts/ae-file-smoke.jsx` is a tiny fixture for file execution smoke tests.

Live validation passed on `127.0.0.1:3456` with CEP online. A temporary `Codex Test v0.5 Dev Workflow` comp was created, used for selected layer/property checks, and removed through `cleanup_test_items`.

## v0.5.1 Auto Daemon Notes

Problem found in real use: the CEP panel stayed offline after Codex restart because the MCP config launched the stdio adapter, but no persistent daemon owned `127.0.0.1:3456`.

Fix:

- `mcp-adapter.js` checks `/health` on startup.
- If no daemon responds, it starts `bridge-daemon.js` as a detached background process.
- `AE_DAEMON_AUTO_START=0` disables this behavior for manual daemon lifecycle testing.

Validated by stopping anything listening on `3456`, running `mcp-call-tool.js get_bridge_status`, and confirming daemon `0.5.1` came up with CEP online.

## v0.5.2 Startup Task Notes

Observed after reboot: plugin/panel auto-opened, but status took roughly `09:38:49` to `09:40:10` to become online. Logs showed daemon startup was still coupled to Codex/MCP timing.

Fix:

- Added Windows Scheduled Task helpers:
  - `scripts/install-daemon-startup-task.ps1`
  - `scripts/get-daemon-startup-task.ps1`
  - `scripts/uninstall-daemon-startup-task.ps1`
- Installed task name: `Codex AE MCP Bridge Daemon`.
- The task starts `scripts/start-bridge-only.ps1` at user logon with a 10 second delay.

Validation:

- Stopped current listener on `127.0.0.1:3456`.
- Ran the scheduled task manually.
- `/health` returned the daemon, then CEP became `panelConnected: true` within a few seconds.

Later decision: do not use the startup task as the default lifecycle. It solved speed after reboot, but it also starts at Windows logon and can show a PowerShell window. The installed task was removed from the test machine.

## v0.5.3 Lifecycle Decision

Chosen default:

- Codex starts the stdio MCP adapter.
- The adapter auto-starts `bridge-daemon.js` as a detached background process if nothing is listening on `127.0.0.1:3456`.
- The CEP panel stays a passive client and connects when the daemon is available.
- No Windows logon startup task is required.

This keeps the setup simpler and avoids background processes appearing before the user opens Codex or starts using AE tools.

## Current State

The bridge works with a Codex-triggered daemon lifecycle.

Working:

- CEP panel appears in After Effects as `Codex AE MCP Bridge`.
- CEP panel can connect to `http://127.0.0.1:3456`.
- `run_extendscript` can execute inside After Effects.
- Higher-level tools work, including text layer creation.
- `mcp-adapter.js` can start the daemon in the background when Codex calls the MCP server.
- `bridge-only` mode still exists for manual testing.
- Diagnostics/logging tools were added:
  - `get_bridge_status`
  - `get_command_log`
  - `backup_project_file`
- Logs go to `logs\bridge-events.jsonl`.
- Project backups go to `backups\`.

Current lifecycle tradeoff:

- If After Effects opens before Codex starts the daemon, the CEP panel can show offline for a while.
- That is acceptable for now; the first Codex `after-effects` tool call should start the daemon.
- Do not re-enable Windows logon startup unless fast post-reboot panel connection becomes more important than avoiding autostart.

## Target Architecture

Split into two processes:

```text
After Effects CEP panel
        |
        v
persistent bridge daemon on 127.0.0.1:3456
        ^
        |
thin MCP adapter over stdio
        ^
        |
Codex / MCP client
```

Daemon owns:

- HTTP port `3456`
- panel connection state
- command queue
- command IDs
- result retention by command ID
- timeouts/stale detection
- logs
- project backups
- dev endpoints

MCP adapter owns:

- stdio JSON-RPC MCP transport
- tool schemas
- argument validation
- calls to daemon HTTP endpoints
- no HTTP listener
- no CEP lifecycle assumptions

## Why This Direction

Existing projects mostly use file bridges:

- Dakkshin/after-effects-mcp
- TheLlamainator/after-effects-mcp
- p10q/ae-mcp

Useful lessons from them:

- Keep a persistent bridge layer.
- Preserve results beyond a single request.
- Detect stale results.
- Keep command IDs explicit.
- Add rich tools gradually.

We are not switching fully to file bridge yet because our HTTP CEP bridge already works and gives better live diagnostics. The intended design is a hybrid:

- HTTP command queue for live communication.
- JSONL/files for logs, backups, result history, and possible fallback.

## Files to Touch

Primary:

- `mcp-server/server.js`

Likely split into:

- `mcp-server/bridge-daemon.js`
- `mcp-server/mcp-adapter.js`
- `mcp-server/shared-tools.js` or `mcp-server/tool-definitions.js`
- `mcp-server/ae-scripts.js` if the ExtendScript snippets get too large

Scripts to update/add:

- `scripts/start-bridge-only.ps1`
  - likely rename or repurpose as daemon starter
- `scripts/start-server.ps1`
  - should start MCP adapter only, or be documented as legacy/manual
- `scripts/smoke-test.js`
  - update for adapter + daemon
- `scripts/bridge-only-smoke-test.js`
  - update to daemon smoke-test
- `scripts/mcp-call-tool.js`
  - should call adapter while daemon is already running

Docs:

- `README.md`
- `RELEASES.md`
- `docs/ready-solutions-research.md`

Do not change initially:

- `cep-panel/`

The existing CEP panel already polls:

- `GET /bridge/next`
- `POST /bridge/result`

Keep those endpoints stable in the daemon so panel reinstall is not required.

## Proposed Daemon Endpoints

Keep existing panel endpoints:

- `GET /bridge/next?token=...`
- `POST /bridge/result?token=...`

Add or preserve dev/adapter endpoints:

- `GET /health`
- `GET /dev/status?token=...`
- `GET /dev/logs?token=...&limit=50`
- `GET /dev/tools?token=...`
- `POST /tools/call?token=...`

Optional later:

- `GET /results/:id?token=...`
- `POST /commands?token=...`
- `GET /commands/:id?token=...`

## Implementation Sequence

1. Create `bridge-daemon.js` by moving HTTP state and AE command queue out of `server.js`.
2. Keep the CEP panel endpoints unchanged.
3. Add daemon-side `callTool` handler or command executor endpoint.
4. Convert `server.js` into `mcp-adapter.js` behavior:
   - initialize MCP
   - list tools
   - on `tools/call`, POST to daemon
   - return daemon result
5. Keep `server.js` as compatibility entrypoint if useful:
   - either export adapter mode
   - or print a clear message explaining daemon requirement
6. Update Codex config if entrypoint changes.
7. Run checks.
8. Save checkpoint `v0.4.0-daemon-split` if stable.

## Validation Commands

Syntax:

```powershell
& "C:\Users\Ant\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --check .\mcp-server\bridge-daemon.js
& "C:\Users\Ant\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --check .\mcp-server\mcp-adapter.js
```

Daemon health:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-bridge-only.ps1 -Port 3456 -Token codex-ae-local
Invoke-RestMethod "http://127.0.0.1:3456/health"
```

CEP panel:

- Open After Effects.
- Open `Window > Extensions > Codex AE MCP Bridge`.
- Set URL `http://127.0.0.1:3456`.
- Token `codex-ae-local`.
- Click `Connect`.
- Expect `online`.

MCP adapter:

```powershell
& "C:\Users\Ant\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" .\scripts\mcp-call-tool.js get_bridge_status
```

AE execution:

- Call `ping_ae`.
- Call `get_project_info`.
- Call `create_text_layer` in a test comp.
- Undo in AE to confirm Undo Group behavior.

Backup:

- Call `backup_project_file` before destructive tests.
- Verify a `.aep` copy appears in `backups\`.

## Rollback

Preferred:

```powershell
git checkout v0.3.0-diagnostics
```

Or restore:

```text
snapshots\ae-mcp-bridge-v0.3.0-diagnostics-2026-05-04.zip
```

After rollback:

- Stop any running bridge/MCP process.
- Restart Codex if MCP config changed.
- Reopen or reconnect the CEP panel.

## Important Cautions

- Do not run daemon/bridge-only and old combined MCP server on the same port.
- Do not change CEP panel endpoints until daemon split is validated.
- Do not remove `run_extendscript`; keep it as escape hatch, but prefer safe tools.
- Keep file backups and JSONL logs ignored by git.
- Before any large AE-changing test, call `backup_project_file`.
