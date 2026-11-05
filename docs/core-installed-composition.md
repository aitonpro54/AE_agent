# Устанавливаемые составы Core

Начиная с этого среза package release имеет `format:2` и обязательный
`runtime/composition.json`, включённый в manifest hashes. Версия installation
descriptor остаётся 2; это другой контракт, чем format пакета.

Доступны два состава, выбираемые при сборке:

- `readonly`: Core, CEP и bounded `project-inspection`. Рабочие модули,
  их admissions, plan-engine, manual-policy и Windows reservation provider
  физически отсутствуют. Broker не получает authority; доступность inspection
  отдельно отражается в physical status. Automatic lifecycle отсутствует.
- `manual` — default: прежние рабочие пакеты и engine, inspection и existing
  current-target adapter. Наличие adapter/контракта не выдаёт mutation grant:
  сохраняются proposal/dry-run, fresh native confirmation, ownership,
  checkpoint, read-back и UNKNOWN/no-replay.

Из корня репозитория в PowerShell:

```powershell
node core4/tools/package-installable.js --composition readonly --output (Join-Path $env:TEMP 'core4-readonly.json')
node core4/tools/package-installable.js --composition manual --output (Join-Path $env:TEMP 'core4-manual.json')
```

`--output` требует абсолютный новый путь; существующий файл не перезаписывается.
Без `--composition` собирается manual. Эти команды создают пакет, не запускают
MCP, CEP или AE. Установка использует прежний installer с точным reviewed
packageHash и проверками текущего runtime/state.

Состав задаёт modules/catalog, engine и selected assets. Доступны только
существующие reviewed policy adapters; произвольные имена policy или source в
runtime frames не принимаются. Pins выводятся из проверенных artifact/admission
bytes. Registry собирается детерминированно из выбранных executor bytes и
проверяется вместе с полным release tree до imports runtime.

Старый `format:1` сохраняет fixed контракт своей CEP-конфигурации. Новый
verifier использует format именно проверяемого release, включая historical
install preflight; состав кандидата не заменяет контракт старого f548.
Для format2 отсутствие composition/hash, подмена registry, несовпадение
catalog/admission и неизвестный формат означают отказ, без if-exists fallback.
Signed history, original UNKNOWN и disposition не переписываются при смене
состава.

Для `titles-current-target` C1b добавляет отдельный пакет операции и допуск.
Они собираются с проверенным базовым `manual/owner` в обычный standalone для
остановленного обновления. Произвольные слоты и горячая замена остаются
отдельными задачами. [План C1b и команды сборки](../plans/core-capability-supply-c1b-20261105.md).

Приёмка конкретного JSX в AE и переносимость выбранного состава подтверждаются
отдельно. [Исходный план составов](../plans/core-installed-composition-20261029.md).
