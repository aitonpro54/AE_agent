"use strict";
// Actual fixed getter in a VM plus parent-run native factual parser fixtures.
// No daemon import, native instance, child, project or production authority.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),crypto=require("node:crypto");
const source=fs.readFileSync(path.join(__dirname,"../mcp-server/bridge-daemon.js"),"utf8"),begin=source.indexOf("function ownedObservedRootTiming(comp)"),end=source.indexOf("// Fixed factual getter,",begin);
assert(begin>=0&&end>begin);const getter=source.slice(begin,end);
function fixture(extra=""){const context=vm.createContext({});new vm.Script(`function CompItem(){};var comp=Object.assign(new CompItem(),{id:1,name:"TITR_ALL_VARIANTS_FHD",width:1920,height:1080,frameRate:25,frameDuration:0.04,duration:40,displayStartTime:0,displayStartFrame:0});${extra}\n${getter}`).runInContext(context);
  return {context,read:()=>JSON.parse(JSON.stringify(new vm.Script("ownedObservedRootTiming(comp)").runInContext(context)))};}
function main(){const cases=[],native=[];function check(name,body){body();cases.push({name,result:"PASS"});}
  const positive=fixture().read(),comp={itemId:1,name:"TITR_ALL_VARIANTS_FHD",width:1920,height:1080,duration:40,frameRate:25,displayStartTime:0,displayStartFrameSupported:true,displayStartFrame:0};
  check("actual_getter_precision17_and_identity",()=>{assert.equal(positive.schema,"ae-agent.owned-observed-root-timing.v1");assert.equal(positive.frameRate,"25.000000000000000");assert.equal(positive.frameDuration,"0.040000000000000001");assert.equal(positive.duration,"40.000000000000000");assert.equal(positive.displayStartTime,"0.0000000000000000");assert.equal(positive.displayStartFrame,0);});
  check("actual_missing_display_frame_is_explicit",()=>{assert.equal(fixture("delete comp.displayStartFrame;").read().displayStartFrame,null);});
  check("actual_unsupported_display_getter_is_explicit",()=>{assert.equal(fixture('Object.defineProperty(comp,"displayStartFrame",{get:function(){throw Error("unsupported");}});').read().displayStartFrame,null);});
  check("actual_negative_signed_display_frame_retained",()=>{const value=fixture("comp.displayStartFrame=-25;comp.displayStartTime=-1;").read();assert.equal(value.displayStartFrame,-25);assert.equal(value.displayStartTime,"-1.0000000000000000");});
  for(const key of ["frameRate","frameDuration","duration","displayStartTime","displayStartFrame"])check("actual_negative_zero_"+key+"_closed",()=>assert.throws(()=>fixture("comp."+key+"=-0;").read()));
  for(const [name,extra] of [["nonfinite","comp.duration=Infinity;"],["number_string","comp.frameRate='25';"],["fraction_display","comp.displayStartFrame=1.5;"],["display_overflow","comp.displayStartFrame=2147483648;"],["dimension_bound","comp.width=8193;"],["foreign_comp","comp={};"],["absent_frame_duration","delete comp.frameDuration;"]])check("actual_"+name+"_closed",()=>assert.throws(()=>fixture(extra).read()));
  function input(name,change,accepted,n=1000,p=25,q=1){const raw={timing:structuredClone(positive),comp:structuredClone(comp)};change(raw);native.push({name,raw:JSON.stringify(raw),accepted,n,p,q});}
  input("positive_exact_original_comp_join",()=>{},true);
  input("positive_absent_display_positive_zero",v=>{v.timing.displayStartFrame=null;v.comp.displayStartFrameSupported=false;v.comp.displayStartFrame=null;},true);
  input("positive_negative_display",v=>{v.timing.displayStartTime=(-1).toPrecision(17);v.timing.displayStartFrame=-25;v.comp.displayStartTime=-1;v.comp.displayStartFrame=-25;},true);
  input("positive_30000_1001_exact_host_tuple",v=>{const fps=30000/1001,delta=1001/30000;v.timing.frameRate=fps.toPrecision(17);v.timing.frameDuration=delta.toPrecision(17);v.timing.duration=(1000*delta).toPrecision(17);v.comp.frameRate=fps;v.comp.duration=1000*delta;},true,1000,30000,1001);
  input("positive_ceiling_8191",v=>{v.timing.duration=(8191*0.04).toPrecision(17);v.comp.duration=8191*0.04;},true,8191);
  for(const [name,change] of [
    ["schema_foreign",v=>{v.timing.schema="caller";}],["extra_ready",v=>{v.timing.ready=true;}],["missing_duration",v=>{delete v.timing.duration;}],
    ["numeric_authority_field",v=>{v.timing.frameRate=25;}],["insufficient_precision",v=>{v.timing.frameDuration="0.04";}],["unsupported_exponent_form",v=>{v.timing.duration="4.0000000000000000e+1";}],
    ["negative_zero_authority",v=>{v.timing.displayStartTime="-0.0000000000000000";}],["leading_zero_authority",v=>{v.timing.duration="040.000000000000000";}],
    ["display_frame_string",v=>{v.timing.displayStartFrame="0";}],["display_frame_fraction",v=>{v.timing.displayStartFrame=0.5;}],["display_frame_overflow",v=>{v.timing.displayStartFrame=2147483648;}],
    ["nonzero_start_without_frame",v=>{v.timing.displayStartFrame=null;v.timing.displayStartTime=(1).toPrecision(17);v.comp.displayStartFrameSupported=false;v.comp.displayStartTime=1;}],
    ["display_model_mismatch",v=>{v.timing.displayStartFrame=1;}],["ambiguous_unaligned_duration",v=>{v.timing.duration=(40.01).toPrecision(17);v.comp.duration=40.01;}],
    ["unsupported_decimal_29_97",v=>{v.timing.frameRate=(29.97).toPrecision(17);v.comp.frameRate=29.97;}],
    ["above_ceiling",v=>{v.timing.duration=(8192*0.04).toPrecision(17);v.comp.duration=8192*0.04;}],["below_four",v=>{v.timing.duration=(3*0.04).toPrecision(17);v.comp.duration=3*0.04;}],
    ["foreign_comp_id",v=>{v.comp.itemId=2;}],["foreign_name",v=>{v.comp.name="other";}],["dimension_drift",v=>{v.comp.width=1280;}],
    ["raw_duration_drift",v=>{v.comp.duration=40.04;}],["raw_rate_drift",v=>{v.comp.frameRate=30;}],["raw_display_drift",v=>{v.comp.displayStartTime=1;}],
    ["raw_number_string",v=>{v.comp.frameRate="25";}],["raw_signed_frame_string",v=>{v.comp.displayStartFrame="0";}],["raw_feature_claim_mismatch",v=>{v.comp.displayStartFrameSupported=false;}],
    ["identity_number_string",v=>{v.timing.compItemId="1";}],["width_bound",v=>{v.timing.width=8193;}]
  ])input(name,change,false);
  if(process.argv[2]==="--header"){assert.equal(process.argv.length,3);process.stdout.write("// Factual observed getter fixtures, no native capabilities.\nstruct ObservedTimingCaptureFixture{const char* name;const char* raw;bool accepted;unsigned n,p,q;};\nstatic const ObservedTimingCaptureFixture kObservedTimingCaptureFixtures[]={\n");
    for(const row of native)process.stdout.write(`{${JSON.stringify(row.name)},R"OTFIXTURE(${row.raw})OTFIXTURE",${row.accepted},${row.n},${row.p},${row.q}},\n`);process.stdout.write("};\n");}
  else{assert.equal(process.argv.length,2);process.stdout.write(JSON.stringify({schema:"ae-agent.observed-timing-capture-source-proof.v1",ok:true,cases,nativeFixtures:native.map(({raw,...row})=>({...row,sha256:crypto.createHash("sha256").update(raw).digest("hex")})),nativeTestsRun:false,nativeFactories:0,actualAe:false,effects:0,authority:false})+"\n");}}
try{main();}catch(error){process.stderr.write(error.stack+"\n");process.exitCode=1;}
