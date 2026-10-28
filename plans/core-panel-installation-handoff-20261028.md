# Точка продолжения после ремонта панели — 28 октября 2026

**Текущий ремонт завершён. Работа остановлена по прямой просьбе пользователя;
следующие этапы продолжать в новом чате.** Рабочий корень на MSI:
`C:/Users/Ant/Documents/Codex/AE_agent_core`.

## Результат

- Установлен Core4 package
  `fa9e2f4545888c3cfca07221819e3bda4436680ab4602bf74a4f13c6a39b1199`.
  Проверены60release/7CEP files, Node v24.15.0, descriptor v2, local origins,
  разделённые роли credentials и явная lineage. Секреты в Git не переносились.
- Свежий вид панели штатно открыт в AE. Подтверждены authenticated connection,
  historical receipt ACK без eval и **одна новая successful native inspection**:
  AE26.2x49, пустой несохранённый проект, items0/comps0/layers0.
- Новый commandId: `inspect-c8d064d5-88b8-4fc2-a316-ccd9a99ccea9`.
  Original `inspect-2a2b1fcf-fa87-46fd-a990-0cd26689aa1c` не повторялся и остаётся
  историческим UNKNOWN с verified terminal disposition. Original prefix3
  byte-identical; новый journal6events содержит отдельные begin/complete.
- Mutation/save/raw0. AEP не открывался и не изменялся. AE20108 после ранее
  разрешённого restart не перезапускался; обновлённая панель закрылась/открылась
  без зависания. Root вернул floating panel в видимую область.
- Own proof child2300 штатно закрыт exit0 без stderr/transport fault.
  Final census: Core4 processes0, install/broker/receiver owners и gates0.
  В собственной `.codex/config.toml` восстановлен `enabled=true`.

## Изменения и проверка

Source commits: `dd6c1be` — B–D recovery/lineage/historical ACK и owner identity
CAS; `36905c4` — устранение direct-main circular imports. Ранний ES3 fix —
`cd95b26`, постоянное правило переносимости — `b42942a`.

Изменены отдельные runtime/installer/CEP integration files, fixed technical
operator и regression fixtures; главное содержимое — `core4/runtime/`,
`core4/tools/`, `core4/integrations/cep/`, scoped tests и validation map.
`core/`, `protocol/`, `modules/` и frozen capture A в этом recovery не менялись.

Freeze04 дал96selected PASS и independent source ACCEPT. Последний узкий
direct-main fix дал48PASS в4актуальных checks, boundaries21/syntax/diff PASS.
Его regression сперва воспроизвёл warnings/storeFault, затем проверил настоящий
installed main child с test-only ephemeral listener и clean EOF. Прежние96 не
объявляются PASS новой byte closure; остальные coverage gaps явно deferred.
Full release здесь не запускался.

Root отдельно проверил hashes и deterministic package/operator, actual install,
semantic journal/lineage, fresh native read и clean shutdown. Временный marker
неудачного диагностического startup9900 архивирован только по собственной
zero-dispatch provenance/identity под shared lease до update; это private
one-case housekeeping, не generic recovery. Исходный UNKNOWN не сбрасывался.

Локальные evidence MSI, **без права переносить их как runtime authority**:

- `snapshots/core4-live-proof/VII-native-read-recovery-20261028/root-final-native-proof.json`.
- `installed-read-1793199534588/` в том же каталоге: context/started/requests/
  raw MCP replies/exit; `connected-panel-observation.json`.
- `root-installation-readback-02.json`, `mcp-preference-restored.json`,
  `final-runtime-state.json`.
- Source freeze05 и точные hashes:
  `snapshots/core4-live-proof/VII-native-read-disposition-20261028/result-manifest-final-05.json`.
- Финальный journal SHA-256:
  `1a07b1a379a166a7c8be1af714fa9ac7f7f328f05ad98599fcf12473bdd040b4`.

История и подробные decisions: [recovery A–D](core-native-read-recovery-design.md).
Локальные snapshots/dist ignored; Git сам их на другой компьютер не переносит.

## Первый шаг нового чата и оставшиеся границы

1. Прочитать AGENTS.md и этот handoff; проверить фактическую installation и MCP
   inventory. **Configured Codex-client ещё не проверен:** текущий чат не
   перечитал Core4 tools. Installed stdio→CEP→AE proof выше уже завершён.
2. Подключить штатный Core4 MCP client и выполнить `core_status`: packagefa9e,
   pending=null, storeFault/storeClosed/unknown=false, unresolved0. Если свежая
   панель после закрытия диагностического сервера остановилась, штатно нажать
   «Подключить» после готовности MCP. Не запускать второй сервер3457 параллельно
   с managed client, не повторять original command и не удалять markers.
3. После нового поручения продолжить следующий уже запланированный milestone.
   Здесь последующие работы не запускались.

Manual mutation acceptance и fresh host adoption не закрыты: сохранённый adoption
указывает прежний AE31452, текущий AE20108; read-only proof это не обновляет и
не создаёт lifecycle/grant. Автоматический M2b lifecycle не подменяется ручным.
Historical lineage ограничена глубиной16; новая бесконечная история/GC не обещаны.

Переносимость десктоп↔MSI обязательна для всего AE Agent Core, независимо от
названия Core4. [Критерии P1–P8](../docs/portability.md) остаются открытыми до
фактического round-trip обеих машин; local credentials/state/origins/UNKNOWN
как authority между ними не копируются. Общая готовность Core4 пока не заявлена.

Argon: одно initial review на самостоятельный инженерный scope, затем локальные
исправления/проверки. Второе result/fix/final review исключено по поручению
пользователя. Дополнительных отправок в Argon в завершении этого ремонта не было.
