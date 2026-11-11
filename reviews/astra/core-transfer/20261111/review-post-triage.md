# Astra: окончательная проверка локальных исправлений

Вердикт: **ACCEPT**, новых существенных findings нет. Native gpt-6-astra/high
по прямому поручению пользователя; read-only review без production/AE/suite.

Точный снимок:

| Файл | SHA-256 |
| --- | --- |
| core4/tools/install-core4.js | `99f7e7b4685e4d9b8924d2e79588938ff45dc807c44e4d54dfea836bff9c9f46` |
| core4/runtime/install-lease.js | `eaddb6fa4c8fcac2d8b94a42d3e2eb62683c7a30c1e621e0ab512c5da06483f6` |
| core4/test/owner-installation.test.js | `224bc69776d8e8399759bc4618542ba16172e80dc1e089823ead48f8387ff519` |

F01–F03 и H01 закрыты в проверенном коде. Publication preflight проверяет
чужие staging до записей, под lease и перед switch, допускает только закреплённые
текущие файлы. Snapshot отвергает linked/dangling/non-directory CEP root.

Очистка ограничена приватно учтёнными собственными пустыми каталогами с
dev/ino/birth под install gate. Прежние, заменённые, заполненные каталоги
сохраняются. Borrowed, retained и postwrite пути не получают cleanup.
Новая release функция требует branded lease и не расширяет runtime/AE authority.

Неизвестные ключи Core table дают отказ. Preferences-only допустим только при
согласованной установке и отсутствии обоих command/args; partial binding и virgin
Core section отказывают. Installer входит standalone HELPERS, lease — общую
runtime closure через source-package.json; manifest хеширует оба файла.

git diff --check PASS. Итоговые scoped tests и воспроизводимые сборки остаются
отдельной валидацией, не подменяются этим заключением.
