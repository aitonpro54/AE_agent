# Измерение контекста инструментов

Стенд блока Б измеряет существующие серверные пути передачи схем. Production-каталог,
планировщик и provider-код не изменяются. Модель, AE и CEP в этом прогоне не выполняются.
Решение о lazy catalog — `defer`: наблюдаемых токенов и парного сравнения качества нет.

## Запуск

Из корня репозитория:

```powershell
node scripts/tool-context-measurement-smoke.js
node scripts/tool-context-measurement.js
```

Первая команда проверяет негативные случаи collectors, streams, каталогов, проекции
summary, изоляции окружения, выхода child и владения каталогом. Вторая запускает один
новый изолированный daemon и один stdio adapter, захватывает пять транспортных
поверхностей и provider HTTP body, а также две локальные синтетические сериализации.
Путь к `report.json` выводится в результате команды. Каждый запуск создаёт отдельный
ignored каталог `.codex-runtime/temp/tool-context-meas-*`; в нём сохраняются отчёт,
полные raw captures, child audit, изолированные журналы и копия bootstrap.

## Что означает отчёт v2

| Поверхность | Доказательство | Единицы |
|---|---|---|
| Daemon `/tools` | Фактическое HTTP body отдельного daemon | UTF-8 байты body; нормализованный JSON отдельно |
| Adapter `tools/list` | Полная строка JSON-RPC с `\n` | UTF-8 байты строки; нормализованный envelope отдельно |
| `get_solution`, 0/1/до 4 preferred contracts | Фактические stdio `tools/call` для одной страницы `comp-visual-review-plan`, offset 0, limit 6000 | Wire envelope и decoded result считаются отдельно; лимит contracts 24000 UTF-16 code units |
| Full/summary канонического run | Локальные синтетические JSON fixture | `wireUtf8Bytes:null`; размер нормализованного JSON, проверка проекции |
| Planner `/agents/plan` | Полный body фактической production-сериализации на локальный capture endpoint | Wire body, нормализованный JSON и извлечённый user prompt — отдельные размеры и SHA-256 |

`payloadSha256` идентифицирует сохранённый raw buffer для транспортных строк.
`serializedJsonUtf16Chars` — `JSON.stringify(parsed).length`, а `wireUtf16Chars` —
длина декодированного исходного транспорта. Размеры HTTP headers/TCP не измеряются.
`promptText` содержит собственные UTF-16 chars, UTF-8 bytes, hash и путь к тексту.
Метаданные planner `promptChars`, `catalogChars`, `selectedToolCount` сверяются
с захваченным текстом по его явным секциям; приватные tool sets не реконструируются.

Каталог adapter сравнивается с точным объединением daemon tools и текущих
`productionUsageTools`, включая полные contracts. Local-only fallback, дубликаты,
подмена имени или схемы делают прогон неуспешным.

`sourceIdentity` содержит Git HEAD, пути и hashes основных исходников до/после
измерения, hashes реально загруженных child modules и время загрузки. Отдельный
`manifestSha256` — hash массива файлов, не hash единственного исходника. Изменение
файла или HEAD во время прогона делает результат неуспешным.

## Изоляция и жизненный цикл

Daemon, adapter и capture-server используют случайные `127.0.0.1` порты; 3456
отклоняется. Adapter auto-start выключен. Дочернее окружение собирается из allowlist,
без унаследованных API keys, proxies, NODE_OPTIONS, PATH, Codex profiles и provider
settings. HOME, CODEX_HOME, logs, state, secrets и `CODEBURN_NATIVE_JOURNAL` задаются
в собственном рабочем каталоге. Явный отсутствующий `CODEX_CLI_PATH` подавляет
поиск настоящего CLI; временный child bootstrap также блокирует nested processes.
Штатный child `git rev-parse HEAD` заменён точной metadata-инъекцией HEAD,
прочитанного родителем; дочерняя команда Git при этом не запускается.

Production `ai-agents` сохраняет встроенные определения providers. Child bootstrap
ограничивает активный API lane точным `capture-provider`, фильтрует health summary
и разрешает исходящие HTTP только на точные capture routes `/models` и
`/chat/completions`. Adapter разрешены только собственные daemon routes. HTTPS,
fetch, прочие HTTP destinations и socket destinations запрещены инструментированием.
Это изоляция данного child-процесса, не изменение глобальной permission policy.

Планирование получает валидный синтетический read-only ответ без usage,
`repairPlan:false`; выполнение плана не вызывается. До и после проверяются
`panelConnected:false`, `pending:0`, `inflight:0`, а также отсутствие native command
events. Synthetic native usage journal остаётся отдельным и не становится расходом
модели. Общий default journal и унаследованный journal, если задан, сравниваются
по существованию, размеру и hash до/после; стенд их не восстанавливает и не удаляет.

Collectors отклоняют overflow без усечения и без изменения накопленной длины.
Потоковые ошибки отклоняют pending promises. Рабочий каталог удаляется только после
наблюдённого `exit` всех собственных child с exitCode или signalCode. Проверяются
абсолютный путь, реальный путь, containment и marker владения. Неизвестный выход,
нарушение source/journal invariants или ошибка проверки сохраняют runtime и
диагностику. Каталог отчёта сохраняется всегда; старые каталоги не удаляются стендом.

## Паритет и пределы вывода

`syntheticParityPassed` относится к канонической проекции: идентичность run/action,
timestamps, counters, execution/mutation/verification/coverage/acceptance,
repairDirective, provenance hashes, semantic counters, step identity и evidence
artifactId/sha256. Omitted `errorCode:null` равен отсутствующему полю.
`projectionOmissions` явно перечисляет args/intent, произвольные result details,
индивидуальные passed checks и evidence observedAt/kind. Это не полный round-trip
и не нативная проверка AE; уменьшение JSON не доказывает экономию токенов.

Observed input/cached/output/reasoning/total остаются `null` с
`reason:no_observed_model_usage`. Импорт внешнего usage в этом стенде отключён;
совместимый helper отвергает любую запись как неподтверждённую и unattributed.
Пользовательские flags, UUID, итоги аккаунта/задачи или fake fixtures не меняют
этот статус. Символы и байты никогда не пересчитываются в токены.

`comparableAB:false`, `tokenSavingsPercent:null`, model-task quality не измерено.
Серверный wire не показывает, как клиент Codex внедряет и кэширует схемы на каждом
ходе; `clientCodexPerTurnFootprint.status` остаётся `unknown`.

Для будущего решения о lazy loading нужны контролируемые парные задачи с одинаковым
model/config, подтверждённые completed response usage и точная связь request hash,
case и варианта, отдельный учёт cached input/reasoning как подмножеств input/output,
сопоставимое качество выбора tools и выполнения, а также наблюдение клиентского
контекста. Этот offline стенд не реализует такой A/B эксперимент.
