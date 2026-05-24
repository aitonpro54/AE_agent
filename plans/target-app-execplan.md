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
- [x] Milestone 186 approval gate: Dakkshin tool gap map approved for one SDK run, not executed yet.
- [x] Milestone 186: Dakkshin intake tool gap map.
- [x] Milestone 187: Dakkshin advisory solution-library entries.
- [x] Milestone 188: Staged live conveyor validation for M187 advisory recipes.
- [x] Milestone 189: Camera layer typed bridge tool.
- [x] Milestone 190: Full UI Agent live conveyor validation for new typed tools.
- [x] Milestone 191: Mask safety typed tool and Full UI Agent live CEP/AE conveyor lane.
- [x] Milestone 192: Explicit layer duplicate typed bridge tool.
- [x] Milestone 193: Layer marker evidence for existing marker typed tool.
- [x] Milestone 194: Marker delete/update gated-slice design.
- [x] Milestone 195: Explicit layer marker update typed bridge tool.
- [x] Milestone 196: Explicit layer marker delete typed bridge tool.
- [x] Milestone 197: Bulk/selected-layer duplicate gated-slice design.
- [x] Milestone 198: Standing live validation rule and marker lifecycle OpenAI CLI lane.
- [x] Milestone 199: Roadmap supervisor contract, governance, and plan-only preview.
- [x] Milestone 200: Roadmap supervisor execute-one validation/commit/handoff loop.
- [x] Milestone 201: Roadmap supervisor run-until-budget loop with parallel read-only reviewers.
- [x] Milestone 202: Roadmap supervisor live AE/CEP validation hooks.
- [x] Milestone 203: Bulk/selected-layer duplicate supervisor queue plan-only preview.
- [x] Milestone 204: Roadmap supervisor single-approval chain and direct roadmap-sdk writer.
- [x] Milestone 204 queue item: explicit `duplicate_layers` runtime typed bridge tool.
- [x] Milestone 205 queue item: planner and plan-repair exposure for `duplicate_layers`.
- [x] Milestone 206 queue item: semantic verification and local smoke coverage for `duplicate_layers`.
- [x] Milestone 207 queue item: generated-only Full UI Agent live validation lane for `duplicate_layers`.
- [x] Milestone 208 queue item: solution-library guidance for bulk/selected-layer duplicate workflows.
- [x] Milestone 209 queue item: roadmap supervisor proof for the `duplicate_layers` queue.
- [x] Milestone 210 queue item: duplicate_layers epic governance closeout.
- [x] Milestone 211: duplicate_layers closeout reconciliation.
- [x] Milestone 212 queue item: AO-inspired task/session/activity intake contract completed; ignored handoff update is blocked by current writer-child ACL and must be finalized by supervisor/parent.
- [x] Milestone 213 queue item: AO-inspired stuck detector and escalation design completed as a design-only policy over the M212 contract; ignored handoff update is blocked by current writer-child ACL and must be finalized by supervisor/parent.
- [x] Milestone 214 queue item: AO-inspired static status dashboard artifacts and validation completed as a no-dependency Markdown renderer over explicit roadmap supervisor session/fixture artifacts; ignored handoff update is blocked by current writer-child ACL and must be finalized by supervisor/parent.
- [x] AUX-004 support item: AO-inspired read-only failure analyzer packet completed as a no-dependency stdout analyzer over explicit report/log/session fixture paths, closing the AUX-001-AUX-004 AO-inspired support lane while preserving existing M212-M215 references as legacy compatibility records.
- [x] M211-M215 branch audit: static validation, read-only AE/CEP checks, and generated-only OpenAI CLI live lanes were rerun after the suspected parallel-thread competition; the queue closeout marker now points at the actual AUX alignment commit instead of a temporary pending placeholder.
- [x] Provider operation rule: Local/Ollama is no longer used for planner runs, broad/default-provider CEP smokes, fallback planning, recovery validation, or mutating validation unless the user explicitly asks for Local/Ollama in the current turn.
- [x] Milestone 204 supervisor repair: roadmap-sdk writer CLI fallback for SDK parser/transport failures.
- [x] Milestone 204 supervisor repair: ignored handoff gate for real roadmap runs.

## Current Stable Baseline

- The active repository is `C:\Users\Ant\Documents\Codex\AE_agent`.
- The native CEP title/menu format is `AE Agent 2.0.0`.
- The panel is a compact dark CEP client for the local bridge daemon.
- Provider paths are separate: OpenAI API, OpenAI CLI, Gemini, Claude, OpenRouter, and Local/Ollama.
- Current operating rule: Local/Ollama remains a product provider path, but it must not be selected for planner runs, live CEP smokes, broad/default-provider smokes, fallback planning, recovery validation, or mutating validation unless the user explicitly asks for Local/Ollama in the current turn.
- Agent mode drafts structured MCP plans, validates tool names and required fields, dry-runs plans, and executes only through explicit mutation gates.
- Agent plans with `validation.ok` and review-warning classifications stay runnable in Agent and Agent Hardcore; classification is guidance, while invalid schema/tools, raw ExtendScript approval, runtime bindings, mutation permission, checkpoint, and edit-session gates remain enforced by the runner.
- Agent Hardcore is a visible composer mode next to Agent; its composer send button starts owner-mode autopilot with high reasoning, while manual `Dry run / Проверить` and `Выполнить план` controls remain visible for the latest active plan.
- The latest valid Agent plan exposes inline `Dry run / Проверить` and `Выполнить план` controls inside the chat message, while keeping the same validated backend runner and project-change gates.
- Raw ExtendScript plans stay blocked for normal Run until a successful dry run of the same current plan records a short-lived gate id; the enabled Run then sends `allowRawExtendscript:true` with the matching `rawExtendscriptDryRunId`.
- Agent plans or runs that reveal a typed-tool gap can create an ignored `logs/dev-requests/<id>/` bundle for a targeted Codex App dev handoff instead of continuing repo development inside the AE chat; v1 does not auto-create a Codex App chat.
- The panel appends a compact resource report after completed chat/plan/run/dev-request operations with local five-hour task-window usage, estimated current panel context, and provider token usage when the provider returned it.
- Project-changing tools use idempotency, optional checkpoints, edit-session protection, and post-mutation verification.
- The typed bridge catalog includes production project-structure tools: `create_comp`, `create_project_folder`, `list_project_folder_items`, and `move_project_items_to_folder`.
- Common layer creation now includes a narrow `create_camera_layer` typed tool alongside text, solid, null, adjustment, shape, and project-item layer creation. Camera creation is M100-gated, supports explicit comp target or active comp, generated/default naming, point-of-interest, position, zoom, timing, idempotency/checkpoint fields, and read-back verification.
- M190 live acceptance proved the new tool matrix from inside the installed CEP panel through CDP, Agent UI, `openai-cli`/`gpt-5.5`, a panel-generated plan, dry run, protected run, bridge read-back, and generated-only cleanup. Acceptance did not use deterministic backend fallback, Local/Ollama fallback, or OpenRouter fallback.
- The typed bridge catalog now includes `create_layer_mask`, a bounded first mask-safety slice that creates one additive closed polygon mask on an existing layer, rejects destructive mask operations, and exposes mask shape/mode read-back through `get_layer_details`.
- M191 live acceptance proved the mask safety slice from inside the installed CEP panel through CDP, Agent UI, `openai-cli`/`gpt-5.5`, a panel-generated mask plan, dry run, protected run, semantic verification, bridge read-back, and generated-only cleanup. Acceptance did not use deterministic backend fallback, Local/Ollama fallback, or OpenRouter fallback.
- The typed bridge catalog now includes `duplicate_layer`, a bounded explicit single-layer duplication tool that requires a target layer index, can verify the expected source layer name, returns source/duplicate read-back, and deliberately does not delete layers or rely on selection-only ambiguity.
- The typed bridge catalog now includes `duplicate_layers`, a bounded explicit many-layer duplication runtime tool that requires non-empty concrete `layerIndices`, rejects duplicate/non-positive/out-of-range/locked/selection-only targets, returns source/duplicate pair read-back plus before/after layer counts, and deliberately does not delete layers, deep-duplicate/relink source trees, or edit masks/audio/user assets.
- Planner guidance and bounded plan-repair aliases now expose `duplicate_layers` for explicit bulk/selected-layer duplicate intents. Selected-layer repair requires prior read-only selected-layer evidence before binding `{{selectedLayerIndices}}`; semantic verification now checks source/duplicate pair counts, expected duplicate names, before/after layer counts, and post-run read-back evidence. The M207 generated-only Full UI Agent live lane is registered and fail-closed for installed-panel/CDP/OpenAI CLI validation, and M208 adds Solution Library tool-backed guidance that prefers `duplicate_layers` for explicit bulk duplication while requiring prior `get_selected_layers` evidence for selected-layer duplicate workflows.
- The existing `add_layer_marker` typed tool now has explicit marker evidence: it returns created-marker read-back, `get_layer_details` exposes marker summaries, and semantic verification checks comment/time/duration against post-run read-back. It does not analyze audio, detect beats, bulk-generate markers, delete/update markers, or claim audio-derived marker evidence.
- M194 records the future marker delete/update contract as a separate gated slice. No marker delete/update runtime tools exist yet; the design requires explicit marker targeting, before/after read-back, semantic absence/update checks, and separate approval for any generated-only live validation lane.
- The typed bridge catalog now includes `update_layer_marker`, a bounded single-marker update tool that targets an existing layer marker by `markerIndex` or strict `targetTime`, optionally guards with `targetComment`, updates only comment/time/duration, and returns before/after marker read-back.
- The typed bridge catalog now includes `delete_layer_marker`, a bounded single-marker delete tool that targets an existing layer marker by `markerIndex` or strict `targetTime`, optionally guards with `targetComment`, returns deleted-marker read-back plus after-summary, and semantically verifies the deleted marker is absent after read-back.
- New project-structure mutations are M100-gated and inherit checkpoint/idempotency/post-verification safety fields; the folder listing tool remains read-only.
- Precomp/source workflows include `deep_duplicate_precomp_sources` for recursively duplicating a selected precomp layer's source comp and nested comp/footage project items without raw ExtendScript in Agent plans.
- Raw ExtendScript remains available as an escape hatch, but normal product workflows should use typed bridge tools.
- The Solution Library includes Dakkshin-inspired advisory typed-plan recipes for basic comp setup, safe effect addition, and selected-layer animation, plus tool-backed `duplicate_layers` guidance for explicit bulk/selected-layer duplicate workflows; these are planner hints only and still execute through normal Agent validation and protected run gates.
- CEP `Reload` forces a cache-busted reload of installed `index.html` and passes a fresh asset nonce to CSS/JS, so an already-open panel can pick up synced files without stale `panel.js?v=<old>` cache entries.
- CEP install/sync clears only this extension's Chromium cache folders (`Cache`, `Code Cache`, `GPUCache`, `blob_storage`) while preserving Local Storage.
- Installed CEP tracked files now match the repository at `AE Agent 2.0.0`.
- Live AE/CEP connectivity with the opened `AE Agent 2.0.0` panel is verified: bridge status, `ping_ae`, CDP inspect, and connector-status smoke pass.
- Standing project rule as of M198: when After Effects, the installed AE Agent panel, and bridge are available, live CEP/AE validation is mandatory; planner-visible or mutating tool changes also require a relevant generated-only Full UI Agent `openai-cli` planner acceptance lane, or a newly added narrow lane before milestone closeout.
- Historical M182 note: the broad local-Ollama CDP smoke once passed through plan generation, saved-plan recovery, dry run, and read-only run. Current validation must not rerun Local/Ollama or broad default-provider smokes without explicit user direction. Recovery of saved structured Agent plans remains deterministic: the panel stores only the structured plan in chat history, then asks the bridge `/agents/plan/propose` endpoint to revalidate it and mint a fresh M100 action proposal instead of re-prompting the local planner.

## Current SDK Baseline

- Current SDK orchestrator work is local-gated and AE Agent-specific until a separate milestone proves equivalent fail-closed behavior in the sibling `codex-sdk-orchestrator-tool`.
- Current production-code SDK write readiness is limited to exactly `scripts/provider-api-smoke.js` and `scripts/provider-contract-smoke.js`.
- General SDK autopilot repo edits, broad production-code writes, CEP-panel SDK writes, external-provider/OpenAI CLI planner validation, mutating-live validation outside the approved M188/M190/M191 generated-only live lanes, package installs, dependency changes, push, and PR creation remain out of scope without fresh bounded approval.
- CEP-panel SDK writes remain disabled; `cep-panel/panel.js` must not be edited through the SDK lane.
- Current M152+ governance/readiness/conveyor/extraction evidence is directly checked through `npm.cmd run check:rules` and summarized in `.codex-audit/sdk-current-state.json`.
- Historical SDK proof references are summarized in `.codex-audit/sdk-history-index.json`; old proof packets should not be reread by default unless a specific audit needs them.
- SDK smoke consolidation is planned in `.codex-audit/sdk-smoke-consolidation-plan.json`; existing milestone-specific smokes stay active until replacement coverage is green.
- The AE Agent cleanup conveyor command captures full child stdout/stderr into ignored `.codex-runtime/sdk/cleanup-conveyor-logs` execution logs by default, prints compact terminal summaries, and validates both working-tree changes and commits created since pre-run `HEAD` against the selected planned-path allowlist.
- The AE Agent feature conveyor is now locally smoke-checked for Dakkshin intake, M187 field validation, M190 Full UI Agent new-tool validation, and M191 mask-safety validation through `.codex-audit/sdk-feature-conveyor/184-dakkshin-intake-feature-queue.json` and `orchestrator/run-ae-agent-feature-conveyor.mjs`; SDK workspace-write execution remains separate from the M188/M190/M191 `--validate-live` lanes.
- The AE Agent roadmap supervisor now sits above existing bounded runners as a deterministic local autopilot: plan-only preview, queueSha256-bound single approval for `roadmap-sdk` chains, SDK writer path plus `--engine cli` writer fallback for SDK parser/transport failures, read-only `--live-check` against an already-open AE Agent panel, execute-one, run-until-budget, runtime session state under `.codex-runtime/sdk/roadmap-supervisor/`, one writer child at a time, up to two read-only reviewers in parallel, validation before auto-commit, optional item-level generated-only live validation with single-approval live bindings or fallback `--live-approval-text`, required handoff checks, exact approval text, and no push/dependency/mutating-live/CEP/external-provider work by default. M209 records duplicate_layers queue evidence that plan-only creates no child run, SDK thread, or runtime state, and that supervisor smokes cover single-approval queue behavior. M210 records duplicate_layers closeout docs/governance state with no runtime behavior, CEP panel, dependency, push, PR, or live AE/CEP changes during closeout, M211 reconciles the tracked closeout state with the parent-updated `.codex/handoff.md`, the AO-inspired support lane now uses AUX-001 for activity/session intake, AUX-002 for stuck/escalation design, AUX-003 for the static dashboard, and AUX-004 for the read-only failure analyzer; historical M212-M215 labels remain compatibility records only and do not define future support work. Future orchestrator/support-lane work should use AUX labels instead of new product-roadmap M### ids.

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

### Milestone 186 approval gate: Dakkshin tool gap map

- Completed: recorded user approval in `.codex-audit/sdk-feature-conveyor/186-dakkshin-tool-gap-map-approval.json`.
- Completed: updated `.codex-audit/sdk-feature-conveyor/184-dakkshin-intake-feature-queue.json` so only `m186-dakkshin-intake-tool-gap-map` has `executionApprovalState:"approved"` and `maxAiTurns:1`.
- Completed: kept `m185-dakkshin-intake-scope-brief` and `m187-dakkshin-intake-implementation-slice-plan` pending with `maxAiTurns:0`.
- Completed: updated feature conveyor readiness/command smokes and current SDK state docs for the one-approved-item state.
- The approved run is limited to `.codex-audit/sdk-feature-conveyor/dakkshin-intake/m186-tool-gap-map.md`, `plans/target-app-execplan.md`, and `.codex/handoff.md`; it does not approve Dakkshin product implementation, CEP-panel SDK writes, bridge runtime changes, live CEP/AE, external providers, dependency changes, push, or PR.

### Milestone 186: Dakkshin intake tool gap map

- Completed: added `.codex-audit/sdk-feature-conveyor/dakkshin-intake/m186-tool-gap-map.md`.
- Completed: mapped known Dakkshin-inspired needs to the current typed bridge catalog using existing repo evidence only.
- Completed: separated advisory/RAG needs from mutating AE tool needs.
- Completed: recommended the smallest later slices: advisory help/prompt entries, a narrow camera-layer creation tool, a cautious mask read/write slice, and reliability evidence refinement.
- Child SDK run could not update `.codex/handoff.md` or create its own commit because of local permission errors, but the parent Codex process completed handoff/commit finalization after the SDK run.
- No Dakkshin product behavior, CEP panel, bridge runtime, dependencies, package-lock, live CEP/AE validation, external-provider/OpenAI CLI planner validation, mutating-live validation, push, or PR changed.

### Milestone 187: Dakkshin advisory solution-library entries

- Completed: added reviewed typed-plan recipes for basic comp setup, safe effect addition, and selected-layer animation.
- Completed: registered the recipes in `registry/solutions.json` with `dakkshin-advisory` tags and normal mutating safety gates.
- Completed: extended `scripts/solution-library-validation-smoke.js` so the new entries must remain raw-free, dedicated-recipe-backed, and retrievable for comp/effect/animation prompts.
- Existing `active-comp-context-review` continues to cover the inspect-comp advisory prompt, so M187 did not duplicate that entry.
- No new bridge tools, CEP panel changes, raw ExtendScript, mask/destructive/audio/broad comp changes, live CEP/AE validation, external-provider/OpenAI CLI planner validation, package/dependency changes, push, or PR were added by the product slice itself.

