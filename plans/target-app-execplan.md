# План исполнения Target App

## Активный baseline

AE Agent 2.0.0 - локальная CEP-панель After Effects с bridge daemon.
Baseline содержит только текущий product runtime, typed tools, recipes,
solution registry, provider layer и AE-specific Full Intaker/importer tooling.
Runtime outputs остаются ignored/local.

## Текущий фокус

- Run id: `full-intake-aturtur-after-effects-scripts`.
- Ledger: `.codex-runtime/sdk/generic-repo-importer/aturtur-after-effects-scripts-19599911-intake/queue-ledger.json`.
- Последний completed candidate: `tool-ar_distributekeyframestocomp`.
- Compact counts: `entries=46`, `completed=26`, `queued=1`,
  `blocked_live_lane_required=18`, `blocked_policy=1`, `failed=0`.
- Next: serial parent acceptance with `--max-items 1` for remaining AR
  keyframe candidate `tool-ar_distributekeyframestolayer`.
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
- [ ] Serially accept remaining AR keyframe candidate:
  `tool-ar_distributekeyframestolayer`.
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
- Detached generic-importer child-runs remain proposal-only for queued
  candidates; they may draft recipe/registry/smoke metadata but must not claim
  parent acceptance, source merge, live proof, validation, or commit.
- 2026-07-08: Detached child-runs drafted typed-only AR selected-keyframe
  distribution advisory recipes for by-step, evenly, work-area, and comp-bound
  variants. Source JSX was not present or copied; parent importer owns review,
  validation, acceptance, and source merge.
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

- [x] Full intake tool-ar_distributekeyframestocomp: completed by reusable generic full-intake orchestrator (full-intake:full-intake-aturtur-after-effects-scripts:tool-ar_distributekeyframestocomp); live gate ready, generated-only live rerun passed, commit recorded after candidate commit.
- [x] Full intake tool-ar_distributekeyframestoworkarea: completed by reusable generic full-intake orchestrator (full-intake:full-intake-aturtur-after-effects-scripts:tool-ar_distributekeyframestoworkarea); live gate ready, generated-only live rerun passed, commit recorded after candidate commit.
- [x] Full intake tool-ar_distributekeyframesevenly: completed by reusable generic full-intake orchestrator (full-intake:full-intake-aturtur-after-effects-scripts:tool-ar_distributekeyframesevenly); live gate ready, importer batch full-intake-aturtur-after-effects-sc-9b827826e5-import, commit recorded after candidate commit.
- [x] Full intake tool-ar_distributekeyframesbystep: completed by reusable generic full-intake orchestrator (full-intake:full-intake-aturtur-after-effects-scripts:tool-ar_distributekeyframesbystep); live gate ready, importer batch full-intake-aturtur-after-effects-sc-d79cb843f7-import, commit recorded after candidate commit.
- [x] Full intake tool-ar_alignkeyframes: completed by reusable generic full-intake orchestrator (full-intake:full-intake-aturtur-after-effects-scripts:tool-ar_alignkeyframes); live gate ready, importer batch full-intake-aturtur-after-effects-sc-9e44f0d147-import, commit recorded after candidate commit.

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
- `tool-ar_alignkeyframes` was accepted by parent-owned serial intake, validated,
  committed as `af1d839503814595332536825e0b66095703a51a`, and pushed to
  `origin/codex/pro-review-longrun`.
- `tool-ar_distributekeyframesbystep` was accepted by parent-owned serial
  intake, completed with live lane `ready` and generated-only live rerun
  `passed`, committed as `1dfa4e45a5551a765b3472e5ef3963f8da41ed72`, and
  post-validated with the small prompt-hint support diff in this cycle.
- `tool-ar_distributekeyframesevenly` was accepted by parent-owned serial
  intake, completed with live lane `ready`, generated-only live rerun `passed`,
  and commit `ddda0203d04d1f9963498cbac56e4cf9b91a18c5`.
- Detached importer child-run drafted proposal metadata for
  `tool-ar_distributekeyframestoworkarea` only; validation, live AE/CEP/CDP,
  source merge, commit, push, PR, dependency change, and parent acceptance
  remained parent-owned.
