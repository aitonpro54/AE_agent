# Core4 — точный Origin-контракт CEP без настройки по компьютеру

28 октября 2026, Asia/Yekaterinburg. Baseline
`b42942afa92df0bcdb293ada05214f4ac13a3ed3`. Поручение: продолжить ремонт и разработку
текущей панели с учётом постоянной [переносимости](../docs/portability.md).
Root — sole installed/runtime/AE/CEP/UI controller. Scope — подключение и одна
разрешённая typed read-only инспекция пустого проекта; AEP не открывать/не менять,
raw/save/destructive и full-release не входят. Таймер не возобновляется.

## Установленный факт и причина

- Root проверил установленную package closure `0aea36d0caf2f60a91dbdc72cc5d10e268a410d1973e1e2140dfd2a9b5d88589`:
  проверка runtime files и Node PASS; broker/receiver owners и ledger отсутствуют,
  receiver journal содержит только origin, native dispatch 0.
- На старте AE не работал; root запустил его без AEP. Показан Crash Repair Options
  прошлого сеанса; выбран штатный Continue без reset preferences/safe mode/settings.
  После загрузки визуально подтверждён пустой Untitled Project, открыта только
  собственная панель Core4 через Window → Extensions.
- Разовый диагностический listener на собственном loopback3457 без Core imports,
  credentials, выдачи challenge или AE-команд получил реальный POST `/challenge`.
  Exact Origin **`file://`**, 7 bytes, SHA-256
  `71205e4480342d973ab4611d557e812dc8f38731d6f407a7d43eda7a5af5b562`, Host совпал.
  Время observation `2026-10-28T07:17:22.884Z`. Listener завершился exit0.
  Панель показывает `diagnostic_observer_only`; это ожидаемый отказ observer,
  а не успешное production-подключение.
- Локальное evidence: `snapshots/core4-live-proof/IV-origin-portability-20261028/actual-cep-origin.json`
  (ignored). Body/credentials не читались/не сохранялись. Значение Origin на
  десктопе этим не подтверждено. В baseline server принимает только строку `null`.

## План адресного изменения

1. Один package-owned exact ingress-контракт допускает только `null` и `file://`.
   Не принимать missing/empty/другие file variants/дубликаты Origin. Exact IPv4
   loopback и Host/port остаются; CORS success/error/OPTIONS отражает только
   точное разрешённое значение, Vary Origin, без wildcard/cookies/credentials.
2. Сервер добавляет принятый `origin` в свой challenge. Существующий MAC полного
   challenge уже покрывает поле. `/link` проверяет equality со stored challenge
   и request Origin; private peer.origin берётся только из stored challenge.
3. Все signed post-link requests требуют peer.origin до изменения sequence,
   lastSeen, pending/completion/ACK. Текущие MAC/epoch/peer/method/path/pins,
   one-time challenge/TTL, roles, UNKNOWN/no-replay и physical guard сохраняются.
4. Panel проверяет, что challenge.origin — одно из двух exact значений, и
   подписывает полный исходный challenge. Не выводить wire Origin из
   location.origin/href и не пытаться задавать forbidden header вручную.
5. Только адресные изменения `core4/integrations/cep/http-peer.js`,
   `core4/cep/js/panel.js`, их tests/validation selection и документация. Новый
   descriptor/profile/hostname switch не нужен. Не редактировать installed files
   вручную; новый immutable package ставится штатным installer после review.

Технический source-анализ `ae_specialist` дал узкий GO этому плану; runtime model
настроен ролью, отдельный self-report не объявляется доказательством metadata.
Анализ не менял source, не запускал tests/installed/live. Он не заменяет
обязательный plan/result Argon review по [workflow](../docs/argon-review-workflow.md).
До plan-review source repair не начинается; до result-review установка не меняется.

## Проверки и границы вывода

- Два positive challenge/link/poll режима, exact CORS на success/error/OPTIONS.
- Missing/empty/foreign/file variants/duplicate Origin и wrong Host/port запрещены.
- Cross-origin link/poll/complete в обе стороны; tampered challenge.origin даже
  с корректно пересчитанным MAC запрещён. Отказ не расходует sequence и не
  завершает pending; исходный Origin с тем же next sequence продолжает штатно.
- Wrong role/secret, reused/expired/tampered challenge, epoch/sequence/path/method
  negatives; persisted UNKNOWN не снимается reconnect. Проверки выбираются
  `validate-diff` по changed paths, boundaries/syntax/diff — по scope.
- Browser panel.js VM+WebCrypto/fetch shim проверяет клиентскую обработку; это
  не настоящий CEP/CORS proof. Существующие Node tests с вручную установленным
  Origin null не доказывают работу реального браузера.
- После source/result review: deterministic package → dry-run/apply exact hash →
  release/Node/CEP/config/state read-back → настоящий installed stdio/status →
  собственный CEP connect/poll → одна typed read пустого проекта. Configured MCP
  reconnect проверяется поддерживаемым способом; новый чат не требуется.
- На MSI результат ограничен этой машиной. P1–P8 переносимости не закрываются
  без desktop/round-trip evidence. Fences общих ресурсов сохраняются.

## Progress

- [x] Фактический Origin собственной установленной панели измерен; причина найдена.
- [x] Получен bounded source-analysis GO на минимальный portable repair.
- [ ] Подготовлен и принят Argon plan-review точного пакета.
- [ ] Реализован repair и пройдены адресные проверки.
- [ ] Зафиксирован source milestone и принят Argon result-review.
- [ ] Обновлена установка и выполнен фактический read-only proof подключения.

## Decision Log

- Origin ограничивает ingress, но не удостоверяет собственную extension.
  Фактическая authority остаётся за panel secret, pins и текущими epoch/sequence.
- Один exact контракт для двух поддерживаемых форм устраняет зависимость
  настройки от имени машины; новый Origin не обучается по первому запросу.
- Новое поручение возобновляет scoped ремонт панели. Остановленная автоматизация
  продолжения не восстанавливается. Standing authorization необходимых Argon
  checkpoints подтверждена предыдущим прямым поручением пользователя; root
  запросил только свежую readiness существующего controller без prompts/uploads.
- Чужие изменения workflow и untracked continuation plan сохраняются отдельно.

## Validation

- Actual observation и чистое исходное состояние зафиксированы выше. Native
  inspection/mutation/save 0; tests нового контракта пока не выполнялись.
- Старый installed read-back и новый source-analysis не являются новым live PASS.
- Source changes отсутствуют; readiness Argon/plan packet и дальнейшие результаты
  добавляются только после фактического выполнения.
