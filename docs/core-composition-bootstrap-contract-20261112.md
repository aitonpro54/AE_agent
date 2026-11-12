# Контракт B0: composition metadata и доверенный bootstrap

12 ноября 2026. Основание — этапы B0–B3
[плана](../plans/core-architecture-implementation-20261112.md).
Архитектурный разбор ae_architect выполнен на dd50fb8; A1 сохраняется при
дальнейшей реализации. Этот контракт не меняет installation/authority и не
назначает новый wire protocol, версию продукта или live-приёмку.

## Решение и остаточная граница

Ограниченное выделение: новый `core4/runtime/composition-spec.js` владеет
чистым описанием состава и генерацией registry. Inline byte/path/root и
semantic verifier остаётся в bootstrap. Новый модуль используется только
после проверки собственного исполняемого дерева либо доверенным tooling,
которое рассматривает candidate package исключительно как данные.

Проверка чужого target tree не подтверждает соседний helper текущего source
tree. Поэтому `verifyRelease`, `verifyInstallation`, `verifyCep` и нужные им
inline semantic функции пока сохраняются. Временное дублирование semantic
validation закрывается parity fixtures. Полное выделение verifier потребовало
бы отдельного разграничения bootstrap и trusted-library API и сюда не входит.
Существующая защита не объявляется OS sandbox или абсолютной защитой от
произвольной конкурентной замены файлов.

## Порядок загрузки

| Consumer | Допустимая последовательность |
| --- | --- |
| Configured thin client | verifyClientDescriptor: descriptor/origin/Node/full release tree → client_entry_root → literal adjacent spec import → derive metadata → serve |
| Direct installed stdio | inline verifyInstallation: bytes/semantic/CEP → entry/root guard → literal adjacent spec import → derive metadata → install gate/lifecycle/runtime |
| Owner entry | builtin-only verifyOwnerInstallation → fixed stdio-entry → установленная последовательность start(owner) |
| Package/install tooling | Доверенный собственный spec импортируется фиксированно; candidate helper/manifest paths не исполняются |
| Standalone executable | builtin-only verifyStandalone проверяет distribution/candidate bytes → существующий allowlist imports tooling/spec |

Запрещены import helper до соответствующей собственной проверки,
`require` по пути из cwd/descriptor/manifest и обход прежних root guards.
Boundaries checker должен разрешать ровно literal post-verification import,
сохраняя прежние ограничения остальных imports.

## Pure module и потребители

Функции сохраняют прежние аргументы, данные и ошибки:
`builtinCapabilityFiles`, `compositionPaths`, `deriveComposition`,
`validateCompRenderCompletion`, `registrySource`, `installationConfig`,
`installationMarker`. Необходимые fixed profile tables и canonical/hash
находятся здесь; допустимы только нужные node:path/node:crypto builtins.
Нет filesystem, process, environment, network, runtime state или выдачи
credentials/grants. Ограниченный read callback читает данные, не разрешает imports.

`installationConfig` только проецирует уже переданную full-role installation
в существующую конфигурацию CEP. Thin client использует composition metadata
и не получает panelToken. Registry получает уже допущенные executor bytes и
fixed codec; пользовательский executable input не появляется.

Клиент, package-installable и install-core4 перестают импортировать stdio-entry
ради metadata. Runtime после проверки использует тот же spec; proof factories
и runtime wiring остаются на месте. Старые stdio exports сохраняются для
существующих доверенных consumers.

Runtime spec добавляется в базовый `source-package.files`: он нужен каждому
составу. В standalone HELPERS runtime/spec второй раз не добавлять: это
candidate-owned файл. Trusted tooling получает отдельный зарезервированный
tools/spec slot по уточнённому контракту ниже. Actual runtime manifest diff
объясняет +1 helper и source hashes, без дополнительных capabilities/модулей.

## Уточнение B1: две роли helper в standalone

Actual TEMP reproduction показал: flattened layout разрешает tooling import
`../runtime/composition-spec.js` к candidate-owned файлу даже после outer
distribution verification. Старый поддержанный candidate без helper также
мог дать MODULE_NOT_FOUND при выполнении новых tools. Этот seam закрывается
до принятия B1; candidate bytes не перезаписываются.

- Repository `tools/composition-spec.js` — fixed shim к собственному
  `../runtime/composition-spec.js`. Package/install tools импортируют только
  `./composition-spec.js`.
