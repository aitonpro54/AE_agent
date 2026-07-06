# Target App Execution Plan

## Active Baseline

AE Agent 2.0.0 is a local After Effects CEP panel backed by a local bridge
daemon. The bridge owns provider access, chat calls, AE plan validation,
execution gates, logs, checkpoints, edit-session protection, and post-run
verification.

This repository is the clean working baseline. It keeps the product runtime,
typed tools, recipes, solution registry, provider layer, and current
AE-specific Full Intaker/importer tooling. It must not depend on historical
evidence trees, old plan archives, or longrun runtime logs.

## Current Milestones

- [x] Runtime purge (2026-07-02): removed ignored local runtime/log/backup
  artifacts from `.codex-runtime/`, `logs/`, `backups/`, `snapshots/`, and
  `pro-review-bundles/`. `.codex/handoff.md` remains the compact continuation
  file. Commit: `4863eb9`.
- [x] Documentation cleanup (2026-07-02): kept README, AGENTS, cleanup
  migration notes, releases, project memory, and this execution plan compact;
  removed stale architecture and unsafe-triage docs. Commit: `5de90a3`.
- [x] Tracked tooling cleanup (2026-07-02): removed tracked
  `.codex-autonomy` state, ignored the runtime root, and kept autonomy as a
  stateless dev tool. Commit: `c556a24`.
- [x] Registry/test noise cleanup (2026-07-02): normalized visible QA fixture
  naming and historical importer references without changing typed-tool
  contracts. Commit: `2305f5c`.
- [x] Final guard pass (2026-07-02): strengthened clean-current guard for
  tracked runtime roots, compact plan size, ignore surface, and legacy
  longrun/evidence markers outside importer protocol fixtures. Commit: final
  guard commit.
- [x] Aturtur reference-only intake init (2026-07-06): created guarded
  auto-intake runtime for `aturtur/after-effects-scripts`; the source repository
  did not expose a recognized license, so all 46 JSX candidates remain
  `reference_only` with no queued import or worktree execution. Ledger:
  `.codex-runtime/sdk/generic-repo-importer/aturtur-after-effects-scripts-19599911-intake/queue-ledger.json`.
- [x] Aturtur local-use license override infrastructure (2026-07-06): added
  explicit `--allow-unlicensed-personal-use-intake` support to the generic repo
  auto-intake runner. The override is opt-in, records
  `local_personal_use_license_override=true`, preserves source license
  provenance, keeps no-push/no-PR/no-remote-publication/local-use-only
  boundaries, and does not disable validation, duplicate, path-scope, raw-copy,
  or reducer gates.
- [x] Aturtur comment-aware risk scan infrastructure (2026-07-06): fixed the
  generic repo auto-intake risk scanner so URLs inside JSX comments/headers do
  not falsely trigger `usesNetwork` and force every candidate into
  `unsafe_skip_tool_gap`. Real code/string network indicators remain scanned.
- [x] Parallel reducer unrelated-untracked guard (2026-07-06): added explicit
  `--allow-unrelated-untracked-central-tree` support for scoped parallel
  candidate runs. The opt-in permits only unrelated untracked central worktree
  files that do not overlap planned/shared paths, keeps tracked or overlapping
  dirty paths fail-closed, and stages only accepted proposal/parent-owned paths
  for reducer commits.
- [x] Importer candidate alias planning fix (2026-07-06): aligned
  implementation prompt generation with the existing importer alias resolver so
  queue candidate ids that preserve underscores, such as
  `tool-ar_addfolders`, resolve to importer-discovered ids such as
  `tool-ar-addfolders` instead of crashing during implementation planning.
- [x] Aturtur child-runner quota gate (2026-07-06): added a Full Intaker
  failure class for Codex child-runner usage limits. Child `codex exec` quota
  failures now become `blocked_child_runner_usage_limit` with retry evidence
  instead of candidate/content `failed_import`; a global gate stops new queued
  candidate selection while the quota blocker is unresolved.
- [x] Aturtur child-runner quota reset infrastructure (2026-07-06): added an
  explicit `--resolve-child-runner-usage-limit-reset <ids>` opt-in for
  user-confirmed quota resets. The reset requires matching
  `--resolution-candidate-ids`, writes user-decision evidence into the
  resolution ticket and ledger entry, requeues only the scoped quota-blocked
  candidates, consumes only the previous batch evidence, and keeps validation,
  artifact, duplicate, path, reducer, no-push, and no-PR gates unchanged.

