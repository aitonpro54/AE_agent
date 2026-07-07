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
- Последний завершенный candidate: `tool-ar_coloriselayersbytype`.
- Последние compact counts: `entries=46`, `completed=4`, `queued=17`,
  `blocked_live_lane_required=24`, `blocked_policy=1`.
- Compact status еще показывает historical `tool-ar_createdivisionguides`
  shell blocker в runtime state; следующий fresh cycle должен начать с compact
  preflight и обычного bounded `--max-items 1` loop.
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
  `tool-ar_addfolders`, `tool-ar_coloriselayers`, and
  `tool-ar_coloriselayersbytype`.
- [x] Repeated child-runner shell blocker stop recorded after three scoped
  candidates hit the same Windows shell launch failure.
- [x] Detached importer child-run advisory import completed for
  `tool-ar_createdivisionguides`.

## Decision Log

- 2026-05-27: Generic full-intake orchestrator processed `AR_CreateDivisionGuides.jsx` as `tool-ar_createdivisionguides`, keeping shared merge/validation/live/doc/commit gates serial and recording blocked candidates without stopping the whole queue (full-intake:full-intake-aturtur-after-effects-scripts:tool-ar_createdivisionguides).

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
- Imported advisory recipe ids require explicit smoke quality/retrieval checks;
  compact plan notes must not preserve legacy runtime markers.

## Progress

- [x] Full intake tool-ar_createdivisionguides: completed by reusable generic full-intake orchestrator (full-intake:full-intake-aturtur-after-effects-scripts:tool-ar_createdivisionguides); live gate not_required, importer batch full-intake-aturtur-after-effects-sc-476049e7d6-import, commit recorded after candidate commit.

- [x] `tool-ar_coloriselayersbytype`: completed by reusable generic full-intake
  orchestrator. Live lane `not_required`; parent reducer accepted only planned
  recipe, registry, smoke, plan and handoff changes.
- [x] `tool-ar_createdivisionguides`: completed by detached importer child-run
  as advisory generated division guide overlay recipe. Live lane not run in the
  child-run by boundary; parent importer owns downstream validation/merge gates.
- [x] `tool-ar_coloriselayers`: completed by reusable generic full-intake
  orchestrator. Live lane `not_required`; parent reducer accepted only planned
  recipe, registry, smoke, plan and handoff changes.
- [x] `tool-ar_addfolders`: completed by reusable generic full-intake
  orchestrator. Live lane `not_required`.
- [x] `tool-ar_addexpmantainscalewhenparented`: completed by reusable generic
  full-intake orchestrator. Live lane `not_required`.
- [x] Post-merge validation cleanup: active plan runtime markers removed and
  solution-library smoke checks added for imported advisory recipe ids.
- [x] Repeated child-runner shell blocker stop: `tool-ar_createdivisionguides`
  reached finalization after non-live validation, then hit the same Windows
  child-runner shell failure; queue burn stopped and later scoped fallback was
  approved by the user for the listed shell-blocked candidates only.

## Validation Notes

Default guard remains `npm.cmd run check:rules`. Source edits also require
`node --check <touched-js-or-mjs>` and `git diff --check`; Full Intaker/importer
edits require relevant smoke coverage.

Latest `tool-ar_coloriselayersbytype` milestone validation state before final
handoff:

- Runner phase `non_live_validation` completed and final proof
  `contractComplete=true`, `unplannedPathCount=0`.
- Compact audit after commit showed tracked tree clean except allowed unrelated
  untracked files.
- Additional post-commit validation found and fixed active-plan guard issues
  before amending the milestone commit.

Latest `tool-ar_createdivisionguides` child-run validation state:

- No validation commands were run in the detached child-run because the
  AUX-021 batch explicitly forbade validation runs.
- Child-run edits were limited to planned recipe, registry, append-only smoke,
  plan, and handoff paths.

## Validation

| Full intake tool-ar_createdivisionguides | Required to let one top-level generic repo intake run handle lane proof, recipe import, non-live validation, generated-only live rerun, ledger update, docs/handoff, and commit for this queued candidate. | Passed in run `full-intake-aturtur-after-effects-scripts`: live lane `not_required`, batch `full-intake-aturtur-after-effects-sc-476049e7d6-import`, live rerun `not_required`, commit `recorded after candidate commit`. No Local/Ollama, fallback provider, dependency/package change, raw JSX copy, source checkout write, broad CEP smoke, push, PR, or GitHub automation was performed. |
