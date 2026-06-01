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

- [x] Milestones 1-6: importer child-run guard stabilization (`39b36f5`),
  compact active-plan reset, camera-controller recovery review, provider
  self-test guardrail hardening plus installed-panel validation, and Agent
  Hardcore typed-tool handoff proof all completed with documented validation.
- [x] Milestones 7-14: bounded Full Intaker tail/retry work drained the old
  queue tails, scoped blocked live-lane synthesis, triaged unsafe skips, prepared
  and accepted the Selection lane, and patched the Codex CLI
  `--reasoning-effort` incompatibility. Historical detail is archived; no
  Local/Ollama, broad/default CEP smoke, dependency change, push, PR, old
  longrun, source merge outside runner, or `max-items > 1` was used.
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
- [x] Milestone 17: Selection longrun resumed under the current
  `run-generic-repo-full-intake` strict phase runner. `tool-selection-layer-selection-set`
  completed its pending generated-only live rerun and finalization, then the
  remaining ten Selection ids were scoped/requeued. `tool-selection-select-all-children`
  completed through import, controlled merge, non-live validation, generated-only
  live rerun, docs/handoff finalization, and commit. Both imported advisory
  typed-plan recipes use `set_layer_selection` with typed read-back; no source JSX
  was copied.
- [x] Milestone 18: Full Intaker compact longrun continuation. From a clean
  `cb8187a` baseline, the current strict phase runner advanced three queued
  candidates with `max-items 1`: `tool-project-rename-selected-layer-source`
  reached importer and failed closed with missing child summary,
  `tool-project-rename-source-to-layer-name` reached importer and failed closed
  with missing child summary, and
  `tool-keyframes-calculate-frames-to-selected-keyframe` reached live-lane-ready
  then stopped at the no-new-work context gate. A partial generated recipe from
  that failed budget stop was removed uncommitted; no source merge, validation
  pass, live rerun, Local/Ollama, broad/default CEP smoke, dependency change,
  push/PR, old longrun, or `max-items > 1` was run.
- [x] Milestone 19: Full Intaker context-budget tolerance bump. Per user
  direction, the strict full-intake runner's default context thresholds were raised
  by 20%: soft-stop 50 -> 60, no-new-work 55 -> 66, handoff 60 -> 72, hard-stop
  70 -> 84. Normal threshold caps were raised from handoff/hard-stop 80/90 to
  96/100 so explicit longrun overrides can use the wider budget. Context smoke
  coverage was updated to prove the new default no-new-work stop point.
- [x] Milestone 20: Full Intaker strict continuation to context handoff.
  `tool-markers-add-markers-at-selected-keyframes` selected, reached
  `live_lane_ready`, then failed closed at importer patch conflicts; the partial
  conflict was cleaned back to a clean tree. The next candidate,
  `tool-compositions-toggle-onion-skinning`, was selected, then work stopped
  before the next child-run because it would cross the handoff threshold.
- [x] Milestone 21: AUX compact child-run context protocol. On branch
  `codex/AUX-compact-child-run-context`, importer child runs now receive a bounded
  `child-run-context-pack` instead of expanding the full batch prompt into child
  stdin. Full-intake strict budget now uses a lightweight resume preflight gate
  plus compact child/import/live-rerun costs, so a generated-only live rerun at
  `58%` context can continue as a soft-stop `65%` prediction instead of failing
  early at a false `68%` no-new-work estimate.
- [x] Milestone 22: Full Intaker onion-skinning strict continuation.
  `tool-compositions-toggle-onion-skinning` advanced through
  `prove_or_register_live_lane`, `run_importer_phase`, `controlled_merge`, and
  `non_live_validation`. The runner added advisory typed-plan coverage for the
  existing `toggle_onion_skinning` bridge tool, with generated adjustment layer,
  `CC Wide Time` effect, comp comment token read-back, and fail-closed
  boundaries for raw/source-exact semantics, non-generated layer cleanup, global
  traversal, custom effect graphs, renderer settings, and unrelated
  layer/property edits. Work stopped before `generated_only_live_rerun` because
  context budget entered `resume_only_context_budget`.

## Current Dirty State

The AUX compact child-run context commit `7c73772` has been fast-forwarded into
the main `road-map-2.0` flow. Planned-path dirty changes remain for
`tool-compositions-toggle-onion-skinning`: the advisory recipe, solution
registry entry, solution-library validation smoke, compact plan update, and
`.codex/handoff.md`. The candidate is
`non_live_validation_complete` and waiting for `generated_only_live_rerun`.
No source JSX was copied. No live rerun, finalization commit, push, PR,
Local/Ollama, broad/default CEP smoke, dependency change, old longrun, full
runtime report, or `max-items > 1` was run.

