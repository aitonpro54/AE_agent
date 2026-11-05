# Внешние workflow-продукты: первый пакет Titles

**5 ноября:** пользователь возобновил Titles на Core 4.1.0. Текущий этап —
[T2 на тестовом стенде](titles-live-20261029.md#5-ноября-titles-на-core-410).
Нативная проверка Slideshow остаётся отложенной.

**Приоритет 30 октября:** по прямому поручению пользователя сначала
[устойчивый запуск и восстановление Core/CEP](core-cep-lifecycle-20261030.md).
Titles остаётся проверочным сценарием этого этапа. Новые функции Titles/C1b/S1
следуют после него; завершённые T1/C1a сохраняются.

29 октября 2026. Пользователь принял [архитектурную рекомендацию](../docs/external-workflows-research-20261029.md): скорректировать план и начать отдельный Titles-пакет. Переносимость проверяется в конце. База начала — `1de46da`; исходники Core4 и действующая установка сохраняются.

## Принятая граница

1. **Продукты** (`products/`): задание, шаблоны, правила подготовки материалов/текста, compiler плана, инструкции и проверка пользовательского результата. Собственный цикл изменения и проверки.
2. **Пакеты операций AE**: ограниченные typed inspect/mutate/verify, server builders, executor и предметные guards. Исполняются только через допущенный артефакт и Core. Полноценный Titles/Slideshow не помещается в этот слой целиком.
3. **Core и host adapter**: соединение, единственный контроллер, допуск, очередь, ownership, receipts, checkpoints, UNKNOWN/fences и reconciliation. Продукт не получает transport credentials и не запускает второй broker.

Новый шаблон/правило подготовки текста не требует изменения Core/CEP. Новый привилегированный executor требует отдельного допуска и адресных проверок. Независимая установка таких executors ещё не реализована; папка вне Core сама по себе её не создаёт. Server build, optional engine, worker и native confirm сохраняются.

## Очерёдность

| Этап | Результат и приёмка |
| --- | --- |
| T1 — внешний Titles pilot | `products/titles/`: инструкция, JSON-схема задания, pure compiler/CLI, пример и offline tests. Одно изменение текста существующего слоя через `titles-current-target`; реальный Broker принимает сформированный build в temp/VM, выдуманная evidence отклоняется сервером. Core/CEP bytes unchanged |
| T2 — применимость Titles | Уточнить реальные шаблоны/требования и выполнить ограниченный live-сценарий на явно выбранной цели при fresh inspection/proposal/dry-run/native confirmation/read-back. Не обещать полную типографику по результату одного setter |
| C1 — поставка операций | Закрыть standalone installer closure gap, затем отдельный контракт независимой установки/admission/обновления capabilities. Не удалять package pins или guards ради формальной независимости |
| S1 — внешний Slideshow | Сопоставить legacy действия с capabilities и стадиями; сохранить source-comp protection, ownership, timing, audits и partial-success/recovery. Затем переносить по одному рабочему сценарию |
| Дальнейшие продукты | Montage, визуальная проверка, экспорт и другие функции — по реальному заказу и отдельному scope. Собственный MCP/SDK/multi-client IPC только при доказанной потребности |
| Финал — переносимость и выпуск | После выбранного функционального состава — фактический десктоп→MSI→десктоп round-trip, P1–P8 и явно назначенная полная приёмка выпуска. До этого переносимость остаётся открытым критерием, не блокирует разработку T1/T2/C1/S1 |

Переносимые исходники и отсутствие hostname/path branches сохраняются при разработке сейчас. Финальная проверка переносимости не переносит credentials, authority и незавершённое исполнение между машинами.

## T1: ограниченный контракт

Вход — явная цель `{projectId, compId, layerId}` и одна непустая строка нового текста. Изменяется существующий статичный однородно оформленный Source Text в пределах действующего контракта; создание слоёв, multiline/mixed styles, анимация Source Text, batch, save и render не входят.

Compiler готовит намерение и preview без AE. Следующий отдельный шаг использует ответы текущего `get_module_contract` и `inspect_module_target` для формирования payload `build_solution_plan({oneStep:true,...})`. Ожидания прежнего текста/revision формирует server builder из собственной evidence. Клиентские JSON и их хеши не являются authority; Core обязан сам проверить ссылки и цель. Новый task/job ID не снимает прежний UNKNOWN.

CLI только читает явно переданные файлы и выдаёт JSON. Без runtime discovery, spawn, сетевого доступа, установки и автоматического propose/run. Текущий MCP-контроллер остаётся единственным отправителем. Обычный заказ получает `user_work/work_context`; fixtures — test-owned temp с явно указанным покрытием.

## Progress

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
