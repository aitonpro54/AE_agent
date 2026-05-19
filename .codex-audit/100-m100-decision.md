# 100 M100 Decision

## M100 goal

M100 должен дать минимальный безопасный vertical slice: пользователь открывает CEP panel, отправляет prompt, получает agent response или валидированное action proposal, явно подтверждает AE-действие, видит AE result/error и понятное конечное состояние без зависания или молчаливого выполнения.

## M100 non-goals

- Не чинить полный streaming Codex JSONL, cancel/retry endpoints и полноценный job/event bus; для M100 достаточно видимого running/final state, фазовых ошибок и доступного diagnostic trail.
- Не делать широкий refactor `cep-panel/panel.js`, миграцию на React/TypeScript или новый design system.
- Не добавлять package manager, CI, lint/typecheck stack или dependency-heavy test framework только ради M100.
- Не менять provider/model defaults и не решать freshness OpenRouter/OpenAI рекомендаций.
- Не добавлять shell action execution.
- Не удалять raw JSX полностью; в M100 достаточно сделать его gated/admin-style escape hatch с тем же confirmation boundary.
- Не переписывать все AE tools по отдельности до общего protocol/queue fix.
- Не запускать external-provider или mutating-live validation как default M100 check без явного approval.
- Не считать strict function/tool-call migration обязательной для M100, если минимальный action envelope валидируется до появления UI controls.
- Не решать Agent mode session memory mismatch; M100 может остаться single-request planning, если UI/diagnostics не вводят пользователя в заблуждение.

## Blockers

- blocker: AE command execution can report failure while still mutating After Effects later, and can treat malformed host output as success.
  - evidence: `.codex-audit/02-panel-to-after-effects.md` Findings 1, 2, 3; `.codex-audit/99-final-audit-report.md` "Must fix before M100" and "Minimal patch sequence" Step 1; `.codex-audit/05-build-test-qa.md` missing evalScript/AE host coverage.
  - user-visible impact: panel/agent can say an AE step failed or completed while the open AE project is changed later, out of order, or without a trustworthy structured result.
  - severity: critical
  - confidence: high
  - why this blocks M100: required flow steps 9-11 depend on AE requests returning accurate result/error and ending in completed/failed/cancelled, not a stale timeout plus later mutation.
  - smallest acceptable fix: remove timed-out commands from `pendingCommands`, make `/bridge/next` skip commands no longer in `inflightCommands`, add CEP/backend single-flight protection for `evalScript`, and make wrapped command parsing strict so empty/malformed wrapper output fails with a raw preview.
  - verification: low-timeout disconnected-panel test proves expired command is not executed after reconnect; two queued scripts prove the second is not submitted until the first result posts; fake empty/malformed evalScript results fail; late results are ignored with a clear diagnostic.

- blocker: There is no unified assistant/action/result envelope for the M100 flow.
  - evidence: `.codex-audit/03-agent-action-protocol.md` Findings 1, 3, 5, 6; `.codex-audit/99-final-audit-report.md` "Top 10 root causes" 1 and "Recommended M100 repair plan".
  - user-visible impact: the panel infers action controls from `result.plan`, while normal assistant text, action proposal, confirmation state, execution result, error, and logs are not first-class protocol messages.
  - severity: high
  - confidence: high
  - why this blocks M100: required flow steps 3, 4, 6, 7, 8, and 11 require a visible lifecycle and a reliable distinction between text response and executable AE action.
  - smallest acceptable fix: add a minimal v1 envelope with `messageType`, `status`, `requestId`, `actionId`, `executionId`, risk, confirmation state, summary, logs, and errors; render action controls only from validated `messageType:"action_proposal"`.
  - verification: assistant text containing JSON-like plan text does not create controls; a valid `action_proposal` does create controls; malformed envelope with valid-looking plan payload is rejected before controls render; IDs appear in UI/log output.

- blocker: Mutating/destructive/raw JSX confirmation is not enforced uniformly across execution paths.
  - evidence: `.codex-audit/02-panel-to-after-effects.md` Finding 4; `.codex-audit/03-agent-action-protocol.md` Finding 4; `.codex-audit/04-instructions-and-prompts.md` Findings 1 and 6.
  - user-visible impact: the safer `/agents/plan/run` path has gates, but direct `/tools/call`, MCP `tools/call`, `run_extendscript`, and `run_extendscript_file` can look like normal callable surfaces without the same user confirmation semantics.
  - severity: high
  - confidence: high
  - why this blocks M100: required flow steps 7 and 8 explicitly require that proposed AE actions are not executed silently and that the user confirms before execution.
  - smallest acceptable fix: enforce one risk/confirmation boundary before AE queueing for mutating/destructive/raw JSX calls, including direct tool and MCP adapter paths; require explicit confirmation/risk fields or reject with a clear blocked result.
  - verification: direct raw JSX or mutating tool call without confirmation is rejected before `/bridge/next`; confirmed safe path still works; panel plan-run and MCP direct-tool behavior use the same risk language.

