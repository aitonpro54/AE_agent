"use strict";

// Pure lifecycle contracts. No native dispatch, filesystem writes or client authority.
const crypto = require("crypto");
const path = require("path");
const protection = require("./placeholder-protection");
const VERSION = "ae-agent-project-lifecycle.v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA = /^[a-f0-9]{64}$/;
function canonicalPlanHash(value) {
  if(typeof value!=="string" || !/^(?:sha256:)?[a-f0-9]{64}$/.test(value))fail("lifecycle_plan_hash_invalid");
  return value.startsWith("sha256:") ? value.slice(7) : value;
}
const LIMITS = Object.freeze({ items: 1000, layers: 5000, protected: 200, bytes: 1024 * 1024 });
const SETTINGS = Object.freeze({ bitsPerChannel: "number", workingSpace: "string", linearBlending: "boolean",
  linearizeWorkingSpace: "boolean", expressionEngine: "string", colorManagementSystem: "string",
  timeDisplayType: "number", framesCountType: "number", feetFramesFilmType: "number",
  framesUseFeetFrames: "boolean" });
const MUTATIONS = Object.freeze(["save_project_as", "open_project", "create_named_project", "finalize_project_lifecycle"]);
const TOOLS = Object.freeze([...MUTATIONS, "reconcile_project_lifecycle"]);
function fail(code, detail) { const error = new Error(code + (detail ? ": " + detail : "")); error.code = code; throw error; }
function object(value, code = "lifecycle_invalid_input") {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(code);
  return value;
}
function exact(value, keys, code = "lifecycle_invalid_input") {
  object(value, code); if (Object.keys(value).some(key => !keys.includes(key))) fail(code, "unsupported_field"); return value;
}
function text(value, max = 4096) { if (typeof value !== "string" || !value || value !== value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) fail("lifecycle_invalid_input", "text"); return value; }
function projectPath(value) {
  text(value); const slash = value.replace(/\\/g, "/");
  if (!(path.win32.isAbsolute(value) || path.posix.isAbsolute(value)) || /^\/\//.test(slash) || slash.split("/").some(p => p === "." || p === "..") || path.extname(value).toLowerCase() !== ".aep" || /[<>"|?*]/.test(slash) || /:(?!\/)/.test(slash.replace(/^[A-Za-z]:/, ""))) fail("lifecycle_invalid_input", "local_absolute_aep_required");
  return value;
}
function normalizePath(value) { const slash = String(value || "").replace(/\\/g, "/").replace(/\/+$/, ""); return /^[A-Za-z]:\//.test(slash) ? slash.toLowerCase() : slash; }
function samePath(a, b) { return normalizePath(a) === normalizePath(b); }
function hash(value) { return crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : typeof value === "string" ? value : stableJson(value)).digest("hex"); }
function stableJson(value) { if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]"; if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + stableJson(value[k])).join(",") + "}"; return JSON.stringify(value); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function digest(value) { if (typeof value !== "string" || !SHA.test(value)) fail("lifecycle_invalid_input", "sha256"); return value; }
function nativeTuple(value) {
  exact(value, ["file", "dirty", "revision"], "lifecycle_native_unknown"); projectPath(value.file);
  if (typeof value.dirty !== "boolean" || !Number.isSafeInteger(value.revision) || value.revision < 0) fail("lifecycle_native_unknown"); return clone(value);
}
function validateInput(name, args) {
  if (!TOOLS.includes(name)) fail("lifecycle_unknown_tool");
  if (name === "reconcile_project_lifecycle" || name === "finalize_project_lifecycle") {
    exact(args, ["transitionId"]); if (!UUID.test(args.transitionId || "")) fail("lifecycle_invalid_input", "transitionId"); return { transitionId: args.transitionId };
  }
  const keys = ["expectedSourceProjectFile", "expectedSourceSavedSha25664", "expectedSourceRevision", "expectedSourceDirty", "checkpointLabel", "targetProjectFile", ...(name === "open_project" ? ["expectedTargetSavedSha25664"] : [])];
  exact(args, keys); if (keys.some(key => !Object.prototype.hasOwnProperty.call(args, key))) fail("lifecycle_invalid_input", "missing_field");
  const result = { expectedSourceProjectFile: projectPath(args.expectedSourceProjectFile), expectedSourceSavedSha25664: digest(args.expectedSourceSavedSha25664),
    expectedSourceRevision: args.expectedSourceRevision, expectedSourceDirty: args.expectedSourceDirty, checkpointLabel: text(args.checkpointLabel, 160), targetProjectFile: projectPath(args.targetProjectFile) };
  nativeTuple({ file: result.expectedSourceProjectFile, revision: result.expectedSourceRevision, dirty: result.expectedSourceDirty });
  if (/[/\\:*?"<>|]/.test(result.checkpointLabel)) fail("lifecycle_invalid_input", "checkpointLabel");
  if (samePath(result.expectedSourceProjectFile, result.targetProjectFile)) fail("lifecycle_target_is_source");
  if (name !== "save_project_as" && result.expectedSourceDirty !== false) fail("lifecycle_clean_source_required");
  if (name === "open_project") result.expectedTargetSavedSha25664 = digest(args.expectedTargetSavedSha25664);
  return result;
}
const commonProperties = { expectedSourceProjectFile: { type: "string" }, expectedSourceSavedSha25664: { type: "string", pattern: "^[a-f0-9]{64}$" },
  expectedSourceRevision: { type: "integer", minimum: 0 }, expectedSourceDirty: { type: "boolean" }, checkpointLabel: { type: "string", minLength: 1, maxLength: 160 }, targetProjectFile: { type: "string" } };
const toolDefinitions = Object.freeze(TOOLS.map(name => {
  const properties = name.endsWith("project_lifecycle") ? { transitionId: { type: "string", format: "uuid" } } : { ...commonProperties, ...(name === "open_project" ? { expectedTargetSavedSha25664: { type: "string", pattern: "^[a-f0-9]{64}$" } } : {}) };
  return Object.freeze({ name, description: name === "reconcile_project_lifecycle" ? "Read lifecycle facts without replay or state writes." : "Protected manual terminal lifecycle operation. Reopening changes undo and active project context; disk checkpoint does not restore unsaved memory.", inputSchema: { type: "object", properties, required: Object.keys(properties), additionalProperties: false } });
}));
const nativeSupport = `
function __lcPath(s){s=String(s||"").replace(/\\\\/g,"/").replace(/\\/+$/,"");return /^[A-Za-z]:\\//.test(s)?s.toLowerCase():s;}
function __lcTuple(){if(!app.project || !app.project.file || typeof app.project.file.fsName!=="string")throw new Error("lifecycle_native_unknown");
 var d=app.project.dirty,r=app.project.revision;if(typeof d!=="boolean" || typeof r!=="number" || !isFinite(r) || Math.floor(r)!==r || r<0 || r>9007199254740991)throw new Error("lifecycle_native_unknown");return {file:app.project.file.fsName,dirty:d,revision:r};}
function __lcGuard(e){var a=__lcTuple();if(__lcPath(a.file)!==__lcPath(e.file)||a.dirty!==e.dirty||a.revision!==e.revision)throw new Error("lifecycle_native_guard_changed");}
function __lcNeed(v,t){if(typeof v!==t || (t==="number" && !isFinite(v)))throw new Error("lifecycle_inventory_unknown");return v;}
function __lcID(v){if(typeof v!=="number"||!isFinite(v)||Math.floor(v)!==v||v<1||v>9007199254740991)throw new Error("lifecycle_inventory_identity_unknown");return v;}
function __lcFile(f){if(!f)return null;return {path:__lcNeed(f.fsName,"string"),missing:!__lcNeed(f.exists,"boolean")};}
function __lcSource(s){if(!s)throw new Error("lifecycle_inventory_source_unknown");var kind=typeof FileSource!=="undefined" && s instanceof FileSource?"file":typeof SolidSource!=="undefined" && s instanceof SolidSource?"solid":typeof PlaceholderSource!=="undefined" && s instanceof PlaceholderSource?"placeholder":null;
 if(!kind)throw new Error("lifecycle_inventory_source_unknown");var file=kind==="file"?__lcFile(s.file):null;if(kind==="file" && !file)throw new Error("lifecycle_inventory_source_unknown");return {kind:kind,file:file,isStill:__lcNeed(s.isStill,"boolean")};}
`;
function nativeInventoryScript(options = {}) {
  exact(options, ["expectedNative", "accepted"]); const accepted = options.accepted || [];
  if (!Array.isArray(accepted) || accepted.length > LIMITS.protected) fail("lifecycle_inventory_budget"); accepted.forEach(protection.validateSnapshot);
  const expected = options.expectedNative ? nativeTuple(options.expectedNative) : null;
  return nativeSupport + (expected ? `__lcGuard(${JSON.stringify(expected)});` : "") + `
var __lcBefore=__lcTuple(),__lcP=app.project,__lcItems=[],__lcLayers=0,__lcSettings={},__lcTypes=${JSON.stringify(SETTINGS)};
for(var __lcK in __lcTypes)if(__lcTypes.hasOwnProperty(__lcK))__lcSettings[__lcK]=__lcNeed(__lcP[__lcK],__lcTypes[__lcK]);
var __lcCount=__lcNeed(__lcP.numItems,"number");if(Math.floor(__lcCount)!==__lcCount||__lcCount<0||__lcCount>${LIMITS.items})throw new Error("lifecycle_inventory_budget");
for(var i=1;i<=__lcCount;i++){var item=__lcP.item(i),kind=item instanceof CompItem?"comp":item instanceof FootageItem?"footage":item instanceof FolderItem?"folder":null;
 if(!kind)throw new Error("lifecycle_inventory_unknown_item");var row={id:__lcID(item.id),index:i,kind:kind,name:__lcNeed(item.name,"string"),comment:__lcNeed(item.comment,"string"),parentId:item.parentFolder===__lcP.rootFolder?null:__lcID(item.parentFolder.id)};
 if(kind!=="folder"){row.width=__lcNeed(item.width,"number");row.height=__lcNeed(item.height,"number");row.pixelAspect=__lcNeed(item.pixelAspect,"number");row.duration=__lcNeed(item.duration,"number");row.frameRate=__lcNeed(item.frameRate,"number");row.hasVideo=__lcNeed(item.hasVideo,"boolean");row.hasAudio=__lcNeed(item.hasAudio,"boolean");row.useProxy=__lcNeed(item.useProxy,"boolean");
  if(item.proxySource===undefined)throw new Error("lifecycle_inventory_proxy_unknown");row.proxy=item.proxySource===null?null:__lcSource(item.proxySource);if(row.useProxy && !row.proxy)throw new Error("lifecycle_inventory_proxy_unknown");}
 if(kind==="footage"){if(!item.mainSource || item.file===undefined)throw new Error("lifecycle_inventory_source_unknown");var main=__lcSource(item.mainSource);row.mainSourceKind=main.kind;row.file=__lcFile(item.file);row.mainFile=main.file;row.footageMissing=__lcNeed(item.footageMissing,"boolean");row.isStill=main.isStill;}
 if(kind==="comp"){row.layers=[];var count=__lcNeed(item.numLayers,"number");if(Math.floor(count)!==count||count<0||(__lcLayers+=count)>${LIMITS.layers})throw new Error("lifecycle_inventory_budget");
  for(var l=1;l<=count;l++){var layer=item.layer(l);row.layers.push({id:__lcID(layer.id),index:l,name:__lcNeed(layer.name,"string"),sourceItemId:layer.source?__lcID(layer.source.id):null,
   enabled:__lcNeed(layer.enabled,"boolean"),startTime:__lcNeed(layer.startTime,"number"),inPoint:__lcNeed(layer.inPoint,"number"),outPoint:__lcNeed(layer.outPoint,"number"),stretch:__lcNeed(layer.stretch,"number"),timeRemapEnabled:layer instanceof AVLayer?__lcNeed(layer.timeRemapEnabled,"boolean"):false});}}
 __lcItems.push(row);}
${accepted.length ? protection.aeSupportScript : ""}
var __lcAccepted=${JSON.stringify(accepted)},__lcProtected=[];
for(var n=0;n<__lcAccepted.length;n++){var s=__lcAccepted[n],c=__phFindComp(s.target.compItemId),a=__phFindLayer(c,s.target.layerId),paths=[];for(var p=0;p<s.properties.length;p++)paths.push(s.properties[p].path);__lcProtected.push(__phEvidence(c,a,paths));}
var __lcAfter=__lcTuple();__lcGuard(__lcBefore);return {schema:"${VERSION}.inventory",native:__lcAfter,complete:true,settings:__lcSettings,items:__lcItems,protectedEvidence:__lcProtected};`;
}
function phaseScript(options) {
  exact(options, ["operation", "phase", "expectedNative", "destinationProjectFile", "accepted"]);
  const allowed = { save_project_as: ["save_stage", "open_final"], create_named_project: ["create_stage", "open_final"], open_project: ["open_target"] };
  if (!allowed[options.operation] || !allowed[options.operation].includes(options.phase)) fail("lifecycle_invalid_phase");
  const expected = nativeTuple(options.expectedNative), destination = projectPath(options.destinationProjectFile);
  if (samePath(expected.file, destination)) fail("lifecycle_invalid_phase");
  const accepted = options.accepted || []; if (!Array.isArray(accepted) || accepted.length > LIMITS.protected) fail("lifecycle_inventory_budget"); accepted.forEach(protection.validateSnapshot);
  const guard = nativeSupport + `__lcGuard(${JSON.stringify(expected)});` + (accepted.length ? protection.aeGuardScript(expected.file, accepted) : "");
  const action = options.phase === "save_stage" ? "app.project.save(__lcDestination);" : options.phase === "create_stage" ? 'if(app.project.dirty!==false)throw new Error("lifecycle_clean_source_required");app.newProject();if(!app.project || app.project.numItems!==0)throw new Error("lifecycle_create_not_empty");app.project.save(__lcDestination);'
    : 'if(app.project.dirty!==false)throw new Error("lifecycle_clean_source_required");app.open(__lcDestination);';
  return guard + `var __lcDestination=new File(${JSON.stringify(destination)});if(__lcDestination.exists!==true)throw new Error("lifecycle_destination_missing");${action}var __lcResult=__lcTuple();if(__lcPath(__lcResult.file)!==__lcPath(${JSON.stringify(destination)})||__lcResult.dirty!==false)throw new Error("lifecycle_phase_readback_mismatch");return {phase:${JSON.stringify(options.phase)},native:__lcResult};`;
}
function validateInventory(raw, accepted = []) {
  let value = raw; for (let i = 0; i < 4 && value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "result"); i++) value = value.result;
  if (typeof value === "string") { try { value = JSON.parse(value); } catch (_) { fail("lifecycle_inventory_unknown"); } }
  object(value, "lifecycle_inventory_unknown");
  if (value.schema !== VERSION + ".inventory" || value.complete !== true || !Array.isArray(value.items) || value.items.length > LIMITS.items || !Array.isArray(value.protectedEvidence) || value.protectedEvidence.length !== accepted.length || Buffer.byteLength(JSON.stringify(value), "utf8") > LIMITS.bytes) fail("lifecycle_inventory_budget_or_incomplete");
  nativeTuple(value.native); exact(value.settings, Object.keys(SETTINGS), "lifecycle_inventory_settings_unknown");
  for (const [key, type] of Object.entries(SETTINGS)) if (typeof value.settings[key] !== type || type === "number" && !Number.isFinite(value.settings[key])) fail("lifecycle_inventory_settings_unknown", key);
  const ids = new Set(), layerIds = new Set(); let layerCount = 0;
  const file = v => { if (v === null) return; exact(v, ["path", "missing"], "lifecycle_inventory_file_unknown"); if (typeof v.path !== "string" || !v.path || v.path.length > 4096 || !(path.win32.isAbsolute(v.path) || path.posix.isAbsolute(v.path)) || typeof v.missing !== "boolean") fail("lifecycle_inventory_file_unknown"); };
  const id = v => Number.isSafeInteger(v) && v > 0;
  for (const [index, item] of value.items.entries()) {
    if (!id(item.id) || ids.has(item.id) || item.index !== index + 1 || !["comp", "footage", "folder"].includes(item.kind) || typeof item.name !== "string" || item.name.length > 4096 || typeof item.comment !== "string" || item.comment.length > 4096 || item.parentId !== null && !id(item.parentId)) fail("lifecycle_inventory_identity_unknown"); ids.add(item.id);
    if (item.kind !== "folder") {
      if (["width", "height", "pixelAspect", "duration", "frameRate"].some(k => typeof item[k] !== "number" || !Number.isFinite(item[k])) || ["hasVideo", "hasAudio", "useProxy"].some(k => typeof item[k] !== "boolean") || item.proxy === undefined) fail("lifecycle_inventory_unknown");
      if (item.proxy !== null) { object(item.proxy); file(item.proxy.file); if (!["file", "solid", "placeholder"].includes(item.proxy.kind) || typeof item.proxy.isStill !== "boolean" || item.proxy.kind === "file" && item.proxy.file === null || item.proxy.kind !== "file" && item.proxy.file !== null) fail("lifecycle_inventory_proxy_unknown"); } if (item.useProxy && !item.proxy) fail("lifecycle_inventory_proxy_unknown");
    }
    if (item.kind === "footage") { file(item.file); file(item.mainFile); if (item.file === undefined || item.mainFile === undefined || !["file", "solid", "placeholder"].includes(item.mainSourceKind) || typeof item.footageMissing !== "boolean" || typeof item.isStill !== "boolean" || item.mainSourceKind === "file" && item.file === null || item.mainSourceKind !== "file" && item.file !== null) fail("lifecycle_inventory_source_unknown"); if (stableJson(item.file) !== stableJson(item.mainFile)) fail("lifecycle_inventory_source_unknown"); }
    if (item.kind === "comp") {
      if (!Array.isArray(item.layers) || (layerCount += item.layers.length) > LIMITS.layers) fail("lifecycle_inventory_budget");
      for (const [li, l] of item.layers.entries()) { if (!id(l.id) || layerIds.has(l.id) || l.index !== li + 1 || typeof l.name !== "string" || l.sourceItemId !== null && !id(l.sourceItemId) || ["enabled", "timeRemapEnabled"].some(k => typeof l[k] !== "boolean") || ["startTime", "inPoint", "outPoint", "stretch"].some(k => typeof l[k] !== "number" || !Number.isFinite(l[k]))) fail("lifecycle_inventory_layer_unknown"); layerIds.add(l.id); }
    }
  }
  for (const item of value.items) { if (item.parentId !== null && !value.items.some(p => p.id === item.parentId && p.kind === "folder")) fail("lifecycle_inventory_parent_unknown"); for (const layer of item.layers || []) if (layer.sourceItemId !== null && !ids.has(layer.sourceItemId)) fail("lifecycle_inventory_source_identity_unknown"); }
  const inventory = { complete: true, comps: value.items.filter(i => i.kind === "comp").map(i => ({ itemId: i.id, duration: i.duration, frameRate: i.frameRate, layers: i.layers })), sources: value.items.filter(i => i.kind === "footage").map(i => ({ itemId: i.id, file: i.file && i.file.path, duration: i.duration, footageMissing: i.footageMissing })) };
  accepted.forEach((snapshot, index) => { if (!protection.compareSnapshot(snapshot, value.protectedEvidence[index], inventory).ok) fail("lifecycle_protected_snapshot_mismatch"); });
  return clone(value);
}
function inventoryContent(value) { return { settings: value.settings, items: value.items, protectedEvidence: value.protectedEvidence }; }
function inventoryHash(value) { return hash(inventoryContent(value)); }
function assertInventoryMatch(a, b) { if (inventoryHash(a) !== inventoryHash(b)) fail("lifecycle_inventory_mismatch"); }
function verifyReceipt(receipt) {
  object(receipt, "lifecycle_invalid_receipt");
  exact(receipt, ["contractVersion", "operation", "success", "transitionId", "generation", "inputHash", "sourceNative", "sourceBefore", "sourceAfter", "targetFile", "stageFile", "checkpoint", "sourceInventoryHash", "stageInventoryHash", "targetInventoryHash", "finalNative", "targetEmpty", "authorization", "finalizedBy", "contextRetired", "artisticAccepted", "sourceCheckpointRestoresUnsavedMemory", "undoContextChanged"], "lifecycle_invalid_receipt");
  function file(record) {
    exact(record, ["path", "bytes", "sha256", "fileIdentity", "observedAt"], "lifecycle_invalid_receipt"); projectPath(record.path);
    if (!Number.isSafeInteger(record.bytes) || record.bytes < 1 || !SHA.test(record.sha256 || "") || typeof record.observedAt !== "string" || !Number.isFinite(Date.parse(record.observedAt))) fail("lifecycle_invalid_receipt");
    exact(record.fileIdentity, ["device", "inode"], "lifecycle_invalid_receipt"); if (typeof record.fileIdentity.device !== "string" || !record.fileIdentity.device || typeof record.fileIdentity.inode !== "string" || !record.fileIdentity.inode || record.fileIdentity.inode === "0") fail("lifecycle_invalid_receipt");
  }
  file(receipt.sourceBefore); file(receipt.sourceAfter); file(receipt.targetFile); if (receipt.stageFile !== null) file(receipt.stageFile);
  nativeTuple(receipt.sourceNative);if(!samePath(receipt.sourceNative.file,receipt.sourceBefore.path) || !SHA.test(receipt.inputHash || ""))fail("lifecycle_invalid_receipt");
  if (receipt.contractVersion !== VERSION || receipt.success !== true || !UUID.test(receipt.transitionId || "") || !MUTATIONS.slice(0, 3).includes(receipt.operation) || !Number.isSafeInteger(receipt.generation) || receipt.generation < 1 || receipt.contextRetired !== true) fail("lifecycle_invalid_receipt");
  if (!receipt.sourceBefore || !receipt.sourceAfter || !samePath(receipt.sourceBefore.path, receipt.sourceAfter.path) || receipt.sourceBefore.sha256 !== receipt.sourceAfter.sha256 || stableJson(receipt.sourceBefore.fileIdentity) !== stableJson(receipt.sourceAfter.fileIdentity) || receipt.sourceBefore.bytes !== receipt.sourceAfter.bytes || !SHA.test(receipt.sourceBefore.sha256)) fail("lifecycle_source_disk_changed");
  nativeTuple(receipt.finalNative); if (!samePath(receipt.finalNative.file, receipt.targetFile.path) || receipt.finalNative.dirty !== false || samePath(receipt.targetFile.path, receipt.sourceBefore.path) || stableJson(receipt.targetFile.fileIdentity) === stableJson(receipt.sourceBefore.fileIdentity) || !SHA.test(receipt.targetInventoryHash) || !SHA.test(receipt.sourceInventoryHash) || !receipt.checkpoint || receipt.checkpoint.sha256 !== receipt.sourceBefore.sha256 || receipt.checkpoint.snapshotScope !== "on_disk_before_lifecycle") fail("lifecycle_invalid_receipt");
  const checkpoint = receipt.checkpoint;
  exact(checkpoint, ["path", "bytes", "sha256", "fileIdentity", "observedAt", "checkpointFile", "sourceFile", "label", "snapshotScope"], "lifecycle_invalid_receipt");
  file({ path: checkpoint.path, bytes: checkpoint.bytes, sha256: checkpoint.sha256, fileIdentity: checkpoint.fileIdentity, observedAt: checkpoint.observedAt });
  if (!samePath(checkpoint.path, checkpoint.checkpointFile) || samePath(checkpoint.path, receipt.sourceBefore.path) || !samePath(checkpoint.sourceFile, receipt.sourceBefore.path) || checkpoint.bytes !== receipt.sourceBefore.bytes || stableJson(checkpoint.fileIdentity) === stableJson(receipt.sourceBefore.fileIdentity) || typeof checkpoint.label !== "string" || !checkpoint.label || checkpoint.label.length > 160) fail("lifecycle_invalid_receipt");
  if (receipt.operation !== "open_project" && (!receipt.stageFile || receipt.stageFile.sha256 !== receipt.targetFile.sha256 || receipt.stageFile.bytes !== receipt.targetFile.bytes || samePath(receipt.stageFile.path, receipt.targetFile.path) || stableJson(receipt.stageFile.fileIdentity) === stableJson(receipt.targetFile.fileIdentity))) fail("lifecycle_invalid_receipt");
  if (receipt.operation === "save_project_as" && (receipt.sourceInventoryHash !== receipt.stageInventoryHash || receipt.stageInventoryHash !== receipt.targetInventoryHash)) fail("lifecycle_invalid_receipt");
  if (receipt.operation === "create_named_project" && (receipt.targetEmpty !== true || receipt.stageInventoryHash !== receipt.targetInventoryHash)) fail("lifecycle_invalid_receipt");
  exact(receipt.authorization, ["actionId", "runId", "payloadHash", "ownedEditSessionId"], "lifecycle_invalid_receipt");
  if (typeof receipt.authorization.actionId !== "string" || !receipt.authorization.actionId || receipt.authorization.actionId.length > 240 || typeof receipt.authorization.runId !== "string" || !receipt.authorization.runId || receipt.authorization.runId.length > 240 || !SHA.test(receipt.authorization.payloadHash || "")) fail("lifecycle_invalid_receipt");
  if (receipt.finalizedBy !== undefined) {
    exact(receipt.finalizedBy, ["actionId", "runId", "payloadHash", "inputHash", "sourcePolicyHash", "targetPolicyHash", "ownedEditSessionId"], "lifecycle_invalid_receipt");
    if (typeof receipt.finalizedBy.actionId !== "string" || !receipt.finalizedBy.actionId || typeof receipt.finalizedBy.runId !== "string" || !receipt.finalizedBy.runId || ["payloadHash", "inputHash", "sourcePolicyHash", "targetPolicyHash"].some(k => !SHA.test(receipt.finalizedBy[k] || "")) || receipt.finalizedBy.inputHash !== hash({ name: "finalize_project_lifecycle", args: { transitionId: receipt.transitionId } }) || receipt.finalizedBy.ownedEditSessionId !== undefined && (typeof receipt.finalizedBy.ownedEditSessionId !== "string" || !receipt.finalizedBy.ownedEditSessionId)) fail("lifecycle_invalid_receipt");
  }
  if (receipt.artisticAccepted !== false || receipt.sourceCheckpointRestoresUnsavedMemory !== false || receipt.undoContextChanged !== true) fail("lifecycle_invalid_receipt"); return { valid: true, transitionId: receipt.transitionId, generation: receipt.generation };
}
module.exports = { VERSION, UUID, SHA, LIMITS, SETTINGS, MUTATIONS, toolDefinitions, isLifecycleTool: name => TOOLS.includes(name), isLifecycleMutation: name => MUTATIONS.includes(name), validateInput,
  nativeInventoryScript, phaseScript, validateInventory, inventoryContent, inventoryHash, assertInventoryMatch, nativeTuple, verifyReceipt, canonicalPlanHash, projectPath, samePath, normalizePath, hash, stableJson, clone, fail, object, exact };
