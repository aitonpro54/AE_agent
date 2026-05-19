# 99 Final Audit Report

## Executive summary

Проект ощущается нестабильным не потому, что в нем нет архитектуры. Наоборот, архитектурная идея уже видна: тонкая CEP-панель, локальный bridge daemon, Codex/provider слой и After Effects host через JSX. Нестабильность появляется потому, что между этими частями нет одного сквозного runtime-протокола действия.

Сейчас критические операции проходят через несколько частных контрактов: долгий XHR для агента, prompt-shaped JSON для плана, очередь AE-команд для `evalScript`, отдельные JSONL-логи, локальные busy-флаги в панели. Эти контракты не объединены в единый lifecycle с `requestId -> actionId -> executionId -> AE command id`, поэтому пользователь видит "работает/сломалось", а не понятное состояние: агент думает, план готов, ждет подтверждения, выполняется в AE, завершено, отменено, ошибка в конкретной фазе.

Самые опасные технические симптомы:

- агентские запросы идут как один непрозрачный HTTP-запрос с таймаутом около 120 секунд, без streaming/status/cancel;
- AE-команда, истекшая по таймауту на backend, может позже все равно выполниться в After Effects;
- CEP может отправить несколько `evalScript` подряд без ожидания результата предыдущего;
- malformed/empty результат `evalScript` может быть принят как success;
- safety gates сильнее в `/agents/plan/run`, чем в direct `/tools/call`/MCP/raw JSX путях;
- ошибки и логи имеют полезные IDs backend-side, но UI часто показывает только сжатую строку без корреляции.

Итог: проект уже близок к полезной M100-форме, но перед M100 ему нужен не новый большой feature layer, а ремонт протокола, lifecycle, safety boundary и минимальной воспроизводимой QA-вертикали.

## Product intent

Продукт должен быть локальной After Effects agent-панелью:

- пользователь пишет естественный prompt в CEP UI;
- агент/Codex/provider не меняет проект напрямую, а предлагает структурированный AE plan;
- daemon валидирует план, классифицирует риск, требует preview/dry-run, checkpoint/edit-session/idempotency/verification;
- пользователь явно подтверждает mutating/destructive/raw JSX действие;
- только после этого backend исполняет typed AE tools или строго gated JSX через CEP `evalScript`;
- панель показывает понятный lifecycle, результат, ошибку, лог и recovery hint;
- ChatGPT connector остается read-only bridge proxy плюс disabled-by-default gated JSX Lab, а не полноценным write-провайдером;
- Codex CLI/API provider используется для рассуждения/планирования, но не для shell/workspace edits.

Главный продуктовый смысл: "попросить AE сделать работу через агента" должно ощущаться как безопасный управляемый workflow, а не как черный ящик, который иногда меняет проект и иногда молчит.

## Actual implementation

Фактически реализовано следующее:

- CEP UI находится в `cep-panel/index.html`, `cep-panel/panel.js`, `cep-panel/style.css`. `panel.js` владеет provider UI, chat/agent/hardcore режимами, localStorage history, connection state, polling, dry-run/run controls, formatting и activity log.
- Локальный daemon в `mcp-server/bridge-daemon.js` обслуживает HTTP endpoints: health, bridge polling/result, tools, agent chat/plan/hardcore, validation/run/dev flows.
- Codex/provider слой в `mcp-server/ai-agents.js` проверяет provider readiness и для Codex CLI вызывает `codex exec --ephemeral --json --sandbox read-only --model ... --cd <cwd> <prompt>`.
- Codex CLI stdout/stderr буферизуются до завершения процесса, затем stdout парсится как JSONL, а в UI возвращается только финальный assistant text.
- AE execution идет через очередь: backend кладет `{ id, script }`, CEP polling забирает `/bridge/next`, вызывает `cs.evalScript(script, callback)`, затем постит `/bridge/result`.
- Agent Plan mode просит модель вернуть JSON object с `summary`, `risk`, `steps[]`; backend валидирует plan object, классифицирует риск и запускает dry-run/real-run через `/agents/plan/run`.
- Safety gates есть, но распределены по путям. Plan-run имеет `confirm`, `allowMutations`, raw dry-run gate, checkpoint/edit-session protection. Direct `/tools/call` и MCP raw JSX surfaces выглядят слабее.
- QA построена вокруг standalone smoke scripts. `package.json`, package scripts, CI config, lint/typecheck runner не обнаружены. Есть много полезных smoke scripts, но нет одного safe deterministic local M100 vertical smoke.

