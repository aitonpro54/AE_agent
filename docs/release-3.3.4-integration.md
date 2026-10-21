# Интеграция AE Agent 3.3.4 — 21 октября 2026

## Исходные состояния

- Desktop `codex/release-3.3.2`: `4e7efc8526f35d83a4d36144608076d545f0b65d`.
- Laptop `origin/codex/release-3.3.3`: `1d246ae5a94238a54dadd5f2d01e9eb2eaf986ae`; подтверждён свежими `fetch --prune` и `ls-remote`.
- Общий предок: `63c8027a6832282810a7180c3dd5114b5e608cc6`; desktop-only 31, laptop-only 184 commits.
- Рабочая копия перед началом чистая. Новая ветка создана от exact desktop HEAD; предыдущие ветки и теги не перемещались.
- Annotated checkpoints: `checkpoint/ae-agent-3.3.2-before-3.3.4` и `checkpoint/ae-agent-3.3.3-before-3.3.4` на соответствующих exact HEAD.

## Progress

Подготовка Git и разрешение 29 конфликтных файлов завершены. Выполняется ancestry merge с сохранением обеих историй; текущий рабочий результат проходит offline-валидацию. Canonical product identity, manifest, bootstrap и fixture expectations согласованы на 3.3.4. Установка и проверка реального подключения выполняются root отдельно.

## Decision Log

- Архитектура/системные границы: `ae_architect`, Sol 6.1/XHigh, read-only. Инвентаризация canonical surfaces и установки: `ae_scout`, Luna/High, read-only.
- Root владеет Git и остаётся единственным live-контроллером. `ae_implementer` (configured Sol 6.1/High) — единственный integration writer: код, docs и offline-проверки. Архитектурные пересечения разобраны `ae_architect` (configured XHigh), независимое bounded review — `ae_reviewer`; исполнители не создают дополнительных агентов.
- Исторические evidence, testedAeContext и frozen-intake baseline сохраняются. Main, старые release-ветки и существующие теги не изменяются.

## Функциональная карта и решения пересечений

| Поверхность | Сохранённое поведение и решение |
|---|---|
| Desktop 3.3.2 | Hidden Windows MCP launcher, routing/reuse docs, common-title continuation и legacy initial startup recovery сохранены. |
| Laptop 3.3.3 | AME series/collector, собственные STATUS/acceptance, enqueue/open-comp/saved-source/queue control/global START, title-export verification, systemic session recovery и product reset включены с исходными guards. |
| Supervisor/native helper | Laptop controller mutex, CAS, successor barriers и reset APIs — общая основа. Desktop initial recovery использует тот же `controlled()` и controller-owned `launchInitialRecovery`. Helper требует mutex, deployment check, свободный endpoint и exact signed initial lease; top-level launch bypass не возвращён. |
| Публикация initial recovery | После launch выполняются `assertHeld()` и native `publishCurrent(generation,null)` с no-replace CAS. Потеря helper/lease или чужой pointer оставляют UNKNOWN/noReplay без completed receipt; повторный вызов читает результат и не запускает ещё один процесс. |
| Legacy generation selector | Bounded untrusted generation hint только выбирает legacy lane. Для той же generation обязательна полная fresh signed capability; другой product successor не наследует её authority и не блокируется её expiry/source pins. Исторические records не обновляются. |
| Bridge admission | Product-session-reset readiness остаётся обязательным AND. Только подтверждённый initial recovery использует ordinary transport/initial admission; остальные сохраняют product-stop/retained routing. Legacy initial не получает product-stop authority; productStopQuiescence сохраняет собственные child/attempt/transport guards. |
| AME manual grant | Laptop модуль и smoke заменяют desktop standalone precursor: v1 двух jobs сохранён, v2 добавляет один fresh job плюс verified completed-owned-prefix, last-dispatch guard и consumed grant. CEP/server wiring включён. Ни declaration, ни queued ACK не являются API proof всей очереди или media proof. |
| Common-title continuation | Desktop `failedRecoveryCaptureIdle` сохранён вместе с соответствующим cep-panel-control predicate. Он не заменяет общий native-control idle. |
| Source freshness | Runtime census содержит union двух веток; laptop loaded-collector freshness fence сохранён. Старые source-pinned receipts не объявляются актуальными. |
| Source byte pins | `.gitattributes` фиксирует LF только для `owned-runtime-control.js`, `owned-runtime-win32-helper.ps1` и `owned-runtime-daemon-helper.ps1`. Первые два восстановлены до канонических Git-байтов; pin нового merged daemon helper вычислен заново. Исторические authority/source pins не менялись. |

## Переносимость и существенные исключения

- Frozen intake/importer boundary, зависимости, provider/model/billing/permissions и окна контекста не изменялись. Исторические receipts, testedAeContext и source-pinned baseline не переписываются.
- `scripts/shared-queue-build/config.example.json` теперь не настроен: нет путей другой машины, старого commit/hash, AEP/EPR selectors, credential paths или прошлой авторизации. Все обязательные входы заполняются локально в ignored config с отдельным scope; пустой пример должен отклоняться preflight.
- Native initial-owned/sealed shared-queue профиль остаётся **экспериментальным, NOT DEPLOYED / NOT ACCEPTED на desktop**. `production_vendor_build_inputs.h`, reviewed physical file identities и compiler-input allowlist `shared-queue-build/identity.cs` сохранены в исходном Git-содержимом. Это непереносимые ограничения конкретной reviewed сборки: они действительно проверяются attestation, а не служат универсальными defaults. Переобход/регенерация allowlists и native rebuild/install в интеграции не выполнялись.
- Default deployment — `product`; наличие старых experimental directories не выбирает `initial-owned`. Native addon/sealed policy выбираются только явным initial-owned route. Trusted-read records, credentials, native binaries и установленное состояние ноутбука не переносятся. Операторские experimental CLI с фиксированными reviewed путями требуют отдельной локальной подготовки; не считаются переносимой установленной функцией 3.3.4.
- В additions проверены 229 файлов: generated runtime/binary/media в tracked additions отсутствуют; поиск типовых credential patterns не дал совпадений. VolumeGUID grammar и synthetic fixtures отделены от reviewed machine-bound allowlists. Это ограниченный source audit, не доказательство отсутствия секретов любого формата.
- Старые desktop/laptop live результаты остаются фактами соответствующих состояний, см. `docs/release-workflow.md`, `docs/crash-recovery.md` и exact source commits. Offline VM/loopback результаты ниже не доказывают live AE/AME, render/save или художественную приёмку 3.3.4.

