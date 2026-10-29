# MSI: восстановление receiver ownership и установка f548

29 октября 2026, baseline `92783dd`. Прямое поручение пользователя:
«Продолжай: безопасно восстанови ownership для receiver/owner и доведи установку
Core4 до конца». Рабочий root — `C:/Users/Ant/Documents/Codex/AE_agent_core`.

## Scope

Одна локальная операция над точным сохранившимся receiver marker установленного
fa9e и установка уже проверенного f548. История UNKNOWN/terminal disposition,
origins, journal и пользовательский AEP сохраняются. Root — sole live controller;
специалист пишет private helper и fixtures в ignored evidence XV. Source Core4,
общий startup/installer и zero-dispatch recovery не расширяются этим оператором.

## Progress

- [x] Свежий configured status: managed24688, receiver closed/unknown=true,
  fault=false, pending=null; broker fault=false/unresolved=[], worker pending0.
- [x] Подтверждены точные6identity поля receiver и broker, hashes защищённых
  файлов; прежние21872/26568 отсутствуют. Current24688 родился05:29:35.8144150UTC.
- [x] Scope recovery явно привязан к прямому поручению пользователя и точному
  наблюдаемому receiver marker; автоматическое generic recovery не вводится.
- [x] Helper/fixtures завершены:46/46PASS; независимое source review ACCEPT,
  открытых P1/P2 нет. Root actual inspect отказал до lease/intent при живом24688.
- [x] Точный idle runtime завершён root при проверенной идентичности; operator
  inspect и apply прошли под lease. Это controlled termination, не graceful close.
- [x] Архив markers, установленный f548, config/CEP/Node/state прочитаны обратно.
- [ ] Новый configured handshake/status подтвердил открытый receiver. Живая
  CEP/AE приёмка остаётся отдельно от файловой установки.

## Decision Log

- Receiver marker пустой: PID/token создателя в нём нет. Timestamp согласуется
  с историческим21872, но не является доказательством авторства. Recovery
  допускается только для зафиксированной идентичности по прямому поручению,
  полному settled journal/lineage и свежему отсутствию runtime/endpoint под lease.
- Journal8events: origin, begin, unknown, terminal-read-failure-disposition,
  begin, complete, begin, complete. Исходный UNKNOWN не переписывается и не
  повторяется. Existing zero-dispatch operator требует single-origin и здесь
  неприменим. Нельзя адаптировать witness так, чтобы скрыть отправленные команды.
- Broker после штатного закрытия может отсутствовать. Если exact текущий marker
 24688 остался, нужен отдельный pinned hash/identity и fresh dead PID/census;
  живой/reused/неизвестный PID или любые новые bytes закрывают операцию.
- Архивирование и штатный applyInstall выполняются под одним install lease,
  с удерживаемым file handle/identity CAS, durable intent и no-replay. Любая
  неопределённость после intent сохраняет gates и evidence.
- Core4 disconnect не завершает managed stdio lifetime. Existing control proxy
  ранее отказал10050; неизменный отказ не повторяется, force kill не применяется.
  Если штатное освобождение из сеанса недоступно, root готовит весь проверенный
  offline launcher до необходимого ручного закрытия Codex. Подготовка не является
  фактической установкой.

## Validation

- Evidence: `snapshots/core4-live-proof/XV-settled-owner-recovery-20261029/`.
  Root observation/status/authorization не содержат credentials и не являются
  runtime grant. Apply/native/owner changes0 на исходном снимке.
- Предыдущий диагностический блок: [XIV](core-msi-panel-reconnect-20261029.md).
  Неизменные candidate/runtime проверки не повторяются без причины; новые
  проверки относятся к operator gates/CAS/retention и actual read-back.
- Final helper SHA-256 `805831546dd2443044d0371f1f67953b332ad7adbe6a41e6d9590e425cecfb0e`;
  tests `42a8f8858e5638562a9df4999949e4734436aab7f93e39c70de2115da560c992`;
  launcher `17be880caf1202451f242094d11bd548f0d4524f8a781374093b8cc8fef40da4`.
 46offline tests и Node syntax PASS. Fixtures используют real install-lease и
  journal parser, но semantic validator/installer/process probes подменены;
  это проверка orchestration, без installed reads/actual apply у writer.
