# 101 M100 Repair Plan

## Goal

Собрать минимальный repair plan для безопасного M100 vertical slice:

user prompt -> CEP panel -> Codex/agent process -> structured/visible response -> optional action proposal -> user confirmation -> AE JSX execution -> result/error shown in panel.

План основан только на `.codex-audit/100-m100-decision.md` и его audit evidence. Исходный код в рамках этого документа не меняется.

## Scope

- Починить минимальную вертикаль Panel -> Agent -> Action proposal -> Confirmation -> AE execution -> Result/Error.
- Сделать результат agent/AE видимым и коррелируемым через `requestId`, `actionId`, `executionId`.
- Ввести минимальный M100 protocol envelope вместо неявного вывода controls из `result.plan`.
- Закрыть опасную AE-очередь: expired commands, late results, concurrent `evalScript`, malformed wrapper output.
- Унифицировать confirmation/risk boundary для `/agents/plan/run`, `/tools/call`, MCP `tools/call`, `run_extendscript`, `run_extendscript_file`.
- Добавить deterministic local smoke без external provider, live CEP/AE и live mutation.

## Non-goals

- Не делать полный Codex JSONL streaming, cancel/retry endpoints или полноценный job/event bus.
- Не переписывать `cep-panel/panel.js` широко и не мигрировать UI на React/TypeScript.
- Не добавлять package manager, CI, lint/typecheck stack или тяжелый test framework только ради M100.
- Не менять provider/model defaults.
- Не добавлять shell action execution.
- Не удалять raw JSX полностью; для M100 он остается gated/admin-style escape hatch.
- Не делать strict function/tool-call migration обязательной, если минимальный validated envelope уже защищает UI controls.
- Не запускать external-provider или mutating-live validation как default check без явного approval.

## Current broken flow

По audit evidence из `100-m100-decision.md` текущая вертикаль сломана в пяти местах:

1. AE command execution может отчитаться failure/completed, а затем все равно изменить After Effects позже. Также empty/malformed wrapped host output может считаться success.
2. Unified assistant/action/result envelope отсутствует. Panel inferred controls из `result.plan`, поэтому plain assistant text, action proposal, confirmation state, execution result, error и logs не являются first-class protocol messages.
3. Confirmation boundary не enforced одинаково. Более безопасный `/agents/plan/run` имеет gates, но `/tools/call`, MCP `tools/call`, `run_extendscript`, `run_extendscript_file` могут выглядеть как обычные callable surfaces без той же user confirmation semantics.
4. Agent execution opaque. Provider readiness, model timeout, stderr, request id, log hints и phase-specific errors могут быть скрыты или сведены к generic busy/offline state.
5. Нет deterministic local smoke, который доказывает prompt -> action proposal -> confirmation -> fake AE result/error -> final UI/log state без external provider или live AE mutation.

Итоговый user-visible риск: пользователь может увидеть зависание, неверное состояние, action controls из обычного текста, silent AE execution или позднюю мутацию AE после таймаута.

## GPT Pro review revision, 2026-05-19

Verdict from the GPT Pro review of `pro-review-bundles/m100-repair-plan-pro-review-bundle.md`: `revise`.

Accepted blockers to fix before implementation:

