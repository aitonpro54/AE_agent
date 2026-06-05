# Target App Execution Plan

## Active Baseline

This clean repository tracks AE Agent 2.0.0: a local After Effects CEP panel
backed by a local bridge daemon. The bridge remains the owner of provider
access, chat calls, AE plan validation, execution gates, logs, checkpoints, and
edit-session protection.

The clean migration intentionally starts without historical audit packet trees,
old execution-plan archives, runtime logs, or generated proof directories. The
old `AE_agent` repository remains the historical source.

## Current State

- Product/runtime files were copied without changing AE tool contracts, bridge
  API, CEP UI semantics, provider contracts, or recipe semantics.
- Current Full Intaker/importer tooling remains available for AE-specific tool
  intake and validation.
- Full Intaker/importer real-run commands now require explicit current ledger
  paths instead of defaulting to generated runtime ledgers from the old
  workspace.
- Generic SDK write/governance history was not copied. Future generic SDK work
  should happen in the sibling `codex-sdk-orchestrator-tool` or a separate
  reviewed migration.

## Progress

- [x] Full intake tool-utilities-milliseconds-to-frames: completed by reusable generic full-intake orchestrator (full-intake:full-intake-kyletmartinez:tool-utilities-milliseconds-to-frames); live gate not_required, importer batch full-intake-kyletmartinez-9262ba748d-import, commit recorded after candidate commit.

- [x] Full intake tool-layers-set-all-layer-labels-to-none: completed by reusable generic full-intake orchestrator (full-intake:full-intake-kyletmartinez:tool-layers-set-all-layer-labels-to-none); live gate ready, importer batch full-intake-kyletmartinez-11ee5a3609-import, commit recorded after candidate commit.

- 2026-06-04: Запущен guarded Full Intaker triage-75 longrun с
  sub-agent/read-only preflight, чистым runtime ledger, scoped lane
  pre-resolution, parallel candidate worktrees и parent-owned serial
  acceptance. Создан fresh ignored ledger из текущего checkout
  `kyletmartinez/after-effects-scripts` плюс legacy candidate metadata,
  расширена существующая layer metadata proof lane, requeued 4 of 5 layer
  metadata candidates, completed four candidates:
  `tool-layers-add-comment-to-selected-layers`,
  `tool-layers-lock-all-layers`, `tool-layers-unlock-all-layers`, and
  `tool-layers-set-all-layer-labels-to-none`. Current triage ledger state:
  75 entries, 15 completed, 60 blocked/skipped, 0 queued, terminal total 75.
- [x] Full intake tool-layers-unlock-all-layers: completed by reusable generic full-intake orchestrator (full-intake:full-intake-kyletmartinez:tool-layers-unlock-all-layers); live gate ready, importer batch full-intake-kyletmartinez-a0fe8c1d95-import, commit recorded after candidate commit.

- [x] Full intake tool-layers-add-comment-to-selected-layers: completed by reusable generic full-intake orchestrator (full-intake:full-intake-kyletmartinez:tool-layers-add-comment-to-selected-layers); live gate ready, importer batch full-intake-kyletmartinez-1c2d17a709-import, commit recorded after candidate commit.

- 2026-06-04: Clean baseline created, validated, and prepared to become the
  active `AE_agent` repo.
- 2026-06-04: Cleanup review removed stale project-memory history, updated the
  MCP config example to the clean path, and added checks against old absolute
  project paths and the old importer ledger default.
- 2026-06-04: Review hardening pass made the MCP config example portable,
  collapsed release notes into a clean v2.0.0 baseline, relaxed provider model
  smoke contracts, refreshed cleanup-migration tense, and clarified the
  `generic-repo:*` Full Intaker/importer boundary.
- 2026-06-04: Added a file-backed Codex Autonomy layer for bounded
  script/tool inventory, ranking, validation lanes, revalidation, reports,
  handoff generation, exact-next-prompt continuation, and Codex CLI supervisor
  dry-run/new-run support.
- 2026-06-04: Ran autonomy iteration 2 as one bounded batch. Five package
  smoke scripts were accepted by existing static lanes; autonomy state is now
  8 accepted, 75 pending, and 0 rejected/needs_lane/needs_revalidation/blocked.
- 2026-06-04: Ran one full remaining autonomy batch with batch size 75.
  Pending queue is exhausted: 78 accepted, 1 rejected, 4 blocked, and 0
  pending/needs_lane/needs_revalidation.
