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
  где launcher может продолжать прием кандидатов без ложных остановок на
  локальных Windows runner-блокерах.
- Активный run id: `full-intake-aturtur-after-effects-scripts`.
- Ledger: `.codex-runtime/sdk/generic-repo-importer/aturtur-after-effects-scripts-19599911-intake/queue-ledger.json`.
- Текущее состояние очереди до нового retry: часть кандидатов заблокирована
  внешним child-runner shell issue, часть требует live lane, часть остается в
  очереди.
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
  внешний blocker, а reset разрешен только scoped parent-owned опцией.
- [x] Child-runner shell blocker detection: `CreateProcessWithLogonW failed` и
  `windows sandbox` в child Codex run фиксируются как внешний runtime blocker с
  global queue stop.
- [x] Windows child-runner fallback/reset: добавлен явный env opt-in, который
  на Windows может запускать child Codex с actual `danger-full-access`,
  сохраняя requested `workspace-write` в evidence и все post-run gates; старые
  shell blockers можно снять только scoped CLI reset-флагом.
- [x] Full intake import for `tool-ar_addexpmantainscalewhenparented`: добавлен
  advisory typed-plan coverage без raw JSX, live mutation, dependency changes,
  push или PR.
- [x] Child-run import for `tool-ar_addfolders`: добавлен advisory typed-plan
  coverage для generated Project folder creation без raw JSX, live mutation,
  validation runs, dependency changes, commit, push или PR.

## Decision Log

- 2026-05-27: Generic full-intake orchestrator processed `AR_AddFolders.jsx` as `tool-ar_addfolders`, keeping shared merge/validation/live/doc/commit gates serial and recording blocked candidates without stopping the whole queue (full-intake:full-intake-aturtur-after-effects-scripts:tool-ar_addfolders).
- 2026-07-07: AUX-021 child-run `queue-batch-1-98da373076` imported
  `tool-ar_addfolders` as advisory `ar-addfolders-typed-plan`, narrowed to
  reviewed generated Project folder creation via existing typed tools because
  `AR_AddFolders.jsx` was not available in scoped runtime search and exact
  source behavior remains fail-closed.
- 2026-05-27: Generic full-intake orchestrator processed `AR_AddExpMantainScaleWhenParented.jsx` as `tool-ar_addexpmantainscalewhenparented`, keeping shared merge/validation/live/doc/commit gates serial and recording blocked candidates without stopping the whole queue (full-intake:full-intake-aturtur-after-effects-scripts:tool-ar_addexpmantainscalewhenparented).

- Source license для aturtur игнорируется только как local personal-use
  blocker. Это не разрешает raw JSX copy, remote publication, push, PR,
  dependency changes или отключение validation/reducer gates.
- Risk classification смотрит на executable JSX surface, а не на header-only
  provenance comments.
- Parent reducer остается единственным central writer. Child worktrees
  proposal-only: без commit, branch, push, PR, central ledger/docs writes и
  dependency changes.
- Unrelated local untracked files допустимы только через explicit opt-in и
  только пока они не пересекаются с planned/shared paths.
- Quota и shell launch failures являются внешними runtime blockers, а не
  candidate/content failures.
- Windows sandbox fallback включается только через
  `AE_AGENT_ALLOW_CHILD_RUNNER_DANGER_FULL_ACCESS_ON_WINDOWS_SANDBOX_FAILURE=1`.
  Он меняет только actual child Codex sandbox. Detached worktree, planned-path
  checks, no-push/no-PR, no-commit-in-child, duplicate checks, artifact checks и
  validation остаются обязательными.
- Если candidate требует отсутствующий typed tool или proof lane, следующий
  большой цикл должен сначала создать узкий contract/lane, затем requeue/retry
  только подходящих кандидатов через обычные gates.
- `AR_AddExpMantainScaleWhenParented.jsx` импортирован только как advisory
  selected-parented-layer Scale expression workflow на существующих typed tools
  `get_selected_layers`, `get_layer_details` и `set_expression`; parenting
  mutation, unparented-layer handling, raw JSX и source-exact semantics остаются
  fail-closed.
