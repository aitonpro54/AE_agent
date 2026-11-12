# 04-authority-attachment

Выбранные точные исходники; вне обозначенных диапазонов контекст не включён.

## `core4/core/authority.js:1–59`
Полный файл SHA256 (hex groups, concatenate) `2ac5bd1f:d69a0c9a:98e271dd:bf2ab775:9293d1a7:2cda5e73:232e5d1d:27cbb04e`; Git blob `dd1ef3b9:ac79498b:3ebd2b95:f075b979:9175597c`. Выдержка: строки 1–59, 4772 bytes.

```javascript
'use strict';
// Private, synthetic-only embedding seam. No production lifecycle source or issuer.
const { fail, exact, id } = require('../protocol/json');
const ports = new WeakSet();
const executionPolicies = new WeakSet();
const reservations = new WeakSet();
const lifecycles = new WeakMap();
const transitions = new Set(['project_new', 'project_open', 'project_revert', 'project_replacement']);
function createLifecycleSource(options) {
  exact(options, ['sourceId', 'sourceEpoch', 'synthetic']);
  if (options.synthetic !== true || typeof options.sourceId !== 'string' || !options.sourceId || typeof options.sourceEpoch !== 'string' || !options.sourceEpoch) fail('explicit_synthetic_lifecycle_required');
  const sourceId = options.sourceId, epochs = new Set([options.sourceEpoch]), listeners = new Set();
  let sourceEpoch = options.sourceEpoch, sequence = 0, generation = 0, state = 'unavailable', reason = 'project_transition_required', sessionId, binding;
  const snapshot = () => Object.freeze({ state, sourceId, sourceEpoch, sequence, ...(reason ? { reason } : {}), ...(sessionId ? { sessionId } : {}), ...(binding ? { binding } : {}) });
  function invalidate(nextState, nextReason) {
    generation++; binding = undefined; state = nextState; reason = nextReason;
    for (const listener of listeners) listener();
  }
  function lose(cause = 'source_lost') { invalidate('lost', typeof cause === 'string' && cause ? cause : 'source_lost'); return snapshot(); }
  return Object.freeze({ synthetic: true, snapshot, lose,
    subscribe(listener) { if (typeof listener !== 'function') fail('lifecycle_listener'); listeners.add(listener); return () => listeners.delete(listener); },
    restart(value) {
      try { exact(value, ['sourceEpoch']); } catch (error) { lose('source_restart_malformed'); throw error; }
      if (typeof value.sourceEpoch !== 'string' || !value.sourceEpoch || epochs.has(value.sourceEpoch)) { lose('source_epoch_reused'); fail('new_source_epoch_required'); }
      epochs.add(value.sourceEpoch); sourceEpoch = value.sourceEpoch; sequence = 0; sessionId = undefined;
      invalidate('unavailable', 'project_transition_required'); return snapshot();
    },
    apply(event) {
      if (state === 'lost') return snapshot();
      try {
        exact(event, ['sourceId', 'sourceEpoch', 'sequence', 'type', 'projectId']);
        if (event.sourceId !== sourceId || event.sourceEpoch !== sourceEpoch || !Number.isSafeInteger(event.sequence) || event.sequence !== sequence + 1 || !transitions.has(event.type)) return lose('event_continuity_lost');
        if (event.projectId !== undefined && (typeof event.projectId !== 'string' || !event.projectId || event.projectId.length > 8192)) return lose('event_malformed');
        sequence = event.sequence; sessionId = id('synthetic-project');
        invalidate(event.projectId ? 'current' : 'unavailable', event.projectId ? undefined : 'saved_project_required');
        if (state === 'current') {
          binding = Object.freeze({ kind: 'project-incarnation', lifecycleVerified: true, sessionId, projectId: event.projectId, sourceId, sourceEpoch, sequence, provenance: 'synthetic-event-source-only' });
          const currentBinding = binding, currentGeneration = generation;
          lifecycles.set(binding, { current: () => state === 'current' && binding === currentBinding && generation === currentGeneration });
        }
        return snapshot();
      } catch { return lose('event_malformed'); }
    }
  });
}
function validateLifecycleBinding(binding) { return !!binding && lifecycles.get(binding)?.current() === true; }
function brandAuthorityPort(port) {
  if (!port || typeof port.authorize !== 'function' || typeof port.registerProposal !== 'function') fail('authority_port');
  ports.add(port); return port;
}
function validatePort(port) { if (!ports.has(port)) fail('untrusted_authority_port'); return port; }
function brandExecutionPolicyPort(port) {
  if (!port || ['describe', 'assertCurrent', 'prepareReservation', 'assertReservation', 'cancelBeforeSend', 'verifyCompletion'].some(k => typeof port[k] !== 'function')) fail('execution_policy_port');
  executionPolicies.add(port); return port;
}
function validateExecutionPolicyPort(port) { if (!executionPolicies.has(port)) fail('untrusted_execution_policy_port'); return port; }
function brandReservationHandle(value) { reservations.add(value); return Object.freeze(value); }
function validateReservationHandle(value) { if (!value || !reservations.has(value)) fail('untrusted_reservation_handle'); return value; }
module.exports = { brandAuthorityPort, validatePort, createLifecycleSource, validateLifecycleBinding, brandExecutionPolicyPort, validateExecutionPolicyPort, brandReservationHandle, validateReservationHandle };
```

