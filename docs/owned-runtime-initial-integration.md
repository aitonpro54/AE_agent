# Initial OWNED: проверенные интеграционные границы MSI

13 октября 2026. Это evidence/план дальнейшей интеграции, не production admission.
Основной [контракт](owned-runtime-initial-contract.md) остаётся isolated offline model.

## Проверка genuine issuer

Bounded read-only исследование выполнил `ae_architect` (configured Sol 6.1/XHigh;
effective runtime model metadata не получена). Credentials/tokens не читались,
host/app-server, daemon, AE/CEP/AME jobs не запускались.

- `mcp-server/mcp-adapter.js:59`: общий token и фиксированный marker;
  initialize (176) не сохраняет principal, tools/call (199) не получает trusted context,
  forwarding (153) содержит только name/arguments.
- `mcp-server/bridge-daemon.js:9050`: token/marker и panel autonomy authority,
  без удостоверенного chat principal, per-call binding и revocation epoch.
- `mcp-server/owned-runtime-authority.js:29`: explicit_user_chat/reference — shape check.
  Private file identity не удостоверяет issuer.
- `owned-runtime-initial-model.js` определяет private readCaller с callRef, phase,
  requestHash, expectedPrincipalHash; synchronous fixture port не является host verifier.
- `owned-runtime-service.js:35/47` и `bridge-daemon.js:13106`: общий execution boolean,
  admission-dependent shutdown readiness и retained/cutover wiring. Initial reads и
  independent lifecycle потребуют отдельных проверенных точек интеграции.

Проверены установленный Desktop `OpenAI.Codex 26.1007.2314.0` и SDK
`@openai/codex-sdk 0.131.0` sibling orchestrator. Просмотренные SDK interfaces описывают
MCP events и codex exec, но не предоставляют issuer/verifier для нашего ingress.

В read-only `app.asar/.vite/build/main-BklS_2Y2.js` обработчик attestation/generate
(строка 8, offsets 62983–66200) не связывает params/challenge/chat/request digest;
Windows branch формирует error/app-signals wrapper, DeviceCheck вызывается только
Darwin/arm64. Signals (строка 494, offset 759699) — locale/timezone/display/appSessionId.
Внутренний dynamic-app-tool тракт знает host/thread/turn/call identities, но доступный
registration/verifier port для стороннего stdio MCP в исследованном коде не найден.
Внутренние поля/UUID нельзя импортировать как authority.

