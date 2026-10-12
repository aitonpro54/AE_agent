# Initial OWNED: Windows root identity и held fence prerequisite

13 октября 2026. **Specification GO на ограниченную prerequisite implementation.**
Parent сообщил GO исправлений M1–M8 на checkpoint
`d7e8905a5294d7d472f6f2991b1160ac82253aa6`. Implementation/native proof этого helper
дополнительно требуют independent **spec GO**; он получен на revised SHA256
`e118da7cfbb25f59abfe6f471fc29cf304bdfc53059f1368eab55478adb0a6c4`.
Open P1/P2 в bounded spec review нет. Все mandatory native cases пока UNVERIFIED.
Основание: [integration evidence](owned-runtime-initial-integration.md) и
[initial contract](owned-runtime-initial-contract.md). Этот этап проверяет только
physical directory identity и kernel exclusion на собственных temporary roots.

Все результаты: `scope: windows_identity_fence_prerequisite`,
`productionAuthority:false`, `issuerStatus:unavailable`, `admission:false`.
Ни receipt, ни lock-file, ни sessionRef не удостоверяют machine/user/chat и не
реализуют production `readScope/readFence`. Epochs, durable CAS/consumption,
namespace inventory, daemon launch/teardown и AE/AME dispatch остаются отдельными этапами.

## Trust boundary и минимальная поставка

- Core — небольшой `native/owned-runtime-initial-fence/fence_win32.h/.cpp`;
  move-only RAII objects, Windows SDK, без AE SDK и production dependencies.
- `FencePrerequisiteProof.vcxproj` + `fence_proof_main.cpp` — отдельная **test-only**
  console entry point. Release/x64, v143, C++17, `/W4 /WX /utf-8`, isolated outputs.
  Не импортировать service build props: они связаны с другим scope/SDK/issuer pins.
- Parent-run `scripts/owned-runtime-initial-fence-proof.ps1` создаёт/проверяет только
  свой новый `.codex-runtime/initial-owned-fence-prerequisite/<runId>/`:
  `build/`, `roots/`, `evidence/`, test owner record. Existing runId не переиспользуется.
  Build/toolchain/source hashes фиксируются; unavailable compiler/SDK — отказ,
  без установки, fallback или изменения existing native targets.
  Для этой MSI parent подтвердил через installed vswhere MSBuild
  `C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\MSBuild\Current\Bin\MSBuild.exe`;
  existing target SDK — `10.0.26100.0`. Новый driver сверяет actual toolchain;
  старый AppData MSBuild default отсутствует, его не переносить и existing scripts не менять.
- Core принимает root только из private factory через непубличный `RootConfig`.
  Production factory в этом этапе **отсутствует/возвращает unavailable**.
  Test factory допускает argv `--fixture-root <path>` только внутри заранее созданного
  собственного proof run. Owner record — ограничитель теста, не authority.
  Public AE/MCP/HTTP paths не получают selector, pathname, identity или HANDLE.
- Test binary всегда маркирует outputs как prerequisite; нет режима production,
  ENV root override, daemon port, config/credential reader или tool dispatch.
  До старта children driver независимо открывает и удерживает runRoot и каждый
  fixture directory; из этих witnesses записывает в ignored build header exact
  `ExpectedRootPins` для runRoot и approved fixtures: FILE_ID_INFO volumeSerial64
  и FileId128, плюс canonical paths/GUID. Native test factory получает именно
  эти immutable pins; argv выбирает только заранее закреплённый fixture/его
  допустимое spelling. Owner record или текущий pathname не являются источником pins.

Threat model: обычные concurrent controllers, path replacement/rename races,
reparse/hardlink confusion и stale local references. Не обещаем защиту от hostile
same-user процесса, который меняет executable/factory, дублирует handles или заменяет
lock namespace между сессиями. Такой процесс требует другой trust boundary.

## Root acquisition: проверять объекты, а не только spelling