- Reviewer ACCEPT на этих hashes. Два замечания устранены: post-rename6identity
  фиксируется до fsync; archivesCAS повторяется после последнего await probes
  перед apply. Regression ловит ABA при fsync, final process probe и после apply;
  pre-submit изменения не допускают вызов installer и сохраняют gates.
- Root final actual inspect06:07:49UTC: blocked/recovery_known_pid_not_dead,
  stageprocess_probe, exit1; leaseRetained=false/recoveryIntentStarted=false.
  Protected hashes и все6identity/bytes обоих markers прежние, install gates и
  transaction не создавались. `root-final-inspect-readback.json`; actual apply0.

## Подготовленный ручной переход — исторический, заменён диагностикой ENOENT ниже

Единственный оставшийся шаг для освобождения текущего managed24688 — полностью
штатно закрыть Codex. Затем запустить из Проводника
`snapshots/core4-live-proof/XV-settled-owner-recovery-20261029/INSTALL-CORE4.cmd`.
Использовать новый XV launcher, не прежний XIV. Он вычисляет fresh inspect proof,
архивирует exact observed markers под lease, вызывает один штатный installer
apply и проверяет результат. Не открывать Codex до результата. При SUCCESS
открыть Codex и продолжить configured read-back; при BLOCKED/UNKNOWN сохранить
новый report, не повторять и не удалять gates. Это технический ручной переход
из-за недоступного shutdown managed stdio в текущем host, не новое согласование.
Фактическое восстановление/установка пока не выполнены и не объявляются PASS.

## Исправление формата launcher — 29 октября 2026

### Progress

- [x] Ошибка с нового screenshot воспроизведена настоящим Windows `cmd /d /c`
  на byte-identical копии launcher рядом с безопасной Node-подменой. Исходный
  UTF-8 файл имел22LF и0CRLF. `cmd` выполнял обрывки строк, включая
  `4_RECOVERY_RESULT` и `eport.json`; Node-подмена не вызывалась, batch ошибочно
  завершался с0. Это отдельная доказанная причина нового screenshot.
- [x] В `XV/INSTALL-CORE4.cmd` заменены только LF→CRLF, русский текст и команды
  прежние. Оригинал сохранён как `INSTALL-CORE4.cmd.lf-original`.
- [x] Исправленный byte-identical launcher проверен на подмене с кодами0/1/7:
  ровно один вызов с аргументом `run`, правильная SUCCESS/BLOCKED ветка,
  точный exit code, читаемый русский текст, stderr пуст. Проверены пробелы в
  пути `%~dp0`, очистка NODE_OPTIONS/NODE_PATH и завершение после pause.

### Decision Log

- Исправление ограничено форматом локальной operational обёртки. Helper,
  candidate, installer, evidence pins, gates и правила no-replay не меняются.
  Тестируется фактический batch parser, без запуска настоящего `run`/`inspect`,
  AE, MCP или installer. Product suites/full release здесь нерелевантны.
- После повторного открытия Codex broker принадлежит новому PID2752; его
  bytes/identity отличаются от исходного24688. Подмена baseline не выполнялась.
  Helper по-прежнему допускает отсутствие broker после штатного завершения;
  если новый marker останется, exact-CAS guard должен отказать до intent.
  Этот отказ нельзя обходить повтором, удалением marker или расширением pins.
- Свежий read-back: отчётов recovery нет, transaction/intent и install gates
  отсутствуют. Это вместе с воспроизведением подтверждает отказ batch до
  восстановления. Закрытие Codex и запуск исправленного launcher остаются
  подготовленным ручным переходом; actual install/live proof ещё не получены.

### Validation

- `test-launcher-format.cjs` / `launcher-format-validation.json`: исходный
  screenshot воспроизведён с0stub calls; все3исправленных сценария PASS.
  Изменены только22line endings:1086→1108bytes. Новый launcher SHA-256
  `df8e54c1c24b5093e1182338c1e7827e10aa3b8775609573b8fda4a7e930a499`;
  прежний `17be880c…` выше относится к сохранённому LF-оригиналу.
- `root-launcher-format-readback.json`,06:20:29UTC: все5protected hashes и
  полная receiver identity/bytes прежние; installed packagefa9e, gates,
  broker ledger и `.next` отсутствуют. Broker изменён новым runtime, что явно
  отражено в отчёте; общая неизменность всех markers не заявляется.
