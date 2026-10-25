"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), {execFile} = require("node:child_process");
const native = require("./ame-open-comp-native"), {stableStringify,sha256Payload} = require("./m100-protocol"), {verifyDryRunReceipt} = require("./project-save");
const INSPECT = "inspect_ame_open_comp", DECLARE = "declare_ame_open_comp_idle", DISPATCH = "dispatch_ame_open_comp", RESTORE = "restore_ame_open_comp", RECONCILE = "reconcile_ame_open_comp", REPORT = "report_ame_open_comp_ui";
const SCHEMA = "ae-agent-ame-open-comp.v1", UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/, SHA = /^[a-f0-9]{64}$/;
const MUTATIONS = [DISPATCH,RESTORE], INSPECTION_TTL = 300000, IDLE_TTL = 60000;
const clone = value => JSON.parse(JSON.stringify(value)), hash = value => crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
const samePath = (a,b) => typeof a === "string" && typeof b === "string" && a.replace(/\\/g,"/").toLowerCase() === b.replace(/\\/g,"/").toLowerCase();
function fail(code) { throw Object.assign(Error(code),{code}); }
function binaryIdentityValid(value) {
  if (typeof value!=="string" || value.length>32) return false;
  const parts=value.split(":"), values=parts.slice(1).map(Number);
  return parts.length===5 && parts[0]==="b1" && values.every((number,index)=>Number.isSafeInteger(number)&&String(number)===parts[index+1]) && [1,-1].includes(values[0]) && values[1]>=-1074 && values[1]<=1023 && values.slice(2).every(number=>number>=0&&number<67108864);
}
function object(raw,keys,required = keys) { if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).some(k => !keys.includes(k)) || required.some(k => !Object.prototype.hasOwnProperty.call(raw,k))) fail("ame_open_closed_input_required"); }
function uuid(value) { if (!UUID.test(value || "")) fail("ame_open_exact_uuid_required"); return value; }
function id(value) { if (!Number.isSafeInteger(value) || value < 1) fail("ame_open_exact_item_id_required"); return value; }
function iso(value) { if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(Date.parse(value)).toISOString() !== value) fail("ame_open_exact_timestamp_required"); return value; }
function processIdentity(value) { object(value,["pid","startedAt","path"]); id(value.pid); iso(value.startedAt); if (typeof value.path !== "string" || !path.isAbsolute(value.path) || /[\x00-\x1f]/.test(value.path)) fail("ame_open_process_identity_invalid"); return clone(value); }
function actorIdentity(value) {
  object(value,["aeProcess","targetHash","panelConnectionId","panelGeneration","panelInstanceId","panelLifecycleEpoch"]); processIdentity(value.aeProcess);
  if (!SHA.test(value.targetHash || "") || [value.panelConnectionId,value.panelGeneration,value.panelInstanceId].some(text=>typeof text!=="string"||!text||text.length>512||/[\x00-\x1f]/.test(text)) || !Number.isSafeInteger(Number(value.panelGeneration)) || Number(value.panelGeneration)<1 || !Number.isSafeInteger(value.panelLifecycleEpoch) || value.panelLifecycleEpoch<1) fail("ame_open_actor_identity_invalid");
  return value;
}
function cepIdentity(value) { return {targetHash:value.targetHash,panelConnectionId:value.panelConnectionId,panelGeneration:value.panelGeneration,panelInstanceId:value.panelInstanceId,panelLifecycleEpoch:value.panelLifecycleEpoch}; }
function validateInput(name,raw) {
  if (name === INSPECT) {
    object(raw,["compItemId","allowedLayerIds","presetLabel"]); id(raw.compItemId);
    if(typeof raw.presetLabel!=="string"||raw.presetLabel!==raw.presetLabel.trim()||!raw.presetLabel||raw.presetLabel.length>240||/[\x00-\x1f]/.test(raw.presetLabel))fail("ame_open_bounded_preset_label_required");
    if (!Array.isArray(raw.allowedLayerIds) || !raw.allowedLayerIds.length || raw.allowedLayerIds.length > 1000 || new Set(raw.allowedLayerIds).size !== raw.allowedLayerIds.length) fail("ame_open_controlled_ids_required"); raw.allowedLayerIds.forEach(id); return clone(raw);
  }
  if (name === DECLARE) {
    object(raw,["intentId","ameProcess","observedAt","source","idle","autoStartDisabled","executionAuthority"]); uuid(raw.intentId); processIdentity(raw.ameProcess); iso(raw.observedAt);
    if (raw.source !== "agent_ui_observed" || raw.idle !== true || raw.autoStartDisabled !== true || raw.executionAuthority !== false) fail("ame_open_idle_declaration_required"); return clone(raw);
  }
  if (name === DISPATCH) {
    object(raw,["intentId","selectedLayerId","expectedRevision","expectedStateHash","menuMetadataHash"]); uuid(raw.intentId); id(raw.selectedLayerId);
    if (!Number.isSafeInteger(raw.expectedRevision) || raw.expectedRevision < 0 || !SHA.test(raw.expectedStateHash || "") || !SHA.test(raw.menuMetadataHash || "")) fail("ame_open_baseline_required"); return clone(raw);
  }
  if (name === RESTORE) { object(raw,["intentId"]); uuid(raw.intentId); return clone(raw); }
  if (name === RECONCILE) { object(raw,["runId","commandId"]); uuid(raw.runId); uuid(raw.commandId); return clone(raw); }
  if (name === REPORT) {
    object(raw,["intentId","fullMarker","outputPath","preset","range","observedAt","source","executionAuthority"]); uuid(raw.intentId); iso(raw.observedAt);
    object(raw.range,["startSeconds","endSeconds"]);
    if (raw.fullMarker !== "CODX_AME_"+raw.intentId || typeof raw.outputPath !== "string" || !path.isAbsolute(raw.outputPath) || typeof raw.preset!=="string" || !raw.preset || raw.preset.length>240 || /[\x00-\x1f]/.test(raw.preset) || !Number.isFinite(raw.range.startSeconds) || !Number.isFinite(raw.range.endSeconds) || raw.range.startSeconds < 0 || raw.range.endSeconds <= raw.range.startSeconds || raw.source !== "agent_ui_observed" || raw.executionAuthority !== false) fail("ame_open_exact_ui_report_required"); return clone(raw);
  }
  fail("ame_open_unknown_tool");
}

