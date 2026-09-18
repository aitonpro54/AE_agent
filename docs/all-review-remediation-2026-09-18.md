# Исправление F01–F17: offline implementation

Работа продолжается в исходной задаче. Этот отчёт фиксирует принятые milestones,
а не клиентскую или визуальную приёмку. Машинный ledger:
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
