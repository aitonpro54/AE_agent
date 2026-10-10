"use strict";

(function (root, factory) {
  if (typeof window === "undefined" && typeof module === "object" && module.exports) module.exports = factory;
  else {
    var runtime = factory(root.AEAgentPanelContract, root.localStorage || localStorage);
    Object.defineProperty(root,"AEAgentPanelActions",{value:runtime.api,writable:false,configurable:false,enumerable:true});
    // Consumed once by the panel closure. No public registration/reset API.
    root.AEAgentPanelActionBootstrap = function (bindings) {
      delete root.AEAgentPanelActionBootstrap;
      return runtime.bind(bindings);
    };
  }
})(typeof window !== "undefined" ? window : this, function (contract, storage) {
  var STORAGE_KEY = "codexAePanelActionReceipts";
  var INITIALIZED_KEY = "codexAePanelActionReceiptsInitialized";
  var INDEX_KEY = "codexAePanelActionReceiptIndex";
  var MAX_RECEIPTS = 120, MAX_TOMBSTONES = 1000, MAX_TERMINAL = 50;
  var instanceId = "panel-" + Date.now() + "-" + Math.random().toString(36).slice(2);
  var records = Object.create(null), tombstones = Object.create(null), recoveries=Object.create(null), validatedRecoveries=Object.create(null);
  var active = null, bindings = null, storageFailure = "", bound = false;
  var humanSettlement=null, humanSettlementTrusted=false, humanLookupPending=false;
  var HUMAN_KEY="codexAeHumanGuardSettlement20261010";
  var fixtureDisposition=null, fixtureDispositionTrusted=false, fixtureLookupPending=false;
  var FIXTURE_KEY="codexAeAmeFixtureUIDispositionV1", FIXTURE_ID="67d45704-92ac-4700-9288-b7db697ea90f", FIXTURE_RUN="40ddeee4-8b49-47d6-9301-03873fbe8cec";
  var nativeAbandonments=Object.create(null),nativeAbandonmentTrusted=Object.create(null),nativeAbandonmentLookupPending=false;
  var NATIVE_ABANDONMENT_KEY="codexAeNativeFixtureAbandonmentsV1";
  function dataField(value,key) {
    if(!value || typeof value !== "object") return undefined;
    var descriptor=Object.getOwnPropertyDescriptor(value,key);
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor,"value") ? descriptor.value : undefined;
  }
  function life() { return bindings ? bindings.lifecycle() : {epoch:0,generation:"0",busy:false}; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function rawState() { return bindings ? bindings.state() : {available:false}; }
  function passiveRead(name) {
    return /^(logs.get|chat.sessions.list|chat.transcript.get|plan.current|autonomy.refresh|placeholder.refresh|connector.refresh)$/.test(name);
  }
  function unresolvedEffects() {
    return Object.keys(records).filter(function(id) {
      var r=records[id];
      return r.state === "unknown" && !passiveRead(r.action) && r.action !== "plan.reconcile" && !recoveryValid(id,true) && !humanSettlementValid(id,true) && !fixtureDispositionValid(id,true) && !nativeAbandonmentValid(id,true);
    }).map(function(id) {
      var r=records[id],definition=contract.getActionDefinition(r.action);
      return {requestId:id,action:r.action,runId:r.runId || null,effect:definition && definition.effect || "unknown",
        code:r.code || "delivery_unknown",phase:r.phase || "delivery_unknown",
        recovery:r.runId ? "same_run_read_only_reconciliation" : "exact_terminal_identity_evidence_required"};
    });
  }
  function hardcoreEvidence(result) {
    var session=result.response || result.session || result;
    var attempts=Array.isArray(session.attempts) ? session.attempts : [];
    var finalAttempt=session.finalAttempt || null;
    var selected=result.run || session.finalRun || finalAttempt && finalAttempt.run || null;
    if(!selected) for(var i=attempts.length-1;i>=0;i--) {if(attempts[i] && attempts[i].run) {selected=attempts[i].run;break;}}
    var runs=[],reasons=[],identities=[];
    function reason(code) {if(reasons.indexOf(code)<0) reasons.push(code);}
    function ongoing(value) {return /^(unknown|started|pending|queued|leased|submitted|running|executing|inflight|in_flight|in_progress|timed_out|timed_out_after_submit)$/.test(String(value || ""));}
    function inspectRun(run) {
      if(!run || typeof run !== "object" || runs.indexOf(run)>=0) return;
      runs.push(run);
      var id=run.id || run.runId;
      if(typeof id === "string" && id && identities.indexOf(id)<0) identities.push(id);
      var outcome=run.outcome || {},execution=outcome.execution || {},mutation=outcome.mutation || {};
      if(!/^(not_started|completed|failed)$/.test(String(execution.status || "")) ||
         !/^(not_started|not_requested|applied|failed)$/.test(String(mutation.status || ""))) reason("run_terminal_evidence_missing_or_unknown");
      if(ongoing(run.status) || ongoing(run.state)) reason("run_still_active");
      (Array.isArray(run.steps) ? run.steps : []).forEach(function(step) {
        if(ongoing(step.status)) reason("step_outcome_unresolved");
        (Array.isArray(step.commands) ? step.commands : []).forEach(function(command) {
          if(ongoing(command.state) || ongoing(command.lifecycleState) || ongoing(command.timedOutFrom)) reason("command_outcome_unresolved");
        });
      });
      var verification=outcome.verification && outcome.verification.status;
      if(!run.dryRun && (mutation.status === "applied" || mutation.status === "failed") &&
         (run.ok !== true || verification !== "passed" && verification !== "not_required")) reason("applied_run_requires_reconciliation");
    }
    inspectRun(selected);inspectRun(session.finalRun);inspectRun(finalAttempt && finalAttempt.run);
    attempts.concat(finalAttempt ? [finalAttempt] : []).forEach(function(attempt) {
      if(!attempt || typeof attempt !== "object") {reason("attempt_evidence_missing");return;}
      inspectRun(attempt.run);inspectRun(attempt.dryRun);
      if(ongoing(attempt.status) || /unknown|timeout|timed.?out|reconcil/i.test(String(attempt.status || ""))) reason("attempt_outcome_unresolved");
      if(!attempt.run && !/^(plan-needs-review|dry-run-needs-review)$/.test(String(attempt.status || ""))) {
        if(!(attempt.status === "failed" && (attempt.providerError || attempt.readiness) && !attempt.dryRun)) reason("attempt_run_evidence_missing");
      }
    });
    if(!/^(verified|completed|needs_review|failed|cancelled)$/.test(String(session.status || ""))) reason("session_terminal_evidence_missing");
    if(!runs.length && !attempts.length) reason("hardcore_execution_evidence_missing");
    var applied=runs.some(function(run) {return run.outcome && run.outcome.mutation && run.outcome.mutation.status === "applied";});
    var noEffect=runs.length > 0 && runs.every(function(run) {
      return run.outcome && run.outcome.execution && run.outcome.execution.status === "not_started" &&
        run.outcome.mutation && /^(not_started|not_requested)$/.test(run.outcome.mutation.status);
    });
    return {run:selected,unknown:reasons.length > 0,evidence:{status:reasons.length ? "unknown" : "terminal",reasonCodes:reasons,observedRunIds:identities},
      executed:applied ? true : noEffect || !runs.length && !reasons.length ? false : reasons.length ? null : true};
  }
  function normalizeHardcoreReceipt(record) {
    var evidence=hardcoreEvidence(record.result || {});
    record.result=record.result || {};
    if(evidence.run) {
      record.result.run=evidence.run;record.result.runId=evidence.run.id || evidence.run.runId;
      record.result.outcome=evidence.run.outcome;record.runId=record.result.runId;record.outcome=evidence.run.outcome;
    }
    record.result.executionRequested=true;record.result.executed=evidence.executed;record.executionEvidence=evidence.evidence;
    if(evidence.unknown) {
      record.state="unknown";record.phase="hardcore_outcome_unresolved";record.delivery="unknown";
      if(!record.code) record.code="hardcore_outcome_unknown";
    }
  }
  function state(options) {
    if (options !== undefined && (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).length)) {
      return {protocolVersion:contract.PROTOCOL_VERSION,code:"invalid_state_options"};
    }
    var current = life(), snapshot = contract.redactState(rawState());
    snapshot.protocolVersion = contract.PROTOCOL_VERSION;
    snapshot.panelInstanceId = instanceId;
    snapshot.panelLifecycleEpoch = current.epoch;
    snapshot.panelGeneration = String(current.generation);
    snapshot.panelConnectionGeneration = snapshot.panelGeneration;
    var unresolved=unresolvedEffects();
    snapshot.busy = !!active || !!current.busy || unresolved.length > 0;
    snapshot.reconciliationRequired = unresolved.length > 0;
    snapshot.unresolvedActions = unresolved;
    snapshot.actionStorage = storageFailure ? "unavailable" : "ready";
    snapshot.activeAction = active ? {requestId:active.requestId,action:active.action} : null;
    snapshot.humanSettlementLookupPending=humanLookupPending;
    snapshot.humanSettlement=humanSettlementTrusted && humanSettlement ? {settlementId:humanSettlement.value.settlementId,status:"abandoned_reviewed",guardDisposition:"released",aeExecutionProven:false,replayAllowed:false} : null;
    snapshot.ameFixtureDispositionLookupPending=fixtureLookupPending;
    snapshot.ameFixtureDisposition=fixtureDispositionValid(FIXTURE_ID,true) ? {dispositionId:fixtureDisposition.value.dispositionId,status:"abandoned_reviewed",guardDisposition:"released",historicalOutcome:"unknown",aeExecutionProven:false,replayAllowed:false} : null;
    snapshot.nativeFixtureAbandonmentLookupPending=nativeAbandonmentLookupPending;
    snapshot.nativeFixtureAbandonments=Object.keys(nativeAbandonments).filter(function(id){return nativeAbandonmentValid(id,true);}).map(function(id){var v=nativeAbandonments[id].value;return {requestId:id,runId:v.selector.runId,dispositionId:v.dispositionId,status:v.status,guardDisposition:v.guardDisposition,historicalOutcome:"unknown",nativeExecutionProven:false,replayAllowed:false};});
    return snapshot;
  }
  // Synchronous SHA-256 keeps content out of durable receipts in the CEP runtime.
  function sha256(text) {
    var input=unescape(encodeURIComponent(text)), words=[], length=input.length * 8, hash=[], constants=[], prime=2;
    function primeNumber(n) {for(var p=2;p*p<=n;p++) if(n%p === 0) return false;return true;}
    while(constants.length<64) {
      if(primeNumber(prime)) {if(hash.length<8) hash.push((Math.sqrt(prime)%1*4294967296)|0);constants.push((Math.pow(prime,1/3)%1*4294967296)|0);}
      prime++;
    }
    for(var i=0;i<input.length;i++) words[i>>2]=(words[i>>2] || 0) | input.charCodeAt(i) << (24-(i%4)*8);
    words[length>>5]=(words[length>>5] || 0) | 0x80 << (24-(input.length%4)*8);
    words[((length+64>>9)<<4)+15]=length;
    function rotate(x,n) {return x>>>n | x<<32-n;}
    for(var base=0;base<words.length;base+=16) {
      var w=[], previous=hash.slice(), a=hash[0],b=hash[1],c=hash[2],d=hash[3],e=hash[4],f=hash[5],g=hash[6],h=hash[7];
      for(var j=0;j<64;j++) {
        if(j<16) w[j]=words[base+j] || 0;
        else {var x=w[j-15],y=w[j-2];w[j]=((rotate(x,7)^rotate(x,18)^x>>>3)+w[j-16]+(rotate(y,17)^rotate(y,19)^y>>>10)+w[j-7])|0;}
        var t1=(h+(rotate(e,6)^rotate(e,11)^rotate(e,25))+(e&f^~e&g)+constants[j]+w[j])|0;
        var t2=((rotate(a,2)^rotate(a,13)^rotate(a,22))+(a&b^a&c^b&c))|0;
        h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;
      }
      [a,b,c,d,e,f,g,h].forEach(function(value,index) {hash[index]=(previous[index]+value)|0;});
    }
    return hash.map(function(value) {return ("00000000"+(value>>>0).toString(16)).slice(-8);}).join("");
  }
  function signature(envelope) {
    var def = contract.getActionDefinition(envelope.action);
    function canonical(value, schema) {
      if (schema && schema.writeOnly) return "[WRITE_ONLY_PRESENT]";
      if (!value || typeof value !== "object") return contract.redactState({value:value}).value;
      var out = {};
      Object.keys(value).sort().forEach(function (key) {
        out[key] = canonical(value[key], schema && schema.properties && schema.properties[key]);
      });
      return out;
    }
    return sha256(JSON.stringify({action:envelope.action,args:canonical(envelope.args,def.schema),expectedState:envelope.expectedState || {}}));
  }
  function terminal(record) { return /^(completed|error|rejected)$/.test(record.state); }
  function humanSettlementValid(id,trusted) {
    var saved=humanSettlement,v=saved && saved.value,ids=["568c1a03-1eef-4f04-806a-eaa7acaa0c20","cb5c3b53-5443-474e-93df-aa8210758886"],runs=["eb28a045-048a-46ad-aa69-276302b38c73","c6d0acfb-5c05-4897-80a9-e509ab0a47cf"];
    if(!saved || saved.schema!=="ae-agent-human-guard-settlement.v1.envelope" || saved.sha256!==sha256(JSON.stringify(v)) || !v || v.schema!=="ae-agent-human-guard-settlement.v1" || !contract.UUID_REGEX.test(v.settlementId || "") || v.status!=="abandoned_reviewed" || v.guardDisposition!=="released" || v.aeExecutionProven!==false || v.replayAllowed!==false || v.authorizationSource!=="explicit_user_chat" || !v.reason || !Array.isArray(v.entries) || v.entries.length!==2 || ids.indexOf(id)<0 || trusted && !humanSettlementTrusted)return false;
    return v.entries.every(function(e,i) {
      var r=records[ids[i]],projection=r && contract.sanitizeReceipt(r);
      if(projection){delete projection.recovery;delete projection.humanSettlement;}
      return e.originalRequestId===ids[i] && e.runId===runs[i] && e.action==="plan.run" && e.effect==="protected_plan_run" && r && r.requestId===ids[i] && r.runId===runs[i] && r.action===e.action && r.effect===e.effect && r.state==="unknown" && r.replayAllowed===false && e.panelReceiptHash===sha256(JSON.stringify(projection)) && /^[a-f0-9]{64}$/.test(e.originalReceiptHash || "") && /^[a-f0-9]{64}$/.test(e.canonicalRunRecordHash || "") && /^[a-f0-9]{64}$/.test(e.transportSignatureHash || "") && e.originalBinding && e.originalBinding.panelInstanceId===r.panelInstanceId && e.originalBinding.panelLifecycleEpoch===r.epoch && e.originalBinding.panelGeneration===r.generation;
    });
  }
  function refreshHumanSettlements(onDone) {
    humanSettlementTrusted=false;
    if(!bindings || typeof bindings.lookupHumanSettlements!=="function") {if(onDone)onDone(false);return;}
    humanLookupPending=true;
    bindings.lookupHumanSettlements(function(error,saved) {
      humanLookupPending=false;
      if(error){if(onDone)onDone(false);return;}
      if(saved===null){humanSettlement=null;if(onDone)onDone(true);return;}
      var prior=humanSettlement;humanSettlement=saved && clone(saved);
      if(!humanSettlementValid("568c1a03-1eef-4f04-806a-eaa7acaa0c20",false)){humanSettlement=prior;if(onDone)onDone(false);return;}
      try{storage.setItem(HUMAN_KEY,JSON.stringify(humanSettlement));humanSettlementTrusted=true;}catch(_){humanSettlementTrusted=false;}
      if(onDone)onDone(humanSettlementTrusted);
    });
  }
  function currentFixtureActor() {
    var current=life();
    return {panelInstanceId:instanceId,panelLifecycleEpoch:current.epoch,panelGeneration:String(current.generation)};
  }
  // Pure read of one exact private receipt. Neither adoption nor receipt rewriting.
  function readAmeFixtureUIGuard(value) {
    if(!value || Object.keys(value).sort().join(",")!=="requestId,runId" || value.requestId!==FIXTURE_ID || value.runId!==FIXTURE_RUN)return null;
    var r=records[FIXTURE_ID];
    if(!r || r.runId!==FIXTURE_RUN || typeof r.signature!=="string")return null;
    return {projection:contract.sanitizeReceipt(r),signatureSha256:sha256(r.signature),currentBinding:currentFixtureActor(),
      controllerIdle:!active && !life().busy && !rawState().recoveryTransport && !storageFailure};
  }
  function fixtureDispositionValid(id,trusted) {
    var saved=fixtureDisposition,v=saved && saved.value,e=v && v.entry,readBack=saved && saved.readBack,runtime=readBack && readBack.runtime,r=records[id],p=r && contract.sanitizeReceipt(r),run=p && p.result && p.result.run,provenance=run && run.provenance;
    // First private adoption pins the full actor. Subsequent connect/disconnect
    // generations in this trusted instance preserve the historical disposition.
    if(id!==FIXTURE_ID || !saved || saved.schema!=="ae-agent.ame-fixture-ui-disposition.v1.envelope" || saved.sha256!==sha256(JSON.stringify(v)) ||
      !/^[a-f0-9]{64}$/.test(saved.auditSha256 || "") || !/^[a-f0-9]{64}$/.test(saved.consumptionSha256 || "") || !v || v.schema!=="ae-agent.ame-fixture-ui-disposition.v1" ||
      !contract.UUID_REGEX.test(v.dispositionId || "") || !contract.UUID_REGEX.test(v.captureId || "") || !/^[a-f0-9]{64}$/.test(v.captureSha256 || "") ||
      v.status!=="abandoned_reviewed" || v.guardDisposition!=="released" || v.historicalOutcome!=="unknown" || v.aeExecutionProven!==false || v.replayAllowed!==false ||
      v.authorizationSource!=="explicit_user_chat" || typeof v.reason!=="string" || !v.reason.trim() || !e || !r || r.source!=="ui" || r.state!=="unknown" || r.phase!=="outcome_unresolved" ||
      r.code!=="EPERM" || r.delivery!=="unknown" || r.replayAllowed!==false || r.action!=="plan.run" || r.effect!=="protected_plan_run" || r.runId!==FIXTURE_RUN ||
      e.originalRequestId!==FIXTURE_ID || e.runId!==FIXTURE_RUN || e.action!==r.action || e.effect!==r.effect || e.actionId!=="act_1e36f475c8214022b84df276cd3ca4bf" || e.proposalRevision!==2 ||
      e.privateSignatureSha256!==sha256(r.signature) || e.panelReceiptHash!==sha256(JSON.stringify(p)) || !/^[a-f0-9]{64}$/.test(e.canonicalRunRecordHash || "") ||
      !/^[a-f0-9]{64}$/.test(e.canonicalRunProjectionHash || "") || e.canonicalRunProjectionHash!==sha256(JSON.stringify(run)) ||
      !e.originalBinding || e.originalBinding.panelInstanceId!==r.panelInstanceId || e.originalBinding.panelLifecycleEpoch!==r.epoch || e.originalBinding.panelGeneration!==r.generation ||
      !readBack || readBack.schema!=="ae-agent.ame-fixture-ui-disposition.v1.read-back" || readBack.dispositionSha256!==saved.sha256 || readBack.entrySha256!==sha256(JSON.stringify(e)) ||
      !readBack.currentActor || readBack.currentActor.panelInstanceId!==instanceId || !trusted && JSON.stringify(readBack.currentActor)!==JSON.stringify(currentFixtureActor()) ||
      !runtime || !/^[a-f0-9]{64}$/.test(runtime.loadedRuntimeSha256 || "") ||
      runtime.currentRuntimeSha256!==runtime.loadedRuntimeSha256 || !runtime.panelAssetHashes || !/^[a-f0-9]{64}$/.test(runtime.panelAssetHashes["panel-actions.js"] || "") ||
      !/^[a-f0-9]{64}$/.test(runtime.panelAssetHashes["panel.js"] || "") || !readBack.installed || JSON.stringify(readBack.installed.hashes)!==JSON.stringify(runtime.panelAssetHashes) ||
      !provenance || provenance.actionId!==e.actionId || provenance.proposalRevision!==2 ||
      run.ok!==false || run.dryRun!==false || run.errorCode!=="EPERM" || trusted && !fixtureDispositionTrusted)return false;
    return !storageFailure;
  }
  function nativeFixtureRecord(id) {
    var r=records[id],run=r && r.result && r.result.run;
    return r && r.action==="plan.run" && r.effect==="protected_plan_run" && r.source==="ui" && r.state==="unknown" && r.phase==="outcome_unresolved" && r.delivery==="unknown" && r.replayAllowed===false &&
      /^fixture_[a-z0-9_]+$/.test(r.code || "") && run && run.ok===false && run.dryRun===false && run.errorCode===r.code && run.m100Action && run.m100Action.confirmedBySurface==="cep-panel" &&
      run.provenance && run.provenance.actionId===run.m100Action.actionId && Array.isArray(run.steps) && run.steps.length===1 && run.steps[0].tool==="ame_native_fixture_probe";
  }
  function readNativeFixtureGuard(value) {
    if(!value || Object.keys(value).sort().join(",")!=="requestId,runId" || !contract.UUID_REGEX.test(value.requestId || "") || !contract.UUID_REGEX.test(value.runId || "") || !nativeFixtureRecord(value.requestId))return null;
    var r=records[value.requestId];if(r.runId!==value.runId || typeof r.signature!=="string")return null;
    return {projection:contract.sanitizeReceipt(r),signatureSha256:sha256(r.signature),currentBinding:currentFixtureActor(),controllerIdle:!active && !life().busy && !rawState().recoveryTransport && !storageFailure};
  }
  function nativeAbandonmentValid(id,trusted) {
    var saved=nativeAbandonments[id],v=saved && saved.value,e=v && v.entry,back=saved && saved.readBack,r=records[id],p=r && contract.sanitizeReceipt(r),run=p && p.result && p.result.run,rt=back && back.runtime;
    if(!saved || saved.schema!=="ae-agent.native-fixture-abandonment.v1.envelope" || saved.sha256!==sha256(JSON.stringify(v)) || !v || v.schema!=="ae-agent.native-fixture-abandonment.v1" ||
      !/^[a-f0-9]{64}$/.test(saved.auditSha256 || "") || !/^[a-f0-9]{64}$/.test(saved.consumptionSha256 || "") || !contract.UUID_REGEX.test(v.dispositionId || "") || !contract.UUID_REGEX.test(v.captureId || "") ||
      !contract.UUID_REGEX.test(v.observationId || "") || !/^[a-f0-9]{64}$/.test(v.observationSha256 || "") || !/^[a-f0-9]{64}$/.test(v.captureSha256 || "") ||
      v.status!=="abandoned_reviewed" || v.guardDisposition!=="released" || v.historicalOutcome!=="unknown" || v.nativeExecutionProven!==false || v.replayAllowed!==false ||
      v.authorizationSource!=="explicit_user_chat" || typeof v.reason!=="string" || !v.reason.trim() || !v.selector || v.selector.requestId!==id || !nativeFixtureRecord(id) || r.runId!==v.selector.runId ||
      !e || e.originalRequestId!==id || e.runId!==r.runId || e.action!==r.action || e.effect!==r.effect || e.actionId!==run.provenance.actionId || e.proposalRevision!==run.provenance.proposalRevision ||
      e.privateSignatureSha256!==sha256(r.signature) || e.panelReceiptHash!==sha256(JSON.stringify(p)) || e.canonicalRunProjectionHash!==sha256(JSON.stringify(run)) || !/^[a-f0-9]{64}$/.test(e.canonicalRunRecordHash || "") ||
      !e.originalBinding || e.originalBinding.panelInstanceId!==r.panelInstanceId || e.originalBinding.panelLifecycleEpoch!==r.epoch || e.originalBinding.panelGeneration!==r.generation ||
      !back || back.schema!=="ae-agent.native-fixture-abandonment.v1.read-back" || back.dispositionSha256!==saved.sha256 || back.entrySha256!==sha256(JSON.stringify(e)) ||
      !back.currentActor || back.currentActor.panelInstanceId!==instanceId || !trusted && JSON.stringify(back.currentActor)!==JSON.stringify(currentFixtureActor()) ||
      !rt || !/^[a-f0-9]{64}$/.test(rt.loadedRuntimeSha256 || "") || rt.currentRuntimeSha256!==rt.loadedRuntimeSha256 || !rt.panelAssetHashes ||
      !/^[a-f0-9]{64}$/.test(rt.panelAssetHashes["panel-actions.js"] || "") || !/^[a-f0-9]{64}$/.test(rt.panelAssetHashes["panel.js"] || "") ||
      !back.installed || JSON.stringify(back.installed.hashes)!==JSON.stringify(rt.panelAssetHashes) || trusted && nativeAbandonmentTrusted[id]!==saved.sha256)return false;
    return !storageFailure;
  }
  function refreshNativeFixtureAbandonments(onDone) {
    if(nativeAbandonmentLookupPending){if(onDone)onDone(false);return;}
    nativeAbandonmentTrusted=Object.create(null);
    var ids=Object.keys(records).filter(nativeFixtureRecord),startedActor=JSON.stringify(currentFixtureActor());
    if(!ids.length){if(onDone)onDone(true);return;}
    if(!bindings || typeof bindings.lookupNativeFixtureAbandonment!=="function"){if(onDone)onDone(false);return;}
    nativeAbandonmentLookupPending=true;
    function next() {
      if(!ids.length){nativeAbandonmentLookupPending=false;if(onDone)onDone(true);return;}
      var id=ids.shift(),r=records[id];
      bindings.lookupNativeFixtureAbandonment({requestId:id,runId:r.runId},function(error,saved) {
        if(error || startedActor!==JSON.stringify(currentFixtureActor())){nativeAbandonmentLookupPending=false;if(onDone)onDone(false);return;}
        if(saved===null){delete nativeAbandonments[id];next();return;}
        var prior=nativeAbandonments[id];nativeAbandonments[id]=saved && clone(saved);
        if(active || life().busy || rawState().recoveryTransport || !nativeAbandonmentValid(id,false)){if(prior)nativeAbandonments[id]=prior;else delete nativeAbandonments[id];nativeAbandonmentLookupPending=false;if(onDone)onDone(false);return;}
        try{storage.setItem(NATIVE_ABANDONMENT_KEY,JSON.stringify(nativeAbandonments));nativeAbandonmentTrusted[id]=saved.sha256;}catch(_){nativeAbandonmentLookupPending=false;if(onDone)onDone(false);return;}
        next();
      });
    }
    next();
  }
  function refreshAmeFixtureDisposition(onDone) {
    fixtureDispositionTrusted=false;
    // The existing startup lookup remains sufficient for panels without this guard.
    if(!records[FIXTURE_ID]){fixtureDisposition=null;if(onDone)onDone(true);return;}
    if(!bindings || typeof bindings.lookupAmeFixtureDisposition!=="function"){if(onDone)onDone(false);return;}
    if(fixtureLookupPending){if(onDone)onDone(false);return;}
    fixtureLookupPending=true;
    var startedActor=JSON.stringify(currentFixtureActor());
    bindings.lookupAmeFixtureDisposition(function(error,saved) {
      fixtureLookupPending=false;
      if(error || startedActor!==JSON.stringify(currentFixtureActor())){if(onDone)onDone(false);return;}
      if(saved===null){fixtureDisposition=null;if(onDone)onDone(true);return;}
      var previous=fixtureDisposition;fixtureDisposition=saved && clone(saved);
      var raw=rawState(),current=life();
      if(active || current.busy || raw.recoveryTransport || !fixtureDispositionValid(FIXTURE_ID,false)){fixtureDisposition=previous;if(onDone)onDone(false);return;}
      try{storage.setItem(FIXTURE_KEY,JSON.stringify(fixtureDisposition));fixtureDispositionTrusted=true;}catch(_){fixtureDispositionTrusted=false;}
      if(onDone)onDone(fixtureDispositionTrusted);
    });
  }
  function recoveryValid(id,confirmed) {
    var side=recoveries[id],original=records[id],value=side && side.envelope,common=value && value.schema==="ae-agent-common-title-assembly-recovery.v1.envelope",r=value && (common ? value.value : value.receipt),p=original && original.result && original.result.run && original.result.run.provenance;
    if(!original || original.action!=="plan.run" || original.state!=="unknown" || !side || !r ||
      (!common && value.schema!=="ae-agent-generated-export-recovery-envelope.v1") || value.sha256!==sha256(JSON.stringify(r)) ||
      (common ? r.schema!=="ae-agent-common-title-assembly-recovery.v1" || r.status!=="verified_current_state" || r.historicalExecutionOutcome!=="unknown" || r.originalNativeReceiptRecovered!==false || r.historicalFullSourceContentUnchanged!==false : r.schema!=="ae-agent-generated-export-recovery.v1" || !/^(completed|failed)$/.test(r.terminal)) || r.originalRequestId!==id || r.originalAction!==original.action || r.runId!==original.runId ||
      r.replayAllowed!==false || r.artisticAccepted!==false ||
      side.panelIdentityHash!==sha256(original.signature) || !p ||
      ["actionId","proposalRevision","payloadHash","planSha256","projectId"].some(function(k) {return p[k]!==r[k];}) ||
      !r.originalBinding || r.originalBinding.panelInstanceId!==original.panelInstanceId || r.originalBinding.panelLifecycleEpoch!==original.epoch || r.originalBinding.panelGeneration!==original.generation) return false;
    // Restart needs trusted server lookup again, never client assertions or idle auto-heal.
    return !confirmed || validatedRecoveries[id]===value.sha256;
  }
  function adoptRecovery(value,runId) {
    var r=value && (value.schema==="ae-agent-common-title-assembly-recovery.v1.envelope" ? value.value : value.receipt),id=r && r.originalRequestId,original=id && records[id];
    if(storageFailure || !original || original.runId!==runId || r.runId!==runId) return false;
    var previous=recoveries[id];
    if(previous && previous.envelope.sha256!==value.sha256)return false;
    recoveries[id]={envelope:clone(value),panelIdentityHash:sha256(original.signature)};
    if(!recoveryValid(id,false)){if(previous)recoveries[id]=previous;else delete recoveries[id];return false;}
    if(!persist())return false;
    validatedRecoveries[id]=value.sha256;
    return true;
  }
  function persist() {
    if (storageFailure) return false;
    try {
      if (!storage || typeof storage.setItem !== "function") throw new Error("Storage is unavailable");
      storage.setItem(INITIALIZED_KEY,"1");
      storage.setItem(STORAGE_KEY, JSON.stringify({version:1,records:records,tombstones:tombstones,recoveries:recoveries}));
      var index={};
      Object.keys(records).forEach(function(id) {index[id]={action:records[id].action,signature:records[id].signature};});
      Object.keys(tombstones).forEach(function(id) {index[id]={action:tombstones[id].action,signature:tombstones[id].signature};});
      Object.keys(recoveries).forEach(function(id) {if(!index[id])throw new Error("Unbound recovery");index[id].recoverySha256=recoveries[id].envelope.sha256;});
      storage.setItem(INDEX_KEY,JSON.stringify(index));
      return true;
    } catch (_) { storageFailure = "receipt_persistence_failed"; return false; }
  }
  function prune() {
    var done = Object.keys(records).filter(function (key) {return terminal(records[key]);});
    done.sort(function (a,b) {return (records[a].completedAt || "").localeCompare(records[b].completedAt || "");});
    while (done.length > MAX_TERMINAL && Object.keys(tombstones).length < MAX_TOMBSTONES) {
      var id=done.shift(), record=records[id];
      tombstones[id] = {action:record.action,signature:record.signature,state:record.state};
      delete records[id];
    }
  }
  function load() {
    try {
      if (!storage || typeof storage.getItem !== "function") throw new Error("No storage");
      var raw=storage.getItem(STORAGE_KEY);
      if (!raw) {if(storage.getItem(INITIALIZED_KEY)) throw new Error("Missing initialized receipt store");persist();return;}
      var parsed=JSON.parse(raw);
      if (!parsed || parsed.version !== 1 || !parsed.records || !parsed.tombstones ||
          Array.isArray(parsed.records) || Array.isArray(parsed.tombstones)) throw new Error("Invalid store");
      Object.keys(parsed.records).forEach(function(id) {
        var r=parsed.records[id];
        if (!contract.UUID_REGEX.test(id) || !r || r.requestId !== id || !(contract.getActionDefinition(r.action) || r.action === "unknown" && r.state === "rejected") ||
            !/^(accepted|running|completed|error|rejected|unknown)$/.test(r.state) || typeof r.signature !== "string") throw new Error("Invalid receipt");
        records[id]=contract.redactState(r); records[id].signature=r.signature; records[id].replayAllowed=false;
        if (/^(accepted|running)$/.test(r.state) && !(r.action === "panel.reload" && r.phase === "reload_submitted")) {
          records[id].state="unknown"; records[id].phase="lifecycle_interrupted"; records[id].code="lifecycle_interrupted";
        }
        if(r.action === "agent.hardcore" && /^(completed|error|unknown)$/.test(records[id].state)) normalizeHardcoreReceipt(records[id]);
      });
      Object.keys(parsed.tombstones).forEach(function(id) {
        var t=parsed.tombstones[id];
        if (!contract.UUID_REGEX.test(id) || !t || !(contract.getActionDefinition(t.action) || t.action === "unknown") || typeof t.signature !== "string" || !terminal(t)) throw new Error("Invalid tombstone");
        tombstones[id]=t;
      });
      if(parsed.recoveries && (typeof parsed.recoveries!=="object" || Array.isArray(parsed.recoveries)))throw new Error("Invalid recoveries");
      Object.keys(parsed.recoveries || {}).forEach(function(id) {recoveries[id]=parsed.recoveries[id];if(!recoveryValid(id,false))throw new Error("Invalid recovery binding");});
      var indexRaw=storage.getItem(INDEX_KEY);
      if(!indexRaw) throw new Error("Missing receipt index");
      var index=JSON.parse(indexRaw);
      if(!index || typeof index !== "object" || Array.isArray(index) || Object.keys(index).length > MAX_RECEIPTS+MAX_TOMBSTONES) throw new Error("Invalid receipt index");
      Object.keys(index).forEach(function(id) {
        var entry=index[id],record=records[id] || tombstones[id];
        if(!contract.UUID_REGEX.test(id) || !entry || typeof entry.signature !== "string" ||
           !(contract.getActionDefinition(entry.action) || entry.action === "unknown")) throw new Error("Invalid indexed identity");
        if(!record) records[id]={protocolVersion:contract.PROTOCOL_VERSION,requestId:id,action:entry.action,signature:entry.signature,
          state:"unknown",phase:"receipt_missing",code:"receipt_record_missing",delivery:"unknown",replayAllowed:false};
        else if(record.action !== entry.action || record.signature !== entry.signature) throw new Error("Indexed receipt mismatch");
        if(entry.recoverySha256!==undefined && (!recoveries[id] || recoveries[id].envelope.sha256!==entry.recoverySha256) || recoveries[id] && recoveries[id].envelope.sha256!==entry.recoverySha256)throw new Error("Recovery index mismatch");
      });
      Object.keys(records).concat(Object.keys(tombstones)).forEach(function(id) {if(!index[id]) throw new Error("Unindexed receipt");});
      if (Object.keys(records).length > MAX_RECEIPTS || Object.keys(tombstones).length > MAX_TOMBSTONES) throw new Error("Oversize store");
    } catch (_) { storageFailure="receipt_store_corrupt_or_unavailable"; }
  }
  function receipt(envelope, status, code, message) {
    var current=life(), actionName=dataField(envelope,"action"),def=typeof actionName === "string" ? contract.getActionDefinition(actionName) : null;
    return {protocolVersion:contract.PROTOCOL_VERSION,requestId:dataField(envelope,"requestId") || null,
      action:def ? def.name : "unknown",state:status,phase:status === "rejected" ? "admission" : "accepted",
      acceptedAt:new Date().toISOString(),panelInstanceId:instanceId,epoch:current.epoch,generation:String(current.generation),
      code:code || undefined,message:message || undefined,effect:def ? def.effect : "unknown",delivery:"not_submitted",replayAllowed:false};
  }
  function reject(envelope,code,message) {
    var r=receipt(envelope,"rejected",code,message); r.completedAt=new Date().toISOString(); return contract.sanitizeReceipt(r);
  }
  function rejectNew(envelope,code,message,valid) {
    var r=receipt(envelope,"rejected",code,message);r.completedAt=new Date().toISOString();
    var id=dataField(envelope,"requestId");
    if(typeof id === "string" && contract.UUID_REGEX.test(id) && !records[id] && !tombstones[id] &&
       Object.keys(records).length < MAX_RECEIPTS && !storageFailure) {
      r.signature=valid ? signature(envelope) : sha256("invalid-envelope");records[id]=r;
      if(!persist()) {r.code=storageFailure;r.message="Rejection could not be persisted; no handler was started.";}
    }
    return contract.sanitizeReceipt(r);
  }
  function getResult(id) {
    if (typeof id !== "string" || !contract.UUID_REGEX.test(id)) return null;
    if (records[id]) {var result=contract.sanitizeReceipt(records[id]);if(recoveryValid(id,true))result.recovery=clone(recoveries[id].envelope);if(humanSettlementValid(id,true))result.humanSettlement=clone(humanSettlement);return result;}
    if (tombstones[id]) return reject({requestId:id,action:tombstones[id].action},"receipt_retained_without_detail","Request was completed earlier. Re-execution is forbidden.");
    return storageFailure ? {protocolVersion:contract.PROTOCOL_VERSION,requestId:id,state:"unknown",phase:"receipt_storage",code:storageFailure,delivery:"unknown",replayAllowed:false} : null;
  }
  function passive(name,args) {
    var value=bindings && bindings.passive[name];
    return typeof value === "function" ? value(args) : !!value;
  }
  function eligibility(name,args) {
    if (!bound || !bindings.handlers[name]) return {available:false,reasonCodes:["handler_unavailable"]};
    if (storageFailure) return {available:false,reasonCodes:[storageFailure]};
    if(humanLookupPending && !passiveRead(name))return {available:false,reasonCodes:["human_settlement_lookup_pending"]};
    if(fixtureLookupPending && !passiveRead(name))return {available:false,reasonCodes:["fixture_disposition_lookup_pending"]};
    if(nativeAbandonmentLookupPending && !passiveRead(name))return {available:false,reasonCodes:["native_fixture_abandonment_lookup_pending"]};
    var unresolved=unresolvedEffects();
    if(unresolved.length && !passiveRead(name) && name !== "connector.emergencyDisable" && name !== "plan.reconcile") {
      return {available:false,reasonCodes:["reconciliation_required","unresolved_effect"]};
    }
    if(unresolved.length && name === "plan.reconcile" && args &&
       !unresolved.some(function(row) {return row.runId && row.runId === args.runId;})) {
      return {available:false,reasonCodes:["reconciliation_identity_required"]};
    }
    if (active && !passive(name,args)) return {available:false,reasonCodes:["action_in_flight"]};
    var result=bindings.availability(name,args) || {available:true,reasonCodes:[]};
    return {available:result.available !== false,reasonCodes:result.reasonCodes || []};
  }
  function catalog() {
    return contract.ACTION_CATALOG.map(function(def) {
      var item=clone(def); delete item.writeOnly; item.availability=eligibility(def.name);
      if (def.name === "plan.run") item.supportedPlanEffects=["typed_tools","raw_jsx","save","project_lifecycle"];
      return item;
    });
  }
  function invoke(envelope, source) {
    var checked=contract.validateEnvelope(envelope);
    // A malformed replay never overwrites a previous receipt.
    var suppliedId=dataField(envelope,"requestId");
    var id=typeof suppliedId === "string" && contract.UUID_REGEX.test(suppliedId) ? suppliedId : null;
    var prior=id && (records[id] || tombstones[id]);
    if (prior) {
      if (!checked.ok || prior.action !== envelope.action || prior.signature !== signature(envelope)) return reject(envelope,"duplicate_request_id_conflict","Request ID belongs to another action or arguments.");
      return getResult(id);
    }
    if (!checked.ok) return rejectNew(envelope,checked.code,checked.error,false);
    if (storageFailure) return reject(envelope,storageFailure,"Receipt storage cannot guarantee delivery; reconcile existing request IDs.");
    prune();
    if (Object.keys(records).length >= MAX_RECEIPTS || Object.keys(tombstones).length >= MAX_TOMBSTONES) return reject(envelope,"receipt_store_capacity_exceeded","Retention is full; unresolved requests cannot be discarded.");
    var current=life(), expected=envelope.expectedState;
    if (expected && (expected.panelInstanceId !== undefined && expected.panelInstanceId !== instanceId ||
        expected.panelLifecycleEpoch !== undefined && expected.panelLifecycleEpoch !== current.epoch ||
        expected.panelGeneration !== undefined && expected.panelGeneration !== String(current.generation))) return rejectNew(envelope,"expected_state_mismatch","Panel lifecycle changed.",true);
    var available=eligibility(envelope.action,envelope.args);
    if (!available.available) return rejectNew(envelope,available.reasonCodes[0] || "action_unavailable",
      available.reasonCodes[0] === "reconciliation_required" ? "An earlier effect has an unknown outcome. Read state().unresolvedActions and obtain terminal evidence for the exact request/run identity; do not resubmit under a new request ID." : "Action is unavailable.",true);
    var r=receipt(envelope,"accepted"), key=envelope.requestId, isPassive=passive(envelope.action,envelope.args);
    r.signature=signature(envelope); r.source=source === "ui" ? "ui" : "programmatic"; records[key]=r;
    // Durable admission before any handler effect. Arguments and credentials are never stored.
    if (!persist()) {delete records[key];return reject(envelope,storageFailure,"Admission was not persisted; handler was not started.");}
    if (!isPassive) active={requestId:key,action:envelope.action};
    r.state="running"; r.phase="handler";
    var finished=false, startEpoch=current.epoch, startGeneration=String(current.generation);
    function done(error,result) {
      if (finished) return;
      finished=true;
      var now=life();
      if (checked.actionDef.effect !== "panel_lifecycle" && (now.epoch !== startEpoch || String(now.generation) !== startGeneration)) {
        error={isUnknown:true,code:"lifecycle_interrupted",phase:"lifecycle_interrupted",message:"Panel changed before completion.",result:result};
      }
      if(error && r.delivery === "submitted" && !passiveRead(r.action) && r.action !== "plan.reconcile" && error.status === 0) {
        error.isUnknown=true;error.rejected=false;
      }
      r.state=error ? error.rejected ? "rejected" : error.isUnknown ? "unknown" : "error" : "completed";
      r.phase=error && error.phase || (error ? error.isUnknown ? "delivery_unknown" : error.rejected ? "gate" : "handler" : "completed");
      r.code=error && (error.code || error.diagnostic && error.diagnostic.code || "handler_error") || undefined;
      r.message=contract.redactState({value:error && error.message}).value;
      r.result=contract.redactState(result || error && (error.result || error.body) || {});
      if (error && error.diagnostic) r.diagnostic=contract.redactState(error.diagnostic);
      if (error && error.status !== undefined) r.httpStatus=error.status;
      if(r.action === "agent.hardcore") normalizeHardcoreReceipt(r);
      var run=r.result && (r.result.run || (r.result.id && r.result.outcome ? r.result : null));
      if (run) {r.runId=run.id;r.outcome=run.outcome;}
      if(run && run.outcome && (run.outcome.execution && run.outcome.execution.status === "unknown" ||
          run.outcome.mutation && run.outcome.mutation.status === "unknown")) {
        r.state="unknown";r.phase="outcome_unresolved";r.delivery="unknown";
        if(!r.code) r.code="run_outcome_unknown";
      }
      // Only the current handler's known terminal completion releases its active lock.
      // Unknown effects remain in the durable ledger and block *new* request IDs too.
      if (active && active.requestId === key) active=null;
      r.delivery=error && error.isUnknown ? "unknown" : r.delivery;
      r.completedAt=new Date().toISOString(); r.postState=state();
      if (!persist()) {r.state="unknown";r.phase="receipt_storage";r.code=storageFailure;r.delivery="unknown";}
    }
    var context={
      source:r.source,
      completeRecoveryTransportPrerequisite:function(result,continuation) {
        var now=life(),value=result && result.transportPrerequisite,id=value && value.originalRequestId,original=id && records[id],p=original && original.result && original.result.run && original.result.run.provenance;
        if(finished || storageFailure || envelope.action!=="plan.reconcile" || now.epoch!==startEpoch || String(now.generation)!==startGeneration || !value ||
          (value.schema!=="ae-agent-generated-export-transport-prerequisite.v1" && !(value.schema==="ae-agent-common-title-transport-prerequisite.v1" && value.profile==="common-title-assembly")) || result.status!=="transport_prerequisite" || value.runId!==envelope.args.runId || !original || original.action!=="plan.run" || original.state!=="unknown" || original.runId!==value.runId ||
          !p || ["actionId","proposalRevision","payloadHash","planSha256","projectId"].some(function(k){return p[k]!==value[k];}) ||
          !value.currentBinding || value.currentBinding.panelInstanceId!==instanceId || value.currentBinding.panelLifecycleEpoch!==startEpoch || value.currentBinding.panelGeneration!==startGeneration ||
          !value.nextBinding || value.nextBinding.panelInstanceId!==instanceId || value.nextBinding.panelLifecycleEpoch!==startEpoch+1 || value.nextBinding.panelGeneration!=="recovery-"+value.scopeId ||
          !contract.UUID_REGEX.test(value.scopeId || "") || !isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt)<=Date.now() || value.freshReconcileRequired!==true || value.admissionGuardReleased!==false || value.replayAllowed!==false || typeof continuation!=="function")return false;
        done(null,{reconciliation:result,runId:value.runId,admissionGuardReleased:false,freshReconcileRequired:true});
        now=life();
        if(storageFailure || r.state!=="completed" || now.epoch!==startEpoch || String(now.generation)!==startGeneration)return false;
        continuation(clone(value));
        return true;
      },
      originalGeneratedExportRequest:function(runId) {
        if(envelope.action!=="plan.reconcile" || runId!==envelope.args.runId)return null;
        var ids=Object.keys(records).filter(function(id) {return records[id].action==="plan.run" && records[id].state==="unknown" && records[id].runId===runId;});
        return ids.length===1 ? ids[0] : null;
      },
      adoptGeneratedExportRecovery:function(value,runId) {
        var now=life();
        if(envelope.action!=="plan.reconcile" || runId!==envelope.args.runId || finished || now.epoch!==startEpoch || String(now.generation)!==startGeneration || value && value.schema!=="ae-agent-generated-export-recovery-envelope.v1")return false;
        return adoptRecovery(value,runId);
      },
      adoptCommonTitleAssemblyRecovery:function(value,runId) {
        var now=life();
        if(envelope.action!=="plan.reconcile" || runId!==envelope.args.runId || finished || now.epoch!==startEpoch || String(now.generation)!==startGeneration || value && value.schema!=="ae-agent-common-title-assembly-recovery.v1.envelope")return false;
        return adoptRecovery(value,runId);
      },
      submit:function() {
        r.delivery="submitted";r.phase="submitted";
        if (!persist()) {done({isUnknown:true,code:storageFailure,phase:"receipt_storage",message:"Submission receipt could not be persisted."});return false;}
        return true;
      },
      checkpoint:function(result) {
        r.phase="reload_submitted";r.delivery="submitted";r.result=contract.redactState(result);
        if (!persist()) {done({isUnknown:true,code:storageFailure,phase:"receipt_storage"});return false;}
        return true;
      },
      isCurrent:function() {var now=life();return now.epoch === startEpoch && String(now.generation) === startGeneration;}
    };
    var args=clone(envelope.args);
    (checked.actionDef.writeOnly || []).forEach(function(field) {contract.rememberSecret(args[field]);});
    try {bindings.handlers[envelope.action](args,done,context);} catch(error) {done(error);}
    return contract.sanitizeReceipt(r);
  }
  load();
  var api={protocolVersion:contract.PROTOCOL_VERSION,catalog:catalog,state:state,
    invoke:function(envelope) {return invoke(envelope,"programmatic");},getResult:getResult};
  Object.defineProperty(api,"readAmeFixtureUIGuard",{value:readAmeFixtureUIGuard,writable:false,configurable:false,enumerable:false});
  Object.defineProperty(api,"readNativeFixtureGuard",{value:readNativeFixtureGuard,writable:false,configurable:false,enumerable:false});
  Object.defineProperty(api,"refreshNativeFixtureAbandonments",{value:function(){if(arguments.length)return {accepted:false,code:"fixture_abandonment_client_evidence_forbidden"};if(nativeAbandonmentLookupPending)return {accepted:false,code:"native_fixture_abandonment_lookup_pending"};refreshNativeFixtureAbandonments();return {accepted:nativeAbandonmentLookupPending,lookupPending:nativeAbandonmentLookupPending};},writable:false,configurable:false,enumerable:false});
  Object.defineProperty(api,"refreshAmeFixtureDisposition",{value:function() {
    if(arguments.length)return {accepted:false,code:"fixture_disposition_refresh_arguments_invalid"};
    if(!records[FIXTURE_ID])return {accepted:false,code:"fixture_disposition_guard_missing"};
    if(fixtureLookupPending)return {accepted:false,code:"fixture_disposition_lookup_pending"};
    refreshAmeFixtureDisposition();
    return {accepted:fixtureLookupPending,lookupPending:fixtureLookupPending};
  },writable:false,configurable:false,enumerable:false});
  Object.freeze(api);
  return {api:api,bind:function(value) {
    if (bound) throw new Error("Panel actions are already bound");
    bindings=value;bound=true;
    Object.keys(records).forEach(function(id) {
      var r=records[id];
      if (r.action === "panel.reload" && r.phase === "reload_submitted" && /^(accepted|running)$/.test(r.state)) {
        var verified=r.result && r.result.assetVersion === rawState().assetVersion && JSON.stringify(r.result.preferences) === JSON.stringify(rawState().preferences);
        r.state=verified ? "completed" : "unknown";r.phase=verified ? "reload_verified" : "reload_unverified";
        r.code=verified ? undefined : "reload_postcondition_mismatch";r.completedAt=new Date().toISOString();r.postState=state();
      }
    });
    persist();
    return Object.freeze({invokeUI:function(envelope) {return invoke(envelope,"ui");},refreshHumanSettlements:refreshHumanSettlements,refreshAmeFixtureDisposition:refreshAmeFixtureDisposition,refreshNativeFixtureAbandonments:refreshNativeFixtureAbandonments});
  }};
});
