'use strict';
// Offline TEMP/VM and loopback tests only. No installed AE or production state.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const { createAePanelStartup, validateStartupInput, collisionPreflight, ownsRegistryBootstrap } = require('../runtime/ae-panel-startup');
const { createAttachmentOwner } = require('../runtime/attachment-owner');
const { buildPackage } = require('../tools/package-installable');
const { identity, verify } = require('../integrations/cep/panel-identity');
const { createHttpPeer } = require('../integrations/cep/http-peer');
const { hash, canonical } = require('../protocol/json');
const { mac } = require('../integrations/cep/peer-protocol');
const id = '10000000-0000-4000-8000-000000000001', other = '10000000-0000-4000-8000-000000000002';
const source = path.resolve(__dirname, '..'), fixed = fs.readFileSync(path.join(source, 'runtime/host/ensure-panel.jsx'), 'utf8');
const facts = { appVersion: '26.3', projectPresent: true, file: null, dirty: false, numItems: 0 };
function harness(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'core4 startup spaces ')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const stateDir = path.join(dir, 'state'); fs.mkdirSync(stateDir);
  const executablePath = path.join(dir, 'AfterFX.exe'); fs.writeFileSync(executablePath, 'fixture-executable-never-launched');
  const installation = { installationId: 'fixture', machineId: 'fixture-machine', packageHash: 'a'.repeat(64), stateDir, releaseDir: source, cepDir: path.join(dir, 'extensions/com.codex.aeagentcore4') };
  fs.writeFileSync(path.join(stateDir, 'host-adoption.json'), canonical({ version: 1, installationId: 'fixture', machineId: installation.machineId, host: { machineId: installation.machineId, executablePath, executableHash: hash(fs.readFileSync(executablePath)) } }));
  let scans = 0, preflights = 0, connection = 0;
  let time = 1000, connected = false, rows = options.absent ? [] : [{ pid: 123, birth: '2026-01-01T00:00:00.0000000Z', executablePath }], launches = [], idle = true, reverified = 0;
  const expected = options.expected || { protocolVersion: 1, productVersion: '4.2.6', panelBuildId: 'b'.repeat(64), extensionId: 'com.codex.aeagentcore4.panel' };
  const context = { assertCurrent() { if (options.fenced) throw new Error('fenced'); } };
  function writeAck(directory, code = 'menu_executed', operationId = path.basename(directory)) {
    const request = JSON.parse(fs.readFileSync(path.join(directory, 'request.json')));
    fs.writeFileSync(path.join(directory, 'ack.json'), JSON.stringify({ code, operationId, requestNonce: request.requestNonce, deadline: request.deadline, checkedAt: time, hostFacts: facts }));
  }
  function ack(code = 'menu_executed', operationId = id) { writeAck(path.join(stateDir, 'panel-startup', id), code, operationId); }
  const readyChecks = [], childEnvironment = { USERPROFILE: 'C:\\Users\\Fixture', APPDATA: 'C:\\Users\\Fixture\\AppData\\Roaming', PATH: 'fixture-explicit-only' };
  const service = createAePanelStartup({ installation, expectedIdentity: expected, peerStatus: options.peerStatus || (() => ({ peer: { connected, acceptedIdentity: expected, peerId: 'fixture-peer-' + connection, identityEpoch: 'fixture-epoch', identityObservedAt: connection } })),
    assertIdle(request) { if (!idle) throw new Error('startup_lane_busy'); if (options.assertIdle) options.assertIdle(request); }, reverify() { reverified++; if (reverified === options.reverifyFailAt) throw new Error('startup_reverify_failed'); }, observeSubmission: async pid => ({ pid, status: options.submissionPresent ? 'present' : 'absent' }), preflight() { if (++preflights === options.preflightFailAt) throw new Error('startup_preflight_failed'); }, now: () => time,
    environment: () => childEnvironment, readiness: async host => { readyChecks.push(structuredClone(host)); if (options.readinessHook) return options.readinessHook(host); const state = options.readinessState || 'window-responsive'; return { state, pid: host.pid, birth: host.birth, dialogs: state === 'modal-observed' ? ['1'] : [] }; },
    scan: async () => { if (++scans === options.scanFailAt) throw new Error('startup_scan_failed'); return structuredClone(rows); },
    wait: async ms => { time += ms; if (options.waitHook) await options.waitHook(); if (options.forwarding && rows.length === 2) rows = rows.slice(0, 1); },
    launch: async (exe, args, launchOptions) => {
      launches.push({ exe, args, options: launchOptions });
      if (args.length === 0) { if (options.guiLaunchHook) await options.guiLaunchHook(); if (!options.guiNoHost) rows = [{ pid: 123, birth: '2026-01-01T00:00:00.0000000Z', executablePath }]; return { pid: 123 }; }
      if (options.launchHook) await options.launchHook();
      if (!options.timeout) {
        rows = [{ pid: 123, birth: '2026-01-01T00:00:00.0000000Z', executablePath }]; writeAck(path.dirname(args[1]), options.stale ? 'requires_host_restart' : 'menu_executed');
        connected = !options.stale; if (!options.staleConnected) connection++;
        if (options.forwarding) { rows.push({ pid: 456, birth: '2026-01-01T00:00:01.0000000Z', executablePath }); return { pid: 456 }; }
      }
      if (options.submission) return { pid: 456 };
    } });
  return { service, installation, context, launches, ack, expected, executablePath, readyChecks, childEnvironment, get reverified() { return reverified; }, connect() { connected = true; connection++; }, busy() { idle = false; }, rows(value) { rows = value; }, advance(ms) { time += ms; } };
}
test('ae-panel-startup cold absent launches exact executable with one fixed -r asset and authentic panel', async t => {
  const f = harness(t, { absent: true }), result = await f.service.ensure({ operationId: id, timeoutMs: 1000 }, f.context);
  assert.equal(result.outcome, 'ready'); assert.equal(result.nativeVerified, false); assert.equal(f.launches.length, 2); assert.equal(f.launches[0].exe, f.executablePath);
  assert.deepEqual(f.launches[0].args, []); assert.equal(f.launches[0].options.windowsHide, false); assert.equal(f.launches[1].options.windowsHide, true); assert.equal(f.launches[0].options.env, f.childEnvironment);
  assert.deepEqual(f.launches[1].args, ['-r', path.join(f.installation.stateDir, 'panel-startup', id, 'bootstrap.jsx')]); assert.equal(f.reverified, 3);
  assert.equal((await f.service.ensure({ operationId: id }, f.context)).outcome, 'ready'); assert.equal(f.launches.length, 2);
});
test('ae-panel-startup existing connected host is idempotent and keeps PID/birth without dispatch', async t => {
  const f = harness(t); f.connect(); assert.equal((await f.service.ensure({ operationId: id }, f.context)).outcome, 'ready'); assert.equal(f.launches.length, 0);
  assert.equal(f.service.status({ operationId: id }).attempt.original.pid, 123);
  const restored = createAePanelStartup({ installation: f.installation, expectedIdentity: f.expected, peerStatus: () => ({ peer: { connected: false } }), assertIdle() {}, launch() { assert.fail('restored UUID must not dispatch'); } });
  assert.equal(restored.status({ operationId: id }).completion.code, 'already_authenticated'); assert.equal((await restored.ensure({ operationId: id }, f.context)).outcome, 'ready'); assert.equal(restored.status({ operationId: id }).panel, null);
});
test('ae-panel-startup existing host waits for its exact forwarding CLI to exit before accepting readiness', async t => {
  const f = harness(t, { forwarding: true }); assert.equal((await f.service.ensure({ operationId: id }, f.context)).outcome, 'ready'); assert.equal(f.launches.length, 1); assert.equal(f.service.status({ operationId: id }).attempt.original.pid, 123);
});
test('ae-panel-startup v3 cold GUI is visible and bootstrap waits for exact responsive modal-free host', async t => {
  let calls = 0;
  const f = harness(t, { absent: true, readinessHook(host) { calls++; assert.deepEqual(f.launches.map(call => call.args), [[]]); return { pid: host.pid, birth: host.birth, state: calls === 1 ? 'starting-or-hidden' : 'window-responsive', dialogs: [] }; } });
  const result = await f.service.ensure({ operationId: id }, f.context); assert.equal(result.outcome, 'ready'); assert.equal(calls, 2); assert.deepEqual(f.launches[0].args, []); assert.equal(f.launches[0].options.windowsHide, false); assert.equal(f.launches[1].args[0], '-r');
  const directory = path.join(f.installation.stateDir, 'panel-startup', id); assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'attempt.json'))).dispatchProtocol, 3);
  for (const name of ['gui-launch-entered.json', 'gui-submission.json', 'gui-host.json', 'bootstrap-dispatch-entered.json']) assert.ok(fs.existsSync(path.join(directory, name)));
  const host = JSON.parse(fs.readFileSync(path.join(directory, 'gui-host.json'))); assert.equal(host.pid, 123); assert.equal(host.executableHash, hash(fs.readFileSync(f.executablePath)));
});
test('ae-panel-startup v3 warm uses only -r and modal/unresponsive/hidden hosts never receive bootstrap', async t => {
  const ready = harness(t); assert.equal((await ready.service.ensure({ operationId: id }, ready.context)).outcome, 'ready'); assert.equal(ready.launches.length, 1); assert.equal(ready.launches[0].args[0], '-r'); assert.equal(ready.launches[0].options.env, ready.childEnvironment);
  for (const readinessState of ['modal-observed', 'unresponsive', 'starting-or-hidden', 'window-unobserved']) {
    const f = harness(t, { readinessState }), result = await f.service.ensure({ operationId: id, timeoutMs: 1000 }, f.context); assert.equal(result.outcome, 'rejected'); assert.equal(f.launches.length, 0); assert.equal(f.service.activity().unresolved, false);
  }
});
test('ae-panel-startup v3 readiness PID or birth mismatch never authorizes bootstrap', async t => {
  for (const changed of ['pid', 'birth']) {
    const f = harness(t, { readinessHook(host) { return { state: 'window-responsive', pid: changed === 'pid' ? host.pid + 1 : host.pid, birth: changed === 'birth' ? '2026-01-02T00:00:00.0000000Z' : host.birth, dialogs: [] }; } });
    const result = await f.service.ensure({ operationId: id }, f.context); assert.equal(result.code, 'rejected_before_dispatch'); assert.equal(result.completion.reason, 'startup_readiness_identity'); assert.equal(f.launches.length, 0);
  }
});
test('ae-panel-startup v3 actual fixture owner exit after GUI host publication is recovered as GUI-only without replay', async t => {
  const f = harness(t), childSource = "const {createAePanelStartup}=require(process.argv[1]);const d=JSON.parse(process.argv[2]);let rows=[];const service=createAePanelStartup({installation:d.installation,expectedIdentity:d.expected,peerStatus:()=>({peer:{connected:false}}),assertIdle(){},preflight(){},reverify(){},environment:()=>({}),scan:async()=>rows,launch:async(exe,args)=>{if(args.length)throw Error('bootstrap_forbidden');rows=[{pid:123,birth:'2026-01-01T00:00:00.0000000Z',executablePath:exe}];return{pid:123};},readiness:async()=>process.exit(0)});service.ensure({operationId:d.id},{assertCurrent(){}}).then(()=>{process.exitCode=2;}).catch(e=>{console.error(e.message);process.exitCode=3;});";
  const child = require('node:child_process').spawnSync(process.execPath, ['-e', childSource, require.resolve('../runtime/ae-panel-startup'), JSON.stringify({ installation: f.installation, expected: f.expected, id })], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
  assert.equal(child.status, 0, child.stderr); const directory = path.join(f.installation.stateDir, 'panel-startup', id);
  assert.ok(fs.existsSync(path.join(directory, 'gui-host.json'))); assert.equal(fs.existsSync(path.join(directory, 'result.json')), false); assert.equal(fs.existsSync(path.join(directory, 'bootstrap-dispatch-entered.json')), false);
  const result = await f.service.observe({ operationId: id }); assert.equal(result.code, 'blocked_before_bootstrap'); assert.equal(result.completion.coldHostStarted, true); assert.equal(result.completion.host.pid, 123); assert.equal((await f.service.ensure({ operationId: id }, f.context)).code, 'blocked_before_bootstrap'); assert.equal(f.launches.length, 0);
});
test('ae-panel-startup v3 GUI-only modal or lease failure retains hostStarted, clears only startup gate, and never replays stages', async t => {
  for (const failure of ['modal', 'lease']) {
    const options = { absent: true, ...(failure === 'modal' ? { readinessState: 'modal-observed' } : { guiLaunchHook() { options.fenced = true; } }) }, f = harness(t, options);
    const result = await f.service.ensure({ operationId: id }, f.context); assert.equal(result.code, 'blocked_before_bootstrap'); assert.equal(result.completion.coldHostStarted, true); assert.equal(result.completion.host.pid, 123); assert.deepEqual(f.launches.map(call => call.args), [[]]); assert.equal(f.service.activity().unresolved, false);
    options.fenced = false; assert.equal((await f.service.ensure({ operationId: id }, f.context)).code, 'blocked_before_bootstrap'); assert.equal(f.launches.length, 1);
  }
});
test('ae-panel-startup v3 crash at GUI or bootstrap external boundary never replays that UUID', async t => {
  const cold = harness(t, { absent: true, guiLaunchHook() { throw new Error('fixture_gui_unknown'); } }); assert.equal((await cold.service.ensure({ operationId: id }, cold.context)).outcome, 'unknown'); assert.equal((await cold.service.ensure({ operationId: id }, cold.context)).outcome, 'unknown'); assert.equal(cold.launches.length, 1);
  const warm = harness(t, { launchHook() { throw new Error('fixture_bootstrap_unknown'); } }); assert.equal((await warm.service.ensure({ operationId: id }, warm.context)).outcome, 'unknown'); assert.equal((await warm.service.ensure({ operationId: id }, warm.context)).outcome, 'unknown'); assert.equal(warm.launches.length, 1);
});
test('ae-panel-startup v3 exact positive expired ACK settles startup only; time or executing absence never substitutes', async t => {
  const f = harness(t, { timeout: true }); await f.service.ensure({ operationId: id, timeoutMs: 1000 }, f.context); assert.equal((await f.service.observe({ operationId: id })).outcome, 'unknown'); f.ack('expired_before_menu');
  const result = await f.service.observe({ operationId: id }); assert.equal(result.code, 'expired_before_menu'); assert.equal(result.completion.nativeMenuSubmitted, false); assert.equal(f.launches.length, 1); assert.equal(f.service.activity().unresolved, false);
  for (const executing of ['', '{', '{"operationId":"' + id + '"}']) { const held = harness(t, { timeout: true }); await held.service.ensure({ operationId: id, timeoutMs: 1000 }, held.context); fs.writeFileSync(path.join(held.installation.stateDir, 'panel-startup', id, 'executing.json'), executing); assert.equal((await held.service.observe({ operationId: id })).outcome, 'unknown'); assert.equal(held.launches.length, 1); }
});
test('ae-panel-startup v3 clock-back, changed request/bootstrap or malformed ACK cannot settle by expiry', async t => {
  for (const changed of ['clock', 'request.json', 'bootstrap.jsx', 'ack.json']) {
    const f = harness(t, { timeout: true }); await f.service.ensure({ operationId: id, timeoutMs: 1000 }, f.context); f.ack('expired_before_menu'); const directory = path.join(f.installation.stateDir, 'panel-startup', id);
    if (changed === 'clock') f.advance(-1000); else fs.appendFileSync(path.join(directory, changed), changed === 'ack.json' ? '{' : ' ');
    if (changed === 'ack.json') await assert.rejects(f.service.observe({ operationId: id })); else assert.equal((await f.service.observe({ operationId: id })).outcome, 'unknown');
    assert.equal(f.service.activity().unresolved, true); assert.equal(f.launches.length, 1);
  }
});
test('ae-panel-startup cached connected peer with no AE still launches cold and requires a new accepted peer', async t => {
  const f = harness(t, { absent: true }); f.connect(); const before = f.service.activity(); assert.equal(before.pending, false);
  const result = await f.service.ensure({ operationId: id, timeoutMs: 1000 }, f.context); assert.equal(f.launches.length, 2); assert.equal(result.outcome, 'ready'); assert.equal(result.completion.host.pid, 123);
  const stale = harness(t, { absent: true, staleConnected: true }); stale.connect(); assert.equal((await stale.service.ensure({ operationId: id, timeoutMs: 1000 }, stale.context)).outcome, 'unknown'); assert.equal(stale.launches.length, 2);
});
test('ae-panel-startup expired warm host plus absent own forwarder interrupts only startup and preserves receiver UNKNOWN', async t => {
  const f = harness(t, { timeout: true, submission: true }); assert.equal((await f.service.ensure({ operationId: id, timeoutMs: 1000 }, f.context)).outcome, 'unknown'); f.rows([]);
  const { openCompletionStore } = require('../integrations/cep/completion-store'), { dispatchBinding } = require('../protocol/dispatch');
  const directory = path.join(f.installation.stateDir, 'receiver'), store = openCompletionStore({ directory }), payload = {};
  const command = { protocolVersion: 1, controllerId: 'fixture', channelEpoch: 'old-epoch', commandId: 'old-registry', moduleId: 'registry-bootstrap', operationId: 'verify-registry', executorHash: 'a'.repeat(64), phase: 'inspect', payloadHash: hash(payload), payload };
  store.begin(command, dispatchBinding(command, store.identity)); store.unknown(command.commandId); store.close();
  const file = path.join(directory, 'completions.ndjson'), original = fs.readFileSync(file);
  assert.equal((await f.service.observe({ operationId: id })).outcome, 'interrupted'); assert.equal(f.service.activity().unresolved, false); assert.equal(f.launches.length, 1); assert.deepEqual(fs.readFileSync(file), original);
  assert.equal(require('../runtime/recovery-inspection').inspectReceiverHistory(original).settled, false);
});
test('ae-panel-startup before deadline or live own forwarder cannot retire UNKNOWN startup', async t => {
  const options = { timeout: true, submission: true, waitHook() { options.fenced = true; } }, before = harness(t, options);
  assert.equal((await before.service.ensure({ operationId: id, timeoutMs: 10000 }, before.context)).outcome, 'unknown'); before.rows([]); assert.equal((await before.service.observe({ operationId: id })).outcome, 'unknown');
  const live = harness(t, { timeout: true, submission: true, submissionPresent: true }); await live.service.ensure({ operationId: id, timeoutMs: 1000 }, live.context); live.rows([]); assert.equal((await live.service.observe({ operationId: id })).outcome, 'unknown'); assert.equal(live.service.activity().unresolved, true);
});
test('ae-panel-startup new AE B never proves old warm A ready; after deadline it records interrupted without replay', async t => {
  const f = harness(t, { timeout: true, submission: true }); await f.service.ensure({ operationId: id, timeoutMs: 1000 }, f.context); f.rows([{ pid: 999, birth: '2026-01-02T00:00:00.0000000Z', executablePath: f.executablePath }]); f.ack(); f.connect();
  const result = await f.service.observe({ operationId: id }); assert.equal(result.outcome, 'interrupted'); assert.equal(result.completion.original.pid, 123); assert.equal(f.launches.length, 1);
});
test('ae-panel-startup redirected state ancestor cannot receive request/bootstrap writes', async t => {
  const f = harness(t), destination = path.join(path.dirname(f.installation.stateDir), 'redirect'); fs.mkdirSync(destination);
  fs.symlinkSync(destination, path.join(f.installation.stateDir, 'panel-startup'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal((await f.service.ensure({ operationId: id }, f.context)).code, 'startup_path_redirected'); assert.equal(f.launches.length, 0); assert.deepEqual(fs.readdirSync(destination), []);
});
test('ae-panel-startup reads a stable readoption two-link adoption locator without changing its history alias', async t => {
  const f = harness(t), adoption = path.join(f.installation.stateDir, 'host-adoption.json');
  const preparation = path.join(path.dirname(f.installation.stateDir), 'transactions/readopt-preparation-' + id); fs.mkdirSync(preparation, { recursive: true });
  const anchor = path.join(preparation, 'replacement.json'); fs.linkSync(adoption, anchor); const original = fs.readFileSync(anchor), inode = fs.statSync(anchor).ino;
  assert.equal(fs.statSync(adoption).nlink, 2);
  const result = await f.service.ensure({ operationId: id }, f.context); assert.equal(result.outcome, 'ready'); assert.equal(f.launches.length, 1); assert.equal(result.nativeVerified, false);
  assert.deepEqual(fs.readFileSync(anchor), original); assert.deepEqual(fs.readFileSync(adoption), original); assert.equal(fs.statSync(adoption).ino, inode); assert.equal(fs.statSync(anchor).nlink, 2);
});
test('ae-panel-startup hardlink allowance is confined to adoption data, never executable or state receipts', async t => {
  const code = harness(t); fs.linkSync(code.executablePath, path.join(path.dirname(code.executablePath), 'executable-history-link'));
  assert.equal((await code.service.ensure({ operationId: id }, code.context)).code, 'startup_path_redirected'); assert.equal(code.launches.length, 0);
  const state = harness(t, { timeout: true }); await state.service.ensure({ operationId: id, timeoutMs: 1000 }, state.context);
  const attempt = path.join(state.installation.stateDir, 'panel-startup', id, 'attempt.json'); fs.linkSync(attempt, attempt + '.history');
  await assert.rejects(state.service.observe({ operationId: id }), /startup_path_redirected/); assert.equal(state.launches.length, 1);
  const cep = harness(t), manifest = path.join(cep.installation.cepDir, 'CSXS/manifest.xml'); fs.mkdirSync(path.dirname(manifest), { recursive: true }); fs.copyFileSync(path.join(source, 'cep/CSXS/manifest.xml'), manifest); fs.linkSync(manifest, manifest + '.history');
  assert.throws(() => collisionPreflight(cep.installation, cep.executablePath, [path.dirname(cep.installation.cepDir)]), /startup_path_redirected/);
  const release = harness(t), privateRoot = path.join(path.dirname(release.installation.stateDir), 'release'), script = path.join(privateRoot, 'runtime/host/ensure-panel.jsx'); fs.mkdirSync(path.dirname(script), { recursive: true }); fs.writeFileSync(script, fixed); fs.linkSync(script, script + '.history'); release.installation.releaseDir = privateRoot;
  assert.equal((await release.service.ensure({ operationId: id }, release.context)).code, 'startup_path_redirected'); assert.equal(release.launches.length, 0);
  const missing = harness(t); fs.unlinkSync(path.join(missing.installation.stateDir, 'host-adoption.json')); assert.equal((await missing.service.ensure({ operationId: id }, missing.context)).code, 'startup_executable_binding_required');
});
test('ae-panel-startup linked adoption still rejects directory redirection and a changing link identity', async t => {
  const f = harness(t), adoption = path.join(f.installation.stateDir, 'host-adoption.json'), alias = adoption + '.anchor'; fs.linkSync(adoption, alias);
  const originalOpen = fs.openSync, originalRead = fs.readFileSync; let adoptionFd, altered = false;
  const open = t.mock.method(fs, 'openSync', function (file, ...args) { const fd = originalOpen.call(fs, file, ...args); if (file === adoption) adoptionFd = fd; return fd; });
  const read = t.mock.method(fs, 'readFileSync', function (file, ...args) { const value = originalRead.call(fs, file, ...args); if (file === adoptionFd && !altered) { altered = true; fs.linkSync(adoption, adoption + '.unexpected-alias'); } return value; });
  const result = await f.service.ensure({ operationId: id }, f.context); open.mock.restore(); read.mock.restore();
  assert.equal(result.code, 'startup_file_changed'); assert.equal(f.launches.length, 0);
  const redirected = harness(t), canonical = redirected.installation.stateDir, target = canonical + '-target'; fs.renameSync(canonical, target); fs.symlinkSync(target, canonical, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal((await redirected.service.ensure({ operationId: id }, redirected.context)).code, 'startup_path_redirected'); assert.equal(redirected.launches.length, 0);
});
test('ae-panel-startup adoption locator enforces its data budget before reading payload', async t => {
  const f = harness(t), adoption = path.join(f.installation.stateDir, 'host-adoption.json'); fs.appendFileSync(adoption, ' '.repeat(64 * 1024));
  const result = await f.service.ensure({ operationId: id }, f.context); assert.equal(result.code, 'startup_file_budget'); assert.equal(f.launches.length, 0);
});
test('ae-panel-startup multiple AE and busy/UNKNOWN lane reject without dispatch', async t => {
  const f = harness(t); f.rows([{ pid: 1 }, { pid: 2 }]); assert.equal((await f.service.ensure({ operationId: id }, f.context)).code, 'startup_ambiguous_ae');
  f.busy(); assert.equal((await f.service.ensure({ operationId: other }, f.context)).code, 'startup_lane_busy'); assert.equal(f.launches.length, 0);
});
test('ae-panel-startup closed input rejects executable/scripts/menu/args and invalid UUID/timeouts', () => {
  for (const value of [{}, { operationId: 'x' }, { operationId: id, timeoutMs: 0 }, { operationId: id, timeoutMs: 90001 }, ...['executable', 'script', 'menuId', 'args'].map(k => ({ operationId: id, [k]: 'x' }))]) assert.throws(() => validateStartupInput(value), /startup_input/);
});
for (const key of ['reverifyFailAt', 'preflightFailAt', 'scanFailAt']) test('ae-panel-startup proven second ' + key + ' failure is rejected before dispatch and permits new UUID', async t => {
  const f = harness(t, { [key]: 2 }), result = await f.service.ensure({ operationId: id }, f.context);
  assert.equal(result.code, 'rejected_before_dispatch'); assert.equal(f.launches.length, 0); assert.equal(f.service.activity().unresolved, false);
  assert.equal((await f.service.ensure({ operationId: other }, f.context)).outcome, 'ready'); assert.equal(f.launches.length, 1);
});
test('ae-panel-startup failed bootstrap write and partial prepared-only directory cannot create a permanent UNKNOWN', async t => {
  const f = harness(t), open = fs.openSync;
  const mock = t.mock.method(fs, 'openSync', function (file, ...args) { if (typeof file === 'string' && path.basename(file).startsWith('bootstrap.jsx.stage-')) throw Object.assign(new Error('fixture_write_denied'), { code: 'EACCES' }); return open.call(fs, file, ...args); });
  const failed = await f.service.ensure({ operationId: id }, f.context); mock.mock.restore(); assert.equal(failed.code, 'rejected_before_dispatch'); assert.equal(f.launches.length, 0);
  assert.equal((await f.service.ensure({ operationId: other }, f.context)).outcome, 'ready');
  const g = harness(t), orphan = path.join(g.installation.stateDir, 'panel-startup', id); fs.mkdirSync(orphan, { recursive: true }); fs.writeFileSync(path.join(orphan, 'request.json'), '{}');
  assert.equal((await g.service.ensure({ operationId: other }, g.context)).outcome, 'ready'); assert.equal(g.service.status({ operationId: id }).code, 'rejected_before_dispatch');
});
test('ae-panel-startup lease expiry retains startup fence for incompatible tools until observer settles original late ACK', async t => {
  let clock = 0, connectedCalls = 0; const f = harness(t, { timeout: true, waitHook() { clock = 2000; } });
  const owner = createAttachmentOwner({ runtime: { status() {}, close() {} }, activity: () => ({ pending: false, unresolved: false, fault: false }), startupGate: () => f.service.activity(), clock: () => clock, ttlMs: 1000,
    async invoke(method, payload, context) { if (method === 'ensureAePanel') return f.service.ensure(payload, context); if (method === 'aePanelStartupStatus') return f.service.observe(payload); connectedCalls++; return {}; } });
  const session = {}; owner.onAttach(session); const call = (method, payload = {}) => owner.onRequest({ session, method, payload });
  const grant = (await call('controller_acquire')).value;
  const result = await call('core_ensure_ae_panel', { operationId: id, timeoutMs: 10000 }); assert.equal(result.value.outcome, 'unknown'); assert.equal(f.launches.length, 1); assert.equal(f.service.activity().unresolved, true);
  assert.equal((await call('core_connect')).code, 'owner_startup_pending'); await call('controller_release', { leaseToken: grant.leaseToken }); assert.equal((await call('controller_acquire')).ok, true); assert.equal((await call('core_connect')).code, 'owner_startup_pending');
  f.ack(); f.connect(); assert.equal((await call('core_ae_panel_startup_status', { operationId: id })).value.outcome, 'ready'); assert.equal((await call('core_connect')).ok, true); assert.equal(connectedCalls, 1); assert.equal(f.launches.length, 1); await owner.close();
});
test('ae-panel-startup ensure waits only for its exact provisional registry bootstrap then becomes ready', async t => {
  const pkg = buildPackage(undefined, 'manual', { runtimeModel: 'owner' }), expected = verify(file => Buffer.from(pkg.files[file], 'base64')); let peer, linked, sequence = 0, completed = false;
  const f = harness(t, { expected, peerStatus: () => peer.status(), assertIdle(request) { const p = peer.status(); if (p.pending && !ownsRegistryBootstrap(p, request.operationId)) throw new Error('startup_lane_busy'); },
    async launchHook() { const challenge = await post('/challenge', { role: 'panel' }), claim = { challenge, peerId: 'startup-provisional', loadedPanel: expected, extensionRoot: f.installation.cepDir.replace(/\\/g, '/') }; linked = await post('/link', { ...claim, proof: mac(claim, token) }); assert.equal(linked.body.registryReady, false); },
    async waitHook() {
      if (completed) return; const p = peer.status(); assert.equal(ownsRegistryBootstrap(p, id), true); assert.equal(ownsRegistryBootstrap(p, other), false); assert.throws(() => peer.inspect({}), /registry_not_ready/);
      const body = { epoch: linked.body.epoch, peerId: 'startup-provisional', sequence: ++sequence, method: 'POST', path: '/registry-ready', payload: { nonce: linked.body.bootstrap.nonce, registryBuildId: expected.registryBuildId, refreshed: true, sessionId: null } };
      assert.equal((await post('/registry-ready', { body, mac: mac(body, token) })).body.payload.registryReady, true); completed = true;
    } });
  const token = 'c'.repeat(64), directory = path.join(f.installation.stateDir, 'receiver');
  peer = createHttpPeer({ installation: { ...f.installation, panelToken: token, controlToken: 'd'.repeat(64) }, directory, asset: { assetKey: 'project-inspection-v1', executorHash: 'e'.repeat(64) }, expectedPanelIdentity: expected, port: 0, captureBootstrapStartup: () => f.service.activity().operationId }); await peer.listen(); t.after(() => peer.close());
  async function post(route, value) { return (await fetch('http://127.0.0.1:' + peer.status().port + route, { method: 'POST', headers: { Origin: 'file://', 'Content-Type': 'application/json' }, body: canonical(value) })).json(); }
  const result = await f.service.ensure({ operationId: id }, f.context); assert.equal(result.outcome, 'ready'); assert.equal(completed, true); assert.equal(f.launches.length, 1); assert.equal(peer.status().pending, null);
});
test('ae-panel-startup timeout and owner recreation never replay; late ack reconciles same UUID', async t => {
  const f = harness(t, { timeout: true }); assert.equal((await f.service.ensure({ operationId: id, timeoutMs: 1000 }, f.context)).outcome, 'unknown');
  assert.equal((await f.service.ensure({ operationId: id }, f.context)).outcome, 'unknown'); assert.equal((await f.service.ensure({ operationId: other }, f.context)).code, 'startup_outcome_unresolved'); assert.equal(f.launches.length, 1);
  f.ack(); f.connect(); assert.equal((await f.service.ensure({ operationId: id }, f.context)).outcome, 'ready'); assert.equal(f.launches.length, 1);
});
test('ae-panel-startup stale stable-menu cache requires host restart with project facts and no restart', async t => {
  const f = harness(t, { stale: true }); const result = await f.service.ensure({ operationId: id }, f.context); assert.equal(result.code, 'requires_host_restart'); assert.deepEqual(result.ack.hostFacts, facts); assert.equal(f.launches.length, 1);
});
test('ae-panel-startup changed executable and forged late ack cannot establish readiness', async t => {
  const f = harness(t, { timeout: true }); await f.service.ensure({ operationId: id, timeoutMs: 1000 }, f.context); f.ack('menu_executed', other); f.connect(); assert.equal((await f.service.ensure({ operationId: id }, f.context)).code, 'startup_ack_invalid'); assert.equal(f.launches.length, 1);
  const g = harness(t); fs.appendFileSync(g.executablePath, 'changed'); assert.equal((await g.service.ensure({ operationId: id }, g.context)).code, 'startup_executable_changed'); assert.equal(g.launches.length, 0);
});
test('ae-panel-startup owner controller/baseline gates allow ensure without granting project authority', async () => {
  const calls = [], owner = createAttachmentOwner({ runtime: { status() {}, close() {} }, activity: () => ({ pending: false, unresolved: false, fault: false }), workSession: () => ({ sessionId: id, baselineRequired: true, resetPending: false }), invoke: async (method, payload, context) => { context.assertCurrent(); calls.push(method); return { outcome: 'ready', nativeVerified: false }; } });
  const session = {}; owner.onAttach(session); const call = (method, payload) => owner.onRequest({ session, method, payload });
  assert.equal((await call('core_ensure_ae_panel', { operationId: id })).code, 'owner_controller_required');
  await call('controller_acquire', { sessionId: id }); assert.equal((await call('core_ensure_ae_panel', { operationId: id })).ok, true); assert.deepEqual(calls, ['ensureAePanel']); assert.equal(owner.status().workSession.baselineRequired, true);
  assert.equal((await call('core_ensure_ae_panel', { operationId: id, args: [] })).code, 'owner_payload'); await owner.close();
});
function runJsx({ command = 42, throws = false, file = 'C:\\space dir\\title "x"\r\n\u0001\ud800.aep', now = 1000, deadline = 11000, lookupDelay = 0, existingExecuting, writeFailure, closeFailure, pauseBeforeExecute = false } = {}) {
  let clock = now; const files = new Map([['/fixture/request.json', canonical({ deadline, operationId: id, requestNonce: other })]]), executed = [];
  if (existingExecuting !== undefined) files.set('/fixture/executing.json', existingExecuting);
  function File(name) { this.name = name; this.parent = { fsName: '/fixture' }; this.exists = files.has(name); this.open = mode => { this.mode = mode; return true; }; this.read = () => files.get(name); this.write = value => { files.set(name, writeFailure === path.basename(name).replace(/\.pending$/, '') ? value.slice(0, 5) : value); return writeFailure !== path.basename(name).replace(/\.pending$/, ''); }; this.close = () => closeFailure !== path.basename(name).replace(/\.pending$/, ''); this.rename = target => { const destination = '/fixture/' + target; if (files.has(destination)) return false; files.set(destination, files.get(name)); files.delete(name); return true; }; }
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } }
  const source = pauseBeforeExecute ? fixed.replace('app.executeCommand(command);', 'throw new Error("fixture_pause_before_execute");app.executeCommand(command);') : fixed;
  vm.runInNewContext(source, { Date: Clock, File, $: { fileName: '/fixture/bootstrap.jsx' }, app: { version: '26.3', project: { file: { fsName: file }, dirty: false, numItems: 0 }, findMenuCommandId(label) { assert.equal(label, 'AE Agent Core'); clock += lookupDelay; if (throws) throw new Error('API failure'); return command; }, executeCommand(value) { assert.ok(files.has('/fixture/executing.json')); executed.push(value); } } });
  return { files, executed };
}
test('ae-panel-startup fixed JSX escapes host facts, receipts before execute, no arbitrary script and no exception modal', () => {
  const f = runJsx(), receipt = JSON.parse(f.files.get('/fixture/ack.json')); assert.equal(receipt.hostFacts.file, 'C:\\space dir\\title "x"\r\n\u0001\ud800.aep'); assert.deepEqual(f.executed, [42]);
  assert.deepEqual(runJsx({ command: 0 }).executed, []); assert.doesNotThrow(() => runJsx({ throws: true }));
});
test('ae-panel-startup v3 fixed JSX publishes positive expiry before lookup or after delayed lookup without executing menu', () => {
  const initial = runJsx({ now: 12000, deadline: 11000 }); assert.deepEqual(initial.executed, []); assert.equal(JSON.parse(initial.files.get('/fixture/ack.json')).code, 'expired_before_menu'); assert.equal(initial.files.has('/fixture/executing.json'), false);
  const delayed = runJsx({ now: 1000, deadline: 2000, lookupDelay: 1500 }); assert.deepEqual(delayed.executed, []); assert.equal(JSON.parse(delayed.files.get('/fixture/ack.json')).code, 'expired_before_menu'); assert.equal(delayed.files.has('/fixture/executing.json'), true);
});
test('ae-panel-startup v3 existing executing/partial state and pause before execute never fabricate expired ACK', () => {
  for (const existingExecuting of ['', '{', '{"operationId":"' + id + '"}']) { const f = runJsx({ now: 12000, deadline: 11000, existingExecuting }); assert.deepEqual(f.executed, []); assert.equal(f.files.has('/fixture/ack.json'), false); }
  const paused = runJsx({ pauseBeforeExecute: true }); assert.deepEqual(paused.executed, []); assert.equal(paused.files.has('/fixture/executing.json'), true); assert.equal(paused.files.has('/fixture/ack.json'), false);
});
test('ae-panel-startup v3 receipt write/close failures publish no canonical ACK and cannot authorize menu execution', () => {
  for (const failure of [{ writeFailure: 'executing.json' }, { closeFailure: 'executing.json' }, { closeFailure: 'request.json' }]) { const f = runJsx(failure); assert.deepEqual(f.executed, []); assert.equal(f.files.has('/fixture/ack.json'), false); }
  for (const failure of [{ writeFailure: 'ack.json' }, { closeFailure: 'ack.json' }]) { const f = runJsx({ ...failure, now: 12000, deadline: 11000 }); assert.deepEqual(f.executed, []); assert.equal(f.files.has('/fixture/ack.json'), false); assert.equal(f.files.has('/fixture/ack.json.pending'), true); }
});
test('ae-panel-startup v3 shared environment is packaged for both needed consumers without render jobs in manual', () => {
  const manual = buildPackage(undefined, 'manual', { runtimeModel: 'owner' }), operator = buildPackage(undefined, 'operator-render-jobs', { runtimeModel: 'owner' }), readonly = buildPackage(undefined, 'readonly');
  assert.ok(manual.files['runtime/adobe-child-environment.js']); assert.ok(operator.files['runtime/adobe-child-environment.js']); assert.equal(Object.hasOwn(manual.files, 'runtime/aerender-jobs.js'), false); assert.equal(Object.hasOwn(readonly.files, 'runtime/adobe-child-environment.js'), false);
});
test('ae-panel-startup v2 historical host-exit observer still preserves receiver UNKNOWN without expiry-only retirement', async t => {
  const f = harness(t, { timeout: true, submission: true }); await f.service.ensure({ operationId: id, timeoutMs: 1000 }, f.context); const directory = path.join(f.installation.stateDir, 'panel-startup', id), file = path.join(directory, 'attempt.json');
  const attempt = JSON.parse(fs.readFileSync(file)); attempt.dispatchProtocol = 2; fs.writeFileSync(file, canonical(attempt)); fs.renameSync(path.join(directory, 'bootstrap-dispatch-entered.json'), path.join(directory, 'dispatch-entered.json')); fs.renameSync(path.join(directory, 'bootstrap-submission.json'), path.join(directory, 'submission.json'));
  assert.equal((await f.service.observe({ operationId: id })).outcome, 'unknown'); f.rows([]); assert.equal((await f.service.observe({ operationId: id })).code, 'startup_host_exited'); assert.equal(f.launches.length, 1);
});
test('ae-panel-startup installed duplicate owners and ScriptUI title collision fail before find/execute', t => {
  const f = harness(t), ext = f.installation.cepDir; fs.mkdirSync(path.join(ext, 'CSXS'), { recursive: true }); fs.copyFileSync(path.join(source, 'cep/CSXS/manifest.xml'), path.join(ext, 'CSXS/manifest.xml'));
  collisionPreflight(f.installation, f.executablePath, [path.dirname(ext)]);
  const scripts = path.join(path.dirname(f.executablePath), 'Scripts/ScriptUI Panels'); fs.mkdirSync(scripts, { recursive: true }); fs.writeFileSync(path.join(scripts, 'AE Agent Core.jsx'), ''); assert.throws(() => collisionPreflight(f.installation, f.executablePath, [path.dirname(ext)]), /startup_script_menu_collision/);
  fs.unlinkSync(path.join(scripts, 'AE Agent Core.jsx')); const duplicate = path.join(path.dirname(ext), 'duplicate/CSXS'); fs.mkdirSync(duplicate, { recursive: true }); fs.copyFileSync(path.join(ext, 'CSXS/manifest.xml'), path.join(duplicate, 'manifest.xml')); assert.throws(() => collisionPreflight(f.installation, f.executablePath, [path.dirname(ext)]), /startup_panel_ambiguous/);
});
test('ae-panel-startup packaged fingerprint covers executing panel/dispatcher/registry and is portable', () => {
  const pkg = buildPackage(undefined, 'manual', { runtimeModel: 'owner' }), read = f => Buffer.from(pkg.files[f], 'base64'), expected = verify(read);
  assert.equal(expected.productVersion, '4.2.6'); assert.equal(pkg.release.version, '4.2.6'); assert.ok(pkg.files['runtime/host/ensure-panel.jsx']);
  for (const changed of ['cep/js/panel.js', 'cep/js/poll-dispatcher.js']) assert.notDeepEqual(identity(f => f === changed ? Buffer.concat([read(f), Buffer.from('// changed')]) : read(f)), expected);
  const decoded = Object.values(pkg.files).map(value => Buffer.from(value, 'base64').toString('utf8')).join('\n');
  assert.equal(decoded.includes(os.hostname()), false); assert.equal(decoded.includes(os.userInfo().homedir), false); assert.equal(decoded.includes(os.userInfo().homedir.replace(/\\/g, '\\\\')), false);
  assert.throws(() => verify(file => file === 'cep/js/panel.js' ? Buffer.from(read(file).toString().replace('"productVersion":"4.2.6"', '"productVersion":"4.2.5"')) : read(file)), /panel_identity_integrity/);
});
test('ae-panel-startup handshake authenticates loaded build/version; spoof/missing/stale identities never acquire peer', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-panel-link-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const installation = { installationId: 'fixture', packageHash: 'a'.repeat(64), panelToken: 'b'.repeat(64), controlToken: 'c'.repeat(64) }, expected = { protocolVersion: 1, productVersion: '4.2.6', panelBuildId: 'd'.repeat(64), extensionId: 'com.codex.aeagentcore4.panel' };
  const peer = createHttpPeer({ installation, directory: dir, asset: { assetKey: 'inspection', moduleId: 'project-inspection', operationId: 'inspect', executorHash: 'e'.repeat(64) }, expectedPanelIdentity: expected, port: 0 }); await peer.listen(); t.after(() => peer.close());
  const url = 'http://127.0.0.1:' + peer.status().port;
  const post = async (route, body) => (await fetch(url + route, { method: 'POST', headers: { Origin: 'file://', 'Content-Type': 'application/json' }, body: canonical(body) })).json();
  for (const loadedPanel of [undefined, { ...expected, productVersion: '4.2.5' }, { ...expected, panelBuildId: 'f'.repeat(64) }]) {
    const challenge = await post('/challenge', { role: 'panel' }), body = { challenge, peerId: 'fixture-peer', ...(loadedPanel ? { loadedPanel } : {}) };
    assert.equal((await post('/link', { ...body, proof: mac(body, installation.panelToken) })).error, 'panel_identity_mismatch'); assert.equal(peer.status().peer.connected, false);
  }
  let challenge = await post('/challenge', { role: 'panel' }), body = { challenge, peerId: 'fixture-peer', loadedPanel: expected };
  assert.equal((await post('/link', { ...body, proof: '0'.repeat(64) })).error, 'peer_auth');
  challenge = await post('/challenge', { role: 'panel' }); body = { ...body, challenge }; const linked = await post('/link', { ...body, proof: mac(body, installation.panelToken) });
  assert.deepEqual(linked.body.acceptedIdentity, expected); assert.deepEqual(peer.status().peer.acceptedIdentity, expected); assert.equal(peer.status().peer.origin, 'file://'); assert.ok(peer.status().peer.identityObservedAt); assert.equal(peer.status().peer.identityEpoch, linked.body.epoch);
});
