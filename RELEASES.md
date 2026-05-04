# AE MCP Bridge Releases

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
