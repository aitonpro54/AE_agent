# Core — ограниченная диагностика endpoint перед переносом

29 октября 2026, MSI. Baseline source `182d9ae`, последующий документальный
checkpoint `5e5b36e`. Следующий небольшой блок [переносимости установки](core-portability-installation-20261028.md)
после подтверждения configured Codex MCP → CEP → AE.

## Цель и границы

Дать штатную source-команду для ограниченного наблюдения фиксированного Core4
endpoint `127.0.0.1:3457` без открытия installation descriptor/credentials,
без HTTP/auth/AE-команд и без изменения runtime state. Результат различает
listener observed, connection refused и unknown; он не определяет владельца
listener, не резервирует порт и не доказывает будущую возможность bind.

Это самостоятельный диагностический шаг к environment preflight. Он не
выдаёт install/mutation grant, не становится полным installer gate и не
подменяет AE/CEP capabilities фактом версии или доступности TCP. Существующие
installer lease/CAS/branding/runtime-stopped проверки сохраняются; runtime,
package, CEP и `applyInstall` в этом блоке не меняются.

## Критерии

1. Production CLI принимает только фиксированный endpoint; дополнительные
   адреса/порты, URL, env override или injected PASS отсутствуют.
2. Bounded TCP connect не отправляет application payload; соединение/таймеры
   закрываются при success/refusal/error/deadline. Неопределённость не PASS.
3. Structured report явно обозначает observation-only, live AE proof=false,
   authority=false, bindability/capabilities unverified. Occupied endpoint не
   объявляется неисправным Core4 или отсутствием разрешения работать с ним.
4. Tests используют только loopback ephemeral listener либо private simulated
   events, не обращаются к production3457 и не читают установленный state.
5. Diff-selected validation, syntax/boundaries и immutable package identity
   проверены; root выполняет один actual read-only production observation.

## Progress

- [x] Configured live milestone закрыт отдельно: `5e5b36e`.
- [x] Source scout подтвердил installer gap; root выбрал узкий diagnostic scope.
- [x] Source architect подтвердил standalone TCP observation без изменения
  синхронного `applyInstall` и его recovery consumers; writer получил exact scope.
- [x] Root read-only verifier подтвердил source/installed fa9e/60 release files,
  CEP/Node/origin bindings; package/state update отсутствует.
- [x] Реализованы command, scoped fixtures и validation map.
- [x] Пройдены relevant checks и root actual endpoint observation.
- [x] Блок подготовлен к самостоятельному source commit вместе с планами.

## Decision Log

- Root остаётся единственным live/UI/controller и writer планов; helpers
  работают только source/test-owned fixtures, без installed/live probes.
- AE/CEP capability evidence и mandatory installer integration — следующие
  отдельные gaps. Статус P1–P8 не меняется; десктоп не наблюдался.
- TCP connect выбран вместо bind: диагностика не занимает production endpoint
  своим listener. `ECONNREFUSED` — лишь отсутствие listener в текущем наблюдении.
- Source audit не превращает synchronous `applyInstall` в async: private
  recovery consumers требуют отдельного контракта pre-write/under-lease gate.

## Validation

- Final diff-selected checks: **21/21 PASS**, 3 checks/2 batches
  (`endpoint-observation`, `validation-routing`, `documentation`). Targeted15/15
  входят в21, не суммируются с ними. Syntax3/3, boundaries21/diff PASS.
- Private VM покрывает terminal/deadline/exception/late-event/argument ветки;
  actual CLI fixture использует только test-owned ephemeral loopback. После
  fixture listener закрыт, sockets0, bytes0, cwd files unchanged. Worker actual
  production3457/installed/AE probes0; FS guard не объявляется OS sandbox.
- Root прочитал diff и независимо сверил все5 source hashes с freeze.
  Один actual CLI connect вернул `occupied`, exit2, stderr empty; это ожидаемый
  результат при работающем configured Core4, не identification listener owner.
  Descriptor/origins/journal/config hashes до/после byte-identical; AE sends0.
- Configured status после probe: peer connected, ready=true, pending=null,
  unresolved=[], UNKNOWN/faults=false. Runtime package по-прежнему fa9e/60files;
  runtime/CEP/state update не выполнялся. CLI SHA-256:
  `37c948df0a13793fe39714360c7ab46166347407a164c69c3671a8249e9ce3ac`.
- Полные hashes/evidence keys/logs/deferred — ignored
  `snapshots/core4-live-proof/XII-endpoint-observation-20261029/worker/`;
  root proof — `root-actual-endpoint.json`, status — `root-post-status.json`
  рядом. Descriptive purpose `technical_check/ephemeral_check`; authority=false.
- Восемь deferred integration consumers остаются current-closure-unverified;
  full release не запускался. Installer gate, bindability, достоверный источник
  AE/CEP capabilities и фактическая двусторонняя приёмка остаются открытыми.

## Следующий блок

29 октября пользователь отложил перенос до устойчивой работы на MSI.
Следующий активный блок — [локальная доводка панели](core-msi-panel-reconnect-20261029.md).
Прежний план read-only матрицы второй среды и installer environment/gate
отложен до возобновления переноса. Diagnostic JSON
не принимается как grant для apply; перед записью и под lease потребуется
самостоятельная проверка актуальности. P1–P8 не объявляются выполненными.
