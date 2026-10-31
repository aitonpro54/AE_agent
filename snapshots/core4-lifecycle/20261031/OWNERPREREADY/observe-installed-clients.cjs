'use strict';
// Observation via the installed standard MCP client, not a configured-client proof.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), readline = require('node:readline'), os = require('node:os');
const meta = JSON.parse(fs.readFileSync(path.join(__dirname, 'transition.json')));
require(path.join(meta.output, 'tools/standalone-installer')).verifyStandalone(meta.output, meta.distributionHash);
const d = require(path.join(meta.output, 'runtime/stdio-entry')).verifyInstallation(meta.descriptorPath);
const clientPath = path.join(d.installRoot, 'core-client.json');
require(path.join(meta.output, 'runtime/client-entry')).verifyClientDescriptor(clientPath);
const mode = process.argv[2] === 'after-panel' ? 'after-panel' : 'first-call';
const reportPath = path.join(__dirname, mode === 'after-panel' ? 'stdio-after-panel.json' : 'stdio-first-call.json');
if (fs.existsSync(reportPath)) throw Error('observation_already_recorded');
const clients = [];
async function attach() {
  const env = { USERPROFILE: os.userInfo().homedir, NODE_OPTIONS: '', NODE_PATH: '', NODE_V8_COVERAGE: '' };
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'LOCALAPPDATA', 'APPDATA']) if (process.env[key]) env[key] = process.env[key];
  const child = cp.spawn(d.nodePath, [path.join(d.releaseDir, 'runtime/client-entry.js'), '--client-descriptor', clientPath], { env, cwd: d.releaseDir, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map(); let sequence = 0, stderrBytes = 0;
  const lines = readline.createInterface({ input: child.stdout });
  function rejectAll() { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Error('stdio_closed')); } pending.clear(); }
  lines.on('line', line => { const value = JSON.parse(line), p = pending.get(value.id); if (!p) return; pending.delete(value.id); clearTimeout(p.timer); value.error ? p.reject(Error(value.error.message || 'stdio_rpc_failed')) : p.resolve(value.result); });
  child.on('error', rejectAll); child.on('exit', rejectAll); child.stderr.on('data', data => { stderrBytes += data.length; });
  const client = { child, call(method, params) { const id = ++sequence; return new Promise((resolve, reject) => { const timer = setTimeout(() => { pending.delete(id); reject(Error('stdio_read_timeout')); }, 20000); pending.set(id, { resolve, reject, timer }); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); }); },
    async tool(name) { const reply = await this.call('tools/call', { name, arguments: { payload: {} } }); if (reply.isError) throw Error('stdio_tool_error'); return JSON.parse(reply.content.find(c => c.type === 'text').text); },
    async close() { if (child.exitCode !== null || child.signalCode !== null) return; const done = new Promise(resolve => child.once('exit', resolve)); child.stdin.end(); await Promise.race([done, new Promise((_, reject) => { const timer = setTimeout(() => reject(Error('stdio_eof_timeout')), 5000); timer.unref(); })]); }, stderrBytes: () => stderrBytes };
  clients.push(client); const initialized = await client.call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'core4-installed-observer', version: '1' } });
  if (initialized.serverInfo?.version !== '4.0.0') throw Error('stdio_initialize_version');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n'); return client;
}
(async () => {
  try {
    const first = await attach(), firstCallStart = performance.now(), one = await first.tool('core_status'), firstCallMs = performance.now() - firstCallStart;
    if (!one.ready || one.ownershipFault || one.ledgerFault || one.unresolved.length || one.physical.unknown) throw Error('owner_not_ready_or_fenced');
    if (one.installation?.packageHash !== meta.packageHash) throw Error('stdio_package_pin');
    const second = await attach(), two = await second.tool('core_status');
    if (one.pid !== two.pid) throw Error('multiple_runtime_owners');
    await first.close(); const afterFirstEOF = await second.tool('core_status');
    if (afterFirstEOF.pid !== one.pid) throw Error('owner_changed_on_client_eof');
    await second.close();
    const observed = await require(path.join(meta.output, 'runtime/windows-owner-process')).observeOwnerProcess(one.pid);
    if (observed.status !== 'present' || observed.birthTicks !== one.lifecycle.birthTicks) throw Error('owner_identity_changed_after_eof');
    const report = { collectedAt: new Date().toISOString(), mode, firstCallMs, standaloneProof: true, configuredClientProof: false, packageHash: one.installation.packageHash, pid: one.pid, ready: one.ready, connection: one.connection, ownershipFault: one.ownershipFault, ledgerFault: one.ledgerFault, unresolved: one.unresolved, physical: one.physical, lifecycle: one.lifecycle, twoClientsSameOwner: true, firstEOFKeptOwner: true, bothClientsEOF: true, processAfterEOF: observed.status, automaticLifecycle: one.automaticLifecycle, aeDispatches: 0 };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), { flag: 'wx' }); console.log(JSON.stringify(report));
  } finally { for (const client of clients) await client.close().catch(() => {}); }
})().catch(error => { console.error(JSON.stringify({ error: error.message })); process.exitCode = 1; });
