'use strict';
// Synthetic in-memory records only; no source suites, Git, or join output.
const assert = require('node:assert/strict');
const { verifyCandidate, loadParser, canon, sha, compareContext, linkContext, contextSummary } = require('./join-evidence.cjs');
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
console.log(JSON.stringify({ original12Cases: 'PASS', contextPolicyCases: 'PASS', status: 'PASS', sourceSuitesExecuted: 0, evidenceJoinExecuted: false }));
