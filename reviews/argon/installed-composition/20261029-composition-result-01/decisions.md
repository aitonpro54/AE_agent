# Локальный разбор единственного Argon review

Review `20261029-composition-result-01`, target
`ed747efceb47c43c0b185d09262d9ba72f7a0a9f`. Verdict **go** для source/temp этапа,
три P3, заявленных P0–P2 нет. Argon заявил чтение20/20секций; фактическое чтение
и самостоятельный криптографический пересчёт reviewer независимо не доказаны.

Ответ сохранён без правок:21914bytes, SHA256
`b34a30cd08d6e945740069d3d3ae23c476242468b021ff13bf081269e7baad31`.
Root пересчитал request/manifest/bundle/response hashes и hashes всех20разделов
по byte offsets; bindings совпали. Aiton/Argon/Высокий,1upload/1send/0retries.

Составной FINDING-03 разделён на два локальных решения.

| ID | Приоритет | Статус и source evidence | Решение |
| --- | --- | --- | --- |
| F-01 | P3 | Подтверждено дублирование. `stdio-entry.js` target:95,103,105,134–151: два verifyInstallation в start, каждый проверяет release и standalone verifyCep. Для format2/descriptor2 это4обхода и7derivations, а не5из финальной арифметики ответа. Замера замедления нет. | Сохранить проверки: fresh verification после install.lock и самодостаточный historical verifyCep нужны действующему контракту. Оптимизация требует отдельного измеренного основания; trusted Boolean/cache не вводятся ради устранения P3. |
| F-02 | P3 | Подтверждено предусловие helper: format1 ветка напрямую читает два JSON. Все production callers заранее проверяют полный release/package: verifyCep→verifyRelease; start→verifyInstallation; planInstall→verifyPackage; buildPackage проверяет прочитанные bytes. Нового untrusted/public ingress не найдено. | **Исправлено и проверено:** общий checked/json и в legacy ветке; direct missing-hash/tamper negatives, valid fixed fixture и exact-f548 transition PASS. Generic format1 release verification сохраняет прежнюю независимость от manual. |
| F-03a | P3 | Подтверждён пробел conservative source guard: target `check-boundaries.js:29` сканирует только текст до start. В фактическом runtime небuiltin imports идут после повторной verification; bypass не найден. | **Исправлено и проверено:** guard охватывает preverification начало start и tail; четыре позиции nonbuiltin import, missing/duplicate anchors отвергаются. Это source guard, не доказательство произвольного control flow/OS sandbox. |
| F-03b | P3 | Подтверждено: target `stdio-entry.js:180–181`, повторные physical() в connect и отсутствие inspectionAvailable в disconnect. Сами execution gates не менялись. | **Исправлено и проверено:** один physical snapshot после connect; единая physical форма в disconnect. Readonly status/connect/disconnect assertions PASS, канал сохраняет stdio lifetime ownership, disconnected:false. |

## Границы

Один external review завершён. Дополнительное/fix/final review не поручается.
Изменения по F-02/F-03 проверяются локально на новых source/package hashes;
внешний go относится только к frozen target, не к будущим bytes или production.
Исходные request/manifest/bundle/response не редактируются.

## Локальная приёмка исправлений

Изменены только stdio-entry, check-boundaries, existing composition test и его
validation-map dependency. Независимое bounded source review двухфайлового diff:
**ACCEPT**, новых P0–P3 нет, hashes совпали при чтении. Source stdio SHA256
`b756c068a0be8f311d644f38b7b499a94df6fac9972a3f9fc5ccd3e88121ebbf`;
boundary tool `7488fd781172a2f87fb03b0be7fe8b60fb8aeb96779a1437b1bb5d55c77efcb2`.

`implementation/review-fixes/scoped.log`: **75/75 PASS**, exit0,
19recovery +23installable +9composition +12manual +3human +9routing/boundaries.
Отдельный `exact-f548.log`:1/1PASS. Boundaries28PASS, diff-check exit0.
Selection/evidenceKey до/после прогона совпали; файлы не менялись во время run.
Команды/source/log hashes: `implementation/review-fixes/results.json` в
`snapshots/core4-live-proof/XVIII-installed-composition-20261029/`.

Root независимо пересобрал новые пакеты: readonly40
`7a46f386447340ea394174ffde1965dd8b96df4ba1afac3b17ab5938385634ab`, manual59
`3f9293f76f5dbef30f8919151145e28ebceb8fe796ee4495b9747e18e0ff8c51`.
File/manifest hashes и temp-only dry-run standalone installer PASS. Actual
installed f548 и его signed disposition проверены новым source verifier/reader:
descriptor/journal unchanged, store не открывался, native/install0.

Это final scoped PASS, не полная release certification. Прежние73PASS и
intermediate c144/e945 сохраняют свои исходные tested bytes и не переписываются.

Live AE, новое production install, automatic lifecycle, независимая hot-swap
установка пакетов и round-trip P1–P8 остаются открытыми. Review этого не меняет.
