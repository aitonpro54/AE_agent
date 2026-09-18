"use strict";

const assert = require("assert");
const { buildSemanticVerification } = require("../mcp-server/semantic-verification");

const prefix = "CODX_VERIFY_";
const rootName = `${prefix}E01_ROOT`;
const masterName = `${prefix}MASTER`;
const STRUCTURE_SCHEMA = "ae-agent-comp-structure.v1";
let semanticExpectations=0;

function digestStructure(value) {
  const normalized = {
    itemId: value.itemId,
    name: value.name,
    duration: value.duration,
    numLayers: value.numLayers,
    structureSchema: value.structureSchema,
    layers: value.layers
  };
  const text = JSON.stringify(normalized);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (`00000000${(hash >>> 0).toString(16)}`).slice(-8);
}

function structure(itemId, name, layerId = 1001, sourceItemId = 2001) {
  return {
    itemIndex: itemId,
    itemId,
    name,
    duration: 4,
    numLayers: 1,
    structureSchema: STRUCTURE_SCHEMA,
    layers: [{
      layerId,
      name: "Synthetic layer",
      sourceType: "footage",
      sourceItemId,
      sourceName: "synthetic.mov",
      startTime: 0,
      inPoint: 0,
      outPoint: 4,
      stretch: 100,
      enabled: true,
      audioEnabled: false,
      timeRemapEnabled: false,
      guideLayer: false,
      adjustmentLayer: false,
      threeDLayer: false,
      collapseTransformation: false
    }]
  };
}

function sourceProof(expected, actual = expected) {
  return {
    unchanged: true,
    reason: null,
    expected: {...expected, digest: digestStructure(expected)},
    actual: {...actual, digest: digestStructure(actual)}
  };
}

function baseAudit(root = rootName) {
  return {
    ok: true,
    operation: "audit_generated",
    root: {itemIndex: 2, itemId: 102, name: root, duration: 4, frameDuration: 1 / 30},
    stats: {videoLayers: 1, keyframes: 0, keyMetadataTotal: 0, backgroundLayers: 0},
    sourceFingerprints: [],
    issues: [],
    details: {
      keyMetadata: [],
      keyMetadataTruncated: false,
      expressionProvenance: [],
      expressions: [],
      texts: [],
      layers: []
    }
  };
}

function verification(tool, args, audit, result = {ok: true}) {
  const steps = [
    {index: 1, title: tool, tool, args, mutatesProject: true, status: "completed", result},
    {index: 2, title: "independent audit", tool: "audit_slideshow_generated", args: {}, mutatesProject: false, status: "completed", result: audit}
  ];
  return buildSemanticVerification({summary: tool, steps}, {ok: true, dryRun: false, steps});
}

function expectNeedsReview(label, tool, args, audit, result) {
  semanticExpectations++;
  assert.strictEqual(verification(tool, args, audit, result).status, "needs_review", label);
}

function expectPassed(label, tool, args, audit, result) {
  semanticExpectations++;
  assert.strictEqual(verification(tool, args, audit, result).status, "passed", label);
}

const baselineA = structure(900, "Protected source A", 1001, 2001);
const baselineB = structure(900, "Protected source A", 1001, 2999);

// F09: an internally self-consistent read-back for a substituted baseline must not
// be accepted when it is not the exact baseline supplied to the mutating step.
{
  const args = {generatedPrefix: prefix, generatedRootName: rootName, protectedSourceFingerprints: [baselineA]};
  const audit = baseAudit();
  audit.sourceFingerprints = [sourceProof(baselineB)];
  expectNeedsReview("F09 substituted source baseline must fail", "clone_slideshow_event_tree", args, audit);
}

