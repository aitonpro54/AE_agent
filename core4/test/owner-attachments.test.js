'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const { createAttachmentOwner, TOOL_METHODS } = require('../runtime/attachment-owner');
const { serveAttachment } = require('../runtime/client-stdio');
const { TOOL_METHODS: ORIGINAL_METHODS } = require('../core/stdio');
const inspection = { moduleId: 'fixture-module', contractId: 'a'.repeat(64), target: {} };

function fixture(options = {}) {
  const calls = [], facts = { pending: false, unresolved: false, fault: false }; let closes = 0, time = 0, serial = 0;
  const runtime = { status: () => ({ ready: true, store: 'fixture-single-store' }), close() { closes++; return options.close?.(); } };
  const owner = createAttachmentOwner({ runtime, activity: () => ({ ...facts }), clock: () => time, ttlMs: 1000, drainIntervalMs: 1,
    renderJobs: options.renderJobs,
    consumeReadRejection: options.consumeReadRejection,
    consumeMediaDuplicateBuildRefusal: options.consumeMediaDuplicateBuildRefusal,
    async invoke(method, payload, context) {
      calls.push({ method, payload, context });
      if (options.invoke) return options.invoke(method, payload, context);
      if (method === 'status' || method === 'diagnostics') return runtime.status();
      if (method === 'inspect') return { evidenceRef: 'evidence-' + ++serial };
      if (method === 'build') return { buildId: 'build-' + ++serial, taskId: 'task-' + serial };
      if (method === 'propose') return { proposalId: 'proposal-' + ++serial };
      if (method === 'dryrun') return { dryrunRef: 'dryrun-' + ++serial };
      return { completed: true };
    } });
  function attach() { const session = Object.freeze({ clientSessionId: 'session-' + ++serial }); owner.onAttach(session); return session; }
  const call = (session, method, payload = {}) => owner.onRequest({ session, method, payload });
  return { owner, facts, calls, attach, call, at(value) { time = value; }, get closes() { return closes; } };
}
async function ok(promise) { const reply = await promise; assert.equal(reply.ok, true, JSON.stringify(reply)); return reply.value; }
async function denied(promise, code) { const reply = await promise; assert.deepEqual(reply, code === 'owner_outcome_uncertain' ? { ok: false, code, outcome: 'unknown', requestId: null } : { ok: false, code }); }
async function until(fn) { for (let i = 0; i < 100; i++) { if (fn()) return; await new Promise(resolve => setTimeout(resolve, 2)); } assert.fail('fixture_wait'); }

for (const rejected of [false, true]) test('owner-attachments A1 concurrent close shares deferred cleanup ' + (rejected ? 'rejection' : 'success'), async () => {
  let resolve, reject;
  const cleanup = new Promise((yes, no) => { resolve = yes; reject = no; });
  const f = fixture({ close: () => cleanup }), session = f.attach(), error = new Error('fixture_cleanup_failed');
  const settled = [], first = f.owner.close(), second = f.owner.close();
  const outcomes = Promise.allSettled([first, second]);
  first.then(() => settled.push('first'), () => settled.push('first'));
  second.then(() => settled.push('second'), () => settled.push('second'));
  assert.equal(f.owner.status().closed, true);
  assert.throws(f.attach, /owner_attachment_refused/);
  await denied(f.call(session, 'core_status'), 'owner_closed');
  await until(() => f.closes === 1);
  await new Promise(done => setImmediate(done));
  assert.deepEqual(settled, []);
  assert.equal(f.owner.status().attachments, 0);
  if (rejected) reject(error); else resolve();
  const results = await outcomes;
  for (const result of results) {
    assert.equal(result.status, rejected ? 'rejected' : 'fulfilled');
    if (rejected) assert.equal(result.reason, error);
  }
  if (rejected) await assert.rejects(f.owner.close(), value => value === error); else await f.owner.close();
  assert.equal(f.closes, 1);
});

