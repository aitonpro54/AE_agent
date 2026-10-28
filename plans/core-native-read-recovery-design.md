# Восстановление после terminal failure единственного read-only inspect

28 октября 2026. Это один самостоятельный инженерный scope с одним initial
plan-review. Capture, disposition, persistence и обновление проверяются как одна
цепочка. Автоматического result/fix/final review нет.

Локальная актуализация после review: reviewed snapshot `80cc242`, исходные
plan digests сохранены в пакете. Получен conditional go; все шесть findings
разобраны в [decisions](../reviews/argon/native-read-capture/20261028-capture-plan-01/decisions.md).
Этап A завершён actual receipt/proof. Первый freeze B–D дал 91 адресную проверку
PASS; Root независимо сверил исходники и детерминированную сборку. Локальный
review выявил один P2 в identity CAS receiver owner; адресное исправление
получило independent ACCEPT. Окончательный freeze04: 96 selected PASS,
package `9d43c624a778`, operator `fdae16feef25`; Root сверил все 25 source hashes,
актуальные dependency keys и повторяемость сборки. B→C фактически применён,
read-back PASS. Дополнительный direct-main bootstrap defect исправлен и проверен.
Итоговый package `fa9e2f454588` установлен: authenticated CEP и одно новое native
чтение PASS. Работа остановлена по поручению пользователя; продолжение —
[handoff](core-panel-installation-handoff-20261028.md).

## Цель и исходное состояние

Закончить установку после ES3 compile failure, сохранив UNKNOWN/no-replay и
историю исходной команды. Источник фактов — [native ES3/recovery](core-native-es3-recovery.md).
ES3 исправление — commit `cd95b26`; успешное native чтение ещё не получено.

Одна исходная команда `project-inspection/inspect` доставлена в установленный
runtime; callback timeout закрыл receiver. После закрытия информационной modal
поздний authenticated completion был отклонён `unknown_no_promotion`. Его result
не сохранён сервером и пока неизвестен. Root закрыл proof child штатно, exit 0.
Journal остаётся `origin → begin → unknown`, receiver owner пустой и сохранён.
Ledger отсутствует, configured MCP временно disabled. Мутаций и save не было.

Actual cached result подтверждён: ровно `readFailureVersion:1`,
`outcome:"rejected"`, `code:"host_registry_unavailable"`. Исходная гипотеза
подтвердилась после human click; receipt/MAC/provenance проверены Root и
independent audit. Иной результат не даёт основания применять этот recovery.

## Progress

- [x] ES3 исправление и grammar regression: 42 selected checks PASS.
- [x] Подтверждён existing cached completion recovery без eval.
- [x] Подготовлен ограниченный [план capture](core-native-read-capture.md).
- [x] Подготовлен conditional persistence design с явным predecessor.
- [x] Получен единственный привязанный review этого unified плана и локально
  разобраны замечания.
- [x] Реализованы и проверены collector, fixed eligibility/operator/reader и
  installer lineage. Runtime UNKNOWN до доказанного disposition сохраняется.
- [x] Root получил original receipt и проверенный settlement proof; при пробеле
  остаётся blocked без apply или нового native dispatch.
- [x] Source freeze B–D: 25 файлов, 91 PASS в 8 selected checks, boundaries21,
  syntax21. Runtime package `0ba911e5866d` (60 файлов), private operator
  `6f7034c9f0f7` (66 файлов). Root подтвердил source hashes и повторяемость сборки.
- [x] P2 owner identity CAS закрыт; итоговый source freeze04: 96 PASS,
  package `9d43c624a778`/operator `fdae16feef25`, independent source ACCEPT.
  Первый package/operator superseded, actual не применялись.
- [x] После exact parent IPC выполнена одна durable disposition и штатное
  обновление, source commit `dd6c1be`; original UNKNOWN/noReplay сохранены.
- [x] Свежий CEP view получил ACK сохранённого callback без eval. Direct-main
  bootstrap import cycle исправлен; startup без warnings/storeFault PASS.
- [x] Получено успешное новое native чтение; переносимость второй машины
  по-прежнему проверяется отдельно.

## Этап A: evidence-only capture

Полный bounded контракт — в capture-плане. Отдельный collector проверяет old
installation/release и actual CEP closure, process provenance, journal/binding,
original effect-none command и отсутствие других obligations. Под exclusive
install/broker gates он принимает original cached completion через свежий
authenticated канал. Existing receiver owner и journal не меняются. Команды,
eval, polling и completion ACK отсутствуют.

