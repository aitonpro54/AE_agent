# План исполнения Target App

## Активный baseline

AE Agent 2.0.0 - локальная CEP-панель After Effects с локальным bridge daemon.
Bridge отвечает за provider-доступ, chat-вызовы, проверку планов AE,
execution gates, логи, checkpoints, защиту edit-session и post-run verification.

Репозиторий остается чистым рабочим baseline: product runtime, typed tools,
recipes, solution registry, provider layer и текущие AE-specific
Full Intaker/importer tooling. Исторические evidence trees, runtime logs и
старые plan archives остаются вне этого репозитория.

## Текущий фокус

- Цель: довести guarded intake для `aturtur/after-effects-scripts` до состояния,
  где launcher продолжает прием кандидатов без ложных остановок на локальных
  Windows child-runner blockers.
- Run id: `full-intake-aturtur-after-effects-scripts`.
- Ledger: `.codex-runtime/sdk/generic-repo-importer/aturtur-after-effects-scripts-19599911-intake/queue-ledger.json`.
- Последний завершенный candidate: `tool-ar_createfusionloaders`.
- Последние compact counts: `entries=46`, `completed=6`, `queued=15`,
  `blocked_live_lane_required=24`, `blocked_policy=1`.
- Перед новым candidate добирается deferred post-commit smoke tier для
  `tool-ar_createfusionloaders`, затем обычный bounded `--max-items 1` loop.
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
  `tool-ar_createdivisionguides`, and `tool-ar_createfusionloaders`.
- [x] Detached child-run imported `tool-ar_dividelayersduration` as an advisory
  selected-layer timing division recipe using `set_layer_time_range` with
  selected-layer order, first-layer duration, frame-boundary rounding, and
  `get_layer_details` read-back.
- [x] Detached child-run imported `tool-ar_linkpuppetpinstonulls` as a read-only
  advisory typed-tool-gap recipe for Puppet pin to null-controller linking,
  limited to typed evidence gathering and future contract requirements.
- [x] Repeated child-runner shell blocker stop recorded after three scoped
  candidates hit the same Windows shell launch failure.
- [x] Post-commit validation cleanup completed for `tool-ar_createdivisionguides`.

## Decision Log

- 2026-05-27: Generic full-intake orchestrator processed `AR_LinkPuppetPinsToNulls.jsx` as `tool-ar_linkpuppetpinstonulls`, keeping shared merge/validation/live/doc/commit gates serial and recording blocked candidates without stopping the whole queue (full-intake:full-intake-aturtur-after-effects-scripts:tool-ar_linkpuppetpinstonulls).

- 2026-05-27: Generic full-intake orchestrator processed `AR_DivideLayersDuration.jsx` as `tool-ar_dividelayersduration`, keeping shared merge/validation/live/doc/commit gates serial and recording blocked candidates without stopping the whole queue (full-intake:full-intake-aturtur-after-effects-scripts:tool-ar_dividelayersduration).

- 2026-07-07: Post-commit cleanup for `tool-ar_createdivisionguides` removed
  legacy auxiliary lane markers and moved the native `CompItem.addGuide`
  unsupported warning into compact solution metadata.
- 2026-07-07: Detached child-run imported `tool-ar_createfusionloaders` as an
  advisory generated Fusion Loader text export recipe using selected AVLayer
  source/timing read-back and generated `export_text_to_file` output only.
- 2026-07-07: Detached child-run imported `tool-ar_dividelayersduration` as an
  advisory selected-layer `inPoint`/`outPoint` timing recipe. Source-exact AE
  selection internals, native undo behavior, layer splitting, ripple edits,
  keyframe shifts, `startTime`/stretch/source timing changes, raw JSX, live
  validation, dependency changes, push and PR remain out of scope.
- 2026-07-07: Detached child-run imported `tool-ar_linkpuppetpinstonulls` as a
  read-only advisory `ar-linkpuppetpinstonulls-typed-plan`. Source JSX was not
  present in the child worktree, so actual null-controller creation, Puppet pin
  expression/link writes, parenting, cleanup, coordinate-space handling, user
  Puppet/DuIK mutation, raw JSX, live validation, dependency changes, push and
  PR remain out of scope.
