# Офлайн-аудит пригодности проверок Core к облачному запуску

**Перенос на MSI, 3 ноября 2026:** инструмент интегрирован поверх локальной
базы `db68140380f52fc630078317512e5ae1df3c273c` и проверен на Windows/Node
`v24.15.0`: 15/15 собственных тестов. Файлы `reports/baseline.{json,txt}` и
`reports/fixtures.{json,txt}` созданы заново на Windows; это не исходные Linux
отчёты. Текущая карта: 71 проверка, 3 `cloud-candidate`, 68
`insufficient-information`. Историческая таблица ниже относится к облачной базе.
Происхождение и границы переноса — [milestone](../plans/core-cloud-intake-20261103.md).

Инструмент `tools/cloud-checks-audit/cli.cjs` читает карту проверок и исходники как
данные. Он помогает выбрать следующие проверки, но не выполняет команды карты,
не импортирует код Core и не выдаёт результат тестирования или сертификат
переносимости. `cloud-candidate` означает только кандидата для отдельного
разрешённого запуска. Выход `0` означает создание отчёта.

## Исходная база и границы работы

Зафиксировано 3 ноября 2026 года:

| Параметр | Значение |
| --- | --- |
| Репозиторий/origin | `https://github.com/aitonpro54/AE_agent.git` |
| Требуемая и фактическая ветка работы | `AE-Agent-Core-4.0.1` |
| Baseline commit | `2b285133136f0e728bc0cf0a33c652bfce316667` |
| Платформа проверки | Linux `6.18.57`, x86_64 (`linux/x64`) |
| Node | `v24.19.0` |
| Рабочий checkout | `/workspace/AE_agent-core-audit` |
| SHA-256 карты | `d7d02fa271d317cd5b2b362f544c02848147072d2e5bfdfdf67eae387d352d35` |

Первоначально предоставленный `/workspace/AE_agent` находился на `work`, commit
`b66404628a5ef56c1c6061a67a5e34c17773d233`, соответствующий
`origin/codex/release-3.3.0`. Там отсутствовали обязательные файлы Core. Он сохранён
без изменений. `git ls-remote --heads origin refs/heads/AE-Agent-Core-4.0.1`
подтвердил требуемую ветку и её SHA; создан отдельный checkout именно этой ветки.
Default/legacy не использовались как база реализации. Origin и HEAD повторно
сверены в новом checkout.

До реализации прочитаны `AGENTS.md`, `docs/portability.md`,
`core4/config/validation-map.json`, `core4/tools/validate-diff.js` и
`core4/package.json`; исследованы объявленные файлы, каталоги и literal imports.
Новое поручение на облачный офлайн-инструмент задаёт рабочую среду и имеет
приоритет над историческим Windows cwd в AGENTS.md. Работа выполнена без
делегирования по прямому запрету пользователя. План и существующие исходники
не изменялись: ownership ограничен новым каталогом инструмента и этим документом.
Проверка упаковки первого облака и Windows host probe/native B6 у MSI остаются
у их владельцев. Titles/Slideshow не возобновлялись.

## Запуск

Сторонних зависимостей и установки нет; CLI использует только встроенные модули
Node, минимальная версия — Node 18. Для повторения данной верификации нужна
записанная выше версия Node 24.19.0.

Из корня репозитория:

```sh
node tools/cloud-checks-audit/cli.cjs
node tools/cloud-checks-audit/cli.cjs --format json
node tools/cloud-checks-audit/cli.cjs --check controller-lease --format json
node tools/cloud-checks-audit/cli.cjs --root /path/to/AE_agent/core4 --format text
```

Root по умолчанию вычисляется относительно инструмента, а не cwd. `--root`
указывает корень Core (`core4`); `--map` — относительный путь внутри этого root.
По умолчанию это `config/validation-map.json`. `--check` можно повторять.
Форматы: `text` (по умолчанию) и `json`. Отчёт идёт в stdout; сам CLI ничего не
записывает. Внешнее перенаправление вывода создаёт файл по выбору вызывающего.
Параметров `--run`, `--output` и запуска npm scripts нет.

