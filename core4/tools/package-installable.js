'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { hash, canonical, fail } = require('../protocol/json');
function buildPackage(root = path.resolve(__dirname, '..')) {
  const spec = JSON.parse(fs.readFileSync(path.join(root, 'runtime/source-package.json'), 'utf8'));
  const paths = new Set(spec.files);
  for (const relative of spec.artifactClosures) {
    paths.add(relative);
    const artifact = JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
    for (const file of Object.keys(artifact.hashes)) {
      const location = relative.startsWith('modules/') || relative.startsWith('plan-engine/') ? path.posix.join(path.posix.dirname(relative), file) : file;
      if (hash(fs.readFileSync(path.join(root, location))) !== artifact.hashes[file]) fail('package_artifact_mismatch');
      paths.add(location);
    }
  }
  const hashes = {}, files = {};
  for (const relative of [...paths].sort()) {
    if (/^(test|experiments|node_modules|\.git|logs|state|tools)\//.test(relative) || relative.includes('..') || relative.includes('\\') || path.isAbsolute(relative)) fail('package_closure_forbidden');
    const full = path.resolve(root, relative); if (fs.realpathSync(full) !== full) fail('package_symlink');
    const bytes = fs.readFileSync(full); hashes[relative] = hash(bytes); files[relative] = bytes.toString('base64');
  }
  const release = { version: '4.0.0', format: 1, hashes };
  const inspection = JSON.parse(Buffer.from(files['modules/project-inspection/artifact.json'], 'base64'));
  const source = Buffer.from(files['modules/project-inspection/executor.jsx'], 'base64').toString('utf8');
  const manual = JSON.parse(Buffer.from(files['config/admissions/titles-current-target.json'], 'base64'));
  const manualSource = Buffer.from(files['modules/titles-current-target/executor.jsx'], 'base64').toString('utf8');
  const codecSource = Buffer.from(files['runtime/host/json-codec.jsx'], 'base64').toString('utf8');
  const registry = '/* Fixed package-owned registry. Runtime frames contain data only. */\nvar AECore4Host=(function(){var JSON=' + codecSource + ';var executor=' + source + ';var manual=' + manualSource + ';var assets={"project-inspection-v1":{hash:"' + inspection.executorHash + '",calls:{inspect:executor.inspect}},"titles-current-target-v1":{hash:"' + manual.executorHash + '",calls:{inspect:manual.inspect,mutate:manual.mutate,verify:manual.verify}}};return {dispatch:function(serialized){var frame=JSON.parse(serialized),a=frame&&assets[frame.assetKey],call=a&&a.calls[frame.phase];if(!call||frame.pins.executorHash!==a.hash)throw new Error("fixed_asset_binding");if(frame.phase==="mutate")return JSON.stringify(call(frame.typedPayload));try{return JSON.stringify(call(frame.typedPayload));}catch(e){return JSON.stringify({readFailureVersion:1,outcome:"rejected",code:"inspection_failed"});}}};}());\n';
  files['cep/jsx/registry.jsx'] = Buffer.from(registry).toString('base64'); hashes['cep/jsx/registry.jsx'] = hash(registry);
  return { packageHash: hash(release), release, files };
}
function verifyPackage(pkg) {
  if (pkg.packageHash !== hash(pkg.release) || pkg.release.version !== '4.0.0' || canonical(Object.keys(pkg.files).sort()) !== canonical(Object.keys(pkg.release.hashes).sort())) fail('package_integrity');
  for (const [relative, data] of Object.entries(pkg.files)) {
    if (!/^[a-zA-Z0-9_./-]+$/.test(relative) || relative.split('/').includes('..') || path.isAbsolute(relative) || /^(test|experiments|node_modules|\.git|logs|state|tools)\//.test(relative) || hash(Buffer.from(data, 'base64')) !== pkg.release.hashes[relative]) fail('package_integrity');
  }
  return pkg;
}
if (require.main === module) {
  try { const args = process.argv.slice(2); if (args.length !== 2 || args[0] !== '--output' || !path.isAbsolute(args[1])) fail('absolute_output_required'); const pkg = buildPackage(); fs.writeFileSync(args[1], canonical(pkg), { flag: 'wx' }); console.log(JSON.stringify({ packageHash: pkg.packageHash, files: Object.keys(pkg.files).length, output: args[1] })); } catch (e) { console.error(e.code || e.message); process.exitCode = 1; }
}
module.exports = { buildPackage, verifyPackage };
