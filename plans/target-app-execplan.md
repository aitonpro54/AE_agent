# Target App Execution Plan

## Active Baseline

This compact active plan tracks the AE Agent 2.0.0 target from
`specs/target-app.md`: a local After Effects CEP panel with provider setup,
Chat/Agent/Agent Hardcore modes, bridge-owned planning/execution gates,
protected AE mutations, diagnostics, and manual Codex App dev-request handoff.

Historical milestone detail through 2026-05-31 is archived at
`plans/archive/target-app-execplan-history-through-2026-05-31.md`.

## Operating Guardrails

- Do not read `plans/archive/**` or old `.codex-runtime/**` by default.
  Prefer compact handoff/status/proof/ledger checks.
- Keep this file under 24 KB target and 32 KB hard cap.
- Keep `.codex/handoff.md` under 12 KB target and 16 KB hard cap.
- Do not use Local/Ollama unless explicitly requested in the current turn.
- Do not run broad/default CEP smoke, old longrun flows, `max-items > 1`,
  dependency/package changes, push, PR, or source merge outside the runner
  without explicit approval.
- For live validation, prefer narrow generated-only OpenAI CLI lanes when
  required and available.

## Progress

- [x] AUX scoped layer metadata import review: only `tool-nullstoone` was
  reclassified/proved against `layer-comment-label-lock-generated-only`, then
  rejected by parent semantic review: source summary showed `MasterNull`,
  `threeDLayer=true`, `label=10`, and Position/Scale semantics beyond the
  child `label:1` recipe. Generated edits were removed; ae-scripting ledger is
  terminal with `queued=0`, `blocked_live_lane_required=21`.
- [x] AUX first layer metadata generated-only lane: added bounded
  `set_layer_metadata` for explicit comp/layer targets, `get_layer_details`
  layer `comment` read-back, semantic read-back checks, and
  `full-ui-agent-layer-metadata-openai-cli-smoke`. Live generated-only proof
  passed with fallbackCount=0 and semantic verification passed for
  comment/label/locked on two generated layers. No broad backlog retry,
  Local/Ollama, fallback provider, dependency change, push/PR, or raw JSX copy.
- [x] AUX terminal closeout for remaining queued `tool-planeresolve` in scoped
  run `fi-planeresolve-r1-20260604`: parent review found an incomplete
  non-standalone math fragment and marked it `failed_import` instead of
  inventing semantics; ae-scripting is now `completed=19`, `queued=0`,
  `failed_import=5`, `blocked_live_lane_required=21`, `blocked_policy=3`.
- [x] AUX remaining-four all-current queued recovery
  `fi-remaining4-allqueued-subagents-20260604`: explicit scoped ids processed
  `tool-keyreverse`, `tool-newtrimmednull`, `tool-planeresolve`, and
  `tool-precompselected` through four detached proposal-only child worktrees
  plus read-only subagent reviews. Parent reducer accepted
  `tool-keyreverse`, `tool-newtrimmednull`, and `tool-precompselected`;
  `tool-planeresolve` had no ready proposal
  (`implementation-batch-candidate-missing`) and remains the only queued
  candidate. Parent review corrected accepted recipe semantics for playhead-copy
  key reversal, top-selected-layer trimmed-null behavior, and per-layer batch
  precompose. No raw JSX copy, live CEP/AE mutation, Local/Ollama, fallback
  provider, dependency change, push, or PR occurred.
- [x] AUX targeted recovery accepted `tool-sortbyposition` in scoped run
  `fi-sortpos-r1-20260603`: parent reducer selected only this named queued
  candidate, accepted a read-only/fail-closed selected-layer position ordering
  advisory recipe, and moved the ae-scripting ledger to `completed=16`,
  `queued=4`. No `--parallel-all-queued`, raw JSX copy, live CEP/AE mutation,
  Local/Ollama, fallback provider, dependency change, push, or PR occurred.
