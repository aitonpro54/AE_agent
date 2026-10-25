"use strict";

const { AsyncLocalStorage } = require("node:async_hooks");
const { sha256Payload, stableStringify } = require("./m100-protocol");

function denied() {
  throw Object.assign(new Error("Требуется ручное подтверждение текущего плана в CEP."), { code: "manual_cep_plan_ingress_required" });
}

// This factory stays in the server. Tool JSON and confirmation-surface strings
// cannot mint its private context brand. Only the authenticated HTTP handler
// supplies route/role; MCP, dev-admin and autonomous runners receive no brand.
function createManualPlanIngress() {
  const ingress = new AsyncLocalStorage();
  const brands = new WeakMap();
  function assertRequest(record) {
    const frame = ingress.getStore();
    if (!frame || !frame.alive || !record || record.actionId !== frame.key.actionId ||
        record.payloadHash !== frame.key.payloadHash || record.previewHash !== frame.key.previewHash ||
        record.riskLevel !== frame.key.riskLevel) denied();
  }
  const fingerprint = context => stableStringify({
    actionId: context.record.actionId, revision: context.record.revision,
    payloadHash: context.record.payloadHash, previewHash: context.record.previewHash,
    runId: context.runId, confirmedAt: context.record.confirmedAt,
    dryRunCompletedAt: context.record.dryRunCompletedAt,
    dryRunReceipt: context.record.dryRunReceipt, checkpoint: context.checkpoint,
    args: context.args
  });
  function validate(context, frame) {
    const record = context && context.record;
    if (!frame || !frame.alive || !record || context.source !== "ai-plan-run" || context.autonomous !== false ||
        context.confirm !== true || context.allowWithoutCheckpoint !== false ||
        record.actionId !== frame.key.actionId || record.payloadHash !== frame.key.payloadHash ||
        record.previewHash !== frame.key.previewHash || record.riskLevel !== frame.key.riskLevel ||
        record.executionState !== "executing" || record.executionId !== context.runId ||
        record.confirmationSurface !== "cep-panel" || record.confirmedBySurface !== "cep-panel" ||
        !Number.isFinite(Date.parse(record.confirmedAt)) || !Number.isFinite(Date.parse(record.dryRunCompletedAt)) ||
        Date.parse(record.confirmedAt) < Date.parse(record.dryRunCompletedAt) ||
        !Number.isFinite(Date.parse(record.proposalExpiresAt)) || Date.parse(record.proposalExpiresAt) <= Date.now() ||
        !record.payload || record.payloadHash !== sha256Payload(record.payload) || !context.checkpoint) denied();
  }
  async function runAuthenticated(meta, callback) {
    // Other existing runners continue normally, without a manual capability.
    if (!meta || meta.route !== "/agents/plan/run" || meta.authRole !== "panel") return callback();
    const frame = { alive: true, key: Object.freeze({ ...(meta.key || {}) }) };
    try { return await ingress.run(frame, callback); }
    finally { frame.alive = false; }
  }
  function brand(context) {
    const frame = ingress.getStore();
    validate(context, frame);
    if (brands.has(context)) denied();
    brands.set(context, { frame, record: context.record, fingerprint: fingerprint(context) });
    return context;
  }
  function assertContext(context) {
    const saved = context && brands.get(context), frame = ingress.getStore();
    if (!saved || saved.frame !== frame || saved.record !== context.record) denied();
    validate(context, frame);
    if (saved.fingerprint !== fingerprint(context)) denied();
  }
  return { runAuthenticated, assertRequest, brand, assertContext };
}

module.exports = { createManualPlanIngress };
