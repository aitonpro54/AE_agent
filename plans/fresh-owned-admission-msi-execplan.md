# План: первый fresh OWNED admission нового компьютера и чата

Статус: **PROPOSAL ONLY / LOCAL REVIEW PASSED / AWAITING PRO**.
Реализация и live activation ещё не приняты.
Общая база laptop/desktop: `e530adbc461c3713dcbe44d4a912831d1dcb8252` — WIP snapshot, не release.

## Progress
- На MSI восстановлены checkout, CEP, assets, checkpoint, SDK и scoped skills/roles.
- Проверены все файлы пакета, snapshot parent, bundles/refs, raw WIP6 и восстановленные bytes.
- Старый MSI checkout и пять неопубликованных commits сохранены вне активного пути.
- До остановки старого bridge: pending/inflight=0, edit session отсутствует, panel disconnected.
- AE визуально пустой Untitled Project; очередь AME пустая, encoding не выполнялся.
- После scoped stop parent adapters daemon исчез; текущий listener отсутствовал. Это observation,
  а не historical exit proof исходного компьютера или authority нового OWNED runtime.
- Project-local MCP содержит разные fresh credentials; global AE-дубликат удалён.
- `AE_DAEMON_AUTO_START=0`. Историческая authority, grants и очереди не активированы.
- Offline восстановление проверено; live AE/project read и admission **не проверены**.

## Проверенный пробел baseline
- `mcp-server/owned-runtime-supervisor.js`: first ensure допускает launch/register,
  но возвращает `owned_daemon_registered_admission_closed`, replayAllowed=false.
- `mcp-server/bridge-daemon.js`: managed execution требует одновременно
  retained.currentAdmission и cutoverReadiness.ready; registration недостаточно.
- `mcp-server/native-fixture-retained.js` и `owned-runtime-authority.js`: adoption
  требует audited disposition, migration profile, original pins и current actor/runtime.
- Original panel inventory, service readiness, fixture renewal/cleanup и succession
  тоже связаны с retained lineage. Подстановка readAdmission=true не устраняет этот пробел.
- Старый cold recovery и UNKNOWN исходного компьютера не являются MSI bootstrap.

## Предлагаемый контракт для review
1. Ввести явный validated origin `initial_owned` / `retained_migration`.
   Initial anchor не изображает predecessor retirement или migration history.
2. Получать initial authority от genuine private issuer/readers. Точный issuer,
   схему и её проверку определить в review; произвольный JSON/caller fields не допускаются.
3. Связать machine/user/root, source/install/config pins, generation/bootNonce,
   reservation/ticket/native candidate/registration и approved scope.
4. Под единственным controller fence проверить полноту локальных namespaces.
   Пустота — текущая initial lineage; чужой, partial или ambiguous state закрывает admission.
5. **Открытый blocker:** текущий контракт не удостоверяет identity вызывающего чата.
   Определить genuine issuer и проверку chat identity на каждом ingress/dispatch,
   включая параллельные чаты и уже queued requests. UUID из env/log/caller, строка
   authorization.reference и lifetime MCP process сами по себе этого не доказывают.
   Без такого доказательства chat-bound admission остаётся blocked. Новый чат не снимает
   UNKNOWN, consumed keys или noReplay прежних операций.
6. Разрешить при closed startup только reviewed bootstrap observation/control path.
   Установить allowlist reads/Connect, их issuer и noReplay до реализации; избежать
   circular dependency trusted control/adoption/cutover. Existing classification уже
   допускает observation/completion, GET/poll и read-only typed reads при closed admission;
   это не write entitlement или подтверждение их live доступности на MSI.
7. В одном свежем bracket проверить daemon/runtime/policy/config/page/actor,
   panel storage, pending/inflight/edit/lifecycle/native executor и local owned jobs.
8. После genuine actor poll и независимого typed project read оформить private adoption.
   Lease действует только для exact machine/chat/generation/actor и проверенных pins.
9. Drift, revoke, expiry, restart или новый чат закрывают lease. Persistent seal
   не восстанавливает in-memory admission. UNKNOWN допускает только exact read-back.
10. Retained branch сохранить строгой. Initial restart/shutdown/cleanup/succession
    оставить явно blocked до отдельного reviewed initial-anchor lifecycle контракта.
    Первый scope ограничить read-only connectivity/adoption; **запуск native fixtures,
    owned children/jobs и AME queue/export запрещён**, пока их retirement/cleanup/lifecycle
    не поддержаны и не приняты. Read-only lease не становится универсальным write lease.

