# Target App Execution Plan

## Progress

- [x] Stable baseline: AE Agent 2.0.0 CEP panel, provider setup, Agent planning, Agent Hardcore owner mode, plan validation, protected execution, local history, diagnostics, reload hard-refresh, install/sync cache clearing, and installed-panel smoke coverage.
- [x] Historical milestone detail through M173 is archived in `plans/archive/target-app-execplan-history-2026-05.md`.
- [x] Milestone 174: AE Agent roadmap reset and active-state split.
- [x] Milestone 175: Runtime artifact cleanup note and archive policy.
- [x] Milestone 176: SDK current/history split.
- [x] Milestone 177: SDK smoke consolidation plan.
- [x] Milestone 178: Cleanup conveyor quiet output, runtime logs, and commit-aware post-run allowlist.
- [x] Milestone 179: AE Agent 2.0.0 version bump for new GitHub home.
- [x] Milestone 180: Installed CEP sync to AE Agent 2.0.0 and bounded live validation.
- [x] Milestone 181: Live AE panel validation with connected 2.0.0 panel and recover-flow smoke finding.
- [x] Milestone 182: Deterministic saved-plan recovery and passing broad local-Ollama live smoke.
- [x] Milestone 183: External TypeTools intake into safe comp/folder typed bridge tools.
- [x] Milestone 184: AE Agent feature conveyor readiness for gated future Dakkshin intake.
- [x] Milestone 185: Dakkshin intake scope brief.

## Current Stable Baseline

- The active repository is `C:\Users\Ant\Documents\Codex\AE_agent`.
- The native CEP title/menu format is `AE Agent 2.0.0`.
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
- The typed bridge catalog includes production project-structure tools: `create_comp`, `create_project_folder`, `list_project_folder_items`, and `move_project_items_to_folder`.
- New project-structure mutations are M100-gated and inherit checkpoint/idempotency/post-verification safety fields; the folder listing tool remains read-only.
- Precomp/source workflows include `deep_duplicate_precomp_sources` for recursively duplicating a selected precomp layer's source comp and nested comp/footage project items without raw ExtendScript in Agent plans.
- Raw ExtendScript remains available as an escape hatch, but normal product workflows should use typed bridge tools.
- CEP `Reload` forces a cache-busted reload of installed `index.html` and passes a fresh asset nonce to CSS/JS, so an already-open panel can pick up synced files without stale `panel.js?v=<old>` cache entries.
- CEP install/sync clears only this extension's Chromium cache folders (`Cache`, `Code Cache`, `GPUCache`, `blob_storage`) while preserving Local Storage.
- Installed CEP tracked files now match the repository at `AE Agent 2.0.0`.
- Live AE/CEP connectivity with the opened `AE Agent 2.0.0` panel is verified: bridge status, `ping_ae`, CDP inspect, and connector-status smoke pass.
- The broad local-Ollama CDP smoke now passes through plan generation, saved-plan recovery, dry run, and read-only run. Recovery of saved structured Agent plans is deterministic: the panel stores only the structured plan in chat history, then asks the bridge `/agents/plan/propose` endpoint to revalidate it and mint a fresh M100 action proposal instead of re-prompting the local planner.

## Current SDK Baseline

