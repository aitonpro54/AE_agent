# Предварительная read-only проверка облачного Git bundle

Инструмент `tools/cloud-result-preflight/cli.mjs`, версия **1.0.0**, проверяет
явно указанный Git bundle относительно явно указанного локального рабочего
репозитория. Он помогает подготовить ручное решение об интеграции и сам её
не выполняет. Node built-ins и установленный Git — единственные зависимости;
исходники Core, installer, validation-map и конфигурация не изменены.

## Исходная версия и ownership

- Репозиторий: `aitonpro54/AE_agent`.
- Проверенный origin: `https://github.com/aitonpro54/AE_agent.git`.
- Ветка: **AE-Agent-Core-4.0.1**.
- Точный исходный commit: **2b285133136f0e728bc0cf0a33c652bfce316667**.
- Среда разработки/проверки: Linux x86_64, kernel 6.18.57,
  Node **v24.19.0**, Git **2.52.0**.

Начальная предоставленная копия содержала другую ветку `work` на
`b66404628a5ef56c1c6061a67a5e34c17773d233` и не содержала portability.md.
Нужная ветка проверена через GitHub и `git ls-remote`, затем получена в
отдельную рабочую копию. AGENTS.md и docs/portability.md прочитаны именно
из нужной версии. Default/legacy не использовались как база реализации.
Указанный в AGENTS.md Windows root относится к локальной установке;
текущее прямое поручение разрешает автономную облачную разработку.

Ownership: только новый каталог `tools/cloud-result-preflight/` и этот новый
документ. Progress, решения и validation этого блока записаны здесь вместо
изменения общего плана. Другие облачные блоки и MSI B6 не затронуты.

## Запуск

Требуются Node **20+** и Git в PATH. Проверенный состав указан выше;
поддержка всех версий Git/ОС не заявляется. Установка зависимостей не нужна.
Инструмент можно запускать из любого cwd, задавая абсолютные пути к CLI и входам.
Относительные пути разрешаются относительно cwd вызывающего процесса.

```bash
node tools/cloud-result-preflight/cli.mjs \
  --bundle "/transfer/облачный результат.bundle" \
  --sha256 "<SHA-256, полученный отдельно из доверенного источника>" \
  --manifest "/transfer/манифест.json" \
  --target "/local/AE Agent Core" \
  > "/transfer/preflight-report.json" 2> "/transfer/preflight-summary.txt"
```

Однострочный вариант для PowerShell (читать русский Markdown как UTF-8):

```powershell
node tools/cloud-result-preflight/cli.mjs --bundle "D:/Transfer/результат.bundle" --sha256 "<64 hex>" --manifest "D:/Transfer/манифест.json" --target "C:/Users/Ant/Documents/Codex/AE_agent_core"
```

Все четыре входа обязательны. `--sha256` — отдельный аргумент, 64 hex символа;
он не читается из манифеста или соседнего файла. **Не вычисляйте ожидаемый хеш
из полученного bundle вместо независимого получения ожидаемого значения.**
Манифест внутри переданного пакета не является доказательством подлинности.
Подменённые вместе bundle, манифест и хеш могут согласованно пройти сравнения.

В stdout идёт один JSON-документ, в stderr — краткое русское объяснение:
что проверено, что блокирует, что неизвестно и следующий шаг. CLI не создаёт
файлы отчёта: перенаправления выше выполняет вызывающая оболочка. Выбирайте
путь отчёта вне целевого репозитория и входных файлов, иначе сама оболочка
может изменить цель или затереть вход **до запуска CLI**.

## Манифест v1

```json
{
  "schemaVersion": 1,
  "repository": {
    "identity": "github.com/aitonpro54/AE_agent",
    "origin": "https://github.com/aitonpro54/AE_agent.git"
  },
  "sourceBranch": "AE-Agent-Core-4.0.1",
  "baseCommit": "1111111111111111111111111111111111111111",
  "resultCommit": "2222222222222222222222222222222222222222",
  "refs": [
    {
      "name": "refs/heads/cloud-result",
      "commit": "2222222222222222222222222222222222222222"
    }
  ]
}
```

