# Постоянный доступ Flash к AE Agent

1 октября 2026 года пользователь разрешил добавить в Antigravity доступ,
необходимый для текущей работы с плейсхолдерами и будущих задач AE Agent.

## Настройка

Сохранённый проект Antigravity `AE_agent`, ID
`82137d9f-3dac-43ae-bd5b-d4ecaa75885c`, использует существующий MCP `after-effects`.
В его `permissionGrants.permissionGrants.allow` добавлены 141 точное разрешение
`mcp(after-effects/<tool>)` из актуального каталога: чтение, typed tools,
builders, proposal, dry-run/runner, независимые проверки и контрольные кадры.
Всего 142 правила с прежним отдельным read grant документации моста.

Это постоянная настройка проекта Antigravity. Новый AEP в том же workspace
не требует повторной настройки этих инструментов. Для нового MCP tool диспетчер
сверяет его контракт и добавляет точный grant в рамках разрешённого AE scope;
не включает глобальный bypass и не подменяет ограничения конкретной задачи.

Не добавлялись direct grants для raw JSX, delete/restore/save и дополнительных
provider/planner/Hardcore lanes. Их отсутствие не запрещает будущую явно
порученную задачу: она проходит свой действующий контракт и разрешения.
Вызов mutating typed tool напрямую по-прежнему подчинён bridge policy;
штатное исполнение идёт через server-owned proposal, dry-run и runner.
Сохранение AEP, destructive/raw flow и trusted CEP acceptance сохраняют gates.

Глобальный settings, MCP credentials и остальные поля проекта не менялись.
Чтение внешних видео, запись отчётов и shell имеют отдельные права и область
конкретной задачи. Модель не подтверждает группы или accepted snapshots вместо
пользователя и не обращается к panel-only API с automation credential.

## Проверка и откат

Фактическая проверка: Flash `gemini-3.8-flash-high` в запуске
`live-bohemian2016-20261001-02` успешно вызвал `get_placeholder_protection`.
Это live read proof устранённого отказа, а не доказательство заполнения AEP.
Перед изменением предыдущий Flash процесс завершён без AE mutations.

Ignored evidence: `.codex-runtime/live-bohemian2016/grants-20261001.json`;
backup: `antigravity-project-before-grants.json` в том же каталоге.
Backup внешнего проекта может содержать локальные настройки: не публиковать.
Для отката завершить исполнителя, сверить последующие изменения и удалить
только добавленные rules. Не заменять весь project JSON старой копией поверх
более поздних пользовательских изменений. Git revert не откатывает внешний JSON.