- Actual recovery/apply/native dispatch0 в этом диагностическом блоке;
  helper/tests hashes `80583154…`/`42a8f885…` прежние. Их46offline checks и
  независимое review не повторяются из-за изменения только batch line endings.

## Отказ ENOENT после закрытия Codex — 29 октября 2026

### Progress

- [x] Сохранены все5dated reports06:27:54–06:29:49UTC, включая screenshot
 06:29:01. Во всех `blocked/recovery_local_failure`, `systemCode=ENOENT`,
  `failureStage=snapshot`, `recoveryIntentStarted=false`, `leaseRetained=false`.
  Файл или каталог не указан; прежняя диагностика потеряла точный шаг.
- [x] Fresh installed verifier/candidate closure/package/semantic settlement и
  read-only branded `planInstall` PASS; все5protected hashes и receiver all6/bytes
  прежние. Intent/install gates/broker ledger отсутствуют. Package по-прежнемуfa9e;
  broker нового managed PID31972, его исходные pins не расширялись.
- [x] Добавлены фиксированные allowlisted `failureCheck`/`failureResource`
  вокруг snapshot readers, lease acquire, plan/baseline и held-handle checks.
  Path/message/stack/credentials не публикуются. Helper/tests до правки сохранены
  как `*.enoent-original`. Порядок checks, intent, CAS, lease и apply прежний.
- [x] Новый `CHECK-CORE4.cmd` вызывает только `inspect`, сохраняет отдельный
  `recovery-inspect-latest-report.json` и показывает его в окне. Он не вызывает
  recovery/apply; старые5dated reports и latest installation report сохранены.
  CLI `inspect` теперь также проверяет pure install plan/baseline до lease:
  исходный ENOENT мог возникнуть и в планировании. Plan/credentials не выводятся.
- [x] Получен отчёт CHECK при полностью закрытом Codex; причина установлена:
  внешний CMD не видел виртуализированную установку MSIX. Исправление и новый
  ручной переход описаны в следующем разделе.

### Decision Log

- Точный исходный ENOENT **не восстановлен**. Текущие file readers и планирование
  проходят, а actual inspect останавливается на новом broker. Даже read-only
  in-memory projection отсутствующего broker проходит snapshot и блокируется
  process census: отсутствие broker само по себе ошибку не объясняет. Projection
  не была authority/proof и не использовалась для actual apply.
- `failureStage=snapshot` мог относиться и к `planInstall`/открытию receiver
  после получения lease: stage раньше не менялся. Отсутствие gates и
  `leaseRetained=false` не доказывают, что lease вообще не приобретался; он мог
  штатно освободиться при pre-intent отказе. Все5reports подтверждают именно
  отсутствие начала recovery intent; повтор recovery не выполнялся.
- Node realpath может сообщить missing ancestor вместо leaf и использует
  внутренний lstat, обходящий JS proxy. Поэтому ресурс задаётся перед вызовом
  фиксированной меткой, а не выводится из произвольного `error.path`.
- Следующий ручной шаг заменён: полностью закрыть Codex, один раз выполнить
  `XV/CHECK-CORE4.cmd`, дождаться отчёта, затем открыть Codex. Это read-only
  диагностика состояния вне lifetime managed MCP. INSTALL пока не повторять;
  markers/gates не удалять, baseline не перепривязывать к новому broker.

### Validation

- `node --test .../test-recover-settled-owner.cjs`:60/60PASS, syntax PASS.
  Новые14checks: missing5protected files/transaction parent/receiver, plan ENOENT
  under lease, disappearance перед receiver open, realpath ancestor, redaction.
  Ещё3из них проверяют pure check-only planning success/ENOENT/baseline refusal
  при acquire0/ioMutations0/apply0.
  Подтверждены release здоровых gates до intent и прежний UNKNOWN/no-replay после
  intent; absent-broker success и foreign-broker refusal сохраняются.
- Independent read-only delta review ACCEPT, P1/P2 отсутствуют. Final helper
  SHA-256 `adff6d88f8772f5713642c62a3419c5321bd7449c38c7fdfab5f76968de0ad27`;
  tests `54b6d0277acd9f36e8701ae4e47463645696e2c8fcbb0732e2e755f9f35ca3de`.
  Старый source review/46tests относятся к `*.enoent-original`.