## Decision Log

- Historical source material stays in the legacy repository and git history.
  New repository docs should record only current state, decisions, validation,
  and exact next steps.
- Local runtime outputs are ignored and disposable: `.codex-runtime/`,
  `.codex-autonomy/`, `logs/`, `backups/`, `snapshots/`, and
  `pro-review-bundles/`.
- AE-specific Full Intaker/importer tools remain in this repo. Generic reusable
  SDK orchestration should move to the sibling `codex-sdk-orchestrator-tool`
  only through a separate reviewed migration.
- Local/Ollama remains a target provider path, but validation/intake must not
  use Local/Ollama, fallback providers, broad CEP smoke, live mutation,
  dependency changes, push, or PR without explicit approval.
- Unsafe external-script candidates remain fail-closed until a narrow typed
  bridge contract, generated-only fixture, read-back, semantic verification,
  and approval path exist.
- Longrun/evidence marker literals are allowed only where they are protocol
  contracts or smoke fixtures for the generic repository importer.
- Default missing or unrecognized upstream license handling remains fail-closed
  reference-only. For `full-intake-aturtur-after-effects-scripts`, the user
  explicitly approved a local-only personal-use override. That run-level
  decision is informational for license/provenance only: no raw JSX copy,
  central source merge, push, PR, remote publication, live CEP/AE mutation,
  dependency change, Local/Ollama, or fallback provider is allowed, and normal
  typed validation/reducer gates still apply.
- Risk classification must be based on executable JSX surface, not header
  comments. Comment-only project/homepage URLs are provenance metadata and must
  not be treated as network behavior.
- Parallel candidate reducer commits must be path-scoped to accepted proposal
  outputs plus parent-owned plan/handoff paths. Unrelated untracked local files
  may be tolerated only with explicit opt-in and must remain unstaged and
  untouched.
- Queue supervisor/importer integration must resolve queue candidate aliases
  consistently across validation, planning, and prompt generation. Alias
  mismatch is a tooling blocker to fix, not a candidate terminal blocker.
- Codex child-runner quota exhaustion is an external runtime blocker, not a
  candidate/content failure. While `blocked_child_runner_usage_limit` exists in
  the ledger, the Full Intaker must not select another queued candidate and burn
  the same exhausted child-runner path.
- A child-runner quota reset may be applied only through an explicit scoped
  parent-owned option after a recorded user decision. The reset is not a
  validation bypass: it only returns the named candidate to `queued` so the next
  normal serial reducer step can rerun all usual gates.

## Validation Notes

Default guard:

```powershell
npm.cmd run check:rules
```

For source edits, also run `node --check` on every touched JavaScript/MJS file
and `git diff --check`.

Run focused smoke groups when their surface changes:

- `npm.cmd run smoke:provider-contract`
- `npm.cmd run smoke:provider-api`
- `npm.cmd run smoke:solutions`
- `npm.cmd run smoke:planning`
- `npm.cmd run smoke:bridge`
- `npm.cmd run smoke:full-intake`

Run note 2026-07-06, `full-intake-aturtur-after-effects-scripts`:

- `node orchestrator/run-generic-repo-auto-intake.mjs --repo https://github.com/aturtur/after-effects-scripts --run-id full-intake-aturtur-after-effects-scripts --context-percent 0 --parallel-candidate-limit 4 --compact-json`: pass; created reference-only runtime with 46 candidates and no queued imports.
- `node orchestrator/run-generic-repo-full-intake.mjs --ledger .codex-runtime/sdk/generic-repo-importer/aturtur-after-effects-scripts-19599911-intake/queue-ledger.json --run-id full-intake-aturtur-after-effects-scripts --plan-parallel-candidate-worktrees --parallel-candidate-limit 4 --compact-json --context-percent 0`: pass; selected 0 candidates, created 0 worktrees.
- `node orchestrator/full-intake-ledger-summary.mjs --ledger .codex-runtime/sdk/generic-repo-importer/aturtur-after-effects-scripts-19599911-intake/queue-ledger.json --compact`: pass; `entries=46`, `reference_only=46`.
- `npm.cmd run check:rules`: blocked by pre-existing untracked `plans/full-intake-unsafe-skip-triage.md` containing an old blocked-status literal; not caused by this milestone's tracked edit.
- `git diff --check`: pass.
- `npm.cmd run smoke:solutions`: pass.
- `npm.cmd run smoke:planning`: pass.
- `npm.cmd run smoke:full-intake`: pass on rerun with a 300s timeout.

