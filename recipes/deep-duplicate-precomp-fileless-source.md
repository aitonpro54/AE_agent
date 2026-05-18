# Deep Duplicate Precomp With Fileless Sources

## Plan Pattern

Use typed inspection tools to confirm the active comp and selected precomp layer, then run `deep_duplicate_precomp_sources` with `unavailableFootagePolicy: "reuse"` unless the user explicitly wants the run to fail on unreconstructable footage.

This recipe covers selected precomp source trees that include generated solids, adjustment layers, placeholders, or missing file footage. Generated solid sources should be reconstructed as new solid footage. Truly unrecoverable sources may be reused with warnings, so the copied comp can still be relinked safely.

## Safety Gates

Keep the normal Agent runner gates: plan validation, dry-run, explicit protected execution, mutation permission, idempotency, checkpoint or edit session protection, and post-mutation read-back.

## Verification

Read back the parent comp and selected layer after the run. Expected evidence is a duplicated source comp, the selected layer relinked to the duplicated comp, and warnings listing any original footage items reused because they could not be reconstructed.
