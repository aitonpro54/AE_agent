'use strict';
// Synthetic in-memory records only; no source suites, Git, or join output.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { verifyCandidate, loadParser, canon, sha, compareContext, linkContext, contextSummary, sourceScopeRelation, selectedStatus, verifyResult } = require('./join-evidence.cjs');
const parser = loadParser();
const command = ['node', '--test', '--test-name-pattern=alpha', 'test/example.js'];
const current = { check: 'alpha', evidenceKey: 'synthetic-key', command };
const selection = { checks: [current], executionBatches: [{ checks: ['alpha'], command }], contractImpacts: [] };
const keys = [{ check: 'alpha', evidenceKey: current.evidenceKey }];
const summary = (tests, pass, skipped = 0) => `# tests ${tests}\n# pass ${pass}\n# fail 0\n# cancelled 0\n# skipped ${skipped}\n# todo 0\n`;
const stdout = Buffer.from('TAP version 13\nok 1 - alpha\n' + summary(1, 1)), stderr = Buffer.alloc(0);
const parsed = parser(stdout.toString());
const batch = { checks: ['alpha'], command, status: 'PASS', exitCode: 0, signal: null, error: null, closed: true, logsComplete: true, timedOut: false,
  stdoutSHA256: sha(stdout), stderrSHA256: sha(stderr), counts: parsed.counts, passedNames: parsed.passedNames,
  before: { keys, selectionDigest: sha(canon(selection)) }, after: { keys, selectionDigest: sha(canon(selection)) } };
const check = { ...current, status: 'PASS', currentEvidenceKey: current.evidenceKey, actualBatchCommand: command,
  stdoutSHA256: sha(stdout), stderrSHA256: sha(stderr), counts: parsed.counts, matchedPassedNames: ['alpha'] };
const runtime = { node: 'synthetic', executable: 'synthetic-node', binarySHA256: '0'.repeat(64), platform: 'synthetic-platform',
  arch: 'synthetic-arch', hostname: 'synthetic-host', release: 'synthetic-release', environmentSHA256: 'a'.repeat(64) };
function run(c = check, b = batch, out = stdout, actual = runtime, policy = 'strict') {
  return verifyCandidate(current, c, b, selection, selection, runtime, actual, parser, out, stderr, policy);
}
assert.equal(run().counts.pass, 1);
assert.throws(() => run(check, batch, Buffer.from('forged log')), /raw_log_hash/);
const missing = structuredClone(check); delete missing.currentEvidenceKey;
assert.throws(() => run(missing), /old_key/);
assert.throws(() => run({ ...check, evidenceKey: 'old' }), /old_key/);
assert.throws(() => run(check, batch, stdout, { ...runtime, environmentSHA256: 'b'.repeat(64) }), /context_mismatch/);
for (const output of [summary(0, 0), 'ok 1 - alpha\nok 2 - platform # SKIP platform\n' + summary(2, 1, 1)]) {
  const raw = Buffer.from(output), p = parser(output), hash = sha(raw);
  const forgedBatch = { ...batch, counts: p.counts, passedNames: p.passedNames, stdoutSHA256: hash };
  const forgedCheck = { ...check, counts: p.counts, matchedPassedNames: p.passedNames, stdoutSHA256: hash };
  assert.throws(() => run(forgedCheck, forgedBatch, raw), /not_complete_positive_PASS/);
}
assert.throws(() => run({ ...check, counts: { ...check.counts, pass: 2 } }), /counts_mismatch/);
assert.throws(() => run(check, { ...batch, after: { ...batch.after, keys: [] } }), /key_binding/);
assert.throws(() => run(check, { ...batch, status: 'FAIL' }), /batch_not_complete/);
assert.throws(() => run({ ...check, matchedPassedNames: ['invented alpha'] }), /passed_names_mismatch/);
assert.throws(() => run(check, { ...batch, command: [...command.slice(0, 3), 'test/other.js'] }), /batch_command/);
// Explicit opt-in accepts only a different valid opaque environment hash.
const otherEnvironment = { ...runtime, environmentSHA256: 'b'.repeat(64) };
assert.equal(run(check, batch, stdout, otherEnvironment, 'per-check-contexts').counts.pass, 1);
assert.throws(() => run(check, batch, stdout, otherEnvironment), /context_mismatch/);
for (const key of ['node', 'executable', 'binarySHA256', 'platform', 'arch', 'hostname', 'release']) {
  assert.throws(() => run(check, batch, stdout, { ...otherEnvironment, [key]: 'different' }, 'per-check-contexts'), /common_context_mismatch/);
}
const missingEnvironment = { ...runtime }; delete missingEnvironment.environmentSHA256;
assert.throws(() => run(check, batch, stdout, missingEnvironment, 'per-check-contexts'), /schema_mismatch/);
for (const malformed of ['bad', 'g'.repeat(64), 'A'.repeat(64), '']) assert.throws(() => run(check, batch, stdout, { ...runtime, environmentSHA256: malformed }, 'per-check-contexts'));
assert.throws(() => compareContext({ ...runtime, ignored: 'same' }, { ...runtime, ignored: 'same' }, 'per-check-contexts'), /schema_mismatch/);
assert.throws(() => compareContext(runtime, runtime, 'automatic-fallback'), /unsupported_context_policy/);
assert.throws(() => run({ ...check, evidenceKey: 'old' }, batch, stdout, otherEnvironment, 'per-check-contexts'), /old_key/);
assert.throws(() => run(check, batch, Buffer.from('forged log'), otherEnvironment, 'per-check-contexts'), /raw_log_hash/);
const skippedOutput = Buffer.from('ok 1 - alpha\nok 2 - platform # SKIP platform\n' + summary(2, 1, 1));
const skippedParsed = parser(skippedOutput.toString()), skippedHash = sha(skippedOutput);
assert.throws(() => run({ ...check, counts: skippedParsed.counts, stdoutSHA256: skippedHash },
  { ...batch, counts: skippedParsed.counts, passedNames: skippedParsed.passedNames, stdoutSHA256: skippedHash }, skippedOutput, otherEnvironment, 'per-check-contexts'), /not_complete_positive_PASS/);
