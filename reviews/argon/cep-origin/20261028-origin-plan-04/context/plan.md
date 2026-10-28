# Core4: точный Origin-контракт CEP без настройки по компьютеру

## Цель и исходное состояние

Устранить несовместимость между file-based CEP-панелью и HTTP peer Core4, сохранив строгую проверку входящих запросов и переносимый общий контракт. Минимальное наблюдение собственной file-based CEP-панели: запрос `POST /challenge` пришёл с точным Origin `file://`. Тело запроса, credentials и native-команды не читались; диагностический observer сообщил отказ observer-only. Это не свидетельство успешного production-подключения. Source-only воспроизведение на точном baseline показывает: Origin `null` получает HTTP 200 и `Access-Control-Allow-Origin: null`; Origin `file://` получает HTTP 403 `cep_origin_required` без ACAO.

Baseline для кода и тестовых выдержек: `b42942afa92df0bcdb293ada05214f4ac13a3ed3`. Описание ниже — технический план, который рассматривается; он не является разрешением на реализацию или live-операции.

## Предлагаемый контракт ingress

1. Разрешить только точные значения Origin `null` и `file://`. Missing, empty, дублирующие, malformed, прочие `file:` варианты и любые foreign origins отклонять.
2. Сохранить точные IPv4 loopback и Host/port проверки. Не допускать wildcard CORS, credentials или cookies.
3. Для успешных и ошибочных ответов отражать только точный Origin из двух допустимых значений и выставлять `Vary: Origin`. OPTIONS также проверять по тому же контракту и не расширять разрешённый список.
4. Origin ограничивает ingress, но не является идентичностью расширения или authority. Существующие panel/control credentials, pins и ограничения текущего epoch/sequence сохраняют свою роль.

## Challenge, link и последующие запросы

1. Сервер включает уже проверенный Origin в создаваемый challenge. Существующая MAC полного challenge должна покрывать новое поле.
2. `/link` проверяет, что присланный challenge равен сохранённому challenge, а Origin запроса совпадает с Origin, сохранённым при выдаче challenge. Значение private `peer.origin` берётся только из сохранённого challenge.
3. Каждый подписанный запрос после link обязан нести тот же Origin, что привязан к peer. Проверка должна происходить до изменения sequence, `lastSeen`, pending, completion или ACK.
4. Сохранить проверку MAC, epoch, peer, method, path, pins, роли, одноразовость/TTL challenge, UNKNOWN/no-replay и физическую защиту без ослабления.
5. Проверять tampering challenge.origin и cross-origin link/poll/complete. Отказ на неверном Origin не должен расходовать sequence или завершать pending; исходный Origin с тем же следующим sequence должен оставаться допустимым.

## Изменение панели

Панель проверяет, что `challenge.origin` — ровно `null` или `file://`, и подписывает полный полученный challenge. Она не выводит wire Origin из `location.origin` или `location.href` и не пытается вручную установить запрещённый заголовок Origin.

## Узкие границы реализации

Изменить только существующий `core4/integrations/cep/http-peer.js`, `core4/integrations/cep/peer-protocol.js`, `core4/cep/js/panel.js`, их адресные tests/validation selection и относящуюся документацию. Не создавать descriptor/profile/hostname switch. Не добавлять computer-specific ветви, ручную настройку конфигурации, fallback, альтернативную auth, wildcard CORS или изменение installed files вручную. Новый immutable package устанавливается только штатным installer после принятого result-review.

## Порядок gates

1. До source changes получить связанный с этим пакетом plan-review и разобрать каждый finding. `go` Argon не является разрешением на реализацию; root решает дальнейший scope отдельно.
2. Реализовать только согласованные узкие изменения и адресные тесты. До установки получить result-review точного commit/diff и связанного validation evidence.
3. После принятого result-review: собрать детерминированный package; выполнить dry-run для точного package hash; apply возможен только отдельным разрешённым install step.
4. После apply сверить release, Node, CEP, config и state read-back, затем настоящий installed stdio/status и подключение/poll. При разрешённой read-only проверке допустима одна typed inspection пустого проекта. Любое изменение окружения, неразрешённый dispatch, неизвестный исход или mismatch останавливает этап.
5. На каждом переходе сохранять точный commit/hash и scope доказательства. Старые тесты не переносятся на изменённый код по имени файла или совпадению одного SHA.

## Адресная validation матрица до установки

- Два успешных режима: `null` и `file://` для challenge/link/poll; CORS на success, error и OPTIONS отражает только запрошенный разрешённый Origin и включает `Vary: Origin`.
- Отрицательные входы: missing/empty, foreign origin, варианты `file:`, duplicate Origin, wrong Host/port; неверные role/secret; reused, expired и tampered challenge; неправильные epoch, sequence, path и method.
- Cross-origin link, poll и complete в обе стороны; tampered `challenge.origin`, включая случай с корректно пересчитанной MAC, отклоняется.
- На отказе Origin не меняются sequence, lastSeen, pending, completion/ACK; тот же допустимый Origin и прежний следующий sequence сохраняют штатное поведение.
- Persisted UNKNOWN не снимается reconnect. Проверки выбирать через `validate-diff` по изменённым путям; boundaries, syntax и diff — по фактическому scope.
- VM/WebCrypto/fetch shim для panel.js подтверждает клиентскую обработку, но не настоящий CEP/CORS. Node test с вручную установленным Origin не закрывает браузерное доказательство.

## Stop-lines и открытые доказательства

- Plan-review не разрешает source changes, установку, browser access, runtime access, AE/CEP/UI, отправку команд, save, raw или destructive действия.
- Нельзя интерпретировать Origin как identity/authority или превращать Origin из первого запроса в автоматически обучаемое значение.
- Нельзя снимать credentials, MAC, pins, role, epoch/sequence, UNKNOWN/no-replay, physical guard или Host validation.
- Нельзя объявлять installed success до result-review, package dry-run/apply с точным hash и read-back.
- Офлайн-тесты и локальное наблюдение не являются live CEP/CORS proof. Результат на одной машине не закрывает portability P1–P8; нужны отдельные desktop/MSI round-trip evidence.
- Сохранить fences общих ресурсов. AEP, пользовательские assets и другие проекты не входят в этот этап.
