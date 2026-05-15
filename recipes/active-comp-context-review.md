# Active Comp Context Review

## Goal

Собрать компактный read-only контекст активной композиции перед ответом или дальнейшим Agent planning.

## Applies When

- Пользователь просит описать активную композицию, выбранные слои или состояние очереди рендера.
- Нужен безопасный preflight перед более точным планом.
- CEP panel может быть offline; в этом случае план должен честно сообщить, что live context недоступен.

## Plan Pattern

1. Run `get_active_comp` to inspect the active comp, selected layers, current time and source/precomp hints.
2. Run `get_selected_layers` only when selected layer details are needed beyond the active comp summary.
3. Run `get_render_queue_status` when the user asks about render/output state or when render queue context may affect the answer.
4. Summarize only returned metadata. Do not infer hidden project state from unavailable context.

## Safety Gates

- Read-only workflow.
- `planValidation` stays enabled.
- No mutation permission, confirmation, checkpoint or edit session is required.
- Do not call mutating tools from this recipe.

## Verification

- The response contains active comp or offline context evidence from typed read tools.
- No project-changing tool appears in the plan.
- No raw ExtendScript is used.
