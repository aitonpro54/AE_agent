# M100 execution surface inventory

Date: 2026-05-19

Scope: Patch 0 safety inventory for every reviewed path that can reach After Effects execution or influence executable AE action state. This inventory is intentionally non-live: no CEP panel, After Effects, external provider, or mutating validation was run to produce it.

## Patch 0 summary

- The shared AE execution core is still `runExtendScriptBody()` -> `enqueueAeCommand()` -> `/bridge/next` -> CEP `evalScript()` -> `/bridge/result`.
- Patch 0 adds a minimal M100 risk policy in `mcp-server/bridge-daemon.js` with the levels `read_only`, `mutating`, `destructive`, and `raw_jsx`.
- Direct `/tools/call` and MCP `tools/call` now fail closed for unknown, mutating, destructive, and raw JSX tools before queueing AE commands. Client-supplied `confirm:true` or `confirmed:true` is recorded as ignored and is not an execution authority.
- `/dev/tool/:name` remains a local-dev/admin route, not the M100 user-safe path. It is inventoried separately and must not be represented as normal user confirmation.
- `/agents/plan/run` remains the primary protected runner until the later server-owned proposal/confirmation registry exists.

## Execution core

| Surface | Current code | Path to AE | Patch 0 policy | Remaining work |
| --- | --- | --- | --- | --- |
| AE queue creation | `mcp-server/bridge-daemon.js:1916` `enqueueAeCommand()` | Stores `{ id, script }` in `pendingCommands` and tracks a promise in `inflightCommands`. | No lifecycle rewrite in Patch 0. | Patch 1a must split `queued`, `leased`, `submitted`, timeout, and stale-result states. |
| Waiting panel drain | `mcp-server/bridge-daemon.js:1901` `drainWaitingPanels()` | Returns the next pending command to a long-polling panel. | Inventory only. | Patch 1a must skip expired `queued` commands before delivery. |
| Wrapped AE body | `mcp-server/bridge-daemon.js:2003` `runExtendScriptBody()` | Wraps JSX and queues it through `enqueueAeCommand()`. | Direct raw calls are blocked before this function on `/tools/call`/MCP. | Patch 1b must make empty/malformed wrapper output a strict failure instead of raw success. |
| CEP execution | `cep-panel/panel.js:3125` and `cep-panel/panel.js:3152` | `poll()` gets `/bridge/next`; `executeCommand()` calls `cs.evalScript()` and posts `/bridge/result`. | Inventory only. | Patch 1a/1b must add truthful lease/submit semantics and single-flight `evalScript`. |

## User and tool entry points

| Entry point | Current code | Gate today | Patch 0 status | Remaining work |
| --- | --- | --- | --- | --- |
| `/agents/plan/run` | `mcp-server/bridge-daemon.js:5247`, `runValidatedAgentPlan()` at `mcp-server/bridge-daemon.js:4453` | Plan validation, `confirm:true`, `allowMutations:true`, edit-session/checkpoint protection, raw JSX dry-run gate. | Left open as the safer existing product runner. | Patch 2/3 must move real execution behind server-owned action proposals and single-use confirmation. |
| CEP manual plan run | `cep-panel/panel.js:2968` `runLastPlan()` -> `/agents/plan/run` | CEP sends dry-run first; real run sends confirmation and raw dry-run id only when gate is ready. | Left open through existing runner gates. | Patch 2 must stop rendering executable controls from legacy `result.plan`. |
| Agent Hardcore HTTP | `mcp-server/bridge-daemon.js:5265` -> `runAgentHardcoreSession()` | Owner mode internally dry-runs/runs through `runValidatedAgentPlan()`. | HTTP route remains open through existing runner gates. Direct MCP tool invocation is now risk-classified as mutating. | Patch 2/3 must normalize Hardcore proposals through the same server-owned registry. |
| Direct `/tools/call` | `mcp-server/bridge-daemon.js:5314` -> `callToolLogged("direct-tools-call", ...)` | Previously called any tool directly through `callTool()`. | Default-deny now blocks unknown, mutating, destructive, and raw JSX tools with `proposal_required` or `unknown_tool_blocked`. Read-only tools remain callable. | Patch 3 must replace blocking with server-created proposals where appropriate. |
| MCP `tools/call` | `mcp-server/mcp-adapter.js:164` proxies to `/tools/call`; JSON-RPC dispatch at `mcp-server/mcp-adapter.js:200` | Previously inherited direct daemon behavior. | Inherits the same default-deny block from `/tools/call`; client confirmation fields are ignored. | Patch 3 must avoid any MCP path accepting client-authored executable confirmation. |
| Local `/dev/tool/:name` | `mcp-server/bridge-daemon.js:5337` -> `callToolLogged("dev-http", ...)` | Token-protected local dev/admin surface. | Not part of the M100 user-safe path; left available as the explicit local-dev/admin escape hatch. | Future work should keep logs/labeling clear and avoid surfacing this as normal user confirmation. |
| `/bridge/next` | `mcp-server/bridge-daemon.js:5404` | Token-protected panel polling; shifts from `pendingCommands`. | Inventory only. | Patch 1a must lease commands to a panel connection/generation and skip expired queued commands. |
| `/bridge/result` | `mcp-server/bridge-daemon.js:5429` | Token-protected result post; resolves/rejects inflight command by id. | Inventory only. | Patch 1a must record stale/late results without mutating active UI state. |

## Raw JSX and typed mutating tools

