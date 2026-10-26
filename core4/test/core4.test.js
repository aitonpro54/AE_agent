'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const { Broker } = require('../core/broker');
const { Ledger } = require('../core/ledger');
const { hash, canonical, MAX_FRAME } = require('../protocol/json');
const { encode, decode } = require('../protocol/codec');
const { check } = require('../protocol/schema');
const { checkBoundaries } = require('../tools/check-boundaries');
const { selectChecks } = require('../tools/validate-diff');
const { serve } = require('../core/stdio');
const { recordContext } = require('../core/record-context');
const { PassThrough } = require('node:stream');
const { fixtureTransport, initialState } = require('./fixtures/ae');
const { SOURCE, workspace, seal, fixture, target, requestStep, prepare, run, rewrite, delay } = require('./helpers');
function cleanup(t, f) { t.after(() => f.close()); return f; }
function code(expected) { return error => error.code === expected; }

test('[core-control catalog-discovery] A1 independent startup physically absent optional artifacts and bad catalog', async t => {
  const ws = workspace(); fs.rmSync(path.join(ws.root, 'modules'), { recursive: true }); fs.rmSync(path.join(ws.root, 'plan-engine'), { recursive: true });
  const trace = []; const broker = new Broker({ ...ws, trace: file => trace.push(file) }); t.after(() => broker.close());
  assert.equal(broker.status().ready, true); assert.equal(broker.status().worker.pid, null);
  assert.equal((await broker.connect()).reason, 'live_transport_not_installed');
  assert.equal((await broker.disconnect()).unresolvedPreserved, 0); assert.equal(broker.diagnostics().pid, process.pid);
  broker.reset({ taskId: 'absent-task' });
  assert.equal(trace.filter(f => /^(modules|plan-engine)\//.test(f)).length, 0);
  assert.equal(broker.listModules().modules.length, 2);
  fs.writeFileSync(path.join(ws.root, 'config/catalog.json'), '{invalid');
  assert.equal(broker.listModules({ refresh: true }).modules.length, 2); assert.ok(broker.diagnostics().catalogError);
  assert.equal(broker.status().ready, true);
  const cold = new Broker({ root: ws.root, stateDir: path.join(ws.temp, 'cold') }); t.after(() => cold.close());
  assert.equal(cold.status().ready, true); assert.deepEqual(cold.listModules().modules, []);
});

test('[titles-owner titles-executor-contract core-control] A2 real lazy selection and successful typed title readback', async t => {
  const trace = []; const f = cleanup(t, fixture({ trace: file => trace.push(file) })); await f.broker.connect();
  assert.deepEqual(f.broker.worker.status().loaded, []);
  const step = await requestStep(f, 'titles', 'titles'); assert.equal(f.broker.worker.status().pid, null);
  const build = await f.broker.build({ taskId: 'titles-task', steps: [step] });
  const modules = f.broker.worker.status().loaded; assert.equal(modules.length, 2); assert.ok(modules.some(m => m.startsWith('titles@'))); assert.ok(modules.some(m => m.startsWith('plan-engine@')));
  assert.equal(trace.filter(file => file.startsWith('modules/photo-placeholder/')).length, 0);
  const plan = f.broker.propose({ buildId: build.buildId }); f.authority.confirm(plan.proposalId);
  const beforeStyle = canonical(f.state.style); const result = await run(f, plan);
  assert.equal(result.state, 'succeeded'); assert.equal(f.state.text, 'After'); assert.equal(f.state.counts.titles, 1); assert.equal(canonical(f.state.style), beforeStyle);
  assert.equal(f.broker.getTask({ taskId: 'titles-task' }).commands[0].state, 'succeeded');
});

test('[catalog-discovery titles-owner] A3 unrelated artifact refresh preserves core and titles pins without reconnect', async t => {
  const f = cleanup(t, fixture()); const plan = await prepare(f); const beforeIdentity = f.broker.status().coreIdentity; const workerEpoch = f.broker.worker.epoch;
  rewrite(f.root, 'modules/photo-placeholder/implementation.js', source => source + '\n// next independently admitted photo implementation\n'); seal(f.root);
  rewrite(f.root, 'config/catalog.json', source => { const next = JSON.parse(source); next.catalogRevision = 'photo-2'; return JSON.stringify(next); });
  const list = f.broker.listModules({ refresh: true }); assert.equal(list.catalogRevision, 'photo-2'); assert.equal(f.broker.status().connection, 'connected');
  assert.equal(f.broker.status().coreIdentity, beforeIdentity); assert.equal(f.broker.worker.epoch, workerEpoch); assert.equal(f.broker.worker.child, null);
  const contract = f.broker.getContract({ moduleId: 'titles' }); assert.equal(contract.modulePin, plan.pins.modules[0].module);
  assert.equal(canonical(f.broker.builds.get(plan.buildId).pins), canonical(plan.pins));
  assert.equal((await run(f, plan)).state, 'succeeded'); assert.equal(f.broker.worker.epoch, workerEpoch + 1);
});

test('[validation-routing] A4 diff maps single owner reverse contracts and dependency-keyed cache', () => {
  const ws = workspace();
  const titles = selectChecks(['core4/modules/titles/implementation.js'], ws.root);
  assert.deepEqual(titles.checks.map(c => c.check).sort(), ['titles-executor-contract', 'titles-owner']);
  assert.ok(titles.checks.every(c => c.reason && c.dependencyPath.length && c.evidenceKey && c.command.some(part => part.endsWith('.test.js'))));
  assert.ok(!titles.checks.some(c => c.check.includes('photo')));
  const shared = selectChecks(['core4/protocol/target-contract.json'], ws.root);
  assert.ok(shared.checks.some(c => c.check === 'photo-executor-contract')); assert.ok(shared.checks.some(c => c.check === 'titles-executor-contract'));
  assert.ok(shared.checks.find(c => c.check === 'titles-executor-contract').reason.includes('exact-target-v1'));
  const ipc = selectChecks(['core4/worker.js'], ws.root); assert.ok(ipc.checks.some(c => c.check === 'workflow-recovery')); assert.ok(ipc.checks.some(c => c.check === 'titles-owner'));
  assert.throws(() => selectChecks(['core4/mystery.js'], ws.root), code('unknown_or_ambiguous_owner'));
  rewrite(ws.root, 'modules/photo-placeholder/implementation.js', source => source + '\n// unrelated\n'); rewrite(ws.root, 'config/catalog.json', source => source + '\n');
  rewrite(ws.root, 'test/modules/photo-placeholder.test.js', source => source + '\n// unrelated photo test edit\n');
  assert.deepEqual(selectChecks(['core4/modules/titles/implementation.js'], ws.root).checks.map(c => c.evidenceKey), titles.checks.map(c => c.evidenceKey));
  rewrite(ws.root, 'modules/titles/implementation.js', source => source + '\n// changed owner\n');
  assert.notEqual(selectChecks(['core4/modules/titles/implementation.js'], ws.root).checks[0].evidenceKey, titles.checks[0].evidenceKey);
  const catalog = selectChecks(['core4/config/catalog.json'], ws.root);
  assert.ok(catalog.checks.some(c => c.check === 'catalog-discovery'));
  assert.ok(catalog.checks.some(c => c.check === 'titles-owner' && c.reason.includes('modules[id=titles]')));
  assert.deepEqual(selectChecks(['core4/README.md'], ws.root).checks.map(c => c.check), ['documentation']);
  assert.ok(selectChecks(['core4/modules/titles/contract.json'], ws.root).checks.some(c => c.check === 'workflow-recovery' && c.reason.includes('titles-public-contract')));
});

test('[workflow-recovery photo-owner photo-executor-contract titles-owner] A5 mixed fault resumes fresh targets across worker and ledger reopen without replay', async t => {
  let failOnce = true; const f = cleanup(t, fixture({ hooks: { afterAuthorize({ step }) { if (step.stepId === 'titles' && failOnce) { failOnce = false; f.state.flags.animated = true; } } } }));
  const plan = await prepare(f, true); const first = await run(f, plan);
  assert.equal(first.state, 'stopped'); assert.equal(first.code, 'executor_rejected'); assert.equal(f.state.counts.photo, 1); assert.equal(f.state.counts.titles, 0);
  const commands = f.broker.getTask({ taskId: plan.taskId }).commands;
  assert.equal(commands[0].stepId, 'photo'); assert.equal(commands[0].state, 'succeeded'); assert.equal(commands[1].state, 'rejected');
  const firstAttempt = commands[1].attemptId; f.state.flags.animated = false; f.close();
  const recovered = cleanup(t, fixture({ workspace: { root: f.root, stateDir: f.stateDir, temp: f.temp }, transport: f.transport, state: f.state }));
  recovered.authority.confirm(plan.proposalId); await recovered.broker.connect();
  const second = await run(recovered, plan);
  assert.equal(second.state, 'succeeded'); assert.notEqual(second.runId, first.runId); assert.equal(f.state.counts.photo, 1); assert.equal(f.state.counts.titles, 1);
  const resumed = recovered.broker.getTask({ taskId: plan.taskId }).commands;
  assert.equal(resumed.filter(c => c.stepId === 'photo').length, 1); assert.notEqual(resumed[2].attemptId, firstAttempt);
  const fresh = recovered.broker.ledger.workflow(plan.workflowId).filter(e => e.kind === 'step_dryrun' && e.stepId === 'titles'); assert.equal(fresh.length, 2); assert.notEqual(fresh[0].attemptId, fresh[1].attemptId);
});

test('[workflow-recovery photo-owner] A5 counterexample manual photo drift is rejected on resume without rewriting photo', async t => {
  let once = true; const f = cleanup(t, fixture({ hooks: { afterAuthorize({ step }) { if (step.stepId === 'titles' && once) { once = false; f.state.text = 'Race'; } } } }));
  const plan = await prepare(f, true); assert.equal((await run(f, plan)).state, 'stopped'); f.state.photoSourceId = 11;
  const result = await run(f, plan); assert.equal(result.code, 'successful_step_drift'); assert.equal(f.state.counts.photo, 1); assert.equal(f.state.counts.titles, 0);
});

test('[core-control core-admission worker-isolation] A6 reset before dispatch sends no mutation and rejects late worker epoch', async t => {
  const f = cleanup(t, fixture({ hooks: { afterAuthorize(data, broker) { broker.reset({ taskId: 'task-fixture' }); } } }));
  const plan = await prepare(f); const result = await run(f, plan); assert.equal(result.code, 'stale_task_epoch'); assert.equal(f.state.counts.titles, 0); assert.equal(f.broker.ledger.commands().length, 0);
  const g = cleanup(t, fixture());
  rewrite(g.root, 'modules/titles/implementation.js', source => source.replace("return { operationId:", "var end = Date.now() + 180; while (Date.now() < end) {} return { operationId:")); seal(g.root); g.broker.listModules({ refresh: true }); await g.broker.connect();
  const step = await requestStep(g, 'titles'); const building = g.broker.build({ taskId: 'late-task', steps: [step] });
  await delay(30); g.broker.reset({ taskId: 'late-task' }); await assert.rejects(building, code('stale_task_epoch')); await delay(300);
  assert.equal(g.state.counts.titles, 0); assert.ok(g.broker.worker.status().lateReplies >= 1);
});

test('[core-control core-admission] A6 reset after durable intent preserves receipt and after ACK loss preserves fence', async t => {
  const beforeSend = cleanup(t, fixture({ hooks: { afterIntent(data, broker) { broker.reset({ taskId: data.taskId }); } } }));
  const plan = await prepare(beforeSend); assert.equal((await run(beforeSend, plan)).code, 'stale_task_epoch');
  assert.equal(beforeSend.state.counts.titles, 0); assert.equal(beforeSend.broker.getTask({ taskId: plan.taskId }).commands.length, 1);
  const f = cleanup(t, fixture({ transportOptions: { loseAck: command => command.phase === 'mutate' } })); const p = await prepare(f);
  const result = await run(f, p); assert.equal(result.state, 'stopped'); assert.equal(f.state.counts.titles, 1); assert.equal(f.broker.ledger.unresolved().length, 1);
  f.broker.reset({ taskId: p.taskId }); assert.equal(f.broker.ledger.unresolved().length, 1);
  const reconciled = await f.broker.reconcile({ taskId: p.taskId }); assert.equal(reconciled.reset, true); assert.equal(reconciled.commands[0].state, 'succeeded'); assert.equal(f.state.counts.titles, 1);
});

test('[worker-isolation core-control] A7 infinite loop exit malformed IPC keep same Core PID and durable UNKNOWN', async t => {
  const f = cleanup(t, fixture({ workerTimeout: 350, transportOptions: { loseAck: command => command.phase === 'mutate' } })); const p = await prepare(f); await run(f, p);
  assert.equal(f.broker.ledger.unresolved().length, 1);
  rewrite(f.root, 'plan-engine/index.js', () => "'use strict'; module.exports = { transition() { while (true) {} } };\n"); seal(f.root); f.broker.listModules({ refresh: true });
  const step = p.steps[0]; const hung = f.broker.build({ taskId: 'hung-task', steps: [step] }); const observed = hung.catch(e => e.code);
  await delay(60); const started = Date.now(); assert.equal(f.broker.status().pid, process.pid); f.broker.diagnostics(); f.broker.reset({ taskId: 'other-task' }); assert.ok(Date.now() - started <= 2000);
  assert.equal(await observed, 'worker_timeout'); assert.equal(f.broker.status().worker.pid, null); assert.equal(f.broker.ledger.unresolved().length, 1);
  const selected = f.broker.artifacts.selectEngine(); const job = () => f.broker.worker.request({ taskId: 'isolated', taskEpoch: 0, method: 'engine', componentPins: { pin: selected.pin, path: selected.path, manifest: selected.manifest }, payload: { action: 'resume', plan: { steps: [] }, events: [] } });
  const exiting = job(); const exitResult = exiting.catch(e => e.code); f.broker.worker.child.kill(); assert.equal(await exitResult, 'worker_exit');
  const malformed = job(); const malformedResult = malformed.catch(e => e.code); f.broker.worker.child.stdout.emit('data', Buffer.from('{"bogus":true}\n')); assert.ok(await malformedResult);
  assert.equal(f.broker.status().pid, process.pid); assert.equal(f.broker.ledger.unresolved().length, 1);
});

test('[core-admission titles-executor-contract artifact-boundaries] A8 worker claims code wrong operation altered resource cannot become authority', async t => {
  const outputs = [
    "return { operationId: 'set-text', input: { ...input, expectedRevision: evidence.revision, expectedText: evidence.text }, verified: true };",
    "return { operationId: 'set-text', input: { ...input, expectedRevision: evidence.revision, expectedText: evidence.text }, script: 'app.project.close()' };",
    "return { operationId: 'replace-source', input: { ...input, expectedRevision: evidence.revision, expectedText: evidence.text } };",
    "return { operationId: 'set-text', input: { ...input, layerId: 999, expectedRevision: evidence.revision, expectedText: evidence.text } };",
    "return { operationId: 'set-text', input: { ...input, expectedRevision: evidence.revision, expectedText: evidence.text }, effectPolicy: { effect: 'save' } };"
  ];
  for (const output of outputs) {
    const f = cleanup(t, fixture()); rewrite(f.root, 'modules/titles/implementation.js', () => "'use strict'; function build({ input, evidence }) { " + output + " } module.exports={build};\n"); seal(f.root); f.broker.listModules({ refresh: true }); await f.broker.connect();
    const step = await requestStep(f, 'titles'); const before = f.transport.sends;
    await assert.rejects(f.broker.build({ steps: [step] })); assert.equal(f.transport.sends, before); assert.equal(f.state.counts.titles, 0);
  }
  const f = cleanup(t, fixture()); rewrite(f.root, 'config/admissions/titles.json', source => { const a = JSON.parse(source); a.revoked = true; return JSON.stringify(a); });
  assert.throws(() => f.broker.getContract({ moduleId: 'titles' }), code('not_admitted'));
  const g = cleanup(t, fixture()); rewrite(g.root, 'modules/titles/implementation.js', source => "const peer = require('../photo-placeholder/implementation');\n" + source); seal(g.root);
  assert.throws(() => g.broker.getContract({ moduleId: 'titles' }), code('private_import_denied'));
});

test('[core-admission titles-executor-contract] A8 stale CAS confirmed private gate admission revocation between dryrun and send', async t => {
  const f = cleanup(t, fixture()); const unconfirmed = await prepare(f, false, { confirm: false });
  assert.equal((await run(f, unconfirmed)).code, 'confirmation_checkpoint_ownership_required'); assert.equal(f.state.counts.titles, 0);
  f.authority.confirm(unconfirmed.proposalId); const dryrun = await f.broker.dryrun({ proposalId: unconfirmed.proposalId }); const sends = f.transport.sends;
  rewrite(f.root, 'config/admissions/titles.json', source => { const a = JSON.parse(source); a.revoked = true; return JSON.stringify(a); });
  const result = await f.broker.run({ proposalId: unconfirmed.proposalId, dryrunRef: dryrun.dryrunRef }); assert.equal(result.code, 'not_admitted'); assert.equal(f.transport.sends, sends);
  const g = cleanup(t, fixture({ hooks: { afterAuthorize() { g.state.text = 'Drift after fresh dryrun'; } } })); const plan = await prepare(g); const stale = await run(g, plan);
  assert.equal(stale.code, 'executor_rejected'); assert.equal(g.state.counts.titles, 0); assert.equal(g.broker.ledger.commands()[0].code, 'stale_target');
});

test('[titles-owner titles-executor-contract photo-owner photo-executor-contract] actual JSX rejects unsupported sources style animation identity and verifies protection', async t => {
  for (const flag of ['mixed', 'animated', 'expression', 'noCharacterRange']) {
    const f = cleanup(t, fixture()); f.state.flags[flag] = true; await f.broker.connect(); const contract = f.broker.getContract({ moduleId: 'titles' });
    await assert.rejects(f.broker.inspect({ moduleId: 'titles', contractId: contract.contractId, target: target(f, true) })); assert.equal(f.state.counts.titles, 0);
  }
  const f = cleanup(t, fixture()); await f.broker.connect(); const step = await requestStep(f, 'photo-placeholder', 'photo'); step.input.newSourceId = 13;
  const build = await f.broker.build({ steps: [step] }); const plan = f.broker.propose({ buildId: build.buildId }); f.authority.confirm(plan.proposalId);
  assert.equal((await run(f, plan)).code, 'executor_rejected'); assert.equal(f.state.counts.photo, 0);
  const g = cleanup(t, fixture()); await g.broker.connect(); const contract = g.broker.getContract({ moduleId: 'titles' });
  await assert.rejects(g.broker.inspect({ moduleId: 'titles', contractId: contract.contractId, target: { ...target(g, true), layerId: 101 } }));
  await assert.rejects(g.broker.inspect({ moduleId: 'titles', contractId: contract.contractId, target: { ...target(g, true), sessionId: 'foreign-session' } }));
  const h = cleanup(t, fixture()); h.state.flags.damageStyle = true; const p = await prepare(h); const result = await run(h, p); assert.equal(result.code, 'mutation_unknown'); assert.equal(h.broker.ledger.unresolved().length, 1);
});

test('[artifact-boundaries core-admission] A9 mutable source replacement cannot alter selected immutable closure and receipt', async t => {
  const f = cleanup(t, fixture()); await f.broker.connect(); const step = await requestStep(f, 'titles');
  const selected = f.broker.contracts.get(step.contractId); const original = fs.readFileSync(path.join(selected.path, 'implementation.js'), 'utf8');
  rewrite(f.root, 'modules/titles/implementation.js', () => "module.exports = { build() { throw new Error('replaced'); } };\n");
  const build = await f.broker.build({ taskId: 'immutable-task', steps: [step] }); const p = f.broker.propose({ buildId: build.buildId }); f.authority.confirm(p.proposalId);
  assert.equal((await run(f, p)).state, 'succeeded'); assert.equal(f.state.counts.titles, 1); assert.equal(fs.readFileSync(path.join(selected.path, 'implementation.js'), 'utf8'), original);
  const receiptBefore = canonical(f.broker.getTask({ taskId: 'immutable-task' }).commands);
  rewrite(f.root, 'modules/photo-placeholder/implementation.js', source => source + '\n// independent v2\n'); seal(f.root); f.broker.listModules({ refresh: true });
  assert.equal(canonical(f.broker.getTask({ taskId: 'immutable-task' }).commands), receiptBefore);
  fs.writeFileSync(path.join(selected.path, 'implementation.js'), 'substituted');
  await assert.rejects(f.broker.inspect({ moduleId: 'titles', contractId: step.contractId, target: target(f, true) })); assert.equal(f.state.counts.titles, 1);
});

test('[core-admission protocol-codec] forged channel response executor and payload bindings bounded schema reject', async t => {
  assert.throws(() => decode(encode({ value: 1 }, 'one'), 'two'), code('channel_auth'));
  assert.throws(() => check({ type: 'object', properties: {}, additionalProperties: false }, { script: 'evil' }), code('schema_extra'));
  assert.throws(() => check({ type: 'string', pattern: '.*' }, 'value'), code('unsupported_schema'));
  const f = cleanup(t, fixture()); const plan = await prepare(f); const originalSend = f.transport.send; let channel;
  const originalConnect = f.transport.connect; f.transport.connect = async value => { channel = value; return originalConnect(value); };
  await f.broker.disconnect(); await f.broker.connect();
  f.transport.send = async frame => { const response = decode(await originalSend(frame), channel.secret); response.executorHash = 'foreign'; return encode(response, channel.secret); };
  const result = await run(f, plan); assert.equal(result.code, 'response_correlation'); assert.equal(f.state.counts.titles, 0);
  const huge = 'x'.repeat(MAX_FRAME); assert.throws(() => encode({ huge }, 'secret'), code('frame_too_large'));
});

test('[workflow-recovery core-admission] A10 coinciding text does not reconcile ongoing UNKNOWN command and serialization survives reconnect', async t => {
  let complete; let entered; const entry = new Promise(resolve => { entered = resolve; }); const release = new Promise(resolve => { complete = resolve; });
  const f = cleanup(t, fixture({ transportTimeout: 80, transportOptions: { afterEvaluate: async ({ phase }) => { if (phase === 'mutate') { entered(); await release; } } } }));
  const p = await prepare(f); const executing = run(f, p); await entry; assert.equal(f.state.text, 'After');
  const outcome = await executing; assert.equal(outcome.code, 'transport_timeout'); assert.equal(f.broker.ledger.unresolved().length, 1);
  const ongoing = await f.broker.reconcile({ taskId: p.taskId }); assert.equal(ongoing.commands[0].state, 'UNKNOWN'); assert.equal(f.broker.ledger.unresolved().length, 1);
  await f.broker.disconnect(); await f.broker.connect();
  await assert.rejects(f.broker.inspect({ moduleId: 'titles', contractId: p.steps[0].contractId, target: target(f, true) }), code('controller_busy'));
  complete(); await delay(30); const resolved = await f.broker.reconcile({ taskId: p.taskId }); assert.equal(resolved.commands[0].state, 'succeeded'); assert.equal(f.state.counts.titles, 1);
  assert.equal((await run(f, p)).state, 'succeeded'); assert.equal(f.state.counts.titles, 1);
});

test('[core-control workflow-recovery] A10 actual child crash boundaries durable intent before send ACK readback', async t => {
  for (const point of ['beforeIntent', 'afterIntent', 'afterPhysicalSend', 'afterSend', 'afterAck', 'beforeReadback', 'afterReadback', 'afterSuccessRecord']) {
    const ws = workspace(); const aeFile = path.join(ws.temp, 'ae-state.json');
    const child = spawn(process.execPath, [path.join(SOURCE, 'test/fixtures/crash-child.js'), ws.root, ws.stateDir, aeFile, point], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stderr = ''; child.stderr.on('data', data => { stderr += data; }); const exited = await new Promise(resolve => child.on('exit', resolve)); assert.equal(exited, 77, point + ': ' + stderr);
    const ledger = new Ledger(path.join(ws.stateDir, 'ledger.ndjson')); assert.equal(ledger.commands().length, point === 'beforeIntent' ? 0 : 1, point); assert.equal(ledger.unresolved().length, ['beforeIntent', 'afterSuccessRecord'].includes(point) ? 0 : 1, point);
    const state = fs.existsSync(aeFile) ? JSON.parse(fs.readFileSync(aeFile, 'utf8')) : initialState();
    const f = cleanup(t, fixture({ workspace: ws, state, transportOptions: { stateFile: aeFile } })); await f.broker.connect();
    // The synthetic observer died with the child. Persisted AE values/store identity
    // cannot restore its project-incarnation proof in the replacement observer.
    const task = await f.broker.reconcile({ taskId: 'crash-task' });
    if (point === 'beforeIntent') assert.equal(task.commands.length, 0);
    else if (point === 'afterSuccessRecord') assert.equal(task.commands[0].state, 'succeeded', point);
    else assert.equal(task.commands[0].state, ledger.commands()[0].state, point);
    assert.ok(f.state.counts.titles <= 1, point); const before = f.state.counts.titles;
    const proposal = [...f.broker.proposals.values()][0]; assert.throws(() => f.authority.confirm(proposal.proposalId), code('authority_target'));
    if (f.broker.ledger.unresolved().length) await assert.rejects(run(f, proposal), code('reconciliation_required'));
    assert.equal(f.state.counts.titles, before, point);
  }
});

test('[core-control] durable ledger torn record is diagnostic only and latched append failure prevents sends', () => {
  const ws = workspace(); const file = path.join(ws.temp, 'torn.ndjson'); fs.writeFileSync(file, '{"type":"intent"'); const ledger = new Ledger(file);
  assert.equal(ledger.corrupt, true); assert.throws(() => ledger.append({ type: 'event' }), code('ledger_corrupt'));
  const other = new Ledger(path.join(ws.temp, 'other.ndjson')); const original = fs.writeSync;
  fs.writeSync = () => 0; try { assert.throws(() => other.append({ type: 'task', taskId: 'short', epoch: 0 }), code('ledger_short_write')); } finally { fs.writeSync = original; }
  assert.equal(other.corrupt, true); assert.throws(() => other.append({ type: 'event' }), code('ledger_corrupt'));
});

test('[artifact-boundaries] reviewed source boundaries', () => {
  assert.ok(checkBoundaries().checked >= 10);
});
test('[documentation] local README records offline and UNKNOWN constraints', () => {
  const readme = fs.readFileSync(path.join(SOURCE, 'README.md'), 'utf8'); assert.ok(readme.includes('offline')); assert.ok(readme.includes('UNKNOWN'));
});

test('[core-control protocol-codec] actual stdio MCP generic surface status unavailable and no public fixture authority', async t => {
  const ws = workspace(); const child = spawn(process.execPath, [path.join(SOURCE, 'core/stdio.js'), '--state-dir', ws.stateDir], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }); t.after(() => child.kill());
  let buffer = ''; const waiting = new Map(); child.stdout.on('data', chunk => { buffer += chunk; while (buffer.includes('\n')) { const index = buffer.indexOf('\n'); const response = JSON.parse(buffer.slice(0, index)); buffer = buffer.slice(index + 1); waiting.get(response.id)?.(response); } });
  const call = (id, method, params) => new Promise(resolve => { waiting.set(id, resolve); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }) + '\n'); });
  assert.equal((await call(1, 'initialize')).result.serverInfo.name, 'ae-agent-core4');
  const tools = (await call(2, 'tools/list')).result.tools; assert.ok(tools.some(tool => tool.name === 'reconcile_task')); assert.equal(tools.length, 14);
  const status = await call(3, 'tools/call', { name: 'core_status', arguments: {} }); assert.equal(JSON.parse(status.result.content[0].text).connection, 'unavailable');
  const connect = await call(4, 'tools/call', { name: 'core_connect', arguments: {} }); assert.equal(JSON.parse(connect.result.content[0].text).available, false);
  const forged = await call(5, 'tools/call', { name: 'issue_grant', arguments: { payload: { synthetic: true } } }); assert.equal(forged.error.message, 'unknown_tool');
  child.stdin.end();
});