SHA выше условные. Реальные значения берутся из выбранных commits отправителя.

| Поле | Контракт v1 |
| --- | --- |
| `schemaVersion` | Число `1`; неизвестные версии/поля отклоняются |
| `repository.identity` | Нормализованный locator `host[:port]/path`, совпадающий с origin |
| `repository.origin` | HTTPS URL, SSH URL или SCP-подобный SSH origin; локальные пути/другие протоколы не поддержаны |
| `sourceBranch` | Имя исходной ветки, без обязательного совпадения с именем переносимого ref; сравнивается с текущей локальной веткой |
| `baseCommit` | Полный SHA commit, от которого начата облачная работа |
| `resultCommit` | Полный SHA результата; обязан быть вершиной хотя бы одного заявленного ref |
| `refs` | Полный точный набор 1–128 переносимых `refs/heads/*`, без повторов; лишний ref bundle блокирует результат |

SHA — 40 символов для SHA-1 или 64 для SHA-256, в нижнем регистре и одного
формата во всём манифесте. V1 намеренно не поддерживает tags/HEAD, частичные
refs и сокращённые SHA. JSON — до 64 КиБ; заголовок bundle — до 1 МиБ,
не более 128 разных prerequisites. Поддерживаются bundle v2 и v3 с единственной
необязательной capability `object-format=sha1|sha256`; filter/другие capabilities
не считаются проверенными и отклоняются этим форматом инструмента.

Нормализация origin удаляет userinfo, query, fragment, завершающие `/` и `.git`;
host приводится к нижнему регистру, регистр path сохраняется. HTTPS/SSH к одному
host/port/path эквивалентны, стандартные HTTPS 443 и SSH 22 опускаются.
Windows drive paths, включая `C:relative`, отклоняются до разбора SCP-подобного origin.
Identity — сопоставление locator из локальной конфигурации, **не доказательство
истории или владельца репозитория**. Перенаправление URL через `insteadOf`,
сетевые redirects, remote сервер и права доступа не проверяются.

## Что проверяется

1. Файловый SHA-256 сравнивается с отдельным аргументом. Из заголовка читаются
   формат и SHA prerequisites; сообщения commits не выводятся. Поток PACK
   проверяется по magic/version и встроенному SHA-1/SHA-256 trailer без распаковки.
2. Для bundle с подтверждённой целостностью выполняются штатные
   `git bundle verify --quiet <bundle>` и `git bundle list-heads <bundle>`
   относительно цели. Для несовпадающего хеша/повреждения эти команды пропускаются
   с явным `unverified`.
3. Полный набор `(ref, SHA)` сравнивается с манифестом, result SHA — с вершиной
   переносимого branch ref. Это проверка объявлений заголовка, а не всех объектов.
4. Проверяются корень небезголого рабочего репозитория, его object format
   (отдельно от verify: полный bundle другого формата может пройти verify)
   и единственный прямой
   `remote.origin.url` из local config с `--no-includes`. Отсутствующий,
   неоднозначный или неподдерживаемый origin остаётся непроверенным.
   При наличии local include/includeIf или extensions.worktreeConfig identity/origin
   также остаются непроверенными: прямой local URL не подменяет эффективные слои.
   Credentials origin и сырой Git stderr не выводятся.
5. Читаются текущие branch/HEAD, tracked/staged/conflicted/untracked status,
   локальный base commit, prerequisites и соотношение HEAD с базой. Submodules
   и ignored файлы исключены с явным пробелом покрытия. Неинициализированный
   HEAD и detached HEAD не считаются совпадением ветки. При assume-unchanged или
   skip-worktree чистота рабочего дерева остаётся `unverified`.