Fresh challenge дополнительно связывается с capture purpose, receiver identity,
command digest и journal-tail digest. Payload должен совпадать с original
binding/pins; code/profile не выбирается caller. Результат и authenticated
transcript сохраняются durable локально без credentials. Иной result или
неполная provenance останавливают conditional этапы B–D.

Panel MAC доказывает канал обладателя credential, но не является подписью AE.
Settlement требует согласованной совокупности: verified fixed dispatcher,
original managed-child provenance и command/store/channel, наблюдавшийся поздний
correlated completion и повторно полученный exact cached result. Fixed wrapper
возвращает `host_registry_unavailable` до вызова asset. `pending:null`, exit 0,
пустой owner или текст modal по отдельности не доказывают settlement.

## Этап B: одноразовая terminal disposition

Fixed validator ограничен только `project-inspection/inspect`, phase inspect,
проверенным effect-none executor и указанным exact failure. Он связывает
installation/store/origin/package/contract/executor/payload, original dispatch
binding, capture channel/transcript, journal tail, отсутствие остальных
obligations и техническую process provenance.

Pure inspect возвращает точный proof digest. Parent-owned локальный канал
подтверждает только этот digest и одноразовый nonce. Capability создаётся внутри
оператора после fixed validation, хранится приватно, потребляется один раз и
не восстанавливается из произвольного JSON/Boolean. Публичного sign-proof API,
MCP grant или caller-selected validator нет. Подмена receipt-файла authority
не создаёт.

Apply повторяет CAS под gates и записывает append-only versioned
`terminal-read-failure-disposition`. Domain-separated parent authorization
подписывается old control credential; capture проверяется отдельно old panel
credential. Секреты не входят в новые evidence. Authorization связывает exact
proof, исходный descriptor, store, command, journal tail, schema и operator
provenance. Reader повторно проверяет fixed eligibility, а не доверяет одному
полю `trusted` или внешнему validator callback.

Исходные begin/UNKNOWN сохраняются byte-for-byte; исторический state команды
остаётся unknown с отдельной terminal disposition. `has(commandId)` всегда
запрещает replay. Только после append/fsync/read-back допустимо архивировать
exact пустой receiver marker в transaction. Partial write, конфликт, crash или
неизвестный результат оставляют gates/owner и блокировку; автоматических retry,
reset/cleanup/rollback нет.

## Этап C: persistence через явную installer lineage

Новый descriptor получает явную версию и predecessor
`{transactionId, previousDescriptorHash}`. `planInstall` создаёт transactionId
до descriptor; apply использует тот же ID. Hash предыдущего descriptor считается
по точным сохранённым bytes. Transaction уже сохраняет эти bytes в
`previousDescriptor`, а `appliedDescriptorHash` связывает точные новые bytes.
Циклической hash-зависимости нет: descriptor не содержит hash всей transaction.

Fixed resolver начинает только с текущего verified installation descriptor и
следует только явно указанному UUID внутри `installRoot/transactions`:

1. Проверить путь, отсутствие symlink/reparse, version/schema/UUID,
   `appliedDescriptorHash` текущего узла и hash previous bytes.
2. Проверить одинаковые installation/machine/state/origin bindings и отсутствие
   cycles; разрешена лишь конечная цепочка с ограниченной глубиной.
3. Проверить историческую package closure и точное совпадение capture proof.
   Старый Node не исполнять; его bindings сверять с provenance, не подменяя
   текущим бинарником.
4. Descriptor без predecessor завершает цепочку. Он подходит лишь при совпадении
   искомого exact descriptor hash. Missing/mismatch/ambiguity закрывают admission.

Поиска альтернативных backups или fallback нет. Durable transaction появляется
до switch, затем повторный CAS и публикация нового descriptor. До switch
невыбранная transaction недостижима; после switch она достижима через явный
predecessor. Отдельный старый commit marker не требуется для этого контракта.
Достижимые transactions/releases сохраняются. Rollback или несовместимый reader
при неизвестном формате остаются fail-closed.

Модель доверия сохраняет существующую доверенную локальную installation и
credential storage. Hash lineage не защищает от атакующего, который произвольно
переписывает текущий descriptor и все локальные credentials/transactions.
Независимый аппаратный trust anchor в scope не входит.

