# Пакетный экспорт вариантов титров через AME

Цель: несколько вариантов из одной рабочей композиции, независимые AEP-снимки,
один существующий EPR-пресет и подтверждённые статусы AME. GUI-автоматизация,
native AE render, aerender и ffmpeg как замена AME исключены. Пользователь запретил
Flash в этой задаче. Подробное фактическое состояние: [AME](../docs/ame-title-batch.md).

## Progress

- [x] M1, commit `7c97574`: BridgeTalk transport, cold launch + warm delivery;
  каталог существующих пресетов. Это доказывает транспорт/каталог, не экспорт.
- [x] M2 implementation, commit `80c0067`: `ensure_ame_running` + offline smoke. **Live guard:**
  runner остановился до исполнения на `project_save_required`; live ensure не принят.
- [ ] M3 BLOCKED: immutable grant `a56cae55-40c1-49f2-b79e-e4aa9f23f1b5`, SHA-256
  `f46238c1038d7b890dc02cc314d5b22f7d0ff075385eff0ba4058b1281f72f4e`, принят
  только актуальным CEP epoch 1 / generation 1791648133063. Свежий run
  `54062238-4828-453c-a115-6ddc9f302dee` завершился
  `fixture_runner_receipt_unknown_no_replay` примерно за 92.9 с; M3 не принят.
- [ ] M4 NOT ACCEPTED: полная live цепочка двух вариантов не выполнена.
- [x] Дополнительный fixed exporter read: 18 offline групп PASS; live response
  `7a287810-07ee-44d6-8b73-f84fb4d0b118` доставлен, старый session nonce не совпал.
  Encoder/exporter API отражён без submit/encode, это не готовность экспортировать.
- [x] M2 уточнение: ручной exact-hash pin для существующего AME с `HashMismatch`
  реализован и проверен офлайн (27 групп + 5 ingress-групп). Авторизация приходит только
  от panel-role `/agents/plan/run`; MCP/admin/autonomous echo не выдаёт разрешение.
  Живой ручной запуск этого пути ещё не выполнен.
- [x] Native fixture: старый run `40ddeee4-8b49-47d6-9301-03873fbe8cec` / request
  `67d45704-92ac-4700-9288-b7db697ea90f` получил `EPERM`; его disposition
  `abandoned_reviewed`, но исходный результат остаётся unknown/no-replay.
  Новый manual dry-run `d416667c` и action `act_ef261a108a6c44b5b668ffcd0d371c58`
  rev 2 прошли; последующий run выше неизвестен и не переигрывался.
- [x] Jobs implementation: fixed GUID inspection, exact EPR enqueue, retained wrapper
  status и отдельный semantic read-back зарегистрированы. Fixture outcome тоже требует
  отдельного private-cache file/process read. START остаётся закрыт без full queue proof;
  это код/offline milestone, не экспорт двух вариантов.
- [x] Jobs milestone зафиксирован `6692fe9`; exact UI disposition реализован отдельно:
  immutable capture/consumption/audit, original unknown/no-replay сохранены. Root own
  review исправил восстановление guard после будущего легитимного restart: lookup
  сверяет неизменную историческую запись и свежий текущий actor/runtime.
- [x] SDK intake и offline probe: build `build-63db389697a6421089900d260a1ae582`,
  AEX SHA `232c59d8db6376e4ab67cbdb9199f1e530cdc64bddb1b784d029168209912b55`.
  Independent review PASS только offline protocol/read-only bootstrap scope: P1/P2
  закрыты в этом scope; harness 215 PASS (22 Win32 interleavings, 18 guard refusals).
  Harness вызывает общий closed guard напрямую, не native state machine. Production
  acceptance/M3 остаются BLOCKED; старый 39-check build отклонён как pre-fix.

## Decision Log

- Исполнители по scope: root — единственный live controller; `ae_specialist` —
  native ABI и CEP async boundary; root — собственное ревью по поручению; Luna/high —
  docs и bounded offline checks. Flash запрещён. Frozen intake и зависимости не
  менялись; четыре предшествующих dirty source SHA сверены.
- Текущий блок: root — sole live controller и reviewer; пользователь запретил Flash/Pro.
  Старый EPERM-run адресно помечен `abandoned_reviewed`, сохранив original unknown/no-replay.
  Signed grant остаётся private и был принят только свежим exact CEP actor/runtime.
