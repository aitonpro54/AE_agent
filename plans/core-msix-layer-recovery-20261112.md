# Восстановление того же StartOver после MSIX split

> **ОСТАНОВЛЕНО ПО ОГРАНИЧЕНИЮ ПОЛЬЗОВАТЕЛЯ, 12 ноября 10:56 YEKT.**
> Разрешён только ограниченный ремонт текущей установки/запуска/связи. Поскольку
> дальнейшее восстановление требует нового крупного root-rebase/archive протокола,
> его разработка остановлена. Предложения ниже — исторический анализ, не назначение
> продолжать или менять runtime. Source recovery/root-rebase не реализованы.

> HOLD после нового physical proof: lower installationId `installation-7ece2c0b-8f3b-4839-b689-3ea661464e7b`
> отличается от current upper `installation-e0e81ad5-6bce-451c-8cfd-8e2ec14f3700`.
> Прежний пункт об удалении/переносе всех восьми ролей обоих слоёв НЕ принят для
> foreign lower. Production/source recovery write не начинались. Текущий контракт
> пересматривается по ownership; lower — read-only. Старый текст ниже сохраняет
> provenance первой архитектурной версии, не разрешает mutation foreign state.

## Цель и scope

Завершить reset `4c3b80e6-b231-4c2b-a378-ff331a4b0aed`, сохранив оба
физических слоя истории, затем закончить native cold/hot/repeat штатного запуска.
Это необходимый engineering block текущего ремонта startup, не новая product
acceptance-матрица. Root — единственный live-контроллер. AE закрыт, CU завершён.

Контракт подготовил `ae_architect/msix_reset_contract` после доказанного отказа
однослойного архивирования. Реализация — `ae_implementer` Sol 6.1 High; независимое
review перед production. Descriptor/stateDir/credentials/исходные seals не менять.

## Подтверждённая база

- Installed manual/owner4.2.6 package `3dfdb40d70abba8b3b77232ddd09656ae5d8ad9d95541000189e2db939b7ce73`.
- Reset session `7ef3840c-c1de-49cc-b850-f44fc310e277`, intentHash
  `e502ae0431e4d65875c907689d3c26d516db9c7a444cb10d2ec5828e8d1e6389`.
- Logical root `C:/Users/Ant/AppData/Local/AEAgentCore4`, state/production.
  Upper root `C:/Users/Ant/AppData/Local/Packages/OpenAI.Codex_2p2nqsd0c76g0/LocalCache/Local/AEAgentCore4`.
  Exact transaction: transactions/4c3b80e6-b231-4c2b-a378-ff331a4b0aed-start-over.
- MSIX union был снят в signed plan; первый rename переместил только upper broker.
  Archive inode3096224745886735, остаточный lower broker inode2251799815104406.
  Overlay обоих деревьев совпал с sameTree(original,true). Receiver тоже смешанный:
  directory из lower, известные leaves из upper. Одного broker недостаточно.
- Safe evidence: `.codex-runtime/core-ae-panel-startup-install-20261112/start-over-archive-collision-safe.json`,
  SHA `ef9d8fea7c4feeac1d078a785cb35be79198fee6c3928a811811ea54f4c2deeb`.
- Старый driver26048/birthTicks639300565585425050 blocked. Graceful stop API нет.
  Нужная точная supervised termination допустима только после готового recovery,
  backup и повторного PID/birth/path/no-AE/no-execution proof. Не называть её graceful.

## Контракт реализации

1. Зафиксировать private storage-view только для StartOver recovery. Логические
   bindings и оригинальные seals остаются. Отдельно закрепить upper/lower roots,
   физический transaction root, package family, FileID/stat/hash и provenance
   каждой выбранной записи. Общего произвольного файлового провайдера не вводить.

2. Lower читает и изменяет только verified unpackaged fixed worker. До первой
   production write обязательны GetCurrentPackageFamilyName=15700,
   PID/birth/executable pins и совпадение физического view. WMI — только transport;
   факт запуска через WMI не заменяет proof. Worker выполняет подписанные fixed
   операции этого reset, без caller paths/commands/JSON capabilities. Его incarnation
   записывается до первой мутации и участвует в последующем death proof.

3. Перед production write скопировать оба полных bounded role trees и исходную
   transaction раздельно, включая hidden lower duplicates. Копии без hardlinks,
   read-back hashes обязательны. Старый merged backup этим сертификатом не является.

4. Добавить append-only extension той же transaction: строго проверяемый
   `layer-recovery.json` и bounded `layer-archive/`. Привязать reset/session/intent,
   original archive-plan и archive-00-intent hashes, descriptorHash,
   installationId/machineId, physical snapshots, backup certificate hash,
   controller/worker PID/birth/executable. Оригинальные intent/plan/00intent и
   существующий archive-broker не переписывать.

5. Архивировать фиксированные восемь ролей по отдельным upper/lower intents и
   receipts. Уже перемещённый upper broker принять только по исходному
   FileID/stat/hash/intent. Для каждого перемещения повторить identity/content,
   проверить свободный destination и действующие endpoints/install lease;
   после — read-back. Не выполнять rename через merged logical directory.

