# Reviewed ExtendScript Solutions

Эта папка предназначена только для reviewed ExtendScript files, которые уже прошли promotion в Safe Solution Library.

Правила:

- Каждый файл должен быть связан с записью `ae-solution.v1` в `registry/solutions.json`.
- Mutating scripts должны использовать `app.beginUndoGroup(...)` и `app.endUndoGroup()`.
- Mutating scripts должны сохранять checkpoint/edit-session requirement, explicit confirmation, mutation permission, idempotency и post-mutation read-back verification через registry metadata.
- Не храните здесь candidates, временные live-test snippets или inline JSX из чата.
- Не добавляйте secrets, API keys, абсолютные project paths или hard-coded user paths.
- Если workflow стабилен и повторяется, preferred path - typed bridge tool, а не постоянный raw JSX shortcut.