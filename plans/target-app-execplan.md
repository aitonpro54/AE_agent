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

- [x] Full intake tool-selection-select-unparented-layers: completed by reusable generic full-intake orchestrator (full-intake:full-intake-kyletmartinez:tool-selection-select-unparented-layers); live gate ready, importer batch full-intake-kyletmartinez-1a580a2ad2-import, commit recorded after candidate commit.

- [x] Full intake tool-selection-select-text-layers: completed by reusable generic full-intake orchestrator (full-intake:full-intake-kyletmartinez:tool-selection-select-text-layers); live gate ready, importer batch full-intake-kyletmartinez-c3ab0053fd-import, commit recorded after candidate commit.

- [x] Full intake tool-selection-select-shape-layers: completed by reusable generic full-intake orchestrator (full-intake:full-intake-kyletmartinez:tool-selection-select-shape-layers); live gate ready, importer batch full-intake-kyletmartinez-866c41c866-import, commit recorded after candidate commit.

- [x] Full intake tool-selection-select-random-layers: completed by reusable generic full-intake orchestrator (full-intake:full-intake-kyletmartinez:tool-selection-select-random-layers); live gate ready, importer batch full-intake-kyletmartinez-7f7579d021-import, commit recorded after candidate commit.

- [x] Full intake tool-selection-select-parent-layer: completed by reusable generic full-intake orchestrator (full-intake:full-intake-kyletmartinez:tool-selection-select-parent-layer); live gate ready, importer batch full-intake-kyletmartinez-10b9e46e9b-import, commit recorded after candidate commit.

- [x] Full intake tool-selection-select-non-null-layers: completed by reusable generic full-intake orchestrator (full-intake:full-intake-kyletmartinez:tool-selection-select-non-null-layers); live gate ready, importer batch full-intake-kyletmartinez-a118acc0e4-import, commit recorded after candidate commit.

- [x] Full intake tool-selection-select-layers-below-label: completed by reusable generic full-intake orchestrator (full-intake:full-intake-kyletmartinez:tool-selection-select-layers-below-label); live gate ready, importer batch full-intake-kyletmartinez-e5ce7e11d7-import, commit recorded after candidate commit.

- [x] Historical milestones 1-30: archived/summarized baseline, provider work,
  strict-runner hardening, context-budget tuning, lane prep, and completed
  Full Intaker candidates through properties/keyframes/onion-skinning.
- [x] Milestone 31: `tool-selection-select-disabled-layers` completed through
  strict Full Intaker lane proof, importer, controlled merge, non-live
  validation, generated-only live rerun, docs/handoff finalization, and commit
  `4fa888bf38471d4430071ec8a4235b2f4740a169`.
- [x] Milestone 32: `tool-selection-select-guide-layers` completed through the
  same strict flow and commit `678a44781a6ba8ba1c1836f5ed9cd9cfb5ebb72e`.
- [x] Active plan compacted after Milestone 32 because runner-written detail
  pushed the file above the 32 KB hard cap.
- [x] AUX-021 detached importer child-run batch
  `queue-batch-1-2c946048a6`: drafted advisory typed-plan import for
  `tool-selection-select-layers-below-label` in the importer-owned detached
  worktree only. No source merge, commit, validation run, live AE/CEP lane, or
  provider call was performed by design.
- [x] AUX-021 detached importer child-run batch
  `queue-batch-1-b3f28610bc`: drafted advisory typed-plan import for
  `tool-selection-select-non-null-layers` in the importer-owned detached
  worktree only. No source merge, commit, validation run, live AE/CEP lane, or
  provider call was performed by design.
- [x] AUX-021 detached importer child-run batch
  `queue-batch-1-978e9e7c80`: drafted advisory typed-plan import for
  `tool-selection-select-parent-layer` in the importer-owned detached worktree
  only. No source merge, commit, validation run, live AE/CEP lane, or provider
  call was performed by design.
- [x] AUX-021 detached importer child-run batch
  `queue-batch-1-7fd2104010`: drafted advisory typed-plan import for
  `tool-selection-select-random-layers` in the importer-owned detached worktree
  only. No source merge, commit, validation run, live AE/CEP lane, provider
  call, Local/Ollama, push, or PR was performed by design.
- [x] AUX-021 detached importer child-run batch
  `queue-batch-1-b77226da32`: drafted advisory typed-plan import for
  `tool-selection-select-shape-layers` in the importer-owned detached worktree
  only. No source merge, commit, validation run, live AE/CEP lane, provider
  call, Local/Ollama, push, or PR was performed by design.
