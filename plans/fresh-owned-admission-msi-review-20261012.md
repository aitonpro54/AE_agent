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
