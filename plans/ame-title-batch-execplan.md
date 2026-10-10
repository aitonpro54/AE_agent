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
- [x] Native prerequisites: Build Tools установлены; локальная x64 C++/SDK
  smoke-проверка прошла. В проверенных каталогах Adobe SDK не найден; это не
  закрывает M3.

## Decision Log

- Исполнители по scope: root — единственный live controller; `ae_specialist` —
  реализация typed-кода; `ae_architect` — API/границы; `ae_operator` — bounded
  offline checks и документация. Flash запрещён пользователем. Frozen intake и
  зависимости не менялись; четыре предшествующих dirty source SHA сверены.
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
- SDK catalog Adobe Console дал anonymous HTTP 403; нужен обычный login/download.
  CC2017 links дали 403/404. Заголовки SDK/лицензия не vendored, C++ stub не backend.

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
- Final review native snapshot contract: три safeguards прошли review на уровне
  спецификации, backend не реализован/не принят. Последний passive bridge read
  root: connected, pending/inflight/edit отсутствуют, lifecycle generation 7 без
  block/pending; PID `12528` и source SHA неизменны. AE/AME/CEP reload/actions не было.
- Daemon source: PID `12528`, started `2026-10-10T10:59:29.107Z`, SHA-256
  `cb32ae91fd8af2341e35b89769425c67b3aafdb4c273871e3b66202f8ed82aa4`; panel
  connected/idle. Reload helper получил `EEXIST` после stop; stop сверён, daemon
  восстановлен с отдельным log. CEP/AE/AME reload не было.
- Remote AME: `EPERM` до spawn, config SHA unchanged, service process отсутствует;
  обхода не было. AEP support и queue isolation не проверены. Двухвариантная
  live-приёмка не выполнена.