- Add a Patch 0 before runtime changes: endpoint/call graph inventory, default-deny freeze for direct mutating/destructive/raw execution paths, risk registry shape, and early failure-contract smoke scaffolding.
- Treat model output as a candidate only. The backend, not the model or the panel, must create canonical `action_proposal`, `actionId`, `payloadRef`, `confirmationToken`, `executionId`, risk classification, payload hash and preview hash.
- Replace the loose "timeout means safe" assumption with an AE command lifecycle that distinguishes `queued` expiry before delivery from commands already `leased` to CEP or `submitted` to `evalScript`.
- Make confirmation single-use, server-owned, expiry-bound, and tied to `requestId + actionId + payloadHash + previewHash + riskLevel + riskPolicyVersion + surface/session`.
- Default-deny unknown, mutating, destructive and raw JSX tools on direct `/tools/call` and MCP paths until the shared server-side proposal/confirmation boundary can issue and verify a proposal.
- Hard-disable all executable-control rendering from legacy `result.plan` shapes, including restored transcript/localStorage fixtures and stale compatibility responses.
- Redact diagnostics before display. `stderr`, provider errors, `rawPreview`, paths, prompt fragments and log refs must pass one bounded user-diagnostic redaction helper before panel rendering.
- Move proof-oriented fake AE/bridge and protocol smokes earlier: timeout before delivery, timeout after lease/submit, late result, concurrent command, malformed wrapper, legacy `result.plan`, malformed envelope, replayed/expired/mismatched confirmation.

Deferred from M100 despite the review:

- Full event bus, streaming JSONL, cancel/retry endpoints, React/TypeScript migration, package-manager/CI adoption, provider default changes, shell actions and mutating-live validation by default remain out of scope.
- Raw JSX is not removed abruptly. It may remain only as an explicit local-dev/admin escape hatch outside the M100 user-safe path.
- Full tool-by-tool rewrite is deferred until the shared protocol, risk registry and queue semantics exist.

## Target flow

1. Panel открыта и показывает bridge/provider state: `connected`, `unavailable` или `misconfigured`.
2. Пользователь отправляет prompt.
3. Panel создает `requestId`, переводит UI в `preparing_agent_task`, отправляет prompt в Codex/agent bridge.
4. Bridge валидирует readiness и возвращает structured lifecycle event или phase-specific error.
5. UI переходит в `running_agent`, показывает running state и compact diagnostic trail.
6. Agent возвращает один из first-class envelopes:
   - `assistant_response`, если нужен только текст;
   - `action_proposal`, если есть AE action;
   - `error`, если agent/model/protocol validation failed.
7. Panel отображает assistant text. AE controls рендерятся только для validated `messageType:"action_proposal"` с `actionId`, risk и confirmation requirements.
8. Если action требует подтверждения, UI переходит в `awaiting_confirmation`; AE request еще не queued.
9. Пользователь явно подтверждает или отменяет action.
10. После confirmation bridge создает `executionId`, валидирует confirmation/risk boundary и только затем ставит AE command в очередь.
11. CEP/backend держат single-flight `evalScript`: следующий host command не submitится, пока предыдущий не завершен.
12. AE bridge возвращает strict structured result или strict structured error. Empty/malformed output считается failed с raw preview.
13. UI показывает result/error с теми же IDs и завершает flow в `completed`, `failed` или `cancelled`.
14. Expired или late AE commands не выполняются и не меняют финальное состояние активного request.

Target-flow corrections after Pro review:

- Step 6 is not allowed to trust a model-authored `action_proposal`. Agent output is a candidate; the backend canonicalizes or rejects it.
- Step 7 controls render only for backend-created proposals with a stored payload, stable risk policy, bounded preview, expiry and server-issued confirmation proof.
- Step 10 confirmation endpoint accepts only `actionId` plus server-issued confirmation proof. It never accepts client-supplied executable payload or `confirmed:true` as authority.
- Step 14 applies only to pre-delivery expiry. Once a command is leased to CEP or submitted to `evalScript`, timeout must be reported as unknown/stale semantics, not guaranteed non-execution.

## Required data contract

Минимальный M100 protocol нужен, потому что audit указывает, что текущего unified structured protocol нет.

### Panel UI -> Codex/agent bridge

```json
{
  "protocolVersion": "m100.v1",
  "requestId": "req_...",
  "source": "cep-panel",
  "prompt": "user text",
  "mode": "agent",
  "createdAt": "iso timestamp"
}
```

Rules:

- `requestId` создается до запуска agent и виден в UI/logs.
- Prompt не создает AE controls напрямую.
- Panel должна иметь один active request или явно отменять/закрывать предыдущий.

