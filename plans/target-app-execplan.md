# Target App Execution Plan

## Progress

- [x] Stable baseline: AE Agent 1.0.11 CEP panel, provider setup, Agent planning, Agent Hardcore owner mode, plan validation, protected execution, local history, diagnostics, reload hard-refresh, install/sync cache clearing, and installed-panel smoke coverage.
- [x] Historical milestone detail through M173 is archived in `plans/archive/target-app-execplan-history-2026-05.md`.
- [~] Milestone 174: AE Agent roadmap reset and active-state split; active plan/archive/README done, `.codex/handoff.md` update blocked by Access denied.
- [ ] Milestone 175: Runtime artifact cleanup note and archive policy.
- [ ] Milestone 176: SDK current/history split.
- [ ] Milestone 177: SDK smoke consolidation plan.

## Current Stable Baseline

- The active repository is `C:\Users\Ant\Documents\Codex\AE_agent`.
- The native CEP title/menu format is `AE Agent 1.0.11`.
- The panel is a compact dark CEP client for the local bridge daemon.
- Provider paths are separate: OpenAI API, OpenAI CLI, Gemini, Claude, OpenRouter, and Local/Ollama.
- Agent mode drafts structured MCP plans, validates tool names and required fields, dry-runs plans, and executes only through explicit mutation gates.
- Agent plans with `validation.ok` and review-warning classifications stay runnable in Agent and Agent Hardcore; classification is guidance, while invalid schema/tools, raw ExtendScript approval, runtime bindings, mutation permission, checkpoint, and edit-session gates remain enforced by the runner.
- Agent Hardcore is a visible composer mode next to Agent; its composer send button starts owner-mode autopilot with high reasoning, while manual `Dry run / Проверить` and `Выполнить план` controls remain visible for the latest active plan.
- The latest valid Agent plan exposes inline `Dry run / Проверить` and `Выполнить план` controls inside the chat message, while keeping the same validated backend runner and project-change gates.
- Raw ExtendScript plans stay blocked for normal Run until a successful dry run of the same current plan records a short-lived gate id; the enabled Run then sends `allowRawExtendscript:true` with the matching `rawExtendscriptDryRunId`.
- Agent plans or runs that reveal a typed-tool gap can create an ignored `logs/dev-requests/<id>/` bundle for a targeted Codex App dev handoff instead of continuing repo development inside the AE chat; v1 does not auto-create a Codex App chat.
- The panel appends a compact resource report after completed chat/plan/run/dev-request operations with local five-hour task-window usage, estimated current panel context, and provider token usage when the provider returned it.
- Project-changing tools use idempotency, optional checkpoints, edit-session protection, and post-mutation verification.
- Precomp/source workflows include `deep_duplicate_precomp_sources` for recursively duplicating a selected precomp layer's source comp and nested comp/footage project items without raw ExtendScript in Agent plans.
- Raw ExtendScript remains available as an escape hatch, but normal product workflows should use typed bridge tools.
- CEP `Reload` forces a cache-busted reload of installed `index.html` and passes a fresh asset nonce to CSS/JS, so an already-open panel can pick up synced files without stale `panel.js?v=<old>` cache entries.
- CEP install/sync clears only this extension's Chromium cache folders (`Cache`, `Code Cache`, `GPUCache`, `blob_storage`) while preserving Local Storage.

## Current SDK Baseline

- Current SDK orchestrator work is local-gated and AE Agent-specific until a separate milestone proves equivalent fail-closed behavior in the sibling `codex-sdk-orchestrator-tool`.
- Current production-code SDK write readiness is limited to exactly `scripts/provider-api-smoke.js` and `scripts/provider-contract-smoke.js`.
- General SDK autopilot repo edits, broad production-code writes, CEP-panel SDK writes, live CEP/AE validation, external-provider/OpenAI CLI planner validation, mutating-live validation, package installs, dependency changes, push, and PR creation remain out of scope without fresh bounded approval.
- CEP-panel SDK writes remain disabled; `cep-panel/panel.js` must not be edited through the SDK lane.
- Current M152+ governance/readiness/conveyor/extraction evidence remains directly checked by `npm.cmd run check:rules`.
- Historical SDK proof details are summarized in current plan sections and preserved in the archive; old details should not be reread by default unless needed for a specific audit.