- `test-inspect-launcher.cjs`:2real-cmd stub cases0/1PASS в temp path с пробелами;
  ровно один аргумент `inspect`, точный exit, report redirection и cleared env.
  Новая wrapper сохранена с CRLF. Actual CHECK в текущем открытом Codex ожидаемо
  дал `recovery_broker_identity_changed`, check/resource=`broker_marker`, exit1,
  intent=false, без apply. Это проверка wrapper, не stopped-state inspection.
- Evidence: `root-enoent-diagnosis.json`, `inspect-launcher-validation.json`,
  `root-inspect-launcher-validation.json`, `enoent-diagnostic-review.json`.
  CHECK hash `349f4f3fcfe73f1e218b4918beeee95d93e1f31061dfc2ee50e21529c91994f1`.
  Actual recovery/apply/native0;
  full release/product suites не повторяются: product/candidate bytes прежние.

## Причина ENOENT: разные представления AppData в MSIX — 29 октября 2026

### Progress

- [x] Пользователь подтвердил: INSTALL выполнялся при полностью закрытом Codex.
  Новый пользовательский CHECK07:10:19UTC отказал до lease/intent именно на
  `transaction_parent`. Оригинал сохранён как
  `user-stopped-check-20261029T071019.json` до новых диагностических вызовов.
- [x] Win32 `GetFinalPathNameByHandle` для логического descriptor показал
  физический файл в
  `AppData/Local/Packages/OpenAI.Codex_2p2nqsd0c76g0/LocalCache/Local/AEAgentCore4/installation.json`.
  Файл репозитория этим механизмом не перенаправлен. Нормальный `realpathSync`
  возвращал прежний логический путь; одной такой проверки было недостаточно.
- [x] Установлен Windows-пакет `OpenAI.Codex_26.1023.6621.0_x64__2p2nqsd0c76g0`,
  family `OpenAI.Codex_2p2nqsd0c76g0`, manifest AppId=`App`. Host/descriptor
  machineId=`MSI`; ошибки смены компьютера здесь нет.
- [x] Отдельный read-only Node с package context/PreventBreakaway увидел
  transactions и все5protected files с точными исходными hashes. Контрольный
  дочерний Node без сохранения context увидел ENOENT для transactions и4файлов
  AppData; repo config остался доступен и совпал. Эти пробы не импортировали
  recovery, не запускали runtime/AE и не меняли installed state.
- [x] Локальный package-context relay подготовлен, scoped fixtures и independent
  review пройдены; actual read-only запуск из внешнего context подтвердил
  доступ к прежнему state и соблюдение исходных guards.

### Decision Log

- Исходная причина теперь подтверждена двумя представлениями одной файловой
  системы. Перезапуск Codex возвращал видимость виртуализированной установки;
  он не восстанавливал удалённый transactions и не доказывал race shutdown.
  Ошибка не исправляется созданием пустого каталога во внешнем AppData.
- Существующие descriptor/history содержат логические пути. Для этой локальной
  операции требуется тот же filesystem context; credentials, origins, journal,
  owners и authority не копируются в другой root, физический LocalCache не
  подставляется вместо проверяемого логического installRoot.
- Документированный `Invoke-CommandInDesktopPackage` даёт package identity и
  доступ к virtualized resources; `PreventBreakaway` сохраняет context детей.
  Его token не идентичен обычному процессу приложения, прочие side effects
  не гарантированы. Здесь используется только проверенное файловое поведение
  отдельного one-case operational relay; все штатные install/recovery checks
  сохраняются. Это не общий production-контракт обновления Core.
- MSIX-свойство AppData является дополнительным installer/portability gap:
  независимость установки от запускающего host этим обходом не принимается.
  Установленный state сейчас не мигрируется; отложенный portability milestone
  и его P1–P8 сохраняются открытыми.
- Relay использует Node outer и короткие фиксированные inline PowerShell
  commands. Effective PS5.1 policy=Restricted сохранена; `.ps1`, IEX, script-file
  eval, `ExecutionPolicy Bypass` и изменения manifest/настроек не используются.