### Codex/agent bridge -> Panel UI

```json
{
  "protocolVersion": "m100.v1",
  "messageType": "assistant_response | action_proposal | action_result | error",
  "status": "running_agent | agent_response_ready | awaiting_confirmation | executing_ae_action | completed | failed | cancelled",
  "requestId": "req_...",
  "actionId": "act_... optional",
  "executionId": "exec_... optional",
  "summary": "visible user-facing text",
  "details": "optional compact detail",
  "logs": [
    {
      "phase": "provider_readiness | codex_exec | protocol_validation | ae_queue | ae_execution | ae_result_parse",
      "level": "info | warn | error",
      "message": "compact diagnostic",
      "logRef": "optional file/event ref"
    }
  ],
  "error": {
    "code": "optional stable code",
    "phase": "optional failed phase",
    "message": "visible failure",
    "rawPreview": "optional bounded preview"
  }
}
```

Rules:

- `assistant_response` never creates executable controls.
- `error` always ends in `failed` or returns to a safe non-busy state.
- IDs shown in UI must match backend logs.

### Action proposal envelope

```json
{
  "protocolVersion": "m100.v1",
  "messageType": "action_proposal",
  "status": "awaiting_confirmation",
  "requestId": "req_...",
  "actionId": "act_...",
  "summary": "what will happen in AE",
  "risk": {
    "level": "read_only | mutating | destructive | raw_jsx",
    "requiresConfirmation": true,
    "reasons": ["why confirmation is required"]
  },
  "action": {
    "kind": "ae_jsx | ae_tool",
    "toolName": "optional tool name",
    "preview": "bounded visible preview",
    "payloadRef": "server-side action reference only",
    "payloadHash": "sha256...",
    "previewHash": "sha256..."
  },
  "confirmation": {
    "required": true,
    "state": "pending",
    "proposalExpiresAt": "iso timestamp",
    "riskPolicyVersion": "m100-risk-v1"
  }
}
```

Rules:

- Controls render only when `messageType === "action_proposal"`, `actionId` exists, risk is valid, and confirmation requirements are explicit.
- `action_proposal` is backend-created from a validated candidate. Model-authored proposals are not executable until canonicalized by the backend.
- Raw/mutating/destructive JSX must not queue until confirmation is recorded.
- `payloadRef` must resolve only inside the server-side action store and match `payloadHash`, `previewHash`, `riskPolicyVersion` and expiry at confirmation time.
- Unknown or unclassified tools are blocked by default, not best-effort classified.

### Panel/bridge -> AE bridge

```json
{
  "protocolVersion": "m100.v1",
  "requestId": "req_...",
  "actionId": "act_...",
  "executionId": "exec_...",
  "confirmed": true,
  "confirmationToken": "confirm_...",
  "confirmedBySurface": "cep-panel | admin-local",
  "action": {
    "kind": "ae_jsx | ae_tool",
    "payloadRef": "validated server-side action reference"
  }
}
```

Rules:

- AE queue accepts mutating/destructive/raw calls only after confirmation validation.
- Client-supplied `confirmed:true` is not sufficient. Confirmation must match a stored single-use proposal token and canonical payload.
- Confirmation is invalid after execution, cancel, expiry, payload/risk/preview change, or token replay.
- `/bridge/next` must skip expired or no-longer-inflight commands.
- Only one active `evalScript` may be submitted per active panel connection.

### AE bridge -> Panel/UI state

```json
{
  "protocolVersion": "m100.v1",
  "messageType": "action_result | error",
  "status": "completed | failed",
  "requestId": "req_...",
  "actionId": "act_...",
  "executionId": "exec_...",
  "result": {
    "ok": true,
    "summary": "visible AE result",
    "rawPreview": "optional bounded preview"
  },
  "error": {
    "phase": "ae_execution | ae_result_parse | ae_timeout",
    "message": "visible AE error",
    "rawPreview": "optional bounded preview"
  }
}
```