## Historical Archive

- Active plan history through M173 is preserved at `plans/archive/target-app-execplan-history-2026-05.md`.
- The archive was created before this active-plan reset and includes the former Progress list, milestone detail, Decision Log, and Validation history.
- Use the archive for historical investigation. Keep this active plan focused on current baseline, current decisions, validation matrix, and the next reviewable roadmap.

## Active Roadmap

### Milestone 174: AE Agent roadmap reset and active-state split

- Preserve the complete pre-M174 execution plan in `plans/archive/target-app-execplan-history-2026-05.md`.
- Compress `plans/target-app-execplan.md` into the active state: current baseline, active roadmap, current decisions, validation matrix, and recent milestone summary.
- Keep links from active state to archived history.
- Update `orchestrator/README.md` with the active/archive plan split.
- Update `.codex/handoff.md` with M174 results and the next exact prompt, or record the blocker if `.codex/**` ACL denies writes.
- Do not change CEP panel, bridge, provider, AE runtime behavior, runtime artifacts, package dependencies, push, or PR state.

### Milestone 175: Runtime artifact cleanup note and archive policy

- Write a cleanup/archive policy for ignored runtime artifacts such as `backups/`, `logs/`, `snapshots/`, `.codex-runtime/`, and `pro-review-bundles/`.
- Summarize already-collected size/count evidence where available.
- Recommend external archive locations and operator steps without deleting or moving runtime artifacts.
- Keep `.gitignore` unchanged unless a later milestone proves the need.

### Milestone 176: SDK current/history split

- Create machine-checked current SDK state and history index artifacts.
- Keep current M152+ governance/readiness/conveyor/extraction evidence directly checked.
- Keep historical proof references available without requiring every old packet to be reread by default.
- Do not run SDKThread/network or enable CEP-panel SDK writes.

### Milestone 177: SDK smoke consolidation plan

- Plan how to consolidate milestone-specific SDK smokes after current/history separation.
- Keep replacement coverage fail-closed before retiring old smoke scripts.
- Keep generic reusable checks targeted for the sibling `codex-sdk-orchestrator-tool` only through a later dedicated milestone.

## Recent Milestone Summary

- M152: Current production-code SDK write readiness superseded the older single-file claim and is limited to `scripts/provider-api-smoke.js` plus `scripts/provider-contract-smoke.js`.
- M153: Selected CEP-panel composer work only as a future candidate; no CEP-panel SDK write was enabled.
- M154-M157: Defined the SDK milestone conveyor, proved local dry-run behavior, ran one explicitly approved docs-audit SDKThread proof, and closed the per-milestone commit/handoff loop gate.
- M158-M159: Classified SDK orchestrator extraction/cleanup boundaries and froze the current inventory before cleanup.
- M160-M161: Extracted policy-neutral core helpers and introduced the active AE Agent SDK adapter config while preserving wrapper command behavior.
- M162-M165: Indexed historical SDK evidence, migrated retired smoke coverage, reviewed archive candidates, and moved only reviewed historical candidates into `.codex-audit/sdk-history-archive/`.
- M166-M170: Reviewed and extracted operation-envelope, runtime diagnostics, and post-run contract helpers where behavior-preserving; kept buffered acceptance project-local.
- M171-M172: Closed the SDK orchestrator extraction block as `closed-local-gated` and designed the future standalone adapter/plugin interface without implementing a standalone package.
- M173: Charged four AE Agent cleanup stages into the local-only cleanup conveyor and added the command-line runner plus Codex CLI fallback; no queued cleanup item was executed in M173.
- M174: Split active plan state from historical detail. Runtime behavior is unchanged.
- Handoff update attempt: `.codex/handoff.md` could not be written because Windows returned `Access denied`; no ACL or delete/recreate workaround was attempted.