## `core4/runtime/attachment-owner.js:59–100`
Полный файл SHA256 (hex groups, concatenate) `ee66a3b8:48143aed:defa8651:fc5c63a9:f4cf124d:15229be0:647b57d4:0317e875`; Git blob `c4cc57f7:b8cca431:f709fa2a:924c00c4:90591624`. Выдержка: строки 59–100, 3925 bytes.

```javascript
function createAttachmentOwner({ startupGate = () => ({ pending: false, unresolved: false }), runtime, activity, invoke, consumeReadRejection = () => null, isFreshDryrunRefusal = () => false,
  consumeMediaDuplicateBuildRefusal = () => false, canResumeTask = () => false, renderJobs = false, workSession = () => ({ sessionId: null, baselineRequired: false, resetPending: false }), clock, ttlMs, drainIntervalMs = 100 } = {}) {
  if (!runtime || typeof runtime.status !== 'function' || typeof activity !== 'function' || typeof invoke !== 'function' || typeof workSession !== 'function' || !Number.isSafeInteger(drainIntervalMs) || drainIntervalMs < 1 || drainIntervalMs > 1000) throw new Error('owner_options');
  const lease = createControllerLease({ clock, ttlMs }), sessions = new Map(), accepted = new Set(), timers = new Set(), ownErrors = new WeakSet();
  const rejectedReads = new WeakSet();
  const physicalReadErrors = new WeakMap();
  const methods = ownerMethods(renderJobs), toolMethods = renderJobs ? { ...TOOL_METHODS, ...RENDER_JOB_METHODS } : TOOL_METHODS;
  const refs = { evidence: new Map(), build: new Map(), proposal: new Map(), dryrun: new Map(), task: new Map() };
  let closed = false, frozen = false;
  function fail(code) { const e = new Error(code); ownErrors.add(e); e.code = code; throw e; }
  function object(value, keys) {
    if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).some(k => !keys.includes(k))) fail('owner_payload');
  }
  function facts() {
    try {
      const value = activity();
      if (!value || ['pending', 'unresolved', 'fault'].some(k => typeof value[k] !== 'boolean')) throw new Error('unobserved');
      return { pending: value.pending, unresolved: value.unresolved, fault: value.fault };
    } catch { return { pending: true, unresolved: true, fault: true }; }
  }
  function workFacts() {
    let value; try { value = workSession(); } catch { fail('owner_work_session_unavailable'); }
    if (!value || value.sessionId !== null && (typeof value.sessionId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.sessionId)) || typeof value.baselineRequired !== 'boolean' || typeof value.resetPending !== 'boolean' || value.sessionId === null && value.baselineRequired && !value.resetPending) fail('owner_work_session_unavailable');
    return { sessionId: value.sessionId, baselineRequired: value.baselineRequired, resetPending: value.resetPending };
  }
  function admitted() { if (frozen || workFacts().resetPending) fail('owner_draining'); const value = facts(); if (value.fault || value.unresolved) fail('owner_recovery_required'); if (value.pending) fail('owner_draining'); }
  function status() { return { ...lease.status(), closed, frozen, activity: facts(), accepted: accepted.size, attachments: sessions.size, workSession: workFacts() }; }
  function acknowledge(payload) {
    const value = workFacts();
    if (value.sessionId !== null && payload.sessionId === undefined) fail('owner_work_session_required');
    if ((payload.sessionId ?? null) !== value.sessionId) fail('owner_work_session_changed'); return value.sessionId;
  }
  function currentWork(record) {
    const value = workFacts(); if (value.resetPending) fail('owner_draining'); if (record.sessionId !== value.sessionId) fail('owner_work_session_changed'); return value;
  }
  function sessionRecord(session) { const record = sessions.get(session); if (!record) fail('owner_attachment_required'); return record; }
  function token(record, payload) {
    object(payload, ['leaseToken']);
    if (typeof payload.leaseToken !== 'string' || payload.leaseToken !== record.token || !record.grant) fail('owner_lease_token');
  }
  function reference(kind, value, grant) { if (typeof value !== 'string' || refs[kind].get(value) !== grant) fail('owner_reference_generation'); }
  function inputs(method, payload, grant) {
```

