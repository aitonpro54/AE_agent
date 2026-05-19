# 03 Agent Action Protocol Audit

## Scope

Проверялась только надежность структурированного протокола для цепочки:

`Codex/agent -> panel runtime -> After Effects action executor -> UI result display`.

Цель: понять, есть ли единый enforceable action protocol, который отделяет обычный ответ агента от предложения действия, подтверждения, исполнения, результата, ошибки и лога.

Глубоко читались только уже заданные audit notes и узкие участки runtime-файлов:

- `.codex/handoff.md`
- `.codex-audit/00-index.md`
- `.codex-audit/01-panel-to-codex.md`
- `.codex-audit/02-panel-to-after-effects.md`
- `cep-panel/panel.js`
- `mcp-server/bridge-daemon.js`
- `mcp-server/mcp-adapter.js`
- `mcp-server/plan-risk-classifier.js`

Исходный код не изменялся. Live AE/CEP/Codex smoke не запускались.

## Current protocol

Фактический протокол не является единым end-to-end протоколом сообщений. В проекте есть несколько локальных контрактов:

1. **Обычный Chat mode**
   - Агент получает обычный текстовый transcript через `/agents/chat`.
   - Backend возвращает `{ ok: true, result }`, где основной пользовательский payload - `result.text`.
   - Panel добавляет это как `appendChatMessage("assistant", text)`.
   - Action semantics здесь нет: ответ считается обычным текстом.

2. **Agent Plan mode**
   - Агенту текстовым prompt-ом предписывается вернуть один JSON object.
   - Ожидаемая форма: `summary`, `risk`, `requiresCheckpoint`, `clarifyingQuestion`, `steps[]`.
   - Каждый step содержит `title`, `intent`, `tool`, `args`, `dependsOnStep`, `resultBindings`, `mutatesProject`, `verifyAfter`, `idempotencyKeyTemplate`.
   - Это не function/tool-call protocol от модели. Это prompt-contract плюс JSON parsing.
   - `normalizeAgentPlan()` сначала пробует `JSON.parse`, затем берет подстроку от первой `{` до последней `}`. Значит markdown/code-block/лишний текст могут неявно пройти, если внутри есть JSON object.
   - `validateAgentPlanObject()` проверяет tool name, availability в planning catalog, required schema fields, mutating status, runtime bindings, добавляет `verifyAfter`, `idempotencyKey`, `idempotencyScope`.
   - `classifyAgentPlan()` классифицирует план как `safe typed-tool`, `risky`, `needs clarification`, `unsupported`, ставит `blocksRun`, `allowsDryRun`, `runRecommendation`.

3. **Panel action display**
   - Panel не получает `messageType`.
   - Если в ответе Agent Plan есть `result.plan`, panel форматирует его в человекочитаемый текст через `formatPlanResult()` и добавляет inline controls через `appendInlinePlanActions()`.
   - Inline controls - это UI-вывод из факта наличия `plan`, а не отдельное `action_proposal` сообщение.
   - Кнопки: dry-run и run. Статус строки локальный: `Plan ready`, `Plan needs review`, `Run blocked`, `Working`, etc.

4. **Plan run**
   - Panel вызывает `/agents/plan/run` с:

```json
{
  "plan": {},
  "requestId": "...",
  "dryRun": true,
  "confirm": false,
  "allowMutations": false,
  "autoEditSession": false,
  "timeoutMs": 120000
}
```

   - Для real run panel ставит `confirm:true`; если validation видит mutating steps, ставит `allowMutations:true` и `autoEditSession:true`.
   - Raw ExtendScript run unlock происходит только после successful dry-run того же current plan через `allowRawExtendscript:true` и `rawExtendscriptDryRunId`.
   - Backend возвращает `{ ok, run }`.
   - `run.id` является execution-like ID, но в протоколе не назван `executionId` и не связан единообразно с action proposal.
   - Step statuses внутри run: `pending`, `skipped`, `blocked`, `ready`, `completed`, `failed`.

5. **After Effects executor**
   - Backend queue protocol: `/bridge/next` отдает panel команду `{ id, script }`.
   - Panel исполняет `cs.evalScript(command.script, callback)`.
   - Panel постит `/bridge/result` с `{ id, ok, result, error }`.
   - Это внутренний AE command protocol. Он структурирован минимально, но не содержит action type, risk, confirmation state, preview, requester context или user-facing action summary.

