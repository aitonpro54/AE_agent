# Target App Execution Plan

## Active Baseline

This file is the compact active plan for AE Agent. Historical milestone detail through
2026-05-31 is archived at
`plans/archive/target-app-execplan-history-through-2026-05-31.md`.

The target product remains the AE Agent 2.0.0 local After Effects CEP panel described
in `specs/target-app.md`: provider setup, Chat/Agent/Agent Hardcore modes, bridge-owned
planning and execution gates, protected AE mutations, compact diagnostics, and manual
Codex App dev-request handoff for repository work.

## Operating Guardrails

- Do not read `plans/archive/**` by default. Use it only for a targeted historical
  lookup with a narrow reason.
- Do not read old `.codex-runtime/**`, proof envelopes, batch reports, or generated
  runtime reports by default. Prefer compact handoff/status files and targeted `rg`.
- Keep this active plan compact. Target size is under 24 KB; hard cap is 32 KB.
  If it grows past the target, archive historical detail before starting new work.
- Keep `.codex/handoff.md` compact. Target size is under 12 KB; hard cap is 16 KB.
  If it grows past the target, replace stale detail with a concise continuation state.
- Do not use Local/Ollama unless explicitly requested in the current turn.
- Do not use broad/default CEP smoke, old longrun flows, real importer runs with
  `max-items > 1`, dependency/package changes, push, or PR creation without explicit
  approval.
- For live validation, prefer read-only CEP/CDP connectivity checks and narrow
  generated-only OpenAI CLI lanes when they are required and available.

## Progress

- [x] Milestone 1: AUX-100 importer child-run guard stabilization committed as
  `39b36f5`.
- [x] Milestone 2: Baseline reset active docs. The oversized active plan was archived,
  this compact baseline became the only active plan, archive/runtime-read guardrails
  were added, and active plan/handoff size guards were established.
- [x] Milestone 3: Camera-controller recovery review. The existing dirty recovery
  patch was salvaged as a typed-plan advisory recipe, and compact prompt guidance now
  preserves `camera.parent` verification plus the `multi-camera switch` fail-closed
  warning.
- [x] Milestone 4: Provider self-test guardrail hardening. The CEP provider
  self-test now uses setup/readiness-only checks with `checkModels=0`, keeps
  Local/Ollama visible as a manual `Detect Ollama` / `Check model` path, and smoke
  coverage now asserts that the shared self-test button does not probe Local/Ollama
  or refresh provider model lists.
- [x] Milestone 5: Provider self-test installed-panel validation. The installed CEP
  panel was synced through the narrow `cep-sync-health --sync --check` path, copying
  only `panel.js`, clearing only this extension's CEP cache while preserving Local
  Storage, and the targeted live self-test smoke proved `checkModels=0` with no
  `ollama-local` probe.
- [x] Milestone 6: Agent Hardcore typed-tool handoff proof. Failed TypedTools in the
  Hardcore transcript now name the `Codex App start prompt`, and the targeted live
  Hardcore UI smoke proves the typed tool is marked not working, the start prompt is
  shown, and no automatic Codex App dev chat is implied.
- [x] Milestone 7: Full Intaker bounded onion-skinning tail review. Compact ledger
  status showed the old remaining six as five `queued` candidates plus the already
  reviewed camera-controller recovery entry. The first queued candidate,
  `tool-compositions-toggle-onion-skinning`, was advanced through strict one-phase
  `select_candidate`, `prove_or_register_live_lane`, and `run_importer_phase`.
  Its registered generated-only live lane was ready, but the importer stopped before
  implementation with `implementation-child-run-failed:
  queue-batch-1-5fc7d26bd2`; the candidate is now terminal `failed_import`, leaving
  four queued candidates and zero `queued live_lane_needed`.
- [x] Milestone 8: Full Intaker bounded fill-in-keyframes tail review.
  `tool-keyframes-fill-in-keyframes` was advanced through strict one-phase
  `select_candidate`, `prove_or_register_live_lane`, and `run_importer_phase`.
  Its registered generated-only live lane was ready, but the importer stopped before
  implementation with `implementation-child-run-failed:
  queue-batch-1-75b0df2dec`; the candidate is now terminal `failed_import`, leaving
  three queued candidates and zero `queued live_lane_needed`.
