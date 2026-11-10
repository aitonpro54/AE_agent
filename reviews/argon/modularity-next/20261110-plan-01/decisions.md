# Локальное решение по архитектуре модулей

База `8e3b718db3c695190a45607064ac04e11d4d5558`. Дата 10 ноября 2026.

## Актуальный результат после уточнения пользователя

Пользователь уточнил режим «Задача». Попытка 02 выполнена под Aiton Pro /
4 Argon в этом режиме с тем же неизменным пакетом. Отдельного selector усилия
нет, что зафиксировано как ограничение наблюдения. Полный ответ получен из
задачи `https://gemini.google.com/app/b377600730f549eb`, verdict `revise`.
Семь bindings совпали. Ответ в `task-attempt-02-response.txt`, квитанции
попытки 02 хранятся отдельно. Предыдущие записи сохранены как история.

## История первой попытки

Контроллер отправил запрос один раз под Aiton Pro в режиме 4 Argon с усилием
«Высокий — Глубокий». Два вложения и начало генерации подтверждены. Затем
вкладка вернулась к пустому редактору, постоянная ссылка не появилась.
Поиск по точному ID не нашёл сообщение. Это не доказывает отсутствие отправки.
Итог `submission-unknown`, полный ответ и verdict отсутствуют.

Внешних findings для разбора нет. Файл response.txt не создан. Следующие
пункты являются локальным аудитом и не приписываются Argon. Дополнительные
owner-maintenance.js, stopped-certification.js и source-package.json прочитаны
локально после замораживания пакета, их хеши в local-audit.json.

## Исторический локальный аудит до ответа

| ID | Внешний / локальный приоритет | Статус и новизна | Evidence на базе | Следующий шаг |
| --- | --- | --- | --- | --- |
| L-01 | — / P1 | Подтверждён, known. Поставка имеет четырёхфайловое ограничение | `core4/tools/package-capability.js`, `MODULE_FILES`, `verifyCapability`, `composeCapability`. Ограничение C1c описано в плане пилота | M1, добавить версионированный data-only файл для comp-render |
| L-02 | — / P1 | Подтверждён, known. Доступность R1 определена несколькими условиями | `runtime/stdio-entry.js:204`, `runtime/client-entry.js:229`, `runtime/attachment-owner.js:12` | M2, единая проверяемая декларация и отрицательные проверки discovery/dispatch |
| L-03 | — / P2 | Подтверждён, known. R1 наследует 14 модулей фотомонтажа и титров | `config/compositions/operator-render-jobs.json`, local-audit.json, 157 файлов | M3, отдельный минимальный сценарий и прежний совмещённый состав |
| L-04 | — / P1 | Пробел контракта подтверждён по source. Практический конфликт требует проверки, новизна unknown | `runtime/stdio-entry.js:667` учитывает Broker/CEP, `runtime/owner-maintenance.js:106` ждёт accepted/pending, `runtime/aerender-jobs.js:296` хранит отдельный active slot | M0 до самостоятельного обновления R1, проверить всю цепочку freeze/stop/update/enable и гонку start |
| L-05 | — / P1 | Подтверждён, known. R1 выполняет privileged file/process/state действия | `runtime/render-job-owner.js`, `stageSpec`, `createRenderJobOwner`, `runtime/aerender-jobs.js` | Сохранить trusted runtime и существующие guards, не подменять service обычным JSX capability |
| L-06 | — / P2 | Подтверждён, known. Независимое обновление сохраняет exact public contract | `tools/package-capability.js`, `composeCapability`, сравнение canonical contracts и admission | M1 включает отказ при изменении схемы, M2/M3 отдельно определяют совместимость release/state |

## Решение первой попытки, заменённое после ответа

Локальный порядок M0 → M1 → M2 → M3 → M4 описан в
`plans/core-modularity-next-20261110.md`. По сравнению с отправленным proposal
контракт обслуживания перемещён вперёд. Независимая поставка проверяется сначала
на обычном comp-render с data-only файлом. Этот порядок является локальным
предложением, внешняя консультация остаётся незавершённой.

На момент первой попытки следующее действие в новом чате — сверить квитанции и разобраться с получением
ответа на исходную отправку. Повтор требует нового явного поручения по
`docs/argon-review-workflow.md`, раздел «Сбой и неизвестный исход». Исторический
submission-unknown сохраняется. Один ответ, если он будет получен, разбирается
локально без автоматического второго result review.

## Проверки первой попытки

Manifest, request, proposal, bundle и все 28 Git-исходников сверяются по SHA-256.
Четыре package manifests воспроизведены в памяти, включая установленный R1.
Изменений исходников исполнения, установки и AE в этом блоке нет.

## Разбор ответа попытки 02

Проверен полный текст ответа, включая рекомендации вне списка F-01–F-05.
Номера строк Argon систематически отличаются от локальных. Ссылки ниже
привязаны к функциям и исходникам базы `8e3b718…`. Scope — планирование.

