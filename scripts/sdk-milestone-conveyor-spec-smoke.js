"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repo = path.resolve(__dirname, "..");
const SPEC_PATH =
  ".codex-audit/sdk-milestone-conveyor/154-sdk-milestone-conveyor-spec.json";

function readJson(repoPath) {
  return JSON.parse(fs.readFileSync(path.join(repo, repoPath), "utf8"));
}

function byScope(spec, scope) {
  return spec.allowedScopes.find((entry) => entry.scope === scope);
}

function assertIncludes(list, value, label) {
  assert(Array.isArray(list), `${label} must be an array.`);
  assert(list.includes(value), `${label} must include ${value}.`);
}

function main() {
  const spec = readJson(SPEC_PATH);

  assert.strictEqual(spec.schema, "sdk-milestone-conveyor-spec.v1");
  assert.strictEqual(spec.milestone, 154);
  assert.match(spec.purpose, /compact queued work items/);
  assert.deepStrictEqual(spec.sourceMilestones, [
    ".codex-audit/sdk-next-lane/153-sdk-next-lane-selection.json",
  ]);

  for (const field of [
    "id",
    "milestone",
    "title",
    "laneId",
    "scope",
    "mode",
    "plannedPaths",
    "approvalRequired",
    "explicitApprovalText",
    "maxSdkThreadRuns",
    "validationCommands",
    "stopGates",
    "commitExpectation",
    "handoffExpectation",
    "pushPolicy",
    "contextPolicy",
    "status",
  ]) {
    assertIncludes(spec.queueItemSchema.requiredFields, field, "queue item required fields");
    assert(
      typeof spec.queueItemSchema.fieldContracts[field] === "string" &&
        spec.queueItemSchema.fieldContracts[field].length > 20,
      `Missing queue item field contract for ${field}.`,
    );
  }

  const localAudit = byScope(spec, "local-audit");
  assert(localAudit, "Missing local-audit scope.");
  assert.deepStrictEqual(localAudit.modes, ["local-only", "dry-run"]);
  assert.deepStrictEqual(localAudit.plannedPathAllowlist, [
    ".codex-audit/sdk-milestone-conveyor/**",
  ]);
  assert.strictEqual(localAudit.sdkThreadAllowed, false);
  assert.strictEqual(localAudit.networkAllowed, false);

  const docsAudit = byScope(spec, "docs-audit");
  assert(docsAudit, "Missing docs-audit scope.");
  assert.deepStrictEqual(docsAudit.modes, ["sdk-write"]);
  assert.deepStrictEqual(docsAudit.plannedPathAllowlist, [
    ".codex-audit/sdk-milestone-conveyor/**",
  ]);
  assert.strictEqual(docsAudit.sdkThreadAllowed, true);
  assert.strictEqual(docsAudit.networkAllowed, true);
  assert.strictEqual(docsAudit.requiresExplicitApproval, true);
  assert.strictEqual(docsAudit.maxSdkThreadRuns, 1);

  const providerSmokes = byScope(spec, "production-code-provider-smokes-current");
  assert(providerSmokes, "Missing current production-code provider-smokes scope.");
  assert.deepStrictEqual(providerSmokes.plannedPathAllowlist, [
    "scripts/provider-api-smoke.js",
    "scripts/provider-contract-smoke.js",
  ]);
  assert.strictEqual(providerSmokes.sdkThreadAllowed, false);
  assert.strictEqual(providerSmokes.networkAllowed, false);

  const cepPanel = byScope(spec, "cep-panel");
  assert(cepPanel, "Missing cep-panel scope.");
  assert.deepStrictEqual(cepPanel.modes, []);
  assert.deepStrictEqual(cepPanel.plannedPathAllowlist, []);
  assert.strictEqual(cepPanel.sdkThreadAllowed, false);
  assert.strictEqual(cepPanel.networkAllowed, false);
  assert.match(cepPanel.purpose, /remain disabled/);

  const stopGateIds = spec.defaultStopGates.map((gate) => gate.id);
  for (const gate of [
    "no-explicit-approval",
    "scope-or-path-outside-allowlist",
    "cep-panel-sdk-write-disabled",
    "live-or-external-validation-requested",
    "dependency-or-package-change",
    "dirty-tree-unrelated-changes",
    "validation-failed",
    "context-pressure",
    "push-requested-by-conveyor",
  ]) {
    assertIncludes(stopGateIds, gate, "default stop gates");
  }

  assertIncludes(
    spec.validationContract.requiredBeforeComplete,
    "node --check for every touched JavaScript file",
    "validation requiredBeforeComplete",
  );
  assertIncludes(
    spec.validationContract.requiredBeforeComplete,
    "npm.cmd run check:rules",
    "validation requiredBeforeComplete",
  );
  assertIncludes(
    spec.validationContract.forbiddenByDefault,
    "live CEP/After Effects validation",
    "validation forbiddenByDefault",
  );
  assertIncludes(
    spec.validationContract.forbiddenByDefault,
    "external-provider/OpenAI CLI planner validation",
    "validation forbiddenByDefault",
  );
  assertIncludes(
    spec.validationContract.forbiddenByDefault,
    "push",
    "validation forbiddenByDefault",
  );

  assert.strictEqual(spec.commitAndHandoffContract.commitPerMilestone, true);
  assert.strictEqual(spec.commitAndHandoffContract.handoffFile, ".codex/handoff.md");
  assert.strictEqual(
    spec.commitAndHandoffContract.planFile,
    "plans/target-app-execplan.md",
  );
  assert.strictEqual(spec.commitAndHandoffContract.pushPolicy, "no-push-by-default");
  assertIncludes(
    spec.commitAndHandoffContract.handoffMustInclude,
    "exact next prompt",
    "handoff required fields",
  );

  assert.deepStrictEqual(spec.m154SeriesBoundary.allowedSdkThreadProofs, [
    {
      milestone: 156,
      scope: "docs-audit",
      mode: "sdk-write",
      maxSdkThreadRuns: 1,
      plannedPathAllowlist: [".codex-audit/sdk-milestone-conveyor/**"],
    },
  ]);

  for (const forbidden of [
    "CEP-panel SDK writes",
    "editing cep-panel/panel.js through SDK",
    "production-code SDK writes",
    "production-code allowlist expansion",
    "live CEP/AE checks",
    "external-provider/OpenAI CLI planner",
    "mutating-live validation",
    "package install or dependency changes",
    "push",
  ]) {
    assertIncludes(spec.m154SeriesBoundary.notApproved, forbidden, "M154 boundary");
  }

  console.log("SDK milestone conveyor spec smoke: pass");
}

if (require.main === module) {
  main();
}
