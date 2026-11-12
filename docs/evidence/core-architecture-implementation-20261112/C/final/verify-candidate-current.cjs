'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const core = fs.realpathSync('C:/Users/Ant/Documents/Codex/AE_agent_core/core4');
const { buildPackage } = require(path.join(core, 'tools/package-installable.js'));
const { bundleStandalone } = require(path.join(core, 'tools/package-standalone-installer.js'));
const { verifyStandalone } = require(path.join(core, 'tools/standalone-installer.js'));
const proof = JSON.parse(fs.readFileSync(path.join(__dirname, 'candidate-validation.json')));
assert.equal(proof.status, 'PASS');
const candidates = proof.candidates.map(before => {
  const pkg = buildPackage(core, before.selector, { runtimeModel: 'owner' });
  const bundle = bundleStandalone(pkg, { root: core });
  assert.equal(pkg.packageHash, before.packageHash); assert.equal(bundle.distributionHash, before.distributionHash);
  assert.equal(verifyStandalone(before.distribution, before.distributionHash).packageHash, pkg.packageHash);
  return { selector: before.selector, packageHash: pkg.packageHash, distributionHash: bundle.distributionHash, status: 'IDENTICAL' };
});
fs.writeFileSync(path.join(__dirname, 'candidate-current-binding.json'), JSON.stringify({
  verifiedAt: new Date().toISOString(), result: 'PASS', releaseCertified: false,
  originalProofSHA256: createHash('sha256').update(fs.readFileSync(path.join(__dirname, 'candidate-validation.json'))).digest('hex'),
  candidates, limit: 'Current source builds exactly match the previously executed four dry-run distributions; dry-run itself was not repeated.'
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: 'PASS', candidates: candidates.length }));