- [x] AUX targeted recovery accepted `tool-trimfirsttosecond` in scoped run
  `fi-trimfirst2-r1-20260603`: parent reducer selected only this named queued
  candidate, accepted a read-only/fail-closed layer-timing advisory recipe, and
  moved the ae-scripting ledger to `completed=15`, `queued=5`. No
  `--parallel-all-queued`, raw JSX copy, live CEP/AE mutation, Local/Ollama,
  fallback provider, dependency change, push, or PR occurred.
- [x] AUX targeted recovery accepted `tool-makeclosest16_headless` in scoped
  run `fi-mc16h-r3-20260603`: importer now recognizes top-level AE
  ExtendScript snippets and resolves underscore ledger ids to hyphen analysis
  ids without changing the global candidate id format. Parent review corrected
  the accepted proposal to source-matching active composition width/height
  resizing through `set_comp_properties`; no raw JSX, live CEP/AE mutation,
  Local/Ollama, fallback provider, dependency change, push, or PR occurred.
- [x] AUX all-current-queued fail-closed run
  `full-intake-ae-scripting-all-current-queued-20260603-queued7`:
  explicit `--parallel-all-queued` selected all 7 current queued candidates
  (`tool-keyreverse`, `tool-makeclosest16_headless`, `tool-newtrimmednull`,
  `tool-planeresolve`, `tool-precompselected`, `tool-sortbyposition`,
  `tool-trimfirsttosecond`). Seven detached run-owned proposal-only child
  worktrees ran; parent reducer accepted 0, rejected 0, and blocked all 7
  because no proposal was ready. No central registry/recipe/ledger/source
  merge, Local/Ollama, fallback provider, CEP/AE smoke or mutation,
  dependency change, push, PR, or raw JSX copy occurred.
- [x] AUX accepted-registry validation repair: `newadjust-typed-plan`
  now uses the allowed registry input type `comp` instead of unsupported
  `composition-target`, and the recipe documents matching inputs. No queue
  rerun, blocked-candidate processing, Local/Ollama, CEP smoke, dependency
  change, push, PR, or raw JSX copy occurred.
- [x] AUX parallel candidate worktrees architecture:
  `full-intake-ae-scripting-all-queued-20260603-205105` proved parent-owned
  serial reduction for accepted and blocked proposal sets.
- [x] AUX all-queued parallel selector: added explicit `--parallel-all-queued`
  mode; plan-only proof selected all 14 current ae-scripting queued candidates
  without manual ids, worktrees, ledger mutation, Local/Ollama, or live smoke.
- [x] AUX `tool-guitemplate` accepted: fixed narrow ScriptUI object-method
  discovery gap and accepted fresh scoped run
  `full-intake-tool-guitemplate-20260603-194512`.
- [x] AUX ae-scripting scoped wave: accepted `tool-debughelper`,
  `tool-dropnthframe`, `tool-getlayertype`, and `tool-getpropertyparent`;
  failed closed `tool-filterinput` and `tool-getlayertype_compressed`.
- [x] Historical milestones 1-32 are archived/summarized.
- [x] AUX Parallel Tool Intake V1: opt-in parallel lane now runs real non-live
  child execution in isolated detached local-clone trees, emits compact
  `generic-repo-full-intake.parallel-candidate-proposal.v1` packets, and lets
  the parent reducer serially accept only approved root changes; default serial
  Full Intaker behavior unchanged.
- [x] Full Intaker Selection retry slice completed for
  `full-intake-kyletmartinez`: `select-layers-below-label`,
  `select-non-null-layers`, `select-parent-layer`, `select-random-layers`,
  `select-shape-layers`, `select-text-layers`, and
  `select-unparented-layers` all completed through strict lane proof,
  importer, controlled merge, non-live validation, generated-only live rerun,
  docs/handoff finalization, and commit.
- [x] Retrieval closeout fix: solution-library tool-backed duplicate guidance
  now requires explicit duplicate/copy/clone intent, and compact key terms keep
  new Selection evidence guards visible in prompt hints.
- [x] Search safety guard: repository search now has `.rgignore` defaults plus
  `scripts/safe-rg.js`, a bounded ripgrep wrapper that rejects broad generated
  roots and caps output before old logs/runtime reports can flood context.
