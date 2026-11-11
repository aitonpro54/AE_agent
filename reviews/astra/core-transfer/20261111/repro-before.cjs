'use strict';
// TEMP-only regression reproduction. Does not read production or write source.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const source=process.cwd();
const {buildPackage}=require(path.join(source,'core4/tools/package-installable'));
const {planInstall,applyInstall,rollback}=require(path.join(source,'core4/tools/install-core4'));
const {Ledger}=require(path.join(source,'core4/core/ledger'));
const {hash}=require(path.join(source,'core4/protocol/json'));
const pkg=buildPackage(path.join(source,'core4'),'readonly',{runtimeModel:'owner'});
const base=fs.mkdtempSync(path.join(os.tmpdir(),'core4-astra-repro-'));
function fixture(n,apply=true){const dir=path.join(base,n);fs.mkdirSync(dir);const args={pkg,nodePath:fs.realpathSync(process.execPath),installRoot:path.join(dir,'AEAgentCore4'),extensionsDir:path.join(dir,'extensions'),configPath:path.join(dir,'config.toml')};const plan=planInstall(args),applied=apply?applyInstall(plan):null;return {dir,args,plan,applied};}
function archive(f,source,name){if(!path.resolve(source).startsWith(base+path.sep))throw Error('temp_scope');fs.renameSync(source,path.join(f.dir,name));}
function settled(file){const l=new Ledger(file);l.append({type:'intent',commandId:'fixture-command',taskId:'fixture-task',target:{projectId:'fixture-only'}});l.append({type:'command',commandId:'fixture-command',state:'succeeded'});return hash(fs.readFileSync(file));}
const out={source,sourceHash:hash(fs.readFileSync(path.join(source,'core4/tools/install-core4.js'))),tempRoot:base,productionRead:false,productionWrite:false,sourceWrite:false,cases:[]};
{
 const f=fixture('orphan-identity');for(const [p,n] of [[f.applied.descriptorPath,'saved-descriptor'],[path.join(f.args.installRoot,'core-client.json'),'saved-client'],[path.join(f.args.installRoot,'origin.json'),'saved-origin'],[f.applied.stateDir,'saved-state'],[f.plan.cepDir,'saved-cep']])archive(f,p,n);
 const next=planInstall(f.args),result=applyInstall(next);out.cases.push({name:'transactions-releases-without-roots',installed:result.installed,newIdentity:next.descriptor.installationId!==f.plan.descriptor.installationId,previousDescriptor:next.previousDescriptor,oldTransactionPreserved:fs.existsSync(f.applied.transactionFile)});
}
{
 const f=fixture('orphan-descriptor');archive(f,f.applied.descriptorPath,'saved-descriptor');archive(f,path.join(f.args.installRoot,'core-client.json'),'saved-client');const next=planInstall(f.args),result=applyInstall(next);out.cases.push({name:'origins-cep-without-descriptor-client',installed:result.installed,sameIdentity:next.descriptor.installationId===f.plan.descriptor.installationId,predecessor:next.descriptor.predecessor,oldTransactionPreserved:fs.existsSync(f.applied.transactionFile)});
}
{
 const f=fixture('rollback-ledger'),file=path.join(f.applied.stateDir,'broker/ledger.ndjson'),before=settled(file),result=rollback(f.applied.transactionFile),next=planInstall(f.args),reapplied=applyInstall(next);out.cases.push({name:'initial-rollback-settled-ledger',rolledBack:result.rolledBack,reinstalled:reapplied.installed,ledgerPreserved:before===hash(fs.readFileSync(file)),predecessor:next.descriptor.predecessor});
}
{
 const f=fixture('state-after-plan',false),file=path.join(f.plan.descriptor.stateDir,'broker/ledger.ndjson'),before=settled(file),result=applyInstall(f.plan);out.cases.push({name:'settled-ledger-after-virgin-plan',installed:result.installed,ledgerPreserved:before===hash(fs.readFileSync(file)),predecessor:f.plan.descriptor.predecessor});
}
console.log(JSON.stringify(out,null,2));