Run note 2026-07-06, license override infrastructure:

- `node --check orchestrator/run-generic-repo-auto-intake.mjs`: pass.
- `node --check scripts/sdk-generic-repo-importer-command-smoke.js`: pass.
- `git diff --check`: pass.
- `npm.cmd run smoke:full-intake`: pass; includes default missing-license
  fail-closed fixture and explicit local personal-use override fixture.
- `npm.cmd run smoke:solutions`: pass.
- `npm.cmd run smoke:planning`: pass.
- `npm.cmd run check:rules`: still blocked by pre-existing untracked
  `plans/full-intake-unsafe-skip-triage.md` containing an old blocked-status
  literal; not caused by this infrastructure change.

Run note 2026-07-06, comment-aware risk scan infrastructure:

- `node --check orchestrator/run-generic-repo-auto-intake.mjs`: pass.
- `node --check scripts/sdk-generic-repo-importer-command-smoke.js`: pass.
- `git diff --check`: pass.
- `npm.cmd run smoke:full-intake`: pass; includes a comment-only URL fixture
  proving the candidate is not classified as `usesNetwork`.
- `npm.cmd run smoke:solutions`: pass.
- `npm.cmd run smoke:planning`: pass.
- `npm.cmd run check:rules`: still blocked by pre-existing untracked
  `plans/full-intake-unsafe-skip-triage.md` containing an old blocked-status
  literal; not caused by this infrastructure change.

Run note 2026-07-06, unrelated-untracked reducer guard:

- `node --check orchestrator/run-generic-repo-full-intake.mjs`: pass.
- `node --check orchestrator/parallel-candidate-worktrees.mjs`: pass.
- `node --check scripts/sdk-generic-repo-full-intake-smoke.js`: pass.
- `git diff --check`: pass.
- `npm.cmd run smoke:full-intake`: pass; includes default dirty-central
  fail-closed coverage and explicit unrelated-untracked opt-in coverage.
- `npm.cmd run smoke:solutions`: pass.
- `npm.cmd run smoke:planning`: pass.
- `npm.cmd run check:rules`: still blocked by pre-existing untracked
  `plans/full-intake-unsafe-skip-triage.md` containing an old blocked-status
  literal; not caused by this infrastructure change.

Run note 2026-07-06, importer candidate alias planning fix:

- `node --check orchestrator/run-generic-repo-tool-importer.mjs`: pass.
- `node --check scripts/sdk-generic-repo-importer-command-smoke.js`: pass.
- `git diff --check`: pass.
- `npm.cmd run smoke:full-intake`: pass; includes an underscore queue-id to
  hyphen importer-id alias fixture.
- `npm.cmd run smoke:solutions`: pass.
- `npm.cmd run smoke:planning`: pass.
- `npm.cmd run check:rules`: still blocked by pre-existing untracked
  `plans/full-intake-unsafe-skip-triage.md` containing an old blocked-status
  literal; not caused by this infrastructure change.

Run note 2026-07-06, serial unrelated-untracked intake guard:

- Progress: extended the explicit `--allow-unrelated-untracked-central-tree`
  gate from parallel proposals into serial full-intake, queue-supervisor, and
  importer boundaries so unrelated `??` files can coexist with candidate
  intake without weakening tracked/overlap dirty checks.
- Decision Log: the opt-in records exact unrelated untracked paths in the
  importer manifest/state; importer clean-or-owned checks ignore only those
  exact paths while they remain `??`, and serial candidate commits stage only
  candidate planned paths plus parent-owned plan/handoff paths.
- `node --check orchestrator/run-generic-repo-full-intake.mjs`: pass.
- `node --check orchestrator/run-generic-repo-queue-supervisor.mjs`: pass.
- `node --check orchestrator/run-generic-repo-tool-importer.mjs`: pass.
- `node --check scripts/sdk-generic-repo-full-intake-smoke.js`: pass.
- `node --check scripts/sdk-generic-repo-queue-supervisor-smoke.js`: pass.
- `git diff --check`: pass.
- `node scripts/sdk-generic-repo-queue-supervisor-smoke.js`: pass.
- `node scripts/sdk-generic-repo-full-intake-smoke.js`: pass.
- `npm.cmd run smoke:full-intake`: pass.
- `npm.cmd run smoke:solutions`: pass.
- `npm.cmd run smoke:planning`: pass.
- `npm.cmd run check:rules`: still blocked by pre-existing untracked
  `plans/full-intake-unsafe-skip-triage.md` containing an old blocked-status
  literal; not caused by this infrastructure change.

