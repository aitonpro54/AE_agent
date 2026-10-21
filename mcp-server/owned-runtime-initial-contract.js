"use strict";

// An isolated contract model. These shapes do not authenticate a real issuer.
const crypto = require("node:crypto");
const SCOPE = "offline_contract_model";
const SCHEMA = "ae-agent.owned-runtime-initial.v1";
const TTL = Object.freeze({ lease: 60000, call: 30000, ticket: 30000, command: 30000, bracket: 30000, observation: 10000 });
const STATES = Object.freeze({ UNPROVISIONED: "UNPROVISIONED", PROVISIONED_NO_PROCESS: "PROVISIONED_NO_PROCESS", RESERVED: "LAUNCH_RESERVED", REGISTERED_CLOSED: "REGISTERED_CLOSED", READ_SESSION_ACTIVE: "READ_SESSION_ACTIVE", DRAINING: "DRAINING", RETIRED_EXIT_PROVEN: "RETIRED_EXIT_PROVEN", UNKNOWN_READBACK_ONLY: "UNKNOWN_READBACK_ONLY" });
const READ_TOOLS = Object.freeze(["get_bridge_status", "get_project_info"]);
const READ_CAPABILITIES = Object.freeze(["BOOTSTRAP_READ", "READ"]);
const LIFECYCLE_CAPABILITIES = Object.freeze(["drain_initial", "shutdown_initial", "abort_unadmitted", "wait_exit"]);
const NAMESPACES = Object.freeze(["initial", "daemon", "panel", "plans", "fixtures", "retained"]);
const EVENT_OUTCOMES = Object.freeze({ caller_ingress: "VERIFIED", caller_enqueue: "VERIFIED", caller_dispatch: "VERIFIED", launch_reserve: "CONSUMED", launch_ack: "ACK", launch_unknown: "UNKNOWN", launch_bound: "BOUND", "enqueue:get_bridge_status": "QUEUED", "enqueue:get_project_info": "QUEUED", dispatch: "DISPATCHED", dispatch_unknown: "UNKNOWN", completion: "COMPLETED", adopt: "READ_ONLY", revoke: "REVOKED", drain: "DRAINING", stop_reserve: "CONSUMED", stop_ack: "ACK", stop_unknown: "UNKNOWN", exit_proven: "EXIT_PROVEN" });
const SHA = /^[a-f0-9]{64}$/;
function fail(code, detail) { throw Object.assign(new Error(code + (detail ? ": " + detail : "")), { code }); }
function exact(value, keys, code = "initial_closed_shape") {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(code);
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => typeof key !== "string" || !keys.includes(key))) fail(code);
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !Object.hasOwn(d, "value") || !d.enumerable) fail(code);
  }
  return value;
}
function list(value, validate, code = "initial_list_invalid") {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1) fail(code);
  for (let i = 0; i < value.length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d || !Object.hasOwn(d, "value") || !d.enumerable) fail(code);
    validate(d.value);
  }
  return value;
}
function id(v) { if (typeof v !== "string" || !v.length || v.length > 200 || v !== v.trim() || /[\u0000-\u001f]/.test(v)) fail("initial_id_invalid"); return v; }
function digest(v) { if (typeof v !== "string" || !SHA.test(v)) fail("initial_hash_invalid"); return v; }
function nullable(v, fn) { if (v !== null) fn(v); return v; }
function integer(v) { if (!Number.isSafeInteger(v) || v < 0) fail("initial_integer_invalid"); return v; }
function bool(v) { if (typeof v !== "boolean") fail("initial_boolean_invalid"); return v; }
function stableJson(v) {
  if (Array.isArray(v)) return "[" + v.map(stableJson).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + stableJson(v[k])).join(",") + "}";
  return JSON.stringify(v);
}
function hash(v) { return crypto.createHash("sha256").update(stableJson(v)).digest("hex"); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function freeze(v) { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; }
function copy(v) { return freeze(clone(v)); }
function projection(value) { return { ...value, scope: SCOPE, productionAuthority: false, replayAllowed: false }; }
function tagged(v, type, keys) {
  exact(v, ["schema", "scope", "productionAuthority", ...keys]);
  if (v.schema !== SCHEMA + "." + type || v.scope !== SCOPE || v.productionAuthority !== false) fail("initial_offline_scope_required");
}
function capabilities(v, allowed, requireAll = false) {
  list(v, c => { if (!allowed.includes(c)) fail("initial_capability_invalid"); });
  if (new Set(v).size !== v.length || (requireAll && (v.length !== allowed.length || allowed.some(c => !v.includes(c))))) fail("initial_capability_invalid");
}
function principal(v) {
  exact(v, ["issuerId", "issuerInstanceId", "subjectId", "chatId", "chatEpoch", "transportBindingHash"]);
  for (const k of ["issuerId", "issuerInstanceId", "subjectId", "chatId"]) id(v[k]);
  integer(v.chatEpoch); digest(v.transportBindingHash); return v;
}
function verifiedCall(v) {
  exact(v, ["principal", "callId", "nonce", "requestHash", "phase", "issuedMonoMs", "expiresMonoMs", "revocationEpoch", "evidenceScope"]);
  principal(v.principal); id(v.callId); id(v.nonce); digest(v.requestHash);
  if (!["ingress", "enqueue", "dispatch"].includes(v.phase) || v.evidenceScope !== SCOPE) fail("initial_call_binding_invalid");
  integer(v.issuedMonoMs); integer(v.expiresMonoMs); integer(v.revocationEpoch);
  if (v.expiresMonoMs <= v.issuedMonoMs || v.expiresMonoMs - v.issuedMonoMs > TTL.call) fail("initial_call_ttl_invalid");
  return v;
}
function scope(v) {
  exact(v, ["machineId", "userId", "canonicalRoot", "physicalRootId", "installationLineage"]);
  Object.values(v).forEach(id); return v;
}
function launchKey(v) { scope(v); return hash({ machineId: v.machineId, userId: v.userId, physicalRootId: v.physicalRootId, installationLineage: v.installationLineage }); }
function anchor(v) {
  tagged(v, "anchor", ["origin", "machineId", "userId", "canonicalRoot", "physicalRootId", "installationLineage", "anchorId", "generation", "launchKey", "sourceHash", "configHash", "installHash", "authorizationHash", "clockBootId", "createdMonoMs"]);
  if (v.origin !== "initial_owned") fail("initial_origin_invalid");
  scope({ machineId: v.machineId, userId: v.userId, canonicalRoot: v.canonicalRoot, physicalRootId: v.physicalRootId, installationLineage: v.installationLineage });
  for (const k of ["anchorId", "generation", "clockBootId"]) id(v[k]);
  for (const k of ["launchKey", "sourceHash", "configHash", "installHash", "authorizationHash"]) digest(v[k]);
  integer(v.createdMonoMs);
  if (v.launchKey !== launchKey({ machineId: v.machineId, userId: v.userId, canonicalRoot: v.canonicalRoot, physicalRootId: v.physicalRootId, installationLineage: v.installationLineage })) fail("initial_launch_key_invalid");
  return v;
}
function authorization(v) {
  tagged(v, "authorization", ["anchorId", "principalHash", "authorizationId", "policyEpoch", "capabilities", "issuedMonoMs", "expiresMonoMs"]);
  id(v.anchorId); id(v.authorizationId); digest(v.principalHash); integer(v.policyEpoch); capabilities(v.capabilities, READ_CAPABILITIES);
  integer(v.issuedMonoMs); integer(v.expiresMonoMs);
  if (v.expiresMonoMs <= v.issuedMonoMs || v.expiresMonoMs - v.issuedMonoMs > TTL.lease) fail("initial_authorization_ttl_invalid"); return v;
}
function kernel(v) {
  exact(v, ["pid", "birthFileTime", "birthUtc", "imagePath", "executableSha256"]);
  integer(v.pid); if (v.pid === 0) fail("initial_kernel_identity_invalid");
  id(v.birthFileTime); id(v.birthUtc); id(v.imagePath); digest(v.executableSha256);
  if (!/^[0-9]+$/.test(v.birthFileTime) || !Number.isFinite(Date.parse(v.birthUtc))) fail("initial_kernel_identity_invalid"); return v;
}
function actor(v) {
  exact(v, ["panelInstanceId", "panelGeneration", "panelLifecycleEpoch"]);
  id(v.panelInstanceId); id(v.panelGeneration); integer(v.panelLifecycleEpoch); return v;
}
function runtime(v) {
  tagged(v, "runtime-witness", ["anchorId", "generation", "bootNonce", "controllerId", "heldWitnessId", "kernelIdentity", "sourceHash", "configHash", "installHash", "registrationHash", "actor", "connected"]);
  for (const k of ["anchorId", "generation", "bootNonce", "controllerId", "heldWitnessId"]) id(v[k]);
  kernel(v.kernelIdentity); for (const k of ["sourceHash", "configHash", "installHash"]) digest(v[k]);
  nullable(v.registrationHash, digest); nullable(v.actor, actor); bool(v.connected);
  if (v.actor === null && v.connected) fail("initial_null_actor_must_be_disconnected"); return v;
}
function runtimeIdentityHash(v) {
  runtime(v); return hash(Object.fromEntries(["anchorId", "generation", "bootNonce", "controllerId", "heldWitnessId", "kernelIdentity", "sourceHash", "configHash", "installHash"].map(k => [k, v[k]])));
}
function grant(v) {
  tagged(v, "lifecycle-grant", ["anchorId", "generation", "controllerId", "preparedGrantId", "preparedBeforeLaunch", "boundWitnessId", "boundRuntimeHash", "capabilities", "validUntil", "retired"]);
  for (const k of ["anchorId", "generation", "controllerId", "preparedGrantId"]) id(v[k]);
  if (v.preparedBeforeLaunch !== true || v.validUntil !== "exact_target_exit_proven") fail("initial_prelaunch_grant_required");
  nullable(v.boundWitnessId, id); nullable(v.boundRuntimeHash, digest);
  if ((v.boundWitnessId === null) !== (v.boundRuntimeHash === null)) fail("initial_grant_partial_binding");
  capabilities(v.capabilities, LIFECYCLE_CAPABILITIES, true); bool(v.retired); return v;
}
function permit(v) {
  tagged(v, "read-permit", ["kind", "permitId", "anchorId", "generation", "principalHash", "policyEpoch", "revocationEpoch", "fenceEpoch", "runtimeHash", "actorHash", "requestHash", "issuedMonoMs", "expiresMonoMs", "executionEntitled"]);
  if (!READ_CAPABILITIES.includes(v.kind) || v.executionEntitled !== false) fail("initial_execution_denied");
  for (const k of ["permitId", "anchorId", "generation"]) id(v[k]);
  for (const k of ["principalHash", "runtimeHash", "actorHash", "requestHash"]) digest(v[k]);
  for (const k of ["policyEpoch", "revocationEpoch", "fenceEpoch", "issuedMonoMs", "expiresMonoMs"]) integer(v[k]);
  if (v.expiresMonoMs <= v.issuedMonoMs || v.expiresMonoMs - v.issuedMonoMs > TTL.ticket) fail("initial_permit_ttl_invalid"); return v;
}
function event(v) {
  tagged(v, "event", ["anchorId", "generation", "sequence", "previousHash", "operationId", "attemptKey", "operation", "outcome", "principalHash", "runtimeHash", "lifecycleGrantHash", "permitHash", "evidenceHash", "clockBootId", "recordedMonoMs", "replayAllowed"]);
  for (const k of ["anchorId", "generation", "operationId", "operation", "outcome", "clockBootId"]) id(v[k]);
  if (!Object.hasOwn(EVENT_OUTCOMES, v.operation) || EVENT_OUTCOMES[v.operation] !== v.outcome) fail("initial_event_operation_outcome_invalid");
  integer(v.sequence); if (v.sequence === 0) fail("initial_event_sequence_invalid");
  digest(v.attemptKey); for (const k of ["previousHash", "principalHash", "runtimeHash", "lifecycleGrantHash", "permitHash", "evidenceHash"]) nullable(v[k], digest);
  integer(v.recordedMonoMs); if (v.replayAllowed !== false) fail("initial_replay_forbidden"); return v;
}
function request(v) {
  exact(v, ["name", "args"], "initial_read_request_invalid");
  if (!READ_TOOLS.includes(v.name)) fail("initial_tool_not_allowed");
  exact(v.args, [], "initial_read_args_empty_required"); return copy(v);
}
function clock(v) { exact(v, ["bootId", "monoMs"]); id(v.bootId); integer(v.monoMs); return v; }
function fence(v) {
  exact(v, ["ownerId", "epoch", "held", "scopeHash"]); id(v.ownerId); integer(v.epoch); digest(v.scopeHash);
  if (v.held !== true) fail("initial_held_fence_required"); return v;
}
function readiness(v) {
  exact(v, ["pendingCommands", "inflightCommands", "activeEditSession", "projectLifecyclePending", "projectLifecycleBlocked", "bootstrapIdle", "nativeExecutionIdle", "unacceptedChildren", "unacceptedJobs"]);
  for (const k of ["pendingCommands", "inflightCommands", "unacceptedChildren", "unacceptedJobs"]) integer(v[k]);
  for (const k of ["activeEditSession", "projectLifecyclePending", "projectLifecycleBlocked", "bootstrapIdle", "nativeExecutionIdle"]) bool(v[k]); return v;
}
function ready(v) { readiness(v); return v.pendingCommands === 0 && v.inflightCommands === 0 && !v.activeEditSession && !v.projectLifecyclePending && !v.projectLifecycleBlocked && v.bootstrapIdle && v.nativeExecutionIdle && v.unacceptedChildren === 0 && v.unacceptedJobs === 0; }
function inventory(v) {
  exact(v, ["complete", "reparse", "entries"]);
  if (v.complete !== true || v.reparse !== false) fail("initial_inventory_untrusted");
  list(v.entries, row => { exact(row, ["namespace", "kind", "ref", "ownerAnchorId", "generation"]); if (!NAMESPACES.includes(row.namespace)) fail("initial_namespace_unknown"); for (const k of ["kind", "ref", "ownerAnchorId", "generation"]) id(row[k]); }); return v;
}
function completion(v) {
  exact(v, ["commandId", "requestHash", "runtimeHash", "actorHash", "receiptHash", "terminal", "resultHash", "observedMonoMs"]);
  id(v.commandId); for (const k of ["requestHash", "runtimeHash", "actorHash", "receiptHash", "resultHash"]) digest(v[k]);
  if (v.terminal !== true) fail("initial_terminal_completion_required"); integer(v.observedMonoMs); return v;
}
function exitProof(v) {
  exact(v, ["heldWitnessId", "kernelIdentity", "runtimeHash", "exited", "observedMonoMs"]);
  id(v.heldWitnessId); kernel(v.kernelIdentity); digest(v.runtimeHash); bool(v.exited); integer(v.observedMonoMs); return v;
}
function lifecycleEvidence(v) {
  exact(v, ["outcome", "grant", "runtime", "positiveHeldTarget", "receiptHash", "exitProof"]);
  if (!["ACK", "UNKNOWN", "PARTIAL", "PENDING", "EXIT_PROVEN"].includes(v.outcome)) fail("initial_lifecycle_outcome_invalid");
  grant(v.grant); nullable(v.runtime, runtime); bool(v.positiveHeldTarget); nullable(v.receiptHash, digest); nullable(v.exitProof, exitProof); return v;
}
module.exports = { SCOPE, SCHEMA, TTL, STATES, READ_TOOLS, READ_CAPABILITIES, LIFECYCLE_CAPABILITIES, NAMESPACES, EVENT_OUTCOMES, fail, exact, list, id, digest, nullable, integer, bool, hash, clone, copy, projection, principal, verifiedCall, scope, launchKey, anchor, authorization, kernel, actor, runtime, runtimeIdentityHash, grant, permit, event, request, clock, fence, readiness, ready, inventory, completion, exitProof, lifecycleEvidence };
