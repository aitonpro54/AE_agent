# План: первый fresh OWNED admission нового компьютера и чата

Статус: **ISOLATED MODEL GO / NATIVE PREREQUISITES IN PROGRESS / LIVE INTEGRATION BLOCKED**.
13 октября M1–M8 закрыты в изолированной модели, self/independent bounded review — GO.
Live activation ещё не принята. Следующая работа — Windows physical-root/fence prerequisite.
Пользователь отменил hard handoff: продолжать в текущем чате milestone за milestone.
По поручению пользователя от 12 октября внешний Pro заменён ревью текущего агента.
Вердикт исходному proposal — **REVISE**: [findings и revised scope](fresh-owned-admission-msi-review-20261012.md).
Общая база laptop/desktop: `e530adbc461c3713dcbe44d4a912831d1dcb8252` — WIP snapshot, не release.

## Progress
- M1–M8: final source frozen, independent `ae_reviewer` GO на exact hashes из review;
  smoke150 и повтор parent PASS. Реализацию вёл `ae_specialist`, Git/планы — parent.
- M1–M8 committed: `d7e8905a5294d7d472f6f2991b1160ac82253aa6`.
- Native specification REVISE закрыт: pin ожидаемых IDs до lock, child-bound refs и
  безопасный cleanup. Independent spec GO получен; `ae_specialist` реализует только
  новые core/test helper/driver. Parent — sole native proof controller после source review.
- [Durability/journal prerequisite](../docs/owned-runtime-initial-durability-contract.md):
  `ae_architect` подготовил минимальный контракт, independent `ae_reviewer` дал spec GO
  после исправлений pending-append/floor и GENESIS/takeover guards. Implementation ждёт
  native fence acceptance и reviewed same-process facade; все storage proofs UNVERIFIED.
  Ownership непересекающийся, максимум два helpers. Daemon/AE/AME не запускались.
- 13 октября: создана активная долгосрочная цель текущего чата; фактические branch/HEAD
  `codex/laptop-dev-20261012` / `910ba0c` совпали с поручением. Исправление M1–M8
  выполняет `ae_specialist` (writer четырёх isolated model/contract файлов); `ae_architect`
  независимо исследует genuine host issuer/interfaces. Parent — sole Git/runtime/live controller.
- MCP status текущего MSI: `owned_registration_absent`, owned=false, replayAllowed=false.
  Каталог предоставляет только local owned/usage tools; search_solutions/project reads отсутствуют.
  Daemon не запускался. AE/AME процессы наблюдались, это не native/project/queue proof.
- Пользователь уточнил финальный export: **DXV, alpha, High**. Два конкретных варианта
  должны быть установлены по фактическому AEP/поручению; preset ещё требует проверки.
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
- [Offline-контракт](../docs/owned-runtime-initial-contract.md) фиксирует issuer boundary,
  точные read capabilities, independent teardown, stable lineage/fence и phase inventory.
  Architect и независимый reviewer дали GO только для модели, без production authority.

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
   Задать допустимый inventory на каждом переходе; после reserve/register он уже не пуст.
   Общий canonical machine/root fence охватывает inspect→reserve→launch→register→adopt.
   Source/config/chat changes не сбрасывают initial lineage/consumed keys. Чужой, partial
   или ambiguous state закрывает admission; существующий operation key не заменяет fence.
5. **Открытый blocker:** текущий контракт не удостоверяет identity вызывающего чата.
   Определить genuine issuer и проверку chat identity на каждом ingress/dispatch,
   включая параллельные чаты и уже queued requests. UUID из env/log/caller, строка
   authorization.reference и lifetime MCP process сами по себе этого не доказывают.
   Без такого доказательства chat-bound admission остаётся blocked. Новый чат не снимает
   UNKNOWN, consumed keys или noReplay прежних операций.
   Сначала зафиксировать threat model и доказательство issuer interface. Exclusive
   controller session нельзя молча назвать удостоверенным чатом; это отдельное решение.
6. Разрешить при closed startup только reviewed bootstrap observation/control path.
   Установить exact allowlist reads, их issuer и noReplay до реализации; избежать
   circular dependency trusted control/adoption/cutover. Existing classification уже
   допускает observation/completion, GET/poll и read-only typed reads при closed admission;
   это не write entitlement или подтверждение их live доступности на MSI.
   Отделить read/completion/lifecycle capabilities от общего execution boolean;
   initial read lease никогда не открывает service execution через OR в readAdmission.
   Для routes/tools указать schema, effects и binding при enqueue/dispatch/completion.
7. В одном свежем bracket проверить daemon/runtime/policy/config/page/actor,
   panel storage, pending/inflight/edit/lifecycle/native executor и local owned jobs.
8. После genuine actor poll и независимого typed project read оформить private adoption.
   Lease действует только для exact machine/chat/generation/actor и проверенных pins.
9. Drift, revoke, expiry, restart или новый чат закрывают lease. Persistent seal
   не восстанавливает in-memory admission. UNKNOWN допускает только exact read-back.
