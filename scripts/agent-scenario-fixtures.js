"use strict";

const DEFAULT_PLANNER_FIXTURE_PREFIX = "Codex QA Planner Fixture";
const DEFAULT_RENDER_QUEUE_BASELINE_TOTAL = 0;

const AGENT_SCENARIO_MUTATING_TOOLS = new Set([
  "create_comp",
  "create_project_folder",
  "create_test_comp",
  "create_solid_layer",
  "create_adjustment_layer",
  "create_null_layer",
  "create_text_layer",
  "create_shapes_from_text",
  "import_footage",
  "create_camera_layer",
  "create_camera_with_controller",
  "toggle_onion_skinning",
  "add_project_item_to_comp",
  "create_layer_mask",
  "move_project_items_to_folder",
  "set_comp_work_area",
  "set_layer_time_range",
  "stagger_layers",
  "align_layers_to_time",
  "split_layers_at_time",
  "update_text_layer",
  "create_shape_layer",
  "create_layer_connection_line",
  "fit_layer_to_comp",
  "set_layer_transform",
  "set_property_value",
  "set_layer_metadata",
  "set_layer_blending_mode",
  "set_project_item_metadata",
  "set_project_frames_count_type",
  "set_property_keyframes",
  "fill_in_keyframes",
  "keyframe_current_value_from_expression",
  "set_effect_property",
  "set_effect_enabled",
  "set_puppet_pin_type",
  "add_property_to_essential_graphics",
  "apply_keyframe_ease",
  "set_spatial_in_tangent",
  "set_expression",
  "clear_expression",
  "separate_shape_size_dimensions",
  "duplicate_layer",
  "duplicate_layers",
  "set_layer_selection",
  "set_layer_parent",
  "set_layer_track_matte",
  "delete_layer",
  "set_comp_current_time",
  "set_comp_properties",
  "refresh_comp_panel",
  "set_layer_mask",
  "set_path_geometry",
  "export_path_points",
  "export_text_to_file",
  "save_comp_frame_png",
  "add_comp_marker",
  "add_layer_marker",
  "update_layer_marker",
  "delete_layer_marker",
  "duplicate_comp",
  "deep_duplicate_precomp_sources",
  "precompose_layers",
  "replace_layer_source",
  "rename_layers",
  "rename_project_items",
  "add_effect",
  "add_comp_to_render_queue",
  "set_render_queue_output"
]);

function safeOutputName(value) {
  return String(value || "agent-scenario")
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "agent-scenario";
}

function exactPlanPrompt(plan) {
  return [
    "Return exactly this JSON object as the AE Agent plan. Do not add markdown, code fences, prose, comments, or renamed fields.",
    "The JSON object below is the complete QA fixture. Keep the steps array length, order, titles, tool names, args, resultBindings, summary, risk, and requiresCheckpoint unchanged.",
    "Do not add discovery, inspection, checkpoint, cleanup, verification, or explanatory steps. The bridge runner already handles validation, dry-run, protected edit sessions, verification, and cleanup.",
    "Use only the listed typed MCP tools. All generated asset names intentionally start with the QA prefix.",
    JSON.stringify(plan, null, 2)
  ].join("\n\n");
}

function expectedMutatingCount(plan) {
  return Array.isArray(plan && plan.steps)
    ? plan.steps.filter((step) => AGENT_SCENARIO_MUTATING_TOOLS.has(step.tool)).length
    : 0;
}

