# Standalone installer: замыкание actual apply

29 октября 2026. Адресная часть C1 на базе `5b8c010`; установленный runtime,
существующие dist и их bytes не менялись. Это исправление упаковки, а не контракт
независимой установки capabilities.

## Решение

Прежние standalone-копии собирались вручную из eager imports. В actual apply
installer дополнительно загружает `tools/disposition-install-preflight.js`, когда
есть receiver journal. Dry-run без него не доказывал замыкание apply.

Новый `core4/tools/package-standalone-installer.js` собирает новый каталог из
проверенного manual/readonly payload, `candidate.json`, README и точного allowlist
четырёх bootstrap-файлов: `install-core4`, `package-installable`,
`disposition-install-preflight`, `standalone-installer`. Runtime payload по-прежнему
исключает `tools/`. Manifest связывает каждый файл и packageHash; builder выдаёт
отдельный distributionHash для review. Каталог назначения должен быть новым;
существующие файлы не обновляются. До первой записи builder проверяет каждый
существующий компонент пути родителя output: обычный каталог, без symlink/
junction/reparse и с точным realpath. Родитель должен уже существовать.

Entry `tools/standalone-installer.js` импортирует только Node builtins до проверки
reviewed distributionHash, полного дерева/bytes, точного bootstrap allowlist и
согласованности runtime payload с candidate. Missing/tampered/extra helpers
отклоняются до импорта installer. После этого используются существующие
`planInstall`/`applyInstall`, private prepared-plan brand, lease/CAS и прежние
signed-history/UNKNOWN/ownership gates. Hash manifest не выдаёт authority.
Bootstrap reader открывает file descriptor, сверяет его тип/identity и размер
через fstat **до чтения**. Лимит одного файла —16MiB; чтение ограничено исходным
размером и одним probe-byte для обнаружения роста. Descriptor закрывается при
любом исходе; изменение размера/короткое чтение означает отказ.

Entry требует явные абсолютные канонические native-пути `--install-root`
(имя `AEAgentCore4`), `--extensions-dir` и `--config`; текущий Node проходит
стандартную проверку installer. Discovery окружения, выбор installed defaults,
source checkout fallback и запуск MCP/CEP/AE отсутствуют. Для apply обязателен
reviewed packageHash из dry-run; distributionHash проверяется в обоих режимах.

Сборка из корня репозитория, с новым абсолютным output:

```powershell
node core4/tools/package-standalone-installer.js --composition manual --output C:\Temp\core4-standalone
```

Запуск из каталога собранного дистрибутива; все значения `ABS_*` заменяются
проверенными точными native-путями. Конкретная команда также включена в README:

```text
node tools/standalone-installer.js dry-run --expected-distribution-hash REVIEWED_DISTRIBUTION_SHA256 --install-root ABS_AEAgentCore4 --extensions-dir ABS_EXTENSIONS --config ABS_CONFIG_TOML
node tools/standalone-installer.js apply --expected-distribution-hash REVIEWED_DISTRIBUTION_SHA256 --expected-package-hash HASH_FROM_DRY_RUN --install-root ABS_AEAgentCore4 --extensions-dir ABS_EXTENSIONS --config ABS_CONFIG_TOML
```

## Проверки и границы evidence

`core4/test/standalone-installer.test.js`: **7/7 PASS**. Manual и readonly
собираются детерминированно: 59/40 runtime files, четыре bootstrap helper,
candidate и README. Реальные temp actual apply и повторный apply при receiver
journal выполняются отдельным Node с loader, запрещающим любой non-builtin
import вне test-owned TEMP; `listen` и child-process APIs также запрещены.
Checkout не может закрыть отсутствующий import. Installed/prod paths не читаются;
стандартная проверка Node читает только текущий executable.

Синтетическая signed history создаётся из существующего semantic format1 fixture
и проходит штатные crypto/lineage readers. Это **не byte-identical f548** и не
live receipt. Стандартный initial temp transition и последующий standalone apply
сохраняют первые три UNKNOWN records и весь journal побайтно. Original command
по-прежнему не повторяется. Forged control MAC и новый unrelated UNKNOWN
отклоняются с неизменными installation bytes. Отдельно проверены missing,
tampered, extra и omitted/rehashed helper, wrong reviewed hashes, обязательные
destination bindings и отказ builder на path traversal до создания output.
Review P2: output под настоящим test-owned junction отклоняется до mkdir,
resolved target остаётся побайтно прежним и новый каталог в нём отсутствует.
Review P3: oversized manifest и helper отклоняются по fstat до чтения payload
и до installer import; regression запрещает readSync на соответствующем fd.

Адресный `validate-diff` для пяти изменённых Core4 paths выбирает только
`standalone-installer`: **7/7 PASS** и `validation-routing`: **5/5 PASS**. Остальные
интеграционные closure отмечены маршрутизатором как deferred/current-closure-
unverified; release certification не заявляется. `check:boundaries`: **PASS**,28
файлов,liveCalls0 (до адресных P2/P3 fixes; повтор не требовался, runtime scope
сохранён). `git diff --check`: **PASS**. Адресные P2/P3 regressions: **2/2 PASS**.
После P2/P3 current checks выполнены раздельно: `validate-diff --run` для двух
tools и test →7/7; для validation-map →5/5. Логи в `$env:TEMP`:
`core4-standalone-review-fixes-validation.txt` и
`core4-standalone-review-fixes-routing.txt`.

Bootstrap verification — проверка reviewed локальных bytes, не OS sandbox и не
защита от одновременной враждебной записи после preflight. Штатные installed
lease/CAS защищают install/state по существующему контракту. Production apply,
restart, native AE/MCP/CEP calls, full release suite и P1–P8 не выполнялись.
Автоматическое environment discovery, независимая поставка capabilities и
фактический десктоп→MSI→десктоп остаются отдельными этапами.