- [x] AUX-021 detached importer child-run batch
  `queue-batch-1-1a37311d0a`: drafted advisory typed-plan import for
  `tool-selection-select-text-layers` in the importer-owned detached worktree
  only. No source merge, commit, validation run, live AE/CEP lane, provider
  call, Local/Ollama, push, or PR was performed by design.
- [x] AUX-021 detached importer child-run batch
  `queue-batch-1-6482cb9bef`: drafted advisory typed-plan import for
  `tool-selection-select-unparented-layers` in the importer-owned detached
  worktree only. No source merge, commit, validation run, live AE/CEP lane,
  provider call, Local/Ollama, push, or PR was performed by design.
- [x] AUX parallel candidate worktrees architecture: added explicit opt-in
  scheduling for detached run-owned candidate worktrees, stable proposal schema
  `generic-repo-full-intake.parallel-candidate-proposal.v1`, and a serial
  parent reducer for structured recipe/registry/smoke merges. Default Full
  Intaker serial behavior remains unchanged.

## Current State

`full-intake-kyletmartinez` is clean after completing two Selection candidates in
this thread. Compact ledger after Milestone 32: `completed:62`, `queued:7`,
`failed_import:11`, `blocked_live_lane_synthesis_incomplete:9`,
`blocked_or_skipped:64`, `recovered_patch_non_live_validated_pending_semantic_review:1`.
Branch `road-map-2.0` is ahead of `ae-agent/road-map-2.0`; do not push without
explicit approval.

Detached child-run note: `queue-batch-1-2c946048a6` now contains the
`select-layers-below-label-typed-plan` advisory recipe, registry entry, and
solution-library smoke expectations. The parent importer still owns source-merge
application, validation, proof capture, and any live/generated-only acceptance.
Detached child-run note: `queue-batch-1-b3f28610bc` now contains the
`select-non-null-layers-typed-plan` advisory recipe, registry entry, and
solution-library smoke expectations. The parent importer still owns source-merge
application, validation, proof capture, and any live/generated-only acceptance.
Detached child-run note: `queue-batch-1-978e9e7c80` now contains the
`select-parent-layer-typed-plan` advisory recipe, registry entry, and
solution-library smoke expectations. The parent importer still owns source-merge
application, validation, proof capture, and any live/generated-only acceptance.
Detached child-run note: `queue-batch-1-7fd2104010` now contains the
`select-random-layers-typed-plan` advisory recipe, registry entry, and
solution-library smoke expectations. The recipe requires current active-comp
layer inventory, a reviewed deterministic `randomSelectionPolicy`, computed
`randomLayerIndices`, replacement `set_layer_selection`, and
`get_selected_layers` read-back. The parent importer still owns source-merge
application, validation, proof capture, and any live/generated-only acceptance.
Detached child-run note: `queue-batch-1-b77226da32` now contains the
`select-shape-layers-typed-plan` advisory recipe, registry entry, and
solution-library smoke expectations. The recipe requires current active-comp
layer inventory with typed shape-layer evidence (`shapeLayer:true`,
`layerKind:"shape"`, `type:"shape"`, or equivalent), computed
`shapeLayerIndices`, replacement `set_layer_selection`, and
`get_selected_layers` read-back. The parent importer still owns source-merge
application, validation, proof capture, and any live/generated-only acceptance.
Detached child-run note: `queue-batch-1-1a37311d0a` now contains the
`select-text-layers-typed-plan` advisory recipe, registry entry, and
solution-library smoke expectations. The recipe requires current active-comp
layer inventory with typed text-layer evidence (`textLayer:true`,
`layerKind:"text"`, `type:"text"`, `sourceText` capability, or equivalent),
computed `textLayerIndices`, replacement `set_layer_selection`, and
`get_selected_layers` read-back. The parent importer still owns source-merge
application, validation, proof capture, and any live/generated-only acceptance.
Detached child-run note: `queue-batch-1-6482cb9bef` now contains the
`select-unparented-layers-typed-plan` advisory recipe, registry entry, and
solution-library smoke expectations. The recipe requires current active-comp
layer inventory with typed no-parent evidence (`parentLayerIndex:null`,
`parentLayerIndex:0`, `parentIndex:null`, `parentIndex:0`, empty `parentName`,
or equivalent), computed `unparentedLayerIndices`, replacement
`set_layer_selection`, and `get_selected_layers` read-back. The parent importer
still owns source-merge application, validation, proof capture, and any
live/generated-only acceptance.
`.codex/handoff.md` creation for batch `queue-batch-1-b77226da32` was attempted
but blocked by workspace write policy (`apply_patch` rejected the hidden path),
so this active-plan note is the durable handoff substitute for the batch.
`.codex/handoff.md` creation for batch `queue-batch-1-7fd2104010` was attempted
but blocked by workspace write policy (`apply_patch` rejected the hidden path
and PowerShell returned AccessDenied), so this active-plan note is the durable
handoff substitute for the batch.
`.codex/handoff.md` creation for batch `queue-batch-1-b3f28610bc` was attempted but
blocked by workspace write policy (`apply_patch` rejected the hidden path and
PowerShell returned AccessDenied), so this active-plan note is the durable
handoff substitute for the batch.
`.codex/handoff.md` creation for batch `queue-batch-1-1a37311d0a` was attempted
but blocked by workspace write policy (`apply_patch` rejected the hidden path
and PowerShell returned AccessDenied), so this active-plan note is the durable
handoff substitute for the batch.
`.codex/handoff.md` creation for batch `queue-batch-1-6482cb9bef` was attempted
but blocked by workspace write policy (`apply_patch` rejected the hidden path
and PowerShell returned AccessDenied), so this active-plan note is the durable
handoff substitute for the batch.