- Signed v2 runner устанавливает только собственную точную AEX-сборку и не заменяет
  другой файл. Fixed fixtures имеют одну root comp `Main`, вложенную comp и media/proxy
  в отдельной папке. Process birth, MAC, source/binary SHA и receipts проверяются до
  следующей фазы. Captured source path/dirty сохраняются; undo history не заявляется.
- Exact pin не исправляет подпись и не доверяет другим операциям: `vendorSignatureVerified=false`,
  `trustScope=ensure_ame_running_transport_only`. Native discovery и хеш повторно сверяются
  до/после тёплой проверки и перед холодным запуском; штатный Valid Adobe gate сохранён.
- `ensure_ame_running` использует обычные proposal/dry-run/confirmed-or-autonomous
  gates и дисковый checkpoint именованного сохранённого AEP через
  `COPYFILE_EXCL`. Успех означает только готовность read-transport. Чистый файл
  не заменяет snapshot текущих unsaved edits.
- Discovery не исполняет exe с неподтверждённой подписью: `HashMismatch` даёт
  `ame_running_installation_unverified`; штатные PowerShell modules/UTF-8
  исправлены без изменения execution policy или ослабления Adobe signature gate.
- Публичный AE Project API не показывает `saveCopy`/`saveAsCopy`; кандидат
  `AEGP_SaveProjectToPath` + условный `PF_SetProjectDirty` не доказывает
  path/dirty/undo semantics и требует disposable-fixture probe. Варианты готовить
  в owned staging project только после baseline snapshot; контракт —
  [native snapshot](../docs/ame-native-snapshot-contract.md). AME26 wrapper не
  документирует individual start и полный queue list; общий `runBatch` не
  доказывает владение заданиями. UUID/GUID приложения не является native job ID.
- Неизвестный исход не повторяется; удалённая `EPERM` не обходится. Без доказанной
  цепочки snapshot и submit events/progress статусы заданий не подтверждены. Пользователь
  потребовал работать без официального установщика AME; не предлагать загрузку, ремонт,
  установку, обновление или принудительное закрытие. Осмотр существующей установки остаётся
  read-only; исходный код `ensure_ame_running` сохраняет signature gate при `HashMismatch`.
  M1 включал холодный запуск/delivery/warm read; позднее M2 ensure остановился на
  `project_save_required`. M100 связан с текущим проектом панели; raw ACK не является child
  grant, raw FILE не поддерживается. Полная очередь, отдельный запуск, native job identity/status
  и загрузка native plugin в исходный host не доказаны; `runBatch` действует на общую очередь.
  Локальный пакет GPT Pro — только review; исключение по hash или разрешение fixture не решают
  всю цепочку. Исходник daemon регистрирует три AME tools; adapter получает `tools/list` по
  запросу и направляет `tools/call`; `tools/list_changed` отсутствует. Эти имена отсутствуют
  в текущем root snapshot `ALL_TOOLS`; обновление метаданных host не подтверждено.
- User supplied local SDK archive `C:\soft3\AfterEffectsSDK_26.5_win.zip`, SHA-256
  `ad86bd6d66a1e1ffe8471e4618e3de4dbc9679f2ca47ae9bbe69f78805c82960`; archive
  provenance is local, not independently verified official download. Safe intake:
  432 files / 5,704,481 bytes; no LICENSE/README/EULA in archive; Adobe Developer
  Terms §4.1/§4.5 and SDK headers reviewed locally. Headers/PiPLtool not vendored.
  SDK 26.5 CompSuite13/v27 vs AE26.2 CompSuite12/v26; probe uses old header ABI.
  Новый build — PE32+ AMD64/PiPL16000/EntryPointFunc; own binary Authenticode NotSigned.
  Exact 11 source hashes и binary hash сверены; rootMetadataIsolation UNVERIFIED,
  readiness/production/installed/loaded false. Reviewer ограничил acceptance offline
  protocol/read-only bootstrap under trusted stable parents; harness direct-calls common
  closed guard and does not test native state machine or real AE call count. Старый
  build `build-f28c96906f7440df9bc2b71dc9d871bc`/SHA `da6efc3c162f1bcedda27cd6ff51f6790d489a5e8d7a06b25883460b0b73f098`:
  39 PASS отклонены как pre-fix. `app.project.revision` — supplementary fixed readonly stale
  token, not a general revision guarantee.
