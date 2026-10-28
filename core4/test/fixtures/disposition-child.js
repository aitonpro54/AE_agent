'use strict';
// Private test entry only: real Node IPC, explicit synthetic OS probes, temp IO.
const fs=require('node:fs'),path=require('node:path');
const fixture=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const api=require(path.join(fixture.operatorRoot,'tools/dispose-native-read.js'));
const A=require(path.join(fixture.operatorRoot,'tools/capture-native-read.js'));
const token=api.verifyOperatorClosure(fixture.operatorRoot,fixture.operatorHash);
const probes={probePid:()=> 'dead',probePort:()=> 'absent',probeProcesses:async(_d,_p,paths)=>({version:1,matchedPids:[],pathsChecked:paths.length,observedAt:new Date().toISOString()})};
const io=Object.create(fs); const handles=new Map();
const owner=path.join(JSON.parse(fs.readFileSync(fixture.args.descriptor)).stateDir,'receiver/owner');
function replaceOwner(label){fs.renameSync(owner,path.join(path.dirname(fixture.operatorRoot),'fixture-displaced-'+label));fs.writeFileSync(owner,'');}
io.openSync=(file,...rest)=>{const fd=fs.openSync(file,...rest);handles.set(fd,file);return fd;};
io.writeSync=(fd,...rest)=>{if(fixture.fault==='append-short'&&handles.get(fd)?.endsWith('completions.ndjson'))return fs.writeSync(fd,rest[0].subarray(0,7));return fs.writeSync(fd,...rest);};
io.fsyncSync=fd=>{if(fixture.fault==='append-fsync'&&handles.get(fd)?.endsWith('completions.ndjson'))throw Object.assign(new Error('fixture_fsync'),{code:'fixture_fsync'});const result=fs.fsyncSync(fd);if(fixture.fault==='owner-after-append'&&handles.get(fd)?.endsWith('completions.ndjson'))replaceOwner('after-append');return result;};
io.renameSync=(from,to)=>{if(fixture.fault==='archive')throw Object.assign(new Error('fixture_archive'),{code:'fixture_archive'});if(from===owner&&fixture.fault==='owner-wrong-archive')replaceOwner('wrong-archive');const result=fs.renameSync(from,to);if(from===owner&&fixture.fault==='owner-after-rename')fs.writeFileSync(owner,'foreign-marker-preserve');return result;};
// Installer uses its own default builtin IO: fault the real fs function only in
// this isolated fixture child, after private approval, at a concrete publication.
const originalRename=fs.renameSync;
if(fixture.fault==='install-switch')fs.renameSync=(from,to)=>{if(from.endsWith('installation.json.next'))throw Object.assign(new Error('fixture_switch'),{code:'fixture_switch'});return originalRename(from,to);};
const op=api.createDispositionOperator({operatorRoot:fixture.operatorRoot,operatorClosure:token,io,captureFactory:()=>A.createCapture(probes),probePid:()=> 'dead',ipcTimeoutMs:2000});
(async()=>{
  try{const inspected=await op.inspect(fixture.args);process.send({event:'fixture_inspected',proofHash:inspected.proofHash});if(fixture.fault==='owner-between-inspect-apply')replaceOwner('between-inspect-apply');const result=await op.apply({...fixture.args,expectedProofHash:inspected.proofHash});process.send({event:'fixture_result',value:result});}
  catch(e){process.send?.({event:'fixture_error',error:e.code||e.message,transaction:e.transaction||null,leaseRetained:!!e.leaseRetained});process.exitCode=1;}
  finally{if(process.connected)process.disconnect();}
})();
