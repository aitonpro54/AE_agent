'use strict';
// Real TEMP files, loopback and named IPC. Native process/AE observations and
// logical canonical port are explicit fixtures; no installed reset or AE proof.
const nodeTest=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const{harness}=require('./fixtures/start-over-finisher'),{ownerEndpoint}=require('../runtime/client-entry'),{createIpcClient}=require('../runtime/client-ipc'),{canonical}=require('../protocol/json'),{mac}=require('../integrations/cep/peer-protocol');
const test=(name,fn)=>nodeTest('start-over-driver '+name,{timeout:180000},fn),domain='ae-core4/panel-start-over/v1';
async function until(fn){const end=Date.now()+15000;while(!await fn()){if(Date.now()>end)assert.fail('driver fixture wait expired');await new Promise(resolve=>setTimeout(resolve,10));}}
async function client(f){return createIpcClient({endpoint:ownerEndpoint(f.d),identity:{installationId:f.d.installationId,machineId:f.d.machineId,packageHash:f.d.packageHash},secret:f.d.controlToken,timeoutMs:20000});}
async function resetCall(f,action){const server=f.servers.find(s=>s.listening&&s.listenerCount('request')>0),port=server.fixtureActualAddress().port;
  function raw(route,value){return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path:route,method:'POST',agent:false,headers:{Host:'127.0.0.1:3457',Origin:'null','Content-Type':'application/json'}},res=>{let text='';res.on('data',b=>text+=b);res.on('end',()=>resolve({status:res.statusCode,value:JSON.parse(text)}));});req.on('error',reject);req.end(canonical(value));});}
  let input={action};if(action==='request'){const current=await resetCall(f,'status');input={action,expected:{ownerBootId:current.ownerBootId,id:current.id,sessionId:current.sessionId,...current.eligibility}};}
  const challenge=(await raw('/start-over/challenge',input)).value.challenge,reply=await raw('/start-over/'+action,{challenge,proof:mac({domain,kind:'request',challenge},f.d.panelToken)});assert.equal(reply.status,200,JSON.stringify(reply.value));assert.equal(reply.value.mac,mac({domain,kind:'response',body:reply.value.body},f.d.panelToken));return reply.value.body.status;
}
test('holds authenticated read-only endpoints while exact AE death is required, then uses one borrowed-endpoint finisher',async t=>{
  const ae={pid:42,birthTicks:'639292254253597850',executablePath:'C:\\AE\\AfterFX.exe'},f=await harness(t,{aeProcesses:[ae]}),before=fs.readFileSync(f.path('receiver/completions.ndjson'));f.setAEAlive(true);
  const driver=f.load('start-over-driver');assert.throws(()=>driver.borrowStartOverEndpoints({},f.options),e=>e.code==='start_over_driver_brand');
  const done=driver.continueStartOverStartup({installation:f.d,descriptorPath:f.descriptorPath});done.catch(()=>{});let c;
  await until(async()=>{try{c=await client(f);return true;}catch(e){if(e.code!=='ipc_endpoint_absent')throw e;return false;}});t.after(()=>c.close());
  await until(async()=>{const r=await c.call('core_status',{});return r.value.startOver.phase==='awaiting-ae';});
  const status=(await c.call('core_status',{})).value;assert.equal(status.ready,false);assert.equal(status.controllerAvailable,false);assert.equal(status.startOver.requiresAEExit,true);assert.equal(status.lifecycle.mode,'start-over');
  assert.equal((await c.call('controller_acquire',{})).code,'owner_recovery_required');assert.equal((await resetCall(f,'status')).id,f.result.id);
  assert.deepEqual(fs.readFileSync(f.path('receiver/completions.ndjson')),before);assert.equal(fs.existsSync(path.join(f.root,'install.lock')),false);assert.equal(fs.existsSync(path.join(f.directory,'archive-broker')),false);
  f.setAEAlive(false);const completed=await done;assert.equal(completed.resetCompleted,true);assert.equal(completed.id,f.result.id);assert.equal(completed.aeAuthority,false);
  assert.deepEqual(fs.readFileSync(path.join(f.directory,'archive-receiver/completions.ndjson')),before);assert.equal(JSON.parse(fs.readFileSync(f.path('work-session.json'))).body.baselineRequired,true);assert.equal(f.launches(),0);
});
test('post-claim fault stays read-only without retry; explicit panel continuation restarts the same intent after former writer death',async t=>{
  const f=await harness(t),driver=f.load('start-over-driver'),before=fs.readFileSync(f.path('receiver/completions.ndjson'));f.onceAfter('renameSync',from=>from===f.path('broker'));
  const first=driver.continueStartOverStartup({installation:f.d,descriptorPath:f.descriptorPath});first.catch(()=>{});let c;await until(async()=>{try{c=await client(f);return true;}catch(e){if(e.code!=='ipc_endpoint_absent')throw e;return false;}});t.after(()=>c.close());
  await until(async()=>{const r=await c.call('core_status',{});return r.value.startOver.phase==='blocked';});const probes=f.probes.length;await new Promise(resolve=>setTimeout(resolve,40));assert.equal(f.probes.length,probes);assert.equal(f.launches(),0);assert.equal(fs.existsSync(path.join(f.root,'install.lock')),true);
  const requested=await resetCall(f,'request');assert.equal(requested.id,f.result.id);assert.equal(requested.phase,'awaiting-core');await assert.rejects(first,e=>e.code==='start_over_driver_restarted');assert.equal(f.launches(),1);
  f.restart();const completed=await driver.continueStartOverStartup({installation:f.d,descriptorPath:f.descriptorPath});assert.equal(completed.id,f.result.id);assert.equal(completed.sessionId,f.result.newSessionId);assert.deepEqual(fs.readFileSync(path.join(f.directory,'archive-receiver/completions.ndjson')),before);
});
test('startup continues original crash-before-inventory without stopped receipt or a second reset',async t=>{
  const f=await harness(t,{noInventory:true}),before=fs.readFileSync(f.path('receiver/completions.ndjson')),driver=f.load('start-over-driver');
  assert.equal(fs.existsSync(path.join(f.directory,'stop-requested.json')),false);assert.equal(fs.existsSync(path.join(f.directory,'inventory.json')),false);
  const completed=await driver.continueStartOverStartup({installation:f.d,descriptorPath:f.descriptorPath});assert.equal(completed.resetCompleted,true);assert.equal(completed.id,f.result.id);assert.equal(fs.existsSync(path.join(f.directory,'continuation-inventory.json')),true);assert.deepEqual(fs.readFileSync(path.join(f.directory,'archive-receiver/completions.ndjson')),before);
});
