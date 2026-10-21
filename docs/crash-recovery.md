# Восстановление после сбоев

Цель этапа: отделить сохранённый исход операции от текущей возможности работать.
Неизвестный исход остаётся UNKNOWN; восстановление не повторяет старую команду,
не снимает reservations jobs/outputs и не заменяет обычные execution gates.

## Архитектурные ограничения

- Reconciliation выбирает запись сам из private store. Caller не задаёт paths,
  PID, command/execution IDs, script или желаемый outcome.
- Idle, Connected, истёкший deadline и отсутствующий result сами по себе
  не доказывают завершение или отсутствие доставки.
- Исходные bytes сохраняются неизменными. Новые факты оформляются отдельным
  disposition с hash исходной записи; активный указатель меняется через CAS.
- Exact terminal result связывается с command/execution/expiry и владельцем.
  Timeout после submit не принимается за terminal native completion.
- При утрате результата допускается только ограниченное fencing безопасного
  fixed project read. Неизвестная UI-команда, mutation или чужая сессия не
  получают такого исключения. Новый проверочный read имеет отдельную identity.
- До проверочного read сохраняется once intent. После timeout/crash допускается
  сверка его фактического состояния; повторная отправка по тому же recovery
  не разрешается. Доказанное отсутствие доставки учитывается отдельно.
- Runtime/source/panel actor должны совпадать до и после проверки. Legacy
  записи без причинной связи с activation нельзя признавать завершёнными
  только по времени. Старые UNKNOWN сохраняют `replayAllowed:false`.

## Изоляция проверки

Сетевой fixture запускает настоящий backend из физической временной копии
разрешённого runtime source. Authority вычисляется штатно относительно этого
root. Рабочие authority, credentials и runtime records не копируются.
Production startup reservation gate не меняется: managed sentinel даже во
временном root должен отклонять unreserved startup.

Реализовано в `scripts/network-test-fixture.js`: owned factory, проверка identity
каталога при reuse/cleanup, coherent source snapshot, очистка Node preload/path
и перенаправлений записи. Для Node 24 `NODE_V8_COVERAGE` задаётся пустой строкой:
простое удаление ключа не подавляет принудительное наследование в child_process.

Проверки: `node scripts/network-fixture-isolation-smoke.js` — 24/24 PASS;
`bridge-only-smoke-test.js`, полный `ae-agent-panel-bootstrap-smoke.js` (108),
`network-boundary-smoke.js`, `http-response-regression-smoke.js` — PASS.
Рабочая authority: 1591 файл, SHA снимка до/после
`f3a6f48eb2ba103ba249cf6b5fba69e41ffdf1264b216a63061268bb01b87c4f`.
Это проверка изолированного backend; live AE/CEP она не подтверждает.

Основной recovery и его живая приёмка ещё выполняются.