10. Retained branch сохранить строгой. **До первого launch** принять минимальный initial
    teardown при closed/expired/revoked admission и failed/partial launch/adoption.
    Lifecycle entitlement не зависит от read lease; нужны exact process binding,
    quiescence/completion и held-handle exit proof. Existing startup retirement требует
    retained lineage и не является готовым fresh-machine fallback.
    Initial restart/succession остаются отдельным scope. Первый scope — lifecycle
    первого daemon и read-only connectivity/adoption; **запуск native fixtures,
    owned children/jobs и AME queue/export запрещён**, пока их retirement/cleanup/lifecycle
    не поддержаны и не приняты. Read-only lease не становится универсальным write lease.

## Варианты issuer и открытые blockers
- Bounded host/SDK/ingress evidence 13 октября: [интеграционные границы MSI](../docs/owned-runtime-initial-integration.md).
  Installed Windows upstream attestation не связывает chat/challenge/request и не даёт
  нужного verifier. Внутренние dynamic app tools знают thread/call identity, но доступный
  trusted registration/verifier port для stdio AE MCP не найден. Current admission закрыт.
  После GO M1–M8 следующий независимый этап — native physical-root/held-fence prerequisite
  на временных каталогах; затем durable storage/namespace/first-daemon lifecycle.
- [Native fence specification](../docs/owned-runtime-initial-fence-contract.md) подготовлена
  `ae_architect`; independent `ae_reviewer` дал spec GO после двух адресных исправлений.
  Implementation начата после GO модели/спецификации. Windows proofs ещё UNVERIFIED;
  это не permission на daemon/AE.
- A: trusted transport/broker удостоверяет chat principal и immutable dispatch binding.
  Это требует интеграции с настоящим источником identity; доступность ещё не доказана.
- B: private issuer создаёт exclusive session capability и atomic controller handover,
  отзывая прежний ingress и queued work. Только если issuer доказуемо связывает capability
  с реальным чатом; один секрет или caller UUID сам по себе недостаточен.
- Machine-only lease не выполняет требование нового чата и не является скрытым fallback.
- Offline schema, namespace matrix, fence/CAS ordering и exact bootstrap allowlist
  определены контрактом. Genuine host issuer, физический Windows inventory/fence,
  durable persistence и held-handle lifecycle proof остаются integration blockers.

## Reviews и ownership
- [block: fresh admission architecture] [executor: ae_architect / Sol6.1 ultra]
  [reason: authority и межкомпонентные границы] [ownership: offline contract proposal].
- Parent — sole controller установки/runtime/credentials/AE/CEP/UI/AEP/outputs.
  Один writer на ресурс, максимум два helpers вместе с AGY; desktop не пишет этот scope.
- Независимый Sol6.1/high reviewer проверяет proposal и negative matrix.
- Пользователь поручил текущему агенту провести ревью после выбора Astra; для этого
  блока это заменяет внешний Pro этап из skill, но не закрывает технические gaps.
- Локальный пакет `pro-review-bundles/fresh-owned-admission-msi-20261012.md`
  сохранён как COMPLETE пакет исходного proposal; актуальное ревью — по ссылке выше.
- Self-review REVISE: приняты R1–R4, revised scope отражён в плане; внешней отправки нет.
  Review не заменяет runtime grants/confirmation и доказательства issuer/lifecycle.
- Implementation после review: ae_specialist / Sol6.1 xhigh; затем отдельный diff review.

## Приёмка и негативные проверки
- Offline: fabricated/copied history; wrong machine/chat/root; stale source/config/actor;
  foreign endpoint; неполный namespace; concurrent ensure; lost ACK; revoke/expiry;
  alias/new-chat replay; crash между reserve/launch/register/adoption; lease restart.
- Retained regressions: initial proof не принимается migration веткой; прежние gates строги.
- Отказ до effects и потреблённый launch key не переигрываются новым UUID или чатом.
- Initial teardown при closed/revoked/expired lease, failed adoption и lost register ACK;
  разные source hashes при concurrent initial ensure, queued call через handover;
  spoofed read annotation/prefix и read lease против execution gate.
- Focused service/panel/admission tests; node --check; check:rules; git diff --check.
- Windows native proof выполняется отдельно sole controller; AST/fake tests не live proof.
- Read acceptance: genuine actor poll + actual typed project-info и exact runtime/panel binding.
- Write acceptance: fresh lease + execution guards; это ещё не доказательство AE mutation.
- После отдельной приёмки нужных lifecycle/AME ветвей исходная задача: открыть локальный
  сохранённый AEP, проверить CognacC,
  существенные media-ссылки, comps/варианты, preset/outputs и получить два проверенных AME-видео.
  Save/raw/destructive/render gates и визуальный read-back сохраняются.

