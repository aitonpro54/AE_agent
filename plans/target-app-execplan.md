# План исполнения Target App

## Активный baseline

AE Agent 2.0.0 - локальная CEP-панель After Effects с локальным bridge daemon.
Bridge отвечает за provider-доступ, chat-вызовы, проверку планов AE,
execution gates, логи, checkpoints, защиту edit-session и post-run verification.

Репозиторий остается чистым рабочим baseline: product runtime, typed tools,
recipes, solution registry, provider layer и текущие AE-specific Full
Intaker/importer tooling. Runtime outputs остаются ignored/local.

## Текущий фокус

- Run id: `full-intake-aturtur-after-effects-scripts`.
- Ledger: `.codex-runtime/sdk/generic-repo-importer/aturtur-after-effects-scripts-19599911-intake/queue-ledger.json`.
- Последний завершенный candidate: `tool-ar_maskstofusionpolygons`.
- Compact counts после candidate: `entries=46`, `completed=9`, `queued=12`,
  `blocked_live_lane_required=24`, `blocked_policy=1`, `failed=0`.
- Текущая локальная cleanup-веха для `tool-ar_maskstofusionpolygons` завершена;
  следующий цикл должен продолжить bounded `--max-items 1` loop.
- Push, PR, remote writes, dependency changes, Local/Ollama, fallback providers,
  broad CEP smoke и mutating live AE validation остаются approval-gated.

## Milestones

- [x] Clean baseline/docs guard: runtime outputs ignored/local, current docs
  compact, clean-current guard active.
- [x] Aturtur intake protocol hardening: init, local-use license opt-in,
  comment-aware risk scan, untracked guard, alias resolution, and artifact
  completion guard.
- [x] Child-runner resilience: quota/shell blockers classified, Windows env
  fallback scoped, and queued continuation avoids durable false stops.
- [x] Advisory imports completed through guarded runner:
  `tool-ar_addexpmantainscalewhenparented`, `tool-ar_addfolders`,
  `tool-ar_coloriselayers`, `tool-ar_coloriselayersbytype`,
  `tool-ar_createdivisionguides`, `tool-ar_createfusionloaders`,
  `tool-ar_dividelayersduration`, and `tool-ar_linkpuppetpinstonulls`.
- [x] Post-commit validation cleanup completed for `tool-ar_createdivisionguides`
  and `tool-ar_createfusionloaders`.
- [x] Post-commit validation cleanup for `tool-ar_linkpuppetpinstonulls`.
- [x] Advisory import completed for `tool-ar_maskstofusionpolygons`.
- [x] Post-commit validation cleanup for `tool-ar_maskstofusionpolygons`.
- [ ] Continue bounded `--max-items 1` intake loop for remaining `queued=12`.

## Decision Log

- 2026-07-07: Generic full-intake orchestrator processed
  `AR_MasksToFusionPolygons.jsx` as `tool-ar_maskstofusionpolygons`, keeping
  merge, validation, ledger, docs, handoff, and commit gates parent-owned and
  serial.

- Source license для aturtur игнорируется только как local personal-use blocker.
  Это не разрешает raw JSX copy, remote publication, push, PR, dependency
  changes или отключение validation/reducer gates.
- Parent reducer остается единственным central writer. Child worktrees остаются
  proposal-only: без commit, branch, push, PR, central ledger/docs writes,
  dependency changes, raw JSX copy и live mutation.
- Unrelated local untracked files допустимы только через explicit opt-in и
  только пока они не пересекаются с planned/shared paths.
- Windows sandbox fallback включается только через
  `AE_AGENT_ALLOW_CHILD_RUNNER_DANGER_FULL_ACCESS_ON_WINDOWS_SANDBOX_FAILURE=1`.
  Он меняет только actual child Codex sandbox; detached worktree,
  planned-path checks, no-push/no-PR, duplicate checks, artifact checks и
  validation остаются обязательными.
- Если candidate требует отсутствующий typed tool или proof lane, следующий
  большой цикл должен сначала создать узкий contract/lane, затем requeue/retry
  только подходящих кандидатов через обычные gates.
- Imported advisory recipe ids require explicit smoke quality/retrieval checks;
  compact plan notes must not preserve legacy runtime markers.
- `tool-ar_createdivisionguides` imported as advisory generated visual division
  guide overlays; native `CompItem.addGuide`, ruler snapping, source-exact
  ScriptUI prompts, raw JSX, live validation, dependency changes, push and PR
  remain out of scope.
- `tool-ar_createfusionloaders` imported as advisory generated Fusion Loader
  text export through `export_text_to_file`; temp-folder writes, `File.execute`,
  clipboard behavior, arbitrary user paths, raw JSX, live validation,
  dependency changes, push and PR remain out of scope.
- `tool-ar_dividelayersduration` imported as advisory selected-layer timing
  division through `set_layer_time_range`; layer splitting, ripple edits,
  keyframe shifts, start/stretch/source timing changes, raw JSX, live
  validation, dependency changes, push and PR remain out of scope.
