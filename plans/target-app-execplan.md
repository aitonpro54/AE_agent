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

- [x] Historical milestones 1-32: archived/summarized baseline, provider work,
  strict-runner hardening, context-budget tuning, Selection lane prep, and
  completed Selection candidates through disabled/guide layers.
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
- [x] AUX Generic Repo Auto Intake V1: added a top-level
  `run-generic-repo-auto-intake` shell that accepts a local fixture or GitHub
  URL, writes ignored bounded inventory/ledger/status/proof/handoff artifacts,
  fail-closes missing or unrecognized licenses into reference-only candidates,
  and creates only a plan-only parallel schedule with zero worktrees, zero
  candidate execution, and zero central source merge.
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
- [x] AUX text-to-keys generated-only proof/hints: added scoped registry,
  Source Text keyframe read-back/semantic smoke, and compact `tool-texttokeys`
  hints requiring `set_property_keyframes` + `get_layer_details`; no requeue.

## Current State

`full-intake-kyletmartinez` has no queued items after the Selection retry slice.
Final compact status on 2026-06-02:

- status: `completed`
- last item: `tool-selection-select-unparented-layers`
- last candidate commit: `e08b7baebddb6b16d538a0de6a90401f1f7196d5`
- compact runner counts: `items=79`, `completed=59`, `blocked=20`,
  `commits=59`
- compact ledger counts: `entries=154`, `completed=69`,
  `blocked_live_lane_synthesis_incomplete=9`, `blocked_or_skipped=64`,
  `failed_import=11`,
  `recovered_patch_non_live_validated_pending_semantic_review=1`
- `queued=0`, `Queued live_lane_needed=0`

Selection retry slice commit detail is archived; latest completed selection
commit remains `e08b7baebddb6b16d538a0de6a90401f1f7196d5`.

Branch `road-map-2.0` is ahead of `ae-agent/road-map-2.0`; do not push without
explicit approval.

`full-intake-aturtur` compact state on 2026-06-02:

- auto-intake status: `auto_intake_plan_ready`
- source revision: `d3fcb875bfb300327b236e93af85bcae27c0ad8b`
- license: `missing`, `referenceOnlyDefault=true`, `importAllowed=false`
- ledger: 46 entries, all `reference_only`, `queued=0`, `nextCandidate=null`
- parallel plans: selected candidate ids `[]`; worktrees/execution/merge `0`
- serial reducer decision: no scoped wave may run from this ledger without a
  separate clean-room typed-tool contract and explicit candidate ids

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
- auto-intake plan-only shortlist:
  `tool-batchparent`, `tool-changeallnames`; both are queued plan-only ids
- parent Full Intaker parallel plan:
  `selectedCandidateIds=[tool-batchparent, tool-changeallnames]`,
  scoped execution attempted with `worktrees.created=2`, `detached=2`,
  `runOwned=2`, `cleaned=2`; reducer accepted `0`, rejected `0`, blocked `2`,
  `centralSourceMerge=false`
- compact proof now reports `mode=parallel_candidate_worktrees`,
  `contractComplete=true`, `changedPathCount=0`, `unplannedPathCount=0`, proof
  sha `06d599d93b24abf99f4404fb0d6ac1a14392c61f3b1654ec9e9859a17c8fa559`
- final proposal status:
  `tool-changeallnames` failed with
  `implementation-child-run-timeout: queue-batch-1-9080b5431f`;
  `tool-batchparent` failed with
  `implementation-batch-candidate-missing: tool-batchparent`
- compact status helper reported `running` with `Processes: 0 related`; treat
  this as stale state after the scoped attempt and run a stale-run check before
  any resume

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
- `text-to-keys-generated-only` has non-live Source Text keyframe read-back
  proof. Compact `tool-texttokeys` ledger hints include
  `get_selected_layers`, `set_property_keyframes`, and `get_layer_details`;
  status remains `blocked_live_lane_required`, with no requeue/live run.

## Next Milestone

`full-intake-ae-scripting-snippets` still has 23 queued candidates; the two-id
parallel-scoped attempt accepted none. Next bounded step requires explicit
approval for the generated-only OpenAI CLI text-to-keys live lane before any
scoped requeue. Alternative proof remains `expression-controller-generated-only`
only after controller/effect/property path semantics are explicit. Keep
`tool-changeallnames` and `tool-batchparent` on their separate blockers.

Keep Local/Ollama, fallback providers, broad/default CEP smoke, dependency
changes, push/PR, full runtime reports, raw JSX copy, and source checkout writes
outside the runner out of scope.

