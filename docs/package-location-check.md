# Офлайн-проверка расположения исходников Core

**Перенос на MSI, 3 ноября 2026:** проверено на Windows/Node `v24.15.0`
поверх локальной базы `db68140380f52fc630078317512e5ae1df3c273c`:
24 сочетания расположения/cwd для четырёх вариантов пакета, оба отрицательных
контроля и fixture с зависимостью от пути; focused tests 3/3 и scoped Core 9/9.
Это отдельная Windows-проверка; Linux hashes ниже остаются историческими.
Исходный commit `c0a4d1e9dc17c46d4c8b0b043431368372c757e0` восстановлен
побайтно с совпадением Git SHA и сохранён в
`refs/cloud-intake/20261103/package-location`.
Подробности — [milestone](../plans/core-cloud-intake-20261103.md).

Checker: `core4/tools/check-package-location.js`. Нужны только существующие Node
(поддерживаемый проектом, ≥20) и Git; установка зависимостей не нужна. Запускать
из checkout нужного commit. Production-код checker не меняет.

```sh
node core4/tools/check-package-location.js --output-dir /tmp/ae-core-location-new > /tmp/ae-core-location.stdout.json
node --test core4/test/package-location.test.js
node core4/tools/validate-diff.js core4/tools/check-package-location.js core4/test/package-location.test.js --run
node core4/tools/check-boundaries.js
node --check core4/tools/check-package-location.js
node --check core4/test/package-location.test.js
git diff --check
```

`--output-dir` — новый каталог вне `core4/`; существующий каталог не перезаписывается.
Без этого параметра временные файлы удаляются после успеха и сохраняются при отказе.
Checker возвращает exit 0 только после всех проверок, иначе 1. stdout — JSON.
Его можно вызвать по абсолютному пути из любого cwd; `--source` необязательно
задаёт другой Git-tracked корень `core4`. Dirty исходники отражены в
`source.changedSourceFiles`; commit сам по себе не объявляется проверкой dirty bytes.

Проверяются существующие `readonly/manual × stdio/owner`:

- Один snapshot отслеживаемых исходников копируется byte-for-byte в `plain`,
  `with spaces`, `Юникод 日本語`. Список и SHA-256 исходников записаны в `source.json`.
  В snapshot входят исходные каталоги Core, `worker.js`, `package.json` и только
  `tools/package-installable.js`. Git metadata, зависимости, tests, прочие tools
  и локальные данные не копируются; untracked файлы не читаются.
- Штатный CLI builder запускается отдельным Node из каждой копии, со своим и
  посторонним cwd. В постороннем cwd лежит невалидный manifest-приманка.
  Сравниваются packageHash, точный набор путей, декодированные bytes каждого файла
  через `Buffer.equals` и release. Каждый результат явно проходит штатный
  `verifyPackage`; runtime/owner не запускаются.
- Чистый baseline сравнивается с 24 сборками, содержащими 17 разных синтетических
  локальных файлов в каждой копии: credentials, MCP config, descriptors, origins,
  adoption, owner, ledger, completions и logs. Проверяются исключение их путей и
  отсутствие маркеров в bytes пакета. Реальные credentials/state не читаются.
- Два отрицательных контроля на вариант: один изменённый byte `cep/panel.css`
  в готовом пакете отвергают сравнение и `verifyPackage` (`package_integrity`);
  изменение одного byte исходного CSS даёт новый валидный пакет с другим hash,
  который также отвергает сравнение. Исходный CSS в копии восстанавливается.

Всего 32 сборки: 4 чистых baseline + 24 проверки + 4 изменённых исходника.
`packages/` сохраняет точные JSON/bytes, `report.json` — среду, commit, sourceHash,
инвентарь пакетов, исходы и findings. При отказе копии исходников и результаты
остаются для воспроизведения штатным `tools/package-installable.js` из сохранённой
копии. Focused test отдельно вносит зависимость CSS от root в изолированном Git
fixture и требует exit 1, finding и сохранённые исходники/пакеты.

## Зафиксированный Linux-прогон

Origin проверен: `https://github.com/aitonpro54/AE_agent.git`.
Получение опубликованной ветки:
`git fetch --no-tags origin refs/heads/AE-Agent-Core-4.0.1:refs/remotes/origin/AE-Agent-Core-4.0.1`.
Исходный commit: **`2b285133136f0e728bc0cf0a33c652bfce316667`**, ветка
`AE-Agent-Core-4.0.1`. Commit `d6dcd75a8d26fd112044b0584cb7a101f11b4eca`
не получен и не проверен.

Среда: Debian GNU/Linux 13.6 (trixie), Linux x86_64 `6.18.57`, Node `v24.19.0`.
Snapshot: 80 файлов, changedSourceFiles `[]`, sourceHash
`5e4fc5aaa8c538adedfeb8e38e274318e3894666797a2534f8a63bc722d5deb3`.

| Состав | Runtime | Файлов | packageHash |
| --- | --- | ---: | --- |
| readonly | stdio | 40 | `1dadd749cacc5e2b209941d843175684d71e75d64193e8c97c3f16dbfc23e7c9` |
| readonly | owner | 51 | `69eae0ea4ec2ad137f98e17fa549ef904490c36c78849a432321405eb805c645` |
| manual | stdio | 59 | `ebc31635ad01ce8290550bc08504378abc0360541f10e60549e985b640b056a3` |
| manual | owner | 70 | `be9afe99d4b04fa480477af288bb0b3e8dfc15c493add2e0da3225fe4940ad43` |

Адресные команды выше: checker — 24/24, оба negative controls ×4; focused test —
3 PASS; две выбранные группы `validation-routing`/`artifact-boundaries` — 9 PASS;
boundaries — 44, liveCalls 0; обе syntax checks и `git diff --check` — PASS.
Production-дефект в этой матрице не обнаружен. Внешняя sandbox сначала выдала
`spawnSync git EPERM`; это сохранённый отказ среды, не результат сборки.
Успешные проверки выполнены с разрешённым запуском локальных дочерних процессов.
Ни установка, ни сетевые операции checker, ни вызовы AE/CEP/проектного MCP,
ни обслуживание конфигурации не выполнялись. Titles/Slideshow не возобновлялись.

## Что ещё проверить на Windows

На десктопе и MSI отдельно получить согласованный commit и сверить `git status`,
версию Windows, Node/Git и SHA-256 выбранных исходников. Затем выполнить те же
команды, используя новый `$env:TEMP` каталог вместо `/tmp`. Например, PowerShell:

```powershell
$evidence = Join-Path $env:TEMP ('ae-core-location-' + [guid]::NewGuid())
node .\core4\tools\check-package-location.js --output-dir $evidence
if ($LASTEXITCODE -ne 0) { throw "Checker failed; evidence: $evidence" }
```

Нужно подтвердить все 24 случая, negative controls и focused/scoped checks на обеих
машинах; сверить между ними packageHash, набор путей и bytes для одинаковых
исходников (включая Git EOL checkout). Повторить вызов checker по абсолютному пути
из чужого cwd; проверить реальные Windows paths с пробелами/Unicode, drive-letter
и canonical-path поведение на используемом томе. Symlinks/junctions, UNC и long
paths эта матрица не сертифицирует; если такие пути нужны, требуется отдельный case.

Linux PASS не закрывает [P1–P8 переносимости](portability.md). Установка,
локальные descriptors/credentials, configured MCP/CEP/AE, реальные оба направления
переноса, обновление/восстановление, authority/fences и сохранность state требуют
отдельной разрешённой Windows-приёмки. Эти действия не входят в запуск checker.