## `core4/runtime/attachment-owner.js:195–224`
Полный файл SHA256 (hex groups, concatenate) `ee66a3b8:48143aed:defa8651:fc5c63a9:f4cf124d:15229be0:647b57d4:0317e875`; Git blob `c4cc57f7:b8cca431:f709fa2a:924c00c4:90591624`. Выдержка: строки 195–224, 1721 bytes.

```javascript
        }
        fail('owner_outcome_uncertain');
      }
      const value = facts();
      if (value.pending || value.unresolved || value.fault) fail('owner_outcome_uncertain');
      outputs(method, result, grant); return result;
    }
    finally { finalize(operation); }
  }
  async function onRequest(request) {
    try { return { ok: true, value: fitTaskResult(request.method, await dispatch(request)) }; }
    catch (error) {
      const physical = physicalReadErrors.get(error);
      if (physical) return { ok: false, ...physical, ...(physical.outcome === 'unknown' ? { requestId: request.requestId || null } : {}) };
      if (rejectedReads.has(error)) return { ok: false, outcome: 'rejected', code: error.code, nextAction: 'core_diagnostics' };
      // Only our own errors and the fixed private lease vocabulary cross IPC.
      const code = ownErrors.has(error) || LEASE_ERRORS.includes(error?.code) ? error.code : 'runtime_request_failed';
      return code === 'owner_outcome_uncertain' ? { ok: false, code, outcome: 'unknown', requestId: request.requestId || null } : { ok: false, code };
    }
  }
  async function close() {
    if (closed) return;
    if (accepted.size || facts().pending) fail('owner_draining');
    closed = true; for (const session of sessions.keys()) onDetach(session);
    for (const timer of timers) clearTimeout(timer);
    await runtime.close();
  }
  return Object.freeze({ onAttach, onDetach, onRequest, status, close, freeze() { frozen = true; }, bootId: lease.status().bootId });
}
module.exports = { createAttachmentOwner, TOOL_METHODS, OWNER_METHODS, RENDER_JOB_METHODS, ownerMethods, OWNER_ERRORS, READ_REJECTION_CODES, PRE_DISPATCH_READ_CODES, classifyPhysicalRead };
```
