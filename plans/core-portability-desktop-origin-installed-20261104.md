# Desktop: перенос peer.origin и установленный пакет 1f8c

[Safe evidence](../docs/evidence/core-portability-desktop-origin-installed-20261104.json). Source commit `e75a25fd85a1770e390b91ccf1f5f196fddc5617`.

## Progress

- [x] Принят fast-forward de92→e75. Сверены 71 ключ, 8 исходных полных named-логов, 215 source-файлов и 33 supplemental hash. Тесты не запускались.
- [x] Воспроизведены manual/owner package 1f8c/80 и standalone 18f247/98. Verifiers и source CLI dry-run из чужого cwd прошли.
- [x] Перед apply отсутствовали owner, listener3457 и lifecycle markers. AE28156 и его birth не изменились; descriptor9157 и receiver prefix3 защищены.
- [x] Выполнена одна ordinary standalone apply1f8c: transaction `a88c79aa-31f4-42a0-8e70-b1fdd697e161`, exit0, installed=true.
- [x] Read-back runtime80/CEP7 прошёл. Сохранены lineage через9157 к initialCDF, installationId/stateDir/origins, история, настройки и legacy.
- [x] Installer штатно обновил MCP args на1f8c и role credentials. Ручных config edits0. Собственная CEP-панель закрыта/открыта один раз; AE не перезапускался.
- [ ] Новый configured thin client, новый owner, connected literal Origin и одна native inspection с немедленным release.

## Decision Log

Новая source-дельта и package1f8c реально переданы после same-CDF9157. Пакет установлен; промежуточная CDF activation не выполнялась. Старые initial82b,9157,stop139 и resume не повторялись. Новый transaction и исходный payload сохранены. Universal finisher для ordinary apply не заявляется.

Project entry1f8c подтверждена `codex mcp get` в точном cwd. После 15 секунд read-only наблюдения и одного configured status остался прежний CDF-client32372/birth13:31:07.619152Z,parent7060; status вернул `owner_unavailable`. Нового1f8c client и owner нет. Широкий ASAR/proxy/IPC поиск не повторялся, процессы не завершались, sidecar не запускался. Literal Origin не наблюдён; adoption origin не используется как его доказательство. После отказа lease и native dispatch не запрашивались.

## Validation

Descriptor SHA `dbd2602d0845c2f1108073707301c4653bc21cbc8ea43572e9d650255f151a95`; client SHA `cfe9ffc2ffc989cbeda08012d0a4d40274e0bc89de5589fd434e469cebdb06fe`; transaction SHA `2b79e89528752f7f301c3f1082b18cbba57dfb0a94b01193ccb8ade77b634cba`.

Project config50690f…→c218cd… изменён только installer для нового own args-path. Foreign/global config, 39 preference-файлов и 9 legacy-файлов точны. Receiver2325bytes/3records SHA56516a… и store identity d90ce4fa сохранены; ledger отсутствует. Source coverage наe75 —44/71. Остальные25 offline integrations проверяет parent, две Titles остаются под hold. Здесь эти проверки не запускались.

Full certification и final P2/P5 activation остаются открытыми. Требуется штатно пересоздать configured client из1f8c entry, затем выполнить fresh status/Origin/contract/acquire/connect/one read/release. Applya88c не повторять.
