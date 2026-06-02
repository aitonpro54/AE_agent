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
  `full-intake-ae-scripting-snippets` ledger with 48 JSX entries, all
  `reference_only` because the source license is missing. Auto-intake produced
  a plan-only parallel shortlist, read-only subagents audited the artifacts,
  and the parent Full Intaker plan exposed zero executable queued candidates.

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

Selection commits completed in this continuation:

- `tool-selection-select-parent-layer`:
  `2e324d5862ef5bf33581c1d4751af7bde3c27347`
- `tool-selection-select-random-layers`:
  `bdcf436956da244597a668c5ef8c5a019de14267`
- `tool-selection-select-shape-layers`:
  `ec2898e7a93df4ca4e46448aa2fe56a48433e9e3`
- `tool-selection-select-text-layers`:
  `b43cc7987c52eb8c52d1c17b7a9d8759b7e2f24b`
- `tool-selection-select-unparented-layers`:
  `e08b7baebddb6b16d538a0de6a90401f1f7196d5`

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
- source revision observed by `git ls-remote`: `17bc59a5a158fc6cb49ecb4161018333f7048675`
- artifact root:
  `.codex-runtime/sdk/generic-repo-importer/ae-scripting-scripting-snippets-55904818-intake`
- license: `missing`, `referenceOnlyDefault=true`, `importAllowed=false`
- inventory: 49 interesting files, 48 JSX candidates
- ledger/status: 48 entries, all `reference_only`, `queued=0`, `importable=0`
- classification buckets: `live_lane_needed=22`,
  `existing_typed_tools_recipe_only=23`, `unsafe_skip_tool_gap=3`
- auto-intake plan-only shortlist:
  `tool-batchparent`, `tool-changeallnames`; both remain reference-only and
  not executable
- parent Full Intaker parallel plan:
  `selectedCandidateIds=[]`, `candidatesExecuted=0`, `childWorktreesCreated=0`,
  `centralSourceMerge=false`
- compact proof:
  `mode=parallel_plan_only`, `contractComplete=true`, `changedPathCount=0`,
  `unplannedPathCount=0`, proof sha
  `a3c86b1eb28b6d8a387bea5902bef35f1b8df26d8aa763fcd330030f7b769a3c`
- compact status helper reported `running` with `Processes: 0 related`; treat
  this as stale plan-only state and run a stale-run check before any resume

## Next Milestone

No queued Full Intaker item remains. The aturtur and ae-scripting ledgers are
reference-only and have no safe executable scoped candidate ids. Next work
should not start a broad queue. Choose one bounded follow-up:

1. Review Parallel Tool Intake V1 infrastructure before any real broad intake
   longrun; use explicit candidate ids and a bounded
   `--parallel-candidate-limit` when exercising it.
2. Review the terminal backlog in compact form and pick one narrow generated-only
   family to unblock, likely `effect-property-generated-only` or
   `layer-timing-generated-only`.
3. Create the missing typed-tool/proof lane for that family before requeueing any
   matching candidates.
4. Continue with strict `max-items 1`, compact output, and an explicit current
   context percent.
5. For aturtur or ae-scripting only: perform read-only behavior review or
   create a separate clean-room typed-tool lane from intent, not from copied
   JSX, after resolving the missing-license/reference-only status. For
   ae-scripting, the safest first clean-room candidate is likely
   `tool-changeallnames`; `tool-batchparent` is more semantically fragile.

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
- The ae-scripting scripting-snippets repository is also missing a recognized
  permissive license, so all 48 JSX candidates stay `reference_only`.
  Auto-intake may record a reference-only plan shortlist, but the parent
  Full Intaker runner must treat scoped execution as no-go unless a separate
  clean-room lane is approved and explicit safe candidate ids are proven
  importable without raw JSX copy.
- Subagent audits were read-only only. They confirmed license/reference-only
  fail-closed behavior, coherent ledger/status buckets, hash consistency, and a
  plan-only validation boundary; no child edits or child commits occurred.
- For ae-scripting, the runRoot auto-intake plan selected two reference-only
  ids while the parent full-intake parallel plan selected zero executable
  candidates. This is an expected no-wave reducer outcome, not permission to
  run those ids through child execution.
