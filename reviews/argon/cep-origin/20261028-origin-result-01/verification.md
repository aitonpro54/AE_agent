# Проверка пакета результата

## Результат

Статус: **COMPLETE** для bounded result-review. Пакет сам по себе не является решением о внедрении или разрешением на установку/live-действия.

- Review ID: `20261028-origin-result-01`; stage: `cep-origin`; тип: `result`.
- Base: `aa1659819d3d9e1c51e87326d314f805a775334c`; target: `30311539ce2b2eb091d19c179667e513217e41cc`.
- Request SHA-256: `74115c96a4211146ca9ec1a0814d2a66a25c1a8c4b6a64151123456fac406542`; diff SHA-256: `f7fdc1747c1aa26ea1ce2d94e64c508e2cae7dbfcd935c8f95932183adfb33b9`.
- Bundle SHA-256: `e353f32aff366554524cc9e4ccaceebc6ef5ad04cff556aa31de817726edb064` (85746 bytes).
- Внешний allowlist содержит только `review-bundle.md`. Все 8 контекстов и request включены; required omissions 0, skipped files 0, redactions 0, unresolved redactions 0, фактических секретов/PII в payload 0.

## Воспроизводимость и source binding

Сборщик skill `build_bundle.py` запущен на explicit allowlist, `--allow-warnings` применён только после ручной проверки сигналов ниже; builder draft не передаётся. Из-за его автоматических secret skips собран окончательный bundle детерминированным последовательным append из одного упорядоченного массива восьми файлов; для каждого контекста использован header с forward-slash путём и ровно шестёрный backtick fence. Request включён в собственном шестёрном fence. Included-files table сформирована из того же массива.

Программная проверка извлекла каждый из 8 context fence blocks и embedded request: exact byte equality со snapshot файлами — PASS. `http-peer.js`, `panel.js`, `peer-protocol.js` побайтно сверены с target commit; `changes.diff` побайтно совпал с `git diff <base> <target> -- core4`. Full bundle строгий UTF-8; SHA-256 и byte count приведены выше. Полный scanner повторно применён к итоговому bundle: все совпадения перечислены и классифицированы ниже; новых или неподтверждённых совпадений нет.

## Диагностика builder и полное whitelist совпадений

Builder на восьми context-файлах: 6 включены автоматически; 2 были пропущены только из-за secret-like regex; 4 PII-like warnings по файлам; redactions 0. Это не omissions в финале: оба файла включены без изменений и exact-byte reconstruction подтверждён. Каждое совпадение финального скана:

| Файл:строка | Класс и точное совпадение | Разбор |
| --- | --- | --- |
| `context/http-peer.js:46` | `generic_secret`: `Token : installation.controlToken` | Статический выбор поля `installation.controlToken`; само свойство и код, не значение. Линия source target и полный файл сверены. Разобранный source-property false positive. |
| `context/changes.diff:62` | `generic_secret`: `Token : installation.controlToken` | Та же строка как часть точного source diff; не отдельный credential. |
| `context/changes.diff:176` | `generic_secret`: `secret = installation.panelToken` | Default parameter test helper с ссылкой на fixture property; literal/runtime token отсутствует. Root проверил точный diff и test line 229. |
| `context/bindings.json:10` | `phone_like`: `64151123456` | Подстрока SHA-256 request, технический digest, не телефон. |
| `context/changes.diff:92` | `phone_like`: `231 100644` | Техническая git index/mode строка diff, не PII. |
| `context/evidence-summary.md:28` | `phone_like`: `10837.0721` | Числовая длительность финального Node test-runner stdout, миллисекунды; не PII. |
| `context/source-metadata.json:15` | `phone_like`: `0469380009` | Подстрока source SHA-256, технический provenance digest, не телефон. |
| `context/validate-diff-02.stdout.txt:462` | `phone_like`: `10837.0721` | Точная duration строка включённого stdout; время выполнения тестов, не PII. |

Остальные generic-secret сигналы отсутствуют; email matches 0. Source property names не содержат значений credential. Ни одно совпадение не было удалено, изменено, обфусцировано или обозначено как redaction.

## Локальный provenance (не включать во внешний payload)

- Observation raw: `snapshots/core4-live-proof/IV-origin-portability-20261028/actual-cep-origin.json`, 422 bytes, SHA-256 `842e033cbffb990765410d74faa5efd913930b2f1760d6deace252dad3f1bc71`; наружу вынесено только краткое наблюдение: собственная file-based panel отправила `POST /challenge` с `Origin: file://`; body, credentials и native commands не читались. Diagnostic observer сообщил отказ `observer-only`, это не production/installed success.
- Baseline reproduction raw: `snapshots/core4-live-proof/IV-origin-portability-20261028/baseline-reproduction/baseline.log.json`, 2207 bytes, SHA-256 `04daf87030d55e9cd87a53df9716942c2af60c2d30bdb805f5a75dfd98881408`; только сводка в request/evidence: synthetic port 0: `Origin: null` → 200 / ACAO null; `file://` → 403 `cep_origin_required`, без ACAO; exit 0, link/native/commands 0. Raw не приложен.
- В локальной manifest хранится получатель Aiton Pro / `aitonpro54@gmail.com` и основание — явное steering пользователя «используй aiton, он открыт». Идентификатор аккаунта не находится в bundle.
- Внешняя классификация: PUBLIC — публичные официальные ссылки не требовались; INTERNAL — source/diff/plan-derived technical context, передан только в bounded review; PRODUCTION-SENSITIVE — минимальная сводка наблюдений/валидации без credential или runtime state; PII и SECRET — исключены.

## Ограничения evidence

Candidate package hash `6c94efb678b9a56861b18e762076da7b38824bbbe30233770c4133ff81edc696` (file SHA-256 `fd4320d1f0e95540dce83515fffaf21c92bbdac09f82303005d305930f5caad3`), 56 files / 286740 bytes; deterministic rebuild был побайтно подтверждён root, но package ещё не установлен. Ранее замороженные scoped checks: installable 20/20, manual 12/12, docs 1/1; boundaries 21 units PASS и syntax/diff PASS. Included stdout — Node spec output, не TAP. Browser/CORS и installed proof отсутствуют; VM offline. Node HTTP parser убирает стандартный surrounding OWS, отдельного wire-level OWS rejection теста нет; отдельного timing-specific activePoll probe нет. Desktop/MSI round-trip и deferred checks не выполнены; full release не сертифицирован. Исторические targeted fixture failures были исправлены только в тестовом helper/canonical; production auth/timeouts/gates не ослаблялись.

Подготовка пакета не выполняла product tests, source changes, install, live/browser/AE/CEP действия, отправку, staging или commit. Действия следующего этапа остаются отдельными gated переходами.