Rules:

- Empty/malformed wrapped host output is `failed`, not `{ ok:true, raw:true }`.
- Late result after timeout is ignored or logged as stale, not applied to current UI state.
- Final UI state must be `completed`, `failed` or `cancelled`.

## State machine

| State | Entry condition | Exit condition | Visible UI behavior | Logs/errors |
| --- | --- | --- | --- | --- |
| `idle` | No active request, or previous request ended in `completed`, `failed`, `cancelled`. | User submits prompt. | Prompt input enabled; bridge/provider status visible. | Keep last request summary and log hint if available. |
| `preparing_agent_task` | Panel accepted prompt, created `requestId`, started readiness/protocol preparation. | Agent process starts, or readiness/protocol validation fails. | Input locked for current request; compact "preparing" state with `requestId`. | Log bridge offline, provider missing/misconfigured, invalid prompt/request shape. |
| `running_agent` | Codex/agent process is launched for `requestId`. | Agent returns valid envelope, times out, exits non-zero, emits no usable response, or protocol validation fails. | Running indicator; no AE controls yet; diagnostics area shows phase and `requestId`. | Preserve stdout/stderr/provider errors or logRef; classify timeout/non-zero/malformed JSONL/no assistant text. |
| `agent_response_ready` | Valid `assistant_response` envelope received, or valid text part of a proposal is ready. | Flow completes for text-only response, or valid `action_proposal` moves to confirmation. | Transcript shows assistant response; controls remain hidden unless proposal validates. | Log protocol acceptance and IDs; malformed proposal logs validation error and moves to `failed`. |
| `awaiting_confirmation` | Valid `action_proposal` with required confirmation is displayed. | User confirms, user cancels, proposal expires, or validation is revoked. | Show summary, bounded preview, risk language, confirm/cancel controls. AE not queued. | Log `actionId`, risk level, confirmation state. Cancellation logs visible cancelled state. |
| `executing_ae_action` | User confirmed proposal and bridge accepted confirmation/risk envelope; `executionId` created. | AE result/error/timeout/stale result handling finishes. | Confirm controls disabled; execution state shown with `executionId`; input remains protected from duplicate execution. | Log queueing, `/bridge/next`, host submit, parse result, timeout, stale/late result, rawPreview for malformed output. |
| `completed` | Agent text-only response completed, or AE action returned strict success for matching IDs. | New prompt starts a new request. | Final success/result shown; input enabled. | Log final status and matching IDs. |
| `failed` | Any phase fails without safe recovery: readiness, agent, protocol validation, confirmation validation, AE queue, AE execution, AE parse, timeout. | User starts new prompt or dismisses details. | Final failure state; input enabled; no pending execution controls. | Show phase, stable error code when available, request/action/execution IDs, logRef/rawPreview if available. |
| `cancelled` | User cancels while awaiting confirmation, or active request is intentionally cancelled before execution. | User starts new prompt. | Cancelled state shown; no AE command queued. | Log cancellation with `requestId` and `actionId` if proposal existed. |

### AE command lifecycle state machine

This state machine supersedes any acceptance wording that treats timeout as universally safe.

| State | Meaning | Timeout/expiry semantics | User-facing result |
| --- | --- | --- | --- |
| `queued` | Command exists server-side but has not been returned by `/bridge/next`. | Can expire before delivery and be removed/skipped with a non-execution guarantee. | `failed` or `cancelled` with `expired_before_delivery`; safe to say it did not run. |
| `expired_before_delivery` | A queued command expired before any panel lease. | Terminal; `/bridge/next` must never return it later. | Safe failure/cancel state; no AE mutation expected from this command. |
| `leased` | `/bridge/next` returned the command to a specific `panelConnectionId`/generation. | Backend can no longer promise non-execution; panel may already have received it. | If timed out, show `unknown_after_delivery` rather than "safe failure". |
| `submitted` | CEP submitted the command to `evalScript`. | Backend cannot cancel AE execution. | If timed out, show `timed_out_after_submit`; execution may still finish in AE. |
| `completed` | Matching strict result returned for current command/execution IDs. | Terminal. | Completed result. |
| `failed` | Matching strict failure returned before timeout. | Terminal. | Failed result with redacted diagnostic. |
| `timed_out_after_submit` | Backend timeout fired after lease/submit. | Terminal for UI, but not a cancellation claim. | Unknown/stale semantics: may still be running or may have mutated AE. |
| `stale_result_ignored` | A late result arrived for an expired/non-current execution. | Logged but not applied to the active UI state. | Keep prior terminal state and show stale diagnostic/log ref if relevant. |

