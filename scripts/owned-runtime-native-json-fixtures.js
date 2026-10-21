"use strict";
// Execute the repository's actual getter bodies against finite synthetic AE
// objects. No bridge import, addon, socket, process, file write or authority.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), crypto = require("node:crypto");
const geometry = require("../mcp-server/placeholder-geometry"), variants = require("../mcp-server/native-render-variant");
const source = fs.readFileSync(path.join(__dirname, "../mcp-server/bridge-daemon.js"), "utf8");
function cut(first, next) { const a = source.indexOf(first), b = source.indexOf(next, a); assert(a >= 0 && b > a); return source.slice(a, b); }
const helper = cut("  const resolveCompScript = `", "  if (name === \"get_bridge_status\")"), compBody = cut("  if (name === \"get_comp_details\") {", "  if (name === \"get_property_value\")"),
  layerBody = cut("  if (name === \"get_layer_details\") {", "  if (name === \"get_selected_layers\")");
// The layer block may be followed by other tool branches. The invoked name
// returns from this exact first branch; no later tool can execute.
const generator = vm.createContext({ placeholderGeometry: geometry, placeholderProtection: { normalizeProtectedPaths: value => value },
  ownedReadonlyScriptPreparation:()=>false,ownedReadonlyFirstTwoPreparation:()=>false,ownedReadonlyObservedRangePreparation:()=>false,
  optionalPositiveInteger: (args, name) => args[name] === undefined ? null : args[name], requiredPositiveInteger: (args, name) => args[name],
  optionalString: (args, name, fallback) => args[name] === undefined ? fallback : args[name], optionalBoolean: (args, name, fallback) => args[name] === undefined ? fallback : args[name],
  optionalNumber: (args, name, fallback) => args[name] === undefined ? fallback : args[name], aeLiteral: JSON.stringify,
  runExtendScriptBody: async body => ({ result: body }), toolResult: value => value });
new vm.Script(`async function getterSource(name,args){${helper}\n${compBody}\n${layerBody}\n}`).runInContext(generator);
function facts(raw) { let nodes = 0, depth = 0; function visit(value, at) { nodes++; depth = Math.max(depth, at); if (value && typeof value === "object") for (const child of Object.values(value)) visit(child, at + 1); }
  visit(JSON.parse(raw), 0); return { bytes: Buffer.byteLength(raw), nodes, depth }; }
function fixtureContext(count) {
  return vm.createContext({ count });
}
// Synthetic host values deliberately carry no production receipt or native cap.
const host = `
function CompItem(){} function Layer(){} function TextLayer(){} function ShapeLayer(){} function FootageItem(){} function FolderItem(){}
var layers=[], comp=new CompItem(); Object.assign(comp,{id:1,name:"fixture",width:1920,height:1080,pixelAspect:1,duration:2,workAreaStart:0,workAreaDuration:2,frameRate:30,frameDuration:1/30,displayStartTime:0,displayStartFrame:0,resolutionFactor:[1,1],preserveNestedFrameRate:false,time:0,bgColor:[0,0,0],motionBlur:false,numLayers:count,selectedLayers:[],layer:function(n){return layers[n-1];}});
for(var i=1;i<=count;i++){var layer=new TextLayer();Object.assign(layer,{id:i+10,index:i,name:"t"+i,matchName:"ADBE Text Layer",enabled:true,locked:false,shy:false,solo:false,startTime:0,inPoint:0,outPoint:2,guideLayer:false,adjustmentLayer:false,threeDLayer:false,collapseTransformation:false,audioEnabled:false,stretch:100,timeRemapEnabled:false,hasVideo:true,hasAudio:false,nullLayer:false,hasTrackMatte:false,isTrackMatte:false,trackMatteLayer:null,parent:null,source:null,label:1,comment:"",property:function(name){if(name==="ADBE Text Properties")return {property:function(){return {value:{text:"text",font:"fixture",fontSize:20,fillColor:[1,1,1],applyFill:true,justification:0},expressionEnabled:false};}};if(name==="ADBE Marker")return {numKeys:0};return null;}});layers.push(layer);}
var app={project:{numItems:1,item:function(){return comp;},file:{fsName:"C:/fixture/project.aep"},revision:1,renderQueue:{rendering:false,numItems:0}}};
`;
async function actualResult(name, args, count, extra = "") { const body = await generator.getterSource(name, args), context = fixtureContext(count);
  new vm.Script(host + extra).runInContext(context); const result = new vm.Script(`(function(){${body}\n})()`).runInContext(context);
  return JSON.stringify({ ok: true, result }); }
