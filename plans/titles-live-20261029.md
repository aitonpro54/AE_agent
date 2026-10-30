# Titles T2: живая проверка на тестовой копии

**Уточнение 30 октября:** пользователь перенаправил работу на
[устойчивость Core/CEP](core-cep-lifecycle-20261030.md). T2 служит проверочным
сценарием; прежний continuation ниже не исполнять автоматически. Координатор —
чат `01a18cce…`; старому `01a18b19…` передано поручение через UI очередь,
ACK отсутствует. Завершённый maintenance не повторять, UNKNOWN не снимать.

29 октября 2026. Прямое поручение пользователя: проверить Titles вживую на
тестовом проекте через наш MCP и продолжать [план внешних продуктов](external-products-titles-20261029.md).
Root — sole AE/CEP/UI/MCP controller. Исходная реализация Titles — `5b8c010`.

## Scope и цель

Одна замена текста существующего подходящего слоя через внешний compiler и
настроенный `after-effects-core4`, с proposal/dry-run/native confirmation,
checkpoint и original receipt/read-back. Без raw JSX, save, render/AME,
нового public authority API, fake epoch и повторения UNKNOWN.

Исходный fixture AEP:
`snapshots/core4-host-validation/022dad73-ca31-4013-88fe-bf001ae91011/titr_01_ame_product_20261015.aep`,
SHA256 `9d5d15a11fccc24b7ca284b6da866bd46f3626d621c80f83c8c1672791ff996f`.
Копия с теми же bytes открыта как
`snapshots/titles-product/20261029/live/Titles-T2-test.aep`.
Рабочие AEP не открываются/не сохраняются; disk copy исходника сохраняется.

## Progress

- [x] Configured Core33164/manual3f92: peer connected, store open,
  pending=null/unresolved=[], ownership/ledger faults отсутствуют.
- [x] Test-copy hash подтверждён. UI open и configured project-inspection:
  saved project,465items; точная цель comp218 `Text_1_1`, layer219 `PAPER TITLES`.
  Discovery ограничен50comps; targeted comp observation содержит один text layer.
- [x] Подготовлены private root service observation, host witness и retained-handle
  stop script. Ничего не остановлено; текущая история16events semantically settled.
- [x] Stopped maintenance завершён: Core33164 остановлен через retained handle,
  exact3markers архивированы под standard lease, provider.adopt привязал AE9672
  и точный test-copy. Outcome readopted, journal/project/installation unchanged,
  grants/epoch/native dispatch0; gates released. Configured runtime ещё возобновить.
- [x] В текущем чате configured MCP восстановлен, выявлен orphan receiver-marker
  после общего restart; отдельное stopped обслуживание Core20436 завершено:
  ровно два markers архивированы,16events/adoption/AEP/installation unchanged.
  Возобновление после этого обслуживания — ближайший шаг.
- [ ] Fresh Titles inspection → compiler → build/proposal → dry-run/run.
- [ ] Original completion, style/text read-back, визуальная проверка и final status.
- [ ] Итоговый milestone и продолжение C1.

## Decision Log

- Открытие тестовой копии предупредило о недоступном ReservoirGrunge. AE использует
  подстановку шрифта; сохранение/установка шрифтов не выполнялись. Приёмка касается
  setter и сохранения наблюдаемого оформления, не точного воспроизведения шаблона.
- Resource provider хранит adoption старого AE31452; текущий AE9672 после ранее
  разрешённого restart. Она не даёт authority текущему процессу, запись с такой
  привязкой не запускается. Стандартный private bootstrap требует stopped runtime
  и создаёт adoption только absent-only. Нужен отдельный stopped maintenance:
  settled history, exact stopped owner/CAS, архив старой adoption под тем же lease,
  затем штатный provider.adopt с fresh native probe и pinned witness.
- Helper не выдаёт mutationGrant/lifecycleEpoch, не запускает Core/AE и не меняет
  installation/credentials/journal. После начала intent uncertainty удерживает
  gates/no-replay. Native confirmation выбранной цели остаётся внутри AE.
- C1 standalone closure исправляется параллельно отдельным writer в source/tools
  и TEMP. Этот код не устанавливается и не меняет bytes текущего live runtime.
- Общий restart клиента может завершить installed stdio runtime без очистки
  receiver-marker; повторный startup тогда корректно закрывает полосу. В новом
  чате не запускается второй broker для обхода этого состояния. Для текущего T2
  применено отдельное адресное stopped retirement; универсальное исправление
  lifecycle не объявлено результатом этого maintenance.

## Validation