6. **MCP adapter / direct tools**
   - `mcp-server/mcp-adapter.js` реализует JSON-RPC MCP `tools/list` и `tools/call`.
   - `tools/list` возвращает daemon tool schemas.
   - `tools/call` пересылает `{ name, arguments }` в `/tools/call`.
   - Для mutating tools `exposedTools()` добавляет checkpoint/idempotency/verifyAfter поля, но это не является глобальной confirmation boundary для всех mutating tool calls.

7. **Logs**
   - Backend пишет JSONL: `logs/bridge-events.jsonl`, `logs/ai-agent-chats.jsonl`, edit-session/idempotency logs.
   - События имеют `type`, `details`, timestamps и местами event UUID.
   - Panel activity log показывает короткие строки, но не является полноценным user-facing action journal с request/action/execution correlation.

Итоговая оценка: **протокол есть, но неполный**. Для Agent Plan есть частично enforced structured plan schema и run gates. Но общего структурированного action message protocol между агентом, panel UI, executor и result display нет.

## Protocol gaps

- Нет общего message envelope с `messageType`.
- Нет различения на уровне protocol между `assistant_response`, `action_proposal`, `action_result`, `error`, `log`.
- Нет `actionId`; есть `requestId`, `run.id`, `command.id`, `eventId`, `sessionId`, но они не образуют стабильную сквозную цепочку.
- Нет явного `executionId`; `run.id` и AE `command.id` выполняют похожие роли локально.
- Нет общего lifecycle: `idle`, `preparing`, `running_agent`, `awaiting_confirmation`, `executing_ae_action`, `completed`, `failed`, `cancelled`.
- `awaiting_confirmation` существует только как UI-состояние вокруг кнопки Run, а не как backend-enforced message state.
- Обычный ответ, план и ошибка определяются UI-ветвлением и endpoint shape, а не schema.
- Action proposal создается из `result.plan`, а не из явного `action_proposal`.
- Preview before apply есть только частично: plan text + dry-run summary. Это не универсальный preview contract для любого action.
- JSON plan parsing допускает implicit extraction из произвольного текста между первой `{` и последней `}`.
- Validation проверяет plan/tool steps, но не проверяет top-level message protocol.
- Destructive/unsafe distinction неполный: есть `mutating`, `risky`, `raw ExtendScript`, но нет обязательной категории `destructive` в action envelope.
- Direct MCP `/tools/call` не обязан проходить тот же panel confirmation UX, что `/agents/plan/run`.
- User-facing log не показывает полноценный журнал действий с request/action/execution/status.
- Нет cancel endpoint и нет protocol status `cancelled` для agent/action execution.

## Safety boundary assessment

**Confirmation**

Для `/agents/plan/run` confirmation boundary есть и частично enforced:

- real run требует `confirm:true`;
- mutating run требует `allowMutations:true`;
- mutating run без checkpoint/edit session требует protected edit session через `autoEditSession:true`;
- raw ExtendScript run требует successful dry-run того же current plan и `allowRawExtendscript:true`.

Но boundary привязан к plan runner. Он не является единым action protocol boundary для всех путей исполнения.

**Destructive actions**

Есть mutating tool list и risk classifier. Отдельные tools вроде checkpoint deletion / cleanup test items требуют `confirm=true`. Plan prompt советует checkpoints для broad/destructive changes.

Пробел: нет глобального `risk: read_only | mutating | destructive | unsafe` contract, который обязан пройти каждый action до исполнения. `destructive` больше эвристика/текстовый сигнал, чем обязательное поле протокола.

**Shell commands**

В проверенном agent action path нет общего shell action protocol. Codex CLI вызывается backend-ом как subprocess для получения ответа/плана, а не как user-approved shell action из panel. Direct shell action proposal/confirmation schema не найдена.

Для M100 это важно как запрет: если shell execution появится, он должен быть отдельным `action.kind: "shell"` с deny-by-default и явным confirmation, а не текстом в assistant response.

**JSX execution**

JSX boundary лучше защищен в `/agents/plan/run`, чем в прямом tool layer:

- typed plan steps проходят validation;
- raw ExtendScript в plan-run заблокирован до dry-run approval;
- AE command queue передает только `{ id, script }` и получает `{ id, ok, result, error }`.

Риск: low-level `run_extendscript` / `run_extendscript_file` через `/tools/call` / MCP не использует тот же user confirmation envelope. Это уже найдено в `02-panel-to-after-effects.md` и остается protocol-level gap.

## Minimal target protocol

Минимальная M100 schema должна быть не заменой plan schema, а верхним envelope над chat/plan/run/result/log.

Пример:

