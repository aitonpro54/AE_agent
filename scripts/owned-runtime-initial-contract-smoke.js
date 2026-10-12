"use strict";

// Offline fixtures only: no actual process, registry, config or authority files.
const assert = require("node:assert/strict");
const c = require("../mcp-server/owned-runtime-initial-contract");
const api = require("../mcp-server/owned-runtime-initial-model");
const H = value => c.hash(value), copy = value => c.clone(value);
function tag(type, value) { return { schema: c.SCHEMA + "." + type, scope: c.SCOPE, productionAuthority: false, ...value }; }
function fixture() {
  const f = { clock: { bootId: "fixture-clock", monoMs: 1000 }, lifecycleClock: { bootId: "fixture-clock", monoMs: 1000 }, scope: { machineId: "fixture-machine", userId: "fixture-user", canonicalRoot: "c:/fixture/ae-agent", physicalRootId: "fixture-volume-file-id", installationLineage: "fixture-installation" }, callerCounter: 0, revocationEpoch: 0, callerAvailable: true, seenEffects: [], completions: new Map(), storeFailure: null, inventoryTransform: null, callerTransform: null, lifecycleTransform: null, completionTransform: null };
  f.principal = { issuerId: "fixture-issuer", issuerInstanceId: "fixture-issuer-instance", subjectId: "fixture-subject", chatId: "fixture-chat", chatEpoch: 1, transportBindingHash: H("fixture-transport") };
  f.fence = { ownerId: "fixture-controller", epoch: 1, held: true, scopeHash: H(f.scope) };
  const authorization = tag("authorization", { anchorId: "fixture-anchor", principalHash: H(f.principal), authorizationId: "fixture-authorization", policyEpoch: 1, capabilities: ["BOOTSTRAP_READ", "READ"], issuedMonoMs: 1000, expiresMonoMs: 61000 });
  const anchor = tag("anchor", { origin: "initial_owned", ...f.scope, anchorId: "fixture-anchor", generation: "fixture-generation", launchKey: c.launchKey(f.scope), sourceHash: H("source-a"), configHash: H("config-a"), installHash: H("install-a"), authorizationHash: H(authorization), clockBootId: "fixture-clock", createdMonoMs: 1000 });
  const grant = tag("lifecycle-grant", { anchorId: anchor.anchorId, generation: anchor.generation, controllerId: f.fence.ownerId, preparedGrantId: "fixture-prelaunch-grant", preparedBeforeLaunch: true, boundWitnessId: null, boundRuntimeHash: null, capabilities: [...c.LIFECYCLE_CAPABILITIES], validUntil: "exact_target_exit_proven", retired: false });
  f.data = { anchor, authorization, grants: [grant], runtime: null, permits: [], events: [], headHash: null, fenceOwnerId: f.fence.ownerId, fenceEpoch: f.fence.epoch };
  f.runtime = tag("runtime-witness", { anchorId: anchor.anchorId, generation: anchor.generation, bootNonce: "fixture-runtime-boot", controllerId: f.fence.ownerId, heldWitnessId: "fixture-original-held-handle", kernelIdentity: { pid: 31337, birthFileTime: "133000000000000000", birthUtc: "2026-10-12T00:00:00.000Z", imagePath: "c:/fixture/node.exe", executableSha256: H("fixture-node-image") }, sourceHash: anchor.sourceHash, configHash: anchor.configHash, installHash: anchor.installHash, registrationHash: H("fixture-registration"), actor: { panelInstanceId: "fixture-panel", panelGeneration: "fixture-panel-generation", panelLifecycleEpoch: 1 }, connected: true });
  f.ready = { pendingCommands: 0, inflightCommands: 0, activeEditSession: false, projectLifecyclePending: false, projectLifecycleBlocked: false, bootstrapIdle: true, nativeExecutionIdle: true, unacceptedChildren: 0, unacceptedJobs: 0 };
  f.store = {
    read({ launchKey }) { if (f.data === null) return null; if (launchKey !== f.data.anchor.launchKey) c.fail("fixture_store_namespace_missing"); return copy(f.data); },
    atomicAppend(input) {
      const before = f.data;
      if (f.storeFailure === "before") c.fail("fixture_store_failure_before");
      if (input.expectedHeadHash !== before.headHash || input.expectedSequence !== before.events.length + 1) c.fail("fixture_store_cas_conflict");
      if (input.fence.held !== true || input.fence.ownerId !== f.fence.ownerId || input.fence.epoch !== f.fence.epoch || input.fence.scopeHash !== H(f.scope)) c.fail("fixture_store_fence_changed");
      if (before.events.some(e => e.attemptKey === input.stableAttemptKey)) c.fail("fixture_store_attempt_consumed");
      c.exact(input.records, Object.keys(input.records));
      if (Object.keys(input.records).some(k => !["permit", "grant", "runtime"].includes(k))) c.fail("fixture_store_record_invalid");
      const next = copy(before);
      if (input.records.permit) next.permits.push(copy(input.records.permit));
      if (input.records.grant) next.grants.push(copy(input.records.grant));
      if (input.records.runtime) next.runtime = copy(input.records.runtime);
      next.events.push(copy(input.event)); next.headHash = H(input.event); next.fenceOwnerId = f.fence.ownerId; next.fenceEpoch = f.fence.epoch;
      if (f.storeFailure === "partial") next.headHash = H("partial-publication");
      f.data = next;
      if (f.afterAppend) f.afterAppend(input);
      if (f.storeFailure === "after") c.fail("fixture_store_lost_ack");
      return { fixtureOnly: true };
    }
  };
  f.ports = {
    store: f.store,
    readScope: () => copy(f.scope), readClock: () => copy(f.clock), readLifecycleClock: () => copy(f.lifecycleClock), readFence: () => copy(f.fence),
    readInventory({ expectedEntries }) { const value = { complete: true, reparse: false, entries: copy(expectedEntries) }; return f.inventoryTransform ? f.inventoryTransform(value) : value; },
    readCaller(input) {
      if (!f.callerAvailable) c.fail("fixture_issuer_unavailable");
      assert.equal(Object.hasOwn(input, "principal"), false); assert.equal(Object.hasOwn(input, "chatId"), false);
      const n = ++f.callerCounter, value = { principal: copy(f.principal), callId: "fixture-call-" + n, nonce: "fixture-nonce-" + n, requestHash: input.requestHash, phase: input.phase, issuedMonoMs: f.clock.monoMs, expiresMonoMs: f.clock.monoMs + c.TTL.call, revocationEpoch: f.revocationEpoch, evidenceScope: c.SCOPE };
      return f.callerTransform ? f.callerTransform(value, input) : value;
    },
    readRuntime: () => copy(f.runtime), readReadiness: () => copy(f.ready),
    readLifecycle(input) {
      const g = f.data.grants.find(g => H(g) === input.grantHash); if (!g) c.fail("fixture_original_grant_missing");
      const value = { outcome: "ACK", grant: copy(g), runtime: copy(["observe_launch", "observe_original_launch"].includes(input.operation) ? f.runtime : f.data.runtime), positiveHeldTarget: true, receiptHash: H("fixture-" + input.operation), exitProof: null };
      if (input.operation === "observe_launch") { assert.ok(f.data.events.some(e => e.operation === "launch_reserve")); f.seenEffects.push("modeled_launch_observation"); }
      if (input.operation === "observe_original_launch") { const consumed = f.data.events.find(e => e.operation === "launch_reserve"); assert.equal(input.originalLaunchEventHash, H(consumed)); assert.equal(input.originalLaunchOperationId, consumed.operationId); f.seenEffects.push("original_launch_binding_observation"); }
      if (["shutdown_initial", "abort_unadmitted"].includes(input.operation)) { assert.ok(f.data.events.some(e => e.operation === "stop_reserve")); f.seenEffects.push("modeled_stop_observation"); }
      if (input.operation === "wait_exit") { value.outcome = "PENDING"; value.receiptHash = null; }
      return f.lifecycleTransform ? f.lifecycleTransform(value, input) : value;
    },
    readCompletion(input) {
      let value = f.completions.get(input.commandId);
      if (!value) { value = { commandId: input.commandId, requestHash: input.requestHash, runtimeHash: input.runtimeHash, actorHash: input.actorHash, receiptHash: H({ fixtureReceipt: input.commandId }), terminal: true, resultHash: H({ fixtureResult: input.commandId }), observedMonoMs: f.lifecycleClock.monoMs }; f.completions.set(input.commandId, copy(value)); }
      return f.completionTransform ? f.completionTransform(copy(value), input) : copy(value);
    }
  };
  f.model = api.createInitialOwnedModel(f.ports);
  f.tick = ms => { f.clock.monoMs += ms; f.lifecycleClock.monoMs += ms; };
  f.launch = () => { f.model.reserve(Object.freeze({ fixtureHandle: true })); return f.model.register(); };
  f.read = (name = "get_bridge_status", model = f.model) => { const ticket = model.enqueue({ name, args: {} }, Object.freeze({ fixtureHandle: true })), command = model.dispatch(ticket); assert.equal(command.ok, true); const result = model.complete(ticket); return { ticket, command, result }; };
  f.bracket = () => [f.read().command.permitId, f.read("get_project_info").command.permitId, f.read().command.permitId];
  f.adopt = () => f.model.adopt({ permitIds: f.bracket() }, Object.freeze({ fixtureHandle: true }));
  f.exit = () => { f.lifecycleTransform = (v, input) => { if (input.operation === "wait_exit") { v.outcome = "EXIT_PROVEN"; v.exitProof = { heldWitnessId: f.data.runtime.heldWitnessId, kernelIdentity: copy(f.data.runtime.kernelIdentity), runtimeHash: c.runtimeIdentityHash(f.data.runtime), exited: true, observedMonoMs: f.lifecycleClock.monoMs }; } return v; }; return f.model.waitExit(); };
  return f;
}
let passed = 0;
const groups = new Set();
function check(group, name, run) {
  const f = fixture();
  try { run(f); passed++; groups.add(group); } catch (error) { error.stack = group + " / " + name + ":\n" + error.stack; throw error; }
}
function denial(fn, code) { assert.throws(fn, error => typeof error.code === "string" && error.code.includes(code)); }
function rehashJournal(f) {
  let previous = null;
  f.data.events.forEach((e, i) => { e.sequence = i + 1; e.previousHash = previous; previous = H(e); }); f.data.headHash = previous;
}
function injectEvent(f, operation, outcome, fields = {}) {
  f.data.events.push(tag("event", { anchorId: f.data.anchor.anchorId, generation: f.data.anchor.generation, sequence: 1, previousHash: null, operationId: "forged-operation", attemptKey: H({ forged: operation, sequence: f.data.events.length }), operation, outcome, principalHash: null, runtimeHash: null, lifecycleGrantHash: null, permitHash: null, evidenceHash: H("forged-evidence"), clockBootId: f.clock.bootId, recordedMonoMs: f.clock.monoMs, replayAllowed: false, ...fields })); rehashJournal(f);
}
function revisions() {
  check("M1", "physical key survives canonical spelling aliases", f => {
    const key = c.launchKey(f.scope), alias = { ...f.scope, canonicalRoot: "C:/FIXTURE/AE-AGENT" };
    assert.equal(c.launchKey(alias), key); assert.notEqual(c.launchKey({ ...f.scope, physicalRootId: "other-file-id" }), key);
    f.launch(); const consumed = H(f.data.events.find(e => e.operation === "launch_reserve")); f.scope = alias; f.fence.scopeHash = H(alias);
    denial(() => api.createInitialOwnedModel(f.ports).reserve(), "canonical_scope_changed");
    assert.equal(H(f.data.events.find(e => e.operation === "launch_reserve")), consumed); assert.equal(f.seenEffects.length, 1);
  });
  check("M2", "late original witness binds without changing UNKNOWN or replay", f => {
    f.lifecycleTransform = (v, input) => input.operation === "observe_launch" ? { ...v, outcome: "UNKNOWN", runtime: null, positiveHeldTarget: false, receiptHash: null } : v;
    f.launch(); const unknown = copy(f.data.events.find(e => e.operation === "launch_unknown"));
    f.lifecycleTransform = null; const rebuilt = api.createInitialOwnedModel(f.ports), binding = rebuilt.register();
    assert.equal(binding.status, "original_launch_target_bound_readback"); assert.equal(binding.state, c.STATES.UNKNOWN_READBACK_ONLY); assert.equal(binding.modeledEffects, 0);
    assert.equal(f.data.grants.length, 2); assert.equal(f.data.grants[1].preparedGrantId, f.data.grants[0].preparedGrantId); assert.ok(f.data.events.some(e => H(e) === H(unknown)));
    denial(() => rebuilt.enqueue({ name: "get_project_info", args: {} }), "read_admission_closed"); assert.equal(rebuilt.reserve().consumed, true);
    assert.equal(rebuilt.register().status, "registration_consumed_readback"); rebuilt.drain(); assert.equal(rebuilt.abortUnadmitted().ok, true);
    f.model = rebuilt; assert.equal(f.exit().exitProven, true); assert.equal(f.seenEffects.filter(x => x === "modeled_launch_observation").length, 1); assert.equal(f.seenEffects.filter(x => x === "modeled_stop_observation").length, 1);
  });
  for (const kind of ["negative_target", "wrong_controller", "wrong_generation"]) check("M2", "late witness rejects " + kind, f => {
    f.lifecycleTransform = (v, input) => input.operation === "observe_launch" ? { ...v, outcome: "UNKNOWN", runtime: null, positiveHeldTarget: false, receiptHash: null } : v; f.launch();
    f.lifecycleTransform = (v, input) => { if (input.operation === "observe_original_launch") { if (kind === "negative_target") v.positiveHeldTarget = false; if (kind === "wrong_controller") v.runtime.controllerId = "foreign-controller"; if (kind === "wrong_generation") v.runtime.generation = "foreign-generation"; } return v; };
    if (kind === "negative_target") assert.equal(f.model.register().status, "original_launch_target_unbound"); else denial(() => f.model.register(), "initial_");
    assert.equal(f.data.runtime, null); assert.equal(f.data.grants.length, 1); assert.equal(f.model.readBack().state, c.STATES.UNKNOWN_READBACK_ONLY); assert.equal(f.data.events.filter(e => e.operation === "launch_reserve").length, 1);
  });
  check("M3", "null panel actor retains exact teardown and excludes panel namespace", f => {
    f.runtime.actor = null; f.runtime.connected = false; f.runtime.registrationHash = null;
    assert.equal(f.launch().state, c.STATES.UNKNOWN_READBACK_ONLY); c.runtime(f.runtime);
    assert.equal(api.expectedInventory(f.data).some(row => row.namespace === "panel"), false);
    denial(() => f.model.enqueue({ name: "get_bridge_status", args: {} }), "read_admission_closed"); f.model.drain(); assert.equal(f.model.abortUnadmitted().ok, true); assert.equal(f.exit().exitProven, true);
  });
  check("M3", "registered null actor still cannot issue read permit", f => {
    f.runtime.actor = null; f.runtime.connected = false; assert.equal(f.launch().state, c.STATES.REGISTERED_CLOSED);
    denial(() => f.model.enqueue({ name: "get_project_info", args: {} }), "connected_registered_actor_required"); assert.equal(f.data.permits.length, 0);
    denial(() => c.runtime({ ...f.runtime, connected: true }), "null_actor_must_be_disconnected"); f.model.drain(); assert.equal(f.model.shutdown().ok, true);
  });
  for (const phase of ["before_drain", "after_drain"]) check("M4", "new fence owner cannot inherit lifecycle grant " + phase, f => {
    f.launch(); f.adopt(); const dispatched = f.model.enqueue({ name: "get_project_info", args: {} }), cmd = f.model.dispatch(dispatched);
    if (phase === "after_drain") f.model.drain();
    f.fence.ownerId = "new-controller"; f.fence.epoch++;
    if (phase === "before_drain") { f.model.revoke(); assert.equal(f.model.reconcileCompletion({ permitId: cmd.permitId }).ok, true); denial(() => f.model.drain(), "lifecycle_controller_changed"); }
    else { const rebuilt = api.createInitialOwnedModel(f.ports); assert.equal(rebuilt.reconcileCompletion({ permitId: cmd.permitId }).ok, true); denial(() => rebuilt.shutdown(), "lifecycle_controller_changed"); denial(() => rebuilt.abortUnadmitted(), "abort_after_dispatch_forbidden"); }
    assert.equal(f.data.events.some(e => e.operation === "stop_reserve"), false); assert.equal(f.seenEffects.filter(x => x === "modeled_stop_observation").length, 0);
    assert.equal(f.model.readBack().executionEntitled, false); assert.equal(f.exit().exitProven, true); // factual held exit observation is a separate capability
  });
  check("M5", "reserve dispatch revocation drift never consumes launch", f => {
    f.callerTransform = (v, input) => input.phase === "dispatch" ? { ...v, revocationEpoch: v.revocationEpoch + 1 } : v;
    denial(() => f.model.reserve(), "revoked_during_reserve"); assert.equal(f.model.readBack().initialLaunchConsumed, false); assert.equal(f.seenEffects.length, 0);
  });
  check("M5", "adopt dispatch revocation drift never creates lease", f => {
    f.launch(); const ids = f.bracket(); f.callerTransform = (v, input) => input.phase === "dispatch" ? { ...v, revocationEpoch: v.revocationEpoch + 1 } : v;
    denial(() => f.model.adopt({ permitIds: ids }), "revoked_during_adopt"); assert.equal(f.data.events.some(e => e.operation === "adopt"), false); assert.equal(f.model.readBack().state, c.STATES.REGISTERED_CLOSED);
  });
  const callerBookkeepingDrifts = { expiry: f => f.tick(60001), inventory: f => { f.inventoryTransform = v => ({ ...v, complete: false }); }, fence: f => { f.fence.epoch++; }, caller_death: f => { f.callerAvailable = false; }, revocation: f => { f.revocationEpoch++; }, anchor: f => { f.data.anchor.sourceHash = H("replaced-initial-source"); } };
  for (const operation of ["reserve", "adopt"]) for (const [kind, drift] of Object.entries(callerBookkeepingDrifts)) check("M5", operation + " freshness after final caller bookkeeping " + kind, f => {
    let ids = null; if (operation === "adopt") { f.launch(); ids = f.bracket(); }
    f.afterAppend = input => { if (input.event.operation === "caller_dispatch") { f.afterAppend = null; drift(f); } };
    denial(() => operation === "reserve" ? f.model.reserve() : f.model.adopt({ permitIds: ids }), kind === "caller_death" ? "issuer_unavailable" : "initial_");
    assert.equal(f.data.events.some(e => e.operation === (operation === "reserve" ? "launch_reserve" : "adopt")), false);
    assert.equal(f.seenEffects.filter(x => x === "modeled_stop_observation").length, 0);
  });
  const dispatchDrifts = {
    actor: f => { f.runtime.actor.panelLifecycleEpoch++; }, source: f => { f.runtime.sourceHash = H("changed-source"); }, config: f => { f.runtime.configHash = H("changed-config"); }, kernel: f => { f.runtime.kernelIdentity.birthFileTime = "133000000000000001"; }, registration: f => { f.runtime.registrationHash = H("other-registration"); }, disconnect: f => { f.runtime.connected = false; }, caller_death: f => { f.callerAvailable = false; }, caller_handover: f => { f.principal.chatEpoch++; }, revocation: f => { f.revocationEpoch++; }, expiry: f => { f.tick(30001); }, clock_rollback: f => { f.clock.monoMs--; }, clock_boot: f => { f.clock.bootId = "foreign-boot"; f.clock.monoMs = 0; }, fence_owner: f => { f.fence.ownerId = "new-controller"; f.fence.epoch++; }, fence_epoch: f => { f.fence.epoch++; }, partial_inventory: f => { f.inventoryTransform = v => ({ ...v, complete: false }); }, missing_inventory: f => { f.inventoryTransform = v => ({ ...v, entries: v.entries.slice(1) }); }
  };
  for (const field of Object.keys(fixture().ready)) dispatchDrifts["readiness_" + field] = f => { f.ready[field] = typeof f.ready[field] === "number" ? 1 : !f.ready[field]; };
  for (const [kind, drift] of Object.entries(dispatchDrifts)) check("M6", "post-consumption dispatch " + kind, f => {
    f.launch(); const ticket = f.model.enqueue({ name: "get_project_info", args: {} });
    f.afterAppend = input => { if (input.event.operation === "dispatch") { f.afterAppend = null; drift(f); } };
    const result = f.model.dispatch(ticket); assert.equal(result.ok, false); assert.equal(result.state, c.STATES.UNKNOWN_READBACK_ONLY); assert.equal(result.consumed, true); assert.equal(result.modeledEffects, 0); assert.equal(result.modeledEffect, null);
    const original = copy(f.data.events.find(e => e.operation === "dispatch")); assert.ok(original); assert.equal(f.data.events.filter(e => e.operation === "dispatch").length, 1);
    assert.equal(api.createInitialOwnedModel(f.ports).readBack().state, c.STATES.UNKNOWN_READBACK_ONLY);
    const count = f.data.events.length; denial(() => f.model.dispatch(ticket), "initial_"); assert.equal(f.data.events.length, count); assert.ok(f.data.events.some(e => H(e) === H(original)));
    // Partial inventory cannot publish another event; the consumed dispatch still closes reconstruction.
    if (kind.includes("inventory")) assert.equal(f.data.events.some(e => e.operation === "dispatch_unknown"), false);
    if (kind.startsWith("fence_")) assert.equal(f.data.events.some(e => e.operation === "dispatch_unknown"), true);
  });
  for (const kind of ["lost_ack", "partial_publication"]) check("M6", "dispatch publication " + kind + " is zero effect UNKNOWN", f => {
    f.launch(); const ticket = f.model.enqueue({ name: "get_project_info", args: {} }), append = f.store.atomicAppend;
    f.store.atomicAppend = input => { const result = append(input); if (input.event.operation === "dispatch") { if (kind === "lost_ack") c.fail("fixture_dispatch_lost_ack"); else f.data.headHash = H("partial-dispatch-publication"); } return result; };
    const result = f.model.dispatch(ticket); assert.equal(result.ok, false); assert.equal(result.modeledEffects, 0); assert.equal(result.state, c.STATES.UNKNOWN_READBACK_ONLY); assert.equal(f.data.events.filter(e => e.operation === "dispatch").length, 1);
    assert.equal(api.createInitialOwnedModel(f.ports).readBack().state, c.STATES.UNKNOWN_READBACK_ONLY); denial(() => f.model.dispatch(ticket), "initial_");
  });
  check("M6", "fresh final caller observes revocation independently of prior dispatch proof", f => {
    f.launch(); const t = f.model.enqueue({ name: "get_project_info", args: {} }); let dispatchCalls = 0;
    f.callerTransform = (v, input) => { if (input.phase === "dispatch" && ++dispatchCalls === 2) v.revocationEpoch++; return v; };
    assert.equal(f.model.dispatch(t).modeledEffects, 0); assert.equal(dispatchCalls, 2); assert.equal(f.model.readBack().state, c.STATES.UNKNOWN_READBACK_ONLY);
  });
  check("M6", "exact factual completion remains allowed after consumed UNKNOWN", f => {
    f.launch(); const t = f.model.enqueue({ name: "get_project_info", args: {} }); f.afterAppend = input => { if (input.event.operation === "dispatch") { f.afterAppend = null; f.revocationEpoch++; } };
    const r = f.model.dispatch(t), unknown = copy(f.data.events.find(e => e.operation === "dispatch_unknown")), rebuilt = api.createInitialOwnedModel(f.ports);
    assert.equal(rebuilt.reconcileCompletion({ permitId: r.permitId }).ok, true); assert.equal(rebuilt.readBack().state, c.STATES.UNKNOWN_READBACK_ONLY); assert.ok(f.data.events.some(e => H(e) === H(unknown)));
    denial(() => rebuilt.enqueue({ name: "get_project_info", args: {} }), "read_admission_closed"); rebuilt.drain(); assert.equal(rebuilt.shutdown().ok, true);
  });
  const stopDrifts = { owner: f => { f.fence.ownerId = "new-controller"; f.fence.epoch++; }, epoch: f => { f.fence.epoch++; }, readiness: f => { f.ready.pendingCommands = 1; }, inventory: f => { f.inventoryTransform = v => ({ ...v, complete: false }); }, clock_rollback: f => { f.lifecycleClock.monoMs--; }, clock_boot: f => { f.lifecycleClock.bootId = "different-lifecycle-boot"; f.lifecycleClock.monoMs = 0; }, clock_budget: f => f.tick(c.TTL.observation + 1) };
  for (const [kind, drift] of Object.entries(stopDrifts)) check("M4", "fresh lifecycle guards after stop consumption " + kind, f => {
    f.launch(); f.model.drain(); f.afterAppend = input => { if (input.event.operation === "stop_reserve") { f.afterAppend = null; drift(f); } };
    const stopped = f.model.shutdown(); assert.equal(stopped.ok, false); assert.equal(stopped.state, c.STATES.UNKNOWN_READBACK_ONLY); assert.equal(stopped.consumed, true); assert.equal(stopped.modeledEffects, 0);
    assert.equal(f.data.events.filter(e => e.operation === "stop_reserve").length, 1); assert.equal(f.seenEffects.filter(x => x === "modeled_stop_observation").length, 0); assert.equal(api.createInitialOwnedModel(f.ports).readBack().state, c.STATES.UNKNOWN_READBACK_ONLY);
    f.ready.pendingCommands = 0; f.inventoryTransform = null; f.lifecycleClock = { bootId: "fixture-clock", monoMs: Math.max(1000, f.clock.monoMs) };
    const rebuilt = api.createInitialOwnedModel(f.ports); assert.equal(rebuilt.shutdown().status, "stop_consumed_wait_only"); assert.equal(f.seenEffects.filter(x => x === "modeled_stop_observation").length, 0);
    f.model = rebuilt; assert.equal(f.exit().exitProven, true); assert.equal(f.data.events.filter(e => e.operation === "stop_reserve").length, 1);
  });
  check("M4", "post-consumption authorizer cannot handover controller before stop", f => {
    f.launch(); f.model.drain(); let authorizationReads = 0; f.lifecycleTransform = (v, input) => { if (input.operation === "authorize_shutdown_initial" && ++authorizationReads === 2) { f.fence.ownerId = "new-controller"; f.fence.epoch++; } return v; };
    const stopped = f.model.shutdown(); assert.equal(stopped.modeledEffects, 0); assert.equal(stopped.state, c.STATES.UNKNOWN_READBACK_ONLY); assert.equal(f.seenEffects.filter(x => x === "modeled_stop_observation").length, 0);
  });
  for (const kind of ["negative_held_target", "changed_kernel_target"]) check("M4", "fresh post-consumption lifecycle authorization " + kind, f => {
    f.launch(); f.model.drain(); let reads = 0; f.lifecycleTransform = (v, input) => { if (input.operation === "authorize_shutdown_initial" && ++reads === 2) { if (kind === "negative_held_target") v.positiveHeldTarget = false; else v.runtime.kernelIdentity.birthFileTime = "133000000000000001"; } return v; };
    const result = f.model.shutdown(); assert.equal(result.modeledEffects, 0); assert.equal(result.state, c.STATES.UNKNOWN_READBACK_ONLY); assert.equal(f.seenEffects.filter(x => x === "modeled_stop_observation").length, 0); assert.equal(f.data.events.filter(e => e.operation === "stop_reserve").length, 1);
  });
  const invalidJournals = {
    unknown_operation: f => injectEvent(f, "grant_everything", "VERIFIED"), wrong_outcome: f => injectEvent(f, "launch_reserve", "EXIT_PROVEN"),
    exit_without_launch: f => { const bound = tag("lifecycle-grant", { ...copy(f.data.grants[0]), boundWitnessId: f.runtime.heldWitnessId, boundRuntimeHash: c.runtimeIdentityHash(f.runtime) }), retired = { ...bound, retired: true }; f.data.runtime = copy(f.runtime); f.data.grants.push(bound, retired); injectEvent(f, "exit_proven", "EXIT_PROVEN", { runtimeHash: retired.boundRuntimeHash, lifecycleGrantHash: H(retired) }); },
    launch_ack_without_reserve: f => { const bound = tag("lifecycle-grant", { ...copy(f.data.grants[0]), boundWitnessId: f.runtime.heldWitnessId, boundRuntimeHash: c.runtimeIdentityHash(f.runtime) }); f.data.runtime = copy(f.runtime); f.data.grants.push(bound); injectEvent(f, "launch_ack", "ACK", { runtimeHash: H(f.runtime), lifecycleGrantHash: H(bound) }); },
    stop_without_drain: f => { f.launch(); const g = f.data.grants.at(-1); injectEvent(f, "stop_reserve", "CONSUMED", { runtimeHash: g.boundRuntimeHash, lifecycleGrantHash: H(g), attemptKey: H({ launchKey: f.data.anchor.launchKey, generation: f.data.anchor.generation, effect: "initial_stop" }) }); },
    stop_ack_without_reserve: f => { f.launch(); f.model.drain(); const g = f.data.grants.at(-1); injectEvent(f, "stop_ack", "ACK", { runtimeHash: g.boundRuntimeHash, lifecycleGrantHash: H(g) }); },
    completion_without_dispatch: f => { f.launch(); f.model.enqueue({ name: "get_project_info", args: {} }); const p = f.data.permits[0]; injectEvent(f, "completion", "COMPLETED", { operationId: H({ permitId: p.permitId, requestHash: p.requestHash, runtimeHash: p.runtimeHash }), principalHash: p.principalHash, runtimeHash: p.runtimeHash, permitHash: H(p) }); },
    adopt_without_bracket: f => { f.launch(); injectEvent(f, "adopt", "READ_ONLY", { principalHash: f.data.authorization.principalHash, runtimeHash: H(f.runtime) }); },
    launch_bound_after_ack: f => { f.launch(); const g = f.data.grants.at(-1); injectEvent(f, "launch_bound", "BOUND", { runtimeHash: H(f.runtime), lifecycleGrantHash: H(g) }); },
    duplicate_launch: f => { f.launch(); const e = f.data.events.find(e => e.operation === "launch_reserve"); injectEvent(f, "launch_reserve", "CONSUMED", { principalHash: e.principalHash, lifecycleGrantHash: e.lifecycleGrantHash }); },
    altered_enqueue_tool: f => { f.launch(); f.model.enqueue({ name: "get_project_info", args: {} }); f.data.events.at(-1).operation = "enqueue:get_bridge_status"; rehashJournal(f); },
    changed_dispatch_command: f => { f.launch(); f.read(); const e = f.data.events.find(e => e.operation === "dispatch"); e.operationId = "foreign-command"; rehashJournal(f); },
    dispatch_after_revoke: f => { f.launch(); f.adopt(); f.model.enqueue({ name: "get_project_info", args: {} }); const p = f.data.permits.at(-1); f.model.revoke(); injectEvent(f, "dispatch", "DISPATCHED", { operationId: H({ permitId: p.permitId, requestHash: p.requestHash, runtimeHash: p.runtimeHash }), principalHash: p.principalHash, runtimeHash: p.runtimeHash, permitHash: H(p), attemptKey: H({ key: f.data.anchor.launchKey, effect: "dispatch", permitId: p.permitId }) }); },
    unlinked_grant: f => { f.data.grants.push({ ...copy(f.data.grants[0]), boundWitnessId: f.runtime.heldWitnessId, boundRuntimeHash: c.runtimeIdentityHash(f.runtime) }); },
    unbound_runtime: f => { f.data.runtime = copy(f.runtime); },
    crossed_principal: f => { f.launch(); f.data.events[0].principalHash = H("foreign-principal"); rehashJournal(f); }
  };
  for (const kind of ["expired_dispatch", "cross_boot_dispatch", "cross_boot_bracket", "expired_adopt", "adopt_without_read_capability"]) invalidJournals[kind] = f => {
    f.launch(); if (kind.includes("dispatch")) f.read(); else f.adopt();
    if (kind === "adopt_without_read_capability") { f.data.authorization.capabilities = ["BOOTSTRAP_READ"]; f.data.anchor.authorizationHash = H(f.data.authorization); }
    else {
      const event = f.data.events.find(e => e.operation === (kind === "cross_boot_bracket" ? "completion" : kind.includes("dispatch") ? "dispatch" : "adopt"));
      if (kind.startsWith("expired_")) for (const e of f.data.events) { if (e.sequence >= event.sequence) e.recordedMonoMs = kind === "expired_dispatch" ? 40000 : 61001; }
      else event.clockBootId = "unrelated-proof-clock";
    }
    rehashJournal(f);
  };
  invalidJournals.adopt_without_phase_proofs = f => { f.launch(); f.adopt(); const ids = f.data.permits.map(p => p.permitId), requestHash = H({ operation: "adopt_initial", permitIds: ids }); f.data.events = f.data.events.filter(e => !e.operation.startsWith("caller_") || e.operationId !== requestHash); rehashJournal(f); };
  invalidJournals.dispatch_reusing_prior_phase_proof = f => { f.launch(); f.read(); f.read(); const p = f.data.permits.at(-1), enq = f.data.events.find(e => e.permitHash === H(p) && e.operation.startsWith("enqueue:")); f.data.events = f.data.events.filter(e => !(e.operation === "caller_dispatch" && e.operationId === p.requestHash && e.sequence > enq.sequence)); rehashJournal(f); };
  invalidJournals.enqueue_reusing_prior_phase_proofs = f => { f.launch(); f.read(); f.model.enqueue({ name: "get_bridge_status", args: {} }); const priorEnd = f.data.events.find(e => e.operation === "completion").sequence; f.data.events = f.data.events.filter(e => !(e.sequence > priorEnd && ["caller_ingress", "caller_enqueue"].includes(e.operation))); rehashJournal(f); };
  invalidJournals.duplicate_caller_evidence_with_rekeyed_attempt = f => { f.launch(); f.read(); const callers = f.data.events.filter(e => e.operation.startsWith("caller_")); callers.at(-1).evidenceHash = callers[0].evidenceHash; callers.at(-1).attemptKey = H("changed-proof-attempt"); rehashJournal(f); };
  invalidJournals.noncanonical_caller_attempt_key = f => { f.launch(); f.data.events.find(e => e.operation.startsWith("caller_")).attemptKey = H("random-caller-key"); rehashJournal(f); };
  invalidJournals.queued_dispatch_stealing_previous_final_guard = f => {
    f.launch(); const a = f.model.enqueue({ name: "get_project_info", args: {} }), b = f.model.enqueue({ name: "get_project_info", args: {} });
    f.model.dispatch(a); f.model.complete(a); const firstCompletion = f.data.events.at(-1).sequence;
    f.model.dispatch(b); f.model.complete(b); f.data.events = f.data.events.filter(e => !(e.operation === "caller_dispatch" && e.sequence > firstCompletion)); rehashJournal(f);
  };
  invalidJournals.enqueue_while_unmatched_dispatch = f => {
    f.launch(); const a = f.model.enqueue({ name: "get_project_info", args: {} }); f.model.enqueue({ name: "get_project_info", args: {} });
    const b = f.data.permits.at(-1), enqueued = f.data.events.find(e => e.operation.startsWith("enqueue:") && e.permitHash === H(b));
    f.model.dispatch(a); f.data.events = f.data.events.filter(e => e !== enqueued); f.data.events.push(enqueued); rehashJournal(f);
  };
  invalidJournals.dispatch_while_unmatched_dispatch = f => {
    f.launch(); const a = f.model.enqueue({ name: "get_project_info", args: {} }); f.model.enqueue({ name: "get_project_info", args: {} }); f.model.dispatch(a);
    const b = f.data.permits.at(-1); injectEvent(f, "dispatch", "DISPATCHED", { operationId: H({ permitId: b.permitId, requestHash: b.requestHash, runtimeHash: b.runtimeHash }), principalHash: b.principalHash, runtimeHash: b.runtimeHash, permitHash: H(b), attemptKey: H({ key: f.data.anchor.launchKey, effect: "dispatch", permitId: b.permitId }) });
  };
  check("M7", "two same-request queued tickets retain separate serial dispatch proofs", f => {
    f.launch(); const a = f.model.enqueue({ name: "get_project_info", args: {} }), b = f.model.enqueue({ name: "get_project_info", args: {} });
    assert.equal(f.model.dispatch(a).ok, true); assert.equal(f.model.readBack().state, c.STATES.UNKNOWN_READBACK_ONLY);
    denial(() => f.model.enqueue({ name: "get_project_info", args: {} }), "read_admission_closed"); denial(() => f.model.dispatch(b), "dispatch_permit_stale_or_closed");
    assert.equal(f.model.complete(a).ok, true); assert.equal(f.model.dispatch(b).ok, true); assert.equal(f.model.complete(b).ok, true);
    assert.equal(f.data.events.filter(e => e.operation === "dispatch").length, 2); api.snapshot(f.data); assert.equal(f.model.readBack().state, c.STATES.REGISTERED_CLOSED);
  });
  for (const field of ["runtimeHash", "actorHash"]) invalidJournals["coherent_forged_" + field] = f => {
    f.launch(); f.read("get_project_info"); const p = f.data.permits[0], before = H(p); p[field] = H("forged-" + field); const after = H(p), commandId = H({ permitId: p.permitId, requestHash: p.requestHash, runtimeHash: p.runtimeHash });
    for (const e of f.data.events) if (e.permitHash === before) { e.permitHash = after; e.runtimeHash = p.runtimeHash; if (["dispatch", "completion"].includes(e.operation)) e.operationId = commandId; }
    rehashJournal(f);
  };
  for (const kind of ["null_actor", "disconnected", "missing_bootstrap_capability", "missing_read_capability"]) invalidJournals["impossible_read_capability_" + kind] = f => {
    f.launch(); if (kind === "missing_read_capability") f.adopt(); f.model.enqueue({ name: "get_project_info", args: {} });
    if (kind.includes("capability")) { f.data.authorization.capabilities = f.data.authorization.capabilities.filter(x => x !== (kind === "missing_read_capability" ? "READ" : "BOOTSTRAP_READ")); f.data.anchor.authorizationHash = H(f.data.authorization); }
    else {
      if (kind === "null_actor") f.data.runtime.actor = null; f.data.runtime.connected = false;
      const p = f.data.permits.at(-1), before = H(p); p.runtimeHash = H(f.data.runtime); p.actorHash = H(f.data.runtime.actor);
      for (const e of f.data.events) { if (e.operation === "launch_ack") e.runtimeHash = H(f.data.runtime); if (e.permitHash === before) { e.permitHash = H(p); e.runtimeHash = p.runtimeHash; } }
    }
    rehashJournal(f);
  };
  for (const [kind, corrupt] of Object.entries(invalidJournals)) check("M7", "hash-valid impossible journal " + kind, f => {
    corrupt(f); const events = f.data.events.length, effects = f.seenEffects.length;
    denial(() => api.snapshot(f.data), "initial_"); const rebuilt = api.createInitialOwnedModel(f.ports); assert.equal(rebuilt.readBack().state, c.STATES.UNKNOWN_READBACK_ONLY); denial(() => rebuilt.reserve(), "initial_");
    assert.equal(f.data.events.length, events); assert.equal(f.seenEffects.length, effects);
  });
  for (const phase of ["bootstrap_pending", "bootstrap_complete", "adopted_complete"]) check("M8", "abort forbidden after any dispatch " + phase, f => {
    f.launch(); if (phase === "adopted_complete") f.adopt(); else { const t = f.model.enqueue({ name: "get_project_info", args: {} }); f.model.dispatch(t); if (phase === "bootstrap_complete") f.model.complete(t); }
    f.model.drain(); denial(() => f.model.abortUnadmitted(), "abort_after_dispatch_forbidden"); assert.equal(f.data.events.some(e => e.operation === "stop_reserve"), false);
    if (phase === "bootstrap_pending") f.model.reconcileCompletion({ permitId: f.data.permits.at(-1).permitId }); assert.equal(f.model.shutdown().ok, true);
    denial(() => f.model.abortUnadmitted(), "abort_after_dispatch_forbidden"); assert.equal(f.data.events.filter(e => e.operation === "stop_reserve").length, 1);
  });
  check("M8", "queued-only unadmitted target can still abort", f => { f.launch(); const t = f.model.enqueue({ name: "get_project_info", args: {} }); f.model.drain(); assert.equal(f.model.abortUnadmitted().ok, true); denial(() => f.model.dispatch(t), "dispatch_permit_stale_or_closed"); assert.equal(f.data.events.some(e => e.operation === "dispatch"), false); });
}
function main() {
  check("scope", "default unavailable dependencies fail closed", f => { const model = api.createInitialOwnedModel(); denial(() => model.reserve(), "private_port_unavailable"); assert.equal(model.readBack().state, c.STATES.UNKNOWN_READBACK_ONLY); assert.equal(model.productionAuthority, false); denial(() => model.assertExecution(), "execution_always_denied"); f.data = null; assert.equal(f.model.readBack().state, c.STATES.UNPROVISIONED); });
  check("scope", "fixture output never production proof", f => { const values = [f.model.readBack(), f.launch(), f.adopt(), f.model.readBack()]; for (const v of values) { assert.equal(v.scope, c.SCOPE); assert.equal(v.productionAuthority, false); assert.equal(v.replayAllowed, false); assert.equal(v.executionEntitled, false); } denial(() => f.model.assertExecution(), "execution_always_denied"); });
  check("issuer", "missing issuer never consumes launch", f => { f.callerAvailable = false; denial(() => f.model.reserve(), "issuer_unavailable"); assert.equal(f.data.events.length, 0); assert.equal(f.seenEffects.length, 0); });
  check("issuer", "forged or stale caller refused", f => { for (const transform of [v => ({ ...v, principal: { ...v.principal, chatId: "forged-chat" } }), v => ({ ...v, requestHash: H("wrong-request") }), v => ({ ...v, phase: "enqueue" }), v => ({ ...v, expiresMonoMs: f.clock.monoMs }), v => ({ ...v, evidenceScope: "production" })]) { f.callerTransform = transform; denial(() => f.model.reserve(), "initial_"); } assert.equal(f.model.readBack().initialLaunchConsumed, false); });
  check("issuer", "ingress to dispatch handover rejected", f => { f.callerTransform = (v, input) => input.phase === "dispatch" ? { ...v, principal: { ...v.principal, chatEpoch: 2 } } : v; denial(() => f.model.reserve(), "verified_caller"); assert.equal(f.model.readBack().initialLaunchConsumed, false); });
  check("issuer", "nonce replay survives reconstruction", f => { f.callerTransform = v => ({ ...v, callId: "reused-call", nonce: "reused-nonce" }); denial(() => f.model.reserve(), "evidence_replayed"); const reconstructed = api.createInitialOwnedModel(f.ports); denial(() => reconstructed.reserve(), "evidence_replayed"); assert.equal(f.model.readBack().initialLaunchConsumed, false); });
  check("closed_schema", "public claims getters symbols rejected", f => { f.launch(); const getter = { name: "get_bridge_status" }; Object.defineProperty(getter, "args", { enumerable: true, get() { throw Error("getter must not run"); } }); for (const bad of [getter, { name: "get_bridge_status", args: {}, principal: f.principal }, { name: "get_bridge_status", args: {}, [Symbol("claim")]: true }, { name: "get_bridge_status", args: { pid: 123 } }, Object.create({ name: "get_bridge_status", args: {} })]) denial(() => f.model.enqueue(bad), "initial_"); });
  check("closed_schema", "prefix annotation GET wildcard and mutation denied", f => { f.launch(); for (const name of ["get_project_info_extended", "get_anything", "connect", "refresh_bridge", "reconcile_project_lifecycle", "run_ai_agent_plan", "GET /dev/status"]) denial(() => f.model.enqueue({ name, args: {} }), "tool_not_allowed"); denial(() => f.model.enqueue({ name: "get_bridge_status", args: {}, annotations: { readOnlyHint: true } }), "read_request_invalid"); assert.equal(f.data.permits.length, 0); });
  check("bootstrap", "status project status before read-only adoption", f => { assert.equal(f.launch().state, c.STATES.REGISTERED_CLOSED); assert.equal(f.adopt().state, c.STATES.READ_SESSION_ACTIVE); assert.equal(f.data.permits.every(p => !p.executionEntitled), true); f.read("get_project_info"); assert.equal(f.data.permits.at(-1).kind, "READ"); });
  check("bootstrap", "disconnected panel has no autoconnect", f => { f.launch(); f.runtime.connected = false; denial(() => f.model.enqueue({ name: "get_project_info", args: {} }), "connected_registered_actor_required"); assert.deepEqual(f.seenEffects, ["modeled_launch_observation"]); });
  check("bootstrap", "wrong or stale bracket denied", f => { f.launch(); const ids = [f.read().command.permitId, f.read().command.permitId, f.read("get_project_info").command.permitId]; denial(() => f.model.adopt({ permitIds: ids }), "fresh_bracket_required"); const right = f.bracket(); f.tick(30001); denial(() => f.model.adopt({ permitIds: right }), "fresh_bracket_required"); assert.equal(f.model.readBack().state, c.STATES.REGISTERED_CLOSED); });
  check("bootstrap", "actor drift invalidates bracket", f => { f.launch(); const ids = f.bracket(); f.runtime.actor.panelLifecycleEpoch++; denial(() => f.model.adopt({ permitIds: ids }), "runtime_actor_changed"); });
  check("tickets", "opaque ticket immutable and instance-bound", f => { f.launch(); const ticket = f.model.enqueue({ name: "get_bridge_status", args: {} }); assert.equal(Object.isFrozen(ticket), true); denial(() => f.model.dispatch({ ...ticket }), "opaque_ticket_required"); denial(() => api.createInitialOwnedModel(f.ports).dispatch(ticket), "opaque_ticket_required"); });
  check("tickets", "caller death expiry and revoke before dispatch", f => { f.launch(); const t = f.model.enqueue({ name: "get_project_info", args: {} }); f.callerAvailable = false; denial(() => f.model.dispatch(t), "issuer_unavailable"); f.callerAvailable = true; f.revocationEpoch++; denial(() => f.model.dispatch(t), "dispatch_binding_changed"); f.revocationEpoch--; f.tick(30000); denial(() => f.model.dispatch(t), "dispatch_permit_stale_or_closed"); assert.equal(f.data.events.some(e => e.operation === "dispatch"), false); });
  check("tickets", "runtime and source/config changes rejected", f => { f.launch(); const t = f.model.enqueue({ name: "get_project_info", args: {} }); const original = copy(f.runtime); for (const change of [r => { r.generation = "other-generation"; }, r => { r.kernelIdentity.birthFileTime = "133000000000000001"; }, r => { r.sourceHash = H("source-b"); }, r => { r.configHash = H("config-b"); }, r => { r.actor.panelInstanceId = "other-panel"; }]) { f.runtime = copy(original); change(f.runtime); denial(() => f.model.dispatch(t), "initial_"); } assert.equal(f.data.events.some(e => e.operation === "dispatch"), false); });
  check("tickets", "fence handover rejects queued read", f => { f.launch(); const t = f.model.enqueue({ name: "get_bridge_status", args: {} }); f.fence.epoch++; f.fence.ownerId = "new-controller"; denial(() => f.model.dispatch(t), "fence_epoch_changed"); assert.equal(f.data.events.some(e => e.operation === "dispatch"), false); });
  check("tickets", "drain cancels queued reads but completes dispatched", f => { f.launch(); f.adopt(); const queued = f.model.enqueue({ name: "get_project_info", args: {} }), t = f.model.enqueue({ name: "get_project_info", args: {} }); f.model.dispatch(t); f.model.drain(); f.callerAvailable = false; denial(() => f.model.dispatch(queued), "dispatch_permit_stale_or_closed"); assert.equal(f.model.shutdown().status, "drain_pending_remains_alive"); assert.equal(f.model.complete(t).ok, true); assert.equal(f.model.shutdown().exitProven, false); });
  check("tickets", "revoke cancels old queue without requiring issuer for completion", f => { f.launch(); f.adopt(); const queued = f.model.enqueue({ name: "get_bridge_status", args: {} }), t = f.model.enqueue({ name: "get_project_info", args: {} }); f.model.dispatch(t); f.model.revoke(); f.callerAvailable = false; denial(() => f.model.dispatch(queued), "dispatch_permit_stale_or_closed"); assert.equal(f.model.complete(t).ok, true); });
  check("completion", "exact terminal receipt idempotent altered digest rejected", f => { f.launch(); const r = f.read("get_project_info"); assert.equal(f.model.complete(r.ticket).status, "terminal_completion_readback"); f.completionTransform = v => ({ ...v, receiptHash: H("changed-receipt") }); denial(() => f.model.complete(r.ticket), "terminal_completion_changed"); denial(() => f.model.reconcileCompletion({ permitId: r.command.permitId, principal: f.principal }), "closed_shape"); });
  check("completion", "crossed command/request/runtime/actor receipt rejected", f => { f.launch(); const t = f.model.enqueue({ name: "get_project_info", args: {} }); f.model.dispatch(t); for (const field of ["commandId", "requestHash", "runtimeHash", "actorHash"]) { f.completionTransform = v => ({ ...v, [field]: field === "commandId" ? "crossed-command" : H("crossed") }); denial(() => f.model.complete(t), "completion_binding_invalid"); } assert.equal(f.model.readBack().activeDispatchedTickets, 1); });
  check("completion", "crash reconstruction finishes original command only", f => { f.launch(); f.adopt(); const t = f.model.enqueue({ name: "get_project_info", args: {} }), cmd = f.model.dispatch(t), rebuilt = api.createInitialOwnedModel(f.ports); assert.equal(rebuilt.readBack().state, c.STATES.UNKNOWN_READBACK_ONLY); denial(() => rebuilt.dispatch(t), "opaque_ticket_required"); rebuilt.drain(); assert.equal(rebuilt.shutdown().status, "drain_pending_remains_alive"); rebuilt.reconcileCompletion({ permitId: cmd.permitId }); assert.equal(rebuilt.shutdown().ok, true); });
  check("persistence", "launch latch survives source/config/chat changes and reconstruction", f => { f.launch(); const key = f.data.anchor.launchKey; f.runtime.sourceHash = H("source-b"); f.runtime.configHash = H("config-b"); f.principal.chatId = "new-chat"; const rebuilt = api.createInitialOwnedModel(f.ports); assert.equal(rebuilt.reserve().consumed, true); assert.equal(f.data.anchor.launchKey, key); assert.deepEqual(f.seenEffects, ["modeled_launch_observation"]); });
  check("persistence", "parallel controllers consume one stable launch", f => { const other = api.createInitialOwnedModel(f.ports); f.model.reserve(); assert.equal(other.reserve().status, "launch_consumed_readback"); assert.equal(f.data.events.filter(e => e.operation === "launch_reserve").length, 1); f.model.register(); assert.equal(other.register().status, "registration_consumed_readback"); assert.equal(f.seenEffects.length, 1); });
  check("persistence", "lost append ACK never repeats launch", f => { f.storeFailure = "after"; denial(() => f.model.reserve(), "store_lost_ack"); f.storeFailure = null; const rebuilt = api.createInitialOwnedModel(f.ports); assert.equal(rebuilt.readBack().initialLaunchConsumed, false); /* The lost first caller append cannot authorize a launch. */ rebuilt.reserve(); assert.equal(rebuilt.readBack().initialLaunchConsumed, true); assert.equal(f.seenEffects.length, 0); });
  check("persistence", "lost consumed launch ACK remains consumed", f => { const original = f.store.atomicAppend; f.store.atomicAppend = input => { if (input.event.operation === "launch_reserve") { const result = original(input); c.fail("fixture_consumed_launch_lost_ack"); return result; } return original(input); }; denial(() => f.model.reserve(), "consumed_launch_lost_ack"); f.store.atomicAppend = original; const rebuilt = api.createInitialOwnedModel(f.ports); assert.equal(rebuilt.reserve().consumed, true); assert.equal(f.data.events.filter(e => e.operation === "launch_reserve").length, 1); assert.equal(f.seenEffects.length, 0); });
  check("persistence", "partial journal publication is UNKNOWN and cannot replay", f => { f.storeFailure = "partial"; denial(() => f.model.reserve(), "store_head_invalid"); f.storeFailure = null; const rebuilt = api.createInitialOwnedModel(f.ports); assert.equal(rebuilt.readBack().state, c.STATES.UNKNOWN_READBACK_ONLY); denial(() => rebuilt.reserve(), "store_head_invalid"); assert.equal(f.seenEffects.length, 0); });
  check("namespace", "foreign missing partial reparse and retained records refused", f => { for (const transform of [v => ({ ...v, complete: false }), v => ({ ...v, reparse: true }), v => ({ ...v, entries: v.entries.slice(1) }), v => ({ ...v, entries: [...v.entries, { namespace: "retained", kind: "fabricated-history", ref: "foreign", ownerAnchorId: "foreign", generation: "foreign" }] }), v => ({ ...v, entries: [...v.entries, copy(v.entries[0])] })]) { f.inventoryTransform = transform; denial(() => f.model.reserve(), "initial_"); } assert.equal(f.data.events.length, 0); });
  check("namespace", "physical root alias and scope fence mismatch refused", f => { f.scope.physicalRootId = "other-root-file-id"; denial(() => f.model.reserve(), "store_namespace_missing"); f.scope.physicalRootId = f.data.anchor.physicalRootId; f.fence.scopeHash = H("wrong-scope"); denial(() => f.model.reserve(), "fence_scope_changed"); assert.equal(f.data.events.length, 0); });
  check("lifecycle", "no prepared grant means no launch", f => { f.data.grants[0].preparedBeforeLaunch = false; denial(() => f.model.reserve(), "prelaunch_grant_required"); assert.equal(f.seenEffects.length, 0); });
  check("lifecycle", "partial registration keeps original target guardian", f => { f.lifecycleTransform = (v, input) => input.operation === "observe_launch" ? { ...v, outcome: "PARTIAL", runtime: { ...v.runtime, registrationHash: null }, receiptHash: null } : v; assert.equal(f.launch().state, c.STATES.UNKNOWN_READBACK_ONLY); assert.equal(f.model.reserve().consumed, true); denial(() => f.model.enqueue({ name: "get_project_info", args: {} }), "read_admission_closed"); f.model.drain(); assert.equal(f.model.abortUnadmitted().ok, true); assert.equal(f.exit().exitProven, true); assert.equal(f.model.readBack().state, c.STATES.RETIRED_EXIT_PROVEN); });
  check("lifecycle", "unbound unknown target is wait/readback only", f => { f.lifecycleTransform = (v, input) => input.operation === "observe_launch" ? { ...v, outcome: "UNKNOWN", runtime: null, positiveHeldTarget: false, receiptHash: null } : v; f.launch(); denial(() => f.model.drain(), "original_bound_grant_required"); denial(() => f.model.waitExit(), "original_bound_grant_required"); assert.equal(f.model.reserve().consumed, true); assert.equal(f.seenEffects.length, 1); });
  check("lifecycle", "issuer death expiry source/config drift preserve original teardown", f => { f.launch(); f.adopt(); f.tick(60001); f.callerAvailable = false; f.runtime.sourceHash = H("new-source"); f.runtime.configHash = H("new-config"); denial(() => f.model.enqueue({ name: "get_project_info", args: {} }), "issuer_unavailable"); f.model.drain(); assert.equal(f.model.shutdown().ok, true); assert.equal(f.exit().exitProven, true); assert.equal(f.seenEffects.filter(v => v === "modeled_stop_observation").length, 1); });
  check("lifecycle", "ACK and PID absence never claim exit", f => { f.launch(); f.model.drain(); assert.equal(f.model.shutdown().exitProven, false); f.runtime = null; assert.equal(f.model.waitExit().exitProven, false); assert.equal(f.model.readBack().state, c.STATES.DRAINING); });
  check("lifecycle", "lost shutdown ACK never consumes a second stop", f => { f.launch(); f.model.drain(); f.lifecycleTransform = (v, input) => input.operation === "shutdown_initial" ? { ...v, outcome: "UNKNOWN", receiptHash: null } : v; assert.equal(f.model.shutdown().state, c.STATES.UNKNOWN_READBACK_ONLY); const unknown = f.data.events.find(e => e.operation === "stop_unknown"), rebuilt = api.createInitialOwnedModel(f.ports); assert.equal(rebuilt.shutdown().status, "stop_consumed_wait_only"); f.model = rebuilt; f.exit(); assert.ok(f.data.events.some(e => H(e) === H(unknown))); assert.equal(f.seenEffects.filter(v => v === "modeled_stop_observation").length, 1); });
  check("lifecycle", "exact held-handle exit proof required", f => { f.launch(); f.model.drain(); f.model.shutdown(); f.lifecycleTransform = (v, input) => { if (input.operation === "wait_exit") { v.outcome = "EXIT_PROVEN"; v.exitProof = { heldWitnessId: "wrong-handle", kernelIdentity: copy(f.data.runtime.kernelIdentity), runtimeHash: c.runtimeIdentityHash(f.data.runtime), exited: true, observedMonoMs: f.lifecycleClock.monoMs }; } return v; }; denial(() => f.model.waitExit(), "exact_held_handle_exit_proof_required"); assert.equal(f.model.readBack().state, c.STATES.DRAINING); });
  check("lifecycle", "late readiness drift consumes UNKNOWN without modeled stop", f => { f.launch(); f.model.drain(); f.lifecycleTransform = (v, input) => { if (input.operation === "authorize_shutdown_initial") f.ready.pendingCommands = 1; return v; }; assert.equal(f.model.shutdown().state, c.STATES.UNKNOWN_READBACK_ONLY); assert.equal(f.model.readBack().stopConsumed, true); assert.equal(f.seenEffects.filter(v => v === "modeled_stop_observation").length, 0); f.ready.pendingCommands = 0; assert.equal(api.createInitialOwnedModel(f.ports).shutdown().status, "stop_consumed_wait_only"); assert.equal(f.seenEffects.filter(v => v === "modeled_stop_observation").length, 0); });
  for (const field of Object.keys(fixture().ready)) check("lifecycle", "readiness blocker " + field, f => { f.launch(); f.model.drain(); f.ready[field] = typeof f.ready[field] === "number" ? 1 : !f.ready[field]; assert.equal(f.model.shutdown().status, "drain_pending_remains_alive"); assert.equal(f.data.events.some(e => e.operation === "stop_reserve"), false); });
  check("clock", "rollback closes reads independent lifecycle clock retires original", f => { f.launch(); f.adopt(); f.tick(1000); f.read(); f.clock.monoMs = 1500; denial(() => f.model.enqueue({ name: "get_project_info", args: {} }), "clock_rollback"); f.model.drain(); assert.equal(f.model.shutdown().ok, true); assert.equal(f.exit().exitProven, true); denial(() => f.model.enqueue({ name: "get_project_info", args: {} }), "clock_rollback"); });
  check("clock", "boot change closes reads and never reissues stop", f => { f.launch(); f.adopt(); f.clock.bootId = "new-read-clock-boot"; f.clock.monoMs = 0; denial(() => f.model.enqueue({ name: "get_project_info", args: {} }), "clock_boot_changed"); f.model.drain(); f.model.shutdown(); const rebuilt = api.createInitialOwnedModel(f.ports); assert.equal(rebuilt.shutdown().status, "stop_consumed_wait_only"); assert.equal(f.seenEffects.filter(v => v === "modeled_stop_observation").length, 1); });
  check("clock", "missing or rolled-back lifecycle clock fails closed", f => { f.launch(); f.model.drain(); f.lifecycleClock.monoMs = 999; denial(() => f.model.shutdown(), "clock_rollback"); const ports = { ...f.ports }; delete ports.readLifecycleClock; denial(() => api.createInitialOwnedModel(ports).shutdown(), "private_port_unavailable"); assert.equal(f.data.events.some(e => e.operation === "stop_reserve"), false); });
  revisions();
  process.stdout.write(JSON.stringify({ ok: true, scope: c.SCOPE, productionAuthority: false, replayAllowed: false, liveProof: false, passed, groups: [...groups] }) + "\n");
}
if (require.main === module) { try { main(); } catch (error) { process.stderr.write(error.stack + "\n"); process.exitCode = 1; } }
module.exports = { main, fixture };
