# Core4 M2b — offline-контракт событий проекта

26 октября 2026. Пользователь утвердил [предложенный M2b](core-4.0.0-next-scope.md): «реализуй офлайн-контракт событий проекта и проверь его на симуляции, без запуска After Effects». Исходная точка — чистый `7a4d2e5234efdf2a19ac4910d2336d52c9c86b8e`, ветка `codex/ae-agent-core-4.0.0`. [Основной план](core-4.0.0.md).

## Цель и границы

Реализовать private контракт последовательности lifecycle-событий и его проверку Core на явно synthetic источнике. Связать актуальность project-incarnation с подтверждённым proposal, конкретными целями и эффектами; сохранить ownership/checkpoint и UNKNOWN/no-replay. Критерии C1–C6 принятого предложения остаются приёмкой этого среза.

Разрешены исходники и изолированные Node/VM fixtures. Реальные AE hooks, production event source/issuer, UI подтверждений, installed CEP/MCP, bootstrap/daemon, actual shared-lane acquisition/census, credentials/config/runtime state/пользовательские БД, Codeburn, save/reopen, cutover, merge/deploy и push исключены. Public MCP не получает issuer/event injection. Production connect остаётся unavailable. Synthetic proof не объявляется live evidence. Остановленный дополнительный сетевой probe M2a не повторяется.

## Ownership и порядок

- `ae_architect` — адресный read-only контракт переходов, continuity и freshness в authority/broker.
- `ae_scout` — read-only seams существующих fixtures, hooks, scoped validation и packaging.
- После их результата один `ae_implementer` получает `core4/**`, включая проверки и документацию пакета. Root владеет этим планом, основным планом, корневым AGENTS и локальным commit. Чужие изменения сохраняются; не более двух helpers, live-контроллер не назначается.
- Точная API/матрица записывается после сверки contracts. Затем реализация, адресная validation, bounded независимое source review и локальный milestone commit.

## Progress

- [x] Подтверждены разрешение пользователя, ветка/HEAD и отсутствие рабочего diff.
- [x] Выбраны исполнители по scope; архитектура и поиск тестовых seams выполняются независимо, только чтение.
- [x] Уточнены события, состояния, continuity и binding подтверждения; `ae_implementer` получил GO и единоличное владение `core4/**`.
- [x] Реализован private event contract и потребляющие проверки актуальности.
- [x] C1–C5 проверены симуляцией, включая границы до intent, между intent/send, после send/ACK/readback и reconciliation microtasks. C6: routes/dependencies и неизменность чужих pins подтверждены; выбранный CEP batch не запускался, полной scoped-сертификации нет.
- [x] Выполнены разрешённые адресные проверки, boundaries и bounded source review; подготовлен локальный milestone `feat: add offline project lifecycle contract and simulation`. Push не выполняется.

## Decision Log

- Разрешение на M2b снимает прежнюю остановку перед выбором реализации; оно не расширяет live/production scope.
- Epoch проекта не выводится из path/dirty/PID/controller/channel/store. Нет непрерывного доверенного event source — нет актуального lifecycle proof.
- Reset, отзыв подтверждения и потеря lifecycle запрещают новые отправки, но не отменяют уже отправленную команду и не освобождают её UNKNOWN/fence.
- Private synthetic-only lifecycle source принимает exact sourceId/sourceEpoch и последовательность событий. `project_new/open/revert/replacement` ротируют sessionId; неизвестное/пропущенное/повторное/переставленное событие закрывает admission. Потерянная непрерывность не восстанавливается channel reconnect; новый sourceEpoch требует новой project transition. Unsaved project не получает usable binding.
- Lifecycle tokens проверяются по текущему поколению источника; static brand membership недостаточна. Existing fixture transports мигрируют на reducer; target schema и публичный MCP остаются прежними.
- Private authority регистрирует canonical server-owned approval с plan/task/step identity, module/admission pins, input/target/effect policy и expected snapshot digest. Confirmation по ID действует только для registered approval; authorize сравнивает exact step и current lifecycle. Lifecycle change/loss/revoke снимают подтверждение.
- Перед physical send повторяются lifecycle/target и private grant checks, включая границу после durable intent. После send потеря актуальности не превращает команду в rejected/no-effects. Успех требует original completion и отдельного verify при той же актуальной incarnation.
- Reopen Broker при сохранённом source object отдельно проверяет успешное восстановление без повторной mutation. Если при child crash погиб и synthetic observer, новый процесс не наследует доказательство incarnation из AE-state/sessionId: startup доступен, старый receipt/fence и UNKNOWN сохраняются. Архитектор подтвердил эту коррекцию предпосылки старого fixture; внешняя переживающая crash служба событий в scope не добавляется.
- Зависимости scoped validation не ослабляются ради пропуска тестов. CEP network/replay batch пока выбран, но не запускается из-за ограничения ранее остановленного дополнительного probe; это явный пробел текущего evidence, а не PASS новой closure. Non-network component/VM checks и dedicated lifecycle matrix выполняются отдельно.
- Независимое bounded source review обнаружило P2: `reconcile` мог записать success после потери lifecycle между async verify и возобновлением caller. Добавлены проверки после completion и verify awaits; regression доставляет loss/revert через microtask, проверяет сохранение original dispatch binding, unresolved receipt и единственной mutation. Reviewer подтвердил закрытие по исходникам; независимого повторного динамического запуска он не выполнял.
- Изменённая ранняя проверка Broker теперь отвергает чужую incarnation до transport. Titles conformance сохраняет отдельную проверку exact identity в actual JSX через fixed typed test-only driver; продуктовый обход lifecycle gate не добавлен.