function agentScenarioPlans(runPrefix, renderQueueBaselineTotal) {
  const timelineBase = `${runPrefix} Timeline`;
  const layoutBase = `${runPrefix} Layout`;
  const sourceBase = `${runPrefix} Source`;
  const renderBase = `${runPrefix} Render`;
  const renderIndex = Number(renderQueueBaselineTotal || 0) + 1;
  const renderOutput = `logs/generated-renders/${safeOutputName(renderBase)}.mov`;
  const renderOutputUpdated = `logs/generated-renders/${safeOutputName(renderBase)}-updated.mov`;

  return [
    {
      id: "timeline-layer-timing",
      cleanupPrefix: timelineBase,
      expectedTools: [
        "create_test_comp",
        "create_solid_layer",
        "set_comp_work_area",
        "set_layer_time_range",
        "stagger_layers",
        "align_layers_to_time",
        "split_layers_at_time",
        "find_project_items"
      ],
      plan: {
        summary: "Live QA timeline and layer timing on generated assets.",
        risk: "low",
        requiresCheckpoint: true,
        steps: [
          { title: "Create timeline QA comp", tool: "create_test_comp", args: { name: timelineBase, width: 640, height: 360, duration: 4, frameRate: 24, openInViewer: false } },
          { title: "Create first timing layer", tool: "create_solid_layer", args: { compName: timelineBase, name: `${timelineBase} Layer A`, color: [0.15, 0.35, 0.85], width: 320, height: 180, startTime: 0, duration: 3 } },
          { title: "Create second timing layer", tool: "create_solid_layer", args: { compName: timelineBase, name: `${timelineBase} Layer B`, color: [0.85, 0.3, 0.18], width: 320, height: 180, startTime: 0, duration: 3 } },
          { title: "Set generated comp work area", tool: "set_comp_work_area", args: { compName: timelineBase, start: 0, duration: 2.5 } },
          { title: "Trim generated layers", tool: "set_layer_time_range", args: { compName: timelineBase, layerIndices: [1, 2], inPoint: 0, outPoint: 2 } },
          { title: "Stagger generated layers", tool: "stagger_layers", args: { compName: timelineBase, layerIndices: [1, 2], startTime: 0, gap: 0.1, order: "indexAsc" } },
          { title: "Align generated layers to zero", tool: "align_layers_to_time", args: { compName: timelineBase, layerIndices: [1, 2], targetTime: 0, align: "inPoint" } },
          { title: "Split one generated layer", tool: "split_layers_at_time", args: { compName: timelineBase, layerIndices: [1], time: 0.75 } },
          { title: "Read back timeline QA items", tool: "find_project_items", args: { query: timelineBase, limit: 10, caseSensitive: true } }
        ]
      }
    },
    {
      id: "text-shape-layout-animation",
      cleanupPrefix: layoutBase,
      expectedTools: [
        "create_test_comp",
        "create_text_layer",
        "update_text_layer",
        "create_shape_layer",
        "fit_layer_to_comp",
        "set_property_keyframes",
        "apply_keyframe_ease",
        "set_expression",
        "clear_expression",
        "find_project_items"
      ],
      plan: {
        summary: "Live QA text, shape, layout, and animation on generated assets.",
        risk: "low",
        requiresCheckpoint: true,
        steps: [
          { title: "Create layout QA comp", tool: "create_test_comp", args: { name: layoutBase, width: 640, height: 360, duration: 4, frameRate: 24, openInViewer: false } },
          { title: "Create generated text layer", tool: "create_text_layer", args: { compName: layoutBase, name: `${layoutBase} Title`, text: "QA 1.2", position: [320, 110], fontSize: 42, fillColor: [0.95, 0.95, 0.85], duration: 3 } },
          { title: "Update generated text layer", tool: "update_text_layer", args: { compName: layoutBase, layerIndex: 1, text: "QA 1.2 Updated", fontSize: 48, fillColor: [0.2, 0.95, 0.75], applyFill: true, tracking: 15 } },
          { title: "Create generated shape layer", tool: "create_shape_layer", args: { compName: layoutBase, name: `${layoutBase} Shape`, shape: "rectangle", size: [240, 120], position: [320, 220], fillColor: [0.12, 0.45, 0.9], strokeColor: [1, 1, 1], strokeWidth: 4, duration: 3 } },
          { title: "Fit generated shape to comp", tool: "fit_layer_to_comp", args: { compName: layoutBase, layerIndices: [1], mode: "contain", alignX: "center", alignY: "center" } },
          { title: "Set opacity keyframes", tool: "set_property_keyframes", args: { compName: layoutBase, layerIndex: 1, propertyPath: "ADBE Transform Group.ADBE Opacity", clearExisting: true, keyframes: [{ time: 0, value: 0 }, { time: 1, value: 100 }, { time: 2, value: 40 }] } },
          { title: "Apply easing to opacity keys", tool: "apply_keyframe_ease", args: { compName: layoutBase, layerIndex: 1, propertyPath: "ADBE Transform Group.ADBE Opacity", keyIndices: [1, 2, 3], interpolation: "bezier", easeIn: { speed: 0, influence: 33 }, easeOut: { speed: 0, influence: 33 } } },
          { title: "Set generated position expression", tool: "set_expression", args: { compName: layoutBase, layerIndex: 1, propertyPath: "ADBE Transform Group.ADBE Position", expression: "value + [Math.sin(time * 2) * 4, 0]", enabled: true } },
          { title: "Clear generated position expression", tool: "clear_expression", args: { compName: layoutBase, layerIndex: 1, propertyPath: "ADBE Transform Group.ADBE Position" } },
          { title: "Read back layout QA items", tool: "find_project_items", args: { query: layoutBase, limit: 10, caseSensitive: true } }
        ]
      }
    },
    {
      id: "precomp-source-rename",
      cleanupPrefix: sourceBase,
      expectedTools: [
        "create_test_comp",
        "create_solid_layer",
        "precompose_layers",
        "replace_layer_source",
        "rename_layers",
        "rename_project_items",
        "find_project_items"
      ],
      plan: {
        summary: "Live QA precomp, source replacement, and rename tools on generated assets.",
        risk: "low",
        requiresCheckpoint: true,
        steps: [
          { title: "Create source QA main comp", tool: "create_test_comp", args: { name: `${sourceBase} Main`, width: 640, height: 360, duration: 4, frameRate: 24, openInViewer: false } },
          { title: "Create replacement source comp", tool: "create_test_comp", args: { name: `${sourceBase} Replacement`, width: 320, height: 180, duration: 4, frameRate: 24, openInViewer: false } },
          { title: "Create layer to precompose", tool: "create_solid_layer", args: { compName: `${sourceBase} Main`, name: `${sourceBase} Plate`, color: [0.4, 0.2, 0.9], width: 320, height: 180, duration: 3 } },
          { title: "Precompose generated layer", tool: "precompose_layers", args: { compName: `${sourceBase} Main`, layerIndices: [1], newCompName: `${sourceBase} Precomp`, moveAllAttributes: true, openInViewer: false } },
          { title: "Replace generated precomp source", tool: "replace_layer_source", args: { compName: `${sourceBase} Main`, layerIndices: [1], sourceItemName: `${sourceBase} Replacement`, sourceItemType: "comp", fixExpressions: true } },
          { title: "Rename generated layer", tool: "rename_layers", args: { compName: `${sourceBase} Main`, layerIndices: [1], mode: "exact", name: `${sourceBase} Replaced Layer` } },
          { title: "Rename generated replacement comp", tool: "rename_project_items", args: { query: `${sourceBase} Replacement`, type: "comp", exactName: true, limit: 1, mode: "exact", name: `${sourceBase} Replacement Renamed` } },
          { title: "Find generated source QA items", tool: "find_project_items", args: { query: sourceBase, limit: 10, caseSensitive: true } }
        ]
      }
    },
    {
      id: "render-queue-setup",
      cleanupPrefix: renderBase,
      expectedTools: [
        "create_test_comp",
        "add_comp_to_render_queue",
        "set_render_queue_output",
        "get_render_queue_status"
      ],
      plan: {
        summary: "Live QA render queue setup on a generated comp without starting a render.",
        risk: "low",
        requiresCheckpoint: true,
        steps: [
          { title: "Create render QA comp", tool: "create_test_comp", args: { name: renderBase, width: 640, height: 360, duration: 2, frameRate: 24, openInViewer: false } },
          { title: "Add generated comp to render queue", tool: "add_comp_to_render_queue", args: { compName: renderBase, outputPath: renderOutput } },
          { title: "Update generated render queue output", tool: "set_render_queue_output", args: { renderQueueItemIndex: renderIndex, outputPath: renderOutputUpdated } },
          { title: "Read render queue status", tool: "get_render_queue_status", args: { limit: renderIndex + 3 } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentRenderQueueScenarioPlans(runPrefix, renderQueueBaselineTotal) {
  const renderBase = `${runPrefix} Render Queue`;
  const folderName = `${renderBase} Folder`;
  const renderIndex = Number(renderQueueBaselineTotal || 0) + 1;

  return [
    {
      id: "generated-render-queue-setup",
      cleanupPrefix: renderBase,
      expectedTools: [
        "create_project_folder",
        "create_comp",
        "move_project_items_to_folder",
        "list_project_folder_items",
        "add_comp_to_render_queue",
        "get_render_queue_status"
      ],
      expectedReadBack: {
        generatedRenderQueue: true,
        folderName,
        compName: renderBase,
        renderQueueItemIndex: renderIndex
      },
      plan: {
        summary: "AE_AGENT_QA_098 generated-only live QA for explicit Project folder to render queue setup without starting a render.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated render queue folder", tool: "create_project_folder", args: { name: folderName, allowExisting: false } },
          { title: "Create generated render queue comp", tool: "create_comp", args: { name: renderBase, width: 640, height: 360, pixelAspect: 1, duration: 2, frameRate: 24, bgColor: [0.08, 0.1, 0.12], allowDuplicateName: false, openInViewer: false, comment: "AE_AGENT_QA_098 generated-only render queue validation" } },
          { title: "Move generated comp into generated render queue folder", tool: "move_project_items_to_folder", args: { targetFolderName: folderName }, resultBindings: { itemIndices: "{{steps.2.itemIndex}}" } },
          { title: "List generated render queue folder contents", tool: "list_project_folder_items", args: { folderName, recursive: true, type: "comp", limit: 10 } },
          { title: "Add generated folder comp to render queue", tool: "add_comp_to_render_queue", args: { compName: renderBase } },
          { title: "Read generated render queue status", tool: "get_render_queue_status", args: { limit: renderIndex + 3 } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentNewToolsScenarioPlans(runPrefix) {
  const base = `${runPrefix} New Tools`;
  const folderName = `${base} Folder`;
  const compName = `${base} Comp`;
  const cameraName = `${base} Camera`;

  return [
    {
      id: "project-folder-comp-camera-matrix",
      cleanupPrefix: base,
      expectedTools: [
        "create_project_folder",
        "create_comp",
        "move_project_items_to_folder",
        "list_project_folder_items",
        "create_camera_layer",
        "get_layer_details"
      ],
      expectedReadBack: {
        folderName,
        compName,
        cameraName,
        cameraZoom: 800
      },
      plan: {
        summary: "Live QA for production comp, project folder, folder listing, explicit project-item move, and camera layer tools on generated assets.",
        risk: "low",
        requiresCheckpoint: true,
        steps: [
          {
            title: "Create generated project folder",
            tool: "create_project_folder",
            args: {
              name: folderName,
              allowExisting: false
            }
          },
          {
            title: "Create generated production comp",
            tool: "create_comp",
            args: {
              name: compName,
              width: 640,
              height: 360,
              pixelAspect: 1,
              duration: 2,
              frameRate: 24,
              bgColor: [0.08, 0.1, 0.12],
              allowDuplicateName: false,
              openInViewer: false,
              comment: "M190 generated-only Full UI Agent validation"
            }
          },
          {
            title: "Move generated comp into generated folder",
            tool: "move_project_items_to_folder",
            args: {
              targetFolderName: folderName
            },
            resultBindings: {
              itemIndices: "{{steps.2.itemIndex}}"
            }
          },
          {
            title: "List generated folder contents",
            tool: "list_project_folder_items",
            args: {
              folderName,
              recursive: false,
              type: "comp",
              limit: 10
            }
          },
          {
            title: "Create generated camera layer",
            tool: "create_camera_layer",
            args: {
              compName,
              name: cameraName,
              pointOfInterest: [320, 180, 0],
              position: [320, 180, -850],
              zoom: 800,
              startTime: 0,
              duration: 2
            }
          },
          {
            title: "Read back generated camera details",
            tool: "get_layer_details",
            args: {
              compName
            },
            resultBindings: {
              layerIndex: "{{steps.5.layer.index}}"
            }
          }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentMaskSafetyScenarioPlans(runPrefix) {
  const base = `${runPrefix} Mask Safety`;
  const compName = `${base} Comp`;
  const layerName = `${base} Solid`;
  const maskName = `${base} Polygon Mask`;
  const maskVertices = [
    [120, 80],
    [520, 80],
    [520, 280],
    [120, 280]
  ];

  return [
    {
      id: "generated-mask-safety-matrix",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_solid_layer",
        "create_layer_mask",
        "get_layer_details"
      ],
      expectedReadBack: {
        compName,
        layerName,
        maskName,
        maskVertices,
        maskMode: "add",
        maskCount: 1
      },
      plan: {
        summary: "Live QA for generated-only mask creation and read-back inside After Effects.",
        risk: "low",
        requiresCheckpoint: true,
        steps: [
          {
            title: "Create generated mask QA comp",
            tool: "create_comp",
            args: {
              name: compName,
              width: 640,
              height: 360,
              pixelAspect: 1,
              duration: 2,
              frameRate: 24,
              bgColor: [0.08, 0.1, 0.12],
              allowDuplicateName: false,
              openInViewer: false,
              comment: "M191 generated-only mask safety validation"
            }
          },
          {
            title: "Create generated mask target layer",
            tool: "create_solid_layer",
            args: {
              compName,
              name: layerName,
              color: [0.18, 0.48, 0.86],
              width: 640,
              height: 360,
              pixelAspect: 1,
              startTime: 0,
              duration: 2
            }
          },
          {
            title: "Create generated additive polygon mask",
            tool: "create_layer_mask",
            args: {
              compName,
              layerIndex: 1,
              name: maskName,
              vertices: maskVertices,
              maskMode: "add",
              opacity: 100,
              feather: [0, 0],
              expansion: 0
            }
          },
          {
            title: "Read back generated mask details",
            tool: "get_layer_details",
            args: {
              compName,
              layerIndex: 1,
              includeProperties: false
            }
          }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentMarkerLifecycleScenarioPlans(runPrefix) {
  const base = `${runPrefix} Marker Lifecycle`;
  const compName = `${base} Comp`;
  const layerName = `${base} Solid`;
  const initialComment = `${base} Initial Marker`;
  const updatedComment = `${base} Updated Marker`;

  return [
    {
      id: "generated-marker-lifecycle-matrix",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_solid_layer",
        "add_layer_marker",
        "get_layer_details",
        "update_layer_marker",
        "delete_layer_marker"
      ],
      expectedReadBack: {
        compName,
        layerName,
        markerLifecycle: true,
        finalMarkerCount: 0,
        deletedComment: updatedComment,
        deletedTime: 1.5
      },
      plan: {
        summary: "Live QA for generated-only layer marker add, update, delete, and read-back inside After Effects.",
        risk: "low",
        requiresCheckpoint: true,
        steps: [
          {
            title: "Create generated marker QA comp",
            tool: "create_comp",
            args: {
              name: compName,
              width: 640,
              height: 360,
              pixelAspect: 1,
              duration: 3,
              frameRate: 24,
              bgColor: [0.08, 0.1, 0.12],
              allowDuplicateName: false,
              openInViewer: false,
              comment: "M198 generated-only marker lifecycle validation"
            }
          },
          {
            title: "Create generated marker target layer",
            tool: "create_solid_layer",
            args: {
              compName,
              name: layerName,
              color: [0.24, 0.54, 0.82],
              width: 640,
              height: 360,
              pixelAspect: 1,
              startTime: 0,
              duration: 3
            }
          },
          {
            title: "Add generated layer marker",
            tool: "add_layer_marker",
            args: {
              compName,
              layerIndex: 1,
              time: 1.25,
              comment: initialComment,
              duration: 0.25
            }
          },
          {
            title: "Read marker after add",
            tool: "get_layer_details",
            args: {
              compName,
              layerIndex: 1,
              includeProperties: false
            }
          },
          {
            title: "Update generated layer marker",
            tool: "update_layer_marker",
            args: {
              compName,
              layerIndex: 1,
              markerIndex: 1,
              targetComment: initialComment,
              comment: updatedComment,
              time: 1.5,
              duration: 0.5
            }
          },
          {
            title: "Read marker after update",
            tool: "get_layer_details",
            args: {
              compName,
              layerIndex: 1,
              includeProperties: false
            }
          },
          {
            title: "Delete generated layer marker",
            tool: "delete_layer_marker",
            args: {
              compName,
              layerIndex: 1,
              markerIndex: 1,
              targetComment: updatedComment
            }
          },
          {
            title: "Read marker after delete",
            tool: "get_layer_details",
            args: {
              compName,
              layerIndex: 1,
              includeProperties: false
            }
          }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentDuplicateLayersScenarioPlans(runPrefix) {
  const base = `${runPrefix} Duplicate Layers`;
  const compName = `${base} Comp`;
  const layerAName = `${base} Source A`;
  const layerBName = `${base} Source B`;
  const duplicateAName = `${layerAName} Copy`;
  const duplicateBName = `${layerBName} Copy`;

  return [
    {
      id: "generated-duplicate-layers-matrix",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_solid_layer",
        "duplicate_layers",
        "get_comp_details"
      ],
      expectedReadBack: {
        compName,
        duplicateLayers: true,
        sourceNames: [layerAName, layerBName],
        duplicateNames: [duplicateAName, duplicateBName],
        layerCountAfter: 4
      },
      plan: {
        summary: "Live QA for generated-only duplicate_layers source/duplicate pair read-back inside After Effects.",
        risk: "low",
        requiresCheckpoint: true,
        steps: [
          {
            title: "Create generated duplicate layers QA comp",
            tool: "create_comp",
            args: {
              name: compName,
              width: 640,
              height: 360,
              pixelAspect: 1,
              duration: 3,
              frameRate: 24,
              bgColor: [0.08, 0.1, 0.12],
              allowDuplicateName: false,
              openInViewer: false,
              comment: "M207 generated-only duplicate_layers validation"
            }
          },
          {
            title: "Create first generated duplicate source layer",
            tool: "create_solid_layer",
            args: {
              compName,
              name: layerAName,
              color: [0.2, 0.52, 0.86],
              width: 240,
              height: 180,
              pixelAspect: 1,
              startTime: 0,
              duration: 3
            }
          },
          {
            title: "Create second generated duplicate source layer",
            tool: "create_solid_layer",
            args: {
              compName,
              name: layerBName,
              color: [0.86, 0.42, 0.2],
              width: 240,
              height: 180,
              pixelAspect: 1,
              startTime: 0,
              duration: 3
            }
          },
          {
            title: "Duplicate generated layers explicitly",
            tool: "duplicate_layers",
            args: {
              compName,
              layerIndices: [1, 2],
              sourceNames: [layerBName, layerAName],
              nameSuffix: " Copy"
            }
          },
          {
            title: "Read back generated duplicate layer details",
            tool: "get_comp_details",
            args: {
              compName,
              includeLayers: true,
              layerLimit: 10
            }
          }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentLayerSelectionScenarioPlans(runPrefix) {
  const base = `${runPrefix} Layer Selection`;
  const compName = `${base} Comp`;
  const solidName = `${base} Plate`;
  const shapeName = `${base} Shape`;
  const textName = `${base} Text`;
  const selectedLayerIndices = [1, 2];
  const selectedLayerNames = [textName, shapeName];

  return [
    {
      id: "generated-layer-selection-set",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_solid_layer",
        "create_shape_layer",
        "create_text_layer",
        "get_comp_details",
        "set_layer_selection",
        "get_selected_layers",
        "get_layer_details"
      ],
      expectedReadBack: {
        generatedLayerSelection: true,
        compName,
        selectedLayerIndices,
        selectedLayerNames
      },
      plan: {
        summary: "AE_AGENT_QA_101 generated-only live QA for explicit layer selection mutation and read-back.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated layer-selection comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.06, 0.08, 0.1], allowDuplicateName: false, openInViewer: true, comment: "AE_AGENT_QA_101 generated-only layer selection validation" } },
          { title: "Create generated selection solid", tool: "create_solid_layer", args: { compName, name: solidName, color: [0.18, 0.24, 0.32], width: 320, height: 180, pixelAspect: 1, startTime: 0, duration: 3 } },
          { title: "Create generated selection shape", tool: "create_shape_layer", args: { compName, name: shapeName, shape: "rectangle", size: [180, 120], position: [280, 180], fillColor: [0.25, 0.62, 0.82], strokeColor: [1, 1, 1], strokeWidth: 2, duration: 3 } },
          { title: "Create generated selection text", tool: "create_text_layer", args: { compName, text: "Selection", name: textName, position: [360, 180], fontSize: 48, fillColor: [0.9, 0.9, 0.86], startTime: 0, duration: 3 } },
          { title: "Read generated layer stack before selection", tool: "get_comp_details", args: { compName, includeLayers: true, layerLimit: 10 } },
          { title: "Set generated layer selection explicitly", tool: "set_layer_selection", args: { compName, layerIndices: selectedLayerIndices, expectedLayerNames: selectedLayerNames, makeActive: true } },
          { title: "Read generated selected layers", tool: "get_selected_layers", args: {} },
          { title: "Read first selected layer details", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: false } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentLayerMetadataScenarioPlans(runPrefix) {
  const base = `${runPrefix} Layer Metadata`;
  const compName = `${base} Comp`;
  const solidName = `${base} Solid`;
  const textName = `${base} Text`;
  const targetLayerIndices = [1, 2];
  const targetLayerNames = [textName, solidName];
  const metadata = {
    comment: "AE_AGENT_QA_LM generated layer metadata",
    label: 9,
    locked: true
  };

  return [
    {
      id: "generated-layer-metadata",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_solid_layer",
        "create_text_layer",
        "get_comp_details",
        "set_layer_metadata",
        "get_layer_details",
        "get_layer_details"
      ],
      expectedReadBack: {
        generatedLayerMetadata: true,
        compName,
        targetLayerIndices,
        targetLayerNames,
        metadata
      },
      plan: {
        summary: "AE_AGENT_QA_LM generated-only live QA for explicit layer comment, label, and locked metadata.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated layer-metadata comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.07, 0.08, 0.1], allowDuplicateName: false, openInViewer: true, comment: "AE_AGENT_QA_LM generated-only layer metadata validation" } },
          { title: "Create generated metadata solid", tool: "create_solid_layer", args: { compName, name: solidName, color: [0.22, 0.28, 0.36], width: 320, height: 180, pixelAspect: 1, startTime: 0, duration: 3 } },
          { title: "Create generated metadata text", tool: "create_text_layer", args: { compName, text: "Metadata", name: textName, position: [360, 180], fontSize: 44, fillColor: [0.95, 0.9, 0.76], startTime: 0, duration: 3 } },
          { title: "Read generated layer stack before metadata", tool: "get_comp_details", args: { compName, includeLayers: true, layerLimit: 10 } },
          { title: "Set generated layer metadata explicitly", tool: "set_layer_metadata", args: { compName, layerIndices: targetLayerIndices, expectedLayerNames: targetLayerNames, comment: metadata.comment, label: metadata.label, locked: metadata.locked } },
          { title: "Read first generated metadata layer", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: false } },
          { title: "Read second generated metadata layer", tool: "get_layer_details", args: { compName, layerIndex: 2, includeProperties: false } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentLayerEnabledHardSoloScenarioPlans(runPrefix) {
  const base = `${runPrefix} Layer Enabled Hard Solo`;
  const compName = `${base} Comp`;
  const solidName = `${base} Solid`;
  const textName = `${base} Text`;
  const selectedLayerIndices = [1];
  const selectedLayerNames = [textName];
  const disabledLayerIndices = [2];
  const disabledLayerNames = [solidName];

  return [
    {
      id: "generated-layer-enabled-hard-solo",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_solid_layer",
        "create_text_layer",
        "get_comp_details",
        "set_layer_selection",
        "get_selected_layers",
        "set_layer_metadata",
        "get_layer_details",
        "set_layer_metadata",
        "get_layer_details"
      ],
      expectedReadBack: {
        generatedLayerEnabledHardSolo: true,
        compName,
        selectedLayerIndices,
        selectedLayerNames,
        disabledLayerIndices,
        disabledLayerNames
      },
      plan: {
        summary: "Generated-only live QA for hard-solo layer enabled state using explicit layer targets.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated hard-solo comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.08, 0.08, 0.1], allowDuplicateName: false, openInViewer: true, comment: "Generated-only layer enabled hard-solo validation" } },
          { title: "Create generated hard-solo solid", tool: "create_solid_layer", args: { compName, name: solidName, color: [0.2, 0.25, 0.34], width: 320, height: 180, pixelAspect: 1, startTime: 0, duration: 3 } },
          { title: "Create generated hard-solo text", tool: "create_text_layer", args: { compName, text: "Hard Solo", name: textName, position: [360, 180], fontSize: 42, fillColor: [0.92, 0.9, 0.78], startTime: 0, duration: 3 } },
          { title: "Read generated layer inventory before hard solo", tool: "get_comp_details", args: { compName, includeLayers: true, layerLimit: 10 } },
          { title: "Select generated hard-solo layers explicitly", tool: "set_layer_selection", args: { compName, layerIndices: selectedLayerIndices, expectedLayerNames: selectedLayerNames, makeActive: true } },
          { title: "Read generated selected layers for hard solo", tool: "get_selected_layers", args: {} },
          { title: "Keep selected generated layers enabled", tool: "set_layer_metadata", args: { compName, layerIndices: selectedLayerIndices, expectedLayerNames: selectedLayerNames, enabled: true } },
          { title: "Read first selected hard-solo layer", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: false } },
          { title: "Disable unselected generated hard-solo layer", tool: "set_layer_metadata", args: { compName, layerIndices: disabledLayerIndices, expectedLayerNames: disabledLayerNames, enabled: false } },
          { title: "Read disabled hard-solo layer", tool: "get_layer_details", args: { compName, layerIndex: 2, includeProperties: false } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentLayerBlendingModeScenarioPlans(runPrefix) {
  const base = `${runPrefix} Layer Difference Blend Mode`;
  const compName = `${base} Comp`;
  const solidName = `${base} Solid`;
  const textName = `${base} Text`;
  const targetLayerIndices = [1, 2];
  const targetLayerNames = [textName, solidName];

  return [
    {
      id: "generated-layer-difference-blend-mode",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_solid_layer",
        "create_text_layer",
        "get_comp_details",
        "set_layer_selection",
        "get_selected_layers",
        "set_layer_blending_mode",
        "get_layer_details",
        "get_layer_details"
      ],
      expectedReadBack: {
        generatedLayerDifferenceBlendMode: true,
        compName,
        targetLayerIndices,
        targetLayerNames,
        blendingMode: "difference"
      },
      plan: {
        summary: "Generated-only live QA for selected layer Difference blending mode using explicit layer targets.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated difference blend comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.06, 0.08, 0.1], allowDuplicateName: false, openInViewer: true, comment: "Generated-only layer difference blending mode validation" } },
          { title: "Create generated lower blend solid", tool: "create_solid_layer", args: { compName, name: solidName, color: [0.12, 0.55, 0.72], width: 360, height: 220, pixelAspect: 1, startTime: 0, duration: 3 } },
          { title: "Create generated upper blend text", tool: "create_text_layer", args: { compName, text: "Difference", name: textName, position: [340, 180], fontSize: 46, fillColor: [0.94, 0.82, 0.22], startTime: 0, duration: 3 } },
          { title: "Read generated blend layer inventory", tool: "get_comp_details", args: { compName, includeLayers: true, layerLimit: 10 } },
          { title: "Select generated difference blend targets explicitly", tool: "set_layer_selection", args: { compName, layerIndices: targetLayerIndices, expectedLayerNames: targetLayerNames, makeActive: true } },
          { title: "Read generated selected layers for blend mode", tool: "get_selected_layers", args: {} },
          { title: "Set generated selected layers to Difference blending", tool: "set_layer_blending_mode", args: { compName, layerIndices: targetLayerIndices, expectedLayerNames: targetLayerNames, expectedCurrentBlendingModes: ["normal", "normal"], blendingMode: "difference" } },
          { title: "Read first difference blend layer", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: false } },
          { title: "Read second difference blend layer", tool: "get_layer_details", args: { compName, layerIndex: 2, includeProperties: false } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentDakkshinTypedToolsScenarioPlans(runPrefix) {
  const base = `${runPrefix} Dakkshin Typed Tools`;
  const compName = `${base} Comp`;
  const maskLayerName = `${base} Mask Target`;
  const deleteLayerName = `${base} Delete Target`;
  const maskName = `${base} Mask`;
  const updatedVertices = [[80, 70], [540, 90], [500, 300], [110, 270]];
  const compProperties = {
    width: 800,
    height: 450,
    pixelAspect: 1,
    duration: 4,
    frameRate: 24,
    bgColor: [0.12, 0.16, 0.22],
    displayStartTime: 0.5
  };

  return [
    {
      id: "generated-dakkshin-typed-tools-matrix",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "set_comp_properties",
        "create_solid_layer",
        "get_comp_details",
        "delete_layer",
        "set_layer_mask",
        "get_layer_details"
      ],
      expectedReadBack: {
        dakkshinTypedTools: true,
        compName,
        compProperties,
        layerName: maskLayerName,
        deletedLayerName: deleteLayerName,
        layerCountAfter: 1,
        maskName,
        maskCount: 1,
        maskMode: "subtract",
        maskVertices: updatedVertices,
        inverted: true,
        opacity: 72,
        feather: [6, 3],
        expansion: 9
      },
      plan: {
        summary: "M223 generated-only live QA for delete_layer, set_comp_properties, and set_layer_mask.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          {
            title: "Create generated Dakkshin QA comp",
            tool: "create_comp",
            args: {
              name: compName,
              width: 640,
              height: 360,
              pixelAspect: 1,
              duration: 3,
              frameRate: 24,
              bgColor: [0.08, 0.1, 0.12],
              allowDuplicateName: false,
              openInViewer: false,
              comment: "M223 generated-only Dakkshin typed tools validation"
            }
          },
          {
            title: "Set generated comp properties",
            tool: "set_comp_properties",
            args: {
              compName,
              width: compProperties.width,
              height: compProperties.height,
              pixelAspect: compProperties.pixelAspect,
              duration: compProperties.duration,
              frameRate: compProperties.frameRate,
              bgColor: compProperties.bgColor,
              displayStartTime: compProperties.displayStartTime
            }
          },
          {
            title: "Read generated Dakkshin comp after property update",
            tool: "get_comp_details",
            args: {
              compName,
              includeLayers: true,
              layerLimit: 10
            }
          },
          {
            title: "Create generated delete target layer",
            tool: "create_solid_layer",
            args: {
              compName,
              name: deleteLayerName,
              color: [0.88, 0.24, 0.18],
              width: 220,
              height: 140,
              pixelAspect: 1,
              startTime: 0,
              duration: 4
            }
          },
          {
            title: "Create generated mask target layer",
            tool: "create_solid_layer",
            args: {
              compName,
              name: maskLayerName,
              color: [0.18, 0.48, 0.86],
              width: 800,
              height: 450,
              pixelAspect: 1,
              startTime: 0,
              duration: 4
            }
          },
          {
            title: "Inspect generated Dakkshin layer stack",
            tool: "get_comp_details",
            args: {
              compName,
              includeLayers: true,
              layerLimit: 10
            }
          },
          {
            title: "Delete generated target layer explicitly",
            tool: "delete_layer",
            args: {
              compName,
              layerIndex: 2,
              expectedLayerName: deleteLayerName
            }
          },
          {
            title: "Read generated Dakkshin comp after delete",
            tool: "get_comp_details",
            args: {
              compName,
              includeLayers: true,
              layerLimit: 10
            }
          },
          {
            title: "Create generated target mask",
            tool: "set_layer_mask",
            args: {
              compName,
              layerIndex: 1,
              operation: "create",
              name: maskName,
              vertices: [[90, 80], [520, 80], [520, 280], [90, 280]],
              maskMode: "add",
              inverted: false,
              opacity: 100,
              feather: [0, 0],
              expansion: 0
            }
          },
          {
            title: "Read generated Dakkshin mask after create",
            tool: "get_layer_details",
            args: {
              compName,
              layerIndex: 1,
              includeProperties: false
            }
          },
          {
            title: "Update generated target mask",
            tool: "set_layer_mask",
            args: {
              compName,
              layerIndex: 1,
              operation: "update",
              maskIndex: 1,
              expectedMaskName: maskName,
              vertices: updatedVertices,
              maskMode: "subtract",
              inverted: true,
              opacity: 72,
              feather: [6, 3],
              expansion: 9
            }
          },
          {
            title: "Read generated Dakkshin comp after mutations",
            tool: "get_comp_details",
            args: {
              compName,
              includeLayers: true,
              layerLimit: 10
            }
          },
          {
            title: "Read generated Dakkshin mask details",
            tool: "get_layer_details",
            args: {
              compName,
              layerIndex: 1,
              includeProperties: false
            }
          }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentResetWorkAreaScenarioPlans(runPrefix) {
  const base = `${runPrefix} Reset Work Area`;
  const compName = `${base} Comp`;
  const shortWorkArea = {
    start: 1,
    duration: 2
  };
  const fullWorkArea = {
    start: 0,
    duration: 5
  };

  return [
    {
      id: "generated-reset-work-area",
      cleanupPrefix: base,
      expectedTools: [
        "create_test_comp",
        "set_comp_work_area",
        "get_comp_details"
      ],
      expectedReadBack: {
        resetWorkArea: true,
        compName,
        fullWorkArea,
        shortWorkArea
      },
      plan: {
        summary: "AE_AGENT_QA_026 generated-only live QA for resetting a generated comp work area to full duration.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          {
            title: "Create generated reset work area comp",
            tool: "create_test_comp",
            args: {
              name: compName,
              width: 640,
              height: 360,
              duration: fullWorkArea.duration,
              frameRate: 24,
              openInViewer: false
            }
          },
          {
            title: "Set generated comp work area to a short range",
            tool: "set_comp_work_area",
            args: {
              compName,
              start: shortWorkArea.start,
              duration: shortWorkArea.duration
            }
          },
          {
            title: "Read generated short work area",
            tool: "get_comp_details",
            args: {
              compName,
              includeLayers: false
            }
          },
          {
            title: "Reset generated comp work area to full duration",
            tool: "set_comp_work_area",
            args: {
              compName,
              start: fullWorkArea.start,
              duration: fullWorkArea.duration
            }
          },
          {
            title: "Read generated full work area",
            tool: "get_comp_details",
            args: {
              compName,
              includeLayers: false
            }
          }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentRenameFindReplaceScenarioPlans(runPrefix) {
  const base = `${runPrefix} Rename Find Replace`;
  const compName = `${base} Comp`;
  const layerAName = `${base} Alpha Plate`;
  const layerBName = `${base} Alpha Text`;
  const expectedLayerAName = `${base} Beta Plate`;
  const expectedLayerBName = `${base} Beta Text`;

  return [
    {
      id: "generated-rename-find-replace",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_solid_layer",
        "create_text_layer",
        "get_comp_details",
        "rename_layers"
      ],
      expectedReadBack: {
        findReplaceLayerRename: true,
        compName,
        beforeNames: [layerAName, layerBName],
        afterNames: [expectedLayerAName, expectedLayerBName],
        find: "Alpha",
        replace: "Beta",
        layerCountAfter: 2
      },
      plan: {
        summary: "AE_AGENT_QA_032 generated-only live QA for rename_layers findReplace on generated layer names.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          {
            title: "Create generated rename find-replace comp",
            tool: "create_comp",
            args: {
              name: compName,
              width: 640,
              height: 360,
              pixelAspect: 1,
              duration: 3,
              frameRate: 24,
              bgColor: [0.08, 0.1, 0.12],
              allowDuplicateName: false,
              openInViewer: false,
              comment: "AE_AGENT_QA_032 generated-only rename findReplace validation"
            }
          },
          {
            title: "Create first generated rename source layer",
            tool: "create_solid_layer",
            args: {
              compName,
              name: layerAName,
              color: [0.2, 0.52, 0.86],
              width: 240,
              height: 180,
              pixelAspect: 1,
              startTime: 0,
              duration: 3
            }
          },
          {
            title: "Create second generated rename source layer",
            tool: "create_text_layer",
            args: {
              compName,
              name: layerBName,
              text: "AE_AGENT_QA_032 Alpha",
              position: [320, 180],
              fontSize: 44,
              fillColor: [0.95, 0.95, 0.85],
              startTime: 0,
              duration: 3
            }
          },
          {
            title: "Read generated layer names before find replace",
            tool: "get_comp_details",
            args: {
              compName,
              includeLayers: true,
              layerLimit: 10
            }
          },
          {
            title: "Find and replace generated layer name text",
            tool: "rename_layers",
            args: {
              compName,
              layerIndices: [1, 2],
              mode: "findReplace",
              find: "Alpha",
              replace: "Beta",
              caseSensitive: true
            }
          },
          {
            title: "Read generated layer names after find replace",
            tool: "get_comp_details",
            args: {
              compName,
              includeLayers: true,
              layerLimit: 10
            }
          }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentLayerNameResetScenarioPlans(runPrefix) {
  const base = `${runPrefix} Layer Name Reset`;
  const compName = `${base} Comp`;
  const layerAName = `${base} Plate`;
  const layerBName = `${base} Text`;

  return [
    {
      id: "generated-layer-name-reset",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_solid_layer",
        "create_text_layer",
        "get_comp_details",
        "rename_layers"
      ],
      expectedReadBack: {
        emptyLayerNameReset: true,
        compName,
        beforeNames: [layerAName, layerBName],
        expectedEmptyNameCount: 2,
        layerCountAfter: 2
      },
      plan: {
        summary: "Generated-only live QA for resetting reviewed generated layer names to empty strings.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          {
            title: "Create generated layer-name reset comp",
            tool: "create_comp",
            args: {
              name: compName,
              width: 640,
              height: 360,
              pixelAspect: 1,
              duration: 3,
              frameRate: 24,
              bgColor: [0.08, 0.1, 0.12],
              allowDuplicateName: false,
              openInViewer: false,
              comment: "Generated-only empty layer-name reset validation"
            }
          },
          {
            title: "Create first generated layer-name reset source layer",
            tool: "create_solid_layer",
            args: {
              compName,
              name: layerAName,
              color: [0.2, 0.52, 0.86],
              width: 240,
              height: 180,
              pixelAspect: 1,
              startTime: 0,
              duration: 3
            }
          },
          {
            title: "Create second generated layer-name reset source layer",
            tool: "create_text_layer",
            args: {
              compName,
              name: layerBName,
              text: "Layer name reset",
              position: [320, 180],
              fontSize: 44,
              fillColor: [0.95, 0.95, 0.85],
              startTime: 0,
              duration: 3
            }
          },
          {
            title: "Read generated layer names before empty reset",
            tool: "get_comp_details",
            args: {
              compName,
              includeLayers: true,
              layerLimit: 10
            }
          },
          {
            title: "Reset generated text layer name to empty string",
            tool: "rename_layers",
            args: {
              compName,
              layerIndices: [1],
              expectedLayerNames: [layerBName],
              mode: "exact",
              name: "",
              allowEmptyName: true
            }
          },
          {
            title: "Reset generated solid layer name to empty string",
            tool: "rename_layers",
            args: {
              compName,
              layerIndices: [2],
              expectedLayerNames: [layerAName],
              mode: "exact",
              name: "",
              allowEmptyName: true
            }
          },
          {
            title: "Read generated layer names after empty reset",
            tool: "get_comp_details",
            args: {
              compName,
              includeLayers: true,
              layerLimit: 10
            }
          }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentLayerTimingScenarioPlans(runPrefix) {
  const base = `${runPrefix} Layer Timing`;
  const compName = `${base} Comp`;
  const layerAName = `${base} Layer A`;
  const layerBName = `${base} Layer B`;

  return [
    {
      id: "generated-layer-timing",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_solid_layer",
        "set_layer_time_range",
        "stagger_layers",
        "get_comp_details",
        "get_layer_details"
      ],
      expectedReadBack: {
        generatedLayerTiming: true,
        compName,
        layerExpectations: [
          { name: layerBName, layerIndex: 1, startTime: 0, inPoint: 0.5, outPoint: 3 },
          { name: layerAName, layerIndex: 2, startTime: 2.75, inPoint: 3.25, outPoint: 5.75 }
        ]
      },
      plan: {
        summary: "AE_AGENT_QA_050 generated-only live QA for layer timing typed tools.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated layer timing comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 4, frameRate: 24, bgColor: [0.06, 0.08, 0.1], allowDuplicateName: false, openInViewer: false, comment: "AE_AGENT_QA_050 generated-only layer timing validation" } },
          { title: "Create first generated timing layer", tool: "create_solid_layer", args: { compName, name: layerAName, color: [0.18, 0.45, 0.9], width: 220, height: 160, pixelAspect: 1, startTime: 0, duration: 3.5 } },
          { title: "Create second generated timing layer", tool: "create_solid_layer", args: { compName, name: layerBName, color: [0.9, 0.35, 0.18], width: 220, height: 160, pixelAspect: 1, startTime: 0, duration: 3.5 } },
          { title: "Trim generated timing layers", tool: "set_layer_time_range", args: { compName, layerIndices: [1, 2], inPoint: 0.5, outPoint: 3 } },
          { title: "Stagger generated timing layers", tool: "stagger_layers", args: { compName, layerIndices: [1, 2], startTime: 0.5, gap: 0.25, order: "indexAsc" } },
          { title: "Read generated timing comp details", tool: "get_comp_details", args: { compName, includeLayers: true, layerLimit: 10 } },
          { title: "Read first generated timing layer details", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: false } },
          { title: "Read second generated timing layer details", tool: "get_layer_details", args: { compName, layerIndex: 2, includeProperties: false } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentLayerTransformScenarioPlans(runPrefix) {
  const base = `${runPrefix} Layer Transform`;
  const compName = `${base} Comp`;
  const layerName = `${base} Shape`;

  return [
    {
      id: "generated-layer-transform",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_shape_layer",
        "fit_layer_to_comp",
        "set_layer_transform",
        "get_layer_details"
      ],
      expectedReadBack: {
        generatedLayerTransform: true,
        compName,
        layerName,
        position: [320, 180],
        opacity: 64
      },
      plan: {
        summary: "AE_AGENT_QA_050 generated-only live QA for layer transform and fit typed tools.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated transform comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.08, 0.09, 0.12], allowDuplicateName: false, openInViewer: false, comment: "AE_AGENT_QA_050 generated-only transform validation" } },
          { title: "Create generated transform shape", tool: "create_shape_layer", args: { compName, name: layerName, shape: "rectangle", size: [160, 90], position: [120, 90], fillColor: [0.25, 0.75, 0.95], strokeColor: [1, 1, 1], strokeWidth: 2, duration: 3 } },
          { title: "Fit generated transform shape to comp", tool: "fit_layer_to_comp", args: { compName, layerIndices: [1], mode: "contain", alignX: "center", alignY: "center" } },
          { title: "Set generated transform read-back values", tool: "set_layer_transform", args: { compName, layerIndex: 1, position: [320, 180], opacity: 64 } },
          { title: "Read generated transform layer details", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: false } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentProjectItemsScenarioPlans(runPrefix) {
  const base = `${runPrefix} Project Items`;
  const folderName = `${base} Folder`;
  const mainCompName = `${base} Main`;
  const replacementName = `${base} Replacement`;
  const renamedReplacementName = `${base} Replacement Renamed`;
  const layerName = `${base} Plate`;

  return [
    {
      id: "generated-project-items",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_solid_layer",
        "create_project_folder",
        "move_project_items_to_folder",
        "replace_layer_source",
        "rename_project_items",
        "find_project_items",
        "list_project_folder_items",
        "get_comp_details"
      ],
      expectedReadBack: {
        generatedProjectItems: true,
        folderName,
        mainCompName,
        renamedReplacementName,
        replacementName,
        layerName
      },
      plan: {
        summary: "AE_AGENT_QA_050 generated-only live QA for project-item rename, folder, move, and source replacement typed tools.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated project-items main comp", tool: "create_comp", args: { name: mainCompName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.08, 0.1, 0.12], allowDuplicateName: false, openInViewer: false, comment: "AE_AGENT_QA_050 generated-only project-items validation" } },
          { title: "Create generated project-items replacement comp", tool: "create_comp", args: { name: replacementName, width: 320, height: 180, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.1, 0.08, 0.14], allowDuplicateName: false, openInViewer: false, comment: "AE_AGENT_QA_050 generated-only replacement source" } },
          { title: "Create generated project-items source layer", tool: "create_solid_layer", args: { compName: mainCompName, name: layerName, color: [0.35, 0.45, 0.9], width: 320, height: 180, pixelAspect: 1, startTime: 0, duration: 3 } },
          { title: "Create generated project-items folder", tool: "create_project_folder", args: { name: folderName, allowExisting: false } },
          { title: "Replace generated layer source with generated comp", tool: "replace_layer_source", args: { compName: mainCompName, layerIndices: [1], sourceItemName: replacementName, sourceItemType: "comp", fixExpressions: true } },
          { title: "Rename generated replacement project item", tool: "rename_project_items", args: { query: replacementName, type: "comp", exactName: true, limit: 1, mode: "exact", name: renamedReplacementName } },
          { title: "Move renamed generated replacement comp into generated folder", tool: "move_project_items_to_folder", args: { targetFolderName: folderName }, resultBindings: { itemIndices: "{{steps.6.renamed.0.itemIndex}}" } },
          { title: "Find generated project items after rename", tool: "find_project_items", args: { query: base, limit: 20, caseSensitive: true } },
          { title: "List generated project-items folder contents", tool: "list_project_folder_items", args: { folderName, recursive: false, type: "comp", limit: 10 } },
          { title: "Read generated project-items main comp", tool: "get_comp_details", args: { compName: mainCompName, includeLayers: true, layerLimit: 10 } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentProjectSelectionFolderScenarioPlans(runPrefix) {
  const base = `${runPrefix} Project Selection Folder`;
  const folderName = `${base} Folder`;
  const firstCompName = `${base} Alpha`;
  const secondCompName = `${base} Beta`;

  return [
    {
      id: "generated-project-selection-folder",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "find_project_items",
        "create_project_folder",
        "move_project_items_to_folder",
        "list_project_folder_items",
        "get_project_snapshot"
      ],
      expectedReadBack: {
        generatedProjectSelectionFolder: true,
        folderName,
        itemNames: [firstCompName, secondCompName]
      },
      plan: {
        summary: "Generated-only live QA for moving explicit generated Project items into a new generated folder.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create first generated Project folder target comp", tool: "create_comp", args: { name: firstCompName, width: 320, height: 180, pixelAspect: 1, duration: 2, frameRate: 24, bgColor: [0.07, 0.1, 0.12], allowDuplicateName: false, openInViewer: false, comment: "generated-only Project selection folder validation" } },
          { title: "Create second generated Project folder target comp", tool: "create_comp", args: { name: secondCompName, width: 320, height: 180, pixelAspect: 1, duration: 2, frameRate: 24, bgColor: [0.1, 0.07, 0.12], allowDuplicateName: false, openInViewer: false, comment: "generated-only Project selection folder validation" } },
          { title: "Create generated destination Project folder", tool: "create_project_folder", args: { name: folderName, allowExisting: false } },
          { title: "Find explicit generated Project items before folder move", tool: "find_project_items", args: { query: base, type: "comp", limit: 10, caseSensitive: true } },
          { title: "Move explicit generated Project items into generated folder", tool: "move_project_items_to_folder", args: { targetFolderName: folderName }, resultBindings: { itemIndices: "{{steps.4.result}}" } },
          { title: "Read generated folder contents after move", tool: "list_project_folder_items", args: { folderName, recursive: false, type: "comp", limit: 10 } },
          { title: "Read Project snapshot after generated folder move", tool: "get_project_snapshot", args: { limit: 25 } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentProjectItemMetadataScenarioPlans(runPrefix) {
  const base = `${runPrefix} Project Item Labels`;
  const firstCompName = `${base} Alpha`;
  const secondCompName = `${base} Beta`;
  const label = 0;

  return [
    {
      id: "generated-project-item-metadata-label",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_comp",
        "find_project_items",
        "set_project_item_metadata",
        "find_project_items"
      ],
      expectedReadBack: {
        generatedProjectItemMetadata: true,
        itemNames: [firstCompName, secondCompName],
        label
      },
      plan: {
        summary: "Generated-only live QA for explicit project item label metadata on generated composition items.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create first generated project-item label comp", tool: "create_comp", args: { name: firstCompName, width: 320, height: 180, pixelAspect: 1, duration: 2, frameRate: 24, bgColor: [0.07, 0.1, 0.12], allowDuplicateName: false, openInViewer: false, comment: "generated-only project item label validation" } },
          { title: "Create second generated project-item label comp", tool: "create_comp", args: { name: secondCompName, width: 320, height: 180, pixelAspect: 1, duration: 2, frameRate: 24, bgColor: [0.1, 0.07, 0.12], allowDuplicateName: false, openInViewer: false, comment: "generated-only project item label validation" } },
          { title: "Find generated project items before label update", tool: "find_project_items", args: { query: base, type: "comp", limit: 10, caseSensitive: true } },
          {
            title: "Set generated project item labels to none",
            tool: "set_project_item_metadata",
            args: {
              itemIndices: "{{steps.3.result}}",
              expectedItemNames: [firstCompName, secondCompName],
              label
            }
          },
          { title: "Read generated project item labels after update", tool: "find_project_items", args: { query: base, type: "comp", limit: 10, caseSensitive: true } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentPreserveNestedFrameRateScenarioPlans(runPrefix) {
  const base = `${runPrefix} Preserve Nested Frame Rate`;
  const firstCompName = `${base} Alpha`;
  const secondCompName = `${base} Beta`;
  const preserveNestedFrameRate = true;

  return [
    {
      id: "generated-preserve-nested-frame-rate",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_comp",
        "get_comp_details",
        "get_comp_details",
        "set_comp_properties",
        "get_comp_details",
        "set_comp_properties",
        "get_comp_details"
      ],
      expectedReadBack: {
        generatedPreserveNestedFrameRate: true,
        itemNames: [firstCompName, secondCompName],
        preserveNestedFrameRate
      },
      plan: {
        summary: "Generated-only live QA for explicit preserveNestedFrameRate comp property updates.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create first generated preserve-nested-frame-rate comp", tool: "create_comp", args: { name: firstCompName, width: 320, height: 180, pixelAspect: 1, duration: 2, frameRate: 24, bgColor: [0.07, 0.1, 0.12], allowDuplicateName: false, openInViewer: false, comment: "generated-only preserve nested frame rate validation" } },
          { title: "Create second generated preserve-nested-frame-rate comp", tool: "create_comp", args: { name: secondCompName, width: 320, height: 180, pixelAspect: 1, duration: 2, frameRate: 24, bgColor: [0.1, 0.07, 0.12], allowDuplicateName: false, openInViewer: false, comment: "generated-only preserve nested frame rate validation" } },
          { title: "Read first generated preserve setting before update", tool: "get_comp_details", args: { compName: firstCompName, includeLayers: false } },
          { title: "Read second generated preserve setting before update", tool: "get_comp_details", args: { compName: secondCompName, includeLayers: false } },
          { title: "Enable preserve nested frame rate on first generated comp", tool: "set_comp_properties", args: { compName: firstCompName, preserveNestedFrameRate } },
          { title: "Read first generated preserve setting after update", tool: "get_comp_details", args: { compName: firstCompName, includeLayers: false } },
          { title: "Enable preserve nested frame rate on second generated comp", tool: "set_comp_properties", args: { compName: secondCompName, preserveNestedFrameRate } },
          { title: "Read second generated preserve setting after update", tool: "get_comp_details", args: { compName: secondCompName, includeLayers: false } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentProjectTimecodeStartFramesScenarioPlans(runPrefix) {
  const base = `${runPrefix} Project Timecode Start Frames`;
  const firstCompName = `${base} Alpha`;
  const secondCompName = `${base} Beta`;
  const framesCountType = "FC_START_0";
  const displayStartFrame = 0;

  return [
    {
      id: "generated-project-timecode-start-frames",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_comp",
        "get_project_info",
        "get_comp_details",
        "get_comp_details",
        "set_project_frames_count_type",
        "get_project_info",
        "set_comp_properties",
        "get_comp_details",
        "set_comp_properties",
        "get_comp_details"
      ],
      expectedReadBack: {
        generatedProjectTimecodeStartFrames: true,
        itemNames: [firstCompName, secondCompName],
        framesCountType,
        framesCountStartFrame: 0,
        displayStartFrame
      },
      plan: {
        summary: "Generated-only live QA for explicit project frame numbering and native comp display start frames.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create first generated timecode-start-frame comp", tool: "create_comp", args: { name: firstCompName, width: 320, height: 180, pixelAspect: 1, duration: 2, frameRate: 24, bgColor: [0.07, 0.09, 0.12], allowDuplicateName: false, openInViewer: false, comment: "generated-only project timecode start-frame validation" } },
          { title: "Create second generated timecode-start-frame comp", tool: "create_comp", args: { name: secondCompName, width: 320, height: 180, pixelAspect: 1, duration: 2, frameRate: 24, bgColor: [0.12, 0.07, 0.09], allowDuplicateName: false, openInViewer: false, comment: "generated-only project timecode start-frame validation" } },
          { title: "Read project frame numbering before update", tool: "get_project_info", args: {} },
          { title: "Read first generated native display start frame before update", tool: "get_comp_details", args: { compName: firstCompName, includeLayers: false } },
          { title: "Read second generated native display start frame before update", tool: "get_comp_details", args: { compName: secondCompName, includeLayers: false } },
          { title: "Set reviewed project frame numbering to start at zero", tool: "set_project_frames_count_type", args: { framesCountType } },
          { title: "Read project frame numbering after update", tool: "get_project_info", args: {} },
          { title: "Set first generated native display start frame to zero", tool: "set_comp_properties", args: { compName: firstCompName, displayStartFrame } },
          { title: "Read first generated native display start frame after update", tool: "get_comp_details", args: { compName: firstCompName, includeLayers: false } },
          { title: "Set second generated native display start frame to zero", tool: "set_comp_properties", args: { compName: secondCompName, displayStartFrame } },
          { title: "Read second generated native display start frame after update", tool: "get_comp_details", args: { compName: secondCompName, includeLayers: false } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentResetImportedItemNamesScenarioPlans(runPrefix) {
  const base = safeOutputName(`${runPrefix} Reset Imported Item Names`);
  const compName = `${base} Comp`;
  const layerName = `${base} Shape`;
  const outputFileName = `${base}-footage.png`;
  const staleFootageName = `${base}-stale-footage-name`;
  const filePath = `logs/generated-exports/${outputFileName}`;

  return [
    {
      id: "generated-reset-imported-item-names",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_shape_layer",
        "save_comp_frame_png",
        "import_footage",
        "find_project_items",
        "get_project_snapshot",
        "rename_project_items"
      ],
      expectedReadBack: {
        generatedResetImportedItemNames: true,
        base,
        compName,
        layerName,
        outputFileName,
        staleFootageName,
        filePath
      },
      plan: {
        summary: "Generated-only live QA for resetting one explicit imported footage item name to its file display name.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated comp for footage reset fixture", tool: "create_comp", args: { name: compName, width: 320, height: 180, pixelAspect: 1, duration: 1, frameRate: 24, bgColor: [0.04, 0.05, 0.06], allowDuplicateName: false, openInViewer: true, comment: "generated-only imported footage reset validation" } },
          { title: "Create generated footage reset frame content", tool: "create_shape_layer", args: { compName, name: layerName, shape: "rectangle", size: [160, 90], position: [160, 90], fillColor: [0.2, 0.7, 0.55], strokeColor: [1, 1, 1], strokeWidth: 3, duration: 1 } },
          { title: "Save generated footage reset PNG fixture", tool: "save_comp_frame_png", args: { compName, expectedCompName: compName, time: 0, outputFileName, resolutionFactor: [1, 1], allowOverwrite: true } },
          { title: "Import generated footage with stale display name", tool: "import_footage", args: { filePath, name: staleFootageName, sequence: false } },
          { title: "Find stale generated footage before reset", tool: "find_project_items", args: { query: staleFootageName, type: "footage", exactName: true, limit: 1, caseSensitive: true } },
          { title: "Read generated footage snapshot before reset", tool: "get_project_snapshot", args: { includeComps: false, includeFootage: true, includeFolders: false, maxItems: 100 } },
          { title: "Reset generated imported footage name to file display name", tool: "rename_project_items", args: { itemIndices: "{{steps.5.result}}", type: "footage", mode: "exact", name: outputFileName, limit: 1 } },
          { title: "Find reset generated footage after rename", tool: "find_project_items", args: { query: outputFileName, type: "footage", exactName: true, limit: 1, caseSensitive: true } },
          { title: "Read generated footage snapshot after reset", tool: "get_project_snapshot", args: { includeComps: false, includeFootage: true, includeFolders: false, maxItems: 100 } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentCompositionVersionScenarioPlans(runPrefix) {
  const base = `${runPrefix} Composition Version`;
  const firstName = `${base} Main v001`;
  const secondName = `${base} Secondary v001`;
  const renamedFirstName = `${base} Main v002`;
  const renamedSecondName = `${base} Secondary v002`;

  return [
    {
      id: "generated-composition-version-token",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "rename_project_items",
        "find_project_items",
        "get_comp_details"
      ],
      expectedReadBack: {
        generatedCompositionVersionToken: true,
        base,
        originalNames: [firstName, secondName],
        renamedNames: [renamedFirstName, renamedSecondName],
        beforeToken: "v001",
        afterToken: "v002"
      },
      plan: {
        summary: "AE_AGENT_QA_097 generated-only live QA for explicit composition version-token rename.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create first generated versioned comp", tool: "create_comp", args: { name: firstName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.08, 0.1, 0.12], allowDuplicateName: false, openInViewer: false, comment: "AE_AGENT_QA_097 generated-only composition version validation" } },
          { title: "Create second generated versioned comp", tool: "create_comp", args: { name: secondName, width: 320, height: 180, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.1, 0.08, 0.14], allowDuplicateName: false, openInViewer: false, comment: "AE_AGENT_QA_097 generated-only secondary version source" } },
          { title: "Rename generated version token", tool: "rename_project_items", args: { query: base, type: "comp", exactName: false, caseSensitive: true, limit: 2, mode: "findReplace", find: "v001", replace: "v002" } },
          { title: "Find generated versioned comps after rename", tool: "find_project_items", args: { query: base, type: "comp", limit: 10, caseSensitive: true } },
          { title: "Read first generated renamed comp", tool: "get_comp_details", args: { compName: renamedFirstName, includeLayers: false } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentCompositionRenameFileNameScenarioPlans(runPrefix) {
  const base = `${runPrefix} Composition File Rename`;
  const originalName = `${base} Source Comp`;
  const projectFileBasename = `${base} Project File Basename`;

  return [
    {
      id: "generated-composition-rename-file-name",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "get_project_info",
        "find_project_items",
        "get_comp_details",
        "rename_project_items"
      ],
      expectedReadBack: {
        generatedCompositionRenameFileName: true,
        base,
        originalName,
        projectFileBasename
      },
      plan: {
        summary: "Generated-only live QA for renaming one explicit generated composition to a reviewed project file basename.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated comp for project-file basename rename", tool: "create_comp", args: { name: originalName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.07, 0.09, 0.11], allowDuplicateName: false, openInViewer: true, comment: "generated-only composition rename-to-file-name validation" } },
          { title: "Read project info for basename evidence", tool: "get_project_info", args: {} },
          { title: "Find generated comp before rename", tool: "find_project_items", args: { query: originalName, type: "comp", exactName: true, limit: 1, caseSensitive: true } },
          { title: "Read generated comp before rename", tool: "get_comp_details", args: { compName: originalName, includeLayers: false } },
          { title: "Rename generated comp to reviewed file basename", tool: "rename_project_items", args: { itemIndices: "{{steps.3.result}}", type: "comp", mode: "exact", name: projectFileBasename, limit: 1 } },
          { title: "Find generated comp after basename rename", tool: "find_project_items", args: { query: projectFileBasename, type: "comp", exactName: true, limit: 1, caseSensitive: true } },
          { title: "Read generated comp after basename rename", tool: "get_comp_details", args: { compName: projectFileBasename, includeLayers: false } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentCompositionSaveFramePngScenarioPlans(runPrefix) {
  const base = `${runPrefix} Composition Save Frame PNG`;
  const compName = `${base} Comp`;
  const layerName = `${base} Shape`;
  const outputFileName = `${safeOutputName(base)}-frame.png`;
  const frameTime = 0.5;

  return [
    {
      id: "generated-composition-save-frame-png",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_shape_layer",
        "get_comp_details",
        "save_comp_frame_png",
        "get_comp_details"
      ],
      expectedReadBack: {
        generatedCompFramePngExport: true,
        base,
        compName,
        layerName,
        outputFileName,
        frameTime,
        resolutionFactor: [1, 1]
      },
      plan: {
        summary: "Generated-only live QA for saving one explicit composition frame to a sandboxed PNG output.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated comp for frame PNG export", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.04, 0.05, 0.06], allowDuplicateName: false, openInViewer: true, comment: "generated-only composition save-frame PNG validation" } },
          { title: "Create visible generated frame content", tool: "create_shape_layer", args: { compName, name: layerName, shape: "rectangle", size: [300, 160], position: [320, 180], fillColor: [0.2, 0.6, 0.85], strokeColor: [1, 1, 1], strokeWidth: 4, duration: 3 } },
          { title: "Read generated comp before frame export", tool: "get_comp_details", args: { compName, includeLayers: true, layerLimit: 10 } },
          { title: "Save generated comp frame to sandboxed PNG", tool: "save_comp_frame_png", args: { compName, expectedCompName: compName, time: frameTime, outputFileName, resolutionFactor: [1, 1], allowOverwrite: true } },
          { title: "Read generated comp after frame export", tool: "get_comp_details", args: { compName, includeLayers: true, layerLimit: 10 } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentEffectPropertyScenarioPlans(runPrefix) {
  const base = `${runPrefix} Effect Property`;
  const compName = `${base} Comp`;
  const layerName = `${base} Shape`;
  const effectName = `${base} Fill`;

  return [
    {
      id: "generated-effect-property",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_shape_layer",
        "add_effect",
        "get_effect_details",
        "set_effect_property"
      ],
      expectedReadBack: {
        generatedEffectProperty: true,
        compName,
        layerName,
        effectName,
        effectMatchName: "ADBE Fill",
        propertyIndex: 3,
        color: [0.95, 0.18, 0.22, 1]
      },
      plan: {
        summary: "AE_AGENT_QA_050 generated-only live QA for effect property typed tools.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated effect-property comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.08, 0.08, 0.1], allowDuplicateName: false, openInViewer: false, comment: "AE_AGENT_QA_050 generated-only effect property validation" } },
          { title: "Create generated effect-property shape", tool: "create_shape_layer", args: { compName, name: layerName, shape: "rectangle", size: [320, 180], position: [320, 180], fillColor: [0.2, 0.4, 0.85], strokeColor: [1, 1, 1], strokeWidth: 2, duration: 3 } },
          { title: "Add generated Fill effect", tool: "add_effect", args: { compName, layerIndex: 1, effect: "ADBE Fill", name: effectName } },
          { title: "Inspect generated Fill effect before property set", tool: "get_effect_details", args: { compName, layerIndex: 1, effectName, includeProperties: true, propertyDepth: 1, propertyLimit: 20 } },
          { title: "Set generated Fill color property", tool: "set_effect_property", args: { compName, layerIndex: 1, effectName, propertyIndex: 3, value: [0.95, 0.18, 0.22, 1] } },
          { title: "Inspect generated Fill effect after property set", tool: "get_effect_details", args: { compName, layerIndex: 1, effectName, includeProperties: true, propertyDepth: 1, propertyLimit: 20 } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentEffectEnabledScenarioPlans(runPrefix) {
  const base = `${runPrefix} Effect Enabled`;
  const compName = `${base} Comp`;
  const layerName = `${base} Shape`;
  const effectName = `${base} Turbulent Displace`;

  return [
    {
      id: "generated-effect-enabled-toggle",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_shape_layer",
        "add_effect",
        "get_effect_details",
        "set_effect_enabled",
        "get_effect_details",
        "get_layer_details"
      ],
      expectedReadBack: {
        generatedEffectEnabled: true,
        compName,
        layerName,
        effectName,
        effectMatchName: "ADBE Turbulent Displace",
        enabled: false
      },
      plan: {
        summary: "Generated-only live QA for explicit effect enabled-state typed tool.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated effect-enabled comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.08, 0.08, 0.1], allowDuplicateName: false, openInViewer: false, comment: "generated-only effect enabled validation" } },
          { title: "Create generated effect-enabled shape", tool: "create_shape_layer", args: { compName, name: layerName, shape: "rectangle", size: [320, 180], position: [320, 180], fillColor: [0.2, 0.45, 0.7], strokeColor: [1, 1, 1], strokeWidth: 2, duration: 3 } },
          { title: "Add generated Turbulent Displace effect", tool: "add_effect", args: { compName, layerIndex: 1, effect: "ADBE Turbulent Displace", name: effectName } },
          { title: "Inspect generated effect before disabling", tool: "get_effect_details", args: { compName, layerIndex: 1, effectName, includeProperties: false } },
          { title: "Disable generated effect", tool: "set_effect_enabled", args: { compName, layerIndex: 1, effectName, effectMatchName: "ADBE Turbulent Displace", expectedCurrentEnabled: true, enabled: false } },
          { title: "Read generated disabled effect", tool: "get_effect_details", args: { compName, layerIndex: 1, effectName, effectMatchName: "ADBE Turbulent Displace", includeProperties: false } },
          { title: "Read generated effect layer", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: false } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentPuppetOnTransparentScenarioPlans(runPrefix) {
  const base = `${runPrefix} Puppet On Transparent`;
  const compName = `${base} Comp`;
  const layerName = `${base} Shape`;
  const effectName = `${base} Puppet`;
  const propertyMatchName = "ADBE FreePin3 On Transparent";

  return [
    {
      id: "generated-puppet-on-transparent",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_shape_layer",
        "add_effect",
        "get_effect_details",
        "set_effect_property",
        "get_effect_details"
      ],
      expectedReadBack: {
        generatedEffectProperty: true,
        compName,
        layerName,
        effectName,
        effectMatchName: "ADBE FreePin3",
        propertyMatchName,
        value: true
      },
      plan: {
        summary: "Generated-only live QA for setting Puppet On Transparent on one generated Puppet effect.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated Puppet property comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.07, 0.07, 0.09], allowDuplicateName: false, openInViewer: true, comment: "Generated-only Puppet On Transparent validation" } },
          { title: "Create generated Puppet property shape", tool: "create_shape_layer", args: { compName, name: layerName, shape: "rectangle", size: [260, 150], position: [320, 180], fillColor: [0.28, 0.48, 0.9], strokeColor: [1, 1, 1], strokeWidth: 2, duration: 3 } },
          { title: "Add generated Puppet effect", tool: "add_effect", args: { compName, layerIndex: 1, effect: "ADBE FreePin3", name: effectName } },
          { title: "Read generated Puppet On Transparent property", tool: "get_effect_details", args: { compName, layerIndex: 1, effectName, includeProperties: true, propertyDepth: 2, propertyLimit: 80, includeValues: true } },
          { title: "Set generated Puppet On Transparent", tool: "set_effect_property", args: { compName, layerIndex: 1, effectName, propertyMatchName, value: true, setAtTime: false } },
          { title: "Read generated Puppet On Transparent after set", tool: "get_effect_details", args: { compName, layerIndex: 1, effectName, includeProperties: true, propertyDepth: 2, propertyLimit: 80, includeValues: true } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentPuppetPinTypeScenarioPlans(runPrefix) {
  const base = `${runPrefix} Puppet Pin Type`;
  const compName = `${base} Comp`;
  const layerName = `${base} Shape`;
  const effectName = `${base} Puppet`;
  const pinName = "Puppet Pin 1";
  const pinTypePropertyPath = [
    { matchName: "ADBE Effect Parade" },
    { matchName: "ADBE FreePin3", name: effectName },
    { matchName: "ADBE FreePin3 PosPin Atom", name: pinName },
    { matchName: "ADBE FreePin3 PosPin Type", name: "Type" }
  ];

  return [
    {
      id: "generated-puppet-pin-type",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_shape_layer",
        "add_effect",
        "get_effect_details",
        "set_puppet_pin_type",
        "get_effect_details"
      ],
      expectedReadBack: {
        generatedPuppetPinType: true,
        compName,
        layerName,
        effectName,
        effectMatchName: "ADBE FreePin3",
        pinAtomMatchName: "ADBE FreePin3 PosPin Atom",
        propertyMatchName: "ADBE FreePin3 PosPin Type",
        pinTypePropertyPath,
        pinType: 4
      },
      plan: {
        summary: "Generated-only live QA for setting one explicit Puppet pin atom type to Advanced.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated Puppet pin type comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.07, 0.07, 0.09], allowDuplicateName: false, openInViewer: true, comment: "Generated-only Puppet pin type validation" } },
          { title: "Create generated Puppet pin type shape", tool: "create_shape_layer", args: { compName, name: layerName, shape: "rectangle", size: [260, 150], position: [320, 180], fillColor: [0.28, 0.48, 0.9], strokeColor: [1, 1, 1], strokeWidth: 2, duration: 3 } },
          { title: "Add generated Puppet effect", tool: "add_effect", args: { compName, layerIndex: 1, effect: "ADBE FreePin3", name: effectName } },
          { title: "Read generated Puppet pin atom type before set", tool: "get_effect_details", args: { compName, layerIndex: 1, effectName, includeProperties: true, propertyDepth: 5, propertyLimit: 160, includeValues: true } },
          { title: "Set generated Puppet Pin 1 type to Advanced", tool: "set_puppet_pin_type", args: { compName, layerIndex: 1, effectName, pinTypePropertyPath, expectedPinName: pinName, pinType: 4 } },
          { title: "Read generated Puppet pin atom type after set", tool: "get_effect_details", args: { compName, layerIndex: 1, effectName, includeProperties: true, propertyDepth: 5, propertyLimit: 160, includeValues: true } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentPuppetGuideLayerScenarioPlans(runPrefix) {
  const base = `${runPrefix} Puppet Guide Layer`;
  const compName = `${base} Comp`;
  const layerName = `${base} Shape`;
  const effectName = `${base} Puppet`;

  return [
    {
      id: "generated-puppet-guide-layer-toggle",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_shape_layer",
        "add_effect",
        "get_effect_details",
        "set_layer_metadata",
        "get_layer_details",
        "get_effect_details"
      ],
      expectedReadBack: {
        generatedPuppetGuideLayer: true,
        compName,
        layerName,
        effectName,
        effectMatchName: "ADBE FreePin3",
        guideLayer: true
      },
      plan: {
        summary: "Generated-only live QA for setting one explicit Puppet host layer as a guide layer.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated Puppet guide-layer comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.06, 0.06, 0.08], allowDuplicateName: false, openInViewer: true, comment: "Generated-only Puppet guide-layer validation" } },
          { title: "Create generated Puppet guide-layer shape", tool: "create_shape_layer", args: { compName, name: layerName, shape: "rectangle", size: [260, 150], position: [320, 180], fillColor: [0.24, 0.46, 0.9], strokeColor: [1, 1, 1], strokeWidth: 2, duration: 3 } },
          { title: "Add generated Puppet evidence effect", tool: "add_effect", args: { compName, layerIndex: 1, effect: "ADBE FreePin3", name: effectName } },
          { title: "Read generated Puppet evidence before guide-layer set", tool: "get_effect_details", args: { compName, layerIndex: 1, effectName, effectMatchName: "ADBE FreePin3", includeProperties: true, propertyDepth: 4, propertyLimit: 120, includeValues: true } },
          { title: "Set generated Puppet host as guide layer", tool: "set_layer_metadata", args: { compName, layerIndices: [1], expectedLayerNames: [layerName], guideLayer: true } },
          { title: "Read generated Puppet guide layer", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: false } },
          { title: "Read generated Puppet evidence after guide-layer set", tool: "get_effect_details", args: { compName, layerIndex: 1, effectName, effectMatchName: "ADBE FreePin3", includeProperties: false } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentExpressionScenarioPlans(runPrefix) {
  const base = `${runPrefix} Expression`;
  const compName = `${base} Comp`;
  const layerName = `${base} Shape`;
  const propertyPath = "ADBE Transform Group.ADBE Position";
  const expression = "value + [Math.sin(time * 2) * 4, 0]";

  return [
    {
      id: "generated-expression-set-clear",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_shape_layer",
        "get_selected_properties",
        "set_expression",
        "get_layer_details",
        "clear_expression",
        "get_layer_details"
      ],
      expectedReadBack: {
        generatedExpressionSetClear: true,
        compName,
        layerName,
        propertyPath: ["ADBE Transform Group", "ADBE Position"],
        expression
      },
      plan: {
        summary: "AE_AGENT_QA_061 generated-only live QA for expression set/clear typed tools.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated expression comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.08, 0.08, 0.1], allowDuplicateName: false, openInViewer: true, comment: "AE_AGENT_QA_061 generated-only expression validation" } },
          { title: "Create generated expression shape", tool: "create_shape_layer", args: { compName, name: layerName, shape: "rectangle", size: [180, 120], position: [320, 180], fillColor: [0.18, 0.55, 0.92], strokeColor: [1, 1, 1], strokeWidth: 2, duration: 3 } },
          { title: "Inspect generated selected-property state", tool: "get_selected_properties", args: { includeValues: true, includeExpressions: true } },
          { title: "Set generated position expression", tool: "set_expression", args: { compName, layerIndex: 1, propertyPath, expression, enabled: true } },
          { title: "Read generated expression after set", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: true, propertyDepth: 2, propertyLimit: 80, includeExpressions: true } },
          { title: "Clear generated position expression", tool: "clear_expression", args: { compName, layerIndex: 1, propertyPath } },
          { title: "Read generated expression after clear", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: true, propertyDepth: 2, propertyLimit: 80, includeExpressions: true } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentParametricAnchorExpressionScenarioPlans(runPrefix) {
  const base = `${runPrefix} Parametric Anchor`;
  const compName = `${base} Comp`;
  const rectangleLayerName = `${base} Rectangle`;
  const ellipseLayerName = `${base} Ellipse`;
  // AE inserts each new shape layer at the top of the stack.
  const rectangleLayerIndex = 2;
  const ellipseLayerIndex = 1;
  const rectanglePositionPath = [
    "ADBE Root Vectors Group",
    "Rectangle",
    "ADBE Vectors Group",
    "ADBE Vector Shape - Rect",
    "ADBE Vector Rect Position"
  ];
  const ellipsePositionPath = [
    "ADBE Root Vectors Group",
    "Ellipse",
    "ADBE Vectors Group",
    "ADBE Vector Shape - Ellipse",
    "ADBE Vector Ellipse Position"
  ];
  const anchorPositionKey = "top-right";
  const expression = [
    "var x = thisProperty.propertyGroup(1).size[0] / -2;",
    "var y = thisProperty.propertyGroup(1).size[1] / 2;",
    "[x, y];"
  ].join("\n");

  return [
    {
      id: "generated-parametric-anchor-expression",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_shape_layer",
        "create_shape_layer",
        "get_layer_details",
        "get_layer_details",
        "set_expression",
        "set_expression",
        "get_layer_details",
        "get_layer_details"
      ],
      expectedReadBack: {
        generatedParametricAnchorExpression: true,
        compName,
        anchorPositionKey,
        expression,
        targets: [
          {
            layerName: rectangleLayerName,
            propertyPath: rectanglePositionPath,
            matchName: "ADBE Vector Rect Position"
          },
          {
            layerName: ellipseLayerName,
            propertyPath: ellipsePositionPath,
            matchName: "ADBE Vector Ellipse Position"
          }
        ]
      },
      plan: {
        summary: "Generated-only live QA for parametric rectangle and ellipse anchor-position expressions.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated parametric anchor comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.07, 0.07, 0.09], allowDuplicateName: false, openInViewer: true, comment: "generated-only parametric anchor expression validation" } },
          { title: "Create generated rectangle target", tool: "create_shape_layer", args: { compName, name: rectangleLayerName, shape: "rectangle", size: [240, 120], position: [240, 180], fillColor: [0.2, 0.56, 0.82], strokeColor: [1, 1, 1], strokeWidth: 2, duration: 3 } },
          { title: "Create generated ellipse target", tool: "create_shape_layer", args: { compName, name: ellipseLayerName, shape: "ellipse", size: [160, 120], position: [420, 180], fillColor: [0.82, 0.46, 0.2], strokeColor: [1, 1, 1], strokeWidth: 2, duration: 3 } },
          { title: "Read generated rectangle position evidence", tool: "get_layer_details", args: { compName, layerIndex: rectangleLayerIndex, includeProperties: true, propertyDepth: 4, propertyLimit: 160, includeValues: true, includeExpressions: true } },
          { title: "Read generated ellipse position evidence", tool: "get_layer_details", args: { compName, layerIndex: ellipseLayerIndex, includeProperties: true, propertyDepth: 4, propertyLimit: 160, includeValues: true, includeExpressions: true } },
          { title: "Set generated rectangle anchor expression", tool: "set_expression", args: { compName, layerIndex: rectangleLayerIndex, propertyPath: rectanglePositionPath, expression, enabled: true } },
          { title: "Set generated ellipse anchor expression", tool: "set_expression", args: { compName, layerIndex: ellipseLayerIndex, propertyPath: ellipsePositionPath, expression, enabled: true } },
          { title: "Read generated rectangle anchor expression", tool: "get_layer_details", args: { compName, layerIndex: rectangleLayerIndex, includeProperties: true, propertyDepth: 4, propertyLimit: 160, includeValues: true, includeExpressions: true } },
          { title: "Read generated ellipse anchor expression", tool: "get_layer_details", args: { compName, layerIndex: ellipseLayerIndex, includeProperties: true, propertyDepth: 4, propertyLimit: 160, includeValues: true, includeExpressions: true } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentParentOpacityExpressionScenarioPlans(runPrefix) {
  const base = `${runPrefix} Parent Opacity`;
  const compName = `${base} Comp`;
  const childName = `${base} Child Shape`;
  const parentName = `${base} Parent Null`;
  const childLayerIndex = 1;
  const parentLayerIndex = 2;
  const propertyPath = "ADBE Transform Group.ADBE Opacity";
  const expression = "Math.min(value, thisLayer.parent.transform.opacity.value);";

  return [
    {
      id: "generated-parent-opacity-expression",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_null_layer",
        "create_shape_layer",
        "set_layer_parent",
        "get_layer_details",
        "set_expression",
        "get_layer_details"
      ],
      expectedReadBack: {
        generatedParentOpacityExpression: true,
        compName,
        childName,
        parentName,
        childLayerIndex,
        parentLayerIndex,
        propertyPath: ["ADBE Transform Group", "ADBE Opacity"],
        expression
      },
      plan: {
        summary: "Generated-only live QA for a parent opacity expression on a child layer with parent read-back.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated parent-opacity comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.05, 0.07, 0.09], allowDuplicateName: false, openInViewer: true, comment: "Generated-only parent opacity expression validation" } },
          { title: "Create generated parent opacity null", tool: "create_null_layer", args: { compName, name: parentName, startTime: 0, duration: 3 } },
          { title: "Create generated child opacity shape", tool: "create_shape_layer", args: { compName, name: childName, shape: "rectangle", size: [220, 140], position: [320, 180], fillColor: [0.24, 0.62, 0.84], strokeColor: [1, 1, 1], strokeWidth: 2, duration: 3 } },
          { title: "Parent generated child to generated null", tool: "set_layer_parent", args: { compName, layerIndex: childLayerIndex, parentLayerIndex, expectedLayerName: childName, expectedParentName: parentName } },
          { title: "Read generated child parent evidence", tool: "get_layer_details", args: { compName, layerIndex: childLayerIndex, includeProperties: false } },
          { title: "Set generated parent opacity expression", tool: "set_expression", args: { compName, layerIndex: childLayerIndex, propertyPath, expression, enabled: true } },
          { title: "Read generated parent opacity expression", tool: "get_layer_details", args: { compName, layerIndex: childLayerIndex, includeProperties: true, propertyDepth: 2, propertyLimit: 80, includeExpressions: true } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentLayerParentBelowScenarioPlans(runPrefix) {
  const base = `${runPrefix} Parent Below`;
  const compName = `${base} Comp`;
  const bottomName = `${base} Bottom Parent Shape`;
  const middleName = `${base} Middle Child Shape`;
  const topName = `${base} Top Child Shape`;
  const selectedLayerIndices = [1, 2];
  const selectedLayerNames = [topName, middleName];
  const parentPairs = [
    { childLayerIndex: 1, childName: topName, parentLayerIndex: 2, parentName: middleName },
    { childLayerIndex: 2, childName: middleName, parentLayerIndex: 3, parentName: bottomName }
  ];

  return [
    {
      id: "generated-layer-parent-below",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_shape_layer",
        "create_shape_layer",
        "create_shape_layer",
        "get_comp_details",
        "set_layer_selection",
        "get_selected_layers",
        "set_layer_parent",
        "get_layer_details",
        "set_layer_parent",
        "get_layer_details"
      ],
      expectedReadBack: {
        generatedLayerParentBelow: true,
        compName,
        selectedLayerIndices,
        selectedLayerNames,
        parentPairs
      },
      plan: {
        summary: "Generated-only live QA for parenting selected layers to the layers directly below them with explicit read-back.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated layer-below parenting comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.06, 0.07, 0.09], allowDuplicateName: false, openInViewer: true, comment: "Generated-only layer-below parenting validation" } },
          { title: "Create generated bottom parent shape", tool: "create_shape_layer", args: { compName, name: bottomName, shape: "rectangle", size: [220, 120], position: [320, 245], fillColor: [0.2, 0.42, 0.72], strokeColor: [1, 1, 1], strokeWidth: 2, duration: 3 } },
          { title: "Create generated middle child shape", tool: "create_shape_layer", args: { compName, name: middleName, shape: "ellipse", size: [170, 110], position: [320, 180], fillColor: [0.72, 0.48, 0.22], strokeColor: [1, 1, 1], strokeWidth: 2, duration: 3 } },
          { title: "Create generated top child shape", tool: "create_shape_layer", args: { compName, name: topName, shape: "rectangle", size: [150, 90], position: [320, 115], fillColor: [0.34, 0.7, 0.46], strokeColor: [1, 1, 1], strokeWidth: 2, duration: 3 } },
          { title: "Read generated layer-below stack", tool: "get_comp_details", args: { compName, includeLayers: true, layerLimit: 10 } },
          { title: "Select generated child layers explicitly", tool: "set_layer_selection", args: { compName, layerIndices: selectedLayerIndices, expectedLayerNames: selectedLayerNames, makeActive: true } },
          { title: "Read generated selected child layers", tool: "get_selected_layers", args: {} },
          { title: "Parent generated top child to layer below", tool: "set_layer_parent", args: { compName, layerIndex: 1, parentLayerIndex: 2, expectedLayerName: topName, expectedParentName: middleName } },
          { title: "Read generated top child parent", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: false } },
          { title: "Parent generated middle child to layer below", tool: "set_layer_parent", args: { compName, layerIndex: 2, parentLayerIndex: 3, expectedLayerName: middleName, expectedParentName: bottomName } },
          { title: "Read generated middle child parent", tool: "get_layer_details", args: { compName, layerIndex: 2, includeProperties: false } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentLayerParentClosestScenarioPlans(runPrefix) {
  const base = `${runPrefix} Parent Closest`;
  const compName = `${base} Comp`;
  const parentLeftName = `${base} Left Parent Shape`;
  const parentRightName = `${base} Right Parent Shape`;
  const childLeftName = `${base} Left Child Shape`;
  const childRightName = `${base} Right Child Shape`;
  const selectedLayerIndices = [1, 2];
  const selectedLayerNames = [childRightName, childLeftName];
  const layerPositions = [
    { layerIndex: 1, layerName: childRightName, position: [430, 180] },
    { layerIndex: 2, layerName: childLeftName, position: [205, 180] },
    { layerIndex: 3, layerName: parentRightName, position: [470, 180] },
    { layerIndex: 4, layerName: parentLeftName, position: [170, 180] }
  ];
  const parentPairs = [
    { childLayerIndex: 1, childName: childRightName, parentLayerIndex: 3, parentName: parentRightName, distancePx: 40 },
    { childLayerIndex: 2, childName: childLeftName, parentLayerIndex: 4, parentName: parentLeftName, distancePx: 35 }
  ];

  return [
    {
      id: "generated-layer-parent-closest",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_shape_layer",
        "create_shape_layer",
        "create_shape_layer",
        "create_shape_layer",
        "get_comp_details",
        "get_layer_details",
        "get_layer_details",
        "get_layer_details",
        "get_layer_details",
        "set_layer_selection",
        "get_selected_layers",
        "set_layer_parent",
        "get_layer_details",
        "set_layer_parent",
        "get_layer_details"
      ],
      expectedReadBack: {
        generatedLayerParentClosest: true,
        compName,
        selectedLayerIndices,
        selectedLayerNames,
        layerPositions,
        parentPairs
      },
      plan: {
        summary: "Generated-only live QA for parenting selected layers to their nearest same-comp layers with explicit read-back.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated closest-parent comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.05, 0.06, 0.08], allowDuplicateName: false, openInViewer: true, comment: "Generated-only closest-layer parenting validation" } },
          { title: "Create generated left parent shape", tool: "create_shape_layer", args: { compName, name: parentLeftName, shape: "rectangle", size: [130, 90], position: [170, 180], fillColor: [0.2, 0.42, 0.72], strokeColor: [1, 1, 1], strokeWidth: 2, duration: 3 } },
          { title: "Create generated right parent shape", tool: "create_shape_layer", args: { compName, name: parentRightName, shape: "rectangle", size: [130, 90], position: [470, 180], fillColor: [0.72, 0.42, 0.2], strokeColor: [1, 1, 1], strokeWidth: 2, duration: 3 } },
          { title: "Create generated left child shape", tool: "create_shape_layer", args: { compName, name: childLeftName, shape: "ellipse", size: [90, 90], position: [205, 180], fillColor: [0.32, 0.68, 0.46], strokeColor: [1, 1, 1], strokeWidth: 2, duration: 3 } },
          { title: "Create generated right child shape", tool: "create_shape_layer", args: { compName, name: childRightName, shape: "ellipse", size: [90, 90], position: [430, 180], fillColor: [0.46, 0.62, 0.84], strokeColor: [1, 1, 1], strokeWidth: 2, duration: 3 } },
          { title: "Read generated closest-parent stack", tool: "get_comp_details", args: { compName, includeLayers: true, layerLimit: 10 } },
          { title: "Read generated right child position evidence", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: true, propertyDepth: 2, propertyLimit: 80, includeValues: true } },
          { title: "Read generated left child position evidence", tool: "get_layer_details", args: { compName, layerIndex: 2, includeProperties: true, propertyDepth: 2, propertyLimit: 80, includeValues: true } },
          { title: "Read generated right parent position evidence", tool: "get_layer_details", args: { compName, layerIndex: 3, includeProperties: true, propertyDepth: 2, propertyLimit: 80, includeValues: true } },
          { title: "Read generated left parent position evidence", tool: "get_layer_details", args: { compName, layerIndex: 4, includeProperties: true, propertyDepth: 2, propertyLimit: 80, includeValues: true } },
          { title: "Select generated closest-parent child layers explicitly", tool: "set_layer_selection", args: { compName, layerIndices: selectedLayerIndices, expectedLayerNames: selectedLayerNames, makeActive: true } },
          { title: "Read generated closest-parent selected child layers", tool: "get_selected_layers", args: {} },
          { title: "Parent generated right child to nearest right parent", tool: "set_layer_parent", args: { compName, layerIndex: 1, parentLayerIndex: 3, expectedLayerName: childRightName, expectedParentName: parentRightName } },
          { title: "Read generated right child nearest parent", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: false } },
          { title: "Parent generated left child to nearest left parent", tool: "set_layer_parent", args: { compName, layerIndex: 2, parentLayerIndex: 4, expectedLayerName: childLeftName, expectedParentName: parentLeftName } },
          { title: "Read generated left child nearest parent", tool: "get_layer_details", args: { compName, layerIndex: 2, includeProperties: false } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentLayerTrackMatteScenarioPlans(runPrefix) {
  const base = `${runPrefix} Track Matte`;
  const compName = `${base} Comp`;
  const fillName = `${base} Fill Shape`;
  const matteName = `${base} Matte Shape`;
  const fillLayerIndex = 2;
  const matteLayerIndex = 1;
  const trackMatteType = "luma_inverted";

  return [
    {
      id: "generated-layer-track-matte",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_shape_layer",
        "create_shape_layer",
        "get_layer_details",
        "get_layer_details",
        "set_layer_track_matte",
        "get_layer_details"
      ],
      expectedReadBack: {
        generatedLayerTrackMatte: true,
        compName,
        fillName,
        matteName,
        fillLayerIndex,
        matteLayerIndex,
        trackMatteType
      },
      plan: {
        summary: "Generated-only live QA for an explicit layer track matte relationship with read-back.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated track-matte comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.04, 0.05, 0.06], allowDuplicateName: false, openInViewer: true, comment: "Generated-only track matte validation" } },
          { title: "Create generated fill shape", tool: "create_shape_layer", args: { compName, name: fillName, shape: "rectangle", size: [460, 260], position: [320, 180], fillColor: [0.1, 0.45, 0.9], strokeColor: [0.1, 0.45, 0.9], strokeWidth: 0, duration: 3 } },
          { title: "Create generated matte shape", tool: "create_shape_layer", args: { compName, name: matteName, shape: "rectangle", size: [260, 170], position: [320, 180], fillColor: [0.95, 0.95, 0.95], strokeColor: [1, 1, 1], strokeWidth: 0, duration: 3 } },
          { title: "Read generated fill layer before matte", tool: "get_layer_details", args: { compName, layerIndex: fillLayerIndex, includeProperties: false } },
          { title: "Read generated matte layer before matte", tool: "get_layer_details", args: { compName, layerIndex: matteLayerIndex, includeProperties: false } },
          { title: "Set generated fill track matte", tool: "set_layer_track_matte", args: { compName, layerIndex: fillLayerIndex, matteLayerIndex, trackMatteType, expectedLayerName: fillName, expectedMatteLayerName: matteName } },
          { title: "Read generated fill track matte after update", tool: "get_layer_details", args: { compName, layerIndex: fillLayerIndex, includeProperties: false } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentAdjustmentLayerPlacementScenarioPlans(runPrefix) {
  const base = `${runPrefix} Adjustment Break`;
  const compName = `${base} Comp`;
  const foregroundName = `${base} Foreground Shape`;
  const targetName = `${base} Target Shape`;
  const adjustmentName = `${base} 3D Break Adjustment`;
  const targetLayerIndex = 2;

  return [
    {
      id: "generated-adjustment-layer-placement",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_shape_layer",
        "create_shape_layer",
        "get_comp_details",
        "create_adjustment_layer",
        "get_layer_details",
        "get_layer_details"
      ],
      expectedReadBack: {
        generatedAdjustmentLayerPlacement: true,
        compName,
        foregroundName,
        targetName,
        adjustmentName,
        targetLayerIndex,
        adjustmentLayerIndexAfter: 2,
        targetLayerIndexAfter: 3
      },
      plan: {
        summary: "Generated-only live QA for inserting one generated adjustment layer immediately above a guarded generated layer.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated adjustment-placement comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.04, 0.05, 0.07], allowDuplicateName: false, openInViewer: true, comment: "Generated-only adjustment placement validation" } },
          { title: "Create generated target shape", tool: "create_shape_layer", args: { compName, name: targetName, shape: "rectangle", size: [360, 220], position: [320, 180], fillColor: [0.18, 0.32, 0.8], strokeColor: [1, 1, 1], strokeWidth: 2, duration: 3 } },
          { title: "Create generated foreground shape", tool: "create_shape_layer", args: { compName, name: foregroundName, shape: "ellipse", size: [140, 140], position: [320, 180], fillColor: [0.86, 0.52, 0.18], strokeColor: [1, 1, 1], strokeWidth: 2, duration: 3 } },
          { title: "Read generated stack before adjustment placement", tool: "get_comp_details", args: { compName, includeLayers: true } },
          { title: "Create generated adjustment break above target", tool: "create_adjustment_layer", args: { compName, name: adjustmentName, color: [1, 1, 1], width: 640, height: 360, startTime: 0, duration: 3, insertBeforeLayerIndex: targetLayerIndex, expectedBeforeLayerName: targetName } },
          { title: "Read generated adjustment break after placement", tool: "get_layer_details", args: { compName, layerIndex: 2, includeProperties: false } },
          { title: "Read generated guarded target after placement", tool: "get_layer_details", args: { compName, layerIndex: 3, includeProperties: false } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentLayerConnectionLineScenarioPlans(runPrefix) {
  const base = `${runPrefix} Connection Line`;
  const compName = `${base} Comp`;
  const fromName = `${base} From`;
  const toName = `${base} To`;
  const connectorName = `${base} Connector`;
  const strokeColor = [0.2, 0.8, 1];
  const strokeWidth = 5;

  return [
    {
      id: "generated-layer-connection-line",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_shape_layer",
        "create_shape_layer",
        "get_layer_details",
        "get_layer_details",
        "create_layer_connection_line",
        "get_layer_details"
      ],
      expectedReadBack: {
        generatedLayerConnectionLine: true,
        compName,
        fromName,
        toName,
        connectorName,
        connectorLayerIndex: 1,
        fromLayerIndexBeforeConnector: 2,
        toLayerIndexBeforeConnector: 1,
        strokeColor,
        strokeWidth
      },
      plan: {
        summary: "Generated-only live QA for creating one locked dynamic connector line between two explicit generated layers.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated connection-line comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.04, 0.05, 0.07], allowDuplicateName: false, openInViewer: true, comment: "Generated-only layer connection line validation" } },
          { title: "Create generated source endpoint", tool: "create_shape_layer", args: { compName, name: fromName, shape: "ellipse", size: [120, 120], position: [180, 180], fillColor: [0.22, 0.62, 0.9], strokeColor: [1, 1, 1], strokeWidth: 2, duration: 3 } },
          { title: "Create generated target endpoint", tool: "create_shape_layer", args: { compName, name: toName, shape: "rectangle", size: [150, 110], position: [460, 180], fillColor: [0.92, 0.52, 0.2], strokeColor: [1, 1, 1], strokeWidth: 2, duration: 3 } },
          { title: "Read generated source endpoint", tool: "get_layer_details", args: { compName, layerIndex: 2, includeProperties: false } },
          { title: "Read generated target endpoint", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: false } },
          { title: "Create generated locked connection line", tool: "create_layer_connection_line", args: { compName, fromLayerIndex: 2, toLayerIndex: 1, expectedFromLayerName: fromName, expectedToLayerName: toName, name: connectorName, pathGroupName: "Connector", strokeColor, strokeWidth, duration: 3, lockLayer: true } },
          { title: "Read generated connection line", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: true, propertyDepth: 5, propertyLimit: 120, includeValues: true, includeExpressions: true } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentGridRigControlReplacementScenarioPlans(runPrefix) {
  const base = `${runPrefix} Grid Rig Control`;
  const compName = `${base} Comp`;
  const controlName = `${base} Layer`;
  const effectNames = ["Gutter", "Matte Roundness"];
  const metadata = {
    label: 9,
    enabled: false,
    guideLayer: true
  };

  return [
    {
      id: "generated-grid-rig-control-replacement",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_null_layer",
        "set_layer_metadata",
        "get_layer_details",
        "create_shape_layer",
        "set_layer_metadata",
        "get_layer_details",
        "add_effect",
        "add_effect",
        "delete_layer",
        "get_comp_details",
        "get_layer_details",
        "get_effect_details",
        "get_effect_details"
      ],
      expectedReadBack: {
        generatedGridRigControlReplacement: true,
        compName,
        controlName,
        effectNames,
        metadata,
        replacementLayerIndex: 1,
        deletedLayerIndex: 2
      },
      plan: {
        summary: "Generated-only live QA for replacing one inspected Grid Rig Control null with a generated shape control layer.",
        risk: "high",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated grid-rig comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.04, 0.05, 0.07], allowDuplicateName: false, openInViewer: true, comment: "Generated-only Grid Rig Control replacement validation" } },
          { title: "Create generated old Grid Rig Control null", tool: "create_null_layer", args: { compName, name: controlName, startTime: 0, duration: 3 } },
          { title: "Set old control metadata before replacement", tool: "set_layer_metadata", args: { compName, layerIndices: [1], expectedLayerNames: [controlName], label: metadata.label, enabled: metadata.enabled, guideLayer: metadata.guideLayer } },
          { title: "Read old control before replacement", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: false } },
          { title: "Create generated replacement shape control", tool: "create_shape_layer", args: { compName, name: controlName, shape: "rectangle", size: [120, 120], position: [320, 180], fillColor: [0.2, 0.56, 0.9], strokeColor: [1, 1, 1], strokeWidth: 2, duration: 3 } },
          { title: "Preserve replacement layer metadata", tool: "set_layer_metadata", args: { compName, layerIndices: [1], expectedLayerNames: [controlName], label: metadata.label, enabled: metadata.enabled, guideLayer: metadata.guideLayer } },
          { title: "Read replacement metadata before effects", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: false } },
          { title: "Add generated Gutter slider", tool: "add_effect", args: { compName, layerIndex: 1, effect: "ADBE Slider Control", name: effectNames[0] } },
          { title: "Add generated Matte Roundness slider", tool: "add_effect", args: { compName, layerIndex: 1, effect: "ADBE Slider Control", name: effectNames[1] } },
          { title: "Delete old generated Grid Rig Control null", tool: "delete_layer", args: { compName, layerIndex: 2, expectedLayerName: controlName } },
          { title: "Read grid-rig layer stack after replacement", tool: "get_comp_details", args: { compName, includeLayers: true, layerLimit: 10 } },
          { title: "Read replacement Grid Rig Control layer", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: true, propertyDepth: 4, propertyLimit: 120, includeValues: true, includeExpressions: true } },
          { title: "Read generated Gutter slider", tool: "get_effect_details", args: { compName, layerIndex: 1, effectName: effectNames[0], effectMatchName: "ADBE Slider Control", includeProperties: true } },
          { title: "Read generated Matte Roundness slider", tool: "get_effect_details", args: { compName, layerIndex: 1, effectName: effectNames[1], effectMatchName: "ADBE Slider Control", includeProperties: true } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentTextShapesScenarioPlans(runPrefix) {
  const base = `${runPrefix} Text Shapes`;
  const compName = `${base} Comp`;
  const sourceName = `${base} Text`;
  const shapeName = `${base} Outlines`;
  const sourceText = "AE";

  return [
    {
      id: "generated-text-shapes-from-text",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_text_layer",
        "get_layer_details",
        "create_shapes_from_text",
        "get_layer_details"
      ],
      expectedReadBack: {
        generatedTextShapesFromText: true,
        compName,
        sourceName,
        shapeName,
        sourceText,
        shapeLayerIndex: 1,
        sourceLayerIndexAfter: 2
      },
      plan: {
        summary: "Generated-only live QA for converting one explicit generated text layer to AE shape outlines.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated text-shapes comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.04, 0.05, 0.07], allowDuplicateName: false, openInViewer: true, comment: "Generated-only text to shape outline validation" } },
          { title: "Create generated source text layer", tool: "create_text_layer", args: { compName, name: sourceName, text: sourceText, position: [320, 190], fontSize: 96, fillColor: [0.94, 0.9, 0.74], duration: 3 } },
          { title: "Read generated source text before conversion", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: true, propertyDepth: 2, propertyLimit: 80, includeValues: true, includeExpressions: true } },
          { title: "Create generated shape outlines from guarded text", tool: "create_shapes_from_text", args: { compName, layerIndex: 1, expectedLayerName: sourceName, expectedSourceText: sourceText, shapeLayerName: shapeName, lockCreatedShapeLayer: false } },
          { title: "Read generated shape outlines", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: true, propertyDepth: 5, propertyLimit: 160, includeValues: false, includeExpressions: true } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentStickEffectExpressionScenarioPlans(runPrefix) {
  const base = `${runPrefix} Stick Effect`;
  const compName = `${base} Comp`;
  const layerName = `${base} Shape`;
  const effectName = `${base} Ramp`;
  const propertyPath = [
    { matchName: "ADBE Effect Parade" },
    { matchName: "ADBE Ramp", name: effectName },
    { matchName: "ADBE Ramp-0001" }
  ];
  const expression = "toComp(anchorPoint + value);";

  return [
    {
      id: "generated-stick-effect-expression",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_shape_layer",
        "add_effect",
        "get_effect_details",
        "set_expression",
        "get_layer_details",
        "get_effect_details"
      ],
      expectedReadBack: {
        generatedStickEffectExpression: true,
        compName,
        layerName,
        effectName,
        effectMatchName: "ADBE Ramp",
        propertyPath,
        expression
      },
      plan: {
        summary: "Generated-only live QA for the stick-effect expression on an explicit effect 2D spatial property.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated stick-effect comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.06, 0.07, 0.09], allowDuplicateName: false, openInViewer: true, comment: "Generated-only stick-effect expression validation" } },
          { title: "Create generated stick-effect shape", tool: "create_shape_layer", args: { compName, name: layerName, shape: "rectangle", size: [220, 140], position: [320, 180], fillColor: [0.18, 0.5, 0.9], strokeColor: [1, 1, 1], strokeWidth: 2, duration: 3 } },
          { title: "Add generated Ramp effect", tool: "add_effect", args: { compName, layerIndex: 1, effect: "ADBE Ramp", name: effectName } },
          { title: "Inspect generated Ramp effect before expression", tool: "get_effect_details", args: { compName, layerIndex: 1, effectName, includeProperties: true, propertyDepth: 1, propertyLimit: 20, includeValues: true, includeExpressions: true } },
          { title: "Set generated stick-effect expression", tool: "set_expression", args: { compName, layerIndex: 1, propertyPath, expression, enabled: true } },
          { title: "Read generated stick-effect layer expression", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: true, propertyDepth: 3, propertyLimit: 120, includeValues: true, includeExpressions: true } },
          { title: "Read generated stick-effect effect expression", tool: "get_effect_details", args: { compName, layerIndex: 1, effectName, includeProperties: true, propertyDepth: 1, propertyLimit: 20, includeValues: true, includeExpressions: true } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentEstimatePathLengthScenarioPlans(runPrefix) {
  const base = `${runPrefix} Estimate Path Length`;
  const compName = `${base} Comp`;
  const layerName = `${base} Shape`;
  const samplesEffectName = "Path Samples";
  const lengthEffectName = "Path Length";
  const pathExpression = [
    'var rectSize = thisLayer.content("Rectangle").content("Rectangle Path 1").size;',
    'var samples = Math.max(1, Math.floor(effect("Path Samples")("Slider").value));',
    "var width = Math.abs(rectSize[0]);",
    "var height = Math.abs(rectSize[1]);",
    "var perimeter = 2 * (width + height);",
    "function pointAt(progress) {",
    "  var distance = ((progress % 1) + 1) % 1 * perimeter;",
    "  if (distance <= width) return [-width / 2 + distance, -height / 2];",
    "  distance -= width;",
    "  if (distance <= height) return [width / 2, -height / 2 + distance];",
    "  distance -= height;",
    "  if (distance <= width) return [width / 2 - distance, height / 2];",
    "  distance -= width;",
    "  return [-width / 2, height / 2 - distance];",
    "}",
    "var totalLength = 0;",
    "var previousPoint = pointAt(0);",
    "for (var i = 1; i <= samples; i++) {",
    "  var currentPoint = pointAt(i / samples);",
    "  totalLength += length(currentPoint - previousPoint);",
    "  previousPoint = currentPoint;",
    "}",
    "Math.ceil(totalLength);"
  ].join("\n");
  const lengthSliderPropertyPath = [
    { matchName: "ADBE Effect Parade" },
    { matchName: "ADBE Slider Control", name: lengthEffectName },
    { matchName: "ADBE Slider Control-0001" }
  ];
  const samplesSliderPropertyPath = [
    { matchName: "ADBE Effect Parade" },
    { matchName: "ADBE Slider Control", name: samplesEffectName },
    { matchName: "ADBE Slider Control-0001" }
  ];

  return [
    {
      id: "generated-estimate-path-length",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_shape_layer",
        "add_effect",
        "get_effect_details",
        "set_effect_property",
        "add_effect",
        "get_effect_details",
        "set_expression",
        "get_layer_details",
        "get_effect_details"
      ],
      expectedReadBack: {
        generatedEstimatePathLength: true,
        compName,
        layerName,
        samplesEffectName,
        lengthEffectName,
        samplesValue: 100,
        samplesPropertyPath: samplesSliderPropertyPath,
        propertyPath: lengthSliderPropertyPath,
        expression: pathExpression,
        minLengthValue: 716,
        maxLengthValue: 718
      },
      plan: {
        summary: "Generated-only live QA for estimating a rectangle path length with generated slider controls.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated path-length comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.05, 0.06, 0.08], allowDuplicateName: false, openInViewer: true, comment: "Generated-only estimate path length validation" } },
          { title: "Create generated path-length shape", tool: "create_shape_layer", args: { compName, name: layerName, shape: "rectangle", size: [240, 120], position: [320, 180], fillColor: [0.18, 0.58, 0.86], strokeColor: [1, 1, 1], strokeWidth: 2, duration: 3 } },
          { title: "Add generated Path Samples slider", tool: "add_effect", args: { compName, layerIndex: 1, effect: "ADBE Slider Control", name: samplesEffectName } },
          { title: "Read generated Path Samples slider", tool: "get_effect_details", args: { compName, layerIndex: 1, effectName: samplesEffectName, includeProperties: true, propertyDepth: 1, propertyLimit: 20, includeValues: true, includeExpressions: true } },
          { title: "Set generated Path Samples value", tool: "set_effect_property", args: { compName, layerIndex: 1, effectName: samplesEffectName, propertyIndex: 1, value: 100 } },
          { title: "Add generated Path Length slider", tool: "add_effect", args: { compName, layerIndex: 1, effect: "ADBE Slider Control", name: lengthEffectName } },
          { title: "Read generated Path Length slider", tool: "get_effect_details", args: { compName, layerIndex: 1, effectName: lengthEffectName, includeProperties: true, propertyDepth: 1, propertyLimit: 20, includeValues: true, includeExpressions: true } },
          { title: "Set generated Path Length expression", tool: "set_expression", args: { compName, layerIndex: 1, propertyPath: lengthSliderPropertyPath, expression: pathExpression, enabled: true } },
          { title: "Read generated path-length layer", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: true, propertyDepth: 4, propertyLimit: 180, includeValues: true, includeExpressions: true } },
          { title: "Read generated Path Length expression", tool: "get_effect_details", args: { compName, layerIndex: 1, effectName: lengthEffectName, includeProperties: true, propertyDepth: 1, propertyLimit: 20, includeValues: true, includeExpressions: true } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentPathGeometryScenarioPlans(runPrefix) {
  const base = `${runPrefix} Path Geometry`;
  const compName = `${base} Comp`;
  const layerName = `${base} Solid`;
  const maskName = `${base} Mask`;
  const firstGeometry = {
    closed: true,
    vertices: [[80, 70], [360, 70], [360, 210], [80, 210]],
    inTangents: [[0, 0], [-18, 0], [0, -18], [18, 0]],
    outTangents: [[18, 0], [0, 18], [-18, 0], [0, -18]]
  };
  const secondGeometry = {
    closed: true,
    vertices: [[120, 90], [430, 90], [380, 250], [90, 230]],
    inTangents: [[0, 0], [-22, 0], [0, -22], [22, 0]],
    outTangents: [[22, 0], [0, 22], [-22, 0], [0, -22]]
  };
  const keyframes = [
    { time: 0, geometry: firstGeometry },
    { time: 1, geometry: secondGeometry }
  ];

  return [
    {
      id: "generated-shape-mask-path-geometry",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_solid_layer",
        "set_layer_mask",
        "get_layer_details",
        "set_path_geometry",
        "get_path_geometry",
        "get_layer_details"
      ],
      expectedReadBack: {
        generatedPathGeometry: true,
        compName,
        layerName,
        maskName,
        keyframes
      },
      plan: {
        summary: "Generated-only live QA for keyframed Mask path geometry using explicit vertices, inTangents, outTangents, and closed state.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated path-geometry comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.04, 0.06, 0.08], allowDuplicateName: false, openInViewer: true, comment: "Generated-only path geometry validation" } },
          { title: "Create generated path-geometry solid", tool: "create_solid_layer", args: { compName, name: layerName, color: [0.12, 0.36, 0.72], width: 520, height: 300, duration: 3 } },
          { title: "Create generated target mask", tool: "set_layer_mask", args: { compName, layerIndex: 1, operation: "create", name: maskName, vertices: firstGeometry.vertices, maskMode: "add", inverted: false } },
          { title: "Read generated target mask before geometry keys", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: false } },
          { title: "Set generated keyframed mask path geometry", tool: "set_path_geometry", args: { compName, layerIndex: 1, targetKind: "mask", maskIndex: 1, expectedMaskName: maskName, keyframes, clearExisting: true } },
          { title: "Read generated keyframed path geometry", tool: "get_path_geometry", args: { compName, layerIndex: 1, targetKind: "mask", maskIndex: 1, expectedMaskName: maskName, includeKeyframes: true, keyframeLimit: 10 } },
          { title: "Read generated layer after path geometry", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: false } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function pathGeometryBounds(geometry) {
  const vertices = Array.isArray(geometry && geometry.vertices) ? geometry.vertices : [];
  const xs = vertices.map((point) => Number(point[0]));
  const ys = vertices.map((point) => Number(point[1]));
  return {
    centerX: (Math.min(...xs) + Math.max(...xs)) / 2,
    centerY: (Math.min(...ys) + Math.max(...ys)) / 2
  };
}

function flipPathGeometry(geometry, direction) {
  const bounds = pathGeometryBounds(geometry);
  const horizontal = direction === "horizontal";
  return {
    closed: geometry.closed,
    vertices: geometry.vertices.map((point) => horizontal
      ? [bounds.centerX - (point[0] - bounds.centerX), point[1]]
      : [point[0], bounds.centerY - (point[1] - bounds.centerY)]),
    inTangents: geometry.inTangents.map((point) => horizontal ? [-point[0], point[1]] : [point[0], -point[1]]),
    outTangents: geometry.outTangents.map((point) => horizontal ? [-point[0], point[1]] : [point[0], -point[1]])
  };
}

function agentFlipPathGeometryScenarioPlans(runPrefix) {
  const base = `${runPrefix} Flip Path`;
  const compName = `${base} Comp`;
  const layerName = `${base} Solid`;
  const maskName = `${base} Mask`;
  const flipDirection = "horizontal";
  const firstGeometry = {
    closed: true,
    vertices: [[80, 70], [360, 70], [330, 210], [100, 230]],
    inTangents: [[0, 0], [-18, 0], [0, -20], [16, 0]],
    outTangents: [[18, 0], [0, 18], [-16, 0], [0, -20]]
  };
  const secondGeometry = {
    closed: true,
    vertices: [[120, 90], [430, 95], [385, 250], [90, 230]],
    inTangents: [[0, 0], [-22, 0], [0, -22], [22, 0]],
    outTangents: [[22, 0], [0, 22], [-22, 0], [0, -22]]
  };
  const keyframes = [
    { time: 0, geometry: firstGeometry },
    { time: 1, geometry: secondGeometry }
  ];
  const flippedKeyframes = keyframes.map((keyframe) => ({
    time: keyframe.time,
    geometry: flipPathGeometry(keyframe.geometry, flipDirection)
  }));

  return [
    {
      id: "generated-flip-path-geometry",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_solid_layer",
        "set_layer_mask",
        "get_layer_details",
        "set_path_geometry",
        "get_path_geometry",
        "set_path_geometry",
        "get_path_geometry",
        "get_layer_details"
      ],
      expectedReadBack: {
        generatedPathGeometry: true,
        compName,
        layerName,
        maskName,
        keyframes: flippedKeyframes
      },
      plan: {
        summary: "Generated-only live QA for horizontal Flip Path semantics using explicit keyframed mask vertices, tangents, closed state, and read-back.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated flip-path comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.04, 0.06, 0.08], allowDuplicateName: false, openInViewer: true, comment: "Generated-only flip path validation" } },
          { title: "Create generated flip-path solid", tool: "create_solid_layer", args: { compName, name: layerName, color: [0.18, 0.38, 0.74], width: 520, height: 300, duration: 3 } },
          { title: "Create generated flip target mask", tool: "set_layer_mask", args: { compName, layerIndex: 1, operation: "create", name: maskName, vertices: firstGeometry.vertices, maskMode: "add", inverted: false } },
          { title: "Read generated flip target mask before keyframed geometry", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: false } },
          { title: "Seed generated keyframed path geometry before flip", tool: "set_path_geometry", args: { compName, layerIndex: 1, targetKind: "mask", maskIndex: 1, expectedMaskName: maskName, keyframes, clearExisting: true } },
          { title: "Read generated path geometry before flip", tool: "get_path_geometry", args: { compName, layerIndex: 1, targetKind: "mask", maskIndex: 1, expectedMaskName: maskName, includeKeyframes: true, keyframeLimit: 10 } },
          { title: "Set generated horizontally flipped path geometry", tool: "set_path_geometry", args: { compName, layerIndex: 1, targetKind: "mask", maskIndex: 1, expectedMaskName: maskName, keyframes: flippedKeyframes, clearExisting: true } },
          { title: "Read generated flipped path geometry", tool: "get_path_geometry", args: { compName, layerIndex: 1, targetKind: "mask", maskIndex: 1, expectedMaskName: maskName, includeKeyframes: true, keyframeLimit: 10 } },
          { title: "Read generated layer after flip path", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: false } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function roundPathPointForExport(point) {
  return [
    Number(Number(point[0]).toFixed(2)),
    Number(Number(point[1]).toFixed(2))
  ];
}

function exportedPathPoints(vertices) {
  const points = vertices.map(roundPathPointForExport);
  if (points.length > 1) points.push(points.shift());
  return points;
}

function agentExportPathPointsScenarioPlans(runPrefix) {
  const base = `${runPrefix} Export Path Points`;
  const compName = `${base} Comp`;
  const layerName = `${base} Solid`;
  const maskName = `${base} Mask`;
  const outputFileName = `${safeOutputName(base)}-points.txt`;
  const geometry = {
    closed: true,
    vertices: [[10.123, 20.987], [220.555, 35.444], [190, 170], [45.333, 135.666]],
    inTangents: [[0, 0], [-12, 0], [0, -14], [14, 0]],
    outTangents: [[12, 0], [0, 14], [-14, 0], [0, -12]]
  };
  const points = exportedPathPoints(geometry.vertices);
  const expectedContent = `var points = ${JSON.stringify(points)};`;

  return [
    {
      id: "generated-export-path-points",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_solid_layer",
        "set_layer_mask",
        "get_layer_details",
        "set_path_geometry",
        "get_path_geometry",
        "export_path_points",
        "get_path_geometry",
        "get_layer_details"
      ],
      expectedReadBack: {
        generatedPathPointsExport: true,
        compName,
        layerName,
        maskName,
        outputFileName,
        expectedContent,
        points,
        geometry
      },
      plan: {
        summary: "Generated-only live QA for Export Path Points semantics using explicit mask path vertices and safe generated file output.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated export path comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.05, 0.06, 0.07], allowDuplicateName: false, openInViewer: true, comment: "Generated-only export path points validation" } },
          { title: "Create generated export path solid", tool: "create_solid_layer", args: { compName, name: layerName, color: [0.28, 0.42, 0.2], width: 520, height: 300, duration: 3 } },
          { title: "Create generated export target mask", tool: "set_layer_mask", args: { compName, layerIndex: 1, operation: "create", name: maskName, vertices: geometry.vertices, maskMode: "add", inverted: false } },
          { title: "Read generated export target mask before path geometry", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: false } },
          { title: "Seed generated export path geometry", tool: "set_path_geometry", args: { compName, layerIndex: 1, targetKind: "mask", maskIndex: 1, expectedMaskName: maskName, geometry } },
          { title: "Read generated path geometry before export", tool: "get_path_geometry", args: { compName, layerIndex: 1, targetKind: "mask", maskIndex: 1, expectedMaskName: maskName, includeKeyframes: true, keyframeLimit: 10 } },
          { title: "Export generated path points to safe file", tool: "export_path_points", args: { vertices: geometry.vertices, outputFileName, decimalPlaces: 2, rotateFirstPointToEnd: true } },
          { title: "Read generated path geometry after export", tool: "get_path_geometry", args: { compName, layerIndex: 1, targetKind: "mask", maskIndex: 1, expectedMaskName: maskName, includeKeyframes: true, keyframeLimit: 10 } },
          { title: "Read generated layer after export path points", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: false } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentExportTextToFileScenarioPlans(runPrefix) {
  const base = `${runPrefix} Export Text`;
  const compName = `${base} Comp`;
  const textName = `${base} Text`;
  const solidName = `${base} Solid`;
  const sourceText = "Generated export text\nSecond line";
  const outputFileName = `${safeOutputName(base)}-text.txt`;
  const expectedContent = `1:\n${sourceText}\n\n2:\n[Not a text layer]\n\n`;
  const textLayerEvidence = {
    layer: { index: 1, name: textName, textLayer: true, layerKind: "text" },
    text: { kind: "TextDocument", text: sourceText }
  };
  const nonTextLayerEvidence = {
    layer: { index: 2, name: solidName, textLayer: false, layerKind: null }
  };

  return [
    {
      id: "generated-export-text-to-file",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_solid_layer",
        "create_text_layer",
        "set_layer_selection",
        "get_selected_layers",
        "get_layer_details",
        "get_layer_details",
        "export_text_to_file",
        "get_selected_layers"
      ],
      expectedReadBack: {
        generatedTextFileExport: true,
        compName,
        textName,
        solidName,
        outputFileName,
        expectedContent,
        sourceText
      },
      plan: {
        summary: "Generated-only live QA for Export Text To File semantics using selected text-layer evidence and safe generated file output.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated export text comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.05, 0.06, 0.07], allowDuplicateName: false, openInViewer: true, comment: "Generated-only export text validation" } },
          { title: "Create generated non-text export layer", tool: "create_solid_layer", args: { compName, name: solidName, color: [0.18, 0.28, 0.36], width: 520, height: 260, duration: 3 } },
          { title: "Create generated export text layer", tool: "create_text_layer", args: { compName, name: textName, text: sourceText, position: [320, 180], fontSize: 42, fillColor: [0.94, 0.9, 0.74], duration: 3 } },
          { title: "Select generated export layers", tool: "set_layer_selection", args: { compName, layerIndices: [1, 2], mode: "replace", expectedLayerNames: [textName, solidName], verifyAfter: true } },
          { title: "Read selected export layers", tool: "get_selected_layers", args: {} },
          { title: "Read selected text layer Source Text", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: false } },
          { title: "Read selected non-text layer", tool: "get_layer_details", args: { compName, layerIndex: 2, includeProperties: false } },
          { title: "Export selected text evidence to safe file", tool: "export_text_to_file", args: { layers: [textLayerEvidence, nonTextLayerEvidence], expectedLayerCount: 2, outputFileName } },
          { title: "Read selected layers after text export", tool: "get_selected_layers", args: {} }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentEssentialGraphicsScenarioPlans(runPrefix) {
  const base = `${runPrefix} Essential Graphics`;
  const compName = `${base} Comp`;
  const layerName = `${base} Shape`;
  const controllerName = `${base} Opacity`;
  const propertyPath = [
    { matchName: "ADBE Transform Group" },
    { matchName: "ADBE Opacity", name: "Opacity" }
  ];

  return [
    {
      id: "generated-essential-graphics-controller",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_shape_layer",
        "get_layer_details",
        "get_essential_graphics_controllers",
        "add_property_to_essential_graphics",
        "get_essential_graphics_controllers",
        "get_layer_details"
      ],
      expectedReadBack: {
        generatedEssentialGraphicsController: true,
        compName,
        layerName,
        controllerName,
        propertyMatchName: "ADBE Opacity"
      },
      plan: {
        summary: "Generated-only live QA for adding one explicit generated layer property to Essential Graphics with controller read-back.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated Essential Graphics comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.05, 0.06, 0.08], allowDuplicateName: false, openInViewer: true, comment: "Generated-only Essential Graphics validation" } },
          { title: "Create generated Essential Graphics shape", tool: "create_shape_layer", args: { compName, name: layerName, shape: "rectangle", size: [260, 150], position: [320, 180], fillColor: [0.18, 0.46, 0.78], strokeColor: [1, 1, 1], strokeWidth: 2, duration: 3 } },
          { title: "Read generated layer before Essential Graphics add", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: true, propertyDepth: 2, propertyLimit: 80 } },
          { title: "Read Essential Graphics controllers before add", tool: "get_essential_graphics_controllers", args: { compName } },
          { title: "Add generated opacity property to Essential Graphics", tool: "add_property_to_essential_graphics", args: { compName, layerIndex: 1, expectedLayerName: layerName, propertyPath, expectedPropertyMatchName: "ADBE Opacity", controllerName, expectedControllerCountBefore: 0 } },
          { title: "Read Essential Graphics controllers after add", tool: "get_essential_graphics_controllers", args: { compName } },
          { title: "Read generated layer after Essential Graphics add", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: true, propertyDepth: 2, propertyLimit: 80 } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentCompPropertiesScenarioPlans(runPrefix) {
  const base = `${runPrefix} Comp Properties`;
  const compName = `${base} Comp`;
  const compProperties = {
    width: 720,
    height: 405,
    pixelAspect: 1,
    duration: 6,
    frameRate: 30,
    bgColor: [0.12, 0.18, 0.24],
    displayStartTime: 1
  };
  const workArea = { start: 1.2, duration: 3.5 };

  return [
    {
      id: "generated-comp-properties-work-area",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "set_comp_properties",
        "set_comp_work_area",
        "get_comp_details"
      ],
      expectedReadBack: {
        generatedCompPropertiesWorkArea: true,
        compName,
        compProperties,
        workArea
      },
      plan: {
        summary: "AE_AGENT_QA_061 generated-only live QA for explicit comp properties and work-area typed tools.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated comp-properties comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 4, frameRate: 24, bgColor: [0.04, 0.05, 0.07], allowDuplicateName: false, openInViewer: false, comment: "AE_AGENT_QA_061 generated-only comp properties validation" } },
          { title: "Set generated comp properties", tool: "set_comp_properties", args: { compName, ...compProperties } },
          { title: "Read generated comp properties after property update", tool: "get_comp_details", args: { compName, includeLayers: false } },
          { title: "Set generated comp work area", tool: "set_comp_work_area", args: { compName, ...workArea } },
          { title: "Read generated comp properties", tool: "get_comp_details", args: { compName, includeLayers: false } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentCompRefreshScenarioPlans(runPrefix) {
  const base = `${runPrefix} Comp Refresh`;
  const compName = `${base} Comp`;

  return [
    {
      id: "generated-comp-panel-refresh",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "get_comp_details",
        "refresh_comp_panel",
        "get_comp_details"
      ],
      expectedReadBack: {
        generatedCompPanelRefresh: true,
        compName,
        expectedMotionBlur: false
      },
      plan: {
        summary: "Generated-only live QA for forcing a Composition panel refresh through a bounded comp.motionBlur double-toggle.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated comp-refresh comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.04, 0.05, 0.07], allowDuplicateName: false, openInViewer: true, comment: "Generated-only Composition panel refresh validation" } },
          { title: "Read generated comp before refresh", tool: "get_comp_details", args: { compName, includeLayers: false } },
          { title: "Refresh generated comp panel", tool: "refresh_comp_panel", args: { compName, expectedMotionBlur: false } },
          { title: "Read generated comp after refresh", tool: "get_comp_details", args: { compName, includeLayers: false } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentCompCurrentTimeScenarioPlans(runPrefix) {
  const base = `${runPrefix} Comp Current Time`;
  const compName = `${base} Comp`;
  const firstTargetTime = 1.25;
  const frameTarget = 42;
  const frameRate = 24;
  const frameTargetTime = frameTarget / frameRate;

  return [
    {
      id: "generated-comp-current-time",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "get_comp_details",
        "set_comp_current_time",
        "get_comp_details",
        "set_comp_current_time",
        "get_comp_details"
      ],
      expectedReadBack: {
        generatedCompCurrentTime: true,
        compName,
        firstTargetTime,
        frameTarget,
        frameRate,
        frameTargetTime
      },
      plan: {
        summary: "Generated-only live QA for setting one explicit composition current time indicator.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated CTI comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 4, frameRate, bgColor: [0.06, 0.07, 0.09], allowDuplicateName: false, openInViewer: true, comment: "Generated-only comp current time validation" } },
          { title: "Read generated CTI comp before move", tool: "get_comp_details", args: { compName, includeLayers: false } },
          { title: "Set generated comp CTI by seconds", tool: "set_comp_current_time", args: { compName, time: firstTargetTime, expectedCurrentTime: 0, openInViewer: true } },
          { title: "Read generated CTI after seconds move", tool: "get_comp_details", args: { compName, includeLayers: false } },
          { title: "Set generated comp CTI by frame", tool: "set_comp_current_time", args: { compName, frame: frameTarget, frameRate, expectedCurrentTime: firstTargetTime, openInViewer: true } },
          { title: "Read generated CTI after frame move", tool: "get_comp_details", args: { compName, includeLayers: false } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentSelectedPropertyValueScenarioPlans(runPrefix) {
  const base = `${runPrefix} Selected Property Value`;
  const compName = `${base} Comp`;
  const layerName = `${base} Shape`;
  const propertyPath = "ADBE Transform Group.ADBE Opacity";
  const expectedValue = 42;

  return [
    {
      id: "generated-selected-property-value",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_shape_layer",
        "get_selected_properties",
        "set_property_value",
        "get_layer_details"
      ],
      expectedReadBack: {
        generatedSelectedPropertyValue: true,
        compName,
        layerName,
        propertyPath: ["ADBE Transform Group", "ADBE Opacity"],
        value: expectedValue
      },
      plan: {
        summary: "AE_AGENT_QA_072 generated-only live QA for selected/generated layer property value edits.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated selected-property comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.07, 0.08, 0.1], allowDuplicateName: false, openInViewer: true, comment: "AE_AGENT_QA_072 generated-only selected property value validation" } },
          { title: "Create generated selected-property shape", tool: "create_shape_layer", args: { compName, name: layerName, shape: "rectangle", size: [200, 120], position: [320, 180], fillColor: [0.82, 0.36, 0.18], strokeColor: [1, 1, 1], strokeWidth: 2, duration: 3 } },
          { title: "Inspect generated selected-property state", tool: "get_selected_properties", args: { includeValues: true, includeExpressions: true } },
          { title: "Set generated opacity value", tool: "set_property_value", args: { compName, layerIndex: 1, propertyPath, value: expectedValue, setAtTime: false } },
          { title: "Read generated opacity value", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: true, propertyDepth: 2, propertyLimit: 80, includeValues: true, includeExpressions: true } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentLayerSwitchScenarioPlans(runPrefix) {
  const base = `${runPrefix} Layer Switches`;
  const compName = `${base} Comp`;
  const sourceCompName = `${base} Source`;
  const layerName = `${base} Precomp Layer`;

  return [
    {
      id: "generated-layer-switches",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_comp",
        "add_project_item_to_comp",
        "get_layer_details",
        "set_property_value",
        "get_layer_details",
        "set_property_value",
        "get_layer_details"
      ],
      expectedReadBack: {
        generatedLayerSwitches: true,
        compName,
        sourceCompName,
        layerName,
        switches: {
          collapseTransformation: true,
          motionBlur: true
        }
      },
      plan: {
        summary: "AE_AGENT_QA_096 generated-only live QA for explicit layer switch attributes.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated layer-switch comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.05, 0.06, 0.08], allowDuplicateName: false, openInViewer: true, comment: "AE_AGENT_QA_096 generated-only layer switch validation" } },
          { title: "Create generated layer-switch source comp", tool: "create_comp", args: { name: sourceCompName, width: 320, height: 180, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.02, 0.03, 0.05], allowDuplicateName: false, openInViewer: false, comment: "AE_AGENT_QA_096 generated-only layer switch source validation" } },
          { title: "Add generated source comp as layer", tool: "add_project_item_to_comp", args: { compName, itemName: sourceCompName, itemType: "comp", name: layerName, duration: 3 } },
          { title: "Inspect generated layer switches", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: false } },
          { title: "Enable generated collapse transformations", tool: "set_property_value", args: { compName, layerIndex: 1, propertyPath: "collapseTransformation", value: true, setAtTime: false } },
          { title: "Read generated collapse switch", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: false } },
          { title: "Enable generated motion blur", tool: "set_property_value", args: { compName, layerIndex: 1, propertyPath: "motionBlur", value: true, setAtTime: false } },
          { title: "Read generated layer switches", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: false } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentKeyframeScenarioPlans(runPrefix) {
  const base = `${runPrefix} Keyframes`;
  const compName = `${base} Comp`;
  const layerName = `${base} Shape`;
  const propertyPath = "ADBE Transform Group.ADBE Opacity";
  const keyframes = [
    { time: 0, value: 15 },
    { time: 1, value: 85 },
    { time: 2, value: 35 }
  ];

  return [
    {
      id: "generated-keyframe-ease",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_shape_layer",
        "get_selected_properties",
        "set_property_keyframes",
        "apply_keyframe_ease",
        "get_layer_details"
      ],
      expectedReadBack: {
        generatedKeyframeEase: true,
        compName,
        layerName,
        propertyPath: ["ADBE Transform Group", "ADBE Opacity"],
        keyframeCount: keyframes.length,
        keyIndices: [1, 2, 3],
        interpolation: "bezier"
      },
      plan: {
        summary: "AE_AGENT_QA_083 generated-only live QA for explicit property keyframes and temporal ease.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated keyframe comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.06, 0.07, 0.09], allowDuplicateName: false, openInViewer: true, comment: "AE_AGENT_QA_083 generated-only keyframe validation" } },
          { title: "Create generated keyframe target shape", tool: "create_shape_layer", args: { compName, name: layerName, shape: "rectangle", size: [220, 120], position: [320, 180], fillColor: [0.22, 0.62, 0.88], strokeColor: [1, 1, 1], strokeWidth: 2, duration: 3 } },
          { title: "Inspect generated selected-property state", tool: "get_selected_properties", args: { includeValues: true, includeExpressions: true } },
          { title: "Set generated opacity keyframes", tool: "set_property_keyframes", args: { compName, layerIndex: 1, propertyPath, clearExisting: true, keyframes } },
          { title: "Apply generated opacity keyframe ease", tool: "apply_keyframe_ease", args: { compName, layerIndex: 1, propertyPath, keyIndices: [1, 2, 3], interpolation: "bezier", easeIn: { speed: 0, influence: 40 }, easeOut: { speed: 0, influence: 40 } } },
          { title: "Read generated keyframe property", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: true, propertyDepth: 2, propertyLimit: 80, includeValues: true, includeExpressions: true } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentTextToKeysScenarioPlans(runPrefix) {
  const base = `${runPrefix} Text To Keys`;
  const compName = `${base} Comp`;
  const layerName = `${base} Text`;
  const propertyPath = "ADBE Text Properties.ADBE Text Document";
  const keyframes = [
    { time: 0, value: { text: "A" } },
    { time: 0.5, value: { text: "AE" } },
    { time: 1, value: { text: "AE Agent" } }
  ];

  return [
    {
      id: "generated-source-text-keyframes",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_text_layer",
        "set_property_keyframes",
        "get_layer_details"
      ],
      expectedReadBack: {
        generatedSourceTextKeyframes: true,
        compName,
        layerName,
        propertyPath: ["ADBE Text Properties", "ADBE Text Document"],
        keyframes
      },
      plan: {
        summary: "AUX text-to-keys generated-only live QA for explicit Source Text keyframes.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated source-text keyframe comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 2, frameRate: 24, bgColor: [0.06, 0.07, 0.08], allowDuplicateName: false, openInViewer: true, comment: "generated-only Source Text keyframe validation" } },
          { title: "Create generated source-text layer", tool: "create_text_layer", args: { compName, name: layerName, text: "A", position: [320, 180], fontSize: 54, fillColor: [0.95, 0.95, 0.86], duration: 2 } },
          { title: "Set generated Source Text keyframes", tool: "set_property_keyframes", args: { compName, layerIndex: 1, propertyPath, clearExisting: true, keyframes } },
          { title: "Read generated Source Text keyframes", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: true, propertyDepth: 2, propertyLimit: 80, includeValues: true, includeExpressions: true } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentSelectedKeyframeMarkerScenarioPlans(runPrefix) {
  const base = `${runPrefix} Selected Keyframe Marker`;
  const compName = `${base} Comp`;
  const layerName = `${base} Shape`;
  const propertyPath = "ADBE Transform Group.ADBE Opacity";
  const markerComment = "";
  const markerTime = 1;
  const keyframes = [
    { time: 0, value: 20 },
    { time: markerTime, value: 88 },
    { time: 2, value: 35 }
  ];

  return [
    {
      id: "generated-selected-keyframe-layer-marker",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_shape_layer",
        "set_property_keyframes",
        "get_selected_properties",
        "add_layer_marker",
        "get_layer_details"
      ],
      expectedReadBack: {
        markerReadBack: true,
        compName,
        layerName,
        propertyPath: ["ADBE Transform Group", "ADBE Opacity"],
        markerComment,
        markerTime,
        markerDuration: 0
      },
      plan: {
        summary: "AE_AGENT_QA_093 generated-only live QA for adding layer markers at reviewed selected keyframe times.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated selected-keyframe marker comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.07, 0.08, 0.1], allowDuplicateName: false, openInViewer: true, comment: "AE_AGENT_QA_093 generated-only selected keyframe marker validation" } },
          { title: "Create generated selected-keyframe marker shape", tool: "create_shape_layer", args: { compName, name: layerName, shape: "rectangle", size: [220, 120], position: [320, 180], fillColor: [0.3, 0.66, 0.82], strokeColor: [1, 1, 1], strokeWidth: 2, duration: 3 } },
          { title: "Create reviewed marker keyframes", tool: "set_property_keyframes", args: { compName, layerIndex: 1, propertyPath, clearExisting: true, keyframes } },
          { title: "Inspect generated selected-keyframe property state", tool: "get_selected_properties", args: { includeValues: true, includeKeyframes: true, includeExpressions: true } },
          { title: "Add generated layer marker at reviewed keyframe time", tool: "add_layer_marker", args: { compName, layerIndex: 1, time: markerTime, comment: markerComment, duration: 0 } },
          { title: "Read generated marker and keyframes", tool: "get_layer_details", args: { compName, layerIndex: 1, includeProperties: true, propertyDepth: 2, propertyLimit: 80, includeValues: true, includeExpressions: true } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentCompositionMarkerReadScenarioPlans(runPrefix) {
  const base = `${runPrefix} Composition Marker Read`;
  const compName = `${base} Comp`;

  return [
    {
      id: "generated-composition-marker-read",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "get_comp_details"
      ],
      expectedReadBack: {
        compositionMarkerReadBack: true,
        compName,
        markerCount: 0,
        orderedBy: "comp.markerProperty.keyTime"
      },
      plan: {
        summary: "Generated-only live QA for read-only composition marker inspection.",
        risk: "low",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated composition marker read comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.07, 0.08, 0.1], allowDuplicateName: false, openInViewer: true, comment: "generated-only composition marker read validation" } },
          { title: "Read generated composition markers", tool: "get_comp_details", args: { compName, includeLayers: false, includeMarkers: true, markerLimit: 10 } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentCompositionMarkerWorkAreaScenarioPlans(runPrefix) {
  const base = `${runPrefix} Composition Marker Work Area`;
  const compName = `${base} Comp`;
  const startMarker = {
    time: 0.75,
    comment: "Work Area Start",
    duration: 0
  };
  const endMarker = {
    time: 2.25,
    comment: "Work Area End",
    duration: 0
  };
  const workArea = {
    start: startMarker.time,
    duration: endMarker.time - startMarker.time
  };

  return [
    {
      id: "generated-composition-marker-work-area",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "add_comp_marker",
        "get_comp_details",
        "set_comp_work_area"
      ],
      expectedReadBack: {
        compositionMarkerWorkAreaReadBack: true,
        compName,
        markerCount: 2,
        workArea
      },
      plan: {
        summary: "Generated-only live QA for marker-derived composition work-area mutation.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated marker work-area comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 4, frameRate: 24, bgColor: [0.07, 0.08, 0.1], allowDuplicateName: false, openInViewer: true, comment: "generated-only composition marker work-area validation" } },
          { title: "Add generated composition marker for work-area start", tool: "add_comp_marker", args: { compName, time: startMarker.time, comment: startMarker.comment, duration: startMarker.duration, expectedMarkerCountBefore: 0 } },
          { title: "Add generated composition marker for work-area end", tool: "add_comp_marker", args: { compName, time: endMarker.time, comment: endMarker.comment, duration: endMarker.duration, expectedMarkerCountBefore: 1 } },
          { title: "Read generated composition marker bounds", tool: "get_comp_details", args: { compName, includeLayers: false, includeMarkers: true, markerLimit: 10 } },
          { title: "Set generated comp work area from reviewed marker bounds", tool: "set_comp_work_area", args: { compName, start: workArea.start, duration: workArea.duration, verifyAfter: true } },
          { title: "Read generated marker-derived work area", tool: "get_comp_details", args: { compName, includeLayers: false, includeMarkers: true, markerLimit: 10 } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentCompositionLayerMarkerCopyScenarioPlans(runPrefix) {
  const base = `${runPrefix} Composition Layer Marker Copy`;
  const compName = `${base} Comp`;
  const layerName = `${base} Solid`;
  const compToLayerMarker = {
    time: 0.75,
    comment: "Comp Marker Copy",
    duration: 0.1
  };
  const layerToCompMarker = {
    time: 1.5,
    comment: "Layer Marker Copy",
    duration: 0.2
  };

  return [
    {
      id: "generated-composition-layer-marker-copy",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_solid_layer",
        "add_comp_marker",
        "get_comp_details",
        "add_layer_marker",
        "get_layer_details"
      ],
      expectedReadBack: {
        compositionLayerMarkerCopyReadBack: true,
        compName,
        layerName,
        compToLayerMarker,
        layerToCompMarker,
        compositionMarkerCount: 2,
        layerMarkerCount: 2
      },
      plan: {
        summary: "Generated-only live QA for copying composition markers to layer markers and layer markers to composition markers.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated marker copy comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 4, frameRate: 24, bgColor: [0.07, 0.08, 0.1], allowDuplicateName: false, openInViewer: true, comment: "generated-only composition/layer marker copy validation" } },
          { title: "Create generated marker copy layer", tool: "create_solid_layer", args: { compName, name: layerName, color: [0.18, 0.42, 0.78], width: 320, height: 180, startTime: 0, duration: 4 } },
          { title: "Seed generated composition marker", tool: "add_comp_marker", args: { compName, time: compToLayerMarker.time, comment: compToLayerMarker.comment, duration: compToLayerMarker.duration, expectedMarkerCountBefore: 0 } },
          { title: "Read generated composition marker evidence", tool: "get_comp_details", args: { compName, includeLayers: true, includeMarkers: true, markerLimit: 10 } },
          { title: "Copy reviewed composition marker to layer marker", tool: "add_layer_marker", args: { compName, layerIndex: 1, time: compToLayerMarker.time, comment: compToLayerMarker.comment, duration: compToLayerMarker.duration } },
          { title: "Read copied layer marker evidence", tool: "get_layer_details", args: { compName, layerIndex: 1 } },
          { title: "Seed generated layer marker for reverse copy", tool: "add_layer_marker", args: { compName, layerIndex: 1, time: layerToCompMarker.time, comment: layerToCompMarker.comment, duration: layerToCompMarker.duration } },
          { title: "Read source layer marker evidence", tool: "get_layer_details", args: { compName, layerIndex: 1 } },
          { title: "Copy reviewed layer marker to composition marker", tool: "add_comp_marker", args: { compName, time: layerToCompMarker.time, comment: layerToCompMarker.comment, duration: layerToCompMarker.duration, expectedMarkerCountBefore: 1 } },
          { title: "Read copied composition marker evidence", tool: "get_comp_details", args: { compName, includeLayers: false, includeMarkers: true, markerLimit: 10 } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentCompositionMarkerAddScenarioPlans(runPrefix) {
  const base = `${runPrefix} Composition Marker Add`;
  const compName = `${base} Comp`;
  const layerName = `${base} Out Point Solid`;
  const outPointMarker = {
    time: 3,
    comment: "Layer Out Point",
    duration: 0
  };
  const workAreaStartMarker = {
    time: 0,
    comment: "Work Area Start",
    duration: 0
  };
  const workAreaEndMarker = {
    time: 4,
    comment: "Work Area End",
    duration: 0
  };

  return [
    {
      id: "generated-composition-marker-add",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_solid_layer",
        "get_comp_details",
        "add_comp_marker"
      ],
      expectedReadBack: {
        compositionMarkerReadBack: true,
        compositionMarkerAddReadBack: true,
        compName,
        layerName,
        markerCount: 3,
        orderedBy: "comp.markerProperty.keyTime",
        markers: [
          workAreaStartMarker,
          outPointMarker,
          workAreaEndMarker
        ]
      },
      plan: {
        summary: "Generated-only live QA for adding composition markers at layer out points and work-area boundaries.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated composition marker add comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 4, frameRate: 24, bgColor: [0.07, 0.08, 0.1], allowDuplicateName: false, openInViewer: true, comment: "generated-only composition marker add validation" } },
          { title: "Create generated layer with reviewed out point", tool: "create_solid_layer", args: { compName, name: layerName, color: [0.25, 0.36, 0.78], width: 320, height: 180, startTime: 0.5, duration: 2.5 } },
          { title: "Read generated layer out-point and work-area evidence", tool: "get_comp_details", args: { compName, includeLayers: true, includeMarkers: true, markerLimit: 10 } },
          { title: "Add composition marker at reviewed work-area start", tool: "add_comp_marker", args: { compName, time: workAreaStartMarker.time, comment: workAreaStartMarker.comment, duration: workAreaStartMarker.duration, expectedMarkerCountBefore: 0 } },
          { title: "Add composition marker at reviewed layer out point", tool: "add_comp_marker", args: { compName, time: outPointMarker.time, comment: outPointMarker.comment, duration: outPointMarker.duration, expectedMarkerCountBefore: 1 } },
          { title: "Add composition marker at reviewed work-area end", tool: "add_comp_marker", args: { compName, time: workAreaEndMarker.time, comment: workAreaEndMarker.comment, duration: workAreaEndMarker.duration, expectedMarkerCountBefore: 2 } },
          { title: "Read generated composition marker add evidence", tool: "get_comp_details", args: { compName, includeLayers: true, includeMarkers: true, markerLimit: 10 } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentRemainingTailContractsScenarioPlans(runPrefix) {
  const base = `${runPrefix} Remaining Tail Contracts`;
  const cameraBase = `${base} Camera Controller`;
  const onionBase = `${base} Onion Skin`;
  const fillBase = `${base} Fill Keyframes`;
  const currentValueBase = `${base} Current Expression`;
  const spatialBase = `${base} Spatial Tangent`;
  const sizeBase = `${base} Separate Size`;
  const rectSizePath = [
    "ADBE Root Vectors Group",
    "Rectangle",
    "ADBE Vectors Group",
    "ADBE Vector Shape - Rect",
    "ADBE Vector Rect Size"
  ];
  const opacityPath = "ADBE Transform Group.ADBE Opacity";
  const positionPath = "ADBE Transform Group.ADBE Position";

  return [
    {
      id: "generated-camera-controller-rig",
      cleanupPrefix: cameraBase,
      expectedTools: [
        "create_comp",
        "create_camera_with_controller",
        "get_layer_details",
        "get_layer_details"
      ],
      expectedReadBack: {
        generatedCameraController: true,
        compName: `${cameraBase} Comp`,
        cameraName: `${cameraBase} Camera`,
        controllerName: `${cameraBase} Controller`,
        cameraZoom: 650
      },
      plan: {
        summary: "AE_AGENT_QA_099 generated-only live QA for a camera parented to a 3D null controller.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated camera-controller comp", tool: "create_comp", args: { name: `${cameraBase} Comp`, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.05, 0.07, 0.09], allowDuplicateName: false, openInViewer: true, comment: "AE_AGENT_QA_099 generated-only camera controller validation" } },
          { title: "Create generated camera with controller", tool: "create_camera_with_controller", args: { compName: `${cameraBase} Comp`, cameraName: `${cameraBase} Camera`, controllerName: `${cameraBase} Controller`, pointOfInterest: [320, 180, 0], cameraPosition: [0, 0, -888.8889], zoom: 650, startTime: 0, duration: 3, separateControllerPositionDimensions: true } },
          { title: "Read generated camera parent", tool: "get_layer_details", args: { compName: `${cameraBase} Comp`, includeProperties: false }, resultBindings: { layerIndex: "{{steps.2.cameraLayer.index}}" } },
          { title: "Read generated controller state", tool: "get_layer_details", args: { compName: `${cameraBase} Comp`, includeProperties: true, propertyDepth: 2, propertyLimit: 80, includeValues: true }, resultBindings: { layerIndex: "{{steps.2.controllerLayer.index}}" } }
        ]
      }
    },
    {
      id: "generated-onion-skinning-wide-time",
      cleanupPrefix: onionBase,
      expectedTools: [
        "create_comp",
        "toggle_onion_skinning",
        "get_layer_details",
        "get_effect_details"
      ],
      expectedReadBack: {
        generatedOnionSkinning: true,
        compName: `${onionBase} Comp`,
        layerName: "Onion Skin",
        effectName: "Onion Skin"
      },
      plan: {
        summary: "AE_AGENT_QA_099 generated-only live QA for CC Wide Time onion skinning.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated onion-skin comp", tool: "create_comp", args: { name: `${onionBase} Comp`, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.03, 0.04, 0.06], allowDuplicateName: false, openInViewer: true, comment: "AE_AGENT_QA_099 generated-only onion skin validation" } },
          { title: "Enable generated onion skinning", tool: "toggle_onion_skinning", args: { compName: `${onionBase} Comp`, mode: "enable", layerName: "Onion Skin", effectName: "Onion Skin" } },
          { title: "Read generated onion skin layer", tool: "get_layer_details", args: { compName: `${onionBase} Comp`, includeProperties: false }, resultBindings: { layerIndex: "{{steps.2.layer.index}}" } },
          { title: "Read generated CC Wide Time effect", tool: "get_effect_details", args: { compName: `${onionBase} Comp`, effectName: "Onion Skin", includeProperties: true, includeValues: true }, resultBindings: { layerIndex: "{{steps.2.layer.index}}" } }
        ]
      }
    },
    {
      id: "generated-fill-in-keyframes",
      cleanupPrefix: fillBase,
      expectedTools: [
        "create_comp",
        "create_shape_layer",
        "set_expression",
        "fill_in_keyframes",
        "get_layer_details"
      ],
      expectedReadBack: {
        generatedFillInKeyframes: true,
        compName: `${fillBase} Comp`,
        layerName: `${fillBase} Shape`,
        propertyPath: ["ADBE Transform Group", "ADBE Opacity"],
        minKeyframeCount: 3
      },
      plan: {
        summary: "AE_AGENT_QA_099 generated-only live QA for expression fill-in keyframes with redundant-key removal.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated fill-keyframes comp", tool: "create_comp", args: { name: `${fillBase} Comp`, width: 640, height: 360, pixelAspect: 1, duration: 2, frameRate: 24, bgColor: [0.06, 0.06, 0.08], allowDuplicateName: false, openInViewer: true, comment: "AE_AGENT_QA_099 generated-only fill keyframes validation" } },
          { title: "Create generated fill-keyframes shape", tool: "create_shape_layer", args: { compName: `${fillBase} Comp`, name: `${fillBase} Shape`, shape: "rectangle", size: [220, 120], position: [320, 180], fillColor: [0.25, 0.55, 0.9], strokeColor: [1, 1, 1], strokeWidth: 2, duration: 2 } },
          { title: "Set generated stepped opacity expression", tool: "set_expression", args: { compName: `${fillBase} Comp`, layerIndex: 1, propertyPath: opacityPath, expression: "time < 1 ? 20 : 80", enabled: true } },
          { title: "Fill generated expression into keyframes", tool: "fill_in_keyframes", args: { compName: `${fillBase} Comp`, layerIndex: 1, propertyPath: opacityPath, startTime: 0, endTime: 2, sampleEveryFrames: 12, removeRedundant: true, clearExpression: true } },
          { title: "Read generated filled keyframes", tool: "get_layer_details", args: { compName: `${fillBase} Comp`, layerIndex: 1, includeProperties: true, propertyDepth: 2, propertyLimit: 80, includeValues: true, includeExpressions: true } }
        ]
      }
    },
    {
      id: "generated-current-expression-keyframe",
      cleanupPrefix: currentValueBase,
      expectedTools: [
        "create_comp",
        "create_shape_layer",
        "set_expression",
        "keyframe_current_value_from_expression",
        "get_layer_details"
      ],
      expectedReadBack: {
        generatedCurrentExpressionKeyframe: true,
        compName: `${currentValueBase} Comp`,
        layerName: `${currentValueBase} Shape`,
        propertyPath: ["ADBE Transform Group", "ADBE Opacity"],
        keyframeTime: 1.25,
        keyframeValue: 60
      },
      plan: {
        summary: "AE_AGENT_QA_099 generated-only live QA for keyframing the current post-expression value.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated current-expression comp", tool: "create_comp", args: { name: `${currentValueBase} Comp`, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.07, 0.06, 0.05], allowDuplicateName: false, openInViewer: true, comment: "AE_AGENT_QA_099 generated-only current expression validation" } },
          { title: "Create generated current-expression shape", tool: "create_shape_layer", args: { compName: `${currentValueBase} Comp`, name: `${currentValueBase} Shape`, shape: "rectangle", size: [220, 120], position: [320, 180], fillColor: [0.82, 0.52, 0.24], strokeColor: [1, 1, 1], strokeWidth: 2, duration: 3 } },
          { title: "Set generated opacity expression", tool: "set_expression", args: { compName: `${currentValueBase} Comp`, layerIndex: 1, propertyPath: opacityPath, expression: "time * 40 + 10", enabled: true } },
          { title: "Keyframe generated current expression value", tool: "keyframe_current_value_from_expression", args: { compName: `${currentValueBase} Comp`, layerIndex: 1, propertyPath: opacityPath, time: 1.25, requireExpression: true } },
          { title: "Read generated expression keyframe", tool: "get_layer_details", args: { compName: `${currentValueBase} Comp`, layerIndex: 1, includeProperties: true, propertyDepth: 2, propertyLimit: 80, includeValues: true, includeExpressions: true } }
        ]
      }
    },
    {
      id: "generated-spatial-in-tangent",
      cleanupPrefix: spatialBase,
      expectedTools: [
        "create_comp",
        "create_shape_layer",
        "set_property_keyframes",
        "set_spatial_in_tangent",
        "get_layer_details"
      ],
      expectedReadBack: {
        generatedSpatialInTangent: true,
        compName: `${spatialBase} Comp`,
        layerName: `${spatialBase} Shape`,
        propertyPath: ["ADBE Transform Group", "ADBE Position"],
        keyIndex: 2,
        inSpatialTangent: [-100, -50]
      },
      plan: {
        summary: "AE_AGENT_QA_099 generated-only live QA for setting a spatial in tangent from previous keyframe distance.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated spatial-tangent comp", tool: "create_comp", args: { name: `${spatialBase} Comp`, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.04, 0.07, 0.06], allowDuplicateName: false, openInViewer: true, comment: "AE_AGENT_QA_099 generated-only spatial tangent validation" } },
          { title: "Create generated spatial-tangent shape", tool: "create_shape_layer", args: { compName: `${spatialBase} Comp`, name: `${spatialBase} Shape`, shape: "rectangle", size: [120, 80], position: [120, 120], fillColor: [0.35, 0.8, 0.55], strokeColor: [1, 1, 1], strokeWidth: 2, duration: 3 } },
          { title: "Set generated position keyframes", tool: "set_property_keyframes", args: { compName: `${spatialBase} Comp`, layerIndex: 1, propertyPath: positionPath, clearExisting: true, keyframes: [{ time: 0, value: [100, 100] }, { time: 1, value: [300, 200] }, { time: 2, value: [420, 260] }] } },
          { title: "Set generated spatial in tangent", tool: "set_spatial_in_tangent", args: { compName: `${spatialBase} Comp`, layerIndex: 1, propertyPath: positionPath, keyIndex: 2, factor: 0.5 } },
          { title: "Read generated spatial tangent", tool: "get_layer_details", args: { compName: `${spatialBase} Comp`, layerIndex: 1, includeProperties: true, propertyDepth: 2, propertyLimit: 80, includeValues: true, includeExpressions: true } }
        ]
      }
    },
    {
      id: "generated-separate-shape-size-dimensions",
      cleanupPrefix: sizeBase,
      expectedTools: [
        "create_comp",
        "create_shape_layer",
        "separate_shape_size_dimensions",
        "get_layer_details"
      ],
      expectedReadBack: {
        generatedSeparateShapeSizeDimensions: true,
        compName: `${sizeBase} Comp`,
        layerName: `${sizeBase} Shape`,
        propertyPath: rectSizePath,
        xSliderName: "X Size",
        ySliderName: "Y Size"
      },
      plan: {
        summary: "AE_AGENT_QA_099 generated-only live QA for separating rectangle size dimensions with sliders.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated separate-size comp", tool: "create_comp", args: { name: `${sizeBase} Comp`, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.06, 0.05, 0.07], allowDuplicateName: false, openInViewer: true, comment: "AE_AGENT_QA_099 generated-only separate size validation" } },
          { title: "Create generated separate-size shape", tool: "create_shape_layer", args: { compName: `${sizeBase} Comp`, name: `${sizeBase} Shape`, shape: "rectangle", size: [240, 120], position: [320, 180], fillColor: [0.66, 0.42, 0.86], strokeColor: [1, 1, 1], strokeWidth: 2, duration: 3 } },
          { title: "Separate generated shape size dimensions", tool: "separate_shape_size_dimensions", args: { compName: `${sizeBase} Comp`, layerIndex: 1, propertyPath: rectSizePath, xSliderName: "X Size", ySliderName: "Y Size" } },
          { title: "Read generated separate-size expression", tool: "get_layer_details", args: { compName: `${sizeBase} Comp`, layerIndex: 1, includeProperties: true, propertyDepth: 4, propertyLimit: 160, includeValues: true, includeExpressions: true } }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentAssortedCompositionGuidesScenarioPlans(runPrefix) {
  const base = `${runPrefix} Assorted Guides`;
  const compName = `${base} Comp`;
  const effectName = `${base} Fill Effect`;
  const guideSpecs = [
    {
      key: "edges",
      name: `${base} Edge Frame`,
      size: [800, 450],
      position: [400, 225],
      fillColor: [0.02, 0.02, 0.02],
      strokeColor: [1, 0.9, 0.15],
      strokeWidth: 4
    },
    {
      key: "centerVertical",
      name: `${base} Center Vertical`,
      size: [4, 450],
      position: [400, 225],
      fillColor: [0.2, 0.7, 1],
      strokeColor: [0.2, 0.7, 1],
      strokeWidth: 0
    },
    {
      key: "centerHorizontal",
      name: `${base} Center Horizontal`,
      size: [800, 4],
      position: [400, 225],
      fillColor: [0.2, 0.7, 1],
      strokeColor: [0.2, 0.7, 1],
      strokeWidth: 0
    },
    {
      key: "actionSafe",
      name: `${base} Action Safe Frame`,
      size: [720, 405],
      position: [400, 225],
      fillColor: [0.02, 0.08, 0.04],
      strokeColor: [0.35, 1, 0.45],
      strokeWidth: 3
    },
    {
      key: "titleSafe",
      name: `${base} Title Safe Frame`,
      size: [640, 360],
      position: [400, 225],
      fillColor: [0.06, 0.04, 0.12],
      strokeColor: [0.85, 0.55, 1],
      strokeWidth: 3
    }
  ];

  return [
    {
      id: "generated-assorted-composition-guides",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_shape_layer",
        "add_effect",
        "get_comp_details",
        "get_layer_details"
      ],
      expectedReadBack: {
        assortedCompositionGuides: true,
        compName,
        layerCountAfter: guideSpecs.length,
        guideSpecs: guideSpecs.map((guide) => ({
          key: guide.key,
          name: guide.name,
          size: guide.size,
          position: guide.position
        })),
        effectLayerName: guideSpecs[guideSpecs.length - 1].name,
        effectName,
        effectMatchName: "ADBE Fill"
      },
      plan: {
        summary: "AE_AGENT_QA_039 generated-only live QA for assorted composition guide overlay layers.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          {
            title: "Create generated assorted guides comp",
            tool: "create_comp",
            args: {
              name: compName,
              width: 800,
              height: 450,
              pixelAspect: 1,
              duration: 3,
              frameRate: 24,
              bgColor: [0.08, 0.09, 0.1],
              allowDuplicateName: false,
              openInViewer: false,
              comment: "AE_AGENT_QA_039 generated-only assorted composition guide overlay validation"
            }
          },
          ...guideSpecs.map((guide) => ({
            title: `Create generated ${guide.key} guide overlay`,
            tool: "create_shape_layer",
            args: {
              compName,
              name: guide.name,
              shape: "rectangle",
              size: guide.size,
              position: guide.position,
              fillColor: guide.fillColor,
              strokeColor: guide.strokeColor,
              strokeWidth: guide.strokeWidth,
              startTime: 0,
              duration: 3
            }
          })),
          {
            title: "Add generated guide color effect",
            tool: "add_effect",
            args: {
              compName,
              effect: "ADBE Fill",
              name: effectName
            },
            resultBindings: {
              layerIndex: "{{steps.6.layer.index}}"
            }
          },
          {
            title: "Read generated guide overlay layer stack",
            tool: "get_comp_details",
            args: {
              compName,
              includeLayers: true,
              layerLimit: 20
            }
          },
          {
            title: "Read generated guide effect layer",
            tool: "get_layer_details",
            args: {
              compName,
              includeProperties: false
            },
            resultBindings: {
              layerIndex: "{{steps.6.layer.index}}"
            }
          }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentCompositionGuideScenarioPlans(runPrefix) {
  const base = `${runPrefix} Composition Guide`;
  const compName = `${base} Comp`;
  const guideName = `${base} Overlay`;

  return [
    {
      id: "generated-composition-guide",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_shape_layer",
        "get_comp_details",
        "get_layer_details"
      ],
      expectedReadBack: {
        generatedCompositionGuide: true,
        compName,
        guideName,
        layerCountAfter: 1,
        guideSize: [1260, 720],
        guidePosition: [640, 360],
        strokeColor: [1, 0, 1],
        strokeWidth: 20
      },
      plan: {
        summary: "AE_AGENT_QA_043 generated-only live QA for a generated composition guide overlay.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          {
            title: "Create generated composition guide QA comp",
            tool: "create_comp",
            args: {
              name: compName,
              width: 1280,
              height: 720,
              pixelAspect: 1,
              duration: 3,
              frameRate: 24,
              bgColor: [0.04, 0.04, 0.05],
              allowDuplicateName: false,
              openInViewer: false,
              comment: "AE_AGENT_QA_043 generated-only composition guide overlay validation"
            }
          },
          {
            title: "Create generated composition guide overlay",
            tool: "create_shape_layer",
            args: {
              compName,
              name: guideName,
              shape: "rectangle",
              size: [1260, 720],
              position: [640, 360],
              fillColor: [0.02, 0, 0.02],
              strokeColor: [1, 0, 1],
              strokeWidth: 20,
              startTime: 0,
              duration: 3
            }
          },
          {
            title: "Read generated composition guide comp",
            tool: "get_comp_details",
            args: {
              compName,
              includeLayers: true,
              layerLimit: 10
            }
          },
          {
            title: "Read generated composition guide layer",
            tool: "get_layer_details",
            args: {
              compName,
              includeProperties: false
            },
            resultBindings: {
              layerIndex: "{{steps.2.layer.index}}"
            }
          }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentBackgroundLayerScenarioPlans(runPrefix) {
  const base = `${runPrefix} Background Layer`;
  const compName = `${base} Comp`;
  const backgroundName = `${base} Background`;
  const foregroundName = `${base} Foreground`;
  const effectName = `${base} Fill Effect`;

  return [
    {
      id: "generated-background-layer",
      cleanupPrefix: base,
      expectedTools: [
        "create_comp",
        "create_shape_layer",
        "add_effect",
        "get_comp_details",
        "get_layer_details"
      ],
      expectedReadBack: {
        generatedBackgroundLayer: true,
        compName,
        backgroundName,
        foregroundName,
        layerCountAfter: 2,
        backgroundIndexAfter: 2,
        foregroundIndexAfter: 1,
        backgroundSize: [640, 360],
        backgroundPosition: [320, 180],
        effectName,
        effectMatchName: "ADBE Fill"
      },
      plan: {
        summary: "AE_AGENT_QA_041 generated-only live QA for adding a generated full-comp background layer.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          {
            title: "Create generated background QA comp",
            tool: "create_comp",
            args: {
              name: compName,
              width: 640,
              height: 360,
              pixelAspect: 1,
              duration: 3,
              frameRate: 24,
              bgColor: [0.06, 0.07, 0.08],
              allowDuplicateName: false,
              openInViewer: false,
              comment: "AE_AGENT_QA_041 generated-only background layer validation"
            }
          },
          {
            title: "Create generated full-comp background layer",
            tool: "create_shape_layer",
            args: {
              compName,
              name: backgroundName,
              shape: "rectangle",
              size: [640, 360],
              position: [320, 180],
              fillColor: [0.18, 0.2, 0.24],
              strokeColor: [0.18, 0.2, 0.24],
              strokeWidth: 0,
              startTime: 0,
              duration: 3
            }
          },
          {
            title: "Add generated background fill effect",
            tool: "add_effect",
            args: {
              compName,
              effect: "ADBE Fill",
              name: effectName
            },
            resultBindings: {
              layerIndex: "{{steps.2.layer.index}}"
            }
          },
          {
            title: "Create generated foreground proof layer",
            tool: "create_shape_layer",
            args: {
              compName,
              name: foregroundName,
              shape: "rectangle",
              size: [220, 120],
              position: [320, 180],
              fillColor: [0.86, 0.42, 0.2],
              strokeColor: [1, 1, 1],
              strokeWidth: 3,
              startTime: 0,
              duration: 3
            }
          },
          {
            title: "Read generated background layer stack",
            tool: "get_comp_details",
            args: {
              compName,
              includeLayers: true,
              layerLimit: 10
            }
          },
          {
            title: "Read generated background effect layer",
            tool: "get_layer_details",
            args: {
              compName,
              layerIndex: 2,
              includeProperties: false
            }
          }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function agentManualTypedToolsScenarioPlans(runPrefix) {
  const base = `${runPrefix} Manual Typed Tools`;
  const folderBase = `${base} Folder Move`;
  const markerBase = `${base} Marker`;
  const searchBase = `${base} Exact Search`;
  const duplicateBase = `${base} Duplicate Layers`;
  const cameraBase = `${base} Camera`;
  const folderName = `${folderBase} Folder`;
  const folderCompName = `${folderBase} Comp`;
  const markerCompName = `${markerBase} Comp`;
  const markerLayerName = `${markerBase} Solid`;
  const markerComment = `${markerBase} Marker`;
  const searchCompName = `${searchBase} Comp`;
  const duplicateCompName = `${duplicateBase} Comp`;
  const duplicateLayerAName = `${duplicateBase} Source A`;
  const duplicateLayerBName = `${duplicateBase} Source B`;
  const duplicateAName = `${duplicateLayerAName} Copy`;
  const duplicateBName = `${duplicateLayerBName} Copy`;
  const cameraCompName = `${cameraBase} Comp`;
  const cameraName = `${cameraBase} Camera`;

  return [
    {
      id: "manual-folder-move-from-reference-layout",
      cleanupPrefix: folderBase,
      promptFamily: "screenshot-openai-cli-agent-folder-setup",
      expectedTools: [
        "create_project_folder",
        "create_comp",
        "move_project_items_to_folder",
        "list_project_folder_items",
        "find_project_items"
      ],
      expectedReadBack: {
        folderMove: true,
        folderName,
        compName: folderCompName
      },
      plan: {
        summary: "M219 manual folder organization live QA on generated assets.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          {
            title: "Create generated manual folder",
            tool: "create_project_folder",
            args: {
              name: folderName,
              allowExisting: false
            }
          },
          {
            title: "Create generated manual folder comp",
            tool: "create_comp",
            args: {
              name: folderCompName,
              width: 640,
              height: 360,
              pixelAspect: 1,
              duration: 2,
              frameRate: 24,
              bgColor: [0.08, 0.1, 0.12],
              allowDuplicateName: false,
              openInViewer: false,
              comment: "M219 generated-only manual typed-tools folder validation"
            }
          },
          {
            title: "Move generated comp into generated folder",
            tool: "move_project_items_to_folder",
            args: {
              targetFolderName: folderName
            },
            resultBindings: {
              itemIndices: "{{steps.2.itemIndex}}"
            }
          },
          {
            title: "Read generated folder contents",
            tool: "list_project_folder_items",
            args: {
              folderName,
              recursive: false,
              type: "comp",
              limit: 10
            }
          },
          {
            title: "Read generated folder comp summary",
            tool: "find_project_items",
            args: {
              query: folderCompName,
              type: "comp",
              exactName: true,
              caseSensitive: true,
              limit: 1
            }
          }
        ]
      }
    },
    {
      id: "manual-marker-comp-binding-from-dakkshin-intake",
      cleanupPrefix: markerBase,
      promptFamily: "dakkshin-marker-lifecycle-manual-panel",
      expectedTools: [
        "create_comp",
        "create_solid_layer",
        "add_layer_marker",
        "get_layer_details"
      ],
      expectedReadBack: {
        markerReadBack: true,
        compName: markerCompName,
        layerName: markerLayerName,
        markerComment,
        markerTime: 1,
        markerDuration: 0.25
      },
      plan: {
        summary: "M219 manual marker add live QA on generated assets.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          {
            title: "Create generated marker comp",
            tool: "create_comp",
            args: {
              name: markerCompName,
              width: 640,
              height: 360,
              pixelAspect: 1,
              duration: 3,
              frameRate: 24,
              bgColor: [0.08, 0.1, 0.12],
              allowDuplicateName: false,
              openInViewer: false,
              comment: "M219 generated-only manual typed-tools marker validation"
            }
          },
          {
            title: "Create generated marker target layer",
            tool: "create_solid_layer",
            args: {
              compName: markerCompName,
              name: markerLayerName,
              color: [0.24, 0.54, 0.82],
              width: 640,
              height: 360,
              pixelAspect: 1,
              startTime: 0,
              duration: 3
            }
          },
          {
            title: "Add generated marker",
            tool: "add_layer_marker",
            args: {
              compName: markerCompName,
              layerIndex: 1,
              time: 1,
              comment: markerComment,
              duration: 0.25
            }
          },
          {
            title: "Read generated marker details",
            tool: "get_layer_details",
            args: {
              compName: markerCompName,
              layerIndex: 1,
              includeProperties: false
            }
          }
        ]
      }
    },
    {
      id: "manual-exact-name-project-search",
      cleanupPrefix: searchBase,
      promptFamily: "screenshot-openai-api-without-key-project-search",
      expectedTools: [
        "create_comp",
        "find_project_items"
      ],
      expectedReadBack: {
        exactProjectItemSearch: true,
        compName: searchCompName
      },
      plan: {
        summary: "M219 manual exact-name project search live QA on generated assets.",
        risk: "low",
        requiresCheckpoint: true,
        steps: [
          {
            title: "Create generated exact-search comp",
            tool: "create_comp",
            args: {
              name: searchCompName,
              width: 640,
              height: 360,
              pixelAspect: 1,
              duration: 2,
              frameRate: 24,
              bgColor: [0.08, 0.1, 0.12],
              allowDuplicateName: false,
              openInViewer: false,
              comment: "M219 generated-only manual typed-tools exact search validation"
            }
          },
          {
            title: "Find generated comp by exact name",
            tool: "find_project_items",
            args: {
              query: searchCompName,
              exactName: true,
              type: "comp",
              caseSensitive: true,
              limit: 1
            }
          }
        ]
      }
    },
    {
      id: "manual-focused-chat-duplicate-layers-order",
      cleanupPrefix: duplicateBase,
      promptFamily: "screenshot-focused-chat-duplicate-layers",
      expectedTools: [
        "create_comp",
        "create_solid_layer",
        "create_text_layer",
        "duplicate_layers",
        "get_comp_details"
      ],
      expectedReadBack: {
        compName: duplicateCompName,
        duplicateLayers: true,
        sourceNames: [duplicateLayerAName, duplicateLayerBName],
        duplicateNames: [duplicateAName, duplicateBName],
        layerCountAfter: 4
      },
      plan: {
        summary: "M219 manual duplicate_layers stack-order live QA on generated assets.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          {
            title: "Create generated duplicate manual comp",
            tool: "create_comp",
            args: {
              name: duplicateCompName,
              width: 640,
              height: 360,
              pixelAspect: 1,
              duration: 3,
              frameRate: 24,
              bgColor: [0.08, 0.1, 0.12],
              allowDuplicateName: false,
              openInViewer: false,
              comment: "M219 generated-only manual typed-tools duplicate validation"
            }
          },
          {
            title: "Create first generated duplicate source",
            tool: "create_solid_layer",
            args: {
              compName: duplicateCompName,
              name: duplicateLayerAName,
              color: [0.2, 0.52, 0.86],
              width: 240,
              height: 180,
              pixelAspect: 1,
              startTime: 0,
              duration: 3
            }
          },
          {
            title: "Create second generated duplicate source",
            tool: "create_text_layer",
            args: {
              compName: duplicateCompName,
              name: duplicateLayerBName,
              text: "M219 B",
              position: [320, 180],
              fontSize: 48,
              fillColor: [0.95, 0.95, 0.85],
              startTime: 0,
              duration: 3
            }
          },
          {
            title: "Duplicate generated manual source layers",
            tool: "duplicate_layers",
            args: {
              compName: duplicateCompName,
              layerIndices: [1, 2],
              sourceNames: [duplicateLayerBName, duplicateLayerAName],
              nameSuffix: " Copy"
            }
          },
          {
            title: "Read generated duplicate layer details",
            tool: "get_comp_details",
            args: {
              compName: duplicateCompName,
              includeLayers: true,
              layerLimit: 10
            }
          }
        ]
      }
    },
    {
      id: "manual-model-menu-camera-final-summary",
      cleanupPrefix: cameraBase,
      promptFamily: "screenshot-openai-cli-model-menu-camera",
      expectedTools: [
        "create_comp",
        "create_camera_layer",
        "get_layer_details"
      ],
      expectedReadBack: {
        cameraReadBack: true,
        compName: cameraCompName,
        cameraName,
        cameraZoom: 600
      },
      plan: {
        summary: "M219 manual camera final read-back live QA on generated assets.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          {
            title: "Create generated camera manual comp",
            tool: "create_comp",
            args: {
              name: cameraCompName,
              width: 640,
              height: 360,
              pixelAspect: 1,
              duration: 3,
              frameRate: 24,
              bgColor: [0.08, 0.1, 0.12],
              allowDuplicateName: false,
              openInViewer: false,
              comment: "M219 generated-only manual typed-tools camera validation"
            }
          },
          {
            title: "Create generated camera",
            tool: "create_camera_layer",
            args: {
              compName: cameraCompName,
              name: cameraName,
              pointOfInterest: [320, 180, 0],
              position: [320, 180, -900],
              zoom: 600,
              startTime: 0,
              duration: 3
            }
          },
          {
            title: "Read generated camera final summary",
            tool: "get_layer_details",
            args: {
              compName: cameraCompName,
              includeProperties: false
            },
            resultBindings: {
              layerIndex: "{{steps.2.layer.index}}"
            }
          }
        ]
      }
    }
  ].map((scenario) => ({
    ...scenario,
    expectedStepCount: scenario.plan.steps.length,
    expectedMutatingCount: expectedMutatingCount(scenario.plan),
    prompt: exactPlanPrompt(scenario.plan)
  }));
}

function buildAgentPlannerRegressionCorpus(options) {
  const config = options || {};
  const renderQueueBaselineTotal = Number.isFinite(Number(config.renderQueueBaselineTotal))
    ? Number(config.renderQueueBaselineTotal)
    : DEFAULT_RENDER_QUEUE_BASELINE_TOTAL;
  const runPrefix = config.runPrefix || DEFAULT_PLANNER_FIXTURE_PREFIX;
  const scenarios = agentScenarioPlans(runPrefix, renderQueueBaselineTotal);

  return {
    schema: "agent-planner-regression-corpus.v1",
    source: "accepted-live-agent-scenarios",
    fixturePrefix: runPrefix,
    renderQueueBaselineTotal,
    scenarios: scenarios.map((scenario) => ({
      id: scenario.id,
      cleanupPrefix: scenario.cleanupPrefix,
      prompt: scenario.prompt,
      expected: {
        stepCount: scenario.expectedStepCount,
        mutatingCount: scenario.expectedMutatingCount,
        tools: scenario.expectedTools.slice(),
        toolSequence: scenario.plan.steps.map((step) => step.tool),
        stepTitles: scenario.plan.steps.map((step) => step.title)
      },
      plan: scenario.plan
    }))
  };
}

module.exports = {
  AGENT_SCENARIO_MUTATING_TOOLS,
  DEFAULT_PLANNER_FIXTURE_PREFIX,
  DEFAULT_RENDER_QUEUE_BASELINE_TOTAL,
  agentAssortedCompositionGuidesScenarioPlans,
  agentBackgroundLayerScenarioPlans,
  agentCompositionRenameFileNameScenarioPlans,
  agentCompositionSaveFramePngScenarioPlans,
  agentCompositionVersionScenarioPlans,
  agentCompositionMarkerAddScenarioPlans,
  agentCompositionLayerMarkerCopyScenarioPlans,
  agentCompositionMarkerReadScenarioPlans,
  agentCompositionMarkerWorkAreaScenarioPlans,
  agentCompRefreshScenarioPlans,
  agentCompPropertiesScenarioPlans,
  agentCompCurrentTimeScenarioPlans,
  agentCompositionGuideScenarioPlans,
  agentDuplicateLayersScenarioPlans,
  agentDakkshinTypedToolsScenarioPlans,
  agentEffectPropertyScenarioPlans,
  agentEffectEnabledScenarioPlans,
  agentEssentialGraphicsScenarioPlans,
  agentExpressionScenarioPlans,
  agentEstimatePathLengthScenarioPlans,
  agentExportPathPointsScenarioPlans,
  agentExportTextToFileScenarioPlans,
  agentFlipPathGeometryScenarioPlans,
  agentKeyframeScenarioPlans,
  agentPathGeometryScenarioPlans,
  agentAdjustmentLayerPlacementScenarioPlans,
  agentLayerBlendingModeScenarioPlans,
  agentLayerConnectionLineScenarioPlans,
  agentLayerEnabledHardSoloScenarioPlans,
  agentGridRigControlReplacementScenarioPlans,
  agentLayerMetadataScenarioPlans,
  agentLayerParentBelowScenarioPlans,
  agentLayerParentClosestScenarioPlans,
  agentLayerSelectionScenarioPlans,
  agentLayerSwitchScenarioPlans,
  agentLayerTrackMatteScenarioPlans,
  agentLayerTimingScenarioPlans,
  agentLayerTransformScenarioPlans,
  agentLayerNameResetScenarioPlans,
  agentManualTypedToolsScenarioPlans,
  agentMaskSafetyScenarioPlans,
  agentMarkerLifecycleScenarioPlans,
  agentNewToolsScenarioPlans,
  agentParametricAnchorExpressionScenarioPlans,
  agentPuppetGuideLayerScenarioPlans,
  agentPuppetPinTypeScenarioPlans,
  agentPuppetOnTransparentScenarioPlans,
  agentParentOpacityExpressionScenarioPlans,
  agentPreserveNestedFrameRateScenarioPlans,
  agentProjectTimecodeStartFramesScenarioPlans,
  agentProjectItemMetadataScenarioPlans,
  agentProjectItemsScenarioPlans,
  agentProjectSelectionFolderScenarioPlans,
  agentResetImportedItemNamesScenarioPlans,
  agentRenameFindReplaceScenarioPlans,
  agentRemainingTailContractsScenarioPlans,
  agentRenderQueueScenarioPlans,
  agentResetWorkAreaScenarioPlans,
  agentSelectedPropertyValueScenarioPlans,
  agentSelectedKeyframeMarkerScenarioPlans,
  agentStickEffectExpressionScenarioPlans,
  agentTextShapesScenarioPlans,
  agentTextToKeysScenarioPlans,
  agentScenarioPlans,
  buildAgentPlannerRegressionCorpus,
  exactPlanPrompt,
  safeOutputName
};
