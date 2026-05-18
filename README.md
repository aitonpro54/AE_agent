# AE Agent

Local AI agent panel and MCP bridge for Adobe After Effects.

It has these main parts:

- `mcp-server/bridge-daemon.js` - a persistent local HTTP daemon that owns port `3456`, the AE panel queue, command IDs, results, logs, and backups.
- `mcp-server/mcp-adapter.js` - a dependency-free stdio MCP adapter that exposes tools to Codex and calls the daemon over HTTP.
- `chatgpt-connector/` - a dependency-free MCP HTTP connector for ChatGPT custom connector development with read-only bridge tools and local JSX Lab quarantine.
- `cep-panel/` - a CEP panel that runs inside After Effects, polls the local bridge, executes ExtendScript through `evalScript`, and posts results back.

`mcp-server/server.js` remains as a compatibility wrapper. By default it starts the MCP adapter; with `--bridge-only`, `--daemon`, or `AE_BRIDGE_ONLY=1`, it starts the daemon. The adapter auto-starts the daemon when the daemon is not already listening.

## Current MVP tools

- `get_bridge_status` - returns bridge diagnostics, connection state, paths, and recent events.
- `get_command_log` - returns recent local JSONL log events.
- `get_ai_agent_log` - returns recent AI provider chat attempts, preflight failures, and results.
- `get_project_intent_memory` - reads the local Project Intent Memory registry and optional prompt-matched hints.
- `update_project_intent_memory` - explicitly upserts or disables one reviewed Project Intent Memory entry after hygiene checks.
- `list_ai_agents` - lists configured OpenAI, Gemini, Claude, OpenRouter, Ollama, Ollama Cloud, and custom chat agents.
- `check_ai_agent_readiness` - preflights setup, provider reachability, and model availability before chat.
- `chat_with_ai_agent` - sends a prompt or chat messages to one configured AI provider.
- `plan_with_ai_agent` - drafts a structured, non-executing AE MCP plan from a user request.
- `validate_ai_agent_plan` - validates an AI-generated AE plan without executing it.
- `run_ai_agent_plan` - dry-runs or explicitly runs a validated AI plan with mutation gates.
- `start_edit_session` - starts one active safe edit session with an automatic checkpoint.
- `get_edit_session_status` - returns active session checkpoint and recorded mutation operations.
- `finish_edit_session` - finishes the active edit session without restoring or deleting its checkpoint.
- `list_edit_sessions` - lists recent sessions from the local edit session log.
- `backup_project_file` - copies the currently saved `.aep` into `backups/` without modifying the open project.
- `checkpoint_project` - creates a named checkpoint copy of the currently saved `.aep`.
- `list_project_checkpoints` - lists checkpoint `.aep` files in `backups/`.
- `get_project_checkpoint_details` - validates and returns metadata for one checkpoint file.
- `delete_project_checkpoint` - deletes one checkpoint file from `backups/` with explicit confirmation.
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
- `align_layers_to_time` - aligns selected or specified layer timing to the current time indicator or a target time.
- `set_comp_work_area` - sets the active or specified comp work area.
- `set_layer_time_range` - sets selected or specified layer start/in/out/duration timing.
- `stagger_layers` - sequences layers by order, gap, and overlap.
- `split_layers_at_time` - splits selected or specified layers at the CTI or target time.
- `precompose_layers` - precomposes explicit layers into a new composition.
- `replace_layer_source` - swaps layer sources while preserving transforms.
- `rename_layers` - renames selected or specified layers with exact, prefix, suffix, or find-replace modes.
- `rename_project_items` - renames project items by explicit indexes or scoped search.
- `update_text_layer` - updates Source Text and common TextDocument fields.
- `create_shape_layer` - creates a rectangle or ellipse shape layer.
- `fit_layer_to_comp` - scales layers to contain, cover, or stretch to the comp.
- `set_property_keyframes` - sets explicit keyframes on a layer property.
- `apply_keyframe_ease` - applies temporal easing to selected or explicit keyframes.
- `set_expression` - applies an expression to any expression-capable property.
- `clear_expression` - removes an expression from any expression-capable property.
- `add_comp_to_render_queue` - adds a comp to the render queue.
- `set_render_queue_output` - sets output path and templates for a render queue item.
- `get_render_queue_status` - returns compact render queue item status.
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

Optional AI agent variables:

