# MCP/Codex maintenance после B7

3 ноября 2026. Прямой выбор пользователя: «Вернуться к MCP/Codex maintenance».
Root — единственный live controller/writer. Текущий runtime chat
`01a1a098-6ee6-7af1-8ca5-7b03adfbcec5` подтверждён metadata и read_thread,
host local, cwd AE_agent_core. Titles/Slideshow остаются на паузе.

## Порядок

1. Проверить текущий scoped MCP/Core status/diagnostics, effective Core config,
   версии текущих Codex app/CLI и релевантные свежие ошибки этого чата.
2. Отделить исторический deferred refresh от актуальной неисправности. Рабочее
   подключение B7 не перезапускается только ради выполнения старой инструкции.
3. При подтверждённом дефекте подготовить точный ремонт с сохранением текущей
   работы и Core/session/history; settled transactions не повторять. Если дефект
   отсутствует, завершить maintenance фактическим healthy checkpoint без изменений.
4. Зафиксировать результат и требуемую проверку изменённого пути. При отсутствии
   изменения переиспользовать B7 native read и exact hashes, без лишней mutation.

## Progress

- Новая диагностика: same owner27100/bootb76c6e87… ready, CEP connected,
  pending/UNKNOWN/fault0, controller free. Catalog/ledger/ownership faults отсутствуют.
- Effective `codex mcp list/get --json`: Core enabled, stdio Node, candidatecdf
  entry path, timeout120, inline env отсутствует. Project config SHAab01a505… прежний.
- Current app-server16688/birth639292921882045310 и parent app3272 прежние.
  MSIX Codex26.1027.3384.0; CLI0.166.0-alpha.5.1, hash3097c909….
- Проверка завершена: подтверждённого дефекта текущего подключения нет, ремонт,
  restart и config changes не потребовались. Историческое ожидание service refresh
  закрыто как утратившее необходимость; действий на потом не оставлено.
- Сохранены receiver7/ledger1, все143 защищённых state/archive files,
  descriptor/client/config/AEP и UNKNOWN archives26/20. Новых AE-команд нет.

## Decision Log

- Снятие паузы разрешает необходимое maintenance; состояние B7 уже заменило
  историческую причину refresh — old configured client/owner_unavailable.
- Три наблюдавшихся thin clients сами по себе не доказывают orphan/leak. Они не
  завершаются по имени/количеству без установленного ownership и необходимости.
- CLI list/get — config observations; настоящий configured health подтверждается
  Core tools и B7 native read. CLI OAuth auth_status unsupported для этого stdio
  не приравнивается к отказу private Core role authentication.
- Root ведёт короткий scoped maintenance текущего подключения; управление живыми
  процессами и принятие его результатов не передаются другому controller.
- Старый app-server28148 уже завершён до прежней паузы; текущий16688 имеет тот же
  birth, что в deferred snapshot. Это не новый restart и не причина его выполнять.
  Рабочее configured подключение подтверждено B7 и свежими status/diagnostics.
- Новое прямое поручение сняло историческую паузу maintenance; завершение проверки
  не создаёт её заново. Titles/Slideshow сохраняют отдельную явную паузу.

## Validation

- Current thread metadata/read_thread match; same cwd и active turn.
- Core status/diagnostics и effective CLI config PASS, config write0/restart0.
- В окне после B7 с14:31:07.122Z до свежего среза14:49:52.868Z у текущего чата
  345 записей DEBUG/INFO/TRACE, WARN/ERROR0. Узкая MCP/Core-выборка пуста;
  это ограниченная проверка, не утверждение об отсутствии ошибок во всех чатах
  и сторонних MCP. SQLite открыт readOnly/query_only; raw log exports0.
- Exact hashes143 state/archive files, descriptor/client/config/AEP,
  receiver7/ledger1 и UNKNOWN26/20 PASS относительно B7. Sessionce977de2…,
  baselineRequired=false, controller free, pending/UNKNOWN/fault0.
- Source/runtime не менялись; source suites не повторялись. B7 native read
  переиспользован с явным provenance; новых live read/mutation/save/reset нет.
- Документация: UTF-8 для6 файлов,124 локальные ссылки, JSON parse/основные
  invariants, отсутствие private role tokens и `git diff --check` PASS.
- Полные наблюдения и границы:
  [evidence](../docs/evidence/core-codex-mcp-maintenance-20261103.json).

## Продолжение

Maintenance текущего Core/Codex подключения завершён; ожидающих repair/restart/config
действий нет. Full release и двусторонняя переносимость остаются отдельными открытыми
областями, Titles/Slideshow — на паузе. Исторические settled IDs не повторять.
Изменены только этот план, evidence и актуальные указатели AGENTS/основного плана/
continuation/checkpoint; установленный runtime и MCP config сохранены.

Официальный контракт config/CLI:
[Model Context Protocol](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).
Страница определяет `mcp list` и project `.codex/config.toml`; она не доказывает
фактическое состояние текущих процессов или Core.