test('[core-admission workflow-recovery] approved expectations cannot silently rebase and identity bindings cannot expand scope', async t => {
  for (const mixed of [false, true]) {
    const f = cleanup(t, fixture()); const plan = await prepare(f, mixed);
    if (mixed) f.state.photoSourceId = 13; else f.state.text = 'Manual edit before first send';
    const result = await run(f, plan); assert.equal(result.code, 'approved_target_drift'); assert.deepEqual(f.state.counts, { photo: 0, titles: 0 }); assert.equal(f.broker.ledger.commands().length, 0);
  }
  const f = cleanup(t, fixture()); await f.broker.connect();
  const photo = await requestStep(f, 'photo-placeholder', 'photo'), title = await requestStep(f, 'titles', 'titles');
  title.dependsOn = ['photo']; title.bindings = [{ fromStep: 'photo', from: 'target.layerId', to: 'layerId' }];
  const built = await f.broker.build({ steps: [photo, title] }); const plan = f.broker.propose({ buildId: built.buildId }); f.authority.confirm(plan.proposalId);
  assert.equal(plan.effects[1].input.layerId, 102); assert.equal((await run(f, plan)).code, 'binding_changes_approved_target'); assert.equal(f.state.counts.photo, 1); assert.equal(f.state.counts.titles, 0);
});

