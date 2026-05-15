# Selected Layers Align To CTI

## Goal

Выровнять выбранные слои по текущему времени активной композиции через typed bridge tool.

## Applies When

- Пользователь просит подвинуть выбранные слои, клипы или precomp layers к CTI.
- В активной композиции есть выбранные слои.
- Нужно сохранить обычные safety gates для мутации проекта.

## Plan Pattern

1. Run `get_active_comp` to confirm there is an active comp, read the CTI and selected layer indexes.
2. Run `align_layers_to_time` with no explicit `layerIndices` and no explicit `targetTime` when the selected layers should align to the active CTI.
3. Include `verifyAfter:true` and a stable `idempotencyKeyTemplate` on the mutating step.
4. Run `get_selected_layers` after the mutation to read back the affected layer timing.

## Safety Gates

- Mutating workflow.
- Requires validated Agent plan, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint/edit-session protection for confirmed live runs.
- Do not use raw ExtendScript for this workflow.

## Verification

- The read-back step reports the selected layer timing after the alignment.
- Each affected layer has the expected start/in-point relationship to the CTI.
- The plan contains exactly the narrow typed mutation needed for timing alignment.