- [x] AUX Generic Repo Auto Intake V1: bounded auto-intake now writes ignored
  inventory/ledger/status/proof/handoff artifacts and plan-only schedules, with
  missing/unrecognized licenses fail-closed as reference-only.
- [x] Controlled aturtur GitHub auto-intake longrun:
  `https://github.com/aturtur/after-effects-scripts` produced a bounded
  `full-intake-aturtur` ledger with 46 JSX entries, all `reference_only`
  because the source license is missing. No queued candidates, scoped waves,
  child worktrees, candidate execution, raw JSX copy, or central merge ran.
- [x] Full Intaker compact proof helper now supports plan-only parallel proof
  envelopes under `parallel-candidates/parallel-proof-envelope.json`, while
  standard candidate proof envelopes keep their existing compact behavior.
- [x] Controlled ae-scripting GitHub auto-intake plan:
  `https://github.com/ae-scripting/scripting-snippets` produced a bounded
  `full-intake-ae-scripting-snippets` ledger with 48 JSX entries. The README
  CC-BY 3.0 statement is now recognized as attribution-required import
  permission, a separate `License` attribution artifact is generated, and
  plan-only parallel scheduling exposes two queued ids without running child
  worktrees or copying raw JSX.
- [x] Guarded ae-scripting parallel-scoped attempt:
  explicit ids `tool-changeallnames` and `tool-batchparent` ran through the
  parent-owned parallel reducer only. Windows child checkout/ledger/smoke
  blockers were fixed with local fail-closed infrastructure commits, but no
  candidate was accepted: `tool-changeallnames` timed out in the child writer,
  and `tool-batchparent` failed closed as missing from the implementation batch.
- [x] AUX live-lane pre-resolution before parallel-scoped:
  `run-generic-repo-full-intake.mjs` now has scoped opt-in
  `--resolve-live-lanes-before-parallel`. It requires explicit
  `--resolution-candidate-ids` and `--parallel-candidate-ids`, runs only
  parent-owned live-lane resolution before parallel worktrees, rereads the
  ledger, and records a compact `preResolutionPhase` in the parallel proof.
- [x] AUX ae-scripting family design slice: inspected only 17 unsupported
  `blocked_live_lane_required` entries and matching snippets, grouped them into
  generated-only family proposals, and kept all of them fail-closed because the
  ledger exposes read-only suggested tools and the source semantics need new or
  separately proven mutating typed-tool contracts before any requeue.
- [x] AUX text-to-keys proof/hints/import: added scoped registry, Source Text
  read-back/semantic smoke, compact ledger hints, and typed recipe binding.
- [x] AUX importer/parallel packaging fixes: importer recognizes legacy
  function assignments; parallel child runs no longer receive parent-owned
  smoke/plan/handoff paths, and shared smoke rewrites fail closed.

## Current State

`full-intake-kyletmartinez` completed the Selection retry slice on 2026-06-02:
last item `tool-selection-select-unparented-layers`, latest selection commit
`e08b7baebddb6b16d538a0de6a90401f1f7196d5`, compact ledger `completed=69`,
`failed_import=11`, `queued=0`, and `Queued live_lane_needed=0`.

`full-intake-aturtur` stayed reference-only because the source license is
missing: 46 entries, `queued=0`, selected ids `[]`.

`full-intake-ae-scripting-snippets` compact state on 2026-06-02:

- source: `https://github.com/ae-scripting/scripting-snippets`
- license: `recognized_permissive`, `id=CC-BY-3.0`,
  `referenceOnlyDefault=false`, `importAllowed=true`,
  `attributionRequired=true`, evidence `README.md`
- attribution exists
- ledger/status: 48 entries, `queued=23`, `blocked_live_lane_required=22`,
  `blocked_policy=3`, `reference_only=0`
- classification buckets: `live_lane_needed=22`,
  `existing_typed_tools_recipe_only=23`, `unsafe_skip_tool_gap=3`
- previous `tool-batchparent,tool-changeallnames` scoped attempt accepted `0`;
  `tool-changeallnames` timed out and `tool-batchparent` hit a binding miss.

Architecture update on 2026-06-03:

