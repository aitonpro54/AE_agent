# core4/tools/package-installable.js

Commit: e6cde7c1f061763b6d0008162580039d2717aeb7
Full source SHA-256: 7587d8ce18c069994f88ff689b2ae1a45cd44629dca836dea0eca079ceea3a9e
Classification: INTERNAL; source code/documentation only.

## Source lines 1-35

```text
1: 'use strict';
2: const fs = require('node:fs');
3: const path = require('node:path');
4: const { hash, canonical, fail } = require('../protocol/json');
5: function buildPackage(root = path.resolve(__dirname, '..')) {
6:   const spec = JSON.parse(fs.readFileSync(path.join(root, 'runtime/source-package.json'), 'utf8'));
7:   const paths = new Set(spec.files);
8:   for (const relative of spec.artifactClosures) {
9:     paths.add(relative);
10:     const artifact = JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
11:     for (const file of Object.keys(artifact.hashes)) {
12:       const location = relative.startsWith('modules/') || relative.startsWith('plan-engine/') ? path.posix.join(path.posix.dirname(relative), file) : file;
13:       if (hash(fs.readFileSync(path.join(root, location))) !== artifact.hashes[file]) fail('package_artifact_mismatch');
14:       paths.add(location);
15:     }
16:   }
17:   const hashes = {}, files = {};
18:   for (const relative of [...paths].sort()) {
19:     if (/^(test|experiments|node_modules|\.git|logs|state|tools)\//.test(relative) || relative.includes('..') || relative.includes('\\') || path.isAbsolute(relative)) fail('package_closure_forbidden');
20:     const full = path.resolve(root, relative); if (fs.realpathSync(full) !== full) fail('package_symlink');
21:     const bytes = fs.readFileSync(full); hashes[relative] = hash(bytes); files[relative] = bytes.toString('base64');
22:   }
23:   const release = { version: '4.0.0', format: 1, hashes };
24:   const inspection = JSON.parse(Buffer.from(files['modules/project-inspection/artifact.json'], 'base64'));
25:   const source = Buffer.from(files['modules/project-inspection/executor.jsx'], 'base64').toString('utf8');
26:   const manual = JSON.parse(Buffer.from(files['config/admissions/titles-current-target.json'], 'base64'));
27:   const manualSource = Buffer.from(files['modules/titles-current-target/executor.jsx'], 'base64').toString('utf8');
28:   const codecSource = Buffer.from(files['runtime/host/json-codec.jsx'], 'base64').toString('utf8');
29:   const registry = '/* Fixed package-owned registry. Runtime frames contain data only. */\nvar AECore4Host=(function(){var JSON=' + codecSource + ';var executor=' + source + ';var manual=' + manualSource + ';var assets={"project-inspection-v1":{hash:"' + inspection.executorHash + '",calls:{inspect:executor.inspect}},"titles-current-target-v1":{hash:"' + manual.executorHash + '",calls:{inspect:manual.inspect,mutate:manual.mutate,verify:manual.verify}}};return {dispatch:function(serialized){var frame=JSON.parse(serialized),a=frame&&assets[frame.assetKey],call=a&&a.calls[frame.phase];if(!call||frame.pins.executorHash!==a.hash)throw new Error("fixed_asset_binding");if(frame.phase==="mutate")return JSON.stringify(call(frame.typedPayload));try{return JSON.stringify(call(frame.typedPayload));}catch(e){return JSON.stringify({readFailureVersion:1,outcome:"rejected",code:"inspection_failed"});}}};}());\n';
30:   files['cep/jsx/registry.jsx'] = Buffer.from(registry).toString('base64'); hashes['cep/jsx/registry.jsx'] = hash(registry);
31:   return { packageHash: hash(release), release, files };
32: }
33: function verifyPackage(pkg) {
34:   if (pkg.packageHash !== hash(pkg.release) || pkg.release.version !== '4.0.0' || canonical(Object.keys(pkg.files).sort()) !== canonical(Object.keys(pkg.release.hashes).sort())) fail('package_integrity');
35:   for (const [relative, data] of Object.entries(pkg.files)) {
```

