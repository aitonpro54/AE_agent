# Expose Essential Properties Typed Plan

## Plan Pattern

Use this recipe for generated-only Essential Properties work where the target is an explicit precomp layer and the Essential Property path is already known from read-back. Start with `get_layer_details` on the generated precomp layer, then inspect `layer.essentialProperty` using `get_layer_essential_properties` with `includeValues:true`.

Only after that evidence exists, use `set_expression` on one explicit Essential Property `propertyPath` when the property supports expressions and the reviewed expression text is provided. Finish with another `get_layer_essential_properties` read-back to prove the same Essential Property has `expressionEnabled:true` and no expression error.

## Safety Gates

The mutation is generated-only and requires normal plan validation, explicit mutation permission, checkpoint/edit-session protection, idempotency, and post-mutation read-back.

Do not infer Essential Properties from selected properties. Do not write across broad `layer.essentialProperty` collections, mutate user precomp templates, add new Essential Graphics controllers by side effect, export MOGRTs, or rewrite expressions without a reviewed `propertyPath`. If Essential Properties are unavailable or the property cannot accept an expression, fail closed.

## Verification

1. Read generated layer evidence with `get_layer_details`.
2. Read `layer.essentialProperty` with `get_layer_essential_properties` and record `essentialProperties.count`, property `name`, `matchName`, and `propertyPath`.
3. Apply `set_expression` to exactly the reviewed Essential Property path.
4. Read `get_layer_essential_properties` again and confirm `expressionEnabled:true`, matching `propertyPath`, and empty expression error.

Expected evidence includes generated nested comp/layer identity, `essentialProperties` read-back, explicit `propertyPath`, reviewed expression text, `expressionEnabled:true`, and no raw ExtendScript execution.