function nested(levels) { return "[".repeat(levels) + "0" + "]".repeat(levels); }
async function main() {
  const comp = await actualResult("get_comp_details", { compItemId: 1, includeLayers: true, layerLimit: 1000 }, 1000);
  // Six property rows correspond to root depth5 and five nested child branches.
  // Each leaf uses the actual getter's 80-keyframe and 20-value-array limits.
  const extra = `
var propSerial=0;function propertyBranch(depth,parent){var p={name:"p",matchName:"ADBE Fixture",propertyIndex:1,propertyDepth:6-depth,propertyType:1,parentProperty:parent,canSetExpression:true,expressionEnabled:false,expressionError:"",isTimeVarying:true,numKeys:80,selectedKeys:[],propertyValueType:1,value:[0,1,2],expression:"",numProperties:depth?1:0,keyTime:function(n){return n/30;},keyValue:function(){return [0,1,2];},keyInInterpolationType:function(){return 1;},keyOutInterpolationType:function(){return 1;},keyInTemporalEase:function(){return [{speed:0,influence:33},{speed:0,influence:33},{speed:0,influence:33}];},keyOutTemporalEase:function(){return this.keyInTemporalEase();},keyInSpatialTangent:function(){return [0,0,0];},keyOutSpatialTangent:function(){return [0,0,0];}};if(depth){var child=propertyBranch(depth-1,p);p.property=function(){return child;};}return p;}
var branch=propertyBranch(5,null); layers[0].numProperties=1;var oldProperty=layers[0].property;layers[0].property=function(name){return typeof name==="number"?branch:oldProperty(name);};
`;
  const layer = await actualResult("get_layer_details", { compItemId: 1, layerId: 11, includeProperties: true, propertyDepth: 5, propertyLimit: 1000, includeValues: true }, 1, extra);
  const fullProperties = await actualResult("get_layer_details", { compItemId: 1, layerId: 11, includeProperties: true, propertyDepth: 5, propertyLimit: 1000, includeValues: false }, 1,
    extra + `layers[0].numProperties=995;layers[0].property=function(name){return typeof name!=="number"?oldProperty(name):name===1?branch:propertyBranch(0,null);};`);
  assert.equal(JSON.parse(fullProperties).result.propertyTree.length,995); // One six-row branch plus994 leaves =1000.
  const deepParents = await actualResult("get_comp_details", { compItemId: 1, includeLayers: true, layerLimit: 1000 }, 1,
    `var tail=layers[0];for(var n=0;n<34;n++){var parent=Object.assign(new TextLayer(),layers[0],{id:100+n,index:100+n,parent:null});tail.parent=parent;tail=parent;}`);
  assert(facts(deepParents).depth>32);
  // The actual native snapshot source observes a 1000-layer graph, including
  // 64 controlled rows; it never accepts echoed caller variant facts.
  const context = fixtureContext(1000); new vm.Script(host + `var TrackMatteType={NO_TRACK_MATTE:0};for(var i=0;i<layers.length;i++)layers[i].trackMatteType=0;`).runInContext(context);
  const body = variants.inspectScript({ expectedProjectFile: "C:/fixture/project.aep", rootCompItemId: 1, variantCompItemId: 1, controlledLayerIds: Array.from({length:64},(_,i)=>i+11) });
  const snapshot = JSON.stringify({ ok: true, result: new vm.Script(`(function(){${body}\n})()`).runInContext(context) });
  const fixtureRows = [ ["actual_comp_layers1000", comp, true], ["actual_layer_propertyDepth5_keys80", layer, true], ["actual_title_graph1000_controlled64", snapshot, true],
    ["actual_layer_propertyLimit1000", fullProperties, true], ["actual_recursive_layer_parents_above_depth32", deepParents, false],
    ["outer_duplicate_ok", '{"ok":false,"ok":true,"result":{}}', false], ["embedded_duplicate_ok", '{"ok":false,"\\u006fk":true,"result":{}}', false],
    ["nested_duplicate", '{"ok":true,"result":{"id":1,"id":2}}', false], ["result_depth32", nested(32), true], ["result_depth33", nested(33), false],
    ["result_node_density_bound", "[" + "0,".repeat(524286) + "0]", true], ["result_bytes_above_bound", " ".repeat(1048576) + "0", false],
    ["invalid_utf8", Buffer.from([0x22,0xc0,0x80,0x22]), false] ];
  const rows = fixtureRows.map(([name,raw,accepted]) => { const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw); const shape = accepted ? facts(bytes.toString("utf8")) : null;
    if(shape)assert(shape.bytes <= 1048576 && shape.nodes <= 524288 && shape.depth <= 32, name); return {name,raw:bytes,accepted,shape}; });
  assert(rows[1].shape.depth > 12, "property getter needs separate result depth");
  if (process.argv[2] === "--header") { process.stdout.write("// Generated pure getter fixtures. Never production policy or authority.\nstruct GetterJsonFixture{const char* name;const char* const* chunks;std::size_t chunkCount;bool accepted;};\n");
    for(let i=0;i<rows.length;i++){const encoded=rows[i].raw.toString("base64"),chunks=encoded.match(/.{1,4096}/g)||[""];process.stdout.write(`static const char* const kGetterJsonChunks${i}[]={\n${chunks.map(value=>JSON.stringify(value)+",").join("\n")}\n};\n`);}
    process.stdout.write("static const GetterJsonFixture kGetterJsonFixtures[]={\n");for(let i=0;i<rows.length;i++)process.stdout.write(`{${JSON.stringify(rows[i].name)},kGetterJsonChunks${i},sizeof(kGetterJsonChunks${i})/sizeof(kGetterJsonChunks${i}[0]),${rows[i].accepted}},\n`);process.stdout.write("};\n"); }
  else { assert(process.argv.length === 2); process.stdout.write(JSON.stringify({schema:"ae-agent.native-json-fixtures.v1", ok:true, fixtures:rows.map(({name,raw,accepted,shape})=>({name,sha256:crypto.createHash("sha256").update(raw).digest("hex"),accepted,shape})),
    actualNativeParserTested:false, productionAuthority:false, nativeFactoriesInvoked:0, actualEffects:0})+"\n"); }
}
main().catch(error=>{process.stderr.write(error.stack+"\n");process.exitCode=1;});
