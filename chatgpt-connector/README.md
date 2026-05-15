# ChatGPT Connector

This module is a dependency-free Apps SDK/MCP HTTP server for exposing AE Agent bridge inspection tools and a local JSX Lab quarantine flow to ChatGPT custom connectors.

It is intentionally separate from the normal AE Agent provider system:

- ChatGPT is the model host.
- This server does not call OpenAI APIs, Codex CLI, OpenRouter, Gemini, Claude, or Ollama.
- Read-only project-inspection tool calls proxy to the existing local AE Agent bridge.
- JSX Lab candidate tools write/read only local ignored quarantine files.
- `run_extendscript_candidate` is a gated wrapper, not a raw execution surface: it is disabled unless `AE_CHATGPT_CONNECTOR_WRITE_ACTIONS=1`, then runs only saved candidates through the bridge Agent plan runner with explicit confirmation, accepted static checks, hash confirmation, generated-prefix evidence, checkpoint/edit-session protection, and read-back calls.
- Raw `run_extendscript` / `run_extendscript_file`, general write/mutating AE bridge tools, provider chat, provider planning, and plan execution are not exposed as ChatGPT tools.

## Local Start

```powershell
node .\chatgpt-connector\server.js
```

Defaults:

- MCP endpoint: `http://127.0.0.1:8787/mcp`
- Health endpoint: `http://127.0.0.1:8787/health`
- Status endpoint: `http://127.0.0.1:8787/status`
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
- `AE_CHATGPT_CONNECTOR_SOLUTION_CANDIDATE_DIR`
- `AE_CHATGPT_CONNECTOR_PUBLIC_URL` or `AE_CHATGPT_CONNECTOR_TUNNEL_URL`
- `AE_CHATGPT_CONNECTOR_WRITE_ACTIONS=1` to enable gated candidate runs
- `AE_CHATGPT_CONNECTOR_EMERGENCY_DISABLE=1` to start with write actions blocked

If `AE_CHATGPT_CONNECTOR_TOKEN` is set, requests must include either `Authorization: Bearer <token>` or `x-ae-chatgpt-connector-token: <token>`.

## ChatGPT Development Path

For local ChatGPT connector testing, expose only the `/mcp` endpoint through a temporary HTTPS tunnel, such as Cloudflare Tunnel, and use the tunnel URL as the connector URL.

Do not commit tunnel URLs, connector tokens, user secrets, or captured connector traffic.

## Exposed Tools

The connector exposes local connector tools:

- `get_connector_status`
- `propose_extendscript_candidate`
- `check_extendscript_candidate`
- `run_extendscript_candidate`
- `promote_solution_candidate`

`propose_extendscript_candidate` saves raw JSX and redacted metadata under ignored `logs/solution-candidates/jsx-lab/`. `check_extendscript_candidate` runs offline syntax, size, static risk, path hygiene, and denylist checks for a saved candidate.

`run_extendscript_candidate` is disabled by default. With write actions enabled, it still requires `confirm:true`, `allowMutations:true`, `autoEditSession:true`, `confirmedJsxSha256`, `expectedGeneratedPrefix`, and read-back tool calls for real runs. The connector builds a one-step `run_extendscript_file` Agent plan and sends it to `/agents/plan/run` with `allowRawExtendscript:true`, so the bridge still owns checkpoint/edit-session protection and mutation verification.

`promote_solution_candidate` creates an ignored `solution-candidate-report.v1` artifact that can be reviewed with `scripts/solution-promotion-helper.js`. It never writes the tracked registry and does not allow direct candidate-to-tool promotion.

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

Every advertised bridge tool descriptor includes `annotations.readOnlyHint: true`, `destructiveHint: false`, and `openWorldHint: false`. Local quarantine, gated run, and promotion-hook tools advertise `readOnlyHint:false` because they write local artifacts or can request a gated AE mutation, but they remain non-destructive connector surfaces and do not expose raw bridge write tools directly.

## Offline Smoke

```powershell
node .\scripts\chatgpt-connector-smoke.js
```

The smoke starts the connector on random local ports, verifies MCP `initialize`, `tools/list`, bridge read-only annotations, blocked write/raw/provider tool exposure, local connector status, offline bridge error shaping, JSX Lab candidate save, redaction/path hygiene, static rejection, disabled write-action behavior, fake-bridge gated run payloads, emergency disable, and promotion hooks. It does not require ChatGPT, a tunnel, After Effects, live providers, or AE mutations.
