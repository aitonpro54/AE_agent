# Core 4.2.6: установка архитектурного пакета и live AE

12 ноября 2026. Продолжение завершённого source-плана
[A → B → C](core-architecture-implementation-20261112.md), commit `1f837b3`.
Поручение пользователя: «добивай установку и live ae».

## Этапы

1. I — штатный stopped update текущей desktop-установки с сохранением состава,
   identities, истории, preferences и соседней конфигурации. Проверить release,
   CEP, effective configured client и одно свежее native-чтение; освободить lease.
   Завершить отдельным коммитом.
2. II — адресная live-приёмка на собственной цели: актуальные contracts,
   inspection, proposal/dry-run, точный допуск текущего установленного profile,
   исходная нативная квитанция и свежий read-back. Для визуального изменения проверить фактический кадр.
   Сохранение/экспорт учитывать отдельными результатами. Завершить отдельным
   коммитом, указав фактические границы приёмки.

## Progress

- **II завершён: native PASS, независимый review ACCEPT.** На own comp1 /
  layer14 текст изменён `ИФ` → `CORE 4.2.6 LIVE`, все 16 полей оформления exact
  в fresh read-back. Titles command `command-e07fac8f-bb71-4920-9e8d-a52968f3687c`,
  frame export `command-d633550a-d837-422e-a170-e8631d0a2201`, project-save
  `command-5a3d07d9-b535-4652-8438-3dd264eb14b3` получили `succeeded`.
  Три exact operator permits заменили modal; нативных диалогов не было.
  Fresh project/save observation: dirty=false, одна comp / один слой.
  Lease released=true, holder/pending отсутствуют, UNKNOWN/fault0,
  startup unresolved=false. Живое управление завершено и возвращено root.
  Новых live-действий в этом плане не осталось.
- Root просмотрел реальный PNG кадра0: надпись читаема, целиком в кадре,
  тонкая синяя обводка видна, обрезания нет. PNG83350 bytes, SHA
  `39d8dec2f0f9928d620b1322a5673cf9038285b239763999c30198f4612760e9`.
  Сохранённый AEP103533 bytes, SHA
  `e9bfd6813ae411ad46c207c5633f65e7f30c14f1a108f2ea0a7f9861d33d6edc`.
  Project-save checkpoint — exact прежние82265 bytes / `d852fb9c…`.
- Исходный read-only `core_status`: DESKTOP-32974QF,
  `installation-81a5d9e6-9ecf-4fbd-a33f-5ceb3d772f56`,
  `operator-render-jobs/owner`, Core 4.2.6, package
  `6cea11091208c73dab7ca40e763623f50dadeb537967bef267c93815010791a9`.
  CEP `file://` connected, registry ready; holder отсутствует,
  pending/UNKNOWN/fault отсутствуют. Это наблюдение до обновления.
- I передан `ae_implementer` (Sol High): единственный installation writer и
  live-controller до явной передачи обратно. Read-only runbook собирает
  `ae_scout` (Luna High). Координатор ведёт этот план и milestone-коммиты.
- **I завершён.** Stop `37539102-1019-4f08-8825-ca0c93ccb6c0`, stopped update
  `90a876b9-32d2-4c96-b2d9-ee1725d7a779` и enable выполнены по одному разу.
  Установлены package `950d180c…` и 164 runtime files, CEP8 сверены.
  Descriptor SHA `79266cc306d9a080a94d0d1007c26e23b55f1398d640b0dfcbc9f8f6f2e3903b`.
  Installation ID сохранён; config изменён штатно только на новый package path.
  Milestone commit: `89a6b85`.
- Панель переоткрыта коротким root UI-блоком в прежнем AE16072, без restart.
  Fresh standard stdio client из effective project MCP config получил
  authenticated `file://`, panelBuild `574cffbc…`, registry `f58832f…` и
  native inspection `inspect-3f069492-0b8f-4665-862e-fb6db9364dbd`.
  AE26.3x87: пустой несохранённый проект, dirty=false, items0. Lease освобождён,
  holder/pending отсутствуют, UNKNOWN/fault0. Управление возвращено root.
