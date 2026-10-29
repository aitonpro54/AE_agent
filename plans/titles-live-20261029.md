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
- [ ] Обслужить старую host adoption и возобновить configured runtime.
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