### Milestone 188: Staged live conveyor validation for M187 advisory recipes

- Completed: added `m188-dakkshin-advisory-field-validation` to the feature conveyor queue as a separate local-live-validation item with its own exact live approval text and no SDK/CLI child execution.
- Completed: extended `orchestrator/run-ae-agent-feature-conveyor.mjs` with `--validate-live`, `--stage read-only|mutating|both`, `--allow-mutating-live`, live dry-run JSON, dirty-git blocking, staged local command orchestration, child logs, and JSON report output.
- Completed: added `scripts/m187-advisory-field-smoke.js` for M187 field validation. Read-only mode checks bridge health, CEP inspect, `ping_ae`, saved project preflight, Solution Library retrieval for the three M187 prompts, and typed-plan validation/dry-runs. Mutating mode uses generated prefixes, allowlisted effect discovery, M100 proposal/run gates, read-back verification, cleanup, and render queue drift checks.
- Completed: extended `scripts/reliability-validation-suite.js` with `mutating-live-local`, which includes the protected mutating smoke and local Agent scenario smoke while excluding OpenAI CLI/external-provider planner validation.
- Completed: updated feature conveyor readiness/command smokes, current SDK state, current/history smoke, and orchestrator README for the M188 lane.
- Live acceptance attempt on 2026-05-23 failed at the read-only preflight: `live-cep-inspect` could not connect to CEP CDP at `127.0.0.1:8870` (`ECONNREFUSED`). The generated-only mutating stage did not run.
- No external-provider/OpenAI CLI planner validation, package/dependency changes, mask/destructive/audio/broad comp changes, SDK workspace-write execution, push, or PR were added by this milestone.

### Milestone 189: Camera layer typed bridge tool

- Completed: added `create_camera_layer` as the next narrow Dakkshin-inspired typed bridge capability from the M186 gap map.
- Completed: kept the scope to one camera layer only: explicit comp target or active comp, optional generated/default name, point-of-interest, position, zoom, start time, and duration.
- Completed: registered the tool as mutating/planning-visible so it inherits M100 proposal blocking, idempotency, optional checkpoint, edit-session protection, and post-mutation verification.
- Completed: extended `get_layer_details` and mutation verification read-back with camera-friendly transform/camera fields.
- Completed: added plan-repair aliases, semantic verification checks, ChatGPT connector read-only filtering, solution-promotion known/mutating tool lists, M187 field-smoke mutating classification, and main smoke catalog coverage.
- Live AE/CDP validation was not run because `node scripts/cep-panel-cdp-smoke.js inspect` still cannot connect to `127.0.0.1:8870`.
- No CEP panel UI, external-provider/OpenAI CLI planner validation, package/dependency changes, mask/destructive/audio/broad comp changes, SDK workspace-write execution, push, or PR were added by this milestone.

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
- M186 approval gate: Approved exactly one SDK execution for the Dakkshin tool gap map queue item and updated smokes to prove all other feature conveyor items remain pending.
- M186: Completed the local-only Dakkshin tool gap map; it is intake evidence only and does not implement product behavior.
- M187: Implemented the smallest advisory product slice from M186 by adding typed-plan Solution Library entries for basic comp creation, safe effect addition, and selected-layer animation.
- M188: Added a staged fail-closed local live-validation lane to the feature conveyor for M187 advisory recipes, with read-only live checks, generated-only mutating field smoke, and mutating-live-local reliability scenarios kept separate from SDK workspace-write and external-provider/OpenAI CLI planner validation.
- M189: Added a narrow M100-gated `create_camera_layer` typed bridge tool with camera read-back, plan-repair aliases, semantic verification, and local smoke coverage.
- M190: Added and passed a Full UI Agent live conveyor lane for the new typed tools matrix, using the installed panel/CDP, `openai-cli` with `gpt-5.5`, panel-generated plans only, protected generated-only mutations, read-back verification, and cleanup.
- M191: Added a bounded `create_layer_mask` typed tool plus a Full UI Agent OpenAI CLI live conveyor lane for generated-only mask safety proof inside After Effects, with panel-generated plans required and fallback acceptance disallowed.
- M192: Added a bounded `duplicate_layer` typed bridge tool for explicit single-layer duplication with source-name safety check, read-back, plan-repair aliases, semantic verification, and local non-live smoke coverage.
- M193: Strengthened the existing `add_layer_marker` typed bridge tool with created-marker read-back, marker summaries in `get_layer_details`, plan-repair aliases, semantic verification, and local non-live smoke coverage.
- M194: Added a design-only marker delete/update contract that keeps future marker edits separate from audio analysis, bulk marker generation, layer deletion, mask/path editing, live validation, and planner acceptance until separately implemented and approved.
- M195: Added `update_layer_marker` as a bounded single-marker update typed tool with explicit target guards, before/after marker read-back, plan-repair aliases, semantic verification, and local non-live smoke coverage.
- M196: Added `delete_layer_marker` as a bounded single-marker delete typed tool with explicit target guards, deleted-marker/after-summary read-back, plan-repair aliases, semantic absence verification, and local non-live smoke coverage.
- M197: Added a design-only bulk/selected-layer duplicate contract that keeps future many-layer duplication separate from single-layer duplication, deep-precomp/source duplication, layer deletion, mask/path editing, live validation, and planner acceptance until separately implemented and approved.
- M198: Promoted live CEP/AE and generated-only OpenAI CLI planner acceptance into a standing project rule when the live stack is available, and added the M198 marker lifecycle Full UI Agent live conveyor lane for add/update/delete marker proof.
- M199: Added the roadmap supervisor contract, governance/readiness artifacts, default safe queue, plan-only preview, exact approval text generation, and package/check:rules wiring.
- M200: Added execute-one support for one approved queue item with clean-git preflight, writer child logs, planned-path diff enforcement, validation, required handoff update, auto-commit of planned files only, and final report writing.
- M201: Added run-until-budget/resume behavior with max item/minute budgets, runtime state, sequential writer execution, and up to two read-only reviewer tasks in parallel.
- M202: Added roadmap supervisor `--live-check`, `--require-live-connectivity`, queue item `liveValidation` policy, and separate `--live-approval-text` for generated-only AE/CEP lanes.
- M203: Added the Bulk / Selected Layer Duplicate supervisor queue and passed `--plan-only` preview for the first ready item before any real execution.
- M204: Added queueSha256-bound single approval, direct `roadmap-sdk` writer children, self-contained queue actions, and single-approval generated-only live bindings.
- M204 queue item: Added `duplicate_layers` as the explicit many-layer runtime typed bridge tool with required `layerIndices`, source/duplicate pair read-back, before/after layer counts, local smoke coverage, and no live AE/CEP mutation.
- M205 queue item: Exposed `duplicate_layers` to Agent planner guidance and bounded plan repair for explicit bulk or selected-layer duplicate intents, while preserving `deep_duplicate_precomp_sources` for selected precomp/source workflows and keeping selection-only duplicate invalid without prior read-only evidence.
- M207 queue item: Added a generated-only Full UI Agent live validation lane for `duplicate_layers` that requires the installed panel/CDP, `openai-cli` with `gpt-5.5`, a panel-generated plan, dry run, protected run, bridge read-back, semantic verification, cleanup, and fail-closed rejection of deterministic, Local/Ollama, and OpenRouter fallback.
- M208 queue item: Added Solution Library tool-backed guidance for `duplicate_layers`, including selected-layer `get_selected_layers` evidence requirements, compact tool-match prompt formatting, and smoke coverage that keeps raw ExtendScript and deep precomp/source duplication out of the guidance.
- M209 queue item: Recorded roadmap supervisor evidence for the duplicate_layers queue, proving plan-only/no-child behavior and smoke coverage for queueSha256-bound single-approval behavior without runtime, CEP panel, dependency, push, PR, or live AE mutation changes.
- M210 queue item: Recorded duplicate_layers closeout docs/governance state, updating current SDK state and README notes without changing runtime behavior, CEP panel files, dependencies, package manifests, push, or PR state.
- M211 reconciliation: Marked the duplicate_layers closeout as completed after parent-updated `.codex/handoff.md` and supervisor runtime state confirmed M204-M210 completed.
- M212 queue item: Added `.codex-audit/sdk-ao-pattern-intake/212-activity-session-schema.json` and `scripts/sdk-ao-pattern-intake-smoke.js` as a local AO-inspired intake contract for task envelopes, session roles, lifecycle states, activity JSONL examples, roadmap-supervisor artifact mapping, and forbidden-boundary claims. This is not an AO integration and does not change roadmap supervisor runtime behavior. Updating `.codex/handoff.md` was attempted with `apply_patch` and PowerShell UTF-8 write, but the current writer-child sandbox hit the inherited Deny ACL on the ignored handoff file; supervisor/parent must finalize handoff and commit.
- M213 queue item: Added `.codex-audit/sdk-ao-pattern-intake/213-stuck-escalation-design.json` and `scripts/sdk-ao-stuck-escalation-smoke.js` as a design-only stuck detector/escalation policy over the M212 activity/session contract. The policy maps stale activity, missing log progress, validation failure, child process timeout, needs_input prompts, context pressure, dirty git state, and unplanned path changes to capped escalation actions with no auto-fix or auto-retry default. Updating `.codex/handoff.md` was attempted with `apply_patch` and PowerShell UTF-8 write, but the current writer-child sandbox hit the inherited Deny ACL on the ignored handoff file; supervisor/parent must finalize handoff and commit. No roadmap supervisor runtime behavior, AO install/start, CEP/live path, dependency/package path, push, PR, branch, worktree, GitHub issue, or GitHub Action changed.
- M214 queue item: Added `.codex-audit/sdk-ao-pattern-intake/214-status-dashboard-contract.json`, `scripts/render-roadmap-supervisor-status-dashboard.js`, and `scripts/sdk-ao-status-dashboard-smoke.js` as a static Markdown dashboard over explicit roadmap supervisor session/fixture artifacts. The renderer reads only `state.json`, `events.jsonl`, and immediate `reports/*.json`, prints to stdout by default, writes only an explicitly requested Markdown file through `--output`, and does not add a web server, browser UI, dependency, package script, package manifest change, package lock change, AO install/start, CEP/live/production path access, push, PR, branch, worktree, GitHub issue, or GitHub Action. Updating `.codex/handoff.md` was attempted with `apply_patch` and PowerShell `Set-Content`, but the current writer-child sandbox hit the inherited Deny ACL on the ignored handoff file; supervisor/parent must finalize handoff and commit.
- AUX-001 through AUX-003 compatibility artifacts now point at the completed legacy M212-M214 AO-inspired artifacts without renaming, moving, or deleting them.
- AUX-004 support item: Added `.codex-audit/sdk-ao-pattern-intake/aux-004-readonly-failure-analyzer-contract.json`, `scripts/create-roadmap-failure-analyzer-packet.js`, and `scripts/sdk-ao-failure-analyzer-smoke.js` as a read-only failure analyzer packet lane over explicit report/log/session fixture paths. The analyzer emits JSON or Markdown to stdout, includes failure class, command, status, bounded log tail, supplied changed paths, suspected cause with confidence, forbidden auto-actions, repair prompt, and next bounded task fields, and does not edit source, retry commands, run live AE/CEP, install dependencies, change packages, push, create PRs, create branches/worktrees, or touch CEP/live/production paths. The queue closeout notes were updated only after `git log` showed the M212, M213, and M214 commits; commit `a168a6d` already added the legacy `215-readonly-failure-analyzer-contract.json`; that history is preserved as compatibility, and the active AUX-004 path was added forward-only.
- M204 supervisor repair: `--engine cli` now switches the `roadmap-sdk` writer child itself to Codex CLI, so SDK JSONL parser/transport failures no longer leave the supervisor with only reviewer fallback coverage.
- M204 supervisor repair: roadmap supervisor now validates ignored `.codex/handoff.md` updates by file fingerprint and skips ignored untracked handoff files during `git add`, so real repo runs can pass the handoff gate without trying to commit `.codex/`.

## Decision Log

