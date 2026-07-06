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
- [x] AUX-021 detached child-run import: scoped batch
  `queue-batch-1-3826875c5d` добавил advisory typed-plan coverage для
  `tool-ar-addexpmantainscalewhenparented` без source merge, commit, live runs
  или raw JSX.

## Decision Log

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

Последний milestone, Windows child-runner fallback:

- `node --check orchestrator/run-generic-repo-tool-importer.mjs`: pass.
- `node --check scripts/sdk-generic-repo-importer-command-smoke.js`: pass.
- `node scripts/sdk-generic-repo-importer-command-smoke.js`: pass.
- `node scripts/sdk-generic-repo-full-intake-smoke.js`: pass.
- `npm.cmd run smoke:full-intake`: pass.
- `git diff --check`: pass, только существующие CRLF warnings.
- `npm.cmd run check:rules`: pass.

AUX-021 `queue-batch-1-3826875c5d`:

- Validation/smoke команды не запускались: child-run intent запретил validation
  runs, live AE/CEP/CDP/OpenAI CLI planner runs, package/dependency changes,
  commits и source merge.
- Изменения ограничены planned paths batch-а.

## Next Step

Parent importer должен прочитать detached worktree diff для
`queue-batch-1-3826875c5d`, выполнить собственные planned-path/source-merge
gates и только затем решать, принимать ли advisory typed-plan import в parent
repo. Child-run commit/source merge не выполнялся по hard boundary.

## Progress

- [x] Full intake tool-ar_addexpmantainscalewhenparented: completed by reusable generic full-intake orchestrator (full-intake:full-intake-aturtur-after-effects-scripts:tool-ar_addexpmantainscalewhenparented); live gate not_required, importer batch full-intake-aturtur-after-effects-sc-af04158558-import, commit recorded after candidate commit.

## Validation

| Full intake tool-ar_addexpmantainscalewhenparented | Required to let one top-level generic repo intake run handle lane proof, recipe import, non-live validation, generated-only live rerun, ledger update, docs/handoff, and commit for this queued candidate. | Passed in run `full-intake-aturtur-after-effects-scripts`: live lane `not_required`, batch `full-intake-aturtur-after-effects-sc-af04158558-import`, live rerun `not_required`, commit `recorded after candidate commit`. No Local/Ollama, fallback provider, dependency/package change, raw JSX copy, source checkout write, broad CEP smoke, push, PR, or GitHub automation was performed. |
