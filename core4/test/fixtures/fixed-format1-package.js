'use strict';
// Portable semantic legacy fixture, NOT the byte-identical historical f548 build.
// Current reviewed code bytes retain the fixed format1 two-asset CEP contract.
const { buildPackage, verifyPackage } = require('../../tools/package-installable');
const { hash, canonical } = require('../../protocol/json');
const fs = require('node:fs'), path = require('node:path');
function fixedFormat1Package() {
  const pkg = structuredClone(buildPackage());
  pkg.release.version = '4.0.0';
  for (const file of ['runtime/composition.json', 'runtime/composition-policy.json']) {
    delete pkg.files[file]; delete pkg.release.hashes[file];
  }
  pkg.release.format = 1;
  const add = (file, value) => { const bytes = typeof value === 'string' ? value : canonical(value); pkg.files[file] = Buffer.from(bytes).toString('base64'); pkg.release.hashes[file] = hash(bytes); };
  // Historical read-disposition proof pins this dispatcher. Future production
  // session support must not silently rewrite the synthetic OLD package bytes.
  const dispatcher = fs.readFileSync(path.join(__dirname, 'legacy-poll-dispatcher-v1.txt'), 'utf8');
  if (hash(dispatcher) !== '741824cffa897c8c3f04a9f8f54b81fc3b0fd45c68c5dd4a6afd59e9a3075006') throw new Error('historical_dispatcher_fixture_bytes');
  add('cep/js/poll-dispatcher.js', dispatcher);
  const panel = fs.readFileSync(path.join(__dirname, 'legacy-panel-v1.txt'), 'utf8');
  if (hash(panel) !== '8ee7446ec1bf9a667c5e7d578dba0a0545453cb6d1ac1404eb6514f937e40e1d') throw new Error('historical_panel_fixture_bytes');
  add('cep/js/panel.js', panel);
  // The historical tools intentionally accept only their original read asset.
  const readExecutor = fs.readFileSync(path.join(__dirname, 'legacy-project-inspection-v1.txt'), 'utf8');
  const readContract = {
    moduleId: 'project-inspection', operationId: 'inspect-project', version: '4.0.0',
    executionPolicy: 'read-only-current-observation-v1', snapshotProfile: 'project-observation-v1',
    targetSchema: { type: 'object', properties: { compId: { type: 'integer', minimum: 1 } }, additionalProperties: false },
    effectPolicy: { effect: 'none', continuity: false, boundedItemsScanned: 500, boundedComps: 50, boundedLayers: 100, displayNameMaxCodeUnits: 256, resultMaxCodeUnits: 40000 },
    buildSupported: false
  };
  const readAdmission = { moduleId: readContract.moduleId, executionPolicy: readContract.executionPolicy, executorHash: hash(readExecutor), contractHash: hash(readContract) };
  if (readAdmission.executorHash !== '787a1cc3b2a084a7a2bed11008def8be75aa61e889f48a1469c3db0b7056e019' ||
      readAdmission.contractHash !== 'cd0e85894e11e2e070cb73113321b24dfca95b00aa934364313f04319ea6dc5a') throw new Error('historical_inspection_fixture_bytes');
  add('modules/project-inspection/executor.jsx', readExecutor);
  add('modules/project-inspection/contract.json', readContract);
  add('modules/project-inspection/artifact.json', readAdmission);
  add('runtime/profiles.json', { profiles: [{ id: 'project-inspection', path: 'modules/project-inspection', executionPolicy: 'read-only-current-observation-v1' }] });
  add('runtime/source-package.json', { version: 1, files: Object.keys(pkg.files).sort(), artifactClosures: [] });
  const read = file => Buffer.from(pkg.files[file], 'base64').toString();
  const inspection = JSON.parse(read('modules/project-inspection/artifact.json')), manual = JSON.parse(read('config/admissions/titles-current-target.json'));
  add('cep/jsx/registry.jsx', '/* Fixed package-owned registry. Runtime frames contain data only. */\nvar AECore4Host=(function(){var JSON=' + read('runtime/host/json-codec.jsx') + ';var executor=' + read('modules/project-inspection/executor.jsx') + ';var manual=' + read('modules/titles-current-target/executor.jsx') + ';var assets={"project-inspection-v1":{hash:"' + inspection.executorHash + '",calls:{inspect:executor.inspect}},"titles-current-target-v1":{hash:"' + manual.executorHash + '",calls:{inspect:manual.inspect,mutate:manual.mutate,verify:manual.verify}}};return {dispatch:function(serialized){var frame=JSON.parse(serialized),a=frame&&assets[frame.assetKey],call=a&&a.calls[frame.phase];if(!call||frame.pins.executorHash!==a.hash)throw new Error("fixed_asset_binding");if(frame.phase==="mutate")return JSON.stringify(call(frame.typedPayload));try{return JSON.stringify(call(frame.typedPayload));}catch(e){return JSON.stringify({readFailureVersion:1,outcome:"rejected",code:"inspection_failed"});}}};}());\n');
  pkg.packageHash = hash(pkg.release); return verifyPackage(pkg);
}
module.exports = { fixedFormat1Package };