AUX parallel architecture work in this thread did not process queued candidates
from `full-intake-kyletmartinez`. It only touched orchestrator logic, fixture
smoke coverage, retrieval scoring, this plan, and `.codex/handoff.md`.

## Next Milestone

Resume the Full Intaker queue in a fresh thread because runner-estimated context
after Milestone 32 reached the prepare-handoff zone (`64%`). Start with active
docs and compact status/proof/ledger checks, then let the strict runner select
or resume the next queued candidate with `max-items 1`, compact output, and an
explicit conservative `--context-percent`. Expected remaining queued Selection
ids: `tool-selection-select-layers-below-label`,
`tool-selection-select-non-null-layers`, `tool-selection-select-parent-layer`,
`tool-selection-select-random-layers`, `tool-selection-select-shape-layers`,
`tool-selection-select-text-layers`, and `tool-selection-select-unparented-layers`.
Stop on any budget, dirty-target, importer, live-lane, live-rerun, or approval
boundary. Keep Local/Ollama, broad/default CEP smoke, dependency changes,
push/PR, old longrun flows, source merge outside the runner, full runtime
reports, and `max-items > 1` out of scope.

## Decision Log

- 2026-05-27: Generic full-intake orchestrator processed `Selection/Select_Unparented_Layers.jsx` as `tool-selection-select-unparented-layers`, keeping shared merge/validation/live/doc/commit gates serial and recording blocked candidates without stopping the whole queue (full-intake:full-intake-kyletmartinez:tool-selection-select-unparented-layers).

- 2026-05-27: Generic full-intake orchestrator processed `Selection/Select_Text_Layers.jsx` as `tool-selection-select-text-layers`, keeping shared merge/validation/live/doc/commit gates serial and recording blocked candidates without stopping the whole queue (full-intake:full-intake-kyletmartinez:tool-selection-select-text-layers).

- 2026-05-27: Generic full-intake orchestrator processed `Selection/Select_Shape_Layers.jsx` as `tool-selection-select-shape-layers`, keeping shared merge/validation/live/doc/commit gates serial and recording blocked candidates without stopping the whole queue (full-intake:full-intake-kyletmartinez:tool-selection-select-shape-layers).

- 2026-05-27: Generic full-intake orchestrator processed `Selection/Select_Random_Layers.jsx` as `tool-selection-select-random-layers`, keeping shared merge/validation/live/doc/commit gates serial and recording blocked candidates without stopping the whole queue (full-intake:full-intake-kyletmartinez:tool-selection-select-random-layers).

- 2026-05-27: Generic full-intake orchestrator processed `Selection/Select_Parent_Layer.jsx` as `tool-selection-select-parent-layer`, keeping shared merge/validation/live/doc/commit gates serial and recording blocked candidates without stopping the whole queue (full-intake:full-intake-kyletmartinez:tool-selection-select-parent-layer).

