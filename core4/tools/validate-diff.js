'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { hash, fail } = require('../protocol/json');
const { files } = require('./check-boundaries');
function executionBatches(checks) {
  const groups = new Map();
  for (const check of checks) {
    const command = check.command;
    if (command.length !== 4 || command[0] !== 'node' || command[1] !== '--test' || !command[2].startsWith('--test-name-pattern=')) fail('unsupported_check_command', check.check);
    const key = command[3];
    if (!groups.has(key)) groups.set(key, { checks: [], patterns: [], file: key });
    const group = groups.get(key); group.checks.push(check.check); group.patterns.push(command[2].slice('--test-name-pattern='.length));
  }
  return [...groups.values()].map(group => ({ checks: group.checks, command: ['node', '--test', '--test-name-pattern=' + [...new Set(group.patterns)].map(pattern => '(?:' + pattern + ')').join('|'), group.file] }));
}
function selectChecks(changed, root = path.resolve(__dirname, '..'), { contractImpacts = [] } = {}) {
  const map = JSON.parse(fs.readFileSync(path.join(root, 'config/validation-map.json'), 'utf8'));
  const selected = new Map(); const deferredCoverage = [];
  const changedFiles = [...new Set(changed.map(file => file.replace(/\\/g, '/')))];
  if (!Array.isArray(contractImpacts) || contractImpacts.length > 32 || contractImpacts.some(id => typeof id !== 'string')) fail('invalid_contract_impacts');
  for (const check of Object.keys(map.checkDependencies)) if (!['component', 'integration'].includes(map.checkPolicy?.[check]?.kind)) fail('check_policy_required', check);
  function include(check, reason, dependencyPath) {
    if (!map.checkDependencies[check]) fail('unknown_check', check);
    if (!selected.has(check)) selected.set(check, { check, reasons: [], dependencyPaths: [], command: map.checkCommands?.[check] || ['node', '--test', '--test-name-pattern=' + check, 'test/core4.test.js'] });
    if (!selected.get(check).reasons.includes(reason)) { selected.get(check).reasons.push(reason); selected.get(check).dependencyPaths.push(dependencyPath); }
  }
  for (const file of changedFiles) {
    const matches = map.owners.filter(o => file.startsWith(o.prefix));
    const longest = Math.max(...matches.map(o => o.prefix.length)); const owners = matches.filter(o => o.prefix.length === longest);
    if (owners.length !== 1) fail('unknown_or_ambiguous_owner', file);
    const owner = owners[0];
    for (const check of owner.checks) include(check, 'changed owner ' + owner.owner + ': ' + file, [file, owner.owner, check]);
    for (const contract of map.contracts.filter(c => file.startsWith(c.prefix))) for (const check of contract.consumers) include(check, 'changed public contract ' + contract.id + ': ' + file, [file, contract.id, check]);
    for (const edge of (map.sharedRuntimeEdges || []).filter(edge => file.startsWith(edge.prefix))) for (const check of edge.consumers) include(check, 'changed shared runtime ' + edge.id + ': ' + file, [file, edge.id, check]);
  }
  for (const id of new Set(contractImpacts)) {
    const contracts = map.contracts.filter(contract => contract.id === id); if (!contracts.length) fail('unknown_contract_impact', id);
    for (const contract of contracts) for (const check of contract.consumers) include(check, 'declared semantic contract impact ' + id, ['declared contractImpacts', id, check]);
  }
  for (const [check, dependencies] of Object.entries(map.checkDependencies)) {
    const affected = [];
    for (const file of changedFiles) {
      const relative = file.startsWith('core4/') ? file.slice('core4/'.length) : null;
      if (!relative) continue;
      for (const dep of dependencies) if (dep.endsWith('/') ? relative.startsWith(dep) : relative === dep) affected.push({ file, dependency: dep });
      for (const projection of map.checkProjections?.[check] || []) if (relative === projection.file) affected.push({ file, dependency: projection.file + '#' + projection.key + '[id=' + projection.id + ']' });
    }
    if (affected.length && map.checkPolicy[check].kind === 'component') {
      for (const hit of affected) include(check, 'changed component dependency ' + hit.dependency + ': ' + hit.file, [hit.file, hit.dependency, check]);
    } else if (affected.length && !selected.has(check)) {
      deferredCoverage.push({ check, status: 'current-closure-unverified', changedDependencies: affected, reason: 'Integration bytes changed outside this scoped owner/public/shared contract route; no current-closure PASS or release certification is claimed.', dependencyPath: affected.map(hit => [hit.file, hit.dependency, check]) });
    }
  }
  for (const value of selected.values()) {
    const dependencySet = new Set();
    for (const dep of map.checkDependencies[value.check]) {
      const target = path.resolve(root, dep);
      if (!target.startsWith(path.resolve(root) + path.sep) || !fs.existsSync(target)) fail('check_dependency_unavailable', dep);
      for (const file of fs.statSync(target).isDirectory() ? files(target) : [target]) dependencySet.add(file);
    }
    const dependencies = [...dependencySet].sort();
    const projections = (map.checkProjections?.[value.check] || []).map(p => {
      const data = JSON.parse(fs.readFileSync(path.join(root, p.file), 'utf8'));
      const entry = data[p.key].find(item => item.id === p.id); if (!entry) fail('dependency_projection_missing');
      return { dependency: p.file + '#' + p.key + '[id=' + p.id + ']', digest: hash(entry) };
    });
    value.evidenceKey = hash({ check: value.check, command: value.command, dependencies: dependencies.map(f => [path.relative(root, f).replace(/\\/g, '/'), hash(fs.readFileSync(f))]), projections });
    value.reason = value.reasons.join('; '); value.dependencyPath = value.dependencyPaths;
    value.dependencies = dependencies.map(f => path.relative(root, f).replace(/\\/g, '/')).concat(projections.map(p => p.dependency));
  }
  return { mode: 'scoped', certification: 'selected-artifacts-only', releaseCertified: false, contractImpacts: [...new Set(contractImpacts)], checks: [...selected.values()], executionBatches: executionBatches([...selected.values()]), deferredCoverage };
}
function main() {
  const root = path.resolve(__dirname, '..'); const run = process.argv.includes('--run');
  const args = process.argv.slice(2); let changed = [], contractImpacts = [];
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--run') continue;
    if (args[index] === '--contract-impacts') { try { contractImpacts = JSON.parse(args[++index]); } catch { fail('invalid_contract_impacts'); } }
    else if (args[index].startsWith('--')) fail('unknown_option', args[index]);
    else changed.push(args[index]);
  }
  if (!changed.length) {
    const cwd = path.resolve(root, '..');
    changed = [...new Set([...execFileSync('git', ['diff', '--name-only', 'HEAD', '--', 'core4'], { cwd, encoding: 'utf8' }).trim().split('\n'), ...execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--', 'core4'], { cwd, encoding: 'utf8' }).trim().split('\n')].filter(Boolean))];
  }
  const result = selectChecks(changed, root, { contractImpacts }); console.log(JSON.stringify(result, null, 2));
  const childEnv = { ...process.env }; delete childEnv.NODE_TEST_CONTEXT;
  if (run) for (const batch of result.executionBatches) {
    const output = spawnSync(process.execPath, batch.command.slice(1), { cwd: root, stdio: 'inherit', env: childEnv, windowsHide: true });
    if (output.status !== 0) process.exit(output.status || 1);
  }
}
if (require.main === module) { try { main(); } catch (e) { console.error((e.code || 'failed') + ': ' + e.message); process.exitCode = 1; } }
module.exports = { selectChecks };
