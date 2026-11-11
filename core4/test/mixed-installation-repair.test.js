'use strict';
// Offline synthetic TEMP evidence. These tests never certify a real repair.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), net = require('node:net'), http = require('node:http');
const { fixture, pkg, hash, canonical, stats, signed, write } = require('./fixtures/mixed-installation');
const code = value => e => e.code === value;
const snapshot = files => Object.fromEntries(files.map(file => [file, { hash: hash(fs.readFileSync(file)), stat: stats(file) }]));
const protectedFiles = h => ['installation.json', 'core-client.json', 'origin.json', 'state/production/origin.json', 'state/production/receiver/completions.ndjson', 'state/production/runtime-maintenance.json', 'state/production/host-adoption.json', 'state/production/work-session.json'].map(f => path.join(h.root, f));
async function close(server) { if (server.listening) await new Promise(resolve => server.close(resolve)); }

test('mixed repair authentic success preserves protected byte/stat facts and both histories without a synthetic receiver', { timeout: 90000 }, async t => {
  const h = await fixture(t), before = snapshot(protectedFiles(h)), p = await h.plan();
  assert.equal(p.plan.foreignHistorySettlementCertified, false);
  assert.equal(p.plan.foreignReceiver.reconstructed, false);
  assert.equal(h.mutations.length, 0);
  await assert.rejects(h.run('apply', hash('wrong pin')), code('repair_plan_pin'));
  const result = await h.run('apply', p.planHash);
  assert.equal(result.phase, 'repaired'); assert.equal(result.commandsReplayed, 0);
  assert.deepEqual(snapshot(protectedFiles(h)), before);
  assert.equal(fs.existsSync(path.join(h.root, 'install.lock')), false);
  assert.equal(hash(fs.readFileSync(path.join(h.repairDir, 'foreign-history/0'))), h.profile.ledgerHash);
  assert.equal(fs.existsSync(path.join(h.repairDir, 'foreign-history/completions.ndjson')), false);
  assert.equal(hash(fs.readFileSync(h.config)), p.plan.targetConfigHash);
  h.die(); assert.equal((await h.run('inspect', p.planHash)).phase, 'repaired');
  // Actual existing maintenance code reads the original fixture stop and stats.
  const maintenance = h.load(path.resolve(__dirname, '../runtime/owner-maintenance'));
  assert.equal((await maintenance.inspectMaintenance({ installation: h.d, descriptorPath: h.descriptorPath, id: h.stop })).phase, 'stopped');
  // Ordinary private stopped certification/update/enable, never a sidecar grant.
  const server = http.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => close(server));
  const certifier = h.load(path.resolve(__dirname, '../runtime/stopped-certification')), update = h.load(path.resolve(__dirname, '../tools/stopped-update'));
  const options = { installation: h.d, descriptorPath: h.descriptorPath, id: h.stop, reservedServer: server };
  const certificate = await certifier.certifyStoppedInstallation({ ...options, expectedProofHash: (await certifier.inspectStoppedCertification(options)).proofHash });
  const plan = h.installer.planInstall({ ...h.installArgs, pkg: pkg('manual-titles-variants') });
  update.applyStoppedUpdate({ plan, ...await update.prepareStoppedUpdate({ plan, certificate, ...options }) });
  h.die();
  const recovery = { installation: h.d, descriptorPath: h.descriptorPath, transactionId: plan.transactionId, expectedPreviousDescriptorHash: hash(canonical(h.d)), expectedPackageHash: plan.pkg.packageHash, reservedServer: server };
  const inspection = await update.inspectStoppedUpdate(recovery);
  assert.equal((await update.enableStoppedUpdate({ ...recovery, expectedProofHash: inspection.proofHash })).enabled, true);
  assert.equal(JSON.parse(fs.readFileSync(h.descriptorPath)).installationId, h.d.installationId);
});