```powershell
$env:OPENAI_API_KEY="sk-..."
$env:OPENAI_MODEL="gpt-5.5"

$env:CODEX_CLI_MODEL="gpt-5.5"

$env:GEMINI_API_KEY="..."
$env:GEMINI_MODEL="gemini-2.5-flash"

$env:ANTHROPIC_API_KEY="..."
$env:CLAUDE_MODEL="claude-sonnet-4-20250514"

$env:OPENROUTER_API_KEY="sk-or-..."
$env:OPENROUTER_MODEL="nvidia/nemotron-3-super-120b-a12b:free"

$env:OLLAMA_BASE_URL="http://127.0.0.1:11434"
$env:OLLAMA_MODEL="gemma4:latest"

$env:OLLAMA_CLOUD_BASE_URL="https://your-ollama-cloud-compatible-v1-endpoint"
$env:OLLAMA_CLOUD_API_KEY="..."
$env:OLLAMA_CLOUD_MODEL="..."
```

OpenAI has two separate paths. `openai-api` uses `OPENAI_API_KEY` and normal OpenAI API billing. `openai-cli` uses the local Codex CLI and the user's ChatGPT/Codex sign-in; use the panel's `Sign in with ChatGPT` button or run `codex login`, then the bridge can call `codex exec --ephemeral --json --sandbox read-only` for CLI-backed chat and AE Plan drafting. After launching sign-in from the panel, the panel refreshes readiness automatically for a short window. No OpenAI API key is used for the CLI path. On Windows, if the bridge process cannot resolve `codex` through its PATH, it also checks the Codex Desktop local install at `%LOCALAPPDATA%\OpenAI\Codex\bin\codex.exe`; set `CODEX_CLI_PATH` for custom installs.

`gemini-api` uses `GEMINI_API_KEY` with Google's Gemini `generateContent` REST endpoint. `claude-api` uses `ANTHROPIC_API_KEY` with Anthropic's Messages API. These are provider API billing paths, not ChatGPT subscription access.

`OPENROUTER_MODEL` can be any OpenRouter model id, a `:free` variant, or the `openrouter/free` router. The default is `nvidia/nemotron-3-super-120b-a12b:free`, chosen from OpenRouter's May 2026 top free model list for agentic/coding workflows. Local Ollama defaults to `gemma4:latest`, uses `/api/chat`, and lists installed models from `/api/tags`. Ollama Cloud and custom providers use OpenAI-compatible `/chat/completions` and `/models` endpoints.

You can also paste OpenAI API, Gemini, Claude, OpenRouter, or Ollama Cloud keys directly into the After Effects panel under the provider API mode and click `Save`. The bridge stores keys locally in `.codex\agent-secrets.json`; that folder is ignored by git. For isolated validation, set `AE_AGENT_SECRETS_FILE` to point the bridge at a temporary secrets file.

Custom agents can be provided as JSON:

```powershell
$env:AE_AGENT_PROVIDERS_JSON='[{"id":"studio-router","label":"Studio Router","apiStyle":"openai","baseUrl":"https://example.test/v1","apiKeyEnv":"STUDIO_ROUTER_KEY","model":"my-model","requiresApiKey":true}]'
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

In this state the panel shows `Bridge offline` with a short recovery hint instead of raw browser transport errors such as `HTTP 0`.

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
Window > Extensions > AE Agent 1.0.10
```