- 2026-06-04: Resolved the 4 autonomy blocked items with explicit safe
  mock/read-only/static fixture lanes and targeted blocked revalidation.
  Autonomy state is now done: 82 accepted, 1 rejected, 0 blocked, and
  0 pending/needs_lane/needs_revalidation.
- 2026-06-04: Added a parent-managed Codex app thread request contract for
  visible UI-thread continuation. The CLI now writes
  `.codex-autonomy/thread_request.json` with the compact prompt, required
  reads, counts, target metadata, and app-tool safety envelope.
- 2026-06-04: AUX-021 child batch
  `tool-layers-add-comment-to-selected-layers` imported the selected-layer
  `Layer.comment` request as a read-only generic-importer advisory recipe and
  registry entry. Actual comment mutation remains fail-closed until a reviewed
  typed writer/read-back contract exists.
- 2026-06-04: AUX-021 child batch
  `tool-layers-unlock-all-layers` imported the active-comp `Layer.locked`
  unlock-all request as a read-only generic-importer advisory recipe and
  registry entry. Actual lock mutation remains fail-closed until a reviewed
  typed writer/read-back contract exists.
- 2026-06-04: AUX-021 child batch
  `tool-layers-set-all-layer-labels-to-none` imported the active-comp
  `Layer.label` set-all-labels-to-None request as a read-only
  generic-importer advisory recipe and registry entry. Actual label mutation
  remains fail-closed until a reviewed typed writer/read-back contract exists.
- 2026-06-04: AUX-021 child batch
  `tool-utilities-milliseconds-to-frames` imported the
  `Utilities/Milliseconds_To_Frames.jsx` request as a read-only
  milliseconds-to-frames utility recipe and registry entry. The safe adaptation
  requires finite milliseconds, finite positive frame rate, explicit rounding
  policy, and optional active-comp frame-rate evidence; project mutation and
  exact source UI semantics remain fail-closed.

## Guardrails

- Keep this plan compact and current.
- Do not recreate historical archive trees in this repository.
- Keep runtime outputs ignored and outside git.
- Treat Local/Ollama as explicitly requested only.
- Do not run broad/default CEP smoke, live mutation, dependency changes,
  push/PR, raw JSX copy, or external-provider planner validation without a
  separate milestone approval.

## Next Milestone

Triage-75 layer metadata queue is exhausted for this bounded slice. Continue
only from compact state (`.codex/handoff.md`, this plan, compact Full Intaker
status/proof, and summary triage ledger). Do not run another real queue item
without a new scoped milestone. Candidate `tool-layers-reset-selected-layer-labels`
still has a terminal unresolved lane ticket; do not retry it without a separate
scoped fix. Push remains forbidden unless separately requested.

## Decision Log

- 2026-05-27: Generic full-intake orchestrator processed `Utilities/Milliseconds_To_Frames.jsx` as `tool-utilities-milliseconds-to-frames`, keeping shared merge/validation/live/doc/commit gates serial and recording blocked candidates without stopping the whole queue (full-intake:full-intake-kyletmartinez:tool-utilities-milliseconds-to-frames).

- 2026-05-27: Generic full-intake orchestrator processed `Layers/Set_All_Layer_Labels_To_None.jsx` as `tool-layers-set-all-layer-labels-to-none`, keeping shared merge/validation/live/doc/commit gates serial and recording blocked candidates without stopping the whole queue (full-intake:full-intake-kyletmartinez:tool-layers-set-all-layer-labels-to-none).

- 2026-06-04: Создан новый ignored clean triage ledger в этом repo вместо
  копирования old runtime proof trees. Ledger использует fresh GitHub checkout
  revision `d017a775fd3f474963313b40882650800917aec9`, 75 ids из
  `plans/full-intake-unsafe-skip-triage.md` и legacy candidate metadata только
  как compact source evidence.
- 2026-06-04: Parallel candidate worktrees полезны для speculative proposals,
  но candidates с generated-only live rerun requirements все еще должны
  приниматься serially parent reducer. Parallel proposals для
  `tool-layers-add-comment-to-selected-layers` и
  `tool-layers-lock-all-layers` были отклонены by design на parent-serial
  live rerun gate.
- 2026-06-04: `tool-layers-lock-all-layers` попал в child-timeout recovery и
  был принят только после parent semantic review плюс `check:rules`,
  `smoke:solutions` и `git diff --check`; ignored ledger записывает manual
  semantic acceptance.
