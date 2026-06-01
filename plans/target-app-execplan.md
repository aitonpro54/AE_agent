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

- [x] Full intake tool-keyframes-keyframe-current-value-from-expression: completed by reusable generic full-intake orchestrator (full-intake:full-intake-kyletmartinez:tool-keyframes-keyframe-current-value-from-expression); live gate ready, importer batch full-intake-kyletmartinez-e96375bafc-import, commit recorded after candidate commit.

- [x] Full intake tool-keyframes-fill-in-keyframes: completed by reusable generic full-intake orchestrator (full-intake:full-intake-kyletmartinez:tool-keyframes-fill-in-keyframes); live gate ready, importer batch full-intake-kyletmartinez-cc68b277f1-import, commit recorded after candidate commit.

- [x] Full intake tool-compositions-toggle-onion-skinning: completed by reusable generic full-intake orchestrator (full-intake:full-intake-kyletmartinez:tool-compositions-toggle-onion-skinning); live gate ready, importer batch full-intake-kyletmartinez-f67a738f74-import, commit recorded after candidate commit.

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
- [x] Milestone 23: AUX-021 detached importer child-run for
  `tool-keyframes-fill-in-keyframes`. Added advisory typed-plan coverage for the
  existing `fill_in_keyframes` bridge tool, requiring current selected-property
  or explicit property evidence, one reviewed target property, bounded
  `startTime`/`endTime`/`sampleEveryFrames`, reviewed `removeRedundant` and
  `clearExpression` choices, sampled linear keyframe write evidence, and
  `get_layer_details` read-back for keyframes plus expression state. The child
  worktree did not contain the source JSX, so no source JSX was copied and
  exact source semantics, broad expression conversion, multi-property batch
  baking, interpolation/ease preservation, spatial tangents, unsupported value
  shapes, arbitrary expression edits, and selection side effects remain
  fail-closed typed-tool gaps.
- [x] Milestone 24: Full Intaker strict continuation recovered and completed
  `tool-keyframes-fill-in-keyframes` through the current strict runner after the
  bridge was brought online. Commit `477f9e0` completed the candidate; the
  earlier `blocked_target_dirty` note is stale relative to the completed run.
- [x] Milestone 25: AUX-021 detached importer child-run for
  `tool-keyframes-keyframe-current-value-from-expression`. Added advisory
  recipe/registry/retrieval-smoke metadata for existing
  `keyframe_current_value_from_expression`: one evidence-backed property,
  reviewed time/`requireExpression`, keyframe read-back; no source JSX copied.
- [x] Milestone 26: Full Intaker strict continuation completed
  `tool-keyframes-keyframe-current-value-from-expression` through live rerun,
  docs/handoff finalization, and commit `01edf5a`.
- [ ] Milestone 27: Full Intaker strict continuation selected
  `tool-keyframes-set-spacial-in-tanget` and proved its live lane ready, then
  stopped before `run_importer_phase` because the strict context gate entered
  `resume_only_context_budget` at `59% -> 66%`.
- [x] Milestone 28: Full Intaker context-budget tolerance bump, second pass.
  Per user direction, the strict runner defaults were raised another 20% from
  the current values: soft-stop `60 -> 72`, no-new-work `66 -> 80`, handoff
  `72 -> 86`, hard-stop `84 -> 100`; the normal handoff cap is now `100`.

## Current Dirty State

The active source change is Milestone 28's threshold bump in
`orchestrator/run-generic-repo-full-intake.mjs` plus matching smoke coverage in
`scripts/sdk-generic-repo-full-intake-smoke.js`. Branch `road-map-2.0` was ahead
of `ae-agent/road-map-2.0` by two local commits before this milestone; do not
push without explicit approval. The active strict transaction remains
`tool-keyframes-set-spacial-in-tanget`, with `select_candidate` and
`prove_or_register_live_lane` complete; no importer child-run has started for
that candidate.

## Next Milestone

