"use strict";

const PLAN_REPAIR_SCHEMA = "ae-agent-plan-repair.v1";

const TOOL_ALIASES = {
  activecomp: "get_active_comp",
  activecomposition: "get_active_comp",
  activelayers: "get_selected_layers",
  getactivelayer: "get_selected_layers",
  getactivelayers: "get_selected_layers",
  getactivecomp: "get_active_comp",
  getactivecomposition: "get_active_comp",
  selectedlayers: "get_selected_layers",
  getselectedlayer: "get_selected_layers",
  getselectedlayers: "get_selected_layers",
  listlayer: "list_layers",
  listlayers: "list_layers",
  getlayers: "list_layers",
  layerdetails: "get_layer_details",
  getlayerdetails: "get_layer_details",
  createtext: "create_text_layer",
  addtextlayer: "create_text_layer",
  createtextlayer: "create_text_layer",
  updatetext: "update_text_layer",
  edittext: "update_text_layer",
  edittextlayer: "update_text_layer",
  settextlayer: "update_text_layer",
  updatetextlayer: "update_text_layer",
  createshape: "create_shape_layer",
  addshapelayer: "create_shape_layer",
  createshapelayer: "create_shape_layer",
  createcamera: "create_camera_layer",
  addcamera: "create_camera_layer",
  addcameralayer: "create_camera_layer",
  createcameralayer: "create_camera_layer",
  createmask: "create_layer_mask",
  addmask: "create_layer_mask",
  createlayermask: "create_layer_mask",
  addlayermask: "create_layer_mask",
  duplicatelayer: "duplicate_layer",
  copylayer: "duplicate_layer",
  clonelayer: "duplicate_layer",
  fitlayer: "fit_layer_to_comp",
  fittocomp: "fit_layer_to_comp",
  fitlayertocomp: "fit_layer_to_comp",
  alignlayers: "align_layers_to_time",
  alignselectedlayers: "align_layers_to_time",
  alignlayerstotime: "align_layers_to_time",
  setworkarea: "set_comp_work_area",
  setcompworkarea: "set_comp_work_area",
  trimlayers: "set_layer_time_range",
  setlayerrange: "set_layer_time_range",
  setlayertiming: "set_layer_time_range",
  setlayertimerange: "set_layer_time_range",
  staggerlayer: "stagger_layers",
  staggerlayers: "stagger_layers",
  splitlayers: "split_layers_at_time",
  splitlayerattime: "split_layers_at_time",
  splitlayersattime: "split_layers_at_time",
  precompose: "precompose_layers",
  precomposelayer: "precompose_layers",
  precomposelayers: "precompose_layers",
  duplicateprecomp: "deep_duplicate_precomp_sources",
  duplicateprecomposition: "deep_duplicate_precomp_sources",
  duplicatedselectedprecomp: "deep_duplicate_precomp_sources",
  deepduplicateprecomp: "deep_duplicate_precomp_sources",
  deepduplicateprecompsources: "deep_duplicate_precomp_sources",
  replace_source: "replace_layer_source",
  replacesource: "replace_layer_source",
  replacelayersource: "replace_layer_source",
  renamelayer: "rename_layers",
  renamelayers: "rename_layers",
  renameprojectitem: "rename_project_items",
  renameprojectitems: "rename_project_items",
  setlayerproperty: "set_property_value",
  setproperty: "set_property_value",
  setpropertyvalue: "set_property_value",
  setkeyframes: "set_property_keyframes",
  setpropertykeys: "set_property_keyframes",
  setpropertykeyframes: "set_property_keyframes",
  easekeyframes: "apply_keyframe_ease",
  applyease: "apply_keyframe_ease",
  applykeyframeease: "apply_keyframe_ease",
  setexpr: "set_expression",
  setexpression: "set_expression",
  clearexpr: "clear_expression",
  clearexpression: "clear_expression",
  addtorenderqueue: "add_comp_to_render_queue",
  addcomptorenderqueue: "add_comp_to_render_queue",
  queuecompforrender: "add_comp_to_render_queue",
  setrenderoutput: "set_render_queue_output",
  setrenderqueueoutput: "set_render_queue_output",
  renderqueuestatus: "get_render_queue_status",
  getrenderqueuestatus: "get_render_queue_status",
  settransform: "set_layer_transform",
  setlayertransform: "set_layer_transform",
  createmarker: "add_layer_marker",
  createlayermarker: "add_layer_marker",
  addmarker: "add_layer_marker",
  addlayermarker: "add_layer_marker",
  updatemarker: "update_layer_marker",
  updatelayermarker: "update_layer_marker",
  editmarker: "update_layer_marker",
  editlayermarker: "update_layer_marker",
  deletemarker: "delete_layer_marker",
  deletelayermarker: "delete_layer_marker",
  removemarker: "delete_layer_marker",
  removelayermarker: "delete_layer_marker"
};