- 2026-05-27: Generic full-intake orchestrator processed `Layers/Unlock_All_Layers.jsx` as `tool-layers-unlock-all-layers`, keeping shared merge/validation/live/doc/commit gates serial and recording blocked candidates without stopping the whole queue (full-intake:full-intake-kyletmartinez:tool-layers-unlock-all-layers).

- 2026-05-27: Generic full-intake orchestrator processed `Layers/Add_Comment_To_Selected_Layers.jsx` as `tool-layers-add-comment-to-selected-layers`, keeping shared merge/validation/live/doc/commit gates serial and recording blocked candidates without stopping the whole queue (full-intake:full-intake-kyletmartinez:tool-layers-add-comment-to-selected-layers).

- 2026-06-04: Created clean-project baseline in a new repository rather than
  rewriting the old repo history.
- 2026-06-04: Kept AE Agent product and current AE-specific Full
  Intaker/importer tools; excluded old audit packet history and plan archives.
- 2026-06-04: Removed default dependencies on the old generated importer ledger;
  future Full Intaker real runs must pass `--ledger <path>` explicitly.
- 2026-06-04: Preserved `docs/cleanup-migration.md` as the only intentional
  old-repo pointer.
- 2026-06-04: `mcp-config.example.json` is a template, not a local install
  record; checked-in config uses portable `node` and a repo placeholder.
- 2026-06-04: Provider smoke should validate provider shape, order, auth/setup
  states, readiness behavior, and env overrides instead of exact
  future-sensitive default model IDs.
- 2026-06-04: `generic-repo:*` package scripts remain current AE-specific Full
  Intaker/importer entrypoints. Generic reusable SDK orchestration belongs in
  the sibling `codex-sdk-orchestrator-tool` via a separate reviewed migration.
- 2026-06-04: The new autonomy layer is intentionally separate from the
  AE-specific Full Intaker/importer surface. `.codex-autonomy/` owns the
  compact state/handoff contract, while runtime `runs/` and `logs/` stay
  ignored and local.
- 2026-06-04: Autonomy continuation uses a deterministic CLI backend
  (`codex exec --sandbox workspace-write -`) and does not use GUI/browser,
  resume, Local/Ollama, fallback providers, broad live smoke, push, or PR by
  default.
- 2026-06-04: Generated validation lanes are minimal static lanes by default;
  they do not execute arbitrary candidate behavior or mask network,
  credential, live-runtime, or destructive risk.
- 2026-06-04: On this Windows PowerShell setup, `npm.ps1` can be blocked by
  execution policy. Use `npm.cmd` for npm scripts in this repo instead of
  changing machine policy.
- 2026-06-04: The local autonomy supervisor creates fresh `codex exec` CLI
  runs from `exact_next_prompt.md`; it does not itself create visible Codex app
  UI threads. App-thread creation remains parent-managed through Codex app
  tools when explicitly needed.
- 2026-06-04: External runtime risk candidates may leave `blocked` only with
  explicit `external_risk_coverage` using a `mock`, `dry-run`,
  `read-only-fixture`, or `static-fixture` strategy. Generated static lanes
  alone remain insufficient for network/credential/live-runtime risk.
- 2026-06-04: The CLI may prepare `.codex-autonomy/thread_request.json`, but it
  does not directly call Codex app tools. Visible UI-thread creation remains a
  parent-managed action using the app's `codex_app.create_thread` capability.
- 2026-06-04: No accepted typed tool currently writes `Layer.comment` on
  selected layers. The imported add-comment workflow must use
  `get_active_comp`, `get_selected_layers`, and optional `get_layer_details`
  for evidence, then report a typed-tool gap rather than substituting marker
  comments, layer renames, labels, expressions, or property edits.
- 2026-06-04: No accepted typed tool currently writes `Layer.locked` across
  active-comp layers. The imported unlock-all workflow must use
  `get_active_comp`, `list_layers`, and optional `get_layer_details` for
  evidence, then report a typed-tool gap rather than substituting selection
  changes, layer renames, switches, expressions, properties, or script
  execution.
- 2026-06-04: No accepted typed tool currently writes `Layer.label` across
  active-comp layers. The imported set-all-layer-labels-to-none workflow must
  use `get_active_comp`, `list_layers`, and optional `get_layer_details` for
  evidence, then report a typed-tool gap rather than substituting selection
  changes, layer renames, switches, properties, or script execution.
