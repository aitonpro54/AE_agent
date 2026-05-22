# Target App Execution Plan

## Progress

- [x] Stable baseline: AE Agent 1.0.11 CEP panel, provider setup, Agent planning, Agent Hardcore owner mode, plan validation, protected execution, local history, diagnostics, reload hard-refresh, install/sync cache clearing, and installed-panel smoke coverage.
- [x] Historical milestone detail through M173 is archived in `plans/archive/target-app-execplan-history-2026-05.md`.
- [x] Milestone 174: AE Agent roadmap reset and active-state split.
- [x] Milestone 175: Runtime artifact cleanup note and archive policy.
- [x] Milestone 176: SDK current/history split.
- [x] Milestone 177: SDK smoke consolidation plan.
- [x] Milestone 178: Cleanup conveyor quiet output, runtime logs, and commit-aware post-run allowlist.

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
- Current M152+ governance/readiness/conveyor/extraction evidence is directly checked through `npm.cmd run check:rules` and summarized in `.codex-audit/sdk-current-state.json`.
- Historical SDK proof references are summarized in `.codex-audit/sdk-history-index.json`; old proof packets should not be reread by default unless a specific audit needs them.
- SDK smoke consolidation is planned in `.codex-audit/sdk-smoke-consolidation-plan.json`; existing milestone-specific smokes stay active until replacement coverage is green.
- The AE Agent cleanup conveyor command captures full child stdout/stderr into ignored `.codex-runtime/sdk/cleanup-conveyor-logs` execution logs by default, prints compact terminal summaries, and validates both working-tree changes and commits created since pre-run `HEAD` against the selected planned-path allowlist.

## Historical Archive

- Active plan history through M173 is preserved at `plans/archive/target-app-execplan-history-2026-05.md`.
- Runtime artifact cleanup policy for M175 is preserved at `plans/archive/runtime-artifact-cleanup-policy-2026-05.md`.
- Use archives for historical investigation. Keep this active plan focused on current baseline, current decisions, validation matrix, and the next reviewable roadmap.

## Active Roadmap

### Milestone 174: AE Agent roadmap reset and active-state split

- Completed: active plan compressed into current-state roadmap.
- Completed: full pre-M174 plan preserved in `plans/archive/target-app-execplan-history-2026-05.md`.
- Completed: `orchestrator/README.md` documents the active/archive split.
- Runtime behavior is unchanged.

### Milestone 175: Runtime artifact cleanup note and archive policy

- Completed: wrote `plans/archive/runtime-artifact-cleanup-policy-2026-05.md`.
- The policy covers ignored runtime artifact areas: `backups/`, `logs/`, `snapshots/`, `.codex-runtime/`, and `pro-review-bundles/`.
- No runtime artifacts were deleted, moved, archived externally, or scanned for a new large inventory in this bounded turn.
- `.gitignore` is unchanged.

### Milestone 176: SDK current/history split

- Completed: added `.codex-audit/sdk-current-state.json`.
- Completed: added `.codex-audit/sdk-history-index.json`.
- Completed: added `scripts/sdk-current-history-index-smoke.js` and package/check:rules wiring.
- Current M152+ evidence remains directly checked; historical proof verdicts remain available without routine rereads of every old packet.
- SDKThread/network and CEP-panel SDK writes remain out of scope.

### Milestone 177: SDK smoke consolidation plan

- Completed: added `.codex-audit/sdk-smoke-consolidation-plan.json`.
- Completed: added `scripts/sdk-current-governance-smoke.js` and `scripts/sdk-history-index-smoke.js`.
- Completed: wired the new current/history smokes into `package.json`, `orchestrator/run-buffered-acceptance.mjs`, and `orchestrator/README.md`.
- Existing milestone-specific smoke scripts and check:rules assertions remain active until equivalent replacement coverage is green.
- Generic manifest-driven smoke catalog work is deferred to a future dedicated `codex-sdk-orchestrator-tool` milestone.

### Milestone 178: Cleanup conveyor output discipline

- Completed: execution runs capture full child stdout/stderr into `.codex-runtime/sdk/cleanup-conveyor-logs` by default.
- Completed: dry-run JSON reports the execution log mode, log directory, and failure tail-line budget.
- Completed: `--tail-lines <n>` limits failure output in the terminal, while `--stream-output` remains an explicit debug escape hatch.
- Completed: post-run path allowlist now checks both dirty working-tree paths and files changed by commits created since pre-run `HEAD`.
- Runtime AE Agent behavior, CEP panel, bridge, provider behavior, dependencies, push, and PR state are unchanged.

## Recent Milestone Summary

