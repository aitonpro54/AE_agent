# Disposable AEGP snapshot probe

Ограниченный native эксперимент, **не production backend**. Во всех receipts
`readiness=false`, `saveCalled=false`, `projectMutationDispatchCount=0`,
`outputProofAvailable=false` и
`destinationWriteContract=destination_write_contract_unverified`.
Исходники не устанавливают плагин, не запускают AE, не создают ack и не меняют
MCP/gates. SDK headers/PiPLtool остаются во внешнем лицензированном SDK.

Сборка: `& .\scripts\ame-native-probe-build.ps1` в разрешённом workspace PowerShell.

Отдельный контракт `ae-agent.native-owned-fixture-reopen.v1` относится только к
fixed owned fixture нового exact build. SDK не обещает clean dirty flag после
`OpenProjectFromPath`: здесь dirty остаётся наблюдением после open и после
read-only inspection. До первого variant dispatch требуются точные handle/path,
SHA входного baseline, его неизменные bytes и полный verified semantic proof.
В signed результате обязательны те же proof для baseline и двух reopened variants:
sentinel, оба текста и switches, fixed graph/links, media/proxy paths и bytes.
Issuer независимо проверяет native graph, семантику, files и pinned build/source
receipt. Expected buildId выводится из descriptor-pinned бинарника до boot, затем
сверяется с signed receipts. Старый `native-stage-readback.v1`/legacy result
сохраняет clean-only отказ; неизвестная версия или incomplete proof запрещены.
Это не primary-project capture backend, не установка и не новая интерпретация
старых UNKNOWN attempts. Offline harness не подтверждает live AE semantics.
Helper не меняет ExecutionPolicy. Он создаёт новый owned build id внутри
`.codex-runtime/ame-native-prerequisites/native-probe-build/`, собирает настоящий
Windows x64 `.aex` с PiPL resource 16000 и export `EntryPointFunc`, запускает только
отдельный офлайн Win32 harness и записывает SHA256/build receipt. Повторное
использование build id запрещено. Исходные hashes сверяются до/после сборки.
SDK archive SHA указан как предоставленный prerequisite; фактические headers и
PiPLtool хешируются, архив helper повторно не хеширует.

## Текущий отказ от AEP writes

Предыдущий pre-fix build содержал TOCTOU: отсутствие `source.aep`/`snapshot.aep`
перед path-only host save не защищало от вставки обычного файла, hardlink или
reparse child между проверкой и записью. Удержание directory handles запрещает
rename/delete компонентов, **но не child insertion**. Поддержанный route с
непрерывной безопасной writable reservation для host save не доказан.
Это не утверждение, что такой route невозможен; нынешних доказательств недостаточно.

Общий `RequireProjectWriteContract()` без override всегда даёт
`destination_write_contract_unverified`. `create-fixture` отказывает до Capture,
`AEGP_ExecuteScript`, media creation, import, layer edits, source save или dirty
restore для **всех** `saved-clean`, `saved-dirty`, `untitled-dirty`.
Fixture program, `p.save`, вызов `AEGP_SaveProjectToPath` и `PF_SetProjectDirty`
удалены из текущей реализации. Snapshot phase не достижима; её граница тоже
отказывает общим guard. Есть лишь read-only `inspect-empty`, включая фиксированный
readonly script для `app.project.revision`. Receipt не доказывает AEP output.

Возврат disposable semantic probe потребует отдельно проверенного safe writer
route, действующего manual CEP confirmation всего fixture/save scope и отдельного
review. Runtime grants, точные action/revision/hash и read-back сохраняются.
Root — единственный installer/live controller. Ack не является разрешением или
production gate; prepared workflow UUID не выдаётся за фактический CEP actionId/runId.

## Контрольные receipts: непрерывный producer handle

Каждый control receipt/attempt публикуется так:

1. Отметить basename как single-use attempt; существующие target/`.part` — terminal
   collision, без overwrite/replay. Неизвестный `.part` не принимается и не удаляется.
2. `CREATE_NEW basename.part` с `GENERIC_READ|GENERIC_WRITE|DELETE`, только
   `FILE_SHARE_READ`, `OPEN_REPARSE_POINT|WRITE_THROUGH`. Сразу передать handle
   retained map OwnedRoot, включая отказ после успешного create.
3. Проверить regular file, nLinks=1, canonical final path; сохранить volume/FileId128.
   `WriteFile` → `FlushFileBuffers` → seek0, same-handle read/SHA256.
4. Повторно сверить same ID/path/nLinks/bytes. На **том же** открытом handle выполнить
   `SetFileInformationByHandle(FileRenameInfo)` с `ReplaceIfExists=FALSE`,
   `RootDirectory=null`, абсолютным canonical child path из fixed single basename.
   Это один compile-time absolute-only режим, без runtime fallback/ack toggle.
   Buffer zero-init с NUL capacity; FileNameLength исключает NUL. Win32 отказ terminal.
5. Перенести retained map key без закрытия producer. Проверить same ID/path/bytes,
   выполнить повторный flush. Handle остаётся открытым до окончания OwnedRoot
   (для native state — до завершения host process), включая failed `.part`.

Внутренние `OwnedRoot::Read/Hash` используют retained handle и seek0. Старый
SHARE_READ-only reopen несовместим с producer WRITE+DELETE. Внешний reader должен
использовать read access и `SHARE_READ|WRITE|DELETE`, как Node/libuv; это позволяет
читать receipt, не получая write/delete access. Записи, unlink и rename producer
блокируются kernel sharing. Collision после flush сохраняет исходный `.part`,
его FileID/bytes и terminal no-replay. Общий output hash не заменяет эту identity.