- 2026-06-04: Registry input schema uses `comp` for composition evidence.
  Post-validation normalized the imported advisory `activeComp` inputs for
  `unlock-all-layers-typed-plan` and
  `set-all-layer-labels-to-none-typed-plan` from `composition` to `comp`.
- 2026-06-04: `tool-utilities-milliseconds-to-frames` is represented as a
  read-only arithmetic utility, not an AE mutator. `get_active_comp` is
  advisory only when the user asks to derive frame rate from the active
  composition; otherwise frame rate must be explicit.

## Validation

| Full intake tool-utilities-milliseconds-to-frames | Required to let one top-level generic repo intake run handle lane proof, recipe import, non-live validation, generated-only live rerun, ledger update, docs/handoff, and commit for this queued candidate. | Passed in run `full-intake-kyletmartinez`: live lane `not_required`, batch `full-intake-kyletmartinez-9262ba748d-import`, live rerun `not_required`, commit `recorded after candidate commit`. No Local/Ollama, fallback provider, dependency/package change, raw JSX copy, source checkout write, broad CEP smoke, push, PR, or GitHub automation was performed. |

| Full intake tool-layers-set-all-layer-labels-to-none | Required to let one top-level generic repo intake run handle lane proof, recipe import, non-live validation, generated-only live rerun, ledger update, docs/handoff, and commit for this queued candidate. | Passed in run `full-intake-kyletmartinez`: live lane `ready`, batch `full-intake-kyletmartinez-11ee5a3609-import`, live rerun `passed`, commit `recorded after candidate commit`. No Local/Ollama, fallback provider, dependency/package change, raw JSX copy, source checkout write, broad CEP smoke, push, PR, or GitHub automation was performed. |

- Post-acceptance validation for
  `tool-layers-set-all-layer-labels-to-none` passed:
  `node --check scripts/solution-library-validation-smoke.js`,
  `git diff --check`, `npm.cmd run check:rules`,
  `npm.cmd run smoke:solutions`, and `npm.cmd run smoke:full-intake`.
  `smoke:solutions` initially exposed a registry schema mismatch where imported
  advisory active-comp inputs used `composition` instead of the accepted `comp`
  input type; the registry entries were normalized and the smoke passed on
  rerun.

- Full Intaker triage-75 longrun validation passed:
  `node orchestrator/run-generic-repo-auto-intake.mjs --repo https://github.com/kyletmartinez/after-effects-scripts --run-id full-intake-kyletmartinez --context-percent 20 --candidate-limit 200 --parallel-candidate-limit 2 --compact-json`;
  JSON parse checks for the registry and triage ledger;
  `npm.cmd run check:rules`; `npm.cmd run smoke:full-intake`;
  scoped pre-resolution and parallel plan for five layer metadata candidates;
  parallel scoped worktrees for
  `tool-layers-add-comment-to-selected-layers` and
  `tool-layers-lock-all-layers`; serial parent acceptance for
  `tool-layers-add-comment-to-selected-layers`;
  parent semantic-review validation for `tool-layers-lock-all-layers`
  (`npm.cmd run check:rules`, `npm.cmd run smoke:solutions`,
  `git diff --check`); and serial parent acceptance for
  `tool-layers-unlock-all-layers`. Generated-only live reruns passed for
  accepted candidates. Compact proof for latest unlock had
  `contractComplete: true`. Push/PR were not run.
| Full intake tool-layers-unlock-all-layers | Required to let one top-level generic repo intake run handle lane proof, recipe import, non-live validation, generated-only live rerun, ledger update, docs/handoff, and commit for this queued candidate. | Passed in run `full-intake-kyletmartinez`: live lane `ready`, batch `full-intake-kyletmartinez-a0fe8c1d95-import`, live rerun `passed`, commit `recorded after candidate commit`. No Local/Ollama, fallback provider, dependency/package change, raw JSX copy, source checkout write, broad CEP smoke, push, PR, or GitHub automation was performed. |

| Full intake tool-layers-add-comment-to-selected-layers | Required to let one top-level generic repo intake run handle lane proof, recipe import, non-live validation, generated-only live rerun, ledger update, docs/handoff, and commit for this queued candidate. | Passed in run `full-intake-kyletmartinez`: live lane `ready`, batch `full-intake-kyletmartinez-1c2d17a709-import`, live rerun `passed`, commit `recorded after candidate commit`. No Local/Ollama, fallback provider, dependency/package change, raw JSX copy, source checkout write, broad CEP smoke, push, PR, or GitHub automation was performed. |

