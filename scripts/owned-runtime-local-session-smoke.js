"use strict";

// Synthetic in-memory evidence only. No native process, filesystem, daemon or AE.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const api = require("../mcp-server/owned-runtime-local-session");
const c = require("../mcp-server/owned-runtime-initial-contract");
const H = c.hash, clone = c.clone;
const request = () => ({ name: "get_project_info", args: {} });
const groups = new Set();
let passed = 0;
function denial(run, code) { assert.throws(run, error => typeof error.code === "string" && error.code.includes(code)); }
function check(group, name, run) {
  try { run(); passed++; groups.add(group); }
  catch (error) { error.stack = group + " / " + name + ":\n" + error.stack; throw error; }
}
function fixture(maximumLedgerEntries = 32) {
  const f = { snapshotReads: 0, phaseRecords: [], consumeAttempts: [], consumed: new Map(), completionReads: 0 };
  const policy = { schema: api.SCHEMA, source: "local_operator", installationLineage: "fixture-installation", userSid: "S-1-5-21-100-200-300-1001", rootPinsHash: H("fixture-original-native-root-lock-journal"), policyEpoch: 1, enabled: true, capabilities: ["BOOTSTRAP_READ", "READ"], maximumSessionMs: c.TTL.lease, maximumLeaseMs: c.TTL.lease, authorizationAuditReference: "fixture-local-consent-not-chat-proof" };
  f.snapshot = {
    clock: { bootId: "fixture-monotonic-boot", monoMs: 1000 }, policy,
    principal: { kind: "local_operator", installationLineage: policy.installationLineage, userSid: policy.userSid, brokerInstanceId: "fixture-original-broker", controllerSessionId: "fixture-original-controller-session", controllerEpoch: 1, controllerWitnessHash: H("fixture-original-controller-handle-birth-image"), transportBindingHash: H("fixture-original-stdio-channel"), policyHash: H(policy) },
    controllerLive: true, transportLive: true, eof: false, revocationEpoch: 0,
    runtime: { daemonGeneration: "fixture-original-daemon-generation", fenceOwnerId: "fixture-original-broker", fenceEpoch: 1, fenceHeld: true, runtimeHash: H("fixture-original-daemon-handle-birth-image"), actor: { panelInstanceId: "fixture-original-panel", panelGeneration: "fixture-original-panel-generation", panelLifecycleEpoch: 1 }, connected: true, positiveHeldRuntime: true },
    readiness: { pendingCommands: 0, inflightCommands: 0, activeEditSession: false, projectLifecyclePending: false, projectLifecycleBlocked: false, bootstrapIdle: true, nativeExecutionIdle: true, unacceptedChildren: 0, unacceptedJobs: 0 }
  };
  f.ports = {
    readSnapshot() {
      f.snapshotReads++;
      if (f.onSnapshot) f.onSnapshot();
      return clone(f.snapshot);
    },
    recordPhase(value) {
      f.phaseRecords.push(value);
      if (f.afterPhase) f.afterPhase(value);
      return f.phaseReceipt ? f.phaseReceipt(value) : { recorded: true, callHash: H(value) };
    },
    consumeDispatch(value) {
      f.consumeAttempts.push(value);
      if (f.beforeConsume) f.beforeConsume(value);
      if (f.consumed.has(value.call.callId)) c.fail("fixture_dispatch_already_consumed");
      f.consumed.set(value.call.callId, clone(value));
      if (f.afterConsume) f.afterConsume(value);
      return f.consumeReceipt ? f.consumeReceipt(value) : { consumed: true, callId: value.call.callId, requestHash: value.call.requestHash };
    },
    readCompletion(input) {
      f.completionReads++;
      const original = f.consumed.get(input.callId);
      assert.ok(original, "completion must refer to original consumption");
      const result = { callId: original.call.callId, requestHash: original.call.requestHash, runtimeBindingHash: original.runtimeBindingHash, terminal: true, resultHash: H("fixture-terminal-result") };
      return f.completionTransform ? f.completionTransform(result) : result;
    }
  };
  f.verifier = api.createOfflineLocalSessionVerifier({ productionAuthority: false, ports: f.ports, maximumLedgerEntries });
  f.open = () => (f.session = f.verifier.openSession());
  f.begin = (body = request()) => f.verifier.beginCall(f.session || f.open(), body);
  f.queued = () => { const ref = f.begin(); f.verifier.ingress(ref); f.verifier.enqueue(ref); return ref; };
  f.tick = amount => { f.snapshot.clock.monoMs += amount; };
  f.run = () => { const ref = f.queued(); f.verifier.dispatch(ref); f.verifier.complete(ref); return ref; };
  return f;
}
function privateProjection(value) {
  assert.equal(value.authorityMode, "local_controller_session");
  assert.equal(value.genuineChatIdentity, false);
  assert.equal(value.productionAuthority, false);
  assert.equal(value.executionEntitled, false);
  assert.equal(value.replayAllowed, false);
  const text = JSON.stringify(value);
  for (const key of ["principalHash", "callId", "requestHash", "phaseNonce", "policyEpoch", "controllerSessionId", "daemonGeneration", "fenceEpoch", "userSid", "chatId"]) assert.equal(text.includes('"' + key + '"'), false, key + " must remain private");
}