// F10: both copied pair layers need stable source identity, enabled video, and
// the exact positive audio policy, not only names/timing/effect counts.
{
  const args = {
    generatedPrefix: prefix,
    rootCompItemIndex: 3,
    expectedRootCompName: rootName,
    expectedMasterCompName: masterName,
    eventStart: 0,
    eventDuration: 4,
    introDuration: 1,
    rootHasAudio: true,
    introEffectCount: 1,
    mainEffectCount: 0,
    protectedSourceFingerprints: [baselineA]
  };
  const audit = baseAudit(masterName);
  audit.sourceFingerprints = [sourceProof(baselineA)];
  audit.details.layers = [
    {comp: masterName, compItemId: 102, layer: `${prefix}EVENT_E01_ROOT_INTRO`, layerId: 3001, sourceType: "comp", sourceName: "WRONG_ROOT", sourceItemId: 999, hasVideo: true, hasAudio: true, enabled: false, audioEnabled: false, startTime: 0, inPoint: 0, outPoint: 1, sourceIn: 0, stretch: 100, effects: 1},
    {comp: masterName, compItemId: 102, layer: `${prefix}EVENT_E01_ROOT_MAIN`, layerId: 3002, sourceType: "comp", sourceName: "WRONG_ROOT", sourceItemId: 999, hasVideo: true, hasAudio: true, enabled: false, audioEnabled: false, startTime: 0, inPoint: 1, outPoint: 4, sourceIn: 1, stretch: 100, effects: 0}
  ];
  expectNeedsReview("F10 wrong source/disabled video/missing positive audio must fail", "copy_slideshow_event_pair", args, audit);
}

function pairCase(rootHasAudio) {
  const args = {
    generatedPrefix: prefix,
    rootCompItemIndex: 3,
    expectedRootCompName: rootName,
    expectedMasterCompName: masterName,
    eventStart: 0,
    eventDuration: 4,
    introDuration: 1,
    rootHasAudio,
    introEffectCount: 1,
    mainEffectCount: 0,
    protectedSourceFingerprints: [baselineA]
  };
  const audit = baseAudit(masterName);
  audit.sourceFingerprints = [sourceProof(baselineA)];
  audit.details.layers = [
    {comp: masterName, compItemId: 102, layer: `${prefix}EVENT_E01_ROOT_INTRO`, layerId: 3001, sourceType: "comp", sourceName: rootName, sourceItemIndex: 3, sourceItemId: 7001, hasVideo: true, hasAudio: true, enabled: true, audioEnabled: rootHasAudio, startTime: 0, inPoint: 0, outPoint: 1, sourceIn: 0, stretch: 100, effects: 1},
    {comp: masterName, compItemId: 102, layer: `${prefix}EVENT_E01_ROOT_MAIN`, layerId: 3002, sourceType: "comp", sourceName: rootName, sourceItemIndex: 3, sourceItemId: 7001, hasVideo: true, hasAudio: true, enabled: true, audioEnabled: rootHasAudio, startTime: 0, inPoint: 1, outPoint: 4, sourceIn: 1, stretch: 100, effects: 0}
  ];
  return {args, audit};
}

{
  for (const rootHasAudio of [true, false]) {
    const sample = pairCase(rootHasAudio);
    expectPassed(`F10 ${rootHasAudio ? "positive" : "negative"} audio policy positive control`, "copy_slideshow_event_pair", sample.args, sample.audit);
  }
  const cases = [
    ["wrong stable source", (audit) => { audit.details.layers[0].sourceItemId = 7999; }],
    ["wrong source name", (audit) => { audit.details.layers[0].sourceName = "OTHER_ROOT"; }],
    ["disabled intro video", (audit) => { audit.details.layers[0].enabled = false; }],
    ["disabled main video", (audit) => { audit.details.layers[1].enabled = false; }],
    ["missing requested audio", (audit) => { audit.details.layers[0].audioEnabled = false; }]
  ];
  for (const [label, mutate] of cases) {
    const sample = pairCase(true);
    mutate(sample.audit);
    expectNeedsReview(`F10 ${label} must fail independently`, "copy_slideshow_event_pair", sample.args, sample.audit);
  }
  const muted = pairCase(false);
  muted.audit.details.layers[1].audioEnabled = true;
  expectNeedsReview("F10 unexpected audio under negative policy must fail", "copy_slideshow_event_pair", muted.args, muted.audit);
}