6. Исходное дерево проверять представлением в памяти. Directory metadata выбирать
   по original FileID, а не blanket upper-wins: receiver показывает необходимость
   этого. Hidden одноимённые objects сохранять отдельно, независимо от выбора
   effective entries. Новое content не выдавать за original identity.

7. Layered manifest связывает original plan, оба архива, effective projection и
   исходные journal hashes. readArchiveHistories читает точный сохранённый journal
   inode, включая original-receiver anchor. UNKNOWN остаётся исходными bytes,
   commandsReplayed=0, aeAuthority=false. Все role paths в обоих слоях отсутствуют
   до публикации прежней новой session с baselineRequired=true.

8. Reader barrier/continuation распознаёт только доказанный unfinished split ещё
   до extension publication. Foreign source/archive collision остаётся отказом.
   После полного доказательства всех ролей продолжить прежние finisher
   session/completed/enable этапы, без нового reset request.

9. Для последующих resets использовать layer-aware архивирование при обнаружении
   MSIX view. Однослойный rename допустим после доказательства единого физического
   дерева. Миграция всей установки, изменение Codex manifest/security/ACL и ручное
   переписывание MCP config в этот block не входят.

## Владение файлами

Implementer: runtime/start-over-{archive,state,finisher,barrier}.js,
private start-over-layer-archive.js и fixed worker; tools/operate-start-over.js,
standalone-installer.js; необходимые owner/closure declarations и boundary selector;
адресные start-over tests. Пути внутри core4/. Любое иное расширение — по
конкретному найденному blocker. Root владеет native scripts/evidence и планами.

## Приёмка

- Synthetic lower-directory/upper-leaf, hidden same-name/different bytes и текущий
  broker split. Foreign inode с совпадающими bytes и неподтверждённый collision
  по-прежнему blocked.
- Crash после каждого layer rename и до receipt: продолжает только тот же intent
  после смерти прежнего controller/worker; no replay и no duplicate mutations.
- Сохранность обоих слоёв, journal anchors, UNKNOWN, credentials/origin/descriptor,
  защищённых AEP; отсутствие authority/baseline shortcuts.
- Отдельный synthetic Windows fixture и packaged/unpackaged proof.
- Existing focused finisher/barrier/operator/session tests, boundaries/diff-check,
  deterministic package verification. Новые failures сохраняются, broad release
  matrix не назначена.

## Progress / Decision Log / Validation

12 ноября: contract подготовлен XHigh по фактам MSIX; production mutation0 после
обнаружения collision. Source milestones011ffbf и3492c89 приняты отдельно.
Открыты unpackaged proof, two-layer backup, остальные role provenance и reviewed
recovery distribution. После них — точная termination driver и исходный finisher.

### Новый physical ownership proof, 12 ноября 10:41 YEKT

- Read-only helper в обычном tool child вернул API15700, но native file handles
  показали L→U mapping. Package API без FileID/finalPath недостаточен.
- Headless WMI Create запустил тот же approved Core7 helper как PID35240,
  birth2026-11-12T05:41:28.7637391Z. API15700, native requested physical paths L/U,
  все selected reads complete; known mappings отсутствуют. Receipt
  `.codex-runtime/core-ae-panel-startup-install-20261112/msix-view-probe-76dbc940-9a7a-41db-a328-2cc3eb4b4aa8.json`,
  SHA52209c90f57cd72f8ba4cb3ebd532f22d4f094e277a19e53e715f2ff8a8eefd5.
- L/installation.json принадлежит installation-7ece2c0b-8f3b-4839-b689-3ea661464e7b,
  package8f73283b88c7b3ba44fcb792f132fbda40c7b6e6ed00e858c3bc4165d7333034;
  U/installation.json — current installation-e0e81ad5-6bce-451c-8cfd-8e2ec14f3700,
  package3dfdb40d70abba8b3b77232ddd09656ae5d8ad9d95541000189e2db939b7ce73.
  Lower currenttx4c… absent, lower install.lock absent. Это разные установки.
- Нижние role trees зафиксированы read-only. Предыдущая all-roles-absent-both-layers
  часть XHigh packet не разрешает перемещение foreign state. SolHigh sourcewrite0.
  После двух содержательных XHigh passes оставшийся ownership/storage boundary
  передан ae_architect_ultra msix_ownership_recovery; требуется bounded upper-only
  recovery и устойчивый runtime binding без mutation foreign lower.
- WindowsPS5 -File отказал по действующей scripts-disabled policy до запуска.
  Policy/ACL/security settings не менялись. Использована существующая штатная CLI
  Core7.6.9 с её RemoteSigned policy, local helper без MOTW; override flags не было.
  Первый WMI вызов с optional flags вернул21 до создания процесса; ShowWindow0-only
  исправил параметры. Все старые failures/receipts сохранены, production writes0.
