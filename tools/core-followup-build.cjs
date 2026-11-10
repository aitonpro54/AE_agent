'use strict';

// Сборка точного кандидата из принятого пакета и ранее принятого comp-render.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { canonical, hash } = require('../core4/protocol/json');
const { buildPackage, verifyPackage } = require('../core4/tools/package-installable');
const { composeCapability, main: capability } = require('../core4/tools/package-capability');
const { writeStandalone, bundleStandalone } = require('../core4/tools/package-standalone-installer');
const { verifyStandalone } = require('../core4/tools/standalone-installer');
const { deriveComposition } = require('../core4/runtime/stdio-entry');

const read = file => JSON.parse(fs.readFileSync(file));
const readPkg = pkg => file => Buffer.from(pkg.files[file], 'base64');
const options = { runtimeModel:'owner' };
const basePin = 'bffa39df006f637b532064d6112ac2e4e6b3ac5ad0f29ff907b0cdf59b43e0d3';
const renderPin = 'e3439447470a95828c85b609d2d5eb21aae7fb91630d6da0f076063a8b0e47d9';
const renderApproval = 'ed6c11d106b4ef89ccbc11a07dd9adf0dd75edc76f3f172aba1ca12944278737';
const slotId = 'comp-frame-export', slotPath = 'modules/' + slotId;
const approvalPath = 'config/admissions/' + slotId + '.json';
const frameDelta = [approvalPath, 'config/catalog.json', slotPath + '/artifact.json'].sort();
function delta(before, after) {
  assert.deepEqual(Object.keys(before.files).sort(), Object.keys(after.files).sort());
  return Object.keys(after.files).filter(file => before.files[file] !== after.files[file]).sort();
}

function build(previous, acceptedCapability, acceptedAdmission, output) {
  const prior = verifyPackage(read(previous));
  assert.equal(prior.packageHash, basePin);
  const accepted = read(acceptedCapability), approved = fs.readFileSync(acceptedAdmission);
  const source = buildPackage(undefined, 'operator-render-jobs', options);
  const base = composeCapability(source, accepted, approved, {
    basePin:source.packageHash, capabilityPin:renderPin, admissionPin:renderApproval
  });
  const baseDelta = delta(prior, base);
  assert.deepEqual(baseDelta, ['runtime/aerender-jobs.js', 'runtime/render-job-owner.js']);
  const write = (name, data) => {
    const file = path.join(output, name);
    fs.writeFileSync(file, canonical(data) + '\n', { flag:'wx' });
    return file;
  };
  fs.mkdirSync(output);
  const baseFile = write('base-package.json', base);
  const baseStandalone = writeStandalone(path.join(output, 'base'), bundleStandalone(base));
  const minimal = buildPackage(undefined, 'operator-r1-minimal', options);
  const minimalComposition = deriveComposition(minimal.release, readPkg(minimal));
  assert.equal(minimalComposition.renderJobs, true);
  assert.ok(!Object.keys(minimal.files).some(name => /comp-frame-export|comp-render|png-proof|visual-review|layer-overlay/.test(name)));
  write('minimal-package.json', minimal);
  const minimalStandalone = writeStandalone(path.join(output, 'minimal'), bundleStandalone(minimal));

  const sourceDir = path.join(output, slotId);
  fs.mkdirSync(sourceDir);
  const readBase = readPkg(base);
  const artifact = JSON.parse(readBase(slotPath + '/artifact.json'));
  artifact.version = '4.2.3';
  fs.writeFileSync(path.join(sourceDir, 'artifact.json'), canonical(artifact), { flag:'wx' });
  for (const file of Object.keys(artifact.hashes)) fs.writeFileSync(path.join(sourceDir, file), readBase(slotPath + '/' + file), { flag:'wx' });
  const approval = { ...JSON.parse(readBase(approvalPath)), artifactHash:hash(artifact),
    trustApprovalId:'source-review-comp-frame-export-independent-msi-20261110' };
  const approvalFile = write('frame-admission.json', approval);
  const admissionSha = hash(fs.readFileSync(approvalFile));
  const capabilityFile = path.join(output, 'frame-capability.json');
  const packed = capability(['pack', '--source', sourceDir, '--output', capabilityFile]);
  const standalone = capability(['compose', '--base', baseFile, '--expected-base-hash', base.packageHash,
    '--capability', capabilityFile, '--expected-capability-hash', packed.capabilityHash,
    '--admission', approvalFile, '--expected-admission-sha256', admissionSha, '--output', path.join(output, 'combined')]);
  const final = verifyStandalone(standalone.output, standalone.distributionHash);
  assert.equal(final.capabilityBaseHash, base.packageHash);
  assert.equal(final.pkg.packageHash, standalone.packageHash);
  const actualDelta = delta(base, final.pkg);
  assert.deepEqual(actualDelta, frameDelta);
  const select = pkg => deriveComposition(pkg.release, readPkg(pkg)).assets.find(a => a.moduleId === slotId);
  const oldSlot = select(base), newSlot = select(final.pkg);
  assert.equal(newSlot.resultProfile, 'comp-frame-export-v1');
  assert.equal(newSlot.contract.operationId, 'save-comp-frame-png');
  assert.deepEqual(newSlot.contract, oldSlot.contract);
  assert.deepEqual(newSlot.manifest.hashes, oldSlot.manifest.hashes);
  assert.equal(newSlot.executorHash, oldSlot.executorHash);
  write('combined-package.json', final.pkg);
  const summary = { prior:prior.packageHash, baseDelta, base:baseStandalone, minimal:minimalStandalone,
    final:standalone, slotDelta:actualDelta, capabilitySha256:packed.capabilityHash, admissionSha256:admissionSha,
    compRenderCapabilitySha256:renderPin, compRenderAdmissionSha256:renderApproval, contract: {
      operationId:newSlot.contract.operationId, profile:newSlot.resultProfile, policy:newSlot.policy,
      contractSha256:newSlot.manifest.hashes['contract.json'], executorSha256:newSlot.executorHash
    } };
  write('packages.json', summary);
  return summary;
}

if (require.main === module) {
  if (process.argv.length !== 6) throw Error('Укажите прежний installable, принятую capability comp-render, её admission и новый каталог вывода.');
  console.log(JSON.stringify(build(...process.argv.slice(2).map(value => path.resolve(value))), null, 2));
}
