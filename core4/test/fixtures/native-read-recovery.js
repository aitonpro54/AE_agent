'use strict';
// Synthetic test-only installation/provenance model, never AE attestation.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),crypto=require('node:crypto');
const {hash,canonical}=require('../../protocol/json');const {dispatchBinding}=require('../../protocol/dispatch');
const {buildPackage}=require('../../tools/package-installable');const {planInstall}=require('../../tools/install-core4');
const {legacyV1Data}=require('./legacy-installation-v1');const {createCapture}=require('../../tools/capture-native-read');
const {buildOperatorPackage,writeOperatorPackage}=require('../../tools/package-native-read-operator');
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-native-capture-')), evidenceRoot = path.join(directory, 'evidence'); fs.mkdirSync(evidenceRoot);
  const pkg = buildPackage(), config = path.join(directory, 'project/.codex/config.toml');
  const plan = planInstall({ pkg, nodePath: fs.realpathSync(process.execPath), installRoot: path.join(directory, 'AEAgentCore4'), extensionsDir: path.join(directory, 'extensions'), configPath: config, machineId: os.hostname() });
  const installed = legacyV1Data(plan), descriptor = installed.descriptorPath, d = JSON.parse(fs.readFileSync(descriptor)), receiver = path.join(d.stateDir, 'receiver'), broker = path.join(d.stateDir, 'broker'); fs.mkdirSync(receiver); fs.mkdirSync(broker);
  // Real Broker constructor layout, including one stale identity. Contents are
  // copied as fixture DATA and deliberately never imported from this cache.
  const core = JSON.parse(Buffer.from(pkg.files['core/artifact.json'], 'base64')), stalePkg = structuredClone(pkg), staleCore = structuredClone(core);
  const staleSource = Buffer.from(stalePkg.files['core/broker.js'], 'base64').toString() + '\n// inert historical fixture code copy\n'; stalePkg.files['core/broker.js'] = Buffer.from(staleSource).toString('base64'); staleCore.hashes['core/broker.js'] = hash(staleSource);
  const staleManifestBytes = JSON.stringify(staleCore, null, 2) + '\n'; stalePkg.files['core/artifact.json'] = Buffer.from(staleManifestBytes).toString('base64'); stalePkg.release.hashes['core/broker.js'] = hash(staleSource); stalePkg.release.hashes['core/artifact.json'] = hash(staleManifestBytes); stalePkg.packageHash = hash(stalePkg.release);
  const staleRelease = path.join(d.installRoot, 'releases', stalePkg.packageHash); for (const [file, encoded] of Object.entries(stalePkg.files)) { const target = path.join(staleRelease, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, Buffer.from(encoded, 'base64')); } fs.writeFileSync(path.join(staleRelease, 'release.json'), canonical(stalePkg.release));
  const cacheRoot = path.join(broker, 'artifacts'), caches = [hash(core), hash(staleCore)];
  for (const [index, identity] of caches.entries()) for (const file of Object.keys(core.hashes)) { const target = path.join(cacheRoot, 'core-' + identity, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, Buffer.from((index ? stalePkg : pkg).files[file], 'base64')); }
  const admission = JSON.parse(Buffer.from(pkg.files['modules/project-inspection/artifact.json'], 'base64')), contract = JSON.parse(Buffer.from(pkg.files['modules/project-inspection/contract.json'], 'base64'));
  const command = { protocolVersion: 1, controllerId: 'original-controller', channelEpoch: 'original-http-epoch', commandId: 'inspect-original', moduleId: 'project-inspection', operationId: 'inspect', executorHash: admission.executorHash, phase: 'inspect', payloadHash: hash(canonical({})), payload: {} };
  const identity = 'receiver-store-offline-fixture', binding = dispatchBinding(command, identity), events = [];
  function event(value) { const body = { ...value, seq: events.length + 1, previousHash: events.at(-1)?.recordHash || 'origin' }; events.push({ ...body, recordHash: hash(body) }); }
  event({ type: 'origin', identity }); event({ type: 'begin', commandId: command.commandId, commandDigest: hash(command), command, originalBinding: binding }); event({ type: 'unknown', commandId: command.commandId });
  const journal = path.join(receiver, 'completions.ndjson'), owner = path.join(receiver, 'owner'); fs.writeFileSync(journal, events.map(canonical).join('\n') + '\n'); fs.writeFileSync(owner, '');
  const start = new Date(Date.now() - 60000).toISOString(), end = new Date(Date.now() - 30000).toISOString(), pid = 123456789;
  const contractId = hash({ packageHash: d.packageHash, admission, contract });
  const status = { pid, installation: { installationId: d.installationId, packageHash: d.packageHash, machineId: d.machineId }, ledgerFault: false, ownershipFault: null, unresolved: [], worker: { pid: null, pending: 0 }, physical: { receiverStoreIdentity: identity, storeFault: false, storeClosed: false, pending: null, unknown: false } };
  const content = value => ({ result: { content: [{ type: 'text', text: canonical(value) }], isError: false } });
  const request = (id, name, payload) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: payload ? { payload } : {} } });
  const requests = [request(2, 'core_status'), request(3, 'get_module_contract', { moduleId: 'project-inspection' }), request(4, 'inspect_module_target', { moduleId: 'project-inspection', contractId: 'invalid', target: {} }), request(5, 'inspect_module_target', { moduleId: 'project-inspection', contractId, target: {} }), request(6, 'core_status'), request(8, 'core_status')];
  const replies = [{ id: 2, ...content(status) }, { id: 3, ...content({ contract, contractId, modulePin: hash(admission) }) }, { id: 4, error: { message: 'contract_required' } }, { id: 6, ...content({ ...status, physical: { ...status.physical, pending: { commandId: command.commandId, delivered: true } } }) }, { id: 5, error: { message: 'host_callback_timeout' } }, { id: 8, ...content({ ...status, physical: { ...status.physical, storeClosed: true, unknown: true } }) }];
  const managed = { sourceThread: 'fixture-thread', sourceTurn: 'fixture-turn', item: { type: 'commandExecution', id: 'fixture-command-item', command: d.nodePath + ' original-client.js ' + d.packageHash, cwd: evidenceRoot, status: 'completed', exitCode: 0, output: { truncated: false, text: JSON.stringify({ proof: 'child_started', pid, packageHash: d.packageHash }) } } };
  const evidence = { 'context.json': JSON.stringify({ at: start, packageHash: d.packageHash, automaticNativeDispatch: false, recordContext: { purpose: 'technical_check', lifetime: 'ephemeral_check' } }), 'requests.jsonl': requests.map(canonical).join('\n') + '\n', 'stdio.raw.jsonl': replies.map(canonical).join('\n') + '\n', 'exit.jsonl': canonical({ at: end, code: 0, signal: null }) + '\n', 'original-managed-command-evidence.json': JSON.stringify(managed), 'original-receiver-journal.jsonl': fs.readFileSync(journal) };
  for (const [name, bytes] of Object.entries(evidence)) fs.writeFileSync(path.join(evidenceRoot, name), bytes);
  const provenance = path.join(evidenceRoot, 'provenance.json'), witness = { version: 1, evidenceOnly: true, authority: false, sourceThread: managed.sourceThread, sourceTurn: managed.sourceTurn, sourceCommandItem: managed.item.id, managedProcess: { pid, contextBeforeSpawn: start, endedByUtc: end, exitCode: 0, packageHash: d.packageHash }, installationId: d.installationId, receiverStoreIdentity: identity, journalHash: hash(fs.readFileSync(journal)), originalCommand: command, originalBinding: binding, observations: { preDispatchStatus: 2, contractReply: 3, definiteRefusal: 4, soleDispatchedRequest: 5, deliveredStatus: 6, postTimeoutStatus: 8, successfulNativeReads: 0, mutatingCommands: 0 }, files: Object.keys(evidence).map(file => ({ file, sha256: hash(fs.readFileSync(path.join(evidenceRoot, file))) })) };
  fs.writeFileSync(provenance, canonical(witness));
  const args = { descriptor, provenance, cepDir: plan.cepDir, config, evidenceRoot }, probes = { probePid: () => 'dead', probePort: () => 'absent', probeProcesses: async (_, __, paths) => ({ version: 1, matchedPids: [], pathsChecked: paths.length, observedAt: new Date().toISOString() }) };
  const pins = { packageHash: d.packageHash, installationId: d.installationId, executorHash: command.executorHash }, frame = { assetKey: 'project-inspection-v1', phase: 'inspect', typedPayload: {}, commandId: command.commandId, originalBinding: binding, pins };
  function bytes() { return Object.fromEntries([descriptor, config, journal, owner, path.join(d.installRoot, 'origin.json'), path.join(d.stateDir, 'origin.json'), ...caches.flatMap(identity => Object.keys(core.hashes).map(file => path.join(cacheRoot, 'core-' + identity, file))), ...Object.keys(pkg.files).filter(f => f.startsWith('cep/')).map(f => path.join(plan.cepDir, f.slice(4))), path.join(plan.cepDir, 'installation.js')].map(f => [f, fs.readFileSync(f).toString('base64')])); }
  return { directory, evidenceRoot, pkg, args, d, probes, witness, command, binding, pins, frame, journal, owner, broker, receiver, cacheRoot, caches, core, stalePkg, staleRelease, bytes, gates: [path.join(d.installRoot, 'install.lock'), path.join(broker, 'broker-owner.gate')] };
}
function raw(port, route, value) { return new Promise((resolve,reject)=>{const req=http.request('http://127.0.0.1:'+port+route,{method:'POST',agent:false,headers:{Origin:'file://','Content-Type':'application/json'}},res=>{let s='';res.on('data',b=>s+=b);res.on('end',()=>resolve({status:res.statusCode,value:JSON.parse(s)}));});req.on('error',reject);req.end(canonical(value));}); }
function mac(value,secret){return crypto.createHmac('sha256',secret).update(canonical(value)).digest('hex');}
async function recoveryFixture(){
  const f=fixture(),producerDriver=path.join(__dirname,'manual-capture-driver-source.txt'),inspection=path.join(f.evidenceRoot,'capture-inspection.json'),initial=await createCapture(f.probes).inspect(f.args);fs.writeFileSync(inspection,JSON.stringify({at:new Date().toISOString(),...initial},null,2)+'\n');
  const op=createCapture({...f.probes,port:0}),started=new Date().toISOString(),pending=op.capture({...f.args,expectedProofHash:initial.proofHash}),observed=pending.then(value=>({value}),error=>({error}));
  for(let n=0;n<1000&&!op.status().listening;n++){const out=await Promise.race([observed,new Promise(r=>setTimeout(()=>r(null),5))]);if(out)throw out.error||new Error('fixture_capture_ended');}
  const port=op.status().port,challenge=(await raw(port,'/challenge',{role:'panel'})).value,peerId='fixture-recovery';
  const linked=await raw(port,'/link',{challenge,peerId,proof:mac({challenge,peerId},f.d.panelToken)});if(linked.status!==200)throw new Error('fixture_link');
  const payload={commandId:f.command.commandId,originalBinding:f.binding,pins:f.pins,result:{readFailureVersion:1,outcome:'rejected',code:'host_registry_unavailable'}},body={epoch:challenge.epoch,peerId,sequence:1,method:'POST',path:'/complete',payload};
  const response=await raw(port,'/complete',{body,mac:mac(body,f.d.panelToken)});if(response.value.error!=='capture_recorded_no_ack')throw new Error('fixture_capture_no_ack');
  const result=await pending,capture=path.join(result.transaction,'receipt.json'),producerSession=path.join(f.evidenceRoot,'manual-live-fixture');fs.mkdirSync(producerSession);
  const meta={version:1,at:started,driverHash:hash(fs.readFileSync(producerDriver)),operatorHash:initial.proof.operatorHash,inspectionHash:hash(fs.readFileSync(inspection)),proofHash:initial.proofHash,packageHash:f.d.packageHash,descriptorHash:hash(fs.readFileSync(f.args.descriptor)),recordContext:{purpose:'technical_check',lifetime:'ephemeral_check',context:'original cached read receipt, one human button action'},globalTimeoutMs:600000,completionTimeoutMs:15000,automaticNativeDispatch:false,ackAllowed:false,authority:false};
  fs.writeFileSync(path.join(producerSession,'context.json'),JSON.stringify(meta,null,2)+'\n');
  // Supervisor endpoint label models the exact root output format; actual fixture
  // HTTP above is explicitly ephemeral and is not a production3457/live proof.
  fs.writeFileSync(path.join(producerSession,'stdout.raw.log'),canonical({event:'capture_listening',port:3457,proofHash:initial.proofHash,transaction:result.transaction,manualWaitMs:600000})+'\n'+canonical(result)+'\n');
  fs.writeFileSync(path.join(producerSession,'exit.json'),canonical({at:new Date().toISOString(),pid:333333331,code:0,signal:null})+'\n');
  const bundle=buildOperatorPackage(),operatorRoot=path.join(f.directory,'operator');writeOperatorPackage(operatorRoot,bundle);
  const candidate=structuredClone(buildPackage()),css=Buffer.from(candidate.files['cep/panel.css'],'base64').toString()+'\n/* recovery fixture candidate */\n';candidate.files['cep/panel.css']=Buffer.from(css).toString('base64');candidate.release.hashes['cep/panel.css']=hash(css);candidate.packageHash=hash(candidate.release);
  const packageFile=path.join(f.directory,'candidate.json');fs.writeFileSync(packageFile,canonical(candidate));
  const args={...f.args,capture,producerSession,producerDriver,inspection,package:packageFile,expectedPackageHash:candidate.packageHash};
  const config={operatorRoot,operatorHash:bundle.operatorHash,args};const fixtureFile=path.join(f.directory,'operator-fixture.json');fs.writeFileSync(fixtureFile,canonical(config));
  return {...f,capture,producerSession,producerDriver,inspection,operatorRoot,operatorHash:bundle.operatorHash,candidate,args,fixtureFile};
}
module.exports={recoveryFixture};
