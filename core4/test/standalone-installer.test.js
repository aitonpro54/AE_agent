'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawnSync } = require('node:child_process');
const { hash, canonical } = require('../protocol/json');
const { buildPackage } = require('../tools/package-installable');
const { buildStandalone, writeStandalone } = require('../tools/package-standalone-installer');
const { HELPERS, verifyStandalone } = require('../tools/standalone-installer');
const { snapshot } = require('../tools/install-core4');
const { signedHistory } = require('./fixtures/standalone-history');
const { validateDisposition } = require('../runtime/native-read-disposition');
const { openCompletionStore } = require('../integrations/cep/completion-store');
function fixture(t, selector = 'manual') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-standalone-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const distribution = path.join(directory, 'distribution'), bundle = buildStandalone(undefined, selector); writeStandalone(distribution, bundle);
  const args = { nodePath: fs.realpathSync(process.execPath), installRoot: path.join(directory, 'AEAgentCore4'), extensionsDir: path.join(directory, 'extensions'), configPath: path.join(directory, 'project/.codex/config.toml') };
  const trace = path.join(directory, 'imports.json'), preload = path.join(directory, 'deny-source.cjs');
  fs.writeFileSync(preload, `const fs=require('node:fs'),path=require('node:path'),M=require('node:module'),net=require('node:net');
const root=${JSON.stringify(directory)},trace=${JSON.stringify(trace)},loads=[],resolve=M._resolveFilename;
M._resolveFilename=function(...args){const file=resolve.apply(this,args);if(!M.isBuiltin(file)&&!file.startsWith(root+path.sep))throw Error('source_checkout_import_forbidden:'+file);loads.push(file);return file;};
net.Server.prototype.listen=function(){throw Error('fixture_network_forbidden');};
for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])require('node:child_process')[key]=function(){throw Error('fixture_child_process_forbidden');};
process.on('exit',()=>fs.writeFileSync(trace,JSON.stringify(loads)));
`);
  function run(mode = 'apply', extra = [], expectedHash = bundle.distributionHash, overrides = {}) {
    if (fs.existsSync(trace)) fs.unlinkSync(trace);
    const cli = [path.join(distribution, 'tools/standalone-installer.js'), mode, '--expected-distribution-hash', expectedHash, '--install-root', args.installRoot, '--extensions-dir', args.extensionsDir, ...(overrides.omitConfig ? [] : ['--config', overrides.config ?? args.configPath]), ...(mode === 'apply' ? ['--expected-package-hash', overrides.packageHash ?? bundle.packageHash] : []), ...extra];
    const result = spawnSync(process.execPath, ['--require', preload, ...cli], { cwd: directory, env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '', LOCALAPPDATA: path.join(directory, 'local-unused'), APPDATA: path.join(directory, 'roaming-unused') }, encoding: 'utf8', timeout: 15000, windowsHide: true });
    assert.equal(result.error, undefined); assert.ok(fs.existsSync(trace));
    return { ...result, imports: JSON.parse(fs.readFileSync(trace)), report: JSON.parse(result.status === 0 ? result.stdout : result.stderr) };
  }
  return { directory, distribution, bundle, args, run };
}
test('standalone-installer deterministic manual/readonly distributions include exact eager and lazy closure', t => {
  for (const selector of ['manual', 'readonly']) {
    const f = fixture(t, selector), runtime = buildPackage(undefined, selector), checked = verifyStandalone(f.distribution, f.bundle.distributionHash);
    assert.equal(checked.packageHash, runtime.packageHash); assert.deepEqual(buildStandalone(undefined, selector), f.bundle);
    assert.equal(Object.keys(runtime.files).length, selector === 'manual' ? 59 : 40);
    assert.deepEqual(Object.keys(f.bundle.files).filter(file => HELPERS.includes(file)).sort(), [...HELPERS]);
    assert.equal(Object.keys(runtime.files).some(file => file.startsWith('tools/')), false);
    assert.throws(() => writeStandalone(f.distribution, f.bundle), /new_absolute_standalone_output_required/);
    const escaping = structuredClone(f.bundle); escaping.files['../escape.txt'] = Buffer.from('forbidden').toString('base64'); const output = path.join(f.directory, 'invalid-output');
    assert.throws(() => writeStandalone(output, escaping), /standalone_bundle/); assert.equal(fs.existsSync(output), false); assert.equal(fs.existsSync(path.join(f.directory, 'escape.txt')), false);
    const before = snapshot(f.distribution), result = f.run('dry-run'); assert.equal(result.status, 0, result.stderr); assert.deepEqual(snapshot(f.distribution), before);
    assert.equal(fs.existsSync(f.args.installRoot), false); assert.equal(fs.existsSync(f.args.configPath), false); assert.equal(result.report.liveProof, false);
  }
});
test('standalone-installer rejects output below an existing ancestor junction before any target writes', t => {
  const f = fixture(t), target = path.join(f.directory, 'junction-target'), alias = path.join(f.directory, 'junction-alias'); fs.mkdirSync(target); fs.mkdirSync(path.join(target, 'nested'));
  fs.symlinkSync(target, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const output = path.join(alias, 'nested', 'new-distribution'), targetBefore = snapshot(target);
  assert.throws(() => writeStandalone(output, f.bundle), /standalone_output_parent/);
  assert.equal(fs.existsSync(path.join(target, 'nested', 'new-distribution')), false); assert.deepEqual(snapshot(target), targetBefore);
  fs.unlinkSync(alias);
});
test('standalone-installer refuses oversized files before payload reads or installer import', t => {
  for (const relative of ['standalone.json', 'tools/disposition-install-preflight.js']) {
    const f = fixture(t), file = path.join(f.distribution, relative), fd = fs.openSync(file, 'w'); try { fs.ftruncateSync(fd, 16 * 1024 * 1024 + 1); } finally { fs.closeSync(fd); }
    // Prove the size refusal occurs before any fs.readSync for this fd. Module
    // loading and trace output still use normal reads for other fixture files.
    fs.appendFileSync(path.join(f.directory, 'deny-source.cjs'), `\nconst oversized=${JSON.stringify(file)},openFile=fs.openSync,readFile=fs.readSync,oversizedFds=new Set();
fs.openSync=function(name,...args){const fd=openFile.call(this,name,...args);if(name===oversized)oversizedFds.add(fd);return fd;};
fs.readSync=function(fd,...args){if(oversizedFds.has(fd))throw Error('oversized_payload_read_forbidden');return readFile.call(this,fd,...args);};\n`);
    const result = f.run(); assert.equal(result.status, 1); assert.equal(result.report.error, 'standalone_budget');
    assert.equal(result.imports.includes(path.join(f.distribution, 'tools/install-core4.js')), false); assert.equal(fs.existsSync(f.args.installRoot), false); assert.equal(fs.existsSync(f.args.extensionsDir), false); assert.equal(fs.existsSync(f.args.configPath), false);
  }
});
test('standalone-installer actual apply and settled-journal update run without any checkout imports or ports', t => {
  for (const selector of ['manual', 'readonly']) {
    const f = fixture(t, selector), first = f.run(); assert.equal(first.status, 0, first.stderr); assert.equal(first.report.installed, true);
    const d = JSON.parse(fs.readFileSync(first.report.descriptorPath)), receiver = path.join(d.stateDir, 'receiver'); fs.mkdirSync(receiver);
    const store = openCompletionStore({ directory: receiver, installationContext: { descriptorPath: first.report.descriptorPath } }); store.close();
    const journal = path.join(receiver, 'completions.ndjson'), before = fs.readFileSync(journal), distributionBefore = snapshot(f.distribution), second = f.run();
    assert.equal(second.status, 0, second.stderr); assert.ok(second.imports.includes(path.join(f.distribution, 'tools/disposition-install-preflight.js')));
    assert.ok(fs.readFileSync(journal).equals(before)); assert.deepEqual(snapshot(f.distribution), distributionBefore); assert.equal(second.report.liveProof, false);
    assert.equal(fs.existsSync(path.join(f.directory, 'local-unused')), false); assert.equal(fs.existsSync(path.join(f.directory, 'roaming-unused')), false);
  }
});
test('standalone-installer rejects missing/tampered/extra helpers before importing installer with zero destination writes', t => {
  for (const fault of ['missing', 'tampered', 'extra', 'omitted-and-rehashed']) {
    const f = fixture(t), helper = path.join(f.distribution, 'tools/disposition-install-preflight.js'); let expectedHash = f.bundle.distributionHash;
    if (fault === 'missing' || fault === 'omitted-and-rehashed') fs.unlinkSync(helper);
    if (fault === 'tampered') fs.writeFileSync(helper, "throw Error('unverified_helper_was_executed');\n");
    if (fault === 'extra') fs.writeFileSync(path.join(f.distribution, 'tools/unreviewed.js'), "throw Error('unreviewed');\n");
    if (fault === 'omitted-and-rehashed') { const manifest = structuredClone(f.bundle.manifest); delete manifest.hashes['tools/disposition-install-preflight.js']; const bytes = canonical(manifest); fs.writeFileSync(path.join(f.distribution, 'standalone.json'), bytes); expectedHash = hash(bytes); }
    const before = snapshot(f.distribution), result = f.run('apply', [], expectedHash); assert.equal(result.status, 1); assert.match(result.report.error, /standalone_closure_(tree|bytes)|standalone_helper_closure/);
    assert.equal(result.imports.includes(path.join(f.distribution, 'tools/install-core4.js')), false); assert.equal(fs.existsSync(f.args.installRoot), false); assert.equal(fs.existsSync(f.args.extensionsDir), false); assert.equal(fs.existsSync(f.args.configPath), false); assert.deepEqual(snapshot(f.distribution), before);
  }
});
test('standalone-installer reviewed hashes and explicit destinations fail closed before writes', t => {
  const f = fixture(t);
  for (const [expectedHash, overrides, code] of [['0'.repeat(64), {}, /standalone_reviewed_hash/], [f.bundle.distributionHash, { packageHash: '0'.repeat(64) }, /reviewed_package_hash_mismatch/], [f.bundle.distributionHash, { config: 'relative.toml' }, /standalone_absolute_exact_path/], [f.bundle.distributionHash, { omitConfig: true }, /standalone_usage/]]) {
    const result = f.run('apply', [], expectedHash, overrides); assert.equal(result.status, 1); assert.match(result.report.error, code); assert.equal(fs.existsSync(f.args.installRoot), false);
  }
});
test('standalone-installer signed historical UNKNOWN survives actual apply; forged MAC and new UNKNOWN still refuse', t => {
  const f = fixture(t), history = signedHistory(f.args), before = fs.readFileSync(history.journal);
  const result = f.run(); assert.equal(result.status, 0, result.stderr); assert.ok(result.imports.includes(path.join(f.distribution, 'tools/disposition-install-preflight.js'))); assert.ok(fs.readFileSync(history.journal).equals(before));
  assert.ok(validateDisposition(history.disposition, { descriptorPath: history.descriptorPath, journalPrefixBytes: history.prefix }));
  const store = openCompletionStore({ directory: path.dirname(history.journal), installationContext: { descriptorPath: history.descriptorPath } }); assert.equal(store.closed, false); assert.equal(store.fault, false); assert.equal(store.get(history.command.commandId).state, 'unknown'); assert.throws(() => store.begin(history.command, history.binding), /duplicate_command_no_replay/); store.close();
  const events = before.toString().trimEnd().split('\n').map(JSON.parse), bad = structuredClone(events.at(-1)); bad.controlMac = '0'.repeat(64); const { recordHash: ignored, ...body } = bad; bad.recordHash = hash(body); events[events.length - 1] = bad; fs.writeFileSync(history.journal, events.map(canonical).join('\n') + '\n');
  const protectedBefore = snapshot(f.args.installRoot), refused = f.run(); assert.equal(refused.status, 1); assert.equal(refused.report.error, 'disposition_control_authorization'); assert.deepEqual(snapshot(f.args.installRoot), protectedBefore);
  fs.writeFileSync(history.journal, before); const command = { ...history.command, commandId: 'synthetic-extra-unknown' }, binding = require('../protocol/dispatch').dispatchBinding(command, history.binding.receiverStoreIdentity); let tail = history.disposition;
  for (const value of [{ type: 'begin', commandId: command.commandId, commandDigest: hash(command), command, originalBinding: binding }, { type: 'unknown', commandId: command.commandId }]) { const body = { ...value, seq: tail.seq + 1, previousHash: tail.recordHash }; tail = { ...body, recordHash: hash(body) }; fs.appendFileSync(history.journal, canonical(tail) + '\n'); }
  const extraBefore = snapshot(f.args.installRoot), unknown = f.run(); assert.equal(unknown.status, 1); assert.equal(unknown.report.error, 'runtime_receiver_unresolved'); assert.deepEqual(snapshot(f.args.installRoot), extraBefore);
});
