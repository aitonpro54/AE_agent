# Локальное решение и открытая консультация

29 октября 2026, source snapshot `70b340f6e7ecca81673c193a738fd741b43b3306`.

## Внешний результат

Исторически получение было заблокировано `Debugger unattached`. При продолжении по прямому поручению пользователя штатное чтение восстановилось; ответ получен без новых uploads/sends. Verdict `revise` по плану при поддержке стратегического направления. Raw response60181байт, SHA-256 `e97cb0c2d560a38ea6c60f1fde14d5d982c573548fa42f0c439f294c710d266c`; bindings совпали. Первоначальные локальные рекомендации ниже дополнены разбором реальных findings.

## Принятые для рекомендации положения

1. Внешние workflow/compiler-пакеты разумны и соответствуют intent Core4. Legacy source показывает реальную предметную связанность; Core4 уже содержит generic ingress и server-owned proposal.
2. Workflow, capability и runtime имеют разные обязанности и версии. Вынесение workflow не требует немедленно вводить независимый installer capabilities.
3. Первый пример — ограниченный Titles compiler поверх существующей current-target capability, без нового broker и без обещания полного титровального продукта. Runtime operations остаются у уже подключённого sole MCP controller.
4. Core runtime сейчас привязан к lifetime stdio-клиента. Многоклиентское attach — отдельная будущая задача; CEP HTTP peer не использовать вместо публичного клиентского API.
5. Публичные проекты Kumo/23d1 полезны для сравнительного исследования, Nexrender/Templater/Automation Blocks — для предметных workflows. По чтению README нельзя доказать эквивалентность их гарантий нашему UNKNOWN/ownership контракту.
6. Adobe UXP roadmap усиливает довод отделить продуктовую логику от CEP. Миграция transport и готовность UXP установленного AE не входят в этот запрос.

## Evidence и пробелы

- Точные source ranges и SHA-256: `source-excerpts.md`; расхождения proposal/client authority: broker.js:148–200; текущая installed closure: stdio-entry.js:30–63.
- Дополнительная локальная проверка после отправки: stdio-entry.js:167,185,197; core/stdio.js:38; core/state-lock.js:25–37; tools/install-core4.js:71,244. Это обоснование single-owner pilot, не новая внешняя отправка.
- Нет live-проверки внешнего workflow, independently installed capabilities, multi-client access или двухмашинного round-trip. Технические возможности VideoScout по исходникам не исследованы; это организационная аналогия из вопроса пользователя.
- Полный вывод: `docs/external-workflows-research-20261029.md` относительно корня репозитория.

## Следующий шаг

Получение завершено. Следующий предлагаемый engineering scope — bounded Titles pilot через существующий sole MCP controller; текущий запрос реализации не включает.

## Локальный разбор Argon

Проверено на source70b340f6 и текущем HEAD7d951c8: между ними исследованный runtime-код не менялся, добавлены документы. Статусы ниже относятся к отдельным утверждениям; отсутствие live proof не закрывается source review.

