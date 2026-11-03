'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const childFixture = path.join(__dirname, 'fixtures/attachment-process.js');

function child(mode, endpoint, t) {
  const process = spawn(global.process.execPath, [childFixture, mode, endpoint], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let buffer = '', serial = 0, stderr = ''; const rows = [], waiting = new Map();
  process.stderr.on('data', chunk => { stderr += chunk; });
  process.stdout.on('data', chunk => {
    buffer += chunk;
    for (;;) {
      const at = buffer.indexOf('\n'); if (at < 0) break;
      const value = JSON.parse(buffer.slice(0, at)); buffer = buffer.slice(at + 1); rows.push(value);
      const entry = waiting.get(value.id); if (entry) { waiting.delete(value.id); clearTimeout(entry.timer); entry.resolve(value); }
    }
  });
  process.once('exit', () => { for (const entry of waiting.values()) { clearTimeout(entry.timer); entry.reject(new Error('fixture_child_exit:' + stderr)); } waiting.clear(); });
  t.after(() => { if (process.exitCode === null && !process.killed) process.kill(); });
  return { process, rows, get stderr() { return stderr; },
    rpc(method, params) {
      const id = ++serial;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { waiting.delete(id); reject(new Error('fixture_rpc_timeout:' + stderr)); }, 12000);
        waiting.set(id, { resolve, reject, timer }); process.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }) + '\n');
      });
    },
    async tool(name, payload = {}) { const result = await this.rpc('tools/call', { name, arguments: { payload } }); assert.equal(result.error, undefined, JSON.stringify(result)); return JSON.parse(result.result.content[0].text); }
  };
}
async function until(fn) { for (let n = 0; n < 2000; n++) { if (fn()) return; await new Promise(resolve => setTimeout(resolve, 5)); } assert.fail('owner_fixture_startup_timeout'); }
async function end(client) { const exited = once(client.process, 'exit'); client.process.stdin.end(); await exited; assert.equal(client.process.exitCode, 0, client.stderr); }
async function setup(t) {
  const endpoint = global.process.platform === 'win32' ? '\\\\.\\pipe\\core4-test-' + randomUUID() : path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'core4-ipc-')), 'owner.sock');
  const owner = child('owner', endpoint, t); await until(() => owner.rows[0]?.ready || owner.process.exitCode !== null);
  assert.equal(owner.rows[0]?.ready, true, owner.stderr);
  return { owner, endpoint, async shutdown() { const exited = once(owner.process, 'exit'); owner.process.stdin.write('fixture-shutdown\n'); await exited; assert.equal(owner.process.exitCode, 0, owner.stderr); } };
}

test('owner-ipc-process two real stdio clients share one Broker and EOF leaves owner available', { timeout: 25000 }, async t => {
  const f = await setup(t), a = child('client', f.endpoint, t), b = child('client', f.endpoint, t);
  assert.equal((await a.rpc('initialize')).result.serverInfo.name, 'ae-agent-core4'); await b.rpc('initialize');
  const first = await a.tool('core_status'), second = await b.tool('core_status');
  assert.equal(first.pid, f.owner.process.pid); assert.equal(second.pid, first.pid);
  assert.equal(first.attachmentOwner.bootId, second.attachmentOwner.bootId); assert.equal(first.attachmentOwner.generation, 0);
  await a.tool('controller_acquire');
  const busy = await b.rpc('tools/call', { name: 'controller_acquire', arguments: {} }); assert.equal(busy.error.message, 'controller_busy');
  const stateFile = path.join(f.owner.rows[0].fixtureStateDir, 'ledger.ndjson'), before = fs.readFileSync(stateFile);
  await end(a);
  for (let n = 0; n < 100; n++) { const snapshot = await b.tool('owner_status'); if (snapshot.mode === 'idle') break; await new Promise(resolve => setTimeout(resolve, 5)); }
  const afterEOF = await b.tool('core_status'); assert.equal(afterEOF.pid, first.pid); assert.equal(afterEOF.closed, false);
  assert.ok(fs.readFileSync(stateFile).equals(before)); await b.tool('controller_acquire');
  await end(b); await f.shutdown();
});
test('owner-ipc-process actual TEMP Broker inspection/build flow is scoped to controller generation', { timeout: 25000 }, async t => {
  const f = await setup(t), a = child('client', f.endpoint, t), b = child('client', f.endpoint, t);
  const lease = await a.tool('controller_acquire'); await a.tool('core_connect');
  const contract = await a.tool('get_module_contract', { moduleId: 'titles' });
  // Exact identity comes from this child synthetic host, never a production adoption.
  const resource = f.owner.rows[0].fixtureTarget;
  const stateFile = path.join(f.owner.rows[0].fixtureStateDir, 'ledger.ndjson'), before = fs.readFileSync(stateFile);
  const invalid = await a.rpc('tools/call', { name: 'inspect_module_target', arguments: { payload: { moduleId: 'titles', target: resource } } });
  assert.equal(invalid.error.message, 'owner_inspection_contract_required');
  assert.deepEqual(invalid.error.data, { nextAction: 'get_module_contract' });
  assert.ok(fs.readFileSync(stateFile).equals(before)); assert.equal((await a.tool('owner_status')).accepted, 0);
  const observed = await a.tool('inspect_module_target', { moduleId: 'titles', contractId: contract.contractId, target: resource });
  const built = await a.tool('build_solution_plan', { workflowId: 'owner-fixture', recordContext: { purpose: 'technical_check', lifetime: 'ephemeral_check', contextId: 'owner-ipc-process', project: { file: resource.projectId }, resources: [{ kind: 'project', identity: resource.projectId }] }, steps: [{ stepId: 'title', moduleId: 'titles', contractId: contract.contractId, evidenceRef: observed.evidenceRef, input: { ...resource, text: 'R2 fixture' }, dependsOn: [] }] });
  const proposed = await a.tool('propose_plan', { buildId: built.buildId }); assert.equal(typeof proposed.proposalId, 'string');
  await a.tool('controller_release', { leaseToken: lease.leaseToken }); await b.tool('controller_acquire');
  const old = await b.rpc('tools/call', { name: 'dry_run_plan', arguments: { payload: { proposalId: proposed.proposalId } } });
  assert.equal(old.error.message, 'owner_reference_generation');
  await end(a); await end(b); await f.shutdown();
});
