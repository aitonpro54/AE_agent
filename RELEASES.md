# AE MCP Bridge Releases

## v0.9.0-effect-tools - 2026-05-05

Effect-level tools for adding effects and setting effect properties.

Added:

- `add_effect`
- `set_effect_property`

Changed:

- Daemon and adapter report version `0.9.0`.
- Smoke tests expect daemon `0.9.0`.

Verified:

- Local syntax checks for daemon and adapter.
- Daemon-only and adapter smoke tests pass against `0.9.0` and list 32 tools.
- Live AE validation added an `ADBE Fill` effect, set its Color property, inspected it, and cleaned up temporary project items.

## v0.8.0-property-values - 2026-05-05

Property-level write tool for targeted AE automation.

Added:

- `set_property_value`

Changed:

- Daemon and adapter report version `0.8.0`.
- Smoke tests expect daemon `0.8.0`.

Verified:

- Local syntax checks for daemon and adapter.
- Daemon-only and adapter smoke tests pass against `0.8.0` and list 30 tools.
- Live AE validation set Position, Opacity, and TextDocument fields by property path, then cleaned up temporary project items.

## v0.7.0-practical-layers - 2026-05-05

Practical typed operations on top of the v0.6 inspection layer.

Added:

- `import_footage`
- `create_solid_layer`
- `create_null_layer`
- `create_adjustment_layer`
- `add_project_item_to_comp`
- `duplicate_comp`
- `find_project_items`

Changed:

- Practical comp tools can target `compName` when `compItemIndex` is not stable.
- Existing comp-targeted layer tools also accept `compName`.
- `add_project_item_to_comp` can target `itemName` plus optional `itemType`.
- Daemon and adapter report version `0.7.0`.

Verified:

- Local syntax checks for daemon and adapter.
- Daemon-only and adapter smoke tests pass against `0.7.0` and list 29 tools.
- Live AE validation created temporary comps/layers, used `compName` and `itemName`, duplicated a comp, and cleaned up temporary project items.

## v0.6.0-dev-inspection - 2026-05-05

Read-only development inspection tools for iterative JSX/ScriptUI work.

Added:

- `get_project_snapshot`
- `get_comp_details`
- `get_layer_details`

Changed:

- `get_layer_details` defaults to a compact response; set `includeProperties: true` for a property tree.
- `get_selected_properties` now includes property paths and can include value/expression previews.
- `run_extendscript_file` returns structured failure diagnostics with file path, duration, reported line, and nearby line context when available.
- Daemon and adapter report version `0.6.0`.

Verified:

- `bridge-daemon.js` and `mcp-adapter.js` pass syntax checks.
- `bridge-only-smoke-test.js` passes against daemon `0.6.0`.
- `smoke-test.js` passes and lists all 22 tools.

## v0.5.4-panel-autoconnect - 2026-05-05

Cold boot connection reliability fix.

Observed:

- After a full Windows reboot, the panel could remain offline until Codex and After Effects were restarted.
- Restarting only the programs worked, which pointed to panel polling state after cold boot rather than daemon startup alone.

Changed:

- The CEP panel remembers that the user clicked Connect and auto-connects on the next panel load when a token is saved.
- Panel HTTP requests now have a timeout, so a dead request after reboot cannot block retries forever.
- The default lifecycle remains Codex-triggered daemon startup. No Windows logon startup task is used.

## v0.5.3-codex-lifecycle-default - 2026-05-05

Lifecycle default correction.

Decision:

- Do not use Windows logon startup as the normal bridge lifecycle.
- Keep the daemon triggered by Codex through `mcp-adapter.js`.
- The CEP panel remains a client and can wait offline until Codex starts the daemon.

Changed:

- Removed startup-task setup from the main README flow.
- Documented `uninstall-daemon-startup-task.ps1` only as cleanup for machines that tried `v0.5.2`.
- Confirmed the installed task `Codex AE MCP Bridge Daemon` was removed from the test machine.

## v0.5.2-startup-task - 2026-05-05

Startup reliability improvement.

Observed:

- After reboot, CEP could remain offline for about 80 seconds because daemon startup still depended on Codex/MCP lifecycle timing.
- Logs showed daemon events around `09:38:04` and the first successful CEP poll around `09:40:10`.

Added:

- `scripts\install-daemon-startup-task.ps1`
- `scripts\get-daemon-startup-task.ps1`
- `scripts\uninstall-daemon-startup-task.ps1`

Verified:

- Installed Windows Scheduled Task `Codex AE MCP Bridge Daemon`.
- Starting the task manually brings `/health` online on `127.0.0.1:3456`.
- CEP returns to `panelConnected: true` within a few seconds after the daemon task starts.

Later decision:

- This is not the default lifecycle because it starts at Windows logon and can show a PowerShell window.
- Prefer `v0.5.3-codex-lifecycle-default`.

## v0.5.1-auto-daemon - 2026-05-04

Out-of-box connection hotfix.

Changed:

- `mcp-adapter.js` now checks daemon health on startup.
- If `127.0.0.1:3456` is empty, the adapter auto-starts `bridge-daemon.js` as a detached background process.
- Set `AE_DAEMON_AUTO_START=0` to disable auto-start.

Why:

- After the daemon split, enabling the MCP server in Codex started only the stdio adapter. The CEP panel stayed offline unless the daemon was started manually.

## v0.5.0-dev-workflow - 2026-05-04

