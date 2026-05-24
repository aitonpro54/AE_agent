"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const ARTIFACT_PATH = ".codex-audit/sdk-ao-pattern-intake/212-activity-session-schema.json";

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

function assertNoUnexpectedWrites(artifact) {
  const forbiddenBoundaryClaims = artifact.machineCheck.requiredFalseBoundaryClaims;
  for (const claim of forbiddenBoundaryClaims) {
    assert.strictEqual(
      artifact.boundaryClaims[claim],
      false,
      `boundary claim ${claim} must remain false`,
    );
  }
}

function assertTaskEnvelope(artifact) {
  const required = artifact.machineCheck.requiredTaskEnvelopeFields;
  const declared = artifact.taskEnvelope.requiredFields;
  const example = artifact.taskEnvelope.example;

  assertIncludesAll(declared, required, "taskEnvelope.requiredFields");
  for (const field of required) {
    assert(Object.prototype.hasOwnProperty.call(example, field), `task envelope example missing ${field}`);
  }

  assert.strictEqual(example.taskId, "m212-ao-task-session-activity-schema");
  assert.strictEqual(example.milestone, 212);
  assert.strictEqual(example.handoffPath, artifact.machineCheck.requiredHandoffPath);
  assert.strictEqual(example.source.path, artifact.machineCheck.requiredQueuePath);
  assert.strictEqual(example.stateFile, `${artifact.machineCheck.requiredMappingRoot}state.json`);
  assert.strictEqual(example.activityLog, `${artifact.machineCheck.requiredMappingRoot}events.jsonl`);
  assert(example.nextPrompt.includes("M213"), "next prompt must hand off to M213");
  assert(example.nextPrompt.includes("do not install or run AO"), "next prompt must preserve AO boundary");

  assertIncludesAll(example.allowedCommands, artifact.taskEnvelope.example.validationCommands, "allowedCommands");
}

function assertRolesAndStates(artifact) {
  const roles = artifact.sessionRoles.map((entry) => entry.role);
  const states = artifact.lifecycleStates.map((entry) => entry.state);

  assertIncludesAll(roles, artifact.machineCheck.requiredRoles, "sessionRoles");
  assertIncludesAll(states, artifact.machineCheck.requiredLifecycleStates, "lifecycleStates");

  const writer = artifact.sessionRoles.find((entry) => entry.role === "writer");
  const reviewer = artifact.sessionRoles.find((entry) => entry.role === "reviewer");
  const analyzer = artifact.sessionRoles.find((entry) => entry.role === "analyzer");
  const liveCheck = artifact.sessionRoles.find((entry) => entry.role === "live-check");

  assert.strictEqual(writer.mayWrite, true, "writer may write planned paths");
  assert.strictEqual(reviewer.mayWrite, false, "reviewer must be read-only");
  assert.strictEqual(analyzer.mayWrite, false, "analyzer must be read-only");
  assert.strictEqual(liveCheck.requiresExplicitLiveApproval, true, "live-check must require explicit live approval");

  const terminalStates = new Set(
    artifact.lifecycleStates.filter((entry) => entry.terminal).map((entry) => entry.state),
  );
  assertIncludesAll([...terminalStates], ["errored", "done", "stopped", "escalated"], "terminal lifecycle states");
}

function assertEvents(artifact) {
  const required = artifact.machineCheck.requiredEventExamples;
  const examples = artifact.activityJsonlContract.eventExamples;
  const exampleTypes = examples.map((entry) => entry.event);
  const requiredFields = artifact.activityJsonlContract.requiredEventFields;
  const states = artifact.lifecycleStates.map((entry) => entry.state);
  const roles = artifact.sessionRoles.map((entry) => entry.role);

  assertIncludesAll(exampleTypes, required, "eventExamples");

  for (const event of examples) {
    for (const field of requiredFields) {
      assert(Object.prototype.hasOwnProperty.call(event, field), `${event.event} missing required field ${field}`);
    }
    assert(roles.includes(event.role), `${event.event} has unknown role ${event.role}`);
    assert(states.includes(event.state), `${event.event} has unknown lifecycle state ${event.state}`);
    assert.strictEqual(event.taskId, "m212-ao-task-session-activity-schema");
  }

  const validationFailed = examples.find((entry) => entry.event === "validation_failed");
  assert.strictEqual(validationFailed.state, "errored");
  assert.strictEqual(validationFailed.nextAction, "stop_and_record_repair_prompt");

  const commitCreated = examples.find((entry) => entry.event === "commit_created");
  assert.strictEqual(commitCreated.state, "done");
  assert(commitCreated.commit.includes("supervisor-created-commit"), "commit event must be supervisor-owned placeholder");
}

function assertRoadmapSupervisorMapping(artifact) {
  const mapping = artifact.roadmapSupervisorMapping;
  const root = artifact.machineCheck.requiredMappingRoot;

  assert.strictEqual(mapping.sessionRoot, root);
  assert.strictEqual(mapping.stateFile, `${root}state.json`);
  assert.strictEqual(mapping.activityLog, `${root}events.jsonl`);
  assert.strictEqual(mapping.queuePath, artifact.machineCheck.requiredQueuePath);
  assert.strictEqual(mapping.handoffPath, artifact.machineCheck.requiredHandoffPath);
  assert(mapping.note.includes("does not change"), "mapping note must state runtime behavior is unchanged");
}

function assertForbiddenBoundaries(artifact) {
  assert.strictEqual(artifact.source.notAnIntegration, true, "artifact must be explicitly design-only");
  assert(artifact.source.numberingDecision.includes("M211"), "numbering decision must record M211 collision");
  assertNoUnexpectedWrites(artifact);

  const plannedPaths = artifact.taskEnvelope.example.plannedPaths;
  const forbiddenPaths = artifact.taskEnvelope.example.forbiddenPaths;

  assert(plannedPaths.includes(ARTIFACT_PATH), "planned paths must include schema artifact");
  assert(plannedPaths.includes("scripts/sdk-ao-pattern-intake-smoke.js"), "planned paths must include smoke script");
  assert(forbiddenPaths.includes("cep-panel/**"), "forbidden paths must include CEP panel");
  assert(forbiddenPaths.includes("package.json"), "forbidden paths must include package manifest");
  assert(forbiddenPaths.includes(".github/**"), "forbidden paths must include GitHub automation");
}

function main() {
  const artifact = readJson(ARTIFACT_PATH);

  assert.strictEqual(artifact.schema, "sdk-ao-pattern-intake.activity-session-schema.v1");
  assert.strictEqual(artifact.milestone, 212);
  assert.strictEqual(artifact.source.queuePath, artifact.machineCheck.requiredQueuePath);

  assertTaskEnvelope(artifact);
  assertRolesAndStates(artifact);
  assertEvents(artifact);
  assertRoadmapSupervisorMapping(artifact);
  assertForbiddenBoundaries(artifact);

  console.log("SDK AO pattern intake smoke: pass");
}

if (require.main === module) {
  main();
}
