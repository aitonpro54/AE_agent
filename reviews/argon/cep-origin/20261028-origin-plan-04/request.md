# Запрос Argon: plan-review Origin-контракта CEP

- Review ID: 20261028-origin-plan-04
- Stage ID: cep-origin
- Тип ревью: plan
- Base/reviewed commit: b42942afa92df0bcdb293ada05214f4ac13a3ed3
- External plan: context/plan.md
- External plan SHA-256: 181aa767b0f74f8354c24522d09486a5ae70897007d4c1e7df2e40759e2dc5ef

## Цель

Оценить, безопасен и достаточен ли приложенный технический план до реализации. План предлагает добавить точную поддержку Origin `file://` рядом с существующим `null`, связать принятый Origin с challenge, link и всеми последующими signed requests и сохранить текущие проверки authority и replay.

## Текущее evidence

Минимальная сводка наблюдения собственной file-based CEP-панели: `POST /challenge` пришёл с точным Origin `file://`. Тело запроса, credentials и native-команды не читались. Observer сообщил отказ observer-only; это не production-connect success.

Source-only воспроизведение на неизменённом baseline: synthetic temp-owned peer на port 0 получил два `POST /challenge`: `null` → HTTP 200 и ACAO `null`; `file://` → HTTP 403 `cep_origin_required` без ACAO. Exit code 0; link requests, native execution и commands — 0. Raw log не включён.

Полные baseline-исходники, source-provenanced выдержки и полный технический план приложены. См. `context/source-metadata.json` для полных file hashes и исходных строк. Данный запрос и binding record связаны значениями из `context/bindings.json`.

## Границы

Это только плановое ревью. Оно не разрешает реализацию, отправку данных, browser/runtime/installation reads, AE/CEP/UI, live-команды, apply/install, save, raw или destructive действия. Не просите и не выводите token values, installation identities, пользовательские пути, PID или содержимое локальных evidence. Origin ограничивает ingress, но не является identity или authority.

## Вопросы

1. Безопасно ли ограничить Origin ровно значениями `null` и `file://`? Какие missing/empty/duplicate/malformed и variant cases ещё надо закрыть?
2. Достаточны ли proposed challenge/link/peer-origin bindings, и выполняются ли проверки до изменения sequence, lastSeen, pending, completion и ACK?
3. Покрывает ли существующая MAC полный challenge с новым origin во всём протоколе, включая tampering и корректно пересчитанную MAC?
4. Полон ли CORS контракт для success/error/OPTIONS при exact Host/port, без wildcard и credentials?
5. Корректно ли описана обработка challenge на панели CEP без вывода wire Origin из location и без установки запрещённого заголовка?
6. Достаточны ли validation и gates до установки? Какие минимальные доказательства ещё нужны, а что следует явно оставить вне scope?

## Требуемый ответ

Сначала подтвердите binding из `context/bindings.json`: Review ID, Stage ID, type, полный base commit, external plan SHA-256 и request SHA-256. Сверьте их с указанными выше данными; локальный manifest хранит те же привязки, но не включён во внешний payload. Request SHA проверяется по точным байтам файла запроса в bundle.

Укажите прочитанные контекстные файлы и недоступные/непрочитанные свидетельства. Вердикт ровно один: `go`, `revise`, `stop` или `insufficient-evidence`. Для каждого finding дайте стабильный ID, приоритет P0–P3, конкретное утверждение и сценарий отказа, точный baseline `path:line` или excerpt, уверенность, минимальную проверку и классификацию `new/known/duplicate/unknown`. Отдельно укажите допущения, упрощения, отсутствующее live evidence и остаточные ограничения. Несовпадение binding или неполноту укажите явно. Вердикт не является разрешением на реализацию, установку или runtime-действие.