const BINDING_ALIASES = {
  itemindexes: "itemIndices",
  projectitemindexes: "itemIndices",
  selectedlayerindexes: "selectedLayerIndices",
  selectedlayers: "selectedLayerIndices",
  selectedprecompitemindexes: "selectedPrecompItemIndices",
  selectedsourcecompitemindexes: "selectedSourceCompItemIndices",
  selectedsourceitemindexes: "selectedSourceItemIndices",
  sourceitemindexes: "sourceItemIndices"
};

const COMP_RESULT_TOOLS = new Set([
  "get_active_comp",
  "get_selected_layers",
  "get_comp_details",
  "create_test_comp",
  "duplicate_comp",
  "precompose_layers",
  "create_text_layer",
  "create_solid_layer",
  "create_null_layer",
  "create_adjustment_layer",
  "create_camera_layer",
  "create_shape_layer",
  "duplicate_layer",
  "add_project_item_to_comp"
]);

const SELECTED_LAYER_RESULT_TOOLS = new Set([
  "get_active_comp",
  "get_selected_layers"
]);

const LAYER_RESULT_TOOLS = new Set([
  "create_text_layer",
  "create_solid_layer",
  "create_null_layer",
  "create_adjustment_layer",
  "create_camera_layer",
  "create_shape_layer",
  "duplicate_layer",
  "add_project_item_to_comp"
]);

const PROJECT_ITEM_RESULT_TOOLS = new Set([
  "find_project_items",
  "find_comps",
  "list_comps",
  "get_project_snapshot",
  "create_test_comp",
  "duplicate_comp",
  "import_footage",
  "precompose_layers"
]);