- При bundling tooling slot `tools/composition-spec.js` получает полные pure
  bytes собственного root/runtime/composition-spec.js, а не shim/candidate.
  Это одна явная source-alias операция копирования, без rewriting JS строк.
- Candidate namespace tools/, включая Windows case aliases, запрещён до
  merge/write. Runtime/helper candidate остаётся исключительно его payload.
- Runtime/client imports B0 и inline verifier не меняются этим уточнением.

### Standalone manifest compatibility

| Manifest | Exact keys / capabilityBaseHash | Helper closure |
| --- | --- | --- |
| v1 | version,purpose,packageHash,hashes; capBase отсутствует | Frozen прежний LEGACY_HELPERS |
| v2 | те же плюс обязательный HASH capBase, не равный packageHash | Frozen прежний LEGACY_HELPERS |
| v3 | те же плюс обязательный capBase: null или HASH, не равный packageHash | CURRENT_HELPERS = legacy + tools/composition-spec.js |

Purpose остаётся core4-standalone-installer-v1. Новые distributions выпускаются
в v3; null означает обычный режим, HASH — прежнюю capability-update семантику.
Публичный checked operational result для null сохраняет отсутствие optional
capabilityBaseHash, чтобы normal distribution не стал capability update.
Expected closure зависит от manifest version. verifyStandalone читает v1/v2
по старым exact closures как данные; current executable перед tooling imports
требует v3, иначе standalone_tooling_upgrade_required. Старые выпущенные
distributions и их собственные immutable executables не переписываются.

Rebundling поддержанного старого format2 candidate без runtime helper создаёт
новый v3 с собственным tooling helper, сохраняя candidate packageHash/bytes
и capabilityBaseHash. Это разделение delivery roles под прежним outer hash,
не новый authority/grant протокол и не смена product/runtime release version.

Дополнительная приёмка: resealed poison candidate official dry-run не создаёт
marker/destination; old-no-helper dry-run работает; capability mode gate
сохраняется; corrupt/missing tooling helper отклоняется до его исполнения;
tools/case aliases не подмешиваются; legacy closure injection и v3 missing
helper отвергаются; current executable не импортирует tooling после legacy-only
verification; repository shim/spec и полный bundled pure helper имеют parity.

## Уточнение C: source snapshot и native-read operator

Две дополнительные tooling closure требуют того же разделения ролей.
`check-package-location` копирует ровно package-installable и repository
composition-spec shim как tracked source bytes; собственный runtime snapshot
содержит pure spec. Allowlist не расширяется до всего tools.

Flattened native-read operator получает отдельный tools/composition-spec.js
из reviewed OWN root/runtime/composition-spec.js, а не repository shim или
candidate files. Candidate tools namespace (включая Windows aliases) запрещён
до объединения, candidate bytes/hashes не перезаписываются. Новый tooling slot
имеет собственный hash в полном operator inventory.

Operator manifest остаётся v1: reader проверяет объявленный inventory и outer
operatorHash, без закрытого standalone helper-union. Старые inventories читаются
с их прежними hashes, новый slot не становится требованием к старому reader.
A_HASH/DRIVER_HASH, receipts, authority/lease/disposition protocol не меняются.
Новые closures получают новый operatorHash. Проверки включают source-shim bytes,
candidate poison marker через actual constructor/import, missing/corrupt helper,
old expectedHash refusal и чтение legacy v1 inventory. Live inspection/apply
для этой приёмки не нужны.

## Старые пакеты

Новые tooling readers проверяют старый package своим trusted spec как данные.
Inline legacy verifier сохраняет прежние format/composition branches; старый
установленный entry исполняет собственные bytes. Новый entry требует свой
fixed helper; missing/corrupt helper даёт отказ без fallback к cwd/stdin/legacy
executable. Совместимость не определяется одним отсутствием helper.

## Приёмка B1

- Parity inline/spec для readonly, manual, manual-titles-variants, operator и
  поддерживаемых legacy shapes: выбранные assets/flags, registry bytes,
  config/marker и одинаковые отказы.
- Poisoned/missing helper и wrong entry root отклоняются до исполнения helper
  и создания runtime/state. Candidate helper не исполняется при verification.
- Initialize/tools-list клиента без Owner сохраняются.
- Actual manifest отличается только обоснованными файлами/hashes; module/tool
  surface и generated registry сохраняются при чистом выделении.
- Новый файл включён в dependency mapping всех реальных consumers; integration
  keys не сужаются ради удобства reuse.

