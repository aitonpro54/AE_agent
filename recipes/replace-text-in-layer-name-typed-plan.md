# Replace Text In Layer Name Typed Plan

## Goal

Заменить literal text в именах выбранных слоев через существующие typed bridge tools.

## Applies When

- Пользователь просит заменить один явный текстовый фрагмент другим в именах выбранных слоев.
- Активная композиция и выбранные слои должны быть подтверждены перед мутацией.
- `find` должен быть явным, непустым literal string.
- `replace` должен быть явным literal string; empty replacement допустим только когда пользователь явно просит удалить найденный текст.
- Matching is literal find/replace only. Настоящие regex semantics, capture groups, lookarounds, wildcard expansion or flags must fail closed and ask for clarification or a separate typed-tool contract.
- Задача не требует project item rename, source relinking, layer timing changes, marker edits, layer reordering, expressions, render queue changes or raw script execution.

## Plan Pattern

1. Run `get_active_comp` to confirm the active comp and capture the target composition identity.
2. Run `get_selected_layers` and bind concrete selected `layerIndex` values only from that read-only evidence.
3. Choose one explicit non-empty literal `find`, one explicit literal `replace`, and explicit `caseSensitive` behavior. Default to `caseSensitive:true` unless the user explicitly asks for case-insensitive replacement.
4. If the user asks for true regex semantics, regex flags, capture groups, lookarounds, wildcard matching, or pattern-driven replacement, ask for clarification instead of mapping it to literal replacement.
5. Run `rename_layers` once with the inspected comp target, concrete `layerIndices`, `mode:"findReplace"`, the literal `find`, the literal `replace`, and the chosen `caseSensitive` value.
6. Include `verifyAfter:true` and a stable `idempotencyKeyTemplate` on the mutating find/replace rename step.
7. Run `get_comp_details` for the same comp and report layer-name read-back evidence for every affected selected layer.

## Safety Gates

- Mutating selected-layer workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Do not infer selected layers without `get_selected_layers` evidence.
- Do not treat regex-looking text as regex; the current `rename_layers` `findReplace` path escapes the find text and performs literal replacement.
- Do not use this recipe for prefix/suffix rename, numbered or lettered exact rename, project item rename, source relinking, layer timing, marker edits, render queue changes or broad cleanup.

## Verification

- Each affected selected layer name equals its pre-mutation name after applying the requested literal replacement globally with the selected case-sensitivity behavior.
- The `rename_layers` result reports `changedCount` for the affected selected-layer count and includes before/after rename evidence.
- The post-run `get_comp_details` read-back shows no remaining literal `find` text on affected selected layers when the replacement is expected to cover all occurrences.
- The plan contains only active-comp inspection, selection inspection, one typed find/replace rename mutation and comp read-back.
