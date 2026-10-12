# Архитектурное ревью fresh OWNED admission — 12 октября 2026

## Вердикт: REVISE
Ревью выполнено текущим агентом в этом чате по прямому поручению пользователя:
«выставил астра, делай ревью сам». Для этого блока пользователь заменил внешний
Pro-review собственным ревью агента; ожидать отдельный внешний ответ больше не требуется.
Это ревью автора продолжения, а не новый независимый reviewer. Предыдущее независимое
Sol review сохраняется как отдельное свидетельство. Разрешение runtime из ревью не следует.

Проверена proposal из commit `6f3207b659950fe4c896f947820f9ae25fdbc1bb`
и соответствующие исходники текущего checkout. Product code не изменялся.
Выделение `initial_owned` оправдано, но первый этап в исходном плане неполон:
retirement нельзя откладывать до последующего lifecycle milestone.

## Принятые findings

### R1 — P1: первый запуск требует пути завершения ещё до admission
Пункт 10 исходного плана блокирует initial shutdown/cleanup и оставляет первый этап
read-only. Однако `owned-runtime-service.js:47` делает readiness зависимым от
`admissionOpen()`, а shutdown на строке 51 требует этой readiness. На уровне daemon
`bridge-daemon.js:13106` admission требует retained adoption/cutover;
строки 13109–13112 дополнительно требуют retained children/capsule.
Даже пустой REGISTERED_CLOSED процесс не получает обычный shutdown по этим условиям.

Отдельный `scripts/owned-runtime-startup-retire.js:14` не закрывает fresh-machine случай:
он требует retained manifest, legacy profile, два original proofs и controller witness.
Поэтому для новой initial lineage этот путь нельзя объявить готовым запасным выходом.
Та же проблема возникает при failed adoption, истечении или отзыве lease после запуска.

Исправление плана: минимальный initial lifecycle входит в первый этап и принимается
до native launch. Он должен завершать точно принадлежащий процесс при closed/revoked
admission, сохранять completion/read-back и held-handle exit proof. Это отдельное
полномочие на завершение; оно не открывает execution. Partial launch/registration failure
нуждается в том же доказуемом пути. UNKNOWN остаётся read-back-only, повтор не выдаётся.

### R2 — P1: выбор issuer пока не основан на доступном источнике identity
В `mcp-adapter.js:59` запрос к daemon содержит общий token и фиксированный marker
`codex-stdio-v1`; удостоверенного chat principal в этом boundary не видно.
`owned-runtime-authority.js:29` проверяет лишь shape и непустую reference.
`privateFile()` на строке 24 фиксирует байты/identity файла, но не удостоверяет его issuer.
Retained lease (`native-fixture-retained.js:134`) также не является chat identity.

Вариант B не устраняет пробел варианта A: private capability без доказанной связи
с caller удостоверяет possession, а не конкретный чат. Выдать UUID или подписать
caller-supplied значение локальным ключом недостаточно для заявленной гарантии.
Это незакрытая предпосылка proposal; ревью не может заменить недостающее evidence.

Исправление плана: сначала определить threat model и точную гарантию. Проверить
существование trusted host/broker interface, его issuer/verifier, lifetime и immutable
binding на каждом ingress/dispatch. Если доступна только exclusive controller session,
описать её именно так; подмена ею требования удостоверенного чата требует явного
решения по контракту, а не скрытого fallback. Защита от злонамеренного процесса с теми же
правами Windows не доказана; её нельзя обещать посредством одного локального JSON/secret.

### R3 — P1: read-only lease должен иметь отдельные полномочия
Сейчас `owned-runtime-service.js:35` возвращает общий boolean, который проверяется для
execution на строках 36–41. Observation/completion идут по отдельной ветке на строке 38.
В `bridge-daemon.js:22794` выбор observation использует annotations, prefix heuristics
и несколько явно названных reconcile/refresh tools. Это не exact bootstrap allowlist.

Риск относится к будущей реализации: добавление initial lease через OR в общий
`readAdmission` открыло бы service-level execution gate, хотя proposal разрешает только
чтение. Отдельные downstream AE guards не доказывают соблюдение этой границы scope.

Исправление плана: раздельные bootstrap read, completion, initial lifecycle control
и execution capabilities. Для initial branch execution остаётся false. Для каждого
разрешённого route/tool задать method, schema, caller binding, допустимые effects,
enqueue/dispatch checks и bounded completion identity. Prefix/annotation недостаточно.
Connect, poll, adoption и bookkeeping имеют собственные effects и требуют явной модели;
их нельзя автоматически разрешить как GET или как любой readOnlyHint.

### R4 — P2: operation key не заменяет controller fence и namespace contract
`owned-runtime-supervisor.js:164` атомарно резервирует ключ из command/targetGeneration/
desiredSourceSha256. Это dedup конкретной операции; изменение source создаёт другой ключ.
`inventory()` на строке 158 читает три namespaces и явно возвращает ingressFenced=false.
Отсутствие endpoint/reservations при first ensure (строки 330–332) — текущая проверка,
но не контракт владения всем интервалом inspect→reserve→launch→register→adopt.

