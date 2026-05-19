# 01 Panel to Codex Audit

## Scope

Проверялся только flow:

`user prompt -> CEP panel UI -> local bridge HTTP endpoint -> Codex CLI / provider agent process -> agent output -> CEP panel UI response`.

Не анализировались AE/JSX execution, tool execution и mutating plan runner, кроме мест, где они влияют на подготовку agent prompt/context или возврат результата в panel UI.

## Files inspected

- path: `.codex-audit/00-index.md`
  - relevant functions/classes: нет, использован как исходный индекс
  - line ranges or approximate sections: весь короткий audit index
  - why inspected: определить уже найденные runtime-зоны и не расширять аудит за пределы текущего flow.

- path: `cep-panel/index.html`
  - relevant functions/classes: DOM controls `chatTranscript`, `chatMode`, `promptOptimization`, `workflowPresetSelect`, `chatPrompt`, `sendChatButton`, `planRunStatus`
  - line ranges or approximate sections: `153-185`
  - why inspected: найти, где пользователь вводит prompt и где UI показывает режим/ответ.

- path: `cep-panel/panel.js`
  - relevant functions/classes: `request`, `loadAgents`, `checkSelectedAgent`, `startAgentSetup`, `pollSetupStatus`, `appendChatMessage`, `setChatBusy`, `selectedAgentReady`, `sendChat`, `formatPlanResult`, `formatHardcoreSession`
  - line ranges or approximate sections: `214-270`, `949-1006`, `1164-1302`, `1336-1368`, `1400-1498`, `1898-1928`, `2460-2508`, `3022-3130`
  - why inspected: основной CEP state, request body, double-submit guard, response/error rendering.

- path: `mcp-server/bridge-daemon.js`
  - relevant functions/classes: `readBody`, `readJsonBody`, `requireToken`, `aiChatRequestSummary`, `buildProjectContextSnapshot`, `buildAePlanPrompt`, `runAgentChatLogged`, `runAgentPlanLogged`, `runAgentHardcoreSession`, `/agents/*` HTTP handlers, `launchCodexAppForDevRequest`
  - line ranges or approximate sections: `1695-1737`, `1898-1910`, `3119-3163`, `3778-3944`, `4194-4248`, `4550-4878`, `5016-5144`
  - why inspected: backend request boundary, request ids, plan prompt construction, Codex App launch path, backend error shape.

- path: `mcp-server/ai-agents.js`
  - relevant functions/classes: `DEFAULT_SYSTEM_PROMPT`, `codexCommand`, `codexCommandCandidates`, `syncCommand`, `getCodexCliStatus`, `launchCodexLogin`, `normalizeMessages`, `codexPromptFromMessages`, `parseCodexJsonl`, `runCodexCli`, `chatWithAgent`
  - line ranges or approximate sections: `0-90`, `128-176`, `218-342`, `1312-1378`, `1386-1538`, `1644-1742`
  - why inspected: actual Codex CLI subprocess invocation, cwd/env/stdin/args, stdout/stderr handling, timeout and provider normalization.

## Actual flow

1. User types prompt into `textarea#chatPrompt` and selects mode via `#chatModeTabs` / hidden `#chatMode`. The send button is `#sendChatButton`.

2. `sendChat()` reads `chatPromptEl.value`, trims it, validates selected agent/model readiness, clears the textarea, appends the user's message to `chatTranscript`, and sets global `chatInFlight=true` through `setChatBusy()`.

3. The panel chooses one of three backend paths:
   - Chat mode: `POST /agents/chat`
   - Agent mode: `POST /agents/plan`
   - Agent Hardcore mode: `POST /agents/hardcore/run`

4. The CEP request uses `XMLHttpRequest`, appends the bridge token as query param, sets `content-type: text/plain;charset=utf-8`, JSON-stringifies the body, and waits for one final JSON response. Agent/chat/hardcore requests have a hard `120000ms` XHR timeout.

5. Chat mode sends `{ agentId, model, messages, promptOptimization, timeoutMs }`. The `messages` array includes recent user/assistant chat mode history, truncated by panel logic.

6. Agent mode sends `{ agentId, model, prompt, promptOptimization, hardcore:false, agentMode:"agent", timeoutMs }`. It does not send normal chat transcript as conversation history.

7. Hardcore mode sends `{ agentId, model, prompt, promptOptimization, hardcore:true, agentMode:"hardcore", projectOwner:true, reasoning_effort:"xhigh", maxAttempts:5, allowMutations:true, autoEditSession:true, allowRawFallback:true, autoPromoteKnowledge:true, timeoutMs }`.

8. `bridge-daemon.js` parses JSON with `readJsonBody()`, checks the token, and dispatches to `runAgentChatLogged`, `runAgentPlanLogged`, or `runAgentHardcoreSession`. Backend creates a `requestId` for chat/plan; Hardcore creates a `sessionId` and each internal plan attempt gets its own `requestId`.

9. For Chat mode, `runAgentChatLogged()` optionally appends prompt-optimization text to `system`, then calls `aiAgents.chatWithAgent()`.