- 2026-05-27: Generic full-intake orchestrator processed `Selection/Select_Non-Null_Layers.jsx` as `tool-selection-select-non-null-layers`, keeping shared merge/validation/live/doc/commit gates serial and recording blocked candidates without stopping the whole queue (full-intake:full-intake-kyletmartinez:tool-selection-select-non-null-layers).

- 2026-05-27: Generic full-intake orchestrator processed `Selection/Select_Layers_Below_Label.jsx` as `tool-selection-select-layers-below-label`, keeping shared merge/validation/live/doc/commit gates serial and recording blocked candidates without stopping the whole queue (full-intake:full-intake-kyletmartinez:tool-selection-select-layers-below-label).

- Historical decisions through Milestone 30 are archived or compactly summarized
  above. Continuing guardrails remain: compact status/proof/ledger first,
  bounded strict phases, one writer, no source JSX copy, no Local/Ollama unless
  explicitly requested, and no broad/default CEP smoke, dependency change,
  push/PR, or source merge outside the runner without approval.
- Milestones 31-32 treated disabled-layer and guide-layer Selection scripts as
  advisory typed-plan guidance only. Both use existing active-comp inventory,
  `set_layer_selection`, and `get_selected_layers` read-back. Disabled/guide
  discovery requires typed evidence (`enabled:false` or `guideLayer:true`, or
  equivalent typed state); state toggling, generated guide creation, fuzzy
  matching, cross-comp/Project panel selection, layer edits, and exact native
  UI/source semantics stay fail-closed.
- The next seven queued candidates remain Selection-family retries. Layer-timing
  and effect/property terminal families should not be requeued without their own
  narrow generated-only lane or milestone.
- The thread stopped after Milestone 32 because runner-estimated context reached
  `64%` and the active plan exceeded the 32 KB hard cap before compaction.
- AUX-021 child-run adapted `Select_Layers_Below_Label` as fail-closed Selection
  advisory guidance because the source JSX was not present in the detached
  worktree. The recipe requires current active-comp layer inventory, explicit
  reviewed `anchorLayerIndex` or typed label evidence, computed below-anchor
  layer indices, replacement `set_layer_selection`, and `get_selected_layers`
  read-back. Source-exact label-color scanning, label mutation, fuzzy matching,
  cross-comp/Project panel selection, selecting layers above the anchor, and
  native UI side effects require a separate typed-tool contract.
- AUX-021 child-run adapted `Select_Non-Null_Layers` as fail-closed Selection
  advisory guidance. The recipe requires current active-comp layer inventory
  with `nullLayer:false`, `isNull:false`, or equivalent typed non-null evidence,
  computed `nonNullLayerIndices`, replacement `set_layer_selection`, and
  `get_selected_layers` read-back. Null-layer creation/conversion/deletion,
  fuzzy name/type matching, cross-comp/Project panel selection, and exact native
  UI/source semantics require a separate typed-tool contract.
- AUX-021 child-run adapted `Select_Parent_Layer` as fail-closed Selection
  advisory guidance. The recipe requires current active-comp selected-child
  evidence, layer inventory with `parentLayerIndex`, `parentIndex`,
  `parentName` paired with a unique same-comp layer, or equivalent typed parent
  evidence, computed deduplicated `parentLayerIndices`, replacement
  `set_layer_selection`, and `get_selected_layers` read-back. Parent-link
  mutation, recursive ancestor selection, child/descendant selection, fuzzy
  matching, cross-comp/Project panel selection, and exact native UI/source
  semantics require a separate typed-tool contract.
- AUX-021 child-run adapted `Select_Random_Layers` as fail-closed Selection
  advisory guidance. The source JSX was not present in this detached worktree,
  so the recipe adapts only the candidate idea through existing typed tools. It
  requires current active-comp layer inventory, a reviewed deterministic
  `randomSelectionPolicy`, computed concrete `randomLayerIndices`, replacement
  `set_layer_selection`, and `get_selected_layers` read-back. Mutation-time
  nondeterminism, native random UI semantics, seed persistence, weighted or
  type-specific random selection, cross-comp/Project panel selection, and exact
  native UI/source semantics require a separate typed-tool contract.