## B2: полная change identity выбранного каталога

Отдельный этап после parity B1. Вычислить один раз по окончательно выбранным
package data, до публикации generated catalog:

```js
{
  kind: 'ae-core4-selected-catalog', version: 1,
  composition: { version: 2, id: selector, policyVersion: 2 },
  modules: [{ entry: { id, version, path, admission }, artifactPin, admissionPin }],
  engine: null, // либо { path, artifactHash }
  assets: [{ declaration: { assetKey, moduleId, path, admission, policy, phases },
             artifactPin, admissionPin }],
  profiles, capabilities, registryVerification
}
```

Artifact/admission pins — hash parsed manifest/admission. Для inspection asset
artifact может одновременно служить admission. Существующая derive validation
подтверждает соответствие manifest реальным bytes. Значимый порядок modules и
assets сохраняется; canonical сортирует object keys. Итоговая строка
`selected-v1-` + hash(preimage). Не включать catalogRevision в себя, package hash,
timestamps, machine paths, runtime IDs или весь source catalog. Исключённые
модули не влияют. Старые revisions допустимы как прежние opaque strings.
Это change identity, отдельно от package/module pins и authority.

Проверки: одинаковые inputs; изменение первого/последнего выбранного module,
admission, engine, profile/capability; неизменность при правке excluded module;
значимый порядок; отказы duplicate/cycle/extra file. Actual manifest для четырёх
составов сохраняется и объясняется. Семантическая правка revision закономерно
меняет package hash и не объединяется с B1 extraction equivalence.

## B3: явная compatibility policy

Сохранить допустимые старые форматы и более узкий список owner/client.
Неизвестная версия отклоняется до интерпретации состава; новая версия не
получает registryVerification=false через неявный default.

| Releases | Прежняя семантика |
| --- | --- |
| 4.0.0 | Существующие format-1/format-2 legacy границы |
| 4.1.0, 4.1.1, 4.1.2, 4.2.1, 4.2.2 | Existing format-2 compatibility без расширения |
| 4.2.3, 4.2.4, 4.2.5 | Composition/policy v2; прежний контракт без registry verification |
| 4.2.6 | Composition/policy v2; registry identity и panel identity обязательны |
| Иные | Явный unsupported release, без silent downgrade |

Owner/client сохраняют свой whitelist 4.2.2–4.2.6; tooling table не расширяет
его. Минимальная policy в builtin bootstrap и pure spec связана parity test.
Future-version fixture отклоняется и с marker, и без него. Новый release требует
явной строки; текущая source-задача оставляет product/serverInfo 4.2.6.
Result routes документируются отдельно: module → profile → proof adapter →
transport validator → completion/read-back. Generic receiver сохраняет свой
контракт. Новый effect/proof требует reviewed trusted adapter, без plugin ABI.

### Проверяемый случай переиспользования profile

Обещание декларативного подключения ограничено переносимыми profiles. Текущие
manual-text/photo/assembly/media/save/lifecycle/frame profiles связывают конкретные
module/operation identities; OPERATOR_EFFECTS также остаётся фиксированным
допуском. Их allowlists не расширяются ради демонстрации модульности.

Для B3 положительный TEMP-only fixture использует существующий
`owned-text-layer-v1` и новый reviewed module ID, например
`fixture-owned-text-layer`, с собственными contract/manifest/admission pins.
Он сохраняет text-layer target/input/result/effect/receipt/preserve semantics
и прежнее native-confirmation поведение; operatorConfirmation не добавляется.
Состав начинается от readonly и включает только нужные policy/proof files и
plan-engine. Исходный text-layer можно не включать, чтобы одинаковые executor
bytes не дали ложный успех через перезапись executorHash Map.

Приёмка проходит через production selection seam: package/derive принимают
новую декларацию, runtime выбирает существующий text-layer adapter и HTTP
validator, synthetic typed путь проверяет receipt/read-back/sibling сохранность
и cancellation/invalid receipt. Fixture не копирует switch выбора adapter.
Негативные новые module IDs с fixed manual-text-v1 или неподдержанным operator
confirmation отклоняются до dispatch. Inline/spec дают одинаковые исходы.

Новый reviewed модуль может переиспользовать существующий переносимый профиль
при сохранении его семантического envelope. Новая форма цели, effect/receipt или
operator-confirmation binding требует отдельного reviewed trusted adapter;
общего разрешения произвольного plugin-кода этот fixture не создаёт.
