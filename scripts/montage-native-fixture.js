"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const vm = require("node:vm");
const { computeRequiredFrameCoverage } = require("../mcp-server/montage-coverage");
const { createCropSamples } = require("./montage-fixture");

function createMontageNativeFixture(options = {}) {
  const tmpDir = options.tmpDir || fs.mkdtempSync(path.join(os.tmpdir(), "montage-native-fixture-"));

  // Real synthetic video files on disk
  const contentA = "SYNTHETIC_MONTAGE_CLIP_A_CONTENT_BYTES_0123456789";
  const contentB = "SYNTHETIC_MONTAGE_CLIP_B_CONTENT_BYTES_9876543210";
  const fileAPath = path.join(tmpDir, "clip_a.mp4");
  const fileBPath = path.join(tmpDir, "clip_b.mp4");
  const fileCPath = path.join(tmpDir, "existing_placeholder.mp4");
  fs.writeFileSync(fileAPath, contentA);
  fs.writeFileSync(fileBPath, contentB);
  fs.writeFileSync(fileCPath,"SYNTHETIC_EXISTING_PLACEHOLDER_SOURCE");
  const realFileAPath = fs.realpathSync(fileAPath);
  const realFileBPath = fs.realpathSync(fileBPath);
  const shaA = crypto.createHash("sha256").update(contentA).digest("hex");
  const shaB = crypto.createHash("sha256").update(contentB).digest("hex");
  const sizeA = Buffer.byteLength(contentA);
  const sizeB = Buffer.byteLength(contentB);

  const projectFilePath = path.join(tmpDir, "SyntheticMontageProject.aep");
  fs.writeFileSync(projectFilePath, "SYNTHETIC_AEP_FILE_HEADER_BINARY");

  // Create Node VM context simulating AE ExtendScript environment
  const context = vm.createContext({ console });
  vm.runInContext(`
    var writes = 0;
    var undo = [];

    function Property(name, value, index, parent) {
      this.matchName = name;
      this.name = name;
      this.value = value;
      this.propertyIndex = index;
      this.parentProperty = parent;
      this.numKeys = 0;
      this.expressionEnabled = false;
      this.canSetExpression = true;
      this.expression = "";
      this.expressionError = "";
    }
    Property.prototype.setValue = function(val) {
      this.value = val;
      writes++;
    };
    Property.prototype.propertyGroup = function() { return this.parentProperty; };

    function Group(name, index, parent) {
      this.matchName = name;
      this.name = name;
      this.propertyIndex = index;
      this.parentProperty = parent;
      this.children = [];
    }
    Group.prototype.property = function(val) {
      if (typeof val === "number") return this.children[val - 1] || null;
      for (var i = 0; i < this.children.length; i++) {
        if (this.children[i].matchName === val || this.children[i].name === val) return this.children[i];
      }
      return null;
    };
    Group.prototype.add = function(name, val) {
      var p = new Property(name, val, this.children.length + 1, this);
      this.children.push(p);
      return p;
    };
    Group.prototype.propertyGroup = function() { return this.parentProperty; };
    Object.defineProperty(Group.prototype, "numProperties", {
      get: function() { return this.children.length; }
    });

    function AVLayer(id, name, source) {
      this.id = id;
      this.name = name;
      this.source = source;
      this.enabled = true;
      this.locked = false;
      this.startTime = 0;
      this.inPoint = 0;
      this.outPoint = 6;
      this.stretch = 100;
      this.timeRemapEnabled = false;
      this.threeDLayer = false;
      this.parent = null;
      this.collapseTransformation = false;
      this.hasTrackMatte = false;
      this.isTrackMatte = false;
      this.trackMatteType = 0;
      this.matchName = "ADBE AV Layer";
      this.groups = [];

      var tg = new Group("ADBE Transform Group", 1, this);
      this.groups.push(tg);
      tg.add("ADBE Anchor Point", [960, 540]);
      tg.add("ADBE Position", [960, 540]);
      tg.add("ADBE Scale", [100, 100]);
      tg.add("ADBE Rotate Z", 0);
      tg.add("ADBE Opacity", 100);

      var fx = new Group("ADBE Effect Parade", 2, this);
      this.groups.push(fx);

      var masks = new Group("ADBE Mask Parade", 3, this);
      this.groups.push(masks);
    }
    AVLayer.prototype.property = function(val) {
      if (typeof val === "number") return this.groups[val - 1] || null;
      for (var i = 0; i < this.groups.length; i++) {
        if (this.groups[i].matchName === val || this.groups[i].name === val) return this.groups[i];
      }
      return null;
    };
    AVLayer.prototype.replaceSource = function(newSource) {
      this.source = newSource;
      writes++;
    };
    Object.defineProperty(AVLayer.prototype, "numProperties", {
      get: function() { return this.groups.length; }
    });

    function CompItem(id, name) {
      this.id = id;
      this.name = name;
      this.duration = 12.0;
      this.frameRate = 30;
      this.width = 1920;
      this.height = 1080;
      this.pixelAspect = 1;
      this.time = 0;
      this.comment = "";
      this._layers = [];
      this.selectedLayers = [];
      this.selectedProperties = [];
    }
    Object.defineProperty(CompItem.prototype, "numLayers", {
      get: function() { return this._layers.length; }
    });
    CompItem.prototype.layer = function(idx) { return this._layers[idx - 1] || null; };
    CompItem.prototype.add = function(l) {
      this._layers.push(l);
      l.index = this._layers.length;
      l.containingComp = this;
      return l;
    };

    function FootageItem(id, name, filePath) {
      this.id = id;
      this.name = name;
      this.file = { fsName: filePath };
      this.typeName = "Footage";
      this.duration = 10.0;
      this.width = 1920;
      this.height = 1080;
      this.frameRate = 30;
      this.pixelAspect = 1;
      this.footageMissing = false;
      this.hasVideo = true;
      this.hasAudio = true;
      this.mainSource = { isStill: false };
    }

    var footageA = new FootageItem(200, "clip_a.mp4", ${JSON.stringify(realFileAPath)});
    var footageB = new FootageItem(201, "clip_b.mp4", ${JSON.stringify(realFileBPath)});
    var footageC = new FootageItem(202, "existing_placeholder.mp4", ${JSON.stringify(fileCPath)});

    var masterComp = new CompItem(100, "Master Comp");
    var scene1Comp = new CompItem(110, "Scene 1 Comp");
    var scene2Comp = new CompItem(120, "Scene 2 Comp");

    // Master comp contains two precomp layers (routes)
    var precomp1 = masterComp.add(new AVLayer(10, "Scene 1 Layer", scene1Comp));
    precomp1.startTime = 0; precomp1.inPoint = 0; precomp1.outPoint = 6;

    var precomp2 = masterComp.add(new AVLayer(11, "Scene 2 Layer", scene2Comp));
    precomp2.startTime = 6; precomp2.inPoint = 6; precomp2.outPoint = 12;

    // Target layers inside scene precomps
    var target1 = scene1Comp.add(new AVLayer(20, "Placeholder Target 1", footageC));
    target1.startTime = 0.2; target1.inPoint = 0.2; target1.outPoint = 5.8;
    target1.groups[0].children[1].value=[970,530];
    target1.groups[0].children[2].value=[90,90];

    var target2 = scene2Comp.add(new AVLayer(30, "Placeholder Target 2", footageB));
    target2.startTime = 0; target2.inPoint = 0; target2.outPoint = 6;

    var items = [masterComp, scene1Comp, scene2Comp, footageA, footageB,footageC];
    for (var i = 0; i < items.length; i++) items[i].itemIndex = i + 1;

    var app = {
      project: {
        file: { fsName: ${JSON.stringify(projectFilePath)} },
        activeItem: masterComp,
        bitsPerChannel: 8,
        item: function(idx) { return items[idx - 1] || null; }
      },
      beginUndoGroup: function(name) { undo.push("begin:" + name); },
      endUndoGroup: function() { undo.push("end"); }
    };
    Object.defineProperty(app.project, "numItems", {
      get: function() { return items.length; }
    });

    var TrackMatteType = { NO_TRACK_MATTE: 0 };
  `, context);

  const fps = 30;
  const manifest = {
    schema: "ae-agent-montage-manifest.v1",
    revision: 1,
    taskId: "montage-native-test-task",
    observedAt: "2026-10-02T12:00:00.000Z",
    project: {
      projectFile: projectFilePath,
      projectKey: require("../mcp-server/project-intent-memory").projectStateKey(projectFilePath),
      revision: 0
    },
    scenes: [
      {
        sceneId: "scene_01",
        rootCompItemId: 100,
        rootRange: [0.0, 6.0],
        fps,
        assignmentIds: ["assign_01"],
        visibleCutCount: 2,
        cameraEvents: []
      },
      {
        sceneId: "scene_02",
        rootCompItemId: 100,
        rootRange: [6.0, 12.0],
        fps,
        assignmentIds: ["assign_02"],
        visibleCutCount: 2,
        cameraEvents: []
      }
    ],
    assignments: [
      {
        assignmentId: "assign_01",
        sceneId: "scene_01",
        target: { compItemId: 110, layerId: 20 },
        routeLayerIds: [10],
        materialId: "mat_01",
        sourceRange: [0.0, 6.0],
        groupId: "grp_01",
        crop: {
          mode: "static-cover",
          marginPixels: 0,
          samples: createCropSamples([0.0, 6.0], [2.0, 4.0], fps)
        },
        shots: [
          { shotId: "shot_1a", sourceRange: [0.0, 2.0] },
          { shotId: "shot_1b", sourceRange: [2.0, 4.0] },
          { shotId: "shot_1c", sourceRange: [4.0, 6.0] }
        ],
        protectedFields: []
      },
      {
        assignmentId: "assign_02",
        sceneId: "scene_02",
        target: { compItemId: 120, layerId: 30 },
        routeLayerIds: [11],
        materialId: "mat_02",
        sourceRange: [0.0, 6.0],
        groupId: "grp_02",
        crop: {
          mode: "static-cover",
          marginPixels: 0,
          samples: createCropSamples([0.0, 6.0], [2.0, 4.0], fps)
        },
        shots: [
          { shotId: "shot_2a", sourceRange: [0.0, 2.0] },
          { shotId: "shot_2b", sourceRange: [2.0, 4.0] },
          { shotId: "shot_2c", sourceRange: [4.0, 6.0] }
        ],
        protectedFields: []
      }
    ],
    groups: [
      { groupId: "grp_01", provenance: "user_confirmed", confirmed: true },
      { groupId: "grp_02", provenance: "user_confirmed", confirmed: true }
    ],
    groupPolicy: {
      distinctGroups: true,
      disallowSourceOverlap: true,
      balancedRepeats: []
    },
    dependencies: {
      complete: true,
      scope: {
        rootCompItemIds: [100],
        targetKeys: ["110:20", "120:30"],
        sourceItemIds: [200, 201,202]
      },
      edges: [
        { dependencyId: "dep_target_1", kind: "target", compItemId: 110, layerId: 20, sceneIds: ["scene_01"] },
        { dependencyId: "dep_route_1", kind: "route", compItemId: 100, layerId: 10, sceneIds: ["scene_01"] },
        { dependencyId: "dep_source_1", kind: "source", sourceItemId: 200, sceneIds: ["scene_01"] },
        { dependencyId: "dep_previous_source_1", kind: "source", sourceItemId: 202, sceneIds: ["scene_01"] },
        { dependencyId: "dep_target_2", kind: "target", compItemId: 120, layerId: 30, sceneIds: ["scene_02"] },
        { dependencyId: "dep_route_2", kind: "route", compItemId: 100, layerId: 11, sceneIds: ["scene_02"] },
        { dependencyId: "dep_source_2", kind: "source", sourceItemId: 201, sceneIds: ["scene_02"] }
      ]
    },
    frameCoverage: []
  };

  const requiredMap = computeRequiredFrameCoverage({
    scenes: manifest.scenes,
    assignments: manifest.assignments,
    fps
  });
  manifest.frameCoverage = Array.from(requiredMap.values()).map(req => ({
    frameId: req.frameId,
    sceneId: req.sceneId,
    assignmentId: req.assignmentId,
    compItemId: req.compItemId,
    rootFrame: req.rootFrame,
    rootTime: req.rootTime,
    roles: Array.from(req.roles),
    reasons: Array.from(req.reasons)
  }));

  const preparedMaterials = {
    schema: "ae-agent-prepared-materials.v1",
    revision: 1,
    materials: [
      {
        materialId: "mat_01",
        sourceItemId: 200,
        path: realFileAPath,
        sha256: shaA,
        byteLength: sizeA,
        width: 1920,
        height: 1080,
        pixelAspect: 1,
        duration: 10.0,
        fps: 30,
        provenance: { kind: "prepared_clip" }
      },
      {
        materialId: "mat_02",
        sourceItemId: 201,
        path: realFileBPath,
        sha256: shaB,
        byteLength: sizeB,
        width: 1920,
        height: 1080,
        pixelAspect: 1,
        duration: 10.0,
        fps: 30,
        provenance: { kind: "prepared_clip" }
      }
    ]
  };

  return {
    tmpDir,
    projectFilePath,
    realFileAPath,
    realFileBPath,
    fileCPath,
    contentA,
    contentB,
    shaA,
    shaB,
    sizeA,
    sizeB,
    context,
    manifest,
    preparedMaterials,
    change: code => vm.runInContext(code, context),
    read: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, context)),
    execute: script => JSON.parse(vm.runInContext(script, context, { timeout: 3000 })),
    getWrites: () => vm.runInContext("writes", context),
    injectMaterialDrift() {
      fs.writeFileSync(realFileAPath, "TAMPERED_MATERIAL_CONTENT_THAT_FAILS_SHA256");
    },
    injectProjectDrift() {
      vm.runInContext('app.project.file.fsName = "C:/Tampered/DriftedProject.aep";', context);
    },
    injectFootprintEffect() {
      vm.runInContext('target1.groups[1].add("Tampered Effect", 42);', context);
    },
    injectFootprintExpression() {
      vm.runInContext('target1.groups[0].children[1].expressionEnabled = true;', context);
    },
    cleanup() {
      const resolved=path.resolve(tmpDir),root=path.resolve(os.tmpdir())+path.sep;
      if(!resolved.startsWith(root) || !path.basename(resolved).startsWith("montage-native-fixture-"))throw new Error("unsafe_fixture_cleanup_path");
      try { fs.rmSync(resolved, { recursive: true, force: true }); } catch (_) {}
    }
  };
}

module.exports = {
  createMontageNativeFixture
};
