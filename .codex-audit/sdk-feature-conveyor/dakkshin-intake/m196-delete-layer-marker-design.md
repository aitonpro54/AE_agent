# M196 Delete Layer Marker Design

Дата: 2026-05-24

## Цель

M196 реализует второй non-live implementation slice из M194: `delete_layer_marker` удаляет ровно один существующий layer marker через явный target and after-state evidence.

## Граница среза

`delete_layer_marker` намеренно узкий:

- требует явный `layerIndex`;
- target marker задаётся через `markerIndex` или через строгий `targetTime`;
- `targetComment` может использоваться как guard для существующего marker;
- response возвращает `markerDeleted` and compact `markers` summary after deletion;
- semantic verification подтверждает отсутствие удалённого marker target в post-run `get_layer_details` read-back.

Этот срез не реализует:

- marker update beyond the existing M195 tool;
- clear-all marker deletion or bulk marker deletion;
- audio import, beat detection, or marker generation from audio;
- layer/project deletion;
- mask delete/invert/arbitrary path editing;
- CEP panel UI, dependency changes, live CEP/AE validation, OpenAI CLI planner acceptance, push или PR.

## Validation strategy

Acceptance для M196 локальная и non-live:

- touched JavaScript `node --check`;
- plan repair aliases for marker delete plans;
- semantic verification coverage for deleted marker absence;
- main bridge smoke exposure, queued command, and M100 safety schema coverage;
- AGENTS non-live suite.

Live CEP/AE mutating validation and OpenAI CLI planner acceptance are deliberately not rerun unless the user explicitly asks for a separate generated-only live lane.