- 2026-05-24: Auxiliary/orchestrator optimization work must not consume product roadmap `M###` ids. Use `AUX-###` labels for supervisor/conveyor tooling, activity/session contracts, stuck detection, status dashboards, failure analyzers, AO-inspired pattern intake, and other support infrastructure. Existing branch-local AO-inspired `M212-M215` references are historical compatibility records only; future continuation prompts should use `AUX-001+`.
- 2026-05-24: Local/Ollama is an explicitly requested provider only for current operations. Do not use it for planner runs, live CEP smokes, broad/default-provider smokes, fallback planning, recovery validation, or mutating validation unless the user explicitly asks for Local/Ollama in the current turn; use read-only connectivity checks and milestone-specific generated-only `openai-cli` lanes by default.
- 2026-05-24: AUX-004 closes the AO-inspired pipeline-hardening support lane with a read-only failure analyzer packet rather than a repair loop. `scripts/create-roadmap-failure-analyzer-packet.js` requires explicit `--report`, `--log`, or `--session` inputs, reads only bounded log/event tails, prints JSON or Markdown to stdout, and deliberately forbids auto-fix, command retry, live AE/CEP, dependency/package, branch/worktree, push, PR, GitHub issue/action, AO, CEP, live, and production-path actions.
- 2026-05-24: The M211-M215 audit resolves documentation drift by treating `da35c40f3c1fa89ef4d238304fa6db5dad7801c4` as the completed AUX label-alignment commit and replacing temporary pending queue markers. AUX artifact files remain untouched. Generated-only OpenAI CLI live validation is valid only when run sequentially; parallel CEP UI smokes can race through shared panel state.
- 2026-05-24: The AO-inspired queue path stays `.codex-audit/sdk-roadmap-supervisor/211-ao-inspired-pipeline-hardening-queue.json` for M215 closeout. The completed M212-M214 artifact paths remain unchanged, and the queue closeout notes were updated because `git log` showed `b680a4f` for M212, `12eb9be` for M213, and `d1d4756` for M214.
- 2026-05-24: The interrupted M215 retry produced untracked AUX compatibility artifacts that were outside the planned M215 paths; this parent/local closeout removed those untracked duplicates and committed only the planned M215 failure analyzer artifact.
- 2026-05-24: M214 keeps the AO-inspired dashboard as a static Markdown renderer over explicit roadmap supervisor session/fixture roots. The CLI reads bounded `state.json`, `events.jsonl`, and immediate `reports/*.json` artifacts, prints to stdout by default, writes only when `--output` is supplied, and deliberately adds no web server, browser UI, dependency, package change, AO runtime, CEP/live validation, production-path access, push, PR, branch, worktree, GitHub issue, or GitHub Action.
- 2026-05-24: The M214 writer child cannot update `.codex/handoff.md` in this sandbox because the ignored file has an inherited Deny ACL for the current identity. The handoff content is recorded in this active plan instead; supervisor/parent should write `.codex/handoff.md` and create the reviewable M214 commit.
- 2026-05-24: M213 defines stuck detection and escalation as a design-only policy over the M212 contract. Stale activity, missing log progress, validation failure, child process timeout, `needs_input`, `context_pressure`, dirty git state, and unplanned path changes escalate through `stop_and_handoff`, `ask_user`, `create_repair_prompt`, `retry_later`, or `fail_closed` with retry caps, no auto-fix default, no auto-retry default, and no live/dependency/runtime behavior change.
- 2026-05-24: M212 records AO-inspired task/session/activity semantics as a local intake contract only. It defines the task envelope, `writer`/`reviewer`/`analyzer`/`live-check` roles, lifecycle states, activity JSONL examples, and mapping to existing `.codex-runtime/sdk/roadmap-supervisor/<session-id>/` files, while explicitly claiming no AO install/start, no runtime behavior change, no CEP/live/external-provider validation, no dependency/package change, no branch/worktree/push/PR/GitHub Action, and no production-path edits.
- 2026-05-24: The M212 writer child cannot update `.codex/handoff.md` in this sandbox because the ignored file has an inherited Deny ACL for the current identity. The handoff content is recorded in this active plan instead; supervisor/parent should write `.codex/handoff.md` and create the reviewable M212 commit.
- 2026-05-24: Post-M211 AO applicability research is now tracked intentionally in `docs/research/composio-agent-orchestrator-applicability.md`. It does not reopen M211 and does not approve AO installation, `ao start`, worktree/branch/PR/GitHub Actions, dependency, CEP/live, or production writes. The next AO-inspired pipeline-hardening slice should start at M212, beginning with activity JSONL/session lifecycle intake, not by reusing M211.
- 2026-05-24: M211 reconciles the duplicate_layers closeout after the parent process updated `.codex/handoff.md` and the supervisor runtime state recorded M204-M210 in `completedItems`. The tracked M203 queue, current-state artifact, README, and active plan now treat M210 as closed rather than pending handoff ACL repair. The unplanned `docs/research/composio-agent-orchestrator-applicability.md` artifact from a stopped M209 writer attempt was removed because it was outside the queue planned paths.
- 2026-05-24: M210 is closeout-only for the duplicate_layers epic. It records closeout state and validation evidence in allowed governance/docs paths, but it must not add runtime behavior, broaden planner/live acceptance claims, edit CEP panel files, change dependencies, push, create a PR, or claim new live AE/CEP execution beyond the committed M207 evidence.
- 2026-05-24: M209 is evidence-only for the duplicate_layers roadmap queue. The queue artifact may record plan-only/smoke proof, but runtime bridge code, CEP panel code, dependencies, package manifests, push/PR state, and mutating live AE validation stay unchanged. Because any queue edit changes `queueSha256`, M210 must use a fresh plan-only approval string after the M209 documentation commit.
- 2026-05-24: M208 represents duplicate-many Solution Library guidance as a `tool` entry, not a separate recipe file, because this queue item may only write the listed `plannedPaths` and cannot add a new `recipes/` markdown file. Retrieval now emits a compact tool guidance line for `duplicate_layers`; explicit bulk duplicate plans should use concrete `layerIndices`, selected-layer duplicate plans need prior `get_selected_layers` evidence, and raw ExtendScript, deep precomp/source duplication, source relinking, deletion, mask/path edits, audio workflows, and arbitrary user-asset mutation stay out of this guidance.
- 2026-05-24: M206 accepts `duplicate_layers` semantic success only when the mutation result exposes one source/duplicate pair per requested source, expected duplicate names, and before/after count verification, and a later read-back step confirms the duplicate names and after layer count. Missing post-run read-back stays `needs_review`.
- 2026-05-24: M207 live acceptance for `duplicate_layers` must run through the installed panel via CDP, Agent UI/chat, `openai-cli` with `gpt-5.5`, panel-generated plan only, M100 dry run/protected run, duplicate source/duplicate read-back, semantic verification, and generated-prefix cleanup. Deterministic backend fallback, Local/Ollama, OpenRouter, user-asset mutation, and leftover generated items are not acceptance evidence.
- 2026-05-24: M205 makes `duplicate_layers` planner-visible only for bounded duplicate-many workflows. Repair aliases are plural/selected only; selected-layer repair may bind `layerIndices` from `{{selectedLayerIndices}}` only after a prior read-only selected-layer inspection, and selected precomp/source duplicate workflows continue to prefer `deep_duplicate_precomp_sources`.
- 2026-05-24: The `m204-duplicate-layers-runtime-tool` queue item intentionally adds runtime/schema/smoke coverage only. Planner exposure, repair aliases, semantic verification, generated-only live validation, and solution-library guidance remain in later queue items so the duplicate-many epic stays reviewable and fail-closed.
- 2026-05-24: The failed roadmap SDK writer child could not finish `.codex/handoff.md`, so the parent repair turn validated the dirty planned-path changes, fixed the smoke fixture and undo-group closure, then updated the handoff itself before committing M204.
- 2026-05-24: User gave standing approval to run live CEP/AE validation and OpenAI CLI planner acceptance when AE, the installed panel, and bridge are available. Future milestones should not skip relevant live validation merely because it is slower; if a required live lane does not exist, add a narrow generated-only fail-closed lane.
- 2026-05-24: Roadmap supervisor milestones are numbered M199-M201 because M198 was already occupied by the marker lifecycle live-validation lane. This preserves the user's requested design while avoiding a milestone collision.
- 2026-05-24: Roadmap supervisor is deterministic control-plane code, not a long-lived LLM agent. It may run aggressive multi-item loops only inside exact approval text, with one writer child at a time, optional parallel read-only reviewers, validation before commit, and no push/dependency/live/CEP/external-provider work unless a later item adds its own approval.
- 2026-05-24: The supervisor's approval text must bind repository path, queue path, max items, max minutes, auto-commit permission, `noPush=true`, `noDependencyChanges=true`, and `noLiveCepAeUnlessPerItemApproved=true`; plan-only preview is the source of the exact string.
- 2026-05-24: M202 lets the roadmap supervisor check real open After Effects / AE Agent panel state itself. Read-only connectivity checks do not need mutating approval, but generated-only Full UI Agent or other mutating live commands must be declared in the queue item `liveValidation` policy and require separate exact `--live-approval-text`.
- 2026-05-24: M203 starts the Bulk / Selected Layer Duplicate epic in roadmap-supervisor plan-only mode only. The new queue is sequential and previewable, but its item approvals remain `pending-explicit-approval`; real `--run-until-budget` execution still needs a fresh approval turn and matching lower feature-conveyor item activation.
- 2026-05-24: M204 removes the lower feature-conveyor activation requirement for long supervisor chains by adding `roadmap-sdk`. A single supervisor approval now binds the frozen queue content through `queueSha256`, all queue item ids, max budget, auto-commit/no-push/no-deps policy, and generated-only live bindings; legacy `feature-conveyor` and `cleanup-conveyor` runners remain available for specialized lanes.
- 2026-05-24: The SupervisorChild failure was caused by the `roadmap-sdk` writer ignoring `--engine cli`; only reviewers and legacy conveyor children switched to CLI, while the writer still used the SDK stream parser and could fail on local process-termination text. The repair makes `--engine cli` select a Codex CLI writer for `roadmap-sdk` items with the same supervisor approval, planned-path, validation, handoff, and commit gates.
- 2026-05-24: Before running the M205-M210 chain, the real repository exposed a second supervisor gate issue: `.codex/handoff.md` is ignored, so git-status-based handoff validation and unconditional `git add` would fail after writer success. The supervisor now checks required handoff updates by file fingerprint and stages only planned paths that are tracked or not ignored.
- 2026-05-24: M198 marker lifecycle acceptance must run inside the installed panel through CDP, Agent UI/chat, `openai-cli` with `gpt-5.5`, panel-generated plan only, M100 dry run/protected run, bridge marker read-back, and generated-prefix cleanup. Deterministic backend fallback, Ollama, OpenRouter, and raw ExtendScript fallback are not acceptance evidence.
- 2026-05-24: M197 treats bulk/selected-layer duplication as its own future gated slice, not an implicit extension hidden inside `duplicate_layer`. Future `duplicate_layers` work should require concrete `layerIndices`; selected-layer convenience must come from prior read-only selected-layer evidence rather than selection-only ambiguity.
- 2026-05-24: M197 intentionally adds no runtime tool, planner alias, semantic verifier code, CEP UI, live mutating validation, OpenAI CLI planner acceptance, dependency change, push, or PR. Source/precomp relink duplication, layer deletion, mask delete/invert/path editing, audio workflows, and arbitrary ExtendScript loops stay separately gated.
- 2026-05-24: M196 implements only single-marker delete through `delete_layer_marker`. It targets one marker by `markerIndex` or strict `targetTime`, can guard with `targetComment`, returns `markerDeleted` plus after-state `markers`, and fails closed for missing/ambiguous/out-of-range targets.
- 2026-05-24: M196 intentionally does not implement clear-all marker deletion, bulk marker deletion, audio-derived markers, destructive layer/project operations, mask delete/invert/path editing, live CEP/AE mutating validation, OpenAI CLI planner acceptance, dependency changes, push, or PR.
- 2026-05-24: M195 implements only marker update, not marker delete. `update_layer_marker` targets one marker by `markerIndex` or strict `targetTime`, can guard with `targetComment`, updates only `comment`, `time`, and `duration`, and fails closed for missing/ambiguous/out-of-range targets.
- 2026-05-24: M195 keeps live CEP/AE mutating validation, OpenAI CLI planner acceptance, bulk marker changes, audio-derived markers, destructive layer/project operations, mask delete/invert/path editing, dependency changes, push, and PR out of scope.
- 2026-05-24: M194 treats marker delete/update as its own future gated slice, not an extension hidden inside `add_layer_marker`. Future tools should target one existing marker explicitly by `markerIndex` or strict `time` plus optional `comment` guard, return before/after marker summaries, and fail closed on ambiguous marker matches.
- 2026-05-24: M194 intentionally adds no runtime tool, planner alias, semantic verifier code, CEP UI, live mutating validation, OpenAI CLI planner acceptance, dependency change, push, or PR. Bulk marker generation/delete, audio-derived markers, destructive layer/project operations, and mask delete/invert/path editing stay separately gated.
- 2026-05-24: M193 treats the audio-adjacent Dakkshin marker gap as an evidence/read-back slice, not audio analysis. `add_layer_marker` remains a one-marker typed mutation on an explicit layer, while `get_layer_details` now exposes marker summaries and semantic verification checks marker comment/time/duration against read-back.
- 2026-05-24: M193 intentionally does not implement audio import, amplitude scan, beat detection, marker generation from audio, bulk marker generation, marker delete/update, destructive layer/project operations, mask delete/invert/arbitrary path editing, CEP panel UI, dependency changes, live mutating validation, OpenAI CLI planner acceptance, push, or PR.
- 2026-05-24: M192 implements only explicit single-layer duplication through `duplicate_layer`. It requires a `layerIndex`, optionally checks `sourceName`, can set the duplicate `name`, and returns source/duplicate read-back through the normal M100/idempotency/checkpoint/edit-session/post-verification model.
- 2026-05-24: M192 intentionally does not implement layer deletion, selection-only duplication, bulk duplication, source/precomp relinking, mask delete/invert/arbitrary path editing, audio workflows, broad comp updates, CEP panel UI, dependency changes, live mutating validation, push, or PR.
- 2026-05-24: M192 keeps the historical selected-precomp pseudo-command repair routed to `deep_duplicate_precomp_sources`, but explicit canonical `duplicate_layer` plans are no longer rewritten into the deep-precomp workflow.
- 2026-05-23: M191 implements only the first bounded mask write slice: `create_layer_mask` can add one closed additive polygon mask to an existing layer and read it back; it does not delete masks, invert masks, edit arbitrary existing mask paths, or target user assets.
- 2026-05-23: M191 acceptance follows the same strict Full UI Agent policy as M190: installed CEP panel/CDP, Agent UI/chat, `openai-cli` with `gpt-5.5`, panel-generated plan only, M100 dry run/protected run, bridge read-back, semantic verification, and generated-prefix cleanup. Deterministic backend fallback, Ollama, and OpenRouter are not acceptance evidence.
- 2026-05-23: The M191 conveyor command is a live-validation lane, not SDK workspace-write execution. It keeps `executionApprovalState:"pending-explicit-approval"`, `maxAiTurns:0`, and creates no SDKThread/Codex workspace-write child run.
- 2026-05-23: M191 live validation surfaced two useful fail-closed issues before passing: the first attempt proved the installed daemon was stale and did not expose `create_layer_mask`; the second attempt reached protected execution but AE returned `TypeError: null is not an object` for direct mask property access. The final implementation uses a restarted current daemon plus matchName/display-name property fallback for mask atom/path/opacity/feather/expansion access.
- 2026-05-23: M190 fixes OpenAI CLI readiness by backing up `C:\Users\Ant\.codex\config.toml` to `C:\Users\Ant\.codex\config.toml.bak-m190-20260523-202915` and replacing the obsolete `[features.network_proxy]` map with `network_proxy = true` under `[features]`; direct `codex.exe login status` reports `Logged in using ChatGPT`.
- 2026-05-23: M190 acceptance must happen inside the installed panel through CDP, Agent UI/chat, and a panel-generated plan using `openai-cli` with `gpt-5.5`. Deterministic backend fallback is explicitly disallowed as acceptance.
- 2026-05-23: M190 freezes `ollama-local` and `openrouter` only for policy/roadmap/conveyor acceptance. They remain visible providers in the panel and in non-acceptance smoke coverage, but M190 live acceptance must not fall back to them.
- 2026-05-23: The live bridge daemon was restarted during M190 because the already-running process did not expose the newly added `create_camera_layer` tool. After restart, `/tools` exposed 79 tools including `create_camera_layer`.
- 2026-05-23: M190 records that AE project item indexes can shift after project item creation and move operations. The new live scenario uses stable generated names for folder/comp/camera read-back after mutation instead of treating pre-mutation item indexes as stable.
- 2026-05-23: The panel semantic verifier can still mark the camera point-of-interest check as needs-review for this generated matrix, even when the created folder, moved comp, camera layer, and zoom read back correctly. M190 acceptance therefore requires explicit bridge read-back verification and cleanup; a needs-review panel outcome alone is not enough.
- 2026-05-23: M189 implements the camera-layer typed tool as the next smallest visible AE capability from the M186 gap map. It intentionally does not bundle lights, camera rigs, masks, destructive layer operations, audio workflows, broad comp updates, CEP panel UI, or live mutating validation.
- 2026-05-23: `create_camera_layer` is a normal mutating bridge tool, not a raw ExtendScript workaround. It is planning-visible, M100-gated, idempotency/checkpoint aware, and verified by read-back through the bridge.
- 2026-05-23: M188 treats the user's live-validation approval as separate from SDK workspace-write approval. `m188-dakkshin-advisory-field-validation` uses `--validate-live`, creates no SDKThread/Codex child run, and keeps `executionApprovalState:"pending-explicit-approval"` with `maxAiTurns:0` for SDK execution.
- 2026-05-23: M188 mutating validation is generated-only and fail-closed: AE, bridge, CEP panel, and saved project must already be available; the runner does not auto-launch AE or treat unavailable live context as a green skip.
- 2026-05-23: M188 excludes external-provider/OpenAI CLI planner validation, package/dependency changes, PR creation, and mask/destructive/audio/broad comp changes. The new `mutating-live-local` reliability scope includes only local mutating checks.
- 2026-05-23: The M188 live acceptance command was run with the exact approval text and failed at read-only CEP inspection because CDP on `127.0.0.1:8870` refused the connection. This is recorded as a failed live acceptance attempt, not a passed or skipped validation; mutating live validation did not start.
- 2026-05-23: M184 prepares only the feature conveyor infrastructure for future Dakkshin intake. It does not implement Dakkshin product behavior, enable CEP-panel SDK writes, run live CEP/AE, run external-provider/OpenAI CLI planner validation, install packages, change dependencies, push, or create a PR.
- 2026-05-23: M184 feature conveyor execution remains fail-closed. Current Dakkshin queue items have `executionApprovalState:"pending-explicit-approval"` and `maxAiTurns:0`; the runner may preview them but rejects execution until a future milestone records per-item approval.
- 2026-05-23: M185 treats the user's approval as approval for the local-only Dakkshin intake scope brief, not for product implementation, CEP-panel SDK writes, live CEP/AE, external providers, dependency changes, push, or PR.
- 2026-05-23: M185 records that a child SDK/CLI workspace-write run was not used because the M184 runner's queue state remains fail-closed; the parent Codex turn completed only the planned intake brief and documentation.
- 2026-05-23: M186 approval gate treats the user's latest approval as permission for exactly one SDK workspace-write run of `m186-dakkshin-intake-tool-gap-map`; it does not approve Dakkshin product implementation, CEP-panel SDK writes, bridge runtime changes, live CEP/AE, external providers, dependency changes, push, or PR.
- 2026-05-23: The feature conveyor clean-git preflight remains enforced. Existing unrelated untracked files must be handled separately before running the approved SDK command.
- 2026-05-23: M186 treats Dakkshin help/prompt and file-bridge notes as advisory/RAG or reliability evidence unless a later slice proves a concrete product need. They must not become raw ExtendScript workflows by default.
- 2026-05-23: M186 identifies camera-layer creation as the smallest plausible typed-tool product gap if visible AE capability expansion is desired; mask mutation, destructive layer operations, audio-marker generation, and broad comp updates require separate schema and verification design before implementation.
- 2026-05-23: The M186 child SDK run could not update `.codex/handoff.md` or create a commit because the child process hit local permission errors, including `.git/index.lock` creation failure. The parent Codex process completed the handoff update and commit finalization instead.
- 2026-05-23: M187 chooses the advisory help/prompt slice over camera-layer tool work because it expands visible planner guidance with no bridge mutation contract change. Mutating recipes remain advisory metadata and must still produce normal MCP plans through validation, confirmation, idempotency, checkpoint/edit-session protection, and read-back.
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
| M186 selected feature conveyor validation | Required because M186 adds the Dakkshin tool gap map and updates active plan docs. | Passed on 2026-05-23: `npm.cmd run codex:orchestrator:ae-agent-feature-conveyor-readiness:smoke`, `npm.cmd run check:rules`, and `git diff --check`. `git diff --check` printed only the existing LF-to-CRLF working-copy warning for `plans/target-app-execplan.md`. |
| M187 AGENTS non-live suite | Required because M187 adds Solution Library recipes, updates registry retrieval smoke coverage, and updates the active plan. | Passed on 2026-05-23 in `.codex-runtime/validation/m187-non-live-20260523-191353.log`: touched JS `node --check`, `npm.cmd run check:rules`, `git diff --check`, provider contract/API, solution registry/candidate/promotion/retrieval/library, project intent memory, plan classification/repair, semantic verification, reliability validation, ChatGPT connector, prompt optimization, bridge-only smoke, and main smoke. Final `git diff --check` printed only LF-to-CRLF working-copy warnings for touched text files. |
| M188 static/local suite | Required because M188 adds a new live-validation command surface, M187 field smoke, reliability scope, and feature conveyor queue item. | Passed on 2026-05-23: touched JS `node --check`; `node scripts/m187-advisory-field-smoke.js both --mock-bridge --dry-run --json`; `node scripts/reliability-validation-suite.js mutating-live-local --dry-run --allow-mutating-live`; M188 conveyor live dry-run with exact approval text; feature conveyor readiness/command smokes; current/history smoke; reliability suite smoke; `npm.cmd run check:rules`; `git diff --check`; provider contract/API; solution registry/candidate/promotion/retrieval/library; project intent memory; plan classification/repair; semantic verification; ChatGPT connector; prompt optimization; bridge-only smoke; and main smoke. `git diff --check` printed only LF-to-CRLF working-copy warnings for touched text files. |
| M188 live acceptance | Required only when AE, bridge, CEP panel, and a saved project are already available and the exact live approval command is intentionally run from a clean tree. | Failed on 2026-05-23 at the first read-only preflight check. Command: `npm.cmd run codex:orchestrator:ae-agent-feature-conveyor -- --item m188-dakkshin-advisory-field-validation --validate-live --stage both --allow-mutating-live --approval-text "I approve one M188 staged live AE validation run for M187 advisory recipes using generated-only mutations"`. `live-cep-inspect` returned `connect ECONNREFUSED 127.0.0.1:8870`, so no mutating stage ran. Live report: `.codex-runtime/sdk/feature-conveyor-live-reports/2026-05-23T15-02-33-044Z-m188-dakkshin-advisory-field-validation-both.json`; child log: `.codex-runtime/sdk/feature-conveyor-live-logs/2026-05-23T15-02-33-039Z-m188-dakkshin-advisory-field-validation-both.read-only-live-reliability.log`; reliability report: `logs/reliability-validation/2026-05-23T15-02-33.029Z-read-only-live.json`. |
| M189 AGENTS non-live suite | Required because M189 adds a new mutating bridge tool, planning/repair/semantic verification coverage, and local smoke assertions. | Passed on 2026-05-23: touched JS `node --check`; `node scripts/agent-planner-corpus-smoke.js`; `node scripts/solution-promotion-smoke.js`; `node scripts/m187-advisory-field-smoke.js both --mock-bridge --dry-run --json`; `npm.cmd run check:rules`; `git diff --check`; provider contract/API; solution registry/candidate/promotion/retrieval/library; project intent memory; plan classification/repair; semantic verification; reliability validation suite smoke; ChatGPT connector; prompt optimization; bridge-only smoke; and main smoke. `git diff --check` printed only LF-to-CRLF working-copy warnings for touched files. Live CEP/CDP availability check still failed with `connect ECONNREFUSED 127.0.0.1:8870`, so live AE validation was not run. |
| M190 OpenAI CLI readiness | Required before Full UI Agent live validation because the acceptance provider is `openai-cli`. | Passed on 2026-05-23. `C:\Users\Ant\.codex\config.toml` was backed up to `C:\Users\Ant\.codex\config.toml.bak-m190-20260523-202915`; obsolete `[features.network_proxy]` map was replaced by `network_proxy = true` under `[features]`; `"C:\Users\Ant\AppData\Local\OpenAI\Codex\bin\codex.exe" login status` returned `Logged in using ChatGPT`. |
| M190 AGENTS and conveyor static suite | Required because M190 adds a new queue item, feature conveyor live command, Full UI Agent CDP smoke path, report read-back evidence, and current SDK state assertions. | Passed on 2026-05-23 in `.codex-runtime/validation/m190-final-20260523-205018.log`: touched JS `node --check`; `npm.cmd run check:rules`; `git diff --check`; provider contract/API; solution registry/candidate/promotion/retrieval/library; project intent memory; plan classification/repair; semantic verification; reliability validation suite smoke; ChatGPT connector; provider API smoke; prompt optimization; bridge-only smoke; main smoke; feature conveyor readiness/command/current-history smokes; agent scenario report smoke; and `node scripts/cep-panel-cdp-smoke.js connector-status-smoke`. |
| M190 Full UI Agent live conveyor acceptance | Required by the M190 milestone and must run through the installed panel/CDP, Agent UI/chat, `openai-cli`, `gpt-5.5`, and a panel-generated typed plan only. | Passed on 2026-05-23 from a clean tree. Command: `npm.cmd run codex:orchestrator:ae-agent-feature-conveyor -- --item m190-full-ui-agent-new-tools-validation --validate-live --stage both --allow-mutating-live --approval-text "I approve one M190 Full UI Agent live conveyor validation run for new typed tools using OpenAI CLI and generated-only mutations" --json`. Live report: `.codex-runtime/sdk/feature-conveyor-live-reports/2026-05-23T15-49-39-496Z-m190-full-ui-agent-new-tools-validation-both.json`. Agent report: `logs/agent-run-reports/2026-05-23T15-49-36.446Z-openai-cli-gpt-5.5-new-tools-Codex-QA-M190-51322668.json`. The run used panel plan mode, dry run, protected run, and read-back verification for `create_project_folder`, `create_comp`, `move_project_items_to_folder`, `list_project_folder_items`, `create_camera_layer`, and `get_layer_details`; cleanup removed 2 generated project items and left render queue total at 0. Deterministic backend fallback, Local/Ollama fallback, and OpenRouter fallback were not used. |
| M191 AGENTS and conveyor static suite | Required because M191 adds `create_layer_mask`, mask read-back semantics, a Full UI Agent CDP smoke path, queue/current-state assertions, and command-runner wiring. | Passed on 2026-05-23: touched JS `node --check`; `npm.cmd run check:rules`; `git diff --check`; feature conveyor readiness/command/current-history smokes; M191 conveyor dry-run; provider contract/API; solution registry/candidate/promotion/retrieval/library; project intent memory; plan classification/repair; semantic verification; reliability validation suite smoke; ChatGPT connector; prompt optimization; bridge-only smoke; and main smoke. `git diff --check` printed only LF-to-CRLF working-copy warnings for touched files. |
| M191 Full UI Agent live conveyor acceptance | Required by the M191 milestone and must run through the installed panel/CDP, Agent UI/chat, `openai-cli`, `gpt-5.5`, and a panel-generated typed mask plan only. | Passed on 2026-05-23 from a clean tree after restarting the current bridge daemon. Command: `npm.cmd run codex:orchestrator:ae-agent-feature-conveyor -- --item m191-mask-safety-live-validation --validate-live --stage both --allow-mutating-live --approval-text "I approve one M191 live CEP AE validation run for generated-only mask safety checks inside After Effects" --json`. Live report: `.codex-runtime/sdk/feature-conveyor-live-reports/2026-05-23T16-27-42-305Z-m191-mask-safety-live-validation-both.json`. Agent report: `logs/agent-run-reports/2026-05-23T16-27-39.268Z-openai-cli-gpt-5.5-mask-safety-Codex-QA-M191-53624899.json`. The run used panel plan mode, dry run, protected run, semantic verification, and read-back verification for `create_comp`, `create_solid_layer`, `create_layer_mask`, and `get_layer_details`; cleanup removed 2 generated project items and left render queue total at 0. Deterministic backend fallback, Local/Ollama fallback, and OpenRouter fallback were not used. |
| M192 AGENTS non-live suite | Required because M192 adds `duplicate_layer`, planner guidance, plan-repair aliases, semantic verification, and local smoke/helper coverage. | Passed on 2026-05-24: touched JS `node --check`; `node scripts/plan-repair-smoke.js`; `node scripts/semantic-verification-smoke.js`; `node scripts/solution-promotion-smoke.js`; `node scripts/chatgpt-connector-smoke.js`; `node scripts/smoke-test.js`; provider contract/API; solution registry/candidate/promotion/retrieval/library; project intent memory; plan classification; reliability validation suite smoke; prompt optimization; bridge-only smoke; feature conveyor readiness/command/current-history smokes; agent planner corpus smoke; M187 advisory field mock dry-run; `npm.cmd run check:rules`; and `git diff --check`. `git diff --check` printed only LF-to-CRLF working-copy warnings for touched files. |
| M193 AGENTS non-live suite | Required because M193 changes `add_layer_marker` read-back semantics, marker summaries, planner guidance, plan-repair aliases, semantic verification, and local smoke/helper coverage. | Passed on 2026-05-24: touched JS `node --check`; `node scripts/plan-repair-smoke.js`; `node scripts/semantic-verification-smoke.js`; `node scripts/solution-promotion-smoke.js`; `node scripts/chatgpt-connector-smoke.js`; `node scripts/smoke-test.js`; `node scripts/m187-advisory-field-smoke.js both --mock-bridge --dry-run --json`; provider contract/API; solution registry/candidate/promotion/retrieval/library; project intent memory; plan classification; reliability validation suite smoke; prompt optimization; bridge-only smoke; feature conveyor readiness/command/current-history smokes; agent planner corpus smoke; `npm.cmd run check:rules`; and `git diff --check`. `git diff --check` printed only LF-to-CRLF working-copy warnings for touched files. |
| M194 documentation suite | Required because M194 adds a marker delete/update gated-slice design and updates the active plan/handoff only. | Passed on 2026-05-24: `npm.cmd run check:rules`; `git diff --check`. No JavaScript was touched, and live CEP/AE mutating validation, OpenAI CLI planner acceptance, audio workflows, destructive layer/project operations, mask/path editing, dependency changes, push, and PR were not run. |
| M195 AGENTS non-live suite | Required because M195 adds `update_layer_marker`, planner guidance, plan-repair aliases, semantic verification, and local smoke/helper coverage. | Passed on 2026-05-24: touched JS `node --check`; `node scripts/plan-repair-smoke.js`; `node scripts/semantic-verification-smoke.js`; `node scripts/solution-promotion-smoke.js`; `node scripts/chatgpt-connector-smoke.js`; `node scripts/smoke-test.js`; `node scripts/m187-advisory-field-smoke.js both --mock-bridge --dry-run --json`; provider contract/API; solution registry/candidate/promotion/retrieval/library; project intent memory; plan classification; reliability validation suite smoke; provider API smoke; prompt optimization; bridge-only smoke; feature conveyor readiness/command/current-history smokes; agent planner corpus smoke; `npm.cmd run check:rules`; and `git diff --check`. `git diff --check` printed only LF-to-CRLF working-copy warnings for touched files. |
| M196 AGENTS non-live suite | Required because M196 adds `delete_layer_marker`, planner guidance, plan-repair aliases, semantic absence verification, and local smoke/helper coverage. | Passed on 2026-05-24: touched JS `node --check`; `node scripts/plan-repair-smoke.js`; `node scripts/semantic-verification-smoke.js`; `node scripts/solution-promotion-smoke.js`; `node scripts/chatgpt-connector-smoke.js`; `node scripts/smoke-test.js`; `node scripts/m187-advisory-field-smoke.js both --mock-bridge --dry-run --json`; provider contract/API; solution registry/candidate/promotion/retrieval/library; project intent memory; plan classification; reliability validation suite smoke; provider API smoke; prompt optimization; bridge-only smoke; feature conveyor readiness/command/current-history smokes; agent planner corpus smoke; `npm.cmd run check:rules`; and `git diff --check`. `git diff --check` printed only LF-to-CRLF working-copy warnings for touched files. |
| M197 documentation suite | Required because M197 adds a bulk/selected-layer duplicate gated-slice design and updates the active plan/handoff only. | Passed on 2026-05-24: `npm.cmd run check:rules`; `git diff --check`. No JavaScript was touched, and live CEP/AE mutating validation, OpenAI CLI planner acceptance, source/precomp relink duplication, layer deletion, mask/path editing, audio workflows, dependency changes, push, and PR were not run. |
| M198 static/live-lane suite | Required because M198 changes standing validation policy and adds a marker lifecycle Full UI Agent OpenAI CLI live lane. | Passed on 2026-05-24: touched JS `node --check`; `npm.cmd run codex:orchestrator:ae-agent-feature-conveyor-readiness:smoke`; `npm.cmd run codex:orchestrator:ae-agent-feature-conveyor:smoke`; M198 conveyor live dry-run with exact approval text; `npm.cmd run check:rules`; and `git diff --check`. |
| M198 Full UI Agent live marker lifecycle acceptance | Required by the new standing live-validation rule and the M198 marker lifecycle lane; must run through installed panel/CDP, Agent UI/chat, `openai-cli`, `gpt-5.5`, and a panel-generated typed marker plan only. | Passed on 2026-05-24 after syncing installed CEP files and restarting the stale bridge daemon so `/tools` exposed `add_layer_marker`, `update_layer_marker`, and `delete_layer_marker`. Command: `npm.cmd run codex:orchestrator:ae-agent-feature-conveyor -- --item m198-marker-lifecycle-live-validation --validate-live --stage both --allow-mutating-live --approval-text "I approve one M198 live CEP AE validation run for generated-only marker lifecycle checks using OpenAI CLI" --json`. Live report: `.codex-runtime/sdk/feature-conveyor-live-reports/2026-05-24T06-18-22-643Z-m198-marker-lifecycle-live-validation-both.json`. Agent report: `logs/agent-run-reports/2026-05-24T06-18-19.605Z-openai-cli-gpt-5.5-marker-lifecycle-Codex-QA-M198-03454036.json`. The run used panel plan mode, dry run, protected run, explicit marker read-back verification, and cleanup; cleanup removed 2 generated project items and left render queue total at 0. Semantic verification reported the expected update/read-back ordering limitation, but the lane passed because final bridge read-back showed marker count 0 and deleted marker absence. Deterministic backend fallback, Local/Ollama fallback, OpenRouter fallback, raw ExtendScript fallback, and user-asset mutation were not used. |
| M199-M201 roadmap supervisor static suite | Required because M199-M201 add a new supervisor runner, audit/governance artifacts, package scripts, check:rules wiring, and temp-git command smokes. | Passed on 2026-05-24: touched JS `node --check`; `node scripts/sdk-ae-agent-roadmap-supervisor-readiness-smoke.js`; `node scripts/sdk-ae-agent-roadmap-supervisor-command-smoke.js`; current-history and current-governance smokes; `npm.cmd run check:rules`; `git diff --check`; provider contract/API; solution registry/candidate/promotion/retrieval/library; project intent memory; plan classification/repair; semantic verification; reliability validation suite smoke; ChatGPT connector; prompt optimization; bridge-only smoke; and main smoke. The command smoke uses temporary git repositories to prove plan-only creates no child run, wrong approval fails, dirty tree fails, execute-one commits one item, unplanned paths fail, validation failure stops the loop, run-until-budget respects budget/resume, and reviewers remain read-only. |
| M199-M201 live/provider validation | Out of scope because the roadmap supervisor is repository orchestration control-plane work; it adds no AE runtime tool, no CEP panel UI, no planner-visible AE tool, no dependency change, and no live CEP/AE lane. | Not run. |
| M199-M201 live connectivity checks | Required by the standing live availability rule because After Effects, the installed panel, and bridge were available. | Passed on 2026-05-24: `node scripts/cep-panel-cdp-smoke.js inspect` saw installed `AE Agent 2.0.0` connected to the bridge, and `node scripts/cep-panel-cdp-smoke.js connector-status-smoke` passed. Full mutating OpenAI CLI planner acceptance was not run because the supervisor does not add a planner-visible AE tool or CEP panel behavior. |
| M202 roadmap supervisor live hooks | Required because M202 makes supervisor responsible for read-only AE/CEP live connectivity and item-level generated-only live validation hooks. | Passed on 2026-05-24: touched JS `node --check`; `node scripts/sdk-ae-agent-roadmap-supervisor-readiness-smoke.js`; `node scripts/sdk-ae-agent-roadmap-supervisor-command-smoke.js`; `npm.cmd run check:rules`; `git diff --check`; `npm.cmd run codex:orchestrator:ae-agent-roadmap-supervisor -- --live-check --session-id m202-live-check --json`; `node scripts/cep-panel-cdp-smoke.js inspect`; `node scripts/cep-panel-cdp-smoke.js connector-status-smoke`; provider contract/API; solution registry/candidate/promotion/retrieval/library; project intent memory; plan classification/repair; semantic verification; reliability validation suite smoke; ChatGPT connector; prompt optimization; bridge-only smoke; and main smoke. Bridge status also reported `panelConnected=true`. `git diff --check` printed only LF-to-CRLF working-copy warnings for touched files. No mutating live planner lane was run because M202 adds read-only connectivity gates plus approval-gated hooks, not a new planner-visible AE tool. |
| M203 bulk/selected-layer duplicate supervisor plan-only | Required because M203 creates the first real long-running roadmap supervisor queue for the M197 duplicate-many epic before execution approval. | Passed on 2026-05-24: `npm.cmd run codex:orchestrator:ae-agent-roadmap-supervisor -- --plan-only --queue .codex-audit/sdk-roadmap-supervisor/203-bulk-selected-layer-duplicate-queue.json --max-items 3 --max-minutes 180 --json`; `npm.cmd run codex:orchestrator:ae-agent-roadmap-supervisor-readiness:smoke`; `npm.cmd run codex:orchestrator:ae-agent-roadmap-supervisor:smoke`; `npm.cmd run check:rules`; `git diff --check`; JSON parse for the new queue. No child runs, SDKThread, runtime state, live AE mutation, dependency change, push, or PR were performed. |
| M204 roadmap supervisor single-approval chain | Required because M204 changes the supervisor execution contract: approvals must bind queue hash/item ids/live bindings and `roadmap-sdk` must execute without lower feature-conveyor activation. | Passed on 2026-05-24: touched JS `node --check`; JSON parse for roadmap supervisor packets/current state/M203 queue; `npm.cmd run codex:orchestrator:ae-agent-roadmap-supervisor -- --plan-only --json`; `npm.cmd run codex:orchestrator:ae-agent-roadmap-supervisor -- --plan-only --queue .codex-audit/sdk-roadmap-supervisor/203-bulk-selected-layer-duplicate-queue.json --max-items 3 --max-minutes 180 --json`; `node scripts/sdk-ae-agent-roadmap-supervisor-readiness-smoke.js`; `node scripts/sdk-ae-agent-roadmap-supervisor-command-smoke.js`; `npm.cmd run check:rules`; `git diff --check`; `npm.cmd run codex:orchestrator:ae-agent-roadmap-supervisor -- --live-check --session-id m204-single-approval-live-check-retry --json`; `node scripts/cep-panel-cdp-smoke.js inspect`; `node scripts/cep-panel-cdp-smoke.js connector-status-smoke`; and the full AGENTS smoke suite: provider contract/API, solution registry/candidate/promotion/retrieval/library, project intent memory, plan classification/repair, semantic verification, reliability validation suite, ChatGPT connector, prompt optimization, bridge-only smoke, and main smoke. Command smoke proves wrong approval fails when queue hash/item ids change, `roadmap-sdk` execute-one creates one child and commit, run-until-budget continues across roadmap-sdk items, reviewers stay read-only, and single-approval live bindings can run generated-only item live validation without a separate `--live-approval-text`. An initial parallel live-check attempt saw the panel in a transient `Starting...` state, then the sequential retry passed; continuation validation used session `m204-single-approval-live-check-continue`. |
| M204 duplicate-layers runtime tool | Required because the queue item adds the bounded `duplicate_layers` mutating runtime tool and smoke coverage without planner/repair/semantic/live exposure. | Passed on 2026-05-24: `node --check mcp-server/bridge-daemon.js`; `node --check scripts/smoke-test.js`; `node scripts/smoke-test.js`; `npm.cmd run check:rules`; `git diff --check`; `node scripts/cep-panel-cdp-smoke.js inspect`; `node scripts/cep-panel-cdp-smoke.js connector-status-smoke`; and the remaining AGENTS smoke suite: provider contract/API, solution registry/candidate/promotion/retrieval/library, project intent memory, plan classification/repair, semantic verification, reliability validation suite, ChatGPT connector, prompt optimization, and bridge-only smoke. Main smoke proved `tools/list` exposure, safety schema fields, queued script guards for undo-group closure, out-of-range and locked source rejection, source/duplicate pair read-back, before/after layer counts, `postVerification`, and pre-queue rejection for empty/duplicate/non-positive `layerIndices`. The first `node scripts/smoke-test.js` retry in the repair turn timed out waiting for JSON-RPC response 2 during smoke daemon startup; the immediate repeat and full validation passed. `git diff --check` printed only LF-to-CRLF working-copy warnings for touched JS files. Live AE/CEP mutation, OpenAI CLI planner acceptance, planner aliases, semantic verification, dependency changes, push, and PR were not run. |
| M205 duplicate-layers planner/repair exposure | Required because the queue item makes `duplicate_layers` planner-visible and adds bounded plan-repair aliases without semantic/live scope. | Passed on 2026-05-24: `node --check mcp-server/bridge-daemon.js`; `node --check mcp-server/plan-repair.js`; `node --check scripts/plan-repair-smoke.js`; `node --check scripts/chatgpt-connector-smoke.js`; `node --check scripts/agent-scenario-fixtures.js`; `node scripts/plan-repair-smoke.js`; `node scripts/chatgpt-connector-smoke.js`; `npm.cmd run check:rules`; and `git diff --check`. `plan-repair-smoke` proves explicit bulk aliases repair to `duplicate_layers`, selected-layer repair binds `{{selectedLayerIndices}}` only after read-only selected-layer evidence, selection-only duplicate remains invalid without evidence, and selected precomp pseudo workflows still repair to `deep_duplicate_precomp_sources`. The first supervisor attempt stopped on the ignored handoff gate after the writer child recorded a plan fallback; parent Codex finalized `.codex/handoff.md`, and supervisor handoff fallback was fixed in commit `78a0c5c`. No CEP panel edit, dependency change, package manifest change, push, PR, or live AE/CEP validation was run. |
| M206 duplicate-layers semantic local smokes | Required because the queue item adds semantic verification and local smoke coverage for `duplicate_layers` without live AE/CEP scope. | Passed on 2026-05-24: `node --check mcp-server/semantic-verification.js`; `node --check scripts/semantic-verification-smoke.js`; `node --check scripts/smoke-test.js`; `node --check scripts/reliability-validation-suite.js`; `node --check scripts/reliability-validation-suite-smoke.js`; `node scripts/semantic-verification-smoke.js`; `node scripts/reliability-validation-suite-smoke.js`; `node scripts/smoke-test.js`; `npm.cmd run check:rules`; and `git diff --check`. Semantic smoke proves `duplicate_layers` requires one duplicate per requested source, expected duplicate names, `2 -> 4` layer counts, and post-run `get_comp_details` read-back; the negative fixture remains `needs_review` without post-run read-back. Main smoke proves deterministic queued-tool response fields for source/duplicate pairs, expected names, and before/after counts. `git diff --check` printed only LF-to-CRLF working-copy warnings for touched JS files. Handoff update was attempted but blocked by filesystem ACL on `.codex/handoff.md`; the current handoff file still contains M205 state and must be updated by a process with permission. Live AE/CEP, CEP panel edits, dependencies, package changes, push, and PR were not run. |
| M207 duplicate-layers generated-only live lane | Required because the queue item adds the approved Full UI Agent live validation lane for `duplicate_layers` and then proves it against the installed AE panel/bridge using generated-only project items. | Passed on 2026-05-24: `node --check orchestrator/run-ae-agent-feature-conveyor.mjs`; `node --check scripts/sdk-ae-agent-feature-conveyor-readiness-smoke.js`; `node --check scripts/sdk-ae-agent-feature-conveyor-command-smoke.js`; `node --check scripts/cep-panel-cdp-smoke.js`; `node --check scripts/agent-scenario-fixtures.js`; `npm.cmd run codex:orchestrator:ae-agent-feature-conveyor-readiness:smoke`; `npm.cmd run codex:orchestrator:ae-agent-feature-conveyor:smoke`; `npm.cmd run check:rules`; `git diff --check`; `node scripts/mcp-call-tool.js get_bridge_status`; `node scripts/mcp-call-tool.js get_render_queue_status`; and `npm.cmd run codex:orchestrator:ae-agent-feature-conveyor -- --item m207-duplicate-layers-live-validation --validate-live --stage both --allow-mutating-live --approval-text "I approve one M207 live CEP AE validation run for generated-only bulk selected layer duplicate checks using OpenAI CLI" --json`. Live report: `.codex-runtime/sdk/feature-conveyor-live-reports/2026-05-24T12-48-44-333Z-m207-duplicate-layers-live-validation-both.json`. Agent run report: `logs/agent-run-reports/2026-05-24T12-48-41.269Z-openai-cli-gpt-5.5-duplicate-layers-Codex-QA-M207-26882964.json`. Feature-conveyor command smoke proves the M207 dry-run command emits `m207-live-cep-inspect` plus `m207-full-ui-agent-openai-cli-duplicate-layers-smoke`, rejects wrong approval text, and does not include Ollama/OpenRouter fallback commands. Live read-back verified the generated comp, two expected source layers, two expected duplicate layers, and final layer count `4`; cleanup removed three generated project items and render queue total stayed `0`. `scripts/cep-panel-cdp-smoke.js` now accepts `needs review` for this lane only when duplicate-layers read-back succeeds, matching the existing M190/M198 read-back-gated live lanes. A stale bridge daemon first exposed only 83 tools and lacked `duplicate_layers`; after bridge restart it exposed 84 tools and the live run passed. `git diff --check` printed only LF-to-CRLF working-copy warnings for touched files. No user asset mutation, dependency change, package manifest change, push, PR, source relinking, masks, paths, audio workflow, deterministic fallback, Local/Ollama fallback, or OpenRouter fallback was performed. |
| M208 duplicate-layers solution-library guidance | Required because the queue item adds planner-retrievable Solution Library guidance for explicit bulk and selected-layer duplicate workflows without runtime, CEP, dependency or live mutation scope. | Passed on 2026-05-24: `node --check mcp-server/solution-library.js`; `node --check scripts/solution-registry-smoke.js`; `node --check scripts/solution-retrieval-smoke.js`; `node --check scripts/solution-library-validation-smoke.js`; `node scripts/solution-registry-smoke.js`; `node scripts/solution-retrieval-smoke.js`; `node scripts/solution-library-validation-smoke.js`; `node --check orchestrator/run-ae-agent-roadmap-supervisor.mjs`; `node --check scripts/sdk-ae-agent-roadmap-supervisor-command-smoke.js`; `node scripts/sdk-ae-agent-roadmap-supervisor-command-smoke.js`; `npm.cmd run check:rules`; and `git diff --check`. Registry validation accepts `bulk-layer-duplicate-typed-tool`, retrieval shows compact `duplicate_layers` tool guidance, selected-layer duplicate guidance requires prior `get_selected_layers`, raw ExtendScript and deep precomp/source duplication are not promoted, and prompt bounds stay compact by limiting formatted recipe entries when tool-backed matches are present. The initial supervisor validation stopped on Windows `spawnSync npm.cmd EINVAL`; the supervisor command runner now dispatches `.cmd/.bat` validation commands through `cmd.exe /d /c call` while preserving quoted arguments, and command smoke covers that path. `git diff --check` printed only LF-to-CRLF working-copy warnings for touched files. No live AE/CEP mutation, CEP panel edit, dependency change, package manifest change, push or PR was performed. |
| M209 duplicate-layers roadmap supervisor proof | Required because the queue item records evidence that the duplicate_layers roadmap queue is covered by plan-only preview and supervisor smokes before closeout. | Passed on 2026-05-24: `npm.cmd run codex:orchestrator:ae-agent-roadmap-supervisor -- --plan-only --queue .codex-audit/sdk-roadmap-supervisor/203-bulk-selected-layer-duplicate-queue.json --max-items 3 --max-minutes 180 --json`; `npm.cmd run codex:orchestrator:ae-agent-roadmap-supervisor-readiness:smoke`; `npm.cmd run codex:orchestrator:ae-agent-roadmap-supervisor:smoke`; `npm.cmd run check:rules`; and `git diff --check`. Plan-only returned `childRunsCreated:false`, `sdkThreadCreated:false`, `runtimeStateWritten:false`, and an approval string bound to repo, queue path, `queueSha256=785455aa780f0c13268a8c4c5fea40f7980ce261d8e52e3d1c6804f9e7a15771`, all duplicate_layers queue item ids, `maxItems=3`, `maxMinutes=180`, `autoCommit=true`, `noPush=true`, `noDependencyChanges=true`, the M207 generated-only live binding, and `noLiveCepAeUnlessPerItemApproved=true`. Supervisor smokes cover single-approval queue behavior, including wrong-approval rejection, live binding policy, unplanned path stops, ignored handoff handling, and Windows `.cmd` validation dispatch. The first M209 writer attempt was stopped by the planned-path gate after creating an unplanned research note; the unplanned artifact was removed and only allowed evidence paths were retained. No runtime bridge code, CEP panel file, dependency, package manifest, mutating live AE validation, push, or PR was changed. |
| M210 duplicate-layers governance closeout | Required because the queue item updates only governance/current-state/README/plan/handoff closeout notes for committed M204-M209 evidence. | Passed on 2026-05-24 through roadmap supervisor with commit `340bdc6cfa143a0548212c33bc102cd2dc0c49e0`: `npm.cmd run check:rules`; `git diff --check`; provider contract; solution registry/candidate/promotion/retrieval/library; project intent memory; plan classification/repair; semantic verification; reliability validation suite; ChatGPT connector; provider API; prompt optimization; bridge-only smoke; and main smoke. The first `check:rules` attempt failed after changing `.codex-audit/sdk-current-state.json` `featureConveyorState` outside the existing smoke contract; the field was restored to the checked value, then `npm.cmd run check:rules` and `git diff --check` passed. `git diff --check` printed only LF-to-CRLF working-copy warnings for touched governance/docs files. Parent-side handoff update succeeded after supervisor closeout; `.codex/handoff.md` records the M210 closeout state. No runtime bridge behavior, planner/repair/semantic behavior, CEP panel file, dependency, package manifest, live AE/CEP execution, push, or PR changed. |
| M211 duplicate-layers closeout reconciliation | Required because tracked governance docs still described M210 as pending handoff ACL repair even after parent-side handoff and supervisor runtime state confirmed closeout completion. | Passed on 2026-05-24: `node -e "JSON.parse(require('fs').readFileSync('.codex-audit/sdk-current-state.json','utf8')); JSON.parse(require('fs').readFileSync('.codex-audit/sdk-roadmap-supervisor/203-bulk-selected-layer-duplicate-queue.json','utf8'))"`; `npm.cmd run check:rules`; and `git diff --check`. M211 updates the active plan, M203 queue, current-state artifact, README, and handoff so M210 is completed, removes the unplanned `docs/research/composio-agent-orchestrator-applicability.md` artifact from the stopped M209 writer attempt, and records a prompt for the next chat. No runtime bridge behavior, planner/repair/semantic behavior, CEP panel file, dependency, package manifest, live AE/CEP execution, push, or PR changed. |
| M212 AO-inspired task/session/activity intake | Required because the AO-inspired pipeline-hardening queue starts at M212 after the existing M211 duplicate_layers numbering collision and needs a local activity/session contract before later stuck/escalation work. | Passed on 2026-05-24: `node --check scripts/sdk-ao-pattern-intake-smoke.js`; `node scripts/sdk-ao-pattern-intake-smoke.js`; `npm.cmd run check:rules`; and `git diff --check` (only the existing LF-to-CRLF warning for the plan). The smoke parses `.codex-audit/sdk-ao-pattern-intake/212-activity-session-schema.json` and asserts required task envelope fields, `writer`/`reviewer`/`analyzer`/`live-check` roles, lifecycle states, activity event examples, roadmap-supervisor artifact mapping, and false boundary claims. Updating `.codex/handoff.md` was attempted with `apply_patch` and PowerShell UTF-8 write, but blocked by the inherited Deny ACL on the ignored handoff file; the intended handoff content and exact M213 prompt are recorded in the M212 Active Roadmap note for supervisor/parent finalization. This is an intake contract only: no AO install/start, runtime behavior change, CEP panel edit, dependency/package change, production-path edit, live AE/CEP validation, external-provider planner validation, branch, worktree, push, PR, GitHub issue, or GitHub Action was performed. |
| M213 AO-inspired stuck escalation design | Required because M212 defined activity/session state but later supervisor hardening needs a bounded stuck/escalation policy before any dashboard or runtime-facing work. | Passed on 2026-05-24: `node --check scripts/sdk-ao-stuck-escalation-smoke.js`; `node scripts/sdk-ao-stuck-escalation-smoke.js`; `npm.cmd run check:rules`; and `git diff --check`. The smoke parses the M212 parent contract and `.codex-audit/sdk-ao-pattern-intake/213-stuck-escalation-design.json`, asserts required stuck inputs, escalation actions, retry caps, false boundary claims, and fixture outcomes for stale activity, validation failure, healthy done, and unplanned path change. Updating `.codex/handoff.md` was attempted with `apply_patch` and PowerShell UTF-8 write, but blocked by the inherited Deny ACL on the ignored handoff file; the intended handoff content and exact M214 prompt are recorded in the M213 Active Roadmap note for supervisor/parent finalization. This is design-only: no auto-fixing runtime loop, roadmap supervisor runtime behavior change, AO install/start, CEP/live/production/dependency/package path edit, branch, worktree, push, PR, GitHub issue, or GitHub Action was performed. |
| M214 AO-inspired static status dashboard | Required because M212/M213 define roadmap supervisor session/activity and stuck/escalation semantics, but reviewers need a bounded static view of active, stuck, and completed sessions before the M215 failure analyzer packet. | Passed on 2026-05-24: `node --check scripts/render-roadmap-supervisor-status-dashboard.js`; `node --check scripts/sdk-ao-status-dashboard-smoke.js`; `node scripts/sdk-ao-status-dashboard-smoke.js`; `npm.cmd run check:rules`; and `git diff --check`. The smoke parses the M212/M213 parents and `.codex-audit/sdk-ao-pattern-intake/214-status-dashboard-contract.json`, builds temp active/stuck/done session fixtures, runs the renderer against the fixture root, verifies required summary fields and next-action text, and verifies explicit `--output` writes only Markdown. This is a static local CLI only: no web server, browser UI, dependency, package manifest/lock change, AO install/start, CEP/live/production path access, branch, worktree, push, PR, GitHub issue, or GitHub Action was performed. |
| AUX-004 AO-inspired read-only failure analyzer | Required because AUX-001-AUX-003 define task/session/activity, stuck escalation, and static dashboard artifacts, but failed roadmap supervisor sessions need a bounded repair packet that does not auto-fix or retry. | Passed on 2026-05-24: `node --check scripts/create-roadmap-failure-analyzer-packet.js`; `node --check scripts/sdk-ao-failure-analyzer-smoke.js`; `node scripts/sdk-ao-failure-analyzer-smoke.js`; `npm.cmd run check:rules`; `git diff --check`; provider contract; solution registry/candidate/promotion/retrieval/library; project intent memory; plan classification/repair; semantic verification; reliability validation suite; ChatGPT connector; provider API; prompt optimization; bridge-only smoke; and main smoke. The smoke parses AUX-001-AUX-004 compatibility/contract artifacts plus the preserved legacy queue path, builds temp validation_failure and stuck_session fixtures, runs the analyzer, asserts repair prompts and next bounded task fields, and verifies forbidden auto-actions for auto-fix, retry, live AE/CEP, dependency, and PR work. No source auto-fix, command retry, live AE/CEP, dependency/package change, CEP/live/production path edit, branch, worktree, push, PR, GitHub issue, GitHub Action, AO install/start, broad unbounded log read, or runtime behavior change was performed. |
| M211-M215 branch audit and live validation | Required after two parallel threads may have competed around the AO-inspired closeout and live CEP/AE state; also required to resolve the temporary AUX alignment placeholders without touching AUX artifact files. | Passed with caveats on 2026-05-24: JSON parsing for current state, M203/M211 queues, and M212-M215/AUX contracts; `node --check` for the M212-M215 scripts; M212, M213, M214, and AUX-004 smoke scripts; `npm.cmd run check:rules`; `git diff --check`; the full configured non-live smoke suite; `cep-panel-cdp-smoke.js inspect`, `connector-status-smoke`, `branding-smoke`, `mode-toggle-smoke`, `diagnostics-smoke`, `reload-button-smoke`, `sidebar-collapse-smoke`, and `workflow-preset-smoke`; bridge `get_bridge_status`, `ping_ae`, `get_project_info`, `get_active_comp`, and `get_render_queue_status`; OpenAI CLI smoke; and generated-only OpenAI CLI lanes for new tools, mask safety, marker lifecycle, and duplicate layers. Caveats: default Ollama/local Agent broad and mutating smokes produced empty `needs review` plans and timed out before mutation; `agent-scenario-openai-cli-smoke` is blocked by M100 raw ExtendScript proposal enforcement; the new-tools, marker lifecycle, and duplicate-layers generated-only lanes returned overall `ok` but exposed semantic-verifier evidence/read-back matching gaps. Cleanup removed generated test items and render queue remained empty. |
| Local/Ollama explicit-use operation rule | Required because current validation should not use Local/Ollama unless the user explicitly asks for it, and broad/default-provider CEP smokes can otherwise select Local/Ollama implicitly. | Passed on 2026-05-24: updated `AGENTS.md` and this plan to make Local/Ollama explicit-use only for planner runs, live CEP smokes, broad/default-provider smokes, fallback planning, recovery validation, and mutating validation. Validation: `npm.cmd run check:rules` and `git diff --check` passed with only LF-to-CRLF working-copy warnings. No Local/Ollama smoke, live AE/CEP mutation, provider call, dependency change, package change, push, or PR was performed. |
| M204 SupervisorChild CLI fallback repair | Required because the failed supervisor run showed `--engine cli` did not cover the `roadmap-sdk` writer child; only reviewers/legacy children switched away from the SDK parser. | Passed on 2026-05-24: `node --check orchestrator/run-ae-agent-roadmap-supervisor.mjs`; `node --check scripts/sdk-ae-agent-roadmap-supervisor-command-smoke.js`; `node --check scripts/sdk-ae-agent-roadmap-supervisor-readiness-smoke.js`; `node --check orchestrator/run-buffered-acceptance.mjs`; JSON parse for roadmap supervisor/current-state packets; `node scripts/sdk-ae-agent-roadmap-supervisor-command-smoke.js`; `node scripts/sdk-ae-agent-roadmap-supervisor-readiness-smoke.js`; `npm.cmd run check:rules`; `git diff --check`; `node scripts/cep-panel-cdp-smoke.js inspect`; `node scripts/cep-panel-cdp-smoke.js connector-status-smoke`; `npm.cmd run codex:orchestrator:ae-agent-roadmap-supervisor -- --live-check --session-id m204-supervisorchild-cli-repair-live-check --json`; and the full AGENTS non-live smoke suite. Command smoke now forces the fake SDK path to fail with `Failed to parse item: SUCCESS: The process ... has been terminated.` while proving `--engine cli` uses the roadmap CLI writer, writes only planned paths, and auto-commits after validation. |
| M204 roadmap supervisor ignored handoff repair | Required because real queue items require `.codex/handoff.md`, but `.codex/` is ignored and therefore cannot be validated through `git status` or staged through normal `git add`. | Passed on 2026-05-24: `node --check orchestrator/run-ae-agent-roadmap-supervisor.mjs`; `node --check scripts/sdk-ae-agent-roadmap-supervisor-command-smoke.js`; `node scripts/sdk-ae-agent-roadmap-supervisor-command-smoke.js`; `node scripts/sdk-ae-agent-roadmap-supervisor-readiness-smoke.js`; `npm.cmd run check:rules`; and `git diff --check`. Command smoke now ignores `.codex/` in temp repos and proves required handoff updates can pass while ignored handoff files are excluded from item commits. |
| SDKThread/network/external-provider/OpenAI CLI planner outside approved generated-only live lanes | Forbidden/out of scope for this turn. | Not run outside approved generated-only live validation lanes. |
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