| Tool group | Current code | Patch 0 status | Remaining work |
| --- | --- | --- | --- |
| `run_extendscript` / `run_extendscript_file` schemas | `mcp-server/bridge-daemon.js:5996` and `mcp-server/bridge-daemon.js:6014` | Listed as `raw_jsx` in the M100 risk policy. | Patch 3 must require server-owned proposal/confirmation before user-safe execution. |
| `run_extendscript` / `run_extendscript_file` execution | `mcp-server/bridge-daemon.js:8118` and `mcp-server/bridge-daemon.js:8123` | Direct `/tools/call` and MCP paths are blocked before reaching these branches. Existing plan-run raw dry-run gate remains. | Patch 1b must make wrapper parse failures strict; Patch 3 must unify confirmation. |
| Mutating typed tools | `MUTATING_TOOL_NAMES` in `mcp-server/bridge-daemon.js:824` | Direct `/tools/call` and MCP paths are `mutating` and blocked by default. | Patch 3 can route selected typed mutating calls through proposal creation instead of direct execution. |
| Destructive tools | `cleanup_test_items` and `delete_project_checkpoint` in the M100 policy | Direct `/tools/call` and MCP paths are `destructive` and blocked by default. | Destructive proposal copy must be especially explicit and expiry-bound. |
| Unknown tools | M100 policy `known:false` branch | Direct `/tools/call` and MCP paths return `unknown_tool_blocked` before `callTool()`. | The registry should become the canonical source of known action kinds in Patch 2/3. |

## Candidate, dev, and connector flows

| Flow | Current code | Gate today | Patch 0 status | Remaining work |
| --- | --- | --- | --- | --- |
| Agent dev request raw candidate file | `mcp-server/bridge-daemon.js:4195` and `mcp-server/bridge-daemon.js:4270` | Captures raw workaround candidates into ignored dev-request bundles; does not execute them directly. | Inventory only. | Must stay as handoff evidence, not executable proposal state. |
| ChatGPT connector read-only bridge tools | `chatgpt-connector/server.js:28`, `callBridgeTool()` at `chatgpt-connector/server.js:642` | Fixed read-only allowlist only. | Read-only `/tools/call` remains available, so these calls still work. | Keep write/raw bridge tools out of the connector allowlist. |
| ChatGPT connector JSX Lab proposal | `chatgpt-connector/server.js:190`, `chatgpt-connector/jsx-lab.js:337` | Saves candidate metadata/JSX in ignored quarantine; no bridge AE execution. | Inventory only. | Candidate metadata remains candidate-only, not trusted action proposal. |
| ChatGPT connector JSX Lab run | `chatgpt-connector/server.js:652` and `chatgpt-connector/server.js:699`; payload built in `chatgpt-connector/jsx-lab.js:651` | Disabled unless `AE_CHATGPT_CONNECTOR_WRITE_ACTIONS=1`; then uses `/agents/plan/run`, static hash confirmation, generated-prefix evidence, dry-run first, `allowRawExtendscript:true` only for protected run. | Left open because it routes through the protected runner, not direct `/tools/call run_extendscript_file`. | Patch 3 must bind it to the same server-owned proposal/confirmation semantics. |
| Promotion hook | `chatgpt-connector/server.js:263` and `chatgpt-connector/jsx-lab.js:756` | Writes ignored candidate report only; does not promote directly to tracked tool. | Inventory only. | No M100 execution change needed unless promotion starts creating executable proposals. |

## Legacy UI control surface

| Surface | Current code | Risk | Patch 0 status | Remaining work |
| --- | --- | --- | --- | --- |
| Inline plan controls from `result.plan` | `cep-panel/panel.js:1469` `appendInlinePlanActions()` | Controls are still inferred from plan-shaped agent results. | Captured as a pending protocol contract in `scripts/m100-protocol-contract-smoke.js`. | Patch 2 must render executable controls only from backend-created `messageType:"action_proposal"`. |
| Transcript/localStorage restore | `cep-panel/panel.js:1660`, `cep-panel/panel.js:1816`, `cep-panel/panel.js:1853` | Restored legacy `planResult` can regain controls. | Captured as a pending protocol contract. | Patch 2 must hard-disable restored legacy executable controls. |
| New Agent plan result | `cep-panel/panel.js:2380` and `cep-panel/panel.js:3107` | Live plan-shaped responses still become plan actions. | Inventory only. | Patch 2 must separate assistant text, candidate proposal, canonical proposal, result, and error envelopes. |

## Patch 0 decisions

- Default-deny applies to direct `/tools/call` and MCP `tools/call`, because both are direct tool invocation surfaces and neither currently owns a server-side proposal record.
- `/agents/plan/run` is not blocked in Patch 0 because it is the existing validated runner and is needed by CEP, Hardcore, and ChatGPT connector gated candidate flows. Its current confirmation is still not the final M100 confirmation model.
- `/dev/tool/:name` remains available for local smoke/development work, but it is documented as an admin escape hatch, not as a user-safe confirmation path.
- The new M100 smoke scripts run without live CEP/After Effects. They verify Patch 0 direct default-deny behavior and list later queue/protocol contracts as pending unless run with strict mode.

## Known pending contracts after Patch 0

- AE command lifecycle states are not implemented yet.
- Pre-delivery expiry still needs a non-execution guarantee.
- Leased/submitted timeouts still need unknown/stale user-facing semantics.
- Late `/bridge/result` payloads still need stale handling.
- CEP/backend single-flight `evalScript` is not implemented yet.
- Empty/malformed wrapped host output still needs strict failure handling.
- Server-owned `action_proposal`, payload store, hashes, expiry, confirmation token hash, replay rejection, and payload mismatch rejection are not implemented yet.
- Legacy `result.plan` executable control rendering is still present and must be removed or hard-disabled in Patch 2.