test('[workflow-recovery titles-owner] new failed-step revision reapproves fresh drift without replaying successful photo', async t => {
  let once = true; const f = cleanup(t, fixture({ hooks: { afterAuthorize({ step }) { if (step.stepId === 'titles' && once) { once = false; f.state.text = 'Manual change'; } } } }));
  const original = await prepare(f, true); assert.equal((await run(f, original)).code, 'executor_rejected');
  assert.equal((await run(f, original)).code, 'approved_target_drift'); assert.equal(f.state.counts.photo, 1);
  rewrite(f.root, 'modules/titles/implementation.js', source => source + '\n// revised failed step\n');
  execFileSync(process.execPath, [path.join(f.root, 'tools/seal.js'), '--module', 'titles', '--reviewed-source']); f.broker.listModules({ refresh: true });
  const revised = await prepare(f, true); assert.notEqual(revised.planRevision, original.planRevision); assert.equal(revised.pins.modules[0].module, original.pins.modules[0].module); assert.notEqual(revised.pins.modules[1].module, original.pins.modules[1].module);
  assert.equal((await run(f, revised)).state, 'succeeded'); assert.equal(f.state.counts.photo, 1); assert.equal(f.state.counts.titles, 1);
});

test('[core-admission titles-executor-contract photo-executor-contract] explicit project incarnation rejects reopen same path and IDs', async t => {
  const f = cleanup(t, fixture()); const p = await prepare(f); const pathBefore = f.state.projectId;
  const oldEpoch = f.state.sessionId; f.transport.reopenSamePath(); assert.equal(f.state.projectId, pathBefore); assert.notEqual(f.state.sessionId, oldEpoch);
  const result = await run(f, p); assert.equal(result.state, 'stopped'); assert.equal(f.state.counts.titles, 0);
  const g = cleanup(t, fixture()); g.transport.connect = async () => ({ sessionBinding: { kind: 'broker-lifetime', lifecycleVerified: true } });
  assert.equal((await g.broker.connect()).reason, 'trusted_project_lifecycle_unavailable'); assert.equal(g.broker.status().connection, 'unavailable');
});

