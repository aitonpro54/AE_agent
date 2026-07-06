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

## Decision Log

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

## Next Step

После успешного `check:rules` обновить `.codex/handoff.md`, сделать один
reviewable local commit без push, затем продолжить aturtur intake через
существующий launcher. Если ledger все еще содержит старые shell blockers,
сначала выполнить scoped resolution/requeue, затем bounded retry.