## Revised patch sequence

### Patch 0: Safety inventory and default-deny freeze

- objective: Prove the execution surface and make unsafe direct paths fail closed before deeper protocol work.
- exact files:
  - `.codex-audit/106-m100-execution-surface-inventory.md` (new, if needed)
  - `mcp-server/bridge-daemon.js`
  - `mcp-server/mcp-adapter.js`
  - `scripts/m100-ae-command-contract-smoke.js` (new)
  - `scripts/m100-protocol-contract-smoke.js` (new)
- exact changes:
  - Inventory every path that can reach `runExtendScriptBody`, AE command queueing, `/bridge/next`, `/bridge/result`, `/agents/plan/run`, `/tools/call`, MCP `tools/call`, `run_extendscript`, `run_extendscript_file`, Hardcore/dev flows and ChatGPT connector candidate/hash flows.
  - Introduce a minimal risk registry shape for `read_only`, `mutating`, `destructive`, `raw_jsx` and default-deny unknown tools.
  - Block direct mutating/destructive/raw JSX calls by default with a structured `proposal_required` or `blocked_confirmation_required` result until the server-owned proposal registry exists.
  - Keep a local-dev/admin escape hatch separate from the M100 user-safe path, with explicit flagging and logs.
  - Add failing/contract smokes for timeout before delivery, timeout after lease/submit, late result, concurrent command, malformed wrapper, legacy `result.plan`, malformed envelope, expired proposal, replayed token and mismatched payload hash.
- expected behavior: Unknown or unsafe direct execution paths are visible and blocked before implementation relies on the later envelope.
- verification:
  - Contract smokes fail before implementation and then pass as patches land.
  - Inventory proves there is no unlisted AE execution path in the reviewed source files.
- rollback:
  - Revert the direct-path freeze only behind an explicit local-dev/admin flag if needed for developer escape hatch work.

### Patch 1a: AE command lifecycle contract and pre-delivery expiry

- objective: Fix the highest-risk queue behavior without claiming cancellation after delivery.
- exact files:
  - `mcp-server/bridge-daemon.js`
  - `cep-panel/panel.js`
  - `scripts/m100-ae-command-contract-smoke.js`
- exact changes:
  - Implement command lifecycle states: `queued`, `expired_before_delivery`, `leased`, `submitted`, `completed`, `failed`, `timed_out_after_submit`, `stale_result_ignored`.
  - Track lease owner with `panelConnectionId`/generation and record when CEP has received a command.
  - Remove/skip expired `queued` commands before `/bridge/next` can return them.
  - Make already leased/submitted timeouts report `unknown_after_delivery` or `timed_out_after_submit` instead of safe failure.
  - Ignore late results for non-current executions and log them as stale.
- expected behavior: Only pre-delivery expiry gets a non-execution guarantee; delivered/submitted timeout is truthful and visibly uncertain.
- verification:
  - Fake timeout-before-delivery proves no later execution.
  - Fake timeout-after-lease and timeout-after-submit produce unknown/stale semantics.
  - Late result is logged and ignored for active UI state.
- rollback:
  - Revert lifecycle tracking and restore previous queue behavior only if smoke proves no command can be stranded.

### Patch 1b: CEP single-flight and strict AE wrapper parsing