For the local development install script:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-cep-panel.ps1
```

For incremental repo-versus-installed checks:

```powershell
node .\scripts\cep-sync-health.js --check
node .\scripts\cep-sync-health.js --sync --check
```

The health command is read-only unless `--sync` or `--clear-cache` is provided. `--sync` copies only missing or different tracked CEP files: `index.html`, `panel.js`, `style.css`, and `CSXS/manifest.xml`, then clears only this extension's CEP `Cache`, `Code Cache`, `GPUCache`, and `blob_storage` directories while preserving Local Storage. The PowerShell installer also supports `-SyncOnly` to use the same safe sync helper without rerunning the full install/debug-registry setup.

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

## ChatGPT connector

`chatgpt-connector/server.js` exposes a local `/mcp` endpoint intended for ChatGPT custom connector development through a temporary HTTPS tunnel such as Cloudflare Tunnel.

This connector is intentionally not another AI provider. It does not call OpenAI APIs itself; ChatGPT is the model host, and the connector exposes a fixed read-only allowlist of bridge proxy tools with `readOnlyHint:true` annotations.

The connector also exposes a local JSX Lab quarantine and gated-run flow:

- `propose_extendscript_candidate` saves candidate metadata plus raw JSX under ignored `logs/solution-candidates/jsx-lab/`.
- `check_extendscript_candidate` runs offline syntax, size, static risk, and denylist checks for a saved candidate.
- `run_extendscript_candidate` is opt-in disabled by default. When `AE_CHATGPT_CONNECTOR_WRITE_ACTIONS=1` is set, it still only runs saved candidates through the bridge Agent plan runner with explicit confirmation, accepted static checks, hash confirmation, generated-prefix evidence, checkpoint/edit-session protection and read-back calls.
- `promote_solution_candidate` writes an ignored Solution Library candidate report for human review; it does not write `registry/solutions.json` and blocks direct candidate-to-tool promotion.

The connector never exposes raw `run_extendscript` / `run_extendscript_file` as ChatGPT tools. General write/mutating AE bridge tools, provider chat, provider planning, and plan execution remain unavailable from the connector. The CEP panel shows a compact ChatGPT Connector status card for local/tunnel state, exposed tools, last tool call, write-action state and emergency write disable.

Local start:

```powershell
node .\chatgpt-connector\server.js
```

Offline validation:

```powershell
node .\scripts\chatgpt-connector-smoke.js
```

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

Prompt Optimization payload coverage:

```powershell
node .\scripts\prompt-optimization-smoke.js
```

Solution Library registry and metadata coverage:

```powershell
node .\scripts\solution-registry-smoke.js
```

Solution candidate quarantine report coverage:

```powershell
node .\scripts\solution-candidate-report-smoke.js
```

Solution promotion validation coverage:

```powershell
node .\scripts\solution-promotion-smoke.js
```

Solution planner retrieval coverage:

```powershell
node .\scripts\solution-retrieval-smoke.js
```

Solution library seeded-entry and retrieval-bound validation:

```powershell
node .\scripts\solution-library-validation-smoke.js
```

Project Intent Memory contract, retrieval, update and hygiene coverage:

```powershell
node .\scripts\project-intent-memory-smoke.js
```

Plan confidence/risk classification coverage:

```powershell
node .\scripts\plan-classification-smoke.js
```

Bounded Agent plan repair coverage:

```powershell
node .\scripts\plan-repair-smoke.js
```

Agent-run semantic verification coverage:

```powershell
node .\scripts\semantic-verification-smoke.js
```

Reliability validation suite:

```powershell
node .\scripts\reliability-validation-suite.js list
node .\scripts\reliability-validation-suite.js local
node .\scripts\reliability-validation-suite.js provider-readiness
node .\scripts\reliability-validation-suite.js read-only-live
node .\scripts\reliability-validation-suite.js external-provider --allow-external-provider
node .\scripts\reliability-validation-suite.js mutating-live --allow-mutating-live
```

`local` runs the cheap offline corpus, provider fakes, repair/classification/semantic checks, Solution Library checks, and local daemon smokes. `provider-readiness` queries the live bridge with `checkModels=0`, so it reports setup state without external model-list calls. `read-only-live` requires the installed CEP panel/CDP target and does not mutate the AE project. `external-provider` and `mutating-live` stay explicit-approval paths because they can send prompts/project context to providers or mutate generated live AE items.

ChatGPT connector read-only MCP and JSX Lab quarantine coverage:

```powershell
node .\scripts\chatgpt-connector-smoke.js
```

Targeted live CEP status-card smoke with fake connector data:

```powershell
node .\scripts\cep-panel-cdp-smoke.js connector-status-smoke
```

Gemini and Claude provider API contract coverage:

```powershell
node .\scripts\provider-api-smoke.js
```

Live Gemini/Claude API key save smoke, using a temporary bridge and temporary secret file:

```powershell
node .\scripts\provider-key-save-smoke.js
```

Live CEP panel smoke, with After Effects open and the bridge panel loaded:

```powershell
node .\scripts\cep-panel-cdp-smoke.js smoke
```

Live mutating Safe Run smoke, using only temporary `Codex Test Safe Run` items:

```powershell
node .\scripts\cep-panel-cdp-smoke.js mutating-smoke
```

Manual MCP tool call, with the daemon already running:

```powershell
node .\scripts\mcp-call-tool.js get_bridge_status
```

Agent calls:

```powershell
node .\scripts\mcp-call-tool.js list_ai_agents

