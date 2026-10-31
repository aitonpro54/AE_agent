'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root='C:/Users/Ant/Documents/Codex/AE_agent_core',dir=__dirname,phase=process.argv[2],exitCode=process.argv[3]===undefined?null:Number(process.argv[3]);
const files=["core4/config/validation-map.json","core4/test/stopped-host-readoption-core.test.js","core4/test/stopped-host-readoption-recovery.test.js","core4/test/stopped-host-readoption-enable.test.js","core4/test/stopped-host-readoption-probe.test.js","core4/test/stopped-host-readoption.test.js","core4/test/fixtures/stopped-host-readoption.js","core4/tools/stopped-host-readoption.js","core4/tools/stopped-host-readoption-store.js","core4/tools/stopped-host-readoption-transaction.js","core4/runtime/stopped-certification.js"],delta=["core4/test/stopped-host-readoption-enable.test.js","core4/tools/stopped-host-readoption-store.js","core4/tools/stopped-host-readoption-transaction.js"],sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const select=require(path.join(root,'core4/tools/validate-diff')).selectChecks,selection=select(files),runSelection=select(delta);
const checks=s=>s.checks.map(c=>({check:c.check,evidenceKey:c.evidenceKey,command:c.command,dependencies:c.dependencies}));
const hashes=Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(path.join(root,f)))]));
const dependencies=Object.fromEntries([...new Set(selection.checks.flatMap(c=>c.dependencies).filter(f=>!f.includes('#')))].sort().map(f=>[f,sha(fs.readFileSync(path.join(root,'core4',f)))]));
const payload={collectedAt:new Date().toISOString(),phase,exitCode,sourceFrozen:true,sourceHashes:hashes,dependencyHashes:dependencies,checks:checks(selection),runChecks:checks(runSelection),deltaPaths:delta,packageHash:require(path.join(root,'core4/tools/package-installable')).buildPackage(path.join(root,'core4'),'manual',{runtimeModel:'owner'}).packageHash};
fs.writeFileSync(path.join(dir,'capture.'+phase+'.json'),JSON.stringify(payload,null,2));
fs.writeFileSync(path.join(dir,'selection.'+phase+'.json'),JSON.stringify(selection,null,2));
fs.writeFileSync(path.join(dir,'run-selection.'+phase+'.json'),JSON.stringify(runSelection,null,2));
const baseline=JSON.parse(fs.readFileSync(path.join(dir,'../final01/capture.after.json')));
const reuse=payload.checks.map(c=>{const previous=baseline.checks.find(p=>p.check===c.check),changedDependencies=c.dependencies.filter(f=>!f.includes('#')&&payload.dependencyHashes[f]!==baseline.dependencyHashes[f]);return{check:c.check,evidenceKey:c.evidenceKey,baselineEvidenceKey:previous?.evidenceKey,eligibleForReuse:!!previous&&JSON.stringify(c)===JSON.stringify(previous)&&changedDependencies.length===0,changedDependencies};});
fs.writeFileSync(path.join(dir,'reuse.'+phase+'.json'),JSON.stringify(reuse,null,2));
if(phase==='after'){const before=JSON.parse(fs.readFileSync(path.join(dir,'capture.before.json')));for(const field of ['sourceHashes','dependencyHashes','checks','runChecks','deltaPaths','packageHash'])assert.deepEqual(payload[field],before[field]);}
console.log(JSON.stringify({phase,exitCode,globalChecks:payload.checks.length,runChecks:payload.runChecks.map(c=>c.check),reuseCandidates:reuse.filter(c=>c.eligibleForReuse).map(c=>c.check),packageHash:payload.packageHash}));