### Milestone 186 approval gate

- Added `.codex-audit/sdk-feature-conveyor/186-dakkshin-tool-gap-map-approval.json`.
- Updated `.codex-audit/sdk-feature-conveyor/184-dakkshin-intake-feature-queue.json`.
- Updated `.codex-audit/sdk-current-state.json`, `orchestrator/README.md`, `orchestrator/run-buffered-acceptance.mjs`, `scripts/sdk-ae-agent-feature-conveyor-readiness-smoke.js`, `scripts/sdk-ae-agent-feature-conveyor-command-smoke.js`, `scripts/sdk-current-history-index-smoke.js`, and this plan.
- Passed touched-JavaScript `node --check`, feature conveyor readiness/command smokes, current-history smoke, `npm.cmd run check:rules`, and `git diff --check`.
- Full approval-gate validation log: `.codex-runtime/validation/m186-approval-gate-20260523-184319.log`.
- SDK execution, live CEP/AE, external-provider/OpenAI CLI planner validation, mutating-live validation, package install/dependency validation, push, and PR were not run as part of this approval gate.

### Milestone 186

- Added `.codex-audit/sdk-feature-conveyor/dakkshin-intake/m186-tool-gap-map.md`.
- Updated `plans/target-app-execplan.md`.
- Child SDK run was blocked from updating `.codex/handoff.md` and creating its own commit by local permission errors; the parent Codex process handled handoff update and commit finalization.
- Passed feature conveyor readiness smoke, `npm.cmd run check:rules`, and `git diff --check` in the child SDK run; parent final `npm.cmd run check:rules` and `git diff --check` also passed. `git diff --check` printed only the existing LF-to-CRLF working-copy warning for `plans/target-app-execplan.md`.
- No product code, CEP panel, bridge runtime, dependencies, package-lock, live CEP/AE validation, external-provider/OpenAI CLI planner validation, mutating-live validation, push, or PR changed.