- AUX-021 child-run adapted `Select_Shape_Layers` as fail-closed Selection
  advisory guidance. The source JSX was not present in this detached worktree,
  so the recipe adapts only the candidate idea through existing typed tools. It
  requires current active-comp layer inventory with typed shape-layer evidence,
  computed concrete `shapeLayerIndices`, replacement `set_layer_selection`, and
  `get_selected_layers` read-back. Shape-layer creation/conversion, shape
  content inspection, fuzzy matching, cross-comp/Project panel selection, and
  exact native UI/source semantics require a separate typed-tool contract.
- AUX-021 child-run adapted `Select_Text_Layers` as fail-closed Selection
  advisory guidance. The source JSX was not present in this detached worktree,
  so the recipe adapts only the candidate idea through existing typed tools. It
  requires current active-comp layer inventory with typed text-layer evidence
  (`textLayer:true`, `layerKind:"text"`, `type:"text"`, `sourceText`
  capability, or equivalent), computed concrete `textLayerIndices`,
  replacement `set_layer_selection`, and `get_selected_layers` read-back. Text
  layer creation/conversion, source text inspection or edits, text
  animator/property selection, fuzzy matching, cross-comp/Project panel
  selection, and exact native UI/source semantics require a separate typed-tool
  contract.
- AUX-021 child-run adapted `Select_Unparented_Layers` as fail-closed Selection
  advisory guidance. The source JSX was not present in this detached worktree,
  so the recipe adapts only the candidate idea through existing typed tools. It
  requires current active-comp layer inventory with typed no-parent evidence
  (`parentLayerIndex:null`, `parentLayerIndex:0`, `parentIndex:null`,
  `parentIndex:0`, empty `parentName`, or equivalent), computed concrete
  `unparentedLayerIndices`, replacement `set_layer_selection`, and
  `get_selected_layers` read-back. Parent-link assignment/clearing/change,
  recursive hierarchy traversal, child/descendant selection, fuzzy matching,
  cross-comp selection, project-panel selection, and exact source JSX/native UI
  semantics require a separate typed-tool contract.
- 2026-06-02: AUX parallel candidate worktrees are opt-in only. Child candidate
  worktrees are detached and run-owned under `.codex-runtime/.../<run-id>/`,
  may emit proposals, and must not own central ledger, registry, plan, handoff,
  commits, dependency/package changes, Local/Ollama, fallback providers, or live
  CEP/AE/generated-only reruns. The parent reducer is the only central writer
  and rejects unplanned paths, forbidden central writes, dependency/package
  changes, raw JSX copy, stale base heads, duplicate recipe paths, duplicate
  registry ids, missing proof hashes, and child-required live reruns.
- 2026-06-02: While running the required solution-library validation, a stale
  retrieval-ranking failure showed mutating Selection recipes outranking the
  read-only `layer-selection-get-typed-plan` for a prompt that explicitly said
  "without changing selection". Added a narrow read-only prompt preference
  penalty for mutating hints instead of weakening the smoke expectation.

## Validation

| Full intake tool-selection-select-unparented-layers | Required to let one top-level generic repo intake run handle lane proof, recipe import, non-live validation, generated-only live rerun, ledger update, docs/handoff, and commit for this queued candidate. | Passed in run `full-intake-kyletmartinez`: live lane `ready`, batch `full-intake-kyletmartinez-1a580a2ad2-import`, live rerun `passed`, commit `recorded after candidate commit`. No Local/Ollama, fallback provider, dependency/package change, raw JSX copy, source checkout write, broad CEP smoke, push, PR, or GitHub automation was performed. |

| Full intake tool-selection-select-text-layers | Required to let one top-level generic repo intake run handle lane proof, recipe import, non-live validation, generated-only live rerun, ledger update, docs/handoff, and commit for this queued candidate. | Passed in run `full-intake-kyletmartinez`: live lane `ready`, batch `full-intake-kyletmartinez-c3ab0053fd-import`, live rerun `passed`, commit `recorded after candidate commit`. No Local/Ollama, fallback provider, dependency/package change, raw JSX copy, source checkout write, broad CEP smoke, push, PR, or GitHub automation was performed. |

| Full intake tool-selection-select-shape-layers | Required to let one top-level generic repo intake run handle lane proof, recipe import, non-live validation, generated-only live rerun, ledger update, docs/handoff, and commit for this queued candidate. | Passed in run `full-intake-kyletmartinez`: live lane `ready`, batch `full-intake-kyletmartinez-866c41c866-import`, live rerun `passed`, commit `recorded after candidate commit`. No Local/Ollama, fallback provider, dependency/package change, raw JSX copy, source checkout write, broad CEP smoke, push, PR, or GitHub automation was performed. |