## Runtime architecture

### CEP UI

Intended boundary: тонкий клиент, который показывает состояние, принимает prompt/confirmation, исполняет только bridge-provided AE commands через `CSInterface.evalScript`, но не владеет бизнес-логикой safety.

Actual boundary: CEP панель стала большим runtime surface. Она держит глобальные флаги вроде `chatInFlight`, `pollInFlight`, `lastPlanResult`, `lastAcceptedDryRun`, форматирует agent plans/runs, решает когда показывать inline controls, хранит transcript и сама интерпретирует часть lifecycle. Она также является AE command executor через polling loop.

Risk: слишком много UI-state и protocol-state живет в одном browser runtime без сквозного request/action state machine.

### Codex / agent process

Intended boundary: daemon/provider слой должен принимать prompt, создавать request/job, проверять provider readiness, строить bounded context, возвращать structured assistant/action messages и сохранять наблюдаемые logs.

Actual boundary: daemon делает много правильных вещей, но agent call все еще похож на синхронный RPC. Codex CLI запускается subprocess-ом, prompt передается positional command-line argument, stdout/stderr буферизуются, panel получает один финальный JSON response. Streaming JSONL, progress events, cancel/status endpoint и user-visible diagnostic envelope не стали частью базового flow.

Risk: долгие agent calls выглядят как зависание или "Bridge offline", а не как понятный job lifecycle.

### After Effects / JSX host

Intended boundary: AE host должен получать только валидированные, актуальные, подтвержденные команды, выполнять их по одной, возвращать строгий structured result/error, а timeout/cancel должны означать, что команда не применится позднее.

Actual boundary: backend queue и CEP polling реализуют минимальный command protocol `{ id, script } -> { id, ok, result, error }`. Но timeout удаляет inflight entry, не обязательно удаляя pending command; CEP polling может отправлять следующую команду до завершения предыдущей; malformed wrapper output может трактоваться как success.

Risk: это самая важная M100-граница. Именно здесь "ошибка" может превратиться в позднее фактическое изменение AE-проекта.

## Critical flows

### 1. user prompt -> panel -> Codex -> panel

**Intended flow**

1. Panel создает local request id и отправляет structured request.
2. Backend принимает job, возвращает accepted/started state.
3. UI видит стадии: queued, readiness check, running agent, receiving output, completed/failed/cancelled.
4. Agent output приходит как typed message: assistant response или action proposal.
5. Ошибки показывают phase, request id, provider/codex diagnostic и log hint.

**Actual flow**

1. `sendChat()` читает textarea, выбирает mode и endpoint: `/agents/chat`, `/agents/plan`, `/agents/hardcore/run`.
2. Panel отправляет один XHR с `timeout` около 120 секунд.
3. Chat mode отправляет bounded transcript, Agent mode отправляет single-turn prompt.
4. Backend строит prompt/context и вызывает provider/Codex.
5. `runCodexCli()` буферизует stdout/stderr до process close и парсит JSONL.
6. Panel получает один финальный response или error, добавляет assistant/error message и сбрасывает busy state.

**Breakpoints**