- II: root создал собственный минимальный AEP в подтверждённом пустом проекте.
  `live-ae.aep` — 82265 bytes, SHA
  `d852fb9cccba518b7ab9d72ec818ed72d63626df8840b4b4d9402b3c30c51f49`.
  Одна композиция `Core Architecture Live 20261112`, 1920×1080, 25 fps,
  один point-text слой. UI-настройка завершена, actual IDs/style устанавливает
  следующая typed inspection. Единственное управление возвращено Sol High.
- Независимый read-only review I — **ACCEPT**: verifier подтвердил 7 evidence
  hashes, 183 standalone files, 164 installed runtime files, CEP, 494 файла
  private backup, config delta, AEP и отсутствие credentials в tracked evidence.
- II initial read `inspect-997e1ab4-0f2d-4c86-a498-880388ecd4fe` получил
  `UNKNOWN/host_callback_timeout`: AE показал modal refusal выполнения script,
  после его OK панель сообщила `Unexpected end of JSON input`. Original receipt
  отсутствует; pending снят по deadline, fence сохранён. Mutation ещё не было,
  own AEP SHA прежний. Исход не переименован в success и не переигрывается.
- Reset `fff4d550-28bf-436b-8ca5-c2591855c679` завершился штатным auto driver
  после выхода AE. Receiver17713 bytes архивирован exact с SHA `f6cbbd03…`;
  session `8f7bc96d-1a95-4686-9851-cb5360a05344`, resetComplete=true,
  baselineRequired=true, текущих pending/UNKNOWN нет. Один explicit finish
  попал в уже завершающийся auto driver и отказал `start_over_endpoint_busy`
  до действия; не повторялся. Это не повтор request/reset.
- Установленный AE запущен один раз, собственный сохранённый AEP открыт вновь.
  Подтверждены нейтральный Selection Tool, отсутствие modal и нужный путь.
  UI-интервал завершён; Sol High продолжает fresh baseline и первичную adoption
  отдельно от уже законченного reset.
- После fresh diagnostics (AE26648 responsive, dialogs[], peer/registry ready)
  новая baseline inspection снова вызвала тот же native modal refusal.
  Root закрыл только этот error; следующий outcome устанавливается по original
  command, не по UI. Повторяется отказ допуска native eval; причинная связь
  с saved-project executor не установлена.
  Третья инспекция/новый reset отложены до причинного разбора XHigh; source fix,
  если нужен, станет отдельным адресным engineering-блоком перед продолжением II.
- XHigh проверил dispatch: один evalScript, одинаковый input `{}`, target path
  не интерполируется в source. Fixed registry ловит ошибки executor, а target{}
  не читает Source Text/шрифт. Поэтому нет основания менять executor или
  ослаблять UNKNOWN. Следующий диагностический фактор — запуск exact own AEP
  через проверенную Windows `.aep` shell/open ассоциацию `AfterFX.exe "%1"`,
  без Computer Use до baseline. Текущий UNKNOWN сначала закрывается отдельным
  штатным reset с сохранением истории и required AE exit.
- Исполнение этого ограниченного diagnostic и последующей live-приёмки передано
  новому `ae_implementer` Sol High. Прежний helper вернул управление и завершил
  все свои сценарии; follow-up ему недоступен из-за agent thread limit.
- Второй ordinary reset `0e6d16c9-f80e-4761-b445-3a7e8cfbac1d`
  (operator `885aef08-c0be-4213-bee0-fe50c51ebcec`) завершился auto driver после
  штатного выхода AE26648, без explicit finish. Создан session
  `af098d2e-d5b8-4212-9c27-d9358cdc6e62`, текущий UNKNOWN0.
- **No-CU differential PASS:** один structured registered-open launch с exact
  executable и `[ownAEP]` создал AE39220/birth2026-11-12T16:28:50.0853090Z.
  До native baseline не было CU/activation/click/screenshot. Один новый typed
  inspect завершился за 3 секунды, lease released=true. Это различает прежний
  UI/setup путь, но не доказывает конкретную причину в sky и не реабилитирует
  старые UNKNOWN. Core source не менялся; продолжаются adoption и actual mutation.
- Initial adoption завершена отдельно: stop `982a72c9-5f94-4f41-8d3c-b39cb8a7935a`
  → adopt-host → fresh proof → resume, descriptor/client/config/AEP exact.
  После owner restart панель отключилась. Один штатный startup
  `80ae6fce-dcc7-4296-8cb2-afc2f6f063ff` получил exact `menu_executed` ACK, но
  без authenticated panel и сохранил отдельный startup UNKNOWN (physical lane
  чиста). Lease освобождён. Второго ensure и source patch нет.