6. Если оба commits уже есть в цели и история полна, проверяется base → result.
   При отсутствующем result, shallow history или grafts эта связь остаётся
   `unverified`; объекты из bundle ради неё не импортируются.
7. Сопоставляются начальные/конечные branch/HEAD/refs/origin/config layers/status и метаданные
   bundle. Изменение во время проверки блокирует доверие к отчёту.

Git вызывается через `spawnSync('git', args, {shell:false})`, с ограничением
30 секунд и 4 МиБ вывода на команду. Наследуемые `GIT_*` удаляются;
`GIT_OPTIONAL_LOCKS=0`, `GIT_NO_LAZY_FETCH=1`, `GIT_NO_REPLACE_OBJECTS=1`,
`protocol.allow=never`, отключённые fsmonitor/untracked cache/auto maintenance
ограничивают чтение и исключают скрытую загрузку promisor objects. Global/system
Git config не используется, local config цели не изменяется.

Нет fetch/import/unbundle/index-pack, checkout, merge, reset, clean,
установки, изменения Git/AE/MCP/CEP-конфигурации, сетевых команд, распаковки
архивов, копирования runtime state/credentials. CLI не вызывает AE/CEP/MCP.
Создание commits/refs/clone в тестах относится только к подготовке собственных
временных fixtures, не к работе CLI.

## Статусы и решение

| Значение | Смысл / следующий шаг |
| --- | --- |
| `passed` | Конкретное сопоставление прошло в указанной области |
| `hash_mismatch`, `invalid_bundle`, `git_rejected_bundle` | Проверить входы/источник; отдельно выяснить отказ Git, сырой stderr скрыт |
| `refs_mismatch`, `result_mismatch`, `mismatch` | Разобрать несогласованность манифеста и bundle |
| `repository_mismatch`, `origin_mismatch`, `invalid_target` | Указать правильную цель или согласовать identity отдельно |
| `branch_mismatch`, `detached_or_unborn` | Отдельно выбрать локальную ветку/условия интеграции |
| `missing_base` | База недоступна как локальный commit; это не заменяется наличием базы внутри bundle |
| `missing_prerequisites` | Git не может использовать incremental bundle с текущим набором локальных объектов |
| `dirty_worktree` | Есть локальные изменения; сохранить и согласовать их отдельно |
| `local_ahead`, `local_behind`, `history_diverged` | HEAD не равен базе; сохранить обе истории и согласовать дальнейшую интеграцию |
| `changed_during_check` | Вход/цель изменились; повторить проверку стабильного состояния |
| `unverified` | Данных недостаточно, команда недоступна/превысила лимит либо проверка явно вне scope |
| `invalid_input` | Исправить входы/формат манифеста |

`decision` и exit code:

- `manual_review_required`, **0**: обязательные предварительные проверки прошли.
  Остаются явно перечисленные ограничения и ручное рассмотрение.
- `blocked`, **1**: есть несовпадение или конкретное блокирующее условие.
- `incomplete` / `input_error`, **2**: обязательная проверка не выполнена либо
  входные параметры некорректны.

В каждом отчёте **`integrationAllowed: false`**, включая exit 0. Нельзя
использовать код 0 как разрешение автоматически применить изменения.
Массив `checks` содержит выполненные/пропущенные проверки, `unknowns` —
ограничения области проверки. Например, отсутствующий локально result не мешает
сопоставить его SHA с объявлением bundle, но не даёт проверить его историю.

## Пример отчёта

Полный **Windows example** от собственных временных репозиториев:
[`report.v1.example.json`](../tools/cloud-result-preflight/fixtures/report.v1.example.json).
Он помечен `exampleOnly: true`; случайный temp root заменён на `<temporary fixture>`.
Поле `environment.platform` равно `win32`; пример заново сгенерирован на MSI
штатным `test/example.mjs`, а не перенесён из Linux evidence.
Это демонстрация формата, не результат проверки входящего пользовательского кода.
В нём все 20 предварительных checks прошли, но пять ограничений явно открыты.
Сокращённый фрагмент:

