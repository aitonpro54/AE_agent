# Installed checkpoint B1/B2 — 2 ноября

Работа продолжена в текущем чате `01a19c6c-1e7d-7751-93cc-cb38dadb85ab`;
новый чат/проект не создавался. Root единственный AE/CEP controller.

## Дополнение 3 ноября

**Актуально: UNKNOWN reset завершён агентом; остаётся configured proof.**
Пользователь поручил самостоятельно выполнять кнопки/служебные перезапуски без
ручной передачи действий. Существующий authenticated panel-role protocol
использован один раз: reset `69facd01-2b95-4983-a110-4209acabda31`, new session
`8fe8b332-5f6f-47fe-8da3-1dc21a5062d0`. Это API invocation, не native button click.
Driver31404/birth639292824531053940 дождался exact old AE9472 и historical26308
death; before-death controllerAvailablefalse. Root штатно закрыл собственный
saved AEP/AE, native old Node19452/30888 и AE9472/26308 gone. NewAE21960/
birth639292825912075250 открыл тот же AEP8299fd9f…; restartAE1/mutation0.
UNKNOWN14events/SHA638fbd1b… archived exact, terminal inspect-facaa741… остаётся
неизвестным. Earlier52event archive/e095765c… также exact. New receiver-store-
34940d50…/3events/SHAaf9672be… содержит только origin и fresh baseline
inspect-e3e17158…. Missing/null ack denied; explicit current ack/native read/
release PASS, baselineRequiredfalse, pending/UNKNOWN/fault0. Signed records,
origins/adoption/ledger, descriptor/client/config и AEP verified unchanged.
[Evidence](../docs/evidence/core-base-b3-unknown-reset-20261103.json).
Delivery/late callback transmission не наблюдались; mutation recovery не доказан.

Configured MCP остаётся отдельным пробелом: old thin client5264/package2fb/
parent app-server23604 не перечитал пакет. Project MCP row в global settings
disabled; `/mcp` даёт status, без reload. Byte-preserving config mtime notification
не обновила client. Exact held-handle client5264 завершён один раз; автоматического
нового client не появилось, configured теперь Transport closed. Это не Core owner
fault: owner31404/current3events/AEP целы. Не повторять restart5264, install или
settled reset9b128005/69facd01. Следующий шаг — подготовленный scoped background
app-server restart с возвратом в runtime-confirmed текущий chat01a19c6c…;
перед actual stop фиксируется этот milestone. Другим чатам сообщения не отправлять,
новый чат не создавать, пользователя к кнопкам не привлекать. После restart первым
configured status подтвердить327faaac/current session8fe8b332, затем stale previous
sessionaeddb9ee refusal и fresh acquire/connect/contract/read/release.

Ниже — предыдущие snapshots и provenance, не новый preflight.

**Native B3 idle PASS; UNKNOWN reset ожидает действия панели.** Idle reset
`9b128005-8e75-43a0-80ff-f800326c83c6` отправлен пользователем один раз и
завершён; session `aeddb9ee-cac3-4df3-8a25-279896812fe0`. Old15584 exact gone,
new30888/birth639292802617851780/bootceee2c7a… ready. SameAE9472/birth
639292254253597850, restart0, AEP8299fd9f… unchanged. Archived receiver52events
побайтно exact/e095765c…; missing ack → owner_work_session_required,
old/null ack → owner_work_session_changed. Explicit acquire/native direct read
inspect-8a3dae1e…/release PASS; new receiver-store-b9c7f3c2…/3events
(origin/begin/complete), baselineRequiredtrue→false.
[Evidence](../docs/evidence/core-base-b3-idle-reset-20261103.json).

UNKNOWN scenario: alert/$.sleep/busyloop не задержали CEP reads; они завершены
без fault/mutation, как и два безуспешных подготовительных watcher runs.
Единственная actual fault: held native Node30888 с fresh CIM scope и pinned
image остановлен при новом journal begin. Native result TerminateProcess=true,
wait0, old PID/birth gone. Client10312 → ipc_outcome_uncertain, command
`inspect-facaa741-2174-43a2-b6a5-73e7a680dff9` НЕ повторялся.14events/SHA
638fbd1bbb97a142541f1d98915f40a758bd4453f3b22b75d6a9252acdf8fe67,
13event prefix exact, last begin без terminal. Delivery в AE не наблюдалась.
Standard client26960 прочитал recovered diagnostic owner19452/birth
639292813727819050/bootd3f60d93…: unresolved1, physical unknown/storeClosedtrue,
execution queue not reopened; old sessionaeddb9ee… сохраняется как logical data.
AE9472/AEP unchanged. [Fault evidence](../docs/evidence/core-base-b3-unknown-fault-20261103.json).
Запрошено отдельное новое нажатие «Начать заново» в панели с подтверждением.
Не повторять idle reset или inspect-facaa741; после действия сначала status и
original intent, затем required exact AE death/архив/new session/baseline.

