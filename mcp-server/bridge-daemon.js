#!/usr/bin/env node
"use strict";

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { AsyncLocalStorage } = require("async_hooks");
const trustedSourceCensus=require("./owned-runtime-initial-source-census");
const deploymentMode = require("./deployment-mode").deploymentMode();
const initialRuntime = require("./owned-runtime-initial-runtime").createInitialRuntime();
const trustedNative=require("./owned-runtime-initial-native-client"),trustedObservers=require("./owned-runtime-initial-observers");
const trustedHttp=initialRuntime?require("./owned-runtime-initial-http-transport"):null;
const ownedTitlePlan=require("./owned-runtime-initial-title-plan");
const ownedUiBaseline=require("./owned-runtime-ui-baseline");
if(require.main===module && initialRuntime&&!trustedSourceCensus.requested())initialRuntime.assertStartup();
const trustedReadDaemon={role:null,target:null,cep:null,server:null,transport:null,heldPoll:null,pollWaiter:null,activeTool:null,projects:new Map(),serial:Promise.resolve(),closing:false,pump:null,
  targetWaiters:new Set(),requests:new Set(),inspectionResults:[],bootstrapStarted:false,initialNextSeen:false,startupCallbacks:0,startupCounts:new Map(),connection:null,pumpWork:null,dispositionError:null,drainAcknowledged:false,shutdownAcknowledged:false,
  manualPending:null,manualWaiter:null,checkpoint:null,cleanCopies:[null,null],restorationPrograms:[null,null],savedSnapshots:[null,null],ame:null,ameSources:[null,null],ameQueues:[null,null],ameJobs:[null,null]};
const autonomousCommandContext = new AsyncLocalStorage();
const evidenceContext = new AsyncLocalStorage();
const planCommandContext = new AsyncLocalStorage();
const coreMigrationOperationContext = new AsyncLocalStorage(),coreMigrationOperations=new WeakSet(),coreMigrationNativeWitnesses=new WeakMap();
const titleRecoveryCommandContext = new AsyncLocalStorage();
const titleVerificationCommandContext = new AsyncLocalStorage();
const ameJobSourceCommandContext = new AsyncLocalStorage();
const ameOpenCompCommandContext = new AsyncLocalStorage();
const scriptPreparationContext = new AsyncLocalStorage();
const ownedExecutionRunContext = new AsyncLocalStorage();
const ownedAmeContexts=new WeakMap(),ownedAmePreparations=new WeakMap(),ownedAmeAuthorizations=new WeakMap();
const ownedSharedQueueContexts=new WeakMap();
const ownedSharedQueueContextGuard=require("./owned-runtime-initial-shared-queue-context").createSharedQueueContextGuard({assertOriginal:context=>{
  const own=ownedSharedQueueContexts.get(context);if(!initialRuntime||trustedReadDaemon.executionProfile!=="shared_queue_v1"||!trustedReadDaemon.role||!own||!own.handler||!own.request||own.record!==context.record||ownedExecutionRunContext.getStore()!==context)trustedFail("owned_initial_original_shared_ingress_required");
  initialRuntime.assertIngress();currentProposalState.assertCurrent(context.record);
}});
function assertOwnedExecutionContext(context){if(productAmeContexts.has(context))return assertProductAmeContext(context);if(ownedSharedQueueContexts.has(context))return ownedSharedQueueContextGuard.assertContext(context);return manualPlanIngress.assertContext(context);}
function assertSharedQueueIngress(context,binding){
  if(productAmeContexts.has(context)){
    assertProductAmeContext(context);
    if(binding?.schema===ameSharedQueue.BINDING_SCHEMA){
      ameSharedQueue.validateBinding(binding);
      if(context.record.payload.plan.steps[0].tool!==ameTitleJobs.START || binding.batchId!==context.args.batchId || binding.targetSpecifier!==context.args.targetSpecifier ||
        binding.process.pid!==context.args.expectedProcess.pid || binding.process.startedAt!==context.args.expectedProcess.startedAt)throw Error("ame_product_shared_binding_changed");
      return true;
    }
    assertAmeTitleContext(context,binding);return true;
  }
  if(!ownedSharedQueueContexts.has(context))trustedFail("owned_initial_private_shared_ingress_required");assertOwnedExecutionContext(context);
  if(binding?.schema===ameSharedQueue.BINDING_SCHEMA){const own=ownedAmeContexts.get(context),queue=trustedReadDaemon.ameQueueFacts?.[1];if(!own||own.slot!==2||own.leaf!==7||!queue||m100Protocol.stableStringify(binding)!==m100Protocol.stableStringify(queue.value.manifest))trustedFail("owned_initial_exact_shared_binding_required");const debt=trustedNative.describeRestorationDebtFixed(trustedReadDaemon.role);if(debt.count||debt.inFlight||debt.unknown)trustedFail("owned_initial_shared_restoration_debt");return true;}
  return assertAmeTitleContext(context,binding);
}

const ownedAmeNativeDispatchPort=createOwnedAmeNativeDispatchPort();
const ownedExecutionPreparationContext = new AsyncLocalStorage();
const ownedFixedTitleProposals = new WeakMap();
const ownedFixedTitleManualReceipts = new WeakMap();
const ownedExecutionPreparationFrames = new WeakSet();
const ownedExecutionPreparationFacts = new Map();
const ownedReadonlyScriptPreparations = new WeakSet();
const panelBootstrapReadContext = new AsyncLocalStorage();
const placeholderMutationContext = new AsyncLocalStorage();
const placeholderPlanContext = new AsyncLocalStorage();
const lifecycleCommandContext = new AsyncLocalStorage();
const generatedRecoveryReadContext = new AsyncLocalStorage();
const reviewEvidence = require("./review-evidence");
const { buildRunOutcome } = require("./run-outcome");
const planRunRecords = require("./plan-run-records");
const planRunResponse = require("./plan-run-response");
const amePending=require("./ame-title-pending");
const ameTitleSeries = require("./ame-title-series").createSeries();
const toolErrorResponse = require("./tool-error-response");




const { createAutonomousSessionManager } = require("./autonomous-session");
const { CONTRACT_VERSION: AUTONOMY_CONTRACT_VERSION, createProposalState, obstacleEvent } = require("./proposal-state");
const currentProposalState = createProposalState();
const {waitForBridgeState, waitForPlanState} = require("./operation-wait");
const panelBootstrap = require("./ae-agent-panel-bootstrap");
const panelControl = require("./cep-panel-control");
const autonomousRepair = require("./autonomous-repair");





const { checkSolutionPlanPreflight, verifySolutionPlanReadBack } = require("./solution-plan-verification");

const { classifyAgentPlan } = require("./plan-risk-classifier");
const { repairAgentPlan } = require("./plan-repair");
const { buildSemanticVerification } = require("./semantic-verification");
const generatedSafety = require("./generated-safety-contracts");
const { waitForCompletePng, verifyCompletePngBuffer, resolveMaxBytes, sameFileSnapshot, DEFAULT_MAX_PNG_BYTES } = require("./generated-png-proof");
const m100Protocol = require("./m100-protocol");
const slideshowTools = require("./slideshow-tools");
const slideshowPlanBuilder = require("./slideshow-plan-builder");
const placeholderPlanBuilder = require("./placeholder-plan-builder");
const placeholderReadBack = require("./placeholder-readback");
const placeholderEvidence = require("./placeholder-evidence");
const placeholderSourceRecovery = require("./placeholder-source-recovery");
const placeholderProtection = require("./placeholder-protection");
const placeholderUsage = require("./placeholder-usage");
const placeholderGeometry = require("./placeholder-geometry");
const placeholderReviewService = require("./placeholder-review-service");
const placeholderVisualReview = require("./placeholder-visual-review");
const placeholderReviewTools = require("./placeholder-review-tools");
const placeholderVisualBatches = require("./placeholder-visual-batches");
const montageTools = require("./montage-tools");
const montagePipelineService = require("./montage-pipeline-service");
const montageCaptureService = require("./montage-capture-service");
const { buildCompVisualReviewPlanTool, buildCompVisualReviewPlan, validateCompVisualReviewInput } = require("./comp-visual-review-plan");
const compVisualReviewManifest = require("./comp-visual-review-manifest");
const projectLifecycleState = require("./project-lifecycle-state");
const projectLifecycleContract = require("./project-lifecycle-contract");
const projectLifecyclePlan = require("./project-lifecycle-plan");
const { createLifecycleBridgeAdapter } = require("./project-lifecycle-bridge-adapter");
const projectStateMemory = require("./project-state-store");
const projectStateController = projectStateMemory.createProjectStateController();
const projectSave = require("./project-save");
const nativeRenderVariant = require("./native-render-variant");
const titleExport = require("./title-export-snapshots");
const ameJobSource = require("./ame-job-source");
const ameOpenComp = require("./ame-open-comp");
const titleVerification = require("./title-export-verification");
const compDynamicLinkRead = require("./comp-dynamic-link-read");
const ameTransport = require("./ame-transport");
const amePresets = require("./ame-presets");
const ameRunning = require("./ame-running");
const ameQueueControl = require("./ame-queue-control");
const ameEnqueueSequence = require("./ame-enqueue-sequence");
const ameSavedSourceAdmission = require("./ame-saved-source-admission");
const ameSourceProbe = require("./ame-source-probe");
const manualPlanIngress = require("./cep-manual-plan-ingress").createManualPlanIngress();
const ameFixtureGrant = require("./ame-native-fixture-grant");
const ameFixtureRunner = require("./ame-native-fixture-runner");
const ameTitleJobs = require("./ame-title-jobs");
const ameManualQueue = require("./ame-manual-queue-grant");
const ameSharedQueue = require("./ame-shared-queue-grant");
const ameFixtureDisposition = require("./ame-fixture-ui-disposition");
const ameFixtureUIBackend = require("./ame-fixture-ui-backend");
const nativeFixtureAbandonment = require("./native-fixture-abandonment");
const nativeFixtureAbandonmentBackend = require("./native-fixture-abandonment-backend");
const nativeFixturePrephaseRecovery = require("./native-fixture-prephase-recovery");
const nativeFixtureAdmissionRefusal = require("./native-fixture-admission-refusal");
const nativeFixturePrephaseBackend = require("./native-fixture-prephase-recovery-backend");
const fixedGuardTimeoutMaintenanceProof = require("./fixed-guard-timeout-maintenance-proof");
const nativeFixturePrephaseProof = require("./native-fixture-prephase-recovery-proof");





const SERVER_NAME = "codex-ae-mcp-bridge";
const SERVER_VERSION = "3.3.5";
const PROTOCOL_VERSION = "2025-03-26";
const HOST = "127.0.0.1";
const PORT = initialRuntime ? 3456 : Number(process.env.AE_BRIDGE_PORT || 3456);
const TOKEN = initialRuntime ? "" : process.env.AE_BRIDGE_TOKEN || "";
const { createBoundary, readJsonObject, sanitizeAutomationResponse } = require("./http-boundary");
const httpBoundary = initialRuntime?createBoundary({}):createBoundary({automation: TOKEN, panel: process.env.AE_BRIDGE_PANEL_TOKEN,
  admin: process.env.AE_BRIDGE_ADMIN_TOKEN, adminEnabled: process.env.AE_BRIDGE_DEV_ADMIN === "1",
  origins: (process.env.AE_BRIDGE_ALLOWED_ORIGINS || "").split(",").filter(Boolean)});
const commandReceipt = require("./command-receipt");
const HTTP_BODY_LIMIT = Math.min(1024 * 1024, Math.max(256, Number(process.env.AE_BRIDGE_BODY_LIMIT_BYTES) || 1024 * 1024));
const COMMAND_TIMEOUT_MS = Number(process.env.AE_COMMAND_TIMEOUT_MS || 30000);
const AE_RESULT_RAW_PREVIEW_MAX = 500;
const PROJECT_ROOT = path.resolve(__dirname, "..");
// The initial branch never invokes the retained disk/Git diagnostic producer.
// Its loaded-source authority is established later by the own inspector/native
// gate; this ordinary identity remains a legacy diagnostic only.
const RUNTIME_IDENTITY = initialRuntime ? null : reviewEvidence.runtimeIdentity(PROJECT_ROOT);
const LOG_DIR = process.env.AE_BRIDGE_LOG_DIR ? path.resolve(process.env.AE_BRIDGE_LOG_DIR) : path.join(PROJECT_ROOT, "logs");
const LOG_FILE = path.join(LOG_DIR, "bridge-events.jsonl");
function recordAutonomyObstacle(input) {
  const event = obstacleEvent(input);
  try { fs.appendFileSync(path.join(LOG_DIR, "autonomy-obstacles.jsonl"), JSON.stringify(event) + "\n", "utf8"); return true; }
  catch (_error) { return false; }
}





const EDIT_SESSION_ACTIVE_FILE = path.join(LOG_DIR, "edit-session-active.json");
const EDIT_SESSION_LOG_FILE = path.join(LOG_DIR, "edit-sessions.jsonl");
const IDEMPOTENCY_LOG_FILE = path.join(LOG_DIR, "idempotency-results.jsonl");

const GENERATED_EXPORT_DIR = process.env.AE_AGENT_GENERATED_EXPORT_DIR
  ? path.resolve(process.env.AE_AGENT_GENERATED_EXPORT_DIR)
  : path.join(LOG_DIR, "generated-exports");
const GENERATED_RENDER_OUTPUT_DIR = process.env.AE_AGENT_GENERATED_RENDER_OUTPUT_DIR
  ? path.resolve(process.env.AE_AGENT_GENERATED_RENDER_OUTPUT_DIR)
  : path.join(LOG_DIR, "generated-renders");


const BACKUP_DIR = process.env.AE_BRIDGE_BACKUP_DIR ? path.resolve(process.env.AE_BRIDGE_BACKUP_DIR) : path.join(PROJECT_ROOT, "backups");
const projectSaveExecutor = projectSave.createProjectSaveExecutor({runExtendScriptBody:(body)=>runExtendScriptBody(body),
  createCheckpoint: async (request) => {
    ensureDir(BACKUP_DIR);
    const base = sanitizeFilenamePart(path.basename(request.sourceFile, ".aep"));
    const checkpointFile=path.join(BACKUP_DIR, `${base}-checkpoint-${sanitizeFilenamePart(request.label)}-${timestampForFilename(new Date())}.aep`);
    fs.copyFileSync(request.sourceFile,checkpointFile,fs.constants.COPYFILE_EXCL);
    const receipt={checkpointFile,sourceFile:request.sourceFile,label:request.label,snapshotScope:request.snapshotScope};
    recordEvent("project_save_checkpoint_created",receipt);
    return receipt;
  }});
const CHECKPOINT_SUFFIX = "-checkpoint";
const nativeRenderExecutor = nativeRenderVariant.createExecutor({
  stateDir:path.join(LOG_DIR,"native-title-render-attempts"), resolveOutputFilePath,
  runExtendScriptBody:(body,meta)=>withPlanCommandRole(meta.mutatesProject ? "mutation" : "readback",()=>runExtendScriptBody(body,meta.timeoutMs))
});
const ameRunningExecutor = ameRunning.createExecutor({
  stateDir: path.join(PROJECT_ROOT, ".codex-runtime", "ame-running"),
  inspectTransport: args => ameTransport.execute(args, runExtendScriptBody),
  assertServerProposalContext: context => {
    currentProposalState.assertCurrent(context && context.record);
    ameRunning.assertProposalContext(context, currentProposalState.current, AUTONOMY_CONTRACT_VERSION);
  },
  assertManualServerProposalContext: context => {
    currentProposalState.assertCurrent(context && context.record);
    manualPlanIngress.assertContext(context);
  }
});
const ameFixtureCheckpoints = new Map();
const ameQueueContexts = new WeakMap();
function brandAmeQueueContext(context, autonomous) {
  if (!autonomous) manualPlanIngress.brand(context);
  const sessionHash = autonomous && autonomous.sessionHash || null;
  ameQueueContexts.set(context, { record: context.record, sessionHash, fingerprint: productAmeFingerprint(context) });
  assertAmeQueueContext(context); return context;
}
function assertAmeQueueContext(context) {
  const row = ameQueueContexts.get(context), record = context && context.record;
  if (!row || row.record !== record || row.fingerprint !== productAmeFingerprint(context)) throw Error("ame_queue_current_runner_required");
  currentProposalState.assertCurrent(record);
  ameQueueControl.assertProposalContext(context, currentProposalState.current, AUTONOMY_CONTRACT_VERSION);
  if (context.autonomous) {
    const authority = autonomousSession.authorization();
    if (!productRuntimeCurrent() || !authority || authority.sessionHash !== row.sessionHash || record.confirmedBySurface !== "cep-autonomous-session" || record.confirmedBySession !== `session-${row.sessionHash}`) throw Error("ame_queue_current_autonomous_session_required");
  } else manualPlanIngress.assertContext(context);
}
const ameQueueExecutor = ameQueueControl.createExecutor({
  stateDir: path.join(LOG_DIR, "ame-global-starts"), inspectProcesses: ameRunning.inspectProcesses,
  inspectTransport: args => withPlanCommandRole("readback", () => ameTransport.execute(args, runExtendScriptBody)),
  runExtendScriptBody: (script, timeout, metadata) => withPlanCommandRole(metadata.mutating ? "mutation" : "readback", () => runExtendScriptBody(script, timeout)),
  assertServerProposalContext: assertAmeQueueContext,
  assertLegacyStartClear: binding => ameQueueControl.readLegacyStartBlockers(path.join(LOG_DIR, "ame-title-jobs"), binding),
  readRunRecord: id => planRunRecords.readRecord(LOG_DIR, id, { throwOnError: true }),
  inspectOwnCompletion: args => withPlanCommandRole("readback", () => ameTitleExecutor.inspectOwnCompletion(args)),
  inspectPausedGroup: args => withPlanCommandRole("readback",()=>ameTitleExecutor.inspectPausedGroup(args)),
  assertPausedGroup:(args,value)=>ameTitleExecutor.assertPausedGroup(args,value)
});
const ameEnqueueSequencer = ameEnqueueSequence.createSequence({
  stateDir: path.join(LOG_DIR, "ame-enqueue-sequences"), inspectProcesses: ameRunning.inspectProcesses,
  inspectTransport: args => withPlanCommandRole("readback", () => ameTransport.execute(args, runExtendScriptBody)),
  readRunRecord: id => planRunRecords.readRecord(LOG_DIR, id, { throwOnError: true })
});
async function readNativeFixturePrimaryLifecycle() {
  const result=await callToolLogged("native-fixture-admission-read","get_project_lifecycle_state",{});
  if(result.isError)throw Object.assign(new Error("fixture_prephase_primary_state_required"),{code:"fixture_prephase_primary_state_required"});
  return firstToolPayload(result);
}
async function readNativeFixturePrimaryBaseline(record) {
  currentProposalState.assertCurrent(record);manualPlanIngress.assertRequest(record);
  if(activeEditSession!==null)throw Object.assign(new Error("fixture_prephase_owned_protection_required"),{code:"fixture_prephase_owned_protection_required"});
  const primary=await readNativeFixturePrimaryLifecycle();
  currentProposalState.assertCurrent(record);manualPlanIngress.assertRequest(record);
  if(activeEditSession!==null)throw Object.assign(new Error("fixture_prephase_owned_protection_required"),{code:"fixture_prephase_owned_protection_required"});
  return nativeFixturePrephaseBackend.primaryProject(primary,record.project.expectedFile);
}
function rememberNativeFixtureProtection(context,run,primaryBaseline) {
  currentProposalState.assertCurrent(context.record);manualPlanIngress.assertContext(context);
  ameFixtureCheckpoints.set(context.runId,Object.freeze({record:context.record,run,checkpoint:context.checkpoint,
    ownedEditSessionId:run.safety.protection==="auto_edit_session" && activeEditSession && activeEditSession.id || null,primaryBaseline}));
}
const ameFixtureExecutor = ameFixtureRunner.createExecutor({
  repoRoot: PROJECT_ROOT, contractVersion: AUTONOMY_CONTRACT_VERSION,
  ownedRuntime:{renewAdmission:c=>ownedFixtureLifecycle.renewAdmission(c),assertAdmission:c=>ownedFixtureLifecycle.assertAdmission(c),registerLaunch:(c,v)=>ownedFixtureLifecycle.registerLaunch(c,v),prepareCleanup:j=>ownedFixtureLifecycle.prepareCleanup(j),finishCleanup:(j,v)=>ownedFixtureLifecycle.finishCleanup(j,v)},
  prephaseRecoveryReaders:()=>nativePrephaseReaders(),
  getCurrentRecord: () => currentProposalState.current,
  getCheckpoint: (record, runId) => {
    const entry = ameFixtureCheckpoints.get(runId);
    return entry && entry.record === record ? entry.checkpoint : null;
  },
  assertManualIngress: context => {
    currentProposalState.assertCurrent(context && context.record);
    manualPlanIngress.assertContext(context);
  }
});
const ameTitleMutationNames = new Set([ameTitleJobs.ENQUEUE, ameTitleJobs.START]);
const productAmeContexts=new WeakMap();
function productRuntimeCurrent(){return deploymentMode==="product" && ownedRuntimeStartup.managed && !panelControlUsesRetainedTransport();}
function productAmeFingerprint(context){return m100Protocol.stableStringify({payloadHash:context.record.payloadHash,runId:context.runId,args:context.args,checkpoint:context.checkpoint,ownedEditSessionId:context.ownedEditSessionId});}
function assertProductAmeContext(context){
  const row=productAmeContexts.get(context),record=context?.record,authority=autonomousSession.authorization();
  if(!row || !productRuntimeCurrent() || !authority || authority.sessionHash!==row.sessionHash || row.record!==record ||
    context.autonomous!==true || context.confirm!==true || context.allowWithoutCheckpoint!==false || context.args.queueMode!==ameSharedQueue.MODE ||
    record.confirmedBySurface!=="cep-autonomous-session" || record.confirmedBySession!==`session-${row.sessionHash}` ||
    row.fingerprint!==productAmeFingerprint(context) || record.payloadHash!==m100Protocol.sha256Payload(record.payload))throw Error("ame_product_current_runner_required");
  currentProposalState.assertExecution({actionId:record.actionId,executionId:context.runId,proposalExpiresAt:record.proposalExpiresAt});
  projectSave.verifyDryRunReceipt(record,context.stepCount,AUTONOMY_CONTRACT_VERSION);
  return true;
}
function brandAmeTitleContext(context,autonomous){
  if(!autonomous || !productRuntimeCurrent() || context.args.queueMode!==ameSharedQueue.MODE)return manualPlanIngress.brand(context);
  productAmeContexts.set(context,{record:context.record,sessionHash:autonomous.sessionHash,fingerprint:productAmeFingerprint(context)});
  assertProductAmeContext(context);return context;
}
const titleExportExecutor=titleExport.createExecutor({
  assertRunner:context=>{
    const record=context.record,authority=autonomousSession.authorization();
    if(!productRuntimeCurrent() || context.autonomous!==true || !authority || authority.sessionHash!==context.sessionHash || context.confirm!==true || context.allowWithoutCheckpoint!==false ||
      record.confirmedBySurface!=="cep-autonomous-session" || record.confirmedBySession!==`session-${context.sessionHash}`)throw Error("title_export_current_runner_required");
    currentProposalState.assertExecution({actionId:record.actionId,executionId:context.runId,proposalExpiresAt:record.proposalExpiresAt});
  },
  readNative:body=>withPlanCommandRole("readback",()=>autonomousCommandContext.run(null,()=>runExtendScriptBody(body))),
  writeNative:(body,timeout)=>withPlanCommandRole("mutation",()=>runExtendScriptBody(body,timeout)),
  persist:value=>{const context=planCommandContext.getStore();if(!context?.item || context.item.tool!==titleExport.TOOL)throw Error("title_export_run_record_required");context.item.exportSnapshots=JSON.parse(JSON.stringify(value));context.persist();}
});
const ameJobSourceExecutor=ameJobSource.createExecutor({
  stateDir:path.join(LOG_DIR,"ame-job-sources"),outputDir:path.join(GENERATED_EXPORT_DIR,"ame-job-sources"),wrap:wrapExtendScriptBody,
  readActor:()=>panelControlService.maintenanceTarget(),loadRecord:id=>planRunRecords.readRecord(LOG_DIR,id,{throwOnError:true}),
  assertRunner:context=>{
    const record=context.record,authority=autonomousSession.authorization();
    if(!productRuntimeCurrent()||context.confirm!==true||context.allowWithoutCheckpoint!==false)throw Error("ame_source_product_runner_required");
    if(context.autonomous===true){if(!authority||authority.sessionHash!==context.sessionHash||record.confirmedBySurface!=="cep-autonomous-session"||record.confirmedBySession!==`session-${context.sessionHash}`)throw Error("ame_source_current_authority_required");}
    else manualPlanIngress.assertContext(context);
    currentProposalState.assertExecution({actionId:record.actionId,executionId:context.runId,proposalExpiresAt:record.proposalExpiresAt});
    lifecycle.assertMutationAllowed();
    if(!activeEditSession||activeEditSession.id!==context.ownedEditSessionId)throw Error("ame_source_own_checkpoint_required");
  },
  native:(body,scope,mutation)=>ameJobSourceCommandContext.run(scope,()=>withPlanCommandRole(mutation?"mutation":"readback",()=>mutation?runExtendScriptBody(body,120000):autonomousCommandContext.run(null,()=>runExtendScriptBody(body,60000)))),
  persist:value=>{const context=planCommandContext.getStore();if(context?.item?.tool===ameJobSource.TOOL){context.item.ameJobSource=JSON.parse(JSON.stringify(value));context.persist();}}
});
const ameOpenCompExecutor=ameOpenComp.createExecutor({
  stateDir:path.join(LOG_DIR,"ame-open-comp"),outputDir:path.join(GENERATED_RENDER_OUTPUT_DIR,"ame-open-comp"),wrap:wrapExtendScriptBody,
  readActor:()=>panelControlService.maintenanceTarget(),inspectAeProcesses:ameOpenComp.inspectAeProcesses,inspectAmeProcesses:ameRunning.inspectProcesses,
  assertRunner:context=>{
    const record=context.record,authority=autonomousSession.authorization();
    if(!productRuntimeCurrent() || activeEditSession || context.protection!=="bounded_property_journal" || context.confirm!==true || context.allowWithoutCheckpoint!==false ||
      record.executionState!=="executing" || record.executionId!==context.runId || record.riskLevel!=="mutating" || record.payloadHash!==m100Protocol.sha256Payload(record.payload))throw Error("ame_open_current_product_runner_required");
    if(context.autonomous===true){
      if(!authority || authority.sessionHash!==context.sessionHash || record.confirmedBySurface!=="cep-autonomous-session" || record.confirmedBySession!==`session-${context.sessionHash}`)throw Error("ame_open_current_grant_required");
    }else{
      manualPlanIngress.assertRequest(record);
      if(context.source!=="ai-plan-run" || record.confirmationSurface!=="cep-panel" || record.confirmedBySurface!=="cep-panel" || !Number.isFinite(Date.parse(record.confirmedAt)) || Date.parse(record.confirmedAt)<Date.parse(record.dryRunCompletedAt))throw Error("ame_open_manual_ingress_required");
    }
    currentProposalState.assertExecution({actionId:record.actionId,executionId:context.runId,proposalExpiresAt:record.proposalExpiresAt});
    lifecycle.assertMutationAllowed();
  },
  native:(body,scope,mutation)=>ameOpenCompCommandContext.run(scope,()=>withPlanCommandRole(mutation?"mutation":"readback",()=>mutation?runExtendScriptBody(body,120000):autonomousCommandContext.run(null,()=>runExtendScriptBody(body,60000)))),
  persist:value=>{const context=planCommandContext.getStore();if(context?.item&&ameOpenComp.MUTATIONS.includes(context.item.tool)){context.item.ameOpenComp=JSON.parse(JSON.stringify(value));context.persist();}}
});
// Synchronous selector validation arms the mandatory enqueue guard before HTTP
// startup, including reconnect-triggered placeholder/protection background reads.
const titleExportRecovery=titleExportExecutor.createRecovery({
  root:LOG_DIR,loadRecord:id=>planRunRecords.readRecord(LOG_DIR,id,{throwOnError:true}),wrap:wrapExtendScriptBody,
  readActor:()=>panelControlService.maintenanceTarget(),
  readNative:(body,scope)=>titleRecoveryCommandContext.run(scope,()=>autonomousCommandContext.run(null,()=>runExtendScriptBody(body,30000))),
  commandSettled:id=>["completed","failed","expired_before_delivery"].includes(completedResults.get(id)?.lifecycleState)
});
const titleVerificationExecutor=titleExportExecutor.createVerification({
  root:LOG_DIR,loadRecord:id=>planRunRecords.readRecord(LOG_DIR,id,{throwOnError:true}),wrap:wrapExtendScriptBody,
  readActor:()=>panelControlService.maintenanceTarget(),
  assertProtection:context=>{
    lifecycle.assertMutationAllowed();
    if(pendingCommands.length||inflightCommands.size||activeEditSession&&activeEditSession.id!==context?.ownedEditSessionId)throw Error("title_verification_protection_not_idle");
    if(context&&(!activeEditSession||activeEditSession.id!==context.ownedEditSessionId))throw Error("title_verification_own_checkpoint_required");
  },
  assertRunner:context=>{
    const record=context.record,authority=autonomousSession.authorization();
    if(!productRuntimeCurrent()||context.autonomous!==true||!authority||authority.sessionHash!==context.sessionHash||context.confirm!==true||context.allowWithoutCheckpoint!==false||
      record.confirmedBySurface!=="cep-autonomous-session"||record.confirmedBySession!==`session-${context.sessionHash}`)throw Error("title_verification_current_runner_required");
    currentProposalState.assertExecution({actionId:record.actionId,executionId:context.runId,proposalExpiresAt:record.proposalExpiresAt});
  },
  readNative:(body,scope,mutation)=>titleVerificationCommandContext.run(scope,()=>withPlanCommandRole(mutation?"mutation":"readback",()=>mutation?runExtendScriptBody(body,120000):autonomousCommandContext.run(null,()=>runExtendScriptBody(body,30000))))
});
function assertAmeTitleContext(context, binding) {
  currentProposalState.assertCurrent(context && context.record);
  assertOwnedExecutionContext(context);
  const plan = context.record.payload && context.record.payload.plan;
  const steps = plan && plan.steps;
  const step = Array.isArray(steps) && steps.length === 1 && steps[0];
  if (context.args?.pendingGroupSize !== undefined) ameTitleSeries.assertDispatch(activeEditSession, ameTitleJobs.validateInput(ameTitleJobs.ENQUEUE, context.args), ameTitleSeriesActor(), context.runId);
  const own=ownedAmeContexts.get(context);
  if(own){if(!binding||!step||step.tool!=="run_ai_agent_plan"||![6,7].includes(own.leaf)||binding.name!==(own.leaf===6?ameTitleJobs.ENQUEUE:ameTitleJobs.START)||context.stepCount!==1||
      m100Protocol.stableStringify(step.args)!==m100Protocol.stableStringify(own.outerArgs)||m100Protocol.stableStringify(context.args)!==m100Protocol.stableStringify(own.args)||
      ameTitleJobs.operationArgsHash(binding.name,own.args)!==binding.argsHash||own.record!==context.record||!context.checkpoint||context.checkpoint.sourceFile!==context.record.project.expectedFile)trustedFail("owned_initial_exact_private_ame_context_required");return;}
  if (!binding || !step || context.stepCount !== 1 || !ameTitleMutationNames.has(binding.name) ||
      step.tool !== binding.name || ameTitleJobs.operationArgsHash(binding.name, step.args || {}) !== binding.argsHash ||
      ameTitleJobs.operationArgsHash(binding.name, context.args) !== binding.argsHash ||
      !context.checkpoint || context.checkpoint.sourceFile !== context.record.project.expectedFile) {
    throw Object.assign(new Error("ame_title_exact_manual_plan_required"), { code: "ame_title_exact_manual_plan_required" });
  }
}
const ameManualQueueIssuer = ameManualQueue.createManualQueueGrant({
  stateDir: path.join(LOG_DIR, "ame-title-jobs"),
  assertManualIngress: context => manualPlanIngress.assertContext(context),
  assertServerContext: context => assertAmeTitleContext(context, { name: ameTitleJobs.START, argsHash: ameTitleJobs.operationArgsHash(ameTitleJobs.START, context.args) }),
  assertPanelIdentity: meta => {const context=ownedExecutionRunContext.getStore(),own=ownedAmeContexts.get(context),pending=own?.pending;if(own&&own.leaf===7){if(!pending||pending!==trustedReadDaemon.manualPending||pending.error||!pending.started||pending.authRole!=="panel"||pending.route!==ameManualQueue.ROUTE)return false;const panel=ownedOriginalPreparationPanel(ownedFixedTitleManualReceipts.get(context.record)?.panel);return panel.panelConnectionId===meta.panelConnectionId&&panel.panelGeneration===meta.panelGeneration;}return Boolean(lastPanelInfo && Date.now() - lastPanelSeenAt < 10000 && lastPanelInfo.panelConnectionId === meta.panelConnectionId && lastPanelInfo.panelGeneration === meta.panelGeneration);}
});
const ameSharedQueueIssuer=ameSharedQueue.createSharedQueueGrant({stateDir:path.join(LOG_DIR,"ame-title-jobs"),assertSharedQueueIngress,assertServerContext:assertSharedQueueIngress});
const savedAmeSourceAdmission=ameSavedSourceAdmission.createAdmission({
  assertReady:context=>{
    if(!productRuntimeCurrent()||pendingCommands.length||inflightCommands.size||activeEditSession&&activeEditSession.id!==context?.ownedEditSessionId)throw Error("ame_saved_source_product_idle_required");
  },
  captureActor:()=>{
    if(!lastPanelInfo?.panelConnectionId||!lastPanelInfo.panelGeneration||Date.now()-lastPanelSeenAt>=10000)throw Error("ame_saved_source_current_panel_required");
    return {panelConnectionId:lastPanelInfo.panelConnectionId,panelGeneration:lastPanelInfo.panelGeneration};
  },
  readNative:body=>withPlanCommandRole("readback",()=>autonomousCommandContext.run(null,()=>runExtendScriptBody(body,30000)))
});
const ameSourceProbeExecutor=ameSourceProbe.createProbe({
  inspectProcesses:ameRunning.inspectProcesses,
  assertReady:()=>{if(!productRuntimeCurrent()||pendingCommands.length||inflightCommands.size||activeEditSession)throw Error("ame_source_probe_product_idle_required");},
  readNative:body=>withPlanCommandRole("readback",()=>autonomousCommandContext.run(null,()=>runExtendScriptBody(body,30000)))
});
const productAmeReadDispatchPort=require("./ame-product-read-dispatch").createProductReadDispatch({
  assertProduct:productRuntimeCurrent,
  dispatch:(script,timeout)=>withPlanCommandRole("readback",()=>runExtendScriptBody(script,timeout))
});
const productAmeDispatchPort=require("./ame-product-dispatch").createProductDispatch({assertProduct:productRuntimeCurrent,assertContext:assertProductAmeContext,
  savedSourceAdmission:savedAmeSourceAdmission,
  assertSavedSource:selector=>ameJobSourceExecutor.ownsSource(selector.sourcePath)?ameJobSourceExecutor.assertSavedSource(selector):titleExportExecutor.assertSavedSource(selector),
  dispatch:(script,timeout)=>withPlanCommandRole("mutation",()=>runExtendScriptBody(script,timeout))});
const ameDispatchPorts=new WeakMap();
const amePreparationPorts=new WeakMap();
function prepareAmeDispatch(method,selector,context){
  const port=productRuntimeCurrent()?productAmeDispatchPort:ownedAmeNativeDispatchPort;
  return Promise.resolve(port[method](selector,context)).then(cap=>{amePreparationPorts.set(cap,port);return cap;});
}
const ameNativeDispatchPort={
  authorize(metadata,context,preparation){
    const port=productRuntimeCurrent()?(metadata.mutating?productAmeDispatchPort:productAmeReadDispatchPort):ownedAmeNativeDispatchPort;
    const cap=port.authorize(metadata,context,preparation);ameDispatchPorts.set(cap,port);return cap;
  },
  assertAuthorization(cap,metadata,context){const port=ameDispatchPorts.get(cap);if(!port)throw Error("ame_dispatch_capability_required");return port.assertAuthorization(cap,metadata,context);},
  dispatch(cap,...args){const port=ameDispatchPorts.get(cap);if(!port)throw Error("ame_dispatch_capability_required");return port.dispatch(cap,...args);},
  prepareEnqueue(...args){return prepareAmeDispatch("prepareEnqueue",...args);},
  prepareStart(...args){return prepareAmeDispatch("prepareStart",...args);},
  assertPreparation(cap,...args){const port=amePreparationPorts.get(cap);if(!port)throw Error("ame_dispatch_preparation_required");return port.assertPreparation(cap,...args);}
  ,usesSavedSource(cap,context){const port=amePreparationPorts.get(cap);return port===productAmeDispatchPort && port.usesSavedSource(cap,context);}
  ,getSavedSourceGuard(cap,context){const port=amePreparationPorts.get(cap);return port===productAmeDispatchPort?port.getSavedSourceGuard(cap,context):null;}
};
const ameTitleExecutor = ameTitleJobs.createExecutor({
  stateDir: path.join(LOG_DIR, "ame-title-jobs"), inspectProcesses: ameRunning.inspectProcesses,
  preparePausedEnqueue:args=>withPlanCommandRole("readback",()=>ameQueueExecutor.preparePausedEnqueue(args)),
  readRunRecord:id=>planRunRecords.readRecord(LOG_DIR,id,{throwOnError:true}),
  assertNoSendRuntime:record=>{
    const runtime=record.run?.provenance?.runtime,modules=runtime?.modules||[],pin=name=>modules.find(m=>m.name===name)?.sha256;
    if(record.run?.steps?.[0]?.commands?.some(c=>c.result?.senderRefusal?.schema==="ae-agent-ame-title-sender-refusal.v1")){
      return require("./ame-title-sender-refusal-proof").assertRuntime(record);
    }
    // The legacy receipt did not hash product-dispatch. Its unchanged reviewed
    // blob is checked here, not retroactively claimed as a historical field.
    if(crypto.createHash("sha256").update(fs.readFileSync(path.join(__dirname,"ame-product-dispatch.js"))).digest("hex")!=="d457511285d51376c858a76d87fea1b50cb448c92fb452f1052e73df9e110142")return false;
    if(runtime?.gitCommit==="ece468020fe4372e208e39c429d7e7bfed3af1cf")return runtime.sourceSha256==="b1dae09117efbd12762590f4edf3d1306ab74d5f0637b3c9ae086e0af5754aa1"&&pin("mcp-server/bridge-daemon.js")==="b349f9861b338d21ec5d3f220c42e2a5d50d4f99a4dc88d645381dd17fcbbabd"&&pin("mcp-server/ame-title-jobs.js")==="61ab0c8b3322d94583e5b5d80b88cafade842b08a3f3781410900760e757371b"&&pin("mcp-server/plan-run-records.js")==="422d1240144bc91370bb937328305655ed40c39bde596dc20e2325ca584f89d4";
    if(runtime?.gitCommit==="64830927f8ceb3e8e1b94ebfc66a50e1bb95277d"&&runtime.sourceSha256==="ca8c0f7be7c15abb11db0e461926c6bc4a7e8b11604fe318954ffa1cea8e1bb9")
      return pin("mcp-server/bridge-daemon.js")==="8e80a40aa724910050e87cdd8b4aa286b0a7afd66dcc3636f219a87306c5160b"&&pin("mcp-server/ame-title-jobs.js")==="81fda2a55fa105aea681067031f8df8ef70635d2dff07ab0232dedefb79d95a1"&&pin("mcp-server/plan-run-records.js")===RUNTIME_IDENTITY.modules.find(m=>m.name==="mcp-server/plan-run-records.js")?.sha256;
    return runtime?.sourceSha256===RUNTIME_IDENTITY.sourceSha256&&["mcp-server/bridge-daemon.js","mcp-server/ame-title-jobs.js","mcp-server/plan-run-records.js"].every(name=>pin(name)===RUNTIME_IDENTITY.modules.find(m=>m.name===name)?.sha256);
  },
  assertPreSendGuardRecord:(record,command)=>{
    if(command.result?.senderRefusal?.schema==="ae-agent-ame-title-sender-refusal.v1"){
      if(fs.statSync(LOG_FILE).size>128*1024*1024)return false;
      const journal=fs.readFileSync(LOG_FILE,"utf8").split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
      return require("./ame-title-sender-refusal-proof").assertRecord(record,command,journal);
    }
    // One reviewed completed sender refusal; this never admits a delivered timeout.
    if(record.runId!=="04748598-91c9-44f8-b1c5-f6c76d2178b1"||command.id!=="8a52f4a1-a339-4be7-9c74-a9015e2bda85"||fs.statSync(LOG_FILE).size>128*1024*1024)return false;
    const rows=fs.readFileSync(LOG_FILE,"utf8").split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line)).filter(e=>e.type==="ae_command_queued"&&e.details?.runId===record.runId&&e.details.stepIndex===1),row=rows[0],d=row?.details;
    return rows.length===1&&d.id===command.id&&d.commandId===command.id&&d.actionId===record.run.provenance.actionId&&d.planSha256===record.run.provenance.planSha256&&d.scriptSha25664==="24a09eafe23ef14bb51ddae68bd5379b20af105fecd97eef6882b220a578c8a3"&&row.runtime?.sourceSha256===record.run.provenance.runtime.sourceSha256;
  },
  hasQueuedStep:runId=>{
    if(fs.statSync(LOG_FILE).size>128*1024*1024)throw Error("ame_not_sent_journal_budget");
    return fs.readFileSync(LOG_FILE,"utf8").split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line)).some(e=>e.type==="ae_command_queued"&&e.details?.runId===runId&&e.details.stepIndex===1);
  },
  resolveOutputFilePath,
  assertManualIngress: context => assertOwnedExecutionContext(context),
  assertServerContext: assertAmeTitleContext,
  manualQueueGrant: ameManualQueueIssuer,
  sharedQueueGrant: ameSharedQueueIssuer,assertSharedQueueIngress,
  // Product reads and exact autonomous shared-queue steps use the ordinary
  // runner; experimental generations retain their original native port.
  nativeDispatchPort: ameNativeDispatchPort,
  runExtendScriptBody: () => { throw Object.assign(new Error("ame_title_native_dispatch_port_unavailable"), { code: "ame_title_native_dispatch_port_unavailable" }); }
});
const ALLOW_SCRIPT_FILES_OUTSIDE_PROJECT = process.env.AE_ALLOW_SCRIPT_FILES_OUTSIDE_PROJECT === "1";
const STARTED_AT = Date.now();



const pendingCommands = [];
const inflightCommands = new Map();
const completedResults = new Map();
const waitingPanels = [];
// Transient delivery restrictions, never an execution grant or a durable release.
const generatedRecoveryScopes = new Map();
const generatedRecoveryByPanel = new Map();
const commonTitleRecovery = require("./common-title-assembly-recovery");
const humanGuardSettlement = require("./human-guard-settlement");
function recoveryReadAllowed(scope,tool){return scope?.profile===commonTitleRecovery.PROFILE ? tool===commonTitleRecovery.READ : ["get_project_info","get_comp_details"].includes(tool);}
async function reconcileCommonTitle(record,args){
  commonTitleRecovery.inputs(args);commonTitleRecovery.inspectRecord(record);
  const original=await panelControlService.readRecoveryLinkage(args.originalRequestId);
  commonTitleRecovery.validateLinkage(record,original.local,original.remote);commonTitleRecovery.idle(getBridgeStatus());
  const capsule=commonTitleRecovery.read(LOG_DIR,"capsule"),c=commonTitleRecovery.validateCapsule(capsule,record,original.local),maintenance=commonTitleRecovery.read(LOG_DIR,"maintenance"),selected=await panelControlService.maintenanceTarget(),panel=selected.state;
  if(!maintenance || maintenance.value.status!=="reload_authorized" || maintenance.value.capsuleSha256!==capsule.sha256 || c.configuration?.host!==HOST || c.configuration?.port!==PORT || c.configuration?.credentialIdentity!==crypto.createHash("sha256").update(TOKEN).digest("hex") || !panel || panel.panelInstanceId===c.oldPanelBinding.panelInstanceId || panel.bridgeConnection?.panelConnectionId!==c.panelConnectionId || commonTitleRecovery.hash(selected.installed.hashes)!==commonTitleRecovery.hash(maintenance.value.installed.hashes) || selected.installed.indexPath!==maintenance.value.installed.indexPath)throw new Error("common_title_maintenance_reload_unproven");
  const currentBinding={panelInstanceId:panel.panelInstanceId,panelLifecycleEpoch:panel.panelLifecycleEpoch,panelGeneration:panel.panelGeneration},connectionId=c.panelConnectionId;
  let scope=panel.recoveryTransport && generatedRecoveryScopes.get(panel.recoveryTransport.scopeId);
  if(!scope){
    if(panel.connected || panel.running || panel.recoveryTransport || generatedRecoveryByPanel.has(connectionId) || autonomousSession.publicStatus().desiredEnabled!==false || generatedRecoveryScopes.size>=32)throw new Error("common_title_recovery_transport_admission_invalid");
    const scopeId=crypto.randomUUID(),createdAt=Date.now();scope={scopeId,profile:commonTitleRecovery.PROFILE,state:"created",runId:args.runId,originalRequestId:args.originalRequestId,panelConnectionId:connectionId,currentBinding,nextBinding:{panelInstanceId:currentBinding.panelInstanceId,panelLifecycleEpoch:currentBinding.panelLifecycleEpoch+1,panelGeneration:"recovery-"+scopeId},createdAt,expiresAt:createdAt+300000};
    generatedRecoveryScopes.set(scopeId,scope);generatedRecoveryByPanel.set(connectionId,scopeId);
    return {schema:"ae-agent-plan-run-reconciliation.v1",runId:args.runId,status:"transport_prerequisite",reasonCode:"common_title_readonly_transport_required",steps:[],freshReconcileRequired:true,admissionGuardReleased:false,replayAllowed:false,transportPrerequisite:{schema:"ae-agent-common-title-transport-prerequisite.v1",profile:scope.profile,scopeId,runId:scope.runId,originalRequestId:scope.originalRequestId,...commonTitleRecovery.EXPECTED,currentBinding,nextBinding:scope.nextBinding,panelConnectionId:connectionId,createdAt:new Date(createdAt).toISOString(),expiresAt:new Date(scope.expiresAt).toISOString(),freshReconcileRequired:true,admissionGuardReleased:false,replayAllowed:false}};
  }
  if(scope.profile!==commonTitleRecovery.PROFILE || scope.state!=="ready" || scope.runId!==args.runId || scope.originalRequestId!==args.originalRequestId || generatedRecoveryByPanel.get(connectionId)!==scope.scopeId || Date.now()>=scope.expiresAt || reviewEvidence.sha256(scope.nextBinding)!==reviewEvidence.sha256(currentBinding) || lastPanelInfo?.panelConnectionId!==connectionId || lastPanelInfo?.panelGeneration!==scope.nextBinding.panelGeneration)throw new Error("common_title_recovery_transport_scope_invalid");
  const verifier=commonTitleRecovery.verifierScript(record),readerId=crypto.randomUUID(),body="var observation=(function(){"+verifier.body+"})();observation.readerId="+JSON.stringify(readerId)+";return observation;";
  const result=await generatedRecoveryReadContext.run({scopeId:scope.scopeId,runId:scope.runId,originalRequestId:scope.originalRequestId,tool:commonTitleRecovery.READ},()=>runExtendScriptBody(body,120000));
  commonTitleRecovery.idle(getBridgeStatus());
  if(Date.now()>=scope.expiresAt || generatedRecoveryScopes.get(scope.scopeId)!==scope || scope.state!=="ready")throw new Error("common_title_verification_context_expired");
  const retained=Array.from(completedResults.values()).filter(r=>r.ok===true && r.result?.readerId===readerId);
  if(retained.length!==1 || retained[0].command.leaseOwner?.panelConnectionId!==scope.panelConnectionId || retained[0].command.leaseOwner?.panelGeneration!==scope.nextBinding.panelGeneration)throw new Error("common_title_native_command_binding_missing");
  const latest=await panelControlService.readRecoveryLinkage(scope.originalRequestId);commonTitleRecovery.validateLinkage(record,latest.local,latest.remote);
  const envelope=commonTitleRecovery.adjudicate({record,local:latest.local,remote:latest.remote,native:result.result,runtime:RUNTIME_IDENTITY,command:{...retained[0].command,ok:retained[0].ok,receiptDigest:retained[0].receiptDigest,verifierDeliveryBodySha256:planRunRecords.digest(body)}});
  const existing=commonTitleRecovery.read(LOG_DIR,"recovery");if(existing){commonTitleRecovery.validateRecovery(existing,record,latest.local);const before={...existing.value.native},after={...result.result};delete before.readerId;delete after.readerId;if(reviewEvidence.sha256(before)!==reviewEvidence.sha256(after))throw new Error("common_title_stored_observation_drift");}
  const saved=existing || commonTitleRecovery.write(LOG_DIR,"recovery",envelope.value);
  return {schema:"ae-agent-plan-run-reconciliation.v1",runId:args.runId,status:"verified_current_state",steps:[],commonTitleAssemblyRecovery:saved,historicalExecutionOutcome:"unknown",admissionGuardReleased:false,replayAllowed:false};
}
const GENERATED_RECOVERY_SCOPE_TTL_MS = 120000;
const recentEvents = [];
const idempotencyRecords = new Map();
const rawExtendscriptDryRunApprovals = new Map();
const RAW_EXTENDSCRIPT_DRY_RUN_APPROVAL_TTL_MS = 10 * 60 * 1000;
let activeEditSession = null;

const AE_COMMAND_LIFECYCLE_STATES = [
  "queued",
  "expired_before_delivery",
  "leased",
  "submitted",
  "completed",
  "failed",
  "timed_out_after_submit",
  "stale_result_ignored"
];

const EFFECT_PRESETS = [
  {
    id: "fill",
    name: "Fill",
    matchName: "ADBE Fill",
    category: "color",
    description: "Recolors a layer with a single solid color.",
    notes: "Good first effect for validation because it is common and exposes a small property set.",
    propertyHints: [
      {
        name: "Color",
        matchName: "ADBE Fill-0002",
        propertyIndex: 3,
        valueType: "color",
        exampleValue: [1, 0, 0, 1],
        notes: "RGBA-like array in AE. Inspect with get_effect_details before setting in production."
      }
    ]
  },
  {
    id: "gaussian-blur",
    name: "Gaussian Blur",
    matchName: "ADBE Gaussian Blur 2",
    category: "blur",
    description: "Softens a layer with a standard Gaussian blur.",
    notes: "Use get_effect_details after adding it to confirm property names for the installed AE locale/version.",
    propertyHints: [
      {
        name: "Blurriness",
        valueType: "number",
        exampleValue: 25,
        notes: "Common first property on Gaussian Blur variants; inspect exact matchName before setting."
      },
      {
        name: "Repeat Edge Pixels",
        valueType: "boolean",
        exampleValue: true,
        notes: "Useful to avoid transparent/soft edges on full-frame blurs."
      }
    ]
  },
  {
    id: "fast-box-blur",
    name: "Fast Box Blur",
    matchName: "ADBE Box Blur2",
    category: "blur",
    description: "Fast blur effect often used for broad background softening.",
    notes: "Availability can vary by AE version; add_effect will report if the matchName is unavailable."
  },
  {
    id: "glow",
    name: "Glow",
    matchName: "ADBE Glo2",
    category: "stylize",
    description: "Adds glow around bright areas.",
    notes: "Property names vary enough that get_effect_details should be used before setting values."
  },
  {
    id: "tint",
    name: "Tint",
    matchName: "ADBE Tint",
    category: "color",
    description: "Maps black and white tones to two chosen colors.",
    notes: "Useful for simple two-color looks. Inspect property tree before setting map colors."
  },
  {
    id: "cc-wide-time",
    name: "CC Wide Time",
    matchName: "CC Wide Time",
    category: "time",
    description: "Time echo effect used by the onion-skinning typed contract.",
    notes: "Availability can vary by AE install; toggle_onion_skinning and add_effect report if it is unavailable."
  },
  {
    id: "slider-control",
    name: "Slider Control",
    matchName: "ADBE Slider Control",
    category: "expression-controls",
    description: "Adds a numeric slider effect for expression-driven controls.",
    notes: "Used by separate_shape_size_dimensions for generated rectangle/ellipse Size controls."
  },
  {
    id: "tritone",
    name: "Tritone",
    matchName: "ADBE Tritone",
    category: "color",
    description: "Maps shadows, midtones, and highlights to three colors.",
    notes: "Useful for graphic poster looks. Inspect exact properties on the target AE install."
  },
  {
    id: "curves",
    name: "Curves",
    matchName: "ADBE CurvesCustom",
    category: "color",
    description: "Advanced tonal curve adjustment.",
    notes: "Best inspected/read before automation; direct value setting can be less ergonomic than simple color effects."
  },
  {
    id: "levels",
    name: "Levels",
    matchName: "ADBE Easy Levels2",
    category: "color",
    description: "Adjusts black, white, gamma, and output levels.",
    notes: "Useful for practical tonal cleanup. Inspect property tree for exact controls."
  },
  {
    id: "drop-shadow",
    name: "Drop Shadow",
    matchName: "ADBE Drop Shadow",
    category: "perspective",
    description: "Adds a shadow offset behind a layer.",
    notes: "Common for titles and lower thirds; inspect details for opacity/distance/softness properties."
  },
  {
    id: "transform",
    name: "Transform",
    matchName: "ADBE Geometry2",
    category: "distort",
    description: "Adds effect-level transform controls independent from layer Transform.",
    notes: "Useful when layer transforms are already animated and an extra transform stack is needed."
  },
  {
    id: "displacement-map",
    name: "Displacement Map",
    matchName: "ADBE Displacement Map",
    category: "distort",
    description: "Displaces pixels using another layer as a map.",
    notes: "Requires layer references; inspect and set with care."
  },
  {
    id: "corner-pin",
    name: "Corner Pin",
    matchName: "ADBE Corner Pin",
    category: "distort",
    description: "Pins layer corners to four points.",
    notes: "Useful for screen replacements and perspective placement."
  }
];

function listEffectPresets(args) {
  const query = String(args.query || "").trim().toLowerCase();
  const category = String(args.category || "").trim().toLowerCase();
  const includeProperties = optionalBoolean(args, "includePropertyHints", true);
  const limit = Math.max(1, Math.min(100, Math.floor(optionalNumber(args, "limit", 50))));
  const categories = Array.from(new Set(EFFECT_PRESETS.map((preset) => preset.category))).sort();
  const matches = [];

  for (const preset of EFFECT_PRESETS) {
    if (category && preset.category !== category) continue;
    if (query) {
      const haystack = [
        preset.id,
        preset.name,
        preset.matchName,
        preset.category,
        preset.description,
        preset.notes
      ].join(" ").toLowerCase();
      if (!haystack.includes(query)) continue;
    }

    const item = {
      id: preset.id,
      name: preset.name,
      matchName: preset.matchName,
      category: preset.category,
      description: preset.description,
      notes: preset.notes
    };
    if (includeProperties && preset.propertyHints) {
      item.propertyHints = preset.propertyHints;
    }
    matches.push(item);
    if (matches.length >= limit) break;
  }

  return {
    query,
    category,
    categories,
    returned: matches.length,
    totalCatalogSize: EFFECT_PRESETS.length,
    workflow: [
      "Use add_effect with the matchName.",
      "Use get_effect_details with includeProperties=true to inspect exact property names, matchNames, and values.",
      "Use set_effect_property only after confirming the target property on the current AE version/project."
    ],
    presets: matches
  };
}

let lastPanelSeenAt = 0;
let lastPanelInfo = null;
let lastPanelPollLoggedAt = 0;
const autonomousSession = createAutonomousSessionManager({
  statePath: path.join(process.env.AE_BRIDGE_STATE_DIR || LOG_DIR, "autonomy-preference.json"),
  panelState: () => ({
    panelConnectionId: lastPanelInfo && lastPanelInfo.panelConnectionId || null,
    panelGeneration: lastPanelInfo && lastPanelInfo.panelGeneration || null,
    seenAt: lastPanelSeenAt
  })
});
// Registration restores fail-closed guards without creating a protection store.
const lifecycle = createLifecycleBridgeAdapter({
  proposals: currentProposalState,
  verifyDryRun: (record, count) => projectSave.verifyDryRunReceipt(record, count, AUTONOMY_CONTRACT_VERSION),
  readNative: (body, capability, timeoutMs) => {
    const facts = lifecycle.phaseFacts(capability);
    if (!facts) projectLifecycleContract.fail("lifecycle_phase_capability_required");
    return withPlanCommandRole(facts.readOnly ? "readback" : "mutation", () =>
      lifecycleCommandContext.run({capability, rawScript: body}, async () => {
        const native = await runExtendScriptBody(body, timeoutMs);
        if (!native || native.ok === false) projectLifecycleContract.fail("lifecycle_native_failed");
        return native;
      }));
  },
  sourceCheckpoint: async request => {
    ensureDir(BACKUP_DIR);
    const checkpointFile = path.join(BACKUP_DIR, `${sanitizeFilenamePart(path.basename(request.sourceFile, ".aep"))}-checkpoint-${sanitizeFilenamePart(request.label)}-${request.transitionId}-${crypto.randomUUID()}.aep`);
    fs.copyFileSync(request.sourceFile, checkpointFile, fs.constants.COPYFILE_EXCL);
    const descriptor = fs.openSync(checkpointFile, "r+");
    try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
    return {checkpointFile, sourceFile: request.sourceFile, label: request.label, snapshotScope: request.snapshotScope};
  },
  isIdle: ownedSessionId => inflightCommands.size === 0 && pendingCommands.length === 0 &&
    (!activeEditSession || activeEditSession.id === ownedSessionId),
  isBootstrapReadIdle: commandId => !activeEditSession &&
    !["confirmed", "executing"].includes(currentProposalState.current && currentProposalState.current.executionState) &&
    pendingCommands.every(id => id === commandId) && Array.from(inflightCommands.keys()).every(id => id === commandId),
  isRecoveryIdle: (pending, saved) => {
    if (inflightCommands.size !== 0 || pendingCommands.length !== 0 || activeEditSession && ![pending.authorization.ownedEditSessionId, saved && saved.ownedSessionId].filter(Boolean).includes(activeEditSession.id)) return false;
    const current = currentProposalState.current;
    if (current && ["confirmed", "executing"].includes(current.executionState) && (!saved || current !== saved.record || current.executionId !== saved.run.id)) return false;
    // Durable original outcome is evidence only; recovery never rewrites that run.
    const original = planRunRecords.readRecord(LOG_DIR, pending.authorization.runId);
    const run = original && original.run;
    return !!(run && run.dryRun === false && run.ok === false && run.finishedAt && Number.isFinite(Date.parse(run.finishedAt)) &&
      run.provenance && run.provenance.actionId === pending.authorization.actionId && projectLifecycleContract.canonicalPlanHash(run.provenance.payloadHash) === pending.authorization.payloadHash &&
      original.plan && original.plan.steps && original.plan.steps.length === 1 && original.plan.steps[0].tool === pending.operation &&
      projectLifecycleContract.hash(original.plan.steps[0].args) === projectLifecycleContract.hash(pending.args) &&
      !(run.steps || []).some(step => (step.commands || []).some(command => ["pending", "submitted", "inflight"].includes(command.state))));
  },
  retireContext: async (saved, hints) => {
    const permittedSessionIds = [saved.ownedSessionId, hints.authorization.ownedEditSessionId].filter(Boolean);
    if (activeEditSession && !permittedSessionIds.includes(activeEditSession.id)) projectLifecycleContract.fail("lifecycle_foreign_edit_session");
    if (activeEditSession) {
      const recoveringOriginal = hints.recovery && activeEditSession.id === hints.authorization.ownedEditSessionId;
      const finished = firstToolPayload(finishEditSession({outcome: recoveringOriginal ? "failed" : "completed", summary: `Lifecycle ${hints.transitionId}${recoveringOriginal ? "; original unknown delivery retained" : ""}`}));
      if (!finished || finished.finished !== true) projectLifecycleContract.fail("lifecycle_session_retirement_failed");
      saved.run.editSessionFinished = finished.session;
      saved.run.safety.editSessionFinished = true;
    }
    currentProposalState.retireLifecycle(saved.record, saved.run.id, hints.transitionId);
    idempotencyRecords.clear();
    autonomousSession.invalidateProjectContext();
    lastPanelInfo = null; lastPanelSeenAt = 0;
    return {sessionClosed: true, proposalRetired: true, cachesInvalidated: true, desiredEnabledPreserved: true};
  }
});

function log(message) {
  process.stderr.write(`[${SERVER_NAME}] ${message}\n`);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sanitizeForLog(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.length > 1000 ? `${value.slice(0, 1000)}...<truncated>` : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeForLog(item));
  }
  if (typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value).slice(0, 50)) {
      result[key] = sanitizeForLog(value[key]);
    }
    return result;
  }
  return value;
}

function recordEvent(type, details) {
  const context = evidenceContext.getStore() || {};
  const linked = {...context, ...(details || {})};
  if (/^ae_command_/.test(type) && linked.id) linked.commandId = linked.id;
  if (/^tool_call_/.test(type) && linked.id) linked.toolCallId = linked.id;
  const event = {
    eventId: crypto.randomUUID(),
    runtime: { port: PORT, pid: process.pid, gitCommit: RUNTIME_IDENTITY.gitCommit, sourceSha256: RUNTIME_IDENTITY.sourceSha256 },
    at: new Date().toISOString(),
    type,
    details: sanitizeForLog(linked)
  };

  recentEvents.push(event);
  if (recentEvents.length > 200) recentEvents.shift();

  try {
    ensureDir(LOG_DIR);
    fs.appendFileSync(LOG_FILE, `${JSON.stringify(event)}\n`, "utf8");
  } catch (error) {
    log(`Could not write event log: ${error.message}`);
  }
}

function appendJsonl(file, event) {
  try {
    ensureDir(path.dirname(file));
    fs.appendFileSync(file, `${JSON.stringify(event)}\n`, "utf8");
  } catch (error) {
    log(`Could not write ${path.basename(file)}: ${error.message}`);
  }
}



function tailJsonl(file, limit) {
  if (!fs.existsSync(file)) return [];
  const maxBytes = 1024 * 1024;
  const stat = fs.statSync(file);
  const start = Math.max(0, stat.size - maxBytes);
  const fd = fs.openSync(file, "r");
  try {
    const buffer = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    return buffer
      .toString("utf8")
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (_error) {
          return { malformed: true, line };
        }
      });
  } finally {
    fs.closeSync(fd);
  }
}

function readJsonFile(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJsonFileAtomic(file, value) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, file);
}







function appendEditSessionEvent(type, details) {
  const event = {
    at: new Date().toISOString(),
    type,
    ...details
  };
  try {
    ensureDir(LOG_DIR);
    fs.appendFileSync(EDIT_SESSION_LOG_FILE, `${JSON.stringify(event)}\n`, "utf8");
  } catch (error) {
    log(`Could not write edit session log: ${error.message}`);
  }
  recordEvent(`edit_${type}`, details);
}

function compactEditSession(session) {
  if (!session) return null;
  const latestOperation = session.operations && session.operations.length
    ? session.operations[session.operations.length - 1]
    : null;
  return {
    id: session.id,
    label: session.label || null,
    status: session.status,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt || session.startedAt,
    finishedAt: session.finishedAt || null,
    outcome: session.outcome || null,
    checkpoint: compactCheckpoint(session.checkpoint),
    ameTitleSeries: session.ameTitleSeries || null,
    operationCount: Array.isArray(session.operations) ? session.operations.length : 0,
    latestOperation: latestOperation ? {
      id: latestOperation.id,
      at: latestOperation.at,
      tool: latestOperation.tool,
      ok: latestOperation.ok,
      target: latestOperation.target || null
    } : null
  };
}

function loadActiveEditSession() {
  try {
    const session = readJsonFile(EDIT_SESSION_ACTIVE_FILE);
    if (!session || session.status !== "active") return null;
    if (!Array.isArray(session.operations)) session.operations = [];
    return session;
  } catch (error) {
    log(`Could not load active edit session: ${error.message}`);
    return null;
  }
}

function persistActiveEditSession() {
  if (!activeEditSession) return;
  writeJsonFileAtomic(EDIT_SESSION_ACTIVE_FILE, activeEditSession);
}

function clearActiveEditSession() {
  try {
    if (fs.existsSync(EDIT_SESSION_ACTIVE_FILE)) {
      fs.unlinkSync(EDIT_SESSION_ACTIVE_FILE);
    }
  } catch (error) {
    log(`Could not remove active edit session file: ${error.message}`);
  }
}

function editSessionText(args, name, fallback, maxLength) {
  const value = optionalString(args, name, fallback);
  const normalized = String(value || "").trim();
  return normalized.slice(0, maxLength);
}

function editSessionDetails(session, limit) {
  const operations = Array.isArray(session.operations) ? session.operations : [];
  const max = Math.max(1, Math.min(500, Math.floor(limit || operations.length || 1)));
  return {
    ...session,
    operationCount: operations.length,
    operations: operations.slice(-max)
  };
}

async function startEditSession(args, onCreated) {
  if (activeEditSession) {
    return toolResult({
      started: false,
      error: "An edit session is already active.",
      activeEditSession: compactEditSession(activeEditSession)
    }, true);
  }

  const label = editSessionText(args, "label", "", 120) || `edit-session-${timestampForFilename(new Date())}`;
  const notes = editSessionText(args, "notes", "", 1000) || null;
  let copied;
  try {
    copied = await copySavedProjectFile(`session-${label}`, "checkpoint");
  } catch (error) {
    recordEvent("edit_session_start_failed", { label, error: error.message || String(error) });
    return toolResult({
      started: false,
      label,
      error: error.message || String(error)
    }, true);
  }

  const now = new Date().toISOString();
  activeEditSession = {
    id: crypto.randomUUID(),
    label,
    notes,
    status: "active",
    startedAt: now,
    updatedAt: now,
    checkpoint: {
      label: copied.label,
      sourceFile: copied.sourceFile,
      checkpointFile: copied.destinationFile,
      bytes: copied.bytes,
      createdAt: copied.createdAt,
      project: copied.project,
      triggeredBy: "start_edit_session"
    },
    operations: []
  };
  if (onCreated) onCreated(activeEditSession);

  persistActiveEditSession();
  appendEditSessionEvent("session_started", {
    session: compactEditSession(activeEditSession)
  });

  return toolResult({
    started: true,
    activeFile: EDIT_SESSION_ACTIVE_FILE,
    sessionsLogFile: EDIT_SESSION_LOG_FILE,
    session: editSessionDetails(activeEditSession)
  });
}

function getEditSessionStatus(args) {
  const limit = Math.max(1, Math.min(500, Math.floor(optionalNumber(args, "operationLimit", 100))));
  return toolResult({
    active: Boolean(activeEditSession),
    activeFile: EDIT_SESSION_ACTIVE_FILE,
    sessionsLogFile: EDIT_SESSION_LOG_FILE,
    session: activeEditSession ? editSessionDetails(activeEditSession, limit) : null
  });
}

function listEditSessions(args) {
  const limit = Math.max(1, Math.min(200, Math.floor(optionalNumber(args, "limit", 50))));
  const events = tailJsonl(EDIT_SESSION_LOG_FILE, Math.max(200, limit * 20));
  const sessionsById = new Map();

  for (const event of events) {
    if (!event || !event.session || !event.session.id) continue;
    sessionsById.set(event.session.id, {
      ...(sessionsById.get(event.session.id) || {}),
      ...event.session,
      lastEventAt: event.at,
      lastEventType: event.type
    });
  }

  if (activeEditSession) {
    sessionsById.set(activeEditSession.id, {
      ...(sessionsById.get(activeEditSession.id) || {}),
      ...compactEditSession(activeEditSession),
      lastEventType: "active"
    });
  }

  const sessions = Array.from(sessionsById.values())
    .sort((a, b) => String(b.finishedAt || b.updatedAt || b.startedAt || "").localeCompare(String(a.finishedAt || a.updatedAt || a.startedAt || "")))
    .slice(0, limit);

  return toolResult({
    active: Boolean(activeEditSession),
    activeEditSession: compactEditSession(activeEditSession),
    sessionsLogFile: EDIT_SESSION_LOG_FILE,
    sessions
  });
}

function finishEditSession(args, expectedSessionId) {
  if (!activeEditSession) {
    return toolResult("No edit session is active.", true);
  }
  if (expectedSessionId && activeEditSession.id !== expectedSessionId || activeEditSession.ameTitleSeries && activeEditSession.id !== expectedSessionId) return toolResult({code:"edit_session_owner_changed",error:"Текущая edit session не принадлежит завершаемому run."},true);

  const outcome = editSessionText(args, "outcome", "completed", 80) || "completed";
  const summary = editSessionText(args, "summary", "", 2000) || null;
  const finished = {
    ...activeEditSession,
    status: "finished",
    outcome,
    summary,
    finishedAt: new Date().toISOString()
  };
  finished.updatedAt = finished.finishedAt;

  appendEditSessionEvent("session_finished", {
    session: compactEditSession(finished)
  });
  activeEditSession = null;
  clearActiveEditSession();

  return toolResult({
    finished: true,
    active: false,
    session: editSessionDetails(finished)
  });
}

function planRunSessionLabel(run) {
  return `ai-plan-${String(run.id || crypto.randomUUID()).slice(0, 8)}`;
}

function isUnsavedProjectError(message) {
  return String(message || "").indexOf("has not been saved") >= 0;
}

async function startPlanRunEditSession(run, validation) {
  const label = planRunSessionLabel(run);
  let created = null, result;
  try { result = await startEditSession({label,notes: `AI plan run ${run.id} with ${validation.mutatingCount} mutating step(s).`}, session => {created=session;}); }
  catch (error) {
    if (created && activeEditSession === created) finishEditSession({outcome:"needs-review",summary:"Edit-session preparation failed before dispatch."},created.id);
    return {ok:false,rawError:error.message,error:error.message,saveProjectFirst:false,payload:null,ownedSession:null};
  }
  const payload = firstToolPayload(result);
  if (result.isError || !payload || payload.started !== true) {
    const rawError = operationErrorFromPayload(payload) || "Could not start an edit session.";
    return {
      ok: false,
      payload,
      rawError,
      saveProjectFirst: isUnsavedProjectError(rawError),
      error: isUnsavedProjectError(rawError)
        ? "Save the After Effects project first, then run the mutating plan again."
        : rawError
    };
  }

  return {
    ok: true,
    ownedSession: created,
    payload,
    session: payload.session || null,
    checkpoint: payload.session && payload.session.checkpoint
      ? compactCheckpoint(payload.session.checkpoint)
      : null
  };
}

function finishPlanRunEditSession(run, expectedSessionId = run.editSession && run.editSession.id) {
  const hasIssue = run.failedCount > 0 || run.ok === false || run.steps.some((step) => step.status === "blocked" || step.status === "failed");
  const result = finishEditSession({
    outcome: hasIssue ? "needs-review" : "completed",
    summary: `AI plan run ${run.id} ${hasIssue ? "finished with issues" : "completed"}.`
  }, expectedSessionId);
  const payload = firstToolPayload(result);
  if (result.isError) {
    const error = operationErrorFromPayload(payload) || "Could not finish the auto edit session.";
    run.warnings = run.warnings || [];
    run.warnings.push(error);
    if (run.safety) run.safety.finishError = error;
    return null;
  }
  return payload;
}

function ameTitleSeriesActor() {
  const authority = autonomousSession.authorization();
  if (!productRuntimeCurrent() || !authority || !lastPanelInfo?.panelConnectionId || !lastPanelInfo.panelGeneration || Date.now()-lastPanelSeenAt>=10000) throw m100ProtocolError("ame_title_series_current_actor_required", "Серия требует текущую доверенную панель и автономную сессию.");
  return {instanceId:currentProposalState.snapshot().instanceId,panelConnectionId:lastPanelInfo.panelConnectionId,panelGeneration:lastPanelInfo.panelGeneration,lifecycleEpoch:lifecycle.epoch(),sessionHash:authority.sessionHash};
}

function preflightAmeTitleSeries(plan) {
  if (!activeEditSession?.ameTitleSeries && !require("./ame-title-series").select(plan)) return null;
  return ameTitleSeries.preflight(activeEditSession, plan, ameTitleSeriesActor());
}

function firstToolPayload(result) {
  if (!result || !Array.isArray(result.content) || !result.content.length) return null;
  return parseToolText(result.content[0].text);
}

function operationErrorFromPayload(payload) {
  if (payload === null || payload === undefined) return null;
  if (typeof payload === "string") return payload;
  if (payload && typeof payload === "object") {
    return payload.error || payload.message || null;
  }
  return String(payload);
}

function trackEditSessionOperation(details) {
  if (!activeEditSession || !MUTATION_SUMMARY_TOOL_NAMES.has(details.name)) return;

  try {
    const payload = firstToolPayload(details.result);
    const mutation = payload && typeof payload === "object" ? payload.mutation || null : null;
    const operation = {
      id: details.eventId,
      at: new Date().toISOString(),
      source: details.source,
      tool: details.name,
      ok: Boolean(details.ok),
      durationMs: details.durationMs,
      target: mutation && mutation.target ? mutation.target : inferMutationTarget(details.name, details.args || {}, payload),
      mutation: mutation || null
    };

    const checkpoint = mutation && mutation.checkpoint
      ? mutation.checkpoint
      : payload && typeof payload === "object" && payload.checkpoint
        ? compactCheckpoint(payload.checkpoint)
        : null;
    if (checkpoint) operation.checkpoint = checkpoint;

    if (!details.ok) {
      operation.error = details.error || operationErrorFromPayload(payload) || "Tool call failed.";
    }

    activeEditSession.operations.push(operation);
    activeEditSession.updatedAt = operation.at;
    persistActiveEditSession();
    appendEditSessionEvent("session_operation", {
      session: compactEditSession(activeEditSession),
      operation
    });
  } catch (error) {
    recordEvent("edit_session_operation_track_failed", {
      tool: details.name,
      error: error.message || String(error)
    });
  }
}

function getBridgeStatus() {
  const now = Date.now();
  return {
    ok: true,
    server: SERVER_NAME,
    version: SERVER_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    m100RiskPolicy: m100RiskPolicyStatus(),
    aeCommandLifecycleStates: AE_COMMAND_LIFECYCLE_STATES.slice(),
    host: HOST,
    port: PORT,
    uptimeMs: now - STARTED_AT,
    startedAt: new Date(STARTED_AT).toISOString(),
    humanGuardRuntime: {pid:process.pid,startedAt:new Date(STARTED_AT).toISOString(),sourceSha256:initialRuntime?null:RUNTIME_IDENTITY.sourceSha256},
    panelConnected: now - lastPanelSeenAt < 15000,
    panelBootstrap: panelBootstrapService.snapshot(),
    autonomousSession: autonomousSession.publicStatus(),
    titleExportRecovery: titleExportRecovery.status(),
    titleExportVerification: titleVerificationExecutor.status(),
    ameJobSource: ameJobSourceExecutor.status(),
    ameOpenComp: ameOpenCompExecutor.status(),
    projectLifecycle: lifecycle.diagnostics(),
    lastPanelSeenAt,
    lastPanelInfo,
    pendingCommands: initialRuntime ? pendingCommands.length : countQueuedCommands(now),
    inflightCommands: Array.from(inflightCommands.values()).map((command) => compactAeCommand(command, now)),
    retainedResults: completedResults.size,
    recentResults: Array.from(completedResults.values()).slice(-25).map((result) => ({
      id: result.id,
      ok: result.ok,
      ageMs: now - result.completedAt,
      completedAt: new Date(result.completedAt).toISOString()
    })),
    waitingPanels: waitingPanels.length,
    logFile: LOG_FILE,
    
    idempotencyLogFile: IDEMPOTENCY_LOG_FILE,
    generatedExportDir: GENERATED_EXPORT_DIR,
    generatedRenderOutputDir: GENERATED_RENDER_OUTPUT_DIR,
    generatedSafetyContractVersion: generatedSafety.GENERATED_SAFETY_CONTRACT_VERSION,
    
    
    backupDir: BACKUP_DIR,
    activeEditSession: compactEditSession(activeEditSession),
    recentEvents: recentEvents.slice(-25)
  };
}

// Native captures these exact main-module functions after its complete loaded
// Node gate. No API accepts a getter, snapshot, caller source or request object.
function ownedTrustedReadQuiescence(){
  if(!initialRuntime||!trustedReadDaemon.role)throw Object.assign(Error("owned_initial_private_daemon_required"),{code:"owned_initial_private_daemon_required"});
  const primary=lifecycle.diagnostics(),fixture=ownedFixtureLifecycle.quiescence(),runner=ameFixtureExecutor.quiescence();
  if(!Array.isArray(runner.outstandingAttempts))throw Object.assign(Error("owned_initial_native_inventory_required"),{code:"owned_initial_native_inventory_required"});
  const liveProposals=[...new Set(m100ActionProposalStore.values())].filter(record=>!record.cancelledAt&&["pending","confirmed","executing"].includes(record.executionState)&&Date.parse(record.proposalExpiresAt)>Date.now());
  const current=currentProposalState.current;
  const debt=trustedNative.describeRestorationDebtFixed(trustedReadDaemon.role);
  return {schema:"ae-agent.owned-initial-private-quiescence.v1",restorationDebt:debt,pendingCommands:pendingCommands.length+trustedReadDaemon.projects.size,inflightCommands:inflightCommands.size,
    editSessions:activeEditSession===null?0:1,lifecyclePending:primary.pending?1:0,lifecycleBlocked:primary.blocked!==false||!!primary.problem,
    proposals:liveProposals.length,proposalPins:current===null?null:ownedFixedTitleProposalPins(current),bootstrapPending:panelBootstrapService.isBusy()?1:0,
    nativeExecuting:runner.executing===false?0:1,cleanupPending:fixture.pendingCleanupJobs+runner.pendingCleanupJobs+runner.pendingCount+runner.outstandingAttempts.length,
    childrenPending:fixture.allChildrenExitProven===true?0:1};
}
function ownedFixedTitleProposalPins(record){
  const own=ownedFixedTitleProposals.get(record);if(!own)return null;const manual=ownedFixedTitleManualReceipts.get(record);
  const historical=!!manual?.completedExecution&&record===currentProposalState.current&&record.executionState==="completed"&&record.executionId===manual.completedExecution.callRef&&record.lastRun?.id===record.executionId&&record.lastRun?.ok===true&&record.lastRun?.dryRun===false;
  if(!historical)currentProposalState.assertCurrent(record);else if(record.payloadHash!==m100Protocol.sha256Payload(record.payload)||record.previewHash!==m100Protocol.sha256Text(record.proposal.action.preview)||m100Protocol.stableStringify(record.payload.plan.steps[0].args.ownedTitleProgram)!==m100Protocol.stableStringify(JSON.parse(own.operand)))throw Object.assign(Error("owned_initial_completed_history_payload_changed"),{code:"owned_initial_completed_history_payload_changed"});
  const state=currentProposalState.snapshot(),proposal=record.proposal;
  return {instanceId:state.instanceId,revision:record.revision,actionId:record.actionId,requestId:record.requestId,actionKind:proposal.action.kind,
    payloadRef:record.payloadRef,payloadHash:record.payloadHash,previewHash:record.previewHash,projectFile:record.project.actualFile,expiresAt:record.proposalExpiresAt,
    riskLevel:record.riskLevel,riskPolicyVersion:record.riskPolicyVersion,surface:record.confirmationSurface,sessionId:record.confirmationSessionId||""};
}
function ownedTrustedReadStatus(){
  if(!initialRuntime||!trustedReadDaemon.role||!trustedReadDaemon.cep)throw Object.assign(Error("owned_initial_private_status_required"),{code:"owned_initial_private_status_required"});
  initialRuntime.assertIngress();trustedReadDaemon.cep.assertCurrent();const value=getBridgeStatus();value.ownedRestorationDebt=trustedNative.describeRestorationDebtFixed(trustedReadDaemon.role);initialRuntime.assertIngress();trustedReadDaemon.cep.assertCurrent();return value;
}
function ownedTrustedServerOnlyResult(){throw Object.assign(Error("core_library_tools_removed"),{code:"core_library_tools_removed"});}
// The only preparation inputs are descriptors captured by the original native
// getter call. Pure Build/Propose establish private records; a dry-run still
// needs its one original panel delivery before its result can be retained.
function ownedCreateFixedTitleProposal(descriptor, descriptorSha25664) {
  const args=descriptor.request.args,operations={checkpoint:14,clean_copy:15,stage:5,enqueue:6,start:7,restore:8};
  if(!trustedExact(args,["ownedTitleOperation","variantSlot"])||operations[args.ownedTitleOperation]!==descriptor.leaf||
      args.variantSlot!==descriptor.slot||(args.ownedTitleOperation==="checkpoint"?descriptor.slot!==0:![1,2].includes(descriptor.slot)))
    throw Object.assign(Error("owned_initial_exact_finite_proposal_required"),{code:"owned_initial_exact_finite_proposal_required"});
  const table=ownedTitlePlan.buildFixedTitlePlan(descriptor.facts),row=ownedTitlePlan.selectFixedTitleOperation(table,{operation:args.ownedTitleOperation,slot:descriptor.slot});
  const immutableFacts=facts=>({schema:facts.schema,sourceProject:facts.sourceProject,baseline:facts.baseline,selectedTextLayerIDs:facts.selectedTextLayerIDs,variants:facts.variants});
  let ownBuild=false;
  for(const saved of ownedExecutionPreparationFacts.values()) {
    const original=JSON.parse(saved.descriptor),proof=JSON.parse(saved.proof);
    if(saved.record===null&&original.request.name==="build_solution_plan"&&original.manifestSha25664===descriptor.manifestSha25664&&
        m100Protocol.stableStringify(immutableFacts(proof.result.facts))===m100Protocol.stableStringify(immutableFacts(table.facts)))ownBuild=true;
  }
  if(!ownBuild)throw Object.assign(Error("owned_initial_original_build_before_proposal_required"),{code:"owned_initial_original_build_before_proposal_required"});
  const panel=ownedOriginalPreparationPanel(descriptor.originalPanel);
  // This finite payload has a separate private consumer. It is never sent to
  // the legacy arbitrary-plan runner or treated as a native dispatch grant.
  const operand={schema:"ae-agent.owned-runtime-fixed-title-operation.v1",operation:args.ownedTitleOperation,slot:descriptor.slot,
    manifestSha25664:descriptor.manifestSha25664,facts:table.facts};
  const payload={kind:"agent_plan",requestId:descriptor.callRef,plan:{schema:"ae-agent.owned-runtime-fixed-title-plan.v1",summary:"Owned title "+row.key,
    targetProject:{file:descriptor.projectFile},steps:[{tool:"run_ai_agent_plan",args:{ownedTitleProgram:operand}}]},userPrompt:null,planner:{agentId:null,model:null,agentMode:null}};
  const preview=m100Protocol.stableStringify({operation:row.key,source:descriptor.projectFile,manifestSha25664:descriptor.manifestSha25664,operand});
  const proposal=m100Protocol.createActionProposalEnvelope({requestId:descriptor.callRef,summary:payload.plan.summary,
    details:"Finite native-owned title operation. Dispatch requires original native preparation and manual joins.",risk:{level:"mutating",requiresConfirmation:true,reasons:["owned_fixed_title_operation"]},
    action:{kind:"ae_tool",toolName:"run_ai_agent_plan"},payload,preview,confirmationSurface:"cep-panel",confirmationSessionId:panel.confirmationSessionId});
  if(proposal.confirmation.sessionId!==panel.confirmationSessionId)throw Object.assign(Error("owned_initial_original_panel_session_changed"),{code:"owned_initial_original_panel_session_changed"});
  const frame={descriptor,descriptorSha25664,completed:false};ownedExecutionPreparationFrames.add(frame);
  return ownedExecutionPreparationContext.run(frame,()=>{
    const stored=storeM100ActionProposal(proposal,payload,{ownedPreparationFrame:frame});
    if(!stored)throw Object.assign(Error("owned_initial_fixed_m100_envelope_refused"),{code:"owned_initial_fixed_m100_envelope_refused"});
    const record=currentProposalState.current;currentProposalState.assertCurrent(record);currentProposalState.bindProject(record,descriptor.projectFile);
    ownedFixedTitleProposals.set(record,Object.freeze({descriptorSha25664,manifestSha25664:descriptor.manifestSha25664,slot:descriptor.slot,leaf:descriptor.leaf,operand:JSON.stringify(operand)}));
    // Shape classification is a cached data projection of this exact finite
    // program. Native admission and all unsupported producers remain separate.
    const validation=Object.freeze({ok:true,stepCount:1,mutatingCount:1,mutatingStepCount:1,readOnlyCount:0,unknownToolCount:0,requiresCheckpoint:true,
      sourceOnly:true,nativeAuthority:false,steps:Object.freeze([Object.freeze({tool:"run_ai_agent_plan",operation:row.key,mutating:true})])});
    ownedFixedTitleManualReceipts.set(record,{panel,token:stored.confirmation.confirmationToken,validation,proposalTerminal:null,dryTerminal:null,completedDryRun:null,adopted:false,executing:false});
    const publicProposal=JSON.parse(JSON.stringify(stored));delete publicProposal.confirmation.confirmationToken;
    const result={schema:"ae-agent.owned-runtime-fixed-title-proposal.v1",ok:true,sourceOnly:true,nativeAuthority:false,executionReady:false,
      proposal:publicProposal,actionId:record.actionId,payloadRef:record.payloadRef,payloadHash:record.payloadHash,previewHash:record.previewHash,
      riskLevel:record.riskLevel,riskPolicyVersion:record.riskPolicyVersion,operation:row.key,currentPlanPins:ownedFixedTitleProposalPins(record)};
    return ownedRememberExecutionPreparation(descriptor,record,result);
  });
}
function ownedNativeUuid32(value){if(typeof value!=="string"||!/^[a-f0-9]{32}$/.test(value)||/^0+$/.test(value))trustedFail("owned_initial_original_native_id_required");const result=value.slice(0,8)+"-"+value.slice(8,12)+"-"+value.slice(12,16)+"-"+value.slice(16,20)+"-"+value.slice(20);if(result.replace(/-/g,"")!==value)trustedFail("owned_initial_original_native_id_roundtrip");return result;}
function ownedOriginalPreparationPanel(panel){
  const keys=["panelConnectionId","panelGeneration","panelInstanceId","panelLifecycleEpoch","confirmationSessionId"];
  if(!trustedExact(panel,keys)||["panelConnectionId","panelGeneration","panelInstanceId","confirmationSessionId"].some(key=>
      typeof panel[key]!=="string"||!panel[key]||panel[key].length>(key==="confirmationSessionId"?160:256)||/[\x00-\x20]/.test(panel[key]))||
      !Number.isSafeInteger(panel.panelLifecycleEpoch)||panel.panelLifecycleEpoch<0||
      !panel.confirmationSessionId.startsWith(panel.panelConnectionId+":"))
    throw Object.assign(Error("owned_initial_original_panel_session_required"),{code:"owned_initial_original_panel_session_required"});
  const connection=trustedReadDaemon.connection;
  if(!connection||["panelConnectionId","panelGeneration","panelInstanceId","panelLifecycleEpoch"].some(key=>connection[key]!==panel[key]))
    throw Object.assign(Error("owned_initial_original_panel_generation_changed"),{code:"owned_initial_original_panel_generation_changed"});
  return Object.freeze({...panel});
}
function ownedFixedCurrentPlan(record=currentProposalState.current){
  currentProposalState.assertCurrent(record);const own=ownedFixedTitleManualReceipts.get(record);
  if(!ownedFixedTitleProposals.has(record)||!own||!own.proposalTerminal)throw Object.assign(Error("owned_initial_original_proposal_ack_required"),{code:"owned_initial_original_proposal_ack_required"});
  ownedOriginalPreparationPanel(own.panel);
  const current=currentProposalState.snapshot();
  if(current.proposal.confirmation.confirmationToken||record.confirmationSessionId!==own.panel.confirmationSessionId)
    throw Object.assign(Error("owned_initial_private_original_token_required"),{code:"owned_initial_private_original_token_required"});
  return {...current,validation:own.validation,ownedPlanPreparation:{mode:"completed_native_dry_run_v1"}};
}
function ownedPublishCompletedNativeDry(record,captured){
  currentProposalState.assertCurrent(record);const own=ownedFixedTitleManualReceipts.get(record),delivery=record.dryRunReceipt?.nativeDelivery;
  if(!own||!own.proposalTerminal||own.completedDryRun||!captured||!captured.terminal||!captured.readTerminal||captured.terminal===captured.readTerminal||!delivery)
    throw Object.assign(Error("owned_initial_original_completed_dry_ack_required"),{code:"owned_initial_original_completed_dry_ack_required"});
  ownedOriginalPreparationPanel(own.panel);trustedNative.assertCapturedCurrent(trustedReadDaemon.role,captured.terminal);
  trustedNative.assertCapturedCurrent(trustedReadDaemon.role,captured.readTerminal);
  const actual=trustedNative.describeExecution(trustedReadDaemon.role,captured.readTerminal),hex=value=>typeof value==="string"?value.replace(/-/g,"").toLowerCase():"";
  if(hex(actual.id)!==delivery.commandRef||hex(actual.executionId)!==delivery.executionRef||hex(actual.leaseId)!==delivery.leaseRef||
      crypto.createHash("sha256").update(actual.script,"utf8").digest("hex")!==delivery.scriptSha25664)
    throw Object.assign(Error("owned_initial_original_dry_tuple_changed"),{code:"owned_initial_original_dry_tuple_changed",unknown:true});
  const finishedAt=new Date().toISOString(),pins=ownedFixedTitleProposalPins(record);record.dryRunCompletedAt=finishedAt;
  const projection={schema:"ae-agent.owned-native-dry-projection.v1",id:delivery.executionRef,ok:true,dryRun:true,requestId:record.requestId,
    actionId:record.actionId,revision:record.revision,instanceId:pins.instanceId,finishedAt,nativeAuthority:false,
    binding:{pins:{...pins},...own.panel},nativeDelivery:{...delivery}};
  if(!currentProposalState.publishRunResult(record,projection,{id:projection.id,ok:true,dryRun:true,finishedAt}))
    throw Object.assign(Error("owned_initial_completed_dry_publication_refused"),{code:"owned_initial_completed_dry_publication_refused",unknown:true});
  own.dryTerminal=captured.terminal;own.completedDryRun=JSON.stringify(projection);
  return projection;
}
async function ownedAdoptCompletedNativeDry(originalRequest,body){
  const value=JSON.parse(body.toString("utf8")),record=currentProposalState.current,own=ownedFixedTitleManualReceipts.get(record);
  currentProposalState.assertCurrent(record);
  if(!trustedExact(value,["actionId","revision","panelConnectionId","panelGeneration","confirmationSessionId","panelInstanceId","panelLifecycleEpoch"])||
      !own||!own.proposalTerminal||!own.dryTerminal||!own.completedDryRun||own.adopted||own.executing||record.executionState!=="pending"||record.confirmedAt||
      value.actionId!==record.actionId||value.revision!==record.revision||!own.token||m100Protocol.hashConfirmationToken(own.token)!==record.confirmationTokenHash||
      Object.keys(own.panel).some(key=>value[key]!==own.panel[key]))
    trustedFail("owned_initial_same_original_manual_adopt_required");
  ownedOriginalPreparationPanel(own.panel);const current=ownedFixedCurrentPlan(record),completedDryRun=JSON.parse(own.completedDryRun);
  if(current.state!=="dry_run_passed"||current.lastRun?.id!==completedDryRun.id||
      m100Protocol.stableStringify(completedDryRun.binding.pins)!==m100Protocol.stableStringify(ownedFixedTitleProposalPins(record)))
    trustedFail("owned_initial_completed_dry_current_pins_changed");
  await trustedNative.acceptOriginalManualAdoptFixed(trustedReadDaemon.role,own.proposalTerminal,own.dryTerminal,originalRequest);trustedCurrent();
  currentProposalState.assertCurrent(record);ownedOriginalPreparationPanel(own.panel);
  own.adopted=true;
  // The private original token is exposed solely in this authenticated original
  // panel response. Public current/diagnostics retain the tokenless proposal.
  const proposal=JSON.parse(JSON.stringify(record.proposal));proposal.confirmation.confirmationToken=own.token;
  return {ok:true,proposal,plan:record.payload.plan,validation:own.validation,revision:record.revision,current:ownedFixedCurrentPlan(record),completedDryRun};
}
function ownedRememberExecutionPreparation(descriptor, record, result) {
  const frame=ownedExecutionPreparationContext.getStore();
  if(!frame||!ownedExecutionPreparationFrames.has(frame)||frame.descriptor!==descriptor||frame.completed||
      (descriptor.request.name==="build_solution_plan"?record!==null:!record||record!==currentProposalState.current)||!result||typeof result!=="object"||result.ok!==true||result.isError===true)
    throw Object.assign(Error("owned_initial_original_preparation_result_required"),{code:"owned_initial_original_preparation_result_required"});
  if(record)currentProposalState.assertCurrent(record);
  if(ownedExecutionPreparationFacts.size>=23||ownedExecutionPreparationFacts.has(frame.descriptorSha25664))
    throw Object.assign(Error("owned_initial_preparation_once_or_budget"),{code:"owned_initial_preparation_once_or_budget"});
  const proof=ownedExecutionFactProof(frame.descriptorSha25664,descriptor,record,result,"ae-agent.owned-execution-preparation-proof.v1");
  frame.completed=true;ownedExecutionPreparationFacts.set(frame.descriptorSha25664,Object.freeze({record,descriptor:JSON.stringify(descriptor),proof:JSON.stringify(proof),slot:descriptor.slot,leaf:descriptor.leaf}));
  return proof;
}
function ownedExecutionFactProof(descriptorSha25664,descriptor,record,result,schema) {
  const digest=value=>crypto.createHash("sha256").update(m100Protocol.stableStringify(value)).digest("hex");
  const projectSha25664=digest({file:descriptor.projectFile,revision:descriptor.projectRevision,manifest:descriptor.manifestSha25664,currentRead:descriptor.currentReadSha25664});
  if(!/^[a-f0-9]{64}$/.test(descriptorSha25664))throw Object.assign(Error("owned_initial_original_descriptor_digest_required"),{code:"owned_initial_original_descriptor_digest_required"});
  if(record===null){
    if(schema!=="ae-agent.owned-execution-preparation-proof.v1"||descriptor.purpose!=="preparation"||descriptor.request.name!=="build_solution_plan"||
        !Array.isArray(result.fixedOperations)||result.fixedOperations.length!==11)throw Object.assign(Error("owned_initial_finite_build_result_required"),{code:"owned_initial_finite_build_result_required"});
    return {schema,descriptorSha25664,projectSha25664,leavesSha25664:digest(result.fixedOperations),observationSha25664:digest({currentRead:descriptor.currentReadSha25664,manifest:descriptor.manifestSha25664,result}),result};
  }
  if(!record.project||record.project.expectedFile!==descriptor.projectFile||record.project.actualFile!==descriptor.projectFile||
      !record.proposal||!record.proposal.action||record.proposal.action.payloadHash!==record.payloadHash||record.proposal.action.previewHash!==record.previewHash||
      record.payloadHash!==m100Protocol.sha256Payload(record.payload)||record.previewHash!==m100Protocol.sha256Text(record.proposal.action.preview))
    throw Object.assign(Error("owned_initial_current_m100_project_or_hash_required"),{code:"owned_initial_current_m100_project_or_hash_required"});
  return {schema,descriptorSha25664,projectSha25664,
    leavesSha25664:digest({slot:descriptor.slot,leaf:descriptor.leaf,payloadHash:record.payloadHash,previewHash:record.previewHash}),
    observationSha25664:digest({actionId:record.actionId,revision:record.revision,contractVersion:record.contractVersion,proposalExpiresAt:record.proposalExpiresAt,
      dryRunCompletedAt:record.dryRunCompletedAt,dryRunReceipt:record.dryRunReceipt||null,confirmedAt:record.confirmedAt,executionId:record.executionId}),result};
}
function ownedFixedDryRunRecord(descriptor){
  const args=descriptor.request.args,keys=["actionId","payloadRef","payloadHash","previewHash","riskLevel","riskPolicyVersion","ownedTitleOperation","variantSlot","dryRun"],record=currentProposalState.current;
  if(descriptor.request.name!=="run_ai_agent_plan"||!trustedExact(args,keys)||args.dryRun!==true)throw Object.assign(Error("owned_initial_exact_fixed_dry_run_required"),{code:"owned_initial_exact_fixed_dry_run_required"});
  currentProposalState.assertCurrent(record);const own=ownedFixedTitleProposals.get(record);
  const manual=ownedFixedTitleManualReceipts.get(record);
  if(!own||own.slot!==descriptor.slot||own.leaf!==descriptor.leaf||own.manifestSha25664!==descriptor.manifestSha25664||record.executionState!=="pending"||record.confirmedAt||
      args.variantSlot!==own.slot||args.ownedTitleOperation!==JSON.parse(own.operand).operation||
      !manual||m100Protocol.stableStringify(descriptor.originalPanel)!==m100Protocol.stableStringify(manual.panel)||
      m100Protocol.stableStringify(descriptor.facts)!==m100Protocol.stableStringify(JSON.parse(own.operand).facts))
    throw Object.assign(Error("owned_initial_current_fixed_dry_run_join_required"),{code:"owned_initial_current_fixed_dry_run_join_required"});
  for(const key of ["actionId","payloadRef","payloadHash","previewHash","riskLevel","riskPolicyVersion"])if(args[key]!==record[key])throw Object.assign(Error("owned_initial_current_fixed_dry_run_join_required"),{code:"owned_initial_current_fixed_dry_run_join_required"});
  return record;
}
async function ownedTrustedPreparationScript(input){
  if(!initialRuntime||!trustedReadDaemon.role||!trustedExact(input,["descriptor","descriptorSha25664"])||input.descriptor?.purpose!=="preparation")
    throw Object.assign(Error("owned_initial_fixed_dry_script_getter_required"),{code:"owned_initial_fixed_dry_script_getter_required"});
  initialRuntime.assertIngress();const descriptor=input.descriptor,record=ownedFixedDryRunRecord(descriptor);
  if(Object.hasOwn(descriptor,"delivery"))throw Object.assign(Error("owned_initial_dry_script_before_delivery_required"),{code:"owned_initial_dry_script_before_delivery_required"});
  const source=await ownedTrustedReadonlyScript({name:"get_comp_details",titleSelectionMode:"first_two_observed_text_states_v1",titleRangeMode:descriptor.rangeMode,
    args:{compItemId:descriptor.currentTarget?descriptor.currentTarget.compItemId:descriptor.facts.baseline.variantCompItemId,includeLayers:true,layerLimit:1000,includeMarkers:false,markerLimit:0,includeDynamicLinkGUID:true}});
  initialRuntime.assertIngress();if(ownedFixedDryRunRecord(descriptor)!==record)throw Object.assign(Error("owned_initial_dry_script_owner_changed"),{code:"owned_initial_dry_script_owner_changed"});
  let script=source.script;
  if(descriptor.currentTarget){
    const target=descriptor.currentTarget;if(!["ae-agent.owned-native-staged-current-target.v1","ae-agent.owned-native-restored-source-target.v1"].includes(target.schema)||target.slot!==descriptor.slot||target.projectFile!==descriptor.projectFile||(target.schema==="ae-agent.owned-native-staged-current-target.v1"?![6,7,8].includes(descriptor.leaf):![5,14,15].includes(descriptor.leaf))||!target.stageDescriptor)throw Object.assign(Error("owned_initial_private_staged_dry_target_required"),{code:"owned_initial_private_staged_dry_target_required"});
    const graph=nativeRenderVariant.inspectScript({expectedProjectFile:target.projectFile,rootCompItemId:target.rootCompItemId,variantCompItemId:target.compItemId,controlledLayerIds:target.selectedTextLayerIds}),at=graph.lastIndexOf("return nativeSnapshot(");
    if(at<0||!graph.endsWith(");")||script.split("return details;").length!==2)throw Object.assign(Error("owned_initial_staged_dry_generator_shape"),{code:"owned_initial_staged_dry_generator_shape"});
    const body=graph.slice(0,at)+"var ownedFixedTitleState="+ownedFixedTitleState.toString()+";details.ownedCurrentStageState=ownedFixedTitleState("+aeLiteral(target.stageDescriptor)+","+aeLiteral(target.projectFile)+",nativeSnapshot);";
    script=script.replace("return details;",body+"return details;");if(Buffer.byteLength(script,"utf8")>1048576)throw Object.assign(Error("owned_initial_staged_dry_script_bound"),{code:"owned_initial_staged_dry_script_bound"});
  }
  return Object.freeze({name:"run_ai_agent_plan",script,scriptSha25664:crypto.createHash("sha256").update(script).digest("hex")});
}
function ownedTrustedExecutionPreparation(input) {
  if(!initialRuntime||!trustedReadDaemon.role||!trustedExact(input,["descriptor","descriptorSha25664"])||
      !input.descriptor||input.descriptor.purpose!=="preparation"||!input.descriptor.request||
      !["build_solution_plan","propose_ai_agent_plan","run_ai_agent_plan"].includes(input.descriptor.request.name))
    throw Object.assign(Error("owned_initial_fixed_preparation_getter_required"),{code:"owned_initial_fixed_preparation_getter_required"});
  initialRuntime.assertIngress();const saved=ownedExecutionPreparationFacts.get(input.descriptorSha25664);
  if(!saved&&input.descriptor.request.name==="propose_ai_agent_plan"){
    const proof=ownedCreateFixedTitleProposal(input.descriptor,input.descriptorSha25664);initialRuntime.assertIngress();return proof;
  }
  if(!saved&&input.descriptor.request.name==="run_ai_agent_plan"){
    const descriptor=input.descriptor,record=ownedFixedDryRunRecord(descriptor),delivery=descriptor.delivery;
    if(!trustedExact(delivery,["commandRef","executionRef","leaseRef","receiptSha25664","scriptSha25664","resultSha25664"])||
        ["commandRef","executionRef","leaseRef"].some(key=>!/^[a-f0-9]{32}$/.test(delivery[key])||/^0+$/.test(delivery[key]))||
        ["receiptSha25664","scriptSha25664","resultSha25664"].some(key=>!/^[a-f0-9]{64}$/.test(delivery[key])||/^0+$/.test(delivery[key]))||record.dryRunCompletedAt)
      throw Object.assign(Error("owned_initial_original_dry_delivery_required"),{code:"owned_initial_original_dry_delivery_required"});
    // Native already checked the original panel tuple and full fresh baseline
    // result against its own Manifest before invoking this retained getter.
    record.dryRunCompletedAt=new Date().toISOString();record.dryRunReceipt={runId:ownedNativeUuid32(delivery.executionRef),previewHash:record.previewHash,payloadHash:record.payloadHash,contractVersion:AUTONOMY_CONTRACT_VERSION,stepCount:1,
      projectFile:descriptor.projectFile,nativeDelivery:{...delivery},manifestSha25664:descriptor.manifestSha25664};
    const frame={descriptor,descriptorSha25664:input.descriptorSha25664,completed:false};ownedExecutionPreparationFrames.add(frame);
    const proof=ownedExecutionPreparationContext.run(frame,()=>ownedRememberExecutionPreparation(descriptor,record,{ok:true,dryRun:true,nativeAuthority:false,
      actionId:record.actionId,revision:record.revision,stepCount:1,delivery:{...delivery}}));initialRuntime.assertIngress();return proof;
  }
  if(!saved&&input.descriptor.request.name==="build_solution_plan"){
    const descriptor=input.descriptor;
    if(!trustedExact(descriptor.request,["name","args"])||!trustedExact(descriptor.request.args,["solutionId"])||descriptor.request.args.solutionId!=="owned-runtime-two-title-fixed-v1"||descriptor.slot!==0||descriptor.leaf!==4)
      throw Object.assign(Error("owned_initial_exact_finite_build_required"),{code:"owned_initial_exact_finite_build_required"});
    const table=ownedTitlePlan.buildFixedTitlePlan(descriptor.facts);
    const frame={descriptor,descriptorSha25664:input.descriptorSha25664,completed:false};ownedExecutionPreparationFrames.add(frame);
    const result={schema:"ae-agent.owned-runtime-initial-title-build.v1",ok:true,sourceOnly:true,nativeAuthority:false,executionReady:false,facts:table.facts,fixedOperations:table.rows};
    const proof=ownedExecutionPreparationContext.run(frame,()=>ownedRememberExecutionPreparation(descriptor,null,result));
    initialRuntime.assertIngress();return proof;
  }
  if(!saved||saved.descriptor!==JSON.stringify(input.descriptor)||(input.descriptor.request.name==="build_solution_plan"?saved.record!==null:saved.record!==currentProposalState.current))
    throw Object.assign(Error("owned_initial_finite_preparation_producer_unavailable"),{code:"owned_initial_finite_preparation_producer_unavailable"});
  if(saved.record)currentProposalState.assertCurrent(saved.record);initialRuntime.assertIngress();return JSON.parse(saved.proof);
}
function ownedTrustedExecutionGates(input) {
  if(!initialRuntime||!trustedReadDaemon.role||!trustedExact(input,["descriptor","descriptorSha25664"])||!input.descriptor||input.descriptor.purpose!=="gates")
    throw Object.assign(Error("owned_initial_fixed_execution_gate_getter_required"),{code:"owned_initial_fixed_execution_gate_getter_required"});
  initialRuntime.assertIngress();const descriptor=input.descriptor,context=ownedExecutionRunContext.getStore(),record=context&&context.record;
  currentProposalState.assertCurrent(record);assertOwnedExecutionContext(context);
  if(ownedSharedQueueContexts.has(context)){
    const own=ownedSharedQueueContexts.get(context),fixed=ownedFixedTitleProposals.get(record),manual=ownedFixedTitleManualReceipts.get(record);
    if(!fixed||!manual||!manual.proposalTerminal||!manual.dryTerminal||!manual.completedDryRun||descriptor.panelRoute!=="/mcp/tools/call"||
        descriptor.request.name!=="run_ai_agent_plan"||m100Protocol.stableStringify(descriptor.request)!==m100Protocol.stableStringify(descriptor.panel)||
        m100Protocol.stableStringify(descriptor.request.args)!==m100Protocol.stableStringify(own.controllerArgs)||descriptor.slot!==fixed.slot||descriptor.leaf!==fixed.leaf||
        record.executionId!==context.runId||m100Protocol.stableStringify(descriptor.cleanSourcePreflight)!==m100Protocol.stableStringify(context.checkpoint))trustedFail("owned_initial_original_shared_gate_join");
    for(const key of ["proposalProof","dryRunProof"]){const proof=descriptor[key],saved=proof&&ownedExecutionPreparationFacts.get(proof.descriptorSha25664);if(!saved||saved.record!==record||saved.slot!==fixed.slot||saved.leaf!==fixed.leaf||saved.proof!==JSON.stringify(proof))trustedFail("owned_initial_original_shared_preparation_join");}
    if(fixed.leaf===7&&(!context.ownedSharedQueueCapability||!context.ownedSharedQueueBinding||fixed.slot!==2))trustedFail("owned_initial_original_shared_START_grant");
    return ownedExecutionFactProof(input.descriptorSha25664,descriptor,record,{actionId:record.actionId,revision:record.revision,runId:context.runId,authoritySource:"original_owned_shared_queue_profile"},"ae-agent.owned-execution-gate-proof.v1");
  }
  const keys=m100PlanRunLookupKey(descriptor.request.args),panelKeys=m100PlanRunLookupKey(descriptor.panel);
  if(record.riskPolicyVersion!==m100Protocol.M100_RISK_POLICY_VERSION||record.contractVersion!==AUTONOMY_CONTRACT_VERSION||
      !panelKeys.confirmationToken||m100Protocol.hashConfirmationToken(panelKeys.confirmationToken)!==record.confirmationTokenHash||
      panelKeys.confirmedBySurface!==record.confirmationSurface||(record.confirmationSessionId&&panelKeys.confirmedBySession!==record.confirmationSessionId))
    throw Object.assign(Error("owned_initial_original_manual_confirmation_join_required"),{code:"owned_initial_original_manual_confirmation_join_required"});
  for(const name of ["actionId","payloadHash","previewHash","riskLevel","riskPolicyVersion"])
    if(!keys[name]||keys[name]!==record[name]||panelKeys[name]!==record[name])throw Object.assign(Error("owned_initial_original_manual_controller_join_required"),{code:"owned_initial_original_manual_controller_join_required"});
  if(context.stepCount!==1||record.executionId!==context.runId||context.autonomous!==false||context.confirm!==true||context.allowWithoutCheckpoint!==false||
      descriptor.panel.dryRun!==false||descriptor.panel.confirm!==true||descriptor.panel.allowWithoutCheckpoint===true||!context.checkpoint||context.checkpoint.sourceFile!==descriptor.projectFile||
      m100Protocol.stableStringify(context.checkpoint)!==m100Protocol.stableStringify(descriptor.cleanSourcePreflight)||
      !record.dryRunReceipt||record.dryRunReceipt.payloadHash!==record.payloadHash||record.dryRunReceipt.contractVersion!==AUTONOMY_CONTRACT_VERSION||record.dryRunReceipt.stepCount!==1||record.dryRunReceipt.projectFile!==descriptor.projectFile)
    throw Object.assign(Error("owned_initial_current_manual_dry_run_checkpoint_required"),{code:"owned_initial_current_manual_dry_run_checkpoint_required"});
  const steps=record.payload&&record.payload.plan&&record.payload.plan.steps,step=Array.isArray(steps)&&steps.length===1&&steps[0];
  if(!step||step.tool!==descriptor.request.name||m100Protocol.stableStringify(step.args||{})!==m100Protocol.stableStringify(ownedAmeContexts.get(context)?.outerArgs||context.args||{}))
    throw Object.assign(Error("owned_initial_current_exact_step_required"),{code:"owned_initial_current_exact_step_required"});
  const operationNames={5:"stage",6:"enqueue",7:"start",8:"restore",14:"checkpoint",15:"clean_copy"};
  const envelopeKeys=["actionId","payloadRef","payloadHash","previewHash","riskLevel","riskPolicyVersion","ownedTitleOperation","variantSlot"];
  if(!operationNames[descriptor.leaf]||Object.keys(step.args||{}).some(key=>envelopeKeys.includes(key)))
    throw Object.assign(Error("owned_initial_fixed_controller_envelope_required"),{code:"owned_initial_fixed_controller_envelope_required"});
  const exactControllerArgs={...(step.args||{}),actionId:record.actionId,payloadRef:record.payloadRef,payloadHash:record.payloadHash,previewHash:record.previewHash,
    riskLevel:record.riskLevel,riskPolicyVersion:record.riskPolicyVersion,ownedTitleOperation:operationNames[descriptor.leaf],variantSlot:descriptor.slot};
  if(!record.payloadRef||m100Protocol.stableStringify(descriptor.request.args)!==m100Protocol.stableStringify(exactControllerArgs))
    throw Object.assign(Error("owned_initial_exact_controller_step_args_required"),{code:"owned_initial_exact_controller_step_args_required"});
  for(const name of ["proposalProof","dryRunProof"]){const proof=descriptor[name],saved=proof&&ownedExecutionPreparationFacts.get(proof.descriptorSha25664);
    if(!saved||saved.record!==record||saved.slot!==descriptor.slot||saved.leaf!==descriptor.leaf||saved.proof!==JSON.stringify(proof))
      throw Object.assign(Error("owned_initial_original_preparation_receipt_join_required"),{code:"owned_initial_original_preparation_receipt_join_required"});}
  if(descriptor.leaf===7){
    if(descriptor.panelRoute!==ameManualQueue.ROUTE||!context.ownedManualQueueCapability||!context.ownedManualQueueManifest)
      throw Object.assign(Error("owned_initial_original_ame_manual_queue_grant_required"),{code:"owned_initial_original_ame_manual_queue_grant_required"});
    ameManualQueueIssuer.assertCapability(context.ownedManualQueueCapability,context,context.ownedManualQueueManifest);
  }else if(descriptor.panelRoute!=="/agents/plan/run")throw Object.assign(Error("owned_initial_exact_manual_route_required"),{code:"owned_initial_exact_manual_route_required"});
  const proof=ownedExecutionFactProof(input.descriptorSha25664,descriptor,record,{actionId:record.actionId,revision:record.revision,runId:context.runId},"ae-agent.owned-execution-gate-proof.v1");
  currentProposalState.assertCurrent(record);assertOwnedExecutionContext(context);initialRuntime.assertIngress();return proof;
}
function ownedReadonlyScriptPreparation(name){
  const current=scriptPreparationContext.getStore();
  return !!current&&ownedReadonlyScriptPreparations.has(current)&&(!name||current.name===name)&&
    ["get_comp_details","get_layer_details","inspect_title_variants"].includes(current.name);
}
function ownedReadonlyFirstTwoPreparation(name){
  return ownedReadonlyScriptPreparation(name)&&scriptPreparationContext.getStore().titleSelectionMode==="first_two_observed_text_states_v1";
}
function ownedReadonlyObservedRangePreparation(name){
  return ownedReadonlyFirstTwoPreparation(name)&&scriptPreparationContext.getStore().titleRangeMode==="full_observed_root_range_v1";
}
function ownedObservedRootTiming(comp){
  function number(v){if(typeof v!=="number"||!isFinite(v)||(v===0&&1/v===-Infinity))throw Error("owned_observed_timing_number_unavailable");return v;}
  function integer(v,maximum){number(v);if(v<1||Math.floor(v)!==v||v>maximum)throw Error("owned_observed_timing_integer_unavailable");return v;}
  if(!comp||!(comp instanceof CompItem)||typeof comp.name!=="string"||!comp.name)throw Error("owned_observed_timing_comp_unavailable");
  var display=null;
  // Feature availability is observed; absent signed-frame evidence only
  // supports a positive-zero start time in the native frozen resolver.
  try{var observedDisplay=comp.displayStartFrame;if(typeof observedDisplay!=="undefined")display=observedDisplay;}catch(unsupportedDisplay){}
  if(display!==null){number(display);if(Math.floor(display)!==display||display<-2147483648||display>2147483647)throw Error("owned_observed_display_frame_unavailable");}
  return {schema:"ae-agent.owned-observed-root-timing.v1",compItemId:integer(comp.id,9007199254740991),compName:comp.name,width:integer(comp.width,8192),height:integer(comp.height,8192),
    frameRate:number(comp.frameRate).toPrecision(17),frameDuration:number(comp.frameDuration).toPrecision(17),duration:number(comp.duration).toPrecision(17),
    displayStartTime:number(comp.displayStartTime).toPrecision(17),displayStartFrame:display};
}
// Fixed factual getter, serialized only by the original private preparation.
// Adobe's usedFonts sample reads usedFont.font/isSubstitute and usedAt. Every
// access below is feature checked; unsupported observations stay explicit.
const ownedInitialUiBaseline=ownedUiBaseline.captureUiBaseline;
function ownedFirstTwoTitleInventory(comp){
  function bad(s){throw Error(s);}
  function integer(v){if(typeof v!=="number"||!isFinite(v)||v<0||Math.floor(v)!==v)bad("owned_title_integer_unavailable");return v;}
  function number(v){if(typeof v!=="number"||!isFinite(v))bad("owned_title_number_unavailable");return v;}
  function boolean(v){if(typeof v!=="boolean")bad("owned_title_boolean_unavailable");return v;}
  function font(v){if(!v)bad("owned_title_font_object_unavailable");var id=integer(v.fontID),name=v.postScriptName,substitute=boolean(v.isSubstitute);
    if(!id||typeof name!=="string"||!name)bad("owned_title_font_identity_unavailable");return {id:id,postScriptName:name,isSubstitute:substitute};}
  var project=app.project,file=project&&project.file,rows=[],allRows=[],projectRows=[],fonts=[],uses=0,characters=0,i,j,l,p,doc,row,raw,at;
  if(!project||!file||typeof file.fsName!=="string"||typeof project.dirty!=="boolean"||typeof project.revision!=="number")bad("owned_title_project_fact_unavailable");
  if(!comp||integer(comp.numLayers)>1000||integer(project.numItems)>1000)bad("owned_title_inventory_bound");raw=project.usedFonts;
  for(i=1;i<=project.numItems;i++){var projectItem=project.item(i);if(!projectItem)bad("owned_title_project_item_unavailable");
    projectRows.push({id:integer(projectItem.id),index:i,name:String(projectItem.name),comp:projectItem instanceof CompItem});}
  if(!raw||typeof raw.length!=="number"||raw.length>1000)bad("owned_title_used_fonts_unavailable");
  for(i=0;i<raw.length;i++){row={font:font(raw[i].font),usedAt:[]};at=raw[i].usedAt;if(!at||typeof at.length!=="number")bad("owned_title_font_usage_unavailable");
    for(j=0;j<at.length;j++){if(++uses>12000)bad("owned_title_font_usage_bound");row.usedAt.push({layerID:integer(at[j].layerID),layerTimeD:number(at[j].layerTimeD)});}fonts.push(row);}
  // Separate complete pass. Omitting a text row cannot silently change which
  // two states are selected; native joins this census with ordinary layer facts.
  for(i=1;i<=comp.numLayers;i++){l=comp.layer(i);var isText=l instanceof TextLayer,censusText=null,censusExpression=null,censusKeys=null;
    if(isText){p=l.property("ADBE Text Properties").property("ADBE Text Document");if(!p||!p.value||typeof p.value.text!=="string")bad("owned_title_census_text_unavailable");
      censusText=p.value.text;censusExpression=boolean(p.expressionEnabled);censusKeys=integer(p.numKeys);}
    allRows.push({id:integer(l.id),index:integer(l.index),name:String(l.name),textLayer:isText,enabled:boolean(l.enabled),locked:boolean(l.locked),guide:boolean(l.guideLayer),solo:boolean(l.solo),
      inPoint:number(l.inPoint),outPoint:number(l.outPoint),sourceId:l.source?integer(l.source.id):null,sourceText:censusText,sourceTextExpression:censusExpression,sourceTextKeys:censusKeys});}
  for(i=1;i<=comp.numLayers;i++){l=comp.layer(i);if(!(l instanceof TextLayer))continue;p=l.property("ADBE Text Properties").property("ADBE Text Document");
    if(!p)bad("owned_title_source_text_unavailable");doc=p.value;if(!doc||typeof doc.text!=="string")bad("owned_title_text_document_unavailable");characters+=doc.text.length;
    if(doc.text.length>4096||characters>65536)bad("owned_title_character_bound");row={id:integer(l.id),index:integer(l.index),name:String(l.name),enabled:boolean(l.enabled),locked:boolean(l.locked),guide:boolean(l.guideLayer),solo:boolean(l.solo),
      inPoint:number(l.inPoint),outPoint:number(l.outPoint),sourceText:doc.text,sourceTextExpression:boolean(p.expressionEnabled),sourceTextKeys:integer(p.numKeys),fontAtChar:[]};
    // TextDocument.fontObject alone describes its first character. Complete
    // per-character FontObject observations cover mixed styles without writes.
    if(doc.text.length&&typeof doc.characterRange!=="function")bad("owned_title_character_font_unavailable");
    for(j=0;j<doc.text.length;j++){var measuredFont=font(doc.characterRange(j,j+1).fontObject),fontMatch=0;
      for(var fi=0;fi<fonts.length;fi++)if(fonts[fi].font.id===measuredFont.id){if(fonts[fi].font.postScriptName!==measuredFont.postScriptName||fonts[fi].font.isSubstitute!==measuredFont.isSubstitute)bad("owned_title_font_dictionary_drift");fontMatch++;}
      if(fontMatch!==1)bad("owned_title_character_font_usage_join");row.fontAtChar.push(measuredFont.id);}rows.push(row);}
  return {schema:"ae-agent.owned-first-two-text-inventory.v2",projectFile:file.fsName,dirty:project.dirty,revision:integer(project.revision),compItemId:integer(comp.id),compName:String(comp.name),numLayers:integer(comp.numLayers),
    numProjectItems:integer(project.numItems),projectItemRows:projectRows,allLayerRows:allRows,layerRows:rows,usedFonts:fonts,characterCount:characters,usageCount:uses};
}
// Factual reconciliation used inside the one fixed stage delivery after opening
// its native-created copy. Indices/content establish a correspondence; neither
// project/layer IDs nor Dynamic Link GUIDs are assumed to survive app.open.
function ownedCopiedTitleInventoryJoin(original,current,mode){
  function bad(){throw Error("owned_title_copy_inventory_mismatch");}
  function integer(n){if(typeof n!=="number"||!isFinite(n)||n<1||n>9007199254740991||Math.floor(n)!==n)bad();return n;}
  function array(value,count,maximum){if(!value||!(value instanceof Array)||value.length!==count||count>maximum)bad();return value;}
  function same(a,b){if(typeof a!==typeof b||a!==b)bad();}
  if(!original||!current||original.schema!=="ae-agent.owned-first-two-text-inventory.v2"||current.schema!==original.schema||original.dirty!==false||current.dirty!==false||
      typeof original.projectFile!=="string"||typeof current.projectFile!=="string"||!original.projectFile||!current.projectFile||(original.projectFile===current.projectFile&&mode!=="original_source_restore_v1"))bad();
  if(mode!==undefined&&mode!=="original_source_restore_v1")bad();
  integer(original.compItemId);integer(current.compItemId);integer(original.numProjectItems);integer(current.numProjectItems);integer(original.numLayers);integer(current.numLayers);
  same(original.compName,current.compName);same(original.numProjectItems,current.numProjectItems);same(original.numLayers,current.numLayers);
  var beforeProject=array(original.projectItemRows,original.numProjectItems,1000),afterProject=array(current.projectItemRows,current.numProjectItems,1000),projectMap={},seenProject={},i,j,row,before,after,matches=0;
  for(i=0;i<beforeProject.length;i++){before=beforeProject[i];after=afterProject[i];integer(before.id);integer(after.id);same(before.index,i+1);same(after.index,i+1);same(before.name,after.name);same(before.comp,after.comp);
    if(projectMap["p"+before.id]||seenProject["p"+after.id])bad();projectMap["p"+before.id]=after.id;seenProject["p"+after.id]=true;
    if(before.comp===true&&before.name===original.compName){if(before.id!==original.compItemId||after.id!==current.compItemId)bad();matches++;}}
  if(matches!==1||projectMap["p"+original.compItemId]!==current.compItemId)bad();
  var beforeLayers=array(original.allLayerRows,original.numLayers,1000),afterLayers=array(current.allLayerRows,current.numLayers,1000),layerMap={},seenLayers={},textCount=0;
  var keys=["name","textLayer","enabled","locked","guide","solo","inPoint","outPoint","sourceText","sourceTextExpression","sourceTextKeys"];
  for(i=0;i<beforeLayers.length;i++){before=beforeLayers[i];after=afterLayers[i];integer(before.id);integer(after.id);same(before.index,i+1);same(after.index,i+1);
    if(layerMap["l"+before.id]||seenLayers["l"+after.id])bad();layerMap["l"+before.id]=after.id;seenLayers["l"+after.id]=true;
    for(j=0;j<keys.length;j++)same(before[keys[j]],after[keys[j]]);
    if(before.sourceId===null){if(after.sourceId!==null)bad();}else if(projectMap["p"+integer(before.sourceId)]!==integer(after.sourceId))bad();if(before.textLayer===true)textCount++;}
  var beforeTexts=array(original.layerRows,textCount,1000),afterTexts=array(current.layerRows,textCount,1000),fontBefore={},fontAfter={};
  if(!original.usedFonts||!current.usedFonts)bad();array(original.usedFonts,original.usedFonts.length,1000);array(current.usedFonts,current.usedFonts.length,1000);
  for(i=0;i<original.usedFonts.length;i++){row=original.usedFonts[i].font;if(!row||fontBefore["f"+integer(row.id)])bad();fontBefore["f"+row.id]=row;}
  for(i=0;i<current.usedFonts.length;i++){row=current.usedFonts[i].font;if(!row||fontAfter["f"+integer(row.id)])bad();fontAfter["f"+row.id]=row;}
  for(i=0;i<beforeTexts.length;i++){before=beforeTexts[i];after=afterTexts[i];if(layerMap["l"+integer(before.id)]!==integer(after.id)||before.index!==after.index||afterLayers[after.index-1].id!==after.id||afterLayers[after.index-1].textLayer!==true)bad();
    for(j=0;j<9;j++){var textKeys=["name","enabled","locked","guide","solo","inPoint","outPoint","sourceText","sourceTextExpression"];same(before[textKeys[j]],after[textKeys[j]]);}same(before.sourceTextKeys,after.sourceTextKeys);
    if(typeof before.sourceText!=="string")bad();var oldChars=array(before.fontAtChar,before.sourceText.length,4096),newChars=array(after.fontAtChar,after.sourceText.length,4096);
    for(j=0;j<oldChars.length;j++){var oldFont=fontBefore["f"+integer(oldChars[j])],newFont=fontAfter["f"+integer(newChars[j])];if(!oldFont||!newFont)bad();
      same(oldFont.postScriptName,newFont.postScriptName);same(oldFont.isSubstitute,newFont.isSubstitute);if(oldFont.isSubstitute!==false||typeof oldFont.postScriptName!=="string"||!oldFont.postScriptName)bad();
      // A changed FontObject ID needs an unambiguous observed dictionary
      // correspondence. Duplicate PostScript names cannot select a face.
      if(oldFont.id!==newFont.id){var oldMatches=0,newMatches=0;for(var fi=0;fi<original.usedFonts.length;fi++)if(original.usedFonts[fi].font.postScriptName===oldFont.postScriptName)oldMatches++;
        for(fi=0;fi<current.usedFonts.length;fi++)if(current.usedFonts[fi].font.postScriptName===newFont.postScriptName)newMatches++;if(oldMatches!==1||newMatches!==1)bad();}}}
  same(original.characterCount,current.characterCount);
  return {compItemId:current.compItemId,projectItemIdMap:projectMap,layerIdMap:layerMap};
}
// Complete factual graph reconciliation. The ID correspondence comes from
// complete actual project/layer inventories, never preserved-GUID assumptions.
// Only the two selected visibility bits may differ after the fixed Stage.
function ownedCopiedTitleGraphJoin(original,current,selected,slot,expectedFile,mode){
  function bad(){throw Error("owned_title_copy_graph_mismatch");}
  function equal(a,b){var k,ac=0,bc=0;if(a===b)return true;if(a===null||b===null||typeof a!==typeof b||typeof a!=="object"||(a instanceof Array)!==(b instanceof Array))return false;
    for(k in a)if(Object.prototype.hasOwnProperty.call(a,k)){ac++;if(!Object.prototype.hasOwnProperty.call(b,k)||!equal(a[k],b[k]))return false;}for(k in b)if(Object.prototype.hasOwnProperty.call(b,k))bc++;return ac===bc;}
  function mapId(map,id){if(id===null)return null;var value=map["i"+id];if(typeof value!=="number"||value<1)bad();return value;}
  if(!original||!current||!(original.graph instanceof Array)||!(current.graph instanceof Array)||original.graph.length!==current.graph.length||original.graph.length>100||
      !(original.ownedTitleInventories instanceof Array)||!(current.ownedTitleInventories instanceof Array)||original.ownedTitleInventories.length!==original.graph.length||current.ownedTitleInventories.length!==current.graph.length||
      !(selected instanceof Array)||selected.length!==2||selected[0]===selected[1]||(slot!==0&&slot!==1&&slot!==2)||current.projectFile!==expectedFile)bad();
  var projects={},layers={},maps=[],i,j,k,before,after,expected,join;
  function rows(input,output){var n,r,key;for(n=0;n<input.length;n++){r={};for(key in input[n])if(Object.prototype.hasOwnProperty.call(input[n],key))r[key]=input[n][key];
    if(slot&&before.compItemId===original.variantCompItemId&&(r.id===selected[0]||r.id===selected[1]))r.enabled=r.id===selected[slot-1];output.push(r);}}
  for(i=0;i<original.graph.length;i++){
    before=original.ownedTitleInventories[i];after=current.ownedTitleInventories[i];expected={};for(k in before)if(Object.prototype.hasOwnProperty.call(before,k))expected[k]=before[k];
    expected.allLayerRows=[];expected.layerRows=[];
    rows(before.allLayerRows,expected.allLayerRows);rows(before.layerRows,expected.layerRows);
    join=ownedCopiedTitleInventoryJoin(expected,after,mode);maps.push(join);
    for(k in join.projectItemIdMap)if(Object.prototype.hasOwnProperty.call(join.projectItemIdMap,k)){var pk="i"+k.substring(1);if(projects[pk]&&projects[pk]!==join.projectItemIdMap[k])bad();projects[pk]=join.projectItemIdMap[k];}
    for(k in join.layerIdMap)if(Object.prototype.hasOwnProperty.call(join.layerIdMap,k)){var lk="i"+k.substring(1);if(layers[lk]&&layers[lk]!==join.layerIdMap[k])bad();layers[lk]=join.layerIdMap[k];}
    if(original.graph[i].id!==before.compItemId||current.graph[i].id!==after.compItemId)bad();
  }
  function convert(value,parentKey){var out,key,n,isProject;if(value===null||typeof value!=="object")return value;
    if(value instanceof Array){out=[];for(n=0;n<value.length;n++)out.push(convert(value[n],parentKey));return out;}
    out={};for(key in value)if(Object.prototype.hasOwnProperty.call(value,key)){
      if(key==="ownedTitleInventories"||key==="ownedObservedTimings")continue;
      if(key==="projectFile"){out[key]=expectedFile;continue;}if(key==="revision"){out[key]=current.revision;continue;}
      if(key==="id"){isProject=parentKey==="graph"||parentKey==="source";out[key]=mapId(isProject?projects:layers,value[key]);continue;}
      if(key==="rootCompItemId"||key==="variantCompItemId"||key==="compItemId"||key==="ownerCompItemId"||key==="sourceId"){out[key]=mapId(projects,value[key]);continue;}
      if(key==="trackMatteLayerId"||key==="consumerLayerId"||key==="controlledLayerId"){out[key]=mapId(layers,value[key]);continue;}
      if(key==="enabled"&&slot&&(value.id===selected[0]||value.id===selected[1]))out[key]=value.id===selected[slot-1];else out[key]=convert(value[key],key);
    }return out;}
  expected=convert(original,"");
  // Current IDs are already in their new namespace. Strip only separately
  // reconciled inventory/timing fields; never run them through the old map.
  after={};for(k in current)if(Object.prototype.hasOwnProperty.call(current,k)&&k!=="ownedTitleInventories"&&k!=="ownedObservedTimings")after[k]=current[k];
  if(expected.controlled instanceof Array)expected.controlled.sort(function(a,b){return a.id-b.id;});
  if(expected.matteDependencies instanceof Array)expected.matteDependencies.sort(function(a,b){return a.ownerCompItemId-b.ownerCompItemId||a.consumerLayerId-b.consumerLayerId;});
  if(!equal(expected,after)||!(original.ownedObservedTimings instanceof Array)||!(current.ownedObservedTimings instanceof Array)||original.ownedObservedTimings.length!==original.graph.length||current.ownedObservedTimings.length!==current.graph.length)bad();
  for(i=0;i<original.ownedObservedTimings.length;i++){before=original.ownedObservedTimings[i];after=current.ownedObservedTimings[i];if(before===null){if(after!==null)bad();continue;}
    expected={};for(k in before)if(Object.prototype.hasOwnProperty.call(before,k))expected[k]=before[k];expected.compItemId=mapId(projects,before.compItemId);if(!equal(expected,after))bad();}
  return {projectItemIdMap:projects,layerIdMap:layers,rootCompItemId:mapId(projects,original.rootCompItemId),variantCompItemId:mapId(projects,original.variantCompItemId)};
}
function ownedFixedTitleState(d,path,nativeSnapshot){
  function bad(s){throw Error(s);}
  function comp(name){var result=null,i,item;for(i=1;i<=app.project.numItems;i++){item=app.project.item(i);if(item instanceof CompItem&&item.name===name){if(result)bad("owned_state_comp_name_ambiguous");result=item;}}if(!result)bad("owned_state_comp_absent");return result;}var root=comp(d.rootName),target=comp(d.compName),selected=[],i,j,item;
    // The original two rows are identified by their complete copied inventory,
    // never by a guessed new ID or a post-open GUID preservation claim.
    var inventory=ownedFirstTwoTitleInventory(target),original=d.originalComp.ownedTitleInventory;
    for(i=0;i<d.selectedTextLayerIds.length;i++){var originalIndex=0;for(j=0;j<original.allLayerRows.length;j++)if(original.allLayerRows[j].id===d.selectedTextLayerIds[i])originalIndex=original.allLayerRows[j].index;
      if(!originalIndex||originalIndex>inventory.allLayerRows.length)bad("owned_stage_selected_index_missing");selected.push(inventory.allLayerRows[originalIndex-1].id);}
    var graph=nativeSnapshot({expectedProjectFile:path,rootCompItemId:root.id,variantCompItemId:target.id,controlledLayerIds:selected});graph.ownedTitleInventories=[];graph.ownedObservedTimings=[];
    for(i=0;i<graph.graph.length;i++){item=null;for(j=1;j<=app.project.numItems;j++)if(app.project.item(j).id===graph.graph[i].id){if(item)bad("owned_stage_graph_identity_ambiguous");item=app.project.item(j);}if(!item)bad("owned_stage_graph_item_missing");
      graph.ownedTitleInventories.push(ownedFirstTwoTitleInventory(item));graph.ownedObservedTimings.push(item.id===root.id?ownedObservedRootTiming(item):null);}
    var guid=target.dynamicLinkGUID;if(typeof guid!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(guid)||/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(guid))bad("owned_stage_actual_guid_unavailable");
    return {graph:graph,sourceGuid:guid.toLowerCase(),selectedTextLayerIds:selected,compItemId:target.id,rootCompItemId:root.id,projectFile:app.project.file.fsName,revision:app.project.revision,dirty:app.project.dirty,uiBaseline:ownedInitialUiBaseline()};}

function ownedFixedStageHost(d,nativeSnapshot){
  function bad(s){throw Error(s);}
  function norm(p){return String(p||"").replace(/\\/g,"/").toLowerCase();}
  function comp(name){var result=null,i,item;for(i=1;i<=app.project.numItems;i++){item=app.project.item(i);if(item instanceof CompItem&&item.name===name){if(result)bad("owned_stage_comp_name_ambiguous");result=item;}}if(!result)bad("owned_stage_comp_absent");return result;}
  if(!app.project||!app.project.file||typeof app.project.dirty!=="boolean"||app.project.dirty!==false||norm(app.project.file.fsName)!==norm(d.sourceProjectFile))bad("owned_stage_original_clean_source_required");
  var before=ownedFixedTitleState(d,d.sourceProjectFile,nativeSnapshot),baseline=d.originalGraph,i,k;
  // Before open, source identity has not changed, so use exact canonical deep
  // equality including actual revision, full inventories and raw timing.
  function equal(a,b){var key,ac=0,bc=0;if(a===b)return true;if(a===null||b===null||typeof a!==typeof b||typeof a!=="object"||(a instanceof Array)!==(b instanceof Array))return false;
    for(key in a)if(Object.prototype.hasOwnProperty.call(a,key)){ac++;if(!Object.prototype.hasOwnProperty.call(b,key)||!equal(a[key],b[key]))return false;}for(key in b)if(Object.prototype.hasOwnProperty.call(b,key))bc++;return ac===bc;}
  if(!equal(before.graph,baseline)||!equal(before.uiBaseline,d.originalUi)||before.sourceGuid!==String(d.originalComp.dynamicLinkGUID).toLowerCase())bad("owned_stage_original_full_baseline_changed");
  var working=new File(d.workingProjectFile),finalFile=new File(d.snapshotProjectFile);if(!working.exists||finalFile.exists)bad("owned_stage_fixed_file_preflight");
  app.open(working);if(!app.project||!app.project.file||norm(app.project.file.fsName)!==norm(d.workingProjectFile)||app.project.dirty!==false)bad("owned_stage_working_open_readback");
  var opened=ownedFixedTitleState(d,d.workingProjectFile,nativeSnapshot),join=ownedCopiedTitleGraphJoin(baseline,opened.graph,d.selectedTextLayerIds,0,opened.projectFile),target=comp(d.compName);
  if(finalFile.exists)bad("owned_stage_final_exists_before_toggle");
  for(i=0;i<d.selectedTextLayerIds.length;i++){var wanted=join.layerIdMap["i"+d.selectedTextLayerIds[i]],found=null;for(k=1;k<=target.numLayers;k++)if(target.layer(k).id===wanted){if(found)bad("owned_stage_layer_ambiguous");found=target.layer(k);}if(!found||found.locked||found.guideLayer||found.solo)bad("owned_stage_layer_current_refused");found.enabled=i===d.slot-1;}
  if(finalFile.exists)bad("owned_stage_final_exists_before_save");app.project.save(finalFile);
  if(!app.project.file||norm(app.project.file.fsName)!==norm(d.snapshotProjectFile)||app.project.dirty!==false)bad("owned_stage_final_save_readback");
  var saved=ownedFixedTitleState(d,d.snapshotProjectFile,nativeSnapshot);ownedCopiedTitleGraphJoin(baseline,saved.graph,d.selectedTextLayerIds,d.slot,saved.projectFile);
  return {schema:"ae-agent.owned-native-stage-result.v1",operation:"stage",slot:d.slot,sourceProjectFile:d.sourceProjectFile,workingProjectFile:d.workingProjectFile,snapshotProjectFile:d.snapshotProjectFile,before:before,working:opened,postSave:saved};
}
async function ownedTrustedStageScript(input){
  if(!initialRuntime||!trustedReadDaemon.role||!trustedExact(input,["descriptor","descriptorSha25664"])||!input.descriptor||input.descriptor.schema!=="ae-agent.owned-native-stage-descriptor.v1")
    throw Object.assign(Error("owned_initial_fixed_stage_getter_required"),{code:"owned_initial_fixed_stage_getter_required"});
  initialRuntime.assertIngress();const context=ownedExecutionRunContext.getStore();currentProposalState.assertCurrent(context&&context.record);assertOwnedExecutionContext(context);
  const d=input.descriptor,operand=context.args&&context.args.ownedTitleProgram;
  if(!operand||operand.operation!=="stage"||operand.slot!==d.slot||operand.manifestSha25664!==d.manifestSha25664||![1,2].includes(d.slot)||d.operation!=="stage")
    throw Object.assign(Error("owned_initial_exact_stage_manual_operand_required"),{code:"owned_initial_exact_stage_manual_operand_required"});
  const source=nativeRenderVariant.inspectScript({expectedProjectFile:d.sourceProjectFile,rootCompItemId:d.originalGraph.rootCompItemId,variantCompItemId:d.originalGraph.variantCompItemId,controlledLayerIds:d.selectedTextLayerIds}),suffix="return nativeSnapshot(";
  const at=source.lastIndexOf(suffix);if(at<0||!source.endsWith(");"))throw Object.assign(Error("owned_initial_fixed_snapshot_generator_shape"),{code:"owned_initial_fixed_snapshot_generator_shape"});
  const script=wrapExtendScriptBody(`${source.slice(0,at)}var ownedFirstTwoTitleInventory=${ownedFirstTwoTitleInventory.toString()};var ownedInitialUiBaseline=${ownedInitialUiBaseline.toString()};var ownedCopiedTitleInventoryJoin=${ownedCopiedTitleInventoryJoin.toString()};var ownedCopiedTitleGraphJoin=${ownedCopiedTitleGraphJoin.toString()};var ownedObservedRootTiming=${ownedObservedRootTiming.toString()};var ownedFixedTitleState=${ownedFixedTitleState.toString()};var ownedFixedStageHost=${ownedFixedStageHost.toString()};return ownedFixedStageHost(${aeLiteral(d)},nativeSnapshot);`);
  if(Buffer.byteLength(script,"utf8")>1048576)throw Object.assign(Error("owned_initial_stage_generated_source_bound"),{code:"owned_initial_stage_generated_source_bound"});
  initialRuntime.assertIngress();currentProposalState.assertCurrent(context.record);assertOwnedExecutionContext(context);
  return Object.freeze({name:"run_ai_agent_plan",script,scriptSha25664:crypto.createHash("sha256").update(script).digest("hex")});
}
function ownedFixedAmeHost(d,descriptorSha25664,nativeSnapshot,send){
  function equal(a,b){var key,ac=0,bc=0;if(a===b)return true;if(a===null||b===null||typeof a!==typeof b||typeof a!=="object"||(a instanceof Array)!==(b instanceof Array))return false;for(key in a)if(Object.prototype.hasOwnProperty.call(a,key)){ac++;if(!Object.prototype.hasOwnProperty.call(b,key)||!equal(a[key],b[key]))return false;}for(key in b)if(Object.prototype.hasOwnProperty.call(b,key))bc++;return ac===bc;}
  if(!app.project||!app.project.file||app.project.dirty!==false||app.project.file.fsName!==d.expectedCurrent.projectFile)throw Error("owned_ame_current_clean_snapshot_required");
  var before=ownedFixedTitleState(d.stageDescriptor,d.expectedCurrent.projectFile,nativeSnapshot);if(!equal(before,d.expectedCurrent))throw Error("owned_ame_before_full_snapshot_drift");
  var returned=send();var after=ownedFixedTitleState(d.stageDescriptor,d.expectedCurrent.projectFile,nativeSnapshot);if(!equal(after,d.expectedCurrent))throw Error("owned_ame_after_full_snapshot_drift");
  return {schema:"ae-agent.owned-native-ame-receipt.v1",descriptorSha25664:descriptorSha25664,before:before,after:after,send:returned};
}
async function ownedTrustedAmeScript(input){
  if(!initialRuntime||!trustedReadDaemon.role||!trustedExact(input,["descriptor","descriptorSha25664"])||!trustedExact(input.descriptor,["schema","operation","slot","expectedCurrent","stageDescriptor","args"])||
      input.descriptor.schema!=="ae-agent.owned-native-ame-command.v1"||!["sources","queue","enqueue","start","status","shared_status"].includes(input.descriptor.operation)||![1,2].includes(input.descriptor.slot)||
      !/^[a-f0-9]{64}$/.test(input.descriptorSha25664)||crypto.createHash("sha256").update(m100Protocol.stableStringify(input.descriptor)).digest("hex")!==input.descriptorSha25664)
    throw Object.assign(Error("owned_initial_fixed_ame_getter_required"),{code:"owned_initial_fixed_ame_getter_required"});
  initialRuntime.assertIngress();const d=input.descriptor,a=d.args,effect=["enqueue","start"].includes(d.operation),context=ownedExecutionRunContext.getStore();
  if(a.operation!==d.operation||a.ownedInitialDispatch!==true||!/^ame-[0-9]{1,3}\.[0-9]{1,3}$/.test(a.targetSpecifier)||(!(a.queueMode==="shared_queue_v1"&&["start","shared_status"].includes(d.operation))&&a.sourcePath!==d.expectedCurrent.projectFile)||d.expectedCurrent.dirty!==false||d.stageDescriptor.slot!==d.slot)
    throw Object.assign(Error("owned_initial_fixed_ame_operand_join"),{code:"owned_initial_fixed_ame_operand_join"});
  if(effect){currentProposalState.assertCurrent(context&&context.record);assertOwnedExecutionContext(context);const program=(ownedAmeContexts.get(context)?.outerArgs||context.args)?.ownedTitleProgram;
    if(!program||program.operation!==d.operation||program.slot!==d.slot)throw Object.assign(Error("owned_initial_fixed_ame_manual_program_required"),{code:"owned_initial_fixed_ame_manual_program_required"});}
  const source=nativeRenderVariant.inspectScript({expectedProjectFile:d.expectedCurrent.projectFile,rootCompItemId:d.expectedCurrent.rootCompItemId,variantCompItemId:d.expectedCurrent.compItemId,controlledLayerIds:d.expectedCurrent.selectedTextLayerIds}),at=source.lastIndexOf("return nativeSnapshot(");
  if(at<0||!source.endsWith(");"))throw Object.assign(Error("owned_initial_fixed_ame_snapshot_generator_shape"),{code:"owned_initial_fixed_ame_snapshot_generator_shape"});
  const bridgeTalkBody=ameTitleJobs.messageScript(a),sender=ameTitleJobs.commandScript(a);if(!sender.startsWith("return ")||!sender.endsWith(";"))throw Object.assign(Error("owned_initial_fixed_ame_sender_shape"),{code:"owned_initial_fixed_ame_sender_shape"});
  const body=source.slice(0,at)+"var ownedFirstTwoTitleInventory="+ownedFirstTwoTitleInventory.toString()+";var ownedInitialUiBaseline="+ownedInitialUiBaseline.toString()+";var ownedObservedRootTiming="+ownedObservedRootTiming.toString()+";var ownedFixedTitleState="+ownedFixedTitleState.toString()+";var ownedFixedAmeHost="+ownedFixedAmeHost.toString()+";return ownedFixedAmeHost("+aeLiteral(d)+","+aeLiteral(input.descriptorSha25664)+",nativeSnapshot,function(){"+sender+"});";
  const script=wrapExtendScriptBody(body);if(Buffer.byteLength(script,"utf8")>1048576||Buffer.byteLength(bridgeTalkBody,"utf8")>524288)throw Object.assign(Error("owned_initial_fixed_ame_source_bound"),{code:"owned_initial_fixed_ame_source_bound"});
  initialRuntime.assertIngress();if(effect){currentProposalState.assertCurrent(context.record);assertOwnedExecutionContext(context);}return Object.freeze({name:effect?"run_ai_agent_plan":["status","shared_status"].includes(d.operation)?ameTitleJobs.STATUS:d.operation==="sources"?ameTitleJobs.INSPECT:ameTitleJobs.QUEUE_MANIFEST,script,scriptSha25664:crypto.createHash("sha256").update(script).digest("hex"),bridgeTalkBody});
}
function createOwnedAmeNativeDispatchPort(){
  async function prepare(context,leaf){const own=ownedAmeContexts.get(context);if(!own||own.leaf!==leaf||own.preparation||!own.gate||!own.snapshot)trustedFail("owned_initial_original_ame_preparation_required");currentProposalState.assertCurrent(context.record);assertOwnedExecutionContext(context);
    const command=await trustedNative.bindAmeDeliveryFixed(trustedReadDaemon.role,own.gate,own.snapshot,trustedReadDaemon.ame);trustedCurrent();const facts=trustedNative.ameCommandFactsFixed(trustedReadDaemon.role,command),a=facts.descriptor.args;
    if(facts.slot!==own.slot||facts.operation!==(leaf===6?"enqueue":"start")||facts.descriptor.slot!==own.slot)trustedFail("owned_initial_original_ame_command_slot_join",true);
    if(leaf===6){const args={targetSpecifier:a.targetSpecifier,expectedProcess:facts.expectedProcess,timeoutMs:a.timeoutMs,sourceProjectFile:a.sourcePath,expectedSourceSha25664:facts.sourceSha25664,batchId:a.batchId,sourceGuid:a.sourceGuid,presetId:facts.presetId,presetSha25664:facts.presetSha25664,outputFileName:path.basename(a.outputPath),range:a.range,...(a.queueMode==="shared_queue_v1"?{queueMode:ameSharedQueue.MODE}:{})};if(a.boundNativeSessionNonce!==null)args.expectedSessionNonce=a.boundNativeSessionNonce;own.args=Object.freeze(ameTitleJobs.validateInput(ameTitleJobs.ENQUEUE,args));context.args=own.args;}
    const preparation=Object.freeze(Object.create(null));own.preparation=preparation;ownedAmePreparations.set(preparation,{own,context,command,facts,guarded:false,authorized:false,dispatchAttempted:false,dispatched:false,state:null,poll:null});return preparation;
  }
  function original(preparation,context){const row=ownedAmePreparations.get(preparation);if(!row||row.context!==context||ownedAmeContexts.get(context)!==row.own||row.own.preparation!==preparation||row.own.record!==context.record)trustedFail("owned_initial_original_ame_preparation_join");currentProposalState.assertCurrent(context.record);assertOwnedExecutionContext(context);return row;}
  function assertPreparation(preparation,_frozen,context){const row=original(preparation,context);trustedNative.assertAmeCommandCurrentFixed(trustedReadDaemon.role,row.command);if(!row.state||!row.poll||row.poll!==trustedReadDaemon.heldPoll||row.poll.req.aborted||row.poll.res.destroyed||row.poll.res.writableEnded||row.state.project!==row.command)trustedFail("owned_initial_original_ame_delivery_socket_changed",true);row.guarded=true;return true;}
  function authorize(metadata,context,preparation){const row=original(preparation,context);assertPreparation(preparation,null,context);if(row.authorized||row.dispatched||!trustedExact(metadata,["operation","requestNonce","operationBinding","scriptSha25664","bodySha25664"])||metadata.operation!==row.facts.operation||metadata.requestNonce!==row.facts.descriptor.args.requestNonce||metadata.operationBinding!==row.facts.descriptor.args.operationBinding||metadata.scriptSha25664!==row.facts.scriptSha25664||metadata.bodySha25664!==row.facts.bodySha25664)trustedFail("owned_initial_original_ame_authorization_once",true);row.authorized=true;const cap=Object.freeze(Object.create(null));ownedAmeAuthorizations.set(cap,{row,metadata:JSON.stringify(metadata)});return cap;}
  function assertAuthorization(cap,metadata,context){const saved=ownedAmeAuthorizations.get(cap);if(!saved||saved.metadata!==JSON.stringify(metadata)||saved.row.context!==context||!saved.row.guarded||!saved.row.authorized||saved.row.dispatchAttempted||saved.row.dispatched)trustedFail("owned_initial_original_ame_authorization_required");original(saved.row.own.preparation,context);trustedNative.assertAmeCommandCurrentFixed(trustedReadDaemon.role,saved.row.command);return true;}
  async function dispatch(cap,script,metadata,context){assertAuthorization(cap,metadata,context);const row=ownedAmeAuthorizations.get(cap).row,descriptor=row.state.descriptor;if(script!==descriptor.script||crypto.createHash("sha256").update(script).digest("hex")!==row.facts.scriptSha25664)trustedFail("owned_initial_original_ame_script_changed",true);
    row.dispatchAttempted=true; // irreversible before marker reservation or send; UNKNOWN cannot replay
    if(row.own.leaf===7){const shared=ownedSharedQueueContexts.has(context),issuer=shared?ameSharedQueueIssuer:ameManualQueueIssuer,binding=shared?context.ownedSharedQueueBinding:context.ownedManualQueueManifest,grant=shared?context.ownedSharedQueueCapability:context.ownedManualQueueCapability;
      issuer.assertCapability(grant,context,binding);const a=row.facts.descriptor.args;row.manualReservation=issuer.consume(grant,context,binding,{batchId:a.batchId,requestNonce:a.requestNonce,operationBinding:a.operationBinding,reservedAt:new Date().toISOString(),state:"unknown_outcome",transportResolved:false,lastDispatchGuardVerified:true});
      await trustedNative.captureOriginalAmeManualReservationFixed(trustedReadDaemon.role,row.command);trustedCurrent();issuer.assertConsumedForDispatch(grant,context,binding,row.manualReservation);}
    ownedAmeNativeDispatchPort.assertPreparation(row.own.preparation,null,context);row.dispatched=true;const deadline=trustedNative.originalDeadlineProjectionFixed(trustedReadDaemon.role,row.command);clearTimeout(row.poll.deadlineTimer);trustedReadDaemon.heldPoll=null;
    writeJson(row.poll.res,200,{ok:true,command:{...descriptor,remainingCommandMs:deadline.remainingCommandMs,leaseOwner:{panelConnectionId:trustedReadDaemon.connection.panelConnectionId,panelGeneration:trustedReadDaemon.connection.panelGeneration}}});return true;
  }
  return Object.freeze({prepareEnqueue:context=>prepare(context,6),prepareStart:context=>prepare(context,7),assertPreparation,authorize,assertAuthorization,dispatch});
}
function ownedTrustedAmeManualReservation(facts){const context=ownedExecutionRunContext.getStore(),own=ownedAmeContexts.get(context),row=own&&ownedAmePreparations.get(own.preparation);if(!row||row.own!==own||own.leaf!==7||!row.guarded||row.dispatched||!row.manualReservation||m100Protocol.stableStringify(facts)!==m100Protocol.stableStringify(row.facts))trustedFail("owned_initial_original_manual_marker_receipt_required",true);
  currentProposalState.assertCurrent(context.record);assertOwnedExecutionContext(context);const a=facts.descriptor.args,file=path.join(LOG_DIR,"ame-title-jobs","starts",a.batchId+".json");if(file!==facts.reservationFile)trustedFail("owned_initial_original_manual_marker_root_changed",true);const raw=fs.readFileSync(file,"utf8");if(raw!==JSON.stringify(row.manualReservation)+"\n")trustedFail("owned_initial_original_manual_marker_bytes_changed",true);return {schema:"ae-agent.owned-original-ame-manual-reservation.v1",raw,rawSha25664:crypto.createHash("sha256").update(raw,"utf8").digest("hex")};}
function ownedFixedRestorationHost(original,d,nativeSnapshot){
  function bad(code){throw Error(code);}
  function equal(a,b){var k,ac=0,bc=0;if(a===b)return true;if(a===null||b===null||typeof a!==typeof b||typeof a!=="object"||(a instanceof Array)!==(b instanceof Array))return false;for(k in a)if(Object.prototype.hasOwnProperty.call(a,k)){ac++;if(!Object.prototype.hasOwnProperty.call(b,k)||!equal(a[k],b[k]))return false;}for(k in b)if(Object.prototype.hasOwnProperty.call(b,k))bc++;return ac===bc;}
  if(!app.project||!app.project.file||app.project.file.fsName!==d.expectedCurrent.projectFile||app.project.dirty!==false||d.slot!==original.slot||d.schema!=="ae-agent.owned-native-restoration-delivery.v1")bad("owned_restore_original_current_required");
  var before=ownedFixedTitleState(original,d.expectedCurrent.projectFile,nativeSnapshot);
  if(!equal(before,d.expectedCurrent))bad("owned_restore_staged_ram_changed");
  if(!ownedUiRestoreSupported(original.originalUi))bad("owned_restore_operand_unsupported");
  // Physical source/ancestor/hash guards are held by the original native
  // dispatch owner; fsName here is only the already admitted exact selector.
  app.open(new File(original.sourceProjectFile));
  if(!app.project||!app.project.file||app.project.file.fsName!==original.sourceProjectFile||app.project.dirty!==false)bad("owned_restore_source_open_readback");
  var reopened=ownedFixedTitleState(original,original.sourceProjectFile,nativeSnapshot);
  ownedCopiedTitleGraphJoin(original.originalGraph,reopened.graph,original.selectedTextLayerIds,0,original.sourceProjectFile,"original_source_restore_v1");
  var ui=ownedUiRestore(original.originalUi,original.sourceProjectFile);
  var after=ownedFixedTitleState(original,original.sourceProjectFile,nativeSnapshot);
  ownedCopiedTitleGraphJoin(original.originalGraph,after.graph,original.selectedTextLayerIds,0,original.sourceProjectFile,"original_source_restore_v1");
  if(!equal(after.uiBaseline,ui.after))bad("owned_restore_independent_ui_readback");
  return {schema:"ae-agent.owned-native-restoration-result.v1",operation:"restore",slot:d.slot,sourceProjectFile:original.sourceProjectFile,before:before,reopened:reopened,after:after,ui:ui};
}
function ownedRestorationProgramSource(d){
  const source=nativeRenderVariant.inspectScript({expectedProjectFile:d.sourceProjectFile,rootCompItemId:d.originalGraph.rootCompItemId,variantCompItemId:d.originalGraph.variantCompItemId,controlledLayerIds:d.selectedTextLayerIds}),at=source.lastIndexOf("return nativeSnapshot(");
  if(at<0||!source.endsWith(");"))throw Object.assign(Error("owned_initial_restore_snapshot_generator_shape"),{code:"owned_initial_restore_snapshot_generator_shape"});
  const marker="__OWNED_NATIVE_RESTORE_OPERAND_V1__";
  const body=source.slice(0,at)+"var ownedFirstTwoTitleInventory="+ownedFirstTwoTitleInventory.toString()+";var ownedInitialUiBaseline="+ownedInitialUiBaseline.toString()+";var ownedCopiedTitleInventoryJoin="+ownedCopiedTitleInventoryJoin.toString()+";var ownedCopiedTitleGraphJoin="+ownedCopiedTitleGraphJoin.toString()+";var ownedObservedRootTiming="+ownedObservedRootTiming.toString()+";var ownedFixedTitleState="+ownedFixedTitleState.toString()+";var ownedUiRestoreSupported="+ownedUiBaseline.supportedOperand.toString()+";var ownedUiRestore="+ownedUiBaseline.restoreUiBaseline.toString()+";var ownedFixedRestorationHost="+ownedFixedRestorationHost.toString()+";return ownedFixedRestorationHost("+aeLiteral(d)+","+marker+",nativeSnapshot);";
  const wrapped=wrapExtendScriptBody(body),offset=wrapped.indexOf(marker);if(offset<0||wrapped.indexOf(marker,offset+marker.length)>=0||Buffer.byteLength(wrapped,"utf8")>1048576)throw Object.assign(Error("owned_initial_restore_program_bound"),{code:"owned_initial_restore_program_bound"});
  return {name:"run_ai_agent_plan",prefix:wrapped.slice(0,offset),suffix:wrapped.slice(offset+marker.length)};
}
function ownedTrustedRestorationProgram(input){
  if(!initialRuntime||!trustedReadDaemon.role||!trustedExact(input,["descriptor","descriptorSha25664"])||input.descriptor?.schema!=="ae-agent.owned-native-stage-descriptor.v1")throw Object.assign(Error("owned_initial_restore_preissue_getter_required"),{code:"owned_initial_restore_preissue_getter_required"});
  initialRuntime.assertIngress();const context=ownedExecutionRunContext.getStore();currentProposalState.assertCurrent(context&&context.record);assertOwnedExecutionContext(context);
  if(context.args?.ownedTitleProgram?.operation!=="stage"||context.args.ownedTitleProgram.slot!==input.descriptor.slot||!ownedUiBaseline.supportedOperand(input.descriptor.originalUi))throw Object.assign(Error("owned_initial_restore_preissue_stage_join"),{code:"owned_initial_restore_preissue_stage_join"});
  return Object.freeze(ownedRestorationProgramSource(input.descriptor));
}
async function ownedTrustedRestorationScript(input){
  if(!initialRuntime||!trustedReadDaemon.role||!trustedExact(input,["descriptor","descriptorSha25664"])||input.descriptor?.schema!=="ae-agent.owned-native-restoration-delivery.v1")throw Object.assign(Error("owned_initial_restore_delivery_getter_required"),{code:"owned_initial_restore_delivery_getter_required"});
  initialRuntime.assertIngress();const context=ownedExecutionRunContext.getStore();currentProposalState.assertCurrent(context&&context.record);assertOwnedExecutionContext(context);
  const d=input.descriptor;if(context.args?.ownedTitleProgram?.operation!=="restore"||context.args.ownedTitleProgram.slot!==d.slot)throw Object.assign(Error("owned_initial_exact_restore_manual_operand_required"),{code:"owned_initial_exact_restore_manual_operand_required"});
  const parts=ownedRestorationProgramSource(d.original),script=parts.prefix+aeLiteral(d)+parts.suffix;if(Buffer.byteLength(script,"utf8")>1048576)throw Object.assign(Error("owned_initial_restore_delivery_bound"),{code:"owned_initial_restore_delivery_bound"});
  return Object.freeze({name:"run_ai_agent_plan",script,scriptSha25664:crypto.createHash("sha256").update(script).digest("hex")});
}
async function ownedTrustedReadonlyScript(request){
  if(!initialRuntime||!trustedReadDaemon.role||!request||typeof request!=="object"||Array.isArray(request)||
      Object.keys(request).sort().join(",")!=="args,name,titleRangeMode,titleSelectionMode"||!["first_two_observed_text_states_v1","exact_named_variants"].includes(request.titleSelectionMode)||
      !["frozen_literal_range","full_observed_root_range_v1"].includes(request.titleRangeMode)||(request.titleRangeMode==="full_observed_root_range_v1"&&request.titleSelectionMode!=="first_two_observed_text_states_v1")||
      !["get_comp_details","get_layer_details","inspect_title_variants"].includes(request.name)||
      !request.args||typeof request.args!=="object"||Array.isArray(request.args))
    throw Object.assign(Error("owned_initial_readonly_script_producer_required"),{code:"owned_initial_readonly_script_producer_required"});
  initialRuntime.assertIngress();const preparation={name:request.name,titleSelectionMode:request.titleSelectionMode,titleRangeMode:request.titleRangeMode,script:null,fixtureResult:null,count:0};
  ownedReadonlyScriptPreparations.add(preparation);
  try{
    if(request.name==="inspect_title_variants"){
      const args=nativeRenderVariant.validateInput(request.name,request.args),source=nativeRenderVariant.inspectScript(args);
      // Same charged native snapshot delivery. It carries actual inventory
      // for each visited comp and a fresh dirty/source/font read, never caller
      // supplied readiness or a new inspection dispatch.
      const observed=request.titleRangeMode==="full_observed_root_range_v1";
      preparation.script=wrapExtendScriptBody(request.titleSelectionMode==="first_two_observed_text_states_v1"?`var ownedFirstTwoTitleInventory=${ownedFirstTwoTitleInventory.toString()};${observed?`var ownedObservedRootTiming=${ownedObservedRootTiming.toString()};`:""}var captured=(function(){${source}})();captured.ownedTitleInventories=[];${observed?"captured.ownedObservedTimings=[];":""}for(var gi=0;gi<captured.graph.length;gi++){var selected=null;for(var pi=1;pi<=app.project.numItems;pi++){var candidate=app.project.item(pi);if(candidate.id===captured.graph[gi].id){if(selected)throw Error("owned_title_comp_ambiguous");selected=candidate;}}if(!selected)throw Error("owned_title_comp_absent");captured.ownedTitleInventories.push(ownedFirstTwoTitleInventory(selected));${observed?"captured.ownedObservedTimings.push(selected.id===captured.rootCompItemId?ownedObservedRootTiming(selected):null);":""}}return captured;`:source);preparation.count=1;
    }else await scriptPreparationContext.run(preparation,()=>callTool(request.name,request.args));
    initialRuntime.assertIngress();
    if(preparation.count!==1||typeof preparation.script!=="string"||!preparation.script||Buffer.byteLength(preparation.script,"utf8")>1048576)
      throw Object.assign(Error("owned_initial_single_readonly_script_required"),{code:"owned_initial_single_readonly_script_required"});
    // This is generated source only. It neither enqueues nor supplies a fake
    // AE result; D41..44 must bind and actually deliver it before any capture.
    return Object.freeze({name:request.name,script:preparation.script,scriptSha25664:crypto.createHash("sha256").update(preparation.script).digest("hex")});
  }finally{ownedReadonlyScriptPreparations.delete(preparation);}
}
async function ownedTrustedReadObserve(challenge){
  if(!initialRuntime||!trustedReadDaemon.role||!trustedReadDaemon.target||!trustedReadDaemon.cep||trustedReadDaemon.closing)
    throw Object.assign(Error("owned_initial_private_observer_required"),{code:"owned_initial_private_observer_required"});
  const native=require("./owned-runtime-initial-native-client"),role=trustedReadDaemon.role;
  native.assertCapturedCurrent(role,trustedReadDaemon.target);trustedReadDaemon.cep.assertCurrent();
  let poll=trustedReadDaemon.heldPoll;
  if(!poll){if(trustedReadDaemon.pollWaiter)throw Object.assign(Error("owned_initial_poll_wait_once"),{code:"owned_initial_poll_wait_once"});
    poll=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{trustedReadDaemon.pollWaiter=null;reject(Object.assign(Error("owned_initial_actual_poll_timeout"),{code:"owned_initial_actual_poll_timeout"}));},1000);
      trustedReadDaemon.pollWaiter={resolve:value=>{clearTimeout(timer);trustedReadDaemon.pollWaiter=null;resolve(value);}};});}
  native.assertCapturedCurrent(role,trustedReadDaemon.target);trustedReadDaemon.cep.assertCurrent();
  if(poll!==trustedReadDaemon.heldPoll||poll.req.aborted||poll.res.destroyed||poll.res.writableEnded)
    throw Object.assign(Error("owned_initial_original_poll_changed"),{code:"owned_initial_original_poll_changed"});
  const capture=await trustedReadDaemon.cep.observe(challenge);native.assertCapturedCurrent(role,trustedReadDaemon.target);trustedReadDaemon.cep.assertCurrent();
  if(poll!==trustedReadDaemon.heldPoll||poll.req.aborted||poll.res.destroyed||poll.res.writableEnded)
    throw Object.assign(Error("owned_initial_original_poll_changed"),{code:"owned_initial_original_poll_changed"});
  return {request:poll.req,capture};
}

function trustedFail(code,unknown=false){throw Object.assign(Error(code),{code,unknown});}
function trustedExact(value,keys){return value!==null&&typeof value==="object"&&!Array.isArray(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));}
function trustedCurrent(){initialRuntime.assertIngress();if(trustedReadDaemon.closing)trustedFail("owned_initial_daemon_draining");if(trustedReadDaemon.idlePollClosed)trustedFail("owned_initial_original_poll_closed");if(trustedReadDaemon.activeTool&&trustedReadDaemon.activeTool.error)throw trustedReadDaemon.activeTool.error;}
function trustedQuery(url,keys){if(url.searchParams.size!==keys.length||keys.some(key=>url.searchParams.getAll(key).length!==1)||[...url.searchParams.keys()].some(key=>!keys.includes(key)))trustedFail("owned_initial_exact_query_required");}
async function trustedBody(req){return new Promise((resolve,reject)=>{let bytes=0,settled=false;const chunks=[];
  const done=(error,value)=>{if(settled)return;settled=true;error?reject(error):resolve(value);};
  req.on("data",chunk=>{bytes+=chunk.length;if(bytes>1048576){chunks.length=0;done(Object.assign(Error("owned_initial_body_limit"),{code:"owned_initial_body_limit"}));}else if(!settled)chunks.push(Buffer.from(chunk));});
  req.once("aborted",()=>done(Object.assign(Error("owned_initial_request_aborted"),{code:"owned_initial_request_aborted",unknown:true})));req.once("error",done);
  req.once("end",()=>{if(req.complete!==true)return done(Object.assign(Error("owned_initial_request_incomplete"),{code:"owned_initial_request_incomplete",unknown:true}));done(null,Buffer.concat(chunks));});});}
function trustedPollIdentity(url){trustedQuery(url,["panelConnectionId","panelGeneration","panelInstanceId","panelLifecycleEpoch","projectFile"]);
  const connection=url.searchParams.get("panelConnectionId"),generation=url.searchParams.get("panelGeneration"),instance=url.searchParams.get("panelInstanceId"),epoch=url.searchParams.get("panelLifecycleEpoch");
  if([connection,generation,instance].some(value=>!value||value.length>256||value.includes("\0"))||!/^\d{1,16}$/.test(epoch)||!Number.isSafeInteger(Number(epoch)))trustedFail("owned_initial_panel_identity_required");
  return {panelConnectionId:connection,panelGeneration:generation,panelInstanceId:instance,panelLifecycleEpoch:Number(epoch)};}
function trustedObservePanel(identity,req){const previous=trustedReadDaemon.connection;
  if(previous&&Object.keys(identity).some(key=>identity[key]!==previous[key]))trustedFail("owned_initial_panel_generation_changed",true);
  if(!previous)trustedReadDaemon.connection=Object.freeze(identity);lastPanelSeenAt=Date.now();lastPanelInfo={...identity,userAgent:req.headers["user-agent"]||null,at:lastPanelSeenAt};}
async function trustedWaitTarget(req,res){if(trustedReadDaemon.target&&trustedReadDaemon.cep)return;trustedCurrent();
  await new Promise((resolve,reject)=>{const item={resolve:()=>{clearTimeout(timer);trustedReadDaemon.targetWaiters.delete(item);resolve();},reject:error=>{clearTimeout(timer);trustedReadDaemon.targetWaiters.delete(item);reject(error);}};
    const timer=setTimeout(()=>item.reject(Object.assign(Error("owned_initial_target_capture_timeout"),{code:"owned_initial_target_capture_timeout"})),30000);
    trustedReadDaemon.targetWaiters.add(item);res.once("close",()=>{if(!res.writableFinished)item.reject(Object.assign(Error("owned_initial_original_startup_request_lost"),{code:"owned_initial_original_startup_request_lost",unknown:true}));});
    if(req.aborted)item.reject(Object.assign(Error("owned_initial_original_startup_request_lost"),{code:"owned_initial_original_startup_request_lost",unknown:true}));});
  trustedCurrent();trustedNative.assertCapturedCurrent(trustedReadDaemon.role,trustedReadDaemon.target);}
async function trustedWaitPoll(){if(trustedReadDaemon.heldPoll)return trustedReadDaemon.heldPoll;
  if(trustedReadDaemon.pollWaiter)trustedFail("owned_initial_poll_wait_once");
  return new Promise((resolve,reject)=>{let timer,settled=false;const waiter={resolve:value=>{if(settled||trustedReadDaemon.pollWaiter!==waiter)return false;settled=true;clearTimeout(timer);trustedReadDaemon.pollWaiter=null;resolve(value);return true;},
    cancel:error=>{if(settled)return false;settled=true;clearTimeout(timer);if(trustedReadDaemon.pollWaiter===waiter)trustedReadDaemon.pollWaiter=null;reject(error);return true;}};
    trustedReadDaemon.pollWaiter=waiter;timer=setTimeout(()=>waiter.cancel(Object.assign(Error("owned_initial_actual_poll_timeout"),{code:"owned_initial_actual_poll_timeout",unknown:true})),1000);});}
function trustedHoldPoll(poll){if(trustedReadDaemon.idlePollClosed)trustedFail("owned_initial_original_poll_closed");if(trustedReadDaemon.heldPoll)trustedFail("owned_initial_concurrent_panel_poll",true);
  const deadline=trustedNative.originalDeadlineProjectionFixed(trustedReadDaemon.role);
  if(!Number.isSafeInteger(deadline.remainingSessionMs)||deadline.remainingSessionMs<=0||deadline.remainingSessionMs>28800000)trustedFail("owned_initial_original_poll_deadline_required");
  trustedReadDaemon.heldPoll=poll;
  poll.deadlineTimer=setTimeout(()=>{if(trustedReadDaemon.heldPoll!==poll)return;trustedReadDaemon.heldPoll=null;trustedReadDaemon.idlePollClosed=true;
    const error=Object.assign(Error("owned_initial_original_poll_deadline"),{code:"owned_initial_original_poll_deadline",unknown:!!trustedReadDaemon.activeTool});
    trustedReadDaemon.activeTool?.reject?.(error);poll.req.socket.destroy();},deadline.remainingSessionMs);
  poll.res.once("close",()=>{clearTimeout(poll.deadlineTimer);if(trustedReadDaemon.heldPoll===poll){trustedReadDaemon.heldPoll=null;
    if(!poll.res.writableFinished){trustedReadDaemon.idlePollClosed=true;trustedReadDaemon.activeTool?.reject?.(Object.assign(Error("owned_initial_actual_poll_lost"),{code:"owned_initial_actual_poll_lost",unknown:true}));}}});
  if(trustedReadDaemon.pollWaiter)trustedReadDaemon.pollWaiter.resolve(poll);}
async function trustedObserveHandler(handler){const role=trustedReadDaemon.role;
  const readiness=await trustedNative.takeChallenge(role,handler);trustedCurrent();const measured=await trustedNative.captureObservationFixed(role,trustedReadDaemon.target,readiness);trustedCurrent();
  await trustedNative.submitObservation(role,readiness,measured);trustedCurrent();const same=await trustedNative.takeChallenge(role,handler);trustedCurrent();
  const sameMeasured=await trustedNative.captureObservationFixed(role,trustedReadDaemon.target,same);trustedCurrent();
  await trustedNative.submitObservation(role,same,sameMeasured);trustedCurrent();return sameMeasured;}
async function trustedBootstrap(handler){if(trustedReadDaemon.bootstrapStarted)trustedFail("owned_initial_bootstrap_once_spent");trustedReadDaemon.bootstrapStarted=true;
  if(fs.existsSync(EDIT_SESSION_ACTIVE_FILE))trustedFail("owned_initial_existing_edit_session_requires_reconciliation");
  const role=trustedReadDaemon.role,preactor=await trustedNative.captureOriginalAeFixed(role);trustedCurrent();
  const present=await trustedObservers.inspectPreactorTargetFixed(role,preactor);trustedCurrent();
  const bootstrap=await trustedNative.reservePanelBootstrapFixed(role,handler,preactor);trustedCurrent();
  if(!present){await trustedNative.launchPanelBootstrapFixed(role,bootstrap,preactor);trustedCurrent();
    // Passive target discovery may wait; the irreversible OS target capture is
    // attempted exactly once after the fixed page is actually present.
    let appeared=false;for(let i=0;i<20;i++){if(await trustedObservers.inspectPreactorTargetFixed(role,preactor)){appeared=true;break;}trustedCurrent();await new Promise(resolve=>setTimeout(resolve,250));trustedCurrent();}
    if(!appeared)trustedFail("owned_initial_bootstrap_target_not_observed",true);}
  trustedNative.assertBootstrapSettled(role);trustedCurrent();trustedReadDaemon.target=await trustedNative.captureOriginalAeCepFixed(role);trustedCurrent();
  trustedReadDaemon.cep=await trustedObservers.bindLoadedCepFixed(role,trustedReadDaemon.target);trustedCurrent();
  // Loaded original CEP source precedes startup replies. This does not wait
  // for the later held GETnext/challenge/PANEL/READ.
  for(const waiter of [...trustedReadDaemon.targetWaiters])waiter.resolve();
  await trustedWaitPoll();trustedCurrent();const observed=await trustedObserveHandler(handler);trustedCurrent();
  await trustedNative.observeActor(role,handler,observed);trustedCurrent();return toolResult({ok:true,panelConnected:true,authorityMode:"local_controller_session",genuineChatIdentity:false,replayAllowed:false});}
async function trustedOriginalCompletionPoll(originalJob,slot){const role=trustedReadDaemon.role;
  if(![1,2].includes(slot)||trustedReadDaemon.ameJobs[slot-1]!==originalJob)trustedFail("owned_initial_original_completion_job_required");trustedCurrent();
  const project=await trustedNative.beginOriginalCompletionPollFixed(role,originalJob);trustedCurrent();const descriptor=trustedNative.describeOriginalCompletionPollFixed(role,project);
  if(!descriptor||typeof descriptor.id!=="string"||trustedReadDaemon.projects.has(descriptor.id))trustedFail("owned_initial_original_completion_descriptor",true);
  let state,timer,ownedWaiter;const completion=new Promise((resolve,reject)=>{state={project,descriptor,inspection:true,preparation:false,restoration:false,ame:true,ameOperation:trustedReadDaemon.executionProfile==="shared_queue_v1"?"shared_status":"status",stage:false,stageSlot:slot,name:ameTitleJobs.STATUS,resolve,reject,delivered:false,submitted:false,deadlineError:null};trustedReadDaemon.projects.set(descriptor.id,state);
    const remaining=trustedNative.originalDeadlineProjectionFixed(role,project).remainingCommandMs;if(!Number.isSafeInteger(remaining)||remaining<=0||remaining>10000)trustedFail("owned_initial_original_completion_deadline",true);
    timer=setTimeout(()=>{const error=Object.assign(Error("owned_initial_original_completion_timeout"),{code:"owned_initial_original_completion_timeout",unknown:true});state.deadlineError=error;reject(error);},remaining);});
  void completion.catch(()=>{});const current=()=>{trustedCurrent();if(state.deadlineError)throw state.deadlineError;trustedNative.assertCurrent(role,project);};
  try{const priorWaiter=trustedReadDaemon.pollWaiter,waiting=trustedWaitPoll();if(!priorWaiter)ownedWaiter=trustedReadDaemon.pollWaiter;
    const poll=await Promise.race([waiting,completion]);current();if(poll!==trustedReadDaemon.heldPoll||poll.req.aborted||poll.res.destroyed||poll.res.writableEnded)trustedFail("owned_initial_original_completion_poll_lost",true);
    const request=trustedHttp.requestCapability(role,poll.req);await trustedNative.selectOriginalCompletionPollFixed(role,project,request);current();state.delivered=true;const deadline=trustedNative.originalDeadlineProjectionFixed(role,project);current();clearTimeout(poll.deadlineTimer);trustedReadDaemon.heldPoll=null;
    writeJson(poll.res,200,{ok:true,command:{...descriptor,remainingCommandMs:deadline.remainingCommandMs,leaseOwner:{panelConnectionId:trustedReadDaemon.connection.panelConnectionId,panelGeneration:trustedReadDaemon.connection.panelGeneration}}});const result=await completion;trustedCurrent();return result;
  }catch(error){ownedWaiter?.cancel(error);try{await trustedNative.abandonOriginalCompletionPollFixed(role,project);}catch(abandonment){error.abandonmentCode=abandonment.code||"owned_original_poll_abandonment_closed";}throw Object.assign(error,{unknown:true});}finally{clearTimeout(timer);ownedWaiter?.cancel(state.deadlineError||Object.assign(Error("owned_initial_original_completion_wait_closed"),{unknown:true}));trustedReadDaemon.projects.delete(descriptor.id);}
}
function trustedStartSharedQueueCompletion(originalJob){
  if(trustedReadDaemon.sharedQueueFlight||trustedReadDaemon.ameJobs[1]!==originalJob)trustedFail("owned_initial_shared_observation_once",true);
  const flight={originalJob,complete:false,unknown:false,promise:null};trustedReadDaemon.sharedQueueFlight=flight;
  flight.promise=(async()=>{
    while(trustedReadDaemon.activeTool){await new Promise(resolve=>setTimeout(resolve,25));trustedCurrent();}
    for(let index=0;index<10;index++){const facts=trustedNative.originalCompletionFactsFixed(trustedReadDaemon.role,originalJob);if(facts.complete){await trustedNative.acknowledgeSharedQueueIoFixed(trustedReadDaemon.role,originalJob);flight.complete=true;return facts;}
      if(!Number.isSafeInteger(facts.remainingPolls)||facts.remainingPolls<1||facts.nextPollDelayMs>=facts.remainingJobMs)trustedFail("owned_initial_shared_observation_budget_unknown",true);
      if(facts.nextPollDelayMs)await new Promise(resolve=>setTimeout(resolve,facts.nextPollDelayMs));trustedCurrent();while(trustedReadDaemon.activeTool){await new Promise(resolve=>setTimeout(resolve,25));trustedCurrent();}
      await trustedOriginalCompletionPoll(originalJob,2);if(trustedReadDaemon.sharedQueueResponseCleanup){await trustedReadDaemon.sharedQueueResponseCleanup;trustedReadDaemon.sharedQueueResponseCleanup=null;}trustedCurrent();
      if(trustedNative.originalCompletionFactsFixed(trustedReadDaemon.role,originalJob).complete){await trustedNative.acknowledgeSharedQueueIoFixed(trustedReadDaemon.role,originalJob);flight.complete=true;return;}
    }
    trustedFail("owned_initial_shared_observation_limit_unknown",true);
  })();void flight.promise.catch(error=>{flight.unknown=true;flight.error=error;trustedReadDaemon.activeTool?.reject?.(error);});return flight;
}
function trustedStartOriginalCompletion(originalJob,slot){if(![1,2].includes(slot)||trustedReadDaemon.ameJobs[slot-1]!==originalJob)trustedFail("owned_initial_original_completion_start_required",true);
  if(!trustedReadDaemon.completionFlights)trustedReadDaemon.completionFlights=[null,null];if(trustedReadDaemon.completionFlights[slot-1])trustedFail("owned_initial_original_completion_lifetime_once",true);
  const flight={originalJob,slot,unknown:false,complete:false,promise:null};trustedReadDaemon.completionFlights[slot-1]=flight;
  flight.promise=(async()=>{for(let index=0;index<10;index++){trustedCurrent();const facts=trustedNative.originalCompletionFactsFixed(trustedReadDaemon.role,originalJob);
      if(facts.complete){await trustedPublishOriginalCompletion(flight);flight.complete=true;return;}if(!Number.isSafeInteger(facts.remainingPolls)||facts.remainingPolls<=0||!Number.isSafeInteger(facts.nextPollDelayMs)||facts.nextPollDelayMs<0||facts.nextPollDelayMs>=facts.remainingJobMs)trustedFail("owned_initial_original_completion_budget_closed",true);
      if(facts.nextPollDelayMs)await new Promise(resolve=>setTimeout(resolve,facts.nextPollDelayMs));trustedCurrent();await trustedOriginalCompletionPoll(originalJob,slot);
      if(trustedNative.originalCompletionFactsFixed(trustedReadDaemon.role,originalJob).complete){await trustedPublishOriginalCompletion(flight);flight.complete=true;return;}}
    trustedFail("owned_initial_original_completion_poll_limit",true);
  })();void flight.promise.catch(error=>{flight.unknown=true;flight.error=error;trustedReadDaemon.activeTool?.reject?.(error);});return flight;
}
async function trustedPublishOriginalCompletion(flight){const index=flight.slot-1,terminal=trustedReadDaemon.completionTerminals?.[index];
  const cleanup=trustedReadDaemon.completionResultCleanups?.[index];
  if(trustedReadDaemon.completionFlights?.[index]!==flight||trustedReadDaemon.ameJobs[index]!==flight.originalJob||!terminal||!cleanup||cleanup.terminal!==terminal||flight.publicationPromise)trustedFail("owned_initial_original_completion_publication_join",true);
  flight.publicationPromise=(async()=>{await cleanup.promise;
    if(trustedReadDaemon.completionFlights?.[index]!==flight||trustedReadDaemon.ameJobs[index]!==flight.originalJob||trustedReadDaemon.completionTerminals?.[index]!==terminal||trustedReadDaemon.completionResultCleanups?.[index]!==cleanup)
      trustedFail("owned_initial_original_completion_producer_cleanup_drift",true);
    trustedCurrent();return trustedNative.publishOwnCompletionReadyFixed(trustedReadDaemon.role,terminal);
  })();void flight.publicationPromise.catch(()=>{});await flight.publicationPromise;trustedCurrent();flight.published=true;
}
async function trustedProject(handler){return trustedCommand(handler,false);}
async function trustedReadonlyInspection(handler,name,args){return trustedCommand(handler,true,name,[ameTitleJobs.INSPECT,ameTitleJobs.QUEUE_MANIFEST].includes(name)?{operation:"ame_inspection",slot:args.variantSlot}:null);}
async function trustedCommand(handler,inspection,name,stageInputs=null){const role=trustedReadDaemon.role,ameInspection=stageInputs?.operation==="ame_inspection",ameEffect=stageInputs?.operation==="ame",ame=ameInspection||ameEffect,preparation=name==="run_ai_agent_plan"&&!stageInputs,restoration=stageInputs?.operation==="restore";
  if(ameInspection){if(![1,2].includes(stageInputs.slot)||!trustedReadDaemon.savedSnapshots[stageInputs.slot-1])trustedFail("owned_initial_original_saved_snapshot_before_ame_read");if(!trustedReadDaemon.ame){trustedReadDaemon.ame=await trustedNative.captureOriginalAmeFixed(role);trustedCurrent();}}
  const prepared=ameEffect?ownedAmePreparations.get(stageInputs.preparation):null;
  if(ameEffect&&(!prepared||prepared.context!==stageInputs.context||prepared.own.slot!==stageInputs.slot))trustedFail("owned_initial_original_ame_prepared_command_required");
  const project=await (ameEffect?prepared.command:ameInspection?trustedNative.bindAmeSourceInspectionFixed(role,handler,trustedReadDaemon.savedSnapshots[stageInputs.slot-1],trustedReadDaemon.ame):restoration?trustedNative.bindRestorationDeliveryFixed(role,stageInputs.gate,stageInputs.program):stageInputs?trustedNative.bindStageDeliveryFixed(role,stageInputs.gate,stageInputs.workingCopy):preparation?trustedNative.bindPreparationDeliveryFixed(role,handler,trustedReadDaemon.titleManifest,trustedReadDaemon.lastCompTerminal):inspection?trustedNative.bindExecutionFixed(role,handler):trustedNative.bindProjectFixed(role,handler));trustedCurrent();
  const descriptor=inspection?trustedNative.describeExecution(role,project):trustedNative.describeProject(role,project);if(!descriptor||typeof descriptor.id!=="string"||trustedReadDaemon.projects.has(descriptor.id))trustedFail("owned_initial_original_project_descriptor",true);
  let timer,state;const completion=new Promise((resolve,reject)=>{state={project,descriptor,inspection,preparation,restoration,ame,ameOperation:ameInspection?(name===ameTitleJobs.INSPECT?"sources":"queue"):ameEffect?prepared.facts.operation:null,stage:!!stageInputs&&!restoration&&!ame,stageSlot:stageInputs?.slot,name,resolve,reject,delivered:false,submitted:false,deadlineError:null};trustedReadDaemon.projects.set(descriptor.id,state);
    timer=setTimeout(()=>{const error=Object.assign(Error("owned_initial_project_terminal_timeout"),{code:"owned_initial_project_terminal_timeout",unknown:true});state.deadlineError=error;
      reject(error);if(trustedReadDaemon.activeTool?.reject)trustedReadDaemon.activeTool.reject(error);},30000);});
  // Handle the deadline immediately. HTTP may settle early, but this operation
  // retains its original pending native owner until that exact await settles.
  void completion.catch(()=>{});const commandCurrent=()=>{trustedCurrent();if(state.deadlineError)throw state.deadlineError;};
  try{const poll=await trustedWaitPoll();commandCurrent();if(poll!==trustedReadDaemon.heldPoll||poll.req.aborted||poll.res.destroyed||poll.res.writableEnded)trustedFail("owned_initial_actual_delivery_request_changed",true);
    const request=trustedHttp.requestCapability(role,poll.req),selected=await (inspection?trustedNative.selectExecution(role,project,request):trustedNative.selectProject(role,project,request));commandCurrent();
    await (inspection?trustedNative.guardExecution(role,selected,request):trustedNative.guardProject(role,selected,request));commandCurrent();state.delivered=true;
    if(ameEffect){prepared.state=state;prepared.poll=poll;const f=prepared.facts,metadata={operation:f.operation,requestNonce:f.descriptor.args.requestNonce,operationBinding:f.descriptor.args.operationBinding,scriptSha25664:f.scriptSha25664,bodySha25664:f.bodySha25664};ownedAmeNativeDispatchPort.assertPreparation(stageInputs.preparation,null,stageInputs.context);const authorization=ownedAmeNativeDispatchPort.authorize(metadata,stageInputs.context,stageInputs.preparation);await ownedAmeNativeDispatchPort.dispatch(authorization,descriptor.script,metadata,stageInputs.context);commandCurrent();const result=await completion;commandCurrent();return toolResult(result);}
    // Native records D44 only from this original response's real finish and the
    // exact bytes retained by the transport. This send has no caller receipt.
    const deadline=trustedNative.originalDeadlineProjectionFixed(role,project);commandCurrent();clearTimeout(poll.deadlineTimer);
    trustedReadDaemon.heldPoll=null;writeJson(poll.res,200,{ok:true,command:{...descriptor,remainingCommandMs:deadline.remainingCommandMs,leaseOwner:{panelConnectionId:trustedReadDaemon.connection.panelConnectionId,panelGeneration:trustedReadDaemon.connection.panelGeneration}}});
    const result=await completion;commandCurrent();return toolResult(result);
  }catch(error){throw Object.assign(error,{unknown:true});}finally{clearTimeout(timer);trustedReadDaemon.projects.delete(descriptor.id);}}
function ownedFixedManualRecord(body){
  const keys=["actionId","payloadRef","payloadHash","previewHash","riskLevel","riskPolicyVersion","requestId","dryRun","confirm","allowMutations","autoEditSession","timeoutMs","confirmationToken","confirmedBySurface","confirmedBySession"];
  const record=currentProposalState.current,own=ownedFixedTitleManualReceipts.get(record);currentProposalState.assertCurrent(record);
  const fixed=ownedFixedTitleProposals.get(record),start=fixed?.leaf===7;if(start)keys.push("ameManualQueueWitness");
  if(!trustedExact(body,keys)||!own||!own.adopted||own.executing||!own.completedDryRun||!own.proposalTerminal||!own.dryTerminal||record.executionState!=="pending"||
      record.confirmedAt||body.dryRun!==false||body.confirm!==true||body.allowMutations!==true||body.autoEditSession!==true||body.timeoutMs!==120000||
      body.confirmationToken!==own.token||m100Protocol.hashConfirmationToken(body.confirmationToken)!==record.confirmationTokenHash||
      body.confirmedBySurface!=="cep-panel"||body.confirmedBySession!==own.panel.confirmationSessionId||
      ["actionId","payloadRef","payloadHash","previewHash","riskLevel","riskPolicyVersion","requestId"].some(key=>body[key]!==record[key]))
    trustedFail("owned_initial_original_manual_run_required");
  if(start){const witness=body.ameManualQueueWitness,queue=trustedReadDaemon.ameQueueFacts?.[fixed.slot-1];if(!trustedExact(witness,["acceptedDryRunId","declaration","manifestHash","panelConnectionId","panelGeneration","trustedGesture"])||!queue||witness.acceptedDryRunId!==JSON.parse(own.completedDryRun).id||witness.declaration!==ameManualQueue.SINGLE_DECLARATION||witness.manifestHash!==queue.value.manifestSha25664||witness.panelConnectionId!==own.panel.panelConnectionId||witness.panelGeneration!==own.panel.panelGeneration||witness.trustedGesture!==true)trustedFail("owned_initial_original_protected_START_witness_required");}
  ownedOriginalPreparationPanel(own.panel);return record;
}
async function trustedManualRun(req,res,request,body){
  const value=JSON.parse(body.toString("utf8")),record=ownedFixedManualRecord(value);
  const fixed=ownedFixedTitleProposals.get(record),route=new URL(req.url,"http://127.0.0.1:3456").pathname;if(route!==(fixed.leaf===7?ameManualQueue.ROUTE:"/agents/plan/run"))trustedFail("owned_initial_exact_original_manual_route_required");
  if(trustedReadDaemon.manualPending||trustedReadDaemon.activeTool&&!trustedReadDaemon.activeTool.execute)trustedFail("owned_initial_original_manual_run_once");
  let pending,timer;const completion=new Promise((resolve,reject)=>{pending={record,value,request,authRole:res.authRole,route,resolve,reject,started:false,error:null};
    timer=setTimeout(()=>{pending.error=Object.assign(Error("owned_initial_original_manual_join_timeout"),{code:"owned_initial_original_manual_join_timeout",unknown:pending.started});pending.reject(pending.error);trustedReadDaemon.activeTool?.reject?.(pending.error);},30000);});
  void completion.catch(()=>{});trustedReadDaemon.manualPending=pending;
  res.once("close",()=>{if(!res.writableFinished){pending.error=Object.assign(Error("owned_initial_original_manual_response_lost"),{code:"owned_initial_original_manual_response_lost",unknown:true});pending.reject(pending.error);trustedReadDaemon.activeTool?.reject?.(pending.error);}});
  if(trustedReadDaemon.manualWaiter)trustedReadDaemon.manualWaiter.resolve(pending);
  try{const run=await completion;trustedCurrent();writeJson(res,200,{ok:true,run});}
  finally{clearTimeout(timer);if(!pending.started&&trustedReadDaemon.manualPending===pending)trustedReadDaemon.manualPending=null;}
}
async function trustedWaitOriginalManual(record){
  const current=trustedReadDaemon.manualPending;if(current){if(current.record!==record||current.error||current.started)trustedFail("owned_initial_original_manual_join_changed",true);return current;}
  if(trustedReadDaemon.manualWaiter)trustedFail("owned_initial_original_manual_wait_once");
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{trustedReadDaemon.manualWaiter=null;reject(Object.assign(Error("owned_initial_original_manual_join_timeout"),{code:"owned_initial_original_manual_join_timeout"}));},30000);
    trustedReadDaemon.manualWaiter={resolve:pending=>{clearTimeout(timer);trustedReadDaemon.manualWaiter=null;if(pending.record!==record||pending.error||pending.started)reject(Object.assign(Error("owned_initial_original_manual_join_changed"),{code:"owned_initial_original_manual_join_changed",unknown:true}));else resolve(pending);}};});
}
async function trustedSharedQueueExecute(handler,value,originalRequest){
  const role=trustedReadDaemon.role,record=currentProposalState.current,own=ownedFixedTitleManualReceipts.get(record),fixed=ownedFixedTitleProposals.get(record);currentProposalState.assertCurrent(record);
  if(trustedReadDaemon.executionProfile!=="shared_queue_v1"||!own||!fixed||own.executing||own.completedExecution||record.executionState!=="pending"||record.confirmedAt||!own.proposalTerminal||!own.dryTerminal||!own.completedDryRun||!trustedReadDaemon.titleManifest||!trustedReadDaemon.lastCompTerminal)trustedFail("owned_initial_original_shared_preparation_required");
  const step=record.payload.plan.steps[0],operations={14:"checkpoint",15:"clean_copy",5:"stage",6:"enqueue",7:"start",8:"restore"};
  const exact={...step.args,actionId:record.actionId,payloadRef:record.payloadRef,payloadHash:record.payloadHash,previewHash:record.previewHash,riskLevel:record.riskLevel,riskPolicyVersion:record.riskPolicyVersion,ownedTitleOperation:operations[fixed.leaf],variantSlot:fixed.slot};
  if(value.name!==step.tool||m100Protocol.stableStringify(value.args)!==m100Protocol.stableStringify(exact)||!operations[fixed.leaf]||fixed.leaf===7&&fixed.slot!==2)trustedFail("owned_initial_exact_shared_program_required");
  const checkpoint=trustedNative.manualExecutionPreflightFixed(role,handler,trustedReadDaemon.titleManifest,trustedReadDaemon.lastCompTerminal);
  if(!/^[a-f0-9]{32}$/.test(checkpoint.callRef)||checkpoint.executionId!==ownedNativeUuid32(checkpoint.callRef))trustedFail("owned_initial_original_shared_execution_ref");
  own.executing=true;record.confirmedAt=new Date().toISOString();record.confirmedBySurface="owned-original-controller";record.confirmedBySession=null;record.executionId=checkpoint.executionId;record.executionState="executing";
  const context={source:"owned-native-shared-queue",record,runId:checkpoint.executionId,args:step.args,outerArgs:step.args,autonomous:true,confirm:true,allowWithoutCheckpoint:false,stepCount:1,checkpoint};
  ownedSharedQueueContexts.set(context,{handler,request:originalRequest,record,controllerArgs:exact});
  const result=await ownedExecutionRunContext.run(context,()=>ownedSharedQueueContextGuard.run(context,async()=>{
    if([6,7].includes(fixed.leaf)){
      const snapshot=trustedReadDaemon.savedSnapshots[fixed.slot-1];if(!snapshot||!trustedReadDaemon.ame||!trustedReadDaemon.ameSources[fixed.slot-1])trustedFail("owned_initial_original_shared_source_required");
      const nativeContext={record,slot:fixed.slot,leaf:fixed.leaf,outerArgs:step.args,args:null,snapshot,gate:null,preparation:null};ownedAmeContexts.set(context,nativeContext);
      if(fixed.leaf===7){const queue=trustedReadDaemon.ameQueueFacts?.[1];if(!queue||queue.terminal!==trustedReadDaemon.ameQueues[1])trustedFail("owned_initial_original_shared_pair_required");const actual=trustedNative.ameQueuePreparationFactsFixed(role,queue.terminal);if(JSON.stringify(actual)!==queue.original)trustedFail("owned_initial_original_shared_binding_changed");nativeContext.args=Object.freeze(ameTitleJobs.validateInput(ameTitleJobs.START,actual.args));context.args=nativeContext.args;context.ownedSharedQueueBinding=ameSharedQueue.validateBinding(actual.manifest);context.ownedSharedQueueCapability=ameSharedQueueIssuer.authorize(context,context.ownedSharedQueueBinding);}
      nativeContext.gate=await trustedNative.captureServerGatesFixed(role,handler,trustedReadDaemon.titleManifest,own.proposalTerminal,own.dryTerminal,trustedReadDaemon.lastCompTerminal,originalRequest);trustedCurrent();
      const preparation=await(fixed.leaf===6?ownedAmeNativeDispatchPort.prepareEnqueue(context):ownedAmeNativeDispatchPort.prepareStart(context));trustedCurrent();return JSON.parse((await trustedCommand(nativeContext.gate,true,"run_ai_agent_plan",{operation:"ame",preparation,context,slot:fixed.slot})).content[0].text);
    }
    const gate=await trustedNative.captureServerGatesFixed(role,handler,trustedReadDaemon.titleManifest,own.proposalTerminal,own.dryTerminal,trustedReadDaemon.lastCompTerminal,originalRequest);trustedCurrent();assertOwnedExecutionContext(context);
    if(fixed.leaf===14){if(trustedReadDaemon.checkpoint)trustedFail("owned_initial_checkpoint_once");trustedReadDaemon.checkpoint=await trustedNative.executeOwnedCheckpointFixed(role,gate);return trustedNative.describeOwnedCheckpointFixed(role,trustedReadDaemon.checkpoint);}
    if(fixed.leaf===15){if(trustedReadDaemon.cleanCopies[fixed.slot-1])trustedFail("owned_initial_clean_copy_once");const copy=await trustedNative.executeOwnedCleanCopyFixed(role,gate);trustedReadDaemon.cleanCopies[fixed.slot-1]=copy;return trustedNative.describeOwnedCleanCopyFixed(role,copy);}
    const workingCopy=trustedReadDaemon.cleanCopies[fixed.slot-1];if(!workingCopy)trustedFail("owned_initial_original_shared_working_copy_required");
    if(fixed.leaf===8){const program=trustedReadDaemon.restorationPrograms[fixed.slot-1];if(!program)trustedFail("owned_initial_original_shared_restore_program_required");return JSON.parse((await trustedCommand(gate,true,"run_ai_agent_plan",{operation:"restore",gate,program,slot:fixed.slot})).content[0].text);}
    if(trustedReadDaemon.restorationPrograms[fixed.slot-1])trustedFail("owned_initial_restore_preissue_once");trustedReadDaemon.restorationPrograms[fixed.slot-1]=await trustedNative.preissueRestorationFixed(role,gate,workingCopy);trustedCurrent();return JSON.parse((await trustedCommand(gate,true,"run_ai_agent_plan",{gate,workingCopy,slot:fixed.slot})).content[0].text);
  }));
  trustedCurrent();const run={id:checkpoint.executionId,ok:true,dryRun:false,actionId:record.actionId,revision:record.revision,requestId:record.requestId,finishedAt:new Date().toISOString(),result,nativeAuthority:false,authoritySource:"original_owned_shared_queue_profile",mediaVerified:false,nativeQueueCompositionVerified:false};
  if(!currentProposalState.publishRunResult(record,run,{id:run.id,ok:true,dryRun:false,finishedAt:run.finishedAt}))trustedFail("owned_initial_original_shared_publication_unknown",true);own.completedExecution=Object.freeze({callRef:checkpoint.executionId,rawCallRef:checkpoint.callRef});return toolResult(run);
}
async function trustedFixedExecute(handler,value,originalRequest){
  if(trustedReadDaemon.executionProfile==="shared_queue_v1")return trustedSharedQueueExecute(handler,value,originalRequest);
  const role=trustedReadDaemon.role,record=currentProposalState.current,own=ownedFixedTitleManualReceipts.get(record),fixed=ownedFixedTitleProposals.get(record);
  currentProposalState.assertCurrent(record);
  if(!own||!fixed||!own.adopted||own.executing||record.executionState!=="pending"||record.confirmedAt||!own.completedDryRun||!trustedReadDaemon.titleManifest||!trustedReadDaemon.lastCompTerminal)trustedFail("owned_initial_original_execution_preparation_required");
  const step=record.payload.plan.steps[0],operations={14:"checkpoint",15:"clean_copy",5:"stage",6:"enqueue",7:"start",8:"restore"};
  const exact={...step.args,actionId:record.actionId,payloadRef:record.payloadRef,payloadHash:record.payloadHash,previewHash:record.previewHash,
    riskLevel:record.riskLevel,riskPolicyVersion:record.riskPolicyVersion,ownedTitleOperation:operations[fixed.leaf],variantSlot:fixed.slot};
  if(value.name!==step.tool||m100Protocol.stableStringify(value.args)!==m100Protocol.stableStringify(exact)||![14,15].includes(fixed.leaf))
    trustedFail("owned_initial_exact_execution_producer_required");
  const checkpoint=trustedNative.manualExecutionPreflightFixed(role,handler,trustedReadDaemon.titleManifest,trustedReadDaemon.lastCompTerminal);
  if(!/^[a-f0-9]{32}$/.test(checkpoint.callRef)||/^0+$/.test(checkpoint.callRef)||checkpoint.executionId!==ownedNativeUuid32(checkpoint.callRef))trustedFail("owned_initial_original_execution_ref_required");
  const pending=await trustedWaitOriginalManual(record);trustedCurrent();ownedFixedManualRecord(pending.value);
  if(pending.error||pending!==trustedReadDaemon.manualPending)trustedFail("owned_initial_original_manual_join_changed",true);
  pending.started=true;own.executing=true;
  record.confirmedAt=new Date().toISOString();record.confirmedBySurface="cep-panel";record.confirmedBySession=own.panel.confirmationSessionId;
  record.executionId=checkpoint.executionId;record.executionState="executing";
  const meta={route:"/agents/plan/run",authRole:"panel",key:m100PlanRunLookupKey(pending.value)};
  try{const result=await manualPlanIngress.runAuthenticated(meta,async()=>{
    const context={source:"ai-plan-run",record,runId:checkpoint.executionId,args:step.args,autonomous:false,confirm:true,allowWithoutCheckpoint:false,stepCount:1,checkpoint};
    manualPlanIngress.brand(context);
    return ownedExecutionRunContext.run(context,async()=>{
      if(fixed.leaf===6||fixed.leaf===7){const snapshot=trustedReadDaemon.savedSnapshots[fixed.slot-1];if(!snapshot||!trustedReadDaemon.ame||!trustedReadDaemon.ameSources[fixed.slot-1])trustedFail("owned_initial_original_ame_source_before_effect");const nativeContext={record,pending,slot:fixed.slot,leaf:fixed.leaf,outerArgs:step.args,args:null,snapshot,gate:null,preparation:null};ownedAmeContexts.set(context,nativeContext);
        const work=async()=>{if(fixed.leaf===7){const queue=trustedReadDaemon.ameQueueFacts?.[fixed.slot-1];if(!queue||queue.terminal!==trustedReadDaemon.ameQueues[fixed.slot-1])trustedFail("owned_initial_original_queue_before_START");const actual=trustedNative.ameQueuePreparationFactsFixed(role,queue.terminal);if(JSON.stringify(actual)!==queue.original)trustedFail("owned_initial_original_queue_manifest_drift");nativeContext.args=Object.freeze(ameTitleJobs.validateInput(ameTitleJobs.START,actual.args));context.args=nativeContext.args;context.ownedManualQueueManifest=ameManualQueue.validateManifest(actual.manifest);context.ownedManualQueueCapability=ameManualQueueIssuer.authorize(context,context.ownedManualQueueManifest);}
          nativeContext.gate=await trustedNative.captureServerGatesFixed(role,handler,trustedReadDaemon.titleManifest,own.proposalTerminal,own.dryTerminal,trustedReadDaemon.lastCompTerminal,pending.request);trustedCurrent();const preparation=await (fixed.leaf===6?ownedAmeNativeDispatchPort.prepareEnqueue(context):ownedAmeNativeDispatchPort.prepareStart(context));trustedCurrent();return JSON.parse((await trustedCommand(nativeContext.gate,true,"run_ai_agent_plan",{operation:"ame",preparation,context,slot:fixed.slot})).content[0].text);};
        if(fixed.leaf===7){const witness=pending.value.ameManualQueueWitness;if(witness.acceptedDryRunId!==JSON.parse(own.completedDryRun).id||ownedNativeUuid32(witness.acceptedDryRunId)!==record.dryRunReceipt.runId||pending.route!==ameManualQueue.ROUTE||pending.authRole!=="panel")trustedFail("owned_initial_original_raw_dry_id_join");const panel=ownedOriginalPreparationPanel(own.panel),panelIdentityValid=panel.panelConnectionId===witness.panelConnectionId&&panel.panelGeneration===witness.panelGeneration;return ameManualQueueIssuer.runAuthenticated({...witness,acceptedDryRunId:ownedNativeUuid32(witness.acceptedDryRunId),route:pending.route,authRole:pending.authRole,panelIdentityValid},work);}return work();}
      const gate=await trustedNative.captureServerGatesFixed(role,handler,trustedReadDaemon.titleManifest,own.proposalTerminal,own.dryTerminal,trustedReadDaemon.lastCompTerminal,pending.request);trustedCurrent();assertOwnedExecutionContext(context);
      if(fixed.leaf===14){if(trustedReadDaemon.checkpoint)trustedFail("owned_initial_checkpoint_once");trustedReadDaemon.checkpoint=await trustedNative.executeOwnedCheckpointFixed(role,gate);trustedCurrent();return trustedNative.describeOwnedCheckpointFixed(role,trustedReadDaemon.checkpoint);}
      if(fixed.leaf===15){if(trustedReadDaemon.cleanCopies[fixed.slot-1])trustedFail("owned_initial_clean_copy_once");const copy=await trustedNative.executeOwnedCleanCopyFixed(role,gate);trustedCurrent();trustedReadDaemon.cleanCopies[fixed.slot-1]=copy;return trustedNative.describeOwnedCleanCopyFixed(role,copy);}
      const workingCopy=trustedReadDaemon.cleanCopies[fixed.slot-1];if(!workingCopy)trustedFail("owned_initial_original_working_copy_required");
      if(fixed.leaf===8){const program=trustedReadDaemon.restorationPrograms[fixed.slot-1];if(!program)trustedFail("owned_initial_original_restore_program_required");return JSON.parse((await trustedCommand(gate,true,"run_ai_agent_plan",{operation:"restore",gate,program,slot:fixed.slot})).content[0].text);}
      if(trustedReadDaemon.restorationPrograms[fixed.slot-1])trustedFail("owned_initial_restore_preissue_once");
      trustedReadDaemon.restorationPrograms[fixed.slot-1]=await trustedNative.preissueRestorationFixed(role,gate,workingCopy);trustedCurrent();
      const returned=await trustedCommand(gate,true,"run_ai_agent_plan",{gate,workingCopy,slot:fixed.slot});trustedCurrent();return JSON.parse(returned.content[0].text);
    });
  });trustedCurrent();
    const run={id:checkpoint.executionId,ok:true,dryRun:false,actionId:record.actionId,revision:record.revision,requestId:record.requestId,finishedAt:new Date().toISOString(),result,nativeAuthority:false};
    if(!currentProposalState.publishRunResult(record,run,{id:run.id,ok:true,dryRun:false,finishedAt:run.finishedAt}))trustedFail("owned_initial_original_execution_publication_refused",true);
    own.completedExecution=Object.freeze({callRef:checkpoint.executionId,rawCallRef:checkpoint.callRef});pending.resolve(run);return toolResult(run);
  }catch(error){pending.error=error;pending.reject(error);throw error;}
  finally{if(trustedReadDaemon.manualPending===pending)trustedReadDaemon.manualPending=null;}
}
async function trustedTool(req,res,body){const value=JSON.parse(body.toString("utf8"));
  const read=["ensure_ae_agent_panel","get_bridge_status","get_project_info"].includes(value?.name),library=["search_solutions","get_solution"].includes(value?.name),inspection=["get_comp_details","get_layer_details","inspect_title_variants",ameTitleJobs.INSPECT,ameTitleJobs.QUEUE_MANIFEST].includes(value?.name),build=value?.name==="build_solution_plan",proposal=value?.name==="propose_ai_agent_plan",dryRun=value?.name==="run_ai_agent_plan"&&value.args?.dryRun===true,execute=value?.name==="run_ai_agent_plan"&&value.args?.dryRun!==true,completion=value?.name==="get_ame_title_job_status";
  if(!trustedExact(value,["args","name"])||!value.args||typeof value.args!=="object"||Array.isArray(value.args)||(!read&&!library&&!inspection&&!build&&!proposal&&!dryRun&&!execute&&!completion)||(read&&!trustedExact(value.args,[]))||
      (completion&&(!trustedExact(value.args,["variantSlot"])||![1,2].includes(value.args.variantSlot)))||
      (build&&(!trustedExact(value.args,["solutionId"])||value.args.solutionId!=="owned-runtime-two-title-fixed-v1")))trustedFail("owned_initial_exact_tool_required");
  if(trustedReadDaemon.activeTool)trustedFail("owned_initial_concurrent_tool_refused",true);
  // Hold the one ingress slot before the first await. A lost response never
  // releases an operation that is still reconciling its original native work.
  const slot={handler:null,error:null,completed:false,reject:null,execute},failure=new Promise((_,reject)=>{slot.reject=error=>{if(slot.completed||slot.error)return;slot.error=error;reject(error);};});
  trustedReadDaemon.activeTool=slot;
  res.once("close",()=>{if(!res.writableFinished)slot.reject(Object.assign(Error("owned_initial_original_tool_response_lost"),{code:"owned_initial_original_tool_response_lost",unknown:true}));});
  const operation=(async()=>{if(trustedReadDaemon.pumpWork)await trustedReadDaemon.pumpWork;trustedCurrent();
    if(completion){const flight=trustedReadDaemon.completionFlights?.[value.args.variantSlot-1];if(!flight||flight.unknown||!flight.publicationPromise)trustedFail("owned_initial_original_completion_publication_required",true);await flight.publicationPromise;trustedCurrent();if(!flight.published)trustedFail("owned_initial_original_completion_publication_not_settled",true);}
    const role=trustedReadDaemon.role,request=await trustedHttp.retainAuthenticatedRequest(role,req,body);trustedCurrent();
    const handler=await (completion?trustedNative.verifyCompletionToolFixed(role,request):library?trustedNative.verifyServerOnlyTool(role,request,value.name):inspection||build||proposal||dryRun||execute?trustedNative.verifyExecutionTool(role,request,value.name):trustedNative.verifyTool(role,request,value.name));slot.handler=handler;trustedCurrent();
    if(completion){const text=await trustedNative.finishOriginalCompletionFixed(role,handler);trustedCurrent();trustedHttp.bindOriginalCompletionResponse(role,req,handler);return {content:[{type:"text",text}],isError:false};}
    if(library){const captured=await trustedNative.captureServerOnlyResultFixed(role,handler);trustedCurrent();return captured.value;}
    if(build||proposal){if(!trustedReadDaemon.titleManifest||!trustedReadDaemon.lastCompTerminal)trustedFail("owned_initial_own_manifest_before_build_required");
      const captured=await trustedNative.captureExecutionPreparationFixed(role,handler,trustedReadDaemon.titleManifest,trustedReadDaemon.lastCompTerminal);trustedCurrent();
      if(build)trustedReadDaemon.buildTerminal=captured.terminal;else{const record=currentProposalState.current,own=ownedFixedTitleManualReceipts.get(record);
        if(!own||captured.value.actionId!==record.actionId||captured.value.payloadHash!==record.payloadHash||own.proposalTerminal)trustedFail("owned_initial_original_proposal_ack_changed",true);
        own.proposalTerminal=captured.terminal;trustedReadDaemon.proposalTerminal=captured.terminal;}return toolResult(captured.value);}
    if(value.name==="ensure_ae_agent_panel")return trustedBootstrap(handler);
    if(execute)return trustedFixedExecute(handler,value,request);
    if(!trustedReadDaemon.cep)trustedFail("owned_initial_actual_actor_absent");await trustedWaitPoll();trustedCurrent();await trustedObserveHandler(handler);trustedCurrent();
    if(inspection||dryRun)return trustedReadonlyInspection(handler,value.name,value.args);
    if(value.name==="get_bridge_status"){const captured=await trustedNative.captureLocalStatusFixed(role,handler);trustedCurrent();return toolResult(captured.value);}return trustedProject(handler);})();
  try{const result=await Promise.race([operation,failure]);trustedCurrent();slot.completed=true;writeJson(res,200,{ok:true,result});}
  catch(error){slot.reject(error);throw error;}
  finally{void operation.then(()=>{if(trustedReadDaemon.activeTool===slot)trustedReadDaemon.activeTool=null;},()=>{if(trustedReadDaemon.activeTool===slot)trustedReadDaemon.activeTool=null;});}}

function trustedDispositionTick(){if(!trustedReadDaemon.role||trustedReadDaemon.pumpWork||trustedReadDaemon.activeTool||trustedReadDaemon.dispositionError||trustedReadDaemon.shutdownAcknowledged)return;
  const role=trustedReadDaemon.role;
  const work=(async()=>{trustedNative.assertOriginalDispositionCurrent(role);const event=await trustedNative.pollOriginalEvent(role);trustedNative.assertOriginalDispositionCurrent(role);if(!event)return;
    const kind=trustedNative.originalEventKind(role,event);
    if(kind==="observation"){if(trustedReadDaemon.closing||!trustedReadDaemon.target||!trustedReadDaemon.cep)trustedFail("owned_initial_original_observation_target_absent",true);
      const measured=await trustedNative.captureObservationFixed(role,trustedReadDaemon.target,event);trustedCurrent();await trustedNative.submitObservation(role,event,measured);trustedCurrent();return;}
    if(kind==="drain"){if(trustedReadDaemon.closing||trustedReadDaemon.drainAcknowledged)trustedFail("owned_initial_original_drain_once",true);trustedReadDaemon.closing=true;
      const stopped=Object.assign(Error("owned_initial_original_drain"),{code:"owned_initial_original_drain"});for(const waiter of [...trustedReadDaemon.targetWaiters])waiter.reject(stopped);
      // Actual End/Close and native request terminals precede D21. Listener
      // closure or a JavaScript close event cannot supply a missing terminal.
      if(!trustedReadDaemon.transport||trustedReadDaemon.projects.size||trustedReadDaemon.activeTool)trustedFail("owned_initial_original_drain_work_pending",true);
      await trustedReadDaemon.transport.close();trustedNative.assertOriginalDispositionCurrent(role);
      if(trustedReadDaemon.requests.size)trustedFail("owned_initial_original_drain_responses_pending",true);
      await trustedNative.acknowledgeOriginalDisposition(role,event);trustedNative.assertOriginalDispositionCurrent(role);trustedReadDaemon.drainAcknowledged=true;return;}
    if(kind!=="shutdown"||!trustedReadDaemon.closing||!trustedReadDaemon.drainAcknowledged||trustedReadDaemon.requests.size||trustedReadDaemon.projects.size||trustedReadDaemon.activeTool)
      trustedFail("owned_initial_original_shutdown_order",true);
    await trustedNative.acknowledgeOriginalDisposition(role,event);trustedNative.assertOriginalDispositionCurrent(role);trustedReadDaemon.shutdownAcknowledged=true;
    clearInterval(trustedReadDaemon.pump);trustedReadDaemon.pump=null;
    if(trustedReadDaemon.cep)trustedReadDaemon.cep.close();
    // D22 is an acknowledgement. The original owner separately observes this
    // child's actual exit and stdio EOF; this line does not manufacture either.
    process.exitCode=0;
  })();trustedReadDaemon.pumpWork=work;
  void work.catch(error=>{trustedReadDaemon.dispositionError=error;trustedReadDaemon.closing=true;clearInterval(trustedReadDaemon.pump);trustedReadDaemon.pump=null;
    process.stderr.write(JSON.stringify({code:error.code||"owned_initial_original_disposition_unknown",unknown:!!error.unknown,replayAllowed:false})+"\n");
  }).finally(()=>{if(trustedReadDaemon.pumpWork===work)trustedReadDaemon.pumpWork=null;});return work;
}

const TRUSTED_STARTUP_LOOKUPS=Object.freeze(["/human-guard-settlement/lookup","/ame/fixture-ui-disposition/lookup","/ame/native-fixture-abandonment/lookup","/ame/native-fixture-prephase-recovery/lookup","/ame/native-fixture-admission-refusal/lookup"]);
const TRUSTED_STARTUP_GETS=Object.freeze(["/health","/status","/agents","/usage","/agents/plan/current","/autonomy/session","/placeholder/protection"]);
function trustedChargeStartup(pathname){
  // A local ingress bound: <=32 actual subrequests and <=4 per lookup path.
  // Abandonment rounds may issue N selector requests: this is not a 4-round
  // budget. First exhaustion is a concrete refusal; no reset or auto-heal.
  // It issues no Call or Store service row.
  // Production keeps the same lifetime service32 envelope. The finite current
  // and adopt requests consume two of those slots per original operation.
  if(trustedReadDaemon.startupCallbacks>=32)trustedFail("owned_initial_startup_service_budget");
  if(["/agents/plan/current","/agents/plan/adopt"].includes(pathname)){
    if(pathname==="/agents/plan/current"&&currentProposalState.current===null&&!trustedReadDaemon.initialNextSeen&&!trustedReadDaemon.startupCounts.has("startup:null-current")){
      trustedReadDaemon.startupCallbacks++;trustedReadDaemon.startupCounts.set("startup:null-current",1);return;
    }
    const record=currentProposalState.current,own=ownedFixedTitleProposals.get(record),receipt=ownedFixedTitleManualReceipts.get(record);
    currentProposalState.assertCurrent(record);
    if(!own||!receipt?.proposalTerminal||!receipt.completedDryRun)trustedFail("owned_initial_original_group_lookup_required");
    const key=own.slot+":"+own.leaf+":"+pathname;
    if(trustedReadDaemon.startupCounts.has(key))trustedFail("owned_initial_original_group_lookup_once");
    trustedReadDaemon.startupCallbacks++;trustedReadDaemon.startupCounts.set(key,1);return;
  }
  const count=trustedReadDaemon.startupCounts.get(pathname)||0,maximum=TRUSTED_STARTUP_LOOKUPS.includes(pathname)?4:pathname==="/agents"?4:2;
  if(count>=maximum)trustedFail("owned_initial_startup_path_budget");trustedReadDaemon.startupCallbacks++;trustedReadDaemon.startupCounts.set(pathname,count+1);
}
async function trustedAncillary(url,body){const pathname=url.pathname;
  if(pathname==="/tools/call"){
    trustedQuery(url,[]);const value=JSON.parse(body.toString("utf8"));if(!trustedExact(value,["name","arguments"])||value.name!=="get_bridge_status"||!trustedExact(value.arguments,[]))trustedFail("owned_initial_panel_local_status_only");
    return {ok:true,result:toolResult(getBridgeStatus())};
  }
  if(pathname==="/status"){trustedQuery(url,["checkBridge"]);if(url.searchParams.get("checkBridge")!=="0")trustedFail("owned_initial_extra_bridge_check_refused");return getBridgeStatus();}
  
  if(pathname==="/ame/native-fixture-abandonment/lookup"){
    trustedQuery(url,["requestId","runId"]);const selector={requestId:url.searchParams.get("requestId"),runId:url.searchParams.get("runId")};nativeFixtureAbandonment.selector(selector);
    const retained=nativeFixtureAbandonment.lookupAudited(selector,{repoRoot:PROJECT_ROOT,evidenceRoot:LOG_DIR});if(retained!==null)trustedFail("owned_initial_retained_fixture_requires_fresh_reconciliation");return {ok:true,disposition:null};
  }
  trustedQuery(url,[]);
  if(pathname==="/health"){const status=getBridgeStatus();return {ok:true,server:status.server,version:status.version,hasToken:true,port:status.port,pending:status.pendingCommands,inflight:status.inflightCommands.length,panelConnected:status.panelConnected,lastPanelSeenAt:status.lastPanelSeenAt};}
  
  if(pathname==="/agents/plan/current")return currentProposalState.current===null?{ok:true,current:null}:{ok:true,...ownedFixedCurrentPlan()};
  if(pathname==="/autonomy/session")return {ok:true,session:autonomousSession.publicStatus()};
  if(pathname==="/placeholder/protection"){
    // No hidden project dispatch is permitted before C6 index2. Once its native
    // result exists, the existing manually revised store can be read by that
    // exact project identity without another AE command.
    const project=trustedReadDaemon.lastProjectValue;if(!project)return {ok:true,status:"awaiting_native_project_read",projectFile:null,protectionAvailable:false};
    const state=projectStateMemory.readProjectState(project.file);return {ok:true,projectFile:project.file,...state,inventoryObserved:false};
  }
  if(pathname==="/human-guard-settlement/lookup")return {ok:true,settlement:humanGuardSettlement.lookup(LOG_DIR)};
  if(pathname==="/ame/fixture-ui-disposition/lookup"){const retained=ameFixtureDisposition.lookupAudited(LOG_DIR);if(retained!==null)trustedFail("owned_initial_retained_fixture_requires_fresh_reconciliation");return {ok:true,disposition:null};}
  if(pathname==="/ame/native-fixture-prephase-recovery/lookup"){const retained=nativeFixturePrephaseRecovery.lookupAudited(nativeFixturePrephaseProof.selector(),{repoRoot:PROJECT_ROOT,evidenceRoot:LOG_DIR});if(retained!==null)trustedFail("owned_initial_retained_fixture_requires_fresh_reconciliation");return {ok:true,certificate:null};}
  if(pathname==="/ame/native-fixture-admission-refusal/lookup")trustedFail("owned_initial_original_guard_requires_fresh_reconciliation");
  trustedFail("owned_initial_route_refused");
}
async function trustedRoute(req,res,boundary){trustedCurrent();boundary.validate(req);res.authRole=boundary.role(req);res.allowedOrigin=req.headers.origin||null;
  if(!res.authRole||res.authRole==="admin")trustedFail("owned_initial_exact_http_role_required");
  const url=new URL(req.url,"http://127.0.0.1:3456"),pathname=url.pathname;if(url.hash||url.searchParams.has("token"))trustedFail("owned_initial_http_locator_refused");
  const automation=pathname==="/mcp/tools/call"&&req.method==="POST";
  const next=pathname==="/bridge/next"&&req.method==="GET",heartbeat=pathname==="/bridge/heartbeat"&&req.method==="GET";
  const projectPost=["/bridge/submitted","/bridge/result"].includes(pathname)&&req.method==="POST",adopt=pathname==="/agents/plan/adopt"&&req.method==="POST",manualRun=["/agents/plan/run",ameManualQueue.ROUTE].includes(pathname)&&req.method==="POST";
  const ancillary=req.method==="GET"&&(TRUSTED_STARTUP_GETS.includes(pathname)||TRUSTED_STARTUP_LOOKUPS.includes(pathname))||pathname==="/tools/call"&&req.method==="POST";
  if(!automation&&!next&&!heartbeat&&!projectPost&&!ancillary&&!adopt&&!manualRun)trustedFail("owned_initial_closed_route");
  if(res.authRole!==(automation?"automation":"panel"))trustedFail("owned_initial_route_credential_role_refused");
  if(automation)trustedQuery(url,[]);if(next||heartbeat)trustedPollIdentity(url);if(projectPost)trustedQuery(url,[]);
  if(ancillary||adopt)trustedChargeStartup(pathname);
  const body=await trustedBody(req);trustedCurrent();if(req.method==="GET"&&body.length)trustedFail("owned_initial_get_body_refused");
  if(automation)return trustedTool(req,res,body);
  // Retain the one actual preconnect null-current request before the first
  // GETnext can overtake it. The reply still waits for the original target and
  // loaded CEP source witness; this branch returns no proposal or grant.
  const startupNullCurrent=pathname==="/agents/plan/current"&&currentProposalState.current===null&&!trustedReadDaemon.initialNextSeen&&trustedReadDaemon.startupCounts.get("startup:null-current")===1;
  let request;if(startupNullCurrent){request=await trustedHttp.retainAuthenticatedRequest(trustedReadDaemon.role,req,body);trustedCurrent();}
  await trustedWaitTarget(req,res);trustedCurrent();if(!request){request=await trustedHttp.retainAuthenticatedRequest(trustedReadDaemon.role,req,body);trustedCurrent();}
  if(startupNullCurrent){if(currentProposalState.current!==null||!trustedReadDaemon.cep)trustedFail("owned_initial_startup_null_current_changed");trustedReadDaemon.cep.assertCurrent();writeJson(res,200,{ok:true,current:null});return;}
  if(adopt){const result=await ownedAdoptCompletedNativeDry(request,body);trustedCurrent();writeJson(res,200,result);return;}
  if(manualRun)return trustedManualRun(req,res,request,body);
  if(ancillary){const result=await trustedAncillary(url,body);trustedCurrent();writeJson(res,200,result);return;}
  if(next||heartbeat){const identity=trustedPollIdentity(url);trustedObservePanel(identity,req);
    if(heartbeat){writeJson(res,200,{ok:true,session:autonomousSession.publicStatus()});return;}
    if(!trustedReadDaemon.initialNextSeen){const deadline=trustedNative.originalDeadlineProjectionFixed(trustedReadDaemon.role);trustedCurrent();trustedReadDaemon.initialNextSeen=true;
      writeJson(res,200,{ok:true,command:null,ownedPlanPreparation:{mode:"completed_native_dry_run_v1",remainingSessionMs:deadline.remainingSessionMs}});return;}
    trustedHoldPoll({req,res,request});return;}
  const value=JSON.parse(body.toString("utf8")),submitted=pathname==="/bridge/submitted";
  if(!trustedExact(value,submitted?["id","executionId","leaseId","contractVersion","panelConnectionId","panelGeneration"]:["id","executionId","leaseId","contractVersion","panelConnectionId","panelGeneration","ok","result","error"]))trustedFail("owned_initial_exact_project_receipt_required");
  const state=trustedReadDaemon.projects.get(value.id);if(!state||!state.delivered)trustedFail("owned_initial_original_project_missing",true);
  if(submitted){if(state.submitted)trustedFail("owned_initial_project_submission_once",true);
    await (state.inspection?trustedNative.recordExecutionSubmission(trustedReadDaemon.role,state.project,request):trustedNative.recordProjectSubmission(trustedReadDaemon.role,state.project,request));trustedCurrent();state.submitted=true;writeJson(res,200,{ok:true});return;}
  if(!state.submitted)trustedFail("owned_initial_actual_project_not_submitted",true);
  const captured=await (state.ame?trustedNative.captureAmeResultFixed(trustedReadDaemon.role,state.project,request):state.restoration?trustedNative.captureRestorationResultFixed(trustedReadDaemon.role,state.project,request):state.stage?trustedNative.captureStageResultFixed(trustedReadDaemon.role,state.project,request):state.inspection?trustedNative.captureExecutionResultFixed(trustedReadDaemon.role,state.project,request):trustedNative.captureProjectResultFixed(trustedReadDaemon.role,state.project,request));trustedCurrent();
  let returned=captured.value;
  if(state.ame){if(![1,2].includes(state.stageSlot))trustedFail("owned_initial_original_ame_result_slot",true);const index=state.stageSlot-1;
    if(state.ameOperation==="sources"){if(trustedReadDaemon.ameSources[index])trustedFail("owned_initial_original_ame_source_once",true);trustedReadDaemon.ameSources[index]=captured.terminal;returned={ok:true,sourceInspected:true,slot:state.stageSlot,nativeAuthority:false,replayAllowed:false};}
    else if(state.ameOperation==="queue"){if(trustedReadDaemon.ameQueues[index])trustedFail("owned_initial_original_ame_queue_once",true);const value=trustedNative.ameQueuePreparationFactsFixed(trustedReadDaemon.role,captured.terminal);trustedReadDaemon.ameQueues[index]=captured.terminal;if(!trustedReadDaemon.ameQueueFacts)trustedReadDaemon.ameQueueFacts=[null,null];trustedReadDaemon.ameQueueFacts[index]={terminal:captured.terminal,value,original:JSON.stringify(value)};returned={ok:true,manifest:value.manifest,manifestHash:value.manifestSha25664,slot:state.stageSlot,nativeAuthority:false,replayAllowed:false};}
    else if(state.ameOperation==="start"&&trustedReadDaemon.executionProfile==="shared_queue_v1"){const original=await trustedNative.bindOriginalJobFixed(trustedReadDaemon.role,captured.terminal);trustedReadDaemon.ameJobs[1]=original;res.once("finish",()=>{try{trustedStartSharedQueueCompletion(original);}catch(error){trustedReadDaemon.activeTool?.reject?.(error);}});const observed=JSON.parse(captured.value.send.responseBody);returned={ok:true,globalQueueStartAccepted:observed.code==="batch_start_accepted",ownItemsAlreadyRunning:observed.code==="shared_queue_already_running",ownItemsAccepted:2,keepOriginalLifetime:true,mediaVerified:false,nativeQueueCompositionVerified:false,replayAllowed:false};}
    else if(state.ameOperation==="start"){if(trustedReadDaemon.ameJobs[index])trustedFail("owned_initial_original_ame_job_once",true);const originalJob=await trustedNative.bindOriginalJobFixed(trustedReadDaemon.role,captured.terminal);trustedReadDaemon.ameJobs[index]=originalJob;trustedCurrent();res.once("finish",()=>{try{trustedStartOriginalCompletion(originalJob,state.stageSlot);}catch(error){trustedReadDaemon.activeTool?.reject?.(error);}});returned={ok:true,originalJobAssociated:true,slot:state.stageSlot,nativeAuthority:false,replayAllowed:false};}
    else if(state.ameOperation==="shared_status"){const facts=trustedNative.originalCompletionFactsFixed(trustedReadDaemon.role,trustedReadDaemon.ameJobs[1]);trustedReadDaemon.sharedQueueResponseCleanup=trustedHttp.waitOriginalCompletionProducerResponse(trustedReadDaemon.role,req);returned={ok:true,terminalMask:facts.terminalMask,successMask:facts.successMask,ownJobsTerminal:facts.complete,mediaVerified:false,nativeQueueCompositionVerified:false,replayAllowed:false};}
    else if(state.ameOperation==="status"){const originalJob=trustedReadDaemon.ameJobs[index];if(!originalJob)trustedFail("owned_initial_original_completion_job_missing",true);const facts=trustedNative.originalCompletionFactsFixed(trustedReadDaemon.role,originalJob);
      if(facts.complete){if(!trustedReadDaemon.completionTerminals)trustedReadDaemon.completionTerminals=[null,null];if(!trustedReadDaemon.completionResultCleanups)trustedReadDaemon.completionResultCleanups=[null,null];if(trustedReadDaemon.completionTerminals[index]||trustedReadDaemon.completionResultCleanups[index])trustedFail("owned_initial_original_completion_terminal_once",true);
        const cleanup=trustedHttp.waitOriginalCompletionProducerResponse(trustedReadDaemon.role,req);trustedReadDaemon.completionTerminals[index]=captured.terminal;trustedReadDaemon.completionResultCleanups[index]={terminal:captured.terminal,promise:cleanup};}
      returned={ok:true,terminalAccepted:facts.complete,slot:state.stageSlot,nativeAuthority:false,replayAllowed:false};}
    else if(state.ameOperation==="enqueue")returned={ok:true,enqueued:true,slot:state.stageSlot,nativeAuthority:false,replayAllowed:false};else trustedFail("owned_initial_original_ame_operation",true);
  }else if(state.stage){if(![1,2].includes(state.stageSlot)||trustedReadDaemon.savedSnapshots[state.stageSlot-1])trustedFail("owned_initial_original_saved_snapshot_once",true);
    trustedReadDaemon.savedSnapshots[state.stageSlot-1]=captured.savedSnapshot;trustedReadDaemon.lastCompTerminal=captured.terminal;returned=trustedNative.describeOwnedSavedSnapshotFixed(trustedReadDaemon.role,captured.savedSnapshot);
  }else if(state.preparation){if(!captured.readTerminal||captured.readTerminal===captured.terminal)trustedFail("owned_initial_original_distinct_dry_read_projection_required",true);
    const record=currentProposalState.current;returned=ownedPublishCompletedNativeDry(record,captured);
    trustedReadDaemon.lastCompTerminal=captured.readTerminal;trustedReadDaemon.dryRunTerminal=captured.terminal;
  }else if(state.inspection){if(trustedReadDaemon.inspectionResults.length>=10)trustedFail("owned_initial_inspection_result_budget",true);trustedReadDaemon.inspectionResults.push(captured.terminal);
    if(!["first_two_observed_text_states_v1","exact_named_variants"].includes(captured.titleSelectionMode))trustedFail("owned_initial_native_selection_mode_required");
    if(state.name==="get_comp_details")trustedReadDaemon.lastCompTerminal=captured.terminal;
    if(captured.titleSelectionMode==="first_two_observed_text_states_v1"&&state.name==="get_comp_details"&&!trustedReadDaemon.titleSelection){
      if(!trustedReadDaemon.lastProjectTerminal)trustedFail("owned_initial_original_project_read_before_selection");
      // Current finite profile fixes root==target. Native validates the exact
      // source-approved pair from both own cap arguments; other pairs refuse.
      const selection=await trustedNative.captureSelectionFixed(trustedReadDaemon.role,trustedReadDaemon.lastProjectTerminal,captured.terminal,captured.terminal);trustedCurrent();
      trustedReadDaemon.titleSelection=selection;const args=trustedNative.describeSelectionFixed(trustedReadDaemon.role,selection);trustedCurrent();
      // Read-only data for the next canonical request, never a serializable cap.
      returned={...captured.value,ownedSelectionArguments:args};
    }else if(captured.titleSelectionMode==="first_two_observed_text_states_v1"&&state.name==="inspect_title_variants"){
      if(!trustedReadDaemon.titleSelection)trustedFail("owned_initial_original_selection_before_manifest");
      const manifest=await trustedNative.captureManifestFixed(trustedReadDaemon.role,trustedReadDaemon.titleSelection,captured.terminal);trustedCurrent();trustedReadDaemon.titleManifest=manifest;
    }
  }else{trustedReadDaemon.lastProjectValue=captured.value;trustedReadDaemon.lastProjectTerminal=captured.terminal;if(trustedReadDaemon.titleManifest&&captured.value.ownedReadCurrent)trustedReadDaemon.lastCompTerminal=captured.terminal;}
  writeJson(res,200,{ok:true});state.resolve(returned);
}
async function startTrustedReadBridge(){initialRuntime.assertStartup();if(trustedReadDaemon.role||trustedReadDaemon.server)trustedFail("owned_initial_daemon_start_once");
  await initialRuntime.startDaemonFixed();trustedReadDaemon.role=initialRuntime.daemonRole();trustedCurrent();trustedReadDaemon.executionProfile=trustedNative.executionProfileFixed(trustedReadDaemon.role);
  const fixed=JSON.parse(trustedNative.fixedDaemonTransport(trustedReadDaemon.role).toString("utf8"));
  if(!trustedExact(fixed,["automationToken","panelToken","host","port"])||fixed.host!=="127.0.0.1"||fixed.port!==3456||[fixed.automationToken,fixed.panelToken].some(value=>typeof value!=="string"||!value||/[\r\n\0]/.test(value)))trustedFail("owned_initial_fixed_daemon_transport_refused");
  const boundary=createBoundary({automation:fixed.automationToken,panel:fixed.panelToken});
  const server=http.createServer((req,res)=>{
    if(trustedReadDaemon.requests.size>=192){req.destroy(Object.assign(Error("owned_initial_actual_request_retention_budget"),{code:"owned_initial_actual_request_retention_budget"}));return;}
    const original={req,res};trustedReadDaemon.requests.add(original);res.once("close",()=>trustedReadDaemon.requests.delete(original));
    void trustedRoute(req,res,boundary).catch(error=>{if(error.unknown&&trustedReadDaemon.activeTool)trustedReadDaemon.activeTool.reject(error);
      if(!res.writableEnded&&!res.destroyed){try{writeJson(res,error.status||409,{ok:false,code:error.code||"owned_initial_request_refused",replayAllowed:false});}catch{req.socket.destroy(error);}}});
  });
  server.on("error",error=>{trustedReadDaemon.closing=true;if(trustedReadDaemon.activeTool)trustedReadDaemon.activeTool.reject(Object.assign(error,{unknown:true}));});
  trustedReadDaemon.server=server;trustedReadDaemon.transport=await trustedHttp.bindFixedServer(trustedReadDaemon.role,server);trustedCurrent();
  trustedReadDaemon.pump=setInterval(()=>{void trustedDispositionTick();},100);
  return {ok:true,status:"original_daemon_source_bound",replayAllowed:false};
}

function toolResult(text, isError) {
  return {
    content: [{ type: "text", text: typeof text === "string" ? text : JSON.stringify(text, null, 2) }],
    isError: Boolean(isError)
  };
}

function parseToolText(text) {
  if (typeof text !== "string") return text;
  try {
    return JSON.parse(text);
  } catch (_error) {
    return text;
  }
}

const MUTATION_CHECKPOINT_SCHEMA_PROPERTIES = {
  autoCheckpoint: {
    type: "boolean",
    description: "Whether to create a project checkpoint before this mutating operation. Defaults to false."
  },
  checkpointLabel: {
    type: "string",
    description: "Optional label for a checkpoint created before this mutating operation. Providing a label enables checkpoint creation."
  },
  idempotencyKey: {
    type: "string",
    description: "Optional repeat-safe key. Reusing the same key, scope, tool, and arguments returns the first successful result without running the mutation again."
  },
  idempotencyScope: {
    type: "string",
    description: "Optional namespace for idempotencyKey. Defaults to default."
  },
  verifyAfter: {
    type: "boolean",
    description: "Whether to inspect the AE project after this mutation and attach a verification snapshot. Defaults to true."
  }
};

const MUTATING_TOOL_NAMES = new Set([
  ...ameOpenComp.MUTATIONS,
  titleVerification.TOOL,
  titleExport.TOOL,
  ameJobSource.TOOL,
  ameTitleJobs.ENQUEUE, ameTitleJobs.START, ...ameQueueControl.MUTATIONS,
  ameFixtureGrant.TOOL_NAME,
  ameRunning.TOOL_NAME,
  nativeRenderVariant.RENDER,
  ...projectLifecycleContract.MUTATIONS,
  "reload_montage_material_source",
  "create_placeholder_review_comps",
  projectSave.TOOL_NAME,
  "run_extendscript",
  "run_extendscript_file",
  "create_comp",
  "create_project_folder",
  "move_project_items_to_folder",
  "create_text_layer",
  "create_shapes_from_text",
  "import_footage",
  "relink_footage_source",
  "create_solid_layer",
  "create_null_layer",
  "create_adjustment_layer",
  "create_camera_layer",
  "create_camera_with_controller",
  "toggle_onion_skinning",
  "create_layer_mask",
  "set_layer_mask",
  "set_path_geometry",
  "export_path_points",
  "export_text_to_file",
  "save_comp_frame_png",
  "add_project_item_to_comp",
  "duplicate_layer",
  "duplicate_layers",
  "set_layer_selection",
  "set_layer_parent",
  "set_layer_track_matte",
  "delete_layer",
  "duplicate_comp",
  "deep_duplicate_precomp_sources",
  "add_effect",
  "set_effect_property",
  "set_effect_enabled",
  "set_puppet_pin_type",
  "add_property_to_essential_graphics",
  "set_property_value",
  "set_layer_metadata",
  "set_layer_blending_mode",
  "set_project_item_metadata",
  "set_project_frames_count_type",
  "set_comp_current_time",
  "set_comp_properties",
  "refresh_comp_panel",
  "set_comp_work_area",
  "set_layer_time_range",
  "stagger_layers",
  "split_layers_at_time",
  "precompose_layers",
  "replace_layer_source",
  "rename_layers",
  "rename_project_items",
  "update_text_layer",
  "create_shape_layer",
  "create_layer_connection_line",
  "fit_layer_to_comp",
  "set_property_keyframes",
  "fill_in_keyframes",
  "keyframe_current_value_from_expression",
  "apply_keyframe_ease",
  "set_spatial_in_tangent",
  "set_expression",
  "clear_expression",
  "separate_shape_size_dimensions",
  "add_comp_to_render_queue",
  "set_render_queue_output",
  "align_layers_to_time",
  "set_layer_transform",
  "apply_transform_expression",
  "add_comp_marker",
  "add_layer_marker",
  "update_layer_marker",
  "delete_layer_marker",
  "create_test_comp",
  "cleanup_test_items",
  ...slideshowTools.TOOL_NAMES.filter((toolName) => toolName !== "audit_slideshow_generated")
]);

const MUTATION_SUMMARY_TOOL_NAMES = new Set([
  ...MUTATING_TOOL_NAMES,
  "checkpoint_project",
  "delete_project_checkpoint"
]);

const M100_RISK_POLICY_VERSION = m100Protocol.M100_RISK_POLICY_VERSION;
const M100_RISK_LEVELS = ["read_only", "mutating", "destructive", "raw_jsx"];
const M100_RAW_JSX_TOOL_NAMES = new Set([
  "run_extendscript",
  "run_extendscript_file"
]);
const M100_DESTRUCTIVE_TOOL_NAMES = new Set([
  nativeRenderVariant.RENDER,
  ...projectLifecycleContract.MUTATIONS,
  projectSave.TOOL_NAME,
  "cleanup_test_items",
  "delete_project_checkpoint",
  "delete_layer"
]);
const M100_DIRECT_TOOL_SOURCES = new Set([
  "direct-tools-call",
  "dev-http",
  "mcp-adapter"
]);
const M100_LOCAL_ADMIN_TOOL_SOURCES = new Set([
  "dev-admin-http"
]);
const M100_DIRECT_ESCAPE_HATCH_ENV = "AE_M100_ALLOW_DIRECT_TOOL_EXECUTION";
const M100_DIRECT_ESCAPE_HATCH_ARG = "m100DirectExecutionEscapeHatch";
const m100ActionProposalStore = new Map();

function knownToolNames() {
  return new Set(tools.map((tool) => tool.name));
}

function m100RiskPolicyStatus() {
  return {
    version: M100_RISK_POLICY_VERSION,
    riskLevels: M100_RISK_LEVELS.slice(),
    directToolPolicy: "default-deny for unknown, mutating, destructive and raw_jsx tools",
    directToolSources: Array.from(M100_DIRECT_TOOL_SOURCES),
    localAdminToolSources: Array.from(M100_LOCAL_ADMIN_TOOL_SOURCES),
    escapeHatchEnv: M100_DIRECT_ESCAPE_HATCH_ENV,
    escapeHatchArg: M100_DIRECT_ESCAPE_HATCH_ARG
  };
}

function classifyM100ToolRisk(name) {
  const toolName = String(name || "");
  const known = knownToolNames().has(toolName);
  if (!known) {
    return {
      policyVersion: M100_RISK_POLICY_VERSION,
      toolName,
      known: false,
      riskLevel: null,
      requiresProposal: true,
      reasons: ["unknown_tool"]
    };
  }
  if (M100_RAW_JSX_TOOL_NAMES.has(toolName)) {
    return {
      policyVersion: M100_RISK_POLICY_VERSION,
      toolName,
      known: true,
      riskLevel: "raw_jsx",
      requiresProposal: true,
      reasons: ["raw ExtendScript execution requires a server-owned proposal"]
    };
  }
  if (M100_DESTRUCTIVE_TOOL_NAMES.has(toolName)) {
    return {
      policyVersion: M100_RISK_POLICY_VERSION,
      toolName,
      known: true,
      riskLevel: "destructive",
      requiresProposal: true,
      reasons: ["destructive tool requires a server-owned proposal"]
    };
  }
  if (MUTATING_TOOL_NAMES.has(toolName) || toolName === "run_ai_agent_plan") {
    return {
      policyVersion: M100_RISK_POLICY_VERSION,
      toolName,
      known: true,
      riskLevel: "mutating",
      requiresProposal: true,
      reasons: ["mutating execution path requires a server-owned proposal"]
    };
  }
  return {
    policyVersion: M100_RISK_POLICY_VERSION,
    toolName,
    known: true,
    riskLevel: "read_only",
    requiresProposal: false,
    // M100 risk describes project content. This service also activates panel UI.
    reasons: toolName === panelBootstrap.TOOL_NAME ? ["fixed_application_panel_ui_effect; no_project_content_mutation"] : []
  };
}

function m100DirectEscapeHatchAllowed(source, args) {
  return M100_LOCAL_ADMIN_TOOL_SOURCES.has(source);
}

function m100DirectToolCallBlock(source, name, args, executionContext) {
  if (projectLifecycleContract.isLifecycleMutation(name) &&
      (source !== "ai-plan-run" || !executionContext || !executionContext.lifecycleAuthorization)) {
    return {ok:false, code:"lifecycle_manual_only", message:"Project lifecycle writes require the current confirmed manual CEP runner.",
      toolName:name, knownTool:true, riskLevel:"destructive", requiresProposal:true, ignoredClientConfirmation:true};
  }
  if (!M100_DIRECT_TOOL_SOURCES.has(source)) return null;
  // The runner never dispatches steps in explicit dry-run mode. Permit only
  // this preview through legacy MCP adapters; real runs retain default-deny.
  if (name === "run_ai_agent_plan" && args && args.dryRun === true) return null;
  if (source === "mcp-adapter"
    && name === "run_ai_agent_plan"
    && args && args.dryRun === false
    && executionContext && executionContext.autonomousSession
    && executionContext.autonomousSession.authorized === true) {
    // Autonomy authorizes a proposal-backed run, not a client-authored plan.
    // Exact pins and current server record are checked by the runner.
    const keys = m100PlanRunLookupKey(args);
    if ((keys.actionId || keys.payloadRef) && keys.payloadHash && keys.previewHash
      && keys.riskLevel && keys.riskPolicyVersion) return null;
  }
  const risk = classifyM100ToolRisk(name);
  if (risk.known && risk.riskLevel === "read_only") return null;
  if (m100DirectEscapeHatchAllowed(source, args || {})) {
    return null;
  }
  const clientProvidedConfirmation = Boolean(args && (args.confirm === true || args.confirmed === true || args.confirmationToken || args.m100ConfirmationToken));
  return {
    ok: false,
    code: risk.known ? "proposal_required" : "unknown_tool_blocked",
    message: risk.known
      ? `${risk.toolName} requires a server-owned M100 proposal before direct execution.`
      : `${risk.toolName || "Unknown tool"} is not in the M100 risk registry and is blocked by default.`,
    policyVersion: M100_RISK_POLICY_VERSION,
    surface: source,
    toolName: risk.toolName,
    riskLevel: risk.riskLevel,
    knownTool: risk.known,
    requiresProposal: true,
    clientProvidedConfirmation,
    ignoredClientConfirmation: clientProvidedConfirmation,
    reasons: risk.reasons
  };
}

function m100BlockedToolResult(block) {
  const diagnostic = m100Protocol.createUserDiagnostic({
    phase: "confirmation_validation",
    code: block.code,
    message: block.message
  });
  return toolResult({
    ok: false,
    code: block.code,
    message: diagnostic.message,
    m100: {
      policyVersion: block.policyVersion,
      surface: block.surface,
      toolName: block.toolName,
      riskLevel: block.riskLevel,
      knownTool: block.knownTool,
      requiresProposal: block.requiresProposal,
      ignoredClientConfirmation: block.ignoredClientConfirmation,
      reasons: block.reasons,
      diagnostic
    }
  }, true);
}

function m100PlanSteps(plan, validation) {
  if (validation && Array.isArray(validation.steps)) return validation.steps;
  return plan && Array.isArray(plan.steps) ? plan.steps : [];
}

function m100RiskForAgentPlan(plan, validation) {
  const steps = m100PlanSteps(plan, validation);
  let hasRawJsx = rawExtendscriptStepCount(validation) > 0;
  let hasDestructive = false;
  let hasMutating = Number(validation && validation.mutatingCount || 0) > 0;
  for (const step of steps) {
    const tool = String(step && step.tool || "");
    if (M100_RAW_JSX_TOOL_NAMES.has(tool)) hasRawJsx = true;
    if (M100_DESTRUCTIVE_TOOL_NAMES.has(tool)) hasDestructive = true;
    if (step && step.mutatesProject) hasMutating = true;
  }
  if (hasRawJsx) {
    return {
      level: "raw_jsx",
      requiresConfirmation: true,
      reasons: ["validated Agent plan includes raw ExtendScript"]
    };
  }
  if (hasDestructive) {
    return {
      level: "destructive",
      requiresConfirmation: true,
      reasons: ["validated Agent plan includes a destructive tool"]
    };
  }
  if (hasMutating) {
    return {
      level: "mutating",
      requiresConfirmation: true,
      reasons: ["validated Agent plan includes project-changing steps"]
    };
  }
  return {
    level: "read_only",
    requiresConfirmation: true,
    reasons: ["validated Agent plan is read-only"]
  };
}

function m100PreviewForAgentPlan(plan, validation) {
  const lines = [];
  if (plan && plan.summary) lines.push(`Summary: ${plan.summary}`);
  const steps = m100PlanSteps(plan, validation).slice(0, 6);
  if (steps.length) {
    lines.push("Steps:");
    steps.forEach((step, index) => {
      const title = step && (step.title || step.intent || step.tool) || "Step";
      const tool = step && step.tool ? ` [${step.tool}]` : "";
      lines.push(`${index + 1}. ${title}${tool}`);
    });
  }
  if (validation) {
    lines.push(`Validation: ${validation.ok ? "ok" : "needs review"}, ${Number(validation.stepCount || steps.length || 0)} step(s), ${Number(validation.mutatingCount || 0)} mutating.`);
  }
  return m100Protocol.compactText(lines.join("\n"), 2000);
}

function pruneM100ActionProposalStore(now = Date.now()) {
  const seen = new Set();
  for (const record of m100ActionProposalStore.values()) {
    if (!record || seen.has(record.actionId)) continue;
    seen.add(record.actionId);
    const expiresAtMs = Date.parse(record.proposalExpiresAt || record.proposal && record.proposal.confirmation && record.proposal.confirmation.proposalExpiresAt || "");
    if (Number.isFinite(expiresAtMs) && expiresAtMs + m100Protocol.M100_ACTION_PROPOSAL_TTL_MS <= now) {
      m100ActionProposalStore.delete(record.actionId);
      m100ActionProposalStore.delete(record.payloadRef);
    }
  }
}

function m100ProtocolError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  if (details && typeof details === "object") {
    Object.assign(error, details);
  }
  return error;
}

function m100ErrorCode(error, fallback) {
  const providerCode = error && error.providerError && error.providerError.code;
  const ownCode = error && error.code ? String(error.code) : "";
  if (ownCode && !/^(ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ENOENT|EPERM|EACCES)$/i.test(ownCode)) {
    return ownCode;
  }
  return String(providerCode || ownCode || fallback || "m100_request_failed");
}

function m100PhaseForError(error, fallback) {
  const code = m100ErrorCode(error, "");
  if (error && error.phase) return m100Protocol.normalizeDiagnosticPhase(error.phase, fallback || "protocol_validation");
  if (/confirmation|proposal_required|proposal_not_found|proposal_expired|token|surface|session|risk_|payload_|preview_/.test(code)) {
    return "confirmation_validation";
  }
  if (/ae_result_parse/.test(code)) return "ae_result_parse";
  if (/ae_execution/.test(code)) return "ae_execution";
  if (/expired_before_delivery|unknown_after_delivery|timed_out_after_submit|command|queue/.test(code)) return "ae_queue";
  if (error && (error.readiness || error.providerError && ["setup", "models", "readiness"].includes(error.providerError.phase))) return "provider_readiness";
  if (/model_timeout|timeout/.test(code) || /timed out|timeout/i.test(error && error.message || "")) return "model_timeout";
  if (/codex_nonzero_exit|codex_no_assistant_text/.test(code)) return "codex_exec";
  if (/codex_malformed_jsonl|malformed|validation|plan_not_valid/.test(code)) return "protocol_validation";
  if (error && error.providerError) return "codex_exec";
  return m100Protocol.normalizeDiagnosticPhase(fallback, "protocol_validation");
}

function m100RawPreviewForError(error) {
  if (!error) return undefined;
  if (Object.prototype.hasOwnProperty.call(error, "rawPreview")) return error.rawPreview;
  if (error.stderr) return error.stderr;
  if (error.stdout) return error.stdout;
  if (error.providerError && error.providerError.rawProviderMessage) return error.providerError.rawProviderMessage;
  if (error.providerError && error.providerError.response !== undefined) {
    try {
      return JSON.stringify(error.providerError.response);
    } catch (_error) {
      return String(error.providerError.response);
    }
  }
  return undefined;
}

function m100UserDiagnosticFromError(error, options = {}) {
  return m100Protocol.createUserDiagnostic({
    phase: options.phase || m100PhaseForError(error, options.fallbackPhase),
    code: options.code || m100ErrorCode(error, options.fallbackCode),
    message: options.message || error && (error.message || String(error)) || "Request failed.",
    requestId: options.requestId || error && error.requestId,
    actionId: options.actionId || error && error.actionId,
    executionId: options.executionId || error && error.executionId,
    commandId: options.commandId || error && error.commandId,
    lifecycleState: options.lifecycleState || error && error.lifecycleState,
    rawPreview: Object.prototype.hasOwnProperty.call(options, "rawPreview") ? options.rawPreview : m100RawPreviewForError(error),
    logRef: options.logRef || error && error.logRef
  });
}

function m100SanitizedProviderError(providerError) {
  if (!providerError || typeof providerError !== "object") return null;
  return m100SanitizedDiagnosticObject(providerError, 1000);
}

function m100SanitizedDiagnosticObject(value, maxLength = 4000) {
  if (value === undefined || value === null) return value;
  if (typeof value === "string") return m100Protocol.redactForUserDiagnostic(value, maxLength);
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => m100SanitizedDiagnosticObject(item, maxLength));
  if (typeof value === "object") {
    const output = {};
    for (const key of Object.keys(value)) {
      output[key] = m100SanitizedDiagnosticObject(value[key], key === "rawProviderMessage" ? 600 : maxLength);
    }
    return output;
  }
  return value;
}

function m100HttpFailure(error, options = {}) {
  const diagnostic = m100UserDiagnosticFromError(error, options);
  const failure = {
    ok: false,
    error: diagnostic.message,
    code: diagnostic.code,
    phase: diagnostic.phase,
    requestId: diagnostic.requestId || null,
    actionId: diagnostic.actionId || null,
    executionId: diagnostic.executionId || null,
    commandId: diagnostic.commandId || null,
    lifecycleState: diagnostic.lifecycleState || null,
    line: error && error.line || null,
    rawPreview: Object.prototype.hasOwnProperty.call(diagnostic, "rawPreview") ? diagnostic.rawPreview : null,
    readiness: m100SanitizedDiagnosticObject(error && error.readiness || null),
    providerError: m100SanitizedProviderError(error && error.providerError),
    diagnostic,
    m100Message: m100Protocol.createErrorEnvelope({
      requestId: diagnostic.requestId || "",
      actionId: diagnostic.actionId,
      executionId: diagnostic.executionId,
      phase: diagnostic.phase,
      code: diagnostic.code,
      error: diagnostic.message,
      rawPreview: diagnostic.rawPreview,
      logs: [
        {
          phase: diagnostic.phase,
          level: "error",
          message: diagnostic.message,
          logRef: diagnostic.logRef
        }
      ]
    })
  };
  failure.guidance = toolErrorResponse.buildGuidance(failure, {
    daemonAvailable: true, panelConnected: Date.now() - lastPanelSeenAt < 15000,
    exposedTools: exposedTools()
  });
  return failure;
}

function m100StoredProposalCopy(proposal) {
  const copy = JSON.parse(JSON.stringify(proposal || {}));
  if (copy.confirmation) {
    delete copy.confirmation.confirmationToken;
  }
  return copy;
}

function m100ProposalExpiresAtMs(record) {
  return Date.parse(record && record.proposalExpiresAt || "");
}

function m100ActionProposalIsExpired(record, now = Date.now()) {
  const expiresAtMs = m100ProposalExpiresAtMs(record);
  return Number.isFinite(expiresAtMs) && expiresAtMs <= now;
}

function m100ActionRecordState(record) {
  if (!record) return "missing";
  if (record.cancelledAt) return "cancelled";
  if (record.executionState) return record.executionState;
  return record.confirmedAt ? "confirmed" : "pending";
}

function storeM100ActionProposal(proposal, payload, options = {}) {
  const ownedFrame=options.ownedPreparationFrame;
  const ownedPreparation=!!ownedFrame&&ownedExecutionPreparationFrames.has(ownedFrame)&&ownedExecutionPreparationContext.getStore()===ownedFrame&&
    !ownedFrame.completed&&ownedFrame.descriptor.request.name==="propose_ai_agent_plan";
  if(ownedFrame&&!ownedPreparation)throw Object.assign(Error("owned_initial_private_proposal_frame_required"),{code:"owned_initial_private_proposal_frame_required"});
  const validation = m100Protocol.validateActionProposalEnvelope(proposal);
  if (!validation.ok) {
    if(!ownedPreparation)recordEvent("m100_action_proposal_rejected", {
      actionId: proposal && proposal.actionId || null,
      errors: validation.errors
    });
    return null;
  }
  pruneM100ActionProposalStore();
  const confirmation = proposal.confirmation || {};
  const risk = proposal.risk || {};
  const record = {
    requestId: proposal.requestId,
    actionId: proposal.actionId,
    payloadRef: proposal.action.payloadRef,
    payloadHash: proposal.action.payloadHash,
    previewHash: proposal.action.previewHash,
    riskLevel: risk.level,
    riskPolicyVersion: confirmation.riskPolicyVersion,
    proposalExpiresAt: confirmation.proposalExpiresAt,
    confirmationTokenHash: m100Protocol.hashConfirmationToken(confirmation.confirmationToken),
    confirmedAt: null,
    confirmedBySurface: null,
    confirmedBySession: null,
    confirmationSurface: confirmation.surface || "cep-panel",
    confirmationSessionId: confirmation.sessionId || "",
    executionState: "pending",
    executionId: null,
    dryRunCompletedAt: null,
    cancelledAt: null,
    proposal: m100StoredProposalCopy(proposal),
    payload,
    createdAt: new Date().toISOString()
  };
  if (options.beforeRegister) options.beforeRegister(payload.plan);
  if (options.lineage) Object.assign(record, options.lineage);
  currentProposalState.register(record, options.expectedCurrent);
  proposal.revision = record.revision;
  record.proposal.revision = record.revision;
  m100ActionProposalStore.set(record.actionId, record);
  m100ActionProposalStore.set(record.payloadRef, record);
  // Initial source preparation remains in the retained current record. Its
  // diagnostics do not create uncharged output files before an effect latch.
  if(!ownedPreparation)recordEvent("m100_action_proposal_created", {
    requestId: record.requestId,
    actionId: record.actionId,
    payloadRef: record.payloadRef,
    riskLevel: record.riskLevel,
    proposalExpiresAt: record.proposalExpiresAt,
    confirmationSurface: record.confirmationSurface,
    confirmationSessionId: record.confirmationSessionId || null
  });
  return proposal;
}

async function createM100AgentPlanProposal(planResult, options = {}) {
  if (!planResult || !planResult.plan || !planResult.planValidation || planResult.planValidation.ok !== true) {
    return null;
  }
  if (planResult.planValidation.mutatingCount > 0) {
    preflightAmeTitleSeries(planResult.plan);
    if (Date.now() - lastPanelSeenAt >= 15000) return null; // Offline planner drafts carry no execution authority.
    const lifecycleStep = lifecycle.planStep(planResult.plan);
    const projectInfo = lifecycleStep && projectLifecycleContract.isLifecycleCompletion(lifecycleStep.name)
      ? projectLifecycleState.normalizeProjectLifecycleState(await lifecycle.readState())
      : firstToolPayload(await callToolLogged("proposal-project-capture", "get_project_info", {}));
    if (!projectInfo || !projectInfo.file) throw m100ProtocolError("project_save_required", "Сохраните целевой проект перед созданием proposal.");
    const specifiedProject = planResult.plan.targetProject && planResult.plan.targetProject.file;
    if (specifiedProject && require("./proposal-state").normalizeProject(specifiedProject) !== require("./proposal-state").normalizeProject(projectInfo.file)) {
      throw m100ProtocolError("project_target_mismatch", "Proposal предназначен другому проекту.", {project: {expectedFile: specifiedProject, actualFile: projectInfo.file}});
    }
    planResult.plan = {...planResult.plan, targetProject: {file: projectInfo.file}};
    if (!lifecycleStep) await guardPlaceholderPlan(planResult.plan);
  }
  const payload = {
    kind: "agent_plan",
    requestId: planResult.requestId || null,
    plan: planResult.plan,
    userPrompt: planResult.userPrompt || null,
    planner: {
      agentId: planResult.agentId || null,
      model: planResult.model || null,
      agentMode: planResult.agentMode || null
    }
  };
  const preview = m100PreviewForAgentPlan(planResult.plan, planResult.planValidation);
  const proposal = m100Protocol.createActionProposalEnvelope({
    requestId: planResult.requestId,
    summary: planResult.plan.summary || "Validated AE Agent plan",
    details: "Backend-created M100 proposal for the validated Agent plan.",
    risk: m100RiskForAgentPlan(planResult.plan, planResult.planValidation),
    action: {
      kind: "ae_tool",
      toolName: "run_ai_agent_plan"
    },
    payload,
    preview,
    ttlMs: options.ttlMs || planResult.m100ProposalTtlMs,
    confirmationSurface: options.confirmationSurface || planResult.m100ConfirmationSurface || "cep-panel",
    confirmationSessionId: options.confirmationSessionId || planResult.m100ConfirmationSessionId || "",
    logs: [
      {
        phase: "protocol_validation",
        level: "info",
        message: "Backend created a canonical M100 action proposal from a validated Agent plan."
      }
    ]
  });
  return storeM100ActionProposal(proposal, payload, options);
}

async function createM100AgentPlanProposalFromRequest(body, internalOptions = {}) {
  const args = body || {};
  const plan = args.plan || args;
  const repairParent = args.parentActionId ? m100ActionProposalStore.get(String(args.parentActionId)) : null;
  const repairLineage = args.parentActionId ? autonomousRepair.validateRepair(repairParent, plan) : null;
  const requestId = optionalString(args, "requestId", "") || crypto.randomUUID();
  const prepared = validateAgentPlanWithRepair(plan, requestId, {
    solutionHints: args.solutionHints || args.planSolutionHints || null,
    projectIntentMemory: args.projectIntentMemory || args.planProjectIntentMemory || null
  }, {
    repairPlan: args.repairPlan
  });
  const validation = prepared.validation;
  if (!validation || validation.ok !== true) {
    throw m100ProtocolError("m100_agent_plan_not_valid", "Agent plan must pass backend validation before an M100 action proposal can be created.", {
      validation
    });
  }
  const ttlMs = hasArg(args, "ttlMs") ? optionalNumber(args, "ttlMs", m100Protocol.M100_ACTION_PROPOSAL_TTL_MS) : undefined;
  const planResult = {
    requestId,
    plan: prepared.plan,
    planValidation: validation,
    m100ProposalTtlMs: ttlMs,
    m100ConfirmationSurface: optionalString(args, "m100ConfirmationSurface", optionalString(args, "confirmationSurface", optionalString(args, "confirmedBySurface", "cep-panel"))),
    m100ConfirmationSessionId: optionalString(args, "m100ConfirmationSessionId", optionalString(args, "confirmationSessionId", optionalString(args, "confirmedBySession", "")))
  };
  const proposal = await createM100AgentPlanProposal(planResult, {
    ...internalOptions,
    expectedCurrent: repairParent || internalOptions.expectedCurrent,
    lineage: repairLineage || internalOptions.lineage,
    beforeRegister: (canonicalPlan) => {
      if (internalOptions.beforeRegister) internalOptions.beforeRegister(canonicalPlan);
      if (repairParent) autonomousRepair.validateRepair(repairParent, canonicalPlan);
    }
  });
  if (!proposal) {
    throw m100ProtocolError("panel_connection_required", "Подключите CEP-панель для проверки целевого проекта перед proposal.");
  }
  if (repairLineage) {
    Object.assign(m100ActionProposalStore.get(proposal.actionId), repairLineage);
    repairParent.repairChildActionId = proposal.actionId;
  }
  return {
    proposal,
    validation,
    planRepair: prepared.repair || null,
    repairedPlan: prepared.repair && prepared.repair.applied ? prepared.plan : null,
    plan: planResult.plan
  };
}

function m100PlanRunLookupKey(options) {
  const action = options && options.action && typeof options.action === "object" ? options.action : {};
  return {
    actionId: String(options && (options.actionId || options.m100ActionId) || action.actionId || "").trim(),
    payloadRef: String(options && (options.payloadRef || options.m100PayloadRef) || action.payloadRef || "").trim(),
    payloadHash: String(options && options.payloadHash || action.payloadHash || "").trim(),
    previewHash: String(options && options.previewHash || action.previewHash || "").trim(),
    riskLevel: String(options && options.riskLevel || action.riskLevel || "").trim(),
    riskPolicyVersion: String(options && options.riskPolicyVersion || action.riskPolicyVersion || "").trim(),
    confirmationToken: String(options && (options.confirmationToken || options.m100ConfirmationToken) || "").trim(),
    confirmedBySurface: String(options && (options.confirmedBySurface || options.confirmationSurface) || "").trim(),
    confirmedBySession: String(options && (options.confirmedBySession || options.confirmationSessionId) || "").trim()
  };
}

function resolveM100PlanRunOptions(options) {
  if (Object.keys(options || {}).some((key) => key.startsWith("_m100"))) {
    throw m100ProtocolError("internal_authority_fields_forbidden", "Внутренние полномочия выполнения нельзя передавать в запросе.");
  }
  const keys = m100PlanRunLookupKey(options);
  if (!keys.actionId && !keys.payloadRef) return options || {};
  pruneM100ActionProposalStore();
  const record = m100ActionProposalStore.get(keys.payloadRef) || m100ActionProposalStore.get(keys.actionId);
  if (!record || record.payload && record.payload.kind !== "agent_plan") {
    throw m100ProtocolError("m100_action_proposal_not_found", "M100 action proposal was not found. Create a fresh Agent proposal before running.");
  }
  currentProposalState.assertCurrent(record);
  if (["confirmed", "executing", "completed", "failed", "cancelled"].includes(record.executionState)) {
    throw m100ProtocolError("m100_confirmation_replayed", "План уже запущен или завершён. Повторное выполнение запрещено.");
  }
  if (keys.actionId && keys.actionId !== record.actionId) {
    throw m100ProtocolError("m100_action_id_mismatch", "M100 actionId does not match the stored proposal.");
  }
  if (keys.payloadRef && keys.payloadRef !== record.payloadRef) {
    throw m100ProtocolError("m100_payload_ref_mismatch", "M100 payloadRef does not match the stored proposal.");
  }
  if (keys.payloadHash && keys.payloadHash !== record.payloadHash) {
    throw m100ProtocolError("m100_payload_hash_mismatch", "M100 payloadHash does not match the stored proposal.");
  }
  if (keys.previewHash && keys.previewHash !== record.previewHash) {
    throw m100ProtocolError("m100_preview_hash_mismatch", "M100 previewHash does not match the stored proposal.");
  }
  if (m100ActionProposalIsExpired(record)) {
    record.executionState = "expired";
    throw m100ProtocolError("m100_action_proposal_expired", "M100 action proposal expired. Create a fresh Agent proposal before running.", {
      actionId: record.actionId,
      proposalExpiresAt: record.proposalExpiresAt
    });
  }
  return {
    ...(options || {}),
    plan: record.payload.plan,
    userPrompt: record.payload.userPrompt || optionalString(options || {}, "userPrompt", ""),
    planner: record.payload.planner || null,
    requestId: record.requestId,
    _m100ActionProposal: record.proposal,
    _m100ActionRecord: record,
    _m100PayloadRef: record.payloadRef
  };
}

function m100PlanRequiresConfirmation(validation) {
  if (!validation) return false;
  if (Number(validation.mutatingCount || 0) > 0) return true;
  if (rawExtendscriptStepCount(validation) > 0) return true;
  const steps = Array.isArray(validation.steps) ? validation.steps : [];
  return steps.some((step) => step && M100_DESTRUCTIVE_TOOL_NAMES.has(String(step.tool || "")));
}

function confirmM100ActionProposal(record, options, run) {
  const keys = m100PlanRunLookupKey(options || {});
  const autonomous = options && options._m100AutonomousSession && options._m100AutonomousSession.authorized === true
    ? options._m100AutonomousSession
    : null;
  if (!record) {
    throw m100ProtocolError("m100_action_proposal_not_found", "M100 action proposal was not found. Create a fresh Agent proposal before running.");
  }
  if (record.executionState === "cancelled" || record.cancelledAt) {
    throw m100ProtocolError("m100_action_proposal_cancelled", "M100 action proposal was already cancelled.");
  }
  if (record.confirmedAt || record.executionState === "confirmed" || record.executionState === "executing" || record.executionState === "completed" || record.executionState === "failed") {
    throw m100ProtocolError("m100_confirmation_replayed", "M100 confirmation token was already used.", {
      actionId: record.actionId,
      state: m100ActionRecordState(record)
    });
  }
  if (m100ActionProposalIsExpired(record)) {
    record.executionState = "expired";
    throw m100ProtocolError("m100_action_proposal_expired", "M100 action proposal expired. Create a fresh Agent proposal before running.", {
      actionId: record.actionId,
      proposalExpiresAt: record.proposalExpiresAt
    });
  }
  if (record.riskPolicyVersion !== M100_RISK_POLICY_VERSION) {
    throw m100ProtocolError("m100_risk_policy_changed", "M100 risk policy changed after this proposal was created. Create a fresh Agent proposal before running.", {
      expectedRiskPolicyVersion: record.riskPolicyVersion,
      currentRiskPolicyVersion: M100_RISK_POLICY_VERSION
    });
  }
  if (!keys.payloadHash || keys.payloadHash !== record.payloadHash) {
    throw m100ProtocolError("m100_payload_hash_mismatch", "M100 payloadHash does not match the stored proposal.");
  }
  if (!keys.previewHash || keys.previewHash !== record.previewHash) {
    throw m100ProtocolError("m100_preview_hash_mismatch", "M100 previewHash does not match the stored proposal.");
  }
  if (!keys.riskLevel || keys.riskLevel !== record.riskLevel) {
    throw m100ProtocolError("m100_risk_level_mismatch", "M100 risk level does not match the stored proposal.", {
      expectedRiskLevel: record.riskLevel,
      receivedRiskLevel: keys.riskLevel || null
    });
  }
  if (!keys.riskPolicyVersion || keys.riskPolicyVersion !== record.riskPolicyVersion) {
    throw m100ProtocolError("m100_risk_policy_mismatch", "M100 risk policy version does not match the stored proposal.", {
      expectedRiskPolicyVersion: record.riskPolicyVersion,
      receivedRiskPolicyVersion: keys.riskPolicyVersion || null
    });
  }
  if (!autonomous) {
    if (!keys.confirmationToken || m100Protocol.hashConfirmationToken(keys.confirmationToken) !== record.confirmationTokenHash) {
      throw m100ProtocolError("m100_confirmation_token_mismatch", "M100 confirmation token does not match the stored proposal.");
    }
    if (!keys.confirmedBySurface || keys.confirmedBySurface !== record.confirmationSurface) {
      throw m100ProtocolError("m100_confirmation_surface_mismatch", "M100 confirmation surface does not match the stored proposal.", {
        expectedSurface: record.confirmationSurface,
        receivedSurface: keys.confirmedBySurface || null
      });
    }
    if (record.confirmationSessionId && keys.confirmedBySession !== record.confirmationSessionId) {
      throw m100ProtocolError("m100_confirmation_session_mismatch", "M100 confirmation session does not match the stored proposal.", {
        expectedSession: record.confirmationSessionId,
        receivedSession: keys.confirmedBySession || null
      });
    }
  }
  currentProposalState.assertCurrent(record);

  record.confirmedAt = new Date().toISOString();
  record.confirmedBySurface = autonomous ? "cep-autonomous-session" : keys.confirmedBySurface;
  record.confirmedBySession = autonomous ? `session-${autonomous.sessionHash}` : (keys.confirmedBySession || "");
  record.executionState = "confirmed";
  record.executionId = run && run.id || null;
  recordEvent("m100_action_proposal_confirmed", {
    requestId: record.requestId,
    actionId: record.actionId,
    executionId: record.executionId,
    confirmedBySurface: record.confirmedBySurface,
    confirmedBySession: record.confirmedBySession || null
  });
  return record;
}

function m100RunFieldsForProposal(proposal, includeConfirmation) {
  if (!proposal || !proposal.action || !proposal.confirmation || !proposal.risk) return {};
  const fields = {
    actionId: proposal.actionId,
    payloadRef: proposal.action.payloadRef,
    payloadHash: proposal.action.payloadHash,
    previewHash: proposal.action.previewHash,
    riskLevel: proposal.risk.level,
    riskPolicyVersion: proposal.confirmation.riskPolicyVersion,
    requestId: proposal.requestId
  };
  if (includeConfirmation) {
    fields.confirmationToken = proposal.confirmation.confirmationToken;
    fields.confirmedBySurface = proposal.confirmation.surface || "cep-panel";
    fields.confirmedBySession = proposal.confirmation.sessionId || "";
  }
  return fields;
}

function aeLiteral(value) {
  return JSON.stringify(value)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function hasArg(args, name) {
  return Object.prototype.hasOwnProperty.call(args, name) && args[name] !== undefined && args[name] !== null && args[name] !== "";
}

function hasRequiredPlanArg(toolName, args, name) {
  if ((toolName === "add_layer_marker" || toolName === "add_comp_marker") && name === "comment") {
    return Object.prototype.hasOwnProperty.call(args, name) && args[name] !== undefined && args[name] !== null;
  }
  return hasArg(args, name);
}

function optionalNumber(args, name, fallback) {
  if (!hasArg(args, name)) return fallback;
  const value = Number(args[name]);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number.`);
  }
  return value;
}

function requiredPositiveInteger(args, name) {
  const value = args[name];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive 1-based integer.`);
  }
  return value;
}

function requiredPositiveIntegerList(args, name) {
  let raw = args[name];
  if (typeof raw === "string" && raw.trim().startsWith("[")) {
    raw = JSON.parse(raw);
  }
  const values = Array.isArray(raw) ? raw : [raw];
  if (!values.length) throw new Error(`${name} must include at least one positive 1-based integer.`);

  const result = [];
  const seen = new Set();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
      throw new Error(`${name} must contain only positive 1-based integers.`);
    }
    const normalized = value;
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

function requiredExplicitPositiveIntegerList(args, name) {
  let raw = args[name];
  if (typeof raw === "string" && raw.trim().startsWith("[")) {
    raw = JSON.parse(raw);
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`${name} must be a non-empty array of positive 1-based integers.`);
  }

  const result = [];
  const seen = new Set();
  for (let index = 0; index < raw.length; index += 1) {
    const value = raw[index];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
      throw new Error(`${name} must contain only positive 1-based integers.`);
    }
    if (seen.has(value)) {
      throw new Error(`${name} must not contain duplicate layer indexes.`);
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function optionalPositiveInteger(args, name) {
  if (!Object.prototype.hasOwnProperty.call(args, name) || args[name] === undefined) return null;
  return requiredPositiveInteger(args, name);
}

function optionalPositiveIntegerList(args, name) {
  if (!hasArg(args, name)) return null;
  return requiredPositiveIntegerList(args, name);
}

function optionalString(args, name, fallback) {
  if (!hasArg(args, name)) return fallback;
  return String(args[name]);
}

function optionalTextJustification(args, name, fallback) {
  if (!hasArg(args, name)) return fallback;
  const normalized = String(args[name]).trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["left", "left_justify", "left_justified"].includes(normalized)) return "left";
  if (["center", "centre", "center_justify", "centered", "center_justified"].includes(normalized)) return "center";
  if (["right", "right_justify", "right_justified"].includes(normalized)) return "right";
  throw new Error(`${name} must be one of: left, center, right.`);
}

function optionalBoolean(args, name, fallback) {
  if (!hasArg(args, name)) return fallback;
  const value = args[name];
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  throw new Error(`${name} must be a boolean.`);
}

function normalizePuppetPinType(value, fieldName = "pinType") {
  if (typeof value === "number") {
    if (value === 1 || value === 4) return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "position") return 1;
    if (normalized === "4" || normalized === "advanced") return 4;
  }
  throw new Error(`${fieldName} must be 1/position or 4/advanced.`);
}

function parseArrayArg(value, name) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed[0] === "[") {
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) throw new Error(`${name} must be an array.`);
      return parsed;
    }
    return trimmed.split(",").map((item) => Number(item.trim()));
  }
  throw new Error(`${name} must be an array.`);
}

function optionalNumberArray(args, name, fallback, minLength, maxLength) {
  if (!hasArg(args, name)) return fallback;
  const values = parseArrayArg(args[name], name).map((value) => Number(value));
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error(`${name} must contain only finite numbers.`);
  }
  if (minLength && values.length < minLength) {
    throw new Error(`${name} must have at least ${minLength} numbers.`);
  }
  if (maxLength && values.length > maxLength) {
    throw new Error(`${name} must have no more than ${maxLength} numbers.`);
  }
  return values;
}

function parsePointArrayValue(raw, name, minLength, maxLength) {
  if (typeof raw === "string") raw = JSON.parse(raw);
  if (!Array.isArray(raw)) throw new Error(`${name} must be an array of [x, y] points.`);
  if (minLength && raw.length < minLength) throw new Error(`${name} must include at least ${minLength} points.`);
  if (maxLength && raw.length > maxLength) throw new Error(`${name} must include no more than ${maxLength} points.`);
  return raw.map((point, index) => {
    if (!Array.isArray(point) || point.length < 2) {
      throw new Error(`${name}[${index}] must be an [x, y] point.`);
    }
    const x = Number(point[0]);
    const y = Number(point[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(`${name}[${index}] must contain finite coordinates.`);
    }
    return [x, y];
  });
}

function requiredPointArray(args, name, minLength, maxLength) {
  if (!hasArg(args, name)) throw new Error(`${name} is required.`);
  return parsePointArrayValue(args[name], name, minLength, maxLength);
}

function parsePathGeometryValue(value, name, minVertices, maxVertices) {
  const raw = typeof value === "string" ? JSON.parse(value) : value;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${name} must be an object with vertices, inTangents, outTangents, and closed.`);
  }

  const vertices = parsePointArrayValue(raw.vertices, `${name}.vertices`, minVertices, maxVertices);
  const inTangents = parsePointArrayValue(raw.inTangents, `${name}.inTangents`, vertices.length, vertices.length);
  const outTangents = parsePointArrayValue(raw.outTangents, `${name}.outTangents`, vertices.length, vertices.length);
  if (typeof raw.closed !== "boolean") throw new Error(`${name}.closed must be a boolean.`);
  if (raw.closed && vertices.length < 3) throw new Error(`${name}.vertices must include at least 3 points when closed is true.`);

  const coordinateLimit = 1000000;
  const allPoints = vertices.concat(inTangents, outTangents);
  if (allPoints.some((point) => Math.abs(point[0]) > coordinateLimit || Math.abs(point[1]) > coordinateLimit)) {
    throw new Error(`${name} coordinates must be between -1000000 and 1000000.`);
  }

  return {
    vertices,
    inTangents,
    outTangents,
    closed: raw.closed
  };
}

function optionalPathGeometry(args, name, fallback) {
  if (!hasArg(args, name)) return fallback;
  return parsePathGeometryValue(args[name], name, 2, 80);
}

function pathGeometryFromTopLevelArgs(args) {
  if (!hasArg(args || {}, "vertices") && !hasArg(args || {}, "inTangents") && !hasArg(args || {}, "outTangents") && !hasArg(args || {}, "closed")) {
    return null;
  }
  return parsePathGeometryValue({
    vertices: args.vertices,
    inTangents: args.inTangents,
    outTangents: args.outTangents,
    closed: args.closed
  }, "geometry", 2, 80);
}

function requiredPathGeometryKeyframes(args, name) {
  const raw = args ? args[name] : null;
  const items = Array.isArray(raw)
    ? raw
    : typeof raw === "string" && raw.trim().startsWith("[")
      ? JSON.parse(raw)
      : null;
  if (!Array.isArray(items) || !items.length) throw new Error(`${name} must be a non-empty array.`);
  if (items.length > 80) throw new Error(`${name} must include no more than 80 keyframes.`);
  return items.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${name}[${index}] must be an object.`);
    }
    const time = Number(item.time);
    if (!Number.isFinite(time) || time < 0) throw new Error(`${name}[${index}].time must be a non-negative finite number.`);
    return {
      time,
      geometry: parsePathGeometryValue(item.geometry || item, `${name}[${index}]`, 2, 80)
    };
  });
}

function sanitizeFilenamePart(value) {
  return String(value || "")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function timestampForFilename(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function timestampFromFilename(value) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3}Z)$/);
  return match ? `${match[1]}:${match[2]}:${match[3]}.${match[4]}` : null;
}

function parseCheckpointFilename(filename) {
  const parsed = path.parse(filename);
  if (parsed.ext.toLowerCase() !== ".aep") return null;

  const match = parsed.name.match(/^(.*)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)$/);
  if (!match) return null;

  const prefix = match[1];
  const checkpointIndex = prefix.indexOf(CHECKPOINT_SUFFIX);
  if (checkpointIndex < 0) return null;

  const rawLabel = prefix.slice(checkpointIndex + CHECKPOINT_SUFFIX.length).replace(/^-/, "");
  return {
    projectName: prefix.slice(0, checkpointIndex) || null,
    label: rawLabel || null,
    createdAt: timestampFromFilename(match[2])
  };
}

async function getCurrentProjectSummary() {
  const projectInfo = await runExtendScriptBody(`
    var project = app.project;
    return {
      file: project && project.file ? project.file.fsName : null,
      name: project && project.file ? project.file.name : null,
      numItems: project ? project.numItems : 0,
      activeItemName: project && project.activeItem ? project.activeItem.name : null,
      activeItemType: project && project.activeItem ? project.activeItem.typeName : null
    };
  `);
  return projectInfo.result;
}

async function copySavedProjectFile(label, kind) {
  const safeLabel = sanitizeFilenamePart(label);
  const project = await getCurrentProjectSummary();
  const sourceFile = project.file;
  if (!sourceFile) {
    throw new Error("The current After Effects project has not been saved yet, so there is no .aep file to copy.");
  }
  if (!fs.existsSync(sourceFile)) {
    throw new Error(`Project file does not exist on disk: ${sourceFile}`);
  }

  ensureDir(BACKUP_DIR);
  const parsed = path.parse(sourceFile);
  const base = sanitizeFilenamePart(parsed.name) || "after-effects-project";
  const suffixParts = kind === "checkpoint" ? ["checkpoint"] : [];
  if (safeLabel) suffixParts.push(safeLabel);
  const suffix = suffixParts.length ? `-${suffixParts.join("-")}` : "";
  const destinationFile = path.join(BACKUP_DIR, `${base}${suffix}-${timestampForFilename(new Date())}${parsed.ext || ".aep"}`);

  fs.copyFileSync(sourceFile, destinationFile, fs.constants.COPYFILE_EXCL);
  const stat = fs.statSync(destinationFile);
  return {
    sourceFile,
    destinationFile,
    label: safeLabel || null,
    bytes: stat.size,
    createdAt: new Date().toISOString(),
    project
  };
}

function listProjectCheckpoints(args) {
  const limit = Math.max(1, Math.min(500, Math.floor(optionalNumber(args, "limit", 100))));
  ensureDir(BACKUP_DIR);

  return fs.readdirSync(BACKUP_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const parsed = parseCheckpointFilename(entry.name);
      if (!parsed) return null;

      const checkpointFile = path.join(BACKUP_DIR, entry.name);
      const stat = fs.statSync(checkpointFile);
      return {
        checkpointFile,
        filename: entry.name,
        label: parsed.label,
        projectName: parsed.projectName,
        bytes: stat.size,
        createdAt: parsed.createdAt || stat.birthtime.toISOString(),
        modifiedAt: stat.mtime.toISOString()
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit);
}

function checkpointDetails(checkpointFile) {
  const stat = fs.statSync(checkpointFile);
  const parsed = parseCheckpointFilename(path.basename(checkpointFile));
  return {
    checkpointFile,
    filename: path.basename(checkpointFile),
    label: parsed ? parsed.label : null,
    projectName: parsed ? parsed.projectName : null,
    bytes: stat.size,
    createdAt: parsed && parsed.createdAt ? parsed.createdAt : stat.birthtime.toISOString(),
    modifiedAt: stat.mtime.toISOString(),
    isCheckpoint: Boolean(parsed)
  };
}

function resolveCheckpointFile(checkpointFile, options) {
  const requireCheckpointName = !options || options.requireCheckpointName !== false;
  const requested = String(checkpointFile || "").trim();
  if (!requested) throw new Error("checkpointFile is required.");

  const resolvedPath = path.resolve(BACKUP_DIR, requested);
  if (!isPathInside(BACKUP_DIR, resolvedPath)) {
    throw new Error("checkpointFile must resolve inside the bridge backups folder.");
  }
  if (path.extname(resolvedPath).toLowerCase() !== ".aep") {
    throw new Error("checkpointFile must point to a .aep file.");
  }
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Checkpoint file does not exist: ${resolvedPath}`);
  }
  if (requireCheckpointName && !parseCheckpointFilename(path.basename(resolvedPath))) {
    throw new Error("checkpointFile must be a checkpoint created by checkpoint_project or an opt-in mutating tool checkpoint.");
  }

  return resolvedPath;
}

async function maybeCreateMutationCheckpoint(args, toolName) {
  if (!MUTATING_TOOL_NAMES.has(toolName)) return null;

  const label = optionalString(args, "checkpointLabel", "");
  const autoCheckpoint = optionalBoolean(args, "autoCheckpoint", false);
  if (!label && !autoCheckpoint) return null;

  const checkpointLabel = label || `before-${toolName}`;
  const copied = await copySavedProjectFile(checkpointLabel, "checkpoint");
  const checkpoint = {
    label: copied.label,
    sourceFile: copied.sourceFile,
    checkpointFile: copied.destinationFile,
    bytes: copied.bytes,
    createdAt: copied.createdAt,
    project: copied.project,
    triggeredBy: toolName
  };
  recordEvent("project_mutation_checkpoint_created", checkpoint);
  return checkpoint;
}

function compactCheckpoint(checkpoint) {
  if (!checkpoint) return null;
  return {
    label: checkpoint.label || null,
    sourceFile: checkpoint.sourceFile || null,
    checkpointFile: checkpoint.checkpointFile || null,
    bytes: checkpoint.bytes || null,
    createdAt: checkpoint.createdAt || null
  };
}

function inferMutationTarget(toolName, args, payload) {
  const target = { tool: toolName };
  const request = {};
  for (const key of ["compItemIndex", "compName", "layerIndex", "layerIndices", "layerName", "sourceName", "expectedLayerName", "expectedLayerNames", "comment", "label", "locked", "maskIndex", "expectedMaskName", "operation", "maskMode", "targetTime", "time", "frame", "frameRate", "expectedCurrentTime", "clampToDuration", "align", "start", "duration", "startTime", "inPoint", "outPoint", "gap", "overlap", "order", "itemIndex", "itemName", "itemIndices", "expectedItemNames", "itemType", "sourceItemIndex", "sourceItemName", "sourceCompItemIndex", "sourceCompName", "nameSuffix", "effect", "effectIndex", "effectName", "effectMatchName", "property", "propertyPath", "name", "namePrefix", "newCompName", "mode", "shape", "allowEmptyName", "renderQueueItemIndex", "outputPath", "outputFileName"]) {
    if (hasArg(args || {}, key)) request[key] = args[key];
  }
  if (Object.keys(request).length) target.request = request;

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    if (payload.comp) target.comp = payload.comp;
    if (payload.layer) target.layer = payload.layer;
    if (payload.layers) target.layers = payload.layers;
    if (payload.effect) target.effect = payload.effect;
    if (payload.property) target.property = payload.property;
    if (payload.item) target.item = payload.item;
    if (hasArg(payload, "itemIndex") || hasArg(payload, "name") || hasArg(payload, "typeName")) {
      target.item = {
        itemIndex: payload.itemIndex || null,
        name: payload.name || null,
        typeName: payload.typeName || null
      };
    }
    if (payload.checkpointFile) target.checkpointFile = payload.checkpointFile;
    if (payload.backupFile) target.backupFile = payload.backupFile;
    if (payload.sourceFile) target.sourceFile = payload.sourceFile;
    if (payload.sourceItem) target.sourceItem = payload.sourceItem;
    if (payload.originalComp) target.originalComp = payload.originalComp;
    if (payload.duplicateComp) target.duplicateComp = payload.duplicateComp;
    if (payload.duplicatedItems) target.duplicatedItems = payload.duplicatedItems;
    if (payload.renderQueueItem) target.renderQueueItem = payload.renderQueueItem;
    if (payload.renderQueueItems) target.renderQueueItems = payload.renderQueueItems;
    if (payload.file) target.file = payload.file;
    if (payload.renamed) target.renamed = payload.renamed;
    if (payload.split) target.split = payload.split;
    if (payload.namePrefix) target.namePrefix = payload.namePrefix;
    if (Array.isArray(payload.removed)) target.removed = payload.removed;
  }

  return target;
}

function mutationUndoHint(toolName, checkpoint) {
  if (checkpoint) return "A checkpoint was created before this operation; use restore_project_checkpoint for a safe manual restore path.";
  if (toolName === "delete_project_checkpoint") return "Deleted checkpoint files cannot be restored by the bridge.";
  if (toolName === "checkpoint_project") return "Delete the checkpoint with delete_project_checkpoint if it is no longer needed.";
  return "Use After Effects Undo for the last operation when applicable, or create a checkpoint before risky edits.";
}

function buildMutationSummary(toolName, args, payload, checkpoint) {
  const effectiveCheckpoint = checkpoint || (payload && typeof payload === "object" ? payload.checkpoint : null);
  let changed = true;
  if (payload && typeof payload === "object") {
    if (typeof payload.removedCount === "number") changed = payload.removedCount > 0;
    if (typeof payload.deleted === "boolean") changed = payload.deleted;
  }

  return {
    tool: toolName,
    changed,
    target: inferMutationTarget(toolName, args || {}, payload),
    checkpoint: compactCheckpoint(effectiveCheckpoint),
    undoHint: mutationUndoHint(toolName, effectiveCheckpoint)
  };
}

function withMutationMetadata(payload, toolName, args, checkpoint) {
  let result = payload;
  if (checkpoint) {
    if (result && typeof result === "object" && !Array.isArray(result)) {
      result = { ...result, checkpoint };
    } else {
      result = { result, checkpoint };
    }
  }

  if (!MUTATION_SUMMARY_TOOL_NAMES.has(toolName)) return result;

  if (result && typeof result === "object" && !Array.isArray(result)) {
    return {
      ...result,
      mutation: buildMutationSummary(toolName, args || {}, result, checkpoint)
    };
  }

  return {
    result,
    mutation: buildMutationSummary(toolName, args || {}, result, checkpoint)
  };
}

function attachMutationMetadataToToolResult(result, toolName, args, checkpoint) {
  if (!result || result.isError || !Array.isArray(result.content) || !result.content[0]) return result;
  if (!checkpoint && !MUTATION_SUMMARY_TOOL_NAMES.has(toolName)) return result;

  const content = result.content.slice();
  const first = { ...content[0] };
  first.text = JSON.stringify(withMutationMetadata(parseToolText(first.text), toolName, args || {}, checkpoint), null, 2);
  content[0] = first;
  return {
    ...result,
    content
  };
}

function attachPayloadMetadataToToolResult(result, key, metadata) {
  if (!result || !Array.isArray(result.content) || !result.content[0]) return result;
  const content = result.content.slice();
  const first = { ...content[0] };
  const payload = parseToolText(first.text);
  let nextPayload;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    nextPayload = { ...payload, [key]: metadata };
  } else {
    nextPayload = { result: payload, [key]: metadata };
  }
  first.text = JSON.stringify(nextPayload, null, 2);
  content[0] = first;
  return {
    ...result,
    content
  };
}

function cloneToolResult(result) {
  if (!result) return result;
  return JSON.parse(JSON.stringify(result));
}

function stableForHash(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map((item) => stableForHash(item));
  if (typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      if ([
        "autoCheckpoint",
        "checkpointLabel",
        "idempotencyKey",
        "idempotencyScope",
        "verifyAfter"
      ].includes(key)) continue;
      result[key] = stableForHash(value[key]);
    }
    return result;
  }
  return value;
}

function hashStableValue(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stableForHash(value)))
    .digest("hex");
}

function idempotencyContext(toolName, args) {
  if (!MUTATING_TOOL_NAMES.has(toolName)) return null;
  const key = optionalString(args || {}, "idempotencyKey", "").trim();
  if (!key) return null;
  const scope = optionalString(args || {}, "idempotencyScope", "default").trim() || "default";
  const generation = lifecycle.epoch();
  return {
    key,
    scope,
    tool: toolName,
    recordKey: `${generation > 0 ? `lifecycle-${generation}:` : ""}${scope}:${toolName}:${key}`,
    argsHash: hashStableValue(args || {})
  };
}

function loadIdempotencyRecords() {
  for (const event of tailJsonl(IDEMPOTENCY_LOG_FILE, 500)) {
    if (!event || event.type !== "stored" || !event.record || !event.record.recordKey) continue;
    idempotencyRecords.set(event.record.recordKey, event.record);
  }
}

function storeIdempotencyResult(context, eventId, result) {
  if (!context || !result || result.isError) return null;
  const record = {
    ...context,
    eventId,
    recordedAt: new Date().toISOString(),
    result: cloneToolResult(result)
  };
  idempotencyRecords.set(context.recordKey, record);
  appendJsonl(IDEMPOTENCY_LOG_FILE, {
    at: record.recordedAt,
    type: "stored",
    record
  });
  return record;
}

function replayIdempotencyResult(context, record) {
  return attachPayloadMetadataToToolResult(cloneToolResult(record.result), "idempotency", {
    key: context.key,
    scope: context.scope,
    replayed: true,
    firstEventId: record.eventId,
    recordedAt: record.recordedAt
  });
}

function buildServerSemanticVerification(plan, run) {
  return buildSemanticVerification(plan, run, {
    generatedExportDir: GENERATED_EXPORT_DIR,
    projectRoot: PROJECT_ROOT
  });
}

function validateCachedPngReplay(record, options = {}) {
  const exportDir = options.exportDir || GENERATED_EXPORT_DIR;
  const payload = firstToolPayload(record && record.result);
  const file = payload && typeof payload === "object" && !Array.isArray(payload) && payload.file && typeof payload.file === "object" && !Array.isArray(payload.file)
    ? payload.file
    : null;
  if (!file || file.pngComplete !== true) {
    // Historical cached proof without completion is preserved without promotion
    return { ok: true, hasCompletion: false, file };
  }
  const maxBytes = resolveMaxBytes(options.maxBytes);
  if (!Number.isSafeInteger(file.byteLength) || file.byteLength <= 0 || file.byteLength > maxBytes ||
    typeof file.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(file.sha256) ||
    ![file.width, file.height].every(n => Number.isSafeInteger(n) && n > 0 && n <= 0x7fffffff)) {
    return { ok: false, reason: "invalid_cached_file_proof" };
  }
  const targetPath = file.outputPath || (payload && payload.outputPath);
  if (typeof targetPath !== "string" || !targetPath.trim()) {
    return { ok: false, reason: "missing_output_path" };
  }
  const resolvedPath = path.resolve(targetPath);
  let realFilePath = resolvedPath;
  try {
    if (fs.existsSync(resolvedPath)) {
      realFilePath = fs.realpathSync(resolvedPath);
    }
  } catch {}
  let realExportDir = path.resolve(exportDir);
  try {
    if (fs.existsSync(realExportDir)) {
      realExportDir = fs.realpathSync(realExportDir);
    }
  } catch {}
  if (!realFilePath.startsWith(realExportDir + path.sep) && realFilePath !== realExportDir) {
    return { ok: false, reason: "foreign_path", path: realFilePath, allowedDir: realExportDir };
  }
  if (!fs.existsSync(realFilePath)) {
    return { ok: false, reason: "file_not_found", path: realFilePath };
  }
  let statBefore;
  try {
    statBefore = fs.statSync(realFilePath);
  } catch (err) {
    return { ok: false, reason: "stat_failed", error: err.message };
  }
  if (!statBefore.isFile()) {
    return { ok: false, reason: "not_a_file", path: realFilePath };
  }
  if (statBefore.size === 0) {
    return { ok: false, reason: "file_empty", path: realFilePath };
  }
  if (statBefore.size > maxBytes) {
    return { ok: false, reason: "file_oversize", byteLength: statBefore.size, maxBytes, path: realFilePath };
  }
  let buffer;
  try {
    buffer = fs.readFileSync(realFilePath);
  } catch (err) {
    return { ok: false, reason: "read_failed", error: err.message };
  }
  let statAfter;
  try {
    statAfter = fs.statSync(realFilePath);
  } catch (err) {
    return { ok: false, reason: "stat_after_read_failed", error: err.message };
  }
  if (!sameFileSnapshot(statBefore, statAfter, buffer.length)) {
    return { ok: false, reason: "concurrent_modification", path: realFilePath };
  }
  if (buffer.length !== file.byteLength) {
    return { ok: false, reason: "byte_length_mismatch", expected: file.byteLength, actual: buffer.length };
  }
  const currentProof = verifyCompletePngBuffer(buffer, options);
  if (!currentProof.ok) {
    return { ok: false, reason: `invalid_png:${currentProof.reason}` };
  }
  if (currentProof.sha256 !== file.sha256) {
    return { ok: false, reason: "sha256_mismatch", expected: file.sha256, actual: currentProof.sha256 };
  }
  if (currentProof.width !== file.width || currentProof.height !== file.height) {
    return { ok: false, reason: "dimensions_mismatch" };
  }
  let statFinal;
  try {
    statFinal = fs.statSync(realFilePath);
  } catch (err) {
    return { ok: false, reason: "stat_final_failed", error: err.message };
  }
  if (!sameFileSnapshot(statAfter, statFinal, buffer.length)) {
    return { ok: false, reason: "concurrent_modification_during_proof", path: realFilePath };
  }
  return {
    ok: true,
    hasCompletion: true,
    proof: currentProof,
    mtimeMs: statFinal.mtimeMs,
    birthtimeMs: statFinal.birthtimeMs,
    dev: statFinal.dev,
    ino: statFinal.ino,
    path: realFilePath
  };
}

function attachStoredIdempotencyMetadata(result, context, record) {
  if (!record) return result;
  return attachPayloadMetadataToToolResult(result, "idempotency", {
    key: context.key,
    scope: context.scope,
    replayed: false,
    firstEventId: record.eventId,
    recordedAt: record.recordedAt
  });
}

function inferVerificationTarget(toolName, args, payload) {
  const target = {
    tool: toolName,
    compItemIndex: null,
    compName: "",
    layerIndex: null,
    layerName: "",
    itemIndex: null,
    itemName: ""
  };

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    if (payload.comp) {
      target.compItemIndex = Number(payload.comp.itemIndex || payload.comp.index) || null;
      target.compName = payload.comp.name || "";
    }
    if (payload.layer) {
      target.layerIndex = Number(payload.layer.index) || null;
      target.layerName = payload.layer.name || "";
    }
    if (hasArg(payload, "itemIndex")) target.itemIndex = Number(payload.itemIndex) || null;
    if (hasArg(payload, "name")) {
      const payloadName = String(payload.name || "");
      target.itemName = payloadName;
      if ((toolName === "create_test_comp" || toolName === "create_comp") && !target.compName) target.compName = payloadName;
    }
    if (!target.compItemIndex && payload.item && hasArg(payload.item, "itemIndex")) {
      target.compItemIndex = Number(payload.item.itemIndex) || null;
    }
    if (!target.compName && payload.item && payload.item.name) target.compName = payload.item.name;
    if (!target.itemIndex && payload.item && hasArg(payload.item, "itemIndex")) {
      target.itemIndex = Number(payload.item.itemIndex) || null;
    }
    if (!target.itemName && payload.item && payload.item.name) target.itemName = payload.item.name;
    if (!target.itemIndex && payload.folder && hasArg(payload.folder, "itemIndex")) {
      target.itemIndex = Number(payload.folder.itemIndex) || null;
    }
    if (!target.itemName && payload.folder && payload.folder.name) target.itemName = payload.folder.name;
  }

  const rawArgs = args || {};
  if (!target.compItemIndex && hasArg(rawArgs, "compItemIndex")) target.compItemIndex = Number(rawArgs.compItemIndex) || null;
  if (!target.compName && hasArg(rawArgs, "compName")) target.compName = String(rawArgs.compName || "");
  if (!target.layerIndex && hasArg(rawArgs, "layerIndex")) target.layerIndex = Number(rawArgs.layerIndex) || null;
  if (!target.layerName && hasArg(rawArgs, "layerName")) target.layerName = String(rawArgs.layerName || "");
  if (hasArg(rawArgs, "name")) {
    const argName = String(rawArgs.name || "");
    if (toolName === "create_test_comp" || toolName === "create_comp") {
      if (!target.compName) target.compName = argName;
      if (!target.itemName) target.itemName = argName;
    } else if (toolName === "create_project_folder") {
      if (!target.itemName) target.itemName = argName;
    } else if (!target.layerName) {
      target.layerName = argName;
    }
  }
  if (!target.itemIndex && hasArg(rawArgs, "itemIndex")) target.itemIndex = Number(rawArgs.itemIndex) || null;
  if (!target.itemName && hasArg(rawArgs, "itemName")) target.itemName = String(rawArgs.itemName || "");

  if (slideshowTools.TOOL_NAMES.includes(toolName)) {
    target.compName = rawArgs.expectedMasterCompName || rawArgs.masterName || rawArgs.generatedRootName || rawArgs.expectedRootCompName || "";
    target.compItemIndex = null;
    target.itemIndex = null;
    target.requireExactComp = true;
  }

  return target;
}

async function verifyMutationResult(toolName, args, payload) {
  if(toolName==="reload_montage_material_source"){
    const current=await readCurrentSourceLoadEvidence(args.sourceItemId);
    const context=planCommandContext.getStore();
    if(context?.item){context.item.independentReadBack=[{index:2,tool:"get_montage_source_load_evidence",args:{sourceItemId:args.sourceItemId},status:"completed",result:current,source:"server_typed_readback",observedAt:new Date().toISOString()}];context.persist();}
    return {ok:current.ok===true && current.epoch?.epochId===payload?.sourceLoadEpoch?.epochId,scope:"independent_native_source_load_epoch",sourceLoadEvidence:current};
  }
  if(["set_layer_transform","set_property_value","set_effect_property","replace_layer_source"].includes(toolName)) {
    const compId=payload && payload.comp && payload.comp.itemId;
    const layers=payload && (payload.layers || (payload.layer ? [payload.layer] : []));
    if(!Number.isSafeInteger(compId) || !Array.isArray(layers) || !layers.length) return {ok:false,scope:"independent_requested_values",reason:"stable_target_evidence_missing"};
    const reads=[];
    for(const layer of layers) {
      if(!Number.isSafeInteger(layer.id)) return {ok:false,reason:"stable_target_evidence_missing"};
      let tool="get_layer_details",readArgs={compItemId:compId,layerId:layer.id};
      if(toolName==="set_property_value") {tool="get_property_value";readArgs.propertyPath=args.propertyPath; if(typeof readArgs.propertyPath==="string") readArgs.propertyPath=readArgs.propertyPath.trim().startsWith("[") ? JSON.parse(readArgs.propertyPath) : readArgs.propertyPath.split(".");if(args.setAtTime===true || args.time!==undefined)readArgs.time=args.time;}
      if(toolName==="set_effect_property") {tool="get_effect_details";for(const field of ["effectIndex","effectName","effectMatchName"])if(args[field]!==undefined)readArgs[field]=args[field];readArgs.includeValues=true;readArgs.includeProperties=true;}
      const read=await callTool(tool,readArgs);
      reads.push({index:reads.length+2,tool,args:readArgs,status:read.isError?"failed":"completed",result:firstToolPayload(read)});
    }
    const context=planCommandContext.getStore();
    if(context && context.item) {
      context.item.independentReadBack=reads.map(read=>({...read,source:"server_typed_readback",observedAt:new Date().toISOString()}));
      context.persist();
    }
    const mutation={index:1,tool:toolName,args,status:"completed",mutatesProject:true,result:payload};
    const semantic=buildServerSemanticVerification({steps:[{tool:toolName,args},...reads.map(read=>({tool:read.tool,args:read.args}))]}, {steps:[mutation,...reads],ok:true});
    return {ok:semantic.status==="passed" && semantic.unverifiedMutationCount===0,scope:"independent_requested_values",status:semantic.status,checks:semantic.checks,readBack:reads.map(read=>({tool:read.tool,args:read.args,result:read.result}))};
  }
  if (toolName === "import_footage") {
    const item = payload && payload.item;
    const hasItemId = item && Number.isSafeInteger(item.itemId) && item.itemId > 0;
    const hasId = item && hasArg(item, "id");
    const idValid = hasId ? (Number.isSafeInteger(item.id) && item.id > 0 && item.id === item.itemId) : true;
    const returnedId = hasItemId && idValid ? item.itemId : null;
    if (!returnedId) return { ok: false, scope: "independent_imported_source", reason: "stable_target_evidence_missing" };
    const readArgs = { itemIds: [returnedId], type: "footage", limit: 1 };
    const read = await callTool("find_project_items", readArgs);
    const reads = [{ index: 2, tool: "find_project_items", args: readArgs, status: read.isError ? "failed" : "completed", result: firstToolPayload(read) }];
    const context = planCommandContext.getStore();
    if (context && context.item) {
      context.item.independentReadBack = reads.map((r) => ({
        ...r,
        source: "server_typed_readback",
        observedAt: new Date().toISOString()
      }));
      context.persist();
    }
    const mutation = { index: 1, tool: toolName, args, status: "completed", mutatesProject: true, result: payload };
    const semantic = buildServerSemanticVerification(
      { steps: [{ tool: toolName, args }, ...reads.map((r) => ({ tool: r.tool, args: r.args }))] },
      { steps: [mutation, ...reads], ok: true }
    );
    return {
      ok: semantic.status === "passed" && semantic.unverifiedMutationCount === 0,
      scope: "independent_imported_source",
      status: semantic.status,
      checks: semantic.checks,
      readBack: reads.map((r) => ({ tool: r.tool, args: r.args, result: r.result }))
    };
  }
  if(toolName==="create_placeholder_review_comps") {
    const fresh=await requireFreshReviewRecord(payload && payload.owner);
    return {ok:true,scope:"registered_live_link_service_receipt",owner:fresh.record.owner,itemIds:fresh.record.receipt.items.map(item=>item.itemId)};
  }
  if(toolName==="cleanup_test_items" && args && args.owner) return {ok:payload && payload.absenceVerified===true,scope:"exact_registered_ids_absent",owner:args.owner};
  if(toolName==="fit_layer_to_comp") {
    if(args.mode!=="cover")return {ok:false,scope:"fit_geometry",reason:"independent_noncover_verification_not_supported"};
    const rows=payload && payload.changed;
    if(!payload || !payload.comp || !Number.isSafeInteger(payload.comp.itemId) || !Array.isArray(rows) || !rows.length || rows.length>32)return {ok:false,reason:"fit_stable_identity_unavailable"};
    const checks=[];
    for(const row of rows){const id=row.after && row.after.id;
      if(!Number.isSafeInteger(id))return {ok:false,reason:"fit_stable_identity_unavailable"};
      const read=await readPlaceholderGeometry({compItemId:payload.comp.itemId,layerId:id});
      checks.push({target:read.target,...require("./placeholder-framing").verifyPlaceholderCoverage({geometry:read.geometry,transform:read.transform})});
    }
    return {ok:checks.every(check=>check.covered===true && check.eligible===true),scope:"fresh_rectangular_footprint_only",checks,artisticAccepted:false};
  }
  if(toolName===titleVerification.TOOL){
    const verified=titleVerification.verifyResult(payload,args),result=await callToolLogged("verification-readback","get_project_lifecycle_state",{}),read=firstToolPayload(result),context=planCommandContext.getStore();
    if(context?.item){context.item.independentReadBack=[{index:2,tool:"get_project_lifecycle_state",args:{},status:result.isError?"failed":"completed",result:read,source:"server_typed_readback",observedAt:new Date().toISOString()}];context.persist();}
    return {...verified,ok:verified.ok&&!result.isError&&read?.projectPresent===true&&read?.project==="named"&&read?.lifecycleReady===true&&
      read?.supported?.file===true&&read?.supported?.dirty===true&&read?.supported?.revision===true&&Number.isSafeInteger(read?.revision)&&read.revision>=0&&projectLifecycleContract.samePath(read?.file,payload.source.path)&&read?.dirty===false};
  }
  if(toolName===titleExport.TOOL){
    const verified=titleExport.verifyResult(payload,args),result=await callToolLogged("verification-readback","get_project_info",{}),read=firstToolPayload(result),context=planCommandContext.getStore();
    if(context?.item){context.item.independentReadBack=[{index:2,tool:"get_project_info",args:{},status:result.isError?"failed":"completed",result:read,source:"server_typed_readback",observedAt:new Date().toISOString()}];context.persist();}
    return {...verified,ok:verified.ok && !result.isError && projectLifecycleContract.samePath(read?.file,args.expectedProjectFile) && read?.dirty===false};
  }
  if(ameOpenComp.MUTATIONS.includes(toolName)){
    const verified=ameOpenComp.verifyResult(toolName,payload,args),readArgs=payload.selector,result=await callToolLogged("verification-readback",ameOpenComp.RECONCILE,readArgs),read=firstToolPayload(result),context=planCommandContext.getStore();
    if(context?.item){context.item.independentReadBack=[{index:2,tool:ameOpenComp.RECONCILE,args:readArgs,status:result.isError?"failed":"completed",result:read,source:"server_typed_readback",observedAt:new Date().toISOString()}];context.persist();}
    return {...verified,ok:verified.ok&&!result.isError&&read?.privateProofVerified===true&&read?.intentId===payload.intentId&&read?.executionAuthority===false&&read?.mediaVerified===false};
  }
  if(toolName===ameJobSource.TOOL){
    const verified=ameJobSource.verifyResult(payload,args),result=await callToolLogged("verification-readback","get_project_lifecycle_state",{}),read=firstToolPayload(result),context=planCommandContext.getStore();
    if(context?.item){context.item.independentReadBack=[{index:2,tool:"get_project_lifecycle_state",args:{},status:result.isError?"failed":"completed",result:read,source:"server_typed_readback",observedAt:new Date().toISOString()}];context.persist();}
    return {...verified,ok:verified.ok&&!result.isError&&read?.projectPresent===true&&read?.project==="named"&&read?.lifecycleReady===true&&read?.supported?.file===true&&read?.supported?.dirty===true&&read?.supported?.revision===true&&read?.dirty===false&&read?.revision===payload.restored.revision&&projectLifecycleContract.samePath(read.file,args.expectedProjectFile)};
  }
  if(toolName===projectSave.TOOL_NAME){
    projectSave.verifyReceipt(payload && payload.saveReceipt,args);
    return {ok:true,scope:"disk_file_and_project_path_only",inMemoryRevisionProof:"not_observed",reopenVerification:"pending"};
  }
  if (toolName === ameFixtureGrant.TOOL_NAME) {
    const verified = ameFixtureExecutor.verifyResult(payload), readArgs = { evidenceId: payload.evidenceId };
    const result = await callToolLogged("verification-readback", ameFixtureRunner.INSPECT, readArgs), read = firstToolPayload(result);
    const context = planCommandContext.getStore();
    if (context && context.item) {
      context.item.independentReadBack = [{ index: 2, tool: ameFixtureRunner.INSPECT, args: readArgs,
        status: result.isError ? "failed" : "completed", result: read, source: "server_typed_readback", observedAt: new Date().toISOString() }];
      context.persist();
    }
    return { ...verified, ok: verified.ok && !result.isError && read.ok === true,
      independentReadBack: { tool: ameFixtureRunner.INSPECT, args: readArgs, result: read } };
  }
  if (toolName === ameTitleJobs.ENQUEUE) {
    const normalized = ameTitleJobs.validateInput(toolName, args);
    const readArgs = { targetSpecifier: normalized.targetSpecifier, expectedProcess: normalized.expectedProcess,
      timeoutMs: normalized.timeoutMs, batchId: normalized.batchId, jobId: payload && payload.jobId,
      ...(normalized.expectedSessionNonce ? { expectedSessionNonce: normalized.expectedSessionNonce } : {}) };
    const result = await callToolLogged("verification-readback", ameTitleJobs.STATUS, readArgs);
    const read = firstToolPayload(result), first = payload && payload.native && payload.native.job;
    const second = read && read.native && read.native.job, context = planCommandContext.getStore();
    if (context && context.item) {
      context.item.independentReadBack = [{ index: 2, tool: ameTitleJobs.STATUS, args: readArgs,
        status: result.isError ? "failed" : "completed", result: read, source: "server_typed_readback", observedAt: new Date().toISOString() }];
      context.persist();
    }
    const exact = first && second && first.handleKey === payload.jobId && second.handleKey === payload.jobId &&
      first.nativeJobId === null && second.nativeJobId === null && first.nativeAssociationVerified === true && second.nativeAssociationVerified === true &&
      first.sourcePath === second.sourcePath && first.sourceGuid === normalized.sourceGuid && first.sourceGuid === second.sourceGuid &&
      first.outputPath === second.outputPath && first.presetIdentity === second.presetIdentity && first.processBinding === second.processBinding &&
      JSON.stringify(first.range) === JSON.stringify(normalized.range) && JSON.stringify(second.range) === JSON.stringify(normalized.range);
    return { ok: !result.isError && payload.nativeAssociationVerified === true && read.nativeAssociationVerified === true && Boolean(exact),
      scope: "ame_native_wrapper_association_only", independentReadBack: { tool: ameTitleJobs.STATUS, args: readArgs, result: read },
      nativeJobId: null, nativeQueueCompositionVerified: false, mediaProof: "not_inspected" };
  }
  if (ameQueueControl.MUTATIONS.includes(toolName)) {
    const readArgs = ameQueueControl.statusArgs(toolName,args);
    const result = await callToolLogged("verification-readback", ameQueueControl.STATUS, readArgs), read = firstToolPayload(result), context = planCommandContext.getStore();
    if (context?.item) { context.item.independentReadBack = [{ index: 2, tool: ameQueueControl.STATUS, args: readArgs, status: result.isError ? "failed" : "completed", result: read, source: "server_typed_readback", observedAt: new Date().toISOString() }]; context.persist(); }
    return { ok: !result.isError && ameQueueControl.verifyReadBack(args, payload, read, context?.run), scope: toolName===ameQueueControl.PAUSE?"ame_global_queue_pause_observed":"ame_global_queue_start_dispatch_only", nativeQueueCompositionVerified: false, completionVerified: false, mediaVerified: false };
  }
  if (toolName === ameTitleJobs.START) {
    const shared=args.queueMode===ameSharedQueue.MODE;
    if (!shared && args.manualQueueMode !== "cep_user_declaration_v2") return { ok: false, scope: "ame_native_queue_composition", reason: "queue_composition_unavailable", nativeQueueCompositionVerified: false, mediaProof: "not_inspected" };
    const reads = [], context = planCommandContext.getStore(), manifest = shared?payload?.startReservation?.sharedQueueReceipt?.binding:payload?.startReservation?.manualQueueReceipt?.manifest;
    for (const job of manifest?.jobs || []) {
      const readArgs = { targetSpecifier: args.targetSpecifier, expectedProcess: args.expectedProcess, batchId: args.batchId, jobId: job.jobId,
        ...(args.expectedSessionNonce ? { expectedSessionNonce: args.expectedSessionNonce } : {}) };
      const readResult = await callToolLogged("verification-readback", ameTitleJobs.STATUS, readArgs);
      reads.push({ index: 2 + reads.length, tool: ameTitleJobs.STATUS, args: readArgs, status: readResult.isError ? "failed" : "completed", result: firstToolPayload(readResult), source: "server_typed_readback", observedAt: new Date().toISOString() });
    }
    if (context?.item) { context.item.independentReadBack = reads; context.persist(); }
    const record = currentProposalState.current;
    const proofRun = context?.run && record && { ...context.run, m100Action: { previewHash: record.previewHash, confirmedBySession: record.confirmedBySession, confirmedBySurface: record.confirmedBySurface, confirmedAt: record.confirmedAt } };
    const valid = shared?ameSharedQueue.verifyStartEvidence(args,payload,proofRun,reads):ameManualQueue.verifyStartEvidence(args, payload, proofRun, reads);
    return { ok: valid, scope: shared?"ame_two_own_items_global_start":"ame_authenticated_cep_declaration_dispatch_only", nativeQueueCompositionVerified: false, completionVerified: false, mediaVerified: false };
  }
  if(toolName===nativeRenderVariant.RENDER){
    const receipt=payload && payload.renderReceipt;
    nativeRenderVariant.verifyReceipt(receipt,args);
    const readArgs=nativeRenderVariant.inspectionArgs(args,receipt.attemptId);
    const result=await callToolLogged("verification-readback",nativeRenderVariant.INSPECT,readArgs);
    const read=firstToolPayload(result);
    const context=planCommandContext.getStore();
    if(context && context.item){context.item.independentReadBack=[{index:2,tool:nativeRenderVariant.INSPECT,args:readArgs,status:result.isError ? "failed" : "completed",result:read,source:"server_typed_readback",observedAt:new Date().toISOString()}];context.persist();}
    return {ok:!result.isError && nativeRenderVariant.verifyInspection(receipt,read,args),scope:"native_done_and_restored_state_only",independentReadBack:{tool:nativeRenderVariant.INSPECT,args:readArgs,result:read},mediaProof:"not_inspected",alphaDxvProof:"not_verified",visualProof:"not_reviewed"};
  }
  if (toolName === ameRunning.TOOL_NAME) {
    const readArgs = ameRunning.inspectionArgs(payload), before = await ameRunning.inspectProcesses();
    const result = await callToolLogged("verification-readback", ameTransport.TOOL_NAME, readArgs), read = firstToolPayload(result);
    const after = await ameRunning.inspectProcesses(), context = planCommandContext.getStore();
    if (context && context.item) {
      context.item.independentReadBack = [{ index: 2, tool: ameTransport.TOOL_NAME, args: readArgs, status: result.isError ? "failed" : "completed", result: read, source: "server_typed_readback", observedAt: new Date().toISOString() }];
      context.persist();
    }
    return { ok: !result.isError && ameRunning.verifyReadBack(payload, read, before, after), scope: "ame_process_and_read_transport_only", before, after,
      independentReadBack: { tool: ameTransport.TOOL_NAME, args: readArgs, result: read }, adapterReady: false, nativeQueueOwnershipVerified: false, projectContentMutation: false };
  }
  if (toolName === "export_path_points" || toolName === "export_text_to_file" || toolName === "save_comp_frame_png") {
    const file = payload && typeof payload === "object" && !Array.isArray(payload) ? payload.file || {} : {};
    const hashOk = typeof file.sha256 === "string" && /^[a-f0-9]{64}$/i.test(file.sha256);
    const byteLength = Number(file.byteLength || 0);
    const restoration = payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload.resolutionFactor || {}
      : {};
    const restored = toolName === "save_comp_frame_png"
      ? restoration.restored === true
      : true;
    const pngComplete = toolName === "save_comp_frame_png"
      ? file.pngComplete === true
      : true;
    return {
      ok: hashOk && byteLength > 0 && restored && pngComplete,
      checkedAt: new Date().toISOString(),
      target: {
        tool: toolName,
        outputFileName: file.outputFileName || args && args.outputFileName || null,
        outputPath: file.outputPath || null
      },
      file: {
        byteLength,
        sha256: file.sha256 || null,
        pngComplete: toolName === "save_comp_frame_png" ? file.pngComplete === true : undefined,
        width: toolName === "save_comp_frame_png" ? file.width : undefined,
        height: toolName === "save_comp_frame_png" ? file.height : undefined,
        existsAfter: file.existsAfter === true,
        deletedAfterReadBack: file.deletedAfterReadBack === true
      },
      resolutionFactor: toolName === "save_comp_frame_png" ? restoration : null,
      warnings: hashOk && byteLength > 0 && restored && pngComplete ? [] : ["Generated export file read-back did not include a valid sha256/byteLength, pngComplete proof, or resolutionFactor restoration evidence."]
    };
  }

  const target = inferVerificationTarget(toolName, args || {}, payload);
  const response = await runExtendScriptBody(`
      var target = ${aeLiteral(target)};

      function __codexValue(prop) {
        try {
          if (!prop) return null;
          var value = prop.value;
          if (value instanceof Array) {
            var copy = [];
            for (var i = 0; i < value.length; i++) copy.push(value[i]);
            return copy;
          }
          return value;
        } catch (__valueError) {
          return null;
        }
      }

      function __codexLayerMarkerCount(layer) {
        try {
          var markerProp = layer.property("ADBE Marker");
          return markerProp ? markerProp.numKeys : 0;
        } catch (__markerCountError) {
          return 0;
        }
      }

      function __codexTextJustificationName(value) {
        try { if (value === ParagraphJustification.LEFT_JUSTIFY) return "left"; } catch (__leftJustificationNameError) {}
        try { if (value === ParagraphJustification.CENTER_JUSTIFY) return "center"; } catch (__centerJustificationNameError) {}
        try { if (value === ParagraphJustification.RIGHT_JUSTIFY) return "right"; } catch (__rightJustificationNameError) {}
        try { return String(value); } catch (__justificationStringError) {}
        return null;
      }

      function __codexLayerShapeChildProperty(group, matchName, fallbackName) {
        if (!group) return null;
        try {
          var direct = group.property(matchName);
          if (direct) return direct;
        } catch (__shapeDirectPropertyError) {}
        if (fallbackName) {
          try {
            var fallback = group.property(fallbackName);
            if (fallback) return fallback;
          } catch (__shapeFallbackPropertyError) {}
        }
        try {
          for (var __sp = 1; __sp <= group.numProperties; __sp++) {
            var child = group.property(__sp);
            if (child && (child.matchName === matchName || child.name === fallbackName)) return child;
          }
        } catch (__shapeChildPropertyError) {}
        return null;
      }

      function __codexLayerShapeValue(group, matchName, fallbackName) {
        var prop = __codexLayerShapeChildProperty(group, matchName, fallbackName);
        if (!prop) return null;
        try { return prop.value; } catch (__shapeValueError) {}
        return null;
      }

      function __codexLayerPolystarTypeName(value) {
        try { if (value === PolystarPathType.POLYGON) return "polygon"; } catch (__polygonTypeNameError) {}
        try { if (value === PolystarPathType.STAR) return "star"; } catch (__starTypeNameError) {}
        if (Number(value) === 2) return "polygon";
        if (Number(value) === 1) return "star";
        try { return String(value); } catch (__polystarTypeStringError) {}
        return null;
      }

      function __codexLayerShapeContentsInfo(layer) {
        var shapes = [];
        try {
          var root = layer.property("ADBE Root Vectors Group");
          if (!root) return shapes;
          for (var __g = 1; __g <= root.numProperties; __g++) {
            var group = root.property(__g);
            if (!group || group.matchName !== "ADBE Vector Group") continue;
            var contents = __codexLayerShapeChildProperty(group, "ADBE Vectors Group", "Contents");
            if (!contents) continue;
            for (var __c = 1; __c <= contents.numProperties; __c++) {
              var shapeProp = contents.property(__c);
              if (!shapeProp) continue;
              var shapeInfo = {
                groupName: group.name || "",
                name: shapeProp.name || "",
                matchName: shapeProp.matchName || ""
              };
              if (shapeProp.matchName === "ADBE Vector Shape - Rect") {
                shapeInfo.type = "rectangle";
                shapeInfo.size = __codexLayerShapeValue(shapeProp, "ADBE Vector Rect Size", "Size");
              } else if (shapeProp.matchName === "ADBE Vector Shape - Ellipse") {
                shapeInfo.type = "ellipse";
                shapeInfo.size = __codexLayerShapeValue(shapeProp, "ADBE Vector Ellipse Size", "Size");
              } else if (shapeProp.matchName === "ADBE Vector Shape - Star") {
                shapeInfo.starType = __codexLayerPolystarTypeName(__codexLayerShapeValue(shapeProp, "ADBE Vector Star Type", "Type"));
                shapeInfo.type = shapeInfo.starType || "star";
                shapeInfo.points = __codexLayerShapeValue(shapeProp, "ADBE Vector Star Points", "Points");
                shapeInfo.outerRadius = __codexLayerShapeValue(shapeProp, "ADBE Vector Star Outer Radius", "Outer Radius");
                shapeInfo.innerRadius = __codexLayerShapeValue(shapeProp, "ADBE Vector Star Inner Radius", "Inner Radius");
              } else {
                continue;
              }
              shapes.push(shapeInfo);
            }
          }
        } catch (__shapeContentsInfoError) {}
        return shapes;
      }

      function __codexLayerInfo(layer) {
        if (!layer) return null;
        var transform = layer.property("ADBE Transform Group");
        var textGroup = null;
        var sourceText = null;
        var isTextLayer = false;
        var isShapeLayer = false;
        try { textGroup = layer.property("ADBE Text Properties"); } catch (__textGroupError) {}
        if (textGroup) {
          try { sourceText = textGroup.property("ADBE Text Document").value; } catch (__sourceTextError) {}
        }
        try { isTextLayer = layer instanceof TextLayer; } catch (__textLayerClassError) {}
        if (!isTextLayer && textGroup) isTextLayer = true;
        try { isShapeLayer = layer instanceof ShapeLayer; } catch (__shapeLayerClassError) {}
        if (!isShapeLayer) {
          try { isShapeLayer = layer.matchName === "ADBE Vector Layer" || !!layer.property("ADBE Root Vectors Group"); } catch (__shapeLayerFallbackError) {}
        }
        return {
          index: layer.index,
          id: layer.id || null,
          name: layer.name || "",
          matchName: layer.matchName || null,
          textLayer: isTextLayer,
          shapeLayer: isShapeLayer,
          layerKind: isTextLayer ? "text" : (isShapeLayer ? "shape" : null),
          enabled: !!layer.enabled,
          locked: !!layer.locked,
          startTime: layer.startTime,
          inPoint: layer.inPoint,
          outPoint: layer.outPoint,
          markerCount: __codexLayerMarkerCount(layer),
          transform: transform ? {
            position: __codexValue(transform.property("ADBE Position")),
            pointOfInterest: __codexValue(transform.property("ADBE Point of Interest")),
            scale: __codexValue(transform.property("ADBE Scale")),
            orientation: __codexValue(transform.property("ADBE Orientation")),
            anchorPoint: __codexValue(transform.property("ADBE Anchor Point")),
            opacity: __codexValue(transform.property("ADBE Opacity")),
            rotation: __codexValue(transform.property("ADBE Rotate Z"))
          } : null,
          text: sourceText ? {
            text: sourceText.text || "",
            font: sourceText.font || null,
            fontSize: sourceText.fontSize || null,
            justification: __codexTextJustificationName(sourceText.justification)
          } : null,
          shapeContents: isShapeLayer ? __codexLayerShapeContentsInfo(layer) : []
        };
      }

      function __codexCompInfo(comp) {
        if (!comp) return null;
        var projectIndex = null;
        for (var ci = 1; ci <= app.project.numItems; ci++) { if (app.project.item(ci) === comp) { projectIndex = ci; break; } }
        return {
          itemIndex: projectIndex,
          id: comp.id || null,
          name: comp.name || "",
          typeName: comp.typeName || null,
          width: comp.width,
          height: comp.height,
          pixelAspect: comp.pixelAspect,
          bgColor: comp.bgColor,
          duration: comp.duration,
          frameRate: comp.frameRate,
          numLayers: comp.numLayers
        };
      }

      function __codexResolveComp() {
        var item = null;
        if (target.requireExactComp) {
          var exact = null, count = 0;
          for (var ei = 1; ei <= app.project.numItems; ei++) {
            item = app.project.item(ei);
            if (item instanceof CompItem && item.name === target.compName) { exact = item; count++; }
          }
          if (count !== 1) throw new Error("verification_target_identity_mismatch:" + target.compName);
          return exact;
        }
        if (target.compItemIndex) {
          try { item = app.project.item(target.compItemIndex); } catch (__indexError) {}
          if (item instanceof CompItem) return item;
        }
        if (target.compName) {
          for (var i = 1; i <= app.project.numItems; i++) {
            item = app.project.item(i);
            if (item instanceof CompItem && item.name === target.compName) return item;
          }
        }
        if (target.itemIndex) {
          try { item = app.project.item(target.itemIndex); } catch (__itemIndexError) {}
          if (item instanceof CompItem) return item;
        }
        if (app.project.activeItem instanceof CompItem) return app.project.activeItem;
        return null;
      }

      var activeItem = app.project.activeItem;
      var project = {
        numItems: app.project.numItems,
        file: app.project.file ? app.project.file.fsName : null,
        activeItem: activeItem ? {
          itemIndex: activeItem.itemIndex || null,
          name: activeItem.name || "",
          typeName: activeItem.typeName || null
        } : null
      };

      var comp = __codexResolveComp();
      var targetLayer = null;
      var sameNameLayers = [];
      if (comp) {
        if (target.layerIndex) {
          try { targetLayer = comp.layer(target.layerIndex); } catch (__layerIndexError) {}
        }
        for (var layerIndex = 1; layerIndex <= comp.numLayers; layerIndex++) {
          var layer = comp.layer(layerIndex);
          if (!targetLayer && target.layerName && layer.name === target.layerName) targetLayer = layer;
          if (target.layerName && layer.name === target.layerName) sameNameLayers.push(__codexLayerInfo(layer));
        }
      }

      return {
        checkedAt: (new Date()).toUTCString(),
        project: project,
        target: target,
        comp: __codexCompInfo(comp),
        layer: __codexLayerInfo(targetLayer),
        sameNameLayerCount: sameNameLayers.length,
        sameNameLayers: sameNameLayers.slice(0, 25)
      };
  `, 8000);

  const verification = response.result || {};
  verification.ok = true;
  verification.warnings = [];
  if (verification.target && verification.target.layerName && !verification.layer) {
    verification.warnings.push(`Layer ${verification.target.layerName} was not found after ${toolName}.`);
  }
  if (verification.sameNameLayerCount > 1) {
    verification.warnings.push(`Found ${verification.sameNameLayerCount} layers named ${verification.target.layerName}.`);
  }
  return verification;
}

async function attachMutationVerificationToToolResult(result, toolName, args) {
  if (!MUTATING_TOOL_NAMES.has(toolName) || !result || result.isError) return result;
  const pendingContext=planCommandContext.getStore(),pendingPayload=firstToolPayload(result);
  if(amePending.isPendingStep({...pendingContext?.item,result:pendingPayload},pendingContext?.run))return attachPayloadMetadataToToolResult(result,"verification",{ok:false,status:"needs_review",pending:true,scope:"ame_async_dispatch_only",nativeAssociationVerified:false,ownItemAccepted:false});
  if (optionalBoolean(args || {}, "verifyAfter", true) === false) return result;
  try {
    const payload = firstToolPayload(result);
    const verification = await verifyMutationResult(toolName, args || {}, payload);
    return attachPayloadMetadataToToolResult(result, "verification", verification);
  } catch (error) {
    return attachPayloadMetadataToToolResult(result, "verification", {
      ok: false,
      error: error.message || String(error),
      errorCode:error.code || "verification_incomplete",
      commandId:error.commandId || null,
      lifecycleState:error.lifecycleState || null,
      timedOutFrom:error.timedOutFrom || null,
      line: error.line || null
    });
  }
}

function isPathInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveScriptFile(filePath) {
  const requestedPath = optionalString({ filePath }, "filePath", "");
  if (!requestedPath) {
    throw new Error("filePath is required.");
  }

  const resolvedPath = path.resolve(PROJECT_ROOT, requestedPath);
  if (!ALLOW_SCRIPT_FILES_OUTSIDE_PROJECT && !isPathInside(PROJECT_ROOT, resolvedPath)) {
    throw new Error("filePath must resolve inside the bridge project. Set AE_ALLOW_SCRIPT_FILES_OUTSIDE_PROJECT=1 to allow external files.");
  }

  const ext = path.extname(resolvedPath).toLowerCase();
  if (![".jsx", ".jsxinc", ".js", ".txt"].includes(ext)) {
    throw new Error("filePath must point to a .jsx, .jsxinc, .js, or .txt script file.");
  }
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Script file does not exist: ${resolvedPath}`);
  }
  const stat = fs.statSync(resolvedPath);
  if (!stat.isFile()) {
    throw new Error(`Script path is not a file: ${resolvedPath}`);
  }
  if (stat.size > 2 * 1024 * 1024) {
    throw new Error("Script file is too large. Keep files under 2MB for MCP execution.");
  }

  return { resolvedPath, stat };
}

function resolveExistingFile(filePath) {
  const requestedPath = optionalString({ filePath }, "filePath", "");
  if (!requestedPath) {
    throw new Error("filePath is required.");
  }

  const resolvedPath = path.resolve(PROJECT_ROOT, requestedPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File does not exist: ${resolvedPath}`);
  }
  const stat = fs.statSync(resolvedPath);
  if (!stat.isFile()) {
    throw new Error(`Path is not a file: ${resolvedPath}`);
  }
  return { resolvedPath, stat };
}

function resolveOutputFilePath(filePath) {
  return generatedSafety.resolveGeneratedRenderOutputPath({
    projectRoot: PROJECT_ROOT,
    generatedRenderOutputDir: GENERATED_RENDER_OUTPUT_DIR,
    requestedPath: optionalString({ filePath }, "filePath", "")
  }).resolvedPath;
}

function resolveGeneratedExportFile(outputFileName) {
  return generatedSafety.resolveGeneratedFile({
    root: GENERATED_EXPORT_DIR,
    requestedName: optionalString({ outputFileName }, "outputFileName", "points.txt"),
    defaultFilename: "points.txt",
    allowedExtensions: [".txt"],
    label: "outputFileName"
  });
}

function resolveGeneratedPngExportFile(outputFileName) {
  return generatedSafety.resolveGeneratedFile({
    root: GENERATED_EXPORT_DIR,
    requestedName: optionalString({ outputFileName }, "outputFileName", "frame.png"),
    defaultFilename: "frame.png",
    allowedExtensions: [".png"],
    label: "outputFileName"
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForNonEmptyFile(filePath, options = {}) {
  const timeoutMs = Math.max(100, Math.min(10000, Number(options.timeoutMs || 3000)));
  const intervalMs = Math.max(25, Math.min(1000, Number(options.intervalMs || 75)));
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      if (stat.isFile() && stat.size > 0) return stat;
    }
    await delay(intervalMs);
  }
  return null;
}

function optionalResolutionFactor(args, name) {
  const values = optionalNumberArray(args || {}, name, null, 2, 2);
  if (!values) return null;
  return values.map((value) => {
    const normalized = Math.floor(value);
    if (!Number.isInteger(normalized) || normalized < 1 || normalized > 99) {
      throw new Error(`${name} values must be integers from 1 through 99.`);
    }
    return normalized;
  });
}

function pathPointsGeometryFromArgs(args) {
  if (hasArg(args || {}, "vertices")) return requiredPointArray(args, "vertices", 1, 80);
  if (hasArg(args || {}, "geometry")) return optionalPathGeometry(args, "geometry", null).vertices;
  throw new Error("vertices or geometry is required.");
}

function roundedCoordinate(value, decimalPlaces) {
  return Number(Number(value).toFixed(decimalPlaces));
}

function buildPathPointsExport(vertices, options) {
  const decimalPlaces = Math.max(0, Math.min(4, Math.floor(Number(options.decimalPlaces))));
  const points = vertices.map((point) => [
    roundedCoordinate(point[0], decimalPlaces),
    roundedCoordinate(point[1], decimalPlaces)
  ]);
  if (options.rotateFirstPointToEnd && points.length > 1) {
    points.push(points.shift());
  }
  const variableName = optionalString(options, "variableName", "points") || "points";
  if (!/^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/.test(variableName)) {
    throw new Error("variableName must be a valid JavaScript identifier up to 64 characters.");
  }
  return {
    variableName,
    points,
    content: `var ${variableName} = ${JSON.stringify(points)};`
  };
}

function exportPathPointsFile(args) {
  const vertices = pathPointsGeometryFromArgs(args || {});
  const coordinateLimit = 1000000;
  if (vertices.some((point) => Math.abs(point[0]) > coordinateLimit || Math.abs(point[1]) > coordinateLimit)) {
    throw new Error("vertices values must be between -1000000 and 1000000.");
  }

  const decimalPlaces = Math.max(0, Math.min(4, Math.floor(optionalNumber(args || {}, "decimalPlaces", 2))));
  const rotateFirstPointToEnd = optionalBoolean(args || {}, "rotateFirstPointToEnd", true);
  const deleteAfterReadBack = optionalBoolean(args || {}, "deleteAfterReadBack", false);
  const { outputFileName, resolvedPath } = resolveGeneratedExportFile(optionalString(args || {}, "outputFileName", "points.txt"));
  const exportData = buildPathPointsExport(vertices, {
    decimalPlaces,
    rotateFirstPointToEnd,
    variableName: optionalString(args || {}, "variableName", "points")
  });

  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, exportData.content, "utf8");
  const readBack = fs.readFileSync(resolvedPath, "utf8");
  const sha256 = crypto.createHash("sha256").update(readBack).digest("hex");
  let existsAfter = true;
  if (deleteAfterReadBack) {
    fs.unlinkSync(resolvedPath);
    existsAfter = fs.existsSync(resolvedPath);
  }

  return {
    outputFileName,
    outputPath: resolvedPath,
    generatedExportDir: GENERATED_EXPORT_DIR,
    decimalPlaces,
    rotateFirstPointToEnd,
    variableName: exportData.variableName,
    sourceVertexCount: vertices.length,
    pointCount: exportData.points.length,
    points: exportData.points,
    contentPreview: readBack.slice(0, 500),
    file: {
      outputFileName,
      outputPath: resolvedPath,
      byteLength: Buffer.byteLength(readBack, "utf8"),
      sha256,
      existsAfter,
      deletedAfterReadBack: deleteAfterReadBack
    }
  };
}

function stringValueOrNull(value) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return null;
  return null;
}

function sourceTextFromLayerEvidence(rawLayer) {
  const raw = rawLayer && typeof rawLayer === "object" && !Array.isArray(rawLayer) ? rawLayer : {};
  const layer = raw.layer && typeof raw.layer === "object" && !Array.isArray(raw.layer) ? raw.layer : raw;
  const textPayload = raw.text && typeof raw.text === "object" && !Array.isArray(raw.text)
    ? raw.text
    : layer.text && typeof layer.text === "object" && !Array.isArray(layer.text)
      ? layer.text
      : null;

  return stringValueOrNull(raw.sourceText) ||
    stringValueOrNull(layer.sourceText) ||
    stringValueOrNull(raw.text) ||
    stringValueOrNull(layer.text) ||
    stringValueOrNull(textPayload && textPayload.text);
}

function textExportLayerFromEvidence(rawLayer, ordinal) {
  const raw = rawLayer && typeof rawLayer === "object" && !Array.isArray(rawLayer) ? rawLayer : {};
  const layer = raw.layer && typeof raw.layer === "object" && !Array.isArray(raw.layer) ? raw.layer : raw;
  const textPayload = raw.text && typeof raw.text === "object" && !Array.isArray(raw.text)
    ? raw.text
    : layer.text && typeof layer.text === "object" && !Array.isArray(layer.text)
      ? layer.text
      : null;
  const sourceText = sourceTextFromLayerEvidence(raw);
  const textLayer = raw.textLayer === true ||
    layer.textLayer === true ||
    raw.layerKind === "text" ||
    layer.layerKind === "text" ||
    raw.type === "text" ||
    layer.type === "text" ||
    Boolean(textPayload && textPayload.kind === "TextDocument") ||
    sourceText !== null;

  if (textLayer && sourceText === null) {
    throw new Error(`layers[${ordinal - 1}] is a text layer but does not include Source Text evidence.`);
  }
  if (sourceText !== null && Buffer.byteLength(sourceText, "utf8") > 100000) {
    throw new Error(`layers[${ordinal - 1}] Source Text exceeds the 100000 byte export limit.`);
  }

  return {
    ordinal,
    layerIndex: Number(layer.index || raw.index || ordinal) || ordinal,
    layerName: String(layer.name || raw.name || ""),
    textLayer,
    sourceText: textLayer ? sourceText : null,
    outputText: textLayer ? sourceText : "[Not a text layer]"
  };
}

function buildSelectedTextExportContent(entries) {
  return entries.map((entry, index) => `${index + 1}:\n${entry.outputText}\n\n`).join("");
}

function exportTextToFile(args) {
  const sourceLayers = Array.isArray(args && args.layers)
    ? args.layers
    : Array.isArray(args && args.layerEvidence)
      ? args.layerEvidence
      : [];
  if (!sourceLayers.length) {
    throw new Error("layers evidence is required and must include at least one selected layer.");
  }
  if (sourceLayers.length > 100) {
    throw new Error("layers evidence is limited to 100 selected layers.");
  }

  const expectedLayerCount = optionalPositiveInteger(args || {}, "expectedLayerCount");
  if (expectedLayerCount !== null && expectedLayerCount !== sourceLayers.length) {
    throw new Error(`expectedLayerCount ${expectedLayerCount} did not match layers evidence count ${sourceLayers.length}.`);
  }

  const deleteAfterReadBack = optionalBoolean(args || {}, "deleteAfterReadBack", false);
  const allowOverwrite = optionalBoolean(args || {}, "allowOverwrite", false);
  const { outputFileName, resolvedPath } = resolveGeneratedExportFile(optionalString(args || {}, "outputFileName", "export.txt"));
  const entries = sourceLayers.map((layer, index) => textExportLayerFromEvidence(layer, index + 1));
  const content = buildSelectedTextExportContent(entries);
  if (Buffer.byteLength(content, "utf8") > 1000000) {
    throw new Error("Generated text export exceeds the 1000000 byte export limit.");
  }

  if (fs.existsSync(resolvedPath)) {
    if (!allowOverwrite) {
      throw new Error("Generated text output already exists. Use a unique outputFileName or allowOverwrite:true.");
    }
    fs.unlinkSync(resolvedPath);
  }
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, content, "utf8");
  const readBack = fs.readFileSync(resolvedPath, "utf8");
  const sha256 = crypto.createHash("sha256").update(readBack).digest("hex");
  let existsAfter = true;
  if (deleteAfterReadBack) {
    fs.unlinkSync(resolvedPath);
    existsAfter = fs.existsSync(resolvedPath);
  }

  return {
    outputFileName,
    outputPath: resolvedPath,
    generatedExportDir: GENERATED_EXPORT_DIR,
    layerCount: entries.length,
    textLayerCount: entries.filter((entry) => entry.textLayer).length,
    nonTextLayerCount: entries.filter((entry) => !entry.textLayer).length,
    lines: entries.map((entry) => ({
      ordinal: entry.ordinal,
      layerIndex: entry.layerIndex,
      layerName: entry.layerName,
      textLayer: entry.textLayer,
      textLength: entry.outputText.length
    })),
    contentPreview: readBack.slice(0, 1000),
    exportedText: readBack,
    file: {
      outputFileName,
      outputPath: resolvedPath,
      byteLength: Buffer.byteLength(readBack, "utf8"),
      sha256,
      existsAfter,
      deletedAfterReadBack: deleteAfterReadBack,
      mimeType: "text/plain"
    }
  };
}

function normalizePropertyPathArg(args, name) {
  const value = args ? args[name] : null;
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim().startsWith("[")) {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error(`${name} must decode to an array.`);
    return parsed;
  }
  if (typeof value === "string" && value.trim()) {
    return value.split(".").map((part) => part.trim()).filter(Boolean);
  }
  throw new Error(`${name} must be an array, a property-name string, or a JSON-encoded array string.`);
}

function requiredKeyframeArray(args, name) {
  const value = args ? args[name] : null;
  const items = Array.isArray(value)
    ? value
    : typeof value === "string" && value.trim().startsWith("[")
      ? JSON.parse(value)
      : null;
  if (!Array.isArray(items) || !items.length) throw new Error(`${name} must be a non-empty array.`);
  return items.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${name}[${index}] must be an object.`);
    }
    const time = Number(item.time);
    if (!Number.isFinite(time)) throw new Error(`${name}[${index}].time must be a finite number.`);
    if (!hasArg(item, "value")) throw new Error(`${name}[${index}].value is required.`);
    return {
      time,
      value: item.value
    };
  });
}

function getScriptLineContext(script, line, radius) {
  const lineNumber = Math.floor(Number(line));
  if (!Number.isFinite(lineNumber) || lineNumber < 1) return [];

  const lines = String(script || "").split(/\r\n|\r|\n/);
  const start = Math.max(1, lineNumber - (radius || 3));
  const end = Math.min(lines.length, lineNumber + (radius || 3));
  const context = [];

  for (let current = start; current <= end; current += 1) {
    context.push({
      line: current,
      text: lines[current - 1],
      errorLine: current === lineNumber
    });
  }

  return context;
}

function writeJson(res, status, payload) {
  if (res.destroyed || res.writableEnded || res.headersSent) return;
  const text = JSON.stringify(res.authRole === "panel" ? payload : sanitizeAutomationResponse(payload));
  let causalStamp=null;
  if(res.authRole==="panel" && !initialRuntime && deploymentMode==="product" && process.env.AE_OWNED_RUNTIME_GENERATION){try{causalStamp=require("./panel-lifecycle-causal").tupleStamp({generation:process.env.AE_OWNED_RUNTIME_GENERATION,bootNonce:process.env.AE_OWNED_RUNTIME_BOOT_NONCE,pid:process.pid,startedAt:new Date(STARTED_AT).toISOString(),loadedSourceSha256:RUNTIME_IDENTITY.sourceSha256});}catch(_){/* Missing managed tuple revokes, never grants trust. */}}
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...(res.allowedOrigin ? {"Access-Control-Allow-Origin": res.allowedOrigin, "Vary": "Origin"} : {}),
    "Access-Control-Allow-Headers": "content-type, x-ae-bridge-token",
    "Access-Control-Expose-Headers": "x-ae-panel-causal-runtime",
    ...(causalStamp ? {"x-ae-panel-causal-runtime":causalStamp} : {}),
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
  });
  res.end(text);
}

async function readJsonBody(req) {
  return req.parsedJsonBody || readJsonObject(req, HTTP_BODY_LIMIT);
}

function requireToken(req, res, url) {
  const role = httpBoundary.role(req);
  const route = url.pathname.replace(/^\/dev\/agents\//, "/agents/");
  const panelOnly = route.startsWith("/bridge/") || route === "/agents/plan/adopt" || route === "/agents/plan/run" || route === ameManualQueue.ROUTE
    || route === "/agents/key" || route === "/agents/setup"
    || route === "/agents/hardcore/run" || route === "/usage/refresh" || (route === "/autonomy/session" && req.method === "POST");
  if (url.searchParams.has("token") || !role || (panelOnly && role !== "panel") || (role === "admin" && !route.startsWith("/dev/tool/"))) {
    writeJson(res, 401, { ok: false, error: "Bad bridge token" });
    return false;
  }
  return true;
}

function countQueuedCommands(now) {
  expireQueuedCommands(now || Date.now(), "status");
  return pendingCommands.reduce((count, id) => {
    const command = inflightCommands.get(id);
    return command && command.state === "queued" ? count + 1 : count;
  }, 0);
}

function isoOrNull(value) {
  return value ? new Date(value).toISOString() : null;
}

function compactAeCommand(command, now) {
  const at = now || Date.now();
  return {
    id: command.id,
    executionId: command.executionId,
    leaseId: command.leaseId,
    state: command.state,
    lifecycleState: command.state,
    ageMs: at - command.createdAt,
    timeoutMs: command.timeoutMs,
    createdAt: isoOrNull(command.createdAt),
    expiresAt: isoOrNull(command.expiresAt),
    leasedAt: isoOrNull(command.leasedAt),
    submittedAt: isoOrNull(command.submittedAt),
    completedAt: isoOrNull(command.completedAt),
    leaseOwner: command.leaseOwner || null,
    timedOutFrom: command.timedOutFrom || null,
    errorCode: command.errorCode || null,
    ...(command.lifecycleReadbackRole ? {lifecycleReadbackRole:command.lifecycleReadbackRole} : {}),
    phase: command.phase || null
  };
}

function commandForPanel(command) {
  return {
    id: command.id,
    executionId: command.executionId,
    leaseId: command.leaseId,
    contractVersion: commandReceipt.CONTRACT_VERSION,
    script: command.script,
    lifecycleState: command.state,
    leaseOwner: command.leaseOwner || null,
    ...(command.generatedRecoveryRead ? {generatedRecoveryRead:command.generatedRecoveryRead} : {})
  };
}

function removePendingCommand(id) {
  const index = pendingCommands.indexOf(id);
  if (index >= 0) pendingCommands.splice(index, 1);
}

function createCommandLifecycleError(command, code, message) {
  const error = new Error(message);
  error.code = code;
  error.commandId = command.id;
  error.lifecycleState = command.state;
  error.timedOutFrom = command.timedOutFrom || null;
  return error;
}

function createAeCommandError(command, code, phase, message, details) {
  const error = new Error(message);
  error.code = code;
  error.phase = phase;
  error.commandId = command ? command.id : null;
  error.lifecycleState = command ? command.state : null;
  if (details && details.line !== undefined && details.line !== null) error.line = details.line;
  if (details && Object.prototype.hasOwnProperty.call(details, "rawPreview")) {
    error.rawPreview = details.rawPreview;
  }
  return error;
}

function settleCommandFailure(command, code, message) {
  if (command.settled) return;
  command.settled = true;
  command.errorCode = code;
  command.reject(createCommandLifecycleError(command, code, message));
}

function capturePlanCommand(command, payload, required = false) {
  const context = command.planContext;
  if (!context || !context.item) return;
  const item = context.item;
  item.commands = item.commands || [];
  let row = item.commands.find(value => value.id === command.id);
  if (!row) { row = {id:command.id,role:context.role || "readback",history:[]}; item.commands.push(row); }
  Object.assign(row, compactAeCommand(command));
  row.neverSubmitted = command.state === "expired_before_delivery" && !command.submittedAt;
  if (payload) { row.ok = Boolean(payload.ok); row.result = payload.result === undefined ? null : payload.result; row.error = payload.error || null; }
  if (row.history[row.history.length - 1] !== command.state) row.history.push(command.state);
  try { context.persist(); }
  catch (error) { item.recordWarning="run_record_update_failed"; if(required) throw error; }
}

function withPlanCommandRole(role, fn) {
  const context = planCommandContext.getStore();
  return context ? planCommandContext.run({...context,role},fn) : fn();
}

function retainCommandResult(id, payload, command) {
  capturePlanCommand(command, payload);
  const retained={
    id,
    receiptDigest: command.receiptDigest || null,
    ok: Boolean(payload.ok),
    result: payload.result,
    error: payload.error || null,
    code: payload.code || command.errorCode || null,
    phase: payload.phase || command.phase || null,
    rawPreview: Object.prototype.hasOwnProperty.call(payload, "rawPreview") ? payload.rawPreview : null,
    line: payload.line || null,
    lifecycleState: payload.lifecycleState || command.state || null,
    timedOutFrom: command.timedOutFrom || null,
    createdAt: command.createdAt,
    completedAt: Date.now(),
    command: compactAeCommand(command),
    ...(command.bootstrapBinding ? {tool:"get_project_info",origin:command.bootstrapBinding.pins.origin} : {})
  };
  // Persist accepted terminal evidence before resolving/rejecting the caller.
  // A crash after native ACK must not erase the only reconciliation witness.
  try{panelBootstrapService.observeTerminal(command.bootstrapBinding,retained);}
  catch(error){retained.witnessStorageError=error.code||"bootstrap_terminal_witness_unavailable";recordEvent("bootstrap_terminal_witness_unavailable",{id,code:retained.witnessStorageError});}
  completedResults.set(id, retained);

  while (completedResults.size > 200) {
    const oldestId = completedResults.keys().next().value;
    completedResults.delete(oldestId);
  }
}

function retainStaleCommandResult(id, payload, retained) {
  const staleResult = {
    id,
    ok: Boolean(payload.ok),
    result: payload.result,
    error: payload.error || null,
    lifecycleState: "stale_result_ignored",
    ignoredAt: Date.now()
  };
  const nextRetained = Object.assign({}, retained, {
    staleResult
  });
  completedResults.set(id, nextRetained);
  return staleResult;
}

function removeWaitingPanel(waiter) {
  const index = waitingPanels.indexOf(waiter);
  if (index >= 0) waitingPanels.splice(index, 1);
  clearTimeout(waiter.timer);
}

function drainWaitingPanels() {
  if(initialRuntime)initialRuntime.assertDispatch();
  expireQueuedCommands(Date.now(), "drain_waiting_panels");
  while (waitingPanels.length && pendingCommands.length) {
    const waiter = waitingPanels.shift();
    clearTimeout(waiter.timer);

    if (waiter.done || waiter.res.destroyed || waiter.res.writableEnded) {
      continue;
    }

    let command;
    try{command=leaseNextQueuedCommand(waiter.req, waiter.url);}catch(error){waiter.done=true;writeJson(waiter.res,409,{ok:false,code:error.code || error.message,command:null});continue;}
    if (!command) {
      waiter.done = true;
      writeJson(waiter.res, 200, { ok: true, command: null });
      continue;
    }
    waiter.done = true;
    writeJson(waiter.res, 200, { ok: true, command });
  }
}

function enqueueAeCommand(script, timeoutMs) {
  try{assertCoreMigrationOperation(coreMigrationOperationContext.getStore(),{nativeEffect:true});}catch(error){return Promise.reject(error);}
  try{ameOpenCompExecutor.assertNative(ameOpenCompCommandContext.getStore(),script);}catch(error){return Promise.reject(error);}
  try{ameJobSourceExecutor.assertNative(ameJobSourceCommandContext.getStore(),script);}catch(error){return Promise.reject(error);}
  try{titleVerificationExecutor.assertNative(titleVerificationCommandContext.getStore(),script);}catch(error){return Promise.reject(error);}
  try{titleExportRecovery.assertNative(titleRecoveryCommandContext.getStore(),script);}catch(error){return Promise.reject(error);}
  try{ownedRuntimeService.assertCommandTicket();}catch(error){return Promise.reject(error);}
  if (panelBootstrapService.isBusy() && !panelBootstrapReadContext.getStore()) {
    return Promise.reject(Object.assign(new Error("Panel bootstrap admission is active; retry after its reconciliation."), {code:"panel_bootstrap_busy",phase:"before_delivery"}));
  }
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    const command = {
      id,
      executionId: autonomousCommandContext.getStore() && autonomousCommandContext.getStore().executionId || crypto.randomUUID(),
      leaseId: null,
      script,
      state: "queued",
      resolve,
      reject,
      timeout: null,
      timeoutMs,
      createdAt,
      expiresAt: createdAt + timeoutMs,
      leasedAt: null,
      submittedAt: null,
      completedAt: null,
      leaseOwner: null,
      timedOutFrom: null,
      errorCode: null,
      phase: null,
      settled: false
    };
    command.coreMigrationOperation=coreMigrationOperationContext.getStore()||null;
    const titleRecoveryScope=titleRecoveryCommandContext.getStore();
    if(titleRecoveryScope)titleExportRecovery.queued(titleRecoveryScope,id);
    titleVerificationExecutor.queued(titleVerificationCommandContext.getStore(),id);
    ameJobSourceExecutor.queued(ameJobSourceCommandContext.getStore(),id);
    ameOpenCompExecutor.queued(ameOpenCompCommandContext.getStore(),id);
    const lifecycleScope = lifecycleCommandContext.getStore();
    const recoveryRead=generatedRecoveryReadContext.getStore();
    if(recoveryRead){
      const scope=generatedRecoveryScopes.get(recoveryRead.scopeId);
      if(!scope || scope.state!=="ready" || Date.now()>=scope.expiresAt || !recoveryReadAllowed(scope,recoveryRead.tool) || recoveryRead.runId!==scope.runId || recoveryRead.originalRequestId!==scope.originalRequestId){reject(Object.assign(new Error("generated_recovery_read_scope_invalid"),{code:"generated_recovery_read_scope_invalid",phase:"before_delivery"}));return;}
      command.generatedRecoveryRead={scopeId:scope.scopeId,originalRequestId:scope.originalRequestId,runId:scope.runId,tool:recoveryRead.tool};
    }
    try {
      if (lifecycleScope) lifecycle.validateCommand(lifecycleScope.capability, lifecycleScope.rawScript, id);
      else lifecycle.assertMutationAllowed();
    } catch (error) { reject(Object.assign(error, {phase:"before_delivery"})); return; }
    command.lifecycleCapability = lifecycleScope && lifecycleScope.capability || null;
    command.lifecycleRawScript = lifecycleScope && lifecycleScope.rawScript || null;
    command.lifecycleReadbackRole = lifecycleScope && lifecycle.phaseFacts(lifecycleScope.capability).readbackRole || null;
    command.autonomousGuard = lifecycleScope ? null : autonomousCommandContext.getStore() || null;
    command.planContext = planCommandContext.getStore() || null;
    try { capturePlanCommand(command, null, true); }
    catch (error) { reject(Object.assign(error,{code:"run_record_unavailable",phase:"before_delivery"})); return; }
    const bootstrapRead = panelBootstrapReadContext.getStore();
    if (bootstrapRead) {
      try { command.bootstrapBinding=bootstrapRead.onQueued({id,executionId:command.executionId,expiresAt:command.expiresAt}); }
      catch(error) {reject(Object.assign(error,{code:"bootstrap_read_record_failed",phase:"before_delivery"}));return;}
    }
    command.timeout = setTimeout(() => {
      timeoutAeCommand(id);
    }, timeoutMs);

    inflightCommands.set(id, command);
    pendingCommands.push(id);
    recordEvent("ae_command_queued", {
      id,
      lifecycleState: command.state,
      timeoutMs,
      expiresAt: new Date(command.expiresAt).toISOString(),
      scriptSha25664: crypto.createHash("sha256").update(script,"utf8").digest("hex"),
      script
    });
    drainWaitingPanels();
  });
}

function expireQueuedCommands(now, reason) {
  const at = now || Date.now();
  for (const id of pendingCommands.slice()) {
    const command = inflightCommands.get(id);
    if (!command || command.state !== "queued") {
      removePendingCommand(id);
      continue;
    }
    if (at >= command.expiresAt) {
      expireQueuedCommand(command, reason || "timeout");
    }
  }
}

function expireQueuedCommand(command, reason) {
  if (!command || command.state !== "queued") return false;
  removePendingCommand(command.id);
  clearTimeout(command.timeout);
  command.state = "expired_before_delivery";
  command.completedAt = Date.now();
  inflightCommands.delete(command.id);
  const message = "After Effects command expired before delivery to the panel; it was not executed.";
  retainCommandResult(command.id, {
    ok: false,
    error: message,
    code: "expired_before_delivery",
    lifecycleState: command.state
  }, command);
  settleCommandFailure(command, "expired_before_delivery", message);
  recordEvent("ae_command_expired_before_delivery", {
    id: command.id,
    reason,
    ageMs: Date.now() - command.createdAt,
    timeoutMs: command.timeoutMs
  });
  return true;
}

function timeoutAeCommand(id) {
  const command = inflightCommands.get(id);
  if (!command) return;
  if (command.state === "queued") {
    expireQueuedCommand(command, "timeout");
    return;
  }
  const timedOutFrom = command.state;
  command.timedOutFrom = timedOutFrom;
  command.state = "timed_out_after_submit";
  command.completedAt = Date.now();
  command.errorCode = timedOutFrom === "submitted" ? "timed_out_after_submit" : "unknown_after_delivery";
  inflightCommands.delete(id);
  const message = timedOutFrom === "submitted"
    ? "After Effects command timed out after submit to evalScript; execution may still finish later and any late result will be ignored as stale."
    : "After Effects command timed out after delivery to the panel; execution state is unknown and any late result will be ignored as stale.";
  retainCommandResult(id, {
    ok: false,
    error: message,
    code: command.errorCode,
    lifecycleState: command.state
  }, command);
  settleCommandFailure(command, command.errorCode, message);
  recordEvent("ae_command_timeout_after_delivery", {
    id,
    timedOutFrom,
    lifecycleState: command.state,
    code: command.errorCode,
    ageMs: Date.now() - command.createdAt,
    leaseOwner: command.leaseOwner
  });
}

function panelLeaseOwner(req, url) {
  const requestHeaders = req && req.headers ? req.headers : {};
  const searchParams = url && url.searchParams ? url.searchParams : new URLSearchParams();
  const panelConnectionId = String(
    searchParams.get("panelConnectionId")
    || requestHeaders["x-ae-panel-connection-id"]
    || "unknown-panel"
  );
  const panelGeneration = String(
    searchParams.get("panelGeneration")
    || requestHeaders["x-ae-panel-generation"]
    || "unknown-generation"
  );
  return {
    panelConnectionId,
    panelGeneration,
    userAgent: requestHeaders["user-agent"] || null
  };
}

function leaseOwnerMatches(command, owner) {
  if (!command || !command.leaseOwner || !owner) return false;
  return command.leaseOwner.panelConnectionId === owner.panelConnectionId
    && command.leaseOwner.panelGeneration === owner.panelGeneration;
}

function findActiveEvalScriptCommandForOwner(owner) {
  if (!owner) return null;
  for (const command of inflightCommands.values()) {
    if (command.state === "leased" || command.state === "submitted") {
      return command;
    }
  }
  return null;
}

function boundedAeRawPreview(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (text.length <= AE_RESULT_RAW_PREVIEW_MAX) return text;
  return `${text.slice(0, AE_RESULT_RAW_PREVIEW_MAX)}...<truncated>`;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function parseStrictAeWrapperResult(command, raw) {
  const rawPreview = boundedAeRawPreview(raw);
  if (typeof raw !== "string" || !raw.trim()) {
    throw createAeCommandError(
      command,
      "ae_result_parse_failed",
      "ae_result_parse",
      "After Effects returned an empty command result.",
      { rawPreview }
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw createAeCommandError(
      command,
      "ae_result_parse_failed",
      "ae_result_parse",
      `After Effects returned malformed command JSON: ${error.message}`,
      { rawPreview }
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || typeof parsed.ok !== "boolean") {
    throw createAeCommandError(
      command,
      "ae_result_parse_failed",
      "ae_result_parse",
      "After Effects returned a command result that does not match the bridge wrapper.",
      { rawPreview }
    );
  }

  if (parsed.ok && !hasOwn(parsed, "result")) {
    throw createAeCommandError(
      command,
      "ae_result_parse_failed",
      "ae_result_parse",
      "After Effects returned a successful wrapper without a result field.",
      { rawPreview }
    );
  }

  if (!parsed.ok) {
    throw createAeCommandError(
      command,
      "ae_execution_failed",
      "ae_execution",
      parsed.error || "After Effects script failed.",
      {
        line: parsed.line,
        rawPreview
      }
    );
  }

  return parsed;
}

function rejectRevokedAutonomousCommand(command) {
  if (!command || !command.autonomousGuard || command.state === "submitted") return false;
  const authority = autonomousSession.authorization();
  let code = "autonomous_session_expired_or_revoked";
  let error = "Автономная сессия отозвана или истекла до передачи команды AE.";
  if (!command.autonomousGuard.sessionHash || authority && authority.sessionHash === command.autonomousGuard.sessionHash) {
    try { currentProposalState.assertExecution(command.autonomousGuard); return false; }
    catch (failure) { code = failure.code || "plan_execution_owner_changed"; error = failure.message; }
  }
  removePendingCommand(command.id);
  clearTimeout(command.timeout);
  command.state = "expired_before_delivery";
  command.completedAt = Date.now();
  inflightCommands.delete(command.id);
  command.errorCode = code;
  command.error = error;
  retainCommandResult(command.id, {ok: false, error, code, lifecycleState: command.state}, command);
  settleCommandFailure(command, code, error);
  return true;
}

function generatedRecoveryLeaseScope(req,url){
  const owner=panelLeaseOwner(req,url),selected=url.searchParams.get("recoveryScopeId"),required=url.searchParams.get("recoveryMode")==="1" || owner.panelGeneration.startsWith("recovery-") || generatedRecoveryByPanel.has(owner.panelConnectionId);
  if(!required && !selected)return null;
  const scope=selected && generatedRecoveryScopes.get(selected);
  if(!scope || generatedRecoveryByPanel.get(owner.panelConnectionId)!==scope.scopeId || owner.panelConnectionId!==scope.panelConnectionId || owner.panelGeneration!==scope.nextBinding.panelGeneration || Date.now()>=scope.expiresAt || !["created","ready"].includes(scope.state))throw Object.assign(new Error("generated_recovery_transport_scope_invalid"),{code:"generated_recovery_transport_scope_invalid"});
  if(Array.from(inflightCommands.values()).some(c=>c.generatedRecoveryRead?.scopeId!==scope.scopeId || !recoveryReadAllowed(scope,c.generatedRecoveryRead?.tool)))throw Object.assign(new Error("generated_recovery_foreign_queue_blocked"),{code:"generated_recovery_foreign_queue_blocked"});
  return scope;
}
function leaseNextQueuedCommand(req, url) {
  if(initialRuntime)initialRuntime.assertDispatch();
  const recoveryScope=generatedRecoveryLeaseScope(req,url);
  if(recoveryScope && (url.searchParams.get("recoveryHandshake")==="1" || recoveryScope.state!=="ready"))return null;
  expireQueuedCommands(Date.now(), "bridge_next");
  const leaseOwner = panelLeaseOwner(req, url);
  const activeCommand = findActiveEvalScriptCommandForOwner(leaseOwner);
  if (activeCommand) return null;

  while (pendingCommands.length) {
    const id = pendingCommands.shift();
    const command = inflightCommands.get(id);
    if (!command || command.state !== "queued") continue;
    if(recoveryScope && (command.generatedRecoveryRead?.scopeId!==recoveryScope.scopeId || !recoveryReadAllowed(recoveryScope,command.generatedRecoveryRead?.tool)))throw new Error("generated_recovery_foreign_queue_blocked");
    try {
      assertCoreMigrationDelivery(command,req,url);
      if (command.lifecycleCapability) lifecycle.validateCommand(command.lifecycleCapability, command.lifecycleRawScript, command.id);
      else lifecycle.assertMutationAllowed();
    } catch (error) {
      command.state = "expired_before_delivery"; command.completedAt = Date.now(); command.errorCode = error.code || "lifecycle_delivery_blocked";
      clearTimeout(command.timeout); inflightCommands.delete(command.id);
      retainCommandResult(command.id, {ok:false, error:error.message, code:command.errorCode, lifecycleState:command.state}, command);
      settleCommandFailure(command, command.errorCode, error.message); continue;
    }
    if (rejectRevokedAutonomousCommand(command)) continue;
    if (command.autonomousGuard && command.autonomousGuard.projectFile &&
        require("./proposal-state").normalizeProject(url.searchParams.get("projectFile")) !== require("./proposal-state").normalizeProject(command.autonomousGuard.projectFile)) {
      command.state = "expired_before_delivery";
      command.errorCode = "project_target_mismatch";
      clearTimeout(command.timeout); inflightCommands.delete(command.id);
      retainCommandResult(command.id, {ok:false, error:"Panel project does not match the proposal before delivery.", code:command.errorCode, lifecycleState:command.state}, command);
      settleCommandFailure(command, command.errorCode, "Panel project does not match the proposal before delivery.");
      continue;
    }
    if (Date.now() >= command.expiresAt) {
      expireQueuedCommand(command, "bridge_next");
      continue;
    }
    command.state = "leased";
    capturePlanCommand(command);
    command.leaseId = crypto.randomUUID();
    command.leasedAt = Date.now();
    command.leaseOwner = leaseOwner;
    recordEvent("ae_command_leased", {
      id: command.id,
      lifecycleState: command.state,
      ageMs: Date.now() - command.createdAt,
      leaseOwner: command.leaseOwner
    });
    return commandForPanel(command);
  }
  return null;
}
async function retireGeneratedRecoveryForNormalPoll(req,url){
  const owner=panelLeaseOwner(req,url),id=generatedRecoveryByPanel.get(owner.panelConnectionId);
  if(!id || owner.panelGeneration.startsWith("recovery-") || url.searchParams.get("recoveryMode")==="1")return;
  const scope=generatedRecoveryScopes.get(id),recovery=require("./generated-export-recovery");
  if(!scope || inflightCommands.size || pendingCommands.length)throw new Error("generated_recovery_transport_still_guarded");
  if(scope.profile===commonTitleRecovery.PROFILE){
    const original=await panelControlService.readRecoveryLinkage(scope.originalRequestId),saved=commonTitleRecovery.read(LOG_DIR,"recovery");
    if(!saved || original.remote.recovery?.sha256!==saved.sha256)throw new Error("common_title_full_adoption_required");
    commonTitleRecovery.validateRecovery(saved,planRunRecords.readRecord(LOG_DIR,scope.runId,{throwOnError:true}),original.local);
    generatedRecoveryByPanel.delete(owner.panelConnectionId);generatedRecoveryScopes.delete(id);return;
  }
  const original=await panelControlService.readRecoveryLinkage(scope.originalRequestId),saved=recovery.readReceipt(LOG_DIR,scope.runId,scope.originalRequestId);
  if(!saved || original.remote.recovery?.sha256!==saved.sha256)throw new Error("generated_recovery_full_adoption_required");
  recovery.validateStoredBinding(saved,planRunRecords.readRecord(LOG_DIR,scope.runId,{throwOnError:true}),original.local);
  generatedRecoveryByPanel.delete(owner.panelConnectionId);generatedRecoveryScopes.delete(id);
}

const OWNED_TRUSTED_PROJECT_BODY = projectLifecycleState.nativeProjectInfoBody();
function ownedTrustedReadProjectScript(program){
  if(program===undefined)return wrapExtendScriptBody(OWNED_TRUSTED_PROJECT_BODY);
  // This operand is a pre-C1 source-generation input, never an HTTP tool arg,
  // observed identity, authority constructor or runtime policy upgrade.
  if(!trustedExact(program,["schema","rootName","compName","sourceProjectFile","snapshotProjectFiles"])||program.schema!=="ae-agent.owned-read-fixed-program.v1"||typeof program.rootName!=="string"||!program.rootName||program.rootName!==program.compName||program.rootName.length>256||
      typeof program.sourceProjectFile!=="string"||!Array.isArray(program.snapshotProjectFiles)||program.snapshotProjectFiles.length!==2||[program.sourceProjectFile,...program.snapshotProjectFiles].some(file=>typeof file!=="string"||!file||file.length>32760||file.includes("\0"))||new Set([program.sourceProjectFile,...program.snapshotProjectFiles].map(file=>file.toLowerCase())).size!==3)
    throw Object.assign(Error("owned_initial_exact_frozen_read_program_required"),{code:"owned_initial_exact_frozen_read_program_required"});
  // inspectScript supplies the already reviewed function definitions. Its
  // generator-only operands are removed before producing or executing source;
  // the actual IDs below come solely from the complete live AE census.
  const template=nativeRenderVariant.inspectScript({expectedProjectFile:program.sourceProjectFile,rootCompItemId:1,variantCompItemId:1,controlledLayerIds:[1,2]}),offset=template.lastIndexOf("return nativeSnapshot(");
  if(offset<0||!template.endsWith(");"))throw Object.assign(Error("owned_initial_fixed_read_snapshot_generator_shape"),{code:"owned_initial_fixed_read_snapshot_generator_shape"});
  const body="var basic=(function(){"+OWNED_TRUSTED_PROJECT_BODY+"})();"+template.slice(0,offset)+"var ownedFirstTwoTitleInventory="+ownedFirstTwoTitleInventory.toString()+";var ownedInitialUiBaseline="+ownedInitialUiBaseline.toString()+";var ownedObservedRootTiming="+ownedObservedRootTiming.toString()+";var ownedFixedTitleState="+ownedFixedTitleState.toString()+";var program="+aeLiteral(program)+";"+
    "if(!app.project||!app.project.file||app.project.dirty!==false)throw Error('owned_read_current_clean_file_required');var allowed=[program.sourceProjectFile,program.snapshotProjectFiles[0],program.snapshotProjectFiles[1]],foundFile=false;for(var pi=0;pi<allowed.length;pi++)if(app.project.file.fsName===allowed[pi])foundFile=true;if(!foundFile)throw Error('owned_read_current_fixed_file_required');var target=null;for(pi=1;pi<=app.project.numItems;pi++){var item=app.project.item(pi);if(item instanceof CompItem&&item.name===program.compName){if(target)throw Error('owned_read_current_unique_comp_required');target=item;}}if(!target)throw Error('owned_read_current_comp_absent');var inventory=ownedFirstTwoTitleInventory(target),selected=[];for(pi=0;pi<inventory.layerRows.length;pi++){var row=inventory.layerRows[pi];if(String(row.sourceText).replace(/[\\u0009-\\u000d\\u0020\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]/g,'').length)selected.push(row.id);if(selected.length===2)break;}if(selected.length!==2)throw Error('owned_read_current_pair_absent');var d={rootName:program.rootName,compName:program.compName,selectedTextLayerIds:selected,originalComp:{ownedTitleInventory:inventory}};var state=ownedFixedTitleState(d,app.project.file.fsName,nativeSnapshot);if(state.projectFile!==basic.file||state.revision!==basic.revision)throw Error('owned_read_current_basic_join');basic.ownedReadCurrent={schema:'ae-agent.owned-read-current.v1',state:state};return basic;";
  const script=wrapExtendScriptBody(body);if(Buffer.byteLength(script,"utf8")>1048576)throw Object.assign(Error("owned_initial_fixed_read_script_bound"),{code:"owned_initial_fixed_read_script_bound"});return script;
}

function wrapExtendScriptBody(body) {
  return `var __codexMcpBridgeResult = (function () {
  function __codexEscapeString(value) {
    return String(value)
      .replace(/\\\\/g, "\\\\\\\\")
      .replace(/"/g, "\\\\\\"")
      .replace(/\\r/g, "\\\\r")
      .replace(/\\n/g, "\\\\n")
      .replace(/\\t/g, "\\\\t");
  }

  function __codexStringify(value) {
    if (value === null || value === undefined) return "null";
    var valueType = typeof value;
    if (valueType === "string") return "\\"" + __codexEscapeString(value) + "\\"";
    if (valueType === "number") return isFinite(value) ? String(value) : "null";
    if (valueType === "boolean") return value ? "true" : "false";
    if (value instanceof Date) return "\\"" + __codexEscapeString(value.toString()) + "\\"";
    if (value instanceof Array) {
      var items = [];
      for (var i = 0; i < value.length; i++) {
        items.push(__codexStringify(value[i]));
      }
      return "[" + items.join(",") + "]";
    }
    if (valueType === "object") {
      var props = [];
      for (var key in value) {
        var include = true;
        try {
          include = value.hasOwnProperty ? value.hasOwnProperty(key) : true;
        } catch (__hasOwnError) {
          include = true;
        }
        if (!include) continue;
        var propType = typeof value[key];
        if (propType === "function" || propType === "undefined") continue;
        props.push("\\"" + __codexEscapeString(key) + "\\":" + __codexStringify(value[key]));
      }
      return "{" + props.join(",") + "}";
    }
    return "\\"" + __codexEscapeString(value) + "\\"";
  }

  try {
    var __result = (function () {
${body}
    })();
    if (__result === undefined) {
      return "{\\"ok\\":true,\\"result\\":null}";
    }
    return "{\\"ok\\":true,\\"result\\":" + __codexStringify(__result) + "}";
  } catch (__error) {
    var __line = __error && __error.line ? __error.line : null;
    return "{\\"ok\\":false,\\"error\\":" + __codexStringify(String(__error)) + ",\\"line\\":" + __codexStringify(__line) + "}";
  }
}());
__codexMcpBridgeResult;`;
}

const EXTENDSCRIPT_BODY_LINE_OFFSET = (() => {
  const marker = "__codex_mcp_bridge_body_marker__";
  const wrapped = wrapExtendScriptBody(marker);
  const markerIndex = wrapped.indexOf(marker);
  if (markerIndex < 0) return 0;
  return wrapped.slice(0, markerIndex).split(/\r\n|\r|\n/).length - 1;
})();

async function runExtendScriptBody(body, timeoutMs) {
  if(initialRuntime&&!ownedReadonlyScriptPreparation())initialRuntime.assertCommand();
  const lifecycleScope = lifecycleCommandContext.getStore();
  if (lifecycleScope) lifecycle.validateCommand(lifecycleScope.capability, body);
  const protection = placeholderMutationContext.getStore();
  if (!lifecycleScope && protection && (protection.snapshots.length || protection.bindings.length || protection.inventoryBaseline || protection.geometryBaselines)) {
    body = placeholderProtection.aeGuardScript(protection.projectFile, protection.snapshots, protection.bindings) + "\n" + body;
    if (protection.inventoryBaseline) body = placeholderProtection.aeInventoryGuardScript(protection.inventoryBaseline) + "\n" + body;
    if (protection.geometryBaselines) body=placeholderGeometry.geometryGuardScript(protection.geometryBaselines)+"\n"+body;
  }
  const guard = autonomousCommandContext.getStore();
  if (!lifecycleScope && guard && guard.projectFile) {
    body = `if (!app.project || !app.project.file || String(app.project.file.fsName).replace(/\\\\/g, "/").toLowerCase() !== ${aeLiteral(guard.projectFile.replace(/\\/g, "/").toLowerCase())}) throw new Error("project_target_mismatch");\n` + body;
  }
  const script = wrapExtendScriptBody(body);
  const preparation = scriptPreparationContext.getStore();
  if (preparation) {if(ownedReadonlyScriptPreparations.has(preparation)&&++preparation.count!==1)
    throw Object.assign(Error("owned_initial_multiple_readonly_scripts_refused"),{code:"owned_initial_multiple_readonly_scripts_refused"});
    preparation.script = script; return { result: preparation.fixtureResult }; }
  titleVerificationExecutor.prepareNative(titleVerificationCommandContext.getStore(),script,body);
  ameJobSourceExecutor.prepareNative(ameJobSourceCommandContext.getStore(),script,body);
  ameOpenCompExecutor.prepareNative(ameOpenCompCommandContext.getStore(),script,body);
  return enqueueAeCommand(script, timeoutMs || COMMAND_TIMEOUT_MS);
}

function exposedTools() {
  return tools.map((tool) => {
    if (!MUTATING_TOOL_NAMES.has(tool.name) || projectLifecycleContract.isLifecycleTool(tool.name)) return tool;

    const inputSchema = tool.inputSchema || { type: "object", properties: {} };
    return {
      ...tool,
      inputSchema: {
        ...inputSchema,
        properties: {
          ...inputSchema.properties,
          ...MUTATION_CHECKPOINT_SCHEMA_PROPERTIES
        }
      }
    };
  });
}

// External presentation boundary only: persisted and nested tool results retain
// their legacy representation and all confirmation/read-back gates run first.
function decorateDaemonToolResult(name, result) {
  return toolErrorResponse.decorateToolResult(result, {
    toolName: name, daemonAvailable: true,
    panelConnected: Date.now() - lastPanelSeenAt < 15000,
    exposedTools: exposedTools()
  });
}



function extractJsonObject(text) {
  const source = String(text || "").trim();
  if (!source) throw new Error("Agent returned an empty plan.");
  try {
    return JSON.parse(source);
  } catch (_error) {}

  const firstBrace = source.indexOf("{");
  const lastBrace = source.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error("Agent response did not contain a JSON object.");
  }
  return JSON.parse(source.slice(firstBrace, lastBrace + 1));
}

function normalizeAgentPlan(rawText) {
  try {
    const plan = extractJsonObject(rawText);
    if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
      throw new Error("Plan JSON must be an object.");
    }
    if (!Array.isArray(plan.steps)) plan.steps = [];
    return { ok: true, plan };
  } catch (error) {
    return {
      ok: false,
      error: error.message || String(error),
      rawText
    };
  }
}

function toolByName(toolName) {
  return tools.find((tool) => tool.name === toolName) || null;
}

function planStepToolName(step) {
  if (!step || typeof step !== "object") return "";
  return String(step.tool || step.mcpTool || step.name || "").trim().slice(0, 120);
}

function planStepArgs(step) {
  if (!step || typeof step !== "object") return {};
  const args = step.args || step.arguments || step.parameters || {};
  return args && typeof args === "object" && !Array.isArray(args) ? { ...args } : {};
}

function requiredSchemaFields(tool) {
  const required = tool && tool.inputSchema && Array.isArray(tool.inputSchema.required)
    ? tool.inputSchema.required
    : [];
  return required.filter(Boolean);
}

function formatTargetPart(label, value) {
  if (value === undefined || value === null || value === "") return "";
  if (Array.isArray(value)) {
    if (!value.length) return "";
    return `${label} ${value.join(",")}`;
  }
  return `${label} ${value}`;
}

function planStepTargetSummary(toolName, args) {
  args = args || {};
  const parts = [];
  const comp = formatTargetPart("comp", args.compName || (hasArg(args, "compItemIndex") ? `#${args.compItemIndex}` : ""));
  if (comp) parts.push(comp);
  if (hasArg(args, "layerIndices")) parts.push(formatTargetPart("layers", args.layerIndices));
  if (hasArg(args, "layerIndex")) parts.push(formatTargetPart("layer", args.layerIndex));
  if (hasArg(args, "itemIndices")) parts.push(formatTargetPart("items", args.itemIndices));
  if (hasArg(args, "itemIndex")) parts.push(formatTargetPart("item", `#${args.itemIndex}`));
  if (args.itemName) parts.push(formatTargetPart("item", args.itemName));
  if (toolName === "create_comp" && args.name) parts.push(formatTargetPart("comp", args.name));
  if (toolName === "create_project_folder" && args.name) parts.push(formatTargetPart("folder", args.name));
  if (hasArg(args, "folderItemIndex")) parts.push(formatTargetPart("folder", `#${args.folderItemIndex}`));
  if (args.folderName) parts.push(formatTargetPart("folder", args.folderName));
  if (hasArg(args, "targetFolderItemIndex")) parts.push(formatTargetPart("target folder", `#${args.targetFolderItemIndex}`));
  if (args.targetFolderName) parts.push(formatTargetPart("target folder", args.targetFolderName));
  if (args.targetRoot) parts.push(formatTargetPart("target folder", "project root"));
  if (hasArg(args, "parentFolderItemIndex")) parts.push(formatTargetPart("parent folder", `#${args.parentFolderItemIndex}`));
  if (args.parentFolderName) parts.push(formatTargetPart("parent folder", args.parentFolderName));
  if (hasArg(args, "sourceItemIndex")) parts.push(formatTargetPart("source", `#${args.sourceItemIndex}`));
  if (args.sourceItemName) parts.push(formatTargetPart("source", args.sourceItemName));
  if (hasArg(args, "sourceCompItemIndex")) parts.push(formatTargetPart("source comp", `#${args.sourceCompItemIndex}`));
  if (args.sourceCompName) parts.push(formatTargetPart("source comp", args.sourceCompName));
  if (args.property || args.propertyPath) parts.push(formatTargetPart("property", args.property || (Array.isArray(args.propertyPath) ? args.propertyPath.join(".") : args.propertyPath)));
  if (args.effect || args.effectName || args.effectMatchName) parts.push(formatTargetPart("effect", args.effect || args.effectName || args.effectMatchName));
  if (hasArg(args, "renderQueueItemIndex")) parts.push(formatTargetPart("render queue item", `#${args.renderQueueItemIndex}`));
  if (args.outputPath) parts.push(formatTargetPart("output", args.outputPath));

  if (!parts.length) {
    if ([
      "get_active_comp",
      "get_selected_layers",
      "get_selected_properties",
      "set_layer_time_range",
      "stagger_layers",
      "split_layers_at_time",
      "fit_layer_to_comp",
      "rename_layers"
    ].includes(toolName)) {
      return "active comp / selected layers";
    }
    if (toolName === "set_comp_work_area") return "active comp";
    if (toolName === "deep_duplicate_precomp_sources") return "active comp / selected precomp layer";
    if (toolName === "get_render_queue_status") return "render queue";
  }
  return parts.filter(Boolean).join("; ");
}

function knownToolNamesSummary(limit) {
  return PLANNING_TOOL_NAMES.slice(0, limit || 20).join(", ");
}

function validateAgentPlanObject(plan, requestId, context) {
  const validationId = requestId || crypto.randomUUID();
  const sourcePlan = plan && typeof plan === "object" && !Array.isArray(plan) ? plan : {};
  const steps = Array.isArray(sourcePlan.steps) ? sourcePlan.steps : [];
  const validatedSteps = [];
  const warnings = [];
  let mutatingCount = 0;
  let unknownToolCount = 0;
  let executableCount = 0;
  let generatedFileIoCount = 0;
  let generatedRenderOutputCount = 0;
  let generatedCleanupDeleteCount = 0;

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index] && typeof steps[index] === "object" ? steps[index] : {};
    const toolName = planStepToolName(step);
    const tool = toolName ? toolByName(toolName) : null;
    const planningTool = toolName ? PLANNING_TOOL_NAMES.includes(toolName) : false;
    const mutating = toolName ? MUTATING_TOOL_NAMES.has(toolName) : false;
    const safeArgs = tool ? normalizePlanArgAliases(planStepArgs(step), tool) : planStepArgs(step);
    const resultBindings = step.resultBindings && typeof step.resultBindings === "object" && !Array.isArray(step.resultBindings)
      ? step.resultBindings
      : {};
    const missingRequired = [];
    const boundRequired = [];
    const autofixes = [];
    const stepWarnings = [];
    const safetyContracts = generatedSafety.contractsForPlanStep(toolName, safeArgs);
    const generatedSafetyIssues = toolName ? generatedSafety.validateGeneratedSafetyStep(toolName, safeArgs, {
      projectRoot: PROJECT_ROOT,
      generatedRenderOutputDir: GENERATED_RENDER_OUTPUT_DIR
    }) : [];
    if(ameOpenComp.MUTATIONS.includes(toolName)){
      try{ameOpenComp.validateInput(toolName,safeArgs);}catch(error){generatedSafetyIssues.push(error.code||error.message);}
      if(steps.length!==1||plan.runtimeBindings||step.resultBindings||step.bindings||plan.montagePipeline)generatedSafetyIssues.push("Open-comp AME journal requires one isolated typed step without runtime bindings or montage pipeline.");
    }
    if(toolName===titleVerification.TOOL){
      try{titleVerification.validateInput(safeArgs);}catch(error){generatedSafetyIssues.push(error.code||error.message);}
      if(steps.length!==1||plan.runtimeBindings||step.resultBindings)generatedSafetyIssues.push("Snapshot verification requires one exact isolated typed step without runtime bindings.");
    }
    if(toolName===titleExport.TOOL){
      try{titleExport.validateInput(safeArgs);}catch(error){generatedSafetyIssues.push(error.code || error.message);}
      if(steps.length!==1 || plan.runtimeBindings || step.resultBindings)generatedSafetyIssues.push("Two title snapshots require one exact isolated typed step without runtime bindings.");
    }
    if(toolName===ameJobSource.TOOL){
      generatedSafetyIssues.push("ame_snapshot_source_frozen: experimental per-title SaveAs/snapshot/full-AEP SHA flow is frozen pending separate user scope.");
      try{ameJobSource.validateInput(toolName,safeArgs);}catch(error){generatedSafetyIssues.push(error.code||error.message);}
      if(steps.length!==1||plan.runtimeBindings||step.resultBindings||step.bindings)generatedSafetyIssues.push("One AME source requires one exact isolated typed step without runtime bindings.");
    }
    if(toolName===projectSave.TOOL_NAME){
      try{projectSave.validateToolInput(toolName,safeArgs);}catch(error){generatedSafetyIssues.push(error.message);}
      if(steps.filter(value=>planStepToolName(value)===projectSave.TOOL_NAME).length!==1)generatedSafetyIssues.push("One named-project save is allowed per confirmed plan.");
    }
    if (toolName === ameRunning.TOOL_NAME) {
      try { ameRunning.validateInput(safeArgs); } catch (error) { generatedSafetyIssues.push(error.code || error.message); }
      if (steps.length !== 1) generatedSafetyIssues.push("AME application startup requires an isolated one-step typed plan.");
    }
    if (ameQueueControl.tools.some(tool => tool.name === toolName)) {
      try { ameQueueControl.validateInput(toolName, safeArgs); } catch (error) { generatedSafetyIssues.push(error.code || error.message); }
      if (ameQueueControl.MUTATIONS.includes(toolName) && (steps.length !== 1 || plan.runtimeBindings || step.resultBindings || step.bindings)) generatedSafetyIssues.push("Global AME control requires one exact isolated typed step without runtime bindings.");
    }
    if (toolName === ameFixtureGrant.TOOL_NAME) {
      try { ameFixtureGrant.validateInput(safeArgs); } catch (error) { generatedSafetyIssues.push(error.code || error.message); }
      if (steps.length !== 1) generatedSafetyIssues.push("Native fixture probe requires an isolated manual one-step plan.");
    }
    if (ameTitleJobs.tools.some(tool => tool.name === toolName)) {
      try { ameTitleJobs.validateInput(toolName, safeArgs); } catch (error) { generatedSafetyIssues.push(error.code || error.message); }
      if (ameTitleMutationNames.has(toolName) && steps.length !== 1) generatedSafetyIssues.push("AME submission/start requires an isolated one-step plan.");
    }
    if([nativeRenderVariant.INSPECT,nativeRenderVariant.RENDER].includes(toolName)) {
      try{nativeRenderVariant.validateInput(toolName,safeArgs);}catch(error){generatedSafetyIssues.push(error.message);}
      if(toolName===nativeRenderVariant.RENDER) {
        try{resolveOutputFilePath(safeArgs.outputFileName);}catch(error){generatedSafetyIssues.push(error.message);}
        generatedRenderOutputCount++;
        if(steps.filter(value=>planStepToolName(value)===nativeRenderVariant.RENDER).length!==1)generatedSafetyIssues.push("One title variant render is allowed per manual proposal.");
      }
    }
    if (projectLifecycleContract.isLifecycleTool(toolName)) {
      try { projectLifecycleContract.validateInput(toolName, safeArgs); if (projectLifecycleContract.isLifecycleMutation(toolName)) lifecycle.planStep(sourcePlan); }
      catch (error) { generatedSafetyIssues.push(error.code || error.message); }
    }
    for (const contract of safetyContracts) {
      if (contract.kind === "generated-file-output") generatedFileIoCount += 1;
      if (contract.kind === "generated-render-output") generatedRenderOutputCount += 1;
      if (contract.kind === "generated-cleanup-delete") generatedCleanupDeleteCount += 1;
    }

    if (!toolName) {
      validatedSteps.push({
        index: index + 1,
        title: step.title || step.intent || "Untooled step",
        intent: step.intent || "",
        tool: null,
        valid: true,
        executable: false,
        mutatesProject: false,
        safetyContracts,
        args: safeArgs,
        safeArgs,
        warnings: stepWarnings,
        autofixes,
        missingRequired
      });
      continue;
    }

    if (!tool) {
      unknownToolCount += 1;
      stepWarnings.push(`Unknown MCP tool: ${toolName}. Use a listed tool name such as ${knownToolNamesSummary(12)}.`);
    } else if (!planningTool) {
      stepWarnings.push(`${toolName} is not available for AI Agent plans. Use a tool from the planning catalog such as ${knownToolNamesSummary(12)}.`);
    } else {
      executableCount += 1;
      for (const field of requiredSchemaFields(tool)) {
        if (hasRequiredPlanArg(toolName, safeArgs, field)) continue;
        if (hasArg(resultBindings, field)) {
          boundRequired.push(field);
        } else {
          missingRequired.push(field);
        }
      }
      if (missingRequired.length) {
        stepWarnings.push(`Missing required fields for ${toolName}: ${missingRequired.join(", ")}.`);
      }
      if (boundRequired.length) {
        stepWarnings.push(`Runtime bindings must resolve before execution: ${boundRequired.join(", ")}.`);
      }
      if (generatedSafetyIssues.length) {
        stepWarnings.push(`Generated-only safety contract failed: ${generatedSafetyIssues.join(" ")}`);
      }
    }

    if (mutating) {
      mutatingCount += 1;
      const safetyAutofixes = [];
      if (!ameOpenComp.MUTATIONS.includes(toolName) && toolName !== ameJobSource.TOOL && toolName !== titleVerification.TOOL && toolName !== titleExport.TOOL && toolName !== ameFixtureGrant.TOOL_NAME && toolName !== nativeRenderVariant.RENDER && toolName !== projectSave.TOOL_NAME && !projectLifecycleContract.isLifecycleMutation(toolName) && safeArgs.verifyAfter !== true) {
        safeArgs.verifyAfter = true;
        autofixes.push("verifyAfter=true");
        safetyAutofixes.push("verifyAfter=true");
      }
      if (!ameOpenComp.MUTATIONS.includes(toolName) && toolName !== ameJobSource.TOOL && toolName !== titleVerification.TOOL && toolName !== titleExport.TOOL && toolName !== ameFixtureGrant.TOOL_NAME && toolName !== nativeRenderVariant.RENDER && toolName !== projectSave.TOOL_NAME && !projectLifecycleContract.isLifecycleMutation(toolName) && !safeArgs.idempotencyKey) {
        safeArgs.idempotencyKey = `ae-plan-${validationId}-step-${index + 1}-${toolName}`;
        autofixes.push("idempotencyKey");
        safetyAutofixes.push("idempotencyKey");
      }
      if (!ameOpenComp.MUTATIONS.includes(toolName) && toolName !== ameJobSource.TOOL && toolName !== titleVerification.TOOL && toolName !== titleExport.TOOL && toolName !== ameFixtureGrant.TOOL_NAME && toolName !== nativeRenderVariant.RENDER && toolName !== projectSave.TOOL_NAME && !projectLifecycleContract.isLifecycleMutation(toolName) && !safeArgs.idempotencyScope) {
        safeArgs.idempotencyScope = `ae-plan:${validationId}`;
        autofixes.push("idempotencyScope");
        safetyAutofixes.push("idempotencyScope");
      }
      if (safetyAutofixes.length) {
        stepWarnings.push(`Added mutation safety defaults: ${safetyAutofixes.join(", ")}.`);
      }
      if (toolName === "run_extendscript" || toolName === "run_extendscript_file") {
        stepWarnings.push("Raw ExtendScript is an escape hatch. Use a typed MCP tool whenever one fits the request.");
      }
    }

    validatedSteps.push({
      index: index + 1,
      title: step.title || step.intent || toolName,
      intent: step.intent || "",
      tool: toolName,
      valid: Boolean(tool) && planningTool && missingRequired.length === 0 && generatedSafetyIssues.length === 0,
      executable: Boolean(tool) && planningTool && missingRequired.length === 0 && boundRequired.length === 0 && generatedSafetyIssues.length === 0,
      requiresRuntimeBinding: boundRequired.length > 0,
      mutatesProject: mutating,
      safetyContracts,
      targetSummary: planStepTargetSummary(toolName, safeArgs),
      args: planStepArgs(step),
      safeArgs,
      warnings: stepWarnings,
      autofixes,
      missingRequired,
      boundRequired,
      resultBindings
    });
  }

  if (mutatingCount > 1 && sourcePlan.requiresCheckpoint !== true) {
    warnings.push("Multiple mutating steps planned; set requiresCheckpoint=true or rely on the runner's protected edit session before execution.");
  }
  if (unknownToolCount) {
    warnings.push(`${unknownToolCount} planned step(s) reference unknown MCP tools.`);
  }
  if (!steps.length && !sourcePlan.clarifyingQuestion) {
    warnings.push("Plan has no steps and no clarifying question.");
  }
  if (executableCount <= 0) {
    warnings.push("Plan has no executable MCP tool steps.");
  }
  if (generatedFileIoCount > 0) {
    warnings.push(`${generatedFileIoCount} generated-only file IO step(s) require reviewed filename, generated root, byte/hash evidence, and post-output read-back.`);
  }
  if (generatedRenderOutputCount > 0) {
    warnings.push(`${generatedRenderOutputCount} generated render-output setup step(s) require paths under logs/generated-renders and render queue read-back; render start remains unsupported here.`);
  }
  if (generatedCleanupDeleteCount > 0) {
    warnings.push(`${generatedCleanupDeleteCount} generated cleanup/delete step(s) require generated prefix, explicit limit, destructive gate, and post-cleanup read-back.`);
  }

  const invalidSteps = validatedSteps.filter((step) => !step.valid && step.tool);
  const validation = {
    ok: invalidSteps.length === 0 && unknownToolCount === 0 && executableCount > 0,
    validationId,
    stepCount: steps.length,
    executableCount,
    mutatingCount,
    generatedFileIoCount,
    generatedRenderOutputCount,
    generatedCleanupDeleteCount,
    unknownToolCount,
    invalidStepCount: invalidSteps.length,
    requiresCheckpoint: sourcePlan.requiresCheckpoint === true || mutatingCount > 1,
    warnings,
    steps: validatedSteps
  };
  validation.classification = classifyAgentPlan(sourcePlan, validation, context || {});
  return validation;
}

function compactAgentPlanValidationSummary(validation) {
  if (!validation || typeof validation !== "object") return null;
  return {
    ok: Boolean(validation.ok),
    stepCount: Number(validation.stepCount || 0),
    executableCount: Number(validation.executableCount || 0),
    mutatingCount: Number(validation.mutatingCount || 0),
    generatedFileIoCount: Number(validation.generatedFileIoCount || 0),
    generatedRenderOutputCount: Number(validation.generatedRenderOutputCount || 0),
    generatedCleanupDeleteCount: Number(validation.generatedCleanupDeleteCount || 0),
    unknownToolCount: Number(validation.unknownToolCount || 0),
    invalidStepCount: Number(validation.invalidStepCount || 0),
    classification: validation.classification && validation.classification.category || null
  };
}

function validateAgentPlanWithRepair(plan, requestId, context, options) {
  const config = options || {};
  const repairEnabled = optionalBoolean(config, "repairPlan", true) !== false &&
    !(plan && Array.isArray(plan.steps) && plan.steps.some(step => projectLifecycleContract.isLifecycleMutation(planStepToolName(step))));
  const originalValidation = validateAgentPlanObject(plan, requestId, context);
  if (!repairEnabled) {
    originalValidation.planRepair = {
      schema: "ae-agent-plan-repair.v1",
      applied: false,
      skipped: true,
      reason: "repairPlan=false"
    };
    return {
      plan,
      validation: originalValidation,
      originalValidation,
      repair: originalValidation.planRepair
    };
  }

  const repair = repairAgentPlan(plan, originalValidation, {
    tools,
    planningToolNames: PLANNING_TOOL_NAMES
  });
  if (!repair.applied || !repair.repairedPlan) {
    originalValidation.planRepair = {
      ...repair,
      repairedPlan: undefined
    };
    return {
      plan,
      validation: originalValidation,
      originalValidation,
      repair: originalValidation.planRepair
    };
  }

  const repairedValidation = validateAgentPlanObject(repair.repairedPlan, requestId, context);
  const report = {
    ...repair,
    repairedPlan: undefined,
    repairedValidation: compactAgentPlanValidationSummary(repairedValidation)
  };
  repairedValidation.planRepair = report;
  return {
    plan: repair.repairedPlan,
    validation: repairedValidation,
    originalValidation,
    repair: report
  };
}

function hasCheckpointStep(validation) {
  return Boolean(validation && Array.isArray(validation.steps) && validation.steps.some((step) => (
    step.tool === "checkpoint_project" || step.tool === "start_edit_session"
  )));
}

function valueAtPath(value, pathExpression) {
  const parts = String(pathExpression || "")
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  let current = value;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

function isPlanBindingExpression(value) {
  const expression = String(value || "").trim();
  return /^steps\.\d+\./.test(expression)
    || expression.indexOf("previous.") === 0
    || /^step-\d+-result(?:\.|$)/.test(expression)
    || /^\{\{\s*[A-Za-z0-9_.-]+\s*\}\}$/.test(expression);
}

function firstPresent(values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function defaultPlanBindingValue(payload, targetField) {
  if (!payload || typeof payload !== "object") return payload;
  if (targetField === "compItemIndex") {
    return firstPresent([
      payload.rootCompItemIndex,
      payload.duplicatedRootCompItemIndex,
      payload.compItemIndex,
      payload.itemIndex,
      valueAtPath(payload, "duplicate.itemIndex"),
      valueAtPath(payload, "duplicateComp.itemIndex"),
      valueAtPath(payload, "comp.itemIndex"),
      valueAtPath(payload, "activeComp.itemIndex"),
      valueAtPath(payload, "project.activeItem.itemIndex"),
      valueAtPath(payload, "verification.comp.itemIndex"),
      valueAtPath(payload, "mutation.target.item.itemIndex")
    ]);
  }
  if (targetField === "folderItemIndex" || targetField === "targetFolderItemIndex") {
    return firstPresent([
      payload.folderItemIndex,
      payload.targetFolderItemIndex,
      valueAtPath(payload, "folder.itemIndex"),
      valueAtPath(payload, "targetFolder.itemIndex")
    ]);
  }
  if (targetField === "compName") {
    return firstPresent([
      payload.compName,
      payload.name,
      valueAtPath(payload, "duplicate.name"),
      valueAtPath(payload, "comp.name"),
      valueAtPath(payload, "activeComp.name"),
      valueAtPath(payload, "project.activeItem.name"),
      valueAtPath(payload, "verification.comp.name"),
      valueAtPath(payload, "mutation.target.item.name")
    ]);
  }
  if (targetField === "itemIndex") {
    return firstPresent([
      payload.itemIndex,
      valueAtPath(payload, "duplicate.itemIndex"),
      valueAtPath(payload, "item.itemIndex"),
      valueAtPath(payload, "sourceItem.itemIndex"),
      valueAtPath(payload, "mutation.target.item.itemIndex")
    ]);
  }
  if (targetField === "itemIndices" || targetField === "itemIndexes") {
    return firstPresent([
      deepDuplicateCreatedItemIndicesFromPayload(payload),
      selectedSourceCompIndicesFromPayload(payload),
      projectItemIndicesFromPayload(payload)
    ]);
  }
  if (targetField === "itemName" || targetField === "name") {
    return firstPresent([
      payload.itemName,
      payload.name,
      valueAtPath(payload, "duplicate.name"),
      valueAtPath(payload, "item.name"),
      valueAtPath(payload, "sourceItem.name"),
      valueAtPath(payload, "mutation.target.item.name")
    ]);
  }
  if (targetField === "layerIndex") {
    return firstPresent([
      payload.layerIndex,
      valueAtPath(payload, "layer.index"),
      valueAtPath(payload, "layer.layerIndex"),
      valueAtPath(payload, "mutation.target.layer.layerIndex")
    ]);
  }
  if (targetField === "layerName") {
    return firstPresent([
      payload.layerName,
      valueAtPath(payload, "layer.name"),
      valueAtPath(payload, "mutation.target.layer.name")
    ]);
  }
  return payload;
}

function positiveIntegerBindingValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) return undefined;
  return Math.floor(number);
}

function sourceCompRefFromLayer(layer) {
  const source = layer && layer.source;
  if (!source || typeof source !== "object") return null;
  const type = String(source.type || source.typeName || "").toLowerCase();
  if (type && type.indexOf("comp") === -1) return null;
  const itemIndex = positiveIntegerBindingValue(source.itemIndex || source.index);
  if (!itemIndex) return null;
  return {
    itemIndex,
    name: source.name || ""
  };
}

function uniquePositiveIntegerList(values) {
  const source = Array.isArray(values) ? values : [values];
  const result = [];
  const seen = new Set();
  for (const value of source) {
    const normalized = positiveIntegerBindingValue(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result.length ? result : undefined;
}

function itemIndicesFromObjectList(items) {
  if (!Array.isArray(items)) return undefined;
  const values = [];
  for (const item of items) {
    values.push(
      item && item.itemIndex,
      valueAtPath(item, "item.itemIndex"),
      valueAtPath(item, "source.itemIndex"),
      valueAtPath(item, "sourceItem.itemIndex")
    );
  }
  return uniquePositiveIntegerList(values);
}

function projectItemIndicesFromPayload(payload) {
  if (!payload || typeof payload !== "object") return undefined;
  return firstPresent([
    uniquePositiveIntegerList(payload.itemIndices),
    uniquePositiveIntegerList(payload.itemIndexes),
    uniquePositiveIntegerList(payload.createdItemIndices),
    uniquePositiveIntegerList(payload.duplicatedProjectItemIndices),
    uniquePositiveIntegerList([
      payload.itemIndex,
      payload.rootCompItemIndex,
      payload.duplicatedRootCompItemIndex,
      valueAtPath(payload, "duplicate.itemIndex"),
      valueAtPath(payload, "duplicateComp.itemIndex"),
      valueAtPath(payload, "item.itemIndex"),
      valueAtPath(payload, "sourceItem.itemIndex"),
      valueAtPath(payload, "mutation.target.item.itemIndex")
    ]),
    itemIndicesFromObjectList(payload.items),
    itemIndicesFromObjectList(payload.matches),
    itemIndicesFromObjectList(payload.renamed),
    itemIndicesFromObjectList(payload.removed)
  ]);
}

function deepDuplicateRootCompItemIndexFromPayload(payload) {
  if (!payload || typeof payload !== "object") return undefined;
  return firstPresent([
    positiveIntegerBindingValue(payload.rootCompItemIndex),
    positiveIntegerBindingValue(payload.duplicatedRootCompItemIndex),
    positiveIntegerBindingValue(valueAtPath(payload, "duplicateComp.itemIndex")),
    positiveIntegerBindingValue(valueAtPath(payload, "layer.source.itemIndex"))
  ]);
}

function deepDuplicateCreatedItemIndicesFromPayload(payload) {
  if (!payload || typeof payload !== "object") return undefined;
  const values = [];
  const rootCompItemIndex = deepDuplicateRootCompItemIndexFromPayload(payload);
  if (rootCompItemIndex) values.push(rootCompItemIndex);

  if (Array.isArray(payload.duplicatedItems)) {
    for (const item of payload.duplicatedItems) {
      values.push(valueAtPath(item, "duplicate.itemIndex"));
    }
  }

  return uniquePositiveIntegerList(values);
}

function withDeepDuplicateResultAliases(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const rootCompItemIndex = deepDuplicateRootCompItemIndexFromPayload(payload);
  const createdItemIndices = deepDuplicateCreatedItemIndicesFromPayload(payload);
  const result = { ...payload };

  if (rootCompItemIndex) {
    if (!positiveIntegerBindingValue(result.rootCompItemIndex)) {
      result.rootCompItemIndex = rootCompItemIndex;
    }
    if (!positiveIntegerBindingValue(result.duplicatedRootCompItemIndex)) {
      result.duplicatedRootCompItemIndex = rootCompItemIndex;
    }
  }

  if (createdItemIndices && createdItemIndices.length) {
    if (!Array.isArray(result.createdItemIndices) || !result.createdItemIndices.length) {
      result.createdItemIndices = createdItemIndices;
    }
    if (!Array.isArray(result.duplicatedProjectItemIndices) || !result.duplicatedProjectItemIndices.length) {
      result.duplicatedProjectItemIndices = createdItemIndices;
    }
  }

  return result;
}

function selectedSourceCompRefsFromPayload(payload) {
  if (!payload || typeof payload !== "object") return undefined;
  const layerCollections = [
    payload.selectedLayers,
    valueAtPath(payload, "comp.selectedLayers"),
    valueAtPath(payload, "activeComp.selectedLayers")
  ];
  const refs = [];
  const seen = new Set();

  function addRef(ref) {
    if (!ref) return;
    const key = `${ref.itemIndex}:${ref.name || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    refs.push(ref);
  }

  for (const layers of layerCollections) {
    if (!Array.isArray(layers)) continue;
    for (const layer of layers) {
      addRef(sourceCompRefFromLayer(layer));
    }
  }

  addRef(sourceCompRefFromLayer(payload.layer));

  return refs.length ? refs : undefined;
}

function selectedSourceCompFromPayload(payload) {
  const refs = selectedSourceCompRefsFromPayload(payload);
  if (!refs || !refs.length) return undefined;
  const first = refs[0];
  for (const ref of refs) {
    if (ref.itemIndex !== first.itemIndex) return undefined;
  }
  return first;
}

function selectedSourceCompIndicesFromPayload(payload) {
  const refs = selectedSourceCompRefsFromPayload(payload);
  if (!refs || !refs.length) return undefined;
  return uniquePositiveIntegerList(refs.map((ref) => ref.itemIndex));
}

function selectedSourceCompBindingValue(payload, targetField) {
  const ref = selectedSourceCompFromPayload(payload);
  if (!ref) return undefined;
  if (targetField === "compName" || targetField === "itemName" || targetField === "name") {
    return ref.name || undefined;
  }
  return ref.itemIndex;
}

function selectedLayerIndicesFromPayload(payload) {
  if (!payload || typeof payload !== "object") return undefined;
  const direct = firstPresent([
    payload.selectedLayerIndices,
    valueAtPath(payload, "comp.selectedLayerIndices"),
    valueAtPath(payload, "activeComp.selectedLayerIndices")
  ]);
  if (Array.isArray(direct)) return direct;

  const selectedLayers = firstPresent([
    payload.selectedLayers,
    valueAtPath(payload, "comp.selectedLayers"),
    valueAtPath(payload, "activeComp.selectedLayers")
  ]);
  if (Array.isArray(selectedLayers)) {
    return selectedLayers
      .map((layer) => layer && (layer.index || layer.layerIndex))
      .filter((value) => Number.isFinite(Number(value)) && Number(value) >= 1)
      .map((value) => Math.floor(Number(value)));
  }

  return undefined;
}

function selectedPrecompLayerIndicesFromPayload(payload) {
  if (!payload || typeof payload !== "object") return undefined;
  const selectedLayers = firstPresent([
    payload.selectedLayers,
    valueAtPath(payload, "comp.selectedLayers"),
    valueAtPath(payload, "activeComp.selectedLayers")
  ]);
  if (!Array.isArray(selectedLayers)) return undefined;

  const indices = [];
  for (const layer of selectedLayers) {
    if (!sourceCompRefFromLayer(layer)) continue;
    const index = positiveIntegerBindingValue(layer && (layer.index || layer.layerIndex));
    if (index) indices.push(index);
  }
  return uniquePositiveIntegerList(indices);
}

function isCompIndexBindingName(lower) {
  return [
    "compitemindex",
    "compositionitemindex",
    "activecompitemindex",
    "activecompositionitemindex",
    "markercompitemindex",
    "maskcompitemindex",
    "cameracompitemindex"
  ].includes(lower);
}

function isFolderIndexBindingName(lower) {
  return [
    "folderitemindex",
    "targetfolderitemindex",
    "folderindex",
    "targetfolderindex"
  ].includes(lower);
}

function isCompNameBindingName(lower) {
  return [
    "compname",
    "compositionname",
    "activecompname",
    "activecompositionname"
  ].includes(lower);
}

function isItemIndexBindingName(lower) {
  return [
    "itemindex",
    "projectitemindex"
  ].includes(lower);
}

function isItemIndicesBindingName(lower) {
  return [
    "itemindices",
    "itemindexes",
    "projectitemindices",
    "projectitemindexes"
  ].includes(lower);
}

function isItemNameBindingName(lower) {
  return [
    "itemname",
    "projectitemname"
  ].includes(lower);
}

function isLayerIndexBindingName(lower) {
  return [
    "layerindex",
    "selectedlayerindex"
  ].includes(lower);
}

function isSelectedLayerIndexBindingName(lower) {
  return [
    "selectedlayerindex"
  ].includes(lower);
}

function isSelectedLayerIndicesBindingName(lower) {
  return [
    "selectedlayerindices",
    "selectedlayerindexes",
    "selectedlayers"
  ].includes(lower);
}

function isSelectedPrecompLayerIndexBindingName(lower) {
  return [
    "selectedprecomplayerindex",
    "selectedsourcecomplayerindex",
    "selectedsourcelayerindex",
    "precomplayerindex"
  ].includes(lower);
}

function isSelectedPrecompLayerIndicesBindingName(lower) {
  return [
    "selectedprecomplayerindices",
    "selectedprecomplayerindexes",
    "selectedsourcecomplayerindices",
    "selectedsourcecomplayerindexes",
    "selectedsourcelayerindices",
    "selectedsourcelayerindexes",
    "precomplayerindices",
    "precomplayerindexes"
  ].includes(lower);
}

function isLayerNameBindingName(lower) {
  return [
    "layername",
    "selectedlayername"
  ].includes(lower);
}

function isSelectedSourceCompBindingName(lower) {
  return [
    "selectedsourcecompitemindex",
    "selectedsourceitemindex",
    "selectedlayersourceitemindex",
    "selectedlayercompitemindex",
    "selectedprecompitemindex",
    "selectedprecompcompitemindex",
    "precompitemindex",
    "precompcompitemindex",
    "selectedsourcecompname",
    "selectedsourcename",
    "selectedlayersourcename",
    "selectedprecompname",
    "precompname"
  ].includes(lower);
}

function isSelectedSourceCompIndicesBindingName(lower) {
  return [
    "selectedsourcecompitemindices",
    "selectedsourcecompitemindexes",
    "selectedsourceitemindices",
    "selectedsourceitemindexes",
    "selectedlayersourceitemindices",
    "selectedlayersourceitemindexes",
    "selectedprecompitemindices",
    "selectedprecompitemindexes",
    "precompitemindices",
    "precompitemindexes",
    "sourceitemindices",
    "sourceitemindexes"
  ].includes(lower);
}

function findBindingValueInExecutedSteps(executedSteps, resolver) {
  for (let index = executedSteps.length - 1; index >= 0; index -= 1) {
    const value = resolver(executedSteps[index].payload);
    if (Array.isArray(value) && value.length) return value;
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function planStepText(step) {
  return String([
    step && step.title,
    step && step.intent,
    step && step.summary
  ].filter(Boolean).join(" ")).toLowerCase();
}

function shouldPreferSelectedSourceCompBinding(step, lower, targetField) {
  if (targetField !== "compItemIndex" && targetField !== "itemIndex") return false;
  if (!isCompIndexBindingName(lower) && !isItemIndexBindingName(lower)) return false;
  if (!step || step.tool !== "duplicate_comp") return false;
  return /\b(precomp|pre-comp|source|selected)\b/.test(planStepText(step));
}

function fitBindingValueToTargetField(value, targetField) {
  if (!Array.isArray(value)) return value;
  if ([
    "compItemIndex",
    "itemIndex",
    "sourceItemIndex",
    "layerIndex",
    "renderQueueItemIndex"
  ].includes(targetField)) {
    return value[0];
  }
  return value;
}

function resolveNamedPlanBinding(name, executedSteps, targetField, step) {
  const normalized = String(name || "").trim();
  const lower = normalized.toLowerCase();

  if (lower === "selectedlayerindices" || lower === "selectedlayers") {
    return findBindingValueInExecutedSteps(executedSteps, selectedLayerIndicesFromPayload);
  }
  if (lower === "selectedlayerindex") {
    const indices = findBindingValueInExecutedSteps(executedSteps, selectedLayerIndicesFromPayload);
    return Array.isArray(indices) ? indices[0] : indices;
  }
  if (isSelectedPrecompLayerIndicesBindingName(lower)) {
    const value = findBindingValueInExecutedSteps(executedSteps, selectedPrecompLayerIndicesFromPayload);
    return fitBindingValueToTargetField(value, targetField);
  }
  if (isSelectedPrecompLayerIndexBindingName(lower)) {
    const indices = findBindingValueInExecutedSteps(executedSteps, selectedPrecompLayerIndicesFromPayload);
    return Array.isArray(indices) ? indices[0] : indices;
  }
  if (isSelectedSourceCompIndicesBindingName(lower)) {
    const value = findBindingValueInExecutedSteps(executedSteps, selectedSourceCompIndicesFromPayload);
    return fitBindingValueToTargetField(value, targetField);
  }
  if (isSelectedSourceCompBindingName(lower) || shouldPreferSelectedSourceCompBinding(step, lower, targetField)) {
    return findBindingValueInExecutedSteps(executedSteps, (payload) => selectedSourceCompBindingValue(payload, targetField));
  }
  if (isItemIndicesBindingName(lower)) {
    const value = findBindingValueInExecutedSteps(executedSteps, (payload) => (
      selectedSourceCompIndicesFromPayload(payload) || projectItemIndicesFromPayload(payload)
    ));
    return fitBindingValueToTargetField(value, targetField);
  }
  if (isFolderIndexBindingName(lower)) {
    return findBindingValueInExecutedSteps(executedSteps, (payload) => defaultPlanBindingValue(payload, "folderItemIndex"));
  }
  if (isCompIndexBindingName(lower)) {
    return findBindingValueInExecutedSteps(executedSteps, (payload) => defaultPlanBindingValue(payload, "compItemIndex"));
  }
  if (isCompNameBindingName(lower)) {
    return findBindingValueInExecutedSteps(executedSteps, (payload) => defaultPlanBindingValue(payload, "compName"));
  }
  if (isItemIndexBindingName(lower)) {
    return findBindingValueInExecutedSteps(executedSteps, (payload) => defaultPlanBindingValue(payload, "itemIndex"));
  }
  if (isItemNameBindingName(lower)) {
    return findBindingValueInExecutedSteps(executedSteps, (payload) => defaultPlanBindingValue(payload, "itemName"));
  }
  if (isLayerIndexBindingName(lower)) {
    return findBindingValueInExecutedSteps(executedSteps, (payload) => defaultPlanBindingValue(payload, "layerIndex"));
  }
  if (isLayerNameBindingName(lower)) {
    return findBindingValueInExecutedSteps(executedSteps, (payload) => defaultPlanBindingValue(payload, "layerName"));
  }

  return findBindingValueInExecutedSteps(executedSteps, (payload) => {
    if (!payload || typeof payload !== "object") return undefined;
    return valueAtPath(payload, normalized);
  });
}

function resolvePlanBinding(binding, executedSteps, targetField, step) {
  const expression = String(binding || "").trim();
  const template = /^\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}$/.exec(expression);
  if (template) {
    const inner = template[1].trim();
    if (isPlanBindingExpression(inner)) {
      return resolvePlanBinding(inner, executedSteps, targetField, step);
    }
    return resolveNamedPlanBinding(inner, executedSteps, targetField, step);
  }
  const match = /^steps\.(\d+)\.(.+)$/.exec(expression);
  if (match) {
    const index = Number(match[1]) - 1;
    const rest = match[2].replace(/^result\./, "");
    const step = executedSteps[index];
    if (!step) return undefined;
    if (!rest || rest === "result") return defaultPlanBindingValue(step.payload, targetField);
    return valueAtPath(step.payload, rest);
  }
  if (expression.indexOf("previous.") === 0 && executedSteps.length) {
    return valueAtPath(executedSteps[executedSteps.length - 1].payload, expression.slice("previous.".length));
  }
  const shorthand = /^step-(\d+)-result(?:\.(.+))?$/.exec(expression);
  if (shorthand) {
    const index = Number(shorthand[1]) - 1;
    const step = executedSteps[index];
    if (!step) return undefined;
    if (shorthand[2]) return valueAtPath(step.payload, shorthand[2]);
    return defaultPlanBindingValue(step.payload, targetField);
  }
  return undefined;
}

function canonicalPlanArgField(field, schemaProperties) {
  const original = String(field || "");
  if (!schemaProperties || hasArg(schemaProperties, original)) return original;

  const aliases = {
    markercompitemindex: ["compItemIndex"],
    maskcompitemindex: ["compItemIndex"],
    cameracompitemindex: ["compItemIndex"],
    folderindex: ["targetFolderItemIndex", "folderItemIndex"],
    folderitemindex: ["targetFolderItemIndex", "folderItemIndex"],
    targetfolderindex: ["targetFolderItemIndex"],
    targetfolderitemindex: ["targetFolderItemIndex"],
    itemindex: ["itemIndices"],
    itemindexes: ["itemIndices"],
    projectitemindex: ["itemIndices"],
    projectitemindexes: ["itemIndices"],
    projectitemindices: ["itemIndices"],
    selectedprecompitemindex: ["itemIndices"],
    selectedprecompitemindexes: ["itemIndices"],
    selectedprecompitemindices: ["itemIndices"],
    sourceitemindex: ["itemIndices"],
    sourceitemindexes: ["itemIndices"],
    sourceitemindices: ["itemIndices"],
    itemtype: ["type", "itemType"],
    projectitemtype: ["type", "itemType"],
    layerindex: ["layerIndices"],
    layerindexes: ["layerIndices"],
    selectedlayerindex: ["layerIndices"],
    selectedlayerindexes: ["layerIndices"],
    selectedlayerindices: ["layerIndices"]
  };
  const candidates = aliases[original.toLowerCase()] || [];
  for (const candidate of candidates) {
    if (hasArg(schemaProperties, candidate)) return candidate;
  }
  return original;
}

function isBooleanLiteralString(value) {
  if (typeof value !== "string") return false;
  return ["true", "1", "yes", "on", "false", "0", "no", "off"].includes(value.trim().toLowerCase());
}

function normalizeProjectItemType(value) {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (["comp", "comps", "composition", "compositions", "compositionitem", "compitem"].includes(normalized)) return "comp";
  if (["footage", "footageitem", "footages"].includes(normalized)) return "footage";
  if (["folder", "folders", "folderitem"].includes(normalized)) return "folder";
  return value;
}

function normalizePlanArgAliases(args, tool) {
  const schemaProperties = tool && tool.inputSchema && tool.inputSchema.properties && typeof tool.inputSchema.properties === "object"
    ? tool.inputSchema.properties
    : null;
  if (!schemaProperties) return { ...(args || {}) };

  const normalized = { ...(args || {}) };
  for (const field of Object.keys(normalized)) {
    const canonical = canonicalPlanArgField(field, schemaProperties);
    if (canonical === field) continue;
    if (!hasArg(normalized, canonical) || missingPlanBindingValue(normalized[canonical])) {
      normalized[canonical] = normalized[field];
    }
    delete normalized[field];
  }
  if (tool && tool.name === "find_project_items" && typeof normalized.exactName === "string" && !isBooleanLiteralString(normalized.exactName)) {
    const query = normalized.exactName.trim();
    if (query && (!hasArg(normalized, "query") || missingPlanBindingValue(normalized.query))) {
      normalized.query = query;
    }
    normalized.exactName = true;
  }
  if (hasArg(normalized, "type")) {
    normalized.type = normalizeProjectItemType(normalized.type);
  }
  if (hasArg(normalized, "itemType")) {
    normalized.itemType = normalizeProjectItemType(normalized.itemType);
  }
  return normalized;
}

function missingPlanBindingValue(value) {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

function runtimeBindingResolutionHint(expression, field) {
  const template = /^\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}$/.exec(String(expression || "").trim());
  if (!template) return String(field || "");

  const name = template[1].trim();
  const lower = name.toLowerCase();
  if (isSelectedPrecompLayerIndexBindingName(lower) || isSelectedPrecompLayerIndicesBindingName(lower)) {
    return `${field} (${name}: no selected precomp layer was found in prior inspection results)`;
  }
  if (isSelectedSourceCompBindingName(lower) || isSelectedSourceCompIndicesBindingName(lower)) {
    return `${field} (${name}: no selected precomp source comp was found in prior inspection results)`;
  }
  if (isSelectedLayerIndexBindingName(lower) || isSelectedLayerIndicesBindingName(lower)) {
    return `${field} (${name}: no selected layer was found in prior inspection results)`;
  }
  return `${field} (${name})`;
}

function formatUnresolvedRuntimeBindings(bound) {
  const details = bound && Array.isArray(bound.unresolvedDetails) && bound.unresolvedDetails.length
    ? bound.unresolvedDetails
    : bound.unresolved;
  return (details || []).join(", ");
}

function applyPlanRuntimeBindings(step, executedSteps) {
  const tool = toolByName(step.tool);
  const args = normalizePlanArgAliases(step.safeArgs || {}, tool);
  const bindings = step.resultBindings || {};
  const schemaProperties = tool && tool.inputSchema && tool.inputSchema.properties && typeof tool.inputSchema.properties === "object"
    ? tool.inputSchema.properties
    : null;
  const unresolved = [];
  const unresolvedDetails = [];
  for (const field of Object.keys(args)) {
    if (!isPlanBindingExpression(args[field])) continue;
    const value = resolvePlanBinding(args[field], executedSteps, field, step);
    if (missingPlanBindingValue(value)) {
      unresolved.push(field);
      unresolvedDetails.push(runtimeBindingResolutionHint(args[field], field));
    } else {
      args[field] = value;
    }
  }
  for (const field of Object.keys(bindings)) {
    const canonicalField = canonicalPlanArgField(field, schemaProperties);
    if (hasArg(args, canonicalField) && args[canonicalField] !== null && args[canonicalField] !== undefined && args[canonicalField] !== "") {
      continue;
    }
    if (schemaProperties && !hasArg(schemaProperties, canonicalField)) {
      continue;
    }
    const value = resolvePlanBinding(bindings[field], executedSteps, canonicalField, step);
    if (missingPlanBindingValue(value)) {
      unresolved.push(canonicalField);
      unresolvedDetails.push(runtimeBindingResolutionHint(bindings[field], canonicalField));
    } else {
      args[canonicalField] = value;
    }
  }
  return { args, unresolved, unresolvedDetails };
}

const PLANNING_TOOL_NAMES = [
  ...ameOpenComp.toolDefinitions().map(tool=>tool.name),
  ...ameJobSource.toolDefinitions().map(tool=>tool.name),
  ...ameQueueControl.tools.map(tool => tool.name),
  titleVerification.TOOL,titleVerification.LOOKUP,
  ameFixtureRunner.INSPECT,
  ameFixtureRunner.INSPECT_ATTEMPT,
  ...ameTitleJobs.tools.map(tool => tool.name),
  titleExport.TOOL,
  ameFixtureGrant.TOOL_NAME,
  ameRunning.TOOL_NAME,
  ameTransport.TOOL_NAME,
  amePresets.listAmePresetsTool.name,
  nativeRenderVariant.INSPECT,
  nativeRenderVariant.RENDER,
  ...projectLifecycleContract.MUTATIONS,
  "get_project_lifecycle_state",
  "reconcile_project_lifecycle",
  projectSave.TOOL_NAME,
  "get_bridge_status",
  "wait_for_bridge_state",
  "wait_for_plan_state",
  "ping_ae",
  "get_project_snapshot",
  "get_project_info",
  "get_active_comp",
  "list_comps",
  "list_project_folder_items",
  "list_layers",
  "get_comp_details",
  "get_layer_details",
  "get_property_value",
  "reconcile_plan_run",
  "get_layer_essential_properties",
  "get_essential_graphics_controllers",
  "get_path_geometry",
  "get_selected_layers",
  "get_selected_properties",
  "get_placeholder_protection",
  "propose_placeholder_cover",
  "verify_placeholder_coverage",
  "build_placeholder_visual_review_plan",
  "create_placeholder_review_comps",
  "get_placeholder_review_manifest",
  "reload_montage_material_source",
  "get_montage_source_load_evidence",
  "get_montage_root_render_state",
  "verify_placeholder_visual_review",
  "get_placeholder_usage",
  "check_placeholder_assignments",
  "find_project_items",
  "find_comps",
  "list_effect_presets",
  "list_effects",
  "get_effect_details",
  "get_project_checkpoint_details",
  "checkpoint_project",
  "create_comp",
  "create_project_folder",
  "move_project_items_to_folder",
  "set_project_item_metadata",
  "set_project_frames_count_type",
  "create_text_layer",
  "create_shapes_from_text",
  "import_footage",
  "create_solid_layer",
  "create_null_layer",
  "create_adjustment_layer",
  "create_camera_layer",
  "create_camera_with_controller",
  "toggle_onion_skinning",
  "create_layer_mask",
  "set_layer_mask",
  "set_path_geometry",
  "export_path_points",
  "export_text_to_file",
  "save_comp_frame_png",
  "add_project_item_to_comp",
  "duplicate_layer",
  "duplicate_layers",
  "set_layer_selection",
  "set_layer_parent",
  "set_layer_track_matte",
  "delete_layer",
  "duplicate_comp",
  "deep_duplicate_precomp_sources",
  "add_effect",
  "set_effect_property",
  "set_effect_enabled",
  "set_puppet_pin_type",
  "add_property_to_essential_graphics",
  "set_property_value",
  "set_layer_metadata",
  "set_layer_blending_mode",
  "align_layers_to_time",
  "set_comp_current_time",
  "set_comp_properties",
  "refresh_comp_panel",
  "set_comp_work_area",
  "set_layer_time_range",
  "stagger_layers",
  "split_layers_at_time",
  "precompose_layers",
  "replace_layer_source",
  "rename_layers",
  "rename_project_items",
  "update_text_layer",
  "create_shape_layer",
  "create_layer_connection_line",
  "fit_layer_to_comp",
  "set_property_keyframes",
  "fill_in_keyframes",
  "keyframe_current_value_from_expression",
  "apply_keyframe_ease",
  "set_spatial_in_tangent",
  "set_expression",
  "clear_expression",
  "separate_shape_size_dimensions",
  "add_comp_to_render_queue",
  "set_render_queue_output",
  "get_render_queue_status",
  "set_layer_transform",
  "apply_transform_expression",
  "add_comp_marker",
  "add_layer_marker",
  "update_layer_marker",
  "delete_layer_marker",
  "create_test_comp",
  "cleanup_test_items",
  "run_extendscript",
  "run_extendscript_file",
  "build_slideshow_plan",
  "relink_footage_source",
  "verify_source_recovery_read_back",
  ...slideshowTools.TOOL_NAMES,
  ...montageTools.TOOL_NAMES
];





























function planRunCheckpointFile(run) {
  if (!run || typeof run !== "object") return "";
  if (run.checkpoint && run.checkpoint.checkpointFile) return run.checkpoint.checkpointFile;
  if (run.editSession && run.editSession.checkpoint && run.editSession.checkpoint.checkpointFile) {
    return run.editSession.checkpoint.checkpointFile;
  }
  if (Array.isArray(run.steps)) {
    for (const step of run.steps) {
      if (step && step.result && step.result.checkpoint && step.result.checkpoint.checkpointFile) {
        return step.result.checkpoint.checkpointFile;
      }
      if (step && step.result && step.result.mutation && step.result.mutation.checkpoint && step.result.mutation.checkpoint.checkpointFile) {
        return step.result.mutation.checkpoint.checkpointFile;
      }
    }
  }
  return "";
}

function planRunUndoHint(run) {
  if (!run || !Array.isArray(run.steps)) return "";
  for (const step of run.steps) {
    if (step && step.result && step.result.mutation && step.result.mutation.undoHint) {
      return step.result.mutation.undoHint;
    }
  }
  return "";
}

function planRunRecoveryHint(run) {
  if (!run || run.ok) return null;
  const mutatingExecution = Boolean(run.safety && run.safety.mutatingExecution);
  const checkpointFile = planRunCheckpointFile(run);
  const undoHint = planRunUndoHint(run);
  const safetyStatus = run.safety && run.safety.status ? run.safety.status : "";

  if (run.safety && run.safety.saveProjectFirst) {
    return "No project change was started. Save the After Effects project so a checkpoint can be created, then retry the protected run.";
  }
  if (safetyStatus === "blocked_missing_edit_session") {
    return "No project change was started. Retry through the protected Run plan action, or create a checkpoint/edit session before running mutating steps.";
  }
  if (safetyStatus === "blocked_edit_session_failed") {
    return "No project change was started because edit-session protection could not be prepared. Review the safety error, then retry after the project can be checkpointed.";
  }
  if (checkpointFile) {
    return `A checkpoint is available at ${checkpointFile}. Review the AE project, then restore manually from that checkpoint only if needed.`;
  }
  if (undoHint) {
    return undoHint;
  }
  if (!mutatingExecution) {
    return "No project changes were requested. Review the failed read-only step, adjust the plan, and retry.";
  }
  return "Review the failed step before retrying. If any AE change occurred, use the checkpoint or After Effects Undo path listed in the step details.";
}

function planRunFailedStep(run) {
  const steps = run && Array.isArray(run.steps) ? run.steps : [];
  return steps.find((step) => step && (step.status === "failed" || step.status === "blocked")) || null;
}

function m100PlanRunFailurePhase(run) {
  if (!run) return "protocol_validation";
  const status = run.safety && run.safety.status || "";
  if (status === "blocked_m100_confirmation_required" || status === "blocked_m100_confirmation_failed") {
    return "confirmation_validation";
  }
  if (status === "blocked_edit_session_failed" || status === "blocked_save_project_first" || status === "blocked_missing_edit_session") {
    return "ae_queue";
  }
  if (run.validation && run.validation.ok === false) return "protocol_validation";
  const failedStep = planRunFailedStep(run);
  if (failedStep && failedStep.result && failedStep.result.phase) {
    return m100Protocol.normalizeDiagnosticPhase(failedStep.result.phase, "ae_execution");
  }
  if (failedStep && failedStep.result && failedStep.result.code === "ae_result_parse_failed") return "ae_result_parse";
  if (failedStep && (failedStep.error || failedStep.isError)) return "ae_execution";
  return run.errorCode && /m100_|confirmation|proposal/.test(run.errorCode) ? "confirmation_validation" : "protocol_validation";
}

function m100PlanRunFailureCode(run) {
  if (!run) return "plan_run_failed";
  if (run.errorCode) return run.errorCode;
  const status = run.safety && run.safety.status || "";
  if (status) return status;
  const failedStep = planRunFailedStep(run);
  if (failedStep && failedStep.result && failedStep.result.code) return failedStep.result.code;
  if (failedStep && failedStep.status === "blocked") return "plan_step_blocked";
  if (failedStep && failedStep.status === "failed") return "plan_step_failed";
  return "plan_run_failed";
}

function m100PlanRunRawPreview(run) {
  const failedStep = planRunFailedStep(run);
  if (failedStep && failedStep.result && Object.prototype.hasOwnProperty.call(failedStep.result, "rawPreview")) {
    return failedStep.result.rawPreview;
  }
  if (failedStep && failedStep.error) return failedStep.error;
  if (run && run.safety && run.safety.error) return run.safety.error;
  return undefined;
}

function attachM100PlanRunDiagnostic(run, options) {
  if (!run || run.ok) return run;
  const diagnostic = m100Protocol.createUserDiagnostic({
    phase: m100PlanRunFailurePhase(run),
    code: m100PlanRunFailureCode(run),
    message: run.error || "Agent plan run failed.",
    requestId: options && options.requestId,
    actionId: options && options._m100ActionProposal && options._m100ActionProposal.actionId,
    executionId: run.id,
    rawPreview: m100PlanRunRawPreview(run),
    logRef: LOG_FILE
  });
  run.diagnostic = diagnostic;
  run.error = diagnostic.message;
  if (!run.errorCode) run.errorCode = diagnostic.code;
  if (!run.m100Message) {
    run.m100Message = m100Protocol.createErrorEnvelope({
      requestId: diagnostic.requestId || "",
      actionId: diagnostic.actionId,
      executionId: diagnostic.executionId,
      phase: diagnostic.phase,
      code: diagnostic.code,
      error: diagnostic.message,
      rawPreview: diagnostic.rawPreview,
      logs: [
        {
          phase: diagnostic.phase,
          level: "error",
          message: diagnostic.message,
          logRef: diagnostic.logRef
        }
      ]
    });
  }
  return run;
}













































































function rawExtendscriptStepCount(validation) {
  const classificationCount = Number(validation && validation.classification && validation.classification.rawExtendscriptStepCount || 0);
  if (classificationCount > 0) return classificationCount;
  return Array.isArray(validation && validation.steps)
    ? validation.steps.filter((step) => step && (step.tool === "run_extendscript" || step.tool === "run_extendscript_file")).length
    : 0;
}



function planDryRunApprovalKey(plan, requestId) {
  const hash = crypto.createHash("sha256");
  hash.update(String(requestId || ""));
  hash.update("\n");
  hash.update(JSON.stringify(plan || {}));
  return hash.digest("hex");
}

function pruneRawExtendscriptDryRunApprovals(now = Date.now()) {
  for (const [key, approval] of rawExtendscriptDryRunApprovals.entries()) {
    if (!approval || Number(approval.expiresAtMs || 0) <= now) {
      rawExtendscriptDryRunApprovals.delete(key);
    }
  }
}

function recordRawExtendscriptDryRunApproval(run, plan, requestId, validation) {
  if (!run || !run.id || !validation || rawExtendscriptStepCount(validation) <= 0) return null;
  const now = Date.now();
  pruneRawExtendscriptDryRunApprovals(now);
  const approval = {
    key: planDryRunApprovalKey(plan, requestId),
    dryRunId: run.id,
    requestId: requestId || null,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + RAW_EXTENDSCRIPT_DRY_RUN_APPROVAL_TTL_MS).toISOString(),
    expiresAtMs: now + RAW_EXTENDSCRIPT_DRY_RUN_APPROVAL_TTL_MS
  };
  rawExtendscriptDryRunApprovals.set(approval.key, approval);
  return approval;
}

function rawExtendscriptRunApproval(validation, plan, requestId, dryRunId, allowRawExtendscript) {
  const classification = validation && validation.classification ? validation.classification : null;
  if (!classification || classification.blocksRun !== true) return { ok: true, approval: null };
  if (rawExtendscriptStepCount(validation) <= 0 || classification.allowsDryRun === false) {
    return { ok: false, error: classification.runRecommendation || "Plan classification blocks run." };
  }
  if (!allowRawExtendscript) {
    return { ok: false, error: "Raw ExtendScript requires allowRawExtendscript:true after a successful dry run." };
  }
  const key = planDryRunApprovalKey(plan, requestId);
  pruneRawExtendscriptDryRunApprovals();
  const approval = rawExtendscriptDryRunApprovals.get(key);
  if (!approval || approval.dryRunId !== dryRunId) {
    return { ok: false, error: "Run raw ExtendScript only after a successful dry run of the same current plan." };
  }
  return { ok: true, approval };
}

function hardcoreRunNeedsReconciliation(run) {
  if(!run || run.dryRun) return false;
  if(run.outcome && run.outcome.mutation && run.outcome.mutation.status==="not_started") return false;
  const mutating=run.validation && run.validation.mutatingCount>0 || (run.steps || []).some(step=>step.mutatesProject);
  return Boolean(mutating && (!run.ok || !run.semanticVerification || run.semanticVerification.status!=="passed" || run.semanticVerification.unverifiedMutationCount>0));
}

async function runValidatedAgentPlan(options, executionContext) {
  return evidenceContext.run({runId: crypto.randomUUID(), requestId: options && options.requestId || null},
    () => runValidatedAgentPlanWithEvidence(options, executionContext));
}

function runValidatedAgentPlanWithEvidence(options, executionContext) {
  return ownedRuntimeService.run("execution",()=>runValidatedAgentPlanWithEvidenceImpl(options,executionContext));
}
async function runValidatedAgentPlanWithEvidenceImpl(options, executionContext) {
  const responseView = planRunResponse.assertValidResponseView(options && options.responseView);
  options = resolveM100PlanRunOptions(options || {});
  assertCoreMigrationOperation(captureCoreMigrationOperation("plan.run",{plan:options.plan,requestId:options.requestId,actionId:options._m100ActionRecord?.actionId},options.dryRun!==false));
  const autonomous = executionContext && executionContext.autonomousSession
    && executionContext.autonomousSession.authorized === true
    ? executionContext.autonomousSession
    : null;
  if (autonomous) {
    options = {
      ...options,
      confirm: true,
      allowMutations: true,
      autoEditSession: true,
      _m100AutonomousSession: autonomous
    };
  }
  const prepared = validateAgentPlanWithRepair(options.plan, options.requestId || null, {
    solutionHints: options.solutionHints || options.planSolutionHints || null,
    projectIntentMemory: options.projectIntentMemory || options.planProjectIntentMemory || null
  }, {
    repairPlan: options._m100ActionRecord ? false : options.repairPlan
  });
  const validation = prepared.validation;
  const dryRun = optionalBoolean(options, "dryRun", true);
  const lifecycleStep = validation.ok ? lifecycle.planStep(prepared.plan) : null;
  const lifecycleCompletion = lifecycleStep && projectLifecycleContract.isLifecycleCompletion(lifecycleStep.name);
  // Exact validated names, never a caller protection/checkpoint bypass flag.
  const boundedPropertyJournal = validation.ok && validation.steps.length===1 && ameOpenComp.MUTATIONS.includes(validation.steps[0].tool);
  let lifecycleAuthorization = null;
  const confirm = optionalBoolean(options, "confirm", false);
  const allowMutations = optionalBoolean(options, "allowMutations", false);
  const autoEditSession = optionalBoolean(options, "autoEditSession", false);
  const allowRuntimeBindings = optionalBoolean(options, "allowRuntimeBindings", true);
  const allowWithoutCheckpoint = optionalBoolean(options, "allowWithoutCheckpoint", false);
  const allowRawExtendscript = optionalBoolean(options, "allowRawExtendscript", false);
  const rawExtendscriptDryRunId = optionalString(options, "rawExtendscriptDryRunId", "");
  const stopOnError = autonomous ? true : optionalBoolean(options, "stopOnError", true);
  // Trusted internal diagnostics, never derived from request options. The same
  // predicate governs scope and whether mutation read-back is required.
  const internalReadOnly = Boolean(autonomous && executionContext.hardcoreReadOnly === true
    && m100RiskForAgentPlan(prepared.plan, validation).level === "read_only"
    && validation.mutatingCount === 0 && rawExtendscriptStepCount(validation) === 0
    && options._m100ActionRecord && options._m100ActionRecord.riskLevel === "read_only");
  const maxSteps = Math.max(1, Math.min(50, Math.floor(optionalNumber(options, "maxSteps", 20))));
  const mutatingExecution = !dryRun && validation.mutatingCount > 0;
  const checkpointStepPresent = hasCheckpointStep(validation);
  const activeEditSessionAtStart = Boolean(activeEditSession);
  let seriesArgs = null, seriesSession = null, createdSeriesSession = null, seriesActor = null;
  let ameFixturePrimaryBaseline = null;

  const actionBinding = options._m100ActionRecord;
  const expectedProject = actionBinding && actionBinding.project.expectedFile || prepared.plan.targetProject && prepared.plan.targetProject.file || null;
  const provenance = {schema: "ae-agent-run-provenance.v1", actionId: actionBinding && actionBinding.actionId || null,
    payloadHash: actionBinding && actionBinding.payloadHash || null,
    proposalRevision: actionBinding && actionBinding.revision || null,
    projectId: expectedProject ? reviewEvidence.sha256(require("./proposal-state").normalizeProject(expectedProject)) : null,
    projectRevision: null, projectRevisionReason: "in_memory_revision_not_observed",
    planSha256: reviewEvidence.sha256(prepared.plan), runtime: RUNTIME_IDENTITY};
  Object.assign(evidenceContext.getStore(), {actionId: provenance.actionId, proposalRevision: provenance.proposalRevision,
    projectId: provenance.projectId, planSha256: provenance.planSha256});
  const run = {
    id: evidenceContext.getStore().runId,
    provenance,
    startedAt: new Date().toISOString(),
    dryRun,
    confirm,
    allowMutations,
    autoEditSession,
    validation,
    classification: validation.classification || null,
    planRepair: prepared.repair || null,
    executedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    steps: [],
    safety: {
      mutatingExecution,
      checkpointStepPresent,
      activeEditSessionAtStart,
      autoEditSession,
      allowWithoutCheckpoint,
      allowRawExtendscript,
      autonomousSession: autonomous ? {
        capability: autonomous.capability,
        expiresAt: autonomous.expiresAt
      } : null,
      protection: activeEditSessionAtStart
        ? "active_edit_session"
        : checkpointStepPresent
          ? "planned_checkpoint_step"
          : null
    }
  };
  const runRecord = {schema:"ae-agent-plan-run-record.v1",runId:run.id,createdAt:run.startedAt,
    plan:prepared.plan,project:{file:expectedProject},run,
    recordContext:planRunRecords.recordContext(options.recordContext,{runId:run.id,projectFile:expectedProject})};
  const persistRun = (item, isFinal = false) => {
    if (!isFinal && (run.dryRun || validation.mutatingCount === 0)) return;
    runRecord.project = {file:run.project && (run.project.expectedFile || run.project.actualFile) || expectedProject};
    runRecord.recordContext.project.file = runRecord.project.file;
    runRecord.run = item && !run.steps.includes(item) ? {...run,steps:[...run.steps,item]} : run;
    planRunRecords.writeRecord(LOG_DIR,runRecord);
  };
  if (!dryRun && lifecycleStep && (autonomous || allowWithoutCheckpoint)) {
    run.ok=false; run.errorCode=autonomous ? "lifecycle_manual_only" : "lifecycle_checkpoint_bypass_forbidden";
    run.error="Project lifecycle requires manual CEP authority and its mandatory source checkpoint."; return finishRun();
  }
  if (lifecycleStep && !options._m100ActionRecord) {
    run.ok=false; run.errorCode="lifecycle_proposal_required"; run.error="A current server-owned lifecycle proposal is required."; return finishRun();
  }
  if (lifecycleStep && !lifecycleCompletion && activeEditSessionAtStart) {
    run.ok=false; run.errorCode="lifecycle_foreign_edit_session"; run.error="Close the existing edit session before this lifecycle run."; return finishRun();
  }
  if(boundedPropertyJournal && activeEditSessionAtStart){run.ok=false;run.errorCode="ame_open_foreign_edit_session";run.error="Finish the existing edit session before the isolated open-comp journal operation.";return finishRun();}
  if(validation.steps.some((step)=>step.tool===projectSave.TOOL_NAME)&&allowWithoutCheckpoint){
    run.ok=false;run.errorCode="project_save_checkpoint_bypass_forbidden";run.error="Named-project save requires its mandatory checkpoint.";return finishRun();
  }
  if (mutatingExecution && allowWithoutCheckpoint) {
    run.ok = false; run.errorCode = "checkpoint_bypass_forbidden"; run.error = "Mutating runs require a project-matched checkpoint."; return finishRun();
  }
  if (activeEditSessionAtStart) {
    run.editSession = compactEditSession(activeEditSession);
  }
  if (prepared.repair && prepared.repair.applied) {
    run.repairedPlan = prepared.plan;
  }

  async function finishRun() {
    run.finishedAt = new Date().toISOString();
    if (typeof run.ok !== "boolean") {
      run.ok = run.failedCount === 0 && !run.steps.some((step) => step.status === "blocked");
    }
    if (!dryRun && seriesSession && activeEditSession === seriesSession) {
      const state = ameTitleSeries.finish(seriesSession, seriesArgs, run.id, amePending.isPendingRun(run));
      run.ameTitleSeries = {...run.ameTitleSeries,...state};
      if (state.close && state.owned) {
        const finished = finishPlanRunEditSession(run, seriesSession.id);
        if (finished) {run.editSessionFinished=finished.session;run.safety.editSessionFinished=true;}
      }
      seriesSession = null;
      createdSeriesSession = null;
    }
    if (!dryRun && createdSeriesSession && activeEditSession === createdSeriesSession) {
      const finished=finishPlanRunEditSession(run,createdSeriesSession.id);
      if(finished){run.editSessionFinished=finished.session;run.safety.editSessionFinished=true;}
      createdSeriesSession=null;
    }
    if (!run.dryRun && validation.mutatingCount > 0 && !run.semanticVerification) {
      run.semanticVerification = buildServerSemanticVerification(prepared.plan, run);
    }
    if (autonomous && !internalReadOnly && !run.dryRun && run.ok && (!run.semanticVerification || run.semanticVerification.status !== "passed" || run.semanticVerification.unverifiedMutationCount > 0)) {
      run.ok = false;
      run.errorCode = "verification_required";
      run.error = "Автономное выполнение требует подтверждённого read-back каждой операции.";
      if (run.semanticVerification) run.semanticVerification = {...run.semanticVerification, status: "needs_review", ok: false};
    }
    if (!run.dryRun && run.solutionPlanReadBack === undefined) {
      run.solutionPlanReadBack = verifySolutionPlanReadBack(prepared.plan, run);
      if (run.solutionPlanReadBack && run.solutionPlanReadBack.status !== "passed") run.ok = false;
    }
    
    if (run.dryRun && run.ok) {
      const approval = recordRawExtendscriptDryRunApproval(run, prepared.plan, options.requestId || null, validation);
      if (approval) {
        run.safety.rawExtendscriptGate = {
          status: "dry-run-approved",
          dryRunId: approval.dryRunId,
          expiresAt: approval.expiresAt
        };
      }
    }
    if (!run.ok && !amePending.isPendingRun(run) && !run.recoveryHint) {
      run.recoveryHint = planRunRecoveryHint(run);
    }
    if (options._m100ActionProposal) {
      const actionRecord = options._m100ActionRecord || null;
      if (actionRecord && run.dryRun && run.ok && actionRecord === currentProposalState.current && actionRecord.executionState === "pending") {
        actionRecord.dryRunCompletedAt = run.finishedAt;
        actionRecord.dryRunReceipt = {payloadHash: actionRecord.payloadHash, contractVersion: AUTONOMY_CONTRACT_VERSION,
          stepCount: validation.steps.length, projectFile: actionRecord.project.expectedFile};
        if (validation.steps.length === 1 && validation.steps[0].tool === ameTitleJobs.START && validation.steps[0].safeArgs?.manualQueueMode === "cep_user_declaration_v2") {
          actionRecord.dryRunReceipt.runId = run.id; actionRecord.dryRunReceipt.previewHash = actionRecord.previewHash;
        }
      }
      run.m100Action = {
        actionId: options._m100ActionProposal.actionId,
        payloadRef: options._m100PayloadRef || options._m100ActionProposal.action.payloadRef,
        payloadHash: options._m100ActionProposal.action.payloadHash,
        previewHash: options._m100ActionProposal.action.previewHash,
        riskLevel: options._m100ActionProposal.risk && options._m100ActionProposal.risk.level || null,
        riskPolicyVersion: options._m100ActionProposal.confirmation.riskPolicyVersion,
        proposalExpiresAt: options._m100ActionProposal.confirmation.proposalExpiresAt,
        confirmationState: actionRecord ? m100ActionRecordState(actionRecord) : "resolved",
        confirmedAt: actionRecord && actionRecord.confirmedAt || null,
        confirmedBySurface: actionRecord && actionRecord.confirmedBySurface || null,
        confirmedBySession: actionRecord && actionRecord.confirmedBySession || null
      };
      run.m100Message = m100Protocol.createActionResultEnvelope(amePending.actionOptions({
        ok: run.ok,
        requestId: options.requestId || options._m100ActionProposal.requestId,
        actionId: options._m100ActionProposal.actionId,
        executionId: run.id,
        summary: amePending.isPendingRun(run)?"AME dispatch recorded; native acceptance pending. Use exact own STATUS; do not replay.":run.ok ? "Agent plan run finished." : run.error || "Agent plan run failed.",
        error: run.error || "Agent plan run failed.",
        phase: run.ok ? "ae_execution" : m100PlanRunFailurePhase(run),
        code: run.ok ? undefined : m100PlanRunFailureCode(run),
        rawPreview: run.ok ? undefined : m100PlanRunRawPreview(run)
      },run));
    }
    if(!amePending.isPendingRun(run))attachM100PlanRunDiagnostic(run, options);
    run.outcome = buildRunOutcome(run, prepared.plan);
    recordEvent("solution_plan_run_finished", { requestId: options.requestId || null, outcome: run.outcome,
      provenance: {...provenance, runtime: {gitCommit: RUNTIME_IDENTITY.gitCommit, sourceSha256: RUNTIME_IDENTITY.sourceSha256}} });
    const diagnostic = obstacleEvent({operation: "run_ai_agent_plan", proposalId: options._m100ActionRecord && options._m100ActionRecord.actionId,
      runId: run.id, code: run.errorCode || (amePending.isPendingRun(run)?"async_acceptance_pending":run.ok ? "ok" : "plan_failed"), phase: dryRun ? "dry_run" : "execution",
      durationMs: Date.parse(run.finishedAt) - Date.parse(run.startedAt), successfulSteps: run.executedCount,
      failedSteps: run.failedCount, verification: run.solutionPlanReadBack && run.solutionPlanReadBack.status || run.semanticVerification && run.semanticVerification.status});
    try { fs.appendFileSync(path.join(LOG_DIR, "autonomy-obstacles.jsonl"), JSON.stringify(diagnostic) + "\n", "utf8"); }
    catch (_telemetryError) { run.telemetryWarning = "autonomy_obstacle_log_unavailable"; }
    const ownsRecord = options._m100ActionRecord && options._m100ActionRecord === currentProposalState.current &&
      (!options._m100ActionRecord.executionId || options._m100ActionRecord.executionId === run.id);
    if (ownsRecord) {
      run.repairDirective = autonomousRepair.directive(options._m100ActionRecord, run);
      options._m100ActionRecord.repairDirective = run.repairDirective;
    }
    const lastRunSummary = {
      id: run.id, ok: run.ok, dryRun: run.dryRun, errorCode: diagnostic.code,
      error: run.error ? m100Protocol.redactForUserDiagnostic(run.error, 600) : null, durationMs: diagnostic.durationMs, executedCount: run.executedCount,
      failedCount: run.failedCount, verification: diagnostic.verification,pending:amePending.isPendingRun(run)
    };
    if (ownsRecord && run.m100Action && !run.dryRun && options._m100ActionRecord.executionState === "executing") {
      // Final run evidence may describe the result before observer publication;
      // the proposal remains executing until its current summary is ready.
      run.m100Action.confirmationState = run.ok||amePending.isPendingRun(run) ? "completed" : "failed";
    }
    try { persistRun(null, true); } catch (_error) { run.recordWarning="run_record_update_failed"; }
    if (currentProposalState.publishRunResult(options._m100ActionRecord, run, lastRunSummary) && run.m100Action) {
      run.m100Action.confirmationState = m100ActionRecordState(options._m100ActionRecord);
    }
    if(!dryRun && prepared.plan.steps?.length===1 && prepared.plan.steps[0].tool===ameFixtureGrant.TOOL_NAME && !run.recordWarning){
      try{await ameFixtureExecutor.flushCleanup(run.id);}catch(error){recordEvent("owned_fixture_cleanup_pending",{runId:run.id,code:error.code || "owned_fixture_cleanup_pending",historicalOutcome:"unknown",replayAllowed:false});}
    }
    return responseView === "summary" ? planRunResponse.projectPlanRunSummary(run) : run;
  }

  if (!validation.ok) {
    run.ok = false;
    run.error = "Plan validation failed.";
    return finishRun();
  }
  try { if(validation.mutatingCount>0)seriesArgs = preflightAmeTitleSeries(prepared.plan);if(seriesArgs)seriesActor=ameTitleSeriesActor(); }
  catch (error) {run.ok=false;run.errorCode=error.code||"ame_title_series_preflight_failed";run.error=error.message;return finishRun();}
  const montageRunMaterialReader = prepared.plan.montagePipeline && !dryRun
    ? montagePipelineService.boundedMaterialReader(require("./montage-contract").normalizeBudgets(prepared.plan.montagePipeline.readBudgets).budgets)
    : null;
  if (validation.mutatingCount > 0 && !lifecycleStep) {
    try { run.placeholderPreflight = await guardPlaceholderPlan(prepared.plan, {
      montageRunPreflight: Boolean(prepared.plan.montagePipeline && !dryRun),
      ...(montageRunMaterialReader ? {montageVerifyMaterials:montageRunMaterialReader} : {})
    }); }
    catch (error) {
      run.ok = false; run.errorCode = error.code || "placeholder_preflight_failed";
      run.error = error.message; run.placeholderPreflight = error.details || null;
      return finishRun();
    }
  }
  if (!dryRun && m100PlanRequiresConfirmation(validation) && !options._m100ActionRecord) {
    run.ok = false;
    run.error = "A server-owned M100 action proposal is required to run mutating, destructive, or raw ExtendScript plan steps.";
    run.errorCode = "m100_confirmation_required";
    run.safety.status = "blocked_m100_confirmation_required";
    run.safety.m100 = {
      code: "proposal_required",
      riskPolicyVersion: M100_RISK_POLICY_VERSION,
      reason: "client-authored confirm:true is not an execution authority for mutating/destructive/raw plan steps"
    };
    return finishRun();
  }
  if (validation.steps.length > maxSteps) {
    run.ok = false; run.errorCode = "plan_step_limit_exceeded";
    run.error = `План содержит ${validation.steps.length} шагов при лимите ${maxSteps}; разделите его на проверяемые этапы.`;
    return finishRun();
  }
  if (options._m100ActionRecord && validation.mutatingCount > 0) {
    try {
      if (lifecycleStep && !dryRun) projectSave.verifyDryRunReceipt(options._m100ActionRecord, validation.steps.length, AUTONOMY_CONTRACT_VERSION);
      const lifecyclePreflight = lifecycleStep ? await lifecycle.preflight(prepared.plan, options._m100ActionRecord, dryRun) : null;
      if (lifecyclePreflight) run.lifecyclePreflight = lifecyclePreflight;
      const projectResult = lifecycleCompletion ? {file:lifecyclePreflight.projectFile} : firstToolPayload(await callToolLogged("ai-plan-preflight", "get_project_info", {}));
      currentProposalState.assertCurrent(options._m100ActionRecord);
      currentProposalState.bindProject(options._m100ActionRecord, projectResult && projectResult.file);
      run.project = {...options._m100ActionRecord.project};
      if(dryRun && validation.steps.length===1 && validation.steps[0].tool===titleExport.TOOL){
        const preparedExport=await titleExportExecutor.preflight(validation.steps[0].safeArgs);
        run.exportSnapshotsPreflight={ok:true,source:preparedExport.source,targets:preparedExport.targets,nativeMutations:0};
      }
      if(dryRun&&validation.steps.length===1&&validation.steps[0].tool===ameJobSource.TOOL){
        const preparedSource=await ameJobSourceExecutor.preflight(validation.steps[0].safeArgs);
        run.ameJobSourcePreflight={ok:true,source:preparedSource.source,nativeMutations:0};
      }
      if(dryRun&&boundedPropertyJournal){
        run.ameOpenCompPreflight=await ameOpenCompExecutor.preflight(validation.steps[0].tool,validation.steps[0].safeArgs);
        if(!projectLifecycleContract.samePath(run.ameOpenCompPreflight.projectFile,options._m100ActionRecord.project.expectedFile))throw Error("ame_open_proposal_project_mismatch");
      }
      if(dryRun&&validation.steps.length===1&&validation.steps[0].tool===titleVerification.TOOL){
        const preparedVerification=await titleVerificationExecutor.preflight(validation.steps[0].safeArgs);
        run.titleVerificationPreflight={ok:true,source:preparedVerification.source,consumed:preparedVerification.consumed===true,nativeOpens:0};
      }
    } catch (error) {
      run.ok = false; run.errorCode = error.code || "project_inspection_failed";
      run.error = error.message; run.project = error.project || null;
      return finishRun();
    }
  }
  if(!dryRun&&validation.steps.some((step)=>step.tool===projectSave.TOOL_NAME || step.tool===nativeRenderVariant.RENDER)){
    try{projectSave.verifyDryRunReceipt(options._m100ActionRecord,validation.steps.length,AUTONOMY_CONTRACT_VERSION);}
    catch(error){run.ok=false;run.errorCode=error.code;run.error=error.message;return finishRun();}
  }
  if (!dryRun && validation.mutatingCount > 0 && !lifecycleCompletion) {
    if (activeEditSession && require("./proposal-state").normalizeProject(activeEditSession.checkpoint && activeEditSession.checkpoint.sourceFile) !==
      require("./proposal-state").normalizeProject(options._m100ActionRecord && options._m100ActionRecord.project.expectedFile)) {
      run.ok = false; run.errorCode = "edit_session_project_mismatch";
      run.error = "Активная edit session защищает другой проект. Завершите её перед новой сборкой.";
      return finishRun();
    }
  }
  if (!dryRun && autonomous) {
    const autonomousRisk = m100RiskForAgentPlan(prepared.plan, validation).level;
    if (!internalReadOnly && (!options._m100ActionRecord || options._m100ActionRecord.riskLevel !== "mutating" || autonomousRisk !== "mutating")) {
      run.ok = false;
      run.error = "Autonomous Codex sessions allow only proposal-backed typed mutating plans.";
      run.errorCode = "autonomous_session_scope_blocked";
      run.safety.status = "blocked_autonomous_session_scope";
      return finishRun();
    }
    if (!options._m100ActionRecord.dryRunCompletedAt) {
      run.ok = false;
      run.error = "A successful dry run of this proposal is required before autonomous execution.";
      run.errorCode = "autonomous_session_dry_run_required";
      run.safety.status = "blocked_autonomous_session_dry_run_required";
      return finishRun();
    }
    const receipt = options._m100ActionRecord.dryRunReceipt;
    if (!receipt || receipt.payloadHash !== options._m100ActionRecord.payloadHash || receipt.contractVersion !== AUTONOMY_CONTRACT_VERSION
      || receipt.stepCount !== validation.steps.length || receipt.projectFile !== options._m100ActionRecord.project.expectedFile) {
      run.ok = false; run.errorCode = "autonomous_session_dry_run_stale";
      run.error = "Повторите dry-run текущей версии плана для целевого проекта.";
      return finishRun();
    }
  }
  if (dryRun && validation.ok !== true && validation.classification && validation.classification.allowsDryRun === false) {
    run.ok = false;
    run.error = validation.classification.runRecommendation || "Plan classification blocks dry-run.";
    return finishRun();
  }
  if (!dryRun && validation.classification && validation.classification.blocksRun === true && rawExtendscriptStepCount(validation) > 0) {
    const rawApproval = rawExtendscriptRunApproval(validation, prepared.plan, options.requestId || null, rawExtendscriptDryRunId, allowRawExtendscript);
    if (!rawApproval.ok) {
      run.ok = false;
      run.error = rawApproval.error || validation.classification.runRecommendation || "Plan classification blocks run.";
      run.safety.status = "blocked_raw_extendscript_gate";
      return finishRun();
    }
    if (rawApproval.approval) {
      run.safety.rawExtendscriptGate = {
        status: "approved",
        dryRunId: rawApproval.approval.dryRunId,
        expiresAt: rawApproval.approval.expiresAt
      };
    }
  }
  if (!dryRun && !confirm) {
    run.ok = false;
    run.error = "confirm:true is required to run a plan.";
    return finishRun();
  }
  if (!dryRun && validation.mutatingCount > 0 && !allowMutations) {
    run.ok = false;
    run.error = "allowMutations:true is required to run mutating plan steps.";
    return finishRun();
  }
  if (!dryRun && options._m100ActionRecord) {
    try {
      if (validation.steps.some(step => ameTitleMutationNames.has(step.tool) && !(autonomous && productRuntimeCurrent() && step.safeArgs?.queueMode===ameSharedQueue.MODE) || ameQueueControl.MUTATIONS.includes(step.tool) && !(autonomous && productRuntimeCurrent()) || step.tool === ameFixtureGrant.TOOL_NAME || step.tool === ameRunning.TOOL_NAME && step.safeArgs && step.safeArgs.existingInstallationTrust)) {
        manualPlanIngress.assertRequest(options._m100ActionRecord);
      }
      confirmM100ActionProposal(options._m100ActionRecord, options, run);
      options._m100ActionRecord.executionState = "executing";
    } catch (error) {
      run.ok = false;
      run.error = error.message || String(error);
      run.errorCode = error.code || "m100_confirmation_failed";
      run.safety.status = "blocked_m100_confirmation_failed";
      run.safety.m100 = {
        code: run.errorCode,
        actionId: options._m100ActionRecord.actionId,
        state: m100ActionRecordState(options._m100ActionRecord),
        proposalExpiresAt: options._m100ActionRecord.proposalExpiresAt
      };
      return finishRun();
    }
  }
  if(!dryRun&&boundedPropertyJournal){
    try{projectSave.verifyDryRunReceipt(options._m100ActionRecord,1,AUTONOMY_CONTRACT_VERSION);}
    catch(error){run.ok=false;run.errorCode=error.code;run.error=error.message;return finishRun();}
    run.safety.status="protected";run.safety.protection="bounded_property_journal";
  }
  if (mutatingExecution && !lifecycleCompletion && !boundedPropertyJournal && !activeEditSessionAtStart && !checkpointStepPresent) {
    if (!autoEditSession) {
      run.ok = false;
      run.error = "autoEditSession:true is required to run a mutating plan without an existing edit session or checkpoint step.";
      run.safety.status = "blocked_missing_edit_session";
      return finishRun();
    }

    if(validation.steps.length===1 && validation.steps[0].tool===ameFixtureGrant.TOOL_NAME) {
      try {ameFixturePrimaryBaseline=await readNativeFixturePrimaryBaseline(options._m100ActionRecord);}
      catch(error) {run.ok=false;run.errorCode=error.code || "fixture_prephase_primary_state_required";run.error=error.message;return finishRun();}
    }

    const guard = options._m100ActionRecord ? {sessionHash: autonomous && autonomous.sessionHash, projectFile: options._m100ActionRecord.project.expectedFile,
      actionId: options._m100ActionRecord.actionId, executionId: run.id, proposalExpiresAt: options._m100ActionRecord.proposalExpiresAt} : null;
    const started = await autonomousCommandContext.run(guard, () => startPlanRunEditSession(run, validation));
    if(seriesArgs)createdSeriesSession=started.ownedSession;
    if (!started.ok) {
      run.ok = false;
      run.error = started.error;
      run.safety.status = started.saveProjectFirst ? "blocked_save_project_first" : "blocked_edit_session_failed";
      run.safety.error = started.rawError;
      run.safety.saveProjectFirst = started.saveProjectFirst;
      run.editSessionStart = started.payload || null;
      return finishRun();
    }

    run.safety.status = "protected";
    run.safety.protection = "auto_edit_session";
    run.editSession = started.session;
    run.checkpoint = started.checkpoint;
  }

  if (mutatingExecution && seriesArgs) {
    try {
      if(m100Protocol.stableStringify(seriesActor)!==m100Protocol.stableStringify(ameTitleSeriesActor()))throw m100ProtocolError("ame_title_series_actor_changed", "Контроллер изменился во время подготовки checkpoint.");
      if (!activeEditSession.ameTitleSeries) {ameTitleSeries.begin(activeEditSession,seriesArgs,ameTitleSeriesActor());persistActiveEditSession();}
      seriesSession = activeEditSession;
      ameTitleSeries.preflight(seriesSession,prepared.plan,ameTitleSeriesActor());
      run.editSession = compactEditSession(seriesSession);
      run.checkpoint = compactCheckpoint(seriesSession.checkpoint);
      run.ameTitleSeries = {groupId:seriesArgs.pendingGroupId,sessionId:seriesSession.id,size:seriesArgs.pendingGroupSize};
    } catch (error) {run.ok=false;run.errorCode=error.code||"ame_title_series_protection_failed";run.error=error.message;return finishRun();}
  }

  if (lifecycleStep && !dryRun) {
    try {
      const pending = lifecycleCompletion ? lifecycle.storage.load().pendingLifecycle : null;
      const ownedSessionId = lifecycleCompletion ? pending && pending.authorization.ownedEditSessionId : run.safety.protection === "auto_edit_session" && activeEditSession && activeEditSession.id;
      if (activeEditSession && activeEditSession.id !== ownedSessionId) projectLifecycleContract.fail("lifecycle_foreign_edit_session");
      lifecycleAuthorization = lifecycle.issueContext({record:options._m100ActionRecord, run, plan:prepared.plan, ownedSessionId,
        manual:!autonomous && confirm && !allowWithoutCheckpoint && options._m100ActionRecord && options._m100ActionRecord.confirmedBySurface === "cep-panel"});
      if (lifecycleCompletion) run.safety.protection = lifecycleStep.name === "recover_project_lifecycle" ? "persisted_published_lifecycle_chain" : "persisted_lifecycle_final_proof";
    } catch (error) { run.ok=false; run.errorCode=error.code || "lifecycle_manual_authorization_required"; run.error=error.message; return finishRun(); }
  }
  const executedSteps = [];
  let solutionPreflightChecked = false;
  const autoStartedEditSession = mutatingExecution && run.safety.protection === "auto_edit_session";
  let checkpointProtectionReady = !mutatingExecution || Boolean(activeEditSession) || autoStartedEditSession || Boolean(lifecycleCompletion && lifecycleAuthorization) || Boolean(boundedPropertyJournal && run.safety.protection==="bounded_property_journal");
  const steps = validation.steps;
  for (const step of steps) {
    const item = {
      index: step.index,
      title: step.title,
      tool: step.tool,
      targetSummary: step.targetSummary || "",
      dryRun,
      mutatesProject: step.mutatesProject,
      status: "pending"
    };

    if (!step.tool) {
      item.status = "skipped";
      item.reason = "No tool for this step.";
      run.skippedCount += 1;
      run.steps.push(item);
      continue;
    }
    if (!step.executable && (!allowRuntimeBindings || !step.requiresRuntimeBinding)) {
      item.status = "blocked";
      item.reason = step.requiresRuntimeBinding ? "Runtime binding is required." : "Step is not executable.";
      item.validation = step;
      run.skippedCount += 1;
      run.steps.push(item);
      if (stopOnError) break;
      continue;
    }
    if (step.mutatesProject && !allowMutations) {
      item.status = dryRun ? "ready" : "blocked";
      item.reason = dryRun ? null : "Mutations are not allowed.";
      item.args = step.safeArgs;
      run.steps.push(item);
      if (!dryRun) run.skippedCount += 1;
      if (!dryRun && stopOnError) break;
      continue;
    }
    if (!dryRun && step.mutatesProject && !checkpointProtectionReady) {
      item.status = "blocked";
      item.reason = "Checkpoint/edit session protection was not established before this mutating step.";
      item.args = step.safeArgs;
      run.skippedCount += 1;
      run.steps.push(item);
      if (stopOnError) break;
      continue;
    }
    // The first dry run validates raw steps without dispatching them. Its receipt
    // is required by the execution gate above, so a raw permit applies only to run.
    if (!dryRun && (step.tool === "run_extendscript" || step.tool === "run_extendscript_file") && !allowRawExtendscript) {
      item.status = "blocked";
      item.reason = "Raw ExtendScript requires allowRawExtendscript:true.";
      run.skippedCount += 1;
      run.steps.push(item);
      if (stopOnError) break;
      continue;
    }

    const bound = applyPlanRuntimeBindings(step, executedSteps);
    item.args = bound.args;
    if (bound.unresolved.length) {
      if (dryRun) {
        item.status = "ready";
        item.reason = `Runtime bindings will resolve during run: ${formatUnresolvedRuntimeBindings(bound)}`;
        item.unresolved = bound.unresolved;
        run.steps.push(item);
        continue;
      }
      item.status = "blocked";
      item.reason = `Unresolved runtime bindings: ${formatUnresolvedRuntimeBindings(bound)}`;
      item.errorCode = "runtime_binding_unresolved";
      run.errorCode = item.errorCode;
      run.error = item.reason;
      item.unresolved = bound.unresolved;
      run.skippedCount += 1;
      run.steps.push(item);
      if (stopOnError) break;
      continue;
    }

    if (dryRun) {
      item.status = "ready";
      run.steps.push(item);
      continue;
    }

    if (step.mutatesProject && !lifecycleCompletion) {
      const freshAuthority = autonomousSession.authorization();
      if (autonomous && (!freshAuthority || freshAuthority.sessionHash !== autonomous.sessionHash)) {
        item.status = "blocked"; item.reason = "Автономная сессия истекла или отозвана.";
        run.errorCode = "autonomous_session_expired_or_revoked"; run.error = item.reason;
        run.steps.push(item); run.skippedCount += 1; break;
      }
      try {
        const projectNow = firstToolPayload(await callToolLogged("ai-plan-preflight", "get_project_info", {}));
        currentProposalState.assertCurrent(options._m100ActionRecord);
        currentProposalState.bindProject(options._m100ActionRecord, projectNow && projectNow.file);
        if (seriesArgs) {
          if (activeEditSession !== seriesSession) throw m100ProtocolError("ame_title_series_session_changed", "Edit session серии изменилась.");
          run.ameTitleSeries = ameTitleSeries.reserve(seriesSession,seriesArgs,ameTitleSeriesActor(),run.id);
        }
        if (activeEditSession && require("./proposal-state").normalizeProject(activeEditSession.checkpoint && activeEditSession.checkpoint.sourceFile) !==
          require("./proposal-state").normalizeProject(options._m100ActionRecord.project.expectedFile)) {
          throw m100ProtocolError("edit_session_project_mismatch", "Checkpoint активной edit session относится к другому проекту.");
        }
        if (!boundedPropertyJournal && !activeEditSession && (!run.checkpoint || require("./proposal-state").normalizeProject(run.checkpoint.sourceFile) !== require("./proposal-state").normalizeProject(options._m100ActionRecord.project.expectedFile))) {
          throw m100ProtocolError("checkpoint_project_mismatch", "Checkpoint не подтверждает целевой проект.");
        }
      } catch (error) {
        item.status = "blocked"; item.reason = error.message; run.errorCode = error.code || "project_inspection_failed";
        run.error = item.reason; run.steps.push(item); run.skippedCount += 1; break;
      }
    }

    if (step.mutatesProject && !solutionPreflightChecked) {
      run.solutionPlanPreflight = checkSolutionPlanPreflight(prepared.plan, run.steps);
      solutionPreflightChecked = true;
      if (run.solutionPlanPreflight && run.solutionPlanPreflight.status !== "passed") {
        item.status = "blocked";
        item.reason = "Solution plan evidence changed or is incomplete. Inspect the targets and rebuild the plan.";
        run.steps.push(item);
        run.skippedCount += 1;
        break;
      }
    }
    const stepStartedAt = Date.now();
    try {
      assertCoreMigrationOperation(captureCoreMigrationOperation(step.tool,bound.args,!step.mutatesProject,{runId:run.id,actionId:options._m100ActionRecord?.actionId,validationId:validation.id}));
      const guard = step.mutatesProject && options._m100ActionRecord ? {sessionHash: autonomous && autonomous.sessionHash, projectFile: options._m100ActionRecord.project.expectedFile,
        actionId: options._m100ActionRecord.actionId, executionId: run.id, proposalExpiresAt: options._m100ActionRecord.proposalExpiresAt} : null;
      persistRun(item);
      const ameOpenCompAuthorization=ameOpenComp.MUTATIONS.includes(step.tool)?ameOpenCompExecutor.authorize({
        source:"ai-plan-run",tool:step.tool,record:options._m100ActionRecord,runId:run.id,args:bound.args,autonomous:Boolean(autonomous),sessionHash:autonomous&&autonomous.sessionHash,confirm,allowWithoutCheckpoint,
        protection:run.safety.protection,stepCount:validation.steps.length,contractVersion:AUTONOMY_CONTRACT_VERSION
      }):null;
      const ameJobSourceContext=step.tool===ameJobSource.TOOL?{
        source:"ai-plan-run",record:options._m100ActionRecord,runId:run.id,args:bound.args,autonomous:Boolean(autonomous),sessionHash:autonomous&&autonomous.sessionHash,confirm,allowWithoutCheckpoint,
        ownedEditSessionId:activeEditSession&&activeEditSession.id,checkpoint:activeEditSession&&activeEditSession.checkpoint||run.checkpoint,stepCount:validation.steps.length,contractVersion:AUTONOMY_CONTRACT_VERSION
      }:null;
      if(ameJobSourceContext&&!autonomous)manualPlanIngress.brand(ameJobSourceContext);
      const ameJobSourceAuthorization=ameJobSourceContext?ameJobSourceExecutor.authorize(ameJobSourceContext):null;
      const titleExportAuthorization=step.tool===titleExport.TOOL ? titleExportExecutor.authorize({
        record:options._m100ActionRecord,runId:run.id,args:bound.args,autonomous:Boolean(autonomous),sessionHash:autonomous && autonomous.sessionHash,confirm,allowWithoutCheckpoint,
        checkpoint:activeEditSession && activeEditSession.checkpoint || run.checkpoint,stepCount:validation.steps.length,contractVersion:AUTONOMY_CONTRACT_VERSION
      }) : null;
      const titleVerificationAuthorization=step.tool===titleVerification.TOOL ? titleVerificationExecutor.authorize({
        record:options._m100ActionRecord,runId:run.id,args:bound.args,autonomous:Boolean(autonomous),sessionHash:autonomous&&autonomous.sessionHash,confirm,allowWithoutCheckpoint,ownedEditSessionId:activeEditSession&&activeEditSession.id,
        checkpoint:activeEditSession&&activeEditSession.checkpoint||run.checkpoint,stepCount:validation.steps.length,contractVersion:AUTONOMY_CONTRACT_VERSION
      }) : null;
      const nativeRenderAuthorization=step.tool===nativeRenderVariant.RENDER ? nativeRenderExecutor.authorize({
        record:options._m100ActionRecord,runId:run.id,autonomous:Boolean(autonomous),confirm,allowWithoutCheckpoint,
        checkpoint:activeEditSession && activeEditSession.checkpoint || run.checkpoint,
        stepCount:validation.steps.length,contractVersion:AUTONOMY_CONTRACT_VERSION
      }) : null;
      const ameRunningContext = step.tool === ameRunning.TOOL_NAME ? {
        source: "ai-plan-run", record: options._m100ActionRecord, runId: run.id, args: bound.args,
        confirm, allowWithoutCheckpoint, autonomous: Boolean(autonomous), stepCount: validation.steps.length,
        checkpoint: activeEditSession && activeEditSession.checkpoint || run.checkpoint
      } : null;
      if (ameRunningContext && bound.args.existingInstallationTrust) manualPlanIngress.brand(ameRunningContext);
      const ameRunningAuthorization = ameRunningContext ? ameRunningExecutor.authorize(ameRunningContext) : null;
      const ameQueueContext = ameQueueControl.MUTATIONS.includes(step.tool) ? brandAmeQueueContext({
        source: "ai-plan-run", record: options._m100ActionRecord, runId: run.id, args: bound.args,
        confirm, allowWithoutCheckpoint, autonomous: Boolean(autonomous), stepCount: validation.steps.length,
        checkpoint: activeEditSession && activeEditSession.checkpoint || run.checkpoint
      }, autonomous) : null;
      const ameQueueAuthorization = ameQueueContext ? ameQueueExecutor.authorize(ameQueueContext) : null;
      const ameFixtureContext = step.tool === ameFixtureGrant.TOOL_NAME ? manualPlanIngress.brand({
        source: "ai-plan-run", record: options._m100ActionRecord, runId: run.id, args: bound.args,
        requestId:options.requestId || options._m100ActionRecord.requestId,instanceId:currentProposalState.snapshot().instanceId,
        confirm, allowWithoutCheckpoint, autonomous: Boolean(autonomous), stepCount: validation.steps.length,
        checkpoint: activeEditSession && activeEditSession.checkpoint || run.checkpoint
      }) : null;
      if (ameFixtureContext) rememberNativeFixtureProtection(ameFixtureContext,run,ameFixturePrimaryBaseline);
      let ameFixtureAuthorization = null;
      if (ameFixtureContext) {
        try { ameFixtureAuthorization = await ameFixtureExecutor.authorize(ameFixtureContext); }
        catch (error) { ameFixtureCheckpoints.delete(run.id); throw error; }
      }
      const ameTitleContext = ameTitleMutationNames.has(step.tool) ? brandAmeTitleContext({
        source: "ai-plan-run", record: options._m100ActionRecord, runId: run.id, args: bound.args,
        confirm, allowWithoutCheckpoint, autonomous: Boolean(autonomous), stepCount: validation.steps.length,
        ownedEditSessionId: activeEditSession && activeEditSession.id,
        checkpoint: activeEditSession && activeEditSession.checkpoint || run.checkpoint
      },autonomous) : null;
      const ameTitleAuthorization = ameTitleContext ? ameTitleExecutor.authorize(step.tool, bound.args, ameTitleContext) : null;
      const result = await planCommandContext.run({item,run,role:"readback",persist:()=>persistRun(item)}, () => evidenceContext.run({...evidenceContext.getStore(), stepIndex: step.index,
        sessionId: activeEditSession && activeEditSession.id || null},
      () => placeholderPlanContext.run({ plan: prepared.plan, validation, montageVerifyMaterials:montageRunMaterialReader,
        remainingSteps: steps.filter(value => value.index >= step.index), completedSteps: run.steps.filter(value => value.index < step.index) },
      () => autonomousCommandContext.run(guard, () => callToolLogged("ai-plan-run", step.tool, bound.args,
        projectLifecycleContract.isLifecycleMutation(step.tool) ? {lifecycleAuthorization} : step.tool===projectSave.TOOL_NAME ? {projectSaveAuthorization:{authorized: !autonomous && confirm && !allowWithoutCheckpoint && Boolean(options._m100ActionRecord && options._m100ActionRecord.confirmedBySurface==="cep-panel" && options._m100ActionRecord.executionState==="executing"),
          confirmed:confirm,proposalId:options._m100ActionRecord && options._m100ActionRecord.actionId,runId:run.id}} : ameOpenCompAuthorization ? {ameOpenCompAuthorization} : ameJobSourceAuthorization ? {ameJobSourceAuthorization} : titleVerificationAuthorization ? {titleVerificationAuthorization} : titleExportAuthorization ? {titleExportAuthorization} : nativeRenderAuthorization ? {nativeRenderAuthorization} : ameQueueAuthorization ? {ameQueueAuthorization} : ameRunningAuthorization ? {ameRunningAuthorization} : ameFixtureAuthorization ? {ameFixtureAuthorization} : ameTitleAuthorization ? {ameTitleAuthorization} : undefined)))));
      const payload = firstToolPayload(result);
      const observedAt = new Date().toISOString();
      const evidenceArtifact = reviewEvidence.writeStepEvidence(LOG_DIR, {runId:run.id,stepIndex:step.index,
        actionId:provenance.actionId,proposalRevision:provenance.proposalRevision,projectId:provenance.projectId,
        projectRevision:null,observedAt,tool:step.tool,argsSha256:reviewEvidence.sha256(bound.args),
        result:payload === undefined ? null : payload});
      item.evidenceArtifact = evidenceArtifact;
      recordEvent("plan_step_evidence", {...evidenceArtifact,stepIndex: step.index, tool: step.tool, evidenceKind: "direct-tool-result",
        evidenceRunId: run.id, verificationSubjectRunId: run.id, auditSha256: reviewEvidence.sha256(payload === undefined ? null : payload),
        observedAt, ok: !result.isError, acceptance: "not_established"});
      item.status = result.isError ? "failed" : "completed";
      item.result = payload;
      item.isError = Boolean(result.isError);
      if(amePending.isPendingStep(item,run)){run.pending=true;run.ok=false;item.dispatchOnly=true;}
      if (result.isError) {
        item.errorCode = payload && (payload.errorCode || payload.code) || "ae_step_failed";
        item.error = typeof payload === "string" ? payload : payload && payload.error || `Шаг ${step.tool} завершился отказом.`;
        run.errorCode = item.errorCode;
        run.error = item.error;
      }
      item.durationMs = Date.now() - stepStartedAt;
      recordAutonomyObstacle({operation: step.tool, proposalId: options._m100ActionRecord && options._m100ActionRecord.actionId,
        runId: run.id, code: result.isError ? item.errorCode : "ok", phase: "step", durationMs: item.durationMs,
        successfulSteps: result.isError ? 0 : 1, failedSteps: result.isError ? 1 : 0,
        verification: payload && payload.postVerification && payload.postVerification.ok === true ? "passed" : "pending_readback"});
      executedSteps.push({ step, payload });
      run.executedCount += result.isError ? 0 : 1;
      if (result.isError) run.failedCount += 1;
      if (!result.isError && payload && typeof payload === "object") {
        if (step.tool === "checkpoint_project" && payload.checkpointFile) {
          checkpointProtectionReady = true;
          run.safety.protection = "planned_checkpoint_step";
          run.checkpoint = compactCheckpoint(payload);
        }
        if (step.tool === "start_edit_session" && payload.session) {
          checkpointProtectionReady = true;
          run.safety.protection = "planned_edit_session_step";
          run.editSession = payload.session;
        }
      }
      run.steps.push(item);
      if (result.isError && stopOnError) break;
      if (autonomous && step.tool === "audit_slideshow_generated") {
        const checked = buildServerSemanticVerification(prepared.plan, {...run, ok: true});
        if (checked.failedChecks > 0 || checked.unverifiedMutationCount > 0) {
          run.errorCode = "slideshow_verification_failed";
          run.error = "Read-back этапа слайд-шоу не совпал с планом; следующие изменения остановлены.";
          run.failedCount += 1;
          run.intermediateVerification = checked;
          recordAutonomyObstacle({operation: step.tool, proposalId: options._m100ActionRecord.actionId,
            runId: run.id, code: run.errorCode, phase: "verification", failedSteps: 1, verification: "failed"});
          break;
        }
      }
    } catch (error) {
      item.status = "failed";
      item.error = error.message || String(error);
      item.errorCode = error.code || "ae_execution_failed";
      for (const field of ["commandId","lifecycleState","timedOutFrom","phase"]) item[field]=error[field] || null;
      item.durationMs = Date.now() - stepStartedAt;
      recordAutonomyObstacle({operation: step.tool, proposalId: options._m100ActionRecord && options._m100ActionRecord.actionId,
        runId: run.id, code: item.errorCode, phase: "step", durationMs: item.durationMs, failedSteps: 1, verification: "not_verified"});
      run.errorCode = item.errorCode;
      run.error = item.error;
      item.line = error.line || null;
      run.failedCount += 1;
      run.steps.push(item);
      if (stopOnError) break;
    }
  }

  if (autoStartedEditSession && !seriesArgs && !(lifecycleStep && run.safety.editSessionFinished)) {
    run.solutionPlanReadBack = verifySolutionPlanReadBack(prepared.plan, run);
    if (run.solutionPlanReadBack && run.solutionPlanReadBack.status !== "passed") run.ok = false;
    const finished = finishPlanRunEditSession(run);
    if (finished) {
      run.editSessionFinished = finished.session || null;
      run.safety.editSessionFinished = true;
    }
  }

  return finishRun();
}











async function readPlaceholderInventory(options = {}) {
  const targets = options.targets || [];
  if (!Array.isArray(targets) || targets.length > 200) throw new Error("placeholder_read_target_limit");
  const paths = placeholderProtection.normalizeProtectedPaths(options.protectedProperties || []);
  const result = await runExtendScriptBody(`
    // __codexPlaceholderInventory: bounded fresh project identities and timing.
    ${placeholderProtection.aeSupportScript}
    var inventory={complete:true,projectFile:app.project.file ? app.project.file.fsName : null,comps:[],sources:[],ignored:[],selectedTargets:[],evidence:[]};
    var layerCount=0;
    if(app.project.numItems>2000) { inventory.complete=false; inventory.reason="project_item_budget"; return inventory; }
    for(var i=1;i<=app.project.numItems;i++) {
      var item=app.project.item(i);
      if(item instanceof CompItem) {
        if(inventory.comps.length>=200) {inventory.complete=false;inventory.reason="comp_budget";break;}
        var comp={itemId:item.id,itemIndex:i,name:item.name,comment:item.comment,width:item.width,height:item.height,pixelAspect:item.pixelAspect,duration:item.duration,frameRate:item.frameRate,layers:[]};
        for(var j=1;j<=item.numLayers;j++) {
          if(++layerCount>5000) {inventory.complete=false;inventory.reason="layer_budget";break;}
          var layer=item.layer(j); var source=null; try{source=layer.source;}catch(e){}
          var kind="media";
          if(layer.matchName==="ADBE Text Layer")kind="text";
          else if(layer.matchName==="ADBE Vector Layer")kind="shape";
          else if(layer.matchName==="ADBE Camera Layer")kind="camera";
          else if(layer.matchName==="ADBE Light Layer")kind="light";
          else if(layer.adjustmentLayer===true)kind="adjustment";
          var ref={id:layer.id,index:j,name:layer.name,enabled:layer.enabled,locked:layer.locked,sourceItemId:source ? source.id : null,
            startTime:layer.startTime,inPoint:layer.inPoint,outPoint:layer.outPoint,stretch:layer.stretch,timeRemapEnabled:layer.timeRemapEnabled,kind:kind};
          comp.layers.push(ref);
          if(kind!=="media")inventory.ignored.push({compItemId:item.id,layerId:layer.id,kind:kind});
        }
        inventory.comps.push(comp);
      } else if(item instanceof FootageItem) {
        if(inventory.sources.length>=1000) {inventory.complete=false;inventory.reason="source_budget";break;}
        var sourceType="footage";
        try {if(item.mainSource.isStill===true)sourceType="still";else if(item.hasVideo===false && item.hasAudio===true)sourceType="audio";}catch(e){}
        var file=item.file;
        inventory.sources.push({itemId:item.id,itemIndex:i,name:item.name,type:sourceType,file:file && file.fsName ? file.fsName : null,
          duration:item.duration,width:item.width,height:item.height,pixelAspect:item.pixelAspect,frameRate:item.frameRate,footageMissing:item.footageMissing,
          hasVideo:item.hasVideo,hasAudio:item.hasAudio});
      }
      if(!inventory.complete)break;
    }
    var active=app.project.activeItem;
    if(active instanceof CompItem) {
      inventory.activeCompItemId=active.id;
      for(var s=0;s<active.selectedLayers.length && s<33;s++)inventory.selectedTargets.push({compItemId:active.id,layerId:active.selectedLayers[s].id});
    }
    var specs=${JSON.stringify(targets)};
    if(${options.selected === true ? "true" : "false"}) {
      if(inventory.selectedTargets.length<1 || inventory.selectedTargets.length>32)throw new Error("select_1_to_32_placeholder_layers");
      specs=[];for(var s=0;s<inventory.selectedTargets.length;s++)specs.push({target:inventory.selectedTargets[s],protectedProperties:${JSON.stringify(paths)}});
      if(${options.useSelectedProperties === true ? "true" : "false"}) {
        if(inventory.selectedTargets.length!==1 || !active.selectedProperties || active.selectedProperties.length<1 || active.selectedProperties.length>12)throw new Error("select_1_to_12_properties_on_selected_placeholder");
        var selectedLayer=__phFindLayer(active,inventory.selectedTargets[0].layerId);var selectedPaths=[];
        for(var p=0;p<active.selectedProperties.length;p++) {
          var property=active.selectedProperties[p];var current=property;var segments=[];
          if(typeof property.numKeys!=="number")throw new Error("unsupported_selected_property_group");
          for(var depth=0;current && current!==selectedLayer && depth<8;depth++) {
            if(!current.matchName)throw new Error("selected_property_identity_unavailable");
            segments.unshift({matchName:current.matchName,propertyIndex:current.propertyIndex});
            current=current.propertyGroup(1);
          }
          if(current!==selectedLayer || !segments.length)throw new Error("selected_property_belongs_to_other_layer_or_depth");
          selectedPaths.push(segments);
        }
        specs[0].protectedProperties=selectedPaths;
        inventory.selectedProtectedProperties=selectedPaths;
      }
    }
    for(var t=0;t<specs.length;t++) {
      var spec=specs[t];
      try {var comp=__phFindComp(spec.target.compItemId);var layer=__phFindLayer(comp,spec.target.layerId);
        inventory.evidence.push(__phEvidence(comp,layer,spec.protectedProperties||[]));}
      catch(e){inventory.evidence.push({target:spec.target,unsupported:[String(e)]});}
    }
    return inventory;
  `);
  const inventory=result.result;
  if(!inventory || !inventory.projectFile || scriptPreparationContext.getStore())return inventory;
  const state=projectStateMemory.readProjectState(inventory.projectFile);
  const excluded=[];
  for(const record of Object.values(state.reviewArtifacts || {})) {
    const read=await runExtendScriptBody(placeholderReviewService.readServiceScript(record.receipt.items.map(item=>item.itemId)));
    if(read.result && placeholderSourceRecovery.pathsEqual(read.result.projectFile,inventory.projectFile) && placeholderReviewService.verifyServiceReceipt(record.spec,read.result.items,state.projectKey).ok)
      excluded.push(...read.result.items.map(item=>item.itemId));
  }
  inventory.comps=inventory.comps.filter(comp=>!excluded.includes(comp.itemId));
  inventory.excludedReviewItemIds=excluded;
  return inventory;
}

function placeholderError(code, details) {
  const reason = details && (details.conflicts && details.conflicts[0] && details.conflicts[0].reason ||
    details.changes && details.changes[0] || details.reason);
  const error = new Error("Плейсхолдеры: " + code + (reason ? " (" + reason + ")" : ""));
  error.code = code;
  error.details = details || null;
  return error;
}
function placeholderRootsForTargets(inventory, targets) {
  const roots = new Set();
  function visit(id, branch) {
    if (branch.includes(id) || branch.length > 16) throw placeholderError("unsupported_usage_dependency_cycle_or_depth");
    const parents = inventory.comps.filter(comp => comp.layers.some(layer => layer.sourceItemId === id && layer.enabled === true));
    if (!parents.length) roots.add(id);
    for (const comp of parents) visit(comp.itemId, [...branch, id]);
  }
  for (const target of targets) visit(target.compItemId, []);
  if (roots.size > 32) throw placeholderError("placeholder_root_limit");
  return [...roots].map(compItemId => ({ compItemId }));
}
function freshPlaceholderUsage(inventory, roots, state) {
  const usage=placeholderUsage.buildSourceUsageMap({ inventory, roots, groupMappings: state.groupMappings });
  usage.scope={...usage.scope,excludedReviewItemIds:inventory.excludedReviewItemIds || []};
  return usage;
}
function normalizeFreshAssignments(assignments, inventory) {
  if (!Array.isArray(assignments) || !assignments.length || assignments.length > 32) throw placeholderError("placeholder_assignment_limit");
  return assignments.map(assignment => {
    const source = inventory.sources.find(value => value.itemId === assignment.sourceItemId);
    if (!source || source.type !== "footage" || source.footageMissing !== false ||
      source.hasVideo !== true || !Array.isArray(assignment.sourceRange) || assignment.sourceRange.length !== 2 ||
      assignment.sourceRange[1] > source.duration) throw placeholderError("unsupported_assignment_video_source");
    return { ...assignment, mediaKey: placeholderUsage.mediaKeyForSource(source), groupId: undefined };
  });
}
function checkFreshPlanAssignments(plan, state, inventory, mutations) {
  const policies = [state.constraints, plan.placeholderConstraints].filter(value => value && (value.distinctGroups || value.disallowSourceOverlap));
  if (!policies.length) return { ok: true, checks: [] };
  const desired = JSON.parse(JSON.stringify(inventory));
  for (const step of mutations) {
    const tool = step.tool;
    const args = step.safeArgs || step.args || {};
    if (tool === projectSave.TOOL_NAME) {
      projectSave.validateToolInput(tool, args);
      continue;
    }
    if (tool === "set_layer_transform" || tool === "fit_layer_to_comp") continue;
    if (tool === "set_property_value") {
      let property;
      try { property = placeholderProtection.propertyPath(args.propertyPath); } catch (_error) { throw placeholderError("unknown_constrained_property_footprint"); }
      if (property[0].matchName !== "ADBE Transform Group") throw placeholderError("unknown_constrained_property_footprint");
      continue;
    }
    if (!["replace_layer_source", "set_layer_time_range"].includes(tool)) {
      if (["create_comp", "create_test_comp", "create_project_folder", "set_comp_current_time", "refresh_comp_panel", "set_layer_selection","create_placeholder_review_comps","save_comp_frame_png","reload_montage_material_source"].includes(tool) || tool==="cleanup_test_items" && step.verifiedReviewCleanup===true) continue;
      throw placeholderError("unknown_constrained_mutation_footprint", { tool });
    }
    const targets = placeholderProtection.resolveTargets(args, desired);
    for (const target of targets) {
      if (tool === "replace_layer_source") target.layer.sourceItemId = placeholderProtection.sourceId(args, desired);
      else {
        for (const field of ["startTime", "inPoint", "outPoint"]) if (args[field] !== undefined) target.layer[field] = args[field];
        if (args.duration !== undefined) target.layer.outPoint = target.layer.inPoint + args.duration;
      }
    }
  }
  const checks = [];
  for (const policy of policies) {
    const targets = policy.selectedTargets || (plan.placeholderAssignments || []).map(value => value.target);
    if (!Array.isArray(targets) || !targets.length || targets.length > 32) throw placeholderError("constrained_targets_required");
    const roots = placeholderRootsForTargets(inventory, targets);
    const baseline = freshPlaceholderUsage(inventory, roots, state);
    const predicted = freshPlaceholderUsage(desired, roots, state);
    if (!predicted.ok || !predicted.complete) throw placeholderError("incomplete_predicted_placeholder_usage", predicted);
    const assignments = targets.map(target => {
      const matches = predicted.entries.filter(entry => placeholderProtection.targetKey(entry.target) === placeholderProtection.targetKey(target));
      if (matches.length !== 1) throw placeholderError(matches.length > 1 ? "unsupported_shared_placeholder" : "selected_placeholder_usage_unavailable", { target });
      const entry = matches[0];
      return { target, sourceItemId: entry.sourceItemId, mediaKey: entry.mediaKey, sourceRange: entry.sourceRange };
    });
    const result = placeholderUsage.checkPlaceholderAssignments({ usage: baseline,
      assignments: normalizeFreshAssignments(assignments, desired),
      constraints: { distinctGroups: policy.distinctGroups === true, disallowSourceOverlap: policy.disallowSourceOverlap === true,
        selectedTargets: targets, groupMappings: state.groupMappings } });
    checks.push(result);
    if (!result.ok) throw placeholderError("placeholder_assignment_conflict", result);
  }
  return { ok: true, checks };
}
async function currentPlaceholderState() {
  projectStateMemory.loadProjectStateStore();
  const project = firstToolPayload(await callToolLogged("placeholder-state-read", "get_project_info", {}));
  const state = projectStateMemory.readProjectState(project && project.file);
  return { projectFile: project.file, state };
}

async function guardMontagePipelinePlan(plan, options = {}) {
  return require("./montage-plan-guard").guardMontagePlan(plan, {
    currentPlaceholderState, readPlaceholderInventory, runExtendScriptBody,
    ...(options.montageVerifyMaterials ? {verifyMontageMaterials:options.montageVerifyMaterials} : {})
  }, options);
}

async function guardPlaceholderPlan(plan, options = {}) {
  if (lifecycle.planStep(plan)) return {ok:true, snapshots:[], bindings:[], lifecycleScope:true};
  if(!plan.montagePipeline && plan.expectedReadBack?.stretch!==undefined && plan.expectedReadBack.stretch!==100)
    throw placeholderError("affine_plan_requires_montage_binding");
  const store = projectStateMemory.loadProjectStateStore();
  const mutations = (options.steps || plan.steps || []).filter(step => MUTATING_TOOL_NAMES.has(step.tool || step.toolName))
    .map(step => ({ ...step, tool: step.tool || step.toolName, args: step.safeArgs || step.args || step.arguments || {} }));
  const namedSaves = mutations.filter(step => step.tool === projectSave.TOOL_NAME);
  for (const step of namedSaves) projectSave.validateToolInput(step.tool, step.args);
  for (const step of mutations) placeholderProtection.assertSupportedSetterIdentity(step.tool,step.args);
  if (plan.montagePipeline) {
    await guardMontagePipelinePlan(plan, options);
  }
  const hasInherited = Object.values(store.projectState).some(value => value.inheritedOwnership && value.inheritedOwnership.length);
  if (mutations.length && hasInherited) {
    const inheritedCurrent = await currentPlaceholderState();
    if (inheritedCurrent.state.inheritedOwnership && inheritedCurrent.state.inheritedOwnership.length) {
      const inheritedInventory = await readPlaceholderInventory();
      if (!inheritedInventory || inheritedInventory.complete !== true || !placeholderSourceRecovery.pathsEqual(inheritedCurrent.projectFile, inheritedInventory.projectFile)) throw placeholderError("incomplete_or_changed_protection_inventory");
      const inherited = projectStateMemory.checkInheritedOwnershipSteps({state:inheritedCurrent.state, inventory:inheritedInventory, steps:mutations});
      if (!inherited.ok) throw placeholderError(inherited.code, inherited);
    }
  }
  const hasState = Object.values(store.projectState).some(value => value.acceptedPlaceholders.length || value.constraints);
  if (!mutations.length || (!hasState && !namedSaves.length && !plan.placeholderConstraints && !plan.placeholderFraming && !plan.montagePipeline)) {
    return { ok: true, snapshots: [], bindings: [], ...(plan.montagePipeline ? { montagePipeline: plan.montagePipeline } : {}) };
  }
  const { projectFile, state } = await currentPlaceholderState();
  for (const step of namedSaves) {
    if (!placeholderSourceRecovery.pathsEqual(step.args.expectedProjectFile, projectFile))
      throw placeholderError("project_save_expected_file_mismatch");
  }
  if (!state.acceptedPlaceholders.length && !state.constraints && !plan.placeholderConstraints && !plan.placeholderFraming && !plan.montagePipeline) {
    return { ok: true, projectFile, snapshots: [], bindings: [], ...(plan.montagePipeline ? { montagePipeline: plan.montagePipeline } : {}) };
  }
  const targetSpecs = [
    ...state.acceptedPlaceholders.map(snapshot => ({ target: snapshot.target, protectedProperties: snapshot.properties.map(prop => prop.path) })),
    ...mutations.filter(m => m.args && m.args.expectedCompItemId && m.args.expectedLayerId).map(m => ({
      target: { compItemId: m.args.expectedCompItemId, layerId: m.args.expectedLayerId },
      protectedProperties: []
    }))
  ];
  const uniqueSpecs = [];
  const seenSpecs = new Set();
  for (const s of targetSpecs) {
    const key = `${s.target.compItemId}:${s.target.layerId}`;
    if (!seenSpecs.has(key)) {
      seenSpecs.add(key);
      uniqueSpecs.push(s);
    }
  }
  const inventory = await readPlaceholderInventory({ targets: uniqueSpecs });
  if (!inventory || inventory.complete !== true || !placeholderSourceRecovery.pathsEqual(projectFile, inventory.projectFile)) throw placeholderError("incomplete_or_changed_protection_inventory");
  const verifiedReviewCleanupOwners=[];
  const protectionSteps=[];
  for(const step of mutations) {
    delete step.verifiedReviewCleanup;
    if(step.tool==="cleanup_test_items" && step.args.owner) {
      await requireFreshReviewRecord(step.args.owner,step.args.itemIds);
      verifiedReviewCleanupOwners.push(step.args.owner);step.verifiedReviewCleanup=true;
    }
    if(step.tool==="fit_layer_to_comp") {
      for(const target of placeholderProtection.resolveTargets(step.args,inventory)) {
        const read=await readPlaceholderGeometry({compItemId:target.compItemId,layerId:target.layerId});
        const transform=calculateFitTransform(read,step.args);
        protectionSteps.push({...step,tool:"set_layer_transform",args:{...step.args,layerIndex:target.layerIndex,expectedCompItemId:target.compItemId,expectedLayerId:target.layerId,...transform}});
      }
    }else protectionSteps.push(step);
  }
  const protectedCheck = placeholderProtection.checkProtectedSteps({ accepted: state.acceptedPlaceholders, inventory, steps: protectionSteps,verifiedReviewCleanupOwners });
  if (!protectedCheck.ok) throw placeholderError(protectedCheck.code, protectedCheck);
  const snapshots = namedSaves.length ? state.acceptedPlaceholders :
    state.acceptedPlaceholders.filter(snapshot => protectedCheck.affected.includes(placeholderProtection.targetKey(snapshot.target)));
  for (const snapshot of snapshots) {
    const observed = inventory.evidence.find(value => value.comp && value.layer && value.comp.itemId === snapshot.target.compItemId && value.layer.id === snapshot.target.layerId);
    const drift = placeholderProtection.compareSnapshot(snapshot, observed, inventory);
    if (!drift.ok) throw placeholderError(drift.code, drift);
  }
  const assignments = checkFreshPlanAssignments(plan, state, options.montagePreviewInventory || inventory, mutations);
  const after = projectStateMemory.readProjectState(projectFile);
  if (after.revision !== state.revision) throw placeholderError("project_state_revision_changed");
  let bindings = protectedCheck.bindings.flatMap(value => value.targets);
  if (options.bindingStep) {
    const step = options.bindingStep;
    if (placeholderProtection.TARGET_SETTERS.has(step.tool)) bindings = placeholderProtection.resolveTargets(step.args, inventory)
      .map(value => ({ compItemId: value.compItemId, layerId: value.layerId, compItemIndex: value.compItemIndex, layerIndex: value.layerIndex }));
    else bindings = [];
  }
  const result = { ok: true, projectFile, revision: state.revision, snapshots, assignments,
    bindings, inventoryComplete: true };
  if(plan.placeholderFraming) {
    const framing=plan.placeholderFraming;
    const read=await readPlaceholderGeometry(framing.target,framing.sourceItemId);
    if(placeholderReviewService.hash(read.geometry)!==placeholderReviewService.hash(framing.geometry))throw placeholderError("placeholder_framing_geometry_changed");
    calculateFitTransform(read,{mode:"cover"});
    const coverage=require("./placeholder-framing").verifyPlaceholderCoverage({geometry:read.geometry,transform:framing.transform});
    if(coverage.covered!==true || coverage.eligible!==true)throw placeholderError("placeholder_framing_transform_uncovered",coverage);
    const setters=plan.steps.filter(step=>step.tool==="set_layer_transform" && step.args.expectedCompItemId===framing.target.compItemId && step.args.expectedLayerId===framing.target.layerId);
    if(setters.length!==1 || !placeholderProtection.valueEqual(setters[0].args.position,framing.transform.position) || !placeholderProtection.valueEqual(setters[0].args.scale,framing.transform.scale))throw placeholderError("placeholder_framing_step_mismatch");
    result.geometryBaselines=[framing];
  }
  if(projectStateMemory.readProjectState(projectFile).revision!==state.revision)throw placeholderError("project_state_revision_changed");
  Object.defineProperty(result, "_inventory", { value: inventory, enumerable: false });
  const hasAffineTarget = inventory && Array.isArray(inventory.evidence) && inventory.evidence.some(value => value.layer && value.layer.stretch !== 100);
  if (assignments.checks.length || hasAffineTarget || Boolean(plan.montagePipeline)) Object.defineProperty(result, "inventoryBaseline", { value: inventory, enumerable: false });
  return result;
}
async function getPlaceholderProtection() {
  const { projectFile, state } = await currentPlaceholderState();
  if (!state.acceptedPlaceholders.length) return { ok: true, projectFile, ...state, drift: [] };
  const inventory = await readPlaceholderInventory({ targets: state.acceptedPlaceholders.map(snapshot => ({ target: snapshot.target,
    protectedProperties: snapshot.properties.map(prop => prop.path) })) });
  const drift = state.acceptedPlaceholders.map(snapshot => placeholderProtection.compareSnapshot(snapshot,
    inventory.evidence.find(value => value.comp && value.layer && value.comp.itemId === snapshot.target.compItemId && value.layer.id === snapshot.target.layerId), inventory));
  return { ok: true, projectFile, ...state, drift, inventoryComplete: inventory.complete };
}
function rebindPlaceholderArgs(name, args, protection) {
  if (protection && protection._inventory) placeholderProtection.assertSupportedSetterIdentity(name,args);
  if (!protection || !protection._inventory || !placeholderProtection.TARGET_SETTERS.has(name) || !args ||
    !args.expectedCompItemId || (!args.expectedLayerId && !args.expectedLayerIds)) return args;
  const targets = placeholderProtection.resolveTargets(args, protection._inventory);
  const next = { ...args, compItemIndex: targets[0].compItemIndex };
  if (name==="set_property_value" && targets.length>1) {next.layerIndex=targets.map(value=>value.layerIndex);delete next.layerIndices;}
  else if (["set_layer_transform","set_property_value"].includes(name)) next.layerIndex = targets[0].layerIndex;
  else next.layerIndices = targets.map(value => value.layerIndex);
  if (name === "replace_layer_source" && args.expectedSourceItemId) {
    const source = [...protection._inventory.sources, ...protection._inventory.comps].find(value => value.itemId === args.expectedSourceItemId);
    if (!source) throw placeholderError("replacement_source_identity_unavailable");
    next.sourceItemIndex = source.itemIndex;
  }
  return next;
}
async function readPlaceholderGeometry(target,sourceItemId=null) {
  if(!target || !Number.isSafeInteger(target.compItemId) || target.compItemId<1 || !Number.isSafeInteger(target.layerId) || target.layerId<1)throw placeholderError("invalid_geometry_target");
  const result=await runExtendScriptBody(placeholderGeometry.geometryReadScript(target,sourceItemId));
  return result.result;
}
function calculateFitTransform(read,args={}) {
  const geometry=read && read.geometry;
  // Validate with the pure helper before using dimensions; no NaN/unknown pass.
  const framing=require("./placeholder-framing");
  const verification=framing.verifyPlaceholderCoverage({geometry,transform:read && read.transform});
  if(!geometry || !geometry.layer || geometry.layer.transformStatic!==true || geometry.layer.threeDLayer!==false || geometry.layer.parentLayerId!==null || geometry.layer.rotation!==0 || geometry.layer.hasMasks!==false || geometry.layer.collapseTransformation!==false ||
    ![geometry.comp,geometry.source].every(item=>item && Number.isFinite(item.width) && item.width>0 && Number.isFinite(item.height) && item.height>0 && item.pixelAspect===1))throw placeholderError("unsupported_placeholder_cover_geometry",verification);
  const aRaw=geometry.layer.anchorPoint;
  let a;
  if(Array.isArray(aRaw)) {
    if(aRaw.length===2 && Number.isFinite(aRaw[0]) && Number.isFinite(aRaw[1])) a=[aRaw[0],aRaw[1]];
    else if(geometry.layer.threeDLayer===false && aRaw.length===3 && Number.isFinite(aRaw[0]) && Number.isFinite(aRaw[1]) && aRaw[2]===0) a=[aRaw[0],aRaw[1]];
  }
  if(!a)throw placeholderError("unsupported_placeholder_cover_geometry",verification);
  const c=geometry.comp,s=geometry.source;
  const factor=args.mode==="contain" ? Math.min(c.width/s.width,c.height/s.height) : Math.max(c.width/s.width,c.height/s.height);
  if(args.mode==="stretch")throw placeholderError("unsupported_protected_stretch_fit");
  const x=args.alignX==="left" ? a[0]*factor : args.alignX==="right" ? c.width-(s.width-a[0])*factor : c.width/2+(a[0]-s.width/2)*factor;
  const y=args.alignY==="top" ? a[1]*factor : args.alignY==="bottom" ? c.height-(s.height-a[1])*factor : c.height/2+(a[1]-s.height/2)*factor;
  return {scale:[factor*100,factor*100],position:[x,y]};
}
async function requireFreshReviewRecord(owner,itemIds=null) {
  if(!placeholderReviewService.OWNER.test(owner || ""))throw placeholderError("invalid_review_owner");
  const {projectFile,state}=await currentPlaceholderState();
  const record=state.reviewArtifacts && state.reviewArtifacts[owner];if(!record)throw placeholderError("review_owner_unregistered");
  const ids=record.receipt.items.map(item=>item.itemId);
  if(itemIds!==null && (!Array.isArray(itemIds) || new Set(itemIds).size!==itemIds.length || JSON.stringify([...itemIds].sort((a,b)=>a-b))!==JSON.stringify([...ids].sort((a,b)=>a-b))))throw placeholderError("review_cleanup_requires_exact_registered_ids");
  const read=await runExtendScriptBody(placeholderReviewService.readServiceScript(ids));
  const verified=placeholderReviewService.verifyServiceReceipt(record.spec,read.result && read.result.items,state.projectKey);
  if(!read.result || !placeholderSourceRecovery.pathsEqual(read.result.projectFile,projectFile) || !verified.ok)throw placeholderError("review_artifact_drift",verified);
  return {record,projectFile,state,items:read.result.items};
}
async function reviewContentFingerprint(record) {
  const state=projectStateMemory.readProjectState(record.receipt.projectFile);
  const targets=[];
  for(const target of record.spec.targets){
    const accepted=state.acceptedPlaceholders.find(value=>placeholderProtection.targetKey(value.target)===placeholderProtection.targetKey(target.target));
    targets.push({target:target.target,protectedProperties:accepted ? accepted.properties.map(value=>value.path) : []});
    for(const edge of target.route || [])targets.push({target:{compItemId:edge.compItemId,layerId:edge.id},protectedProperties:[],isRoute:true});
  }
  const inventory=await readPlaceholderInventory({targets});
  if(!inventory.complete || !placeholderSourceRecovery.pathsEqual(inventory.projectFile,record.receipt.projectFile))throw placeholderError("review_content_inventory_incomplete");
  const fresh=placeholderReviewService.resolveReviewTargets({targets:record.spec.targets.map(target=>({target:target.target,rootCompItemId:target.rootCompItemId,routeLayerIds:target.routeLayerIds,samples:target.samples,viewKinds:target.viewKinds}))},inventory,{canonicalBinding:record.canonicalBinding});
  if(fresh.some((target,index)=>target.sourceKey!==record.spec.targets[index].sourceKey || target.sourceItemId!==record.spec.targets[index].sourceItemId))throw placeholderError("review_source_changed");
  const evidence=[];
  for(const request of targets){const raw=inventory.evidence.find(row=>row.comp && row.layer && row.comp.itemId===request.target.compItemId && row.layer.id===request.target.layerId);
    if(!raw)throw placeholderError("review_content_evidence_missing");
    if(!Array.isArray(raw.unsupported) || raw.unsupported.some(reason=>!(request.isRoute && reason==="unsupported_selected_non_video_source")))throw placeholderError("unsupported_review_content_animation_or_properties");
    const row=placeholderEvidence.projectPlaceholderLayerEvidence(raw);
    row.properties=raw.properties;
    delete row.comp.itemIndex;delete row.layer.index;
    if(!row.transform || !["anchorPoint","position","scale","rotation"].every(field=>row.transform[field]!==undefined))throw placeholderError("review_content_transform_missing");
    evidence.push(row);
  }
  return placeholderReviewService.hash({evidence,targets:fresh.map(target=>({target:target.target,route:target.route,root:target.root,comp:target.comp,source:target.source,sourceKey:target.sourceKey,samples:target.samples}))});
}
function canonicalCaptureDependencies(){return {readApplication:id=>planRunRecords.readRecord(LOG_DIR,id,{throwOnError:true}),run:runExtendScriptBody,exportRoot:GENERATED_EXPORT_DIR,
  readNativeLayer:(target,sourceId)=>require("./montage-native").readNativeLayer(target,sourceId,runExtendScriptBody),
  readRouteEdge:async target=>require("./montage-native").routeEdge(await require("./montage-native").readNativeLayer(target,null,runExtendScriptBody))};}
function canonicalExportContext(){
 const c=evidenceContext.getStore() || {},p=planCommandContext.getStore();
 if(!p?.item || !c.runId || !c.actionId || !c.proposalRevision || !c.planSha256 || !c.stepIndex)throw placeholderError("canonical_capture_requires_proposal_runner");
 return {runId:c.runId,actionId:c.actionId,proposalRevision:c.proposalRevision,planSha256:c.planSha256,stepIndex:c.stepIndex};
}
function canonicalNativeCommandId(readerId){
 const rows=planCommandContext.getStore()?.item?.commands || [],matches=rows.filter(c=>c.state==="completed" && c.ok===true && c.result?.nativeCaptureGraph?.before?.readerId===readerId);
 if(matches.length!==1)throw placeholderError("canonical_capture_native_command_unproven");return matches[0].id;
}
async function readCurrentSourceLoadEvidence(sourceItemId){
 const current=await currentPlaceholderState(),epoch=current.state.sourceLoadEpochs?.[sourceItemId];
 if(!epoch)throw placeholderError("native_source_load_epoch_unproven");
 montageCaptureService.validateLoadEpoch(epoch,current.state);
 const native=await runExtendScriptBody(montageCaptureService.nativeSourceScopeScript(epoch.scope));
 if(native?.ok===false || !native?.result)throw placeholderError("native_source_load_read_failed");
 if(require("./montage-contract").stableJson(native.result.nativeReload.after)!==require("./montage-contract").stableJson(epoch.independentNativeRead.nativeReload.after))throw placeholderError("native_source_load_metadata_changed");
 const reference=montageCaptureService.sourceFileReference(epoch.scope,native.result),files=montageCaptureService.readContributingFiles([reference]);
 montageCaptureService.assertSourceLoadEpochs(files,current.state);
 const final=await currentPlaceholderState();if(final.state.revision!==current.state.revision || !placeholderSourceRecovery.pathsEqual(final.projectFile,current.projectFile))throw placeholderError("native_source_load_project_changed");
 return {ok:true,epoch,nativeRead:native.result,files,acceptance:false};
}
async function trustedPlaceholderAction(body) {
  if (body.snapshot !== undefined || body.acceptedPlaceholders !== undefined || body.allowProtectedChanges !== undefined || body.target !== undefined) throw placeholderError("client_acceptance_snapshot_forbidden");
  const actions = ["accept", "release", "map_group", "constraints"];
  if (!actions.includes(body.action)) throw placeholderError("unknown_placeholder_panel_action");
  projectStateMemory.loadProjectStateStore();
  if (body.useSelectedProperties !== undefined && typeof body.useSelectedProperties !== "boolean") throw placeholderError("use_selected_properties_requires_boolean");
  const inventory = await readPlaceholderInventory({ selected: true, protectedProperties: body.protectedProperties || [], useSelectedProperties: body.useSelectedProperties === true });
  const projectFile = inventory.projectFile;
  const state = projectStateController.read(projectFile);
  if (!inventory.complete) throw placeholderError("incomplete_acceptance_inventory");
  if (body.action !== "constraints" && inventory.selectedTargets.length !== 1) throw placeholderError("select_one_placeholder_layer");
  const evidence = inventory.evidence[0];
  const target = inventory.selectedTargets[0];
  let next;
  if (body.action === "release") next = projectStateController.release(projectFile, target, state.revision);
  else if (body.action === "accept") {
    const snapshot = placeholderProtection.snapshotFromEvidence(evidence, inventory, inventory.selectedProtectedProperties || body.protectedProperties || []);
    next = projectStateController.accept(projectFile, snapshot, state.revision);
  } else if (body.action === "map_group") {
    if (typeof body.groupId !== "string" || !body.groupId.trim() || body.groupId.length > 120) throw placeholderError("explicit_group_id_required");
    if (!evidence || !evidence.layer || !evidence.layer.source) throw placeholderError("selected_video_source_unavailable");
    const source = inventory.sources.find(value => value.itemId === evidence.layer.source.itemId);
    if (!source || source.type !== "footage" || source.hasVideo !== true || source.footageMissing !== false) throw placeholderError("unsupported_selected_non_video_source");
    const mediaKey = placeholderUsage.mediaKeyForSource(source);
    if (mediaKey === "unknown") throw placeholderError("source_media_identity_unavailable");
    next = projectStateController.mapGroup(projectFile, { mediaKey, groupId: body.groupId.trim() }, state.revision);
  } else {
    if (typeof body.distinctGroups !== "boolean" || typeof body.disallowSourceOverlap !== "boolean") throw placeholderError("explicit_assignment_constraints_required");
    for (const value of inventory.evidence) {
      const source = value.layer && value.layer.source && inventory.sources.find(item => item.itemId === value.layer.source.itemId);
      if (!source || source.type !== "footage" || source.hasVideo !== true || source.footageMissing !== false ||
        !require("./placeholder-timing").isValidStretch(value.layer.stretch) || value.layer.timeRemapEnabled !== false) throw placeholderError("unsupported_selected_video_timing");
    }
    next = projectStateController.setConstraints(projectFile, { distinctGroups: body.distinctGroups, disallowSourceOverlap: body.disallowSourceOverlap,
      selectedTargets: inventory.selectedTargets }, state.revision);
  }
  recordEvent("placeholder_trusted_panel_action", { action: body.action, projectKey: next.projectKey, revision: next.revision, target });
  return { ok: true, projectKey: next.projectKey, revision: next.revision, acceptedCount: next.acceptedPlaceholders.length,
    groupMappings: next.groupMappings, constraints: next.constraints, target };
}

function startHttpBridge() {
  if(initialRuntime)initialRuntime.assertStartup();
  ownedRuntimeStartup=require("./owned-runtime-supervisor").assertStartupReservation(PROJECT_ROOT,{generation:process.env.AE_OWNED_RUNTIME_GENERATION,bootNonce:process.env.AE_OWNED_RUNTIME_BOOT_NONCE,pid:process.pid,argv:process.argv,sourceSha256:RUNTIME_IDENTITY.sourceSha256});
  const server = http.createServer((req, res) => {
    try{ownedRuntimeService.ingress(req,()=>Promise.resolve().then(async () => {
    httpBoundary.validate(req);
    res.allowedOrigin = req.headers.origin || null;
    res.authRole = httpBoundary.role(req);
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    if (url.searchParams.has("token")) { writeJson(res, 401, {ok:false, error:"URL credentials are not accepted."}); return; }

    if (req.method === "OPTIONS") {
      writeJson(res, 204, {});
      return;
    }

    if (url.pathname === "/health") {
      const status = getBridgeStatus();
      writeJson(res, 200, {
        ok: true,
        server: status.server,
        version: status.version,
        hasToken: Boolean(TOKEN),
        port: status.port,
        pending: status.pendingCommands,
        inflight: status.inflightCommands.length,
        panelConnected: status.panelConnected,
        lastPanelSeenAt: status.lastPanelSeenAt,
        m100RiskPolicy: status.m100RiskPolicy
      });
      return;
    }
    if (req.method === "POST" && res.authRole) req.parsedJsonBody = await readJsonObject(req, HTTP_BODY_LIMIT);

    if(url.pathname.startsWith("/runtime/owned/")) {
      if(!requireToken(req,res,url))return;
      if(res.authRole!=="automation"){writeJson(res,403,{ok:false,code:"owned_runtime_automation_role_required"});return;}
      try {
        if(url.pathname==="/runtime/owned/status" && req.method==="GET"){writeJson(res,200,{...ownedRuntimeService.status(),readiness:ownedRuntimeService.readiness()});return;}
        if(url.pathname==="/runtime/owned/register" && req.method==="POST"){const input=await readJsonBody(req),registration=require("./owned-runtime-supervisor").registerCurrentDaemon(PROJECT_ROOT,input,{pid:process.pid,argv:process.argv,sourceSha256:RUNTIME_IDENTITY.sourceSha256,bootNonce:process.env.AE_OWNED_RUNTIME_BOOT_NONCE,serviceStartedAt:new Date(STARTED_AT).toISOString()});writeJson(res,200,{ok:true,registration});return;}
        if(url.pathname==="/runtime/owned/cleanup-fixtures-once" && req.method==="POST"){const input=await readJsonBody(req);ownedRuntimeAuthority.exact(input,["runId"]);if(!require("./native-fixture-attempt-ledger").UUID.test(input.runId || ""))throw Object.assign(Error("owned_fixture_cleanup_run_selector_invalid"),{code:"owned_fixture_cleanup_run_selector_invalid"});require("./owned-runtime-product-activation").assertNativeAuthority(PROJECT_ROOT);const result=await ownedRuntimeService.run("completion",()=>ameFixtureExecutor.flushCleanup(input.runId));writeJson(res,200,{ok:true,...result});return;}
        if(req.method!=="POST" || !["/runtime/owned/drain-once","/runtime/owned/shutdown-once"].includes(url.pathname)){writeJson(res,404,{ok:false,code:"owned_runtime_route_invalid"});return;}
        const input=await readJsonBody(req),result=url.pathname.endsWith("drain-once")?ownedRuntimeService.drainOnce(input):ownedRuntimeService.shutdownOnce(input,res);
        writeJson(res,result.ok?200:409,result);
      }catch(error){writeJson(res,409,{ok:false,code:error.code || "owned_runtime_operation_refused",replayAllowed:false});}
      return;
    }

    if (url.pathname === "/placeholder/protection") {
      if (!requireToken(req, res, url)) return;
      if (res.authRole !== "panel") { writeJson(res, 403, { ok: false, code: "placeholder_panel_role_required" }); return; }
      try {
        if (req.method === "GET") writeJson(res, 200, await getPlaceholderProtection());
        else if (req.method === "POST") writeJson(res, 200, await trustedPlaceholderAction(await readJsonBody(req)));
        else writeJson(res, 405, { ok: false, code: "method_not_allowed" });
      } catch (error) { writeJson(res, 409, { ok: false, code: error.code || error.message, error: error.message, details: error.details }); }
      return;
    }

    if (url.pathname === "/autonomy/session" && req.method === "GET") {
      if (!requireToken(req, res, url)) return;
      writeJson(res, 200, { ok: true, session: autonomousSession.publicStatus() });
      return;
    }

    if (url.pathname === "/autonomy/session" && req.method === "POST") {
      if (!requireToken(req, res, url)) return;
      try {
        const body = await readJsonBody(req);
        lifecycle.assertMutationAllowed();
        if (typeof body.enabled !== "boolean") throw new Error("enabled must be boolean.");
        const enabled = body && body.enabled === true;
        const session = enabled ? autonomousSession.activate(body) : autonomousSession.revoke(body);
        recordEvent(enabled ? "autonomous_session_enabled" : "autonomous_session_revoked", {
          capability: session.capability,
          active: session.active,
          expiresAt: session.expiresAt,
          panelConnectionIdHash: crypto.createHash("sha256").update(String(body.panelConnectionId || "")).digest("hex").slice(0, 12)
        });
        writeJson(res, 200, { ok: true, session });
      } catch (error) {
        writeJson(res, 409, { ok: false, error: error.message || String(error) });
      }
      return;
    }

    if (url.pathname === "/dev/status" && req.method === "GET") {
      if (!requireToken(req, res, url)) return;
      writeJson(res, 200, getBridgeStatus());
      return;
    }

    if (url.pathname === "/dev/logs" && req.method === "GET") {
      if (!requireToken(req, res, url)) return;
      const limit = Math.max(1, Math.min(200, Math.floor(Number(url.searchParams.get("limit") || 50))));
      writeJson(res, 200, { ok: true, logFile: LOG_FILE, events: tailJsonl(LOG_FILE, limit) });
      return;
    }

    if (url.pathname === "/dev/tools" && req.method === "GET") {
      if (!requireToken(req, res, url)) return;
      writeJson(res, 200, { ok: true, tools: exposedTools() });
      return;
    }

    

    

    

    

    

    



    

    

    if (url.pathname === "/agents/plan/current" && req.method === "GET") {
      if (!requireToken(req, res, url)) return;
      const current = currentProposalState.snapshot();
      if (current) current.validation = validateAgentPlanWithRepair(current.plan, current.proposal.requestId, {}, {repairPlan: false}).validation;
      writeJson(res, 200, {ok: true, current});
      return;
    }

    if (url.pathname === "/agents/plan/adopt" && req.method === "POST") {
      if (!requireToken(req, res, url)) return;
      const requestedAt = Date.now();
      let adoptionBody;
      try {
        const body = await readJsonBody(req);
        adoptionBody = body;
        const record = currentProposalState.current;
        currentProposalState.assertCurrent(record);
        if (body.actionId !== record.actionId || body.revision !== record.revision) throw m100ProtocolError("plan_superseded", "Выбранный план уже заменён.");
        if (["executing", "completed", "failed", "cancelled"].includes(record.executionState)) throw m100ProtocolError("plan_not_pending", "План уже запущен или завершён; повтор запрещён.");
        const panel = lastPanelInfo || {};
        if (body.panelConnectionId !== panel.panelConnectionId || String(body.panelGeneration) !== String(panel.panelGeneration)
          || Date.now() - lastPanelSeenAt >= 15000) throw m100ProtocolError("panel_identity_mismatch", "Подтверждение доступно только подключённой CEP-панели.");
        const proposed = await createM100AgentPlanProposalFromRequest({plan: record.payload.plan,
          confirmationSessionId: String(body.confirmationSessionId || ""), confirmationSurface: "cep-panel", repairPlan: false}, {
          expectedCurrent: record,
          lineage: {rootActionId: record.rootActionId, parentActionId: record.parentActionId, repairAttempt: record.repairAttempt || 0},
          beforeRegister: () => {
            currentProposalState.assertCurrent(record);
            if (record.executionState !== "pending") throw m100ProtocolError("plan_not_pending", "Состояние плана изменилось во время подготовки.");
          }
        });
        writeJson(res, 200, {ok: true, ...proposed, revision: proposed.proposal.revision});
      } catch (error) {
        recordAutonomyObstacle({operation: "adopt_ai_agent_plan", proposalId: adoptionBody && adoptionBody.actionId,
          code: error.code || "adoption_failed", phase: "proposal", durationMs: Date.now() - requestedAt, failedSteps: 1});
        writeJson(res, 400, m100HttpFailure(error, {fallbackPhase: "confirmation_validation"}));
      }
      return;
    }

    if ((url.pathname === "/agents/plan/propose" || url.pathname === "/dev/agents/plan/propose") && req.method === "POST") {
      if (!requireToken(req, res, url)) return;
      try {
        const body = await readJsonBody(req);
        const proposed = await createM100AgentPlanProposalFromRequest(body || {});
        writeJson(res, 200, {
          ok: true,
          proposal: proposed.proposal,
          validation: proposed.validation,
          planRepair: proposed.planRepair,
          repairedPlan: proposed.repairedPlan
        });
      } catch (error) {
        const failure = m100HttpFailure(error, {
          fallbackPhase: "protocol_validation",
          fallbackCode: error.code || "m100_action_proposal_create_failed"
        });
        failure.validation = error.validation || null;
        writeJson(res, 400, failure);
      }
      return;
    }

    if ((url.pathname === "/agents/plan/validate" || url.pathname === "/dev/agents/plan/validate") && req.method === "POST") {
      if (!requireToken(req, res, url)) return;
      try {
        const body = await readJsonBody(req);
        const plan = body.plan || body;
        const prepared = validateAgentPlanWithRepair(plan, body.requestId || body.validationId || null, {
          solutionHints: body.solutionHints || body.planSolutionHints || null,
          projectIntentMemory: body.projectIntentMemory || body.planProjectIntentMemory || null
        }, {
          repairPlan: body.repairPlan
        });
        const validation = prepared.validation;
        writeJson(res, 200, {
          ok: true,
          validation,
          classification: validation.classification || null,
          planRepair: prepared.repair || null,
          repairedPlan: prepared.repair && prepared.repair.applied ? prepared.plan : null
        });
      } catch (error) {
        writeJson(res, 400, {
          ok: false,
          error: error.message || String(error)
        });
      }
      return;
    }

    if ((url.pathname === "/agents/plan/run" || url.pathname === "/dev/agents/plan/run" || url.pathname === ameManualQueue.ROUTE) && req.method === "POST") {
      if (!requireToken(req, res, url)) return;
      const requestedAt = Date.now();
      let runBody;
      try {
        const body = await readJsonBody(req);
        runBody = body;
        const queueRoute = url.pathname === ameManualQueue.ROUTE;
        const execute = () => manualPlanIngress.runAuthenticated({ route: queueRoute ? "/agents/plan/run" : url.pathname, authRole: res.authRole,
          key: m100PlanRunLookupKey(body || {}) }, () => runValidatedAgentPlan(body || {}));
        let run;
        if (queueRoute) {
          const witness = body.ameManualQueueWitness;
          if (!witness || Object.keys(witness).sort().join(",") !== "acceptedDryRunId,declaration,manifestHash,panelConnectionId,panelGeneration,trustedGesture") throw Object.assign(new Error("ame_manual_queue_witness_required"), { code: "ame_manual_queue_witness_required" });
          const record = currentProposalState.current, steps = record?.payload?.plan?.steps;
          if (!Array.isArray(steps) || steps.length !== 1 || steps[0].tool !== ameTitleJobs.START || body.dryRun !== false || body.confirm !== true ||
              ameTitleJobs.validateInput(ameTitleJobs.START, steps[0].args || {}).manualQueueMode !== "cep_user_declaration_v2" || steps[0].args.manualQueueManifestSha25664 !== witness.manifestHash) {
            throw Object.assign(new Error("ame_manual_queue_exact_start_plan_required"), { code: "ame_manual_queue_exact_start_plan_required" });
          }
          run = await ameManualQueueIssuer.runAuthenticated({ ...witness, route: url.pathname, authRole: res.authRole,
            panelIdentityValid: Boolean(lastPanelInfo && lastPanelInfo.panelConnectionId === witness.panelConnectionId && lastPanelInfo.panelGeneration === witness.panelGeneration) }, execute);
        } else {
          if (body.ameManualQueueWitness) throw Object.assign(new Error("ame_manual_queue_protected_route_required"), { code: "ame_manual_queue_protected_route_required" });
          run = await execute();
        }
        if(ameFixtureExecutor.cleanupSelector(run.id))res.once("finish",()=>{Promise.resolve().then(()=>ownedRuntimeService.run("completion",()=>ownedFixtureCleanupReconciler.resume(run.id))).catch(error=>recordEvent("owned_fixture_cleanup_pending",{runId:run.id,code:error.code || "owned_fixture_cleanup_pending",historicalOutcome:"unknown",replayAllowed:false}));});
        writeJson(res, run.ok ? 200 : 400, {
          ok: run.ok,
          run,
          diagnostic: run.diagnostic || null,
          m100Message: run.m100Message || null,
          code: run.errorCode || run.diagnostic && run.diagnostic.code || null,
          phase: run.diagnostic && run.diagnostic.phase || null
        });
      } catch (error) {
        recordAutonomyObstacle({operation: "run_ai_agent_plan", proposalId: runBody && runBody.actionId,
          code: error.code || "plan_run_rejected", phase: "execution", durationMs: Date.now() - requestedAt, failedSteps: 1});
        writeJson(res, 400, m100HttpFailure(error, {
          fallbackPhase: m100PhaseForError(error, "protocol_validation")
        }));
      }
      return;
    }

    

    

    if (url.pathname === "/tools" && req.method === "GET") {
      if (!requireToken(req, res, url)) return;
      writeJson(res, 200, { ok: true, tools: exposedTools() });
      return;
    }

    if (url.pathname === "/tools/call" && req.method === "POST") {
      if (!requireToken(req, res, url)) return;

      try {
        const body = await readJsonBody(req);
        const name = String(body.name || "");
        const args = panelControl.isPanelControlTool(name)
          ? (Object.prototype.hasOwnProperty.call(body, "arguments") ? body.arguments : {})
          : (body.arguments || {});
        const result = decorateDaemonToolResult(name, await callToolLogged("direct-tools-call", name, args));
        writeJson(res, 200, {
          ok: true,
          tool: name,
          result
        });
      } catch (error) {
        writeJson(res, 500, m100HttpFailure(error, {
          fallbackPhase: "ae_execution"
        }));
      }
      return;
    }

    if (url.pathname === "/mcp/tools/call" && req.method === "POST") {
      if (!requireToken(req, res, url)) return;
      if (req.headers["x-ae-mcp-adapter"] !== "codex-stdio-v1") {
        writeJson(res, 403, { ok: false, error: "Official MCP adapter marker is required." });
        return;
      }
      try {
        const body = await readJsonBody(req);
        const name = String(body.name || "");
        const args = panelControl.isPanelControlTool(name)
          ? (Object.prototype.hasOwnProperty.call(body, "arguments") ? body.arguments : {})
          : (body.arguments || {});
        const authority = autonomousSession.authorization();
        if ([panelBootstrap.TOOL_NAME,panelBootstrap.RECOVERY_TOOL_NAME].includes(name) && res.authRole !== "automation") {
          writeJson(res, 403, {ok:false, code:"bootstrap_automation_role_required"});
          return;
        }
        if (panelControl.isPanelControlTool(name) && res.authRole !== "automation") {
          writeJson(res, 403, {ok:false, code:"panel_control_automation_role_required"});
          return;
        }
        const result = decorateDaemonToolResult(name, await callToolLogged("mcp-adapter", name, args, {
          autonomousSession: authority,
          panelBootstrapAuthority: [panelBootstrap.TOOL_NAME,panelBootstrap.RECOVERY_TOOL_NAME].includes(name) ? PANEL_BOOTSTRAP_AUTHORITY : null,
          panelControlAuthority: PANEL_CONTROL_AUTHORITY
        }));
        writeJson(res, 200, { ok: true, tool: name, result });
      } catch (error) {
        writeJson(res, 500, m100HttpFailure(error, { fallbackPhase: "ae_execution" }));
      }
      return;
    }

    if (url.pathname.startsWith("/dev/tool/") && (req.method === "GET" || req.method === "POST")) {
      if (!requireToken(req, res, url)) return;

      const name = decodeURIComponent(url.pathname.slice("/dev/tool/".length));
      if (req.method === "GET" && classifyM100ToolRisk(name).riskLevel !== "read_only") {
        writeJson(res, 405, {ok:false, code:"get_mutation_forbidden"}); return;
      }
      if (name === projectSave.TOOL_NAME || projectLifecycleContract.isLifecycleMutation(name)) {
        writeJson(res, 403, {ok:false, code:name === projectSave.TOOL_NAME ? "project_save_manual_only" : "lifecycle_manual_only"}); return;
      }
      const args = {};

      for (const [key, value] of url.searchParams.entries()) {
        if (key !== "token") args[key] = value;
      }

      if (req.method === "POST") {
        Object.assign(args, await readJsonBody(req));
      }

      try {
        const result = await callToolLogged(res.authRole === "admin" ? "dev-admin-http" : "dev-http", name, args);
        writeJson(res, result.isError ? 500 : 200, {
          ok: !result.isError,
          tool: name,
          result: parseToolText(result.content[0].text)
        });
      } catch (error) {
        writeJson(res, 500, {
          tool: name,
          ...m100HttpFailure(error, {
            fallbackPhase: "ae_execution"
          })
        });
      }
      return;
    }

    if (url.pathname === "/dev/ping-ae" && req.method === "GET") {
      if (!requireToken(req, res, url)) return;
      try {
        const result = await runExtendScriptBody(`
          return {
            appName: app.name,
            appVersion: app.version,
            projectItems: app.project ? app.project.numItems : 0,
            activeItemName: app.project && app.project.activeItem ? app.project.activeItem.name : null,
            timestamp: (new Date()).toString()
          };
        `, 8000);
        writeJson(res, 200, { ok: true, result: result.result });
      } catch (error) {
        writeJson(res, 500, m100HttpFailure(error, {
          fallbackPhase: "ae_execution"
        }));
      }
      return;
    }

    if (url.pathname.startsWith("/ame/native-fixture-admission-refusal/")) {
      res.setHeader("Cache-Control","no-store");
      if(!requireToken(req,res,url))return;
      if(url.pathname!=="/ame/native-fixture-admission-refusal/lookup" || req.method!=="GET"){writeJson(res,404,{ok:false,code:"fixture_refusal_route_invalid"});return;}
      if(res.authRole!=="panel"){writeJson(res,403,{ok:false,code:"fixture_refusal_panel_role_required"});return;}
      try {
        if(url.searchParams.size || Number(req.headers["content-length"] || 0)!==0 || req.headers["transfer-encoding"])throw Object.assign(Error("fixture_refusal_client_evidence_forbidden"),{code:"fixture_refusal_client_evidence_forbidden"});
        writeJson(res,200,{ok:true,credentialRole:"panel",refusal:await nativeFixtureAdmissionRefusal.lookup(nativeRefusalReaders())});
      }catch(error){writeJson(res,409,{ok:false,code:error.code || error.message || "fixture_refusal_lookup_failed"});}
      return;
    }
    if (url.pathname.startsWith("/ame/native-fixture-prephase-recovery/")) {
      if(!requireToken(req,res,url))return;
      const operation=url.pathname.slice("/ame/native-fixture-prephase-recovery/".length);
      if(!["capture","publish","lookup","maintenance-read-back","maintenance-quiescence"].includes(operation) || req.method!==(["lookup","maintenance-read-back","maintenance-quiescence"].includes(operation) ? "GET" : "POST")){writeJson(res,404,{ok:false,code:"fixture_prephase_route_invalid"});return;}
      if(res.authRole!==(operation==="lookup" ? "panel" : "automation")){writeJson(res,403,{ok:false,code:"fixture_prephase_role_required"});return;}
      try {
        if(url.searchParams.size || ["lookup","maintenance-read-back","maintenance-quiescence"].includes(operation) && (Number(req.headers["content-length"] || 0)!==0 || req.headers["transfer-encoding"]))throw Object.assign(Error("fixture_prephase_client_evidence_forbidden"),{code:"fixture_prephase_client_evidence_forbidden"});
        if(operation==="maintenance-quiescence"){writeJson(res,200,{ok:true,inspection:await nativeFixturePrephaseRecovery.maintenanceQuiescence(nativePrephaseMaintenanceReaders())});return;}
        const input=["lookup","maintenance-read-back"].includes(operation) ? nativeFixturePrephaseProof.selector() : await readJsonBody(req);
        const result=await nativeFixturePrephaseRecovery[operation==="maintenance-read-back" ? "lookup" : operation](input,nativePrephaseReaders());
        writeJson(res,200,{ok:true,[operation==="capture" ? "capture" : "certificate"]:result});
      }catch(error){writeJson(res,409,{ok:false,code:error.code || error.message || "fixture_prephase_failed"});}
      return;
    }
    if (url.pathname.startsWith("/ame/native-fixture-abandonment/")) {
      if (!requireToken(req,res,url)) return;
      const operation=url.pathname.slice("/ame/native-fixture-abandonment/".length);
      if (!["capture","authorize","lookup","retire"].includes(operation) || req.method!==(operation==="lookup" ? "GET" : "POST")) {
        writeJson(res,404,{ok:false,code:"fixture_abandonment_route_invalid"});return;
      }
      if(res.authRole!==(operation==="lookup" ? "panel" : "automation")){writeJson(res,403,{ok:false,code:"fixture_abandonment_role_required"});return;}
      try {
        const readers=nativeFixtureAbandonmentBackend.createReaders({evidenceRoot:LOG_DIR,projectRoot:PROJECT_ROOT,panelService:panelControlService,
          readBridgeStatus:getBridgeStatus,loadedRuntimeSha256:RUNTIME_IDENTITY.sourceSha256,currentRuntimeSha256:()=>reviewEvidence.runtimeIdentity(PROJECT_ROOT).sourceSha256,
          executorQuiescence:()=>ameFixtureExecutor.quiescence()});
        let input;
        if(operation==="lookup") {
          if(Array.from(url.searchParams.keys()).sort().join(",")!=="requestId,runId")throw Object.assign(Error("fixture_abandonment_selector_invalid"),{code:"fixture_abandonment_selector_invalid"});
          input={requestId:url.searchParams.get("requestId"),runId:url.searchParams.get("runId")};
        } else input=await readJsonBody(req);
        const retainedBranch=operation==="capture" && Object.keys(input).join(",")==="selector" || operation==="authorize" && Object.keys(input).join(",")==="captureId" || operation==="retire" && require("./native-fixture-retained").read(LOG_DIR,"disposition",input.requestId);
        const retainedLookup=operation==="lookup" && (require("./native-fixture-retained").read(LOG_DIR,"disposition",input.requestId) || fs.existsSync(require("./native-fixture-retained").managedFile(PROJECT_ROOT,input.runId)));
        const result=await ownedRuntimeService.run(operation==="lookup" || retainedBranch?"completion":"execution",()=>nativeFixtureAbandonment[operation](input,retainedBranch || retainedLookup?nativeRetainedReaders():readers));
        writeJson(res,200,{ok:true,[operation==="capture" ? "capture" : "disposition"]:result});
      } catch(error){writeJson(res,409,{ok:false,code:error.code || error.message || "fixture_abandonment_failed"});}
      return;
    }
    if (url.pathname.startsWith("/ame/fixture-ui-disposition/")) {
      if (!requireToken(req,res,url)) return;
      const operation = url.pathname.slice("/ame/fixture-ui-disposition/".length);
      if (!["capture","authorize","lookup"].includes(operation) || req.method !== (operation === "lookup" ? "GET" : "POST")) {
        writeJson(res,404,{ok:false,code:"fixture_disposition_route_invalid"}); return;
      }
      if (res.authRole !== (operation === "lookup" ? "panel" : "automation")) {
        writeJson(res,403,{ok:false,code:"fixture_disposition_role_required"}); return;
      }
      try {
        const readers = ameFixtureUIBackend.createReaders({evidenceRoot:LOG_DIR, projectRoot:PROJECT_ROOT,
          panelService:panelControlService, readBridgeStatus:getBridgeStatus,
          loadedRuntimeSha256:RUNTIME_IDENTITY.sourceSha256,
          currentRuntimeSha256:() => reviewEvidence.runtimeIdentity(PROJECT_ROOT).sourceSha256,
          executorQuiescence:() => ameFixtureExecutor.quiescence()});
        const result = operation === "lookup" ? await ameFixtureDisposition.lookup(readers) :
          await ameFixtureDisposition[operation](await readJsonBody(req),readers);
        writeJson(res,200,{ok:true,[operation === "capture" ? "capture" : "disposition"]:result});
      } catch (error) { writeJson(res,409,{ok:false,code:error.code || error.message || "fixture_disposition_failed"}); }
      return;
    }
    if(url.pathname==="/panel-lifecycle-causal/lookup" && req.method==="GET"){
      if(!requireToken(req,res,url))return;
      if(res.authRole!=="panel"){writeJson(res,403,{ok:false,code:"panel_causal_panel_role_required"});return;}
      try{
        const causal=require("./panel-lifecycle-causal"),keys=[...url.searchParams.keys()];
        if(req.url.length>2048 || keys.sort().join(",")!=="actor,nonce,sequence")throw Object.assign(Error("panel_causal_lookup_query_invalid"),{code:"panel_causal_lookup_query_invalid"});
        const frame=causal.lookupFrame({nonce:url.searchParams.get("nonce"),sequence:Number(url.searchParams.get("sequence")),actor:JSON.parse(url.searchParams.get("actor"))});
        const store=causal.privateStore();
        if(!store.read("certificate")){writeJson(res,200,{ok:true,causal:null});return;}
        // This observation owns no execution/bootstrap ticket. Readiness still
        // gates external maintenance and every native/resource operation.
        const assertObservation=()=>{const ctx=ownedRuntimeService.context?.getStore(),s=ownedRuntimeService.status(),c=store.certificate(),own=causal.tupleStamp({generation:process.env.AE_OWNED_RUNTIME_GENERATION,bootNonce:process.env.AE_OWNED_RUNTIME_BOOT_NONCE,pid:process.pid,startedAt:new Date(STARTED_AT).toISOString(),loadedSourceSha256:RUNTIME_IDENTITY.sourceSha256});if(ctx?.kind!=="observation"||ctx.executionEntitled!==false||ctx.bootstrapEntitled||!c||!s.owned||s.generation!==c.runtime.registration.generation||s.draining||s.closing||own!==causal.runtimeStamp(c.runtime))throw Object.assign(Error("panel_causal_lookup_observation_required"),{code:"panel_causal_lookup_observation_required"});};
        assertObservation();const result=await store.lookup(frame);assertObservation();writeJson(res,200,{ok:true,causal:result});
      }catch(error){writeJson(res,409,{ok:false,code:error.code || "panel_causal_lookup_refused"});}
      return;
    }
    if(url.pathname==="/human-guard-settlement/lookup" && req.method==="GET"){
      if(!requireToken(req,res,url))return;
      if(res.authRole!=="panel"){writeJson(res,403,{ok:false,code:"human_settlement_panel_role_required"});return;}
      try{writeJson(res,200,{ok:true,settlement:humanGuardSettlement.lookup(LOG_DIR)});}
      catch(error){writeJson(res,409,{ok:false,code:error.code || "human_settlement_lookup_failed"});}
      return;
    }
    if(url.pathname==="/human-guard-settlement/maintenance" && req.method==="POST"){
      if(!requireToken(req,res,url))return;
      if(res.authRole!=="automation"){writeJson(res,403,{ok:false,code:"human_settlement_automation_role_required"});return;}
      const args=await readJsonBody(req);
      if(!args || Object.keys(args).some(k=>!["reason","confirmation","authorizationSource","captureSha256"].includes(k))){writeJson(res,400,{ok:false,code:"human_settlement_client_evidence_forbidden"});return;}
      let lock;
      try{
        lock=panelControl.acquireControllerLock(path.join(LOG_DIR,"core-cep-panel-control"),crypto.randomUUID());
        const maintenance=require("../scripts/human-guard-settlement-maintenance"),configuration={host:HOST,port:PORT,credentialIdentity:humanGuardSettlement.hash(TOKEN)},capture=humanGuardSettlement.validateCapture(LOG_DIR,humanGuardSettlement.read(LOG_DIR,"capture"),configuration),service=panelControl.createPanelControlService({inspectInstalledTarget:maintenance.baselineInspector(LOG_DIR,capture)}),before=getBridgeStatus(),selected=await service.maintenanceTarget();
        humanGuardSettlement.assertRuntime(RUNTIME_IDENTITY,capture.implementationSha256,reviewEvidence.sha256(reviewEvidence.runtimeNamedHashSet(PROJECT_ROOT)));
        humanGuardSettlement.assertIdle(before,selected.state);humanGuardSettlement.assertExactGuards(selected.state);
        const entries=await maintenance.collectEntries(LOG_DIR,service),loadedHashes=await maintenance.loadedHashes(selected),hosts=await humanGuardSettlement.discoverHosts(),after=getBridgeStatus(),again=await service.maintenanceTarget();
        humanGuardSettlement.assertIdle(after,again.state);
        if(!humanGuardSettlement.equal(selected,again))throw Object.assign(Error("human_settlement_target_changed"),{code:"human_settlement_target_changed"});
        const proof=humanGuardSettlement.authorize(LOG_DIR,args,{configuration,daemon:after.humanGuardRuntime,status:after,selected:again,entries,loadedHashes,hosts});
        writeJson(res,200,{ok:true,settlement:proof});
      }catch(error){writeJson(res,409,{ok:false,code:error.code || "human_settlement_maintenance_failed"});}
      finally{if(lock)lock.release();}
      return;
    }
    if(url.pathname==="/common-title-recovery/maintenance" && req.method==="POST"){
      if(!requireToken(req,res,url))return;
      const args=await readJsonBody(req);commonTitleRecovery.inputs(args);
      const lock=panelControl.acquireControllerLock(path.join(LOG_DIR,"core-cep-panel-control"),crypto.randomUUID());
      try{
        commonTitleRecovery.idle(getBridgeStatus());
        const record=planRunRecords.readRecord(LOG_DIR,args.runId,{throwOnError:true}),original=await panelControlService.readRecoveryLinkage(args.originalRequestId),capsule=commonTitleRecovery.read(LOG_DIR,"capsule");
        const c=commonTitleRecovery.validateCapsule(capsule,record,original.local),selected=await panelControlService.maintenanceTarget(),s=selected.state;
        commonTitleRecovery.validateLinkage(record,original.local,original.remote);
        if(commonTitleRecovery.read(LOG_DIR,"maintenance") || c.configuration?.host!==HOST || c.configuration?.port!==PORT || c.configuration?.credentialIdentity!==crypto.createHash("sha256").update(TOKEN).digest("hex") || !s || s.nativeControlIdle!==true || s.panelInstanceId!==c.oldPanelBinding.panelInstanceId || s.panelLifecycleEpoch!==c.oldPanelBinding.panelLifecycleEpoch || s.panelGeneration!==c.oldPanelBinding.panelGeneration || s.bridgeConnection?.panelConnectionId!==c.panelConnectionId || s.unresolvedActions?.length!==1 || s.unresolvedActions[0].requestId!==args.originalRequestId || selected.installed.indexPath!==c.installed.indexPath)throw new Error("common_title_reload_scope_ambiguous_or_reserved");
        const scope=commonTitleRecovery.write(LOG_DIR,"maintenance",{schema:"ae-agent-common-title-reload-authorization.v1",scopeId:crypto.randomUUID(),status:"reload_authorized",capsuleSha256:capsule.sha256,runId:args.runId,originalRequestId:args.originalRequestId,currentBinding:c.oldPanelBinding,installed:selected.installed,target:selected.target,expiresAt:c.expiresAt,verifierRuntime:RUNTIME_IDENTITY,guardReleased:false,replayAllowed:false});
        writeJson(res,200,{ok:true,authorization:scope});
      }finally{lock.release();}
      return;
    }
    if (url.pathname.startsWith("/results/") && req.method === "GET") {
      if (!requireToken(req, res, url)) return;
      const id = decodeURIComponent(url.pathname.slice("/results/".length));
      const result = completedResults.get(id);
      if (!result) {
        writeJson(res, 404, { ok: false, error: "Unknown result id" });
        return;
      }
      writeJson(res, 200, { ok: true, result });
      return;
    }

    if (url.pathname === "/bridge/heartbeat" && req.method === "GET") {
      if (!requireToken(req, res, url)) return;
      const owner = panelLeaseOwner(req, url);
      if (!lastPanelInfo || owner.panelConnectionId !== lastPanelInfo.panelConnectionId || owner.panelGeneration !== lastPanelInfo.panelGeneration) {
        writeJson(res,409,{ok:false,code:"panel_identity_mismatch"}); return;
      }
      lastPanelSeenAt = Date.now();
      try{const actor={panelConnectionId:owner.panelConnectionId,panelGeneration:owner.panelGeneration,panelInstanceId:url.searchParams.get("panelInstanceId"),panelLifecycleEpoch:Number(url.searchParams.get("panelLifecycleEpoch"))},bootstrapRecovery=panelBootstrapService.recoveryChallenge(actor);writeJson(res,200,{ok:true,session:autonomousSession.publicStatus(),...(bootstrapRecovery?{bootstrapRecovery}:{})});}
      catch(error){writeJson(res,409,{ok:false,code:error.code||"bootstrap_recovery_epoch_unproven"});}return;
    }
    if (url.pathname === "/bridge/product-session" && req.method === "GET") {
      if(!requireToken(req,res,url))return;
      if(coreProductMigration.hasOrigin(PROJECT_ROOT)){
        try{const state=coreMigrationState();if(!state)throw Object.assign(Error("core_migration_genesis_required"),{code:"core_migration_genesis_required"});const actor={panelConnectionId:url.searchParams.get("panelConnectionId"),panelGeneration:url.searchParams.get("panelGeneration"),panelInstanceId:url.searchParams.get("panelInstanceId"),panelLifecycleEpoch:Number(url.searchParams.get("panelLifecycleEpoch"))};writeJson(res,200,{ok:true,coreMigrationSession:state.challenge(actor,url.searchParams.get("physicalInflight")==="0"?0:1),coreMigrationSessionActivation:state.activation()});}catch(error){writeJson(res,409,{ok:false,code:error.code||"core_migration_preflight_refused",replayAllowed:false});}return;
      }
      try{const state=productSessionResetState();if(!state)throw Object.assign(Error("owned_product_reset_session_absent"),{code:"owned_product_reset_session_absent"});const actor={panelConnectionId:url.searchParams.get("panelConnectionId"),panelGeneration:url.searchParams.get("panelGeneration"),panelInstanceId:url.searchParams.get("panelInstanceId"),panelLifecycleEpoch:Number(url.searchParams.get("panelLifecycleEpoch"))};writeJson(res,200,{ok:true,resetSession:state.admissionReady()?null:state.challenge(actor,url.searchParams.get("physicalInflight")==="0"?0:1),resetSessionActivation:state.activation()});}catch(error){writeJson(res,409,{ok:false,code:error.code||"owned_product_reset_preflight_refused",replayAllowed:false});}return;
    }
    if (url.pathname === "/bridge/next" && req.method === "GET") {
      if (!requireToken(req, res, url)) return;
      const panelIdentity = url.searchParams.get("panelConnectionId") || req.headers["x-ae-panel-connection-id"];
      const panelGeneration = url.searchParams.get("panelGeneration") || req.headers["x-ae-panel-generation"];
      if (!panelIdentity || !panelGeneration) { writeJson(res, 409, {ok:false, code:"panel_identity_required", error:"Panel identity and generation are required."}); return; }
      try{
        const actor={panelConnectionId:panelIdentity,panelGeneration,panelInstanceId:url.searchParams.get("panelInstanceId"),panelLifecycleEpoch:Number(url.searchParams.get("panelLifecycleEpoch"))},bootstrapRecovery=panelBootstrapService.recoveryChallenge(actor);
        if(bootstrapRecovery){lastPanelSeenAt=Date.now();if(bootstrapRecovery.historicalReceiptOnly)lastPanelInfo={...lastPanelInfo,...actor,at:lastPanelSeenAt};writeJson(res,200,{ok:true,command:null,bootstrapRecovery});return;}
      }catch(error){writeJson(res,409,{ok:false,code:error.code||"bootstrap_recovery_epoch_unproven",command:null});return;}
      let recoveryTransport;
      try{await retireGeneratedRecoveryForNormalPoll(req,url);recoveryTransport=generatedRecoveryLeaseScope(req,url);}
      catch(error){writeJson(res,409,{ok:false,code:error.code || error.message,command:null});return;}
      try { if(!recoveryTransport)autonomousSession.observePanel({panelConnectionId:panelIdentity,panelGeneration}); }
      catch (error) { writeJson(res, 409, {ok:false,code:"panel_identity_mismatch",error:error.message}); return; }
      lastPanelSeenAt = Date.now();
      lastPanelInfo = {
        userAgent: req.headers["user-agent"] || null,
        panelConnectionId: url.searchParams.get("panelConnectionId") || req.headers["x-ae-panel-connection-id"] || null,
        panelGeneration: url.searchParams.get("panelGeneration") || req.headers["x-ae-panel-generation"] || null,
        panelInstanceId: url.searchParams.get("panelInstanceId") || null,
        panelLifecycleEpoch: /^\d+$/.test(url.searchParams.get("panelLifecycleEpoch") || "") ? Number(url.searchParams.get("panelLifecycleEpoch")) : null,
        at: lastPanelSeenAt
      };
      const resetState=productSessionResetState();
      const migrationState=coreMigrationState();
      if(coreProductMigration.hasOrigin(PROJECT_ROOT)&&!migrationState){writeJson(res,409,{ok:false,code:"core_migration_genesis_required",command:null});return;}
      if(migrationState&&!migrationState.adopted()){
        try{writeJson(res,200,{ok:true,command:null,coreMigrationSession:migrationState.challenge({panelConnectionId:lastPanelInfo.panelConnectionId,panelGeneration:lastPanelInfo.panelGeneration,panelInstanceId:lastPanelInfo.panelInstanceId,panelLifecycleEpoch:lastPanelInfo.panelLifecycleEpoch},url.searchParams.get("physicalInflight")==="0"?0:1)});}catch(error){writeJson(res,409,{ok:false,code:error.code||"core_migration_preflight_refused",command:null});}return;
      }
      if(resetState && !resetState.admissionReady()){
        try{const resetSession=resetState.challenge({panelConnectionId:lastPanelInfo.panelConnectionId,panelGeneration:lastPanelInfo.panelGeneration,panelInstanceId:lastPanelInfo.panelInstanceId,panelLifecycleEpoch:lastPanelInfo.panelLifecycleEpoch},0);writeJson(res,200,{ok:true,command:null,resetSession});}catch(error){writeJson(res,409,{ok:false,code:error.code||"owned_product_reset_preflight_refused",command:null});}return;
      }
      const resetSessionActivation=resetState?resetState.activation():null;
      if(recoveryTransport && url.searchParams.get("recoveryHandshake")==="1"){
        recoveryTransport.state="ready";
        writeJson(res,200,{ok:true,command:null,recoveryTransport:{scopeId:recoveryTransport.scopeId,state:"ready",freshReconcileRequired:true,expiresAt:new Date(recoveryTransport.expiresAt).toISOString()}});return;
      }
      if (pendingCommands.length || Date.now() - lastPanelPollLoggedAt > 60000) {
        lastPanelPollLoggedAt = Date.now();
        recordEvent("panel_poll", {
          pendingCommands: countQueuedCommands(),
          userAgent: lastPanelInfo.userAgent
        });
      }

      let command;
      try{command=leaseNextQueuedCommand(req,url);}catch(error){writeJson(res,409,{ok:false,code:error.code || error.message,command:null});return;}
      if (command) {
        writeJson(res, 200, { ok: true, command,resetSessionActivation,coreMigrationSessionActivation:migrationState?migrationState.activation():null });
        return;
      }

      writeJson(res, 200, { ok: true, command: null,resetSessionActivation,coreMigrationSessionActivation:migrationState?migrationState.activation():null });
      return;
    }

    if (url.pathname === "/bridge/core-migration-session" && req.method === "POST") {
      if(!requireToken(req,res,url))return;
      if(res.authRole!=="panel"){writeJson(res,403,{ok:false,code:"core_migration_panel_witness_required"});return;}
      try{const state=coreMigrationState();if(!state)throw Object.assign(Error("core_migration_genesis_required"),{code:"core_migration_genesis_required"});const result=state.activate(await readJsonBody(req));autonomousSession.invalidateProjectContext();lastPanelSeenAt=Date.now();lastPanelInfo={...lastPanelInfo,...result.activation.actor,at:lastPanelSeenAt};writeJson(res,200,result);}catch(error){writeJson(res,409,{ok:false,code:error.code||"core_migration_preflight_refused",replayAllowed:false});}return;
    }
    if (url.pathname === "/bridge/reset-session" && req.method === "POST") {
      if(!requireToken(req,res,url))return;
      if(res.authRole!=="panel"){writeJson(res,403,{ok:false,code:"owned_product_reset_panel_witness_required"});return;}
      try{const state=productSessionResetState();if(!state)throw Object.assign(Error("owned_product_reset_session_absent"),{code:"owned_product_reset_session_absent"});const result=state.activate(await readJsonBody(req));autonomousSession.invalidateProjectContext();writeJson(res,200,result);}catch(error){writeJson(res,409,{ok:false,code:error.code||"owned_product_reset_preflight_refused",replayAllowed:false});}return;
    }
    if(url.pathname==="/bridge/bootstrap-recovery-epoch"&&req.method==="POST"){
      if(!requireToken(req,res,url))return;
      if(res.authRole!=="panel"){writeJson(res,403,{ok:false,code:"bootstrap_recovery_panel_role_required"});return;}
      try{const result=panelBootstrapService.acceptRecoveryEpoch(await readJsonBody(req));autonomousSession.invalidateProjectContext();lastPanelSeenAt=Date.now();if(result.activation&&!result.historicalReceiptOnly)lastPanelInfo={...lastPanelInfo,...result.activation.actor,at:lastPanelSeenAt};writeJson(res,200,result);}
      catch(error){writeJson(res,409,{ok:false,code:error.code||"bootstrap_recovery_epoch_unproven",replayAllowed:false});}return;
    }
    if (url.pathname === "/bridge/submitted" && req.method === "POST") {
      if (!requireToken(req, res, url)) return;
      const payload = await readJsonBody(req);
      const id = String(payload.id || "");
      const command = inflightCommands.get(id);

      if (!command) {
        const retained = completedResults.get(id);
        if (retained) {
          writeJson(res, 409, {
            ok: false,
            error: "Command is already terminal.",
            lifecycleState: retained.lifecycleState || null,
            code: retained.code || null
          });
          return;
        }
        writeJson(res, 404, { ok: false, error: "Unknown command id" });
        return;
      }

      if (rejectRevokedAutonomousCommand(command)) {
        writeJson(res, 409, {ok: false, code: command.errorCode, error: command.error});
        return;
      }
      if (Date.now() >= command.expiresAt) timeoutAeCommand(command.id);
      if (!lastPanelInfo || !leaseOwnerMatches(command, lastPanelInfo)) { writeJson(res, 409, {ok:false, code:"panel_generation_mismatch"}); return; }

      const submittedOwner = {
        panelConnectionId: String(payload.panelConnectionId || "unknown-panel"),
        panelGeneration: String(payload.panelGeneration || "unknown-generation"),
        userAgent: req.headers["user-agent"] || null
      };

      if (command.state === "submitted") {
        const matches = commandReceipt.identityMatches(command, payload);
        writeJson(res, matches ? 200 : 409, { ok: matches, lifecycleState: command.state, code: matches ? null : "command_identity_mismatch" });
        return;
      }

      if (command.state !== "leased") {
        writeJson(res, 409, {
          ok: false,
          error: `Command cannot be marked submitted from state ${command.state}.`,
          code: "command_stage_mismatch",
          lifecycleState: command.state
        });
        return;
      }

      if (!commandReceipt.identityMatches(command, payload)) {
        recordEvent("ae_command_submit_owner_mismatch", {
          id,
          leaseOwner: command.leaseOwner,
          submittedOwner
        });
        writeJson(res, 409, {
          ok: false,
          error: "Command submit owner does not match the lease owner.",
          code: "command_identity_mismatch",
          lifecycleState: command.state
        });
        return;
      }

      command.state = "submitted";
      capturePlanCommand(command);
      command.submittedAt = Date.now();
      recordEvent("ae_command_submitted", {
        id,
        lifecycleState: command.state,
        ageMs: command.submittedAt - command.createdAt,
        leaseOwner: command.leaseOwner
      });
      writeJson(res, 200, { ok: true, lifecycleState: command.state });
      return;
    }

    if (url.pathname === "/bridge/result" && req.method === "POST") {
      if (!requireToken(req, res, url)) return;
      const payload = await readJsonBody(req);
      const command = inflightCommands.get(payload.id);

      if (!command) {
        const retained = completedResults.get(payload.id);
        if (retained) {
          const identical = commandReceipt.identityMatches(retained.command, payload) && retained.receiptDigest === commandReceipt.digest(payload);
          writeJson(res, identical ? 200 : 409, {ok: identical, duplicate: identical, idempotent: identical,
            code: identical ? null : "terminal_result_conflict", lifecycleState: retained.lifecycleState});
          return;
        }
        writeJson(res, 404, { ok: false, error: "Unknown command id" });
        return;
      }

      if (Date.now() >= command.expiresAt) timeoutAeCommand(command.id);
      const receiptError = commandReceipt.check(command, payload, "submitted");
      const currentOwner = lastPanelInfo && leaseOwnerMatches(command, lastPanelInfo);
      if (receiptError || !currentOwner) {
        writeJson(res, 409, {ok:false, code: receiptError || "panel_generation_mismatch"}); return;
      }
      command.receiptDigest = commandReceipt.digest(payload);
      clearTimeout(command.timeout);
      inflightCommands.delete(payload.id);
      command.completedAt = Date.now();
      let parsedResult = null;
      let failure = null;

      if (payload.ok) {
        try {
          parsedResult = parseStrictAeWrapperResult(command, payload.result);
        } catch (error) {
          failure = error;
        }
      } else {
        failure = createAeCommandError(
          command,
          "ae_execution_failed",
          "ae_execution",
          payload.error || "After Effects command failed.",
          { rawPreview: boundedAeRawPreview(payload.error || payload.result || "") }
        );
      }

      if (failure) {
        command.state = "failed";
        command.errorCode = failure.code || "ae_execution_failed";
        command.phase = failure.phase || "ae_execution";
        failure.lifecycleState = command.state;
        retainCommandResult(payload.id, {
          ok: false,
          error: failure.message || "After Effects command failed.",
          code: command.errorCode,
          phase: command.phase,
          rawPreview: Object.prototype.hasOwnProperty.call(failure, "rawPreview") ? failure.rawPreview : null,
          line: failure.line || null,
          lifecycleState: command.state
        }, command);
        command.settled = true;
        command.reject(failure);
        recordEvent("ae_command_result", {
          id: payload.id,
          ok: false,
          lifecycleState: command.state,
          phase: command.phase,
          code: command.errorCode,
          ageMs: Date.now() - command.createdAt,
          error: failure.message || "After Effects command failed.",
          rawPreview: Object.prototype.hasOwnProperty.call(failure, "rawPreview") ? failure.rawPreview : null
        });
      } else {
        command.state = "completed";
        command.errorCode = null;
        command.phase = null;
        retainCommandResult(payload.id, {
          ok: true,
          result: parsedResult.result,
          lifecycleState: command.state
        }, command);
        command.settled = true;
        command.resolve(parsedResult);
        recordEvent("ae_command_result", {
          id: payload.id,
          ok: true,
          lifecycleState: command.state,
          ageMs: Date.now() - command.createdAt
        });
      }

      writeJson(res, 200, { ok: true });
      return;
    }

    writeJson(res, 404, { ok: false, error: "Not found" });
    }).catch((error) => { writeJson(res, error.status || 400, {ok:false, error: error.message || "Request failed."}); }));}
    catch(error){writeJson(res,409,{ok:false,code:error.code || "owned_runtime_ingress_refused",replayAllowed:false});}
  });
  ownedRuntimeHttpServer=server;

  server.listen(PORT, HOST, () => {
    log(`HTTP bridge listening on http://${HOST}:${PORT}`);
    recordEvent("server_started", {
      host: HOST,
      port: PORT,
      version: SERVER_VERSION,
      logFile: LOG_FILE
    });
  });

  server.on("error", (error) => {
    log(`HTTP bridge error: ${error.message}`);
    recordEvent("server_error", { error: error.message });
    process.exitCode = 1;
    process.exit(1);
  });
}

const tools=require("./core-tool-catalog").createToolCatalog({MUTATION_CHECKPOINT_SCHEMA_PROPERTIES,ameEnqueueSequence,ameFixtureRunner,ameJobSource,ameOpenComp,amePresets,ameQueueControl,ameRunning,ameSavedSourceAdmission,ameSourceProbe,ameTitleJobs,ameTransport,buildCompVisualReviewPlanTool,compVisualReviewManifest,montageTools,nativeRenderVariant,panelBootstrap,panelControl,placeholderPlanBuilder,placeholderReadBack,placeholderReviewTools,projectLifecycleContract,projectLifecyclePlan,projectLifecycleState,projectSave,slideshowTools,titleExport,titleVerification});

tools.push({name:"get_property_value",description:"Read one exact property by stable comp/layer IDs and composite propertyPath; optional time includes the exact key sample. No mutation.",inputSchema:{type:"object",additionalProperties:false,properties:{compItemId:{type:"integer",minimum:1},layerId:{type:"integer",minimum:1},propertyPath:{type:"array",minItems:1,maxItems:12,items:{type:["string","number","object"]}},time:{type:"number"}},required:["compItemId","layerId","propertyPath"]}});
tools.push({name:"reconcile_plan_run",description:"Read actual state for a server-stored failed/uncertain plan run. Returns applied/not_applied/unknown per step and preserves the execution error. Never replays mutations.",inputSchema:{type:"object",additionalProperties:false,properties:{runId:{type:"string"},originalRequestId:{type:"string",description:"Exact original panel request UUID selector; no client evidence is accepted."},stepIndices:{type:"array",minItems:1,maxItems:50,items:{type:"integer",minimum:1}}},required:["runId"]}});

// Persistent IDs supplement address hints on existing typed surfaces.
for (const tool of tools) {
  if(tool.name==="save_comp_frame_png")Object.assign(tool.inputSchema.properties,{reviewOwner:{type:"string",description:"Registered review owner; requires stable reviewItemId/full resolution/retained PNG."},reviewItemId:{type:"integer",minimum:1},expectedCompItemId:{type:"integer",minimum:1}});
  if(tool.name==="cleanup_test_items")Object.assign(tool.inputSchema.properties,{owner:{type:"string",description:"Server-registered review UUID; requires the exact whole registered ID set."},itemIds:{type:"array",minItems:1,maxItems:25,items:{type:"integer",minimum:1}}});
  if (placeholderProtection.TARGET_SETTERS.has(tool.name) || tool.name === "set_effect_property") {
    tool.inputSchema.properties.expectedCompItemId = { type: "integer", minimum: 1 };
    tool.inputSchema.properties.expectedLayerId = { type: "integer", minimum: 1 };
  }
  if(tool.name === "set_property_value") tool.inputSchema.properties.expectedLayerIds={type:"array",minItems:1,maxItems:50,items:{type:"integer",minimum:1}};
  if(["get_comp_details","get_effect_details"].includes(tool.name)) tool.inputSchema.properties.compItemId={type:"integer",minimum:1};
  if(["get_layer_details","get_effect_details"].includes(tool.name)) {
    tool.inputSchema.properties.layerId={type:"integer",minimum:1};
    tool.inputSchema.required=(tool.inputSchema.required || []).filter(field=>field!=="layerIndex");
    tool.inputSchema.anyOf=[{required:["layerIndex"]},{required:["layerId"]}];
  }
  if (tool.name === "get_layer_details") {
    tool.inputSchema.properties.compItemId = { type: "integer", minimum: 1 };
    tool.inputSchema.properties.layerId = { type: "integer", minimum: 1 };
    tool.inputSchema.properties.protectedProperties = { type: "array", maxItems: 12, items: { type: "array", minItems: 1, maxItems: 8, items: { type: ["string", "object"] } } };
  }
}

function exposedTools() {
  return tools;
}

const daemonMontageDeps = {
  getProjectInfo: async () => firstToolPayload(await callToolLogged("montage-project-read", "get_project_info", {})),
  currentPlaceholderState,
  readPlaceholderInventory,
  readPlaceholderGeometry,
  runExtendScriptBody,
  validateAgentPlanWithRepair,
  guardPlaceholderPlan
};

async function buildPostRunMontageReadBack(record, actual) {
  return require("./montage-postread").buildPostRunReadBack(record, {
    currentPlaceholderState, readPlaceholderInventory, runExtendScriptBody
  });
}

const panelBootstrapService = panelBootstrap.createPanelBootstrapService({
  stateDir: path.join(process.env.AE_BRIDGE_STATE_DIR || LOG_DIR, "ae-agent-panel-bootstrap"),
  resolveSessionScope: process.env.AE_OWNED_RUNTIME_GENERATION ? ()=>require("./owned-runtime-product-maintenance").resolveBootstrapScope(PROJECT_ROOT,process.env.AE_OWNED_RUNTIME_GENERATION,path.join(process.env.AE_BRIDGE_STATE_DIR || LOG_DIR,"ae-agent-panel-bootstrap")) : undefined,
  getStatus: () => ({...getBridgeStatus(), planExecutionState: currentProposalState.current && currentProposalState.current.executionState || null}),
  getOrigin:()=>{const p=lastPanelInfo;return {actor:{panelConnectionId:p?.panelConnectionId,panelGeneration:p?.panelGeneration,panelInstanceId:p?.panelInstanceId,panelLifecycleEpoch:p?.panelLifecycleEpoch},runtime:{pid:process.pid,startedAt:new Date(STARTED_AT).toISOString(),sourceSha256:RUNTIME_IDENTITY?.sourceSha256,currentSourceSha256:reviewEvidence.runtimeIdentity(PROJECT_ROOT).sourceSha256}};},
  readResult:async pins=>completedResults.get(pins.id)||null,
  getDeliveryFence:(attempt,sha,before,barrier)=>{
    if(barrier)return null;
    const pins=attempt.projectReadCommand;
    if(pins&&recoveryStateSame(attempt.origin,before)&&recoveryStateSame(pins.origin,before)&&!inflightCommands.has(pins.id)&&!pendingCommands.includes(pins.id))return {kind:"same_runtime_delivery_closed",originalRawSha256:sha,origin:before,oldCommandPins:pins,deliveryClosed:true};
    return null;
  },
  readProject: (timeoutMs,onQueued) => panelBootstrapReadContext.run({onQueued}, async () => firstToolPayload(await callToolLogged("panel-bootstrap-read", "get_project_info", {}, {panelBootstrapReadTimeoutMs: timeoutMs})))
});
function recoveryStateSame(a,b){return require("./session-recovery-state").same(a,b);}

// CLI and daemon must share this module's fixed durable controller root.
const PANEL_CONTROL_AUTHORITY = Symbol("official-automation-panel-control");
const PANEL_BOOTSTRAP_AUTHORITY = Symbol("official-automation-panel-bootstrap");
function panelControlUsesRetainedTransport() {
  if(require("./core-product-migration").hasOrigin(PROJECT_ROOT))return false;
  if (!ownedRuntimeStartup.managed || ownedRuntimeStartup.initialRecovery) return false;
  const supervisor=require("./owned-runtime-supervisor"), current=supervisor.readDaemonRegistration(PROJECT_ROOT);
  // The supervisor reads status/register before publishing the successor.
  // Keep admission closed during that normal phase; malformed records still throw.
  if (!current || current.generation!==process.env.AE_OWNED_RUNTIME_GENERATION) return true;
  return !supervisor.readProductStopAuthority(PROJECT_ROOT,process.env.AE_OWNED_RUNTIME_GENERATION);
}
const panelControlService = panelControl.createPanelControlService({evidenceRoot:LOG_DIR,readCutoverInventory:process.env.AE_OWNED_RUNTIME_GENERATION&&!require("./core-product-migration").hasOrigin(PROJECT_ROOT)?()=>ownedRuntimeStartup.initialRecovery?require("./owned-runtime-initial-recovery").ordinaryCutover():(require("./owned-runtime-product-activation").controlCutover(PROJECT_ROOT,process.env.AE_OWNED_RUNTIME_GENERATION)||ownedRuntimeAuthority.readOriginalTransportInventory(PROJECT_ROOT)):undefined,resolveStateDirectory:()=>panelControlUsesRetainedTransport()?ownedRuntimeAuthority.currentTransportDirectory(PROJECT_ROOT,LOG_DIR):path.join(LOG_DIR,"core-cep-panel-control"),resolveReceiptDirectory:id=>panelControlUsesRetainedTransport()?ownedRuntimeAuthority.receiptTransportDirectory(PROJECT_ROOT,LOG_DIR,id):path.join(LOG_DIR,"core-cep-panel-control"),lookupPanelLifecycleCausal:()=>require("./panel-lifecycle-causal").readControlProjection(),lookupNativeFixtureAdmissionRefusal:()=>nativeFixtureAdmissionRefusal.lookup(nativeRefusalReaders()),lookupRetainedNativeFixture:s=>nativeFixtureAbandonment.lookup(s,nativeRetainedReaders()),assertRetainedAdmissionCurrent:expected=>{
  const status=getBridgeStatus();
  if(status.lastPanelInfo?.panelGeneration!==expected.currentActor.panelGeneration || status.lastPanelInfo?.panelInstanceId!==expected.currentActor.panelInstanceId || status.lastPanelInfo?.panelLifecycleEpoch!==expected.currentActor.panelLifecycleEpoch || status.humanGuardRuntime.pid!==expected.runtime.daemon.pid || status.humanGuardRuntime.startedAt!==expected.runtime.daemon.startedAt || RUNTIME_IDENTITY.sourceSha256!==expected.runtime.loadedRuntimeSha256 || reviewEvidence.runtimeIdentity(PROJECT_ROOT).sourceSha256!==expected.runtime.currentRuntimeSha256)throw Object.assign(Error("retained_admission_actor_or_runtime_changed"),{code:"retained_admission_actor_or_runtime_changed"});
}});
function nativeRetainedReaders(){return nativeFixtureAbandonmentBackend.createReaders({evidenceRoot:LOG_DIR,projectRoot:PROJECT_ROOT,panelService:panelControl.createPanelControlService({stateDir:path.join(LOG_DIR,"core-cep-panel-control"),inspectInstalledTarget:()=>require("./owned-runtime-authority").inspectRetainedInstalledTarget(PROJECT_ROOT)}),readBridgeStatus:getBridgeStatus,loadedRuntimeSha256:RUNTIME_IDENTITY.sourceSha256,currentRuntimeSha256:()=>reviewEvidence.runtimeIdentity(PROJECT_ROOT).sourceSha256,executorQuiescence:()=>ameFixtureExecutor.quiescence()});}
let ownedRuntimeHttpServer=null;
let ownedRuntimeStartup={managed:!!process.env.AE_OWNED_RUNTIME_GENERATION,requiresRetainedAdoption:!!process.env.AE_OWNED_RUNTIME_GENERATION};
const ownedRuntimeAuthority=require("./owned-runtime-authority");
const productSessionReset=require("./owned-runtime-product-session-reset"),productSessionResetCache=new Map();
const coreProductMigration=require("./core-product-migration");let coreMigrationSessionCache=null;
function coreMigrationState(){
  if(!coreProductMigration.hasSealedOrigin(PROJECT_ROOT))return null;if(!ownedRuntimeStartup.managed)throw Object.assign(Error("core_migration_managed_origin_required"),{code:"core_migration_managed_origin_required"});
  if(!coreMigrationSessionCache){const supervisor=require("./owned-runtime-supervisor");coreMigrationSessionCache=coreProductMigration.createAdmissionSession({root:PROJECT_ROOT,generation:process.env.AE_OWNED_RUNTIME_GENERATION,readGeneration:supervisor.registeredGeneration,keyReader:v=>ownedRuntimeAuthority.runtimeControlFor(PROJECT_ROOT).credential({daemon:{port:3456,credentialSha256:v.credentialSha256}}),readActor:()=>lastPanelInfo&&{panelConnectionId:lastPanelInfo.panelConnectionId,panelGeneration:lastPanelInfo.panelGeneration,panelInstanceId:lastPanelInfo.panelInstanceId,panelLifecycleEpoch:lastPanelInfo.panelLifecycleEpoch},readLifecycle:()=>productSessionReset.assertLifecycle(PROJECT_ROOT),readEditHash:()=>productSessionReset.snapshot(EDIT_SESSION_ACTIVE_FILE).sha256});}return coreMigrationSessionCache;
}
function productSessionResetState(){
  if(deploymentMode!=="product"||!ownedRuntimeStartup.managed)return null;
  const supervisor=require("./owned-runtime-supervisor"),generation=process.env.AE_OWNED_RUNTIME_GENERATION,keyReader=v=>ownedRuntimeAuthority.runtimeControlFor(PROJECT_ROOT).credential({daemon:{port:3456,credentialSha256:v.credentialSha256}});
  let rootGeneration=generation;
  if(!fs.existsSync(path.join(ownedRuntimeAuthority.base(PROJECT_ROOT),"daemon-reservations",generation,"product-session-reset.json"))){
    const current=supervisor.readDaemonRegistration(PROJECT_ROOT);if(!current||current.generation!==generation)return null;
    const anchor=productSessionReset.sessionAnchor(PROJECT_ROOT,generation,supervisor.registeredGeneration,keyReader);if(!anchor)return null;rootGeneration=anchor.value.generation;
  }
  if(!productSessionResetCache.has(rootGeneration))productSessionResetCache.set(rootGeneration,productSessionReset.daemonSession({root:PROJECT_ROOT,generation:rootGeneration,readGeneration:supervisor.registeredGeneration,keyReader,
    readLifecycle:()=>productSessionReset.assertLifecycle(PROJECT_ROOT),readEditHash:()=>productSessionReset.snapshot(EDIT_SESSION_ACTIVE_FILE).sha256,
    retireEdit:hash=>{if(hash!==null && productSessionReset.snapshot(EDIT_SESSION_ACTIVE_FILE).sha256===hash)activeEditSession=null;}}));
  return productSessionResetCache.get(rootGeneration);
}
const ownedRuntimeService=require("./owned-runtime-service").createOwnedRuntimeService({
  initialRuntime,
  readRegistration:()=>ownedRuntimeStartup.managed?require("./owned-runtime-supervisor").loadCurrentDaemonRegistration(PROJECT_ROOT,{pid:process.pid,argv:process.argv,sourceSha256:RUNTIME_IDENTITY.sourceSha256,bootNonce:process.env.AE_OWNED_RUNTIME_BOOT_NONCE,generation:process.env.AE_OWNED_RUNTIME_GENERATION,serviceStartedAt:new Date(STARTED_AT).toISOString()}):null,
  readAdmission:()=> coreProductMigration.hasOrigin(PROJECT_ROOT)
    ? !!coreMigrationState() && coreMigrationState().admissionReady() && (!productSessionResetState() || productSessionResetState().admissionReady())
    : (!productSessionResetState() || productSessionResetState().admissionReady()) && (ownedRuntimeStartup.initialRecovery
    ? require("./owned-runtime-initial-recovery").admissionReady(PROJECT_ROOT,{generation:ownedRuntimeStartup.generation,loadedSourceSha256:RUNTIME_IDENTITY.sourceSha256,connectionReady:autonomousSession.publicStatus().connectionReady})
    : !ownedRuntimeStartup.requiresRetainedAdoption || ownedRuntimeStartup.managed && !panelControlUsesRetainedTransport() ||
      require("./native-fixture-retained").currentAdmission(PROJECT_ROOT) && panelControlService.cutoverReadiness().ready),journalRoot:ownedRuntimeAuthority.base(PROJECT_ROOT),
  readProductStopAuthority:()=>!ownedRuntimeStartup.initialRecovery && require("./owned-runtime-supervisor").readProductStopAuthority(PROJECT_ROOT,process.env.AE_OWNED_RUNTIME_GENERATION),
  readPolicy:()=>ownedRuntimeAuthority.loadPolicy(PROJECT_ROOT,"owned_daemon_lifecycle").policy,
  readReadiness:()=>{
    const status=getBridgeStatus();let children=false,capsule=false;
    try{const manifest=ownedRuntimeAuthority.privateFile(path.join(ownedRuntimeAuthority.base(PROJECT_ROOT),"retained-authority.json")),s=ownedRuntimeAuthority.validateManifest(manifest.value).selector,saved=require("./native-fixture-retained").lookupAudited(s,{repoRoot:PROJECT_ROOT,evidenceRoot:LOG_DIR});children=!!saved;capsule=!!require("../scripts/native-fixture-retained-maintenance").read(LOG_DIR,"capture");}catch(_){/* Missing/partial authority remains blocked. */}
    const fixtureState=ownedFixtureLifecycle.quiescence(),runnerState=ameFixtureExecutor.quiescence(),transport=panelControlService.cutoverReadiness();
    const initial=ownedRuntimeStartup.initialRecovery && require("./owned-runtime-initial-recovery").admissionReady(PROJECT_ROOT,{generation:ownedRuntimeStartup.generation,loadedSourceSha256:RUNTIME_IDENTITY.sourceSha256,connectionReady:autonomousSession.publicStatus().connectionReady});
    let controlStopCensus=null;try{if(!ownedRuntimeStartup.initialRecovery)controlStopCensus=require("./owned-runtime-product-maintenance").readControlStopCensus(PROJECT_ROOT,process.env.AE_OWNED_RUNTIME_GENERATION);}catch(_){/* Changed/unresolved historical debt never gains control-stop eligibility. */}
    return {...status,protectedTransportReadiness:transport,bootstrapIdle:!panelBootstrapService.isBusy(),nativeExecutionIdle:runnerState.executing===false,ownedChildrenProofs:(initial || children) && fixtureState.allChildrenExitProven && fixtureState.pendingCleanupJobs===0 && runnerState.pendingCleanupJobs===0,retainedCapsulePreserved:initial || capsule,
      productStopQuiescence:{controlStopCensus,planExecutionState:currentProposalState.current ? currentProposalState.current.executionState : null,allChildrenExitProven:fixtureState.allChildrenExitProven,pendingCleanupJobs:fixtureState.pendingCleanupJobs+runnerState.pendingCleanupJobs,pendingNativeAttempts:runnerState.pendingCount,
        outstandingAttempts:Array.isArray(runnerState.outstandingAttempts)?runnerState.outstandingAttempts.length:null,transportOutstanding:Array.isArray(transport.outstanding)?transport.outstanding.length:null}};
  },
  closeIdleWaiters:()=>{for(const waiter of waitingPanels.splice(0)){clearTimeout(waiter.timer);if(!waiter.done && !waiter.res.destroyed && !waiter.res.writableEnded){waiter.done=true;writeJson(waiter.res,200,{ok:true,command:null,draining:true});}}},
  closeServer:closeOwnedRuntimeHttpServer
});
function closeOwnedRuntimeHttpServer(){
  if(!ownedRuntimeHttpServer)return;
  // Called only after the shutdown ACK finished and service quiescence passed.
  // A CEP long-poll socket can remain active after the listener is closed.
  ownedRuntimeHttpServer.close();
  if(typeof ownedRuntimeHttpServer.closeAllConnections==="function")ownedRuntimeHttpServer.closeAllConnections();
}
const ownedFixtureLifecycle=require("./owned-fixture-lifecycle").createFixtureLifecycleController({
  repoRoot:PROJECT_ROOT,
  getCurrentActor:()=>{const s=getBridgeStatus().lastPanelInfo;return {panelInstanceId:s?.panelInstanceId,panelLifecycleEpoch:s?.panelLifecycleEpoch,panelGeneration:s?.panelGeneration};},
  getRuntimeIdentity:()=>({daemon:{pid:process.pid,startedAt:new Date(STARTED_AT).toISOString()},loadedRuntimeSha256:RUNTIME_IDENTITY.sourceSha256,currentRuntimeSha256:reviewEvidence.runtimeIdentity(PROJECT_ROOT).sourceSha256}),
  renewRetainedAdmission:c=>require("./native-fixture-retained").renewAdmission(PROJECT_ROOT,{context:c,assertManualIngress:context=>{currentProposalState.assertCurrent(context?.record);manualPlanIngress.assertContext(context);},readPanelGuard:s=>nativeRetainedReaders().readPanelGuard(s),readRuntimeIdentity:()=>nativeRetainedReaders().readRuntimeIdentity()}),
  assertRetainedAdmission:c=>{if(!require("./native-fixture-retained").currentAdmission(PROJECT_ROOT) || !panelControlService.cutoverReadiness().ready)return false;require("./native-fixture-attempt-ledger").assertAdmission(PROJECT_ROOT,c.runId);return true;},
  readNativeResult:(job,input)=>ownedRuntimeAuthority.readCleanupNativeResult(PROJECT_ROOT,job,input),
  auditCleanup:(job,input)=>require("./native-fixture-retained").auditManagedCleanup(PROJECT_ROOT,job,input,nativeRetainedReaders())
});
const ownedFixtureCleanupReconciler=ameFixtureRunner.createCleanupReconciler({getSelector:runId=>ameFixtureExecutor.cleanupSelector(runId),flush:runId=>ameFixtureExecutor.flushCleanup(runId),readIdle:async s=>{if(!panelControlService.controllerIdle())return false;const target=await panelControlService.maintenanceTarget();if(target.state.nativeControlIdle!==true)return false;try{const readers=nativeRetainedReaders(),local=readers.readTransportRetained(s),guard=await readers.readPanelGuard(s),retained=require("./native-fixture-retained");return retained.isRetainedReceipt(local.row) && guard.controllerIdle===true && retained.isRetainedReceipt(guard.projection) && JSON.stringify(local.row.result?.run)===JSON.stringify(guard.projection.result?.run);}catch(_){return false;}},refresh:budget=>panelControlService.refreshTrustedGuards({},budget),getResult:id=>panelControlService.getResult(id),validateAdoption:(selector,result)=>panelControlService.validateManagedCleanupAdoption(selector,result),assertPolicy:()=>{require("./owned-runtime-product-activation").assertNativeAuthority(PROJECT_ROOT);return ownedRuntimeAuthority.loadPolicy(PROJECT_ROOT,"native_fixture_disposition");}});
function nativeRefusalReaders() {
  return nativeFixtureAdmissionRefusal.createReaders({evidenceRoot:LOG_DIR,projectRoot:PROJECT_ROOT,panelService:panelControlService,readBridgeStatus:getBridgeStatus,
    loadedRuntimeSha256:RUNTIME_IDENTITY.sourceSha256,currentRuntimeSha256:()=>reviewEvidence.runtimeIdentity(PROJECT_ROOT).sourceSha256});
}
function nativePrephaseReaders() {
  return nativeFixturePrephaseBackend.createReaders({evidenceRoot:LOG_DIR,projectRoot:PROJECT_ROOT,readBridgeStatus:getBridgeStatus,
    loadedRuntimeSha256:RUNTIME_IDENTITY.sourceSha256,loadedRuntimeModules:RUNTIME_IDENTITY.modules,currentRuntimeSha256:()=>reviewEvidence.runtimeIdentity(PROJECT_ROOT).sourceSha256,
    executorQuiescence:()=>ameFixtureExecutor.quiescence(),hasAttempt:stageId=>ameFixtureExecutor.hasAttempt(stageId),hasCurrentProposal:()=>currentProposalState.current!==null,
    getAdmissionProtection:context=>({entry:ameFixtureCheckpoints.get(context && context.runId),activeEditSession}),readPrimaryProjectLifecycle:readNativeFixturePrimaryLifecycle,
    assertManualIngress:context=>{currentProposalState.assertCurrent(context && context.record);manualPlanIngress.assertContext(context);}});
}
function nativePrephaseMaintenanceReaders() {
  // Only this inspection route can observe the exact consumed predecessor
  // during timer repair. Runtime identity, lookup and admission stay strict.
  const strict=nativePrephaseReaders(),panelService=panelControl.createPanelControlService({inspectInstalledTarget:()=>fixedGuardTimeoutMaintenanceProof.inspectInstalledTarget({repoRoot:PROJECT_ROOT,evidenceRoot:LOG_DIR})});
  const inspection=nativeFixtureAbandonmentBackend.createReaders({evidenceRoot:LOG_DIR,projectRoot:PROJECT_ROOT,panelService});
  return {...strict,maintenanceTarget:inspection.maintenanceTarget,readPanelGuard:inspection.readPanelGuard};
}

// Typed implementation lives in core-tool-dispatch.js. The guarded wrapper remains here.
let coreToolDispatch;
function callTool(name,args,executionContext){return coreToolDispatch(name,args,executionContext);}

function coreMigrationPanelActor(){return lastPanelInfo&&{panelConnectionId:lastPanelInfo.panelConnectionId,panelGeneration:lastPanelInfo.panelGeneration,panelInstanceId:lastPanelInfo.panelInstanceId,panelLifecycleEpoch:lastPanelInfo.panelLifecycleEpoch};}
function coreMigrationTypedEffects(name,args){
  const empty={nativeRoot:null,claimNonce:null,stageId:null,pluginPath:null,outputPath:null,sourcePath:null,projectPath:currentProposalState.current?.project?.actualFile||currentProposalState.current?.project?.expectedFile||null,actualAeProcess:null};
  if(name==="plan.run"){const effects=[];for(const step of args.plan?.steps||[]){const tool=toolByName(step.tool);if(tool&&tool.annotations?.readOnlyHint!==true&&MUTATING_TOOL_NAMES.has(step.tool))effects.push(...coreMigrationTypedEffects(step.tool,step.args||{}));}return effects.length?effects:[{...empty,kind:"local_control"}];}
  if(panelControl.isPanelControlTool(name)||[panelBootstrap.TOOL_NAME,panelBootstrap.RECOVERY_TOOL_NAME].includes(name))return [{...empty,kind:"local_control"}];
  if(name===ameFixtureGrant.TOOL_NAME)return [{...empty,kind:"native_claim",nativeRoot:path.join(PROJECT_ROOT,".codex-runtime/ame-native-fixtures")}];
  if(["save_project_as","create_named_project","open_project"].includes(name))return [{...empty,kind:"file_output",sourcePath:args.expectedSourceProjectFile||null,outputPath:args.targetProjectFile||null}];
  if(name==="save_current_named_project")return [{...empty,kind:"file_output",sourcePath:args.expectedProjectFile||null,outputPath:args.expectedProjectFile||null}];
  if(!MUTATING_TOOL_NAMES.has(name)&&!["save_comp_frame_png","start_edit_session","restore_project_checkpoint","restore_project_backup"].includes(name))return [{...empty,kind:"local_control"}];
  const outputNames=new Set(["save_comp_frame_png","save_project_as","save_current_named_project",nativeRenderVariant.RENDER]);
  const outputPath=outputNames.has(name)?args.outputPath||args.filePath||null:null;
  return [{...empty,kind:outputPath?"file_output":"ordinary_ae_mutation",outputPath}];
}
function captureCoreMigrationOperation(name,args,readOnly,extra={}){
  const lane=ameTitleMutationNames.has(name)||ameQueueControl.MUTATIONS.includes(name)||name===ameRunning.TOOL_NAME?"ame_queue_jobs":name===ameFixtureGrant.TOOL_NAME?"native_fixture":name===nativeRenderVariant.RENDER?"native_render_output":"ordinary_typed";
  const id=readOnly?null:idempotencyContext(name,args||{}),copied=JSON.parse(JSON.stringify(args||{})),context=Object.freeze({tool:name,args:copied,readOnly:readOnly===true,lane,idempotencyRecordKey:id?.recordKey||null,runId:evidenceContext.getStore()?.runId||null,actionId:autonomousCommandContext.getStore()?.actionId||null,...extra,daemonGeneration:process.env.AE_OWNED_RUNTIME_GENERATION||null,panelActor:coreMigrationPanelActor(),effects:Object.freeze(coreMigrationTypedEffects(name,copied).map(e=>Object.freeze(e)))});coreMigrationOperations.add(context);return context;
}
function assertCoreMigrationOperation(context,delivery=null){
  if(!coreProductMigration.hasOrigin(PROJECT_ROOT))return;if(!context||!coreMigrationOperations.has(context))throw Object.assign(Error("core_migration_private_operation_context_required"),{code:"core_migration_private_operation_context_required"});
  const state=coreMigrationState();if(!state){if(context.readOnly)return;throw Object.assign(Error("core_migration_genesis_required"),{code:"core_migration_genesis_required"});}
  if(context.readOnly){state.assertOperation(context);return;}
  const effects=delivery?.nativeEffect&&context.effects.every(e=>e.kind==="local_control")?[{kind:"ordinary_ae_mutation",nativeRoot:null,claimNonce:null,stageId:null,pluginPath:null,outputPath:null,sourcePath:null,projectPath:currentProposalState.current?.project?.actualFile||null,actualAeProcess:null}]:context.effects;
  if(effects.every(e=>e.kind==="local_control")){state.assertOperation(context);return;}
  const actor=coreMigrationPanelActor(),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  if(!actor||!equal(actor,context.panelActor)||context.daemonGeneration!==(process.env.AE_OWNED_RUNTIME_GENERATION||null)||delivery?.commandId&&!equal(delivery.actor,actor))throw Object.assign(Error("core_migration_operation_actor_changed"),{code:"core_migration_operation_actor_changed"});
  // Conservative fresh observation at each mutable seam. No TTL/actor cache;
  // the delivery frame below never reuses an earlier operation observation.
  const requiresNative=effects.some(e=>e.kind!=="local_control"),observed=requiresNative?ameFixtureRunner.readAeInventorySync():null;
  if(requiresNative&&observed?.state!=="available"){coreMigrationNativeWitnesses.delete(context);throw Object.assign(Error("core_migration_actual_ae_identity_unavailable"),{code:"core_migration_actual_ae_identity_unavailable"});}
  const previous=coreMigrationNativeWitnesses.get(context);if(previous&&!require("./native-fixture-attempt-ledger").sameProcess(previous.process,observed.process)){coreMigrationNativeWitnesses.delete(context);throw Object.assign(Error("core_migration_operation_ae_birth_changed"),{code:"core_migration_operation_ae_birth_changed"});}
  if(!previous)coreMigrationNativeWitnesses.set(context,Object.freeze({daemonGeneration:context.daemonGeneration,panelActor:context.panelActor,process:observed.process}));
  const checked=Object.freeze({...context,effects:effects.map(e=>Object.freeze({...e,actualAeProcess:observed?.process||null}))});state.assertOperation(checked);
  return delivery?.commandId?Object.freeze({commandId:delivery.commandId,daemonGeneration:context.daemonGeneration,actor,process:observed?.process||null}):undefined;
}
function assertCoreMigrationDelivery(command,req,url){
  if(!coreProductMigration.hasOrigin(PROJECT_ROOT))return;const owner=panelLeaseOwner(req,url),params=url.searchParams,epoch=params.get("panelLifecycleEpoch"),actor={panelConnectionId:owner.panelConnectionId,panelGeneration:owner.panelGeneration,panelInstanceId:params.get("panelInstanceId"),panelLifecycleEpoch:/^\d+$/.test(epoch||"")?Number(epoch):null};
  if(command.state!=="queued")throw Object.assign(Error("core_migration_delivery_command_binding_invalid"),{code:"core_migration_delivery_command_binding_invalid"});
  return assertCoreMigrationOperation(command.coreMigrationOperation,{commandId:command.id,actor,nativeEffect:true});
}

function callToolLogged(source,name,args,executionContext){const tool=toolByName(name),read=tool?.annotations?.readOnlyHint===true||!!tool&&!MUTATING_TOOL_NAMES.has(name)&&/^(get_|list_|inspect_|find_|search_|ping_|wait_for_)/.test(name)||["get_panel_state","list_panel_actions","get_panel_action_result","refresh_panel_guards","reconcile_plan_run","reconcile_project_lifecycle"].includes(name),context=captureCoreMigrationOperation(name,args,read);return coreMigrationOperationContext.run(context,()=>callToolLoggedWithMigrationContext(source,name,args,executionContext));}
function callToolLoggedWithMigrationContext(source, name, args, executionContext) {
  if(initialRuntime)initialRuntime.assertTool();
  if(deploymentMode==="product" && [panelBootstrap.TOOL_NAME,panelBootstrap.RECOVERY_TOOL_NAME].includes(name)){
    if(source!=="mcp-adapter" || executionContext?.panelBootstrapAuthority!==PANEL_BOOTSTRAP_AUTHORITY)
      return toolResult({ok:false,status:"failure",stage:"authorization",reason:"official_mcp_adapter_required"},true);
    return ownedRuntimeService.runBootstrap(()=>callToolLoggedImpl(source,name,args,executionContext));
  }
  if(deploymentMode==="product" && source==="panel-bootstrap-read" && name==="get_project_info" && panelBootstrapReadContext.getStore())
    return ownedRuntimeService.runBootstrapProjectRead(()=>callToolLoggedImpl(source,name,args,executionContext));
  // Connecting an idle panel does not admit project writes or experimental work.
  // The panel service still validates the official adapter, action and idle state.
  if(deploymentMode==="product" && name==="invoke_panel_action" && args?.action==="bridge.connect")
    return ownedRuntimeService.runBootstrap(()=>callToolLoggedImpl(source,name,args,executionContext));
  const tool=toolByName(name),read=tool?.annotations?.readOnlyHint===true || !!tool && !MUTATING_TOOL_NAMES.has(name) && /^(get_|list_|inspect_|find_|search_|ping_|wait_for_)/.test(name) || ["get_panel_state","list_panel_actions","get_panel_action_result","refresh_panel_guards","reconcile_plan_run","reconcile_project_lifecycle"].includes(name);
  return ownedRuntimeService.run(read?"observation":"execution",()=>callToolLoggedImpl(source,name,args,executionContext));
}
async function callToolLoggedImpl(source, name, args, executionContext) {
  assertCoreMigrationOperation(coreMigrationOperationContext.getStore());
  await ameOpenCompExecutor.assertProjectMutationAllowed(name,MUTATING_TOOL_NAMES.has(name) && ![ameRunning.TOOL_NAME,...ameQueueControl.MUTATIONS,ameFixtureGrant.TOOL_NAME,...ameTitleMutationNames].includes(name) || ["start_edit_session","restore_project_checkpoint","restore_project_backup"].includes(name));
  if ([panelBootstrap.TOOL_NAME,panelBootstrap.RECOVERY_TOOL_NAME].includes(name) && source !== "mcp-adapter") {
    return toolResult({ok:false,status:"failure",stage:"authorization",reason:"official_mcp_adapter_required"}, true);
  }
  if (panelControl.isPanelControlTool(name) && (source !== "mcp-adapter" ||
      !executionContext || executionContext.panelControlAuthority !== PANEL_CONTROL_AUTHORITY)) {
    return toolResult({ok:false,status:"failure",stage:"authorization",reason:"official_mcp_adapter_required"}, true);
  }
  // Panel service owns its gates and durable sanitized receipts. Generic AE
  // logging/idempotency must not persist write-only action arguments or cache an invocation.
  if (panelControl.isPanelControlTool(name)) return callTool(name, args, executionContext);
  const eventId = crypto.randomUUID();
  const startedAt = Date.now();
  if(name===projectSave.TOOL_NAME)projectSave.validateToolInput(name,args||{});
  if(name===nativeRenderVariant.RENDER)nativeRenderExecutor.assertAuthorization(executionContext && executionContext.nativeRenderAuthorization,args || {});
  if (name === ameRunning.TOOL_NAME) ameRunningExecutor.assertAuthorization(executionContext && executionContext.ameRunningAuthorization, args || {});
  if (ameQueueControl.MUTATIONS.includes(name)) ameQueueExecutor.assertAuthorization(executionContext && executionContext.ameQueueAuthorization, args || {});
  if (name === ameFixtureGrant.TOOL_NAME) ameFixtureExecutor.assertAuthorization(executionContext && executionContext.ameFixtureAuthorization, args || {});
  if (ameTitleMutationNames.has(name)) ameTitleExecutor.assertAuthorization(executionContext && executionContext.ameTitleAuthorization, name, args || {});
  if (projectLifecycleContract.isLifecycleTool(name)) projectLifecycleContract.validateInput(name, args || {});
  let idContext = null;
  recordEvent("tool_call_started", {
    id: eventId,
    source,
    name,
    args,
    autonomousSession: Boolean(executionContext && executionContext.autonomousSession),
    idempotency: idContext ? { key: idContext.key, scope: idContext.scope } : null
  });

  try {
    const m100Block = m100DirectToolCallBlock(source, name, args || {}, executionContext || null);
    if (m100Block) {
      const durationMs = Date.now() - startedAt;
      recordEvent("m100_direct_tool_blocked", {
        id: eventId,
        source,
        name,
        durationMs,
        code: m100Block.code,
        riskLevel: m100Block.riskLevel,
        knownTool: m100Block.knownTool,
        ignoredClientConfirmation: m100Block.ignoredClientConfirmation
      });
      recordAutonomyObstacle({operation: name, code: m100Block.code, phase: "direct_gate", durationMs,
        proposalId: args && args.actionId, verification: "not_run"});
      return m100BlockedToolResult(m100Block);
    }
    const lifecycleMutation = projectLifecycleContract.isLifecycleMutation(name);
    if (lifecycleMutation) lifecycle.assertManualContext(executionContext && executionContext.lifecycleAuthorization);
    if (MUTATION_SUMMARY_TOOL_NAMES.has(name) || ["start_edit_session", "finish_edit_session"].includes(name)) {
      if (!(lifecycleMutation && projectLifecycleContract.isLifecycleCompletion(name))) lifecycle.assertMutationAllowed();
    }
    idContext = ameOpenComp.MUTATIONS.includes(name) || name===ameJobSource.TOOL || name===titleVerification.TOOL || name===titleExport.TOOL || ameTitleMutationNames.has(name) || ameQueueControl.MUTATIONS.includes(name) || name === ameFixtureGrant.TOOL_NAME || name === nativeRenderVariant.RENDER || name === ameRunning.TOOL_NAME || name === projectSave.TOOL_NAME || lifecycleMutation ? null : idempotencyContext(name, args || {});

    if (M100_DIRECT_TOOL_SOURCES.has(source) && m100DirectEscapeHatchAllowed(source, args || {})) {
      recordEvent("m100_direct_tool_escape_hatch_used", {
        id: eventId,
        source,
        name,
        policyVersion: M100_RISK_POLICY_VERSION,
        env: M100_DIRECT_ESCAPE_HATCH_ENV
      });
    }

    // Montage freshness must also precede a cached mutation-result return.
    // This is the existing plan guard, scoped to the current typed unit.
    let placeholderGuard = null;
    const montageContext = placeholderPlanContext.getStore();
    if (MUTATING_TOOL_NAMES.has(name) && montageContext && montageContext.plan.montagePipeline) {
      placeholderGuard = await guardPlaceholderPlan(montageContext.plan, {steps:montageContext.remainingSteps,
        bindingStep:{tool:name,args:args || {}},completedSteps:montageContext.completedSteps || [],validation:montageContext.validation,
        ...(montageContext.montageVerifyMaterials ? {montageVerifyMaterials:montageContext.montageVerifyMaterials} : {})});
    }
    if (idContext) {
      const existing = idempotencyRecords.get(idContext.recordKey);
      if (existing) {
        if (existing.argsHash !== idContext.argsHash) {
          throw new Error(`idempotencyKey conflict for ${name}: the key was already used with different arguments in scope ${idContext.scope}.`);
        }
        if(name==="reload_montage_material_source")throw placeholderError("native_source_reload_replay_forbidden");
        if(name==="save_comp_frame_png" && (args.expectedCompItemId!==undefined || args.reviewOwner)) {
          if(args.reviewOwner)throw placeholderError("root_png_replay_requires_fresh_capture");
          const wanted=requiredPositiveInteger(args,"expectedCompItemId");
          const probe=await runExtendScriptBody(`${resolveCompScript}
            var comp=__codexResolveComp(${optionalPositiveInteger(args,"compItemIndex") ?? "null"},${aeLiteral(optionalString(args,"compName",""))});return {itemId:comp.id};`);
          if(probe.result?.itemId!==wanted)throw placeholderError("png_comp_identity_changed_before_cached_return");
          throw placeholderError("root_png_replay_requires_fresh_capture");
        }
        if (name === "save_comp_frame_png") {
          const replayCheck = validateCachedPngReplay(existing, { exportDir: GENERATED_EXPORT_DIR });
          if (!replayCheck.ok) {
            const durationMs = Date.now() - startedAt;
            recordEvent("tool_call_idempotency_replay_failed", {
              id: eventId,
              source,
              name,
              durationMs,
              key: idContext.key,
              scope: idContext.scope,
              reason: replayCheck.reason
            });
            return toolResult(`Cached generated PNG replay verification failed: ${replayCheck.reason}.`, true);
          }
        }
        const replayed = replayIdempotencyResult(idContext, existing);
        const durationMs = Date.now() - startedAt;
        recordEvent("tool_call_idempotency_replayed", {
          id: eventId,
          source,
          name,
          durationMs,
          key: idContext.key,
          scope: idContext.scope,
          firstEventId: existing.eventId
        });
        return replayed;
      }
    }

    if (MUTATING_TOOL_NAMES.has(name) && !lifecycleMutation && !placeholderGuard) {
      const context = placeholderPlanContext.getStore();
      const plan = context && context.plan || { steps: [{ tool: name, args: args || {} }] };
      placeholderGuard = await guardPlaceholderPlan(plan, { steps: context && context.remainingSteps || plan.steps,
        bindingStep: { tool: name, args: args || {} }, completedSteps: context && context.completedSteps || [], validation: context && context.validation,
        ...(context && context.montageVerifyMaterials ? {montageVerifyMaterials:context.montageVerifyMaterials} : {}) });
    }
    // Resolve current address hints for both ordinary and freshly guarded
    // montage steps. Stable identities are still rechecked by the native setter.
    if (MUTATING_TOOL_NAMES.has(name) && !lifecycleMutation) args = rebindPlaceholderArgs(name, args, placeholderGuard);
    const commandContext = planCommandContext.getStore();
    // Nested typed inspection must not replace the enclosing mutation's bound
    // execution arguments with its own (often empty) read arguments.
    if(commandContext && commandContext.item && commandContext.item.tool===name) commandContext.item.args=args;
    const checkpoint = ameOpenComp.MUTATIONS.includes(name) || name===ameJobSource.TOOL || name===titleVerification.TOOL || name===titleExport.TOOL || ameTitleMutationNames.has(name) || ameQueueControl.MUTATIONS.includes(name) || name===ameFixtureGrant.TOOL_NAME || name===nativeRenderVariant.RENDER || name===projectSave.TOOL_NAME || lifecycleMutation ? null : await withPlanCommandRole("checkpoint",()=>maybeCreateMutationCheckpoint(args || {}, name));
    const result = await withPlanCommandRole(MUTATING_TOOL_NAMES.has(name) ? "mutation" : "readback",
      () => placeholderMutationContext.run(placeholderGuard, () => callTool(name, args, executionContext || null)));
    if(commandContext && commandContext.item && MUTATING_TOOL_NAMES.has(name)) {
      commandContext.item.mutationResult=firstToolPayload(result);
      commandContext.item.mutationResultIsError=Boolean(result.isError);
      commandContext.persist();
    }
    const pendingMutation=amePending.isPendingStep({...commandContext?.item,result:firstToolPayload(result)},commandContext?.run);
    let resultWithCheckpoint = pendingMutation?result:attachMutationMetadataToToolResult(result, name, args || {}, checkpoint);
    // Read-back остаётся разрешённым после отзыва lease: завершённую мутацию нужно проверить.
    if (!lifecycleMutation) resultWithCheckpoint = await withPlanCommandRole("readback",()=>autonomousCommandContext.run(null, () => attachMutationVerificationToToolResult(resultWithCheckpoint, name, args || {})));
    const idempotencyRecord = storeIdempotencyResult(idContext, eventId, resultWithCheckpoint);
    resultWithCheckpoint = attachStoredIdempotencyMetadata(resultWithCheckpoint, idContext, idempotencyRecord);
    const durationMs = Date.now() - startedAt;
    trackEditSessionOperation({
      eventId,
      source,
      name,
      args: args || {},
      ok: !resultWithCheckpoint.isError,
      durationMs,
      result: resultWithCheckpoint
    });
    recordEvent("tool_call_finished", {
      id: eventId,
      source,
      name,
      ok: !resultWithCheckpoint.isError,
      durationMs,
      inputChars: JSON.stringify(args || {}).length,
      outputChars: JSON.stringify(resultWithCheckpoint).length
    });
    return resultWithCheckpoint;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    trackEditSessionOperation({
      eventId,
      source,
      name,
      args: args || {},
      ok: false,
      durationMs,
      error: error.message || String(error)
    });
    recordEvent("tool_call_failed", {
      id: eventId,
      source,
      name,
      durationMs,
      error: error.message || String(error),
      line: error.line || null
    });
    throw error;
  }
}

const coreDispatchPorts=Object.freeze({
get AUTONOMY_CONTRACT_VERSION(){return AUTONOMY_CONTRACT_VERSION;},
get BACKUP_DIR(){return BACKUP_DIR;},
get COMMAND_TIMEOUT_MS(){return COMMAND_TIMEOUT_MS;},
get EXTENDSCRIPT_BODY_LINE_OFFSET(){return EXTENDSCRIPT_BODY_LINE_OFFSET;},
get GENERATED_EXPORT_DIR(){return GENERATED_EXPORT_DIR;},
get GENERATED_RECOVERY_SCOPE_TTL_MS(){return GENERATED_RECOVERY_SCOPE_TTL_MS;},
get LOG_DIR(){return LOG_DIR;},
get LOG_FILE(){return LOG_FILE;},
get M100_DIRECT_ESCAPE_HATCH_ARG(){return M100_DIRECT_ESCAPE_HATCH_ARG;},
get MUTATION_CHECKPOINT_SCHEMA_PROPERTIES(){return MUTATION_CHECKPOINT_SCHEMA_PROPERTIES;},
get OWNED_TRUSTED_PROJECT_BODY(){return OWNED_TRUSTED_PROJECT_BODY;},
get PANEL_CONTROL_AUTHORITY(){return PANEL_CONTROL_AUTHORITY;},
get PROJECT_ROOT(){return PROJECT_ROOT;},
get RUNTIME_IDENTITY(){return RUNTIME_IDENTITY;},
get aeLiteral(){return aeLiteral;},
get ameEnqueueSequence(){return ameEnqueueSequence;},
get ameEnqueueSequencer(){return ameEnqueueSequencer;},
get ameFixtureCheckpoints(){return ameFixtureCheckpoints;},
get ameFixtureExecutor(){return ameFixtureExecutor;},
get ameFixtureGrant(){return ameFixtureGrant;},
get ameFixtureRunner(){return ameFixtureRunner;},
get ameJobSource(){return ameJobSource;},
get ameJobSourceExecutor(){return ameJobSourceExecutor;},
get ameOpenComp(){return ameOpenComp;},
get ameOpenCompExecutor(){return ameOpenCompExecutor;},
get amePending(){return amePending;},
get amePresets(){return amePresets;},
get ameQueueControl(){return ameQueueControl;},
get ameQueueExecutor(){return ameQueueExecutor;},
get ameRunning(){return ameRunning;},
get ameRunningExecutor(){return ameRunningExecutor;},
get ameSavedSourceAdmission(){return ameSavedSourceAdmission;},
get ameSourceProbe(){return ameSourceProbe;},
get ameSourceProbeExecutor(){return ameSourceProbeExecutor;},
get ameTitleExecutor(){return ameTitleExecutor;},
get ameTitleJobs(){return ameTitleJobs;},
get ameTitleMutationNames(){return ameTitleMutationNames;},
get ameTransport(){return ameTransport;},
get autonomousCommandContext(){return autonomousCommandContext;},
get autonomousSession(){return autonomousSession;},
get buildCompVisualReviewPlan(){return buildCompVisualReviewPlan;},
get buildPostRunMontageReadBack(){return buildPostRunMontageReadBack;},
get calculateFitTransform(){return calculateFitTransform;},
get callToolLogged(){return callToolLogged;},
get canonicalCaptureDependencies(){return canonicalCaptureDependencies;},
get canonicalExportContext(){return canonicalExportContext;},
get canonicalNativeCommandId(){return canonicalNativeCommandId;},
get checkpointDetails(){return checkpointDetails;},
get commonTitleRecovery(){return commonTitleRecovery;},
get compDynamicLinkRead(){return compDynamicLinkRead;},
get compVisualReviewManifest(){return compVisualReviewManifest;},
get compactAeCommand(){return compactAeCommand;},
get completedResults(){return completedResults;},
get copySavedProjectFile(){return copySavedProjectFile;},
get countQueuedCommands(){return countQueuedCommands;},
get createM100AgentPlanProposalFromRequest(){return createM100AgentPlanProposalFromRequest;},
get crypto(){return crypto;},
get currentPlaceholderState(){return currentPlaceholderState;},
get currentProposalState(){return currentProposalState;},
get daemonMontageDeps(){return daemonMontageDeps;},
get evidenceContext(){return evidenceContext;},
get exportPathPointsFile(){return exportPathPointsFile;},
get exportTextToFile(){return exportTextToFile;},
get finishEditSession(){return finishEditSession;},
get firstToolPayload(){return firstToolPayload;},
get freshPlaceholderUsage(){return freshPlaceholderUsage;},
get fs(){return fs;},
get generatedRecoveryByPanel(){return generatedRecoveryByPanel;},
get generatedRecoveryReadContext(){return generatedRecoveryReadContext;},
get generatedRecoveryScopes(){return generatedRecoveryScopes;},
get getBridgeStatus(){return getBridgeStatus;},
get getCurrentProjectSummary(){return getCurrentProjectSummary;},
get getEditSessionStatus(){return getEditSessionStatus;},
get getPlaceholderProtection(){return getPlaceholderProtection;},
get getScriptLineContext(){return getScriptLineContext;},
get guardPlaceholderPlan(){return guardPlaceholderPlan;},
get hasArg(){return hasArg;},
get inflightCommands(){return inflightCommands;},
get initialRuntime(){return initialRuntime;},
get lastPanelInfo(){return lastPanelInfo;},
get lastPanelSeenAt(){return lastPanelSeenAt;},
get lifecycle(){return lifecycle;},
get listEditSessions(){return listEditSessions;},
get listEffectPresets(){return listEffectPresets;},
get listProjectCheckpoints(){return listProjectCheckpoints;},
get montageCaptureService(){return montageCaptureService;},
get montagePipelineService(){return montagePipelineService;},
get nativeFixtureAbandonment(){return nativeFixtureAbandonment;},
get nativeFixtureAdmissionRefusal(){return nativeFixtureAdmissionRefusal;},
get nativeFixturePrephaseProof(){return nativeFixturePrephaseProof;},
get nativeFixturePrephaseRecovery(){return nativeFixturePrephaseRecovery;},
get nativeRenderExecutor(){return nativeRenderExecutor;},
get nativeRenderVariant(){return nativeRenderVariant;},
get normalizeFreshAssignments(){return normalizeFreshAssignments;},
get normalizePropertyPathArg(){return normalizePropertyPathArg;},
get normalizePuppetPinType(){return normalizePuppetPinType;},
get obstacleEvent(){return obstacleEvent;},
get optionalBoolean(){return optionalBoolean;},
get optionalNumber(){return optionalNumber;},
get optionalNumberArray(){return optionalNumberArray;},
get optionalPathGeometry(){return optionalPathGeometry;},
get optionalPositiveInteger(){return optionalPositiveInteger;},
get optionalPositiveIntegerList(){return optionalPositiveIntegerList;},
get optionalResolutionFactor(){return optionalResolutionFactor;},
get optionalString(){return optionalString;},
get optionalTextJustification(){return optionalTextJustification;},
get ownedFirstTwoTitleInventory(){return ownedFirstTwoTitleInventory;},
get ownedInitialUiBaseline(){return ownedInitialUiBaseline;},
get ownedObservedRootTiming(){return ownedObservedRootTiming;},
get ownedReadonlyFirstTwoPreparation(){return ownedReadonlyFirstTwoPreparation;},
get ownedReadonlyObservedRangePreparation(){return ownedReadonlyObservedRangePreparation;},
get ownedReadonlyScriptPreparation(){return ownedReadonlyScriptPreparation;},
get panelBootstrap(){return panelBootstrap;},
get panelBootstrapService(){return panelBootstrapService;},
get panelControl(){return panelControl;},
get panelControlService(){return panelControlService;},
get parseCheckpointFilename(){return parseCheckpointFilename;},
get path(){return path;},
get pathGeometryFromTopLevelArgs(){return pathGeometryFromTopLevelArgs;},
get placeholderError(){return placeholderError;},
get placeholderEvidence(){return placeholderEvidence;},
get placeholderGeometry(){return placeholderGeometry;},
get placeholderPlanBuilder(){return placeholderPlanBuilder;},
get placeholderPlanContext(){return placeholderPlanContext;},
get placeholderProtection(){return placeholderProtection;},
get placeholderReadBack(){return placeholderReadBack;},
get placeholderReviewService(){return placeholderReviewService;},
get placeholderReviewTools(){return placeholderReviewTools;},
get placeholderRootsForTargets(){return placeholderRootsForTargets;},
get placeholderSourceRecovery(){return placeholderSourceRecovery;},
get placeholderUsage(){return placeholderUsage;},
get placeholderVisualBatches(){return placeholderVisualBatches;},
get placeholderVisualReview(){return placeholderVisualReview;},
get planCommandContext(){return planCommandContext;},
get planRunRecords(){return planRunRecords;},
get planRunResponse(){return planRunResponse;},
get projectLifecycleContract(){return projectLifecycleContract;},
get projectLifecyclePlan(){return projectLifecyclePlan;},
get projectLifecycleState(){return projectLifecycleState;},
get projectSave(){return projectSave;},
get projectSaveExecutor(){return projectSaveExecutor;},
get projectStateController(){return projectStateController;},
get projectStateMemory(){return projectStateMemory;},
get readCurrentSourceLoadEvidence(){return readCurrentSourceLoadEvidence;},
get readPlaceholderGeometry(){return readPlaceholderGeometry;},
get readPlaceholderInventory(){return readPlaceholderInventory;},
get reconcileCommonTitle(){return reconcileCommonTitle;},
get recordAutonomyObstacle(){return recordAutonomyObstacle;},
get recordEvent(){return recordEvent;},
get requireFreshReviewRecord(){return requireFreshReviewRecord;},
get requiredExplicitPositiveIntegerList(){return requiredExplicitPositiveIntegerList;},
get requiredKeyframeArray(){return requiredKeyframeArray;},
get requiredPathGeometryKeyframes(){return requiredPathGeometryKeyframes;},
get requiredPointArray(){return requiredPointArray;},
get requiredPositiveInteger(){return requiredPositiveInteger;},
get requiredPositiveIntegerList(){return requiredPositiveIntegerList;},
get resolveCheckpointFile(){return resolveCheckpointFile;},
get resolveExistingFile(){return resolveExistingFile;},
get resolveGeneratedPngExportFile(){return resolveGeneratedPngExportFile;},
get resolveOutputFilePath(){return resolveOutputFilePath;},
get resolveScriptFile(){return resolveScriptFile;},
get reviewContentFingerprint(){return reviewContentFingerprint;},
get reviewEvidence(){return reviewEvidence;},
get runExtendScriptBody(){return runExtendScriptBody;},
get runValidatedAgentPlan(){return runValidatedAgentPlan;},
get savedAmeSourceAdmission(){return savedAmeSourceAdmission;},
get slideshowPlanBuilder(){return slideshowPlanBuilder;},
get slideshowTools(){return slideshowTools;},
get startEditSession(){return startEditSession;},
get tailJsonl(){return tailJsonl;},
get timestampForFilename(){return timestampForFilename;},
get titleExport(){return titleExport;},
get titleExportExecutor(){return titleExportExecutor;},
get titleExportRecovery(){return titleExportRecovery;},
get titleVerification(){return titleVerification;},
get titleVerificationExecutor(){return titleVerificationExecutor;},
get toolResult(){return toolResult;},
get validateAgentPlanWithRepair(){return validateAgentPlanWithRepair;},
get validateCompVisualReviewInput(){return validateCompVisualReviewInput;},
get waitForBridgeState(){return waitForBridgeState;},
get waitForCompletePng(){return waitForCompletePng;},
get waitForPlanState(){return waitForPlanState;},
get withDeepDuplicateResultAliases(){return withDeepDuplicateResultAliases;},
get withPlanCommandRole(){return withPlanCommandRole;}
});
coreToolDispatch=require("./core-tool-dispatch").createToolDispatch(coreDispatchPorts);

module.exports = {
  ownedTrustedReadStatus,ownedTrustedReadObserve,ownedTrustedReadQuiescence,ownedTrustedServerOnlyResult,ownedTrustedReadonlyScript,ownedTrustedPreparationScript,ownedTrustedExecutionPreparation,ownedTrustedExecutionGates,ownedTrustedStageScript,ownedTrustedRestorationProgram,ownedTrustedRestorationScript,ownedTrustedAmeScript,ownedTrustedAmeManualReservation,
  decorateDaemonToolResult,
  hardcoreRunNeedsReconciliation,
  async preparePlaceholderInventoryScript(options = {}) {
    const prepared = { script: null, fixtureResult: null };
    await scriptPreparationContext.run(prepared, () => readPlaceholderInventory(options));
    return prepared;
  },
  async prepareToolScript(name, args, fixtureResult = null, protection = null) {
    if (!["set_property_value", "set_effect_property", "set_property_keyframes", "set_expression", "get_layer_details", "get_effect_details", "get_property_value",
      "set_comp_properties", "set_comp_work_area", "get_comp_details", "find_project_items", "set_layer_time_range", "stagger_layers", "split_layers_at_time",
      "precompose_layers", "replace_layer_source", "relink_footage_source", "deep_duplicate_precomp_sources", "rename_layers", "rename_project_items", "update_text_layer",
      "create_solid_layer", "create_adjustment_layer", "create_shape_layer", "create_camera_layer", "create_layer_mask", "set_layer_mask", "get_path_geometry", "set_path_geometry", "duplicate_layer",
      "duplicate_layers", "delete_layer", "add_comp_marker", "add_layer_marker", "update_layer_marker", "delete_layer_marker", "fit_layer_to_comp", "set_layer_transform",
      "apply_keyframe_ease", "clear_expression", "add_comp_to_render_queue", "set_render_queue_output", "get_render_queue_status", "align_layers_to_time"
    ].includes(name)) throw new Error("Script preparation unsupported for this tool.");
    const prepared = { script: null, result: null, fixtureResult };
    args = rebindPlaceholderArgs(name, args, protection);
    await scriptPreparationContext.run(prepared, () => placeholderMutationContext.run(protection,
      async () => { prepared.result = await callTool(name, args); }));
    return prepared;
  },
  requiredPositiveInteger, requiredPositiveIntegerList, compactCheckpoint, writeJson, toolResult, validateCachedPngReplay, buildServerSemanticVerification,
  callTool,
  exposedTools,
  callToolLogged
};

if (require.main === module) {
  if(trustedSourceCensus.requested()){
    void trustedSourceCensus.collectFixed("daemon").then(value=>process.stdout.write(JSON.stringify(value)+"\n"),error=>{
      process.stderr.write(JSON.stringify({authority:false,code:error.code||"owned_initial_passive_census_unknown"})+"\n");process.exitCode=1;});
  }else if(initialRuntime){
    void startTrustedReadBridge().catch(error=>{process.stderr.write(JSON.stringify({code:error.code||"owned_initial_daemon_start_unknown",replayAllowed:false})+"\n");process.exitCode=1;});
  }else{
    activeEditSession = loadActiveEditSession();
    
    loadIdempotencyRecords();
    if (activeEditSession) recordEvent("edit_session_restored", { session: compactEditSession(activeEditSession) });
    startHttpBridge();
  }
}
