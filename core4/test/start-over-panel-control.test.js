'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const{createStartOverPanelControl,startOverEligibility,requestBinding}=require('../runtime/start-over-panel-control'),{mac}=require('../integrations/cep/peer-protocol');
const installation={installationId:'panel-reset-fixture',packageHash:'a'.repeat(64),panelToken:'b'.repeat(64),controlToken:'c'.repeat(64)},domain='ae-core4/panel-start-over/v1',id='10000000-0000-4000-8000-000000000001';
const bootId='10000000-0000-4000-8000-000000000002',owner={closed:false,frozen:false,pending:false,accepted:0,holderClientId:null,activity:{pending:false,unresolved:false,fault:false}};
const ready={id:null,sessionId:null,ownerBootId:bootId,phase:'ready',requiresAEExit:false,resetComplete:false,baselineRequired:false,fault:null,eligibility:{action:'request',reason:'start_over_ready'},aeAuthority:false};
function fixture(){let requests=0,current=ready;const control=createStartOverPanelControl({installation,status:()=>current,request:async()=>{requests++;current={...current,id,phase:'stopping',eligibility:{action:'none',reason:'start_over_in_progress'}};return current;}});return{control,requests:()=>requests,set:v=>current=v};}
async function challenge(f,action='request',origin='null',expected=requestBinding(ready)){return(await f.control.handle('/start-over/challenge',action==='request'?{action,expected}:{action},origin)).challenge;}
function signed(challenge,secret=installation.panelToken){return{challenge,proof:mac({domain,kind:'request',challenge},secret)};}
test('start-over-panel-control authenticates exact panel request and signs bounded status independently of peer state',async()=>{const f=fixture(),c=await challenge(f),r=await f.control.handle('/start-over/request',signed(c),'null');assert.equal(f.requests(),1);assert.equal(r.body.status.id,id);assert.equal(r.body.status.aeAuthority,false);assert.equal(r.mac,mac({domain,kind:'response',body:r.body},installation.panelToken));});
test('start-over-panel-control controlToken alone cannot reset and used nonce cannot be retried',async()=>{const f=fixture(),c=await challenge(f);await assert.rejects(f.control.handle('/start-over/request',signed(c,installation.controlToken),'null'),e=>e.code==='start_over_panel_auth_or_replay');await assert.rejects(f.control.handle('/start-over/request',signed(c),'null'),e=>e.code==='start_over_panel_auth_or_replay');assert.equal(f.requests(),0);});
test('start-over-panel-control status challenge never authorizes reset and status has no side effect',async()=>{const f=fixture(),c=await challenge(f,'status');await assert.rejects(f.control.handle('/start-over/request',signed(c),'null'),e=>e.code==='start_over_panel_auth_or_replay');const d=await challenge(f,'status');const r=await f.control.handle('/start-over/status',signed(d),'null');assert.equal(r.body.status.phase,'ready');assert.equal(f.requests(),0);});
test('start-over-panel-control nonce replay and another owner epoch cannot create a second request',async()=>{const f=fixture(),c=await challenge(f);await f.control.handle('/start-over/request',signed(c),'null');await assert.rejects(f.control.handle('/start-over/request',signed(c),'null'),e=>e.code==='start_over_panel_auth_or_replay');const next=fixture();await assert.rejects(next.control.handle('/start-over/request',signed(await challenge(f)),'null'),e=>e.code==='start_over_panel_auth_or_replay');assert.equal(f.requests(),1);assert.equal(next.requests(),0);});
test('start-over-panel-control exact origin and every challenge pin remain covered by role proof',async()=>{for(const mutate of[c=>c.origin='file://',c=>c.packageHash='0'.repeat(64),c=>c.installationId='foreign',c=>c.action='status',c=>c.role='control',c=>c.purpose='other']){const f=fixture(),c=structuredClone(await challenge(f));mutate(c);await assert.rejects(f.control.handle('/start-over/request',signed(c),'null'),e=>e.code==='start_over_panel_auth_or_replay');assert.equal(f.requests(),0);}const f=fixture();await assert.rejects(challenge(f,'request','https://example.invalid'),e=>e.code==='cep_origin_required');});
test('start-over-panel-control unknown routes have no handler and malformed/authority-bearing status refuses',async()=>{const f=fixture();assert.equal(await f.control.handle('/poll',{},'null'),null);await assert.rejects(f.control.handle('/start-over/challenge',{action:'request',skip:true},'null'),e=>e.code==='start_over_panel_schema');f.set({...f.control.status(),aeAuthority:true});assert.throws(()=>f.control.status(),e=>e.code==='start_over_panel_status');assert.equal(f.requests(),0);});
test('start-over-panel-control challenge storage stays bounded before any role-authenticated action',async()=>{const f=fixture();for(let i=0;i<16;i++)await challenge(f,'status');await assert.rejects(challenge(f),e=>e.code==='start_over_panel_backpressure');assert.equal(f.requests(),0);});
test('start-over-panel-control server separates baseline, unresolved, pending and stopped states',()=>{
  const facts={phase:'ready',ownerMode:'active',owner,maintenance:{requested:false}};
  const expect=(change,action,reason)=>assert.deepEqual(startOverEligibility({...facts,...change}),{action,reason});
  expect({},'request','start_over_ready');
  expect({phase:'baseline-required'},'none','start_over_baseline_required');
  expect({phase:'baseline-required',owner:{...owner,holderClientId:'old',activity:{...owner.activity,unresolved:true}}},'request','start_over_unresolved');
  expect({owner:{...owner,activity:{...owner.activity,pending:true}}},'none','start_over_command_pending');
  expect({owner:{...owner,accepted:1}},'none','start_over_command_pending');
  expect({owner:{...owner,holderClientId:'held'}},'none','start_over_controller_held');
  expect({ownerMode:'diagnostic',owner:{...owner,activity:{...owner.activity,unresolved:true,fault:true}}},'request','start_over_unresolved');
  expect({ownerMode:'stopped'},'none','start_over_owner_not_ready');
  expect({maintenance:{requested:true}},'none','start_over_owner_draining');
  expect({phase:'stopping'},'none','start_over_in_progress');
  expect({phase:'blocked',canContinue:true},'continue','start_over_in_progress');
});
test('start-over-panel-control refuses stale owner or work-session binding and rechecks the action',async()=>{
  const f=fixture();
  for(const expected of [{...requestBinding(ready),ownerBootId:id},{...requestBinding(ready),sessionId:id},{...requestBinding(ready),action:'continue'},{...requestBinding(ready),reason:'start_over_unresolved'}]){
    await assert.rejects(f.control.handle('/start-over/request',signed(await challenge(f,'request','null',expected)),'null'),e=>e.code==='start_over_binding_changed');
  }
  const c=await challenge(f);
  f.set({...ready,eligibility:{action:'none',reason:'start_over_command_pending'}});
  const status=(await f.control.handle('/start-over/status',signed(await challenge(f,'status')),'null')).body.status;
  await assert.rejects(f.control.handle('/start-over/request',signed(c),'null'),e=>e.code===status.eligibility.reason);
  assert.equal(f.requests(),0);
});
test('start-over-panel-control independent concurrent challenges cannot start a second reset',async()=>{
  const f=fixture(),a=await challenge(f),b=await challenge(f);
  const results=await Promise.allSettled([a,b].map(c=>f.control.handle('/start-over/request',signed(c),'null')));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.code,'start_over_binding_changed');
  assert.equal(f.requests(),1);
});