| Finding | Внешний / локальный приоритет | Статус и новизна | Evidence | Решение и следующий шаг |
| --- | --- | --- | --- | --- |
| F-01a, обслуживания R1 нет в общем снимке | P0 / P0 для допуска обновления R1 | Подтверждён source, known-open L-04. Живой конфликт не воспроизводился | `runtime/stdio-entry.js`, `activity` и `facade.close`. `runtime/owner-maintenance.js`, `drain`/`snapshot`. `tools/stopped-update.js`, `critical` | M0 реализует guard и TEMP проверку до переключения релиза. Race start/freeze, prepare без active, partial/publish, recovery включены |
| F-01b, worker всегда теряется при смене releaseDir/Node | P0 / P2, условный сценарий | В общей формулировке не подтверждается | `runtime/aerender-jobs.js`, `verifyDispatch` и `workerFor` используют сохранённые dispatch.workerEntry и starter.exe. Новый __filename не подменяет прежнюю запись | Риск удаления capability и несовместимого состояния действителен. Проверять сохранение исходных bindings и истории, не объявлять саму смену packageHash потерей worker |
| F-02, включение R1 по имени/наличию файла | P1 / P1 | Подтверждён, known-open L-02 | `stdio-entry.js`, `deriveComposition`. `client-entry.js`, `startClient`. `attachment-owner.js`, `ownerMethods` | M1 согласует декларацию, discovery и dispatch, сохраняет bootstrap guards. Текущий корректно собранный пакет не объявляется уязвимым только из-за разных условий |
| F-03a, project-lifecycle требует project-save proof | P1 / P1 | Подтверждён, new относительно L-01–L-06 | Импорт в `project-lifecycle-proof.js:6`, `declarativeProfiles` проверяет proofPaths. In-memory удаление project-save с сохранением proof получает composition_optional_closure | M2 включает project-save явно. Расширение общего proofPaths пока не требуется |
| F-03b, registry confirmation обязателен | P1 / P1 | Уже учтён, known-open M0/M2 | `deriveComposition` требует registryOperatorConfirmation для R1, `declarativeProfiles` требует файл operator-confirmation | Включить в minimal manifest и TEMP acceptance |
| F-03c, builder принимает render action без знания состава | P1 / P2, UX/discovery | Подтверждён по исключённым файлам, new | `modules/project-lifecycle/contract.json` включает action. `implementation.js`, `checkRender` не получает capability. `project-lifecycle-proof.js`, `validateRenderInput` запрещает исполнение при allowRenderCopy!=true | Защита исполнения уже есть. M1/M2 проверяют реальный отказ до мутации и корректную диагностику, не ослабляют gate ради раннего builder отказа |
| F-04, comp-render не проходит отдельную поставку | P2 / P2 | Подтверждён, known-open L-01 | `package-capability.js`, MODULE_FILES/ARTIFACT_FILES. Вызов packageCapability на comp-render получает capability_closure | M3 после стабилизации runtime, data-only allowlist, exact contract и admission |
| F-05, null dereference без montage | P2 / не дефект текущего пути | Не подтверждается, гипотеза рассмотрена | `operator-confirmation.js:63` optional chaining. `assertDelivery` возвращается без mandateDigest, иначе short-circuit отклоняет отсутствующий mandate до montage.matchesMontageAction. Offline delivery с montage=null успешен, ложный mandate даёт montage_mandate_binding, callback вызван 0 раз | Не добавлять лишнюю защиту. Сохранить full minimal-composition acceptance в M2 |

Адресные результаты в `task-attempt-02-local-checks.json`. Дополнительные
исходники прочитаны локально, а не приписаны внешнему reviewer.

## Уточнения рекомендаций и принятого порядка

1. **M0 раньше остальных изменений.** Согласовать и реализовать обслуживание
   R1 до независимого обновления. Предложение Argon отложить реализацию guard
   до M4 отклонено. M4 остаётся нативной приёмкой уже проверенного guard.
2. **M1 → M2 → M3 принято.** Runtime и минимальный состав стабилизируются до
   проверки capability update, чтобы финальная приёмка ordinary module была
   привязана к актуальным bytes. Прежний локальный comp-render-first заменён.
3. **Терминальная история определяется квитанциями.** Предложение запрещать
   retained prepare-intent/publish-intent целиком отвергнуто. `prepare` и
   `finalize` сохраняют эти записи после published. Guard проверяет цепочку,
   процессы, slot и окончание cleanup, а не отсутствие исторического файла.
4. **Credentials могут штатно ротироваться.** `tools/install-core4.js:278`
   создаёт новые panel/control tokens. Приёмка требует согласованности bindings
   и сохранности пользовательских данных, а не сохранения прежних секретов.
5. **Delta update имеет разрешённые generated files.** В дополнение к файлам
   слота меняются admission, catalog и registry. Фраза Argon «все остальные
   файлы» сужена до независимых модулей, engine и исполняемых runtime-файлов.
6. **Состав и продукт различаются.** Composition — установка возможностей.
   Продуктовый workflow в products/ остаётся потребителем Core.
7. **Схема policy и старые пакеты.** Сохраняем release format 2/owner contract 4
   при достаточности. Добавление поля в exact-key policy требует однозначной
   совместимой ветви для прежних пакетов и отрицательной проверки downgrade.
8. **История после удаления R1.** Нельзя обещать render_job_status при
   отсутствующих render_job_* методах. M0 задаёт сохранение архива и путь
   диагностики/повторного включения совместимого сервиса.

Итоговый план `plans/core-modularity-next-20261110.md` учитывает этот разбор.
Консультация завершена. Новое result review для начала реализации не требуется.
