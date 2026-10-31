# Installed owner: checkpoint до и после ручного restart Codex

31 октября 2026, MSI. Пользователь сообщил, что toggle Core MCP не выключается,
и предложил перезапустить Codex. Новая установка уже готова; требуется подтвердить
подключение текущего чата после обновления app transport. Новый чат не нужен.
Ниже сохранён исходный checkpoint; актуальный результат — в разделе после restart.

## Результат после restart — 31 октября 2026

- Пользователь сообщил о ручном restart Codex. Configured `core_status` сначала
  вернул `owner_unavailable`; затем `owner_status` и два явных `core_status`
  успешно прочитали один owner27112, ready=true, lifecycle active.
- Старый owner9812 отсутствует по свежему native process probe. Новый owner27112
  имеет birth ticks`639290393204376840`, boot`2f91e151-58db-434d-8998-cb89e8cc75aa`;
  единственный наблюдаемый Core listener3457 принадлежит ему. Это measured recovery,
  а не survival прежнего процесса; причина завершения9812 отдельно не установлена.
- Recovery`8702b1b6-6d00-40b4-b35b-23b9160352c8` атрибутирован прежним PID/birth/boot;
  ready`0fff29d9-caef-4396-a87d-a16ca0341dd7` — новому. Оба completion существуют,
  HMAC seals/descriptor bindings и ссылки completion→intent hash проверены локально.
- Package8a79, installation ID, origin/anchor/config hashes и receiver identity
  прежние. Журнал16events с прежним SHA256`4cfe8817…`; ledger отсутствует.
  Maintenance/install/broker gates отсутствуют; manual cleanup/update/enable не было.
- ownershipFault=null, ledgerFault=false, unresolved=[], worker pending0,
  physical pending=null, storeClosed/storeFault/unknown=false. Controller idle,
  accepted0, lease не приобретался. AE dispatch/project changes0.
- Native OS inventory не обнаружил AfterFX.exe; peer.connected=false,
  inspectionAvailable=false. Сохранённая adoption6492 остаётся historical:
  fresh host probe/adoption нужны до будущего исполнения. AE не запускался.
- От CreationDate27112 до ready intent около5.59с; первый cold status отказал.
  Причина именно этого отказа отдельно не доказана. R5 cold-start timing и
  повторные ordinary cycles остаются открытыми; полная устойчивость не заявлена.

Санитизированное evidence:
`snapshots/core4-lifecycle/20261031/INSTALLED/configured-restart-observation.json`.
Проверка read-only: configured MCP, native process/listener inventory, HMAC receipts,
hashes/state; runtime credentials и полные transactions не копировались.
Обновлены этот checkpoint, lifecycle plan и AGENTS; исходники/runtime не менялись.
Следующий installed шаг — actual CEP waiting/reconnect и typed read после появления
AE, затем scoped R5 сценарий Titles/native confirm/read-back. Portability/P1–P8/full
release остаются отдельно. Migration/update/enable повторять не требуется.

## Что уже завершено

- Source certification commit`573a8fd`, immutable184selectedPASS.
- Source update/legacy/operator commit`867f506`, final354selectedPASS,0FAIL,
 23checks/22batches; freeze UPDATE4 run`e0a8f3d4-5ae6-495b-bf01-890d50a75d1f`.
- Actual original manual3f92 Core12432 остановлен ровно одним verified root stop;
  исходная native birth`639290324275993049`, receipt state stopped.
- Migration`19ebf044-9314-416c-b146-04d49472d61c` и update transaction
 `49a5ec88-50fd-4b6d-8f26-edf265fc080c` завершены. Update-stopped → fresh inspect
  switchIndex5 → explicit enable. **Не повторять migration/update/enable.**
- Installed owner package:
 `8a79e069313f4cf55198a1bfbf0741ef3952579ae091edb8d22697d22cb409a8`.
  Verified standalone distribution:
 `6bb31d5c1b30ac8b1c26fc491d83a130fb172ac159a696af20d56eaff2fa20fc`;
 `dist/owner-lifecycle-6bb31d5c1b30/`. Старую distribution32be не применять.

