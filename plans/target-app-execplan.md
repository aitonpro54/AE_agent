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

- [x] Clean baseline purge: runtime/log/backup/snapshot/pro-review outputs
  очищены или оставлены ignored/local.
- [x] Documentation/tooling cleanup: текущие README/AGENTS/release/migration
  docs сохранены компактно, исторические evidence/archive ссылки убраны.
- [x] Guard pass: clean-current guard проверяет runtime roots, compact plan,
  ignore surface и legacy-маркеры вне importer protocol fixtures.
- [x] Aturtur reference intake init: auto-intake runtime создан, кандидаты
  обнаружены без импорта product artifacts.
- [x] Local-use license override: добавлен явный opt-in для личного локального
  приема без upstream license blocker; provenance сохраняется, публикация и
  raw-copy не разрешаются.
- [x] Comment-aware risk scan: URL в JSX comments/headers не превращают весь
  кандидат в unsafe network case.
- [x] Unrelated untracked guard: reducer/serial boundaries могут явно терпеть
  unrelated `??` файлы, не staging их и не ослабляя tracked/overlap checks.
- [x] Candidate alias planning: queue ids с underscore корректно резолвятся в
  importer ids с hyphen.
- [x] Candidate artifact completion guard: parent-doc-only изменения больше не
  считаются успешным импортом candidate artifact.
- [x] Child-runner quota gate/reset: quota exhaustion классифицируется как
  внешний blocker, reset разрешен только scoped parent-owned опцией.
- [x] Child-runner shell blocker detection: `CreateProcessWithLogonW failed` и
  `windows sandbox` фиксируются как внешний runtime blocker.
- [x] Windows child-runner fallback/reset: явный env opt-in может запускать
  child Codex с actual `danger-full-access`, сохраняя requested
  `workspace-write` в evidence и все post-run gates.
- [x] Shell-blocker queued continuation: recorded shell blockers больше не
  создают durable global stop, пока остаются другие ranked queued candidates.
- [x] Advisory imports completed for `tool-ar_addexpmantainscalewhenparented`,
  `tool-ar_addfolders`, `tool-ar_coloriselayers`,
  `tool-ar_coloriselayersbytype`, `tool-ar_createdivisionguides`, and
  `tool-ar_createfusionloaders`.
- [x] Repeated child-runner shell blocker stop recorded after three scoped
  candidates hit the same Windows shell launch failure.
- [x] Post-commit validation cleanup completed for `tool-ar_createdivisionguides`.

## Decision Log

- 2026-07-07: Post-commit cleanup for `tool-ar_createdivisionguides` removed
  legacy auxiliary lane markers and moved the native `CompItem.addGuide`
  unsupported warning into compact solution metadata.
- 2026-07-07: Detached child-run imported `tool-ar_createfusionloaders` as an
  advisory generated Fusion Loader text export recipe using selected AVLayer
  source/timing read-back and generated `export_text_to_file` output only.
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
- Imported advisory recipe ids require explicit smoke quality/retrieval checks;
  compact plan notes must not preserve legacy runtime markers.

## Progress

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