Milestone 27 continuation after the threshold bump: resume only the active
`tool-keyframes-set-spacial-in-tanget` strict transaction from a fresh context,
starting at `run_importer_phase` through the current
`run-generic-repo-full-intake` strict runner with `max-items 1`, compact output,
and an explicit conservative `--context-percent`. Stop again on any budget,
dirty-target, importer, live-lane, live-rerun, or approval boundary. Keep
Local/Ollama, broad/default CEP smoke, dependency changes, push/PR, old longrun
flows, source merge outside the runner, full runtime reports, and `max-items > 1`
out of scope.

## Decision Log

- 2026-05-27: Generic full-intake orchestrator processed `Keyframes/Keyframe_Current_Value_From_Expression.jsx` as `tool-keyframes-keyframe-current-value-from-expression`, keeping shared merge/validation/live/doc/commit gates serial and recording blocked candidates without stopping the whole queue (full-intake:full-intake-kyletmartinez:tool-keyframes-keyframe-current-value-from-expression).

- 2026-05-27: Generic full-intake orchestrator processed `Keyframes/Fill_In_Keyframes.jsx` as `tool-keyframes-fill-in-keyframes`, keeping shared merge/validation/live/doc/commit gates serial and recording blocked candidates without stopping the whole queue (full-intake:full-intake-kyletmartinez:tool-keyframes-fill-in-keyframes).

- 2026-05-27: Generic full-intake orchestrator processed `Compositions/Toggle_Onion_Skinning.jsx` as `tool-compositions-toggle-onion-skinning`, keeping shared merge/validation/live/doc/commit gates serial and recording blocked candidates without stopping the whole queue (full-intake:full-intake-kyletmartinez:tool-compositions-toggle-onion-skinning).

- 2026-05-27: Generic full-intake orchestrator processed `Selection/Select_All_Children.jsx` as `tool-selection-select-all-children`, keeping shared merge/validation/live/doc/commit gates serial and recording blocked candidates without stopping the whole queue (full-intake:full-intake-kyletmartinez:tool-selection-select-all-children).

- 2026-05-27: Generic full-intake orchestrator processed `Selection/Layer_Selection_Set.jsx` as `tool-selection-layer-selection-set`, keeping shared merge/validation/live/doc/commit gates serial and recording blocked candidates without stopping the whole queue (full-intake:full-intake-kyletmartinez:tool-selection-layer-selection-set).

- Historical decisions through Milestone 20 are archived or summarized above.
  The continuing rules are: compact handoff/status first, runtime artifacts only
  by exact path, bounded `max-items 1` strict phases, no source JSX copy, no
  Local/Ollama unless explicitly requested, and no broad/default CEP smoke,
  dependency change, push, PR, or source merge outside the runner without
  approval.
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
- Milestone 23 treated `Keyframes/Fill_In_Keyframes.jsx` as advisory typed-plan
  guidance only. The detached child worktree did not include the source JSX, so
  scope was derived from the child-run wrapper, candidate name, existing
  `fill_in_keyframes` contract, semantic verification, and the registered
  `fill-in-keyframes-expression-sampling` generated-only lane.
- `fill_in_keyframes` guidance is limited to one evidence-backed property and a
  reviewed finite sampling range. Broad expression conversion, batch property
  baking, exact source UI/selection behavior, unsupported value shapes,
  interpolation/ease preservation, spatial tangents, arbitrary expression edits,
  and unrelated layer/property mutations remain separate typed-tool contracts.
- Milestone 24 treated the failed live rerun as an environmental/connectivity
  blocker, not approval to retry broadly or start the next candidate. Read-only
  preflights passed, but the required generated-only OpenAI CLI lane failed with
  `bridge_offline / bridge_offline` and instructed that the local bridge should
  be started from Codex and connected before rerun.
- After the user challenged the bridge start assumption, Codex started the bridge
  itself using the project daemon on port `3456`. Health confirmed the daemon
  and CEP panel connection. The subsequent strict runner attempt exposed a
  separate runner-state blocker: failed-live-rerun transactions are terminal in
  the ledger, so the next preflight attempted candidate selection and refused
  the still-dirty recipe as unplanned.