Run note 2026-07-06, candidate artifact completion guard:

- Progress: added a serial completion gate that blocks a candidate as
  `blocked_no_candidate_artifact` when controlled merge/non-live validation
  produce no candidate planned artifact path beyond parent-owned plan/handoff
  docs.
- Decision Log: the earlier local commit `9412d89` only updated
  `plans/target-app-execplan.md` and did not import a recipe/tool/registry
  artifact, so the plan entry was removed from HEAD and
  `tool-ar_addexpmantainscalewhenparented` must be requeued/rerun under the
  new gate.
- `node --check orchestrator/run-generic-repo-full-intake.mjs`: pass.
- `node --check scripts/sdk-generic-repo-full-intake-smoke.js`: pass.
- `git diff --check`: pass.
- `node scripts/sdk-generic-repo-full-intake-smoke.js`: pass; includes the
  parent-doc-only child fixture proving no candidate artifact cannot complete.
- `npm.cmd run smoke:full-intake`: pass.
- `npm.cmd run smoke:solutions`: pass.
- `npm.cmd run smoke:planning`: pass.
- `npm.cmd run check:rules`: still blocked by pre-existing untracked
  `plans/full-intake-unsafe-skip-triage.md` containing an old blocked-status
  literal; not caused by this infrastructure change.

Run note 2026-07-06, child-runner quota gate:

- Progress: detected `tool-ar_addfolders` failed only because child `codex exec`
  hit usage quota. Reclassified the runtime candidate to
  `blocked_child_runner_usage_limit` with retry text `Jul 7th, 2026 1:14 AM`;
  no product artifact was imported and no next queued candidate was selected.
- Decision Log: quota exhaustion is external runtime state. It is not license,
  missing validation, raw JSX, or candidate-content failure. The new global gate
  stops serial intake while the quota blocker is unresolved.
- `node --check orchestrator/run-generic-repo-full-intake.mjs`: pass.
- `node --check scripts/sdk-generic-repo-full-intake-smoke.js`: pass.
- `git diff --check`: pass, with existing CRLF warnings only.
- `node scripts/sdk-generic-repo-full-intake-smoke.js`: pass.
- `npm.cmd run smoke:full-intake`: pass.
- `npm.cmd run smoke:solutions`: pass.
- `npm.cmd run smoke:planning`: pass.
- `npm.cmd run check:rules`: still blocked by pre-existing untracked
  `plans/full-intake-unsafe-skip-triage.md` containing an old blocked-status
  literal; not caused by this infrastructure change.

Run note 2026-07-06, child-runner quota reset infrastructure:

- Progress: added explicit scoped reset support for user-confirmed Codex
  child-runner usage-limit resets via
  `--resolve-child-runner-usage-limit-reset <ids>`.
- Decision Log: reset requires matching `--resolution-candidate-ids`, records
  `childRunnerUsageLimitReset` and `userDecision` evidence, requeues only the
  named quota-blocked candidate, and does not bypass validation, artifact,
  duplicate, path-policy, reducer, no-push, or no-PR gates.
- `node --check orchestrator/run-generic-repo-full-intake.mjs`: pass.
- `node --check scripts/sdk-generic-repo-full-intake-smoke.js`: pass.
- `node scripts/sdk-generic-repo-full-intake-smoke.js`: pass.
- `git diff --check`: pass, with existing CRLF warnings only.
- `npm.cmd run smoke:full-intake`: pass.
- `npm.cmd run smoke:solutions`: pass.
- `npm.cmd run smoke:planning`: pass.
- `npm.cmd run check:rules`: still blocked by pre-existing untracked
  `plans/full-intake-unsafe-skip-triage.md` containing an old blocked-status
  literal; not caused by this infrastructure change.

Live AE/CEP checks are read-only unless the current milestone explicitly
approves mutation:

- `node scripts/cep-panel-cdp-smoke.js inspect`
- `node scripts/cep-panel-cdp-smoke.js connector-status-smoke`

## Handoff

Use `.codex/handoff.md` after each milestone. Keep it concise: goal, current
state, files touched, validation, decisions, risks, commit id, and exact next
prompt.