- blocker: Agent execution is opaque and errors/correlation details are not sufficiently visible to the user.
  - evidence: `.codex-audit/01-panel-to-codex.md` Findings 1, 2, 4; `.codex-audit/03-agent-action-protocol.md` Finding 8; `.codex-audit/99-final-audit-report.md` "Critical flows" and "UX risks".
  - user-visible impact: long Codex work can look like "Bridge offline" or generic busy state; provider readiness, model timeout, stderr, request id, and log hints can be hidden when the user most needs them.
  - severity: high
  - confidence: high
  - why this blocks M100: required flow steps 2-6 and 11 require the panel to start the agent flow or clearly report why it cannot, show running state, expose stdout/stderr/errors or logs, display response, and end unambiguously.
  - smallest acceptable fix: separate bridge offline, provider readiness failure, model timeout, plan validation failure, and AE execution failure; show compact `requestId/actionId/executionId` and log/event hints; preserve provider/Codex stderr or raw diagnostic preview in a user-accessible log path.
  - verification: fake provider failure, delayed model timeout, malformed plan, and AE failure each show the correct phase, correlation id, recovery/log hint, and final failed state without leaving the panel busy.

- blocker: The M100 vertical flow lacks a safe deterministic local smoke.
  - evidence: `.codex-audit/05-build-test-qa.md` Findings "Full vertical M100 flow lacks a safe deterministic local smoke", "Codex CLI process mock does not cover `codex exec` JSONL behavior", and "evalScript and AE host behavior are not isolated enough"; `.codex-audit/99-final-audit-report.md` "Testing gaps".
  - user-visible impact: reviewers cannot prove the core workflow without live CEP/AE, external provider readiness, or protected live mutations, so regressions can survive until manual testing.
  - severity: high
  - confidence: high
  - why this blocks M100: M100 acceptance must be reproducible; otherwise the required prompt -> action proposal -> confirmation -> AE result/error flow is only aspirational.
  - smallest acceptable fix: add a deterministic fake-agent/fake-AE vertical smoke or panel-compatible harness, plus focused fake Codex JSONL and fake evalScript/AE host cases for the known failure modes.
  - verification: one local command proves prompt accepted, action proposal rendered, confirmation required, fake AE result/error displayed, final state set, and matching correlation IDs recorded without external provider or AE mutation.

## Not blockers

- issue: prompt is passed to Codex CLI as a command-line argument.
  - why deferred: audit marks this as medium severity; M100 can ship once length/leakage risk is documented or bounded, while core action safety and lifecycle issues are higher priority.
  - target milestone: M101

- issue: full streaming of Codex JSONL, progress deltas, cancel, and retry.
  - why deferred: M100 needs visible running/final state and diagnostics, not a complete event-stream architecture.
  - target milestone: M101

- issue: strict function/tool-call migration for plan creation.
  - why deferred: M100 can use a minimal validated action envelope first; stricter model-output semantics can follow after controls no longer come from implicit `result.plan`.
  - target milestone: M101

- issue: Agent mode is single-turn while Chat mode is sessionful.
  - why deferred: this is a UX/expectation issue, not a blocker for the minimal vertical slice if Agent mode behavior is not misrepresented.
  - target milestone: M101

- issue: broad CEP state-machine refactor.
  - why deferred: M100 should add only the minimal current-request/lifecycle guards needed for the vertical flow; broad cleanup can follow.
  - target milestone: M101

- issue: package-manager entrypoint, CI workflow, and full lint/typecheck layer.
  - why deferred: useful for reproducibility, but audit found the project intentionally uses standalone Node scripts; M100 can rely on focused local smokes and `node --check` for touched JS.
  - target milestone: M102

- issue: centralized full manual QA checklist and side-effect matrix.
  - why deferred: the M100 acceptance criteria below are enough for this decision; a broader reviewer checklist should be created after the protocol/queue patches settle.
  - target milestone: M101

- issue: custom ExtendScript serializer hardening for every control character, cycle, and host object.
  - why deferred: strict wrapper parsing and malformed-output failure are required now; deeper serializer hardening can be handled after the high-risk success/failure misclassification is fixed.
  - target milestone: M101

- issue: prompt registries, solution metadata freshness, config portability, and provider default freshness.
  - why deferred: these affect governance/setup quality but do not block the minimal safe panel-agent-AE vertical slice.
  - target milestone: later

- issue: full external-provider and mutating-live validation by default.
  - why deferred: audit notes explicitly treat external-provider and mutating-live scopes as approval-gated; local/fake verification should prove M100 first.
  - target milestone: later

## M100 acceptance criteria

