# AME: generic single-job source

**Статус: offline-контракт; live-проверка 11 jobs ещё не начата.** Producer
готовит один проверенный source для одного собственного задания. Для N повторяются
существующие per-job enqueue и self-check; producer не принимает N и не создаёт
N API-вызовов или queue census.

## API и проверка source

- `inspect_ame_job_source({expectedProjectFile, compItemId})` читает выбранную
  композицию и проверяет clean source.
- `create_ame_job_source({intentId, expectedProjectFile,
  expectedSourceSha25664, expectedRevision, expectedStateHash, compItemId,
  visibilityPatch?, range?})` готовит один source. Hash — SHA-256 hex; intent —
  UUID. Patch задаёт точные `{layerId, expectedEnabled, enabled}`; range —
  `{startSeconds, endSeconds}`.
- `reconcile_ame_job_source({runId, commandId})` только читает исходную команду,
  durable receipt и retained keyed slot. SaveAs/Open/replay запрещены.

`inspect` возвращает trusted private native streaming SHA probe: бинарное чтение
чанками 64 KiB, максимум 64 MiB, budget 15 s. До первого receipt при обычном
выполнении и при reconcile результат native сравнивается с независимым Node SHA.
Кэш probe живёт 120 s и привязан к точным filesystem pins и actor. Перед effect
остаётся как минимум `2 × measured elapsed + 30 s`; если remaining budget меньше,
source не создаётся. Namespace считается trusted до и во время hash; это не
атомарная защита от произвольного внешнего writer.

Source path не задаётся caller: это owned UUID в `GENERATED_EXPORT_DIR/ame-job-sources`
(`logs/generated-exports/ame-job-sources`); durable records лежат в
`LOG_DIR/ame-job-sources`. Создание проходит через
штатные proposal, dry-run, checkpoint и current grant. Ожидаемые SHA/revision/
state hash — preconditions, не authority. Подготовка использует SaveAs один раз,
проверяет native GUID/flags/workArea, восстанавливает protected original и
выполняет независимый read-back. Результат требует `dirty=false`. Generic comp
разрешён; пустой patch сохраняет visibility, остальные flags/audio/timing
сохраняются.

Private proof привязывается ровно к одному enqueue intent, output и range; публичная
JSON receipt не является authority. Далее применяется существующий per-job enqueue
и immutable self-check — по одному job на source. Чужие jobs, текущая очередь и
старые queued jobs не затрагиваются. Selector reconciliation — только read.
Pending, unknown actor/source/result, modal и неполное восстановление требуют
остановиться и сверить состояние; blind replay и второй SaveAs/Open запрещены.

Native resource cap 256 — предел ресурса retained slots, а не размер batch и не
обещание неограниченного N. Producer не расширяет прежнюю пару export steps.

## Статус и следующий шаг

Final offline SHA33 и producer23 (включая x2/x11/x111), nodecheck 9 JS и diff
пройдены; static reviewer дал conditional GO. Live-проба 11 ещё не начата. Далее:
штатный normal fresh CLI restart, затем
actual read-only probe и 11 новых jobs по текущим титрам. Не запускать START,
render или user jobs; прежние queued jobs не переотправлять. Live result сам по
себе не подтверждает output quality.