function mediaCase(overrides = {}) {
  const args = {
    generatedPrefix: prefix,
    expectedRootCompName: rootName,
    generatedLeafName: `${prefix}MEDIA_LEAF`,
    mediaItems: [{path: "C:\\synthetic\\fixture.png", start: 0, duration: 1, sourceIn: 0, audio: false}]
  };
  const audit = baseAudit();
  const first = {
    comp: args.generatedLeafName,
    compItemId: 103,
    compFrameDuration: 1 / 30,
    layer: `${prefix}MEDIA_1`,
    layerId: 4001,
    sourceType: "footage",
    sourceName: "fixture.png",
    sourceItemId: 5001,
    sourcePath: args.mediaItems[0].path,
    hasVideo: true,
    hasAudio: false,
    enabled: true,
    audioEnabled: false,
    stretch: 100,
    startTime: 0,
    inPoint: 0,
    outPoint: 1,
    sourceIn: 0,
    effects: 0,
    ...overrides
  };
  audit.details.layers = [first];
  first.name=first.layer;
  return {args, audit, first};
}

// F11: each boundary violation is independent. A generic 51 ms allowance and
// one-sided end comparison cannot prove exact media coverage.
{
  let sample = mediaCase({outPoint: 0.96});
  expectNeedsReview("F11 40ms undercoverage must fail", "replace_slideshow_media_leaf", sample.args, sample.audit);
  sample = mediaCase({outPoint: 1.04});
  expectNeedsReview("F11 40ms overcoverage must fail", "replace_slideshow_media_leaf", sample.args, sample.audit);
  sample = mediaCase({startTime: -0.04, sourceIn: 0.04});
  expectNeedsReview("F11 wrong sourceIn must fail", "replace_slideshow_media_leaf", sample.args, sample.audit);
  sample = mediaCase({outPoint: 0.4});
  sample.audit.details.layers.push({...sample.first, layer: `${prefix}MEDIA_1_PART_2`, layerId: 4002, inPoint: 0.44, outPoint: 1, startTime: 0.44, sourceIn: 0});
  expectNeedsReview("F11 coverage hole must fail", "replace_slideshow_media_leaf", sample.args, sample.audit);
}

function audioOverlayCase(overrides = {}) {
  const args = {generatedPrefix: prefix, expectedMasterCompName: masterName, eventId: "01", eventStart: 5, audioItems: [{path: "C:\\synthetic\\fixture.wav", start: 1, duration: 1, sourceIn: 0.25, audio: true}], captions: []};
  const audit = baseAudit(masterName);
  const first = {comp: masterName, compItemId: 102, layer: `${prefix}AUDIO_01_1`, layerId: 4501, sourceType: "footage", sourceName: "fixture.wav", sourceItemId: 5501, sourcePath: args.audioItems[0].path, hasVideo: false, hasAudio: true, enabled: false, audioEnabled: true, stretch: 100, startTime: 5.75, inPoint: 6, outPoint: 7, sourceIn: 0.25, effects: 0, ...overrides};
  audit.details.layers = [first];
  first.name=first.layer;
  return {args, audit, first};
}

{
  const exactAudio=audioOverlayCase();
  expectPassed("F11 exact audio interval remains accepted", "add_slideshow_event_overlays",exactAudio.args,exactAudio.audit);
  const sampleGap=audioOverlayCase({outPoint:7-1/48000});
  expectNeedsReview("F11 one 48kHz sample interval loss must not be hidden by numeric epsilon", "add_slideshow_event_overlays",sampleGap.args,sampleGap.audit);
  let sample = audioOverlayCase({outPoint: 6.96});
  expectNeedsReview("F11 audio undercoverage must fail", "add_slideshow_event_overlays", sample.args, sample.audit);
  sample = audioOverlayCase({outPoint: 7.04});
  expectNeedsReview("F11 audio overcoverage must fail", "add_slideshow_event_overlays", sample.args, sample.audit);
  sample = audioOverlayCase({startTime: 5.71, sourceIn: 0.29});
  expectNeedsReview("F11 audio sourceIn mismatch must fail", "add_slideshow_event_overlays", sample.args, sample.audit);
  sample = audioOverlayCase({outPoint: 6.4});
  sample.audit.details.layers.push({...sample.first, layer: `${prefix}AUDIO_01_1_PART_2`, layerId: 4502, inPoint: 6.44, outPoint: 7, startTime: 6.19, sourceIn: 0.25});
  expectNeedsReview("F11 audio coverage hole must fail", "add_slideshow_event_overlays", sample.args, sample.audit);
}