- Долгая работа агента выглядит как timeout/offline, а не как running/timeout в model phase.
- Codex JSONL не стримится в UI.
- Нет cancel endpoint и нет user-visible job status.
- Agent mode single-turn, хотя UI может ощущаться как conversation.
- Backend error details (`requestId`, readiness, providerError) часто не доходят до видимого UI.
- Prompt передается Codex CLI как process argument, что создает leakage/length risk.

**Evidence**

- `.codex-audit/01-panel-to-codex.md`: findings про 120s timeout, JSONL buffering, prompt in CLI args, hidden correlation details, shared boolean lifecycle.
- `.codex-audit/03-agent-action-protocol.md`: no unified message envelope, fragmented IDs, incomplete lifecycle.
- `.codex-audit/05-build-test-qa.md`: нет fake `codex exec --json` subprocess smoke для delayed/malformed/valid JSONL paths.

### 2. panel -> AE bridge -> JSX -> AE -> panel

**Intended flow**

1. Backend ставит только актуальную валидированную AE command в очередь.
2. CEP исполняет одну host command за раз.
3. Timeout/cancel гарантируют, что command больше не будет доставлена в AE.
4. `evalScript` result должен быть строгим wrapper JSON.
5. Ошибка AE должна вернуться с line/context и быть видимой в panel run summary.

**Actual flow**

1. Backend `runExtendScriptBody()` оборачивает JSX и вызывает `enqueueAeCommand()`.
2. Команда попадает в `pendingCommands` и `inflightCommands`.
3. CEP `poll()` получает command через `/bridge/next`.
4. `executeCommand()` вызывает `cs.evalScript(command.script, callback)`.
5. Callback постит `/bridge/result`.
6. Backend парсит wrapper JSON. Если JSON parse падает, raw response может быть принят как success.

**Breakpoints**

- Timed-out pending command может позже выполниться в AE, хотя backend уже считает ее failed.
- CEP может dispatch несколько `evalScript` без hostCommandInFlight gate.
- Empty/malformed evalScript output может стать `{ ok:true, raw:true }`.
- Host failure detection зависит от narrow prefix `EvalScript error.`.
- AE line/context details могут не попасть в видимый panel run summary.

**Evidence**

- `.codex-audit/02-panel-to-after-effects.md`: critical finding про timed-out pending commands; high findings про concurrent evalScript и malformed result success.
- `.codex-audit/05-build-test-qa.md`: нет isolated `CSInterface.evalScript` / AE host mock для timeout, concurrency, empty/malformed wrapper, error variants, Unicode/control chars.

### 3. agent proposal -> confirmation -> AE action -> result

**Intended flow**

1. Agent возвращает validated `action_proposal`, а не просто произвольный текст/JSON.
2. Proposal имеет `actionId`, risk category, preview, confirmation requirement и blocked reasons.
3. Panel создает controls только из `messageType:"action_proposal"`.
4. Confirmation создает `executionId`.
5. Все mutating/destructive/raw JSX пути проходят один safety envelope.
6. Result возвращается как `action_result` с status, logs, errors, AE command ids.

**Actual flow**

1. Agent получает prompt "Return one JSON object".
2. Backend парсит JSON напрямую или извлекает substring от первой `{` до последней `}`.
3. Plan object валидируется и классифицируется.
4. Panel видит `result.plan`, форматирует его текстом и добавляет inline dry-run/run controls.
5. `/agents/plan/run` имеет сильные gates, включая `confirm`, `allowMutations`, raw dry-run id.
6. Direct `/tools/call`/MCP raw tool path не имеет такого же единого envelope.

**Breakpoints**

- Нет top-level `messageType`, `actionId`, `executionId`.
- Plain assistant response и action proposal различаются endpoint/mode/shape, а не строгой schema.
- Strict JSON prompt конфликтует с forgiving extraction parser.
- Confirmation policy разная для Run button, raw dry-run id, connector candidate hash и direct tools.
- Preview is partial, not protocol-guaranteed.
- Logs backend-side богаче, чем user-facing action journal.

**Evidence**