Ignored evidence: `snapshots/titles-product/20261029/live/`.
`project-open-inspection.json` и `target-discovery.json` — настоящие configured
native reads. `service-observation.json`:16settled events, broker ledger absent,
exact3markers (receiver/broker/old host adoption), protected hashes, fresh host
identity/endpoints. `service-process.json`: Core33164/parent16204, native birth
`2026-10-29T16:42:55.4976744Z`, единственный child conhost29684.

`collect-service.cjs`, `check-before-stop.cjs` и PowerShell stop syntax PASS.
Live mutation пока0. Служебные и C1 offline tests не объявляются живой приёмкой Titles.

19/19 TEMP tests и независимый read-only review ACCEPT для private operator.
Root bound maintenance evidence SHA256
`4a823a7d764261f740ff2834dfb2797f7b01ff1b84c87db5a551ba38d1e32a97`;
итоговый helper SHA256 `be515c7535ac3ad09b240503553fd7aa1878dada5da430444584c61fef0ae653`.
Stop17:51:46UTC; readoption17:52:22UTC. New adoption digest
`65ece94b9fb88cec5a138ec3489b43770661f678b7f34ba2ed262a13e542b48c`.
Unique transaction `stopped-readopt-Titles-T2-20261029-a134de87` completed.
Повтор stop/readoption/install не требуется и не допускается этим continuation.

## Ближайшее продолжение

Продолжение в чате `01a188ce-d1dc-7453-9bcf-45b8a418c02d`: прежний UI
restart уже завершился (app-server13416, managed Core18856 в прежнем чате).
Новый чат29.10 в17:56:59 и17:57:05UTC получил MCP initialize/connection closed.
Root проверил signed receiver history: те же16settled events, broker ledger
отсутствует; install/broker gates отсутствуют. Новый live dispatch0.
Подготовлен ещё один штатный UI restart, только текущий чат active. Codeburn
off/on возвращён к точным исходным bytes global config (SHA256
`93015e22c32dadad28be3dc9223d8e978f6d72e6390a028d0e38fe593f92ce64`).
Первый restart этого чата выполнен18:02UTC: configured tools появились,
Core20436/parent32720 слушает3457, но receiver закрыт orphan-marker прежнего
runtime18856. `core_diagnostics`: pending=null, unresolved=[], controllerBusy=false,
storeFault=false; закрытие полосы не является новым неразрешённым AE-эффектом.
Fresh signed history — те же16settled events, SHA256
`4cfe881718e7255829785e57b604304493b319ba6e68d597074a98454e146f45`.

Адресное обслуживание в `snapshots/titles-product/20261029/reconnect/`:
private адаптация ранее reviewed XX operator, только два owner-marker под
стандартным lease.20/20 TEMP tests PASS до проверки большого protected AEP.
Root остановил20436 через retained handle18:10:42UTC; maintenance evidence SHA256
`9826bd722555dffb4eb3c1aef2a49e2eb2b6f9ef11c41efa4cc9966e556b3374`.
Первый inspect отказал до intent из-за AEP32001325bytes при лимите8MiB;
архивирования/выдачи authority не было. Уточняется только bounded проверка этого
точного AEP; adopted AE9672, installation и journal не изменяются.

Итог:23/23 TEMP tests PASS. Root inspect PASS, затем один run завершился
`retired`18:14:34UTC, receiverArchived=true/brokerArchived=true,
journalUnchanged=true/installationChanged=false/nativeDispatch=0.
Transaction `stopped-owners-titles-reconnect-20261029-7ed91ac5` завершена;
gates освобождены, archive read-back выполнен самим operator. Helper SHA256
`f0da537279f69d7ec54d49540fd90244cc8da7af4f775a4d03886f1fa72682d1`.
Повтор stop/retirement/readoption/install не нужен. Следующий шаг — только
штатное возобновление configured MCP в этом же чате, затем fresh status/CEP
connect/inspection. Не открывать прежний controller chat ради вызова Core.
Подготовлен `live/titles-job.json`: test text `TITLES OK`,comp218/layer219;
compile PASS, build не отправлен. При отправке root явно заменяет описательный
recordContext на technical_check/ephemeral_check, сохраняя target/references.

Возобновить configured MCP штатным UI restart Codex app-server. AE9672 остаётся
открытым с тестовым AEP. Закрывать CEP не нужно: в fresh accessibility tree AE
видна кнопка «Подключить»; после нового Core нажать её по свежему index и проверить
physical.peer.connected. Не заменять configured client отдельным stdio probe.
Другие пользовательские чаты completed/idle/notLoaded по fresh inventory.