## Decision Log

- Selection imports are advisory typed-plan coverage only. They use current
  active-comp evidence, `set_layer_selection`, and `get_selected_layers`
  read-back. Source-exact native UI semantics, cross-comp/Project panel
  selection, fuzzy matching, raw JSX execution, and non-selection mutations
  remain fail-closed unless a separate typed-tool contract proves them.
- Random layer selection requires a reviewed deterministic
  `randomSelectionPolicy` and concrete `randomLayerIndices`; mutation-time
  nondeterminism and native random UI semantics stay out of scope.
- Shape/text/unparented selection require typed evidence such as
  `shapeLayer:true`, `textLayer:true`, or no-parent `parentLayerIndex`/equivalent
  state before computing concrete layer indices.
- Retrieval closeout fixed a stale compact-prompt interaction: generic
  selected/layers overlap must not surface `bulk-layer-duplicate-typed-tool`
  unless the prompt explicitly asks to duplicate/copy/clone, while Selection
  evidence terms must survive compact prompt formatting.
- Parallel Tool Intake V1 keeps live AE/CEP validation, central ledger writes,
  registry/recipe/library writes, docs, handoff, and commits parent-owned and
  serial. Child trees may only emit compact proposals/proofs.
- Child isolation uses short temp local clones under `%TEMP%/codex-pi/...`
  instead of shared git worktrees in V1, because nested detached Windows
  worktree paths hit `GIT_DIR` path-length limits during importer child runs.
  The parent still persists proposal/proof artifacts under the run root before
  cleanup.
- Detached child imports pass an explicit `detachedAllowed` target contract and
  use shortened child runtime paths, so ordinary importer runs keep their
  existing branch checks and worktree layout.
- Ordinary repository search must stay on the guarded path: `.rgignore` blocks
  archival/generated roots for raw `rg`, while `node scripts/safe-rg.js` is the
  required wrapper for searches that include hidden roots, multiple roots, or
  any possible log/runtime expansion.
- Generic Repo Auto Intake V1 is an orchestration shell, not a broad real-repo
  processing run. Missing, unrecognized, or recognized non-permissive licenses
  set `referenceOnly:true`; missing/unrecognized-license entries are not
  `status:"queued"` and expose no `nextCandidate`, so accidental old
  full-intake execution does not import them.
- Auto Intake parallel scheduling is plan-only in V1. It selects only bounded
  low-risk safe/reference candidates and records that child worktrees,
  candidate execution, central source merge, Local/Ollama, fallback providers,
  live CEP/AE, dependency/package changes, push/PR, and raw JSX copy are all
  disabled.
- The aturtur source repository is missing a recognized permissive license, so
  all 46 JSX candidates stay `reference_only`. Parent reducer rejected scoped
  execution because the parallel plan exposed no explicit safe candidate ids.
- The ae-scripting scripting-snippets README contains a CC-BY 3.0 statement.
  Auto-intake treats it as recognized attribution-required permission:
  import may proceed only through typed recipe paths, raw JSX copy remains
  blocked, and every generated run gets a separate `License` text artifact with
  per-script attribution entries. If a script exposes author metadata, the
  entry includes `Author(s)`; otherwise it lists the script path only.
- Subagent audits were read-only only. They confirmed license/reference-only
  fail-closed behavior, coherent ledger/status buckets, hash consistency, and a
  plan-only validation boundary; no child edits or child commits occurred.
- For ae-scripting, the runRoot auto-intake plan and parent full-intake
  parallel plan both select `tool-batchparent` and `tool-changeallnames`.
  This is still plan-only metadata: child execution, worktrees, controlled
  merge, and live validation remain serial/parent-gated.
- Plan-only parallel proof envelopes are valid Full Intaker proof artifacts.
  `full-intake-proof.mjs` now falls back from root `proof-envelope.json` to
  `parallel-candidates/parallel-proof-envelope.json` and reports parallel mode
  and evidence in compact output.
- Parallel-scoped ae-scripting runs exposed three infrastructure gaps, all fixed
  locally without central child writes: Windows long-path checkout for outer
  child clones, missing auto-intake `safetySignals` objects, and Windows
  long-path checkout for importer implementation clones. Large shared smoke
  files now use bounded append-only extraction so proposals do not embed the
  whole smoke file.
- `tool-changeallnames` remains unaccepted because the child writer timed out;
  accepting it now would require a separate recovery/manual proposal slice.
  `tool-batchparent` remains unaccepted because the child batch could not bind
  the candidate and parenting semantics are more fragile.