- `.codex-audit/03-agent-action-protocol.md`: no unified assistant/action/result message envelope, prompt-shaped JSON, fragmented IDs, incomplete lifecycle.
- `.codex-audit/04-instructions-and-prompts.md`: conflicts around direct raw JSX tools, strict prompt vs parser, confirmation by risk level, audit/dev instruction conflicts.

## Top M100 blockers

| blocker | severity | evidence | impact | smallest fix | verification |
|---|---:|---|---|---|---|
| Timed-out AE commands can still execute later | Critical | `.codex-audit/02-panel-to-after-effects.md` Finding 1 | Panel/agent can report failure while AE project changes anyway | Remove expired command from `pendingCommands`; skip non-inflight commands in `/bridge/next`; add expired/cancelled contract | Low timeout, disconnected panel, reconnect after timeout; expired command must not execute |
| No unified assistant/action/result envelope | High | `.codex-audit/03-agent-action-protocol.md` Finding 1 | UI cannot reliably distinguish text, proposal, confirmation, result, error, log | Add `ae-agent-action-protocol.v1` envelope with `messageType`, `status`, `requestId`, `actionId`, `executionId` | Assistant text containing JSON-like plan must not create controls unless `messageType:"action_proposal"` |
| Direct raw JSX/tool calls bypass uniform confirmation | High | `.codex-audit/02-panel-to-after-effects.md` Finding 4; `.codex-audit/04-instructions-and-prompts.md` Finding 1 | Direct MCP/tool caller can reach mutating/raw execution without same panel safety semantics | Enforce risk/confirmation envelope in `/tools/call`, MCP adapter, `run_extendscript`, `run_extendscript_file` | Direct raw JSX call without confirmation must be rejected before AE queueing |
| Agent calls are opaque long XHRs with no job lifecycle | High | `.codex-audit/01-panel-to-codex.md` Findings 1-2 | Long work looks frozen/offline; no progress, cancel, or recovery | Add job/status polling or event stream; at minimum separate model timeout from bridge offline and expose request id | Delayed fake agent response shows running/timeout state, not bridge offline |
| Malformed/empty evalScript result is treated as success | High | `.codex-audit/02-panel-to-after-effects.md` Finding 3 | Broken host/wrapper can mark AE step completed incorrectly | Make wrapped commands strict: non-JSON wrapper output is failure with raw preview | Fake empty/malformed result must fail plan run |
| CEP can dispatch concurrent evalScript calls | High | `.codex-audit/02-panel-to-after-effects.md` Finding 2 | Mutations/readbacks/verification can race or appear out of order | Add CEP-side `hostCommandInFlight` gate or backend one-command lease | Two queued scripts: second is not submitted until first result posts |
| Error/correlation details are hidden in UI | Medium-High | `.codex-audit/01-panel-to-codex.md` Finding 4; `.codex-audit/03-agent-action-protocol.md` Finding 8 | User cannot map visible failure to backend logs or failing phase | Render compact `requestId/actionId/executionId`, provider error, AE command id, log hint | Forced provider and AE failures show IDs and phase in panel |
| Plan proposal relies on prompt JSON extraction | Medium-High | `.codex-audit/03-agent-action-protocol.md` Finding 2; `.codex-audit/04-instructions-and-prompts.md` Finding 2 | Model-format regressions can be silently accepted or misparsed | Strict JSON-only for action proposal creation, or explicit function/tool-call style contract | Markdown/prose/multiple JSON objects behave exactly as documented |
| Full vertical M100 flow has no safe deterministic local smoke | High | `.codex-audit/05-build-test-qa.md` Missing tests and Finding "Full vertical M100 flow..." | Core workflow cannot be validated without AE/provider/live mutation | Add fake-agent/fake-AE vertical smoke for prompt -> proposal -> confirm -> fake AE result | One local command proves full protocol without external provider or AE mutation |
| Codex CLI JSONL behavior lacks fake exec coverage | High | `.codex-audit/05-build-test-qa.md` Finding "Codex CLI process mock..." | JSONL parser, stderr, timeout, no-assistant cases can regress silently | Add fake `codex exec --json` runner/executable smoke | Valid, delayed, malformed, stderr, no assistant, non-zero and timeout cases covered |

