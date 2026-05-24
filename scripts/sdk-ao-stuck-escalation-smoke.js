"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const DESIGN_PATH = ".codex-audit/sdk-ao-pattern-intake/213-stuck-escalation-design.json";
const PARENT_PATH = ".codex-audit/sdk-ao-pattern-intake/212-activity-session-schema.json";

function readJson(repoPath) {
  return JSON.parse(fs.readFileSync(path.join(repo, repoPath), "utf8"));
}

function assertIncludesAll(actualValues, expectedValues, label) {
  for (const expected of expectedValues) {
    assert(
      actualValues.includes(expected),
      `${label} must include ${expected}`,
    );
  }
}

function assertFalseClaims(design) {
  for (const claim of design.machineCheck.requiredFalseBoundaryClaims) {
    assert.strictEqual(
      design.boundaryClaims[claim],
      false,
      `boundary claim ${claim} must remain false`,
    );
  }
}

function minutesBetween(a, b) {
  return (Date.parse(a) - Date.parse(b)) / 60000;
}

function latestEvent(events) {
  return [...events].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))[0] || null;
}

function inputByName(design, inputName) {
  const input = design.stuckInputs.find((entry) => entry.input === inputName);
  assert(input, `missing stuck input ${inputName}`);
  return input;
}

function actionByName(design, actionName) {
  const action = design.escalationActions.find((entry) => entry.action === actionName);
  assert(action, `missing escalation action ${actionName}`);
  return action;
}

function hasUnplannedPath(session) {
  return (session.changedPaths || []).some((changedPath) => {
    return !(session.plannedPaths || []).includes(changedPath);
  });
}

function makeEscalation(design, input) {
  const action = actionByName(design, input.defaultEscalationAction);
  return {
    outcome: "escalated",
    stuckInput: input.input,
    action: action.action,
    autoFix: action.autoFix,
    autoRetry: action.autoRetry,
  };
}

function evaluateFixture(design, fixture) {
  const events = fixture.events || [];
  const latest = latestEvent(events);
  const session = fixture.session || {};

  if (hasUnplannedPath(session)) {
    return makeEscalation(design, inputByName(design, "unplanned_path_change"));
  }

  if (events.some((entry) => entry.event === "validation_failed") || session.state === "errored") {
    return makeEscalation(design, inputByName(design, "validation_failure"));
  }

  if (events.some((entry) => entry.event === "needs_input") || session.state === "needs_input") {
    return makeEscalation(design, inputByName(design, "needs_input_prompt"));
  }

  if (
    latest &&
    ["active", "idle"].includes(session.state) &&
    minutesBetween(fixture.now, latest.ts) > fixture.staleAfterMinutes
  ) {
    return makeEscalation(design, inputByName(design, "stale_activity"));
  }

  return {
    outcome: "healthy",
    stuckInput: null,
    action: null,
    autoFix: false,
    autoRetry: false,
  };
}

function assertPolicyShape(design, parent) {
  assert.strictEqual(design.schema, "sdk-ao-pattern-intake.stuck-escalation-design.v1");
  assert.strictEqual(design.milestone, 213);
  assert.strictEqual(parent.schema, design.machineCheck.requiredParentSchema);
  assert.strictEqual(design.source.parentContractPath, PARENT_PATH);
  assert.strictEqual(design.source.notRuntimeBehavior, true);
  assert.strictEqual(design.source.notAnAoIntegration, true);

  assert.strictEqual(design.policyDefaults.autoFix, false, "auto-fix must not be the default");
  assert.strictEqual(design.policyDefaults.autoRetry, false, "auto-retry must not be the default");
  assert.strictEqual(design.policyDefaults.unplannedPathChangeFailsClosed, true);
  assert.strictEqual(design.policyDefaults.liveAndDependencyActionsForbidden, true);
  assert(design.policyDefaults.maxRetriesPerInput <= 1, "per-input retries must be capped");
  assert(design.policyDefaults.maxTotalRetriesPerSession <= 2, "total retries must be capped");

  assertIncludesAll(
    design.stuckInputs.map((entry) => entry.input),
    design.machineCheck.requiredStuckInputs,
    "stuckInputs",
  );
  assertIncludesAll(
    design.escalationActions.map((entry) => entry.action),
    design.machineCheck.requiredEscalationActions,
    "escalationActions",
  );
  assertIncludesAll(
    design.forbiddenActions,
    design.machineCheck.requiredForbiddenActions,
    "forbiddenActions",
  );

  for (const input of design.stuckInputs) {
    const action = actionByName(design, input.defaultEscalationAction);
    assert.strictEqual(action.autoFix, false, `${action.action} must not auto-fix`);
    assert.strictEqual(action.autoRetry, false, `${action.action} must not auto-retry`);
    assert(input.retryCap <= design.policyDefaults.maxRetriesPerInput, `${input.input} retry cap too high`);
  }

  for (const action of design.escalationActions) {
    assert.strictEqual(action.autoFix, false, `${action.action} must keep autoFix false`);
    assert.strictEqual(action.autoRetry, false, `${action.action} must keep autoRetry false`);
  }

  assertFalseClaims(design);
}

function assertExamples(design) {
  assertIncludesAll(
    design.examples.map((entry) => entry.id),
    design.machineCheck.requiredExampleIds,
    "examples",
  );

  for (const example of design.examples) {
    const actual = evaluateFixture(design, example.fixture);
    assert.deepStrictEqual(actual, example.expected, `${example.id} outcome mismatch`);
  }

  const stale = design.examples.find((entry) => entry.id === "stale-active-writer");
  const validation = design.examples.find((entry) => entry.id === "validation-failed");
  const healthy = design.examples.find((entry) => entry.id === "healthy-done");
  const unplanned = design.examples.find((entry) => entry.id === "unplanned-path-change");

  assert.strictEqual(evaluateFixture(design, stale.fixture).action, "stop_and_handoff");
  assert.strictEqual(evaluateFixture(design, validation.fixture).action, "create_repair_prompt");
  assert.strictEqual(evaluateFixture(design, healthy.fixture).outcome, "healthy");
  assert.strictEqual(evaluateFixture(design, unplanned.fixture).action, "fail_closed");
  assert(unplanned.fixture.session.changedPaths.includes("package.json"), "unplanned fixture must prove package writes fail closed");
}

function main() {
  const design = readJson(DESIGN_PATH);
  const parent = readJson(PARENT_PATH);

  assertPolicyShape(design, parent);
  assertExamples(design);

  console.log("SDK AO stuck escalation smoke: pass");
}

if (require.main === module) {
  main();
}
