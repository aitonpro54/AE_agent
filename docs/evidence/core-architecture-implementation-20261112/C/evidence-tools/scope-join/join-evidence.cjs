'use strict';
// Task-local, read-only evidence verification. Only git inspection is executed.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const ORIGINAL = 'C:/Users/Ant/AppData/Local/Temp/core4-architecture-c-runner-8d693f84-6a96-4b44-b6c3-b866e979e892/run-selected.cjs';
const APPROVED = ['cf00330fa01d125d28aca48f8cb653fff17eb041dccfe19f74ce950a43c363f1', '4b9dd7f879b8e437dced728271d7d58628d15f2efb2c900c85b9e4c465a552d8'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const canon = v => JSON.stringify(v && typeof v === 'object' ? Array.isArray(v) ? v.map(x => JSON.parse(canon(x))) : Object.fromEntries(Object.keys(v).sort().map(k => [k, JSON.parse(canon(v[k]))])) : v);
const same = (a, b) => canon(a) === canon(b);
const demand = (ok, why) => { if (!ok) throw new Error(why); };
const setSame = (a, b) => Array.isArray(a) && Array.isArray(b) && new Set(a).size === a.length && new Set(b).size === b.length && same([...a].sort(), [...b].sort());
function sourceScopeRelation(previous, current, policy = 'strict') {
  demand(['strict', 'prior-subset-of-current'].includes(policy), 'unsupported_source_scope_policy');
  if (policy === 'strict') { demand(setSame(previous, current), 'result_scope_mismatch'); return 'equal'; }
  const canonical = paths => Array.isArray(paths) && paths.length > 0 && new Set(paths).size === paths.length && paths.every(name =>
    typeof name === 'string' && name.startsWith('core4/') && !name.includes('\\') && name.split('/').every(part =>
      /^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(part) && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)));
  demand(canonical(previous) && canonical(current), 'noncanonical_or_duplicate_source_paths');
  const all = new Set(current); demand(previous.every(name => all.has(name)), 'prior_source_path_outside_current_scope');
  return previous.length === current.length ? 'equal' : 'proper-subset';
}
function selectedStatus(checks, currentChecks, contextPolicy = 'strict') {
  if (!setSame(checks.map(c => c.check), currentChecks.map(c => c.check)) || checks.some(c => c.status !== 'PASS')) return 'INCOMPLETE';
  return contextPolicy === 'per-check-contexts' ? 'MULTI_CONTEXT_SELECTED_PASS' : 'SELECTED_PASS';
}
const RUNTIME_FIELDS = ['node', 'executable', 'binarySHA256', 'platform', 'arch', 'hostname', 'release', 'environmentSHA256'];
function compareContext(runtime, currentRuntime, policy = 'strict') {
  demand(['strict', 'per-check-contexts'].includes(policy), 'unsupported_context_policy');
  for (const value of [runtime, currentRuntime]) {
    demand(value && setSame(Object.keys(value), RUNTIME_FIELDS) && RUNTIME_FIELDS.every(key => typeof value[key] === 'string' && value[key].length > 0), 'runtime_context_schema_mismatch');
    demand(/^[a-f0-9]{64}$/.test(value.environmentSHA256), 'missing_or_malformed_environment_hash');
  }
  if (policy === 'strict') { demand(same(runtime, currentRuntime), 'runtime_or_environment_context_mismatch'); return; }
  const common = value => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'environmentSHA256'));
  demand(same(common(runtime), common(currentRuntime)), 'runtime_common_context_mismatch');
}
function linkContext(contexts, runtime) {
  const contextId = 'context-' + sha(canon(runtime)); contexts[contextId] = runtime; return contextId;
}
function contextSummary(contexts, currentRuntime, policy = 'strict') {
  const values = Object.values(contexts), differentHashes = new Set(values.map(value => value.environmentSHA256));
  return { sameEnvironment: policy === 'per-check-contexts' ? false : values.length ? differentHashes.size === 1 : null,
    environmentEquivalence: 'unproven', opaqueEnvironmentHashesEqual: values.length ? differentHashes.size === 1 : null,
    opaqueHashesMatchVerifier: values.length ? values.every(value => value.environmentSHA256 === currentRuntime.environmentSHA256) : null,
    currentEnvironmentSHA256: currentRuntime.environmentSHA256,
    historicalPerKeyEnvironmentEqualityProven: false,
    environmentEqualityStatement: 'Для initial main сохранён только общий environment hash; возможные другие отличия окружения восстановить нельзя' };
}
const snapshots = new Map();
function bytes(file, tempOnly = false) {
  demand(path.isAbsolute(file), 'absolute_path_required');
  const real = fs.realpathSync(file), stat = fs.statSync(real);
  if (tempOnly) demand(real.startsWith(fs.realpathSync(os.tmpdir()) + path.sep), 'input_must_be_in_TEMP');
  demand(stat.isFile() && stat.size <= 128 * 1024 * 1024, 'input_not_file_or_too_large');
  const data = fs.readFileSync(real), hash = sha(data);
  demand(!snapshots.has(real) || snapshots.get(real) === hash, 'input_changed_during_verification');
  snapshots.set(real, hash); return data;
}
const json = file => JSON.parse(bytes(file, true).toString('utf8'));
function pin(file, expected, size, tempOnly = false) {
  const data = bytes(file, tempOnly);
  demand(/^[a-f0-9]{64}$/.test(expected) && sha(data) === expected && (size === undefined || data.length === size), 'hash_or_size_mismatch:' + file);
  return data;
}
function relativeFile(root, name) {
  demand(typeof name === 'string' && name && !path.isAbsolute(name) && !name.split(/[\\/]/).some(s => !s || s === '..' || s === '.'), 'invalid_relative_path');
  const file = fs.realpathSync(path.join(root, name)); demand(file.startsWith(root + path.sep), 'path_outside_root'); return file;
}
function context() {
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  return { node: process.version, executable: process.execPath, binarySHA256: sha(bytes(process.execPath)), platform: process.platform,
    arch: process.arch, hostname: os.hostname(), release: os.release(), environmentSHA256: sha(canon(env)) };
}
function loadParser() { pin(ORIGINAL, APPROVED[0], undefined, true); return require(ORIGINAL).parseOutput; }
function verifyPassedLog(batch, check, stdout, stderr, parser) {
  demand(sha(stdout) === batch.stdoutSHA256 && sha(stderr) === batch.stderrSHA256, 'raw_log_hash_mismatch');
  const parsed = parser(stdout.toString('utf8') + '\n' + stderr.toString('utf8'));
  demand(parsed.complete && parsed.counts.tests > 0 && parsed.counts.pass > 0 &&
    ['fail', 'cancelled', 'skipped', 'todo'].every(k => parsed.counts[k] === 0), 'raw_log_not_complete_positive_PASS');
  demand(same(parsed.counts, batch.counts) && same(parsed.counts, check.counts), 'recorded_counts_mismatch');
  const pattern = new RegExp(check.command[2].slice('--test-name-pattern='.length));
  const matchedPassedNames = parsed.passedNames.filter(n => pattern.test(n));
  demand(matchedPassedNames.length > 0, 'check_has_no_executed_matching_name');
  demand(same(parsed.passedNames, batch.passedNames) && same(matchedPassedNames, check.matchedPassedNames), 'recorded_passed_names_mismatch');
  return { counts: parsed.counts, matchedPassedNames };
}
function verifyCandidate(current, check, batch, oldSelection, currentSelection, runtime, currentRuntime, parser, stdout, stderr, contextPolicy = 'strict') {
  compareContext(runtime, currentRuntime, contextPolicy);
  demand(check.status === 'PASS' && check.evidenceKey === current.evidenceKey && check.currentEvidenceKey === current.evidenceKey, 'check_nonPASS_missing_or_old_key');
  demand(same(check.command, current.command), 'individual_command_mismatch');
  const old = oldSelection.checks.find(c => c.check === current.check);
  demand(old && old.evidenceKey === current.evidenceKey && same(old.command, current.command), 'stored_selection_missing_or_old_key');
  const originalBatch = oldSelection.executionBatches.find(b => b.checks.includes(current.check));
  const currentBatch = currentSelection.executionBatches.find(b => b.checks.includes(current.check));
  demand(originalBatch && currentBatch && setSame(batch.checks, originalBatch.checks) && setSame(batch.checks, currentBatch.checks) &&
    same(batch.command, originalBatch.command) && same(batch.command, currentBatch.command) && same(check.actualBatchCommand, batch.command), 'original_batch_command_or_membership_mismatch');
  demand(batch.status === 'PASS' && batch.exitCode === 0 && batch.signal === null && batch.error === null && batch.closed === true &&
    batch.logsComplete === true && batch.timedOut === false, 'batch_not_complete_PASS');
  const keys = oldSelection.checks.map(c => ({ check: c.check, evidenceKey: c.evidenceKey }));
  for (const bound of [batch.before, batch.after]) demand(bound && same(bound.keys, keys) &&
    bound.selectionDigest === sha(canon(oldSelection)), 'before_after_key_binding_mismatch');
  demand(check.stdoutSHA256 === batch.stdoutSHA256 && check.stderrSHA256 === batch.stderrSHA256, 'check_log_hash_binding_mismatch');
  return verifyPassedLog(batch, check, stdout, stderr, parser);
}
function verifySource(config, selection, union) {
  const root = fs.realpathSync(config.coreRoot), repo = fs.realpathSync(path.dirname(root));
  demand(path.basename(root).toLowerCase() === 'core4' && /^[a-f0-9]{40}$/.test(union.implementationBase), 'invalid_source_root_or_base');
  demand(Array.isArray(union.changedPaths) && union.changedPaths.length && union.changedPaths.every(n => n.startsWith('core4/') || n.startsWith('products/titles/')), 'invalid_source_union_paths');
  demand(setSame(union.selectedCorePaths, union.changedPaths.filter(n => n.startsWith('core4/'))) &&
    setSame(Object.keys(union.sourceHashes), union.changedPaths), 'source_union_membership_mismatch');
  const git = args => execFileSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 16 * 1024 * 1024 }).split('\0').filter(Boolean);
  const tracked = git(['diff', '--name-only', '-z', union.implementationBase, '--', 'core4', 'products/titles']);
  const untracked = git(['ls-files', '--others', '--exclude-standard', '-z', '--', 'core4', 'products/titles']);
  demand(setSame([...new Set([...tracked, ...untracked])], union.changedPaths), 'fresh_git_source_union_mismatch');
  for (const [name, stamp] of Object.entries(union.sourceHashes)) {
    demand(Number.isSafeInteger(stamp.bytes) && stamp.bytes >= 0, 'source_size_required'); pin(relativeFile(repo, name), stamp.sha256, stamp.bytes);
  }
  demand(union.protectedFiles && Object.keys(union.protectedFiles).length > 0, 'protected_dirty_hashes_required');
  for (const [name, hash] of Object.entries(union.protectedFiles)) pin(relativeFile(repo, name), hash);
  demand(fs.realpathSync(union.selection.path) === fs.realpathSync(config.selectionFile), 'source_union_selection_path_mismatch');
  pin(config.selectionFile, union.selection.sha256, undefined, true);
  const selector = path.join(root, 'tools/validate-diff.js'), map = path.join(root, 'config/validation-map.json');
  const selectorSHA256 = sha(bytes(selector)), mapSHA256 = sha(bytes(map));
  for (const key of Object.keys(require.cache)) if (key.startsWith(root + path.sep)) delete require.cache[key];
  const fresh = require(selector).selectChecks(union.selectedCorePaths, root, { contractImpacts: [] });
  demand(same(fresh, selection), 'fresh_full_selection_mismatch');
  return { root, repo, selectorSHA256, mapSHA256, sourceUnionSHA256: sha(bytes(config.sourceUnionFile, true)),
    implementationBase: union.implementationBase, changedPaths: union.changedPaths, tracked, untracked,
    sourceHashes: union.sourceHashes, protectedFiles: union.protectedFiles };
}
function verifyResult(file, currentSelection, union, source, currentRuntime, allowed, contextPolicy = 'strict', sourceScopePolicy = 'strict') {
  const raw = bytes(file, true), result = JSON.parse(raw);
  demand(typeof result.finishedAt === 'string' && Number.isFinite(Date.parse(result.finishedAt)) && ['PASS', 'INCOMPLETE', 'SUBSET_PASS'].includes(result.status), 'result_not_finished');
  demand(fs.realpathSync(result.coreRoot) === source.root && same(result.contractImpacts, []), 'result_scope_mismatch');
  const relationToCurrent = sourceScopeRelation(result.changedPaths, union.selectedCorePaths, sourceScopePolicy);
  demand(result.selectorSHA256 === source.selectorSHA256 && result.mapSHA256 === source.mapSHA256, 'result_selector_or_map_changed');
  compareContext(result.runtime, currentRuntime, contextPolicy);
  demand(allowed.includes(result.runner.sha256), 'unapproved_runner_hash'); pin(result.runner.path, result.runner.sha256, undefined, true);
  const config = JSON.parse(pin(result.configPath, result.configSHA256, undefined, true));
  demand(fs.realpathSync(config.coreRoot) === source.root && setSame(config.changedPaths, result.changedPaths) && same(config.contractImpacts || [], []), 'original_config_scope_mismatch');
  demand(fs.realpathSync(config.selectionFile) === fs.realpathSync(result.selectionFile), 'original_config_selection_mismatch');
  const oldSelection = JSON.parse(pin(result.selectionFile, result.selectionSHA256, undefined, true));
  demand(Array.isArray(oldSelection.checks) && Array.isArray(oldSelection.executionBatches) && same(oldSelection.contractImpacts, []), 'stored_full_selection_invalid');
  demand(Array.isArray(result.checks) && Array.isArray(result.batches) && new Set(result.checks.map(c => c.check)).size === result.checks.length &&
    new Set(result.batches.map(b => b.index)).size === result.batches.length, 'duplicate_or_missing_result_records');
  for (const batch of result.batches) {
    demand(fs.realpathSync(batch.cwd) === source.root, 'batch_cwd_mismatch');
    for (const bound of [batch.before, batch.after]) if (bound) demand(bound.selectorSHA256 === source.selectorSHA256 && bound.mapSHA256 === source.mapSHA256, 'batch_selector_or_map_changed');
  }
  if (result.mode === 'subset') {
    const plannerFile = 'C:/Users/Ant/AppData/Local/Temp/core4-architecture-c-subset-9cdd9825-26d9-4ccf-a08e-81b1db68669f/run-selected-subset.cjs';
    pin(plannerFile, APPROVED[1], undefined, true); const plan = require(plannerFile);
    const expected = plan.subsetPlan(oldSelection, config.onlyChecks);
    demand(setSame(result.checks.map(c => c.check), expected.expandedChecks) && same(result.requestedChecks, expected.requestedChecks) &&
      same(result.expandedChecks, expected.expandedChecks) && same(result.skippedByPlan, expected.skippedByPlan), 'subset_plan_mismatch');
  } else demand(setSame(result.checks.map(c => c.check), oldSelection.checks.map(c => c.check)), 'full_result_check_membership_mismatch');
  return { path: fs.realpathSync(file), sha256: sha(raw), result, oldSelection,
    originalSourceScope: { paths: result.changedPaths, count: result.changedPaths.length, relationToCurrent, originalImplementationBaseVerified: false } };
}
function main() {
  demand(process.argv.length === 4 && process.argv[2] === '--config', 'usage: node join-evidence.cjs --config absolute-config.json');
  const configPath = path.resolve(process.argv[3]), config = json(configPath);
  demand(path.isAbsolute(config.output) && fs.realpathSync(path.dirname(config.output)) === fs.realpathSync(__dirname) &&
    fs.realpathSync(__dirname).startsWith(fs.realpathSync(os.tmpdir()) + path.sep), 'output_must_be_new_file_in_this_TEMP_directory');
  const report = { schema: 1, purpose: 'technical_check/ephemeral_check', releaseCertified: false, status: 'INCOMPLETE', collectedAt: new Date().toISOString(),
    checks: [], contexts: {}, rejectedCandidates: [], inputResults: [], failedAttemptsPreserved: [], deferredCoverage: [], usedBatches: [] };
  try {
    const contextPolicy = config.contextPolicy ?? 'strict';
    const sourceScopePolicy = config.sourceScopePolicy ?? 'strict';
    demand(['strict', 'per-check-contexts'].includes(contextPolicy), 'unsupported_context_policy');
    demand(['strict', 'prior-subset-of-current'].includes(sourceScopePolicy), 'unsupported_source_scope_policy');
    demand(Object.keys(config).every(key => ['coreRoot', 'selectionFile', 'sourceUnionFile', 'sourceUnionSHA256', 'results', 'expectedRunnerHashes', 'extraInputs', 'output', 'contextPolicy', 'sourceScopePolicy'].includes(key)), 'unsupported_config_field_no_environment_exclusions');
    report.contextPolicy = contextPolicy; report.sourceScopePolicy = sourceScopePolicy;
    report.verifier = { path: __filename, sha256: sha(bytes(__filename, true)) };
    report.inputs = { configPath, configSHA256: sha(bytes(configPath, true)), selectionFile: config.selectionFile,
      selectionSHA256: sha(bytes(config.selectionFile, true)), sourceUnionFile: config.sourceUnionFile, sourceUnionSHA256: config.sourceUnionSHA256 };
    demand(Array.isArray(config.expectedRunnerHashes) && config.expectedRunnerHashes.length && config.expectedRunnerHashes.every(h => APPROVED.includes(h)), 'approved_runner_allowlist_required');
    demand(Array.isArray(config.results) && config.results.length && Array.isArray(config.extraInputs) && config.extraInputs.length, 'results_and_extraInputs_required');
    const parser = loadParser(), selection = json(config.selectionFile);
    const union = JSON.parse(pin(config.sourceUnionFile, config.sourceUnionSHA256, undefined, true));
    report.source = verifySource(config, selection, union); report.verifierContext = context(); report.deferredCoverage = selection.deferredCoverage;
    report.currentScope = { paths: union.selectedCorePaths, count: union.selectedCorePaths.length, sourceUnionSHA256: config.sourceUnionSHA256, implementationBase: union.implementationBase };
    report.extraInputs = config.extraInputs.map(item => { demand(Number.isSafeInteger(item.bytes) && item.bytes >= 0, 'extra_input_size_required'); pin(item.path, item.sha256, item.bytes); return item; });
    const proofs = [];
    for (const file of config.results) {
      try {
        const proof = verifyResult(file, selection, union, report.source, report.verifierContext, config.expectedRunnerHashes, contextPolicy, sourceScopePolicy); proofs.push(proof);
        report.inputResults.push({ path: proof.path, sha256: proof.sha256, status: proof.result.status, finishedAt: proof.result.finishedAt, originalSourceScope: proof.originalSourceScope });
        for (const batch of proof.result.batches) if (batch.status !== 'PASS') report.failedAttemptsPreserved.push({ result: proof.path, batch: batch.index, status: batch.status, command: batch.command, stdout: batch.stdout, stderr: batch.stderr });
      } catch (e) { report.rejectedCandidates.push({ result: file, reason: e.message }); }
    }
    const used = new Map();
    for (const current of selection.checks) {
      const candidates = [];
      for (const proof of proofs) {
        try {
          const check = proof.result.checks.find(c => c.check === current.check);
          demand(check, 'check_missing_from_result'); const batch = proof.result.batches.find(b => b.index === check.batchIndex); demand(batch, 'batch_missing');
          for (const log of [batch.stdout, batch.stderr]) demand(path.dirname(fs.realpathSync(log)) === path.dirname(proof.path), 'raw_log_outside_result_directory');
          const stdout = bytes(batch.stdout, true), stderr = bytes(batch.stderr, true);
          const validated = verifyCandidate(current, check, batch, proof.oldSelection, selection, proof.result.runtime, report.verifierContext, parser, stdout, stderr, contextPolicy);
          demand(Number.isFinite(Date.parse(batch.startedAt)) && Number.isFinite(batch.durationMs) && batch.durationMs >= 0, 'invalid_batch_timing');
          const identity = sha(canon({ command: batch.command, cwd: batch.cwd, startedAt: batch.startedAt, pid: batch.pid, stdoutSHA256: batch.stdoutSHA256, stderrSHA256: batch.stderrSHA256, runtime: proof.result.runtime }));
          candidates.push({ proof, check, batch, ...validated, identity, completed: Date.parse(batch.startedAt) + batch.durationMs });
        } catch (e) { report.rejectedCandidates.push({ check: current.check, result: proof.path, reason: e.message }); }
      }
      candidates.sort((a, b) => b.completed - a.completed);
      const chosen = candidates[0];
      if (!chosen) { report.checks.push({ check: current.check, evidenceKey: current.evidenceKey, status: 'MISSING_VALID_PASS' }); continue; }
      const { proof, batch } = chosen;
      const contextId = linkContext(report.contexts, proof.result.runtime);
      report.checks.push({ check: current.check, evidenceKey: current.evidenceKey, command: current.command, status: 'PASS', result: proof.path,
        resultSHA256: proof.sha256, contextId, runtime: proof.result.runtime, batchIdentity: chosen.identity, actualBatchCommand: batch.command, counts: chosen.counts, matchedPassedNames: chosen.matchedPassedNames });
      if (!used.has(chosen.identity)) used.set(chosen.identity, { identity: chosen.identity, result: proof.path, batchIndex: batch.index, command: batch.command,
        contextId, counts: chosen.counts, stdout: batch.stdout, stderr: batch.stderr, stdoutSHA256: batch.stdoutSHA256, stderrSHA256: batch.stderrSHA256, usedForChecks: [] });
      used.get(chosen.identity).usedForChecks.push(current.check);
    }
    // Re-read current source/diff/selection and every consumed file before writing.
    demand(same(report.source, verifySource(config, selection, union)) && same(report.verifierContext, context()), 'final_source_or_context_changed');
    for (const [file, hash] of snapshots) demand(sha(fs.readFileSync(file)) === hash, 'verified_input_changed_before_output:' + file);
    report.usedBatches = [...used.values()];
    report.countsFromDistinctUsedBatches = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].map(k => [k, report.usedBatches.reduce((sum, b) => sum + b.counts[k], 0)]));
    report.outstandingCoverage = report.checks.filter(c => c.status !== 'PASS');
    Object.assign(report, contextSummary(report.contexts, report.verifierContext, contextPolicy));
    report.status = selectedStatus(report.checks, selection.checks, contextPolicy);
  } catch (e) {
    report.error = e.message;
    for (const check of report.checks) if (check.status === 'PASS') { check.status = 'INVALIDATED'; check.reason = 'global_verification_failed'; }
  }
  fs.writeFileSync(config.output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output: config.output, status: report.status, checks: report.checks.length, pass: report.checks.filter(c => c.status === 'PASS').length,
    deferred: report.deferredCoverage.length, usedBatches: report.usedBatches.length, error: report.error ?? null, releaseCertified: false }));
  if (!['SELECTED_PASS', 'MULTI_CONTEXT_SELECTED_PASS'].includes(report.status)) process.exitCode = 1;
}
if (require.main === module) { try { main(); } catch (e) { console.error(e.message); process.exitCode = 1; } }
module.exports = { verifyCandidate, verifyPassedLog, loadParser, canon, sha, compareContext, linkContext, contextSummary, sourceScopeRelation, selectedStatus, verifyResult };