## Top 10 root causes

### 1. Boundary contracts evolved locally instead of as one protocol

- cause: panel, agent endpoints, plan runner, AE queue and logs each have their own contract.
- evidence: no `messageType`, `actionId`, `executionId`; IDs exist as `requestId`, `run.id`, `command.id`, `eventId`, `sessionId`.
- confidence: high
- fix direction: define one top-level action/result envelope and make all flows map into it.

### 2. Long operations are modeled as synchronous HTTP responses

- cause: agent planning and Codex subprocess output are hidden behind one XHR.
- evidence: panel timeout around 120 seconds; Codex stdout/stderr buffered until close; no cancel/status endpoint.
- confidence: high
- fix direction: convert to job lifecycle with status polling/streaming and explicit timeout phases.

### 3. CEP panel owns too much runtime state

- cause: `panel.js` combines UI rendering, provider setup, chat history, plan controls, AE polling and command execution.
- evidence: shared flags like `chatInFlight`, `pollInFlight`, `planRunInFlightMode`, `lastPlanResult`, `lastAcceptedDryRun`.
- confidence: medium-high
- fix direction: introduce small state machines for agent request and AE host execution before broader refactors.

### 4. AE host is treated like a reliable RPC endpoint

- cause: `evalScript` is asynchronous host execution with weak error semantics, but bridge treats it as command/result RPC.
- evidence: no CEP-side evalScript in-flight gate; narrow `EvalScript error.` prefix; malformed wrapper output success fallback.
- confidence: high
- fix direction: make AE command execution single-flight, strict, cancellable/expirable, and testable with a host mock.

### 5. Safety is path-based, not capability-based

- cause: `/agents/plan/run` has strong gates, while direct tools/raw JSX rely on weaker local descriptions or individual guards.
- evidence: direct `run_extendscript` and `run_extendscript_file` schemas require only script/filePath in audited notes.
- confidence: high
- fix direction: enforce risk/confirmation/checkpoint policy at the tool boundary, not only at plan-run.

### 6. Prompt contracts are doing schema work

- cause: the model is instructed to return JSON, but acceptance uses parsing/repair heuristics.
- evidence: "Return JSON only" prompt vs extraction from first `{` to last `}`.
- confidence: high
- fix direction: strict envelope validation before UI controls; keep repair only as non-executing assistance if needed.

### 7. Observability exists but is not user-facing enough

- cause: backend writes JSONL logs, but panel displays compact text without correlation chain.
- evidence: backend logs `bridge-events`, `ai-agent-chats`, etc.; panel often shows only error message/status.
- confidence: high
- fix direction: show request/action/execution/log IDs in UI failures and smoke outputs.

### 8. QA grew as smoke scripts, not as a product verification contract

- cause: many useful scripts exist, but no package-manager entrypoint, CI, side-effect matrix or central M100 checklist.
- evidence: no `package.json`, no `.github`, no lint/typecheck runner, no safe local full vertical smoke.
- confidence: high
- fix direction: create package-free local check command/index and deterministic M100 vertical smoke.

### 9. Instructions mix development, audit, live validation and safety scopes

- cause: AGENTS/README/plan history have broad milestone and validation rules that can conflict with audit-only or user stop-conditions.
- evidence: audit found conflicts around full smoke list, commits after milestones, external-provider/mutating-live approvals.
- confidence: high
- fix direction: define precedence, audit-only exception, validation scopes and explicit approval gates in one place.

### 10. Raw escape hatches are not isolated as admin-only surfaces

