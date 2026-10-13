"use strict";

// L1 is an offline verifier, not an adapter to a native broker or an effect runner.
// Production snapshots must eventually come from the private native facade; this
// synchronous fixture API must not be wired directly into asynchronous server IO.
const crypto = require("node:crypto");
const c = require("./owned-runtime-initial-contract");
const SCHEMA = "ae-agent.owned-runtime-local-session.v1";
const AUTHORITY_MODE = "local_controller_session";
const OFFLINE_SCOPE = "offline_local_session_verifier";
const PHASES = Object.freeze(["ingress", "enqueue", "dispatch"]);
const MAX_LEDGER_ENTRIES = 4096;
const { exact, list, id, digest, integer, bool, copy, hash, fail, TTL } = c;

function localPolicy(v) {
  exact(v, ["schema", "source", "installationLineage", "userSid", "rootPinsHash", "policyEpoch", "enabled", "capabilities", "maximumSessionMs", "maximumLeaseMs", "authorizationAuditReference"], "local_policy_closed_shape");
  if (v.schema !== SCHEMA || v.source !== "local_operator") fail("local_policy_source_invalid");
  for (const key of ["installationLineage", "userSid", "authorizationAuditReference"]) id(v[key]);
  if (!/^S-1-\d+(?:-\d+)+$/.test(v.userSid)) fail("local_policy_sid_invalid");
  digest(v.rootPinsHash); integer(v.policyEpoch); bool(v.enabled);
  list(v.capabilities, value => { if (!c.READ_CAPABILITIES.includes(value)) fail("local_policy_capability_invalid"); });
  if (!v.capabilities.length || new Set(v.capabilities).size !== v.capabilities.length) fail("local_policy_capability_invalid");
  integer(v.maximumSessionMs); integer(v.maximumLeaseMs);
  if (v.maximumSessionMs === 0 || v.maximumSessionMs > TTL.lease || v.maximumLeaseMs === 0 || v.maximumLeaseMs > v.maximumSessionMs || v.maximumLeaseMs > TTL.lease) fail("local_policy_ttl_invalid");
  return v;
}
function localPrincipal(v) {
  exact(v, ["kind", "installationLineage", "userSid", "brokerInstanceId", "controllerSessionId", "controllerEpoch", "controllerWitnessHash", "transportBindingHash", "policyHash"], "local_principal_closed_shape");
  if (v.kind !== "local_operator") fail("local_principal_kind_invalid");
  for (const key of ["installationLineage", "userSid", "brokerInstanceId", "controllerSessionId"]) id(v[key]);
  integer(v.controllerEpoch);
  for (const key of ["controllerWitnessHash", "transportBindingHash", "policyHash"]) digest(v[key]);
  return v;
}
function localCall(v) {
  exact(v, ["principalHash", "callId", "requestHash", "phase", "phaseNonce", "policyEpoch", "revocationEpoch", "issuedMonoMs", "expiresMonoMs", "controllerSessionId", "daemonGeneration", "fenceEpoch"], "local_call_closed_shape");
  for (const key of ["principalHash", "requestHash", "phaseNonce"]) digest(v[key]);
  id(v.callId); id(v.controllerSessionId);
  for (const key of ["policyEpoch", "revocationEpoch", "issuedMonoMs", "expiresMonoMs"]) integer(v[key]);
  if (!PHASES.includes(v.phase)) fail("local_call_phase_invalid");
  // Ingress precedes daemon reservation. Nulls are explicit only in this phase;
  // they can never satisfy enqueue/dispatch's held-runtime checks.
  if (v.phase === "ingress") {
    if (v.daemonGeneration !== null || v.fenceEpoch !== null) fail("local_ingress_runtime_binding_invalid");
  } else { id(v.daemonGeneration); integer(v.fenceEpoch); }
  if (v.expiresMonoMs <= v.issuedMonoMs || v.expiresMonoMs - v.issuedMonoMs > TTL.call) fail("local_call_ttl_invalid");
  return v;
}
function canonicalRequest(v) { return c.request(v); }
function canonicalBootstrapRequest(v) {
  exact(v, ["name", "args"], "local_bootstrap_request_invalid");
  if (v.name !== "ensure_owned_runtime_daemon") fail("local_bootstrap_tool_invalid");
  exact(v.args, [], "local_bootstrap_args_empty_required");
  return copy(v);
}
function runtimeSnapshot(v) {
  exact(v, ["daemonGeneration", "fenceOwnerId", "fenceEpoch", "fenceHeld", "runtimeHash", "actor", "connected", "positiveHeldRuntime"], "local_runtime_closed_shape");
  id(v.daemonGeneration); id(v.fenceOwnerId); integer(v.fenceEpoch); digest(v.runtimeHash);
  for (const key of ["fenceHeld", "connected", "positiveHeldRuntime"]) bool(v[key]);
  c.nullable(v.actor, c.actor);
  if (v.actor === null && v.connected) fail("local_null_actor_must_be_disconnected");
  return v;
}
function trustedSnapshot(v) {
  exact(v, ["clock", "policy", "principal", "controllerLive", "transportLive", "eof", "revocationEpoch", "runtime", "readiness"], "local_snapshot_closed_shape");
  c.clock(v.clock); localPolicy(v.policy); localPrincipal(v.principal);
  for (const key of ["controllerLive", "transportLive", "eof"]) bool(v[key]);
  integer(v.revocationEpoch); c.nullable(v.runtime, runtimeSnapshot); c.readiness(v.readiness);
  return copy(v);
}
function projection(scope, status, fields = {}) {
  return Object.freeze({ ...fields, scope, status, authorityMode: AUTHORITY_MODE, genuineChatIdentity: false, productionAuthority: false, executionEntitled: false, replayAllowed: false });
}
function opaque(map, value) {
  const ref = Object.freeze(Object.create(null));
  map.set(ref, value); return ref;
}
function arity(actual, expected) { if (actual !== expected) fail("local_private_arguments_invalid"); }