- Current SDK orchestrator work is local-gated and AE Agent-specific until a separate milestone proves equivalent fail-closed behavior in the sibling `codex-sdk-orchestrator-tool`.
- Current production-code SDK write readiness is limited to exactly `scripts/provider-api-smoke.js` and `scripts/provider-contract-smoke.js`.
- General SDK autopilot repo edits, broad production-code writes, CEP-panel SDK writes, live CEP/AE validation, external-provider/OpenAI CLI planner validation, mutating-live validation, package installs, dependency changes, push, and PR creation remain out of scope without fresh bounded approval.
- CEP-panel SDK writes remain disabled; `cep-panel/panel.js` must not be edited through the SDK lane.
- Current M152+ governance/readiness/conveyor/extraction evidence is directly checked through `npm.cmd run check:rules` and summarized in `.codex-audit/sdk-current-state.json`.
- Historical SDK proof references are summarized in `.codex-audit/sdk-history-index.json`; old proof packets should not be reread by default unless a specific audit needs them.
- SDK smoke consolidation is planned in `.codex-audit/sdk-smoke-consolidation-plan.json`; existing milestone-specific smokes stay active until replacement coverage is green.
- The AE Agent cleanup conveyor command captures full child stdout/stderr into ignored `.codex-runtime/sdk/cleanup-conveyor-logs` execution logs by default, prints compact terminal summaries, and validates both working-tree changes and commits created since pre-run `HEAD` against the selected planned-path allowlist.
- The AE Agent feature conveyor is now locally smoke-checked for future Dakkshin intake preview through `.codex-audit/sdk-feature-conveyor/184-dakkshin-intake-feature-queue.json` and `orchestrator/run-ae-agent-feature-conveyor.mjs`; current queue items remain non-executable with `executionApprovalState:"pending-explicit-approval"` and `maxAiTurns:0`.

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

### Milestone 179: AE Agent 2.0.0 version bump

- Completed: bumped current CEP panel, CEP manifest, bridge daemon, MCP adapter, versioned smoke expectations, active target spec, README, and active execution plan from `1.0.11` to `2.0.0`.
- Historical archive files are unchanged and keep their original `1.0.11` evidence.
- Target publish repository is `https://github.com/aitonpro54/AE_agent`.
- Push target is direct `master` in the new repository; PR creation is intentionally skipped for the initial repository fill.
- Live CEP/AE sync is not part of this milestone unless separately requested.

### Milestone 180: Installed CEP sync and bounded live validation

- Completed: synced the installed CEP extension under `%APPDATA%\Adobe\CEP\extensions\com.codex.aemcpbridge` to the current repository files.
- Completed: copied the missing `2.0.0` updates into the installed `index.html`, `panel.js`, and `CSXS/manifest.xml` across the milestone sync passes.
- Completed: aligned the static `cep-panel/index.html` title and asset-version fallback with `AE Agent 2.0.0`.
- Completed: updated `scripts/install-cep-panel.ps1` user-facing restart/menu hint to `AE Agent 2.0.0`.
- Completed: strengthened `scripts/cep-sync-health.js` so a stale repo HTML title is reported as a version mismatch.
- Live AE/CDP validation was attempted but could not connect because After Effects was not running/open with the CEP panel in this environment.

### Milestone 181: Connected live AE panel validation

- Completed: verified local repository and remote state before live checks: latest local commit was `9b3a361 fix: sync CEP install version title`; `ae-agent` points to `https://github.com/aitonpro54/AE_agent.git`; remote HEAD remained `refs/heads/master` at `494745c94c53e27f7b38b3677300f693473b9368`.
- Completed: detected running After Effects 2026 with project `SETKI.aep` and verified bridge daemon `2.0.0` with `panelConnected:true`.
- Completed: `ping_ae` returned After Effects `26.2x49` and 263 project items.
- Completed: CDP `inspect` sees the installed panel at `%APPDATA%\Adobe\CEP\extensions\com.codex.aemcpbridge\index.html` with title and asset version `AE Agent 2.0.0`.
- Completed: `connector-status-smoke` passed against the live CEP panel.
- Completed: updated `scripts/cep-panel-cdp-smoke.js` recover-state expectations from the retired `No plan ready` label to the current `No action proposal ready` panel label.
- Broad `node scripts/cep-panel-cdp-smoke.js smoke` remains a live validation gap: after the label fix it reaches the recover-last-plan branch, but local Ollama recovery returns `Plan review: needs review` with 0 executable steps instead of restoring a runnable read-only plan.

### Milestone 182: Deterministic saved-plan recovery