## Next Milestone

Milestone 23: from a fresh safe context budget, continue the active strict
transaction for `tool-compositions-toggle-onion-skinning` at
`generated_only_live_rerun` using the AUX compact budget protocol, then let the
runner perform
`ledger_docs_handoff_commit_finalization` if the live rerun passes. Keep
Local/Ollama, broad/default CEP smoke, dependency changes, old longrun, full
runtime reports, source merge outside the runner, push/PR, and `max-items > 1`
out of scope.

## Decision Log

- 2026-05-27: Generic full-intake orchestrator processed `Selection/Select_All_Children.jsx` as `tool-selection-select-all-children`, keeping shared merge/validation/live/doc/commit gates serial and recording blocked candidates without stopping the whole queue (full-intake:full-intake-kyletmartinez:tool-selection-select-all-children).

- 2026-05-27: Generic full-intake orchestrator processed `Selection/Layer_Selection_Set.jsx` as `tool-selection-layer-selection-set`, keeping shared merge/validation/live/doc/commit gates serial and recording blocked candidates without stopping the whole queue (full-intake:full-intake-kyletmartinez:tool-selection-layer-selection-set).

- The old active plan was preserved as history rather than summarized in place, because
  it contained useful historical proof but was too large for safe active-context use.
- The active plan is now a baseline and queue pointer, not a complete execution log.
- Runtime artifacts are storage. New chats should read compact handoff/status
  first and open old reports only by exact path.
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
- Milestone 17 treated the user's longrun approval as approval for the current
  resumable full-intake strict phase runner and generated-only OpenAI CLI live
  reruns for scoped Selection candidates only. Local/Ollama, broad/default CEP
  smoke, dependency/package changes, push/PR, unscoped retry, and `max-items > 1`
  remain out of scope.
- AUX-021 adapted `Selection/Select_All_Children.jsx` as advisory typed-plan
  guidance only. The recipe selects direct children of one reviewed parent layer by
  deriving child `layerIndices` from current `get_comp_details` `parent.index`
  evidence, then using `set_layer_selection` replacement semantics and
  `get_selected_layers` read-back. Recursive descendants, fuzzy parent matching,
  child discovery without typed parent evidence, parenting changes, cross-comp or
  Project panel selection, and exact native UI/source JSX semantics remain separate
  typed-tool contracts.
- Milestone 18 treated child-summary timeouts as terminal failed imports for the
  current queued candidates, not as approval to continue broad recovery. The
  context-budget stop for `tool-keyframes-calculate-frames-to-selected-keyframe`
  was allowed to resolve only the already-started dirty state; the unvalidated
  generated recipe was removed rather than committed without registry integration,
  non-live validation, or generated-only live rerun.
- Milestone 19 interpreted "increase by 20% everywhere" as widening context-budget
  thresholds/caps, not inflating predicted step costs, because the problem was
  premature budget stops. The runner still requires explicit context percent for
  longrun work and still refuses unknown context before new work.
- Milestone 20 treated marker patch conflicts as failed importer output, not
  approval for manual source integration. The existing marker recipe/registry/smoke
  coverage stayed intact, so the partial patch was cleaned.
- The next onion-skinning phase was not started at predicted 63% because the
  following child-run would cross the widened 72% handoff threshold.
- Milestone 21 uses an AUX branch/worktree because the main worktree contains an
  unfinished Full Intaker transaction. The AUX commit was then fast-forwarded
  into `road-map-2.0`, leaving the candidate recipe/registry state uncommitted.
- Child-run stdin is now a compact context-pack protocol: full batch prompt stays
  as a hashed audit artifact, while the child receives bounded planned paths,
  candidate summaries, hard boundaries, and output contract.
- The first full-intake context gate is now a resume preflight instead of a
  duplicate abstract child-run charge. Actual phase gates still enforce their own
  costs and thresholds before importer, live-lane, live-rerun, docs, and commit.
- Milestone 22 treated `Compositions/Toggle_Onion_Skinning.jsx` as advisory
  typed-plan guidance only. Scope was derived from the current runner wrapper,
  the existing `toggle_onion_skinning` typed-tool contract, semantic
  verification, and the registered generated-only onion-skinning lane. The
  recipe uses `toggle_onion_skinning` instead of raw JSX and requires generated
  layer/effect plus comp comment token read-back.
- The generated-only live rerun was not started at `currentContextPercent:58`
  before the AUX compact budget merge because the old estimator predicted `68%`,
  crossing `noNewWorkPercent:66`.

