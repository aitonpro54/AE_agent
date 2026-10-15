# Восстановление подключения MCP → bridge → AE

15 октября 2026. Единственная цель: восстановленный допуск, настоящий bridge и
успешный `get_project_info` через обслуживающий чат MCP. Очередь, рендер, изменение
и сохранение AEP вне scope. Текущий чат — sole controller.

## Progress

- Fresh product startup: устранён deadlock первого подключения при отсутствующем
  lifecycle store. Server-computed fresh absence разрешает только connect и
  фиксированный `get_project_info` через существующую read-only capability;
  store не создаётся, mutation barrier сохраняется. Offline проверка завершена;
  установка панели, новый daemon и реальное MCP чтение принадлежат root.
- Пользователь явно одобрил разовый переход к обычному запуску с сохранением
  старого UNKNOWN. Три старых MCP adapters завершены по удержанным observed process
  objects; это не original daemon exit proof. Source f92e3b0 перенесён fast-forward,
  product/auto-start включены; config inverse comparison, DPAPI backup,
  foreign7 и old journal3 hashes PASS. Новый policy разрешает только daemon lifecycle.
- Первый product ensure отказал до launch из-за stale pin control reader; старые
  ссылки двух неизменённых reviewed scripts синхронизированы во всех4 consumers.
  Actual-module/tamper matrix8 и PowerShell AST pin PASS, factories/HTTP/processes0.
  Неудачная операция6542e734-1854-4fa3-8588-13366e72d547 сохранена; launch records
  отсутствуют, replay не выполнялся. Следующий запуск — отдельная операция для
  исправленного source, а не повтор старого finite runtime.
- После полного Restart Codex пользователь подтвердил продолжение в чате
  01a13fa7-d879-7373-a9e1-4d17746b9b44. Свежий adapter выполнил ровно один ensure:
  `trusted_original_io_timeout_no_replay`, затем UNKNOWN/owned=true. Bridge3456
  отсутствует; пассивный CEP inspect подтверждает открытую панель3.3.1 Disconnected.
  V14d journal теперь Genesis/OwnerEpoch/LaunchConsume; exact2 successor неприменим.
- Обычный startup оказался привязан к experimental finite title profile по наличию
  каталога. В отдельном managed worktree от64f41e4 готовится product/initial-owned
  selection и узкий authenticated bootstrap без открытия общего write admission.
  Исходники действующей установки заблокированы original pins и не менялись.
- Передача принята из [предыдущего чата](connection-handoff-20261015.md), checkpoint
  7f7d9c4. Все прежние writers/native owners остановлены, pending0. Ветка продолжения:
  `codex/restore-mcp-connection`. Пять переданных WIP и семь чужих WIP сохранены.
- V13: native Open/C1 превысил read deadline30s; после ответа timeout завершилась
  запись OwnerEpoch. LaunchConsume отсутствует. Original controller/broker exact
  exits подтверждены. Порт3456 закрыт, CEP8870 существует; project read ещё не было.
- fae6d1f сократил измеренный Fresh147→28ms. Полное время C1 этим не доказано.
- Native successor и JS/driver интеграция завершены в 7729f55; source review Astra GO.
  V14c: все три native target собраны. SetupCreator завершился exit2 до prepare;
  exact original exit/EOF подтверждены, intent отсутствует, новый enrollment пуст.
- Найден конкретный pre-intent blocker: inherited foreign Modify ACE не проходят
  `OwnAcl` на old seal/roots. Один SID — CodexSandboxUsers, четыре не разрешились.
  Старые journal bytes/pins сохранены. Добавлен безопасный failure code в stderr.
- V14d: actual private ACL repair9/9 PASS с original-handle read-back и backup;
  source 5c1f41d, compile3 PASS, BuildAndSeal PASS. Creator exit0/bothEOF,
  pending0, seal11592B/intent584B; install shell закрыт. Bridge ещё не запускался.

## Decision Log

- [block: fresh lifecycle read] [executor: ae_specialist] [ownership: lifecycle
  state/adapter, bootstrap, CEP connect, bridge integration, scoped tests/docs].
  Missing/gen0/pendingnull недостаточны: проверять отсутствие обоих файлов и
  process history/lock. Общий фиксированный getter сохраняет прежний результат;
  cap проверяется при enqueue и delivery, включая только свою command identity.
  Readiness product stop получает отдельные фактические counts от существующих
  quiescence readers; legacy retained readiness и write admission не открываются.
- [block: ordinary product startup] [executor: ae_architect — bounded source review;
  ae_implementer — product seams; ae_specialist — native diagnostics; root — sole live]
  Отделить выбор deployment mode от authority; не использовать отказ как fallback.
  Старые managed generations сохраняют retained admission. Product ticket разрешает
  только typed bootstrap и его внутреннее чтение проекта. См. [режимы](../docs/deployment-modes.md).
- Текущий experimental UNKNOWN не переводить в product автоматически. Original
  daemon disposition недоступен через прежний addon; PID/listener absence не exit.
  Для активации подготовленного product режима требуется отдельное рассмотренное
  пользователем разовое migration boundary с сохранением старого UNKNOWN и журналов;
  старые grants не переносятся. Повторного ensure, forensic takeover и exact3 reinstall нет.
- Только подключение; уже принятые AME fixes сохраняются, операции очереди запрещены.
- [block: post-C1 recovery] [executor: ae_specialist — native; ae_implementer —
  JS/driver; Astra — выбранный пользователем bounded architecture review]
  [ownership: непересекающиеся native и build-helper файлы; root — Git/build/live].