- objective: Prevent overlapping host calls and false success from malformed host output.
- exact files:
  - `mcp-server/bridge-daemon.js`
  - `cep-panel/panel.js`
  - `scripts/m100-ae-command-contract-smoke.js`
- exact changes:
  - Add backend and CEP single-flight protection so only one `evalScript` is submitted for the active panel connection at a time.
  - Treat empty or malformed wrapped `evalScript` output as `failed` with `phase:"ae_result_parse"` and redacted bounded `rawPreview`.
  - Preserve host errors as strict failure envelopes instead of `{ ok:true, raw:true }`.
- expected behavior: Host calls cannot overlap silently; malformed/empty AE output is visible failure.
- verification:
  - Two queued scripts prove the second does not submit until the first result posts.
  - Empty output, malformed JSON, wrapper mismatch and host error fail deterministically.
- rollback:
  - Keep lifecycle states from Patch 1a if stable; revert only parsing/single-flight changes if necessary.

### Patch 2: Server-owned proposal registry and legacy-control removal

- objective: Add the M100 action envelope while making backend the only authority for executable proposals.
- exact files:
  - `mcp-server/bridge-daemon.js`
  - `mcp-server/m100-protocol.js` (new)
  - `cep-panel/panel.js`
  - `scripts/m100-protocol-contract-smoke.js`
- exact changes:
  - Add a protocol helper for `assistant_response`, backend-created `action_proposal`, `action_result`, `error`, lifecycle status, IDs, risk, confirmation, diagnostics and redacted previews.
  - Convert model output into candidate action data only; backend validates candidate, stores executable payload server-side, computes `payloadHash`/`previewHash`, assigns `actionId`/`payloadRef`, risk and expiry.
  - Render action controls only from validated backend-created `messageType:"action_proposal"`.
  - Remove or hard-disable every legacy path that creates `Dry run` / `Run plan` controls from `result.plan`, including restored transcript/localStorage, fixtures and stale compatibility responses.
  - Make assistant text with JSON-like content display as text only.
- expected behavior: Text stays text-only; controls appear only for canonical backend proposals; old plan shapes cannot become executable UI.
- verification:
  - JSON-like assistant text does not create controls.
  - Valid backend-created `action_proposal` creates controls.
  - Legacy `result.plan`, restored transcript, malformed envelope and missing-ID shapes never create controls.
  - IDs appear in UI/log output.
- rollback:
  - Keep Patch 1 queue fixes; temporarily hide proposal controls if registry validation has to be backed out.

### Patch 3: Single-use confirmation gate and direct-tool proposal requirement

- objective: Normalize confirmation/risk gates without accepting client-authored `confirmed:true`.
- exact files:
  - `mcp-server/bridge-daemon.js`
  - `mcp-server/mcp-adapter.js`
  - `mcp-server/m100-protocol.js`
  - `scripts/m100-confirmation-gate-smoke.js` (new)
- exact changes:
  - Store canonical proposal records with `requestId`, `actionId`, `payloadRef`, `payloadHash`, `previewHash`, `riskLevel`, `riskPolicyVersion`, `proposalExpiresAt`, `confirmationTokenHash`, `confirmedAt`, `confirmedBySurface` and execution/cancel state.
  - Confirm only by matching server-issued proof; reject replay, expiry, mismatched payload/risk/preview hash, changed risk policy, wrong surface/session and already-used tokens.
  - `/tools/call` and MCP mutating/destructive/raw calls return `proposal_required` or `blocked_confirmation_required`, not execution, unless routed through the explicit local-dev/admin escape hatch.
  - Queue AE execution only by resolving payload from the server-side action store after confirmation.
- expected behavior: No mutating/destructive/raw JSX path executes silently or through forged confirmation fields.
- verification:
  - Direct raw JSX without server proposal is rejected before AE queueing.
  - Mutating tool call without server proposal is rejected before AE queueing.
  - Replayed token, expired proposal and mismatched payload hash are rejected.
  - Confirmed panel proposal succeeds through the same boundary.