## Validation

- Старт: `git status --short --branch` — без рабочего diff; HEAD `7a4d2e5`, впереди origin на один документальный commit.
- M2a 54/54 и boundaries18 — историческое evidence `81ab980`, не результат M2b. Новые результаты будут записаны по факту.

### Закрытие offline M2b

| Критерий | Фактическое evidence |
| --- | --- |
| C1 | Default Core без event source/issuer доступен для status, connect unavailable; public tools не содержат synthetic injection/issuer |
| C2–C3 | Same-path new/open/revert/replacement меняют session; malformed/gap/duplicate/reorder/loss закрывают source; старые/JSON tokens недействительны; restart требует ранее не использованный epoch; unsaved project не получает ready binding |
| C4 | Canonical immutable approval сверяется по proposal/plan/task/step, module/admission pins, input/target/effect и snapshot; события/revoke снимают confirmations, после transition нужны свежие constraints/checkpoint |
| C5 | Loss/revoke/reset в send/ACK/readback окнах и loss/revert в reconcile microtasks не дают false success/no-effects или replay. Retained source допускает completion+verify после Broker reopen; replacement source оставляет receipt unresolved. Throwing physical-send hook не стирает отправку |
| C6 | Dedicated owner/contract routes и concrete dependency closure сохранены. Module/engine/protocol/integration pins не менялись; selected CEP mandatory/not-run и deferred catalog-discovery явно ограничивают результат |

- Final selected non-network batches: **74/74 PASS** — Core36, lifecycle31, titles4, photo3; exit0 во всех четырёх batches. Full selected run не заявляется: mandatory `cep-transport` выбран, но **not-run**; `catalog-discovery` явно `deferred/current-closure-unverified`. `releaseCertified:false`.
- Selection получен `selectChecks(actual changed paths)` тем же API, что использует `node core4/tools/validate-diff.js`; исполнены только разрешённые non-network commands из selection. Titles changed-path `--run` и вложенный titles-only locality `--run` отдельно PASS4/4; они перекрываются с указанными 74 и не суммируются. Boundaries18 и `git diff --check` PASS. Full-release и старые Core3 suites не запускались.
- Exact commands и результаты: `C:/Users/Ant/AppData/Local/Temp/core4-m2b/results.json`; selection/evidence keys: `selection.json`; логи: `final-batch-0.log`, `final-batch-2.log`, `final-batch-3.log`, `final-batch-4.log`, `titles-scoped-run.log` в той же папке. Это локальные temp artifacts, не runtime authority.
- Results SHA-256: `a37c7a221e9449577fb909bff7eeae9d6515cfaacf658c33bb11a2cd0d395267`; selection: `0a2b0c0e001afb23457366df82153ea54446cfe10e91b7db62c6cd0a5f463c65`; lifecycle evidence key: `77a66b18b2ae3c1fca2a140c14e72a32abcdd56250e0ac3db76dc6bdb998d58d`.
- `frozen-source.json` фиксирует 15 изменённых Core4 файлов. Aggregate source delta SHA-256: `9024d15a73fb855f9b536fa59215d173d713f84a1e3d223b50726a59eabc738b`; authority: `6e90b7921fe5104e9a557993b5425ac27c8dd5b47671a375e10416454eabb4d9`; Core artifact raw: `b0278a3793041d70ad0b5a58b2849fa9fddda053867cbdec8efd92adf65955e4`.
- Final batches выполнены после последней malformed-restart правки и core seal. Read-only `ae_scout` независимо сверил все 15 hashes, текущий selection с сохранённым JSON, counts/logs и побайтную неизменность photo/titles/engine artifacts относительно `7a4d2e5`. Suites им повторно не запускались.
- Независимый `ae_reviewer` проверил private authority/broker и matrix по исходникам, нашёл один P2 и подтвердил его закрытие; самостоятельный динамический прогон reviewer не утверждается. Реальные AE hooks/production issuer/actual shared-resource ownership не реализованы. Native/live AE calls **0**; установка, cutover, save/reopen и push не выполнялись.
- Closing representation: все 15 staged Core4 blobs совпали с frozen manifest по raw SHA-256. UTF-8 пяти изменённых Markdown файлов и 19 локальных ссылок проверены; working/staged diff checks PASS. Reviewer отдельно прочитал последний malformed-restart guard при frozen authority hash: binding инвалидируется до throw, полномочия не расширены, новых defects не найдено.
