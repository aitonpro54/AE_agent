# Компактная офлайн-диагностика

`scripts/diagnostics.js` за один запуск выполняет явно выбранные проверки,
проверяет переданные receipts и SHA-256 и сохраняет полный JSON в игнорируемый
`logs/diagnostics/`. Терминал показывает счётчики, краткие ошибки, отдельные
пропуски/таймауты и путь к отчёту. Полный stdout/stderr и проверенные receipts
остаются в отчёте.

```powershell
node scripts/diagnostics.js --list
npm.cmd run diagnostics -- --checks=rules,reliability-suite-catalog,semantic-verification,solution-registry
node scripts/diagnostics.js --checks=rules --input=".codex-runtime\diagnostic-input.json"
```

Без `--checks` или непустого `--input` запуск завершается ошибкой с отчётом.
Одного `--input` достаточно для проверки evidence без запуска smoke.
Допустимые IDs перечисляет `--list`; каталог использует проверенные file/fixture
checks из `reliability-validation-suite.js` и отдельный `rules`.
Широкие `local`/`all`, daemon, live AE/CEP, readiness
и provider-проверки выбрать нельзя. Frozen Intaker/importer не запускается;
`rules` только проверяет его существующие locked hashes.

JSON для `--input` содержит только `receipts` и `hashes`, каждый список — не более
64 элементов; файл — не более 1 MiB. UTF-8 BOM поддерживается. Например:

```json
{
  "receipts": [
    {
      "runId": "00000000-0000-0000-0000-000000000001",
      "stepIndex": 1,
      "sha256": "<64 hexadecimal characters from the saved receipt>"
    }
  ],
  "hashes": [
    {
      "path": "scripts/reliability-validation-suite.js",
      "sha256": "<expected SHA-256 of the raw file bytes>"
    }
  ]
}
```

Пример показывает формат; SHA-256 нужно заменить реальными значениями.
Receipts берутся из сохранённых native plan-run records в `logs/`; иной каталог
задаётся `--log-dir=".codex-runtime\recorded-logs"`. Существующий
`getPlanRunEvidence` проверяет hash, schema, run/step/tool и provenance.
Агрегатор дополнительно сверяет hash с переданным pin и проверяет стабильность
record и receipt при полном чтении. Бюджет record/receipt — существующие 16 MiB.
Hashes вычисляются потоково по исходным байтам, без нормализации CRLF.

Все входные пути разрешаются от корня репозитория, включая абсолютные пути
внутри него. Traversal и symlink/junction за его пределы отклоняются. Пути с
пробелами нужно заключать в кавычки. Отчёт получает уникальное имя; его каталог
фиксирован и уже покрывается правилом `logs/` в `.gitignore`.

`--skip=rules` явно пропускает выбранную проверку; отсутствие её скрипта также
даёт `skipped`. `--timeout-ms=1000` меняет таймаут каждой выбранной проверки
(1000–3600000 ms, по умолчанию — timeout из каталога). После дедлайна runner
завершает прямой дочерний процесс, при необходимости принудительно через 1 s;
закрытие output pipes ограничено ещё 2 s от дедлайна. Таймаут остаётся
`timed-out`, даже если процесс завершился с кодом 0. Проверки продолжаются
после ошибок, пропусков и таймаутов; evidence проверяется поэлементно.
Каталог не включает smoke с долгоживущими дочерними process trees;
runner ограничивает прямой процесс, а не произвольные сторонние деревья.

Exit codes: `0` — все выбранные проверки прошли; `1` — ошибка или таймаут;
`2` — есть пропуски без ошибок/таймаутов. Не выбранные проверки не включаются
в число успехов. `--help` и `--list` только показывают справку, отчёт не создают.
Ошибка CLI/JSON также получает отчёт; если файл отчёта сохранить невозможно,
выводится короткая ошибка и exit 1.

`passed` для receipt означает только целостность и привязку исторической записи.
Её исходные step status и run outcome сохраняются отдельно; `unknown`, failure
или pending не превращаются в подтверждённое выполнение. Hash подтверждает
байты при чтении. Свежесть AE, просмотр кадров, текущий runtime, provider
readiness и полная приёмка задачи не устанавливаются.

Зависимости не добавлены. Runner использует `process.execPath`, массив аргументов,
`windowsHide` и пути Node, без shell и `npm.cmd` внутри дочерних запусков.
Офлайн-регрессии: `npm.cmd run smoke:diagnostics`. Фактический запуск на Windows
нужно проверять отдельно от облачного Linux.
