# Codex Autonomy Layer

Этот слой дает репозиторию детерминированное продолжение больших проходов по
scripts/tools без переноса старого chat context. Источник правды - файлы в
`.codex-autonomy/`, а новый Codex run получает только компактный
`exact_next_prompt.md`.

## Sources Of Truth

- `state.json` - текущий contract, статусы и следующий шаг.
- `ledger.jsonl` - append-only журнал событий.
- `inventory.json` - найденные candidate scripts/tools.
- `ranking.json` - ранжирование и ranking policy.
- `validation_results.json` - последние результаты validation.
- `lanes/` - generated validation lanes.
- `handoff.md` - человекочитаемый summary.
- `exact_next_prompt.md` - единственный prompt для нового thread/run.
- `thread_request.json` - parent-managed request для создания видимого Codex
  app thread, когда parent agent явно вызывает Codex app tools.
- `reports/` - summary, accepted/rejected lists и validation matrix.

Runtime выводы `runs/` и `logs/` локальные и ignored.

## Commands

Инициализация:

```powershell
npm run autonomy -- init
```

Один bounded проход:

```powershell
npm run autonomy -- run-once --batch-size 5
```

Отдельные шаги:

```powershell
npm run autonomy -- inventory
npm run autonomy -- rank
npm run autonomy -- validate --batch-size 5
npm run autonomy -- lane create --batch-size 5
npm run autonomy -- revalidate --batch-size 5
npm run autonomy -- handoff
```

Supervisor dry-run, без реального запуска Codex:

```powershell
npm run autonomy -- supervise --dry-run
```

Подготовить parent-managed request для видимого Codex app thread:

```powershell
npm run autonomy -- thread-request
```

Supervisor с Codex CLI backend:

```powershell
npm run autonomy -- supervise --max-iterations 3 --max-consecutive-failures 2 --max-wall-time-minutes 30
```

Backend по умолчанию запускает новый context через stdin:

```text
codex exec --sandbox workspace-write -
```

`resume` не используется по умолчанию. Опасный
`--dangerously-bypass-approvals-and-sandbox` не добавляется.

Видимые Codex app threads создаются не из Node CLI, а parent agent'ом через
Codex app tool по данным из `.codex-autonomy/thread_request.json`.

## Reports

Смотреть краткую картину:

```powershell
Get-Content .\.codex-autonomy\reports\summary.md -Encoding UTF8
```

Подробные списки:

- `.codex-autonomy/reports/accepted.md`
- `.codex-autonomy/reports/rejected.md`
- `.codex-autonomy/reports/needs_lane.md`
- `.codex-autonomy/reports/validation_matrix.md`

## Stop And Recovery

Loop останавливается, когда `state.status` становится `done`, `blocked` или
`needs_human`, либо когда supervisor достигает лимитов
`max_iterations`, `max_consecutive_failures` или `max_wall_time_minutes`.

После сбоя:

1. Открой `state.json`, `handoff.md` и `reports/summary.md`.
2. Не читай `runs/` и `logs/` целиком; используй только конкретный failed run.
3. Исправь blocker или оставь его в `blocked/rejected`.
4. Запусти `npm run autonomy -- handoff`.
5. Продолжай из `.codex-autonomy/exact_next_prompt.md`.

## Safety

- Secrets, `.env`, private keys и credential-like файлы не инвентаризируются.
- Dependency/build/cache/runtime директории не сканируются.
- Destructive candidates без dry-run/mock отклоняются.
- Network, credential и live-runtime candidates требуют отдельного mock,
  dry-run или read-only fixture lane; статический generated lane не маскирует
  этот риск.
- Generated lanes по умолчанию не выполняют arbitrary candidate behavior.