| Full intake tool-selection-select-random-layers | Required to let one top-level generic repo intake run handle lane proof, recipe import, non-live validation, generated-only live rerun, ledger update, docs/handoff, and commit for this queued candidate. | Passed in run `full-intake-kyletmartinez`: live lane `ready`, batch `full-intake-kyletmartinez-7f7579d021-import`, live rerun `passed`, commit `recorded after candidate commit`. No Local/Ollama, fallback provider, dependency/package change, raw JSX copy, source checkout write, broad CEP smoke, push, PR, or GitHub automation was performed. |

| Full intake tool-selection-select-parent-layer | Required to let one top-level generic repo intake run handle lane proof, recipe import, non-live validation, generated-only live rerun, ledger update, docs/handoff, and commit for this queued candidate. | Passed in run `full-intake-kyletmartinez`: live lane `ready`, batch `full-intake-kyletmartinez-10b9e46e9b-import`, live rerun `passed`, commit `recorded after candidate commit`. No Local/Ollama, fallback provider, dependency/package change, raw JSX copy, source checkout write, broad CEP smoke, push, PR, or GitHub automation was performed. |

| Full intake tool-selection-select-non-null-layers | Required to let one top-level generic repo intake run handle lane proof, recipe import, non-live validation, generated-only live rerun, ledger update, docs/handoff, and commit for this queued candidate. | Passed in run `full-intake-kyletmartinez`: live lane `ready`, batch `full-intake-kyletmartinez-a118acc0e4-import`, live rerun `passed`, commit `recorded after candidate commit`. No Local/Ollama, fallback provider, dependency/package change, raw JSX copy, source checkout write, broad CEP smoke, push, PR, or GitHub automation was performed. |

| Full intake tool-selection-select-layers-below-label | Required to let one top-level generic repo intake run handle lane proof, recipe import, non-live validation, generated-only live rerun, ledger update, docs/handoff, and commit for this queued candidate. | Passed in run `full-intake-kyletmartinez`: live lane `ready`, batch `full-intake-kyletmartinez-e5ce7e11d7-import`, live rerun `passed`, commit `recorded after candidate commit`. No Local/Ollama, fallback provider, dependency/package change, raw JSX copy, source checkout write, broad CEP smoke, push, PR, or GitHub automation was performed. |

- Milestones 31-32 compact status/proof/ledger checks passed at each strict
  boundary. Both candidates completed lane proof, importer, controlled merge,
  non-live validation, generated-only live rerun, docs/handoff finalization, and
  commit through `full-intake-kyletmartinez`.
- `tool-selection-select-disabled-layers`: batch
  `full-intake-kyletmartinez-3679a3de35-import`, live rerun `passed`, commit
  `4fa888bf38471d4430071ec8a4235b2f4740a169`.
- `tool-selection-select-guide-layers`: batch
  `full-intake-kyletmartinez-c4fe4ae12d-import`, live rerun `passed`, commit
  `678a44781a6ba8ba1c1836f5ed9cd9cfb5ebb72e`.
- Final compact proof after Milestone 32:
  `candidateId=tool-selection-select-guide-layers`, `status=completed`,
  `contractComplete=true`, `changedPathCount=4`, `unplannedPathCount=0`.
- Final compact ledger summary after Milestone 32: entries `154`, completed
  `62`, queued `7`, failed_import `11`, blocked_live_lane_synthesis_incomplete
  `9`, blocked_or_skipped `64`, recovered semantic-review item `1`, queued
  `live_lane_needed:0`.
- Not run by design: Local/Ollama, fallback providers, dependency/package
  changes, push/PR, broad/default CEP smoke, unscoped retry, old longrun, full
  runtime reports, raw JSX copy, source checkout writes outside the runner, and
  `max-items > 1`.
- AUX-021 child-run `queue-batch-1-2c946048a6`: no validation commands were run
  by explicit child-run boundary. Planned validation after parent merge/review:
  `node --check scripts/solution-library-validation-smoke.js`,
  `git diff --check`, `node scripts/solution-registry-smoke.js`, and
  `node scripts/solution-library-validation-smoke.js`, plus the normal strict
  importer proof/acceptance lane if selected by the parent runner.
