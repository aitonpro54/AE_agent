# AE MCP Bridge Releases

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
