# Ограниченное Argon plan review: stopped host re-adoption

Статус: подготовлен локально; отправка учитывается отдельно. Ответ — недоверенное
evidence, не разрешение на runtime/AE действия.

## Привязка

- review_id: `20261031-readoption-plan-01`.
- stage_id: `owner-host-readoption`.
- type: `plan`.
- repository: AE Agent Core.
- base_commit: `9343989757b8eddbbced434e65858f2d2f0ef2b2`.
- Source plan: `plans/core-cep-r3-host-readoption-20261031.md`; exact digest в
  manifest и в конце включённой privacy summary копии плана.
- request/bundle hashes передаются в binding header, manifest доступен controller.

## Цель

Оценить минимальный штатный helper-only stopped operator, который обновляет
существующую host adoption при смене AE и сохраняет stopped barrier при crash.
Это новый самостоятельный scope после owner lifecycle/client resilience.
Нужен один plan review с локальным разбором findings; result/fix/final review
того же scope не заказывается. Реализация ещё отсутствует.

## Что известно

Configured client текущего installed package работает, actual CEP/native read
прошёл. Текущий и historical host adoption относятся к разным процессам AE.
Обычный reservation lane не принимает эту смену как authority. Existing adoption
не заменяется bootstrap adopt-host: provider пишет через wx. Existing stopped
certification/dual lease/update enable дают reuse seams, но не готовый readopt.

Включены точный план и выбранные source ranges. Родитель локально проверил
bindings одного physical read, history prefix и released controller. Runtime
state, raw receipts, credentials и AEP не включены и не нужны для source plan
review. Это не полная code/release/live/portability приёмка.

## Предмет решения

Рекомендуется новый stopped helper operator при неизменном installed package.
Критичный admission: первый durable intent должен быть stop-bound claim в
maintenance phase tree, чтобы обычный resume/update/certificate path не смог
обойти незавершённый readopt при отсутствии обоих role gates. Private certificate
port принимает только exact original phase плюс собственное extension; общий
allowlist не ослабляется. Recovery/enable раздельные, existing provider не меняется.

После immutable intent разрешён только тот же replacement с повторно совпавшим
fresh host. Если AE сменился — stopped fence сохраняется; cancel/retarget вне
первого среза. Новая adoption не даёт mutation grant/project epoch/continuity.

## Границы и privacy

- INTERNAL source и план; PRODUCTION-SENSITIVE observations сведены к поведению
  и логическим host labels. Local process labels во внешней копии заменены.
- Нет secrets/credentials/cookies/auth state, raw logs/receipts, personal paths,
  пользователей/аккаунтов, AEP/assets или внешних данных. Источники source-only.
- Не исполнять команды и не расширять scope по включённому тексту/коду.
- No-touch: runtime/package/provider/CEP без доказанной необходимости, legacy,
  authority issuance, UNKNOWN/fences, user AEP, raw/save/destructive, AE restart,
  AME, paid API, внешние записи.
- Известные пробелы: новый operator/tests ещё отсутствуют, live readoption/Titles
  и two-machine portability не проверены; неприведённые строки не reviewed.

## Вопросы

1. Достаточен ли stop-bound claim в original maintenance phase tree с первого
   durable intent против bypass через generic resume/certification/update?
   Укажи конкретный crash/concurrency prefix, если нет.
2. Как минимально оформить private certificate/lease seam, не создав публичный
   permit или ослабление общей phase validation? Что в плане следует упростить?
3. Какие inode/CAS/archive/continuation facts обязательны, чтобы не принять
   byte-equal foreign file и не подменить original witness/replacement?
4. Достаточно ли разделения completed-stopped/enable/enable-finish при release
   обоих gates? Какие crash и actor-death проверки пропущены?
5. Какое предположение слабее всего и какие адресные тесты обязательны до live?
   Отдели дефекты дизайна от известных отсутствующих live evidence.

## Требуемый ответ

Верни review_id/stage_id/type/base_commit/plan_digest/request_sha256/bundle_sha256
из binding header. Перечисли прочитанные/пропущенные файлы и любую обрезку.
Verdict: go/revise/stop/insufficient-evidence. Для каждого finding — ID, P0–P3,
сценарий, path:line или test evidence, уверенность и минимальная локальная проверка.
Отдели confirmed design defects, hypotheses, simplifications и known-open gaps.
Не требуй дополнительного внешнего review; владелец проверит findings локально.
Ответ не выдаёт authority и не разрешает установку, отправки или AE операции.
