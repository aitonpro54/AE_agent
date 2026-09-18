#!/usr/bin/env node
"use strict";

const assert = require("assert");
const {validateToolInput} = require("../mcp-server/slideshow-tools");
const {AVLayer, FootageItem, LeafProperty, Project, key, owned, runPrepared} = require("./slideshow-vm-fixture");

const file = "C:\\synthetic\\runtime-regression.aep";
const prefix = "CODX_RT_";

function configure(project, root) {
  return runPrepared(validateToolInput("configure_slideshow_tree_audio", {
    expectedProjectFile: file,
    generatedPrefix: prefix,
    expectedRootCompName: root.name
  }), project);
}

function audit(project, root) {
  return runPrepared(validateToolInput("audit_slideshow_generated", {
    expectedProjectFile: file,
    generatedPrefix: prefix,
    expectedRootCompName: root.name,
    expectedDuration: root.duration,
    sourceFingerprints: []
  }), project);
}

function audioTree(name = "CODX_RT_ROOT") {
  const project = new Project(file);
  const media = project.add(new FootageItem("tone.wav", "C:\\synthetic\\tone.wav", 8, {hasVideo: false}));
  const leaf = owned(project.addComp("CODX_RT_LEAF", 320, 180, 1, 8, 30), prefix, name);
  leaf.addLayer(new AVLayer("tone", media));
  const root = owned(project.addComp(name, 1280, 720, 1, 8, 30), prefix, name);
  return {project, media, leaf, root};
}

// F06: sequential uses of one source are distinct audible intervals.
{
  const {project, leaf, root} = audioTree();
  const first = root.addLayer(new AVLayer("first", leaf));
  first.startTime = 0; first.inPoint = 0; first.outPoint = 4;
  const second = root.addLayer(new AVLayer("second", leaf));
  second.startTime = 4; second.inPoint = 4; second.outPoint = 8;
  const muted = root.addLayer(new AVLayer("muted", leaf));
  muted.audioEnabled = false;
  const result = configure(project, root);
  assert.strictEqual(first.audioEnabled, true);
  assert.strictEqual(second.audioEnabled, true);
  assert.strictEqual(muted.audioEnabled, false);
  assert.strictEqual(result.mutedDuplicatePaths, 0);
  assert(result.audioRoutes.some((row) => row.layerId === muted.id && row.action === "preserve_muted" && row.audioEnabledBefore === false && row.audioEnabledAfter === false));
}

// F06: overlapping layers with different sourceIn carry different audio and stay enabled.
{
  const {project, leaf, root} = audioTree("CODX_RT_SOURCE_IN_ROOT");
  const first = root.addLayer(new AVLayer("source zero", leaf));
  first.startTime = 0; first.inPoint = 0; first.outPoint = 4;
  const second = root.addLayer(new AVLayer("source two", leaf));
  second.startTime = -2; second.inPoint = 0; second.outPoint = 4;
  const result = configure(project, root);
  assert.strictEqual(first.audioEnabled, true);
  assert.strictEqual(second.audioEnabled, true);
  assert.strictEqual(result.mutedDuplicatePaths, 0);
  const after = audit(project, root);
  assert(!after.issues.some((issue) => issue.includes("duplicate_audible_path")));
  const mediaRow = after.details.layers.find((row) => row.sourceName === "tone.wav");
  assert(mediaRow && mediaRow.sourceItemId && mediaRow.hasAudio === true && mediaRow.hasVideo === false);
}

// F06: duplicate leaf audio routed through two different nested comps is detected.
{
  const {project, media, root} = audioTree("CODX_RT_NESTED_ROOT");
  const left = owned(project.addComp("CODX_RT_LEFT", 320, 180, 1, 8, 30), prefix, root.name);
  const right = owned(project.addComp("CODX_RT_RIGHT", 320, 180, 1, 8, 30), prefix, root.name);
  left.addLayer(new AVLayer("left tone", media));
  right.addLayer(new AVLayer("right tone", media));
  const leftRoute = root.addLayer(new AVLayer("left route", left));
  const rightRoute = root.addLayer(new AVLayer("right route", right));
  const result = configure(project, root);
  assert.strictEqual([leftRoute.audioEnabled, rightRoute.audioEnabled].filter(Boolean).length, 1);
  assert.strictEqual(result.mutedDuplicatePaths, 1);
  const nestedMuted = result.audioRoutes.find((row) => row.action === "mute_duplicate" && row.audioEnabledBefore === true && row.audioEnabledAfter === false);
  assert(nestedMuted && nestedMuted.audiblePaths.length === 1 && nestedMuted.audiblePaths[0].sourceItemId === media.id);
}