Исправление плана: общий canonical machine/root fence, монотонная initial lineage и
неизменяемые consumed records, сохраняемые при source/config/chat changes. Перечень
namespaces и допустимого содержимого задаётся для каждого перехода: initial absence,
собственные reservation/ticket/registration, failed/partial и retired state. Не требовать
пустоты после создания собственных записей. Missing/foreign/reparse/partial state не
нормализовать очисткой. Старые UNKNOWN не очищать ради запуска.

## Revised scope и порядок
1. Offline specification: threat model, issuer evidence, state/capability/namespace matrix,
   fence, noReplay и teardown. На этом шаге не нужен настоящий daemon.
2. Offline implementation допускается только после закрытия конкретного контрактного
   набора для выбранного scope. Оставить строгими все retained regression gates.
3. Первый native/live этап допускается после принятого initial lifecycle, включая failure
   до adoption. Состояния: UNPROVISIONED → PROVISIONED_NO_PROCESS → REGISTERED_CLOSED →
   READ_SESSION_ACTIVE → DRAINING → RETIRED_EXIT_PROVEN; неоднозначность → UNKNOWN_READBACK_ONLY.
   Это предлагаемая state matrix, не уже реализованные или проверенные состояния.
4. После открытия только точных read capabilities — genuine actor poll и typed project read.
   Restart/succession, native fixtures, owned jobs и AME остаются отдельными этапами.

## Обязательная приёмка будущей реализации
- Closed admission, failed adoption, lease expiry/revoke, lost register ACK и смерть caller:
  после каждого есть проверяемая disposition, без повторного launch и без открытия writes.
- Parallel callers, queued request через handover, forged principal/annotation/prefix,
  source/config drift и другой source hash при consumed initial key: fail before effect.
- Teardown не зависит от живого read lease; учитывает active tickets, pending/inflight,
  exact process identity и завершение queue/completion. Наличие файла ACK не равно exit.
- Genuine issuer fixture/host contract отдельно от fake unit tests; Windows held-handle
  proof отдельно от compile/link; AE project read отдельно от offline smoke.
- Retained fixtures, exact negative matrix, rules/syntax/diff по реально изменённому scope.

## Отклонённые варианты и оставшиеся blockers
Не принимаются перенос retained history, снятие requiresRetainedAdoption, общий boolean
для initial reads/writes, machine-only lease под видом chat-bound и запуск без teardown.
Issuer interface, initial lifecycle protocol, capability/namespace matrix и durable fence
пока не определены до implementation-ready уровня. Verdict относится к исходному плану;
внесённые ниже по результатам ревью плановые требования ещё не являются их реализацией.

## Validation и следующий безопасный шаг
Source review подтвердило R1 и указанные boundary shapes. R3/R4 — условия корректности
будущего дизайна, а не заявление о воспроизведённой эксплуатации текущего продукта.
Documentation validation: `npm.cmd run check:rules` и `git diff --check` — PASS.
Live tests не запускались. Следующий шаг — один offline контрактный блок из пункта 1,
с конкретными interface/схемами и доказательствами вместо ещё одного внешнего Pro запроса.

## Follow-up: offline-контракт
Исходный REVISE выше сохраняется как результат проверки прежнего proposal.
[Новый контракт](../docs/owned-runtime-initial-contract.md) прошёл architect и независимый
bounded review: **GO для isolated offline model**, новых P1/P2 в спецификации нет.

- R1: prelaunch lifecycle grant и teardown без read lease; ACK не является exit proof.
- R2: private verified caller port, phase/request binding и fail-closed unavailable.
  Настоящий host issuer текущего ingress этим не создан и остаётся blocker интеграции.
- R3: два exact reads с пустыми args, bootstrap ticket до adoption, immutable completion;
  execution=false, без boolean OR, annotations/prefixes/Connect.
- R4: stable physical lineage, consumption до effect, fence/CAS и phase namespace matrix;
  source/config/chat/UUID не дают повторить initial launch или consumed shutdown.

Это принятие спецификации, не source acceptance или Windows/AE evidence. Следующий
review проверяет исполняемую модель и adversarial tests; production wiring отсутствует.

## Первое source review isolated model — REVISE
Root и независимый reviewer воспроизвели восемь контрпримеров на memory fixtures.
Production side effects/default authority не найдены; smoke48 не покрывал эти случаи.

| ID | Priority | Пробел | Требуемое исправление |
| --- | --- | --- | --- |
| M1 | P1 | launchKey зависит от canonical spelling, не physicalRootId | Physical lineage key; alias regression |
| M2 | P1 | После launch_unknown нельзя связать поздний original witness | Только observational binding, без launch/admission/rewrite UNKNOWN |
| M3 | P1 | Lifecycle witness требует panel actor | Null actor разрешён для teardown; reads закрыты |
| M4 | P1 | Новый fence owner завершает target с old controller grant | Same-controller check; completion/read-back отдельно |
| M5 | P2 | reserve/adopt игнорируют dispatch revocationEpoch | Phase consistency до consumption/lease |
| M6 | P2 | Drift после dispatch consumption не закрывает modeled effect | Fresh final guards; consumed UNKNOWN, effect0 |
| M7 | P2 | Hash-valid impossible exit journal принимается | Closed op/outcome и transition/dependency grammar |
| M8 | P2 | abortUnadmitted после AE dispatch | Предикат до любого dispatch; позднее только shutdown |

