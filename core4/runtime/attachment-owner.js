'use strict';
const { randomBytes } = require('node:crypto');
const { createControllerLease } = require('./controller-lease');

// Private composition seam. No listener, credentials, Broker or state IO here.
// Production embedding must restore durable state before exposing this owner,
// enforce assertCurrent at physical submit/deliver, and report real activity.
const TOOL_METHODS = Object.freeze({ core_status: 'status', core_connect: 'connect', core_disconnect: 'disconnect', core_diagnostics: 'diagnostics', list_modules: 'listModules', get_module_contract: 'getContract', inspect_module_target: 'inspect', build_solution_plan: 'build', propose_plan: 'propose', dry_run_plan: 'dryrun', run_plan: 'run', get_task: 'getTask', reset_task: 'reset', reconcile_task: 'reconcile' });
const CONTROL_METHODS = Object.freeze(['owner_status', 'controller_acquire', 'controller_renew', 'controller_release', 'controller_transfer']);
const OWNER_METHODS = Object.freeze([...Object.keys(TOOL_METHODS), ...CONTROL_METHODS]);
const LEASE_ERRORS = Object.freeze(['controller_busy', 'controller_fenced', 'controller_lease_identity', 'controller_lease_expired', 'controller_draining', 'controller_client_detached', 'controller_clock_fault', 'controller_operation_pending', 'controller_expected', 'controller_transfer_changed', 'controller_not_expired']);
const OWNER_ERRORS = Object.freeze([...LEASE_ERRORS, 'owner_payload', 'owner_recovery_required', 'owner_draining', 'owner_attachment_required', 'owner_lease_token', 'owner_reference_generation', 'owner_attachment_refused', 'owner_closed', 'owner_method', 'owner_controller_required', 'owner_reference_budget', 'owner_observer_physical_access', 'owner_outcome_uncertain', 'owner_unavailable', 'runtime_request_failed']);
const OBSERVERS = new Set(['core_status', 'core_diagnostics', 'list_modules', 'get_module_contract', 'get_task']);