test('[core-admission photo-executor-contract titles-executor-contract] mutations followed by setter errors or protected drift remain UNKNOWN', async t => {
  for (const flag of ['photoSetterThrows', 'damageTransform', 'textSetterThrows']) {
    const f = cleanup(t, fixture()); f.state.flags[flag] = true; await f.broker.connect(); const photo = flag !== 'textSetterThrows'; const step = await requestStep(f, photo ? 'photo-placeholder' : 'titles');
    const build = await f.broker.build({ steps: [step] }); const plan = f.broker.propose({ buildId: build.buildId }); f.authority.confirm(plan.proposalId);
    assert.equal((await run(f, plan)).code, 'mutation_unknown'); assert.equal(f.broker.ledger.unresolved().length, 1); assert.equal(f.state.counts[photo ? 'photo' : 'titles'], 1);
    assert.equal((await f.broker.reconcile({ taskId: build.taskId })).commands[0].state, 'UNKNOWN');
  }
});

test('[core-admission core-control] neutral durable ownership checkpoint constraints and unknown schemas fence mutation', async t => {
  for (const change of [{ owner: 'foreign-owner' }, { checkpointRef: 'foreign-checkpoint' }, { allowedEffects: [] }, { reservationOwner: 'foreign-owner' }, { unresolvedOutcome: true }, { schemaVersion: 2 }]) {
    const f = cleanup(t, fixture()); const p = await prepare(f); const record = { ...f.broker.resources.records()[0], ...change };
    f.broker.ledger.append({ type: 'constraint', record }); const result = await run(f, p);
    assert.equal(result.state, 'stopped'); assert.equal(f.state.counts.titles, 0); assert.equal(f.broker.ledger.commands().length, 0);
  }
  const f = cleanup(t, fixture({ hooks: { afterAuthorize(data, broker) { const record = { ...broker.resources.records()[0], unresolvedOutcome: true }; broker.ledger.append({ type: 'constraint', record }); } } }));
  assert.equal((await run(f, await prepare(f))).code, 'shared_resource_fenced'); assert.equal(f.state.counts.titles, 0);
});

