# Safe Solution Library

Этот документ фиксирует контракт Milestone 67 для tracked базы проверенных решений AE Agent. Библиотека нужна, чтобы удачные одноразовые Agent/ExtendScript решения не превращались в неструктурированный архив JSX и не обходили существующую safety model.

## Файлы

- `registry/solutions.json` - единственный tracked индекс reviewed решений.
- `recipes/` - человекочитаемые reusable recipes. Они описывают безопасный план действий, но не исполняются напрямую.
- `scripts/solutions/` - reviewed ExtendScript files, только когда typed bridge tool пока не покрывает задачу.
- `logs/solution-candidates/` - ignored quarantine area для свежих candidate-отчетов. Candidate entries не должны попадать в tracked registry.

## Registry Shape

Корневой файл использует схему `ae-solution-registry.v1` и хранит entries схемы `ae-solution.v1`:

```json
{
  "schema": "ae-solution-registry.v1",
  "solutionSchema": "ae-solution.v1",
  "updatedAt": "2026-05-15",
  "policy": {
    "trackedStatuses": ["recipe", "typed-tool-candidate", "tool"],
    "candidateLocation": "logs/solution-candidates/",
    "plannerUse": "advisory-retrieval-enabled",
    "executionRule": "Solutions are advisory metadata; execution still uses validated Agent plans."
  },
  "solutions": []
}
```

## Solution Entry Shape

Каждая запись `ae-solution.v1` обязана иметь:

- `id` - стабильный kebab-case id, уникальный в registry.
- `title` - короткое название для review.
- `status` - только `recipe`, `typed-tool-candidate` или `tool` в tracked library.
- `tags` - компактные теги для будущего retrieval.
- `intent` - summary и список ситуаций, когда решение применимо.
- `inputs` - явные входы, их типы, обязательность и описание.
- `targetAssumptions` - предположения о comp/layers/project state без абсолютных project paths.
- `execution` - режим, mutating/read-only flag, risk level, recipePath/scriptPath/preferredTools.
- `requiredSafetyGates` - обязательные gate flags.
- `verificationRecipe` - как проверить результат, включая expected evidence.
- `testedAeContext` - версия и контекст проверки без project-specific абсолютных путей.
- `promotionHistory` - история review/promotion decisions.

Минимальный пример reviewed recipe:

```json
{
  "schema": "ae-solution.v1",
  "id": "selected-layers-align-to-cti",
  "title": "Align selected layers to CTI",
  "status": "recipe",
  "tags": ["timeline", "layers", "typed-tool"],
  "intent": {
    "summary": "Move selected layers so their start time matches the active comp CTI.",
    "appliesWhen": ["The user has selected one or more layers in the active comp."]
  },
  "inputs": [
    {
      "name": "selectedLayerIndices",
      "type": "layer-selection",
      "required": true,
      "description": "Selected layers from get_active_comp or get_selected_layers."
    }
  ],
  "targetAssumptions": ["An active composition exists.", "At least one layer is selected."],
  "execution": {
    "mode": "typed-plan",
    "mutating": true,
    "riskLevel": "medium",
    "recipePath": "recipes/selected-layers-align-to-cti.md",
    "scriptPath": null,
    "preferredTools": ["get_active_comp", "align_layers_to_time", "get_selected_layers"]
  },
  "requiredSafetyGates": {
    "planValidation": true,
    "explicitConfirmation": true,
    "allowMutations": true,
    "idempotency": true,
    "checkpointOrEditSession": true,
    "postMutationReadBack": true
  },
  "verificationRecipe": {
    "summary": "Read back selected layer timing after the run.",
    "steps": ["Run get_selected_layers and compare each startTime to the requested CTI."],
    "expectedEvidence": ["Each affected layer reports the expected startTime."]
  },
  "testedAeContext": {
    "aeVersion": null,
    "panelVersion": "AE Agent 1.0.0",
    "bridgeVersion": "1.0.0",
    "projectKind": "live-generated",
    "notes": ["Validated only on generated test layers."]
  },
  "promotionHistory": [
    {
      "date": "2026-05-15",
      "from": "candidate",
      "to": "recipe",
      "reviewer": "codex",
      "evidence": "Validated by local smoke and generated live test artifacts.",
      "commit": null
    }
  ],
  "notes": []
}
```

## Safety Rules

- Candidate/unreviewed statuses are not allowed in tracked `registry/solutions.json`.
- Planner retrieval is read-only and advisory. It injects only compact top matches into Agent planning, never the full library and never quarantined candidates.
- Every execution still becomes a normal validated Agent plan with mutation gates, idempotency and read-back verification.
- Mutating entries must require `planValidation`, `explicitConfirmation`, `allowMutations`, `idempotency` and `postMutationReadBack`.
- Mutating raw ExtendScript entries must also require `checkpointOrEditSession` and the script must include an undo group.
- Raw ExtendScript must live under `scripts/solutions/`; arbitrary inline JSX is not a promoted solution format.
- Registry entries, recipes and promoted scripts must not contain secrets, API keys, broad local project paths or hard-coded absolute user paths.
- Repeated stable raw JSX recipes should become typed bridge tools instead of permanent script shortcuts.

