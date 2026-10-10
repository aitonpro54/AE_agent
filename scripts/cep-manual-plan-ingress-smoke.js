"use strict";

const assert = require("node:assert/strict");
const { createManualPlanIngress } = require("../mcp-server/cep-manual-plan-ingress");
const { sha256Payload } = require("../mcp-server/m100-protocol");
function fixture() {
  const gate = createManualPlanIngress(), payload = { kind: "agent_plan", plan: { steps: [{ tool: "test", args: {} }] } };
  const record = { actionId: "action", revision: 7, payload, payloadHash: sha256Payload(payload), previewHash: "preview", riskLevel: "mutating",
    executionState: "executing", executionId: "run", confirmedAt: new Date().toISOString(), dryRunCompletedAt: new Date(Date.now() - 1000).toISOString(),
    proposalExpiresAt: new Date(Date.now() + 60000).toISOString(), confirmationSurface: "cep-panel", confirmedBySurface: "cep-panel", dryRunReceipt: { payloadHash: sha256Payload(payload) } };
  const context = { record, source: "ai-plan-run", autonomous: false, confirm: true, allowWithoutCheckpoint: false, runId: "run", args: {}, checkpoint: { sourceFile: "source", checkpointFile: "copy" } };
  const meta = { route: "/agents/plan/run", authRole: "panel", key: { actionId: record.actionId, payloadHash: record.payloadHash, previewHash: record.previewHash, riskLevel: record.riskLevel } };
  return { gate, record, context, meta };
}
(async () => {
  let groups = 0;
  async function check(fn) { await fn(); groups++; }
  await check(async () => {
    const f = fixture(); await f.gate.runAuthenticated(f.meta, async () => {
      await Promise.resolve(); f.gate.assertRequest(f.record); assert.equal(f.gate.brand(f.context), f.context); f.gate.assertContext(f.context);
      assert.throws(() => f.gate.assertContext({ ...f.context }), { code: "manual_cep_plan_ingress_required" });
    }); assert.throws(() => f.gate.assertContext(f.context));
  });
  await check(async () => {
    for (const delta of [{ route: "/dev/agents/plan/run" }, { authRole: "automation" }, { authRole: "admin" }]) {
      const f = fixture(); await f.gate.runAuthenticated({ ...f.meta, ...delta }, () => {
        assert.throws(() => f.gate.assertRequest(f.record)); assert.throws(() => f.gate.brand(f.context));
      });
    }
    const f = fixture(); assert.throws(() => f.gate.brand(f.context));
  });
  await check(async () => {
    for (const change of [f => f.context.autonomous = true, f => f.context.confirm = false, f => f.context.allowWithoutCheckpoint = true,
      f => f.record.executionId = "other", f => f.record.confirmedBySurface = "cep-autonomous-session", f => f.record.confirmedAt = "invalid",
      f => f.record.dryRunCompletedAt = "invalid", f => f.record.proposalExpiresAt = new Date(Date.now() - 1).toISOString(),
      f => f.record.payload.plan.steps[0].args = { changed: true }, f => f.meta.key.actionId = "other", f => f.context.checkpoint = null]) {
      const f = fixture(); change(f); await f.gate.runAuthenticated(f.meta, () => assert.throws(() => f.gate.brand(f.context)));
    }
  });
  await check(async () => {
    for (const change of [f => f.context.args.changed = true, f => f.context.checkpoint.checkpointFile = "other",
      f => f.record.revision++, f => f.record.dryRunReceipt.changed = true, f => f.context.record = { ...f.record }]) {
      const f = fixture(); await f.gate.runAuthenticated(f.meta, () => { f.gate.brand(f.context); change(f); assert.throws(() => f.gate.assertContext(f.context)); });
    }
  });
  await check(async () => {
    const f = fixture(), other = fixture(); await f.gate.runAuthenticated(f.meta, async () => {
      f.gate.brand(f.context); assert.throws(() => other.gate.assertContext(f.context));
      await f.gate.runAuthenticated(f.meta, () => assert.throws(() => f.gate.assertContext(f.context)));
      f.gate.assertContext(f.context); assert.throws(() => f.gate.brand(f.context));
    });
  });
  process.stdout.write(`CEP manual ingress: ${groups} groups PASS\n`);
})().catch(error => { process.stderr.write(String(error.stack || error) + "\n"); process.exitCode = 1; });