## Этап D: reader, ACK и штатное обновление

Новый completion-store reader признаёт только fixed verified disposition этого
вида, оставляет unknown history и считает физический слот завершённым для новых
команд. Другие UNKNOWN и любые mutation остаются закрытыми. Старый reader на
новом record обязан отказать. Исходный candidate 947 reader не содержит и для
этой цепочки должен быть пересобран.

Collector никогда не выдаёт ACK заранее. После durable disposition и штатной
установки нового package нормальный authenticated `/complete` может вернуть
только correlated ACK старого receipt. Он проверяет exact historical pins,
binding и result через validated disposition/lineage. Это идемпотентная квитанция
сохранённого callback без eval, без promote original command и без нового grant.
Утрата ACK допускает лишь такую же повторную доставку receipt, не команду.
После clearing latch разрешено новое отдельное read-only inspection с новым
commandId через штатный typed MCP путь.

Configured Codex-client и собственный stdio proof различаются. Успех одного не
объявляется доказательством другого. User AEP не открывается/меняется/сохраняется;
новый restart AE в scope не добавляется.

## Изменяемые границы и проверки

Предполагаемые файлы: новый collector/operator и fixed lineage validator,
`completion-store.js`, `http-peer.js` для historical ACK, descriptor verifier,
`install-core4.js`, адресные tests и validation map. Package closure строится
штатно. Raw JSX, legacy authority, public issuance, generic mutation recovery и
изменения старого AE_agent исключены. Root единственный live controller.

Нужны изолированные negative/crash tests: wrong scope/asset/phase/command/binding/
pins/payload/installation/store/channel, MAC/role/Origin/Host/replay, forged proof,
missing callback, иной result/code, extra obligations, active/unknown processes,
CAS drift, symlink, short write/fsync/crash, double authorization/disposition,
token rotation, torn/unreachable/ambiguous lineage, cycles/depth, rollback и old
reader. Capture/ACK обязаны давать eval 0 и executable frames 0.

Проверки выбираются актуальным validation map; изменённая closure не наследует
старый PASS. Full release и desktop↔MSI round-trip не заявляются по offline тестам.
Runtime state/proofs/credentials не переносятся как authority между машинами.

## Decision Log

- Текущий ремонт завершён. Own startup9900 marker отдельно архивирован под
  identity/CAS и тем же branded lease до normal update; transaction
  `2d3d6993-fa3c-4035-8767-832b6c7604a2-own-startup-9900-retirement`.
  Новый install transaction `71950b55-63d3-41f8-872c-2b7d76feca10`, source `36905c4`,
  installed package `fa9e2f454588`. Original journal4 оставался неизменным.
- Root installed stdio child2300 запустился без stderr. Fresh native view открыт
  штатно через Window → Extensions; AE20108 не перезапускался. Fixed dispatcher
  прошёл recover→«Подключено» и authenticated peer.connected=true; до нового
  чтения journal оставался4events, значит ACK не создавал новую команду.
- Единственная новая inspection `inspect-c8d064d5-88b8-4fc2-a316-ccd9a99ccea9`
  вернула AE26.2x49, пустой несохранённый проект, items0/comps0/layers0.
  Original command UNKNOWN/terminal disposition и prefix3 сохранены, replay0,
  mutation/save0. Child2300 штатно закрыт exit0; owner/gates отсутствуют.
- Maintenance `enabled=false` восстановлен в true только в собственной MCP entry.
  Текущий Codex tool registry не перечитал Core4; actual configured-client reconnect
  остаётся первым шагом нового чата. Installed stdio→CEP→AE proof уже получен.
  По просьбе пользователя дальнейшие этапы здесь не запускаются.
- Actual B→C: pure proof `95c305d5a10a`, parent Node IPC одобрен один раз после
  проверки prepared plan/descriptor bytes; child exit0. Install transaction
  `58823925-5b97-4c2e-999e-4ac52aa2db4c`, disposition transaction
  `40fbd293-9aae-4bab-978f-06730c01ca0d-native-read-disposition`.
  Read-back60release/7CEP, descriptor v2, unchanged origins, rotated separate
  role keys и original journal prefix PASS; исходный owner архивирован с identity
  CAS. Исторический UNKNOWN не promoted, новая AE-команда не отправлялась.