- Completed: updated `cep-panel/panel.js` so Agent plan chat history stores a minimal structured plan snapshot, excluding the backend-created M100 proposal and confirmation token.
- Completed: changed `Recover last plan` to prefer stored structured plans and call `/agents/plan/propose`, which revalidates the plan and creates a fresh server-owned M100 action proposal without sending a recovery prompt to Local/Ollama.
- Completed: kept the older text-to-plan Agent planner recovery path only as fallback for legacy chat history that has no stored structured plan.
- Completed: synced the installed CEP panel after the repo change; only installed `panel.js` changed, and CEP cache folders were cleared while Local Storage was preserved.
- Completed: broad `node scripts/cep-panel-cdp-smoke.js smoke` now passes against the connected installed `AE Agent 2.0.0` panel.

### Milestone 183: External TypeTools intake

- Completed: reviewed `jhd3197/after-effects-automation` TypeTools/actions against vNext 1.1 safety boundaries and adopted only low-risk typed capability gaps, not its eval queue, startup runner, plugin-install, project-close, or direct CEP eval patterns.
- Completed: added `create_comp` as a production typed tool with explicit size, duration, frame rate, background color, duplicate-name guard, optional folder placement, and optional viewer open.
- Completed: added project folder tools: read-only `list_project_folder_items`, mutating `create_project_folder`, and mutating explicit-index `move_project_items_to_folder`.
- Completed: wired new mutating tools into the existing M100/checkpoint/idempotency/verification model and planning tool list; `list_project_folder_items` stays read-only.
- Deferred: template-value batch application and transition recipes remain candidates for a later recipe/tool milestone because they need stronger UX semantics and read-back expectations than the external scripts provide.

### Milestone 184: AE Agent feature conveyor readiness

- Completed: added review/readiness/governance evidence under `.codex-audit/sdk-feature-conveyor/`.
- Completed: added the Dakkshin intake feature queue `.codex-audit/sdk-feature-conveyor/184-dakkshin-intake-feature-queue.json` with M185-M187 intake items only.
- Completed: added `orchestrator/run-ae-agent-feature-conveyor.mjs` for dry-run preview and future gated execution.
- Completed: added feature conveyor readiness/command smokes and wired them into `package.json`, `orchestrator/run-buffered-acceptance.mjs`, `orchestrator/README.md`, and `.codex-audit/sdk-current-state.json`.
- Current Dakkshin queue items are preview-only; no Dakkshin product behavior, CEP-panel SDK write, live CEP/AE validation, external-provider/OpenAI CLI planner validation, mutating-live validation, package install, dependency change, push, or PR is approved by M184.

### Milestone 185: Dakkshin intake scope brief

- Completed: added `.codex-audit/sdk-feature-conveyor/dakkshin-intake/m185-scope-brief.md`.
- Completed: summarized the existing repository Dakkshin references from `docs/ready-solutions-research.md` and `docs/daemon-split-handoff.md`.
- Completed: recorded hard implementation boundaries, possible future lanes, and questions that must be answered before product work.
- User approval was given in-chat for this local-only intake step; no child SDK/CLI workspace-write execution was run because the M184 runner remains fail-closed until queue state is separately updated.
- No Dakkshin product behavior, CEP panel, bridge runtime, dependencies, package-lock, live CEP/AE validation, external-provider/OpenAI CLI planner validation, push, or PR changed.

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
- M179: Bumped AE Agent to `2.0.0` and prepared direct push to the new `aitonpro54/AE_agent` repository without PR.
- M180: Synced the installed CEP extension to `2.0.0`, fixed the remaining static HTML/install text version tail, and recorded that live AE/CDP validation needs After Effects opened with the panel.
- M181: Verified the opened AE Agent 2.0.0 CEP panel through bridge status, `ping_ae`, CDP inspect, and connector-status smoke; aligned CDP smoke status expectations and recorded the remaining local-Ollama recover-flow smoke failure.
- M182: Made saved-plan recovery deterministic by re-proposing the stored structured plan through the bridge instead of re-prompting Local/Ollama; synced the installed panel and passed the broad live CDP smoke.
- M183: Converted the useful `after-effects-automation` TypeTools gap into safe native bridge tools for production comp creation and explicit project-folder organization, while leaving unsafe external script execution patterns out.
- M184: Added a local-gated feature conveyor for future Dakkshin intake preview with review/readiness/governance evidence, a non-executable intake queue, a fail-closed command runner, and smokes wired into `check:rules`.
- M185: Completed the first Dakkshin intake artifact as a scope brief only; no product implementation or live/provider/dependency work was performed.

