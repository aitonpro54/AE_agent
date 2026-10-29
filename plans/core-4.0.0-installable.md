# Core4 — создание устанавливаемого runtime на MSI

27 октября 2026, baseline `35f4c90`, ветка `codex/ae-agent-core-4.0.0`. Пользователь прямо поручил создавать новую версию здесь после запроса установить4.0.0. Готовый дистрибутив не требуется от другого компьютера: текущие исходники — база разработки. Этот блок заменяет прежнюю остановку перед созданием реальной интеграции.

## Цель и scope

**Текущий блок после переустановки среды:** [аудит накопленных изменений](core-post-reinstall-audit-20261029.md).
Установка f548 из предыдущего recovery завершена; повтор INSTALL не нужен.
Ordinary CEP connect визуально успешен; этот статус не проверяет evalScript.
Source audit исправил накопительный дефект lineage (`1ec3453`),17updates
с installed test startup/store проверены адресно. Единственное Argon review:
go,2P3 учтены локально. Candidate e073 не заменяет installed f548 без fresh status.
Следующая запись сохраняет прежний порядок работ до этого аудита.

**Приоритет от 29 октября 2026:** пользователь отложил перенос до устойчивой
работы здесь, на MSI. Следует локальная доводка и функциональная приёмка;
milestone 4 и сбор facts другой машины сейчас не продолжаются. Требование
переносимости сохраняется открытым. Текущий ограниченный engineering block —
[восстановление receiver ownership и установка f548](core-settled-owner-recovery-20261029.md).

С 28 октября 2026 [двусторонняя переносимость десктоп ↔ MSI](../docs/portability.md)
входит в обязательную готовность этого среза и всего AE Agent Core, независимо
от рабочего названия Core4. После первичной подготовки двух сред перенос
крупных архитектурных блоков не требует повторной ручной настройки. Приёмка
P1–P8 остаётся открытой; локальный успех установки на MSI её не заменяет.

Получить установочный пакет4.0.0 из нашего Core4: настоящий stdio MCP, внешний Node, локальный аутентифицированный канал к CEP, компактная панель4.0.0, диагностика и выбранный typed manual current-target путь для текста. Continuous-incarnation API остаются закрытыми без своего настоящего provider. Версия3.3.3 не переименовывается в4.0.0; legacy daemon/adapter не импортируются.

[Ручной прототип](core-4.0.0-cep-project-safety.md) и [readiness-контракт](../docs/core4-readiness-preflight.md) переиспользуются как проверенные границы, их offline evidence не выдаётся за live proof. C++ SDK, AME и старый cutover protocol сюда не входят. Исходный блок I–III не включал Argon/desktop-пересылки; добавленный пункт4 требует двусторонней приёмки по новому контракту, а конкретные передачи и доступ к машинам выполняются только в разрешённом scope.

Разрешены source/runtime/panel/installer, адресные проверки, детерминированная упаковка, stage/backup/read-back и целевая установка собственного Core4. Root — единственный installed/runtime/CEP/UI-контроллер; один writer `core4/**` и не более двух helpers. Старая установка и её данные сохраняются. Новые install-scoped role credentials создаются отдельно и не попадают в Git/package/public response. Raw executable ingress, public grant Boolean, fake production lifecycle, replay после UNKNOWN и автоматическое снятие fences запрещены.

Пользовательский AEP, save/reopen/destructive не выполняются ради установки. Пользователь отдельно разрешил штатно перезапустить пустой AE для перечитывания списка расширений; перед закрытием root повторно проверяет отсутствие элементов и несохранённых изменений. Test-copy: `snapshots/core4-host-validation/022dad73-ca31-4013-88fe-bf001ae91011/titr_01_ame_product_20261015.aep`, source SHA-256 `9d5d15a11fccc24b7ca284b6da866bd46f3626d621c80f83c8c1672791ff996f`.

## Последовательные working milestones

1. **Package/status/inspect.** Production composition root `runtime/stdio-entry.js`, реальный HTTP long-poll peer внешнего Node и pure CEP browser, fixed reviewed executor registry, MCP status без lifecycle и bounded typed inspection/discovery. Отдельный CEP bundle `com.codex.aeagentcore4`, видимое имя AE Agent Core4.0.0. Receiver/store во внешнем Node; browser не исполняет Core через embedded Node17. Installer публикует immutable release по manifest hashes, отдельные credentials и project MCP entry, сохраняет state origin/fences. После scoped subprocess/IPC/VM/package/installer regressions — bounded review, commit и root install/read-back.
2. **Typed manual current-target.** Отдельный optional `titles-current-target` package/contract с target без sessionId. Private branded policy вне domain-neutral Core; engine-optional single-step path и versioned resource scope. Generic inspect→build→proposal→dry-run→run; fresh native confirm, single setter и local transaction receipt verifier. Durable preimage checkpoint покрывает точный текст/объявленный style, не весь AEP; recovery требует нового typed proposal/подтверждения. Политика выбирается trusted composition/admitted pin, не public Boolean. Default automatic epoch gates сохраняются. После scoped regressions/review обновить пакет и установленную копию.
3. **Фактическая приёмка.** Correlated MCP handshake, exact Node/install/CEP identities, status/admission coverage, одна разрешённая read-only инспекция через installed IPC. Для mutation — актуальные resource/ownership/physical gates и native confirmation. Если running AE не позволяет загрузить новую панель без сохранения/перезапуска, не закрывать его автоматически и не объявлять offline PASS живым результатом; независимая source/packaging работа продолжается.
4. **Двусторонняя переносимость и обновления.** Выполнить этапы [постоянного контракта](../docs/portability.md): матрица сред и installer gaps → адресная реализация/preflight/config generation → реальный десктоп→MSI→десктоп цикл → отчёт P1–P8. Повторная ручная настройка не допускается; credentials/state/authority остаются локальными, общие fences сохраняются. Критерий обязателен до объявления готовности выбранного состава, а не отложен в необязательные улучшения.

Между пунктами не нужны новый чат и повторное разрешение на уже порученную разработку/установку. Каждый пакет самостоятельно запускает свой разрешённый scope. После первого status-only результата работа продолжается ко второму пункту. Добавление пункта 4 в план не возобновляет остановленные live/UI-действия и не выдаёт доступ к другой машине.

## Progress