```json
{
  "reportVersion": 1,
  "toolVersion": "1.0.0",
  "decision": "manual_review_required",
  "integrationAllowed": false,
  "checks": [
    {"id": "bundle_sha256", "status": "passed"},
    {"id": "git_bundle_verify", "status": "passed"},
    {"id": "head_vs_base", "status": "passed"}
  ],
  "unknowns": [
    {"id": "base_to_result", "status": "unverified"},
    {"id": "ae_compatibility", "status": "unverified"}
  ],
  "exitCode": 0
}
```

## Progress / Decision Log / Validation

Реализованы CLI, строгий манифест v1, потоковая проверка без импорта и русские
JSON/человеческие результаты. Ограниченный формат branch refs выбран, чтобы не
объявлять annotated tag commit без распаковки. PACK checksum добавлена отдельно:
успешный `git bundle verify` сам по себе не проверяет весь PACK payload.
В отсутствие локального result его ancestry намеренно остаётся неизвестной.

Focused проверки, из корня этой рабочей копии:

```bash
node --test --test-reporter=tap tools/cloud-result-preflight/test/preflight.test.mjs
node tools/cloud-result-preflight/test/example.mjs
find tools/cloud-result-preflight -name '*.mjs' -exec node --check '{}' \;
git diff --check
```

Тесты создают настоящие full/incremental Git bundles, включая SHA-256 v3,
в собственных временных репозиториях с пробелами и Unicode. Во всех вызовах
сравнивается полный снимок **целевой** директории: пути, типы, mode, mtime,
SHA-256 содержимого файлов, symlink targets, включая `.git`, ODB, index, config,
refs и reflogs; atime не сравнивается, поскольку чтение может его менять.
Проверяется и отсутствие импортированного result object.

Покрыты корректный bundle, неверный внешний hash, повреждённый заголовок,
повреждение/усечение PACK даже с пересчитанным внешним hash, несовпадения и лишние
refs/result, чужой независимый репозиторий, отсутствующая база, недоступные
prerequisites, dirty/staged/untracked, local ahead/behind/divergence, другая ветка
и detached/unborn HEAD, credentials/query в origin, неоднозначный/отсутствующий origin,
непроверенный origin при include/worktree config,
неверные входы/версия/refs/injection, неверный target root, ambient Git overrides,
отключённый fsmonitor, shallow history, локально доступная связь base → result,
отдельная блокировка разных object formats при успешном native verify,
скрывающие изменения флаги индекса и POSIX read-only файлы.

Первый запуск внутри ограниченного sandbox не смог создать дочерний Node
(`EPERM`); отдельный прямой запуск выявил именно эту причину. Focused tests
повторены с разрешением запуска дочерних процессов.

Результаты 3 ноября 2026, на указанном исходном commit + данном diff:

| Команда / проверка | Результат |
| --- | --- |
| `node --test --test-reporter=tap tools/cloud-result-preflight/test/preflight.test.mjs` | **25 PASS, 0 FAIL, 0 SKIP**, exit 0, 11.99 с |
| `node tools/cloud-result-preflight/test/example.mjs` | exit 0; 20 passed checks, 5 unverified ограничений; `integrationAllowed: false`; snapshot цели совпал |
| `node --check` для всех 8 `.mjs` | exit 0 |
| `git diff --check` и `git diff --cached --check` | exit 0 |
| Ownership diff | Только `docs/cloud-result-preflight.md` и `tools/cloud-result-preflight/`; все файлы новые |

Отдельный локальный commit содержит только эти пути, без push/PR.
Полный diff после получения commit можно просмотреть так:

```bash
git show HEAD -- docs/cloud-result-preflight.md tools/cloud-result-preflight/
```

Полная release-проверка и Core validation-map не запускались: новый инструмент
автономен, не импортирует production-модули и не меняет их contracts. Адресная
приёмка этого блока — собственные реальные Git fixtures и перечисленные checks.