[Официальный App Server API](https://learn.chatgpt.com/docs/app-server) описывает
requestAttestation как upstream opaque token и clientInfo как identity интеграции.
[MCP authentication](https://developers.openai.com/plugins/build/auth) описывает проверку
issuer/audience/expiry/scopes account credentials; это само по себе не exact chat binding.
Ни просмотренные interfaces, ни эти страницы не установили необходимый verifier.
Вывод ограничен исследованными версиями и трактом, а не всеми возможными host API.

**Внешний пробел:** доступный trusted host issuer/verifier, audience AE Agent, immutable
chat/controller/per-call binding, expiry/revocation на ingress/enqueue/dispatch.
Без него initial launch/read admission закрыты. UUID/env/clientInfo/private JSON,
подпись locally supplied identity или exclusive session не заменяют требуемую гарантию.

### Дополнительная Ultra-проверка host interfaces — 13 октября

Installed `app.asar` SHA256
`c5fdef328cfa2ad9095786f9c3a7aaa447e68834d31299d6ef2592da02029038`.
В том же `main-BklS_2Y2.js` проверен `dynamic-app-tools-native-pipe`:
`cp()` offset304850 на non-Darwin возвращает authorized:true; startup offset3795233
использует этот default. Schema offset307359 принимает callerSource/hostId/threadId/
turnId/callId из params. Это не удостоверение внешнего вызывающего чата.
`Vae()` подписывает browser/access и taskProject/taskWorkspace responses, но не
tools/call. Downstream offset727078 проверяет conversation ownership/follower/dedup,
затем создаёт origin:native request из входящих params. Runtime-доступность pipe
и эксплуатация не проверялись; из этих source reads нельзя получить issuer GO.

[Codex hooks](https://learn.chatgpt.com/docs/hooks) передают session/turn/tool-call
данные, но исследованный MCP callback использует templated arguments и не закрывает
операцию при callback error. Private origin verifier/revocation port не установлен.
App Server dynamicTools — возможная будущая host-side точка, но собственный App Server
создал бы другую controller boundary. Нужен поставляемый host интерфейс для текущего
Desktop: authenticated bootstrap, host pending-call ledger и phase proofs с exact
digest/audience/controller/expiry/revocation на ingress/enqueue/dispatch.
Это предлагаемый контракт, не обнаруженное API; локальный signer/stub его не создаёт.

### Ограниченная проверка Windows device-map — 13 октября

После содержательных XHigh/Ultra NO-GO `ae_escalation` предложил проверить
точные локальные бинарники и соответствующие Microsoft PDB без вызова setter.
`ae_implementer` подготовил ignored DIA reader v3; независимый `ae_reviewer`
дал source-only GO. Parent собрал C++17 `/W4 /WX` и прочитал PDB: build/reader exit0,
GUID/age обоих PDB совпали, emittedSymbols=79/13 (70/13 symbol records плюс
9/0 успешных RVA lookup results), 14/0 RVA lookup attempts,
188 JSONL records, stderr0, capped0/budgetReached=false/queryError=false.
Source SHA256 `dc2e194e19d12b458e388b1359e00ad4b0af9498692ed3209548bed72bc3ef53`;
exe SHA256 `a49c2d66f111e968d7737133a3baf1db2c93d6a60f16a2f1e280cc02e90ddd8f`.
Ignored receipt: `.codex-runtime/windows-device-map-20261013-offline/proof-v3.json`.

On-disk `ntoskrnl.exe` 10.0.26100.9457 SHA256
`d90c69cfa925d42037ef1cdba3ff5b3f13cc14e16060938073b97e396fdde2f2`:
class23 branch читает HANDLE при length8. Это закрывает ABI-вопрос только для
исследованного образа; disk identity не удостоверяет загруженный kernel.
`ObpLookupObjectName` содержит отдельный файловый DriveObject cache и fallback
в GlobalDeviceMap. Успешный named QueryDosDeviceW по private directory сам по себе
не доказывает private resolution файлового пути. Link-before-binding схема
остаётся NO-GO. В self-binding-before-link варианте готовый
`ObpCreateSymbolicLinkName` берёт map из parentDirectory+0x130 (74E59B–74E5A5)
и обновляет её DriveObject[index] через ObFastReplaceObject (74E693–74E6C0).
В просмотренной ветке раскрытия промежуточного symbolic link сбрасывается
bit0x20 (74E555), выбор на 74E63F сохраняет исходный link.
`ObpParseSymbolicLinkEx` копирует target-prefix и remaining suffix
(84B514–84B561). Это подтверждает cache writer и копирование в данной parse-ветке;
end-to-end private-path и successful creator ACK ещё не приняты.
Конечный NO-GO данного bounded прохода: вызов ObInsertObjectEx на A3B7F9
не прослежен до name-hook до возврата handle; допустимость NULL ObjectName
в generic directory creator не установлена. Новые namespace/setter операции
не разрешаются по частичному source evidence.
PDB v3 установил `ObpCreateDirectoryObject` RVA A5DA40,
`ObCreateSymbolicLink` A3B668, `IoFileObjectType` FC6B20 и
`ObpCreateSymbolicLinkName` 74E350. Call sites `ObClearProcessDeviceMap`
7838E1/8943A3 находятся в `PspAssignPrimaryToken`/`PspProcessDelete`;
очистка при удалении process object не равна очистке в момент signaled exit.
Первый call относится к успешной смене primary token, а не к выходу;
будущий bounded child не должен менять token. Второй call при удалении
процесса требует закрытия всех принадлежащих parent process/thread HANDLE
после exact exit read-back; отсутствие чужих/дублированных handles отдельно.
Nearest symbol, PDB hot-span length и успешная компиляция не дают native admission.
Privileged API, DOS alias, AE/AME и production wiring в этом блоке не выполнялись.

**Следующий ограниченный проход V4:** в том же source-only reader добавлены только
точные имена ObCreateObjectEx/ObInsertObjectEx; independent source GO, parent
C++17/W4/WX build и reader exit0. Независимый read-back подтвердил 199 JSONL records,
emittedSymbols=82/13 (73/13 symbol records плюс 9/0 RVA results), identity=true для
двух PDB, attempts14/0, caps0/queryError=false/stderr0. Source SHA256
`e54eafb48ff43029bde3d5707364002ddde70796e10b01cf8d86a3a54a6e3f4f`;
exe SHA256 `f3f77db8189a37120e47434e7741d5ff88653dff65f9eef3a98e723d772e8fe0`;
ignored receipt `proof-v4.json` в том же runtime-каталоге.
Exact PDB spans ObCreateObjectEx RVA8B7900/length1857 и ObInsertObjectEx
87DA20/length2300 просмотрены `ae_specialist`; technical NO-GO сохраняется.
Первый передаёт OBJECT_ATTRIBUTES в ObpCaptureObjectCreateInformation (8B79DE),
затем captured name в ObpAllocateObject (8B7A48): NULL-name acceptance остаётся
за этими телами. Named insertion второго вызывает ObpCreateHandle (87DE63),
но цепь к name-hook/cache write до HANDLE ACK не показана. Эти конкретные
missing edges заменяют прежний более широкий пробел; дальнейшие тела и native
setter не исследовались автоматически. Это не полный Windows API контракт.

**Ограниченный проход V5:** добавлены только fixed exact-name запросы
ObpCaptureObjectCreateInformation, ObpAllocateObject и ObpCreateHandle.
`ae_implementer` — writer ignored reader, `ae_reviewer` — source/result review,
`ae_specialist` — read-only dataflow; parent — sole build/proof/Git controller.
Independent source GO; C++17/W4/WX build и reader exit0; независимый read-back:
214 records, emittedSymbols=85/13 (76/13 symbol records плюс 9/0 RVA results),
attempts14/0, две identity=true, caps0/queryError=false/stderr0.
Source SHA256 `68ddb8cdd57878818e45fec9f1ef709b8e24f5d565659711a1b7d4a30ec97eb9`;
exe SHA256 `ec7afa1cacef4b91cfc57675ad860ed011e98745b2a05412276e6a2d4d5ff355`;
ignored receipt `proof-v5.json` в прежнем runtime-каталоге.

V5 закрывает два прежних source-пробела:

- Capture обнуляет captured name (8B8073), ObjectName=NULL/RootDirectory=NULL
  ведут к status0 (8B8200–8248). Allocation при captured Length=0 выбирает
  отсутствие NameInfo (8B67E7–67F2) и возвращает новый object header/status0
  (8B6A32–6A3D). Показанная unnamed insertion не использует named path.
  Это source acceptance корректного NULL-name вызова с обычными возможными
  allocation/access failures; отдельный anonymous probe для этого вопроса не нужен.
- Для исходного symbolic link после успешной named insertion прямой вызов
  ObpCreateSymbolicLinkName (87540B) предшествует заполнению handle-table entry
  (874770–477C) и output HANDLE (8748F4) в показанном control flow.

**Оставшийся technical NO-GO ограничен одним insertion edge:**
ObpInsertOrLocateNamedObject (call87532D). Сравнение returnedObject с original
(875340–5343) не удостоверяет привязку NameInfo к удерживаемому private directory
и состояние link flags/bit0x20 при входе в hook. Эти данные нужны для полного
cache-before-ACK вывода; новый helper body автоматически не исследовался.
Общий native proof, матрица77/0/3 и genuine issuer/admission не закрыты.

Официальный [API directory object](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/wdm/nf-wdm-zwcreatedirectoryobject)
подтверждает user-mode имя NtCreateDirectoryObject и закрытие HANDLE;
[OBJECT_ATTRIBUTES](https://learn.microsoft.com/en-us/windows/win32/api/ntdef/ns-ntdef-_object_attributes)
не содержит самостоятельной гарантии NULL-name acceptance. Описанный вывод V5
получен из конкретного on-disk PE dataflow, не расширен до универсального API обещания.
При повторном read-only MCP status: owned_registration_absent/owned=false/replay=false;
trusted host issuer/verifier по-прежнему отсутствует. Его предоставляет host,
а изменения repository не создают удостоверенную identity текущего Desktop chat.

## Следующий независимый prerequisite после GO M1–M8

Native Windows physical-root identity и held exclusive fence, без wiring в daemon:

1. Private factory задаёт root; public AE tools не принимают root/identity/handle.
2. Native reader удерживает directory HANDLE и получает canonical path + volume/file ID;
   reparse/неподдержанная identity отклоняются.
3. Exclusive kernel HANDLE фиксированного lock-file связан с physical root;
   без живого handle операции отвергаются, после reacquire старое право не используется.
4. Cross-process exclusivity, допустимый spelling alias, wrong-root и reparse refusal,
   owner exit/release проверяются на собственных temporary roots реальными Windows APIs.
5. Persistent epochs/CAS/consumption, полное namespace inventory и exact first-daemon
   held-target lifecycle остаются отдельными следующими этапами. Partial fence proof
   не представляется полным production readScope/readFence port.

Отдельный helper предпочтительнее изменения retained launcher/pins. Existing Win32
patterns в `native/ame-snapshot-service/service_win32.cpp` служат только reference.
Test helper processes не являются daemon/native AE fixtures/owned AME jobs; user assets,
transfer package, retained state и настройки не затрагиваются. Runtime outputs ignored.

## Export scope и текущие наблюдения

Пользователь уточнил export: DXV, alpha, High; requested preset — DXV3 High Quality с alpha.
Локальный saved titr_all.aep имеет переданный
SHA-256 e55edfd680a6f4bad222389ffcf5b6d08a18ff4afd2a15a27f944bdcf8856754.
CognacC.ttf найден в user Fonts; это не доказательство actual AE font binding.
User EPR DXV3_titles_NQ и FHD_HQ_alfa_nosound имеют DXVTYPE 1/3 соответственно,
1920×1080, video=true/audio=false. Enum quality/alpha ещё не удостоверены через AME.
13 октября parent при двух занятых helper slots проверил official
[Resolume rendering guide](https://resolume.com/support/en/rendering-to-dxv): для AME
Format DXV3, Compression выбирает quality и alpha отдельно. Это подтверждает смысл
user request, но не mapping DXVTYPE enum или фактические настройки конкретного AME export.
Пользователь уточнил состав deliverables: одна композиция, её варианты рендерятся
последовательно включаемыми текстовыми слоями. Точные composition/layer identities,
содержимое и mapping вариантов на два исходных deliverables требуют фактического AE read-back.
Actual project/media/queue и полученные видео не проверены.
После принятия соответствующих контрактов и текущих AE gates предполагаемый live flow:
прочитать target и исходное enabled state; для каждого варианта сверить состояние и
сделать read-back; последовательно рендерить идентифицированные состояния в разные
outputs; проверить фактические media-файлы и восстановление исходного состояния через
read-back. Снимок очереди не считается фиксацией состояния композиции.
Bounded `ae_scout` filesystem inventory подтвердил `DXV3MediaCoreExport.prm` и
import/AEX modules в `C:\Program Files\Adobe\Common\Plug-ins\7.0\MediaCore\Resolume DXV`.
Export PRM version metadata отсутствует; AEX version 1,0,0,1. File hashes сохранены
ignored `dxv-module-evidence.json` рядом с preset evidence. Adjacent ffmpeg.manifest
не задаёт DXVTYPE mapping. Plugin loading и actual AME export settings не проверялись.

## Validation

Это read-only source/file evidence, без production/live acceptance. MCP текущего чата:
owned_registration_absent, owned=false, replayAllowed=false; только local owned/usage
tools. Search solutions/project reads недоступны. Наличие AE/AME процессов не project proof.
Параметры/hashes EPR сохранены ignored в
`.codex-runtime/initial-owned-longrun-20261013/preset-file-evidence.json`.