// F12: every requested replacement needs concrete per-property before/after
// proof and independent read-back that no requested source reference remains.
{
  const args = {
    generatedPrefix: prefix,
    expectedRootCompName: rootName,
    masterCompName: masterName,
    replacements: [{from: "OriginalOther", to: `${prefix}OTHER`}]
  };
  const audit = baseAudit();
  audit.details.expressionProvenance = [{comp: rootName, compItemId: 102, sourceName: "Scene 1"}];
  audit.details.expressions = [{
    comp: rootName,
    compItemId: 102,
    layer: "Expression layer",
    layerId: 6001,
    property: "ADBE Opacity",
    propertyIdentity: "comp:102/layer:6001/property:1:ADBE%20Opacity:Opacity",
    propertyPath: [{propertyIndex: 1, matchName: "ADBE Opacity", name: "Opacity"}],
    expression: 'comp("OriginalOther").layer(1).transform.opacity',
    error: ""
  }];
  const result = {
    ok: true,
    changed: 0,
    expressionReplacements: [{kind: "requested", from: "OriginalOther", to: `${prefix}OTHER`, occurrencesBefore: 0, occurrencesAfter: 0, changedProperties: []}],
    postVerification: {ok: false, expressionCount: 0, replacementsProven: false}
  };
  expectNeedsReview("F12 unperformed requested replacement must fail", "rewrite_slideshow_tree_expressions", args, audit, result);
}

{
  const destination = `${prefix}OTHER`;
  const args = {generatedPrefix: prefix, expectedRootCompName: rootName, masterCompName: masterName, replacements: [{from: "OriginalOther", to: destination}]};
  const propertyPath = [{propertyIndex: 1, matchName: "ADBE Opacity", name: "Opacity"}];
  const before = 'comp("OriginalOther").layer(1).transform.opacity';
  const after = `comp("${destination}").layer(1).transform.opacity`;
  const identity = {comp: rootName, compItemId: 102, layer: "Expression layer", layerId: 6001, property: "ADBE Opacity", propertyIdentity: "comp:102/layer:6001/property:1:ADBE%20Opacity:Opacity", propertyPath};
  const audit = baseAudit();
  audit.details.expressionProvenance = [{comp: rootName, compItemId: 102, sourceName: "Scene 1"}];
  audit.details.expressions = [{...identity, expression: after, error: ""}];
  const changed = {...identity, before, after, sourceOccurrencesBefore: 1, sourceOccurrencesAfter: 0, destinationOccurrencesBefore: 0, destinationOccurrencesAfter: 1};
  const result = {ok: true, changed: 1, expressionReplacements: [
    {kind: "master", from: "Final Comp", to: masterName, status: "not_referenced", occurrencesBefore: 0, occurrencesAfter: 0, changedProperties: []},
    {kind: "requested", from: "OriginalOther", to: destination, status: "replaced", occurrencesBefore: 1, occurrencesAfter: 0, changedProperties: [changed]},
    {kind: "derived", from: "Scene 1", to: rootName, status: "not_referenced", occurrencesBefore: 0, occurrencesAfter: 0, changedProperties: []}
  ], postVerification: {ok: true, expressionCount: 1, replacementsProven: true}};
  expectPassed("F12 complete replacement proof positive control", "rewrite_slideshow_tree_expressions", args, audit, result);
  const missingReadBack = JSON.parse(JSON.stringify(audit));
  missingReadBack.details.expressions = [];
  expectNeedsReview("F12 missing changed-property read-back must fail", "rewrite_slideshow_tree_expressions", args, missingReadBack, result);
  const staleReadBack = JSON.parse(JSON.stringify(audit));
  staleReadBack.details.expressions[0].expression = before;
  expectNeedsReview("F12 stale source reference must fail", "rewrite_slideshow_tree_expressions", args, staleReadBack, result);
}