const SELECTED_SOURCE_RESULT_TOOLS = new Set([
  "get_active_comp",
  "get_selected_layers"
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function missingValue(value) {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

function compactText(value, limit) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text || text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trim()}...`;
}

function normalizeToken(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function clonePlan(plan) {
  if (!isPlainObject(plan)) return { steps: [] };
  return JSON.parse(JSON.stringify(plan));
}

function stepToolName(step) {
  if (!isPlainObject(step)) return "";
  return String(step.tool || step.mcpTool || step.name || "").trim().slice(0, 120);
}

function stepArgs(step) {
  if (!isPlainObject(step)) return {};
  const args = step.args || step.arguments || step.parameters || {};
  return isPlainObject(args) ? args : {};
}

function schemaProperties(tool) {
  const properties = tool && tool.inputSchema && tool.inputSchema.properties;
  return isPlainObject(properties) ? properties : {};
}

function requiredFields(tool) {
  return tool && tool.inputSchema && Array.isArray(tool.inputSchema.required)
    ? tool.inputSchema.required.filter(Boolean)
    : [];
}

function propertyCandidates(field) {
  const token = normalizeToken(field);
  const aliases = {
    compindex: ["compItemIndex"],
    compositionindex: ["compItemIndex"],
    compositionitemindex: ["compItemIndex"],
    activecompindex: ["compItemIndex"],
    activecompitemindex: ["compItemIndex"],
    comp: ["compName"],
    composition: ["compName"],
    compositionname: ["compName"],
    activecompname: ["compName"],
    layerindexes: ["layerIndices", "layerIndex"],
    layerindices: ["layerIndices", "layerIndex"],
    selectedlayerindexes: ["layerIndices", "layerIndex"],
    selectedlayerindices: ["layerIndices", "layerIndex"],
    layers: ["layerIndices", "layerIndex"],
    layer: ["layerIndex", "layerIndices"],
    source: ["sourceName", "sourceItemIndex", "sourceItemName"],
    sourcelayer: ["sourceName", "layerIndex"],
    sourcelayername: ["sourceName"],
    layername: ["sourceName", "name"],
    points: ["vertices"],
    maskpoints: ["vertices"],
    pathpoints: ["vertices"],
    maskname: ["name"],
    mode: ["maskMode"],
    itemindexes: ["itemIndices", "itemIndex"],
    itemindices: ["itemIndices", "itemIndex"],
    projectitemindexes: ["itemIndices", "itemIndex"],
    projectitemindices: ["itemIndices", "itemIndex"],
    projectitemindex: ["itemIndex", "itemIndices"],
    selectedprecompitemindex: ["itemIndices", "sourceItemIndex", "itemIndex"],
    selectedprecompitemindexes: ["itemIndices", "sourceItemIndex", "itemIndex"],
    selectedprecompitemindices: ["itemIndices", "sourceItemIndex", "itemIndex"],
    sourceindex: ["sourceItemIndex"],
    sourceitem: ["sourceItemIndex", "sourceItemName"],
    sourceitemindexes: ["sourceItemIndex", "itemIndices"],
    sourceitemindices: ["itemIndices", "sourceItemIndex"],
    property: ["propertyPath"],
    propertyname: ["propertyName", "propertyPath"],
    propertymatchname: ["propertyMatchName", "propertyPath"],
    effectname: ["effectName"],
    effectmatchname: ["effectMatchName"],
    newvalue: ["value"],
    targetvalue: ["value"],
    tovalue: ["value"],
    content: ["text"],
    contents: ["text"],
    textcontent: ["text"],
    keys: ["keyframes"],
    keyframearray: ["keyframes"],
    keyframevalues: ["keyframes"],
    expr: ["expression"],
    expressiontext: ["expression"],
    renderqueueindex: ["renderQueueItemIndex"],
    rqitemindex: ["renderQueueItemIndex"],
    renderitemindex: ["renderQueueItemIndex"],
    newname: ["newCompName", "name"],
    newcomp: ["newCompName"],
    newcompname: ["newCompName"],
    markercomment: ["comment"],
    markertext: ["comment"],
    markerlabel: ["comment"],
    markertime: ["time", "targetTime"],
    markerduration: ["duration"],
    markernumber: ["markerIndex"],
    markerkey: ["markerIndex"],
    targetmarker: ["markerIndex"],
    targetmarkerindex: ["markerIndex"],
    targetmarkertime: ["targetTime"],
    originalmarkertime: ["targetTime"],
    currentmarkertime: ["targetTime"],
    targetmarkercomment: ["targetComment"],
    originalmarkercomment: ["targetComment"],
    currentmarkercomment: ["targetComment"],
    newmarkercomment: ["comment"],
    newmarkertext: ["comment"],
    newmarkertime: ["time"],
    newmarkerduration: ["duration"]
  };
  return aliases[token] || [];
}

function canonicalArgField(field, properties) {
  if (hasOwn(properties, field)) return field;
  for (const candidate of propertyCandidates(field)) {
    if (hasOwn(properties, candidate)) return candidate;
  }
  return field;
}

function bindingAlias(value) {
  const text = String(value || "").trim();
  const match = /^\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}$/.exec(text);
  if (!match) return value;
  const canonical = BINDING_ALIASES[normalizeToken(match[1])];
  return canonical ? `{{${canonical}}}` : value;
}

function planSummary(validation) {
  if (!isPlainObject(validation)) return null;
  return {
    ok: Boolean(validation.ok),
    stepCount: Number(validation.stepCount || 0),
    executableCount: Number(validation.executableCount || 0),
    mutatingCount: Number(validation.mutatingCount || 0),
    unknownToolCount: Number(validation.unknownToolCount || 0),
    invalidStepCount: Number(validation.invalidStepCount || 0),
    classification: validation.classification && validation.classification.category || null
  };
}

function addAction(actions, stepIndex, type, message, extra) {
  actions.push({
    step: stepIndex + 1,
    type,
    message,
    ...(extra || {})
  });
}

function addPlanAction(actions, type, message, extra) {
  actions.push({
    step: 0,
    type,
    message,
    ...(extra || {})
  });
}

function planSearchText(plan) {
  try {
    return JSON.stringify(plan || {}).toLowerCase();
  } catch (_error) {
    return "";
  }
}

function planHasTool(plan, toolName) {
  const steps = Array.isArray(plan && plan.steps) ? plan.steps : [];
  return steps.some((step) => stepToolName(step) === toolName);
}

function hasSelectedPrecompDuplicateIntent(plan) {
  const text = planSearchText(plan);
  const duplicateIntent = /duplicate|duplicat|clone|copy|duplicate_layer|\u0434\u0443\u0431\u043b|\u043a\u043e\u043f\u0438\u0440/.test(text);
  const precompIntent = /pre[\s_-]*comp|pre[\s_-]*composition|precomposition|\u043f\u0440\u0435\u043a\u043e\u043c\u043f/.test(text);
  return duplicateIntent && precompIntent;
}

function planHasPseudoExecution(plan) {
  const steps = Array.isArray(plan && plan.steps) ? plan.steps : [];
  const text = planSearchText(plan);
  if (!steps.length) return true;
  if (/execute_command|duplicate_layer|step_type|on_success|conditional/.test(text)) return true;
  return steps.some((step) => isPlainObject(step) && !stepToolName(step) && (
    step.command || step.action || step.description || step.condition || Array.isArray(step.steps)
  ));
}

function buildSelectedPrecompDuplicatePlan(plan) {
  return {
    ...clonePlan(plan),
    summary: plan.summary || "Deep duplicate the selected precomp source tree.",
    risk: "medium",
    requiresCheckpoint: true,
    clarifyingQuestion: null,
    steps: [
      {
        title: "Inspect selected precomp layer",
        intent: "Read the active comp and selected layers before choosing the precomp source to duplicate.",
        tool: "get_active_comp",
        args: {}
      },
      {
        title: "Deep duplicate selected precomp sources",
        intent: "Duplicate the selected precomp source tree and relink the selected layer to the duplicated source comp.",
        tool: "deep_duplicate_precomp_sources",
        args: {
          layerIndex: "{{selectedPrecompLayerIndex}}",
          sourceCompItemIndex: "{{selectedPrecompItemIndex}}",
          nameSuffix: " copy",
          unavailableFootagePolicy: "reuse",
          openInViewer: false
        }
      },
      {
        title: "Read back duplicated precomp",
        intent: "Verify the duplicated root comp after the protected run.",
        tool: "get_comp_details",
        args: {
          compItemIndex: "{{duplicatedRootCompItemIndex}}",
          includeLayers: true
        }
      }
    ]
  };
}

function repairSelectedPrecompDuplicateWorkflow(plan, catalog, actions) {
  if (!catalog.toolByName("deep_duplicate_precomp_sources") || !catalog.planningToolNames.has("deep_duplicate_precomp_sources")) {
    return null;
  }
  if (planHasTool(plan, "deep_duplicate_precomp_sources")) return null;
  if (planHasTool(plan, "duplicate_layer")) return null;
  if (!hasSelectedPrecompDuplicateIntent(plan) || !planHasPseudoExecution(plan)) return null;

  addPlanAction(
    actions,
    "workflow-repair",
    "Rebuilt selected-precomp duplicate pseudo plan as a typed deep_duplicate_precomp_sources workflow.",
    { tool: "deep_duplicate_precomp_sources" }
  );
  return buildSelectedPrecompDuplicatePlan(plan);
}

function previousTools(steps, stepIndex) {
  const result = [];
  for (let index = 0; index < stepIndex; index += 1) {
    const name = stepToolName(steps[index]);
    if (name) result.push(name);
  }
  return result;
}

function hasPreviousTool(steps, stepIndex, names) {
  return previousTools(steps, stepIndex).some((name) => names.has(name));
}

function immediatePreviousTool(steps, stepIndex) {
  if (stepIndex <= 0) return "";
  return stepToolName(steps[stepIndex - 1]);
}

function bindingForMissingField(field, steps, stepIndex) {
  const immediate = immediatePreviousTool(steps, stepIndex);
  if (field === "compItemIndex" && hasPreviousTool(steps, stepIndex, COMP_RESULT_TOOLS)) {
    return "{{compItemIndex}}";
  }
  if (field === "layerIndex") {
    if (LAYER_RESULT_TOOLS.has(immediate)) return "{{layerIndex}}";
    if (hasPreviousTool(steps, stepIndex, SELECTED_LAYER_RESULT_TOOLS)) return "{{selectedLayerIndex}}";
  }
  if (field === "layerIndices") {
    if (hasPreviousTool(steps, stepIndex, SELECTED_LAYER_RESULT_TOOLS)) return "{{selectedLayerIndices}}";
    if (LAYER_RESULT_TOOLS.has(immediate)) return "{{layerIndex}}";
  }
  if (field === "itemIndex") {
    if (hasPreviousTool(steps, stepIndex, PROJECT_ITEM_RESULT_TOOLS)) return "{{itemIndices}}";
  }
  if (field === "itemIndices") {
    if (hasPreviousTool(steps, stepIndex, SELECTED_SOURCE_RESULT_TOOLS)) return "{{selectedPrecompItemIndices}}";
    if (hasPreviousTool(steps, stepIndex, PROJECT_ITEM_RESULT_TOOLS)) return "{{itemIndices}}";
  }
  if (field === "sourceItemIndex") {
    if (hasPreviousTool(steps, stepIndex, SELECTED_SOURCE_RESULT_TOOLS)) return "{{selectedPrecompItemIndex}}";
    if (hasPreviousTool(steps, stepIndex, PROJECT_ITEM_RESULT_TOOLS)) return "{{itemIndices}}";
  }
  if (field === "renderQueueItemIndex" && immediate === "add_comp_to_render_queue") {
    return "previous.renderQueueItem.index";
  }
  return "";
}

function repairToolName(step, stepIndex, catalog, actions, blockers) {
  const original = stepToolName(step);
  if (!original || catalog.toolByName(original)) return;

  const candidate = TOOL_ALIASES[normalizeToken(original)];
  if (!candidate || !catalog.toolByName(candidate) || !catalog.planningToolNames.has(candidate)) {
    blockers.push(`Step ${stepIndex + 1}: no bounded typed-tool repair for ${original}.`);
    return;
  }
  if (candidate === "run_extendscript" || candidate === "run_extendscript_file") {
    blockers.push(`Step ${stepIndex + 1}: repair refuses raw ExtendScript fallback for ${original}.`);
    return;
  }
  step.tool = candidate;
  delete step.mcpTool;
  delete step.name;
  addAction(actions, stepIndex, "tool-alias", `Mapped tool ${original} to ${candidate}.`, {
    before: original,
    after: candidate
  });
}

function repairArgAliases(step, stepIndex, tool, actions) {
  const properties = schemaProperties(tool);
  const args = { ...stepArgs(step) };
  let changed = false;

  for (const field of Object.keys(args)) {
    const canonical = canonicalArgField(field, properties);
    const originalValue = args[field];
    const repairedValue = bindingAlias(originalValue);
    if (canonical !== field) {
      if (!hasOwn(args, canonical) || missingValue(args[canonical])) {
        args[canonical] = repairedValue;
      }
      delete args[field];
      changed = true;
      addAction(actions, stepIndex, "arg-alias", `Mapped arg ${field} to ${canonical}.`, {
        before: field,
        after: canonical
      });
      if (repairedValue !== originalValue) {
        addAction(actions, stepIndex, "binding-alias", `Mapped binding ${originalValue} to ${repairedValue}.`, {
          field: canonical,
          before: originalValue,
          after: repairedValue
        });
      }
    } else if (repairedValue !== originalValue) {
      args[field] = repairedValue;
      changed = true;
      addAction(actions, stepIndex, "binding-alias", `Mapped binding ${originalValue} to ${repairedValue}.`, {
        field,
        before: originalValue,
        after: repairedValue
      });
    }
  }

  if (changed || step.arguments) {
    step.args = args;
    delete step.arguments;
  }
}

function repairResultBindingAliases(step, stepIndex, tool, actions) {
  const source = isPlainObject(step.resultBindings) ? step.resultBindings : {};
  const properties = schemaProperties(tool);
  const repaired = {};
  let changed = false;

  for (const field of Object.keys(source)) {
    const canonical = canonicalArgField(field, properties);
    const value = bindingAlias(source[field]);
    repaired[canonical] = value;
    if (canonical !== field || value !== source[field]) {
      changed = true;
      addAction(actions, stepIndex, canonical !== field ? "binding-field-alias" : "binding-alias", `Mapped result binding ${field} to ${canonical}.`, {
        before: field,
        after: canonical
      });
    }
  }

  if (changed) step.resultBindings = repaired;
}

function repairMissingRequired(step, stepIndex, steps, tool, actions) {
  if (!tool) return;
  const args = stepArgs(step);
  const bindings = isPlainObject(step.resultBindings) ? { ...step.resultBindings } : {};
  let changed = false;

  for (const field of requiredFields(tool)) {
    if (hasOwn(args, field) && !missingValue(args[field])) continue;
    if (hasOwn(bindings, field) && !missingValue(bindings[field])) continue;
    const binding = bindingForMissingField(field, steps, stepIndex);
    if (!binding) continue;
    bindings[field] = binding;
    changed = true;
    addAction(actions, stepIndex, "missing-required-binding", `Added runtime binding for required field ${field}.`, {
      field,
      binding
    });
  }

  if (changed) step.resultBindings = bindings;
}

function repairAgentPlan(plan, validation, catalogOptions) {
  const catalog = {
    tools: Array.isArray(catalogOptions && catalogOptions.tools) ? catalogOptions.tools : [],
    planningToolNames: new Set(Array.isArray(catalogOptions && catalogOptions.planningToolNames) ? catalogOptions.planningToolNames : [])
  };
  catalog.toolByName = (name) => catalog.tools.find((tool) => tool && tool.name === name) || null;

  const repair = {
    schema: PLAN_REPAIR_SCHEMA,
    applied: false,
    actions: [],
    blockers: [],
    warnings: [],
    originalValidation: planSummary(validation)
  };

  if (!isPlainObject(plan)) {
    repair.blockers.push("Plan is not an object.");
    return repair;
  }
  if (plan.clarifyingQuestion) {
    repair.blockers.push("Plan asks a clarifying question; repair is intentionally skipped.");
    return repair;
  }

  const repairedPlan = clonePlan(plan);
  if (!Array.isArray(repairedPlan.steps)) repairedPlan.steps = [];
  if (repairedPlan.steps.length > 50) {
    repair.blockers.push("Plan has too many steps for bounded repair.");
    return repair;
  }

  const workflowRepair = repairSelectedPrecompDuplicateWorkflow(repairedPlan, catalog, repair.actions);
  if (workflowRepair) {
    repair.applied = true;
    repair.summary = compactText(repair.actions.map((action) => action.message).join(" "), 280);
    repair.repairedPlan = workflowRepair;
    return repair;
  }

  for (let index = 0; index < repairedPlan.steps.length; index += 1) {
    const step = isPlainObject(repairedPlan.steps[index]) ? repairedPlan.steps[index] : {};
    repairedPlan.steps[index] = step;
    repairToolName(step, index, catalog, repair.actions, repair.blockers);
    const toolName = stepToolName(step);
    const tool = catalog.toolByName(toolName);
    if (!tool || !catalog.planningToolNames.has(toolName)) continue;
    repairArgAliases(step, index, tool, repair.actions);
    repairResultBindingAliases(step, index, tool, repair.actions);
    repairMissingRequired(step, index, repairedPlan.steps, tool, repair.actions);
  }

  repair.applied = repair.actions.length > 0;
  if (!repair.applied) return repair;

  if (repair.actions.length > 16) {
    return {
      ...repair,
      applied: false,
      repairedPlan: null,
      blockers: repair.blockers.concat("Repair exceeded the bounded action limit.")
    };
  }

  repair.summary = compactText(repair.actions.map((action) => action.message).join(" "), 280);
  repair.repairedPlan = repairedPlan;
  return repair;
}

module.exports = {
  PLAN_REPAIR_SCHEMA,
  repairAgentPlan
};
