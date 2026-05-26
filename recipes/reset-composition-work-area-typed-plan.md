# Reset Composition Work Area Typed Plan

## Goal

Сбросить work area композиции так, чтобы она начиналась с нуля и покрывала всю длительность композиции через typed bridge tools.

## Applies When

- Пользователь просит сбросить, растянуть или вернуть work area текущей композиции на всю композицию.
- Нужно исправить укороченную work area без изменения слоев, маркеров, render queue или настроек композиции.
- Целевая композиция является активной или явно указанной перед мутацией.

## Plan Pattern

1. Run `get_active_comp` to confirm the active comp and read its duration.
2. Run `set_comp_work_area` with `start:0` and `duration` copied from the inspected comp duration.
3. Include `verifyAfter:true` and a stable `idempotencyKeyTemplate` on the mutating step.
4. Run `get_comp_details` for the same comp and report the returned `workAreaStart` and `workAreaDuration`.

## Safety Gates

- Mutating workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Do not change comp duration, layer timing, markers, render queue items or project assets as part of this recipe.

## Verification

- The read-back step reports `workAreaStart` at zero.
- The read-back step reports `workAreaDuration` matching the comp duration inspected before mutation.
- The plan contains only the narrow work-area mutation plus read-back.
