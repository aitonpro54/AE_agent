"use strict";

// Fixed trusted package entry. Paths select deployment, never session authority.
// Native constructors independently check original OS objects and sealed pins.
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const FIXED_ROOT = path.join(ROOT, ".codex-autonomy", "trusted-read");
const FIXED_ADDON = path.join(FIXED_ROOT, "LocalSessionNodeClient.node");
const roles = new WeakMap(), caps = new WeakMap();
let controller = null, daemon = null, addon = null;
function fail(code) { throw Object.assign(Error(code), {code}); }
function emptyArguments(args) { if (args.length) fail("owned_initial_fixed_factory_arguments_forbidden"); }
function selectedFixed() {
  return fs.existsSync(FIXED_ROOT) || Object.keys(process.env).some(k => /^AE_AGENT_(?:TRUSTED_READ_|LOCAL_SESSION_)/i.test(k));
}
function loadFixed() {
  if (addon) return addon;
  if (process.platform !== "win32" || process.arch !== "x64" || process.version !== "v24.19.0" || Number(process.versions.napi) < 8)
    fail("owned_initial_current_runtime_refused");
  if (Object.keys(process.env).some(k => /^(?:NODE_OPTIONS|NODE_PATH)$/i.test(k) || /^AE_OWNED_RUNTIME_/i.test(k)))
    fail("owned_initial_mixed_or_preloaded_runtime_refused");
  if (!fs.existsSync(FIXED_ADDON)) fail("owned_initial_fixed_installation_incomplete");
  const st = fs.lstatSync(FIXED_ADDON);
  if (!st.isFile() || st.isSymbolicLink() || fs.realpathSync(FIXED_ADDON).toLowerCase() !== FIXED_ADDON.toLowerCase())
    fail("owned_initial_addon_locator_refused");
  const loaded = require(FIXED_ADDON);
  if (Reflect.ownKeys(loaded).length !== 2 || typeof loaded.openControllerFixed !== "function" || typeof loaded.bindOriginalDaemonFixed !== "function")
    fail("owned_initial_native_surface_refused");
  addon = loaded;
  return addon;
}
function assertRole(role, kind) {
  const own = roles.get(role);
  if (!own || kind && own.kind !== kind) fail("owned_initial_original_role_required");
  return own;
}
function wrapCap(role, native) {
  if (!native || typeof native !== "object") fail("owned_initial_native_capability_missing");
  const cap = Object.freeze(Object.create(null));
  caps.set(cap, {role, native});
  return cap;
}
function nativeCap(role, cap) {
  const value = caps.get(cap);
  if (!value || value.role !== role) fail("owned_initial_own_capability_required");
  return value.native;
}
function bind(kind) {
  const original = kind === "controller" ? loadFixed().openControllerFixed() : loadFixed().bindOriginalDaemonFixed();
  let closed = false;
  const role = Object.freeze(Object.create(null));
  roles.set(role, {kind, original,
    assertCurrent(cap) {
      if (closed) fail("owned_initial_original_role_closed");
      original.assertSessionCurrent(cap === undefined ? undefined : nativeCap(role, cap));
    },
    async operation(name, ownCaps = [], values = []) {
      if (closed) fail("owned_initial_original_role_closed");
      // No generic frame/verb exposure. Every named native method has its own
      // role/type/ledger predicate; this private helper is never exported.
      const value = await original[name](...ownCaps.map(c => nativeCap(role, c)), ...values);
      original.assertSessionCurrent(); // after the last native await
      return value;
    },
    async revoke() {
      if (closed) return;
      closed = true;
      await original.revokeOnce();
    },
    async dispositionOperation(name,cap) {
      if(kind!=="daemon")fail("owned_initial_original_daemon_required");
      original.assertOriginalDispositionCurrent();const value=await original[name](...(cap===undefined?[]:[nativeCap(role,cap)]));
      original.assertOriginalDispositionCurrent();return value;
    }
  });
  return role;
}
function openControllerFixed() { emptyArguments(arguments); return controller || (controller = bind("controller")); }
function bindOriginalDaemonFixed() { emptyArguments(arguments); return daemon || (daemon = bind("daemon")); }
function assertCurrent(role, cap) { assertRole(role).assertCurrent(cap); }
async function ownOperation(role, name, ownCaps, values) {
  const value = await assertRole(role).operation(name, ownCaps, values);
  return wrapCap(role, value);
}
async function open(role) { return assertRole(role, "controller").operation("open"); }
async function ensure(role) { return assertRole(role, "controller").operation("ensure"); }
async function status(role) { return assertRole(role).operation("status"); }
function beginPanel(role) { assertRole(role, "controller"); return ownOperation(role, "beginPanel", [], []); }
function beginBracket(role) { assertRole(role, "controller"); return ownOperation(role, "beginBracket", [], []); }
function beginRead(role, name, authorization) {
  assertRole(role, "controller");
  if (!["get_bridge_status", "get_project_info"].includes(name)) fail("owned_initial_read_tool_refused");
  return ownOperation(role, "beginRead", [authorization], [name]);
}
const EXECUTION_TOOLS = Object.freeze(["build_solution_plan", "propose_ai_agent_plan", "run_ai_agent_plan", "inspect_title_variants",
  "get_comp_details", "get_layer_details", "inspect_ame_title_sources", "enqueue_ame_title_variant", "inspect_ame_title_queue_manifest", "start_ame_title_batch"]);
