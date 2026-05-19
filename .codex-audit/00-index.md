# 00 Project Index

## Repository snapshot
- branch: `codex/roadmap-1.3-planning...origin/codex/roadmap-1.3-planning` (`ahead 4`)
- git status: before this audit note, `AGENTS.md` and `registry/project-intent-memory.json` were already modified
- package manager: none detected; no `package.json`, `package-lock.json`, `pnpm-lock.yaml`, or `yarn.lock` found in the light scan
- likely app type: local Adobe After Effects CEP panel plus Node HTTP/MCP bridge daemon, ChatGPT connector, standalone smoke scripts, and ExtendScript bridge probes
- build/test scripts found: standalone scripts under `scripts/`, including `install-cep-panel.ps1`, `start-bridge-only.ps1`, `bridge-only-smoke-test.js`, `cep-panel-cdp-smoke.js`, `chatgpt-connector-smoke.js`, `provider-*-smoke.js`, `solution-*-smoke.js`, `semantic-verification-smoke.js`, `reliability-validation-suite-smoke.js`, and `smoke-test.js`

## Top-level structure

```text
.
├─ .codex/
├─ .codex-audit/
├─ backups/
├─ cep-panel/
│  ├─ CSXS/manifest.xml
│  ├─ lib/
│  ├─ index.html
│  ├─ panel.js
│  └─ style.css
├─ chatgpt-connector/
│  ├─ README.md
│  ├─ jsx-lab.js
│  └─ server.js
├─ docs/
├─ logs/
├─ mcp-server/
│  ├─ ai-agents.js
│  ├─ bridge-daemon.js
│  ├─ mcp-adapter.js
│  └─ server.js
├─ plans/
├─ recipes/
├─ registry/
├─ scripts/
│  └─ solutions/
├─ snapshots/
├─ specs/
├─ AGENTS.md
├─ README.md
├─ RELEASES.md
└─ mcp-config.example.json
```

## Candidate runtime areas

### CEP panel UI
- files: `cep-panel/index.html`, `cep-panel/panel.js`, `cep-panel/style.css`, `cep-panel/CSXS/manifest.xml`, `cep-panel/.debug`, `cep-panel/lib/CSInterface.js`
- confidence: high
- why relevant: `index.html` defines the panel surface and loads cache-busted CSS/JS; `panel.js` owns connection state, provider UI, chat/agent/hardcore flows, localStorage history, polling, dry-run/run controls, and connector status; the CSXS manifest defines the AE CEP panel identity and window geometry.

### After Effects bridge
- files: `mcp-server/bridge-daemon.js`, `mcp-server/mcp-adapter.js`, `mcp-server/server.js`, `mcp-config.example.json`, `scripts/ae-file-smoke.jsx`, `scripts/bridge-only-smoke-test.js`, `scripts/start-bridge-only.ps1`
- confidence: high
- why relevant: `bridge-daemon.js` exposes `/health`, `/bridge/next`, `/bridge/result`, `/tools`, `/tools/call`, and Agent endpoints; it queues AE commands and receives panel results. `mcp-adapter.js` is the Codex MCP entrypoint shown in `mcp-config.example.json`.

### Codex / agent bridge
- files: `mcp-server/ai-agents.js`, `mcp-server/bridge-daemon.js`, `chatgpt-connector/server.js`, `chatgpt-connector/jsx-lab.js`, `scripts/chatgpt-connector-smoke.js`
- confidence: high
- why relevant: `ai-agents.js` contains Codex CLI detection/login readiness and runs `codex exec --ephemeral --json --sandbox read-only`; `bridge-daemon.js` wraps chat, plan, hardcore, validation, run, and dev-request endpoints; `chatgpt-connector` exposes a separate read-only/gated connector surface.

### Agent instructions / prompts
- files: `AGENTS.md`, `specs/target-app.md`, `plans/target-app-execplan.md`, `mcp-server/bridge-daemon.js`, `cep-panel/panel.js`
- confidence: high
- why relevant: the target spec defines the intended thin-panel/thick-daemon architecture and CLI/API provider split; the execution plan records many completed Agent milestones; backend planning prompts and frontend workflow presets shape what the agent actually attempts.

### Logging / errors
- files: `mcp-server/bridge-daemon.js`, `mcp-server/ai-agents.js`, `chatgpt-connector/server.js`, `cep-panel/panel.js`, `logs/`
- confidence: medium-high
- why relevant: backend logs are written to `logs/bridge-events.jsonl`, `logs/ai-agent-chats.jsonl`, `logs/edit-sessions.jsonl`, and `logs/idempotency-results.jsonl`; the panel has its own visible activity log and error shaping; connector status/error reporting is separate. Log contents were not inspected in this phase.

