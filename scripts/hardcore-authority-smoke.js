"use strict";

// Execute the current orchestration function with bounded in-memory collaborators.
// No provider, HTTP server, AE, artifact writer or registry promotion runs here.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");
const source = fs.readFileSync(path.join(__dirname, "../mcp-server/bridge-daemon.js"), "utf8");
const helpersStart = source.indexOf("const HARDCORE_INSPECTION_ONLY_TOOLS = new Set([");
const helpersEnd = source.indexOf("\nfunction compactHardcoreRunFailure(", helpersStart);
const reconcileStart = source.indexOf("\nfunction hardcoreRunNeedsReconciliation(");
const reconcileEnd = source.indexOf("\nasync function runValidatedAgentPlan(", reconcileStart);
const start = source.indexOf("async function runAgentHardcoreSession(source, args) {");
const end = source.indexOf("\nfunction escapeRegExp(", start);
assert(start > 0 && end > start, "current Hardcore function boundaries must exist");
assert(helpersStart >= 0 && helpersEnd > helpersStart, "current Hardcore success helper boundaries must exist");
assert(reconcileStart >= 0 && reconcileEnd > reconcileStart, "current Hardcore reconciliation helper boundaries must exist");

async function scenario(changeAt) {
  const initial = { authorized: true, capability: "typed_mutating_plan", sessionHash: "fixture-grant" };
  let authority = initial;
  let drafts = 0;
  const runs = [];
  const optional = (args, key, fallback) => args[key] === undefined ? fallback : args[key];
  const context = {
    crypto,
    autonomousSession: { authorization: () => authority },
    m100ProtocolError: (code, message) => Object.assign(new Error(message), { code }),
    optionalString: optional, optionalBoolean: optional, optionalNumber: optional,
    appendAiChatEvent() {},
    async draftHardcorePlan() {
      drafts++;
      if (changeAt === "draft") authority = null;
      return {plan: {steps: [{tool: "set_property_value"}]}, planValidation: {
        ok: true, mutatingCount: 1, steps: [{tool: "set_property_value", mutatesProject: true}]
      },
        requestId: "fixture-request", m100ActionProposal: {actionId: "fixture-action"}};
    },
    rawExtendscriptStepCount: () => 0,
    m100RunFieldsForProposal: (_proposal, confirm) => ({confirm, confirmationToken: confirm ? "manual-fixture" : undefined}),
    async runValidatedAgentPlan(args, options) {
      runs.push({dryRun: args.dryRun, authority: options.autonomousSession});
      if (args.dryRun && changeAt === "dry-run") authority = null;
      if (args.dryRun && changeAt === "off-on") authority = {...initial, sessionHash: "different-grant"};
      if (!args.dryRun && ["unknown_after_delivery", "timed_out_after_submit"].includes(changeAt)) {
        return {ok: false, dryRun: false, errorCode: changeAt, validation: {mutatingCount: 1},
          steps: [{tool: "set_property_value", status: "failed", mutatesProject: true, errorCode: changeAt}]};
      }
      if (!args.dryRun && changeAt === "applied_with_pending") {
        return {ok: true, dryRun: false, executedCount: 1,
          validation: {mutatingCount: 1}, outcome: {mutation: {status: "applied"}},
          steps: [{tool: "set_property_value", status: "completed", mutatesProject: true}],
          semanticVerification: {status: "needs_review", unverifiedMutationCount: 1}};
      }
      return args.dryRun
        ? {ok: true, dryRun: true, executedCount: 0}
        : {ok: true, dryRun: false, executedCount: 1, validation: {mutatingCount: 1},
          steps: [{tool: "set_property_value", status: "completed", mutatesProject: true}],
          semanticVerification: {status: "passed", unverifiedMutationCount: 0}};
    },
    recordHardcoreTypedToolFailures: () => [],
    persistHardcoreKnowledge: () => ({})
  };
  vm.createContext(context);
  vm.runInContext(source.slice(helpersStart, helpersEnd) + source.slice(reconcileStart, reconcileEnd) + source.slice(start, end), context, {timeout: 1000});
  const result = await context.runAgentHardcoreSession("panel-http", {prompt: "fixture", maxAttempts: 3});
  if (["unknown_after_delivery", "timed_out_after_submit"].includes(changeAt)) {
    assert.strictEqual(drafts, 1, `${changeAt}: unknown mutation must not create another plan attempt`);
    assert.strictEqual(runs.filter(run => !run.dryRun).length, 1, `${changeAt}: no automatic mutation retry`);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.finalAttempt.status, "run-needs-reconciliation");
  } else if (changeAt === "applied_with_pending") {
    assert.strictEqual(drafts, 1, "applied mutation without semantic proof must not create another plan attempt");
    assert.strictEqual(runs.filter(run => !run.dryRun).length, 1, "applied mutation with pending verification must not replay");
    assert.strictEqual(result.ok, false, "applied mutation without proof cannot report verified");
    assert.strictEqual(result.finalAttempt.status, "run-needs-reconciliation");
  } else if (changeAt) {
    assert.strictEqual(runs.filter(run => !run.dryRun).length, 0, `${changeAt}: revoked grant must not fall back to manual execution`);
    assert.strictEqual(result.ok, false, `${changeAt}: cannot report verified`);
    assert.strictEqual(drafts, 1, `${changeAt}: no provider retry after revocation`);
  } else {
    assert.strictEqual(result.ok, true);
    assert.strictEqual(runs.length, 2);
    assert(runs.every(run => run.authority && run.authority.sessionHash === initial.sessionHash));
  }
}

(async () => {
  for (const changeAt of ["dry-run", "draft", "off-on", null, "unknown_after_delivery", "timed_out_after_submit", "applied_with_pending"]) await scenario(changeAt);
  console.log(JSON.stringify({ok: true, scenarios: 7, actualHardcoreFunction: true, actualSuccessAndReconciliationHelpers: true, providerCalls: 0, aeCommands: 0}));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