- XHigh подтвердил recovery исходного startup: same UUID observer может принять
  exact ACK и новый authentic peer того же AE. Root screenshot-only подтвердил
  отсутствие панели, открыл её один раз, дождался ready UI и завершил CU.
  Дальнейший original startup_status должен установить durable outcome; UI
  самостоятельно не объявляет startup успешным. Проект не изменялся.
- Original startup `80ae6fce…` завершён **ready/authenticated_panel_reconciled**.
  Новая native comp1 inspection прошла, установлен own layer14 `ИФ`.
  В первом Titles RPC обнаружен пропущенный `core_connect` нового broker:
  отказ был до native dispatch. После штатного connect следующая Titles
  inspection `inspect-874074e1-1539-4337-8058-b7a9b8588b25` дала определённый
  terminal receipt `0ac07243…` / `titles_missing_stroke_color`. Physical lane
  чиста, никакой mutation не было; RPC `owner_outcome_uncertain` не подменяет
  установленный нативный rejected outcome.
- Предел native style API сохранён: неактивный Stroke собственного default
  слоя не даёт полного цвета. Luna High (`ae_operator`) получил отдельный
  sole-UI блок включить только Stroke у own layer14, без File dialogs/save,
  текста, шрифта или transform. Следующая fresh inspection должна заново
  подтвердить весь supported baseline. Core contract не ослабляется.

## Decision Log

- Состав сохраняется: проверенный candidate `operator-render-jobs/owner`,
  package `950d180c11eaead6c5dcf6c371225ef47af5ff77ee16e84dc5202f1775c9ef80`,
  standalone distribution
  `799b23e38839bc53a16ae003c63b5289c79d448de11cfb3a2ea2053e330d2420`.
  Source-приёмка 82 keys / 1338 Node records и Titles 28 переиспользуется в
  проверенных границах; новый полный source-прогон ради установки не требуется.
- Текущее поручение разрешает установку и live AE. Историческое source-only
  ограничение относится к завершённым A/B/C, а не к этому продолжению.
- Пользовательский AEP защищён: сначала свежее чтение. Не сохранять, закрывать
  или заменять несохранённое состояние ради стенда. Мутации — только через
  текущие runtime gates; UNKNOWN устанавливается по исходному intent/status,
  без слепого повторения. Frozen MSIX incident rebase не возобновляется.
- Исходные dirty `AGENTS.md` и `plans/core-transfer-4.2.5-20261111.md`
  не принадлежат этому engineering-блоку и не входят в коммиты.
- Cached MCP этого чата после обновления вернул `owner_unavailable` при одном
  read-only status. Он не считается обновлённым. Native evidence получено
  свежим штатным клиентом из effective configured binding; этот же поддержанный
  путь доступен для следующего этапа без широкого restart Codex.
- Проверенные P2 AEP — большие пользовательские копии, подходящий минимальный
  исторический B6 файл здесь отсутствует. II начнётся с создания собственного
  простого текстового стенда в подтверждённом пустом чистом AE; пользовательские
  четыре AEP не открываются и не меняются.
- Перед mutation выявлен реальный gate: legacy/null не может выпустить
  operator permit. XHigh `ae_specialist` сверил exact installed bytes и
  штатный normal StartOver: при settled history он создаёт явный session UUID,
  сохраняет историю в архиве и не требует AE exit. Initial host adoption и reset
  выполняются раздельными законченными транзакциями, поскольку adoption-файл
  входит в protected facts reset. После фиксации контракта исполнение вновь
  передано Sol High. Frozen incident recovery и runtime gates не меняются.
- Действующие installed profiles используют operator permit для Titles,
  frame export и save; permit заменяет modal. Live success не будет назван
  подтверждением нативного диалога. Исходное предположение о необходимости
  такого диалога уточнено до dispatch по composition-policy/contract.
- UI baseline setup нужен до typed flow: эти модули требуют saved AEP/существующий
  target. Он выполнялся одним root-контроллером в чистом пустом AE. Ввод через
  clipboard и текущую раскладку дал другой baseline; неподтверждённый первый
  слой отменён до сохранения, финальный baseline `ИФ` принят как произвольный
  простой текст. Это setup observation, не результат Core mutation.
