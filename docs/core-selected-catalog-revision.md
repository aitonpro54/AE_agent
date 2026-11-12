# Identity выбранного каталога

Новые builds используют `selected-v1-` и SHA-256 canonical JSON preimage из
`tools/package-installable.js`. Это packaging-only функция одного writer;
runtime spec, authority и проверка исторических пакетов её не импортируют.

Preimage v1 содержит domain `ae-core4-selected-catalog`, version 1,
composition `{version,id,policyVersion}`, упорядоченные selected module entries
`{id,version,path,admission}` с hash parsed artifact/admission, выбранный engine
`null` либо `{path,artifactHash}`, упорядоченные asset declarations с такими же
pins, выбранные profiles/capabilities и registryVerification. Inspection artifact
может одновременно быть admission. Optional поля declaration/profile сохраняются
только там, где они реально присутствуют в проверенных JSON-данных.

Canonical сортирует object keys, порядок arrays сохраняет. Revision не включает
себя, package hash, исходный source catalog целиком, исключённые modules,
timestamps, machine paths и runtime identities. Изменение общих runtime bytes
может менять package hash без изменения catalog revision. Изменение форматирования
JSON меняет package bytes, но parsed metadata pin сохраняет смысловую identity.

Сначала полный состав проверяется существующим derive на приватных in-memory
данных. Затем revision вычисляется один раз; наружу возвращается только финальный
пакет после прежней integrity/semantic/registry verification. Промежуточные данные
не записываются на диск и не выдаются как пакет. Readers продолжают принимать
прежние opaque revision strings. Revision не является authority или grant.

## Surface и транзитивные зависимости

B2 меняет identity каталога, сохраняя files/modules/assets/profiles/capabilities.
`manual-titles-variants` наследует `manual-titles → manual-layout → manual`:
photo-placeholder, titles, titles-current-target, titles-point-layout, text-layer,
text-variant, comp-render. Это широкий наследуемый состав; минимальность для
одного сценария не заявляется. Его сокращение требует отдельного списка
обязательных сценариев и явного surface diff.

Общие `render-job-history` и `render-job-maintenance` сохраняются и при отсутствии
активной render-jobs capability: owner maintenance и stopped update проверяют
прежние незавершённые задания, а start-over сохраняет эту границу перед остановкой.
Ссылки реализации: `runtime/owner-maintenance.js`, `tools/stopped-update.js`,
`runtime/stdio-entry.js`. Отсутствие активного renderer не доказывает отсутствие
сохранённых jobs. В B2 эти зависимости не удаляются.
