# R5 — первый запрос thin client при запуске и reconnect

31 октября 2026. Адресное продолжение
[lifecycle](core-cep-lifecycle-20261030.md) после actual configured MCP/CEP/AE
read-only proof. Installed baseline — package8a79e069, owner27112; исходный
source baseline540ca67, отдельный CEP proof commit4c7e8d4.

## Цель и границы

Штатный первый запрос не требует ручного повтора, если owner ещё заканчивает
допущенный cold boot либо завершилась idle IPC session до отправки запроса.
Ожидание ограничено; auth/pin/path/desired-stop/EOF guards сохраняются. Принятые
и отправленные запросы, включая read-only, автоматически не воспроизводятся.
Новая attachment не переносит controller lease, private references и grants.

Факты: первый cold `core_status` вернул `owner_unavailable`; native CreationDate
нового owner→ready intent около5.59с при прежнем postspawn deadline5с. Затем
первый status после паузы вернул `ipc_closed`, новое явное чтение reattached к
тому же owner. Source ограничивает IPC session300000мс; полная временная трасса
именно того истечения не снималась. Оба исхода сохранены в installed evidence.

Source ownership — client-entry/client-ipc и адресные tests. Root владеет планом,
приёмкой/evidence и единственным live controller. Source helper не получает
live/MCP/UI/install/process-control. Статус текущего проекта не меняется.

## Progress

- [x] Configured read-only CEP/AE proof и исходы client failures сохранены.
- [x] Узкое source исправление в двух runtime files; regression/direct tests60/60PASS.
- [x] Независимый bounded source review: ACCEPT, подтверждённых defects нет.
- [x] Проверка diff, scoped validate-diff selection186/186PASS, boundaries и evidence.
- [ ] Проверяемый пакет/установка и actual configured first-call proof нового client;
  source/offline проверки сами этот пункт не закрывают.

## Decision Log

- Cold boot требует большего bounded окна, без второго spawn при неопределённом
  исходе и без retry auth/pin/handshake отказов.
- Postspawn absence-only окно —15с; прежний двойной лимит5с/50attempts заменён
  единым deadline. One guarded launch/EOF/descriptor CAS остаются прежними.
- Fresh attachment допустима только по private доказательству pre-send idle
  closure. Строка ошибки `ipc_closed` сама не даёт права повторить запрос.
- Pending/submitted loss остаётся `ipc_outcome_uncertain` и не вызывает replay.
- Proof — private WeakSet в client-ipc, только после полностью наблюдённого
  чистого remote close без pending/output buffer. Protocol/partial-frame/socket
  faults, explicit close, cancellation и timeout его не создают. Проверка этой
  private identity важнее строк/свойств ошибки. Допускается максимум один fresh
  attachment; concurrent calls используют общий connecting promise.
- Новые product workflows, host adoption и runtime authority сюда не входят.

## Validation

Direct `node --test core4/test/client-entry.test.js core4/test/client-ipc.test.js
core4/test/client-launcher.test.js`:60PASS/0FAIL/skipped0. Реальная TEMP readiness
fixture задержана5600мс: первый status прошёл примерно за5.97с,1launch/1dispatch.
Expired idle IPC с настоящим attachment owner:6concurrent status share1fresh
attachment, generation прежняя, stateful call требует нового explicit controller.
Accepted read/stateful reply loss:1dispatch, original uncertain requestId, replay0.
Forged errors, protocol/partial frame, EOF и wrong secret/pins не дают retry.

Root scoped selection завершён по четырём изменённым путям:186PASS/0FAIL,
skipped/cancelled0,10checks/10batches,
16deferred integrations (`current-closure-unverified`). Boundaries43/liveCalls0,
четыре JS syntax checks и diff check PASS. Source hashes и все selected evidence
keys до/после прогона совпали; результаты/raw log — в `R5CLIENT/summary.json`,
`selection.json` и `validation.log`.

Verified standalone build/dry-run: package
`cc2f07132209317bed89a529109dc06036559e4328950e5c04ca1be273c7cfac`, distribution
`f799501263ff3bd449ab0af6c7b0e20ec4a65ee687219585e47e734e088d288b`,83files.
От installed8a79 runtime closure отличается только client-entry/client-ipc,
новых runtime paths нет. Пакет — `dist/owner-client-resilience-f799501263ff/`.
Source hashes/selection/package/dry-run — в
`snapshots/core4-lifecycle/20261031/R5CLIENT/`. Source milestone commit1a6d442.

Normal installed stop`b99e2f80…` завершён; owner-update`88e4a61e…` прерван root
timeout45с в intent-only фазе до lease/switch-ready. Descriptor8a79 прежний,
update gates/desired-stop сохранены; повтор action и ручная очистка исключены.
Штатный pre-ready owner continuation реализуется отдельным
[recovery блоком](core-cep-r3-owner-preready-20261031.md). Этот source block принят;
installed proof нового client пока отсутствует.

Full release, actual mutation, save/reopen и portability не заявляются.