Fixtures анализируются тем же CLI:

```sh
node tools/cloud-checks-audit/cli.cjs --root tools/cloud-checks-audit/fixtures --map validation-map.json --format text
```

Код `2` означает ошибку аргументов, root, JSON или схемы карты. Если для JSON
ошибок нужен машинный формат, указывайте `--format json` первым. Недоступная
зависимость отдельной проверки даёт `issues` и неопределённость в готовом отчёте,
а не объявление проверки успешной. Пустая/некорректная карта отвергается целиком.

## Категории и основания

| Код JSON | Значение и правило |
| --- | --- |
| `cloud-candidate` | Изучены поддержанный Node argv и literal imports, не осталось распознанных препятствий. Вывод эвристический; запуск ещё нужен. |
| `platform-dependency` | В самом argv явно назван Windows executable, например `powershell.exe`/`cmd.exe`. Фактическое выполнение не утверждается. |
| `native-ae-evidence-required` | В argv явно назван `AfterFX.exe`/`aerender` или соответствующее имя без расширения; нужен отдельный native evidence. |
| `insufficient-information` | Команда, зависимость, вычисляемая загрузка, ветки, VM/mock или иные признаки не позволяют сделать более определённый вывод. |

Наличие argv с Windows/AE executable — более узкий факт, чем пригодность всей
проверки: отчёт сохраняет и нерешённые `issues`. Известные имена executable
распознаются по basename; реальный binary/PATH не обнаруживается и не проверяется.
`pwsh` не приравнивается к Windows PowerShell, произвольные команды не угадываются.

`basis: explicit` обозначает прочитанную декларацию, команду или конкретный
синтаксический факт. `basis: heuristic` обозначает предположение по тексту или
вывод ограниченного анализа. `component`/`integration` из `checkPolicy` не
определяет переносимость. Слова Windows, native, JSX и имена файлов не доказывают
необходимость среды. Признаки VM/mock также не доказывают полноту изоляции.

В частности, `skip: process.platform !== 'win32'` фиксируется как явный факт
`windows-skip-gate`. Без разбора test registration и `--test-name-pattern`
не установлено, какие выбранные тесты он охватывает. Поэтому смешанная группа
остаётся в `insufficient-information`. Даже если часть группы допускает Linux,
пропуск Windows ветки не закрывает её покрытие.

`nativeEvidence.status` — отдельное поле: `separate-required` при явной AE-команде,
иначе `not-established`. Последнее означает «не установлено данным обзором»,
а не «native evidence не нужен». Никакая категория не закрывает P1–P8 из
`docs/portability.md` или native B6.

## Что читает инструмент

1. `checkDependencies` задаёт список проверок и объявленные зависимости.
   Каталоги раскрываются рекурсивно. Проверяются `checkPolicy.kind` и argv в
   `checkCommands`; проекции из `checkProjections` читаются и проверяются на
   наличие указанного `id`.
2. Для отсутствующих `checkCommands` воспроизводится изученный fallback
   `['node','--test','--test-name-pattern=' + check,'test/core4.test.js']` из
   `validate-diff.js`. Наличие известного фрагмента сверяется текстом; это модель,
   не выполнение и не доказательство семантической эквивалентности validator.
3. Полностью поддержанная форма команды — четыре элемента этого Node argv.
   Из входного файла извлекаются literal `require`/`import`/`from`, читаются
   локальные файлы с расширениями `.js/.cjs/.mjs/.json` и `index`-варианты.
   Внешний package import остаётся неизвестным: `node_modules` не используется.
4. Объявленная closure и closure literal imports сохраняются отдельно.
   `scope: declared-only` не означает достижимость. Даже literal import не
   доказывает вызов функции или запуск именно выбранного теста. Неоднозначный
   признак в declared-only файле сохраняет «недостаточно сведений», но не выдаётся
   за доказанную необходимость Windows/AE.