- `--resolve-live-lanes-before-parallel` is deliberately narrower than the
  existing serial resolution queue: it excludes import-failure and stale
  child-timeout recovery, requires explicit ids, and treats
  `blocked_live_lane_required` as recoverable only inside that scoped
  pre-parallel phase.
- Parallel child worktrees remain proposal-only. Even after pre-resolution,
  live-gated acceptance still requires parent-owned serial live proof/rerun
  policy; child worktrees must not run live CEP/AE.
- ae-scripting read-only `suggestedTools` must not synthesize a production lane.
  A future family must require explicit mutating typed tools, generated-only
  fixtures, read-back, semantic verification, cleanup, and a narrow live lane
  before any real candidate requeue.
- Existing typed tools are only partial for the 17 unsupported snippets:
  `create_shape_layer`, `set_expression`, `set_property_keyframes`,
  `add_effect`, `set_effect_property`, `create_null_layer`,
  `set_layer_transform`, `set_comp_properties`, and marker tools can support
  future contracts, but do not cover source-exact nested shape traversal,
  expression enable/disable scans, comp-marker copy, solid-source resizing,
  recursive comp upscale, paint brush splitting, random transforms, or manual
  hard-coded shape duplication.
- Source Text keyframes are a distinct proof family. The `tool-texttokeys`
  runtime ledger hint now names mutating/read-back tools, but source-exact
  traversal and typo/no-call repair remain fail-closed until live proof passes.

## Validation

- For each Selection candidate in the retry slice, the strict runner completed
  compact status/proof/ledger preflights, lane proof, importer, controlled merge,
  non-live validation, generated-only live rerun, docs/handoff finalization, and
  commit with `unplannedPathCount=0`.
- Final compact proof:
  `candidateId=tool-selection-select-unparented-layers`, `status=completed`,
  `contractComplete=true`, `changedPathCount=4`, `unplannedPathCount=0`,
  proof sha `7054bc5645c26382f6cae189f71227c87b44ad6685c8ab3b6a7334a88d90da99`.
- Final compact ledger summary: `entries=154`, `completed=69`, `queued=0`,
  `failed_import=11`, `blocked_live_lane_synthesis_incomplete=9`,
  `blocked_or_skipped=64`, `Queued live_lane_needed=0`.
- Additional retrieval-fix validation passed:
  `git diff --check`;
  `node --check mcp-server/solution-library.js`;
  `node --check scripts/solution-library-validation-smoke.js`;
  `node scripts/solution-registry-smoke.js`;
  `node scripts/solution-library-validation-smoke.js`;
  `node scripts/solution-retrieval-smoke.js`.
- Parallel Tool Intake V1 validation passed:
  `node --check orchestrator/parallel-candidate-worktrees.mjs`;
  `node --check orchestrator/run-generic-repo-full-intake.mjs`;
  `node --check orchestrator/run-generic-repo-queue-supervisor.mjs`;
  `node --check orchestrator/run-generic-repo-tool-importer.mjs`;
  `node --check scripts/sdk-generic-repo-full-intake-smoke.js`;
  `git diff --check`;
  `node scripts/sdk-generic-repo-importer-command-smoke.js`;
  `node scripts/sdk-generic-repo-queue-supervisor-smoke.js`;
  `node scripts/solution-library-validation-smoke.js`;
  `node scripts/solution-registry-smoke.js`;
  `node scripts/solution-retrieval-smoke.js`;
  `node scripts/sdk-generic-repo-full-intake-smoke.js`.
- Search safety guard validation passed:
  `node --check scripts/safe-rg.js`;
  `node --check scripts/safe-rg-smoke.js`;
  `node scripts/safe-rg-smoke.js`;
  `git diff --check`;
  standard non-live smoke suite:
  provider contract, solution registry/candidate/promotion/retrieval/library,
  project intent memory, plan classification/repair, semantic verification,
  reliability validation, ChatGPT connector, provider API, prompt optimization,
  bridge-only, and full smoke test.
- AUX Generic Repo Auto Intake V1 validation passed:
  `node --check orchestrator/run-generic-repo-auto-intake.mjs`;
  `node --check scripts/sdk-generic-repo-auto-intake-smoke.js`;
  `node scripts/sdk-generic-repo-auto-intake-smoke.js`;
  `node scripts/sdk-generic-repo-importer-command-smoke.js`;
  `node scripts/sdk-generic-repo-queue-supervisor-smoke.js`;
  `node scripts/sdk-generic-repo-full-intake-smoke.js`;
  `node scripts/solution-library-validation-smoke.js`;
  `node scripts/solution-registry-smoke.js`;
  `node scripts/solution-retrieval-smoke.js`.
  The new smoke uses only a local fixture without network and proves
  fixture -> inventory -> reference-only ledger -> plan-only parallel plan ->
  compact status/proof/handoff.
