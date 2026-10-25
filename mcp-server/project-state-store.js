"use strict";
const fs=require("fs"),path=require("path"),crypto=require("crypto"),zlib=require("node:zlib"),placeholderProtection=require("./placeholder-protection");
const REPO_ROOT=path.resolve(__dirname,"..");
function isPlainObject(value){return value!==null&&typeof value==="object"&&!Array.isArray(value);}
const PROJECT_STATE_SCHEMA = "ae-project-intent-runtime.v1";
const reviewService = require("./placeholder-review-service");
const PACKED_REVIEW_SCHEMA="ae-agent-canonical-review-packed.v1";
const MAX_PACKED_STATE_BYTES=2*1024*1024,MAX_REVIEW_LOGICAL_BYTES=16*1024*1024,MAX_STATE_LOGICAL_BYTES=32*1024*1024;
function packedReviewError(code){throw new Error(code);}
function packCanonicalReview(record){
  reviewService.validateReviewRecord(record);
  if(!record.canonicalBinding)return record;
  const raw=Buffer.from(JSON.stringify(record),"utf8");
  if(raw.length>MAX_REVIEW_LOGICAL_BYTES)packedReviewError("canonical_review_logical_size_limit");
  const compressed=zlib.deflateRawSync(raw),payloadBase64=compressed.toString("base64");
  return {schema:PACKED_REVIEW_SCHEMA,codec:"deflate-raw",rawByteLength:raw.length,compressedByteLength:compressed.length,
    rawSha256:reviewService.hash(raw),compressedSha256:reviewService.hash(compressed),payloadBase64};
}
function unpackCanonicalReview(envelope){
  if(!envelope || envelope.schema!==PACKED_REVIEW_SCHEMA)return envelope;
  const keys=["schema","codec","rawByteLength","compressedByteLength","rawSha256","compressedSha256","payloadBase64"];
  if(Object.keys(envelope).length!==keys.length || Object.keys(envelope).some(k=>!keys.includes(k)) || envelope.codec!=="deflate-raw" ||
    !Number.isSafeInteger(envelope.rawByteLength) || envelope.rawByteLength<1 || envelope.rawByteLength>MAX_REVIEW_LOGICAL_BYTES ||
    !Number.isSafeInteger(envelope.compressedByteLength) || envelope.compressedByteLength<1 || envelope.compressedByteLength>MAX_PACKED_STATE_BYTES ||
    !/^[a-f0-9]{64}$/.test(envelope.rawSha256) || !/^[a-f0-9]{64}$/.test(envelope.compressedSha256) || typeof envelope.payloadBase64!=="string" ||
    envelope.payloadBase64.length!==4*Math.ceil(envelope.compressedByteLength/3) || !/^[A-Za-z0-9+/]*={0,2}$/.test(envelope.payloadBase64))packedReviewError("invalid_canonical_review_packed_envelope");
  const compressed=Buffer.from(envelope.payloadBase64,"base64");
  if(compressed.length!==envelope.compressedByteLength || compressed.toString("base64")!==envelope.payloadBase64 || reviewService.hash(compressed)!==envelope.compressedSha256)packedReviewError("canonical_review_packed_hash_mismatch");
  let raw;try{const inflated=zlib.inflateRawSync(compressed,{maxOutputLength:envelope.rawByteLength,info:true});if(inflated.engine.bytesWritten!==compressed.length)packedReviewError("canonical_review_compressed_trailing_bytes");raw=inflated.buffer;}catch(_error){packedReviewError("canonical_review_inflate_budget_or_format");}
  if(raw.length!==envelope.rawByteLength || reviewService.hash(raw)!==envelope.rawSha256)packedReviewError("canonical_review_decoded_hash_mismatch");
  const text=raw.toString("utf8");if(!Buffer.from(text,"utf8").equals(raw))packedReviewError("canonical_review_invalid_utf8");
  let record;try{record=JSON.parse(text);}catch(_error){packedReviewError("canonical_review_invalid_json");}
  if(JSON.stringify(record)!==text || !record?.canonicalBinding)packedReviewError("canonical_review_noncanonical_json_or_legacy");
  reviewService.validateReviewRecord(record);return record;
}
function transformReviewStore(store,pack){
  if(!store || !isPlainObject(store.projectState) || Object.keys(store.projectState).length>100)packedReviewError("invalid_project_state_schema");
  let logicalBytes=0;const projectState=Object.create(null);
  for(const [key,state] of Object.entries(store.projectState)){
    if(!/^[a-f0-9]{64}$/.test(key) || !state || !isPlainObject(state))packedReviewError("invalid_project_state");
    if(state.reviewArtifacts!==undefined && (!isPlainObject(state.reviewArtifacts) || Object.keys(state.reviewArtifacts).length>8))packedReviewError("invalid_review_artifact_store");
    const reviews=Object.create(null);
    for(const [owner,value] of Object.entries(state.reviewArtifacts || {})){
      if(!reviewService.OWNER.test(owner))packedReviewError("invalid_review_artifact_owner");
      if(!pack && value?.schema===PACKED_REVIEW_SCHEMA){logicalBytes+=value.rawByteLength;if(logicalBytes>MAX_STATE_LOGICAL_BYTES)packedReviewError("project_state_logical_size_limit");}
      const record=pack ? value : unpackCanonicalReview(value);
      if(pack || value?.schema!==PACKED_REVIEW_SCHEMA){logicalBytes+=Buffer.byteLength(JSON.stringify(record),"utf8");if(logicalBytes>MAX_STATE_LOGICAL_BYTES)packedReviewError("project_state_logical_size_limit");}
      reviews[owner]=pack ? packCanonicalReview(record) : record;
    }
    projectState[key]={...state,...(state.reviewArtifacts!==undefined ? {reviewArtifacts:reviews} : {})};
  }
  const logical={...store,projectState};
  if(!pack && Buffer.byteLength(JSON.stringify(logical),"utf8")>MAX_STATE_LOGICAL_BYTES)packedReviewError("project_state_logical_size_limit");
  return logical;
}
function projectStatePath(options = {}) {
  return options.statePath ? path.resolve(options.statePath) : path.join(
    process.env.AE_BRIDGE_STATE_DIR || path.join(REPO_ROOT, ".codex-runtime", "project-intent"), "project-intent-state.json");
}
function canonicalSavedProject(file) {
  if (typeof file !== "string" || !file.trim() || !(path.win32.isAbsolute(file) || path.posix.isAbsolute(file))) {
    const error = new Error("Для принятия плейсхолдера требуется идентичность сохранённого проекта; AEP автоматически не сохраняется.");
    error.code = "project_identity_unavailable";
    throw error;
  }
  let canonical;
  try { canonical = fs.realpathSync(file); } catch (_error) {
    canonical = /^[A-Za-z]:[\\/]|^\\\\/.test(file) ? path.win32.normalize(file) : path.resolve(file);
  }
  return canonical.replace(/\\/g, "/").toLowerCase();
}
function projectStateKey(file) { return crypto.createHash("sha256").update(canonicalSavedProject(file)).digest("hex"); }
function validateProjectStateStore(store) {
  if(store && store.schema===PROJECT_STATE_SCHEMA && ["pendingLifecycle","lifecycleGeneration","lifecycleReceipts"].some(key=>Object.prototype.hasOwnProperty.call(store,key)))throw new Error("lifecycle_schema_downgrade");
  if (!store || ![PROJECT_STATE_SCHEMA, "ae-project-intent-runtime.v2"].includes(store.schema) || !isPlainObject(store.projectState) ||
    Object.keys(store.projectState).length > 100) throw new Error("invalid_project_state_schema");
  for (const [key, state] of Object.entries(store.projectState)) {
    if (!/^[a-f0-9]{64}$/.test(key) || !state || key !== projectStateKey(state.projectFile) ||
      !Number.isSafeInteger(state.revision) || state.revision < 0 || !Array.isArray(state.acceptedPlaceholders) ||
      state.acceptedPlaceholders.length > 200 || !Array.isArray(state.groupMappings) || state.groupMappings.length > 500) throw new Error("invalid_project_state");
    const targets = new Set();
    if(state.sourceLoadEpochs!==undefined){
      if(!isPlainObject(state.sourceLoadEpochs) || Object.keys(state.sourceLoadEpochs).length>64)throw new Error("invalid_native_source_load_epoch_store");
      for(const [sourceId,epoch] of Object.entries(state.sourceLoadEpochs)){
        if(String(epoch.sourceItemId)!==sourceId)throw new Error("invalid_native_source_load_epoch_identity");
        require("./montage-capture-service").validateLoadEpoch(epoch,state);
      }
    }
    if(state.reviewArtifacts!==undefined) {
      if(!isPlainObject(state.reviewArtifacts) || Object.keys(state.reviewArtifacts).length>8)throw new Error("invalid_review_artifact_store");
      let reviewItems=0;
      for(const [owner,record] of Object.entries(state.reviewArtifacts)) {
        reviewService.validateReviewRecord(record);
        if(owner!==record.owner || record.projectKey!==key)throw new Error("review_artifact_project_mismatch");
        reviewItems+=record.receipt.items.length;
      }
      if(reviewItems>200)throw new Error("review_artifact_item_limit");
    }
    for (const snapshot of state.acceptedPlaceholders) {
      placeholderProtection.validateSnapshot(snapshot);
      const target = placeholderProtection.targetKey(snapshot.target);
      if (targets.has(target)) throw new Error("duplicate_accepted_placeholder");
      targets.add(target);
    }
    const mediaKeys = new Set();
    for (const mapping of state.groupMappings) {
      if (!mapping || typeof mapping.mediaKey !== "string" || !mapping.mediaKey || mapping.mediaKey.length > 4000 ||
        typeof mapping.groupId !== "string" || !mapping.groupId.trim() || mapping.groupId.length > 120 ||
        mapping.provenance !== "user_confirmed" || mapping.confirmed !== true || mediaKeys.has(mapping.mediaKey)) throw new Error("invalid_confirmed_group_mapping");
      mediaKeys.add(mapping.mediaKey);
    }
    if (state.constraints !== null && state.constraints !== undefined) {
      const value = state.constraints;
      if (!value || typeof value.distinctGroups !== "boolean" || typeof value.disallowSourceOverlap !== "boolean" ||
        !Array.isArray(value.selectedTargets) || !value.selectedTargets.length || value.selectedTargets.length > 32 ||
        value.selectedTargets.some(target => !target || !Number.isSafeInteger(target.compItemId) || target.compItemId < 1 || !Number.isSafeInteger(target.layerId) || target.layerId < 1)) throw new Error("invalid_placeholder_constraints");
    }
  }
  return require("./project-lifecycle-transition").validateV2Store(store);
}
function loadProjectStateStore(options = {}) {
  if (options.skipLifecycleReadGuard !== true) require("./project-lifecycle-transition").assertReadableProtectionStore(options);
  const file = projectStatePath(options), io = options.filesystem || fs;
  if (!io.existsSync(file)) return { schema: PROJECT_STATE_SCHEMA, projectState: {} };
  try {
    if (io.statSync(file).size > MAX_PACKED_STATE_BYTES) throw new Error("state_size_limit");
    return validateProjectStateStore(transformReviewStore(JSON.parse(io.readFileSync(file, "utf8")),false));
  } catch (cause) {
    const error = new Error("Project Intent runtime повреждён: " + cause.message);
    error.code = "project_state_corrupt";
    throw error;
  }
}
function readProjectState(projectFile, options = {}) {
  const store = loadProjectStateStore(options); // Corrupt never becomes an empty successful state.
  const key = projectStateKey(projectFile);
  return JSON.parse(JSON.stringify(store.projectState[key] || { projectFile: canonicalSavedProject(projectFile),
    projectKey: key, revision: 0, acceptedPlaceholders: [], groupMappings: [], constraints: null, reviewArtifacts: {} }));
}
function serializeProjectStateStore(store) {
  return JSON.stringify(transformReviewStore(store, true)) + "\n";
}
function atomicProjectStateWrite(store, options = {}) {
  require("./project-lifecycle-transition").assertPolicyWriteAllowed(options);
  validateProjectStateStore(store);
  if(Buffer.byteLength(JSON.stringify(store),"utf8")>MAX_STATE_LOGICAL_BYTES)throw new Error("project_state_logical_size_limit");
  const serialized = serializeProjectStateStore(store);
  if(Buffer.byteLength(serialized,"utf8")>MAX_PACKED_STATE_BYTES)throw new Error("project_state_size_limit");
  const file = projectStatePath(options), io = options.filesystem || fs;
  io.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + "." + crypto.randomUUID() + ".tmp";
  let descriptor;
  try {
    descriptor = io.openSync(temporary, "wx");
    io.writeFileSync(descriptor, serialized, "utf8");
    io.fsyncSync(descriptor);
    io.closeSync(descriptor);
    descriptor = null;
    io.renameSync(temporary, file);
  } finally {
    if (descriptor !== undefined && descriptor !== null) io.closeSync(descriptor);
    if (io.existsSync(temporary)) io.unlinkSync(temporary);
  }
}
// Invalid-proof inherited objects cannot be mutated, cleaned up or re-registered.
// The daemon must call this before its accepted-placeholder empty-state shortcuts.
function checkInheritedOwnershipSteps({ state, inventory, steps = [] }) {
  const rows = state && state.inheritedOwnership || [];
  require("./project-lifecycle-transition").validateInheritedOwnership(rows);
  if (!rows.length) return { ok: true, conflicts: [] };
  const ids = new Set(rows.flatMap(row => row.itemIds)), owners = new Set(rows.map(row => row.owner)), conflicts = [];
  const newItems = new Set(["create_comp", "create_test_comp", "import_footage", "create_project_folder"]);
  const nonItemMutations = new Set(["save_current_named_project","checkpoint_project","backup_project_file","start_edit_session","finish_edit_session"]);
  for (const [index, step] of steps.entries()) {
    const tool = step.tool || step.toolName, args = step.safeArgs || step.args || step.arguments || {};
    if (newItems.has(tool) || nonItemMutations.has(tool)) continue;
    if (!placeholderProtection.TARGET_SETTERS.has(tool)) {
      conflicts.push({index,tool,reason:"inherited_ownership_unknown_mutation_footprint",itemIds:[]});
      continue;
    }
    const referenced = [];
    for (const field of ["itemId", "compItemId", "sourceItemId", "expectedCompItemId", "expectedSourceItemId", "rootCompItemId"]) if (Number.isSafeInteger(args[field])) referenced.push(args[field]);
    for (const field of ["itemIds", "compItemIds"]) if (Array.isArray(args[field])) referenced.push(...args[field]);
    let resolved = referenced.length > 0;
    for (const [field, key] of [["compItemIndex", "itemIndex"], ["sourceItemIndex", "itemIndex"], ["compName", "name"], ["sourceItemName", "name"]]) {
      if (args[field] === undefined) continue;
      if (!inventory || inventory.complete !== true) { resolved = false; break; }
      const items = inventory.items || [...(inventory.comps || []), ...(inventory.sources || [])];
      const matches = items.filter(item => (key === "itemIndex" ? item.itemIndex ?? item.index : item.name) === args[field]);
      if (matches.length !== 1) { resolved = false; break; } referenced.push(matches[0].itemId ?? matches[0].id); resolved = true;
    }
    const ownerConflict = owners.has(args.owner), affected = referenced.filter(id => ids.has(id));
    if (ownerConflict || affected.length || !resolved) conflicts.push({ index, tool, reason: ownerConflict || affected.length ? "inherited_ownership_requires_adoption" : "inherited_ownership_unknown_mutation_footprint", itemIds: affected });
  }
  return { ok: !conflicts.length, code: conflicts.length ? "inherited_ownership_conflict" : null, conflicts };
}
function assertInheritedRegistration(state, owner, itemIds) {
  const rows = state.inheritedOwnership || [];
  if (rows.some(row => row.owner === owner || row.itemIds.some(id => itemIds.includes(id)))) {
    const error = new Error("inherited_ownership_requires_adoption"); error.code = "inherited_ownership_requires_adoption"; throw error;
  }
}
// A server-held capability, not a client confirm/allowProtectedChanges boolean.
// The bridge calls these methods only after authenticating a trusted panel action.
function createProjectStateController(options = {}) {
  function update(projectFile, expectedRevision, mutate) {
    require("./project-lifecycle-transition").assertMutationAllowed(options);
    const store = loadProjectStateStore(options);
    const key = projectStateKey(projectFile);
    const state = store.projectState[key] || readProjectState(projectFile, options);
    if (state.revision !== expectedRevision) {
      const error = new Error("Состояние принятия изменилось во время чтения. Повторите явное действие CEP.");
      error.code = "project_state_revision_changed";
      throw error;
    }
    mutate(state);
    state.revision++;
    store.projectState[key] = state;
    atomicProjectStateWrite(store, options);
    return JSON.parse(JSON.stringify(state));
  }
  return {
    read: projectFile => readProjectState(projectFile, options),
    accept(projectFile, snapshot, expectedRevision) {
      placeholderProtection.validateSnapshot(snapshot);
      return update(projectFile, expectedRevision, state => {
        assertInheritedRegistration(state, null, [snapshot.target.compItemId, snapshot.source.itemId, ...snapshot.dependencies.flatMap(edge => [edge.compItemId, edge.sourceItemId])]);
        const key = placeholderProtection.targetKey(snapshot.target);
        state.acceptedPlaceholders = state.acceptedPlaceholders.filter(value => placeholderProtection.targetKey(value.target) !== key);
        state.acceptedPlaceholders.push(JSON.parse(JSON.stringify(snapshot)));
      });
    },
    release(projectFile, target, expectedRevision) {
      return update(projectFile, expectedRevision, state => {
        assertInheritedRegistration(state, null, [target.compItemId]);
        const key = placeholderProtection.targetKey(target);
        const next = state.acceptedPlaceholders.filter(value => placeholderProtection.targetKey(value.target) !== key);
        if (next.length === state.acceptedPlaceholders.length) throw new Error("selected_placeholder_not_protected");
        state.acceptedPlaceholders = next;
      });
    },
    mapGroup(projectFile, mapping, expectedRevision) {
      return update(projectFile, expectedRevision, state => {
        state.groupMappings = state.groupMappings.filter(value => value.mediaKey !== mapping.mediaKey);
        state.groupMappings.push({ mediaKey: mapping.mediaKey, groupId: mapping.groupId,
          provenance: "user_confirmed", confirmed: true });
      });
    },
    setConstraints(projectFile, constraints, expectedRevision) {
      return update(projectFile, expectedRevision, state => { state.constraints = JSON.parse(JSON.stringify(constraints)); });
    },
    registerReview(projectFile, record, expectedRevision) {
      reviewService.validateReviewRecord(record);
      return update(projectFile,expectedRevision,state=>{
        assertInheritedRegistration(state, record.owner, record.receipt.items.map(item => item.itemId));
        if(record.projectKey!==state.projectKey)throw new Error("review_artifact_project_mismatch");
        state.reviewArtifacts=state.reviewArtifacts || {};
        if(state.reviewArtifacts[record.owner])throw new Error("review_owner_already_registered");
        const owned=JSON.parse(JSON.stringify(record));
        if(owned.canonicalBinding)require("./montage-capture-service").registerOwnerPolicy(owned,state);
        state.reviewArtifacts[record.owner]=owned;
      });
    },
    registerSourceLoadEpoch(projectFile,epoch,expectedRevision){
      return update(projectFile,expectedRevision,state=>{
        assertInheritedRegistration(state, null, [epoch.sourceItemId]);
        require("./montage-capture-service").validateLoadEpoch(epoch,state);
        state.sourceLoadEpochs=state.sourceLoadEpochs || {};state.sourceLoadEpochs[epoch.sourceItemId]=JSON.parse(JSON.stringify(epoch));
      });
    },
    addReviewImage(projectFile,owner,image,expectedRevision) {
      return update(projectFile,expectedRevision,state=>{
        assertInheritedRegistration(state, owner, [image.itemId]);
        const record=state.reviewArtifacts && state.reviewArtifacts[owner];if(!record)throw new Error("review_owner_unregistered");
        if(record.canonicalBinding){
          const capture=require("./montage-capture-service");capture.assertOwnerPolicy(record,state);
          if(record.images.some(value=>value.itemId===image.itemId))throw new Error("root_png_replay_requires_fresh_capture");
          if(capture.frameForItem(record,image.itemId))capture.validateCaptureReceipt(record,image);
          capture.advanceOwnerPolicy(record,state);
        }
        record.images=record.images.filter(value=>value.itemId!==image.itemId);record.images.push(JSON.parse(JSON.stringify(image)));
      });
    },
    unregisterReview(projectFile,owner,absentIds,expectedRevision) {
      return update(projectFile,expectedRevision,state=>{
        assertInheritedRegistration(state, owner, absentIds || []);
        const record=state.reviewArtifacts && state.reviewArtifacts[owner];if(!record)throw new Error("review_owner_unregistered");
        if(!Array.isArray(absentIds) || JSON.stringify([...absentIds].sort((a,b)=>a-b))!==JSON.stringify(record.receipt.items.map(item=>item.itemId).sort((a,b)=>a-b)))throw new Error("review_removal_proof_incomplete");
        delete state.reviewArtifacts[owner];
      });
    }
  };
}


module.exports={PROJECT_STATE_SCHEMA,canonicalSavedProject,projectStateKey,projectStatePath,validateProjectStateStore,loadProjectStateStore,readProjectState,createProjectStateController,PACKED_REVIEW_SCHEMA,MAX_PACKED_STATE_BYTES,MAX_REVIEW_LOGICAL_BYTES,MAX_STATE_LOGICAL_BYTES,packCanonicalReview,unpackCanonicalReview,transformReviewStore,serializeProjectStateStore,atomicProjectStateWrite,checkInheritedOwnershipSteps,assertInheritedRegistration};
