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
  "set_property_keyframes",
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
  agentDuplicateLayersScenarioPlans,
  agentDakkshinTypedToolsScenarioPlans,
  agentManualTypedToolsScenarioPlans,
  agentMaskSafetyScenarioPlans,
  agentMarkerLifecycleScenarioPlans,
  agentNewToolsScenarioPlans,
  agentResetWorkAreaScenarioPlans,
  agentScenarioPlans,
  buildAgentPlannerRegressionCorpus,
  exactPlanPrompt,
  safeOutputName
};
