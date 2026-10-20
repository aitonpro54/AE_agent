"use strict";
// A dispatch receipt is not native queue acceptance or a reusable capability.
const crypto=require("node:crypto");
const MODE="async_once_v1",BUDGET_MS=600000,SCHEMA="ae-agent-ame-enqueue-pending.v1",marked=new WeakSet(),actions=new WeakSet();
const hash=v=>crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex"),uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const samePath=(a,b)=>typeof a==="string"&&typeof b==="string"&&a.replace(/\\/g,"/").toLowerCase()===b.replace(/\\/g,"/").toLowerCase(),sha=/^[a-f0-9]{64}$/;
function receipt(job,runId,args){return {schema:SCHEMA,runId,batchId:args.batchId,jobId:job.jobId,requestNonce:job.requestNonce,operationBinding:job.operationBinding,processBinding:job.processBinding,argsSha25664:hash(args),outputPath:job.outputPath};}
function isPendingDispatch(p,raw,runId,commands){
  try{
    const jobs=require("./ame-title-jobs"),a=jobs.validateInput(jobs.ENQUEUE,raw),r=p?.pendingReceipt;
    if(a.queueMode!=="shared_queue_v1"||a.enqueueTransport!==MODE||!uuid.test(runId||"")||!p||p.schema!==jobs.SCHEMA||p.code!=="enqueue_pending"||p.ok!==false||p.pending!==true||p.dispatchAccepted!==true||p.ownItemAccepted!==false||p.nativeAssociationVerified!==false||p.native!==null||p.unknownOutcome!==true||p.automaticRetryAllowed!==false||p.completionVerified!==false||p.mediaVerified!==false||p.state!=="awaiting_native_acceptance"||p.batchId!==a.batchId||!uuid.test(p.jobId||"")||!uuid.test(p.requestNonce||"")||!r||r.schema!==SCHEMA||r.runId!==runId||r.batchId!==p.batchId||r.jobId!==p.jobId||r.requestNonce!==p.requestNonce||r.argsSha25664!==hash(a)||r.operationBinding!==hash({operation:"enqueue",jobId:p.jobId,args:a})||r.outputPath!==p.outputPath)return false;
    if(!sha.test(r.processBinding||""))return false;
    const rows=(commands||[]).filter(c=>c.role==="mutation"),c=rows[0],n=c?.result,d=n?.asyncDispatch;let recorded=!!(n&&n.code==="async_pending"&&n.callback===null&&n.responseBody===null);
    if(n?.code==="result"&&n.callback==="result"&&typeof n.responseBody==="string"&&n.responseBody.length<=524288){const b=JSON.parse(n.responseBody);recorded=b.schema===jobs.NATIVE_SCHEMA&&b.code==="job_enqueued"&&b.requestNonce===p.requestNonce&&b.operationBinding===r.operationBinding&&b.appSpecifier===a.targetSpecifier&&b.job?.enqueueRequestNonce===p.requestNonce&&b.job.handleKey===p.jobId&&b.job.sourceGuid===a.sourceGuid&&samePath(b.job.sourcePath,a.sourceProjectFile)&&samePath(b.job.outputPath,p.outputPath)&&hash(b.job.range)===hash(a.range);}
    return rows.length===1&&c.executionId===runId&&c.state==="completed"&&c.ok===true&&uuid.test(c.id||"")&&n.schema==="ae-agent-ame-title-send.v1"&&recorded&&n.requestNonce===p.requestNonce&&d?.mode===MODE&&d.operation==="enqueue"&&d.batchId===p.batchId&&d.jobId===p.jobId&&d.requestNonce===p.requestNonce&&d.operationBinding===r.operationBinding&&d.processBinding===r.processBinding&&d.targetSpecifier===a.targetSpecifier&&d.budgetMs===BUDGET_MS&&d.sendInvoked===true&&n.transportDiagnostic?.sendMode==="async_no_wait"&&n.transportDiagnostic.pumpPerformed===false&&n.transportDiagnostic.sendAck===true;
  }catch(_){return false;}
}
function isPendingStep(step,run){const p=step?.result||step?.mutationResult;return !!(run&&run.dryRun===false&&step?.tool==="enqueue_ame_title_variant"&&p?.authorization?.runId===run.id&&p.authorization.proposalId===run.provenance?.actionId&&isPendingDispatch(p,step.args,run.id,step.commands));}
function isPendingRun(run){return !!(run&&run.pending===true&&run.ok===false&&run.failedCount===0&&!run.errorCode&&!run.error&&run.validation?.stepCount===1&&run.validation.steps?.length===1&&run.steps?.length===1&&isPendingStep(run.steps[0],run));}
function markProjection(value,run){if(isPendingRun(run))marked.add(value);return value;}
function actionOptions(value,run){if(isPendingRun(run))actions.add(value);return value;}
function isPendingStatus(p,raw){try{const j=require("./ame-title-jobs"),a=j.validateInput(j.STATUS,raw),r=p?.reconcileArgs;return p?.schema===j.SCHEMA&&p.ok===false&&p.code==="own_status_pending"&&p.pending===true&&p.readPending===true&&p.currentStatusObserved===false&&p.native===null&&p.batchId===a.batchId&&p.jobId===a.jobId&&uuid.test(p.requestNonce||"")&&r?.readTransport===MODE&&r.readRequestNonce===p.requestNonce&&r.batchId===a.batchId&&r.jobId===a.jobId;}catch(_){return false;}}
// Presentation only; this JSON-safe predicate is never an execution grant.
function isPendingPresentation(p){
  if(isPendingRun(p))return true;
  if(!p||p.ok!==false||p.pending!==true)return false;
  if(p.schema==="ae-agent-ame-title-jobs.v1"){
    if(p.code==="own_status_pending")return isPendingStatus(p,p.reconcileArgs);
    const r=p.pendingReceipt;return p.code==="enqueue_pending"&&p.ownItemAccepted===false&&p.nativeAssociationVerified===false&&p.native===null&&r?.schema===SCHEMA&&uuid.test(r.runId||"")&&p.authorization?.runId===r.runId&&uuid.test(p.jobId||"")&&r.jobId===p.jobId&&uuid.test(p.requestNonce||"")&&r.requestNonce===p.requestNonce;
  }
  const s=p.steps?.[0]?.resultRef,m=p.m100Message;
  return p.schema==="ae-agent-plan-run-summary.v1"&&p.steps?.length===1&&s?.pending===true&&s.ownItemAccepted===false&&s.pendingReceipt?.runId===p.id&&s.statusArgs?.jobId===s.jobId&&m?.messageType==="action_result"&&m.status==="completed"&&m.serverCreated===true&&m.result?.ok===false&&m.result.pending===true&&p.outcome?.mutation?.status==="unknown"&&p.outcome.verification?.status==="pending";
}
module.exports={MODE,BUDGET_MS,SCHEMA,receipt,isPendingDispatch,isPendingStep,isPendingRun,isPendingStatus,isPendingPresentation,markProjection,actionOptions,isMarkedAction:v=>!!v&&actions.has(v),isPendingResponse:v=>!!v&&(marked.has(v)||isPendingRun(v))};
