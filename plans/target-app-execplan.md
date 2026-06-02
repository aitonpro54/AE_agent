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

## Next Milestone

No queued Full Intaker item remains. Next work should not start a broad queue.
Choose one bounded follow-up:

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
- Not run by design: Local/Ollama, fallback providers, broad/default CEP smoke,
  broad real queue, `max-items > 1`, dependency/package changes, full runtime
  reports, push, PR, GitHub automation, raw JSX copy, and source checkout writes
  outside the runner.

## Handoff

Use `.codex/handoff.md` as the primary continuation record. Keep it compact and
update it after each completed milestone.
