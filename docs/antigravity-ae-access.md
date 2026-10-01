# Постоянный доступ Flash к AE Agent

1 октября 2026 года пользователь разрешил добавить в Antigravity доступ,
необходимый для текущей работы с плейсхолдерами и будущих задач AE Agent.

## Настройка

Сохранённый проект Antigravity `AE_agent`, ID
`82137d9f-3dac-43ae-bd5b-d4ecaa75885c`, использует существующий MCP `after-effects`.
В его `permissionGrants.permissionGrants.allow` добавлены 141 точное разрешение
`mcp(after-effects/<tool>)` из актуального каталога: чтение, typed tools,
builders, proposal, dry-run/runner, независимые проверки и контрольные кадры.
141 MCP rule и прежний отдельный read grant документации моста. Для текущего
media workflow также разрешены три точные команды: bounded offline helper,
read-only `git grep` примера контракта и `git ls-files "*typed-plan-contract*"`;
на этом этапе было 145 rules (после offline проверок — 169, после текущих
media read grants — 203).
Helper ограничен новой
папкой видео и runtime outputs, не обращается к AE. Он не является общим shell grant.

Это постоянная настройка проекта Antigravity. Новый AEP в том же workspace
не требует повторной настройки этих инструментов. Для нового MCP tool диспетчер
сверяет его контракт и добавляет точный grant в рамках разрешённого AE scope;
не включает глобальный bypass и не подменяет ограничения конкретной задачи.
Для необходимой локальной команды диспетчер проверяет scope, сохраняет точный
grant и добавляет её в `required_commands` следующего запуска. По прямому
поручению пользователя от 1 октября это не требует повторного согласования
штатного доступа; новый рискованный scope сохраняет собственные ограничения.

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

## Практический порядок для будущих live задач

После успешного builder сохранять полный `result.plan`, включая
`expectedReadBack`, `placeholderAssignments`, `frameReview` и framing metadata.
Следующий шаг — server proposal, dry-run и выполнение с его текущими pins;
не пересобирать plan только из steps и не искать другой runner. Адресные setters
используют documented hints и guards, а stable IDs для чтения не являются
универсальными setter aliases. Затем читать изменённые targets независимо.

При `state.constraints=null` и отсутствии accepted snapshots обычный typed
replace/time не требует global group mappings. `check_placeholder_assignments`
по умолчанию включает group constraints; это отдельная проверка с authoritative
подтверждёнными mappings. Вывод модели о группе не заменяет trusted confirmation.
PAR, перекрывающиеся старые видеослои и shared usages проверяются до записи:
cover-helper поддерживает только square pixels; один заменённый нижний слой
не доказывает заполнение экрана, если сверху остаётся другое видео.

Экспорт PNG тоже проходит proposal/gates. Registered visual review строится
через текущий typed review builder с реальным owner, item IDs и manifest;
картинки необходимо фактически просмотреть. Чтение metadata и geometric coverage
не подтверждают содержание кадра или число смен плана. Участки исходника и
контрольные кадры рассчитываются по видимому local range заданной сцены.

## Проверка и откат

Фактическая проверка: Flash `gemini-3.8-flash-high` в запуске
`live-bohemian2016-20261001-02` успешно вызвал `get_placeholder_protection`.
Это live read proof устранённого отказа, а не доказательство заполнения AEP.
Перед изменением предыдущий Flash процесс завершён без AE mutations.

Следующая проверка: Flash run04 импортировал8 новых видео через server-owned
typed proposals, dry-run и автономный runner. Диспетчер независимо прочитал
реальные IDs4984–4991 и пути источников. Пакетный runner сообщил
`verification_required` после применённых imports из-за отсутствия явного
read-back в плане; последующее чтение подтверждает наличие items, но не закрывает
художественную приёмку или полноту семантической проверки run. Run04 завершился
сетевой ошибкой провайдера после записи артефактов; grants эту ошибку не исправляют.
Продолжение использует существующие IDs, без повторного импорта. Признаки
`hasVideo`/`footageMissing` сами по себе не доказывают корректность декодирования
или кадрирования; необходимы реальные кадры AE.

Ignored evidence: `.codex-runtime/live-bohemian2016/grants-20261001.json`;
backup: `antigravity-project-before-grants.json` в том же каталоге.
Backup внешнего проекта может содержать локальные настройки: не публиковать.
Для отката завершить исполнителя, сверить последующие изменения и удалить
только добавленные rules. Не заменять весь project JSON старой копией поверх
более поздних пользовательских изменений. Git revert не откатывает внешний JSON.


## Offline проверки при исправлении live дефектов

По постоянному поручению пользователя 1 октября добавлены 21 точное command
разрешение для scoped placeholder smokes, syntax проверок перечисленных JS и
`git diff --check`. Всего 166 rules, включая 141 MCP. Эти команды не запускают
настоящий AE, provider или frozen intake. Другие поля проекта Antigravity
сохранены. Новые команды добавлять по конкретному scope, без wildcard shell.
Backup и полный список: `.codex-runtime/live-bohemian2016/offline-check-grants-08.json`
и `antigravity-project-before-offline-check-grants.json` (не публиковать backup).
После production projector-коррекции добавлены ещё три exact проверки
`placeholder-evidence.js`/его smoke: текущий итог169. Other fields unchanged;
список и backup находятся в runtime `evidence-check-grants.json` и
`antigravity-project-before-evidence-check-grants.json`.

Live испытание обнаружило native контрактные дефекты геометрии и review receipts.
Замена source может фактически примениться даже при ошибке записи run evidence;
в этом случае требуются fresh read-back и продолжение только оставшихся шагов.
`review_creation_receipt_mismatch` после создания объектов запрещает повтор create:
сохранять owner/IDs, сверять фактический receipt и не считать owner зарегистрированным.
Просмотр PNG отдельно не восстанавливает registration и не доказывает число склеек.

## Чтение медиа в текущей live задаче

После отказа `read_file` в Flash17 добавлены 34 точных правила чтения:
21 исходный файл из разрешённой папки G и 13 уже принятых постоянных клипов.
Итого 203 rules; другие поля проекта независимо сравнены с backup и совпадают.
Правила не содержат wildcard, записи или глобального bypass. Для новых
подготовленных клипов диспетчер добавляет только фактические проверенные пути
перед следующим запуском. Доступ к файлу не означает художественную приёмку.

Evidence: `.codex-runtime/live-bohemian2016/media-read-grants.json`.
Flash17 остановился до импорта или mutation; root подтвердил 407 items,
пустые pending/inflight и отсутствие edit session. Продолжение использует
новый task ID: conversation с невалидным terminal protocol драйвер не принимает.
Следующий запуск17c завершился сетевым TLS timeout до модели/MCP;
процесс проверен завершённым, AE шаги не повторялись.