## Decision Log

- 2026-05-22: M174 preserves the complete pre-M174 plan in `plans/archive/target-app-execplan-history-2026-05.md` and treats `plans/target-app-execplan.md` as the current active-state plan. Historical milestone detail must be linked, not deleted.
- 2026-05-22: M174 is docs-only. It does not change CEP panel, bridge, provider, AE runtime behavior, runtime artifacts, SDKThread/network policy, dependencies, push, or PR state.
- 2026-05-22: `.codex/handoff.md` remains blocked by local filesystem permissions for this turn. The M174 handoff state is therefore recorded in this active plan instead of changing ACLs, deleting/recreating the handoff file, or touching unplanned paths.
- 2026-05-22: The active roadmap is the M173 cleanup conveyor sequence: M174 roadmap active-state split, M175 runtime artifact cleanup note, M176 SDK current/history split, and M177 SDK smoke consolidation plan.
- 2026-05-22: M173 charges the four AE Agent cleanup stages into the SDK milestone conveyor as local-only queued work, not as execution approval. Each item keeps `maxSdkThreadRuns:0`, no live CEP/AE, no runtime deletion/move, no dependency change, no push, and no PR without fresh explicit approval.
- 2026-05-22: M173 command runner adds `codex:orchestrator:ae-agent-cleanup-conveyor`; it dry-runs by default, refuses pre-existing git dirt for execution, enforces the post-run git path allowlist from selected planned paths, and does not auto-commit or push.
- 2026-05-22: M173 Codex CLI fallback uses `--engine cli --execute` through `cmd.exe` when the SDK backend disconnects, requires separate exact approval text, and keeps the same planned-path allowlist.
- 2026-05-22: M172 defines a future standalone adapter/plugin interface, but AE Agent governance packet validators, current M152+ direct checks, package script assertions, README assertions, and project evidence policy remain project-local until a separate implementation milestone proves equivalent fail-closed behavior.
- 2026-05-22: M171 closes the SDK orchestrator extraction block as `closed-local-gated`; no new extraction, SDKThread/network work, CEP-panel SDK write, package install, archive/delete/squash cleanup, push, or PR is introduced by closeout.
- 2026-05-22: M165 historical archive cleanup moved only M164-reviewed candidates into `.codex-audit/sdk-history-archive/`; current M152+ evidence, active command files, provider smoke targets, `package.json`/`package-lock.json`, and `cep-panel/panel.js` remain in place.
- 2026-05-22: M162 historical evidence index keeps M152 governance/readiness, M153-M157 conveyor packets, M158-M161 extraction artifacts, provider smoke targets, and `cep-panel/panel.js` as current directly checked evidence rather than historical-only evidence.
- 2026-05-21: M152 supersedes the production-code SDK write allowlist with exactly `scripts/provider-api-smoke.js` and `scripts/provider-contract-smoke.js`; general SDK workflow, production-code outside those files, CEP-panel writes, external-provider/OpenAI CLI planner validation, live CEP/AE validation, mutating-live validation, package installs, and dependency changes remain outside the claim.
- 2026-05-13: ChatGPT subscription access uses Codex CLI auth, not a normal OpenAI API key.
- 2026-05-13: OpenAI API key access remains separate and uses normal API billing.
- 2026-05-13: Gemini and Claude use provider API keys and official HTTP APIs.
- 2026-05-13: No Pro/license gate is part of AE Agent.
- 2026-05-13: No production dependencies are added unless a milestone records a concrete reason.
- 2026-05-13: Agent plans should prefer typed bridge tools and avoid raw ExtendScript for common workflows.
- 2026-05-13: New mutating tools must join the existing checkpoint/idempotency/verification model.

## Validation

### Current validation matrix