// An explicit request may duplicate the mandatory Final Comp -> master map.
// The tool emits one de-duplicated requested row, which is complete proof.
{
  const args = {generatedPrefix: prefix, expectedRootCompName: rootName, masterCompName: masterName, replacements: [{from: "Final Comp", to: masterName}]};
  const propertyPath = [{propertyIndex: 1, matchName: "ADBE Opacity", name: "Opacity"}];
  const identity = {comp: rootName, compItemId: 102, layer: "Master expression", layerId: 6051, property: "ADBE Opacity", propertyIdentity: "comp:102/layer:6051/property:1:ADBE%20Opacity:Opacity", propertyPath};
  const before = 'comp("Final Comp").layer(1).transform.opacity';
  const after = `comp("${masterName}").layer(1).transform.opacity`;
  const changed = {...identity, before, after, sourceOccurrencesBefore: 1, sourceOccurrencesAfter: 0, destinationOccurrencesBefore: 0, destinationOccurrencesAfter: 1};
  const audit = baseAudit();
  audit.details.expressionProvenance = [{comp: rootName, compItemId: 102, sourceName: "Scene 1"}];
  audit.details.expressions = [{...identity, expression: after, error: ""}];
  const result = {ok: true, changed: 1, expressionReplacements: [
    {kind: "requested", from: "Final Comp", to: masterName, status: "replaced", occurrencesBefore: 1, occurrencesAfter: 0, changedProperties: [changed]},
    {kind: "derived", from: "Scene 1", to: rootName, status: "not_referenced", occurrencesBefore: 0, occurrencesAfter: 0, changedProperties: []}
  ], postVerification: {ok: true, expressionCount: 1, replacementsProven: true}};
  expectPassed("F12 de-duplicated requested master mapping positive control", "rewrite_slideshow_tree_expressions", args, audit, result);
}

{
  const args = {generatedPrefix: prefix, expectedRootCompName: rootName, masterCompName: masterName, replacements: []};
  const propertyPath = [{propertyIndex: 1, matchName: "ADBE Opacity", name: "Opacity"}];
  const identity = {comp: rootName, compItemId: 102, layer: "Derived expression", layerId: 6101, property: "ADBE Opacity", propertyIdentity: "comp:102/layer:6101/property:1:ADBE%20Opacity:Opacity", propertyPath};
  const before = 'comp("Scene 1").layer(1).transform.opacity';
  const after = `comp("${rootName}").layer(1).transform.opacity`;
  const audit = baseAudit();
  audit.details.expressionProvenance = [{comp: rootName, compItemId: 102, sourceName: "Scene 1"}];
  audit.details.expressions = [{...identity, expression: after, error: ""}];
  const result = {ok: true, changed: 1, expressionReplacements: [
    {kind: "master", from: "Final Comp", to: masterName, status: "not_referenced", occurrencesBefore: 0, occurrencesAfter: 0, changedProperties: []},
    {kind: "derived", from: "Scene 1", to: rootName, status: "replaced", occurrencesBefore: 1, occurrencesAfter: 0, changedProperties: [{...identity, before, after, sourceOccurrencesBefore: 1, sourceOccurrencesAfter: 0, destinationOccurrencesBefore: 0, destinationOccurrencesAfter: 1}]}
  ], postVerification: {ok: true, expressionCount: 1, replacementsProven: true}};
  expectPassed("F12 derived mapping positive control", "rewrite_slideshow_tree_expressions", args, audit, result);
  const missingMapping = JSON.parse(JSON.stringify(result));
  missingMapping.expressionReplacements.pop();
  expectNeedsReview("F12 omitted derived mapping must fail", "rewrite_slideshow_tree_expressions", args, audit, missingMapping);
  const missingProperty = JSON.parse(JSON.stringify(audit));
  missingProperty.details.expressions = [];
  expectNeedsReview("F12 missing derived property read-back must fail", "rewrite_slideshow_tree_expressions", args, missingProperty, result);
  const corruptedProperty = JSON.parse(JSON.stringify(audit));
  corruptedProperty.details.expressions[0].expression = `comp("${prefix}WRONG").layer(1).transform.opacity`;
  expectNeedsReview("F12 corrupted derived destination must fail", "rewrite_slideshow_tree_expressions", args, corruptedProperty, result);
}