M1/M2/M4/M8 root проверил отдельными минимальными repro. Остальные подтверждены
независимым reviewer; исходники также просмотрены root. Исправления и targeted regressions
не приняты. 13 октября пользователь отменил правило hard handoff; исправления продолжаются
в текущем чате. До повторного review и smoke milestone не принят.

## Повторная реализация и bounded review — 13 октября

`ae_specialist` исправил M1–M8; parent сверил сохранённые файлы после provider403:
focused offline smoke110 PASS. Ошибка доступа не была эскалацией reasoning; неизвестных
live effects не было. Это промежуточный результат до final GO.

Self/independent source review потребовали дополнительные адресные исправления:

| Finding | Scope | Воспроизведённый пробел | Исправление до GO |
| --- | --- | --- | --- |
| M7 runtime link | parent, подтверждён автором | Coherent permit/events с чужим runtime/actor digest | Exact pinned initial actor и witness links, adversarial reconstruction |
| M4 stop freshness | self-review автора | Handover после stop_reserve даёт modeled stop до отказа ACK | Fresh lifecycle frame/guards после consumption, UNKNOWN effect0 |
| M7 read eligibility | независимый ae_reviewer | Hash-valid enqueue при null actor/disconnected либо без capability | Connected non-null witness и exact authorization capability в journal grammar |
| Reserve freshness | независимый ae_reviewer | Expiry/partial inventory после caller_dispatch игнорируются old frame | Fresh clock/fence/inventory/caller guards до launch consumption |

Source snapshot до последних исправлений сохранён только ignored:
`.codex-runtime/initial-owned-longrun-20261013/pre-stop-review-fix/`.
Reviewer воспроизводил контрпримеры на этом snapshot; writer получил source после
явной передачи. Final review должен сверить окончательные байты, не старый smoke110.
Reviewer: node--check3/rules/diff PASS на промежуточном snapshot; production/live proof=false.

Итог независимого `ae_reviewer` для этого snapshot: **REVISE**. Дополнительные M7
контрпримеры: dispatch после expiry permit/foreign clock boot; adopt без READ capability
или без своих caller phases; второй dispatch переиспользует caller evidence первого
read с тем же requestHash. Также adopt возвращал ACTIVE уже после expiry, используя
старый clock frame. Исправления должны связывать права, время/boot и отдельные phase
proofs с соответствующей операцией; independent lifecycle/completion после read expiry
остаются разрешены. Source review не подтверждает actual process effects: reserve/register
здесь только modeled candidate/observation, а не native launch.

Candidate smoke146 прошёл повторное independent review остальных исправлений, но
остался один M7 P2, найденный parent и подтверждённый reviewer: два заранее queued
одинаковых reads позволяют journal второго dispatch взять post-consumption final
caller proof первого. Source146 **REVISE**, не GO. Узкий финальный scope — explicit
finalguard consumption для активного dispatched permit и отсутствие нового enqueue/
dispatch/adopt при unmatched dispatch, с сохранением factual completion/drain.

## Финальное source review — GO, 13 октября

`ae_specialist` закрыл queued-proof reuse, source/doc заморожены. Независимый
`ae_reviewer` дал **GO для isolated offline model**: открытых P1/P2 M1–M8 в bounded
scope нет. Проверены прежний queued-two counterexample (отказ), genuine serial two
queued reads, pending refusal, factual completion и teardown без живого caller.

Focused smoke150, syntax3, rules и diff-check — PASS; parent повторил smoke150 и
сверил exact hashes. GO относится к этим bytes:

| Файл | SHA256 |
| --- | --- |
| mcp-server/owned-runtime-initial-contract.js | E5D07972F2E6EE43AF610B3C20953BAC84FEB22565B7BAD2AE84B59FDF7197FA |
| mcp-server/owned-runtime-initial-model.js | C4788250D545992B80C047F7908874AFE0F4167B8599291B8FC5D9C0E07B5D94 |
| scripts/owned-runtime-initial-contract-smoke.js | 256A278160F79988FB3D148921BDFF1E067BBADA972C44E5094868C3C965AC1F |
| docs/owned-runtime-initial-contract.md | 9C3271F142B0AAB22B35ED209F2EE4966E576C3361891CEB93178376582F9048 |

`productionAuthority:false`, `liveProof:false`. Genuine host issuer, Windows fence/
durability, held-process lifecycle и actual AE/project/AME acceptance не подтверждены.
Следующий независимый этап — reviewed native physical-root/fence prerequisite;
runtime modules, historical authority и frozen intake в этом этапе не менялись.