- CEP guard/raw fix source hashes were installed in regular `%APPDATA%\Adobe\CEP\extensions\com.codex.aemcpbridge`;
  backup/result receipt: `.codex-runtime/ame-native-prerequisites/cep-guard-deployment/e582dd1a-3e48-48eb-8fd8-9874d484b1bd/`.
  Root then restarted bridge only: PID12528→24440; loaded `sourceSha256`
  `36d448cd4f3e01df940e06e4f1b4cc4dc7604b96e3b6b2733b8094e0424480fc` equals current
  38-module runtime identity. Fresh root read: connected_idle, pending/inflight0, same
  panel ID; `get_project_info` returned Bylina_Muniver_русский_оркестр_konkurs_kino.aep,
  752 items, revision77577884. This is current read only, not prior-project continuity.
  CEP panel not reloaded; installed guard/child bootstrap unverified. Raw FILE lane lacks
  content-hash binding and is not content-safe; broader M100 is out of scope. AME
  HashMismatch and unknown public queue/start semantics remain. Identity receipt:
  `.codex-runtime/ame-transport-probe/runtime-identity-d7746f1-20261010-004b3911-8169-4752-9916-9567dfb3107c/runtime-identity.json`.

## Validation

- Disposition offline: 14 scenario groups, panel-actions16, historical settlement9;
  backend fixed readers19 PASS. Перед upgrade root read-only capture подтвердил
  исходный canonical SHA `caf20b82…0866` и guard. Загруженный panel.js совпал с
  Git `12f4848`, установленный — с `d7746f1`: известный cache drift, native запуск
  не выполнен. Два старых AE children PID38316/36520 принадлежат Dynamic Link
  PID28468 и созданы до fixture; current host31728 неизменён. Root maintenance
  обновляет только два CEP asset и daemon, не освобождая guard и не вызывая AE/AME.
- Live upgrade intermediate: два asset установлены, daemon42180→32828; до
  `Page.reload` строгий check остановился из-за отсутствующего target.id в штатном
  service contract. Root исправил binding на реальную пару URL/WS; smoke15 PASS с
  14 отрицательными binding cases. Receipt/canonical неизменны, reload ещё не отправлен.
- Upgrade продолжен после read-back: daemon32828→39408, CEP reload отправлен один раз;
  loaded/current runtime SHA `a0e67e96…6176` совпали. Capture `315ecdc8…`, audited
  disposition `a56cae55…` / SHA `f46238c1…2f4e` сохранили original canonical/private
  signature/projection. Исторический outcome unknown, execution не доказано, replay=false.
  Live pending GET выявил круговой idle check; исправлен только LOOKUP: fresh private
  controllerIdle до/после, строгая capture authorization сохранена. Trusted release
  переживает legit same-instance epoch/gen; первая adoption требует fresh full actor.

- Own AEX установлена по прямому поручению пользователя через стандартный UAC:
  точный binary SHA совпал, receipt `owned-plugin-install/install-17e7622b/`.
  Исходный `-File` остановила `ExecutionPolicy=Restricted`; затем выполнен тот же
  проверенный inline command в разрешённом Windows command lane, policy не менялась.
  AE/AME не закрывались, child/save/submit/encode этим действием не запускались.
- Jobs adapter: 16 offline VM групп и 18 semantic групп; exact wrapper association
  отдельно от native job ID/media. Tool START по умолчанию отказывает с
  `queue_composition_unavailable`; сообщение об очищенной очереди не заменяет API proof.

- Signed v2 build `build-9a6b7110dd934bfb85982f3331b9d1fd`, AEX SHA
  `ba4afb624dbb29ddea905cac86a618a30de0f3b8bac1068bc85b70b923813d8a`:
  215 legacy + 65 signed C++ checks, 63 JS grant checks, 28 runner checks PASS.
  Build selector повторно сверил current source/binary и установленный CEP guard;
  smoke:evidence reader — 12 групп PASS. Все эти результаты offline; native fixture
  ещё не запущен, AME jobs не отправлены. Extracted planning VM обновлён новой
  actual dependency; весь `smoke:planning`, rules, syntax и diff PASS.

