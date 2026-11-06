'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHmac, randomBytes, randomUUID } = require('node:crypto');
const { canonical, fail, hash } = require('../protocol/json');

// These suites use only reviewed Node builtins and a closed set of repo inputs.
const LOCAL_SUITES = new Set(['point-layout', 'text-layer']);

function capture(root, check) {
  const files = new Map();
  for (const relative of check.dependencies) {
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || fs.realpathSync(file) !== file || !fs.lstatSync(file).isFile()) fail('validation_reuse_path', relative);
    files.set(relative, fs.readFileSync(file));
  }
  const dependencies = [...files].map(([relative, bytes]) => [relative, hash(bytes)]);
  if (hash({ check: check.check, command: check.command, dependencies, projections: [] }) !== check.evidenceKey) fail('validation_inputs_changed', check.check);
  return files;
}

function readLocal(file, limit) {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  return stat?.isFile() && stat.size <= limit ? fs.readFileSync(file) : null;
}

function cacheContext(root, env) {
  const state = path.resolve(root, '..', '.codex-runtime');
  fs.mkdirSync(state, { recursive: true });
  if (fs.realpathSync(state) !== state) return null;
  const directory = path.join(state, 'validation-reuse-v1');
  fs.mkdirSync(directory, { recursive: true });
  if (fs.realpathSync(directory) !== directory) return null;
  const keyFile = path.join(directory, 'key');
  try { fs.writeFileSync(keyFile, randomBytes(32), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  const secret = readLocal(keyFile, 32);
  if (secret?.length !== 32) return null;
  const executable = fs.realpathSync(process.execPath);
  const stat = fs.statSync(executable, { bigint: true });
  const environment = hash({ root, executable, executableStamp: [stat.size, stat.ino, stat.dev, stat.mtimeNs, stat.ctimeNs].map(String),
    platform: process.platform, arch: process.arch, host: os.hostname(), release: os.release(), versions: process.versions,
    env, selector: hash(fs.readFileSync(path.join(__dirname, 'validate-diff.js'))), runner: hash(fs.readFileSync(__filename)) });
  const mac = body => createHmac('sha256', secret).update(canonical(body)).digest('hex');
  return { directory, environment, mac };
}

function accepted(cache, file, identity) {
  try {
    const bytes = readLocal(file, 4096);
    if (!bytes) return null;
    const { body, signature } = JSON.parse(bytes);
    if (body.identity === identity && Number.isSafeInteger(body.tests) && body.tests > 0 && cache.mac(body) === signature) return body;
  } catch { /* A damaged receipt is a cache miss. */ }
  return null;
}

function save(cache, file, body) {
  const temporary = path.join(cache.directory, randomUUID() + '.tmp');
  let created = false;
  try {
    fs.writeFileSync(temporary, canonical({ body, signature: cache.mac(body) }), { flag: 'wx', mode: 0o600 });
    created = true;
    fs.renameSync(temporary, file);
    created = false;
  } catch { /* A successful test remains usable when the cache is unavailable. */ }
  finally { if (created) { try { fs.unlinkSync(temporary); } catch { /* Cache cleanup is best effort. */ } } }
}

function completeTap(stdout) {
  const counts = new Map();
  for (const [, key, value] of stdout.toString('utf8').matchAll(/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)\r?$/gm)) {
    if (counts.has(key)) return 0;
    counts.set(key, Number(value));
  }
  const tests = counts.get('tests');
  return Number.isSafeInteger(tests) && tests > 0 && counts.get('pass') === tests &&
    ['fail', 'cancelled', 'skipped', 'todo'].every(key => counts.get(key) === 0) ? tests : 0;
}

function runSnapshot(files, command, env) {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(tempRoot, 'core4-validation-'));
  if (path.dirname(directory) !== tempRoot) fail('validation_snapshot_path');
  try {
    for (const [relative, bytes] of files) {
      const dest = path.join(directory, relative);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, bytes, { flag: 'wx' });
    }
    return spawnSync(process.execPath, command, { cwd: directory, env, windowsHide: true });
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

function createValidationReuse(directory, env) {
  if (process.execArgv.length || env.NODE_OPTIONS || env.NODE_PATH) return () => null;
  const root = fs.realpathSync(directory);
  let cache;
  return (batch, check) => {
    if (batch.checks.length !== 1 || !LOCAL_SUITES.has(check.check) ||
        batch.command[3] !== `test/${check.check}-local.test.js` ||
        batch.command[2] !== `--test-name-pattern=(?:${check.check})` ||
        check.dependencies.some(file => !/^[a-zA-Z0-9_./-]+$/.test(file) || file.split('/').some(part => !part || part === '.' || part === '..'))) return null;
    if (cache === undefined) {
      try { cache = cacheContext(root, env); } catch { cache = null; }
    }
    if (!cache) return null;
    const command = ['--no-global-search-paths', ...batch.command.slice(1, -1), '--test-reporter=tap', batch.command[3]];
    const identity = hash({ evidence: check.evidenceKey, command, environment: cache.environment });
    const file = path.join(cache.directory, identity + '.json');
    const inputs = capture(root, check);
    const receipt = accepted(cache, file, identity);
    if (receipt) {
      console.log(`validation-reuse ${check.check}: reused (${receipt.tests} passed)`);
      return { status: 0 };
    }
    console.log(`validation-reuse ${check.check}: running isolated inputs`);
    const result = runSnapshot(inputs, command, env);
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) throw result.error;
    const tests = result.status === 0 ? completeTap(result.stdout) : 0;
    if (tests) {
      capture(root, check);
      save(cache, file, { identity, tests, stdoutHash: hash(result.stdout), completedAt: new Date().toISOString() });
    }
    return result;
  };
}

module.exports = { createValidationReuse };
