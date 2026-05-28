"use strict";

const DEFAULT_PLANNER_FIXTURE_PREFIX = "Codex QA Planner Fixture";
const DEFAULT_RENDER_QUEUE_BASELINE_TOTAL = 0;

const AGENT_SCENARIO_MUTATING_TOOLS = new Set([
  "create_comp",
  "create_project_folder",
  "create_test_comp",
  "create_solid_layer",
  "create_text_layer",
  "create_camera_layer",
  "create_layer_mask",
  "move_project_items_to_folder",
  "set_comp_work_area",
  "set_layer_time_range",
  "stagger_layers",
  "align_layers_to_time",
  "split_layers_at_time",
  "update_text_layer",
  "create_shape_layer",
  "fit_layer_to_comp",
  "set_layer_transform",
  "set_property_value",
  "set_property_keyframes",
  "set_effect_property",
  "apply_keyframe_ease",
  "set_expression",
  "clear_expression",
  "duplicate_layer",
  "duplicate_layers",
  "delete_layer",
  "set_comp_properties",
  "set_layer_mask",
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
    "The JSON object below is the complete QA fixture. Keep the steps array length, order, titles, tool names, args, summary, risk, and requiresCheckpoint unchanged.",
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
  const renderOutput = `logs/${safeOutputName(renderBase)}.mov`;
  const renderOutputUpdated = `logs/${safeOutputName(renderBase)}-updated.mov`;

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
        summary: "AUX-026 generated-only live QA for resetting a generated comp work area to full duration.",
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
        summary: "AUX-032 generated-only live QA for rename_layers findReplace on generated layer names.",
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
              comment: "AUX-032 generated-only rename findReplace validation"
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
              text: "AUX-032 Alpha",
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
          { name: layerAName, layerIndex: 1, startTime: 0.5, inPoint: 0.5, outPoint: 3 },
          { name: layerBName, layerIndex: 2, startTime: 0.75, inPoint: 0.75, outPoint: 3.25 }
        ]
      },
      plan: {
        summary: "AUX-050 generated-only live QA for layer timing typed tools.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated layer timing comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 4, frameRate: 24, bgColor: [0.06, 0.08, 0.1], allowDuplicateName: false, openInViewer: false, comment: "AUX-050 generated-only layer timing validation" } },
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
        summary: "AUX-050 generated-only live QA for layer transform and fit typed tools.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated transform comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.08, 0.09, 0.12], allowDuplicateName: false, openInViewer: false, comment: "AUX-050 generated-only transform validation" } },
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
        summary: "AUX-050 generated-only live QA for project-item rename, folder, move, and source replacement typed tools.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated project-items main comp", tool: "create_comp", args: { name: mainCompName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.08, 0.1, 0.12], allowDuplicateName: false, openInViewer: false, comment: "AUX-050 generated-only project-items validation" } },
          { title: "Create generated project-items replacement comp", tool: "create_comp", args: { name: replacementName, width: 320, height: 180, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.1, 0.08, 0.14], allowDuplicateName: false, openInViewer: false, comment: "AUX-050 generated-only replacement source" } },
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
        summary: "AUX-050 generated-only live QA for effect property typed tools.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated effect-property comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.08, 0.08, 0.1], allowDuplicateName: false, openInViewer: false, comment: "AUX-050 generated-only effect property validation" } },
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
        summary: "AUX-061 generated-only live QA for expression set/clear typed tools.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated expression comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.08, 0.08, 0.1], allowDuplicateName: false, openInViewer: true, comment: "AUX-061 generated-only expression validation" } },
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
  const workArea = { start: 1.25, duration: 3.5 };

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
        summary: "AUX-061 generated-only live QA for explicit comp properties and work-area typed tools.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated comp-properties comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 4, frameRate: 24, bgColor: [0.04, 0.05, 0.07], allowDuplicateName: false, openInViewer: false, comment: "AUX-061 generated-only comp properties validation" } },
          { title: "Set generated comp properties", tool: "set_comp_properties", args: { compName, ...compProperties } },
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
        summary: "AUX-072 generated-only live QA for selected/generated layer property value edits.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Create generated selected-property comp", tool: "create_comp", args: { name: compName, width: 640, height: 360, pixelAspect: 1, duration: 3, frameRate: 24, bgColor: [0.07, 0.08, 0.1], allowDuplicateName: false, openInViewer: true, comment: "AUX-072 generated-only selected property value validation" } },
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
        summary: "AUX-039 generated-only live QA for assorted composition guide overlay layers.",
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
              comment: "AUX-039 generated-only assorted composition guide overlay validation"
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
        summary: "AUX-043 generated-only live QA for a generated composition guide overlay.",
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
              comment: "AUX-043 generated-only composition guide overlay validation"
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
        summary: "AUX-041 generated-only live QA for adding a generated full-comp background layer.",
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
              comment: "AUX-041 generated-only background layer validation"
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
  agentCompPropertiesScenarioPlans,
  agentCompositionGuideScenarioPlans,
  agentDuplicateLayersScenarioPlans,
  agentDakkshinTypedToolsScenarioPlans,
  agentEffectPropertyScenarioPlans,
  agentExpressionScenarioPlans,
  agentLayerTimingScenarioPlans,
  agentLayerTransformScenarioPlans,
  agentManualTypedToolsScenarioPlans,
  agentMaskSafetyScenarioPlans,
  agentMarkerLifecycleScenarioPlans,
  agentNewToolsScenarioPlans,
  agentProjectItemsScenarioPlans,
  agentRenameFindReplaceScenarioPlans,
  agentResetWorkAreaScenarioPlans,
  agentSelectedPropertyValueScenarioPlans,
  agentScenarioPlans,
  buildAgentPlannerRegressionCorpus,
  exactPlanPrompt,
  safeOutputName
};
