# core4/test/native-read-recovery.test.js

Commit: e6cde7c1f061763b6d0008162580039d2717aeb7
Full source SHA-256: 1a9c93656916ad23157f9ff9bfe5aad8fb943e54c35f4b3ced9945e44fb88575
Classification: INTERNAL; source code/documentation only.

## Source lines 1-144

```text
1: 'use strict';
2: const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
3: const {fork,spawnSync}=require('node:child_process');
4: const {hash,canonical}=require('../protocol/json');const vm=require('node:vm'),http=require('node:http');
5: const {mac}=require('../integrations/cep/peer-protocol');
6: const {recoveryFixture}=require('./fixtures/native-read-recovery');
7: const root=path.resolve(__dirname,'..');
8: function raw(port,route,input,origin='file://'){return new Promise((resolve,reject)=>{const req=http.request('http://127.0.0.1:'+port+route,{method:'POST',agent:false,headers:{Origin:origin,'Content-Type':'application/json'}},res=>{let b='';res.on('data',c=>b+=c);res.on('end',()=>resolve({status:res.statusCode,value:JSON.parse(b)}));});req.on('error',reject);req.end(canonical(input));});}
9: async function historicalAck(f,d){
10:   const {createHttpPeer}=require('../integrations/cep/http-peer'),asset={assetKey:'project-inspection-v1',executorHash:f.command.executorHash},peer=createHttpPeer({installation:d,directory:f.receiver,asset,port:0,pollTimeout:30,installationContext:{descriptorPath:f.args.descriptor}});await peer.listen();
11:   try {
12:   const port=peer.status().port,q=(await raw(port,'/challenge',{role:'panel'})).value,peerId='historical-fixture';assert.equal((await raw(port,'/link',{challenge:q,peerId,proof:mac({challenge:q,peerId},d.panelToken)})).status,200);let seq=0;
13:   const call=async(route,payload,origin='file://')=>{const body={epoch:q.epoch,peerId,sequence:++seq,method:'POST',path:route,payload:JSON.parse(JSON.stringify(payload))};const r=await raw(port,route,{body,mac:mac(body,d.panelToken)},origin);if(r.status===200){assert.equal(r.value.mac,mac(r.value.body,d.panelToken));return r.value.body.payload;}return r;};
14:   const receipt={commandId:f.command.commandId,originalBinding:f.binding,pins:f.pins,result:{readFailureVersion:1,outcome:'rejected',code:'host_registry_unavailable'}},authBody={epoch:q.epoch,peerId,sequence:1,method:'POST',path:'/complete',payload:receipt},envelope={body:authBody,mac:mac(authBody,d.panelToken)};
15:   assert.equal((await raw(port,'/complete',envelope,'null')).status,403);assert.equal((await raw(port,'/complete',{body:authBody,mac:mac(authBody,f.d.panelToken)})).status,403);assert.equal((await raw(port,'/complete',envelope)).status,200);seq=1;
16:   let evals=0,completes=0,loss=true;const key='aeagentcore4-physical-'+d.installationId,map=new Map([[key,canonical({frame:f.frame,result:{readFailureVersion:1,outcome:'rejected',code:'host_registry_unavailable'}})]]),storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
17:   const context=vm.createContext({JSON,Object,Array,Promise,Error,isFinite});vm.runInContext(fs.readFileSync(path.join(root,'cep/js/poll-dispatcher.js'),'utf8'),context);const dispatch=context.Core4PollDispatcher.createDispatcher({installationId:d.installationId,pins:{packageHash:d.packageHash,installationId:d.installationId,executorHash:asset.executorHash},storage,csInterface:{evalScript(){evals++;throw new Error('historical_eval_forbidden');}},complete:async p=>{completes++;const reply=await call('/complete',p);if(loss){loss=false;throw new Error('lost_ack');}return reply;}});
18:   const before=fs.readFileSync(f.journal);await assert.rejects(dispatch.recover(),/lost_ack/);assert.ok(map.has(key));assert.ok(before.equals(fs.readFileSync(f.journal)));await dispatch.recover();assert.equal(map.has(key),false);assert.equal(evals,0);assert.equal(completes,2);assert.ok(before.equals(fs.readFileSync(f.journal)));
19:   const bad=await call('/complete',{commandId:f.command.commandId,originalBinding:f.binding,pins:f.pins,result:{readFailureVersion:1,outcome:'rejected',code:'other'}});assert.equal(bad.status,403);assert.equal(bad.value.error,'historical_completion_correlation');
20:   const fresh=peer.inspect({}).then(value=>({value}),error=>({error})),polled=await call('/poll',{});assert.notEqual(polled.command.commandId,f.command.commandId);await call('/complete',{commandId:polled.command.commandId,originalBinding:polled.command.originalBinding,pins:polled.command.pins,result:{readFailureVersion:1,outcome:'rejected',code:'inspection_failed'}});assert.equal((await fresh).error.code,'inspection_failed');
21:   } finally { await peer.close(); }
22:   assert.equal(fs.existsSync(f.owner),false);
23: }
24: function forkApply(f,decision='approve',mutate){
25:   const child=fork(path.join(__dirname,'fixtures/disposition-child.js'),[f.fixtureFile],{stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
26:   const messages=[];let stderr='';child.stderr.on('data',b=>stderr+=b);child.stdout.resume();
27:   child.on('message',m=>{messages.push(m);if(m.event==='native_read_disposition_authorization'){
28:     mutate?.(m);
29:     const {event,...body}=m;
30:     if(decision==='disconnect')child.disconnect();else if(decision==='timeout'){}else if(decision==='mismatch')child.send({...body,nonce:'0'.repeat(64),decision:'approve'});else if(decision==='duplicate'){child.send({...body,decision:'approve'});child.send({...body,decision:'approve'});}else child.send({...body,decision:'approve'});
31:   }});
32:   return new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',(code,signal)=>resolve({code,signal,messages,stderr}));});
33: }
34: function directMainReadOnly(f){
35:   const d=JSON.parse(fs.readFileSync(f.args.descriptor)),requests=[{jsonrpc:'2.0',id:1,method:'initialize',params:{}},{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'core_status',arguments:{}}},{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'get_module_contract',arguments:{payload:{moduleId:'project-inspection'}}}}];
36:   const child=spawnSync(process.execPath,['--require',path.join(__dirname,'fixtures/stdio-main-ephemeral.js'),path.join(d.releaseDir,'runtime/stdio-entry.js'),'--installation',f.args.descriptor],{input:requests.map(canonical).join('\n')+'\n',encoding:'utf8',timeout:10000,windowsHide:true,cwd:os.tmpdir()});
37:   assert.equal(child.error,undefined);assert.equal(child.status,0,child.stderr);const replies=child.stdout.trim().split('\n').map(JSON.parse);assert.equal(replies.length,3);assert.ok(replies.find(r=>r.id===1).result.serverInfo);const status=JSON.parse(replies.find(r=>r.id===2).result.content[0].text);assert.equal(status.physical.storeFault,false,child.stderr);assert.equal(status.physical.storeClosed,false);assert.equal(status.physical.unknown,false);assert.ok(status.physical.port>0);assert.notEqual(status.physical.port,3457);assert.equal(replies.find(r=>r.id===3).result.isError,false);assert.doesNotMatch(child.stderr,/circular|non-existent|nonexistent|undefined/);assert.equal(child.stderr,'');assert.equal(fs.existsSync(f.owner),false);
38: }
39: test('native-read-recovery actual Node IPC approval commits one unknown disposition, archives owner and publishes v2 reachable lineage',async()=>{
40:   const f=await recoveryFixture(),before=fs.readFileSync(f.journal),result=await forkApply(f);assert.equal(result.code,0,result.stderr+canonical(result.messages));
41:   const done=result.messages.find(m=>m.event==='fixture_result');assert.ok(done);assert.equal(done.value.originalState,'unknown');assert.equal(done.value.packageHash,f.candidate.packageHash);
42:   const bytes=fs.readFileSync(f.journal);assert.ok(bytes.subarray(0,before.length).equals(before));const events=bytes.toString().trimEnd().split('\n').map(JSON.parse);assert.equal(events.length,4);assert.equal(events[2].type,'unknown');assert.equal(events[3].type,'terminal-read-failure-disposition');
43:   const d=JSON.parse(fs.readFileSync(f.args.descriptor));assert.equal(d.version,2);assert.equal(d.predecessor.transactionId,events[3].authorization.installTransactionId);assert.equal(fs.existsSync(f.owner),false);assert.equal(f.gates.some(fs.existsSync),false);
44:   const {openCompletionStore}=require('../integrations/cep/completion-store');const store=openCompletionStore({directory:f.receiver,installationContext:{descriptorPath:f.args.descriptor}});assert.equal(store.fault,false);assert.equal(store.closed,false);assert.equal(store.get(f.command.commandId).state,'unknown');assert.ok(store.get(f.command.commandId).terminalDisposition);assert.equal(store.has(f.command.commandId),true);assert.throws(()=>store.begin(f.command,f.binding),/duplicate_command_no_replay/);store.close();assert.equal(fs.existsSync(f.owner),false);
45:   directMainReadOnly(f);
46:   const event=events[3],{validateDisposition}=require('../runtime/native-read-disposition'),options={descriptorPath:f.args.descriptor,journalPrefixBytes:before};
47:   for(const mutate of [x=>x.controlMac='0'.repeat(64),x=>x.controlMac=mac({domain:x.authorization.domain,seal:x.seal,authorization:x.authorization},f.d.panelToken),x=>x.authorization.domain='wrong',x=>x.seal.capture.result.code='other',x=>x.seal.capture.transcript[2].request.body.sequence=2,x=>x.seal.facts.originalDelivered=false]){const bad=structuredClone(event);mutate(bad);assert.throws(()=>validateDisposition(bad,options));}
48:   const tx=path.join(f.d.installRoot,'transactions',event.authorization.installTransactionId+'.json'),saved=fs.readFileSync(tx),tampered=JSON.parse(saved);tampered.appliedDescriptorHash='0'.repeat(64);fs.writeFileSync(tx,canonical(tampered));assert.throws(()=>validateDisposition(event,options),/lineage_transaction_binding/);fs.writeFileSync(tx,saved);
49:   const {rollback,planInstall,applyInstall}=require('../tools/install-core4');assert.throws(()=>rollback(tx),/rollback_reader_unsupported/);assert.equal(fs.existsSync(f.gates[0]),false);
50:   const {verifyInstallation}=require('../runtime/installation');assert.throws(()=>verifyInstallation(f.args.descriptor,{verifyNode:false}),/installation_verifier_options/);const preparedDescriptor=path.join(f.d.installRoot,'transactions',event.authorization.installTransactionId+'-prepared/descriptor.json');assert.throws(()=>verifyInstallation(preparedDescriptor),/installation_descriptor/);
51:   fs.renameSync(f.evidenceRoot,f.evidenceRoot+'-removed');fs.writeFileSync(f.args.config,'# mutable client preferences\n[mcp_servers.after-effects-core4]\nenabled = false\n');
52:   const cacheFile=path.join(f.cacheRoot,'core-'+f.caches[0],'core/broker.js'),cacheBytes=fs.readFileSync(cacheFile);
53:   fs.appendFileSync(cacheFile,'\n// mutable inert cache irrelevant to historical authority\n');
54:   const oldReader=require('./fixtures/legacy-completion-store').openCompletionStore({directory:f.receiver});assert.equal(oldReader.fault,true);oldReader.close();assert.ok(fs.existsSync(f.owner));fs.unlinkSync(f.owner); // fixture-created owner only, never original owner.
55:   // Cross the former 16-descriptor limit with real installs and the original
56:   // signed disposition. Updates must not turn settled history into storeFault.
57:   for(let n=0;n<17;n++){const previous=JSON.parse(fs.readFileSync(f.args.descriptor)),plan=planInstall({pkg:f.candidate,nodePath:process.execPath,installRoot:f.d.installRoot,extensionsDir:path.dirname(f.args.cepDir),configPath:f.args.config,machineId:os.hostname()});applyInstall(plan);const next=verifyInstallation(f.args.descriptor);assert.notEqual(next.panelToken,previous.panelToken);assert.notEqual(next.controlToken,previous.controlToken);assert.ok(validateDisposition(event,options));}
58:   // History validation above ignores the deliberately corrupted cache; actual
59:   // startup must verify it. Restore only these synthetic fixture bytes first.
60:   fs.writeFileSync(cacheFile,cacheBytes);
61:   directMainReadOnly(f);
62:   const deepStore=openCompletionStore({directory:f.receiver,installationContext:{descriptorPath:f.args.descriptor}});assert.equal(deepStore.fault,false);assert.equal(deepStore.closed,false);assert.equal(deepStore.get(f.command.commandId).state,'unknown');assert.ok(deepStore.get(f.command.commandId).terminalDisposition);assert.throws(()=>deepStore.begin(f.command,f.binding),/duplicate_command_no_replay/);deepStore.close();
63:   // A later invocation must still verify old bytes; no cross-call cache.
64:   fs.writeFileSync(tx,canonical(tampered));assert.throws(()=>validateDisposition(event,options),/lineage_transaction_binding/);fs.writeFileSync(tx,saved);assert.ok(validateDisposition(event,options));
65:   const active=verifyInstallation(f.args.descriptor);await historicalAck(f,active);assert.ok(validateDisposition(event,options));
66:   const resultChild=spawnSync(process.execPath,['-e',"const p=require('node:path'),fs=require('node:fs');const d=JSON.parse(fs.readFileSync(process.argv[1]));const s=require(p.join(d.releaseDir,'integrations/cep/completion-store.js')).openCompletionStore({directory:p.join(d.stateDir,'receiver'),installationContext:{descriptorPath:process.argv[1]}});if(s.fault||s.closed)throw Error('standalone_history');s.close();console.log('standalone PASS');",f.args.descriptor],{cwd:os.tmpdir(),encoding:'utf8',timeout:10000,windowsHide:true});assert.equal(resultChild.status,0,resultChild.stderr);assert.match(resultChild.stdout,/standalone PASS/);
67:   const prior=fs.readFileSync(f.journal).toString().trimEnd().split('\n').map(JSON.parse),command={...f.command,commandId:'unrelated-new-unknown'},binding=require('../protocol/dispatch').dispatchBinding(command,f.binding.receiverStoreIdentity);let tail=prior.at(-1);for(const value of [{type:'begin',commandId:command.commandId,commandDigest:hash(command),command,originalBinding:binding},{type:'unknown',commandId:command.commandId}]){const body={...value,seq:tail.seq+1,previousHash:tail.recordHash};tail={...body,recordHash:hash(body)};fs.appendFileSync(f.journal,canonical(tail)+'\n');}
68:   const closed=openCompletionStore({directory:f.receiver,installationContext:{descriptorPath:f.args.descriptor}});assert.equal(closed.fault,false);assert.equal(closed.closed,true);assert.equal(closed.get(f.command.commandId).state,'unknown');assert.ok(closed.get(f.command.commandId).terminalDisposition);closed.close();assert.ok(fs.existsSync(f.owner));assert.throws(()=>applyInstall(planInstall({pkg:f.candidate,nodePath:process.execPath,installRoot:f.d.installRoot,extensionsDir:path.dirname(f.args.cepDir),configPath:f.args.config,machineId:os.hostname()})),/runtime_state_owned_or_unknown/);
69: });
70: 
71: for(const decision of ['mismatch','duplicate','disconnect','timeout'])test('native-read-recovery IPC '+decision+' retains exact prepared plan and gates without journal/owner mutation',async()=>{
72:   const f=await recoveryFixture(),before=fs.readFileSync(f.journal),owner=fs.readFileSync(f.owner),d=fs.readFileSync(f.args.descriptor),result=await forkApply(f,decision);
73:   assert.equal(result.code,1,result.stderr);assert.ok(before.equals(fs.readFileSync(f.journal)));assert.ok(owner.equals(fs.readFileSync(f.owner)));assert.ok(d.equals(fs.readFileSync(f.args.descriptor)));assert.ok(f.gates.every(fs.existsSync));
74:   const req=result.messages.find(m=>m.event==='native_read_disposition_authorization');assert.ok(req);const prepared=path.join(f.d.installRoot,'transactions',req.installTransactionId+'-prepared');const p=JSON.parse(fs.readFileSync(path.join(prepared,'prepared.json')));assert.equal(hash(fs.readFileSync(path.join(prepared,'descriptor.json'))),req.appliedDescriptorHash);assert.equal(hash(fs.readFileSync(path.join(prepared,'prepared.json'))),req.preparedStateHash);assert.equal(p.preparedPlanHash,req.preparedPlanHash);
75:   assert.equal(fs.existsSync(path.join(f.d.installRoot,'releases',f.candidate.packageHash)),false,'no candidate stage/publish before approval');
76: });
77: 
78: for(const fault of ['append-short','append-fsync','archive','install-switch'])test('native-read-recovery '+fault+' retains gates/evidence and original UNKNOWN without automatic recovery',async()=>{
79:   const f=await recoveryFixture(),before=fs.readFileSync(f.journal),d=fs.readFileSync(f.args.descriptor),config=JSON.parse(fs.readFileSync(f.fixtureFile));config.fault=fault;fs.writeFileSync(f.fixtureFile,canonical(config));
80:   const result=await forkApply(f);assert.equal(result.code,1,result.stderr+canonical(result.messages));assert.ok(f.gates.every(fs.existsSync),canonical(result.messages));assert.ok(d.equals(fs.readFileSync(f.args.descriptor)));const bytes=fs.readFileSync(f.journal);assert.ok(bytes.subarray(0,before.length).equals(before));
81:   if(fault==='append-short'){assert.ok(fs.existsSync(f.owner));assert.equal(bytes.length,before.length+7);}else{const events=bytes.toString().trimEnd().split('\n').map(JSON.parse);assert.equal(events[2].type,'unknown');assert.equal(events[3].type,'terminal-read-failure-disposition');}
82:   if(fault!=='install-switch')assert.ok(fs.existsSync(f.owner));else assert.equal(fs.existsSync(f.owner),false);
83:   const {openCompletionStore}=require('../integrations/cep/completion-store');const store=openCompletionStore({directory:f.receiver,installationContext:{descriptorPath:f.args.descriptor}});assert.equal(store.closed,true);assert.equal(store.fault,true);store.close();
84: });
85: 
86: test('native-read-recovery approval does not waive fresh original CAS, new owners or additional UNKNOWN',async()=>{
87:   const f=await recoveryFixture(),before=fs.readFileSync(f.journal),result=await forkApply(f,'approve',()=>fs.writeFileSync(path.join(f.broker,'broker-owner.lock'),'foreign'));
88:   assert.equal(result.code,1);assert.ok(before.equals(fs.readFileSync(f.journal)));assert.ok(fs.existsSync(f.owner));assert.ok(f.gates.every(fs.existsSync));assert.equal(fs.readFileSync(path.join(f.broker,'broker-owner.lock'),'utf8'),'foreign');
89: });
90: 
91: test('native-read-recovery private plan and shared lease reject JSON forgery, mutation, foreign scope and startup while held',async()=>{
92:   const {buildPackage}=require('../tools/package-installable'),{planInstall,applyInstall,prepareInstallPlan}=require('../tools/install-core4'),leaseApi=require('../runtime/install-lease');
93:   const dir=fs.mkdtempSync(path.join(os.tmpdir(),'core4-recovery-lease-')),args={pkg:buildPackage(),nodePath:process.execPath,installRoot:path.join(dir,'AEAgentCore4'),extensionsDir:path.join(dir,'extensions'),configPath:path.join(dir,'config.toml'),machineId:os.hostname()},first=applyInstall(planInstall(args)),d=JSON.parse(fs.readFileSync(first.descriptorPath)),plan=planInstall(args),scope={installRoot:d.installRoot,stateDir:d.stateDir,descriptorPath:first.descriptorPath};
94:   assert.throws(()=>applyInstall(JSON.parse(JSON.stringify(plan))),/prepared_install_plan_brand/);assert.throws(()=>applyInstall(plan,{lease:{}}),/install_lease_brand/);assert.throws(()=>leaseApi.acquireInstallLease(scope,{io:{}}),/install_lease_options_forbidden/);assert.throws(()=>require('../runtime/installation-lineage').resolveHistoricalForInstall({descriptorPath:first.descriptorPath,descriptorHash:hash(fs.readFileSync(first.descriptorPath)),plan,lease:{}}),/install_lease_brand/);
95:   const lease=leaseApi.acquireInstallLease(scope);try{assert.throws(()=>leaseApi.assertInstallLease(lease,{...scope,stateDir:scope.stateDir+'-foreign'}),/lease_scope|install_lease_scope/);assert.throws(()=>leaseApi.acquireInstallLease(scope),/EEXIST/);const child=spawnSync(process.execPath,[path.join(d.releaseDir,'runtime/stdio-entry.js'),'--installation',first.descriptorPath],{encoding:'utf8',timeout:5000,windowsHide:true});assert.equal(child.status,1);assert.match(child.stderr,/EEXIST/);
96:     fs.mkdirSync(path.join(d.installRoot,'transactions'),{recursive:true});const prepared=prepareInstallPlan(plan,{lease});assert.ok(prepared.preparedStateHash);assert.equal(fs.existsSync(plan.descriptor.releaseDir),true);assert.notEqual(plan.descriptor.panelToken,d.panelToken);
97:     plan.descriptor.controlToken='0'.repeat(64);assert.throws(()=>applyInstall(plan,{lease}),/prepared_install_plan_brand_or_changed/);
98:   }finally{leaseApi.releaseInstallLease(lease);}assert.throws(()=>leaseApi.releaseInstallLease(lease),/install_lease_brand/);
99: });
100: 
101: test('native-read-recovery historical Node binding is data, explicit lineage rejects missing/tampered edges and runtime has no data-only selector',()=>{
102:   const {buildPackage}=require('../tools/package-installable'),{planInstall,applyInstall}=require('../tools/install-core4'),{legacyV1Data}=require('./fixtures/legacy-installation-v1'),{resolveHistoricalInstallation}=require('../runtime/installation-lineage');
103:   const dir=fs.mkdtempSync(path.join(os.tmpdir(),'core4-recovery-lineage-')),args={pkg:buildPackage(),nodePath:process.execPath,installRoot:path.join(dir,'AEAgentCore4'),extensionsDir:path.join(dir,'extensions'),configPath:path.join(dir,'config.toml'),machineId:os.hostname()},old=legacyV1Data(planInstall(args)),d=JSON.parse(fs.readFileSync(old.descriptorPath));
104:   d.nodePath=path.join(dir,'historical-node-must-never-execute.exe');d.nodeHash='1'.repeat(64);fs.writeFileSync(old.descriptorPath,canonical(d));const oldHash=hash(fs.readFileSync(old.descriptorPath)),installed=applyInstall(planInstall(args)),query={descriptorPath:old.descriptorPath,descriptorHash:oldHash};
105:   assert.equal(resolveHistoricalInstallation(query).historical.descriptor.nodePath,d.nodePath);assert.equal(fs.existsSync(d.nodePath),false);assert.throws(()=>resolveHistoricalInstallation({...query,verifyNode:false}),/lineage_runtime_options/);
106:   const file=installed.transactionFile,saved=fs.readFileSync(file);fs.renameSync(file,file+'.fixture-missing');assert.throws(()=>resolveHistoricalInstallation(query),/lineage_transaction_not_in_snapshot/);fs.renameSync(file+'.fixture-missing',file);
107:   const tx=JSON.parse(saved);tx.previousDescriptor=Buffer.from(canonical({...d,controlToken:'3'.repeat(64)})).toString('base64');fs.writeFileSync(file,canonical(tx));assert.throws(()=>resolveHistoricalInstallation(query),/lineage_previous_bytes/);fs.writeFileSync(file,saved);
108:   assert.throws(()=>resolveHistoricalInstallation({...query,descriptorHash:'f'.repeat(64)}),/lineage_target_unreachable/);
109:   // A correctly bound file arriving after enumeration cannot grow this walk.
110:   const transactions=path.dirname(file),late=file+'.fixture-late',readdir=fs.readdirSync;
111:   fs.renameSync(file,late);let snapshots=0;
112:   fs.readdirSync=function(directory,...args){const names=readdir.call(fs,directory,...args);if(directory===transactions){snapshots++;fs.renameSync(late,file);}return names;};
113:   try{assert.throws(()=>resolveHistoricalInstallation(query),/lineage_transaction_not_in_snapshot/);assert.equal(snapshots,1);}
114:   finally{fs.readdirSync=readdir;if(fs.existsSync(late))fs.renameSync(late,file);}
115:   assert.equal(resolveHistoricalInstallation(query).historical.descriptor.nodePath,d.nodePath);
116:   // Directory enumeration must not introduce a reparse-path bypass.
117:   const moved=transactions+'-fixture-original';fs.renameSync(transactions,moved);
118:   try{fs.symlinkSync(moved,transactions,process.platform==='win32'?'junction':'dir');assert.throws(()=>resolveHistoricalInstallation(query),/lineage_path/);}
119:   finally{if(fs.existsSync(transactions))fs.unlinkSync(transactions);fs.renameSync(moved,transactions);}
120:   assert.equal(resolveHistoricalInstallation(query).historical.descriptor.nodePath,d.nodePath);
121: });
122: 
123: test('native-read-recovery rollback partial visible switch retains both lease gates and transaction without automatic rollback',()=>{
124:   const {buildPackage}=require('../tools/package-installable'),{planInstall,applyInstall,rollback}=require('../tools/install-core4'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'core4-rollback-retain-')),args={pkg:buildPackage(),nodePath:process.execPath,installRoot:path.join(dir,'AEAgentCore4'),extensionsDir:path.join(dir,'extensions'),configPath:path.join(dir,'config.toml'),machineId:os.hostname()};applyInstall(planInstall(args));const installed=applyInstall(planInstall(args)),d=JSON.parse(fs.readFileSync(installed.descriptorPath)),rename=fs.renameSync;
125:   fs.renameSync=(from,to)=>{if(from.endsWith('installation.json.rollback'))throw Object.assign(new Error('fixture_rollback_switch'),{code:'fixture_rollback_switch'});return rename(from,to);};
126:   try{assert.throws(()=>rollback(installed.transactionFile),e=>e.code==='fixture_rollback_switch'&&e.leaseRetained===true);}finally{fs.renameSync=rename;}
127:   assert.ok(fs.existsSync(path.join(d.installRoot,'install.lock')));assert.ok(fs.existsSync(path.join(d.stateDir,'broker/broker-owner.gate')));assert.ok(fs.existsSync(installed.transactionFile));assert.ok(fs.existsSync(installed.descriptorPath+'.rollback'));
128: });
129: 
130: test('native-read-recovery operator inspect rejects modified managed witness, producer profile and closure before issuance',async()=>{
131:   const f=await recoveryFixture(),api=require('../tools/dispose-native-read'),{createCapture}=require('../tools/capture-native-read'),closure=api.verifyOperatorClosure(f.operatorRoot,f.operatorHash),op=api.createDispositionOperator({operatorRoot:f.operatorRoot,operatorClosure:closure,captureFactory:()=>createCapture(f.probes),probePid:()=> 'dead'});
132:   const initial=await op.inspect(f.args);assert.equal(initial.proofHash,(await op.inspect(f.args)).proofHash);
133:   const context=path.join(f.producerSession,'context.json'),saved=fs.readFileSync(context),c=JSON.parse(saved);c.ackAllowed=true;fs.writeFileSync(context,canonical(c));await assert.rejects(op.inspect(f.args),/operator_producer_context/);fs.writeFileSync(context,saved);
134:   const w=fs.readFileSync(f.args.provenance);fs.writeFileSync(f.args.provenance,canonical({...JSON.parse(w),authority:true}));await assert.rejects(op.inspect(f.args));fs.writeFileSync(f.args.provenance,w);
135:   await assert.rejects(op.apply({...f.args,expectedProofHash:initial.proofHash}),/parent_ipc_required/);assert.equal(f.gates.some(fs.existsSync),false);
136:   fs.appendFileSync(path.join(f.operatorRoot,'runtime/install-lease.js'),'\n// tampered reviewed code\n');assert.throws(()=>api.verifyOperatorClosure(f.operatorRoot,f.operatorHash),/operator_closure_bytes/);await assert.rejects(op.inspect(f.args),/operator_closure_bytes/);
137: });
138: 
139: for(const fault of ['owner-between-inspect-apply','owner-after-ipc','owner-after-append','owner-wrong-archive','owner-after-rename'])test('native-read-recovery owner identity ABA '+fault+' refuses C and preserves original history/foreign marker',async()=>{
140:   const f=await recoveryFixture(),prefix=fs.readFileSync(f.journal),descriptor=fs.readFileSync(f.args.descriptor),old=fs.statSync(f.owner,{bigint:true}),config=JSON.parse(fs.readFileSync(f.fixtureFile));config.fault=fault;fs.writeFileSync(f.fixtureFile,canonical(config));
141:   const result=await forkApply(f,'approve',()=>{if(fault==='owner-after-ipc'){fs.renameSync(f.owner,path.join(f.directory,'fixture-displaced-after-ipc'));fs.writeFileSync(f.owner,'');}});assert.equal(result.code,1,result.stderr+canonical(result.messages));assert.ok(descriptor.equals(fs.readFileSync(f.args.descriptor)));assert.equal(fs.existsSync(path.join(f.d.installRoot,'releases',f.candidate.packageHash)),false);const journal=fs.readFileSync(f.journal);assert.ok(journal.subarray(0,prefix.length).equals(prefix));const lines=journal.toString().trimEnd().split('\n').map(JSON.parse);assert.equal(lines[2].type,'unknown');
142:   if(fault==='owner-between-inspect-apply'){assert.equal(f.gates.some(fs.existsSync),false);assert.equal(journal.length,prefix.length);assert.equal(result.messages.at(-1).error,'operator_proof_changed');}else assert.ok(f.gates.every(fs.existsSync));
143:   const error=result.messages.find(m=>m.event==='fixture_error');assert.equal(error.error,{'owner-between-inspect-apply':'operator_proof_changed','owner-after-ipc':'operator_proof_changed','owner-after-append':'operator_owner_identity_changed','owner-wrong-archive':'operator_owner_identity_changed','owner-after-rename':'operator_owner_archive_readback'}[fault]);if(fault==='owner-wrong-archive'){const archived=path.join(error.transaction,'receiver-owner'),foreign=fs.statSync(archived,{bigint:true});assert.notEqual(String(foreign.ino),String(old.ino));assert.equal(fs.readFileSync(archived).length,0);assert.equal(fs.existsSync(f.owner),false);assert.ok(fs.existsSync(path.join(f.directory,'fixture-displaced-wrong-archive')));}else{assert.ok(fs.existsSync(f.owner));if(fault==='owner-after-rename')assert.equal(fs.readFileSync(f.owner,'utf8'),'foreign-marker-preserve');else assert.notEqual(String(fs.statSync(f.owner,{bigint:true}).ino),String(old.ino));}
144: });
```

