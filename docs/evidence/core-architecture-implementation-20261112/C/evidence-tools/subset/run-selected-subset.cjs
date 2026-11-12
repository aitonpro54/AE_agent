'use strict';
// Task-local C evidence runner. No resume/cache and no automatic retries.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = file => sha(fs.readFileSync(file));
const canon = v => JSON.stringify(v && typeof v === 'object' ? Array.isArray(v) ? v.map(x => JSON.parse(canon(x))) : Object.fromEntries(Object.keys(v).sort().map(k => [k, JSON.parse(canon(v[k]))])) : v);
const same = (a, b) => canon(a) === canon(b);
const demand = (ok, message) => { if (!ok) throw new Error(message); };
function childEnvironment() { const env = { ...process.env }; delete env.NODE_TEST_CONTEXT; return env; }
function subsetPlan(frozen, onlyChecks) {
  const known = new Set(frozen.checks.map(c => c.check));
  demand(Array.isArray(onlyChecks) && onlyChecks.length && new Set(onlyChecks).size === onlyChecks.length &&
    onlyChecks.every(name => typeof name === 'string' && known.has(name)), 'onlyChecks_requires_unique_nonempty_known_names');
  const requested = new Set(onlyChecks);
  const batches = frozen.executionBatches.filter(batch => batch.checks.some(name => requested.has(name)));
  const expanded = new Set(batches.flatMap(batch => batch.checks));
  demand(onlyChecks.every(name => expanded.has(name)) && [...expanded].every(name => known.has(name)), 'invalid_batch_membership');
  return { requestedChecks: onlyChecks, expandedChecks: frozen.checks.filter(c => expanded.has(c.check)).map(c => c.check),
    checks: frozen.checks.filter(c => expanded.has(c.check)), batches,
    skippedByPlan: frozen.checks.filter(c => !expanded.has(c.check)).map(c => ({ check: c.check, status: 'NOT_REQUESTED', evidenceKey: c.evidenceKey, command: c.command })) };
}
function parseOutput(text) {
  const counts = {}, passedNames = [], skippedLines = [], duplicate = [];
  const stack = [];
  for (const raw of text.replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/)) {
    const summary = raw.match(/^(?:# |ℹ )(tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$/);
    if (summary) { if (counts[summary[1]] !== undefined) duplicate.push(summary[1]); counts[summary[1]] = Number(summary[2]); }
    if (/^\s*(?:ok|not ok) .*#\s*(?:SKIP|TODO)\b/i.test(raw) || /^\s*﹣ /.test(raw)) skippedLines.push(raw);
    const parent = raw.match(/^(\s*)# Subtest: (.*)$/) || raw.match(/^(\s*)▶ (.*?)(?: \([\d.]+m?s\))?\s*$/);
    if (parent) {
      const indent = parent[1].length;
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
      stack.push({ indent, name: parent[2] });
    }
    const tap = raw.match(/^(\s*)ok \d+ - (.*)$/);
    const spec = raw.match(/^(\s*)✔ (.*?) \([\d.]+m?s\)\s*$/);
    const match = tap || spec;
    if (!match || /#\s*(?:SKIP|TODO)\b/i.test(match[2])) continue;
    const indent = match[1].length, name = match[2].replace(/ #.*$/, '');
    passedNames.push(name, [...stack.filter(x => x.indent < indent).map(x => x.name), name].join(' '));
  }
  const complete = ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].every(k => Number.isSafeInteger(counts[k])) && !duplicate.length &&
    counts.tests === ['pass', 'fail', 'cancelled', 'skipped', 'todo'].reduce((sum, key) => sum + counts[key], 0);
  return { counts, complete, duplicate, passedNames: [...new Set(passedNames)], skippedLines };
}
function commandOK(command, root) {
  demand(Array.isArray(command) && command.length === 4 && command[0] === 'node' && command[1] === '--test' &&
    typeof command[2] === 'string' && command[2].startsWith('--test-name-pattern=') &&
    typeof command[3] === 'string' && /^test\/[a-zA-Z0-9_./-]+\.js$/.test(command[3]) &&
    !command[3].split('/').includes('..'), 'unsupported_check_command');
  demand(fs.realpathSync(path.join(root, command[3])).startsWith(root + path.sep), 'test_path_outside_core');
  new RegExp(command[2].slice('--test-name-pattern='.length));
}
function execute(batch, root, directory, index, timeoutMs) {
  return new Promise(resolve => {
    const stdout = path.join(directory, `${index}.stdout.log`), stderr = path.join(directory, `${index}.stderr.log`);
    const out = fs.openSync(stdout, 'wx'), err = fs.openSync(stderr, 'wx');
    const env = childEnvironment();
    const startedAt = new Date().toISOString(), start = Date.now();
    let timedOut = false, error = null, killResult = null, settled = false, timer, grace;
    const child = spawn(process.execPath, batch.command.slice(1), { cwd: root, env, windowsHide: true, stdio: ['ignore', out, err] });
    fs.closeSync(out); fs.closeSync(err);
    const finish = (exitCode, signal, closed) => {
      if (settled) return; settled = true; clearTimeout(timer); clearTimeout(grace);
      resolve({ command: batch.command, cwd: root, pid: child.pid ?? null, startedAt, durationMs: Date.now() - start,
        exitCode, signal, error, timedOut, killResult, closed, logsComplete: closed && !timedOut,
        stdout, stderr, stdoutSHA256: digest(stdout), stderrSHA256: digest(stderr) });
    };
    child.on('error', e => { error = { code: e.code, message: e.message }; });
    child.on('close', (code, signal) => finish(code, signal, true));
    timer = setTimeout(() => {
      timedOut = true; killResult = child.kill(); // Only this owned child; descendants are uncertain.
      grace = setTimeout(() => { child.unref(); finish(null, null, false); }, 5000);
    }, timeoutMs);
  });
}
async function main() {
  demand(process.argv.length === 4 && process.argv[2] === '--config', 'usage: node run-selected-subset.cjs --config absolute-config.json');
  const configPath = path.resolve(process.argv[3]), config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  demand(path.isAbsolute(config.coreRoot) && path.isAbsolute(config.selectionFile), 'absolute_coreRoot_and_selectionFile_required');
  demand(Array.isArray(config.changedPaths) && config.changedPaths.length && config.changedPaths.every(p => typeof p === 'string' && p.startsWith('core4/') && !p.split('/').includes('..')), 'explicit_changedPaths_required');
  const impacts = config.contractImpacts || [], timeoutMs = config.timeoutMs ?? 1800000;
  demand(Number.isSafeInteger(timeoutMs) && timeoutMs >= 1000 && timeoutMs <= 86400000, 'invalid_timeoutMs');
  demand(!config.resume, 'resume_not_supported_no_implicit_reuse');
  const root = fs.realpathSync(config.coreRoot), selector = path.join(root, 'tools/validate-diff.js'), map = path.join(root, 'config/validation-map.json');
  const selectionBytes = fs.readFileSync(config.selectionFile), frozen = JSON.parse(selectionBytes);
  demand(Array.isArray(frozen.checks) && frozen.checks.length && Array.isArray(frozen.executionBatches), 'selection_requires_checks_and_batches');
  for (const item of [...frozen.checks, ...frozen.executionBatches]) commandOK(item.command, root);
  function capture() {
    const selectorSHA256 = digest(selector), mapSHA256 = digest(map);
    for (const key of Object.keys(require.cache)) if (key.startsWith(root + path.sep)) delete require.cache[key];
    const selected = require(selector).selectChecks(config.changedPaths, root, { contractImpacts: impacts });
    demand(digest(selector) === selectorSHA256 && digest(map) === mapSHA256, 'selector_or_map_changed_during_capture');
    return { selectorSHA256, mapSHA256, selected };
  }
  const initial = capture();
  demand(same(initial.selected, frozen), 'stale_frozen_selection');
  const plan = subsetPlan(frozen, config.onlyChecks);
  const tempRoot = fs.realpathSync(os.tmpdir()), artifactRoot = fs.realpathSync(__dirname);
  demand(artifactRoot.startsWith(tempRoot + path.sep) && !artifactRoot.startsWith(root + path.sep), 'runner_must_stay_in_TEMP');
  const directory = fs.mkdtempSync(path.join(artifactRoot, 'result-'));
  const resultFile = path.join(directory, 'result.json');
  const result = { schema: 1, mode: 'subset', certification: 'executed-batches-only', context: 'technical_check/ephemeral_check', releaseCertified: false, fullSelectionCertified: false, startedAt: new Date().toISOString(),
    configPath, configSHA256: digest(configPath), coreRoot: root, changedPaths: config.changedPaths, contractImpacts: impacts,
    selectionFile: config.selectionFile, selectionSHA256: sha(selectionBytes), selectorSHA256: initial.selectorSHA256, mapSHA256: initial.mapSHA256,
    runner: { path: __filename, sha256: digest(__filename) },
    runtime: { node: process.version, executable: process.execPath, binarySHA256: digest(process.execPath), platform: process.platform, arch: process.arch, hostname: os.hostname(), release: os.release(), environmentSHA256: sha(canon(childEnvironment())) },
    requestedChecks: plan.requestedChecks, expandedChecks: plan.expandedChecks, skippedByPlan: plan.skippedByPlan,
    deferredCoverage: frozen.deferredCoverage, checks: plan.checks.map(c => ({ check: c.check, evidenceKey: c.evidenceKey, command: c.command, status: 'NOT_RUN' })), batches: [] };
  function persist() {
    result.requestedOutstandingCoverage = result.checks.filter(c => c.status !== 'PASS').map(c => ({ check: c.check, status: c.status }));
    result.outstandingCoverage = [...result.requestedOutstandingCoverage, ...plan.skippedByPlan.map(c => ({ check: c.check, status: c.status }))];
    const temp = resultFile + '.' + randomUUID() + '.tmp'; fs.writeFileSync(temp, JSON.stringify(result, null, 2)); fs.renameSync(temp, resultFile);
  }
  function unchanged(snap) { return same(snap, initial) && digest(configPath) === result.configSHA256 && digest(config.selectionFile) === result.selectionSHA256 && digest(__filename) === result.runner.sha256; }
  const binding = snap => snap && ({ selectorSHA256: snap.selectorSHA256, mapSHA256: snap.mapSHA256, selectionDigest: sha(canon(snap.selected)), keys: snap.selected.checks.map(c => ({ check: c.check, evidenceKey: c.evidenceKey })) });
  persist(); console.log(JSON.stringify({ resultFile, batches: plan.batches.length, requestedChecks: plan.requestedChecks.length, expandedChecks: plan.checks.length, notRequested: plan.skippedByPlan.length }));
  try {
    for (const [index, batch] of plan.batches.entries()) {
      const before = capture(); demand(unchanged(before), 'source_or_input_changed_before_batch');
      const raw = await execute(batch, root, directory, index + 1, timeoutMs);
      const parsed = parseOutput(fs.readFileSync(raw.stdout, 'utf8') + '\n' + fs.readFileSync(raw.stderr, 'utf8'));
      let after = null, afterError = null;
      try { after = capture(); } catch (e) { afterError = e.message; }
      const stable = after !== null && unchanged(after);
      let status = raw.timedOut || !raw.closed ? 'UNKNOWN' : !stable ? 'STALE' : raw.error || raw.exitCode !== 0 || raw.signal ? 'FAIL' :
        !parsed.complete || parsed.counts.pass < 1 || parsed.counts.tests < 1 ? 'AMBIGUOUS' :
        parsed.counts.fail || parsed.counts.cancelled || parsed.counts.todo ? 'FAIL' : parsed.counts.skipped ? 'PASS_WITH_SKIPS' : 'PASS';
      const record = { index: index + 1, ...raw, checks: batch.checks, status, ...parsed, before: binding(before), after: binding(after), afterError };
      result.batches.push(record);
      for (const name of batch.checks) {
        const check = result.checks.find(c => c.check === name), pattern = new RegExp(check.command[2].slice('--test-name-pattern='.length));
        const matchedPassedNames = parsed.passedNames.filter(n => pattern.test(n));
        Object.assign(check, { status: status === 'PASS' && !matchedPassedNames.length ? 'AMBIGUOUS' : status, currentEvidenceKey: after?.selected.checks.find(c => c.check === name)?.evidenceKey ?? null,
          batchIndex: index + 1, actualBatchCommand: batch.command, stdoutSHA256: raw.stdoutSHA256, stderrSHA256: raw.stderrSHA256, counts: parsed.counts, matchedPassedNames });
      }
      if (status === 'PASS' && batch.checks.some(name => result.checks.find(c => c.check === name).status !== 'PASS')) record.status = status = 'AMBIGUOUS';
      persist(); console.log(JSON.stringify({ batch: index + 1, status, counts: parsed.counts, durationMs: raw.durationMs }));
      if (!stable || raw.timedOut || !raw.closed) break; // Unknown/source change: no replay or further dispatch.
    }
  } catch (e) { result.error = { message: e.message, code: e.code ?? null }; }
  result.finishedAt = new Date().toISOString(); persist();
  result.status = result.error || result.requestedOutstandingCoverage.length ? 'INCOMPLETE' : 'SUBSET_PASS'; persist();
  console.log(JSON.stringify({ resultFile, status: result.status, requestedOutstanding: result.requestedOutstandingCoverage.length, notRequested: plan.skippedByPlan.length, deferred: result.deferredCoverage.length, releaseCertified: false }));
  if (result.status !== 'SUBSET_PASS') process.exitCode = 1;
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { parseOutput, commandOK, subsetPlan };