- Detached importer child-run drafted proposal metadata for
  `tool-ar_distributekeyframestocomp` only; validation, live AE/CEP/CDP,
  source merge, commit, push, PR, dependency change, and parent acceptance
  remained parent-owned.

## Validation Notes

Default guard remains `npm.cmd run check:rules`. Source edits require
`node --check <touched-js-or-mjs>` and `git diff --check`. Full Intaker/importer
changes require `smoke:solutions`, `smoke:planning`, and `smoke:full-intake`;
bridge/tooling changes require provider/bridge smoke coverage.

Latest AR keyframe and runner validation passed before this update:
`node --check` for touched JS, `npm.cmd run smoke:planning`,
`npm.cmd run smoke:full-intake`, live CEP `inspect` and
`connector-status-smoke`, and compact proof for
`tool-ar_distributekeyframesevenly` with `contractComplete=true` and
`unplannedPathCount=0`.

## Validation

| Full intake tool-ar_distributekeyframestocomp | Required to let one top-level generic repo intake run handle lane proof, recipe import, non-live validation, generated-only live rerun, ledger update, docs/handoff, and commit for this queued candidate. | Passed in run `full-intake-aturtur-after-effects-scripts`: live lane `ready`, batch `full-intake-aturtur-after-effects-sc-13ce256e50-import`, live rerun `passed`, commit `recorded after candidate commit`. No Local/Ollama, fallback provider, dependency/package change, raw JSX copy, source checkout write, broad CEP smoke, push, PR, or GitHub automation was performed. |

| Full intake tool-ar_distributekeyframestoworkarea | Required to let one top-level generic repo intake run handle lane proof, recipe import, non-live validation, generated-only live rerun, ledger update, docs/handoff, and commit for this queued candidate. | Passed in run `full-intake-aturtur-after-effects-scripts`: live lane `ready`, live rerun `passed`, commit `recorded after candidate commit`. No Local/Ollama, fallback provider, dependency/package change, raw JSX copy, source checkout write, broad CEP smoke, push, PR, or GitHub automation was performed. |

| Full intake tool-ar_distributekeyframesevenly | Required to let one top-level generic repo intake run handle lane proof, recipe import, non-live validation, generated-only live rerun, ledger update, docs/handoff, and commit for this queued candidate. | Passed in run `full-intake-aturtur-after-effects-scripts`: live lane `ready`, batch `full-intake-aturtur-after-effects-sc-9b827826e5-import`, live rerun `passed`, commit `recorded after candidate commit`. No Local/Ollama, fallback provider, dependency/package change, raw JSX copy, source checkout write, broad CEP smoke, push, PR, or GitHub automation was performed. |

| Full intake tool-ar_distributekeyframesbystep | Required to let one top-level generic repo intake run handle lane proof, recipe import, non-live validation, generated-only live rerun, ledger update, docs/handoff, and commit for this queued candidate. | Passed in run `full-intake-aturtur-after-effects-scripts`: live lane `ready`, batch `full-intake-aturtur-after-effects-sc-d79cb843f7-import`, live rerun `passed`, commit `1dfa4e45a5551a765b3472e5ef3963f8da41ed72`, compact proof `contractComplete=true`, `unplannedPathCount=0`. No Local/Ollama, fallback provider, dependency/package change, raw JSX copy, source checkout write, broad CEP smoke, PR, or GitHub automation was performed. |

| Full intake tool-ar_alignkeyframes | Required to let one top-level generic repo intake run handle lane proof, recipe import, non-live validation, generated-only live rerun, ledger update, docs/handoff, and commit for this queued candidate. | Passed in run `full-intake-aturtur-after-effects-scripts`: live lane `ready`, live rerun `passed`, commit `af1d839503814595332536825e0b66095703a51a`, and push to `origin/codex/pro-review-longrun`. No Local/Ollama, fallback provider, dependency/package change, raw JSX copy, source checkout write, broad CEP smoke, PR, or GitHub issue/PR mutation was performed. |

| Child-run proposals for AR distribution candidates | Required to draft importer-owned advisory metadata in detached proposal batches without parent acceptance or live/source merge actions. | Drafted planned typed recipe paths only; validation intentionally not run by child-run boundary. Parent importer owns review, validation, live acceptance, ledger updates, source merge, and commit. |
