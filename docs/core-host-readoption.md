# Повторная привязка текущего AE

CLI manual/owner реализован и проверен адресными source/tests. Текущая source и
installed приёмка с её границами — в [плане re-adoption](../plans/core-cep-r3-host-readoption-20261031.md).

Оператор обновляет существующую machine-local host adoption после смены процесса
After Effects. Используется один новый original stop UUID, stopped certification,
перепривязка и отдельный enable. Runtime package, credentials и CEP сохраняются.
Операция работает с metadata Core; native current-target confirmation остаётся
отдельной проверкой перед будущим исполнением в AE.

## Подготовка

Используйте immutable manual/owner distribution с проверенным distribution hash
и Node, закреплённый установленным Core. Current package hash берётся из свежего
configured `core_status`; distribution должна содержать тот же runtime package.
Для installation descriptor и witness нужны точные абсолютные native paths.

Перед новым stop подтвердите current owner/boot/package, controller idle,
отсутствие pending/UNKNOWN/faults и settled histories. Выберите project/test-copy
явно и получите fresh штатную inspection текущего проекта. Пользовательский AEP
не сохраняется и не меняется ради этой metadata операции.

Fresh Windows witness формируется по штатному фиксированному host probe и
результату inspection. Его UTF-8 bytes ограничены16KiB; SHA256 вычисляется по
этим точным bytes. Формат содержит ровно следующие поля:

| Поле | Содержание |
| --- | --- |
| installationId | ID текущей проверенной установки |
| machineId | Текущая machine binding установки |
| host | machineId, aePid, aeProcessBirth, executablePath, executableHash из fresh probe |
| allowedProject | Выбранный абсолютный canonical project path |
| rootObservationDigest | SHA256 fresh root observation |

Helper сам повторяет Windows observation перед CAS: единственный AE process,
полный host identity, freshness и observed-absent на named endpoints3456/8787.
Исторический PID из status/adoption не подменяет этот witness.

## Общие параметры CLI

PowerShell-пример использует placeholders; подставляются проверенные значения
текущего original operation. UUID сохраняется для всех его продолжений.

```powershell
$readoptNode = 'ABS_BOUND_NODE'
$readoptDistribution = 'ABS_REVIEWED_DISTRIBUTION'
$readoptDescriptor = 'ABS_INSTALLATION_JSON'
$readoptPackageHash = 'CURRENT_PACKAGE_SHA256'
$readoptDistributionHash = 'REVIEWED_DISTRIBUTION_SHA256'
$readoptOperation = 'NEW_ORIGINAL_UUID'
$readoptEntry = Join-Path $readoptDistribution 'tools\standalone-installer.js'
$readoptCommon = @(
  '--expected-distribution-hash', $readoptDistributionHash,
  '--expected-current-package-hash', $readoptPackageHash,
  '--installation', $readoptDescriptor,
  '--operation', $readoptOperation
)
```

Новый штатный stop отправляется один раз существующим verified owner helper:

```powershell
& $readoptNode (Join-Path $readoptDistribution 'tools\maintain-owner.js') stop `
  --installation $readoptDescriptor --operation $readoptOperation `
  --expected-package-hash $readoptPackageHash
```

После подтверждённого завершения stop выполните stopped inspection/certification
с тем же UUID. Proof для action берётся из непосредственно предшествующей
inspection соответствующей фазы.

```powershell
& $readoptNode $readoptEntry stopped-inspect @readoptCommon
& $readoptNode $readoptEntry stopped-certify @readoptCommon `
  --expected-proof-hash 'FRESH_STOPPED_INSPECTION_PROOF'
```

## Перепривязка и включение

| Команда | Дополнительные обязательные параметры | Результат |
| --- | --- | --- |
| readopt-inspect | Нет | Read-only phase/proof исходной operation |
| readopt-apply | expected-proof-hash, witness, expected-witness-hash | Замена adoption и completed-stopped |
| readopt-finish | expected-proof-hash | Продолжение исходного apply/его release tail |
| readopt-enable | expected-proof-hash | Отдельное включение после completed-stopped |
| readopt-enable-finish | expected-proof-hash | Продолжение исходного enable либо historical no-op |

```powershell
& $readoptNode $readoptEntry readopt-inspect @readoptCommon
& $readoptNode $readoptEntry readopt-apply @readoptCommon `
  --expected-proof-hash 'FRESH_READOPT_INSPECTION_PROOF' `
  --witness 'ABS_FRESH_WITNESS_JSON' --expected-witness-hash 'WITNESS_BYTES_SHA256'

& $readoptNode $readoptEntry readopt-inspect @readoptCommon
& $readoptNode $readoptEntry readopt-enable @readoptCommon `
  --expected-proof-hash 'FRESH_COMPLETED_STOPPED_PROOF'
```

Каждая команда удерживает election127.0.0.1:3457 до завершения и закрывает свои
connections в finally. Enable возвращает local receipt; стандартный thin client
запускает/подключает Core обычным configured `core_status`.

## Продолжение после прерывания

После неизвестного исхода сначала inspect того же UUID. Для apply применяется
readopt-finish; для enable — readopt-enable-finish, каждый со свежим proof.
Finish использует original intent/witness/replacement; новый target ему не
передаётся. Pending recovery требует fresh доказательство смерти original actors.

После proven CAS receipt/release settlement проходит локально при недоступном
AE. Библиотечный historical terminal path распознаёт завершение исходного enable
при новых owner markers, history или barrier другой operation. Его результат содержит
currentRuntimeObserved/currentHistoryObserved/currentBarrierObserved=false и
authority=false. Он описывает исходную operation; текущее состояние проверяется
свежим configured status. Чужие markers/gates/barrier остаются нетронутыми.

CLI сохраняет обязательную election127.0.0.1:3457 для каждого режима, включая
inspect/enable-finish. Когда живой normal owner уже занял3457, CLI отказывает на
резервации порта. Historical semantics библиотеки защищают завершение команды
при startup race, пока helper ещё удерживает election; они не делают CLI общим
просмотрщиком history работающего Core. Для текущего Core используется configured
status. Port override или автоматическая остановка owner для такого чтения не
предусмотрены.

Если host сменился после intent до CAS, первый срез сохраняет stopped fence.
Cancel/retarget требует отдельного контракта. Unknown bytes/inodes, original
aliases, unsettled history до commit или unavailable process proof также дают
отказ. Первичные records/preparations сохраняются для inspect; ручная очистка
markers и повтор уже отправленного apply/enable не используются.

Успешный apply/enable сохраняет runtimeStarted/mutationGrant/lifecycleEpoch/aeAuthority=false.
Actual project mutation, raw JSX, destructive и save используют свои gates.
Перенос исходников/distribution между машинами проходит по [контракту переносимости](portability.md);
runtime state/authority не переносятся как разрешение продолжить operation.
