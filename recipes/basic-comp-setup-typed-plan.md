# Basic Comp Setup Typed Plan

## Goal

Создать одну базовую композицию через typed bridge tool и сразу прочитать её состояние обратно.

## Applies When

- Пользователь просит создать простую композицию с понятными размером, длительностью и FPS.
- Нужен небольшой стартовый comp для дальнейшей сборки сцены.
- Задача не требует массового изменения существующих comps или template batch updates.

## Plan Pattern

1. Run `get_project_info` when project context or existing item names may affect the target name.
2. Run `create_comp` with explicit `name`, `width`, `height`, `duration`, `frameRate` and optional `backgroundColor`.
3. Include `verifyAfter:true` and a stable `idempotencyKeyTemplate` on the mutating step.
4. Run `get_comp_details` for the created comp and report the returned dimensions, duration and frame rate.

## Safety Gates

- Mutating workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Do not bundle folder moves, broad comp updates, camera rigs or raw ExtendScript into this recipe.

## Verification

- The read-back step reports a comp matching the requested name, dimensions, duration and frame rate.
- The plan contains only the narrow creation mutation plus read-back.
- No raw ExtendScript is used.