```json
{
  "schema": "ae-agent-action-protocol.v1",
  "requestId": "uuid",
  "messageId": "uuid",
  "messageType": "assistant_response | action_proposal | action_result | error | log",
  "status": "idle | preparing | running_agent | awaiting_confirmation | executing_ae_action | completed | failed | cancelled",
  "summary": "short user-facing summary",
  "actions": [
    {
      "actionId": "uuid",
      "kind": "ae_tool | ae_plan_run | ae_extendscript | shell | ui_only",
      "title": "short action title",
      "intent": "what will happen",
      "risk": "read_only | mutating | destructive | unsafe",
      "requiresConfirmation": true,
      "confirmationState": "not_required | required | confirmed | rejected | expired",
      "preview": {
        "available": true,
        "summary": "what will change",
        "affectedTargets": [],
        "dryRunId": null
      },
      "tool": {
        "name": "typed_tool_name",
        "args": {}
      },
      "safety": {
        "validationOk": true,
        "allowMutations": false,
        "allowRawExtendscript": false,
        "checkpointRequired": false,
        "blockedReason": null
      },
      "execution": {
        "executionId": null,
        "status": "pending | running | completed | failed | cancelled",
        "startedAt": null,
        "finishedAt": null
      }
    }
  ],
  "logs": [
    {
      "level": "info | warning | error",
      "message": "compact log message",
      "eventId": "uuid"
    }
  ],
  "errors": [
    {
      "code": "string_code",
      "message": "user-facing error",
      "details": {}
    }
  ]
}
```

Минимальные enforcement rules для M100:

- Panel должна принимать action controls только из `messageType: "action_proposal"`.
- Любое mutating/destructive/raw JSX действие должно иметь `requiresConfirmation:true`.
- `/agents/plan/run`, `/tools/call`, MCP adapter и raw JSX должны проверять один и тот же confirmation envelope или явно отказывать.
- `requestId -> actionId -> executionId -> AE command id` должны логироваться вместе.
- UI должен показывать `awaiting_confirmation`, `executing_ae_action`, `completed`, `failed`, `cancelled` из backend state, а не только локальные labels.
- Plain assistant text не должен быть исполняемым действием.

## Findings

### Finding 1

- title: No unified assistant/action/result message envelope
- type: architecture risk
- severity: high
- confidence: high
- evidence: Targeted search found no `messageType`, `actionId`, `executionId`, `assistant_response`, `action_proposal`, or `action_result` contract. Panel branches on endpoint/mode and on whether `result.plan` exists, then appends text via `appendChatMessage()`.
- impact: UI cannot reliably distinguish normal text, action proposal, confirmation-required action, read-only action, destructive action, error, and log as protocol states. Future features can accidentally make text look actionable or hide action state in formatted prose.
- minimal fix: add top-level `ae-agent-action-protocol.v1` envelope and require panel controls to be created only from `messageType:"action_proposal"`.
- verification: send assistant text containing JSON-like plan text and confirm no controls appear unless the backend message has `messageType:"action_proposal"`.

### Finding 2

- title: Agent intention is prompt-shaped JSON with implicit extraction
- type: reliability risk
- severity: high
- confidence: high
- evidence: `buildAePlanPrompt()` tells the model to "Return one JSON object"; `extractJsonObject()` parses either full JSON or the substring from first `{` to last `}`; `normalizeAgentPlan()` treats that as the plan.
- impact: The project has structured planning, but not robust function/tool-call semantics. Markdown/code blocks or extra prose can still pass if brace extraction succeeds; unrelated braces can break parsing or produce the wrong object.
- minimal fix: require strict JSON-only response for plan mode or move to an explicit tool/function-call style contract before creating action proposals.
- verification: test agent outputs with markdown fences, extra prose, and multiple JSON objects; only a single valid schema object should be accepted.

### Finding 3

- title: Plan validation exists, but message validation does not
- type: architecture risk
- severity: high
- confidence: high
- evidence: `validateAgentPlanObject()` validates `steps`, known planning tools, required tool fields, mutating counts, idempotency defaults, and classification. There is no comparable validation for a top-level assistant/action/result message schema.
- impact: A plan can be validated while the surrounding lifecycle, confirmation state, IDs, logs, and UI semantics remain implicit. This leaves important safety and UX behavior unenforced.
- minimal fix: validate both layers: `AgentActionMessage` envelope first, then `AgentPlan` payload.
- verification: malformed envelope with valid plan payload must be rejected before rendering action controls.

### Finding 4