function createAttachmentOwner({ runtime, activity, invoke, clock, ttlMs, drainIntervalMs = 100 } = {}) {
  if (!runtime || typeof runtime.status !== 'function' || typeof activity !== 'function' || typeof invoke !== 'function' || !Number.isSafeInteger(drainIntervalMs) || drainIntervalMs < 1 || drainIntervalMs > 1000) throw new Error('owner_options');
  const lease = createControllerLease({ clock, ttlMs }), sessions = new Map(), accepted = new Set(), timers = new Set(), ownErrors = new WeakSet();
  const refs = { evidence: new Map(), build: new Map(), proposal: new Map(), dryrun: new Map(), task: new Map() };
  let closed = false;
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
  function admitted() { const value = facts(); if (value.fault || value.unresolved) fail('owner_recovery_required'); if (value.pending) fail('owner_draining'); }
  function status() { return { ...lease.status(), closed, activity: facts(), accepted: accepted.size, attachments: sessions.size }; }
  function sessionRecord(session) { const record = sessions.get(session); if (!record) fail('owner_attachment_required'); return record; }
  function token(record, payload) {
    object(payload, ['leaseToken']);
    if (typeof payload.leaseToken !== 'string' || payload.leaseToken !== record.token || !record.grant) fail('owner_lease_token');
  }
  function reference(kind, value, grant) { if (typeof value !== 'string' || refs[kind].get(value) !== grant) fail('owner_reference_generation'); }
  function inputs(method, payload, grant) {
    if (method === 'build_solution_plan') {
      if (payload.taskId !== undefined) reference('task', payload.taskId, grant);
      if (!Array.isArray(payload.steps)) fail('owner_payload');
      for (const step of payload.steps) reference('evidence', step?.evidenceRef, grant);
    }
    if (method === 'propose_plan') reference('build', payload.buildId, grant);
    if (method === 'dry_run_plan' || method === 'run_plan') reference('proposal', payload.proposalId, grant);
    if (method === 'run_plan') reference('dryrun', payload.dryrunRef, grant);
    if (method === 'reset_task' || method === 'reconcile_task') reference('task', payload.taskId, grant);
  }
  function outputs(method, result, grant) {
    const bind = (kind, value) => { if (typeof value === 'string') refs[kind].set(value, grant); };
    if (method === 'inspect_module_target') bind('evidence', result?.evidenceRef);
    if (method === 'build_solution_plan') { bind('build', result?.buildId); bind('task', result?.taskId); }
    if (method === 'propose_plan') bind('proposal', result?.proposalId);
    if (method === 'dry_run_plan') bind('dryrun', result?.dryrunRef);
  }
  function finalize(operation) {
    const value = facts();
    if (value.pending) {
      const timer = setTimeout(() => { timers.delete(timer); finalize(operation); }, drainIntervalMs);
      timers.add(timer); return;
    }
    lease.complete(operation, value.unresolved || value.fault ? 'unknown' : 'settled'); accepted.delete(operation);
  }
  function onAttach(session) {
    if (closed || sessions.size >= 32 || !session || typeof session !== 'object' || sessions.has(session)) fail('owner_attachment_refused');
    sessions.set(session, { attachment: lease.attach(), grant: null, token: null });
  }
  function onDetach(session) {
    const record = sessions.get(session); if (!record) return;
    lease.detach(record.attachment); sessions.delete(session);
  }
  async function dispatch({ session, method, payload }) {
    if (closed) fail('owner_closed');
    const record = sessionRecord(session);
    if (!OWNER_METHODS.includes(method)) fail('owner_method');
    if (!payload || Object.getPrototypeOf(payload) !== Object.prototype) fail('owner_payload');
    if (method === 'owner_status') { object(payload, []); return status(); }
    if (method === 'controller_acquire') {
      object(payload, []); admitted(); record.grant = lease.acquire(record.attachment); record.token = randomBytes(32).toString('hex');
      for (const values of Object.values(refs)) values.clear();
      return { leaseToken: record.token, bootId: record.grant.bootId, generation: record.grant.generation };
    }
    if (method === 'controller_transfer') {
      object(payload, ['expected']); admitted();
      record.grant = lease.transferExpired(record.attachment, payload.expected); record.token = randomBytes(32).toString('hex');
      for (const values of Object.values(refs)) values.clear();
      return { leaseToken: record.token, bootId: record.grant.bootId, generation: record.grant.generation };
    }
    if (method === 'controller_renew') { token(record, payload); lease.renew(record.grant); return { renewed: true }; }
    if (method === 'controller_release') {
      token(record, payload); admitted(); lease.release(record.grant); record.grant = null; record.token = null; return { released: true };
    }
    const stateful = !OBSERVERS.has(method) || method === 'list_modules' && payload.refresh !== undefined && payload.refresh !== false;
    if (!stateful) {
      const value = await invoke(TOOL_METHODS[method], payload, { observer: true, assertCurrent() { fail('owner_observer_physical_access'); } });
      return method === 'core_status' || method === 'core_diagnostics' ? { ...value, attachmentOwner: status() } : value;
    }
    admitted();
    if (!record.grant) fail('owner_controller_required');
    if (Object.values(refs).some(values => values.size >= 4096)) fail('owner_reference_budget');
    lease.assertCurrent(record.grant); inputs(method, payload, record.grant);
    const grant = record.grant, operation = lease.begin(grant); accepted.add(operation);
    const context = { observer: false, generation: grant.generation, assertCurrent() { if (closed) fail('owner_closed'); lease.assertCurrent(grant); } };
    try {
      let result;
      try { result = await invoke(TOOL_METHODS[method], payload, context); }
      catch { fail('owner_outcome_uncertain'); }
      const value = facts();
      if (value.pending || value.unresolved || value.fault) fail('owner_outcome_uncertain');
      outputs(method, result, grant); return result;
    }
    finally { finalize(operation); }
  }
  async function onRequest(request) {
    try { return { ok: true, value: await dispatch(request) }; }
    catch (error) {
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
  return Object.freeze({ onAttach, onDetach, onRequest, status, close, bootId: lease.status().bootId });
}
module.exports = { createAttachmentOwner, TOOL_METHODS, OWNER_METHODS, OWNER_ERRORS };
