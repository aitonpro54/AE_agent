"use strict";
// Private bridge integration. Client JSON is never an execution context.
const {AsyncLocalStorage}=require("async_hooks");
const fs=require("fs"),path=require("path");
const c=require("./project-lifecycle-contract");
const t=require("./project-lifecycle-transition");
const {createProjectLifecycleService}=require("./project-lifecycle-service");
const memory=require("./project-intent-memory");
const planBuilder=require("./project-lifecycle-plan");
const nativeState=require("./project-lifecycle-state");
function createLifecycleBridgeAdapter(deps) {
  const contexts=new WeakMap(),capOwners=new WeakMap(),scope=new AsyncLocalStorage();
  const storage=deps.storage || t.createLifecycleStorage();
  function planStep(plan) {
    const steps=plan && plan.steps;
    if (!Array.isArray(steps)) c.fail("lifecycle_plan_scope");
    const lifecycle=steps.filter(s=>c.isLifecycleMutation(s.tool || s.toolName));
    if (!lifecycle.length) return null;
    if (steps.length!==1 || lifecycle.length!==1 || lifecycle[0].resultBindings !== undefined || plan.runtimeBindings !== undefined || plan.montagePipeline !== undefined) c.fail("lifecycle_terminal_plan_required");
    const step=lifecycle[0],name=step.tool || step.toolName,args=step.safeArgs || step.args || step.arguments || {};
    c.validateInput(name,args);
    if (Object.values(args).some(v=>typeof v==="string" && /\{\{|\$\{|\bsteps\./.test(v))) c.fail("lifecycle_runtime_bindings_forbidden");
    if (name!=="finalize_project_lifecycle" && !c.samePath(plan.targetProject && plan.targetProject.file,args.expectedSourceProjectFile)) c.fail("lifecycle_source_plan_mismatch");
    return {name,args};
  }
  function assertContext(context) {
    const saved=context && contexts.get(context);
    if (!saved) c.fail("lifecycle_manual_authorization_required");
    const record=saved.record;
    deps.proposals.assertExecution({actionId:record.actionId,executionId:saved.run.id,proposalExpiresAt:record.proposalExpiresAt});
    if (record.confirmedBySurface!=="cep-panel" || record.payloadHash!==saved.payloadHash || saved.run.dryRun!==false) c.fail("lifecycle_manual_authorization_required");
    return saved;
  }
  function verifyManualAuthorization(context,hints) {
    const saved=assertContext(context),record=saved.record,pins=record.lifecycleDryRunPins;
    deps.verifyDryRun(record,saved.stepCount);
    if (!pins || pins.inputHash!==hints.inputHash || pins.sourcePolicyHash!==hints.sourcePolicyHash || pins.targetPolicyHash!==hints.targetPolicyHash ||
        saved.inputHash!==hints.inputHash || saved.name!==hints.name) c.fail("lifecycle_dry_run_pins_changed");
    if (c.hash(hints.expectedNative)!==pins.nativeHash) c.fail("lifecycle_native_dry_run_changed");
    return Object.freeze({channel:"manual_cep",confirmed:true,dryRunVerified:true,actionId:record.actionId,runId:saved.run.id,
      payloadHash:c.canonicalPlanHash(saved.payloadHash),inputHash:hints.inputHash,sourcePolicyHash:pins.sourcePolicyHash,targetPolicyHash:pins.targetPolicyHash,
      ...(saved.ownedSessionId ? {ownedEditSessionId:saved.ownedSessionId} : {})});
  }
  async function readNative(script,cap) {
    t.validateCommandCapability(cap,{rawScript:script});
    const facts=t.phaseCapabilityFacts(cap);
    if (!facts.readOnly) capOwners.set(cap,scope.getStore());
    return deps.readNative(script,cap);
  }
  const service=createProjectLifecycleService({storage,readNative,sourceCheckpoint:deps.sourceCheckpoint,
    verifyManualAuthorization,assertIdle:context=>{const saved=assertContext(context);return deps.isIdle(saved.ownedSessionId)===true;},
    retireContext:async(context,hints)=>{const saved=assertContext(context);return deps.retireContext(saved,hints);}});
  async function preflight(plan,record,dryRun) {
    const step=planStep(plan); if (!step) return null;
    const projection=storage.pendingProjection();
    if (!projection.enabled) c.fail("lifecycle_disabled");
    let sourcePolicyHash,targetPolicyHash,expectedNative,accepted;
    const store=storage.load();
    if (step.name==="finalize_project_lifecycle") {
      const p=store.pendingLifecycle;
      if (!p || p.transitionId!==step.args.transitionId || !p.proof || !["final_proven","context_retired"].includes(p.phase)) c.fail("lifecycle_finalize_requires_persisted_final_proof");
      expectedNative=p.proof.finalNative;
      if (!c.samePath(plan.targetProject && plan.targetProject.file,expectedNative.file)) c.fail("lifecycle_source_plan_mismatch");
      sourcePolicyHash=p.sourcePolicyHash;targetPolicyHash=p.targetPolicyHash;accepted=p.targetState.acceptedPlaceholders;
    } else {
      storage.assertMutationAllowed();
      const source=t.readState(store,step.args.expectedSourceProjectFile);
      sourcePolicyHash=c.hash(source);targetPolicyHash=c.hash(store.projectState[memory.projectStateKey(step.args.targetProjectFile)] || null);
      expectedNative={file:step.args.expectedSourceProjectFile,dirty:step.args.expectedSourceDirty,revision:step.args.expectedSourceRevision};accepted=source.acceptedPlaceholders;
      const sourceFile=service.readFileRecord(step.args.expectedSourceProjectFile);
      if (sourceFile.sha256!==step.args.expectedSourceSavedSha25664) c.fail("lifecycle_source_disk_pin_changed");
      const targetPolicy=store.projectState[memory.projectStateKey(step.args.targetProjectFile)] || null;
      if (step.name==="open_project") {
        if (!targetPolicy) c.fail("lifecycle_target_policy_missing");
        if (service.readFileRecord(step.args.targetProjectFile).sha256!==step.args.expectedTargetSavedSha25664) c.fail("lifecycle_target_disk_pin_changed");
      } else {
        if (targetPolicy) c.fail("lifecycle_target_policy_collision");
        if (fs.existsSync(step.args.targetProjectFile)) c.fail("lifecycle_target_exists");
        if (!c.samePath(fs.realpathSync(path.dirname(step.args.targetProjectFile)),path.dirname(step.args.targetProjectFile))) c.fail("lifecycle_ambiguous_parent");
      }
    }
    const transition=step.name==="finalize_project_lifecycle" ? step.args.transitionId : null;
    const inventory=await storage.withReadCapability(transition,{expectedNative,accepted},async(script,cap)=>c.validateInventory(await readNative(script,cap),accepted));
    const pins=Object.freeze({inputHash:c.hash({name:step.name,args:step.args}),sourcePolicyHash,targetPolicyHash,nativeHash:c.hash(expectedNative),
      inventoryHash:c.inventoryHash(inventory),observedAt:new Date().toISOString()});
    if (dryRun && record) record.lifecycleDryRunPins=pins;
    if (!dryRun && (!record || !record.lifecycleDryRunPins || ["inputHash","sourcePolicyHash","targetPolicyHash","nativeHash","inventoryHash"].some(k=>record.lifecycleDryRunPins[k]!==pins[k]))) c.fail("lifecycle_dry_run_pins_changed");
    return {ok:true,scope:"native_inventory_and_policy_pins",projectFile:inventory.native.file,artisticAccepted:false};
  }
  function issueContext({record,run,plan,ownedSessionId,manual}) {
    if (manual!==true || !record || !run || run.dryRun!==false) c.fail("lifecycle_manual_authorization_required");
    const step=planStep(plan);if (!step) c.fail("lifecycle_plan_scope");
    const context=Object.freeze(Object.create(null));
    contexts.set(context,{record,run,ownedSessionId:ownedSessionId || null,name:step.name,inputHash:c.hash({name:step.name,args:step.args}),payloadHash:record.payloadHash,stepCount:plan.steps.length});
    assertContext(context);return context;
  }
  async function execute(name,args,context) {
    c.validateInput(name,args);
    if (name==="reconcile_project_lifecycle") return service.reconcile(args);
    assertContext(context);
    return scope.run(context,()=>service.execute(name,args,context));
  }
  function validateCommand(cap,rawScript,commandId) {
    t.validateCommandCapability(cap,{rawScript,...(commandId ? {commandId} : {})});
    if (!t.phaseCapabilityFacts(cap).readOnly) assertContext(capOwners.get(cap));
    return true;
  }
  async function build(input) {
    planBuilder.validateBuilderInput(input);
    if (!storage.pendingProjection().enabled) c.fail("lifecycle_disabled");
    storage.assertMutationAllowed();
    // Fixed read-only native getter. It neither adopts a project nor supplies authority.
    const before=nativeState.normalizeProjectLifecycleState(await readState());
    if (!before.lifecycleReady) c.fail("native_lifecycle_not_ready");
    const sourceFile=service.readFileRecord(before.file);
    const targetFile=input.operation==="open_project" ? service.readFileRecord(input.targetProjectFile) : null;
    const after=nativeState.normalizeProjectLifecycleState(await readState());
    if (before.file!==after.file || before.dirty!==after.dirty || before.revision!==after.revision) c.fail("lifecycle_builder_source_changed");
    return planBuilder.buildProjectLifecyclePlan(input,{native:after,sourceFile,targetFile},c.validateInput);
  }
  function readState() { return storage.withStateReadCapability((script,cap)=>readNative(script,cap)); }
  return {storage,service,planStep,preflight,issueContext,execute,validateCommand,build,
    assertManualContext:assertContext,
    isPhaseCapability:t.isPhaseCapability,phaseFacts:t.phaseCapabilityFacts,
    readState,assertMutationAllowed:()=>storage.assertMutationAllowed(),epoch:()=>storage.epoch(),diagnostics:()=>storage.pendingProjection()};
}
module.exports={createLifecycleBridgeAdapter};