### Milestone 187

- Added `recipes/basic-comp-setup-typed-plan.md`.
- Added `recipes/safe-effect-addition-typed-plan.md`.
- Added `recipes/selected-layers-animation-typed-plan.md`.
- Updated `registry/solutions.json` with three `dakkshin-advisory` typed-plan recipes and bumped `updatedAt` to `2026-05-23`.
- Updated `scripts/solution-library-validation-smoke.js` to assert the new advisory recipes are raw-free, use dedicated recipe files, keep protected mutation gates, and retrieve for basic comp/effect/animation prompts.
- Updated `plans/target-app-execplan.md` and `.codex/handoff.md`.
- Passed M187 AGENTS non-live suite in `.codex-runtime/validation/m187-non-live-20260523-191353.log`.
- Live CEP/AE, external-provider/OpenAI CLI planner validation, mutating-live validation, mask/destructive/audio/broad comp changes, package/dependency changes, and PR creation were not run; push is allowed by the user and handled separately after commit.

### Milestone 188

- Added the `m188-dakkshin-advisory-field-validation` queue item with separate local live-validation approval metadata, exact mutating-live approval text, fail-closed unavailable policy, and explicit bans on SDKThread/Codex child execution, external-provider/OpenAI CLI planner validation, dependency changes, PR creation, masks, destructive edits, audio, and broad comp mutation.
- Updated `orchestrator/run-ae-agent-feature-conveyor.mjs` with `--validate-live`, `--stage read-only|mutating|both`, `--allow-mutating-live`, exact approval enforcement, dirty-git blocking for actual live runs, staged local command orchestration, child logs, reports, and dry-run JSON.
- Added `scripts/m187-advisory-field-smoke.js` for M187 read-only live checks and generated-only mutating field smoke with stable prefixes, safe effect allowlist, dry-run before run, read-back verification, cleanup, and render queue drift detection.
- Updated `scripts/reliability-validation-suite.js` and its smoke so `mutating-live-local` includes only protected local mutating scenarios and excludes external-provider/OpenAI CLI planner checks.
- Updated feature conveyor readiness/command smokes, current SDK state, current/history smoke, and `orchestrator/README.md` for the M188 command surface.
- Passed the M188 static/local validation suite recorded in the validation matrix. Actual live acceptance was attempted on 2026-05-23 and failed at read-only CEP inspection because CDP on `127.0.0.1:8870` refused the connection; mutating validation did not run.

