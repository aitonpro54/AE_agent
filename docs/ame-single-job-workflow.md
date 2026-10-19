# AME: generic single-job source

**Статус: EXPERIMENTAL / UNFINISHED / FROZEN.** Per-title SaveAs, owned AEP snapshots
и full-AEP SHA flow заморожены до отдельного поручения пользователя. Код и полезные
offline проверки сохранены для будущего отдельного review; это не активный путь.
История реализации и эксперимента ниже — справочная, без GO на live acceptance.

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

`inspect` выполняет read-only probe через фиксированный hash worker на закреплённом
Node runtime: максимум 64 MiB, budget 40 s. Read transport timeout 60 s
не разрешает принимать полный measured elapsed выше 40 s. До первого receipt при обычном
выполнении и при reconcile результат native сравнивается с независимым Node SHA.
Кэш probe живёт 120 s и привязан к точным filesystem pins и actor. Перед effect
остаётся как минимум `2 × measured elapsed + 30 s` из native deadline до 120 s; если remaining budget меньше,
source не создаётся. Namespace считается trusted до и во время hash; это не
атомарная защита от произвольного внешнего writer. Exe и worker имеют private pins;
caller не выбирает программу или команду. Путь исходника передаётся как base64-данные.
Опасные startup/write-effect environment variables блокируют запуск; глобальная
environment не меняется. Worker не записывает файлы, не обращается к сети или очереди.
Полный exe/worker SHA проверяется при capture, перед mutation dispatch и самим worker;
между ними проверяются identity/time/parent pins. Drift отклоняет попытку без repin.
Code namespace считается trusted от capture до исполнения; selfhash не доказывает
loaded bytes против произвольного concurrent writer.
Его digest сохраняется native до восстановления исходника и callback; одного
post-callback server hash недостаточно. `callSystem` не даёт гарантии жёсткого
прерывания: неизвестный исход по-прежнему требует reconciliation без replay.

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

## История эксперимента (не активный следующий шаг)

Исходные offline проверки и последующий fixed Node worker остались экспериментальными;
они не подтверждают завершённость/приёмку workflow. Не продолжать их развитие в этом scope.

В живом AE ES3 SHA probe AEP 32 000 676 bytes превысил 15 s и 40 s до SaveAs;
effects/enqueue/START были 0. Worker-путь также остался экспериментальным и не даёт
приёмки. Прежний admission `2×40+30=110 s` при deadline 120 s не меняется.
Следующая работа определяется отдельным active workflow:
[открытая композиция и повторяемая отправка](ame-open-comp-workflow.md).
