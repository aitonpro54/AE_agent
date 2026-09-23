"use strict";

// Execute the current orchestration function with bounded in-memory collaborators.
// No provider, HTTP server, AE, artifact writer or registry promotion runs here.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");
const source = fs.readFileSync(path.join(__dirname, "../mcp-server/bridge-daemon.js"), "utf8");
const start = source.indexOf("async function runAgentHardcoreSession(source, args) {");
const end = source.indexOf("\nfunction escapeRegExp(", start);
assert(start > 0 && end > start, "current Hardcore function boundaries must exist");

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
      return {plan: {steps: [{tool: "set_property_value"}]}, planValidation: {ok: true},
        requestId: "fixture-request", m100ActionProposal: {actionId: "fixture-action"}};
    },
    rawExtendscriptStepCount: () => 0,
    m100RunFieldsForProposal: (_proposal, confirm) => ({confirm, confirmationToken: confirm ? "manual-fixture" : undefined}),
    async runValidatedAgentPlan(args, options) {
      runs.push({dryRun: args.dryRun, authority: options.autonomousSession});
      if (args.dryRun && changeAt === "dry-run") authority = null;
      if (args.dryRun && changeAt === "off-on") authority = {...initial, sessionHash: "different-grant"};
      if (!args.dryRun && ["unknown_after_delivery", "timed_out_after_submit"].includes(changeAt)) {
        return {ok: false, errorCode: changeAt, steps: [{status: "failed", errorCode: changeAt}]};
      }
      return {ok: true, executedCount: args.dryRun ? 0 : 1};
    },
    hardcoreExecutablePlanBlocker: () => null,
    hardcoreAttemptSucceeded: attempt => attempt.run.ok,
    recordHardcoreTypedToolFailures: () => [],
    persistHardcoreKnowledge: () => ({})
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context, {timeout: 1000});
  const result = await context.runAgentHardcoreSession("panel-http", {prompt: "fixture", maxAttempts: 3});
  if (["unknown_after_delivery", "timed_out_after_submit"].includes(changeAt)) {
    assert.strictEqual(drafts, 1, `${changeAt}: unknown mutation must not create another plan attempt`);
    assert.strictEqual(runs.filter(run => !run.dryRun).length, 1, `${changeAt}: no automatic mutation retry`);
    assert.strictEqual(result.ok, false);
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
  for (const changeAt of ["dry-run", "draft", "off-on", null, "unknown_after_delivery", "timed_out_after_submit"]) await scenario(changeAt);
  console.log(JSON.stringify({ok: true, scenarios: 6, actualHardcoreFunction: true, providerCalls: 0, aeCommands: 0}));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