- При фактическом UNKNOWN обычный reset требует AE exit. Это отличается от
  первоначального settled-only плана. Recovery выполняется по свежему reset plan
  с архивированием исходного журнала; initial adoption отложена до полного
  завершения reset. Собственный AEP уже сохранён, чужие AEP не открыты.
- Оба сбоя наблюдались после native sky UI setup/открытия AEP с аномальными
  UIA cache/focus ответами. Уточнение chronology: installed empty-project read I
  прошёл после CU-переоткрытия панели, поэтому утверждать, что любой CU ломает
  eval, нельзя. Differential отделяет более широкий путь setup/file-dialog/input,
  а не доказывает конкретную причину. В CEP logs есть также фоновые LaForge и
  AutomationBlocks actors; actual concurrent submit не доказан. Плагины,
  preferences, security и modal gates ради проверки не отключаются.
- Итоговая live-приёмка ограничена однородным статичным 2D point text с активной
  Fill и Stroke, кадром0 и сохранением собственного AEP. Dormant stroke остаётся
  корректно отклоняемым неподдерживаемым baseline. Никаких source patch,
  обхода gates, обнуления истории или повторной отправки settled ID не было.
- Startup потребовал ручного восстановления панели для завершения исходного
  UUID. Полностью фоновое переподключение после owner restart не подтверждено;
  причина двух ранних modal/read UNKNOWN также не установлена. Это пределы
  проверки, а не утверждение, что Core source дефектен или все UI запрещены.

## Validation

- Новые результаты установки и live будут записаны отдельно от offline/VM
  source evidence в `docs/evidence/core-architecture-install-live-20261112/`.
- I: [summary](../docs/evidence/core-architecture-install-live-20261112/install/summary.json),
  [hash inventory](../docs/evidence/core-architecture-install-live-20261112/install/artifacts.json),
  [UI observation](../docs/evidence/core-architecture-install-live-20261112/panel-reopen.json).
  Root независимо сверил actual descriptor/package/identity с receipt.
  470 protected files точны сразу после switch; после штатного нового owner —
  469 exact, 78 immutable preferences, четыре AEP и 11 append-only prefixes
  сохранены. Ожидаемые runtime owner files учитываются отдельно.
- Source checks не повторялись; I доказывает установку, running CEP и одно
  live read-only наблюдение. Мутация/кадр/сохранение относятся к II.
- [UI baseline](../docs/evidence/core-architecture-install-live-20261112/live-ui-setup.json)
  и [исходный gate](../docs/evidence/core-architecture-install-live-20261112/live/offline-session-permit-gate.json)
  сохраняют фактический setup и границы, включая начальные неуспешные UI inputs.
- [Visual check](../docs/evidence/core-architecture-install-live-20261112/visual-check.json)
  и [копия actual PNG](../docs/evidence/core-architecture-install-live-20261112/frame-0000.png).
  Root независимо проверил финальные PNG/AEP SHA. Независимый reviewer подтвердил
  exact оба UNKNOWN archives и сохранность всех четырёх пользовательских AEP.
  Финальный saved AEP не переоткрывался; раннее reopen проверяло исходный
  baseline. Animation/MP4/AME/R1, произвольные шаблоны, full release и MSI в этот
  live-срез не входят.
- II [final evidence](../docs/evidence/core-architecture-install-live-20261112/live/final/summary.json),
  [inventory](../docs/evidence/core-architecture-install-live-20261112/live/final/artifacts.json)
  и [независимый review](../docs/evidence/core-architecture-install-live-20261112/review.json):
  **ACCEPT, P1/P2=0**. 21/21 artifacts exact; actual receiver39/ledger42 chains
  проверены, три original receipts совпали с actual journals, proposal/permit
  bindings и единственными submissions. Текст, все 16 style fields, comp1 /
  layer14/index1, dirty=false и clean released status подтверждены нативно.
  Checkpoint/AEP/PNG и четыре user AEP exact; reviewer также просмотрел PNG.
  Root сверил 21 hashes, отсутствие product source diff и сохранность исходных
  двух dirty файлов. Дополнительных тестов для закрытия этого среза не требуется.