## Candidate Quarantine

Milestone 68 adds a local-only capture format for promising live experiments before review. Candidate reports use schema `solution-candidate-report.v1` and are written under ignored `logs/solution-candidates/`, so they are not planner-visible and are not promoted automatically.

Manual capture helper:

```powershell
node .\scripts\solution-candidate-report.js --print-template
node .\scripts\solution-candidate-report.js --input .\path\to\candidate.json
```

Each candidate report keeps compact review evidence:

- user intent and applies-when notes;
- generated tool plan and optional small generated script body;
- affected target summary, not a full project scan;
- run result, safety/checkpoint summary and verification read-back evidence;
- warnings, project assumptions and suggested next promotion action;
- compact provenance from existing Agent run report shape when available.

Candidate reports must not store API keys, provider secret names, raw transcript/log tails, broad project scans or absolute user/project paths. The helper redacts known secret/path patterns, drops raw transcript and scan fields, and records warnings/redaction metadata for review. Promotion still requires a separate Milestone 69 review decision and tracked registry entry.

## Promotion Validation Pipeline

Milestone 69 adds a local promotion helper for the explicit review step between ignored quarantine and tracked registry:

```powershell
node .\scripts\solution-promotion-helper.js --print-review-template
node .\scripts\solution-promotion-helper.js --candidate .\logs\solution-candidates\candidate.json --review .\path\to\review.json
node .\scripts\solution-promotion-helper.js --candidate .\logs\solution-candidates\candidate.json --review .\path\to\review.json --write
```

Без `--write` helper только валидирует review decision и печатает preview. Запись в `registry/solutions.json` выполняется только когда review JSON содержит `schemaVersion: "solution-promotion-review.v1"`, `explicitReview: true`, `decision: "promote"`, tracked `targetStatus`, reviewer, promotion evidence и хотя бы один local plan validation/dry-run fixture.

Promotion review обязан заполнить registry metadata: inputs, target assumptions, execution mode, preferred tools, safety gates, verification recipe, tested AE context и promotion history. Candidate evidence используется как starting point, но не заменяет review decision.

Для raw ExtendScript promotion действуют дополнительные правила:

- inline `run_extendscript` запрещен; promoted raw JSX должен идти только через reviewed file under `scripts/solutions/` и `run_extendscript_file`;
- script должен быть маленьким, без `eval`, без direct project save, без hard-coded active project paths и без broad project-item deletion loops;
- mutating script обязан иметь `app.beginUndoGroup(...)` и `app.endUndoGroup()`;
- generated-object workflows должны иметь generated prefix/comment evidence;
- review должен содержать `typedToolComparison.existingTypedToolFits: false`, checked typed tools и rationale;
- verification recipe и plan fixture должны явно показывать read-back steps/evidence.

Если raw JSX recipe стабильно повторяется, это сигнал к `typed-tool-candidate` и последующей реализации typed bridge tool. Raw JSX не должен становиться постоянным shortcut, когда существующий или новый narrow bridge tool лучше выражает workflow.

## Planner Retrieval

Milestone 70 enables a read-only retrieval path for Agent planning prompts. The bridge reads `registry/solutions.json`, scores reviewed entries against the user request by tags, intent, preferred tools and risk, then injects only a compact top-N advisory section.

Retrieval rules:

- `candidate` remains invisible. Quarantine reports under `logs/solution-candidates/` are never read by planner retrieval.
- `recipe` can be suggested as an advisory planning pattern.
- `typed-tool-candidate` can be surfaced, but the prompt tells the model to recommend or use a narrow typed bridge tool rather than repeating a workaround.
- `tool` entries are represented by the normal MCP tool catalog; matching tool-backed entries suppress older raw JSX equivalents.
- stale entries whose preferred tools are no longer in the planning catalog are omitted.
- raw `extendscript-file` recipes are marked risky and must stay an escape hatch; the planner is told to prefer typed tools and only plan `run_extendscript_file` when no typed tool fits and raw execution is explicitly allowed.

The solution section is not an execution API. Every useful hint must still become normal MCP plan steps and pass the existing plan validation, dry-run/run gates, idempotency, checkpoint/edit-session protection and verification read-back.

## Validation

Run the dependency-free validator before promoting or editing solutions:

```powershell
node .\scripts\solution-registry-smoke.js
node .\scripts\solution-candidate-report-smoke.js
node .\scripts\solution-promotion-smoke.js
node .\scripts\solution-retrieval-smoke.js
```

The validators check registry shape, unique ids, tracked statuses, path hygiene, secret/path patterns, safety gates for mutating entries, stricter raw ExtendScript requirements, safe candidate quarantine report generation, explicit promotion decisions, local plan fixtures, typed-tool comparison gates and planner retrieval behavior.