В JSON есть команда, причина, категория, декларации зависимостей с раскрытыми
файлами, `reachableFiles`, `issues`, краткие `observations` и `evidence` с файлом,
строкой либо JSON pointer. Общие `sources` содержат SHA-256 прочитанных bytes и
все распознанные признаки, а общий `imports` — найденные edges. В `observations`
выбирается один пример каждого вида признаков, предпочтительно из entrypoint;
`observationCount` даёт полное число, остальные доступны в `sources[].findings`.
Пути файлов в отчёте относительны `root`.

Symlink/junction и выход за root отвергаются; чтение ограничено 2 MiB на файл,
3000 файлами, глубиной каталогов 40 и глубиной imports 100. Отсутствующие,
нетекстовые или слишком большие зависимости оставляют диагностируемый пробел.
Вспомогательно читаются HEAD/refs соседнего `.git`, без Git-процессов: это метка
checkout, а не проверка чистоты. Для worktree с `.git`-файлом метка отсутствует.

## Отчёт по baseline

Полный отчёт: [JSON](../tools/cloud-checks-audit/reports/baseline.json),
[текст](../tools/cloud-checks-audit/reports/baseline.txt). Он сформирован из
доступного checkout до commit инструмента; прочитано 183 уникальных файла.
В карте 58 проверок, 49 явных команд и 9 fallback-команд. Неразрешённых
файловых/import ошибок в этом baseline не найдено; неоднозначность относится
к среде исполнения и ограничению статического анализа.

| Категория | Количество |
| --- | ---: |
| Кандидат для облачной проверки | 1 |
| Явная платформенная команда | 0 |
| Явная AE-команда | 0 |
| Недостаточно сведений | 57 |

Единственный кандидат — `controller-lease`: команда из карты,
`test/controller-lease.test.js`, literal import `runtime/controller-lease.js`
и встроенные `node:test`, `node:assert/strict`, `node:crypto`. Это не утверждение,
что тесты выполнялись или что release переносим.

Нули в двух средних строках не означают отсутствие Windows/native требований:
вся карта использует Node-команды. Например, `windows-owner-process` содержит
VM-подмены и реальную Windows CIM self-PID ветку; `native-read-capture` содержит
VM-панель и отдельные Windows PowerShell 5.1 проверки. Автоматическое решение
о пригодности всей такой группы было бы чрезмерным. Для `windows-cim-probe`
зафиксированы `t.mock.method` и Windows-названия, а не доказательство реального CIM.

Пример сокращённой записи:

```json
{
  "check": "controller-lease",
  "category": "cloud-candidate",
  "basis": "heuristic",
  "command": {
    "argv": ["node", "--test", "--test-name-pattern=controller-lease", "test/controller-lease.test.js"],
    "source": "map",
    "executed": false
  },
  "nativeEvidence": {"status": "not-established"}
}
```

Отчёты по собственным fixtures: [JSON](../tools/cloud-checks-audit/reports/fixtures.json),
[текст](../tools/cloud-checks-audit/reports/fixtures.txt). Они содержат переносимую
проверку, Windows argv, AE argv, VM/mock, комментарий с Windows/JSX, неизвестный
package import, dynamic require, missing dependency/entrypoint и unsupported argv.
Исходник с немедленным `throw` служит ловушкой ошибочного импорта.

## Проверки реализации

```sh
node --test --test-isolation=none tools/cloud-checks-audit/test/audit.test.cjs
node --check tools/cloud-checks-audit/cli.cjs
node --check tools/cloud-checks-audit/audit.cjs
node --check tools/cloud-checks-audit/source.cjs
node --check tools/cloud-checks-audit/test/audit.test.cjs
git diff --check
```

Focused tests: **15 выполнено, 0 ошибок, 0 пропусков**. Проверены все четыре
категории, разграничение mock/VM/упоминаний, отсутствие исполнения входных
исходников, ошибки input/схемы, fallback, projection, directory dependencies,
import cycles, traversal, symlink и детерминированность. Также выполнен
`node --check` для каждого нового `.js/.cjs` fixture; JSON/text CLI запущен
отдельно на fixtures и baseline. `git diff --check` — без ошибок.