- Поддержанного обычного post-C1 reinstall нет. Использовать existing SetupCreator:
  independent once local_operator successor с exclusive old fence, exact2 historical
  journal, durable CREATE_NEW intent до новых anchor/enrollment effects. Старые
  записи/floor не менять, JSON не считать grant, повтор old ensure исключён.
- Сохранить prepare424/final752/ACK80 и v1 fresh-install. V2 связывает original
  creator и actual intent со successor seal; никаких новых broker protocols.
- Parent read witness старого fence закрывается до creator. Только observer intent
  допускает existing native writer; обычные pins сохраняют прежний share mode.
- Перед единственным ensure нужен свежий servicing MCP adapter: desktop процессы
  старше d314a2f, Node24.19 подходит. Успех отдельного child не является подключением
  обслуживающего чат MCP. Если штатный restart недоступен агенту, запросить один
  технический шаг пользователя после полной готовности установки.
- [block: ACL допуска] [executor: ae_specialist — native correction; выбранная
  пользователем Astra — bounded review; root — sole permissions/build/live].
  Shared repository проверять по original pin/owner/present valid DACL; strict
  foreign-write policy относится к private runtime/journal/setup и их файлам.
  Три private parent DACL должны быть protected от будущего наследования.
  Scope machine repair — девять существующих private объектов, backup DACL и
  неизменность original IDs/bytes; ACL репозитория и ancestors не менять.
  Ancestor rename сохраняет physical intent/key, а canonical/pin проверки закрывают
  доступ. Он не даёт удалить intent через защищённого непосредственного родителя.

## Validation

- Fresh read: 62 actual-module/VM counterexamples PASS; transition89, lifecycle
  state/adapter/review и прежний fixed-getter regression PASS; syntax8 JS,
  rules/diff PASS. Проверены historical missing,
  marker loss, corrupt/null store, durable pending, lock до/после enqueue, queue,
  edit session, active plan, script tamper/state drift и closed write admission.
  Actual HTTP handler и intake→observation dispatcher проверены в VM при закрытом
  write admission; это не socket/auth integration proof. Daemon/сеть/native/AE
  не запускались. Live criterion остаётся NOTRUN у исполнителя.
- Native correction: reuse того же удерживаемого seal с прежними Fresh/identity joins,
  verb/phase/deadline/elapsed диагностика и пассивный same-instance observer после UNKNOWN.
  Observer не трогает HANDLE при pending work и не меняет authority/IO. Отдельный
  offline compile/link всех3 targets PASS; затем affected node/broker corrections и
  explicit child mode compiled PASS. Installed binaries/runtime не заменялись.
- Product matrix12, panel-bootstrap74, initial-runtime24, observation7,
  controller-preload4 и shared-queue fixtures PASS. Actual isolated HTTP проверил
  auth/Host/Origin/marker, create_comp без grant → proposal_required, project read
  через fake CEP; pending/inflight0 и child exit/cleanup подтверждены. Реальный AE,
  native addon и providers не вызывались. Syntax12JS/rules/diff PASS.
  Это не live AE proof; actual project read по-прежнему NOTRUN.
- Successor behavioral fixtures5 и existing build fixtures12 PASS; syntax7 JS,
  PowerShell parser, compile identity.cs, rules/diff PASS. Source review Astra GO.
  Native C++ compile/link трёх targets PASS; live project read ещё не выполнен.
- V14c failure сверена по исходному retained HANDLE, exit2/stdoutEOF/stderrEOF;
  все handles закрыты, pending0. Доказанный ACL blocker воспроизведён точным
  предикатом на actual DACL без повторного запуска creator.
- ACL reference cases 5/5 PASS; native constexpr проверяет actual Modify,
  DELETE_CHILD/DELETE, WRITE_DAC/OWNER, read-only/inherit-only и protected parent.
  Исправленный native source compiled/linked во всех трёх targets — PASS.
- Machine repair изменил только девять private DACL через same original HANDLE;
  frozen input SHA, old setup pin, zero fence, IDs/bytes до/после PASS. DACL backup
  CREATE_NEW+Flush до изменений; repo/ancestor ACL не менялись.
- V14d actual input SHA299f0fd79c8f892ac418f4a73bc14730fba86a59d11fa5bdc51bb60e19ed4a66;
  `build-and-seal-receipt.json`: sealed_creator_closed, originalExit0,
  stdoutEOF/stderrEOF. Новый runtime автоматически не запускался.
- Переданные WIP имели syntax PASS, но содержали незавершённую native интеграцию и
  ошибки JS genesis key/selector. Это диагностические факты, не приёмка.
- Проверить native-compatible closed records, actual intent/binding, отсутствие
  replay/fallback, v1 compatibility и source syntax/rules/diff; затем all3 compile.
- Перед live freeze проверить fresh census и все actual inputs. Исторические
  original receipts не заменяют новый native grant.
- Критерий завершения: successful actual typed ensure → listener → panelConnected →
  get_project_info с именем/путём/числом элементов реального AE проекта. Offline
  тесты и успешная сборка не заменяют это чтение.

## Следующее действие

Завершить bounded product fixture/ingress validation и зафиксировать reviewable source
commit в worktree. После явного решения о разовом переходе согласованно завершить
старую controller boundary и применить новую конфигурацию product с обычным автостартом.
Старый UNKNOWN сохранить. Затем проверить открытие панели, connection и настоящий
get_project_info через обслуживающий чат MCP. Очередь/AEP writes/save вне scope.
