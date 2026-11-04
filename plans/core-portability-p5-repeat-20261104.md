# P5: настоящий same-package repeat на desktop

4 ноября 2026. [Safe evidence](../docs/evidence/core-portability-p5-repeat-20261104.json). Source baseline `a02df38`; cdf/80 и standalone5d5/98.

## Progress

- [x] Fresh configured preflight: ready/connected, holder=null, pending/UNKNOWN/fault0; baseline114installation/7CEP/39prefs/9legacy/source215.
- [x] Один stop `13977dd6-95b5-44df-bddf-d9ee578ec15b`, inspect/stopped и exact owner25516 death.
- [x] Resume с fresh proof, runtimeStarted=false; сразу одна ordinary standalone apply.
- [x] Transaction `9157e280-eeac-402f-92a5-6c69c42d5a47`, installed=true, read-back PASS.
- [x] InstallationId/stateDir/origins, runtime80/CEP6, receiver prefix3/storeIdentity, ledgerabsence, old transactions/history/preferences/config/legacy/source сохранены.
- [x] Собственная CEP закрыта/открыта один раз для новой installation.js, AE28156/birth прежний.
- [ ] Required successor transfer/P2 package, затем один fresh configured thin-client/native proof. Промежуточный CDF activation=not_performed, отдельно не требуется.

## Decision Log

`owner-update` одинакового package не использовался, guard сохранён. Штатный installer изменил descriptor/predecessor/role credentials, client и generated CEPinstallation.js. Credentials не опубликованы. Initialapply82b и repeat9157 не replay. Wrapper после успешного stop/inspect ошибся на singleton process JSON; исходный report сохранён. Продолжен тот же stop со свежим proof, без новой остановки; resume/apply всего1/1. Ordinary apply universal finisher не обещается, update-finish не применялся.

Старый configured thin client32372/birth13:31:07.619152Z,parent7060/exeNode остался с startup descriptor closure. Public status после rotation возвращает owner_unavailable; code gate client_descriptor_changed объясняет pre-spawn отказ, но конкретный internal exception не экспортировался. Поддерживаемого Core4 restart control нет в наблюдавшихся Settings/MCPs и current-chat actions. Slash-menu статически status-only/disabled rows; успешного UI-вызова slash-команды не было, сообщения не отправлялись, собственный неотправленный символ убран. Старые proxy10050/stdio-reconnect расследования не повторялись. Sidecar/injection/process termination0.

## Validation

DescriptorSHA `ef516452612cee1f974fe0db51832cad5b814c6e48489f12e8eb06ce911795be`; clientSHA `3e679c80b86488c11b6c8dff06967a69722b8db59cbd3863c829b8e376feb5a4`; transactionSHA `2c35cb9c65bbf3e67e48c7c38262d953bd214b18cdf3dcfc3244efc32c627e1f`. Receiver3/prefix2325bytes SHA `56516a0e97e55f4b38039b6924ab50890f21a6d1082a38e5f448260116c80b7c` сохранён; новый owner ещё не запущен. Config/preferences/source hashes точны. Source71keys/current48/open23 unchanged. P5 формально открыт до нового configured proof. Следующий необходимый шаг — штатный refresh именно MCP thin client, затем одна fresh typed inspection/release. Apply не повторять.

## Принятое продолжение после checkpoint a9e93f3

### Progress

Actual same-CDF9157 и exact preservation сохранены. CDF activation не выполнялась; current owner absent, cached thin client32372 не является healthy/activated.

### Decision Log

Parent передал ae_specialist ACCEPT последовательности: actual same-CDF disk/readback → обязательная новая source/P2 delta при owner still stopped → один fresh configured final-package native proof. Отдельный intermediate CDF native не нужен. Следующий пакет пока не получен; самостоятельный apply нового package не назначен.

### Validation

Новых stop/apply/restart/MCP/native действий0; original9157 transaction/predecessor/history3 retained. Текущий client PID32372/birth13:31:07.619152Z,parent7060, прежний cdf client-entry/descriptor args. Strict P5 остаётся open до parent acceptance финального proof. STOP до next packet.
