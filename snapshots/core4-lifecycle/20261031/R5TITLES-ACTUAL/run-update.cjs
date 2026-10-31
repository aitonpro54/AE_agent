'use strict';
// Exact reviewed CLI entry; persistent start slot prevents accidental replay.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const o=JSON.parse(fs.readFileSync(path.join(__dirname,'operation.json'))),[mode,slot,proof]=process.argv.slice(2);
if(!['stop','stop-inspect','owner-update','update-inspect','update-finish','update-enable','enable-finish','owner-pre-ready-inspect','owner-pre-ready-finish'].includes(mode)||!/^[a-z0-9-]+$/.test(slot||'')||proof&&!/^[a-f0-9]{64}$/.test(proof)||process.argv.length>5)throw Error('arguments');
const output=path.join(__dirname,slot+'.json'),startPath=path.join(__dirname,slot+'-started.json');if(fs.existsSync(output)||fs.existsSync(startPath))throw Error('original_started_no_replay');
const maintenance=['stop','stop-inspect'].includes(mode),primary=mode==='owner-update';
let operationId=o.stopId;if(!maintenance&&!primary){const r=JSON.parse(fs.readFileSync(path.join(__dirname,'owner-update.json'))).result;if(!/^[a-f0-9-]{36}$/.test(r?.transactionId||''))throw Error('original_update_id_required');operationId=r.transactionId;}
const entry=path.join(o.distribution,maintenance?'tools/maintain-owner.js':'tools/standalone-installer.js');
const args=maintenance?[mode==='stop'?'stop':'inspect','--installation',o.descriptorPath,'--operation',operationId,'--expected-package-hash',o.oldPackageHash]:[mode,'--expected-distribution-hash',o.distributionHash,'--expected-package-hash',o.newPackageHash,'--expected-current-package-hash',o.oldPackageHash,'--expected-previous-descriptor-hash',o.expectedPreviousDescriptorHash,'--installation',o.descriptorPath,'--operation',operationId,...(primary?['--config',o.configPath]:[])];
if(proof)args.push('--expected-proof-hash',proof);
const startedAt=new Date().toISOString();fs.writeFileSync(startPath,JSON.stringify({startedAt,mode,operationId,entry,args},null,2)+'\n',{flag:'wx'});
// The operator owns bounded process probes. Parent does not kill an accepted phase.
const r=cp.spawnSync(o.nodePath,[entry,...args],{windowsHide:true,encoding:'utf8',maxBuffer:4*1024*1024});let result=null;try{result=JSON.parse(r.stdout);}catch{}
const report={startedAt,collectedAt:new Date().toISOString(),mode,operationId,entry,args,exitCode:r.status,signal:r.signal,error:r.error?.code||null,stdout:r.stdout,stderr:r.stderr,result};fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));process.exitCode=r.status===0?0:1;
