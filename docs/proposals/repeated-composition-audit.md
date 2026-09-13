# Proposal: ограниченный аудит композиций

Дата review: 2026-09-13. Решение: **оставить исходную группу в quarantine**,
подготовить deterministic-builder proposal. Реализация audit builder и его
promotion не входят в этот milestone.

## Выбранная группа

`list_solution_candidates` вернул 34 valid candidates, 0 skipped и две группы
точных повторов. Выбрана крупнейшая: четыре записи с fingerprint
`sha256:a8dde18b624f2ad55944133385293baca7f36133d5ce89f46e6e1fd70d6a87a0`.
Представитель —
`2026-09-08T19-32-52.819Z-raw-extendscript-fallback-after-04-06-20260909.json`.

Fingerprint относится к **сохранённому sanitized JSX**, а не обязательно к
исходному скрипту до redaction. Повтор не доказывает четыре независимых успешных
воспроизведения или корректность результата.

`ae_scout` выполнил read-only классификацию, `search_solutions` и `get_solution`.
Исходник обходит заданные композиции и вложенные precomps, сериализует layers,
properties, keys и expressions, затем записывает JSON во внешний File. Пути
в candidate redacted; paging MCP не означает усечения всего сохранённого body.

## Покрытие и контракт предложения

| Reviewed recipe | Повторно используемая часть | Оставшийся пробел |
|---|---|---|
| `listcompositions-typed-plan` | Project lookup и comp details | Root resolution, nested graph и дедупликация |
| `getlayerinfo-typed-plan` | Layer details | Полнота произвольного property tree и keys |
| `find-all-expressions-typed-plan` | Инспекция выражений | Гарантия полного покрытия всех вложенных свойств |

Предлагается pure `bounded-composition-audit-builder`: принимает явные roots,
flags, limits и согласованные typed snapshots, возвращает canonical in-memory
audit с `complete`, `unavailable` и `missingEvidence`. Он не является полным
эквивалентом исходного raw audit. Отсутствие контракта для property/matte/enum
полей обозначается явно. Filesystem export и пути исключены из этого предложения.

Шесть параметров сопоставлены уникальным source anchors: `targetNames`,
`recurseNestedComps`, `limits`, `includeValues`, `includeExpressions`,
`includeSource`. Лимиты — новый предлагаемый guard для найденного обхода;
исходный JSX их не содержит. Source anchors служат проверяемыми привязками,
автоматического вывода семантики или редактирования JSX нет.

[Вход reducer](repeated-composition-audit.review.json) содержит ограничения,
алгоритм, сравнение рецептов и отдельные syntax/safety/reproduction/read-back
criteria. Предложенные capture session и completeness поля ещё требуется
реализовать и проверить; это не описание существующих гарантий bridge.

## Проверка и решение reducer

Команда из корня репозитория:

```powershell
npm.cmd run review:candidates -- docs/proposals/repeated-composition-audit.review.json
```

CLI читает локальную quarantine и registry, печатает proposal в stdout.
Exit code: 0 — proposal подготовлен для ручного review, 2 — найдены blockers,
1 — неверный вход/ошибка чтения. Ни один код не означает promotion approval.
Для другой локальной quarantine используется `AE_SOLUTION_CANDIDATE_DIR`.

Фактический результат выбранной группы: `blocked`, все шесть anchors matched,
четыре повтора. V8 compile-only в function-body grammar прошёл без исполнения.
Это соответствует wrapper `run_extendscript`, но не сертифицирует ES3/AE host.
Два blockers: `source-incomplete-or-redacted` и `raw-source-safety-findings`
(external I/O). Redaction блокирует доверие к исходнику, даже если parser его
принимает. Лексический safety scan — только сигналы для review, не доказательство.

Изолированный smoke reducer проверяет детерминизм, свежесть fingerprint и группы,
ошибки/неполноту входа, source anchors, compile-only, неизменность quarantine и
registry, отсутствие planner visibility и отказ promotion helper принять output
как approval. Synthetic AE scene и будущий audit builder **не воспроизводились**.

Критерии будущего reproduction: два root comps с общим nested comp дают ровно
три уникальных результата; посторонний comp исключён; два запуска совпадают;
cycles, missing/duplicate targets, stale/partial evidence и limits дают явный
отказ либо неполноту. Read-back сверяет identities/counts и только те property
fields, которые действительно поддержаны typed контрактом.

Следующий самостоятельный scope: реализация pure builder и synthetic tests по
этому контракту, с повторной проверкой существующих inspection schemas. Отдельное
review реализации/доказательств предшествует регистрации. Live AE acceptance,
provider trials, Full Intake и публикация сейчас не выполнялись.