test('[artifact-boundaries validation-routing titles-owner] scoped package seal reads only selected module closure while others physically absent', () => {
  const ws = workspace(); const coreBefore = fs.readFileSync(path.join(ws.root, 'core/artifact.json'), 'utf8'); const protocolBefore = fs.readFileSync(path.join(ws.root, 'protocol/artifact.json'), 'utf8');
  const photoManifest = fs.readFileSync(path.join(ws.root, 'modules/photo-placeholder/artifact.json'), 'utf8'); const catalog = JSON.parse(fs.readFileSync(path.join(ws.root, 'config/catalog.json')));
  fs.renameSync(path.join(ws.root, 'modules/photo-placeholder'), path.join(ws.temp, 'photo-absent')); fs.renameSync(path.join(ws.root, 'plan-engine'), path.join(ws.temp, 'engine-absent'));
  rewrite(ws.root, 'modules/titles/implementation.js', source => source + '\n// selected packaging only\n');
  const output = JSON.parse(execFileSync(process.execPath, [path.join(ws.root, 'tools/seal.js'), '--module', 'titles', '--reviewed-source', '--trace'], { encoding: 'utf8' }));
  assert.deepEqual(output.packaged, ['titles']); assert.equal(output.reads.filter(file => /photo-placeholder|plan-engine|core\//.test(file)).length, 0);
  assert.equal(fs.readFileSync(path.join(ws.root, 'core/artifact.json'), 'utf8'), coreBefore); assert.equal(fs.readFileSync(path.join(ws.root, 'protocol/artifact.json'), 'utf8'), protocolBefore);
  assert.equal(fs.readFileSync(path.join(ws.temp, 'photo-absent/artifact.json'), 'utf8'), photoManifest);
  const next = JSON.parse(fs.readFileSync(path.join(ws.root, 'config/catalog.json'))); assert.deepEqual(next.modules.find(m => m.id === 'photo-placeholder'), catalog.modules.find(m => m.id === 'photo-placeholder')); assert.deepEqual(next.engine, catalog.engine);
  assert.throws(() => execFileSync(process.execPath, [path.join(ws.root, 'tools/seal.js')], { stdio: 'pipe' }));
});

test('[protocol-codec worker-isolation core-control] RPC and worker pending limits remain 32 after overflow and recover after drain', async t => {
  const input = new PassThrough(), output = new PassThrough(); const releases = []; let active = 0, maxActive = 0; const responses = [];
  output.on('data', chunk => { for (const line of chunk.toString().trim().split('\n')) responses.push(JSON.parse(line)); });
  const lines = serve({ status() { active++; maxActive = Math.max(maxActive, active); return new Promise(resolve => releases.push(() => { active--; resolve({ ready: true }); })); }, close() {} }, input, output);
  const send = id => input.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'core_status', arguments: {} } }) + '\n');
  for (let id = 1; id <= 100; id++) send(id); await delay(10);
  assert.equal(maxActive, 32); assert.equal(responses.filter(r => r.error?.message === 'rpc_backpressure').length, 68);
  releases.splice(0).forEach(release => release()); await delay(10); send(101); await delay(10); assert.equal(active, 1); releases.splice(0).forEach(release => release()); input.end(); lines.close();
  const f = cleanup(t, fixture()); const selected = f.broker.artifacts.selectEngine();
  const request = () => f.broker.worker.request({ taskId: 'limit', taskEpoch: 0, method: 'engine', componentPins: { pin: selected.pin, path: selected.path, manifest: selected.manifest }, payload: { action: 'resume', plan: { steps: [] } } });
  const pending = Array.from({ length: 32 }, request); const observed = Promise.allSettled(pending); assert.throws(request, code('worker_backpressure')); f.broker.worker.stop('bounded-test-drain'); assert.equal((await observed).length, 32); assert.equal(f.broker.worker.pending.size, 0);
});