- 2026-07-07: Post-commit smoke cleanup for `tool-ar_createfusionloaders`
  kept the active plan compact and moved the `File.execute` editor-launch
  warning into compact retrieval metadata.

- Source license для aturtur игнорируется только как local personal-use blocker.
  Это не разрешает raw JSX copy, remote publication, push, PR, dependency
  changes или отключение validation/reducer gates.
- Risk classification смотрит на executable JSX surface, а не на header-only
  provenance comments.
- Parent reducer остается единственным central writer. Child worktrees остаются
  proposal-only: без commit, branch, push, PR, central ledger/docs writes и
  dependency changes.
- Unrelated local untracked files допустимы только через explicit opt-in и
  только пока они не пересекаются с planned/shared paths.
- Quota и shell launch failures являются внешними runtime blockers, а не
  candidate/content failures.
- Windows sandbox fallback включается только через
  `AE_AGENT_ALLOW_CHILD_RUNNER_DANGER_FULL_ACCESS_ON_WINDOWS_SANDBOX_FAILURE=1`.
  Он меняет только actual child Codex sandbox; detached worktree,
  planned-path checks, no-push/no-PR, no-commit-in-child, duplicate checks,
  artifact checks и validation остаются обязательными.
- Если candidate требует отсутствующий typed tool или proof lane, следующий
  большой цикл должен сначала создать узкий contract/lane, затем requeue/retry
  только подходящих кандидатов через обычные gates.
- `tool-ar_coloriselayers` imported as advisory `ar-coloriselayers-typed-plan`,
  narrowed to selected active-comp `Layer.label` updates through
  `set_layer_metadata`; palette UI, random/cycling labels, Project item labels,
  cross-comp mutation, raw JSX, live validation, dependency changes, push and PR
  remain out of scope.
- `tool-ar_coloriselayersbytype` imported as advisory
  `ar-coloriselayersbytype-typed-plan`, narrowed to active-comp `Layer.label`
  updates grouped only by typed layer-kind evidence and a reviewed
  `typeToLabelMap`; source-exact classifier behavior, hidden AE class checks,
  palette UI, automatic label selection, Project item labels, property colors,
  broad project scans, raw JSX, live validation, dependency changes, push and PR
  remain out of scope.
- `tool-ar_createdivisionguides` imported as advisory
  `ar-createdivisionguides-typed-plan`, narrowed to generated visual division
  guide overlays computed from reviewed row/column counts and typed comp
  dimensions; native `CompItem.addGuide`, ruler snapping, guide-index semantics,
  existing guide cleanup, source-exact ScriptUI prompts, raw JSX, live
  validation, dependency changes, push and PR remain out of scope.
- `tool-ar_createfusionloaders` imported as advisory
  `ar-createfusionloaders-typed-plan`, narrowed to generated Fusion Loader text
  export from current selected AVLayer source/timing evidence through
  `export_text_to_file`; temp-folder writes, `File.execute`, editor launch,
  clipboard behavior, raw Fusion settings, arbitrary user paths, unsupported
  formats, raw JSX, live validation, dependency changes, push and PR remain out
  of scope.
- `tool-ar_dividelayersduration` imported as advisory
  `ar-dividelayersduration-typed-plan`, narrowed to reviewed selected-layer
  timing division through `set_layer_time_range`; ambiguous selection order,
  non-positive first-layer duration, unsafe targets, layer splitting, ripple
  edits, keyframe shifts, `startTime`/stretch/source timing changes, raw JSX,
  live validation, dependency changes, push and PR remain out of scope.
- Imported advisory recipe ids require explicit smoke quality/retrieval checks;
  compact plan notes must not preserve legacy runtime markers.

## Progress

- [x] Full intake tool-ar_linkpuppetpinstonulls: completed by reusable generic full-intake orchestrator (full-intake:full-intake-aturtur-after-effects-scripts:tool-ar_linkpuppetpinstonulls); live gate not_required, importer batch full-intake-aturtur-after-effects-sc-a312b6a586-import, commit recorded after candidate commit.

- [x] Full intake tool-ar_dividelayersduration: completed by reusable generic full-intake orchestrator (full-intake:full-intake-aturtur-after-effects-scripts:tool-ar_dividelayersduration); live gate not_required, importer batch full-intake-aturtur-after-effects-sc-06c3b720e1-import, commit recorded after candidate commit.

