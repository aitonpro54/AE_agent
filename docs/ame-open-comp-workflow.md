# AME: отправка из открытой композиции

**Статус: код и focused offline-проверки готовы; live-приёмка ещё не завершена.**
Это активный общий механизм повторной отправки N заданий. Количество заданий —
входные данные цикла, а не повод расширять код под 2, 11 или 111 вариантов.

## Целевой путь

1. Адресно прочитать композицию и точные IDs управляемых слоёв; сохранить небольшой
   журнал исходных свойств. Вспомогательные слои не менять.
2. Применить visibility выбранного варианта, временное уникальное имя композиции
   и прочитать изменённые свойства. Выполнить штатную AE Add to AME ровно один раз.
3. Найти в AME конкретную строку по полному уникальному имени, проверить её
   preset/range/output и сохранить первое наблюдение добавления.
4. Восстановить только наше временное имя по закрытому журналу и свежему read-back.
   Лишь затем переходить к следующему варианту тем же шагом.

Не использовать полный hash проекта как условие этого пути. Не отправлять batch
молча и не повторять неизвестный submit: сначала reconcile по точному исходному
идентификатору. Автоматический fallback запрещён. START, render и video/output
acceptance в целевой scope не входят.

## Typed API одного задания

| Инструмент | Роль |
| --- | --- |
| `inspect_ame_open_comp` | `compItemId`, `allowedLayerIds`, `presetLabel` — входные данные. Возвращает серверные intent/marker и свежие свойства/metadata. |
| `declare_ame_open_comp_idle` | Свежая операторская декларация idle/auto-start для точного AME PID/birth; не grant. |
| `dispatch_ame_open_comp` | Один `selectedLayerId` с серверными intent/revision/stateHash/menuMetadataHash; отдельный proposal/dry-run/run. |
| `report_ame_open_comp_ui` | Первое неизменное наблюдение полной метки и настроек конкретного нового задания. |
| `restore_ame_open_comp` | Только серверный `intentId`; отдельный proposal/dry-run/run восстанавливает имя по журналу. |
| `reconcile_ame_open_comp` | Только исходные `runId`/`commandId`, без повторной отправки. |

Массив вариантов хранится у вызывающего workflow и повторяет этот шаг. В коде
нет ветки «11 титров» или привязки к названию текущей композиции/preset пользователя.
Следующий dispatch требует локальных первого UI receipt и завершённого restore
предыдущего задания этого контекста; наличие receipt не вызывает новый AME STATUS.
Повтор одинакового UI-отчёта возвращает исходную запись, конфликт отклоняется.

## Границы одного шага

Сервер создаёт intent, уникальную метку и output path. Caller не задаёт command ID,
JSX или произвольные свойства. Proposal/dry-run/current grant сохраняются. Новый
локальный тип защиты `bounded_property_journal` разрешён только новым точным
инструментам; он не заменяет checkpoint других инструментов и не подделывает
edit session. Наших SaveAs, копий AEP и полного AEP SHA в этом пути нет. Внутренние
временные файлы Adobe допустимы и не выдаются за наш снимок.