test('mixed repair rejects wrong MAC, owner token and malformed scope before mutation', { timeout: 90000 }, async t => {
  for (const kind of ['mac', 'token', 'scope', 'numeric-birth']) await t.test(kind, async t => {
    const h = await fixture(t, h => {
      const file = path.join(h.state, 'runtime-owner.json'), value = JSON.parse(fs.readFileSync(file));
      if (kind === 'mac') value.mac = '0'.repeat(64);
      if (kind === 'scope') { value.body.scope.pid = 0; Object.assign(value, signed(h.foreign, 'lifecycle', 'runtime-owner', { phase: value.body.phase, receiverIdentity: value.body.receiverIdentity, scope: value.body.scope })); }
      if (kind === 'numeric-birth') { value.body.scope.birthTicks = 639298879750215940; Object.assign(value, signed(h.foreign, 'lifecycle', 'runtime-owner', { phase: value.body.phase, receiverIdentity: value.body.receiverIdentity, scope: value.body.scope })); }
      if (kind === 'token') write(path.join(h.state, 'receiver/owner'), { version: 1, pid: value.body.scope.pid, token: '00000000-0000-4000-8000-000000000000' });
      write(file, value);
    });
    await assert.rejects(h.plan(), code(kind === 'mac' ? 'repair_mac' : kind === 'token' ? 'repair_owner_tokens' : 'repair_scope'));
    assert.equal(h.mutations.length, 0);
  });
});

test('mixed repair rejects active or unknown process observations and original living repair actor', { timeout: 90000 }, async t => {
  const h = await fixture(t), p = await h.plan();
  for (const mode of ['active', 'unknown', 'owner']) { h.setCensus(mode); await assert.rejects(h.run('apply', p.planHash), code(mode === 'active' ? 'repair_active_host' : mode === 'unknown' ? 'repair_process_unknown' : 'repair_actor_alive')); }
  assert.equal(h.mutations.length, 0); h.setCensus('dead');
  let hit = false;
  h.crashAfter(e => { if (!hit && e.method === 'linkSync' && e.args[1]?.endsWith('actor-0.json')) { hit = true; throw Error('simulated crash'); } });
  await assert.rejects(h.run('apply', p.planHash), /simulated crash/); h.clearFault();
  await assert.rejects(h.run('recover', p.planHash), code('repair_actor_alive')); h.die();
  assert.equal((await h.run('recover', p.planHash)).phase, 'repaired');
});

test('mixed repair refuses all three occupied endpoints and an unrelated install gate', { timeout: 90000 }, async t => {
  const h = await fixture(t), p = await h.plan();
  const endpoints = [{ port: 3457, host: '127.0.0.1' }, ...[h.d, h.foreign].map(d => ({ path: '\\\\.\\pipe\\ae-core4-owner-' + hash(JSON.stringify({ installationId: d.installationId, machineId: d.machineId })).slice(0, 32) }))];
  for (const endpoint of endpoints) {
    const server = net.createServer(socket => socket.destroy()); await new Promise(resolve => server.listen(endpoint, resolve));
    await assert.rejects(h.run('apply', p.planHash), code('repair_endpoint_busy')); await close(server);
  }
  assert.equal(h.mutations.length, 0);
  write(path.join(h.root, 'install.lock'), 'foreign gate');
  await assert.rejects(h.run('apply', p.planHash), code('repair_gate_busy')); assert.equal(h.mutations.length, 0);
});

test('mixed repair holds attributable install and broker gates until read-back and blocks the ordinary state writer', { timeout: 90000 }, async t => {
  const h = await fixture(t), p = await h.plan(), brokerGate = path.join(h.state, 'broker/broker-owner.gate');
  const originalLock = snapshot([path.join(h.state, 'broker/broker-owner.lock')]);
  const { acquireStateLock } = require('../core/state-lock');
  let hit = false;
  h.crashAfter(e => {
    if (!hit && e.method === 'linkSync' && e.args[1] === brokerGate) {
      hit = true;
      assert.equal(fs.existsSync(path.join(h.root, 'install.lock')), true);
      const lease = acquireStateLock(path.join(h.state, 'broker'));
      assert.equal(lease.error, 'state_owner_gate_unavailable'); lease.release();
      assert.deepEqual(snapshot([path.join(h.state, 'broker/broker-owner.lock')]), originalLock);
      throw Error('simulated crash');
    }
  });
  await assert.rejects(h.run('apply', p.planHash), /simulated crash/); h.clearFault(); h.die();
  assert.equal((await h.run('inspect', p.planHash)).switchIndex, 0);
  assert.equal((await h.run('recover', p.planHash)).phase, 'repaired');
  assert.equal(fs.existsSync(brokerGate), false); assert.equal(fs.existsSync(path.join(h.root, 'install.lock')), false);
});