10. For Agent mode, `runAgentPlanLogged()` captures a compact project context snapshot, retrieves project memory / solution hints, builds a strict AE plan prompt with JSON schema and available tool catalog, then calls `aiAgents.chatWithAgent()`. This phase did not inspect the AE tool execution behind context capture.

11. `chatWithAgent()` checks provider readiness, normalizes messages, and dispatches by `agent.apiStyle`. For `codex-cli`, it calls `runCodexCli()`.

12. `runCodexCli()` discovers CLI status, requires `codex login status` to succeed, converts messages to one text prompt with `codexPromptFromMessages()`, then runs:

```text
codex exec --ephemeral --json --sandbox read-only --model <model> --cd <process.cwd()> [--reasoning-effort <effort>] <prompt>
```

13. Codex process details:
   - cwd: `process.cwd()` for both `spawn(..., { cwd })` and `--cd`.
   - env: full inherited `process.env`.
   - stdin: ignored (`stdio: ["ignore", "pipe", "pipe"]`).
   - args: array passed to `spawn`, no shell for main `codex exec`.
   - prompt: final positional command-line argument, not stdin.
   - project instructions: not explicitly read by this layer; Codex CLI may load them because `--cd process.cwd()` points at the project.
   - runtime context: for Chat, text conversation; for Agent, generated AE plan prompt with context snapshot/tool catalog/hints; for Hardcore, repeated Agent plan attempts plus run summaries.

14. stdout/stderr:
   - stdout is buffered until process close.
   - stderr is buffered until process close.
   - stdout is parsed as JSONL by `parseCodexJsonl()`.
   - final UI text is the last assistant text found in JSONL.
   - stderr is used only if Codex exits non-zero or stdout has no assistant text.
   - raw stdout/stderr/events are dropped unless `includeRawResponse` is true, which panel does not request.

15. Streaming:
   - Codex CLI itself emits JSONL, but the bridge does not stream it to CEP.
   - CEP receives only the final HTTP JSON response or one HTTP error.

16. UI completion:
   - On success, panel formats plan/chat/hardcore result, appends assistant message, appends resource report, logs request/session id when available, and clears `chatInFlight`.
   - On error, panel clears `chatInFlight`, appends `error.message` as an error chat message, and writes a compact Activity log line.

17. Cancellation:
   - No user cancellation control was found for an in-flight Codex/agent request.
   - XHR timeout exists in CEP.
   - Codex subprocess timeout exists in backend.
   - There is no observed cancel endpoint tying a panel action to killing the backend subprocess.

## Expected flow

A stable panel-local agent workflow should behave like a small job protocol, not a single opaque HTTP request:

- Create a panel-side request id before sending.
- Send a structured request with mode, prompt, bounded context, model, cwd/project root, and explicit capability schema.
- Backend returns `202 accepted` or immediate `started` state with a correlation id.
- Backend streams or polls structured events: `queued`, `readiness_check`, `started`, `model_output_delta`, `stderr_warning`, `tool_plan_ready`, `completed`, `failed`, `cancelled`.
- Prompt should be passed to Codex through stdin or another non-process-list channel when possible.
- stderr should be preserved as diagnostic evidence, separated from assistant text.
- Panel should display request id/log file on failures, not only a generic message.
- Timeout/cancellation should be explicit: UI timeout should not imply "Bridge offline" while backend work may still be running.
- Chat mode and Agent mode should make their memory model obvious: either sessionful with bounded transcript, or intentionally single-turn.

## Findings

### Finding 1
- title: CEP timeout reports long Codex work as bridge/offline failure
- type: bug
- severity: high
- confidence: high
- evidence: `cep-panel/panel.js` sets `xhr.timeout` to `120000` for `/agents/chat`, `/agents/plan`, and `/agents/hardcore`; `xhr.ontimeout` calls `makeBridgeOfflineError()`. `mcp-server/ai-agents.js` also defaults Codex CLI timeout to `120000`. There is no cancel/job-status endpoint in the inspected flow.
- impact: a slow model, long planning prompt, or Hardcore attempt can be shown as "Bridge offline" even when the bridge and Codex process are still alive or just timing out. This directly creates unstable-feeling UI state.
- minimal fix: separate network-offline errors from model timeout errors; make panel timeout longer than backend timeout, or convert agent calls to job ids with status polling.
- verification: run a fake or delayed `/agents/plan` response longer than 120s and confirm the panel shows "model timed out/request timed out" with request id, not "Bridge offline".

### Finding 2
- title: Codex JSONL is buffered, not streamed to the panel
- type: architecture risk
- severity: high
- confidence: high
- evidence: `runCodexCli()` appends stdout/stderr chunks to strings and resolves only on `child.on("close")`; `runAgentChatLogged()` and `runAgentPlanLogged()` return one final JSON response; `request()` in CEP waits for final XHR completion.
- impact: the panel cannot show real progress, partial model output, structured phases, or stderr warnings. During long Codex work, the user sees only a generic busy indicator.
- minimal fix: introduce backend job/event streaming or polling for Codex JSONL events, preserving final assistant text as a terminal event.
- verification: instrument a Codex CLI run with delayed JSONL output and verify the panel receives visible incremental state before completion.