$env:MCP_CALL_ARGS_JSON='{"agentId":"gemini-api","model":"gemini-2.5-flash"}'
node .\scripts\mcp-call-tool.js check_ai_agent_readiness
Remove-Item Env:MCP_CALL_ARGS_JSON

$env:MCP_CALL_ARGS_JSON='{"agentId":"claude-api","model":"claude-sonnet-4-20250514"}'
node .\scripts\mcp-call-tool.js check_ai_agent_readiness
Remove-Item Env:MCP_CALL_ARGS_JSON

$env:MCP_CALL_ARGS_JSON='{"agentId":"ollama-local","model":"llama3.2"}'
node .\scripts\mcp-call-tool.js check_ai_agent_readiness
Remove-Item Env:MCP_CALL_ARGS_JSON

$env:MCP_CALL_ARGS_JSON='{"agentId":"openrouter","model":"nvidia/nemotron-3-super-120b-a12b:free","prompt":"Suggest three title animation ideas."}'
node .\scripts\mcp-call-tool.js chat_with_ai_agent
Remove-Item Env:MCP_CALL_ARGS_JSON

$env:MCP_CALL_ARGS_JSON='{"agentId":"openrouter","model":"nvidia/nemotron-3-super-120b-a12b:free","prompt":"Create a safe plan for adding a title layer to the active comp."}'
node .\scripts\mcp-call-tool.js plan_with_ai_agent
Remove-Item Env:MCP_CALL_ARGS_JSON

$env:MCP_CALL_ARGS_JSON='{"plan":{"summary":"Add a title","steps":[{"title":"Create text","tool":"create_text_layer","args":{"text":"Title"}}]}}'
node .\scripts\mcp-call-tool.js validate_ai_agent_plan
Remove-Item Env:MCP_CALL_ARGS_JSON

$env:MCP_CALL_ARGS_JSON='{"dryRun":true,"plan":{"summary":"Add a title","steps":[{"title":"Create text","tool":"create_text_layer","args":{"text":"Title"}}]}}'
node .\scripts\mcp-call-tool.js run_ai_agent_plan
Remove-Item Env:MCP_CALL_ARGS_JSON

node .\scripts\mcp-call-tool.js get_ai_agent_log
```

The After Effects panel also includes an AE Agent provider area and Chat/Agent/Agent Hardcore composer. Provider tabs expose Gemini, OpenAI, Claude, OpenRouter, and Local/Ollama in the main UI. Gemini, Claude, and OpenRouter use provider API keys; OpenAI API mode uses an OpenAI API key; OpenAI CLI mode uses the panel's `Sign in with ChatGPT` action plus `codex exec` for ChatGPT/Codex subscription-backed calls. `Agent` mode asks the selected model for a structured MCP step draft, gives the model a compact catalog of real bridge tools and required fields, repairs malformed JSON once when needed, and validates the plan against bridge tools, required args, mutating step counts, and safety fields. Russian/Cyrillic requests are treated as normal user input. The panel can dry-run the last ordinary Agent plan. Real ordinary Agent execution is a separate confirmed action; mutating runs require explicit mutation permission, idempotency fields, and checkpoint/edit-session protection. From v0.25, the panel sends `autoEditSession:true` for confirmed mutating runs, so the backend creates a protected edit session/checkpoint before the first mutation when the project has been saved; unsaved projects are blocked before changing AE. From v0.26, the Agent area shows provider/model/readiness details, can re-check the selected model on demand, keeps local multi-chat history with `New Chat` and history switching, and supports a Prompt Optimization toggle. From v1.0.7, `Agent Hardcore` is a full autopilot entry point: the composer send button calls `/agents/hardcore/run`. From v1.0.10, Hardcore runs as owner mode with xhigh reasoning, keeps `Dry run` / `Run plan` controls visible for the latest plan, reports a local five-hour task-window and context estimate after operations, marks failed TypedTools with a Codex App start prompt, and may continue the AE task through a narrow raw ExtendScript fallback after the normal dry-run gate. The visible product title is `AE Agent 1.0.10` in the native CEP title/menu only, the panel `Reload` action forces a cache-busted reload of the current installed `index.html` and JS/CSS assets, and sync/install clears this extension's CEP cache while preserving Local Storage so stale open panels can pick up the current installed bundle; duplicate in-panel product title rows remain removed.

When an Agent plan or run shows a real typed-tool gap, the panel exposes `Prepare typed tool request`. This writes a local ignored bundle under `logs/dev-requests/<id>/` with `request.md`, compact `ae-evidence.json`, a targeted `start-prompt.md`, and `candidate.jsx` when a raw ExtendScript workaround exists. The bundle is redacted for provider secrets and local project paths, and it is meant to be opened in Codex App as a narrow dev handoff instead of turning the AE chat into a long repository-development thread. The panel does not auto-create a new Codex App chat in v1; after the bundle is created, open a new Codex App chat in this project and start from the generated `start-prompt.md`.

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

Inspect a checkpoint:

```powershell
Invoke-RestMethod `
  -Method Post `
  -ContentType "application/json" `
  -Uri "http://127.0.0.1:3456/dev/tool/get_project_checkpoint_details?token=codex-ae-local" `
  -Body '{"checkpointFile":"My_Project-checkpoint-before-title-pass-2026-05-05T18-30-00-000Z.aep"}'
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

