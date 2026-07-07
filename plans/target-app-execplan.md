# План исполнения Target App

## Активный baseline

AE Agent 2.0.0 - локальная CEP-панель After Effects с bridge daemon.
Baseline содержит только текущий product runtime, typed tools, recipes,
solution registry, provider layer и AE-specific Full Intaker/importer tooling.
Runtime outputs остаются ignored/local.

## Текущий фокус

- Run id: `full-intake-aturtur-after-effects-scripts`.
- Ledger: `.codex-runtime/sdk/generic-repo-importer/aturtur-after-effects-scripts-19599911-intake/queue-ledger.json`.
- Последний completed candidate: `tool-ar_workareatoselectedlayer`.
- Compact counts: `entries=46`, `completed=21`, `queued=0`,
  `blocked_live_lane_required=24`, `blocked_policy=1`, `failed=0`.
- Next: re-run scoped lane resolution/requeue for six AR keyframe candidates,
  then serial parent acceptance with `--max-items 1`.
- Push текущей ветки разрешен после clean validation; PR/GitHub issue/PR
  mutations и unrelated remote writes запрещены.

## Milestones

- [x] Clean baseline/docs guard, runtime ignore policy, and compact plan guard.
- [x] Aturtur intake hardening: init, local-use license opt-in, risk scan,
  untracked guard, alias resolution, artifact guard.
- [x] Child-runner resilience: quota/shell blockers classified; Windows
  danger-full-access fallback scoped to approved child-runner failures.
- [x] Advisory imports completed through
  `tool-ar_workareatoselectedlayer` with parent-owned merge, validation,
  ledger/docs/handoff, commit, and push gates.
- [x] Missing-validation map grouped remaining live blockers into keyframe
  timing, effects, file/SRT/render/project cleanup, shape/mask, and
  tracked-light lane families.
- [x] AR keyframe lane infrastructure: generated-only selected-keyframe timing
  and boundary-distribution lanes for six candidates.
- [x] Cleanup safety fix: generated cleanup M100 contract accepts existing
  `AE_AGENT_QA_*` live-harness namespace while preserving prefix, confirm,
  limit, proposal, checkpoint/edit-session, cleanup, and read-back gates.
- [ ] Requeue scoped AR keyframe candidates once lane proof succeeds:
  `tool-ar_alignkeyframes`, `tool-ar_distributekeyframesbystep`,
  `tool-ar_distributekeyframesevenly`,
  `tool-ar_distributekeyframestocomp`,
  `tool-ar_distributekeyframestolayer`,
  `tool-ar_distributekeyframestoworkarea`.
- [ ] Create next feasible lane families for remaining visual/effect,
  file/SRT/render/project cleanup, shape/mask, and tracked-light blockers.

## Decision Log

- Source license for aturtur is ignored only as a local personal-use blocker.
  It does not permit raw JSX copy, remote publication, PRs, dependency changes,
  or disabled validation/reducer gates.
- Parent reducer remains the only central writer. Child worktrees are
  proposal-only: no commit, branch, push, PR, central ledger/docs writes,
  dependency changes, raw JSX copy, or live mutation.
- Imported advisory recipes are typed-contract/guidance only. Source-exact UI
  side effects, hidden AE selection order, raw JSX semantics, arbitrary
  user-asset/file operations, and unsafe live mutation remain fail-closed unless
  a narrow generated/reviewed lane proves them.
- AR keyframe candidates must not use the older
  `selected-property-keyframe-generated-only` lane; it proves creation/ease and
  count, not exact timing rewrite or boundary redistribution.
- New AR keyframe lanes prove full generated scalar opacity keyframe rewrites
  with `set_property_keyframes clearExisting:true`, exact final times/values,
  `get_selected_properties`, `get_layer_details`, and boundary
  `get_comp_details` evidence where needed.
- The first scoped requeue attempt failed after main AR plans validated and ran:
  cleanup M100 proposal rejected `AE_AGENT_QA_*` as an unreviewed generated
  prefix. The fix adds that existing live-harness namespace to the cleanup
  generated-safety contract without relaxing confirmation/read-back gates.
- Live/mutating validation for this milestone used generated QA fixtures,
  bridge-owned M100 proposals, dry-run first, protected edit sessions,
  checkpoints under `backups/`, semantic verification, and cleanup.

## Progress

- Full Intake completed through `tool-ar_workareatoselectedlayer`; live lanes
  for completed advisory imports were `not_required` and proof remained
  compact with `unplannedPathCount=0`.
- Latest pushed infrastructure commit before this fix:
  `e87a7450478b54e11115a868341bb25ee1d3daf2`
  (`feat: add AR keyframe live lanes`).
- Current milestone repaired the generated cleanup safety contract after
  diagnosis showed the main AR timing and boundary plans validated through
  `/agents/plan/propose`, but cleanup failed with
  `m100_agent_plan_not_valid`.
- After bridge-daemon restart, both AR live smokes passed end-to-end:
  `full-ui-agent-ar-keyframe-timing-openai-cli-smoke` and
  `full-ui-agent-ar-keyframe-boundary-timing-openai-cli-smoke`.

## Validation Notes

Default guard remains `npm.cmd run check:rules`. Source edits require
`node --check <touched-js-or-mjs>` and `git diff --check`. Full Intaker/importer
changes require `smoke:solutions`, `smoke:planning`, and `smoke:full-intake`;
bridge/tooling changes require provider/bridge smoke coverage.

Latest AR keyframe lane infrastructure validation passed:
`node --check` for touched JS, JSON parse for the live-lane registry,
`node scripts/agent-scenario-report-smoke.js`,
`node scripts/solution-library-validation-smoke.js`,
`node scripts/semantic-verification-smoke.js`, `npm.cmd run check:rules`,
`npm.cmd run smoke:solutions`, `npm.cmd run smoke:planning`,
`npm.cmd run smoke:full-intake`, `git diff --check`, and read-only CEP
`inspect`/`connector-status-smoke`.

Current cleanup safety fix validation passed:
`node --check mcp-server/generated-safety-contracts.js`,
`node --check scripts/generated-safety-contracts-smoke.js`,
`node scripts/generated-safety-contracts-smoke.js`,
direct cleanup `/agents/plan/propose` validation for `AE_AGENT_QA_*`,
`npm.cmd run smoke:provider-contract`,
`npm.cmd run smoke:provider-api`,
`full-ui-agent-ar-keyframe-timing-openai-cli-smoke`,
`full-ui-agent-ar-keyframe-boundary-timing-openai-cli-smoke`,
`npm.cmd run check:rules`, `npm.cmd run smoke:bridge`,
`npm.cmd run smoke:solutions`, `npm.cmd run smoke:planning`,
`npm.cmd run smoke:full-intake`, and `git diff --check`.
