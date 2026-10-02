"use strict";

const {
  MANIFEST_SCHEMA,
  MATERIALS_SCHEMA,
  isRecord,
  inspectPayloadSafety, normalizeBudgets, checkExactKeys, addBlocker,
  isPositiveInteger: id, isNonNegativeInteger: uint, isSafeId, isAbsolutePath, isSha256, isIso8601
} = require("./montage-contract");

const FORBIDDEN_CLIENT_KEYS = new Set([
  "observations",
  "usage",
  "verified",
  "evidence",
  "readBack",
  "inventory",
  "targets",
  "geometry",
  "footprint"
]);

const BUILD_MONTAGE_PIPELINE_PLAN_TOOL = Object.freeze({
  name: "build_montage_pipeline_plan",
  description: "Build a deterministic reviewed montage pipeline execution compilation and preview-only unit plans from an explicit manifest, prepared materials, and caller budgets. Server orchestrates fresh native observations, verifies full material hashes, and enforces protection gates without client authority. Zero project mutations during build.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["manifest", "preparedMaterials"],
    properties: {
      manifest: {
        type: "object",
        description: "Authoritative montage manifest conforming to ae-agent-montage-manifest.v1."
      },
      preparedMaterials: {
        type: "object",
        description: "Prepared materials catalog conforming to ae-agent-prepared-materials.v1."
      },
      budgets: {
        type: "object",
        description: "Optional caller hard ceilings to constrain execution budgets."
      }
    }
  }
});

function validateBuildMontagePipelinePlanInput(input) {
  if (!isRecord(input)) {
    return {
      ok: false,
      code: "invalid_input_container",
      error: "Input must be a valid JSON object."
    };
  }

  const safety = inspectPayloadSafety(input, 4 * 1024 * 1024);
  if (safety.invalid || safety.cycleDetected || safety.depthExceeded || safety.exceeded) {
    return {
      ok: false,
      code: "input_payload_safety_violation",
      error: "Input payload exceeded size or depth limits or contained circular references."
    };
  }

  const keys = Object.keys(input);
  for (const key of keys) {
    if (FORBIDDEN_CLIENT_KEYS.has(key)) {
      return {
        ok: false,
        code: "client_authority_forbidden",
        error: `Client property '${key}' is strictly forbidden. Server gathers fresh authoritative observations.`
      };
    }
    if (!["manifest", "preparedMaterials", "budgets"].includes(key)) {
      return {
        ok: false,
        code: "unknown_input_property",
        error: `Unknown input property '${key}' is not allowed.`
      };
    }
  }

  if (!isRecord(input.manifest)) {
    return {
      ok: false,
      code: "missing_manifest",
      error: "Missing required 'manifest' object."
    };
  }

  if (input.manifest.schema !== MANIFEST_SCHEMA) {
    return {
      ok: false,
      code: "invalid_manifest_schema",
      error: `Manifest schema must be '${MANIFEST_SCHEMA}'.`
    };
  }

  if (!isRecord(input.preparedMaterials)) {
    return {
      ok: false,
      code: "missing_prepared_materials",
      error: "Missing required 'preparedMaterials' object."
    };
  }

  if (input.preparedMaterials.schema !== MATERIALS_SCHEMA) {
    return {
      ok: false,
      code: "invalid_prepared_materials_schema",
      error: `Prepared materials schema must be '${MATERIALS_SCHEMA}'.`
    };
  }

  if (input.budgets !== undefined && !isRecord(input.budgets)) {
    return {
      ok: false,
      code: "invalid_budgets_container",
      error: "Budgets, when supplied, must be an object."
    };
  }

  // Ensure no client authority was embedded inside manifest or materials
  if (input.manifest.observations !== undefined || input.manifest.usage !== undefined) {
    return {
      ok: false,
      code: "client_authority_forbidden",
      error: "Observations and usage cannot be supplied inside manifest."
    };
  }

  return { ok: true };
}

function getMontagePipelineBuilderContract() {
  return {
    solutionId: "montage-pipeline-plan",
    description: "Build a deterministic reviewed montage pipeline compilation of unit plans from explicit manifest and prepared materials. The server orchestrates fresh native inventory, usage, geometry, footprints, and material hash verification. This call does not contact external models or mutate an AE project.",
    mode: "compilation_units",
    inputSchema: BUILD_MONTAGE_PIPELINE_PLAN_TOOL.inputSchema,
    outputContract: {
      schema: "ae-agent-montage-compilation.v1",
      previewOnly: true,
      mutatesProject: false,
      requiresFreshEvidenceReview: true,
      unitsPerProposal: true
    }
  };
}

