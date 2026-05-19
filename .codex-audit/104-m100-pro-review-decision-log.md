# M100 Pro Review Decision Log

## Current status, 2026-05-19

GPT Pro review has been received for `pro-review-bundles/m100-repair-plan-pro-review-bundle.md`.

- Verdict: `revise`.
- Implementation status: do not start runtime M100 patches from the old five-patch plan.
- Accepted first action: revise `.codex-audit/101-m100-repair-plan.md` before implementation.
- Smallest safer first implementation patch after the revision: Patch 1a, AE command contract tests plus pre-delivery expiry fix.

This section supersedes the older pending-review status below, which was written before the Pro response was pasted back into Codex.

## Pro findings accepted

- The M100 blockers are directionally correct, but the plan was under-specified around server-owned proposal/confirmation state and AE timeout semantics after delivery to CEP/AE.
- Backend must be the sole authority that creates `actionId`, `executionId`, `payloadRef`, canonical risk classification, executable payload storage and confirmation proof.
- Model output is only a candidate. It must not create executable `action_proposal` messages directly.
- Confirmation must be single-use, expiry-bound and tied to `requestId`, `actionId`, `payloadHash`, `previewHash`, `riskLevel`, `riskPolicyVersion`, confirmation surface/session and token hash.
- `/tools/call`, MCP `tools/call`, `run_extendscript` and `run_extendscript_file` must not accept client-supplied `confirmed:true` as an execution boundary.
- AE queue needs explicit states: `queued`, `expired_before_delivery`, `leased`, `submitted`, `completed`, `failed`, `timed_out_after_submit`, `stale_result_ignored`.
- Timeout only guarantees non-execution while a command is still pre-delivery. Once leased/submitted, the UI must show unknown/stale semantics rather than "safe failure".
- Legacy executable controls from `result.plan` must be removed or hard-disabled across live rendering, restored transcript/localStorage and compatibility fixtures.
- Diagnostics shown in the panel must be redacted and length-capped before display.
- Failure-contract smokes must start before queue/protocol implementation, not only at the end.

## Pro findings deferred or scoped

- Full Codex JSONL streaming, event bus, cancel/retry endpoints, React/TypeScript migration, dependency-heavy test framework, provider/model default changes, shell actions and default mutating-live validation remain out of scope for M100.
- Raw JSX remains available only as an explicit local-dev/admin escape hatch outside the M100 user-safe path.
- Full tool-by-tool rewrite is deferred until shared protocol, risk registry and queue semantics exist.

## Repair plan changes made

- `.codex-audit/101-m100-repair-plan.md` now contains a Pro review revision section with verdict `revise`.
- Patch sequence is revised from five broad patches to:
  - Patch 0: safety inventory and default-deny freeze.
  - Patch 1a: AE command lifecycle contract and pre-delivery expiry.
  - Patch 1b: CEP single-flight and strict AE wrapper parsing.
  - Patch 2: server-owned proposal registry and legacy-control removal.
  - Patch 3: single-use confirmation gate and direct-tool proposal requirement.
  - Patch 4: lifecycle diagnostics and redaction.
  - Patch 5: deterministic M100 vertical smoke.
- M100 data contract now records backend-created proposal requirements, `payloadHash`, `previewHash`, `proposalExpiresAt`, `riskPolicyVersion`, server-side payload refs and single-use confirmation rules.
- Completion criteria now require truthful unknown/stale timeout states, direct-tool proposal rejection, legacy `result.plan` non-executability and redacted user diagnostics.

## Статус

Ожидается review от GPT Pro.

Review bundle для GPT Pro уже подготовлен, но ответ/вердикт GPT Pro в этот thread еще не внесен. Поэтому этот log фиксирует только локальные решения, принятые при подготовке review packet. После вставки ответа Pro в Codex этот файл нужно обновить.

## Исходный вердикт Pro

Пока недоступен.

Текущий статус implementation: не начинать M100 repair patches, опираясь только на этот log.

## Принято

