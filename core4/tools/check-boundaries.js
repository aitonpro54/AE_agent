'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { reviewCode } = require('../core/artifacts');
const { fail } = require('../protocol/json');
function files(directory) { return fs.readdirSync(directory, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(directory, e.name)) : [path.join(directory, e.name)]); }
function checkEntrySource(source) {
  // Conservative reviewed-source guard, not a JavaScript or OS sandbox.
  // Exact anchors fail closed when startup's verification layout changes.
  const markers = ['async function start(', 'const installation = verifyInstallation(descriptor), root = installation.releaseDir;', "fail('installation_entry_root_mismatch');", "if (mode === 'stdio') startupGate = fs.openSync(installGate, 'wx');", "if (canonical(verifyInstallation(descriptor)) !== canonical(installation)) fail('installation_changed_during_start');", 'await continueStartOverStartup({ installation, descriptorPath: descriptor, port });', 'ownerLifecycle = await createOwnerLifecycle({ installation, descriptorPath: descriptor, reservedServer });', "const { Broker } = require('../core/broker.js');", 'finally { if (startupGate !== undefined) { fs.closeSync(startupGate); fs.unlinkSync(installGate); } }'];
  const offsets = markers.map(marker => source.indexOf(marker));
  if (offsets.some((offset, n) => offset < 0 || source.lastIndexOf(markers[n]) !== offset || n > 0 && offset <= offsets[n - 1])) fail('entry_verification_layout');
  const specMarker = "const compositionSpec = require('./composition-spec.js');", specAt = source.indexOf(specMarker);
  if (specAt < offsets[2] + markers[2].length || specAt >= offsets[3] || source.lastIndexOf(specMarker) !== specAt) fail('entry_verification_layout');
  const specImport = specAt + specMarker.indexOf('require(');
  const barrier = offsets[4] + markers[4].length, tail = offsets[8] + markers[8].length;
  for (const match of source.slice(barrier, offsets[6]).matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) if (!match[1].startsWith('node:') && !['./owner-lifecycle.js', './start-over-driver.js', './work-session.js'].includes(match[1])) fail('owner_store_before_lifecycle');
  for (const [start, end] of [[0, barrier], [tail, source.length]]) {
    const region = source.slice(start, end);
    if (/require\s*\(\s*[^'"\s]/.test(region)) fail('unverified_entry_import');
    for (const match of region.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) if (!match[1].startsWith('node:') && !(match[1] === './composition-spec.js' && start + match.index === specImport)) fail('unverified_entry_import');
  }
  return true;
}
function checkClientEntrySource(source) {
  const verification = source.indexOf('const d = verifyClientDescriptor(descriptor);');
  const rootGuard = source.indexOf("fail('client_entry_root');", verification);
  const exportAt = source.indexOf('module.exports =', rootGuard);
  if (verification < 0 || rootGuard < verification || exportAt < rootGuard) fail('client_entry_verification_layout');
  const specMarker = "const { deriveComposition } = require('./composition-spec.js');", specAt = source.indexOf(specMarker);
  if (specAt <= rootGuard || specAt >= exportAt || source.lastIndexOf(specMarker) !== specAt) fail('client_entry_verification_layout');
  for (const match of source.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (!match[1].startsWith('node:') && (match.index <= rootGuard || match.index >= exportAt)) fail('unverified_client_import');
    if (match[1].endsWith('composition-spec.js') && (match[1] !== './composition-spec.js' || match.index !== specAt + specMarker.indexOf('require('))) fail('unverified_client_import');
  }
  return true;
}
function checkCompositionSpecSource(source) {
  if (/require\s*\(\s*[^'"\s]/.test(source) || /\b(process|global|globalThis|eval|Function|fetch|WebSocket|__dirname|__filename)\b/.test(source)) fail('composition_spec_impure');
  for (const match of source.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) if (!['node:path', 'node:crypto'].includes(match[1])) fail('composition_spec_impure');
  return true;
}
function checkOwnerEntrySource(source) {
  const start = source.indexOf('async function startOwner(');
  const verification = source.indexOf('verifyOwnerInstallation(descriptor);', start);
  const exportAt = source.indexOf('module.exports =', verification);
  if (start < 0 || verification < start || exportAt < verification) fail('owner_entry_verification_layout');
  for (const match of source.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (!match[1].startsWith('node:') && (match.index <= verification || match.index >= exportAt)) fail('unverified_owner_import');
  }
  return true;
}
function checkMaintenanceOperatorSource(source) {
  const barrier = source.indexOf('const d = verifyOwnerInstallation(descriptor, expectedPackageHash);');
  if (barrier < 0 || source.indexOf("fail('maintenance_package_pin_changed')") < 0 || source.indexOf('visit(d.releaseDir') > barrier) fail('maintenance_operator_verification_layout');
  for (const match of source.matchAll(/require\s*\(/g)) {
    const argument = source.slice(match.index).match(/^require\s*\(\s*(['"][^'"]+['"]|path\.join\([^)]*\))\s*\)/);
    if (!argument) fail('unverified_maintenance_import');
    const value = argument[1];
    if (/^['"]node:[^'"]+['"]$/.test(value)) continue;
    if (match.index < barrier || !/^path\.join\(d\.releaseDir, ['"]runtime\/(stdio-entry|owner-maintenance|client-ipc|client-entry)\.js['"]\)$/.test(value)) fail('unverified_maintenance_import');
  }
  return true;
}
function checkFinishOperatorSource(source) {
  const marker = "const { mode, descriptor, id, expectedPackageHash, expectedProofHash } = require('./standalone-installer').assertMaintenanceBootstrap(capability);", barrier = source.indexOf(marker);
  if (barrier < 0 || source.lastIndexOf(marker) !== barrier || !source.includes("require('./maintain-owner').verifyOwnerInstallation(descriptor, expectedPackageHash)")) fail('finish_operator_verification_layout');
  for (const match of source.matchAll(/require\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) if (!match[2].startsWith('node:') && (match.index < barrier || !['./standalone-installer', './maintain-owner', '../protocol/json', '../runtime/stdio-entry', '../runtime/owner-maintenance', '../runtime/stopped-certification'].includes(match[2]))) fail('unverified_finish_import');
  if (/require\s*\(\s*[^'"\s]/.test(source)) fail('unverified_finish_import'); return true;
}
function checkStandaloneSource(source) {
  const barrier = source.indexOf("const checked = verifyStandalone(path.resolve(__dirname, '..'), options['--expected-distribution-hash']);");
  if (barrier < 0 || !source.includes('const maintenanceBootstraps = new WeakMap();') || !source.includes('maintenanceBootstraps.set(capability, Object.freeze(') || !source.includes('const readoptionBootstraps = new WeakMap();') || !source.includes('readoptionBootstraps.set(capability, Object.freeze(')) fail('standalone_verification_layout');
  if (!source.includes('const startOverBootstraps = new WeakMap();') || !source.includes('startOverBootstraps.set(capability, Object.freeze(')) fail('standalone_verification_layout');
  const verified = "const checked = verifyStandalone(path.resolve(__dirname, '..'), options['--expected-distribution-hash']);";
  const segments = source.split(verified);
  if (segments.length !== 6 || segments.slice(1).some(segment => !/^\s*if \(checked\.manifestVersion !== 3\) fail\('standalone_tooling_upgrade_required'\);/.test(segment))) fail('standalone_tooling_version_guard');
  for (const match of source.matchAll(/require\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) if (!match[2].startsWith('node:') && (match.index < barrier || !['./finish-owner-maintenance.js', './install-core4.js', './operate-stopped-update.js', './operate-stopped-readoption.js', './operate-start-over.js'].includes(match[2]))) fail('unverified_standalone_import');
  if (/require\s*\(\s*[^'"\s]/.test(source)) fail('unverified_standalone_import'); return true;
}
function checkStartOverOperatorSource(source) {
  const marker = "const options=require('./standalone-installer').assertStartOverBootstrap(capability);", barrier=source.indexOf(marker);
  if (barrier<0 || source.lastIndexOf(marker)!==barrier || !source.includes("require('./maintain-owner').verifyOwnerInstallation(options.descriptor,options.expectedCurrentPackageHash)")) fail('start_over_operator_verification_layout');
  for (const match of source.matchAll(/require\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) if (!match[2].startsWith('node:') && (match.index<barrier || !['./standalone-installer','./maintain-owner','../protocol/json','../runtime/installation','../runtime/start-over-state','../runtime/start-over-finisher','../runtime/client-ipc.js','../runtime/client-entry.js','../integrations/cep/peer-protocol'].includes(match[2]))) fail('unverified_start_over_import');
  if (/require\s*\(\s*[^'"\s]/.test(source)) fail('unverified_start_over_import'); return true;
}
function checkUpdateOperatorSource(source) {
  const barrier = source.indexOf("const options = require('./standalone-installer').assertUpdateBootstrap(capability);");
  if (barrier < 0) fail('update_operator_verification_layout');
  const allowed = ['./standalone-installer', '../protocol/json', './stopped-update', './legacy-owner-migration', '../runtime/stdio-entry', './install-core4', '../runtime/stopped-certification', '../runtime/install-lease'];
  for (const match of source.matchAll(/require\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) if (!match[2].startsWith('node:') && (match.index < barrier || !allowed.includes(match[2]))) fail('unverified_update_import');
  if (/require\s*\(\s*[^'"\s]/.test(source)) fail('unverified_update_import'); return true;
}
function checkReadoptionOperatorSource(source) {
  const marker = "const options = require('./standalone-installer').assertReadoptionBootstrap(capability);", barrier = source.indexOf(marker);
  if (barrier < 0 || source.lastIndexOf(marker) !== barrier) fail('readoption_operator_verification_layout');
  const allowed = ['./standalone-installer', './maintain-owner', '../protocol/json', '../runtime/stdio-entry', './stopped-host-readoption'];
  for (const match of source.matchAll(/require\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) if (!match[2].startsWith('node:') && (match.index < barrier || !allowed.includes(match[2]))) fail('unverified_readoption_import');
  if (/require\s*\(\s*[^'"\s]/.test(source)) fail('unverified_readoption_import'); return true;
}
function checkBoundaries(root = path.resolve(__dirname, '..')) {
  let checked = 0;
  for (const directory of ['modules', 'plan-engine']) for (const file of files(path.join(root, directory)).filter(f => f.endsWith('.js'))) { reviewCode(fs.readFileSync(file, 'utf8')); checked++; }
  for (const file of files(path.join(root, 'core')).filter(f => f.endsWith('.js'))) {
    const source = fs.readFileSync(file, 'utf8');
    if (/require\s*\(\s*['"][^'"]*(?:modules\/|plan-engine\/|integrations\/|bridge-daemon|core-tool-dispatch)/.test(source)) fail('core_domain_import', file);
    if (/require\s*\(\s*[^'"\s]/.test(source)) fail('computed_core_import', file);
    checked++;
  }
  const integration = path.join(root, 'integrations');
  if (fs.existsSync(integration)) for (const file of files(integration).filter(f => f.endsWith('.js'))) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      if (match[1].includes('/core/') && match[1] !== '../../core/receiver-api') fail('integration_private_core_import', file);
      if (/bridge-daemon|modules\/|plan-engine\//.test(match[1])) fail('integration_domain_import', file);
    }
    checked++;
  }
  for (const file of files(path.join(root, 'runtime')).filter(f => f.endsWith('.js'))) {
    const source = fs.readFileSync(file, 'utf8');
    if (/require\s*\(\s*[^'"\s]/.test(source) || /require\s*\(\s*['"][^'"]*(?:bridge-daemon|modules\/|plan-engine\/|core-tool-dispatch)/.test(source)) fail('runtime_domain_import', file);
    if (path.basename(file) === 'stdio-entry.js') {
      checkEntrySource(source);
      const mutationGuard = source.indexOf('if (mutationAssets.length) {');
      if (mutationGuard < 0 || source.indexOf("require('./manual-policy.js')") < mutationGuard || source.indexOf("require('./windows-reservation-provider.js')") < mutationGuard) fail('runtime_optional_policy_import', file);
    }
    if (path.basename(file) === 'client-entry.js') checkClientEntrySource(source);
    if (path.basename(file) === 'composition-spec.js') checkCompositionSpecSource(source);
    if (path.basename(file) === 'owner-entry.js') checkOwnerEntrySource(source);
    checked++;
  }
  const maintenance = path.join(root, 'tools/maintain-owner.js');
  if (fs.existsSync(maintenance)) { checkMaintenanceOperatorSource(fs.readFileSync(maintenance, 'utf8')); checked++; }
  for (const [file, check] of [['finish-owner-maintenance.js', checkFinishOperatorSource], ['standalone-installer.js', checkStandaloneSource], ['operate-stopped-update.js', checkUpdateOperatorSource], ['operate-stopped-readoption.js', checkReadoptionOperatorSource], ['operate-start-over.js', checkStartOverOperatorSource]]) { check(fs.readFileSync(path.join(root, 'tools', file), 'utf8')); checked++; }
  return { checked, model: 'reviewed-local-code; conservative source guard; not OS sandbox', liveCalls: 0 };
}
if (require.main === module) { try { console.log(JSON.stringify(checkBoundaries())); } catch (e) { console.error(e.code || e.message); process.exitCode = 1; } }
module.exports = { checkBoundaries, checkEntrySource, checkClientEntrySource, checkCompositionSpecSource, checkOwnerEntrySource, checkMaintenanceOperatorSource, checkFinishOperatorSource, checkStandaloneSource, checkUpdateOperatorSource, checkReadoptionOperatorSource, checkStartOverOperatorSource, files };