function beginExecutionFixed(role, authorization, intent) {
  assertRole(role, "controller");
  if (!intent || typeof intent !== "object" || !EXECUTION_TOOLS.includes(intent.name)) fail("owned_initial_execution_tool_refused");
  return ownOperation(role, "beginExecutionFixed", [authorization], [intent]);
}
function beginServerOnlyFixed(role, name, body) {
  assertRole(role, "controller");
  if (!["search_solutions", "get_solution"].includes(name)) fail("owned_initial_server_only_tool_refused");
  return ownOperation(role, "beginServerOnlyFixed", [], [name, body]);
}
function adoptBracket(role, bracket) { assertRole(role, "controller"); return ownOperation(role, "adoptBracket", [bracket], []); }
function locator(role, call) { assertRole(role, "controller"); assertCurrent(role, call); return assertRole(role).original.toolLocator(nativeCap(role, call)); }
function verifyTool(role, request, name) {
  assertRole(role, "daemon");
  if (!["ensure_ae_agent_panel", "get_bridge_status", "get_project_info"].includes(name)) fail("owned_initial_tool_refused");
  return ownOperation(role, "verifyTool", [request], [name]);
}
function verifyExecutionTool(role, request, name) {
  assertRole(role, "daemon");
  if (!EXECUTION_TOOLS.includes(name)) fail("owned_initial_execution_tool_refused");
  return ownOperation(role, "verifyExecutionTool", [request], [name]);
}
function verifyServerOnlyTool(role, request, name) {
  assertRole(role, "daemon");
  if (!["search_solutions", "get_solution"].includes(name)) fail("owned_initial_server_only_tool_refused");
  return ownOperation(role, "verifyServerOnlyTool", [request], [name]);
}
async function captureServerOnlyResultFixed(role, handler) {
  assertRole(role, "daemon"); const result = await assertRole(role).operation("captureServerOnlyResultFixed", [handler], []);
  return Object.freeze({ terminal: wrapCap(role, result.terminal), value: result.value });
}
function takeChallenge(role, target) { assertRole(role, "daemon"); return ownOperation(role, "takeChallenge", [target], []); }
function submitObservation(role, challenge, observation) { assertRole(role, "daemon"); return ownOperation(role, "submitObservation", [challenge, observation], []); }
function observeActor(role, handler, observation) { assertRole(role, "daemon"); return ownOperation(role, "observeActor", [handler, observation], []); }
function captureOriginalAeCepFixed(role) { assertRole(role, "daemon"); return ownOperation(role, "captureOriginalAeCepFixed", [], []); }
function captureOriginalAeFixed(role) { assertRole(role,"daemon"); return ownOperation(role,"captureOriginalAeFixed",[],[]); }
function captureOriginalAmeFixed(role) { assertRole(role,"daemon"); return ownOperation(role,"captureOriginalAmeFixed",[],[]); }
function captureSelectionFixed(role,project,comp,root){if(arguments.length!==4)fail("owned_initial_selection_arguments");assertRole(role,"daemon");return ownOperation(role,"captureSelectionFixed",[project,comp,root],[]);}
function describeSelectionFixed(role,selection){if(arguments.length!==2)fail("owned_initial_selection_descriptor_arguments");assertRole(role,"daemon");assertCurrent(role,selection);const value=assertRole(role).original.describeSelectionFixed(nativeCap(role,selection));assertCurrent(role,selection);return Object.freeze(value);}
function captureManifestFixed(role,selection,graph){if(arguments.length!==3)fail("owned_initial_manifest_arguments");assertRole(role,"daemon");return ownOperation(role,"captureManifestFixed",[selection,graph],[]);}
function assertPreactorCurrent(role,preactor){assertRole(role,"daemon").original.assertPreactorCurrent(nativeCap(role,preactor));}
function preactorObserverDefinition(role,preactor){assertPreactorCurrent(role,preactor);return assertRole(role,"daemon").original.preactorObserverDefinition(nativeCap(role,preactor));}
function reservePanelBootstrapFixed(role,handler,preactor){assertRole(role,"daemon");return ownOperation(role,"reservePanelBootstrapFixed",[handler,preactor],[]);}
function launchPanelBootstrapFixed(role,bootstrap,preactor){assertRole(role,"daemon");return assertRole(role).operation("launchPanelBootstrapFixed",[bootstrap,preactor],[]);}
function assertBootstrapSettled(role){assertRole(role,"daemon").original.assertBootstrapSettled();}
function assertCapturedCurrent(role,target){assertRole(role,"daemon").original.assertCapturedCurrent(nativeCap(role,target));}
function cepSourceInventory(role,target){assertCapturedCurrent(role,target);return assertRole(role).original.cepSourceInventory(nativeCap(role,target));}
function invalidateLoadedCepProof(role){assertRole(role,"daemon").original.invalidateLoadedCepProof();}
function captureObservationFixed(role,target,challenge){assertRole(role,"daemon");return ownOperation(role,"captureObservationFixed",[target,challenge],[]);}
function fixedDaemonTransport(role){assertRole(role,"daemon");assertCurrent(role);return assertRole(role).original.fixedDaemonTransport();}
function nodeSourceInventory(role) { assertCurrent(role); return assertRole(role).original.nodeSourceInventory(); }
function panelSourceInventory(role) { assertCurrent(role); return assertRole(role).original.panelSourceInventory(); }
function bindLoadedNodeProof(role, records) { assertCurrent(role); assertRole(role).original.bindLoadedNodeProof(records); assertCurrent(role); }
function invalidateLoadedNodeProof(role) { assertRole(role).original.invalidateLoadedNodeProof(); }
function fixedTransport(role) { assertCurrent(role); return assertRole(role).original.fixedTransport(); }
function assertHttp(role) { assertRole(role, "daemon"); assertCurrent(role); assertRole(role).original.assertCurrent(); }
async function openHttpListenerFixed(role) { assertHttp(role); return ownOperation(role,"openHttpListenerFixed",[],[]); }
async function acceptFixed(role, listener) { assertHttp(role); return ownOperation(role,"acceptFixed",[listener],[]); }
function connectionPeer(role, connection) { assertHttp(role); return assertRole(role).original.connectionPeer(nativeCap(role,connection)); }
function brandHttpStream(role, connection, stream) { assertHttp(role); assertRole(role).original.brandHttpStream(nativeCap(role,connection),stream); }
function connectionRead(role, connection) { assertHttp(role); return assertRole(role).operation("connectionRead",[connection],[]); }
function connectionWrite(role, connection, bytes) { assertHttp(role); return assertRole(role).operation("connectionWrite",[connection],[bytes]); }
function connectionEnd(role, connection) { return assertRole(role,"daemon").dispositionOperation("connectionEnd",connection); }
function connectionClose(role, connection) { return assertRole(role,"daemon").dispositionOperation("connectionClose",connection); }
function closeHttpListenerFixed(role, listener) { return assertRole(role,"daemon").dispositionOperation("closeHttpListenerFixed",listener); }
function readRevokedKnown(role) { return assertRole(role,"daemon").original.readRevokedKnown(); }
async function retainAuthenticatedRequest(role, connection, req, body) { assertHttp(role); return ownOperation(role,"retainAuthenticatedRequest",[connection],[req,body]); }
function completeAuthenticatedResponse(role, request, status, bytes) { assertHttp(role); return assertRole(role).operation("completeAuthenticatedResponse",[request],[status,bytes]); }
function failAuthenticatedResponse(role, request) { assertRole(role,"daemon"); return assertRole(role).operation("failAuthenticatedResponse",[request],[]); }
function completeOriginalIdleRequestCleanup(role,request){return assertRole(role,"daemon").dispositionOperation("completeOriginalIdleRequestCleanup",request);}
function revoke(role) { return assertRole(role).revoke(); }
function assertOriginalDispositionCurrent(role){assertRole(role,"daemon").original.assertOriginalDispositionCurrent();}
async function pollOriginalEvent(role){const value=await assertRole(role,"daemon").dispositionOperation("pollOriginalEvent");return value===null?null:wrapCap(role,value);}
function originalEventKind(role,event){assertOriginalDispositionCurrent(role);return assertRole(role,"daemon").original.originalEventKind(nativeCap(role,event));}
function acknowledgeOriginalDisposition(role,event){return assertRole(role,"daemon").dispositionOperation("acknowledgeOriginalDisposition",event);}
async function captureLocalStatusFixed(role,handler){assertRole(role,"daemon");const result=await assertRole(role).operation("captureLocalStatusFixed",[handler],[]);
  return Object.freeze({terminal:wrapCap(role,result.terminal),value:result.value});}