check("boundary", "production factory cannot accept fixture ports or issue authority", () => {
  const f = fixture(), production = api.createLocalSessionVerifier();
  privateProjection(production.readBack());
  assert.equal(production.readBack().status, "production_private_ports_unavailable");
  for (const name of ["openSession", "beginCall", "ingress", "enqueue", "dispatch", "complete", "revoke", "closeTransport", "beginBootstrap", "renew"]) {
    const result = production[name](); privateProjection(result);
    assert.equal(result.ok, false); assert.equal(result.available, false);
  }
  const injected = api.createLocalSessionVerifier({ ports: f.ports, productionAuthority: true });
  assert.equal(injected.openSession().available, false); privateProjection(injected.openSession());
  denial(() => f.verifier.beginCall(production.openSession(), request()), "private_session_reference_required");
  assert.equal(f.snapshotReads, 0); assert.equal(f.consumeAttempts.length, 0);
});
check("boundary", "fixture scope is explicit and not caller JSON authority", () => {
  const f = fixture();
  denial(() => api.createOfflineLocalSessionVerifier({ productionAuthority: true, ports: f.ports, maximumLedgerEntries: 1 }), "offline_scope_required");
  denial(() => api.createOfflineLocalSessionVerifier({ ports: f.ports, maximumLedgerEntries: 1 }), "fixture_options_invalid");
  denial(() => api.createOfflineLocalSessionVerifier({ productionAuthority: false, ports: { ...f.ports, issuer: "chat-token" }, maximumLedgerEntries: 1 }), "fixture_ports_invalid");
  assert.equal(f.snapshotReads, 0);
});
for (const [name, change] of Object.entries({ chat_field: v => { v.chatId = "forged-chat"; }, capability: v => { v.capabilities.push("EXECUTE"); }, duplicate: v => { v.capabilities.push("READ"); }, lease: v => { v.maximumLeaseMs = c.TTL.lease + 1; }, session: v => { v.maximumSessionMs = c.TTL.lease + 1; }, sid: v => { v.userSid = "shared-token"; }, source: v => { v.source = "desktop_chat"; } })) check("schema", "closed policy rejects " + name, () => {
  const f = fixture(), value = clone(f.snapshot.policy); change(value);
  denial(() => api.localPolicy(value), name === "chat_field" ? "closed_shape" : name === "sid" ? "sid_invalid" : name === "source" ? "source_invalid" : name === "lease" || name === "session" ? "ttl_invalid" : "capability_invalid");
  assert.equal(f.snapshotReads, 0);
});
check("schema", "accessors, prototypes and symbols do not enter trusted shapes", () => {
  const f = fixture(), accessor = clone(f.snapshot.policy); let reads = 0;
  Object.defineProperty(accessor, "enabled", { enumerable: true, get() { reads++; return true; } });
  denial(() => api.localPolicy(accessor), "closed_shape"); assert.equal(reads, 0);
  denial(() => api.localPrincipal({ ...f.snapshot.principal, chatEpoch: 1 }), "closed_shape");
  const symbol = clone(f.snapshot.policy); symbol[Symbol("authority")] = true;
  denial(() => api.localPolicy(symbol), "closed_shape");
  denial(() => api.localPolicy(Object.setPrototypeOf(clone(f.snapshot.policy), { enabled: true })), "closed_shape");
});
check("schema", "read allowlist and bootstrap branch remain separate", () => {
  for (const name of ["get_bridge_status", "get_project_info"]) assert.equal(api.canonicalRequest({ args: Object.create(null), name }).name, name);
  for (const name of ["ensure_owned_runtime_daemon", "execute_jsx", "get_layer_details", "dev_admin"]) denial(() => api.canonicalRequest({ name, args: {} }), "tool_not_allowed");
  for (const body of [{ ...request(), principalHash: H("forged") }, { name: "get_project_info", args: { token: "shared" } }, { name: "get_project_info", args: { chatId: "forged" } }]) denial(() => api.canonicalRequest(body), "initial_");
  const f = fixture();
  assert.equal(api.canonicalBootstrapRequest({ name: "ensure_owned_runtime_daemon", args: {} }).name, "ensure_owned_runtime_daemon");
  denial(() => f.verifier.beginBootstrap({ name: "ensure_owned_runtime_daemon", args: {} }), "bootstrap_private_port_unavailable");
  assert.equal(f.snapshotReads, 0); assert.equal(f.consumeAttempts.length, 0);
});
check("refs", "serialization, principal JSON and foreign refs cannot restore identity", () => {
  const a = fixture(), b = fixture(), session = a.open(), call = a.begin(); b.open();
  assert.equal(JSON.stringify(session), "{}"); assert.equal(JSON.stringify(call), "{}");
  for (const ref of [JSON.parse(JSON.stringify(session)), clone(a.snapshot.principal), b.session, H(a.snapshot.principal)]) denial(() => a.verifier.beginCall(ref, request()), "private_session_reference_required");
  for (const ref of [JSON.parse(JSON.stringify(call)), clone(a.snapshot.policy), b.begin(), "guessed-call-id"]) denial(() => a.verifier.ingress(ref), "private_call_reference_required");
  assert.equal(a.phaseRecords.length, 0); assert.equal(a.consumeAttempts.length, 0);
});
check("refs", "extra phase/body arguments cannot override a captured request", () => {
  const f = fixture(), ref = f.begin();
  denial(() => f.verifier.ingress(ref, { phase: "dispatch" }), "private_arguments_invalid");
  f.verifier.ingress(ref);
  denial(() => f.verifier.enqueue(ref, { name: "execute_jsx", args: {} }), "private_arguments_invalid");
  assert.equal(f.consumeAttempts.length, 0);
});
check("phases", "fresh nonces, exact digest and original terminal binding", () => {
  const f = fixture(), body = request(), ref = f.begin(body);
  body.name = "execute_jsx"; body.args.script = "must-not-run";
  privateProjection(f.verifier.ingress(ref)); f.tick(7);
  privateProjection(f.verifier.enqueue(ref)); f.tick(11);
  privateProjection(f.verifier.dispatch(ref));
  assert.equal(f.consumeAttempts.length, 1);
  const calls = [...f.phaseRecords, f.consumeAttempts[0].call];
  assert.deepEqual(calls.map(value => value.phase), ["ingress", "enqueue", "dispatch"]);
  assert.equal(new Set(calls.map(value => value.phaseNonce)).size, 3);
  assert.equal(new Set(calls.map(value => value.callId)).size, 1);
  assert.deepEqual(calls.map(value => value.issuedMonoMs), [1000, 1007, 1018]);
  const golden = crypto.createHash("sha256").update('{"args":{},"name":"get_project_info"}').digest("hex");
  assert.ok(calls.every(value => value.requestHash === golden));
  assert.equal(calls[0].daemonGeneration, null); assert.equal(calls[1].daemonGeneration, f.snapshot.runtime.daemonGeneration);
  privateProjection(f.verifier.complete(ref)); assert.equal(f.verifier.readBack().unresolvedConsumed, 0);
  denial(() => f.verifier.dispatch(ref), "phase_replay_or_order_invalid"); assert.equal(f.consumeAttempts.length, 1);
});
check("phases", "wrong phase and cached ingress cannot authorize later stages", () => {
  const f = fixture(), ref = f.begin();
  denial(() => f.verifier.enqueue(ref), "phase_replay_or_order_invalid");
  denial(() => f.verifier.dispatch(ref), "phase_replay_or_order_invalid");
  f.verifier.ingress(ref); denial(() => f.verifier.ingress(ref), "phase_replay_or_order_invalid");
  f.verifier.enqueue(ref); denial(() => f.verifier.enqueue(ref), "phase_replay_or_order_invalid");
  assert.equal(f.consumeAttempts.length, 0);
});
check("phases", "forged or replayed phase receipts fail before dispatch consumption", () => {
  const f = fixture(), ref = f.begin(); f.verifier.ingress(ref);
  const ingressHash = H(f.phaseRecords[0]); f.phaseReceipt = () => ({ recorded: true, callHash: ingressHash });
  denial(() => f.verifier.enqueue(ref), "phase_receipt_binding_invalid");
  assert.equal(f.consumeAttempts.length, 0);
  const evidence = clone(f.phaseRecords[0]); evidence.phase = "dispatch";
  denial(() => api.localCall(evidence), "initial_id_invalid");
  denial(() => f.verifier.dispatch(evidence), "private_call_reference_required");
});
check("expiry", "created call and queued nonce expire without consumption", () => {
  const f = fixture(), ref = f.begin(); f.tick(c.TTL.call);
  denial(() => f.verifier.ingress(ref), "phase_expired"); assert.equal(f.consumeAttempts.length, 0);
  const g = fixture(), queued = g.queued(); g.tick(c.TTL.ticket);
  denial(() => g.verifier.dispatch(queued), "phase_expired"); assert.equal(g.consumeAttempts.length, 0);
});
check("expiry", "activity does not renew a session and absent adoption cannot renew", () => {
  const f = fixture(); f.run(); f.tick(c.TTL.lease);
  denial(() => f.begin(), "session_expired");
  denial(() => f.verifier.openSession(), "reopen_or_renew_forbidden");
  denial(() => f.verifier.renew(), "renewal_adoption_bracket_unavailable");
  assert.equal(f.consumeAttempts.length, 1);
});
for (const kind of ["rollback", "boot", "range"]) check("clock", "monotonic " + kind + " is fail closed", () => {
  const f = fixture();
  if (kind === "range") { f.snapshot.clock.monoMs = Number.MAX_SAFE_INTEGER; denial(() => f.open(), "clock_range_invalid"); }
  else { const ref = f.begin(); if (kind === "rollback") f.snapshot.clock.monoMs--; else f.snapshot.clock.bootId = "replacement-boot"; denial(() => f.verifier.ingress(ref), "clock_rollback_or_boot_changed"); }
  assert.equal(f.verifier.readBack().status, "REVOKED"); assert.equal(f.consumeAttempts.length, 0);
});
const authorityDrifts = {
  policy_epoch: f => { f.snapshot.policy.policyEpoch++; f.snapshot.principal.policyHash = H(f.snapshot.policy); },
  root_pin: f => { f.snapshot.policy.rootPinsHash = H("replacement-root"); f.snapshot.principal.policyHash = H(f.snapshot.policy); },
  policy_disabled: f => { f.snapshot.policy.enabled = false; },
  principal_hash: f => { f.snapshot.principal.policyHash = H("forged-policy"); },
  controller_session: f => { f.snapshot.principal.controllerSessionId = "replacement-session"; },
  controller_epoch: f => { f.snapshot.principal.controllerEpoch++; },
  controller_witness: f => { f.snapshot.principal.controllerWitnessHash = H("replacement-controller"); },
  transport_binding: f => { f.snapshot.principal.transportBindingHash = H("replacement-transport"); },
  revocation: f => { f.snapshot.revocationEpoch++; },
  eof: f => { f.snapshot.eof = true; },
  dead_controller: f => { f.snapshot.controllerLive = false; },
  transport_close: f => { f.snapshot.transportLive = false; }
};
for (const [kind, drift] of Object.entries(authorityDrifts)) check("authority", "queued request rejects fresh " + kind, () => {
  const f = fixture(), ref = f.queued(); drift(f);
  denial(() => f.verifier.dispatch(ref), "local_");
  assert.equal(f.consumeAttempts.length, 0); assert.equal(f.verifier.readBack().status, "REVOKED");
});
const runtimeDrifts = {
  generation: f => { f.snapshot.runtime.daemonGeneration = "replacement-generation"; },
  fence_epoch: f => { f.snapshot.runtime.fenceEpoch++; },
  fence_owner: f => { f.snapshot.runtime.fenceOwnerId = "other-broker"; },
  fence_release: f => { f.snapshot.runtime.fenceHeld = false; },
  runtime_identity: f => { f.snapshot.runtime.runtimeHash = H("replacement-daemon"); },
  held_target: f => { f.snapshot.runtime.positiveHeldRuntime = false; },
  actor_generation: f => { f.snapshot.runtime.actor.panelGeneration = "replacement-panel"; },
  actor_epoch: f => { f.snapshot.runtime.actor.panelLifecycleEpoch++; },
  disconnect: f => { f.snapshot.runtime.connected = false; },
  null_actor: f => { f.snapshot.runtime.actor = null; f.snapshot.runtime.connected = false; }
};
for (const [kind, drift] of Object.entries(runtimeDrifts)) check("runtime", "dispatch rejects " + kind + " before consume", () => {
  const f = fixture(), ref = f.queued(); drift(f);
  denial(() => f.verifier.dispatch(ref), "local_"); assert.equal(f.consumeAttempts.length, 0);
});
for (const [key, value] of Object.entries({ pendingCommands: 1, inflightCommands: 1, activeEditSession: true, projectLifecyclePending: true, projectLifecycleBlocked: true, bootstrapIdle: false, nativeExecutionIdle: false, unacceptedChildren: 1, unacceptedJobs: 1 })) check("readiness", "enqueue refuses active " + key, () => {
  const f = fixture(), ref = f.begin(); f.verifier.ingress(ref); f.snapshot.readiness[key] = value;
  denial(() => f.verifier.enqueue(ref), "runtime_not_ready"); assert.equal(f.consumeAttempts.length, 0);
});
check("runtime", "ingress without daemon does not bypass actor/fence enqueue guards", () => {
  const f = fixture(); f.snapshot.runtime = null;
  const ref = f.begin(); f.verifier.ingress(ref);
  denial(() => f.verifier.enqueue(ref), "held_runtime_fence_required"); assert.equal(f.consumeAttempts.length, 0);
});
check("revocation", "EOF and local close are sticky even if the snapshot becomes live", () => {
  const f = fixture(), ref = f.queued(); f.verifier.closeTransport();
  denial(() => f.verifier.dispatch(ref), "session_revoked"); assert.equal(f.consumeAttempts.length, 0);
  const beforeOpen = fixture(); beforeOpen.verifier.closeTransport(); denial(() => beforeOpen.open(), "session_revoked");
  const g = fixture(), other = g.queued(); g.snapshot.eof = true;
  denial(() => g.verifier.dispatch(other), "original_transport_closed"); g.snapshot.eof = false;
  denial(() => g.begin(), "session_revoked");
});
check("revocation", "exact dispatched completion survives revoke without new admissions", () => {
  const f = fixture(), ref = f.queued(); f.verifier.dispatch(ref); f.verifier.revoke(f.session);
  assert.equal(f.verifier.complete(ref).terminal, true);
  denial(() => f.begin(), "session_revoked"); denial(() => f.verifier.dispatch(ref), "session_revoked");
  assert.equal(f.consumeAttempts.length, 1);
});
check("bookkeeping", "revocation during ingress bookkeeping cannot yield authority", () => {
  const f = fixture(), ref = f.begin(); f.afterPhase = () => f.verifier.revoke(f.session);
  denial(() => f.verifier.ingress(ref), "session_revoked"); assert.equal(f.consumeAttempts.length, 0);
});
for (const phase of ["ingress", "enqueue"]) for (const [kind, drift] of Object.entries({ policy: authorityDrifts.policy_epoch, controller: authorityDrifts.controller_witness, eof: authorityDrifts.eof, revocation: authorityDrifts.revocation, expiry: f => f.tick(c.TTL.call), ...(phase === "enqueue" ? { runtime: runtimeDrifts.runtime_identity, fence: runtimeDrifts.fence_epoch, actor: runtimeDrifts.actor_generation } : {}) })) check("bookkeeping", phase + " rereads after " + kind + " drift", () => {
  const f = fixture(), ref = f.begin(); if (phase === "enqueue") f.verifier.ingress(ref);
  f.afterPhase = value => { if (value.phase === phase) drift(f); };
  denial(() => f.verifier[phase](ref), "local_");
  assert.equal(f.consumeAttempts.length, 0);
  denial(() => f.verifier.dispatch(ref), "local_");
});
for (const [kind, drift] of Object.entries({ ...authorityDrifts, ...runtimeDrifts, explicit_revoke: f => f.verifier.revoke(f.session), explicit_eof: f => f.verifier.closeTransport(), timeout: f => f.tick(c.TTL.call), readiness: f => { f.snapshot.readiness.activeEditSession = true; } })) check("consumption", "post-consume " + kind + " remains UNKNOWN with no replay", () => {
  const f = fixture(), ref = f.queued(); f.afterConsume = () => drift(f);
  denial(() => f.verifier.dispatch(ref), "local_");
  assert.equal(f.consumeAttempts.length, 1); assert.equal(f.consumed.size, 1);
  assert.equal(f.verifier.readBack().status, "CONSUMED_UNKNOWN"); assert.equal(f.verifier.readBack().unresolvedConsumed, 1);
  denial(() => f.verifier.dispatch(ref), "local_"); denial(() => f.begin(), "local_");
  denial(() => f.verifier.complete(ref), "exact_dispatched_completion_required");
  assert.equal(f.consumeAttempts.length, 1); assert.equal(f.completionReads, 0);
});
for (const kind of ["lost_ack", "wrong_request", "wrong_call", "not_consumed", "async", "prepublication_error"]) check("consumption", kind + " is not repeated or unconsumed", () => {
  const f = fixture(), ref = f.queued();
  if (kind === "lost_ack") f.afterConsume = () => c.fail("fixture_lost_ack");
  else if (kind === "prepublication_error") f.beforeConsume = () => c.fail("fixture_before_publication");
  else f.consumeReceipt = value => kind === "async" ? Promise.resolve({ consumed: true, callId: value.call.callId, requestHash: value.call.requestHash }) : { consumed: kind !== "not_consumed", callId: kind === "wrong_call" ? "other-call" : value.call.callId, requestHash: kind === "wrong_request" ? H("other-request") : value.call.requestHash };
  denial(() => f.verifier.dispatch(ref), kind === "lost_ack" || kind === "prepublication_error" ? "fixture_" : "local_");
  assert.equal(f.verifier.readBack().status, "CONSUMED_UNKNOWN");
  denial(() => f.verifier.dispatch(ref), "consumed_unknown_readback_only"); assert.equal(f.consumeAttempts.length, 1);
  assert.equal(f.consumed.size, kind === "prepublication_error" ? 0 : 1);
});
check("ledger", "overflow never evicts unresolved consumption or reopens calls", () => {
  const f = fixture(1), ref = f.queued();
  denial(() => f.begin(), "ledger_overflow_new_calls_closed");
  f.verifier.dispatch(ref); assert.equal(f.verifier.readBack().unresolvedConsumed, 1);
  f.verifier.complete(ref);
  denial(() => f.begin(), "ledger_overflow_new_calls_closed");
  assert.equal(f.verifier.readBack().calls, 1); assert.equal(f.consumeAttempts.length, 1);
});
check("ledger", "an already queued second call cannot dispatch across unresolved work", () => {
  const f = fixture(), first = f.queued(), second = f.queued(); f.verifier.dispatch(first);
  denial(() => f.verifier.dispatch(second), "unresolved_consumption_blocks_phase"); assert.equal(f.consumeAttempts.length, 1);
  f.verifier.complete(first); denial(() => f.verifier.dispatch(second), "phase_replay_or_order_invalid");
});
check("ports", "async, malformed and reentrant fixture ports fail closed", () => {
  const f = fixture(); f.onSnapshot = () => { f.verifier.openSession(); };
  denial(() => f.open(), "reentrancy_forbidden"); assert.equal(f.snapshotReads, 1);
  const g = fixture(); g.ports.readSnapshot = () => Promise.resolve(g.snapshot);
  const v = api.createOfflineLocalSessionVerifier({ productionAuthority: false, ports: g.ports, maximumLedgerEntries: 1 });
  denial(() => v.openSession(), "synchronous_fixture_port_required");
  const h = fixture(); h.snapshot.unknownAuthority = true;
  denial(() => h.open(), "snapshot_closed_shape"); assert.equal(h.consumeAttempts.length, 0);
});
check("ports", "exceptions in trusted context cannot restore a session", () => {
  const f = fixture(), ref = f.begin();
  f.onSnapshot = () => { throw new Error("synthetic trusted context failure"); };
  assert.throws(() => f.verifier.ingress(ref), /synthetic trusted context failure/);
  f.onSnapshot = null;
  denial(() => f.begin(), "session_revoked");
  assert.equal(f.consumeAttempts.length, 0); assert.equal(f.verifier.readBack().status, "REVOKED");
});
check("completion", "terminal result must bind exact original call/request/runtime", () => {
  for (const key of ["callId", "requestHash", "runtimeBindingHash", "terminal"]) {
    const f = fixture(), ref = f.queued(); f.verifier.dispatch(ref);
    f.completionTransform = value => ({ ...value, [key]: key === "terminal" ? false : key === "callId" ? "other-call" : H("other-binding") });
    denial(() => f.verifier.complete(ref), "completion_binding_invalid");
    assert.equal(f.verifier.readBack().unresolvedConsumed, 1); assert.equal(f.consumeAttempts.length, 1);
    f.completionTransform = null; assert.equal(f.verifier.complete(ref).terminal, true);
  }
});

console.log(JSON.stringify({ ok: true, passed, groups: [...groups].sort(), scope: api.OFFLINE_SCOPE, productionAuthority: false, authorityMode: api.AUTHORITY_MODE, genuineChatIdentity: false, nativeExecutionProven: false }));