- Imported advisory recipe ids должны иметь явные smoke quality checks; compact
  plan notes не должны сохранять legacy batch/AUX markers в product docs.

## Validation Notes

Базовый guard:

```powershell
npm.cmd run check:rules
```

Для source edits:

```powershell
node --check <touched-js-or-mjs>
git diff --check
```

Для Full Intaker/importer изменений:

```powershell
npm.cmd run smoke:full-intake
```

Последний infrastructure milestone, Windows child-runner fallback:

- `node --check orchestrator/run-generic-repo-tool-importer.mjs`: pass.
- `node --check scripts/sdk-generic-repo-importer-command-smoke.js`: pass.
- `node scripts/sdk-generic-repo-importer-command-smoke.js`: pass.
- `node scripts/sdk-generic-repo-full-intake-smoke.js`: pass.
- `npm.cmd run smoke:full-intake`: pass.
- `git diff --check`: pass, только существующие CRLF warnings.
- `npm.cmd run check:rules`: pass.

## Progress

- [x] Full intake tool-ar_addfolders: completed by reusable generic full-intake orchestrator (full-intake:full-intake-aturtur-after-effects-scripts:tool-ar_addfolders); live gate not_required, importer batch full-intake-aturtur-after-effects-sc-b6730c9f24-import, commit recorded after candidate commit.

- [x] Full intake `tool-ar_addexpmantainscalewhenparented`: completed by the
  reusable generic full-intake orchestrator. Live gate was not required; parent
  reducer accepted only planned recipe, registry, smoke, plan and handoff
  changes.
- [x] Post-merge validation cleanup: legacy runtime markers убраны из активного
  плана, а `solution-library-validation-smoke` получил explicit quality/retrieval
  checks для `ar-addexpmantainscalewhenparented-typed-plan`.
- [x] Child-run `tool-ar_addfolders`: создан recipe
  `recipes/ar-addfolders-typed-plan.md`, intake note
  `recipes/generic-repo-intake/tool-ar_addfolders.md`, registry entry и
  targeted solution-library smoke assertions/retrieval hints. В child-run не
  выполнялись validation runs, live AE/CEP/CDP, source merge, dependency
  changes, commit, push или PR.

## Validation

| Full intake tool-ar_addfolders | Required to let one top-level generic repo intake run handle lane proof, recipe import, non-live validation, generated-only live rerun, ledger update, docs/handoff, and commit for this queued candidate. | Passed in run `full-intake-aturtur-after-effects-scripts`: live lane `not_required`, batch `full-intake-aturtur-after-effects-sc-b6730c9f24-import`, live rerun `not_required`, commit `recorded after candidate commit`. No Local/Ollama, fallback provider, dependency/package change, raw JSX copy, source checkout write, broad CEP smoke, push, PR, or GitHub automation was performed. |
| Full intake `tool-ar_addexpmantainscalewhenparented` | Required to let one top-level generic repo intake run handle lane proof, recipe import, non-live validation, ledger update, docs/handoff, and commit for this queued candidate. | Candidate completed with live lane `not_required` and no live rerun. No Local/Ollama, fallback provider, dependency/package change, raw JSX copy, source checkout write, broad CEP smoke, push, PR, or GitHub automation was performed. |
| Post-merge validation cleanup | Required because `check:rules` rejected legacy runtime markers and `smoke:solutions` required explicit quality coverage for the new advisory recipe id. | `node --check scripts/solution-library-validation-smoke.js`, `npm.cmd run check:rules`, `npm.cmd run smoke:full-intake`, `npm.cmd run smoke:solutions`, `npm.cmd run smoke:planning`, and `git diff --check` passed. |
| Child-run `tool-ar_addfolders` | Required to leave reviewable advisory import artifacts in the detached importer-owned worktree for parent reducer review. | Validation runs were intentionally not run because this child-run forbids validation/live/CEP/AE/OpenAI CLI planner runs. Read-only preflight found no existing `ar-addfolders-typed-plan`, `tool-ar-addfolders`, or `tool-ar_addfolders` registry duplicate before import. |
