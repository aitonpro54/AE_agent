# Контекст исследования и предварительный вывод

## Локальное чтение

Sol 6.1 XHigh исследовал границы исходников, Luna High — внешние первичные источники. Это роли, указанные metadata запуска, а не вывод из самоотчёта модели. Основной чат выполняет сводку и локальную проверку. Никаких live AE/UI операций, установок или запуска сторонних пакетов в исследовании нет.

Исходная база 3.3.5 внутри этого репозитория имеет startup imports предметных компонентов и ветвления общего runner по типам задач. Исторический внешний AE_agent не изменялся и не исследовался заново. В Core4 broker уже отделяет server evidence, module builder, proposal и execution authority. Внешний клиент может построить build request `steps` с `moduleId`, `contractId`, `evidenceRef`, `input`, `dependsOn`, `bindings`; сервер всё равно выбирает локальный admitted builder. Клиентский proposal или grant не становится доверенным объектом.

Core identity отделена от module identities. Однако installed wrapper проверяет точный набор модулей и весь выбранный release/registry. Составы readonly/manual существуют, а independent install/hot-swap произвольных модулей прямо отмечен как будущая работа. В source есть titles/photo fixtures, production registry покрывает project-inspection и titles-current-target, automatic lifecycle не доказан. Полное slideshow в Core4 catalog не перенесено. Не путать существующий wire ingress с готовой экосистемой SDK/plugins.

Главное предлагаемое различие: внешний workflow владеет задачей и компиляцией; небольшое runtime capability — конкретной допустимой операцией AE; Core — admission/transport/receipts и общими ограничениями ресурсов. Минимальный pilot сначала использует уже существующую titles-current-target capability. Вынос builder внутрь нового внешнего процесса ради одного pass-through не требуется; продуктовый compiler должен строить input существующего контракта.

Перенос slideshow не является копированием папки: legacy builder формирует template-specific newspaper stages до 50 прежних tool steps; Core4 build принимает до 16 module-contract steps. Потребуются соответствие возможностей, разделение стадий и сохранение audits/source fingerprints/ownership. Текущий text capability существенно уже полноценного титровального продукта.

## Первичные внешние источники, проверенные 29 октября 2026

Это факты из опубликованных документов и ограниченного чтения кода; независимых установок и live tests нет. Текущие ветки GitHub изменяемы, конкретные upstream commits не закреплены. Сторонние исходники не копируются в пакет; ниже краткие авторские сводки.

| Источник | Подтверждённое содержание | Значение для вопроса |
| --- | --- | --- |
| https://github.com/kumoproductions/mcp-aftereffects/blob/main/docs/TOOLS.md и https://github.com/kumoproductions/mcp-aftereffects/blob/main/CONTRIBUTING.md | 11 MCP tools, ae_catalog/ae_do и отдельный registry операций. Typed arguments, dryRun/batch и undo groups. eval.run выключен по умолчанию, включается AE_MCP_ENABLE_EVAL. MIT. | Полезный аналог небольшого generic API. Undo group не является доказательством rollback. TIMEOUT описан как retryable; эквивалент нашего UNKNOWN/no-replay и resource ownership в просмотренных документах не установлен. |
| https://github.com/23d1/after-effects-mcp и https://github.com/23d1/after-effects-mcp/blob/main/src/bridge.ts | MCP stdio, генерация JSX, AfterFX -r / Apple Events, typed tools и raw ae_run_script, сериализация bridge calls. MIT. | Более широкий каталог инструментов и альтернативный путь без CEP; гарантии recovery требуют отдельного сравнения. |
| https://github.com/Dakkshin/after-effects-mcp | MCP + опрашивающая ScriptUI-панель/ExtendScript. MIT. | Близкий класс community bridges; не найдено основание объявлять полную эквивалентность нашему runtime. |
| https://github.com/ku1x/after-effects-mcp-enhanced | Background ExtendScript bridge, готовые операции и execute-jsx; автор отмечает пробелы Windows live testing. MIT. | Дополнительный кандидат по охвату операций, не подтверждённая замена. |
| https://github.com/irfanabdulhameed/aftereffects-mcp и https://github.com/maaz997/after-effects-mcp | MCP с файловыми очередями, bridge handlers/batches/rigs либо JSON specs; MIT по README. | Примеры более высокого уровня поверх AE scripting, без нашего live аудита. |
| https://github.com/inlife/nexrender | Job JSON + assets/data substitution + aerender; server/workers и action plugins. Основной проект MIT, зависимости/plugins проверяются отдельно. | Отдельный продукт для template/batch render: хороший образец отделения задания от исполнения. Не interactive live-AEP MCP. |
| https://support.dataclay.com/templater/content/concepts/data/data_source.htm и https://support.dataclay.com/templater/content/home.htm | Коммерческий Templater: источники данных, шаблонные слои, Bot, event scripts, пакетное производство. | Предметный продукт над AE, а не замена общего безопасного транспорта. |
| https://aescripts.com/automation-blocks-for-after-effects/ | Коммерческий визуальный конструктор automation blocks, библиотека, JSX, HTTP/CEP triggers. | Пример переиспользуемых рабочих сценариев; не наш MCP authority contract. |
| https://github.com/Comfy-Org/docs/blob/main/basic-concepts/nodes.mdx | Core/custom nodes с inputs/outputs объединяются в workflow. | Полезны разделение workflow/capabilities и versioned dependencies. AE — изменяемый общий документ, поэтому модель execution/cache нельзя переносить автоматически. |
| https://helpx.adobe.com/ca/after-effects/desktop/automate-in-after-effects/automate-animation/scripts.html | Adobe документирует afterfx -r для выполнения скрипта в существующем экземпляре AE. | Возможен иной transport, но это не доказывает решение admission/UNKNOWN. |
| https://developer.adobe.com/after-effects/uxp/ и https://blog.developer.adobe.com/en/publish/2026/09/investing-in-the-future-of-creative-cloud-extensibility-uxp-comes-to-our-flagship-applications | Есть AE UXP API docs с beta caveat; Adobe анонсирует AE public beta by Nov2026 и прекращение CEP в новых версиях с декабря2029; ExtendScript не затронут этим переходом. | Дополнительный довод отделить domain от CEP. Не доказательство готового UXP на установленной версии и не поручение миграции сейчас. |

## Что предлагается проверить в pilot

Внешний пакет в отдельной директории строит план изменения уже выбранного текущего текста. Он обнаруживает контракт, получает fresh inspection, строит input, показывает понятный preview; дальше действует существующий server-owned proposal/dry-run/confirmation/run/verify. В первой фазе достаточен offline protocol/contract proof; live acceptance — отдельный scope по действующим gates.

Изменение правил форматирования во внешнем пакете не должно менять Core/CEP hashes и требовать их установки. Его удаление не должно лишать Core статуса, receipts и UNKNOWN. Ошибка версии останавливает работу до send. Два workflow не получают два live controllers. Перенос пакета не переносит credentials/grants и не снимает общие fences. Новый executor — отдельный этап установки/совместимости, не условие первого pilot.