В этой среде обычный `node --test` не смог создать тестовый subprocess: sandbox
возвратил `EPERM` (stdout дочернего процесса был пуст). Использован штатный
`--test-isolation=none` Node 24; обработчик аргументов CLI проверяется в процессе,
а настоящие CLI-вызовы отдельно проверены shell-командами. Расширение прав
для выполнения suites не потребовалось. На обычном Windows Node runner может
использовать стандартный `node --test tools/cloud-checks-audit/test/audit.test.cjs`.

## Что родителю проверить на Windows

Ниже перечислены оставшиеся проверки, а не поручение выполнить их из облака.
Их запуск, особенно native B6, относится к отдельному разрешённому scope родителя
и MSI. Новые изменения первого облака и MSI сначала нужно сверить с exact commit
и bytes; этот отчёт относится только к указанному baseline.

1. Повторить собственные focused tests и CLI на Windows, записать Windows/Node
   версии, commit и hashes, сверить категории без ожидаемого равенства host metadata.
   В частности проверить обработку путей с пробелами/кириллицей, symlink/junction
   отказ и JSON UTF-8; данный Linux-прогон этого не подтверждает.
2. Сверить реальные Windows-only участки с выбранными именами тестов:
   `core4/test/windows-owner-process.test.js:102` (CIM self-PID/birth),
   `core4/test/windows-retained-process.test.js:23` и `:30` (retained handle/EOF
   и прекращение строго fixture-child), `core4/test/client-launcher.test.js:3`
   (Windows guard общего wrapper), `core4/test/client-entry.test.js:82` и `:114`
   (junction и IPC). Пропуски на Linux не заменяют эти исходы.
3. Проверить Windows PowerShell 5.1 ветки
   `core4/test/native-read-capture.test.js:198` и `:208`: UTF-8 stdin, paths,
   Get-Item/reparse и версия PowerShell. Во второй ветке CIM явно подменён;
   даже реальный PowerShell в этой fixture не доказывает production host probe.
4. Получить evidence настоящего Windows host probe у MSI: фактические CIM/process
   identity, PID/birth/executable, native profile, точные Node/AE identity и отказы
   среды. `core4/test/windows-cim-probe.test.js:36` подменяет `execFile`, а
   `windows-owner-process.test.js:10–14` использует VM; их успешность не является
   production host evidence. Guard, найденный в declared-only closure
   `lifecycle-simulation`, не доказывает вызов этого guard данной группой.
5. Отдельно проверить native delivery/recovery B6 в настоящих AE/CEP через
   установленный configured путь: текущее подключение/identity, фактическую
   разрешённую typed read-only доставку и read-back, соответствующий recovery
   сценарий с точными bindings и сохранением pending/UNKNOWN/fences/no-replay.
   Записать исход каждого шага и пробелы; Node VM/mock и Linux-анализ этого
   не подтверждают. Установку, update/reset, restart, AEP/save или mutation этот
   инструмент и эта задача не разрешают.
6. Финальные P1–P8 требуют двух реальных машин и обоих направлений переноса,
   включая сохранность локальных identities/config/state и число ручных правок.
   Отчёт аудита и отдельная проверка упаковки могут быть основаниями лишь
   в своей области, без объявления round-trip завершённым.

## Ограничения

Лексер не является полным JS parser и не вычисляет ветки, selectors и точный
охват тестов. Не восстанавливаются произвольные aliases, generated modules,
package exports/loaders, все targets процессов и файлы, читаемые как данные.
Комментарии и строки с Windows/JSX дают только эвристические признаки. Наличие
capability builtins, host conditions и VM/mock сохраняет неопределённость даже
для фактически переносимых тестов: возможны ложные отрицания кандидатов.
Отсутствие распознанных признаков также не доказывает пригодность.

Hash manifest связывает отчёт с прочитанными bytes, но это не атомарный snapshot
при параллельной записи. Для повторяемого evidence родителю нужен стабильный
checkout выбранного commit. Данный CLI не проверяет Git diff, не выдаёт authority,
не закрывает native/release приёмку и не исполняет ничего из анализируемой карты.
