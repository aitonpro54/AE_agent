"use strict";
/** Typed tool dispatch. Ports expose live runtime bindings; no token/capability constructor. */
function createToolDispatch(ports){
async function callTool(name, args, executionContext) {
  if(name===ports.ameJobSource.INSPECT||name===ports.ameJobSource.TOOL)
    return ports.toolResult({ok:false,code:"ame_snapshot_source_frozen",scope:"experimental_unfinished_frozen_pending_separate_user_scope",replayAllowed:false},true);
  if(ports.initialRuntime&&!ports.ownedReadonlyScriptPreparation(name))ports.initialRuntime.assertTool();
  if(name===ports.ameOpenComp.INSPECT)return ports.toolResult(await ports.ameOpenCompExecutor.inspect(args));
  if(name===ports.ameOpenComp.DECLARE)return ports.toolResult(await ports.ameOpenCompExecutor.declare(args));
  if(name===ports.ameOpenComp.REPORT)return ports.toolResult(ports.ameOpenCompExecutor.report(args));
  if(name===ports.ameOpenComp.RECONCILE){const result=await ports.ameOpenCompExecutor.reconcile(args);return ports.toolResult(result,!result.ok);}
  if(ports.ameOpenComp.MUTATIONS.includes(name)){const result=await ports.ameOpenCompExecutor.execute(name,args,executionContext&&executionContext.ameOpenCompAuthorization);return ports.toolResult(result,!result.ok);}
  if (name === ports.panelBootstrap.RECOVERY_TOOL_NAME) {
    const result=await ports.panelBootstrapService.recover(args || {});
    return ports.toolResult(result,!result.ok);
  }
  if (name === ports.panelBootstrap.TOOL_NAME) {
    const result = await ports.panelBootstrapService.ensure(args || {});
    return ports.toolResult(result, !result.ok);
  }
  if (ports.panelControl.isPanelControlTool(name)) {
    if (!executionContext || executionContext.panelControlAuthority !== ports.PANEL_CONTROL_AUTHORITY) {
      return ports.toolResult({ok:false,status:"failure",stage:"authorization",reason:"official_mcp_adapter_required"}, true);
    }
    try {
      const result = await ports.panelControlService.handleTool(name, args);
      return ports.toolResult(result, !result.ok);
    } catch (error) {
      return ports.toolResult({ok:false, code:error.code || "panel_control_failed", error:error.message}, true);
    }
  }
  
  const setterIdentityGuard = ports.placeholderProtection.aeSetterIdentityGuard(name,args);
  args = args || {};
  if (name === ports.projectLifecyclePlan.tool.name) {
    try { return ports.toolResult(await ports.lifecycle.build(args)); }
    catch (error) { return ports.toolResult({ok:false, code:error.code || "lifecycle_builder_failed", error:error.message}, true); }
  }
  if (name === ports.projectLifecyclePlan.recoveryTool.name) {
    try { return ports.toolResult(await ports.lifecycle.buildRecovery(args)); }
    catch (error) { return ports.toolResult({ok:false, code:error.code || "lifecycle_recovery_builder_failed", error:error.message}, true); }
  }
  if (ports.projectLifecycleContract.isLifecycleTool(name)) {
    try {
      const receipt = await ports.lifecycle.execute(name, args, executionContext && executionContext.lifecycleAuthorization);
      return ports.toolResult(name === "reconcile_project_lifecycle" ? receipt : {ok:true, lifecycleReceipt:receipt,
        ...(name === "recover_project_lifecycle" ? {recoveryReadbacks:ports.lifecycle.recoveryReadbacks(receipt)} : {})});
    } catch (error) { return ports.toolResult({ok:false, code:error.code || "lifecycle_failed", error:error.message}, true); }
  }
  if(name==="get_montage_root_render_state"){
    try{
      if(Object.keys(args).some(k=>!["rootCompItemId","rootTimes"].includes(k)))throw ports.placeholderError("native_root_probe_client_claims_forbidden");
      const native=await ports.runExtendScriptBody(ports.montageCaptureService.nativeRootProbeScript(args.rootCompItemId,args.rootTimes));
      if(native?.ok===false || !native?.result)throw ports.placeholderError("native_root_probe_failed");
      return ports.toolResult({...native.result,completeRootRenderState:false,artisticAccepted:false});
    }catch(error){return ports.toolResult({ok:false,code:error.code || error.message,error:error.message,completeRootRenderState:false},true);}
  }
  if(name==="get_montage_source_load_evidence"){
    try{return ports.toolResult(await ports.readCurrentSourceLoadEvidence(ports.requiredPositiveInteger(args,"sourceItemId")));}
    catch(error){return ports.toolResult({ok:false,code:error.code || error.message},true);}
  }
  if(name==="reload_montage_material_source"){
    try{
      if(Object.keys(args).some(k=>!["applicationRunIds","sourceItemId",...Object.keys(ports.MUTATION_CHECKPOINT_SCHEMA_PROPERTIES)].includes(k)))throw ports.placeholderError("native_reload_client_claims_forbidden");
      const sourceItemId=ports.requiredPositiveInteger(args,"sourceItemId"),execution=ports.canonicalExportContext();
      if(!Array.isArray(args.applicationRunIds) || !args.applicationRunIds.length || args.applicationRunIds.length>32)throw ports.placeholderError("native_reload_scope_invalid");
      const {projectFile,state}=await ports.currentPlaceholderState(),records=args.applicationRunIds.map(id=>ports.planRunRecords.readRecord(ports.LOG_DIR,id,{throwOnError:true}));
      const inventory=await ports.readPlaceholderInventory(),scope=ports.montageCaptureService.resolveReloadScope(records,state,sourceItemId,inventory,execution);
      for(const record of records){const binding=ports.montageCaptureService.resolveApplicationRecord(record,null,[record.plan.montagePipeline.captureRequirements.frameRequirements[0].frameId]);await ports.montageCaptureService.assertFreshTarget(binding,record,ports.canonicalCaptureDependencies());}
      const before=await ports.withPlanCommandRole("readback",()=>ports.runExtendScriptBody(ports.montageCaptureService.nativeSourceScopeScript(scope)));
      if(before?.ok===false || !before?.result)throw ports.placeholderError("native_reload_source_preflight_failed");
      const fileLedger={bytes:0,requests:0},filesBefore=ports.montageCaptureService.readContributingFiles([ports.montageCaptureService.sourceFileReference(scope,before.result)],records[0].plan.montagePipeline.readBudgets,fileLedger);
      if(filesBefore[0].sha256!==scope.material.sha256 || filesBefore[0].byteLength!==scope.material.byteLength)throw ports.placeholderError("native_reload_material_changed");
      const readerId=ports.crypto.randomUUID(),native=await ports.runExtendScriptBody(ports.montageCaptureService.nativeSourceScopeScript(scope,{reload:true,readerId}));
      if(native?.ok===false || native?.result?.nativeReload?.operationExecuted!==true)throw ports.placeholderError("native_reload_not_proven");
      const read=await ports.withPlanCommandRole("readback",()=>ports.runExtendScriptBody(ports.montageCaptureService.nativeSourceScopeScript(scope)));
      if(read?.ok===false || !read?.result)throw ports.placeholderError("native_reload_independent_read_failed");
      const filesAfter=ports.montageCaptureService.readContributingFiles([ports.montageCaptureService.sourceFileReference(scope,read.result)],records[0].plan.montagePipeline.readBudgets,fileLedger);
      if(require("./montage-contract").stableJson(filesBefore)!==require("./montage-contract").stableJson(filesAfter))throw ports.placeholderError("native_reload_material_changed_during_operation");
      const final=await ports.currentPlaceholderState();if(final.state.revision!==state.revision || !ports.placeholderSourceRecovery.pathsEqual(projectFile,final.projectFile))throw ports.placeholderError("native_reload_policy_changed");
      const commands=ports.planCommandContext.getStore().item.commands || [],matches=commands.filter(c=>c.state==="completed" && c.ok===true && c.result?.nativeReload?.readerId===readerId && c.result.nativeReload.operationExecuted===true);
      if(matches.length!==1)throw ports.placeholderError("native_reload_command_unproven");
      const file=filesAfter[0],epoch={schema:"ae-agent-native-source-load-epoch.v1",epochId:ports.crypto.randomUUID(),sourceItemId,projectKey:state.projectKey,file:file.file,sha256:file.sha256,byteLength:file.byteLength,
        fileIdentity:file.identity,metadata:file.nativeMetadata.metadata,commandId:matches[0].id,...execution,nativeOperation:"reload",scope,
        nativeBracket:native.result,independentNativeRead:read.result,independentReadBackVerified:true,ownedUsedInComplete:true,observedAt:new Date().toISOString(),
        policyTransition:{originalRevision:records[0].plan.montagePipeline.captureRequirements.project.revision,originalPolicyHash:records[0].plan.montagePipeline.captureRequirements.policy.policyHash,
          manifestHash:records[0].plan.montagePipeline.captureRequirements.manifest.sha256,materialsHash:records[0].plan.montagePipeline.captureRequirements.materials.sha256,
          toRevision:state.revision+1,policyHashAfter:require("./montage-plan-guard").policyHash({...state,revision:state.revision+1}),semanticSha256:ports.montageCaptureService.semanticPolicyHash(state),reviewOwnersHash:ports.reviewEvidence.sha256(state.reviewArtifacts || {})}};
      ports.projectStateController.registerSourceLoadEpoch(projectFile,epoch,state.revision);
      return ports.toolResult({ok:true,sourceLoadEpoch:epoch,requiresFreshMontageCompilation:true,nextAction:"recompile_and_apply_at_new_project_revision",completeRootRenderState:false,artisticAccepted:false});
    }catch(error){return ports.toolResult({ok:false,code:error.code || error.message,error:error.message,replayAllowed:false,recovery:"Read native source/load evidence and the command lifecycle; never repeat an unknown reload."},true);}
  }
  if(name === "reconcile_plan_run") {
    if(Object.keys(args).some(key=>!["runId","stepIndices","originalRequestId"].includes(key))) throw new Error("reconciliation_client_evidence_forbidden");
    if(args.originalRequestId!==undefined && (!ports.planRunRecords.ID.test(args.originalRequestId) || args.stepIndices!==undefined)) throw new Error("recovery_whole_request_selector_required");
    const runId=ports.optionalString(args,"runId","");
    const record=ports.planRunRecords.readRecord(ports.LOG_DIR,runId);
    if(record.unavailable) return ports.toolResult({schema:"ae-agent-plan-run-reconciliation.v1",runId,status:"unknown",reasonCode:record.reasonCode,steps:[],replayAllowed:false});
    if(record.plan.steps?.length===1 && record.plan.steps[0].tool===ports.ameFixtureGrant.TOOL_NAME && args.originalRequestId!==undefined) {
      try {
        if(runId===ports.nativeFixtureAdmissionRefusal.selector().runId) {
          if(args.originalRequestId!==ports.nativeFixtureAdmissionRefusal.selector().requestId)throw Object.assign(Error("fixture_refusal_fixed_selector_required"),{code:"fixture_refusal_fixed_selector_required"});
          return ports.toolResult({schema:"ae-agent-plan-run-reconciliation.v1",runId,status:"unknown",steps:[],reasonCode:"native_fixture_admission_refusal_fresh_lookup_required",
            nativeFixtureAdmissionRefusalAvailable:true,originalRequestId:args.originalRequestId,historicalOutcome:"unknown",nativeExecutionProven:false,processExitProven:false,nativeEndpointInertProven:false,admissionGuardReleased:false,replayAllowed:false});
        }
        if(runId===ports.nativeFixturePrephaseProof.PROFILE.runId) {
          const saved=ports.nativeFixturePrephaseRecovery.lookupAudited({requestId:args.originalRequestId,runId},{evidenceRoot:ports.LOG_DIR,repoRoot:ports.PROJECT_ROOT});
          return ports.toolResult({schema:"ae-agent-plan-run-reconciliation.v1",runId,status:saved ? "prephase_admission_certified" : "unknown",steps:[],reasonCode:saved ? "native_fixture_prephase_trusted_lookup_required" : "native_fixture_prephase_certificate_required",
            nativeFixturePrephaseRecoveryAvailable:!!saved,originalRequestId:args.originalRequestId,historicalOutcome:"unknown",nativeExecutionProven:false,processExitProven:false,nativeEndpointInertProven:false,admissionGuardReleased:false,replayAllowed:false});
        }
        const saved=ports.nativeFixtureAbandonment.lookupAudited({requestId:args.originalRequestId,runId},{evidenceRoot:ports.LOG_DIR,repoRoot:ports.PROJECT_ROOT});
        return ports.toolResult({schema:"ae-agent-plan-run-reconciliation.v1",runId,status:saved ? "abandoned_reviewed" : "unknown",steps:[],
          reasonCode:saved ? "native_fixture_fresh_trusted_lookup_required" : "native_fixture_abandonment_audit_required",nativeFixtureAbandonmentAvailable:!!saved,
          originalRequestId:args.originalRequestId,historicalOutcome:"unknown",nativeExecutionProven:false,admissionGuardReleased:false,replayAllowed:false});
      } catch(error){return ports.toolResult({schema:"ae-agent-plan-run-reconciliation.v1",runId,status:"incomplete",reasonCode:error.code || error.message,steps:[],admissionGuardReleased:false,replayAllowed:false});}
    }
    if(runId===ports.commonTitleRecovery.RUN_ID && args.originalRequestId!==undefined){
      try{return ports.toolResult(await ports.reconcileCommonTitle(record,args));}
      catch(error){return ports.toolResult({schema:"ae-agent-plan-run-reconciliation.v1",runId,status:"incomplete",reasonCode:error.code || error.message,steps:[],freshReconcileRequired:true,admissionGuardReleased:false,replayAllowed:false});}
    }
    const selected=args.stepIndices;
    if(selected!==undefined && (!Array.isArray(selected) || !selected.length || selected.length>50 || new Set(selected).size!==selected.length || selected.some(index=>!Number.isSafeInteger(index) || index<1 || !record.plan.steps[index-1]))) throw new Error("reconciliation_step_indices_invalid");
    const helper=require("./plan-run-reconciliation");
    let generatedRecoveryPreflight=null,ordinaryReconciliationOnly=null;
    if(args.originalRequestId!==undefined){
      const recovery=require("./generated-export-recovery");
      try{
        const original=await ports.panelControlService.readRecoveryLinkage(args.originalRequestId);
        recovery.validateLinkage(record,original.local,original.remote);
        const stateResponse=await ports.panelControlService.state(),panel=stateResponse.state,status=ports.getBridgeStatus();
        if(!stateResponse.ok || !panel || status.pendingCommands || status.inflightCommands.length || status.activeEditSession || status.projectLifecycle?.blocked || status.projectLifecycle?.pending)throw new Error("generated_recovery_transport_not_idle");
        if(panel.recoveryTransport?.connecting)throw new Error("generated_recovery_transport_connecting");
        const currentBinding={panelInstanceId:panel.panelInstanceId,panelLifecycleEpoch:panel.panelLifecycleEpoch,panelGeneration:panel.panelGeneration},connectionId=panel.bridgeConnection?.panelConnectionId;
        if(!connectionId || !currentBinding.panelInstanceId || !Number.isSafeInteger(currentBinding.panelLifecycleEpoch))throw new Error("generated_recovery_current_panel_identity_missing");
        let exports=null;
        try{exports=recovery.inspectRecord(record);}catch(error){
          const requests=helper.reconciliationReadRequests(record),mutating=record.plan.steps.map((step,index)=>({step,index:index+1})).filter(row=>require("./semantic-verification").isMutatingStep(row.step));
          if(panel.connected && panel.running && !panel.recoveryTransport && !String(currentBinding.panelGeneration).startsWith("recovery-") && !ports.generatedRecoveryByPanel.has(connectionId) && mutating.length && mutating.every(row=>requests.some(request=>request.stepIndex===row.index)))ordinaryReconciliationOnly=error.code || error.message;
          else throw error;
        }
        if(exports){
        if(!panel.connected || !panel.running){
          if(ports.autonomousSession.publicStatus().desiredEnabled!==false)throw new Error("generated_recovery_requires_autonomy_off");
          if(ports.generatedRecoveryScopes.size>=32)throw new Error("generated_recovery_scope_capacity");
          const scopeId=ports.crypto.randomUUID(),p=record.run.provenance,createdAt=Date.now();
          const scope={scopeId,state:"created",runId,originalRequestId:args.originalRequestId,panelConnectionId:connectionId,currentBinding,
            nextBinding:{panelInstanceId:currentBinding.panelInstanceId,panelLifecycleEpoch:currentBinding.panelLifecycleEpoch+1,panelGeneration:"recovery-"+scopeId},createdAt,expiresAt:createdAt+ports.GENERATED_RECOVERY_SCOPE_TTL_MS};
          ports.generatedRecoveryScopes.set(scopeId,scope);ports.generatedRecoveryByPanel.set(connectionId,scopeId);
          return ports.toolResult({schema:"ae-agent-plan-run-reconciliation.v1",runId,status:"transport_prerequisite",reasonCode:"validated_generated_export_reconnect_required",steps:[],freshReconcileRequired:true,admissionGuardReleased:false,replayAllowed:false,
            transportPrerequisite:{schema:"ae-agent-generated-export-transport-prerequisite.v1",scopeId,runId,originalRequestId:args.originalRequestId,actionId:p.actionId,proposalRevision:p.proposalRevision,payloadHash:p.payloadHash,planSha256:p.planSha256,runEnvelopeSha256:recovery.hash(record),projectId:p.projectId,
              currentBinding,nextBinding:scope.nextBinding,panelConnectionId:connectionId,createdAt:new Date(createdAt).toISOString(),expiresAt:new Date(scope.expiresAt).toISOString(),freshReconcileRequired:true,admissionGuardReleased:false,replayAllowed:false}});
        }
        let scope=null;
        if(String(currentBinding.panelGeneration).startsWith("recovery-") || ports.generatedRecoveryByPanel.has(connectionId)){
          scope=ports.generatedRecoveryScopes.get(panel.recoveryTransport?.scopeId);
          if(!scope || ports.generatedRecoveryByPanel.get(connectionId)!==scope.scopeId || scope.state!=="ready" || Date.now()>=scope.expiresAt || scope.runId!==runId || scope.originalRequestId!==args.originalRequestId || ports.reviewEvidence.sha256(scope.nextBinding)!==ports.reviewEvidence.sha256(currentBinding) || ports.lastPanelInfo?.panelConnectionId!==connectionId || ports.lastPanelInfo?.panelGeneration!==scope.nextBinding.panelGeneration)throw new Error("generated_recovery_transport_scope_invalid");
        }
        generatedRecoveryPreflight={original,exports,scope};
        }
      }catch(error){return ports.toolResult({schema:"ae-agent-plan-run-reconciliation.v1",runId,status:"incomplete",reasonCode:error.code || error.message,steps:[],freshReconcileRequired:true,admissionGuardReleased:false,replayAllowed:false});}
    }
    const freshReadSteps=[];
    const deadline=Date.now()+60000;
    const read=async(request)=>{
      try { const scope=generatedRecoveryPreflight?.scope,operation=()=>ports.callToolLogged("plan-reconciliation-read",request.tool,request.args);
        const value=scope ? await ports.generatedRecoveryReadContext.run({scopeId:scope.scopeId,runId,originalRequestId:args.originalRequestId,tool:request.tool},operation) : await operation();
        freshReadSteps.push({index:freshReadSteps.length+1,readId:ports.crypto.randomUUID(),tool:request.tool,args:request.args,status:value.isError?"failed":"completed",result:ports.firstToolPayload(value)}); }
      catch(error){freshReadSteps.push({index:freshReadSteps.length+1,tool:request.tool,args:request.args,status:"failed",error:error.message,errorCode:error.code});}
    };
    await read({tool:"get_project_info",args:{}});
    const actual=ports.firstToolPayload(ports.toolResult(freshReadSteps[0].result));
    const expected=require("./proposal-state").normalizeProject(record.project && record.project.file);
    if(expected && require("./proposal-state").normalizeProject(actual && (actual.file || actual.project && actual.project.file))===expected) {
      const readKeys=new Set();
      for(const request of helper.reconciliationReadRequests(record)) {
        if(Date.now()>deadline) break;
        if(!["get_comp_details","get_layer_details","get_property_value","get_effect_details","get_montage_source_load_evidence",ports.nativeRenderVariant.INSPECT].includes(request.tool)) throw new Error("reconciliation_read_not_allowlisted");
        const key=ports.reviewEvidence.sha256({tool:request.tool,args:request.args});
        if((!selected || selected.includes(request.stepIndex)) && !readKeys.has(key)) {readKeys.add(key);await read(request);}
      }
      await read({tool:"get_project_info",args:{}});
    }
    const commandStates=(record.run.steps || []).flatMap(step=>(step.commands || []).map(row=>{
      const current=ports.inflightCommands.get(row.id),retained=ports.completedResults.get(row.id);
      return current ? {...row,...ports.compactAeCommand(current)} : retained ? {...row,...retained.command,ok:retained.ok,result:retained.result,error:retained.error} : row;
    }));
    const result=helper.reconcilePlanRun({record,freshReadSteps,commandStates,project:{file:actual && actual.file}});
    if(selected) result.steps=result.steps.filter(step=>selected.includes(step.index));
    result.runId=runId;
    if(args.originalRequestId!==undefined && generatedRecoveryPreflight){
      const recovery=require("./generated-export-recovery");
      try{
        const known=new Set(commandStates.map(c=>c.id));
        for(const retained of ports.completedResults.values())if(retained.command?.executionId===runId && !known.has(retained.id))commandStates.push({...retained.command,id:retained.id,ok:retained.ok,result:retained.result});
        const original=generatedRecoveryPreflight.original;
        const stored=recovery.readReceipt(ports.LOG_DIR,runId,args.originalRequestId);
        if(stored){
          recovery.validateStoredBinding(stored,record,original.local);
          recovery.validateLinkage(record,original.local,original.remote);
          recovery.validateFresh(record,recovery.inspectRecord(record),freshReadSteps,commandStates,ports.getBridgeStatus());
          result.generatedExportRecovery=stored;
        }else{
          const adjudicated=await recovery.adjudicate({record,local:original.local,remote:original.remote,freshReadSteps,commandStates,busy:ports.getBridgeStatus(),exportRoot:ports.GENERATED_EXPORT_DIR,runtimeIdentity:ports.RUNTIME_IDENTITY});
          result.generatedExportRecovery=recovery.writeReceipt(ports.LOG_DIR,adjudicated);
        }
      }catch(error){result.generatedExportRecoveryFailure={code:error.code || error.message,replayAllowed:false};}
    }
    if(ordinaryReconciliationOnly)result.generatedExportRecoveryFailure={code:ordinaryReconciliationOnly,scope:"current_postconditions_only",replayAllowed:false};
    if(record.plan && record.plan.montagePipeline) {
      result.montageReadBack = await ports.buildPostRunMontageReadBack(record, actual);
    }
    return ports.toolResult(result);
  }
  if(name===ports.projectSave.TOOL_NAME){
    try{const saveReceipt=await ports.projectSaveExecutor.execute(name,args,{authorization:executionContext && executionContext.projectSaveAuthorization});
      return ports.toolResult({ok:true,saveReceipt});
    }catch(error){return ports.toolResult({ok:false,error:error.message,code:error.code||"PROJECT_SAVE_FAILED"},true);}
  }
  if (name === ports.ameTransport.TOOL_NAME) {
    try { const result = await ports.ameTransport.execute(args, ports.runExtendScriptBody); return ports.toolResult(result, !result.ok); }
    catch (error) { return ports.toolResult({ ok: false, code: error.code || "ame_transport_failed", error: error.message, automaticRetryAllowed: false }, true); }
  }
  if (name === ports.amePresets.listAmePresetsTool.name) {
    try { return ports.toolResult(ports.amePresets.listAmePresets(args)); }
    catch (error) { return ports.toolResult({ ok: false, code: "ame_preset_catalog_failed", error: error.message, source: "file_catalog", nativeAvailability: "not_verified" }, true); }
  }
  if (name === ports.ameRunning.TOOL_NAME) {
    try { const result = await ports.ameRunningExecutor.execute(args, executionContext && executionContext.ameRunningAuthorization); return ports.toolResult(result, !result.ok); }
    catch (error) { return ports.toolResult({ ok: false, code: error.code || "ame_running_failed", error: error.message, automaticRetryAllowed: false, adapterReady: false }, true); }
  }
  if (name === ports.ameFixtureGrant.TOOL_NAME) {
    try { const result = await ports.ameFixtureExecutor.execute(args, executionContext && executionContext.ameFixtureAuthorization); return ports.toolResult(result, !result.ok); }
    catch (error) { return ports.toolResult({ ok: false, code: error.code || "fixture_runner_failed", nativeReason: error.nativeReason || null,
      error: error.message, nativeAttempts:error.nativeAttempts || [],automaticRetryAllowed: false, productionBackend: false }, true); }
    finally { ports.ameFixtureCheckpoints.clear(); }
  }
  if (name === ports.ameFixtureRunner.INSPECT) {
    try { return ports.toolResult(await ports.ameFixtureExecutor.inspectResult(args)); }
    catch (error) { return ports.toolResult({ ok: false, code: error.code || "fixture_result_inspection_failed", automaticRetryAllowed: false }, true); }
  }
  if(name===ports.ameFixtureRunner.INSPECT_ATTEMPT) {
    try{return ports.toolResult(await ports.ameFixtureExecutor.inspectAttempt(args));}
    catch(error){return ports.toolResult({ok:false,code:error.code || "fixture_attempt_inspection_failed",replayAllowed:false},true);}
  }
  if(name===ports.titleExport.TOOL){
    const result=await ports.titleExportExecutor.execute(args,executionContext && executionContext.titleExportAuthorization);
    if(result.ok)result.authorization={runId:ports.currentProposalState.current.executionId,proposalId:ports.currentProposalState.current.actionId};
    return ports.toolResult(result,!result.ok);
  }
  if(name===ports.ameJobSource.INSPECT)return ports.toolResult(await ports.ameJobSourceExecutor.inspect(args));
  if(name===ports.ameSavedSourceAdmission.TOOL){
    try{return ports.toolResult(await ports.savedAmeSourceAdmission.inspect(args));}
    catch(error){return ports.toolResult({ok:false,code:error.code||error.message||"ame_saved_source_inspection_failed",executionAuthority:false,automaticRetryAllowed:false},true);}
  }
  if(name===ports.ameSourceProbe.TOOL){
    try{const result=await ports.ameSourceProbeExecutor.execute(args);return ports.toolResult(result,!result.ok);}
    catch(error){return ports.toolResult({ok:false,code:error.code||error.message||"ame_source_probe_failed",executionAuthority:false,queueMutationPerformed:false,automaticRetryAllowed:false},true);}
  }
  if(name===ports.ameJobSource.RECONCILE){
    if(executionContext?.panelControlAuthority!==ports.PANEL_CONTROL_AUTHORITY)throw Error("official_mcp_adapter_required");
    const result=await ports.ameJobSourceExecutor.reconcile(args);return ports.toolResult(result,!result.ok);
  }
  if(name===ports.ameJobSource.TOOL){
    const result=await ports.ameJobSourceExecutor.execute(args,executionContext&&executionContext.ameJobSourceAuthorization);
    if(result.ok)result.authorization={runId:ports.currentProposalState.current.executionId,proposalId:ports.currentProposalState.current.actionId};return ports.toolResult(result,!result.ok);
  }
  if(name===ports.titleVerification.TOOL){
    const result=await ports.titleVerificationExecutor.execute(args,executionContext&&executionContext.titleVerificationAuthorization);
    if(result.ok)result.authorization={runId:ports.currentProposalState.current.executionId,proposalId:ports.currentProposalState.current.actionId};
    return ports.toolResult(result,!result.ok);
  }
  if(name===ports.titleVerification.LOOKUP){
    if(executionContext?.panelControlAuthority!==ports.PANEL_CONTROL_AUTHORITY)throw Error("official_mcp_adapter_required");
    const result=await ports.titleVerificationExecutor.reconcile(args);return ports.toolResult(result,!result.ok);
  }
  if(name===ports.titleExport.RECOVER){
    if(executionContext?.panelControlAuthority!==ports.PANEL_CONTROL_AUTHORITY)throw Error("official_mcp_adapter_required");
    const result=await ports.titleExportRecovery.recover(args);return ports.toolResult(result,!result.ok);
  }
  if (ports.ameTitleJobs.tools.some(tool => tool.name === name)) {
    const result = await ports.ameTitleExecutor.execute(name, args, executionContext && executionContext.ameTitleAuthorization);
    const pendingContext=ports.planCommandContext.getStore(),dispatchPending=ports.amePending.isPendingDispatch(result,args,pendingContext?.run?.id,pendingContext?.item?.commands);
    if (ports.ameTitleMutationNames.has(name) && (result.ok||dispatchPending)) result.authorization = {
      runId: ports.currentProposalState.current.executionId, proposalId: ports.currentProposalState.current.actionId
    };
    return ports.toolResult(result, !result.ok&&!dispatchPending&&!ports.amePending.isPendingStatus(result,args));
  }
  if (ports.ameQueueControl.tools.some(tool => tool.name === name)) {
    const result = await ports.ameQueueExecutor.execute(name, args, executionContext && executionContext.ameQueueAuthorization);
    return ports.toolResult(result, !result.ok);
  }
  if (ports.ameEnqueueSequence.tools.some(tool => tool.name === name)) {
    try { const result = await ports.ameEnqueueSequencer.execute(name, args); return ports.toolResult(result, !result.ok); }
    catch (error) { return ports.toolResult({ ok: false, code: error.code || "ame_enqueue_sequence_failed", executionAuthority: false, automaticRetryAllowed: false }, true); }
  }
  if(name===ports.nativeRenderVariant.INSPECT || name===ports.nativeRenderVariant.RENDER){
    try { const result=name===ports.nativeRenderVariant.INSPECT ? await ports.nativeRenderExecutor.inspect(args) : await ports.nativeRenderExecutor.execute(args,executionContext && executionContext.nativeRenderAuthorization);
      return ports.toolResult(result,result.ok!==true);
    }catch(error){return ports.toolResult({ok:false,code:error.code || "native_render_failed",error:error.message},true);}
  }
  if (name === "build_slideshow_plan") {
    try { const result=ports.slideshowPlanBuilder.buildSlideshowPlan(args.manifest, args.articles, args.inventory);
      ports.recordEvent("slideshow_plan_built", {builderProvenance:result.builderProvenance,stageCount:result.stageCount,validationOk:result.ok});
      return ports.toolResult(result); }
    catch (error) { return ports.toolResult({ ok: false, error: error.message, code: error.code || "SLIDESHOW_PLAN_ERROR" }, true); }
  }
  if (ports.slideshowTools.TOOL_NAMES.includes(name)) {
    try {
      const result = await ports.slideshowTools.execute(name, args, ports.runExtendScriptBody);
      if (result && result.ok === false && !result.code) result.code = "slideshow_audit_failed";
      return ports.toolResult(result, !result || result.ok === false);
    }
    catch (error) { return ports.toolResult({ ok: false, error: error.message, code: error.code || "SLIDESHOW_TOOL_ERROR" }, true); }
  }
  const resolveCompScript = `
      function __codexProjectIndexForItem(target) {
        for (var __i = 1; __i <= app.project.numItems; __i++) {
          if (app.project.item(__i) === target) return __i;
        }
        return null;
      }

      function __codexMatchesItemType(item, type) {
        if (!type) return true;
        if (type === "comp") return item instanceof CompItem;
        if (type === "footage") return item instanceof FootageItem;
        if (type === "folder") return item instanceof FolderItem;
        return false;
      }

      function __codexFolderPath(item) {
        var names = [];
        var project = app.project;
        var folder = null;
        try { folder = item.parentFolder; } catch (__parentFolderError) {}
        var guard = 0;
        while (folder && project && folder !== project.rootFolder && guard < 50) {
          names.unshift(folder.name);
          try { folder = folder.parentFolder; } catch (__folderParentError) { folder = null; }
          guard++;
        }
        return names.join("/");
      }

      function __codexFindProjectItems(query, type, exactName, caseSensitive, limit, itemIds) {
        var matches = [];
        var needle = query || "";
        var normalizedNeedle = caseSensitive ? needle : needle.toLowerCase();
        var max = limit || 25;

        for (var __i = 1; __i <= app.project.numItems; __i++) {
          var item = app.project.item(__i);
          if (itemIds && itemIds.length) {
            var idMatched = false;
            for (var __id = 0; __id < itemIds.length; __id++) {
              if (item.id === itemIds[__id]) { idMatched = true; break; }
            }
            if (!idMatched) continue;
          }
          if (!__codexMatchesItemType(item, type)) continue;

          var itemName = item.name || "";
          var haystack = caseSensitive ? itemName : itemName.toLowerCase();
          var matched = exactName ? haystack === normalizedNeedle : haystack.indexOf(normalizedNeedle) !== -1;
          if (!matched) continue;

          var ref = __codexItemReference(item);
          try { ref.folderPath = __codexFolderPath(item); } catch (__folderPathError) {}
          matches.push(ref);
          if (matches.length >= max) break;
        }

        return matches;
      }

      function __codexResolveProjectItem(index, name, type) {
        if (index !== null && index !== undefined) {
          var indexedItem = app.project.item(index);
          if (!indexedItem) throw new Error("Project item not found.");
          if (!__codexMatchesItemType(indexedItem, type)) {
            throw new Error("Project item does not match requested type.");
          }
          return indexedItem;
        }

        if (!name) {
          throw new Error("Provide itemIndex or itemName.");
        }

        var matches = __codexFindProjectItems(name, type, true, true, 25);
        if (matches.length === 0) {
          matches = __codexFindProjectItems(name, type, true, false, 25);
        }
        if (matches.length === 0) {
          throw new Error("No project item matched name: " + name);
        }
        if (matches.length > 1) {
          var names = [];
          for (var __m = 0; __m < matches.length; __m++) {
            names.push("#" + matches[__m].itemIndex + " " + matches[__m].name);
          }
          throw new Error("Project item name is ambiguous: " + name + " (" + names.join(", ") + ")");
        }
        return app.project.item(matches[0].itemIndex);
      }

      function __codexResolveProjectFolder(index, name, allowRoot) {
        if (index !== null && index !== undefined) {
          var indexedFolder = app.project.item(index);
          if (!(indexedFolder instanceof FolderItem)) {
            throw new Error("Project item is not a folder.");
          }
          return indexedFolder;
        }
        if (name) {
          return __codexResolveProjectItem(null, name, "folder");
        }
        if (allowRoot) {
          return app.project.rootFolder;
        }
        throw new Error("Provide folderItemIndex or folderName.");
      }

      function __codexFolderFullPath(folder) {
        if (!folder || folder === app.project.rootFolder) return "";
        var parentPath = __codexFolderPath(folder);
        return parentPath ? parentPath + "/" + folder.name : folder.name;
      }

      function __codexFindChildFolder(parentFolder, folderName) {
        for (var __f = 1; __f <= app.project.numItems; __f++) {
          var item = app.project.item(__f);
          if (!(item instanceof FolderItem)) continue;
          if (item.name !== folderName) continue;
          try {
            if (item.parentFolder === parentFolder) return item;
          } catch (__childFolderParentError) {}
        }
        return null;
      }

      function __codexIsItemInsideFolder(item, folder) {
        if (!item || !folder) return false;
        if (folder === app.project.rootFolder) return item !== app.project.rootFolder;
        var parent = null;
        try { parent = item.parentFolder; } catch (__insideParentError) {}
        var guard = 0;
        while (parent && guard < 50) {
          if (parent === folder) return true;
          if (parent === app.project.rootFolder) return false;
          try { parent = parent.parentFolder; } catch (__insideNextParentError) { parent = null; }
          guard++;
        }
        return false;
      }

      function __codexResolveComp(index, name, itemId) {
        var item = null;
        if (itemId !== null && itemId !== undefined) {
          var found=null, count=0;
          for(var __id=1;__id<=app.project.numItems;__id++) {
            item=app.project.item(__id);
            if(item instanceof CompItem && item.id===itemId){found=item;count++;}
          }
          if(count!==1) throw new Error("stable_comp_identity_missing_or_ambiguous");
          return found;
        }
        if (index !== null && index !== undefined) {
          item = app.project.item(index);
        } else if (name) {
          item = __codexResolveProjectItem(null, name, "comp");
        } else {
          item = app.project.activeItem;
        }
        if (!(item instanceof CompItem)) {
          throw new Error(index || name ? "Project item is not a composition." : "Active item is not a composition.");
        }
        return item;
      }

      function __codexResolveLayer(comp, index, layerId) {
        if(layerId===null || layerId===undefined) return comp.layer(index);
        var found=null,count=0;
        for(var __id=1;__id<=comp.numLayers;__id++) {
          var item=comp.layer(__id);if(item.id===layerId){found=item;count++;}
        }
        if(count!==1) throw new Error("stable_layer_identity_missing_or_ambiguous");
        return found;
      }

      function __codexItemType(item) {
        if (item instanceof CompItem) return "comp";
        if (item instanceof FootageItem) return "footage";
        if (item instanceof FolderItem) return "folder";
        return item && item.typeName ? item.typeName : "unknown";
      }

      function __codexItemReference(item) {
        if (!item) return null;
        var info = {
          itemIndex: __codexProjectIndexForItem(item),
          name: item.name || "",
          type: __codexItemType(item),
          typeName: item.typeName || null
        };
        try { info.itemId = item.id; } catch (__itemIdError) {}
        try { info.label = item.label; } catch (__itemLabelError) {}
        try { info.comment = item.comment || ""; } catch (__itemCommentError) {}
        try { info.folderPath = __codexFolderPath(item); } catch (__itemFolderPathError) {}
        if (item instanceof CompItem || item instanceof FootageItem) {
          try { info.duration = item.duration; } catch (__itemDurationError) {}
          try { info.frameRate = item.frameRate; } catch (__itemFrameRateError) {}
        }
        if (item instanceof FootageItem) {
          try {
            if (item.footageMissing === true || item.footageMissing === false) info.footageMissing = item.footageMissing;
          } catch (__missingError) {}
          try {
            var curFile = item.file || (item.mainSource && item.mainSource.file ? item.mainSource.file : null);
            info.file = curFile && curFile.fsName ? curFile.fsName : null;
          } catch (__fileError) {}
          try { info.width = item.width; } catch (__widthError) {}
          try { info.height = item.height; } catch (__heightError) {}
          try { info.pixelAspect = item.pixelAspect; } catch (__pixelAspectError) {}
          try { info.hasVideo = item.hasVideo; } catch (__hasVideoError) {}
          try { info.hasAudio = item.hasAudio; } catch (__hasAudioError) {}
        }
        return info;
      }

      function __codexMarkerInfo(markerProp, keyIndex) {
        var info = {
          keyIndex: keyIndex,
          time: null,
          comment: "",
          duration: 0
        };
        try { info.time = markerProp.keyTime(keyIndex); } catch (__markerTimeError) {}
        try {
          var markerValue = markerProp.keyValue(keyIndex);
          try { info.comment = markerValue.comment || ""; } catch (__markerCommentError) {}
          try { info.duration = markerValue.duration || 0; } catch (__markerDurationError) {}
          try { if (markerValue.chapter) info.chapter = markerValue.chapter; } catch (__markerChapterError) {}
          try { if (markerValue.url) info.url = markerValue.url; } catch (__markerUrlError) {}
          try { if (markerValue.frameTarget) info.frameTarget = markerValue.frameTarget; } catch (__markerFrameTargetError) {}
          try { if (markerValue.cuePointName) info.cuePointName = markerValue.cuePointName; } catch (__markerCuePointError) {}
          try { if (markerValue.eventCuePoint !== undefined) info.eventCuePoint = markerValue.eventCuePoint; } catch (__markerEventCueError) {}
          try { if (markerValue.protectedRegion !== undefined) info.protectedRegion = markerValue.protectedRegion; } catch (__markerProtectedError) {}
        } catch (__markerValueError) {}
        return info;
      }

      function __codexLayerMarkers(layer, limit) {
        var summary = {
          count: 0,
          returned: 0,
          truncated: false,
          items: []
        };
        try {
          var markerProp = layer.property("ADBE Marker");
          if (!markerProp) return summary;
          summary.count = markerProp.numKeys;
          var effectiveLimit = limit === undefined || limit === null ? 50 : limit;
          var max = Math.max(0, Math.min(summary.count, effectiveLimit));
          for (var __mk = 1; __mk <= max; __mk++) {
            summary.items.push(__codexMarkerInfo(markerProp, __mk));
          }
          summary.returned = summary.items.length;
          summary.truncated = summary.count > summary.returned;
        } catch (__layerMarkersError) {}
        return summary;
      }

      function __codexCompMarkers(comp, limit) {
        var summary = {
          count: 0,
          returned: 0,
          truncated: false,
          orderedBy: "comp.markerProperty.keyTime",
          items: []
        };
        try {
          var markerProp = comp.markerProperty;
          if (!markerProp) return summary;
          summary.count = markerProp.numKeys;
          var effectiveLimit = limit === undefined || limit === null ? 50 : limit;
          var max = Math.max(0, Math.min(summary.count, effectiveLimit));
          for (var __cmk = 1; __cmk <= max; __cmk++) {
            summary.items.push(__codexMarkerInfo(markerProp, __cmk));
          }
          summary.returned = summary.items.length;
          summary.truncated = summary.count > summary.returned;
        } catch (__compMarkersError) {}
        return summary;
      }

      function __codexBlendingModeName(value) {
        try { if (value === BlendingMode.NORMAL) return "normal"; } catch (__blendNormalNameError) {}
        try { if (value === BlendingMode.DIFFERENCE) return "difference"; } catch (__blendDifferenceNameError) {}
        return String(value);
      }

      function __codexBlendingModeValue(name) {
        var normalized = String(name || "").toLowerCase();
        if (normalized === "normal") return BlendingMode.NORMAL;
        if (normalized === "difference") return BlendingMode.DIFFERENCE;
        throw new Error("Unsupported blendingMode '" + name + "'. Allowed values: normal, difference.");
      }

      function __codexTrackMatteTypeName(value) {
        try { if (value === TrackMatteType.NO_TRACK_MATTE) return "none"; } catch (__trackMatteNoneNameError) {}
        try { if (value === TrackMatteType.ALPHA) return "alpha"; } catch (__trackMatteAlphaNameError) {}
        try { if (value === TrackMatteType.ALPHA_INVERTED) return "alpha_inverted"; } catch (__trackMatteAlphaInvertedNameError) {}
        try { if (value === TrackMatteType.LUMA) return "luma"; } catch (__trackMatteLumaNameError) {}
        try { if (value === TrackMatteType.LUMA_INVERTED) return "luma_inverted"; } catch (__trackMatteLumaInvertedNameError) {}
        return String(value);
      }

      function __codexTrackMatteTypeValue(name) {
        var normalized = String(name || "").toLowerCase();
        if (normalized === "alpha") return TrackMatteType.ALPHA;
        if (normalized === "alpha_inverted") return TrackMatteType.ALPHA_INVERTED;
        if (normalized === "luma") return TrackMatteType.LUMA;
        if (normalized === "luma_inverted") return TrackMatteType.LUMA_INVERTED;
        throw new Error("Unsupported trackMatteType '" + name + "'. Allowed values: alpha, alpha_inverted, luma, luma_inverted.");
      }

      function __codexTextJustificationName(value) {
        try { if (value === ParagraphJustification.LEFT_JUSTIFY) return "left"; } catch (__leftJustificationNameError) {}
        try { if (value === ParagraphJustification.CENTER_JUSTIFY) return "center"; } catch (__centerJustificationNameError) {}
        try { if (value === ParagraphJustification.RIGHT_JUSTIFY) return "right"; } catch (__rightJustificationNameError) {}
        try { return String(value); } catch (__justificationStringError) {}
        return null;
      }

      function __codexTextJustificationValue(name) {
        var normalized = String(name || "").toLowerCase();
        if (normalized === "left") return ParagraphJustification.LEFT_JUSTIFY;
        if (normalized === "center") return ParagraphJustification.CENTER_JUSTIFY;
        if (normalized === "right") return ParagraphJustification.RIGHT_JUSTIFY;
        throw new Error("Unsupported justification '" + name + "'. Allowed values: left, center, right.");
      }

      function __codexLayerInfo(layer) {
        var isTextLayer = false;
        var isShapeLayer = false;
        try { isTextLayer = layer instanceof TextLayer; } catch (__textLayerClassError) {}
        if (!isTextLayer) {
          try { isTextLayer = !!layer.property("ADBE Text Properties"); } catch (__textLayerFallbackError) {}
        }
        try { isShapeLayer = layer instanceof ShapeLayer; } catch (__shapeLayerClassError) {}
        if (!isShapeLayer) {
          try { isShapeLayer = layer.matchName === "ADBE Vector Layer" || !!layer.property("ADBE Root Vectors Group"); } catch (__shapeLayerFallbackError) {}
        }
        var info = {
          index: layer.index,
          id: layer.id,
          name: layer.name,
          matchName: layer.matchName,
          textLayer: isTextLayer,
          shapeLayer: isShapeLayer,
          layerKind: isTextLayer ? "text" : (isShapeLayer ? "shape" : null),
          enabled: layer.enabled,
          locked: layer.locked,
          shy: layer.shy,
          solo: layer.solo,
          startTime: layer.startTime,
          inPoint: layer.inPoint,
          outPoint: layer.outPoint,
          guideLayer: false,
          adjustmentLayer: false,
          threeDLayer: false,
          collapseTransformation: false,
          audioEnabled: false,
          stretch: null,
          timeRemapEnabled: null
        };

        try { info.label = layer.label; } catch (__labelError) {}
        try { info.comment = layer.comment || ""; } catch (__commentError) {}
        try { info.hasVideo = !!layer.hasVideo; } catch (__hasVideoError) {}
        try { info.hasAudio = !!layer.hasAudio; } catch (__hasAudioError) {}
        try { info.nullLayer = !!layer.nullLayer; } catch (__nullLayerError) {}
        try { info.guideLayer = !!layer.guideLayer; } catch (__guideLayerError) {}
        try { info.adjustmentLayer = !!layer.adjustmentLayer; } catch (__adjustmentLayerError) {}
        try { info.threeDLayer = !!layer.threeDLayer; } catch (__threeDError) {}
        try { info.collapseTransformation = !!layer.collapseTransformation; } catch (__collapseError) {}
        try { info.motionBlur = !!layer.motionBlur; } catch (__motionBlurError) {}
        try { info.audioEnabled = !!layer.audioEnabled; } catch (__audioEnabledError) {}
        // Native TextLayer inheritance tests can fail; observe timing without inferring defaults.
        try {
          var nativeStretch = layer.stretch;
          if (typeof nativeStretch === "number" && isFinite(nativeStretch)) info.stretch = nativeStretch;
        } catch (__stretchError) {}
        try {
          var nativeTimeRemapEnabled = layer.timeRemapEnabled;
          if (typeof nativeTimeRemapEnabled === "boolean") info.timeRemapEnabled = nativeTimeRemapEnabled;
        } catch (__timeRemapEnabledError) {}
        try {
          info.blendingMode = layer.blendingMode;
          info.blendingModeName = __codexBlendingModeName(layer.blendingMode);
        } catch (__blendError) {}
        try { info.hasTrackMatte = !!layer.hasTrackMatte; } catch (__hasTrackMatteError) {}
        try { info.isTrackMatte = !!layer.isTrackMatte; } catch (__isTrackMatteError) {}
        try {
          info.trackMatteType = layer.trackMatteType;
          info.trackMatteTypeName = __codexTrackMatteTypeName(layer.trackMatteType);
        } catch (__trackMatteTypeError) {}
        try { info.trackMatteLayer = layer.trackMatteLayer ? __codexLayerInfo(layer.trackMatteLayer) : null; } catch (__trackMatteLayerError) {}
        try { info.markerCount = __codexLayerMarkers(layer, 0).count; } catch (__markerCountError) {}
        try { info.parent = layer.parent ? __codexLayerInfo(layer.parent) : null; } catch (__parentError) {}
        try { info.source = layer.source ? __codexItemReference(layer.source) : null; } catch (__sourceError) {}
        try {
          var textProp = layer.property("ADBE Text Properties").property("ADBE Text Document");
          info.text = __codexValuePreview(textProp);
        } catch (__layerTextPreviewError) {}

        return info;
      }

      function __codexResolveLayers(comp, requestedLayerIndices) {
        var layers = [];
        if (requestedLayerIndices && requestedLayerIndices.length) {
          for (var __r = 0; __r < requestedLayerIndices.length; __r++) {
            var requestedLayer = comp.layer(requestedLayerIndices[__r]);
            if (!requestedLayer) throw new Error("Layer not found at index " + requestedLayerIndices[__r] + ".");
            layers.push(requestedLayer);
          }
        } else {
          for (var __s = 0; __s < comp.selectedLayers.length; __s++) {
            layers.push(comp.selectedLayers[__s]);
          }
        }
        if (!layers.length) throw new Error("No target layers. Select layers or pass layerIndices.");
        return layers;
      }

      function __codexLayerTiming(layer) {
        return {
          index: layer.index,
          name: layer.name,
          startTime: layer.startTime,
          inPoint: layer.inPoint,
          outPoint: layer.outPoint,
          duration: layer.outPoint - layer.inPoint
        };
      }

      function __codexRenameValue(currentName, mode, index, total, exactName, prefix, suffix, findText, replaceText, caseSensitive, allowEmptyName) {
        var nextName = currentName || "";
        if (mode === "exact") {
          if (!exactName && !(allowEmptyName && exactName === "")) throw new Error("name is required for exact rename mode.");
          nextName = exactName;
          if (total > 1) {
            if (nextName.indexOf("{index}") !== -1 || nextName.indexOf("{n}") !== -1) {
              nextName = nextName.replace(/\{index\}/g, String(index)).replace(/\{n\}/g, String(index));
            } else {
              nextName = nextName + " " + index;
            }
          }
        } else if (mode === "prefix") {
          if (!prefix) throw new Error("prefix is required for prefix rename mode.");
          nextName = prefix + nextName;
        } else if (mode === "suffix") {
          if (!suffix) throw new Error("suffix is required for suffix rename mode.");
          nextName = nextName + suffix;
        } else if (mode === "findReplace") {
          if (!findText) throw new Error("find is required for findReplace rename mode.");
          var flags = caseSensitive ? "g" : "gi";
          var specials = "\\\\^$*+?.()|{}[]";
          var escaped = "";
          for (var __c = 0; __c < findText.length; __c++) {
            var ch = findText.charAt(__c);
            escaped += specials.indexOf(ch) >= 0 ? "\\\\" + ch : ch;
          }
          nextName = nextName.replace(new RegExp(escaped, flags), replaceText || "");
        } else {
          throw new Error("mode must be one of: exact, prefix, suffix, findReplace.");
        }
        return nextName;
      }

      function __codexLayerSourceSize(layer, comp) {
        var width = null;
        var height = null;
        try {
          if (layer.source) {
            width = layer.source.width || null;
            height = layer.source.height || null;
          }
        } catch (__sourceSizeError) {}
        if ((!width || !height) && layer.sourceRectAtTime) {
          try {
            var rect = layer.sourceRectAtTime(comp.time, false);
            width = rect.width || width;
            height = rect.height || height;
          } catch (__rectSizeError) {}
        }
        if (!width || !height) throw new Error("Could not determine layer source size for " + layer.name + ".");
        return { width: width, height: height };
      }

      function __codexRenderQueueItemIndex(item) {
        var rq = app.project.renderQueue;
        for (var __rq = 1; __rq <= rq.numItems; __rq++) {
          if (rq.item(__rq) === item) return __rq;
        }
        return null;
      }

      function __codexRenderQueueItemInfo(item) {
        var info = {
          index: __codexRenderQueueItemIndex(item),
          status: item.status,
          comp: item.comp ? __codexItemReference(item.comp) : null,
          timeSpanStart: item.timeSpanStart,
          timeSpanDuration: item.timeSpanDuration,
          outputModules: []
        };
        try {
          for (var __om = 1; __om <= item.numOutputModules; __om++) {
            var outputModule = item.outputModule(__om);
            info.outputModules.push({
              index: __om,
              file: outputModule.file ? outputModule.file.fsName : null
            });
          }
        } catch (__outputModuleInfoError) {}
        return info;
      }

      function __codexPointList(points, limit) {
        var list = [];
        if (!points) return list;
        for (var __pl = 0; __pl < points.length && __pl < limit; __pl++) {
          var point = points[__pl];
          list.push([point[0], point[1]]);
        }
        return list;
      }

      function __codexShapeGeometryData(value, limit) {
        try {
          if (!value || value.vertices === undefined || value.inTangents === undefined || value.outTangents === undefined) return null;
          var maxPoints = limit || 80;
          return {
            kind: "Shape",
            closed: value.closed === true,
            vertexCount: value.vertices ? value.vertices.length : 0,
            vertices: __codexPointList(value.vertices, maxPoints),
            inTangents: __codexPointList(value.inTangents, maxPoints),
            outTangents: __codexPointList(value.outTangents, maxPoints),
            truncated: value.vertices && value.vertices.length > maxPoints
          };
        } catch (__shapeGeometryError) {
          return null;
        }
      }

      function __codexValuePreview(prop) {
        var value = prop.value;
        if (value === null || value === undefined) return { kind: "null", value: null };
        if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
          return { kind: typeof value, value: value };
        }
        var shapeGeometry = __codexShapeGeometryData(value, 80);
        if (shapeGeometry) return shapeGeometry;
        if (value instanceof Array) {
          var items = [];
          for (var __v = 0; __v < value.length && __v < 20; __v++) {
            items.push(value[__v]);
          }
          return { kind: "array", length: value.length, value: items, truncated: value.length > 20 };
        }
        try {
          if (value.text !== undefined) {
            return {
              kind: "TextDocument",
              text: value.text,
              font: value.font || null,
              fontSize: value.fontSize || null,
              fillColor: value.fillColor || null,
              applyFill: value.applyFill || false,
              justification: __codexTextJustificationName(value.justification)
            };
          }
        } catch (__textDocumentError) {}
        try {
          return { kind: "object", preview: String(value) };
        } catch (__stringError) {
          return { kind: "object", preview: "[object]" };
        }
      }

      function __codexValueData(value) {
        if (value === null || value === undefined) return null;
        if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") return value;
        var shapeGeometry = __codexShapeGeometryData(value, 80);
        if (shapeGeometry) return shapeGeometry;
        if (value instanceof Array) {
          var items = [];
          for (var __vd = 0; __vd < value.length && __vd < 20; __vd++) items.push(value[__vd]);
          return items;
        }
        try {
          if (value.text !== undefined) return { text: value.text };
        } catch (__valueDataTextError) {}
        try {
          return String(value);
        } catch (__valueDataStringError) {
          return "[object]";
        }
      }

      function __codexInterpolationName(value) {
        try {
          if (value === KeyframeInterpolationType.LINEAR) return "linear";
          if (value === KeyframeInterpolationType.BEZIER) return "bezier";
          if (value === KeyframeInterpolationType.HOLD) return "hold";
        } catch (__interpNameError) {}
        return String(value);
      }

      function __codexInterpolationDiagnostics() {
        function describe(value) {
          var result = { type: typeof value, numeric: null, text: null };
          try { result.numeric = Number(value); } catch (__enumNumberError) {}
          try { result.text = String(value); } catch (__enumStringError) {}
          return result;
        }
        var result = { schema: "ae-agent-keyframe-interpolation-diagnostic.v1" };
        try {
          result.constants = { linear: describe(KeyframeInterpolationType.LINEAR),
            bezier: describe(KeyframeInterpolationType.BEZIER), hold: describe(KeyframeInterpolationType.HOLD) };
          var probeName = "hold";
          var conditionalType = probeName === "hold" ? KeyframeInterpolationType.HOLD : probeName === "linear" ? KeyframeInterpolationType.LINEAR : KeyframeInterpolationType.BEZIER;
          result.holdConditionalProbe = { request: describe(probeName), selected: describe(conditionalType) };
          var explicitProbeType;
          if (probeName === "hold") {
            explicitProbeType = KeyframeInterpolationType.HOLD;
          } else if (probeName === "linear") {
            explicitProbeType = KeyframeInterpolationType.LINEAR;
          } else {
            explicitProbeType = KeyframeInterpolationType.BEZIER;
          }
          result.holdExplicitBranchProbe = { request: describe(probeName), selected: describe(explicitProbeType) };
          result.holdDirect = describe(KeyframeInterpolationType.HOLD);
          result.holdEqualsLinear = KeyframeInterpolationType.HOLD === KeyframeInterpolationType.LINEAR;
          result.holdEqualsBezier = KeyframeInterpolationType.HOLD === KeyframeInterpolationType.BEZIER;
        } catch (__enumDiagnosticError) { result.error = String(__enumDiagnosticError); }
        return result;
      }

      function __codexArrayCopy(value) {
        if (!(value instanceof Array)) return null;
        var copy = [];
        for (var __ac = 0; __ac < value.length; __ac++) copy.push(value[__ac]);
        return copy;
      }

      function __codexKeyframeInfo(prop, keyIndex) {
        var info = {
          index: keyIndex,
          time: null,
          value: null
        };
        try { info.time = prop.keyTime(keyIndex); } catch (__keyTimeError) {}
        try { info.value = __codexValueData(prop.keyValue(keyIndex)); } catch (__keyValueError) {}
        try { info.inInterpolation = __codexInterpolationName(prop.keyInInterpolationType(keyIndex)); } catch (__keyInInterpError) {}
        try { info.outInterpolation = __codexInterpolationName(prop.keyOutInterpolationType(keyIndex)); } catch (__keyOutInterpError) {}
        try { info.inInterpolationValue = Number(prop.keyInInterpolationType(keyIndex)); } catch (__keyInInterpValueError) {}
        try { info.outInterpolationValue = Number(prop.keyOutInterpolationType(keyIndex)); } catch (__keyOutInterpValueError) {}
        function temporalEaseData(values) {
          var result = [];
          for (var __te = 0; __te < values.length; __te++) result.push({ speed: values[__te].speed, influence: values[__te].influence });
          return result;
        }
        try { info.inTemporalEase = temporalEaseData(prop.keyInTemporalEase(keyIndex)); } catch (__keyInEaseError) {}
        try { info.outTemporalEase = temporalEaseData(prop.keyOutTemporalEase(keyIndex)); } catch (__keyOutEaseError) {}
        try { info.inSpatialTangent = __codexArrayCopy(prop.keyInSpatialTangent(keyIndex)); } catch (__keyInSpatialError) {}
        try { info.outSpatialTangent = __codexArrayCopy(prop.keyOutSpatialTangent(keyIndex)); } catch (__keyOutSpatialError) {}
        return info;
      }

      function __codexPropertyPath(prop) {
        var path = [];
        var current = prop;
        var guard = 0;
        while (current && !(current instanceof Layer) && guard < 50) {
          path.unshift({
            name: current.name || "",
            matchName: current.matchName || null,
            propertyIndex: current.propertyIndex || null
          });
          try {
            current = current.parentProperty;
          } catch (__parentPropertyError) {
            current = null;
          }
          guard++;
        }
        return path;
      }

      function __codexResolveChildProperty(parent, segment) {
        if (parent === null || parent === undefined) return null;
        var descriptor = typeof segment === "number" ? {propertyIndex: segment} : segment;
        if (!descriptor || (typeof descriptor !== "string" && typeof descriptor !== "object") || descriptor instanceof Array) throw new Error("Invalid property identity.");
        var byString = typeof descriptor === "string";
        var expectedName = byString ? undefined : descriptor.name;
        var expectedMatchName = byString ? undefined : descriptor.matchName;
        var hasIndex = !byString && (descriptor.propertyIndex !== undefined || descriptor.index !== undefined);
        var expectedIndex = descriptor.propertyIndex !== undefined ? descriptor.propertyIndex : descriptor.index;
        if (expectedName !== undefined && (typeof expectedName !== "string" || !expectedName)) throw new Error("Invalid property name.");
        if (expectedMatchName !== undefined && (typeof expectedMatchName !== "string" || !expectedMatchName)) throw new Error("Invalid property matchName.");
        if (hasIndex) {
          if (typeof expectedIndex !== "number" || !isFinite(expectedIndex) || expectedIndex < 1 || Math.floor(expectedIndex) !== expectedIndex || expectedIndex > parent.numProperties) throw new Error("Property index must be an in-range integer.");
          if (descriptor.propertyIndex !== undefined && descriptor.index !== undefined && descriptor.propertyIndex !== descriptor.index) throw new Error("Conflicting property indexes.");
          var indexed = parent.property(expectedIndex);
          if (!indexed || (expectedName && indexed.name !== expectedName) || (expectedMatchName && indexed.matchName !== expectedMatchName)) throw new Error("Property identity mismatch.");
          return indexed;
        }
        var found = null;
        if (!byString && !expectedName && !expectedMatchName) throw new Error("Property identity is empty.");
        for (var __p = 1; __p <= parent.numProperties; __p++) {
          var candidate = parent.property(__p);
          if (!candidate) continue;
          if (byString ? (candidate.name !== descriptor && candidate.matchName !== descriptor) : ((expectedName && candidate.name !== expectedName) || (expectedMatchName && candidate.matchName !== expectedMatchName))) continue;
          if (found) throw new Error("Property selection is ambiguous.");
          found = candidate;
        }
        if (!found) throw new Error("Property identity not found.");
        return found;
      }

      function __codexResolveProperty(root, propertyPath) {
        if (!(propertyPath instanceof Array) || propertyPath.length === 0) {
          throw new Error("propertyPath must be a non-empty array.");
        }

        var current = root;
        for (var __pathIndex = 0; __pathIndex < propertyPath.length; __pathIndex++) {
          current = __codexResolveChildProperty(current, propertyPath[__pathIndex]);
          if (!current) {
            throw new Error("Property path segment not found at index " + __pathIndex + ".");
          }
        }
        return current;
      }

      function __codexApplyTextDocumentPatch(prop, patch) {
        var doc = prop.value;
        if (patch.text !== undefined) doc.text = String(patch.text);
        if (patch.font !== undefined) doc.font = String(patch.font);
        if (patch.fontSize !== undefined) doc.fontSize = Number(patch.fontSize);
        if (patch.fillColor !== undefined) {
          doc.applyFill = true;
          doc.fillColor = patch.fillColor;
        }
        if (patch.applyFill !== undefined) doc.applyFill = !!patch.applyFill;
        if (patch.strokeColor !== undefined) {
          doc.applyStroke = true;
          doc.strokeColor = patch.strokeColor;
        }
        if (patch.applyStroke !== undefined) doc.applyStroke = !!patch.applyStroke;
        if (patch.strokeWidth !== undefined) doc.strokeWidth = Number(patch.strokeWidth);
        if (patch.tracking !== undefined) doc.tracking = Number(patch.tracking);
        if (patch.leading !== undefined) doc.leading = Number(patch.leading);
        if (patch.justification !== undefined) doc.justification = __codexTextJustificationValue(patch.justification);
        return doc;
      }

      function __codexPreparePropertyValue(prop, value) {
        try {
          var currentValue = prop.value;
          if (currentValue && currentValue.text !== undefined && value && typeof value === "object" && !(value instanceof Array)) {
            return __codexApplyTextDocumentPatch(prop, value);
          }
        } catch (__textPatchProbeError) {}
        return value;
      }

      function __codexResolveEffect(layer, effectIndex, effectName, effectMatchName) {
        var effectGroup = layer.property("ADBE Effect Parade");
        if (!effectGroup) throw new Error("Layer has no effect parade.");

        if (effectIndex !== null && effectIndex !== undefined) {
          return __codexResolveChildProperty(effectGroup, {propertyIndex: effectIndex, name: effectName || undefined, matchName: effectMatchName || undefined});
        }

        if (!effectName && !effectMatchName) {
          throw new Error("Provide effectIndex, effectName, or effectMatchName.");
        }

        var matches = [];
        for (var __e = 1; __e <= effectGroup.numProperties; __e++) {
          var effect = effectGroup.property(__e);
          if (!effect) continue;
          if (effectMatchName && effect.matchName !== effectMatchName) continue;
          if (effectName && effect.name !== effectName) continue;
          matches.push(effect);
        }

        if (matches.length === 0) {
          throw new Error("No effect matched the requested name or matchName.");
        }
        if (matches.length > 1) {
          var names = [];
          for (var __m = 0; __m < matches.length; __m++) {
            names.push("#" + matches[__m].propertyIndex + " " + matches[__m].name + " (" + matches[__m].matchName + ")");
          }
          throw new Error("Effect selection is ambiguous: " + names.join(", "));
        }
        return matches[0];
      }

      function __codexEffectProperties(effect, layer, includeValues, includeExpressions) {
        var properties = [];
        var shouldIncludeExpressions = includeExpressions !== false;
        try {
          for (var __ep = 1; __ep <= effect.numProperties; __ep++) {
            var prop = effect.property(__ep);
            if (prop) properties.push(__codexPropertyInfo(prop, layer, includeValues, shouldIncludeExpressions));
          }
        } catch (__effectPropertiesError) {}
        return properties;
      }

      function __codexPropertyTree(prop, depth, state, includeValues, includeExpressions) {
        if (!prop || state.count >= state.max) return null;
        state.count++;
        var info = __codexPropertyInfo(prop, null, includeValues, includeExpressions);
        var children = [];
        if (depth > 0) {
          try {
            for (var __pt = 1; __pt <= prop.numProperties && state.count < state.max; __pt++) {
              var child = __codexPropertyTree(prop.property(__pt), depth - 1, state, includeValues, includeExpressions);
              if (child) children.push(child);
            }
          } catch (__propertyTreeChildrenError) {}
        }
        if (children.length) info.children = children;
        return info;
      }

      function __codexResolveEffectProperty(effect, propertyPath, propertyIndex, propertyName, propertyMatchName) {
        if (propertyPath instanceof Array && propertyPath.length > 0) {
          return __codexResolveProperty(effect, propertyPath);
        }

        if (propertyIndex !== null && propertyIndex !== undefined) {
          return __codexResolveChildProperty(effect, {propertyIndex: propertyIndex, name: propertyName || undefined, matchName: propertyMatchName || undefined});
        }

        if (!propertyName && !propertyMatchName) {
          throw new Error("Provide propertyPath, propertyIndex, propertyName, or propertyMatchName.");
        }

        var matches = [];
        for (var __p = 1; __p <= effect.numProperties; __p++) {
          var prop = effect.property(__p);
          if (!prop) continue;
          if (propertyMatchName && prop.matchName !== propertyMatchName) continue;
          if (propertyName && prop.name !== propertyName) continue;
          matches.push(prop);
        }

        if (matches.length === 0) {
          throw new Error("No effect property matched the requested name or matchName.");
        }
        if (matches.length > 1) {
          var names = [];
          for (var __pm = 0; __pm < matches.length; __pm++) {
            names.push("#" + matches[__pm].propertyIndex + " " + matches[__pm].name + " (" + matches[__pm].matchName + ")");
          }
          throw new Error("Effect property selection is ambiguous: " + names.join(", "));
        }
        return matches[0];
      }

      function __codexPropertyInfo(prop, layer, includeValue, includeExpression) {
        var info = {
          name: prop.name,
          matchName: prop.matchName || null,
          propertyIndex: prop.propertyIndex || null,
          propertyDepth: prop.propertyDepth || null,
          propertyType: prop.propertyType || null,
          propertyPath: __codexPropertyPath(prop),
          canSetExpression: !!prop.canSetExpression,
          expressionEnabled: false,
          expressionError: "",
          isTimeVarying: false,
          numKeys: 0,
          selectedKeys: [],
          layer: layer ? __codexLayerInfo(layer) : null
        };

        try { info.propertyValueType = prop.propertyValueType; } catch (__valueTypeError) {}
        try { info.isTimeVarying = !!prop.isTimeVarying; } catch (__timeVaryingError) {}
        try { info.numKeys = prop.numKeys || 0; } catch (__numKeysError) {}
        try { info.expressionEnabled = !!prop.expressionEnabled; } catch (__expressionEnabledError) {}
        try { info.expressionError = prop.expressionError || ""; } catch (__expressionErrorError) {}
        try {
          if (prop.enabled !== undefined) info.enabled = !!prop.enabled;
        } catch (__enabledError) {}
        try {
          if (includeExpression && prop.canSetExpression) info.expression = prop.expression || "";
        } catch (__expressionError) {}
        try {
          if (includeValue && prop.propertyValueType !== undefined) info.value = __codexValuePreview(prop);
        } catch (__valueError) {
          info.valueError = String(__valueError);
        }
        try {
          if (prop.selectedKeys) {
            for (var __k = 0; __k < prop.selectedKeys.length; __k++) {
              info.selectedKeys.push(prop.selectedKeys[__k]);
            }
          }
        } catch (__selectedKeysError) {}
        try {
          if (includeValue && info.numKeys > 0) {
            info.interpolationDiagnostics = __codexInterpolationDiagnostics();
            info.keyframes = [];
            var maxKeyframes = Math.min(info.numKeys, 80);
            for (var __ki = 1; __ki <= maxKeyframes; __ki++) {
              info.keyframes.push(__codexKeyframeInfo(prop, __ki));
            }
            info.keyframesTruncated = info.numKeys > maxKeyframes;
          }
        } catch (__keyframeInfoError) {}

        return info;
      }
  `;

  if (name === "get_bridge_status") {
    return ports.toolResult({...ports.getBridgeStatus(), autonomyContractVersion: ports.AUTONOMY_CONTRACT_VERSION});
  }

  if (name === "wait_for_bridge_state") {
    try {
      const result = await ports.waitForBridgeState(() => ({panelConnected: Date.now() - ports.lastPanelSeenAt < 15000,
        pendingCommands: ports.countQueuedCommands(Date.now()), inflightCommands: Array.from(ports.inflightCommands.keys()),
        retainedResults: ports.completedResults.size}), args || {});
      return ports.toolResult(result, Boolean(result && !result.ok));
    } catch (error) {
      return ports.toolResult({ ok: false, error: error.message, code: error.code || "invalid_wait" }, true);
    }
  }

  if (name === "wait_for_plan_state") {
    try {
      const result = await ports.waitForPlanState(() => ports.currentProposalState.snapshot(), args || {});
      return ports.toolResult(result, Boolean(result && !result.ok));
    } catch (error) {
      return ports.toolResult({ ok: false, error: error.message, code: error.code || "invalid_wait" }, true);
    }
  }

  if (name === "get_current_ai_agent_plan") {
    const current = ports.currentProposalState.snapshot();
    if (current) current.validation = ports.validateAgentPlanWithRepair(current.plan, current.proposal.requestId, {}, {repairPlan: false}).validation;
    return ports.toolResult({ok: true, current});
  }

  if(name==="get_plan_builder_contract"){
    try{return ports.toolResult({ok:true,contract:require("./core-plan-catalog").getPlanBuilderContract(args.solutionId)});}
    catch(error){return ports.toolResult({ok:false,code:error.code||"builder_contract_failed",error:error.message},true);}
  }

  

  

  if (name === "build_solution_plan") {
    try {
      require("./core-plan-catalog").assertSupportedBuilder(args.solutionId);
      if (args.solutionId === "guarded-project-lifecycle") {
        const built = await ports.lifecycle.build(args.inputs);
        const prepared = ports.validateAgentPlanWithRepair(built.plan, null, {}, {repairPlan:false});
        return ports.toolResult({...built, ok:prepared.validation.ok, validation:prepared.validation}, !prepared.validation.ok);
      }
      if (args.solutionId === "published-save-as-state-only-recovery") {
        const built = await ports.lifecycle.buildRecovery(args.inputs);
        const prepared = ports.validateAgentPlanWithRepair(built.plan, null, {}, {repairPlan:false});
        return ports.toolResult({...built, ok:prepared.validation.ok, validation:prepared.validation}, !prepared.validation.ok);
      }
      if (args.solutionId === "comp-visual-review-plan") {
        return await callTool("build_comp_visual_review_plan", args.inputs, executionContext);
      }
      if (args.solutionId === "text-visual-review-plan") {
        const textReviewPlan = require("./text-visual-review-plan");
        const result = await textReviewPlan.observeTextVisualReviewPlan(args.inputs, async (tool, readArgs) => {
          const read = await ports.callToolLogged("text-review-plan-read", tool, readArgs);
          if (read && read.isError) throw Object.assign(new Error("Text review observation failed."), {code:"text_review_read_failed"});
          return ports.firstToolPayload(read);
        });
        const prepared = ports.validateAgentPlanWithRepair(result.plan, null, {}, {repairPlan:false});
        return ports.toolResult({...result,ok:prepared.validation.ok,validation:prepared.validation},!prepared.validation.ok);
      }
      if (args.solutionId === "montage-pipeline-plan") {
        const result = await ports.montagePipelineService.buildMontagePipelinePlan(args.inputs, ports.daemonMontageDeps);
        return ports.toolResult(result, !result.ok);
      }
      const result = require("./solution-plan-builder").buildSolutionPlan(args.solutionId, args.inputs);
      if (!result.ok) return ports.toolResult(result, true);
      const prepared = ports.validateAgentPlanWithRepair(result.plan, null, {}, { repairPlan: false });
      ports.recordEvent("solution_plan_built", { solutionId: args.solutionId, validationOk: prepared.validation.ok,
        stepCount: result.plan.steps.length, providerCalled: false });
      return ports.toolResult({ ...result, ok: prepared.validation.ok, validation: prepared.validation,
        next: "Review inputs and current evidence, then use propose_ai_agent_plan and run_ai_agent_plan dry-run before any confirmed execution." }, !prepared.validation.ok);
    } catch (error) { return ports.toolResult({ ok: false, error: error.message }, true); }
  }

  if (name === "build_comp_visual_review_plan") {
    try {
      ports.validateCompVisualReviewInput(args);
      const info1Read = await ports.callToolLogged("comp-review-plan-read", "get_project_info", {});
      if (info1Read && info1Read.isError) {
        return ports.toolResult({ ok: false, code: "project_read_failed", error: "Failed to read project info." }, true);
      }
      const info1 = ports.firstToolPayload(info1Read);
      if (!info1 || typeof info1.file !== "string" || !ports.path.isAbsolute(info1.file) || ports.path.extname(info1.file).toLowerCase() !== ".aep") {
        return ports.toolResult({ ok: false, code: "no_active_named_project", error: "A saved named .aep project is required for visual review." }, true);
      }
      const isConfirmedRevision = (info) =>
        Boolean(info && info.supported && info.supported.revision === true && Number.isSafeInteger(info.revision) && info.revision >= 0);
      if (!isConfirmedRevision(info1)) {
        return ports.toolResult({ ok: false, code: "project_revision_unavailable", error: "Project revision is unavailable or unsupported." }, true);
      }
      const observedComps = [];
      for (const target of args.targets) {
        const compRead = await ports.callToolLogged("comp-review-plan-read", "get_comp_details", { compItemId: target.compItemId, includeLayers: false });
        if (compRead && compRead.isError) {
          return ports.toolResult({ ok: false, code: "comp_read_failed", error: `Failed to read details for comp item ID ${target.compItemId}.` }, true);
        }
        const compResult = ports.firstToolPayload(compRead);
        const observedId = compResult && (compResult.itemId ?? compResult.id);
        const observedIndex = compResult && (compResult.itemIndex ?? compResult.index);
        if (!compResult || observedId !== target.compItemId || !Number.isSafeInteger(observedIndex) || observedIndex <= 0) {
          return ports.toolResult({ ok: false, code: "requested_comp_not_observed", error: `Comp item ID ${target.compItemId} was not found in project.` }, true);
        }
        observedComps.push({
          itemId: observedId,
          itemIndex: observedIndex,
          name: compResult.name,
          width: compResult.width,
          height: compResult.height,
          frameRate: compResult.frameRate,
          duration: compResult.duration
        });
      }
      const info2Read = await ports.callToolLogged("comp-review-plan-read", "get_project_info", {});
      if (info2Read && info2Read.isError) {
        return ports.toolResult({ ok: false, code: "project_read_failed", error: "Failed to re-read project info." }, true);
      }
      const info2 = ports.firstToolPayload(info2Read);
      if (!info2 || info2.file !== info1.file || info2.numItems !== info1.numItems) {
        return ports.toolResult({ ok: false, code: "stale_project", error: "Project changed during comp observation." }, true);
      }
      if (!isConfirmedRevision(info2)) {
        return ports.toolResult({ ok: false, code: "project_revision_unavailable", error: "Project revision is unavailable or unsupported on re-read." }, true);
      }
      if (info2.revision !== info1.revision) {
        return ports.toolResult({ ok: false, code: "stale_project", error: "Project revision changed during comp observation." }, true);
      }
      const serverObservedContext = {
        projectFile: info2.file,
        observedAt: new Date().toISOString(),
        comps: observedComps
      };
      const result = ports.buildCompVisualReviewPlan(args, serverObservedContext);
      const prepared = ports.validateAgentPlanWithRepair(result.plan, null, {}, { repairPlan: false });
      return ports.toolResult({ ...result, ok: prepared.validation.ok, validation: prepared.validation }, !prepared.validation.ok);
    } catch (error) {
      return ports.toolResult({ ok: false, code: error.code || "invalid_plan_input", error: error.message }, true);
    }
  }

  if (name === "get_comp_visual_review_manifest") {
    try {
      if (!args || typeof args !== "object" || Array.isArray(args)) {
        return ports.toolResult({ ok: false, code: "invalid_arguments", error: "get_comp_visual_review_manifest requires an object with a runId property." }, true);
      }
      const keys = Object.keys(args);
      if (keys.length !== 1 || keys[0] !== "runId" || typeof args.runId !== "string") {
        return ports.toolResult({ ok: false, code: "invalid_arguments", error: "get_comp_visual_review_manifest accepts only a strict runId string property without extra arguments." }, true);
      }
      const runId = args.runId;
      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!UUID_REGEX.test(runId)) {
        return ports.toolResult({ ok: false, code: "invalid_run_id", error: "runId must be a valid UUID." }, true);
      }
      const record = ports.planRunRecords.readRecord(ports.LOG_DIR, runId, { throwOnError: true });
      const manifest = await ports.compVisualReviewManifest.createManifest(record, {
        runId,
        exportRoot: ports.GENERATED_EXPORT_DIR,
        logDir: ports.LOG_DIR
      });
      return ports.toolResult(manifest, !manifest.ok);
    } catch (error) {
      return ports.toolResult({ ok: false, code: error.code || "manifest_failed", error: error.message }, true);
    }
  }

  if (name === "get_project_lifecycle_state") {
    if (args && (typeof args !== "object" || Array.isArray(args) || Object.keys(args).length > 0)) {
      return ports.toolResult({ok:false,code:"invalid_lifecycle_state_input",error:"get_project_lifecycle_state accepts no arguments."}, true);
    }
    try {
      const native = await ports.lifecycle.readState();
      if (!native || native.ok === false) {
        return ports.toolResult({ ok: false, code: "lifecycle_read_failed", error: (native && native.error) || "Failed to read project lifecycle state" }, true);
      }
      const normalized = ports.projectLifecycleState.normalizeProjectLifecycleState(native.result);
      return ports.toolResult({...normalized, lifecycle:ports.lifecycle.diagnostics()});
    } catch (error) {
      return ports.toolResult({ ok: false, code: error.code || "lifecycle_read_failed", error: error.message }, true);
    }
  }

  if (name === "get_placeholder_protection") {
    try { return ports.toolResult(await ports.getPlaceholderProtection()); }
    catch (error) { return ports.toolResult({ ok: false, code: error.code || error.message, error: error.message }, true); }
  }
  if (name === "get_placeholder_usage" || name === "check_placeholder_assignments") {
    try {
      ports.projectStateMemory.loadProjectStateStore();
      const inventory = await ports.readPlaceholderInventory();
      const state = inventory.projectFile ? ports.projectStateMemory.readProjectState(inventory.projectFile) : { groupMappings: [] };
      if (name === "get_placeholder_usage") {
        if (!Array.isArray(args.roots) || !args.roots.length || args.roots.length > 32) throw ports.placeholderError("explicit_usage_roots_required");
        const usage = ports.freshPlaceholderUsage(inventory, args.roots, state);
        return ports.toolResult(usage, !usage.ok);
      }
      const assignments = ports.normalizeFreshAssignments(args.assignments, inventory);
      const selectedTargets = assignments.map(value => value.target);
      const roots = ports.placeholderRootsForTargets(inventory, selectedTargets);
      const usage = ports.freshPlaceholderUsage(inventory, roots, state);
      const check = ports.placeholderUsage.checkPlaceholderAssignments({ usage, assignments,
        constraints: { distinctGroups: args.constraints && args.constraints.distinctGroups !== false,
          disallowSourceOverlap: args.constraints && args.constraints.disallowSourceOverlap !== false,
          selectedTargets, groupMappings: state.groupMappings } });
      return ports.toolResult({ ...check, authority: "fresh-server-inventory", usageScope: usage.scope }, !check.ok);
    } catch (error) { return ports.toolResult({ ok: false, code: error.code || error.message, error: error.message }, true); }
  }
  if (name === "build_placeholder_plan") {
    let input=(args || {}).input;
    if(input && input.framing) {
      const read=await ports.readPlaceholderGeometry({compItemId:input.targetComp.itemId,layerId:input.targetLayer.id},input.sourceItem.itemId);
      ports.calculateFitTransform(read,{mode:"cover"});
      input={...input,framing:{...input.framing,geometry:read.geometry}};
    }
    const result = ports.placeholderPlanBuilder.buildPlaceholderPlan(input);
    if (!result.ok) return ports.toolResult(result, true);
    const prepared = ports.validateAgentPlanWithRepair(result.plan, null, {}, { repairPlan: false });
    if (!prepared.validation.ok) return ports.toolResult({ ...result, ok: false, validation: prepared.validation }, true);
    try {
      const protection = await ports.guardPlaceholderPlan(result.plan);
      return ports.toolResult({ ...result, validation: prepared.validation, protection,
        previewLocal: true, mutatesProject: false, requiresFreshEvidenceReview: true });
    } catch (error) { return ports.toolResult({ ok: false, code: error.code || error.message, details: error.details, plan: null }, true); }
  }
  if (name === "build_montage_pipeline_plan") {
    try {
      const result = await ports.montagePipelineService.buildMontagePipelinePlan(args, ports.daemonMontageDeps);
      return ports.toolResult(result, !result.ok);
    } catch (error) {
      return ports.toolResult({ ok: false, code: error.code || error.message, error: error.message }, true);
    }
  }

  if(name==="propose_placeholder_cover" || name==="verify_placeholder_coverage") {
    try {
      let sourceId=args.sourceItemId;
      if(name==="propose_placeholder_cover" && sourceId===undefined && args.useCurrentSource!==true)throw ports.placeholderError("explicit_planned_source_or_current_choice_required");
      if(name==="propose_placeholder_cover" && (args.timing!==undefined || args.requiredTimes!==undefined))throw ports.placeholderError("client_timing_authority_forbidden");
      const read=await ports.readPlaceholderGeometry(args.target,sourceId===undefined ? null : sourceId);
      const framing=require("./placeholder-framing");
      let usage=null,sourceEvidence=null,timing;
      if(name==="propose_placeholder_cover"){
        const inventory=await ports.readPlaceholderInventory();
        const state=inventory.projectFile ? ports.projectStateMemory.readProjectState(inventory.projectFile) : {groupMappings:[]};
        const roots=ports.placeholderRootsForTargets(inventory,[read.target]);
        usage=ports.freshPlaceholderUsage(inventory,roots,state);
        const source=inventory.sources.find(item=>item.itemId===read.sourceItemId);
        if(source)sourceEvidence={itemId:source.itemId,itemIndex:source.itemIndex,name:source.name,type:source.type,duration:source.duration,frameRate:source.frameRate};
        const comp=inventory.comps.find(c=>c.itemId===read.target.compItemId),layer=comp && comp.layers.find(l=>l.id===read.target.layerId);
        const affine=require("./placeholder-timing");
        if(!layer || !affine.isValidStretch(layer.stretch) || layer.timeRemapEnabled!==false)throw ports.placeholderError("unsupported_target_timing");
        if(layer.stretch!==100) {
          if(source?.type!=="footage" || !Array.isArray(args.sourceRange) || args.sourceRange.length!==2)throw ports.placeholderError("missing_affine_cover_timing_context");
          const localRange=[layer.inPoint,layer.outPoint];
          timing={stretch:layer.stretch,rootRange:localRange,localRange,sourceRange:args.sourceRange,
            targetStartTime:affine.desiredStartTime(layer.inPoint,args.sourceRange[0],layer.stretch),rootFps:comp.frameRate};
        }
      }
      const result=name==="verify_placeholder_coverage" ? framing.verifyPlaceholderCoverage({geometry:read.geometry,transform:read.transform}) : framing.proposePlaceholderCover({...args,timing,target:{...read.target,sourceItemId:read.sourceItemId},geometry:read.geometry,usage});
      if(result.alternatives && result.alternatives.mediaKey){result.alternatives.sourceKey=ports.placeholderReviewService.hash(result.alternatives.mediaKey);delete result.alternatives.mediaKey;result.alternatives.sourceItem=sourceEvidence;}
      return ports.toolResult({...result,target:read.target,sourceItemId:read.sourceItemId,authority:"fresh_stable_id_geometry",artisticAccepted:false});
    }catch(error){return ports.toolResult({ok:false,code:error.code || error.message},true);}
  }
  if(name==="build_placeholder_visual_review_plan" || name==="create_placeholder_review_comps") {
    try {
      const {projectFile,state}=await ports.currentPlaceholderState();
      const inventory=await ports.readPlaceholderInventory();
      if(!ports.placeholderSourceRecovery.pathsEqual(projectFile,inventory.projectFile))throw ports.placeholderError("review_project_changed");
      let canonicalBinding=null,captureSession=null,reviewInput=args;
      if(args.applicationRunId!==undefined || args.applicationRunIds!==undefined){
        if(Object.keys(args).some(k=>!["applicationRunId","applicationRunIds","frameIds",...Object.keys(ports.MUTATION_CHECKPOINT_SCHEMA_PROPERTIES)].includes(k)) || args.targets!==undefined || args.applicationRunId && args.applicationRunIds)throw ports.placeholderError("canonical_capture_client_claims_forbidden");
        const ids=args.applicationRunIds || [args.applicationRunId];
        if(!Array.isArray(ids) || !ids.length || ids.length>4)throw ports.placeholderError("canonical_application_runs_invalid");
        const records=ids.map(id=>ports.planRunRecords.readRecord(ports.LOG_DIR,id,{throwOnError:true}));
        canonicalBinding=ports.montageCaptureService.resolveApplicationRecords(records,name==="build_placeholder_visual_review_plan" ? state : null,args.frameIds);
        if(name==="create_placeholder_review_comps"){
          captureSession=ports.montageCaptureService.createCaptureSession(canonicalBinding,ports.canonicalExportContext(),ports.placeholderPlanContext.getStore()?.plan);
          ports.montageCaptureService.preflightOwnerRegistration({owner:"pending",canonicalBinding,captureSession},state);
        }
        for(const binding of ports.montageCaptureService.applications(canonicalBinding))await ports.montageCaptureService.assertFreshTarget(binding,records.find(r=>r.runId===binding.applicationRunId),ports.canonicalCaptureDependencies());
        if(name==="build_placeholder_visual_review_plan"){
          const steps=[],manifestReads=[];
          for(const frameIds of ports.montageCaptureService.partitionCaptureBinding(canonicalBinding)){
            const packet=ports.montageCaptureService.resolveApplicationRecords(records,state,frameIds),targets=ports.placeholderReviewService.resolveReviewTargets(ports.montageCaptureService.canonicalReviewInput(packet),inventory,{canonicalBinding:packet});
            const previewSpec=ports.placeholderReviewService.createServiceSpecification(targets,state.projectKey),createIndex=steps.length+1;
            steps.push({tool:"create_placeholder_review_comps",args:{applicationRunIds:ids,frameIds}});
            for(let index=0;index<=previewSpec.controls.length;index++)steps.push({tool:"save_comp_frame_png",args:{reviewOwner:`{{steps.${createIndex}.result.owner}}`,reviewItemId:`{{steps.${createIndex}.result.items.${index}.itemId}}`,time:0,resolutionFactor:[1,1],outputFileName:`review-${previewSpec.owner}-${index}.png`}});
            manifestReads.push({tool:"get_placeholder_review_manifest",args:{owner:`{{steps.${createIndex}.result.owner}}`}});
          }
          steps.push(...manifestReads,{tool:"get_project_info",args:{}});
          const plan={summary:"Создать canonical root controls для сохранённых montage units и проверить полный набор кадров",targetProject:{file:projectFile},risk:"high",requiresCheckpoint:true,steps};
          const validation=ports.validateAgentPlanWithRepair(plan,null,{}, {repairPlan:false}).validation;
          return ports.toolResult({ok:validation.ok,plan:validation.ok ? plan : null,validation,packetCount:manifestReads.length,controlCount:canonicalBinding.frames.length,mutatesProject:false,artisticAccepted:false},!validation.ok);
        }
        reviewInput=ports.montageCaptureService.canonicalReviewInput(canonicalBinding);
      }else if(args.frameIds!==undefined)throw ports.placeholderError("canonical_capture_application_run_required");
      const targets=ports.placeholderReviewService.resolveReviewTargets(reviewInput,inventory,{canonicalBinding});
      const spec=ports.placeholderReviewService.createServiceSpecification(targets,state.projectKey);
      if(name==="build_placeholder_visual_review_plan") {
        const steps=[{tool:"create_placeholder_review_comps",args:JSON.parse(JSON.stringify(args))}];
        for(let index=0;index<=spec.controls.length;index++)steps.push({tool:"save_comp_frame_png",args:{reviewOwner:"{{steps.1.result.owner}}",reviewItemId:`{{steps.1.result.items.${index}.itemId}}`,time:0,resolutionFactor:[1,1],outputFileName:`review-${spec.owner}-${index}.png`}});
        steps.push({tool:"get_placeholder_review_manifest",args:{owner:"{{steps.1.result.owner}}"}});
        steps.push({tool:"get_project_info",args:{}});
        const plan={summary:"Создать отдельные контрольные кадры плейсхолдеров и контактный лист",risk:"high",requiresCheckpoint:true,steps};
        const validation=ports.validateAgentPlanWithRepair(plan,null,{}, {repairPlan:false}).validation;
        return ports.toolResult({ok:validation.ok,plan:validation.ok ? plan : null,validation,controlCount:spec.controls.length,mutatesProject:false,artisticAccepted:false},!validation.ok);
      }
      const created=await ports.runExtendScriptBody(ports.placeholderReviewService.createServiceScript(spec,projectFile));
      const payload=created && created.result;
      if(!created || created.ok===false || !payload || payload.ok!==true)return ports.toolResult({ok:false,code:"review_creation_failed",details:payload || created,recovery:"Read reported createdItemIds before any further mutation; creation is never retried automatically."},true);
      const ids=payload.createdItemIds;
      const fresh=await ports.runExtendScriptBody(ports.placeholderReviewService.readServiceScript(ids));
      const receipt=fresh && fresh.result;
      const pathMatch=receipt && ports.placeholderSourceRecovery.pathsEqual(receipt.projectFile,projectFile);
      const verification=receipt && pathMatch ? ports.placeholderReviewService.verifyServiceReceipt(spec,receipt.items,state.projectKey) : null;
      if(!receipt || !pathMatch || !verification || !verification.ok) {
        const failures = verification ? verification.failures.slice(0, 32) : (!receipt ? ["review_receipt_read_failed"] : ["review_receipt_project_mismatch"]);
        return ports.toolResult({
          ok: false,
          code: "review_creation_receipt_mismatch",
          owner: spec.owner,
          createdItemIds: ids,
          failures,
          status: "uncertain",
          uncertain: true,
          recovery: "Items were created in After Effects but receipt verification failed; do not replay creation or delete unregistered comps automatically."
        }, true);
      }
      const execution=ports.evidenceContext.getStore() || {},guard=ports.autonomousCommandContext.getStore() || {};
      const record={schema:spec.schema,owner:spec.owner,projectKey:state.projectKey,spec,receipt,receiptHash:ports.placeholderReviewService.hash(receipt),images:[],createdAt:new Date().toISOString(),
        ...(canonicalBinding ? {canonicalBinding,captureSession} : {}),
        provenance:{runId:execution.runId || null,proposalId:guard.actionId || null,stepIndex:execution.stepIndex || null}};
      try{ports.projectStateController.registerReview(projectFile,record,state.revision);}catch(error){return ports.toolResult({ok:false,code:"review_registration_failed",owner:spec.owner,createdItemIds:ids,error:error.message},true);}
      return ports.toolResult({ok:true,owner:spec.owner,items:receipt.items.map(item=>({itemId:item.itemId,itemIndex:item.itemIndex,name:item.name,outputFileName:`review-${spec.owner}-${item.itemId}.png`})),registered:true,mainCompositionModified:false});
    }catch(error){return ports.toolResult({ok:false,code:error.code || error.message,error:error.message},true);}
  }
  if(name==="get_placeholder_review_manifest" || name==="verify_placeholder_visual_review") {
    try {
      const fresh=await ports.requireFreshReviewRecord(args.owner);
      let canonicalValidation=null;
      if(fresh.record.canonicalBinding)canonicalValidation=await ports.montageCaptureService.verifyCurrentCaptures(fresh.record,fresh.state,ports.canonicalCaptureDependencies());
      const contentHash=await ports.reviewContentFingerprint(fresh.record);
      if(fresh.record.images.some(image=>image.contentHash!==contentHash))throw ports.placeholderError("review_content_changed_after_capture");
      const manifest=ports.placeholderVisualReview.buildManifest(fresh.record,ports.GENERATED_EXPORT_DIR);
      if(canonicalValidation){manifest.canonicalCoverage=canonicalValidation.coverage;manifest.completeRootRenderState=canonicalValidation.completeRootRenderState;}
      if(name==="verify_placeholder_visual_review") {
        const selector = ports.placeholderReviewTools.visualReviewSelector(args);
        if (selector.kind === "codex") {
          return ports.toolResult(ports.placeholderVisualBatches.verifyCodexVisualReviewBatches(manifest, selector.refs));
        }
        const config=JSON.parse(ports.fs.readFileSync(ports.path.join(ports.PROJECT_ROOT,"config","agy-bridge.json"),"utf8"));
        const profile=config.profiles && config.profiles["ae-agent"];
        if(!profile || profile.model!=="gemini-3.8-flash-high" || typeof profile.state_dir!=="string")throw ports.placeholderError("inspection_profile_unconfigured");
        const stateDirectory=ports.path.resolve(ports.PROJECT_ROOT,"config",profile.state_dir);
        const runIds=args.inspectionRunIds || (args.inspectionRunId ? [args.inspectionRunId] : []);
        if(!Array.isArray(runIds) || !runIds.length || runIds.length>8 || new Set(runIds).size!==runIds.length || args.inspectionRunId && args.inspectionRunIds)throw ports.placeholderError("explicit_unique_inspection_runs_required");
        const runs=runIds.map(id=>ports.placeholderVisualReview.readInspectionRun(id,stateDirectory));
        return ports.toolResult(ports.placeholderVisualBatches.verifyVisualReviewBatches(manifest,runs));
      }
      let inspectionMaterial=null,inspectionMaterials=[],inspectionReason=null;
      try{const batches=ports.placeholderVisualBatches.buildInspectionBatches(manifest);inspectionMaterials=batches.batches;inspectionMaterial=batches.batches.length===1 ? batches.batches[0].material : null;}catch(error){inspectionReason=error.code || error.message;}
      return ports.toolResult({ok:true,manifest,manifestSha256:ports.placeholderReviewService.hash(manifest),inspectionMaterial,inspectionMaterials,inspectionReason,artisticAccepted:false});
    }catch(error){return ports.toolResult({ok:false,code:error.code || error.message,error:error.message},true);}
  }

  if (name === "verify_placeholder_read_back") {
    const result = ports.placeholderReadBack.verifyPlaceholderReadBack((args || {}).expected, (args || {}).observed);
    return ports.toolResult(result, !result.ok);
  }

  if (name === "find_missing_footage_candidates") {
    try {
      const result = ports.placeholderSourceRecovery.findMissingFootageCandidates(args || {});
      return ports.toolResult(result);
    } catch (error) {
      return ports.toolResult({ ok: false, error: error.message }, true);
    }
  }

  if (name === "build_source_recovery_plan") {
    const result = ports.placeholderSourceRecovery.buildSourceRecoveryPlan(args || {});
    if (!result.ok) return ports.toolResult(result, true);
    const prepared = ports.validateAgentPlanWithRepair(result.plan, null, {}, { repairPlan: false });
    return ports.toolResult({
      ...result,
      ok: prepared.validation.ok,
      validation: prepared.validation,
      previewLocal: true,
      mutatesProject: true,
      requiresFreshEvidenceReview: true
    }, !prepared.validation.ok);
  }

  if (name === "verify_source_recovery_read_back") {
    const result = ports.placeholderSourceRecovery.verifySourceRecoveryReadBack((args || {}).expected, (args || {}).observed);
    return ports.toolResult(result, !result.ok);
  }

  if (name === "propose_ai_agent_plan") {
    try {
      const result = await ports.createM100AgentPlanProposalFromRequest(args || {});
      const proposal = {...result.proposal, confirmation: {...result.proposal.confirmation}};
      delete proposal.confirmation.confirmationToken;
      return ports.toolResult({ok: true, ...result, proposal,
        next: "Run a dry-run first. MCP can execute this proposal only while the user-enabled CEP Autonomous Codex session is active and the plan is typed and mutating; otherwise use the normal CEP confirmation flow."});
    }
    catch (error) {
      const code = error.code || "m100_action_proposal_create_failed";
      ports.recordAutonomyObstacle({operation: "propose_ai_agent_plan", code, phase: "proposal", failedSteps: 1});
      return ports.toolResult({ok: false, code, errorCode: code, error: error.message, project: error.project || null, validation: error.validation || null}, true);
    }
  }

  if (name === "list_effect_presets") {
    return ports.toolResult(ports.listEffectPresets(args));
  }

  if (name === "get_command_log") {
    const limit = Math.max(1, Math.min(200, Math.floor(ports.optionalNumber(args, "limit", 50))));
    return ports.toolResult({
      logFile: ports.LOG_FILE,
      events: ports.tailJsonl(ports.LOG_FILE, limit)
    });
  }

  

  

  

  

  

  

  

  if (name === "validate_ai_agent_plan") {
    try {
      return ports.toolResult(ports.validateAgentPlanWithRepair((args || {}).plan, (args || {}).requestId || null, null, {
        repairPlan: args && args.repairPlan
      }).validation);
    } catch (error) {
      return ports.toolResult(error.message || String(error), true);
    }
  }

  if (name === "run_ai_agent_plan") {
    try {
      const run = await ports.runValidatedAgentPlan(args || {}, executionContext || null);
      return ports.toolResult(run, !run.ok&&!ports.amePending.isPendingResponse(run));
    } catch (error) {
      const diagnostic = ports.obstacleEvent({operation: name, proposalId: args.actionId, code: error.code || "plan_run_rejected", phase: "preflight"});
      try { ports.fs.appendFileSync(ports.path.join(ports.LOG_DIR, "autonomy-obstacles.jsonl"), JSON.stringify(diagnostic) + "\n", "utf8"); } catch (_logError) {}
      return ports.toolResult({ok: false, code: diagnostic.code, errorCode: diagnostic.code, error: error.message || String(error), project: error.project || null}, true);
    }
  }

  if (name === "get_plan_run_evidence") {
    try {
      const evidence = ports.planRunResponse.getPlanRunEvidence(ports.LOG_DIR, args || {});
      return ports.toolResult(evidence, false);
    } catch (error) {
      const code = error.code || "get_plan_run_evidence_failed";
      return ports.toolResult({ ok: false, code, errorCode: code, error: error.message || String(error) }, true);
    }
  }

  

  if (name === "start_edit_session") {
    return ports.startEditSession(args || {});
  }

  if (name === "get_edit_session_status") {
    return ports.getEditSessionStatus(args || {});
  }

  if (name === "finish_edit_session") {
    return ports.finishEditSession(args || {});
  }

  if (name === "list_edit_sessions") {
    return ports.listEditSessions(args || {});
  }

  if (name === "backup_project_file") {
    let copied;
    try {
      copied = await ports.copySavedProjectFile(ports.optionalString(args, "label", ""), "backup");
    } catch (error) {
      return ports.toolResult(error.message, true);
    }

    const response = {
      sourceFile: copied.sourceFile,
      backupFile: copied.destinationFile,
      label: copied.label,
      bytes: copied.bytes,
      createdAt: copied.createdAt,
      project: copied.project
    };
    ports.recordEvent("project_backup_created", response);
    return ports.toolResult(response);
  }

  if (name === "checkpoint_project") {
    let copied;
    try {
      copied = await ports.copySavedProjectFile(ports.optionalString(args, "label", ""), "checkpoint");
    } catch (error) {
      return ports.toolResult(error.message, true);
    }

    const response = {
      label: copied.label,
      sourceFile: copied.sourceFile,
      checkpointFile: copied.destinationFile,
      bytes: copied.bytes,
      createdAt: copied.createdAt,
      project: copied.project
    };
    ports.recordEvent("project_checkpoint_created", response);
    return ports.toolResult(response);
  }

  if (name === "list_project_checkpoints") {
    return ports.toolResult({
      backupDir: ports.BACKUP_DIR,
      checkpoints: ports.listProjectCheckpoints(args)
    });
  }

  if (name === "get_project_checkpoint_details") {
    let checkpointFile;
    try {
      checkpointFile = ports.resolveCheckpointFile(args.checkpointFile);
    } catch (error) {
      return ports.toolResult(error.message, true);
    }

    return ports.toolResult({
      backupDir: ports.BACKUP_DIR,
      checkpoint: ports.checkpointDetails(checkpointFile)
    });
  }

  if (name === "delete_project_checkpoint") {
    let confirm;
    try {
      confirm = ports.optionalBoolean(args, "confirm", false);
    } catch (error) {
      return ports.toolResult(error.message, true);
    }
    if (!confirm) return ports.toolResult("confirm must be true to delete a project checkpoint.", true);

    let checkpointFile;
    try {
      checkpointFile = ports.resolveCheckpointFile(args.checkpointFile);
    } catch (error) {
      return ports.toolResult(error.message, true);
    }

    const checkpoint = ports.checkpointDetails(checkpointFile);
    ports.fs.unlinkSync(checkpointFile);
    const response = {
      deleted: true,
      checkpoint
    };
    ports.recordEvent("project_checkpoint_deleted", response);
    return ports.toolResult(response);
  }

  if (name === "restore_project_checkpoint") {
    let confirm;
    try {
      confirm = ports.optionalBoolean(args, "confirm", false);
    } catch (error) {
      return ports.toolResult(error.message, true);
    }
    if (!confirm) return ports.toolResult("confirm must be true to prepare checkpoint restore instructions.", true);

    let checkpointFile;
    try {
      checkpointFile = ports.resolveCheckpointFile(args.checkpointFile);
    } catch (error) {
      return ports.toolResult(error.message, true);
    }

    const stat = ports.fs.statSync(checkpointFile);
    const checkpoint = ports.parseCheckpointFilename(ports.path.basename(checkpointFile));
    let currentProject = null;
    let currentProjectError = null;
    if (Date.now() - ports.lastPanelSeenAt < 15000) {
      try {
        currentProject = await ports.getCurrentProjectSummary();
      } catch (error) {
        currentProjectError = error.message || String(error);
      }
    } else {
      currentProjectError = "After Effects panel is not currently connected.";
    }

    const response = {
      restored: false,
      restoreMode: "manual",
      checkpointFile,
      bytes: stat.size,
      checkpoint: {
        filename: ports.path.basename(checkpointFile),
        label: checkpoint ? checkpoint.label : null,
        projectName: checkpoint ? checkpoint.projectName : null,
        createdAt: checkpoint && checkpoint.createdAt ? checkpoint.createdAt : stat.birthtime.toISOString(),
        modifiedAt: stat.mtime.toISOString()
      },
      currentProject,
      currentProjectError,
      instructions: [
        "This first restore implementation is intentionally non-destructive.",
        "Use File > Open Project in After Effects and choose checkpointFile.",
        "Save the opened checkpoint as a new project file before continuing automation."
      ]
    };
    ports.recordEvent("project_checkpoint_restore_prepared", response);
    return ports.toolResult(response);
  }

  if (name === "ping_ae") {
    if (Date.now() - ports.lastPanelSeenAt > 15000) {
      return ports.toolResult("After Effects panel has not connected yet.", true);
    }

    const result = await ports.runExtendScriptBody(`
      return {
        appName: app.name,
        appVersion: app.version,
        projectItems: app.project ? app.project.numItems : 0
      };
    `);
    return ports.toolResult(result.result);
  }

  if (name === "run_extendscript") {
    const result = await ports.runExtendScriptBody(String(args.script || ""), Number(args.timeoutMs) || ports.COMMAND_TIMEOUT_MS);
    return ports.toolResult(result.result);
  }

  if (name === "run_extendscript_file") {
    const scriptFile = ports.resolveScriptFile(args.filePath);
    const script = ports.fs.readFileSync(scriptFile.resolvedPath, "utf8");
    const startedAt = Date.now();
    try {
      const result = await ports.runExtendScriptBody(script, Number(args.timeoutMs) || ports.COMMAND_TIMEOUT_MS);
      return ports.toolResult({
        filePath: scriptFile.resolvedPath,
        bytes: scriptFile.stat.size,
        durationMs: Date.now() - startedAt,
        result: result.result
      });
    } catch (error) {
      const wrappedLine = error.line || null;
      const fileLine = wrappedLine && wrappedLine > ports.EXTENDSCRIPT_BODY_LINE_OFFSET
        ? wrappedLine - ports.EXTENDSCRIPT_BODY_LINE_OFFSET
        : wrappedLine;
      return ports.toolResult({
        filePath: scriptFile.resolvedPath,
        bytes: scriptFile.stat.size,
        durationMs: Date.now() - startedAt,
        error: error.message || String(error),
        line: fileLine || null,
        wrappedLine: wrappedLine,
        lineContext: ports.getScriptLineContext(script, fileLine, 4)
      }, true);
    }
  }

  if (name === "get_project_info") {
    const timeoutMs = executionContext && executionContext.panelBootstrapReadTimeoutMs;
    const result = ports.lifecycle.diagnostics().freshMissingStoreReadAllowed
      ? await ports.lifecycle.readProjectInfo(timeoutMs)
      : await ports.runExtendScriptBody(ports.OWNED_TRUSTED_PROJECT_BODY, timeoutMs);
    return ports.toolResult(result.result);
  }

  if (name === "set_project_frames_count_type") {
    const framesCountType = ports.optionalString(args, "framesCountType", "");
    const expectedCurrentFramesCountType = ports.optionalString(args, "expectedCurrentFramesCountType", "");
    const normalizeFramesCountType = (value, fieldName) => {
      const normalized = String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
      if (["fcstart0", "startatzero", "start0", "zero", "0"].includes(normalized)) return "FC_START_0";
      if (["fcstart1", "startatone", "start1", "one", "1"].includes(normalized)) return "FC_START_1";
      throw new Error(`${fieldName} must be FC_START_0/startAtZero or FC_START_1/startAtOne.`);
    };

    let requestedFramesCountType;
    let expectedFramesCountType = "";
    try {
      requestedFramesCountType = normalizeFramesCountType(framesCountType, "framesCountType");
      if (expectedCurrentFramesCountType) {
        expectedFramesCountType = normalizeFramesCountType(expectedCurrentFramesCountType, "expectedCurrentFramesCountType");
      }
    } catch (error) {
      return ports.toolResult(error.message, true);
    }

    const result = await ports.runExtendScriptBody(`
      var project = app.project;
      var requestedFramesCountType = ${ports.aeLiteral(requestedFramesCountType)};
      var expectedFramesCountType = ${ports.aeLiteral(expectedFramesCountType)};

      function __codexFramesCountTypeSnapshot(targetProject) {
        var value = null;
        var name = null;
        var startFrame = null;
        try { value = targetProject ? targetProject.framesCountType : null; } catch (__framesCountReadError) {}
        try {
          if (value === FramesCountType.FC_START_0) {
            name = "FC_START_0";
            startFrame = 0;
          } else if (value === FramesCountType.FC_START_1) {
            name = "FC_START_1";
            startFrame = 1;
          } else if (value !== null && value !== undefined) {
            name = String(value);
          }
        } catch (__framesCountNameError) {
          if (value !== null && value !== undefined) name = String(value);
        }
        return {
          value: value === null || value === undefined ? null : String(value),
          name: name,
          startFrame: startFrame,
          numItems: targetProject ? targetProject.numItems : 0,
          activeItemName: targetProject && targetProject.activeItem ? targetProject.activeItem.name : null,
          activeItemType: targetProject && targetProject.activeItem ? targetProject.activeItem.typeName : null
        };
      }

      function __codexFramesCountTypeValue(name) {
        if (name === "FC_START_0") return FramesCountType.FC_START_0;
        if (name === "FC_START_1") return FramesCountType.FC_START_1;
        throw new Error("Unsupported framesCountType: " + name);
      }

      if (!project) throw new Error("No active project.");
      var before = __codexFramesCountTypeSnapshot(project);
      if (expectedFramesCountType && before.name !== expectedFramesCountType) {
        throw new Error("Project framesCountType guard mismatch. Expected " + expectedFramesCountType + " but found " + before.name + ".");
      }

      app.beginUndoGroup("Codex Set Project Frames Count Type");
      try {
        project.framesCountType = __codexFramesCountTypeValue(requestedFramesCountType);
      } finally {
        app.endUndoGroup();
      }

      var after = __codexFramesCountTypeSnapshot(project);
      return {
        project: {
          framesCountType: after.name,
          framesCountStartFrame: after.startFrame,
          numItems: after.numItems,
          activeItemName: after.activeItemName,
          activeItemType: after.activeItemType
        },
        before: before,
        after: after,
        updates: {
          framesCountType: requestedFramesCountType,
          framesCountStartFrame: requestedFramesCountType === "FC_START_0" ? 0 : 1
        },
        updatedFields: ["framesCountType"],
        postVerification: {
          ok: after.name === requestedFramesCountType,
          framesCountTypeMatches: after.name === requestedFramesCountType,
          projectItemCountUnchanged: before.numItems === after.numItems,
          activeItemUnchanged: before.activeItemName === after.activeItemName && before.activeItemType === after.activeItemType
        }
      };
    `);
    return ports.toolResult(result.result);
  }

  if (name === "get_project_snapshot") {
    const maxItems = Math.max(1, Math.min(2000, Math.floor(ports.optionalNumber(args, "maxItems", 500))));
    const includeComps = ports.optionalBoolean(args, "includeComps", true);
    const includeFootage = ports.optionalBoolean(args, "includeFootage", true);
    const includeFolders = ports.optionalBoolean(args, "includeFolders", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var maxItems = ${maxItems};
      var includeComps = ${includeComps ? "true" : "false"};
      var includeFootage = ${includeFootage ? "true" : "false"};
      var includeFolders = ${includeFolders ? "true" : "false"};
      var project = app.project;

      function __codexFolderPath(item) {
        var names = [];
        var folder = null;
        try { folder = item.parentFolder; } catch (__parentFolderError) {}
        var guard = 0;
        while (folder && project && folder !== project.rootFolder && guard < 50) {
          names.unshift(folder.name);
          try { folder = folder.parentFolder; } catch (__folderParentError) { folder = null; }
          guard++;
        }
        return names.join("/");
      }

      var items = [];
      var totalMatched = 0;
      for (var i = 1; project && i <= project.numItems; i++) {
        var item = project.item(i);
        var type = __codexItemType(item);
        if ((type === "comp" && !includeComps) || (type === "footage" && !includeFootage) || (type === "folder" && !includeFolders)) {
          continue;
        }

        totalMatched++;
        if (items.length >= maxItems) continue;

        var info = {
          itemIndex: i,
          name: item.name,
          type: type,
          typeName: item.typeName || null,
          folderPath: __codexFolderPath(item),
          label: null,
          comment: item.comment || ""
        };
        try { info.label = item.label; } catch (__itemLabelError) {}

        if (item instanceof CompItem) {
          info.width = item.width;
          info.height = item.height;
          info.duration = item.duration;
          info.frameRate = item.frameRate;
          info.numLayers = item.numLayers;
          info.displayStartTime = item.displayStartTime;
          try { info.displayStartFrame = item.displayStartFrame; } catch (__displayStartFrameError) {}
        } else if (item instanceof FootageItem) {
          info.width = item.width || null;
          info.height = item.height || null;
          info.duration = item.duration || null;
          info.frameRate = item.frameRate || null;
          info.file = item.file ? item.file.fsName : null;
          info.hasVideo = !!item.hasVideo;
          info.hasAudio = !!item.hasAudio;
          try { info.isStill = !!item.mainSource.isStill; } catch (__stillError) {}
        } else if (item instanceof FolderItem) {
          info.numItems = item.numItems || 0;
        }

        items.push(info);
      }

      return {
        project: {
          file: project && project.file ? project.file.fsName : null,
          numItems: project ? project.numItems : 0,
          activeItem: project && project.activeItem ? __codexItemReference(project.activeItem) : null
        },
        filters: {
          includeComps: includeComps,
          includeFootage: includeFootage,
          includeFolders: includeFolders,
          maxItems: maxItems
        },
        totalMatched: totalMatched,
        returned: items.length,
        truncated: totalMatched > items.length,
        items: items
      };
    `);
    return ports.toolResult(result.result);
  }

  if (name === "find_project_items") {
    let itemIds = null;
    if (args.itemIds !== undefined) {
      if (!Array.isArray(args.itemIds) || args.itemIds.length < 1 || args.itemIds.length > 250 ||
        args.itemIds.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(args.itemIds).size !== args.itemIds.length) {
        return ports.toolResult("itemIds must contain 1..250 unique positive integer IDs.", true);
      }
      itemIds = args.itemIds;
    }
    const query = ports.optionalString(args, "query", "");
    const type = ports.optionalString(args, "type", "");
    const exactName = ports.optionalBoolean(args, "exactName", false);
    const caseSensitive = ports.optionalBoolean(args, "caseSensitive", false);
    const limit = Math.max(1, Math.min(250, Math.floor(ports.optionalNumber(args, "limit", itemIds ? itemIds.length : 25))));

    if (type && !["comp", "footage", "folder"].includes(type)) {
      return ports.toolResult("type must be one of: comp, footage, folder.", true);
    }

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      return {
        query: ${ports.aeLiteral(query)},
        type: ${ports.aeLiteral(type)},
        exactName: ${exactName ? "true" : "false"},
        caseSensitive: ${caseSensitive ? "true" : "false"},
        itemIds: ${ports.aeLiteral(itemIds)},
        matches: __codexFindProjectItems(${ports.aeLiteral(query)}, ${ports.aeLiteral(type)}, ${exactName ? "true" : "false"}, ${caseSensitive ? "true" : "false"}, ${limit}, ${ports.aeLiteral(itemIds)})
      };
    `);
    return ports.toolResult(result.result);
  }

  if (name === "list_project_folder_items") {
    const folderItemIndex = ports.optionalPositiveInteger(args, "folderItemIndex");
    const folderName = ports.optionalString(args, "folderName", "");
    const recursive = ports.optionalBoolean(args, "recursive", false);
    const type = ports.optionalString(args, "type", "");
    const limit = Math.max(1, Math.min(2000, Math.floor(ports.optionalNumber(args, "limit", 200))));

    if (type && !["comp", "footage", "folder"].includes(type)) {
      return ports.toolResult("type must be one of: comp, footage, folder.", true);
    }

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var folder = __codexResolveProjectFolder(${folderItemIndex === null ? "null" : folderItemIndex}, ${ports.aeLiteral(folderName)}, true);
      var recursive = ${recursive ? "true" : "false"};
      var itemType = ${ports.aeLiteral(type)};
      var limit = ${limit};
      var items = [];
      var totalMatched = 0;

      for (var i = 1; i <= app.project.numItems; i++) {
        var item = app.project.item(i);
        var directChild = false;
        try { directChild = item.parentFolder === folder; } catch (__directChildError) {}
        var matchedFolder = recursive ? __codexIsItemInsideFolder(item, folder) : directChild;
        if (!matchedFolder) continue;
        if (!__codexMatchesItemType(item, itemType)) continue;
        totalMatched++;
        if (items.length >= limit) continue;
        var ref = __codexItemReference(item);
        try { ref.folderPath = __codexFolderPath(item); } catch (__folderPathError) {}
        try { ref.fullPath = item instanceof FolderItem ? __codexFolderFullPath(item) : (ref.folderPath ? ref.folderPath + "/" + ref.name : ref.name); } catch (__fullPathError) {}
        items.push(ref);
      }

      var folderRef = __codexItemReference(folder);
      folderRef.folderPath = __codexFolderFullPath(folder);
      return {
        folder: folderRef,
        recursive: recursive,
        type: itemType || null,
        totalMatched: totalMatched,
        returned: items.length,
        truncated: totalMatched > items.length,
        items: items
      };
    `);
    return ports.toolResult(result.result);
  }

  if (name === "create_comp") {
    const compName = ports.optionalString(args, "name", "").trim();
    const width = Math.floor(ports.optionalNumber(args, "width", 1920));
    const height = Math.floor(ports.optionalNumber(args, "height", 1080));
    const pixelAspect = ports.optionalNumber(args, "pixelAspect", 1);
    const duration = ports.optionalNumber(args, "duration", 5);
    const frameRate = ports.optionalNumber(args, "frameRate", 30);
    const bgColor = ports.optionalNumberArray(args, "bgColor", [0, 0, 0], 3, 3);
    const parentFolderItemIndex = ports.optionalPositiveInteger(args, "parentFolderItemIndex");
    const parentFolderName = ports.optionalString(args, "parentFolderName", "");
    const allowDuplicateName = ports.optionalBoolean(args, "allowDuplicateName", false);
    const openInViewer = ports.optionalBoolean(args, "openInViewer", true);
    const comment = ports.optionalString(args, "comment", "");

    if (!compName) return ports.toolResult("name is required.", true);
    if (width < 4) return ports.toolResult("width must be at least 4 pixels.", true);
    if (height < 4) return ports.toolResult("height must be at least 4 pixels.", true);
    if (pixelAspect <= 0) return ports.toolResult("pixelAspect must be greater than 0.", true);
    if (duration <= 0) return ports.toolResult("duration must be greater than 0.", true);
    if (frameRate <= 0) return ports.toolResult("frameRate must be greater than 0.", true);
    if (bgColor.some((value) => value < 0 || value > 1)) return ports.toolResult("bgColor values must be between 0 and 1.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var compName = ${ports.aeLiteral(compName)};
      var width = ${width};
      var height = ${height};
      var pixelAspect = ${pixelAspect};
      var duration = ${duration};
      var frameRate = ${frameRate};
      var bgColor = ${ports.aeLiteral(bgColor)};
      var parentFolder = __codexResolveProjectFolder(${parentFolderItemIndex === null ? "null" : parentFolderItemIndex}, ${ports.aeLiteral(parentFolderName)}, true);
      var allowDuplicateName = ${allowDuplicateName ? "true" : "false"};
      var openInViewer = ${openInViewer ? "true" : "false"};
      var comment = ${ports.aeLiteral(comment)};

      if (!allowDuplicateName) {
        for (var i = 1; i <= app.project.numItems; i++) {
          var existing = app.project.item(i);
          if (existing instanceof CompItem && existing.name === compName) {
            throw new Error("Composition already exists: " + compName + ". Pass allowDuplicateName:true to create another.");
          }
        }
      }

      app.beginUndoGroup("Codex Create Comp");
      try {
        var comp = app.project.items.addComp(compName, width, height, pixelAspect, duration, frameRate);
        comp.bgColor = bgColor;
        if (parentFolder && parentFolder !== app.project.rootFolder) comp.parentFolder = parentFolder;
        if (comment) {
          try { comp.comment = comment; } catch (__commentError) {}
        } else {
          try { comp.comment = "Created by AE Agent create_comp"; } catch (__defaultCommentError) {}
        }
        if (openInViewer) comp.openInViewer();
        var response = {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name,
          type: "comp",
          width: comp.width,
          height: comp.height,
          pixelAspect: comp.pixelAspect,
          duration: comp.duration,
          frameRate: comp.frameRate,
          bgColor: comp.bgColor,
          numLayers: comp.numLayers,
          folderPath: __codexFolderPath(comp)
        };
        return response;
      } finally {
        app.endUndoGroup();
      }
    `);
    return ports.toolResult(result.result);
  }

  if (name === "create_project_folder") {
    const folderName = ports.optionalString(args, "name", "").trim();
    const parentFolderItemIndex = ports.optionalPositiveInteger(args, "parentFolderItemIndex");
    const parentFolderName = ports.optionalString(args, "parentFolderName", "");
    const allowExisting = ports.optionalBoolean(args, "allowExisting", true);

    if (!folderName) return ports.toolResult("name is required.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var folderName = ${ports.aeLiteral(folderName)};
      var parentFolder = __codexResolveProjectFolder(${parentFolderItemIndex === null ? "null" : parentFolderItemIndex}, ${ports.aeLiteral(parentFolderName)}, true);
      var allowExisting = ${allowExisting ? "true" : "false"};
      var existingFolder = __codexFindChildFolder(parentFolder, folderName);

      if (existingFolder) {
        if (!allowExisting) {
          throw new Error("Folder already exists in target parent: " + folderName + ".");
        }
        var existingRef = __codexItemReference(existingFolder);
        existingRef.folderPath = __codexFolderFullPath(existingFolder);
        return {
          folder: existingRef,
          parentFolder: __codexItemReference(parentFolder),
          existed: true
        };
      }

      app.beginUndoGroup("Codex Create Project Folder");
      try {
        var folder = app.project.items.addFolder(folderName);
        if (parentFolder && parentFolder !== app.project.rootFolder) folder.parentFolder = parentFolder;
        var ref = __codexItemReference(folder);
        ref.folderPath = __codexFolderFullPath(folder);
        return {
          folder: ref,
          parentFolder: __codexItemReference(parentFolder),
          existed: false
        };
      } finally {
        app.endUndoGroup();
      }
    `);
    return ports.toolResult(result.result);
  }

  if (name === "move_project_items_to_folder") {
    const itemIndices = ports.requiredPositiveIntegerList(args, "itemIndices");
    const targetFolderItemIndex = ports.optionalPositiveInteger(args, "targetFolderItemIndex");
    const targetFolderName = ports.optionalString(args, "targetFolderName", "");
    const targetRoot = ports.optionalBoolean(args, "targetRoot", false);
    const includeFolders = ports.optionalBoolean(args, "includeFolders", false);

    if (targetFolderItemIndex === null && !targetFolderName && !targetRoot) {
      return ports.toolResult("Provide targetFolderItemIndex, targetFolderName, or targetRoot:true.", true);
    }
    if (targetRoot && (targetFolderItemIndex !== null || targetFolderName)) {
      return ports.toolResult("targetRoot cannot be combined with targetFolderItemIndex or targetFolderName.", true);
    }

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var itemIndices = ${ports.aeLiteral(itemIndices)};
      var targetFolder = ${targetRoot ? "app.project.rootFolder" : `__codexResolveProjectFolder(${targetFolderItemIndex === null ? "null" : targetFolderItemIndex}, ${ports.aeLiteral(targetFolderName)}, false)`};
      var includeFolders = ${includeFolders ? "true" : "false"};
      var moved = [];
      var skipped = [];

      app.beginUndoGroup("Codex Move Project Items To Folder");
      try {
        var itemsToMove = [];
        for (var i = 0; i < itemIndices.length; i++) {
          var item = app.project.item(itemIndices[i]);
          if (!item) throw new Error("Project item not found at index " + itemIndices[i] + ".");
          if (item === targetFolder) throw new Error("Cannot move the target folder into itself.");
          if (item instanceof FolderItem && !includeFolders) {
            throw new Error("Item #" + itemIndices[i] + " is a folder. Pass includeFolders:true to move folders intentionally.");
          }
          if (item instanceof FolderItem && __codexIsItemInsideFolder(targetFolder, item)) {
            throw new Error("Cannot move a folder into itself or one of its descendants: " + item.name + ".");
          }
          for (var seenIndex = 0; seenIndex < itemsToMove.length; seenIndex++) {
            if (itemsToMove[seenIndex].item === item) {
              throw new Error("Duplicate project item target at index " + itemIndices[i] + ": " + item.name + ".");
            }
          }
          itemsToMove.push({ item: item, requestedIndex: itemIndices[i] });
        }

        for (var moveIndex = 0; moveIndex < itemsToMove.length; moveIndex++) {
          var item = itemsToMove[moveIndex].item;

          var previousFolderPath = "";
          try { previousFolderPath = __codexFolderPath(item); } catch (__previousFolderPathError) {}
          var alreadyInTarget = false;
          try { alreadyInTarget = item.parentFolder === targetFolder; } catch (__alreadyInTargetError) {}

          if (alreadyInTarget) {
            var skippedRef = __codexItemReference(item);
            skippedRef.folderPath = previousFolderPath;
            skipped.push(skippedRef);
            continue;
          }

          item.parentFolder = targetFolder;
          var ref = __codexItemReference(item);
          ref.previousFolderPath = previousFolderPath;
          ref.folderPath = __codexFolderPath(item);
          moved.push(ref);
        }

        var targetRef = __codexItemReference(targetFolder);
        targetRef.folderPath = __codexFolderFullPath(targetFolder);
        return {
          targetFolder: targetRef,
          movedCount: moved.length,
          skippedCount: skipped.length,
          moved: moved,
          skipped: skipped
        };
      } finally {
        app.endUndoGroup();
      }
    `);
    return ports.toolResult(result.result);
  }

  if (name === "set_project_item_metadata") {
    const allowedKeys = new Set([
      "itemIndices",
      "expectedItemNames",
      "label",
      "autoCheckpoint",
      "checkpointLabel",
      "idempotencyKey",
      "idempotencyScope",
      "verifyAfter",
      ports.M100_DIRECT_ESCAPE_HATCH_ARG
    ]);
    const unsupportedKeys = Object.keys(args || {}).filter((key) => !allowedKeys.has(key));
    if (unsupportedKeys.length) return ports.toolResult("Unsupported set_project_item_metadata fields: " + unsupportedKeys.join(", "), true);

    let itemIndices;
    try {
      itemIndices = ports.requiredExplicitPositiveIntegerList(args, "itemIndices");
    } catch (error) {
      return ports.toolResult(error.message || String(error), true);
    }

    let expectedItemNames = null;
    if (ports.hasArg(args, "expectedItemNames")) {
      expectedItemNames = args.expectedItemNames;
      if (typeof expectedItemNames === "string" && expectedItemNames.trim().startsWith("[")) {
        expectedItemNames = JSON.parse(expectedItemNames);
      }
      if (!Array.isArray(expectedItemNames)) return ports.toolResult("expectedItemNames must be an array when provided.", true);
      expectedItemNames = expectedItemNames.map((value) => String(value));
      if (expectedItemNames.length !== itemIndices.length) {
        return ports.toolResult("expectedItemNames must have the same length as itemIndices.", true);
      }
    }

    const label = ports.optionalNumber(args, "label", null);
    if (!Number.isInteger(label) || label < 0 || label > 16) return ports.toolResult("label must be an integer from 0 through 16.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var itemIndices = ${ports.aeLiteral(itemIndices)};
      var expectedItemNames = ${expectedItemNames ? ports.aeLiteral(expectedItemNames) : "null"};
      var label = ${label};

      app.beginUndoGroup("Codex Set Project Item Metadata");
      try {
        var changed = [];
        var allMatch = true;
        for (var __pi = 0; __pi < itemIndices.length; __pi++) {
          var requestedIndex = itemIndices[__pi];
          var item = app.project.item(requestedIndex);
          if (!item) throw new Error("Project item not found at index " + requestedIndex + ".");
          if (expectedItemNames && item.name !== expectedItemNames[__pi]) {
            throw new Error("Project item name mismatch at index " + requestedIndex + ". Expected '" + expectedItemNames[__pi] + "' but found '" + item.name + "'.");
          }

          var before = __codexItemReference(item);
          item.label = Number(label);
          var after = __codexItemReference(item);
          var fieldMatches = { label: Number(after.label) === Number(label) };
          if (!fieldMatches.label) allMatch = false;
          changed.push({
            itemIndex: requestedIndex,
            expectedItemName: expectedItemNames ? expectedItemNames[__pi] : null,
            before: before,
            after: after,
            fieldMatches: fieldMatches
          });
        }

        var items = [];
        for (var __changedIndex = 0; __changedIndex < changed.length; __changedIndex++) {
          items.push(changed[__changedIndex].after);
        }
        return {
          requestedItemIndices: itemIndices,
          expectedItemNames: expectedItemNames,
          updatedFields: ["label"],
          updates: { label: label },
          changedCount: changed.length,
          item: items.length === 1 ? items[0] : null,
          items: items,
          changed: changed,
          postVerification: {
            ok: allMatch,
            requestedCount: itemIndices.length,
            changedCount: changed.length,
            updatedFields: ["label"]
          }
        };
      } finally {
        app.endUndoGroup();
      }
    `);
    return ports.toolResult(result.result);
  }

  if (name === "list_comps") {
    const result = await ports.runExtendScriptBody(`
      var comps = [];
      for (var i = 1; i <= app.project.numItems; i++) {
        var item = app.project.item(i);
        if (item instanceof CompItem) {
          comps.push({
            itemIndex: i,
            name: item.name,
            width: item.width,
            height: item.height,
            duration: item.duration,
            frameRate: item.frameRate,
            numLayers: item.numLayers
          });
        }
      }
      return comps;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "list_layers") {
    const index = Number(args.compItemIndex);
    if (!Number.isFinite(index) || index < 1) {
      return ports.toolResult("compItemIndex must be a positive 1-based project item index.", true);
    }

    const result = await ports.runExtendScriptBody(`
      var item = app.project.item(${Math.floor(index)});
      if (!(item instanceof CompItem)) {
        throw new Error("Project item is not a composition.");
      }
      var layers = [];
      for (var i = 1; i <= item.numLayers; i++) {
        var layer = item.layer(i);
        layers.push({
          index: i,
          id: layer.id,
          name: layer.name,
          matchName: layer.matchName,
          enabled: layer.enabled,
          locked: layer.locked,
          shy: layer.shy,
          solo: layer.solo,
          startTime: layer.startTime,
          inPoint: layer.inPoint,
          outPoint: layer.outPoint
        });
      }
      return {
        comp: {
          itemIndex: ${Math.floor(index)},
          name: item.name,
          numLayers: item.numLayers
        },
        layers: layers
      };
    `);
    return ports.toolResult(result.result);
  }

  if (name === "get_comp_details") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const compItemId = ports.optionalPositiveInteger(args,"compItemId");
    if (args.includeDynamicLinkGUID !== undefined && typeof args.includeDynamicLinkGUID !== "boolean") throw new Error("includeDynamicLinkGUID must be a boolean.");
    const includeDynamicLinkGUID = ports.optionalBoolean(args, "includeDynamicLinkGUID", false);
    if (includeDynamicLinkGUID && compItemId === null) throw new Error("dynamic_link_comp_item_id_required");
    const includeLayers = ports.optionalBoolean(args, "includeLayers", true);
    const layerLimit = Math.max(1, Math.min(1000, Math.floor(ports.optionalNumber(args, "layerLimit", 200))));
    const includeMarkers = ports.optionalBoolean(args, "includeMarkers", false);
    const markerLimit = Math.max(0, Math.min(1000, Math.floor(ports.optionalNumber(args, "markerLimit", 50))));

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)}, ${compItemId === null ? "null" : compItemId});
      ${includeDynamicLinkGUID ? `
        if (${compItemIndex === null ? "false" : `__codexProjectIndexForItem(comp) !== ${compItemIndex}`} || ${compName ? `comp.name !== ${ports.aeLiteral(compName)}` : "false"}) throw new Error("stable_comp_identity_mismatch");
        ${ports.compDynamicLinkRead.aeReadSupport}
        var dynamicLinkEvidence = __codexCompDynamicLinkEvidence(comp);
        if (!dynamicLinkEvidence.ok) return dynamicLinkEvidence;
      ` : ""}
      var includeLayers = ${includeLayers ? "true" : "false"};
      var includeMarkers = ${includeMarkers ? "true" : "false"};
      var layerLimit = ${layerLimit};
      var markerLimit = ${markerLimit};
      var selectedLayerIndices = [];
      for (var s = 0; s < comp.selectedLayers.length; s++) {
        selectedLayerIndices.push(comp.selectedLayers[s].index);
      }
      var displayStartFrame = null;
      var displayStartFrameSupported = false;
      try {
        if (comp.displayStartFrame !== undefined) {
          displayStartFrame = comp.displayStartFrame;
          displayStartFrameSupported = true;
        }
      } catch (__displayStartFrameError) {}

      var layers = [];
      if (includeLayers) {
        for (var i = 1; i <= comp.numLayers && layers.length < layerLimit; i++) {
          layers.push(__codexLayerInfo(comp.layer(i)));
        }
      }

      var details = {
        itemIndex: __codexProjectIndexForItem(comp),
        itemId: comp.id,
        name: comp.name,
        type: "comp",
        width: comp.width,
        height: comp.height,
        pixelAspect: comp.pixelAspect,
        duration: comp.duration,
        workAreaStart: comp.workAreaStart,
        workAreaDuration: comp.workAreaDuration,
        frameRate: comp.frameRate,
        displayStartTime: comp.displayStartTime,
        resolutionFactor: comp.resolutionFactor ? [comp.resolutionFactor[0], comp.resolutionFactor[1]] : null,
        displayStartFrame: displayStartFrame,
        displayStartFrameSupported: displayStartFrameSupported,
        preserveNestedFrameRate: !!comp.preserveNestedFrameRate,
        time: comp.time,
        bgColor: comp.bgColor,
        motionBlur: comp.motionBlur,
        numLayers: comp.numLayers,
        selectedLayerIndices: selectedLayerIndices,
        layersReturned: layers.length,
        layersTruncated: includeLayers && comp.numLayers > layers.length,
        markers: includeMarkers ? __codexCompMarkers(comp, markerLimit) : null,
        layers: layers
      };
      ${includeDynamicLinkGUID ? `details.dynamicLinkGUID = dynamicLinkEvidence.dynamicLinkGUID; details.project = dynamicLinkEvidence.project;` : ""}
      ${ports.ownedReadonlyFirstTwoPreparation(name) ? `var ownedFirstTwoTitleInventory=${ports.ownedFirstTwoTitleInventory.toString()};var ownedInitialUiBaseline=${ports.ownedInitialUiBaseline.toString()};details.ownedTitleInventory=ownedFirstTwoTitleInventory(comp);details.ownedUiBaseline=ownedInitialUiBaseline();` : ""}
      ${ports.ownedReadonlyObservedRangePreparation(name) ? `var ownedObservedRootTiming=${ports.ownedObservedRootTiming.toString()};details.ownedObservedTiming=ownedObservedRootTiming(comp);` : ""}
      return details;
    `);
    return ports.toolResult(result.result, result.result && result.result.ok === false);
  }

  if (name === "get_property_value") {
    if(Object.keys(args).some(key=>!["compItemId","layerId","propertyPath","time"].includes(key))) throw new Error("property_read_args_invalid");
    const compItemId=ports.requiredPositiveInteger(args,"compItemId"),layerId=ports.requiredPositiveInteger(args,"layerId");
    const propertyPath=args.propertyPath,time=ports.optionalNumber(args,"time",null);
    if(!Array.isArray(propertyPath) || !propertyPath.length || propertyPath.length>12) throw new Error("property_path_invalid");
    const result=await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp=__codexResolveComp(null,"",${compItemId});
      var layer=__codexResolveLayer(comp,null,${layerId});
      var propertyPath=${ports.aeLiteral(propertyPath)};
      if(propertyPath.length===1 && typeof propertyPath[0]==="string" && ["threeDLayer","collapseTransformation","motionBlur"].indexOf(propertyPath[0])>=0) {
        var attribute=propertyPath[0];
        if(typeof layer[attribute]!=="boolean") throw new Error("layer_attribute_evidence_unavailable");
        return {comp:{itemId:comp.id,itemIndex:__codexProjectIndexForItem(comp),name:comp.name},layer:__codexLayerInfo(layer),property:{name:attribute,matchName:attribute,propertyPath:[{name:attribute,matchName:attribute}],value:!!layer[attribute],numKeys:0,expressionEnabled:false}};
      }
      var prop=__codexResolveProperty(layer,propertyPath);
      var info=__codexPropertyInfo(prop,layer,true,true);
      var sampleTime=${time===null ? "null" : time};
      if(sampleTime!==null) {
        info.observedTime=sampleTime;
        info.value=__codexValueData(prop.valueAtTime(sampleTime,false));
        info.keyframes=[];
        if(prop.numKeys>0) {var key=prop.nearestKeyIndex(sampleTime);if(Math.abs(prop.keyTime(key)-sampleTime)<=0.0000001) info.keyframes.push(__codexKeyframeInfo(prop,key));}
        info.keyframesTruncated=false;
      }
      return {comp:{itemId:comp.id,itemIndex:__codexProjectIndexForItem(comp),name:comp.name},layer:__codexLayerInfo(layer),property:info};
    `);
    return ports.toolResult(result.result);
  }

  if (name === "get_layer_details") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndex = args.layerId === undefined ? ports.requiredPositiveInteger(args,"layerIndex") : ports.optionalPositiveInteger(args,"layerIndex");
    const compItemId = ports.optionalPositiveInteger(args, "compItemId");
    const layerId = ports.optionalPositiveInteger(args, "layerId");
    const protectedProperties = ports.placeholderProtection.normalizeProtectedPaths(args.protectedProperties || []);
    const includeProperties = ports.optionalBoolean(args, "includeProperties", false);
    const propertyDepth = Math.max(0, Math.min(5, Math.floor(ports.optionalNumber(args, "propertyDepth", 1))));
    const propertyLimit = Math.max(1, Math.min(1000, Math.floor(ports.optionalNumber(args, "propertyLimit", 120))));
    const includeValues = ports.optionalBoolean(args, "includeValues", false);
    const includeExpressions = ports.optionalBoolean(args, "includeExpressions", true);
    const responseView = ports.optionalString(args, "responseView", "full");
    if (responseView !== "full" && responseView !== "placeholder") {
      throw new Error("responseView must be full or placeholder.");
    }

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      ${ports.placeholderGeometry.aeGeometrySupport}
      var comp = ${compItemId === null ? `__codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)})` : `__phFindComp(${compItemId})`};
      var layer = ${layerId === null ? `comp.layer(${layerIndex})` : `__phFindLayer(comp,${layerId})`};
      if (!layer) throw new Error("Layer not found.");
      var includeProperties = ${includeProperties ? "true" : "false"};
      var includeValues = ${includeValues ? "true" : "false"};
      var includeExpressions = ${includeExpressions ? "true" : "false"};
      var propertyDepth = ${propertyDepth};
      var propertyLimit = ${propertyLimit};

      function __codexReadProperty(group, matchName) {
        try {
          var prop = group.property(matchName);
          if (!prop) return null;
          var preview=__codexValuePreview(prop);
          preview.numKeys=prop.numKeys;
          preview.expressionEnabled=prop.expressionEnabled;
          preview.dimensionsSeparated=prop.dimensionsSeparated===true;
          preview.isSeparationFollower=prop.isSeparationFollower===true;
          return preview;
        } catch (__readPropertyError) {
          return null;
        }
      }

      function __codexPropertyTree(prop, depth, state) {
        if (!prop || state.count >= state.max) return null;
        state.count++;
        var info = __codexPropertyInfo(prop, null, includeValues, includeExpressions);
        var children = [];
        if (depth > 0) {
          try {
            for (var i = 1; i <= prop.numProperties && state.count < state.max; i++) {
              var child = __codexPropertyTree(prop.property(i), depth - 1, state);
              if (child) children.push(child);
            }
          } catch (__childrenError) {}
        }
        if (children.length) info.children = children;
        return info;
      }

      var transform = null;
      try {
        var transformGroup = layer.property("ADBE Transform Group");
        var anchorPointPreview = __codexReadProperty(transformGroup, "ADBE Anchor Point");
        transform = {
          anchorPoint: anchorPointPreview,
          pointOfInterest: __codexReadProperty(transformGroup, "ADBE Point of Interest") || (layer.matchName === "ADBE Camera Layer" ? anchorPointPreview : null),
          position: __codexReadProperty(transformGroup, "ADBE Position"),
          scale: __codexReadProperty(transformGroup, "ADBE Scale"),
          orientation: __codexReadProperty(transformGroup, "ADBE Orientation"),
          rotation: __codexReadProperty(transformGroup, "ADBE Rotate Z"),
          opacity: __codexReadProperty(transformGroup, "ADBE Opacity")
        };
      } catch (__transformError) {}

      var camera = null;
      try {
        var cameraGroup = layer.property("ADBE Camera Options Group");
        if (cameraGroup) {
          camera = {
            zoom: __codexReadProperty(cameraGroup, "ADBE Camera Zoom"),
            depthOfField: __codexReadProperty(cameraGroup, "ADBE Camera Depth of Field"),
            focusDistance: __codexReadProperty(cameraGroup, "ADBE Camera Focus Distance"),
            aperture: __codexReadProperty(cameraGroup, "ADBE Camera Aperture"),
            blurLevel: __codexReadProperty(cameraGroup, "ADBE Camera Blur Level")
          };
        }
      } catch (__cameraError) {}

      var text = null;
      try {
        var textProp = layer.property("ADBE Text Properties").property("ADBE Text Document");
        text = __codexValuePreview(textProp);
      } catch (__textError) {}

      var effects = [];
      try {
        var effectGroup = layer.property("ADBE Effect Parade");
        if (effectGroup) {
          for (var e = 1; e <= effectGroup.numProperties; e++) {
            var effect = effectGroup.property(e);
            effects.push({
              propertyIndex: effect.propertyIndex,
              name: effect.name,
              matchName: effect.matchName,
              enabled: effect.enabled
            });
          }
        }
      } catch (__effectsError) {}

      function __codexMaskModeName(value) {
        try { if (value === MaskMode.ADD) return "add"; } catch (__maskModeAddError) {}
        try { if (value === MaskMode.SUBTRACT) return "subtract"; } catch (__maskModeSubtractError) {}
        try { if (value === MaskMode.INTERSECT) return "intersect"; } catch (__maskModeIntersectError) {}
        try { if (value === MaskMode.LIGHTEN) return "lighten"; } catch (__maskModeLightenError) {}
        try { if (value === MaskMode.DARKEN) return "darken"; } catch (__maskModeDarkenError) {}
        try { if (value === MaskMode.DIFFERENCE) return "difference"; } catch (__maskModeDifferenceError) {}
        try { if (value === MaskMode.NONE) return "none"; } catch (__maskModeNoneError) {}
        return String(value);
      }

      function __codexMaskPointList(points, limit) {
        var list = [];
        if (!points) return list;
        for (var __mp = 0; __mp < points.length && __mp < limit; __mp++) {
          var point = points[__mp];
          list.push([point[0], point[1]]);
        }
        return list;
      }

      function __codexFindChildProperty(group, matchName, fallbackName) {
        if (!group) return null;
        try {
          var direct = group.property(matchName);
          if (direct) return direct;
        } catch (__directPropertyError) {}
        if (fallbackName) {
          try {
            var fallback = group.property(fallbackName);
            if (fallback) return fallback;
          } catch (__fallbackPropertyError) {}
        }
        try {
          for (var __cp = 1; __cp <= group.numProperties; __cp++) {
            var child = group.property(__cp);
            if (child && (child.matchName === matchName || child.name === fallbackName)) return child;
          }
        } catch (__childPropertyError) {}
        return null;
      }

      function __codexMaskShapeInfo(mask) {
        try {
          var shapeProp = __codexFindChildProperty(mask, "ADBE Mask Shape", "Mask Path");
          if (!shapeProp) return null;
          var shape = shapeProp.value;
          if (!shape) return null;
          return {
            closed: shape.closed === true,
            vertexCount: shape.vertices ? shape.vertices.length : 0,
            vertices: __codexMaskPointList(shape.vertices, 50),
            inTangents: __codexMaskPointList(shape.inTangents, 50),
            outTangents: __codexMaskPointList(shape.outTangents, 50),
            truncated: shape.vertices && shape.vertices.length > 50
          };
        } catch (__maskShapeError) {
          return null;
        }
      }

      var masks = [];
      try {
        var maskGroup = layer.property("ADBE Mask Parade");
        if (maskGroup) {
          for (var m = 1; m <= maskGroup.numProperties; m++) {
            var mask = maskGroup.property(m);
            masks.push({
              propertyIndex: mask.propertyIndex,
              name: mask.name,
              matchName: mask.matchName,
              maskMode: __codexMaskModeName(mask.maskMode),
              inverted: mask.inverted,
              shape: __codexMaskShapeInfo(mask),
              opacity: __codexReadProperty(mask, "ADBE Mask Opacity") || __codexReadProperty(mask, "Mask Opacity"),
              feather: __codexReadProperty(mask, "ADBE Mask Feather") || __codexReadProperty(mask, "Mask Feather"),
              expansion: __codexReadProperty(mask, "ADBE Mask Expansion") || __codexReadProperty(mask, "Mask Expansion")
            });
          }
        }
      } catch (__masksError) {}

      var markers = __codexLayerMarkers(layer, 50);

      var propertyTree = [];
      var propertyState = { count: 0, max: propertyLimit };
      if (includeProperties) {
        try {
          for (var p = 1; p <= layer.numProperties && propertyState.count < propertyState.max; p++) {
            var branch = __codexPropertyTree(layer.property(p), propertyDepth, propertyState);
            if (branch) propertyTree.push(branch);
          }
        } catch (__propertyTreeError) {}
      }

      var protectedPaths=${JSON.stringify(protectedProperties)};
      var protectedRows=[];
      for(var pr=0;pr<protectedPaths.length;pr++) {
        var protectedProperty=__phProperty(layer,protectedPaths[pr]);
        var protectedPath=protectedPaths[pr];
        var protectedValue;
        if(protectedPath.length===2 && protectedPath[0].matchName==="ADBE Text Properties"
          && protectedPath[1].matchName==="ADBE Text Document") {
          // Raw host TextDocument enumeration can invoke box-only getters on point text.
          // Use the existing normal preview; property identity and metadata still come from AE.
          protectedValue=__codexValuePreview(protectedProperty);
          if(protectedValue.kind!=="TextDocument") throw new Error("protected_source_text_unavailable");
        } else protectedValue=__phReadValue(protectedProperty);
        protectedRows.push({path:protectedPath,value:protectedValue,numKeys:protectedProperty.numKeys,
          expressionEnabled:protectedProperty.expressionEnabled,dimensionsSeparated:protectedProperty.dimensionsSeparated===true});
      }
      return {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          itemId: comp.id,
          name: comp.name,
          frameRate: comp.frameRate,
          time: comp.time,
          numLayers: comp.numLayers
        },
        layer: __codexLayerInfo(layer),
        transform: transform,
        camera: camera,
        text: text,
        effects: effects,
        masks: masks,
        markers: markers,
        propertyTree: propertyTree,
        propertyTreeTruncated: propertyState.count >= propertyState.max,
        protectedProperties: protectedRows
        ,geometry: __phGeometry(comp,layer,null).geometry
      };
    `);
    return ports.toolResult(responseView === "placeholder"
      ? ports.placeholderEvidence.projectPlaceholderLayerEvidence(result.result)
      : result.result);
  }

  if (name === "get_layer_essential_properties") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndex = ports.requiredPositiveInteger(args, "layerIndex");
    const includeValues = ports.optionalBoolean(args, "includeValues", true);
    const includeExpressions = ports.optionalBoolean(args, "includeExpressions", true);
    const propertyLimit = Math.max(1, Math.min(200, Math.floor(ports.optionalNumber(args, "propertyLimit", 80))));

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}

      function __codexEssentialSourceInfo(source) {
        if (!source) return null;
        try {
          if (source instanceof Property) {
            return {
              kind: "property",
              name: source.name || "",
              matchName: source.matchName || null,
              propertyIndex: source.propertyIndex || null,
              propertyPath: __codexPropertyPath(source),
              canSetExpression: !!source.canSetExpression,
              propertyValueType: source.propertyValueType || null,
              unitsText: source.unitsText || ""
            };
          }
        } catch (__sourcePropertyError) {}
        try {
          if (source instanceof AVLayer || source instanceof TextLayer || source instanceof ShapeLayer) {
            return {
              kind: "layer",
              layer: __codexLayerInfo(source)
            };
          }
        } catch (__sourceLayerError) {}
        try {
          return {
            kind: "unknown",
            name: source.name || "",
            matchName: source.matchName || null
          };
        } catch (__unknownSourceError) {
          return {
            kind: "unknown"
          };
        }
      }

      function __codexEssentialPropertyInfo(prop, layer, includeValue, includeExpression) {
        var info = __codexPropertyInfo(prop, layer, includeValue, includeExpression);
        try { info.unitsText = prop.unitsText || ""; } catch (__unitsTextError) {}
        try { info.essentialPropertySource = __codexEssentialSourceInfo(prop.essentialPropertySource); } catch (__essentialSourceError) { info.essentialPropertySource = null; }
        return info;
      }

      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      var includeValues = ${includeValues ? "true" : "false"};
      var includeExpressions = ${includeExpressions ? "true" : "false"};
      var propertyLimit = ${propertyLimit};
      var group = null;
      try { group = layer.essentialProperty; } catch (__essentialGroupError) {}
      var properties = [];
      var count = 0;
      if (group) {
        try { count = group.numProperties || 0; } catch (__essentialCountError) { count = 0; }
        for (var __ep = 1; __ep <= count && properties.length < propertyLimit; __ep++) {
          var prop = null;
          try { prop = group.property(__ep); } catch (__essentialPropertyError) {}
          if (prop) properties.push(__codexEssentialPropertyInfo(prop, layer, includeValues, includeExpressions));
        }
      }
      return {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name,
          numLayers: comp.numLayers
        },
        layer: __codexLayerInfo(layer),
        essentialProperties: {
          available: !!group,
          count: count,
          returned: properties.length,
          truncated: count > properties.length,
          properties: properties
        }
      };
    `);
    return ports.toolResult(result.result);
  }

  if (name === "get_essential_graphics_controllers") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}

      function __codexEssentialGraphicsControllers(comp) {
        var controllers = [];
        var count = 0;
        try { count = comp.motionGraphicsTemplateControllerCount || 0; } catch (__countError) { count = 0; }
        for (var __eg = 1; __eg <= count; __eg++) {
          var controllerName = "";
          try { controllerName = comp.getMotionGraphicsTemplateControllerName(__eg) || ""; } catch (__nameError) {}
          controllers.push({
            index: __eg,
            name: controllerName
          });
        }
        return {
          count: count,
          controllers: controllers
        };
      }

      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var controllers = __codexEssentialGraphicsControllers(comp);
      var templateName = "";
      try { templateName = comp.motionGraphicsTemplateName || ""; } catch (__templateNameError) {}
      return {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name,
          numLayers: comp.numLayers
        },
        motionGraphicsTemplateName: templateName,
        controllerCount: controllers.count,
        controllers: controllers.controllers
      };
    `);
    return ports.toolResult(result.result);
  }

  if (name === "get_path_geometry") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndex = ports.requiredPositiveInteger(args, "layerIndex");
    const targetKind = ports.optionalString(args, "targetKind", "").toLowerCase();
    const expectedLayerName = ports.optionalString(args, "expectedLayerName", "");
    const expectedMaskName = ports.optionalString(args, "expectedMaskName", "");
    const includeKeyframes = ports.optionalBoolean(args, "includeKeyframes", true);
    const keyframeLimit = Math.max(1, Math.min(80, Math.floor(ports.optionalNumber(args, "keyframeLimit", 80))));
    let propertyPath = null;
    let maskIndex = null;

    if (!["shape", "mask"].includes(targetKind)) return ports.toolResult("targetKind must be shape or mask.", true);
    if (targetKind === "shape") {
      try {
        propertyPath = ports.normalizePropertyPathArg(args, "propertyPath");
      } catch (error) {
        return ports.toolResult(error.message || String(error), true);
      }
    } else {
      maskIndex = ports.optionalPositiveInteger(args, "maskIndex");
      if (maskIndex === null) return ports.toolResult("maskIndex is required for targetKind=mask.", true);
    }

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      var targetKind = ${ports.aeLiteral(targetKind)};
      var propertyPath = ${propertyPath ? ports.aeLiteral(propertyPath) : "null"};
      var requestedMaskIndex = ${maskIndex === null ? "null" : maskIndex};
      var expectedLayerName = ${ports.aeLiteral(expectedLayerName)};
      var expectedMaskName = ${ports.aeLiteral(expectedMaskName)};
      var includeKeyframes = ${includeKeyframes ? "true" : "false"};
      var keyframeLimit = ${keyframeLimit};

      function __codexFindChildProperty(group, matchName, fallbackName) {
        if (!group) return null;
        try {
          var direct = group.property(matchName);
          if (direct) return direct;
        } catch (__directPropertyError) {}
        if (fallbackName) {
          try {
            var fallback = group.property(fallbackName);
            if (fallback) return fallback;
          } catch (__fallbackPropertyError) {}
        }
        try {
          for (var __cp = 1; __cp <= group.numProperties; __cp++) {
            var child = group.property(__cp);
            if (child && (child.matchName === matchName || child.name === fallbackName)) return child;
          }
        } catch (__childPropertyError) {}
        return null;
      }

      function __codexPathGeometryInfo(prop, owningLayer, includeKeys, limit) {
        var info = __codexPropertyInfo(prop, owningLayer, false, false);
        info.geometry = __codexShapeGeometryData(prop.value, 80);
        if (includeKeys) {
          info.keyframes = [];
          var keyCount = 0;
          try { keyCount = prop.numKeys || 0; } catch (__numKeysError) {}
          var maxKeys = Math.min(keyCount, limit);
          for (var __keyIndex = 1; __keyIndex <= maxKeys; __keyIndex++) {
            info.keyframes.push({
              index: __keyIndex,
              time: prop.keyTime(__keyIndex),
              geometry: __codexShapeGeometryData(prop.keyValue(__keyIndex), 80)
            });
          }
          info.keyframesTruncated = keyCount > maxKeys;
        }
        return info;
      }

      function __codexResolvePathTarget() {
        if (expectedLayerName && layer.name !== expectedLayerName) {
          throw new Error("Layer name mismatch. Expected '" + expectedLayerName + "' but found '" + layer.name + "'.");
        }
        if (targetKind === "shape") {
          var shapeProp = __codexResolveProperty(layer, propertyPath);
          if (!shapeProp || shapeProp.matchName !== "ADBE Vector Shape") {
            throw new Error("propertyPath must resolve to an ADBE Vector Shape path property.");
          }
          return { property: shapeProp, mask: null };
        }
        var maskGroup = layer.property("ADBE Mask Parade");
        if (!maskGroup) throw new Error("Layer does not support masks.");
        if (requestedMaskIndex < 1 || requestedMaskIndex > maskGroup.numProperties) throw new Error("maskIndex is outside the layer mask range.");
        var mask = maskGroup.property(requestedMaskIndex);
        if (!mask) throw new Error("Mask not found at maskIndex " + requestedMaskIndex + ".");
        if (expectedMaskName && mask.name !== expectedMaskName) {
          throw new Error("Mask name mismatch. Expected '" + expectedMaskName + "' but found '" + mask.name + "'.");
        }
        var maskShapeProp = __codexFindChildProperty(mask, "ADBE Mask Shape", "Mask Path");
        if (!maskShapeProp) throw new Error("Mask shape property was not found.");
        return { property: maskShapeProp, mask: mask };
      }

      var target = __codexResolvePathTarget();
      var pathGeometry = __codexPathGeometryInfo(target.property, layer, includeKeyframes, keyframeLimit);
      return {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
        layer: __codexLayerInfo(layer),
        targetKind: targetKind,
        mask: target.mask ? { propertyIndex: target.mask.propertyIndex, name: target.mask.name, matchName: target.mask.matchName } : null,
        property: pathGeometry,
        pathGeometry: pathGeometry
      };
    `);
    return ports.toolResult(result.result);
  }

  if (name === "export_path_points") {
    try {
      return ports.toolResult(ports.exportPathPointsFile(args || {}));
    } catch (error) {
      return ports.toolResult(error.message || String(error), true);
    }
  }

  if (name === "export_text_to_file") {
    try {
      return ports.toolResult(ports.exportTextToFile(args || {}));
    } catch (error) {
      return ports.toolResult(error.message || String(error), true);
    }
  }

  if (name === "save_comp_frame_png") {
    try {
      let compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
      const compName = ports.optionalString(args, "compName", "");
      const expectedCompName = ports.optionalString(args, "expectedCompName", "");
      const expectedCompItemId = ports.optionalPositiveInteger(args, "expectedCompItemId");
      const requestedTime = ports.hasArg(args, "time") ? ports.optionalNumber(args, "time", 0) : null;
      const resolutionFactor = ports.optionalResolutionFactor(args, "resolutionFactor") || [1, 1];
      const deleteAfterReadBack = ports.optionalBoolean(args, "deleteAfterReadBack", false);
      const allowOverwrite = ports.optionalBoolean(args, "allowOverwrite", false);
      const output = ports.resolveGeneratedPngExportFile(ports.optionalString(args, "outputFileName", "frame.png"));
      let review=null;
      let reviewContentHash=null;
      let canonicalCapture=null;
      if(args.reviewOwner!==undefined || args.reviewItemId!==undefined){
        review=await ports.requireFreshReviewRecord(args.reviewOwner);
        const item=review.items.find(row=>row.itemId===args.reviewItemId);
        if(!item || deleteAfterReadBack || allowOverwrite || requestedTime!==0 || resolutionFactor[0]!==1 || resolutionFactor[1]!==1)throw ports.placeholderError("review_export_requires_exact_registered_native_frame");
        if (expectedCompItemId !== null && item.itemId !== expectedCompItemId) {
          throw ports.placeholderError("review_export_comp_identity_mismatch");
        }
        compItemIndex=item.itemIndex;
        reviewContentHash=await ports.reviewContentFingerprint(review.record);
        if(review.record.canonicalBinding && ports.montageCaptureService.frameForItem(review.record,args.reviewItemId)){
          if(review.record.images.some(image=>image.itemId===args.reviewItemId))throw ports.placeholderError("root_png_replay_requires_fresh_capture");
          const exportContext=ports.canonicalExportContext(),deps=ports.canonicalCaptureDependencies();
          ports.montageCaptureService.assertOwnerPolicy(review.record,review.state);
          const binding=ports.montageCaptureService.bindingForFrame(review.record,ports.montageCaptureService.frameForItem(review.record,args.reviewItemId));
          const application=deps.readApplication(binding.applicationRunId);
          const targetRead=await ports.montageCaptureService.assertFreshTarget(binding,application,deps);
          const graph=await ports.montageCaptureService.observeGraph(review.record,args.reviewItemId,ports.runExtendScriptBody);
          const validated=ports.montageCaptureService.validateGraph(review.record,args.reviewItemId,graph);
          const fileLedger={bytes:0,requests:0},files=ports.montageCaptureService.readContributingFiles(validated.sourceReferences,application.plan.montagePipeline.readBudgets,fileLedger);
          ports.montageCaptureService.assertMaterialFiles(binding,files);
          ports.montageCaptureService.assertSourceLoadEpochs(files,review.state);
          canonicalCapture={captureId:ports.crypto.randomUUID(),application,binding,targetRead,graph,files,fileLedger,exportContext,
            parts:ports.montageCaptureService.nativeCaptureParts(review.record,args.reviewItemId,graph)};
        }
      } else if (expectedCompItemId !== null) {
        const probe = await ports.runExtendScriptBody(`
          ${resolveCompScript}
          var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
          return { id: comp.id, name: comp.name, duration:comp.duration, frameRate:comp.frameRate, time:comp.time };
        `);
        if (!probe || !probe.result || probe.result.id !== expectedCompItemId) {
          return ports.toolResult(`Composition identity mismatch before export. Expected comp itemId ${expectedCompItemId} but found ${(probe && probe.result && probe.result.id) || "unknown"}.`, true);
        }
        const frameTime=requestedTime===null ? probe.result.time : requestedTime;
        if(!Number.isFinite(frameTime) || frameTime<0 || frameTime>=probe.result.duration || !require("./placeholder-timing").isGridAligned(frameTime,probe.result.frameRate))
          throw ports.placeholderError("stable_comp_png_frame_outside_grid_or_range");
      }
      if(expectedCompItemId!==null && allowOverwrite)throw ports.placeholderError("stable_comp_png_overwrite_requires_fresh_capture");

      if (requestedTime !== null && requestedTime < 0) {
        return ports.toolResult("time must be greater than or equal to 0 seconds.", true);
      }
      if (ports.fs.existsSync(output.resolvedPath)) {
        if (!allowOverwrite) {
          return ports.toolResult("Generated PNG output already exists. Use a unique outputFileName or allowOverwrite:true.", true);
        }
        ports.fs.unlinkSync(output.resolvedPath);
      }
      if(expectedCompItemId===null)ports.fs.mkdirSync(ports.path.dirname(output.resolvedPath), { recursive: true });
      const exportStartedAt = Date.now();

      const result = await ports.runExtendScriptBody(`
        ${resolveCompScript}
        ${review ? ports.placeholderProtection.aeSupportScript : ""}
        ${canonicalCapture ? canonicalCapture.parts.support : ""}
        var comp = ${review ? `__phFindComp(${args.reviewItemId})` : `__codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)})`};
        ${review ? `if(comp.name!==${ports.aeLiteral(review.items.find(row=>row.itemId===args.reviewItemId).name)} || comp.comment!==${ports.aeLiteral(review.record.spec.comment)})throw new Error("review_export_owner_changed");` : ""}
        var expectedCompName = ${ports.aeLiteral(expectedCompName)};
        if (expectedCompName && comp.name !== expectedCompName) {
          throw new Error("Composition name mismatch. Expected '" + expectedCompName + "' but found '" + comp.name + "'.");
        }
        var expectedCompItemId = ${expectedCompItemId === null ? "null" : expectedCompItemId};
        if (expectedCompItemId !== null && comp.id !== expectedCompItemId) {
          throw new Error("Composition identity mismatch. Expected comp itemId " + expectedCompItemId + " but found " + comp.id + ".");
        }
        if (typeof comp.saveFrameToPng !== "function") {
          throw new Error("CompItem.saveFrameToPng is not available in this After Effects host.");
        }

        var requestedTime = ${requestedTime === null ? "null" : JSON.stringify(requestedTime)};
        var saveTime = requestedTime === null ? comp.time : requestedTime;
        if (saveTime < 0 || saveTime > comp.duration) {
          throw new Error("time must be inside the composition duration.");
        }
        if(expectedCompItemId!==null && (saveTime>=comp.duration || Math.abs(saveTime*comp.frameRate-Math.round(saveTime*comp.frameRate))>0.000001))throw new Error("stable_comp_png_frame_outside_grid_or_range");

        var outputFile = new File(${ports.aeLiteral(output.resolvedPath)});
        if(expectedCompItemId!==null) {
          if(outputFile.exists)throw new Error("stable_comp_png_output_exists");
          if(!outputFile.parent || (!outputFile.parent.exists && outputFile.parent.create()!==true))throw new Error("stable_comp_png_output_directory_unavailable");
        }
        var originalResolutionFactor = [comp.resolutionFactor[0], comp.resolutionFactor[1]];
        ${canonicalCapture ? canonicalCapture.parts.before : ""}
        var targetResolutionFactor = ${ports.aeLiteral(resolutionFactor)};
        var restoredResolutionFactor = null;
        var saved = false;
        try {
          comp.resolutionFactor = targetResolutionFactor;
          comp.saveFrameToPng(saveTime, outputFile);
          saved = outputFile.exists === true;
        } finally {
          comp.resolutionFactor = originalResolutionFactor;
          restoredResolutionFactor = [comp.resolutionFactor[0], comp.resolutionFactor[1]];
        }
        ${canonicalCapture ? canonicalCapture.parts.after : ""}

        return {
          ${canonicalCapture ? canonicalCapture.parts.result : ""}
          comp: {
            itemIndex: __codexProjectIndexForItem(comp),
            itemId: comp.id,
            name: comp.name,
            width: comp.width,
            height: comp.height,
            duration: comp.duration,
            frameRate: comp.frameRate,
            time: comp.time,
            numLayers: comp.numLayers
          },
          frame: {
            time: saveTime,
            frameNumber: Math.round(saveTime * comp.frameRate)
          },
          resolutionFactor: {
            before: originalResolutionFactor,
            applied: targetResolutionFactor,
            after: restoredResolutionFactor,
            restored: restoredResolutionFactor[0] === originalResolutionFactor[0] && restoredResolutionFactor[1] === originalResolutionFactor[1]
          },
          postVerification: {
            outputFileExists: outputFile.exists === true,
            resolutionFactorRestored: restoredResolutionFactor[0] === originalResolutionFactor[0] && restoredResolutionFactor[1] === originalResolutionFactor[1]
          }
        };
      `);

      if (result && result.ok === false) {
        return ports.toolResult(result.error || "save_comp_frame_png failed.", true);
      }
      const proof = await ports.waitForCompletePng(output.resolvedPath, {
        timeoutMs: 5000,
        intervalMs: 50,
        stabilityIntervalMs: 50,
        exportDir: ports.GENERATED_EXPORT_DIR,
        minMtimeMs: exportStartedAt
      });
      if (!proof || !proof.ok) {
        return ports.toolResult(`Generated PNG output verification failed: ${(proof && proof.reason) || "incomplete or malformed PNG"}.`, true);
      }

      const bytes = proof.buffer;
      const sha256 = proof.sha256;
      const existsBeforeCleanup = ports.fs.existsSync(output.resolvedPath);

      if (review) {
        const image = { itemId: args.reviewItemId, filePath: output.resolvedPath, sha256, byteLength: bytes.length, contentHash: reviewContentHash };
        const dimensions = ports.placeholderVisualReview.readImage(image, ports.GENERATED_EXPORT_DIR);
        const item = review.items.find(row => row.itemId === args.reviewItemId);
        if (dimensions.width !== item.width || dimensions.height !== item.height) throw ports.placeholderError("review_native_export_dimensions_mismatch");
        const after = await ports.requireFreshReviewRecord(args.reviewOwner);
        if (await ports.reviewContentFingerprint(after.record) !== reviewContentHash) throw ports.placeholderError("review_content_changed_during_capture");
        if(canonicalCapture){
          ports.montageCaptureService.assertOwnerPolicy(after.record,after.state);
          const graphs=result.result?.nativeCaptureGraph;if(!graphs)throw ports.placeholderError("canonical_capture_native_bracket_missing");
          ports.montageCaptureService.assertGraphs(after.record,args.reviewItemId,canonicalCapture.graph,graphs.before);
          ports.montageCaptureService.assertGraphs(after.record,args.reviewItemId,graphs.before,graphs.after);
          const finalGraph=await ports.montageCaptureService.observeGraph(after.record,args.reviewItemId,ports.runExtendScriptBody);
          ports.montageCaptureService.assertGraphs(after.record,args.reviewItemId,graphs.after,finalGraph);
          const validated=ports.montageCaptureService.validateGraph(after.record,args.reviewItemId,finalGraph);
          const afterFiles=ports.montageCaptureService.readContributingFiles(validated.sourceReferences,canonicalCapture.application.plan.montagePipeline.readBudgets,canonicalCapture.fileLedger);
          if(require("./montage-contract").stableJson(afterFiles)!==require("./montage-contract").stableJson(canonicalCapture.files))throw ports.placeholderError("canonical_capture_contributing_files_changed");
          ports.montageCaptureService.assertSourceLoadEpochs(afterFiles,after.state);
          const finalTargetRead=await ports.montageCaptureService.assertFreshTarget(canonicalCapture.binding,canonicalCapture.application,ports.canonicalCaptureDependencies());
          const current=await ports.currentPlaceholderState();ports.montageCaptureService.assertOwnerPolicy(after.record,current.state);
          if(!ports.placeholderSourceRecovery.pathsEqual(current.projectFile,after.projectFile))throw ports.placeholderError("canonical_capture_project_changed");
          image.canonicalCapture={schema:ports.montageCaptureService.CAPTURE_SCHEMA,captureId:canonicalCapture.captureId,owner:after.record.owner,itemId:args.reviewItemId,
            application:canonicalCapture.binding,frame:ports.montageCaptureService.frameForItem(after.record,args.reviewItemId),
            export:{...canonicalCapture.exportContext,commandId:ports.canonicalNativeCommandId(graphs.before.readerId)},
            policy:{original:after.record.canonicalBinding.originalPolicy,before:after.record.capturePolicy,publicationRevision:after.state.revision+1},
            graph:{before:graphs.before,after:graphs.after,final:finalGraph},files:{before:canonicalCapture.files,after:afterFiles},
            targetRead:{before:canonicalCapture.targetRead,after:finalTargetRead},
            png:{sha256,byteLength:bytes.length,width:proof.width,height:proof.height,pngComplete:true},
            resolutionFactor:result.result.resolutionFactor,completeRootRenderState:true,artisticAccepted:false,
            limits:"Full bounded observations bracket native save; undetected external ABA between reads is not excluded by file hashes."};
        }
        ports.projectStateController.addReviewImage(after.projectFile, args.reviewOwner, image, after.state.revision);
      }

      let existsAfter = existsBeforeCleanup;
      if (deleteAfterReadBack) {
        ports.fs.unlinkSync(output.resolvedPath);
        existsAfter = ports.fs.existsSync(output.resolvedPath);
      }

      const payload = result.result || {};
      payload.outputFileName = output.outputFileName;
      payload.outputPath = output.resolvedPath;
      payload.generatedExportDir = ports.GENERATED_EXPORT_DIR;
      payload.file = {
        outputFileName: output.outputFileName,
        outputPath: output.resolvedPath,
        byteLength: bytes.length,
        sha256,
        width: proof.width,
        height: proof.height,
        pngComplete: true,
        existsAfter,
        deletedAfterReadBack: deleteAfterReadBack,
        mimeType: "image/png"
      };
      payload.completeRootRenderState = false;
      payload.rootFreshness = { status: "blocked", code: "unsupported_unknown_render_graph" };
      if(expectedCompItemId!==null)payload.captureBinding={status:"blocked",code:"missing_canonical_unit_material_capture_binding"};
      if (review) {
        payload.reviewOwner = args.reviewOwner;
        payload.reviewItemId = args.reviewItemId;
        if(canonicalCapture){const image=ports.projectStateController.read(review.projectFile).reviewArtifacts[args.reviewOwner].images.find(i=>i.itemId===args.reviewItemId);
          payload.completeRootRenderState=true;payload.rootFreshness={status:"fresh_native_bracket",captureId:image.canonicalCapture.captureId};payload.captureBinding={status:"verified",...image.canonicalCapture};}
      }
      return ports.toolResult(payload);
    } catch (error) {
      return ports.toolResult(error.message || String(error), true);
    }
  }

  if (name === "get_active_comp") {
    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = app.project.activeItem;
      if (!(comp instanceof CompItem)) {
        throw new Error("Active item is not a composition.");
      }
      var selectedLayers = [];
      for (var i = 0; i < comp.selectedLayers.length; i++) {
        selectedLayers.push(__codexLayerInfo(comp.selectedLayers[i]));
      }
      return {
        itemIndex: __codexProjectIndexForItem(comp),
        name: comp.name,
        width: comp.width,
        height: comp.height,
        duration: comp.duration,
        frameRate: comp.frameRate,
        numLayers: comp.numLayers,
        time: comp.time,
        selectedLayers: selectedLayers
      };
    `);
    return ports.toolResult(result.result);
  }

  if (name === "get_selected_layers") {
    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = app.project.activeItem;
      if (!(comp instanceof CompItem)) {
        throw new Error("Active item is not a composition.");
      }
      var layers = [];
      for (var i = 0; i < comp.selectedLayers.length; i++) {
        layers.push(__codexLayerInfo(comp.selectedLayers[i]));
      }
      return {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name,
          time: comp.time,
          numLayers: comp.numLayers
        },
        selectedLayers: layers
      };
    `);
    return ports.toolResult(result.result);
  }

  if (name === "set_layer_selection") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndices = ports.requiredExplicitPositiveIntegerList(args, "layerIndices");
    const makeActive = ports.optionalBoolean(args, "makeActive", true);

    let expectedLayerNames = null;
    if (ports.hasArg(args, "expectedLayerNames")) {
      expectedLayerNames = args.expectedLayerNames;
      if (typeof expectedLayerNames === "string" && expectedLayerNames.trim().startsWith("[")) {
        expectedLayerNames = JSON.parse(expectedLayerNames);
      }
      if (!Array.isArray(expectedLayerNames)) {
        return ports.toolResult("expectedLayerNames must be an array when provided.", true);
      }
      expectedLayerNames = expectedLayerNames.map((value) => String(value));
      if (expectedLayerNames.length !== layerIndices.length) {
        return ports.toolResult("expectedLayerNames must have the same length as layerIndices.", true);
      }
    }

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var requestedLayerIndices = ${ports.aeLiteral(layerIndices)};
      var expectedLayerNames = ${expectedLayerNames ? ports.aeLiteral(expectedLayerNames) : "null"};
      var makeActive = ${makeActive ? "true" : "false"};
      if (makeActive && comp.openInViewer) comp.openInViewer();

      var targetLayers = [];
      for (var __selectionIndex = 0; __selectionIndex < requestedLayerIndices.length; __selectionIndex++) {
        var requestedIndex = requestedLayerIndices[__selectionIndex];
        if (requestedIndex > comp.numLayers) {
          throw new Error("Layer index " + requestedIndex + " is out of range for comp with " + comp.numLayers + " layers.");
        }
        var layer = comp.layer(requestedIndex);
        if (!layer) throw new Error("Layer not found at index " + requestedIndex + ".");
        if (expectedLayerNames && layer.name !== expectedLayerNames[__selectionIndex]) {
          throw new Error("Layer name mismatch at index " + requestedIndex + ". Expected '" + expectedLayerNames[__selectionIndex] + "' but found '" + layer.name + "'.");
        }
        targetLayers.push(layer);
      }

      var selectedBefore = [];
      for (var __beforeIndex = 0; __beforeIndex < comp.selectedLayers.length; __beforeIndex++) {
        selectedBefore.push(__codexLayerInfo(comp.selectedLayers[__beforeIndex]));
      }

      app.beginUndoGroup("Codex Set Layer Selection");
      try {
        for (var __clearIndex = 1; __clearIndex <= comp.numLayers; __clearIndex++) {
          comp.layer(__clearIndex).selected = false;
        }
        for (var __targetIndex = 0; __targetIndex < targetLayers.length; __targetIndex++) {
          targetLayers[__targetIndex].selected = true;
        }
      } finally {
        app.endUndoGroup();
      }

      var selectedAfter = [];
      var selectedIndices = [];
      var selectedNames = [];
      for (var __afterIndex = 0; __afterIndex < comp.selectedLayers.length; __afterIndex++) {
        var selectedLayer = comp.selectedLayers[__afterIndex];
        selectedAfter.push(__codexLayerInfo(selectedLayer));
        selectedIndices.push(selectedLayer.index);
        selectedNames.push(selectedLayer.name);
      }
      var indexMatches = selectedIndices.length === requestedLayerIndices.length;
      for (var __matchIndex = 0; __matchIndex < requestedLayerIndices.length && indexMatches; __matchIndex++) {
        if (selectedIndices[__matchIndex] !== requestedLayerIndices[__matchIndex]) indexMatches = false;
      }
      var nameMatches = true;
      if (expectedLayerNames) {
        nameMatches = selectedNames.length === expectedLayerNames.length;
        for (var __nameIndex = 0; __nameIndex < expectedLayerNames.length && nameMatches; __nameIndex++) {
          if (selectedNames[__nameIndex] !== expectedLayerNames[__nameIndex]) nameMatches = false;
        }
      }

      return {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name,
          time: comp.time,
          numLayers: comp.numLayers
        },
        requestedLayerIndices: requestedLayerIndices,
        expectedLayerNames: expectedLayerNames,
        selectedBefore: selectedBefore,
        selectedLayers: selectedAfter,
        selectedIndices: selectedIndices,
        selectedNames: selectedNames,
        changedCount: selectedAfter.length,
        postVerification: {
          ok: indexMatches && nameMatches,
          requestedCount: requestedLayerIndices.length,
          selectedCount: selectedAfter.length,
          indexMatches: indexMatches,
          nameMatches: nameMatches
        }
      };
    `);
    return ports.toolResult(result.result);
  }

  if (name === "set_layer_parent") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndex = ports.requiredPositiveInteger(args, "layerIndex");
    const parentLayerIndex = ports.requiredPositiveInteger(args, "parentLayerIndex");
    const expectedLayerName = ports.optionalString(args, "expectedLayerName", "");
    const expectedParentName = ports.optionalString(args, "expectedParentName", "");

    if (layerIndex === parentLayerIndex) {
      return ports.toolResult("layerIndex and parentLayerIndex must be different.", true);
    }

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var layerIndex = ${layerIndex};
      var parentLayerIndex = ${parentLayerIndex};
      var expectedLayerName = ${ports.aeLiteral(expectedLayerName)};
      var expectedParentName = ${ports.aeLiteral(expectedParentName)};

      if (layerIndex > comp.numLayers) throw new Error("Layer index " + layerIndex + " is out of range for comp with " + comp.numLayers + " layers.");
      if (parentLayerIndex > comp.numLayers) throw new Error("Parent layer index " + parentLayerIndex + " is out of range for comp with " + comp.numLayers + " layers.");
      var layer = comp.layer(layerIndex);
      var parentLayer = comp.layer(parentLayerIndex);
      if (!layer) throw new Error("Layer not found at index " + layerIndex + ".");
      if (!parentLayer) throw new Error("Parent layer not found at index " + parentLayerIndex + ".");
      if (layer === parentLayer) throw new Error("Layer cannot be parented to itself.");
      if (layer.locked) throw new Error("Layer is locked.");
      if (expectedLayerName && layer.name !== expectedLayerName) {
        throw new Error("Layer name mismatch at index " + layerIndex + ". Expected '" + expectedLayerName + "' but found '" + layer.name + "'.");
      }
      if (expectedParentName && parentLayer.name !== expectedParentName) {
        throw new Error("Parent layer name mismatch at index " + parentLayerIndex + ". Expected '" + expectedParentName + "' but found '" + parentLayer.name + "'.");
      }

      var beforeParent = null;
      try { beforeParent = layer.parent ? __codexLayerInfo(layer.parent) : null; } catch (__beforeParentError) {}

      app.beginUndoGroup("Codex Set Layer Parent");
      try {
        layer.parent = parentLayer;
      } finally {
        app.endUndoGroup();
      }

      var childAfter = __codexLayerInfo(layer);
      var parentAfter = __codexLayerInfo(parentLayer);
      var parentMatches = childAfter.parent && childAfter.parent.index === parentAfter.index && childAfter.parent.name === parentAfter.name;
      return {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name,
          time: comp.time,
          numLayers: comp.numLayers
        },
        layer: childAfter,
        parent: parentAfter,
        beforeParent: beforeParent,
        requestedLayerIndex: layerIndex,
        requestedParentLayerIndex: parentLayerIndex,
        expectedLayerName: expectedLayerName || null,
        expectedParentName: expectedParentName || null,
        postVerification: {
          ok: parentMatches,
          parentMatches: parentMatches,
          childNameMatches: !expectedLayerName || childAfter.name === expectedLayerName,
          parentNameMatches: !expectedParentName || parentAfter.name === expectedParentName
        }
      };
    `);
    return ports.toolResult(result.result);
  }

  if (name === "set_layer_track_matte") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndex = ports.requiredPositiveInteger(args, "layerIndex");
    const matteLayerIndex = ports.requiredPositiveInteger(args, "matteLayerIndex");
    const trackMatteType = ports.optionalString(args, "trackMatteType", "").toLowerCase();
    const expectedLayerName = ports.optionalString(args, "expectedLayerName", "");
    const expectedMatteLayerName = ports.optionalString(args, "expectedMatteLayerName", "");

    const allowedTrackMatteTypes = new Set(["alpha", "alpha_inverted", "luma", "luma_inverted"]);
    if (!allowedTrackMatteTypes.has(trackMatteType)) {
      return ports.toolResult("trackMatteType must be one of: alpha, alpha_inverted, luma, luma_inverted.", true);
    }
    if (layerIndex === matteLayerIndex) {
      return ports.toolResult("layerIndex and matteLayerIndex must be different.", true);
    }

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var layerIndex = ${layerIndex};
      var matteLayerIndex = ${matteLayerIndex};
      var trackMatteTypeName = ${ports.aeLiteral(trackMatteType)};
      var expectedLayerName = ${ports.aeLiteral(expectedLayerName)};
      var expectedMatteLayerName = ${ports.aeLiteral(expectedMatteLayerName)};

      if (layerIndex > comp.numLayers) throw new Error("Layer index " + layerIndex + " is out of range for comp with " + comp.numLayers + " layers.");
      if (matteLayerIndex > comp.numLayers) throw new Error("Matte layer index " + matteLayerIndex + " is out of range for comp with " + comp.numLayers + " layers.");
      var layer = comp.layer(layerIndex);
      var matteLayer = comp.layer(matteLayerIndex);
      if (!layer) throw new Error("Layer not found at index " + layerIndex + ".");
      if (!matteLayer) throw new Error("Matte layer not found at index " + matteLayerIndex + ".");
      if (layer === matteLayer) throw new Error("Layer cannot use itself as a track matte.");
      if (layer.locked) throw new Error("Layer is locked.");
      if (expectedLayerName && layer.name !== expectedLayerName) {
        throw new Error("Layer name mismatch at index " + layerIndex + ". Expected '" + expectedLayerName + "' but found '" + layer.name + "'.");
      }
      if (expectedMatteLayerName && matteLayer.name !== expectedMatteLayerName) {
        throw new Error("Matte layer name mismatch at index " + matteLayerIndex + ". Expected '" + expectedMatteLayerName + "' but found '" + matteLayer.name + "'.");
      }

      var before = __codexLayerInfo(layer);
      var matteBefore = __codexLayerInfo(matteLayer);
      var targetType = __codexTrackMatteTypeValue(trackMatteTypeName);

      app.beginUndoGroup("Codex Set Layer Track Matte");
      try {
        if (typeof layer.setTrackMatte === "function") {
          layer.setTrackMatte(matteLayer, targetType);
        } else {
          if (matteLayer.index !== layer.index - 1) {
            throw new Error("This After Effects version requires the matte layer to be immediately above the fill layer for legacy trackMatteType assignment.");
          }
          layer.trackMatteType = targetType;
        }
      } finally {
        app.endUndoGroup();
      }

      var after = __codexLayerInfo(layer);
      var matteAfter = __codexLayerInfo(matteLayer);
      var afterMatteLayer = after.trackMatteLayer || null;
      var matteLayerMatches = afterMatteLayer && afterMatteLayer.index === matteAfter.index && afterMatteLayer.name === matteAfter.name;
      var typeMatches = after.trackMatteTypeName === trackMatteTypeName;
      var hasTrackMatteMatches = after.hasTrackMatte === true;
      var matteRoleMatches = matteAfter.isTrackMatte === true || matteLayerMatches;
      return {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name,
          time: comp.time,
          numLayers: comp.numLayers
        },
        layer: after,
        matteLayer: matteAfter,
        before: before,
        matteBefore: matteBefore,
        requestedLayerIndex: layerIndex,
        requestedMatteLayerIndex: matteLayerIndex,
        requestedTrackMatteType: trackMatteTypeName,
        expectedLayerName: expectedLayerName || null,
        expectedMatteLayerName: expectedMatteLayerName || null,
        postVerification: {
          ok: hasTrackMatteMatches && matteLayerMatches && typeMatches,
          hasTrackMatteMatches: hasTrackMatteMatches,
          matteLayerMatches: matteLayerMatches,
          trackMatteTypeMatches: typeMatches,
          matteRoleMatches: matteRoleMatches,
          layerNameMatches: !expectedLayerName || after.name === expectedLayerName,
          matteLayerNameMatches: !expectedMatteLayerName || matteAfter.name === expectedMatteLayerName
        }
      };
    `);
    return ports.toolResult(result.result);
  }

  if (name === "get_selected_properties") {
    const includeValues = ports.optionalBoolean(args, "includeValues", true);
    const includeExpressions = ports.optionalBoolean(args, "includeExpressions", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = app.project.activeItem;
      if (!(comp instanceof CompItem)) {
        throw new Error("Active item is not a composition.");
      }
      var includeValues = ${includeValues ? "true" : "false"};
      var includeExpressions = ${includeExpressions ? "true" : "false"};

      var properties = [];
      try {
        if (comp.selectedProperties) {
          for (var i = 0; i < comp.selectedProperties.length; i++) {
            var prop = comp.selectedProperties[i];
            var ownerLayer = null;
            try {
              var parent = prop;
              while (parent && !(parent instanceof Layer)) {
                parent = parent.parentProperty;
              }
              ownerLayer = parent instanceof Layer ? parent : null;
            } catch (__ownerError) {}
            if (!ownerLayer) {
              try {
                for (var layerIndex = 1; layerIndex <= comp.numLayers && !ownerLayer; layerIndex++) {
                  var candidateLayer = comp.layer(layerIndex);
                  var candidateProps = candidateLayer.selectedProperties || [];
                  for (var candidateIndex = 0; candidateIndex < candidateProps.length; candidateIndex++) {
                    if (candidateProps[candidateIndex] === prop) {
                      ownerLayer = candidateLayer;
                      break;
                    }
                  }
                }
              } catch (__ownerScanError) {}
            }
            if (!ownerLayer && comp.selectedLayers && comp.selectedLayers.length === 1) {
              ownerLayer = comp.selectedLayers[0];
            }
            properties.push(__codexPropertyInfo(prop, ownerLayer, includeValues, includeExpressions));
          }
        }
      } catch (__selectedPropertiesError) {}

      if (properties.length === 0) {
        for (var l = 0; l < comp.selectedLayers.length; l++) {
          var layer = comp.selectedLayers[l];
          var selectedProps = layer.selectedProperties || [];
          for (var p = 0; p < selectedProps.length; p++) {
            properties.push(__codexPropertyInfo(selectedProps[p], layer, includeValues, includeExpressions));
          }
        }
      }

      return {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name,
          time: comp.time
        },
        selectedProperties: properties
      };
    `);
    return ports.toolResult(result.result);
  }

  if (name === "find_comps") {
    const query = ports.optionalString(args, "query", "").toLowerCase();
    const limit = Math.max(1, Math.min(250, Math.floor(ports.optionalNumber(args, "limit", 25))));
    const result = await ports.runExtendScriptBody(`
      var query = ${ports.aeLiteral(query)};
      var limit = ${limit};
      var comps = [];
      for (var i = 1; i <= app.project.numItems; i++) {
        var item = app.project.item(i);
        if (item instanceof CompItem && item.name.toLowerCase().indexOf(query) !== -1) {
          comps.push({
            itemIndex: i,
            name: item.name,
            width: item.width,
            height: item.height,
            duration: item.duration,
            frameRate: item.frameRate,
            numLayers: item.numLayers
          });
          if (comps.length >= limit) break;
        }
      }
      return comps;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "create_text_layer") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const text = ports.optionalString(args, "text", "");
    if (!text) return ports.toolResult("text is required.", true);

    const layerName = ports.optionalString(args, "name", "");
    const position = ports.optionalNumberArray(args, "position", null, 2, 3);
    const fontSize = ports.optionalNumber(args, "fontSize", null);
    const fillColor = ports.optionalNumberArray(args, "fillColor", null, 3, 3);
    const justification = ports.optionalTextJustification(args, "justification", null);
    const startTime = ports.optionalNumber(args, "startTime", null);
    const duration = ports.optionalNumber(args, "duration", null);

    if (fontSize !== null && fontSize <= 0) return ports.toolResult("fontSize must be greater than 0.", true);
    if (duration !== null && duration <= 0) return ports.toolResult("duration must be greater than 0.", true);
    if (fillColor && fillColor.some((value) => value < 0 || value > 1)) {
      return ports.toolResult("fillColor values must be between 0 and 1.", true);
    }

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var textValue = ${ports.aeLiteral(text)};
      var layerName = ${ports.aeLiteral(layerName)};
      var requestedPosition = ${position ? ports.aeLiteral(position) : "null"};
      var requestedFontSize = ${fontSize === null ? "null" : fontSize};
      var requestedFillColor = ${fillColor ? ports.aeLiteral(fillColor) : "null"};
      var requestedJustification = ${justification === null ? "null" : ports.aeLiteral(justification)};
      var requestedStartTime = ${startTime === null ? "null" : startTime};
      var requestedDuration = ${duration === null ? "null" : duration};

      app.beginUndoGroup("Codex Create Text Layer");
      var layer = comp.layers.addText(textValue);
      if (layerName) layer.name = layerName;

      var textProp = layer.property("ADBE Text Properties").property("ADBE Text Document");
      var textDocument = textProp.value;
      if (requestedFontSize !== null) textDocument.fontSize = requestedFontSize;
      if (requestedFillColor !== null) {
        textDocument.applyFill = true;
        textDocument.fillColor = requestedFillColor;
      }
      if (requestedJustification !== null) textDocument.justification = __codexTextJustificationValue(requestedJustification);
      textProp.setValue(textDocument);

      var transform = layer.property("ADBE Transform Group");
      var positionProp = transform.property("ADBE Position");
      var finalPosition = requestedPosition || [comp.width / 2, comp.height / 2];
      positionProp.setValue(finalPosition);

      if (requestedStartTime !== null) {
        layer.startTime = requestedStartTime;
        layer.inPoint = requestedStartTime;
      }
      if (requestedDuration !== null) {
        var baseTime = requestedStartTime !== null ? requestedStartTime : layer.inPoint;
        layer.outPoint = Math.min(baseTime + requestedDuration, comp.duration);
      }

      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        layer: __codexLayerInfo(layer),
        text: textValue,
        textDocument: __codexValuePreview(textProp)
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "create_shapes_from_text") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndex = ports.requiredPositiveInteger(args, "layerIndex");
    const expectedLayerName = ports.optionalString(args, "expectedLayerName", "");
    const expectedSourceText = ports.hasArg(args, "expectedSourceText") ? String(args.expectedSourceText) : null;
    const shapeLayerName = ports.optionalString(args, "shapeLayerName", "");
    const lockCreatedShapeLayer = ports.optionalBoolean(args, "lockCreatedShapeLayer", false);
    const makeActive = ports.optionalBoolean(args, "makeActive", true);

    if (compItemIndex === null && !compName) return ports.toolResult("compItemIndex or compName is required for create_shapes_from_text.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var sourceLayerIndex = ${layerIndex};
      var expectedLayerName = ${ports.aeLiteral(expectedLayerName)};
      var expectedSourceText = ${expectedSourceText === null ? "null" : ports.aeLiteral(expectedSourceText)};
      var requestedShapeLayerName = ${ports.aeLiteral(shapeLayerName)};
      var lockCreatedShapeLayer = ${lockCreatedShapeLayer ? "true" : "false"};
      var makeActive = ${makeActive ? "true" : "false"};
      var menuCommandName = "Create Shapes from Text";

      function __codexLayerIdKey(layer) {
        try {
          if (layer && layer.id !== undefined && layer.id !== null) return String(layer.id);
        } catch (__layerIdError) {}
        return null;
      }

      function __codexSelectedLayerRefs(targetComp) {
        var selected = [];
        for (var __s = 0; __s < targetComp.selectedLayers.length; __s++) {
          var item = targetComp.selectedLayers[__s];
          selected.push({ index: item.index, id: __codexLayerIdKey(item), name: item.name });
        }
        return selected;
      }

      function __codexIsTextLayer(layer) {
        if (!layer) return false;
        try { if (layer instanceof TextLayer) return true; } catch (__textLayerClassError) {}
        try { return !!layer.property("ADBE Text Properties").property("ADBE Text Document"); } catch (__textLayerPropError) {}
        return false;
      }

      function __codexIsShapeLayer(layer) {
        if (!layer) return false;
        try { if (layer instanceof ShapeLayer) return true; } catch (__shapeLayerClassError) {}
        try { return layer.matchName === "ADBE Vector Layer" || !!layer.property("ADBE Root Vectors Group"); } catch (__shapeLayerPropError) {}
        return false;
      }

      function __codexSourceTextString(layer) {
        try {
          var textProp = layer.property("ADBE Text Properties").property("ADBE Text Document");
          var doc = textProp.value;
          return doc && doc.text !== undefined && doc.text !== null ? String(doc.text) : "";
        } catch (__sourceTextError) {
          return "";
        }
      }

      function __codexVectorGroupCount(layer) {
        try {
          var root = layer.property("ADBE Root Vectors Group");
          return root ? root.numProperties : 0;
        } catch (__vectorGroupError) {
          return 0;
        }
      }

      function __codexFindLayerById(targetComp, idKey) {
        if (!idKey) return null;
        for (var __l = 1; __l <= targetComp.numLayers; __l++) {
          var candidate = targetComp.layer(__l);
          if (__codexLayerIdKey(candidate) === idKey) return candidate;
        }
        return null;
      }

      var sourceLayer = comp.layer(sourceLayerIndex);
      if (!sourceLayer) throw new Error("Layer not found at index " + sourceLayerIndex + ".");
      if (sourceLayer.locked) throw new Error("Source text layer is locked.");
      if (!__codexIsTextLayer(sourceLayer)) throw new Error("Layer at index " + sourceLayerIndex + " is not a text layer.");
      if (expectedLayerName && sourceLayer.name !== expectedLayerName) {
        throw new Error("Source layer name mismatch. Expected '" + expectedLayerName + "' but found '" + sourceLayer.name + "'.");
      }
      var sourceTextBefore = __codexSourceTextString(sourceLayer);
      if (expectedSourceText !== null && sourceTextBefore !== expectedSourceText) {
        throw new Error("Source Text mismatch. Expected '" + expectedSourceText + "' but found '" + sourceTextBefore + "'.");
      }

      var commandId = app.findMenuCommandId(menuCommandName);
      if (!commandId) {
        throw new Error("AE menu command not available: " + menuCommandName + ".");
      }

      var beforeLayerCount = comp.numLayers;
      var beforeIds = {};
      for (var __before = 1; __before <= comp.numLayers; __before++) {
        var beforeLayer = comp.layer(__before);
        var beforeId = __codexLayerIdKey(beforeLayer);
        if (beforeId) beforeIds[beforeId] = true;
      }
      var sourceLayerId = __codexLayerIdKey(sourceLayer);
      var selectedBefore = __codexSelectedLayerRefs(comp);
      var response = null;

      app.beginUndoGroup("Codex Create Shapes From Text");
      try {
        if (makeActive && comp.openInViewer) comp.openInViewer();
        for (var __clear = 1; __clear <= comp.numLayers; __clear++) {
          comp.layer(__clear).selected = false;
        }
        sourceLayer.selected = true;
        app.executeCommand(commandId);

        var createdLayers = [];
        for (var __after = 1; __after <= comp.numLayers; __after++) {
          var afterLayer = comp.layer(__after);
          var afterId = __codexLayerIdKey(afterLayer);
          if (afterId && !beforeIds[afterId]) createdLayers.push(afterLayer);
        }
        if (!createdLayers.length && comp.numLayers > beforeLayerCount) {
          for (var __delta = 1; __delta <= comp.numLayers - beforeLayerCount; __delta++) {
            createdLayers.push(comp.layer(__delta));
          }
        }

        var createdShapeLayer = null;
        for (var __created = 0; __created < createdLayers.length; __created++) {
          if (__codexIsShapeLayer(createdLayers[__created])) {
            createdShapeLayer = createdLayers[__created];
            break;
          }
        }
        if (!createdShapeLayer) {
          throw new Error("Create Shapes from Text did not produce a detectable shape layer.");
        }
        if (requestedShapeLayerName) createdShapeLayer.name = requestedShapeLayerName;
        if (lockCreatedShapeLayer) createdShapeLayer.locked = true;

        var sourceAfter = __codexFindLayerById(comp, sourceLayerId);
        if (!sourceAfter && expectedLayerName) {
          for (var __sourceSearch = 1; __sourceSearch <= comp.numLayers; __sourceSearch++) {
            var sourceCandidate = comp.layer(__sourceSearch);
            if (sourceCandidate.name === expectedLayerName && __codexIsTextLayer(sourceCandidate)) {
              sourceAfter = sourceCandidate;
              break;
            }
          }
        }
        var selectedAfter = __codexSelectedLayerRefs(comp);
        var outlineGroupCount = __codexVectorGroupCount(createdShapeLayer);

        response = {
          comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name, numLayers: comp.numLayers },
          menuCommand: { name: menuCommandName, id: commandId },
          sourceLayerBefore: {
            index: sourceLayerIndex,
            id: sourceLayerId,
            name: expectedLayerName || sourceLayer.name,
            text: sourceTextBefore
          },
          sourceLayerAfter: sourceAfter ? __codexLayerInfo(sourceAfter) : null,
          shapeLayer: __codexLayerInfo(createdShapeLayer),
          outline: { vectorGroupCount: outlineGroupCount },
          selectedBefore: selectedBefore,
          selectedAfter: selectedAfter,
          layerCountBefore: beforeLayerCount,
          layerCountAfter: comp.numLayers,
          createdLayerCount: createdLayers.length,
          postVerification: {
            ok: __codexIsShapeLayer(createdShapeLayer) && outlineGroupCount > 0 && comp.numLayers > beforeLayerCount,
            createdShapeLayer: __codexIsShapeLayer(createdShapeLayer),
            outlineGroupCount: outlineGroupCount,
            layerCountDelta: comp.numLayers - beforeLayerCount,
            sourceTextMatched: expectedSourceText === null || sourceTextBefore === expectedSourceText,
            sourceNameMatched: !expectedLayerName || (sourceAfter && sourceAfter.name === expectedLayerName) || sourceLayer.name === expectedLayerName
          }
        };
      } finally {
        app.endUndoGroup();
      }
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "import_footage") {
    let resolved;
    try {
      resolved = ports.resolveExistingFile(args.filePath);
    } catch (error) {
      return ports.toolResult(error.message, true);
    }

    const itemName = ports.optionalString(args, "name", "");
    const sequence = ports.optionalBoolean(args, "sequence", false);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var importPath = ${ports.aeLiteral(resolved.resolvedPath)};
      var requestedName = ${ports.aeLiteral(itemName)};
      var importAsSequence = ${sequence ? "true" : "false"};
      var file = new File(importPath);
      if (!file.exists) throw new Error("Footage file does not exist: " + importPath);

      var options = new ImportOptions(file);
      options.sequence = importAsSequence;
      if (!options.canImportAs(ImportAsType.FOOTAGE)) {
        throw new Error("File cannot be imported as footage: " + importPath);
      }
      options.importAs = ImportAsType.FOOTAGE;

      app.beginUndoGroup("Codex Import Footage");
      var item = app.project.importFile(options);
      if (requestedName) item.name = requestedName;

      var response = {
        item: __codexItemReference(item),
        footage: {
          file: item.file ? item.file.fsName : importPath,
          width: item.width || null,
          height: item.height || null,
          duration: item.duration || null,
          frameRate: item.frameRate || null,
          hasAudio: item.hasAudio || false,
          hasVideo: item.hasVideo || false
        },
        sequence: importAsSequence
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "relink_footage_source") {
    const itemId = ports.requiredPositiveInteger(args, "itemId");
    const itemIndex = ports.optionalPositiveInteger(args, "itemIndex");
    const expectedName = ports.optionalString(args, "expectedName", "");
    const expectedPreviousFilePath = ports.optionalString(args, "expectedPreviousFilePath", "");
    const filePath = ports.optionalString(args, "filePath", "");
    if (!expectedName) return ports.toolResult("expectedName is required.", true);
    if (!expectedPreviousFilePath) return ports.toolResult("expectedPreviousFilePath is required.", true);
    if (!filePath) return ports.toolResult("filePath is required.", true);

    let resolved;
    try {
      resolved = ports.resolveExistingFile(filePath);
    } catch (error) {
      return ports.toolResult(error.message, true);
    }

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var targetItemId = ${itemId};
      var itemIndexHint = ${itemIndex === null ? "null" : itemIndex};
      var expectedName = ${ports.aeLiteral(expectedName)};
      var expectedPreviousFilePath = ${ports.aeLiteral(expectedPreviousFilePath)};
      var targetFilePath = ${ports.aeLiteral(resolved.resolvedPath)};

      var item = null;
      if (itemIndexHint !== null && itemIndexHint >= 1 && itemIndexHint <= app.project.numItems) {
        var candidate = app.project.item(itemIndexHint);
        if (candidate && candidate.id === targetItemId) {
          item = candidate;
        }
      }
      if (!item) {
        for (var __i = 1; __i <= app.project.numItems; __i++) {
          var cur = app.project.item(__i);
          if (cur && cur.id === targetItemId) {
            item = cur;
            break;
          }
        }
      }
      if (!item) throw new Error("Project item not found with id " + targetItemId + ".");
      if (!(item instanceof FootageItem)) throw new Error("Project item is not a FootageItem.");
      if (item.footageMissing !== true) throw new Error("Project item is not missing footage: expected footageMissing === true.");

      if (expectedName && item.name !== expectedName) {
        throw new Error("Footage item name mismatch. Expected '" + expectedName + "' but found '" + item.name + "'.");
      }
      var currentFile = item.file || (item.mainSource && item.mainSource.file ? item.mainSource.file : null);
      if (expectedPreviousFilePath) {
        if (!currentFile || !currentFile.fsName) {
          throw new Error("Previous file path is unavailable on footage item to verify expectedPreviousFilePath.");
        }
        var prevNorm = String(currentFile.fsName).replace(/\\\\/g, "/").toLowerCase();
        var expNorm = String(expectedPreviousFilePath).replace(/\\\\/g, "/").toLowerCase();
        if (prevNorm !== expNorm) {
          throw new Error("Previous file path mismatch. Expected '" + expectedPreviousFilePath + "' but found '" + currentFile.fsName + "'.");
        }
      }

      var replacementFile = new File(targetFilePath);
      if (!replacementFile.exists) {
        throw new Error("Replacement file does not exist on disk: " + targetFilePath);
      }

      var beforeFile = currentFile && currentFile.fsName ? currentFile.fsName : (item.file ? item.file.fsName : null);
      var beforeMissing = item.footageMissing;
      var afterFile = null;
      var afterMissing = true;

      app.beginUndoGroup("Codex Relink Footage Source");
      try {
        item.replace(replacementFile);
        afterFile = item.file ? item.file.fsName : null;
        afterMissing = item.footageMissing;
      } finally {
        app.endUndoGroup();
      }

      var afterRef = __codexItemReference(item);
      var afterNorm = afterFile ? String(afterFile).replace(/\\\\/g, "/").toLowerCase() : "";
      var targetNorm = String(targetFilePath).replace(/\\\\/g, "/").toLowerCase();
      var fileMatches = afterNorm === targetNorm;
      var itemIdMatches = item.id === targetItemId;

      return {
        item: afterRef,
        itemId: item.id,
        itemIndex: __codexProjectIndexForItem(item),
        before: { file: beforeFile, footageMissing: beforeMissing },
        after: { file: afterFile, footageMissing: afterMissing },
        postVerification: {
          ok: afterMissing === false && fileMatches && itemIdMatches,
          footageMissing: afterMissing,
          fileMatches: fileMatches,
          itemIdMatches: itemIdMatches
        }
      };
    `);
    return ports.toolResult(result.result);
  }

  if (name === "create_solid_layer") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerName = ports.optionalString(args, "name", "Codex Solid");
    const color = ports.optionalNumberArray(args, "color", [0, 0, 0], 3, 3);
    const width = ports.optionalNumber(args, "width", null);
    const height = ports.optionalNumber(args, "height", null);
    const pixelAspect = ports.optionalNumber(args, "pixelAspect", null);
    const startTime = ports.optionalNumber(args, "startTime", null);
    const duration = ports.optionalNumber(args, "duration", null);
    const insertBeforeLayerIndex = ports.optionalPositiveInteger(args, "insertBeforeLayerIndex");
    const expectedBeforeLayerName = ports.optionalString(args, "expectedBeforeLayerName", "");

    if (color.some((value) => value < 0 || value > 1)) return ports.toolResult("color values must be between 0 and 1.", true);
    if (width !== null && width <= 0) return ports.toolResult("width must be greater than 0.", true);
    if (height !== null && height <= 0) return ports.toolResult("height must be greater than 0.", true);
    if (pixelAspect !== null && pixelAspect <= 0) return ports.toolResult("pixelAspect must be greater than 0.", true);
    if (duration !== null && duration <= 0) return ports.toolResult("duration must be greater than 0.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var layerName = ${ports.aeLiteral(layerName)};
      var color = ${ports.aeLiteral(color)};
      var width = ${width === null ? "comp.width" : width};
      var height = ${height === null ? "comp.height" : height};
      var pixelAspect = ${pixelAspect === null ? "comp.pixelAspect" : pixelAspect};
      var requestedStartTime = ${startTime === null ? "null" : startTime};
      var requestedDuration = ${duration === null ? "comp.duration" : duration};

      app.beginUndoGroup("Codex Create Solid Layer");
      var layer = comp.layers.addSolid(color, layerName, width, height, pixelAspect, requestedDuration);
      if (requestedStartTime !== null) {
        layer.startTime = requestedStartTime;
        layer.inPoint = requestedStartTime;
      }
      if (requestedDuration !== null) {
        var baseTime = requestedStartTime !== null ? requestedStartTime : layer.inPoint;
        layer.outPoint = Math.min(baseTime + requestedDuration, comp.duration);
      }
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        layer: __codexLayerInfo(layer),
        solid: {
          color: color,
          width: width,
          height: height,
          pixelAspect: pixelAspect
        }
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "create_null_layer") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerName = ports.optionalString(args, "name", "Codex Null");
    const startTime = ports.optionalNumber(args, "startTime", null);
    const duration = ports.optionalNumber(args, "duration", null);

    if (duration !== null && duration <= 0) return ports.toolResult("duration must be greater than 0.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var layerName = ${ports.aeLiteral(layerName)};
      var requestedStartTime = ${startTime === null ? "null" : startTime};
      var requestedDuration = ${duration === null ? "comp.duration" : duration};

      app.beginUndoGroup("Codex Create Null Layer");
      var layer = comp.layers.addNull(requestedDuration);
      if (layerName) {
        layer.name = layerName;
        try { if (layer.source) layer.source.name = layerName; } catch (__sourceNameError) {}
      }
      if (requestedStartTime !== null) {
        layer.startTime = requestedStartTime;
        layer.inPoint = requestedStartTime;
      }
      if (requestedDuration !== null) {
        var baseTime = requestedStartTime !== null ? requestedStartTime : layer.inPoint;
        layer.outPoint = Math.min(baseTime + requestedDuration, comp.duration);
      }
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        layer: __codexLayerInfo(layer)
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "create_adjustment_layer") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerName = ports.optionalString(args, "name", "Codex Adjustment");
    const color = ports.optionalNumberArray(args, "color", [1, 1, 1], 3, 3);
    const width = ports.optionalNumber(args, "width", null);
    const height = ports.optionalNumber(args, "height", null);
    const pixelAspect = ports.optionalNumber(args, "pixelAspect", null);
    const startTime = ports.optionalNumber(args, "startTime", null);
    const duration = ports.optionalNumber(args, "duration", null);

    if (color.some((value) => value < 0 || value > 1)) return ports.toolResult("color values must be between 0 and 1.", true);
    if (width !== null && width <= 0) return ports.toolResult("width must be greater than 0.", true);
    if (height !== null && height <= 0) return ports.toolResult("height must be greater than 0.", true);
    if (pixelAspect !== null && pixelAspect <= 0) return ports.toolResult("pixelAspect must be greater than 0.", true);
    if (duration !== null && duration <= 0) return ports.toolResult("duration must be greater than 0.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var layerName = ${ports.aeLiteral(layerName)};
      var color = ${ports.aeLiteral(color)};
      var width = ${width === null ? "comp.width" : width};
      var height = ${height === null ? "comp.height" : height};
      var pixelAspect = ${pixelAspect === null ? "comp.pixelAspect" : pixelAspect};
      var requestedStartTime = ${startTime === null ? "null" : startTime};
      var requestedDuration = ${duration === null ? "comp.duration" : duration};
      var insertBeforeLayerIndex = ${ports.insertBeforeLayerIndex === null ? "null" : ports.insertBeforeLayerIndex};
      var expectedBeforeLayerName = ${ports.aeLiteral(ports.expectedBeforeLayerName)};
      var beforeLayer = null;
      var beforeLayerBeforeMove = null;
      if (insertBeforeLayerIndex !== null) {
        if (insertBeforeLayerIndex < 1 || insertBeforeLayerIndex > comp.numLayers) {
          throw new Error("insertBeforeLayerIndex does not identify a layer in the target comp.");
        }
        beforeLayer = comp.layer(insertBeforeLayerIndex);
        if (expectedBeforeLayerName && beforeLayer.name !== expectedBeforeLayerName) {
          throw new Error("expectedBeforeLayerName mismatch for insertBeforeLayerIndex.");
        }
        beforeLayerBeforeMove = __codexLayerInfo(beforeLayer);
      }

      app.beginUndoGroup("Codex Create Adjustment Layer");
      var layer = comp.layers.addSolid(color, layerName, width, height, pixelAspect, requestedDuration);
      layer.adjustmentLayer = true;
      if (requestedStartTime !== null) {
        layer.startTime = requestedStartTime;
        layer.inPoint = requestedStartTime;
      }
      if (requestedDuration !== null) {
        var baseTime = requestedStartTime !== null ? requestedStartTime : layer.inPoint;
        layer.outPoint = Math.min(baseTime + requestedDuration, comp.duration);
      }
      if (beforeLayer !== null) {
        layer.moveBefore(beforeLayer);
      }
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        layer: __codexLayerInfo(layer),
        placement: {
          insertBeforeLayerIndex: insertBeforeLayerIndex,
          expectedBeforeLayerName: expectedBeforeLayerName,
          beforeLayerBeforeMove: beforeLayerBeforeMove,
          beforeLayerAfterMove: beforeLayer !== null ? __codexLayerInfo(beforeLayer) : null,
          immediatelyBefore: beforeLayer !== null ? (layer.index + 1 === beforeLayer.index) : null
        },
        solid: {
          color: color,
          width: width,
          height: height,
          pixelAspect: pixelAspect
        }
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "create_camera_layer") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerName = ports.optionalString(args, "name", "Codex Camera");
    const pointOfInterest = ports.optionalNumberArray(args, "pointOfInterest", null, 2, 3);
    const position = ports.optionalNumberArray(args, "position", null, 3, 3);
    const zoom = ports.optionalNumber(args, "zoom", null);
    const startTime = ports.optionalNumber(args, "startTime", null);
    const duration = ports.optionalNumber(args, "duration", null);
    const coordinateLimit = 1000000;

    if (pointOfInterest && pointOfInterest.some((value) => Math.abs(value) > coordinateLimit)) {
      return ports.toolResult("pointOfInterest values must be between -1000000 and 1000000.", true);
    }
    if (position && position.some((value) => Math.abs(value) > coordinateLimit)) {
      return ports.toolResult("position values must be between -1000000 and 1000000.", true);
    }
    if (zoom !== null && zoom <= 0) return ports.toolResult("zoom must be greater than 0.", true);
    if (duration !== null && duration <= 0) return ports.toolResult("duration must be greater than 0.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var layerName = ${ports.aeLiteral(layerName)};
      var requestedPointOfInterest = ${pointOfInterest ? ports.aeLiteral(pointOfInterest) : "null"};
      var requestedPosition = ${position ? ports.aeLiteral(position) : "null"};
      var requestedZoom = ${zoom === null ? "null" : zoom};
      var requestedStartTime = ${startTime === null ? "null" : startTime};
      var requestedDuration = ${duration === null ? "null" : duration};

      function __codexCameraPoint3(value) {
        if (!value) return null;
        return value.length >= 3 ? value : [value[0], value[1], 0];
      }

      function __codexReadValue(prop) {
        try {
          if (!prop) return null;
          var value = prop.value;
          if (value instanceof Array) {
            var copy = [];
            for (var __v = 0; __v < value.length; __v++) copy.push(value[__v]);
            return copy;
          }
          return value;
        } catch (__readValueError) {
          return null;
        }
      }

      app.beginUndoGroup("Codex Create Camera Layer");
      var centerPoint = requestedPointOfInterest ? [requestedPointOfInterest[0], requestedPointOfInterest[1]] : [comp.width / 2, comp.height / 2];
      var layer = comp.layers.addCamera(layerName || "Codex Camera", centerPoint);
      if (layerName) layer.name = layerName;

      var transform = layer.property("ADBE Transform Group");
      if (requestedPointOfInterest !== null) {
        var pointProp = transform.property("ADBE Point of Interest") || transform.property("ADBE Anchor Point");
        if (pointProp) pointProp.setValue(__codexCameraPoint3(requestedPointOfInterest));
      }
      if (requestedPosition !== null) transform.property("ADBE Position").setValue(requestedPosition);

      var cameraOptions = layer.property("ADBE Camera Options Group");
      if (requestedZoom !== null && cameraOptions) {
        var zoomProp = cameraOptions.property("ADBE Camera Zoom");
        if (zoomProp) zoomProp.setValue(requestedZoom);
      }
      if (requestedStartTime !== null) {
        layer.startTime = requestedStartTime;
        layer.inPoint = requestedStartTime;
      }
      if (requestedDuration !== null) {
        var baseTime = requestedStartTime !== null ? requestedStartTime : layer.inPoint;
        layer.outPoint = Math.min(baseTime + requestedDuration, comp.duration);
      }
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        layer: __codexLayerInfo(layer),
        camera: {
          pointOfInterest: transform ? __codexReadValue(transform.property("ADBE Point of Interest") || transform.property("ADBE Anchor Point")) : null,
          position: transform ? __codexReadValue(transform.property("ADBE Position")) : null,
          zoom: cameraOptions ? __codexReadValue(cameraOptions.property("ADBE Camera Zoom")) : null
        }
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "create_camera_with_controller") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const cameraName = ports.optionalString(args, "cameraName", "Camera 1");
    const controllerName = ports.optionalString(args, "controllerName", "Camera Controller");
    const pointOfInterest = ports.optionalNumberArray(args, "pointOfInterest", null, 2, 3);
    const cameraPosition = ports.optionalNumberArray(args, "cameraPosition", null, 3, 3);
    const zoom = ports.optionalNumber(args, "zoom", null);
    const startTime = ports.optionalNumber(args, "startTime", null);
    const duration = ports.optionalNumber(args, "duration", null);
    const separateControllerPositionDimensions = ports.optionalBoolean(args, "separateControllerPositionDimensions", true);
    const coordinateLimit = 1000000;

    if (pointOfInterest && pointOfInterest.some((value) => Math.abs(value) > coordinateLimit)) {
      return ports.toolResult("pointOfInterest values must be between -1000000 and 1000000.", true);
    }
    if (cameraPosition && cameraPosition.some((value) => Math.abs(value) > coordinateLimit)) {
      return ports.toolResult("cameraPosition values must be between -1000000 and 1000000.", true);
    }
    if (zoom !== null && zoom <= 0) return ports.toolResult("zoom must be greater than 0.", true);
    if (duration !== null && duration <= 0) return ports.toolResult("duration must be greater than 0.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var cameraName = ${ports.aeLiteral(cameraName)};
      var controllerName = ${ports.aeLiteral(controllerName)};
      var requestedPointOfInterest = ${pointOfInterest ? ports.aeLiteral(pointOfInterest) : "null"};
      var requestedCameraPosition = ${cameraPosition ? ports.aeLiteral(cameraPosition) : "null"};
      var requestedZoom = ${zoom === null ? "null" : zoom};
      var requestedStartTime = ${startTime === null ? "null" : startTime};
      var requestedDuration = ${duration === null ? "comp.duration" : duration};
      var shouldSeparateControllerPosition = ${separateControllerPositionDimensions ? "true" : "false"};

      function __codexCameraPoint3(value) {
        if (!value) return null;
        return value.length >= 3 ? value : [value[0], value[1], 0];
      }

      function __codexReadRawValue(prop) {
        try {
          if (!prop) return null;
          return __codexValueData(prop.value);
        } catch (__readRawValueError) {
          return null;
        }
      }

      function __codexApplyLayerTiming(layer) {
        if (requestedStartTime !== null) {
          layer.startTime = requestedStartTime;
          layer.inPoint = requestedStartTime;
        }
        if (requestedDuration !== null) {
          var baseTime = requestedStartTime !== null ? requestedStartTime : layer.inPoint;
          layer.outPoint = Math.min(baseTime + requestedDuration, comp.duration);
        }
      }

      app.beginUndoGroup("Codex Create Camera With Controller");
      var centerPoint = requestedPointOfInterest ? [requestedPointOfInterest[0], requestedPointOfInterest[1]] : [comp.width / 2, comp.height / 2];
      var cameraLayer = comp.layers.addCamera(cameraName || "Camera 1", centerPoint);
      var controllerLayer = comp.layers.addNull(requestedDuration || comp.duration);
      if (cameraName) cameraLayer.name = cameraName;
      if (controllerName) {
        controllerLayer.name = controllerName;
        try { if (controllerLayer.source) controllerLayer.source.name = controllerName; } catch (__controllerSourceNameError) {}
      }
      controllerLayer.threeDLayer = true;
      cameraLayer.parent = controllerLayer;

      var cameraTransform = cameraLayer.property("ADBE Transform Group");
      var controllerTransform = controllerLayer.property("ADBE Transform Group");
      var cameraPosition = requestedCameraPosition || [0, 0, (comp.width / 0.72) * -1];
      if (requestedPointOfInterest !== null) {
        var pointProp = cameraTransform.property("ADBE Point of Interest") || cameraTransform.property("ADBE Anchor Point");
        if (pointProp) pointProp.setValue(__codexCameraPoint3(requestedPointOfInterest));
      }
      cameraTransform.property("ADBE Position").setValue(cameraPosition);
      if (shouldSeparateControllerPosition && controllerTransform) {
        var controllerPosition = controllerTransform.property("ADBE Position");
        if (controllerPosition) {
          try { controllerPosition.dimensionsSeparated = true; } catch (__separateControllerPositionError) {}
        }
      }
      var cameraOptions = cameraLayer.property("ADBE Camera Options Group");
      if (requestedZoom !== null && cameraOptions) {
        var zoomProp = cameraOptions.property("ADBE Camera Zoom");
        if (zoomProp) zoomProp.setValue(requestedZoom);
      }
      __codexApplyLayerTiming(cameraLayer);
      __codexApplyLayerTiming(controllerLayer);

      var controllerPositionProp = controllerTransform ? controllerTransform.property("ADBE Position") : null;
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
        cameraLayer: __codexLayerInfo(cameraLayer),
        controllerLayer: __codexLayerInfo(controllerLayer),
        camera: {
          pointOfInterest: cameraTransform ? __codexReadRawValue(cameraTransform.property("ADBE Point of Interest") || cameraTransform.property("ADBE Anchor Point")) : null,
          position: cameraTransform ? __codexReadRawValue(cameraTransform.property("ADBE Position")) : null,
          zoom: cameraOptions ? __codexReadRawValue(cameraOptions.property("ADBE Camera Zoom")) : null
        },
        controller: {
          threeDLayer: controllerLayer.threeDLayer === true,
          positionDimensionsSeparated: controllerPositionProp ? controllerPositionProp.dimensionsSeparated === true : false
        }
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "toggle_onion_skinning") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const mode = ports.optionalString(args, "mode", "toggle");
    const layerName = ports.optionalString(args, "layerName", "Onion Skin");
    const effectName = ports.optionalString(args, "effectName", "Onion Skin");

    if (!["enable", "disable", "toggle"].includes(mode)) return ports.toolResult("mode must be one of: enable, disable, toggle.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var mode = ${ports.aeLiteral(mode)};
      var layerName = ${ports.aeLiteral(layerName)};
      var effectName = ${ports.aeLiteral(effectName)};
      var token = "*onion-skinning*";

      function __codexFindOnionLayer() {
        for (var __l = 1; __l <= comp.numLayers; __l++) {
          var candidate = comp.layer(__l);
          if (!candidate || candidate.name !== layerName) continue;
          try {
            var parade = candidate.property("ADBE Effect Parade");
            if (parade && (parade.property(effectName) || parade.property("CC Wide Time"))) return candidate;
          } catch (__findEffectError) {}
        }
        return null;
      }

      function __codexDisableOnion() {
        var removed = [];
        var comment = comp.comment || "";
        var parts = comment.split(token);
        comp.comment = parts[0] || "";
        if (parts.length > 1) {
          var id = Number(parts[1]);
          if (id) {
            try {
              var item = app.project.itemByID(id);
              if (item !== null) {
                removed.push(__codexItemReference(item));
                item.remove();
              }
            } catch (__removeSourceError) {}
          }
        }
        var layer = __codexFindOnionLayer();
        if (layer) {
          removed.push(__codexLayerInfo(layer));
          layer.remove();
        }
        return removed;
      }

      app.beginUndoGroup("Codex Toggle Onion Skinning");
      var wasEnabled = String(comp.comment || "").indexOf(token) >= 0 || __codexFindOnionLayer() !== null;
      var shouldEnable = mode === "enable" || (mode === "toggle" && !wasEnabled);
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
        previousEnabled: wasEnabled,
        enabled: false,
        mode: shouldEnable ? "enable" : "disable",
        removed: []
      };

      if (shouldEnable) {
        if (wasEnabled) __codexDisableOnion();
        var layer = comp.layers.addSolid([0, 0, 0], layerName || "Onion Skin", comp.width, comp.height, comp.pixelAspect, comp.duration);
        layer.adjustmentLayer = true;
        try { layer.label = 0; } catch (__labelError) {}
        try { layer.moveToBeginning(); } catch (__moveError) {}
        var sourceId = null;
        try { sourceId = layer.source.id; } catch (__sourceIdError) {}
        comp.comment = String(comp.comment || "") + token + String(sourceId || "");
        var effectGroup = layer.property("ADBE Effect Parade");
        if (!effectGroup) throw new Error("Onion skin layer cannot receive effects.");
        var effect = effectGroup.addProperty("CC Wide Time");
        if (!effect) throw new Error("Could not add CC Wide Time.");
        if (effectName) effect.name = effectName;
        response.enabled = true;
        response.layer = __codexLayerInfo(layer);
        response.effect = __codexPropertyInfo(effect, layer, false, true);
        response.properties = __codexEffectProperties(effect, layer, true, true);
        response.comp.comment = comp.comment || "";
      } else {
        response.removed = __codexDisableOnion();
        response.enabled = false;
        response.comp.comment = comp.comment || "";
      }
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "add_project_item_to_comp") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const itemIndex = ports.optionalPositiveInteger(args, "itemIndex");
    const itemName = ports.optionalString(args, "itemName", "");
    const itemType = ports.optionalString(args, "itemType", "");
    const layerName = ports.optionalString(args, "name", "");
    const position = ports.optionalNumberArray(args, "position", null, 2, 3);
    const scale = ports.optionalNumberArray(args, "scale", null, 2, 3);
    const startTime = ports.optionalNumber(args, "startTime", null);
    const duration = ports.optionalNumber(args, "duration", null);

    if (!itemIndex && !itemName) return ports.toolResult("Provide itemIndex or itemName.", true);
    if (itemType && !["comp", "footage"].includes(itemType)) return ports.toolResult("itemType must be one of: comp, footage.", true);
    if (duration !== null && duration <= 0) return ports.toolResult("duration must be greater than 0.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var item = __codexResolveProjectItem(${itemIndex === null ? "null" : itemIndex}, ${ports.aeLiteral(itemName)}, ${ports.aeLiteral(itemType)});
      if (!(item instanceof FootageItem) && !(item instanceof CompItem)) {
        throw new Error("Project item must be footage or a composition.");
      }
      if (item === comp) {
        throw new Error("Cannot add a composition to itself.");
      }
      var layerName = ${ports.aeLiteral(layerName)};
      var positionValue = ${position ? ports.aeLiteral(position) : "null"};
      var scaleValue = ${scale ? ports.aeLiteral(scale) : "null"};
      var requestedStartTime = ${startTime === null ? "null" : startTime};
      var requestedDuration = ${duration === null ? "null" : duration};

      app.beginUndoGroup("Codex Add Project Item To Comp");
      var layer = requestedDuration !== null ? comp.layers.add(item, requestedDuration) : comp.layers.add(item);
      if (layerName) layer.name = layerName;
      if (requestedStartTime !== null) {
        layer.startTime = requestedStartTime;
        layer.inPoint = requestedStartTime;
      }
      if (requestedDuration !== null) {
        var baseTime = requestedStartTime !== null ? requestedStartTime : layer.inPoint;
        layer.outPoint = Math.min(baseTime + requestedDuration, comp.duration);
      }
      var transform = layer.property("ADBE Transform Group");
      if (positionValue !== null) transform.property("ADBE Position").setValue(positionValue);
      if (scaleValue !== null) transform.property("ADBE Scale").setValue(scaleValue);
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        sourceItem: __codexItemReference(item),
        layer: __codexLayerInfo(layer)
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "duplicate_comp") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const sourceCompName = ports.optionalString(args, "compName", "");
    const compName = ports.optionalString(args, "name", "");
    const openInViewer = ports.optionalBoolean(args, "openInViewer", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(sourceCompName)});
      var requestedName = ${ports.aeLiteral(compName)};
      var openInViewer = ${openInViewer ? "true" : "false"};

      app.beginUndoGroup("Codex Duplicate Comp");
      var duplicate = comp.duplicate();
      if (requestedName) duplicate.name = requestedName;
      if (openInViewer) duplicate.openInViewer();
      var response = {
        source: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        duplicate: {
          itemIndex: __codexProjectIndexForItem(duplicate),
          name: duplicate.name,
          width: duplicate.width,
          height: duplicate.height,
          duration: duplicate.duration,
          frameRate: duplicate.frameRate,
          numLayers: duplicate.numLayers
        }
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "duplicate_layer") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndex = ports.requiredPositiveInteger(args, "layerIndex");
    const expectedSourceName = ports.optionalString(args, "sourceName", "");
    const duplicateName = ports.optionalString(args, "name", "");

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var sourceLayer = comp.layer(${layerIndex});
      if (!sourceLayer) throw new Error("Layer not found.");
      var expectedSourceName = ${ports.aeLiteral(expectedSourceName)};
      var duplicateName = ${ports.aeLiteral(duplicateName)};
      if (expectedSourceName && sourceLayer.name !== expectedSourceName) {
        throw new Error("Layer name mismatch. Expected '" + expectedSourceName + "' but found '" + sourceLayer.name + "'.");
      }
      if (sourceLayer.locked === true) {
        throw new Error("Layer is locked and cannot be duplicated safely.");
      }

      app.beginUndoGroup("Codex Duplicate Layer");
      var layerCountBefore = comp.numLayers;
      var sourceBefore = __codexLayerInfo(sourceLayer);
      var duplicate = sourceLayer.duplicate();
      if (!duplicate) throw new Error("After Effects did not return a duplicated layer.");
      if (duplicateName) duplicate.name = duplicateName;
      var duplicateInfo = __codexLayerInfo(duplicate);
      var sourceAfter = __codexLayerInfo(sourceLayer);
      var layerCountAfter = comp.numLayers;
      var expectedDuplicateName = duplicateName || duplicateInfo.name;
      var postVerification = {
        ok: layerCountAfter === layerCountBefore + 1 &&
          (!expectedSourceName || sourceBefore.name === expectedSourceName) &&
          (!expectedDuplicateName || duplicateInfo.name === expectedDuplicateName),
        beforeLayerCount: layerCountBefore,
        afterLayerCount: layerCountAfter,
        expectedLayerCountAfter: layerCountBefore + 1,
        layerCountDelta: layerCountAfter - layerCountBefore,
        layerCountMatches: layerCountAfter === layerCountBefore + 1,
        sourceNameMatches: !expectedSourceName || sourceBefore.name === expectedSourceName,
        duplicateNameMatches: !expectedDuplicateName || duplicateInfo.name === expectedDuplicateName
      };
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name,
          numLayers: comp.numLayers,
          numLayersBefore: layerCountBefore,
          numLayersAfter: layerCountAfter
        },
        source: sourceBefore,
        sourceAfter: sourceAfter,
        duplicate: duplicateInfo,
        layer: duplicateInfo,
        layerCountBefore: layerCountBefore,
        layerCountAfter: layerCountAfter,
        postVerification: postVerification
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "duplicate_layers") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndices = ports.requiredExplicitPositiveIntegerList(args, "layerIndices");
    const nameSuffix = ports.optionalString(args, "nameSuffix", "");

    let sourceNames = null;
    if (ports.hasArg(args, "sourceNames")) {
      sourceNames = args.sourceNames;
      if (typeof sourceNames === "string" && sourceNames.trim().startsWith("[")) {
        sourceNames = JSON.parse(sourceNames);
      }
      if (!Array.isArray(sourceNames)) {
        return ports.toolResult("sourceNames must be an array when provided.", true);
      }
      sourceNames = sourceNames.map((value) => String(value));
      if (sourceNames.length !== layerIndices.length) {
        return ports.toolResult("sourceNames must have the same length as layerIndices.", true);
      }
    }

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var requestedLayerIndices = ${ports.aeLiteral(layerIndices)};
      var expectedSourceNames = ${sourceNames ? ports.aeLiteral(sourceNames) : "null"};
      var nameSuffix = ${ports.aeLiteral(nameSuffix)};
      var layerCountBefore = comp.numLayers;
      var sourceRefs = [];
      var sourceBefore = [];

      for (var __dupIndex = 0; __dupIndex < requestedLayerIndices.length; __dupIndex++) {
        var requestedIndex = requestedLayerIndices[__dupIndex];
        if (requestedIndex > comp.numLayers) {
          throw new Error("Layer index " + requestedIndex + " is out of range for comp with " + comp.numLayers + " layers.");
        }
        var sourceLayer = comp.layer(requestedIndex);
        if (!sourceLayer) throw new Error("Layer not found at index " + requestedIndex + ".");
        if (sourceLayer.locked === true) {
          throw new Error("Layer " + requestedIndex + " is locked and cannot be duplicated safely.");
        }
        if (expectedSourceNames && sourceLayer.name !== expectedSourceNames[__dupIndex]) {
          throw new Error("Layer name mismatch at index " + requestedIndex + ". Expected '" + expectedSourceNames[__dupIndex] + "' but found '" + sourceLayer.name + "'.");
        }
        sourceRefs.push(sourceLayer);
        sourceBefore.push(__codexLayerInfo(sourceLayer));
      }

      var __codexDuplicateLayersUndoOpen = false;
      try {
      app.beginUndoGroup("Codex Duplicate Layers");
      __codexDuplicateLayersUndoOpen = true;
      var pairs = [];
      var duplicates = [];
      for (var __copyIndex = 0; __copyIndex < sourceRefs.length; __copyIndex++) {
        var sourceLayerForCopy = sourceRefs[__copyIndex];
        var duplicate = sourceLayerForCopy.duplicate();
        if (!duplicate) throw new Error("After Effects did not return a duplicated layer for index " + requestedLayerIndices[__copyIndex] + ".");
        if (nameSuffix) duplicate.name = sourceBefore[__copyIndex].name + nameSuffix;
        var duplicateInfo = __codexLayerInfo(duplicate);
        var sourceAfter = __codexLayerInfo(sourceLayerForCopy);
        duplicates.push(duplicateInfo);
        pairs.push({
          requestedLayerIndex: requestedLayerIndices[__copyIndex],
          source: sourceBefore[__copyIndex],
          sourceAfter: sourceAfter,
          duplicate: duplicateInfo
        });
      }
      var layerCountAfter = comp.numLayers;
      var expectedLayerCountAfter = layerCountBefore + requestedLayerIndices.length;
      var sourceNameMatches = true;
      var duplicateNameMatches = true;
      for (var __verifyPairIndex = 0; __verifyPairIndex < pairs.length; __verifyPairIndex++) {
        var pair = pairs[__verifyPairIndex];
        var expectedPairSourceName = expectedSourceNames ? expectedSourceNames[__verifyPairIndex] : sourceBefore[__verifyPairIndex].name;
        var expectedPairDuplicateName = sourceBefore[__verifyPairIndex].name + nameSuffix;
        if (expectedPairSourceName && pair.source.name !== expectedPairSourceName) sourceNameMatches = false;
        if (nameSuffix && pair.duplicate.name !== expectedPairDuplicateName) duplicateNameMatches = false;
      }
      var postVerification = {
        ok: layerCountAfter === expectedLayerCountAfter &&
          pairs.length === requestedLayerIndices.length &&
          sourceNameMatches === true &&
          duplicateNameMatches === true,
        beforeLayerCount: layerCountBefore,
        afterLayerCount: layerCountAfter,
        expectedLayerCountAfter: expectedLayerCountAfter,
        requestedCount: requestedLayerIndices.length,
        duplicateCount: duplicates.length,
        layerCountDelta: layerCountAfter - layerCountBefore,
        layerCountMatches: layerCountAfter === expectedLayerCountAfter,
        pairCountMatches: pairs.length === requestedLayerIndices.length,
        sourceNameMatches: sourceNameMatches,
        duplicateNameMatches: duplicateNameMatches,
        pairNameMatches: sourceNameMatches === true && duplicateNameMatches === true
      };
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name,
          numLayersBefore: layerCountBefore,
          numLayersAfter: layerCountAfter
        },
        requestedLayerIndices: requestedLayerIndices,
        layerCountBefore: layerCountBefore,
        layerCountAfter: layerCountAfter,
        duplicateCount: duplicates.length,
        pairs: pairs,
        layers: duplicates,
        postVerification: postVerification
      };
      return response;
      } finally {
        if (__codexDuplicateLayersUndoOpen) {
          app.endUndoGroup();
        }
      }
    `);
    return ports.toolResult(result.result);
  }

  if (name === "delete_layer") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndex = ports.requiredPositiveInteger(args, "layerIndex");
    const expectedLayerName = ports.optionalString(args, "expectedLayerName", "").trim();

    if (compItemIndex === null && !compName) return ports.toolResult("compItemIndex or compName is required.", true);
    if (!expectedLayerName) return ports.toolResult("expectedLayerName is required.", true);
    if (ports.hasArg(args, "layerIndices") || ports.hasArg(args, "layerNames") || ports.hasArg(args, "selectedLayersOnly")) {
      return ports.toolResult("delete_layer deletes exactly one explicit layer; bulk or selection-based targets are not allowed.", true);
    }

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var requestedLayerIndex = ${layerIndex};
      var expectedLayerName = ${ports.aeLiteral(expectedLayerName)};

      function __codexLayerNameCount(comp, layerName) {
        var count = 0;
        for (var __ln = 1; __ln <= comp.numLayers; __ln++) {
          var layer = comp.layer(__ln);
          if (layer && layer.name === layerName) count++;
        }
        return count;
      }

      if (requestedLayerIndex > comp.numLayers) {
        throw new Error("Layer index " + requestedLayerIndex + " is out of range for comp with " + comp.numLayers + " layers.");
      }
      var layer = comp.layer(requestedLayerIndex);
      if (!layer) throw new Error("Layer not found at index " + requestedLayerIndex + ".");
      if (layer.name !== expectedLayerName) {
        throw new Error("Layer name mismatch. Expected '" + expectedLayerName + "' but found '" + layer.name + "'.");
      }
      if (layer.locked === true) {
        throw new Error("Layer is locked and cannot be deleted safely.");
      }

      var layerCountBefore = comp.numLayers;
      var deletedLayer = __codexLayerInfo(layer);
      var sameNameCountBefore = __codexLayerNameCount(comp, expectedLayerName);
      var deletedLayerId = deletedLayer ? deletedLayer.id : null;
      var __codexDeleteLayerUndoOpen = false;
      try {
        app.beginUndoGroup("Codex Delete Layer");
        __codexDeleteLayerUndoOpen = true;
        layer.remove();
        var layerCountAfter = comp.numLayers;
        var layerAtDeletedIndexAfter = requestedLayerIndex <= comp.numLayers ? __codexLayerInfo(comp.layer(requestedLayerIndex)) : null;
        var sameNameCountAfter = __codexLayerNameCount(comp, expectedLayerName);
        var deletedLayerIdStillPresent = false;
        if (deletedLayerId !== null && deletedLayerId !== undefined) {
          for (var __dl = 1; __dl <= comp.numLayers; __dl++) {
            var currentLayer = comp.layer(__dl);
            if (currentLayer && currentLayer.id === deletedLayerId) deletedLayerIdStillPresent = true;
          }
        }
        var expectedLayerCountAfter = layerCountBefore - 1;
        var postVerification = {
          ok: layerCountAfter === expectedLayerCountAfter &&
            deletedLayerIdStillPresent === false &&
            sameNameCountAfter === Math.max(0, sameNameCountBefore - 1),
          beforeLayerCount: layerCountBefore,
          afterLayerCount: layerCountAfter,
          expectedLayerCountAfter: expectedLayerCountAfter,
          layerCountDelta: layerCountAfter - layerCountBefore,
          layerCountMatches: layerCountAfter === expectedLayerCountAfter,
          deletedLayerId: deletedLayerId,
          deletedLayerIdAbsent: deletedLayerIdStillPresent === false,
          expectedLayerName: expectedLayerName,
          sameNameCountBefore: sameNameCountBefore,
          sameNameCountAfter: sameNameCountAfter,
          sameNameCountDecremented: sameNameCountAfter === Math.max(0, sameNameCountBefore - 1),
          layerAtDeletedIndexAfter: layerAtDeletedIndexAfter,
          deletedLayerNameAbsentAtOriginalIndex: !layerAtDeletedIndexAfter || layerAtDeletedIndexAfter.name !== expectedLayerName
        };
        return {
          comp: {
            itemIndex: __codexProjectIndexForItem(comp),
            name: comp.name,
            numLayersBefore: layerCountBefore,
            numLayersAfter: layerCountAfter
          },
          layerCountBefore: layerCountBefore,
          layerCountAfter: layerCountAfter,
          requestedLayerIndex: requestedLayerIndex,
          expectedLayerName: expectedLayerName,
          deletedLayer: deletedLayer,
          layerAtDeletedIndexAfter: layerAtDeletedIndexAfter,
          postVerification: postVerification
        };
      } finally {
        if (__codexDeleteLayerUndoOpen) {
          app.endUndoGroup();
        }
      }
    `);
    return ports.toolResult(result.result);
  }

  if (name === "deep_duplicate_precomp_sources") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndex = ports.optionalPositiveInteger(args, "layerIndex");
    const sourceCompItemIndex = ports.optionalPositiveInteger(args, "sourceCompItemIndex");
    const sourceCompName = ports.optionalString(args, "sourceCompName", "");
    const nameSuffix = ports.optionalString(args, "nameSuffix", " copy");
    const fixExpressions = ports.optionalBoolean(args, "fixExpressions", false);
    const openInViewer = ports.optionalBoolean(args, "openInViewer", false);
    const unavailableFootagePolicy = ports.optionalString(args, "unavailableFootagePolicy", "reuse") === "fail" ? "fail" : "reuse";

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var requestedLayerIndex = ${layerIndex === null ? "null" : layerIndex};
      var expectedSourceCompIndex = ${sourceCompItemIndex === null ? "null" : sourceCompItemIndex};
      var expectedSourceCompName = ${ports.aeLiteral(sourceCompName)};
      var nameSuffix = ${ports.aeLiteral(nameSuffix)};
      var fixExpressions = ${fixExpressions ? "true" : "false"};
      var openInViewer = ${openInViewer ? "true" : "false"};
      var unavailableFootagePolicy = ${ports.aeLiteral(unavailableFootagePolicy)};
      var deepDuplicateWarnings = [];
      var duplicatedFootageCount = 0;
      var reusedFootageCount = 0;

      function __codexCompReference(item) {
        var ref = __codexItemReference(item);
        if (!ref || !(item instanceof CompItem)) return ref;
        ref.width = item.width;
        ref.height = item.height;
        ref.duration = item.duration;
        ref.frameRate = item.frameRate;
        ref.numLayers = item.numLayers;
        return ref;
      }

      function __codexDuplicateKey(item) {
        var itemId = null;
        try { itemId = item.id; } catch (__idError) {}
        if (itemId !== null && itemId !== undefined && itemId !== "") return "id:" + itemId;
        return "index:" + __codexProjectIndexForItem(item);
      }

      function __codexFootageFile(item) {
        var file = null;
        try {
          if (item && item.mainSource && item.mainSource.file) file = item.mainSource.file;
        } catch (__mainSourceFileError) {}
        if (!file) {
          try { if (item && item.file) file = item.file; } catch (__itemFileError) {}
        }
        if (!file || !file.exists) return null;
        return file;
      }

      function __codexSourceTypename(item) {
        try {
          if (item && item.mainSource && item.mainSource.typename) return String(item.mainSource.typename);
        } catch (__typenameError) {}
        try {
          if (item && item.mainSource && item.mainSource.constructor && item.mainSource.constructor.name) {
            return String(item.mainSource.constructor.name);
          }
        } catch (__constructorNameError) {}
        try {
          if (item && item.mainSource) {
            var sourceText = String(item.mainSource);
            var match = sourceText.match(/^\\[object\\s+([^\\]]+)\\]$/);
            if (match && match[1]) return String(match[1]);
          }
        } catch (__sourceTextError) {}
        return "";
      }

      function __codexSolidColor(item) {
        try {
          if (item && item.mainSource && item.mainSource.color && item.mainSource.color.length >= 3) {
            return [Number(item.mainSource.color[0]), Number(item.mainSource.color[1]), Number(item.mainSource.color[2])];
          }
        } catch (__solidColorError) {}
        return [0, 0, 0];
      }

      function __codexFootagePixelAspect(item) {
        try {
          if (item && item.pixelAspect) return Number(item.pixelAspect);
        } catch (__pixelAspectError) {}
        return 1;
      }

      function __codexFootageDuration(item) {
        try {
          if (item && item.duration && isFinite(item.duration) && item.duration > 0) return Number(item.duration);
        } catch (__durationError) {}
        return 1;
      }

      function __codexFootageFrameRate(item) {
        try {
          if (item && item.frameRate && isFinite(item.frameRate) && item.frameRate > 0) return Number(item.frameRate);
        } catch (__frameRateError) {}
        return 25;
      }

      function __codexDuplicateSolidFootageItem(item) {
        var width = Math.max(1, Math.round(Number(item.width || 1)));
        var height = Math.max(1, Math.round(Number(item.height || 1)));
        var pixelAspect = __codexFootagePixelAspect(item);
        var duration = __codexFootageDuration(item);
        var tempComp = null;
        var copy = null;
        try {
          tempComp = app.project.items.addComp("__Codex Solid Duplicate Temp", width, height, pixelAspect, duration, __codexFootageFrameRate(item));
          var tempLayer = tempComp.layers.addSolid(__codexSolidColor(item), item.name || "Solid", width, height, pixelAspect, duration);
          copy = tempLayer.source;
          try { tempLayer.remove(); } catch (__solidTempLayerRemoveError) {}
        } finally {
          try { if (tempComp) tempComp.remove(); } catch (__solidTempCompRemoveError) {}
        }
        if (!copy) {
          return __codexReuseUnavailableFootage(item, "Solid footage source cannot be duplicated by this After Effects host");
        }
        try { copy.parentFolder = item.parentFolder; } catch (__solidParentFolderError) {}
        return copy;
      }

      function __codexDuplicatePlaceholderFootageItem(item) {
        var width = Math.max(1, Math.round(Number(item.width || 1)));
        var height = Math.max(1, Math.round(Number(item.height || 1)));
        var frameRate = __codexFootageFrameRate(item);
        var duration = __codexFootageDuration(item);
        var copy = null;
        if (app.project.importPlaceholder) {
          copy = app.project.importPlaceholder(item.name || "Placeholder", width, height, frameRate, duration);
        } else if (app.project.items.addPlaceholder) {
          copy = app.project.items.addPlaceholder(item.name || "Placeholder", width, height, frameRate, duration);
        }
        if (!copy) return null;
        try { copy.parentFolder = item.parentFolder; } catch (__placeholderParentFolderError) {}
        return copy;
      }

      function __codexReuseUnavailableFootage(item, reason) {
        if (unavailableFootagePolicy === "fail") {
          throw new Error(reason + ": " + item.name);
        }
        reusedFootageCount++;
        deepDuplicateWarnings.push(reason + "; reused original footage item: " + item.name);
        return item;
      }

      function __codexCopyFootageInterpretation(sourceItem, copyItem) {
        var source = null;
        var copy = null;
        try { source = sourceItem.mainSource; } catch (__sourceMainError) {}
        try { copy = copyItem.mainSource; } catch (__copyMainError) {}
        if (!source || !copy) return;

        var properties = [
          "alphaMode",
          "premulColor",
          "invertAlpha",
          "conformFrameRate",
          "fieldSeparationType",
          "highQualityFieldSeparation",
          "removePulldown",
          "loop"
        ];
        for (var __p = 0; __p < properties.length; __p++) {
          var property = properties[__p];
          try {
            if (source[property] !== undefined) copy[property] = source[property];
          } catch (__copyInterpretationError) {}
        }
      }

      function __codexDuplicateFootageItem(item) {
        var sourceType = __codexSourceTypename(item);
        var copy = null;

        if (item.duplicate) {
          copy = item.duplicate();
          duplicatedFootageCount++;
          return copy;
        }

        if (sourceType === "SolidSource") {
          copy = __codexDuplicateSolidFootageItem(item);
          duplicatedFootageCount++;
          return copy;
        }

        if (sourceType === "PlaceholderSource") {
          copy = __codexDuplicatePlaceholderFootageItem(item);
          if (copy) {
            duplicatedFootageCount++;
            return copy;
          }
          return __codexReuseUnavailableFootage(item, "Placeholder footage source cannot be duplicated by this After Effects host");
        }

        var file = __codexFootageFile(item);
        if (!file) {
          return __codexReuseUnavailableFootage(item, "Footage item cannot be duplicated or reimported because its source file is unavailable");
        }

        var options = new ImportOptions(file);
        options.sequence = false;
        if (!options.canImportAs(ImportAsType.FOOTAGE)) {
          return __codexReuseUnavailableFootage(item, "Footage file cannot be reimported as footage");
        }
        options.importAs = ImportAsType.FOOTAGE;
        copy = app.project.importFile(options);
        duplicatedFootageCount++;
        __codexCopyFootageInterpretation(item, copy);
        try { copy.parentFolder = item.parentFolder; } catch (__parentFolderError) {}
        return copy;
      }

      function __codexLayerFlags(layer) {
        return {
          adjustmentLayer: (function () { try { return !!layer.adjustmentLayer; } catch (__flagError) { return null; } })(),
          guideLayer: (function () { try { return !!layer.guideLayer; } catch (__guideError) { return null; } })(),
          threeDLayer: (function () { try { return !!layer.threeDLayer; } catch (__threeDError) { return null; } })()
        };
      }

      function __codexRestoreLayerFlags(layer, flags) {
        if (!layer || !flags) return;
        try { if (flags.adjustmentLayer !== null) layer.adjustmentLayer = flags.adjustmentLayer; } catch (__adjustmentRestoreError) {}
        try { if (flags.guideLayer !== null) layer.guideLayer = flags.guideLayer; } catch (__guideRestoreError) {}
        try { if (flags.threeDLayer !== null) layer.threeDLayer = flags.threeDLayer; } catch (__threeDRestoreError) {}
      }

      function __codexResolvePrecompLayer(parentComp, requestedIndex) {
        if (requestedIndex !== null) {
          var explicitLayer = parentComp.layer(requestedIndex);
          if (!explicitLayer) throw new Error("Layer not found at index " + requestedIndex + ".");
          return explicitLayer;
        }
        if (parentComp.selectedLayers.length !== 1) {
          throw new Error("Select exactly one precomp layer or pass layerIndex.");
        }
        return parentComp.selectedLayers[0];
      }

      var selectedLayer = __codexResolvePrecompLayer(comp, requestedLayerIndex);
      if (selectedLayer.locked) throw new Error("Layer is locked: " + selectedLayer.name);
      var sourceComp = selectedLayer.source;
      if (!(sourceComp instanceof CompItem)) {
        throw new Error("Target layer source is not a composition/precomp.");
      }
      if (expectedSourceCompIndex !== null || expectedSourceCompName) {
        var expectedSource = __codexResolveProjectItem(expectedSourceCompIndex, expectedSourceCompName, "comp");
        if (expectedSource !== sourceComp) {
          throw new Error("Selected layer no longer points to the expected source precomp.");
        }
      }

      var duplicatedByKey = {};
      var duplicatedItems = [];
      var duplicatedCopies = [];
      var relinkedLayerCount = 0;

      function __codexDuplicateItemDeep(item) {
        if (!item) return item;
        if (!(item instanceof CompItem) && !(item instanceof FootageItem)) return item;
        var key = __codexDuplicateKey(item);
        if (duplicatedByKey[key]) return duplicatedByKey[key];

        var copy = item instanceof FootageItem ? __codexDuplicateFootageItem(item) : item.duplicate();
        if (copy === item) {
          duplicatedByKey[key] = item;
          return item;
        }
        if (nameSuffix) copy.name = item.name + nameSuffix;
        duplicatedByKey[key] = copy;
        duplicatedCopies.push(copy);
        duplicatedItems.push({
          source: item instanceof CompItem ? __codexCompReference(item) : __codexItemReference(item),
          duplicate: copy instanceof CompItem ? __codexCompReference(copy) : __codexItemReference(copy)
        });

        if (copy instanceof CompItem) {
          for (var __i = 1; __i <= copy.numLayers; __i++) {
            var layer = copy.layer(__i);
            if (!layer) continue;
            var nestedSource = null;
            try { nestedSource = layer.source; } catch (__sourceError) {}
            if (!nestedSource) continue;
            var nestedCopy = __codexDuplicateItemDeep(nestedSource);
            if (nestedCopy && nestedCopy !== nestedSource && layer.replaceSource) {
              var wasLocked = false;
              var layerFlags = __codexLayerFlags(layer);
              try {
                wasLocked = !!layer.locked;
                if (wasLocked) layer.locked = false;
              } catch (__unlockError) {}
              try {
                layer.replaceSource(nestedCopy, fixExpressions);
                __codexRestoreLayerFlags(layer, layerFlags);
                relinkedLayerCount++;
              } finally {
                try { if (wasLocked) layer.locked = true; } catch (__relockError) {}
              }
            }
          }
        }

        return copy;
      }

      app.beginUndoGroup("Codex Deep Duplicate Precomp Sources");
      var response = null;
      try {
        var newComp = __codexDuplicateItemDeep(sourceComp);
        selectedLayer.replaceSource(newComp, fixExpressions);
        selectedLayer.name = newComp.name;
        if (openInViewer && newComp && newComp.openInViewer) newComp.openInViewer();
        response = {
          comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
          layer: __codexLayerInfo(selectedLayer),
          originalComp: __codexCompReference(sourceComp),
          duplicateComp: __codexCompReference(newComp),
          changedCount: 1,
          duplicatedItemCount: duplicatedItems.length,
          duplicatedFootageCount: duplicatedFootageCount,
          reusedFootageCount: reusedFootageCount,
          relinkedLayerCount: relinkedLayerCount,
          duplicatedItems: duplicatedItems,
          warnings: deepDuplicateWarnings,
          nameSuffix: nameSuffix
        };
      } catch (__deepDuplicateError) {
        try {
          if (selectedLayer && sourceComp && selectedLayer.source !== sourceComp && selectedLayer.replaceSource) {
            selectedLayer.replaceSource(sourceComp, fixExpressions);
          }
        } catch (__restoreLayerSourceError) {}
        for (var __removeIndex = 0; __removeIndex < duplicatedCopies.length; __removeIndex++) {
          try {
            if (duplicatedCopies[__removeIndex] && duplicatedCopies[__removeIndex].remove) {
              duplicatedCopies[__removeIndex].remove();
            }
          } catch (__removeDuplicateError) {}
        }
        throw __deepDuplicateError;
      } finally {
        app.endUndoGroup();
      }
      return response;
    `);
    return ports.toolResult(ports.withDeepDuplicateResultAliases(result.result));
  }

  if (name === "list_effects") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndex = ports.requiredPositiveInteger(args, "layerIndex");
    const includeProperties = ports.optionalBoolean(args, "includeProperties", false);
    const includeValues = ports.optionalBoolean(args, "includeValues", false);
    const includeExpressions = ports.optionalBoolean(args, "includeExpressions", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      var includeProperties = ${includeProperties ? "true" : "false"};
      var includeValues = ${includeValues ? "true" : "false"};
      var includeExpressions = ${includeExpressions ? "true" : "false"};
      var effectGroup = layer.property("ADBE Effect Parade");
      var effects = [];

      if (effectGroup) {
        for (var __e = 1; __e <= effectGroup.numProperties; __e++) {
          var effect = effectGroup.property(__e);
          if (!effect) continue;
          var info = __codexPropertyInfo(effect, layer, false, includeExpressions);
          if (includeProperties) {
            info.properties = __codexEffectProperties(effect, layer, includeValues, includeExpressions);
          }
          effects.push(info);
        }
      }

      return {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        layer: __codexLayerInfo(layer),
        effectCount: effectGroup ? effectGroup.numProperties : 0,
        effects: effects
      };
    `);
    return ports.toolResult(result.result);
  }

  if (name === "get_effect_details") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const compItemId = ports.optionalPositiveInteger(args,"compItemId");
    const layerId=ports.optionalPositiveInteger(args,"layerId");
    const layerIndex=layerId===null ? ports.requiredPositiveInteger(args,"layerIndex") : ports.optionalPositiveInteger(args,"layerIndex");
    const effectIndex = ports.optionalPositiveInteger(args, "effectIndex");
    const effectName = ports.optionalString(args, "effectName", "");
    const effectMatchName = ports.optionalString(args, "effectMatchName", "");
    const includeProperties = ports.optionalBoolean(args, "includeProperties", true);
    const propertyDepth = Math.max(0, Math.min(5, Math.floor(ports.optionalNumber(args, "propertyDepth", 1))));
    const propertyLimit = Math.max(1, Math.min(1000, Math.floor(ports.optionalNumber(args, "propertyLimit", 120))));
    const includeValues = ports.optionalBoolean(args, "includeValues", true);
    const includeExpressions = ports.optionalBoolean(args, "includeExpressions", true);

    if (!effectIndex && !effectName && !effectMatchName) {
      return ports.toolResult("Provide effectIndex, effectName, or effectMatchName.", true);
    }

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)}, ${compItemId === null ? "null" : compItemId});
      var layer = __codexResolveLayer(comp, ${layerIndex === null ? "null" : layerIndex}, ${layerId === null ? "null" : layerId});
      if (!layer) throw new Error("Layer not found.");
      var effect = __codexResolveEffect(layer, ${effectIndex === null ? "null" : effectIndex}, ${ports.aeLiteral(effectName)}, ${ports.aeLiteral(effectMatchName)});
      var includeProperties = ${includeProperties ? "true" : "false"};
      var includeValues = ${includeValues ? "true" : "false"};
      var includeExpressions = ${includeExpressions ? "true" : "false"};
      var propertyDepth = ${propertyDepth};
      var propertyLimit = ${propertyLimit};
      var properties = [];
      var propertyState = { count: 0, max: propertyLimit };

      if (includeProperties) {
        try {
          for (var __p = 1; __p <= effect.numProperties && propertyState.count < propertyState.max; __p++) {
            var branch = __codexPropertyTree(effect.property(__p), propertyDepth, propertyState, includeValues, includeExpressions);
            if (branch) properties.push(branch);
          }
        } catch (__effectTreeError) {}
      }

      return {
        comp: {
          itemId: comp.id,
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        layer: __codexLayerInfo(layer),
        effect: __codexPropertyInfo(effect, layer, false, includeExpressions),
        propertiesReturned: properties.length,
        propertiesTruncated: includeProperties && propertyState.count >= propertyState.max,
        properties: properties
      };
    `);
    return ports.toolResult(result.result);
  }

  if (name === "add_effect") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndex = ports.requiredPositiveInteger(args, "layerIndex");
    const effect = ports.optionalString(args, "effect", "");
    const effectName = ports.optionalString(args, "name", "");

    if (!effect) return ports.toolResult("effect is required.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");

      var effectIdentifier = ${ports.aeLiteral(effect)};
      var requestedName = ${ports.aeLiteral(effectName)};
      var effectGroup = layer.property("ADBE Effect Parade");
      if (!effectGroup) throw new Error("Layer cannot receive effects.");

      app.beginUndoGroup("Codex Add Effect");
      var addedEffect = effectGroup.addProperty(effectIdentifier);
      if (!addedEffect) throw new Error("Could not add effect: " + effectIdentifier);
      if (requestedName) addedEffect.name = requestedName;
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        layer: __codexLayerInfo(layer),
        effect: __codexPropertyInfo(addedEffect, layer, false, true),
        properties: __codexEffectProperties(addedEffect, layer, true)
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "set_effect_property") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    if(args.compItemId!==undefined || args.layerId!==undefined) throw new Error("unsupported_setter_identity_alias");
    const expectedCompItemId=ports.optionalPositiveInteger(args,"expectedCompItemId");
    const expectedLayerId=ports.optionalPositiveInteger(args,"expectedLayerId");
    const layerIndex = ports.requiredPositiveInteger(args, "layerIndex");
    const effectIndex = ports.optionalPositiveInteger(args, "effectIndex");
    const effectName = ports.optionalString(args, "effectName", "");
    const effectMatchName = ports.optionalString(args, "effectMatchName", "");
    const propertyIndex = ports.optionalPositiveInteger(args, "propertyIndex");
    const propertyName = ports.optionalString(args, "propertyName", "");
    const propertyMatchName = ports.optionalString(args, "propertyMatchName", "");
    const time = ports.optionalNumber(args, "time", null);
    const setAtTime = ports.optionalBoolean(args, "setAtTime", time !== null);

    let propertyPath = null;
    if (Array.isArray(args.propertyPath)) {
      propertyPath = args.propertyPath;
    } else if (typeof args.propertyPath === "string" && args.propertyPath.trim().startsWith("[")) {
      propertyPath = JSON.parse(args.propertyPath);
    } else if (ports.hasArg(args, "propertyPath")) {
      return ports.toolResult("propertyPath must be an array, or a JSON-encoded array string.", true);
    }

    if (!effectIndex && !effectName && !effectMatchName) {
      return ports.toolResult("Provide effectIndex, effectName, or effectMatchName.", true);
    }
    if (!propertyPath && !propertyIndex && !propertyName && !propertyMatchName) {
      return ports.toolResult("Provide propertyPath, propertyIndex, propertyName, or propertyMatchName.", true);
    }
    if (!ports.hasArg(args, "value")) return ports.toolResult("value is required.", true);
    if (setAtTime && time === null) return ports.toolResult("time is required when setAtTime is true.", true);

    const value = args.value;

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)}, ${expectedCompItemId === null ? "null" : expectedCompItemId});
      var layer = __codexResolveLayer(comp, ${layerIndex}, ${expectedLayerId === null ? "null" : expectedLayerId});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");

      var effect = __codexResolveEffect(layer, ${effectIndex === null ? "null" : effectIndex}, ${ports.aeLiteral(effectName)}, ${ports.aeLiteral(effectMatchName)});
      var propertyPath = ${propertyPath ? ports.aeLiteral(propertyPath) : "null"};
      var prop = __codexResolveEffectProperty(effect, propertyPath, ${propertyIndex === null ? "null" : propertyIndex}, ${ports.aeLiteral(propertyName)}, ${ports.aeLiteral(propertyMatchName)});
      var requestedValue = ${ports.aeLiteral(value)};
      var shouldSetAtTime = ${setAtTime ? "true" : "false"};
      var targetTime = ${time === null ? "null" : time};

      var preparedValue = __codexPreparePropertyValue(prop, requestedValue);
      app.beginUndoGroup("Codex Set Effect Property");
      try {
      if (shouldSetAtTime) {
        prop.setValueAtTime(targetTime, preparedValue);
      } else {
        prop.setValue(preparedValue);
      }
      var response = {
        comp: {
          itemId: comp.id,
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        layer: __codexLayerInfo(layer),
        effect: __codexPropertyInfo(effect, layer, false, true),
        property: __codexPropertyInfo(prop, layer, true, true),
        setAtTime: shouldSetAtTime,
        time: targetTime
      };
      return response;
      } finally { app.endUndoGroup(); }
    `);
    return ports.toolResult(result.result);
  }

  if (name === "set_effect_enabled") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndex = ports.requiredPositiveInteger(args, "layerIndex");
    const effectIndex = ports.optionalPositiveInteger(args, "effectIndex");
    const effectName = ports.optionalString(args, "effectName", "");
    const effectMatchName = ports.optionalString(args, "effectMatchName", "");
    const enabled = ports.optionalBoolean(args, "enabled", null);
    const expectedCurrentEnabled = ports.hasArg(args, "expectedCurrentEnabled")
      ? ports.optionalBoolean(args, "expectedCurrentEnabled", null)
      : null;

    if (!effectIndex && !effectName && !effectMatchName) {
      return ports.toolResult("Provide effectIndex, effectName, or effectMatchName.", true);
    }
    if (!ports.hasArg(args, "enabled")) return ports.toolResult("enabled is required.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");

      var effect = __codexResolveEffect(layer, ${effectIndex === null ? "null" : effectIndex}, ${ports.aeLiteral(effectName)}, ${ports.aeLiteral(effectMatchName)});
      var requestedEnabled = ${enabled ? "true" : "false"};
      var expectedCurrentEnabled = ${expectedCurrentEnabled === null ? "null" : expectedCurrentEnabled ? "true" : "false"};
      var beforeEffect = __codexPropertyInfo(effect, layer, false, true);
      if (beforeEffect.enabled === undefined) {
        try { beforeEffect.enabled = !!effect.enabled; } catch (__effectEnabledReadError) {}
      }
      if (expectedCurrentEnabled !== null && beforeEffect.enabled !== expectedCurrentEnabled) {
        throw new Error("Effect enabled guard mismatch. Expected " + expectedCurrentEnabled + " but found " + beforeEffect.enabled + ".");
      }

      app.beginUndoGroup("Codex Set Effect Enabled");
      try {
        effect.enabled = requestedEnabled;
        var afterEffect = __codexPropertyInfo(effect, layer, false, true);
        if (afterEffect.enabled === undefined) {
          try { afterEffect.enabled = !!effect.enabled; } catch (__effectEnabledAfterReadError) {}
        }
        return {
          comp: {
            itemIndex: __codexProjectIndexForItem(comp),
            name: comp.name
          },
          layer: __codexLayerInfo(layer),
          effect: afterEffect,
          before: {
            effect: beforeEffect
          },
          after: {
            effect: afterEffect
          },
          requestedEnabled: requestedEnabled,
          expectedCurrentEnabled: expectedCurrentEnabled,
          postVerification: {
            ok: afterEffect.enabled === requestedEnabled,
            enabledMatches: afterEffect.enabled === requestedEnabled,
            expectedCurrentMatched: expectedCurrentEnabled === null || beforeEffect.enabled === expectedCurrentEnabled
          }
        };
      } finally {
        app.endUndoGroup();
      }
    `);
    return ports.toolResult(result.result);
  }

  if (name === "set_puppet_pin_type") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndex = ports.requiredPositiveInteger(args, "layerIndex");
    const effectIndex = ports.optionalPositiveInteger(args, "effectIndex");
    const effectName = ports.optionalString(args, "effectName", "");
    const effectMatchName = ports.optionalString(args, "effectMatchName", "");
    const expectedPinName = ports.optionalString(args, "expectedPinName", "");
    const pinType = ports.normalizePuppetPinType(args.pinType, "pinType");
    const expectedCurrentPinType = ports.hasArg(args, "expectedCurrentPinType")
      ? ports.normalizePuppetPinType(args.expectedCurrentPinType, "expectedCurrentPinType")
      : null;

    let pinTypePropertyPath = null;
    if (Array.isArray(args.pinTypePropertyPath)) {
      pinTypePropertyPath = args.pinTypePropertyPath;
    } else if (typeof args.pinTypePropertyPath === "string" && args.pinTypePropertyPath.trim().startsWith("[")) {
      pinTypePropertyPath = JSON.parse(args.pinTypePropertyPath);
    } else if (ports.hasArg(args, "pinTypePropertyPath")) {
      return ports.toolResult("pinTypePropertyPath must be an array, or a JSON-encoded array string.", true);
    }

    if (!effectIndex && !effectName && !effectMatchName) {
      return ports.toolResult("Provide effectIndex, effectName, or effectMatchName.", true);
    }
    if (effectMatchName && effectMatchName !== "ADBE FreePin3") {
      return ports.toolResult("set_puppet_pin_type only supports effectMatchName ADBE FreePin3.", true);
    }
    if (!pinTypePropertyPath || !pinTypePropertyPath.length) {
      return ports.toolResult("pinTypePropertyPath is required.", true);
    }

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}

      function __codexTryResolveProperty(root, propertyPath) {
        try {
          return __codexResolveProperty(root, propertyPath);
        } catch (__resolveError) {
          return null;
        }
      }

      function __codexPropertyAncestor(prop, expectedMatchName, stopAt) {
        var current = prop;
        var guard = 0;
        while (current && guard < 50) {
          if (current.matchName === expectedMatchName) return current;
          if (stopAt && current === stopAt) break;
          try {
            current = current.parentProperty;
          } catch (__parentError) {
            current = null;
          }
          guard++;
        }
        return null;
      }

      function __codexResolvePuppetPinTypeProperty(layer, effect, propertyPath) {
        var prop = __codexTryResolveProperty(layer, propertyPath);
        if (prop) return prop;

        prop = __codexTryResolveProperty(effect, propertyPath);
        if (prop) return prop;

        if (propertyPath instanceof Array) {
          for (var __offset = 0; __offset < propertyPath.length; __offset++) {
            var suffix = [];
            for (var __segment = __offset; __segment < propertyPath.length; __segment++) {
              suffix.push(propertyPath[__segment]);
            }
            prop = __codexTryResolveProperty(effect, suffix);
            if (prop) return prop;
          }
        }

        throw new Error("Could not resolve pinTypePropertyPath against the layer or ADBE FreePin3 effect.");
      }

      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");

      var effect = __codexResolveEffect(layer, ${effectIndex === null ? "null" : effectIndex}, ${ports.aeLiteral(effectName)}, ${ports.aeLiteral(effectMatchName || "ADBE FreePin3")});
      if (effect.matchName !== "ADBE FreePin3") {
        throw new Error("set_puppet_pin_type only supports ADBE FreePin3 effects.");
      }

      var propertyPath = ${ports.aeLiteral(pinTypePropertyPath)};
      var prop = __codexResolvePuppetPinTypeProperty(layer, effect, propertyPath);
      if (prop.matchName !== "ADBE FreePin3 PosPin Type") {
        throw new Error("pinTypePropertyPath must resolve to ADBE FreePin3 PosPin Type.");
      }

      var pinAtom = __codexPropertyAncestor(prop, "ADBE FreePin3 PosPin Atom", effect);
      if (!pinAtom) {
        throw new Error("ADBE FreePin3 PosPin Type must be under an ADBE FreePin3 PosPin Atom ancestor.");
      }
      var expectedPinName = ${ports.aeLiteral(expectedPinName)};
      if (expectedPinName && pinAtom.name !== expectedPinName) {
        throw new Error("Puppet pin atom name mismatch. Expected " + expectedPinName + " but found " + pinAtom.name + ".");
      }

      var requestedPinType = ${pinType};
      var expectedCurrentPinType = ${expectedCurrentPinType === null ? "null" : expectedCurrentPinType};
      var beforeValue = Number(prop.value);
      if (expectedCurrentPinType !== null && beforeValue !== expectedCurrentPinType) {
        throw new Error("Puppet pin type current value mismatch. Expected " + expectedCurrentPinType + " but found " + beforeValue + ".");
      }

      app.beginUndoGroup("Codex Set Puppet Pin Type");
      prop.setValue(requestedPinType);
      var afterValue = Number(prop.value);
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        layer: __codexLayerInfo(layer),
        effect: __codexPropertyInfo(effect, layer, false, true),
        pinAtom: __codexPropertyInfo(pinAtom, layer, false, true),
        property: __codexPropertyInfo(prop, layer, true, true),
        pinTypeBefore: beforeValue,
        pinType: requestedPinType,
        pinTypeAfter: afterValue,
        allowedPinTypes: [1, 4],
        propertyPath: __codexPropertyPath(prop)
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "add_property_to_essential_graphics") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndex = ports.requiredPositiveInteger(args, "layerIndex");
    const expectedLayerName = ports.optionalString(args, "expectedLayerName", "");
    const expectedPropertyName = ports.optionalString(args, "expectedPropertyName", "");
    const expectedPropertyMatchName = ports.optionalString(args, "expectedPropertyMatchName", "");
    const expectedControllerCountBefore = ports.optionalNumber(args, "expectedControllerCountBefore", null);
    const controllerName = ports.optionalString(args, "controllerName", "").trim();

    let propertyPath = null;
    if (Array.isArray(args.propertyPath)) {
      propertyPath = args.propertyPath;
    } else if (typeof args.propertyPath === "string" && args.propertyPath.trim().startsWith("[")) {
      propertyPath = JSON.parse(args.propertyPath);
    } else if (ports.hasArg(args, "propertyPath")) {
      return ports.toolResult("propertyPath must be an array, or a JSON-encoded array string.", true);
    }

    if (compItemIndex === null && !compName) return ports.toolResult("compItemIndex or compName is required.", true);
    if (!propertyPath || !propertyPath.length) return ports.toolResult("propertyPath is required.", true);
    if (!controllerName) return ports.toolResult("controllerName is required.", true);
    if (controllerName.length > 80) return ports.toolResult("controllerName must be 80 characters or fewer.", true);
    if (expectedControllerCountBefore !== null && (!Number.isInteger(expectedControllerCountBefore) || expectedControllerCountBefore < 0)) {
      return ports.toolResult("expectedControllerCountBefore must be a non-negative integer.", true);
    }

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}

      function __codexEssentialGraphicsControllers(comp) {
        var controllers = [];
        var count = 0;
        try { count = comp.motionGraphicsTemplateControllerCount || 0; } catch (__countError) { count = 0; }
        for (var __eg = 1; __eg <= count; __eg++) {
          var controllerName = "";
          try { controllerName = comp.getMotionGraphicsTemplateControllerName(__eg) || ""; } catch (__nameError) {}
          controllers.push({
            index: __eg,
            name: controllerName
          });
        }
        return {
          count: count,
          controllers: controllers
        };
      }

      function __codexFindController(controllers, name, startIndex) {
        for (var __fc = 0; __fc < controllers.length; __fc++) {
          var controller = controllers[__fc];
          if (controller.index < startIndex) continue;
          if (controller.name === name) return controller;
        }
        return null;
      }

      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");
      var expectedLayerName = ${ports.aeLiteral(expectedLayerName)};
      if (expectedLayerName && layer.name !== expectedLayerName) {
        throw new Error("Layer name mismatch. Expected " + expectedLayerName + " but found " + layer.name + ".");
      }

      var propertyPath = ${ports.aeLiteral(propertyPath)};
      var prop = __codexResolveProperty(layer, propertyPath);
      var expectedPropertyName = ${ports.aeLiteral(expectedPropertyName)};
      var expectedPropertyMatchName = ${ports.aeLiteral(expectedPropertyMatchName)};
      if (expectedPropertyName && prop.name !== expectedPropertyName) {
        throw new Error("Property name mismatch. Expected " + expectedPropertyName + " but found " + prop.name + ".");
      }
      if (expectedPropertyMatchName && prop.matchName !== expectedPropertyMatchName) {
        throw new Error("Property matchName mismatch. Expected " + expectedPropertyMatchName + " but found " + prop.matchName + ".");
      }
      if (typeof prop.canAddToMotionGraphicsTemplate !== "function") {
        throw new Error("Resolved property does not support canAddToMotionGraphicsTemplate.");
      }
      if (typeof prop.addToMotionGraphicsTemplateAs !== "function") {
        throw new Error("Resolved property does not support addToMotionGraphicsTemplateAs.");
      }

      var beforeControllers = __codexEssentialGraphicsControllers(comp);
      var expectedCount = ${expectedControllerCountBefore === null ? "null" : expectedControllerCountBefore};
      if (expectedCount !== null && beforeControllers.count !== expectedCount) {
        throw new Error("Essential Graphics controller count mismatch. Expected " + expectedCount + " but found " + beforeControllers.count + ".");
      }

      var canAdd = false;
      try { canAdd = prop.canAddToMotionGraphicsTemplate(comp) === true; } catch (__canAddError) { throw new Error("canAddToMotionGraphicsTemplate failed: " + __canAddError.message); }
      if (!canAdd) {
        throw new Error("Property cannot be added to the Essential Graphics panel for this composition.");
      }

      var requestedControllerName = ${ports.aeLiteral(controllerName)};
      app.beginUndoGroup("Codex Add Property To Essential Graphics");
      try {
        var added = prop.addToMotionGraphicsTemplateAs(comp, requestedControllerName) === true;
        var afterControllers = __codexEssentialGraphicsControllers(comp);
        var newController = __codexFindController(afterControllers.controllers, requestedControllerName, beforeControllers.count + 1);
        var existingController = newController || __codexFindController(afterControllers.controllers, requestedControllerName, 1);
        return {
          comp: {
            itemIndex: __codexProjectIndexForItem(comp),
            name: comp.name,
            numLayers: comp.numLayers
          },
          layer: __codexLayerInfo(layer),
          property: __codexPropertyInfo(prop, layer, true, true),
          controllerName: requestedControllerName,
          added: added,
          beforeControllers: beforeControllers,
          afterControllers: afterControllers,
          controller: existingController,
          postVerification: {
            ok: added === true && !!existingController && afterControllers.count === beforeControllers.count + 1,
            controllerCountIncremented: afterControllers.count === beforeControllers.count + 1,
            controllerNamePresent: !!existingController,
            canAddBefore: canAdd
          }
        };
      } finally {
        app.endUndoGroup();
      }
    `);
    return ports.toolResult(result.result);
  }

  if (name === "set_property_value") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const expectedCompItemId=ports.optionalPositiveInteger(args,"expectedCompItemId");
    const expectedLayerId=ports.optionalPositiveInteger(args,"expectedLayerId");
    const expectedLayerIds=args.expectedLayerIds===undefined ? null : ports.requiredPositiveIntegerList({expectedLayerId:args.expectedLayerIds},"expectedLayerId");
    const layerIndices = ports.requiredPositiveIntegerList(args, "layerIndex");
    if(expectedLayerId!==null && layerIndices.length!==1) throw new Error("single_expected_layer_id_requires_one_target");
    if(expectedLayerIds && (expectedLayerIds.length!==layerIndices.length || expectedLayerId!==null || new Set(expectedLayerIds).size!==expectedLayerIds.length)) throw new Error("expected_layer_ids_invalid");
    const time = ports.optionalNumber(args, "time", null);
    const setAtTime = ports.optionalBoolean(args, "setAtTime", time !== null);

    let propertyPath;
    if (Array.isArray(args.propertyPath)) {
      propertyPath = args.propertyPath;
    } else if (typeof args.propertyPath === "string" && args.propertyPath.trim().startsWith("[")) {
      propertyPath = JSON.parse(args.propertyPath);
    } else if (typeof args.propertyPath === "string" && args.propertyPath.trim()) {
      propertyPath = args.propertyPath.split(".").map((part) => part.trim()).filter(Boolean);
    } else {
      return ports.toolResult("propertyPath must be an array, a property-name string, or a JSON-encoded array string.", true);
    }

    if (propertyPath.length === 0) return ports.toolResult("propertyPath must not be empty.", true);
    if (!ports.hasArg(args, "value")) return ports.toolResult("value is required.", true);
    if (setAtTime && time === null) return ports.toolResult("time is required when setAtTime is true.", true);

    const value = args.value;

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)}, ${expectedCompItemId === null ? "null" : expectedCompItemId});
      var layerIndices = ${ports.aeLiteral(layerIndices)};
      var expectedLayerIds=${ports.aeLiteral(expectedLayerIds || (expectedLayerId===null ? [] : [expectedLayerId]))};
      var propertyPath = ${ports.aeLiteral(propertyPath)};
      var requestedValue = ${ports.aeLiteral(value)};
      ${setterIdentityGuard}
      var shouldSetAtTime = ${setAtTime ? "true" : "false"};
      var targetTime = ${time === null ? "null" : time};
      var layerAttributeName = propertyPath.length === 1 ? String(propertyPath[0]) : "";
      var layerAttributeSetters = {
        threeDLayer: true,
        collapseTransformation: true,
        motionBlur: true
      };
      var isLayerAttribute = layerAttributeSetters[layerAttributeName] === true;

      var preparedTargets = [];
      for (var __pre = 0; __pre < layerIndices.length; __pre++) {
        var preLayer = __codexResolveLayer(comp, layerIndices[__pre], expectedLayerIds[__pre]);
        if (!preLayer || preLayer.locked) throw new Error("Layer missing or locked at index " + layerIndices[__pre]);
        if (isLayerAttribute) {
          if (shouldSetAtTime) throw new Error(layerAttributeName + " cannot be keyframed with setAtTime.");
          if (layerAttributeName === "collapseTransformation" && preLayer.canSetCollapseTransformation === false) throw new Error("Layer cannot set collapseTransformation.");
          preparedTargets.push({layer: preLayer});
        } else {
          var preProp = __codexResolveProperty(preLayer, propertyPath);
          if (typeof preProp[shouldSetAtTime ? "setValueAtTime" : "setValue"] !== "function") throw new Error("Property is not writable.");
          preparedTargets.push({layer: preLayer, prop: preProp, value: __codexPreparePropertyValue(preProp, requestedValue)});
        }
      }
      app.beginUndoGroup("Codex Set Property Value");
      try {
      var layers = [];
      var properties = [];
      for (var __li = 0; __li < layerIndices.length; __li++) {
        var layer = preparedTargets[__li].layer;
        if (!layer) throw new Error("Layer not found at index " + layerIndices[__li] + ".");
        if (layer.locked) throw new Error("Layer is locked: " + layer.name);

        if (isLayerAttribute) {
          if (shouldSetAtTime) throw new Error(layerAttributeName + " cannot be keyframed with setAtTime.");
          if (layerAttributeName === "collapseTransformation") {
            var canSetCollapseTransformation = true;
            try { canSetCollapseTransformation = layer.canSetCollapseTransformation !== false; } catch (__collapseCheckError) {}
            if (!canSetCollapseTransformation) {
              throw new Error("Layer cannot set collapseTransformation. Use a precomp/vector-capable layer and read it back.");
            }
          }
          layer[layerAttributeName] = !!requestedValue;
          layers.push(__codexLayerInfo(layer));
          properties.push({
            name: layerAttributeName,
            matchName: layerAttributeName,
            propertyPath: [{ name: layerAttributeName, matchName: layerAttributeName }],
            value: !!layer[layerAttributeName]
          });
          continue;
        }

        var prop = preparedTargets[__li].prop;
        var preparedValue = preparedTargets[__li].value;
        if (shouldSetAtTime) {
          prop.setValueAtTime(targetTime, preparedValue);
        } else {
          prop.setValue(preparedValue);
        }
        layers.push(__codexLayerInfo(layer));
        properties.push(__codexPropertyInfo(prop, layer, true, true));
      }
      var response = {
        comp: {
          itemId: comp.id,
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        layer: layers.length === 1 ? layers[0] : null,
        layers: layers,
        property: properties.length === 1 ? properties[0] : null,
        properties: properties,
        setAtTime: shouldSetAtTime,
        time: targetTime
      };
      return response;
      } finally { app.endUndoGroup(); }
    `);
    return ports.toolResult(result.result);
  }

  if (name === "set_layer_metadata") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const expectedCompName = ports.optionalString(args, "expectedCompName", "");
    if (compItemIndex === null && !compName) return ports.toolResult("compItemIndex or compName is required for set_layer_metadata.", true);

    const allowedKeys = new Set([
      "compItemIndex",
      "compName",
      "expectedCompName",
      "layerIndices",
      "expectedLayerNames",
      "comment",
      "label",
      "locked",
      "enabled",
      "guideLayer",
      "motionBlur",
      "audioEnabled",
      "autoCheckpoint",
      "checkpointLabel",
      "idempotencyKey",
      "idempotencyScope",
      "verifyAfter",
      ports.M100_DIRECT_ESCAPE_HATCH_ARG
    ]);
    const unsupportedKeys = Object.keys(args || {}).filter((key) => !allowedKeys.has(key));
    if (unsupportedKeys.length) return ports.toolResult("Unsupported set_layer_metadata fields: " + unsupportedKeys.join(", "), true);

    let layerIndices;
    try {
      layerIndices = ports.requiredExplicitPositiveIntegerList(args, "layerIndices");
    } catch (error) {
      return ports.toolResult(error.message || String(error), true);
    }

    let expectedLayerNames = null;
    if (ports.hasArg(args, "expectedLayerNames")) {
      expectedLayerNames = args.expectedLayerNames;
      if (typeof expectedLayerNames === "string" && expectedLayerNames.trim().startsWith("[")) {
        expectedLayerNames = JSON.parse(expectedLayerNames);
      }
      if (!Array.isArray(expectedLayerNames)) return ports.toolResult("expectedLayerNames must be an array when provided.", true);
      expectedLayerNames = expectedLayerNames.map((value) => String(value));
      if (expectedLayerNames.length !== layerIndices.length) {
        return ports.toolResult("expectedLayerNames must have the same length as layerIndices.", true);
      }
    }

    const requested = {};
    const hasCommentUpdate = Object.prototype.hasOwnProperty.call(args || {}, "comment") && args.comment !== undefined && args.comment !== null;
    if (hasCommentUpdate) {
      requested.comment = String(args.comment);
      if (requested.comment.length > 500) return ports.toolResult("comment must be 500 characters or fewer.", true);
    }
    if (ports.hasArg(args, "label")) {
      const label = ports.optionalNumber(args, "label", null);
      if (!Number.isInteger(label) || label < 0 || label > 16) return ports.toolResult("label must be an integer from 0 through 16.", true);
      requested.label = label;
    }
    if (ports.hasArg(args, "locked")) {
      requested.locked = ports.optionalBoolean(args, "locked", false);
    }
    if (ports.hasArg(args, "enabled")) {
      requested.enabled = ports.optionalBoolean(args, "enabled", true);
    }
    if (ports.hasArg(args, "guideLayer")) {
      requested.guideLayer = ports.optionalBoolean(args, "guideLayer", false);
    }
    if (ports.hasArg(args, "motionBlur")) {
      if (typeof args.motionBlur !== "boolean") return ports.toolResult("motionBlur must be a boolean.", true);
      requested.motionBlur = args.motionBlur;
    }
    if (ports.hasArg(args, "audioEnabled")) {
      if (typeof args.audioEnabled !== "boolean") return ports.toolResult("audioEnabled must be a boolean.", true);
      requested.audioEnabled = args.audioEnabled;
    }

    const requestedKeys = Object.keys(requested);
    if (!requestedKeys.length) return ports.toolResult("At least one approved layer metadata update is required: comment, label, locked, enabled, guideLayer, motionBlur, or audioEnabled.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var expectedCompName = ${ports.aeLiteral(expectedCompName)};
      if (expectedCompName && comp.name !== expectedCompName) {
        throw new Error("Composition name mismatch. Expected '" + expectedCompName + "' but found '" + comp.name + "'.");
      }
      var layerIndices = ${ports.aeLiteral(layerIndices)};
      var expectedLayerNames = ${expectedLayerNames ? ports.aeLiteral(expectedLayerNames) : "null"};
      var requested = ${ports.aeLiteral(requested)};
      var requestedKeys = ${ports.aeLiteral(requestedKeys)};

      function __codexMetadataFieldMatches(after, field) {
        if (field === "comment") return String(after.comment || "") === String(requested.comment || "");
        if (field === "label") return Number(after.label) === Number(requested.label);
        if (field === "locked") return after.locked === requested.locked;
        if (field === "enabled") return after.enabled === requested.enabled;
        if (field === "guideLayer") return after.guideLayer === requested.guideLayer;
        if (field === "motionBlur") return after.motionBlur === requested.motionBlur;
        if (field === "audioEnabled") return after.audioEnabled === requested.audioEnabled;
        return false;
      }

      app.beginUndoGroup("Codex Set Layer Metadata");
      var changed = [];
      var allMatch = true;
      for (var __li = 0; __li < layerIndices.length; __li++) {
        var requestedIndex = layerIndices[__li];
        var layer = comp.layer(requestedIndex);
        if (!layer) throw new Error("Layer not found at index " + requestedIndex + ".");
        if (expectedLayerNames && layer.name !== expectedLayerNames[__li]) {
          throw new Error("Layer name mismatch at index " + requestedIndex + ". Expected '" + expectedLayerNames[__li] + "' but found '" + layer.name + "'.");
        }

        var before = __codexLayerInfo(layer);
        if (requested.motionBlur !== undefined && before.motionBlur === undefined) throw new Error("Layer does not support motionBlur: " + layer.name + ".");
        if (requested.audioEnabled !== undefined && before.audioEnabled === undefined) throw new Error("Layer does not support audioEnabled: " + layer.name + ".");
        if (before.locked && (requested.comment !== undefined || requested.label !== undefined || requested.enabled !== undefined || requested.guideLayer !== undefined || requested.motionBlur !== undefined || requested.audioEnabled !== undefined) && requested.locked !== false) {
          throw new Error("Layer is locked: " + layer.name + ". Unlock explicitly before setting comment, label, enabled, guideLayer, motionBlur, or audioEnabled.");
        }

        if (requested.locked === false) layer.locked = false;
        if (requested.comment !== undefined) layer.comment = String(requested.comment);
        if (requested.label !== undefined) layer.label = Number(requested.label);
        if (requested.enabled !== undefined) layer.enabled = requested.enabled;
        if (requested.guideLayer !== undefined) layer.guideLayer = requested.guideLayer;
        if (requested.motionBlur !== undefined) layer.motionBlur = requested.motionBlur;
        if (requested.audioEnabled !== undefined) layer.audioEnabled = requested.audioEnabled;
        if (requested.locked === true) layer.locked = true;

        var after = __codexLayerInfo(layer);
        var fieldMatches = {};
        for (var __fieldIndex = 0; __fieldIndex < requestedKeys.length; __fieldIndex++) {
          var field = requestedKeys[__fieldIndex];
          fieldMatches[field] = __codexMetadataFieldMatches(after, field);
          if (!fieldMatches[field]) allMatch = false;
        }
        changed.push({
          layerIndex: requestedIndex,
          expectedLayerName: expectedLayerNames ? expectedLayerNames[__li] : null,
          before: before,
          after: after,
          fieldMatches: fieldMatches
        });
      }

      var layers = [];
      for (var __changedIndex = 0; __changedIndex < changed.length; __changedIndex++) {
        layers.push(changed[__changedIndex].after);
      }
      var response = {
        comp: {
          itemId: comp.id,
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        requestedLayerIndices: layerIndices,
        expectedLayerNames: expectedLayerNames,
        updatedFields: requestedKeys,
        updates: requested,
        changedCount: changed.length,
        layer: layers.length === 1 ? layers[0] : null,
        layers: layers,
        changed: changed,
        postVerification: {
          ok: allMatch,
          requestedCount: layerIndices.length,
          changedCount: changed.length,
          updatedFields: requestedKeys
        }
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "set_layer_blending_mode") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    if (compItemIndex === null && !compName) return ports.toolResult("compItemIndex or compName is required for set_layer_blending_mode.", true);

    const allowedKeys = new Set([
      "compItemIndex",
      "compName",
      "layerIndices",
      "expectedLayerNames",
      "expectedCurrentBlendingModes",
      "blendingMode",
      "autoCheckpoint",
      "checkpointLabel",
      "idempotencyKey",
      "idempotencyScope",
      "verifyAfter",
      ports.M100_DIRECT_ESCAPE_HATCH_ARG
    ]);
    const unsupportedKeys = Object.keys(args || {}).filter((key) => !allowedKeys.has(key));
    if (unsupportedKeys.length) return ports.toolResult("Unsupported set_layer_blending_mode fields: " + unsupportedKeys.join(", "), true);

    let layerIndices;
    try {
      layerIndices = ports.requiredExplicitPositiveIntegerList(args, "layerIndices");
    } catch (error) {
      return ports.toolResult(error.message || String(error), true);
    }

    let expectedLayerNames = null;
    if (ports.hasArg(args, "expectedLayerNames")) {
      expectedLayerNames = args.expectedLayerNames;
      if (typeof expectedLayerNames === "string" && expectedLayerNames.trim().startsWith("[")) {
        expectedLayerNames = JSON.parse(expectedLayerNames);
      }
      if (!Array.isArray(expectedLayerNames)) return ports.toolResult("expectedLayerNames must be an array when provided.", true);
      expectedLayerNames = expectedLayerNames.map((value) => String(value));
      if (expectedLayerNames.length !== layerIndices.length) {
        return ports.toolResult("expectedLayerNames must have the same length as layerIndices.", true);
      }
    }

    let expectedCurrentBlendingModes = null;
    if (ports.hasArg(args, "expectedCurrentBlendingModes")) {
      expectedCurrentBlendingModes = args.expectedCurrentBlendingModes;
      if (typeof expectedCurrentBlendingModes === "string" && expectedCurrentBlendingModes.trim().startsWith("[")) {
        expectedCurrentBlendingModes = JSON.parse(expectedCurrentBlendingModes);
      }
      if (!Array.isArray(expectedCurrentBlendingModes)) return ports.toolResult("expectedCurrentBlendingModes must be an array when provided.", true);
      expectedCurrentBlendingModes = expectedCurrentBlendingModes.map((value) => String(value).trim().toLowerCase());
      if (expectedCurrentBlendingModes.length !== layerIndices.length) {
        return ports.toolResult("expectedCurrentBlendingModes must have the same length as layerIndices.", true);
      }
      const invalidExpectedModes = expectedCurrentBlendingModes.filter((value) => !["normal", "difference"].includes(value));
      if (invalidExpectedModes.length) return ports.toolResult("expectedCurrentBlendingModes only supports normal or difference.", true);
    }

    const blendingMode = ports.optionalString(args, "blendingMode", "").trim().toLowerCase();
    if (!["normal", "difference"].includes(blendingMode)) return ports.toolResult("blendingMode must be normal or difference.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var layerIndices = ${ports.aeLiteral(layerIndices)};
      var expectedLayerNames = ${expectedLayerNames ? ports.aeLiteral(expectedLayerNames) : "null"};
      var expectedCurrentBlendingModes = ${expectedCurrentBlendingModes ? ports.aeLiteral(expectedCurrentBlendingModes) : "null"};
      var targetModeName = ${ports.aeLiteral(blendingMode)};
      var targetMode = __codexBlendingModeValue(targetModeName);

      app.beginUndoGroup("Codex Set Layer Blending Mode");
      var changed = [];
      var allMatch = true;
      for (var __li = 0; __li < layerIndices.length; __li++) {
        var requestedIndex = layerIndices[__li];
        var layer = comp.layer(requestedIndex);
        if (!layer) throw new Error("Layer not found at index " + requestedIndex + ".");
        if (expectedLayerNames && layer.name !== expectedLayerNames[__li]) {
          throw new Error("Layer name mismatch at index " + requestedIndex + ". Expected '" + expectedLayerNames[__li] + "' but found '" + layer.name + "'.");
        }

        var before = __codexLayerInfo(layer);
        var beforeModeName = before.blendingModeName || __codexBlendingModeName(layer.blendingMode);
        if (expectedCurrentBlendingModes && beforeModeName !== expectedCurrentBlendingModes[__li]) {
          throw new Error("Layer blending mode mismatch at index " + requestedIndex + ". Expected '" + expectedCurrentBlendingModes[__li] + "' but found '" + beforeModeName + "'.");
        }
        if (before.locked) throw new Error("Layer is locked: " + layer.name + ". Unlock explicitly before setting blending mode.");

        layer.blendingMode = targetMode;
        var after = __codexLayerInfo(layer);
        var fieldMatches = {
          blendingMode: after.blendingModeName === targetModeName
        };
        if (!fieldMatches.blendingMode) allMatch = false;
        changed.push({
          layerIndex: requestedIndex,
          expectedLayerName: expectedLayerNames ? expectedLayerNames[__li] : null,
          expectedCurrentBlendingMode: expectedCurrentBlendingModes ? expectedCurrentBlendingModes[__li] : null,
          requestedBlendingMode: targetModeName,
          before: before,
          after: after,
          fieldMatches: fieldMatches
        });
      }

      var layers = [];
      for (var __changedIndex = 0; __changedIndex < changed.length; __changedIndex++) {
        layers.push(changed[__changedIndex].after);
      }
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        requestedLayerIndices: layerIndices,
        expectedLayerNames: expectedLayerNames,
        expectedCurrentBlendingModes: expectedCurrentBlendingModes,
        requestedBlendingMode: targetModeName,
        changedCount: changed.length,
        layer: layers.length === 1 ? layers[0] : null,
        layers: layers,
        changed: changed,
        postVerification: {
          ok: allMatch,
          requestedCount: layerIndices.length,
          changedCount: changed.length,
          requestedBlendingMode: targetModeName
        }
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "align_layers_to_time") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndices = ports.optionalPositiveIntegerList(args, "layerIndices");
    const targetTime = ports.optionalNumber(args, "targetTime", null);
    const align = ports.optionalString(args, "align", "inPoint");

    if (align !== "inPoint" && align !== "startTime") {
      return ports.toolResult("align must be one of: inPoint, startTime.", true);
    }

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var requestedLayerIndices = ${layerIndices ? ports.aeLiteral(layerIndices) : "null"};
      var targetTime = ${targetTime === null ? "comp.time" : targetTime};
      var alignMode = ${ports.aeLiteral(align)};

      function __codexLayerTiming(layer) {
        return {
          index: layer.index,
          name: layer.name,
          startTime: layer.startTime,
          inPoint: layer.inPoint,
          outPoint: layer.outPoint,
          duration: layer.outPoint - layer.inPoint
        };
      }

      var layers = [];
      if (requestedLayerIndices && requestedLayerIndices.length) {
        for (var __r = 0; __r < requestedLayerIndices.length; __r++) {
          var requestedLayer = comp.layer(requestedLayerIndices[__r]);
          if (!requestedLayer) throw new Error("Layer not found at index " + requestedLayerIndices[__r] + ".");
          layers.push(requestedLayer);
        }
      } else {
        for (var __s = 0; __s < comp.selectedLayers.length; __s++) {
          layers.push(comp.selectedLayers[__s]);
        }
      }
      if (!layers.length) throw new Error("No target layers. Select layers or pass layerIndices.");

      app.beginUndoGroup("Codex Align Layers To Time");
      var aligned = [];
      for (var __i = 0; __i < layers.length; __i++) {
        var layer = layers[__i];
        if (layer.locked) throw new Error("Layer is locked: " + layer.name);
        var before = __codexLayerTiming(layer);
        if (alignMode === "startTime") {
          layer.startTime = targetTime;
        } else {
          var delta = targetTime - layer.inPoint;
          layer.startTime = layer.startTime + delta;
        }
        aligned.push({
          before: before,
          after: __codexLayerTiming(layer),
          layer: __codexLayerInfo(layer)
        });
      }
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name,
          time: comp.time
        },
        targetTime: targetTime,
        align: alignMode,
        changedCount: aligned.length,
        layer: aligned.length === 1 ? aligned[0].layer : null,
        layers: aligned.map(function (item) { return item.layer; }),
        aligned: aligned
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "set_comp_current_time") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const hasTime = ports.hasArg(args, "time");
    const hasFrame = ports.hasArg(args, "frame");
    const time = hasTime ? ports.optionalNumber(args, "time", null) : null;
    const frame = hasFrame ? ports.optionalNumber(args, "frame", null) : null;
    const frameRate = ports.hasArg(args, "frameRate") ? ports.optionalNumber(args, "frameRate", null) : null;
    const expectedCurrentTime = ports.hasArg(args, "expectedCurrentTime") ? ports.optionalNumber(args, "expectedCurrentTime", null) : null;
    const clampToDuration = ports.optionalBoolean(args, "clampToDuration", false);
    const openInViewer = ports.optionalBoolean(args, "openInViewer", false);

    if (compItemIndex === null && !compName) return ports.toolResult("compItemIndex or compName is required.", true);
    if (hasTime === hasFrame) return ports.toolResult("Provide exactly one of time or frame.", true);
    if (hasTime && (time === null || !Number.isFinite(time))) return ports.toolResult("time must be a finite number of seconds.", true);
    if (hasFrame && (frame === null || !Number.isFinite(frame) || !Number.isInteger(frame) || frame < 0)) {
      return ports.toolResult("frame must be a finite zero-based integer.", true);
    }
    if (frameRate !== null && (!Number.isFinite(frameRate) || frameRate <= 0)) return ports.toolResult("frameRate must be greater than 0.", true);
    if (expectedCurrentTime !== null && !Number.isFinite(expectedCurrentTime)) return ports.toolResult("expectedCurrentTime must be finite when provided.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var requestedTime = ${hasTime ? time : "null"};
      var requestedFrame = ${hasFrame ? frame : "null"};
      var explicitFrameRate = ${frameRate === null ? "null" : frameRate};
      var expectedCurrentTime = ${expectedCurrentTime === null ? "null" : expectedCurrentTime};
      var clampToDuration = ${clampToDuration ? "true" : "false"};
      var openInViewer = ${openInViewer ? "true" : "false"};

      function __codexFiniteNumber(value) {
        return typeof value === "number" && isFinite(value);
      }

      function __codexCompTimeSnapshot(targetComp) {
        return {
          itemIndex: __codexProjectIndexForItem(targetComp),
          name: targetComp.name,
          time: targetComp.time,
          duration: targetComp.duration,
          frameRate: targetComp.frameRate,
          displayStartTime: targetComp.displayStartTime,
          workAreaStart: targetComp.workAreaStart,
          workAreaDuration: targetComp.workAreaDuration,
          width: targetComp.width,
          height: targetComp.height,
          numLayers: targetComp.numLayers
        };
      }

      var frameRateUsed = null;
      if (requestedFrame !== null) {
        frameRateUsed = explicitFrameRate !== null ? explicitFrameRate : comp.frameRate;
        if (!__codexFiniteNumber(frameRateUsed) || frameRateUsed <= 0) throw new Error("frameRate must be greater than 0 for frame-derived current time.");
        requestedTime = requestedFrame / frameRateUsed;
      }
      if (!__codexFiniteNumber(requestedTime)) throw new Error("Target current time must be finite.");

      var before = __codexCompTimeSnapshot(comp);
      if (expectedCurrentTime !== null && Math.abs(before.time - expectedCurrentTime) > 0.001) {
        throw new Error("Current time guard mismatch. Expected " + expectedCurrentTime + " but found " + before.time + ".");
      }

      var targetTime = requestedTime;
      var clamped = false;
      if (targetTime < 0 || targetTime > comp.duration) {
        if (!clampToDuration) throw new Error("Target current time must be between 0 and composition duration.");
        targetTime = Math.max(0, Math.min(comp.duration, targetTime));
        clamped = true;
      }

      app.beginUndoGroup("Codex Set Comp Current Time");
      try {
        if (openInViewer && comp.openInViewer) comp.openInViewer();
        comp.time = targetTime;
      } finally {
        app.endUndoGroup();
      }

      var after = __codexCompTimeSnapshot(comp);
      var timeMatches = Math.abs(after.time - targetTime) <= 0.001;
      return {
        comp: {
          itemIndex: after.itemIndex,
          name: after.name,
          time: after.time,
          duration: after.duration,
          frameRate: after.frameRate
        },
        requested: {
          time: requestedTime,
          frame: requestedFrame,
          frameRate: frameRateUsed,
          clampToDuration: clampToDuration
        },
        targetTime: targetTime,
        clamped: clamped,
        before: before,
        after: after,
        postVerification: {
          ok: timeMatches,
          timeMatches: timeMatches,
          withinBounds: targetTime >= 0 && targetTime <= after.duration,
          compIdentityMatches: before.itemIndex === after.itemIndex && before.name === after.name,
          structuralFieldsUnchanged:
            before.duration === after.duration &&
            before.frameRate === after.frameRate &&
            before.width === after.width &&
            before.height === after.height &&
            before.numLayers === after.numLayers &&
            before.workAreaStart === after.workAreaStart &&
            before.workAreaDuration === after.workAreaDuration
        }
      };
    `);
    return ports.toolResult(result.result);
  }

  if (name === "set_comp_work_area") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const start = ports.optionalNumber(args, "start", null);
    const duration = ports.optionalNumber(args, "duration", null);

    if (duration === null || duration <= 0) return ports.toolResult("duration must be greater than 0.", true);
    if (start !== null && start < 0) return ports.toolResult("start must be 0 or greater.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var requestedStart = ${start === null ? "comp.time" : start};
      var requestedDuration = ${duration};
      if (requestedStart < 0) throw new Error("Work-area start must be 0 or greater.");
      if (requestedDuration <= 0) throw new Error("Work-area duration must be greater than 0.");

      app.beginUndoGroup("Codex Set Comp Work Area");
      var before = {
        workAreaStart: comp.workAreaStart,
        workAreaDuration: comp.workAreaDuration
      };
      comp.workAreaStart = requestedStart;
      comp.workAreaDuration = requestedDuration;
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name,
          duration: comp.duration
        },
        before: before,
        workAreaStart: comp.workAreaStart,
        workAreaDuration: comp.workAreaDuration
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "set_comp_properties") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const expectedCompName = ports.optionalString(args, "expectedCompName", "");
    if (compItemIndex === null && !compName) return ports.toolResult("compItemIndex or compName is required.", true);

    const allowedKeys = new Set([
      "compItemIndex",
      "compName",
      "expectedCompName",
      "width",
      "height",
      "pixelAspect",
      "duration",
      "frameRate",
      "bgColor",
      "displayStartTime",
      "displayStartFrame",
      "preserveNestedFrameRate",
      "motionBlur",
      "autoCheckpoint",
      "checkpointLabel",
      "idempotencyKey",
      "idempotencyScope",
      "verifyAfter",
      ports.M100_DIRECT_ESCAPE_HATCH_ARG
    ]);
    const unsupportedKeys = Object.keys(args || {}).filter((key) => !allowedKeys.has(key));
    if (unsupportedKeys.length) return ports.toolResult("Unsupported set_comp_properties fields: " + unsupportedKeys.join(", "), true);

    const requested = {};
    if (ports.hasArg(args, "width")) {
      const width = ports.optionalNumber(args, "width", null);
      if (!Number.isInteger(width) || width < 4) return ports.toolResult("width must be an integer of at least 4.", true);
      requested.width = width;
    }
    if (ports.hasArg(args, "height")) {
      const height = ports.optionalNumber(args, "height", null);
      if (!Number.isInteger(height) || height < 4) return ports.toolResult("height must be an integer of at least 4.", true);
      requested.height = height;
    }
    if (ports.hasArg(args, "pixelAspect")) {
      const pixelAspect = ports.optionalNumber(args, "pixelAspect", null);
      if (pixelAspect <= 0) return ports.toolResult("pixelAspect must be greater than 0.", true);
      requested.pixelAspect = pixelAspect;
    }
    if (ports.hasArg(args, "duration")) {
      const duration = ports.optionalNumber(args, "duration", null);
      if (duration <= 0) return ports.toolResult("duration must be greater than 0.", true);
      requested.duration = duration;
    }
    if (ports.hasArg(args, "frameRate")) {
      const frameRate = ports.optionalNumber(args, "frameRate", null);
      if (frameRate <= 0) return ports.toolResult("frameRate must be greater than 0.", true);
      requested.frameRate = frameRate;
    }
    if (ports.hasArg(args, "displayStartTime")) {
      requested.displayStartTime = ports.optionalNumber(args, "displayStartTime", null);
    }
    if (ports.hasArg(args, "displayStartFrame")) {
      const displayStartFrame = ports.optionalNumber(args, "displayStartFrame", null);
      if (!Number.isInteger(displayStartFrame) || displayStartFrame < 0) return ports.toolResult("displayStartFrame must be a non-negative integer.", true);
      requested.displayStartFrame = displayStartFrame;
    }
    if (ports.hasArg(args, "preserveNestedFrameRate")) {
      requested.preserveNestedFrameRate = ports.optionalBoolean(args, "preserveNestedFrameRate", null);
      if (requested.preserveNestedFrameRate === null) return ports.toolResult("preserveNestedFrameRate must be a boolean.", true);
    }
    if (ports.hasArg(args, "motionBlur")) {
      if (typeof args.motionBlur !== "boolean") return ports.toolResult("motionBlur must be a boolean.", true);
      requested.motionBlur = args.motionBlur;
    }
    if (ports.hasArg(args, "bgColor")) {
      const bgColor = ports.optionalNumberArray(args, "bgColor", null, 3, 3);
      if (bgColor.some((value) => value < 0 || value > 1)) return ports.toolResult("bgColor values must be between 0 and 1.", true);
      requested.bgColor = bgColor;
    }
    const requestedKeys = Object.keys(requested);
    if (!requestedKeys.length) return ports.toolResult("At least one approved comp property update is required.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var expectedCompName = ${ports.aeLiteral(expectedCompName)};
      if (expectedCompName && comp.name !== expectedCompName) {
        throw new Error("Composition name mismatch. Expected '" + expectedCompName + "' but found '" + comp.name + "'.");
      }
      var requested = ${ports.aeLiteral(requested)};
      var requestedKeys = ${ports.aeLiteral(requestedKeys)};

      function __codexCompProperties(comp) {
        var displayStartFrame = null;
        var displayStartFrameSupported = false;
        try {
          if (comp.displayStartFrame !== undefined) {
            displayStartFrame = comp.displayStartFrame;
            displayStartFrameSupported = true;
          }
        } catch (__displayStartFrameReadError) {}
        return {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name,
          width: comp.width,
          height: comp.height,
          pixelAspect: comp.pixelAspect,
          duration: comp.duration,
          frameRate: comp.frameRate,
          bgColor: comp.bgColor ? [comp.bgColor[0], comp.bgColor[1], comp.bgColor[2]] : null,
          displayStartTime: comp.displayStartTime,
          displayStartFrame: displayStartFrame,
          displayStartFrameSupported: displayStartFrameSupported,
          preserveNestedFrameRate: !!comp.preserveNestedFrameRate,
          motionBlur: !!comp.motionBlur,
          numLayers: comp.numLayers
        };
      }

      function __codexNear(a, b) {
        return Math.abs(Number(a) - Number(b)) <= 0.0001;
      }

      function __codexColorNear(a, b) {
        return Math.abs(Number(a) - Number(b)) <= ((0.5 / 255) + 0.000001);
      }

      function __codexColorMatches(actual, expected) {
        if (!actual || !expected || actual.length < 3 || expected.length < 3) return false;
        return __codexColorNear(actual[0], expected[0]) && __codexColorNear(actual[1], expected[1]) && __codexColorNear(actual[2], expected[2]);
      }

      function __codexFieldMatches(after, field, expected) {
        if (field === "bgColor") return __codexColorMatches(after.bgColor, expected);
        if (typeof expected === "boolean") return after[field] === expected;
        return __codexNear(after[field], expected);
      }

      function __codexSetDisplayStartFrame(targetComp, value) {
        var supported = false;
        try { supported = targetComp.displayStartFrame !== undefined; } catch (__displayStartFrameSupportError) {}
        if (!supported) throw new Error("CompItem.displayStartFrame is not supported by this After Effects version.");
        targetComp.displayStartFrame = value;
      }

      app.beginUndoGroup("Codex Set Comp Properties");
      var before = __codexCompProperties(comp);
      if (requested.width !== undefined) comp.width = requested.width;
      if (requested.height !== undefined) comp.height = requested.height;
      if (requested.pixelAspect !== undefined) comp.pixelAspect = requested.pixelAspect;
      if (requested.duration !== undefined) comp.duration = requested.duration;
      if (requested.frameRate !== undefined) comp.frameRate = requested.frameRate;
      if (requested.bgColor !== undefined) comp.bgColor = requested.bgColor;
      if (requested.displayStartTime !== undefined) comp.displayStartTime = requested.displayStartTime;
      if (requested.displayStartFrame !== undefined) __codexSetDisplayStartFrame(comp, requested.displayStartFrame);
      if (requested.preserveNestedFrameRate !== undefined) comp.preserveNestedFrameRate = requested.preserveNestedFrameRate;
      if (requested.motionBlur !== undefined) comp.motionBlur = requested.motionBlur;
      var after = __codexCompProperties(comp);
      var fieldMatches = {};
      var allMatch = true;
      for (var __fieldIndex = 0; __fieldIndex < requestedKeys.length; __fieldIndex++) {
        var field = requestedKeys[__fieldIndex];
        var matches = __codexFieldMatches(after, field, requested[field]);
        fieldMatches[field] = matches;
        if (!matches) allMatch = false;
      }
      var response = {
        comp: after,
        before: before,
        after: after,
        updates: requested,
        updatedFields: requestedKeys,
        postVerification: {
          ok: allMatch,
          updatedFields: requestedKeys,
          fieldMatches: fieldMatches,
          compIdentityMatches: before.itemIndex === after.itemIndex && before.name === after.name,
          layerCountUnchanged: before.numLayers === after.numLayers
        }
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "refresh_comp_panel") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const expectedMotionBlur = ports.optionalBoolean(args, "expectedMotionBlur", null);
    if (compItemIndex === null && !compName) return ports.toolResult("compItemIndex or compName is required for refresh_comp_panel.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var expectedMotionBlur = ${expectedMotionBlur === null ? "null" : ports.aeLiteral(expectedMotionBlur)};

      function __codexCompRefreshState(comp) {
        return {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name,
          width: comp.width,
          height: comp.height,
          duration: comp.duration,
          frameRate: comp.frameRate,
          workAreaStart: comp.workAreaStart,
          workAreaDuration: comp.workAreaDuration,
          time: comp.time,
          motionBlur: !!comp.motionBlur,
          numLayers: comp.numLayers
        };
      }

      var before = __codexCompRefreshState(comp);
      if (expectedMotionBlur !== null && before.motionBlur !== expectedMotionBlur) {
        throw new Error("Expected comp.motionBlur " + expectedMotionBlur + " but found " + before.motionBlur + ".");
      }
      app.beginUndoGroup("Codex Refresh Comp Panel");
      comp.motionBlur = !before.motionBlur;
      var transient = __codexCompRefreshState(comp);
      comp.motionBlur = before.motionBlur;
      var after = __codexCompRefreshState(comp);
      var response = {
        comp: after,
        before: before,
        transient: transient,
        after: after,
        refreshMethod: "comp.motionBlur-double-toggle",
        postVerification: {
          ok: before.itemIndex === after.itemIndex &&
            before.name === after.name &&
            before.motionBlur === after.motionBlur &&
            transient.motionBlur !== before.motionBlur &&
            before.numLayers === after.numLayers &&
            before.workAreaStart === after.workAreaStart &&
            before.workAreaDuration === after.workAreaDuration,
          compIdentityMatches: before.itemIndex === after.itemIndex && before.name === after.name,
          motionBlurRestored: before.motionBlur === after.motionBlur,
          transientToggled: transient.motionBlur !== before.motionBlur,
          layerCountUnchanged: before.numLayers === after.numLayers,
          workAreaUnchanged: before.workAreaStart === after.workAreaStart && before.workAreaDuration === after.workAreaDuration
        }
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "set_layer_time_range") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndices = ports.optionalPositiveIntegerList(args, "layerIndices");
    const expectedCompItemId = ports.optionalPositiveInteger(args, "expectedCompItemId");
    const expectedLayerId = ports.optionalPositiveInteger(args, "expectedLayerId");
    const expectedSourceItemId = ports.optionalPositiveInteger(args, "expectedSourceItemId");
    const startTime = ports.optionalNumber(args, "startTime", null);
    const inPoint = ports.optionalNumber(args, "inPoint", null);
    const outPoint = ports.optionalNumber(args, "outPoint", null);
    const duration = ports.optionalNumber(args, "duration", null);

    if (startTime === null && inPoint === null && outPoint === null && duration === null) {
      return ports.toolResult("Provide startTime, inPoint, outPoint, or duration.", true);
    }
    if (duration !== null && duration <= 0) return ports.toolResult("duration must be greater than 0.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var requestedLayerIndices = ${layerIndices ? ports.aeLiteral(layerIndices) : "null"};
      var requestedStartTime = ${startTime === null ? "null" : startTime};
      ${setterIdentityGuard}
      var requestedInPoint = ${inPoint === null ? "null" : inPoint};
      var requestedOutPoint = ${outPoint === null ? "null" : outPoint};
      var requestedDuration = ${duration === null ? "null" : duration};
      var layers = __codexResolveLayers(comp, requestedLayerIndices);
      if (${compName ? "comp.name !== " + ports.aeLiteral(compName) : "false"}) throw new Error("Composition name changed before timing edit.");
      if (${expectedCompItemId === null ? "false" : `comp.id !== ${expectedCompItemId}`}) throw new Error("Composition identity changed before timing edit.");
      if (${expectedLayerId === null ? "false" : "layers.length !== 1 || layers[0].id !== " + expectedLayerId}) throw new Error("Layer identity changed before timing edit.");
      if (${expectedSourceItemId === null ? "false" : "layers.length !== 1 || !layers[0].source || layers[0].source.id !== " + expectedSourceItemId}) throw new Error("Layer source changed before timing edit.");

      app.beginUndoGroup("Codex Set Layer Time Range");
      var changed = [];
      for (var __i = 0; __i < layers.length; __i++) {
        var layer = layers[__i];
        if (layer.locked) throw new Error("Layer is locked: " + layer.name);
        var before = __codexLayerTiming(layer);
        if (requestedStartTime !== null) layer.startTime = requestedStartTime;
        if (requestedInPoint !== null) layer.inPoint = requestedInPoint;
        if (requestedOutPoint !== null) layer.outPoint = requestedOutPoint;
        if (requestedDuration !== null) layer.outPoint = layer.inPoint + requestedDuration;
        if (layer.outPoint <= layer.inPoint) throw new Error("Layer outPoint must be after inPoint: " + layer.name);
        changed.push({
          before: before,
          after: __codexLayerTiming(layer),
          layer: __codexLayerInfo(layer)
        });
      }
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), itemId: comp.id, name: comp.name, time: comp.time },
        changedCount: changed.length,
        layer: changed.length === 1 ? changed[0].layer : null,
        layers: changed.map(function (item) { return item.layer; }),
        changed: changed
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "stagger_layers") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndices = ports.optionalPositiveIntegerList(args, "layerIndices");
    const startTime = ports.optionalNumber(args, "startTime", null);
    const gap = ports.optionalNumber(args, "gap", 0);
    const overlap = ports.optionalNumber(args, "overlap", 0);
    const order = ports.optionalString(args, "order", "selection");

    if (!["selection", "indexAsc", "indexDesc"].includes(order)) return ports.toolResult("order must be one of: selection, indexAsc, indexDesc.", true);
    if (overlap < 0) return ports.toolResult("overlap must be 0 or greater.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var requestedLayerIndices = ${layerIndices ? ports.aeLiteral(layerIndices) : "null"};
      var sequenceStart = ${startTime === null ? "comp.time" : startTime};
      var gap = ${gap};
      var overlap = ${overlap};
      var order = ${ports.aeLiteral(order)};
      var layers = __codexResolveLayers(comp, requestedLayerIndices);
      if (order === "indexAsc") {
        layers.sort(function (a, b) { return a.index - b.index; });
      } else if (order === "indexDesc") {
        layers.sort(function (a, b) { return b.index - a.index; });
      }

      app.beginUndoGroup("Codex Stagger Layers");
      var cursor = sequenceStart;
      var changed = [];
      for (var __i = 0; __i < layers.length; __i++) {
        var layer = layers[__i];
        if (layer.locked) throw new Error("Layer is locked: " + layer.name);
        var before = __codexLayerTiming(layer);
        var visibleDuration = Math.max(0, layer.outPoint - layer.inPoint);
        var delta = cursor - layer.inPoint;
        layer.startTime = layer.startTime + delta;
        changed.push({
          before: before,
          after: __codexLayerTiming(layer),
          layer: __codexLayerInfo(layer)
        });
        cursor = layer.outPoint + gap - overlap;
      }
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name, time: comp.time },
        startTime: sequenceStart,
        gap: gap,
        overlap: overlap,
        order: order,
        changedCount: changed.length,
        layers: changed.map(function (item) { return item.layer; }),
        changed: changed
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "split_layers_at_time") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndices = ports.optionalPositiveIntegerList(args, "layerIndices");
    const splitTime = ports.optionalNumber(args, "time", ports.optionalNumber(args, "targetTime", null));

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var requestedLayerIndices = ${layerIndices ? ports.aeLiteral(layerIndices) : "null"};
      var splitTime = ${splitTime === null ? "comp.time" : splitTime};
      var layers = __codexResolveLayers(comp, requestedLayerIndices);

      app.beginUndoGroup("Codex Split Layers At Time");
      var split = [];
      for (var __i = 0; __i < layers.length; __i++) {
        var layer = layers[__i];
        if (layer.locked) throw new Error("Layer is locked: " + layer.name);
        if (splitTime <= layer.inPoint || splitTime >= layer.outPoint) {
          throw new Error("Split time must be inside the layer time range: " + layer.name);
        }
        var before = __codexLayerTiming(layer);
        var newLayer = layer.splitLayer(splitTime);
        split.push({
          before: before,
          original: __codexLayerInfo(layer),
          newLayer: __codexLayerInfo(newLayer)
        });
      }
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name, time: comp.time },
        time: splitTime,
        changedCount: split.length,
        split: split,
        layers: split.map(function (item) { return item.newLayer; })
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "precompose_layers") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndices = ports.requiredPositiveIntegerList(args, "layerIndices");
    const newCompName = ports.optionalString(args, "newCompName", "");
    const moveAllAttributes = ports.optionalBoolean(args, "moveAllAttributes", true);
    const openInViewer = ports.optionalBoolean(args, "openInViewer", true);

    if (!newCompName) return ports.toolResult("newCompName is required.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var layerIndices = ${ports.aeLiteral(layerIndices)};
      var newCompName = ${ports.aeLiteral(newCompName)};
      var moveAllAttributes = ${moveAllAttributes ? "true" : "false"};
      var openInViewer = ${openInViewer ? "true" : "false"};
      for (var __i = 0; __i < layerIndices.length; __i++) {
        var layer = comp.layer(layerIndices[__i]);
        if (!layer) throw new Error("Layer not found at index " + layerIndices[__i] + ".");
        if (layer.locked) throw new Error("Layer is locked: " + layer.name);
      }

      app.beginUndoGroup("Codex Precompose Layers");
      var precomp = comp.layers.precompose(layerIndices, newCompName, moveAllAttributes);
      if (openInViewer && precomp && precomp.openInViewer) precomp.openInViewer();
      var response = {
        sourceComp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
        comp: { itemIndex: __codexProjectIndexForItem(precomp), name: precomp.name, numLayers: precomp.numLayers, duration: precomp.duration },
        layerIndices: layerIndices,
        moveAllAttributes: moveAllAttributes
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "replace_layer_source") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndices = ports.optionalPositiveIntegerList(args, "layerIndices");
    const sourceItemIndex = ports.optionalPositiveInteger(args, "sourceItemIndex");
    const sourceItemName = ports.optionalString(args, "sourceItemName", "");
    const sourceItemType = ports.optionalString(args, "sourceItemType", "");
    const expectedCompItemId = ports.optionalPositiveInteger(args, "expectedCompItemId");
    const expectedLayerId = ports.optionalPositiveInteger(args, "expectedLayerId");
    const expectedPreviousSourceItemId = ports.optionalPositiveInteger(args, "expectedPreviousSourceItemId");
    const expectedSourceItemId = ports.optionalPositiveInteger(args, "expectedSourceItemId");
    const fixExpressions = ports.optionalBoolean(args, "fixExpressions", true);

    if (!sourceItemIndex && !sourceItemName) return ports.toolResult("Provide sourceItemIndex or sourceItemName.", true);
    if (sourceItemType && !["comp", "footage"].includes(sourceItemType)) return ports.toolResult("sourceItemType must be one of: comp, footage.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var layers = __codexResolveLayers(comp, ${layerIndices ? ports.aeLiteral(layerIndices) : "null"});
      ${setterIdentityGuard}
      var sourceItem = __codexResolveProjectItem(${sourceItemIndex === null ? "null" : sourceItemIndex}, ${ports.aeLiteral(sourceItemName)}, ${ports.aeLiteral(sourceItemType)});
      if (!(sourceItem instanceof FootageItem) && !(sourceItem instanceof CompItem)) {
        throw new Error("Replacement source must be footage or a composition.");
      }
      if (${compName ? "comp.name !== " + ports.aeLiteral(compName) : "false"}) throw new Error("Composition name changed before source replacement.");
      if (${sourceItemName ? "sourceItem.name !== " + ports.aeLiteral(sourceItemName) : "false"}) throw new Error("Replacement source name changed.");
      if (${expectedCompItemId === null ? "false" : `comp.id !== ${expectedCompItemId}`}) throw new Error("Composition identity changed before source replacement.");
      if (${expectedSourceItemId === null ? "false" : `sourceItem.id !== ${expectedSourceItemId}`}) throw new Error("Replacement source identity changed.");
      if (${expectedLayerId === null ? "false" : "layers.length !== 1 || layers[0].id !== " + expectedLayerId}) throw new Error("Layer identity changed before source replacement.");
      if (${expectedPreviousSourceItemId === null ? "false" : "layers.length !== 1 || !layers[0].source || layers[0].source.id !== " + expectedPreviousSourceItemId}) throw new Error("Previous layer source changed before replacement.");
      var fixExpressions = ${fixExpressions ? "true" : "false"};

      app.beginUndoGroup("Codex Replace Layer Source");
      var changed = [];
      for (var __i = 0; __i < layers.length; __i++) {
        var layer = layers[__i];
        if (layer.locked) throw new Error("Layer is locked: " + layer.name);
        var before = __codexLayerInfo(layer);
        if (!layer.replaceSource) throw new Error("Layer source cannot be replaced: " + layer.name);
        layer.replaceSource(sourceItem, fixExpressions);
        changed.push({
          before: before,
          after: __codexLayerInfo(layer)
        });
      }
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), itemId: comp.id, name: comp.name },
        sourceItem: __codexItemReference(sourceItem),
        changedCount: changed.length,
        layers: changed.map(function (item) { return item.after; }),
        changed: changed
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "rename_layers") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndices = ports.optionalPositiveIntegerList(args, "layerIndices");
    const hasRenameName = Object.prototype.hasOwnProperty.call(args, "name") && args.name !== undefined && args.name !== null;
    const mode = ports.optionalString(args, "mode", hasRenameName ? "exact" : ports.hasArg(args, "prefix") ? "prefix" : ports.hasArg(args, "suffix") ? "suffix" : "findReplace");
    const renameName = hasRenameName ? String(args.name) : "";
    const allowEmptyName = ports.optionalBoolean(args, "allowEmptyName", false);
    const prefix = ports.optionalString(args, "prefix", "");
    const suffix = ports.optionalString(args, "suffix", "");
    const findText = ports.optionalString(args, "find", "");
    const replaceText = ports.optionalString(args, "replace", "");
    const caseSensitive = ports.optionalBoolean(args, "caseSensitive", true);
    let expectedLayerNames = null;
    if (ports.hasArg(args, "expectedLayerNames")) {
      expectedLayerNames = args.expectedLayerNames;
      if (typeof expectedLayerNames === "string" && expectedLayerNames.trim().startsWith("[")) {
        expectedLayerNames = JSON.parse(expectedLayerNames);
      }
      if (!Array.isArray(expectedLayerNames)) return ports.toolResult("expectedLayerNames must be an array when provided.", true);
      expectedLayerNames = expectedLayerNames.map((value) => String(value));
      if (!layerIndices || expectedLayerNames.length !== layerIndices.length) {
        return ports.toolResult("expectedLayerNames must have the same length as layerIndices.", true);
      }
    }

    if (!["exact", "prefix", "suffix", "findReplace"].includes(mode)) return ports.toolResult("mode must be one of: exact, prefix, suffix, findReplace.", true);
    if (allowEmptyName) {
      if (mode !== "exact" || renameName !== "") return ports.toolResult("allowEmptyName is only valid with mode:\"exact\" and name:\"\".", true);
      if (!layerIndices || layerIndices.length !== 1) return ports.toolResult("Empty layer-name reset requires exactly one explicit layer index per rename_layers call.", true);
      if (!expectedLayerNames || expectedLayerNames.length !== 1) return ports.toolResult("Empty layer-name reset requires expectedLayerNames for the target layer.", true);
    }

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var layers = __codexResolveLayers(comp, ${layerIndices ? ports.aeLiteral(layerIndices) : "null"});
      var mode = ${ports.aeLiteral(mode)};
      var exactName = ${ports.aeLiteral(renameName)};
      var allowEmptyName = ${allowEmptyName ? "true" : "false"};
      var expectedLayerNames = ${expectedLayerNames ? ports.aeLiteral(expectedLayerNames) : "null"};
      var prefix = ${ports.aeLiteral(prefix)};
      var suffix = ${ports.aeLiteral(suffix)};
      var findText = ${ports.aeLiteral(findText)};
      var replaceText = ${ports.aeLiteral(replaceText)};
      var caseSensitive = ${caseSensitive ? "true" : "false"};

      app.beginUndoGroup("Codex Rename Layers");
      var renamed = [];
      for (var __i = 0; __i < layers.length; __i++) {
        var layer = layers[__i];
        if (layer.locked) throw new Error("Layer is locked: " + layer.name);
        if (expectedLayerNames && layer.name !== expectedLayerNames[__i]) {
          throw new Error("Layer name mismatch at index " + layer.index + ". Expected '" + expectedLayerNames[__i] + "' but found '" + layer.name + "'.");
        }
        var beforeName = layer.name;
        var nextName = __codexRenameValue(beforeName, mode, __i + 1, layers.length, exactName, prefix, suffix, findText, replaceText, caseSensitive, allowEmptyName);
        layer.name = nextName;
        renamed.push({
          index: layer.index,
          before: beforeName,
          after: layer.name,
          layer: __codexLayerInfo(layer)
        });
      }
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
        mode: mode,
        expectedLayerNames: expectedLayerNames,
        allowEmptyName: allowEmptyName,
        changedCount: renamed.length,
        renamed: renamed,
        layers: renamed.map(function (item) { return item.layer; })
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "rename_project_items") {
    const itemIndices = ports.optionalPositiveIntegerList(args, "itemIndices");
    const query = ports.optionalString(args, "query", "");
    const type = ports.optionalString(args, "type", "");
    const exactName = ports.optionalBoolean(args, "exactName", false);
    const caseSensitive = ports.optionalBoolean(args, "caseSensitive", false);
    const limit = Math.max(1, Math.min(100, Math.floor(ports.optionalNumber(args, "limit", 25))));
    const mode = ports.optionalString(args, "mode", ports.hasArg(args, "name") ? "exact" : ports.hasArg(args, "prefix") ? "prefix" : ports.hasArg(args, "suffix") ? "suffix" : "findReplace");
    const renameName = ports.optionalString(args, "name", "");
    const prefix = ports.optionalString(args, "prefix", "");
    const suffix = ports.optionalString(args, "suffix", "");
    const findText = ports.optionalString(args, "find", "");
    const replaceText = ports.optionalString(args, "replace", "");

    if (type && !["comp", "footage", "folder"].includes(type)) return ports.toolResult("type must be one of: comp, footage, folder.", true);
    if (!itemIndices && !query) return ports.toolResult("Provide itemIndices or query.", true);
    if (!["exact", "prefix", "suffix", "findReplace"].includes(mode)) return ports.toolResult("mode must be one of: exact, prefix, suffix, findReplace.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var requestedItemIndices = ${itemIndices ? ports.aeLiteral(itemIndices) : "null"};
      var query = ${ports.aeLiteral(query)};
      var type = ${ports.aeLiteral(type)};
      var exactName = ${exactName ? "true" : "false"};
      var caseSensitive = ${caseSensitive ? "true" : "false"};
      var limit = ${limit};
      var mode = ${ports.aeLiteral(mode)};
      var exactRenameName = ${ports.aeLiteral(renameName)};
      var prefix = ${ports.aeLiteral(prefix)};
      var suffix = ${ports.aeLiteral(suffix)};
      var findText = ${ports.aeLiteral(findText)};
      var replaceText = ${ports.aeLiteral(replaceText)};
      var refs = [];

      if (requestedItemIndices && requestedItemIndices.length) {
        for (var __ri = 0; __ri < requestedItemIndices.length && refs.length < limit; __ri++) {
          var indexedItem = app.project.item(requestedItemIndices[__ri]);
          if (!indexedItem) throw new Error("Project item not found at index " + requestedItemIndices[__ri] + ".");
          if (!__codexMatchesItemType(indexedItem, type)) throw new Error("Project item does not match requested type: " + indexedItem.name);
          refs.push(__codexItemReference(indexedItem));
        }
      } else {
        refs = __codexFindProjectItems(query, type, exactName, caseSensitive, limit);
      }
      if (!refs.length) throw new Error("No project items matched.");

      app.beginUndoGroup("Codex Rename Project Items");
      var renamed = [];
      for (var __i = 0; __i < refs.length; __i++) {
        var item = app.project.item(refs[__i].itemIndex);
        var beforeName = item.name || "";
        var nextName = __codexRenameValue(beforeName, mode, __i + 1, refs.length, exactRenameName, prefix, suffix, findText, replaceText, caseSensitive);
        item.name = nextName;
        renamed.push({
          itemIndex: __codexProjectIndexForItem(item),
          before: beforeName,
          after: item.name,
          item: __codexItemReference(item)
        });
      }
      var response = {
        mode: mode,
        query: query,
        type: type,
        changedCount: renamed.length,
        renamed: renamed
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "update_text_layer") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndex = ports.requiredPositiveInteger(args, "layerIndex");
    const patch = {};
    for (const key of ["text", "font", "fontSize", "fillColor", "applyFill", "strokeColor", "applyStroke", "strokeWidth", "tracking", "leading"]) {
      if (ports.hasArg(args, key)) patch[key] = args[key];
    }
    if (ports.hasArg(args, "justification")) patch.justification = ports.optionalTextJustification(args, "justification", null);
    if (!Object.keys(patch).length) return ports.toolResult("Provide at least one text field to update.", true);
    if (ports.hasArg(patch, "fontSize") && Number(patch.fontSize) <= 0) return ports.toolResult("fontSize must be greater than 0.", true);
    if (ports.hasArg(patch, "strokeWidth") && Number(patch.strokeWidth) < 0) return ports.toolResult("strokeWidth must be 0 or greater.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");
      var patch = ${ports.aeLiteral(patch)};
      var textProp = layer.property("ADBE Text Properties").property("ADBE Text Document");
      if (!textProp) throw new Error("Layer does not expose Source Text.");

      app.beginUndoGroup("Codex Update Text Layer");
      var before = __codexValuePreview(textProp);
      var doc = __codexApplyTextDocumentPatch(textProp, patch);
      textProp.setValue(doc);
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
        layer: __codexLayerInfo(layer),
        before: before,
        text: __codexValuePreview(textProp)
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "create_shape_layer") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const shape = ports.optionalString(args, "shape", "rectangle").trim().toLowerCase();
    const layerName = ports.optionalString(args, "name", "Codex Shape");
    const size = ports.optionalNumberArray(args, "size", null, 2, 2);
    const points = ports.optionalNumber(args, "points", 5);
    const outerRadius = ports.optionalNumber(args, "outerRadius", 100);
    const innerRadius = ports.optionalNumber(args, "innerRadius", shape === "star" ? 50 : null);
    const starType = ports.optionalString(args, "starType", "").trim().toLowerCase();
    const position = ports.optionalNumberArray(args, "position", null, 2, 3);
    const fillColor = ports.optionalNumberArray(args, "fillColor", [1, 1, 1], 3, 3);
    const strokeColor = ports.optionalNumberArray(args, "strokeColor", null, 3, 3);
    const strokeWidth = ports.optionalNumber(args, "strokeWidth", 0);
    const startTime = ports.optionalNumber(args, "startTime", null);
    const duration = ports.optionalNumber(args, "duration", null);

    if (!["rectangle", "ellipse", "polygon", "star"].includes(shape)) return ports.toolResult("shape must be one of: rectangle, ellipse, polygon, star.", true);
    const isPolystar = shape === "polygon" || shape === "star";
    if (isPolystar && size) return ports.toolResult("size is only supported for rectangle and ellipse; use outerRadius for polygon/star.", true);
    if (!isPolystar && (ports.hasArg(args, "points") || ports.hasArg(args, "outerRadius") || ports.hasArg(args, "innerRadius") || ports.hasArg(args, "starType"))) {
      return ports.toolResult("points, outerRadius, innerRadius, and starType are only supported for polygon/star.", true);
    }
    if (isPolystar) {
      if (starType && starType !== shape) return ports.toolResult("starType must match shape for polygon/star.", true);
      if (!Number.isInteger(points) || points < 3 || points > 64) return ports.toolResult("points must be an integer from 3 to 64.", true);
      if (outerRadius <= 0 || outerRadius > 10000) return ports.toolResult("outerRadius must be greater than 0 and at most 10000.", true);
      if (shape === "polygon" && ports.hasArg(args, "innerRadius")) return ports.toolResult("innerRadius is only supported for star.", true);
      if (shape === "star" && (innerRadius <= 0 || innerRadius >= outerRadius)) return ports.toolResult("innerRadius must be greater than 0 and less than outerRadius.", true);
    }
    if (size && (size[0] <= 0 || size[1] <= 0)) return ports.toolResult("size values must be greater than 0.", true);
    if (fillColor.some((value) => value < 0 || value > 1)) return ports.toolResult("fillColor values must be between 0 and 1.", true);
    if (strokeColor && strokeColor.some((value) => value < 0 || value > 1)) return ports.toolResult("strokeColor values must be between 0 and 1.", true);
    if (strokeWidth < 0) return ports.toolResult("strokeWidth must be 0 or greater.", true);
    if (duration !== null && duration <= 0) return ports.toolResult("duration must be greater than 0.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var shapeType = ${ports.aeLiteral(shape)};
      var isPolystar = shapeType === "polygon" || shapeType === "star";
      var layerName = ${ports.aeLiteral(layerName)};
      var requestedSize = ${size ? ports.aeLiteral(size) : "[comp.width / 2, comp.height / 2]"};
      var requestedPoints = ${points};
      var requestedOuterRadius = ${outerRadius};
      var requestedInnerRadius = ${innerRadius === null ? "null" : innerRadius};
      var requestedPosition = ${position ? ports.aeLiteral(position) : "[comp.width / 2, comp.height / 2]"};
      var fillColor = ${ports.aeLiteral(fillColor)};
      var strokeColor = ${strokeColor ? ports.aeLiteral(strokeColor) : "null"};
      var strokeWidth = ${strokeWidth};
      var requestedStartTime = ${startTime === null ? "null" : startTime};
      var requestedDuration = ${duration === null ? "null" : duration};

      function __codexPolystarTypeValue(typeName) {
        if (typeName === "polygon") {
          try { return PolystarPathType.POLYGON; } catch (__polygonTypeValueError) {}
          return 2;
        }
        try { return PolystarPathType.STAR; } catch (__starTypeValueError) {}
        return 1;
      }

      app.beginUndoGroup("Codex Create Shape Layer");
      var layer = comp.layers.addShape();
      if (layerName) layer.name = layerName;
      var root = layer.property("ADBE Root Vectors Group");
      var group = root.addProperty("ADBE Vector Group");
      group.name = shapeType === "ellipse" ? "Ellipse" : (shapeType === "polygon" ? "Polygon" : (shapeType === "star" ? "Star" : "Rectangle"));
      var contents = group.property("ADBE Vectors Group");
      var shapeProp = null;
      if (isPolystar) {
        shapeProp = contents.addProperty("ADBE Vector Shape - Star");
        shapeProp.property("ADBE Vector Star Type").setValue(__codexPolystarTypeValue(shapeType));
        shapeProp.property("ADBE Vector Star Points").setValue(requestedPoints);
        shapeProp.property("ADBE Vector Star Outer Radius").setValue(requestedOuterRadius);
        if (shapeType === "star") shapeProp.property("ADBE Vector Star Inner Radius").setValue(requestedInnerRadius);
      } else {
        shapeProp = contents.addProperty(shapeType === "ellipse" ? "ADBE Vector Shape - Ellipse" : "ADBE Vector Shape - Rect");
        var sizeProp = shapeProp.property(shapeType === "ellipse" ? "ADBE Vector Ellipse Size" : "ADBE Vector Rect Size");
        if (sizeProp) sizeProp.setValue(requestedSize);
      }
      var fill = contents.addProperty("ADBE Vector Graphic - Fill");
      fill.property("ADBE Vector Fill Color").setValue(fillColor);
      if (strokeColor !== null || strokeWidth > 0) {
        var stroke = contents.addProperty("ADBE Vector Graphic - Stroke");
        if (strokeColor !== null) stroke.property("ADBE Vector Stroke Color").setValue(strokeColor);
        stroke.property("ADBE Vector Stroke Width").setValue(strokeWidth);
      }
      var transform = layer.property("ADBE Transform Group");
      transform.property("ADBE Position").setValue(requestedPosition);
      if (requestedStartTime !== null) {
        layer.startTime = requestedStartTime;
        layer.inPoint = requestedStartTime;
      }
      if (requestedDuration !== null) {
        var baseTime = requestedStartTime !== null ? requestedStartTime : layer.inPoint;
        layer.outPoint = Math.min(baseTime + requestedDuration, comp.duration);
      }
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
        layer: __codexLayerInfo(layer),
        shape: isPolystar
          ? { type: shapeType, starType: shapeType, points: requestedPoints, outerRadius: requestedOuterRadius, innerRadius: requestedInnerRadius, fillColor: fillColor, strokeColor: strokeColor, strokeWidth: strokeWidth }
          : { type: shapeType, size: requestedSize, fillColor: fillColor, strokeColor: strokeColor, strokeWidth: strokeWidth }
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "create_layer_connection_line") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const fromLayerIndex = ports.requiredPositiveInteger(args, "fromLayerIndex");
    const toLayerIndex = ports.requiredPositiveInteger(args, "toLayerIndex");
    const expectedFromLayerName = ports.optionalString(args, "expectedFromLayerName", "");
    const expectedToLayerName = ports.optionalString(args, "expectedToLayerName", "");
    const layerName = ports.optionalString(args, "name", "Codex Connection Line");
    const pathGroupName = ports.optionalString(args, "pathGroupName", "Connector");
    const strokeColor = ports.optionalNumberArray(args, "strokeColor", [1, 1, 1], 3, 3);
    const strokeWidth = ports.optionalNumber(args, "strokeWidth", 4);
    const startTime = ports.optionalNumber(args, "startTime", null);
    const duration = ports.optionalNumber(args, "duration", null);
    const lockLayer = ports.optionalBoolean(args, "lockLayer", true);

    if (compItemIndex === null && !compName) return ports.toolResult("compItemIndex or compName is required for create_layer_connection_line.", true);
    if (fromLayerIndex === toLayerIndex) return ports.toolResult("fromLayerIndex and toLayerIndex must target two different layers.", true);
    if (strokeColor.some((value) => value < 0 || value > 1)) return ports.toolResult("strokeColor values must be between 0 and 1.", true);
    if (strokeWidth <= 0) return ports.toolResult("strokeWidth must be greater than 0.", true);
    if (duration !== null && duration <= 0) return ports.toolResult("duration must be greater than 0.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var fromLayer = comp.layer(${fromLayerIndex});
      var toLayer = comp.layer(${toLayerIndex});
      if (!fromLayer) throw new Error("fromLayerIndex did not resolve to a layer.");
      if (!toLayer) throw new Error("toLayerIndex did not resolve to a layer.");
      if (fromLayer === toLayer) throw new Error("fromLayerIndex and toLayerIndex must target two different layers.");
      var expectedFromLayerName = ${ports.aeLiteral(expectedFromLayerName)};
      var expectedToLayerName = ${ports.aeLiteral(expectedToLayerName)};
      if (expectedFromLayerName && fromLayer.name !== expectedFromLayerName) {
        throw new Error("fromLayer name mismatch. Expected '" + expectedFromLayerName + "' but found '" + fromLayer.name + "'.");
      }
      if (expectedToLayerName && toLayer.name !== expectedToLayerName) {
        throw new Error("toLayer name mismatch. Expected '" + expectedToLayerName + "' but found '" + toLayer.name + "'.");
      }
      var layerName = ${ports.aeLiteral(layerName)};
      var pathGroupName = ${ports.aeLiteral(pathGroupName)};
      var strokeColor = ${ports.aeLiteral(strokeColor)};
      var strokeWidth = ${strokeWidth};
      var requestedStartTime = ${startTime === null ? "null" : startTime};
      var requestedDuration = ${duration === null ? "null" : duration};
      var lockLayer = ${lockLayer ? "true" : "false"};

      function __codexExpressionString(value) {
        return JSON.stringify(String(value || ""));
      }

      function __codexLayerPosition2D(targetLayer) {
        var transform = targetLayer.property("ADBE Transform Group");
        var positionProp = transform ? transform.property("ADBE Position") : null;
        var position = positionProp ? positionProp.value : [0, 0];
        return [Number(position[0]) || 0, Number(position[1]) || 0];
      }

      function __codexOpenPath(points) {
        var shape = new Shape();
        shape.vertices = points;
        shape.inTangents = [[0, 0], [0, 0]];
        shape.outTangents = [[0, 0], [0, 0]];
        shape.closed = false;
        return shape;
      }

      function __codexPathGeometryInfo(prop, owningLayer) {
        var info = __codexPropertyInfo(prop, owningLayer, true, true);
        info.geometry = __codexShapeGeometryData(prop.value, 80);
        return info;
      }

      app.beginUndoGroup("Codex Create Layer Connection Line");
      var lineLayer = comp.layers.addShape();
      if (layerName) lineLayer.name = layerName;
      var transform = lineLayer.property("ADBE Transform Group");
      if (transform && transform.property("ADBE Position")) transform.property("ADBE Position").setValue([0, 0]);
      if (requestedStartTime !== null) {
        lineLayer.startTime = requestedStartTime;
        lineLayer.inPoint = requestedStartTime;
      }
      if (requestedDuration !== null) {
        var baseTime = requestedStartTime !== null ? requestedStartTime : lineLayer.inPoint;
        lineLayer.outPoint = Math.min(baseTime + requestedDuration, comp.duration);
      }

      var root = lineLayer.property("ADBE Root Vectors Group");
      var group = root.addProperty("ADBE Vector Group");
      group.name = pathGroupName || "Connector";
      var contents = group.property("ADBE Vectors Group");
      var pathGroup = contents.addProperty("ADBE Vector Shape - Group");
      pathGroup.name = "Connector Path";
      var pathProp = pathGroup.property("ADBE Vector Shape");
      if (!pathProp) throw new Error("Could not create connector path property.");
      var stroke = contents.addProperty("ADBE Vector Graphic - Stroke");
      if (!stroke) throw new Error("Could not create connector stroke.");
      stroke.property("ADBE Vector Stroke Color").setValue(strokeColor);
      stroke.property("ADBE Vector Stroke Width").setValue(strokeWidth);

      var initialPoints = [__codexLayerPosition2D(fromLayer), __codexLayerPosition2D(toLayer)];
      pathProp.setValue(__codexOpenPath(initialPoints));
      if (!pathProp.canSetExpression) throw new Error("Connector path property cannot receive expressions.");
      var expression = [
        "var fromLayer = thisComp.layer(" + __codexExpressionString(fromLayer.name) + ");",
        "var toLayer = thisComp.layer(" + __codexExpressionString(toLayer.name) + ");",
        "var fromPoint = thisLayer.fromComp(fromLayer.toComp(fromLayer.transform.anchorPoint));",
        "var toPoint = thisLayer.fromComp(toLayer.toComp(toLayer.transform.anchorPoint));",
        "createPath([[fromPoint[0], fromPoint[1]], [toPoint[0], toPoint[1]]], [[0, 0], [0, 0]], [[0, 0], [0, 0]], false);"
      ].join("\\n");
      pathProp.expression = expression;
      try { pathProp.expressionEnabled = true; } catch (__expressionEnabledError) {}
      if (lockLayer) lineLayer.locked = true;

      var pathInfo = __codexPathGeometryInfo(pathProp, lineLayer);
      var geometry = pathInfo.geometry || {};
      var expressionValue = pathProp.expression || "";
      var expressionError = pathProp.expressionError || "";
      var postVerification = {
        ok: geometry.closed === false &&
          Number(geometry.vertexCount || 0) === 2 &&
          pathProp.expressionEnabled === true &&
          expressionValue === expression &&
          !expressionError &&
          (!lockLayer || lineLayer.locked === true),
        pathOpen: geometry.closed === false,
        vertexCount: Number(geometry.vertexCount || 0),
        expressionEnabled: pathProp.expressionEnabled === true,
        expressionMatches: expressionValue === expression,
        expressionError: expressionError,
        locked: lineLayer.locked === true,
        lockRequested: lockLayer,
        connectorLayerIsTop: lineLayer.index === 1,
        fromLayerNameMatches: !expectedFromLayerName || fromLayer.name === expectedFromLayerName,
        toLayerNameMatches: !expectedToLayerName || toLayer.name === expectedToLayerName
      };
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
        connector: __codexLayerInfo(lineLayer),
        layer: __codexLayerInfo(lineLayer),
        targets: {
          from: __codexLayerInfo(fromLayer),
          to: __codexLayerInfo(toLayer)
        },
        path: pathInfo,
        pathGeometry: pathInfo,
        stroke: {
          color: strokeColor,
          width: strokeWidth
        },
        expression: expressionValue,
        expressionEnabled: pathProp.expressionEnabled === true,
        expressionError: expressionError,
        postVerification: postVerification
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "create_layer_mask") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndex = ports.requiredPositiveInteger(args, "layerIndex");
    const maskName = ports.optionalString(args, "name", "Codex Mask");
    const vertices = ports.requiredPointArray(args, "vertices", 3, 50);
    const maskMode = ports.optionalString(args, "maskMode", "add").toLowerCase();
    const opacity = ports.optionalNumber(args, "opacity", null);
    const feather = ports.optionalNumberArray(args, "feather", null, 2, 2);
    const expansion = ports.optionalNumber(args, "expansion", null);
    const coordinateLimit = 1000000;

    if (maskMode !== "add") return ports.toolResult("maskMode must be add for the first mask safety slice.", true);
    if (vertices.some((point) => Math.abs(point[0]) > coordinateLimit || Math.abs(point[1]) > coordinateLimit)) {
      return ports.toolResult("vertices values must be between -1000000 and 1000000.", true);
    }
    if (opacity !== null && (opacity < 0 || opacity > 100)) return ports.toolResult("opacity must be between 0 and 100.", true);
    if (feather && feather.some((value) => value < 0)) return ports.toolResult("feather values must be 0 or greater.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      var maskName = ${ports.aeLiteral(maskName)};
      var requestedVertices = ${ports.aeLiteral(vertices)};
      var requestedOpacity = ${opacity === null ? "null" : opacity};
      var requestedFeather = ${feather ? ports.aeLiteral(feather) : "null"};
      var requestedExpansion = ${expansion === null ? "null" : expansion};

      function __codexMaskPointList(points, limit) {
        var list = [];
        if (!points) return list;
        for (var __mp = 0; __mp < points.length && __mp < limit; __mp++) {
          var point = points[__mp];
          list.push([point[0], point[1]]);
        }
        return list;
      }

      function __codexZeroTangents(points) {
        var tangents = [];
        for (var __zt = 0; __zt < points.length; __zt++) tangents.push([0, 0]);
        return tangents;
      }

      function __codexFindChildProperty(group, matchName, fallbackName) {
        if (!group) return null;
        try {
          var direct = group.property(matchName);
          if (direct) return direct;
        } catch (__directPropertyError) {}
        if (fallbackName) {
          try {
            var fallback = group.property(fallbackName);
            if (fallback) return fallback;
          } catch (__fallbackPropertyError) {}
        }
        try {
          for (var __cp = 1; __cp <= group.numProperties; __cp++) {
            var child = group.property(__cp);
            if (child && (child.matchName === matchName || child.name === fallbackName)) return child;
          }
        } catch (__childPropertyError) {}
        return null;
      }

      function __codexAddMask(maskGroup) {
        var mask = null;
        try { mask = maskGroup.addProperty("ADBE Mask Atom"); } catch (__addMatchNameError) {}
        if (!mask) {
          try { mask = maskGroup.addProperty("Mask"); } catch (__addDisplayNameError) {}
        }
        if (!mask) throw new Error("Could not create mask atom on layer.");
        return mask;
      }

      function __codexMaskShapeInfo(mask) {
        var shapeProp = __codexFindChildProperty(mask, "ADBE Mask Shape", "Mask Path");
        var shape = shapeProp ? shapeProp.value : null;
        if (!shape) return null;
        return {
          closed: shape.closed === true,
          vertexCount: shape.vertices ? shape.vertices.length : 0,
          vertices: __codexMaskPointList(shape.vertices, 50),
          inTangents: __codexMaskPointList(shape.inTangents, 50),
          outTangents: __codexMaskPointList(shape.outTangents, 50),
          truncated: shape.vertices && shape.vertices.length > 50
        };
      }

      function __codexReadValue(prop) {
        try {
          if (!prop) return null;
          var value = prop.value;
          if (value instanceof Array) {
            var copy = [];
            for (var __rv = 0; __rv < value.length; __rv++) copy.push(value[__rv]);
            return copy;
          }
          return value;
        } catch (__readValueError) {
          return null;
        }
      }

      app.beginUndoGroup("Codex Create Layer Mask");
      var maskGroup = layer.property("ADBE Mask Parade");
      if (!maskGroup) throw new Error("Layer does not support masks.");
      var mask = __codexAddMask(maskGroup);
      if (maskName) mask.name = maskName;
      mask.maskMode = MaskMode.ADD;
      mask.inverted = false;

      var shape = new Shape();
      shape.vertices = requestedVertices;
      shape.inTangents = __codexZeroTangents(requestedVertices);
      shape.outTangents = __codexZeroTangents(requestedVertices);
      shape.closed = true;
      var shapeProperty = __codexFindChildProperty(mask, "ADBE Mask Shape", "Mask Path");
      if (!shapeProperty) throw new Error("Mask shape property was not found.");
      shapeProperty.setValue(shape);

      var opacityProperty = __codexFindChildProperty(mask, "ADBE Mask Opacity", "Mask Opacity");
      var featherProperty = __codexFindChildProperty(mask, "ADBE Mask Feather", "Mask Feather");
      var expansionProperty = __codexFindChildProperty(mask, "ADBE Mask Expansion", "Mask Expansion");
      if (requestedOpacity !== null) {
        if (!opacityProperty) throw new Error("Mask opacity property was not found.");
        opacityProperty.setValue(requestedOpacity);
      }
      if (requestedFeather !== null) {
        if (!featherProperty) throw new Error("Mask feather property was not found.");
        featherProperty.setValue(requestedFeather);
      }
      if (requestedExpansion !== null) {
        if (!expansionProperty) throw new Error("Mask expansion property was not found.");
        expansionProperty.setValue(requestedExpansion);
      }

      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
        layer: __codexLayerInfo(layer),
        mask: {
          propertyIndex: mask.propertyIndex,
          name: mask.name,
          matchName: mask.matchName,
          maskMode: "add",
          inverted: mask.inverted,
          shape: __codexMaskShapeInfo(mask),
          opacity: __codexReadValue(opacityProperty),
          feather: __codexReadValue(featherProperty),
          expansion: __codexReadValue(expansionProperty)
        }
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "set_layer_mask") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndex = ports.requiredPositiveInteger(args, "layerIndex");
    const operation = ports.optionalString(args, "operation", "").toLowerCase();
    const maskIndex = ports.optionalPositiveInteger(args, "maskIndex");
    const expectedMaskName = ports.optionalString(args, "expectedMaskName", "");
    const maskName = ports.optionalString(args, "name", "Codex Mask");
    const hasVertices = ports.hasArg(args, "vertices");
    const vertices = hasVertices ? ports.requiredPointArray(args, "vertices", 3, 50) : null;
    const hasMaskMode = ports.hasArg(args, "maskMode");
    const maskMode = hasMaskMode ? ports.optionalString(args, "maskMode", "").toLowerCase() : "";
    const hasInverted = ports.hasArg(args, "inverted");
    const inverted = ports.optionalBoolean(args, "inverted", null);
    const hasOpacity = ports.hasArg(args, "opacity");
    const opacity = ports.optionalNumber(args, "opacity", null);
    const hasFeather = ports.hasArg(args, "feather");
    const feather = ports.optionalNumberArray(args, "feather", null, 2, 2);
    const hasExpansion = ports.hasArg(args, "expansion");
    const expansion = ports.optionalNumber(args, "expansion", null);
    const coordinateLimit = 1000000;
    const allowedMaskModes = new Set(["add", "subtract", "intersect", "lighten", "darken", "difference", "none"]);

    if (compItemIndex === null && !compName) return ports.toolResult("compItemIndex or compName is required for set_layer_mask.", true);
    if (!["create", "update"].includes(operation)) return ports.toolResult("operation must be create or update.", true);
    if (ports.hasArg(args, "delete") || ports.hasArg(args, "remove") || ports.hasArg(args, "maskIndices") || ports.hasArg(args, "roto") || ports.hasArg(args, "rotobrush")) {
      return ports.toolResult("set_layer_mask supports one create/update target only; delete, bulk mask, and roto fields are not allowed.", true);
    }
    if (operation === "create" && !vertices) return ports.toolResult("vertices are required for create.", true);
    if (operation === "update" && maskIndex === null) return ports.toolResult("maskIndex is required for update.", true);
    if (operation === "update" && ports.hasArg(args, "name")) return ports.toolResult("set_layer_mask update mode does not rename masks.", true);
    if (operation === "update" && !hasVertices && !hasMaskMode && !hasInverted && !hasOpacity && !hasFeather && !hasExpansion) {
      return ports.toolResult("At least one bounded mask field is required for update.", true);
    }
    if (maskMode && !allowedMaskModes.has(maskMode)) return ports.toolResult("maskMode must be one of: add, subtract, intersect, lighten, darken, difference, none.", true);
    if (vertices && vertices.some((point) => Math.abs(point[0]) > coordinateLimit || Math.abs(point[1]) > coordinateLimit)) {
      return ports.toolResult("vertices values must be between -1000000 and 1000000.", true);
    }
    if (opacity !== null && (opacity < 0 || opacity > 100)) return ports.toolResult("opacity must be between 0 and 100.", true);
    if (feather && feather.some((value) => value < 0)) return ports.toolResult("feather values must be 0 or greater.", true);

    const effectiveMaskMode = maskMode || (operation === "create" ? "add" : "");

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");
      var operation = ${ports.aeLiteral(operation)};
      var requestedMaskIndex = ${maskIndex === null ? "null" : maskIndex};
      var expectedMaskName = ${ports.aeLiteral(expectedMaskName)};
      var maskName = ${ports.aeLiteral(maskName)};
      var requestedVertices = ${vertices ? ports.aeLiteral(vertices) : "null"};
      var requestedMaskMode = ${effectiveMaskMode ? ports.aeLiteral(effectiveMaskMode) : "null"};
      var requestedInverted = ${inverted === null ? "null" : inverted ? "true" : "false"};
      var requestedOpacity = ${opacity === null ? "null" : opacity};
      var requestedFeather = ${feather ? ports.aeLiteral(feather) : "null"};
      var requestedExpansion = ${expansion === null ? "null" : expansion};

      function __codexMaskPointList(points, limit) {
        var list = [];
        if (!points) return list;
        for (var __mp = 0; __mp < points.length && __mp < limit; __mp++) {
          var point = points[__mp];
          list.push([point[0], point[1]]);
        }
        return list;
      }

      function __codexZeroTangents(points) {
        var tangents = [];
        for (var __zt = 0; __zt < points.length; __zt++) tangents.push([0, 0]);
        return tangents;
      }

      function __codexFindChildProperty(group, matchName, fallbackName) {
        if (!group) return null;
        try {
          var direct = group.property(matchName);
          if (direct) return direct;
        } catch (__directPropertyError) {}
        if (fallbackName) {
          try {
            var fallback = group.property(fallbackName);
            if (fallback) return fallback;
          } catch (__fallbackPropertyError) {}
        }
        try {
          for (var __cp = 1; __cp <= group.numProperties; __cp++) {
            var child = group.property(__cp);
            if (child && (child.matchName === matchName || child.name === fallbackName)) return child;
          }
        } catch (__childPropertyError) {}
        return null;
      }

      function __codexReadValue(prop) {
        try {
          if (!prop) return null;
          var value = prop.value;
          if (value instanceof Array) {
            var copy = [];
            for (var __rv = 0; __rv < value.length; __rv++) copy.push(value[__rv]);
            return copy;
          }
          return value;
        } catch (__readValueError) {
          return null;
        }
      }

      function __codexModeName(value) {
        try {
          if (value === MaskMode.ADD) return "add";
          if (value === MaskMode.SUBTRACT) return "subtract";
          if (value === MaskMode.INTERSECT) return "intersect";
          if (value === MaskMode.LIGHTEN) return "lighten";
          if (value === MaskMode.DARKEN) return "darken";
          if (value === MaskMode.DIFFERENCE) return "difference";
          if (value === MaskMode.NONE) return "none";
        } catch (__modeNameError) {}
        return String(value);
      }

      function __codexModeValue(value) {
        if (value === "add") return MaskMode.ADD;
        if (value === "subtract") return MaskMode.SUBTRACT;
        if (value === "intersect") return MaskMode.INTERSECT;
        if (value === "lighten") return MaskMode.LIGHTEN;
        if (value === "darken") return MaskMode.DARKEN;
        if (value === "difference") return MaskMode.DIFFERENCE;
        if (value === "none") return MaskMode.NONE;
        throw new Error("Unsupported mask mode: " + value);
      }

      function __codexMaskShapeInfo(mask) {
        var shapeProp = __codexFindChildProperty(mask, "ADBE Mask Shape", "Mask Path");
        var shape = shapeProp ? shapeProp.value : null;
        if (!shape) return null;
        return {
          closed: shape.closed === true,
          vertexCount: shape.vertices ? shape.vertices.length : 0,
          vertices: __codexMaskPointList(shape.vertices, 50),
          inTangents: __codexMaskPointList(shape.inTangents, 50),
          outTangents: __codexMaskPointList(shape.outTangents, 50),
          truncated: shape.vertices && shape.vertices.length > 50
        };
      }

      function __codexMaskInfo(mask) {
        if (!mask) return null;
        var opacityProperty = __codexFindChildProperty(mask, "ADBE Mask Opacity", "Mask Opacity");
        var featherProperty = __codexFindChildProperty(mask, "ADBE Mask Feather", "Mask Feather");
        var expansionProperty = __codexFindChildProperty(mask, "ADBE Mask Expansion", "Mask Expansion");
        return {
          propertyIndex: mask.propertyIndex,
          name: mask.name,
          matchName: mask.matchName,
          maskMode: __codexModeName(mask.maskMode),
          inverted: mask.inverted,
          shape: __codexMaskShapeInfo(mask),
          opacity: __codexReadValue(opacityProperty),
          feather: __codexReadValue(featherProperty),
          expansion: __codexReadValue(expansionProperty)
        };
      }

      function __codexMaskSummary(maskGroup) {
        var items = [];
        var count = maskGroup ? maskGroup.numProperties : 0;
        for (var __ms = 1; __ms <= count; __ms++) {
          items.push(__codexMaskInfo(maskGroup.property(__ms)));
        }
        return { count: count, items: items };
      }

      function __codexNear(a, b) {
        return Math.abs(Number(a) - Number(b)) <= 0.0001;
      }

      function __codexArrayNear(a, b) {
        if (!a || !b || a.length !== b.length) return false;
        for (var __an = 0; __an < a.length; __an++) {
          if (!__codexNear(a[__an], b[__an])) return false;
        }
        return true;
      }

      function __codexVerticesMatch(actualShape, expectedVertices) {
        if (!expectedVertices) return true;
        if (!actualShape || !actualShape.vertices || actualShape.vertices.length !== expectedVertices.length) return false;
        for (var __vm = 0; __vm < expectedVertices.length; __vm++) {
          if (!__codexArrayNear(actualShape.vertices[__vm], expectedVertices[__vm])) return false;
        }
        return true;
      }

      app.beginUndoGroup("Codex Set Layer Mask");
      var maskGroup = layer.property("ADBE Mask Parade");
      if (!maskGroup) throw new Error("Layer does not support masks.");
      var beforeMasks = __codexMaskSummary(maskGroup);
      var targetMask = null;
      if (operation === "create") {
        try { targetMask = maskGroup.addProperty("ADBE Mask Atom"); } catch (__addMatchNameError) {}
        if (!targetMask) {
          try { targetMask = maskGroup.addProperty("Mask"); } catch (__addDisplayNameError) {}
        }
        if (!targetMask) throw new Error("Could not create mask atom on layer.");
        if (maskName) targetMask.name = maskName;
      } else {
        if (requestedMaskIndex < 1 || requestedMaskIndex > maskGroup.numProperties) throw new Error("maskIndex is outside the layer mask range.");
        targetMask = maskGroup.property(requestedMaskIndex);
        if (!targetMask) throw new Error("Mask not found at maskIndex " + requestedMaskIndex + ".");
        if (expectedMaskName && targetMask.name !== expectedMaskName) {
          throw new Error("Mask name mismatch. Expected '" + expectedMaskName + "' but found '" + targetMask.name + "'.");
        }
      }
      var beforeMask = operation === "update" ? __codexMaskInfo(targetMask) : null;
      if (requestedMaskMode !== null) targetMask.maskMode = __codexModeValue(requestedMaskMode);
      if (requestedInverted !== null) targetMask.inverted = requestedInverted;
      if (requestedVertices !== null) {
        var shape = new Shape();
        shape.vertices = requestedVertices;
        shape.inTangents = __codexZeroTangents(requestedVertices);
        shape.outTangents = __codexZeroTangents(requestedVertices);
        shape.closed = true;
        var shapeProperty = __codexFindChildProperty(targetMask, "ADBE Mask Shape", "Mask Path");
        if (!shapeProperty) throw new Error("Mask shape property was not found.");
        shapeProperty.setValue(shape);
      }
      var opacityProperty = __codexFindChildProperty(targetMask, "ADBE Mask Opacity", "Mask Opacity");
      var featherProperty = __codexFindChildProperty(targetMask, "ADBE Mask Feather", "Mask Feather");
      var expansionProperty = __codexFindChildProperty(targetMask, "ADBE Mask Expansion", "Mask Expansion");
      if (requestedOpacity !== null) {
        if (!opacityProperty) throw new Error("Mask opacity property was not found.");
        opacityProperty.setValue(requestedOpacity);
      }
      if (requestedFeather !== null) {
        if (!featherProperty) throw new Error("Mask feather property was not found.");
        featherProperty.setValue(requestedFeather);
      }
      if (requestedExpansion !== null) {
        if (!expansionProperty) throw new Error("Mask expansion property was not found.");
        expansionProperty.setValue(requestedExpansion);
      }
      var afterMask = __codexMaskInfo(targetMask);
      var afterMasks = __codexMaskSummary(maskGroup);
      var expectedMaskCountAfter = beforeMasks.count + (operation === "create" ? 1 : 0);
      var postVerification = {
        ok: afterMasks.count === expectedMaskCountAfter &&
          __codexVerticesMatch(afterMask.shape, requestedVertices) &&
          (requestedMaskMode === null || afterMask.maskMode === requestedMaskMode) &&
          (requestedInverted === null || afterMask.inverted === requestedInverted) &&
          (requestedOpacity === null || __codexNear(afterMask.opacity, requestedOpacity)) &&
          (requestedFeather === null || __codexArrayNear(afterMask.feather, requestedFeather)) &&
          (requestedExpansion === null || __codexNear(afterMask.expansion, requestedExpansion)),
        operation: operation,
        beforeMaskCount: beforeMasks.count,
        afterMaskCount: afterMasks.count,
        expectedMaskCountAfter: expectedMaskCountAfter,
        maskCountMatches: afterMasks.count === expectedMaskCountAfter,
        maskIndex: afterMask ? afterMask.propertyIndex : null,
        expectedMaskName: expectedMaskName || (operation === "create" ? maskName : ""),
        expectedMaskNameMatches: expectedMaskName ? afterMask.name === expectedMaskName : true,
        verticesMatch: __codexVerticesMatch(afterMask.shape, requestedVertices),
        maskModeMatches: requestedMaskMode === null || afterMask.maskMode === requestedMaskMode,
        invertedMatches: requestedInverted === null || afterMask.inverted === requestedInverted,
        opacityMatches: requestedOpacity === null || __codexNear(afterMask.opacity, requestedOpacity),
        featherMatches: requestedFeather === null || __codexArrayNear(afterMask.feather, requestedFeather),
        expansionMatches: requestedExpansion === null || __codexNear(afterMask.expansion, requestedExpansion)
      };
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
        layer: __codexLayerInfo(layer),
        operation: operation,
        beforeMasks: beforeMasks,
        afterMasks: afterMasks,
        beforeMask: beforeMask,
        mask: afterMask,
        afterMask: afterMask,
        postVerification: postVerification
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "set_path_geometry") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndex = ports.requiredPositiveInteger(args, "layerIndex");
    const targetKind = ports.optionalString(args, "targetKind", "").toLowerCase();
    const expectedLayerName = ports.optionalString(args, "expectedLayerName", "");
    const expectedMaskName = ports.optionalString(args, "expectedMaskName", "");
    const clearExisting = ports.optionalBoolean(args, "clearExisting", false);
    let propertyPath = null;
    let maskIndex = null;
    let geometry = null;
    let keyframes = null;

    if (compItemIndex === null && !compName) return ports.toolResult("compItemIndex or compName is required for set_path_geometry.", true);
    if (!["shape", "mask"].includes(targetKind)) return ports.toolResult("targetKind must be shape or mask.", true);
    if (targetKind === "shape") {
      try {
        propertyPath = ports.normalizePropertyPathArg(args, "propertyPath");
      } catch (error) {
        return ports.toolResult(error.message || String(error), true);
      }
    } else {
      maskIndex = ports.optionalPositiveInteger(args, "maskIndex");
      if (maskIndex === null) return ports.toolResult("maskIndex is required for targetKind=mask.", true);
    }

    try {
      geometry = ports.optionalPathGeometry(args, "geometry", null) || ports.pathGeometryFromTopLevelArgs(args);
      if (ports.hasArg(args, "keyframes")) keyframes = ports.requiredPathGeometryKeyframes(args, "keyframes");
    } catch (error) {
      return ports.toolResult(error.message || String(error), true);
    }
    if (geometry && keyframes) return ports.toolResult("Provide either geometry or keyframes, not both.", true);
    if (!geometry && !keyframes) return ports.toolResult("geometry or keyframes are required for set_path_geometry.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");
      var targetKind = ${ports.aeLiteral(targetKind)};
      var propertyPath = ${propertyPath ? ports.aeLiteral(propertyPath) : "null"};
      var requestedMaskIndex = ${maskIndex === null ? "null" : maskIndex};
      var expectedLayerName = ${ports.aeLiteral(expectedLayerName)};
      var expectedMaskName = ${ports.aeLiteral(expectedMaskName)};
      var requestedGeometry = ${geometry ? ports.aeLiteral(geometry) : "null"};
      var requestedKeyframes = ${keyframes ? ports.aeLiteral(keyframes) : "null"};
      var clearExisting = ${clearExisting ? "true" : "false"};

      function __codexFindChildProperty(group, matchName, fallbackName) {
        if (!group) return null;
        try {
          var direct = group.property(matchName);
          if (direct) return direct;
        } catch (__directPropertyError) {}
        if (fallbackName) {
          try {
            var fallback = group.property(fallbackName);
            if (fallback) return fallback;
          } catch (__fallbackPropertyError) {}
        }
        try {
          for (var __cp = 1; __cp <= group.numProperties; __cp++) {
            var child = group.property(__cp);
            if (child && (child.matchName === matchName || child.name === fallbackName)) return child;
          }
        } catch (__childPropertyError) {}
        return null;
      }

      function __codexBuildShapeFromGeometry(data) {
        var shape = new Shape();
        shape.vertices = data.vertices;
        shape.inTangents = data.inTangents;
        shape.outTangents = data.outTangents;
        shape.closed = data.closed === true;
        return shape;
      }

      function __codexPathGeometryInfo(prop, owningLayer, includeKeys, limit) {
        var info = __codexPropertyInfo(prop, owningLayer, false, false);
        info.geometry = __codexShapeGeometryData(prop.value, 80);
        if (includeKeys) {
          info.keyframes = [];
          var keyCount = 0;
          try { keyCount = prop.numKeys || 0; } catch (__numKeysError) {}
          var maxKeys = Math.min(keyCount, limit);
          for (var __keyIndex = 1; __keyIndex <= maxKeys; __keyIndex++) {
            info.keyframes.push({
              index: __keyIndex,
              time: prop.keyTime(__keyIndex),
              geometry: __codexShapeGeometryData(prop.keyValue(__keyIndex), 80)
            });
          }
          info.keyframesTruncated = keyCount > maxKeys;
        }
        return info;
      }

      function __codexNear(a, b) {
        return Math.abs(Number(a) - Number(b)) <= 0.0001;
      }

      function __codexPointListMatches(actual, expected) {
        if (!actual || !expected || actual.length !== expected.length) return false;
        for (var __pm = 0; __pm < expected.length; __pm++) {
          if (!actual[__pm] || !expected[__pm] || actual[__pm].length < 2 || expected[__pm].length < 2) return false;
          if (!__codexNear(actual[__pm][0], expected[__pm][0]) || !__codexNear(actual[__pm][1], expected[__pm][1])) return false;
        }
        return true;
      }

      function __codexGeometryMatches(actual, expected) {
        if (!actual || !expected) return false;
        return actual.closed === expected.closed &&
          actual.vertexCount === expected.vertices.length &&
          __codexPointListMatches(actual.vertices, expected.vertices) &&
          __codexPointListMatches(actual.inTangents, expected.inTangents) &&
          __codexPointListMatches(actual.outTangents, expected.outTangents);
      }

      function __codexKeyframesMatch(prop, expectedKeyframes) {
        if (!expectedKeyframes) return true;
        if (!prop || prop.numKeys < expectedKeyframes.length) return false;
        for (var __ek = 0; __ek < expectedKeyframes.length; __ek++) {
          var expected = expectedKeyframes[__ek];
          var matched = false;
          for (var __pk = 1; __pk <= prop.numKeys && !matched; __pk++) {
            if (__codexNear(prop.keyTime(__pk), expected.time)) {
              matched = __codexGeometryMatches(__codexShapeGeometryData(prop.keyValue(__pk), 80), expected.geometry);
            }
          }
          if (!matched) return false;
        }
        return true;
      }

      function __codexResolvePathTarget() {
        if (expectedLayerName && layer.name !== expectedLayerName) {
          throw new Error("Layer name mismatch. Expected '" + expectedLayerName + "' but found '" + layer.name + "'.");
        }
        if (targetKind === "shape") {
          var shapeProp = __codexResolveProperty(layer, propertyPath);
          if (!shapeProp || shapeProp.matchName !== "ADBE Vector Shape") {
            throw new Error("propertyPath must resolve to an ADBE Vector Shape path property.");
          }
          return { property: shapeProp, mask: null };
        }
        var maskGroup = layer.property("ADBE Mask Parade");
        if (!maskGroup) throw new Error("Layer does not support masks.");
        if (requestedMaskIndex < 1 || requestedMaskIndex > maskGroup.numProperties) throw new Error("maskIndex is outside the layer mask range.");
        var mask = maskGroup.property(requestedMaskIndex);
        if (!mask) throw new Error("Mask not found at maskIndex " + requestedMaskIndex + ".");
        if (expectedMaskName && mask.name !== expectedMaskName) {
          throw new Error("Mask name mismatch. Expected '" + expectedMaskName + "' but found '" + mask.name + "'.");
        }
        var maskShapeProp = __codexFindChildProperty(mask, "ADBE Mask Shape", "Mask Path");
        if (!maskShapeProp) throw new Error("Mask shape property was not found.");
        return { property: maskShapeProp, mask: mask };
      }

      var target = __codexResolvePathTarget();
      var prop = target.property;
      try {
        if (prop.expressionEnabled === true) throw new Error("Path geometry property has an enabled expression; clear or review the expression before geometry mutation.");
      } catch (__expressionProbeError) {
        if (String(__expressionProbeError).indexOf("enabled expression") >= 0) throw __expressionProbeError;
      }
      var before = __codexPathGeometryInfo(prop, layer, true, 80);

      var response = null;
      app.beginUndoGroup("Codex Set Path Geometry");
      try {
        if (requestedKeyframes) {
          if (clearExisting) {
            for (var __removeKey = prop.numKeys; __removeKey >= 1; __removeKey--) prop.removeKey(__removeKey);
          }
          for (var __kf = 0; __kf < requestedKeyframes.length; __kf++) {
            if (requestedKeyframes[__kf].time > comp.duration) {
              throw new Error("keyframes[" + __kf + "].time exceeds comp duration.");
            }
            prop.setValueAtTime(requestedKeyframes[__kf].time, __codexBuildShapeFromGeometry(requestedKeyframes[__kf].geometry));
          }
        } else {
          prop.setValue(__codexBuildShapeFromGeometry(requestedGeometry));
        }
        var after = __codexPathGeometryInfo(prop, layer, true, 80);
        var geometryMatches = requestedGeometry ? __codexGeometryMatches(after.geometry, requestedGeometry) : true;
        var keyframesMatch = requestedKeyframes ? __codexKeyframesMatch(prop, requestedKeyframes) : true;
        var postVerification = {
          ok: geometryMatches && keyframesMatch,
          targetKind: targetKind,
          propertyMatchName: prop.matchName || null,
          geometryMatches: geometryMatches,
          keyframesMatch: keyframesMatch,
          requestedKeyframeCount: requestedKeyframes ? requestedKeyframes.length : 0,
          afterKeyframeCount: after.numKeys || 0,
          clearExisting: clearExisting
        };
        response = {
          comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
          layer: __codexLayerInfo(layer),
          targetKind: targetKind,
          mask: target.mask ? { propertyIndex: target.mask.propertyIndex, name: target.mask.name, matchName: target.mask.matchName } : null,
          before: before,
          property: after,
          pathGeometry: after,
          geometry: after.geometry,
          postVerification: postVerification
        };
      } finally {
        app.endUndoGroup();
      }
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "fit_layer_to_comp") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndices = ports.optionalPositiveIntegerList(args, "layerIndices");
    const mode = ports.optionalString(args, "mode", "contain");
    const alignX = ports.optionalString(args, "alignX", "center");
    const alignY = ports.optionalString(args, "alignY", "center");
    const expectedCompItemId=ports.optionalPositiveInteger(args,"expectedCompItemId");
    const expectedLayerId=ports.optionalPositiveInteger(args,"expectedLayerId");

    if (!["contain", "cover", "stretch"].includes(mode)) return ports.toolResult("mode must be one of: contain, cover, stretch.", true);
    if (!["left", "center", "right"].includes(alignX)) return ports.toolResult("alignX must be one of: left, center, right.", true);
    if (!["top", "center", "bottom"].includes(alignY)) return ports.toolResult("alignY must be one of: top, center, bottom.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      ${ports.placeholderGeometry.aeGeometrySupport}
      ${setterIdentityGuard}
      var comp = ${expectedCompItemId===null ? `__codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)})` : `__phFindComp(${expectedCompItemId})`};
      var layers = ${expectedLayerId===null ? `__codexResolveLayers(comp, ${layerIndices ? ports.aeLiteral(layerIndices) : "null"})` : `[__phFindLayer(comp,${expectedLayerId})]`};
      var mode = ${ports.aeLiteral(mode)};
      var alignX = ${ports.aeLiteral(alignX)};
      var alignY = ${ports.aeLiteral(alignY)};

      var prepared=[];
      for (var __i = 0; __i < layers.length; __i++) {
        var layer = layers[__i];
        if (layer.locked) throw new Error("Layer is locked: " + layer.name);
        var before = __codexLayerInfo(layer);
        var size = __codexLayerSourceSize(layer, comp);
        if(mode==="cover"){var geometry=__phGeometry(comp,layer,null);__phRequireCoverGeometry(geometry);size={width:geometry.geometry.source.width,height:geometry.geometry.source.height};}
        var scaleX = comp.width / size.width * 100;
        var scaleY = comp.height / size.height * 100;
        if (mode === "contain") {
          var containScale = Math.min(scaleX, scaleY);
          scaleX = containScale;
          scaleY = containScale;
        } else if (mode === "cover") {
          var coverScale = Math.max(scaleX, scaleY);
          scaleX = coverScale;
          scaleY = coverScale;
        }
        var fittedWidth = size.width * scaleX / 100;
        var fittedHeight = size.height * scaleY / 100;
        var transform = layer.property("ADBE Transform Group");
        var anchor=transform.property("ADBE Anchor Point").value;
        if(!(anchor instanceof Array) || anchor.length<2 || !isFinite(anchor[0]) || !isFinite(anchor[1]))throw new Error("unsupported_fit_anchor");
        var x = alignX === "left" ? anchor[0]*scaleX/100 : alignX === "right" ? comp.width-(size.width-anchor[0])*scaleX/100 : comp.width/2+(anchor[0]-size.width/2)*scaleX/100;
        var y = alignY === "top" ? anchor[1]*scaleY/100 : alignY === "bottom" ? comp.height-(size.height-anchor[1])*scaleY/100 : comp.height/2+(anchor[1]-size.height/2)*scaleY/100;
        var scaleValue=transform.property("ADBE Scale").value.length===3 ? [scaleX,scaleY,100] : [scaleX,scaleY];
        prepared.push({layer:layer,before:before,size:size,scale:scaleValue,position:[x,y]});
      }
      app.beginUndoGroup("Codex Fit Layer To Comp");
      try {
      var changed=[];
      for(var __i=0;__i<prepared.length;__i++) {
        var desired=prepared[__i];var layer=desired.layer;var transform=layer.property("ADBE Transform Group");
        transform.property("ADBE Scale").setValue(desired.scale);
        transform.property("ADBE Position").setValue(desired.position);
        changed.push({
          before: desired.before,
          after: __codexLayerInfo(layer),
          sourceSize: desired.size,
          scale: transform.property("ADBE Scale").value,
          position: transform.property("ADBE Position").value
        });
      }
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), itemId:comp.id,name: comp.name, width: comp.width, height: comp.height },
        mode: mode,
        alignX: alignX,
        alignY: alignY,
        changedCount: changed.length,
        layers: changed.map(function (item) { return item.after; }),
        changed: changed
      };
      return response;
      }finally{app.endUndoGroup();}
    `);
    return ports.toolResult(result.result);
  }

  if (name === "set_property_keyframes") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndex = ports.requiredPositiveInteger(args, "layerIndex");
    let propertyPath;
    let keyframes;
    try {
      propertyPath = ports.normalizePropertyPathArg(args, "propertyPath");
      keyframes = ports.requiredKeyframeArray(args, "keyframes");
    } catch (error) {
      return ports.toolResult(error.message, true);
    }
    const clearExisting = ports.optionalBoolean(args, "clearExisting", false);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");
      var propertyPath = ${ports.aeLiteral(propertyPath)};
      var keyframes = ${ports.aeLiteral(keyframes)};
      var clearExisting = ${clearExisting ? "true" : "false"};
      var prop = __codexResolveProperty(layer, propertyPath);
      if (!prop || !prop.canVaryOverTime) throw new Error("Property cannot be keyframed.");

      app.beginUndoGroup("Codex Set Property Keyframes");
      if (clearExisting) {
        while (prop.numKeys && prop.numKeys > 0) {
          prop.removeKey(prop.numKeys);
        }
      }
      for (var __i = 0; __i < keyframes.length; __i++) {
        var item = keyframes[__i];
        prop.setValueAtTime(item.time, __codexPreparePropertyValue(prop, item.value));
      }
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
        layer: __codexLayerInfo(layer),
        property: __codexPropertyInfo(prop, layer, true, true),
        keyframeCount: keyframes.length,
        clearExisting: clearExisting
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "fill_in_keyframes") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndex = ports.requiredPositiveInteger(args, "layerIndex");
    const startTime = ports.optionalNumber(args, "startTime", null);
    const endTime = ports.optionalNumber(args, "endTime", null);
    const sampleEveryFrames = Math.max(1, Math.floor(ports.optionalNumber(args, "sampleEveryFrames", 1)));
    const removeRedundant = ports.optionalBoolean(args, "removeRedundant", true);
    const clearExpression = ports.optionalBoolean(args, "clearExpression", true);
    let propertyPath;
    try {
      propertyPath = ports.normalizePropertyPathArg(args, "propertyPath");
    } catch (error) {
      return ports.toolResult(error.message, true);
    }

    if (startTime !== null && endTime !== null && endTime < startTime) return ports.toolResult("endTime must be greater than or equal to startTime.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");
      var propertyPath = ${ports.aeLiteral(propertyPath)};
      var requestedStart = ${startTime === null ? "null" : startTime};
      var requestedEnd = ${endTime === null ? "null" : endTime};
      var sampleEveryFrames = ${sampleEveryFrames};
      var removeRedundant = ${removeRedundant ? "true" : "false"};
      var clearExpression = ${clearExpression ? "true" : "false"};
      var prop = __codexResolveProperty(layer, propertyPath);
      if (!prop || !prop.canVaryOverTime) throw new Error("Property cannot be keyframed.");
      try {
        if (prop.propertyValueType === PropertyValueType.NO_VALUE) throw new Error("Property has no value.");
      } catch (__noValueProbeError) {}

      function __codexValuesEqual(valueA, valueB) {
        var arrayA = valueA instanceof Array ? valueA : [valueA];
        var arrayB = valueB instanceof Array ? valueB : [valueB];
        if (arrayA.length !== arrayB.length) return false;
        for (var __e = 0; __e < arrayA.length; __e++) {
          if (arrayA[__e] !== arrayB[__e]) return false;
        }
        return true;
      }

      function __codexCopyValue(value) {
        if (value instanceof Array) {
          var copy = [];
          for (var __cv = 0; __cv < value.length; __cv++) copy.push(value[__cv]);
          return copy;
        }
        return value;
      }

      var frameDuration = comp.frameDuration || (1 / comp.frameRate);
      var step = frameDuration * sampleEveryFrames;
      var rangeStart = requestedStart !== null ? requestedStart : (prop.numKeys && prop.numKeys > 0 ? prop.keyTime(1) : (comp.workAreaStart || 0));
      var rangeEnd = requestedEnd !== null ? requestedEnd : (prop.numKeys && prop.numKeys > 0 ? prop.keyTime(prop.numKeys) : Math.min(comp.duration, (comp.workAreaStart || 0) + (comp.workAreaDuration || comp.duration)));
      if (rangeEnd < rangeStart) throw new Error("Computed keyframe range is invalid.");

      var samples = [];
      var guard = 0;
      for (var t = rangeStart; t <= rangeEnd + 0.0001 && guard < 2000; t += step) {
        var sampleTime = Math.min(t, rangeEnd);
        samples.push({ time: sampleTime, value: __codexCopyValue(prop.valueAtTime(sampleTime, false)) });
        guard++;
      }
      if (!samples.length || Math.abs(samples[samples.length - 1].time - rangeEnd) > 0.0001) {
        samples.push({ time: rangeEnd, value: __codexCopyValue(prop.valueAtTime(rangeEnd, false)) });
      }

      app.beginUndoGroup("Codex Fill In Keyframes");
      while (prop.numKeys && prop.numKeys > 0) {
        prop.removeKey(prop.numKeys);
      }
      for (var __i = 0; __i < samples.length; __i++) {
        prop.setValueAtTime(samples[__i].time, __codexPreparePropertyValue(prop, samples[__i].value));
      }
      var removed = 0;
      if (removeRedundant && prop.numKeys > 2) {
        for (var __k = prop.numKeys - 1; __k > 1; __k--) {
          var previousValue = prop.keyValue(__k - 1);
          var currentValue = prop.keyValue(__k);
          var nextValue = prop.keyValue(__k + 1);
          if (__codexValuesEqual(previousValue, currentValue) && __codexValuesEqual(currentValue, nextValue)) {
            prop.removeKey(__k);
            removed++;
          }
        }
      }
      for (var __linear = 1; __linear <= prop.numKeys; __linear++) {
        try { prop.setInterpolationTypeAtKey(__linear, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR); } catch (__linearError) {}
      }
      if (clearExpression && prop.canSetExpression) {
        try { prop.expression = ""; } catch (__clearExpressionError) {}
      }
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
        layer: __codexLayerInfo(layer),
        property: __codexPropertyInfo(prop, layer, true, true),
        sampledCount: samples.length,
        removedRedundantCount: removed,
        keyframeCount: prop.numKeys || 0,
        range: { startTime: rangeStart, endTime: rangeEnd, sampleEveryFrames: sampleEveryFrames },
        clearExpression: clearExpression
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "keyframe_current_value_from_expression") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndex = ports.requiredPositiveInteger(args, "layerIndex");
    const time = ports.optionalNumber(args, "time", null);
    const requireExpression = ports.optionalBoolean(args, "requireExpression", true);
    let propertyPath;
    try {
      propertyPath = ports.normalizePropertyPathArg(args, "propertyPath");
    } catch (error) {
      return ports.toolResult(error.message, true);
    }

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");
      var propertyPath = ${ports.aeLiteral(propertyPath)};
      var targetTime = ${time === null ? "comp.time" : time};
      var requireExpression = ${requireExpression ? "true" : "false"};
      var prop = __codexResolveProperty(layer, propertyPath);
      if (!prop || !prop.canVaryOverTime) throw new Error("Property cannot be keyframed.");
      if (requireExpression && (!prop.canSetExpression || !prop.expression)) throw new Error("Property has no expression to evaluate.");

      app.beginUndoGroup("Codex Keyframe Current Value From Expression");
      var currentValue = prop.valueAtTime(targetTime, false);
      prop.setValueAtTime(targetTime, __codexPreparePropertyValue(prop, currentValue));
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name, time: comp.time },
        layer: __codexLayerInfo(layer),
        property: __codexPropertyInfo(prop, layer, true, true),
        keyframe: { time: targetTime, value: __codexValueData(currentValue) },
        expression: prop.canSetExpression ? prop.expression || "" : ""
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "apply_keyframe_ease") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndex = ports.requiredPositiveInteger(args, "layerIndex");
    const keyIndices = ports.optionalPositiveIntegerList(args, "keyIndices");
    const easeIn = args.easeIn && typeof args.easeIn === "object" && !Array.isArray(args.easeIn) ? args.easeIn : {};
    const easeOut = args.easeOut && typeof args.easeOut === "object" && !Array.isArray(args.easeOut) ? args.easeOut : {};
    const interpolation = ports.optionalString(args, "interpolation", "");
    let propertyPath;
    try {
      propertyPath = ports.normalizePropertyPathArg(args, "propertyPath");
    } catch (error) {
      return ports.toolResult(error.message, true);
    }
    if (interpolation && !["bezier", "linear", "hold"].includes(interpolation)) return ports.toolResult("interpolation must be one of: bezier, linear, hold.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");
      var propertyPath = ${ports.aeLiteral(propertyPath)};
      var requestedKeyIndices = ${keyIndices ? ports.aeLiteral(keyIndices) : "null"};
      var easeIn = ${ports.aeLiteral(easeIn)};
      var easeOut = ${ports.aeLiteral(easeOut)};
      var interpolation = ${ports.aeLiteral(interpolation)};
      var prop = __codexResolveProperty(layer, propertyPath);
      if (!prop || !prop.numKeys) throw new Error("Property has no keyframes.");
      var keys = [];
      if (requestedKeyIndices && requestedKeyIndices.length) {
        keys = requestedKeyIndices;
      } else {
        try {
          for (var __sk = 0; __sk < prop.selectedKeys.length; __sk++) keys.push(prop.selectedKeys[__sk]);
        } catch (__selectedKeyError) {}
      }
      if (!keys.length) throw new Error("No keyframes selected or provided.");
      // Validate the entire selection before any write; a bad later index must
      // not leave an earlier key modified.
      var keyframesBefore = [];
      var originalKeyCount = prop.numKeys;
      for (var __validate = 0; __validate < keys.length; __validate++) {
        var checkedIndex = keys[__validate];
        if (typeof checkedIndex !== "number" || !isFinite(checkedIndex) || Math.floor(checkedIndex) !== checkedIndex || checkedIndex < 1 || checkedIndex > prop.numKeys) throw new Error("Keyframe index out of range: " + checkedIndex);
        keyframesBefore.push(__codexKeyframeInfo(prop, checkedIndex));
      }
      // Native AE selected LINEAR from the chained conditional for "hold";
      // explicit branches avoid that observed ExtendScript evaluation path.
      var interpolationType;
      if (interpolation === "hold") {
        interpolationType = KeyframeInterpolationType.HOLD;
      } else if (interpolation === "linear") {
        interpolationType = KeyframeInterpolationType.LINEAR;
      } else {
        interpolationType = KeyframeInterpolationType.BEZIER;
      }
      var interpolationValid = null;
      if (interpolation) {
        try { interpolationValid = prop.isInterpolationTypeValid(interpolationType); } catch (__interpolationValidError) {}
        if (interpolationValid === false) throw new Error("Property does not support interpolation: " + interpolation);
      }

      function __codexEaseArray(ease, dimensions) {
        var speed = ease.speed !== undefined ? Number(ease.speed) : 0;
        var influence = ease.influence !== undefined ? Number(ease.influence) : 33;
        var values = [];
        for (var __d = 0; __d < dimensions; __d++) {
          values.push(new KeyframeEase(speed, influence));
        }
        return values;
      }

      function __codexTemporalEaseDimensions(prop) {
        try {
          if (prop.propertyValueType === PropertyValueType.TwoD_SPATIAL || prop.propertyValueType === PropertyValueType.ThreeD_SPATIAL) {
            return 1;
          }
        } catch (__spatialEaseTypeError) {}
        var value = null;
        try { value = prop.value; } catch (__valueProbeError) {}
        return value instanceof Array ? Math.max(1, value.length) : 1;
      }

      app.beginUndoGroup("Codex Apply Keyframe Ease");
      var dimensions = __codexTemporalEaseDimensions(prop);
      var easeInValues = __codexEaseArray(easeIn, dimensions);
      var easeOutValues = __codexEaseArray(easeOut, dimensions);
      var changedKeys = [];
      for (var __i = 0; __i < keys.length; __i++) {
        var keyIndex = keys[__i];
        // HOLD has no temporal easing. Apply interpolation in a final pass so
        // another key's temporal-ease update cannot precede its read-back.
        if (interpolation !== "hold") prop.setTemporalEaseAtKey(keyIndex, easeInValues, easeOutValues);
        changedKeys.push(keyIndex);
      }
      for (var __interp = 0; __interp < keys.length; __interp++) {
        if (interpolation) {
          prop.setInterpolationTypeAtKey(keys[__interp], interpolationType, interpolationType);
        }
      }
      var keyframesAfter = [];
      var verificationErrors = [];
      if (prop.numKeys !== originalKeyCount) verificationErrors.push("Keyframe count changed.");
      for (var __verify = 0; __verify < keys.length; __verify++) {
        var afterKey = __codexKeyframeInfo(prop, keys[__verify]);
        var beforeKey = keyframesBefore[__verify];
        keyframesAfter.push(afterKey);
        if (beforeKey.time === null || afterKey.time !== beforeKey.time || __codexStringify(afterKey.value) !== __codexStringify(beforeKey.value)) verificationErrors.push("Keyframe time/value changed: " + keys[__verify]);
        if (interpolation && (afterKey.inInterpolation !== interpolation || afterKey.outInterpolation !== interpolation)) verificationErrors.push("Interpolation mismatch at key " + keys[__verify] + ": " + afterKey.inInterpolation + "/" + afterKey.outInterpolation);
      }
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), itemId: comp.id, name: comp.name },
        layer: __codexLayerInfo(layer),
        property: __codexPropertyInfo(prop, layer, true, true),
        keyIndices: changedKeys,
        interpolation: interpolation || null,
        keyframeEase: { before: keyframesBefore, after: keyframesAfter, originalKeyCount: originalKeyCount,
          interpolationNativeValue: interpolation ? Number(interpolationType) : null, interpolationValid: interpolationValid,
          temporalEaseApplied: interpolation !== "hold", verified: verificationErrors.length === 0, errors: verificationErrors }
      };
      app.endUndoGroup();
      return response;
    `);
    const nativeResult = result.result;
    return ports.toolResult(nativeResult, Boolean(nativeResult && nativeResult.keyframeEase && nativeResult.keyframeEase.verified === false));
  }

  if (name === "set_spatial_in_tangent") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndex = ports.requiredPositiveInteger(args, "layerIndex");
    const keyIndexArg = ports.optionalPositiveInteger(args, "keyIndex");
    const factor = ports.optionalNumber(args, "factor", 0.5);
    let propertyPath;
    try {
      propertyPath = ports.hasArg(args, "propertyPath")
        ? ports.normalizePropertyPathArg(args, "propertyPath")
        : ["ADBE Transform Group", "ADBE Position"];
    } catch (error) {
      return ports.toolResult(error.message, true);
    }

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");
      var propertyPath = ${ports.aeLiteral(propertyPath)};
      var requestedKeyIndex = ${keyIndexArg === null ? "null" : keyIndexArg};
      var factor = ${factor};
      var prop = __codexResolveProperty(layer, propertyPath);
      if (!prop || !prop.numKeys) throw new Error("Property has no keyframes.");
      var keyIndex = requestedKeyIndex;
      if (keyIndex === null) {
        try { keyIndex = prop.selectedKeys && prop.selectedKeys.length ? prop.selectedKeys[0] : null; } catch (__selectedKeyError) {}
      }
      if (!keyIndex) throw new Error("Provide keyIndex or select one keyframe.");
      if (keyIndex < 2 || keyIndex > prop.numKeys) throw new Error("keyIndex must target keyframe 2 or later.");
      var currentValue = prop.keyValue(keyIndex);
      var previousValue = prop.keyValue(keyIndex - 1);
      if (!(currentValue instanceof Array) || !(previousValue instanceof Array)) throw new Error("Spatial tangent requires array keyframe values.");
      var inTangent = [];
      for (var __d = 0; __d < currentValue.length; __d++) {
        inTangent.push((previousValue[__d] - currentValue[__d]) * factor);
      }
      var outTangent = null;
      try { outTangent = prop.keyOutSpatialTangent(keyIndex); } catch (__outSpatialError) {}
      if (!(outTangent instanceof Array)) {
        outTangent = [];
        for (var __o = 0; __o < currentValue.length; __o++) outTangent.push(0);
      }

      app.beginUndoGroup("Codex Set Spatial In Tangent");
      prop.setSpatialTangentsAtKey(keyIndex, inTangent, outTangent);
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
        layer: __codexLayerInfo(layer),
        property: __codexPropertyInfo(prop, layer, true, true),
        keyIndex: keyIndex,
        factor: factor,
        inSpatialTangent: __codexArrayCopy(inTangent),
        outSpatialTangent: __codexArrayCopy(outTangent)
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "set_expression" || name === "clear_expression") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndex = ports.requiredPositiveInteger(args, "layerIndex");
    let propertyPath;
    try {
      propertyPath = ports.normalizePropertyPathArg(args, "propertyPath");
    } catch (error) {
      return ports.toolResult(error.message, true);
    }
    const expression = name === "set_expression" ? ports.optionalString(args, "expression", "") : "";
    const enabled = name === "set_expression" ? ports.optionalBoolean(args, "enabled", true) : false;
    if (name === "set_expression" && !expression) return ports.toolResult("expression is required.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");
      var propertyPath = ${ports.aeLiteral(propertyPath)};
      var expressionValue = ${ports.aeLiteral(expression)};
      var enabledValue = ${enabled ? "true" : "false"};
      var prop = __codexResolveProperty(layer, propertyPath);
      if (!prop || !prop.canSetExpression) throw new Error("Property cannot receive expressions.");

      app.beginUndoGroup(${name === "set_expression" ? ports.aeLiteral("Codex Set Expression") : ports.aeLiteral("Codex Clear Expression")});
      prop.expression = expressionValue;
      try { prop.expressionEnabled = enabledValue; } catch (__expressionEnabledError) {}
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
        layer: __codexLayerInfo(layer),
        property: __codexPropertyInfo(prop, layer, true, true),
        expression: prop.expression || "",
        expressionEnabled: prop.expressionEnabled || false,
        expressionError: prop.expressionError || ""
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "separate_shape_size_dimensions") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndex = ports.requiredPositiveInteger(args, "layerIndex");
    const xSliderName = ports.optionalString(args, "xSliderName", "X Size");
    const ySliderName = ports.optionalString(args, "ySliderName", "Y Size");
    let propertyPath;
    try {
      propertyPath = ports.normalizePropertyPathArg(args, "propertyPath");
    } catch (error) {
      return ports.toolResult(error.message, true);
    }

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");
      var propertyPath = ${ports.aeLiteral(propertyPath)};
      var xSliderName = ${ports.aeLiteral(xSliderName)};
      var ySliderName = ${ports.aeLiteral(ySliderName)};
      var prop = __codexResolveProperty(layer, propertyPath);
      var supported = prop && (prop.matchName === "ADBE Vector Rect Size" || prop.matchName === "ADBE Vector Ellipse Size");
      if (!supported) throw new Error("Property must be ADBE Vector Rect Size or ADBE Vector Ellipse Size.");
      if (!prop.canSetExpression) throw new Error("Size property cannot receive expressions.");
      var currentSize = prop.value;
      if (!(currentSize instanceof Array) || currentSize.length < 2) throw new Error("Size property must be a two-dimensional value.");
      var effectGroup = layer.property("ADBE Effect Parade");
      if (!effectGroup) throw new Error("Layer cannot receive slider controls.");

      function __codexAddSlider(name, value) {
        var group = layer.property("ADBE Effect Parade");
        if (!group) throw new Error("Layer cannot receive slider controls.");
        var slider = group.addProperty("ADBE Slider Control");
        if (!slider) throw new Error("Could not add slider control.");
        slider.name = name;
        var sliderIndex = slider.propertyIndex;
        var sliderName = slider.name;
        var sliderValue = slider.property(1);
        if (sliderValue) sliderValue.setValue(value);
        return { index: sliderIndex, name: sliderName, value: value };
      }

      function __codexSliderByIndex(index) {
        var group = layer.property("ADBE Effect Parade");
        if (!group) return null;
        return group.property(index);
      }

      app.beginUndoGroup("Codex Separate Shape Size Dimensions");
      var xSliderInfo = __codexAddSlider(xSliderName || "X Size", currentSize[0]);
      var ySliderInfo = __codexAddSlider(ySliderName || "Y Size", currentSize[1]);
      prop = __codexResolveProperty(layer, propertyPath);
      if (!prop || !prop.canSetExpression) throw new Error("Size property cannot receive expressions after adding sliders.");
      var expression = [
        "var x = effect(" + JSON.stringify(xSliderInfo.name) + ")(\\"Slider\\").value;",
        "var y = effect(" + JSON.stringify(ySliderInfo.name) + ")(\\"Slider\\").value;",
        "[x, y];"
      ].join("\\n");
      prop.expression = expression;
      try { prop.expressionEnabled = true; } catch (__expressionEnabledError) {}
      var xSlider = __codexSliderByIndex(xSliderInfo.index);
      var ySlider = __codexSliderByIndex(ySliderInfo.index);
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
        layer: __codexLayerInfo(layer),
        property: __codexPropertyInfo(prop, layer, true, true),
        sliders: [
          { name: xSliderInfo.name, effect: xSlider ? __codexPropertyInfo(xSlider, layer, false, true) : null, value: currentSize[0], properties: xSlider ? __codexEffectProperties(xSlider, layer, true, true) : [] },
          { name: ySliderInfo.name, effect: ySlider ? __codexPropertyInfo(ySlider, layer, false, true) : null, value: currentSize[1], properties: ySlider ? __codexEffectProperties(ySlider, layer, true, true) : [] }
        ],
        expression: expression
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "add_comp_to_render_queue") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const renderSettingsTemplate = ports.optionalString(args, "renderSettingsTemplate", "");
    const outputModuleTemplate = ports.optionalString(args, "outputModuleTemplate", "");
    const outputPath = ports.optionalString(args, "outputPath", "");
    let resolvedOutputPath = "";
    if (outputPath) {
      try {
        resolvedOutputPath = ports.resolveOutputFilePath(outputPath);
      } catch (error) {
        return ports.toolResult(error.message, true);
      }
    }

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var renderSettingsTemplate = ${ports.aeLiteral(renderSettingsTemplate)};
      var outputModuleTemplate = ${ports.aeLiteral(outputModuleTemplate)};
      var outputPath = ${ports.aeLiteral(resolvedOutputPath)};

      app.beginUndoGroup("Codex Add Comp To Render Queue");
      var rqItem = app.project.renderQueue.items.add(comp);
      if (renderSettingsTemplate) rqItem.applyTemplate(renderSettingsTemplate);
      if (outputModuleTemplate || outputPath) {
        var outputModule = rqItem.outputModule(1);
        if (outputModuleTemplate) outputModule.applyTemplate(outputModuleTemplate);
        if (outputPath) outputModule.file = new File(outputPath);
      }
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
        renderQueueItem: __codexRenderQueueItemInfo(rqItem)
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "set_render_queue_output") {
    const renderQueueItemIndex = ports.requiredPositiveInteger(args, "renderQueueItemIndex");
    const renderSettingsTemplate = ports.optionalString(args, "renderSettingsTemplate", "");
    const outputModuleTemplate = ports.optionalString(args, "outputModuleTemplate", "");
    const outputPath = ports.optionalString(args, "outputPath", "");
    let resolvedOutputPath = "";
    if (!renderSettingsTemplate && !outputModuleTemplate && !outputPath) return ports.toolResult("Provide renderSettingsTemplate, outputModuleTemplate, or outputPath.", true);
    if (outputPath) {
      try {
        resolvedOutputPath = ports.resolveOutputFilePath(outputPath);
      } catch (error) {
        return ports.toolResult(error.message, true);
      }
    }

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var renderQueueItemIndex = ${renderQueueItemIndex};
      var renderSettingsTemplate = ${ports.aeLiteral(renderSettingsTemplate)};
      var outputModuleTemplate = ${ports.aeLiteral(outputModuleTemplate)};
      var outputPath = ${ports.aeLiteral(resolvedOutputPath)};
      var rq = app.project.renderQueue;
      var rqItem = rq.item(renderQueueItemIndex);
      if (!rqItem) throw new Error("Render queue item not found.");

      app.beginUndoGroup("Codex Set Render Queue Output");
      if (renderSettingsTemplate) rqItem.applyTemplate(renderSettingsTemplate);
      var outputModule = rqItem.outputModule(1);
      if (outputModuleTemplate) outputModule.applyTemplate(outputModuleTemplate);
      if (outputPath) outputModule.file = new File(outputPath);
      var response = {
        renderQueueItem: __codexRenderQueueItemInfo(rqItem)
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "get_render_queue_status") {
    const limit = Math.max(1, Math.min(200, Math.floor(ports.optionalNumber(args, "limit", 50))));

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var rq = app.project.renderQueue;
      var limit = ${limit};
      var items = [];
      for (var __i = 1; __i <= rq.numItems && items.length < limit; __i++) {
        items.push(__codexRenderQueueItemInfo(rq.item(__i)));
      }
      return {
        totalItems: rq.numItems,
        returned: items.length,
        items: items
      };
    `);
    return ports.toolResult(result.result);
  }

  if (name === "set_layer_transform") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const expectedCompItemId=ports.optionalPositiveInteger(args,"expectedCompItemId");
    const expectedLayerId=ports.optionalPositiveInteger(args,"expectedLayerId");
    const layerIndex = ports.requiredPositiveInteger(args, "layerIndex");
    const position = ports.optionalNumberArray(args, "position", null, 2, 3);
    const scale = ports.optionalNumberArray(args, "scale", null, 2, 3);
    const anchorPoint = ports.optionalNumberArray(args, "anchorPoint", null, 2, 3);
    const rotation = ports.optionalNumber(args, "rotation", null);
    const opacity = ports.optionalNumber(args, "opacity", null);

    if (!position && !scale && !anchorPoint && rotation === null && opacity === null) {
      return ports.toolResult("Provide at least one transform value to set.", true);
    }
    if (opacity !== null && (opacity < 0 || opacity > 100)) {
      return ports.toolResult("opacity must be between 0 and 100.", true);
    }

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)}, ${expectedCompItemId === null ? "null" : expectedCompItemId});
      var layer = __codexResolveLayer(comp, ${layerIndex}, ${expectedLayerId === null ? "null" : expectedLayerId});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");

      var positionValue = ${position ? ports.aeLiteral(position) : "null"};
      ${setterIdentityGuard}
      var scaleValue = ${scale ? ports.aeLiteral(scale) : "null"};
      var anchorPointValue = ${anchorPoint ? ports.aeLiteral(anchorPoint) : "null"};
      var rotationValue = ${rotation === null ? "null" : rotation};
      var opacityValue = ${opacity === null ? "null" : opacity};

      app.beginUndoGroup("Codex Set Layer Transform");
      try {
      var transform = layer.property("ADBE Transform Group");
      if (positionValue !== null) transform.property("ADBE Position").setValue(positionValue);
      if (scaleValue !== null) transform.property("ADBE Scale").setValue(scaleValue);
      if (anchorPointValue !== null) transform.property("ADBE Anchor Point").setValue(anchorPointValue);
      if (rotationValue !== null) transform.property("ADBE Rotate Z").setValue(rotationValue);
      if (opacityValue !== null) transform.property("ADBE Opacity").setValue(opacityValue);
      var response = {
        comp: {
          itemId: comp.id,
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        layer: __codexLayerInfo(layer),
        transform: {
          position: transform.property("ADBE Position").value,
          scale: transform.property("ADBE Scale").value,
          anchorPoint: transform.property("ADBE Anchor Point").value,
          rotation: transform.property("ADBE Rotate Z").value,
          opacity: transform.property("ADBE Opacity").value
        }
      };
      return response;
      } finally { app.endUndoGroup(); }
    `);
    return ports.toolResult(result.result);
  }

  if (name === "apply_transform_expression") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndex = ports.requiredPositiveInteger(args, "layerIndex");
    const property = ports.optionalString(args, "property", "");
    const expression = ports.optionalString(args, "expression", "");
    const enabled = ports.optionalBoolean(args, "enabled", true);
    const propertyMap = {
      position: "ADBE Position",
      scale: "ADBE Scale",
      rotation: "ADBE Rotate Z",
      opacity: "ADBE Opacity",
      anchorPoint: "ADBE Anchor Point"
    };

    if (!propertyMap[property]) {
      return ports.toolResult("property must be one of: position, scale, rotation, opacity, anchorPoint.", true);
    }
    if (!expression) return ports.toolResult("expression is required.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");

      var propertyName = ${ports.aeLiteral(property)};
      var propertyMatchName = ${ports.aeLiteral(propertyMap[property])};
      var expressionValue = ${ports.aeLiteral(expression)};
      var enabledValue = ${enabled ? "true" : "false"};

      app.beginUndoGroup("Codex Apply Transform Expression");
      var prop = layer.property("ADBE Transform Group").property(propertyMatchName);
      if (!prop || !prop.canSetExpression) {
        throw new Error("Property cannot receive expressions: " + propertyName);
      }
      prop.expression = expressionValue;
      prop.expressionEnabled = enabledValue;
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        layer: __codexLayerInfo(layer),
        property: propertyName,
        expression: prop.expression,
        expressionEnabled: prop.expressionEnabled,
        expressionError: prop.expressionError || ""
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "add_comp_marker") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const time = ports.optionalNumber(args, "time", null);
    const hasExplicitComment = Object.prototype.hasOwnProperty.call(args, "comment") && args.comment !== undefined && args.comment !== null;
    const comment = hasExplicitComment ? String(args.comment) : "";
    const duration = ports.optionalNumber(args, "duration", null);
    const expectedMarkerCountBefore = ports.optionalNumber(args, "expectedMarkerCountBefore", null);

    if (compItemIndex === null && !compName) return ports.toolResult("compItemIndex or compName is required for add_comp_marker.", true);
    if (time === null) return ports.toolResult("time is required.", true);
    if (!hasExplicitComment) return ports.toolResult("comment is required.", true);
    if (time < 0) return ports.toolResult("time must be 0 or greater.", true);
    if (duration !== null && duration < 0) return ports.toolResult("duration must be 0 or greater.", true);
    if (expectedMarkerCountBefore !== null && (!Number.isInteger(expectedMarkerCountBefore) || expectedMarkerCountBefore < 0)) {
      return ports.toolResult("expectedMarkerCountBefore must be a non-negative integer.", true);
    }

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var markerTime = ${time};
      var markerComment = ${ports.aeLiteral(comment)};
      var markerDuration = ${duration === null ? "null" : duration};
      var expectedMarkerCountBefore = ${expectedMarkerCountBefore === null ? "null" : expectedMarkerCountBefore};
      if (markerTime > comp.duration) throw new Error("time is outside the composition duration.");
      if (markerDuration !== null && markerTime + markerDuration > comp.duration) throw new Error("marker duration extends outside the composition duration.");
      var markerProp = comp.markerProperty;
      if (!markerProp) throw new Error("Composition markers are unavailable.");
      var beforeMarkers = __codexCompMarkers(comp, 100);
      if (expectedMarkerCountBefore !== null && beforeMarkers.count !== expectedMarkerCountBefore) {
        throw new Error("expectedMarkerCountBefore does not match current composition marker count.");
      }
      for (var __existingCompMarker = 1; __existingCompMarker <= markerProp.numKeys; __existingCompMarker++) {
        if (Math.abs(markerProp.keyTime(__existingCompMarker) - markerTime) <= 0.001) {
          throw new Error("A composition marker already exists at the requested time.");
        }
      }

      app.beginUndoGroup("Codex Add Composition Marker");
      var markerValue = new MarkerValue(markerComment);
      if (markerDuration !== null) markerValue.duration = markerDuration;
      markerProp.setValueAtTime(markerTime, markerValue);
      var markerInfo = null;
      try {
        var markerKeyIndex = markerProp.nearestKeyIndex(markerTime);
        if (markerKeyIndex > 0 && Math.abs(markerProp.keyTime(markerKeyIndex) - markerTime) < 0.001) {
          markerInfo = __codexMarkerInfo(markerProp, markerKeyIndex);
        }
      } catch (__markerReadBackError) {}
      if (!markerInfo) {
        markerInfo = {
          keyIndex: null,
          time: markerTime,
          comment: markerComment,
          duration: markerDuration || 0
        };
      }
      var afterMarkers = __codexCompMarkers(comp, 100);
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name,
          duration: comp.duration,
          frameRate: comp.frameRate,
          workAreaStart: comp.workAreaStart,
          workAreaDuration: comp.workAreaDuration
        },
        marker: markerInfo,
        markersBefore: beforeMarkers,
        markers: afterMarkers,
        postVerification: {
          ok: markerInfo !== null && afterMarkers.count === beforeMarkers.count + 1,
          markerCountBefore: beforeMarkers.count,
          markerCountAfter: afterMarkers.count,
          expectedMarkerCountAfter: beforeMarkers.count + 1,
          markerCountIncremented: afterMarkers.count === beforeMarkers.count + 1,
          timeMatches: Math.abs((markerInfo.time || 0) - markerTime) <= 0.001,
          commentMatches: markerInfo.comment === markerComment,
          durationMatches: markerDuration === null || Math.abs((markerInfo.duration || 0) - markerDuration) <= 0.001
        }
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "add_layer_marker") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndex = ports.requiredPositiveInteger(args, "layerIndex");
    const time = ports.optionalNumber(args, "time", null);
    const hasExplicitComment = Object.prototype.hasOwnProperty.call(args, "comment") && args.comment !== undefined && args.comment !== null;
    const comment = hasExplicitComment ? String(args.comment) : "";
    const duration = ports.optionalNumber(args, "duration", null);

    if (!hasExplicitComment) return ports.toolResult("comment is required.", true);
    if (time !== null && time < 0) return ports.toolResult("time must be 0 or greater.", true);
    if (duration !== null && duration < 0) return ports.toolResult("duration must be 0 or greater.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");
      var markerTime = ${time === null ? "comp.time" : time};
      var markerComment = ${ports.aeLiteral(comment)};
      var markerDuration = ${duration === null ? "null" : duration};

      app.beginUndoGroup("Codex Add Layer Marker");
      var markerValue = new MarkerValue(markerComment);
      if (markerDuration !== null) markerValue.duration = markerDuration;
      var markerProp = layer.property("ADBE Marker");
      markerProp.setValueAtTime(markerTime, markerValue);
      var markerInfo = null;
      try {
        var markerKeyIndex = markerProp.nearestKeyIndex(markerTime);
        if (markerKeyIndex > 0 && Math.abs(markerProp.keyTime(markerKeyIndex) - markerTime) < 0.001) {
          markerInfo = __codexMarkerInfo(markerProp, markerKeyIndex);
        }
      } catch (__markerReadBackError) {}
      if (!markerInfo) {
        markerInfo = {
          keyIndex: null,
          time: markerTime,
          comment: markerComment,
          duration: markerDuration || 0
        };
      }
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        layer: __codexLayerInfo(layer),
        marker: markerInfo,
        markers: __codexLayerMarkers(layer, 50)
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "update_layer_marker") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndex = ports.requiredPositiveInteger(args, "layerIndex");
    const markerIndex = ports.optionalPositiveInteger(args, "markerIndex");
    const targetTime = ports.optionalNumber(args, "targetTime", null);
    const targetComment = ports.optionalString(args, "targetComment", "");
    const nextComment = ports.optionalString(args, "comment", null);
    const nextTime = ports.optionalNumber(args, "time", null);
    const nextDuration = ports.optionalNumber(args, "duration", null);

    if (markerIndex === null && targetTime === null) return ports.toolResult("markerIndex or targetTime is required.", true);
    if (targetTime !== null && targetTime < 0) return ports.toolResult("targetTime must be 0 or greater.", true);
    if (nextTime !== null && nextTime < 0) return ports.toolResult("time must be 0 or greater.", true);
    if (nextDuration !== null && nextDuration < 0) return ports.toolResult("duration must be 0 or greater.", true);
    if (nextComment === null && nextTime === null && nextDuration === null) return ports.toolResult("At least one of comment, time, or duration is required.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      function __codexMarkerComment(markerProp, keyIndex) {
        try {
          var markerValue = markerProp.keyValue(keyIndex);
          return markerValue.comment || "";
        } catch (__commentError) {
          return "";
        }
      }
      function __codexFindMarkerKey(markerProp, markerIndex, targetTime, targetComment) {
        if (!markerProp || markerProp.numKeys < 1) throw new Error("Layer has no markers.");
        if (markerIndex !== null) {
          if (markerIndex < 1 || markerIndex > markerProp.numKeys) throw new Error("markerIndex is outside the layer marker range.");
          if (targetTime !== null && Math.abs(markerProp.keyTime(markerIndex) - targetTime) > 0.001) throw new Error("markerIndex does not match targetTime.");
          if (targetComment && __codexMarkerComment(markerProp, markerIndex) !== targetComment) throw new Error("markerIndex does not match targetComment.");
          return markerIndex;
        }
        var matchIndex = 0;
        for (var __mk = 1; __mk <= markerProp.numKeys; __mk++) {
          if (Math.abs(markerProp.keyTime(__mk) - targetTime) <= 0.001) {
            if (targetComment && __codexMarkerComment(markerProp, __mk) !== targetComment) continue;
            if (matchIndex) throw new Error("More than one marker matched targetTime; provide markerIndex.");
            matchIndex = __mk;
          }
        }
        if (!matchIndex) throw new Error("No marker matched the requested target.");
        return matchIndex;
      }
      function __codexCopyMarkerFields(target, source) {
        try { target.chapter = source.chapter || ""; } catch (__chapterCopyError) {}
        try { target.url = source.url || ""; } catch (__urlCopyError) {}
        try { target.frameTarget = source.frameTarget || ""; } catch (__frameTargetCopyError) {}
        try { target.cuePointName = source.cuePointName || ""; } catch (__cueCopyError) {}
        try { target.eventCuePoint = source.eventCuePoint; } catch (__eventCueCopyError) {}
        try { target.protectedRegion = source.protectedRegion; } catch (__protectedCopyError) {}
      }
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");
      var markerProp = layer.property("ADBE Marker");
      if (!markerProp) throw new Error("Layer markers are unavailable.");
      var requestedMarkerIndex = ${markerIndex === null ? "null" : markerIndex};
      var requestedTargetTime = ${targetTime === null ? "null" : targetTime};
      var requestedTargetComment = ${ports.aeLiteral(targetComment)};
      var replacementComment = ${nextComment === null ? "null" : ports.aeLiteral(nextComment)};
      var replacementTime = ${nextTime === null ? "null" : nextTime};
      var replacementDuration = ${nextDuration === null ? "null" : nextDuration};

      app.beginUndoGroup("Codex Update Layer Marker");
      var keyIndex = __codexFindMarkerKey(markerProp, requestedMarkerIndex, requestedTargetTime, requestedTargetComment);
      var markerBefore = __codexMarkerInfo(markerProp, keyIndex);
      var oldValue = markerProp.keyValue(keyIndex);
      var newComment = replacementComment !== null ? replacementComment : markerBefore.comment;
      var newTime = replacementTime !== null ? replacementTime : markerBefore.time;
      var newDuration = replacementDuration !== null ? replacementDuration : markerBefore.duration;
      if (replacementTime !== null) {
        for (var __existingKey = 1; __existingKey <= markerProp.numKeys; __existingKey++) {
          if (__existingKey !== keyIndex && Math.abs(markerProp.keyTime(__existingKey) - newTime) <= 0.001) {
            throw new Error("Another marker already exists at the requested time.");
          }
        }
      }
      var markerValue = new MarkerValue(newComment);
      markerValue.duration = newDuration || 0;
      __codexCopyMarkerFields(markerValue, oldValue);
      if (Math.abs(newTime - markerBefore.time) <= 0.001) {
        markerProp.setValueAtKey(keyIndex, markerValue);
      } else {
        markerProp.removeKey(keyIndex);
        markerProp.setValueAtTime(newTime, markerValue);
      }
      var updatedKeyIndex = markerProp.nearestKeyIndex(newTime);
      var markerInfo = __codexMarkerInfo(markerProp, updatedKeyIndex);
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        layer: __codexLayerInfo(layer),
        markerBefore: markerBefore,
        marker: markerInfo,
        markers: __codexLayerMarkers(layer, 50)
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "delete_layer_marker") {
    const compItemIndex = ports.optionalPositiveInteger(args, "compItemIndex");
    const compName = ports.optionalString(args, "compName", "");
    const layerIndex = ports.requiredPositiveInteger(args, "layerIndex");
    const markerIndex = ports.optionalPositiveInteger(args, "markerIndex");
    const targetTime = ports.optionalNumber(args, "targetTime", null);
    const targetComment = ports.optionalString(args, "targetComment", "");

    if (markerIndex === null && targetTime === null) return ports.toolResult("markerIndex or targetTime is required.", true);
    if (targetTime !== null && targetTime < 0) return ports.toolResult("targetTime must be 0 or greater.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      function __codexMarkerComment(markerProp, keyIndex) {
        try {
          var markerValue = markerProp.keyValue(keyIndex);
          return markerValue.comment || "";
        } catch (__commentError) {
          return "";
        }
      }
      function __codexFindMarkerKey(markerProp, markerIndex, targetTime, targetComment) {
        if (!markerProp || markerProp.numKeys < 1) throw new Error("Layer has no markers.");
        if (markerIndex !== null) {
          if (markerIndex < 1 || markerIndex > markerProp.numKeys) throw new Error("markerIndex is outside the layer marker range.");
          if (targetTime !== null && Math.abs(markerProp.keyTime(markerIndex) - targetTime) > 0.001) throw new Error("markerIndex does not match targetTime.");
          if (targetComment && __codexMarkerComment(markerProp, markerIndex) !== targetComment) throw new Error("markerIndex does not match targetComment.");
          return markerIndex;
        }
        var matchIndex = 0;
        for (var __mk = 1; __mk <= markerProp.numKeys; __mk++) {
          if (Math.abs(markerProp.keyTime(__mk) - targetTime) <= 0.001) {
            if (targetComment && __codexMarkerComment(markerProp, __mk) !== targetComment) continue;
            if (matchIndex) throw new Error("More than one marker matched targetTime; provide markerIndex.");
            matchIndex = __mk;
          }
        }
        if (!matchIndex) throw new Error("No marker matched the requested target.");
        return matchIndex;
      }
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${ports.aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");
      var markerProp = layer.property("ADBE Marker");
      if (!markerProp) throw new Error("Layer markers are unavailable.");
      var requestedMarkerIndex = ${markerIndex === null ? "null" : markerIndex};
      var requestedTargetTime = ${targetTime === null ? "null" : targetTime};
      var requestedTargetComment = ${ports.aeLiteral(targetComment)};

      app.beginUndoGroup("Codex Delete Layer Marker");
      var keyIndex = __codexFindMarkerKey(markerProp, requestedMarkerIndex, requestedTargetTime, requestedTargetComment);
      var markerDeleted = __codexMarkerInfo(markerProp, keyIndex);
      markerProp.removeKey(keyIndex);
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        layer: __codexLayerInfo(layer),
        markerDeleted: markerDeleted,
        markers: __codexLayerMarkers(layer, 50)
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "create_test_comp") {
    const compName = ports.optionalString(args, "name", `Codex Test Comp ${ports.timestampForFilename(new Date()).replace(/-/g, "_")}`);
    const width = Math.max(4, Math.floor(ports.optionalNumber(args, "width", 1920)));
    const height = Math.max(4, Math.floor(ports.optionalNumber(args, "height", 1080)));
    const duration = ports.optionalNumber(args, "duration", 5);
    const frameRate = ports.optionalNumber(args, "frameRate", 30);
    const openInViewer = ports.optionalBoolean(args, "openInViewer", true);

    if (duration <= 0) return ports.toolResult("duration must be greater than 0.", true);
    if (frameRate <= 0) return ports.toolResult("frameRate must be greater than 0.", true);

    const result = await ports.runExtendScriptBody(`
      ${resolveCompScript}
      var compName = ${ports.aeLiteral(compName)};
      var width = ${width};
      var height = ${height};
      var duration = ${duration};
      var frameRate = ${frameRate};
      var openInViewer = ${openInViewer ? "true" : "false"};

      app.beginUndoGroup("Codex Create Test Comp");
      var comp = app.project.items.addComp(compName, width, height, 1, duration, frameRate);
      try { comp.comment = "Created by AE Agent create_test_comp"; } catch (__commentError) {}
      if (openInViewer) comp.openInViewer();
      var response = {
        itemIndex: __codexProjectIndexForItem(comp),
        name: comp.name,
        width: comp.width,
        height: comp.height,
        duration: comp.duration,
        frameRate: comp.frameRate,
        numLayers: comp.numLayers
      };
      app.endUndoGroup();
      return response;
    `);
    return ports.toolResult(result.result);
  }

  if (name === "cleanup_test_items") {
    const confirm = ports.optionalBoolean(args, "confirm", false);
    if (!confirm) return ports.toolResult("confirm must be true to remove test items.", true);
    if(args.owner!==undefined || args.itemIds!==undefined){
      try{
        const fresh=await ports.requireFreshReviewRecord(args.owner,args.itemIds || []);
        const result=await ports.runExtendScriptBody(ports.placeholderReviewService.cleanupServiceScript(fresh.record,fresh.projectFile));
        const payload=result && result.result;
        if(!payload || payload.ok!==true)return ports.toolResult({ok:false,code:"review_cleanup_failed",details:payload || result,recovery:"Read remaining item IDs; do not repeat cleanup automatically."},true);
        const ids=fresh.record.receipt.items.map(item=>item.itemId);
        const absent=await ports.runExtendScriptBody(ports.placeholderReviewService.readServiceScript(ids));
        if(!absent.result || !ports.placeholderSourceRecovery.pathsEqual(absent.result.projectFile,fresh.projectFile) || absent.result.items.length)throw ports.placeholderError("review_cleanup_absence_unproven");
        const current=ports.projectStateMemory.readProjectState(fresh.projectFile);
        ports.projectStateController.unregisterReview(fresh.projectFile,args.owner,ids,current.revision);
        return ports.toolResult({...payload,owner:args.owner,absenceVerified:true});
      }catch(error){return ports.toolResult({ok:false,code:error.code || error.message,error:error.message},true);}
    }

    const namePrefix = ports.optionalString(args, "namePrefix", "Codex Test");
    const maxItems = Math.max(1, Math.min(250, Math.floor(ports.optionalNumber(args, "maxItems", 25))));
    if (!namePrefix || namePrefix.length < 3) {
      return ports.toolResult("namePrefix must be at least 3 characters.", true);
    }

    const result = await ports.runExtendScriptBody(`
      var namePrefix = ${ports.aeLiteral(namePrefix)};
      var maxItems = ${maxItems};
      var removed = [];

      for(var p=1;p<=app.project.numItems;p++){var candidate=app.project.item(p);if(candidate && String(candidate.name).indexOf(namePrefix)===0 && String(candidate.name).indexOf("AE_AGENT_REVIEW_")===0)throw new Error("review_items_require_exact_registered_cleanup");}

      app.beginUndoGroup("Codex Cleanup Test Items");
      try {
      for (var i = app.project.numItems; i >= 1 && removed.length < maxItems; i--) {
        var item = app.project.item(i);
        if (item && item.name && item.name.indexOf(namePrefix) === 0) {
          removed.push({
            itemIndex: i,
            name: item.name,
            typeName: item.typeName || null
          });
          item.remove();
        }
      }
      return {
        namePrefix: namePrefix,
        removed: removed,
        removedCount: removed.length,
        hitLimit: removed.length >= maxItems
      };
      }finally{app.endUndoGroup();}
    `);
    return ports.toolResult(result.result);
  }

  return ports.toolResult(`Unknown tool: ${name}`, true);
}
return callTool;
}
module.exports=Object.freeze({createToolDispatch});