Ниже — исходный checkpoint установки до native reset.

**B3c — установлен и enabled; native reset остаётся открытым.** Source commit `0cddee2`;
official candidate327faaac97f8…/distribution4975c36a1a53… verified/dry-run.
Fresh configured/preflight same24160/9472, receiver50/SHA94f31e18… и protected
bindings unchanged. Собственная CEP закрыта через UI1раз, AE/AEP не закрывались.
Новый stop `49b423d9-7763-433b-808d-0048264ba491` штатно принят/drained и
stopped-certifiable (proof22702f8c…). Owner-update вызван ОДИН раз. Wrapper
spawnSync timeout90000 прервал helper, exit outcome unknown; повтор apply не было.
Найден original update `af65ee78-03e7-4c19-8a6b-3783e19879d1` (intent+lease),
intent SHA2e568c2f8365744def483a78456275dbc2b4fab6a8d7ea54e8359d35b1d4460b.
Decoded old/new descriptor pins и stopId совпали; signature/native/phase proof
проверил official owner-pre-ready-inspect. Original pre-ready finish успешно
завершил update-stopped; update-inspect → explicit update-enable PASS, enabledtrue,
sameDescriptortrue. Новый80runtime/CEP exact byte verification PASS. Не повторять
49b/af65 и не чистить markers. Wrapper budget теперь15мин; production deadlines
не менялись. Package327faaac97f8…/distribution4975c36a1a53… установлен.
Descriptor SHA851d69d1…, client8c8080f7…, config656c0cef…; origins00d9c5d0…/
adoption666c79a6…/absent ledger/AEP8299fd9f… сохранены.

Первый real standard client1576 загрузил new package с первого запроса11.960с,
owner15584/birth639292661152752430/boot16749b0f-6511-4ff1-85ce-11bcf79da644
ready; один native listener3457. Собственная CEP открыта1раз и автоматически
connected. Standard client14224: acquire1/connect/contract/direct project read
saved empty AEP9472 PASS; command inspect-2b2e4818-2dba-4b2b-9f6f-bccfa040204c,
lease released, authority/continuityfalse. Receiver52settled/SHA
e095765c99b7a14db64170609e1ccbd6b5c1ba422da20c18137c21bbe3820437,
prefix50 exact. Native idle-before snapshot записан; old receiver identity
receiver-store-65535962-c7bb-4dcb-b614-1d91d9277ce4, new workSession пока legacy.
AE9472/birth639292254253597850 прежний, saved own AEP unchanged, mutation/restart0.

Actual B3 reset пока0. Computer-use дважды отклонил клик до input: point over
CEPHtmlEngine.exe/Chrome Legacy Window вместо AfterFX parent. Свежий inventory
не предоставляет отдельное CEP окно; keyboard Tab оставил document focus.
Запрошено ручное нажатие пользователем «Начать заново» с подтверждением.
После него status only до установления исхода, не повторять reset request.
Configured MCP после установки даёт owner_unavailable (old2fb client); нужен
Restart MCP для fresh configured proof, а не повтор установки.
[B3c evidence/матрица](../docs/core-base-b3c-installed-20261103.md).

B3b3 production composition source принят: 42checks/41batches/721unique cases (212fresh/509exact reuse),
boundaries55. [Evidence](../docs/evidence/core-base-b3b3-20261103.json).
Package327faaac…/distribution4975c36a… (80/98files) собран/verified, dry-run PASS.
Это исходный pre-install checkpoint; актуальное installed состояние описано выше.
Fresh configured preflight: same owner24160/birth639292395293906370, AE9472/
birth639292254253597850; два новых reads (empty unsaved, затем saved test AEP).
Receiver50settled/SHA94f31e18…/prefix46 exact, protected/bindings unchanged.
Own AEP snapshots/core-base-b3-native-20261103.aep,8367bytes/SHA8299fd9f….
Далее B3c: fresh preflight → новый штатный stop/update/enable → panel/native
idle и UNKNOWN reset → explicit session acquire/fresh direct project baseline.
Исторические settled IDs не повторять.

B3b2 session ack/private successful project baseline source принят360fresh cases/
18checks, boundaries51; [evidence](../docs/evidence/core-base-b3b2-session-20261103.json).
Новая библиотека ещё не packaged/wired. Далее B3b3 startup/panel/observer; actual
installed package2fb5aebe прежний, reset/install0.

