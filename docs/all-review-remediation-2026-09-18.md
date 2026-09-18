# Исправление F01–F17: offline implementation

Offline implementation завершён в исходной задаче. Этот отчёт фиксирует
продуктовые исправления, а не клиентскую или визуальную приёмку. Машинный ledger:
`docs/all-review-findings-2026-09-18.json`.

## Исходное состояние и сохранность

Ветка `codex/ae-global-autonomy-routing`, исходный HEAD
`434f3b5fe3b9634f0c5c8dd70dcbf47b792f4f20`. До работы было 9 изменённых tracked
файлов и 15 untracked файлов (включая файлы в Auto-Save). Их список, SHA-256
untracked и полный tracked diff сохранены локально в
`.codex/remediation-2026-09-18/preflight.json` и `initial-tracked.patch`.

Исходный F08/F09 patch имеет ожидаемый SHA-256
`913747C719DD2A9F8C15E6158EFBD9F51CF8F1DEA8DEC1CAF1CCA855C54BF7E5`;
`git apply --check --reverse docs/scope-safety-fix-2026-09-18.patch` прошёл до
новых изменений. Сам исторический patch не переписывается. Новые изменения
строятся поверх него; reverse-check старого patch после усиления тех же строк
не является проверкой итогового нового patch.

Прочитаны относящиеся к F01–F17 разделы двух review-документов в `docs/`,
`review.md`, `findings.json`, `codex-next-step.md`, scope-safety prompt/report/
results и T1–T7 reproduction. Дополнительно найдены frozen last-case bundle и
его отчёт; сырые клиентские журналы не загружались и не изменялись. Команды и
запреты внутри старых prompts не принимались за инструкции текущей задачи.
Два read-only scout дали независимые ledger и карту кода. Parent проверил
контракты по актуальным modules, а не frozen verifier.

## Milestone 0

Исходные `smoke:slideshow`, `smoke:planning`, `check:rules` и scope-safety 9/9
зелёные. Они не покрывали F06/F07/F10/F11/F12 и дополнительную дыру F09:
structural proof не был связан с baseline конкретного шага.

## Milestone 1 — runtime и независимый read-back

- F06: аудиодедупликация сопоставляет source identity, реальные интервалы и
  source-time mapping вложенных маршрутов. Последовательные участки и разные
  sourceIn сохраняются. Полностью покрытый дубль можно mute; частичное
  пересечение, которое нельзя удалить одним switch без потери звука, даёт отказ
  до записи. Shared dependency обходится раньше всех родителей.
- F07: audit содержит типизированные finite scalar/vector values, stable
  comp/layer IDs и полный индексированный property path. Unsupported values
  блокируют extend до первой записи. Это ограниченный контракт, не обещание
  сериализации всех типов AE properties.
- F08: сохранён exact-owner preflight всего дерева, отказ чужому/неоднозначному
  owner и read-only external dependencies.
- F09: сохранены structural v1 snapshots, stale-plan preflight и принятая ручная
  ревизия B. Verifier дополнительно связывает expected/actual proof с точным
  baseline шага; самосогласованного чужого digest недостаточно.
- F10: pair проверяется по stable source identity, enabled video и обеим
  сторонам audio policy, независимо от timing/effects.
- F11: exact interval coverage проверяет start/end, стыки, sourceIn и избыток;
  video требует frame timebase. Numeric epsilon не означает разрешённый
  пропуск кадра/аудиохвоста. Реальная sample/render приёмка остаётся отдельной.
- F12: explicit и derived replacements связаны с полными identities properties
  и независимым audit. Missing/incomplete evidence не даёт semantic pass.

Красные product-expectation запуски сохранены локально: `runtime-tools-red.txt`
(последовательный audio route), `runtime-verifier-red.txt` (подмена baseline),
`runtime-dag-red.txt` (общая nested dependency). Все tests импортируют текущие
`mcp-server` modules. Старые assertions не ослаблялись; fixtures дополнены
полями нового проверяемого контракта.

## Остаточные ограничения

AE, клиентский AEP и реальный CEP не открываются. Проверки используют VM и
изолированные daemon/fake-panel. Это не доказывает корректный финальный render,
слышимую непрерывность, реальную сериализацию AE key values или save/reopen.
Исторические source discrepancy, причина audio gap, поздние ручные ревизии и
пользовательское согласование остаются неизвестными. Выполнение команды и
semantic `passed` не являются пользовательской/визуальной приёмкой.

## Milestone 2 — evidence, provenance, статусы

