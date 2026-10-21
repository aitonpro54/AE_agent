#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { prepareToolScript, exposedTools } = require("../mcp-server/bridge-daemon");
const { createProject } = require("./placeholder-protection-fixture");
const { sha256 } = require("../mcp-server/review-evidence");

async function main() {
  const project = createProject(); // Object-only VM; no AE, daemon, AME or project file writes.
  const guid = "12345678-1234-5678-9abc-123456789abc";
  project.change(`
    app.project.revision=17;
    var guidValue=${JSON.stringify(guid)}, guidReads=0, guidWrites=0, guidError=false, guidChange="";
    Object.defineProperty(child,"dynamicLinkGUID",{get:function(){
      guidReads++;
      if(guidError)throw new Error("unsupported native getter");
      if(guidChange==="revision")app.project.revision++;
      if(guidChange==="file")app.project.file.fsName="C:/Synthetic/Changed.aep";
      if(guidChange==="project")app.project=Object.defineProperties({},Object.getOwnPropertyDescriptors(app.project));
      return guidValue;
    },set:function(){guidWrites++;throw new Error("Unexpected GUID write");}});
  `);
  const definition = exposedTools().find(tool=>tool.name === "get_comp_details");
  assert.deepEqual(definition.inputSchema.properties.includeDynamicLinkGUID.type,"boolean");
  assert.equal(definition.inputSchema.properties.includeDynamicLinkGUID.default,false);
  const legacy = await prepareToolScript("get_comp_details",{compItemId:10,includeLayers:false});
  const explicitFalse = await prepareToolScript("get_comp_details",{compItemId:10,includeLayers:false,includeDynamicLinkGUID:false});
  assert.equal(legacy.script,explicitFalse.script);
  const original = project.execute(legacy.script);
  assert.equal(original.ok,true);
  assert.equal(Object.hasOwn(original.result,"dynamicLinkGUID"),false);
  assert.equal(Object.hasOwn(original.result,"project"),false);
  assert.equal(project.read("guidReads"),0);
  const args = {compItemId:10,includeLayers:false,includeDynamicLinkGUID:true};
  const prepared = await prepareToolScript("get_comp_details",args);
  const script = prepared.script;
  function read() {
    const raw = project.execute(script);
    assert.equal(raw.ok,true,JSON.stringify(raw));
    return raw.result;
  }
  const good = read();
  assert.deepEqual(good,{...original.result,dynamicLinkGUID:guid,project:{file:"C:/Synthetic/Protected.aep",revision:17}});
  assert.equal(good.itemId,10);assert.equal(good.itemIndex,1);assert.equal(good.name,"Placeholder");
  project.change(`guidValue=${JSON.stringify(guid.toUpperCase())};`);
  assert.equal(read().dynamicLinkGUID,guid.toUpperCase(),"Preserve exact native case for AME equality");
  let negatives = 0;
  for (const expression of ["undefined","null","false","123",'""','"00000000-0000-0000-0000-000000000000"',
    '"12345678123456789abc123456789abc"',JSON.stringify(" "+guid),JSON.stringify(guid+"\n"),JSON.stringify("{"+guid+"}"),
    JSON.stringify(guid.slice(0,-1)+"z")]) {
    project.change(`guidValue=${expression};`);
    const result = read();
    assert.equal(result.ok,false);assert.equal(result.code,"capability_unavailable");
    assert.equal(result.capability,"CompItem.dynamicLinkGUID");
    assert.deepEqual(result.comp,{itemId:10,itemIndex:1,name:"Placeholder"});
    assert.equal(Object.hasOwn(result,"dynamicLinkGUID"),false);
    negatives++;
  }
  project.change("guidError=true;");
  const unavailable = read();assert.equal(unavailable.reason,"property_read_failed");negatives++;
  const toolError = await prepareToolScript("get_comp_details",args,unavailable);
  assert.equal(toolError.result.isError,true,"Native capability refusal must be a tool error");
  project.change(`guidError=false;guidValue=${JSON.stringify(guid)};`);
  for (const revision of ["undefined","null","NaN","Infinity","-1","1.5",'"17"',"9007199254740992"]) {
    project.change(`app.project.revision=${revision};`);
    assert.equal(read().reason,"project_revision_unavailable");negatives++;
  }
  project.change("app.project.revision=17;app.project.file=null;");
  assert.equal(read().reason,"saved_project_unavailable");negatives++;
  project.change('app.project.file={fsName:"C:/Synthetic/Protected.aep"};');
  for (const change of ["revision","file","project"]) {
    project.change(`guidChange=${JSON.stringify(change)};`);
    assert.equal(read().code,"stale_project");negatives++;
    project.change('guidChange="";app.project.file={fsName:"C:/Synthetic/Protected.aep"};app.project.revision=17;');
  }
  await assert.rejects(prepareToolScript("get_comp_details",{includeDynamicLinkGUID:true}),/dynamic_link_comp_item_id_required/);
  for (const flag of ["true",1,null,{}]) {
    await assert.rejects(prepareToolScript("get_comp_details",{...args,includeDynamicLinkGUID:flag}),/must be a boolean/);negatives++;
  }
  for (const hints of [{compItemId:999},{compItemIndex:2},{compName:"Root"}]) {
    const wrong = await prepareToolScript("get_comp_details",{...args,...hints});
    const raw = project.execute(wrong.script);
    assert.equal(raw.ok,false);assert.match(raw.error,/stable_comp_identity/);negatives++;
  }
  const matching = await prepareToolScript("get_comp_details",{...args,compItemIndex:1,compName:"Placeholder"});
  assert.equal(project.execute(matching.script).result.dynamicLinkGUID,guid);
  project.change("root.id=10;");
  const duplicate = project.execute(script);
  assert.equal(duplicate.ok,false);assert.match(duplicate.error,/stable_comp_identity_missing_or_ambiguous/);negatives++;
  project.change("root.id=20;");
  assert.equal(project.read("guidWrites"),0);assert.equal(project.read("writes"),0);assert.deepEqual(project.read("undo"),[]);
  console.log(JSON.stringify({ok:true,suite:"comp-dynamic-link-read-smoke",negatives,defaultLegacyUnchanged:true,
    exactIdentity:true,projectRevisionBracket:true,guidWrites:0,projectWrites:0,live:false,scriptSha256:sha256(script)}));
}

if (require.main === module) main().catch(error=>{console.error(error);process.exitCode=1;});