function bindProjectFixed(role,handler){assertRole(role,"daemon");return ownOperation(role,"bindProjectFixed",[handler],[]);}
function bindExecutionFixed(role,handler){if(arguments.length!==2)fail("owned_initial_readonly_bind_arguments");assertRole(role,"daemon");return ownOperation(role,"bindExecutionFixed",[handler],[]);}
function bindPreparationDeliveryFixed(role,handler,manifest,currentRead){if(arguments.length!==4)fail("owned_initial_preparation_delivery_bind_arguments");assertRole(role,"daemon");return ownOperation(role,"bindPreparationDeliveryFixed",[handler,manifest,currentRead],[]);}
function bindStageDeliveryFixed(role,gate,workingCopy){if(arguments.length!==3)fail("owned_initial_stage_delivery_bind_arguments");assertRole(role,"daemon");return ownOperation(role,"bindStageDeliveryFixed",[gate,workingCopy],[]);}
function describeRestorationDebtFixed(role){if(arguments.length!==1)fail("owned_initial_restore_debt_facts_arguments");const owner=assertRole(role,"daemon");return Object.freeze(owner.original.describeRestorationDebtFixed());}
function preissueRestorationFixed(role,gate,workingCopy){if(arguments.length!==3)fail("owned_initial_restore_preissue_arguments");assertRole(role,"daemon");return ownOperation(role,"preissueRestorationFixed",[gate,workingCopy],[]);}
function bindRestorationDeliveryFixed(role,gate,program){if(arguments.length!==3)fail("owned_initial_restore_bind_arguments");assertRole(role,"daemon");return ownOperation(role,"bindRestorationDeliveryFixed",[gate,program],[]);}
function bindAmeSourceInspectionFixed(role,handler,snapshot,ame){if(arguments.length!==4)fail("owned_initial_ame_source_bind_arguments");assertRole(role,"daemon");return ownOperation(role,"bindAmeSourceInspectionFixed",[handler,snapshot,ame],[]);}
function bindAmeDeliveryFixed(role,gate,snapshot,ame){if(arguments.length!==4)fail("owned_initial_ame_delivery_bind_arguments");assertRole(role,"daemon");return ownOperation(role,"bindAmeDeliveryFixed",[gate,snapshot,ame],[]);}
function bindOriginalJobFixed(role,terminal){if(arguments.length!==2)fail("owned_initial_d47_arguments");assertRole(role,"daemon");return ownOperation(role,"bindOriginalJobFixed",[terminal],[]);}
function ameQueuePreparationFactsFixed(role,terminal){if(arguments.length!==2)fail("owned_initial_ame_queue_facts_arguments");assertRole(role,"daemon");return Object.freeze(assertRole(role).original.ameQueuePreparationFactsFixed(nativeCap(role,terminal)));}
function assertAmeCommandCurrentFixed(role,command){if(arguments.length!==2)fail("owned_initial_ame_command_guard_arguments");assertRole(role,"daemon");return assertRole(role).original.assertAmeCommandCurrentFixed(nativeCap(role,command));}
function captureOriginalAmeManualReservationFixed(role,command){if(arguments.length!==2)fail("owned_initial_ame_marker_capture_arguments");assertRole(role,"daemon");return assertRole(role).operation("captureOriginalAmeManualReservationFixed",[command],[]);}
function ameCommandFactsFixed(role,command){if(arguments.length!==2)fail("owned_initial_ame_command_facts_arguments");assertRole(role,"daemon");return Object.freeze(assertRole(role).original.ameCommandFactsFixed(nativeCap(role,command)));}
async function captureAmeResultFixed(role,command,request){if(arguments.length!==3)fail("owned_initial_ame_result_arguments");assertRole(role,"daemon");const result=await assertRole(role).operation("captureAmeResultFixed",[command,request],[]);if(!result||typeof result!=="object"||Array.isArray(result)||Object.keys(result).sort().join(",")!=="terminal,value")fail("owned_initial_ame_original_result_join");return Object.freeze({terminal:wrapCap(role,result.terminal),value:result.value});}
async function captureRestorationResultFixed(role,command,request){if(arguments.length!==3)fail("owned_initial_restore_result_arguments");assertRole(role,"daemon");const result=await assertRole(role).operation("captureRestorationResultFixed",[command,request],[]);if(!result||typeof result!=="object"||Array.isArray(result)||Object.keys(result).sort().join(",")!=="terminal,value")fail("owned_initial_restore_original_result_join");return Object.freeze({terminal:wrapCap(role,result.terminal),value:result.value});}
function manualExecutionPreflightFixed(role,handler,manifest,currentRead){if(arguments.length!==4)fail("owned_initial_manual_preflight_arguments");assertRole(role,"daemon");assertCurrent(role,handler);return Object.freeze(assertRole(role).original.manualExecutionPreflightFixed(nativeCap(role,handler),nativeCap(role,manifest),nativeCap(role,currentRead)));}
function acceptOriginalManualAdoptFixed(role,proposal,dryRun,request){if(arguments.length!==4)fail("owned_initial_manual_adopt_arguments");assertRole(role,"daemon");return assertRole(role).operation("acceptOriginalManualAdoptFixed",[proposal,dryRun,request],[]);}
function originalDeadlineProjectionFixed(role,command){if(arguments.length<1||arguments.length>2)fail("owned_initial_original_deadline_arguments");const own=assertRole(role,"daemon");return Object.freeze(own.original.originalDeadlineProjectionFixed(...(arguments.length===2?[nativeCap(role,command)]:[])));}
function executeOwnedCheckpointFixed(role,gate){if(arguments.length!==2)fail("owned_initial_checkpoint_execute_arguments");assertRole(role,"daemon");return ownOperation(role,"executeOwnedCheckpointFixed",[gate],[]);}
function executeOwnedCleanCopyFixed(role,gate){if(arguments.length!==2)fail("owned_initial_clean_copy_execute_arguments");assertRole(role,"daemon");return ownOperation(role,"executeOwnedCleanCopyFixed",[gate],[]);}
function describeOwnedCheckpointFixed(role,cap){if(arguments.length!==2)fail("owned_initial_checkpoint_descriptor_arguments");assertRole(role,"daemon");assertCurrent(role,cap);return Object.freeze(assertRole(role).original.describeOwnedCheckpointFixed(nativeCap(role,cap)));}
function describeOwnedCleanCopyFixed(role,cap){if(arguments.length!==2)fail("owned_initial_clean_copy_descriptor_arguments");assertRole(role,"daemon");assertCurrent(role,cap);return Object.freeze(assertRole(role).original.describeOwnedCleanCopyFixed(nativeCap(role,cap)));}
function describeOwnedSavedSnapshotFixed(role,cap){if(arguments.length!==2)fail("owned_initial_saved_snapshot_descriptor_arguments");assertRole(role,"daemon");assertCurrent(role,cap);return Object.freeze(assertRole(role).original.describeOwnedSavedSnapshotFixed(nativeCap(role,cap)));}
async function captureStageResultFixed(role,command,request){if(arguments.length!==3)fail("owned_initial_stage_result_arguments");assertRole(role,"daemon");const result=await assertRole(role).operation("captureStageResultFixed",[command,request],[]);
  if(!result||typeof result!=="object"||Array.isArray(result)||Object.keys(result).sort().join(",")!=="savedSnapshot,terminal,value"||result.savedSnapshot===result.terminal)fail("owned_initial_stage_original_result_join");
  return Object.freeze({terminal:wrapCap(role,result.terminal),savedSnapshot:wrapCap(role,result.savedSnapshot),value:result.value});}
