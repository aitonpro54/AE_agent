# Core 4.2.5: причина смешения и защита переноса

## Цель и границы

По поручению пользователя установить причину двух identity на DESKTOP-32974QF,
исправить общий механизм переноса, выпустить и отправить в origin Core 4.2.5.
Подключить Argon и Astra к одному ограниченному кросс-ревью. MSI не изменять.
Текущая рабочая 4.2.4, обе доступные истории, настройки и AEP сохраняются.
Пользовательская правка AGENTS.md остаётся вне продуктовых коммитов.

## Progress

- База: 0b85436; восстановление инцидента завершено, запуск 4.2.4 принят.
- Причинную цепь и общую границу исследует ae_specialist recovery_boundary.
  Независимое чтение выполняет Astra/high по прямому выбору пользователя.
  Координатор остаётся единственным writer/controller живой установки.
- Подтверждено: identity 7ece создана initial install 7e2bc281, а не update 004c.
  В initial transaction previousDescriptor/client/CEP отсутствовали,
  previousConfig существовал. Исторический писатель возврата e0 ещё исследуется.
- Проверка готовности Argon направлена существующему локальному контроллеру
  ARGON_BrowserUse. Запрос и файлы ревью ещё не передавались в Gemini.
- Astra/high завершила независимый анализ: три P1 admission воспроизведены
  в четырёх TEMP-сценариях; исходный source hash и evidence сохранены в
  reviews/astra/core-transfer/20261111/. Контракт принят, реализация и
  адресная техническая валидация переданы ae_implementer package_verify.
- Конкретный запуск создания 7ece найден в локальном rollout: 10 ноября
  05:22:27Z, standalone initial apply при неизменившемся managed config.
  Bounded поиск завершён: писатель исчезновения root/возврата e0 не найден.
  Доказанный admission defect и открытый исторический пробел разделены в
  [расследовании](../docs/core-transfer-mixed-root-cause-20261111.md).

## Decision Log

- Не подменять первопричину описанием уже выполненного incident repair.
  Разделять доказанный admission gap, историческую причинную цепь и гипотезы.
- Предварительный воспроизводимый gap: отсутствие файлов установки позволяет
  создать identity при существующей managed Core binding в project config.
  Контракт исправления фиксируется после причинного исследования и ревью.
- Argon получает минимальный allowlist без credentials, backup/state, AEP,
  настроек и полных журналов. Astra работает read-only по локальным исходникам.
  Одно ограниченное Argon review, дальнейший разбор замечаний локальный.
- Coherent existing descriptor проверяется существующим pure verifier вместе
  с CEP; existing managed config должен указывать на прежнюю установленную
  binding. Отсутствие Core entry в новом workspace само по себе допустимо.
- Origins без descriptor отказывают как orphan. Initial rollback сохраняет
  свою прежнюю семантику; автоматический reapply после него не обещается.
  Tombstone/новая recovery authority не добавляются.
- Astra проверила реализацию и приняла второй snapshot `1cb25357…`/`b2f1b5e9…`.
  Два замечания первого снимка (historical Node как data и v1 CEP) исправлены
  адресно без ослабления runtime verifier. Итог —
  [review-final](../reviews/astra/core-transfer/20261111/review-final.md).
- Argon readiness остановлена Computer Use: URL окна не определён надёжно,
  Chrome extension не подключён. Отправок/вложений нет; обходов нет.
  Пользователю направлена просьба подключить Aiton/Gemini штатным способом.
- После ответа пользователя «готово» штатное Chrome extension подключение
  Aiton подтверждено существующим controller. Пользователь затем разрешил
  конкретный immutable payload 5600ae49… (9 файлов, bundle 242874 байта).
  Один review направлен контроллеру; другие uploads/повторы не разрешены.
  Request/manifest/approval находятся в reviews/argon/core-transfer/20261111-result-01/.
- Argon вернул go на снимок 1cb25357…, полный ответ совпал при повторном открытии
  по SHA a1b1fdca…. Astra независимо подтвердила F01–F03 и риск потери custom
  Core keys; локальные доработки и регрессии переданы тому же ae_implementer.
  [Decision log](../reviews/argon/core-transfer/20261111-result-01/decision-log.md).
- Итоговая локальная доработка принята Astra на snapshot 99f7e7b4…/eaddb6fa…/
  224bc697…. Семь narrow groups и boundaries 88 PASS; запущен fresh scoped run
  с install-lease path. Immutable Argon payload сохранён, новых отправок нет.
- Дополнительный bounded forensic 4–8 ноября выполнен ae_scout/Luna:
  writer root rename/restore не найден; coverage добавлен в расследование.
  Приёмка installation 53/53, native-read-recovery 19/19 и installed-composition
  PASS на текущих bytes. Итоговая selection с lease включает 41 check/batch.
- Последний точный anchor lookup по всем sessions (13 matching files) добавил
  ранний чат от 29 октября и подтвердил штатный e0 update 7f 8 ноября.
  Команда root rename/restore не найдена; дальнейший поиск без новых evidence
  не назначается. Это остаётся явным пределом расследования.
- Координатор как единственный live-controller проверил actual read-only plan
  4.2.5 поверх здоровой установленной 4.2.4: identity/predecessor сохранены,
  12 descriptor/client/origin/config/CEP bindings побайтно неизменны.
  Candidate package `b24af0e1…`; production writes/native commands/acquire/apply=0.
  Proof: .codex-runtime/core-4.2.5-implementation-20261111/actual-coherent-plan.json.