test('owner-attachments A1 synchronous cleanup failure stays rejected on repeated close', async () => {
  const error = new Error('fixture_sync_cleanup_failed'), f = fixture({ close() { throw error; } });
  const results = await Promise.allSettled([f.owner.close(), f.owner.close()]);
  assert.ok(results.every(result => result.status === 'rejected' && result.reason === error));
  await assert.rejects(f.owner.close(), value => value === error);
  assert.equal(f.closes, 1); assert.equal(f.owner.status().closed, true);
});

test('owner-attachments A1 draining refusal leaves a later close admissible', async () => {
  const f = fixture(), session = f.attach(); f.facts.pending = true;
  await assert.rejects(f.owner.close(), error => error.code === 'owner_draining');
  assert.equal(f.owner.status().closed, false); assert.equal(f.closes, 0);
  await ok(f.call(session, 'owner_status'));
  f.facts.pending = false;
  await Promise.all([f.owner.close(), f.owner.close()]);
  assert.equal(f.closes, 1); assert.equal(f.owner.status().closed, true);
});

test('owner-attachments inspection contract shape is rejected before runtime acceptance and leaves the lease usable', async () => {
  const f = fixture(), a = f.attach(), grant = await ok(f.call(a, 'controller_acquire'));
  for (const contractId of [undefined, null, '', 42, {}, [], 'a'.repeat(63), 'G'.repeat(64)]) {
    const payload = { ...inspection, contractId }; if (contractId === undefined) delete payload.contractId;
    await denied(f.call(a, 'inspect_module_target', payload), 'owner_inspection_contract_required');
    assert.equal(f.calls.length, 0); assert.equal(f.owner.status().accepted, 0); assert.equal(f.owner.status().mode, 'held');
  }
  assert.match((await ok(f.call(a, 'inspect_module_target', inspection))).evidenceRef, /^evidence-/);
  assert.equal(f.calls.length, 1); await ok(f.call(a, 'controller_release', { leaseToken: grant.leaseToken })); await f.owner.close();
});

test('owner-attachments inspection contract validation preserves control gates and never trusts a runtime error with the same code', async () => {
  const f = fixture(), a = f.attach(); await denied(f.call(a, 'inspect_module_target'), 'owner_controller_required');
  await ok(f.call(a, 'controller_acquire'));
  for (const field of ['pending', 'unresolved', 'fault']) {
    f.facts[field] = true; await denied(f.call(a, 'inspect_module_target'), field === 'pending' ? 'owner_draining' : 'owner_recovery_required'); f.facts[field] = false;
  }
  f.at(1000); await denied(f.call(a, 'inspect_module_target'), 'controller_lease_expired'); assert.equal(f.calls.length, 0); await f.owner.close();
  const forged = fixture({ invoke() { throw Object.assign(new Error('private'), { code: 'owner_inspection_contract_required' }); } }), b = forged.attach();
  await ok(forged.call(b, 'controller_acquire')); await denied(forged.call(b, 'inspect_module_target', inspection), 'owner_outcome_uncertain'); await forged.owner.close();
});

