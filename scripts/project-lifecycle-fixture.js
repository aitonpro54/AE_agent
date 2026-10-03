"use strict";
// Offline AE-shaped VM + real temporary files. Never imports the bridge daemon.
const fs = require("fs"), os = require("os"), path = require("path"), vm = require("vm"), crypto = require("crypto");
const c = require("../mcp-server/project-lifecycle-contract"), t = require("../mcp-server/project-lifecycle-transition"), m = require("../mcp-server/project-intent-memory");
const { createProjectLifecycleService } = require("../mcp-server/project-lifecycle-service");
function fixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ae-lifecycle-")), source = path.join(root, "source.aep"), target = path.join(root, "target.aep"), statePath = path.join(root, "state.json"), asset = path.join(root, "media.mov"), proxy = path.join(root, "proxy.mov");
  fs.writeFileSync(source, "approved source disk"); fs.writeFileSync(asset, "media"); fs.writeFileSync(proxy, "proxy");
  const initial = { schema: m.PROJECT_STATE_SCHEMA, projectState: { [m.projectStateKey(source)]: t.defaultState(source) } };
  if (options.open) { fs.writeFileSync(target, "existing target disk"); initial.projectState[m.projectStateKey(target)] = t.defaultState(target); }
  fs.writeFileSync(statePath, JSON.stringify(initial));
  const sandbox = { __fileExists: file => fs.existsSync(file), __save: file => fs.writeFileSync(file, "saved stage contents"), __source: source, __target: target, __asset: asset, __proxy: proxy, __settings: c.SETTINGS };
  const runtime = vm.createContext(sandbox);
  vm.runInContext(`
function File(file){this.fsName=file;}Object.defineProperty(File.prototype,"exists",{get:function(){return __fileExists(this.fsName);}});
function FileSource(file){this.file=new File(file);this.isStill=false;}function SolidSource(){this.isStill=true;}function PlaceholderSource(){this.isStill=false;}
function FolderItem(id,name){this.id=id;this.name=name;this.comment="";this.parentFolder=null;}
function AVLayer(id,source){this.id=id;this.index=1;this.name="video";this.source=source;this.enabled=true;this.startTime=0;this.inPoint=0;this.outPoint=3;this.stretch=100;this.timeRemapEnabled=false;this.threeDLayer=false;
 this.transform={"ADBE Anchor Point":[50,50],"ADBE Position":[100,100],"ADBE Scale":[100,100],"ADBE Rotate Z":0,"ADBE Opacity":100};}
AVLayer.prototype.property=function(name){var layer=this;if(name==="ADBE Transform Group")return {property:function(key){if(!(key in layer.transform))return null;return {value:layer.transform[key],numKeys:0,expressionEnabled:false};}};return null;};
function FootageItem(id,file){this.id=id;this.name="video";this.comment="";this.mainSource=new FileSource(file);this.file=this.mainSource.file;this.width=1920;this.height=1080;this.pixelAspect=1;this.duration=3;this.frameRate=25;this.hasVideo=true;this.hasAudio=true;this.useProxy=false;this.proxySource=null;this.footageMissing=false;}
function CompItem(id,footage){this.id=id;this.name="MAIN";this.comment="";this.width=1920;this.height=1080;this.pixelAspect=1;this.duration=3;this.frameRate=25;this.hasVideo=true;this.hasAudio=true;this.useProxy=false;this.proxySource=null;this.rows=[new AVLayer(101,footage)];}
Object.defineProperty(CompItem.prototype,"numLayers",{get:function(){return this.rows.length;}});CompItem.prototype.layer=function(i){return this.rows[i-1];};
function Project(file,empty){this.file=file?new File(file):null;this.dirty=false;this.revision=7;this.rootFolder=new FolderItem(999,"root");for(var key in __settings)this[key]=__settings[key]==="string"?"fixture":__settings[key]==="boolean"?false:8;
 this.rows=[];if(!empty){var footage=new FootageItem(1,__asset),comp=new CompItem(2,footage),solid=new FootageItem(3,__asset);solid.name="solid";solid.mainSource=new SolidSource();solid.file=null;solid.duration=0;solid.frameRate=0;this.rows=[footage,comp,solid];}for(var i=0;i<this.rows.length;i++)this.rows[i].parentFolder=this.rootFolder;}
Object.defineProperty(Project.prototype,"numItems",{get:function(){return this.rows.length;}});Project.prototype.item=function(i){return this.rows[i-1];};Project.prototype.save=function(file){__save(file.fsName);this.file=file;this.dirty=false;this.revision++;};
var app={project:new Project(__source,false),newProject:function(){this.project=new Project(null,true);return this.project;},open:function(file){if(file.fsName===__target && this.project.numItems>0)this.project.file=file;else if(file.fsName===__target)this.project.file=file;else throw new Error("fixture_unknown_open");this.project.dirty=false;this.project.revision++;return this.project;}};
`, runtime);
  if (options.dirty) runtime.app.project.dirty = true;
  const calls = [], context = Object.freeze({ authorizedFixture: crypto.randomUUID() });
  let storage, service, callback = options.nativeHook;
  storage = t.createLifecycleStorage({ statePath, enabled: options.enabled !== false, filesystem: options.storeFilesystem });
  const deps = {
    storage, filesystem: options.filesystem,
    assertIdle: () => options.busy !== true,
    verifyManualAuthorization: async (candidate, hints) => {
      if (candidate !== context || options.denyAuth) c.fail("lifecycle_manual_authorization_required");
      return Object.freeze({ channel: "manual_cep", confirmed: true, dryRunVerified: true, actionId: "fixture-action", runId: "fixture-run", payloadHash: c.hash("fixture-plan"), inputHash: hints.inputHash, sourcePolicyHash: hints.sourcePolicyHash, targetPolicyHash: hints.targetPolicyHash });
    },
    sourceCheckpoint: async request => {
      if (options.checkpointFailure) throw new Error("fixture checkpoint failure");
      const checkpointFile = path.join(root, "checkpoint-" + request.transitionId + ".aep");
      fs.copyFileSync(request.sourceFile, checkpointFile, fs.constants.COPYFILE_EXCL);
      return { checkpointFile, label: request.label, sourceFile: request.sourceFile, snapshotScope: request.snapshotScope };
    },
    retireContext: async () => { if (options.retireFailure) throw new Error("fixture retirement failure"); return { sessionClosed: true, proposalRetired: true, cachesInvalidated: true, desiredEnabledPreserved: true }; },
    readNative: async (script, cap) => {
      t.validateCommandCapability(cap, { rawScript: script }); const facts = t.phaseCapabilityFacts(cap);
      calls.push({ phase: facts.phase, readOnly: facts.readOnly, script, cap });
      if (callback) await callback({ when: "before", script, facts, runtime, calls, storage, service });
      const result = vm.runInContext("(function(){" + script + "})()", runtime);
      if (callback) await callback({ when: "after", result, script, facts, runtime, calls, storage, service });
      return JSON.parse(JSON.stringify(result));
    }
  };
  service = createProjectLifecycleService(deps);
  const args = () => ({ expectedSourceProjectFile: source, expectedSourceSavedSha25664: c.hash(fs.readFileSync(source)), expectedSourceRevision: runtime.app.project.revision, expectedSourceDirty: runtime.app.project.dirty, checkpointLabel: "offline", targetProjectFile: target, ...(options.open ? { expectedTargetSavedSha25664: c.hash(fs.readFileSync(target)) } : {}) });
  return { root, source, target, statePath, asset, proxy, storage, service, runtime, calls, context, deps, args, options, execute: script => vm.runInContext(script, runtime), setNativeHook: fn => { callback = fn; },
    dispose: () => {
      const resolved=path.resolve(root),temporaryRoot=path.resolve(os.tmpdir())+path.sep;
      if(!resolved.startsWith(temporaryRoot) || !path.basename(resolved).startsWith("ae-lifecycle-"))throw new Error("Unsafe lifecycle fixture cleanup");
      fs.rmSync(resolved, { recursive: true, force: true });
    } };
}
module.exports = { fixture };