- cause: raw JSX tools are useful for development/recovery but appear near normal tools.
- evidence: README/tool descriptions list raw tools as current MVP tools; ChatGPT JSX Lab has stronger gate language than MCP raw tools.
- confidence: medium-high
- fix direction: either route raw execution through the same action protocol or clearly mark/enforce it as developer/admin-only.

## Security risks

### Shell execution

- Main Codex CLI invocation uses `spawn(command, args)` without shell, so ordinary shell injection risk is lower.
- Prompt is passed as command-line argument, so sensitive text can appear in process listings/telemetry and large prompts can hit command-line length limits.
- Windows login launch path uses `cmd.exe /c start`, increasing quoting risk if CLI path is user-controlled or unusual.
- There is no general shell action protocol. That is good for M100. If shell actions are ever added, they should be deny-by-default and separate from assistant text.

### Command injection

- Main `codex exec` args-array shape is safer than string shell execution.
- Risk remains in any path that eventually builds command strings, login helpers, install/start scripts, or future dev-request flows.
- Smallest direction: keep subprocess calls shell-free by default; validate any explicit executable path; never treat agent text as shell.

### JSX execution

- JSX is the highest-risk execution surface because it mutates an open AE project.
- `/agents/plan/run` has meaningful gates, but direct `run_extendscript` / `run_extendscript_file` paths are not uniformly wrapped in the same confirmation envelope.
- Raw JSX fallback in Hardcore is conceptually bounded, but the permission model is under-specified to users.
- Timeout bug means "failed" can still become "executed later", which is both safety and trust risk.

### Filesystem access

- `run_extendscript_file` resolves script files inside `PROJECT_ROOT` by default, with opt-out through environment.
- Codex CLI is run with `--cd <process.cwd()>` and inherited environment, so local project context and environment are available to the subprocess.
- Install/sync scripts copy CEP files and can clear CEP cache; this is expected but should be scoped in QA docs.

### Secrets and logs

- `.codex/agent-secrets.json` exists as local provider secret store; audit correctly avoided reading raw secrets.
- Inherited `process.env` and prompt-in-argv increase accidental leakage risk.
- Backend JSONL logs may include prompts, provider errors, paths and diagnostic text.
- UI currently hides too much diagnostic detail, while logs may contain too much raw detail. M100 should separate redacted user-visible diagnostics from protected logs.

### Destructive actions

- Mutating tools, checkpoints, edit sessions and idempotency exist, but there is no universal `read_only | mutating | destructive | unsafe` action envelope.
- Direct MCP/tool calls and raw JSX should not be allowed to bypass the same confirmation/checkpoint policy as panel plan-run.
- Destructive cleanup/delete/test-item actions need explicit risk category, confirmation level and verification.

## UX risks

### No visible lifecycle

The user sees busy/error/completed symptoms, not a stable lifecycle. Missing visible states include `queued`, `running_agent`, `awaiting_confirmation`, `executing_ae_action`, `completed`, `failed`, `cancelled`.

### Hidden errors

Backend may know `requestId`, provider readiness, providerError, AE line/context, event IDs and logs, but panel can reduce this to a generic message. This makes the system feel random.

### No progress

Codex JSONL and AE execution phases are not streamed to the panel. Long operations have no meaningful progress, phase label or "still working" evidence.

### No confirmation clarity

"Confirmation" means different things in different places: Run button click, `confirm:true`, raw dry-run id, connector candidate hash, generated prefix, direct tool call. Users need risk-specific confirmation semantics.

### No retry/cancel

No user-facing cancel endpoint was found for agent jobs or AE command execution. Retry is not a clear protocol concept. Timeouts do not guarantee non-execution in the AE queue.

### Ambiguous agent output

Agent plan controls appear from `result.plan` shape, not from a validated `action_proposal` message. Text, JSON-like text and actionable proposal are not first-class separate UI types.

### Stale or inconsistent state

Shared panel booleans and localStorage history can make reconnects, mode switches, slow callbacks and stale plans confusing. `loadAgents()` has a sequence guard, but agent chat/plan response handling lacks a comparable request correlation model.