| Check | Current requirement | Latest result |
| --- | --- | --- |
| `npm.cmd run check:rules` | Required for M174 cleanup docs. | Passed on 2026-05-22; output reported all buffered acceptance/governance/extraction checks as pass. |
| `git diff --check` | Required for M174 cleanup docs. | Passed on 2026-05-22; Git printed only LF-to-CRLF working-copy warnings for touched text files. |
| `node --check` for touched JavaScript | Not applicable for M174 because no JavaScript is edited. | Not run. |
| Configured local smoke suite from AGENTS.md | Not required by selected M174 queue item; no runtime/code behavior changed. | Not run. |
| Live CEP/AE validation | Forbidden/out of scope for M174. | Not run. |
| SDKThread/network/external-provider/OpenAI CLI planner/mutating-live validation | Forbidden/out of scope for M174. | Not run. |
| Package install/dependency change validation | Out of scope because no dependency change is allowed. | Not run. |

### Milestone 174

- Created `plans/archive/target-app-execplan-history-2026-05.md` as the complete pre-M174 plan archive.
- Replaced `plans/target-app-execplan.md` with active state, archive link, M174-M177 roadmap, current decisions, validation matrix, and recent milestone summary.
- Updated `orchestrator/README.md` with the M174 active/archive split note.
- Attempted to update `.codex/handoff.md`, but both `apply_patch` and PowerShell UTF-8 write failed because the path is access-denied in this workspace. The blocker is recorded here.
- Passed `npm.cmd run check:rules`.
- Passed `git diff --check`; Git printed only LF-to-CRLF working-copy warnings for touched text files.
- Runtime behavior is unchanged.
- No live CEP/AE, SDKThread/network, external-provider/OpenAI CLI planner, mutating-live validation, package install, dependency change, push, or PR was performed.

### M174 handoff blocker and next prompt

Because `.codex/handoff.md` is not writable in this turn, use this section as the M174 handoff record.

Current state:

- M174 active/archive split is implemented as far as filesystem permissions allow.
- Changed planned docs: `plans/target-app-execplan.md`, `plans/archive/target-app-execplan-history-2026-05.md`, and `orchestrator/README.md`.
- `.codex/handoff.md` remains unchanged due to Access denied.
- No commit was created because the wrapper explicitly said `Do not commit`.
- No runtime, SDKThread/network, live CEP/AE, external-provider, mutating-live, dependency, push, or PR work was performed.
- Validation passed: `npm.cmd run check:rules` and `git diff --check`.

Exact next prompt:

```text
Продолжай в `C:\Users\Ant\Documents\Codex\AE_agent`.

Работай по-русски. Сначала проверь:
- `git status --short --branch`
- `git log -1 --oneline`

Прочитай UTF-8:
- `AGENTS.md`
- `specs/target-app.md`
- `plans/target-app-execplan.md`
- targeted M174/M175 sections of `.codex-audit/sdk-milestone-conveyor/173-ae-agent-cleanup-conveyor-queue.json`

M174 был выполнен как docs-only active/archive split настолько, насколько позволили права workspace: активный план сжат, полная история сохранена в `plans/archive/target-app-execplan-history-2026-05.md`, README обновлен. `.codex/handoff.md` не был обновлен из-за `Access denied`; handoff записан в `plans/target-app-execplan.md`.

Не запускай SDKThread/network, CEP-panel SDK writes, live CEP/AE, external-provider/OpenAI CLI planner, mutating-live validation, dependency changes, package installs, push или PR без отдельного explicit approval. Не удаляй и не перемещай runtime artifacts.

Следующий разрешенный local-only milestone: M175 runtime artifact cleanup note and archive policy. Выполни только M175: напиши policy/notes для ignored runtime artifacts (`backups/`, `logs/`, `snapshots/`, `.codex-runtime/`, `pro-review-bundles/`) без удаления или перемещения файлов, обнови `plans/target-app-execplan.md` и, если права позволяют, `.codex/handoff.md`, выполни validation commands из queue item и не трогай runtime AE Agent.
```
