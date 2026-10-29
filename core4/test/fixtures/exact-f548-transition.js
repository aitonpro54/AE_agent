'use strict';
// Explicit historical CODE artifact only. All credentials/state are fresh temp data.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { hash } = require('../../protocol/json');
const file = path.resolve(__dirname, '../../..', 'dist/core4/4.0.0-panel-reconnect-f54863dbb69b/core4-4.0.0.json');
async function exactTransition() {
  const bytes = fs.readFileSync(file), pkg = JSON.parse(bytes);
  assert.equal(bytes.length, 343626); assert.equal(hash(bytes), 'dc02187e1d71513638d94e544f40901ab343ec22d75640704a08a777c1acb9b8');
  assert.equal(pkg.packageHash, 'f54863dbb69b5e3a4b0e79d8ee3629cf71c7eced0a3759745d8899fa65a1ce90'); assert.equal(hash(pkg.release), pkg.packageHash);
  require('../../tools/package-installable').verifyPackage(pkg);
  const result = await require('./installed-composition-transition').transition(pkg);
  return { evidence: 'exact-historical-code/temp-synthetic-state', artifact: file, artifactBytes: bytes.length, artifactSha256: hash(bytes), ...result };
}
if (require.main === module) exactTransition().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.code || error.stack); process.exitCode = 1; });
module.exports = { exactTransition };
