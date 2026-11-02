# B3: локальный разбор единственного plan review

## Получение — 2 ноября,21:19 Asia/Yekaterinburg

Исходный ответ получен из [того же диалога](https://gemini.google.com/app/9ff4479f1258260b).
Подтверждены Aiton Pro, обычный «Чат», Argon, «Высокий»; переключений не было.
Новых upload/send/retry0; исходные counts1/1/0 и прежний Debugger unattached
сохранены в metadata. Это получение первого ответа, не второе review.

Raw41896bytes, SHA-256 `35c4e7cecd75f92d9bdc6dd9cde07f453f682f92399f699e834c939bdb028ea3`.
Основные bindings совпали строками; payload/manifest проверены локально.
Заявление рецензента о чтении не является криптографической аттестацией. Raw
неверно переписывает hash owner-maintenance.js; опечатка сохранена, авторитетен
manifest. Все семь actual source hashes сверены с manifest.

Verdict `revise`: шесть design findings, одно упрощение и future evidence gap.
Ниже — disposition владельца по текущим исходникам, без автоматического принятия
предложенных исправлений или расширения scope. Новых runtime/tests ради review нет.

## Disposition владельца

| ID | Локальный результат | Решение и будущая адресная проверка |
| --- | --- | --- |
| B3-F1, P0 | Подтверждён пробел будущего reset fence: attachment-owner.js:106/143 замораживает новые requests, а context.assertCurrent не проверяет frozen; stdio-entry.js:257–262 сохраняет этот guard для delivery | Отдельный физический B3 fence до позднего poll/submit. Обычный maintenance drain не менять. Предложенный aborted_before_delivery автоматически не вводить: для submitted/UNKNOWN допустим conservative AE exit с сохранением истории. Проверить queued-before-submit, submitted-undelivered, delivered и поздний poll |
| B3-F2, P0 | Подтверждено: stdio-entry.js:211–227 diagnostic facade не открывает execution stores и не устанавливает судьбу прежнего AE | Barrier учитывает diagnostic/prior active Node scopes, полное native AE наблюдение и исторические AE identities при наличии. Проверить alive/absent/reused/unknown PID+birth |
| B3-F3, P1 | Принято для нового механизма. owner-lifecycle.js:387/409 блокирует maintenance barrier, но нового reset intent ещё нет. Это не доказанный дефект текущего normal boot | Durable reset fence переживает частичный archive и блокирует ordinary startup до завершения publish. Crash после каждого rename, tampered archive и publish до final record |
| B3-F4, P1 | Подтверждён риск finisher: owner-maintenance.js:109–114 пишет stopped.json после close; crash может оставить только intent/markers | Не ждать receipt вечно и не объявлять outcome успешным. Process-gone-unclean continuation после exact death/election/ownership proof. Проверить crash до receipt и прерванный finisher |
| B3-F5, P1 | Подтверждён риск нового session-key switch: poll-dispatcher.js:12–13 имеет per-dispatcher key/active, native callback36–37 переживает смену dispatcher | Общий window guard для незавершённого native callback; старый callback остаётся на старом key/channel. Reload CEP не proof прекращения AE. Проверить зависший callback, поздний result и lost ACK отдельно |
| B3-F6, P2 | Принято для нового сеанса. Explicit session baseline gate отсутствует, прежние refs/typed/grant gates сохраняются. Это не подтверждение нынешнего authority bypass | Durable baseline-required для текущего session. Только fresh project-inspection снимает его, другие inspections/caller flags/старые refs — нет. Проверить build/effect path до baseline и после owner restart |
| B3-S1, P3 | Принято, соответствует направлению B3a | Один private finisher и тонкие entry adapters, без второго recovery engine |
| B3-E1 | Future B3 evidence действительно отсутствует. Dirty B1/B2 относится к original snapshot: теперь source264522c/2d08c71 и installed standard proof завершены | Не повторять B1/B2 из-за старого описания. Configured MCP требует restart Codex; B3 offline/integration/installed остаются открыты |

Дополнительное локальное уточнение: intent.sources не должен требовать
неизменности live журналов до смерти writer — штатный original completion может
дописаться при drain. В intent сохраняется исходный prefix/target binding;
snapshot для archive фиксируется после death/election и проверяется как
продолжение цепочки. Это исключает ложный stuck reset и подмену истории.

Дополнительно B3-L1: client-entry.js attach/connect повторно использует ту же
installation/machine/package identity. Поэтому сам новый owner boot отзывает
старые handles/refs, но не запрещает старому процессу клиента новый пустой
controller_acquire. В контракт добавлено явное подтверждение текущего server-owned
session для нового control после reset; auto reconnect/старые queued calls не
считаются таким подтверждением. Будущая I-1 проверяет именно этот случай, а не
только использование старого leaseToken. Это локальный design finding, не цитата
и не дополнительное обращение к Argon.

После fsync session-state и освобождения startup gate durable baseline-required
обязан пережить новый owner startup. Чистые stores/session ID не означают
готовность эффектов. Конкретные capabilities/records ещё реализуются.

[Контракт](../../../../docs/core-base-b3-20261102.md) уточнён, immutable переданный
пакет не менялся. Следующий этап — B3a, затем B3b/B3c. Повторного review нет.
Fresh configured core_status по-прежнему вернул owner_unavailable; нужен restart
Codex для установленного2fb5aebe. Новых AE/CEP/stop/install/reset в этом блоке нет.

## История первоначального blocker и решения до получения ответа

## Исход

Запрос отправлен в Aiton Pro / Argon / «Высокий — Глубокий» один раз.
[Исходный диалог](https://gemini.google.com/app/9ff4479f1258260b).
Одна загрузка, одна отправка, retries0. После Runtime.evaluate timeout и kernel
reset штатный канал вернул `Debugger unattached`; controller прекратил browser
действия. Полный response.txt и verdict отсутствуют. Ответ не объявлен полученным,
отклонённым, `go` или `revise`.

Payload/request/manifest/approval/verification/context не менялись после передачи.
Состояние запроса и receipt сохранены в submission.json/response-meta.json.
Пользователю адресно сообщено о восстановлении extension connection. После этого
можно прочитать только уже заказанный ответ; новая отправка не нужна.

## Решение владельца

1. Findings отсутствуют до чтения ответа; не принимать воображаемые замечания.
2. B3 остаётся выбранным контрактом до production write. Не вводить кнопки без
   механизма, не архивировать текущие stores и не завершать старые fences вручную.
3. Требования пользователя об UNKNOWN, no-replay и свежем AE остаются исходной
   приёмкой. Гибель Node owner сама по себе не доказывает прекращения уже
   доставленного AE исполнения; это необходимо проверить в реализации barrier.
4. Независимые готовые B1/B2 исходники приняты локально, оформлены отдельными
   commits и устанавливаются штатным путём. Это не implementation или native
   acceptance B3 и не основание закрыть полный план базы.
5. Восстановить чтение существующего review, локально разобрать его на exact
   snapshot, уточнить B3 contract/files/checks и продолжить реализацию. Повторного
   result/fix/final review автоматически не заказывать.

Финальный diff-check обнаружил пробел после номера пустой source line в
immutable context/source-excerpts.md. Отправленные bytes/manifest не изменены;
для этого одного evidence-файла добавлено узкое `-whitespace` в .gitattributes,
как уже сделано для raw response/bundle. Проверка остальных paths сохраняется.