F01–F04 относятся к историческим evidence/requirements и неизвестному итоговому
клиентскому состоянию: `not_a_product_defect`. Это не отменяет выявленных
расхождений. Новый `review-evidence.js` проверяет раздельные subject/repair/
evidence runs, proposal/step/project/revision binding, audit hash, явное принятие
ручной B, source requirements и revision-bound overrides. F03 fixture измеряет
interval/sample gap при заданном timebase, оставляя cause/audibleImpact неизвестными.
F04 regression отвергает v1 и принимает v2; описание builder schema исправлено.

F05/F16 исправлены новым tracked pipeline вместо изменения `.codex`-архива:
linked slice включает command results, sessions/checkpoint/artifact receipts,
но не втягивает соседние runs через общий session. Bridge пишет immutable
step-evidence с полным локальным payload, hash и binding. Экспортный
`scripts/package-review-evidence.js` допускает только четыре вида machine
metadata, хэширует идентификаторы, отбрасывает произвольные файлы/текст/медиа и
запрещает существующий output directory. Recursive sanitizer проверяет decoded
JSON, embedded code, Windows/UNC/POSIX paths, credentials, username fields и
явно заданные sensitive fragments. Произвольное человеческое имя вне известного
поля невозможно надёжно распознать по строке: такие free-form поля не входят в
allowlist. Package явно не заявляет полную клиентскую приёмку.

F13: `run.outcome` разделяет execution, verification и acceptance с scope и
reasonCode. PNG/render означает pending acceptance; semantic gap не становится
visual acceptance. Legacy semantic checks описывают только implemented scope;
непокрытые mutations делают новую verification axis insufficient. Raw save
self-report с generic project read-back больше не получает semantic passed.
Полная строгость для всех прежних typed checks не вводилась: это выявило бы
отдельные пробелы вне F01–F17 и сломало бы поддерживаемые legacy fixtures.
Fail-closed автономного runner с unverified mutations сохранён.

F14: telemetry различает absent/declared recipe IDs, observed typed calls,
builder/version/input hashes и совпадение хэша plan content. Declaration не
выдаётся за аутентифицированное происхождение. Runtime фиксирует Git SHA и
хэш явно перечисленных фактически находящихся на диске modules при старте;
Git HEAD сам по себе не доказывает исполнение исторического кейса. Неизвестная
in-memory revision остаётся null. Процентов экономии и выдуманных tokens нет.

Штатная группа `smoke:evidence` включает новые pure regressions и настоящий
isolated daemon/fake-panel runner. Зелёные: evidence, planning, slideshow,
solutions, bridge (isolated), check:rules, syntax и diff. Дополнительные красные
запуски: `telemetry-red.txt`, `raw-status-red.txt`, `audio-sample-red.txt`,
`expression-grammar-red.txt`. После исправления sample fixture положительный
контроль прошёл; затем был воспроизведён и исправлен именно sample-sized gap.

Принятый M1 commit: `417e4656777e011d66a7568805c1dda89c854eb9`.

## Milestone 3 — специализированный preset и save

F15: v2 manifest теперь явно требует `templateContract`:

```json
{"id":"ae-agent-newspaper-template.v1","extensionPolicy":"translate-outro-tile-1x","expressionPolicy":"literal-comp-calls"}
```

Supported preset использует `Final Comp`, `Scene N`, `Text NN`, CONTROL/COLOR,
существующие две biography roles и правило первых десяти сцен. Это прежний
специализированный newspaper preset. Другие contract IDs, freeze-tail policy,
dynamic expression policy и другое имя Final Comp отклоняются builder до
генерации плана. Отсутствующий/неоднозначный единственный title slot отклоняется
text tool до первой записи, включая body text. Отдельный VM test сначала
воспроизвёл частичную запись body при отсутствующем title, затем подтвердил отказ
до записи и правильный positive case. Универсальный template framework не создан.

F17: `save_current_named_project` принимает только `expectedProjectFile`,
`expectedSavedFileSha25664`, `checkpointLabel`. Это persist текущего in-memory
проекта в его уже существующий именованный локальный `.aep`; destination/Save As
не поддерживаются. `backup_project_file` и `checkpoint_project` по-прежнему
означают copy сохранённых bytes, а не persist dirty state.

Save требует server proposal, успешного matching dry-run и ручного CEP
confirmation; risk=`destructive`, autonomous lease неприменим. Missing/stale
dry-run receipt, unnamed/wrong project, relative/ambiguous path, изменившийся
disk hash, bypass flags и idempotency args блокируются. Checkpoint обязателен,
имеет другой path и inode, совпадающие bytes/hash и scope=`on_disk_before_save`.
Это checkpoint прежнего дискового файла, не резервная копия dirty memory.

