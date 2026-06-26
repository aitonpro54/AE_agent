# Third-Party Semantics Safety Policy

## Scope

Use this policy recipe for DuIK, Newton, Illustrator-name, or similar
third-party semantics requests from the reopened Full Intaker backlog when the
request cannot be narrowed to an existing generated-only typed plan.

Covered examples include matching AE layers to Newton/Illustrator layer names,
copying Newton-derived position keyframes, assigning layer parents from
third-party naming conventions, renaming DuIK puppet-pin properties, changing
DuIK pin-size behavior, guide-layer behavior that cannot fit the explicit
Puppet guide-layer recipe, and scanning project comps for third-party pseudo
effects such as `Pseudo/Duik pin02`. This policy records a fail-closed review
path only; it does not approve third-party plugin semantics,
project-wide scans, parent writes, keyframe copies, effect mutation, or property
rename mutation by itself.

Existing narrow exceptions stay separate:

- `toggle-puppet-pin-types-typed-plan` may update an explicit generated
  `ADBE FreePin3 PosPin Type` property with read-back.
- `toggle-puppet-on-transparent-typed-plan` may update an explicit generated
  `ADBE FreePin3 On Transparent` property with read-back.
- `toggle-puppet-pins-as-guide-layers-typed-plan` may update native
  `guideLayer` on one explicit generated or reviewed Puppet host layer with
  effect evidence and layer/effect read-back.
- `hard-solo-layers-typed-plan`, `difference-blend-mode-typed-plan`, and
  selection recipes may update explicit generated layers only inside their
  documented contracts.

## Plan Pattern

1. Classify the request before planning mutation. Record whether it depends on
   DuIK, Newton, Illustrator-derived names, third-party pseudo effects,
   project-wide traversal, selected-property traversal, parent assignment,
   position keyframe copy, property rename, effect enabled/guide behavior, or
   Alt-key branching.
2. Run only read-only typed context tools when classification needs evidence:
   `get_active_comp`, `get_selected_layers`, `get_selected_properties`,
   `list_layers`, `get_comp_details`, `get_layer_details`, `list_effects`, and
   `get_effect_details`.
3. Prefer an existing narrow generated-only recipe when the request exactly
   matches one. Do not widen Puppet, layer metadata, selection, expression, or
   blend-mode recipes to cover DuIK/Newton semantics.
4. If no narrow recipe exists, return a typed-tool gap with the required future
   contract, generated fixture or mock third-party fixture, checkpoint or
   edit-session policy, cleanup/rollback path, and typed read-back evidence.
5. Do not synthesize raw ExtendScript, project-wide effect scans, inferred
   third-party naming rules, parent writes, keyframe copies, property renames,
   or effect toggles as a workaround.

## Safety Gates

- This policy recipe is a high-risk mutation gate. Classification may gather
  read-only typed evidence, but matched requests must not perform mutation
  unless a separate narrow contract and the full mutation gate set exist.
- Future DuIK contracts must prove the exact pseudo effect and property identity
  on a generated or mock third-party fixture before writing, then read back the
  exact effect/property state after mutation.
- Future puppet-pin rename contracts must bind explicit selected/generated
  property evidence, expose a reviewed property-name writer, and read back the
  renamed property identity without relying on source selected-property scans.
- Future Newton contracts must bind explicit generated layer-name pairs, prove
  parent assignment and keyframe-copy semantics with typed read-back, and reject
  ambiguous Illustrator/Newton naming.
- Project-wide traversal, user plugin effects, selected-property traversal,
  Alt-key branching, parent assignment, keyframe copy, property rename, effect
  enabled/guide writes, and raw script execution require a separate reviewed
  typed-tool contract and explicit approval for the risk class.

## Verification

- Planner output includes a third-party semantics risk classification and either
  names a matching narrow generated-only recipe or reports a typed-tool gap.
- Read-only preflight evidence, when used, comes only from comp/layer/property
  and effect inspection tools and does not mutate layers, parents, keyframes,
  effects, properties, sources, Project items, render queue items, files, or
  selection state.
- Unsupported requests explicitly mention the missing contract and future
  unblock condition: generated or mock third-party fixture, explicit approval,
  checkpoint/rollback, cleanup policy, and typed read-back.
- The plan never scans all project comps, mutates user DuIK/Newton plugin
  effects, copies keyframes, assigns parents, renames properties, toggles effect
  enabled/guide state, infers third-party naming, or executes raw script code
  under this policy.
