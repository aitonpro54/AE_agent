# План исполнения Target App

## Активный baseline

AE Agent 2.0.0 - локальная CEP-панель After Effects с bridge daemon.
Baseline содержит только текущий product runtime, typed tools, recipes,
solution registry, provider layer и AE-specific Full Intaker/importer tooling.
Runtime outputs остаются ignored/local.

## Текущий фокус

- Run id: `full-intake-aturtur-after-effects-scripts`.
- Ledger: `.codex-runtime/sdk/generic-repo-importer/aturtur-after-effects-scripts-19599911-intake/queue-ledger.json`.
- Последний completed candidate: `tool-ar_distributekeyframestolayer`.
- Compact counts: `entries=46`, `completed=27`, `queued=0`,
  `blocked_live_lane_required=18`, `blocked_policy=1`, `failed=0`.
- Next: create the next feasible lane family for remaining
  `blocked_live_lane_required` candidates.
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
- [x] Requeue scoped AR keyframe candidates once lane proof succeeds:
  `tool-ar_alignkeyframes`, `tool-ar_distributekeyframesbystep`,
  `tool-ar_distributekeyframesevenly`,
  `tool-ar_distributekeyframestocomp`,
  `tool-ar_distributekeyframestolayer`,
  `tool-ar_distributekeyframestoworkarea`.
- [x] Serially accept `tool-ar_distributekeyframesbystep`.
- [x] Serially accept `tool-ar_distributekeyframesevenly`.
- [x] Serially accept AR boundary keyframe candidates:
  `tool-ar_distributekeyframestoworkarea`,
  `tool-ar_distributekeyframestocomp`.
- [x] Serially accept remaining AR keyframe candidate:
  `tool-ar_distributekeyframestolayer`.
- [ ] Create next feasible lane families for remaining visual/effect,
  file/SRT/render/project cleanup, shape/mask, and tracked-light blockers.

## Decision Log

- 2026-05-27: Generic full-intake orchestrator processed `AR_DistributeKeyframesToLayer.jsx` as `tool-ar_distributekeyframestolayer`, keeping shared merge/validation/live/doc/commit gates serial and recording blocked candidates without stopping the whole queue (full-intake:full-intake-aturtur-after-effects-scripts:tool-ar_distributekeyframestolayer).

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
- Detached generic-importer child-runs remain proposal-only for queued
  candidates; they may draft recipe/registry/smoke metadata but must not claim
  parent acceptance, source merge, live proof, validation, or commit.
- 2026-07-08: Detached child-runs drafted typed-only AR selected-keyframe
  distribution advisory recipes for by-step, evenly, work-area, and comp-bound
  variants. Source JSX was not present or copied; parent importer owns review,
  validation, acceptance, and source merge.
- 2026-07-08: Detached child-run drafted typed-only advisory metadata for
  `tool-ar_distributekeyframestolayer`. Source JSX was not present or copied;
  parent importer owns review, validation, acceptance, and source merge.
- 2026-07-08: Parent accepted `tool-ar_distributekeyframestolayer`
  serially with the existing AR boundary keyframe live lane. A small
  `mcp-server/solution-library.js` support diff was accepted separately to
  preserve `distributeKeyframesToLayerSpec`, `layerDistributedKeyframes`,
  `layerDistributionStartTime`, and `layerDistributionEndTime` in prompt
  hints; it does not add execution capability or raw JSX behavior.
- 2026-07-08: Parent accepted `tool-ar_distributekeyframesbystep`
  serially with the existing AR keyframe timing live lane. A small
  `mcp-server/solution-library.js` support diff was accepted separately to
  preserve `distributionAnchorTime` and `distributionStep` in prompt hints; it
  does not add execution capability or raw JSX behavior.
- 2026-07-08: Parent accepted `tool-ar_distributekeyframesevenly`
  after restoring the AE Agent CEP panel on CDP port 8870 and adding a small
  runner recovery fix so failed live reruns can continue when unrelated
  untracked local files are present.
- The first scoped requeue attempt failed after main AR plans validated and ran:
  cleanup M100 proposal rejected `AE_AGENT_QA_*` as an unreviewed generated
  prefix. The fix adds that existing live-harness namespace to the cleanup
  generated-safety contract without relaxing confirmation/read-back gates.
- Live/mutating validation for this milestone used generated QA fixtures,
  bridge-owned M100 proposals, dry-run first, protected edit sessions,
  checkpoints under `backups/`, semantic verification, and cleanup.

## Progress

- Full Intake completed all queued candidates through
  `tool-ar_distributekeyframestolayer`.
- AR keyframe timing/boundary lane family accepted six candidates with
  generated-only live reruns passed and compact proof
  `contractComplete=true`, `unplannedPathCount=0`.
- Latest candidate commit:
  `577cd6e17eedaf4c5f77b5fb062dd2451ecec4b9`
  (`feat: import tool-ar_distributekeyframestolayer recipe`).
- Current support diff preserves layer-bound distribution prompt terms in
  `mcp-server/solution-library.js` after `smoke:solutions` exposed a retrieval
  gap.
- Remaining backlog: `blocked_live_lane_required=18`,
  `blocked_policy=1`, `queued=0`, `failed=0`.

## Validation Notes

Default guard remains `npm.cmd run check:rules`. Source edits require
`node --check <touched-js-or-mjs>` and `git diff --check`. Full Intaker/importer
changes require `smoke:solutions`, `smoke:planning`, and `smoke:full-intake`;
bridge/tooling changes require provider/bridge smoke coverage.

Latest validation in this cycle:
`node --check mcp-server/solution-library.js`,
`node --check scripts/solution-library-validation-smoke.js`,
`npm.cmd run smoke:solutions`, `npm.cmd run smoke:planning`,
`npm.cmd run smoke:full-intake`, and compact proof for
`tool-ar_distributekeyframestolayer` with `contractComplete=true` and
`unplannedPathCount=0`.