## Decision Log
- Реальный temporary SUBST setup не имеет no-replace primitive в DefineDosDeviceW;
  race с concurrent foreign mapping нельзя устранить check-before-create. Unsafe effect
  не выполняется; actual SUBST proof остаётся UNVERIFIED, partial matrix не full acceptance.
- Durability pending append закрепляется private driver до FILE_CREATE; vanished/lost-ACK
  tail не освобождает key. Continuity после driver death и power-loss survival не доказаны.
- [block: Windows identity/fence prerequisite] [executor: ae_specialist / configured XHigh]
  [reason: сложные Win32 safety/handle/race interactions] [ownership: новые native core/helper/driver].
  Parent проверяет source handback и один запускает build/proofs/Git; свой scratch сохраняет,
  path-based recursive cleanup отсутствует. Existing native/product targets не меняются.
- Final journal grammar закрепляет каждый post-consumption caller guard за текущим
  unmatched command; новые enqueue/dispatch/adopt закрыты до completion. Factual completion
  и independent lifecycle сохраняются. Один offline GO не снимает integration blockers.
- Активный лонгран продолжает этапы после compaction в текущем чате; завершение isolated
  milestone не означает завершение цели. Оба helper слота заняты: bounded passive inventory
  assets/font/preset выполнил parent; установку/transfer verifier не повторял.
- User-installed `CognacC.ttf`, локальный `titr_all.aep` и EPR `DXV3_titles_NQ` /
  `FHD_HQ_alfa_nosound` найдены на диске. Наличие/имя не доказывает AE font binding,
  содержимое двух вариантов, качество DXV/alpha или завершение AME.
- Первое рассмотрение ограничено новым initial admission; historical authority не переносится.
- Не включать autostart/unmanaged fallback для получения видимости или успешного smoke.
- Frozen manifest, providers/model/context/auth и старые UNKNOWN не меняются incidental.
- Изменения общих модулей laptop/desktop возможны только после фиксации непересекающегося scope.
- Implementation изолированной модели начата после contract GO; transfer bytes и
  fixture evidence не разрешают live architecture. Existing runtime modules не меняются.
- Self-review заменил ожидание внешнего Pro по явному поручению пользователя. Самое
  существенное исправление: first-daemon teardown входит в первый milestone до launch.
- BOOTSTRAP_READ выдаётся на exact call до adoption; execution всегда false. Lifecycle
  grant готов до launch и переживает expiry/revoke read lease, но не повторяет consumed stop.

## Validation
- Durability spec independent GO на SHA84c91f65e4d012b78321baf5d48563dc7344c11328dae1a974ca7d5cacf3b472;
  два P1/P2 закрыты, driver-death/vanished-tail/first-epoch/reacquire cases добавлены.
  Это doc-only proof; implementation/native/power-loss/production admission не приняты.
- Native spec independent GO на SHA e118da7cfbb25f59abfe6f471fc29cf304bdfc53059f1368eab55478adb0a6c4;
  expected-ID timing, foreign refs, cleanup/query mapping/matrix проверены. Native cases UNVERIFIED.
- Final model: focused smoke150, independent queued-proof counterexample/serial positives/
  pending refusal/completion/teardown, syntax3/rules/diff — PASS. Parent smoke150/hashes PASS.
  Exact hashes и границы GO: [source review](fresh-owned-admission-msi-review-20261012.md).
  productionAuthority=false, liveProof=false; настоящая Windows durability/AE не доказана.
- Transfer verifier: 21 104 files / sizes / SHA256, 3 bundles/refs, snapshot parent, WIP6 PASS.
- Restore: checkout877, CEP9, assets46, checkpoint1, SDK432, Node8529, PowerShell658 PASS.
- Rules PASS через system Node/npm-cli и прямой npm.cmd с process-local PATH/prefix;
  syntax4, diff и offline AME grant9 groups PASS. Frozen baseline неизменён.
- Independent closing review завершён: открытых P1/P2 в proposal нет. Два исходных P2
  (chat ingress identity и child/AME lifecycle scope) отражены как blockers/scope limits.
- Исторический Pro bundle COMPLETE. Текущее self-review REVISE завершено по исходникам;
  R1–R4 внесены в план, implementation/live блокируются конкретными design gaps.
- Native: VS Build Tools, v143, Windows SDK и AE SDK — compile/link/x64 smoke PASS;
  historical native artifacts остаются productionReady=false / liveSemantics=UNVERIFIED.
- Codeburn compatible Python3.12.14/SDK stdio PASS с nonexistent temp DB; exact3.12.10
  не установлен. Real usage/history и AGY readiness/login/grants не проверены.
- Contract review GO: R1–R4 закрыты как требования isolated model. Следующий шаг —
  adversarial smoke и независимый diff review, затем отдельная интеграционная приёмка
  genuine issuer/native fence/lifecycle. Внешнего Pro ответа не ожидаем.
- Root повторил existing offline service33 и supervisor91 checks — PASS; это mocked
  regression proof, без запуска настоящего daemon/AE и без изменения retained gates.