Supported baseline — local NTFS с доступными FileIdInfo, normalized volume-GUID path
и case-sensitivity query. UNC/remote, SUBST-root, device/ADS path, другой filesystem,
неподдержанная query или неоднозначный результат — unavailable; fallback нет.
Допустимы absolute drive path и эквивалентный `\\?\` drive prefix, case/обычный
trailing separator. До traversal отвергать NUL, relative/drive-relative path,
`.`/`..`, дополнительные `:`, пустые внутренние components, trailing dot/space.
Case-sensitive ancestor/root не поддерживается: требуется query и отказ при enabled.

Точный mapping queries, без shape-only проверки или замены unsupported API:

| API / information class | Проверяемое поле |
| --- | --- |
| GetVolumeInformationByHandleW(directory HANDLE) | FilesystemName строго NTFS; DWORD volume serial из этого API не используется как identity |
| GetFileType(HANDLE) | FILE_TYPE_DISK; неизвестный type/error отвергается |
| GetFileInformationByHandleEx / FileAttributeTagInfo | directory/reparse/offline/recall attributes |
| GetFileInformationByHandleEx / FileStandardInfo | Directory, EndOfFile, NumberOfLinks, DeletePending |
| GetFileInformationByHandleEx / FileIdInfo | FILE_ID_INFO: VolumeSerialNumber uint64 и FileId 128-bit |
| GetFileInformationByHandleEx / FileCaseSensitiveInfo | Case-sensitive flag выключен у каждого held directory; query failure — отказ |

1. Открыть **directory volume root**, не raw volume/device, удержать non-inheritable
   HANDLE. Canonical anchor должен быть ровно `\\?\Volume{GUID}\`; subdirectory
   вместо volume root или отсутствие GUID не принимаются.
2. Каждый последующий component открыть **одним именем относительно предыдущего
   held directory HANDLE**: `NtCreateFile`, `RootDirectory=parent`, `FILE_OPEN`,
   `FILE_OPEN_REPARSE_POINT`, `FILE_SYNCHRONOUS_IO_NONALERT`,
   `FILE_READ_ATTRIBUTES | SYNCHRONIZE`, `OBJ_CASE_INSENSITIVE`, без inheritance.
   Type-neutral open с последующей directory check; не предполагать недокументированную
   совместимость `FILE_DIRECTORY_FILE` с другими flags. Недоступный API закрывает операцию.
   Handle-relative имя и `FILE_OPEN` — документированный интерфейс
   [NtCreateFile](https://learn.microsoft.com/en-us/windows/win32/api/winternl/nf-winternl-ntcreatefile).
3. После **каждого** open проверить `FileAttributeTagInfo`: directory=true,
   REPARSE_POINT=false; также отвергнуть offline/recall attributes. Проверяется leaf
   и каждый ancestor, включая volume root. Reparse tag никогда не разрешается
   по allowlist. GetFullPathName/Get-Item и один leaf OPEN_REPARSE_POINT недостаточны.
4. Все ancestor/root HANDLE удерживать до dispose. Directory sharing —
   READ|WRITE, **без SHARE_DELETE**; ничего не создавать/записывать в directories.
   Это не блокирует всякую metadata mutation. Handle-relative single-component
   open устраняет повторное разрешение уже пройденных ancestors; fresh checks
   обнаруживают наблюдаемый drift. Delete/rename требует delete sharing по
   [CreateFile](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew).
5. Получить root `FILE_ID_INFO` и canonical path через
   `GetFinalPathNameByHandleW(FILE_NAME_NORMALIZED | VOLUME_NAME_GUID)`.
   Нулевой/усечённый/слишком длинный результат, unsupported query или смена identity
   при повторной проверке — отказ. GUID и нормализованный path берутся из HANDLE,
   не из caller string; см. [final path API](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getfinalpathnamebyhandlew).
6. При достижении runRoot сравнить actual FILE_ID_INFO с expected runRoot pin;
   у final fixture — с expected fixture pin. Оба сравнения обязательны **до
   положительного Observe и до любого lock open с WRITE_DATA**, включая acquire
   без предыдущего observe. Каждый повторный check также сверяет эти original pins.
   Подмена на обычную valid nonreparse directory — terminal `root_identity_changed`,
   а не повод переиздать pins/rebind. Отсутствие expected pins закрывает factory.

`RootIdentity = {volumeGuid, volumeSerialHex, fileIdHex, canonicalPath}`:
serial — фиксированные 16 lowercase hex, FileId — исходные 16 bytes как 32 hex;
не переводить их в JavaScript Number. Для same physical root сравниваются GUID,
volume serial и FileId, spelling не создаёт отдельного scope.
[FILE_ID_INFO](https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_id_info)
определяет сравнение volume serial + FileId для двух open handles на одном компьютере.
Это identity живого объекта, а не вечная installation lineage: после удаления/restart
не выводить durable uniqueness, отсутствие replay или новое право на launch.

## Fence: существующий фиксированный файл и живой HANDLE

Test driver заранее создаёт пустой `.initial-owned-fence.lock` через CREATE_NEW
в каждом owned fixture root и закрывает provisioning handle. Helper **не создаёт**
отсутствующий файл, не truncates, не удаляет и не чинит foreign/partial файл.
Будущая production provisioning этого namespace не входит в этап.

- Открыть только этот single-component basename относительно held root HANDLE:
  `FILE_OPEN`, `FILE_OPEN_REPARSE_POINT`, synchronous, READ_DATA|WRITE_DATA|
  READ_ATTRIBUTES|SYNCHRONIZE, **ShareAccess=0**. Write access нужен для exclusion;
  helper не выполняет WriteFile. Metadata-only opens могут быть допустимы;
  гарантия относится к конкурирующим controller acquisitions с данным access profile.
  Непосредственно перед open повторить fresh runRoot/fixture validation против
  independently pinned identities; mismatch закрывает child до WRITE_DATA access.
- Проверить lock через HANDLE: disk regular file, reparse=false, directory=false,
  DeletePending=false, length=0, NumberOfLinks=1, тот же volume. Canonical lock path
  должен быть root canonical path + фиксированный basename; root/ancestor witnesses
  вновь проверяются перед publication. FileId lock сохраняется внутри FenceLease.
- Existing sharing conflict — `fence_busy`, без retry, другого имени, удаления
  файла, timed takeover или lockfile-presence heuristic. OS error не маскируется как busy.
- Hardlinked файл отвергается по NumberOfLinks; newly observed hardlink/drift
  инвалидирует lease. Sharing действует на файл, а не отдельное hardlink spelling;
  alias не даёт второй fence. Это документировано в
  [CreateHardLink](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-createhardlinkw).
- После open файл нельзя считать своим по имени. LiveCheck повторяет queries
  удерживаемых ancestor/root/lock handles и сверяет pinned IDs/paths/attributes.
  Отказ query/drift закрывает session; новая acquisition автоматически не выполняется.
  Замена между открытием и проверкой не получает положительного witness.

`RootLease` и `FenceLease` — move-only, nonserializable, принадлежат одному factory
instance. `Observe(root)`, `TryAcquire(root)`, `LiveCheck(root,fence)`, `Release(fence)`,
`Dispose(root)` проверяют связь с **тем же живым объектом**, а не PID/числом HANDLE/
JSON identity. ОС HANDLE не выводится, не наследуется и не передаётся другим процессам.
Release сначала инвалидирует local reference, затем закрывает HANDLE. Reacquire
создаёт другой объект/reference; old reference не оживает даже при повторном использовании
ОС того же числового handle. Это local lifetime, **не persistent fence epoch**.

## Test-only lifetime и error protocol

CLI — один owned child, argv root и factory instance неизменны весь процесс;
test-only `--factory-instance <runId:childOrdinal>` задаётся driver, выбирает только
approved instance slot build header и не является caller/chat identity.
stdin ASCII lines ≤256 bytes,
stdout один UTF-8 JSON result ≤8 KiB на команду, stderr только bounded diagnostics.
Точные команды: `observe`, `acquire`, `check <sessionRef>`, `release <sessionRef>`,
`dispose`. Extra tokens/unknown op/invalid encoding — terminal protocol refusal.
Test-only `crash` допускается лишь отдельным proof mode: immediate ExitProcess,
без RAII cleanup, чтобы проверить kernel release. Нет произвольных commands/paths/PIDs.

Result envelope: schema=`ae-agent.initial-fence-prerequisite.v1`, общие scope tags,
ok, operation, rootIdentity при успешной query; acquisition дополнительно выдаёт
local sessionRef и lockIdentity. sessionRef — correlation ref, не bearer authority:
`factoryInstanceId:acquisitionCounter`, где driver выделяет **неповторяемый** childOrdinal
в этом run и не переиспользует slot после exit/unknown. Counter не wrap/recycle.
Разные children одного run имеют разные refs уже на первой acquisition.
Driver связывает каждый ref с original factoryInstanceId и собственным held process
instance/stdio channel, а не только PID, runId или строкой ref. Child сравнивает
instance prefix и local live lease; cross-child check/release возвращает
`foreign_session_ref` **без закрытия или изменения своей lease**. Observe показывает
fenceState и activeSessionRef, чтобы сверить потерянный acquisition ACK.
Отрицательный result: code, bounded numeric win32Error/ntStatus если применимо,
fenceState; он никогда не содержит held=true/positive witness.

States: ROOT_HELD → FENCE_HELD → ROOT_HELD при release; dispose/EOF/process exit → CLOSED.
Busy оставляет ROOT_HELD; closed/foreign sessionRef отказывается без close нового lease.
Query/protocol/drift failure → CLOSED с best-effort RAII cleanup и process exit nonzero.
Все cleanup paths проверяются; невозможность подтвердить closure означает UNKNOWN,
без положительной availability/admission. stdout failure не разрешает replay acquire:
parent сверяет surviving child через observe или exact child exit. Никаких таймеров,
которые бросают pending native call и затем объявляют handle закрытым.

## Parent proof driver и exact acceptance

Driver — sole writer scratch tree и sole controller собственных test children.
Before effects проверяет canonical allowed parent, отсутствие reparse в ancestors,
new runId, exact owner и scoped fixture paths; строки prefix сами по себе недостаточны.
Root ownership дополнительно сверяет actual helper identity с independently held
driver directory witness; original pins уже переданы factory до child start.
Это тестовая provenance, не production issuer. Driver witnesses открываются
с READ|WRITE|DELETE sharing; в rename/race tests запрет
операции должен обеспечивать проверяемый helper, а не случайный lock самого driver.
Children стартуют hidden с redirected stdio и held process references; не наследуют
root/fence HANDLE. На timeout сверять конкретного child/ACK; не создавать replacement
worker и не убивать процесс по одному PID.
Cleanup **не** выполняется по pathname после закрытия ownership witnesses.
Безопасный default — сохранить ignored scratch tree. Если driver удаляет свои
fixtures, helper exit/closure сначала подтверждаются, а driver identity witnesses
и pinned parent handles удерживаются до конца scoped cleanup. От pinned parent
открывается каждый single-component target с no-follow и DELETE access; его actual
FILE_ID_INFO и attributes сверяются с original cleanup manifest **до** удаления
через этот HANDLE. Entry enumeration должна соответствовать exact owned manifest;
unknown entry, replacement, reparse, outside/непроверенный path оставляются целиком.
Закрытый witness можно заменить только после проверки того же original identity;
новая directory с прежним именем не получает ownership. После закрытия всех witnesses
рекурсивный path-based cleanup запрещён. UNKNOWN сохраняется; cleanup не rebinds,
не пересекает replaced runRoot и не удаляет foreign object ради пустого каталога.
Не перечислять и не чистить чужие runtime roots, user assets или retained namespace.

| Проверка реальными Windows APIs | Обязательный результат |
| --- | --- |
| Root/lock observation | IDs совпадают с independent driver handles; NTFS/canonical GUID доказаны |
| Два children, один root | A acquired; B busy; B получает fence только после verified release A |
| Case/extended-prefix spelling одного root | Same physical identity; вторая acquisition busy, отдельного lock не появляется |
| Два разных owned roots | Разные physical identities, независимое exclusion; foreign lease/ref отказ |
| RunRoot ordinary nonreparse replacement до child open | Original runRoot pin mismatch; terminal отказ до positive Observe/lock WRITE_DATA, без rebind |
| Fixture ordinary nonreparse replacement до child open | Original fixture pin mismatch; terminal отказ до positive Observe/lock WRITE_DATA, без rebind |
| Два children разных roots с первыми leases; cross-child refs в обе стороны | Refs различны; foreign check/release отказываются; обе собственные leases остаются held и проверяются |
| Final и intermediate junction/reparse | Отказ до positive root/fence witness; target outside fixture не открывается для effects |
| Case-sensitive intermediate и отдельно leaf | Отказ до positive witness/lock WRITE_DATA; оба случая обязательны |
| FileCaseSensitiveInfo/query failure | Реальный API error (например, test-only invalidated query HANDLE) закрывает child; fake-only coverage недостаточна |
| Drive-relative, ADS, device, SUBST, dot/dotdot, trailing dot/space | Каждый отдельный input отказ; supported alias не расширяет этот allowlist |
| Pause на component boundary + rename/replacement race | Held ancestor rename/delete отказ; winning pre-open replacement reparse отказ; нет wrong-root witness |
| Lock hardlink, symlink, directory, nonempty/deletion-pending | Отказ; файл не меняется/не чинится; raw API/error фиксируется |
| Попытка создать hardlink после acquisition | Если API допускает link — LiveCheck закрывает lease; READ|WRITE acquisition через link не обходит exclusion |
| Held lock delete/rename/second READ\|WRITE open | Refusal; native handle сохраняется; namespace не заменяется |
| Release → reacquire → old check/release | Новый ref действителен, старый отказ; новый HANDLE не закрывается старой командой |
| EOF, normal exit и test-only abrupt ExitProcess | Exact child exit подтверждён; другой child затем acquired тот же lock |
| Missing lock/root, denied access, unsupported query | Fail closed; нет create/retry/fallback и positive witness |
| Lost ACK/protocol error/partial acquisition | Same-child reconciliation либо exit; все acquired handles освобождены, replay отсутствует |
| Replaced pathname cleanup: runRoot/fixture и reparse/outside replacement | Fresh pinned traversal отказывает; новый объект и его contents неизменны; foreign/unknown paths сохраняются |

Race proof использует compile-time test-only pause hooks на component/open/publication
границах и реальные filesystem действия; mock не подменяет positive kernel proof.
Каждый пункт имеет actual result или явно UNVERIFIED; skipped mandatory case не PASS.
Составные строки разбиваются driver на отдельные exact case IDs с evidence для каждого
input/направления/границы; одна успешная проверка не закрывает всю строку. Все native
cases этого документа сейчас UNVERIFIED. Spec GO не меняет их статус.
Conditional 8.3 alias можно добавить, но его отсутствие не заменяет обязательные aliases.
Ослабление sharing/reparse/identity checks ради PASS требует отдельного review.

## Решение, validation и следующий пробел

Выбран held file HANDLE: небольшое ядро, exclusion и release принадлежат ОС.
Named mutex добавляет naming/security scope и сам не привязывает root; presence/CREATE_NEW
latch не является lifetime fence. Handle-relative traversal выбран вместо повторных
absolute-path checks; дополнительный NtCreateFile interface остаётся внутри малого core.
Existing [Win32 patterns](../native/ame-snapshot-service/service_win32.cpp) дают RAII,
held ancestors и no-replace публикацию, но не доказывают этот новый контракт.
Existing source/props/launcher/pins не изменяются ради extraction общего SDK.

Приёмка implementation: independent bounded diff review + перечисленные native proofs
parent; configured code/rules checks только для новых файлов. В текущем specification
этапе выполнены targeted source/doc reads и сверка ссылок; сборки/native runs не было.
Spec GO принимает требования и разрешает ограниченную implementation/proof, но
**не** означает native acceptance. Проверенным prerequisite этап станет только после
source review/checks и actual PASS всех mandatory cases; UNVERIFIED/skip не PASS.
Genuine issuer, production factory,
durable lineage/fence epochs/CAS и service/lifecycle integration остаются unavailable;
этот документ не разрешает wiring или initial launch.