- В усиленном snapshot выявлен лишний повторный ancestor walk на каждом файле.
  Старый снимок 99f7… прошёл stopped-update 60/60 (2229s) и legacy migration
  29/29 (431s), но добавленная стоимость обхода требует исправления до выпуска.
  Astra приняла контракт локального lstat + полного realpath файла при сохранении
  проверок каждого directory/root. Новая реализация и benchmark поручены Sol/high.
- Старый runner остановлен после проверки PID/birth/script и TEMP scope;
  рабочие Core/AE исключены, TEMP не удалён. Interruption receipt сохранён локально.
  Старые PASS не объявляются current evidence новых bytes; eligible reuse только
  при неизменившемся exact key. После performance delta — новая selection.
- Performance delta e2e5bed8…/c790c116… (lease eadd… прежний) принята Astra.
  1000-file benchmark дал byte-exact digest, wall 3.1–3.3s → 0.78–0.83s,
  lstat 12007→1008. Полный legacy case почти не ускорился (30.918→30.825s),
  поэтому ускорение всей recovery suite не заявляется. Fresh selection 41 запущена.
- Actual read-only plan повторён координатором на e2e5…: same identity/lineage,
  12 bindings unchanged, runtime package b24af0e1… прежний, production/native=0.
  Proof: .codex-runtime/core-4.2.5-implementation-20261111/actual-coherent-plan-optimized.json.
- Проверенные независимые TEMP/port0/PID fixture families распределены в две
  очереди с одним matrix writer; три неизвестных operator-alias checks идут
  последовательными барьерами. Source code зафиксирован в cd72302.
- Owner-runtime на текущем source дал 30 PASS и 2 cancelled по общему fixture
  timeout 15s (16.2s фактического выполнения), без assertion/product errors.
  Подтверждён test-only budget 30s для многошаговой integration fixture;
  production/RPC timeouts и assertions не меняются. Старый FAIL сохраняется,
  whole stopped-update не прерывается; affected owner key проверяется заново.
- После test-only изменения оба целевых сценария PASS (18.371s/18.067s),
  полный owner-runtime 32/32 PASS, cancelled=0. Из 41 evidence keys изменился
  только owner-runtime: 4a975c72…. Остальные PASS переиспользуются строго
  по совпадению key/command/logSHA; прежняя cancelled попытка сохраняется.

## Validation

- Исходный Git: только пользовательский AGENTS.md изменён; origin подтверждён.
- Нужны: воспроизведение сбоя до исправления, регрессии initial/repeat/update/
  rollback и сохранности state/config, адресный routing и boundaries,
  детерминированный 4.2.5 package/standalone, кросс-ревью и triage findings,
  финальная проверка refs после push.
- Продуктовые сценарии Titles/Slideshow/AME и полная матрица P1–P8 не назначены.
  Новых live install/stop/native-команд в этом блоке пока нет.

## Завершённый выпуск 4.2.5

### Progress

Общий installer исправлен в cd72302; test-only Windows fixture budget —
в 5352fc92fbb2ebeefcbae1c2956ac1458cd8bd56. Из этого source собран
`operator-render-jobs/owner` Core 4.2.5. Целевые Git refs:
`codex/ae-agent-core-4.2.5`, `v4.2.5`; прежние 4.2.1/4.2.4 refs сохраняются.

### Decision Log

Чистое начало отделено от coherent/orphan/mixed состояния. Проверяются
descriptor/origins/client/CEP/managed config и точные staging paths. Чужая
история, links и неизвестные Core preferences дают отказ до записи. Own-empty
scaffolding cleanup ограничен private lease, до writes и под install gate.
Повторный ancestor walk устранён без пропуска полного realpath leaf.

Argon дал go, его findings проверены локально Astra и исправлены. Итоговый
source e2e5…/eadd… принят Astra. Одна внешняя отправка, immutable payload и
полный неизменённый ответ сохранены; повторное Argon review не выполнялось.
Исторический filesystem writer не установлен; доказанный initial-admission
дефект и пределы расследования описаны отдельно.

### Validation

- **41/41 current scoped checks, 859 tests PASS**, boundaries **88 PASS**.
  Exact key/command/receipt/logSHA сводка —
  [release evidence](../docs/evidence/core-4.2.5-transfer-20261111.json).
  Исторические FAIL/cancelled/interruption сохранены и не объявлены current PASS.
- Package **b24af0e119b10801ed4ab352ad6eaf9b0af4fd9c4ba5a9437f02085c58e7fca4**,
  159 runtime files. Standalone
  **2ec65e580d5f7c9020e350e81b734938bb6432afb155753cfd5ac65988cd8a2e**,
  177 hashed files + manifest. Две сборки совпали; verifyPackage/verifyStandalone
  и closure PASS. Координатор независимо проверил артефакт и 96 evidence hashes.
- Actual read-only plan поверх установленной 4.2.4 сохранил identity/lineage
  и 12 bindings. Install/production writes/native AE commands — 0.
  Desktop остаётся на 4.2.4, MSI не изменялся. Native/product acceptance 4.2.5
  и full release certification не заявляются.
- Пользовательская AGENTS.md hash 0097d035… сохранена вне продуктовых коммитов.
  Локальный push dry-run авторизован текущим Git доступом; публикация использует
  новые refs без переписывания прежних веток и тегов.