// F07: a key audit without stable property identity and a typed finite key value
// is incompatible evidence and must fail closed.
{
  const before = baseAudit();
  const after = baseAudit();
  before.root.duration = 4;
  after.root.duration = 6;
  const legacyKey = {comp: rootName, compDuration: 4, compFrameDuration: 1 / 30, translationEligible: true, layer: "Animated", property: "ADBE Position", time: 3, inType: "BEZIER", outType: "BEZIER", inEase: [], outEase: [], temporalContinuous: false, temporalAutoBezier: false, spatial: true, inSpatial: [0, 0], outSpatial: [0, 0], roving: false, spatialContinuous: false, spatialAutoBezier: false};
  before.details.keyMetadata = [legacyKey];
  before.stats.keyframes = before.stats.keyMetadataTotal = 1;
  after.details.keyMetadata = [{...legacyKey, compDuration: 6, time: 5}];
  after.stats.keyframes = after.stats.keyMetadataTotal = 1;
  const args = {generatedPrefix: prefix, expectedRootCompName: rootName, targetDuration: 6, introDuration: 1};
  const steps = [
    {index: 1, title: "before", tool: "audit_slideshow_generated", mutatesProject: false, status: "completed", result: before},
    {index: 2, title: "extend", tool: "extend_slideshow_cloned_tree", args, mutatesProject: true, status: "completed", result: {ok: true}},
    {index: 3, title: "after", tool: "audit_slideshow_generated", mutatesProject: false, status: "completed", result: after}
  ];
  const result = buildSemanticVerification({summary: "key preservation", steps}, {ok: true, dryRun: false, steps});
  assert.strictEqual(result.status, "needs_review", "F07 legacy key evidence without value/property identity must fail");
}

// AE recomputes temporal speed for LINEAR segments when one key moves. That
// derived speed may change, while values, identity, influence and all explicit
// metadata stay preserved. BEZIER speed remains an exact contract.
{
  const key=(overrides={})=>({comp:rootName,compItemId:102,compDuration:4,compFrameDuration:1/30,translationEligible:true,layer:"Animated",layerId:2001,property:"ADBE Position",propertyIdentity:"comp:102/layer:2001/property:1:ADBE%20Transform%20Group:Transform/property:2:ADBE%20Position:Position",propertyPath:[{propertyIndex:1,matchName:"ADBE Transform Group",name:"Transform"},{propertyIndex:2,matchName:"ADBE Position",name:"Position"}],keyIndex:1,time:3,value:{type:"vector",value:[10,20]},inType:"LINEAR",outType:"6612",inEase:[{speed:20,influence:16.666666667}],outEase:[{speed:20,influence:16.666666667}],temporalContinuous:false,temporalAutoBezier:false,spatial:true,inSpatial:[0,0],outSpatial:[0,0],roving:false,spatialContinuous:false,spatialAutoBezier:false,...overrides});
  const before=baseAudit(),after=baseAudit();before.root.duration=4;after.root.duration=6;
  before.details.keyMetadata=[key()];before.stats.keyframes=before.stats.keyMetadataTotal=1;
  after.details.keyMetadata=[key({compDuration:6,time:5,inEase:[{speed:10,influence:16.666666667}],outEase:[{speed:10,influence:16.666666667}]})];after.stats.keyframes=after.stats.keyMetadataTotal=1;
  const args={generatedPrefix:prefix,expectedRootCompName:rootName,targetDuration:6,introDuration:1};
  const steps=[{index:1,tool:"audit_slideshow_generated",status:"completed",result:before},{index:2,tool:"extend_slideshow_cloned_tree",args,mutatesProject:true,status:"completed",result:{ok:true}},{index:3,tool:"audit_slideshow_generated",status:"completed",result:after}];
  const linearResult=buildSemanticVerification({summary:"linear speed",steps},{ok:true,dryRun:false,steps});
  assert.strictEqual(linearResult.status,"passed",`derived LINEAR speed change must pass: ${JSON.stringify(linearResult.checks)}`);
  before.details.keyMetadata[0].inType="BEZIER";after.details.keyMetadata[0].inType="BEZIER";
  assert.strictEqual(buildSemanticVerification({summary:"bezier speed",steps},{ok:true,dryRun:false,steps}).status,"needs_review","BEZIER speed change must fail");
}