## Decision Log

- 2026-05-23: M184 prepares only the feature conveyor infrastructure for future Dakkshin intake. It does not implement Dakkshin product behavior, enable CEP-panel SDK writes, run live CEP/AE, run external-provider/OpenAI CLI planner validation, install packages, change dependencies, push, or create a PR.
- 2026-05-23: M184 feature conveyor execution remains fail-closed. Current Dakkshin queue items have `executionApprovalState:"pending-explicit-approval"` and `maxAiTurns:0`; the runner may preview them but rejects execution until a future milestone records per-item approval.
- 2026-05-23: M185 treats the user's approval as approval for the local-only Dakkshin intake scope brief, not for product implementation, CEP-panel SDK writes, live CEP/AE, external providers, dependency changes, push, or PR.
- 2026-05-23: M185 records that a child SDK/CLI workspace-write run was not used because the M184 runner's queue state remains fail-closed; the parent Codex turn completed only the planned intake brief and documentation.
- 2026-05-23: M183 adopts only low-risk capability ideas from `jhd3197/after-effects-automation`: production comp creation plus explicit project folder list/create/move tools. It does not adopt the external eval queue, startup script runner, broad plugin installer, destructive new-project close behavior, or direct CEP `evalScript` string-construction pattern.
- 2026-05-23: M183 defers transition and template-value batch tools. They are plausible future typed recipes, but require AE Agent-specific target selection, semantic verification, and user-facing review before promotion.
- 2026-05-23: `architecture-vNext.md` now treats vNext 1.1 as the current architecture baseline for brainstorming and future planning. The accepted direction is safety-aware RAG/retrieval plus explicit promotion, not autonomous external script execution.
- 2026-05-23: vNext 1.1 keeps M100 as the absolute boundary for mutating/destructive/raw JSX execution, keeps RAG advisory-only, and keeps SDK production-code/CEP-panel write expansion approval-gated until a separate scope-expansion review proves fail-closed behavior.
- 2026-05-22: M182 fixes the recover-last-plan smoke gap in product behavior instead of weakening the broad CDP smoke. Saved structured Agent plans recover through bridge `/agents/plan/propose`, which creates a fresh M100 proposal without any provider call.
- 2026-05-22: M182 stores only the minimal structured plan snapshot in chat history. Backend-created M100 action proposals and confirmation tokens are not persisted in Local Storage; they are reissued by the bridge during recovery.
- 2026-05-22: M182 keeps text-only recovery as a legacy fallback for old chat history, so existing user-visible recovery behavior remains available when no structured plan snapshot exists.
- 2026-05-22: M181 treats connected live AE/CEP validation as a validation/docs/test-maintenance milestone. It does not push, create a PR, touch old `origin`, or change installed CEP files.
- 2026-05-22: M181 updates CDP smoke recover-state checks to the current panel status text `No action proposal ready`; the wider smoke remains strict and still fails when the local planner cannot recover a runnable plan.
- 2026-05-22: M179 treats `2.0.0` as the new current AE Agent version and updates current runtime/version sources plus active docs and smoke expectations. Historical archive files are not rewritten.
- 2026-05-22: M179 publishes to the new `aitonpro54/AE_agent` GitHub repository by direct push to `master`; PR is intentionally skipped because the new repository is the initial publication target.
- 2026-05-22: M180 treats installed CEP sync as local machine state plus a small repo hardening fix. The repo keeps `cep-panel/index.html`, install prompts, manifest menu, panel runtime title, and sync-health expectations aligned on `AE Agent 2.0.0`.
- 2026-05-22: M180 does not launch After Effects automatically. Live validation is limited to available read-only checks; AE/CDP remains blocked until the user opens After Effects and the AE Agent panel.
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
| `node --check mcp-server/bridge-daemon.js` and `node --check scripts/smoke-test.js` | Required because M183 changes bridge tool implementation and smoke assertions. | Passed on 2026-05-23. |
| M183 AGENTS non-live suite | Required because M183 adds typed bridge tools and updates the main smoke catalog. | Passed on 2026-05-23 across `.codex-runtime/validation/m183-non-live-20260523-165746.log` and `.codex-runtime/validation/m183-non-live-remaining-20260523-165806.log`: `npm.cmd run check:rules`, `git diff --check`, provider contract/API, solution registry/candidate/promotion/retrieval/library, project intent memory, plan classification/repair, semantic verification, reliability validation, ChatGPT connector, prompt optimization, bridge-only smoke, and main smoke. `git diff --check` printed only existing LF-to-CRLF working-copy warnings. |
| M183 live CEP availability check | Required before deciding whether live CEP smoke is available. | `node scripts/cep-panel-cdp-smoke.js inspect` could not connect to CDP on 2026-05-23 (`connect ECONNREFUSED 127.0.0.1:8870`), so live CEP smoke was skipped for this milestone. Log: `.codex-runtime/validation/m183-live-availability-20260523-165831.log`. |
| M184 AGENTS non-live suite | Required because M184 adds SDK feature conveyor evidence, runner, and check:rules wiring. | Passed on 2026-05-23 in `.codex-runtime/validation/m184-non-live-20260523-181941.log`: touched JS `node --check`, feature conveyor readiness/command smokes, current-history smoke, `npm.cmd run check:rules`, `git diff --check`, provider contract/API, solution registry/candidate/promotion/retrieval/library, project intent memory, plan classification/repair, semantic verification, reliability validation, ChatGPT connector, prompt optimization, bridge-only smoke, and main smoke. `git diff --check` printed only existing LF-to-CRLF working-copy warnings. |
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
| `node --check` for M179 touched JavaScript | Required because M179 bumps runtime and smoke expectation JS files. | Passed on 2026-05-22 for CEP panel, bridge/MCP, and touched smoke/helper scripts. |
| Configured local smoke suite from AGENTS.md | Required for M179 version bump because bridge/panel/version expectations changed. | Passed on 2026-05-22 for all listed non-live checks. |
| `git diff --check` | Required by selected cleanup conveyor items and M179 version bump. | Passed on 2026-05-22; Git printed only LF-to-CRLF working-copy warnings for touched text files. |
| `node scripts/cep-sync-health.js --check --json` | Required for M180 installed CEP sync and version alignment. | Passed on 2026-05-22 after sync; installed tracked files and versions match repo `2.0.0`. |
| `node scripts/cep-sync-cache-smoke.js` | Required because M180 hardens sync-health/title expectations. | Passed on 2026-05-22. |
| `node --check scripts/cep-panel-cdp-smoke.js` | Required because M181 changes CDP recover-state smoke expectations. | Passed on 2026-05-22. |
| `node --check cep-panel/panel.js` | Required because M182 changes saved-plan recovery in the CEP panel. | Passed on 2026-05-22. |
| `node scripts/m100-protocol-contract-smoke.js` | Required because M182 keeps recovery on server-owned M100 proposals and avoids persisted client proposal tokens. | Passed on 2026-05-22. |
| Live CEP/AE validation | Requested for M180-M182 when After Effects and the panel are available. | M182 connected pass on 2026-05-22: `get_bridge_status` returned bridge `2.0.0` with `panelConnected:true`; `ping_ae` returned AE `26.2x49` and 263 project items; CDP `inspect` saw installed `AE Agent 2.0.0`; `connector-status-smoke` passed; broad `node scripts/cep-panel-cdp-smoke.js smoke` passed through Local/Ollama plan generation, stored structured plan recovery via bridge proposal, dry run, and read-only run. |
| M185 AGENTS non-live suite | Required because M185 adds a Dakkshin intake scope brief and updates the active plan. | Passed on 2026-05-23 in `.codex-runtime/validation/m185-non-live-20260523-183139.log`: feature conveyor readiness smoke, `npm.cmd run check:rules`, `git diff --check`, provider contract/API, solution registry/candidate/promotion/retrieval/library, project intent memory, plan classification/repair, semantic verification, reliability validation, ChatGPT connector, prompt optimization, bridge-only smoke, and main smoke. `git diff --check` printed only existing LF-to-CRLF working-copy warnings. |
| SDKThread/network/external-provider/OpenAI CLI planner/mutating-live validation | Forbidden/out of scope for this turn. | Not run. |
| Package install/dependency change validation | Out of scope because no dependency change is allowed. | Not run. |