const contexts = {};
const rows = [runtime, otherEnvironment].map(ownRuntime => ({ contextId: linkContext(contexts, ownRuntime), runtime: ownRuntime }));
assert.equal(Object.keys(contexts).length, 2);
for (const row of rows) assert.deepEqual(contexts[row.contextId], row.runtime);
const summaryMulti = contextSummary(contexts, runtime, 'per-check-contexts');
assert.equal(summaryMulti.sameEnvironment, false); assert.equal(summaryMulti.environmentEquivalence, 'unproven');
assert.equal(summaryMulti.environmentEqualityStatement, 'Для initial main сохранён только общий environment hash; возможные другие отличия окружения восстановить нельзя');
const sameContexts = {}; linkContext(sameContexts, runtime);
assert.equal(contextSummary(sameContexts, runtime, 'per-check-contexts').sameEnvironment, false);
assert.equal(contextSummary(sameContexts, runtime).sameEnvironment, true);
// Source scope is independently declared; old paths and evidence keys are never rewritten.
const currentPaths = Array.from({ length: 43 }, (_, index) => `core4/test/example-${index}.test.js`), oldPaths = currentPaths.slice(0, 37);
assert.throws(() => sourceScopeRelation(oldPaths, currentPaths), /scope_mismatch/);
assert.equal(sourceScopeRelation(oldPaths, currentPaths, 'prior-subset-of-current'), 'proper-subset');
assert.equal(sourceScopeRelation(currentPaths, currentPaths, 'prior-subset-of-current'), 'equal');
assert.equal(run().counts.pass, 1); // Matching current key still required after scope acceptance.
for (const bad of [[], [...oldPaths, oldPaths[0]], ['core4/outside.js'], ['core4/test/../a.js'], ['core4/test/a..js'],
  ['core4/test/a.js.'], ['core4/test/a.js '], ['core4/test/CON.js'], ['core4/test/foo~1.js'], ['core4\\test\\a.js'],
  ['C:/core4/a.js'], ['/core4/a.js'], ['core4//test/a.js'], ['core4/./a.js'], ['Core4/test/example-0.test.js']]) {
  assert.throws(() => sourceScopeRelation(bad, currentPaths, 'prior-subset-of-current'));
}
assert.throws(() => sourceScopeRelation(oldPaths, currentPaths, 'auto-accept'), /unsupported_source_scope_policy/);
assert.throws(() => run({ ...check, evidenceKey: 'old' }), /old_key/);
assert.equal(selectedStatus([{ check: 'alpha', status: 'PASS' }], [current, { check: 'new-check' }], 'per-check-contexts'), 'INCOMPLETE');
assert.equal(selectedStatus([{ check: 'alpha', status: 'PASS' }], [current], 'per-check-contexts'), 'MULTI_CONTEXT_SELECTED_PASS');
// Metadata validation only. These fixtures never enter the CLI join or execute tests.
const coreRoot = fs.realpathSync('C:/Users/Ant/Documents/Codex/AE_agent_core/core4');
const source = { root: coreRoot, selectorSHA256: '1'.repeat(64), mapSHA256: '2'.repeat(64) };
const approvedRunner = 'C:/Users/Ant/AppData/Local/Temp/core4-architecture-c-runner-8d693f84-6a96-4b44-b6c3-b866e979e892/run-selected.cjs';
const approvedHash = 'cf00330fa01d125d28aca48f8cb653fff17eb041dccfe19f74ce950a43c363f1';
function fixture(kind) {
  const directory = fs.mkdtempSync(path.join(__dirname, 'synthetic-'));
  const selectionFile = path.join(directory, 'selection.json'), configPath = path.join(directory, 'config.json'), resultFile = path.join(directory, 'result.json');
  const selectionBytes = JSON.stringify(selection); fs.writeFileSync(selectionFile, selectionBytes, { flag: 'wx' });
  const config = { coreRoot, changedPaths: kind === 'config-scope' ? oldPaths.slice(1) : oldPaths, contractImpacts: [], selectionFile };
  const configBytes = JSON.stringify(config); fs.writeFileSync(configPath, configBytes, { flag: 'wx' });
  const bound = { ...batch.before, selectorSHA256: source.selectorSHA256, mapSHA256: source.mapSHA256 };
  const proofBatch = { ...batch, cwd: coreRoot, index: 1, before: { ...bound }, after: { ...bound } };
  if (kind === 'batch-map') proofBatch.before.mapSHA256 = '3'.repeat(64);
  const result = { finishedAt: '2026-11-12T12:00:00.000Z', status: 'PASS', coreRoot, changedPaths: oldPaths, contractImpacts: [],
    selectorSHA256: source.selectorSHA256, mapSHA256: kind === 'map' ? '3'.repeat(64) : source.mapSHA256, runtime,
    runner: { path: approvedRunner, sha256: approvedHash }, configPath, configSHA256: sha(configBytes), selectionFile,
    selectionSHA256: sha(selectionBytes), checks: [check], batches: [proofBatch] };
  fs.writeFileSync(resultFile, JSON.stringify(result), { flag: 'wx' }); return resultFile;
}
const union = { selectedCorePaths: currentPaths };
const validProof = verifyResult(fixture('valid'), selection, union, source, runtime, [approvedHash], 'strict', 'prior-subset-of-current');
assert.deepEqual(validProof.originalSourceScope.paths, oldPaths); assert.equal(validProof.originalSourceScope.count, 37);
assert.equal(validProof.originalSourceScope.relationToCurrent, 'proper-subset'); assert.equal(validProof.originalSourceScope.originalImplementationBaseVerified, false);
assert.throws(() => verifyResult(fixture('valid-strict'), selection, union, source, runtime, [approvedHash]), /scope_mismatch/);
assert.throws(() => verifyResult(fixture('config-scope'), selection, union, source, runtime, [approvedHash], 'strict', 'prior-subset-of-current'), /original_config_scope_mismatch/);
assert.throws(() => verifyResult(fixture('map'), selection, union, source, runtime, [approvedHash], 'strict', 'prior-subset-of-current'), /selector_or_map_changed/);
assert.throws(() => verifyResult(fixture('batch-map'), selection, union, source, runtime, [approvedHash], 'strict', 'prior-subset-of-current'), /batch_selector_or_map_changed/);
console.log(JSON.stringify({ original12Cases: 'PASS', contextPolicyCases: 'PASS', sourceScopeCases: 'PASS', status: 'PASS', sourceSuitesExecuted: 0, evidenceJoinExecuted: false }));