### Tests / QA
- files: `scripts/cep-panel-cdp-smoke.js`, `scripts/provider-key-save-smoke.js`, `scripts/bridge-only-smoke-test.js`, `scripts/chatgpt-connector-smoke.js`, `scripts/provider-api-smoke.js`, `scripts/provider-contract-smoke.js`, `scripts/solution-*.js`, `scripts/semantic-verification-smoke.js`, `scripts/reliability-validation-suite-smoke.js`, `scripts/smoke-test.js`
- confidence: high
- why relevant: the repository appears to rely on standalone Node smoke scripts rather than package-manager scripts. Several smokes directly target CEP panel behavior, provider readiness, connector status, bridge-only operation, planning, validation, and execution gates.

## Initial hypotheses

- `cep-panel/panel.js` is a large single runtime surface with many shared flags (`chatInFlight`, `pollInFlight`, `agentsLoadInFlight`, `lastPlanResult`, `lastAcceptedDryRun`, `planRunInFlightMode`), so perceived instability may come from UI state races or stale state after reconnect/reload.
- Agent chat/plan/hardcore requests use a 120-second panel timeout, while provider calls and Codex CLI calls can plausibly exceed or fail inside that window; failures may collapse into generic bridge/offline UX.
- The bridge uses CEP polling through `/bridge/next` and `/bridge/result`; if the panel reloads, goes stale, or keeps an old cached `panel.js`, AE command delivery can appear connected but not actually productive.
- The OpenAI CLI path depends on `codex --version`, `codex login status`, spawned login, JSONL parsing, model selection, and read-only sandbox execution; any mismatch in CLI behavior can make the agent workflow feel broken while the panel itself is online.
- Dry-run/run gating depends on current plan identity, request id, plan key, raw ExtendScript approval, validation state, and button enablement; recovered or edited plans may easily become non-runnable from the user's perspective.
- Chat/session state is persisted in `localStorage` and normalized/truncated; agent context inside the panel may be shorter or less continuous than the user expects from Codex App.
- Provider setup, connector status, bridge status, and AE command status are separate health models; mixed green/red states can make the panel feel inconsistent unless the UI correlates them clearly.
- Backend logging seems richer than panel logging; if the panel only surfaces compact error messages, users may not see the true failing subsystem without opening dev logs.
- Encoding/cache remains worth a narrow check: terminal output displayed some Cyrillic as mojibake, while the plan claims active source checks passed, so actual installed CEP rendering should be verified rather than assumed.

## Recommended next audit phases

- Phase 1: CEP startup, cache-busted reload, and connect flow. Check `index.html`, `manifest.xml`, `.debug`, `reloadApp`, `connect`, `disconnect`, saved bridge URL/token, and installed-panel sync assumptions.
- Phase 2: Panel-to-bridge AE command flow. Trace only `/bridge/next`, `/bridge/result`, `poll`, `runExtendScriptBody`, command timeout/error handling, and panel connected state.
- Phase 3: Provider and Codex CLI readiness flow. Trace `loadAgents`, `checkSelectedAgent`, `startAgentSetup`, `getCodexCliStatus`, `launchCodexLogin`, and `runCodexCli`.
- Phase 4: Agent plan lifecycle. Trace `/agents/plan`, validation/repair/classification, inline plan controls, dry-run approval, `/agents/plan/run`, and stale-plan disablement.
- Phase 5: Agent Hardcore/autopilot flow. Trace `/agents/hardcore/run`, owner-mode session state, fallback/dev-request behavior, and how results are summarized back into the panel.
- Phase 6: Observability and QA coverage. Map panel log, backend JSONL logs, connector status, and smoke scripts against the runtime flows above to find blind spots.

## Files not inspected

- `cep-panel/panel.js` beyond short targeted ranges and search hits
- `cep-panel/style.css`
- `cep-panel/lib/CSInterface.js`
- full `mcp-server/bridge-daemon.js`
- full `mcp-server/ai-agents.js`
- `mcp-server/mcp-adapter.js`
- `mcp-server/plan-repair.js`
- `mcp-server/plan-risk-classifier.js`
- `mcp-server/project-intent-memory.js`
- `mcp-server/semantic-verification.js`
- `mcp-server/solution-library.js`
- full `chatgpt-connector/server.js`
- full `chatgpt-connector/jsx-lab.js`
- `scripts/cep-panel-cdp-smoke.js`
- `scripts/smoke-test.js`
- most individual smoke scripts under `scripts/`
- `scripts/solutions/`
- `registry/project-intent-memory.json`
- `logs/` contents
- `docs/`
- `recipes/`
- `backups/`
- `snapshots/`
- full `README.md` and `RELEASES.md`
