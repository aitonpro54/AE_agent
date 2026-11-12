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

Spec добавляется в базовый `source-package.files`: он нужен каждому составу.
В standalone HELPERS второй раз его не добавлять: candidate files уже входят
в distribution. Actual manifest diff объясняет новый helper и source hashes,
без дополнительных capabilities или предметных модулей.

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