- Первый direct-main installed MCP child9900: initialize/status/contract PASS,
  но circular imports захватили undefined bootstrap exports и дали storeFault.
  Native requests0, journal остался ровно4events/hash `7dd94910eb27`.
  Root сохранил identity своего нового startup marker до close, child штатно
  закрыт exit0 без transport fault. Broker gates удалены штатно, новый receiver
  marker сохранён. Source fix — публикация exports перед вызовом main start;
  отдельный actual-main regression должен покрыть этот путь. Только own marker
  может быть отдельно архивирован по fixed zero-dispatch provenance/identity;
  generic reset/UNKNOWN cleanup/повтор B не допускаются.
- Локальный source review первого B–D freeze: P1 нет; один P2 — пустой receiver
  marker можно заменить другим пустым marker во время ожидания IPC. Добавляется
  identity observation в stable B proof и held read-only handle с повторным CAS
  перед append/archive и проверкой archive после rename. Это исторический факт,
  без будущей runtime зависимости от inode. При mismatch — retain gates/intent,
  без C, удаления нового marker, rollback или автоматического повтора. Actual0.
- P2 delta source ACCEPT: `dispose-native-read.js` → `5e29121c81c6`,
  `native-read-disposition.js` → `20053d0df878`. `seal.ownerObservation` содержит
  dev/ino/size/birthtimeNs/mtimeNs/ctimeNs без atime, входит в stable proof и MAC.
  Path/held fd сверяются до append/archive; после rename ctime не сравнивается.
  Исторический reader не обращается к будущему inode. IPC schema прежняя;
  actual применение ждёт финальных проверок и нового freeze.
- Пользователь поручил завершить текущий ремонт/установку панели и затем
  остановиться для продолжения в новом чате. Scope остановки включает B–D,
  проверку установленного runtime и новое отдельное native чтение. Последующие
  продуктовые этапы и приёмка переноса на второй машине здесь не запускаются;
  фактический итог и оставшиеся ограничения сохраняются в проекте.
- A actual receipt принят: 168 protected files byte-identical, original UNKNOWN
  сохранён, ACK/native/eval0. B–D SOURCE GO в действующем reviewed scope; новые
  runtime/operator bytes требуют своих scoped checks и локального source review.
  Apply — только по exact proof/package/transaction/nonce через parent Node IPC.
- Persistent reader не зависит от dev repository/evidence files или старых
  текущих CEP/config/Node bytes. Он проверяет self-contained sealed fixed proof,
  old descriptor/release через lineage и immutable journal prefix. Полный A
  preflight используется до append; после append трёхсобытийный parser A не подходит.
- Source A freeze03 принят: 20 selected checks и independent source review PASS;
  actual production inspect PASS. Первая live evidence-only попытка истекла без
  receipt после отклонённого до ввода CU click. Actual native/eval/ACK0; original
  UNKNOWN сохранён. Root готовит retirement только own diagnostic gates, затем
  допустима одна новая receipt-capture попытка; это не replay AE-команды.
- Это единое initial review recovery-дизайна; после findings — адресная локальная
  проверка и реализация. Обязательного второго Argon review нет.
- Capture может дать точный отказ вместо ожидаемого result. В этом случае
  UNKNOWN остаётся, conditional apply/install/native не выполняются.
- По NRR-PLAN-03 collector после durable read-back отвечает явным отказом без
  ACK и ограничивает ожидание completion после link. Новый view CEP должен
  загрузить cfg после update, сохранив latch; connect старого view не является reload.
- По NRR-PLAN-04/05 install lease удерживается через B→C. Partial visible switch
  не снимает gate автоматически. Skip-lock Boolean/callback не допускается;
  согласованный private lease нельзя подделать объектом из caller input.
- По NRR-PLAN-01/02 historical ACK предшествует current-pins correlation;
  единый settled predicate применяется в open/begin/close, сохраняя unknown
  history и не отменяя ownership/fault. Нужны lifecycle tests всех трёх мест.
- Любой внешний verdict — evidence, а не runtime authority. File access,
  разрешение restart или пользовательское «сбросить» proof не заменяют.

## Validation