## Последние факты и ограничения

Owner PID9812, creation`2026-10-31T10:16:15.397812Z`, lifecycle birth ticks
`639290385753978120`, boot`f266cf21-1b40-4488-b721-e5c7ac5680c9`, mode active,
ready=true. ownershipFault=null, ledgerFault=false, unresolved=[], worker/native
pending0, physical storeClosed=false/storeFault=false/unknown=false. Peer disconnected;
AE6492 отсутствует. Это факты до restart, не заменять ими будущий fresh read.

Два настоящих standard stdio clients подключились к одному owner. EOF первого,
затем второго не завершили owner; PID9812 сохранился также после выхода parent
probe command. Это не proof переживания полного Codex/MSIX restart. Первый cold
status вернул owner_unavailable до окончания boot; fresh observer получил active
owner без повторного запуска. R5 cold-start timing остаётся наблюдением к проверке.

Installation ID`installation-1304c438-5794-4d5c-bf72-d8101f3d2a24` сохранён.
Receiver identity`receiver-store-65535962-c7bb-4dcb-b614-1d91d9277ce4`, журнал16events,
SHA256`4cfe881718e7255829785e57b604304493b319ba6e68d597074a98454e146f45` неизменён.
Оба origin hashes`00d9c5d09409fa02d972aff45ab770525a1eb694c349be934d367d069baa1dd0`.
Desired-stop/install gate/broker gate отсутствуют после settled enable; новая
runtime-owner/receiver-owner запись принадлежит9812. Ничего вручную не удалялось.

Actual AE dispatch/restart/save/project changes0. Old host adoption6492 остаётся
историческими данными; нужен fresh native host probe перед будущим исполнением,
без переноса old grants/authority. Titles/Slideshow не развивались.

## Исходный порядок проверки после restart (выполнен выше)

1. Сверить Git и **configured `core_status`**. Root — sole live/CEP/UI controller.
   Проверить package8a79, current PID/boot, pending/unresolved/faults и фактические
   physical/peer states. Не выдавать standalone probe за configured proof.
2. PID9812 сохранился — записать measured app restart survival. PID изменился —
   проверить штатный attributed recovery и отсутствие ручного ремонта/replay;
   app/job lifetime не закрывать по одному чтению статуса без исходов.
3. Если configured transport всё ещё closed, сначала прочитать точную причину и
   config/owner facts; не запускать второй Broker, не удалять markers и не
   переиздавать credentials. Обычный status read можно повторить после нового
   подтверждённого подключения; отправленную mutation повторять нельзя.
4. После configured proof обновить Progress/Decision Log/Validation lifecycle.
   Actual CEP/AE waiting/reconnect, R5 cycles/Titles native-confirm и финальная
   portability/P1–P8/full release остаются своими ещё не закрытыми проверками.

MCP project config `.codex/config.toml`: enabled=true, Node
`C:\Program Files\nodejs\node.exe`, args — installed
`releases\8a79e069…\runtime\client-entry.js --client-descriptor …\core-client.json`.
Config SHA256`e72411106e8ebc66e02788acd33c8a31011b1036d8ec8748ce6937f1761ece9f`.
Original descriptor before update hash
`be339768da4ec60f10a2aceb8f0614774c02a4b3dd9cc138fb07281e21632103` — только history.

Windows inventory показал `OpenAI.Codex_2p2nqsd0c76g0!App`, window title ChatGPT.
Обязательный guidance skill computer-use запрещает автоматизацию ChatGPT desktop
UI; input в это окно не выполнялся. Штатного reload tool нет, поэтому последний
app restart выполняет пользователь. Путь skills:
`C:/Users/Ant/.codex/plugins/cache/openai-bundled/computer-use/26.1027.30824/`.

Санитизированное evidence: `snapshots/core4-lifecycle/20261031/INSTALLED/` —
transition.json, migration-result.json, enable-result.json, readback-before-enable,
stdio-observation и state-after-start. Полные runtime transactions/credentials/
journals остаются в `%LOCALAPPDATA%/AEAgentCore4`; в repo не копировать.