Developer workflow tools for iterative AE script and panel development.

Verified:

- `bridge-daemon.js` and `mcp-adapter.js` report version `0.5.0`.
- `bridge-only-smoke-test.js` starts a temporary daemon.
- `smoke-test.js` starts a temporary daemon plus adapter and lists all 19 tools.
- Live CEP validation on `127.0.0.1:3456` reports panel online against daemon `0.5.0`.
- `mcp-call-tool.js` works for `run_extendscript_file`, `create_test_comp`, `create_text_layer`, `get_selected_layers`, `get_selected_properties`, and `cleanup_test_items`.

Added:

- `run_extendscript_file`
- `get_selected_layers`
- `get_selected_properties`
- `create_test_comp`
- `cleanup_test_items`
- `scripts\ae-file-smoke.jsx` as a tiny file-run smoke fixture

Notes:

- `run_extendscript_file` is project-scoped by default. Set `AE_ALLOW_SCRIPT_FILES_OUTSIDE_PROJECT=1` to run files outside the bridge project.
- `cleanup_test_items` requires `confirm: true` and only removes items matching a name prefix.

## v0.4.0-daemon-split - 2026-05-04

Persistent daemon split.

Verified locally:

- `bridge-daemon.js` reports version `0.4.0` from `/health`.
- `bridge-only-smoke-test.js` starts the daemon successfully.
- `smoke-test.js` starts a temporary daemon plus MCP adapter, lists all 14 tools, and simulates `/bridge/next` plus `/bridge/result`.
- Live CEP validation on `127.0.0.1:3456` reports panel online against daemon `0.4.0`.
- `mcp-call-tool.js` works for `get_bridge_status`, `ping_ae`, `get_project_info`, `run_extendscript`, and `create_text_layer`.

Added:

- `mcp-server\bridge-daemon.js`
- `mcp-server\mcp-adapter.js`
- `POST /tools/call` for the MCP adapter
- `GET /tools` for tool discovery
- `GET /results/:id` and retained recent AE command results
- compatibility wrapper in `mcp-server\server.js`
- ExtendScript-side result serialization that does not depend on AE exposing `JSON.stringify`

Changed:

- `scripts\start-bridge-only.ps1` starts the daemon directly.
- `scripts\start-server.ps1` starts the MCP adapter only.
- `scripts\mcp-call-tool.js` calls the MCP adapter and expects a daemon to already be running.
- `scripts\mcp-call-tool.js` accepts `MCP_CALL_ARGS_JSON` and uses the longer AE command timeout by default.
- MCP config examples now point at `mcp-server\mcp-adapter.js`.
- `/bridge/next` uses short polling to avoid losing commands to stale long-poll responses.

Known caveats:

- A previous `0.3.0` bridge process may still be running on `127.0.0.1:3456`; stop it before starting the `0.4.0` daemon on the same port.
- `backup_project_file` cannot back up an unsaved `.aep`; the live smoke project was unsaved, so backup validation correctly returned an error instead of creating a file.

## v0.3.0-diagnostics - 2026-05-04

Diagnostics and pre-daemon-split checkpoint.

Verified:

- `0.2.0` MCP tools still appear in `tools/list`.
- The server reports version `0.3.0`.
- `bridge-only` mode starts a persistent HTTP bridge on a chosen port.
- `get_bridge_status` works through manual JSON-RPC MCP invocation.
- The CEP panel connects successfully to bridge-only mode on `127.0.0.1:3456`.
- JSONL command logging is written to `logs\bridge-events.jsonl`.

Added:

- `get_bridge_status`
- `get_command_log`
- `backup_project_file`
- `scripts\start-bridge-only.ps1`
- `scripts\bridge-only-smoke-test.js`
- `scripts\mcp-call-tool.js`
- local log and backup paths, ignored by git

Known caveats:

- The current architecture still combines MCP stdio server and HTTP bridge in one process.
- Running bridge-only on `3456` prevents Codex MCP from starting another server on the same port.
- Next planned architecture is a persistent bridge daemon plus a thin MCP adapter.

Rollback:

1. Stop bridge-only or any running MCP server.
2. Use `git checkout v0.3.0-diagnostics` or restore the matching snapshot archive.
3. Restart Codex or the bridge process.
4. Reconnect the CEP panel in After Effects.

## v0.2.0-mvp - 2026-05-04

Stable MVP checkpoint.

Verified:

- Codex can connect to the `after-effects` MCP server.
- The local MCP server can communicate with the CEP panel on `127.0.0.1:3456`.
- The CEP panel can execute ExtendScript inside After Effects.
- `ping_ae`, `get_project_info`, `list_comps`, `list_layers`, and `run_extendscript` work.
- Higher-level tools are available:
  - `get_active_comp`
  - `find_comps`
  - `create_text_layer`
  - `set_layer_transform`
  - `apply_transform_expression`
  - `add_layer_marker`

Known caveats:

- CEP panel Activity may still show old `HTTP 0 / Network error` log entries from before the network fix.
- The server is dependency-free and uses simple HTTP polling, not WebSocket.
- `PlayerDebugMode` must remain enabled for unsigned local CEP development panels.

Rollback:

1. Stop the running MCP server.
2. Replace the project folder contents with the matching snapshot archive, or use `git checkout v0.2.0-mvp`.
3. Restart Codex if MCP config or server tools changed.
4. Reopen or reconnect the CEP panel in After Effects.
