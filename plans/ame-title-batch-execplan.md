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
- [ ] M3 BLOCKED: безопасный snapshot, durable submit, native job identity,
  собственный start и status/progress не доказаны и не зарегистрированы.
- [ ] M4 NOT ACCEPTED: полная live цепочка двух вариантов не выполнена.
- [x] SDK intake и offline probe: build `build-63db389697a6421089900d260a1ae582`,
  AEX SHA `232c59d8db6376e4ab67cbdb9199f1e530cdc64bddb1b784d029168209912b55`.
  Independent review PASS только offline protocol/read-only bootstrap scope: P1/P2
  закрыты в этом scope; harness 215 PASS (22 Win32 interleavings, 18 guard refusals).
  Harness вызывает общий closed guard напрямую, не native state machine. Production
  acceptance/M3 остаются BLOCKED; старый 39-check build отклонён как pre-fix.

## Decision Log

- Исполнители по scope: root — единственный live controller; `ae_specialist` —
  native ABI и CEP async boundary; независимый Sol review ожидается; Luna/high —
  docs и bounded offline checks. Flash запрещён. Frozen intake и зависимости не
  менялись; четыре предшествующих dirty source SHA сверены.
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
- Unknown исход не повторяется. Remote `EPERM` не обходится. Без доказанной
  цепочки snapshot + submit events/progress не засчитываются как статусы job.
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
- Current offline docs/check block: build receipt, exact 11 source hashes, AEX SHA,
  SDK inputs and user-supplied archive hash match; 215 protocol PASS / 22 Win32
  interleavings / 18 refusals recorded with harness limitation above. Four preexisting
  dirty-file hashes remain unchanged. No live native load, fixture/save acceptance,
  M3, AME end-to-end, active-panel reload or child guard bootstrap is claimed.
