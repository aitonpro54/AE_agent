# Внешние workflow-продукты: первый пакет Titles

**5 ноября:** на MSI подтверждён [T2 на тестовом стенде](titles-live-20261029.md#5-ноября-titles-на-core-410)
и реализован [C1b для первой операции](core-capability-supply-c1b-20261105.md).
Нативная проверка Slideshow остаётся отложенной. Десктоп использован для сверки
наследия. Перенос сборки оставлен на отдельный этап.

Для развития вёрстки используем [сводный пакет Titles](../docs/titles-consolidated-package-20261105.md)
из десктопного коммита `d4b29fe` и [каталог исходников и проверок](../docs/titles-legacy-inventory-20261105.md).
На MSI пройдены T2, автономный T3a и нативный T3b на собственном стенде.

**Приоритет 30 октября:** по прямому поручению пользователя сначала
[устойчивый запуск и восстановление Core/CEP](core-cep-lifecycle-20261030.md).
Titles остаётся проверочным сценарием этого этапа. Новые функции Titles/C1b/S1
следуют после него; завершённые T1/C1a сохраняются.

29 октября 2026. Пользователь принял [архитектурную рекомендацию](../docs/external-workflows-research-20261029.md): скорректировать план и начать отдельный Titles-пакет. Переносимость проверяется в конце. База начала — `1de46da`; исходники Core4 и действующая установка сохраняются.

## Принятая граница

1. **Продукты** (`products/`): задание, шаблоны, правила подготовки материалов/текста, compiler плана, инструкции и проверка пользовательского результата. Собственный цикл изменения и проверки.
2. **Пакеты операций AE**: ограниченные typed inspect/mutate/verify, server builders, executor и предметные guards. Исполняются только через допущенный артефакт и Core. Полноценный Titles/Slideshow не помещается в этот слой целиком.
3. **Core и host adapter**: соединение, единственный контроллер, допуск, очередь, ownership, receipts, checkpoints, UNKNOWN/fences и reconciliation. Продукт не получает transport credentials и не запускает второй broker.

Новые правила подготовки текста живут в продукте. Новый привилегированный executor требует отдельного допуска и адресных проверок. C1b упаковывает отдельно только действующую операцию `titles-current-target`. Server build, optional engine, worker и native confirm сохраняются.

## Очерёдность

| Этап | Результат и приёмка |
| --- | --- |
| T1 — внешний Titles pilot | `products/titles/`: инструкция, JSON-схема задания, pure compiler/CLI, пример и offline tests. Одно изменение текста существующего слоя через `titles-current-target`; реальный Broker принимает сформированный build в temp/VM, выдуманная evidence отклоняется сервером. Core/CEP bytes unchanged |
| T2 — применимость Titles | Уточнить реальные шаблоны/требования и выполнить ограниченный live-сценарий на явно выбранной цели при fresh inspection/proposal/dry-run/native confirmation/read-back. Не обещать полную типографику по результату одного setter |
| C1 — поставка операций | Закрыть standalone installer closure gap, затем отдельный контракт независимой установки/admission/обновления capabilities. Не удалять package pins или guards ради формальной независимости |
| T3 — многострочный титр в рамке | T3a готовит рубрики и варианты, рассчитывает placement по переданным метрикам. T3b получает замеры AE и применяет выбранный вариант через отдельную typed операцию. Приёмка на MSI включает исходный receipt, свежий read-back и фактический кадр |
| S1 — внешний Slideshow | Сопоставить legacy действия с capabilities и стадиями; сохранить source-comp protection, ownership, timing, audits и partial-success/recovery. Затем переносить по одному рабочему сценарию |
| Дальнейшие продукты | Montage, визуальная проверка, экспорт и другие функции — по реальному заказу и отдельному scope. Собственный MCP/SDK/multi-client IPC только при доказанной потребности |
| Финал — переносимость и выпуск | После выбранного функционального состава — фактический десктоп→MSI→десктоп round-trip, P1–P8 и явно назначенная полная приёмка выпуска. До этого переносимость остаётся открытым критерием, не блокирует разработку T1/T2/C1/S1 |

Переносимые исходники и отсутствие hostname/path branches сохраняются при разработке сейчас. Финальная проверка переносимости не переносит credentials, authority и незавершённое исполнение между машинами.

## T1: ограниченный контракт

Вход — явная цель `{projectId, compId, layerId}` и одна непустая строка нового текста. Изменяется существующий статичный однородно оформленный Source Text в пределах действующего контракта; создание слоёв, multiline/mixed styles, анимация Source Text, batch, save и render не входят.

Compiler готовит намерение и preview без AE. Следующий отдельный шаг использует ответы текущего `get_module_contract` и `inspect_module_target` для формирования payload `build_solution_plan({oneStep:true,...})`. Ожидания прежнего текста/revision формирует server builder из собственной evidence. Клиентские JSON и их хеши не являются authority; Core обязан сам проверить ссылки и цель. Новый task/job ID не снимает прежний UNKNOWN.

CLI только читает явно переданные файлы и выдаёт JSON. Без runtime discovery, spawn, сетевого доступа, установки и автоматического propose/run. Текущий MCP-контроллер остаётся единственным отправителем. Обычный заказ получает `user_work/work_context`; fixtures — test-owned temp с явно указанным покрытием.

## T3. Многострочный титр в рамке

1. **Продукт.** `prepare-layout` разбирает один титр в заданном порядке рубрик,
   сохраняет исходный текст и отдаёт базовый вариант и ограниченный набор
   переносов. `fit-layout` принимает прямоугольники кандидатов из одного
   контекста и рассчитывает равномерный scale и position. Оба шага доступны
   через внешний CLI. [Задание и форматы](../products/titles/README.md#подготовка-одного-многострочного-титра).
2. **Измерение в AE.** Первый срез — статичный однородный 2D point text без
   родителя, поворота, масок, эффектов и текстовых аниматоров. Нужны exact
   project/comp/layer, ревизия, кадр, anchor, фактический шрифт и стиль. На
   собственном стенде закрепить отдельную измерительную цель. Запись кандидатов
   в неё идёт как ограниченная мутация с подтверждением, исходным snapshot,
   восстановлением и проверкой состояния. Замеры связываются с `layoutId`,
   фактическими строками и одной подтверждённой ревизией измерения. Начальная
   калибровка сверяет bounds и координаты базовых линий. Учёт обводки требуется
   доказать отдельно перед включением такого профиля. [Границы слоя](https://helpx.adobe.com/after-effects/desktop/work-with-expressions/expression-language-reference/expression-language-reference.html) · [Базовые линии текста](https://helpx.adobe.com/after-effects/desktop/add-text/create-and-edit-text-layers/creating-editing-text-layers.html).
3. **Применение и проверка.** Выбранные строки, равномерный scale и position
   применяются одной типизированной операцией к одной точной цели с сохранением
   anchor и заявленного стиля. Core разрешает только свой результат измерения и
   свежую ревизию цели, проводит штатные proposal, dry-run и подтверждение.
   Receipt и свежий read-back подтверждают текст, стиль, transform и bounds.
   На том же кадре отдельно смотрим читаемость, переносы и отсутствие обрезания.
   Смена цели, неподдерживаемая геометрия или неопределённый результат ведут к
   отказу либо штатному recovery без повторной записи. Сборка и проверка MSI идут
   первыми, перенос на десктоп — отдельный этап.

## Progress

- [x] T3a на MSI: из сводного пакета выделены разбор рубрик, ограниченные
  переносы, локальный override и чистый fit по замерам. CLI `prepare-layout` и
  `fit-layout`, схема и синтетический пример доступны в `products/titles/`.
- [x] T3b source/VM: `titles-point-layout`, opt-in `manual-layout`, две команды
  внешнего CLI и настоящий Broker → HTTP → CEP dispatcher → JSX в TEMP/VM.
  Нативное чтение скрытого и видимого point-text слоёв подтвердило профиль
  на собственной композиции MSI.
- [x] T3b native: штатная установка и нативная приёмка на MSI. Сверены receipts,
  fresh read-back и кадр на стенде. [Итог](#t3b-нативная-приёмка-на-msi).

- 30 октября: новый controller `01a18b19…` выявил автоматический захват полосы
  прежним idle чатом и закрытый AE. Адресный stopped recovery завершён с новой
  adoption AE6492 и новой test-copy исходного fixture; изменённый вчерашний AEP
  сохранён. TEMP21/21PASS, signed16events/установка/AEP unchanged, mutation0.
  Точные bindings и следующий configured reconnect — в [T2](titles-live-20261029.md).

- 29 октября, новое поручение пользователя разрешает T2 live на тестовом проекте
  и продолжение плана. Текущий root controller ведёт [T2 evidence/maintenance](titles-live-20261029.md);
  отдельный writer закрывает C1 standalone closure только offline/source.
- T2 continuation: в новом controller чате восстановлены configured tools;
  адресное stopped retirement двух orphan owner-markers выполнено после
 23/23 TEMP tests.16settled events,host adoption,test AEP и installation bytes
  сохранены. Compiler job готов; native mutation ещё0. Полный read-back T2
  остаётся следующим шагом после штатного возобновления runtime.
- [x] C1a standalone closure: штатный builder/entry реализован, missing lazy
  disposition preflight включён в exact helper closure. Реальные TEMP apply
  manual/readonly и signed-history guards PASS; итог7/7 standalone +5/5 routing.
  Независимый review P2 ancestor-junction и P3 bounded-read исправлены локально,
  адресные regressions2/2 PASS. [Отчёт и CLI](../docs/core-standalone-closure-20261029.md).
  Installed runtime/существующие dist неизменны; independent capabilities — C1b.

- [x] Принято решение пользователя о трёх уровнях и финальном этапе переносимости.
- [x] Проверены существующие build/oneStep/module/recordContext контракты; изменение runtime для pilot не требуется.
- [x] T1: реализован внешний пакет и пример: `products/titles/`, версия0.1.0,
  API `compile(job)` и `prepareBuild(job,contract,inspection)`, CLI, schema,
  публичный compatibility profile и русские README/WORKFLOW.
- [x] T1:8/8 адресных offline tests PASS, включая настоящий Broker с текущим
  executor в TEMP/VM. CLI пример PASS, Core/CEP/legacy283tracked files unchanged.
- [x] T1: независимое read-only review выполнено; два замечания исправлены
  и подтверждены root повторным адресным suite. Milestone сохраняется отдельным
  commit после plan commit `4929d73`.
- [ ] T2/C1/S1 и финальная переносимость — последующие самостоятельные этапы.

## Decision Log

- T3a использует явный порядок рубрик для двух подтверждённых форматов. Длинное
  название без кавычек допустимо. Порядок с названием перед автором, разбор пачки
  и машинные настройки старых шаблонов оставлены для отдельных задач.
- Размеры рамки, регистр названия, отступ и пределы масштаба задаёт задание.
  Стабильный порядок удерживает базовую разбивку при равном масштабе. Выход fit
  описывает геометрию по переданным метрикам. Он не содержит Core evidence refs.
- `titles-current-target` ограничен одной строкой. T3b получает отдельный typed
  контракт и проверку допуска для своего executor и receipt.
- Операция T3b использует две отдельные подтверждаемые команды одной задачи.
  Первая временно записывает варианты на скрытом слое и восстанавливает его.
  Вторая получает команду замера из ledger Core и проверяет её привязку к
  задаче, кадру, слою, профилю и текущему экземпляру AE. Продукт выбирает
  вариант, Core проверяет размещение и нативный read-back.
- В первом профиле действует только заливка. Отсутствующий цвет выключенной
  обводки фиксируется как недоступный. Для нативного 2D слоя принимаются XY и
  XYZ с нейтральным Z, размерность исходных свойств сохраняется. Штатная
  композиция `manual` сохраняет прежний каталог и `titles-current-target`.

- C1a — отдельный packaging adapter с обязательными явными absolute destination
  bindings. Он использует стандартный plan/apply/lease/CAS и не выдаёт authority.
  Semantic format1 history в tests не объявляется exact historical f548.
  Проверка7/7 после локальных review fixes; boundaries28PASS — исторический
  результат до этих fixes, full release/current broad closure не заявлены.

- Новый Argon review не запрашивается: существующий единственный review и локальный разбор уже покрыли выбранное направление. Рекомендация не заменяет технические проверки реализации.
- Первый pilot находится в том же repo вне `core4/`; выделение репозитория и SDK не является условием начала.
- Пользователь разрешил разработку Titles. Этот блок не создаёт пользовательский AEP, не запускает live mutation ради демонстрации и не меняет установленный runtime.
- Compatibility profile закрепляет известные public contract и module pin;
  opaque contractId/admissionPin берутся из ответа Core. Локальная совместимость
  не доказывает происхождение или свежесть экспортного JSON.
- Интеграционный test сначала проверяет отказ на synthetic inspection, затем
  явно меняет только недоверенную экспортную metadata на false для проверки
  production-формы adapter. Server evidence остаётся synthetic. Настоящий Broker
  принимает build, сам добавляет expected fields и отвергает выдуманный ref;
  это не production authority, live mutation или проверка lifecycle.
- Review P2: массив с hex reference проходил RegExp coercion — добавлен строгий
  string guard и адресный regression. Review P3: тестовый build имел user_work —
  fixture теперь явно сохраняет technical_check/ephemeral_check; product default
  user_work/work_context проверяется отдельно и сохранён.

## Validation

- T3a: `node --test` из `products/titles` — **18/18 PASS** на MSI. Восемь
  прежних проверок включают текущий Broker в VM. Десять новых покрывают разбор,
  сохранность текста, переносы, двумерный fit, исходный anchor, устаревшие и
  неполные замеры и CLI из другого рабочего каталога. CLI-пример — 14 вариантов.
  Отдельный большой Unicode-вход 750 UTF-16 units — 19 вариантов, 49 345 байт
  JSON при лимите 65 536. Этот прогон использует синтетические замеры.
- T3b: проверка TEMP/VM покрывает замер и применение, отказ для чужого receipt
  и подмены текста/позиции, отмену, дрейф после подтверждения, восстановление
  скрытого слоя при ошибке и сохранение UNKNOWN. Native preflight на MSI
  подтвердил обе роли, размеры `618.934 × 68.146` px и одну базовую линию
  для исходного `LAYOUT BASE`. Скрытый слой 27, видимый слой 26, comp 14.
- Финальный адресный прогон исходников и VM — **139/139 PASS**, включая
  продукт, Core, CEP transport, прежние Titles и новый `point-layout`.
  Проверка границ — 57 файлов. Сборка повторно дала hash установленного
  `manual-layout/owner`. Дополнительный широкий прогон stopped-update остановлен
  после 17 завершённых сценариев PASS, включая C1b, update и enable. Полное
  прохождение этой матрицы отдельно не заявляется.

Начальный preflight: исходники модуля, generic Broker build и recordContext прочитаны;
дерево до этапа содержало только посторонний untracked `.codex-attachments/`.

- `npm.cmd --prefix products/titles test`: **8/8 PASS**,0fail; root952.5818ms.
  Проверены strict fields/types/budgets, Unicode/whitespace, deterministic preview,
  oneStep payload, compatibility/ref/target mismatch, CLI без записей, production
  import closure, actual Broker guards и сохранение temp ledger после удаления
  отдельной test-owned копии продукта. Нативные вызовы0, installed changes0.
- `node products/titles/cli.js compile --job products/titles/examples/single-title.json`:
  PASS. Пример содержит демонстрационную цель, не предназначен для отправки в AE.
- Root baseline283files и validation в ignored
  `snapshots/titles-product/20261029/`; source Core/CEP/legacy bytes сохранены.
- Локальные ссылки документов и `git diff --check`: PASS. Core4/full release
  suites не запускались: Core4 не менялся; тестируется фактически новый продукт.

## T3b. Нативная приёмка на MSI

- Пакет `01f21c77510314d930cbff4fc414f2c33f5548e2896b39951a7d161b5ab715e2`
  (86 файлов) и standalone `d4266205423aeab7361cfce5f5ba772699fb0018c15fe705c3d42b2724fc4eac`
  (104 файла). Стандартное stopped update `bfb4ebe6-bb2e-4b2f-b660-6d5acd406804`
  и отдельный enable завершены после stop `c26e7572-370d-4905-b303-dbf3785e2a06`.
  Сохранены installation ID, исходный origin и префиксы receiver 33→59 и ledger
  22→52. Текущий клиент взят из изменённой штатным установщиком конфигурации,
  Origin `file://`, AE `26.3x87`. Панель один раз закрыта и открыта после обновления.
  MCP-клиент исходного чата сохранил старый binding и вернул `owner_unavailable`.
  Подтверждение установлено свежим клиентом из действующей конфигурации.
- На собственном AEP подготовлена отдельная композиция `Core4 Titles T3 Test`
  (ID 14). В одной задаче `task-c864218a-dbfb-49ab-9787-67cd073ffcb8` выполнены
  две команды. Замер `command-414b5bc8-9d87-4ba6-bc1a-5da80a09c172` измерил 14
  вариантов на скрытом слое 27, а свежий snapshot слоя совпал с исходным.
  Применение `command-f17db9b3-af49-41e9-8036-9c7dafe9e616` изменило один видимый
  слой 26. У обеих команд один исходный begin и complete, совпали checkpoint,
  preimage digest, proposal и повторное чтение. Прежний T2 comp 1/layer 13
  совпал с исходным snapshot.
- В кадре `00:00:01:00` выбран `alternative-4`, пять читаемых строк, ArialMT 92 px
  и scale 100%. Габариты на композиции `1428.02 × 522.82` внутри рамки
  `1600 × 680` px. Отступы `85.99` px по горизонтали и `78.59` px по вертикали.
  Исходный вариант имел ширину `2756.36` px. Кадр открыт в AE, управление
  освобождено, holder/pending/UNKNOWN/fault отсутствуют.
- AEP на диске сохранил SHA-256 `b6eaea7e0b3621af4580357816ea785e4ba776ae9d83bc3439a833563fb347e5`.
  Результат находится в памяти AE. Снимок `native-frame.jpg`, сводка
  `native-proof-summary.json` и отдельные исходные ответы сохранены в ignored
  `snapshots/titles-t3-20261105/`. Диалог применения показывает переносы как
  `\u000a`. Прочитанный текст и композиция содержат фактические переносы.
- Нативная приёмка ограничена одним статичным point-text сценарием на MSI.
  Стили по ролям, активная обводка, другие шаблоны и переносимость десктопа
  остаются отдельными этапами.

## Продолжение / handoff T1

План принят в `4929d73`; реализация T1 идёт отдельным следующим commit. Изменены
только план/архитектурные документы и `products/`; установленный manual3f92,
credentials, authority и production receipts не затрагивались.

Следующий предметный этап T2: выбрать реальный поддержанный Titles-сценарий,
уточнить тексты/шаблоны и точную цель. Нужен уже сохранённый открытый AEP с
существующим подходящим слоем; пустой unsaved проект из предыдущего live-read
такой целью не является. Не сохранять/создавать пользовательский AEP ради
прохождения pilot. Далее действующий controller ведёт fresh inspection→build→
proposal→dry-run→native confirm→receipt/read-back. Полный типографический продукт,
independent capability install, Slideshow и финальная переносимость остаются
последующими этапами; T1 не объявляется их готовностью.
