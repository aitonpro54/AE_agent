# Core 4.0.0: ограниченный pilot Graphify

Статус: оценка для будущей разработки, 26 октября 2026. Установка, hooks, skills, MCP, watchers и отправка исходников не выполнялись. Graphify не входит в runtime, startup prerequisites или обязательный маршрут локальной проверки Core.

## Что проверено

Официальный [репозиторий Graphify](https://github.com/Graphify-Labs/graphify) описывает локальный AST-разбор кода без LLM; семантические проходы по документам и media имеют другой маршрут. Pilot допускает только code/AST и не должен вызывать модель для labels/обобщений.

У GitHub default branch сейчас `v8`: просмотренный snapshot `92741d162b2094ffc2fed58cfbd8ee823e9da62c`, `pyproject.toml` указывает `0.9.95`. В [engine.py:3880](https://github.com/Graphify-Labs/graphify/blob/92741d162b2094ffc2fed58cfbd8ee823e9da62c/graphify/extractors/engine.py#L3880) есть обработчик literal CommonJS require; [resolution.py:36](https://github.com/Graphify-Labs/graphify/blob/92741d162b2094ffc2fed58cfbd8ee823e9da62c/graphify/extractors/resolution.py#L36) включает `.cjs` среди разрешаемых extensions. Это подтверждает пригодность для части JS-связей, но не исполнение условных импортов и не полноту графа.

В просмотренном [Codex incremental runbook:67](https://github.com/Graphify-Labs/graphify/blob/92741d162b2094ffc2fed58cfbd8ee823e9da62c/graphify/skills/codex/references/update.md#L67) `.cjs` отсутствует в `code_exts`. Значит, поддержка resolver не гарантирует выбор code-only маршрута для изменения `.cjs`. Старый `main` snapshot `91f4d120b630ee35c79bf3c75ccd186870a808f9` вообще имеет другую версию (`0.1.14`); смешивать его инструкции с v8 нельзя. Эти факты получены чтением опубликованных исходников, не запуском инструмента.

## Небольшой будущий эксперимент

1. Зафиксировать одну проверенную revision, версии Python/CLI и точный AST-only entrypoint. Использовать отдельную временную папку и allowlist кода; исключить runtime/config/credentials/БД, документацию и media. Никакой регистрации skills/hooks или облачного backend. Если отсутствие сетевой отправки нельзя подтвердить, остановить pilot.
2. Взять 10 заранее перечисленных literal relative require из `bridge-daemon.js` и `core-tool-dispatch.js` вместе с их необходимыми целевыми файлами; добавить две `.cjs` fixture-связи. Добавить negative controls: dynamic require и переход JS→PowerShell/CEP. Список и ожидаемые edges записать до запуска.
3. Проверить 12/12 положительных рёбер с file:line, отсутствие ложного утверждения «связей нет» для negative controls. Сравнить с адресным `rg`/явной module dependency картой. После изменения одной `.cjs` проверить отсутствие LLM и отсутствие старых semantic sidecars в результате. Время/объём контекста записать как наблюдения, без обещанного процента экономии.
4. Отдельно отметить неразрешённые связи, conditional vs actually loaded imports и межъязыковые переходы. При полезном результате сохранить graph как необязательный индекс с source revision и freshness; при пропусках использовать fallback к явным contracts/поиску, без изменения startup Core.

Граф помогает выбирать контекст и находить кандидатов обратных зависимостей. Владельцев файлов, public contracts и причины включения тестов определяет явная карта из [архитектуры](core-4.0.0-architecture.md); Graphify не выдаёт authority и не является доказательством полноты этой карты.