- `tool-ar_linkpuppetpinstonulls` imported as read-only advisory
  `ar-linkpuppetpinstonulls-typed-plan`. It gathers typed active-comp,
  selected-layer/property, layer, and Puppet effect evidence, then reports
  `linkPuppetPinsToNullsSpec` plus missing contracts. Null-controller creation,
  Puppet pin expression/link writes, parenting, cleanup, coordinate-space
  handling, user Puppet/DuIK mutation, raw JSX, live validation, dependency
  changes, push and PR remain out of scope.
- `tool-ar_maskstofusionpolygons` child-run proposal imports
  `ar-maskstofusionpolygons-typed-plan` as a generated file-output advisory:
  one explicit reviewed Mask path is read with `get_path_geometry`, converted
  only into reviewed Fusion Polygon-style text, exported with
  `export_text_to_file`, and read back. Source JSX was absent in the detached
  child worktree; source-exact selected mask traversal, multi-mask batches,
  animated masks, clipboard behavior, arbitrary paths, raw Fusion settings,
  raw JSX, live validation, dependency changes, push and PR remain out of scope.

## Progress

- [x] `tool-ar_maskstofusionpolygons` candidate commit:
  `c1b9b14c1f888f876f4d178535dd0cb2b5fbb79e`; live lane `not_required`,
  proof `contractComplete=true`, unrelated untracked paths allowed by explicit
  local opt-in.

- [x] Guarded runner completed `tool-ar_addexpmantainscalewhenparented`,
  `tool-ar_addfolders`, `tool-ar_coloriselayers`,
  `tool-ar_coloriselayersbytype`, `tool-ar_createdivisionguides`,
  `tool-ar_createfusionloaders`, `tool-ar_dividelayersduration`, and
  `tool-ar_linkpuppetpinstonulls`.
- [x] `tool-ar_linkpuppetpinstonulls` candidate commit:
  `c17da56c5ef63b200c05bf4bf22d284df7bc1a04`; live lane `not_required`,
  proof `contractComplete=true`, unplanned paths `0`.
- [x] Compact closeout after candidate: status completed, ledger
  `completed=8`, `queued=13`, no related processes, tracked tree clean except
  approved unrelated untracked files.
- [x] Cleanup validation for `tool-ar_linkpuppetpinstonulls`: high-risk
  checkpoint gate fixed, retrieval metadata surfaced typed-tool gap guidance,
  plan compacted to 115 lines, and relevant smoke tier passed.
- [x] Cleanup validation for `tool-ar_maskstofusionpolygons`: remove legacy
  runtime markers from plan notes and surface clipboard fail-closed guidance in
  compact retrieval metadata.

## Validation Notes

Default guard remains `npm.cmd run check:rules`. Source edits also require
`node --check <touched-js-or-mjs>` and `git diff --check`; Full Intaker/importer
edits require relevant smoke coverage.

Latest passed tiers before this cleanup: `tool-ar_dividelayersduration` passed
solution-library smoke, `check:rules`, `smoke:solutions`, `smoke:planning`,
`smoke:full-intake`, `git diff --check`, and `git diff --check HEAD~1 HEAD`.

`tool-ar_linkpuppetpinstonulls` post-commit cleanup passed:
`node --check scripts\solution-library-validation-smoke.js`,
`node scripts\solution-library-validation-smoke.js`, `check:rules`,
`smoke:solutions`, `smoke:planning`, `smoke:full-intake`, `git diff --check`,
and `git diff --check HEAD~1 HEAD`. Initial failures were fixed by setting the
high-risk advisory `checkpointOrEditSession` gate, surfacing exact typed-tool
gap retrieval wording, and compacting the active plan from 193 to 115 lines.

`tool-ar_maskstofusionpolygons` post-commit validation initially failed because
the active plan preserved a child-run batch marker and compact solution
retrieval did not surface the clipboard fail-closed warning. Cleanup removes the
runtime marker and moves the clipboard warning into compact intent metadata.
Cleanup validation passed `node --check scripts\solution-library-validation-smoke.js`,
`node scripts\solution-library-validation-smoke.js`, `npm.cmd run check:rules`,
`npm.cmd run smoke:solutions`, `npm.cmd run smoke:planning`,
`npm.cmd run smoke:full-intake`, `git diff --check`, and a targeted `rg`
runtime-marker check.

## Validation

| Full intake tool-ar_maskstofusionpolygons | Required to let one top-level generic repo intake run handle lane proof, recipe import, non-live validation, ledger update, docs/handoff, and commit for this queued candidate. | Passed in run `full-intake-aturtur-after-effects-scripts`: live lane `not_required`, live rerun `not_required`, commit `c1b9b14c1f888f876f4d178535dd0cb2b5fbb79e`. No Local/Ollama, fallback provider, dependency/package change, raw JSX copy, source checkout write, broad CEP smoke, push, PR, or GitHub automation was performed. |