Перед временным именем нужен ограниченный preflight релевантных expressions:
известная или неразрешённая зависимость от имени блокирует отправку.
Обход включает именованные корни Text/Transform и другие поддержанные группы:
одного `layer.numProperties` недостаточно. [Контракт PropertyGroup](https://ae-scripting.docsforadobe.dev/property/propertygroup/#propertygroupnumproperties).
Safe subset включает ограниченную арифметику и literal `loopOutDuration` с
фиксированными аргументами; синтаксис цикла — в [справке Adobe](https://helpx.adobe.com/after-effects/desktop/work-with-expressions/expression-language-reference/expression-language-reference.html).
Для точной literal цепочки `comp(...).layer(...).effect(...)(...)` проверяются
однозначные comp/layer/effect/leaf и выражение только связанного свойства, включая
транзитивные зависимости. Ссылки на переименовываемую comp, циклы и неопределённость
блокируются; выражения не исполняются сканером. Общие resource bounds сохраняются.
Диагностика содержит полные unique выражения/occurrences; targets явно обозначены
как samples с признаком truncation. Переполнение unique inventory даёт отказ.
Menu lookup использует фиксированные labels поддерживаемой locale, ровно один
положительный ID и привязку version/build/locale к proposal. Перед dispatch lookup
повторяется. Первая canary подтверждает фактическое mapping; затем используется
тот же проверенный шаг. `queueInAME(false)` не используется: он затрагивает всю AE RQ.

До enqueue контроллер наблюдает остановленный AME и отключённый idle auto-start.
Операторская декларация имеет TTL и привязку к процессу/intent; это prerequisite,
а не native proof и не execution authority. Настройки пользователя молча не меняются.

Возврат AE menu command означает dispatch, не очередь. Подтверждение в AME26
наблюдается единственным UI-контроллером по полной метке конкретной строки:
`proofSource:agent_ui_observed`, `nativeJobId:null`, `mediaVerified:false`,
`executionAuthority:false`. Прежняя receipt saved-source wrapper сюда не переносится.
Ни число строк, ни последняя строка, ни время появления не идентифицируют job.
Пользовательские задания не проверяются и не меняются. Завершённая приёмка не
пересчитывается после следующих добавлений; это история первого наблюдения.

Unknown/lost reply сначала сверяется по исходным run/command/intent и метке;
повторного dispatch нет. До точного восстановления имени новые automation
project mutations этого контекста удерживаются. Ручная работа пользователя не
блокируется; drift не перезаписывается автоматическим restore. UI-отчёт не снимает
UNKNOWN, не разрешает replay и не выдаёт capability.

Проверка файлов/кадров/видео не является приёмкой enqueue. Пользователь проверяет
будущий результат рендера отдельно; START/render этим workflow не разрешаются.

Экспериментальный per-title SaveAs/source producer остаётся frozen справочной историей:
[AME single-job source workflow](ame-single-job-workflow.md).

## Валидация реализации

- Focused smoke: 28 групп, включая настоящий ES3 wire, именованные свойства AE,
  истечение idle TTL до эффектов, partial setters, UNKNOWN/no replay, неизменный
  receipt, отсутствие AEP IO и сохранение checkpoint gates остальных tools.
- Окончательная версия прошла общий offline-цикл на 111 управляемых слоях/заданиях:
  те же 28 групп, 1340 ES3 wire parses, восемь вспомогательных слоёв сохранены.
  Последующая metadata-only маркировка samples проверена теми же 28 группами.
- Независимое read-only review: три замечания исправлены; delta review GO по
  зафиксированным SHA. Это проверка кода, а не live enqueue/media proof.
- `plan-classification-smoke` не прошёл infrastructure health своего isolated
  daemon; это не PASS и не acceptance. Повторов нет; пользовательский runtime сохранён.
- Следующий шаг — штатное применение, свежий native inspect, одна canary и затем
  повторение того же шага N. START/render и проверка будущего видео исключены.
- 19.10: commit `32850f1` штатно применён, bridge PID18332, native lifecycle read
  чистого проекта PASS. Первый inspect нашёл точный menu3800 (`26.2x49`, build49,
  `en_US`), но заблокировал rename: 80 выражений/11210 properties; текущий safe
  subset не распознаёт обычный `loopOutDuration` и literal ссылки на Color controller.
  До уточнения bounded expression proof enqueue не выполнялся; START/render 0.
- `dd83b33` штатно применён; connected_idle и чистый lifecycle read PASS. Второй
  readonly inspect завершился `ae_execution_failed` внутри scanner: `undefined is
  not an object`, command `96293b2a…`. Intent/dispatch не создавались; это известный
  failed read, без replay/UNKNOWN и без live-приёмки. Нужна bounded диагностика места.
- `f7c7f0c` применён: readonly диагностика указала parser `take`, original line131,
  слой oldtext/`loopOutDuration`. Nullable/EOF проверки разделены на последовательные
  guards; невозможное внутреннее состояние fail-closed. Focused32/372 actual ES3
  parses, rules/syntax/scoped diff PASS. Причина actual AE ещё требует read-back;
  enqueue/START/render 0. Whitelist и authority не расширялись.
- `2b160ae` применён: actual AE inspect PASS — 80 expressions, 5 unique, 11229
  properties, 9 comps, risks0. Первая canary `cd4ac9f9…`/`ce4139fe…` отказала
  до setters/menu (`ame_open_native_baseline_or_menu_changed`). Exact reconcile
  подтвердил applied0/dispatchfalse/noEffectProven/debt0; прежний UNKNOWN не переписан.
  Обе transport observations полностью совпадают; numeric roundtrip исследуется.
  Ни одного нового задания/START/render; неизвестная отправка не повторялась.
- Numeric delta: display numbers проходят native `Number(String(raw))` с finite/
  fixed-point проверкой; дробные raw свойства дополнительно связаны точной
  `toPrecision(17)` identity с обратной проверкой. Integer IDs/revision не округляются.
  Полное сравнение, post-set preservation, reconcile и restore сохраняют identity;
  epsilon не применяется. Focused35/406 actual ES3 parses PASS, включая lossy wire,
  sub-wire drift до dispatch/restore и после marker, отказ без новых effects.
  Это offline-воспроизведение; причинность старого live refusal остаётся гипотезой.
- Numeric delta review GO по frozen native55238f45/coref9b13bf1/smoked0165068;
  root offline `--series=111`:35 groups/1486 actual ES3 parses PASS, без Adobe/network.
  Прямой node без configured `--expose-internals` остановился при require Acorn;
  корректный configured runner прошёл. Live доказательство этим не подменяется.
- `1aff3c7` применён: readonly numeric identity refused до intent/effects.
  Diagnostic-only delta36/410 ES3 PASS добавляет bounded parseable path/raw/exact/
  parsed/stage в исходный отказ; representation/equal/gates сохранены.