Это контракт **control receipts**, не обещание BMP/media handoff. Fixture creation
отключена, media sealing/import compatibility остаются `NOT_ATTEMPTED`.
Threat model: доверенный backend/fresh owned root и concurrent обычный filesystem
writer (child files/hardlinks/reparse), при доверенных стабильных root/ancestors.
CREATE_NEW использует абсолютный path, поэтому concurrent metadata/reparse edits
root/ancestors не покрываются; `rootMetadataIsolation=UNVERIFIED`. Directory metadata нельзя объявлять защищённой
от произвольного hostile same-token кода: запрет share-delete сам не запрещает
изменение directory reparse metadata. Hostile код в процессе, права администратора
и обход filesystem ACL не покрываются.

## Bootstrap и закрытая ack schema

Плагин вне exact process env немедленно inert: нет suite acquisition, hooks,
записей или project reads. В probe env нет меню/GUI, New/Open/SaveAs,
Undo/Redo, caller JSX или caller output paths. Один idle hook обслуживает protocol.
После отдельно разрешённой установки выделенный `AfterFX.exe` получает
`AE_AGENT_NATIVE_PROBE_ROOT=<canonical absolute local path>` и
`AE_AGENT_NATIVE_PROBE_NONCE=<32 lowercase hex>`. Leaf — `probe-<nonce>`.
Root до запуска создаёт свежий каталог с одним `launch.manifest`:

```text
protocol=1
nonce=<env nonce>
plugin_path=<actual loaded native path>
plugin_sha256=<lowercase SHA256 of that .aex>
root_path=<canonical root>
```

Directory components открыты без share-delete. UNC/traversal/reparse components
и hardlinked input control files запрещены. `owner.lock` — CREATE_NEW, flush,
удержание без sharing. Root с прежними receipts/attempts не используется повторно.
Handshake связывает module path/hash, PID, process creation time, nonce и случайный
challenge. Suite acquisition прямой, без fallback/dialog: Proj6/v9, Comp12/v26
(AE26.2), Memory1/v1, Register5/v6, Item9/v14, Layer9/v15, Footage5/v11,
Utility6/v13, Collection2/v2. AdvancedApp dirty-restore suite не приобретается.

Все ack: UTF8, завершающий newline, уникальные keys, expiry >now и ≤300 секунд,
exact binding и schema. Дополнительные fields/скрипты/arguments запрещены:

```text
protocol=1
nonce=<handshake nonce>
challenge=<handshake challenge>
pid=<handshake pid>
process_created_unix_ms=<handshake processCreatedUnixMs>
plugin_sha256=<handshake pluginSha256>
root_path=<handshake rootPath>
operation=<fixed operation>
expected_sha256=<stage approvalSha256>
fixture=<saved-clean|saved-dirty|untitled-dirty>
restore_dirty=<0|1>
request_id=<prepared workflow id, not CEP actionId>
attempt_id=<prepared workflow id, not CEP runId>
expires_unix_ms=<expiry>
```

`native.ack/inspect-empty` получает read-only `boot.json` лишь для empty untitled
clean project. `fixture.ack/create-fixture` с boot approval получает terminal
`refusal.json` и ноль project mutations. Future `snapshot.ack/snapshot` schema
зарезервирована, но stage отключена; `restore_dirty=1` ничего не включает.
Controller пишет ack собственным exclusive temp+flush+no-replace publication.
Partial/busy ack даёт отказ, автоматическое исправление/replay unknown запрещено.

## Офлайн доказательства и непроверенные semantics

Harness выполняет настоящие Win32 negative interleavings: вставляет file/hardlink/
junction после source/snapshot absence precheck для всех трёх fixture kinds,
проверяет точный общий guard refusal и ноль **harness dispatches**, outsider bytes
и FileID. Это проверка guard и файловых операций без загрузки AE.
Между producer flush и rename он пытается delete/rename/replace/write, проверяет
kernel denial и сохранность FileID/bytes; отдельно вставляет final target/`.part`,
проверяет no-replace, удержание failed `.part`, no-replay и hardlink identity check.
Фактические kernel refusal codes сохраняются: Windows replacement может вернуть
ACCESS_DENIED вместо SHARING_VIOLATION; дополнительно обязательны ID/byte read-back.
Старые strict binding/staleness/expiry/provenance, parser/Unicode/SHA и реальные
owner/root/hardlink/junction checks сохраняются.

Native fingerprint измеряет лишь ограниченные fixture fields и observed revision.
Live AEGP load, SaveProjectToPath path/dirty/undo/view guarantees, snapshot reopen/
sentinel/dependency proof, media handoff, AME submit/encoding и production capture
current memory остаются **UNVERIFIED/NOT_ATTEMPTED**. Офлайн binary/harness не закрывает
production snapshot contract или M3. Новый build требует независимого review;
предыдущие pre-fix 39/39 не считаются приёмкой.

Root-relative вариант описан в [Microsoft FILE_RENAME_INFO](https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_rename_info), но отдельный свежий `relative_rename_repro.cpp` на Windows10.0.26200.0 вернул ERROR_INVALID_PARAMETER=87: x64 struct24/align8, offsets8/16/20, buffer50 с NUL, Length24 без NUL, валидный canonical regular directory handle access129. FileID/bytes сохранены; fallback/replay отсутствуют. Этот repro остаётся диагностикой, не acceptance.

После bounded review root отдельно разрешил immutable compile-time **absolute-only** publication для control receipts при явно trusted stable parent contract. Это новая reviewed сборка с новым build id, а не retry прежнего failed root или runtime downgrade. Root/ancestor metadata isolation остаётся UNVERIFIED; режим не включает AEP writer. Старые failed builds сохраняются как не принятые evidence.