// No public dependency injection can turn this into production authority.
function createLocalSessionVerifier() {
  const unavailable = () => projection(AUTHORITY_MODE, "production_private_ports_unavailable", { ok: false, available: false });
  return Object.freeze({ openSession: unavailable, beginCall: unavailable, ingress: unavailable, enqueue: unavailable, dispatch: unavailable, complete: unavailable, revoke: unavailable, closeTransport: unavailable, beginBootstrap: unavailable, renew: unavailable, readBack: unavailable });
}

function createOfflineLocalSessionVerifier(options) {
  exact(options, ["productionAuthority", "ports", "maximumLedgerEntries"], "local_fixture_options_invalid");
  if (options.productionAuthority !== false) fail("local_offline_scope_required");
  exact(options.ports, ["readSnapshot", "recordPhase", "consumeDispatch", "readCompletion"], "local_fixture_ports_invalid");
  for (const value of Object.values(options.ports)) if (typeof value !== "function") fail("local_fixture_ports_invalid");
  integer(options.maximumLedgerEntries);
  if (options.maximumLedgerEntries === 0 || options.maximumLedgerEntries > MAX_LEDGER_ENTRIES) fail("local_ledger_limit_invalid");
  const ports = Object.freeze({ ...options.ports }), limit = options.maximumLedgerEntries;
  const sessions = new WeakMap(), calls = new WeakMap(), ledger = new Map(), nonces = new Set();
  let session = null, floor = null, unknown = null, closedReason = null, overflow = false, busy = false;

  function invoke(name, input) {
    const value = input === undefined ? ports[name]() : ports[name](input);
    if (value && typeof value.then === "function") fail("local_synchronous_fixture_port_required");
    return value;
  }
  function serial(run) {
    if (busy) fail("local_verifier_reentrancy_forbidden");
    busy = true;
    try { return run(); } finally { busy = false; }
  }
  function revokeSession(reason) { closedReason ||= reason; if (session && !session.revoked) session.revoked = reason; }
  function denySession(code) { revokeSession(code); fail(code); }
  function liveSession(ref) {
    const value = sessions.get(ref);
    if (!value || value !== session) fail("local_private_session_reference_required");
    if (value.revoked) fail("local_session_revoked");
    if (unknown) fail("local_consumed_unknown_readback_only");
    return value;
  }
  function readFresh(s, requireRuntime = false) {
    if (closedReason || s?.revoked) fail("local_session_revoked");
    let v;
    try { v = trustedSnapshot(invoke("readSnapshot")); }
    catch (error) { revokeSession("local_snapshot_unavailable"); throw error; }
    if (closedReason || s?.revoked) fail("local_session_revoked");
    if (floor && (v.clock.bootId !== floor.bootId || v.clock.monoMs < floor.monoMs)) denySession("local_clock_rollback_or_boot_changed");
    floor = v.clock;
    if (v.eof || !v.controllerLive || !v.transportLive) denySession("local_original_transport_closed");
    if (!v.policy.enabled) denySession("local_policy_disabled");
    const p = v.principal;
    if (p.policyHash !== hash(v.policy) || p.installationLineage !== v.policy.installationLineage || p.userSid !== v.policy.userSid) denySession("local_principal_policy_binding_invalid");
    if (s) {
      if (hash(v.policy) !== s.policyHash || hash(p) !== s.principalHash || v.revocationEpoch !== s.revocationEpoch) denySession("local_session_binding_changed");
      if (v.clock.monoMs >= s.expiresMonoMs) denySession("local_session_expired");
    }
    if (requireRuntime) {
      const r = v.runtime;
      if (!r || !r.positiveHeldRuntime || !r.fenceHeld || r.fenceOwnerId !== p.brokerInstanceId) denySession("local_held_runtime_fence_required");
      if (!r.connected || r.actor === null) denySession("local_connected_exact_actor_required");
      if (!c.ready(v.readiness)) fail("local_runtime_not_ready");
      if (s.runtimeHash !== null && s.runtimeHash !== hash(r)) denySession("local_runtime_binding_changed");
    }
    return v;
  }
  function expiresAt(now, duration) {
    if (!Number.isSafeInteger(now + duration)) denySession("local_clock_range_invalid");
    return now + duration;
  }
  function noUnresolvedOther(row) {
    if ([...ledger.values()].some(other => other !== row && other.consumed && other.state !== "COMPLETED")) fail("local_unresolved_consumption_blocks_phase");
  }
  function checkedCall(ref, expected) {
    const row = calls.get(ref);
    if (!row || ledger.get(row.callId) !== row) fail("local_private_call_reference_required");
    liveSession(row.sessionRef);
    if (row.state !== expected) fail("local_call_phase_replay_or_order_invalid");
    return row;
  }
  function checkDeadline(row, v) {
    if (v.clock.monoMs >= row.deadlineMonoMs) fail("local_call_phase_expired");
  }
  function evidence(row, phase, v) {
    let nonce;
    do { nonce = crypto.randomBytes(32).toString("hex"); } while (nonces.has(nonce));
    const bound = phase !== "ingress", ttl = phase === "enqueue" ? TTL.ticket : TTL.call;
    return copy(localCall({ principalHash: row.session.principalHash, callId: row.callId, requestHash: row.requestHash, phase, phaseNonce: nonce, policyEpoch: v.policy.policyEpoch, revocationEpoch: v.revocationEpoch, issuedMonoMs: v.clock.monoMs, expiresMonoMs: Math.min(row.session.expiresMonoMs, expiresAt(v.clock.monoMs, Math.min(ttl, v.policy.maximumLeaseMs))), controllerSessionId: v.principal.controllerSessionId, daemonGeneration: bound ? v.runtime.daemonGeneration : null, fenceEpoch: bound ? v.runtime.fenceEpoch : null }));
  }
  function publish(row, value, state) {
    if (nonces.has(value.phaseNonce) || value.requestHash !== row.requestHash || value.principalHash !== row.session.principalHash) fail("local_phase_evidence_replayed_or_changed");
    nonces.add(value.phaseNonce); row.evidence = value; row.deadlineMonoMs = value.expiresMonoMs; row.state = state;
  }
  function callResult(row) { return projection(OFFLINE_SCOPE, row.state, { consumed: row.consumed, terminal: row.state === "COMPLETED" }); }
  function phase(ref, expected, name, next) {
    return serial(() => {
      const row = checkedCall(ref, expected);
      try {
        noUnresolvedOther(row);
        const v = readFresh(row.session, name !== "ingress"); checkDeadline(row, v);
        if (!v.policy.capabilities.includes("BOOTSTRAP_READ") && !v.policy.capabilities.includes("READ")) fail("local_read_capability_required");
        if (name === "enqueue" && row.session.runtimeHash === null) row.session.runtimeHash = hash(v.runtime);
        const value = evidence(row, name, v);
        const receipt = invoke("recordPhase", value);
        exact(receipt, ["recorded", "callHash"], "local_phase_receipt_invalid");
        if (receipt.recorded !== true || receipt.callHash !== hash(value)) fail("local_phase_receipt_binding_invalid");
        const after = readFresh(row.session, name !== "ingress");
        if (after.clock.monoMs >= value.expiresMonoMs || after.clock.monoMs >= row.deadlineMonoMs) fail("local_phase_guard_expired");
        publish(row, value, next);
        return callResult(row);
      } catch (error) { row.state = "DENIED"; throw error; }
    });
  }
  function dispatch(ref) {
    return serial(() => {
      const row = checkedCall(ref, "QUEUED");
      let value;
      try {
        noUnresolvedOther(row);
        const v = readFresh(row.session, true); checkDeadline(row, v);
        value = evidence(row, "dispatch", v);
        // Never retry a private consume call, even if it throws or returns unknown.
        row.consumed = true; row.state = "CONSUMED_UNKNOWN";
        const receipt = invoke("consumeDispatch", copy({ call: value, runtimeBindingHash: hash(v.runtime) }));
        exact(receipt, ["consumed", "callId", "requestHash"], "local_consumption_receipt_invalid");
        if (receipt.consumed !== true || receipt.callId !== row.callId || receipt.requestHash !== row.requestHash) fail("local_consumption_unconfirmed");
        const after = readFresh(row.session, true);
        if (after.clock.monoMs >= value.expiresMonoMs || after.clock.monoMs >= row.deadlineMonoMs) fail("local_dispatch_guard_expired");
        publish(row, value, "DISPATCH_VERIFIED");
        return callResult(row); // An offline permission result, never delivery proof.
      } catch (error) {
        if (row.consumed) { row.state = "CONSUMED_UNKNOWN"; unknown = error.code || "local_dispatch_unknown"; }
        else row.state = "DENIED";
        throw error;
      }
    });
  }
  return Object.freeze({
    openSession() {
      arity(arguments.length, 0);
      return serial(() => {
        if (session) fail("local_session_reopen_or_renew_forbidden");
        if (closedReason) fail("local_session_revoked");
        if (unknown) fail("local_consumed_unknown_readback_only");
        const v = readFresh(null);
        session = { policyHash: hash(v.policy), principalHash: hash(v.principal), revocationEpoch: v.revocationEpoch, expiresMonoMs: expiresAt(v.clock.monoMs, v.policy.maximumSessionMs), runtimeHash: null, revoked: null };
        return opaque(sessions, session);
      });
    },
    beginCall(ref, request) {
      arity(arguments.length, 2);
      return serial(() => {
        const s = liveSession(ref);
        if (overflow || ledger.size >= limit) { overflow = true; fail("local_ledger_overflow_new_calls_closed"); }
        if ([...ledger.values()].some(row => row.consumed && row.state !== "COMPLETED")) fail("local_unresolved_consumption_blocks_new_calls");
        const req = canonicalRequest(request), v = readFresh(s), callId = crypto.randomUUID();
        const row = { session: s, sessionRef: ref, callId, requestHash: hash(req), request: req, state: "CREATED", consumed: false, evidence: null, deadlineMonoMs: Math.min(s.expiresMonoMs, expiresAt(v.clock.monoMs, TTL.call)) };
        ledger.set(callId, row); return opaque(calls, row);
      });
    },
    ingress(ref) { arity(arguments.length, 1); return phase(ref, "CREATED", "ingress", "INGRESS_VERIFIED"); },
    enqueue(ref) { arity(arguments.length, 1); return phase(ref, "INGRESS_VERIFIED", "enqueue", "QUEUED"); },
    dispatch(ref) { arity(arguments.length, 1); return dispatch(ref); },
    complete(ref) {
      arity(arguments.length, 1);
      return serial(() => {
        const row = calls.get(ref);
        if (!row || ledger.get(row.callId) !== row) fail("local_private_call_reference_required");
        // Original dispatched work may complete after EOF/revocation. This cannot
        // clear UNKNOWN or issue a new read authorization.
        if (row.state !== "DISPATCH_VERIFIED") fail("local_exact_dispatched_completion_required");
        const result = invoke("readCompletion", copy({ callId: row.callId, requestHash: row.requestHash, runtimeBindingHash: row.session.runtimeHash }));
        exact(result, ["callId", "requestHash", "runtimeBindingHash", "terminal", "resultHash"], "local_completion_closed_shape");
        digest(result.resultHash);
        if (result.callId !== row.callId || result.requestHash !== row.requestHash || result.runtimeBindingHash !== row.session.runtimeHash || result.terminal !== true) fail("local_completion_binding_invalid");
        row.state = "COMPLETED"; return callResult(row);
      });
    },
    revoke(ref) { arity(arguments.length, 1); if (!sessions.has(ref) || sessions.get(ref) !== session) fail("local_private_session_reference_required"); revokeSession("local_explicit_revocation"); return projection(OFFLINE_SCOPE, "REVOKED"); },
    closeTransport() { arity(arguments.length, 0); revokeSession("local_original_transport_closed"); return projection(OFFLINE_SCOPE, "REVOKED"); },
    beginBootstrap(request) { arity(arguments.length, 1); canonicalBootstrapRequest(request); fail("local_bootstrap_private_port_unavailable"); },
    renew() { fail("local_renewal_adoption_bracket_unavailable"); },
    readBack() { arity(arguments.length, 0); return projection(OFFLINE_SCOPE, unknown ? "CONSUMED_UNKNOWN" : closedReason ? "REVOKED" : session ? "SESSION_OPEN" : "CLOSED", { calls: ledger.size, unresolvedConsumed: [...ledger.values()].filter(row => row.consumed && row.state !== "COMPLETED").length, newCallsClosed: overflow || !!unknown || !!closedReason }); }
  });
}

module.exports = { SCHEMA, AUTHORITY_MODE, OFFLINE_SCOPE, TTL, localPolicy, localPrincipal, localCall, canonicalRequest, canonicalBootstrapRequest, createLocalSessionVerifier, createOfflineLocalSessionVerifier };