Delete a checkpoint:

```powershell
Invoke-RestMethod `
  -Method Post `
  -ContentType "application/json" `
  -Uri "http://127.0.0.1:3456/dev/tool/delete_project_checkpoint?token=codex-ae-local" `
  -Body '{"checkpointFile":"My_Project-checkpoint-before-title-pass-2026-05-05T18-30-00-000Z.aep","confirm":true}'
```

`delete_project_checkpoint` only accepts `.aep` checkpoint files inside `backups/` and requires `confirm:true`.

Mutating tools can opt in to a preflight checkpoint:

```powershell
Invoke-RestMethod `
  -Method Post `
  -ContentType "application/json" `
  -Uri "http://127.0.0.1:3456/dev/tool/create_text_layer?token=codex-ae-local" `
  -Body '{"text":"Checkpointed title","checkpointLabel":"before-title-layer"}'
```

Any mutating tool can use either `checkpointLabel` or `autoCheckpoint:true`. The checkpoint is created before the project-changing operation and is included in the tool result. This remains opt-in so routine inspection and tiny test calls do not create extra `.aep` files.

Successful mutating tool responses also include a `mutation` summary with `tool`, `changed`, `target`, optional `checkpoint`, and an `undoHint`. By default they also include a `verification` snapshot read back from After Effects after the mutation, including project state, target comp/layer details, and a duplicate-name warning when a created layer name appears more than once. Pass `verifyAfter:false` to skip the extra readback for low-risk operations.

For retry-safe agent workflows, pass `idempotencyKey` on mutating tools. Reusing the same `idempotencyKey`, `idempotencyScope`, tool name, and arguments returns the first successful result without running the AE mutation a second time; reusing the same key with different arguments fails fast.

Safe edit sessions group project-changing operations under one task-level checkpoint:

```powershell
Invoke-RestMethod `
  -Method Post `
  -ContentType "application/json" `
  -Uri "http://127.0.0.1:3456/dev/tool/start_edit_session?token=codex-ae-local" `
  -Body '{"label":"title cleanup","notes":"Group title layer edits under one checkpoint."}'
```

Only one edit session can be active. Starting a session creates a checkpoint first; if the current project is unsaved or the checkpoint cannot be created, the session does not start.

While a session is active, successful and failed project-changing tool calls are recorded in `logs\edit-session-active.json` and lifecycle events are appended to `logs\edit-sessions.jsonl`. Read-only tools are not recorded as operations.

Check status or finish the session:

```powershell
Invoke-RestMethod `
  -Uri "http://127.0.0.1:3456/dev/tool/get_edit_session_status?token=codex-ae-local"

Invoke-RestMethod `
  -Method Post `
  -ContentType "application/json" `
  -Uri "http://127.0.0.1:3456/dev/tool/finish_edit_session?token=codex-ae-local" `
  -Body '{"outcome":"completed","summary":"Finished the title cleanup pass."}'
```

## Security note

Enabling CEP `PlayerDebugMode` allows unsigned CEP panels to load for the selected Adobe CEP runtime versions. That is convenient for local development, but it is a real trust setting. Only install panels from local code you control, and turn it off later if you want a stricter Adobe extension setup.

## Reliability notes

This MVP intentionally uses a simple HTTP polling bridge instead of WebSocket dependencies. That makes the first version easier to install and inspect. The tradeoff is that long-running scripts still depend on After Effects staying responsive while `evalScript` runs.

Keep scripts small while testing. Once the bridge is stable, add safer higher-level tools instead of sending large arbitrary scripts every time.