test('[core-admission] admission and private grant revocation are rechecked at final dispatch commit', async t => {
  for (const boundary of ['beforeIntent', 'afterIntent']) {
    const f = cleanup(t, fixture({ hooks: { [boundary]() { f.authority.revoke(); } } }));
    const p = await prepare(f); const result = await run(f, p); assert.equal(result.code, 'authority_target'); assert.equal(f.state.counts.titles, 0);
    assert.equal(f.broker.ledger.commands().length, boundary === 'afterIntent' ? 1 : 0);
    if (boundary === 'afterIntent') assert.equal(f.broker.ledger.commands()[0].state, 'rejected');
  }
  const g = cleanup(t, fixture({ hooks: { beforeIntent() { rewrite(g.root, 'config/admissions/titles.json', source => { const record = JSON.parse(source); record.revoked = true; return JSON.stringify(record); }); } } }));
  const p = await prepare(g); assert.equal((await run(g, p)).code, 'not_admitted'); assert.equal(g.state.counts.titles, 0); assert.equal(g.broker.ledger.commands().length, 0);
});

test('[core-control core-admission] one broker owns durable state and valid-JSON ledger corruption fails closed', async t => {
  const f = cleanup(t, fixture()); const p = await prepare(f); const other = cleanup(t, fixture({ workspace: f, transport: f.transport, state: f.state }));
  assert.equal(other.broker.status().ownershipFault, 'state_owner_busy'); assert.equal((await other.broker.connect()).reason, 'state_owner_busy');
  assert.throws(() => other.broker.reset({ taskId: p.taskId }), code('state_owner_busy'));
  assert.equal((await run(f, p)).state, 'succeeded'); f.close(); other.close();
  const file = path.join(f.stateDir, 'ledger.ndjson'); const lines = fs.readFileSync(file, 'utf8').trimEnd().split('\n'); const record = JSON.parse(lines[0]); record.seq = 99; lines[0] = JSON.stringify(record); fs.writeFileSync(file, lines.join('\n') + '\n');
  const corrupted = new Broker({ root: f.root, stateDir: f.stateDir }); t.after(() => corrupted.close()); assert.equal(corrupted.status().ready, true); assert.equal(corrupted.status().ledgerFault, true);
  assert.throws(() => corrupted.reset({ taskId: 'tampered' }), code('ledger_corrupt'));
});