### Milestone 184

- Added `.codex-audit/sdk-feature-conveyor/184-ae-agent-feature-conveyor-review.json`.
- Added `.codex-audit/sdk-feature-conveyor/184-ae-agent-feature-conveyor-readiness.json`.
- Added `.codex-audit/sdk-feature-conveyor/184-ae-agent-feature-conveyor-governance.json`.
- Added `.codex-audit/sdk-feature-conveyor/184-dakkshin-intake-feature-queue.json`.
- Added `orchestrator/run-ae-agent-feature-conveyor.mjs`.
- Added `scripts/sdk-ae-agent-feature-conveyor-readiness-smoke.js` and `scripts/sdk-ae-agent-feature-conveyor-command-smoke.js`.
- Updated `.codex-audit/sdk-current-state.json`, `orchestrator/adapters/ae-agent-sdk-policy.mjs`, `orchestrator/run-buffered-acceptance.mjs`, `orchestrator/README.md`, `package.json`, and `scripts/sdk-current-history-index-smoke.js`.
- Passed touched-JavaScript `node --check`, feature conveyor readiness/command smokes, current-history smoke, `npm.cmd run check:rules`, `git diff --check`, provider contract/API, solution registry/candidate/promotion/retrieval/library, project intent memory, plan classification/repair, semantic verification, reliability validation, ChatGPT connector, prompt optimization, bridge-only smoke, and main smoke.
- Full non-live validation log: `.codex-runtime/validation/m184-non-live-20260523-181941.log`.
- Live CEP/AE, external-provider/OpenAI CLI planner validation, mutating-live validation, package install/dependency validation, push, and PR were not run because M184 keeps them out of scope.