- AUX-021 child-run `queue-batch-1-b3f28610bc`: no validation commands were run
  by explicit child-run boundary. Planned validation after parent merge/review:
  `node --check scripts/solution-library-validation-smoke.js`,
  `git diff --check`, `node scripts/solution-registry-smoke.js`, and
  `node scripts/solution-library-validation-smoke.js`, plus the normal strict
  importer proof/acceptance lane if selected by the parent runner. Handoff file
  creation was blocked by workspace write policy; use the `queue-batch-1-b3f28610bc`
  active-plan notes for continuation.
- AUX-021 child-run `queue-batch-1-978e9e7c80`: no validation commands were run
  by explicit child-run boundary. Planned validation after parent merge/review:
  `node --check scripts/solution-library-validation-smoke.js`,
  `git diff --check`, `node scripts/solution-registry-smoke.js`, and
  `node scripts/solution-library-validation-smoke.js`, plus the normal strict
  importer proof/acceptance lane if selected by the parent runner.
- AUX-021 child-run `queue-batch-1-7fd2104010`: no validation commands were run
  by explicit child-run boundary. Planned validation after parent merge/review:
  `node --check scripts/solution-library-validation-smoke.js`,
  `git diff --check`, `node scripts/solution-registry-smoke.js`, and
  `node scripts/solution-library-validation-smoke.js`, plus the normal strict
  importer proof/acceptance lane if selected by the parent runner.
  `.codex/handoff.md` could not be written in this detached worktree because the
  hidden path write was denied; use the active-plan notes for continuation.
- AUX-021 child-run `queue-batch-1-b77226da32`: no validation commands were run
  by explicit child-run boundary. Planned validation after parent merge/review:
  `node --check scripts/solution-library-validation-smoke.js`,
  `git diff --check`, `node scripts/solution-registry-smoke.js`, and
  `node scripts/solution-library-validation-smoke.js`, plus the normal strict
  importer proof/acceptance lane if selected by the parent runner.
  `.codex/handoff.md` could not be written in this detached worktree because the
  hidden path write was denied; use the `queue-batch-1-b77226da32` active-plan
  notes for continuation.
- AUX-021 child-run `queue-batch-1-1a37311d0a`: no validation commands were run
  by explicit child-run boundary. Planned validation after parent merge/review:
  `node --check scripts/solution-library-validation-smoke.js`,
  `git diff --check`, `node scripts/solution-registry-smoke.js`, and
  `node scripts/solution-library-validation-smoke.js`, plus the normal strict
  importer proof/acceptance lane if selected by the parent runner. Handoff file
  creation was blocked by workspace write policy; use the
  `queue-batch-1-1a37311d0a` active-plan notes for continuation.
- AUX-021 child-run `queue-batch-1-6482cb9bef`: no validation commands were run
  by explicit child-run boundary. Planned validation after parent merge/review:
  `node --check scripts/solution-library-validation-smoke.js`,
  `git diff --check`, `node scripts/solution-registry-smoke.js`, and
  `node scripts/solution-library-validation-smoke.js`, plus the normal strict
  importer proof/acceptance lane if selected by the parent runner. No Local/Ollama,
  fallback provider, dependency/package change, source merge, live AE/CEP lane,
  push, PR, or GitHub automation was performed. Handoff file creation was
  blocked by workspace write policy; use the `queue-batch-1-6482cb9bef`
  active-plan notes for continuation.
- AUX parallel candidate worktrees architecture: `node --check
  orchestrator/parallel-candidate-worktrees.mjs`, `node --check
  orchestrator/run-generic-repo-full-intake.mjs`, `node --check
  scripts/sdk-generic-repo-full-intake-smoke.js`, `node --check
  mcp-server/solution-library.js`, `node
  scripts/sdk-generic-repo-full-intake-smoke.js`, `node
  scripts/sdk-generic-repo-importer-command-smoke.js`, and `node
  scripts/sdk-generic-repo-queue-supervisor-smoke.js` passed on fixture repos.
  `node scripts/solution-library-validation-smoke.js`, `node
  scripts/solution-registry-smoke.js`, `node
  scripts/solution-retrieval-smoke.js`, and `node
  scripts/semantic-verification-smoke.js` also passed. No real queue candidate
  processing, Local/Ollama, fallback provider, dependency/package change,
  broad/default CEP smoke, live CEP/AE smoke, push, PR, or mutating subagent was
  run.

## Handoff

Use `.codex/handoff.md` as the primary continuation record. Keep it compact and update
it after each completed milestone.