async function captureExecutionPreparationFixed(role,handler,manifest,currentRead){if(arguments.length!==4)fail("owned_initial_preparation_capture_arguments");assertRole(role,"daemon");
  const result=await assertRole(role).operation("captureExecutionPreparationFixed",[handler,manifest,currentRead],[]);
  if(!result||typeof result!=="object"||Array.isArray(result)||Object.keys(result).sort().join(",")!=="terminal,value")fail("owned_initial_preparation_capture_result");
  return Object.freeze({terminal:wrapCap(role,result.terminal),value:result.value});}
function captureServerGatesFixed(role,handler,manifest,proposal,dryRun,currentRead,panelRequest){if(arguments.length!==7)fail("owned_initial_execution_gate_arguments");assertRole(role,"daemon");
  return ownOperation(role,"captureServerGatesFixed",[handler,manifest,proposal,dryRun,currentRead,panelRequest],[]);}
function describeExecution(role,command){assertRole(role,"daemon");assertCurrent(role);return Object.freeze(assertRole(role).original.describeExecution(nativeCap(role,command)));}
function selectExecution(role,command,request){assertRole(role,"daemon");return ownOperation(role,"selectExecution",[command,request],[]);}
function guardExecution(role,selected,request){assertRole(role,"daemon");return ownOperation(role,"guardExecution",[selected,request],[]);}
function recordExecutionSubmission(role,command,request){assertRole(role,"daemon");return assertRole(role).operation("recordExecutionSubmission",[command,request],[]);}
async function captureExecutionResultFixed(role,command,request){assertRole(role,"daemon");const result=await assertRole(role).operation("captureExecutionResultFixed",[command,request],[]);
  const keys=result&&Object.keys(result).sort().join(","),projected=keys==="readTerminal,terminal,titleSelectionMode,value";
  if(!result||typeof result!=="object"||Array.isArray(result)||(!projected&&keys!=="terminal,titleSelectionMode,value")||
      !["first_two_observed_text_states_v1","exact_named_variants"].includes(result.titleSelectionMode))fail("owned_initial_native_selection_mode_required");
  const captured={terminal:wrapCap(role,result.terminal),value:result.value,titleSelectionMode:result.titleSelectionMode};
  if(projected){if(result.terminal===result.readTerminal)fail("owned_initial_distinct_dry_read_projection_required");captured.readTerminal=wrapCap(role,result.readTerminal);}return Object.freeze(captured);}