- M152: Current production-code SDK write readiness superseded the older single-file claim and is limited to `scripts/provider-api-smoke.js` plus `scripts/provider-contract-smoke.js`.
- M153: Selected CEP-panel composer work only as a future candidate; no CEP-panel SDK write was enabled.
- M154-M157: Defined the SDK milestone conveyor, proved local dry-run behavior, ran one explicitly approved docs-audit SDKThread proof, and closed the per-milestone commit/handoff loop gate.
- M158-M159: Classified SDK orchestrator extraction/cleanup boundaries and froze the current inventory before cleanup.
- M160-M161: Extracted policy-neutral core helpers and introduced the active AE Agent SDK adapter config while preserving wrapper command behavior.
- M162-M165: Indexed historical SDK evidence, migrated retired smoke coverage, reviewed archive candidates, and moved only reviewed historical candidates into `.codex-audit/sdk-history-archive/`.
- M166-M170: Reviewed and extracted operation-envelope, runtime diagnostics, and post-run contract helpers where behavior-preserving; kept buffered acceptance project-local.
- M171-M172: Closed the SDK orchestrator extraction block as `closed-local-gated` and designed the future standalone adapter/plugin interface without implementing a standalone package.
- M173: Charged four AE Agent cleanup stages into the local-only cleanup conveyor and added the command-line runner plus Codex CLI fallback.
- M174: Split active plan state from historical detail. Runtime behavior is unchanged.
- M175: Added runtime artifact cleanup/archive policy without deleting, moving, scanning, or archiving runtime files.
- M176: Split current SDK state from history index and added machine checks for the split.
- M177: Added SDK smoke consolidation plan and current/history smoke entrypoints while keeping existing milestone-specific coverage.
- M178: Made the cleanup conveyor less transcript-heavy by logging full child output to ignored runtime logs, adding compact terminal summaries, and making post-run path validation commit-aware.

## Decision Log

- 2026-05-22: M178 makes cleanup conveyor execution quiet by default. Full child stdout/stderr is written under `.codex-runtime/sdk/cleanup-conveyor-logs`; terminal output should stay to summary, log path, changed paths, and bounded failure tails.
- 2026-05-22: M178 treats commits created by a CLI/SDK worker as part of the post-run path contract. The runner compares pre-run and post-run `HEAD` and fails if committed paths or working-tree paths fall outside the selected queue planned-path allowlist.
- 2026-05-22: M177 only plans smoke consolidation. It does not delete old smoke scripts or remove check:rules assertions because replacement coverage is not yet green.
- 2026-05-22: M177 keeps generic manifest-driven smoke catalog behavior targeted for a later dedicated `codex-sdk-orchestrator-tool` milestone.
- 2026-05-22: `.codex/handoff.md` remains blocked for this M175-M177 turn: both `apply_patch` and PowerShell UTF-8 write failed. The handoff state is recorded in this active plan instead of changing ACLs or recreating the file.
- 2026-05-22: M176 treats `.codex-audit/sdk-current-state.json` as the current directly checked SDK state and `.codex-audit/sdk-history-index.json` as the default historical proof index.
- 2026-05-22: M176 keeps current M152+ governance/readiness/conveyor/extraction evidence directly checked by `check:rules`; historical proof details remain linked but not reread by default.
- 2026-05-22: M175 documents runtime artifact cleanup policy only. It does not delete, move, externally archive, scan, or clear `backups/`, `logs/`, `snapshots/`, `.codex-runtime/`, or `pro-review-bundles/`.
- 2026-05-22: M175 leaves `.gitignore` unchanged; any future runtime artifact move/delete requires separate read-only inventory evidence and explicit approval.
- 2026-05-22: M174 preserves the complete pre-M174 plan in `plans/archive/target-app-execplan-history-2026-05.md` and treats `plans/target-app-execplan.md` as the current active-state plan. Historical milestone detail must be linked, not deleted.
- 2026-05-22: M174-M177 are local-only cleanup conveyor work. They do not change CEP panel, bridge, provider, AE runtime behavior, SDKThread/network policy, dependencies, push, or PR state.
- 2026-05-22: The active roadmap came from the M173 cleanup conveyor sequence: M174 roadmap active-state split, M175 runtime artifact cleanup note, M176 SDK current/history split, and M177 SDK smoke consolidation plan.
- 2026-05-22: M173 charges the four AE Agent cleanup stages into the SDK milestone conveyor as local-only queued work, not as broad execution approval. Each item keeps `maxSdkThreadRuns:0`, no live CEP/AE, no runtime deletion/move, no dependency change, no push, and no PR without fresh explicit approval.
- 2026-05-22: M172 defines a future standalone adapter/plugin interface, but AE Agent governance packet validators, current M152+ direct checks, package script assertions, README assertions, and project evidence policy remain project-local until a separate implementation milestone proves equivalent fail-closed behavior.
- 2026-05-22: M165 historical archive cleanup moved only M164-reviewed candidates into `.codex-audit/sdk-history-archive/`; current M152+ evidence, active command files, provider smoke targets, `package.json`/`package-lock.json`, and `cep-panel/panel.js` remain in place.
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
| `node --check orchestrator/run-buffered-acceptance.mjs` | Required because M176/M177 wire new check:rules smoke calls. | Passed on 2026-05-22. |
| `node --check orchestrator/run-ae-agent-cleanup-conveyor.mjs` | Required because M178 changes the cleanup conveyor runner. | Passed on 2026-05-22. |
| `node --check scripts/sdk-ae-agent-cleanup-conveyor-command-smoke.js` | Required because M178 extends the command smoke. | Passed on 2026-05-22. |
| `node scripts/sdk-ae-agent-cleanup-conveyor-command-smoke.js` | Required because M178 adds quiet/log-file and commit-aware contract assertions. | Passed on 2026-05-22. |
| `npm.cmd run codex:orchestrator:ae-agent-cleanup-conveyor -- --item m174-roadmap-active-state-split --json` | Required to verify dry-run output exposes log mode without creating a child run. | Passed on 2026-05-22. |
| `node --check scripts/sdk-current-history-index-smoke.js` | Required for M176 touched JavaScript. | Passed on 2026-05-22. |
| `node --check scripts/sdk-current-governance-smoke.js` | Required for M177 touched JavaScript. | Passed on 2026-05-22. |
| `node --check scripts/sdk-history-index-smoke.js` | Required for M177 touched JavaScript. | Passed on 2026-05-22. |
| `node scripts/sdk-current-history-index-smoke.js` | Required for M176 current/history split. | Passed on 2026-05-22. |
| `node scripts/sdk-current-governance-smoke.js` | Required for M177 current-governance check. | Passed on 2026-05-22. |
| `node scripts/sdk-history-index-smoke.js` | Required for M177 history/consolidation check. | Passed on 2026-05-22. |
| `npm.cmd run check:rules` | Required by selected cleanup conveyor items and keeps current M152+ direct checks active. | Passed on 2026-05-22; npm printed only the existing `Unknown env config "http-proxy"` warning. |
| `git diff --check` | Required by selected cleanup conveyor items. | Passed on 2026-05-22; Git printed only LF-to-CRLF working-copy warnings for touched text files. |
| Configured local smoke suite from AGENTS.md | Not run in full because this bounded conveyor turn is limited to selected local SDK cleanup items; no runtime AE Agent behavior changed. | Not run; selected SDK validation is listed above. |
| Live CEP/AE validation | Forbidden/out of scope for this turn. | Not run. |
| SDKThread/network/external-provider/OpenAI CLI planner/mutating-live validation | Forbidden/out of scope for this turn. | Not run. |
| Package install/dependency change validation | Out of scope because no dependency change is allowed. | Not run. |