- Required for the migration milestone: static no-old-reference checks,
  touched-file syntax checks, `git diff --check`, `npm run check:rules`,
  product smoke scripts, and retained Full Intaker/importer smoke scripts.
- Cleanup-review validation passed: touched-file `node --check`,
  `npm.cmd run check:rules`, static stale-reference search, `git diff --check`,
  `npm.cmd run smoke:bridge`, and `npm.cmd run smoke:full-intake`.
- Review-hardening validation passed: touched-file `node --check` for
  `mcp-server/ai-agents.js`, `scripts/provider-contract-smoke.js`,
  `scripts/reliability-validation-suite.js`, and
  `scripts/clean-current-check.js`; `npm.cmd run check:rules`;
  `npm.cmd run smoke:provider-contract`; `npm.cmd run smoke:provider-api`;
  `npm.cmd run smoke:solutions`; `npm.cmd run smoke:planning`;
  `npm.cmd run smoke:full-intake`; `npm.cmd run smoke:bridge`; and
  `git diff --check`.
- Autonomy-layer validation passed: `node --check scripts\autonomy.mjs`;
  `node --check scripts\autonomy-layer-smoke.js`;
  `npm.cmd run check:rules`; `npm.cmd run smoke:autonomy`;
  `npm.cmd run autonomy -- run-once --batch-size 3`;
  `npm.cmd run autonomy -- supervise --dry-run`; and `git diff --check`
  (Windows line-ending normalization warnings only).
- Autonomy iteration 2 bounded step passed: `npm.cmd run autonomy -- run-once
  --batch-size 5`. The requested `npm run ...` form was attempted first, but
  PowerShell blocked `npm.ps1` before the npm script started; no execution
  policy was changed. Follow-up checks passed: `npm.cmd run check:rules` and
  `git diff --check` (Windows line-ending normalization warnings only).
- Autonomy iteration 3 full remaining batch passed as a bounded static pass:
  `npm.cmd run autonomy -- run-once --batch-size 75`. It did not run live CEP/AE
  or real supervise loop. Result: pending 0, accepted 78, rejected 1, blocked 4.
- Autonomy blocked resolution passed: `node --check scripts/autonomy.mjs`;
  `node --check scripts/autonomy-layer-smoke.js`;
  `npm.cmd run autonomy -- revalidate --include-blocked --batch-size 4`;
  `npm.cmd run autonomy -- handoff`; `npm.cmd run smoke:autonomy`;
  `npm.cmd run autonomy -- supervise --dry-run`;
  `npm.cmd run autonomy -- supervise --max-iterations 3
  --max-consecutive-failures 1 --max-wall-time-minutes 5`;
  `npm.cmd run check:rules`; and `git diff --check` (Windows line-ending
  normalization warnings only). Result: autonomy state `done`, accepted 82,
  rejected 1, blocked 0.
- Parent-managed thread request validation passed: `node --check
  scripts/autonomy.mjs`; `node --check scripts/autonomy-layer-smoke.js`;
  `npm.cmd run smoke:autonomy`; and
  `npm.cmd run autonomy -- thread-request`.
- AUX-021 child batch
  `tool-layers-add-comment-to-selected-layers`: validation intentionally not
  run in the detached child worktree because the child-run intent forbids
  validation runs. Parent importer owns registry validation,
  solution-library validation, semantic verification, and any future live
  acceptance lane.
- AUX-021 child batch `tool-layers-unlock-all-layers`: validation intentionally
  not run in the detached child worktree because the child-run intent forbids
  validation runs. Parent importer owns registry validation, solution-library
  validation, semantic verification, and any future live acceptance lane.
- AUX-021 child batch `tool-layers-set-all-layer-labels-to-none`: validation
  intentionally not run in the detached child worktree because the child-run
  intent forbids validation runs. Parent importer owns registry validation,
  solution-library validation, semantic verification, and any future live
  acceptance lane. A local JSON parse sanity check of `registry/solutions.json`
  returned `json-ok`.
- AUX-021 child batch `tool-utilities-milliseconds-to-frames`: validation
  intentionally not run in the detached child worktree because the child-run
  intent forbids validation runs. Parent importer owns registry validation,
  solution-library validation, semantic verification, and any future live
  acceptance lane.

## Handoff

Use `.codex/handoff.md` for compact continuation state after each milestone.