- [x] Milestone 9: Full Intaker remaining queue drain. At the user's request, the
  remaining queue was completed in one work block while preserving strict one-phase
  `max-items 1` runs per candidate. `tool-keyframes-keyframe-current-value-from-expression`,
  `tool-keyframes-set-spacial-in-tanget`, and
  `tool-properties-separate-size-dimensions` all had ready generated-only live lanes,
  then stopped before implementation with `implementation-child-run-failed`
  terminal `failed_import` results. The durable ledger now has zero `queued`
  candidates and zero `queued live_lane_needed`.
- [x] Milestone 10: Full Intaker blocked live-lane synthesis drain. A scoped
  resolution pass was run only for the nine
  `blocked_live_lane_synthesis_incomplete` candidates requested by the user. The
  existing resolution path grouped them into two generated-only OpenAI CLI families:
  six layer-timing candidates and three effect-property candidates. Both families
  failed closed at generated-only proof read-back, so no candidates were requeued
  and the ledger still has nine `blocked_live_lane_synthesis_incomplete` entries,
  zero `queued`, and zero `queued live_lane_needed`.
- [x] Milestone 11: Full Intaker unsafe-skip triage. The 75
  `unsafe_skip_tool_gap` entries were grouped in
  `plans/full-intake-unsafe-skip-triage.md`: 28 safe-next generated-only, 32 needing
  new typed-tool contracts, and 15 approval-gated/last.
- [x] Milestone 12: Selection typed-tool/lane prep. Added bounded
  `set_layer_selection`, semantic/fixture coverage, and scoped
  `selection-generated-only`; live acceptance and retry still need approval.
- [x] Milestone 13: Selection live acceptance and scoped retry. With explicit user
  approval, the generated-only OpenAI CLI Selection lane passed after restarting the
  stale bridge daemon process. Exactly the 11 Selection `unsafe_skip_tool_gap` ids
  were requeued through the scoped resolver, then each reached `live_lane_ready` and
  failed closed during `run_importer_phase` before source merge or commit.
- [x] Milestone 14: Selection importer child-run recovery patch. Compact evidence
  review showed all 11 child runs failed before model execution because Codex CLI
  0.131.0 rejects the old `--reasoning-effort` flag. The importer now passes
  `model_reasoning_effort="high"` through `-c`, matching the other local
  orchestrator child-run lanes; related importer/queue/full-intake smoke fixtures
  were updated. No Selection retry, live lane, source merge, Local/Ollama, old
  longrun, dependency change, push, or PR was run.
- [x] Milestone 15: AUX-021 detached importer child-run for
  `tool-selection-layer-selection-set`. Added an advisory typed-plan recipe and
  registry/smoke-library metadata for explicit active-comp layer selection mutation
  through `set_layer_selection`, with `get_comp_details` layer inventory evidence,
  replacement selection semantics, `get_selected_layers` read-back, and fail-closed
  boundaries for persistent named selection sets or fuzzy/native UI selection
  behavior. No source JSX was copied. The parent scoped retry reached
  `non_live_validation_complete` and stopped before `generated_only_live_rerun`.
- [x] Milestone 16: Marker family readiness correction. With Selection live rerun
  and source merge still approval-gated, reviewed only targeted marker readiness:
  existing recipes/lane cover layer markers, while the four remaining triage Marker
  unsafe-skip ids require composition-marker typed-tool contracts before retry.
  Updated the triage counts and moved those four ids out of immediate safe-next.

## Current Dirty State

No known pre-existing dirty recovery state remains. Milestone 15 planned paths are
scoped to `tool-selection-layer-selection-set`.

## Next Milestone

Milestone 17: either continue only with explicit approval for the narrow
generated-only live rerun of `tool-selection-layer-selection-set`, or start a
non-live composition-marker typed-tool contract prep block before any Marker retry.
Do not run old longrun, unscoped retry, Local/Ollama, broad/default CEP smoke,
dependency changes, push/PR, source merge, or any live lane without explicit
approval.

## Decision Log

- The old active plan was preserved as history rather than summarized in place, because
  it contained useful historical proof but was too large for safe active-context use.
- The active plan is now a baseline and queue pointer, not a complete execution log.
- Runtime/proof artifacts are treated as cold storage. New chats should read compact
  handoff/status first and only open old reports by exact path when needed.
- Existing camera-controller recovery changes are separate from Milestone 2 and remain
  outside this commit except for being named as the next review target.
- Milestone 3 accepted the camera-controller recovery change rather than rejecting it:
  the recipe stays bounded to one generated camera plus one generated 3D null
  controller, uses `create_camera_with_controller` and `get_layer_details`, rejects
  existing-layer re-parenting and broader camera-rig semantics, and records that no
  source JSX was copied.
