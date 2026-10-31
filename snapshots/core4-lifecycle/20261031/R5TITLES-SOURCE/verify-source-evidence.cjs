'use strict';
// Offline parent verification only. Never reruns tests or runtime operators.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const repo=path.resolve(__dirname,'../../../..'),p=path.join(__dirname,'final02'),read=n=>JSON.parse(fs.readFileSync(path.join(p,n))),hash=b=>crypto.createHash('sha256').update(b).digest('hex'),check=(v,c)=>{if(!v)throw Error(c);};
const{canonical}=require(path.join(repo,'core4/protocol/json'));
const before=read('run02-capture.before.json'),after=read('run02-capture.after.json'),frozen=read('freeze02-hashes.json'),selection=read('run02-selection.before.json'),summary=read('run02-summary.json');
check(canonical(before.sourceHashes)===canonical(after.sourceHashes)&&canonical(before.sourceHashes)===canonical(frozen.files)&&Object.keys(frozen.files).length===10,'source_envelope');
for(const key of ['dependencyHashes','checkKeys','commands','selectionSHA'])check(canonical(before[key])===canonical(after[key]),'after_envelope_'+key);
check(Object.keys(before.dependencyHashes).length===189&&Object.keys(before.checkKeys).length===7,'envelope_counts');
for(const[f,sha]of Object.entries({...before.sourceHashes,...before.dependencyHashes})){check(!path.isAbsolute(f)&&!f.split(/[\\/]/).includes('..')&&/^[a-f0-9]{64}$/.test(sha),'dependency_path');check(hash(fs.readFileSync(path.join(repo,f)))===sha,'current_bytes_'+f);}
for(const[f,sha]of Object.entries(frozen.files))check(hash(fs.readFileSync(path.join(p,'source',f)))===sha,'frozen_copy_'+f);
const current=require(path.join(repo,'core4/tools/validate-diff')).selectChecks(Object.keys(frozen.files).filter(f=>f.startsWith('core4/')),path.join(repo,'core4'));
check(canonical(current)===canonical(selection)&&canonical(selection)===canonical(read('run02-selection.after.json')),'current_selection');
check(hash(fs.readFileSync(path.join(p,'run02-selection.before.json')))===before.selectionSHA&&canonical(selection.executionBatches)===canonical(before.commands),'selection_command_binding');
for(const c of selection.checks)check(c.evidenceKey===before.checkKeys[c.check],'current_key');
const testFiles=selection.executionBatches.flatMap(b=>b.command.filter(a=>a.endsWith('.test.js')));check(new Set(testFiles).size===testFiles.length,'overlapping_core_test_files');
check(summary.records.length===3&&summary.allExitZero&&summary.beforeAfterEqual,'summary_coverage');
const raws={};for(const r of summary.records){check(r.exit===0&&r.signal===null&&r.error===null&&Date.parse(r.endedAt)>=Date.parse(r.startedAt),'command_exit');const name=path.basename(r.raw),bytes=fs.readFileSync(path.join(p,name));check(hash(bytes)===r.rawSHA,'raw_hash');raws[r.name]=bytes;}
check(raws['run02-core'].subarray(0,fs.readFileSync(path.join(p,'run02-selection.before.json')).length).equals(fs.readFileSync(path.join(p,'run02-selection.before.json'))),'raw_selector_prefix');
function summaries(bytes,count){const s=bytes.toString('utf8'),vectors={};for(const key of ['tests','pass','fail','cancelled','skipped','todo']){vectors[key]=[...s.matchAll(new RegExp('^(?:#|ℹ) '+key+' (\\d+)\\r?$','gm'))].map(m=>Number(m[1]));check(vectors[key].length===count,'framework_summary_count_'+key);}check(canonical(vectors.tests)===canonical(vectors.pass)&&['fail','cancelled','skipped','todo'].every(k=>vectors[k].every(v=>v===0)),'framework_failures');return vectors.tests;}
const core=summaries(raws['run02-core'],7),product=summaries(raws['run02-product'],1);check(canonical(core)===canonical([51,40,21,19,25,17,11])&&product[0]===8,'expected_framework_counts');
const boundary=JSON.parse(raws['run02-boundaries'].toString('utf8'));check(boundary.checked===44&&boundary.liveCalls===0,'boundaries');
const candidate=read('candidate02.json');check(candidate.packageHash==='be9afe99d4b04fa480477af288bb0b3e8dfc15c493add2e0da3225fe4940ad43'&&candidate.distributionHash==='5de01291e5dd0a7e1d8142f3a64dc4acd466bec8d94eb22f129059f6f88bccf7','candidate_identity');
const report={collectedAt:new Date().toISOString(),sourceHashes:frozen.files,dependencyCount:189,currentChecks:7,currentExecutionBatches:7,coreCounts:core,productCount:8,uniquePass:core.reduce((a,b)=>a+b,0)+8,fail:0,commands:summary.records.map(r=>({command:r.command,cwd:r.cwd,exit:r.exit,rawSHA:r.rawSHA})),beforeAfterAndCurrentMatched:true,rawSelectorPrefixMatched:true,testFilesDisjoint:true,boundaries:boundary,sourceReview:'ACCEPT freeze02; review-freeze02.md',candidate,testsReplayedByParent:0,officialOutputWritten:false,installedWrites:0,aeCalls:0,releaseCertified:false,deferredCoverage:selection.deferredCoverage};
fs.writeFileSync(path.join(__dirname,'accepted-evidence.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({sourceHashes:10,dependencies:189,currentChecks:7,coreCounts:core,product:8,uniquePass:report.uniquePass,boundaries:boundary.checked,parentTestReplay:0,releaseCertified:false}));