### Milestone 185

- Added `.codex-audit/sdk-feature-conveyor/dakkshin-intake/m185-scope-brief.md`.
- Updated `plans/target-app-execplan.md` and `.codex/handoff.md`.
- Passed feature conveyor readiness smoke, `npm.cmd run check:rules`, `git diff --check`, provider contract/API, solution registry/candidate/promotion/retrieval/library, project intent memory, plan classification/repair, semantic verification, reliability validation, ChatGPT connector, prompt optimization, bridge-only smoke, and main smoke.
- Full non-live validation log: `.codex-runtime/validation/m185-non-live-20260523-183139.log`.
- SDKThread/network child execution, live CEP/AE, external-provider/OpenAI CLI planner validation, mutating-live validation, package install/dependency validation, push, and PR were not run because M185 is a local-only intake brief.

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

### Milestone 179

- Bumped current AE Agent version from `1.0.11` to `2.0.0` in CEP panel, CEP manifest, bridge daemon, MCP adapter, smoke expectations, active README/spec/plan docs.
- Preserved historical archive files without rewriting older `1.0.11` evidence.
- Passed `node --check` for touched JavaScript files.
- Passed the AGENTS non-live smoke suite:
  `check:rules`, provider contract/API, solution registry/candidate/promotion/retrieval/library, project intent memory, plan classification/repair, semantic verification, reliability validation, ChatGPT connector, prompt optimization, bridge-only smoke, and main smoke.
- Live CEP/AE sync was not run because the user requested repo publication only.

### Milestone 180