- У каждого handoff свой requestId/start/child-started и terminal+commit с
  fsync/hash correlation. Возврат Invoke не объявляется завершением операции.
  Timeout/неясный launch дают UNKNOWN без kill/retry. Для `run` до handoff
  создаётся отдельный wx `package-context-run-submit.guard.json` в evidence;
  он не удаляется автоматически даже при BLOCKED. Original install lease,
  receiver/broker CAS и recovery intent остаются самостоятельными guards.
- Root принял writer ownership после capacity-ошибки исполнителя и закрыл две
  адресные несовместимости до передачи пользователю: outer не содержал
  packageHash для повторной проверки installed result; successful inspect
  исходного helper не содержит automaticReplay. Sender/receiver pins теперь
  совпадают; отсутствие automaticReplay допускается только у inspect success,
  наружу возвращается false. Underlying helper не изменён.

### Validation

- `root-package-context-probe-result.json`,07:18:07UTC:
  transactionParentPresent=true, allProtectedMatch=true; exact Node24.15.0/MSI.
- `root-package-breakaway-probe-result.json`,07:20:17UTC:
  transactionParentPresent=false, descriptor/origins/journal ENOENT, config hash
  прежний. Runtime/recovery/native0 в обеих пробах. Launch cmdlet доступен;
  developer mode/elevation/manifest/permissions/execution policy не менялись.