### Milestone 189

- Added `create_camera_layer` to `mcp-server/bridge-daemon.js` with comp targeting, optional layer name, point-of-interest, position, zoom, start time, duration, coordinate/zoom validation, undo grouping, and response read-back.
- Registered `create_camera_layer` in mutating/planning tool lists so direct execution remains M100-blocked while Agent plans can validate and dry-run it through normal protected run gates.
- Extended `get_layer_details` and mutation verification read-back with camera point-of-interest, orientation, and camera option fields.
- Added repair aliases for common camera tool names in `mcp-server/plan-repair.js`.
- Added semantic verification for camera layer name, position, point-of-interest, and zoom.
- Updated local smoke/helper coverage in `scripts/smoke-test.js`, `scripts/semantic-verification-smoke.js`, `scripts/plan-repair-smoke.js`, `scripts/chatgpt-connector-smoke.js`, `scripts/agent-scenario-fixtures.js`, `scripts/m187-advisory-field-smoke.js`, and `scripts/solution-promotion-helper.js`.
- Passed the M189 AGENTS non-live suite recorded in the validation matrix. Live AE/CDP validation was blocked because CEP CDP on `127.0.0.1:8870` was unavailable.

### Milestone 190

- Fixed OpenAI CLI readiness by backing up `C:\Users\Ant\.codex\config.toml`, replacing obsolete `[features.network_proxy]` map syntax with `network_proxy = true` under `[features]`, and verifying direct `codex.exe login status`.
- Added the `m190-full-ui-agent-new-tools-validation` queue item with exact live-approval text, OpenAI CLI planner validation enabled, generated-only planned paths, and deterministic/Local-Ollama/OpenRouter fallback disallowed for acceptance.
- Extended `orchestrator/run-ae-agent-feature-conveyor.mjs` so M190 `--validate-live` runs CDP inspect and then the Full UI Agent OpenAI CLI new-tools smoke through the local conveyor command.
- Extended `scripts/cep-panel-cdp-smoke.js` and scenario fixtures with a panel-only `openai-cli`/`gpt-5.5` Agent scenario covering `create_comp`, `create_project_folder`, `list_project_folder_items`, `move_project_items_to_folder`, and `create_camera_layer`.
- Added explicit bridge read-back verification for generated folder contents, generated comp details, camera layer details, and camera zoom; scenario cleanup uses the protected M100 proposal/run path and generated prefixes.
- Updated compact agent run reports, feature conveyor readiness/command smokes, current SDK state, current/history smoke, and `orchestrator/README.md`.
- Passed the M190 static and AGENTS validation suite recorded in the validation matrix.
- Passed the M190 Full UI Agent live conveyor acceptance from a clean tree. The final live report is `.codex-runtime/sdk/feature-conveyor-live-reports/2026-05-23T15-49-39-496Z-m190-full-ui-agent-new-tools-validation-both.json`; the generated scenario report is `logs/agent-run-reports/2026-05-23T15-49-36.446Z-openai-cli-gpt-5.5-new-tools-Codex-QA-M190-51322668.json`.

### Milestone 191

- Added `create_layer_mask` to `mcp-server/bridge-daemon.js` as a narrow M100-gated mutating typed tool for one bounded additive polygon mask on an existing layer.
- Extended `get_layer_details` mask read-back with normalized mask mode, inverted flag, mask shape vertices/tangents, opacity, feather, and expansion.
- Added mask plan repair aliases, semantic verification for created mask name/vertices/mode, and local smoke coverage in the main bridge smoke, plan repair smoke, semantic verification smoke, ChatGPT connector smoke, and solution promotion helper.
- Added `.codex-audit/sdk-feature-conveyor/dakkshin-intake/m191-mask-safety-design.md`.
- Added the `m191-mask-safety-live-validation` queue item with exact live-approval text, OpenAI CLI planner validation enabled, generated-only planned paths, and deterministic/Local-Ollama/OpenRouter fallback disallowed for acceptance.
- Extended `orchestrator/run-ae-agent-feature-conveyor.mjs` so M191 `--validate-live` runs CDP inspect and then `full-ui-agent-mask-safety-openai-cli-smoke`.
- Extended `scripts/cep-panel-cdp-smoke.js` and scenario fixtures with a panel-only `openai-cli`/`gpt-5.5` Agent scenario covering `create_comp`, `create_solid_layer`, `create_layer_mask`, and `get_layer_details`.
- Added explicit bridge read-back verification for generated mask comp/layer, mask count, mask name, additive mode, and polygon vertices; scenario cleanup uses the protected M100 proposal/run path and fails if generated items remain.
- Updated feature conveyor readiness/command smokes, current SDK state, current/history smoke, and `orchestrator/README.md`.
- Passed the M191 static/local validation listed in the validation matrix.
- Passed the M191 Full UI Agent live conveyor acceptance from a clean tree after restarting the current bridge daemon. The final live report is `.codex-runtime/sdk/feature-conveyor-live-reports/2026-05-23T16-27-42-305Z-m191-mask-safety-live-validation-both.json`; the generated scenario report is `logs/agent-run-reports/2026-05-23T16-27-39.268Z-openai-cli-gpt-5.5-mask-safety-Codex-QA-M191-53624899.json`.

### Milestone 192

- Added `duplicate_layer` to `mcp-server/bridge-daemon.js` as a narrow M100-gated mutating typed tool for explicit single-layer duplication.
- The tool targets active comp, `compItemIndex`, or `compName`, requires `layerIndex`, optionally validates `sourceName`, optionally sets the duplicate `name`, rejects locked source layers, and returns comp/source/duplicate/layer read-back.
- Registered `duplicate_layer` in mutating/planning tool lists and Agent planner guidance so common layer duplication requests can avoid raw ExtendScript.
- Added plan-repair aliases for `duplicateLayer`, `copyLayer`, and `cloneLayer`; preserved the older selected-precomp pseudo-command repair path to `deep_duplicate_precomp_sources` unless the plan already uses canonical `duplicate_layer`.
- Added semantic verification for duplicate layer name/read-back and local smoke coverage in main bridge smoke, plan repair smoke, semantic verification smoke, ChatGPT connector smoke, M187 field smoke metadata, agent scenario mutating classification, and solution promotion helper.
- Added `.codex-audit/sdk-feature-conveyor/dakkshin-intake/m192-layer-duplicate-design.md`.
- Passed the M192 non-live validation listed in the validation matrix.
- Live CEP/AE mutating validation, OpenAI CLI planner acceptance, mask delete/invert/path editing, layer delete, broad comp/audio workflows, dependency changes, push, and PR were not run.

### Milestone 193

- Strengthened existing `add_layer_marker` evidence without adding audio analysis or broad marker generation.
- Added marker read-back helpers in `mcp-server/bridge-daemon.js`; `add_layer_marker` now returns the created marker and compact layer marker summary, and `get_layer_details` exposes marker count/items for read-back.
- Added Agent planner guidance that marker workflows require explicit layer/time/comment evidence and must not claim audio analysis, beat detection, or generated markers from audio without a separate evidence tool.
- Added plan-repair aliases for `createMarker`/`createLayerMarker` plus marker comment/time/duration arg aliases.
- Added semantic verification for marker comment/time/duration read-back and local smoke coverage in main bridge smoke, plan repair smoke, semantic verification smoke, ChatGPT connector smoke, M187 field smoke metadata, and agent scenario mutating classification.
- Added `.codex-audit/sdk-feature-conveyor/dakkshin-intake/m193-layer-marker-evidence-design.md`.
- Passed the M193 non-live validation listed in the validation matrix.
- Live CEP/AE mutating validation, OpenAI CLI planner acceptance, audio analysis/beat detection, bulk marker generation, marker delete/update, destructive layer/project operations, mask delete/invert/path editing, dependency changes, push, and PR were not run.

### Milestone 194

- Added `.codex-audit/sdk-feature-conveyor/dakkshin-intake/m194-marker-delete-update-design.md`.
- Recorded marker delete/update as a future separate gated slice instead of extending M193 marker creation evidence.
- Future implementation should use explicit single-marker targeting, before/after marker summaries, semantic update/absence checks, and fail-closed ambiguity handling.
- This milestone is design-only: no runtime tool, planner alias, semantic verification code, smoke helper, CEP UI, dependency, live validation, OpenAI CLI planner acceptance, push, or PR changed.
- Passed the M194 documentation validation listed in the validation matrix.

### Milestone 195

- Added `update_layer_marker` to `mcp-server/bridge-daemon.js` as a narrow M100-gated mutating typed tool for one existing layer marker.
- The tool targets active comp, `compItemIndex`, or `compName`; requires `layerIndex`; accepts `markerIndex` or strict `targetTime`; optionally validates `targetComment`; updates only `comment`, `time`, and `duration`; rejects missing, ambiguous, out-of-range, locked-layer, negative-time, and negative-duration cases.
- Registered `update_layer_marker` in mutating/planning tool lists and Agent planner guidance so marker edit requests can avoid raw ExtendScript.
- Added plan-repair aliases for `updateMarker`/`updateLayerMarker`/`editMarker`/`editLayerMarker` plus marker target/new-value arg aliases.
- Added semantic verification for updated marker read-back and local smoke/helper coverage in main bridge smoke, plan repair smoke, semantic verification smoke, ChatGPT connector smoke, M187 field smoke metadata, agent scenario mutating classification, and solution promotion helper.
- Added `.codex-audit/sdk-feature-conveyor/dakkshin-intake/m195-update-layer-marker-design.md`.
- Passed the M195 non-live validation listed in the validation matrix.
- Live CEP/AE mutating validation, OpenAI CLI planner acceptance, marker delete, bulk marker generation/delete, audio analysis/beat detection, destructive layer/project operations, mask delete/invert/path editing, dependency changes, push, and PR were not run.