- 29 октября: baseline86connection/install и108M1 checks PASS, installed f548
  verifier PASS, UI Connected в двух observations. Снятие искусственного лимита
  lineage и проверка17updates ведутся в [audit record](core-post-reinstall-audit-20261029.md).

- [x] 29октября08:57UTC: фактически установлен f548 без очередного пользовательского
  запуска CMD. Root завершил только exact idle managed Node21876, полный stopped
  inspect PASS, successor recovery архивировал оба owner markers под lease и
  выполнил штатный installer. Независимый read-back release/CEP/Node/config/
  origins/semantic journal PASS;99адресных tests PASS. Текущий MCP transport
  закрыт: для нового configured handshake требуется перезапуск только Codex.
  [Evidence и решение](core-settled-owner-recovery-20261029.md#завершение-установки-без-нового-пользовательского-запуска--29-октября-2026).

- [x] 29октября, stopped CHECK локализовал ENOENT на transaction_parent.
  Win32 backing-path и два Node context probes подтвердили MSIX AppData view:
  внешний CMD не видел установленный runtime. Локальный same-package relay
  готов:36fixtures/PS5.1 parse/6CMD cases/syntax PASS, independent ACCEPT;
  actual external inspect видит exact state и блокируется штатным broker guard.
  Следующий шаг снова INSTALL при закрытом Codex; actual apply0.
  [Evidence и текущий ручной переход](core-settled-owner-recovery-20261029.md#следующий-ручной-шаг).
- [x] 29октября, пользовательский XV ENOENT разобран до границы evidence:
 5reportsblocked до intent, protected files/receiver прежние, original missing
  path не сохранён и сейчас не воспроизводится. Расширены только fixed labels
  диагностики helper:60fixtures/syntax и independent delta review PASS.
  Подготовлен read-only `CHECK-CORE4.cmd`; следующий ручной шаг — CHECK при
  закрытом Codex, INSTALL до разбора отчёта не повторять;
  [текущее состояние](core-settled-owner-recovery-20261029.md#отказ-enoent-после-закрытия-codex--29-октября-2026).
- [x] 29октября, новый screenshot отказа XV launcher воспроизведён: UTF-8/LF
  ломал Windows batch parser до вызова Node. Исправлены только22LF→CRLF;
  original сохранён, реальные `cmd` проверки с подменой и кодами0/1/7 PASS.
  Protected hashes/receiver прежние, intent/recovery reports отсутствуют;
  broker уже нового runtime. Установка не повторялась;
  [диагностика и границы](core-settled-owner-recovery-20261029.md#исправление-формата-launcher--29-октября-2026).
- [x] 29октября, по прямому поручению восстановления ownership подготовлен
  one-case XV operator:46offline tests/syntax PASS, independent ACCEPT;
  held lease/identityCAS/durable archive и штатный installer одним переходом.
  Root actual inspect finalhash корректно блокируется живым24688 до записи;
  protected state/markers прежние. Нужен закрытый Codex для actual apply;
  [готовый launcher и план](core-settled-owner-recovery-20261029.md).
- [x] 29октября, разобран пользовательский `local_check_failed`: apply marker
  отсутствует, installedfa9e/config/origins/journal прежние. Точная исходная
  ошибка не была записана. Launcher теперь сохраняет stage/OS code и отдельный
  check-only report;43fixture assertions PASS. Configured MCP24688 доступен,
  но receiver закрыт при сохранившемся marker от04:11:57UTC; journal settled,
  zero-dispatch recovery неприменим. Повтор установки исключён до отдельного
  проверяемого восстановления; [диагностика](core-msi-panel-reconnect-20261029.md).
- [x] 29октября, после restart Codex прежний owner21872 завершён, но новый26568
  автоматически удерживает fa9e. Full file verifier PASS; AE не запущен.
  Existing proxy снова os10050 до initialize. Готов локальный launcher
  установки f548 при закрытом Codex:29fixture assertions PASS; actual check-only
  ожидаемо блокируется owner. Apply0; [следующий шаг](core-msi-panel-reconnect-20261029.md).
- [x] 29октября, разрешённое поручение прежнему чату выполнено: очередь пуста,
  но штатно завершить managed MCP не удалось; Node21872/owners сохраняются.
  Root подготовил полный63file installer closure и dry-run PASS. Пользователь
  сообщил AEcrash; Windows event подтвердил RuntimeInstaller.DLL/c0000005,
  процесс AE завершился. Candidatef548 не установлен; [итог](core-msi-panel-reconnect-20261029.md).
- [x] 29 октября, локальная доводка MSI: исправлено ожидание после быстрого
  переоткрытия CEP. Retry только handshake/точного duplicate_peer,47selected PASS,
  boundaries21/source review ACCEPT. Candidatef548/60files готов, от fa9e
  отличается только panel.js; пока не установлен. Текущий MCP startup закрывается
  при занятом владельце прежнего чата; [focused блок](core-msi-panel-reconnect-20261029.md).
- [x] 29 октября: добавлена отдельная fixed-endpoint diagnostic source-команда,
 21selected PASS; root actual occupied exit2 без protected byte changes, peer
  connected/pending0/UNKNOWNfalse. Runtime fa9e/60files не менялся. Полный
  installer gate и capabilities остаются открыты; [focused блок](core-endpoint-observation-20261029.md).
- [x] 29 октября: configured Codex MCP client подтвердил status и одну новую
  typed inspection через установленный fa9e/CEP/AE26.2x49. Закрытая панель
  открыта штатно и подключилась автоматически; пустой проект, native read1,
  mutation/save/replay/restart0. После чтения peer connected, pending=null,
  unresolved=[], faults/UNKNOWN=false. Evidence и границы — в дополнении
  [focused плана](core-portability-installation-20261028.md).
- [x] 29 октября: воспроизведена startup-причина `installation_path`: installer
  менял native descriptor path на `/`, а прежний diagnostic его нормализовал.
  Генератор и regression исправлены;45 selected/boundaries21 PASS. Project config
  исправлена через generator/CAS; corrected argv дали installed initialize/status
  PASS и clean exit0, native0, fa9e/state прежние. Configured client пока требует
  нового подключения; existing proxy10050. [Детали](core-portability-installation-20261028.md).
- [x] 28 октября, продолжение по прямому поручению пользователя: installed
  fa9e release/CEP/Node повторно верифицированы; configured client tools пока
  отсутствуют, existing app-server proxy отказал socket10050 до initialize.
  Завершён первый source-блок переносимости: матрица MSI, installer audit и
  исправление cwd-dependent config target/Node default. Final45selected PASS,
  boundaries21, root actual foreign-CWD dry-run и unchangedfa9e/60files PASS;
  [focused план](core-portability-installation-20261028.md). Configured status и
  P1–P8 этим не закрыты.
- [x] 28октября: текущий ремонт/установка панели завершены. Package `fa9e2f454588`
  установлен,60release/7CEP+origins/lineage PASS. Fresh authenticated panel и одно
  новое native чтение пустого проекта PASS; original UNKNOWN history/noReplay
  сохранены. Direct-main bootstrap regression исправлен, source `36905c4`.
  По просьбе пользователя работа остановлена; [handoff](core-panel-installation-handoff-20261028.md).
- [x] A actual capture завершён после human click: exact host_registry_unavailable, MAC/bindings/168 protected files PASS, producerexit0, ACK/native0, originalUNKNOWN сохранён. Independent evidence audit допускает SOURCE B–D, без apply grant. Начата offline реализация disposition/sharedlease/lineage/reader/ACK; новый пакет пока не установлен.
- [x] Source collector A: freeze03/20 scoped PASS/boundaries21/source ACCEPT; actual installed preflight включая PS5.1/CIM PASS. Receipt пока не получен: CU отказал вне bounds до ввода, capture deadline; исходный UNKNOWN не изменён, own diagnostic gates сохраняются до проверенного retirement. AE развёрнут, B–D не реализованы/не применялись.
- [x] Отдельный native-read recovery design A–D прошёл единственное Argon/Aiton/High plan-review (go,6 findings локально разобраны). Реализация начата только с evidence-only collector A; original UNKNOWN/owner сохраняются, eval/replay/mutation0. Дальнейшие B–D условны до original receipt/proof; [актуальный план](core-native-read-recovery-design.md).
- [x] Origin transport на installed6c94 подтвердил живое CEP соединение после user-approved restart. Native read обнаружил ES3 protected154 → timeout/UNKNOWN; replay0. Source fix + ES3 grammar/42selected checks и independent ACCEPT готовы; candidate947 не установлен поверх fence. Следующий bounded блок и ограничения — [native ES3/recovery](core-native-es3-recovery.md).
- [x] По новому прямому поручению28октября второе Argon-ревью исключено из общей схемы. Package6c94 установлен, transaction d1b8c949; read-back56release/7CEP, state origins и installed stdio initialize/status/contract PASS. Реальное подключение ожидает открытия панели: AE после её закрытия выдал nullptr warning и не раскрывает Extensions; запрошен ручной шаг/штатный restart пустого AE. Native0, user AEP не менялся; подробности в focused Origin плане.
- [x] 28 октября, возобновлённый scoped ремонт: собственная CEP фактически отправляет `Origin: file://`; baseline guard допускает только `null`. Новый [focused план](core-4.0.0-origin-repair.md) сохраняет измерение и порядок exact portable repair/review/install. Source и установленный пакет на этом шаге ещё не менялись.
- [x] Origin plan-review Argon/Aiton/Высокий принят (go,5 findings разобраны); minimal source freeze4files и selected20+12+1 PASS, boundaries21/syntax/diff PASS, independent source ACCEPT. Root сверил5source/56package hashes и deterministic candidate6c94; до result-review installed0aea не обновляется. Live CEP/CORS и переносимость P1–P8 ещё не подтверждены.
- [x] 28 октября: переносимость закреплена как постоянное архитектурное правило AE Agent Core в AGENTS, intent и architecture; задан измеримый контракт P1–P8.
- [ ] Реализован и подтверждён штатный перенос архитектурных блоков десктоп ↔ MSI без повторной ручной настройки; P1–P8 закрыты фактическим evidence обеих машин.
- [x] Подтверждены user GO, исходники и чистый baseline; поиск внешнего дистрибутива прекращён.
- [x] `ae_architect` дал bounded source design GO; `ae_scout` проверил CEP/runtime facts. Root владеет планами/commit.
- [x] Единственный `ae_implementer` получил source ownership `core4/**` и последовательные milestones I/II.
- [x] I source реализован: отдельная CEP-панель/HTTP peer/stdio entrypoint, `project-inspection` через generic module API, package/installer/rollback. Initial dedicated actual-component checks7/7 перекрыты итоговым freeze I_V4.
- [x] Реализованы runtime/panel/package/installer и scoped validation I; frozenI_V4 принят независимым review.
- [x] Подготовлены первый локальный milestone commit и immutable distribution I; дальнейшая работа продолжается ко II.
- [x] Выполнены target install/read-back и настоящий stdio handshake/status. CEP connectivity пока не подтверждён: running AE не перечитал новый bundle.
- [x] Реализован и адресно проверен manual typed workflow II без fake epoch; independent authority review ACCEPT, включая timing delta.
- [ ] Обновлены пакет/установка и фактическая приёмка; оставшиеся ограничения записаны точно.

## Decision Log

- Post-reinstall audit сохраняет compatibility fixes/authority/no-replay;
  operator recovery не является connect dependency. Fixed manual titles в
  installed composition — открытый modularity debt, не исправляемый простым
  if-exists. Новый source candidate отдельно от installed f548/live proof.

- 29октября: прежняя ошибка повторялась из-за broker pin24688 после новых
  Codex lifetimes. Committed pre-apply отказ позволил отдельный exact successor
 21876 с сохранением старого guard, original receiver/history и всех runtime
  checks. Однократное обслуживание точного idle Node выполнено root в scope
  порученной установки; graceful drain не заявляется. INSTALL завершён;
  дальнейший пользовательский запуск не нужен. AE/native/replay0.

- Причина XV ENOENT подтверждена как различие virtualized AppData внутри Codex
  MSIX и внешнего CMD. One-case relay входит в тот же package context через
  штатный Invoke/PreventBreakaway, не переносит state и не меняет logical paths,
  recovery pins или grants. Timeout/неясный handoff сохраняет no-replay; отдельный
  wx run-submit guard не очищается автоматически. Общая независимость installer
  от filesystem view остаётся portability gap; migration сейчас не выполняется.
- Новый XV `ENOENT` не идентифицирует исчезнувший ресурс. Stage=snapshot мог
  сохраниться и на pre-intent plan/open после lease; отсутствие gates после
  отказа не доказывает отсутствие его получения. Новый диагностический helper
  уточняет фиксированный check/resource без раскрытия path. Stopped-state
  read-only CHECK заменяет прежнюю рекомендацию повторить INSTALL.
- Новый отказ XV launcher вызван сочетанием UTF-8 текста и LF в Windows `cmd`;
  byte-identical воспроизведение подтвердило отсутствие вызова Node. CRLF
  устраняет parser defect без изменений recovery/installer/pins. Новый broker
  не подменяет прежний approved marker: если он останется после закрытия Codex,
  существующий exact-CAS guard сохраняет отказ до intent.
- Сообщение `local_check_failed` не устанавливает первопричину: прежний wrapper
  скрывал OS errors и не сохранял stage. Новый актуальный blocker подтверждён
  отдельно: closed receiver при старом owner, хотя журнал семантически settled.
  Current broker owner живой; timestamp/пустой marker/settled journal не дают
  права удалить marker. Existing zero-dispatch operator для8event history
  неприменим. Ранее предложенный повтор offline launcher пока не выполнять.
- Установка f548 выполняется между штатным закрытием и следующим запуском
  Codex: обычный restart немедленно возвращает прежнего MCP-владельца.
  Подготовлен локальный launcher штатного installer без изменения gates,
  удаления markers или принудительного завершения процессов.
- Свежий пустой status не заменяет штатное завершение stdio lifetime.
  Освобождение MCP остаётся реальной границей установки; процессы/markers не
  завершаются принудительно. AEcrash фиксируется отдельно: новый пакет не был
  установлен, fault module не выдаётся за первопричину. Перезапуск AE0.
- Перенос отложен по новому поручению29октября; локальная доводка продолжается.
  UI bounded retry сохраняет серверный45speer guard и UNKNOWN/no-replay.
  Старый managed runtime остаётся владельцем до штатного освобождения;
  force kill/marker cleanup и второй listener не используются для установки.
- 29 октября: producer MCP-конфигурации сохраняет native paths с TOML escaping;
  verifier не принимает дополнительные формы пути. Regression потребляет emitted
  config без нормализации. Отдельный exact-argv proof подтверждает repair,
  но не managed client; package/CEP update для tooling fix не нужен.
- Новое поручение «продолжай» возобновляет работу после предыдущей остановки.
  Для configured-client нужен штатный reconnect; текущий proxy10050 не является
  отказом AE и не разрешает второй runtime. Независимый source milestone4
  продолжается; runtime state/adoption и установленный package не меняются.
- Историческая остановка после предыдущего ремонта до нового поручения:
  пользователь продолжит в новом чате. Own diagnostic MCP закрыт чисто;
  maintenance enabled=false восстановлен в true. Первый шаг продолжения —
  configured-client status/reconnect, без replay старой inspection. Read-only
  installation proof завершён; manual mutation/adoption и P1–P8 ещё не приняты.
- Поручение пользователя от 28 октября относится ко всему AE Agent Core: название Core4 временное, переносимость обязательна и для последующих версий. Новый блок сейчас документальный; установка, live, таймер и Argon-отправки не возобновляются. Существующие guards и отдельный scope полной release-проверки сохраняются.
- Предыдущее требование принести готовую4.0.0 с десктопа было ошибкой порядка работы: интеграцию предстоит создать из имеющейся разработки. Новое поручение даёт source/build/install scope; прежний offline-запрет не запрещает этот отдельно порученный блок.
- IPC выбран HTTP long-poll: установленная browser CEP-панель уже использует HTTP, а embedded Node CEP12 имеет17.7.1; внешний Node20+ не помещается туда по предположению. Новый внешний runtime использует конкретный проверенный absolute Node path/hash без PATH/npm install, без detached daemon/native C# launcher.
- Во фреймах только fixed reviewed asset key/phase и typed payload, не source/path/function. Durable begin предшествует выдаче команды, physical latch — eval, callback receipt — POST, clear latch — correlated durable completion ACK. Browser storage не объявляется fsync-защитой. Timeout/reload/loss сохраняют UNKNOWN/no-replay.
- Panel и control credentials разделены; свежие challenge/epoch/sequence связывают peer/controller/package. Loopback Host/Origin проверяются, null Origin без credentials/MAC не доверяется, wildcard CORS не вводится. Diagnostic role не получает execution authority.
- Resource fences относятся к реально общим machine/process/file resources. UNKNOWN другого компьютера не является очередью этого AE; одинаковый путь/новый UUID сами по себе разделения не доказывают. Actual identity и локальный physical state устанавливаются отдельно; архивная рабочая история не становится startup dependency.
- Checkpoint/verifier новой manual policy явно versioned: local transaction receipt подтверждает именно эту транзакцию, поздний отдельный inspect — новая observation, а не continuity или снятие UNKNOWN. Full-project protection при необходимости сохраняет save gate.
- Read-only native result имеет собственный `observationVersion`, а не прячет project metadata в `protected` старого snapshot. Missing host JSON/registry даёт явный known read refusal без raw fallback. Generic inspection сверяет moduleId+contractId; новый отдельный публичный `inspect_project` не вводится.
- Root визуально наблюдал единственное окно AE26.2: пустой `Untitled Project.aep`, project items/comp отсутствуют; окно было развёрнуто из minimized, проект не менялся. CEPHtmlEngine на диске12.0.1; PlayerDebugMode12 уже1, security settings не менялись. Read-only CDP inventory2029: один target, legacy AE Agent target не обнаружен. Эти факты не объявляются global AE queue idle.
- Независимый I reviewV2 нашёл2P1/1P2: extra extensionless release file мог загрузиться до проверки; orphan Broker ownership допускал отдельную physical inspection; TOML edit мог поглотить indented соседнюю entry. До установки обязательны exact closure/pre-import verification, общий fail-closed physical guard и bounded TOML edit/regressions. Дополнительно apply должен принимать exact reviewed package hash. Writer исправляет только эти адресные места, II до frozen package не публикуется.
- I_V4 закрыл findings, включая последующее связывание фактического entry root с verified release и повторный descriptor CAS под startup gate. Импорт package code происходит только после проверки closure/identity. Missing/wrong reviewed hash запрещает apply до записи. Прежние marker/fence/ledger не удаляются для старта/установки.
- II actual provider будет отдельным private Windows probe/adoption/reservation, не публичным Boolean: actual hostname/PID/birth/executable + stable installation/state owner + authenticated peer + exact approval/checkpoint + durable reservation. Coverage ограничен cooperating Core4 lane/current native-confirm target; global AE idle и отсутствие всех сторонних actors не обещаются. Known conflicting obligations блокируют отправку; native confirm повторно сверяет текущую цель. Root adoption привязывает процесс/разрешённую test-copy, но не является grant на setter или project epoch.
- I установлен из immutable distribution после commit `0131ab3be059aed3926a966f281bca124ace6250`. Новый project-local MCP entry и отдельный CEP bundle не заменяют старую панель3.3.3. Текущий AE показывает только ранее закэшированные расширения; штатный перезапуск пустого AE отдельно запрошен у пользователя. Пока ответ не получен, source/build II продолжается без перезапуска, открытия AEP и native вызовов.
- Actual Codex MCP client самостоятельно подключил I после завершения root probe. Его `core_status` отклонён `unexpected_field`; это отдельный interoperability finding, manual NDJSON probe его не покрывал. II принимает bounded standard `params._meta` вне domain payload и проверяет это actual stdio-child regression; окончательная проверка configured client остаётся после установки II.
- Project-local `enabled=false` штатно отключил managed client; Codex завершил PID15396, оставив broker/receiver owner markers. Root не выполнял force kill и не удалял markers. Read-only state proof: broker ledger отсутствует, receiver journal содержит ровно valid origin record, ни одного begin. Архитектурный GO дан только на отдельный private zero-dispatch owner retirement с inspect→exact proof hash→gates/CAS→durable archive двух markers. Это не general recovery и не startup/installer fallback. Любой ledger event, begin/unknown/torn record, непроверенный процесс или несовпадение proof закрывает переход; origin/journal/store identity/fences сохраняются. Пустой receiver marker требует отдельного root provenance и свежего census именно собственных Core4 процессов. Writer создаёт temp-tested operator CLI; root применяет только после independent review.
- II дополнительно исправляет host data compatibility: lexical ES3 JSON codec без eval/глобального polyfill, bounded discovery и known read refusal без evidence; opaque host objects закрываются, известный `ParagraphJustification` enum нормализуется явно. Это source/VM evidence до actual native проверки. Installer сохраняет явный MCP enabled preference, чтобы root мог закончить проверку/adoption до подключения клиента.
- Пользователь ответил «Да, перезапусти пустой AE». Root свежим UI-снимком подтвердил пустой Untitled Project без dirty marker, затем выполнил один штатный Alt+F4. Окно и прежний PID4312 исчезли, save dialog не появился; force kill/save/discard не выполнялись. Новый запуск последует после обновления reviewed II, чтобы панель сразу загрузила актуальный пакет.
- Private zero-dispatch recovery V2 прошёл8/8 и independent review ACCEPT после lstat/dangling-ledger repair; source commit `1cd50b5`. Root применил ровно reviewed CLI из distribution после actual inspect/proof CAS. Transaction `8dec8220-b9f3-465e-acce-0dd2bc733051-zero-dispatch-retirement`; независимый read-back подтвердил byte-identical archived markers, неизменные origins/journal/store identity, отсутствие ledger/gates/owner markers. Никакие command outcomes/fences/grants не менялись. [Focused record](core-4.0.0-zero-dispatch-recovery.md).

## Validation

- Post-reinstall: baseline86/86, M1 108/108, boundaries21PASS; реальная temp
  история после17updates проходит installed startup/store с UNKNOWN/no-replay.
  Свежая live mutation/adoption и configured native read этим не доказываются.

- 29октября: successor96fixtures +3real installer/semantic/lineage integration
  PASS; source review P1/P2нет. Actual install exit0 и независимый read-back
 08:58:16UTC PASS. Packagef548, два markers в durable архиве, journal/origins
  неизменны, gates отсутствуют. Configured status после остановки старого
  клиента: `Transport closed`; новое подключение и live CEP ещё не подтверждены.

- MSIX relay:36/36fixtures, PS5.1 parser,6CMD stub cases/syntax PASS; независимый
  source/fix review ACCEPT. Actual inspect из внешнего процесса без видимого
  AppData входит в нужный context, сверяет bindings и возвращает ожидаемый
  broker guard до intent.5protected files/receiver/history прежние, oldfa9e,
  original/new guards до actual run отсутствуют. Apply/native0; installer product
  bytes и underlying helperadff…ad27 прежние.
- XV ENOENT:60/60helper fixtures/syntax, independent diagnostic-delta ACCEPT;
  real-cmd CHECK stub0/1PASS. Actual CHECK при новом broker31972 блокируется
  на broker_marker до intent; actual apply/native0.5dated reports сохранены,
 5protected hashes и receiver identity/bytes прежние, installedfa9e.
  Missing resource из исходного ENOENT остаётся неизвестным до stopped-state
  evidence; готовность повторного INSTALL не заявляется.
- XV launcher-format regression: исходные bytes воспроизводят screenshot,
  исправленные CRLF проходят три реальные `cmd` проверки0/1/7 на recording stub
  в каталоге с пробелами; actual recovery/apply/native0. Новый launcher hash
  `df8e54c1c24b5093e1182338c1e7827e10aa3b8775609573b8fda4a7e930a499`.
  Read-back06:20:29UTC: installedfa9e,5protected files/receiver прежние,
  transaction/gates/recovery reports отсутствуют; broker нового PID2752.
- Screenshot diagnosis: full installed verifier/candidate63file closure/package/
  config/dry-run/baseline PASS; `assertReceiverJournalSettled` PASS на неизменном
 8event journal. Current configured status pending=null/unresolved=[]/faults=false,
  physical.storeClosed/unknown=true. Local wrapper43assertions/syntax PASS;
  actual `--check-only` отказал на ownership без apply marker, исходный отчёт
  сохранён byte-for-byte. Source/runtime/CEP/state/owners не менялись;
  ни новая установка, ни live acceptance этим блоком не подтверждены.
- После restart: actual fa9e60files/CEP/Node/origins verified, protected hashes
  прежние; configured status в этом чате недоступен, fresh queue не заявляется.
  Existing control proxy exit1/stdout0/os10050, status/reload0; install/native0.
  Local launcher29fixture assertions/syntax PASS; actual read-only preflight
  отказал `runtime_state_owned_or_unknown` до apply/attempt marker. Проверки
  stopped/settled под lease и actual installation/read-back остаются открыты.
- Продолжение после пересылки: actual standalone dry-run63file closure PASS,
  package/source bytes прежние. Configured status получен владельцем прежнего
  чата; освобождение MCP FAIL/not-supported. Windows event1000 и census
  подтвердили завершение AE; нового native/live/install proof нет.
- Локальный reconnect source-блок:47/47selected PASS, old baseline negative
  FAIL1/1, final evidence keys совпали; boundaries21/syntax/diff PASS,
  independent source ACCEPT. Candidatef548deterministic/60files; actualfa9e
  read-only verifier PASS. Actual install/live/9deferred integrations/full
  release не приняты. Evidence и package hashes — в focused плане выше.
- 29 октября: exact old argv FAIL exit1/`installation_path` до state startup;
  regenerated native argv PASS initialize/core_status, child18160 exit0/stderr0.
  Python TOML decode и Codex CLI config read-back PASS; descriptor/origins/journal
  byte-identical, runtime packagefa9e.45/45 selected, boundaries21, syntax/diff PASS;
  native0. Configured status через existing proxy недоступен:10050. Evidence —
  `snapshots/core4-live-proof/X-configured-path-repair-20261029/`.
- 29 октября: пользовательские screenshots опровергли предложенный UI-путь к
  отдельному MCP servers. Повторный ручной поиск не требуется. Project config
  после одного bounded reload-cycle восстановлен byte-identical; cached startup
  failure остаётся, новой попытки запуска в журнале нет. Следующий technical
  шаг — точные loaded args/stderr штатного client, не ещё один UI-рецепт.
- После сообщения пользователя о manual reconnect: actual MCP startup текущего
  чата отказывает initialize (`connection closed`). Отдельный installed stdio
  diagnostic23156 дал initialize/core_status PASS и clean exit0, native0,
  journal unchanged/owners0. Configured-client proof этим не заменён.
  По отдельному поручению проверены12AE skills, исправлены5entrypoints+reference;
  результат и границы проверки — [audit](ae-skills-audit-20261028.md).
- 28 октября, source installer portability: final45/45selected PASS
  (23installable+19recovery+3human), boundaries21/syntax/diff PASS; root exact
  fa9e/60closure и actual dry-run финального CLI из чужого cwd PASS. Descriptor,
  config, journal и origins byte-identical, release/CEP повторно верифицированы;
  installation/apply/native0. Configured-client tools отсутствуют; existing
  proxy10050 до initialize, manual reconnect pending. Final bindings и11deferred
  current-closure-unverified — в focused плане; full release не запускался.
- Финальный actual proof и ограничения — в handoff и
  `snapshots/core4-live-proof/VII-native-read-recovery-20261028/root-final-native-proof.json`.
  Native success через installed MCP stdio/CEP/AE, post-read faults/pending0,
  graceful child exit0, owners/gates0. Последний source fix:48selected PASS плюс
  actual-main negative→positive regression; прежние96 относятся к freeze04.
  Full release и готовность переносимости не объявляются закрытыми.
### Архитектурное требование переносимости — 28 октября 2026

- Scope: документация и план, без runtime/source/config/installed изменений. Строгий UTF-8, относительные ссылки и `git diff --check` — PASS; подробности в основном плане. Прежние product PASS не расширяются; P1–P8 не выполнены и readiness обеих машин не заявляется.

### I — source/package, до actual установки

- Итоговый `installable-runtime` batch — **13/13 PASS**: real stdio child+HTTP+VM, auth/role/origin/epoch/replay/size, durable begin/receipt/ACK/latch, crash/reopen/no-replay, known host JSON refusal, package/install/rollback/stable origins, closure injection/junction, orphan owner/corrupt ledger/unresolved intent, TOML preservation, expected package hash и stale entry/descriptor race. Native AE calls0. Earlier7/11 перекрываются итоговыми13 и не суммируются.
- Selected existing consumers на прежнем I freeze: Core36/36, photo3/3, titles4/4 PASS. Их code/dependency bytes не менялись последующими runtime/test-only fixes, повтор не выполнялся. Полный raw stdout этого прежнего subprocess не сохранён (первый chunk был truncated); evidence содержит точные counts/commands и ограничения, а не заявление полного raw TAP. Current full-release PASS отсутствует; audit-repairs/cep-transport/lifecycle-simulation имеют explicit deferred coverage selection.
- Boundaries20, JS syntax, XML и diff checks PASS. `core/stdio.js` меняет только private serverInfo option, default metadata прежнего M1 сохраняется; Core artifact resealed только для actual stdio bytes. Чужие module/engine/protocol pins не обновлялись.
- Frozen source/evidence: `C:/Users/Ant/AppData/Local/Temp/core4-ready-I-V4-AenV3N/` (`summary.json`, `selection.json`, `installable-runtime.raw.log`, `boundaries.raw.log`, `diff-check.raw.log`, `package.json`). Root независимо сверил22 changed source hashes: mismatches0. Все48 package file hashes и exact file set сверены; packageHash `cf07e3189d88c4921f779b806b5dc45c8a305cd9c4bc27d898b3903678327f04` пересчитан независимо. Reviewer выполнил bounded source review и address review fixes: **ACCEPT**, открытых P1/P2 нет; tests/live не запускал.
- Root повторно собрал детерминированный пакет в `dist/core4/4.0.0-readonly-cf07e3189d88/core4-4.0.0.json`: тот же packageHash/48 files, file SHA-256 `786d2a741ce5ec100ef8f7b87d637b51178559ae87494a322278e19a6a70ca6f`. Рядом `distribution.json` и standalone installer closure (3 reviewed files с hashes). Эти generated artifacts игнорируются Git.
- Root dry-run на actual MSI paths прошёл: внешний Node `C:\Program Files\nodejs\node.exe`, v24.15.0, SHA-256 `3331e1ffe19874215472217c5e94f5a0c6d8e18c4ac7111d3937aa0ad5e9b4a5`; Core4 install/CEP/project config до установки отсутствуют. CLI требует exact native Node path; первая запись с `/` была отвергнута `node_path_not_exact` до изменений, corrected native-path dry-run PASS.
- Номер4.0.0 не является release certification: `releaseCertified:false`, actual installed/host proof записывается отдельно после source commit. Full-release suite не запускалась. До завершения II этот пакет имеет feature scope status/read-only inspection.

### I — actual установка и stdio proof

- Installer apply на MSI завершился успешно с exact reviewed packageHash. Descriptor: `C:/Users/Ant/AppData/Local/AEAgentCore4/installation.json`; installationId `installation-1304c438-5794-4d5c-bf72-d8101f3d2a24`. Immutable release размещён в `releases/<packageHash>`, постоянный state — `state/production`. Transaction `9b4212d6-8a75-4e48-8394-ab5151da2804`; legacy bundle и его state не изменены.
- Root read-back сверил48 release files (mismatches0), exact Node hash и7 установленных CEP files, наличие разных role credentials без вывода их значений. Создан только project-local `.codex/config.toml` с `after-effects-core4`; global config не менялся. Evidence: `snapshots/core4-live-proof/I/installation-readback.json` и `dist/core4/4.0.0-readonly-cf07e3189d88/installation-result.json`.
- Настоящий installed stdio child PID10612 ответил на JSON-RPC initialize как `ae-agent-core4` версии4.0.0. Два `core_status` подтвердили `ready:true`, `nodeVerified:true`, ownershipFault null, ledgerFault false, unresolved0, открытый receiver store и HTTP3457. Raw ответы сохранены в `snapshots/core4-live-proof/I/stdio.raw.jsonl`. Это proof процесса/IPC listener, но не native AE execution.
- CEP peer пока `connected:false`, pending null, unknown false; automatic lifecycle остаётся unavailable. Root увидел в меню Window → Extensions только старые bundle: новая панель ещё не загружена текущим сеансом AE. Перезапуск ждёт отдельного ответа пользователя; AEP не открыт/не изменён, native AE calls0, save/reload0. Идущая source-работа II не зависит от этого ответа.

### II — frozen source/package перед независимым review

- Реализован отдельный admitted `titles-current-target`: target без sessionId, private branded policy/reservation, exact approval/pins/checkpoint, optional-engine single-step, v2 process origin/resource constraints, fixed native-confirm transaction и original local-transaction-receipt verifier. Automatic lifecycle contract не ослаблен. Actual Windows probe/adoption — private operator entry, без public grant Boolean.
- Frozen source packet: `C:/Users/Ant/AppData/Local/Temp/core4-II-frozen-09gaLC/summary.json` и соседние selection/package/raw logs. Root сверил33 source SHA-256, mismatches0. Package57files повторно собран с hash `99be960979416254742b70a497a93751e60574a448421abf1eb85985e091c4a1`; exact file set, каждый file hash и manifest hash пересчитаны независимо. Immutable candidate — `dist/core4/4.0.0-manual-99be96097941/`, package file SHA-256 `0b9e7ae3c22c23de7dd00395b7d0c0eeb25fee83eccbfaf72a3cd34eeb3f963e`; installer closure3 и standalone adoption operator сохранены отдельно.
- Dedicated affected suites **27/27 PASS**: installable15 + manual12, raw `core4-II-bounded-freeze-kLX0uJ/last-affected.raw.log`. После этого изменены только две подписи панели; current panel-selected suite PASS в final packet. Core37/37 PASS на текущих production core bytes до fixture-only/label delta (`core4-II-freeze-4fGEZP/validate-diff.raw.log`). Предыдущий infrastructure worker_timeout сохранён в `core4-II-final-cAXdd5`; timeout/guards не ослаблялись. Более ранний full selected PASS относится только к своим прежним closure/evidence keys, не объявляется current release certification.
- Boundaries21, syntax, PowerShell AST, XML и diff PASS. Native AE calls0 и actual Windows probe calls0 у writer. Independent authority review выполняет `ae_specialist`, read-only, без tests/live. Recovery CLI/test — отдельная добавка вне frozen runtime/package; установленная I ещё не переключалась на candidateII.
- Independent authority review frozenII — **ACCEPT**, открытых P1/P2 нет, source/package hashes сверены повторно reviewer. Перед actual install root обнаружил operational timing gap: Core default2s не подходит для native confirm. Отдельная согласованная дельта только trusted production composition задаёт caller100s / physical callback90s / MCP default120s. Worker timeout и defaults старого Core не меняются; explicit MCP timeout preference сохраняется. Поздний native ответ после physical deadline не снимает UNKNOWN и не разрешает replay. Timing delta получает свой адресный regression/review и новый package hash, candidate99be остаётся сохранённым промежуточным evidence.
- Final timing/routing packet — `C:/Users/Ant/AppData/Local/Temp/core4-human-window-ready-7jlqXE/`. Последняя адресная проверка: human3 + manual12 + installable15 = **30/30 PASS**, routing5/5, recovery8/8. Actual stdio child принимает synthetic human decision после2.6s; ускоренный physical deadline сохраняет UNKNOWN после late setter и блокирует replay. Boundaries21/syntax/diff PASS. Broad suites не повторялись; историческое Core37 evidence и прежние selected closure не расширяются до новой release certification.
- Final independent review — **ACCEPT**, без открытых P1/P2. Root и reviewer независимо сверили36 source +2 recovery hashes, mismatches0; все57 package files/manifest hashes совпали. От candidate99be в runtime package изменён только `runtime/stdio-entry.js`. Новый packageHash `42e101d56879e0f89774499ab2784f2649a6296f59bdafe6ae76bb4a7eb4c3af`, immutable distribution `dist/core4/4.0.0-manual-42e101d56879/`, package file SHA-256 `5272d213ddc38e5d059ebc37e2e640e3778a85d9c9b3614eade6c8c6a768cc70`. Installer closure3 и два standalone private operators зафиксированы с hashes; actual install/read-back следует после source commit.

### II — actual установка и адресный host-query repair

- Source milestone commit `ef17440`; root dry-run/apply reviewed42e PASS, transaction `6c5f72dd-edfb-4c9d-aa7d-f391fb9b327b`. Сохранены installationId/state/origin и explicit MCP enabled=false, добавлен own tool_timeout_sec120. Независимый read-back57files без mismatches, exact Node hash/origins/credential roles и7CEP files/2fixed assets совпали. Evidence: `snapshots/core4-live-proof/II/installation-result.json` и `installation-readback.json`.
- Разрешённый пользователем перезапуск состоялся: пустой AE был штатно закрыт и запущен заново. Новый PID31452, birth `2026-10-27T18:39:21.6825920Z`; окно Untitled без элементов/dirty marker. Первое launch API observation не успело увидеть окно; повторного запуска не делали, свежий inventory затем нашёл единственный нужный процесс/окно. Home закрыт Escape, в Window→Extensions подтверждено **AE Agent Core4.0.0**. Панель пока не открывалась, AEP не загружался.
- Actual private `probeWindows` вернул host_probe_failed. Bounded diagnostic установил точную причину: Windows PowerShell5.1 отклонил pinned `.ps1` как SecurityError/UnauthorizedAccess, running scripts disabled. Состояние policy/registry/security settings не менялось; Unblock, bypass/encoded-source или повторный File fallback не выполнялись. Evidence: `snapshots/core4-live-proof/II/host-probe-file-refusal.json`.
- Следующий адресный repair — новый package-owned literal read-only CIM cmdlet query с фиксированной проекцией PID/точного UTC birth/executable path; Node выполняет нормализацию/hostname/time/stat/hash. Это отдельный разрешённый интерфейс чтения системных facts, не перенос содержимого запрещённого script file в Command. [Microsoft5.1](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies?view=powershell-5.1) явно различает разрешённые individual commands и обход через перепаковку script contents. Architect/reviewer дал узкий GO только для первого. Новых source/path/query arguments, dynamic evaluation, EncodedCommand, policy changes или fallback после cmdlet/AppControl/CLM refusal не будет. Writer делает scoped patch/tests; root применяет после source review. MCP остаётся disabled, собственные owners/ledger отсутствуют, поэтому новый пакет можно установить без orphan recovery/restart AE.
- CIM repair реализован и принят отдельным review: literal pipeline использует fixed `-Property ProcessId,CreationDate,ExecutablePath`, затем fixed data projection/JSON; base64 кодирует только UTF-8 данные результата. Node сохраняет raw7-digit birth, проверяет schema/date/bounds и executable stat/hash. Ошибки закрывают probe без fallback. Неиспользуемый `.ps1` исключён из active package и оставлен в source только как provenance.
- Итоговый packet `C:/Users/Ant/AppData/Local/Temp/core4-cim-repair-final-ToPzQc/`: CIM6/6, syntax/query AST/diff PASS. Preceding repair packet `core4-cim-repair-VCb9ZZ` содержит manual12/CIM6/installable15=33PASS и routing5; после него менялись ровно literal `-Property` и его assertion, прежние полные closure не переобъявляются current-release PASS. Actual query/ports/installed reads/native0 у writer; reviewer source-only ACCEPT без P1/P2. Root/reviewer independently checked5source/56package hashes, mismatches0.
- Новый packageHash `0aea36d0caf2f60a91dbdc72cc5d10e268a410d1973e1e2140dfd2a9b5d88589`; immutable distribution `dist/core4/4.0.0-manual-0aea36d0caf2/`, file SHA-256 `3adb8e028bf2d1ef35e97cb3f08c35a705e0546570827c5e8ff5b6d8f4f918fd`. Root actual apply/probe и final MCP→CEP→JSX read proof следуют отдельно.

### Фактический итог на остановке Computer Use — 28 октября 2026

- CIM source repair commit `4e26bde`; final package0aea установлен, transaction `f532d2c6-0920-4c0f-b1be-e972454bac7e`. Root read-back всех56release/7CEP files, Node/origin/credential-role/asset bindings PASS (`snapshots/core4-live-proof/II/installation-readback-0aea36d0caf2.json`).
- Actual installed Windows query PASS: MSI, единственный AE PID31452, birth `2026-10-27T18:39:21.6825920Z`, executable SHA-256 `166ede517e7d314c8842d7dfb47b8f68a24ccc64b0add589e4f16b42c7af8157`; named endpoints3456/8787 observed-absent. Private adoption PASS с exact prepared-copy path, mutationGrant/lifecycleEpoch false. Evidence: `host-observation.json`, `host-witness.json`, `host-adoption-result.json` в том же ignored каталоге.
- Installed stdio child PID21856 успешно ответил initialize как4.0.0, core_status с standard params._meta и generic inspection contract. Ownership/ledger faults отсутствуют, receiver store identity прежняя, pending null/unresolved0/unknown false, adopted true. Чистые ответы — `stdio.raw.jsonl`. Это actual stdio/status proof, но не configured Codex-client или native read proof.
- Новая панель фактически загружена из собственного installed file URL и видима в AE. CU нажать HTML-button не смог из-за cross-process CEP child; пользователь сообщил, что нажал «Подключить». Дополнительно root штатно переоткрыл только панель при подтверждённой пустой очереди. Реальный fetch дошёл до HTTP, но получил **cep_origin_required**. Guard не ослаблялся; exact Origin ещё не измерен. Own Core4 CDP не доступен; port2029 принадлежит Automation Blocks, чужая поверхность не использовалась.
- Configured Codex MCP client не перечитал новую запись в активном чате. Поддержанный CLI app-server proxy не подключился к default control socket (os error10050); новый app-server/чат не создавался, Codex UI не автоматизировался. Для отдельного read-only proof использован root-owned installed stdio client. Он штатно закрыт exit0 без native dispatch; temporary MCP enabled=false восстановлен в true.
- Для измерения Origin подготовлен отдельный one-request observer на том же127.0.0.1:3457: только header classification, без Core imports/credentials/challenge issuance/AE commands. До следующего CU действия пользователь остановил Computer Use физическим Esc; root прекратил UI и закрыл observer. Native inspection/mutation не выполнялись, AEP не открывался/не менялся, save0. Полная живая приёмка **не завершена**.
- Следующий ограниченный шаг: измерить actual Origin собственного CEP, затем независимо проверить точный authenticated origin contract без отключения Host/Origin/MAC gates; после scoped repair повторить один native read пустого проекта и configured-client reconnect. Требуется новое разрешение продолжить Computer Use после пользовательской остановки; source/read-only продолжение само по себе не отменяет эту остановку.