### Локальная проверка переноса на Windows, 3 ноября 2026

Источник переноса — baseline `2b285133136f0e728bc0cf0a33c652bfce316667`,
result `694731c71b499461ce32a61b062470effb58313d`; девять исходных файлов
восстановлены из recorded diffs. Проверка выполнена в изолированном staging,
без импорта облачной истории в действующий Git. Среда: Windows x64,
Node `v24.15.0`, Git `2.54.0.windows.1`. Исторические Linux результаты выше
сохранены как provenance и не считаются Windows evidence.

Локальные изменения: нормализатор теперь отклоняет Windows drive origins,
которые ошибочно выглядели как SCP locator; добавлен regression test. Перед
recursive cleanup каждый test fixture проверяет canonical path, ожидаемый
непосредственный temp parent и собственный префикс имени. Основной CLI не
получил новых writes. Example JSON создан заново и явно привязан к `win32`.

Команды из корня Core после переноса файлов:

```powershell
node --test --test-reporter=tap tools/cloud-result-preflight/test/preflight.test.mjs
node tools/cloud-result-preflight/test/example.mjs
Get-ChildItem tools/cloud-result-preflight -Filter *.mjs -Recurse -File | ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE -ne 0) { throw "Syntax check failed" } }
```

Первый Windows прогон до исправления drive origins: **24 PASS, 0 FAIL,
1 POSIX-only SKIP**, 49.194 с. Все 8 `.mjs` прошли `node --check`.
Итог после исправления: **25 PASS, 0 FAIL, 1 POSIX-only SKIP**, 26 tests,
49.045 с, exit 0. Включены новый Windows-origin regression и все прежние
зависимые manifest/origin/CLI scenarios; повторный `node --check` для 8 `.mjs` — PASS.
Сгенерированный example: exit 0, 20 passed checks, 5 unverified ограничений,
`integrationAllowed: false`; полный snapshot fixture target совпал.
Итог повторного focused прогона и hashes staging-файлов сохраняются отдельно
в локальном `task3-validation.json`/`.log`; это evidence технической проверки,
а не разрешение интеграции или native приёмка Core.

## Ограничения

- Совпадение SHA-256 доказывает только совпадение байтов с ожидаемым хешем.
  Оно не доказывает качество кода, происхождение манифеста или совместимость с AE.
- PACK trailer тоже не удостоверяет автора и не заменяет проверку всех объектов,
  diff, тестов и истории в отдельно разрешённом процессе. Объекты не извлекаются.
- Git и локальные метаданные цели считаются доверенными. Полного filesystem
  sandbox против вредоносного Git/local config инструмент не создаёт. Названные
  входы могут быть symlinks; canonical paths отражаются в отчёте.
- Два наблюдения Git не являются атомарным снимком/блокировкой. Модификация
  tracked bytes с неизменным status может быть не видна; полная побайтовая
  неизменность доказана только на контролируемых тестовых fixtures. Перед будущей
  интеграцией нужен новый контроль исходного состояния в самом процессе применения.
- Флаги assume-unchanged/skip-worktree обнаруживаются; при их наличии чистота
  рабочего дерева остаётся непроверенной. Ignored файлы, submodule worktrees,
  внешние вложенные репозитории и runtime
  state не исследуются. Это явно ограничивает смысл «чистого» рабочего дерева.
- При ошибках доступа/лимитах команды диагностика может быть обобщённой ради
  исключения credentials из Git stderr. Неизвестное не считается `passed`.
- Windows read-only Git preflight проверен на указанном MSI Node/Git, включая
  пробелы/Unicode и полный snapshot `.git`/рабочих файлов fixtures. POSIX-only
  проверка прав пропущена; Windows ACL, конкурентные locks/записи и все сочетания
  Git/Node/ОС не доказаны. Эта проверка не закрывает Windows host probe, native
  delivery, recovery, runtime/установку и двухмашинную приёмку P1–P8 из portability.md.