### Milestone 196

- Added `delete_layer_marker` to `mcp-server/bridge-daemon.js` as a narrow M100-gated mutating typed tool for one existing layer marker.
- The tool targets active comp, `compItemIndex`, or `compName`; requires `layerIndex`; accepts `markerIndex` or strict `targetTime`; optionally validates `targetComment`; rejects missing, ambiguous, out-of-range, locked-layer, and negative-target-time cases.
- Registered `delete_layer_marker` in mutating/planning tool lists and Agent planner guidance so marker delete requests can avoid raw ExtendScript.
- Added plan-repair aliases for `deleteMarker`/`deleteLayerMarker`/`removeMarker`/`removeLayerMarker`.
- Added semantic verification that confirms the deleted marker target is absent from post-run marker read-back and local smoke/helper coverage in main bridge smoke, plan repair smoke, semantic verification smoke, ChatGPT connector smoke, M187 field smoke metadata, agent scenario mutating classification, and solution promotion helper.
- Added `.codex-audit/sdk-feature-conveyor/dakkshin-intake/m196-delete-layer-marker-design.md`.
- Passed the M196 non-live validation listed in the validation matrix.
- Live CEP/AE mutating validation, OpenAI CLI planner acceptance, clear-all marker deletion, bulk marker generation/delete, audio analysis/beat detection, destructive layer/project operations, mask delete/invert/path editing, dependency changes, push, and PR were not run.

### Milestone 197

- Added `.codex-audit/sdk-feature-conveyor/dakkshin-intake/m197-bulk-selected-layer-duplicate-design.md`.
- Recorded bulk/selected-layer duplication as a future separate gated slice instead of extending M192 `duplicate_layer`.
- Future implementation should use concrete `layerIndices`, optional selected-layer bindings from prior read-only evidence, source-name guards, source/duplicate pair read-back, and semantic one-duplicate-per-source checks.
- This milestone is design-only: no runtime tool, planner alias, semantic verification code, smoke helper, CEP UI, dependency, live validation, OpenAI CLI planner acceptance, push, or PR changed.
- Passed the M197 documentation validation listed in the validation matrix.

### Milestone 198

- Updated `AGENTS.md` so live CEP/AE validation is mandatory when AE, installed panel, and bridge are available; planner-visible or mutating tool changes require a relevant generated-only Full UI Agent `openai-cli` planner acceptance lane.
- Added `agentMarkerLifecycleScenarioPlans` to `scripts/agent-scenario-fixtures.js` covering generated-only `create_comp`, `create_solid_layer`, `add_layer_marker`, `update_layer_marker`, `delete_layer_marker`, and `get_layer_details`.
- Added `full-ui-agent-marker-lifecycle-openai-cli-smoke` to `scripts/cep-panel-cdp-smoke.js` with generated marker read-back verification and cleanup.
- Added `m198-marker-lifecycle-live-validation` to the feature conveyor queue and runner with exact approval text, read-only inspect stage, mutating Full UI Agent OpenAI CLI stage, and fallback rejection.
- Updated feature conveyor readiness/command smokes, current SDK state, and orchestrator README for the M198 live lane.
- Added `.codex-audit/sdk-feature-conveyor/dakkshin-intake/m198-live-validation-rule-marker-lane.md`.
- Passed the M198 static/live-lane validation listed in the validation matrix.
- Passed the M198 Full UI Agent live marker lifecycle acceptance listed in the validation matrix.

### Milestone 199

- Added `.codex-audit/sdk-roadmap-supervisor/199-roadmap-supervisor-contract.json`.
- Added `.codex-audit/sdk-roadmap-supervisor/199-roadmap-supervisor-readiness.json`.
- Added `.codex-audit/sdk-roadmap-supervisor/199-roadmap-supervisor-governance.json`.
- Added `.codex-audit/sdk-roadmap-supervisor/199-roadmap-supervisor-queue.json`.
- Added `orchestrator/run-ae-agent-roadmap-supervisor.mjs` with `--plan-only`, queue schema validation, safe path checks, exact approval text generation, max item/minute caps, and unsafe flag rejection.
- Added roadmap supervisor package scripts, README documentation, current SDK state coverage, and check:rules smoke wiring.

### Milestone 200

- Extended the roadmap supervisor with `--execute-one` for exactly one approved queue item.
- Execution requires exact supervisor approval text, clean git state, approved item state, `maxChildRuns >= 1`, and planned paths inside policy.
- Writer children run through existing bounded runner kinds or smoke fixtures; child output is logged under `.codex-runtime/sdk/roadmap-supervisor/<session-id>/children/`.
- The supervisor checks changed paths before validation, runs allowlisted validation commands, requires handoff updates when the item policy requires them, auto-commits only planned files, then validates committed and working-tree paths against the same allowlist.

### Milestone 201

- Extended the roadmap supervisor with `--run-until-budget`, `--session-id`, and `--resume-session`.
- Runtime state lives under `.codex-runtime/sdk/roadmap-supervisor/<session-id>/state.json`, with `events.jsonl`, child/reviewer logs, and `final-report.json`.
- The loop runs one writer item at a time until max item/minute budget, no ready items, or the first fail-closed gate.
- Parallel reviewer mode runs at most two read-only reviewer tasks per item; reviewer failures or blocking findings stop the item when the queue item marks reviewers blocking.
- Added temp-git command smoke coverage for plan-only/no child run, wrong approval, dirty tree, successful execute-one commit, unplanned path rejection, validation failure stop, run-until-budget budget stop, resume-state, and reviewer read-only behavior.

### Milestone 202

- Added supervisor `--live-check` mode for read-only checks against an already-open AE Agent panel.
- `--live-check` runs `node scripts/cep-panel-cdp-smoke.js inspect` and `node scripts/cep-panel-cdp-smoke.js connector-status-smoke`, writes logs under `.codex-runtime/sdk/roadmap-supervisor/<session-id>/live/`, and records a final report without touching tracked files.
- Added `--require-live-connectivity` for `--execute-one` and `--run-until-budget`, so real supervisor execution can fail closed before writer work when AE/CEP/bridge are unavailable.
- Added optional queue item `liveValidation` policy with modes `none`, `read-only-connectivity`, and `generated-only-command`.
- Generated-only item live validation requires queue-declared commands, `mutatingLive:true`, and exact separate `--live-approval-text`.
- Extended command smoke coverage with temp-repo fake CEP smoke scripts proving live-check, required live connectivity, missing item live approval failure, and successful item-level live validation logging.

### Milestone 203

- Added `.codex-audit/sdk-roadmap-supervisor/203-bulk-selected-layer-duplicate-queue.json`.
- The queue maps the M197 design-only duplicate-many slice into sequential M204-M210 supervisor items: runtime tool, planner/repair exposure, semantic/local smokes, generated-only live lane, solution-library guidance, supervisor proof, and closeout.
- The queue keeps every item `pending-explicit-approval`; M203 is plan-only preview, not authorization to execute writer children.
- `--plan-only` showed first ready item `m204-duplicate-layers-runtime-tool`, no child runs, no SDKThread, no runtime state, and exact future supervisor approval text for `maxItems=3` / `maxMinutes=180`.

### Milestone 204

- Added `roadmap-sdk` runner support to `orchestrator/run-ae-agent-roadmap-supervisor.mjs`.
- `roadmap-sdk` writer children run directly through `orchestrator/codex-sdk-orchestrator.mjs` with workspace-write, approval `never`, web search disabled, reasoning `high`, and model default.
- Supervisor approval text now binds repo path, queue path, `queueSha256`, all queue item ids, max items/minutes, auto-commit/no-push/no-dependency policy, and generated-only live bindings.
- Updated the M203 duplicate-layers queue to use `roadmap-sdk` and self-contained `allowedActions` / `forbiddenActions`, so future execution no longer needs lower feature-conveyor item activation.
- Generated-only live validation can be authorized by the single supervisor approval only when the queue item declares `generatedOnlyLive=true`, `noUserAssetMutation=true`, and the exact command appears in `liveBindings`; `--live-approval-text` remains the fallback for older or unbound live items.

### Milestone 204 SupervisorChild CLI Fallback Repair

- Fixed the `roadmap-sdk` writer path so `--engine cli` switches the writer child itself to Codex CLI through `cmd.exe`, instead of switching only reviewers and legacy conveyor children.
- The CLI writer keeps workspace-write sandbox, approval `never`, reasoning `high`, disabled web search, disabled workspace network access, the same self-contained roadmap prompt, and the same supervisor path/validation/handoff/commit gates.
- Added command-smoke coverage that forces the fake SDK path to emit the observed `Failed to parse item: SUCCESS: The process ... has been terminated.` failure while proving the `--engine cli` roadmap writer still completes, logs `roadmap-cli`, and commits only planned paths.
- This repair changes supervisor orchestration only. It does not run the product duplicate-layers chain, mutate AE, push, create a PR, change dependencies, or broaden CEP SDK write scope.

### Milestone 204 Roadmap Supervisor Ignored Handoff Repair

- Fixed the real-repo handoff gate before running the duplicate-layers chain: `.codex/handoff.md` is ignored by `.gitignore`, so it does not appear in `git status` and must not be forced into the item commit.
- Required handoff validation now snapshots the handoff file before writer execution and accepts a post-run update when content, size, or mtime changes.
- Auto-commit staging now excludes planned paths that are untracked and ignored, while still allowing tracked ignored paths and normal new planned files.
- Updated command smoke temp repos to ignore `.codex/`, so future supervisor smokes cover the same ignored-handoff behavior as this repository.

### Milestone 204 Queue Item: Duplicate Layers Runtime Tool

- Added `.codex-audit/sdk-feature-conveyor/dakkshin-intake/m204-duplicate-layers-runtime-tool-design.md`.
- Added `duplicate_layers` to `mcp-server/bridge-daemon.js` as a bounded mutating typed bridge tool.
- The tool requires explicit non-empty `layerIndices` and rejects duplicate, non-positive, non-integer, out-of-range, locked, source-name mismatch, and selection-only targets.
- The tool opens its undo group only after target preflight and closes it with a `finally` guard; it returns `pairs[]` source/duplicate read-back, before/after layer counts, duplicate count, safety metadata fields, and `postVerification` count/pair evidence.
- Updated `scripts/smoke-test.js` to assert schema exposure, safety fields, queued script guards, fake source/duplicate read-back, post-verification fields, and pre-queue rejection for empty/duplicate/non-positive `layerIndices`.
- Planner guidance, plan-repair aliases, semantic verification, generated-only live lane, CEP UI, dependency changes, push, PR, and live AE/CEP mutation were not performed.
- 2026-05-24 writer-child recheck: M204 was already present at `HEAD` `0ca1ff7d437e677bb3a3309df6268354ca386806`; reran the queue validation commands successfully (`node --check mcp-server/bridge-daemon.js`, `node scripts/smoke-test.js`, `npm.cmd run check:rules`, `git diff --check`) without code changes or live AE/CEP mutation. Updating `.codex/handoff.md` was attempted with `apply_patch` and PowerShell UTF-8 write, but both were blocked by filesystem permissions on the ignored handoff file; the current handoff file still contains M206 state and must be finalized by a process with permission.

### Milestone 205 Queue Item: Duplicate Layers Planner/Repair Exposure

- Added `.codex-audit/sdk-feature-conveyor/dakkshin-intake/m205-duplicate-layers-planner-repair-design.md`.
- Added `duplicate_layers` to `PLANNING_TOOL_NAMES`, so Agent planner guidance and typed-tool catalog list the runtime tool as mutating with required `layerIndices`.
- Added planner guidance that distinguishes explicit single-layer `duplicate_layer`, explicit bulk/selected-layer `duplicate_layers`, and selected precomp/source `deep_duplicate_precomp_sources`.
- Added bounded plan-repair aliases only for plural/bulk/selected duplicate-layer intents, plus `layerNames` -> `sourceNames` and suffix -> `nameSuffix` arg aliases.
- Added local smoke coverage proving selected-layer duplicate repair binds `{{selectedLayerIndices}}` only after prior read-only selected-layer evidence and remains invalid without evidence.
- Updated ChatGPT connector smoke to keep `duplicate_layers` off the read-only connector surface and agent scenario fixtures to classify it as mutating.
- The first supervisor attempt stopped after validation because the writer child could not update ignored `.codex/handoff.md`; parent Codex finalized the handoff, and commit `78a0c5c` teaches the supervisor to handle that fallback deterministically for later items.
- Handoff state for continuation: current goal was M205 planner/repair exposure; files touched are the M205 design doc, `mcp-server/bridge-daemon.js`, `mcp-server/plan-repair.js`, `scripts/plan-repair-smoke.js`, `scripts/chatgpt-connector-smoke.js`, `scripts/agent-scenario-fixtures.js`, and this plan; validation is the M205 row above; next queue item is M206 `m206-duplicate-layers-semantic-local-smokes`.
- 2026-05-24 writer-child recheck: M205 code/docs were already present; reran the queue validation commands successfully (`node --check mcp-server/bridge-daemon.js`, `node --check mcp-server/plan-repair.js`, `node --check scripts/plan-repair-smoke.js`, `node --check scripts/chatgpt-connector-smoke.js`, `node --check scripts/agent-scenario-fixtures.js`, `node scripts/plan-repair-smoke.js`, `node scripts/chatgpt-connector-smoke.js`, `npm.cmd run check:rules`, `git diff --check`). Updating `.codex/handoff.md` was attempted with `apply_patch` and PowerShell UTF-8 write, but both were blocked by the existing sandbox ACL deny on `.codex/handoff.md`; the current handoff file still contains M204 state and must be finalized by a process with permission. No product-code change was needed in this writer turn; existing M205 implementation commit is `44f3d73`, and current observed pre-recheck `HEAD` was `916305a`.
- Semantic verification, solution-library guidance, generated-only live lane, CEP UI, dependency changes, package manifests, push, PR, and live AE/CEP validation were not performed.

### Milestone 206 Queue Item: Duplicate Layers Semantic Local Smokes

- Added `.codex-audit/sdk-feature-conveyor/dakkshin-intake/m206-duplicate-layers-semantic-local-smokes-design.md`.
- Added `duplicate_layers` to semantic mutating-tool verification.
- Added semantic checks for one source/duplicate pair per requested source, expected duplicate names in post-run read-back, and before/after layer counts with after-count read-back evidence.
- Added local semantic smoke coverage for a two-source duplicate run with `get_comp_details` read-back and a negative no-read-back fixture that remains `needs_review`.
- Strengthened main bridge smoke assertions for `duplicate_layers` source/duplicate names, duplicate count, layer-count delta, and `postVerification` fields.
- Updated reliability suite metadata/smoke so the local semantic check explicitly carries `duplicate_layers` evidence.
- Handoff state for continuation: current goal was M206 semantic/local smoke coverage; files touched are the M206 design doc, `mcp-server/semantic-verification.js`, `scripts/semantic-verification-smoke.js`, `scripts/smoke-test.js`, `scripts/reliability-validation-suite.js`, `scripts/reliability-validation-suite-smoke.js`, and this plan. Updating `.codex/handoff.md` was attempted with `apply_patch` and PowerShell UTF-8 write, but both were blocked by filesystem permissions on the ignored handoff file; the current handoff file still contains M205 state. Validation is the M206 row above; next queue item is M207 generated-only live lane if the roadmap queue remains unchanged.
- Solution-library guidance, generated-only live lane, CEP UI, dependency changes, package manifests, push, PR, destructive deletion, source relinking, masks, paths, audio workflows, and live AE/CEP validation were not performed.

### Milestone 207 Queue Item: Duplicate Layers Generated-Only Live Lane

- Added `.codex-audit/sdk-feature-conveyor/dakkshin-intake/m207-duplicate-layers-live-validation-design.md`.
- Added `m207-duplicate-layers-live-validation` to the feature conveyor queue as a local-live-validation item.
- Added an exact M207 live approval text and dry-run command for `--validate-live --stage both --allow-mutating-live`.
- Added runner command mapping for read-only CEP inspect plus `full-ui-agent-duplicate-layers-openai-cli-smoke`.
- Added a CDP Full UI Agent scenario config that requires `openai-cli`, `gpt-5.5`, Agent mode, and panel-generated plans with deterministic fallback disabled.
- Added a generated-only duplicate-layers fixture: create comp, create two solid source layers, run `duplicate_layers` with concrete `layerIndices` and `sourceNames`, then read back `get_comp_details`.
- Added bridge read-back validation for source names, duplicate names, and final layer count.
- Local validation and generated-only live AE/CEP status are recorded in the M207 validation row above.
- The fallback live command passed on 2026-05-24 with report `.codex-runtime/sdk/feature-conveyor-live-reports/2026-05-24T12-48-44-333Z-m207-duplicate-layers-live-validation-both.json` and agent report `logs/agent-run-reports/2026-05-24T12-48-41.269Z-openai-cli-gpt-5.5-duplicate-layers-Codex-QA-M207-26882964.json`.
- The live run used OpenAI CLI planning through the installed CEP panel, protected the generated-only edit with a checkpoint/edit session, verified the result through duplicate-layers read-back, removed three generated project items, and left the render queue at `0`.
- A stale bridge daemon initially lacked the new `duplicate_layers` tool; restarting the local bridge exposed 84 tools and unblocked the live lane.
- Handoff state was updated in `.codex/handoff.md` after parent-side M207 live evidence recording.
- CEP panel edits, dependency changes, package manifests, push, PR, user-asset mutation, source relinking, deep precomp duplication, masks, paths, audio workflows, deterministic fallback, Local/Ollama fallback, and OpenRouter fallback were not performed.

