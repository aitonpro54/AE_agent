# B4: отсутствие contractId не создаёт UNKNOWN

3 ноября 2026. Продолжение базы по поручению «Продолжай дальше», baseline17af595.
Titles/Slideshow остаются на паузе. Root — единственный writer/controller;
работа последовательная, без автоматических субагентов согласно текущему промпту
продолжения. По ae-task-routing это scoped реализация/валидация; исключение из
делегирования обусловлено прямым ограничением текущего scope, модель не меняется.

## Проблема и результат

В configured proof запрос inspect_module_target без contractId получил
owner_outcome_uncertain. Журнал оставался3events, физическая команда не создавалась.
Ошибка обязательного аргумента должна объяснять следующий шаг до runtime invoke,
а потеря ответа после принятой операции по-прежнему должна оставаться UNKNOWN.

Узкий контракт: inspect_module_target требует contractId в формате SHA-256,
возвращаемом get_module_contract. Отсутствующий, пустой или неверно сформированный
contractId получает owner_inspection_contract_required до lease.begin/invoke.
Controller/session/baseline/UNKNOWN/fault gates проверяются прежде этой валидации.
У MCP-ошибки есть nextAction=get_module_contract, без outcome=unknown. Discovery
публикует требование и форму payload. Валидная строка ещё не подтверждает актуальность
контракта: разрешение контракта и все runtime gates сохраняются.

## Файлы и проверки

- runtime/attachment-owner.js: доверенная проверка входа до принятия операции;
  arbitrary thrown errors и native read rejection classifier не изменяются.
- runtime/client-stdio.js: schema/description и адресный nextAction этой ошибки.
- owner-attachments/owner-ipc-process/owner-runtime tests: no-invoke, реальные TEMP stdio/IPC,
  сохранность ledger, последующее корректное чтение, gates и UNKNOWN regression.
- controller-transfer-ipc/work-session-owner/start-over-channel fixtures:
  существующие допустимые inspections получают явный test-only contractId.

Сначала failing regression; затем штатный validate-diff по всем changed paths,
boundaries и diff-check. Full release/Titles/live fault injection не запускаются.
После source acceptance — отдельный штатный package/update и configured proof;
старые settled transactions не повторяются. UNKNOWN history не переименовывается.

## Progress

- Контракт и scope зафиксированы до production edits.
- Source принят: 13selected checks/214fresh cases,55boundaries PASS. Regression
  воспроизвёл owner_outcome_uncertain через настоящий TEMP stdio/IPC до правки;
  теперь отказ до invoke, actionable MCP error и последующее чтение PASS.
- Package21a884faccb5…/distribution41d4812c8e89… собран/verified/dry-run PASS:
  80runtime/98bundle files, изменены только attachment-owner.js/client-stdio.js.
  Actual installed327faaac… пока прежний; далее новая штатная stop/update/enable
  и configured proof. Старые IDs не повторяются.

## Decision Log

- Проверка размещается в generic owner, без module-specific логики и нового
  private issuance/proof API. Только форма обязательного аргумента; не угадывать
  отсутствие dispatch по чистым facts после произвольной ошибки runtime.
- Принятая B1/B2/B3 база остаётся исходным installed checkpoint до новой поставки.

## Validation

- [Source evidence](evidence/core-base-b4-source-20261103.json):13checks/214cases
  выполнены в этом milestone. После остановки CLI на cancelled owner-runtime
  успешные5batches/55cases переиспользованы только по exact current keys; исправленный
  owner-runtime целиком22cases PASS, затем7оставшихся batches PASS. Неуспешный
  cancelled run не принят. Ключи всей выбранной closure перепроверены после прогона.
- TEMP filesystem/process/HTTP/IPC и VM host, без native AE/install действий.
  Native-command outcomes не выводятся из чистого status после произвольной ошибки.
  Production runtime changes:2files. Boundaries55, node --check и diff-check PASS.
- Остальные integration closures в evidence помечены current-closure-unverified;
  full release/portability/native mutation не объявляются PASS. Установка нового
  пакета и configured proof остаются следующим milestone этого же блока.
