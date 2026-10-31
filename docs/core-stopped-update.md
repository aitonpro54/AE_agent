# Обновление остановленной установки Core

Этот private operator находится в проверяемой standalone distribution, а не в
публичном MCP. Сначала проверяются все bytes новой distribution и package pin;
код установленного release читается как данные. Данные и credentials установки
не переносятся на другую машину.

Общие параметры команд `tools/standalone-installer.js`:

- `--expected-distribution-hash`: hash проверенной distribution;
- `--expected-package-hash`: выбранный новый package;
- `--expected-current-package-hash`: исходный установленный package;
- `--expected-previous-descriptor-hash`: SHA256 исходного descriptor;
- `--installation`: точный абсолютный путь `installation.json`;
- `--operation`: UUID существующего stop, migration либо update transaction
  согласно таблице ниже.

| Команда | UUID | Дополнительные параметры и результат |
| --- | --- | --- |
| `owner-update` | Existing stop | `--config`; certifies stopped owner, обновляет и оставляет stopped |
| `migrate-legacy` | New migration | `--config`, `--root-status`, `--expected-root-status-hash`; строго manual3f92, один verified root stop и переход к owner |
| `update-inspect` | Update transaction | Read-only phase/proof; endpoint reservation не создаёт execution owner |
| `update-finish` | Update transaction | `--expected-proof-hash`; известный prefix исходного переключения |
| `update-enable` | Update transaction | `--expected-proof-hash`; отдельный enable после read-back |
| `enable-finish` | Update transaction | `--expected-proof-hash`; продолжение исходного enable |
| `legacy-inspect` | Original migration | Проверка ранней interrupted legacy migration |
| `legacy-finish` | Original migration | `--expected-proof-hash`; dedicated forward recovery без нового normal plan |

Root status для первого legacy перехода — локальный JSON `{observedAt,status}` из
свежего configured `core_status`. Его hash связывает наблюдение с запуском operator;
сам этот файл не выдаёт authority. Дополнительно проверяются known source profile,
монотонно closed receiver, settled signed history, exact paths/CLI/listener,
удерживаемая native process identity и branded installation lease.

Update не включает enable автоматически. Новый typed stopped barrier сохраняется
до отдельного explicit enable; enable не запускает runtime. Обычный stdio thin
client после этого подключается к одному installation owner. При отказе, timeout
или неизвестном исходе нельзя запускать новый plan, менять keys или удалять gates.
Сначала читается соответствующий original migration/update phase и его proof.

AE restart, save/raw/destructive и полная release-приёмка этим operator не
разрешаются. Installed proof и переносимость десктоп ↔ MSI фиксируются отдельно.