## Testing gaps

- No package-manager entrypoint, no `npm test`/`npm run check`, no CI workflow.
- No lint/typecheck layer beyond `node --check` and `git diff --check`.
- No isolated unit harness for CEP panel state machines.
- No fake `codex exec --json` process smoke covering valid JSONL, delayed output, stderr, non-zero exit, missing assistant text, malformed JSONL and timeout.
- No isolated `CSInterface.evalScript` / AE host mock covering ordering, empty result, malformed wrapper JSON, error string variants, timeout, late result and concurrent calls.
- No deterministic local non-mutating full vertical M100 smoke for `user prompt -> action proposal -> UI controls -> confirmation -> fake AE result/error -> transcript/log display`.
- No direct test proving expired AE commands are removed/skipped before reconnect.
- No direct test proving malformed/empty wrapped evalScript result fails.
- No centralized manual QA checklist current to AE Agent 1.0.11.
- No QA assertion that panel, smoke output and backend JSONL share one request/action/execution/AE command correlation chain.
- Smoke scripts are useful but have side effects. Some write logs/temp artifacts, some require live CEP/AE, some require external provider approval, and some can mutate generated AE items.

## Recommended M100 repair plan

### Must fix before M100

- Fix AE queue correctness: expired pending commands must not execute; host commands must be single-flight; wrapper JSON parsing must be strict.
- Add minimal action protocol envelope with `messageType`, `status`, `requestId`, `actionId`, `executionId`, risk and confirmation state.
- Render action controls only from validated `action_proposal`, not from implicit `result.plan`.
- Enforce one confirmation/risk boundary for all mutating/destructive/raw JSX paths, including `/agents/plan/run`, `/tools/call` and MCP adapter.
- Separate bridge offline, model timeout, provider readiness failure, plan validation failure and AE execution failure in user-visible errors.
- Show correlation IDs and log/event hints in panel failures.
- Add deterministic local M100 vertical smoke with fake agent and fake AE executor.
- Add fake Codex JSONL and fake evalScript/AE host tests for the known failure modes.
- Centralize M100 manual QA checklist and validation side-effect matrix.

### Should fix in M101

- Stream Codex JSONL or expose richer job events to the panel.
- Add explicit cancel/retry endpoints and UI controls.
- Refactor CEP state into small request/action/host-execution state machines.
- Move plan parsing toward strict function/tool-call style semantics or strict JSON-only action creation.
- Add package-free `scripts/check-local.*` entrypoint or a lightweight package-manager check layer if the project accepts dependencies.
- Improve user-facing action journal with compact structured logs.
- Clarify AGENTS/README validation scopes: audit-only, local/offline, read-only live, external-provider, mutating-live.
- Normalize Hardcore "bounded autonomy" docs and UI wording.

### Defer

- Full TypeScript/React migration.
- Broad design system/UI redesign.
- Adding new provider features before protocol repair.
- Full external-provider CI.
- Live mutating AE automation in default validation.
- Tool-by-tool rewrite of every AE operation before the shared protocol and queue fixes land.
- Shell execution features.
- Removing raw JSX entirely before a safer admin/developer escape hatch is defined.

## Minimal patch sequence

### Step 1. Stabilize AE command execution

- files likely touched: `mcp-server/bridge-daemon.js`, `cep-panel/panel.js`, new/updated focused smoke under `scripts/`.
- expected behavior change: expired commands are removed/skipped; CEP sends only one `evalScript` at a time; non-wrapper output from wrapped commands fails with diagnostic preview.
- risk: existing tests or manual flows may reveal latent malformed AE returns that were previously hidden as success.
- verification: fake AE/bridge tests for late reconnect after timeout, two queued scripts, empty result, malformed JSON, non-standard error string.

### Step 2. Add minimal action message envelope for Agent Plan results