| ID | Внешний → локальный приоритет | Статус и evidence | Новизна / следующий шаг |
| --- | --- | --- | --- |
| F-01 | P1 → P2 для текущего pilot: fixed composition уже известна, внешний compiler её не меняет | Подтверждена связанность packageHash с transport и inspection contract (`stdio-entry.js:164,175`), fixed IDs:34–49; уже учтён known-open в docs/core-installed-composition.md:44–48. Универсальная формулировка «любое обновление ломает живой план» не доказана: runtime читает immutable release, смена установки имеет отдельные gates; :175 относится к inspection contractId, а не ко всем module contracts. | known; самостоятельный контракт независимого обновления capability. Не удалять package/peer bindings без модели совместимости и проверки UNKNOWN. Не блокирует изменение чистого внешнего compiler. |
| F-02 | P1 → P3: вывод о необходимости удаления worker не подтверждён | Подтверждено, что нынешние titles/titles-current-target builders делают validation и expectedBindings, photo — binding (`modules/*/implementation.js:2–5`). `broker.js:156–181` контролирует desired inputs и server evidence. Это не доказательство ошибочности изолированного builder seam или выигрыша от удаления worker. | new suggestion; сохранить текущий seam для pilot, оптимизация по измерениям отдельно. |
| F-03 | P1 → P2: известный migration gap | Подтверждены legacy50/Core16 (`slideshow-plan-builder.js:7`, `broker.js:169`). Уже учтён в исходном context.md до review. В appendEvent6+N мутаций и6+N audits, не7+N мутаций, как в одном пункте ответа. N3 даёт18steps, с2prelude20. Простая копия несовместима; неизвестно, что все audits можно удалить без потери семантики. | known; capability mapping, bounded stages и сохранение всех postconditions до реализации slideshow. |
| F-04 | P2 → P2 | Подтверждено различие catalog3/physical assets inspection+current-target (`stdio-entry.js:34,47–49,157–174`). Уже учтён known-open в исходном context.md. Это ограничение выбранного manual пути с automaticLifecycle unavailable, а не доказанный непреднамеренный runtime defect. | known; discovery должен честно показывать availability; новые capabilities — отдельный допуск/приёмка. Live probe для консультации не требуется. |
| F-05 | P2 → P2 | Подтверждён узкий single-line/uniform Source Text контракт (`titles/executor.jsx:14,28–41`, current-target implementation:3). Уже учтён как протокольный pilot, не полный продукт. «90% проектов», обязательность поддержки всех анимированных слоёв и достаточность сохранения стиля первого символа не доказаны; animation Source Text не тождественна любой layer animation. | known + unsupported estimates; определить реальные шаблоны/требования, затем ограниченный новый contract. Не ослаблять style guarantees вслепую. |
| F-06 | P2 → P3 для integration guidance | Подтверждён TTL5000 (`broker.js:357`). Гипотеза о native confirm между dry-run и run не подтверждается: confirm в `titles-current-target/executor.jsx:54` уже внутри mutate; `manual-policy.js:13–23` регистрирует/авторизует доставку, без UI confirm. | new guidance; без медленной подготовки между dry-run/run. Proposal review может предшествовать dry-run, native confirm остаётся в AE. Не объединять два API вызова под выдуманной транзакционной атомарностью. |
| F-07 | P3 → P3 | Принято как упрощение рекомендации: существующие stdio tools:5 и JSON schemas достаточны для первого внешнего compiler. Отдельные repo/SDK не обязательны; заявленные «50 строк», «1–2 дня», «100% изоляция папкой» не измерены. | new clarification; pilot вне core4 в том же repo допустим; организация repos определяется независимым выпуском, а не запретом отдельных проектов. |

## Дополнительные коррекции внешних рекомендаций

- Runtime stdio принадлежит одному владельцу. Формулировка Argon «CLI общается stdio» не означает готового attach к уже запущенному broker: начальный CLI только компилирует, команды отправляет текущий MCP controller. Факты: stdio-entry.js:167,185,197; state-lock.js:25–37.
- Capability implementation/executor могут принадлежать отдельному пакету; нельзя превращать Core в каталог всех предметных handlers только переименованием modules.
- Предлагаемые macro операции (clone+retime+rewrite и batches) ещё не спроектированы и не проверены. Снижение числа steps не доказывает bounded failure, ownership и read-back каждого эффекта.
- Сторонние MCP и оценки затрат не подвергались независимому аудиту. Вывод — нет достаточного основания менять Core сейчас, без универсального утверждения «аналогов гарантий не существует».
- Обязательный десктоп↔MSI round-trip остаётся критерием проекта; отказ от немедленного marketplace/hot-swap не отменяет переносимость.

## Окончательное решение по консультации

Принять как рекомендацию: независимые workflow-продукты + общий Core + отдельно допускаемые capabilities. Скорректировать путь: один внешний Titles compiler поверх нынешнего API, затем уточнение реального титровального контракта и перенос slideshow. Не вводить SDK/MCP/массовое разделение repos заранее. Исправления authority/identity/worker по одному совету Argon не выполнять. Реализация и новая установка остаются отдельным scope, повторного review нет.
