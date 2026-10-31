'use strict';
// Fixed read-only continuation proof, without constructing a runtime/store.
const fs=require('node:fs'),path=require('node:path');
const out=__dirname,repo=path.resolve(out,'../../../..'),base=path.join(out,'../HOSTREADOPT-ACTUAL');
const o=JSON.parse(fs.readFileSync(path.join(base,'operation.json'))),before=JSON.parse(fs.readFileSync(path.join(base,'installed-readback.json')));
require(path.join(o.distribution,'tools/standalone-installer')).verifyStandalone(o.distribution,o.distributionHash);
const d=require(path.join(o.distribution,'tools/maintain-owner')).verifyOwnerInstallation(o.descriptorPath,o.packageHash),{canonical,hash}=require(path.join(o.distribution,'protocol/json'));
const check=(v,c)=>{if(!v)throw Error(c);},seen=new Map();
function read(file){const a=fs.lstatSync(file,{bigint:true});check(a.isFile()&&!a.isSymbolicLink(),'non_plain');const bytes=fs.readFileSync(file),b=fs.lstatSync(file,{bigint:true});check(['dev','ino','size','mtimeNs','ctimeNs'].every(k=>a[k]===b[k]),'changed');seen.set(file,{hash:hash(bytes),stat:b});return bytes;}
const journal=read(path.join(d.stateDir,'receiver/completions.ndjson')),lines=journal.toString('utf8').trimEnd().split('\n'),events=lines.map(JSON.parse);
check(lines.length===28&&hash(Buffer.from(lines.slice(0,24).join('\n')+'\n'))===before.hashes.journal,'history_prefix');
const history=require(path.join(o.distribution,'runtime/recovery-inspection')).inspectReceiverHistory(journal,{descriptorPath:o.descriptorPath});check(history.settled&&!history.unresolved.length,'unsettled');
const project=JSON.parse(fs.readFileSync(path.join(out,'project-inspection.json')));
check(events[24].commandId===project.originalBinding.commandId&&events[24].command.phase==='inspect'&&events[24].command.moduleId==='project-inspection'&&canonical(events[25].response.result)===canonical(project.observation),'project_binding');
const begin=events[26],complete=events[27];check(begin.type==='begin'&&begin.commandId==='inspect-39e4deea-b0d0-427d-844e-0ef7d4cb2f7b'&&begin.command.phase==='inspect'&&begin.command.moduleId==='titles-current-target'&&complete.type==='complete'&&complete.commandId===begin.commandId&&canonical(complete.response.result)===canonical({code:'inspection_failed',outcome:'rejected',readFailureVersion:1}),'titles_read_binding');
const files={descriptor:o.descriptorPath,client:path.join(d.installRoot,'core-client.json'),config:path.join(repo,'.codex/config.toml'),rootOrigin:path.join(d.installRoot,'origin.json'),anchorOrigin:path.join(d.stateDir,'origin.json'),adoption:path.join(d.stateDir,'host-adoption.json')},hashes={};
for(const [name,file]of Object.entries(files)){hashes[name]=hash(read(file));check(hashes[name]===before.hashes[name],name+'_changed');}
const aep=JSON.parse(fs.readFileSync(path.join(base,'preflight.json'))).project;check(hash(read(aep.path))===aep.hash,'aep_changed');
check(!fs.existsSync(path.join(d.stateDir,'broker/ledger.ndjson'))&&!fs.existsSync(path.join(d.stateDir,'runtime-maintenance.json'))&&!fs.existsSync(path.join(d.installRoot,'install.lock'))&&!fs.existsSync(path.join(d.stateDir,'broker/broker-owner.gate')),'unexpected_ledger_or_gate');
for(const [file,a]of seen){const b=fs.lstatSync(file,{bigint:true});check(['dev','ino','size','mtimeNs','ctimeNs'].every(k=>a.stat[k]===b[k])&&hash(fs.readFileSync(file))===a.hash,'readback_changed');}
const report={collectedAt:new Date().toISOString(),recordContext:{purpose:'technical_check',lifetime:'ephemeral_check'},journalHash:hash(journal),journalEvents:28,prefix24Hash:before.hashes.journal,settled:true,unresolved:[],newCommands:events.filter(e=>e.seq>24&&e.type==='begin').map(e=>({commandId:e.commandId,phase:e.command.phase,moduleId:e.command.moduleId})),projectObservationMatchesConfigured:true,titlesReadFailure:complete.response.result,firstTitlesCallNativeDispatch:false,protectedHashes:hashes,aepHash:aep.hash,mutationDispatches:0,save:0,aeRestart:0,ledgerPresent:false};
fs.writeFileSync(path.join(out,'receiver-readback.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
