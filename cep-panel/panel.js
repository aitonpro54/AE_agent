"use strict";

(function () {
  var hostStartupGuard=window.AEAgentHostStartupGuard;
  if(!hostStartupGuard || !hostStartupGuard.isAllowed())return;
  var APP_NAME = "AE Agent Core";

  var APP_VERSION = "3.3.5";

  var M100_PROTOCOL_VERSION = "m100.v1";

  var M100_BACKEND_SOURCE = "ae-agent-bridge";

  var M100_RISK_POLICY_VERSION = "m100-risk-v1";

  var M100_RISK_LEVELS = {
    read_only: true,
    mutating: true,
    destructive: true,
    raw_jsx: true
  };

  var cs = new CSInterface();

  var titleEl = document.getElementById("appTitle");

  var versionEl = document.getElementById("appVersion");

  var statusEl = document.getElementById("status");

  var badgeEl = document.getElementById("badge");

  var logEl = document.getElementById("log");

  var urlEl = document.getElementById("bridgeUrl");

  var tokenEl = document.getElementById("bridgeToken");

  var bridgeHelpEl = document.getElementById("bridgeHelp");

  var connectButton = document.getElementById("connectButton");

  var disconnectButton = document.getElementById("disconnectButton");

  var reloadButton = document.getElementById("reloadButton");

  var autonomousSessionButton = document.getElementById("autonomousSessionButton");

  var autonomousSessionStatusEl = document.getElementById("autonomousSessionStatus");

  var planRunStatusEl = document.getElementById("planRunStatus");

  var dryRunPlanButton = document.getElementById("dryRunPlanButton");

  var runPlanButton = document.getElementById("runPlanButton");

  var reconcilePlanRunButton = document.getElementById("reconcilePlanRunButton");

  var configuredBridgeUrl=null;

  var configuredPanelToken=null;

  var panelLifecycleGuard=false;

  var running = false;

  var pollTimer = null;

  var pollInFlight = false;

  var initialAutomaticStartup = null;

  var initialAutomaticConnectDispatch = null;

  var connectionStartupDiagnostics = {automaticAttempts:0,explicitAttempts:0,lastOrigin:null,lastConnectionOrigin:null};

  var activeEvalScriptCommandId = "";

  var physicalEvalScriptKey = "codexAePhysicalEvalScript.v1";

  var bootstrapDeliveryFenceKey="codexAeBootstrapDeliveryFence.v1";

  var resetPreflightInFlight = false;

  var resetPreflightAttempt = null;

  var resetPreflightRetry = null;

  var productResetActivation = null;
  var coreMigrationActivation = null;

  function acceptCoreMigrationActivation(activation) {
    if(!activation || activation.schema!=="ae-agent.core-product-migration-session.v1.activation" || activation.origin!=="core_product_migration" || !activation.actor || activation.actor.panelGeneration!=="core-"+activation.generation || !activation.disposition || activation.disposition.scope!=="origin_provenance_only" || activation.disposition.oldCommandsReplayAllowed!==false || activation.disposition.oldExitProven!==false || !physicalEvalScriptIdle())return {accepted:false};
    var current=deliveryActor(),a=activation.actor;
    if(current.panelConnectionId!==a.panelConnectionId || current.panelInstanceId!==a.panelInstanceId)return {accepted:false};
    if(sameDeliveryActor(current,a)){
      var next;try{next=nextPanelConnectionGeneration();}catch(_){return {accepted:false};}
      panelConnectionGeneration=next;panelLifecycleEpoch+=1;
      try{rotateBootstrapDeliveryFence();}catch(_){return {accepted:false};}
      ownedCompletedDryRunCache=null;lastAcceptedDryRun=null;ownedPlanPreparationMode="";currentBridgePlan=null;autonomousSessionState=null;renderAutonomousSession();coreMigrationActivation=activation;
      pollInFlight=false;running=true;setBridgeConnected();if(pollTimer)clearTimeout(pollTimer);pollTimer=setTimeout(poll,50);return {accepted:true,transitioned:true};
    }
    if(!/^[1-9]\d*$/.test(current.panelGeneration) || current.panelLifecycleEpoch!==a.panelLifecycleEpoch+1)return {accepted:false};
    coreMigrationActivation=activation;return {accepted:true,transitioned:false};
  }

  function beginCoreMigrationSession(challenge) {
    var state=window.AEAgentPanelActions && window.AEAgentPanelActions.state();
    if(resetPreflightInFlight || !challenge || challenge.schema!=="ae-agent.core-product-migration-session.v1.challenge" || challenge.origin!=="core_product_migration" || !sameDeliveryActor(challenge.actor,deliveryActor()) || !physicalEvalScriptIdle() || !state || state.actionStorage!=="ready" || state.recoveryTransport){setStatus("Core preflight: physical/controller fence closed",false);return;}
    if(challenge.lossControlCoverage && !window.AEAgentPanelActions.ownedLossControlCovered(challenge.lossControlCoverage,true)){setStatus("Core preflight: exact loss control coverage changed",false);return;}
    if(state.journalNamespace!=="ae-agent-core.v1" || (state.unresolvedActions||[]).length!==0 && !((state.unresolvedActions||[]).length===1 && window.AEAgentPanelActions.ownedLossControlCovered(challenge.lossControlCoverage,true) && state.unresolvedActions[0].requestId===challenge.lossControlCoverage.subject.requestId && state.unresolvedActions[0].entrySha256===challenge.lossControlCoverage.subject.entrySha256)){setStatus("Core preflight: shared or own effect unresolved",false);return;}
    if(state.activeAction || state.nativeBusy || state.trustedGuardRefresh && state.trustedGuardRefresh.pending || panelActionBusy()){
      var waitingActor=deliveryActor();setTimeout(function(){if(sameDeliveryActor(waitingActor,deliveryActor()))beginCoreMigrationSession(challenge);},500);return;
    }
    if(!(Date.parse(challenge.expiresAt)>Date.now())){request("GET","/bridge/product-session?"+bridgeNextPath("",true).split("?")[1],null,function(error,response){if(!error && response && response.coreMigrationSession)beginCoreMigrationSession(response.coreMigrationSession);});return;}
    var previous=deliveryActor(),url=getBaseUrl(),token=getToken(),attempt={challenge:challenge.challenge};resetPreflightAttempt=attempt;resetPreflightInFlight=true;running=false;pollInFlight=false;if(pollTimer)clearTimeout(pollTimer);
    var panelControl={journalNamespace:"ae-agent-core.v1",nativeControlIdle:true,activeAction:null,recoveryTransport:null,actionStorage:"ready",unresolvedActions:challenge.lossControlCoverage?[window.AEAgentPanelActions.ownedLossControlProjection(challenge.lossControlCoverage)]:state.unresolvedActions || []};
    panelLifecycleEpoch+=1;panelConnectionGeneration="core-"+challenge.generation;
    function finish(){if(resetPreflightAttempt===attempt){resetPreflightInFlight=false;resetPreflightAttempt=null;}}
    try{rotateBootstrapDeliveryFence();}catch(_){finish();setStatus("Core preflight: delivery fence unavailable",false);return;}
    var current=deliveryActor(),script='(function(){var p=app.project;if(!p)return JSON.stringify({projectPresent:false});return JSON.stringify({projectPresent:true,file:p.file?String(p.file.fsName):"",dirty:p.dirty,revision:p.revision,rendering:p.renderQueue.rendering,challenge:'+JSON.stringify(challenge.challenge)+'});}())';
    physicalEvalScript(script,function(result){if(!sameDeliveryActor(current,deliveryActor()) || getBaseUrl()!==url || getToken()!==token){finish();return;}var project;try{project=JSON.parse(result);}catch(_){finish();setStatus("Core preflight: project read UNKNOWN",false);return;}if(!physicalEvalScriptIdle()){finish();return;}
      request("POST","/bridge/core-migration-session",{generation:challenge.generation,challenge:challenge.challenge,previousActor:previous,actor:current,physicalInflight:0,panelControl:panelControl,project:project},function(error,response){finish();if(!sameDeliveryActor(current,deliveryActor()) || getBaseUrl()!==url || getToken()!==token)return;if(error || !response || response.status!=="core_migration_active" || !acceptCoreMigrationActivation(response.activation).accepted)setStatus("Core activation refused; read status",false);});
    });
  }

  function observeCoreMigrationResponse(response) {
    if(response && response.coreMigrationSession){beginCoreMigrationSession(response.coreMigrationSession);return true;}
    if(response && response.coreMigrationSessionActivation){var adopted=acceptCoreMigrationActivation(response.coreMigrationSessionActivation);if(!adopted.accepted){setStatus("Core activation actor mismatch",false);return true;}return !!adopted.transitioned;}
    return false;
  }

  function physicalEvalScriptIdle() {
    try { var pending=JSON.parse(localStorage.getItem(physicalEvalScriptKey) || "{}");return pending && typeof pending==="object" && !Object.keys(pending).length; } catch (_) { return false; }
  }

  function physicalEvalScript(script, callback) {
    if(!physicalEvalScriptIdle()){callback("EvalScript error. physical_evalscript_pending");return;}
    try{var fence=JSON.parse(localStorage.getItem(bootstrapDeliveryFenceKey)||"null"),actual=deliveryActor();if(fence&&(!fence.actor||!sameDeliveryActor(fence.actor,actual)&&!(actual.panelConnectionId===fence.actor.panelConnectionId&&/^[1-9]\d*$/.test(actual.panelGeneration)&&Number(actual.panelGeneration)>Math.max(Number(fence.actor.panelGeneration)||0,fence.numericFloor||0)))){callback("EvalScript error. delivery_epoch_revoked");return;}}catch(_){callback("EvalScript error. delivery_epoch_fence_unreadable");return;}
    var id=String(Date.now())+"-"+String(Math.random()).slice(2),pending={};pending[id]={submittedAt:Date.now()};
    try{localStorage.setItem(physicalEvalScriptKey,JSON.stringify(pending));}catch(_){callback("EvalScript error. physical_evalscript_latch_unavailable");return;}
    cs.evalScript(script,function(result){
      try{var current=JSON.parse(localStorage.getItem(physicalEvalScriptKey)||"{}");if(current[id]){delete current[id];localStorage.setItem(physicalEvalScriptKey,JSON.stringify(current));}}catch(_){return;}
      callback(result);
    });
  }

  function nextPanelConnectionGeneration(){
    var fence=JSON.parse(localStorage.getItem(bootstrapDeliveryFenceKey)||"null"),floor=fence?Math.max(Number(fence.actor&&fence.actor.panelGeneration)||0,fence.numericFloor||0):0,next=Math.max(Date.now(),Number(panelConnectionGeneration)||0,floor)+1;
    if(!Number.isSafeInteger(next)||next<=0||fence&&!fence.actor)throw new Error("delivery_epoch_fence_unreadable");return next;
  }

  function writeBootstrapDeliveryFence(actor){var prior=JSON.parse(localStorage.getItem(bootstrapDeliveryFenceKey)||"null");if(prior&&!prior.actor)throw new Error("delivery_epoch_fence_unreadable");localStorage.setItem(bootstrapDeliveryFenceKey,JSON.stringify({actor:actor,numericFloor:Math.max(Number(actor.panelGeneration)||0,prior?Math.max(Number(prior.actor.panelGeneration)||0,prior.numericFloor||0):0)}));}

  function rotateBootstrapDeliveryFence(){
    // Existing valid lifecycle transitions must carry the logical revocation
    // forward. They still never clear or replace physical native latch rows.
    if(localStorage.getItem(bootstrapDeliveryFenceKey)!==null)writeBootstrapDeliveryFence(deliveryActor());
  }

  function deliveryActor() {
    var state=window.AEAgentPanelActions && window.AEAgentPanelActions.state();
    return {panelConnectionId:panelConnectionId,panelGeneration:String(panelConnectionGeneration),panelInstanceId:state && state.panelInstanceId || "",panelLifecycleEpoch:panelLifecycleEpoch};
  }

  function sameDeliveryActor(a,b) {return a.panelConnectionId===b.panelConnectionId && a.panelGeneration===b.panelGeneration && a.panelInstanceId===b.panelInstanceId && a.panelLifecycleEpoch===b.panelLifecycleEpoch;}

  function acceptProductSessionResetActivation(activation) {
    if(!activation || activation.schema!=="ae-agent.product-session-reset.v1.activation" || !/^[a-f0-9-]{36}$/.test(activation.generation) || !activation.actor || activation.actor.panelGeneration!=="reset-"+activation.generation || !activation.disposition || activation.disposition.replayAllowed!==false)return {accepted:false,transitioned:false};
    var actor=deliveryActor(),resetActor=/^reset-/.test(actor.panelGeneration);
    if(!resetActor) {
      // Bootstrap 0 can adopt metadata only. The caller must run the ordinary
      // connect path before any poll obtains a positive numeric generation.
      if(panelConnectionGeneration===0 && actor.panelLifecycleEpoch===0 && running===false && physicalEvalScriptIdle()){productResetActivation=activation;return {accepted:true,transitioned:false,preconnect:true};}
      if(!/^[1-9]\d*$/.test(actor.panelGeneration) || !Number.isSafeInteger(Number(actor.panelGeneration)))return {accepted:false,transitioned:false};
      // A fresh ordinary connection may observe historical activation. It
      // adopts the exact receipt without replaying preflight or rotating again.
      productResetActivation=activation;return {accepted:true,transitioned:false};
    }
    if(actor.panelGeneration!=="reset-"+activation.generation || !sameDeliveryActor(actor,activation.actor) || !physicalEvalScriptIdle())return {accepted:false,transitioned:false};
    var ordinaryGeneration;try{ordinaryGeneration=nextPanelConnectionGeneration();}catch(_){return {accepted:false,transitioned:false};}
    if(!Number.isSafeInteger(ordinaryGeneration) || ordinaryGeneration<=0)return {accepted:false,transitioned:false};
    cancelResetPreflightRetry();if(pollTimer)clearTimeout(pollTimer);
    // The immutable signed reset actor remains a fence witness. Normal
    // delivery returns to the numeric reconnect contract in a fresh epoch.
    panelConnectionGeneration=ordinaryGeneration;panelLifecycleEpoch+=1;
    try{rotateBootstrapDeliveryFence();}catch(_){return {accepted:false,transitioned:false};}
    ownedCompletedDryRunCache=null;lastAcceptedDryRun=null;ownedPlanPreparationMode="";currentBridgePlan=null;
    currentPlanSyncInFlight=false;currentPlanSyncActiveReqId=0;currentPlanSyncActiveEpoch=0;
    autonomousSessionState=null;renderAutonomousSession();productResetActivation=activation;
    pollInFlight=false;running=true;setBridgeConnected();pollTimer=setTimeout(poll,50);
    return {accepted:true,transitioned:true};
  }

  function cancelResetPreflightRetry() {
    if(resetPreflightRetry && resetPreflightRetry.timer!==null)clearTimeout(resetPreflightRetry.timer);
    resetPreflightRetry=null;
  }

  function resetPreflightRetryCurrent(retry) {return resetPreflightRetry===retry && sameDeliveryActor(retry.actor,deliveryActor()) && retry.url===getBaseUrl() && retry.token===getToken();}

  function deferProductSessionReset(challenge,refresh) {
    var retry=resetPreflightRetry;
    if(!retry || !resetPreflightRetryCurrent(retry)) {cancelResetPreflightRetry();retry={actor:deliveryActor(),url:getBaseUrl(),token:getToken(),timer:null,refreshing:false};resetPreflightRetry=retry;}
    retry.challenge=challenge;
    if(retry.refreshing || retry.timer!==null)return;
    if(!refresh) {
      retry.timer=setTimeout(function(){retry.timer=null;if(!resetPreflightRetryCurrent(retry)){if(resetPreflightRetry===retry)cancelResetPreflightRetry();return;}beginProductSessionReset(retry.challenge);},500);
      setStatus("Reset preflight waiting for panel control",false);return;
    }
    // The expired preflight has never submitted native work. Renew only its
    // fixed read challenge on the unchanged actor, after the idle checks.
    retry.refreshing=true;
    request("GET","/bridge/product-session?"+bridgeNextPath("",true).split("?")[1],null,function(error,response){
      if(!resetPreflightRetryCurrent(retry)){if(resetPreflightRetry===retry)cancelResetPreflightRetry();return;}
      cancelResetPreflightRetry();
      if(error || !response){setStatus("Reset preflight lookup failed; reconnect",false);return;}
      if(response.resetSession){beginProductSessionReset(response.resetSession);return;}
      if(response.resetSessionActivation){var adoption=acceptProductSessionResetActivation(response.resetSessionActivation);if(!adoption.accepted){setStatus("Reset activation actor mismatch",false);return;}if(adoption.preconnect){connect(null,null,true);return;}if(!adoption.transitioned){running=true;setBridgeConnected();pollTimer=setTimeout(poll,50);}return;}
      setStatus("Reset preflight authority unavailable",false);
    });
  }

  function beginProductSessionReset(challenge) {
    var actionState=window.AEAgentPanelActions && window.AEAgentPanelActions.state();
    if(resetPreflightInFlight || !challenge || challenge.schema!=="ae-agent.product-session-reset.v1.challenge" || !/^[a-f0-9-]{36}$/.test(challenge.generation) || !/^[a-f0-9-]{36}$/.test(challenge.challenge) || !sameDeliveryActor(challenge.actor,deliveryActor()) || !physicalEvalScriptIdle()){
      cancelResetPreflightRetry();setStatus("Reset preflight refused: physical command pending",false);return;
    }
    if(!actionState || actionState.recoveryTransport || actionState.actionStorage!=="ready") {cancelResetPreflightRetry();setStatus("Reset preflight refused: panel control unavailable",false);return;}
    if(actionState.activeAction || actionState.trustedGuardRefresh && actionState.trustedGuardRefresh.pending || panelActionBusy()) {deferProductSessionReset(challenge,false);return;}
    if(!(Date.parse(challenge.expiresAt)>Date.now())){deferProductSessionReset(challenge,true);return;}
    cancelResetPreflightRetry();
    var panelControl={nativeControlIdle:true,activeAction:null,recoveryTransport:null,actionStorage:"ready",oldActionEntries:(actionState.unresolvedActions||[]).map(function(r){return {requestId:r.requestId,entrySha256:r.entrySha256};})};
    var previous=deliveryActor(),url=getBaseUrl(),token=getToken(),attempt={challenge:challenge.challenge};resetPreflightAttempt=attempt;resetPreflightInFlight=true;running=false;pollInFlight=false;
    function finishKnown(message){if(resetPreflightAttempt!==attempt)return;resetPreflightInFlight=false;resetPreflightAttempt=null;if(message)setStatus(message,false);}
    if(pollTimer)clearTimeout(pollTimer);
    panelLifecycleEpoch+=1;panelConnectionGeneration="reset-"+challenge.generation;
    try{rotateBootstrapDeliveryFence();}catch(_){finishKnown("Reset delivery fence unavailable");return;}
    ownedCompletedDryRunCache=null;lastAcceptedDryRun=null;ownedPlanPreparationMode="";currentBridgePlan=null;
    autonomousSessionState=null;renderAutonomousSession();var actor=deliveryActor();
    // This fixed read is also a serialized host barrier. Its callback proves
    // this read completed, never that old external AE/AME effects succeeded.
    var script='(function(){var p=app.project;if(!p)return JSON.stringify({projectPresent:false});return JSON.stringify({projectPresent:true,file:p.file?String(p.file.fsName):"",dirty:p.dirty,revision:p.revision,rendering:p.renderQueue.rendering,challenge:'+JSON.stringify(challenge.challenge)+'});}())';
    physicalEvalScript(script,function(result){
      if(!sameDeliveryActor(actor,deliveryActor()) || getBaseUrl()!==url || getToken()!==token){finishKnown();return;}
      var project;try{project=JSON.parse(result);}catch(_){finishKnown("Reset preflight: read failed; reconnect for a fresh read");return;}
      if(!physicalEvalScriptIdle()){finishKnown("Reset preflight: physical fence unknown");return;}
      request("POST","/bridge/reset-session",{generation:challenge.generation,challenge:challenge.challenge,previousActor:previous,actor:actor,physicalInflight:0,panelControl:panelControl,project:project},function(error,response){
        if(!sameDeliveryActor(actor,deliveryActor()) || getBaseUrl()!==url || getToken()!==token){finishKnown();return;}
        finishKnown();
        if(error || !response || response.status!=="reset_active"){setStatus("Reset preflight refused; read status",false);return;}
        if(!acceptProductSessionResetActivation(response.activation).accepted)setStatus("Reset activation actor mismatch",false);
      });
    });
  }

  var bootstrapRecoveryEpochInFlight=false;

  function bootstrapCoveredLogicalRead(id,cover){return !id||cover.projectReadCommand&&cover.projectReadCommand.id===id||(cover.barriers||[]).some(function(v){return v.pins&&v.pins.id===id;});}

  function beginBootstrapRecoveryEpoch(challenge){
    if(bootstrapRecoveryEpochInFlight||!challenge||challenge.schema!=="ae-agent.bootstrap-recovery-epoch.v1.challenge"||!challenge.origin||!challenge.nextActor||!challenge.coveredBootstrap)return;
    var key="codexAeCoreBootstrapRecoveryEpoch.v1."+challenge.generation,state=window.AEAgentPanelActions&&window.AEAgentPanelActions.state(),entry;
    try{entry=JSON.parse(localStorage.getItem(key)||"null");}catch(_){setStatus("Bootstrap recovery storage is unreadable",false);return;}
    function post(payload){
      bootstrapRecoveryEpochInFlight=true;
      var actor=deliveryActor(),url=getBaseUrl(),token=getToken();
      request("POST","/bridge/bootstrap-recovery-epoch",payload,function(error,response){
        bootstrapRecoveryEpochInFlight=false;
        if(!sameDeliveryActor(actor,deliveryActor())||url!==getBaseUrl()||token!==getToken())return;
        if(!error&&response&&response.bootstrapRecovery){beginBootstrapRecoveryEpoch(response.bootstrapRecovery);return;}
        if(error||!response||response.status!=="bootstrap_recovery_epoch_active"){
          setStatus("Bootstrap recovery ACK unknown; observing exact receipt",false);
          // Passive lookup after a lost HTTP ACK. It neither retries native
          // work nor starts the normal project-file polling read.
          setTimeout(function(){if(!sameDeliveryActor(actor,deliveryActor())||url!==getBaseUrl()||token!==getToken())return;request("GET",bridgeNextPath("",true),null,function(lookupError,observed){if(!sameDeliveryActor(actor,deliveryActor())||url!==getBaseUrl()||token!==getToken())return;if(!lookupError&&observed&&observed.bootstrapRecovery)beginBootstrapRecoveryEpoch(observed.bootstrapRecovery);else if(!lookupError&&observed&&observed.ok===true&&observed.command===null){running=true;pollInFlight=false;pollTimer=setTimeout(poll,50);}});},500);
          return;
        }
        try{var saved=JSON.parse(localStorage.getItem(key));saved.acknowledged=true;localStorage.setItem(key,JSON.stringify(saved));}catch(_){setStatus("Bootstrap recovery ACK storage failed",false);return;}
        running=true;pollInFlight=false;setBridgeConnected();pollTimer=setTimeout(poll,50);
      });
    }
    if(entry){
      var current=deliveryActor(),exactActor=sameDeliveryActor(current,challenge.nextActor),historical=challenge.historicalReceiptOnly===true&&current.panelConnectionId===challenge.origin.actor.panelConnectionId&&/^[1-9]\d*$/.test(current.panelGeneration)&&Number(current.panelGeneration)>Number(challenge.nextActor.panelGeneration);
      if(entry.challenge!==challenge.challenge||entry.originalRawSha256!==challenge.coveredBootstrap.originalRawSha256||!exactActor&&!historical){setStatus("Bootstrap recovery identity mismatch",false);return;}
      // Re-send only the exact completed HTTP receipt. Never native work.
      if(entry.payload&&physicalEvalScriptIdle()){post(entry.payload);return;}
      if(!historical){setStatus("Bootstrap recovery physical outcome remains unknown",false);return;}
    }
    if(challenge.historicalReceiptOnly===true){
      var fresh=deliveryActor();
      if(!physicalEvalScriptIdle()||!bootstrapCoveredLogicalRead(activeEvalScriptCommandId,challenge.coveredBootstrap)||ownedPollingSession||recoveryTransportScope||!state||state.activeAction||state.recoveryTransport||state.actionStorage!=="ready"||(state.unresolvedActions||[]).length||panelActionBusy(challenge.coveredBootstrap)){setStatus("Bootstrap recovery fresh epoch requires idle physical/panel control",false);return;}
      // Persistently revoke old callbacks BEFORE asking for a NEW challenge.
      // This changes logical delivery identity, never the physical latch.
      try{writeBootstrapDeliveryFence(fresh);}catch(_){setStatus("Bootstrap recovery delivery fence unavailable",false);return;}
      post({kind:"request_fresh_epoch",generation:challenge.generation,challenge:challenge.challenge,actor:fresh,deliveryFenceActor:fresh,physicalInflight:0,panelControl:{nativeControlIdle:true,activeAction:null,recoveryTransport:null,actionStorage:"ready",oldActionEntries:[]}});return;
    }
    if(!sameDeliveryActor(deliveryActor(),challenge.origin.actor)||!physicalEvalScriptIdle()||!bootstrapCoveredLogicalRead(activeEvalScriptCommandId,challenge.coveredBootstrap)||ownedPollingSession||recoveryTransportScope||!state||state.activeAction||state.recoveryTransport||state.actionStorage!=="ready"||(state.unresolvedActions||[]).length||state.trustedGuardRefresh&&state.trustedGuardRefresh.pending||panelActionBusy(challenge.coveredBootstrap)){
      setStatus("Bootstrap recovery waits for exact idle physical/panel control",false);return;
    }
    entry={challenge:challenge.challenge,originalRawSha256:challenge.coveredBootstrap.originalRawSha256,payload:null,acknowledged:false,retiredLogicalReadId:activeEvalScriptCommandId||null};
    try{localStorage.setItem(key,JSON.stringify(entry));}catch(_){setStatus("Bootstrap recovery intent storage failed",false);return;}
    var previous=deliveryActor(),url=getBaseUrl(),token=getToken();
    running=false;pollInFlight=false;if(pollTimer)clearTimeout(pollTimer);
    panelConnectionGeneration=challenge.nextActor.panelGeneration;panelLifecycleEpoch=challenge.nextActor.panelLifecycleEpoch;
    try{writeBootstrapDeliveryFence(deliveryActor());}catch(_){setStatus("Bootstrap recovery delivery fence unavailable",false);return;}
    // The exact covered logical read loses its callback authority in this
    // epoch. Its old ID is archived above; physical rows remain untouched.
    activeEvalScriptCommandId="";
    ownedCompletedDryRunCache=null;lastAcceptedDryRun=null;ownedPlanPreparationMode="";currentBridgePlan=null;autonomousSessionState=null;renderAutonomousSession();
    var actor=deliveryActor();bootstrapRecoveryEpochInFlight=true;
    var script='(function(){var p=app.project;if(!p)return JSON.stringify({projectPresent:false});return JSON.stringify({projectPresent:true,file:p.file?String(p.file.fsName):"",dirty:p.dirty,revision:p.revision,rendering:p.renderQueue.rendering,challenge:'+JSON.stringify(challenge.challenge)+'});}())';
    physicalEvalScript(script,function(result){
      bootstrapRecoveryEpochInFlight=false;
      if(!sameDeliveryActor(actor,deliveryActor())||url!==getBaseUrl()||token!==getToken())return;
      var project;try{project=JSON.parse(result);}catch(_){setStatus("Bootstrap recovery native result unknown",false);return;}
      if(!physicalEvalScriptIdle()){setStatus("Bootstrap recovery physical latch remains unknown",false);return;}
      var payload={generation:challenge.generation,challenge:challenge.challenge,previousActor:previous,actor:actor,physicalInflight:0,panelControl:{nativeControlIdle:true,activeAction:null,recoveryTransport:null,actionStorage:"ready",oldActionEntries:[]},project:project};
      entry.payload=payload;try{localStorage.setItem(key,JSON.stringify(entry));}catch(_){setStatus("Bootstrap recovery terminal storage failed",false);return;}
      post(payload);
    });
  }

  var agents = [];

  var planRequestInFlight = false;

  var lastPlanResult = null;

  var currentBridgePlanEl = document.getElementById("currentBridgePlan");

  var currentBridgePlan = null;

  var currentPlanSyncAt = 0;

  var currentPlanSyncInFlight = false;

  var currentPlanSyncSeq = 0;

  var currentPlanSyncActiveReqId = 0;

  var currentPlanSyncActiveEpoch = 0;

  var panelLifecycleEpoch = 0;

  var currentPlanSyncWaiters = [];

  var lastPlanRunResult = null;

  var planReconcileInFlight = false;

  var recoveryTransportScope = null;

  var recoveryTransportConnecting = false;

  var lastAcceptedDryRun = null;

  var ownedPlanPreparationMode = "";

  var ownedCompletedDryRunCache = null;

  var ownedPollingSession = null;

  var ownedPollingClosed = "";

  var planRunInFlightMode = "";

  var lastPollErrorMessage = "";

  var panelConnectionId = loadPanelConnectionId();

  var panelConnectionGeneration = 0;

  var autonomousSessionState = null;

  var placeholderProtectionInFlight = false;

  var panelHeartbeatAt = 0;

  var BRIDGE_OFFLINE_MESSAGE = "Bridge offline. Start the local bridge from Codex, then click Connect.";

  function setAppTitle(version) {
    var normalizedVersion = version || APP_VERSION;
    var title = APP_NAME + " " + normalizedVersion.replace(/^v/i, "");
    document.title = title;
    try {
      if (window.__adobe_cep__ && typeof window.__adobe_cep__.invokeSync === "function") {
        window.__adobe_cep__.invokeSync("setWindowTitle", title);
      }
    } catch (_titleError) {}
    if (titleEl) titleEl.textContent = APP_NAME;
    if (versionEl) versionEl.textContent = normalizedVersion.replace(/^v/i, "");
  }

  function log(message) {
    var at = new Date().toLocaleTimeString();
    logEl.textContent = "[" + at + "] " + message + "\n" + logEl.textContent;
  }

  function setStatus(text, online) {
    statusEl.textContent = text;
    badgeEl.textContent = online ? "online" : "offline";
    badgeEl.className = online ? "online" : "";
  }

  function setBridgeHelp(text, tone) {
    if (!bridgeHelpEl) return;
    bridgeHelpEl.textContent = text || "";
    bridgeHelpEl.className = "bridge-help" + (tone ? " " + tone : "");
  }

  function makeBridgeOfflineError(message) {
    var diagnostic = {
      phase: "bridge_offline",
      code: "bridge_offline",
      message: message || BRIDGE_OFFLINE_MESSAGE
    };
    var error = new Error(formatM100DiagnosticBody({ diagnostic: diagnostic }, diagnostic.message));
    error.status = 0;
    error.bridgeOffline = true;
    error.diagnostic = diagnostic;
    return error;
  }

  function isBridgeOfflineError(error) {
    if (!error) return false;
    if (error.bridgeOffline || error.status === 0) return true;
    return /^(HTTP 0|Network error|Network timeout)/i.test(error.message || "");
  }

  function friendlyErrorMessage(error) {
    if (error && error.status === 401) {
      return "Panel authentication failed. Set a separate AE_BRIDGE_PANEL_TOKEN in the bridge launch configuration, restart the bridge, and enter that value in Panel token. AE_BRIDGE_TOKEN is for MCP only.";
    }
    if (isBridgeOfflineError(error)) return BRIDGE_OFFLINE_MESSAGE;
    return error && error.message ? error.message : "Unknown error";
  }

  function setBridgeOffline(error) {
    var message = friendlyErrorMessage(error);
    setStatus(error && error.status === 401 ? "Panel authentication failed" : "Bridge offline", false);
    setBridgeHelp(message, "warning");
    return message;
  }

  function setBridgeConnected() {
    setStatus("Connected", true);
    setBridgeHelp("Bridge connected.", "online");
  }

  function renderAutonomousSession() {
    if (!autonomousSessionButton || !autonomousSessionStatusEl) return;
    var state = autonomousSessionState || {};
    autonomousSessionButton.setAttribute("aria-pressed", state.desiredEnabled ? "true" : "false");
    autonomousSessionButton.disabled = !running;
    autonomousSessionStatusEl.textContent = state.persistenceError ? "Ошибка сохранения настройки: " + state.persistenceError
      : !autonomousSessionState ? "Состояние недоступно"
      : state.desiredEnabled ? (state.connectionReady ? "Включена до явного выключения" : "Включена · ожидание панели") : "Выключена";
  }

  function refreshAutonomousSession(onDone) {
    if (!running) {autonomousSessionState=null;renderAutonomousSession();if(onDone) onDone({rejected:true,code:"bridge_disconnected"});return;}
    request("GET","/autonomy/session",null,function(error,response) {
      autonomousSessionState=!error && response && response.session || null;renderAutonomousSession();
      if(onDone) onDone(error,response);
    });
  }

  function setAutonomousSessionEnabled(enabled,onDone) {
    if (!running || !panelConnectionGeneration) {if(onDone) onDone({rejected:true,code:"bridge_disconnected"});return;}
    autonomousSessionButton.disabled=true;
    request("POST","/autonomy/session",{enabled:enabled,panelConnectionId:panelConnectionId,panelGeneration:String(panelConnectionGeneration)},function(error,response) {
      autonomousSessionButton.disabled=false;
      if(error) {autonomousSessionState={persistenceError:error.message};renderAutonomousSession();log("Autonomous session failed: "+error.message);if(onDone) onDone(error);return;}
      autonomousSessionState=response && response.session || null;renderAutonomousSession();
      refreshAutonomousSession(function(readError,current) {
        if(!readError && (!autonomousSessionState || autonomousSessionState.desiredEnabled !== enabled)) readError={code:"autonomy_postcondition_failed",message:"Desired autonomous session setting was not confirmed."};
        if(onDone) onDone(readError,current);
      });
    });
  }

  function placeholderProtectionResponse() { placeholderProtectionInFlight = false; }

  function refreshPlaceholderProtection(onDone) {
    if (!running || placeholderProtectionInFlight) {if(onDone) onDone({rejected:true,code:!running?"bridge_disconnected":"placeholder_busy"});return;}
    placeholderProtectionInFlight=true;
    request("GET","/placeholder/protection",null,function(error,response) {
      placeholderProtectionResponse(error,response);if(onDone) onDone(error,response);
    });
  }

  function placeholderProtectionAction(action,args,onDone) {
    if (!running || placeholderProtectionInFlight) {if(onDone) onDone({rejected:true,code:!running?"bridge_disconnected":"placeholder_busy"});return;}
    var body={action:action};
    if(action === "accept") body.useSelectedProperties=args.useSelectedProperties;
    if(action === "map_group") {
      body.groupId=args.groupId.trim();
      if(!body.groupId) {
        if(onDone) onDone({rejected:true,code:"group_required"});return;}
    }
    if(action === "constraints") {body.distinctGroups=args.distinctGroups;body.disallowSourceOverlap=args.disallowSourceOverlap;}
    placeholderProtectionInFlight=true;
    request("POST","/placeholder/protection",body,function(error,response) {
      placeholderProtectionResponse(error,response);
      if(error || !response || response.ok !== true) {if(onDone) onDone(error || {code:response && response.code || "placeholder_rejected",message:response && response.error},response);return;}
      refreshPlaceholderProtection(function(readError,current) {if(onDone) onDone(readError,current);});
    });
  }

  function getBaseUrl() {
    return (configuredBridgeUrl === null ? urlEl.value : configuredBridgeUrl).replace(/\/+$/, "");
  }

  function getToken() {
    return configuredPanelToken === null ? tokenEl.value : configuredPanelToken;
  }

  function makePanelConnectionId() {
    return "panel-" + String(Date.now()) + "-" + String(Math.random()).slice(2);
  }

  function loadPanelConnectionId() {
    var existing = localStorage.getItem("codexAeCorePanelConnectionId.v1") || "";
    if (existing) return existing;
    var created = makePanelConnectionId();
    localStorage.setItem("codexAeCorePanelConnectionId.v1", created);
    return created;
  }

  function bridgeNextPath(projectFile,resetProbe) {
    var actionState = window.AEAgentPanelActions && window.AEAgentPanelActions.state();
    return "/bridge/next?panelConnectionId=" + encodeURIComponent(panelConnectionId)
      + "&panelGeneration=" + encodeURIComponent(String(panelConnectionGeneration || 0))
      + "&panelInstanceId=" + encodeURIComponent(actionState && actionState.panelInstanceId || "")
      + "&panelLifecycleEpoch=" + encodeURIComponent(String(panelLifecycleEpoch))
      + (resetProbe ? "&physicalInflight=" + (physicalEvalScriptIdle() ? "0" : "1") : "")
      + "&projectFile=" + encodeURIComponent(projectFile || "");
  }

  function compactPanelDiagnosticText(value, limit) {
    var text = String(value || "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
    var max = Math.max(1, Number(limit || 1000));
    return text.length > max ? text.slice(0, max - 1) + "..." : text;
  }

  function diagnosticFromBody(body) {
    if (!body || typeof body !== "object") return null;
    if (body.diagnostic && typeof body.diagnostic === "object") return body.diagnostic;
    if (body.run && body.run.diagnostic && typeof body.run.diagnostic === "object") return body.run.diagnostic;
    if (body.m100Message && body.m100Message.error && typeof body.m100Message.error === "object") {
      return body.m100Message.error;
    }
    if (body.run && body.run.m100Message && body.run.m100Message.error && typeof body.run.m100Message.error === "object") {
      return body.run.m100Message.error;
    }
    return null;
  }

  function formatM100DiagnosticBody(body, fallback) {
    var diagnostic = diagnosticFromBody(body);
    if (!diagnostic) return fallback;
    var envelope = body && body.m100Message ? body.m100Message : (body && body.run && body.run.m100Message ? body.run.m100Message : null);
    var phase = compactPanelDiagnosticText(diagnostic.phase || body.phase || "unknown", 80);
    var code = compactPanelDiagnosticText(diagnostic.code || body.code || "", 120);
    var message = compactPanelDiagnosticText(diagnostic.message || body.error || fallback || "Request failed.", 1000);
    var lines = [];
    lines.push("Failure phase: " + phase + (code ? " / " + code : ""));
    if (diagnostic.requestId || body.requestId || envelope && envelope.requestId) lines.push("Request: " + compactPanelDiagnosticText(diagnostic.requestId || body.requestId || envelope.requestId, 120));
    if (diagnostic.actionId || body.actionId || envelope && envelope.actionId) lines.push("Action: " + compactPanelDiagnosticText(diagnostic.actionId || body.actionId || envelope.actionId, 120));
    if (diagnostic.executionId || body.executionId || envelope && envelope.executionId) lines.push("Execution: " + compactPanelDiagnosticText(diagnostic.executionId || body.executionId || envelope.executionId, 120));
    if (diagnostic.commandId || body.commandId) lines.push("Command: " + compactPanelDiagnosticText(diagnostic.commandId || body.commandId, 120));
    lines.push("Detail: " + message);
    if (diagnostic.rawPreview) lines.push("Preview: " + compactPanelDiagnosticText(diagnostic.rawPreview, 500));
    if (diagnostic.logRef) lines.push("Log: " + compactPanelDiagnosticText(diagnostic.logRef, 240));
    return lines.join("\n");
  }

  function isFixedGuardLookup(method, path, body) {
    if (method !== "GET" || body !== null && body !== undefined) return false;
    if (path === "/human-guard-settlement/lookup" || path === "/ame/fixture-ui-disposition/lookup" || path === "/ame/native-fixture-prephase-recovery/lookup" || path === "/ame/native-fixture-admission-refusal/lookup") return true;
    if(path.indexOf("/panel-lifecycle-causal/lookup?")===0)return true;
    var nativeSelector = /^\/ame\/native-fixture-abandonment\/lookup\?requestId=([^&]+)&runId=([^&]+)$/.exec(path);
    return !!nativeSelector && window.AEAgentPanelContract.UUID_REGEX.test(nativeSelector[1]) && window.AEAgentPanelContract.UUID_REGEX.test(nativeSelector[2]);
  }

  var causalRuntimeStamp=null;

  function observeCausalRuntime(xhr,error) {
    var next=null;
    try{if(!error && xhr && typeof xhr.getResponseHeader==="function"){var raw=xhr.getResponseHeader("x-ae-panel-causal-runtime");if(/^[a-f0-9]{64}$/.test(raw || ""))next=raw;}}catch(_){next=null;}
    if(error || !next || next!==causalRuntimeStamp){if(panelActionUI && panelActionUI.invalidateCausalRuntime)panelActionUI.invalidateCausalRuntime();}
    causalRuntimeStamp=next;
  }

  function request(method, path, body, onDone) {
    var startup = initialAutomaticStartup;
    // Only this startup's trusted admission reads own its cancellation. A
    // A separate background health failure must not revoke Connect.
    if (initialAutomaticStartupCurrent(startup) && /^(lookup|connecting|pending)$/.test(startup.state) && isFixedGuardLookup(method,path,body)) {
      var startupDone = onDone;
      onDone = function (error, response) {
        if (error) closeInitialAutomaticStartup(startup,"startup_guard_lookup_failed");
        startupDone(error, response);
      };
    }
    if (!bridgeHostAvailable(onDone)) return;
    var completed = false;
    var requestEpoch=panelLifecycleEpoch,requestGeneration=panelConnectionGeneration;
    var xhr = new XMLHttpRequest();
    if (!window.AEAgentPanelContract.validateLoopbackUrl(getBaseUrl())) { onDone({rejected:true,code:"invalid_loopback_url",message:"Bridge origin is not loopback."}); return; }
    xhr.open(method, getBaseUrl() + path, true);
    xhr.setRequestHeader("x-ae-bridge-token", getToken());
    xhr.timeout = isFixedGuardLookup(method, path, body) ? 60000 : path.indexOf("/agents/plan") === 0 || path === "/agents/ame/title-start/run" || body && body.name === "reconcile_plan_run"
      ? 120000
      : 10000;
    if(method==="GET" && path.indexOf("/bridge/next?")===0 && ownedPollingSession && !ownedPollingClosed) {
      // The one initial native remaining lifetime also has a non-renewed timer.
      // Backend owns the actual monotonic deadline and closes this exact response.
      xhr.timeout=ownedPollingSession.remainingSessionMs;
    }
    if (body !== null && body !== undefined) {
      xhr.setRequestHeader("content-type", "text/plain;charset=utf-8");
    }
    function finish(error, response) {
      if (completed) return;
      completed = true;
      if(requestEpoch !== panelLifecycleEpoch || requestGeneration !== panelConnectionGeneration) {
        error={isUnknown:method === "POST",rejected:method !== "POST",code:"lifecycle_interrupted",phase:"lifecycle_interrupted",message:"Connection changed before this request completed."};
        response=null;
      }
      if (error) { error.isUnknown = method === "POST" && (error.status === 0 || error.status === undefined); error.phase = error.diagnostic && error.diagnostic.phase || (error.isUnknown ? "delivery_unknown" : "transport"); }
      observeCausalRuntime(xhr,error);
      onDone(error, response);
    }
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status < 200 || xhr.status >= 300) {
        var errorMessage = xhr.status === 0 ? BRIDGE_OFFLINE_MESSAGE : "HTTP " + xhr.status + ": " + xhr.responseText;
        var errorBody = null;
        try {
          errorBody = xhr.responseText ? JSON.parse(xhr.responseText) : null;
          if (errorBody) {
            errorMessage = formatM100DiagnosticBody(errorBody, errorBody.error || (errorBody.run && errorBody.run.error) || errorMessage);
          }
        } catch (_parseError) {}
        if (xhr.status === 0 && !errorBody) {
          errorBody = {
            diagnostic: {
              phase: "bridge_offline",
              code: "bridge_offline",
              message: BRIDGE_OFFLINE_MESSAGE
            }
          };
          errorMessage = formatM100DiagnosticBody(errorBody, BRIDGE_OFFLINE_MESSAGE);
        }
        var requestError = new Error(errorMessage);
        requestError.status = xhr.status;
        requestError.body = errorBody;
        requestError.diagnostic = diagnosticFromBody(errorBody);
        requestError.code = errorBody && (errorBody.code || errorBody.run && errorBody.run.errorCode) ||
          requestError.diagnostic && requestError.diagnostic.code || "http_" + xhr.status;
        if (xhr.status === 0) requestError.bridgeOffline = true;
        finish(requestError);
        return;
      }
      try {
        finish(null, xhr.responseText ? JSON.parse(xhr.responseText) : {});
      } catch (error) {
        finish(error);
      }
    };
    xhr.onerror = function () {
      finish(makeBridgeOfflineError());
    };
    xhr.ontimeout = function () {
      finish(makeBridgeOfflineError());
    };
    xhr.send(body !== null && body !== undefined ? JSON.stringify(body) : null);
    return xhr;
  }

  function refreshAppTitle() {
    request("GET", "/health", null, function (error, response) {
      if (error || !response || !response.version) return;
      setAppTitle(response.version);
    });
  }

  function trimText(value) {
    return String(value || "").replace(/^\s+|\s+$/g, "");
  }

  function isPlainObject(value) {
    return !!(value && typeof value === "object" && !(value && typeof value.push === "function"));
  }

  function m100HashLooksValid(value) {
    return /^sha256:[a-f0-9]{64}$/.test(String(value || ""));
  }

  function m100ConfirmationTokenLooksValid(value) {
    return /^confirm_[a-f0-9]{48}$/.test(String(value || ""));
  }

  function m100ConfirmationSessionId() {
    // A selector for the server-issued confirmation, never authority by itself.
    // Stable during this page/connection epoch; reload/reconnect revokes old tokens.
    return panelConnectionId + ":core:" + confirmationSessionNonce + ":" + panelConnectionGeneration + ":" + panelLifecycleEpoch;
  }

  function normalizeM100ActionProposal(value) {
    if (!isPlainObject(value)) return null;
    if (value.protocolVersion !== M100_PROTOCOL_VERSION) return null;
    if (value.messageType !== "action_proposal") return null;
    if (value.status !== "awaiting_confirmation") return null;
    if (value.serverCreated !== true || value.createdBy !== M100_BACKEND_SOURCE) return null;
    if (!value.requestId || !value.actionId) return null;
    if (!isPlainObject(value.risk) || !M100_RISK_LEVELS[value.risk.level] || value.risk.requiresConfirmation !== true) return null;
    if (!isPlainObject(value.action)) return null;
    if (value.action.kind !== "ae_tool" && value.action.kind !== "ae_jsx") return null;
    if (!value.action.payloadRef || !m100HashLooksValid(value.action.payloadHash) || !m100HashLooksValid(value.action.previewHash)) return null;
    if (!isPlainObject(value.confirmation)) return null;
    if (value.confirmation.required !== true || value.confirmation.state !== "pending") return null;
    if (value.confirmation.riskPolicyVersion !== M100_RISK_POLICY_VERSION) return null;
    if (value.confirmation.confirmationToken && !m100ConfirmationTokenLooksValid(value.confirmation.confirmationToken)) return null;
    if (!value.confirmation.surface) return null;
    if (!value.confirmation.proposalExpiresAt || isNaN(Date.parse(value.confirmation.proposalExpiresAt))) return null;
    return value;
  }

  function m100ActionProposalForResult(result) {
    var proposal = normalizeM100ActionProposal(result && result.m100ActionProposal);
    if (!proposal) proposal = normalizeM100ActionProposal(result);
    if (!proposal) return null;
    if (result && result.requestId && String(result.requestId) !== String(proposal.requestId)) return null;
    return proposal;
  }

  function currentProposalBlockReason(proposal) {
    if(ownedPollingClosed) return "Owned transport закрыт; требуется сверка исходной сессии";
    if (!proposal) return "Нет текущего proposal";
    if (Date.parse(proposal.confirmation.proposalExpiresAt) <= Date.now()) return "Срок действия плана истёк";
    if (!currentBridgePlan || currentBridgePlan.actionId !== proposal.actionId) return "План не подтверждён сервером как текущий";
    if (/^(executing|completed|failed|expired|superseded|cancelled)$/.test(currentBridgePlan.state)) return "План: " + currentBridgePlan.state;
    if (currentBridgePlan.lastRun && currentBridgePlan.lastRun.errorCode === "project_target_mismatch") return "Открыт другой проект";
    return "";
  }

  function renderCurrentBridgePlan() {
    if (!currentBridgePlanEl) return;
    var state = currentBridgePlan;
    if (!state) { currentBridgePlanEl.textContent = "Текущий план Bridge отсутствует"; return; }
    var project = state.project || {};
    var parts = ["Проект: " + (project.expectedFile || "будет привязан при dry-run"),
      "План v" + state.revision + " · " + state.actionId,
      "Действует до: " + state.expiresAt, "Состояние: " + state.state];
    var steps = state.plan && state.plan.steps || [];
    for (var s = 0; s < steps.length; s++) {
      if (steps[s].tool === "run_extendscript_file") parts.push("JSX: " + (steps[s].args && steps[s].args.filePath || "путь отсутствует"));
    }
    if (project.actualFile && project.actualFile !== project.expectedFile) parts.push("Открыт: " + project.actualFile);
    if (state.dryRunCompletedAt) parts.push("Dry-run: " + state.dryRunCompletedAt);
    if (state.lastRun) {
      parts.push("Запуск: " + state.lastRun.id + " · " + state.lastRun.errorCode);
      if (state.lastRun.error) parts.push(state.lastRun.error);
      if (state.lastRun.verification) parts.push("Проверка: " + state.lastRun.verification);
    }
    currentBridgePlanEl.textContent = parts.join("\n");
    currentBridgePlanEl.style.whiteSpace = "pre-wrap";
    currentBridgePlanEl.style.overflowWrap = "anywhere";
  }

  function currentBridgePlanPins(state) {
    var proposal = normalizeM100ActionProposal(state && state.proposal);
    if (!proposal || !state.instanceId || typeof state.revision !== "number" ||
        state.revision < 1 || Math.floor(state.revision) !== state.revision ||
        proposal.revision !== state.revision || state.actionId !== proposal.actionId) return null;
    if (state.state !== "pending" && state.state !== "dry_run_passed") return null;
    if (state.lifecycleRetired || state.lastRun && state.lastRun.errorCode === "project_target_mismatch" ||
        !state.validation || state.validation.ok !== true ||
        state.expiresAt !== proposal.confirmation.proposalExpiresAt || Date.parse(state.expiresAt) <= Date.now()) return null;
    var project = state.project || {};
    var projectFile = project.expectedFile || "";
    var planProjectFile = state.plan && state.plan.targetProject && state.plan.targetProject.file || "";
    if (projectFile !== planProjectFile || project.actualFile && project.actualFile !== projectFile) return null;
    return {
      instanceId: state.instanceId,
      revision: state.revision,
      actionId: proposal.actionId,
      requestId: proposal.requestId,
      actionKind: proposal.action.kind,
      payloadRef: proposal.action.payloadRef,
      payloadHash: proposal.action.payloadHash,
      previewHash: proposal.action.previewHash,
      projectFile: projectFile,
      expiresAt: proposal.confirmation.proposalExpiresAt,
      riskLevel: proposal.risk.level,
      riskPolicyVersion: proposal.confirmation.riskPolicyVersion,
      surface: proposal.confirmation.surface,
      sessionId: proposal.confirmation.sessionId || ""
    };
  }

  function currentBridgePlanMatchesPins(state, expected) {
    var actual = currentBridgePlanPins(state);
    if (!actual || !expected) return false;
    for (var key in expected) {
      if (Object.prototype.hasOwnProperty.call(expected, key) && actual[key] !== expected[key]) return false;
    }
    return true;
  }

  function ownedCompletedDryRunPromised(value) {
    return !!(value && value.ownedPlanPreparation && value.ownedPlanPreparation.mode === "completed_native_dry_run_v1");
  }

  function ownedPanelActor() {
    var state = window.AEAgentPanelActions && window.AEAgentPanelActions.state();
    return {panelConnectionId:panelConnectionId,panelGeneration:String(panelConnectionGeneration),
      panelInstanceId:state && state.panelInstanceId || "",panelLifecycleEpoch:panelLifecycleEpoch,
      confirmationSessionId:m100ConfirmationSessionId()};
  }

  function ownedTokenlessProposalKey(value) {
    var proposal=normalizeM100ActionProposal(value);
    if(!proposal) return "";
    var publicProposal=JSON.parse(JSON.stringify(proposal));
    delete publicProposal.confirmation.confirmationToken;
    return planKeyFor(publicProposal);
  }

  function ownedPollingActorCurrent(session) {
    if(!session || session!==ownedPollingSession || ownedPollingClosed) return false;
    if(session.url!==getBaseUrl() || session.token!==getToken()) return false;
    var actor=ownedPanelActor();
    for(var key in session.actor) if(actor[key]!==session.actor[key]) return false;
    return true;
  }

  function closeOwnedPolling(code) {
    if(ownedPollingClosed) return;
    ownedPollingClosed=code || "owned_transport_unknown";
    var session=ownedPollingSession;
    running=false;pollInFlight=false;ownedCompletedDryRunCache=null;lastAcceptedDryRun=null;
    if(pollTimer) clearTimeout(pollTimer);
    if(session) {
      clearTimeout(session.timer);
      if(session.command) clearTimeout(session.command.timer);
      // Abort only held reads; submitted POST outcomes remain unreconciled.
      if(session.heldXhr && typeof session.heldXhr.abort==="function") session.heldXhr.abort();
      if(session.heartbeatXhr && typeof session.heartbeatXhr.abort==="function") session.heartbeatXhr.abort();
    }
    setStatus("Owned transport CLOSED · требуется сверка",false);
    setPlanRunStatus(ownedPollingClosed,"blocked");updatePlanControls();
  }

  function beginOwnedPolling(response) {
    if(!ownedCompletedDryRunPromised(response)) return false;
    var remaining=response.ownedPlanPreparation.remainingSessionMs;
    if(ownedPollingSession || typeof remaining!=="number" || Math.floor(remaining)!==remaining || remaining<=0 || remaining>28800000) {
      closeOwnedPolling("owned_original_session_deadline_invalid");return false;
    }
    ownedPlanPreparationMode="completed_native_dry_run_v1";
    var session={actor:ownedPanelActor(),url:getBaseUrl(),token:getToken(),remainingSessionMs:remaining,heldXhr:null,command:null,heartbeatXhr:null};
    ownedPollingSession=session;
    // Scheduling data only: this timer never renews the ORIGINAL session.
    session.timer=setTimeout(function ownedSessionDeadline() {if(session===ownedPollingSession) closeOwnedPolling("owned_original_session_deadline");},remaining);
    return true;
  }

  function beginOwnedCommand(command) {
    var session=ownedPollingSession,remaining=command && command.remainingCommandMs,owner=command && command.leaseOwner;
    if(!ownedPollingActorCurrent(session) || session.command || !command || command.contractVersion!==2 || !command.id ||
        !command.executionId || !command.leaseId || !owner || owner.panelConnectionId!==session.actor.panelConnectionId ||
        owner.panelGeneration!==session.actor.panelGeneration || typeof remaining!=="number" || Math.floor(remaining)!==remaining || remaining<=0 || remaining>30000) {
      closeOwnedPolling("owned_original_command_deadline_invalid");return false;
    }
    var pending={id:command.id,phase:"delivered",heartbeatInFlight:false};session.command=pending;
    pending.originalCommand=command;
    pending.timer=setTimeout(function ownedCommandDeadline() {
      if(session===ownedPollingSession && session.command===pending) closeOwnedPolling("owned_original_command_deadline");
    },remaining);
    return true;
  }

  function finishOwnedCommand(command, receiptAccepted) {
    var session=ownedPollingSession,pending=session && session.command;
    if(!ownedPollingActorCurrent(session) || !pending || pending.id!==command.id || !receiptAccepted) {
      closeOwnedPolling("owned_original_command_receipt_unknown");return;
    }
    if(pending.heartbeatInFlight) {pending.phase="acknowledged";return;}
    clearTimeout(pending.timer);session.command=null;clearActiveEvalScriptCommand(command.id);
    // The next original GET is permitted only after this actual result ACK.
    if(pollTimer) clearTimeout(pollTimer);
    pollTimer=setTimeout(poll,50);
  }

  function ownedCompletedDryRunCacheMatches(pins) {
    var cached=ownedCompletedDryRunCache,actor=ownedPanelActor();
    if(!cached || !ownedCompletedDryRunPromised(currentBridgePlan) || !lastAcceptedDryRun || lastAcceptedDryRun.runId!==cached.runId ||
        !currentBridgePlanMatchesPins(currentBridgePlan,cached.pins) ||
        pins && !currentBridgePlanMatchesPins(currentBridgePlan,pins) ||
        cached.planKey!==currentPlanKey() || cached.planKey!==planKeyFor(currentBridgePlan && currentBridgePlan.plan) ||
        cached.validationKey!==planKeyFor(currentBridgePlan.validation) || cached.validationKey!==planKeyFor(lastPlanResult && lastPlanResult.planValidation) ||
        cached.proposalKey!==ownedTokenlessProposalKey(currentBridgePlan.proposal) ||
        cached.proposalKey!==ownedTokenlessProposalKey(m100ActionProposalForResult(lastPlanResult)) ||
        currentBridgePlan.proposal.confirmation.confirmationToken) return false;
    for(var key in actor) if(actor[key]!==cached.actor[key]) return false;
    return true;
  }

  function ownedCompletedDryRunValid(response, originalPins, originalPlanKey, originalValidationKey, originalProposalKey, actor) {
    var current=response && response.current,run=response && response.completedDryRun;
    var proposal=normalizeM100ActionProposal(response && response.proposal),binding=run && run.binding,delivery=run && run.nativeDelivery;
    if(!response || response.ok!==true || !ownedCompletedDryRunPromised(current) || !proposal ||
        !proposal.confirmation.confirmationToken || !currentBridgePlanMatchesPins(current,originalPins) ||
        current.proposal.confirmation.confirmationToken || response.revision!==originalPins.revision ||
        proposal.actionId!==originalPins.actionId || proposal.revision!==originalPins.revision ||
        planKeyFor(response.plan)!==originalPlanKey || planKeyFor(current.plan)!==originalPlanKey ||
        planKeyFor(response.validation)!==originalValidationKey || planKeyFor(current.validation)!==originalValidationKey ||
        ownedTokenlessProposalKey(current.proposal)!==originalProposalKey || ownedTokenlessProposalKey(proposal)!==originalProposalKey ||
        current.state!=="dry_run_passed" || !run || run.schema!=="ae-agent.owned-native-dry-projection.v1" ||
        run.ok!==true || run.dryRun!==true || run.nativeAuthority!==false ||
        run.requestId!==originalPins.requestId || run.actionId!==originalPins.actionId ||
        run.revision!==originalPins.revision || run.instanceId!==originalPins.instanceId ||
        typeof run.finishedAt!=="string" || isNaN(Date.parse(run.finishedAt)) ||
        !current.dryRunCompletedAt || isNaN(Date.parse(current.dryRunCompletedAt)) ||
        !current.lastRun || current.lastRun.id!==run.id || current.lastRun.ok!==true || current.lastRun.dryRun!==true ||
        !binding || planKeyFor(binding.pins)!==planKeyFor(originalPins) || !isPlainObject(delivery) || run.id!==delivery.executionRef) return false;
    var currentActor=ownedPanelActor();
    for(var key in actor) if(!actor[key] && actor[key]!==0 || binding[key]!==actor[key] || currentActor[key]!==actor[key]) return false;
    if(originalPins.surface!=="cep-panel" || originalPins.sessionId!==actor.confirmationSessionId) return false;
    var refs=["commandRef","executionRef","leaseRef"],hashes=["receiptSha25664","scriptSha25664","resultSha25664"];
    if(Object.keys(delivery).sort().join(",")!==refs.concat(hashes).sort().join(",")) return false;
    for(var r=0;r<refs.length;r++) if(typeof delivery[refs[r]]!=="string" || !/^[a-f0-9]{32}$/.test(delivery[refs[r]]) || /^0+$/.test(delivery[refs[r]])) return false;
    for(var h=0;h<hashes.length;h++) if(typeof delivery[hashes[h]]!=="string" || !/^[a-f0-9]{64}$/.test(delivery[hashes[h]]) || /^0+$/.test(delivery[hashes[h]])) return false;
    return true;
  }

  function invalidateCurrentPlanSyncAfterOwnedAdoption() {
    // A late pre-adopt GET must never replace the completed native snapshot.
    currentPlanSyncActiveReqId=0;currentPlanSyncActiveEpoch=0;currentPlanSyncInFlight=false;
    var waiters=currentPlanSyncWaiters;currentPlanSyncWaiters=[];
    for(var i=0;i<waiters.length;i++) {
      try {waiters[i].onDone({rejected:true,code:"plan_pins_mismatch",message:"Current read preceded completed native adoption."});} catch(_waiterError) {}
    }
  }

  function dispatchCurrentBridgePlanSync() {
    if (currentPlanSyncInFlight) return;
    currentPlanSyncInFlight = true;
    var reqId = ++currentPlanSyncSeq;
    var reqEpoch = panelLifecycleEpoch;
    var reqGen = panelConnectionGeneration;
    currentPlanSyncActiveReqId = reqId;
    currentPlanSyncActiveEpoch = reqEpoch;
    currentPlanSyncAt = Date.now();

    request("GET", "/agents/plan/current", null, function (error, response) {
      if (reqEpoch !== panelLifecycleEpoch || reqId !== currentPlanSyncActiveReqId || reqGen !== panelConnectionGeneration) {
        return;
      }

      currentPlanSyncInFlight = false;
      currentPlanSyncActiveReqId = 0;
      currentPlanSyncActiveEpoch = 0;
      currentPlanSyncAt = Date.now();

      var hasFreshFollowupWaiters = false;
      for (var f = 0; f < currentPlanSyncWaiters.length; f++) {
        var wCandidate = currentPlanSyncWaiters[f];
        if (wCandidate.epoch === reqEpoch && wCandidate.minReqId > reqId) {
          hasFreshFollowupWaiters = true;
          break;
        }
      }

      var canonicalChanged = false;
      var incoming = response && response.current || null;
      if(ownedCompletedDryRunPromised(incoming)) ownedPlanPreparationMode="completed_native_dry_run_v1";

      if (!hasFreshFollowupWaiters) {
        if (error) {
          currentBridgePlan = null;
          ownedCompletedDryRunCache=null;lastAcceptedDryRun=null;
        } else {
          if (incoming) {
            var oldProposal = m100ActionProposalForResult(lastPlanResult);
            var localToken = null;
            var localPins = lastPlanResult && lastPlanResult.bridgePlanPins || currentBridgePlanPins(currentBridgePlan);
            if (oldProposal && oldProposal.confirmation.surface === "cep-panel" &&
                oldProposal.confirmation.sessionId === m100ConfirmationSessionId() && oldProposal.actionId === incoming.actionId &&
                oldProposal.confirmation && oldProposal.confirmation.confirmationToken) {
              if (currentBridgePlanMatchesPins(incoming, localPins) &&
                  oldProposal.actionId === localPins.actionId && oldProposal.requestId === localPins.requestId &&
                  oldProposal.revision === localPins.revision && oldProposal.action.kind === localPins.actionKind &&
                  oldProposal.action.payloadRef === localPins.payloadRef &&
                  oldProposal.action.payloadHash === localPins.payloadHash && oldProposal.action.previewHash === localPins.previewHash &&
                  oldProposal.risk.level === localPins.riskLevel && oldProposal.confirmation.riskPolicyVersion === localPins.riskPolicyVersion &&
                  oldProposal.confirmation.proposalExpiresAt === localPins.expiresAt &&
                  oldProposal.confirmation.surface === localPins.surface && (oldProposal.confirmation.sessionId || "") === localPins.sessionId) {
                localToken = oldProposal.confirmation.confirmationToken;
              } else {
                canonicalChanged = true;
              }
            }

            if (!currentBridgePlan || incoming.instanceId !== currentBridgePlan.instanceId || incoming.revision >= currentBridgePlan.revision) {
              var replaced = !currentBridgePlan || incoming.actionId !== currentBridgePlan.actionId;
              currentBridgePlan = incoming;
              if (incoming.proposal && incoming.proposal.confirmation) {
                if(!ownedCompletedDryRunPromised(incoming)) incoming.proposal.confirmation.confirmationToken = localToken;
              }
              var incomingProposal=incoming.proposal;
              if(ownedCompletedDryRunPromised(incoming) && localToken) {
                incomingProposal=JSON.parse(JSON.stringify(incoming.proposal));incomingProposal.confirmation.confirmationToken=localToken;
              }
              lastPlanResult = {
                plan: incoming.plan,
                planValidation: incoming.validation,
                requestId: incoming.proposal ? incoming.proposal.requestId : "",
                m100ActionProposal: incomingProposal,
                bridgePlanPins: localToken ? localPins : null
              };
              if (replaced) {
                ownedCompletedDryRunCache=null;
                lastAcceptedDryRun = null;
                showPlanResult("assistant", "Текущий план Bridge v" + incoming.revision + ": " + (incoming.plan && incoming.plan.summary || incoming.actionId),
                  {actionProposal: incoming.proposal, planResult: lastPlanResult});
              }
            }
          } else {
            currentBridgePlan = null;
            lastPlanResult = null;
            lastAcceptedDryRun = null;
            ownedCompletedDryRunCache=null;
          }
        }
        if(ownedCompletedDryRunCache && !ownedCompletedDryRunCacheMatches()) {ownedCompletedDryRunCache=null;lastAcceptedDryRun=null;}
        renderCurrentBridgePlan();
        updatePlanControls();
      }

      var satisfied = [];
      var remaining = [];
      for (var w = 0; w < currentPlanSyncWaiters.length; w++) {
        var waiter = currentPlanSyncWaiters[w];
        if (waiter.epoch !== reqEpoch || waiter.generation !== reqGen) {
          satisfied.push({ waiter: waiter, error: makeBridgeOfflineError("Connection lifecycle reset") });
        } else if (waiter.minReqId <= reqId) {
          var waiterErr = error;
          if (!waiterErr && waiter.expectedActionId) {
            if (!incoming || incoming.actionId !== waiter.expectedActionId || canonicalChanged ||
                waiter.expectedPlanPins && !currentBridgePlanMatchesPins(incoming, waiter.expectedPlanPins)) {
              waiterErr = new Error("План на сервере изменился. Просмотрите актуальную версию.");
            }
          }
          satisfied.push({ waiter: waiter, error: waiterErr });
        } else {
          if (error && isBridgeOfflineError(error)) {
            satisfied.push({ waiter: waiter, error: error });
          } else {
            remaining.push(waiter);
          }
        }
      }
      currentPlanSyncWaiters = remaining;

      for (var s = 0; s < satisfied.length; s++) {
        try {
          var settled = satisfied[s];
          var lifecycleChanged = settled.waiter.epoch !== panelLifecycleEpoch || settled.waiter.generation !== panelConnectionGeneration;
          settled.waiter.onDone(lifecycleChanged ? makeBridgeOfflineError("Connection lifecycle reset") : settled.error || null);
        } catch (_cbErr) {}
      }

      if (reqEpoch === panelLifecycleEpoch && reqGen === panelConnectionGeneration && currentPlanSyncWaiters.length > 0) {
        dispatchCurrentBridgePlanSync();
      }
    });
  }

  function refreshCurrentBridgePlan(options, onDone) {
    if (typeof options === "function") {
      var tmpDone = onDone;
      onDone = options;
      options = (typeof tmpDone === "object" && tmpDone !== null) ? tmpDone : null;
    }
    options = options || {};
    var isFresh = options.fresh === true;
    var reqEpoch = panelLifecycleEpoch;
    var reqGen = panelConnectionGeneration;

    var minReqId;
    if (isFresh) {
      minReqId = currentPlanSyncSeq + 1;
    } else if (currentPlanSyncInFlight && currentPlanSyncActiveEpoch === reqEpoch) {
      minReqId = currentPlanSyncActiveReqId;
    } else {
      minReqId = currentPlanSyncSeq + 1;
    }

    if (typeof onDone === "function") {
      currentPlanSyncWaiters.push({
        onDone: onDone,
        minReqId: minReqId,
        fresh: isFresh,
        expectedActionId: options.expectedActionId || null,
        expectedPlanPins: options.expectedPlanPins || null,
        epoch: reqEpoch,
        generation: reqGen
      });
    }

    if (currentPlanSyncInFlight) {
      return;
    }

    dispatchCurrentBridgePlanSync();
  }

  function showPlanResult(role,text) {
    planResultEl.textContent=window.AEAgentPanelContract.redactState({text:String(text || "")}).text;
    planResultEl.setAttribute("data-tone",role === "error" ? "blocked" : "result");
  }

  function setPlanBusy(busy,label) { planRequestInFlight=!!busy;updatePlanControls();if(label)setPlanRunStatus(label,""); }

  function setPlanRunStatus(text, tone) {
    if (!planRunStatusEl) return;
    planRunStatusEl.textContent = text || "";
    planRunStatusEl.className = "plan-run-status" + (tone ? " " + tone : "");
  }

  function planClassification(validation) {
    return validation && validation.classification && typeof validation.classification === "object"
      ? validation.classification
      : null;
  }

  function classificationBlocksRun(validation) {
    var classification = planClassification(validation);
    return !!(classification && classification.blocksRun === true && rawExtendscriptStepCount(validation) > 0);
  }

  function planKeyFor(plan) {
    try {
      return JSON.stringify(plan || {});
    } catch (_error) {
      return "";
    }
  }

  function currentPlanKey() {
    return lastPlanResult && lastPlanResult.plan ? planKeyFor(lastPlanResult.plan) : "";
  }

  function rawExtendscriptStepCount(validation) {
    var classification = planClassification(validation);
    var classifiedCount = classification ? Number(classification.rawExtendscriptStepCount || 0) : 0;
    if (classifiedCount > 0) return classifiedCount;
    var steps = validation && validation.steps && typeof validation.steps.push === "function" ? validation.steps : [];
    var count = 0;
    for (var i = 0; i < steps.length; i++) {
      var tool = steps[i] && steps[i].tool ? String(steps[i].tool) : "";
      if (tool === "run_extendscript" || tool === "run_extendscript_file") count++;
    }
    return count;
  }

  function rawExtendscriptDryRunGateReady(validation) {
    if (!lastAcceptedDryRun || !lastAcceptedDryRun.ok || !lastAcceptedDryRun.runId) return false;
    if (!classificationBlocksRun(validation) || rawExtendscriptStepCount(validation) <= 0) return false;
    var planKey = currentPlanKey();
    if (!planKey || lastAcceptedDryRun.planKey !== planKey) return false;
    if (lastPlanResult && lastPlanResult.requestId && lastAcceptedDryRun.requestId && lastAcceptedDryRun.requestId !== lastPlanResult.requestId) return false;
    return true;
  }

  function planRunBlocksNormalRun(validation) {
    return classificationBlocksRun(validation) && !rawExtendscriptDryRunGateReady(validation);
  }

  function updatePlanControls() {
    var proposal=m100ActionProposalForResult(lastPlanResult),pins=currentBridgePlanPins(currentBridgePlan);
    var validation=lastPlanResult && lastPlanResult.planValidation;
    dryRunPlanButton.disabled=!running || planRequestInFlight || !pins || !proposal || !!currentProposalBlockReason(proposal);
    dryRunPlanButton.textContent=proposal && !proposal.confirmation.confirmationToken ? "Подготовить и проверить" : "Проверить план";
    runPlanButton.disabled=dryRunPlanButton.disabled || !validation || !validation.ok || planRunBlocksNormalRun(validation) ||
      !proposal.confirmation.confirmationToken || !lastAcceptedDryRun || !lastAcceptedDryRun.ok ||
      lastAcceptedDryRun.planKey!==currentPlanKey() || !currentBridgePlanMatchesPins(currentBridgePlan,lastAcceptedDryRun.pins);
    renderPlanReconciliationControl();
  }

  function countLabel(count, singular, plural) {
    var value = Number(count || 0);
    return value + " " + (value === 1 ? singular : plural);
  }

  function fallbackTargetSummary(step) {
    var args = step && step.args && typeof step.args === "object" ? step.args : {};
    if (step && step.tool === "create_test_comp" && args.name) return "new comp " + args.name;
    if (args.compName) return "comp " + args.compName;
    if (args.itemName) return "item " + args.itemName;
    if (args.name) return "item " + args.name;
    if (args.layerIndices && typeof args.layerIndices.push === "function" && args.layerIndices.length) {
      return "layers " + args.layerIndices.join(",");
    }
    if (args.layerIndex !== undefined && args.layerIndex !== null && args.layerIndex !== "") {
      return "layer " + args.layerIndex;
    }
    return "";
  }

  function collectTargetSummaries(steps) {
    var source = steps && typeof steps.push === "function" ? steps : [];
    var seen = {};
    var targets = [];
    for (var i = 0; i < source.length; i++) {
      var summary = trimText(source[i] && source[i].targetSummary ? source[i].targetSummary : fallbackTargetSummary(source[i]));
      if (!summary || seen[summary]) continue;
      seen[summary] = true;
      targets.push(summary);
    }
    if (!targets.length) return "none reported";
    if (targets.length > 4) {
      return targets.slice(0, 4).join("; ") + "; +" + (targets.length - 4) + " more";
    }
    return targets.join("; ");
  }

  function readableSafetyLabel(safety) {
    var value = safety && (safety.protection || safety.status) ? String(safety.protection || safety.status) : "checked";
    if (value === "auto_edit_session") return "protected edit session";
    if (value === "planned_checkpoint_step") return "planned checkpoint step";
    if (value === "planned_edit_session_step") return "planned edit session step";
    if (value === "blocked_save_project_first") return "save project first";
    if (value === "blocked_edit_session_failed") return "edit session failed";
    if (value === "blocked_raw_extendscript_gate") return "raw ExtendScript gate blocked";
    return value.replace(/_/g, " ");
  }

  function checkpointFileForRun(run) {
    if (!run) return "";
    if (run.checkpoint && run.checkpoint.checkpointFile) return run.checkpoint.checkpointFile;
    if (run.editSession && run.editSession.checkpoint && run.editSession.checkpoint.checkpointFile) {
      return run.editSession.checkpoint.checkpointFile;
    }
    var steps = run.steps && typeof run.steps.push === "function" ? run.steps : [];
    for (var i = 0; i < steps.length; i++) {
      var result = steps[i] && steps[i].result ? steps[i].result : null;
      if (result && result.checkpoint && result.checkpoint.checkpointFile) return result.checkpoint.checkpointFile;
      if (result && result.mutation && result.mutation.checkpoint && result.mutation.checkpoint.checkpointFile) {
        return result.mutation.checkpoint.checkpointFile;
      }
    }
    return "";
  }

  function stepUndoHintForRun(run) {
    var steps = run && run.steps && typeof run.steps.push === "function" ? run.steps : [];
    for (var i = 0; i < steps.length; i++) {
      var result = steps[i] && steps[i].result ? steps[i].result : null;
      if (result && result.mutation && result.mutation.undoHint) return result.mutation.undoHint;
    }
    return "";
  }

  function checkpointEditSessionStatusText(run, mutatingCount) {
    if (!run) return "";
    if (run.dryRun) {
      if (mutatingCount > 0) return "Checkpoint/edit session: dry-run only; no checkpoint was created. Run plan will prepare protection.";
      return "Checkpoint/edit session: not needed for read-only dry run.";
    }
    if (run.safety && run.safety.saveProjectFirst) {
      return "Checkpoint/edit session: blocked before checkpoint; save the AE project first.";
    }
    if (run.safety && run.safety.status === "blocked_missing_edit_session") {
      return "Checkpoint/edit session: blocked before any project change.";
    }
    if (run.safety && run.safety.status === "blocked_edit_session_failed") {
      return "Checkpoint/edit session: protection could not be prepared.";
    }
    if (run.editSession) {
      return "Checkpoint/edit session: protected by " + (run.editSession.label || run.editSession.id || "edit session") + ".";
    }
    if (checkpointFileForRun(run)) {
      return "Checkpoint/edit session: checkpoint available.";
    }
    if (mutatingCount > 0) {
      return "Checkpoint/edit session: no checkpoint metadata returned; review before retrying.";
    }
    return "Checkpoint/edit session: not needed for read-only run.";
  }

  function recoveryHintForRun(run, mutatingCount) {
    if (!run || run.ok) return "";
    if (run.recoveryHint) return run.recoveryHint;
    if (run.safety && run.safety.saveProjectFirst) {
      return "No project change was started. Save the AE project so a checkpoint can be created, then retry the protected run.";
    }
    if (run.safety && run.safety.status === "blocked_missing_edit_session") {
      return "No project change was started. Retry through the protected Run plan action, or create a checkpoint/edit session before running mutating steps.";
    }
    if (run.safety && run.safety.status === "blocked_edit_session_failed") {
      return "No project change was started because edit-session protection could not be prepared. Review the safety error, then retry after the project can be checkpointed.";
    }
    var checkpointFile = checkpointFileForRun(run);
    if (checkpointFile) {
      return "A checkpoint is available at " + checkpointFile + ". Review the AE project, then restore manually from that checkpoint only if needed.";
    }
    var undoHint = stepUndoHintForRun(run);
    if (undoHint) return undoHint;
    if (mutatingCount <= 0) return "No project changes were requested. Review the failed read-only step, adjust the plan, and retry.";
    return "Review the failed step before retrying. If any AE change occurred, use the checkpoint or After Effects Undo path listed in the step details.";
  }

  function rememberPlanRun(run) {
    ownedCompletedDryRunCache = null;
    lastPlanRunResult = run || null;

    lastAcceptedDryRun = null;
    if (run && run.dryRun && run.ok) {
      lastAcceptedDryRun = {
        ok: true,
        runId: String(run.id || ""),
        requestId: lastPlanResult && lastPlanResult.requestId ? String(lastPlanResult.requestId) : "",
        planKey: currentPlanKey(),
        pins: currentBridgePlanPins(currentBridgePlan),
        acceptedAt: new Date().toISOString()
      };
      if (!lastAcceptedDryRun.runId || !lastAcceptedDryRun.planKey) lastAcceptedDryRun = null;
    }

    renderPlanReconciliationControl();
  }

  function showPlanRunFinishedStatus(dryRun, run, failed) {
    var label = dryRun ? "Dry run" : "Run";
    var ok = run && !planRunNeedsReview(run) && !failed;
    var validation = lastPlanResult && lastPlanResult.planValidation ? lastPlanResult.planValidation : null;
    var mutatingCount = validation ? Number(validation.mutatingCount || 0) : 0;
    var tone = ok ? (mutatingCount > 0 ? "mutating" : "read-only") : "blocked";
    var doneText = ok && dryRun && rawExtendscriptDryRunGateReady(validation)
      ? " complete; Run unlocked"
      : " complete; result added below";
    setPlanRunStatus(label + (ok ? doneText : " needs review; see result below"), tone);
  }

  function formatSemanticVerification(semantic) {
    if (!semantic || semantic.status === "not_applicable" || semantic.status === "not_run") return "";
    var label = semantic.status === "passed" ? "passed" : "needs review";
    var parts = ["Outcome verification: " + label];
    if (semantic.summary) parts[0] += " - " + semantic.summary;
    var checkText = "Verification checks: " + Number(semantic.passedChecks || 0) + " passed";
    if (Number(semantic.failedChecks || 0) > 0) checkText += ", " + Number(semantic.failedChecks || 0) + " need review";
    checkText += "; read-back summaries: " + Number(semantic.readBackCount || 0);
    parts.push(checkText);
    if (semantic.warnings && semantic.warnings.length) {
      parts.push("Verification warning: " + semantic.warnings.slice(0, 2).join("; "));
    }
    return parts.join("\n");
  }

  function planRunNeedsReview(run) {
    if (!run || !run.ok) return true;
    var outcome = run.outcome;
    return Boolean(outcome && (outcome.mutation && (outcome.mutation.status === "unknown" || outcome.mutation.status === "failed") || outcome.verification && outcome.verification.status !== "passed" && outcome.verification.status !== "not_required"));
  }

  function formatRunOutcome(outcome) {
    if (!outcome) return "";
    var execution = { not_started: "не началось", completed: "завершено", failed: "завершилось ошибкой", unknown: "результат неизвестен" };
    var mutation = { not_started: "не начались", applied: "выполнены", unknown: "результат неизвестен — требуется сверка", failed: "завершились ошибкой", not_requested: "не планировались" };
    var verification = { not_required: "не требовалась", pending: "не завершена", passed: "пройдена", failed: "не прошла", insufficient: "не хватает доказательств" };
    var lines = [];
    if (outcome.execution) lines.push("Выполнение: " + (execution[outcome.execution.status] || outcome.execution.status));
    if (outcome.mutation) {
      var counts = outcome.mutation.counts;
      var noMutations = counts && !Number(counts.applied || 0) && !Number(counts.unknown || 0) && !Number(counts.failed || 0) && !Number(counts.not_started || 0);
      lines.push("Изменения: " + (noMutations ? "не планировались" : mutation[outcome.mutation.status] || outcome.mutation.status));
    }
    if (outcome.verification) lines.push("Проверка: " + (verification[outcome.verification.status] || outcome.verification.status));
    if (outcome.coverage) lines.push("Охват доказательств: " + ({complete:"полный",incomplete:"неполный",not_required:"не требовался"}[outcome.coverage.status] || outcome.coverage.status));
    var original = outcome.execution && outcome.execution.originalError;
    if (original) lines.push("Исходная ошибка: " + (original.code || "") + (original.message ? " — " + original.message : ""));
    return lines.join("\n");
  }

  function renderPlanReconciliationControl() {
    if (!reconcilePlanRunButton) return;
    var run = lastPlanRunResult;
    reconcilePlanRunButton.disabled = !running || planRequestInFlight || planReconcileInFlight || !run || !run.id || run.dryRun || !run.validation || !(run.validation.mutatingCount > 0);
    reconcilePlanRunButton.textContent = planReconcileInFlight ? "Сверяю..." : "Сверить результат";
  }

  function knownUnresolvedPlanRun(runId) {
    if(typeof window === "undefined" || !window.AEAgentPanelActions) return false;
    return window.AEAgentPanelActions.state().unresolvedActions.some(function(row) {return !!row.runId && (!runId || row.runId === runId);});
  }

  function reconcileLastPlanRun(args,onDone,context) {
    var run = lastPlanRunResult;
    var runId = args ? args.runId : run && run.id;
    var guarded=knownUnresolvedPlanRun(runId);
    if ((!running && !guarded) || planRequestInFlight || planReconcileInFlight || recoveryTransportConnecting ||
        !guarded && (!run || !run.id || run.dryRun || !run.validation || !(run.validation.mutatingCount > 0))) {if(onDone) onDone({rejected:true,code:"reconciliation_unavailable"});return;}
    if(!guarded && runId !== run.id) {if(onDone) onDone({rejected:true,code:"run_id_mismatch"});return;}
    var originalRequestId=context && context.originalGeneratedExportRequest ? context.originalGeneratedExportRequest(runId) : null;
    if(guarded && !originalRequestId){if(onDone)onDone({rejected:true,code:"generated_recovery_original_plan_request_required"});return;}
    planReconcileInFlight = true;
    planRequestInFlight = true;
    updatePlanControls();
    var reconcileArguments={runId:runId},recoveryConfig={url:getBaseUrl(),token:getToken(),panelConnectionId:panelConnectionId,epoch:panelLifecycleEpoch,generation:String(panelConnectionGeneration)};
    if(originalRequestId)reconcileArguments.originalRequestId=originalRequestId;
    request("POST", "/tools/call", {name:"reconcile_plan_run",arguments:reconcileArguments}, function (error, response) {
      planReconcileInFlight = false;
      planRequestInFlight = false;
      updatePlanControls();
      if (!running && !guarded) {if(onDone) onDone({isUnknown:true,code:"lifecycle_interrupted"});return;}
      if(context && context.isCurrent && !context.isCurrent()){if(onDone)onDone({isUnknown:true,code:"lifecycle_interrupted",phase:"lifecycle_interrupted"});return;}
      var result = null;
      try { if (response && response.result && !response.result.isError) result = JSON.parse(response.result.content[0].text); } catch (_parseError) {}
      if (error || !result) { showPlanResult("error", "Сверка не завершена: " + (error && error.message || "Нет доказательств состояния.")); if(onDone) onDone(error || {code:"reconciliation_missing",message:"No reconciliation evidence."},response);return; }
      if(result.runId && result.runId !== runId) {if(onDone) onDone({code:"reconciliation_identity_mismatch",message:"Reconciliation belongs to another run."},{runId:runId,reconciliation:result});return;}
      if(result.status==="transport_prerequisite"){
        var completed=!!(context && context.completeRecoveryTransportPrerequisite && context.completeRecoveryTransportPrerequisite(result,function(value){connectRecoveryTransport(value,recoveryConfig);}));
        if(!completed && onDone)onDone({isUnknown:true,code:"recovery_transport_prerequisite_not_persisted"});
        return;
      }
      var lines = ["Сверка запуска " + runId + ": " + (result.status === "reconciled" ? "завершена" : "не завершена")];
      var names = {applied:"ожидаемые значения подтверждены",not_applied:"изменение не применено",unknown:"результат неизвестен"};
      (result.steps || []).forEach(function (step) { lines.push("Шаг " + step.index + " (" + step.tool + "): " + (names[step.mutationStatus] || step.mutationStatus)); });
      if (result.reasonCode) lines.push("Причина: " + result.reasonCode);
      lines.push("Сверка выполнена без повторных изменений. Исходный результат запуска сохранён.");
      if (lastPlanRunResult && lastPlanRunResult.id === runId) lastPlanRunResult.reconciliation = result;
      showPlanResult("assistant", lines.join("\n"));
      // Only this trusted handler may adopt server-persisted terminal evidence.
      var adopted=!!(result.generatedExportRecovery && context && context.adoptGeneratedExportRecovery && context.adoptGeneratedExportRecovery(result.generatedExportRecovery,runId));
      if(result.commonTitleAssemblyRecovery && context && context.adoptCommonTitleAssemblyRecovery)adopted=!!context.adoptCommonTitleAssemblyRecovery(result.commonTitleAssemblyRecovery,runId);
      if(result.nativeFixtureAbandonmentAvailable===true && result.originalRequestId===originalRequestId && result.historicalOutcome==="unknown" && result.nativeExecutionProven===false && result.replayAllowed===false) {
        // Release this read-only handler first; the independent trusted GET then
        // verifies actual controller idleness before adopting the exact sidecar.
        if(onDone)onDone(null,{reconciliation:result,runId:runId,admissionGuardReleased:false,terminalEvidenceRequired:true});
        panelActionUI.refreshNativeFixtureAbandonments();return;
      }
      if(onDone) onDone(null,{reconciliation:result,runId:runId,admissionGuardReleased:adopted,
        terminalEvidenceRequired:guarded && !adopted});
    });
  }

  function formatPlanRun(run) {
    if (!run) return "No run result.";
    var lines = [];
    var runValidation = run.validation || null;
    var runSteps = run.steps && typeof run.steps.push === "function" ? run.steps : [];
    var runMutatingCount = runValidation ? Number(runValidation.mutatingCount || 0) : 0;
    lines.push((run.dryRun ? "Проверка плана" : "Результат запуска") + ": " + (planRunNeedsReview(run) ? "требуется проверка" : "готов"));
    if (run.outcome) {
      lines.push(formatRunOutcome(run.outcome));
    }
    if (!run.ok && diagnosticFromBody({ run: run })) {
      lines.push(formatM100DiagnosticBody({ run: run }, run.error || "Run failed."));
    }
    if (run.dryRun) {
      lines.push("Mode: preview only; project was not changed.");
    } else if (runValidation && runValidation.ok === false) {
      lines.push("Mode: blocked before execution.");
    } else if (runMutatingCount > 0) {
      lines.push("Mode: protected project-change run.");
    } else {
      lines.push("Mode: read-only execution.");
    }
    if (run.error && !diagnosticFromBody({ run: run })) lines.push("Error: " + run.error);
    if (runValidation) {
      lines.push("Plan: " + countLabel(runValidation.stepCount || 0, "step", "steps") + ", " + runMutatingCount + " mutating");
    }
    if (runSteps.length) lines.push("Affected targets: " + collectTargetSummaries(runSteps));
    var checkpointStatus = checkpointEditSessionStatusText(run, runMutatingCount);
    if (checkpointStatus) lines.push(checkpointStatus);
    if (run.safety) {
      lines.push("Safety: " + readableSafetyLabel(run.safety));
      if (run.safety.rawExtendscriptGate && run.safety.rawExtendscriptGate.status === "approved") {
        lines.push("Raw ExtendScript gate: approved by dry run " + (run.safety.rawExtendscriptGate.dryRunId || "ok") + ".");
      }
      if (run.safety.saveProjectFirst) lines.push("Save project first before mutating run.");
    }
    var printedCheckpoint = "";
    if (run.editSession) {
      lines.push("Edit session: " + (run.editSession.label || run.editSession.id || "started"));
      if (run.editSession.checkpoint && run.editSession.checkpoint.checkpointFile) {
        printedCheckpoint = run.editSession.checkpoint.checkpointFile;
        lines.push("Checkpoint: " + printedCheckpoint);
      }
    }
    if (run.checkpoint && run.checkpoint.checkpointFile && run.checkpoint.checkpointFile !== printedCheckpoint) {
      lines.push("Checkpoint: " + run.checkpoint.checkpointFile);
    }
    if (run.editSessionFinished) {
      lines.push("Edit session finished: " + (run.editSessionFinished.outcome || "completed"));
    }
    if (run.warnings && run.warnings.length) {
      lines.push("Warnings: " + run.warnings.join("; "));
    }
    if (run.artifacts && run.artifacts.candidate && run.artifacts.candidate.path) {
      lines.push("Candidate saved for typed-tool review: " + run.artifacts.candidate.path);
    }
    var recoveryHint = recoveryHintForRun(run, runMutatingCount);
    if (recoveryHint) lines.push("Recovery: " + recoveryHint);
    var semanticText = !run.dryRun ? formatSemanticVerification(run.semanticVerification) : "";
    if (semanticText) lines.push(semanticText);
    if (runSteps.length) {
      lines.push("Steps:");
      for (var i = 0; i < runSteps.length; i++) {
        var step = runSteps[i] || {};
        lines.push((i + 1) + ". " + (step.title || step.tool || "Step") + " - " + step.status);
        if (step.targetSummary) lines.push("   target: " + step.targetSummary);
        if (step.reason) lines.push("   " + step.reason);
        if (step.error) lines.push("   " + step.error);
        if (step.result) {
          if (step.result.name) lines.push("   result: " + step.result.name);
          if (typeof step.result.removedCount === "number") lines.push("   removed: " + step.result.removedCount);
          if (step.result.verification) {
            var verification = step.result.verification;
            lines.push("   verification: " + (verification.ok ? "ok" : "needs review"));
            if (verification.comp && verification.comp.name) lines.push("   verified comp: " + verification.comp.name);
            if (verification.warnings && verification.warnings.length) {
              lines.push("   verification warning: " + verification.warnings.join("; "));
            }
          }
          if (step.result.mutation && step.result.mutation.undoHint) {
            lines.push("   restore: " + step.result.mutation.undoHint);
          }
        }
      }
    }
    return lines.join("\n");
  }

  var activeAmeQueueFrame=null;

  var AME_QUEUE_DECLARATION="Сейчас проверил всю очередь AME: содержит только показанное 1 готовое задание и перечисленные завершённые owned-задания; других готовых, ожидающих или неизвестных заданий нет; понимаю, API полный состав не проверяет, запуск общий.";

  function ameQueueFrameCurrent(frame) {
    return frame && frame===activeAmeQueueFrame && frame.alive && Date.now()>=frame.issuedAt && Date.now()-frame.issuedAt<120000 &&
      frame.epoch===panelLifecycleEpoch && frame.generation===String(panelConnectionGeneration) && frame.url===getBaseUrl() && frame.token===getToken() && currentBridgePlanMatchesPins(currentBridgePlan,frame.pins);
  }

  function runLastPlan(dryRun, fresh, onDone, policy) {
    policy=policy || {prepare:true};
    function fail(code,message,unknown) {
      if(policy.manualGesture)policy.manualGesture.alive=false;
      if(planRunInFlightMode==="prepare") planRunInFlightMode="";
      if(ownedPlanPreparationMode) {ownedCompletedDryRunCache=null;lastAcceptedDryRun=null;}
      setPlanRunStatus(message || code,"blocked");
      if(onDone) onDone({code:code,message:message || code,rejected:!unknown,isUnknown:!!unknown});
    }
    if(ownedPollingSession && !ownedPollingActorCurrent(ownedPollingSession)) closeOwnedPolling("owned_original_poll_actor_changed");
    if(ownedPollingClosed) {fail("owned_transport_reconciliation_required","Owned transport закрыт; требуется сверка исходной сессии.",true);return;}
    if (!fresh && !(!dryRun && ownedCompletedDryRunCacheMatches(policy.pins))) {
      var clicked=m100ActionProposalForResult(lastPlanResult);
      if (!clicked) {fail("proposal_missing","No backend action proposal ready");return;}
      refreshCurrentBridgePlan({fresh:true,expectedActionId:clicked.actionId,expectedPlanPins:policy.pins},function(error) {
        if(error || !currentBridgePlan || currentBridgePlan.actionId !== clicked.actionId) {
          fail("plan_pins_mismatch",error && error.message || "План изменился. Просмотрите актуальную версию.");return;
        }
        runLastPlan(dryRun,true,onDone,policy);
      });
      return;
    }
    var proposal=m100ActionProposalForResult(lastPlanResult);
    if(planRequestInFlight || !lastPlanResult || !lastPlanResult.plan || !proposal) {fail("proposal_missing","No backend action proposal ready");return;}
    if(policy.pins && !currentBridgePlanMatchesPins(currentBridgePlan,policy.pins)) {fail("plan_pins_mismatch","План на сервере изменился. Просмотрите актуальную версию.");return;}
    var blocked=currentProposalBlockReason(proposal);
    if(blocked) {fail("proposal_blocked",blocked);return;}
    if(proposal.confirmation.confirmationToken && policy.strict &&
       (proposal.confirmation.surface !== "cep-panel" || proposal.confirmation.sessionId !== m100ConfirmationSessionId())) {
      fail("confirmation_session_mismatch","Proposal confirmation belongs to a different panel connection session.");return;
    }
    if(!proposal.confirmation.confirmationToken) {
      if(!policy.prepare) {fail("proposal_adoption_required","Prepare the proposal and inspect the resulting new pins before execution.");return;}
      var adoptEpoch=panelLifecycleEpoch, adoptGeneration=panelConnectionGeneration, adoptInstanceId=currentBridgePlan.instanceId;
      var ownedPreparation=ownedCompletedDryRunPromised(currentBridgePlan),originalPins=currentBridgePlanPins(currentBridgePlan),
        originalPlanKey=currentPlanKey(),originalValidationKey=planKeyFor(currentBridgePlan.validation),
        originalProposalKey=ownedTokenlessProposalKey(currentBridgePlan.proposal),originalActor=ownedPreparation && ownedPanelActor();
      if(policy.context && !policy.context.submit()) return;
      var adoptionBody={actionId:proposal.actionId,revision:currentBridgePlan.revision,
        panelConnectionId:panelConnectionId,panelGeneration:String(panelConnectionGeneration),confirmationSessionId:m100ConfirmationSessionId()};
      if(ownedPreparation) {adoptionBody.panelInstanceId=originalActor.panelInstanceId;adoptionBody.panelLifecycleEpoch=originalActor.panelLifecycleEpoch;
        rememberPlanRun(null);planRunInFlightMode="prepare";}
      request("POST","/agents/plan/adopt",adoptionBody,function(error,response) {
        if(adoptEpoch !== panelLifecycleEpoch || adoptGeneration !== panelConnectionGeneration) {fail("lifecycle_interrupted","Connection changed during adoption.",true);return;}
        if(ownedPollingClosed) {fail("owned_transport_reconciliation_required","Owned transport closed during adoption.",true);return;}
        if(error) {planRunInFlightMode="";setPlanRunStatus(error.message,"blocked");if(onDone) onDone(error,response);return;}
        if(ownedPreparation) {
          if(!currentBridgePlanMatchesPins(currentBridgePlan,originalPins) || currentPlanKey()!==originalPlanKey ||
              !ownedCompletedDryRunValid(response,originalPins,originalPlanKey,originalValidationKey,originalProposalKey,originalActor)) {
            fail("completed_native_dry_run_invalid","Завершённый native dry-run не совпадает с исходным proposal. Подготовка закрыта.");return;
          }
          planRunInFlightMode="";invalidateCurrentPlanSyncAfterOwnedAdoption();
          if(adoptEpoch!==panelLifecycleEpoch || adoptGeneration!==panelConnectionGeneration ||
              !ownedCompletedDryRunValid(response,originalPins,originalPlanKey,originalValidationKey,originalProposalKey,originalActor)) {
            fail("lifecycle_interrupted","Connection changed while closing the earlier current read.",true);return;
          }
          currentBridgePlan=response.current;currentPlanSyncAt=Date.now();
          lastPlanResult={plan:response.plan,planValidation:response.validation,requestId:response.proposal.requestId,
            m100ActionProposal:response.proposal,bridgePlanPins:originalPins};
          var completedRun=response.completedDryRun;
          rememberPlanRun(completedRun);
          ownedCompletedDryRunCache={runId:completedRun.id,pins:JSON.parse(JSON.stringify(originalPins)),
            planKey:originalPlanKey,validationKey:originalValidationKey,proposalKey:originalProposalKey,
            actor:JSON.parse(JSON.stringify(originalActor))};
          renderCurrentBridgePlan();updatePlanControls();showPlanResult("assistant",formatPlanRun(completedRun));
          showPlanRunFinishedStatus(true,completedRun,false);
          if(onDone) onDone(null,{run:completedRun,runId:completedRun.id,executionRequested:false,executed:false,
            acceptedDryRunId:completedRun.id,pins:currentBridgePlanPins(currentBridgePlan)});
          return;
        }
        if(response && (ownedCompletedDryRunPromised(response.current) || response.completedDryRun)) {
          fail("completed_native_dry_run_unexpected","Native dry-run не был обещан текущим proposal. Подготовка закрыта.");return;
        }
        var adoptedProposal=normalizeM100ActionProposal(response && response.proposal),adoptedPlan=response && response.plan;
        var adoptedPins=currentBridgePlanPins({instanceId:adoptInstanceId,revision:adoptedProposal && adoptedProposal.revision,
          actionId:adoptedProposal && adoptedProposal.actionId,proposal:adoptedProposal,plan:adoptedPlan,validation:response && response.validation,
          state:"pending",expiresAt:adoptedProposal && adoptedProposal.confirmation.proposalExpiresAt,
          project:{expectedFile:adoptedPlan && adoptedPlan.targetProject && adoptedPlan.targetProject.file || ""}});
        if(!adoptedPins || !adoptedProposal.confirmation.confirmationToken || response.revision !== undefined && response.revision !== adoptedPins.revision) {
          fail("adoption_pins_invalid","План на сервере изменился. Просмотрите актуальную версию.");return;
        }
        lastPlanResult={plan:response.plan,planValidation:response.validation,requestId:adoptedProposal.requestId,
          m100ActionProposal:adoptedProposal,bridgePlanPins:adoptedPins};
        lastAcceptedDryRun=null;
        refreshCurrentBridgePlan({fresh:true,expectedActionId:adoptedProposal.actionId,expectedPlanPins:adoptedPins},function(syncError) {
          if(syncError) {fail("plan_pins_mismatch",syncError.message || "Не удалось обновить план");return;}
          runLastPlan(true,true,onDone,{prepare:true,pins:adoptedPins,context:policy.context,strict:policy.strict});
        });
      });
      return;
    }
    var validation=lastPlanResult.planValidation || {}, accepted=lastAcceptedDryRun;
    if(!dryRun && policy.strict && (!accepted || !accepted.ok || !accepted.runId || accepted.planKey !== currentPlanKey() ||
        accepted.requestId !== proposal.requestId || !currentBridgePlanMatchesPins(currentBridgePlan,accepted.pins))) {
      fail("matching_dry_run_required","An accepted dry-run matching the current canonical plan is required.");return;
    }
    if(!dryRun && classificationBlocksRun(validation) && !rawExtendscriptDryRunGateReady(validation)) {
      fail("raw_dry_run_required","Protected raw execution requires the matching accepted raw dry-run.");return;
    }
    var steps=lastPlanResult.plan.steps || [],queueArgs=steps.length===1 && steps[0].tool==="start_ame_title_batch" && steps[0].args;
    var queueRun=!dryRun && queueArgs && queueArgs.manualQueueMode==="cep_user_declaration_v2",queueFrame=policy.ameQueueFrame;
    if(queueRun) {
      if(!ameQueueFrameCurrent(queueFrame)) {fail("ame_manual_queue_trusted_gesture_required","Для AME требуется настоящий щелчок Run plan и проверка всей очереди в защищённом подтверждении.");return;}
      if(!accepted || !accepted.ok || !accepted.runId || accepted.planKey!==currentPlanKey() || !currentBridgePlanMatchesPins(currentBridgePlan,accepted.pins)) {fail("matching_dry_run_required","Для AME требуется принятый dry-run текущего плана.");return;}
      if(!queueFrame.manifestConfirmed) {
        request("POST","/tools/call",{name:"inspect_ame_title_queue_manifest",arguments:{targetSpecifier:queueArgs.targetSpecifier,expectedProcess:queueArgs.expectedProcess,
          expectedSessionNonce:queueArgs.expectedSessionNonce,batchId:queueArgs.batchId,manualQueueMode:queueArgs.manualQueueMode,completedOwnedPrefix:queueArgs.completedOwnedPrefix}},function(error,response) {
          var observed=null;try {if(response && response.result && !response.result.isError) observed=JSON.parse(response.result.content[0].text);} catch(_ameParse) {}
          if(error || !ameQueueFrameCurrent(queueFrame) || !observed || observed.ok!==true || observed.manifestHash!==queueArgs.manualQueueManifestSha25664 || observed.declaration!==AME_QUEUE_DECLARATION || !observed.manifest || observed.manifest.schema!=="ae-agent-ame-manual-queue-manifest.v2" || observed.manifest.jobs.length!==1) {
            queueFrame.alive=false;fail("ame_manual_queue_manifest_changed","Очередь или привязки изменились. START не отправлен.");return;
          }
          var lines=["Проверьте всю очередь в AME перед общим запуском:","Manifest: "+observed.manifestHash];
          if(observed.manifest.process) lines.push("AME: "+observed.manifest.process.path,"PID / started: "+observed.manifest.process.pid+" / "+observed.manifest.process.startedAt,"Native session: "+observed.manifest.nativeSessionNonce,"Wrapper session: "+observed.manifest.retainedWrapperSessionNonce);
          function shown(job,label) {lines.push(label+" · "+job.jobId,"AEP: "+job.source.path,"AEP SHA-256: "+job.source.sha25664,"GUID: "+job.source.guid,"EPR: "+job.preset.path,"EPR SHA-256: "+job.preset.sha25664,"Output: "+job.outputPath);if(job.range) lines.push("Range: "+job.range.startSeconds+" – "+job.range.endSeconds);}
          shown(observed.manifest.jobs[0],"Готовое задание");
          observed.manifest.completedOwnedPrefix.forEach(function(job) {shown(job,"Завершённое owned-задание");});
          lines.push("",AME_QUEUE_DECLARATION);
          if(!window.confirm(lines.join("\n"))) {queueFrame.alive=false;fail("ame_manual_queue_declaration_cancelled","Подтверждение AME отменено.");return;}
          if(!ameQueueFrameCurrent(queueFrame)) {queueFrame.alive=false;fail("ame_manual_queue_binding_changed","Контекст панели изменился. START не отправлен.");return;}
          queueFrame.manifestConfirmed=true;queueFrame.manifestHash=observed.manifestHash;queueFrame.acceptedDryRunId=accepted.runId;
          runLastPlan(false,true,onDone,policy);
        });return;
      }
    }
    var mutatingCount=Number(validation.mutatingCount || 0), allowMutations=!dryRun && mutatingCount>0;
    var allowRawExtendscript=!dryRun && rawExtendscriptDryRunGateReady(validation);
    var body={actionId:proposal.actionId,payloadRef:proposal.action.payloadRef,payloadHash:proposal.action.payloadHash,
      previewHash:proposal.action.previewHash,riskLevel:proposal.risk.level,riskPolicyVersion:proposal.confirmation.riskPolicyVersion,
      requestId:proposal.requestId,dryRun:dryRun,confirm:!dryRun,allowMutations:allowMutations,autoEditSession:allowMutations,timeoutMs:120000};
    if(!dryRun) {body.confirmationToken=proposal.confirmation.confirmationToken;body.confirmedBySurface=proposal.confirmation.surface;
      body.confirmedBySession=proposal.confirmation.sessionId || m100ConfirmationSessionId();}
    if(allowRawExtendscript) {body.allowRawExtendscript=true;body.rawExtendscriptDryRunId=accepted.runId;}
    if(queueRun) {body.ameManualQueueWitness={manifestHash:queueFrame.manifestHash,acceptedDryRunId:queueFrame.acceptedDryRunId,declaration:AME_QUEUE_DECLARATION,
      panelConnectionId:panelConnectionId,panelGeneration:String(panelConnectionGeneration),trustedGesture:true};queueFrame.alive=false;}
    if(!dryRun && !queueRun && !manualRunGestureCurrent(policy.manualGesture)){fail("manual_run_gesture_required","Требуется свежее ручное подтверждение текущего плана.");return;}
    if(policy.context && !policy.context.submit()) return;
    if(!dryRun && !queueRun)policy.manualGesture.alive=false;
    var runEpoch=panelLifecycleEpoch,runGeneration=panelConnectionGeneration;
    planRunInFlightMode=dryRun?"dry-run":"run";rememberPlanRun(null);setPlanBusy(true,dryRun?"Dry run":"Running");
    request("POST",queueRun?"/agents/ame/title-start/run":"/agents/plan/run",body,function(error,response) {
      if(runEpoch !== panelLifecycleEpoch || runGeneration !== panelConnectionGeneration) {fail("lifecycle_interrupted","Connection changed during execution.",true);return;}
      planRunInFlightMode="";setPlanBusy(false);currentPlanSyncAt=0;
      var run=response && response.run || error && error.body && error.body.run || null;
      if(run) {
        rememberPlanRun(run);updatePlanControls();showPlanResult("assistant",formatPlanRun(run));
        showPlanRunFinishedStatus(dryRun,run,!!error || run.ok !== true);
        if(run.id) log("Plan run "+run.id+" finished");
      } else if(error) {
        showPlanResult("error",error.message);showPlanRunFinishedStatus(dryRun,null,true);
        log("Plan run failed: "+error.message);
      }
      var execution=run && run.outcome && run.outcome.execution,mutation=run && run.outcome && run.outcome.mutation;
      var executed=dryRun ? false : execution && execution.status === "not_started" ? false
        : run && (run.ok === true || execution && execution.status === "completed" || mutation && mutation.status === "applied") ? true
        : !run && error && error.status > 0 ? false : null;
      var outcome={run:run,runId:run && run.id,executionRequested:!dryRun,executed:executed,acceptedDryRunId:dryRun && run && run.ok ? run.id : null,
        pins:currentBridgePlanPins(currentBridgePlan)};
      if(error || !run || run.ok !== true) {
        var failed=error || {code:run && (run.errorCode || run.code) || "plan_run_failed",message:run && run.error || "Runner did not return an accepted result."};
        if(onDone) onDone(failed,outcome);return;
      }
      // Completion is the actual runner result; canonical refresh is a separate observable read.
      if(onDone) onDone(null,outcome);
    });
  }

  function clearActiveEvalScriptCommand(id) {
    if (!id || activeEvalScriptCommandId === id) {
      activeEvalScriptCommandId = "";
    }
  }

  function postResult(command, ok, result, error, onDone) {
    var owner = commandLeaseOwner(command);
    request("POST", "/bridge/result", {
      id: command.id,
      executionId: command.executionId,
      leaseId: command.leaseId,
      contractVersion: 2,
      panelConnectionId: owner.panelConnectionId,
      panelGeneration: owner.panelGeneration,
      ok: ok,
      result: result,
      error: error
    }, function (postError,response) {
      if(!postError && (!response || response.ok!==true)) postError={message:"Original result ACK missing"};
      if (postError) {
        log("Could not post result: " + postError.message);
      }
      if (onDone) onDone(!postError);
    });
  }

  function commandLeaseOwner(command) {
    var owner = command && command.leaseOwner ? command.leaseOwner : {};
    return {
      panelConnectionId: owner.panelConnectionId || panelConnectionId,
      panelGeneration: owner.panelGeneration || String(panelConnectionGeneration || 0)
    };
  }

  function markCommandSubmitted(command, onDone) {
    var owner = commandLeaseOwner(command);
    request("POST", "/bridge/submitted", {
      id: command.id,
      executionId: command.executionId,
      leaseId: command.leaseId,
      contractVersion: 2,
      panelConnectionId: owner.panelConnectionId,
      panelGeneration: owner.panelGeneration
    }, function (error,response) {
      if(!error && (!response || response.ok!==true)) error={message:"Original submission ACK missing"};
      if (error) {
        log("Could not mark command submitted: " + error.message);
        onDone(false);
        return;
      }
      onDone(true);
    });
  }

  function executeCommand(command) {
    if(recoveryTransportScope){
      var tag=command.generatedRecoveryRead;
      if(!tag || tag.scopeId!==recoveryTransportScope.scopeId || tag.originalRequestId!==recoveryTransportScope.originalRequestId || tag.runId!==recoveryTransportScope.runId || !(recoveryTransportScope.profile==="common-title-assembly" ? tag.tool==="common_title_assembly_verify" : /^(get_project_info|get_comp_details)$/.test(tag.tool))){
        stopRecoveryTransport("generated_recovery_foreign_command");return;
      }
    }
    if (command.contractVersion !== 2 || !command.executionId || !command.leaseId) {
      log("Bridge execution contract mismatch: update the bridge and panel together."); return;
    }
    if (activeEvalScriptCommandId || !physicalEvalScriptIdle()) {
      log("Skipping command " + command.id + " while command " + activeEvalScriptCommandId + " is still active");
      return;
    }
    activeEvalScriptCommandId = command.id;
    var capturedActor=deliveryActor(),capturedUrl=getBaseUrl(),capturedToken=getToken();
    var ownedSession=ownedPollingSession,ownedCommand=ownedSession && ownedSession.command;
    log("Executing command " + command.id);
    markCommandSubmitted(command, function (submitted) {
      // Applies equally to ordinary and retained delivery. An ACK arriving
      // after disconnect/reconnect must never submit old script to the host.
      if(!running || !sameDeliveryActor(capturedActor,deliveryActor()) || getBaseUrl()!==capturedUrl || getToken()!==capturedToken)return;
      if(ownedSession) {
        if(!submitted || !ownedPollingActorCurrent(ownedSession) || !ownedCommand || ownedSession.command!==ownedCommand || ownedCommand.id!==command.id) {
          closeOwnedPolling("owned_original_command_submission_unknown");return;
        }
        ownedCommand.phase="submitted";panelHeartbeatAt=Date.now();
      }
      if (!submitted) {
        clearActiveEvalScriptCommand(command.id);
        return;
      }
      physicalEvalScript(command.script, function (result) {
        if(!running || !sameDeliveryActor(capturedActor,deliveryActor()) || getBaseUrl()!==capturedUrl || getToken()!==capturedToken)return;
        if(ownedSession) {
          if(!ownedPollingActorCurrent(ownedSession) || ownedSession.command!==ownedCommand) {closeOwnedPolling("owned_original_command_actor_changed");return;}
          if(ownedCommand.phase!=="submitted") return;
          ownedCommand.phase="posting";
        }
        if (typeof result === "string" && result.indexOf("EvalScript error.") === 0) {
          postResult(command, false, null, result, function (accepted) {
            if(ownedSession) finishOwnedCommand(command,accepted);else clearActiveEvalScriptCommand(command.id);
          });
          return;
        }
        postResult(command, true, result, null, function (accepted) {
          if(ownedSession) finishOwnedCommand(command,accepted);else clearActiveEvalScriptCommand(command.id);
        });
      });
    });
  }

  function stopRecoveryTransport(code) {
    // Cancels every response from the failed transport, including a held P2.
    // Historical receipts keep their original binding; no context is rebased.
    panelLifecycleEpoch += 1;
    ownedCompletedDryRunCache=null;lastAcceptedDryRun=null;ownedPlanPreparationMode="";
    running=false;pollInFlight=false;recoveryTransportConnecting=false;
    if(recoveryTransportScope)recoveryTransportScope.state="failed";
    if(pollTimer)clearTimeout(pollTimer);
    setStatus("Recovery transport stopped: "+code,false);
    log("Recovery transport stopped; a new canonical reconciliation is required: "+code);
    updatePlanControls();
  }

  function connectRecoveryTransport(value,config) {
    if (!bridgeHostAvailable()) return;
    if(panelLifecycleEpoch!==config.epoch || String(panelConnectionGeneration)!==config.generation || getBaseUrl()!==config.url || getToken()!==config.token || panelConnectionId!==config.panelConnectionId || value.panelConnectionId!==panelConnectionId || Date.parse(value.expiresAt)<=Date.now())return;
    recoveryTransportScope=value;recoveryTransportScope.state="connecting";recoveryTransportConnecting=true;
    running=true;panelLifecycleEpoch=value.nextBinding.panelLifecycleEpoch;panelConnectionGeneration=value.nextBinding.panelGeneration;
    ownedCompletedDryRunCache=null;lastAcceptedDryRun=null;ownedPlanPreparationMode="";
    pollInFlight=false;activeEvalScriptCommandId="";
    if(pollTimer)clearTimeout(pollTimer);
    var epoch=panelLifecycleEpoch,generation=panelConnectionGeneration;
    setStatus("Connecting read-only recovery transport...",false);updatePlanControls();
    request("GET",bridgeNextPath()+"&recoveryMode=1&recoveryScopeId="+encodeURIComponent(value.scopeId)+"&recoveryHandshake=1",null,function(error,response){
      if(panelLifecycleEpoch!==epoch || panelConnectionGeneration!==generation || recoveryTransportScope!==value || getBaseUrl()!==config.url || getToken()!==config.token)return;
      if(error || !response || response.command!==null || !response.recoveryTransport || response.recoveryTransport.scopeId!==value.scopeId || response.recoveryTransport.state!=="ready"){
        stopRecoveryTransport(error && error.code || "generated_recovery_handshake_invalid");return;
      }
      recoveryTransportConnecting=false;value.state="ready";setBridgeConnected();updatePlanControls();
      log("Read-only recovery transport connected. Start a new canonical reconciliation for "+value.runId+".");
      pollTimer=setTimeout(pollRecoveryTransport,50);
    });
  }

  function pollRecoveryTransport() {
    if (!bridgeHostAvailable()) return;
    var scope=recoveryTransportScope,epoch=panelLifecycleEpoch,generation=panelConnectionGeneration;
    if(!scope || !running || recoveryTransportConnecting || scope.state!=="ready")return;
    if(Date.parse(scope.expiresAt)<=Date.now()){stopRecoveryTransport("generated_recovery_scope_expired");return;}
    if(pollInFlight || activeEvalScriptCommandId){pollTimer=setTimeout(pollRecoveryTransport,100);return;}
    pollInFlight=true;
    request("GET",bridgeNextPath()+"&recoveryMode=1&recoveryScopeId="+encodeURIComponent(scope.scopeId),null,function(error,response){
      if(panelLifecycleEpoch!==epoch || panelConnectionGeneration!==generation || recoveryTransportScope!==scope)return;
      pollInFlight=false;
      if(error){stopRecoveryTransport(error.code || "generated_recovery_poll_failed");return;}
      if(response && response.command)executeCommand(response.command);
      if(running && scope.state==="ready")pollTimer=setTimeout(pollRecoveryTransport,50);
    });
  }

  function initialAutomaticStartupCurrent(startup) {
    return !!startup && startup === initialAutomaticStartup && startup.epoch === panelLifecycleEpoch &&
      startup.generation === panelConnectionGeneration && startup.url === getBaseUrl() && startup.token === getToken();
  }

  function closeInitialAutomaticStartup(startup, reason) {
    if (!startup || /^(closed|superseded|succeeded)$/.test(startup.state)) return;
    if (initialAutomaticStartupCurrent(startup)) {
      running = false;
      pollInFlight = false;
      if (pollTimer) clearTimeout(pollTimer);
    }
    startup.state = "closed";
    startup.reason = reason || "startup_interrupted";
    log("Automatic connection stopped: " + startup.reason);
  }

  function poll(onDone) {
    if(ownedPollingClosed) {if(onDone) onDone({isUnknown:true,code:"owned_transport_reconciliation_required"});return;}
    if (!bridgeHostAvailable(onDone)) return;
    if(recoveryTransportScope){pollRecoveryTransport();return;}
    if (!running) {if(onDone) onDone({rejected:true,code:"bridge_disconnected"});return;}
    if(ownedPollingSession && !ownedPollingActorCurrent(ownedPollingSession)) {closeOwnedPolling("owned_original_poll_actor_changed");return;}
    if (panelLifecycleGuard) {pollTimer=setTimeout(poll,100);return;}
    if (pollInFlight) return;
    if (activeEvalScriptCommandId) {
      if(ownedPollingSession) {
        var heartbeatSession=ownedPollingSession,heartbeatCommand=heartbeatSession.command;
        if(!heartbeatCommand || heartbeatCommand.id!==activeEvalScriptCommandId) {closeOwnedPolling("owned_original_command_owner_changed");return;}
        if(heartbeatCommand.phase==="submitted" && !heartbeatCommand.heartbeatInFlight && Date.now()-panelHeartbeatAt>=5000) {
          heartbeatCommand.heartbeatInFlight=true;panelHeartbeatAt=Date.now();
          heartbeatSession.heartbeatXhr=request("GET",bridgeNextPath().replace("/bridge/next?","/bridge/heartbeat?"),null,function(error,response) {
            heartbeatCommand.heartbeatInFlight=false;heartbeatSession.heartbeatXhr=null;
            if(!ownedPollingActorCurrent(heartbeatSession) || heartbeatSession.command!==heartbeatCommand) return;
            if(error || !response || response.ok!==true) {closeOwnedPolling("owned_original_command_heartbeat_unknown");return;}
            autonomousSessionState=response.session;renderAutonomousSession();
            if(heartbeatCommand.phase==="acknowledged") finishOwnedCommand(heartbeatCommand.originalCommand,true);
          });
        }
        pollTimer=setTimeout(poll,500);return;
      }
      if (Date.now() - panelHeartbeatAt >= 5000) {
        panelHeartbeatAt = Date.now();
        var heartbeatActor=deliveryActor(),heartbeatUrl=getBaseUrl(),heartbeatToken=getToken(),heartbeatReadId=activeEvalScriptCommandId;
        request("GET", bridgeNextPath().replace("/bridge/next?", "/bridge/heartbeat?"), null, function (error, response) {
          if(!sameDeliveryActor(heartbeatActor,deliveryActor())||heartbeatUrl!==getBaseUrl()||heartbeatToken!==getToken()||heartbeatReadId!==activeEvalScriptCommandId)return;
          if (error) { log("Panel heartbeat failed: " + error.message); return; }
          if(response&&response.bootstrapRecovery){beginBootstrapRecoveryEpoch(response.bootstrapRecovery);return;}
          autonomousSessionState = response && response.session;
          renderAutonomousSession();
        });
      }
      pollTimer = setTimeout(poll, 500);
      return;
    }
    var pollEpoch = panelLifecycleEpoch, pollGeneration = panelConnectionGeneration;
    var startup = initialAutomaticStartupCurrent(initialAutomaticStartup) && initialAutomaticStartup.state === "pending" ? initialAutomaticStartup : null;
    if (startup && startup.consumed) return;
    // Consume before evalScript: an absent callback is UNKNOWN and cannot replay.
    if (startup) startup.consumed = true;
    pollInFlight = true;
    try {
    physicalEvalScript('(function(){return app.project && app.project.file ? String(app.project.file.fsName) : "";}())', function (projectFile) {
    if (pollEpoch !== panelLifecycleEpoch || pollGeneration !== panelConnectionGeneration) return;
    if (startup && (!initialAutomaticStartupCurrent(startup) || startup.state !== "pending" || startup.getAttempted)) return;
    if (!running) { pollInFlight = false; return; }
    if (startup && (typeof projectFile !== "string" || projectFile.indexOf("EvalScript error.") === 0)) {
      closeInitialAutomaticStartup(startup,"startup_project_read_unknown");
      if(onDone) onDone({isUnknown:true,code:"initial_project_file_unknown"});
      return;
    }
    if (startup) startup.getAttempted = true;
    var ownedPollSession=ownedPollingSession;
    var pollXhr=request("GET", bridgeNextPath(projectFile), null, function (error, response) {
      if(ownedPollSession) ownedPollSession.heldXhr=null;
      if(ownedPollSession && !ownedPollingActorCurrent(ownedPollSession)) {closeOwnedPolling("owned_original_poll_actor_changed");return;}
      if (pollEpoch !== panelLifecycleEpoch || pollGeneration !== panelConnectionGeneration) return;
      if (startup && (!initialAutomaticStartupCurrent(startup) || !/^(pending|closed)$/.test(startup.state))) return;
      pollInFlight = false;
      if (startup && (error || !response || typeof response !== "object" || startup.state === "closed")) {
        closeInitialAutomaticStartup(startup,"startup_bridge_next_failed");
        var startupError = error || {isUnknown:true,code:"initial_bridge_next_unknown"};
        var startupMessage = setBridgeOffline(startupError);
        if (startupMessage !== lastPollErrorMessage) {log(startupMessage);lastPollErrorMessage=startupMessage;}
        if(onDone) onDone(startupError);
        return;
      }
      if (!running) return;

      if (error) {
        if(ownedPollSession) {closeOwnedPolling("owned_original_poll_lost");if(onDone) onDone(error);return;}
        var message = setBridgeOffline(error);
        if (message !== lastPollErrorMessage) {
          log(message);
          lastPollErrorMessage = message;
        }
        if(onDone) onDone(error);
        pollTimer = setTimeout(poll, 1500);
        return;
      }

      if(response && response.bootstrapRecovery){if(onDone)onDone(null,{connected:false,bootstrapRecoveryPending:true});beginBootstrapRecoveryEpoch(response.bootstrapRecovery);return;}
      if(observeCoreMigrationResponse(response)){if(onDone)onDone(null,{connected:false,coreMigrationPending:true});return;}
      if(response && response.resetSession){if(onDone)onDone(null,{connected:false,resetPending:true});beginProductSessionReset(response.resetSession);return;}
      if(response && response.resetSessionActivation){var activationAdoption=acceptProductSessionResetActivation(response.resetSessionActivation);if(!activationAdoption.accepted){setStatus("Reset activation actor mismatch",false);return;}if(activationAdoption.transitioned)return;}
      if(ownedPollSession && (!response || response.ok!==true || !response.command)) {closeOwnedPolling("owned_original_poll_idle_response_invalid");return;}
      if(!ownedPollSession && ownedCompletedDryRunPromised(response) && !beginOwnedPolling(response)) {
        if(onDone) onDone({isUnknown:true,code:"owned_original_session_deadline_invalid"});return;
      }
      var shouldRefreshAgents = !!lastPollErrorMessage || (badgeEl && badgeEl.textContent !== "online") || !agents.length;
      if (startup) {startup.state = "succeeded";startup.reason="connected";}
      lastPollErrorMessage = "";
      setBridgeConnected();
      if(ownedCompletedDryRunPromised(response)) ownedPlanPreparationMode="completed_native_dry_run_v1";
      if(onDone) onDone(null,{connected:true,generation:String(panelConnectionGeneration)});
      if (!running || pollEpoch !== panelLifecycleEpoch || pollGeneration !== panelConnectionGeneration) return;
      if (!ownedPlanPreparationMode && !currentPlanSyncInFlight && Date.now() - currentPlanSyncAt > 1500) { refreshCurrentBridgePlan(); refreshAutonomousSession(); }
      if (shouldRefreshAgents) {

        if(!ownedPlanPreparationMode) refreshAutonomousSession();
        refreshPlaceholderProtection();
      }

      if (response && response.command) {
        if(ownedPollingSession && !beginOwnedCommand(response.command)) return;
        executeCommand(response.command);
      }

      if(!ownedPollingClosed) pollTimer = setTimeout(poll,ownedPollingSession && activeEvalScriptCommandId ? 500 : 50);
    });
    if(ownedPollSession) ownedPollSession.heldXhr=pollXhr;
    });
    } catch (error) {
      if(ownedPollingSession) {closeOwnedPolling("owned_original_project_file_unknown");if(onDone) onDone(error);return;}
      if (!startup) throw error;
      closeInitialAutomaticStartup(startup,"startup_project_read_unknown");
      if(onDone) onDone(error);
    }
  }

  function connect(onDone, startup, resetChecked, origin) {
    var resetState=window.AEAgentPanelActions && window.AEAgentPanelActions.state();
    if(!startup && !resetChecked && resetState && resetState.reconciliationRequired){
      var lookupActor=deliveryActor(),lookupUrl=getBaseUrl(),lookupToken=getToken();
      request("GET","/bridge/product-session?"+bridgeNextPath("",true).split("?")[1],null,function(error,response){
        if(!sameDeliveryActor(lookupActor,deliveryActor()) || getBaseUrl()!==lookupUrl || getToken()!==lookupToken){if(onDone)onDone({isUnknown:true,code:"product_reset_lookup_actor_changed"});return;}
        if(!error && response && (response.coreMigrationSession || response.coreMigrationSessionActivation)){if(observeCoreMigrationResponse(response)){if(onDone)onDone(null,{connected:false,coreMigrationPending:true});return;}connect(onDone,startup,true,origin);return;}
        if(error || !response || !response.resetSession && !response.resetSessionActivation){if(onDone)onDone(error||{code:"product_reset_session_required",message:"Historical action requires its original reconciliation or an explicit product reset."});return;}
        if(response.resetSession){if(onDone)onDone(null,{connected:false,resetPending:true});beginProductSessionReset(response.resetSession);return;}
        var adoption=acceptProductSessionResetActivation(response.resetSessionActivation);if(!adoption.accepted){if(onDone)onDone({rejected:true,code:"product_reset_activation_actor_mismatch"});return;}if(adoption.transitioned){if(onDone)onDone(null,{connected:true});return;}connect(onDone,startup,true,origin);
      });return;
    }
    if(ownedPollingSession || ownedPollingClosed) {
      closeOwnedPolling("owned_original_poll_lifecycle_changed");
      if(onDone) onDone({isUnknown:true,code:"owned_transport_reconciliation_required"});return;
    }
    if (startup && (!initialAutomaticStartupCurrent(startup) || startup.state !== "connecting" || startup.consumed)) return;
    if (!startup && initialAutomaticStartup && initialAutomaticStartup.state !== "succeeded") {
      initialAutomaticStartup.state = "superseded";initialAutomaticStartup.reason=origin==="explicit" ? "explicit_connect" : "internal_connect";
    }
    if (!bridgeHostAvailable(onDone)) return;
    var restoringRecovery=!!recoveryTransportScope;
    connectionStartupDiagnostics.lastConnectionOrigin=startup ? "automatic" : origin || "internal";
    recoveryTransportScope=null;recoveryTransportConnecting=false;
    if(pollTimer)clearTimeout(pollTimer);
    running = true;
    pollInFlight = false;
    try{panelConnectionGeneration = nextPanelConnectionGeneration();}catch(_){running=false;if(onDone)onDone({rejected:true,code:"delivery_epoch_fence_unreadable"});return;}
    panelLifecycleEpoch += 1;
    observeCausalRuntime(null,{code:"connection_changed"});
    lastPlanResult=null;currentBridgePlan=null;activeManualRunGesture=null;
    renderCurrentBridgePlan();updatePlanControls();
    try{rotateBootstrapDeliveryFence();}catch(_){running=false;if(onDone)onDone({rejected:true,code:"delivery_epoch_fence_unreadable"});return;}
    ownedCompletedDryRunCache=null;lastAcceptedDryRun=null;ownedPlanPreparationMode="";
    if (startup) {startup.epoch=panelLifecycleEpoch;startup.generation=panelConnectionGeneration;startup.state="pending";}
    currentPlanSyncInFlight = false;
    currentPlanSyncActiveReqId = 0;
    currentPlanSyncActiveEpoch = 0;
    if (currentPlanSyncWaiters && currentPlanSyncWaiters.length) {
      var oldWaiters = currentPlanSyncWaiters;
      currentPlanSyncWaiters = [];
      var resetError = makeBridgeOfflineError("Connection lifecycle reset");
      for (var ow = 0; ow < oldWaiters.length; ow++) {
        try { oldWaiters[ow].onDone(resetError); } catch (_err) {}
      }
    } else {
      currentPlanSyncWaiters = [];
    }
    autonomousSessionState = null;
    renderAutonomousSession();
    activeEvalScriptCommandId = "";
    lastPollErrorMessage = "";
    if(!restoringRecovery && !startup){localStorage.setItem("codexAeBridgeUrl", urlEl.value);
      localStorage.setItem("codexAeBridgeToken", tokenEl.value);
      localStorage.setItem("codexAeBridgeAutoConnect", "1");}
    setStatus("Connecting...", false);
    setBridgeHelp("Connecting to the local bridge...", "");
    refreshAppTitle();
    if(!restoringRecovery){}
    log("Connecting to " + getBaseUrl());
    poll(onDone);
  }

  function disconnect() {
    observeCausalRuntime(null,{code:"connection_changed"});
    if(ownedPollingSession) closeOwnedPolling("owned_original_poll_lifecycle_changed");
    ownedCompletedDryRunCache=null;lastAcceptedDryRun=null;ownedPlanPreparationMode="";
    lastPlanResult=null;currentBridgePlan=null;activeManualRunGesture=null;
    renderCurrentBridgePlan();updatePlanControls();
    recoveryTransportConnecting=false;recoveryTransportScope=null;
    running = false;
    pollInFlight = false;
    activeEvalScriptCommandId = "";
    lastPollErrorMessage = "";

    autonomousSessionState = null;
    renderAutonomousSession();
    if (pollTimer) clearTimeout(pollTimer);
    panelLifecycleEpoch += 1;
    currentPlanSyncInFlight = false;
    currentPlanSyncActiveReqId = 0;
    currentPlanSyncActiveEpoch = 0;
    if (currentPlanSyncWaiters && currentPlanSyncWaiters.length) {
      var syncWaiters = currentPlanSyncWaiters;
      currentPlanSyncWaiters = [];
      var disconnectError = makeBridgeOfflineError("Bridge disconnected");
      for (var w = 0; w < syncWaiters.length; w++) {
        try { syncWaiters[w].onDone(disconnectError); } catch (_err) {}
      }
    }
    localStorage.setItem("codexAeBridgeAutoConnect", "0");
    setStatus("Disconnected", false);
    setBridgeHelp("Disconnected. Click Connect when the bridge is running.", "");
    log("Disconnected");
  }

  function reloadNonce() {
    return String(Date.now()) + "-" + String(Math.random()).slice(2);
  }

  function reloadTargetUrl() {
    var href = String(window.location.href || "");
    var baseUrl = href.split("#")[0].split("?")[0];
    if (!baseUrl) return "index.html";
    if (!/index\.html$/i.test(baseUrl)) {
      baseUrl = baseUrl.replace(/\/?$/, "/index.html");
    }
    var nonce = reloadNonce();
    return baseUrl +
      "?v=" + encodeURIComponent(APP_VERSION) +
      "&assets=" + encodeURIComponent(nonce) +
      "&reload=" + encodeURIComponent(nonce);
  }

  function reloadApp() {
    if(ownedPollingSession) closeOwnedPolling("owned_original_poll_lifecycle_changed");
    ownedCompletedDryRunCache=null;lastAcceptedDryRun=null;ownedPlanPreparationMode="";
    running = false;
    pollInFlight = false;
    activeEvalScriptCommandId = "";

    if (pollTimer) clearTimeout(pollTimer);
    if (reloadButton) {
      reloadButton.disabled = true;
      reloadButton.textContent = "Reloading...";
    }
    var targetUrl = reloadTargetUrl();
    log("Reloading app from " + targetUrl);
    try {
      window.location.replace(targetUrl);
    } catch (_replaceError) {
      window.location.href = targetUrl;
    }
  }

  function panelActionBusy(coveredBootstrapRead) {
    var activeNative=activeEvalScriptCommandId && !(coveredBootstrapRead && bootstrapCoveredLogicalRead(activeEvalScriptCommandId,coveredBootstrapRead));
    return !!(recoveryTransportConnecting || planRequestInFlight || activeNative || placeholderProtectionInFlight || planReconcileInFlight || planRunInFlightMode);
  }

  function rememberPanelSecrets() {
    var contract=window.AEAgentPanelContract;contract.rememberSecret(getToken());
    var proposal=m100ActionProposalForResult(lastPlanResult);if(proposal)contract.rememberSecret(proposal.confirmation.confirmationToken);
  }

  function panelActionSnapshot() {
    rememberPanelSecrets();
    return {assetVersion:APP_VERSION,connected:running && badgeEl.textContent === "online",running:running,
      connectionStartup:{automaticAttempts:connectionStartupDiagnostics.automaticAttempts,
        explicitAttempts:connectionStartupDiagnostics.explicitAttempts,lastOrigin:connectionStartupDiagnostics.lastOrigin,
        lastConnectionOrigin:connectionStartupDiagnostics.lastConnectionOrigin,
        automatic:initialAutomaticStartup ? {state:initialAutomaticStartup.state,reason:initialAutomaticStartup.reason || null,
          consumed:initialAutomaticStartup.consumed===true,getAttempted:initialAutomaticStartup.getAttempted===true,
          waits:initialAutomaticStartup.waits || 0,requestId:initialAutomaticStartup.requestId || null,
          current:initialAutomaticStartupCurrent(initialAutomaticStartup)} : null},
      pollInFlight:pollInFlight,productResetRecoveryOnly:false,
      nativeBusy:panelActionBusy(),physicalInflight:physicalEvalScriptIdle() ? 0 : 1,
      bridgeConnection:{panelConnectionId:panelConnectionId},
      recoveryTransport:recoveryTransportScope ? {scopeId:recoveryTransportScope.scopeId,connecting:recoveryTransportConnecting,state:recoveryTransportScope.state || "connecting",freshReconcileRequired:true} : null,

      autonomy:autonomousSessionState ? {desiredEnabled:autonomousSessionState.desiredEnabled === true,
        effective:autonomousSessionState.connectionReady === true && autonomousSessionState.desiredEnabled === true,
        connectionReady:autonomousSessionState.connectionReady === true} : null,

      plan:{pins:currentBridgePlanPins(currentBridgePlan),state:currentBridgePlan && currentBridgePlan.state,
        validation:lastPlanResult && lastPlanResult.planValidation,acceptedDryRun:lastAcceptedDryRun,
        lastRun:lastPlanRunResult && {id:lastPlanRunResult.id,ok:lastPlanRunResult.ok,dryRun:lastPlanRunResult.dryRun,
          errorCode:lastPlanRunResult.errorCode,outcome:lastPlanRunResult.outcome}},

      preferences:{

        autoConnect:localStorage.getItem("codexAeBridgeAutoConnect") !== "0"}};
  }

  function actionAvailability(name,args) {
    var reasons=[],passive=name === "plan.current" && !(args && args.fresh);
    if(!passive && !hostStartupGuard.isAllowed())reasons.push(hostStartupGuard.snapshot().code);
    if(!passive && panelActionBusy())reasons.push("panel_busy");
    if(ownedPollingClosed && (name === "bridge.connect" || /^plan\.(prepare|dryRun|run)$/.test(name)))reasons.push("owned_transport_reconciliation_required");
    if(name === "bridge.configure" && running)reasons.push("disconnect_required");
    if(/^(autonomy|placeholder|plan)\./.test(name) && !running && name !== "plan.current" &&
      !(name === "plan.reconcile" && knownUnresolvedPlanRun(args && args.runId)))reasons.push("bridge_disconnected");
    if(/^plan\.(prepare|dryRun|run)$/.test(name)){
      if(!currentBridgePlanPins(currentBridgePlan))reasons.push("canonical_plan_unavailable");
      var proposal=m100ActionProposalForResult(lastPlanResult);
      if(name === "plan.run" && !(proposal && proposal.confirmation.confirmationToken))reasons.push("proposal_adoption_required");
      if(name === "plan.run" && (!lastAcceptedDryRun || !lastAcceptedDryRun.ok))reasons.push("matching_dry_run_required");
    }
    if(name === "plan.reconcile" && !knownUnresolvedPlanRun(args && args.runId) &&
      (!lastPlanRunResult || !lastPlanRunResult.id || lastPlanRunResult.dryRun || !lastPlanRunResult.validation || !lastPlanRunResult.validation.mutatingCount))reasons.push("reconciliation_unavailable");
    return {available:reasons.length===0,reasonCodes:reasons};
  }

  function panelLifecycleIdle(onDone, allowFreshProjectRead) {
    if(panelActionBusy()) {onDone({rejected:true,code:"panel_busy"});return;}
    // Freeze command acquisition during the status check; active commands remain protected.
    var paused=panelLifecycleGuard;
    panelLifecycleGuard=true;
    request("POST","/tools/call",{name:"get_bridge_status",arguments:{}},function(error,response) {
      var status=null;
      try {if(response && response.result && !response.result.isError) status=JSON.parse(response.result.content[0].text);} catch(_parseError) {}
      if(error || !status) {panelLifecycleGuard=paused;onDone(error || {rejected:true,code:"bridge_idle_unknown",message:"Fresh bridge status is unavailable."});return;}
      if(!status.projectLifecycle || typeof status.projectLifecycle.blocked !== "boolean") {
        panelLifecycleGuard=paused;onDone({rejected:true,code:"bridge_idle_unknown",message:"Lifecycle status is unavailable."});return;
      }
      var lifecycle=status.projectLifecycle;
      var pending=status.pendingCommands, inflight=status.inflightCommands;
      var freshRead=allowFreshProjectRead === true && lifecycle.enabled === true && lifecycle.blocked === true &&
        lifecycle.problem === "lifecycle_store_missing" && lifecycle.generation === 0 && lifecycle.freshMissingStoreReadAllowed === true;
      var idle=typeof pending === "number" && pending === 0 && Array.isArray(inflight) && inflight.length === 0 &&
        !status.activeEditSession && !/^(confirmed|executing)$/.test(status.planExecutionState || "") &&
        (freshRead || !lifecycle.blocked && !lifecycle.problem) && !lifecycle.pendingTransition && !lifecycle.pending && !lifecycle.activeTransition;
      if(!idle) {panelLifecycleGuard=paused;onDone({rejected:true,code:"bridge_busy",message:"Bridge has pending/inflight work or an active project session."});return;}
      refreshCurrentBridgePlan({fresh:true},function(syncError) {
        if(syncError || panelActionBusy() || currentBridgePlan && /^(confirmed|executing)$/.test(currentBridgePlan.state)) {
          panelLifecycleGuard=paused;onDone(syncError || {rejected:true,code:"bridge_busy"});return;
        }
        panelLifecycleGuard=paused;onDone(null);
      });
    });
  }

  var panelActionHandlers={
    "bridge.configure":function(args,done) {
      observeCausalRuntime(null,{code:"configuration_changed"});
      if(args.url !== undefined) {configuredBridgeUrl=args.url.replace(/\/+$/,"");urlEl.value=configuredBridgeUrl;localStorage.setItem("codexAeBridgeUrl",configuredBridgeUrl);}
      if(args.panelToken !== undefined) {configuredPanelToken=args.panelToken;tokenEl.value=args.panelToken;localStorage.setItem("codexAeBridgeToken",args.panelToken);}
      done(null,{configured:true,url:getBaseUrl()});
    },
    "bridge.connect":function(args,done,context) {
      var startup = initialAutomaticConnectDispatch;
      if(running && !recoveryTransportScope && !/^reset-/.test(String(panelConnectionGeneration))) {done(null,{connected:badgeEl.textContent === "online",alreadyRunning:true});return;}
      function normalConnect() { panelLifecycleIdle(function(error) {
        if (startup && (!initialAutomaticStartupCurrent(startup) || startup.state !== "connecting")) {done(error || {rejected:true,code:"initial_startup_interrupted"});return;}
        if(error) {if(startup) closeInitialAutomaticStartup(startup,error.code==="bridge_busy" ? "startup_bridge_busy" : "startup_idle_check_failed");done(error);return;}
        if(context.submit()) connect(done,startup,true,startup ? "automatic" : "explicit");else if(startup) closeInitialAutomaticStartup(startup,"startup_submit_refused");
      },true); }
      if(startup){normalConnect();return;}
      // Reset authority precedes the ordinary idle check: the exact old edit
      // owner is still preserved while the reset preflight is closed.
      var lookupActor=deliveryActor(),lookupUrl=getBaseUrl(),lookupToken=getToken();
      request("GET","/bridge/product-session?"+bridgeNextPath("",true).split("?")[1],null,function(error,response){
        if(!sameDeliveryActor(lookupActor,deliveryActor()) || getBaseUrl()!==lookupUrl || getToken()!==lookupToken){done({isUnknown:true,code:"product_reset_lookup_actor_changed"});return;}
        if(!error && response && (response.coreMigrationSession || response.coreMigrationSessionActivation)){if(observeCoreMigrationResponse(response)){done(null,{connected:false,coreMigrationPending:true});return;}}
        if(!error && response && response.resetSession){done(null,{connected:false,resetPending:true});beginProductSessionReset(response.resetSession);return;}
        if(!error && response && response.resetSessionActivation){var adoption=acceptProductSessionResetActivation(response.resetSessionActivation);if(!adoption.accepted){done({rejected:true,code:"product_reset_activation_actor_mismatch"});return;}if(adoption.transitioned){done(null,{connected:true});return;}}
        if(window.AEAgentPanelActions.state().reconciliationRequired){done({rejected:true,code:"product_reset_session_required"});return;}
        normalConnect();
      });
    },
    "bridge.disconnect":function(args,done,context) {
      panelLifecycleIdle(function(error) {if(error) {done(error);return;}if(!context.submit()) return;disconnect();done(null,{disconnected:true});});
    },
    "panel.reload":function(args,done,context) {
      panelLifecycleIdle(function(error) {if(error) {done(error);return;}var current=panelActionSnapshot();
        if(!context.checkpoint({assetVersion:APP_VERSION,preferences:current.preferences,reloading:true})) return;
        reloadApp();
      });
    },


    "autonomy.refresh":function(args,done,context) {if(context.submit()) refreshAutonomousSession(done);},
    "autonomy.set":function(args,done,context) {if(context.submit()) setAutonomousSessionEnabled(args.enabled,done);},
    "placeholder.refresh":function(args,done,context) {if(context.submit()) refreshPlaceholderProtection(done);},
    "placeholder.accept":function(args,done,context) {if(context.submit()) placeholderProtectionAction("accept",args,done);},
    "placeholder.release":function(args,done,context) {if(context.submit()) placeholderProtectionAction("release",args,done);},
    "placeholder.mapGroup":function(args,done,context) {if(context.submit()) placeholderProtectionAction("map_group",args,done);},
    "placeholder.constraints.set":function(args,done,context) {if(context.submit()) placeholderProtectionAction("constraints",args,done);},

    "plan.current":function(args,done) {if(!args.fresh) {done(null,{pins:currentBridgePlanPins(currentBridgePlan),state:currentBridgePlan && currentBridgePlan.state});return;}
      refreshCurrentBridgePlan({fresh:true,expectedActionId:args.expectedActionId},function(error) {done(error,{pins:currentBridgePlanPins(currentBridgePlan),state:currentBridgePlan && currentBridgePlan.state});});
    },

    "plan.prepare":function(args,done,context) {runLastPlan(true,false,done,{prepare:true,strict:true,pins:args.pins,context:context});},
    "plan.dryRun":function(args,done,context) {runLastPlan(true,false,done,{prepare:false,strict:true,pins:args.pins,context:context});},
    "plan.run":function(args,done,context) {
      var frame=activeManualRunGesture;activeManualRunGesture=null;
      if(context.source!=="ui" || !manualRunGestureCurrent(frame) || planKeyFor(args.pins)!==planKeyFor(frame.pins)){done({rejected:true,code:"manual_run_gesture_required"});return;}
      runLastPlan(false,false,done,{prepare:false,strict:true,pins:args.pins,context:context,manualGesture:frame});
    },
    "plan.reconcile":function(args,done,context) {reconcileLastPlanRun(args,done,context);},


  };

  var panelActionUI=null;

  function bridgeHostAvailable(onDone) {
    if (hostStartupGuard.isAllowed()) return true;
    if (onDone) onDone({rejected:true,code:hostStartupGuard.snapshot().code,
      message:"Подключение AE Agent в этом процессе After Effects отключено."});
    return false;
  }

  function actionUuid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,function(c) {var r=Math.random()*16|0;return (c === "x"?r:(r&3|8)).toString(16);});
  }

  function invokePanelUI(action,args) {
    var receipt=panelActionUI.invokeUI({protocolVersion:window.AEAgentPanelActions.protocolVersion,requestId:actionUuid(),action:action,args:args || {}});
    if(receipt.state === "rejected" || receipt.state === "error") log("Panel action "+action+": "+receipt.code);
    return receipt;
  }

  function uiPlanAction(dryRun,actionId,event) {
    var pins=currentBridgePlanPins(currentBridgePlan),proposal=m100ActionProposalForResult(lastPlanResult);
    if(actionId && pins) pins=Object.assign({},pins,{actionId:actionId});
    var action=proposal && !proposal.confirmation.confirmationToken ? "plan.prepare" : dryRun ? "plan.dryRun" : "plan.run";
    var steps=lastPlanResult && lastPlanResult.plan && lastPlanResult.plan.steps || [],queue=steps.length===1 && steps[0].tool==="start_ame_title_batch" && steps[0].args && steps[0].args.manualQueueMode==="cep_user_declaration_v2";
    if(action==="plan.run" && queue) {
      if(!event || event.isTrusted!==true || !pins || actionId && actionId!==proposal.actionId) {setPlanRunStatus("Для AME нужен настоящий щелчок Run plan.","blocked");return;}
      if(activeAmeQueueFrame && activeAmeQueueFrame.alive) {setPlanRunStatus("Подтверждение AME уже выполняется.","blocked");return;}
      activeAmeQueueFrame={alive:true,issuedAt:Date.now(),pins:pins,epoch:panelLifecycleEpoch,generation:String(panelConnectionGeneration),url:getBaseUrl(),token:getToken()};
      var frame=activeAmeQueueFrame;
      runLastPlan(false,false,function(error) {frame.alive=false;if(error) log("AME protected start: "+error.code);},{prepare:false,strict:true,pins:pins,ameQueueFrame:frame});return;
    }
    if(action === "plan.run"){
      if(!event || event.isTrusted!==true || !pins || !proposal){setPlanRunStatus("Требуется ручной щелчок по текущему плану.","blocked");return;}
      var frame={alive:true,pins:JSON.parse(JSON.stringify(pins)),session:m100ConfirmationSessionId(),epoch:panelLifecycleEpoch,generation:String(panelConnectionGeneration),url:getBaseUrl(),token:getToken(),issuedAt:Date.now()};
      var preview=["Выполнить текущий план?", "Риск: "+pins.riskLevel, "Проект: "+pins.projectFile, "План v"+pins.revision+" · "+pins.actionId, JSON.stringify(lastPlanResult.plan,null,2)].join("\n");
      if(!window.confirm(preview) || !manualRunGestureCurrent(frame)){frame.alive=false;setPlanRunStatus("Подтверждение отменено или план изменился.","blocked");return;}
      activeManualRunGesture=frame;
    }
    invokePanelUI(action,action === "plan.run" ? {pins:pins,confirm:true} : {pins:pins});
  }

  function onControl(el,event,action,args) {
    if(el) el.addEventListener(event,function() {invokePanelUI(action,typeof args === "function"?args():args || {});});
  }

  function observeConnectIntent() {
    var automatic=!!initialAutomaticConnectDispatch;
    connectionStartupDiagnostics[automatic ? "automaticAttempts" : "explicitAttempts"] += 1;
    connectionStartupDiagnostics.lastOrigin=automatic ? "automatic" : "explicit";
    // Observe intent before action admission: even a refused manual/MCP Connect
    // invalidates evidence that this page was left untouched for auto-start.
    // A rejected click must not abandon an already admitted automatic action:
    // its original native/HTTP callback still owns completion and any UNKNOWN.
    if(!automatic && initialAutomaticStartup && /^(reset_lookup|lookup|connecting)$/.test(initialAutomaticStartup.state) &&
       connectionStartupDiagnostics.automaticAttempts===0) {
      initialAutomaticStartup.state="superseded";initialAutomaticStartup.reason="explicit_connect";
    }
  }

  function lookupHumanSettlementBeforeConnect(attempt) {
    if (!initialAutomaticStartup) initialAutomaticStartup = {epoch:panelLifecycleEpoch,generation:panelConnectionGeneration,
      url:getBaseUrl(),token:getToken(),state:"lookup",rounds:0,lookupPending:false,consumed:false,getAttempted:false};
    var startup = initialAutomaticStartup;
    if (!initialAutomaticStartupCurrent(startup) || startup.state !== "lookup" || startup.lookupPending || running ||
      attempt !== startup.rounds || attempt > 3) return;
    startup.rounds += 1;startup.lookupPending=true;
    var complete = function(ready) {
      if (!initialAutomaticStartupCurrent(startup) || startup.state !== "lookup" || !startup.lookupPending || running) return;
      startup.lookupPending=false;
      if(ready && tokenEl.value && localStorage.getItem("codexAeBridgeAutoConnect")!=="0") {
        startup.state="connecting";
        var connectWaits=0;
        setTimeout(function dispatchInitialConnect() {
          if (!initialAutomaticStartupCurrent(startup) || startup.state !== "connecting" || running) return;
          if(localStorage.getItem("codexAeBridgeAutoConnect")==="0"){closeInitialAutomaticStartup(startup,"startup_disabled");return;}
          // A previous guard read may still own the panel at 250ms.
          // Wait before dispatch; never retry a submitted connection or AE read.
          if(startup.resetActivationCovered===true && !resetActivationCoveredForStartup(startup)){closeInitialAutomaticStartup(startup,"startup_reset_coverage_changed");return;}
          if (panelActionBusy()) {
            startup.waits=++connectWaits;
            if (connectWaits >= 80) {closeInitialAutomaticStartup(startup,"startup_panel_busy_timeout");return;}
            setTimeout(dispatchInitialConnect,250);return;
          }
          if(startup.resetActivationCovered===true && !resetActivationReadyForStartup(startup)){closeInitialAutomaticStartup(startup,"startup_reset_not_ready");return;}
          initialAutomaticConnectDispatch=startup;
          try {
            var connectReceipt=invokePanelUI("bridge.connect",{});
            startup.requestId=connectReceipt && connectReceipt.requestId || null;
            if (!connectReceipt || connectReceipt.accepted === false || !/^(accepted|running|completed)$/.test(connectReceipt.state)) closeInitialAutomaticStartup(startup,"startup_connect_rejected");
          } catch (error) {closeInitialAutomaticStartup(startup,"startup_connect_unknown");}
          finally {initialAutomaticConnectDispatch=null;}
        },250);
      } else if (!ready && tokenEl.value && attempt<3) {
        setTimeout(function(){lookupHumanSettlementBeforeConnect(attempt+1);},2000);
      } else closeInitialAutomaticStartup(startup,localStorage.getItem("codexAeBridgeAutoConnect")==="0" ? "startup_disabled" : "startup_guard_unavailable");
    };
    var receipt;
    if(startup.resetActivationCovered===true){
      if(!resetActivationCoveredForStartup(startup)){closeInitialAutomaticStartup(startup);return;}
      complete(true);
    }else receipt=panelActionUI.refreshTrustedGuards(complete);
    if (receipt && receipt.accepted === false) {
      startup.lookupPending=false;
      closeInitialAutomaticStartup(startup,"startup_guard_refresh_rejected");
    }
  }

  function resetActivationCoveredForStartup(startup) {
    var state=window.AEAgentPanelActions && window.AEAgentPanelActions.state();
    return initialAutomaticStartupCurrent(startup) && productResetActivation===startup.resetActivation &&
      !!state && state.actionStorage==="ready" && state.activeAction===null && state.recoveryTransport===null &&
      state.physicalInflight===0 && state.reconciliationRequired===false &&
      !(state.trustedGuardRefresh && state.trustedGuardRefresh.pending) && physicalEvalScriptIdle();
  }

  function resetActivationReadyForStartup(startup) {
    var state=window.AEAgentPanelActions && window.AEAgentPanelActions.state();
    return resetActivationCoveredForStartup(startup) && !!state && state.nativeBusy===false && !panelActionBusy();
  }

  function lookupProductSessionBeforeStartup() {
    var state=window.AEAgentPanelActions && window.AEAgentPanelActions.state();
    if(initialAutomaticStartup || running || !state || state.reconciliationRequired!==true || !tokenEl.value || localStorage.getItem("codexAeBridgeAutoConnect")==="0"){lookupHumanSettlementBeforeConnect(0);return;}
    var startup={epoch:panelLifecycleEpoch,generation:panelConnectionGeneration,url:getBaseUrl(),token:getToken(),
      state:"reset_lookup",rounds:0,lookupPending:true,consumed:false,getAttempted:false};
    initialAutomaticStartup=startup;
    var actor=deliveryActor();
    request("GET","/bridge/product-session?"+bridgeNextPath("",true).split("?")[1],null,function(error,response){
      if(!initialAutomaticStartupCurrent(startup) || startup.state!=="reset_lookup" || !startup.lookupPending || running || !sameDeliveryActor(actor,deliveryActor())){closeInitialAutomaticStartup(startup);return;}
      startup.lookupPending=false;
      if(error && error.code!=="owned_product_reset_session_absent"){closeInitialAutomaticStartup(startup,"startup_reset_lookup_failed");return;}
      if(!error && response && response.ok===true && response.coreMigrationSession){closeInitialAutomaticStartup(startup,"startup_core_migration_pending");beginCoreMigrationSession(response.coreMigrationSession);return;}
      if(!error && response && response.ok===true && response.coreMigrationSessionActivation){closeInitialAutomaticStartup(startup,"startup_core_migration_activation");observeCoreMigrationResponse(response);return;}
      if(!error && response && response.ok===true && response.resetSession){closeInitialAutomaticStartup(startup,"startup_reset_pending");return;}
      if(!error && response && response.ok===true && response.resetSessionActivation){
        var adoption=acceptProductSessionResetActivation(response.resetSessionActivation);
        if(!adoption.accepted || !adoption.preconnect){closeInitialAutomaticStartup(startup,"startup_reset_activation_rejected");return;}
        startup.resetActivation=response.resetSessionActivation;
        startup.resetActivationCovered=resetActivationCoveredForStartup(startup);
      }
      startup.state="lookup";
      lookupHumanSettlementBeforeConnect(0);
    });
  }

  var confirmationSessionNonce=actionUuid();

  var activeManualRunGesture=null;

  var planResultEl=document.getElementById("planResult");

  function manualRunGestureCurrent(frame){return !!(frame && frame.alive && Date.now()>=frame.issuedAt && Date.now()-frame.issuedAt<120000 && frame.epoch===panelLifecycleEpoch && frame.generation===String(panelConnectionGeneration) && frame.session===m100ConfirmationSessionId() && frame.url===getBaseUrl() && frame.token===getToken() && currentBridgePlanMatchesPins(currentBridgePlan,frame.pins));}

  setAppTitle(APP_VERSION);
  urlEl.value=localStorage.getItem("codexAeBridgeUrl") || urlEl.value;
  tokenEl.value=localStorage.getItem("codexAeBridgeToken") || "";
  configuredBridgeUrl=urlEl.value;configuredPanelToken=tokenEl.value;
  renderAutonomousSession();setStatus("Отключено",false);updatePlanControls();rememberPanelSecrets();
  panelActionUI=window.AEAgentPanelActionBootstrap({handlers:panelActionHandlers,observeConnectIntent:observeConnectIntent,productSessionReset:function(){return productResetActivation;},coreMigrationSession:function(){return coreMigrationActivation;},
    causalRuntimeStamp:function(){return causalRuntimeStamp;},createCausalNonce:actionUuid,
    lookupPanelLifecycleCausal:function(frame,done){
      var url=getBaseUrl(),token=getToken();
      if(!causalRuntimeStamp){done(null,null);return;}
      if(!window.AEAgentPanelContract.validateLoopbackUrl(url)||!token){observeCausalRuntime(null,{code:"causal_bridge_unavailable"});done({code:"causal_bridge_unavailable"});return;}
      var query="nonce="+encodeURIComponent(frame.nonce)+"&sequence="+encodeURIComponent(frame.sequence)+"&actor="+encodeURIComponent(JSON.stringify(frame.actor));
      request("GET","/panel-lifecycle-causal/lookup?"+query,null,function(error,response){
        if(getBaseUrl()!==url||getToken()!==token||error||!response||response.ok!==true){done(error||{code:"causal_lookup_failed"});return;}done(null,response.causal);
      });
    },
    passive:{"plan.current":function(args) {return !args || !args.fresh;}},
    availability:actionAvailability,state:panelActionSnapshot,
    lookupHumanSettlements:function(done) {
      var url=getBaseUrl(),token=getToken();
      if(!window.AEAgentPanelContract.validateLoopbackUrl(url) || !token){done({code:"human_settlement_bridge_unavailable"});return;}
      request("GET","/human-guard-settlement/lookup",null,function(error,response) {
        if(getBaseUrl()!==url || getToken()!==token || error || !response || response.ok!==true){done(error || {code:"human_settlement_lookup_failed"});return;}
        done(null,response.settlement);
      });
    },
    lookupAmeFixtureDisposition:function(done) {
      var url=getBaseUrl(),token=getToken();
      if(!window.AEAgentPanelContract.validateLoopbackUrl(url) || !token){done({code:"fixture_disposition_bridge_unavailable"});return;}
      request("GET","/ame/fixture-ui-disposition/lookup",null,function(error,response) {
        if(getBaseUrl()!==url || getToken()!==token || error || !response || response.ok!==true || !Object.prototype.hasOwnProperty.call(response,"disposition")){
          done(error || {code:"fixture_disposition_lookup_failed"});return;
        }
        done(null,response.disposition);
      });
    },
    lookupNativeFixtureAbandonment:function(selector,done) {
      var url=getBaseUrl(),token=getToken();
      if(!window.AEAgentPanelContract.validateLoopbackUrl(url) || !token){done({code:"fixture_abandonment_bridge_unavailable"});return;}
      request("GET","/ame/native-fixture-abandonment/lookup?requestId="+encodeURIComponent(selector.requestId)+"&runId="+encodeURIComponent(selector.runId),null,function(error,response) {
        if(getBaseUrl()!==url || getToken()!==token || error || !response || response.ok!==true || !Object.prototype.hasOwnProperty.call(response,"disposition")){done(error || {code:"fixture_abandonment_lookup_failed"});return;}
        done(null,response.disposition);
      });
    },
    lookupNativeFixturePrephaseRecovery:function(done) {
      var url=getBaseUrl(),token=getToken();
      if(!window.AEAgentPanelContract.validateLoopbackUrl(url) || !token){done({code:"fixture_prephase_bridge_unavailable"});return;}
      request("GET","/ame/native-fixture-prephase-recovery/lookup",null,function(error,response) {
        if(getBaseUrl()!==url || getToken()!==token || error || !response || response.ok!==true || !Object.prototype.hasOwnProperty.call(response,"certificate")){done(error || {code:"fixture_prephase_lookup_failed"});return;}
        done(null,response.certificate);
      });
    },
    nativeFixtureAdmissionRefusalContext:function() {return {url:getBaseUrl(),token:getToken(),epoch:panelLifecycleEpoch,generation:String(panelConnectionGeneration),panelConnectionId:panelConnectionId,running:running,connected:running && badgeEl.textContent==="online"};},
    lookupNativeFixtureAdmissionRefusal:function(done) {
      var url=getBaseUrl(),token=getToken(),epoch=panelLifecycleEpoch,generation=String(panelConnectionGeneration),connection=panelConnectionId;
      if(!window.AEAgentPanelContract.validateLoopbackUrl(url) || !token){done({code:"fixture_refusal_bridge_unavailable"});return;}
      request("GET","/ame/native-fixture-admission-refusal/lookup",null,function(error,response) {
        if(getBaseUrl()!==url || getToken()!==token || panelLifecycleEpoch!==epoch || String(panelConnectionGeneration)!==generation || panelConnectionId!==connection || error || !response || response.ok!==true || response.credentialRole!=="panel" || !Object.prototype.hasOwnProperty.call(response,"refusal")){done(error || {code:"fixture_refusal_lookup_failed"});return;}
        done(null,response.refusal);
      });
    },
    lifecycle:function() {return {epoch:panelLifecycleEpoch,generation:String(panelConnectionGeneration),busy:panelActionBusy()};}});
  onControl(connectButton,"click","bridge.connect");onControl(disconnectButton,"click","bridge.disconnect");onControl(reloadButton,"click","panel.reload");
  [urlEl,tokenEl].forEach(function(el){onControl(el,"change","bridge.configure",function(){return {url:urlEl.value,panelToken:tokenEl.value};});});
  onControl(autonomousSessionButton,"click","autonomy.set",function(){return {enabled:!(autonomousSessionState && autonomousSessionState.desiredEnabled)};});
  onControl(document.getElementById("refreshPlanButton"),"click","plan.current",{fresh:true});
  dryRunPlanButton.addEventListener("click",function(){uiPlanAction(true);});
  runPlanButton.addEventListener("click",function(event){uiPlanAction(false,null,event);});
  onControl(reconcilePlanRunButton,"click","plan.reconcile",function(){return {runId:lastPlanRunResult && lastPlanRunResult.id || ""};});
  lookupProductSessionBeforeStartup();

})();