## Validation

- PASS: fresh remote refs, clean исходная worktree, exact SHA/base/count, checkpoints и отсутствие 3.3.4 на remote перед началом.
- PASS: canonical 3.3.4, 169 JS/CJS/MJS syntax checks, XML13, PowerShell AST11, `npm.cmd run check:rules`, `git diff --check`. Source byte-pin EOL и атрибуты проверены отдельно. Conflict markers отсутствуют; frozen boundary проверяется неизменным rules manifest.
- PASS: **43 из 45 выбранных offline scripts** после адресных fixture исправлений. Среди ключевых: merged admission VM22; initial-recovery final24 + actual native-preflight AST с mock adapters7; supervisor91, service35, product reset65, initial contract150, initial-runtime24; continuation66; panel actions48/full VM16, completed-dry56; AME grant10 (v1/v2), semantic18, own-item acceptance9, origin36, series14, open-comp42/540 ES3; title-verifier33.
- PASS: isolated loopback fixture isolation24, bridge-only health, bootstrap110, product-startup route и systemic recovery E2E16. Fixture копирует allowlisted source closure в собственный temp root, удаляет runtime/provider env и не использует production authority/порт/AE/CEP. Snapshot working authority unchanged подтверждён самими isolation tests; это offline integration, не live proof.
- **FAIL:** `node --expose-internals scripts/ame-title-jobs-smoke.js` — старый case `unknown submit exact reconciliation...` ожидает `STATUS.ok=false` и отсутствие отдельного read до callback; laptop own-status контракт возвращает успешное независимое STATUS, сохраняя исходный sender UNKNOWN. Тест останавливается на этой несовместимой expectation; полный unit script не заявлен PASS. Производственный `ame-title-jobs.js` сохранён как в laptop; semantic18/acceptance9/origin36/pending8 проходят.
- **FAIL:** `node --expose-internals scripts/ame-job-source-smoke.js` — experimental серия111 достигает `mutation_origin_cache_bound` на 65-м item. Pure source/runner/native/hash tests до этого этапа проходят; защитный finite cache bound не увеличен. Этот snapshot producer остаётся frozen/unfinished по laptop product contract, не входит в переносимую принятую функцию 3.3.4.
- **BLOCKED / не проверено:** installed 3.3.4, live daily connection, AE/AME mutation/render/save и native initial-owned acceptance. Root read-only status обнаружил сохранённую desktop legacy registration и `legacyPresent=true`; старый pid отсутствует, listener отсутствовал. Laptop migration содержит historical machine-bound authority и не переносится на desktop. Для ежедневного desktop runtime нужен отдельный reviewed migration milestone; старые UNKNOWN/receipts не удалялись и laptop proofs не копировались.
- Предыдущие desktop limitations не использованы как оправдание: semantic fixture теперь проверена актуальным набором (18 PASS); common-title continuation66 проверен синтетическим deterministic evidence. Старые historical recovery/reconnect smoke, требующие отсутствующий ignored receipt, не запускались и не объявляются live proof.

### Исходные FAIL и точные fixture изменения

| Проверка | Причина и результат |
|---|---|
| Network isolation / bridge-only / bootstrap / recovery bridge (4) | Union census содержит desktop `scripts/owned-runtime-initial-recovery.js`. В laptop fixture добавлен только этот точный allowlisted source; запреты внешних модулей, production roots/env и ownership не расширены. Все 4 PASS. |
| Product startup route | VM stub дополнен `startupMode:false` для обычной product generation. Реальная legacy signature/generation проверяется отдельными initial-recovery cases; PASS. |
| Initial-runtime | Private multiplexed native port заменил прежний direct-owned seam; mocks учитывают pure source guards и controlled backend. Проверки unavailable ingress/нулевых effect ports сохранены; PASS24. |
| AME title jobs | Sender VM получил production-private preparation map/Buffer и frontend creation-failure listener/File-pin mock с temp-source allowlist. Final guard проверяет `not_sent`, точную diagnostic stage/originalCode и нулевой dispatch; дальнейший UNKNOWN/STATUS expectation остаётся FAIL выше. |
| AME job source | VM boundary ограничен только executor object, чтобы не захватывать соседний open-comp component. Исходная safety-проверка runner/checkpoint проходит; серия111 остаётся FAIL выше. |
| Title verification | Mutation membership проверяется в самом наборе без зависимости от порядка новых tools. Production M100/attached read-back проверки проходят; PASS33. |

Команды и полные локальные результаты: `.codex-runtime/release-3.3.4/` — `syntax-final.json`, `xml-parsing.json`, `ps-parsing.json`, `rules-final.txt`, `diff-final.txt`, `final-results.json`, `focused-final.json`, `additions-audit.json`, `offline/*.txt`. Эти ignored outputs не входят в source release. Git commit, push, установка и штатное read-only подключение принадлежат root и на момент source-проверок не заявлены выполненными.
