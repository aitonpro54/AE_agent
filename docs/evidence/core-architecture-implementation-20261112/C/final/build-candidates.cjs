'use strict';
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const root = fs.realpathSync('C:/Users/Ant/Documents/Codex/AE_agent_core/core4');
const { buildPackage, verifyPackage } = require(path.join(root, 'tools/package-installable.js'));
const { bundleStandalone, writeStandalone } = require(path.join(root, 'tools/package-standalone-installer.js'));
const { verifyStandalone } = require(path.join(root, 'tools/standalone-installer.js'));
const sha = b => createHash('sha256').update(b).digest('hex');
const output = path.join(__dirname, 'candidate-artifacts');
fs.mkdirSync(output);
const foreign = path.join(output, 'Посторонний каталог'); fs.mkdirSync(foreign);
const record = { purpose: 'technical_check', lifetime: 'ephemeral_check', releaseCertified: false,
  createdAt: new Date().toISOString(), installed: false, nativeAcceptance: false, sourceRoot: root,
  scriptSHA256: sha(fs.readFileSync(__filename)), candidates: [] };
try {
  for (const selector of ['readonly', 'manual', 'manual-titles-variants', 'operator-render-jobs']) {
    const pkg = buildPackage(root, selector, { runtimeModel: 'owner' });
    verifyPackage(pkg);
    assert.deepEqual(buildPackage(root, selector, { runtimeModel: 'owner' }), pkg);
    assert.equal(pkg.release.version, '4.2.6');
    const bundle = bundleStandalone(pkg, { root });
    assert.deepEqual(bundleStandalone(pkg, { root }), bundle);
    assert.equal(bundle.manifest.version, 3);
    assert.equal(bundle.manifest.capabilityBaseHash, null);
    const distribution = path.join(output, selector);
    writeStandalone(distribution, bundle);
    const checked = verifyStandalone(distribution, bundle.distributionHash);
    assert.equal(checked.packageHash, pkg.packageHash);
    const hashFiles = () => Object.fromEntries([...Object.keys(bundle.files), 'standalone.json'].sort().map(f => [f, sha(fs.readFileSync(path.join(distribution, f)))]));
    const before = hashFiles();
    const destinations = {
      installRoot: path.join(output, selector + '-dryrun', 'AEAgentCore4'),
      extensionsDir: path.join(output, selector + '-dryrun', 'CEP extensions'),
      configPath: path.join(output, selector + '-dryrun', 'project', '.codex', 'config.toml')
    };
    const preload = path.join(output, selector + '-deny-external.cjs');
    fs.writeFileSync(preload, `'use strict';
const M=require('node:module'),path=require('node:path'),distribution=${JSON.stringify(distribution)};
const resolve=M._resolveFilename;
M._resolveFilename=function(...args){const file=resolve.apply(this,args);if(!M.isBuiltin(file)&&!file.startsWith(distribution+path.sep))throw Error('foreign_source_import_forbidden:'+file);return file;};
require('node:net').Server.prototype.listen=function(){throw Error('network_forbidden');};
for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])require('node:child_process')[key]=function(){throw Error('child_process_forbidden');};
`);
    const command = [process.execPath, '--require', preload, path.join(distribution, 'tools/standalone-installer.js'), 'dry-run',
      '--expected-distribution-hash', bundle.distributionHash, '--expected-package-hash', pkg.packageHash,
      '--install-root', destinations.installRoot, '--extensions-dir', destinations.extensionsDir, '--config', destinations.configPath];
    const started = Date.now();
    const run = cp.spawnSync(command[0], command.slice(1), { cwd: foreign, windowsHide: true,
      env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '', LOCALAPPDATA: path.join(output, 'local-unused'), APPDATA: path.join(output, 'roaming-unused') },
      encoding: 'utf8', timeout: 30000, maxBuffer: 1048576 });
    const stdout = path.join(output, selector + '.stdout.txt'), stderr = path.join(output, selector + '.stderr.txt');
    fs.writeFileSync(stdout, run.stdout ?? ''); fs.writeFileSync(stderr, run.stderr ?? '');
    const row = { selector, runtime: 'owner', packageHash: pkg.packageHash, distributionHash: bundle.distributionHash,
      runtimeFiles: Object.keys(pkg.files).length, distributionFiles: Object.keys(bundle.files).length, manifestVersion: bundle.manifest.version,
      distribution, runtimeHashes: pkg.release.hashes, toolingHashes: Object.fromEntries(Object.entries(bundle.manifest.hashes).filter(([f]) => f.startsWith('tools/'))),
      catalogRevision: JSON.parse(Buffer.from(pkg.files['config/catalog.json'], 'base64')).catalogRevision,
      command, cwd: foreign, durationMs: Date.now() - started, exitCode: run.status, signal: run.signal,
      error: run.error ? { code: run.error.code, message: run.error.message } : null,
      stdout, stderr, stdoutSHA256: sha(run.stdout ?? ''), stderrSHA256: sha(run.stderr ?? '') };
    record.candidates.push(row);
    assert.equal(run.error, undefined); assert.equal(run.status, 0, run.stderr);
    const report = JSON.parse(run.stdout);
    assert.equal(report.dryRun, true); assert.equal(report.liveProof, false);
    assert.equal(report.packageHash, pkg.packageHash); assert.equal(report.distributionHash, bundle.distributionHash);
    assert.deepEqual(hashFiles(), before);
    for (const target of Object.values(destinations)) assert.equal(fs.existsSync(target), false, target);
    verifyStandalone(distribution, bundle.distributionHash);
    row.status = 'PASS'; row.destinationWrites = 0; row.distributionUnchanged = true;
  }
  record.status = 'PASS';
} catch (e) { record.status = 'FAIL'; record.error = { message: e.message, stack: e.stack }; process.exitCode = 1; }
record.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(__dirname, 'candidate-validation.json'), JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({ status: record.status, candidates: record.candidates.map(c => ({ selector: c.selector, packageHash: c.packageHash, distributionHash: c.distributionHash, files: c.runtimeFiles, status: c.status })), report: path.join(__dirname, 'candidate-validation.json') }));
