'use strict';
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const { createHash } = require('node:crypto');
const root = fs.realpathSync('C:/Users/Ant/Documents/Codex/AE_agent_core');
const coreRoot = path.join(root, 'core4'), output = __dirname;
const sha = b => createHash('sha256').update(b).digest('hex');
const digest = f => sha(fs.readFileSync(f));
const git = (...args) => cp.execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const lines = s => s.split(/\r?\n/).filter(Boolean);
const base = git('rev-parse', 'dd50fb8');
const tracked = lines(git('-c', 'core.quotepath=false', 'diff', '--name-only', base, '--', 'core4', 'products/titles')).sort();
const untracked = lines(git('-c', 'core.quotepath=false', 'ls-files', '--others', '--exclude-standard', '--', 'core4', 'products/titles')).sort();
const changed = [...new Set([...tracked, ...untracked])].sort();
const coreChanged = changed.filter(f => f.startsWith('core4/'));
if (!coreChanged.length || changed.some(f => f.split('/').includes('..') || !fs.statSync(path.join(root, f)).isFile())) throw Error('invalid_source_union');
const selected = require(path.join(coreRoot, 'tools/validate-diff.js')).selectChecks(coreChanged, coreRoot);
const selectionFile = path.join(output, 'frozen-selection.json');
fs.writeFileSync(selectionFile, JSON.stringify(selected, null, 2) + '\n', { flag: 'wx' });
const originalRunner = 'C:/Users/Ant/AppData/Local/Temp/core4-architecture-c-runner-8d693f84-6a96-4b44-b6c3-b866e979e892/run-selected.cjs';
if (digest(originalRunner) !== 'cf00330fa01d125d28aca48f8cb653fff17eb041dccfe19f74ce950a43c363f1') throw Error('runner_hash_changed');
const runnerPath = path.join(output, 'run-selected.cjs');
fs.copyFileSync(originalRunner, runnerPath, fs.constants.COPYFILE_EXCL);
const configPath = path.join(output, 'runner-config.json');
fs.writeFileSync(configPath, JSON.stringify({ coreRoot, changedPaths: coreChanged, contractImpacts: [], selectionFile, timeoutMs: 1800000 }, null, 2) + '\n', { flag: 'wx' });
const protectedFiles = {
  'AGENTS.md': '0097d035294e889dd2b4410fb247938764d8b007c226893911c3ef4772f6f700',
  'plans/core-transfer-4.2.5-20261111.md': 'cc9ca6acebbc0732587a82c3dfd94da57f8a850c39f38ee6c2bf8b7936926bb7'
};
for (const [f, h] of Object.entries(protectedFiles)) if (digest(path.join(root, f)) !== h) throw Error('protected_dirty_changed:' + f);
const record = { purpose: 'technical_check', lifetime: 'ephemeral_check', releaseCertified: false,
  recordedAt: new Date().toISOString(), implementationBase: base, headAtFreeze: git('rev-parse', 'HEAD'),
  trackedCommand: ['git', 'diff', '--name-only', base, '--', 'core4', 'products/titles'],
  untrackedCommand: ['git', 'ls-files', '--others', '--exclude-standard', '--', 'core4', 'products/titles'],
  tracked, untracked, changedPaths: changed, selectedCorePaths: coreChanged,
  sourceHashes: Object.fromEntries(changed.map(f => [f, { sha256: digest(path.join(root, f)), bytes: fs.statSync(path.join(root, f)).size }])),
  protectedFiles, selection: { path: selectionFile, sha256: digest(selectionFile), checks: selected.checks.length, batches: selected.executionBatches.length, deferred: selected.deferredCoverage.length },
  config: { path: configPath, sha256: digest(configPath) }, runner: { path: runnerPath, sha256: digest(runnerPath) },
  freezeScript: { path: __filename, sha256: digest(__filename) }
};
fs.writeFileSync(path.join(output, 'source-union-provenance.json'), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ ...record.selection, sourcePaths: changed.length, sourceUnionFile: path.join(output, 'source-union-provenance.json'), configPath, runnerPath }));