- Plan-only parallel proof envelopes are valid Full Intaker proof artifacts.
  `full-intake-proof.mjs` now falls back from root `proof-envelope.json` to
  `parallel-candidates/parallel-proof-envelope.json` and reports parallel mode
  and evidence in compact output.

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
- Controlled aturtur intake validation passed:
  `node orchestrator/run-generic-repo-auto-intake.mjs --repo https://github.com/aturtur/after-effects-scripts --run-id full-intake-aturtur --context-percent 0 --parallel-candidate-limit 8 --compact-json`;
  compact artifact audit for inventory/status/proof/handoff/ledger/parallel
  plan; read-only subagent audits for license, ledger schema/buckets, and
  validation style; `node orchestrator/run-generic-repo-full-intake.mjs --ledger .codex-runtime/sdk/generic-repo-importer/aturtur-after-effects-scripts-19599911-intake/queue-ledger.json --run-id full-intake-aturtur --plan-parallel-candidate-worktrees --parallel-candidate-limit 8 --compact-json --context-percent 5`;
  compact status and ledger summary. The wave was not run because there were
  zero queued/selected candidate ids.
- Controlled ae-scripting intake validation passed:
  `git ls-remote https://github.com/ae-scripting/scripting-snippets HEAD`;
  `node orchestrator/run-generic-repo-auto-intake.mjs --repo https://github.com/ae-scripting/scripting-snippets --run-id full-intake-ae-scripting-snippets --context-percent 0 --parallel-candidate-limit 2 --compact-json`;
  `node orchestrator/run-generic-repo-full-intake.mjs --ledger .codex-runtime/sdk/generic-repo-importer/ae-scripting-scripting-snippets-55904818-intake/queue-ledger.json --run-id full-intake-ae-scripting-snippets --plan-parallel-candidate-worktrees --parallel-candidate-limit 2 --compact-json --context-percent 0`;
  `node orchestrator/full-intake-ledger-summary.mjs --ledger .codex-runtime/sdk/generic-repo-importer/ae-scripting-scripting-snippets-55904818-intake/queue-ledger.json --compact`;
  `node orchestrator/full-intake-status.mjs --run-id full-intake-ae-scripting-snippets --compact --event-limit 8 --batch-limit 1`;
  `node orchestrator/full-intake-proof.mjs --run-id full-intake-ae-scripting-snippets --compact-json`;
  read-only subagent audits for license/reference-only, ledger/status/plan
  consistency, and validation/safety boundary. No scoped wave, child worktree,
  candidate execution, controlled merge, raw JSX copy, or live validation ran.
- Parallel proof helper fix validation passed:
  `node --check orchestrator/full-intake-proof.mjs`;
  `node --check orchestrator/parallel-candidate-worktrees.mjs`;
  `node --check scripts/sdk-generic-repo-full-intake-smoke.js`;
  `node orchestrator/full-intake-proof.mjs --run-id full-intake-aturtur --compact-json`;
  `node scripts/sdk-generic-repo-full-intake-smoke.js`;
  `node scripts/sdk-generic-repo-importer-command-smoke.js`;
  `node scripts/sdk-generic-repo-queue-supervisor-smoke.js`;
  `node scripts/sdk-generic-repo-auto-intake-smoke.js`;
  `node scripts/solution-library-validation-smoke.js`;
  `node scripts/solution-registry-smoke.js`;
  `node scripts/solution-retrieval-smoke.js`;
  standard non-live smoke suite: provider contract, solution candidate,
  promotion, project intent memory, plan classification/repair, semantic
  verification, reliability validation, ChatGPT connector, provider API,
  prompt optimization, bridge-only, and full smoke test. `git diff --check`
  passed with only normal Windows LF-to-CRLF working-copy warnings.
- Not run by design: Local/Ollama, fallback providers, broad/default CEP smoke,
  broad real queue, `max-items > 1`, dependency/package changes, full runtime
  reports, push, PR, GitHub automation, raw JSX copy, and source checkout writes
  outside the runner.

## Handoff

Use `.codex/handoff.md` as the primary continuation record. Keep it compact and
update it after each completed milestone.
