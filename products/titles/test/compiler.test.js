'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { compile, prepareBuild, MAX_BYTES } = require('../src/compiler');
const job = require('../examples/single-title.json');
const publicContract = require('../compat/titles-current-target.contract.json');
const clone = value => JSON.parse(JSON.stringify(value));
const productRoot = path.resolve(__dirname, '..');
const coreRoot = path.resolve(productRoot, '../../core4');
const modulePin = '189c58bf5335a8ce7c889159808b7791a39dc0ad3f0641cd522342bcdb8c6e79';
function inputs() {
  return { contract: { contractId: '1'.repeat(64), moduleId: 'titles-current-target', operationId: 'set-current-text',
    modulePin, admissionPin: '2'.repeat(64), contract: clone(publicContract) },
  inspection: { evidenceRef: 'evidence-00000000-0000-4000-8000-000000000000', modulePin, synthetic: false,
    snapshot: { target: clone(job.target), revision: 'opaque-server-revision', protected: 'opaque-server-style', text: 'До изменения' } } };
}
function temporary(t, beforeRemove = () => {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'titles-offline-'));
  t.after(async () => {
    await beforeRemove();
    const resolved = path.resolve(directory), relative = path.relative(path.resolve(os.tmpdir()), resolved);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    assert.ok(path.basename(resolved).startsWith('titles-offline-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }); return directory;
}
function tree(directory) {
  const files = {};
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) for (const [key, value] of Object.entries(tree(file))) files[entry.name + '/' + key] = value;
    else if (entry.isFile()) files[entry.name] = require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    else assert.fail('unexpected symlink in offline fixture');
  }
  return files;
}
test('independent deterministic preview and exact build; fresh desired text changes payload identity', () => {
  const { contract, inspection } = inputs(), originals = clone({ job, contract, inspection });
  const a = compile(job), b = compile(clone(job)); assert.deepEqual(a, b);
  b.intention.target.compId = 99; assert.equal(a.intention.target.compId, job.target.compId);
  assert.equal(JSON.stringify(a).includes('evidenceRef'), false);
  const payload = prepareBuild(job, contract, inspection);
  assert.deepEqual(payload, prepareBuild(clone(job), clone(contract), clone(inspection)));
  assert.equal(payload.oneStep, true); assert.equal(payload.steps.length, 1);
  assert.deepEqual(payload.steps[0].input, { ...job.target, text: job.text });
  assert.equal(payload.recordContext.purpose, 'user_work'); assert.equal(payload.recordContext.lifetime, 'work_context');
  assert.equal(payload.recordContext.contextId, job.jobId);
  const changed = { ...job, text: 'Другой текст' }, other = prepareBuild(changed, contract, inspection);
  assert.equal(Object.hasOwn(payload, 'taskId'), false); assert.equal(Object.hasOwn(other, 'taskId'), false); assert.notEqual(other.workflowId, payload.workflowId);
  assert.equal(other.steps[0].input.text, changed.text);
  assert.deepEqual({ job, contract, inspection }, originals);
});
test('strict job rejects unknown/mixed/unsupported input, types, budgets and version', () => {
  const cases = [
    { ...job, style: {} }, { ...job, batch: [job] }, { ...job, render: true }, { ...job, expectedText: 'invented' },
    { ...job, target: { ...job.target, sessionId: 'legacy' } }, { ...job, target: { ...job.target, compId: '1' } },
    { ...job, target: { ...job.target, layerId: 0 } }, { ...job, target: { ...job.target, layerId: 2147483648 } },
    { ...job, target: { ...job.target, projectId: ' ' } }, { ...job, jobId: '../escape' },
    { ...job, schemaVersion: '0.2' }, { ...job, jobId: 'x'.repeat(81) }, { ...job, text: 'x'.repeat(2049) },
    { ...job, text: 'x'.repeat(MAX_BYTES + 1) }, { ...job, text: ['mixed', 'inputs'] }, [job], null
  ];
  const missing = clone(job); delete missing.text; cases.push(missing);
  for (const value of cases) assert.throws(() => compile(value));
  assert.throws(() => compile({ ...job, extra: { nested: 'x'.repeat(MAX_BYTES) } }), /json_budget/);
  assert.equal(compile({ ...job, text: 'x'.repeat(2048) }).intention.text.length, 2048);
});
test('single-line Unicode text preserves meaningful whitespace and rejects control/blank inputs', () => {
  for (const text of ['', ' ', '\t', '\u00a0', '\r', '\n', 'one\ntwo', 'one\rtwo', 'one\u2028two', 'one\u2029two', 'one\u0085two', '\0', 'x\0y', 'x\ty', 'x\n']) {
    assert.throws(() => compile({ ...job, text }), text);
  }
  for (const text of ['  Заголовок  ', '😀 Привет', 'a\u00a0b', 'e\u0301']) assert.equal(compile({ ...job, text }).intention.text, text);
});
test('contract/profile mismatch and malformed evidence fail before producing a payload', () => {
  const mutations = [
    ({ contract: c }) => { c.extra = true; },
    ({ contract: c }) => { delete c.contractId; },
    ({ contract: c }) => { c.contractId = 'contract-invented'; },
    ({ contract: c }) => { c.modulePin = '0'.repeat(64); },
    ({ contract: c }) => { c.operationId = 'set-text'; },
    ({ contract: c }) => { c.moduleId = 'titles'; },
    ({ contract: c }) => { c.contract.protocolVersion = 2; },
    ({ contract: c }) => { c.contract.buildSchema.properties.text.maxLength = 9999; },
    ({ contract: c }) => { c.contract.executionPolicy = 'future-policy'; },
    ({ inspection: e }) => { e.synthetic = true; },
    ({ inspection: e }) => { e.synthetic = 'false'; },
    ({ inspection: e }) => { delete e.synthetic; },
    ({ inspection: e }) => { e.modulePin = '0'.repeat(64); },
    ({ inspection: e }) => { e.evidenceRef = 'invented'; },
    ({ inspection: e }) => { e.extra = true; },
    ({ inspection: e }) => { e.snapshot.target.layerId++; },
    ({ inspection: e }) => { e.snapshot.target.projectId += '-other'; },
    ({ inspection: e }) => { e.snapshot.target.compId++; },
    ({ inspection: e }) => { e.snapshot.extra = {}; },
    ({ inspection: e }) => { e.snapshot.text = 'multi\nline'; },
    ({ inspection: e }) => { delete e.snapshot.protected; },
    ({ inspection: e }) => { e.snapshot.revision = ''; },
    ({ inspection: e }) => { e.snapshot.revision = 'x'.repeat(8193); }
  ];
  for (const mutate of mutations) { const values = inputs(); mutate(values); assert.throws(() => prepareBuild(job, values.contract, values.inspection)); }
  // Correctly shaped external references are intentionally NOT authenticated here.
  const values = inputs(); values.inspection.evidenceRef = 'evidence-11111111-1111-4111-8111-111111111111';
  assert.equal(prepareBuild(job, values.contract, values.inspection).steps[0].evidenceRef, values.inspection.evidenceRef);
});
test('contract references require strings without RegExp coercion', () => {
  const malformed = [['1'.repeat(64)], null, 123, { value: '1'.repeat(64) }, true, false,
    'A'.repeat(64), '1'.repeat(63), '1'.repeat(65), 'contract-invented'];
  for (const key of ['contractId', 'admissionPin']) {
    for (const value of malformed) {
      const { contract, inspection } = inputs(); contract[key] = value;
      assert.throws(() => prepareBuild(job, contract, inspection), { code: 'contract_reference' });
    }
  }
});
test('CLI explicit files only: deterministic stdout, strict arguments, byte budgets, no workspace writes', t => {
  const directory = temporary(t), values = inputs();
  for (const [name, value] of Object.entries({ job, ...values })) fs.writeFileSync(path.join(directory, name + '.json'), JSON.stringify(value));
  const run = (...args) => spawnSync(process.execPath, [path.join(productRoot, 'cli.js'), ...args], { cwd: directory, encoding: 'utf8', timeout: 5000, windowsHide: true });
  const before = tree(directory), args = ['compile', '--job', 'job.json'];
  const first = run(...args), second = run(...args); assert.equal(first.status, 0, first.stderr); assert.equal(first.stdout, second.stdout);
  assert.deepEqual(JSON.parse(first.stdout), compile(job));
  const prepared = run('prepare-build', '--job', 'job.json', '--contract', 'contract.json', '--inspection', 'inspection.json');
  assert.equal(prepared.status, 0, prepared.stderr); assert.deepEqual(JSON.parse(prepared.stdout), prepareBuild(job, values.contract, values.inspection));
  for (const argv of [[], [...args, '--job', 'job.json'], ['compile', '--job', 'job.json', '--send', 'yes'], ['prepare-build', '--job', 'job.json'], ['compile', '--contract', 'contract.json'], ['compile', '--job', '.']]) {
    const result = run(...argv); assert.equal(result.status, 1); assert.equal(result.stdout, ''); assert.ok(JSON.parse(result.stderr).error);
  }
  assert.deepEqual(tree(directory), before);
  fs.writeFileSync(path.join(directory, 'oversized.json'), ' '.repeat(MAX_BYTES + 1));
  assert.match(run('compile', '--job', 'oversized.json').stderr, /file_budget_or_type/);
  fs.writeFileSync(path.join(directory, 'broken.json'), '{'); assert.equal(run('compile', '--job', 'broken.json').status, 1);
  fs.writeFileSync(path.join(directory, 'utf8.json'), Buffer.from([0xff])); assert.match(run('compile', '--job', 'utf8.json').stderr, /invalid_utf8/);
});
test('production import closure is own files + allowed Node builtins; contract profile equals public source', () => {
  const pending = [path.join(productRoot, 'src/compiler.js'), path.join(productRoot, 'cli.js')], visited = new Set();
  while (pending.length) {
    const file = pending.pop(); if (visited.has(file)) continue; visited.add(file);
    const source = fs.readFileSync(file, 'utf8');
    assert.equal(/\b(?:import\s*\(|eval\s*\(|new\s+Function|process\.(?:env|stdin)|\bfetch\s*\()/.test(source), false);
    for (const match of source.matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
      const specifier = match[1];
      if (specifier.startsWith('node:')) { assert.ok(['node:crypto', 'node:fs'].includes(specifier)); continue; }
      assert.ok(specifier.startsWith('.')); const resolved = require.resolve(path.resolve(path.dirname(file), specifier));
      assert.ok(resolved.startsWith(productRoot + path.sep)); if (resolved.endsWith('.js')) pending.push(resolved);
    }
  }
  assert.deepEqual([...visited].map(file => path.relative(productRoot, file).split(path.sep).join('/')).sort(),
    ['cli.js', 'src/compiler.js', 'src/layout-native.js', 'src/layout.js', 'src/release.js', 'src/series.js']);
  assert.deepEqual(publicContract, JSON.parse(fs.readFileSync(path.join(coreRoot, 'modules/titles-current-target/contract.json'))));
});
test('actual owner boundary accepts first compiler payload with server taskId and Broker rejects forged evidence; VM only', async t => {
  // All Core imports below are TEST-ONLY. This never uses an installed Broker,
  // network listener, CEP process, native UI, public grants or a mutating phase.
  const { Broker } = require('../../../core4/core/broker');
  const { brandAuthorityPort, brandExecutionPolicyPort } = require('../../../core4/core/authority');
  const { encode, decode } = require('../../../core4/protocol/codec');
  const { initialState, environment } = require('../../../core4/test/fixtures/ae');
  const { createAttachmentOwner } = require('../../../core4/runtime/attachment-owner');
  let broker, owner;
  const vm = require('node:vm'), directory = temporary(t, async () => { await owner?.close(); await broker?.close(); }), state = initialState();
  // The parent owns concurrent Markdown progress/docs. Every executable, asset
  // and JSON byte remains covered by this source-immutability assertion.
  const sourceTree = () => Object.fromEntries(Object.entries(tree(coreRoot)).filter(([file]) => !file.endsWith('.md')));
  const sourceBefore = sourceTree(), executorSource = fs.readFileSync(path.join(coreRoot, 'modules/titles-current-target/executor.jsx'), 'utf8');
  let channel, inspected = 0;
  const transport = {
    async connect(binding) { channel = binding; return { receiverStoreIdentity: 'offline-titles-store' }; },
    async disconnect() {},
    async send(frame) {
      const command = decode(frame, channel.secret); assert.equal(command.phase, 'inspect'); inspected++;
      const context = vm.createContext(environment(state, () => {}));
      context.executor = vm.runInContext(executorSource, context); context.input = command.payload;
      const result = JSON.parse(JSON.stringify(vm.runInContext('executor.inspect(input)', context)));
      return encode({ protocolVersion: 1, commandId: command.commandId, executorHash: command.executorHash, payloadHash: command.payloadHash, result }, channel.secret);
    }
  };
  const deny = () => { throw new Error('offline_test_never_executes'); };
  const authority = brandAuthorityPort({ synthetic: true, resourceConstraints: [], registerProposal() {}, authorize: deny });
  const policy = brandExecutionPolicyPort({ describe: () => ({ policyId: publicContract.executionPolicy, provenance: 'offline-build-test-only' }), assertCurrent() {}, prepareReservation: deny, assertReservation: deny, verifyCompletion: deny });
  const stateDir = path.join(directory, 'broker-state');
  broker = new Broker({ root: coreRoot, stateDir, privateEmbedding: { authority, executionPolicy: policy, transport } });
  let buildCalls = 0;
  owner = createAttachmentOwner({ runtime: { status: () => broker.status(), close() {} }, activity: () => ({ pending: !!broker.controllerBusy || !!broker.worker.status().pending, unresolved: !!broker.ledger.unresolved().length, fault: !!broker.ledger.corrupt }),
    async invoke(method, payload, context) { if (!context.observer) context.assertCurrent(); if (method === 'build') buildCalls++; return broker[method](payload); } });
  const session = Object.freeze({ clientSessionId: 'titles-product-fixture' }); owner.onAttach(session);
  const request = (method, payload = {}) => owner.onRequest({ session, method, payload });
  async function call(method, payload) { const result = await request(method, payload); assert.equal(result.ok, true, JSON.stringify(result)); return result.value; }
  await call('controller_acquire'); await call('core_connect');
  const contract = await call('get_module_contract', { moduleId: 'titles-current-target' });
  const fixtureJob = { ...job, target: { projectId: state.projectId, compId: 1, layerId: 102 } };
  const evidence = await call('inspect_module_target', { moduleId: contract.moduleId, contractId: contract.contractId, target: fixtureJob.target });
  assert.equal(evidence.synthetic, true);
  assert.throws(() => prepareBuild(fixtureJob, contract, evidence), /synthetic_inspection/);
  // Explicitly alter untrusted export metadata ONLY to exercise production-shape
  // compiler compatibility. The server retains the original synthetic evidence.
  // This is not a production observation or authenticity check.
  const projected = { ...evidence, synthetic: false }, payload = prepareBuild(fixtureJob, contract, projected);
  const testPayload = { ...payload, recordContext: { ...payload.recordContext,
    purpose: 'technical_check', lifetime: 'ephemeral_check', contextId: 'titles-offline-broker-build' } };
  assert.equal(Object.hasOwn(testPayload, 'taskId'), false);
  const built = await call('build_solution_plan', testPayload), plan = broker.builds.get(built.buildId);
  assert.match(built.taskId, /^task-/); assert.equal(plan.taskId, built.taskId); assert.equal(buildCalls, 1);
  const beforeForeign = fs.readFileSync(path.join(stateDir, 'ledger.ndjson'));
  assert.deepEqual(await request('build_solution_plan', { ...testPayload, taskId: 'titles-unbound-product-task' }), { ok: false, code: 'owner_reference_generation' });
  assert.equal(buildCalls, 1); assert.deepEqual(fs.readFileSync(path.join(stateDir, 'ledger.ndjson')), beforeForeign);
  assert.equal(plan.oneStep, true); assert.equal(plan.engine, null);
  assert.equal(plan.recordContext.purpose, 'technical_check');
  assert.equal(plan.recordContext.lifetime, 'ephemeral_check');
  assert.equal(plan.recordContext.contextId, 'titles-offline-broker-build');
  assert.equal(plan.steps[0].input.expectedText, state.text);
  assert.equal(plan.steps[0].input.expectedRevision, evidence.snapshot.revision);
  assert.deepEqual(plan.steps[0].desiredInput, { ...fixtureJob.target, text: fixtureJob.text });
  const forged = prepareBuild(fixtureJob, contract, { ...projected, evidenceRef: 'evidence-11111111-1111-4111-8111-111111111111' });
  const forgedTestPayload = { ...forged, recordContext: { ...forged.recordContext,
    purpose: 'technical_check', lifetime: 'ephemeral_check', contextId: 'titles-offline-broker-build' } };
  assert.deepEqual(await request('build_solution_plan', forgedTestPayload), { ok: false, code: 'owner_reference_generation' }); assert.equal(buildCalls, 1);
  await assert.rejects(broker.build(forgedTestPayload), /server_evidence_required/);
  const retained = tree(stateDir);
  const workflowCopy = path.join(directory, 'removable-product'); fs.cpSync(productRoot, workflowCopy, { recursive: true });
  const copied = require(path.join(workflowCopy, 'src/compiler.js')); copied.compile(fixtureJob);
  assert.throws(() => copied.prepareBuild(fixtureJob, { ...contract, modulePin: '0'.repeat(64) }, projected));
  assert.ok(path.resolve(workflowCopy).startsWith(path.resolve(directory) + path.sep));
  fs.rmSync(workflowCopy, { recursive: true }); assert.deepEqual(tree(stateDir), retained);
  assert.equal(fs.existsSync(path.join(stateDir, 'ledger.ndjson')), true);
  assert.equal(state.text, 'Before'); assert.equal(state.counts.titles, 0); assert.equal(inspected, 1);
  assert.deepEqual(sourceTree(), sourceBefore, 'Core/CEP executable and data source bytes unchanged');
});
