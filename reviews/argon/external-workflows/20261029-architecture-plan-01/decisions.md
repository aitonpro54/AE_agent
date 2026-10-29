# Локальное решение и открытая консультация

29 октября 2026, source snapshot `70b340f6e7ecca81673c193a738fd741b43b3306`.

## Внешний результат

Запрос отправлен; внешний ответ не получен из-за `Debugger unattached` после тайм-аутов чтения. `response.txt` отсутствует, verdict и findings отсутствуют. Отправка не повторяется. Ниже собственные решения по локальному source analysis и первичным web sources, не triage выдуманных findings Argon.

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

После восстановления browser connection существующий controller читает тот же ответ по receipt URL без нового send/upload и сохраняет raw текст/hash/bindings. Только после этого возможен честный triage внешних findings. Независимо от консультации следующий предлагаемый engineering scope — договориться о bounded Titles pilot; текущий запрос реализации не включает.