- The parent-link failure was a compact prompt-guidance issue, not a missing recipe
  safety rule. The registry `verificationRecipe.summary` was shortened so retrieval
  prompt text includes both `camera.parent` and `multi-camera switch`.
- The provider self-test is a lightweight setup/auth preflight, not a model catalog
  refresh or Local/Ollama detector. The explicit `Check model` action and Local
  `Detect Ollama` control remain the opt-in paths for those checks.
- The installed-panel validation gap was closed with the sync helper instead of the
  full installer, because only tracked CEP file drift was present and full
  PlayerDebugMode/install work was unnecessary.
- Agent Hardcore transcript copy should say `Codex App start prompt` for typed-tool
  failure handoffs. The panel prepares a manual continuation prompt; it does not claim
  that a Codex App dev chat was created automatically.
- For the resumed Full Intaker work, the camera-controller recovery ledger entry is
  treated as historically stale relative to Milestone 3's reviewed commit, while the
  remaining actionable old tails are the current `queued` and `failed_import` ledger
  entries.
- `tool-compositions-toggle-onion-skinning` was selected because it was first in the
  queue and already had a registered generated-only `toggle_onion_skinning` live lane.
  Since implementation planning failed before any source merge or live run, no CEP/AE
  mutation or OpenAI CLI live acceptance lane was started in this milestone.
- `tool-keyframes-fill-in-keyframes` was selected as the next first queued candidate
  with no `live_lane_needed` backlog. Since implementation planning failed before any
  source merge or live run, no CEP/AE mutation or OpenAI CLI live acceptance lane was
  started in this milestone.
- The remaining queue was drained in Milestone 9 because the user explicitly asked
  for the whole queue. The safety shape stayed bounded: three separate candidate
  transactions, each preserving `max-items 1` and strict phase boundaries. No source
  merge, live rerun, CEP/AE mutation, or OpenAI CLI live acceptance lane was started
  because each candidate failed during importer implementation planning.
- For Milestone 10, `--resolution-candidate-ids` with the nine explicit candidate
  ids was treated as the safe bounded path. The command kept `--compact-json`,
  `--max-items 1`, and `--no-commit`, so the run processed resolution tickets and
  stopped at `completed_no_candidates` without importer/source merge phases.
- The nine blocked entries now have fresh terminal resolution tickets in two
  families. The layer-timing generated-only proof failed because a generated layer
  timing start-time read-back expected `0.5` and got `2.75`. The effect-property
  generated-only proof failed because the generated effect property value was not
  found by read-back.
- Milestone 11 treated `unsafe_skip_tool_gap` as a backlog triage problem, not an
  importer retry problem. No source merge or lane retry was run; the next useful
  slice is Selection because it has many candidates and clear generated-only
  read-back semantics.
- Milestone 12 uses explicit layer indices plus optional expected names for selection
  mutation, and only allows unsafe-skip requeue when scoped ids are provided.
- Milestone 13 treated the first failed Selection live acceptance as stale daemon
  drift, not a tool-design failure: repository and installed CEP files already had
  `set_layer_selection`, but the running bridge process had to be restarted before
  the panel planner recognized it.
- The Selection resolver grouped all 11 scoped unsafe-skip ids into one
  `selection-generated-only` family. The family proof passed, so the entries were
  reclassified/requeued, but importer implementation child runs failed closed before
  any source merge.
- Milestone 14 treated the repeated Selection importer failure as a Codex CLI
  invocation compatibility bug, not a candidate/tool-design failure: every child
  result had `failed_process`, exit code 2, zero changed/unplanned paths, and stderr
  `unexpected argument '--reasoning-effort'`.
- The narrow recovery patch uses `-c model_reasoning_effort="high"` instead of
  `--reasoning-effort`, preserving the recorded child-run intent while matching the
  current Codex CLI surface and existing roadmap/feature conveyor command style.
- AUX-021 adapted `Selection/Layer_Selection_Set.jsx` as advisory typed-plan
  guidance only. The recipe requires explicit layer indices from current
  `get_comp_details` evidence, uses `set_layer_selection`, verifies with
  `get_selected_layers`, and treats persistent named selection sets, fuzzy matching,
  type/label/random selection, cross-comp selection, and exact native UI side
  effects as separate typed-tool contracts.
- Milestone 16 corrected the Marker triage classification: current marker typed
  tools and existing advisory recipes cover layer-marker workflows, but not
  composition-marker `markerProperty` add/read/copy semantics. The four remaining
  Marker unsafe-skip ids should not be retried until a composition-marker contract,
  generated-only fixture, read-back, and semantic verification lane exist.