- [x] Advisory candidates completed through guarded runner:
  `tool-ar_addexpmantainscalewhenparented`, `tool-ar_addfolders`,
  `tool-ar_coloriselayers`, `tool-ar_coloriselayersbytype`,
  `tool-ar_createdivisionguides`, and `tool-ar_createfusionloaders`. Parent
  accepted only planned recipe, registry, smoke, plan, and handoff changes.
- [x] `tool-ar_createdivisionguides` cleanup: plan markers removed, compact
  retrieval warning fixed, cleanup smokes passed.
- [x] Post-merge validation cleanup: active plan runtime markers removed and
  solution-library smoke checks added for imported advisory recipe ids.
- [x] Repeated child-runner shell blocker stop: `tool-ar_createdivisionguides`
  reached finalization after non-live validation, then hit the same Windows
  child-runner shell failure; queue burn stopped and later scoped fallback was
  approved by the user for the listed shell-blocked candidates only.
- [x] `tool-ar_createfusionloaders` deferred post-commit smoke tier: plan kept
  below the compact guard limit and solution retrieval warning fixed.
- [x] `tool-ar_dividelayersduration` child-run: recipe, intake note, registry
  metadata, and append-only solution-library smoke coverage added in detached
  importer worktree without validation runs.
- [x] `tool-ar_linkpuppetpinstonulls` child-run: read-only recipe, intake note,
  registry metadata, handoff, and append-only solution-library smoke coverage
  added in detached importer worktree without validation runs.
- [ ] Continue bounded `--max-items 1` intake loop for remaining `queued=15`.

## Validation Notes

Default guard remains `npm.cmd run check:rules`. Source edits also require
`node --check <touched-js-or-mjs>` and `git diff --check`; Full Intaker/importer
edits require relevant smoke coverage.

Latest `tool-ar_createdivisionguides` cleanup passed: `node --check
scripts\solution-library-validation-smoke.js`, `git diff --check HEAD~1 HEAD`,
`git diff --check`, `check:rules`, `smoke:solutions`, `smoke:planning`, and
`smoke:full-intake`.

Latest `tool-ar_createfusionloaders` post-commit cleanup validation passed:
`node --check scripts\solution-library-validation-smoke.js`,
`node scripts\solution-library-validation-smoke.js`, `check:rules`,
`smoke:solutions`, `smoke:planning`, and `smoke:full-intake` (first
`smoke:full-intake` attempt timed out at 120s; 300s rerun passed).

`tool-ar_dividelayersduration` child-run validation was intentionally not run
inside the proposal-only child worktree. Parent importer should run the relevant
solution-library smoke tier before source merge acceptance.

`tool-ar_linkpuppetpinstonulls` child-run validation was intentionally not run
inside the proposal-only child worktree. Parent importer should run the relevant
solution-library smoke tier before source merge acceptance.

## Validation

| Full intake tool-ar_linkpuppetpinstonulls | Required to let one top-level generic repo intake run handle lane proof, recipe import, non-live validation, generated-only live rerun, ledger update, docs/handoff, and commit for this queued candidate. | Passed in run `full-intake-aturtur-after-effects-scripts`: live lane `not_required`, batch `full-intake-aturtur-after-effects-sc-a312b6a586-import`, live rerun `not_required`, commit `recorded after candidate commit`. No Local/Ollama, fallback provider, dependency/package change, raw JSX copy, source checkout write, broad CEP smoke, push, PR, or GitHub automation was performed. |

| Full intake tool-ar_dividelayersduration | Required to let one top-level generic repo intake run handle lane proof, recipe import, non-live validation, generated-only live rerun, ledger update, docs/handoff, and commit for this queued candidate. | Passed in run `full-intake-aturtur-after-effects-scripts`: live lane `not_required`, batch `full-intake-aturtur-after-effects-sc-06c3b720e1-import`, live rerun `not_required`, commit `recorded after candidate commit`. No Local/Ollama, fallback provider, dependency/package change, raw JSX copy, source checkout write, broad CEP smoke, push, PR, or GitHub automation was performed. |