### Finding 3
- title: User prompt is passed as a command-line argument to Codex CLI
- type: security risk
- severity: medium
- confidence: high
- evidence: `runCodexCli()` constructs `args` with the full prompt as the final positional argument and uses `stdio: ["ignore", "pipe", "pipe"]`. Main execution uses `spawn(command, args)` without a shell, so shell injection risk is low, but the prompt is still in process args.
- impact: large prompts can hit command-line length limits; sensitive prompt text can appear in process listings or command telemetry; stdin is unavailable for safer transport.
- minimal fix: if Codex CLI supports it, pass prompt through stdin or a temporary restricted file; otherwise enforce prompt length limits and document process-arg exposure.
- verification: send a very large prompt and inspect whether Codex invocation fails before model execution; inspect process args during a delayed run to confirm prompt exposure is gone after the fix.

### Finding 4
- title: Panel drops backend correlation details on errors
- type: bad UX
- severity: medium
- confidence: high
- evidence: backend `/agents/chat`, `/agents/plan`, and `/agents/hardcore/run` error responses include `requestId`, `readiness`, and `providerError`. CEP `request()` stores parsed `errorBody`, but `sendChat()` displays only `error.message` and logs only `"Agent <mode> failed: <message>"`.
- impact: failures are hard to correlate with `logs/ai-agent-chats.jsonl`; provider readiness details and request ids are hidden from the user at the exact moment they are needed.
- minimal fix: render compact failure detail with `requestId/sessionId`, provider error code/status, and log file hint when present.
- verification: force a provider readiness failure and a malformed plan failure; confirm panel shows the backend request id and provider error details.

### Finding 5
- title: Agent mode is single-turn while Chat mode is sessionful
- type: unclear requirement
- severity: medium
- confidence: medium
- evidence: in `sendChat()`, Chat mode sends `messages: chatMessages`; Agent mode sends only `prompt`. `runAgentPlanLogged()` builds a fresh plan prompt from the current prompt, context snapshot, memory hints, and solution hints, not the visible chat transcript.
- impact: users may expect "agent workflow inside the panel" to remember prior chat turns, but Agent planning is effectively per-prompt. This can feel like stale/lost context even when implementation is behaving as coded.
- minimal fix: make Agent mode explicitly "single request planning" in UI, or pass a bounded, structured recent-agent-session summary into `buildAePlanPrompt()`.
- verification: send two dependent Agent prompts and confirm either the second prompt intentionally lacks prior context with clear UI copy, or receives a bounded prior context summary.

### Finding 6
- title: Lifecycle state is a shared boolean rather than a request state machine
- type: architecture risk
- severity: medium
- confidence: medium
- evidence: CEP uses global `chatInFlight` for chat, plan, hardcore, plan run, dev request, provider self-test blocking, and button state. `sendChat()` has no local request sequence/correlation check before applying the callback result. `loadAgents()` has a sequence guard, but agent chat/plan response handling does not.
- impact: double-submit is mostly blocked, but reconnects, mode switches, stale callbacks, or future parallel features can update the UI with an old result. The UI has `idle/running/failed/completed` symptoms, not an explicit lifecycle model.
- minimal fix: create a request state object `{localRequestId, backendRequestId, mode, status, startedAt, abortController/xhr}` and ignore callbacks that are not current.
- verification: simulate a slow request, switch modes/reload state or start a new request after a controlled failure, and confirm stale callbacks cannot overwrite current UI.

### Finding 7
- title: Main Codex exec avoids shell injection, but login launch still uses `cmd.exe /c start`
- type: security risk
- severity: low
- confidence: medium
- evidence: `runCodexCli()` uses `spawn(command, args)` with an args array, which is the right shape for shell-quoting safety. `spawnCodexLogin()` on Windows uses `cmd.exe /d /s /c start "Codex ChatGPT Sign-In" <quoted command> login`.
- impact: normal model requests are not shell-expanded, but the setup/login path has more quoting surface, especially if `CODEX_CLI_PATH` is user-controlled and contains unusual characters.
- minimal fix: prefer direct `spawn(command, ["login"])` when possible; if a visible terminal/window is required, strictly validate explicit CLI path before using `cmd.exe /c start`.
- verification: test explicit `CODEX_CLI_PATH` values with spaces and shell metacharacters; confirm no extra command executes and login still launches.

## Missing information

- Did not run the panel, bridge, Codex CLI, or live provider calls.
- Did not inspect full `cep-panel/panel.js`, full `bridge-daemon.js`, full `ai-agents.js`, logs, or smoke scripts.
- Did not verify whether current Codex CLI supports prompt via stdin.
- Did not inspect installed CEP cache or whether the running panel bundle matches repository files.
- Did not inspect AE command polling/execution except as excluded context.

## Next phase recommendation

Next phase should audit only the panel-to-bridge lifecycle around connectivity and stale state:

`CEP startup/reload -> bridge health -> /bridge/next polling -> panel connected status -> reconnect/reload behavior`.

This should avoid AE tool execution details but verify whether the panel can look "online" while using stale JS, stale token/base URL, or a disconnected polling loop.
