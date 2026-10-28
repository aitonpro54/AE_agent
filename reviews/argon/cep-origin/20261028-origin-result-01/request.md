# Запрос Argon: result-review bounded CEP Origin repair

- Review ID: `20261028-origin-result-01`
- Stage ID: `cep-origin`
- Тип: `result`
- Base commit: `aa1659819d3d9e1c51e87326d314f805a775334c`
- Target source commit: `30311539ce2b2eb091d19c179667e513217e41cc`
- Plan-review provenance: `20261028-origin-plan-04`; request SHA-256 `c14069a89c7040a782c82665a2f9a72c9156defcd799cfb2e1dd189e50451f00`; response SHA-256 `df165fdf3be48ca7c1efd5c2bc56b94dbe5dedcbf1405895ee26f19658d1eeeb`.
- Package candidate identity: `6c94efb678b9a56861b18e762076da7b38824bbbe30233770c4133ff81edc696`; candidate file SHA-256 `fd4320d1f0e95540dce83515fffaf21c92bbdac09f82303005d305930f5caad3`.
- Request SHA-256, exact core diff SHA-256 and result bundle SHA-256: см. `context/bindings.json`.

## Цель

Независимо проверить точный core diff от base до target: корректно ли реализованы пять привязанных plan-review findings, отражают ли выбранные scoped checks изменения, и какие блокеры остаются до следующего gated перехода. Это bounded result-review, не полный аудит архитектуры или всего выпуска.

## Текущее состояние и доказательства

В пакете ровно один полный `changes.diff` от указанного base до target по `core4/`, полный текущий `http-peer.js`, полный текущий `panel.js`, полный текущий неизменённый `peer-protocol.js`, краткая source-provenanced сводка closure/tests и точный финальный `validate-diff-02` Node spec stdout. Изменённый test-файл полностью виден в diff. Сводка содержит адресные пути/строки для каждого finding, selected commands/evidence keys, package identity и deferred coverage.

Факт Production Origin ограничен: собственная file-based panel послала `POST /challenge` с Origin `file://`; body/credentials/native commands не читались. Diagnostic observer сообщил `observer-only` отказ; это не installed success. Candidate deterministic/verified, но ещё не installed.

## Вопросы

1. Верно ли закрыт `CEP-ORIGIN-PLAN-01`: точная Origin/CORS граница при exact Host/loopback и одинаковое правило для success/error/OPTIONS без wildcard/credentials?
2. Закрыт ли `CEP-ORIGIN-PLAN-02`: challenge-origin equality и peer-origin guard перед state effects, one-time nonce, sequence/pending/completion/ACK поведение при wrong Origin?
3. Правильно ли сохранена граница `CEP-ORIGIN-PLAN-03`: unchanged peer protocol/signed body, без расширения данных в signed envelope?
4. Достаточно ли test helper и тестов для `CEP-ORIGIN-PLAN-04`, включая duplicate raw header, missing Origin, OPTIONS 204, headers и early rejection без false client errors?
5. Закрыт ли `CEP-ORIGIN-PLAN-05`: panel exact validation перед первым HMAC/link и подпись полного исходного challenge?
6. Какие конкретные defects или uncovered tests реально блокируют следующий разрешённый package dry-run/apply/read-back; что явно остаётся deferred и не должно называться PASS?

## Границы и stop-lines

Проверяйте только этот diff и его приложенное evidence. Не расширяйте аудит на независимые архитектуры/интеграции. Не просите и не выводите credentials, installation/state data, browser profile, пользовательские AEP/assets, local absolute paths или PIDs. Не запускайте команды. Не предполагайте, что offline Node/VM вывод доказывает настоящий browser/CEP/CORS или установленный пакет.

Result-review нужен до package install. Даже `go` не разрешает apply, restart/reopen, live AE/CEP/UI, dispatch, save, raw или destructive операции. Следующие gates должны оставаться отдельными: package dry-run exact hash → явно разрешённый apply → installed release/Node/CEP/config/state read-back → настоящий stdio/status/connect/poll → только разрешённая typed read-only inspection. При mismatch, pending/UNKNOWN или неопределённом исходе — stop/no-replay.

## Требуемый ответ

Подтвердите binding по `context/bindings.json`: Review ID, Stage ID, type, полный base и target commits, SHA-256 полного `changes.diff`, package hash и request SHA-256. Ответьте ровно одним verdict: `go`, `revise`, `stop` или `insufficient-evidence`. Перечислите прочитанные context-файлы и реальные omissions.

Для каждого finding дайте стабильный ID, локальный приоритет P0–P3, утверждение, отказной сценарий, точную ссылку `path:line` и тест/evidence key, статус (`confirmed`, `already addressed`, `not supported` или `requires verification`), новизну (`new/known/duplicate/unknown`), уверенность и минимальный безопасный следующий шаг. Отдельно перечислите blockers для перехода, доказанные ограничения и missing installed/browser/two-machine evidence. Не интерпретируйте verdict как разрешение на установку или live-действия.