// A fixed read-only process query. No caller executable, arguments or filters.
function inspectAeProcesses() {
  if (process.platform !== "win32") fail("ame_open_windows_required");
  const executable = path.join(process.env.SystemRoot || "C:\\Windows","System32","WindowsPowerShell","v1.0","powershell.exe");
  const script = "$ErrorActionPreference='Stop'; [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding -ArgumentList $false; $env:PSModulePath=Join-Path $PSHOME 'Modules'; $out=@(); foreach($p in @(Get-CimInstance Win32_Process -Filter \"Name = 'AfterFX.exe'\")) { $out+=@{pid=[int]$p.ProcessId;path=[string]$p.ExecutablePath;startedAt=$p.CreationDate.ToUniversalTime().ToString('o')} }; ConvertTo-Json -InputObject @($out) -Depth 3 -Compress";
  const env = {...process.env}; for (const key of Object.keys(env)) if (/^(AE_BRIDGE_.*TOKEN|AE_BRIDGE_DEV_ADMIN|AE_M100_ALLOW_DIRECT_TOOL_EXECUTION|PSModulePath|PSExecutionPolicyPreference)$/i.test(key)) delete env[key];
  return new Promise((resolve,reject) => execFile(executable,["-NoProfile","-NonInteractive","-Command",script],{windowsHide:true,timeout:10000,maxBuffer:65536,encoding:"utf8",env},(error,stdout) => {
    if (error) { reject(Object.assign(Error("ame_open_process_query_failed"),{code:"ame_open_process_query_failed"})); return; }
    try { const rows = JSON.parse(stdout.replace(/^\uFEFF/,"")); if (!Array.isArray(rows)) fail("ame_open_process_query_invalid"); resolve(rows.map(v => processIdentity({...v,startedAt:new Date(v.startedAt).toISOString()}))); } catch (e) { reject(e); }
  }));
}