test('owner-attachments generic tool map remains compatible and observer attachment never acquires', async () => {
  assert.deepEqual(TOOL_METHODS, { core_ensure_ae_panel: 'ensureAePanel', core_ae_panel_startup_status: 'aePanelStartupStatus', ...ORIGINAL_METHODS });
  const f = fixture(), a = f.attach(), b = f.attach();
  const one = await ok(f.call(a, 'core_status')), two = await ok(f.call(b, 'core_status'));
  assert.equal(one.attachmentOwner.bootId, two.attachmentOwner.bootId); assert.equal(one.store, two.store);
  assert.equal(f.owner.status().mode, 'idle'); assert.equal(f.owner.status().generation, 0);
  await denied(f.call(a, 'core_connect'), 'owner_controller_required'); await f.owner.close();
});
test('owner-attachments render jobs are opt-in and only status is observable without a lease', async () => {
  const disabled = fixture(), ordinary = disabled.attach();
  await denied(disabled.call(ordinary, 'render_job_status', { id: 'job' }), 'owner_method');
  await disabled.owner.close();
  const enabled = fixture({ renderJobs: true }), operator = enabled.attach(), observer = enabled.attach();
  await ok(enabled.call(observer, 'render_job_status', { id: 'job' }));
  assert.equal(enabled.calls[0].method, 'renderJobStatus');
  assert.equal(enabled.calls[0].context.observer, true);
  for (const method of ['prepare', 'start', 'reconcile', 'finalize', 'cancel'])
    await denied(enabled.call(observer, 'render_job_' + method), 'owner_controller_required');
  const grant = await ok(enabled.call(operator, 'controller_acquire'));
  await ok(enabled.call(operator, 'render_job_start', { id: 'job' }));
  assert.equal(enabled.calls[1].method, 'renderJobStart');
  assert.equal(enabled.calls[1].context.observer, false);
  await ok(enabled.call(operator, 'controller_release', { leaseToken: grant.leaseToken }));
  await enabled.owner.close();
});
test('owner-attachments first workflow build omits taskId and binds only the server task; unbound product task is refused before invoke', async () => {
  const f = fixture(), session = f.attach(); await ok(f.call(session, 'controller_acquire'));
  const evidence = await ok(f.call(session, 'inspect_module_target', inspection));
  const payload = { workflowId: 'titles-deterministic-job', oneStep: true, recordContext: { purpose: 'user_work', lifetime: 'work_context', contextId: 'product-job' }, steps: [{ stepId: 'set-title', evidenceRef: evidence.evidenceRef }] };
  const built = await ok(f.call(session, 'build_solution_plan', payload)); assert.match(built.taskId, /^task-/);
  const calls = f.calls.length; await denied(f.call(session, 'build_solution_plan', { ...payload, taskId: 'titles-unbound-task' }), 'owner_reference_generation'); assert.equal(f.calls.length, calls);
  await ok(f.call(session, 'build_solution_plan', { ...payload, taskId: built.taskId })); assert.equal(f.calls.length, calls + 1); await f.owner.close();
});
test('owner-attachments copied sessions and unlisted RPC cannot reach runtime', async () => {
  const f = fixture(), a = f.attach();
  await denied(f.call({ ...a }, 'core_status'), 'owner_attachment_required');
  await denied(f.call(a, 'eval_script', { source: 'evil' }), 'owner_method'); assert.equal(f.calls.length, 0); await f.owner.close();
});
test('owner-attachments refresh requires control while default discovery stays observer', async () => {
  const f = fixture(), a = f.attach();
  await ok(f.call(a, 'list_modules')); await ok(f.call(a, 'list_modules', { refresh: false }));
  await denied(f.call(a, 'list_modules', { refresh: true }), 'owner_controller_required');
  await ok(f.call(a, 'controller_acquire')); await ok(f.call(a, 'list_modules', { refresh: true })); await f.owner.close();
});
test('owner-attachments explicit acquisition excludes other clients and exact token governs release', async () => {
  const f = fixture(), a = f.attach(), b = f.attach(), first = await ok(f.call(a, 'controller_acquire'));
  await denied(f.call(b, 'controller_acquire'), 'controller_busy');
  await denied(f.call(b, 'controller_release', { leaseToken: first.leaseToken }), 'owner_lease_token');
  await denied(f.call(a, 'controller_release', { leaseToken: 'wrong' }), 'owner_lease_token');
  await ok(f.call(a, 'controller_release', { leaseToken: first.leaseToken }));
  const second = await ok(f.call(b, 'controller_acquire')); assert.equal(second.generation, first.generation + 1); await f.owner.close();
});
test('owner-attachments boot durable fault or unresolved forbids acquisition while status remains readable', async () => {
  for (const field of ['unresolved', 'fault']) {
    const f = fixture(), a = f.attach(); f.facts[field] = true;
    await denied(f.call(a, 'controller_acquire'), 'owner_recovery_required');
    assert.equal((await ok(f.call(a, 'owner_status'))).activity[field], true);
    f.facts[field] = false; await f.owner.close();
  }
});
test('owner-attachments expired controller cannot execute or renew and does not transfer itself', async () => {
  const f = fixture(), a = f.attach(), b = f.attach(), lease = await ok(f.call(a, 'controller_acquire')); f.at(1000);
  await denied(f.call(a, 'core_connect'), 'controller_lease_expired');
  await denied(f.call(a, 'controller_renew', { leaseToken: lease.leaseToken }), 'controller_lease_expired');
  await denied(f.call(b, 'controller_acquire'), 'controller_busy'); f.owner.onDetach(a);
  await ok(f.call(b, 'controller_acquire')); await f.owner.close();
});
test('owner-attachments detached client cannot continue physical send after awaited preparation', async () => {
  let resume; const wait = new Promise(resolve => { resume = resolve; }); let evaluations = 0;
  const f = fixture({ async invoke(_method, _payload, context) { await wait; context.assertCurrent(); evaluations++; return {}; } });
  const a = f.attach(), b = f.attach(); await ok(f.call(a, 'controller_acquire'));
  const request = f.call(a, 'core_connect'); f.owner.onDetach(a);
  await denied(f.call(b, 'controller_acquire'), 'controller_busy'); resume();
  await denied(request, 'owner_outcome_uncertain'); assert.equal(evaluations, 0);
  await ok(f.call(b, 'controller_acquire')); await f.owner.close();
});
test('owner-attachments caller completion does not release accepted physical/control pending', async () => {
  const f = fixture(), a = f.attach(), b = f.attach(); await ok(f.call(a, 'controller_acquire'));
  f.facts.pending = false; const call = f.call(a, 'core_connect'); f.facts.pending = true;
  await denied(call, 'owner_outcome_uncertain'); f.owner.onDetach(a);
  assert.equal(f.owner.status().accepted, 1); assert.equal(f.owner.status().mode, 'draining');
  await assert.rejects(f.owner.close(), /owner_draining/); assert.equal(f.closes, 0);
  await denied(f.call(b, 'controller_acquire'), 'owner_draining'); f.facts.pending = false;
  await until(() => f.owner.status().accepted === 0); await ok(f.call(b, 'controller_acquire')); await f.owner.close();
});
test('owner-attachments UNKNOWN after original callback holds sticky fence across detach', async () => {
  const f = fixture(), a = f.attach(), b = f.attach(); const lease = await ok(f.call(a, 'controller_acquire'));
  const request = f.call(a, 'core_connect'); f.facts.unresolved = true; await denied(request, 'owner_outcome_uncertain');
  assert.equal(f.owner.status().fenced, true); f.owner.onDetach(a); f.facts.unresolved = false;
  await denied(f.call(b, 'controller_acquire'), 'controller_fenced');
  await denied(f.call(b, 'controller_release', { leaseToken: lease.leaseToken }), 'owner_lease_token'); await f.owner.close();
});
test('owner-attachments prior generation evidence/build/proposal/dryrun cannot become executable', async () => {
  const f = fixture(), a = f.attach(), b = f.attach(); const lease = await ok(f.call(a, 'controller_acquire'));
  const evidence = await ok(f.call(a, 'inspect_module_target', inspection));
  const built = await ok(f.call(a, 'build_solution_plan', { steps: [{ evidenceRef: evidence.evidenceRef }] }));
  const proposed = await ok(f.call(a, 'propose_plan', { buildId: built.buildId }));
  const dry = await ok(f.call(a, 'dry_run_plan', { proposalId: proposed.proposalId }));
  await ok(f.call(a, 'controller_release', { leaseToken: lease.leaseToken })); await ok(f.call(b, 'controller_acquire'));
  await denied(f.call(b, 'build_solution_plan', { steps: [{ evidenceRef: evidence.evidenceRef }] }), 'owner_reference_generation');
  await denied(f.call(b, 'propose_plan', { buildId: built.buildId }), 'owner_reference_generation');
  await denied(f.call(b, 'run_plan', { proposalId: proposed.proposalId, dryrunRef: dry.dryrunRef }), 'owner_reference_generation');
  await denied(f.call(b, 'reset_task', { taskId: built.taskId }), 'owner_reference_generation'); await f.owner.close();
});
test('owner-attachments runtime secret messages and arbitrary error codes do not cross attachment', async () => {
  const f = fixture({ invoke() { throw Object.assign(new Error('secret-fixture-value'), { code: 'secret-fixture-value' }); } }), a = f.attach();
  await denied(f.call(a, 'core_status'), 'runtime_request_failed'); await f.owner.close();
});
test('owner-attachments duplicate build refusal requires private proof and clean facts', async () => {
  for (const mode of ['forged', 'fault', 'wrong-method']) {
    const error = Object.assign(new Error('private detail'), { code: 'media_already_imported' });
    let consumed = 0, f;
    f = fixture({
      invoke(method) {
        if (method === 'inspect') return { evidenceRef: 'evidence-duplicate' };
        if (mode === 'fault') f.facts.fault = true;
        throw error;
      },
      consumeMediaDuplicateBuildRefusal(value) {
        consumed++;
        return mode !== 'forged' && value === error;
      }
    });
    const a = f.attach();
    await ok(f.call(a, 'controller_acquire'));
    const { evidenceRef } = await ok(f.call(a, 'inspect_module_target', inspection));
    const method = mode === 'wrong-method' ? 'core_connect' : 'build_solution_plan';
    await denied(f.call(a, method, mode === 'wrong-method' ? {} : { steps: [{ evidenceRef }] }), 'owner_outcome_uncertain');
    assert.equal(consumed, mode === 'wrong-method' ? 0 : 1);
    f.facts.fault = false;
    await f.owner.close();
  }
});
test('owner-attachments observer context cannot be used for physical access', async () => {
  const f = fixture({ invoke(_method, _payload, context) { context.assertCurrent(); } }), a = f.attach();
  await denied(f.call(a, 'get_module_contract'), 'owner_observer_physical_access'); await f.owner.close();
});
test('owner-attachments accepted stateful throw reports uncertainty but preserves actual clean outcome facts', async () => {
  let effects = 0;
  const f = fixture({ invoke() { effects++; throw new Error('secret_fixture_value'); } }), a = f.attach();
  await ok(f.call(a, 'controller_acquire'));
  const reply = await f.owner.onRequest({ session: a, method: 'core_connect', payload: {}, requestId: 'a'.repeat(64) });
  assert.deepEqual(reply, { ok: false, code: 'owner_outcome_uncertain', outcome: 'unknown', requestId: 'a'.repeat(64) });
  assert.equal(effects, 1); assert.equal(f.owner.status().fenced, false); assert.equal(f.owner.status().accepted, 0); await f.owner.close();
});