- Auto Intake closeout also passed the standard non-live smoke suite:
  provider contract, solution registry/candidate/promotion/retrieval/library,
  project intent memory, plan classification/repair, semantic verification,
  reliability validation, ChatGPT connector, provider API, prompt optimization,
  bridge-only, and full smoke test.
- Controlled aturtur and ae-scripting intake validation passed through compact
  auto-intake/full-intake/status/proof/ledger checks. Aturtur stayed
  reference-only with zero selected ids; ae-scripting reported `CC-BY-3.0`,
  `queued=23`, selected plan-only ids `tool-batchparent,tool-changeallnames`,
  and no scoped wave, child worktree, source merge, raw JSX copy, or live
  validation.
- CC-BY attribution and parallel proof helper validation passed with touched
  `node --check`, Full Intake/auto-intake/importer/supervisor/solution smokes,
  compact proof checks, standard non-live smoke suite, and `git diff --check`
  with only normal Windows LF/CRLF warnings.
- ae-scripting parallel-scoped attempt validation passed:
  `node --check orchestrator/parallel-candidate-worktrees.mjs`;
  `node --check orchestrator/run-generic-repo-auto-intake.mjs`;
  `node --check orchestrator/run-generic-repo-tool-importer.mjs`;
  `node --check scripts/sdk-generic-repo-full-intake-smoke.js`;
  `node --check scripts/sdk-generic-repo-auto-intake-smoke.js`;
  `node scripts/sdk-generic-repo-full-intake-smoke.js`;
  `node scripts/sdk-generic-repo-auto-intake-smoke.js`;
  `node scripts/sdk-generic-repo-importer-command-smoke.js`;
  `node scripts/sdk-generic-repo-queue-supervisor-smoke.js`;
  `node scripts/solution-library-validation-smoke.js`;
  `node scripts/solution-registry-smoke.js`;
  `node scripts/solution-retrieval-smoke.js`;
  `node scripts/semantic-verification-smoke.js`;
  `git diff --check`.
  Real scoped runs used only explicit ids
  `tool-changeallnames,tool-batchparent`; final proof sha
  `06d599d93b24abf99f4404fb0d6ac1a14392c61f3b1654ec9e9859a17c8fa559`.
  Accepted candidates: `0`; blocked proposals: `2`.
- AUX live-lane pre-resolution before parallel-scoped validation passed:
  touched-file `node --check`; `git diff --check` (normal Windows LF/CRLF
  warnings only); required Full Intake/auto-intake/importer/supervisor/
  solution/semantic smokes; standard non-live provider/plan/reliability/
  connector/prompt/bridge/full smokes; and read-only CEP `inspect` plus
  `connector-status-smoke`.
  Configured `npm.cmd run check:rules` was attempted and failed on unrelated
  `M167 SDK operation envelope core extraction smoke` expecting
  `run-write-capable-scaffold.mjs` to import `createOperationEnvelopeHelpers`.
- AUX ae-scripting family design validation: read-only preflight used compact
  status/proof/ledger only, inspected exactly the 17 named ledger entries and
  source snippets, confirmed stale `running` state has no related runner
  processes, and made no code, queue, requeue, child-worktree, live CEP/AE,
  Local/Ollama, dependency, push, or PR changes.
- AUX text-to-keys proof/hint validation passed: touched-file `node --check`,
  registry parse/assert, `agent-scenario-report-smoke`,
  `semantic-verification-smoke`, `solution-library-validation-smoke`, compact
  status/ledger summary, registry-vs-ledger requiredTools assert, and
  `git diff --check` with normal LF/CRLF warnings only. Fixture-only
  `sdk-generic-repo-full-intake-smoke` printed `ok:true` but hit the 120s
  timeout, so it is not counted as passed; no related runner processes remained.
- Not run by design: Local/Ollama, fallback providers, broad/default CEP smoke,
  broad real queue, `max-items > 1`, dependency/package changes, full runtime
  reports, push, PR, GitHub automation, raw JSX copy, and source checkout writes
  outside the runner.

## Handoff

Use `.codex/handoff.md` as the primary continuation record. Keep it compact and
update it after each completed milestone.