- title: Confirmation boundary is enforced for plan-run, but not uniformly for direct tool calls
- type: security risk
- severity: high
- confidence: high
- evidence: `/agents/plan/run` checks `confirm:true`, `allowMutations:true`, protected edit session, and raw ExtendScript dry-run approval. `mcp-adapter.js` exposes MCP `tools/call`, and `exposedTools()` adds checkpoint/idempotency fields to mutating tools but not a universal confirmation requirement.
- impact: The safe path exists for panel Agent plans, but a direct MCP/tool caller can bypass the same UX/protocol confirmation layer unless each individual tool has its own guard.
- minimal fix: require the same confirmation envelope for all mutating/destructive/raw JSX tool calls, including `/tools/call` and MCP adapter.
- verification: call a mutating tool through MCP without confirmation envelope; it should be rejected before any AE command is queued.

### Finding 5

- title: Status lifecycle is local and incomplete
- type: bad UX
- severity: medium
- confidence: high
- evidence: Panel uses `chatInFlight`, `planRunInFlightMode`, inline status text, and run step statuses. Backend run steps have `pending/skipped/blocked/ready/completed/failed`. No protocol-level `awaiting_confirmation`, `executing_ae_action`, or `cancelled` state was found.
- impact: Long or failed operations can be shown as generic "Working" or text summaries. UI cannot reliably recover or resume from backend state.
- minimal fix: introduce lifecycle status in every agent/action message and expose a status endpoint keyed by `executionId`.
- verification: start a slow plan/run and confirm UI transitions through backend-reported states, not only local busy labels.

### Finding 6

- title: Stable IDs are fragmented
- type: observability risk
- severity: medium
- confidence: high
- evidence: Agent plan has `requestId`; plan run has `run.id`; AE command queue has `command.id`; tool logs have `eventId`; Hardcore has `sessionId`. No `actionId` or `executionId` was found, and IDs are not represented as one correlation chain.
- impact: Debugging a user-visible action across agent output, UI controls, backend run, tool call, AE command, and final display is unnecessarily hard.
- minimal fix: create `actionId` at proposal time and `executionId` at run time; include both in logs, run result, AE command metadata, and panel display.
- verification: one mutating plan run should be traceable by request/action/execution IDs across `ai-agent-chats.jsonl`, `bridge-events.jsonl`, UI display, and AE command result.

### Finding 7

- title: Preview before apply is partial, not a protocol guarantee
- type: product risk
- severity: medium
- confidence: high
- evidence: Panel shows formatted plan text and supports dry-run. `formatPlanRun()` labels dry-run as "preview only; project was not changed." But dry-run is part of plan-run behavior, not a general action proposal preview field.
- impact: Users get a useful preview for Agent Plan runs, but the UI cannot uniformly show "what will change" for every action kind or enforce that preview exists before mutating/destructive actions.
- minimal fix: require `actions[].preview` for mutating/destructive action proposals and block confirmation until preview is present or explicitly unavailable with a reason.
- verification: mutating action proposal without preview should render as blocked, not runnable.

### Finding 8

- title: Action journal exists backend-side, but not as a user-facing protocol ledger
- type: observability risk
- severity: medium
- confidence: medium
- evidence: `recordEvent()` and `appendAiChatEvent()` write JSONL events; panel logs compact strings like "Agent ... finished" or "Plan run ... finished". The UI does not display a structured action ledger with request/action/execution status.
- impact: The backend may have enough evidence for debugging, but users see summaries without consistent correlation details, especially after errors.
- minimal fix: expose and render a compact action journal keyed by `requestId/actionId/executionId`.
- verification: after a failed plan run, UI should show the action id, execution id, failing step, log file/event id, and recovery hint.

## M100 blocker assessment

Block M100 if M100 means "надежный agent workflow внутри панели":

- Add a top-level action message envelope with `messageType`, lifecycle `status`, `requestId`, `actionId`, `executionId`.
- Enforce that panel action buttons are created only from validated `action_proposal`, not from implicit `result.plan`.
- Enforce one confirmation boundary for all mutating/destructive/raw JSX paths, including `/agents/plan/run`, `/tools/call`, and MCP adapter.
- Add explicit risk categories: `read_only`, `mutating`, `destructive`, `unsafe`.
- Require preview/dry-run evidence before confirmation for mutating/destructive/raw JSX actions.
- Correlate logs and UI display with the same request/action/execution IDs.
- Add a `cancelled` state or explicitly mark cancellation unsupported in the protocol.

Not necessarily M100 blockers, but should follow soon:

- Better panel rendering of backend log/event details.
- Strict JSON-only agent plan parsing or function-call migration.
- More detailed action result display for AE line/context errors.

Overall conclusion: **протокол есть, но неполный; части протокола есть и частично enforced только внутри Agent Plan runner. Достаточно надежного end-to-end action protocol пока нет.**