- Pre-resolution is available only as an explicit scoped parallel opt-in; normal
  serial resolution behavior does not broadly pick up `blocked_live_lane_required`.
- Read-only ae-scripting diagnostic found 22 `blocked_live_lane_required`
  entries: 0 currently match supported auto-lane families, 17 are unsupported
  because they only expose read/inspection tools, and 5 are terminal unsafe due
  to file/render signals.
- No real ae-scripting queue processing, requeue, child worktree, raw JSX copy,
  source merge, live CEP/AE mutation, Local/Ollama, push, or PR occurred.
- AUX family design found proposed fail-closed families:
  `shape-path-generated-only`, `expression-generated-only`,
  `comp-size-generated-only`, `marker-copy-generated-only`,
  `text-to-keys-generated-only`, `property-to-null-generated-controller`,
  `stroke-cap-path-style-generated-only`, plus smaller transform/paint/shape
  duplication proposals. None is production-ready from the current read-only
  ledger entries; the closest future first lane is generated-only
  `text-to-keys` or expression-controller proof after explicit mutating tool
  hints and read-back semantics are added.
- `tool-texttokeys` has generated-only Source Text live proof, passed
  liveGate, and parent-owned typed recipe binding; source-exact traversal,
  typo/no-call repair, text animators, and raw JSX remain fail-closed.
- `tool-guitemplate` recovery is complete: old run
  `full-intake-tool-guitemplate-20260603-184134` failed closed as
  `implementation-batch-candidate-missing`, the importer now recognizes
  ScriptUI object method assignments only with a ScriptUI container signal, and
  fresh run `full-intake-tool-guitemplate-20260603-194512` accepted
  `guitemplate-typed-plan` with proof sha
  `02d0429d7dadeea0662a1c59ac33fa8e47cc89829e193134b29f8ce744ca28f5`.

## Next Milestone

`fi-planeresolve-r1-20260604` closed the last queued ae-scripting candidate as
terminal `failed_import`: `planeResolve.jsx` is an incomplete non-standalone
math fragment, not a safe recipe candidate. Proof sha:
`d8672bc55daf2945699a00d8bbdf9f95ad31a6f8aaceb57c8b193de0b7aa0c83`.
The ae-scripting ledger is now `completed=19`, `queued=0`,
`failed_import=5`, `blocked_live_lane_required=21`, and `blocked_policy=3`.

The first `layer-comment-label-lock-generated-only` prerequisite slice is
implemented and live-proven. Next clean work is a scoped family reclassification
and at most one matching candidate retry/import using the normal bounded Full
Intaker path; do not retry the broad backlog. Marker/file/render families remain
deferred.

Keep Local/Ollama, fallback providers, broad/default CEP smoke, dependency
changes, push/PR, full runtime reports, raw JSX copy, and source checkout writes
outside the runner out of scope.

## Decision Log

- 2026-06-04: `tool-nullstoone` is not a safe
  `layer-comment-label-lock-generated-only` import despite using layer label
  metadata. Source needs `MasterNull`, 3D, label `10`, and
  Position/Scale behavior; future retry needs a broader generated-only null
  controller/transform lane.
- 2026-06-04: Implemented `set_layer_metadata` as a narrow mutating contract:
  one explicit comp target, explicit non-duplicate `layerIndices`, optional
  same-length `expectedLayerNames`, and only `comment`, `label` 0-16, and
  `locked`. The tool rejects unknown fields and selection/all-layer discovery;
  semantic verification requires post-mutation `get_layer_details` read-back.
- 2026-06-04: Selected `layer-comment-label-lock-generated-only` as the next
  non-file/non-render family lane. Current production tools can read back
  `label`/`locked` via `get_layer_details`, and `set_property_value` remains
  intentionally limited to `threeDLayer`, `collapseTransformation`, and
  `motionBlur`; therefore layer comment/label/lock changes need a new narrow
  `set_layer_metadata` contract plus comment read-back before any retry.