// Bounded structure and client authority are checked before even requesting AE.
// Semantic/native consistency remains exclusively in the M1 validator.
function structuralPreflight(input) {
  const norm=normalizeBudgets(input.budgets),b=norm.budgets,blockers=[...norm.blockers];
  for(const [name,value,limit] of [["manifest",input.manifest,b.manifestBytes],["preparedMaterials",input.preparedMaterials,b.materialsBytes]]) {
    const s=inspectPayloadSafety(value,limit);
    if(s.invalid || s.exceeded || s.depthExceeded || s.cycleDetected)addBlocker(blockers,"payload_exceeds_budget",name);
  }
  if(blockers.length)return {ok:false,blockers,budgets:b};
  const m=input.manifest,c=input.preparedMaterials;
  const exact=(v,keys,p)=>{if(!isRecord(v))addBlocker(blockers,"invalid_contract_container",p);else checkExactKeys(v,keys,p,blockers,"unknown_contract_field");};
  const array=(v,cap,p,nonempty=true)=>{
    if(!Array.isArray(v) || nonempty && !v.length || Array.isArray(v) && v.length>cap){addBlocker(blockers,"invalid_or_oversized_collection",p);return [];}
    return v;
  };
  exact(m,["schema","revision","taskId","observedAt","project","scenes","assignments","groups","groupPolicy","dependencies","frameCoverage"],"manifest");
  exact(m.project,["projectFile","projectKey","revision"],"manifest.project");
  if(!id(m.revision) || !isSafeId(m.taskId) || !isIso8601(m.observedAt) || !isAbsolutePath(m.project?.projectFile) || !isSafeId(m.project?.projectKey) || !uint(m.project?.revision))addBlocker(blockers,"invalid_manifest_header","manifest");
  exact(c,["schema","revision","materials"],"preparedMaterials");
  if(!id(c.revision))addBlocker(blockers,"invalid_material_revision","preparedMaterials");
  let total=0;
  for(const mat of array(c.materials,Math.min(b.materials,b.materialReadRequests),"preparedMaterials.materials")) {
    exact(mat,["materialId","sourceItemId","path","sha256","byteLength","width","height","pixelAspect","duration","fps","provenance"],"material");
    exact(mat?.provenance,["kind","originalMaterialId","originalSourceRange"],"material.provenance");
    if(!isSafeId(mat?.materialId) || !id(mat?.sourceItemId) || !isAbsolutePath(mat?.path) || !isSha256(mat?.sha256) || !id(mat?.byteLength) || mat.byteLength>b.materialFileBytes ||
      ![mat.width,mat.height,mat.duration,mat.fps].every(v=>Number.isFinite(v)&&v>0) || mat.pixelAspect!==1 || mat.provenance?.kind!=="prepared_clip")addBlocker(blockers,"invalid_material_record","material");
    if(id(mat?.byteLength))total+=mat.byteLength;
  }
  if(total>b.materialTotalBytes)addBlocker(blockers,"material_total_bytes_exceeds_budget","preparedMaterials.materials");
  for(const s of array(m.scenes,b.scenes,"manifest.scenes")) {
    exact(s,["sceneId","rootCompItemId","rootRange","fps","assignmentIds","visibleCutCount","cameraEvents","rootCompName"],"scene");
    if(!isSafeId(s?.sceneId) || !id(s?.rootCompItemId) || !Number.isFinite(s?.fps) || s.fps<=0 || !uint(s?.visibleCutCount))addBlocker(blockers,"invalid_scene","scene");
    array(s?.assignmentIds,b.assignments,"scene.assignmentIds");
    for(const e of array(s?.cameraEvents,b.frameCoverage,"scene.cameraEvents",false))exact(e,["eventId","rootTime"],"scene.cameraEvent");
  }
  for(const a of array(m.assignments,b.assignments,"manifest.assignments")) {
    exact(a,["assignmentId","sceneId","target","routeLayerIds","materialId","sourceRange","rootRange","groupId","crop","shots","protectedFields"],"assignment");
    exact(a?.target,["compItemId","layerId"],"assignment.target");
    if(!isSafeId(a?.assignmentId) || !isSafeId(a?.sceneId) || !isSafeId(a?.materialId) || !isSafeId(a?.groupId) || !id(a?.target?.compItemId) || !id(a?.target?.layerId))addBlocker(blockers,"invalid_assignment","assignment");
    if(array(a?.routeLayerIds,b.routeDepth,"assignment.routeLayerIds",false).some(v=>!id(v)))addBlocker(blockers,"invalid_route_layer_ids","assignment.routeLayerIds");
    exact(a?.crop,["mode","samples","marginPixels"],"assignment.crop");
    array(a?.crop?.samples,24,"assignment.crop.samples");
    for(const shot of array(a?.shots,b.shotsPerAssignment,"assignment.shots"))exact(shot,["shotId","sourceRange"],"assignment.shot");
    array(a?.protectedFields,32,"assignment.protectedFields",false);
  }
  for(const g of array(m.groups,b.groups,"manifest.groups"))exact(g,["groupId","provenance","confirmed"],"group");
  exact(m.groupPolicy,["distinctGroups","disallowSourceOverlap","balancedRepeats"],"manifest.groupPolicy");
  array(m.groupPolicy?.balancedRepeats,b.assignments,"manifest.groupPolicy.balancedRepeats",false);
  exact(m.dependencies,["complete","scope","edges"],"manifest.dependencies");
  exact(m.dependencies?.scope,["rootCompItemIds","targetKeys","sourceItemIds"],"manifest.dependencies.scope");
  for(const [field,limit] of [["rootCompItemIds",b.scenes],["targetKeys",b.assignments],["sourceItemIds",b.assignments+b.materials]])array(m.dependencies?.scope?.[field],limit,`manifest.dependencies.scope.${field}`);
  for(const e of array(m.dependencies?.edges,b.dependencyEdges,"manifest.dependencies.edges")) {
    exact(e,["dependencyId","kind","compItemId","layerId","sourceItemId","sceneIds"],"dependency");
    array(e?.sceneIds,b.scenes,"dependency.sceneIds");
  }
  for(const f of array(m.frameCoverage,b.frameCoverage,"manifest.frameCoverage"))exact(f,["frameId","sceneId","assignmentId","compItemId","rootFrame","rootTime","roles","reasons"],"frame");
  return {ok:!blockers.length,blockers,budgets:b};
}

const montageTools = Object.freeze([BUILD_MONTAGE_PIPELINE_PLAN_TOOL]);
const TOOL_NAMES = Object.freeze(montageTools.map(tool => tool.name));

module.exports = {
  BUILD_MONTAGE_PIPELINE_PLAN_TOOL,
  montageTools,
  TOOL_NAMES,
  validateBuildMontagePipelinePlanInput,
  structuralPreflight,
  getMontagePipelineBuilderContract
};
