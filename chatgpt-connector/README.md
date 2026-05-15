# ChatGPT Connector

This module is a dependency-free Apps SDK/MCP HTTP server for exposing AE Agent bridge inspection tools and a local JSX Lab quarantine flow to ChatGPT custom connectors.

It is intentionally separate from the normal AE Agent provider system:

- ChatGPT is the model host.
- This server does not call OpenAI APIs, Codex CLI, OpenRouter, Gemini, Claude, or Ollama.
- Read-only project-inspection tool calls proxy to the existing local AE Agent bridge.
- JSX Lab candidate tools write/read only local ignored quarantine files.
- Raw ExtendScript execution, write/mutating AE bridge tools, provider chat, provider planning, and plan execution are not exposed.

## Local Start

```powershell
node .\chatgpt-connector\server.js
```

Defaults:

- MCP endpoint: `http://127.0.0.1:8787/mcp`
- Health endpoint: `http://127.0.0.1:8787/health`
- Bridge target: `http://127.0.0.1:3456`
- Bridge token: `AE_BRIDGE_TOKEN` or `codex-ae-local`

Optional environment variables:

- `AE_CHATGPT_CONNECTOR_HOST`
- `AE_CHATGPT_CONNECTOR_PORT`
- `AE_CHATGPT_CONNECTOR_BRIDGE_URL`
- `AE_CHATGPT_CONNECTOR_TOKEN`
- `AE_CHATGPT_CONNECTOR_TIMEOUT_MS`
- `AE_CHATGPT_CONNECTOR_BODY_LIMIT_BYTES`
- `AE_CHATGPT_CONNECTOR_CANDIDATE_DIR`
- `AE_CHATGPT_CONNECTOR_MAX_JSX_BYTES`

If `AE_CHATGPT_CONNECTOR_TOKEN` is set, requests must include either `Authorization: Bearer <token>` or `x-ae-chatgpt-connector-token: <token>`.

## ChatGPT Development Path

For local ChatGPT connector testing, expose only the `/mcp` endpoint through a temporary HTTPS tunnel, such as Cloudflare Tunnel, and use the tunnel URL as the connector URL.

Do not commit tunnel URLs, connector tokens, user secrets, or captured connector traffic.

## Exposed Tools

The connector exposes local connector tools:

- `get_connector_status`
- `propose_extendscript_candidate`
- `check_extendscript_candidate`

`propose_extendscript_candidate` saves raw JSX and redacted metadata under ignored `logs/solution-candidates/jsx-lab/`. `check_extendscript_candidate` runs offline syntax, size, static risk, path hygiene, and denylist checks for a saved candidate. Neither tool executes JSX, mutates AE, calls providers, or calls the bridge.

The connector also exposes a fixed read-only bridge allowlist:

- `get_project_info`
- `get_project_snapshot`
- `find_project_items`
- `list_comps`
- `list_layers`
- `get_comp_details`
- `get_layer_details`
- `list_effect_presets`
- `list_effects`
- `get_effect_details`
- `get_active_comp`
- `get_selected_layers`
- `get_selected_properties`
- `find_comps`
- `get_render_queue_status`

Every advertised bridge tool descriptor includes `annotations.readOnlyHint: true`, `destructiveHint: false`, and `openWorldHint: false`. `propose_extendscript_candidate` advertises `readOnlyHint:false` because it writes local quarantine files, but it is non-destructive and does not mutate AE.

## Offline Smoke

```powershell
node .\scripts\chatgpt-connector-smoke.js
```

The smoke starts the connector on a random local port, verifies MCP `initialize`, `tools/list`, bridge read-only annotations, blocked write/raw/provider tool exposure, local connector status, offline bridge error shaping, JSX Lab candidate save, redaction/path hygiene, static rejection, and non-mutating check reports. It does not require ChatGPT, a tunnel, After Effects, live providers, or AE mutations.