test('[validation-routing] actual titles-only diff checks pass with photo and engine absent from their source tree', () => {
  const ws = workspace(); fs.rmSync(path.join(ws.root, 'modules/photo-placeholder'), { recursive: true }); fs.rmSync(path.join(ws.root, 'plan-engine'), { recursive: true });
  const output = execFileSync(process.execPath, [path.join(ws.root, 'tools/validate-diff.js'), 'core4/modules/titles/implementation.js', '--run'], { encoding: 'utf8', windowsHide: true });
  assert.ok(output.includes('titles-owner')); assert.ok(output.includes('titles-executor-contract')); assert.ok(!output.includes('photo-owner'));
  assert.match(output, /(?:tests 4|# tests 4)/);
  const selected = selectChecks(['core4/modules/titles/implementation.js'], ws.root); assert.ok(selected.checks.every(c => c.dependencies.every(dep => !dep.includes('photo-placeholder') && !dep.includes('plan-engine'))));
  assert.deepEqual(selected.checks.map(c => c.check).sort(), ['titles-executor-contract', 'titles-owner']); assert.equal(selected.executionBatches.length, 1);
  assert.equal(selected.releaseCertified, false);
  assert.ok(selected.deferredCoverage.some(c => c.check === 'workflow-recovery' && c.status === 'current-closure-unverified' && c.changedDependencies.some(d => d.file === 'core4/modules/titles/implementation.js')));
  assert.ok(selected.deferredCoverage.every(c => !('evidenceKey' in c) && c.reason && c.dependencyPath.length));
});

test('[validation-routing] shared Core dependencies select component consumers while byte-only integrations remain explicit deferred coverage', () => {
  const ws = workspace(); const file = 'core4/core/resources.js'; const before = selectChecks([file], ws.root);
  for (const check of ['core-control', 'core-admission', 'titles-owner', 'titles-executor-contract', 'photo-owner', 'photo-executor-contract', 'workflow-recovery']) assert.ok(before.checks.some(c => c.check === check), check);
  assert.ok(before.checks.find(c => c.check === 'titles-owner').reason.includes('changed component dependency core/'));
  assert.ok(before.checks.find(c => c.check === 'workflow-recovery').reason.includes('permanent-core-runtime'));
  const titleKey = before.checks.find(c => c.check === 'titles-owner').evidenceKey;
  rewrite(ws.root, 'core/resources.js', source => source + '\n// changed shared runtime bytes\n');
  assert.notEqual(selectChecks([file], ws.root).checks.find(c => c.check === 'titles-owner').evidenceKey, titleKey);
  assert.equal(before.executionBatches.length, 3); assert.ok(before.executionBatches.some(batch => batch.checks.includes('titles-owner') && batch.checks.includes('titles-executor-contract')));
  const privateTitle = selectChecks(['core4/modules/titles/implementation.js'], ws.root);
  assert.deepEqual(privateTitle.checks.map(c => c.check).sort(), ['titles-executor-contract', 'titles-owner']);
  assert.ok(privateTitle.deferredCoverage.some(c => c.check === 'workflow-recovery')); assert.ok(!privateTitle.checks.some(c => c.check.startsWith('photo')));
});

test('[validation-routing] declared semantic contract impacts select consumers without claiming private-file semantic equivalence', () => {
  const ws = workspace(); const changed = ['core4/modules/titles/implementation.js'];
  const result = selectChecks(changed, ws.root, { contractImpacts: ['titles-public-contract'] });
  assert.ok(result.checks.some(c => c.check === 'workflow-recovery' && c.reason.includes('declared semantic contract impact titles-public-contract')));
  assert.ok(!result.deferredCoverage.some(c => c.check === 'workflow-recovery')); assert.equal(result.releaseCertified, false);
  assert.throws(() => selectChecks(changed, ws.root, { contractImpacts: ['invented-contract'] }), code('unknown_contract_impact'));
  assert.throws(() => selectChecks(['core4/unknown-owner.js'], ws.root, { contractImpacts: ['titles-public-contract'] }), code('unknown_or_ambiguous_owner'));
  const cli = JSON.parse(execFileSync(process.execPath, [path.join(ws.root, 'tools/validate-diff.js'), ...changed, '--contract-impacts', JSON.stringify(['titles-public-contract'])], { encoding: 'utf8', windowsHide: true }));
  assert.deepEqual(cli.contractImpacts, ['titles-public-contract']); assert.ok(cli.checks.some(c => c.check === 'workflow-recovery'));
});

test('[core-control worker-isolation artifact-boundaries] permanent worker bytes are pinned and spawn excludes ambient credential environment', async t => {
  const f = cleanup(t, fixture()); const p = await prepare(f); assert.ok(f.broker.worker.child.spawnargs[1].startsWith(f.broker.artifacts.runtime.path));
  assert.ok(f.broker.worker.environmentKeys.every(key => ['SystemRoot', 'WINDIR', 'SYSTEMDRIVE', 'TEMP', 'TMP', 'LANG'].includes(key)));
  fs.writeFileSync(path.join(f.root, 'worker.js'), "throw new Error('mutable runtime replacement');\n"); f.broker.worker.stop();
  assert.equal((await run(f, p)).state, 'succeeded'); assert.equal(f.state.counts.titles, 1);
  f.broker.worker.stop(); fs.writeFileSync(path.join(f.broker.artifacts.runtime.path, 'worker.js'), 'substitution');
  assert.equal((await run(f, p)).code, 'immutable_runtime_integrity'); assert.equal(f.state.counts.titles, 1);
});

test('[core-control core-admission] recordContext descriptive defaults and synthetic checks do not authorize writes', async t => {
  assert.equal(recordContext(undefined, { taskId: 'default-ingress', projectId: 'p' }).purpose, 'user_work');
  assert.throws(() => recordContext({ purpose: 'development', lifetime: 'work_context', contextId: 'c', project: { file: 'p' }, resources: [] }, {}), code('record_context_lifetime'));
  const f = cleanup(t, fixture()); const p = await prepare(f, false, { confirm: false });
  assert.equal(f.broker.builds.get(p.buildId).recordContext.purpose, 'technical_check'); assert.equal((await run(f, p)).code, 'confirmation_checkpoint_ownership_required');
  f.authority.confirm(p.proposalId); assert.equal((await run(f, p)).state, 'succeeded'); assert.equal(f.broker.ledger.commands()[0].recordContext.lifetime, 'ephemeral_check');
});

test('[core-admission] unknown constraint schema or malformed neutral identities cannot narrow the fence', async t => {
  for (const patch of [{ schemaVersion: 2, resource: { newDimension: 'unknown' } }, { schemaVersion: 2, resource: { sessionId: ['synthetic-session'] } }, { schemaVersion: 1, resource: { compId: [1] } }, { schemaVersion: 1, resource: { layerId: '102' } }, { schemaVersion: 1, owner: [] }, { schemaVersion: 1, resource: { compId: 999 }, unsupportedExtension: { scope: 'unknown' } }]) {
    const f = cleanup(t, fixture()); const p = await prepare(f); const base = f.broker.resources.records()[0];
    f.broker.ledger.append({ type: 'constraint', record: { ...base, ...patch, constraintId: 'unknown-foreign-dimension', resource: { ...base.resource, ...(patch.resource || {}) }, unresolvedOutcome: true } });
    assert.equal((await run(f, p)).code, 'constraint_schema_unavailable'); assert.equal(f.state.counts.titles, 0);
  }
  for (const schemaVersion of [1, 2]) {
    const f = cleanup(t, fixture()); const p = await prepare(f); const base = f.broker.resources.records()[0];
    f.broker.ledger.append({ type: 'constraint', record: { ...base, constraintId: 'typed-unrelated-project', schemaVersion, resource: { ...base.resource, projectId: 'verified-unrelated-project' }, unresolvedOutcome: true } });
    assert.equal((await run(f, p)).state, 'succeeded'); assert.equal(f.state.counts.titles, 1);
  }
});

test('[core-control core-admission] concurrent stale lease reclaim is serialized and orphan acquire gate remains closed', async t => {
  const ws = workspace(); fs.mkdirSync(ws.stateDir, { recursive: true });
  const dead = spawn(process.execPath, ['-e', 'process.exit(0)'], { windowsHide: true, stdio: 'ignore' }); const deadPid = dead.pid; await new Promise(resolve => dead.on('exit', resolve));
  fs.writeFileSync(path.join(ws.stateDir, 'broker-owner.lock'), JSON.stringify({ pid: deadPid, token: 'old-owner' }));
  const script = path.join(SOURCE, 'test/fixtures/lock-contender.js');
  const first = spawn(process.execPath, [script, ws.stateDir, 'pause-reclaimer'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); t.after(() => first.kill());
  const firstExit = new Promise(resolve => first.on('exit', resolve)); let firstOutput = ''; first.stdout.on('data', chunk => { firstOutput += chunk; });
  const deadline = Date.now() + 3000; while (!fs.existsSync(path.join(ws.stateDir, 'reclaimer-ready')) && Date.now() < deadline) await delay(10);
  assert.ok(fs.existsSync(path.join(ws.stateDir, 'reclaimer-ready')));
  const second = JSON.parse(execFileSync(process.execPath, [script, ws.stateDir, 'probe'], { encoding: 'utf8', windowsHide: true })); assert.equal(second.error, 'state_owner_gate_unavailable');
  fs.writeFileSync(path.join(ws.stateDir, 'release-reclaimer'), 'go'); while (!firstOutput.includes('\n') && Date.now() < deadline) await delay(10);
  assert.equal(JSON.parse(firstOutput).error, null); const firstOwner = JSON.parse(fs.readFileSync(path.join(ws.stateDir, 'broker-owner.lock'))); assert.equal(firstOwner.pid, first.pid);
  const third = JSON.parse(execFileSync(process.execPath, [script, ws.stateDir, 'probe'], { encoding: 'utf8', windowsHide: true })); assert.equal(third.error, 'state_owner_busy'); assert.equal(JSON.parse(fs.readFileSync(path.join(ws.stateDir, 'broker-owner.lock'))).pid, first.pid);
  fs.writeFileSync(path.join(ws.stateDir, 'release-owner'), 'go'); assert.equal(await firstExit, 0);
  fs.writeFileSync(path.join(ws.stateDir, 'broker-owner.gate'), 'orphan-acquire');
  const broker = new Broker({ root: ws.root, stateDir: ws.stateDir }); t.after(() => broker.close()); assert.equal(broker.status().ownershipFault, 'state_owner_gate_unavailable'); assert.equal(fs.readFileSync(path.join(ws.stateDir, 'broker-owner.gate'), 'utf8'), 'orphan-acquire');
});

test('[core-control core-admission workflow-recovery] close is terminal drains physical send and forbids late old-owner ledger appends', async t => {
  let entered, release; const reached = new Promise(resolve => { entered = resolve; }); const gate = new Promise(resolve => { release = resolve; });
  const f = cleanup(t, fixture({ transportOptions: { afterEvaluate: async ({ phase }) => { if (phase === 'mutate') { entered(); await gate; } } } }));
  const p = await prepare(f); const executing = run(f, p); await reached; assert.equal(f.state.counts.titles, 1); f.close();
  const ledgerFile = path.join(f.stateDir, 'ledger.ndjson'), bytesBefore = fs.readFileSync(ledgerFile, 'utf8');
  const blocked = cleanup(t, fixture({ workspace: f, transport: f.transport, state: f.state })); assert.equal(blocked.broker.status().ownershipFault, 'state_owner_busy'); blocked.close();
  release(); const result = await executing; assert.equal(result.code, 'broker_closed'); assert.equal(fs.readFileSync(ledgerFile, 'utf8'), bytesBefore);
  assert.throws(() => f.broker.ledger.append({ type: 'late-old-owner' }), code('broker_closed'));
  const recovered = cleanup(t, fixture({ workspace: f, transport: f.transport, state: f.state })); assert.equal(recovered.broker.status().ownershipFault, null); await recovered.broker.connect();
  assert.equal((await recovered.broker.reconcile({ taskId: p.taskId })).commands[0].state, 'succeeded'); assert.equal(f.state.counts.titles, 1);
});

test('[core-control] close also drains a pending connection and never reopens the closed instance', async t => {
  const f = cleanup(t, fixture()); let release; const gate = new Promise(resolve => { release = resolve; }); const original = f.transport.connect;
  f.transport.connect = async binding => { await gate; return original(binding); };
  const connecting = f.broker.connect(); f.close();
  const blocked = cleanup(t, fixture({ workspace: f, transport: f.transport, state: f.state })); assert.equal(blocked.broker.status().ownershipFault, 'state_owner_busy'); blocked.close();
  release(); assert.equal((await connecting).reason, 'broker_closed'); assert.equal(f.broker.status().closed, true); assert.equal(f.broker.status().connection, 'unavailable');
  const next = cleanup(t, fixture({ workspace: f, transport: f.transport, state: f.state })); assert.equal(next.broker.status().ownershipFault, null);
});
