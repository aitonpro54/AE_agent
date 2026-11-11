# Astra: admission перед исправлением 4.2.5

Исполнитель: native gpt-6-astra, high; прямой выбор пользователя.
Snapshot: 0b85436, install-core4 SHA-256
`dcc869fd0cd11fa743c613fbf79df1a9f2db5bab499c207ab9f2bbdb0b466212`.
Read-only review исходников; воспроизведение только в TEMP. Production и MSI
не изменялись. Сохранены синтетический repro и его исходное evidence.

## Исходные findings

1. **P1:** без descriptor/CEP/state/origins, но с прежними transactions/releases
   и config, plan/apply создаёт другую identity поверх прежней истории.
2. **P1:** origins без descriptor/client принимаются; новый descriptor получает
   predecessor:null, хотя прежние CEP/transactions/history существуют.
3. **P1:** settled ledger, добавленный после virgin plan, не охвачен baseline
   и сохраняется при успешном initial apply.

Это подтверждённые дефекты admission, а не доказательство исторического писателя
возврата e0. Четыре исходных TEMP-сценария приведены в evidence-before.json.

## Принятый минимальный контракт

Чистое начало не содержит остатков установки или managed Core binding. При
origins обязателен согласованный descriptor; orphan требует отдельного
восстановления. Под lease и перед switch проверяются только собственные
gates/prepared/stages/release additions, чужое состояние вызывает отказ.
Quoted TOML headers обрабатываются существующим bounded parser.

Initial rollback по-прежнему удаляет sidecar/descriptor и сохраняет origins.
Последующий обычный reapply отказывает как orphan: тест owner-installation
обещает сохранность origins, но не автоматическую переустановку без descriptor.
Новая recovery authority или tombstone в этот fix не добавляется.

## Triage

Все три findings приняты к адресной реализации и регрессиям. Итоговый diff
получит отдельную проверку того же локального reviewer. Argon ещё не проверял
пакет: readiness остановлена защитой Computer Use до отправки.
