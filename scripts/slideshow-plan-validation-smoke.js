"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const {spawn} = require("child_process");
const {createMcpClient} = require("./autonomous-plan-client");
const {buildGeneratedFixturePlan} = require("./slideshow-fixture-plan");
const {buildSlideshowPlan} = require("../mcp-server/slideshow-plan-builder");
const {withProjectPanel} = require("./fake-project-panel");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function structuralLayer(layerId,name,duration){return{layerId,name,sourceType:"none",sourceItemId:null,sourceName:null,startTime:0,inPoint:0,outPoint:duration,stretch:100,enabled:true,audioEnabled:false,timeRemapEnabled:false,guideLayer:false,adjustmentLayer:false,threeDLayer:false,collapseTransformation:false};}
async function main() {
  const port = 41000 + Math.floor(Math.random() * 7000);
  process.env.AE_BRIDGE_PORT = String(port);
  process.env.AE_BRIDGE_TOKEN = "isolated-slideshow-validation";
  process.env.AE_BRIDGE_LOG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "slideshow-validation-"));
  process.env.AE_DAEMON_AUTO_START = "0";
  const daemon = spawn(process.execPath, [path.resolve(__dirname, "../mcp-server/bridge-daemon.js")], {env: process.env, windowsHide: true, stdio: "ignore"});
  let client;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100 && !ready; attempt++) {
      ready = await new Promise((resolve) => http.get(`http://127.0.0.1:${port}/health`, (response) => {response.resume(); resolve(response.statusCode === 200);}).on("error", () => resolve(false)));
      if (!ready) await pause(50);
    }
    assert(ready, "Isolated daemon failed to start");
    client = createMcpClient();
    const project = "C:\\Fixture\\test.aep";
    const fixture = buildGeneratedFixturePlan(project, "C:\\Fixture\\test.png", "C:\\Fixture\\tone.wav", "VALIDATE");
    const prefix = "CODX_PLAN_VALIDATION_";
    const production = buildSlideshowPlan({schema: "ae-agent-slideshow.v2", projectPath: project, duration: 8, frameRate: 30, width: 1280, height: 720,
      prefix, masterName: prefix + "MASTER", audioRouting: "master-only", events: [{id: "01", scene: 1, start: 0, duration: 8, title: "Fixture title", hero: "both", images: [], audioOnly: [], captions: []}]},
    {suhanov: ["Synthetic article."], kurnikov: ["Synthetic article."], both: ["Synthetic article."]},
    {finalComp: {itemIndex: 1,itemId:101,name: "Final Comp", duration: 10, numLayers: 2,structureSchema:"ae-agent-comp-structure.v1",layers:[structuralLayer(1001,"CONTROL",10),structuralLayer(1002,"COLOR",10)], controlLayers: {CONTROL: {sourceLayerName: "CONTROL", effectCount: 0}, COLOR: {sourceLayerName: "COLOR", effectCount: 0}}}, scenes: [{scene: 1, itemIndex: 2,itemId:102,name: "Scene 1", duration: 4, numLayers: 2,structureSchema:"ae-agent-comp-structure.v1",layers:[structuralLayer(1003,"Scene top",4),structuralLayer(1004,"Scene bottom",4)], introEffectCount: 0, mainEffectCount: 0}]});
    const results = [];
    for (const stage of [...fixture.stages, ...production.stages]) {
      const validated = await client.call("validate_ai_agent_plan", {plan: stage, repairPlan: false});
      const validation = validated.value.validation || validated.value;
      assert(!validated.isError && validation && validation.ok, `${stage.name}: ${JSON.stringify({error: validated.value.error, invalid: validation.steps && validation.steps.filter((step) => !step.valid)})}`);
      assert(validation.steps.every((step) => step.tool !== "run_extendscript" && step.tool !== "run_extendscript_file"));
      assert.equal(validation.classification.rawExtendscriptStepCount, 0, "Narrow typed slideshow tools must not be classified as raw JSX");
      results.push({name: stage.name, steps: validation.steps.length, ok: true});
    }
    const proposed = await withProjectPanel(port, process.env.AE_BRIDGE_TOKEN, () => client.call("propose_ai_agent_plan", {plan: production.stages[0]}), "slideshow-validation", project);
    assert(!proposed.isError, JSON.stringify(proposed.value));
    assert.equal(proposed.value.proposal.risk.level, "mutating");
    const preview = await withProjectPanel(port, process.env.AE_BRIDGE_TOKEN, () => client.call("run_ai_agent_plan", {actionId: proposed.value.proposal.actionId, dryRun: true, maxSteps: 50}), "slideshow-validation", project);
    assert(!preview.isError && preview.value.ok, JSON.stringify({error: preview.value.error, steps: preview.value.steps}));
    assert.equal(preview.value.executedCount, 0);
    console.log(JSON.stringify({ok: true, liveAeCalled: false, stages: results}));
  } finally {if (client) client.close(); daemon.kill();}
}
main().catch((error) => {console.error(error.stack || error.message); process.exitCode = 1;});