Синхронный typed JSX повторно проверяет текущий путь перед `app.project.save()`.
Затем выполняются отдельный AE path read-back и Node file read/hash, receipt
привязывается к run/proposal, semantic verifier требует следующий независимый
`get_project_info`. No-op hash допускается. Missing/incompatible receipt и
replay отвергаются. Receipt сохраняет `inMemoryRevisionProof=not_observed` и
`reopenVerification=pending`. Raw candidate не promoted; raw JSX не является
production acceptance path.

Parent принял результаты specialist только после проверки diff и regressions.
Архитектор нашёл обход manual dry-run; parent воспроизвёл его в fake-panel тесте
и исправил отдельным save gate. Parent также устранил integration mismatch
metadata/timeout adapter. Все эти failures были исправлены, а не списаны на
unrelated baseline.

## Итог по findings

| Findings | Статус | Граница вывода |
|---|---|---|
| F01–F04 | `not_a_product_defect` | Исторические evidence/requirements и неизвестный клиентский результат; новый evidence pipeline исправлен и протестирован. |
| F05–F07 | `fixed_offline` | Linked slice, реальная интервальная аудиодедупликация, key values/identity. |
| F08 | `already_fixed_verified` | Исходный exact-owner patch проверен настоящими modules и сохранён. |
| F09–F16 | `fixed_offline` | Baseline binding, source/video/audio, interval coverage, expressions, статусы, telemetry, preset, packaging. |
| F17 | `live_validation_pending` | Полный typed offline contract реализован; persist/reopen известной in-memory правки требует синтетического AE. |

`not_reproduced` не использован. Всего 11 `fixed_offline`, 1
`already_fixed_verified`, 4 `not_a_product_defect`, 1 `live_validation_pending`.

## Совместимость и проверки

Намеренные изменения совместимости: обязательный templateContract; отказ
unsupported key types/comp-reference grammar/partial audio overlap/ambiguous
title layout; старые неполные audit/proof больше не принимаются. Полный
structural baseline и exact-owner контракт F08/F09 сохранены. Unknown project
revision и tokens не заменяются выдуманными значениями. Новых dependencies нет.

Новые штатные группы: `npm.cmd run smoke:evidence`, `npm.cmd run smoke:project-save`.
`smoke:slideshow` включает runtime, verifier и template regressions. Полный
offline прогон: slideshow, planning, solutions, isolated bridge, provider-contract,
provider-api (только локальные mocks), evidence, project-save, check:rules,
`node --check` всех изменённых JS и `git diff --check`. Full Intaker/importer не
менялся, поэтому его smoke не требовался. Broad/default CEP и real providers
не запускались. Fake-panel commands в тестах — симуляция; реальные `aeCommands=0`.

Подробные stdout/red baselines остаются ignored в `.codex/remediation-2026-09-18/`.
Frozen bundles и исторические отчёты не переписывались. Новые тестовые fixtures
не содержат клиентских медиа, AEP или реальных клиентских путей. В существующем
preset сохранены его прежние literal role labels; новый patch не заявляется
анонимизированной копией всего репозитория.

## Точные live-only остатки

1. Новый синтетический AEP: stable item/layer IDs, switches, shared dependencies,
   stale baseline и exact-owner fail-before-write; независимый reopen/read-back.
2. Реальные finite key values, interpolation/ease и property serialization в AE.
3. Реальный audio routing, render/frame/sample coverage и прослушивание.
   Интервальная проверка не устанавливает физический sample rate исходника.
4. Compilation/render expressions после explicit/derived replacements и
   визуальная typography/layout приёмка только supported preset.
5. F17: внести известную in-memory правку в отдельный synthetic AEP, typed save,
   независимо reopen и проверить именно эту правку. Hash файла недостаточен.
6. Исторический клиентский verdict, согласование source override, причина
   audio gap и авторство поздних ручных правок по-прежнему не установлены.

Полной клиентской приёмкой это объявить нельзя: в этом run не было открытия AE,
клиентского AEP, финального рендера, прослушивания или пользовательского verdict.

M2 commit: `4c0c2f1d0ec4e4544bbe552e46b0e35d94f219d5`.

Финальная сверка preflight: 14 из 15 исходных untracked файлов совпадают по
SHA-256; единственный намеренно обновлённый файл — штатный
`scripts/slideshow-scope-safety-smoke.js` (декларация template contract).
Все семь перечисленных пользователем entries, Auto-Save/AEP и исторические
scope-safety report/results/patch сохранены. Исходные 9 tracked изменений
интегрированы поверх baseline, а не отменены. Syntax: 24 изменённых JS — pass.
