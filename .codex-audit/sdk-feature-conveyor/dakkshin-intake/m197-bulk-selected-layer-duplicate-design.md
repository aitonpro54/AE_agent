# M197 Bulk/Selected Layer Duplicate Design

Дата: 2026-05-24

## Цель

M197 фиксирует отдельный будущий gated-срез для bulk/selected-layer duplication после M192 single-layer `duplicate_layer`. Это design-only milestone: runtime tools, planner exposure, semantic verification code, CEP UI, live validation и OpenAI CLI planner acceptance не добавляются.

## Предлагаемая граница будущего среза

Будущий duplicate-many slice должен быть отдельным от `duplicate_layer` and should start with one narrow typed tool:

- proposed tool name: `duplicate_layers`;
- target comp must be explicit by `compItemIndex`, `compName`, or active comp;
- source layers must be explicit through `layerIndices`;
- selected-layer convenience may be allowed only when a preceding read-only selected-layer inspection binds concrete `layerIndices`;
- optional `sourceNames` guard may verify expected source layer names by index;
- optional `nameSuffix` may name duplicates predictably;
- response should return source/duplicate pairs, before/after layer counts, and compact layer read-back for every duplicate;
- semantic verification should prove every requested source has exactly one duplicate with the expected name/source relation.

## Safety gates

Будущий implementation slice должен fail-closed:

- reject when `layerIndices` is empty, duplicated, non-positive, or out of range;
- reject selection-only plans that do not bind concrete selected layer indexes from prior read-only evidence;
- reject locked source layers;
- reject broad all-layers duplication unless the plan explicitly passes a bounded `layerIndices` list;
- reject source/precomp relink/deep duplication unless using the existing `deep_duplicate_precomp_sources` lane;
- reject layer deletion, destructive layer replacement, mask delete/invert/path editing, audio-derived marker workflows, and arbitrary ExtendScript duplication loops;
- require generated-only live validation approval before any live mutating acceptance lane.

## Out of scope for M197

M197 не реализует:

- `duplicate_layers` or selected-layer duplicate runtime behavior;
- planner aliases, tool schema, bridge mutation code, semantic verification code, or local smoke assertions;
- layer delete or destructive cleanup;
- source/precomp relink duplication;
- mask delete/invert/arbitrary path editing;
- audio workflows;
- CEP panel UI, dependency changes, live CEP/AE validation, OpenAI CLI planner acceptance, push или PR.

## Validation strategy

Acceptance для M197 документационная и non-live:

- UTF-8 plan/handoff update;
- `npm.cmd run check:rules`;
- `git diff --check`.

Будущий implementation milestone должен add touched JavaScript `node --check`, plan-repair coverage, semantic verification coverage, main bridge smoke exposure/M100 safety checks, AGENTS non-live suite, and a separately approved generated-only live lane if live acceptance is requested.