- Принято, что M100 нужен skeptical review до implementation, потому что repair plan затрагивает безопасность AE execution, confirmation boundaries, agent/action protocol, UI lifecycle state и smoke coverage.
- Принято использовать audit-selected M100 blockers как baseline для review:
  - unsafe/stale AE command execution;
  - отсутствие unified assistant/action/result envelope;
  - inconsistent confirmation gates для mutating/destructive/raw JSX paths;
  - opaque agent/process diagnostics;
  - отсутствие deterministic local M100 vertical smoke.
- Принят allowlist-only bundle:
  - `.codex-audit/99-final-audit-report.md`;
  - `.codex-audit/100-m100-decision.md`;
  - `.codex-audit/101-m100-repair-plan.md`;
  - `mcp-server/bridge-daemon.js`;
  - `cep-panel/panel.js`;
  - `mcp-server/mcp-adapter.js`;
  - `mcp-server/ai-agents.js`.
- Принято не включать planned files, которых еще нет, например `mcp-server/m100-protocol.js` и `scripts/m100-*.js`, как code evidence.
- Принято использовать `--redact-secrets` для bundle. В bundle secret-like совпадения `generic_secret` отредактированы, а не включены raw.
- Принято считать оставшиеся `phone_like` warnings проверенными false positives из protocol/model date-like strings в JS files, а не намеренно включенными raw phone numbers.

## Отклонено и почему

- Отклонено включение всего repository. Причина: для review нужны source documents и минимальные code files, прямо referenced by repair plan.
- Отклонено включение `.env`, logs with secrets, build/dist, `node_modules`, user data, binary files и After Effects project files. Причина: это лишнее и небезопасное содержимое для pasteable GPT Pro review packet.
- Отклонено включение nonexistent planned files как evidence. Причина: Pro должен review текущий код и proposed plan, а не придуманные future files.
- Отклонено помечать bundle как полностью `COMPLETE` в manifest. Причина: scanner навыка все еще сообщает warnings, хотя они локально проверены и задокументированы как false positives.
- Отклонено implementation во время этого review step. Причина: цель шага - skeptical review до code changes.

## Что поменялось в плане

- Добавлен `.codex-audit/102-m100-pro-review-request.md` как task file для GPT Pro.
- Создан `pro-review-bundles/m100-repair-plan-pro-review-bundle.md` как pasteable review bundle.
- `.codex-audit/101-m100-repair-plan.md` пока не менялся.
- Изменения в M100 patch sequence пока не принимались, потому что GPT Pro verdict еще недоступен.
- После ответа Pro нужно обновить этот log:
  - какие Pro findings приняты;
  - какие Pro findings отклонены и почему;
  - конкретные изменения в `101-m100-repair-plan.md`;
  - final implementation scope;
  - smallest safe first patch.

## Оставшиеся блокеры

- Нет verdict от GPT Pro.
- Repair plan еще не пересмотрен с учетом Pro feedback.
- Implementation должен оставаться на паузе, пока Pro findings не будут reviewed и либо приняты, либо явно отклонены.

## Финальный implementation scope

Пока не финализирован.

Текущий candidate scope остается five-patch M100 repair plan из `.codex-audit/101-m100-repair-plan.md`, pending Pro review:

1. Stabilize AE command execution.
2. Add minimal action message envelope.
3. Normalize confirmation and risk gates.
4. Improve lifecycle and diagnostics.
5. Add deterministic M100 vertical smoke.

## No-touch зоны

- Не делать source-code implementation до обработки Pro review.
- Не запускать live mutating After Effects validation без явного approval.
- Не включать `.env`, secret logs, build/dist, `node_modules`, user data, binary files или After Effects project files в review bundles.
- Не расширять M100 scope в streaming, job/event bus, React migration, CI/package-manager work, provider default changes или strict function/tool-call migration, если Pro не покажет прямую M100 safety requirement.

## Следующий безопасный шаг

Вставить `pro-review-bundles/m100-repair-plan-pro-review-bundle.md` в GPT Pro.

Затем вставить ответ GPT Pro обратно в Codex и обновить этот decision log реальным verdict, accepted/rejected findings и точными изменениями repair plan до начала implementation.
