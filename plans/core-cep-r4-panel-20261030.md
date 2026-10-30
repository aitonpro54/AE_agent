# R4: ожидание и восстановление канала CEP

30 октября 2026. Часть [плана устойчивости](core-cep-lifecycle-20261030.md).
Source подготовлен параллельно R3d1 в отдельных files после R3c commit6263abb;
R3d1 закреплён `5b6cc6c2aca3abcbd79b5e8262d26082cd115494`.
installed переключение остаётся после R3d. Root владеет только panel.js/tests,
R3d1 writer — остальным Core4; package tests ждут source freeze обоих участков.

## Scope и решение

Панель получает явные waiting/connected/ready/busy/recovery состояния. Ready
обозначает только готовность канала принимать typed command; это не grant и не
доказательство общей готовности Core или проекта. Busy охватывает весь evalScript,
native confirmation, callback и original ACK; timeout связи не запускает второй eval.

Текущий loop останавливается после любого poll transport failure и повторяет
лишь exact link403 duplicate_peer. При пустом local latch разрешается bounded
ожидание нового challenge/link с новым peerId и новой epoch/sequence. Старый
authenticated envelope не повторяется. Нужны один loop/request/timer, fetch abort
и generation guard от поздних ответов. Auth/pins/schema/MAC ошибки завершают
автоматические попытки; diagnostic HTTP503 не даёт readiness.

Пустой latch не доказывает server-idle: poll мог быть отмечен delivered до потери
его ответа. Поэтому duplicate_peer/laneClosed/UNKNOWN остаются server fences;
reconnect их не очищает. Latch без result запрещает re-eval. Latch с сохранённым
result допускает только exact original completion до проверенного ACK commandId
и receiptRef, затем удаления записи. Повреждённый storage остаётся recovery.

## Проверки

- Idle network loss и появление Core: fresh handshake, eval0, один канал.
- Delivered poll с потерянным reply: fresh link сохраняет server lane fence,
  команда не исполняется повторно.
- Hanging fetch/late response/repeated click: bounded cancellation, stale
  generation не меняет состояние и не dispatch.
- Подмена pins/MAC/epoch, JSON error и произвольные403/503: ready не появляется.
- Delayed/absent callback и human confirmation: eval1, latch сохранён, reconnect
  или новый poll не запускаются во время physical operation.
- Потерянный completion ACK: только exact original result; conflict,
  unknown_no_promotion и неверный ACK сохраняют latch/fence.
- VM tests дополняются TEMP HTTP proof lost poll/ACK; installed own CEP — R5.

## Progress

- [x] Read-only source inspection panel/dispatcher/HTTP и bounded review сценариев.
- [x] Panel loop реализован: bounded50s/17attempts, fresh channel при idle network
  loss, fetch AbortController/timeouts, generation/unload guard, явные состояния.
- [x] 66 component/HTTP tests PASS, включая real TEMP lost poll и completion ACK.
- [x] Independent source review ACCEPT после исправления двух P2; открытых P1/P2 нет.
- [x] Relevant selected packet после совместного freeze с R3d1:329/329PASS.
- [x] Milestone note и source готовы к отдельному R4 commit после R3d1.
- [ ] Actual own CEP proof в R5 без restart AE или изменения пользовательского AEP.

## Decision Log

Физический recovery остаётся в существующем original-flow. Панель не выбирает
runtime owner, не создаёт Core, не выдаёт controller и не снимает UNKNOWN.

- Автоматический retry разрешён только для собственной transport timeout или
  native fetch TypeError до HTTP response, при отсутствующем local latch; exact
  link duplicate_peer сохраняет прежний отдельный bounded retry. HTTP/auth/JSON/
  schema/dispatcher/completion errors не запускают автоматический новый канал.
- При saved result и потерянном completion ACK панель сохраняет recovery; явный
  click создаёт новый authenticated channel и повторяет только original completion.
  Во время evalScript/callback/confirmation нет reconnect/poll timeout loop.
  Initial load/reload сохраняет прежний original-result recover без нового eval;
  требование click относится к повтору после ACK loss в уже работающей панели.
- Known HTTP refusal остаётся nontransport при timeout чтения body; unknown body
  HTTP200 может завершиться bounded transport timeout. Raw latch presence после
  recover/перед poll/dispatch/после ACK проверяется отдельно от parsed truthiness.
  Значения пустая строка/null/false/0 не означают отсутствие сохранённого ключа.
- AbortController проверяется как capability; фактическая поддержка установленного
  CEP ещё не проверена. Отсутствие capability даёт диагностический отказ.

## Validation

`snapshots/core4-lifecycle/20261030/R4/panel-reconnect.log`:66/66PASS,2674ms.
Panel SHA256`83884ea03348552f0a99f82eb685e2837464565325a329bbb916cb3f557fd1fe`,
test SHA256`ed6756e6b4e8eb0568357f91c9c95408f71f07a8886ab95a872b3fa1d3834c09`.
В HTTP cases используется свой ephemeral port/TEMP store/synthetic credentials;
server-only clock сдвигается для expiry прежнего45s peer, не для settlement.
Lost delivered poll оставляет origin/begin/unknown и eval0. Lost durable ACK
оставляет origin/begin/complete побайтно неизменным после второго exact completion,
eval1. Это не installed CEP/native AE или MSIX job proof. Dispatcher/server
production files не менялись. Source frozen после review; full release не запускалась.

Independent review обнаружило два P2: known refusal с hanging body мог войти в
transport retry и preexisting dispatcher falsy-latch parsing мог объявить ready.
Оба закрыты panel-only guards и regressions; fixture storage теперь сохраняет
реальное различие пустой строки и missing key. Адресный rereview ACCEPT; это не
доказательство installed CEP capability.

Frozen parent packet: `snapshots/core4-lifecycle/20261030/R3d1/summary.json`,
run`33bf8016-f05b-4cda-80e3-cdda0526f6d8`,22checks/21batches, sourceUnchanged=true.
Boundaries39/liveCalls0,19changed JS syntax и diff check PASS. Native-read-recovery
сохранён с exact прежним evidence key; full release не запускалась.

В `test/installable-runtime.test.js` прежний Origin VM fixture обновлён: capability
AbortController/timers, проверка AbortSignal и full signed link response schema.
Все Origin negative assertions сохранены, test-only review ACCEPT. Production
scope R4 — только panel.js; dispatcher/HTTP peer/host registry/AEP не менялись.
Следующий шаг — R3d2 installed-update foundation, затем actual own CEP в R5.