- 2026-06-04: `tool-planeresolve` was marked `failed_import` because its source
  has unfinished point assignments and only a partial intersection calculation.
  Creating a
  `planeresolve-typed-plan` would have required inventing product semantics or
  copying raw JSX, so parent reducer chose terminal fail-closed ledger closeout.
  AE/panel connectivity was available (`panelConnected=true`, `ping_ae`
  returned AE 26.2x49), but live mutation was not relevant to this importer
  binding/source-completeness failure.
- 2026-06-04: User-approved remaining-four recovery used explicit scoped ids
  instead of a broad selector. Child worktrees and multi-agent reviewers stayed
  proposal-only/read-only; parent owned central writes, safety review,
  validation, docs, handoff, and commits. Parent review narrowed
  `keyreverse-typed-plan` to same-time selected-key value reversal rather than
  source-exact playhead-copy insertion, kept `newtrimmednull-typed-plan`
  read-only/fail-closed around top-selected-layer timing/label/parenting gaps,
  and required `precompselected-typed-plan` to model source-like batch behavior
  as one reviewed `precompose_layers` step per selected layer.
- 2026-06-03: `tool-sortbyposition` was selected as the single named queued
  candidate after `tool-trimfirsttosecond`. Parent reducer accepted only a
  read-only/fail-closed selected-layer position ordering recipe because current
  typed tools can inspect active comp, selected layers, and transform Position
  values but cannot safely mutate layer stack order; a real sort requires a
  future narrow `reorder_layers`-style contract with comparator evidence and
  read-back.
- 2026-06-03: `tool-trimfirsttosecond` was selected as the single named queued
  candidate for scoped recovery after `tool-makeclosest16_headless`. Parent
  reducer accepted only a read-only/fail-closed advisory recipe because current
  typed tools can inspect selected layer timing but cannot safely mutate
  `inPoint`, `outPoint`, or `startTime`; a real trim requires a future narrow
  layer-timing mutation contract with read-back.
- 2026-06-03: `tool-makeclosest16_headless` recovery fixed the concrete
  `implementation-batch-candidate-missing` causes for this candidate: top-level
  AE ExtendScript snippets are now analysis candidates, and importer batch
  binding resolves underscore ledger ids to hyphen analysis ids without
  changing existing fixture id format. Parent review corrected the accepted
  child proposal from layer-position snapping to source-matching active comp
  width/height resizing through `set_comp_properties`.
- 2026-06-03: Fresh user-approved full-parallel all-current-queued run used
  explicit `--parallel-all-queued`, limit 7, and `--no-commit`. Child lanes
  stayed detached proposal-only and parent reduction stayed the only central
  writer. Since every proposal was blocked/missing-ready, the central ledger
  stayed unchanged and the seven queued candidates remain separate recovery
  work.
- 2026-06-03: `newadjust-typed-plan` uses canonical registry input type
  `comp`; `composition-target` was only an unsupported synonym. The matching
  recipe documents `targetComp` and `adjustmentLayerSpec`, with no runtime
  tool contract change.
- 2026-06-03: AUX parallel candidate worktrees stay opt-in; child worktrees
  produce proposals only, while the parent owns ledger, registry, plan,
  handoff, live rerun policy, validation, and commits.
- 2026-06-03: `--parallel-all-queued` is the explicit queue-wide opt-in. It
  selects every current parallel-safe `status=queued` candidate and conflicts
  with manual `--parallel-candidate-ids`.
- Earlier June 2026 AUX intake decisions were compacted to
  `plans/archive/target-app-execplan-history-2026-06-03-aux.md`.

## Validation

- AUX scoped `tool-nullstoone` review validation: compact preflight and
  ledger/proof/status checks passed; registry JSON, `git diff --check`,
  solution-library validation, and SDK intake/importer/supervisor smokes
  passed. Only `tool-nullstoone` was requeued/selected; importer non-live
  passed, then parent semantic review rejected and removed generated
  edits. Not run: Local/Ollama, fallback providers,
  broad/default CEP smoke, dependency changes, push/PR, raw JSX copy.