- Финальный actual proof: `VII-native-read-recovery-20261028/root-final-native-proof.json`,
  `installed-read-1793199534588/`, `connected-panel-observation.json`,
  `root-installation-readback-02.json`. Installed60release/7CEP и semantic lineage
  PASS; журнал6events: original origin/begin/unknown/disposition + новый
  begin/complete. SHA журнала
  `1a07b1a379a166a7c8be1af714fa9ac7f7f328f05ad98599fcf12473bdd040b4`.
  Post-read pending=null, storeFault/storeClosed/unknown=false, unresolved0.
  После close новая standalone проверка growing journal PASS.
- `mcp-preference-restored.json` и `final-runtime-state.json`: enabled=true,
  active Core4 processes0, install/broker/receiver owners и gates отсутствуют.
  Full release, configured Codex-client и desktop↔MSI P1–P8 этим не сертифицируются.
- Direct-main fix freeze05: manifest SHA
  `0281b7c6b36c1b8f1618afaa8814a49dde3d530481dd876227468c8060484539`.
  48 PASS в 4 selected checks; изменённые, но не выбранные byte closures явно
  deferred, прежние96 не объявляются PASS нового package. Negative fixture
  воспроизвёл circular warnings/storeFault; positive actual-main fixture с
  test-only ephemeral port подтвердил empty stderr и чистое закрытие owner.
  Root сверил26 source hashes/current4keys/deterministic package60 `fa9e2f454588`;
  operator66 `d1c5314eb4ea`, entry SHA `213e711c6c8f`.
- Private own-startup helper `retire-own-startup-and-update.js`, SHA
  `f2934e05ca502bef29b9e4738d00fb027f6331e10e1fbb985008046071a07b04`:
  independent source ACCEPT,7synthetic guards/identity PASS. Actual pure inspect
  PASS/proof `7ccc7e1f8c81583e5b0e8d149ac44e97df35d700d8e6855c2e53e9a1dc463592`;
  journal семантически проверен через current v2/lineage как module, без listener.
  Apply этого конкретного proof выполнен успешно; original journal не менялся.
- Actual evidence: `VII-native-read-recovery-20261028/root-actual-b-inspect-01.json`,
  `actual-apply-1793198080191/`, `root-installation-readback-01.json`.
  Descriptor SHA `78447f0ed2eafd5669c855e32c4acd899d31615f964c4911d8169cb0f8e6d0d7`;
  original3events byte-identical, event4 — terminal disposition.
  Direct-main child evidence: `installed-read-1793198169221/`,
  `startup-fault-owner-before-close.json`, `startup-fault-after-close.json`.
  Это actual CLI startup finding; scoped offline PASS не выдаётся за native PASS.
- Окончательный freeze после P2: `result-manifest-final-04.json` в том же
  disposition evidence-каталоге, SHA
  `c51fa0dfc47551beb76ac934d498b7f91aa71e3dc244f188ed0f2cabefb1997d`.
  Все 8 актуальных checks дали 96 PASS; boundaries21, syntax delta4 и diff PASS.
  Root `root-build-verification-02.json`: 25 source hashes и 8 dependency keys
  совпали; deterministic package60 `9d43c624a77850b552d75f4bcb583ddc809848ca48c8dd9820b6f11efa3debd4`,
  operator66 `fdae16feef25a6bba0a24bc5e275f03e12018f3a498d9d748941ac5d992677d2`.
  Source ACCEPT условен до actual inspect/CAS и exact parent IPC approval.
- B–D freeze: `snapshots/core4-live-proof/VII-native-read-disposition-20261028/`;
  manifest `result-manifest-final-03.json`, SHA-256
  `b9f5f996419f390e772b228c6de0dc6e4eee409084a5c456cc22df67d5a6dacd`.
  PASS отдельных финальных reruns связан с актуальными dependency evidence keys;
  общий ранний run с fixture failures не объявляется exit0. Это scoped evidence,
  без full-release сертификации и без actual native proof.
- Root build/read-back исходников: `VII-native-read-recovery-20261028/` →
  `root-build-verification-01.json`. Все 25 source SHA совпали; package60 и
  operator66 совпали с freeze; Node v24.15.0/hash прежний. Actual install/live0.
- Root supervisor: source SHA `87a546e90ffdbdf9271cf2943f58104cee91c4fccf25c4d9b2d31c4608c6b474`,
  независимый source ACCEPT, 8 synthetic PASS, включая настоящий Node fork/IPC,
  ограничение времени и объёма вывода. Approval только одноразовым parent IPC;
  JSON evidence не заменяет разрешение. Production collector A f3 неизменён.