- files likely touched: `mcp-server/bridge-daemon.js`, `cep-panel/panel.js`, possibly a small protocol helper under `mcp-server/`.
- expected behavior change: backend returns `messageType:"action_proposal"` for plans; panel renders controls only from validated proposals; assistant text remains non-actionable.
- risk: compatibility with current panel formatting and existing smoke fixtures.
- verification: JSON-like assistant text does not create controls; valid proposal does; malformed envelope is shown as blocked/error.

### Step 3. Normalize confirmation and risk gates

- files likely touched: `mcp-server/bridge-daemon.js`, `mcp-server/mcp-adapter.js`, tool schemas/descriptions, focused direct-tool smoke.
- expected behavior change: mutating/destructive/raw JSX direct tool calls require explicit confirmation/risk fields or are rejected before AE queueing.
- risk: developer workflows using raw tools directly will need updated invocation fields.
- verification: `/tools/call` and MCP calls to raw/mutating tools without confirmation fail; confirmed safe path still works.

### Step 4. Improve agent lifecycle and error diagnostics

- files likely touched: `cep-panel/panel.js`, `mcp-server/bridge-daemon.js`, `mcp-server/ai-agents.js`.
- expected behavior change: UI distinguishes bridge offline, provider readiness, model timeout, validation failure and AE failure; visible errors include request/log IDs.
- risk: more detailed UI text can become noisy if not compact.
- verification: fake delayed agent timeout, provider failure, malformed plan and AE failure all show correct phase and correlation IDs.

### Step 5. Add deterministic local M100 vertical smoke

- files likely touched: new script under `scripts/`, maybe fixtures under `scripts/`.
- expected behavior change: one local command proves prompt -> structured action proposal -> UI/action controls or panel-compatible renderer -> confirmation -> fake AE result/error -> logs/correlation.
- risk: if it tries to drive full CEP without AE, harness complexity can grow. Keep it narrow and deterministic.
- verification: command runs without external provider, live AE or mutating project state and fails on missing action IDs, missing confirmation, missing result display.

### Step 6. Add Codex JSONL and evalScript failure-mode coverage

- files likely touched: `scripts/provider-contract-smoke.js` or new Codex CLI smoke, new AE host harness script, possibly small injection seams in `mcp-server/ai-agents.js`/`cep-panel/panel.js`.
- expected behavior change: parser/timeout/stderr regressions and AE host contract regressions are caught cheaply.
- risk: small testability seams may need careful design to avoid production behavior change.
- verification: valid, delayed, malformed, stderr, no-assistant, non-zero and timeout Codex cases; evalScript ordering, late result, malformed wrapper and Unicode/control chars.

### Step 7. Align docs and QA scopes

- files likely touched: `AGENTS.md`, `README.md`, maybe `docs/` or `plans/target-app-execplan.md`.
- expected behavior change: audit-only work, local/offline checks, read-only live checks, external-provider and mutating-live scopes are unambiguous; M100 checklist is current.
- risk: documentation churn if done before protocol details settle.
- verification: reviewer can identify the correct check set without reading historical plan entries; audit-only prompt does not imply code edits, commits or full smoke suite.

## Do not do yet

- Do not start a broad rewrite of `panel.js` before fixing AE queue correctness and action protocol.
- Do not add a package manager or large dependency stack just to get tests running.
- Do not run external-provider or mutating-live validation as a default M100 check.
- Do not expand Agent Hardcore autonomy until the shared action/confirmation protocol is enforced.
- Do not implement shell actions.
- Do not treat stricter prompt wording as sufficient safety. Enforcement must be in schema/protocol/gates.
- Do not remove raw JSX tools abruptly if they are still needed for development recovery; first make them explicit admin/escape-hatch surfaces with confirmation.
- Do not optimize UI polish before users can see lifecycle, progress, failures and correlation IDs.
- Do not rely on historical plan entries as the manual QA checklist. Create a current checklist instead.
