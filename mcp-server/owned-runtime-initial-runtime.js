"use strict";

// Routing locators are not authority. The current native broker cannot issue
// production call/READ/execution grants, so this facade has no effect ports.
// Use initial_owned consistently with the reviewed local-session contract.
const SCHEMA = "ae-agent.owned-runtime-initial-runtime.closed.v1";
const ORIGIN = "initial_owned";
const LOCATOR_KEYS = Object.freeze([
  "AE_AGENT_LOCAL_SESSION_PIPE", "AE_AGENT_LOCAL_SESSION_NONCE",
  "AE_AGENT_LOCAL_SESSION_GENERATION", "AE_AGENT_LOCAL_SESSION_BOOT"
]);
const instances = new WeakSet();
const NONCE = /^[0-9a-f]{32}$/;
const PIPE = /^\\\\\.\\pipe\\AEAgent\.LocalSession\.[0-9a-f]{64}\.daemon\.[0-9a-f]{32}$/;
function fail(code) { throw Object.assign(Error(code), { code }); }
function empty(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Reflect.ownKeys(value).length) {
    fail("owned_initial_arguments_empty_required");
  }
}

// Pure classification only. No locator, policy or receipt is exposed in status.
// Absence of every reserved initial locator preserves the existing default.
function inspectLocatorEnvironment(env) {
  const keys = Object.keys(env).filter(key => /^AE_AGENT_LOCAL_SESSION_/i.test(key));
  if (!keys.length) return Object.freeze({ requested: false, code: null });
  let code = "owned_initial_native_protocol_unavailable";
  if (Object.keys(env).some(key => /^AE_OWNED_RUNTIME_/i.test(key))) code = "owned_initial_mixed_origin_refused";
  else if (keys.some(key => !LOCATOR_KEYS.includes(key))) code = "owned_initial_locator_invalid";
  else if (LOCATOR_KEYS.some(key => !Object.hasOwn(env, key))) code = "owned_initial_locator_incomplete";
  else if (typeof env[LOCATOR_KEYS[0]] !== "string" || !PIPE.test(env[LOCATOR_KEYS[0]]) || LOCATOR_KEYS.slice(1).some(key =>
    typeof env[key] !== "string" || !NONCE.test(env[key])) ||
    env[LOCATOR_KEYS[0]].slice(-32) !== env.AE_AGENT_LOCAL_SESSION_NONCE) code = "owned_initial_locator_invalid";
  return Object.freeze({ requested: true, code });
}

// No injected snapshots, JSON handshake, env boolean or offline verifier can
// supply a production port. A future reviewed native protocol must replace this
// CLOSED implementation, rather than enable it through a public factory option.
function createInitialRuntime() {
  if (arguments.length) fail("owned_initial_private_factory_arguments_forbidden");
  const selected = inspectLocatorEnvironment(process.env);
  if (!selected.requested) return null;
  let revoked = false;
  function status() {
    return Object.freeze({ ok: false, schema: SCHEMA, origin: ORIGIN,
      authorityMode: "local_controller_session", genuineChatIdentity: false,
      status: "CLOSED", code: revoked ? "owned_initial_controller_closed" : selected.code,
      owned: false, available: false, productionAuthority: false,
      writeAdmission: "closed", executionEntitled: false, replayAllowed: false });
  }
  function assertClosed() { fail(status().code); }
  async function operation(args) { empty(args); return status(); }
  function readStatus(args) { empty(args); return status(); }
  async function revoke() { revoked = true; return status(); }
  const runtime = Object.freeze({ status, readStatus, ensure: operation, restart: operation,
    shutdown: operation, revoke, assertStartup: assertClosed,
    assertIngress: assertClosed, assertTool: assertClosed,
    assertCommand: assertClosed, assertDispatch: assertClosed,
    readiness: () => Object.freeze({ ready: false, productionAuthority: false, status: "CLOSED" }) });
  instances.add(runtime);
  return runtime;
}
function assertInitialRuntime(runtime) {
  if (!instances.has(runtime)) fail("owned_initial_private_runtime_required");
  return runtime;
}
module.exports = { SCHEMA, ORIGIN, LOCATOR_KEYS, inspectLocatorEnvironment, createInitialRuntime, assertInitialRuntime };