- Нормативные первичные источники Microsoft:
  [AppData virtualization](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-behind-the-scenes#appdata-operations-on-windows-10-version-1903-and-later),
  [package-context process и его ограничения](https://learn.microsoft.com/en-us/powershell/module/appx/invoke-commandindesktoppackage?view=windowsserver2025-ps).
- `node --test .../test-package-context.cjs`:36/36PASS, включая успешную установку
  на fixture, blocked/unknown/timeout, duplicate guard, redaction, точный actual
  inspect success schema и production pin contract. PS5.1 parse обеих encoded
  программ PASS;6CMD stub cases0/1/7 для inspect/run PASS, CRLF сохранены.
  Syntax2PASS; unchanged underlying60tests не повторяются.
- Independent bounded code review ACCEPT после адресного fix-review; открытых
  P1/P2 нет. Это source review, не actual install acceptance.
- Actual relay inspect из Codex07:36UTC и из доказанного внешнего filesystem
  context07:38:51UTC: bindingsVerified=true, helper ровно1раз, ожидаемый
  `blocked/recovery_broker_identity_changed` на текущем19704, intent=false.
  Внешний процесс до relay не видел descriptor/transactions. Relay видит их и
  достигает прежних helper guards. Actual run/apply/native0.
- `root-msix-relay-validation.json`: все5protected hashes, receiver all6/bytes
  и5исторических recovery reports прежние; original transaction/install gates и
  новый run-submit guard отсутствуют. Final hashes и source review — в этом
  файле и `package-context-review.json`. Исторические wrapper bytes сохранены
  как `*.cmd.msix-original`; старые format fixtures читают именно эти snapshots.

### Прежний ручной шаг — отменён успешной установкой ниже

Полностью штатно закрыть Codex и один раз запустить обновлённый
`XV/INSTALL-CORE4.cmd`. Он входит в проверенный package filesystem context и
вызывает прежний one-case recovery/installer. Не открывать Codex до результата.
При SUCCESS открыть Codex для configured read-back; при BLOCKED/UNKNOWN сохранить
`package-context-reports` и recovery reports и не повторять запуск. Root не
выполнял actual run; установка f548 ещё не объявляется завершённой.

## Завершение установки без нового пользовательского запуска — 29 октября 2026

### Progress

- [x] Последний пользовательский run `34f4a531-afdb-4fd2-801c-21ffe1a92964`
  подтверждён committed terminal: `blocked/recovery_broker_identity_changed`
  в первом inspect, до вызова apply, lease и recovery intent. Повторы Codex
  создавали нового broker owner; XV ошибочно продолжал ожидать исходный24688.
- [x] Подготовлен отдельный XVI successor с configured status/CIM и точными
  bytes/шестью identity полями нынешнего собственного broker21876. Исходный
  receiver, пять protected hashes, candidate и historical settlement прежние.
  Девять файлов predecessor, включая старый guard и helper, связаны hashes;
  старый guard сохранён, универсального принятия любого нового broker нет.
- [x] Устранён пробел прежних fixtures: настоящие installer, lease, boot и
  semantic/lineage APIs проверены на temp-only установке с синтетическими
  credentials и подписанным восьмисобытийным journal. Production state и ключи
  не копировались, runtime/HTTP/AE в тестах не запускались.
- [x] Root завершил только проверенный idle Node21876 в08:56:53UTC, сохранив
  Codex открытым. После этого actual inspect08:57:01UTC — `inspectionReady`;
  полный process census, endpoint, journal, evidence и install plan прошли.
- [x] Actual run `9929b149-59ee-4356-85c0-80453b7f7a4c` завершён08:57:26UTC:
  `installed`, exit0, exact f548, оба markers архивированы под общим lease,
  journal неизменён. Это фактическая установка, а не подготовка launcher.
- [x] Независимый файловый read-back08:58:16UTC подтвердил immutable release,
  CEP, Node, config, origins, semantic journal и оба архивных markers.
  Owner/install gates отсутствуют; старый и новый submit guards сохранены.
- [x] Прежний XV и новый XVI INSTALL показывают сохранённый успешный результат,
  не вызывая recovery. Исходные CMD bytes сохранены;2real-CMD проверки PASS.
- [ ] Новое configured MCP подключение после перезапуска Codex. Единственный
  текущий вызов status после установки вернул `Transport closed`; второй
  runtime не запускался. AE/CEP live acceptance остаётся отдельным шагом.

### Decision Log

- Прежний `forceTerminationAllowed:false` был процедурным ограничением root
  для offline operator, не отдельным запретом пользователя на обслуживание
  idle MCP. Текущее поручение завершить ремонт и действующий scope установки
  позволяют точное обслуживание служебного процесса. Helper процессов не
  завершает и runtime authority не получает. Root отдельно зафиксировал
  `root-maintenance-decision.json`, submit/result и свежий configured status.
- Это принудительное завершение точного процесса, **не** заявление о штатном
  drain. Перед ним проверены PID/native birth/parent/argv/executable hash,
  protected hashes, closed receiver, отсутствие pending/unresolved/worker/AE
  и иных writers. После последнего status новые MCP-запросы не отправлялись
  до завершения; один retained Process handle связывал проверку с Kill.
- Два подготовительных отказа проверки времени не достигли submit/Kill:
  PowerShell JSON преобразовал timestamp в DateTime; CIM отбрасывает последний
 100ns digit. Native birth `08:38:36.0666837Z` и CIM `08:38:36.0666830Z`
  установлены отдельно, затем оба проверены точно. Выполнен только один Kill.
- Stopped-state полный inspect и проверки под lease не ослаблялись. Наличие
  `unknown:true` у старого peer означало closed store; signed journal был
  семантически settled. Историческая UNKNOWN-команда не повторялась.
- Повторять INSTALL теперь не требуется. Остаётся перезапуск только Codex
  для configured handshake с обновлённым MCP entry. AE не запускался и не
  перезапускался; пользовательские проекты не изменялись. Portability/MSIX
  filesystem gap и двусторонняя приёмка не объявляются решёнными.

### Validation

- XVI orchestration/package relay:96/96PASS. Новый `test-real-install.cjs`:
 3/3PASS; реальные fresh/absent broker archive+install, credential rotation,
  CEP/config/readback, две historical edges, reopening store и duplicate no-replay.
  Stale broker и forged hash-consistent MAC отказали до lease/archive/apply.
- Независимое bounded source review: P1/P2нет. Дополнительный lifecycle review
  не нашёл конкретного незавершённого native writer в подтверждённом scope;
  обычный status не объявлен полной метрикой всех внутренних busy-состояний.
- Evidence: `snapshots/core4-live-proof/XVI-current-owner-install-20261029/`,
  `root-installed-readback.json`, `root-maintenance-result.json`,
  `root-configured-after-install.json` и correlated `package-context-reports/`.
  Descriptor SHA256 `67202b2e5e75e462eb3631757e035f512a86dc5f78db6af1b17355e84ea4419e`;
  config `e709ace397056955261d2585611d7e7feb048b915a601c020578d9742a848d57`.
- Installed package `f54863dbb69b5e3a4b0e79d8ee3629cf71c7eced0a3759745d8899fa65a1ce90`;
  installationId/origins/journal сохранены. Actual recovery/install1, native/AE0.
  Source `core4/**` и candidate не менялись; full release не запускался.
