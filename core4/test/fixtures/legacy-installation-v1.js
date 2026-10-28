'use strict';
// Test-only v1 DATA constructor. Never starts an opaque legacy runtime/Node.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { canonical } = require('../../protocol/json');
function legacyV1Data(plan) {
  if (!path.resolve(plan.descriptor.installRoot).startsWith(path.resolve(os.tmpdir()) + path.sep) || plan.previousDescriptor !== null) throw new Error('legacy_fixture_temp_fresh_required');
  const keys = ['installRoot', 'installationId', 'machineId', 'packageHash', 'releaseDir', 'stateDir', 'nodePath', 'nodeHash', 'nodeVersion', 'panelToken', 'controlToken'];
  const descriptor = { version: 1, ...Object.fromEntries(keys.map(key => [key, plan.descriptor[key]])) };
  function write(file, bytes) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes, { flag: 'wx' }); }
  for (const [file, encoded] of Object.entries(plan.pkg.files)) write(path.join(descriptor.releaseDir, file), Buffer.from(encoded, 'base64'));
  write(path.join(descriptor.releaseDir, 'release.json'), canonical(plan.pkg.release));
  write(path.join(descriptor.installRoot, 'origin.json'), canonical(plan.origin)); write(path.join(descriptor.stateDir, 'origin.json'), canonical(plan.origin));
  for (const [file, encoded] of Object.entries(plan.cep)) write(path.join(plan.cepDir, file), Buffer.from(encoded, 'base64'));
  write(plan.configPath, plan.nextConfig); write(plan.descriptorPath, canonical(descriptor)); fs.mkdirSync(path.join(descriptor.installRoot, 'transactions'), { recursive: true });
  return { descriptorPath: plan.descriptorPath, stateDir: descriptor.stateDir, installationId: descriptor.installationId };
}
module.exports = { legacyV1Data };