B3b1 physical switch/callback isolation source принят264fresh cases/10checks,
boundaries50; [evidence](../docs/evidence/core-base-b3b1-channel-20261103.json).
Далее B3b2 session ack/baseline; production composition и installed reset ещё нет.

B3a4 private lease/archive/finisher source принят140fresh selected cases/
7checks, boundaries50; [evidence](../docs/evidence/core-base-b3a4-20261103.json).
Installed package2fb5aebe прежний, actual reset/install0. Продолжать B3b:
production startup/physical fence/session acknowledgement/baseline/panel.

Первый configured status после≥3460.720с idle прошёл без retry: тот же owner24160/
bootc9a04982…, peer connected, controller idle, pending/UNKNOWN/fault0. Один
реальный listener3457/owner24160; history46events и protected bindings unchanged.
Нового AE project read не было.
[Evidence](../docs/evidence/core-base-configured-idle-20261103.json).

## Завершено

- B1 source commit `264522c`: exact terminal read rejection через owner/IPC/MCP.
- B2 source commit `2d08c71`: фоновое ожидание Core после первого окна50с.
- [Матрица и evidence](../docs/core-base-validation-20261102.md): source/temp и
  real standard thin-client → CEP → native AE read/rejection/reconnect PASS.
- Новый official manual/owner package `2fb5aebe…`, distribution `d8d77c38…`,
 70runtime/87bundle files, output `dist/core4/4.0.0-base-b1-b2-2fb5aebe3780`.
  Dry-run и exact verification прошли. Old packagebe9afe99 заменён штатно.
- Новый stop `fdfd33e5-1d57-436d-a5fb-dd2a6e17a3bd`, update
  `1515c112-9b17-4f76-acf8-2b9f36f6d338` и explicit enable завершены.
- Same-descriptor idle cycle stop/resume
  `996bf46b-5940-4051-858a-9c0fb0f0a9c8` завершён. Панель ждала96.622с
  и автоматически подключилась без Connect; после fresh ready чтение PASS.

Settled IDs выше не повторять; markers/journals не чистить. Current package,
не прерванный update, теперь является исходной установленной версией.

## Последний наблюдавшийся runtime

Owner19892/boot`3c61188f-0bf8-442c-bf1e-eda2b66af1f4`, один listener3457,
peerpanel-9c5b8cd6… connected. Последний real client19316 exit0; controller lease
освобождён, pending/UNKNOWN/fault0. Старые owners33380/12696 отсутствуют.
AE9472 запущен в этом блоке; пустой несохранённый проект,26.3x87. Открыта только
собственная CEP, пользовательские AEP не тронуты. Current receiver44events,
SHA94f88c2e…; prefix36/a3996201… точный. Origins/adoption/ledger unchanged.

Descriptor SHA17f5fb74…, client834eb4f2…, configf439f8f4…; полный evidence —
`docs/evidence/core-base-installed-20261102.json`. Старый host adoption26308
не становится authority для AE9472. Mutation/save/re-adoption не выполнялись.

## Что требуется для продолжения

1. **Configured proof завершён после restart:** первый core_status успешно
   загрузил package2fb5aebe, новый owner24160/birth639292395293906370,
   process bootc9a04982… ready; old19892 absent, причина выхода не наблюдалась.
   Один listener3457. CEP автоматически подключилась; acquire1 → core_connect →
   module contract → fresh empty project-inspection → release PASS.
   pending/UNKNOWN/fault0; AE9472 прежний, save/mutation/restart0.
   History46events/SHA84bf3f34… с точными prefix44/36. Bindings, origins, adoption
   и ledger unchanged. [Evidence](../docs/evidence/core-base-configured-20261102.json).
   Не повторять install, stop/update/enable.
2. **Argon получен:**2ноября21:19 чтение исходного B3 review восстановилось,
   https://gemini.google.com/app/9ff4479f1258260b. Уже были выбраны обычный «Чат»,
   Argon/Высокий. Raw41896bytes/SHA35c4e7ce…, verdict revise. Шесть findings
   локально разобраны в review decisions/triage.json; новый upload/send0.
   Прежний Debugger unattached сохранён как история. Повтор review не нужен.
3. B3a1 history/process inspection source принят118selectedPASS/46boundaries;
   B3a2 durable intent/inspection —106selectedPASS/47boundaries;
   B3a3 process/endpoint barrier —118selectedPASS/48boundaries; B3a4 private
   lease/archive/finisher —140selectedPASS/50boundaries. Production integration
   ещё нет. Продолжить B3b по
   локально уточнённому
   [контракту](../docs/core-base-b3-20261102.md) и активному плану.
   Installed B3/reset пока0. Общая готовность базы, recovery mutation/full release и
   portability не объявлены PASS.

Это история evidence, а не текущий preflight или перенос runtime authority.