function createExecutor(deps) {
  if (!deps || !path.isAbsolute(deps.stateDir || "") || !path.isAbsolute(deps.outputDir || "") || ["native","wrap","readActor","inspectAeProcesses","inspectAmeProcesses","assertRunner"].some(k => typeof deps[k] !== "function")) fail("ame_open_dependencies_required");
  const stateDir = path.resolve(deps.stateDir), outputDir = path.resolve(deps.outputDir), inspections = new Map(), capabilities = new WeakMap(), debts = new Map(), menuPins = new Map(), workflow = new Map(), actorPins = new Map();
  const now = deps.now || Date.now; let busy = false, current = null;
  function directory(dir) {
    if (!fs.existsSync(dir)) { directory(path.dirname(dir)); try { fs.mkdirSync(dir,{mode:0o700}); } catch (e) { if (e.code !== "EEXIST") throw e; } }
    const stat = fs.lstatSync(dir); if (!stat.isDirectory() || stat.isSymbolicLink() || !samePath(fs.realpathSync(dir),dir)) fail("ame_open_journal_directory_alias");
  }
  const file = (intentId,kind) => path.join(stateDir,uuid(intentId)+"."+kind+".json");
  function read(target) {
    if (!fs.existsSync(target)) return null; directory(path.dirname(target));
    const stat = fs.lstatSync(target); if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 8*1024*1024 || !samePath(fs.realpathSync(target),target)) fail("ame_open_journal_identity_changed");
    const wrapped = JSON.parse(fs.readFileSync(target,"utf8")); if (wrapped.schema !== SCHEMA || wrapped.sha256 !== hash(wrapped.value)) fail("ame_open_journal_changed"); return wrapped.value;
  }
  function write(target,value,exclusive = false) {
    directory(path.dirname(target)); const temp = exclusive ? target : target+"."+crypto.randomUUID()+".tmp", fd = fs.openSync(temp,"wx",0o600);
    try { fs.writeFileSync(fd,JSON.stringify({schema:SCHEMA,sha256:hash(value),value})+"\n"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    if (!exclusive) fs.renameSync(temp,target);
  }
  function state(attempt,phase,extra = {}) {
    const value = {intentId:attempt.intentId,runId:attempt.runId,phase,restoreDebt:!["restored","failed_before_native","no_effect_proven"].includes(phase),replayAllowed:false,...extra};
    write(file(attempt.intentId,"state"),value); workflow.set(attempt.intentId,attempt); if (value.restoreDebt) debts.set(attempt.intentId,attempt); else debts.delete(attempt.intentId); deps.persist?.(value); return value;
  }
  function pinActor(owner) {
    actorIdentity(owner); const key=hash(cepIdentity(owner)), pinned=actorPins.get(key);
    if (pinned && !native.equal(pinned,owner.aeProcess)) fail("ame_open_conflicting_actor_pins");
    actorPins.set(key,processIdentity(owner.aeProcess));
  }
  if (fs.existsSync(stateDir)) {
    directory(stateDir);
    for (const name of fs.readdirSync(stateDir).filter(v => /^[a-f0-9-]{36}\.intent\.json$/.test(v))) {
      const attempt = read(path.join(stateDir,name)), saved = read(file(attempt.intentId,"state"));
      const {binding,...facts}=attempt;
      if (attempt.schema!==SCHEMA || name!==uuid(attempt.intentId)+".intent.json" || binding!==hash(facts)) fail("ame_open_retained_intent_binding_changed");
      pinActor(attempt.actor);
      workflow.set(attempt.intentId,attempt);
      if (!saved || saved.restoreDebt !== false) debts.set(attempt.intentId,attempt);
      const key = hash(attempt.actor.aeProcess), pinned = menuPins.get(key); if (pinned && pinned !== attempt.menuMetadataHash) fail("ame_open_retained_menu_mapping_changed"); menuPins.set(key,attempt.menuMetadataHash);
    }
  }
  async function actor(expectedOwner = null) {
    const value = await deps.readActor(), s = value?.state, t = value?.target;
    // readActor is the existing exact installed AE extension maintenanceTarget
    // service. The native observation independently checks the AE application.
    if (!s || s.nativeControlIdle !== true || s.activeAction !== null || s.recoveryTransport || s.actionStorage !== "ready" || !s.bridgeConnection?.panelConnectionId || !s.panelInstanceId || !Number.isSafeInteger(s.panelLifecycleEpoch) || s.panelLifecycleEpoch < 1 || !Number.isSafeInteger(Number(s.panelGeneration)) || Number(s.panelGeneration) < 1 || !t || [t.url,t.webSocketDebuggerUrl].some(v => typeof v !== "string" || !v || /[\x00-\x1f]/.test(v))) fail("ame_open_actor_not_idle_or_not_ae");
    const cep={targetHash:hash({url:t.url,webSocketDebuggerUrl:t.webSocketDebuggerUrl}),panelConnectionId:s.bridgeConnection.panelConnectionId,panelGeneration:String(s.panelGeneration),panelInstanceId:s.panelInstanceId,panelLifecycleEpoch:s.panelLifecycleEpoch};
    if (expectedOwner && !native.equal(cep,cepIdentity(actorIdentity(expectedOwner)))) fail("ame_open_actor_changed");
    // A pin is private identity evidence, never an execution grant. It comes
    // only from a successful single-process inspection or a validated intent.
    const pinned=expectedOwner?expectedOwner.aeProcess:actorPins.get(hash(cep)), ae=await deps.inspectAeProcesses();
    if (!Array.isArray(ae)) fail("ame_open_exact_ae_process_required");
    const rows=ae.map(processIdentity); let selected;
    if (pinned) { const matches=rows.filter(row=>row.pid===pinned.pid); if (matches.length!==1 || !native.equal(matches[0],pinned)) fail("ame_open_pinned_ae_process_changed"); selected=matches[0]; }
    else { if (rows.length!==1) fail("ame_open_exact_ae_process_required"); selected=rows[0]; }
    return actorIdentity({aeProcess:selected,...cep});
  }
  async function ameProcess() { const rows = await deps.inspectAmeProcesses(); if (!Array.isArray(rows) || rows.length !== 1) fail("ame_open_exact_ame_process_required"); return processIdentity(rows[0]); }
  async function invoke(body,mutation = false,attempt = null,kind = "read") {
    if (current) fail("ame_open_concurrent_native_refused"); const scope = {body,mutation,attempt,kind,prepared:false,used:false,script:null,id:null}; current = scope;
    try { const value = await deps.native(body,scope,mutation); return value?.result ?? value; } finally { current = null; }
  }
  function prepareNative(scope,script,body) { if (!scope) return; if (scope !== current || scope.prepared || scope.used || !body.endsWith(scope.body) || script !== deps.wrap(body)) fail("ame_open_fixed_program_required"); scope.script = script; scope.prepared = true; }
  function assertNative(scope,script) { if (!scope) return; if (scope !== current || !scope.prepared || scope.used || scope.script !== script) fail("ame_open_fixed_program_required"); scope.used = true; }
  function queued(scope,commandId) {
    if (!scope) return; if (scope !== current || !scope.prepared || !scope.used || scope.id) fail("ame_open_native_binding_required"); scope.id = uuid(commandId);
    if (scope.mutation) {
      const attempt = scope.attempt, target = file(attempt.intentId,scope.kind+"-command");
      write(target,{intentId:attempt.intentId,runId:attempt.activeRunId || attempt.runId,commandId,kind:scope.kind,scriptSha256:crypto.createHash("sha256").update(scope.script).digest("hex")},true);
      state(attempt,scope.kind+"_submitted",{commandId});
    }
  }
  function validObservation(o,selector) {
    if (o?.schema !== "ae-agent-ame-open-comp-observation.v1" || o.application !== "aftereffects" || o.snapshot?.compItemId !== selector.compItemId || !Number.isSafeInteger(o.snapshot?.revision) || typeof o.snapshot?.projectFile !== "string" || !Array.isArray(o.snapshot?.graph) || o.snapshot.graph.length < 1 || o.snapshot.graph.length > 100 || o.nameDependencies?.complete !== true || !["blocked","no_expressions","proven_name_independent_subset"].includes(o.nameDependencies.status)) fail("ame_open_observation_invalid");
    if (!Array.isArray(o.numericIdentity) || o.numericIdentity.length > 6000 || new Set(o.numericIdentity.map(row=>row?.path)).size !== o.numericIdentity.length || o.numericIdentity.some(row=>!row || Object.keys(row).sort().join(",")!=="exact,path" || typeof row.path!=="string" || !row.path || row.path.length>160 || !binaryIdentityValid(row.exact))) fail("ame_open_numeric_identity_invalid");
    const roots = o.snapshot.graph.filter(c => c.id === selector.compItemId); if (roots.length !== 1 || !Array.isArray(roots[0].layers) || new Set(roots[0].layers.map(l => l.id)).size !== roots[0].layers.length) fail("ame_open_comp_observation_invalid");
    for (const layerId of selector.allowedLayerIds) { const matches = roots[0].layers.filter(l => l.id === layerId); if (matches.length !== 1 || typeof matches[0].enabled !== "boolean") fail("ame_open_controlled_layer_missing"); }
    return o;
  }
  function inspection(intentId) { const entry = inspections.get(intentId); if (!entry || now() >= entry.expiresAt || read(file(intentId,"intent"))) fail("ame_open_fresh_inspection_required"); return entry; }
  function checkIdle(entry) { const d = entry.idle; if (!d || d.intentId !== entry.intentId || d.executionAuthority !== false || d.status !== "operator_declared_idle" || now() < Date.parse(d.observedAt) || now()-Date.parse(d.observedAt) >= IDLE_TTL || !native.equal(d.ameProcess,entry.ameProcess)) fail("ame_open_fresh_idle_declaration_required"); }
  async function inspect(raw) {
    const selector = validateInput(INSPECT,raw); if (busy) fail("ame_open_busy");
    const owner = await actor(), observed = validObservation(await invoke(native.observeScript(selector)),selector), ame = await ameProcess();
    if (!native.equal(owner,await actor(owner))) fail("ame_open_actor_changed");
    pinActor(owner);
    const intentId = crypto.randomUUID(), menuMetadataHash = hash(observed.menu), entry = {intentId,selector,before:observed,actor:owner,ameProcess:ame,menuMetadataHash,expiresAt:now()+INSPECTION_TTL,idle:null};
    inspections.set(intentId,entry);
    return {ok:true,schema:SCHEMA,intentId,marker:"CODX_AME_"+intentId,observed,expectedRevision:observed.snapshot.revision,expectedStateHash:hash(observed.snapshot),menuMetadataHash,ameProcess:ame,aeProcess:owner.aeProcess,expiresAt:new Date(entry.expiresAt).toISOString(),executionAuthority:false,mediaVerified:false};
  }
  async function declare(raw) {
    const args = validateInput(DECLARE,raw), entry = inspection(args.intentId);
    if (Date.parse(args.observedAt) > now() || now()-Date.parse(args.observedAt) >= IDLE_TTL || !native.equal(args.ameProcess,entry.ameProcess) || !native.equal(await ameProcess(),entry.ameProcess)) fail("ame_open_idle_process_or_time_changed");
    entry.idle = {...args,status:"operator_declared_idle",nativeIdleVerified:false,ameSession:{kind:"process_birth",pid:entry.ameProcess.pid,startedAt:entry.ameProcess.startedAt},expiresAt:new Date(Date.parse(args.observedAt)+IDLE_TTL).toISOString()}; return clone(entry.idle);
  }
  function fingerprint(context) { const r = context.record; return stableStringify({tool:context.tool,args:context.args,runId:context.runId,payloadHash:r.payloadHash,proposalId:r.actionId,revision:r.revision,sessionHash:context.sessionHash,protection:context.protection}); }
  function assertContext(row,args) {
    const c = row.context, r = c.record;
    if (row.fingerprint !== fingerprint(c) || r.payloadHash !== sha256Payload(r.payload) || !native.equal(validateInput(c.tool,c.args),args) || c.protection !== "bounded_property_journal" || c.confirm !== true || c.allowWithoutCheckpoint !== false || c.checkpoint || c.ownedEditSessionId) fail("ame_open_private_runner_changed");
    deps.assertRunner(c); verifyDryRunReceipt(r,1,c.contractVersion);
  }
  function authorize(context) {
    const args = validateInput(context.tool,context.args), steps = context.record?.payload?.plan?.steps;
    if (!MUTATIONS.includes(context.tool) || context.stepCount !== 1 || steps?.length !== 1 || steps[0].tool !== context.tool || !native.equal(validateInput(context.tool,steps[0].args),args) || !UUID.test(context.runId || "")) fail("ame_open_isolated_server_runner_required");
    const row = {context,fingerprint:fingerprint(context),used:false}; assertContext(row,args); const cap = Object.freeze({}); capabilities.set(cap,row); return cap;
  }
  function expected(entry,args,marker) {
    const wanted = clone(entry.before.snapshot), root = wanted.graph.find(c => c.id === entry.selector.compItemId);
    if (!entry.selector.allowedLayerIds.includes(args.selectedLayerId)) fail("ame_open_selected_layer_not_allowed");
    const patch = entry.selector.allowedLayerIds.map(layerId => { const layer = root.layers.find(l => l.id === layerId); if (layer.locked || layer.solo) fail("ame_open_locked_or_solo_controlled_layer"); const row = {layerId,before:layer.enabled,after:layerId === args.selectedLayerId}; layer.enabled = row.after; return row; });
    if (root.layers.some(l => l.solo)) fail("ame_open_solo_scope_ambiguous"); root.name = marker; return {wanted,patch,beforeName:entry.before.snapshot.graph.find(c => c.id === entry.selector.compItemId).name};
  }
  async function preflight(name,raw) {
    const args = validateInput(name,raw); if (busy) fail("ame_open_busy");
    if (name === RESTORE) { const a = read(file(args.intentId,"intent")); if (!a || !debts.has(args.intentId)) fail("ame_open_restore_debt_required"); const s = await reconcileAttempt(a); if (!s.restorable) fail(s.code || "ame_open_restore_not_proven"); return {intentId:args.intentId,projectFile:a.before.snapshot.projectFile,protection:"bounded_property_journal",restorable:true}; }
    const entry = inspection(args.intentId); checkIdle(entry);
    if (debts.size) {
      for (const d of debts.values()) if (native.equal(d.actor.aeProcess,entry.actor.aeProcess) && samePath(d.before.snapshot.projectFile,entry.before.snapshot.projectFile)) fail("ame_open_previous_restore_required");
    }
    for(const previous of workflow.values())if(native.equal(previous.actor.aeProcess,entry.actor.aeProcess)&&samePath(previous.before.snapshot.projectFile,entry.before.snapshot.projectFile)){
      const command=read(file(previous.intentId,"dispatch-command")),slot=read(file(previous.intentId,"native")),saved=read(file(previous.intentId,"state"));
      if(command && saved?.phase!=="no_effect_proven" && !(slot?.dispatchAttempted===false&&slot?.restored===true) && (!read(file(previous.intentId,"ui-receipt"))||saved?.phase!=="restored"))fail("ame_open_previous_ui_receipt_and_restore_required");
    }
    if (entry.before.nameDependencies.status === "blocked" || entry.before.menu.available !== true || args.menuMetadataHash !== entry.menuMetadataHash || args.expectedStateHash !== hash(entry.before.snapshot) || args.expectedRevision !== entry.before.snapshot.revision) fail("ame_open_name_dependency_menu_or_baseline_blocked");
    if (menuPins.has(hash(entry.actor.aeProcess)) && menuPins.get(hash(entry.actor.aeProcess)) !== entry.menuMetadataHash) fail("ame_open_pinned_menu_mapping_changed");
    if (!native.equal(entry.actor,await actor(entry.actor)) || !native.equal(entry.ameProcess,await ameProcess())) fail("ame_open_actor_or_ame_process_changed");
    const fresh = validObservation(await invoke(native.observeScript(entry.selector)),entry.selector);
    if (!native.equal(fresh,entry.before)) fail("ame_open_baseline_changed");
    expected(entry,args,"CODX_AME_"+entry.intentId); checkIdle(entry);
    return {intentId:entry.intentId,projectFile:entry.before.snapshot.projectFile,menuMetadataHash:entry.menuMetadataHash,nameDependencies:clone(entry.before.nameDependencies),protection:"bounded_property_journal",nativeMutations:0};
  }
  function slotValid(slot,a) { if (!slot || slot.schema !== SCHEMA || slot.intentId !== a.intentId || slot.binding !== a.binding || slot.runId !== a.runId || !Array.isArray(slot.applied)) fail("ame_open_retained_slot_unknown"); return slot; }
  function partialExpected(a,slot) {
    const wanted = clone(a.before.snapshot), root = wanted.graph.find(c => c.id === a.selector.compItemId), seen = new Set();
    for (const edit of slot.applied) {
      if (edit.kind === "name") { if (seen.has("name") || edit.before !== a.beforeName || edit.after !== a.marker) fail("ame_open_partial_journal_changed"); root.name = edit.after; seen.add("name"); }
      else if (edit.kind === "enabled") { const patch = a.patch.find(p => p.layerId === edit.layerId), layer = root.layers.find(l => l.id === edit.layerId); if (!patch || !layer || seen.has(edit.layerId) || !native.equal(edit,{kind:"enabled",...patch})) fail("ame_open_partial_journal_changed"); layer.enabled = edit.after; seen.add(edit.layerId); }
      else fail("ame_open_partial_journal_changed");
    }
    return wanted;
  }
  function restoredSnapshot(a,slot) { const wanted = slot.dispatchReturned ? clone(a.wanted) : clone(a.before.snapshot); wanted.graph.find(c => c.id === a.selector.compItemId).name = a.beforeName; return wanted; }
  async function reconcileAttempt(a) {
    const slot = slotValid(await invoke(native.lookupScript(a.intentId)),a), fresh = validObservation(await invoke(native.observeScript(a.selector)),a.selector);
    if (!native.equal(a.actor,await actor(a.actor))) fail("ame_open_actor_changed");
    if(slot.dispatchAttempted===false&&slot.dispatchReturned===false&&slot.restoreAttempted===false&&slot.restored===false&&slot.applied.length===0&&native.equal(fresh,a.before))return {slot,fresh,noEffectProven:true,restorable:false,restored:false,code:slot.error||"ame_open_no_effect_proven"};
    if (!slot.lastObserved || !native.equal(fresh,slot.lastObserved)) return {slot,fresh,restorable:false,code:"ame_open_restore_manual_drift"};
    const expectedSnapshot = slot.restored ? restoredSnapshot(a,slot) : partialExpected(a,slot), actual = clone(fresh.snapshot); actual.revision = expectedSnapshot.revision;
    const matches = native.equal(actual,expectedSnapshot) && native.equal(fresh.numericIdentity,a.before.numericIdentity), owned = fresh.snapshot.graph.find(c => c.id === a.selector.compItemId).name === a.marker;
    const dispatchKnown=slot.dispatchAttempted===false||slot.dispatchReturned===true;
    return {slot,fresh,restorable:matches && owned && dispatchKnown && !slot.restoreAttempted && !slot.restored,restored:matches && slot.restored === true,code:!matches?"ame_open_partial_setter_not_proven":!dispatchKnown?"ame_open_unknown_dispatch_marker_held":null};
  }
  function result(a,slot,command,extra = {}) { return {ok:slot.dispatchReturned === true || slot.restored === true,schema:SCHEMA,intentId:a.intentId,marker:a.marker,phase:slot.restored?"restored":slot.dispatchReturned?"native_dispatched":"unknown",selector:{runId:command.runId,commandId:command.commandId},authorization:{runId:command.runId,proposalId:a.proposalId},compItemId:a.selector.compItemId,selectedLayerId:a.args.selectedLayerId,outputPath:a.outputPath,preset:a.selector.presetLabel,range:a.before.range,dispatchAttempted:slot.dispatchAttempted === true,dispatchReturned:slot.dispatchReturned === true,queueAcceptance:"pending_ui_observation",nativeJobId:null,proofSource:"native_dispatch_only",restoreDebt:slot.restored !== true,replayAllowed:false,automaticRetryAllowed:false,mediaVerified:false,executionAuthority:false,...extra}; }
  async function execute(name,raw,cap) {
    const args = validateInput(name,raw), row = capabilities.get(cap); if (!row || row.used || row.context.tool !== name) fail("ame_open_private_runner_required"); assertContext(row,args);
    await preflight(name,args); assertContext(row,args); if (busy) fail("ame_open_busy"); busy = true; row.used = true; let a = null;
    try {
      if (name === DISPATCH) {
        const entry = inspection(args.intentId), marker = "CODX_AME_"+entry.intentId, wanted = expected(entry,args,marker);
        checkIdle(entry); directory(outputDir); const outputPath = path.join(outputDir,entry.intentId+".mov"); if (fs.existsSync(outputPath)) fail("ame_open_output_collision");
        const facts = {schema:SCHEMA,intentId:entry.intentId,args,runId:row.context.runId,proposalId:row.context.record.actionId,selector:entry.selector,before:entry.before,actor:entry.actor,ameProcess:entry.ameProcess,idle:entry.idle,marker,outputPath,menu:entry.before.menu,menuMetadataHash:entry.menuMetadataHash,...wanted,deadline:Math.min(Date.parse(row.context.record.proposalExpiresAt),entry.expiresAt,Date.parse(entry.idle.observedAt)+IDLE_TTL,now()+90000)};
        a = {...facts,binding:hash(facts)}; assertContext(row,args);
        // Durable intent and restore debt precede setters and native delivery.
        write(file(a.intentId,"intent"),a,true); state(a,"prepared"); inspections.delete(a.intentId);
        menuPins.set(hash(a.actor.aeProcess),a.menuMetadataHash);
        const slot = slotValid(await invoke(native.dispatchScript(a),true,a,"dispatch"),a), command = read(file(a.intentId,"dispatch-command"));
        write(file(a.intentId,"native"),slot); state(a,slot.dispatchReturned?"native_dispatched":"unknown",{commandId:command?.commandId || null});
        let noEffectProven=false;
        if(slot.dispatchAttempted===false&&slot.applied.length===0){const checked=await reconcileAttempt(a);if(checked.noEffectProven===true){state(a,"no_effect_proven",{commandId:command?.commandId||null,historicalExecutionOutcome:"unknown",noEffectProven:true});noEffectProven=true;}}
        return result(a,slot,command || {runId:a.runId,commandId:null},{restoreDebt:debts.has(a.intentId),noEffectProven});
      }
      a = read(file(args.intentId,"intent")); const currentState = await reconcileAttempt(a); assertContext(row,args);
      if (!currentState.restorable) fail(currentState.code || "ame_open_restore_not_proven");
      const restoreAttempt = {...a,activeRunId:row.context.runId}; write(file(a.intentId,"restore-attempt"),{originalRunId:a.runId,restoreRunId:row.context.runId,expectedCurrent:currentState.fresh},true); state(a,"restore_prepared");
      const program = {...a,originalRunId:a.runId,expectedCurrent:currentState.fresh,restoredSnapshot:restoredSnapshot(a,currentState.slot),deadline:Math.min(Date.parse(row.context.record.proposalExpiresAt),now()+60000)};
      const slot = slotValid(await invoke(native.restoreScript(program),true,restoreAttempt,"restore"),a), command = read(file(a.intentId,"restore-command"));
      const checked = await reconcileAttempt(a); if (!slot.restored || !checked.restored) fail(checked.code || "ame_open_restore_unverified");
      write(file(a.intentId,"native"),slot); state(a,"restored",{commandId:command.commandId}); return result(a,slot,command,{authorization:{runId:command.runId,proposalId:row.context.record.actionId},restored:true,restoreScope:slot.restoreScope,restoredObservation:checked.fresh,proofSource:"native_exact_property_restore"});
    } catch (error) {
      const command = a && read(file(a.intentId,name === RESTORE?"restore-command":"dispatch-command"));
      if (a) state(a,name === RESTORE || command?"unknown":"failed_before_native",{code:error.code || error.message});
      return {ok:false,schema:SCHEMA,intentId:a?.intentId || args.intentId,phase:"unknown",code:error.code || error.message,selector:command?{runId:command.runId,commandId:command.commandId}:null,restoreDebt:a?debts.has(a.intentId):false,replayAllowed:false,automaticRetryAllowed:false,mediaVerified:false,executionAuthority:false};
    } finally { busy = false; }
  }
  async function reconcile(raw) {
    const selector = validateInput(RECONCILE,raw); if (busy) fail("ame_open_busy");
    const matches = []; for (const a of debts.values()) for (const kind of ["dispatch","restore"]) { const command = read(file(a.intentId,kind+"-command")); if (command?.runId === selector.runId && command.commandId === selector.commandId) matches.push({a,command}); }
    // Completed restores remain queryable by the exact original command too.
    if (!matches.length && fs.existsSync(stateDir)) for (const name of fs.readdirSync(stateDir).filter(v => /^[a-f0-9-]{36}\.intent\.json$/.test(v))) { const a = read(path.join(stateDir,name)); for (const kind of ["dispatch","restore"]) { const command = read(file(a.intentId,kind+"-command")); if (command?.runId === selector.runId && command.commandId === selector.commandId) matches.push({a,command}); } }
    if (matches.length !== 1) fail("ame_open_exact_original_command_required");
    const {a,command} = matches[0], checked = await reconcileAttempt(a);
    if(checked.restored&&debts.has(a.intentId)){write(file(a.intentId,"native"),checked.slot);state(a,"restored",{commandId:command.commandId,reconciledFromUnknown:true,replayAllowed:false});}
    if(checked.noEffectProven&&debts.has(a.intentId)){write(file(a.intentId,"native"),checked.slot);state(a,"no_effect_proven",{commandId:command.commandId,historicalExecutionOutcome:"unknown",noEffectProven:true});}
    return result(a,checked.slot,command,{ok:checked.restored || checked.restorable && checked.slot.dispatchReturned === true,restorable:checked.restorable,restored:checked.restored === true,noEffectProven:checked.noEffectProven===true,code:checked.code,currentObservation:checked.fresh,privateProofVerified:checked.restored || checked.restorable,proofSource:"native_exact_keyed_readback",restoreDebt:debts.has(a.intentId)});
  }
  function report(raw) {
    const args = validateInput(REPORT,raw), a = read(file(args.intentId,"intent"));
    if (!a || !samePath(args.outputPath,a.outputPath) || args.preset!==a.selector.presetLabel || !native.equal(args.range,a.before.range)) fail("ame_open_ui_report_binding_changed");
    const receiptFile=file(args.intentId,"ui-receipt"),prior=read(receiptFile),binding=value=>({intentId:value.intentId,fullMarker:value.fullMarker,outputPath:value.outputPath,preset:value.preset,range:value.range,source:value.source,executionAuthority:value.executionAuthority});
    if(prior){if(!native.equal(binding(prior),binding(args)))fail("ame_open_ui_receipt_conflict");return prior;}
    if(Date.parse(args.observedAt)>now()||now()-Date.parse(args.observedAt)>INSPECTION_TTL)fail("ame_open_ui_report_time_changed");
    const value = {...args,reportId:crypto.randomUUID(),proofSource:"agent_ui_observed",nativeJobId:null,mediaVerified:false,executionAuthority:false,queueAcceptance:"operator_observed_exact_marker_and_output"}; write(receiptFile,value,true); return value;
  }
  async function assertProjectMutationAllowed(name,projectMutation) {
    if (!projectMutation || MUTATIONS.includes(name) || !debts.size) return;
    const active = await deps.inspectAeProcesses();
    // This daemon controls one AE actor. A different process birth does not
    // inherit an old process's debt; the old journal remains unresolved.
    if (active.some(process => [...debts.values()].some(a => native.equal(a.actor.aeProcess,process)))) {
      const currentProject = await invoke(native.identityScript());
      if ([...debts.values()].some(a => active.some(process => native.equal(a.actor.aeProcess,process)) && samePath(currentProject?.projectFile,a.before.snapshot.projectFile))) fail("ame_open_restore_debt_blocks_automation_project_mutation");
    }
  }
  return {inspect,declare,preflight,authorize,execute,reconcile,report,prepareNative,assertNative,queued,assertProjectMutationAllowed,status:() => ({busy,protection:"bounded_property_journal",restoreDebts:[...debts.keys()],replayAllowed:false})};
}
function verifyResult(name,result,args) {
  validateInput(name,args);
  if (result?.ok !== true || result.schema !== SCHEMA || result.intentId !== args.intentId || !UUID.test(result.selector?.runId || "") || !UUID.test(result.selector?.commandId || "") || result.executionAuthority !== false || result.mediaVerified !== false || result.replayAllowed !== false || result.nativeJobId !== null || name === DISPATCH && (result.phase !== "native_dispatched" || result.dispatchReturned !== true || result.queueAcceptance !== "pending_ui_observation") || name === RESTORE && (result.phase !== "restored" || result.restored !== true || result.restoreDebt !== false)) fail("ame_open_result_unverified");
  return {ok:true,scope:name === DISPATCH?"one_native_dispatch_queue_acceptance_pending_ui":"exact_property_journal_restored",mediaVerified:false,executionAuthority:false};
}
function toolDefinitions() {
  const uuidSchema = {type:"string",pattern:UUID.source}, hashSchema = {type:"string",pattern:SHA.source}, integer = {type:"integer",minimum:1}, processSchema = {type:"object",additionalProperties:false,required:["pid","startedAt","path"],properties:{pid:integer,startedAt:{type:"string"},path:{type:"string"}}}, rangeSchema = {type:"object",additionalProperties:false,required:["startSeconds","endSeconds"],properties:{startSeconds:{type:"number",minimum:0},endSeconds:{type:"number"}}};
  const definitions = [
    [INSPECT,"Read one explicit open AE comp and bounded reachable expressions; server creates an intent UUID. No AEP file IO. Inspect menu/build/locale metadata before a proposal. Bind the requested preset label as intent data.",{compItemId:integer,allowedLayerIds:{type:"array",minItems:1,maxItems:1000,uniqueItems:true,items:integer},presetLabel:{type:"string",minLength:1,maxLength:240}}],
    [DECLARE,"Record a fresh operator observation of THIS intent's AME process birth: idle and automatic queue start disabled. Prerequisite only; never execution authority.",{intentId:uuidSchema,ameProcess:processSchema,observedAt:{type:"string"},source:{const:"agent_ui_observed"},idle:{const:true},autoStartDisabled:{const:true},executionAuthority:{const:false}}],
    [DISPATCH,"One proposal-backed native Add to AME menu dispatch for a server intent. Temporarily marks comp name and changes only controlled enabled flags. Bounded property journal replaces AEP checkpoint only for this isolated tool. Queue acceptance requires exact full-marker UI observation; never START.",{intentId:uuidSchema,selectedLayerId:integer,expectedRevision:{type:"integer",minimum:0},expectedStateHash:hashSchema,menuMetadataHash:hashSchema}],
    [RESTORE,"Exact guarded restoration of one server intent's comp name; successful dispatch keeps selected visibility. Proven partial failure may roll back only journaled flags. Requires its own isolated current proposal/dry-run. Manual drift or UNKNOWN cannot authorize replay.",{intentId:uuidSchema}],
    [RECONCILE,"Read/reconcile one exact original runId/commandId using retained native keyed slot plus fresh target read. Never replay menu or setters.",{runId:uuidSchema,commandId:uuidSchema}],
    [REPORT,"Record the first immutable operator UI receipt for full UUID marker + unique output path/preset/workArea. Same binding returns the first receipt; conflicts fail. Native job ID remains null, mediaVerified and executionAuthority false. This report cannot mint a capability or release restore debt.",{intentId:uuidSchema,fullMarker:{type:"string"},outputPath:{type:"string"},preset:{type:"string",minLength:1,maxLength:240},range:rangeSchema,observedAt:{type:"string"},source:{const:"agent_ui_observed"},executionAuthority:{const:false}}]
  ];
  return definitions.map(([name,description,properties]) => ({name,description,annotations:{readOnlyHint:!MUTATIONS.includes(name),destructiveHint:false,idempotentHint:false},inputSchema:{type:"object",additionalProperties:false,required:Object.keys(properties),properties}}));
}
module.exports = {INSPECT,DECLARE,DISPATCH,RESTORE,RECONCILE,REPORT,SCHEMA,MUTATIONS,validateInput,inspectAeProcesses,createExecutor,verifyResult,toolDefinitions,hash};