// F06: partial duplicate overlap cannot be removed with one switch and fails before write.
{
  const {project, leaf, root} = audioTree("CODX_RT_PARTIAL_ROOT");
  const first = root.addLayer(new AVLayer("first", leaf));
  first.startTime = 0; first.inPoint = 0; first.outPoint = 5;
  const second = root.addLayer(new AVLayer("second", leaf));
  second.startTime = 0; second.inPoint = 3; second.outPoint = 8;
  assert.throws(() => configure(project, root), /ambiguous_audible_overlap/);
  assert.strictEqual(first.audioEnabled, true);
  assert.strictEqual(second.audioEnabled, true);
}

// F07: the audit captures typed values and a stable full property identity.
// F06: a shared nested dependency must be evaluated before both of its parents.
{
  const {project,leaf,root}=audioTree("CODX_RT_DAG_ROOT");
  const left=owned(project.addComp("CODX_RT_DAG_LEFT",320,180,1,8,30),prefix,root.name);
  const right=owned(project.addComp("CODX_RT_DAG_RIGHT",320,180,1,8,30),prefix,root.name);
  left.addLayer(new AVLayer("shared-left",leaf));right.addLayer(new AVLayer("shared-right",leaf));
  const first=root.addLayer(new AVLayer("left",left)),second=root.addLayer(new AVLayer("right",right));
  const result=configure(project,root);
  assert.strictEqual([first.audioEnabled,second.audioEnabled].filter(Boolean).length,1,"Shared DAG must dedupe both real audible paths");
  assert.strictEqual(result.audioRoutes.filter(row=>row.compItemId===root.id).every(row=>row.audiblePaths.length===1),true);
}
{
  const project = new Project(file);
  const root = owned(project.addComp("CODX_RT_KEYS_ROOT", 1280, 720, 1, 4, 30), prefix, "CODX_RT_KEYS_ROOT");
  const scalar = new LeafProperty("Opacity", [key(1, 25)], {matchName: "ADBE Opacity", isSpatial: false});
  const vector = new LeafProperty("Position", [key(2, [10, 20])], {matchName: "ADBE Position"});
  root.addLayer(new AVLayer("Animated", null, [scalar, vector]));
  const result = audit(project, root);
  assert.deepStrictEqual(Array.from(result.details.keyMetadata, (row) => row.value.type), ["scalar", "vector"]);
  assert(result.details.keyMetadata.every((row) => Number.isFinite(row.compItemId) && Number.isFinite(row.layerId)));
  assert(result.details.keyMetadata.every((row) => typeof row.propertyIdentity === "string" && row.propertyIdentity.includes("/property:")));
  assert(result.details.keyMetadata.every((row) => Array.isArray(row.propertyPath) && row.propertyPath.length === 1));
}

// F07: unsupported key values are rejected across the whole tree before any duration write.
{
  const project = new Project(file);
  const root = owned(project.addComp("CODX_RT_UNSUPPORTED_ROOT", 1280, 720, 1, 4, 30), prefix, "CODX_RT_UNSUPPORTED_ROOT");
  const validChild = owned(project.addComp("CODX_RT_VALID_CHILD", 320, 180, 1, 4, 30), prefix, root.name);
  validChild.addLayer(new AVLayer("Valid", null, [new LeafProperty("Opacity", [key(3, 25)], {matchName: "ADBE Opacity", isSpatial: false})]));
  const invalidChild = owned(project.addComp("CODX_RT_INVALID_CHILD", 320, 180, 1, 4, 30), prefix, root.name);
  invalidChild.addLayer(new AVLayer("Unsupported", null, [new LeafProperty("Custom", [key(3, {unsafe: true})], {matchName: "ADBE Custom", isSpatial: false})]));
  root.addLayer(new AVLayer("valid child", validChild));
  root.addLayer(new AVLayer("invalid child", invalidChild));
  const before = [root.duration, validChild.duration, invalidChild.duration];
  const prepared = validateToolInput("extend_slideshow_cloned_tree", {expectedProjectFile: file, generatedPrefix: prefix, expectedRootCompName: root.name, targetDuration: 6, introDuration: 2});
  assert.throws(() => runPrepared(prepared, project), /unsupported_key_value/);
  assert.deepStrictEqual([root.duration, validChild.duration, invalidChild.duration], before);
}