- Текущий manual-pin milestone: `smoke:ame-running` 27 offline групп, private ingress
  5 групп, `smoke:planning`, `check:rules`, syntax и scoped diff PASS. Ingress проверяет
  copied/changed context, wrong role/route, autonomous, stale/changed payload и закрытый
  async scope. Ни AME, ни AE этими проверками не запускались; это не live acceptance.

- 10 октября пользователь явно отменил GPT Pro и подтвердил, что убрал очередь AME.
  [Собственное ревью](../docs/ame-title-batch-self-review.md) снимает только добавленные
  нами full-undo/hostile-same-user критерии и требование Pro; CEP/runtime gates действуют.
  Root scoped bridge-only reload: PID24440→40760, aggregate SHA `cb2f5017…5382a`.
  Fresh process metadata: AME PID35400/start `2026-10-10T13:52:47.495Z`, version26.2.0.52,
  прежний executable SHA и HashMismatch. Probe вернул exporter 9 methods/4 properties,
  deliveryVerified=true, sessionNonce=null, `target_session_changed`, queue writes=0.
  После сообщения о cleared queue persisted batch.xml ещё содержит 9 Group/9 Status,
  mtime14:05:57Z: disk-only observation не доказывает текущую очередь в памяти.
  Никакой encode/start/fixture/save текущего проекта не выполнялся.
- Offline PASS: running 19 групп; transport 17; presets; полный `smoke:planning`;
  `check:rules`; семь
  `node --check`; `git diff --check`. Все четыре исходных dirty-file SHA совпали
  с сохранённым baseline. Preset scan: 11, complete, issues 0,
  `nativeAvailability=not_verified`; file-symlink fixture недоступна, junction
  проверен. Это не live proof.
- M1 live: cold startup и отдельный warm transport с тем же boot nonce; AME queue
  не менялась. Warm2 request `2fb6d5e3-db3c-4269-8be1-fa695c0029b2` подтвердил
  delivery/warm в том же boot session.
  Финальный warm3 `390529d4-756a-4026-bbdc-981d6cbd6bc5` также PASS, queue writes=0.
- Offline feasibility writer: прежний ACL receipt `run-ae6c…` / SHA `35c924d3…1575a62`
  относится к прошлым исходникам и завершился `acl_asymmetry_failed`; вызов удаления точного
  профиля вернул S_OK, но отсутствие профиля не проверялось. Текущий run
  `run-39442a5bbcad41d8b5daafea8c85d429` прошёл независимую проверку только как набор ранних
  отказов: 4 случая, stdout совпал с receipt, хеши дерева/ACL SDDL неизменны, 19 хешей исходников
  сверены. Claim flush, успешные AppContainer/AccessCheck, AE и допуск не проверялись;
  readiness/production=false, rootMetadataIsolation=UNVERIFIED. P2 закрыт только в этой области.
  Локальный пакет review: `pro-review-bundles/ame-native-child-grant-and-existing-installation/`.
  Исходник daemon регистрирует 3 AME tools; adapter получает `tools/list` по запросу и
  направляет `tools/call`; `tools/list_changed` в исходнике нет. Эти имена отсутствуют в
  текущем root snapshot `ALL_TOOLS`; обновление метаданных host не подтверждено.
- Live runner: `get_project_info` показал уже открытое состояние `file=null`,
  59 items, `activeFootage`; inspect показал `dirty=true`. Исполнение не началось:
  `project_save_required`. Мы не создавали/не сохраняли/не открывали проект.
  `titr_all.aep` SHA `e55edfd680a6f4bad222389ffcf5b6d08a18ff4afd2a15a27f944bdcf8856754`
  совпал до/после отклонённого proposal.
- Final native discovery: AME26.2.0.52/годовой productName распознаны,
  `HashMismatch`/`launchable=false`, прежний PID12492/start; запуск не выполнялся.
  Финальный native read показал другой именованный проект, `dirty=true`.
