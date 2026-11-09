# Приёмка исходников автономного Core на MSI

## Progress

9 ноября 2026. MSI принял из Google Drive архив
`ae-core-msi-ec89ef34-20261109T105516Z.zip` размером 202694 байта.
SHA-256 архива
`cebf8e271d0fa6508c8c55989c2c892000f1baee4ee95270bc07adb887575ce0`.
Манифест подтвердил исходный хост DESKTOP-32974QF, назначение MSI,
пустой патч и отсутствие отдельных новых файлов.

- Принят tip `ec89ef349c00970305f243dda47cd5e81f02a711` из
  `refs/heads/codex/core-412-desktop-s1-20261108`. SHA-256 bundle
  `7c452abbd9dd527147fef2cba5a031bbf000187267e4688e315de1ed8079bcde`.
  `git bundle verify` подтвердил базу
  `57689fe5ee46ac338358e6f8af42f66b4a0f1f74`.
- Ветка `codex/core-autonomy-msi-20261109` создана от принятого tip.
  Обычный merge `37108b9cf4c90fa4ec3a05b0dacfabf8e9241e9f` сохранил
  отдельный коммит MSI `6b8c54f77aa3877122af2595ffae7955cceddef1`.
  Оба tip являются предками новой ветки. Прежняя ветка
  `codex/ae-agent-core-4.1.2` по-прежнему указывает на `6b8c54f`.
- Локальная правка `AGENTS.md` прошла checkout и merge без конфликта.
  SHA-256 до и после
  `1416373efc541dab2c49468e1ad04ff896b231c6fa40271a9dbd7ec41b61393a`.
  Исходные байты и diff сохранены в локальном каталоге приёмки.

## Decision Log

- Принятый WIP находится в Git. При слиянии к дереву десктопного tip
  добавилась только запись о приёмке S1 в `core-4.0.0-installable.md`.
  Три переданных документа сохранены побайтно.
- Следующий блок — **P0b**. Проверить write-ahead и границы выдачи direct
  read, ошибку отправки poll и fsync, freeze в окне ожидания и поздний
  callback. Затем адресно проверить отказы PNG, мутации и истёкшего dry-run
  и повторить `start-over-channel`, `owner-runtime` и исторические
  capture/disposition/recovery на закреплённых байтах. Сначала использовать
  текущий Core, затем собственный legacy AE Agent. Kumo рассматривать по
  подтверждённому остаточному пробелу.
  [Передача](core-autonomy-msi-handoff-20261109.md) ·
  [План реализации](core-autonomy-implementation-20261109.md) ·
  [Промпт продолжения](core-autonomy-new-chat-prompt-20261109.md).

## Validation

- Все 74 файла дельты сравнены побайтно в исходном Git tip, merge и рабочем
  каталоге. Индивидуальные SHA-256, включая модули, runtime и три документа,
  записаны в `.codex-runtime/core-autonomy-receive-20261109/source-hashes.json`.
  SHA-256 списка
  `b006a4d11fb27978baa097a6fbb2d7939d244d8027d88a61f1153b97e0d63ee5`.
- `git diff --check` для рабочей правки и merge относительно tip десктопа
  прошёл. Полная историческая дельта содержит девять строк с концевыми
  пробелами в исходной копии
  `reviews/argon/core-autonomy/20261109-source-followup-03/supplement/response-reopened.txt`.
  Байты архивного ответа сохранены, остальная дельта прошла проверку.
- Объём этапа — приёмка исходников. Сборка кандидата, установленный Core,
  AE/CEP и нативные операции относятся к последующим проверкам.
