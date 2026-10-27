'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { harness } = require('./fixtures/manual-http-runtime');
const { PRODUCTION_TIMING } = require('../runtime/stdio-entry');
const { configText } = require('../tools/install-core4');
test('human-window actual stdio child completes confirmed mutation after former two-second caller deadline', async t => {
  const child = spawn(process.execPath, [path.join(__dirname, 'fixtures/human-window-stdio.js')], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }); t.after(() => { if (child.exitCode === null) child.kill(); });
  const pending = new Map(); let serial = 0, text = '', errors = '';
  child.stderr.on('data', bytes => errors += bytes);
  child.stdout.on('data', bytes => { text += bytes; let at; while ((at = text.indexOf('\n')) >= 0) { const value = JSON.parse(text.slice(0, at)); text = text.slice(at + 1); pending.get(value.id)?.resolve(value); pending.delete(value.id); } });
  child.on('exit', () => { for (const item of pending.values()) item.reject(new Error('child_exited:' + errors)); });
  async function rpc(method, params) { const id = ++serial; let timer; const response = new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); timer = setTimeout(() => reject(new Error('fixture_rpc_timeout:' + errors)), 15000); }); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }) + '\n'); try { const value = await response; assert.equal(value.error, undefined, JSON.stringify(value)); return value.result; } finally { clearTimeout(timer); } }
  async function tool(name, payload = {}) { const response = await rpc('tools/call', { name, arguments: { payload }, _meta: { progressToken: 'human-window-fixture' } }); return JSON.parse(response.content[0].text); }
  await rpc('initialize');
  const contract = await tool('get_module_contract', { moduleId: 'titles-current-target' }), target = { projectId: 'C:/fixture/project.aep', compId: 1, layerId: 102 };
  const inspected = await tool('inspect_module_target', { moduleId: 'titles-current-target', contractId: contract.contractId, target });
  const built = await tool('build_solution_plan', { oneStep: true, steps: [{ stepId: 'title', moduleId: 'titles-current-target', contractId: contract.contractId, evidenceRef: inspected.evidenceRef, input: { ...target, text: 'After human confirmation' } }] });
  const proposed = await tool('propose_plan', { buildId: built.buildId }), dry = await tool('dry_run_plan', { proposalId: proposed.proposalId }), started = Date.now();
  const result = await tool('run_plan', { proposalId: proposed.proposalId, dryrunRef: dry.dryrunRef });
  assert.ok(Date.now() - started >= 2500); assert.equal(result.state, 'succeeded', JSON.stringify(result)); assert.equal(result.outputs.title.text, 'After human confirmation');
  const task = await tool('get_task', { taskId: built.taskId }); assert.equal(task.commands.length, 1); assert.equal(task.commands[0].state, 'succeeded');
  child.stdin.end(); await once(child, 'exit'); assert.equal(child.exitCode, 0); assert.equal(errors, '');
});
test('human-window physical callback deadline remains UNKNOWN after late confirmation and prevents replay', async t => {
  const h = await harness({ humanDelayMs: 150, callerTimeout: 400, callbackTimeout: 50 }); t.after(() => h.close());
  const request = await h.proposal(), result = await h.broker.run(request); assert.equal(result.state, 'stopped'); assert.equal(h.broker.ledger.commands()[0].state, 'UNKNOWN'); assert.equal(h.peer.status().storeClosed, true);
  await new Promise(resolve => setTimeout(resolve, 200)); assert.equal(h.state.counts.titles, 1, 'late host decision may still apply; timeout is not cancellation');
  assert.equal((await h.broker.reconcile({ taskId: request.taskId })).commands[0].state, 'UNKNOWN'); await assert.rejects(h.proposal('Replay forbidden')); assert.equal(h.state.counts.titles, 1);
});
test('human-window private production ordering and MCP default preserve explicit user timeout and enabled preferences', () => {
  assert.deepEqual(PRODUCTION_TIMING, { callerTimeoutMs: 100000, callbackTimeoutMs: 90000, mcpToolTimeoutSec: 120 });
  const before = Buffer.from('[mcp_servers.after-effects-core4] # own\n enabled = false # stay disabled\n tool_timeout_sec = 45 # user choice\ncommand = "old"\n [mcp_servers.other] # unchanged\ncommand = "other"\n');
  const result = configText(before, 'C:/descriptor.json', 'C:/node.exe', 'C:/entry.js'); assert.ok(result.includes(' enabled = false # stay disabled\n')); assert.ok(result.includes(' tool_timeout_sec = 45 # user choice\n')); assert.ok(result.endsWith(' [mcp_servers.other] # unchanged\ncommand = "other"\n')); assert.ok(!result.includes('tool_timeout_sec = 120'));
  assert.ok(configText(null, 'C:/descriptor.json', 'C:/node.exe', 'C:/entry.js').includes('tool_timeout_sec = 120'));
  assert.throws(() => configText(Buffer.from('[mcp_servers.after-effects-core4]\ntool_timeout_sec = 120\n"tool_timeout_sec" = 60\n'), 'C:/descriptor.json', 'C:/node.exe', 'C:/entry.js'), /config_duplicate_timeout_preference/);
  assert.throws(() => configText(Buffer.from('[mcp_servers.after-effects-core4]\ntool_timeout_sec = 0\n'), 'C:/descriptor.json', 'C:/node.exe', 'C:/entry.js'), /config_timeout_preference_requires_review/);
});