## Варианты для Pro и открытые blockers
- A: trusted transport/broker удостоверяет chat principal и immutable dispatch binding.
  Это требует интеграции с настоящим источником identity; доступность ещё не доказана.
- B: private issuer создаёт exclusive session capability и atomic controller handover,
  отзывая прежний ingress и queued work. Только если issuer доказуемо связывает capability
  с реальным чатом; один секрет или caller UUID сам по себе недостаточен.
- Machine-only lease не выполняет требование нового чата и не является скрытым fallback.
- Pro должен выбрать доказуемый вариант либо вернуть stop: issuer/schema, chat identity,
  полный namespace inventory, durable fence и exact bootstrap allowlist пока не закрыты.

## Reviews и ownership
- [block: fresh admission architecture] [executor: ae_architect / Sol6.1 ultra]
  [reason: authority и межкомпонентные границы] [ownership: offline contract proposal].
- Parent — sole controller установки/runtime/credentials/AE/CEP/UI/AEP/outputs.
  Один writer на ресурс, максимум два helpers вместе с AGY; desktop не пишет этот scope.
- Независимый Sol6.1/high reviewer проверяет proposal и negative matrix.
- Перед implementation обязателен **Pro review Tier3 (access control/permissions)**:
  `pro-review-bundle` skill. Подготовить COMPLETE allowlisted bundle без секретов,
  private config/auth/SQLite/full logs и исходных machine authority records.
- Локальный пакет `pro-review-bundles/fresh-owned-admission-msi-20261012.md`
  подготовлен со статусом COMPLETE; внешней отправки и Pro verdict ещё не было.
- После Pro записать verdict, принятые/отклонённые замечания и revised scope.
  stop блокирует; revise требует plan diff; go не заменяет runtime grants/confirmation.
- Implementation после review: ae_specialist / Sol6.1 xhigh; затем отдельный diff review.

## Приёмка и негативные проверки
- Offline: fabricated/copied history; wrong machine/chat/root; stale source/config/actor;
  foreign endpoint; неполный namespace; concurrent ensure; lost ACK; revoke/expiry;
  alias/new-chat replay; crash между reserve/launch/register/adoption; lease restart.
- Retained regressions: initial proof не принимается migration веткой; прежние gates строги.
- Отказ до effects и потреблённый launch key не переигрываются новым UUID или чатом.
- Focused service/panel/admission tests; node --check; check:rules; git diff --check.
- Windows native proof выполняется отдельно sole controller; AST/fake tests не live proof.
- Read acceptance: genuine actor poll + actual typed project-info и exact runtime/panel binding.
- Write acceptance: fresh lease + execution guards; это ещё не доказательство AE mutation.
- После отдельной приёмки нужных lifecycle/AME ветвей исходная задача: открыть локальный
  сохранённый AEP, проверить CognacC,
  существенные media-ссылки, comps/варианты, preset/outputs и получить два проверенных AME-видео.
  Save/raw/destructive/render gates и визуальный read-back сохраняются.

## Decision Log
- Первое рассмотрение ограничено новым initial admission; historical authority не переносится.
- Не включать autostart/unmanaged fallback для получения видимости или успешного smoke.
- Frozen manifest, providers/model/context/auth и старые UNKNOWN не меняются incidental.
- Изменения общих модулей laptop/desktop возможны только после фиксации непересекающегося scope.
- Implementation не начата; приёмка transfer bytes не разрешает live architecture.

## Validation
- Transfer verifier: 21 104 files / sizes / SHA256, 3 bundles/refs, snapshot parent, WIP6 PASS.
- Restore: checkout877, CEP9, assets46, checkpoint1, SDK432, Node8529, PowerShell658 PASS.
- Rules PASS через system Node/npm-cli и прямой npm.cmd с process-local PATH/prefix;
  syntax4, diff и offline AME grant9 groups PASS. Frozen baseline неизменён.
- Independent closing review завершён: открытых P1/P2 в proposal нет. Два исходных P2
  (chat ingress identity и child/AME lifecycle scope) отражены как blockers/scope limits.
- Pro bundle COMPLETE, verdict pending; local review не разрешает implementation/live.
- Native: VS Build Tools, v143, Windows SDK и AE SDK — compile/link/x64 smoke PASS;
  historical native artifacts остаются productionReady=false / liveSemantics=UNVERIFIED.
- Codeburn compatible Python3.12.14/SDK stdio PASS с nonexistent temp DB; exact3.12.10
  не установлен. Real usage/history и AGY readiness/login/grants не проверены.
- Следующий безопасный шаг: Pro review proposal, закрыть issuer/allowlist/fence gaps до code/live.
