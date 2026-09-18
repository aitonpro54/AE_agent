"use strict";

const VERIFICATION_SCHEMA = "ae-solution-plan-readback-verification.v1";
const TIME_TOLERANCE = 1e-7;
const VALUE_TOLERANCE = 1e-7;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isBuilderPlan(plan) {
  return isPlainObject(plan) &&
    plan.executionMode === "preview-only-build" &&
    plan.previewLocal === true &&
    plan.requiresFreshEvidenceReview === true;
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function sameNumber(left, right, tolerance) {
  return finiteNumber(left) && finiteNumber(right) && Math.abs(left - right) <= tolerance;
}

function stepOrder(step, offset) {
  return Number.isInteger(step && step.index) && step.index > 0 ? step.index : offset + 1;
}

function expectedPhase(plan, phase) {
  const expectedReadBack = isPlainObject(plan && plan.expectedReadBack) ? plan.expectedReadBack : null;
  return expectedReadBack && Array.isArray(expectedReadBack[phase]) ? expectedReadBack[phase] : null;
}

function descriptorPath(value) {
  if (!Array.isArray(value) || value.length < 1) return null;
  const result = [];
  for (const segment of value) {
    if (!isPlainObject(segment) || !Number.isInteger(segment.propertyIndex) || segment.propertyIndex < 1 ||
        typeof segment.matchName !== "string" || !segment.matchName.trim()) return null;
    result.push({
      propertyIndex: segment.propertyIndex,
      matchName: segment.matchName.trim(),
      name: typeof segment.name === "string" && segment.name.trim() ? segment.name.trim() : null
    });
  }
  return result;
}

function pathText(path) {
  const normalized = descriptorPath(path);
  if (!normalized) return "invalid-property-path";
  return normalized.map((segment) => `${segment.propertyIndex}:${segment.matchName}${segment.name ? `:${segment.name}` : ""}`).join("/");
}

function pathsEqual(actual, expected) {
  const left = descriptorPath(actual);
  const right = descriptorPath(expected);
  if (!left || !right || left.length !== right.length) return false;
  return right.every((segment, index) => {
    const observed = left[index];
    return observed.propertyIndex === segment.propertyIndex &&
      observed.matchName === segment.matchName &&
      (!segment.name || observed.name === segment.name);
  });
}

function collectProperties(value, output, depth = 0) {
  if (!value || depth > 32) return;
  if (Array.isArray(value)) {
    for (const item of value) collectProperties(item, output, depth + 1);
    return;
  }
  if (!isPlainObject(value)) return;
  if (Array.isArray(value.propertyPath)) output.push(value);
  if (Array.isArray(value.children)) collectProperties(value.children, output, depth + 1);
}

function evidenceFromStep(step, offset) {
  if (!step || step.status !== "completed" || step.tool !== "get_layer_details" || !isPlainObject(step.result)) return null;
  const properties = [];
  collectProperties(step.result.propertyTree, properties);
  return {
    order: stepOrder(step, offset),
    comp: isPlainObject(step.result.comp) ? step.result.comp : null,
    layer: isPlainObject(step.result.layer) ? step.result.layer : null,
    properties,
    propertyTreeTruncated: step.result.propertyTreeTruncated === true
  };
}

function targetLabel(expected) {
  return `${expected.compName || "?"}#${expected.compItemIndex || "?"}/` +
    `${expected.layerName || "?"}#${expected.layerIndex || "?"}/${pathText(expected.propertyPath)}`;
}

function targetIdentityMatches(evidence, expected) {
  return Boolean(evidence.comp && evidence.layer) &&
    evidence.comp.itemIndex === expected.compItemIndex &&
    evidence.comp.name === expected.compName &&
    evidence.layer.index === expected.layerIndex &&
    evidence.layer.name === expected.layerName;
}

function invalidExpectation(expected) {
  if (!isPlainObject(expected) || !Number.isInteger(expected.compItemIndex) || expected.compItemIndex < 1 ||
      typeof expected.compName !== "string" || !expected.compName ||
      !Number.isInteger(expected.layerIndex) || expected.layerIndex < 1 ||
      typeof expected.layerName !== "string" || !expected.layerName ||
      !descriptorPath(expected.propertyPath) || !Array.isArray(expected.completeKeyframes)) return true;
  return expected.completeKeyframes.some((keyframe, offset) => !isPlainObject(keyframe) ||
    keyframe.index !== offset + 1 || !finiteNumber(keyframe.time) || !finiteNumber(keyframe.value) ||
    keyframe.inInterpolation !== "linear" || keyframe.outInterpolation !== "linear");
}

function compareKeyframes(property, expected) {
  if (property.expressionEnabled !== false) return {status: property.expressionEnabled === true ? "failed" : "needs_review",
    code: "EXPRESSION_STATE_UNPROVEN", errors: ["The property must still have expressions explicitly disabled."]};
  const wanted = expected.completeKeyframes;
  const observed = Array.isArray(property.keyframes) ? property.keyframes : null;
  if (Number.isInteger(property.numKeys) && property.numKeys !== wanted.length) {
    return { status: "failed", code: "KEYFRAME_MISMATCH",
      errors: [`count expected ${wanted.length}, observed ${property.numKeys}`] };
  }
  if (!Number.isInteger(property.numKeys) || !observed || property.keyframesTruncated === true || observed.length !== property.numKeys) {
    return { status: "needs_review", code: "INCOMPLETE_KEYFRAME_EVIDENCE", errors: ["Keyframe evidence is missing or truncated."] };
  }
  const errors = [];
  const count = Math.min(wanted.length, observed.length);
  for (let index = 0; index < count; index += 1) {
    const left = wanted[index];
    const right = observed[index];
    if (!isPlainObject(right)) {
      errors.push(`key ${index + 1} is missing`);
      continue;
    }
    if (right.index !== left.index) errors.push(`key ${index + 1} index expected ${left.index}, observed ${right.index}`);
    if (!sameNumber(left.time, right.time, TIME_TOLERANCE)) errors.push(`key ${index + 1} time expected ${left.time}, observed ${right.time}`);
    if (!sameNumber(left.value, right.value, VALUE_TOLERANCE)) errors.push(`key ${index + 1} value expected ${left.value}, observed ${right.value}`);
    if (right.inInterpolation !== "linear") errors.push(`key ${index + 1} inInterpolation expected linear, observed ${right.inInterpolation}`);
    if (right.outInterpolation !== "linear") errors.push(`key ${index + 1} outInterpolation expected linear, observed ${right.outInterpolation}`);
  }
  return errors.length
    ? { status: "failed", code: "KEYFRAME_MISMATCH", errors }
    : { status: "passed", code: "EXACT_MATCH", errors: [] };
}

function verifyTarget(expected, evidence, phase, offset) {
  const label = targetLabel(expected || {});
  if (invalidExpectation(expected)) {
    return { id: `${phase}:${offset + 1}`, phase, target: label, status: "needs_review", code: "INVALID_EXPECTATION",
      errors: ["Builder expectedReadBack entry is incomplete or non-canonical."] };
  }
  const sameTarget = evidence.filter((item) => targetIdentityMatches(item, expected));
  if (!sameTarget.length) {
    return { id: `${phase}:${offset + 1}`, phase, target: label, status: "needs_review", code: "MISSING_TARGET_EVIDENCE",
      errors: ["No completed get_layer_details evidence matched the expected comp and layer identity."] };
  }
  const matches = [];
  for (const item of sameTarget) {
    for (const property of item.properties) {
      if (pathsEqual(property.propertyPath, expected.propertyPath)) matches.push({ item, property });
    }
  }
  if (!matches.length) {
    const truncated = sameTarget.some((item) => item.propertyTreeTruncated);
    return { id: `${phase}:${offset + 1}`, phase, target: label, status: "needs_review",
      code: truncated ? "TRUNCATED_PROPERTY_EVIDENCE" : "MISSING_PROPERTY_EVIDENCE",
      errors: [truncated ? "Property tree was truncated before the expected property could be proved." : "No property matched the complete canonical property path."] };
  }
  if (matches.length > 1) {
    return { id: `${phase}:${offset + 1}`, phase, target: label, status: "needs_review", code: "AMBIGUOUS_PROPERTY_EVIDENCE",
      errors: ["More than one property evidence record matched the expected identity."] };
  }
  const comparison = compareKeyframes(matches[0].property, expected);
  return { id: `${phase}:${offset + 1}`, phase, target: label, status: comparison.status, code: comparison.code,
    evidenceStepIndex: matches[0].item.order, expectedKeyframeCount: expected.completeKeyframes.length,
    observedKeyframeCount: matches[0].property.numKeys, errors: comparison.errors };
}

function summarize(phase, checks, extraErrors = []) {
  const failed = checks.filter((check) => check.status === "failed").length;
  const needsReview = checks.filter((check) => check.status === "needs_review").length;
  const status = failed || extraErrors.some((error) => error.status === "failed")
    ? "failed"
    : needsReview || extraErrors.length
      ? "needs_review"
      : "passed";
  const errors = extraErrors.concat(checks.filter((check) => check.status !== "passed").map((check) => ({
    status: check.status,
    code: check.code,
    target: check.target,
    message: check.errors.join(" ")
  })));
  return {
    schema: VERIFICATION_SCHEMA,
    phase,
    status,
    ok: status === "passed",
    checkedTargets: checks.length,
    passedChecks: checks.filter((check) => check.status === "passed").length,
    failedChecks: failed,
    needsReviewChecks: needsReview,
    checks,
    errors
  };
}

function planMutationOrders(plan) {
  const steps = Array.isArray(plan && plan.steps) ? plan.steps : [];
  return steps.map((step, offset) => ({ step, order: stepOrder(step, offset) }))
    .filter((item) => item.step && item.step.mutatesProject === true)
    .map((item) => item.order);
}

function scopedEvidence(steps, predicate) {
  const output = [];
  for (let offset = 0; offset < steps.length; offset += 1) {
    const evidence = evidenceFromStep(steps[offset], offset);
    if (evidence && predicate(evidence.order)) output.push(evidence);
  }
  return output;
}

function checkSolutionPlanPreflight(plan, completedSteps) {
  if (!isBuilderPlan(plan)) return null;
  const expected = expectedPhase(plan, "before");
  if (!expected || !expected.length) return summarize("before", [], [{ status: "needs_review", code: "MISSING_BEFORE_EXPECTATIONS", message: "Builder plan has no before expectations." }]);
  const steps = Array.isArray(completedSteps) ? completedSteps : [];
  const mutationOrders = planMutationOrders(plan);
  if (!mutationOrders.length) return summarize("before", [], [{ status: "needs_review", code: "MISSING_MUTATION_STEPS", message: "Builder plan has no mutating steps." }]);
  const firstMutation = Math.min(...mutationOrders);
  const completedMutation = steps.some((step, offset) => mutationOrders.includes(stepOrder(step, offset)) && step && step.status === "completed");
  const extraErrors = completedMutation
    ? [{ status: "failed", code: "PREFLIGHT_TOO_LATE", message: "A builder mutation completed before preflight verification." }]
    : [];
  const evidence = scopedEvidence(steps, (order) => order < firstMutation);
  return summarize("before", expected.map((item, offset) => verifyTarget(item, evidence, "before", offset)), extraErrors);
}

function verifySolutionPlanReadBack(plan, run) {
  if (!isBuilderPlan(plan)) return null;
  const expected = expectedPhase(plan, "after");
  if (!expected || !expected.length) return summarize("after", [], [{ status: "needs_review", code: "MISSING_AFTER_EXPECTATIONS", message: "Builder plan has no after expectations." }]);
  const steps = Array.isArray(run && run.steps) ? run.steps : [];
  const mutationOrders = planMutationOrders(plan);
  if (!mutationOrders.length) return summarize("after", [], [{ status: "needs_review", code: "MISSING_MUTATION_STEPS", message: "Builder plan has no mutating steps." }]);
  const lastMutation = Math.max(...mutationOrders);
  const extraErrors = [];
  for (const order of mutationOrders) {
    const step = steps.find((item, offset) => stepOrder(item, offset) === order);
    if (!step) extraErrors.push({ status: "needs_review", code: "MISSING_MUTATION_RESULT", message: `No run result exists for mutating step ${order}.` });
    else if (step.status !== "completed") extraErrors.push({ status: "failed", code: "MUTATION_NOT_COMPLETED", message: `Mutating step ${order} ended with status ${step.status || "unknown"}.` });
  }
  const evidence = scopedEvidence(steps, (order) => order > lastMutation);
  return summarize("after", expected.map((item, offset) => verifyTarget(item, evidence, "after", offset)), extraErrors);
}

module.exports = {
  VERIFICATION_SCHEMA,
  checkSolutionPlanPreflight,
  verifySolutionPlanReadBack
};