// F12: a requested replacement that is absent is rejected before any expression write.
{
  const project = new Project(file);
  project.addComp("CODX_RT_MASTER", 1280, 720, 1, 4, 30);
  project.addComp("CODX_RT_OTHER", 1280, 720, 1, 4, 30);
  const root = owned(project.addComp("CODX_RT_EXPR_ROOT", 1280, 720, 1, 4, 30), prefix, "CODX_RT_EXPR_ROOT");
  root.comment += "|SOURCE:" + encodeURIComponent("OriginalRoot");
  const expression = new LeafProperty("Opacity", [], {matchName: "ADBE Opacity", canSetExpression: true, expression: "comp(\"Untouched\").layer(1).opacity", isSpatial: false});
  root.addLayer(new AVLayer("Expression", null, [expression]));
  const prepared = validateToolInput("rewrite_slideshow_tree_expressions", {expectedProjectFile: file, generatedPrefix: prefix, expectedRootCompName: root.name, masterCompName: "CODX_RT_MASTER", replacements: [{from: "OriginalOther", to: "CODX_RT_OTHER"}]});
  assert.throws(() => runPrepared(prepared, project), /requested_expression_source_missing/);
  assert.strictEqual(expression.expression, "comp(\"Untouched\").layer(1).opacity");
}

// F12: every applied replacement has before/after proof tied to stable property identity.
{
  const project = new Project(file);
  project.addComp("CODX_RT_MASTER", 1280, 720, 1, 4, 30);
  project.addComp("CODX_RT_OTHER", 1280, 720, 1, 4, 30);
  const root = owned(project.addComp("CODX_RT_EXPR_OK_ROOT", 1280, 720, 1, 4, 30), prefix, "CODX_RT_EXPR_OK_ROOT");
  root.comment += "|SOURCE:" + encodeURIComponent("OriginalRoot");
  const expression = new LeafProperty("Opacity", [], {matchName: "ADBE Opacity", canSetExpression: true, expression: "comp(\"Final Comp\").layer(1).opacity + comp('OriginalOther').layer(1).opacity", isSpatial: false});
  root.addLayer(new AVLayer("Expression", null, [expression]));
  const result = runPrepared(validateToolInput("rewrite_slideshow_tree_expressions", {expectedProjectFile: file, generatedPrefix: prefix, expectedRootCompName: root.name, masterCompName: "CODX_RT_MASTER", replacements: [{from: "OriginalOther", to: "CODX_RT_OTHER"}]}), project);
  assert.strictEqual(result.postVerification.replacementsProven, true);
  const requested = result.expressionReplacements.find((row) => row.kind === "requested" && row.from === "OriginalOther");
  assert(requested && requested.occurrencesBefore === 1 && requested.occurrencesAfter === 0);
  assert(requested.changedProperties.length === 1);
  assert(requested.changedProperties[0].propertyIdentity.includes("/property:"));
  assert.strictEqual(expression.expression, "comp(\"CODX_RT_MASTER\").layer(1).opacity + comp(\"CODX_RT_OTHER\").layer(1).opacity");
  const after = audit(project, root);
  assert(after.details.expressions.every((row) => Number.isFinite(row.compItemId) && Number.isFinite(row.layerId) && row.propertyIdentity));
  assert.deepStrictEqual(Array.from(after.details.expressionProvenance, (row) => [row.comp, row.compItemId, row.sourceName]), [[root.name, root.id, "OriginalRoot"]]);
}

// Unsupported comp-reference grammar must not silently remain in a derived mapping.
for(const source of ['comp ("OriginalRoot").layer(1).opacity','comp("Original" + "Root").layer(1).opacity']) {
  const project=new Project(file);
  project.addComp("CODX_RT_MASTER",1280,720,1,4,30);
  const root=owned(project.addComp("CODX_RT_EXPR_GRAMMAR",1280,720,1,4,30),prefix,"CODX_RT_EXPR_GRAMMAR");
  root.comment+="|SOURCE:OriginalRoot";
  const expression=new LeafProperty("Opacity",[],{matchName:"ADBE Opacity",canSetExpression:true,expression:source,isSpatial:false});
  root.addLayer(new AVLayer("Expression",null,[expression]));
  assert.throws(()=>runPrepared(validateToolInput("rewrite_slideshow_tree_expressions",{expectedProjectFile:file,generatedPrefix:prefix,expectedRootCompName:root.name,masterCompName:"CODX_RT_MASTER",replacements:[]}),project),/unsupported_expression_comp_reference/);
  assert.strictEqual(expression.expression,source);
}
process.stdout.write(`${JSON.stringify({ok: true, cases: ["F06-sequential", "F06-sourceIn", "F06-nested", "F06-shared-DAG", "F06-partial-fail-before-write", "F07-key-values-identity", "F07-unsupported-fail-before-write", "F12-missing-requested", "F12-before-after-readback", "F12-unsupported-grammar"]})}\n`);