- Milestone 25 mapped `Keyframes/Keyframe_Current_Value_From_Expression.jsx` to
  existing `keyframe_current_value_from_expression` advisory guidance only;
  range baking, batch keyframing, expression edits, interpolation/ease/tangent
  preservation, selection side effects, and exact source semantics stay
  separate fail-closed contracts.
- Milestone 27 stopped before starting a new importer child-run when the strict
  runner predicted `59% -> 66%` and entered `resume_only_context_budget`; this
  is a context handoff, not a candidate failure.
- Milestone 28 interprets the user's second "raise thresholds by 20% everywhere"
  as widening the existing default gates again, clamped at the absolute context
  ceiling: `72/80/86/100`, with normal caps `100/100`. Predicted step costs stay
  unchanged.

## Validation

- Full intake completed candidates in this compact block:
  `tool-compositions-toggle-onion-skinning`, `tool-keyframes-fill-in-keyframes`,
  and `tool-keyframes-keyframe-current-value-from-expression` all passed lane
  proof, import, non-live validation, generated-only live rerun, docs/handoff,
  and commit through `full-intake-kyletmartinez`, with no Local/Ollama,
  fallback provider, dependency change, raw JSX copy, broad CEP smoke, push, PR,
  or GitHub automation.

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
- [x] Milestones 18-25 compact validation: strict runner/status/proof/ledger
  checks were used at bounded phase boundaries; context stops, failed imports,
  bridge recovery, and detached AUX child-run work stayed within recorded
  guardrails. No Local/Ollama, broad/default CEP smoke, dependency change,
  push/PR, old longrun, full runtime report, source merge outside the runner,
  or `max-items > 1` was used unless explicitly noted above.
- [x] Milestone 26 validation status: strict runner completed
  `tool-keyframes-keyframe-current-value-from-expression`: live lane `ready`,
  importer batch `full-intake-kyletmartinez-e96375bafc-import`, non-live
  validation complete, generated-only live rerun `passed`, docs/handoff
  finalization complete, commit `01edf5a`. Compact proof
  `e2d99a6f6a6ab980d89e793264c61d3ee8979976adf6bb18900b03a2effa9d25`;
  ledger after commit was `completed:58`, `queued:11`, `failed_import:11`, no
  queued `live_lane_needed`.
- [ ] Milestone 27 validation status: compact status/proof/ledger checks passed;
  `tool-keyframes-set-spacial-in-tanget` completed `select_candidate` and
  `prove_or_register_live_lane` (`liveLaneStatus: ready`). The next
  `run_importer_phase` invocation stopped before child-run with
  `resume_only_context_budget`, reason `context-budget-noNewWorkPercent`,
  predicted `59% -> 66%`. Compact proof
  `5442033df18d32ae23f96c3754589fcefb1674c288c053a48c64b50ca32e13e5`,
  changedPathCount `0`, unplannedPathCount `0`. No Local/Ollama,
  broad/default CEP smoke, dependency change, push/PR, old longrun, full runtime
  report, source merge outside the runner, or `max-items > 1` was used.
- [x] Milestone 28 validation status: `node --check` passed for
  `orchestrator/run-generic-repo-full-intake.mjs` and
  `scripts/sdk-generic-repo-full-intake-smoke.js`; targeted
  `node scripts/sdk-generic-repo-full-intake-smoke.js` passed. No Local/Ollama,
  broad/default CEP smoke, live AE/CEP mutation, dependency change, push/PR, old
  longrun, full runtime report, or `max-items > 1` was used.

Not run by design across this compact block unless explicitly noted: Local/Ollama,
broad/default CEP smoke, dependency/package changes, push/PR, unscoped retry, old
longrun, raw JSX copy, source checkout writes outside the runner, and `max-items > 1`.

## Handoff

Use `.codex/handoff.md` as the primary continuation record. Keep it compact and update
it after each completed milestone.