1. User opens the CEP panel and sees a clear bridge/provider state: connected, unavailable, or misconfigured.
2. User sends a prompt from the panel.
3. Panel starts the Codex/agent flow or clearly reports why it cannot start, including the failing phase and a request/log hint when available.
4. UI shows a running state while agent work is active and cannot remain in an ambiguous busy state after timeout/failure.
5. stdout/stderr/provider errors/bridge errors are visible directly or logged in a user-accessible way with the same correlation id shown in the panel.
6. Agent response is displayed in the transcript without hanging the UI.
7. Plain assistant text cannot create executable AE controls; controls render only from a validated `action_proposal`.
8. If the agent proposes an AE action, mutating/destructive/raw JSX execution is not executed silently.
9. User explicitly confirms the proposed action before real AE execution.
10. Panel sends a JSX/AE request only after validation and required confirmation.
11. AE result or AE error returns to the panel with command/result correlation.
12. UI ends in `completed`, `failed`, or `cancelled`, not a vague `working` or stale state.
13. Expired AE commands are skipped and cannot execute later after reconnect.
14. CEP/bridge submits only one host `evalScript` command at a time for the active panel connection.
15. Empty or malformed wrapped evalScript output is a failed AE command, not `{ ok:true, raw:true }`.
16. Direct `/tools/call` and MCP mutating/raw JSX calls without the required confirmation envelope are rejected before AE queueing.
17. A local deterministic M100 smoke proves prompt -> action proposal -> confirmation -> fake AE result/error -> final UI/log state without external provider or live AE mutation.
18. Focused fake Codex JSONL coverage includes valid assistant text, delayed output/timeout, stderr, non-zero exit, no assistant text, and malformed JSONL.
19. Focused fake AE host coverage includes late result after timeout, concurrent command attempt, empty/malformed wrapper output, and host error variants.
20. Before declaring M100 done, touched JavaScript files pass `node --check`, `git diff --check` passes, and any skipped live/provider/mutating checks are explicitly recorded with the approval needed to run them.

## Recommended patch sequence

- name: Stabilize AE command execution
  - files likely touched: `mcp-server/bridge-daemon.js`, `cep-panel/panel.js`, one focused fake AE/bridge smoke under `scripts/`.
  - behavior change: expired commands are removed or skipped, host execution is single-flight, and malformed/empty wrapped output fails with a diagnostic preview.
  - risk: flows that previously treated unexpected AE output as success may start failing loudly.
  - verification: fake timeout/reconnect, two queued scripts, empty result, malformed JSON, late result, and host error cases.
  - rollback: revert the queue/single-flight/strict-parse changes and disable the new focused smoke.

- name: Add minimal action message envelope
  - files likely touched: `mcp-server/bridge-daemon.js`, `cep-panel/panel.js`, possibly a small protocol helper under `mcp-server/`, focused panel/protocol smoke fixtures.
  - behavior change: backend returns explicit `assistant_response`, `action_proposal`, `action_result`, and `error`-style messages with lifecycle status and IDs; panel creates controls only from validated proposals.
  - risk: existing plan formatting or smoke fixtures may need small compatibility updates.
  - verification: JSON-like assistant text does not create controls; valid proposal does; malformed envelope is blocked before rendering controls.
  - rollback: restore previous `result.plan` formatting/rendering path and remove envelope validation.

- name: Normalize confirmation and risk gates
  - files likely touched: `mcp-server/bridge-daemon.js`, `mcp-server/mcp-adapter.js`, tool schema/description surfaces, direct-tool smoke.
  - behavior change: mutating/destructive/raw JSX paths require the same confirmation/risk envelope before AE queueing, including `/agents/plan/run`, `/tools/call`, and MCP adapter calls.
  - risk: existing developer workflows that call raw tools directly will need explicit confirmation fields.
  - verification: raw/mutating direct calls without confirmation fail; confirmed calls still work; blocked errors include risk and required confirmation details.
  - rollback: temporarily allow legacy direct-tool calls behind an explicit local-dev/admin compatibility flag, then remove after callers are updated.

- name: Improve lifecycle and diagnostics
  - files likely touched: `cep-panel/panel.js`, `mcp-server/bridge-daemon.js`, `mcp-server/ai-agents.js`.
  - behavior change: UI distinguishes bridge offline, provider readiness failure, model timeout, plan validation failure, and AE execution failure; visible errors include request/action/execution/log IDs.
  - risk: additional UI text can become noisy if not compact.
  - verification: fake provider readiness failure, delayed model timeout, malformed plan, and AE failure all show correct phase, IDs, and final failed state.
  - rollback: keep backend error shape but hide expanded details behind a compact "details/log" section.

- name: Add deterministic M100 vertical smoke
  - files likely touched: new or updated script under `scripts/`, fake agent/fake AE fixtures, possible small injection seams in bridge/panel test harness.
  - behavior change: one local command proves the complete M100 protocol without external provider, live CEP/AE, or project mutation.
  - risk: harness can grow too large if it tries to reproduce full CEP/AE instead of the minimal protocol.
  - verification: local smoke fails when proposal lacks action ID, confirmation is skipped, AE result/error is not displayed, final state is ambiguous, or correlation IDs do not match.
  - rollback: keep lower-level fake Codex/fake AE smokes and remove only the combined vertical harness if it becomes unstable.

## First patch recommendation

Start with **Stabilize AE command execution**.

It is the smallest first patch with the highest diagnostic and safety value: it does not require changing the agent planner, provider integration, or UI architecture, but it turns the most dangerous audit finding into deterministic behavior. After this patch, a timed-out command cannot mutate AE later, host calls cannot overlap silently, and broken wrapper output becomes a visible AE failure instead of a false success. That gives every later protocol and UI patch a trustworthy execution boundary to build on.
