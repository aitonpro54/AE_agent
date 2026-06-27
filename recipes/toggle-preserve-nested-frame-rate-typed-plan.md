# Toggle Preserve Nested Frame Rate Typed Plan

## Goal

Set `preserveNestedFrameRate` on explicit generated or reviewed compositions
through the bounded `set_comp_properties` typed tool.

## Applies When

- The user asks to toggle, enable, or disable Preserve frame rate when nested or in the
  render queue for one or more explicit compositions.
- A safe adaptation is acceptable: target compositions are bound by current
  typed evidence before mutation, not by broad all-project traversal.
- Each target composition is generated/temp or explicitly reviewed, and the
  requested final boolean value is explicit.
- The workflow can read each target with `get_comp_details`, call
  `set_comp_properties` with only `preserveNestedFrameRate`, and read the same
  composition back.
- Source-exact all-project scans, ALT-key branching, UI preference discovery,
  non-generated user comp batch mutation, render queue mutation, footage
  interpretation changes, raw ExtendScript, and source JSX copy remain out of
  scope.

## Plan Pattern

1. Bind each target composition with `create_comp`, `find_project_items`, or
   `get_comp_details` evidence. Prefer generated composition fixtures for live
   proof.
2. Run `get_comp_details` before mutation and record `itemIndex`, name,
   `preserveNestedFrameRate`, frame rate, duration, width, height, layer count,
   and work-area fields.
3. Normalize the requested final state to a boolean. Prefer explicit
   enable/disable wording over ambiguous toggle wording.
4. Run one `set_comp_properties` call per concrete composition with only
   `preserveNestedFrameRate`, `verifyAfter:true`, and a stable idempotency key
   when used in normal Agent planning.
5. Run `get_comp_details` after mutation for each same composition and compare
   `preserveNestedFrameRate` plus unchanged identity, dimensions, duration,
   frame rate, layer count, and work area.
6. Fail closed instead of using raw script execution when the request requires
   all-project traversal, Project panel selection, ALT-key behavior,
   non-generated user asset mutation, render queue changes, footage
   interpretation, or exact source JSX semantics.

## Safety Gates

- Mutating composition-property workflow.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint/edit-session protection, and
  post-mutation read-back.
- Mutate only `preserveNestedFrameRate` on explicitly bound composition items.
- Preserve comp identity, name, dimensions, duration, frame rate, background
  color, work area, layer stack, layer sources, effects, markers, render queue,
  project item folders, and non-target project items.
- Treat broad "all comps" requests as unsupported unless a separate reviewed
  generated-only batch contract defines the exact generated target set and
  cleanup policy.

## Verification

- Pre-run `get_comp_details` identifies every concrete target comp and its
  current `preserveNestedFrameRate` value.
- `set_comp_properties` reports `updatedFields:["preserveNestedFrameRate"]`
  and `postVerification.ok:true` for each target.
- Post-run `get_comp_details` shows the requested boolean value on the same
  composition.
- Post-run read-back shows unchanged width, height, duration, frame rate,
  background color, layer count, work area, and comp item identity.
- The plan reports all-project traversal, ALT-key branching, non-generated user
  comp mutation, render queue changes, footage interpretation, raw ExtendScript,
  and exact source JSX behavior as unsupported by this safe adaptation.