- AUX first layer metadata generated-only validation passed: fresh preflight
  read active docs; compact status/proof for `fi-planeresolve-r1-20260604`
  stayed contract-complete and the ae-scripting ledger stayed terminal
  `queued=0`; touched-file `node --check`; `git diff --check`; semantic,
  report, plan-repair, provider, registry/retrieval/library, reliability,
  ChatGPT connector, SDK full-intake/importer/supervisor, bridge-only, and
  standard smoke suites passed. Read-only CEP inspect/connector checks passed.
  `full-ui-agent-layer-metadata-openai-cli-smoke` first failed closed against
  a stale bridge catalog, then passed after restarting the local bridge:
  OpenAI CLI planner accepted the typed plan, `fallbackCount=0`, dry-run and
  protected run passed, and read-back confirmed comment/label/locked on two
  generated layers. Not run by design: Local/Ollama, fallback providers,
  broad/default CEP smoke, broad backlog retry, dependency changes, push/PR,
  raw JSX copy, archive reads, and full runtime reports.
- AUX `tool-planeresolve` terminal closeout validation passed: compact proof
  for `fi-planeresolve-r1-20260604` was contract-complete with reducer status
  `parallel_proposals_blocked`, proof sha
  `d8672bc55daf2945699a00d8bbdf9f95ad31a6f8aaceb57c8b193de0b7aa0c83`;
  source review found no standalone AE tool semantics; bridge read-only check
  passed with `panelConnected=true` and AE `26.2x49`; ledger summary moved to
  `completed=19`, `queued=0`, `failed_import=5`. No registry/recipe solution
  was added. Full relevant non-live smoke suite passed, plus read-only CEP
  inspect/connector checks; no live mutation, dependency change, push/PR, or
  raw JSX copy.
- AUX remaining-four recovery validation passed: compact proof for
  `fi-remaining4-allqueued-subagents-20260604` was contract-complete with
  reducer status `parallel_reducer_completed`, accepted
  `tool-keyreverse`, `tool-newtrimmednull`, and `tool-precompselected`, blocked
  `tool-planeresolve`, proof sha
  `2869a907c1e821679113ee0cf6f153af3a1b6f903cbc9d148691f45b179a8398`, and
  ledger summary moved to `completed=19`, `queued=1`. Passed: registry JSON
  parse; accepted recipe raw JSX/mutation safety inspection; `git diff
  --check`; provider contract, solution registry/candidate-report/promotion/
  retrieval/library validations; project intent memory; plan classification
  and repair; semantic verification; reliability validation suite; ChatGPT
  connector, provider API, prompt optimization, bridge-only, standard smoke;
  SDK generic repo full-intake/importer-command/queue-supervisor smokes. No
  JavaScript files were touched, so touched-file `node --check` was not
  required. Not run by design: Local/Ollama planner work, fallback providers,
  broad/default CEP smoke, live CEP/AE mutation, dependency changes, push/PR,
  raw JSX copy, archive reads, and full runtime report reads.
- Earlier targeted recovery validations for `tool-sortbyposition`,
  `tool-trimfirsttosecond`, and `tool-makeclosest16_headless` were compacted
  here to preserve active-plan size; their commit history and compact proof
  envelopes remain the authoritative detail.
- AUX all-current-queued fail-closed validation is compacted: proof stayed
  contract-complete, reducer blocked all proposals without central merge, and
  relevant library/registry/retrieval/semantic/SDK smokes passed.
- AUX accepted-registry validation repair passed: no JavaScript files touched;
  `git diff --check`; solution library/registry/retrieval smokes; semantic
  verification; generic-repo full-intake/importer/queue-supervisor smokes. The
  first full-intake smoke attempt timed out with no assertion failure; rerun
  with a longer timeout passed.
- Earlier June 2026 AUX validations were compacted to
  `plans/archive/target-app-execplan-history-2026-06-03-aux.md`.
- Not run by design: Local/Ollama, fallback providers, broad/default CEP smoke,
  broad real queue outside explicit all-current-queued approval, dependency
  changes, full runtime reports, push, PR, GitHub automation, raw JSX copy, and
  source checkout writes outside the runner.

## Handoff

Use `.codex/handoff.md` as the primary continuation record. Keep it compact and
update it after each completed milestone.
