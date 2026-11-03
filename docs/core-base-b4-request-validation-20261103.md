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

- **Уточнение пользователя 3 ноября:** MCP/Codex maintenance и configured proof
  отложены. Самостоятельные кнопочные действия root относятся прежде всего к
  панели и AE. Их не передавать пользователю; текущие runtime/auth/no-replay gates
  сохраняются. Новый service restart/config repair без прямого поручения не делать.
- Уже запущенный до уточнения helper завершил exact app-server28148 один раз.
  Первый guard отказал без воздействия: CIM timestamp имел микросекундную точность,
  native timestamp —100нс. После сверки exact native birth929 helper выполнил
  одну termination и закончил наблюдение без replacement в своём окне. Позднее
  наблюдён app-server16688/другой parent; происхождение не устанавливалось.
- Read-only snapshot после уточнения: old28148/2708/6340 absent, listener3457
  absent; причина выхода Core6340 неизвестна, survival не заявлен. Та же AE21960,
  AEP/bindings/session/baseline/9events/архивы unchanged. Новых MCP вызовов,
  runtime startup, restart, config changes и AE действий0.
  [Evidence](evidence/core-base-b4-service-refresh-deferred-20261103.json).

Ниже — установленный результат и планы до уточнения.

- Installed milestone: source1e9a63a штатно установлен. Новый stop
  f36e04ce-0aac-474e-9dee-6a922e16bab8 и update
  7b18829f-440a-47f1-8db2-f1ed180fe09b/explicit enable завершены с первой попытки.
  Эти IDs settled, больше не повторять. Package21a884fa…/distribution41d4812c…,
  owner6340/birth639292876604263210/bootd396603c…; один3457, old25380 gone.
  CEP закрыта/открыта1раз через штатный UI, подключилась сама. AE21960 прежний.
- Standard native proof PASS: client18892 exit0, invalid missing contractId →
  owner_inspection_contract_required/nextAction=get_module_contract, journal7events
  побайтно unchanged. Следующий correct-contract read того же saved empty AEP
  inspect-e3a56277… PASS, lease1 released;9settled events/prefix7 exact.
 80runtime/CEP, origins/adoption/session/baseline/absent ledger/14+52archives/AEP
  verified. AE restart/save/mutation/reset0. [Evidence](evidence/core-base-b4-installed-20261103.json).
- Configured cached client2708 пока старый327faaac… и даёт owner_unavailable.
  Project MCP row в settings disabled, отдельного restart нет. Native package
  работает; следующий шаг — scoped служебное обновление app-server28148 после
  фиксации checkpoint, затем configured status/current-session/read/release.
  Текущий runtime chat01a1a034-0635-7712-95b2-a41d743f398c подтверждён metadata;
  других active chats в свежем inventory нет. Новый чат не создавать.

- Контракт и scope зафиксированы до production edits.
- Source принят: 13selected checks/214fresh cases,55boundaries PASS. Regression
  воспроизвёл owner_outcome_uncertain через настоящий TEMP stdio/IPC до правки;
  теперь отказ до invoke, actionable MCP error и последующее чтение PASS.
- Package21a884faccb5…/distribution41d4812c8e89… собран/verified/dry-run PASS:
  80runtime/98bundle files, изменены только attachment-owner.js/client-stdio.js.
  Actual installed327faaac… пока прежний; далее новая штатная stop/update/enable
  и configured proof. Старые IDs не повторяются.

## Decision Log

- Уточнение о границах UI заменяет прежнее расширительное толкование на MCP/
  Codex restart. B4 source/standard native proof остаются принятыми, configured
  proof честно отложен; отсутствие listener не ремонтируется в этом блоке.

- Проверка размещается в generic owner, без module-specific логики и нового
  private issuance/proof API. Только форма обязательного аргумента; не угадывать
  отсутствие dispatch по чистым facts после произвольной ошибки runtime.
- Принятая B1/B2/B3 база остаётся исходным installed checkpoint до новой поставки.

## Validation

- После уточнения выполнены только filesystem/hash/native snapshot и проверка
  завершения уже запущенного helper. Receiver9events/SHA478d66aa… и защищённые
  bindings/AEP совпали с installed checkpoint. Source suites не повторялись;
  новое runtime readiness/configured PASS не заявлено. JSON/diff-check проверены.

- Installed verification/standard negative+native read PASS; evidence выше.
  Защищённые9file bindings и AEP сравнивались с pre-install snapshot; новый
  receiver9events сохраняет exact7event prefix. Configured proof отдельно открыт.
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