### Milestone 175

- Added `plans/archive/runtime-artifact-cleanup-policy-2026-05.md`.
- The policy records affected ignored runtime directories and a future archive checklist.
- No runtime files were deleted, moved, externally archived, scanned, or cleared.
- `.gitignore` is unchanged.

### Milestone 176

- Added `.codex-audit/sdk-current-state.json`.
- Added `.codex-audit/sdk-history-index.json`.
- Added `scripts/sdk-current-history-index-smoke.js`.
- Added package script `codex:orchestrator:current-history-index:smoke`.
- Wired M176 smoke into `orchestrator/run-buffered-acceptance.mjs`.
- Updated `orchestrator/README.md`.

### Milestone 177

- Added `.codex-audit/sdk-smoke-consolidation-plan.json`.
- Added `scripts/sdk-current-governance-smoke.js`.
- Added `scripts/sdk-history-index-smoke.js`.
- Added package scripts `codex:orchestrator:current-governance:smoke` and `codex:orchestrator:history-index:smoke`.
- Wired M177 smokes into `orchestrator/run-buffered-acceptance.mjs`.
- Updated `orchestrator/README.md`.
- Existing milestone-specific smokes remain active; no old smoke script was deleted.

### Milestone 178

- Updated `orchestrator/run-ae-agent-cleanup-conveyor.mjs` to capture execution output into `.codex-runtime/sdk/cleanup-conveyor-logs`.
- Added `--log-dir`, `--tail-lines`, and `--stream-output` command options.
- Added commit-aware validation by comparing pre-run and post-run `HEAD` paths in addition to working-tree status paths.
- Updated `.codex-audit/sdk-milestone-conveyor/173-ae-agent-cleanup-conveyor-queue.json` command runner metadata.
- Updated `scripts/sdk-ae-agent-cleanup-conveyor-command-smoke.js` to assert quiet/log-file defaults, custom tail/log-dir parsing, and invalid option rejection.
- Updated `orchestrator/README.md` and this plan.

### Handoff

`.codex/handoff.md` is writable again from the parent Codex process and is updated after M178. Use it as the primary continuation record. No live CEP/AE, SDKThread/network proof, provider validation, dependency change, package install, push, or PR was performed for M178.