## Validation

Milestones 2-9 targeted validation is archived in
`plans/archive/target-app-execplan-history-through-2026-05-31.md`. Compact outcome:
the active baseline reset, provider/CEP validation work, Hardcore handoff proof, and
bounded Full Intaker queue drain all completed with the documented guardrails; no
Local/Ollama, broad/default CEP smoke, old longrun, dependency changes, push/PR, or
`max-items > 1` importer run was used without approval.

Milestone 10 targeted validation:

- [x] Context/status check completed; no active goal budget was reported by the
  Codex context tool.
- [x] `git status --short --branch --untracked-files=all` showed branch
  `road-map-2.0` ahead 3 and no worktree changes before documentation updates.
- [x] `node orchestrator/full-intake-ledger-summary.mjs --compact` showed
  `blocked_live_lane_synthesis_incomplete:9`, zero `queued`, and
  `Queued live_lane_needed: 0`.
- [x] Scoped bounded run:
  `node orchestrator/run-generic-repo-full-intake.mjs --ledger .codex-runtime/sdk/generic-repo-importer/kyletmartinez-after-effects-scripts-intake/queue-ledger.json --run-id full-intake-kyletmartinez --max-items 1 --resolution-candidate-ids <nine requested ids> --context-percent 20 --allow-self-improvement-lane-synthesis --compact-json --no-commit`
  completed with `status: completed_no_candidates`, `terminalTickets:2`,
  `requeued:0`, and `items:0`.
- [x] Post-run compact status and proof showed `changedPathCount:0`,
  `unplannedPathCount:0`, no active related processes, and last event
  `resolution_queue_processed`.
- [x] Fresh resolution tickets showed both generated-only proof lanes failed closed:
  layer timing read-back mismatch and effect-property read-back missing value.

Not run by design: source merge, importer phases, mutating live CEP/AE validation,
broad/default CEP smoke, Local/Ollama provider validation, dependency changes,
push/PR, old longrun, and importer `max-items > 1`.

Milestone 11 targeted validation:

- [x] Read durable ledger only and confirmed 75 `blocked_or_skipped` entries, all
  `unsafe_skip_tool_gap`.
- [x] Created `plans/full-intake-unsafe-skip-triage.md` with all 75 ids grouped into
  28 safe-next, 32 contract-needed, and 15 approval-gated/last entries.
- [x] No source files or runtime importer state were changed.

Milestone 12 targeted validation: touched JS `node --check`, registry JSON parse,
`npm.cmd run check:rules`, required local smoke suite, `sdk-generic-repo-full-intake`,
`git diff --check`, and read-only CEP checks passed. Selection live lane/retry not run.

Milestone 13 targeted validation:

- [x] Initial Selection live lane failed closed because the running bridge daemon did
  not yet expose `set_layer_selection` to the panel validator.
- [x] `node scripts/cep-sync-health.js --check` showed installed CEP files in sync.
- [x] Restarted only the local `bridge-daemon.js` process from this repo.
- [x] `node scripts/cep-panel-cdp-smoke.js inspect` confirmed the panel reconnected.
- [x] `node scripts/cep-panel-cdp-smoke.js full-ui-agent-layer-selection-openai-cli-smoke`
  passed: planner accepted 8 steps / 5 mutating, dry run passed, protected run
  passed, semantic verification passed, and generated cleanup completed.
- [x] Scoped Full Intaker retry used exactly the 11 Selection ids from
  `plans/full-intake-unsafe-skip-triage.md` with `--max-items 1`, scoped
  `--resolution-candidate-ids`, and `--allow-self-improvement-lane-synthesis`.
- [x] All 11 Selection ids were requeued, reached `live_lane_ready`, then failed
  closed as `failed_import` during `run_importer_phase`; no source merge or commit
  was produced by the importer.
- [x] Compact status/proof showed `completed_no_candidates`, `changedPathCount:0`,
  `unplannedPathCount:0`, and zero related processes.

Milestone 14 targeted validation:

- [x] Context/status check completed; no active goal budget was reported by the
  Codex context tool. Branch `road-map-2.0` was ahead 7 and worktree was clean
  before the patch.
- [x] Active docs only were read before evidence review.
- [x] Compact failure evidence reviewed: full-intake status/proof, ledger Selection
  slice, queue-supervisor batch reports, importer result summaries, and one child
  result. All 11 failures shared the same Codex CLI argument error before model
  execution.