test('mixed repair refuses a foreign broker gate without publishing repair state or removing the foreign gate', { timeout: 90000 }, async t => {
  const h = await fixture(t), p = await h.plan(), gate = path.join(h.state, 'broker/broker-owner.gate');
  write(gate, 'foreign broker gate'); const before = snapshot([gate]);
  await assert.rejects(h.run('apply', p.planHash), code('repair_gate_busy'));
  assert.deepEqual(snapshot([gate]), before); assert.equal(h.mutations.length, 0);
  assert.equal(fs.existsSync(h.repairDir), false);
});

test('mixed repair rejects inode/hash drift, job registry and undeclared writer fences', { timeout: 90000 }, async t => {
  for (const mode of ['inode', 'hash', 'job', 'writer']) await t.test(mode, async t => {
    const h = await fixture(t), p = await h.plan();
    if (mode === 'inode') { const file = h.descriptorPath, bytes = fs.readFileSync(file); fs.renameSync(file, file + '.old'); write(file, bytes); }
    if (mode === 'hash') fs.appendFileSync(path.join(h.state, 'work-session.json'), ' ');
    if (mode === 'job') fs.mkdirSync(path.join(h.state, 'render-jobs-v1'));
    if (mode === 'writer') write(path.join(h.state, 'unclassified-writer.lock'), 'owner');
    await assert.rejects(h.run('apply', p.planHash), code(['inode', 'hash'].includes(mode) ? 'repair_protected_changed' : 'repair_uncovered_writer_or_job'));
    assert.equal(h.mutations.length, 0);
  });
});

test('mixed repair refuses durable external file/output/job or unresolved constraint fences', { timeout: 90000 }, async t => {
  for (const mode of ['file', 'output', 'jobId', 'unresolved']) await t.test(mode, async t => {
    const h = await fixture(t, h => {
      const c = h.events.find(e => e.type === 'constraint').record;
      if (mode === 'unresolved') c.unresolvedOutcome = true; else c.resource[mode] = 'external';
      let previousHash = 'origin';
      for (const e of h.events) { e.previousHash = previousHash; const { recordHash, ...body } = e; e.recordHash = hash(body); previousHash = e.recordHash; }
      const bytes = Buffer.from(h.events.map(canonical).join('\n') + '\n'); h.profile.ledgerHash = hash(bytes); write(path.join(h.state, 'broker/ledger.ndjson'), bytes);
      const reportPath = path.join(h.repo, h.profile.report), report = JSON.parse(fs.readFileSync(reportPath)); report.ledger.sha256 = hash(bytes); write(reportPath, report);
    });
    await assert.rejects(h.plan(), e => ['repair_external_fence', 'repair_foreign_history'].includes(e.code)); assert.equal(h.mutations.length, 0);
  });
});

test('mixed repair refuses reservation output and grant file execution scopes', { timeout: 90000 }, async t => {
  for (const scope of ['reservation-output', 'grant-file']) await t.test(scope, async t => {
    const h = await fixture(t, h => {
      if (scope === 'reservation-output') {
        const command = h.events.find(e => e.type === 'intent');
        h.events[h.events.length - 2] = { type: 'reservation', state: 'reserved', reservation: { ref: 'reservation-external', commandId: command.commandId, checkpointRef: 'checkpoint', receiverStoreIdentity: 'receiver-store-foreign', executionScope: { target: { output: 'external-output' } } }, seq: h.events.length - 1 };
        h.events[h.events.length - 1] = { type: 'reservation', state: 'succeeded', reservationRef: 'reservation-external', seq: h.events.length };
      } else h.events.find(e => e.type === 'intent').grant = { executionScope: { target: { file: 'external-file' } } };
      let previousHash = 'origin';
      for (const e of h.events) { e.previousHash = previousHash; const { recordHash, ...body } = e; e.recordHash = hash(body); previousHash = e.recordHash; }
      const bytes = Buffer.from(h.events.map(canonical).join('\n') + '\n'); h.profile.ledgerHash = hash(bytes); write(path.join(h.state, 'broker/ledger.ndjson'), bytes);
      const reportPath = path.join(h.repo, h.profile.report), report = JSON.parse(fs.readFileSync(reportPath)); report.ledger.sha256 = hash(bytes);
      for (const r of report.receipts) r.ledgerRecordHash = h.events.find(e => e.type === 'command' && e.commandId === r.commandId).recordHash;
      write(reportPath, report);
    });
    await assert.rejects(h.plan(), code('repair_external_fence')); assert.equal(h.mutations.length, 0);
  });
});