Затем fresh contract/inspection `titles-current-target` на target
`{projectId:<absolute live/Titles-T2-test.aep>,compId:218,layerId:219}`.
Подготовить job через `products/titles/cli.js`, технический запуск явно маркировать
technical_check/ephemeral_check. Планируемый test text — `TITLES OK`.
Proposal/dry-run/run и native confirm выполняет root в пределах поручения
пользователя; при unknown без повторной mutation, только original reconciliation.
C1a уже завершён commit `42b8646`; independent capability install/C1b остаётся дальше.

## Продолжение 30 октября 2026: текущий controller

Root controller — чат `01a18b19-bb02-7e02-85bd-7fdce6e38061`.
Свежий inventory: AE был закрыт; startup клиента в 04:37:44UTC автоматически
поднял Core24052/parent27944 для прежнего idle чата `01a188ce…`. App log
подтвердил ready там и два initialize/connection-closed в текущем чате.
Configured tools здесь отсутствовали; отдельный stdio broker не запускался.

Вчерашний `20261029/live/Titles-T2-test.aep` изменён на диске 29.10 в18:59:56UTC:
33557830bytes, SHA256 `c887c0c23ecda9b588b38c96edd1ea979a994e99e04dc12b911a13e22fb92401`.
Изменённая копия сохранена без записи. Для разрешённого T2 создана новая копия
исходного fixture в `snapshots/titles-product/20261030/live/Titles-T2-test.aep`,
32001325bytes, прежний original SHA256 `9d5d15a11fccc24b7ca284b6da866bd46f3626d621c80f83c8c1672791ff996f`.
AE запущен один раз; новый PID6492, точная birth/executable identity — в fresh
host witness. Новая копия открыта через UI. ReservoirGrunge недоступен,
уведомление закрыто; после открытия виден dirty marker. Save не выполнялся;
будущая проверка не заявляет exact typography или save/reopen.

### Progress

- [x] Root заново проверил установленный manual3f92, signed history16settled
  events, отсутствие broker ledger, exact owners/protected files/native process.
- [x] Новый private readopt operator адаптирован к текущим root facts;
  **21/21 TEMP PASS**, syntax и whitespace PASS. Root проверил полный guard diff:
  изменены только exact bindings/schema names/transaction, CAS/lease/provider/
  UNKNOWN/no-replay сохранены. Evidence — `snapshots/titles-product/20261030/recovery/`.
- [x] Core24052 остановлен через retained handle04:49:11UTC. Новый maintenance
  SHA256 `12b4f0b5809dfe2d18efdb59febb16f0bb34518b1dbd54e48f0cfbc7ac4a48eb`;
  once-bound helper SHA256 `05fd20875a03df027cbef1743507c20c1667baf27ab7dc47bd3e59a880166590`.
- [x] Один inspect PASS, один run `readopted`04:49:50UTC. Unique transaction
  `stopped-readopt-Titles-T2-20261030-c47a91e8`: exact receiver/broker/old adoption
  архивированы, новая adoption digest
  `4a453b0f0b04a83bd5248d3a22fbab234150c8232f5f464ba886d6bcafdee30c`.
  journalUnchanged/projectUnchanged=true, installationChanged=false,
  nativeDispatch0, mutationGrant/lifecycleEpoch=false. Completion/gate release
  проверены operator. Нельзя повторять эту или прежние transactions.
- [ ] Возобновить configured MCP штатным restart клиента с текущим чатом,
  проверить свежий status, подключить собственную CEP, получить fresh Titles
  contract/inspection на **новом** exact AEP, затем compiler/build/proposal/
  dry-run/run/native confirmation/original receipt/read-back.

### Decision Log

Общий restart пока не имеет доказанного per-thread selector; после него
проверить, что полосу не занял прежний idle чат. Это адресное восстановление
текущего T2, не универсальное исправление lifecycle. Старую adoption нельзя
объявлять authority нового процесса; новая adoption также не выдаёт grant.
UI automation modal с отдельной screenshot region потребовала CUA; source text
не менялся через UI. Все изменения текста выполняются только через typed MCP.

### Validation и ближайший шаг

Source Core/CEP/products/installer и установленный пакет не изменены.
TEMP21PASS — проверка maintenance, не live Titles proof. Readoption result
`readoption-result-1793335790740-dd993a50-b8ac-4086-a296-52488fbc14a4.json`
сохранён в recovery evidence. Root exact-stop AST/preflight PASS.
Новая копия, старый изменённый AEP, signed journal и installation защищены.
Нативная Titles mutation всё ещё0. Следующий шаг — штатное возобновление
configured MCP текущего чата; stop/readoption/install повторять не нужно.