- Build Tools 17.14.41 bootstrapper имеет Authenticode `Valid`, SHA-256
  `37bb0fb429d163ecebd272a865d11a37b906d152bef960da2ddb29c2e2fd6eeb`.
  Root подтвердил завершение установки MSBuild/MSVC x64-x86/WinSDK 26100 в
  `C:\Users\Ant\AppData\Local\AEAgent\BuildTools2022`: PID 4236 exit code 0,
  `vswhere isComplete=true`, reboot false. MSBuild `17.14.60.43110`, cl
  `19.44.35229.0`, MSVC `14.44.35207`, Windows SDK `10.0.26100.0`; owned x64
  smoke собран/запущен, `pointerwidth=8`, exit 0, `Windows.h` и x64 `kernel32.lib`
  присутствуют (receipt в ignored `.codex-runtime/.../build-smoke/`). Это не доказывает
  Adobe SDK backend или AE/AME интеграцию.
- Prior native snapshot contract review: три safeguards прошли review на уровне
  спецификации, backend не реализован/не принят. Последний pre-commit passive bridge
  read root: connected, pending/inflight/edit отсутствуют, generation7; PID `12528`.
- Prior daemon checkpoint before commit `d7746f1`: PID `12528`, started `2026-10-10T10:59:29.107Z`, SHA-256
  `cb32ae91fd8af2341e35b89769425c67b3aafdb4c273871e3b66202f8ed82aa4`; panel
  connected/idle. Reload helper получил `EEXIST` после stop; stop сверён, daemon
  восстановлен с отдельным log. CEP/AE/AME reload не было.
- Remote AME: `EPERM` до spawn, config SHA unchanged, service process отсутствует;
  обхода не было. AEP support и queue isolation не проверены. Двухвариантная
  live-приёмка не выполнена.
- Native review status: P1 refuses before fixture/project/JSX/media writes; P2 uses
  absolute same-held-handle rename without replace/fallback/replay. Independent review
  PASS is limited to offline protocol/read-only bootstrap under trusted stable parents;
  `rootMetadataIsolation=UNVERIFIED`. Harness does not test native state machine or
  establish a count of real AE calls. M3/live AE load/save semantics remain blocked.
- Финальный runtime/evidence: aggregate source SHA
  `97490d3bdf2ce64b8157bb39bff3bdc90692e45b52a18fd2856581ca31682745`, commit
  `2603e0e`; maintenance commits `54e6a26`, `e6ac3fe`, `2603e0e` затронули 2 assets
  и 1 reader asset без закрытия AE/AME. Новый daemon PID44100 started
  `2026-10-10T16:02:05.792Z`. Точная собственная AEX build `9a6b7110dd934bfb85982f3331b9d1fd`,
  SHA `ba4afb624dbb29ddea905cac86a618a30de0f3b8bac1068bc85b70b923813d8a`.
  Child PID26912 (CIM birth `2026-10-10T16:06:29.6145910Z`) — запущенный root-owned
  второй AE; пользователь подтвердил запуск. Свежий read показывает загруженный
  `After Effects 2026\Support Files\Plug-ins\AEAgentSnapshotProbe.aex`,
  `UntitledProject.aep`, RAM 2187 MB. Ранний `NOAEX` был до завершения старта.
  Capture `probe-8dcbbb2ecce6cb1697cc0b47699ea14d` по-прежнему содержит только
  server owner, launch manifest/attempt: нет signed boot, native claim, AEP или фаз.
  Manifest истёк `1791648689277` (~16:11:29.277Z); startup EntryPoint проверяет expiry
  до claim и может завершиться без сообщения. Истечение — правдоподобная, но не
  доказанная причина; pre-claim error не был выведен. Unknown run не replay/close.
  Основной AE PID31728 не менялся; чужие
  DL PID38316/36520 и parent28468 не тронуты. Текущий проект `konkurs_kino_02.aep`,
  rev77594573, 762 items. PE scout подтвердил AMD64, exports и PiPL16000 kind AEgx
  под ожидаемый SDK. AEX загружена во втором AE, но signed native protocol не стартовал.
  SDK показывает только startup entry point; требуется bounded диагностика раннего
  старта/жизненного цикла и expiry. Это технический blocker, не доказательство
  невозможности.
- Offline final: disposition 17, panel-actions 48, backend 28, rules/syntax/diff PASS;
  четыре исходных baseline SHA без изменений. M3 и M4 не приняты; нет production
  acceptance, live load, snapshot/save, submit/encode или полного AME результата.
