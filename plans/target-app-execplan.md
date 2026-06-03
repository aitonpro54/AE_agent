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
- [x] AUX parallel candidate worktrees architecture (full-intake-ae-scripting-all-queued-20260603-205105): parent reducer serially handled accepted proposals [tool-makeclosest16, tool-newadjust, tool-niceprecomp, tool-random-interpolation, tool-selectrandomlayers, tool-setcolor, tool-setkeysforpaths] and blocked proposals [tool-keyreverse, tool-makeclosest16_headless, tool-newtrimmednull, tool-planeresolve, tool-precompselected, tool-sortbyposition, tool-trimfirsttosecond].
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

`full-intake-ae-scripting-all-current-queued-20260603-queued7` is closed
fail-closed with no accepted proposals. Proof sha:
`a262f8b887f3c8a795ac350dd439a4a73b1353c2e49a35b7a56179acac507e5b`.
The ledger remains `completed=13`, `queued=7`, `failed_import=4`,
`blocked_live_lane_required=21`, and `blocked_policy=3`.

Next clean work is a separate targeted recovery/triage slice for one or more
of the seven blocked queued candidates only when explicitly selected. Do not
rerun `--parallel-all-queued`.

Keep Local/Ollama, fallback providers, broad/default CEP smoke, dependency
changes, push/PR, full runtime reports, raw JSX copy, and source checkout writes
outside the runner out of scope.

## Decision Log

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

- AUX all-current-queued fail-closed run validation passed: no tracked
  JavaScript files were touched, so touched-file `node --check` was not
  required; compact proof was contract-complete with `unplannedPathCount=0`,
  `centralWriterOnly=true`, detached/run-owned child worktrees, and reducer
  status `parallel_proposals_blocked`; ledger summary stayed
  `completed=13`, `queued=7`, `failed_import=4`,
  `blocked_live_lane_required=21`, `blocked_policy=3`; `git diff --check`;
  `node scripts/solution-library-validation-smoke.js`;
  `node scripts/solution-registry-smoke.js`;
  `node scripts/solution-retrieval-smoke.js`;
  `node scripts/semantic-verification-smoke.js`;
  `node scripts/sdk-generic-repo-full-intake-smoke.js`;
  `node scripts/sdk-generic-repo-importer-command-smoke.js`;
  `node scripts/sdk-generic-repo-queue-supervisor-smoke.js`.
  Compact status for the run reports stale `running` with zero related
  processes, so future work should use compact status before any supervisor
  action.
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