## Validation

Milestones 2-9 targeted validation is archived in
`plans/archive/target-app-execplan-history-through-2026-05-31.md`. Compact outcome:
the active baseline reset, provider/CEP validation work, Hardcore handoff proof, and
bounded Full Intaker queue drain completed with documented guardrails.

The two completed Selection imports in Milestone 17 both passed through the current
`full-intake-kyletmartinez` strict flow: lane ready, recipe import, non-live
validation, generated-only live rerun, docs/handoff, and commit, with no
Local/Ollama, broad/default CEP smoke, dependency change, source checkout write
outside the runner, push, PR, or `max-items > 1`.

Milestones 10-17 compact validation: scoped blocked-lane resolution failed closed
without source/live mutation; unsafe-skip triage stayed docs-only; Selection
typed-tool/lane prep and live acceptance passed after a bridge restart; the
legacy Codex CLI `--reasoning-effort` bug was patched and smoke-validated;
`tool-selection-layer-selection-set` and `tool-selection-select-all-children`
completed through the strict runner with commits `3815db8` and `932cc7d`. No
Local/Ollama, broad/default CEP smoke, dependency change, push/PR, old longrun,
raw JSX copy, source merge outside the runner, or `max-items > 1` was used.
- [x] Milestone 18 ran compact status/proof/ledger checks, then advanced only
  strict `max-items 1` boundaries. `tool-project-rename-selected-layer-source`
  and `tool-project-rename-source-to-layer-name` failed closed at importer child
  summary timeouts. `tool-keyframes-calculate-frames-to-selected-keyframe` reached
  `live_lane_ready` and then hit `context-budget-noNewWorkPercent`; compact proof
  showed no unplanned paths after cleanup, and `git status` was clean before docs
  updates. No Local/Ollama, broad/default CEP smoke, dependency/package change,
  push/PR, full runtime report, old longrun, or `max-items > 1` was used.
- [x] Milestone 19 validation: `node --check` passed for
  `orchestrator/run-generic-repo-full-intake.mjs` and
  `scripts/sdk-generic-repo-full-intake-smoke.js`; the targeted
  `node scripts/sdk-generic-repo-full-intake-smoke.js` suite passed; `git diff
  --check` passed. No Local/Ollama, broad/default CEP smoke, dependency change,
  push/PR, old longrun, full runtime report, or real importer run was used.
- [x] Milestone 20 validation: active docs were read only from the approved set;
  compact status/proof/ledger checks passed before and after the strict runner
  steps. `tool-markers-add-markers-at-selected-keyframes` became terminal
  `failed_import`; `tool-compositions-toggle-onion-skinning` is selected for the
  next phase. `git status --short --branch` was clean after conflict cleanup. No
  Local/Ollama, broad/default CEP smoke, dependency change, push/PR, old longrun,
  full runtime report, source merge outside the runner, or `max-items > 1` was
  used.
- [x] Milestone 21 validation: `node --check` passed for
  `orchestrator/run-generic-repo-tool-importer.mjs`,
  `orchestrator/run-generic-repo-full-intake.mjs`, and
  `scripts/sdk-generic-repo-full-intake-smoke.js`; targeted
  `node scripts/sdk-generic-repo-full-intake-smoke.js` passed and proves compact
  context-pack creation plus `58% -> 65%` live-rerun soft-stop behavior. Required
  local smoke suite, importer smokes, `git diff --check`, and read-only
  `cep-panel-cdp-smoke.js inspect` / `connector-status-smoke` passed. No
  Local/Ollama, broad/default CEP smoke, dependency change, push, PR, old
  longrun, full runtime report, or `max-items > 1` was used.
- [x] Milestone 22 validation status: active docs only were read first, compact
  status/proof/ledger checks passed, and the runner completed
  `non_live_validation` for `tool-compositions-toggle-onion-skinning`. A final
  `generated_only_live_rerun` was not run because the runner entered
  `resume_only_context_budget` at `58% -> 68%` predicted context. No
  Local/Ollama, broad/default CEP smoke, dependency change, push/PR, old
  longrun, full runtime report, source merge outside the runner, or
  `max-items > 1` was used.

Not run by design across this compact block unless explicitly noted: Local/Ollama,
broad/default CEP smoke, dependency/package changes, push/PR, unscoped retry, old
longrun, raw JSX copy, source checkout writes outside the runner, and `max-items > 1`.

## Handoff

Use `.codex/handoff.md` as the primary continuation record. Keep it compact and update
it after each completed milestone.