- Synced the installed CEP extension to repo `2.0.0` files with `node scripts/cep-sync-health.js --sync --json`.
- Fixed the remaining repo static title/version fallback in `cep-panel/index.html`.
- Updated `scripts/install-cep-panel.ps1` restart/menu hints to `AE Agent 2.0.0`.
- Added sync-health protection for stale repo HTML title vs current panel version.
- Updated `scripts/cep-sync-cache-smoke.js` to assert the current repo title and no version mismatches after sync.
- Passed `node --check` for touched JavaScript files.
- Passed `node scripts/cep-sync-health.js --check --json` and `node scripts/cep-sync-cache-smoke.js`.
- Passed the AGENTS non-live smoke suite:
  `check:rules`, provider contract/API, solution registry/candidate/promotion/retrieval/library, project intent memory, plan classification/repair, semantic verification, reliability validation, ChatGPT connector, prompt optimization, bridge-only smoke, and main smoke.
- Live CEP/CDP validation could not complete because After Effects was not running and the panel was not connected.

### Milestone 181

- Verified initial git state and remote state exactly as expected for the post-M180 local repository.
- Confirmed After Effects was running and the installed `AE Agent 2.0.0` CEP panel was connected.
- Passed `get_bridge_status`, `ping_ae`, `node scripts/cep-panel-cdp-smoke.js inspect`, and `node scripts/cep-panel-cdp-smoke.js connector-status-smoke`.
- Updated `scripts/cep-panel-cdp-smoke.js` so recover-state checks expect the current `No action proposal ready` UI status.
- Passed `node --check scripts/cep-panel-cdp-smoke.js`.
- Passed the AGENTS non-live smoke suite:
  `check:rules`, provider contract/API, solution registry/candidate/promotion/retrieval/library, project intent memory, plan classification/repair, semantic verification, reliability validation, ChatGPT connector, prompt optimization, bridge-only smoke, and main smoke.
- Full non-live validation log: `.codex-runtime/validation/m181-non-live-20260522-213658.log`.
- Passed `git diff --check`; Git printed only the existing LF-to-CRLF working-copy warnings for touched text files.
- `node scripts/cep-panel-cdp-smoke.js smoke` did not pass: after the status-expectation fix, it failed waiting for recovered plan readiness because local Ollama returned a `needs review` recovery result with no executable MCP steps.

### Milestone 182

- Updated `cep-panel/panel.js` so new Agent plan transcript entries retain a minimal structured plan snapshot for deterministic recovery.
- Recovery now calls `/agents/plan/propose` for stored structured plans, receives a fresh backend-owned M100 proposal, and avoids a second Local/Ollama planning call. The legacy text-recovery path remains available when no stored structured plan exists.
- Synced the installed CEP extension with `node scripts/cep-sync-health.js --sync --json`; only installed `panel.js` was copied and CEP cache folders were cleared while Local Storage was preserved.
- Passed `node --check cep-panel/panel.js`.
- Passed the AGENTS non-live smoke suite plus M100 and sync checks:
  `check:rules`, provider contract/API, solution registry/candidate/promotion/retrieval/library, project intent memory, plan classification/repair, semantic verification, reliability validation, ChatGPT connector, prompt optimization, bridge-only smoke, main smoke, `m100-protocol-contract-smoke`, `cep-sync-health --check --json`, and `cep-sync-cache-smoke`.
- Full non-live validation log: `.codex-runtime/validation/m182-non-live-20260522-215347.log`.
- Passed live `get_bridge_status`, `ping_ae`, `node scripts/cep-panel-cdp-smoke.js inspect`, `node scripts/cep-panel-cdp-smoke.js connector-status-smoke`, and broad `node scripts/cep-panel-cdp-smoke.js smoke`.
- The broad live smoke generated a read-only Local/Ollama plan, recovered it through `Recovered saved structured plan through bridge proposal ...`, then completed dry run and read-only run without project mutation.

### Handoff

`.codex/handoff.md` is writable from the parent Codex process and is updated after milestone work. Use it as the primary continuation record.