// F06: absence of a duplicate issue is not proof that all previously audible
// intervals were preserved. Missing before-route evidence must fail closed.
{
  const args = {generatedPrefix: prefix, expectedRootCompName: rootName};
  const audit = baseAudit();
  expectNeedsReview("F06 missing audible before/after route proof must fail", "configure_slideshow_tree_audio", args, audit, {ok: true, audioRoutes: []});
}

{
  const args = {generatedPrefix: prefix, expectedRootCompName: rootName};
  const audit = baseAudit();
  audit.details.layers = [
    {comp: rootName, compItemId: 102, layer: "Nested route A", layerId: 8101, sourceType: "comp", sourceName: "Child A", sourceItemId: 8201, hasAudio: true, audioEnabled: true, inPoint: 0, outPoint: 4, sourceIn: 0},
    {comp: rootName, compItemId: 102, layer: "Nested route B", layerId: 8102, sourceType: "comp", sourceName: "Child B", sourceItemId: 8202, hasAudio: true, audioEnabled: false, inPoint: 1, outPoint: 3, sourceIn: 1}
  ];
  const result = {ok: true, audioRouteCountBefore: 2, audioRoutes: [
    {compItemId: 102, layerId: 8101, sourceItemId: 8201, inPoint: 0, outPoint: 4, sourceIn: 0, audioEnabledBefore: true, audioEnabledAfter: true, action: "preserve_audible", reason: "unique_audible_route", audiblePaths: [{sourceItemId: 8301, inPoint: 0, outPoint: 4, sourceIn: 0}]},
    {compItemId: 102, layerId: 8102, sourceItemId: 8202, inPoint: 1, outPoint: 3, sourceIn: 1, audioEnabledBefore: true, audioEnabledAfter: false, action: "mute_duplicate", reason: "fully_covered_duplicate", audiblePaths: [{sourceItemId: 8301, inPoint: 1, outPoint: 3, sourceIn: 1}]}
  ]};
  expectPassed("F06 nested duplicate may use different immediate comp IDs when the same leaf path is fully covered", "configure_slideshow_tree_audio", args, audit, result);
  const uncovered = JSON.parse(JSON.stringify(result));
  uncovered.audioRoutes[0].audiblePaths[0].outPoint = 2;
  expectNeedsReview("F06 muted leaf interval without full survivor coverage must fail", "configure_slideshow_tree_audio", args, audit, uncovered);
  const changedSwitch = JSON.parse(JSON.stringify(audit));
  changedSwitch.details.layers[1].audioEnabled = true;
  expectNeedsReview("F06 independent read-back switch mismatch must fail", "configure_slideshow_tree_audio", args, changedSwitch, result);
}

// Positive controls keep the regressions honest.
{
  const args = {generatedPrefix: prefix, generatedRootName: rootName, protectedSourceFingerprints: [baselineA]};
  const audit = baseAudit();
  audit.sourceFingerprints = [sourceProof(baselineA)];
  expectPassed("matching protected baseline remains accepted", "clone_slideshow_event_tree", args, audit);
}

process.stdout.write(`${JSON.stringify({ok: true, semanticExpectations})}\n`);