### Milestone 208 Queue Item: Duplicate Layers Solution Library Guidance

- Added `.codex-audit/sdk-feature-conveyor/dakkshin-intake/m208-duplicate-layers-solution-library-design.md`.
- Added `bulk-layer-duplicate-typed-tool` to `registry/solutions.json` as a reviewed `tool` entry rather than a standalone `recipe`, because this queue item cannot write a new file under `recipes/`.
- The Solution Library guidance prefers `duplicate_layers` for explicit bulk layer duplication with concrete `layerIndices`.
- Selected-layer duplicate workflows are documented as requiring prior `get_selected_layers` evidence before selected indices are bound into `layerIndices`.
- Compact tool-match prompt formatting now carries tool-backed guidance without exposing full registry metadata or expanding normal recipe hints beyond the prompt bound.
- Updated solution retrieval and library validation smokes to prove `duplicate_layers` guidance surfaces, selected-layer evidence is present, and raw ExtendScript / deep precomp-source duplication are not promoted by this guidance.
- Handoff state is maintained in `.codex/handoff.md`; the failed supervisor attempt was due to Windows `.cmd` validation dispatch, not a handoff filesystem gate.
- Runtime typed-tool code, planner/repair logic, semantic verification behavior, generated-only live lane code, CEP panel files, dependencies, package manifests, push, PR, destructive deletion, source/precomp relinking, mask/path edits, audio workflows, arbitrary user-asset mutation, and live AE/CEP validation were not performed.

### Milestone 209 Queue Item: Duplicate Layers Roadmap Supervisor Proof

- Updated `.codex-audit/sdk-roadmap-supervisor/203-bulk-selected-layer-duplicate-queue.json` with M209 supervisor proof for the duplicate_layers queue.
- Updated `.codex-audit/sdk-current-state.json` and `orchestrator/README.md` so current-state claims match the validated supervisor behavior.
- Plan-only preview proved no child run, SDK thread, or runtime state was created and recorded the queueSha256-bound approval fields, including the M207 generated-only live binding.
- Roadmap supervisor readiness/command smokes prove single-approval behavior, wrong-approval rejection, generated-only live binding policy, unplanned path stops, ignored handoff handling, and Windows `.cmd` validation dispatch.
- Runtime bridge code, CEP panel files, dependencies, package manifests, mutating live AE validation, push, and PR were not changed.

### Milestone 210 Queue Item: Duplicate Layers Epic Governance Closeout

- Recorded the M203 duplicate_layers roadmap queue closeout state in `.codex-audit/sdk-roadmap-supervisor/203-bulk-selected-layer-duplicate-queue.json`.
- Updated `.codex-audit/sdk-current-state.json` and `orchestrator/README.md` to record M210 as a docs/governance closeout for committed M204-M209 evidence.
- Refreshed this plan with closeout state, validation scope, boundaries, and final supervisor evidence.
- The roadmap supervisor committed M210 as `340bdc6cfa143a0548212c33bc102cd2dc0c49e0`; parent-side handoff update then recorded the final continuation state in `.codex/handoff.md`.
- No runtime bridge behavior, planner behavior, semantic verifier behavior, live lane behavior, CEP panel file, dependency, package manifest, push, PR, or live AE/CEP execution was added during M210 closeout.

### Milestone 211: Duplicate Layers Closeout Reconciliation

- Reconciled stale tracked governance text that still described M210 as `pending-handoff-acl` after parent-side handoff and runtime state confirmed M210 completion.
- Updated `.codex-audit/sdk-roadmap-supervisor/203-bulk-selected-layer-duplicate-queue.json` so `m210-duplicate-layers-closeout` is `completed`, references commit `340bdc6cfa143a0548212c33bc102cd2dc0c49e0`, and records `handoffUpdated: true`.
- Updated `.codex-audit/sdk-current-state.json`, `orchestrator/README.md`, this plan, and `.codex/handoff.md` to reflect the reconciled M204-M210 closeout.
- Removed the unplanned `docs/research/composio-agent-orchestrator-applicability.md` artifact created by the stopped M209 writer attempt because it was outside the roadmap queue planned paths.
- No runtime bridge behavior, planner behavior, semantic verifier behavior, live lane behavior, CEP panel file, dependency, package manifest, push, PR, or live AE/CEP execution was added during M211 reconciliation.

### Milestone 212 Queue Item: AO-Inspired Task/Session/Activity Schema

- Added `.codex-audit/sdk-ao-pattern-intake/212-activity-session-schema.json` as a local AO-inspired intake contract, not an AO integration.
- The contract defines the M212 task envelope fields, planned and forbidden paths, allowed and validation commands, stop gates, escalation rules, `nextPrompt`, handoff path, state file, activity log, and report path.
- The contract defines session roles `writer`, `reviewer`, `analyzer`, and `live-check`; lifecycle states `queued`, `active`, `idle`, `needs_input`, `stuck`, `errored`, `done`, `stopped`, and `escalated`; and activity JSONL examples for `active`, `ready`, `idle`, `needs_input`, `stuck`, `errored`, `done`, `validation_started`, `validation_failed`, `handoff_written`, and `commit_created`.
- Added `scripts/sdk-ao-pattern-intake-smoke.js` to parse the schema and assert required fields, roles, states, event examples, roadmap-supervisor mapping, M211 numbering-collision note, and false forbidden-boundary claims.
- M212 maps the intake contract to existing `.codex-runtime/sdk/roadmap-supervisor/<session-id>/` artifacts without changing runtime behavior.
- Handoff update was attempted with `apply_patch` and PowerShell UTF-8 write, but both were blocked by the inherited Deny ACL on `.codex/handoff.md`; supervisor/parent must finalize `.codex/handoff.md` and commit the M212 planned files.
- Handoff content for supervisor/parent: current goal is M212 AO-inspired task/session/activity schema; files touched are `.codex-audit/sdk-ao-pattern-intake/212-activity-session-schema.json`, `scripts/sdk-ao-pattern-intake-smoke.js`, `plans/target-app-execplan.md`, and intended `.codex/handoff.md`; validation passed with `node --check scripts/sdk-ao-pattern-intake-smoke.js`, `node scripts/sdk-ao-pattern-intake-smoke.js`, `npm.cmd run check:rules`, and `git diff --check`; commit is pending for supervisor/parent with suggested message `docs: add AO-inspired activity schema`.
- Exact next prompt for M213: Continue in `C:\Users\Ant\Documents\Codex\AE_agent` with queue item `m213-ao-stuck-escalation-design`. Read `AGENTS.md`, `specs/target-app.md`, `plans/target-app-execplan.md`, `.codex/handoff.md`, `.codex-audit/sdk-roadmap-supervisor/211-ao-inspired-pipeline-hardening-queue.json`, and `.codex-audit/sdk-ao-pattern-intake/212-activity-session-schema.json`. Create `.codex-audit/sdk-ao-pattern-intake/213-stuck-escalation-design.json` as a design-only policy over the M212 activity/session contract, add `scripts/sdk-ao-stuck-escalation-smoke.js`, update `plans/target-app-execplan.md` and `.codex/handoff.md`, and run `node --check scripts/sdk-ao-stuck-escalation-smoke.js`, `node scripts/sdk-ao-stuck-escalation-smoke.js`, `npm.cmd run check:rules`, and `git diff --check`. Do not install or run AO, change roadmap supervisor runtime behavior, add auto-fix/auto-retry loops, edit CEP/live/production/dependency/package/GitHub paths, push, or create a PR.
- No AO install/start, branch/worktree, push, PR, GitHub issue/action, CEP panel edit, bridge/runtime/connector/registry/recipe/production path edit, dependency/package change, live AE/CEP validation, or external-provider planner validation was performed.

### Milestone 213 Queue Item: AO-Inspired Stuck Detector And Escalation Design

- Added `.codex-audit/sdk-ao-pattern-intake/213-stuck-escalation-design.json` as a design-only policy over the M212 activity/session contract, not an AO integration and not runtime behavior.
- The policy defines stuck inputs for stale activity, missing log progress, validation failure, child process timeout, `needs_input` prompt, `context_pressure`, dirty git state, and unplanned path changes.
- The policy defines escalation actions `stop_and_handoff`, `ask_user`, `create_repair_prompt`, `retry_later`, and `fail_closed`, with capped retries, no auto-fix default, no auto-retry default, and fail-closed handling for unplanned paths, live/dependency actions, and forbidden boundaries.
- Added `scripts/sdk-ao-stuck-escalation-smoke.js` to parse the M212 and M213 artifacts and prove fixture outcomes: stale activity escalates to `stop_and_handoff`, validation failure escalates to `create_repair_prompt`, healthy done sessions do not escalate, and unplanned package-path changes fail closed.
- Validation passed with `node --check scripts/sdk-ao-stuck-escalation-smoke.js`, `node scripts/sdk-ao-stuck-escalation-smoke.js`, `npm.cmd run check:rules`, and `git diff --check`.
- Handoff update was attempted with `apply_patch` and PowerShell UTF-8 write, but both were blocked by the inherited Deny ACL on `.codex/handoff.md`; supervisor/parent must finalize `.codex/handoff.md` and commit the M213 planned files.
- Handoff content for supervisor/parent: current goal is M213 AO-inspired stuck detector/escalation design; files touched are `.codex-audit/sdk-ao-pattern-intake/213-stuck-escalation-design.json`, `scripts/sdk-ao-stuck-escalation-smoke.js`, `plans/target-app-execplan.md`, and intended `.codex/handoff.md`; validation passed with `node --check scripts/sdk-ao-stuck-escalation-smoke.js`, `node scripts/sdk-ao-stuck-escalation-smoke.js`, `npm.cmd run check:rules`, and `git diff --check`; commit is pending for supervisor/parent with suggested message `docs: add AO-inspired escalation design`.
- Exact next prompt for M214: Continue in `C:\Users\Ant\Documents\Codex\AE_agent` with queue item `m214-ao-static-status-dashboard`. Read `AGENTS.md`, `specs/target-app.md`, `plans/target-app-execplan.md`, `.codex/handoff.md`, `.codex-audit/sdk-roadmap-supervisor/211-ao-inspired-pipeline-hardening-queue.json`, `.codex-audit/sdk-ao-pattern-intake/212-activity-session-schema.json`, and `.codex-audit/sdk-ao-pattern-intake/213-stuck-escalation-design.json`. Create `.codex-audit/sdk-ao-pattern-intake/214-status-dashboard-contract.json`, add the static no-dependency dashboard renderer and smoke listed in the queue item, update `plans/target-app-execplan.md` and `.codex/handoff.md`, and run the item validation commands. Do not install or run AO, add a web server or dependency, change package files, edit CEP/live/production paths, push, create a PR, or run live AE/CEP.
- No auto-fixing runtime loop, roadmap supervisor runtime behavior change, AO install/start, branch/worktree, push, PR, GitHub issue/action, CEP panel edit, bridge/runtime/connector/registry/recipe/production path edit, dependency/package change, live AE/CEP validation, or external-provider planner validation was performed.

### Milestone 214 Queue Item: AO-Inspired Static Status Dashboard

- Added `.codex-audit/sdk-ao-pattern-intake/214-status-dashboard-contract.json` as a static Markdown dashboard contract over the M212 activity/session contract and M213 stuck/escalation design.
- Added `scripts/render-roadmap-supervisor-status-dashboard.js` as a no-dependency CLI that requires `--session-root`, discovers either one session root or immediate child session roots, reads bounded `state.json`, `events.jsonl`, and immediate `reports/*.json`, and renders session id, queue item, role, lifecycle status, last activity, validation result, blockers, changed paths, handoff path, report path, and next action.
- The renderer prints Markdown to stdout by default and writes only when `--output <path>` is supplied; it does not start a server, install packages, write runtime/production files by default, or require live AE/CEP.
- Added `scripts/sdk-ao-status-dashboard-smoke.js` to parse the M212/M213/M214 artifacts, build temp active/stuck/done fixture sessions, run the renderer, assert lifecycle status, validation result, blockers, changed paths, handoff/report paths, and next-action text, and verify explicit Markdown output writing.
- Validation passed with `node --check scripts/render-roadmap-supervisor-status-dashboard.js`, `node --check scripts/sdk-ao-status-dashboard-smoke.js`, `node scripts/sdk-ao-status-dashboard-smoke.js`, `npm.cmd run check:rules`, and `git diff --check`.
- Handoff update was attempted with `apply_patch` and PowerShell `Set-Content`, but both were blocked by the inherited Deny ACL on `.codex/handoff.md`; supervisor/parent must finalize `.codex/handoff.md` and commit the M214 planned files.
- Handoff content for supervisor/parent: current goal is M214 AO-inspired static status dashboard; files touched are `.codex-audit/sdk-roadmap-supervisor/211-ao-inspired-pipeline-hardening-queue.json`, `.codex-audit/sdk-ao-pattern-intake/214-status-dashboard-contract.json`, `scripts/render-roadmap-supervisor-status-dashboard.js`, `scripts/sdk-ao-status-dashboard-smoke.js`, `plans/target-app-execplan.md`, and intended `.codex/handoff.md`; validation passed with `node --check scripts/render-roadmap-supervisor-status-dashboard.js`, `node --check scripts/sdk-ao-status-dashboard-smoke.js`, `node scripts/sdk-ao-status-dashboard-smoke.js`, `npm.cmd run check:rules`, and `git diff --check`; commit is pending for supervisor/parent with suggested message `feat: add roadmap status dashboard`.
- Historical M214 next prompt was superseded by the AUX lane decision: continue with AUX-004, not a new product milestone id.
- No web server, browser UI, dependency, package script, package manifest/lock change, AO install/start, branch/worktree, push, PR, GitHub issue/action, CEP/live/production path access, live AE/CEP validation, external-provider planner validation, or roadmap supervisor runtime behavior change was performed.

### AUX-004 Support Item: AO-Inspired Read-Only Failure Analyzer

- Added `.codex-audit/sdk-ao-pattern-intake/aux-001-activity-session-schema.json`, `.codex-audit/sdk-ao-pattern-intake/aux-002-stuck-escalation-design.json`, and `.codex-audit/sdk-ao-pattern-intake/aux-003-status-dashboard-contract.json` as compatibility artifacts over the already committed legacy M212-M214 artifacts.
- Added `.codex-audit/sdk-ao-pattern-intake/aux-004-readonly-failure-analyzer-contract.json` as a read-only packet contract over explicit failure report, log, and session fixture paths.
- Added `scripts/create-roadmap-failure-analyzer-packet.js` as a no-dependency CLI that requires at least one explicit `--report`, `--log`, or `--session` input and emits JSON or Markdown to stdout. It reads bounded log/event tails and does not write output files, edit source, retry commands, install packages, run live AE/CEP, or invoke AO.
- The packet includes failure class, command, status, relevant log tail, changed paths when supplied, suspected cause with confidence, forbidden auto-actions, repair prompt, and next bounded task fields.
- Added `scripts/sdk-ao-failure-analyzer-smoke.js` to parse AUX-001-AUX-004 compatibility/contract artifacts, build temp validation_failure and stuck_session fixtures, run the analyzer, assert repair prompts and next bounded task fields, and verify forbidden auto-actions for auto-fix, command retry, live AE/CEP, dependency, and PR work.
- Updated `.codex-audit/sdk-roadmap-supervisor/211-ao-inspired-pipeline-hardening-queue.json` closeout notes only after `git log --oneline --decorate -12` showed M212 commit `b680a4f`, M213 commit `12eb9be`, and M214 commit `d1d4756`. The queue path remains unchanged, and M212-M214 artifact paths were not renamed, moved, renumbered, or recreated.
- The interrupted retry left untracked AUX compatibility artifacts outside the planned M215 paths; this parent/local closeout removed those duplicates and kept the completed M212-M214 artifact paths unchanged.
- Validation passed with `node --check` for the touched analyzer scripts and the corresponding M215 smoke, `npm.cmd run check:rules`, `git diff --check`, and the full non-live smoke suite listed in the M215 queue item.
- Handoff was updated locally in `.codex/handoff.md`; it is ignored and not staged.
- Exact next prompt for the next thread: Continue in `C:\Users\Ant\Documents\Codex\AE_agent` after the M215 commit. Read `AGENTS.md`, `specs/target-app.md`, `plans/target-app-execplan.md`, `.codex/handoff.md`, and the current roadmap/queue state. Start the next approved roadmap queue item only from a clean tree and fresh approval. Do not continue the AO-inspired block by creating M216-M218 AO artifacts unless a new approved queue explicitly asks for them.
- No source auto-fix, command retry, broad unbounded log read, live AE/CEP validation, external-provider planner validation, dependency/package change, CEP/live/production path edit, branch, worktree, push, PR, GitHub issue, GitHub Action, AO install/start, or roadmap supervisor runtime behavior change was performed.

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

`.codex/handoff.md` is writable from the parent Codex process and is updated after milestone work. Use it as the primary continuation record. If a roadmap writer child hits local sandbox/ACL denial on `.codex/handoff.md`, record the handoff state in this active plan and let the supervisor/parent finalize the handoff file.
