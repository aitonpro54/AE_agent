"use strict";
// Bounded VM of the actual main-module getters and existing manual brand.
// Fixture frames are injected here only; production has no preparation issuer.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),crypto=require("node:crypto");
const {AsyncLocalStorage}=require("node:async_hooks"),m100Protocol=require("../mcp-server/m100-protocol");
const {createManualPlanIngress}=require("../mcp-server/cep-manual-plan-ingress");
const ownedTitlePlan=require("../mcp-server/owned-runtime-initial-title-plan");
const source=fs.readFileSync(path.join(__dirname,"../mcp-server/bridge-daemon.js"),"utf8"),begin=source.indexOf("function ownedRememberExecutionPreparation("),end=source.indexOf("function ownedReadonlyScriptPreparation(name)",begin);
assert(begin>=0&&end>begin);
function fixture(){
  const payload={kind:"agent_plan",plan:{targetProject:{file:"C:\\owned\\source.aep"},steps:[{tool:"enqueue_ame_title_variant",args:{sourceFile:"C:\\owned\\source.aep"}}]}};
  const proposal=m100Protocol.createActionProposalEnvelope({payload,preview:"owned fixture",risk:{level:"mutating"},confirmationSurface:"cep-panel"});
  const record={payload,proposal,actionId:proposal.actionId,payloadRef:proposal.action.payloadRef,revision:1,payloadHash:proposal.action.payloadHash,previewHash:proposal.action.previewHash,riskLevel:"mutating",riskPolicyVersion:proposal.confirmation.riskPolicyVersion,
    proposalExpiresAt:proposal.confirmation.proposalExpiresAt,confirmationSurface:"cep-panel",confirmedBySurface:"cep-panel",confirmationSessionId:"",confirmedAt:new Date().toISOString(),executionState:"executing",executionId:"run-fixture",
    confirmationTokenHash:m100Protocol.hashConfirmationToken(proposal.confirmation.confirmationToken),
    dryRunCompletedAt:new Date(Date.now()-1).toISOString(),dryRunReceipt:{payloadHash:proposal.action.payloadHash,contractVersion:"typed-autonomy.v2",stepCount:1,projectFile:"C:\\owned\\source.aep"},contractVersion:"typed-autonomy.v2",project:{expectedFile:"C:\\owned\\source.aep",actualFile:"C:\\owned\\source.aep"}};
  const manualPlanIngress=createManualPlanIngress(),ownedExecutionRunContext=new AsyncLocalStorage(),ownedExecutionPreparationContext=new AsyncLocalStorage(),ownedExecutionPreparationFrames=new WeakSet(),ownedExecutionPreparationFacts=new Map();
  let closed=false,current=record;const state={current:record,assertCurrent(value){assert.equal(value,current);assert.equal(closed,false);assert(Date.parse(value.proposalExpiresAt)>Date.now());}};
  const scope={Buffer,crypto,Object,JSON,Date,Map,WeakSet,ownedAmeContexts:new WeakMap(),ownedTitlePlan,initialRuntime:{assertIngress(){assert.equal(closed,false);}},trustedReadDaemon:{role:{}},ownedExecutionRunContext,ownedExecutionPreparationContext,ownedExecutionPreparationFrames,ownedExecutionPreparationFacts,
    currentProposalState:state,manualPlanIngress,m100Protocol,AUTONOMY_CONTRACT_VERSION:"typed-autonomy.v2",trustedExact:(value,keys)=>value&&typeof value==="object"&&!Array.isArray(value)&&Object.keys(value).sort().join(",")===keys.slice().sort().join(","),
    m100PlanRunLookupKey:args=>Object.fromEntries(["actionId","payloadHash","previewHash","riskLevel","riskPolicyVersion","confirmationToken","confirmedBySurface","confirmedBySession"].map(k=>[k,args&&args[k]||""])),ameManualQueue:{ROUTE:"/agents/ame/title-start/run"},ameManualQueueIssuer:{assertCapability(){throw Error("fixture_no_own_queue_cap");}}};
  vm.createContext(scope);new vm.Script(source.slice(begin,end)).runInContext(scope);
  const keys=Object.fromEntries(["actionId","payloadHash","previewHash","riskLevel","riskPolicyVersion"].map(k=>[k,record[k]]));
  const descriptor={purpose:"gates",request:{name:"enqueue_ame_title_variant",args:{...payload.plan.steps[0].args,...keys,payloadRef:record.payloadRef,ownedTitleOperation:"enqueue",variantSlot:1}},panel:{...keys,dryRun:false,confirm:true,confirmationToken:proposal.confirmation.confirmationToken,confirmedBySurface:"cep-panel"},panelRoute:"/agents/plan/run",slot:1,leaf:6,projectFile:record.project.expectedFile,projectRevision:11,manifestSha25664:"1".repeat(64),currentReadSha25664:"2".repeat(64),
    cleanSourcePreflight:{schema:"ae-agent.owned-native-clean-source-preflight.v1",callRef:"a".repeat(32),sourceFile:record.project.expectedFile,sourceSha25664:"3".repeat(64),revision:11,manifestSha25664:"1".repeat(64),currentReadSha25664:"2".repeat(64),checkpointFile:"C:\\owned\\snapshots\\checkpoint.aep",slot:1,leaf:6,checkpointCreated:false,unsavedStateCaptured:false,nativeAuthority:false}};
  const hash=value=>crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
  function retain(name){const prepared={...descriptor,purpose:"preparation",request:{name,args:{}}};delete prepared.panel;delete prepared.panelRoute;
    const frame={descriptor:prepared,descriptorSha25664:hash(prepared),completed:false};ownedExecutionPreparationFrames.add(frame);
    const proof=ownedExecutionPreparationContext.run(frame,()=>scope.ownedRememberExecutionPreparation(prepared,record,{ok:true,name}));return {proof,descriptor:prepared,frame};}
  const p=retain("propose_ai_agent_plan"),d=retain("run_ai_agent_plan");descriptor.proposalProof=p.proof;descriptor.dryRunProof=d.proof;
  const input=()=>({descriptor,descriptorSha25664:hash(descriptor)});
  async function run(callback,brand=true){return manualPlanIngress.runAuthenticated({route:"/agents/plan/run",authRole:"panel",key:keys},()=>{
    const context={source:"ai-plan-run",record,runId:"run-fixture",args:payload.plan.steps[0].args,autonomous:false,confirm:true,allowWithoutCheckpoint:false,stepCount:1,checkpoint:JSON.parse(JSON.stringify(descriptor.cleanSourcePreflight))};
    if(brand)manualPlanIngress.brand(context);return ownedExecutionRunContext.run(context,()=>callback(context));});}
  return {scope,record,descriptor,input,run,p,d,hash,close(){closed=true;},replace(){current={...record};state.current=current;}};
}
async function main(){const cases=[];async function check(name,callback){await callback();cases.push({name,result:"PASS"});}
  function buildInput(f){const facts={schema:ownedTitlePlan.FACTS_SCHEMA,sourceProject:{file:"C:\\owned\\source.aep",sha25664:"3".repeat(64)},
    baseline:{revision:11,graphSha25664:"1".repeat(64),rootCompItemId:1,variantCompItemId:1,controlled:[{id:11,contentSha25664:"4".repeat(64),enabled:true},{id:12,contentSha25664:"5".repeat(64),enabled:false}]},selectedTextLayerIDs:[11,12],
    variants:[1,2].map(slot=>({slot,variantId:"slot-"+slot,workingProjectFile:"C:\\owned\\snapshots\\working-"+slot+".aep",snapshotProjectFile:"C:\\owned\\snapshots\\slot-"+slot+".aep",outputFileName:"slot-"+slot+".mov",range:{startFrame:0,frameCount:8,fpsNumerator:25,fpsDenominator:1}})),ame:null};
    const descriptor={...f.p.descriptor,slot:0,leaf:4,request:{name:"build_solution_plan",args:{solutionId:"owned-runtime-two-title-fixed-v1"}},facts,callRef:"6".repeat(32),handlerRef:"7".repeat(32)};
    return {descriptor,descriptorSha25664:f.hash(descriptor)};}
  await check("actual_pure_finite_Build_producer_retains_eleven_rows_without_grant",()=>{const f=fixture(),input=buildInput(f),proof=f.scope.ownedTrustedExecutionPreparation(input);
    assert.equal(proof.result.fixedOperations.length,11);assert.equal(proof.result.nativeAuthority,false);assert.equal(proof.result.executionReady,false);assert.equal(proof.result.sourceOnly,true);
    assert(proof.result.fixedOperations.every(row=>row.status==="CLOSED"));assert(f.scope.ownedExecutionPreparationFacts.has(input.descriptorSha25664));});
  await check("Build_does_not_require_or_fabricate_M100_record",()=>{const f=fixture(),input=buildInput(f);f.scope.currentProposalState.current=null;
    const proof=f.scope.ownedTrustedExecutionPreparation(input);assert.equal(proof.result.ok,true);assert.equal(f.scope.ownedExecutionPreparationFacts.get(input.descriptorSha25664).record,null);});
  await check("Build_caller_plan_ready_and_foreign_solution_refused",()=>{for(const args of [{solutionId:"other"},{solutionId:"owned-runtime-two-title-fixed-v1",plan:{}},{solutionId:"owned-runtime-two-title-fixed-v1",ready:true}]){const f=fixture(),input=buildInput(f);input.descriptor.request.args=args;input.descriptorSha25664=f.hash(input.descriptor);assert.throws(()=>f.scope.ownedTrustedExecutionPreparation(input));}});
  await check("Build_foreign_facts_extra_provenance_refused",()=>{const f=fixture(),input=buildInput(f);input.descriptor.facts.ready=true;input.descriptorSha25664=f.hash(input.descriptor);assert.throws(()=>f.scope.ownedTrustedExecutionPreparation(input));});
  await check("own_retained_preparation_is_factual_only",()=>{const f=fixture(),out=f.scope.ownedTrustedExecutionPreparation({descriptor:f.p.descriptor,descriptorSha25664:f.hash(f.p.descriptor)});assert.equal(out.schema,"ae-agent.owned-execution-preparation-proof.v1");assert.equal(out.result.ok,true);});
  await check("same_own_manual_record_controller_panel_receipts_join",async()=>{const f=fixture();await f.run(()=>assert.equal(f.scope.ownedTrustedExecutionGates(f.input()).schema,"ae-agent.owned-execution-gate-proof.v1"));});
  await check("caller_preparation_json_cannot_create_private_frame",()=>{const f=fixture();assert.throws(()=>f.scope.ownedRememberExecutionPreparation(f.p.descriptor,f.record,{ok:true}));});
  await check("caller_ready_or_uncaptured_descriptor_cannot_create_preparation",()=>{const f=fixture();assert.throws(()=>f.scope.ownedTrustedExecutionPreparation({...f.input(),ready:true}));assert.throws(()=>f.scope.ownedTrustedExecutionPreparation({descriptor:f.p.descriptor,descriptorSha25664:"f".repeat(64)}));});
  await check("prepared_frame_cannot_be_reused",()=>{const f=fixture();assert.throws(()=>f.scope.ownedExecutionPreparationContext.run(f.p.frame,()=>f.scope.ownedRememberExecutionPreparation(f.p.descriptor,f.record,{ok:true})));});
  await check("manual_brand_is_required",async()=>{const f=fixture();await assert.rejects(f.run(()=>f.scope.ownedTrustedExecutionGates(f.input()),false));});
  await check("lost_source_refuses_before_publication",async()=>{const f=fixture();await f.run(()=>{f.close();assert.throws(()=>f.scope.ownedTrustedExecutionGates(f.input()));});});
  await check("current_record_identity_cannot_be_reconstructed",()=>{const f=fixture();f.replace();assert.throws(()=>f.scope.ownedTrustedExecutionPreparation({descriptor:f.p.descriptor,descriptorSha25664:f.hash(f.p.descriptor)}));});
  for(const field of ["actionId","payloadHash","previewHash","riskLevel","riskPolicyVersion"])await check("wrong_panel_"+field+"_refused",async()=>{const f=fixture();f.descriptor.panel[field]="foreign";await assert.rejects(f.run(()=>f.scope.ownedTrustedExecutionGates(f.input())));});
  await check("wrong_scope_receipt_refused",async()=>{const f=fixture();f.descriptor.slot=2;await assert.rejects(f.run(()=>f.scope.ownedTrustedExecutionGates(f.input())));});
  await check("original_panel_token_and_surface_join_are_required",async()=>{for(const key of ["confirmationToken","confirmedBySurface"]){const f=fixture();f.descriptor.panel[key]="forged";await assert.rejects(f.run(()=>f.scope.ownedTrustedExecutionGates(f.input())));}});
  await check("controller_actual_step_args_cannot_drift",async()=>{const f=fixture();f.descriptor.request.args.sourceFile="C:\\foreign\\other.aep";await assert.rejects(f.run(()=>f.scope.ownedTrustedExecutionGates(f.input())));});
  await check("native_clean_preflight_full_join_cannot_be_source_path_echo",async()=>{for(const key of ["sourceSha25664","callRef","slot","checkpointCreated"]){const f=fixture();await assert.rejects(f.run(()=>{f.descriptor.cleanSourcePreflight[key]="foreign";return f.scope.ownedTrustedExecutionGates(f.input());}));}});
  await check("controller_foreign_leaf_arg_and_scope_hint_are_refused",async()=>{for(const key of ["foreignLeafArg","ready","script","scopeHash","typedProducerHash","confirm","confirmationToken"]){const f=fixture();f.descriptor.request.args[key]="forged";await assert.rejects(f.run(()=>f.scope.ownedTrustedExecutionGates(f.input())));}});
  await check("controller_exact_scope_slot_and_payload_ref_are_required",async()=>{for(const key of ["ownedTitleOperation","variantSlot","payloadRef"]){const f=fixture();f.descriptor.request.args[key]="foreign";await assert.rejects(f.run(()=>f.scope.ownedTrustedExecutionGates(f.input())));}});
  await check("serialized_or_changed_receipt_refused",async()=>{const f=fixture();f.descriptor.proposalProof={...f.descriptor.proposalProof,result:{ok:true,forged:true}};await assert.rejects(f.run(()=>f.scope.ownedTrustedExecutionGates(f.input())));});
  await check("stale_dryrun_facts_refused",async()=>{const f=fixture();await f.run(()=>{f.record.dryRunReceipt={...f.record.dryRunReceipt,payloadHash:"f".repeat(64)};assert.throws(()=>f.scope.ownedTrustedExecutionGates(f.input()));});});
  await check("START_requires_original_protected_queue_cap",async()=>{const f=fixture();f.descriptor.leaf=7;f.descriptor.panelRoute="/agents/ame/title-start/run";await assert.rejects(f.run(()=>f.scope.ownedTrustedExecutionGates(f.input())));});
  return {schema:"ae-agent.execution-gate-source-proof.v1",cases,ok:true,fixturePrivateFrames:true,nativeFactoriesInvoked:0,actualEffects:0,actualNativeD46:false,productionAuthority:false,pureBuildProducerImplemented:true,mutatingPreparationProducerImplemented:false};
}
main().then(value=>process.stdout.write(JSON.stringify(value)+"\n"),error=>{process.stderr.write(error.stack+"\n");process.exitCode=1;});