- [x] `cmd /d /s /c codex exec --help` confirmed Codex CLI 0.131.0 does not expose
  `--reasoning-effort`; existing local orchestrator lanes use
  `model_reasoning_effort` via `-c`.
- [x] Touched JS `node --check` passed for importer and three smoke files.
- [x] `node scripts/sdk-generic-repo-importer-command-smoke.js`,
  `node scripts/sdk-generic-repo-queue-supervisor-smoke.js`, and
  `node scripts/sdk-generic-repo-full-intake-smoke.js` passed.
- [x] `npm.cmd run check:rules`, required solution/provider/planning/semantic/
  reliability/prompt local smoke scripts, `node scripts/bridge-only-smoke-test.js`,
  `node scripts/smoke-test.js`, and `git diff --check` passed.

Not run by design: Selection retry, live CEP/AE lanes, broad/default CEP smoke,
Local/Ollama provider validation, old longrun, dependency/package changes, source
merge, push, or PR.

Milestone 15 targeted validation:

- [x] Context/status check completed; branch `road-map-2.0` was ahead 8 and clean
  before Milestone 15 work.
- [x] Added a narrow import-failure resolver for legacy Codex CLI
  `--reasoning-effort` child-run failures, guarded by compact child-run summary
  evidence: `failed_process`, exit code 2, zero changed/unplanned paths, and stderr
  containing `unexpected argument '--reasoning-effort'`.
- [x] `node --check orchestrator/run-generic-repo-full-intake.mjs`,
  `node --check scripts/sdk-generic-repo-full-intake-smoke.js`, and
  `node scripts/sdk-generic-repo-full-intake-smoke.js` passed.
- [x] First scoped retry requeued only `tool-selection-layer-selection-set`, then
  stopped with `blocked_target_dirty` before importer execution because the resolver
  patch was still uncommitted.
- [x] Resolver patch was committed as `9a3378c`.
- [x] Re-ran the same scoped Selection id with `--max-items 1`,
  `--resolution-candidate-ids tool-selection-layer-selection-set`,
  `--compact-json`, and `--no-commit`; phases completed through
  `select_candidate`, `prove_or_register_live_lane`, `run_importer_phase`,
  `controlled_merge`, and `non_live_validation`.
- [x] Importer proof after non-live validation showed `changedPathCount:4`,
  `unplannedPathCount:0`, and next phase `generated_only_live_rerun`.
- [x] Reviewed planned-path diff and confirmed the import added advisory typed-plan
  guidance only; no source JSX was copied.
- [x] `node --check scripts/solution-library-validation-smoke.js`,
  registry JSON parse, `node scripts/solution-registry-smoke.js`,
  `node scripts/solution-library-validation-smoke.js`, and `git diff --check`
  passed after controlled merge.
- [x] Required local smoke suite passed after controlled merge:
  `npm.cmd run check:rules`, provider/solution/project-intent/planning/semantic/
  reliability/ChatGPT connector/provider API/prompt optimization smokes,
  `node scripts/bridge-only-smoke-test.js`, and `node scripts/smoke-test.js`.

Not run by design: generated-only live rerun, live CEP/AE lanes, broad/default CEP
smoke, Local/Ollama provider validation, old longrun, unscoped retry,
dependency/package changes, push, or PR.

Milestone 16 targeted validation:

- [x] Context/status check completed; no active goal budget was reported by the
  Codex context tool. Branch `road-map-2.0` was ahead 10 and clean before work.
- [x] Active docs only were read before targeted readiness review.
- [x] Targeted marker ledger query confirmed the four triage Marker ids are still
  `blocked_or_skipped` with `unsafe_skip_tool_gap` because current marker typed
  tools cover layer markers, not composition markers.
- [x] Targeted registry/recipe review confirmed existing marker recipes and live
  lane coverage are for layer-marker workflows (`add_layer_marker` with
  `get_layer_details` read-back), not composition-marker transfer.
- [x] Updated `plans/full-intake-unsafe-skip-triage.md` and this active plan only;
  no source merge, importer retry, live lane, dependency/package change,
  Local/Ollama, push, or PR was run.
- [x] Required local validation suite passed: `git diff --check`,
  `npm.cmd run check:rules`, provider/solution/project-intent/planning/semantic/
  reliability/ChatGPT connector/provider API/prompt optimization smokes,
  `node scripts/bridge-only-smoke-test.js`, and `node scripts/smoke-test.js`.

## Handoff

Use `.codex/handoff.md` as the primary continuation record. Keep it compact and update
it after each completed milestone.
