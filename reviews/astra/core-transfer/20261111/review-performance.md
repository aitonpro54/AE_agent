# Astra: фактическая performance-дельта snapshot

Вердикт: **ACCEPT**, существенных findings нет. Native gpt-6-astra/high,
read-only review новой реализации и регрессий; production/suite не запускались.

| Файл | SHA-256 |
| --- | --- |
| core4/tools/install-core4.js | `e2e5bed8053b5fd1f2a085822aa7bd6d5eeb63ed7a2752348983926b59cb7074` |
| core4/test/owner-installation.test.js | `c790c1169c5a03f24268a4eb436403d8f932b5eaf51e84d6841099a084b19bd5` |
| core4/runtime/install-lease.js | `eaddb6fa4c8fcac2d8b94a42d3e2eb62683c7a30c1e621e0ab512c5da06483f6` |

Snapshot сохраняет проверки корня и посещённых каталогов. Leaf проверяется
локальным lstat (regular file, без symlink/reparse) и полным realpath до чтения
bytes. Кэша между вызовами нет. Полный realpath выявляет перенаправление родителя.
Ни прежняя, ни новая реализация не объявляются атомарным filesystem snapshot.

Новые регрессии проверяют вложенную ссылку, замену leaf после readdir,
перенаправление родителя без чтения внешней цели и byte-exact бинарный результат.
F01/F03/H01, preferences-only и historical Node-as-data guards сохранены.
git diff --check PASS. Итоговая selection должна проверяться на этих bytes.

## Измерения исполнителя

[Benchmark](snapshot-performance.json): 1000 маленьких файлов, глубина 4–6,
по три снимка каждой реализации. Все шесть result digests совпали.
Wall: 3.118–3.345s → 0.780–0.826s; CPU: 2.859–3.078s → 0.360–0.469s.
Верхнеуровневые lstat calls: 12007 → 1008; realpath: 12006 → 1007.
Флаки-порог времени в тест не добавлен.

Медленный legacy case: 30.918s → 30.825s, то есть общий recovery runtime
почти не изменился. Микробенч подтверждает устранённый лишний обход,
но не объясняет им всю длительность 37-минутного stopped-update suite.
Прежнее прочтение CPU процесса как времени одного case было исправлено.
