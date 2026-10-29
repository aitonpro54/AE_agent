# Titles T2: живая проверка на тестовой копии

29 октября 2026. Прямое поручение пользователя: проверить Titles вживую на
тестовом проекте через наш MCP и продолжать [план внешних продуктов](external-products-titles-20261029.md).
Root — sole AE/CEP/UI/MCP controller. Исходная реализация Titles — `5b8c010`.

## Scope и цель

Одна замена текста существующего подходящего слоя через внешний compiler и
настроенный `after-effects-core4`, с proposal/dry-run/native confirmation,
checkpoint и original receipt/read-back. Без raw JSX, save, render/AME,
нового public authority API, fake epoch и повторения UNKNOWN.

Исходный fixture AEP:
`snapshots/core4-host-validation/022dad73-ca31-4013-88fe-bf001ae91011/titr_01_ame_product_20261015.aep`,
SHA256 `9d5d15a11fccc24b7ca284b6da866bd46f3626d621c80f83c8c1672791ff996f`.
Копия с теми же bytes открыта как
`snapshots/titles-product/20261029/live/Titles-T2-test.aep`.
Рабочие AEP не открываются/не сохраняются; disk copy исходника сохраняется.

## Progress

- [x] Configured Core33164/manual3f92: peer connected, store open,
  pending=null/unresolved=[], ownership/ledger faults отсутствуют.
- [x] Test-copy hash подтверждён. UI open и configured project-inspection:
  saved project,465items; точная цель comp218 `Text_1_1`, layer219 `PAPER TITLES`.
  Discovery ограничен50comps; targeted comp observation содержит один text layer.
- [x] Подготовлены private root service observation, host witness и retained-handle
  stop script. Ничего не остановлено; текущая история16events semantically settled.
- [x] Stopped maintenance завершён: Core33164 остановлен через retained handle,
  exact3markers архивированы под standard lease, provider.adopt привязал AE9672
  и точный test-copy. Outcome readopted, journal/project/installation unchanged,
  grants/epoch/native dispatch0; gates released. Configured runtime ещё возобновить.
- [ ] Fresh Titles inspection → compiler → build/proposal → dry-run/run.
- [ ] Original completion, style/text read-back, визуальная проверка и final status.
- [ ] Итоговый milestone и продолжение C1.

## Decision Log

- Открытие тестовой копии предупредило о недоступном ReservoirGrunge. AE использует
  подстановку шрифта; сохранение/установка шрифтов не выполнялись. Приёмка касается
  setter и сохранения наблюдаемого оформления, не точного воспроизведения шаблона.
- Resource provider хранит adoption старого AE31452; текущий AE9672 после ранее
  разрешённого restart. Она не даёт authority текущему процессу, запись с такой
  привязкой не запускается. Стандартный private bootstrap требует stopped runtime
  и создаёт adoption только absent-only. Нужен отдельный stopped maintenance:
  settled history, exact stopped owner/CAS, архив старой adoption под тем же lease,
  затем штатный provider.adopt с fresh native probe и pinned witness.
- Helper не выдаёт mutationGrant/lifecycleEpoch, не запускает Core/AE и не меняет
  installation/credentials/journal. После начала intent uncertainty удерживает
  gates/no-replay. Native confirmation выбранной цели остаётся внутри AE.
- C1 standalone closure исправляется параллельно отдельным writer в source/tools
  и TEMP. Этот код не устанавливается и не меняет bytes текущего live runtime.

## Validation

Ignored evidence: `snapshots/titles-product/20261029/live/`.
`project-open-inspection.json` и `target-discovery.json` — настоящие configured
native reads. `service-observation.json`:16settled events, broker ledger absent,
exact3markers (receiver/broker/old host adoption), protected hashes, fresh host
identity/endpoints. `service-process.json`: Core33164/parent16204, native birth
`2026-10-29T16:42:55.4976744Z`, единственный child conhost29684.

`collect-service.cjs`, `check-before-stop.cjs` и PowerShell stop syntax PASS.
Live mutation пока0. Служебные и C1 offline tests не объявляются живой приёмкой Titles.

19/19 TEMP tests и независимый read-only review ACCEPT для private operator.
Root bound maintenance evidence SHA256
`4a823a7d764261f740ff2834dfb2797f7b01ff1b84c87db5a551ba38d1e32a97`;
итоговый helper SHA256 `be515c7535ac3ad09b240503553fd7aa1878dada5da430444584c61fef0ae653`.
Stop17:51:46UTC; readoption17:52:22UTC. New adoption digest
`65ece94b9fb88cec5a138ec3489b43770661f678b7f34ba2ed262a13e542b48c`.
Unique transaction `stopped-readopt-Titles-T2-20261029-a134de87` completed.
Повтор stop/readoption/install не требуется и не допускается этим continuation.

## Ближайшее продолжение

Возобновить configured MCP штатным UI restart Codex app-server. AE9672 остаётся
открытым с тестовым AEP. Закрывать CEP не нужно: в fresh accessibility tree AE
видна кнопка «Подключить»; после нового Core нажать её по свежему index и проверить
physical.peer.connected. Не заменять configured client отдельным stdio probe.
Другие пользовательские чаты completed/idle/notLoaded по fresh inventory.

Затем fresh contract/inspection `titles-current-target` на target
`{projectId:<absolute live/Titles-T2-test.aep>,compId:218,layerId:219}`.
Подготовить job через `products/titles/cli.js`, технический запуск явно маркировать
technical_check/ephemeral_check. Планируемый test text — `TITLES OK`.
Proposal/dry-run/run и native confirm выполняет root в пределах поручения
пользователя; при unknown без повторной mutation, только original reconciliation.
C1a уже завершён commit `42b8646`; independent capability install/C1b остаётся дальше.