- rollback:
  - Preserve default-deny for user-safe path; use only the explicit admin/local-dev route for temporary compatibility.

### Patch 4: Lifecycle diagnostics and redaction

- objective: Make every phase visible while preventing raw sensitive diagnostics from leaking into the panel.
- exact files:
  - `cep-panel/panel.js`
  - `mcp-server/bridge-daemon.js`
  - `mcp-server/ai-agents.js`
  - `mcp-server/m100-protocol.js`
  - `scripts/m100-lifecycle-diagnostics-smoke.js` (new)
- exact changes:
  - Map backend phases to the M100 state machine and AE command lifecycle.
  - Separate bridge offline, provider readiness failure, model timeout, non-zero Codex exit, no assistant text, malformed JSONL, protocol validation failure, confirmation validation failure, AE queue failure and AE execution/parse failure.
  - Add `redactForUserDiagnostic()` for stderr, provider errors, `rawPreview`, AE parse errors, paths, prompt snippets and log refs, with length caps before UI display.
  - Show compact `requestId/actionId/executionId`, phase and log hint in the panel.
  - Ensure every failure exits busy/running UI into a truthful terminal state.
- expected behavior: User sees what failed and where to look, without raw prompts/secrets/paths spilling into panel text.
- verification:
  - Fake provider readiness failure, delayed model timeout, malformed proposal, confirmation failure and AE failure show correct phase, IDs and redacted diagnostic preview.
- rollback:
  - Keep backend structured errors and temporarily reduce panel detail if the UI becomes too noisy.

### Patch 5: Deterministic M100 vertical smoke

- objective: Prove the minimal safe vertical slice without external provider, live CEP/AE or live mutation.
- exact files:
  - `scripts/m100-vertical-smoke.js` (new)
- exact changes:
  - Create a local fake-agent/fake-AE harness that exercises prompt accepted -> backend-created action proposal -> confirmation required -> fake AE result/error displayed -> final state.
  - Include fake Codex cases for valid assistant text, valid candidate proposal, delayed output/timeout, stderr, non-zero exit, no assistant text and malformed JSONL.
  - Include fake AE cases for timeout before delivery, timeout after lease/submit, late result, concurrent command attempt, empty/malformed wrapper output and host error variants.
  - Assert correlation IDs match across request/proposal/execution/result and that legacy shapes cannot create controls.
  - Keep the smoke dependency-free and non-mutating.
- expected behavior: One local command proves the M100 vertical protocol and failure contracts.
- verification:
  - `node scripts/m100-vertical-smoke.js`
  - The smoke fails if proposal lacks backend-owned `actionId`, confirmation is skipped, AE result/error is not displayed, final state is ambiguous, IDs do not match, or a legacy `result.plan` creates controls.
- rollback:
  - Keep lower-level fake Codex/fake AE smokes and remove only the combined vertical harness if it becomes unstable.

## Verification plan

### Automated or local checks

- `node --check` for every touched JavaScript file.
- `git diff --check`.
- `node scripts/m100-ae-command-contract-smoke.js`.
- `node scripts/m100-protocol-contract-smoke.js`.
- `node scripts/m100-confirmation-gate-smoke.js`.
- `node scripts/m100-lifecycle-diagnostics-smoke.js`.
- `node scripts/m100-vertical-smoke.js`.
- Existing configured repository checks required by project policy, with skipped checks recorded explicitly.
- Existing M100-adjacent smokes from project policy should run before declaring M100 done, including provider/registry/retrieval/plan/semantic/reliability/bridge smokes, unless a check requires unavailable services or explicit approval.

### Manual CEP/After Effects checks

Run only when After Effects and the panel are available, and only with explicit approval for live/mutating checks:

