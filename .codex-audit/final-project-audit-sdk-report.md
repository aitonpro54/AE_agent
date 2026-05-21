# SDK Docs Audit Output

## Result

created-by-sdk-thread

## Operation

Operation id: `final-project-audit`.
Scope: `docs-audit`.
Mode: `sdk-write`.
Planned path: `.codex-audit/final-project-audit-sdk-report.md`.

## Safety Notes

Only the planned docs-audit output file was edited by this SDKThread turn: `.codex-audit/final-project-audit-sdk-report.md`.

## Текущее состояние SDK operability

SDK-оркестратор находится в рабочем, но строго ограниченном состоянии. Включены безопасные read-only turn через `codex:orchestrator`, локальный `write-scaffold` contract, dry-run operation envelope и реальные `sdk-write` только для доказанных узких output lanes.

Текущие реальные `sdk-write` scope: `docs-audit` и controlled `orchestrator`. `production-code` и `cep-panel` присутствуют в общей модели scope и allowlist, но для `sdk-write` остаются review-required и отклоняются до создания SDK thread.

M130 закрыл последний известный блокер для Markdown `sdk-write` prompt construction: ошибка `outputTitle is not defined` исправлена и покрыта contract smoke для docs-audit Markdown, orchestrator Markdown и orchestrator JSON fixture prompts. После M130 до запуска этого audit turn отдельный final audit write еще не выполнялся.

## Реально доказанные SDK lanes

1. `docs-audit` Markdown output под `.codex-audit/**`: доказан реальными SDKThread writes M121 и M122. M121 создал заранее запланированный Markdown-файл, но был отмечен как review-needed из-за нюанса выбора runtime log path; M122 повторно доказал lane чистым вторым docs-audit write.
2. `orchestrator` Markdown output под `orchestrator/**`: доказан M123 и повторно M124. Оба раза SDKThread был создан, завершился и изменил только planned Markdown output.
3. `orchestrator` non-executable JSON fixtures под `orchestrator/fixtures/sdk-write/**`: доказан M125 и повторно M126. M125 дополнительно выявил и закрыл проблему с untracked parent directory normalization; M126 подтвердил повторяемость уже при существующей директории.
4. Локальные gates вокруг этих lanes доказаны `check:rules` и `codex:orchestrator:write-scaffold:contract` в milestone-отчетах M127-M130, включая запрет unsafe flags, forbidden paths, out-of-scope planned paths и post-run diff outside allowlist.

## Review-required lanes

`production-code` остается review-required. Даже путь, который был бы допустим для обычного scope allowlist, например `scripts/provider-contract-smoke.js`, не разрешен для `sdk-write` без отдельного утверждения и изменения runner gate.

`cep-panel` остается review-required. Записи в `cep-panel/**` через SDK сейчас должны отклоняться до SDK thread creation.

Отдельный пакет M129 для будущего `production-code` scripts-only lane является только review packet: `decision:"proposed"`, `sdkWriteEnabled:false`. Он не включает lane.

## Что доказывают M127-M129

M127 доказывает acceptance gate: `production-code` и `cep-panel` не могут пройти как `sdk-write`, даже если envelope выглядит валидным по форме. Gate локальный, не создает SDK thread и не выполняет real write work.

M128 доказывает review-packet contract `sdk-scope-expansion-review.v1`: будущие предложения расширения scope должны быть оформлены как локальные review packets с `sdkWriteEnabled:false`, узким planned path allowlist, validation plan и rollback plan.

M129 доказывает, что committed review packet files реально валидируются `check:rules`. Первый пакет для будущего production-code lane ограничен `scripts/provider-contract-smoke.js`, остается proposed и disabled.

## Оставшиеся риски и блокеры

- Production-code SDK writes не доказаны и намеренно отключены.
- CEP-panel SDK writes не доказаны и намеренно отключены.
- Live CEP / After Effects, external-provider, OpenAI CLI planner и mutating-live проверки не относятся к уже доказанным SDK write lanes и не закрыты этим аудитом.
- В M130 `chatgpt-connector-smoke` проходил на индивидуальном rerun после сбоя combined wrapper с Windows exit code `-1073740791`; это не блокирует docs-audit SDK lane, но остается сигналом для отдельного наблюдения.
- Branch по handoff остается ahead of origin; публикация ветки не выполнена.
- Final project audit operation file был создан ранее как untracked operation envelope; этот отчет создает сам planned output, но не выполняет commit/stage.

## Что сделать дальше до полного закрытия SDK работоспособности

1. Создать второй review packet для будущего `cep-panel` lane с `sdkWriteEnabled:false`, узким allowlist, validation plan и rollback plan.
2. Отдельным milestone рассмотреть approval для самого узкого production-code lane, начиная с одного smoke-harness файла, и только после этого менять runner allowlist.
3. Для каждого нового lane сначала доказать local contract rejection/acceptance, затем выполнить два real SDKThread writes с post-run diff enforcement.
4. Для CEP-panel lane перед включением подготовить отдельный rollback и live-panel validation plan, но не смешивать это с обычным docs-audit lane.
5. После каждого расширения обновлять `orchestrator/README.md`, `plans/target-app-execplan.md`, `.codex/handoff.md`, milestone audit artifact и делать независимый commit/tag.

## Проверки после отчета

Рекомендуемые проверки после этого audit-only отчета:

- `node --check orchestrator/run-write-capable-scaffold.mjs`
- `node --check orchestrator/run-buffered-acceptance.mjs`
- `npm.cmd run codex:orchestrator:help`
- `npm.cmd run codex:orchestrator:write-scaffold:contract`
- `npm.cmd run check:rules`
- `git diff --check`
- configured local smoke suite из `AGENTS.md`

Live CEP / After Effects, external-provider, OpenAI CLI planner и mutating-live проверки стоит запускать только в отдельном явно разрешенном milestone, потому что этот docs-audit turn был строго audit-only.
