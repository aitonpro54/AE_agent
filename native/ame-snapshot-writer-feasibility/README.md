# Offline AppContainer writer feasibility

Один Win32 эксперимент, без AE SDK, AE/AME/CEP, GUI, plugin installation или AEP
writes. Текущий snapshot probe не изменяется. `readiness=false`,
`production=false`, `snapshotWriterReady=false` при любом результате.

`& .\scripts\ame-native-writer-feasibility.ps1` сейчас выполняет **только fresh build
и четыре отрицательные ownership guards**, без валидного AppContainer запуска.
Используются существующие MSVC v143 и Windows SDK10.0.26100.0, два собственных x64
EXE со static `/MT` runtime. Каждый build — новый `run-<nonce>` в ignored
`.codex-runtime/ame-native-prerequisites/native-writer-feasibility/`; новые OutDir/
IntDir, exclusive flushed owner, no replay. Source/generated/binary hashes входят в
receipt; source hashes сверяются до/после. `RunId` допускает лишь nonce basename
в этом фиксированном parent; произвольных root/toolchain flags нет.
Helper не меняет execution policy, не устанавливает toolchain и не запускает модели.

До compile создаётся ownership marker с exact root/nonce. Generated header связывает
native EXE с **полным canonical root**, marker SHA256, точными marker bytes/nonce и
SHA256 собственного child. Header не зависит от своего EXE hash: циклической
связи нет. Marker закрывается для записи и удерживается read handle при build;
final generated header также удерживается read handle. Native не принимает root
или другие CLI arguments. Copied EXE в другом full path, даже с тем же basename,
не проходит admission. Marker открывается read-only/nonreparse, проверяется как
single-link file по canonical handle path, hash и bytes; handle сохраняется.

Следующая операция — `CREATE_NEW execution.attempt.json` (RW, SHARE_READ,
OPEN_REPARSE_POINT, WRITE_THROUGH), затем flush и удержание producer handle до
конца. Только после durable claim разрешён переход к profile/ACL этапу. Коллизия
claim — terminal refusal, без overwrite/attach/replay. Wrong root, missing/changed
marker и existing claim завершаются **stdout-only early refusal** до native file
writes/profile/ACL/private output/SetThreadToken; parent сохраняет stdout отдельно.
Catch не пишет refusal receipt в неподтверждённый root.

Guard helper проверяет copied root, missing marker, changed marker и preexisting
claim, сравнивая все own file hashes и root/child ACL SDDL до/после каждого native
вызова. Изменения marker между случаями выполняет только parent в новом собственном
root, с exact bounded move/read-back; native не проходит успешный admission ни разу.
В конце остаётся flushed parent terminal seal `execution.attempt.json`, дальнейший
валидный запуск запрещён. Этот build не повторяет прежний AccessCheck experiment.

Контракт требует доверенного backend и стабильных root/ancestors. Read handles,
canonical checks и marker binding не доказывают изоляцию от произвольного изменения
metadata/namespace тем же пользователем: `rootMetadataIsolation=UNVERIFIED`.

`CreateAppContainerProfile` создаёт только уникальный `AEAgentProbe<nonce>`.
Already-exists даёт отказ без derive/attach/delete чужого профиля. Для загрузки
добавляется READ/EXECUTE exact package SID только свежему run root и собственному
`TokenHolder.exe`; ancestors, user files и другие ACL не меняются.
Существующие права владельца run root нужны для build/receipts; **candidate private
DACL не получает normal-user write ACE**. Package launch grants не наследуются.

Child запускается через `CreateProcessW` с exact SECURITY_CAPABILITIES, нулём
capabilities, `EXTENDED_STARTUPINFO_PRESENT|CREATE_NO_WINDOW`, `bInheritHandles=FALSE`.
Фиксированный hashed child не принимает args/commands, не пишет files/registry/
network/UI и живёт максимум30сек. Родитель использует только возвращённые handle/
PID/start time; не ищет и не присоединяет другие процессы. Cleanup прекращает только
собственный child по этому handle, ждёт finite exit, закрывает token/process handles,
затем удаляет exact только что созданный профиль. Cleanup HRESULT/error сохраняются.
Ignored receipts и orphan package READ/EXECUTE ACE на собственных artifacts остаются;
recursive delete или изменения существующих objects не выполняются.

Оба process token дублируются в `SecurityImpersonation` без privilege adjustment.
Проверяются AppContainer flag/package SID, user/authentication identity, primary
group, integrity, privileges/groups/restricted SIDs/capabilities до/после duplication.
`AccessCheck` получает именно impersonation tokens и mapped file generic masks;
API BOOL и AccessStatus/granted mask/error учитываются отдельно.

До private directory или `SetThreadToken` создаётся лишь **in-memory** descriptor:
owner=current user, group=его primary group, protected DACL из двух ACE:
OWNER RIGHTS=`READ_CONTROL`, package SID=`FILE_ALL_ACCESS`, OI/CI inheritance.
OWNER RIGHTS ограничивает implicit owner WRITE_DAC. Normal-user/group write не
добавляется. Проверяются directory.add_file, file.write_data/generic_write,
WRITE_DAC, DELETE и READ_CONTROL обоими tokens. Это discretionary feasibility,
не kernel MIC или safe AEP writer proof.

Если normal denied и AppContainer allowed не доказаны, кандидат завершится
`acl_asymmetry_failed`: **без private output directory, impersonation и новых
альтернатив**. Both-denied ожидается из dual-principal intersection; права не
ослабляются ради успеха. Только при доказанной asymmetry выполняется ограниченная
новая private DACL/file create/write/rename проверка и обычные denied insertion/
WRITE_DAC/write opens. Все markers принадлежат этому запуску. Prior thread token
сохраняется и восстанавливается точно; `RevertToSelf` применяется лишь при prior
none. Любая ошибка restore terminal, без fallback/retry, с read-back.

Primary evidence: [Microsoft AppContainer launch/dual-principal model](https://learn.microsoft.com/en-us/windows/win32/secauthz/implementing-an-appcontainer),
[SID/OWNER RIGHTS](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/manage/understand-security-identifiers),
[AccessCheck](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-accesscheck),
[ImpersonateLoggedOnUser requirements](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-impersonateloggedonuser).
SDK headers/system libraries остаются внешними. Negative launch/token/ACL result
является evidence ограничения кандидата, а не поводом для elevation, services,
private NT API, normal-user write ACE или следующего маршрута.

Историческое локальное evidence `run-ae6c99d7aabe41a4a2dadedd608e7421` получено
**предыдущей source version**: profile/child cleanup успешен; AccessCheck запрещает
запись обоим tokens (`acl_asymmetry_failed`), private writes/SetThreadToken не
выполнялись. Его terminal receipt и восемь source hashes сохраняются без изменений.
Новый guard receipt ссылается на этот hash как `priorVersionAclEvidence` и явно
ставит `appliesToCurrentSource=false`; новые guards не являются новым ACL/MIC/AEP
доказательством. Текущий snapshot AEX/source остаётся неизменным с нулём AEP writes.
