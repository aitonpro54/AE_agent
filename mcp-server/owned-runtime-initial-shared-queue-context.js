"use strict";

const { AsyncLocalStorage } = require("node:async_hooks");
const { stableStringify } = require("./m100-protocol");
function fail() { throw Object.assign(Error("owned_initial_private_shared_context_required"), { code: "owned_initial_private_shared_context_required" }); }
// Private daemon provenance only. The factory issues no native capability and
// cannot authenticate an HTTP request; the original native gate does that.
function createSharedQueueContextGuard(deps) {
  if (!deps || typeof deps.assertOriginal !== "function") fail();
  const ingress = new AsyncLocalStorage(), contexts = new WeakMap();
  function fingerprint(context) {
    const r = context.record;
    return stableStringify({ actionId:r.actionId, revision:r.revision, payloadHash:r.payloadHash,
      previewHash:r.previewHash, dryRunReceipt:r.dryRunReceipt, executionId:r.executionId,
      confirmedAt:r.confirmedAt, runId:context.runId, outerArgs:context.outerArgs, checkpoint:context.checkpoint });
  }
  function current(context) {
    if (!context || context.source !== "owned-native-shared-queue" || context.autonomous !== true ||
        context.confirm !== true || context.allowWithoutCheckpoint !== false || context.stepCount !== 1 ||
        !context.checkpoint || !context.record || context.record.executionState !== "executing" ||
        context.record.executionId !== context.runId) fail();
    const value = deps.assertOriginal(context);
    if (value === false || value && typeof value.then === "function") fail();
  }
  function assertContext(context) {
    const own = contexts.get(context);
    if (!own || !own.active || ingress.getStore() !== own || own.record !== context.record || own.fingerprint !== fingerprint(context)) fail();
    current(context); return true;
  }
  async function run(context, callback) {
    current(context); if (contexts.has(context) || typeof callback !== "function") fail();
    const frame = { active:true, record:context.record, fingerprint:fingerprint(context) };
    contexts.set(context, frame);
    try { return await ingress.run(frame, () => callback(context)); }
    finally { frame.active = false; }
  }
  return Object.freeze({ run, assertContext });
}
module.exports = { createSharedQueueContextGuard };
