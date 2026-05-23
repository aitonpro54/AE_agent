# M192 Layer Duplicate Design

Дата: 2026-05-24

## Цель

M192 закрывает следующий узкий Dakkshin-inspired typed-tool gap из пары layer duplicate/delete: добавляется только безопасное явное дублирование одного слоя через `duplicate_layer`.

## Граница среза

`duplicate_layer` намеренно узкий:

- требует явный `layerIndex`;
- принимает `compItemIndex` или `compName`, иначе использует active comp;
- может проверить ожидаемое имя исходного слоя через `sourceName`;
- может задать имя созданного дубликата через `name`;
- возвращает read-back исходного слоя, дубликата и целевой композиции;
- проходит обычные M100, idempotency, checkpoint/edit-session и post-mutation verification gates.

Этот срез не реализует:

- удаление слоев;
- selection-only дублирование без явного target;
- массовое дублирование;
- relink/deep-precomp/source duplication;
- mask delete/invert/arbitrary path editing;
- broad comp mutation, audio workflows, CEP panel UI, dependency changes, push или PR.

## Validation strategy

Acceptance для M192 локальная и non-live:

- touched JavaScript `node --check`;
- plan repair alias coverage for `copyLayer`;
- semantic verification coverage for duplicate layer read-back;
- main bridge smoke exposure, queued command, and M100 safety schema coverage;
- AGENTS non-live suite.

Live CEP/AE mutating validation and OpenAI CLI planner acceptance are deliberately not rerun unless the user explicitly asks for a separate generated-only live lane.