function describeProject(role,project){assertRole(role,"daemon");assertCurrent(role);return Object.freeze(assertRole(role).original.describeProject(nativeCap(role,project)));}
function selectProject(role,project,request){assertRole(role,"daemon");return ownOperation(role,"selectProject",[project,request],[]);}
function guardProject(role,selected,request){assertRole(role,"daemon");return ownOperation(role,"guardProject",[selected,request],[]);}
function recordProjectSubmission(role,project,request){assertRole(role,"daemon");return assertRole(role).operation("recordProjectSubmission",[project,request],[]);}
async function captureProjectResultFixed(role,project,request){assertRole(role,"daemon");const result=await assertRole(role).operation("captureProjectResultFixed",[project,request],[]);
  return Object.freeze({terminal:wrapCap(role,result.terminal),value:result.value});}
function beginOriginalCompletionPollFixed(role,job){if(arguments.length!==2)fail("owned_initial_completion_poll_arguments");assertRole(role,"daemon");return ownOperation(role,"beginOriginalCompletionPollFixed",[job],[]);}
function describeOriginalCompletionPollFixed(role,poll){if(arguments.length!==2)fail("owned_initial_completion_descriptor_arguments");assertRole(role,"daemon");return Object.freeze(assertRole(role).original.describeOriginalCompletionPollFixed(nativeCap(role,poll)));}
function selectOriginalCompletionPollFixed(role,poll,request){if(arguments.length!==3)fail("owned_initial_completion_select_arguments");assertRole(role,"daemon");return ownOperation(role,"selectOriginalCompletionPollFixed",[poll,request],[]);}
function originalCompletionFactsFixed(role,job){if(arguments.length!==2)fail("owned_initial_completion_facts_arguments");assertRole(role,"daemon");return Object.freeze(assertRole(role).original.originalCompletionFactsFixed(nativeCap(role,job)));}
function abandonOriginalCompletionPollFixed(role,poll){if(arguments.length!==2)fail("owned_initial_completion_abandon_arguments");assertRole(role,"daemon");return assertRole(role).operation("abandonOriginalCompletionPollFixed",[poll],[]);}
module.exports = Object.freeze({selectedFixed,openControllerFixed,bindOriginalDaemonFixed,assertCurrent,open,ensure,status,
  beginPanel,beginBracket,beginRead,beginExecutionFixed,beginServerOnlyFixed,adoptBracket,locator,verifyTool,verifyExecutionTool,verifyServerOnlyTool,captureServerOnlyResultFixed,takeChallenge,submitObservation,observeActor,
  captureOriginalAeFixed,captureOriginalAmeFixed,captureSelectionFixed,describeSelectionFixed,captureManifestFixed,captureOriginalAeCepFixed,assertPreactorCurrent,preactorObserverDefinition,reservePanelBootstrapFixed,launchPanelBootstrapFixed,assertBootstrapSettled,assertCapturedCurrent,cepSourceInventory,invalidateLoadedCepProof,captureObservationFixed,nodeSourceInventory,panelSourceInventory,bindLoadedNodeProof,invalidateLoadedNodeProof,fixedTransport,fixedDaemonTransport,
  openHttpListenerFixed,acceptFixed,connectionPeer,brandHttpStream,connectionRead,connectionWrite,connectionEnd,connectionClose,closeHttpListenerFixed,
  retainAuthenticatedRequest,completeAuthenticatedResponse,failAuthenticatedResponse,completeOriginalIdleRequestCleanup,readRevokedKnown,revoke,assertOriginalDispositionCurrent,pollOriginalEvent,originalEventKind,acknowledgeOriginalDisposition,captureLocalStatusFixed,
  bindProjectFixed,describeProject,selectProject,guardProject,recordProjectSubmission,captureProjectResultFixed,
  bindExecutionFixed,bindPreparationDeliveryFixed,captureExecutionPreparationFixed,captureServerGatesFixed,describeExecution,selectExecution,guardExecution,recordExecutionSubmission,captureExecutionResultFixed,
  bindStageDeliveryFixed,describeRestorationDebtFixed,preissueRestorationFixed,bindRestorationDeliveryFixed,captureRestorationResultFixed,manualExecutionPreflightFixed,acceptOriginalManualAdoptFixed,originalDeadlineProjectionFixed,executeOwnedCheckpointFixed,executeOwnedCleanCopyFixed,describeOwnedCheckpointFixed,describeOwnedCleanCopyFixed,describeOwnedSavedSnapshotFixed,captureStageResultFixed,
  bindAmeSourceInspectionFixed,bindAmeDeliveryFixed,bindOriginalJobFixed,ameCommandFactsFixed,captureAmeResultFixed,ameQueuePreparationFactsFixed,assertAmeCommandCurrentFixed,captureOriginalAmeManualReservationFixed,
  beginOriginalCompletionPollFixed,describeOriginalCompletionPollFixed,selectOriginalCompletionPollFixed,originalCompletionFactsFixed,abandonOriginalCompletionPollFixed});
