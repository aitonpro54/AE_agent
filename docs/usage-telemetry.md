# Usage-телеметрия AE Agent

## Контракт M6

AE Agent показывает два независимых источника:

- `ae-agent-native` — usage конкретных provider-вызовов, наблюдаемых bridge;
- `codeburn_cli` — необязательные агрегаты установленного CodeBurn.

Они не складываются без общего идентификатора дедупликации. Native имеет приоритет
для точного вызова bridge, а CodeBurn остаётся отдельным aggregate-срезом. Отсутствие,
ошибка или timeout CodeBurn не блокируют bridge, очередь или редактирование After Effects.

Квота — отдельный provider/account snapshot. Она не является расходом конкретного
AE-run, стоимостью подписки или model quota без соответствующей гранулярности источника.
API-equivalent dollars показываются вторично и не переводятся в процент подписки.

## Проверенная локальная установка

19 сентября 2026 года read-only проверка обнаружила `codeburn.cmd` версии `0.9.24`.
Команда отчёта:

```text
codeburn.cmd report --provider codex --period week --format json --refresh 0
```

совпала с [документированным full report JSON](https://codeburn.app/docs/json-output):
metadata, `overview`, `daily`, независимые `models` и `projects`, а также ограниченный
`topSessions`. В фактическом обезличенном shape было 5 model aggregates, 3 project
aggregates и 5 top sessions. Эти числа фиксируют только форму локального снимка, а не
полный список сессий и не совместную матрицу model × project.

Read-only `codeburn.cmd quota --format json` завершился успешно, но доступных quota
windows не вернул: 10 provider-status записей, 0 windows. Нормализованный статус —
`partial`, а не нулевая квота. AE Agent не читает и не копирует auth-файлы, cookies или
tokens CodeBurn/Codex. CLI и flags сверены также с
[документацией команд](https://codeburn.app/docs/cli-options) и release `0.9.24`.

CodeBurn не обновлялся. Его internals, UI, optimizer, guard, sync и sharing не
переносились и не включались.

## Runtime

`GET /usage` возвращает только текущий bounded snapshot и не запускает CodeBurn.
`POST /usage/refresh` вручную обновляет недельный report и quota. Refresh использует
фиксированные allowlisted аргументы, корректный Windows `.cmd` launcher, ограничение
времени и объёма stdout/stderr, coalescing параллельных запросов и cache freshness.
Путь CLI можно явно задать доверенной переменной процесса `CODEBURN_PATH`.

Native records имеют versioned allowlist-контракт, bounded in-memory store и
идемпотентный `recordId`. Missing остаётся `null`, а наблюдаемый ноль — `0`.
`cachedInput` и `reasoning` считаются подмножествами input/output и повторно не
прибавляются. Cumulative snapshots не превращаются в increments. Parent/repair calls
сохраняются отдельными provider-call increments; контейнерные или cumulative totals в
их сумму не добавляются.

Codex CLI по-прежнему запускается с `--ephemeral --json`; видимость во внешнем scanner
не является причиной убирать `--ephemeral`. Если rollout отсутствует, CodeBurn source
показывается как отсутствующий/частичный, а не как нулевой расход.

## Гранулярность и privacy

В UI рядом с каждым источником показываются status/freshness и реальная гранулярность.
Model aggregates и project aggregates не соединяются догадкой. `topSessions` всегда
помечается как incomplete top-5. Worktree отображается только при отдельном поле
источника; cwd/project label сам по себе не доказывает точную run attribution.

Нормализованный ответ не содержит prompts, клиентских текстов, абсолютных project
paths, auth data или сырого stderr. Fixtures в `scripts/fixtures/codeburn-usage/`
вымышлены и обезличены. Платные модельные вызовы для проверки M6 не выполняются.
