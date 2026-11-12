# Совместимость версий и result profiles Core

Контракт B3, 12 ноября 2026. Product/serverInfo — **4.2.7**.
Release format, composition policy, standalone manifest и product version —
раздельные номера. Незнакомый product version отклоняется до чтения состава.

| Product version | Release format | Composition/policy | Registry / panel identity |
| --- | --- | --- | --- |
| 4.0.0 | 1, 2 | прежний legacy либо поддерживаемый format-2 состав | прежние требования |
| 4.1.0, 4.1.1, 4.1.2, 4.2.1, 4.2.2 | 2 | прежние v1/v2 формы; policy без номера | прежние требования |
| 4.2.3, 4.2.4, 4.2.5 | 2 | composition 2, policy 2 | без нового registry marker |
| 4.2.6, 4.2.7 | 2 | composition 2, policy 2 | обе обязательны |
| Все прочие | — | `unsupported_release` | silent downgrade отсутствует |

Inline bootstrap и pure spec содержат одинаковую builtin policy, связанную
поведенческими parity fixtures. У старых selected shapes поле
`registryVerification` остаётся отсутствующим. Client/owner сохраняют отдельный
узкий whitelist **4.2.2–4.2.7**. Предварительный owner byte-reader исторически
принимает formats 1/2; следующий полный verifier ограничивает допустимые пары
версии/формата. Standalone outer reader принимает только format 2 и точный
полный product whitelist как данные; manifest v3 не означает product version 3.
Текущий executable сохраняет v3 tooling gate и fixed trusted tools/spec slot.

Для 4.2.6 и 4.2.7 package verifier проверяет panel identity и точные registry bytes,
inline verifier — точные registry bytes; runtime после полной установки и
own-root guard проверяет panel identity до создания HTTP peer. Версия identity
должна совпадать с product version release. Точный manifest header выбирает
только нормализацию 4.2.6 или 4.2.7; прежние 4.2.6 bytes и identity сохраняются. Ранних imports
для этих проверок не добавлено. Receiver contract остаётся version 1,
descriptor 2 / journal 2 / terminal-read-failure disposition 1; owner contract
3/4 читается tooling по прежним правилам, текущий owner runtime требует 4.

Выбор mutation adapter выполняет фиксированный `profileFor` в
`core4/runtime/stdio-entry.js`, transport validator — фиксированные ветви
`core4/integrations/cep/http-peer.js`. Module declaration задаёт только
поддерживаемый profile; путь исполняемого adapter из candidate не принимается.

| Module | resultProfile | Fixed proof adapter в runtime | HTTP snapshot validator | Receipt / read-back |
| --- | --- | --- | --- | --- |
| project-inspection | read-only asset, без mutation profile | runtime observation | versioned project inspection | typed observation, без mutation receipt |
| titles-current-target | manual-text-v1 | manual-policy, без дополнительного factory | text/protected | local transaction receipt v1, text |
| photo-placeholder | photo-source-v1 | photo-source-proof | source/sourceId | receipt v2, source и защищённая цель |
| project-assembly | owned-project-assembly-v1 | project-assembly-proof | items/assemblies | receipt v2 и итоговая assembly |
| media-import | media-import-v1 | media-layer-proof | media snapshot | receipt v2, media/source proof |
| layer-insert | layer-insert-v1 | layer-insert-proof; прежний pinned media-layer fallback | stack/uses/source | receipt v2, layer/source proof |
| layer-overlay | layer-overlay-v1 | layer-overlay-proof | stack/signature/overlay | receipt v2 и overlay/source proof |
| project-save | current-project-save-v1 | project-save-proof | saved project snapshot | receipt v2, disk observation |
| project-lifecycle | project-lifecycle-v1 | project-lifecycle-proof | lifecycle/currentProject/inventory | receipt v2, transition observation |
| titles-point-layout | manual-point-layout-v1 | point-layout-proof | text/style/geometry | receipt v1, measured layout |
| text-layer; TEMP fixture-owned-text-layer | owned-text-layer-v1 | text-layer-proof | layers/size/guides | receipt v2, styles/geometry/siblings |
| text-variant | owned-text-variant-v1 | text-variant-proof | layers | receipt v2, staged variants |
| comp-render | owned-comp-render-v1 | comp-render-proof | layers/job/render/queue | receipt v2, owned render result |
| comp-frame-export | comp-frame-export-v1 | comp-frame-export-proof | frame dimensions/fullResolution | receipt v2, PNG/file proof |

Общая mutation проверка `manual-policy.verifyCompletion` связывает original
completion, command/executor/payload, checkpoint, proposal/plan, target и protected
baseline. HTTP validator проверяет форму snapshot прежде profile proof. Generic
Broker receiver остаётся отдельным typed protocol/authority маршрутом и не
является новым произвольным HTTP result profile.

Переносимость доказана для **owned-text-layer-v1**: TEMP-only module имеет
собственные contract/manifest/admission pins, прежние input/result/effect и native
confirmation; исходный text-layer в состав не входит. Actual builder, inline/spec,
verified stdio start, production adapter factory, подписанный HTTP/CEP VM,
receipt и свежее чтение проверяют создание, targeted edit и сохранение sibling.
Cancellation остаётся `local_cancelled`/stopped, испорченный receipt не даёт success
или replay. Windows observation и AE в fixture синтетические; это offline proof,
не native acceptance и не authority установленной системы.

Identity-bound profiles и `OPERATOR_EFFECTS` не расширены. Новый module ID с
manual-text-v1 либо operatorConfirmation отклоняется. Новая форма effect/receipt
или confirmation binding требует отдельного reviewed trusted adapter; plugin ABI
и постоянного production fixture module нет.
