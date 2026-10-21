"use strict";

// No native adapters, filesystem access, HTTP or effect callbacks belong here.
const crypto = require("node:crypto");
const c = require("./owned-runtime-initial-contract");
const { STATES: S, fail } = c;
function tagged(type, value) { return { schema: c.SCHEMA + "." + type, scope: c.SCOPE, productionAuthority: false, ...value }; }
function snapshot(value) {
  c.exact(value, ["anchor", "authorization", "grants", "runtime", "permits", "events", "headHash", "fenceOwnerId", "fenceEpoch"]);
  c.anchor(value.anchor); c.authorization(value.authorization); c.list(value.grants, c.grant); c.nullable(value.runtime, c.runtime); c.list(value.permits, c.permit); c.list(value.events, c.event);
  c.nullable(value.headHash, c.digest); c.id(value.fenceOwnerId); c.integer(value.fenceEpoch);
  const a = value.anchor;
  if (value.authorization.anchorId !== a.anchorId || c.hash(value.authorization) !== a.authorizationHash || !value.grants.length) fail("initial_store_authorization_or_grant_changed");
  const prepared = value.grants[0], ids = new Set(), attempts = new Set(), times = new Map([[a.clockBootId, a.createdMonoMs]]);
  for (const g of value.grants) {
    if (g.anchorId !== a.anchorId || g.generation !== a.generation || g.controllerId !== prepared.controllerId || g.preparedGrantId !== prepared.preparedGrantId) fail("initial_store_grant_lineage_invalid");
    if (g.capabilities.join("|") !== prepared.capabilities.join("|") || (prepared.boundWitnessId !== null) || prepared.retired) fail("initial_prepared_grant_invalid");
  }
  for (const p of value.permits) {
    if (p.anchorId !== a.anchorId || p.generation !== a.generation || ids.has(p.permitId)) fail("initial_store_permit_invalid"); ids.add(p.permitId);
  }
  if (value.runtime) runtimePins(a, value.runtime);
  let previous = null;
  value.events.forEach((e, index) => {
    if (e.anchorId !== a.anchorId || e.generation !== a.generation || e.sequence !== index + 1 || e.previousHash !== previous || attempts.has(e.attemptKey) || e.recordedMonoMs < (times.get(e.clockBootId) ?? 0)) fail("initial_store_chain_invalid");
    if (e.permitHash !== null && !value.permits.some(p => c.hash(p) === e.permitHash)) fail("initial_store_permit_link_missing");
    if (e.lifecycleGrantHash !== null && !value.grants.some(g => c.hash(g) === e.lifecycleGrantHash)) fail("initial_store_grant_link_missing");
    times.set(e.clockBootId, e.recordedMonoMs); attempts.add(e.attemptKey); previous = c.hash(e);
  });
  if (value.headHash !== previous) fail("initial_store_head_invalid");
  journalSemantics(value);
  return c.copy(value);
}
function journalSemantics(s) {
  const prepared = s.grants[0], grantHashes = s.grants.map(c.hash), usedGrants = new Set([grantHashes[0]]), permits = new Map(s.permits.map(p => [c.hash(p), p])), queued = new Map(), sent = new Map(), completed = new Map(), unknownDispatch = new Set();
  let reserved = false, launchOutcome = null, bound = null, drained = false, stopped = false, stopOutcome = false, retired = false, adopted = false, cutoff = 0;
  const phases = new Map(), usedPhases = new Set(), callerEvidence = new Set(), finalGuards = new Set();
  function requireFact(ok) { if (!ok) fail("initial_store_journal_semantics_invalid"); }
  function fields(e, required, allowed = required) {
    const names = ["principalHash", "runtimeHash", "lifecycleGrantHash", "permitHash", "evidenceHash"];
    requireFact(required.every(k => e[k] !== null) && names.every(k => allowed.includes(k) || e[k] === null));
  }
  function linkedGrant(e, wantRetired = false) {
    const g = s.grants.find(g => c.hash(g) === e.lifecycleGrantHash);
    requireFact(g && g.retired === wantRetired && g.boundRuntimeHash === c.runtimeIdentityHash(s.runtime) && g.boundWitnessId === s.runtime.heldWitnessId);
    usedGrants.add(e.lifecycleGrantHash); return g;
  }
  function pendingDispatches() { return [...sent.keys()].filter(h => !completed.has(h)); }
  function readOpen() { return launchOutcome === "launch_ack" && !drained && !stopped && !retired && unknownDispatch.size === 0 && pendingDispatches().length === 0; }
  function readTime(e) { requireFact(e.clockBootId === s.anchor.clockBootId && s.authorization.issuedMonoMs <= e.recordedMonoMs && e.recordedMonoMs < s.authorization.expiresMonoMs); }
  function takePhase(requestHash, phase, after) {
    const evidence = [...(phases.get(requestHash + ":" + phase) || [])].reverse().find(e => e.sequence > after && !usedPhases.has(e.sequence));
    requireFact(evidence); usedPhases.add(evidence.sequence); return evidence.sequence;
  }
  for (const e of s.events) {
    if (e.principalHash !== null) requireFact(e.principalHash === s.authorization.principalHash);
    if (e.operation.startsWith("caller_")) {
      fields(e, ["principalHash", "evidenceHash"]);
      readTime(e);
      requireFact(!callerEvidence.has(e.evidenceHash) && e.attemptKey === c.hash({ key: s.anchor.launchKey, evidence: e.evidenceHash })); callerEvidence.add(e.evidenceHash);
      requireFact(!retired && !drained && !stopped && (e.operation === "caller_ingress" || s.events.some(x => x.sequence < e.sequence && x.operation === "caller_ingress" && x.operationId === e.operationId)));
      const pending = pendingDispatches();
      if (pending.length) {
        requireFact(pending.length === 1 && e.operation === "caller_dispatch" && permits.get(pending[0]).requestHash === e.operationId && !finalGuards.has(pending[0]));
        finalGuards.add(pending[0]); usedPhases.add(e.sequence);
      }
      const key = e.operationId + ":" + e.operation.slice("caller_".length); if (!phases.has(key)) phases.set(key, []); phases.get(key).push(e);
      continue;
    }
    if (e.operation === "launch_reserve") {
      fields(e, ["principalHash", "lifecycleGrantHash", "evidenceHash"]);
      readTime(e);
      requireFact(!reserved && !retired && e.lifecycleGrantHash === grantHashes[0] && e.attemptKey === c.hash({ launchKey: s.anchor.launchKey, effect: "initial_launch" }));
      const requestHash = c.hash({ operation: "reserve_initial" });
      takePhase(requestHash, "dispatch", takePhase(requestHash, "ingress", 0));
      reserved = true; continue;
    }
    if (["launch_ack", "launch_unknown", "launch_bound"].includes(e.operation)) {
      fields(e, ["lifecycleGrantHash", "evidenceHash"], ["lifecycleGrantHash", "evidenceHash", "runtimeHash"]);
      requireFact(reserved && !drained && !stopped && !retired);
      if (e.operation === "launch_bound") requireFact(launchOutcome === "launch_unknown" && bound === null);
      else { requireFact(launchOutcome === null); launchOutcome = e.operation; }
      if (e.runtimeHash !== null) {
        requireFact(bound === null && s.runtime && e.runtimeHash === c.hash(s.runtime));
        bound = linkedGrant(e);
      } else requireFact(e.operation === "launch_unknown" && e.lifecycleGrantHash === grantHashes[0]);
      if (e.operation === "launch_ack") requireFact(bound && s.runtime.registrationHash !== null);
      continue;
    }
    if (e.operation.startsWith("enqueue:")) {
      fields(e, ["principalHash", "runtimeHash", "permitHash", "evidenceHash"]);
      readTime(e);
      const p = permits.get(e.permitHash), name = e.operation.slice("enqueue:".length);
      requireFact(readOpen() && p && !queued.has(e.permitHash) && s.runtime.connected && s.runtime.actor !== null && s.runtime.registrationHash !== null && s.authorization.capabilities.includes(p.kind) && p.principalHash === e.principalHash && p.policyEpoch === s.authorization.policyEpoch && p.fenceEpoch <= s.fenceEpoch && p.runtimeHash === e.runtimeHash && p.runtimeHash === c.hash(s.runtime) && p.actorHash === c.hash(s.runtime.actor) && p.requestHash === e.evidenceHash && p.requestHash === c.hash({ name, args: {} }) && (p.kind !== "READ" || adopted));
      requireFact(p.issuedMonoMs === e.recordedMonoMs && p.expiresMonoMs <= s.authorization.expiresMonoMs);
      takePhase(p.requestHash, "enqueue", takePhase(p.requestHash, "ingress", cutoff));
      queued.set(e.permitHash, e); continue;
    }
    if (["dispatch", "dispatch_unknown", "completion"].includes(e.operation)) {
      fields(e, ["principalHash", "runtimeHash", "permitHash", "evidenceHash"]);
      const p = permits.get(e.permitHash), enq = queued.get(e.permitHash), d = sent.get(e.permitHash);
      requireFact(p && enq && e.principalHash === p.principalHash && e.runtimeHash === p.runtimeHash && e.operationId === c.hash({ permitId: p.permitId, requestHash: p.requestHash, runtimeHash: p.runtimeHash }));
      if (e.operation === "dispatch") {
        readTime(e); requireFact(p.issuedMonoMs <= e.recordedMonoMs && e.recordedMonoMs < p.expiresMonoMs);
        requireFact(readOpen() && !d && enq.sequence > cutoff && e.attemptKey === c.hash({ key: s.anchor.launchKey, effect: "dispatch", permitId: p.permitId }));
        takePhase(p.requestHash, "dispatch", enq.sequence); sent.set(e.permitHash, e);
      } else if (e.operation === "dispatch_unknown") {
        requireFact(d && !completed.has(e.permitHash) && !unknownDispatch.has(e.permitHash)); unknownDispatch.add(e.permitHash);
      } else { requireFact(d && !completed.has(e.permitHash)); completed.set(e.permitHash, e); }
      continue;
    }
    if (e.operation === "adopt") {
      fields(e, ["principalHash", "runtimeHash", "evidenceHash"]); readTime(e); requireFact(readOpen() && !adopted && s.authorization.capabilities.includes("READ"));
      const candidates = [...permits.entries()].filter(([h, p]) => p.kind === "BOOTSTRAP_READ" && p.runtimeHash === e.runtimeHash && sent.has(h) && completed.has(h) && sent.get(h).clockBootId === e.clockBootId && completed.get(h).clockBootId === e.clockBootId && sent.get(h).sequence > cutoff && e.recordedMonoMs - sent.get(h).recordedMonoMs <= c.TTL.bracket);
      let bracketIds = null, bracketEnd = 0;
      for (const [h1, p1] of candidates) for (const [h2, p2] of candidates) for (const [h3, p3] of candidates) {
        if (p1.requestHash !== c.hash({ name: "get_bridge_status", args: {} }) || p2.requestHash !== c.hash({ name: "get_project_info", args: {} }) || p3.requestHash !== p1.requestHash || sent.get(h2).sequence <= completed.get(h1).sequence || sent.get(h3).sequence <= completed.get(h2).sequence || new Set([p1.actorHash, p2.actorHash, p3.actorHash]).size !== 1 || new Set([p1.revocationEpoch, p2.revocationEpoch, p3.revocationEpoch]).size !== 1) continue;
        if (e.evidenceHash === c.hash({ permitIds: [p1.permitId, p2.permitId, p3.permitId], completionHashes: [h1, h2, h3].map(h => c.hash(completed.get(h))) })) { bracketIds = [p1.permitId, p2.permitId, p3.permitId]; bracketEnd = completed.get(h3).sequence; }
      }
      requireFact(bracketIds); const requestHash = c.hash({ operation: "adopt_initial", permitIds: bracketIds }); takePhase(requestHash, "dispatch", takePhase(requestHash, "ingress", Math.max(cutoff, bracketEnd))); adopted = true; continue;
    }
    if (e.operation === "revoke") { fields(e, []); requireFact(adopted && !retired); adopted = false; cutoff = e.sequence; continue; }
    if (e.operation === "drain") {
      fields(e, ["runtimeHash", "lifecycleGrantHash", "evidenceHash"]); requireFact(reserved && bound && !drained && !stopped && !retired && e.runtimeHash === bound.boundRuntimeHash); linkedGrant(e); drained = true; adopted = false; cutoff = e.sequence; continue;
    }
    if (e.operation === "stop_reserve") {
      fields(e, ["runtimeHash", "lifecycleGrantHash", "evidenceHash"]); requireFact(drained && bound && !stopped && !retired && e.runtimeHash === bound.boundRuntimeHash && [...sent.keys()].every(h => completed.has(h)) && e.attemptKey === c.hash({ launchKey: s.anchor.launchKey, generation: s.anchor.generation, effect: "initial_stop" })); linkedGrant(e); stopped = true; continue;
    }
    if (["stop_ack", "stop_unknown"].includes(e.operation)) {
      fields(e, ["runtimeHash", "lifecycleGrantHash"], ["runtimeHash", "lifecycleGrantHash", "evidenceHash"]); requireFact(stopped && !stopOutcome && !retired && e.runtimeHash === bound.boundRuntimeHash && (e.operation !== "stop_ack" || e.evidenceHash !== null)); linkedGrant(e); stopOutcome = true; continue;
    }
    if (e.operation === "exit_proven") {
      fields(e, ["runtimeHash", "lifecycleGrantHash", "evidenceHash"]); requireFact(reserved && bound && !retired && e.runtimeHash === bound.boundRuntimeHash); linkedGrant(e, true); retired = true; adopted = false; continue;
    }
    requireFact(false);
  }
  requireFact(queued.size === permits.size && usedGrants.size === s.grants.length && new Set(grantHashes).size === s.grants.length && !!s.runtime === !!bound);
  if (s.runtime) requireFact(s.runtime.controllerId === prepared.controllerId);
  for (const g of s.grants.slice(1)) requireFact(bound && g.boundWitnessId === bound.boundWitnessId && g.boundRuntimeHash === bound.boundRuntimeHash && (g.retired ? retired : c.hash(g) === c.hash(bound)));
}
function runtimePins(a, r) {
  if (r.anchorId !== a.anchorId || r.generation !== a.generation || r.sourceHash !== a.sourceHash || r.configHash !== a.configHash || r.installHash !== a.installHash) fail("initial_runtime_pins_changed");
}
function durableState(s, { ignorePendingDispatch = false } = {}) {
  if (!s) return S.UNPROVISIONED;
  let state = S.PROVISIONED_NO_PROCESS;
  for (const e of s.events) {
    if (e.operation === "launch_reserve") state = S.RESERVED;
    if (e.operation === "launch_ack") state = S.REGISTERED_CLOSED;
    if (["launch_unknown", "stop_unknown", "dispatch_unknown"].includes(e.operation)) state = S.UNKNOWN_READBACK_ONLY;
    if (e.operation === "adopt") state = S.READ_SESSION_ACTIVE;
    if (e.operation === "revoke" && state === S.READ_SESSION_ACTIVE) state = S.REGISTERED_CLOSED;
    if (e.operation === "drain") state = S.DRAINING;
    if (e.operation === "exit_proven") state = S.RETIRED_EXIT_PROVEN;
  }
  if (state !== S.RETIRED_EXIT_PROVEN && s.events.some(e => e.operation === "stop_reserve") && !s.events.some(e => ["stop_ack", "stop_unknown"].includes(e.operation))) return S.UNKNOWN_READBACK_ONLY;
  // A consumed attempt without factual completion cannot restore admission after a crash.
  if (!ignorePendingDispatch && ![S.DRAINING, S.RETIRED_EXIT_PROVEN].includes(state) && s.events.some(e => e.operation === "dispatch" && !s.events.some(done => done.operation === "completion" && done.permitHash === e.permitHash))) return S.UNKNOWN_READBACK_ONLY;
  return state;
}
function expectedInventory(s) {
  if (!s) return [];
  const { anchor: a } = s, rows = [];
  function own(namespace, kind, ref) { rows.push({ namespace, kind, ref, ownerAnchorId: a.anchorId, generation: a.generation }); }
  own("initial", "anchor", a.anchorId); own("initial", "authorization", c.hash(s.authorization));
  s.grants.forEach(g => own("initial", "lifecycle-grant", c.hash(g)));
  s.events.forEach(e => own("initial", "event", c.hash(e)));
  s.permits.forEach(p => own("initial", "permit", p.permitId));
  const reserved = s.events.find(e => e.operation === "launch_reserve");
  if (reserved) { own("daemon", "reservation", reserved.attemptKey); own("daemon", "launch-ticket", reserved.operationId); }
  if (s.runtime) {
    own("daemon", "candidate", c.runtimeIdentityHash(s.runtime));
    if (s.events.some(e => e.operation === "launch_ack")) { own("daemon", "registration", s.runtime.registrationHash); own("daemon", "pointer", a.generation); }
    if (s.runtime.actor !== null) { own("panel", "transport", c.hash(s.runtime.actor)); own("panel", "index", s.runtime.actor.panelInstanceId); }
  }
  return rows.sort((x, y) => c.hash(x).localeCompare(c.hash(y)));
}
function createInitialOwnedModel(dependencies = {}) {
  const tickets = new WeakMap(), ticketRows = new Map(), localTimes = new Map();
  let lease = null, localUnknown = null;
  function port(name, arg) {
    if (typeof dependencies[name] !== "function") fail("initial_private_port_unavailable", name);
    const v = dependencies[name](arg);
    if (v && typeof v.then === "function") fail("initial_synchronous_fixture_port_required", name);
    return v;
  }
  function storePort(name, arg) {
    if (!dependencies.store || typeof dependencies.store[name] !== "function") fail("initial_private_store_unavailable");
    const v = dependencies.store[name](arg);
    if (v && typeof v.then === "function") fail("initial_synchronous_fixture_store_required"); return v;
  }
  function load() {
    const scope = c.copy(c.scope(port("readScope"))), key = c.launchKey(scope), raw = storePort("read", { launchKey: key });
    const s = raw === null ? null : snapshot(raw);
    if (s && ["machineId", "userId", "canonicalRoot", "physicalRootId", "installationLineage"].some(k => s.anchor[k] !== scope[k])) fail("initial_canonical_scope_changed");
    return { scope, key, s };
  }
  function state(s) {
    if (localUnknown) return S.UNKNOWN_READBACK_ONLY;
    const d = durableState(s);
    if (d === S.READ_SESSION_ACTIVE && !lease) return S.REGISTERED_CLOSED;
    return d;
  }
  function frame({ lifecycle = false, allowEmpty = false, ownerChange = false } = {}) {
    const f = load();
    if (!f.s && !allowEmpty) fail("initial_provisioning_required");
    f.clock = c.copy(c.clock(port(lifecycle ? "readLifecycleClock" : "readClock")));
    const floor = Math.max(localTimes.get(f.clock.bootId) ?? 0, f.s?.events.filter(e => e.clockBootId === f.clock.bootId).reduce((m, e) => Math.max(m, e.recordedMonoMs), f.s.anchor.clockBootId === f.clock.bootId ? f.s.anchor.createdMonoMs : 0) ?? 0);
    if (f.clock.monoMs < floor) { lease = null; fail("initial_clock_rollback"); }
    localTimes.set(f.clock.bootId, f.clock.monoMs);
    if (f.s && f.clock.bootId !== f.s.anchor.clockBootId) { lease = null; if (!lifecycle) fail("initial_clock_boot_changed"); }
    f.fence = c.copy(c.fence(port("readFence", { launchKey: f.key })));
    if (f.fence.scopeHash !== c.hash(f.scope)) fail("initial_fence_scope_changed");
    if (f.s && !ownerChange && (f.fence.ownerId !== f.s.fenceOwnerId || f.fence.epoch !== f.s.fenceEpoch)) { lease = null; fail("initial_fence_epoch_changed"); }
    const expected = expectedInventory(f.s), actual = c.inventory(port("readInventory", c.copy({ state: state(f.s), expectedEntries: expected })));
    const rows = [...actual.entries].sort((x, y) => c.hash(x).localeCompare(c.hash(y)));
    if (c.hash(rows) !== c.hash(expected) || new Set(rows.map(c.hash)).size !== rows.length) fail("initial_namespace_foreign_partial_or_missing");
    return f;
  }
  function append(f, operation, outcome, details = {}, records = {}) {
    const previous = f.s.headHash, event = tagged("event", { anchorId: f.s.anchor.anchorId, generation: f.s.anchor.generation, sequence: f.s.events.length + 1, previousHash: previous, operationId: details.operationId || crypto.randomUUID(), attemptKey: details.attemptKey || c.hash({ key: f.key, operation, sequence: f.s.events.length + 1 }), operation, outcome, principalHash: details.principalHash ?? null, runtimeHash: details.runtimeHash ?? null, lifecycleGrantHash: details.lifecycleGrantHash ?? null, permitHash: details.permitHash ?? null, evidenceHash: details.evidenceHash ?? null, clockBootId: f.clock.bootId, recordedMonoMs: f.clock.monoMs, replayAllowed: false });
    c.event(event);
    try {
      storePort("atomicAppend", c.copy({ launchKey: f.key, expectedHeadHash: previous, expectedSequence: event.sequence, stableAttemptKey: event.attemptKey, fence: f.fence, event, records }));
      const next = load().s;
      if (!next || next.headHash !== c.hash(event)) fail("initial_atomic_publication_unknown");
      f.s = next; return event;
    } catch (error) { lease = null; localUnknown = error.code || "initial_store_append_unknown"; throw error; }
  }
  function checkedCaller(f, callRef, reqHash, phase, expected = null) {
    const v = c.copy(c.verifiedCall(port("readCaller", { callRef, phase, requestHash: reqHash, expectedPrincipalHash: expected })));
    const ph = c.hash(v.principal), auth = f.s.authorization;
    if (v.phase !== phase || v.requestHash !== reqHash || (expected !== null && ph !== expected) || ph !== auth.principalHash || v.issuedMonoMs > f.clock.monoMs || v.expiresMonoMs <= f.clock.monoMs || auth.issuedMonoMs > f.clock.monoMs || auth.expiresMonoMs <= f.clock.monoMs) fail("initial_verified_caller_unavailable_or_stale");
    const evidence = c.hash({ principal: v.principal, callId: v.callId, nonce: v.nonce });
    if (f.s.events.some(e => e.operation.startsWith("caller_") && e.evidenceHash === evidence)) fail("initial_caller_evidence_replayed");
    return v;
  }
  function call(f, callRef, reqHash, phase, expected = null) {
    const v = checkedCaller(f, callRef, reqHash, phase, expected), evidence = c.hash({ principal: v.principal, callId: v.callId, nonce: v.nonce });
    append(f, "caller_" + phase, "VERIFIED", { operationId: reqHash, principalHash: c.hash(v.principal), evidenceHash: evidence, attemptKey: c.hash({ key: f.key, evidence }) }); return v;
  }
  function finalCallerFrame(pins, callRef, reqHash, who, dispatchedCall) {
    let fresh = frame();
    const guard = checkedCaller(fresh, callRef, reqHash, "dispatch", c.hash(who.principal));
    fresh = frame();
    if (c.hash(fresh.s.anchor) !== pins.anchorHash || c.hash(fresh.s.authorization) !== pins.authorizationHash || who.revocationEpoch !== dispatchedCall.revocationEpoch || guard.revocationEpoch !== dispatchedCall.revocationEpoch || who.expiresMonoMs <= fresh.clock.monoMs || dispatchedCall.expiresMonoMs <= fresh.clock.monoMs || guard.issuedMonoMs > fresh.clock.monoMs || guard.expiresMonoMs <= fresh.clock.monoMs || fresh.s.authorization.expiresMonoMs <= fresh.clock.monoMs) fail("initial_final_caller_frame_changed");
    return fresh;
  }
  function currentRuntime(f) {
    const r = c.copy(c.runtime(port("readRuntime", { anchorId: f.s.anchor.anchorId, generation: f.s.anchor.generation })));
    runtimePins(f.s.anchor, r);
    if (!f.s.runtime || c.runtimeIdentityHash(r) !== c.runtimeIdentityHash(f.s.runtime) || r.registrationHash !== f.s.runtime.registrationHash || r.controllerId !== f.fence.ownerId) fail("initial_runtime_identity_changed");
    if (c.hash(r.actor) !== c.hash(f.s.runtime.actor)) fail("initial_runtime_actor_changed");
    if (!r.connected || r.actor === null || r.registrationHash === null) fail("initial_connected_registered_actor_required");
    if (!c.ready(port("readReadiness"))) fail("initial_readiness_closed"); return r;
  }
  function boundGrant(s) { return [...s.grants].reverse().find(g => g.boundWitnessId !== null && !g.retired) || null; }
  function lifecycle(f, operation, { launch = false, observational = false } = {}) {
    const g = launch ? f.s.grants[0] : boundGrant(f.s);
    if (!g) fail("initial_original_bound_grant_required");
    if (!observational && g.controllerId !== f.fence.ownerId) fail("initial_lifecycle_controller_changed");
    const consumed = f.s.events.find(e => e.operation === "launch_reserve");
    const proof = c.copy(c.lifecycleEvidence(port("readLifecycle", { operation, anchorId: f.s.anchor.anchorId, generation: f.s.anchor.generation, grantHash: c.hash(g), originalLaunchEventHash: consumed ? c.hash(consumed) : null, originalLaunchOperationId: consumed?.operationId ?? null })));
    if (c.hash(proof.grant) !== c.hash(g)) fail("initial_original_grant_changed");
    if (!launch) {
      if (!proof.positiveHeldTarget || !proof.runtime || proof.runtime.heldWitnessId !== g.boundWitnessId || c.runtimeIdentityHash(proof.runtime) !== g.boundRuntimeHash || c.runtimeIdentityHash(proof.runtime) !== c.runtimeIdentityHash(f.s.runtime)) fail("initial_positive_same_held_target_required");
    }
    return proof;
  }
  function eventForPermit(s, p, operation) { return s.events.find(e => e.operation === operation && e.permitHash === c.hash(p)); }
  function dispatched(s) { return s.permits.filter(p => eventForPermit(s, p, "dispatch") && !eventForPermit(s, p, "completion")); }
  function readBack() {
    let f;
    try { f = load(); } catch (error) { return c.projection({ ok: false, state: S.UNKNOWN_READBACK_ONLY, reason: error.code || "initial_store_unknown", executionEntitled: false, initialLaunchConsumed: true }); }
    const s = f.s;
    return c.projection({ ok: true, state: state(s), reason: localUnknown, anchorId: s?.anchor.anchorId ?? null, generation: s?.anchor.generation ?? null, initialLaunchConsumed: !!s?.events.some(e => e.operation === "launch_reserve"), stopConsumed: !!s?.events.some(e => e.operation === "stop_reserve"), headHash: s?.headHash ?? null, events: s?.events.length ?? 0, activeDispatchedTickets: s ? dispatched(s).length : 0, leaseRestored: false, executionEntitled: false, liveProof: false });
  }
  function reserve(callRef) {
    let f = frame();
    if (f.s.events.some(e => e.operation === "launch_reserve")) return c.projection({ ...readBack(), status: "launch_consumed_readback", consumed: true });
    if (state(f.s) !== S.PROVISIONED_NO_PROCESS || localUnknown) fail("initial_launch_state_closed");
    const g = f.s.grants[0];
    const pins = { anchorHash: c.hash(f.s.anchor), authorizationHash: c.hash(f.s.authorization) };
    if (g.controllerId !== f.fence.ownerId || g.boundWitnessId !== null || g.retired) fail("initial_prelaunch_disposition_required");
    const rh = c.hash({ operation: "reserve_initial" }), who = call(f, callRef, rh, "ingress");
    const final = call(f, callRef, rh, "dispatch", c.hash(who.principal));
    if (who.revocationEpoch !== final.revocationEpoch) fail("initial_caller_revoked_during_reserve");
    f = finalCallerFrame(pins, callRef, rh, who, final);
    if (state(f.s) !== S.PROVISIONED_NO_PROCESS || c.hash(f.s.grants[0]) !== c.hash(g) || g.controllerId !== f.fence.ownerId) fail("initial_final_reserve_disposition_changed");
    const e = append(f, "launch_reserve", "CONSUMED", { principalHash: c.hash(who.principal), lifecycleGrantHash: c.hash(g), evidenceHash: c.hash({ scope: f.scope, fence: f.fence }), attemptKey: c.hash({ launchKey: f.key, effect: "initial_launch" }) });
    return c.projection({ ok: true, state: S.RESERVED, consumed: true, modeledEffect: "launch_candidate_only", eventHash: c.hash(e), executionEntitled: false });
  }
  function register() {
    const f = frame({ lifecycle: true });
    if (!f.s.events.some(e => e.operation === "launch_reserve")) fail("initial_consumed_launch_required");
    if (f.s.events.some(e => ["launch_ack", "launch_unknown"].includes(e.operation))) {
      if (f.s.events.some(e => e.operation === "launch_unknown") && !f.s.runtime) return observeOriginalLaunch(f);
      return c.projection({ ...readBack(), status: "registration_consumed_readback" });
    }
    let proof, g = f.s.grants[0], records = {};
    try {
      proof = lifecycle(f, "observe_launch", { launch: true });
      if (proof.runtime && proof.positiveHeldTarget) {
        runtimePins(f.s.anchor, proof.runtime);
        if (proof.runtime.controllerId !== g.controllerId) fail("initial_launcher_controller_changed");
        g = tagged("lifecycle-grant", { ...c.clone(g), boundWitnessId: proof.runtime.heldWitnessId, boundRuntimeHash: c.runtimeIdentityHash(proof.runtime) });
        c.grant(g); records = { grant: g, runtime: proof.runtime };
      }
    } catch (error) {
      const e = append(f, "launch_unknown", "UNKNOWN", { lifecycleGrantHash: c.hash(g), evidenceHash: c.hash({ reason: error.code || "initial_launch_readback_missing" }) });
      return c.projection({ ok: false, state: S.UNKNOWN_READBACK_ONLY, eventHash: c.hash(e), disposition: "original_grant_readback_only", executionEntitled: false });
    }
    const accepted = proof.outcome === "ACK" && proof.receiptHash !== null && proof.runtime?.registrationHash !== null && proof.positiveHeldTarget && Object.hasOwn(records, "runtime");
    const e = append(f, accepted ? "launch_ack" : "launch_unknown", accepted ? "ACK" : "UNKNOWN", { runtimeHash: records.runtime ? c.hash(records.runtime) : null, lifecycleGrantHash: c.hash(g), evidenceHash: c.hash(proof) }, records);
    return c.projection({ ok: accepted, state: accepted ? S.REGISTERED_CLOSED : S.UNKNOWN_READBACK_ONLY, eventHash: c.hash(e), disposition: records.runtime ? "original_bound_grant_available" : "no_target_wait_only", executionEntitled: false });
  }
  function observeOriginalLaunch(f) {
    // This port observes the already consumed launch. It never issues a new launch.
    const prepared = f.s.grants[0], proof = lifecycle(f, "observe_original_launch", { launch: true, observational: true });
    if (!proof.positiveHeldTarget || !proof.runtime) return c.projection({ ...readBack(), status: "original_launch_target_unbound", modeledEffects: 0 });
    runtimePins(f.s.anchor, proof.runtime);
    if (proof.runtime.controllerId !== prepared.controllerId) fail("initial_launcher_controller_changed");
    const g = tagged("lifecycle-grant", { ...c.clone(prepared), boundWitnessId: proof.runtime.heldWitnessId, boundRuntimeHash: c.runtimeIdentityHash(proof.runtime) });
    const e = append(f, "launch_bound", "BOUND", { runtimeHash: c.hash(proof.runtime), lifecycleGrantHash: c.hash(g), evidenceHash: c.hash(proof) }, { grant: g, runtime: proof.runtime });
    return c.projection({ ...readBack(), status: "original_launch_target_bound_readback", eventHash: c.hash(e), modeledEffects: 0, disposition: "original_bound_grant_available" });
  }
  function enqueue(input, callRef) {
    const req = c.request(input), f = frame(), st = state(f.s);
    if (![S.REGISTERED_CLOSED, S.READ_SESSION_ACTIVE].includes(st)) fail("initial_read_admission_closed");
    const reqHash = c.hash(req), who = call(f, callRef, reqHash, "ingress"), principalHash = c.hash(who.principal), queued = call(f, callRef, reqHash, "enqueue", principalHash);
    if (who.revocationEpoch !== queued.revocationEpoch) fail("initial_caller_revoked_during_enqueue");
    const r = currentRuntime(f), kind = st === S.READ_SESSION_ACTIVE ? "READ" : "BOOTSTRAP_READ";
    if (!f.s.authorization.capabilities.includes(kind)) fail("initial_read_capability_missing");
    if (kind === "READ" && (!lease || lease.expiresMonoMs <= f.clock.monoMs || lease.principalHash !== principalHash || lease.revocationEpoch !== queued.revocationEpoch || lease.runtimeHash !== c.hash(r) || lease.fenceEpoch !== f.fence.epoch)) fail("initial_live_read_lease_invalid");
    const p = tagged("read-permit", { kind, permitId: crypto.randomUUID(), anchorId: f.s.anchor.anchorId, generation: f.s.anchor.generation, principalHash, policyEpoch: f.s.authorization.policyEpoch, revocationEpoch: queued.revocationEpoch, fenceEpoch: f.fence.epoch, runtimeHash: c.hash(r), actorHash: c.hash(r.actor), requestHash: reqHash, issuedMonoMs: f.clock.monoMs, expiresMonoMs: Math.min(f.clock.monoMs + c.TTL.ticket, queued.expiresMonoMs, f.s.authorization.expiresMonoMs, lease?.expiresMonoMs ?? Infinity), executionEntitled: false });
    c.permit(p);
    append(f, "enqueue:" + req.name, "QUEUED", { principalHash, runtimeHash: p.runtimeHash, permitHash: c.hash(p), evidenceHash: reqHash }, { permit: p });
    const ticket = c.copy(c.projection({ kind: "opaque_initial_read_ticket" })), row = { permit: p, req, callRef, dispatched: false };
    tickets.set(ticket, row); ticketRows.set(p.permitId, row); return ticket;
  }
  function ticketRow(ticket) { const row = ticket && typeof ticket === "object" ? tickets.get(ticket) : null; if (!row) fail("initial_opaque_ticket_required"); return row; }
  function dispatch(ticket) {
    const row = ticketRow(ticket), f = frame(), p = row.permit;
    if (row.dispatched || eventForPermit(f.s, p, "dispatch")) fail("initial_dispatch_consumed");
    if (![S.REGISTERED_CLOSED, S.READ_SESSION_ACTIVE].includes(state(f.s)) || p.expiresMonoMs <= f.clock.monoMs || p.policyEpoch !== f.s.authorization.policyEpoch || p.fenceEpoch !== f.fence.epoch || (p.kind === "READ" && (!lease || lease.expiresMonoMs <= f.clock.monoMs))) fail("initial_dispatch_permit_stale_or_closed");
    const enqueued = f.s.events.find(e => e.permitHash === c.hash(p) && e.operation.startsWith("enqueue:"));
    if (!enqueued || f.s.events.some(e => ["revoke", "drain"].includes(e.operation) && e.sequence > enqueued.sequence)) fail("initial_queued_ticket_revoked");
    const who = call(f, row.callRef, p.requestHash, "dispatch", p.principalHash), r = currentRuntime(f);
    if (who.revocationEpoch !== p.revocationEpoch || c.hash(r) !== p.runtimeHash || c.hash(r.actor) !== p.actorHash) fail("initial_dispatch_binding_changed");
    const commandId = c.hash({ permitId: p.permitId, requestHash: p.requestHash, runtimeHash: p.runtimeHash });
    let e;
    try {
      e = append(f, "dispatch", "DISPATCHED", { operationId: commandId, principalHash: p.principalHash, runtimeHash: p.runtimeHash, permitHash: c.hash(p), evidenceHash: c.hash({ request: row.req, actorHash: p.actorHash }), attemptKey: c.hash({ key: f.key, effect: "dispatch", permitId: p.permitId }) });
    } catch (error) {
      row.dispatched = true;
      return c.projection({ ok: false, state: S.UNKNOWN_READBACK_ONLY, status: "dispatch_publication_unknown", consumption: "unknown_readback_only", modeledEffects: 0, modeledEffect: null, reason: error.code || "initial_dispatch_publication_unknown", commandId, permitId: p.permitId, executionEntitled: false });
    }
    row.dispatched = true;
    try {
      let final = frame();
      const finalWho = call(final, row.callRef, p.requestHash, "dispatch", p.principalHash);
      final = frame();
      const finalState = durableState(final.s, { ignorePendingDispatch: true });
      if (localUnknown || ![S.REGISTERED_CLOSED, S.READ_SESSION_ACTIVE].includes(finalState) || p.expiresMonoMs <= final.clock.monoMs || p.policyEpoch !== final.s.authorization.policyEpoch || p.fenceEpoch !== final.fence.epoch || finalWho.revocationEpoch !== p.revocationEpoch || finalWho.expiresMonoMs <= final.clock.monoMs || final.s.authorization.expiresMonoMs <= final.clock.monoMs || (p.kind === "READ" && (!lease || lease.expiresMonoMs <= final.clock.monoMs || lease.revocationEpoch !== p.revocationEpoch || lease.runtimeHash !== p.runtimeHash || lease.fenceEpoch !== final.fence.epoch))) fail("initial_final_dispatch_permit_changed");
      const finalRuntime = currentRuntime(final);
      if (c.hash(finalRuntime) !== p.runtimeHash || c.hash(finalRuntime.actor) !== p.actorHash) fail("initial_final_dispatch_binding_changed");
    } catch (error) {
      lease = null; localUnknown = error.code || "initial_final_dispatch_unknown";
      let unknown = null;
      try {
        const observed = frame({ lifecycle: true, ownerChange: true });
        unknown = append(observed, "dispatch_unknown", "UNKNOWN", { operationId: commandId, principalHash: p.principalHash, runtimeHash: p.runtimeHash, permitHash: c.hash(p), evidenceHash: c.hash({ reason: localUnknown }), attemptKey: c.hash({ key: f.key, effect: "dispatch_unknown", permitId: p.permitId }) });
      } catch (_) { /* The durable dispatch latch still closes reconstruction if UNKNOWN cannot publish. */ }
      return c.projection({ ok: false, state: S.UNKNOWN_READBACK_ONLY, status: "dispatch_consumed_unknown", consumed: true, modeledEffects: 0, modeledEffect: null, reason: localUnknown, commandId, permitId: p.permitId, eventHash: c.hash(unknown || e), executionEntitled: false });
    }
    return c.projection({ ok: true, consumed: true, modeledEffects: 1, modeledEffect: "bounded_typed_read_only", name: row.req.name, commandId, permitId: p.permitId, eventHash: c.hash(e), executionEntitled: false });
  }
  function completePermit(p, f) {
    const d = eventForPermit(f.s, p, "dispatch");
    if (!d) fail("initial_exact_dispatched_command_required");
    const proof = c.copy(c.completion(port("readCompletion", { commandId: d.operationId, requestHash: p.requestHash, runtimeHash: p.runtimeHash, actorHash: p.actorHash, permitId: p.permitId })));
    if (proof.commandId !== d.operationId || proof.requestHash !== p.requestHash || proof.runtimeHash !== p.runtimeHash || proof.actorHash !== p.actorHash || proof.observedMonoMs < d.recordedMonoMs || proof.observedMonoMs > f.clock.monoMs) fail("initial_completion_binding_invalid");
    const existing = eventForPermit(f.s, p, "completion");
    if (existing) {
      if (existing.evidenceHash !== c.hash(proof)) fail("initial_terminal_completion_changed");
      return c.projection({ ok: true, status: "terminal_completion_readback", permitId: p.permitId, receiptHash: proof.receiptHash, eventHash: c.hash(existing), executionEntitled: false });
    }
    if (proof.observedMonoMs - d.recordedMonoMs > c.TTL.command) fail("initial_completion_observation_expired");
    const e = append(f, "completion", "COMPLETED", { operationId: d.operationId, principalHash: p.principalHash, runtimeHash: p.runtimeHash, permitHash: c.hash(p), evidenceHash: c.hash(proof), attemptKey: c.hash({ key: f.key, effect: "completion", permitId: p.permitId }) });
    return c.projection({ ok: true, status: "terminal_completion", permitId: p.permitId, receiptHash: proof.receiptHash, eventHash: c.hash(e), executionEntitled: false });
  }
  function complete(ticket) { const row = ticketRow(ticket); return completePermit(row.permit, frame({ lifecycle: true, ownerChange: true })); }
  function reconcileCompletion(input) {
    c.exact(input, ["permitId"]); c.id(input.permitId);
    const f = frame({ lifecycle: true, ownerChange: true }), p = f.s.permits.find(x => x.permitId === input.permitId);
    if (!p) fail("initial_completion_selector_unknown"); return completePermit(p, f);
  }
  function adopt(input, callRef) {
    c.exact(input, ["permitIds"]); c.list(input.permitIds, c.id);
    if (input.permitIds.length !== 3 || new Set(input.permitIds).size !== 3) fail("initial_fresh_bracket_required");
    let f = frame(); if (state(f.s) !== S.REGISTERED_CLOSED) fail("initial_adoption_state_closed");
    const pins = { anchorHash: c.hash(f.s.anchor), authorizationHash: c.hash(f.s.authorization) };
    const ph = f.s.authorization.principalHash, rh = c.hash({ operation: "adopt_initial", permitIds: input.permitIds }), who = call(f, callRef, rh, "ingress", ph);
    const final = call(f, callRef, rh, "dispatch", ph);
    if (who.revocationEpoch !== final.revocationEpoch) fail("initial_caller_revoked_during_adopt");
    f = finalCallerFrame(pins, callRef, rh, who, final);
    if (state(f.s) !== S.REGISTERED_CLOSED) fail("initial_adoption_state_closed");
    const r = currentRuntime(f), permits = input.permitIds.map(id => f.s.permits.find(p => p.permitId === id));
    let lastDispatch = 0, lastCompletion = 0;
    permits.forEach((p, i) => {
      if (!p || p.kind !== "BOOTSTRAP_READ" || p.principalHash !== ph || p.runtimeHash !== c.hash(r) || p.actorHash !== c.hash(r.actor) || p.fenceEpoch !== f.fence.epoch || p.policyEpoch !== f.s.authorization.policyEpoch || p.revocationEpoch !== who.revocationEpoch) fail("initial_bracket_binding_changed");
      const enq = eventForPermit(f.s, p, "enqueue:" + (i === 1 ? "get_project_info" : "get_bridge_status")), d = eventForPermit(f.s, p, "dispatch"), done = eventForPermit(f.s, p, "completion");
      if (!enq || !d || !done || d.clockBootId !== f.clock.bootId || done.clockBootId !== f.clock.bootId || d.sequence <= lastCompletion || d.sequence <= lastDispatch || done.sequence <= d.sequence || f.clock.monoMs - d.recordedMonoMs > c.TTL.bracket || f.s.events.some(e => ["revoke", "drain", "dispatch_unknown"].includes(e.operation) && e.sequence > enq.sequence)) fail("initial_fresh_bracket_required");
      lastDispatch = d.sequence; lastCompletion = done.sequence;
    });
    if (!f.s.authorization.capabilities.includes("READ")) fail("initial_read_capability_missing");
    append(f, "adopt", "READ_ONLY", { principalHash: ph, runtimeHash: c.hash(r), evidenceHash: c.hash({ permitIds: input.permitIds, completionHashes: permits.map(p => c.hash(eventForPermit(f.s, p, "completion"))) }) });
    lease = c.copy({ principalHash: ph, runtimeHash: c.hash(r), revocationEpoch: who.revocationEpoch, fenceEpoch: f.fence.epoch, expiresMonoMs: Math.min(f.clock.monoMs + c.TTL.lease, f.s.authorization.expiresMonoMs) });
    return c.projection({ ok: true, state: S.READ_SESSION_ACTIVE, expiresMonoMs: lease.expiresMonoMs, executionEntitled: false });
  }
  function revoke() {
    const f = frame({ lifecycle: true, ownerChange: true }); lease = null;
    if (durableState(f.s, { ignorePendingDispatch: true }) !== S.READ_SESSION_ACTIVE) return readBack();
    append(f, "revoke", "REVOKED"); return readBack();
  }
  function drain() {
    const f = frame({ lifecycle: true }), st = state(f.s);
    if (st === S.RETIRED_EXIT_PROVEN) return readBack();
    if (f.s.events.some(e => e.operation === "drain")) return readBack();
    if (![S.REGISTERED_CLOSED, S.READ_SESSION_ACTIVE, S.UNKNOWN_READBACK_ONLY].includes(st)) fail("initial_drain_state_closed");
    const proof = lifecycle(f, "drain_initial"), g = boundGrant(f.s);
    if (f.s.events.some(e => e.operation === "stop_reserve")) fail("initial_consumed_stop_wait_only");
    append(f, "drain", "DRAINING", { runtimeHash: c.runtimeIdentityHash(proof.runtime), lifecycleGrantHash: c.hash(g), evidenceHash: c.hash(proof), attemptKey: c.hash({ key: f.key, effect: "drain_initial", generation: f.s.anchor.generation }) });
    lease = null; localUnknown = null; return readBack();
  }
  function stop(operation) {
    const f = frame({ lifecycle: true });
    if (operation === "abort_unadmitted" && f.s.events.some(e => e.operation === "dispatch")) fail("initial_abort_after_dispatch_forbidden");
    if (f.s.events.some(e => e.operation === "stop_reserve")) return c.projection({ ...readBack(), status: "stop_consumed_wait_only" });
    if (state(f.s) !== S.DRAINING) fail("initial_drain_required");
    if (dispatched(f.s).length || !c.ready(port("readReadiness"))) return c.projection({ ok: false, status: "drain_pending_remains_alive", state: S.DRAINING, exitProven: false, executionEntitled: false });
    const pre = lifecycle(f, "authorize_" + operation), g = boundGrant(f.s);
    append(f, "stop_reserve", "CONSUMED", { runtimeHash: c.runtimeIdentityHash(pre.runtime), lifecycleGrantHash: c.hash(g), evidenceHash: c.hash(pre), attemptKey: c.hash({ launchKey: f.key, generation: f.s.anchor.generation, effect: "initial_stop" }) });
    let proof = null, issued = false, reason = null, final = null;
    try {
      // Consumption cannot be undone if final controller/clock/target/readiness drifts.
      final = frame({ lifecycle: true });
      lifecycle(final, "authorize_" + operation);
      final = frame({ lifecycle: true });
      if (final.clock.bootId !== f.clock.bootId || final.clock.monoMs - f.clock.monoMs > c.TTL.observation) fail("initial_late_stop_clock_changed");
      if (dispatched(final.s).length || !c.ready(port("readReadiness"))) fail("initial_late_stop_readiness_changed");
      if (boundGrant(final.s)?.controllerId !== final.fence.ownerId) fail("initial_lifecycle_controller_changed");
      issued = true; proof = lifecycle(final, operation);
    } catch (error) { reason = error.code || "initial_final_stop_unknown"; }
    const ack = proof?.outcome === "ACK" && proof.receiptHash !== null;
    try {
      const observed = ack ? final : frame({ lifecycle: true, ownerChange: true });
      append(observed, ack ? "stop_ack" : "stop_unknown", ack ? "ACK" : "UNKNOWN", { runtimeHash: g.boundRuntimeHash, lifecycleGrantHash: c.hash(g), evidenceHash: proof ? c.hash(proof) : null });
    } catch (error) { reason = error.code || "initial_stop_publication_unknown"; }
    if (!ack || reason) { lease = null; localUnknown = reason || "initial_shutdown_ack_unknown"; }
    return c.projection({ ok: ack && reason === null, state: ack && reason === null ? S.DRAINING : S.UNKNOWN_READBACK_ONLY, status: ack && reason === null ? "shutdown_ack_exit_unproven" : "shutdown_unknown_wait_only", consumed: true, modeledEffects: issued ? 1 : 0, reason, exitProven: false, executionEntitled: false });
  }
  function waitExit() {
    const f = frame({ lifecycle: true, ownerChange: true }), existing = f.s.events.find(e => e.operation === "exit_proven");
    if (existing) return c.projection({ ...readBack(), exitProven: true, eventHash: c.hash(existing) });
    const proof = lifecycle(f, "wait_exit", { observational: true }), g = boundGrant(f.s), exit = proof.exitProof;
    if (proof.outcome !== "EXIT_PROVEN" || !exit?.exited) return c.projection({ ...readBack(), exitProven: false, status: "bounded_wait_no_exit_proof" });
    if (exit.heldWitnessId !== g.boundWitnessId || exit.runtimeHash !== g.boundRuntimeHash || c.hash(exit.kernelIdentity) !== c.hash(f.s.runtime.kernelIdentity) || exit.observedMonoMs > f.clock.monoMs || f.clock.monoMs - exit.observedMonoMs > c.TTL.observation) fail("initial_exact_held_handle_exit_proof_required");
    const retired = tagged("lifecycle-grant", { ...c.clone(g), retired: true });
    append(f, "exit_proven", "EXIT_PROVEN", { runtimeHash: g.boundRuntimeHash, lifecycleGrantHash: c.hash(retired), evidenceHash: c.hash(proof), attemptKey: c.hash({ key: f.key, effect: "exit_fact", generation: f.s.anchor.generation }) }, { grant: retired });
    lease = null; localUnknown = null; return c.projection({ ...readBack(), exitProven: true });
  }
  function assertExecution() { fail("initial_execution_always_denied"); }
  return Object.freeze({ scope: c.SCOPE, productionAuthority: false, reserve, register, enqueue, dispatch, complete, reconcileCompletion, adopt, revoke, drain, shutdown: () => stop("shutdown_initial"), abortUnadmitted: () => stop("abort_unadmitted"), waitExit, readBack, assertExecution });
}
module.exports = { createInitialOwnedModel, snapshot, durableState, expectedInventory };
