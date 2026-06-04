# Ready Solutions Research

Date: 2026-05-04

Goal: compare existing After Effects MCP bridges before the daemon split.

## Sources

- Dakkshin/after-effects-mcp: https://github.com/Dakkshin/after-effects-mcp
- TheLlamainator/after-effects-mcp: https://github.com/TheLlamainator/after-effects-mcp
- p10q/ae-mcp listing: https://playbooks.com/mcp/p10q/ae-mcp
- Atom MCP mode docs: https://tryatom.ai/docs/reference/mcp-mode

## Common Architecture Pattern

Most open solutions avoid a long-lived HTTP bridge owned by the MCP process. They use a file-based bridge:

```text
MCP client -> stdio MCP server -> command file -> AE panel -> After Effects -> result file -> MCP server
```

TheLlamainator documents this explicitly as:

```text
AI Client -> MCP Server -> Bridge Files -> After Effects Bridge Panel -> Adobe After Effects
```

Dakkshin and TheLlamainator use `ae_command.json` and `ae_mcp_result.json`-style files. p10q also describes a watched-directory file bridge.

## Useful Ideas to Borrow

- Split command submission and result retrieval for long-running operations:
  - `run-script` queues a command.
  - `get-results` reads the latest result.
  - This is less elegant than our synchronous HTTP queue, but it handles AE operations that exceed MCP timeouts.
- Use stale-result detection:
  - Dakkshin checks result file mtime and warns if output is older than about 30 seconds.
- Use a stable shared bridge directory:
  - Dakkshin moved bridge files into `~/Documents/ae-mcp-bridge` for cross-process reliability.
- Add a richer tool catalog:
  - composition creation/update
  - shape/solid/adjustment/null/camera layers
  - duplicate/delete layers
  - keyframes
  - expressions
  - masks
  - effects by display name/matchName
  - effect/preset discovery
  - audio markers/workflow
- Add help and prompts:
  - `get-help`
  - task prompts such as list/analyze/create composition
- Avoid installing into Program Files when possible:
  - AppData/user-level install is enough for development and avoids elevation.

## Things Not to Copy Directly

- The queued `run-script` + separate `get-results` UX is clunkier than our direct tool return for fast operations.
- Some examples rely on a manually opened `.jsx` panel rather than a CEP HTML panel with better UI and status.
- The file bridge can leave stale result state if command IDs are not enforced.
- A single global command/result file is fragile under concurrent MCP tool calls.

## Recommended Direction for Our Bridge

Keep our CEP panel and local HTTP polling because it already works and gives live status. Do the daemon split, but design it with lessons from file-bridge systems:

```text
Codex MCP adapter -> persistent bridge daemon -> HTTP command queue -> CEP panel -> After Effects
```

The daemon should own:

- stable port `3456`
- command IDs
- command queue
- result retention by ID
- stale/timeout detection
- logs
- backup/checkpoint folder
- `/health`, `/dev/status`, `/dev/logs`

The MCP adapter should be thin:

- no HTTP listener
- no CEP lifecycle ownership
- call daemon endpoints
- expose MCP tools
- return direct result for fast tools
- optionally return queued IDs for long-running tools

## Next Implementation Plan

1. Move HTTP bridge state into `bridge-daemon.js`.
2. Convert `mcp-server/server.js` into a stdio adapter that calls daemon HTTP endpoints.
3. Preserve the public MCP tool names and schemas.
4. Add daemon endpoints:
   - `GET /health`
   - `GET /commands/next`
   - `POST /commands/result`
   - `POST /tools/call`
   - `GET /tools`
   - `GET /logs`
5. Keep `start-bridge-only.ps1`, but rename conceptually to daemon start.
6. Add a Codex config note: daemon must be running before Codex MCP adapter.

## Why Not Switch Fully to File Bridge

File bridge is robust and proven, but our HTTP CEP bridge is already working and simpler to inspect live. The best hybrid is:

- HTTP queue for live panel communication.
- JSONL logs and optional result snapshots on disk for durability.
- File backup/checkpoints for project safety.

## Implementation Follow-up

The v0.4.0 split keeps the HTTP CEP bridge and adopts the persistent bridge layer pattern:

- `bridge-daemon.js` keeps command IDs, queue state, logs, backups, and retained recent command results.
- `mcp-adapter.js` is a thin stdio MCP layer and does not own the HTTP port.
- `/bridge/next` and `/bridge/result` remain unchanged for the existing CEP panel.
- `/tools` and `/tools/call` provide the adapter-facing HTTP API.
- Short polling was chosen for `/bridge/next` after live CEP testing exposed stale long-poll responses that could drop queued commands.
- AE result serialization is handled inside the injected ExtendScript wrapper so the bridge does not depend on `JSON.stringify` being available in the host.
