# M204 Duplicate Layers Runtime Tool Design

Дата: 2026-05-24

## Цель

Добавить первый runtime-срез `duplicate_layers` для bounded multi-layer duplication после M197 design-only решения. Этот пункт реализует только typed bridge tool и локальный smoke-контракт; planner exposure, plan repair aliases, semantic verification, solution-library guidance, generated-only live lane, CEP UI и dependency changes остаются вне среза.

## Runtime Contract

- tool name: `duplicate_layers`;
- target comp: active comp by default, or explicit `compItemIndex` / `compName`;
- source targeting: required non-empty explicit `layerIndices`;
- optional guard: `sourceNames`, one expected source layer name per `layerIndices` entry;
- optional naming: `nameSuffix` applied to each duplicate after AE duplication;
- undo safety: the mutation opens one named undo group only after all preflight target checks pass, then closes it through a `finally` guard;
- result evidence: `pairs[]` with requested source index, source read-back before mutation, source read-back after mutation, duplicate read-back;
- count evidence: `layerCountBefore`, `layerCountAfter`, `duplicateCount`, and comp `numLayersBefore` / `numLayersAfter`;
- post-verification evidence: `postVerification` with expected/actual layer counts, count delta, duplicate count, and pair/count match booleans.

## Fail-Closed Behavior

The runtime tool rejects:

- missing or empty `layerIndices`;
- duplicate `layerIndices`;
- non-positive or non-integer `layerIndices`;
- out-of-range layer indexes in the resolved comp;
- locked source layers;
- mismatched `sourceNames`;
- selection-only targeting, because the tool has no selected-layer fallback.

The tool deliberately does not:

- delete layers or project items;
- deep-duplicate or relink precomp/source trees;
- edit masks, paths, audio workflows, CEP panel files, dependencies, package manifests, or user assets;
- run live AE/CEP mutation in this milestone.

## Validation Scope

Local validation is limited to:

- schema exposure through `tools/list`;
- safety schema fields inherited from mutating tool metadata;
- queued ExtendScript shape in `scripts/smoke-test.js`, including undo-group closure and explicit out-of-range/locked-layer guards;
- fake read-back result assertions for source/duplicate pairs, before/after layer counts, and `postVerification`;
- immediate non-queued rejection for empty, duplicate, and non-positive `layerIndices`.

Out-of-range and locked-layer rejection live in the generated ExtendScript before `app.beginUndoGroup`, and the smoke checks the emitted script contains those guards. Live AE mutation is intentionally not run for this queue item.
