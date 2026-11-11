# Две desktop установки: доказанная цепь и открытый пробел

## Что произошло

10 ноября штатный installer создал новую identity `7ece` как первую установку.
Он наблюдал отсутствующие descriptor, client, origins и CEP, но проектный config
уже указывал на Core в том же локальном корне. Этот сигнал прежней установки
не участвовал в допуске. Началась новая история; последующее обновление 4.2.1
сохранило именно эту новую identity.

11 ноября обнаружены прежние descriptor/client/origins `e0` вместе с CEP/config
и частью истории `7ece`. Это не допустимый префикс прерванного update:
среди сохранённых intents нет перехода от обнаруженного descriptor `d337…`.
Разовое восстановление сохранило обе доступные истории и вернуло согласованную
4.2.4. Оно описано в [отдельном отчёте](core-desktop-mixed-installation-repair-20261111.md).

**Доказан общий дефект:** неполное представление прежней установки принималось
за чистое начало, поэтому обычный перенос мог незаметно создать вторую identity.
**Не установлен исторический писатель**, скрывший старый root и впоследствии
вернувший файлы e0. Приписывать это конкретному скрипту или sandbox оснований нет.

## Привязка к исходным evidence

Подтверждённый локальный чат: `01a1c0a1-89db-76b1-87a9-cc42bdb92084`,
«Продолжить работу над тестом 4.2.1». Rollout:
`C:/Users/Ant/.codex/sessions/2026/11/09/rollout-2026-11-09T19-06-14-01a1c0a1-89db-76b1-87a9-cc42bdb92084.jsonl`.
Строка 6711, `2026-11-10T05:22:27.865Z`, call
`call_734cefd9c6264b11a25c7f3ab80f5126`: inline PowerShell проверяет отсутствие
root/CEP и вызывает standalone `apply` пакета `582744df…`. Исходный rollout
содержит данные других операций и в этот отчёт/внешнее ревью не копируется.

| Evidence | SHA-256 |
| --- | --- |
| Rollout | `5adaa782641010f5010266f9f5c71b29bf8ab117f1cedfe83df1478a9bff2ce5` |
| Текст команды 6711 | `d476b8c9e62e7a5516af7f794d142d4684f73deb522991d922a37ed91948475f` |
| desktop-core-install.json | `d9d564c866aa5761f58111fa665f0f5d9c068e637986c065aaec9897ca760d58` |
| Initial transaction 7e2bc281 | `3e034a7137a73ac1fa72ddf0fb60ea93f09515e4fee2f1671afce809846b26be` |
| Его prepared.json | `c8d090f94584ed57de6aa2d3f44131620f09d5ae968b3cb5273049ffa99a03f6` |

Transaction `7e2bc281-02ec-4cff-b77e-375bef049c66` подтверждает
previousDescriptor/client/origins=null, previousCep=hash(null), predecessor=null.
При этом previousConfigHash **равен** appliedConfigHash:
`bc6b0ead724f7df3b6ec96fbaeb812ae0be740a9d959f73fd997b6bfb7a637a2`.
Прежняя MCP binding: release `582744df…/runtime/client-entry.js`,
`--client-descriptor`, тот же `AEAgentCore4/core-client.json`.
Секреты из transaction/prepared не публикуются.

## Что исключено и что осталось неизвестным

- `update-workflows-montage.cjs` проверяет сохранение actual installationId;
  новая identity возникла раньше этого update.
- `production-maintenance.cjs` перемещает CEP и сверяет descriptor/origins/history;
  записи возврата e0 в просмотренном коде нет.
- Ближайший turn_context (строка 6507) задаёт danger-full-access, never и
  disabled permission profile. Initial вызов не переопределял shell/workdir/
  sandbox. Гипотеза разных sandbox views не подтверждена.
- Поиск охватил 68 локальных rollouts 9–11 ноября (41 с AEAgent references)
  до первого наблюдения инцидента и исходники задействованных drivers.
  Команда удаления/перемещения whole root или возврата e0 не найдена.
- Старые файлы e0 сохранили hash и шесть stat fields. Перемещение поддерева
  совместимо с этим фактом, но конкретного действия не найдено.

Дополнительный read-only поиск Luna охватил единственный Core rollout с началом
8 ноября (`rollout-2026-11-08T19-05-36-01a1bb7a-970f-7680-85fe-6b65faa3452c.jsonl`,
SHA-256 `c4d5a9aa910d7fef66570065e921d11e3aadf9081934caa143645b165839d253`)
и два Core rollout с началом 7 ноября; в последних нет записей целевого окна
8–10 ноября. В папках 4–6 ноября совпадений AEAgentCore4 не найдено.
У rollout 8 ноября — 3472 строки, 382 tool calls, 31 обращение к фактическому
LOCALAPPDATA/Core root. Найден штатный start-over с незавершённым исходом,
но не операция возврата descriptor/identity; прямые файловые операции относятся
к временным AEP/скриншотам. Root rename/restore writer этим поиском не установлен.
Журнал целиком и его чувствительные аргументы не публикуются.

Финальный индексный поиск трёх точных anchors (e0 ID, dfcc stop, 7f update)
по всем локальным sessions нашёл 13 файлов. Помимо уже рассмотренных окон,
проверен один ранний чат от 29 октября:
`rollout-2026-10-29T14-22-16-01a186f7-9c1b-7513-a89e-cef10752eba1.jsonl`.
В целевом окне 8–10 ноября у него 51 tool call. Подтверждена штатная e0
stop/update/inspect/enable цепочка 7f от 8 ноября; прямые файловые операции
касаются тестовых материалов и preflight evidence. Root rename/restore в этом
дополнительном раннем чате также не найден. Поиск завершён с указанным пробелом,
без приписывания причины неподтверждённому actor или sandbox.

Дополнительно прочитаны только NTFS metadata самого Core root и границы USN
journal, без изменения настроек/файлов и без чтения журнала всего тома.
Последний USN root `0x000000053f276868` ниже доступного First USN
`0x000000056a800000`; размер journal — 32 MiB. Соответствующая прежняя запись
каталога уже вне сохранённого диапазона. Этот источник также не устанавливает
исторического писателя. Безопасная сводка сохранена локально в
`.codex-runtime/core-4.2.5-implementation-20261111/usn-root-window.json`.

## Проверяемое исправление общего механизма

Astra независимо воспроизвела три admission defects на синтетических TEMP
установках: новая identity поверх transactions/releases; origins без descriptor
с predecessor:null; settled ledger, добавленный после virgin plan.
[Исходный review и evidence](../reviews/astra/core-transfer/20261111/review-before.md).

Контракт 4.2.5 различает чистое начало, согласованную существующую установку
и orphan/mixed состояние. Признаки старой установки запрещают silent initial
recreate. Повторные проверки под lease и перед switch закрывают изменение
состояния после plan. Согласованность существующих descriptor/CEP/MCP проверяется
до подготовки обновления. Обычные repeat/update сохраняют локальную identity;
orphan требует отдельного восстановления, а не автоматической перезаписи.

Это защищает штатный перенос от подтверждённых сценариев. Произвольное внешнее
изменение файлов нельзя объявлять предотвращённым без установленного писателя.
Адресная валидация и выпуск ведутся в [плане 4.2.5](../plans/core-transfer-4.2.5-20261111.md).