test('owner-attachments completed read classification is private one-shot and survives lease expiry', async () => {
  for (const code of ['inspection_failed', 'inspection_result_budget', 'host_json_unavailable', 'host_registry_unavailable']) {
    const records = new WeakMap(), error = Object.assign(new Error('private detail'), { code, completed: true }); let first = true, f;
    f = fixture({ invoke(_method, _payload, context) { if (first) { first = false; records.set(error, context); f.at(1000); } throw error; },
      consumeReadRejection(value, request) { const context = records.get(value); records.delete(value); return context === request.context ? { code } : null; } });
    const a = f.attach(), grant = await ok(f.call(a, 'controller_acquire'));
    assert.deepEqual(await f.call(a, 'inspect_module_target', inspection), { ok: false, outcome: 'rejected', code, nextAction: 'core_diagnostics' });
    assert.equal(f.owner.status().accepted, 0); assert.equal(f.owner.status().fenced, false);
    await ok(f.call(a, 'controller_release', { leaseToken: grant.leaseToken })); await ok(f.call(a, 'controller_acquire'));
    await denied(f.call(a, 'inspect_module_target', inspection), 'owner_outcome_uncertain'); await f.owner.close();
  }
});
test('owner-attachments terminal flag clean facts wrong operation and verifier failure never prove completion', async () => {
  for (const mode of ['forged', 'wrong-method', 'verifier-throws', 'unknown-code']) {
    const f = fixture({ invoke() { throw Object.assign(new Error('private'), { code: 'inspection_failed', outcome: 'rejected', completed: true }); },
      consumeReadRejection(_error, request) { if (mode === 'verifier-throws') throw new Error('private'); return mode === 'wrong-method' ? { code: 'inspection_failed' } : mode === 'unknown-code' ? { code: 'private' } : null; } });
    const a = f.attach(); await ok(f.call(a, 'controller_acquire'));
    await denied(f.call(a, mode === 'wrong-method' ? 'core_connect' : 'inspect_module_target', inspection), 'owner_outcome_uncertain'); await f.owner.close();
  }
});
test('owner-attachments consumes completed read proof even when pending unresolved or fault prevents classification', async () => {
  for (const field of ['pending', 'unresolved', 'fault']) {
    let consumed = 0, f;
    f = fixture({ invoke() { f.facts[field] = true; throw new Error('completed'); }, consumeReadRejection() { consumed++; return { code: 'inspection_failed' }; } });
    const a = f.attach(); await ok(f.call(a, 'controller_acquire'));
    await denied(f.call(a, 'inspect_module_target', inspection), 'owner_outcome_uncertain'); assert.equal(consumed, 1);
    f.facts[field] = false; await until(() => f.owner.status().accepted === 0); await f.owner.close();
  }
});