1. Open CEP panel and verify bridge/provider state is clear.
2. Submit text-only prompt and verify no AE controls appear.
3. Submit prompt that produces AE proposal and verify summary, risk, preview and confirm/cancel controls.
4. Cancel proposal and verify no AE command is queued; UI ends `cancelled`.
5. Confirm safe test proposal and verify AE result appears with matching IDs.
6. Trigger controlled AE error and verify panel shows `failed`, phase and log hint.
7. Disconnect/reconnect panel around an expired command and verify it does not execute later.

### Failure-path checks

- Bridge offline: UI shows bridge phase failure, not generic busy.
- Provider misconfigured: UI shows provider readiness failure and `requestId`.
- Codex timeout: UI ends `failed`; stderr/log preview is accessible.
- Codex non-zero exit: UI ends `failed` with codex phase.
- No assistant text: UI ends `failed` with protocol/agent phase.
- Malformed JSONL: UI ends `failed`; no controls render.
- Assistant text containing JSON-like `plan`: displayed as text; no controls render.
- Legacy `result.plan`: displayed or restored without executable controls.
- Malformed envelope with `result.plan`: rejected before controls render.
- Raw JSX direct call without a server proposal: rejected before `/bridge/next`.
- Mutating tool call without a server proposal: rejected before `/bridge/next`.
- Replayed, expired or mismatched confirmation: rejected before `/bridge/next`.
- Empty/malformed wrapped AE output: `failed` with bounded raw preview.
- Timeout before delivery: command cannot execute later.
- Timeout after lease/submit: UI reports unknown/stale semantics, not safe cancellation.
- Late AE result after timeout: logged stale and ignored for current UI state.
- Concurrent AE command attempt: queued/blocked until active `evalScript` resolves.

## Risks

- Existing flows that relied on permissive raw/malformed AE output may start failing visibly.
- Existing developer direct-tool workflows may need explicit confirmation fields.
- Adding IDs and diagnostics can make the panel noisy if details are not compact.
- A shared protocol helper can become larger than M100 needs; keep it limited to envelope validation and correlation IDs.
- The deterministic smoke can grow too broad if it tries to emulate full CEP/AE instead of the minimum protocol.
- Legacy `result.plan` fixtures or manual habits may need updating once controls only render from `action_proposal`.
- Existing direct-tool developer workflows may need the explicit local-dev/admin escape hatch while user-safe paths stay default-deny.
- Diagnostics redaction must be centralized; scattered per-call truncation would leave privacy and consistency gaps.

## Completion criteria

M100 repair is complete when:

1. User can submit a prompt from the CEP panel and see a visible running/final state.
2. Agent text response displays without creating AE controls.
3. Valid backend-created `action_proposal` displays confirm/cancel controls with risk, preview, expiry and correlation IDs.
4. Model-authored candidate proposals and legacy `result.plan` shapes cannot create executable controls.
5. Mutating/destructive/raw JSX cannot queue without a server-owned proposal and single-use confirmation.
6. Confirmation rejects replayed tokens, expired proposals, mismatched payload/preview/risk hash and wrong surface/session.
7. Confirmed AE action returns result/error to the panel with matching command/result IDs.
8. UI always ends in `completed`, `failed`, `cancelled`, or a truthful unknown/stale terminal state for already-delivered/submitted AE commands.
9. Commands expired before delivery cannot execute later after reconnect.
10. Commands timed out after lease/submit do not claim safe cancellation.
11. CEP/backend submit only one active `evalScript` at a time.
12. Empty/malformed wrapped AE output is a visible failure.
13. Direct `/tools/call` and MCP mutating/raw calls without server proposal/confirmation are rejected before AE queueing.
14. User-facing diagnostics are redacted and length-capped before panel display.
15. Local deterministic M100 smoke proves the full fake vertical slice without external provider or live AE mutation.
16. Focused fake Codex and fake AE failure-path coverage exists for the audit-listed cases.
17. `node --check` passes for touched JS files.
18. `git diff --check` passes.
19. Any skipped live/provider/mutating validation is recorded with the exact approval or environment needed to run it.