test('mixed repair crash after each rename and every record publication recovers only the original monotonic prefix', { timeout: 900000 }, async t => {
  const baseline = await fixture(t), p = await baseline.plan(); await baseline.run('apply', p.planHash);
  const key = (h, e) => {
    let file = e.file || e.args[e.method === 'linkSync' ? 1 : 0];
    if (typeof file !== 'string') throw Error('unattributed test IO boundary');
    file = file.replace(h.repairDir, '<repair>').replace(h.root, '<root>').replace(h.cep, '<cep>').replace(h.config, '<config>');
    return e.method + ':' + file.replace(/actor-[0-9]+\.json/g, 'actor-N.json');
  };
  // Two histories cover stage durability and final publication separately.
  // An accepted durable stage can legitimately make its final-name link
  // unnecessary after recovery. Each history repeatedly dies at its next
  // untested boundary, inspecting and resuming the same original operation.
  for (const methods of [['fsyncSync'], ['linkSync', 'renameSync', 'unlinkSync']]) await t.test(methods.join('+'), { timeout: 420000 }, async t => {
    const expected = new Set(baseline.mutations.filter(e => methods.includes(e.method)).map(e => key(baseline, e)));
    const h = await fixture(t), before = snapshot(protectedFiles(h)), p = await h.plan(), covered = new Set();
    let mode = 'apply', result;
    for (let attempt = 0; attempt <= expected.size + 1; attempt++) {
      let hit = false;
      h.crashAfter(e => { if (methods.includes(e.method)) { const k = key(h, e); if (expected.has(k) && !covered.has(k)) { covered.add(k); hit = true; throw Error('simulated crash'); } } });
      try { result = await h.run(mode, p.planHash); }
      catch (e) { if (!hit || e.message !== 'simulated crash') throw e; }
      finally { h.clearFault(); }
      if (!hit) break;
      h.die();
      const inspected = await h.run('inspect', p.planHash); assert.ok(['repair-pending', 'repaired'].includes(inspected.phase));
      mode = 'recover';
    }
    assert.equal(result?.phase, 'repaired'); assert.deepEqual([...covered].sort(), [...expected].sort());
    assert.deepEqual(snapshot(protectedFiles(h)), before); assert.equal(fs.existsSync(path.join(h.root, 'install.lock')), false);
    assert.equal(fs.existsSync(path.join(h.state, 'broker/broker-owner.gate')), false);
    t.diagnostic('verified crash boundaries: ' + covered.size);
  });
});

test('mixed repair rejects substituted archive/source inode and nonmonotonic visible recovery state', { timeout: 90000 }, async t => {
  const h = await fixture(t), p = await h.plan(); let hit = false;
  h.crashAfter(e => { if (!hit && e.method === 'renameSync') { hit = true; throw Error('simulated crash'); } });
  await assert.rejects(h.run('apply', p.planHash), /simulated crash/); h.clearFault(); h.die();
  const archived = path.join(h.repairDir, 'foreign-history/0'), bytes = fs.readFileSync(archived); fs.renameSync(archived, archived + '.other'); write(archived, bytes);
  await assert.rejects(h.run('recover', p.planHash), code('repair_nonmonotonic_prefix'));
  assert.equal(fs.existsSync(path.join(h.root, 'install.lock')), true);
});