function stdioFixture(call) {
  const input = new PassThrough(), output = new PassThrough(), replies = []; let buffer = '', closes = 0;
  output.on('data', chunk => { buffer += chunk; for (;;) { const at = buffer.indexOf('\n'); if (at < 0) break; replies.push(JSON.parse(buffer.slice(0, at))); buffer = buffer.slice(at + 1); } });
  const adapter = serveAttachment({ input, output, client: { call, close() { closes++; } } });
  return { input, output, replies, adapter, get closes() { return closes; }, send(request) { input.write(JSON.stringify({ jsonrpc: '2.0', ...request }) + '\n'); } };
}
test('owner-attachments stdio initialize and discovery do not invoke owner or acquire', async () => {
  const f = stdioFixture(() => assert.fail('no IPC calls'));
  f.send({ id: 1, method: 'initialize' }); f.send({ id: 2, method: 'tools/list' }); await until(() => f.replies.length === 2);
  assert.equal(f.replies[1].result.tools.some(tool => tool.name === 'controller_acquire'), true);
  f.input.end(); await until(() => f.closes === 1); assert.equal(f.adapter.status().closed, true);
});

test('owner-attachments stdio inspection discovery and missing contract error explain the next action without UNKNOWN', async () => {
  const owner = fixture(), a = owner.attach(); await ok(owner.call(a, 'controller_acquire'));
  const f = stdioFixture((method, payload) => owner.call(a, method, payload));
  f.send({ id: 1, method: 'tools/list' }); await until(() => f.replies.length === 1);
  const tool = f.replies[0].result.tools.find(tool => tool.name === 'inspect_module_target');
  assert.deepEqual(tool.inputSchema.required, ['payload']); assert.deepEqual(tool.inputSchema.properties.payload.required, ['contractId']);
  assert.equal(tool.inputSchema.properties.payload.properties.contractId.type, 'string');
  assert.equal(new RegExp(tool.inputSchema.properties.payload.properties.contractId.pattern).test(inspection.contractId), true);
  assert.match(tool.description, /get_module_contract/);
  f.send({ id: 2, method: 'tools/call', params: { name: 'inspect_module_target', arguments: { payload: { moduleId: 'fixture-module', target: {} } } } });
  await until(() => f.replies.length === 2);
  assert.equal(f.replies[1].error.message, 'owner_inspection_contract_required'); assert.deepEqual(f.replies[1].error.data, { nextAction: 'get_module_contract' });
  assert.equal(owner.calls.length, 0); assert.equal(owner.owner.status().accepted, 0);
  f.send({ id: 3, method: 'tools/call', params: { name: 'inspect_module_target', arguments: { payload: inspection } } });
  await until(() => f.replies.length === 3); assert.equal(f.replies[2].result.isError, false); assert.equal(owner.calls.length, 1);
  f.adapter.close(); await owner.owner.close();
});
test('owner-attachments stdio EOF only closes attachment; accepted call is neither cancelled nor retried', async () => {
  let resolve; let calls = 0; const f = stdioFixture(() => { calls++; return new Promise(done => { resolve = done; }); });
  f.send({ id: 1, method: 'tools/call', params: { name: 'core_connect', arguments: {} } });
  await until(() => calls === 1); f.input.end(); await until(() => f.closes === 1);
  resolve({ ok: true, value: { original: true } }); await until(() => f.adapter.status().pending === 0);
  assert.equal(f.replies.length, 0); assert.equal(calls, 1);
});
test('owner-attachments stdio metadata never enters domain payload or controller selection', async () => {
  let received; const f = stdioFixture((method, payload) => { received = { method, payload }; return { ok: true, value: {} }; });
  f.send({ id: 'meta', method: 'tools/call', params: { name: 'core_status', arguments: { payload: { a: 1 } }, _meta: { threadId: 'forged-controller' } } });
  await until(() => f.replies.length === 1); assert.deepEqual(received, { method: 'core_status', payload: { a: 1 } }); f.adapter.close();
});
test('owner-attachments stdio connection loss reports uncertain outcome without resend', async () => {
  let calls = 0; const f = stdioFixture(() => { calls++; throw Object.assign(new Error('private transport info'), { code: 'ipc_outcome_uncertain' }); });
  f.send({ id: 1, method: 'tools/call', params: { name: 'run_plan', arguments: {} } });
  await until(() => f.replies.length === 1); assert.equal(f.replies[0].error.message, 'ipc_outcome_uncertain'); assert.equal(f.replies[0].error.data.outcome, 'unknown'); assert.equal(calls, 1); f.adapter.close();
});
test('owner-attachments stdio preserves accepted-owner uncertainty and original request correlation', async () => {
  const f = stdioFixture(async () => ({ ok: false, code: 'owner_outcome_uncertain', outcome: 'unknown', requestId: 'a'.repeat(64) }));
  f.send({ id: 1, method: 'tools/call', params: { name: 'core_connect' } });
  await until(() => f.replies.length === 1);
  assert.deepEqual(f.replies[0].error.data, { outcome: 'unknown', requestId: 'a'.repeat(64) }); f.adapter.close();
});
test('owner-attachments stdio projects only exact finite rejected inspection as an MCP tool error', async () => {
  const rejection = { ok: false, outcome: 'rejected', code: 'inspection_result_budget', nextAction: 'core_diagnostics' };
  for (const [name, response, accepted] of [
    ['inspect_module_target', rejection, true], ['core_connect', rejection, false],
    ['inspect_module_target', { ...rejection, code: 'secret_fixture_value' }, false],
    ['inspect_module_target', { ...rejection, authority: true }, false],
    ['inspect_module_target', { ...rejection, outcome: 'unknown' }, false]
  ]) {
    const f = stdioFixture(async () => response); f.send({ id: 1, method: 'tools/call', params: { name } });
    await until(() => f.replies.length === 1);
    if (accepted) { assert.equal(f.replies[0].error, undefined); assert.equal(f.replies[0].result.isError, true); assert.deepEqual(JSON.parse(f.replies[0].result.content[0].text), { outcome: 'rejected', code: rejection.code, nextAction: 'core_diagnostics' }); }
    else assert.equal(f.replies[0].error.message, 'owner_request_failed');
    assert.doesNotMatch(JSON.stringify(f.replies), /secret_fixture_value|authority/); f.adapter.close();
  }
});
test('owner-attachments stdio oversized unterminated frame closes only attachment', async () => {
  const f = stdioFixture(() => assert.fail('oversize cannot call')); f.input.write('x'.repeat(256 * 1024 + 1));
  await until(() => f.closes === 1); assert.equal(f.replies.length, 0); f.adapter.close(); assert.equal(f.closes, 1);
});
test('owner-attachments stdio secret-shaped handler message or envelope code is never exposed', async () => {
  for (const mode of ['throw', 'envelope']) {
    const f = stdioFixture(() => { if (mode === 'throw') throw new Error('secret_fixture_value'); return { ok: false, code: 'secret_fixture_value' }; });
    f.send({ id: 1, method: 'tools/call', params: { name: 'core_status', arguments: {} } });
    await until(() => f.replies.length === 1); assert.doesNotMatch(JSON.stringify(f.replies), /secret_fixture_value/); f.adapter.close();
  }
});
test('owner-attachments blocked stdout has bounded buffering and detaches without retry', async () => {
  const input = new PassThrough(), output = new PassThrough(); let closes = 0;
  const adapter = serveAttachment({ input, output, client: { call: async () => ({ ok: true, value: { text: 'x'.repeat(180000) } }), close() { closes++; } } });
  for (let id = 0; id < 100; id++) input.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'core_status' } }) + '\n');
  await until(() => closes === 1); assert.ok(output.writableLength <= 4 * 256 * 1024); assert.equal(adapter.status().closed, true); adapter.close();
});
test('owner-attachments oversized response and long request identity always produce bounded error', async () => {
  const f = stdioFixture(async () => ({ ok: true, value: { text: 'x'.repeat(300000) } }));
  f.send({ id: 1, method: 'tools/call', params: { name: 'core_status' } });
  await until(() => f.replies.length === 1); assert.equal(f.replies[0].error.message, 'frame_too_large');
  f.send({ id: 'x'.repeat(250000), method: 'ping' });
  await until(() => f.replies.length === 2); assert.equal(f.replies[1].id, null); assert.ok(Buffer.byteLength(JSON.stringify(f.replies[1])) < 1024); f.adapter.close();
});
test('owner-attachments explicit expired transfer requires fresh holder CAS and invalidates prior references', async () => {
  const f = fixture(), a = f.attach(), b = f.attach(), grant = await ok(f.call(a, 'controller_acquire'));
  const evidence = await ok(f.call(a, 'inspect_module_target', inspection)), observed = f.owner.status();
  const expected = { bootId: observed.bootId, generation: observed.generation, holderClientId: observed.holderClientId };
  await denied(f.call(b, 'controller_transfer', { expected }), 'controller_not_expired'); f.at(1000);
  const next = await ok(f.call(b, 'controller_transfer', { expected })); assert.equal(next.generation, grant.generation + 1);
  await denied(f.call(a, 'controller_release', { leaseToken: grant.leaseToken }), 'controller_lease_identity');
  await denied(f.call(a, 'controller_transfer', { expected }), 'controller_transfer_changed');
  await denied(f.call(b, 'build_solution_plan', { steps: [{ evidenceRef: evidence.evidenceRef }] }), 'owner_reference_generation');
  f.owner.onDetach(a); await ok(f.call(b, 'core_connect')); await f.owner.close();
});
test('owner-attachments expired transfer cannot waive actual physical/control pending, unresolved or fault', async () => {
  const f = fixture(), a = f.attach(), b = f.attach(); await ok(f.call(a, 'controller_acquire')); const observed = f.owner.status(); f.at(1000);
  const expected = { bootId: observed.bootId, generation: observed.generation, holderClientId: observed.holderClientId };
  for (const field of ['pending', 'unresolved', 'fault']) {
    f.facts[field] = true;
    await denied(f.call(b, 'controller_transfer', { expected }), field === 'pending' ? 'owner_draining' : 'owner_recovery_required');
    f.facts[field] = false;
  }
  assert.equal(f.owner.status().generation, observed.generation);
  await denied(f.call(b, 'controller_transfer', { expected: { ...expected, safe: true } }), 'controller_expected'); await f.owner.close();
});
