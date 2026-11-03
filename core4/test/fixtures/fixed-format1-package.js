'use strict';
// Portable semantic legacy fixture, NOT the byte-identical historical f548 build.
// Current reviewed code bytes retain the fixed format1 two-asset CEP contract.
const { buildPackage, verifyPackage } = require('../../tools/package-installable');
const { hash, canonical } = require('../../protocol/json');
const fs = require('node:fs'), path = require('node:path');
function fixedFormat1Package() {
  const pkg = structuredClone(buildPackage());
  delete pkg.files['runtime/composition.json']; delete pkg.release.hashes['runtime/composition.json']; pkg.release.format = 1;
  const add = (file, value) => { const bytes = typeof value === 'string' ? value : canonical(value); pkg.files[file] = Buffer.from(bytes).toString('base64'); pkg.release.hashes[file] = hash(bytes); };
  // Historical read-disposition proof pins this dispatcher. Future production
  // session support must not silently rewrite the synthetic OLD package bytes.
  const dispatcher = fs.readFileSync(path.join(__dirname, 'legacy-poll-dispatcher-v1.txt'), 'utf8');
  if (hash(dispatcher) !== '741824cffa897c8c3f04a9f8f54b81fc3b0fd45c68c5dd4a6afd59e9a3075006') throw new Error('historical_dispatcher_fixture_bytes');
  add('cep/js/poll-dispatcher.js', dispatcher);
  const panel = fs.readFileSync(path.join(__dirname, 'legacy-panel-v1.txt'), 'utf8');
  if (hash(panel) !== '8ee7446ec1bf9a667c5e7d578dba0a0545453cb6d1ac1404eb6514f937e40e1d') throw new Error('historical_panel_fixture_bytes');
  add('cep/js/panel.js', panel);
  add('runtime/profiles.json', { profiles: [{ id: 'project-inspection', path: 'modules/project-inspection', executionPolicy: 'read-only-current-observation-v1' }] });
  add('runtime/source-package.json', { version: 1, files: Object.keys(pkg.files).sort(), artifactClosures: [] });
  const read = file => Buffer.from(pkg.files[file], 'base64').toString();
  const inspection = JSON.parse(read('modules/project-inspection/artifact.json')), manual = JSON.parse(read('config/admissions/titles-current-target.json'));
  add('cep/jsx/registry.jsx', '/* Fixed package-owned registry. Runtime frames contain data only. */\nvar AECore4Host=(function(){var JSON=' + read('runtime/host/json-codec.jsx') + ';var executor=' + read('modules/project-inspection/executor.jsx') + ';var manual=' + read('modules/titles-current-target/executor.jsx') + ';var assets={"project-inspection-v1":{hash:"' + inspection.executorHash + '",calls:{inspect:executor.inspect}},"titles-current-target-v1":{hash:"' + manual.executorHash + '",calls:{inspect:manual.inspect,mutate:manual.mutate,verify:manual.verify}}};return {dispatch:function(serialized){var frame=JSON.parse(serialized),a=frame&&assets[frame.assetKey],call=a&&a.calls[frame.phase];if(!call||frame.pins.executorHash!==a.hash)throw new Error("fixed_asset_binding");if(frame.phase==="mutate")return JSON.stringify(call(frame.typedPayload));try{return JSON.stringify(call(frame.typedPayload));}catch(e){return JSON.stringify({readFailureVersion:1,outcome:"rejected",code:"inspection_failed"});}}};}());\n');
  pkg.packageHash = hash(pkg.release); return verifyPackage(pkg);
}
module.exports = { fixedFormat1Package };
