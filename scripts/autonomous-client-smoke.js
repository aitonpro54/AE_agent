"use strict";
const assert = require("assert");
const {executeTypedStage} = require("./autonomous-plan-client");
const {buildSemanticVerification} = require("../mcp-server/semantic-verification");

function verifyCreatedComp(overrides, omitRead) {
  const args = {name: "CODX_QA_COMP", width: 1280, height: 720, pixelAspect: 1, duration: 6, frameRate: 25, bgColor: [0.1, 0.2, 0.3]};
  const steps = [{index: 1, tool: "create_comp", args, status: "completed", mutatesProject: true, result: {itemIndex: 77, ...args}}];
  if (!omitRead) steps.push({index: 2, tool: "get_comp_details", args: {compItemIndex: 77}, status: "completed", result: {itemIndex: 77, ...args, ...overrides}});
  return buildSemanticVerification({steps}, {ok: true, dryRun: false, steps});
}
assert.equal(verifyCreatedComp({}).status, "passed");
for (const wrong of [{itemIndex: 78}, {duration: 5}, {frameRate: 30}, {name: "different"}, {bgColor: [0, 0, 0]}]) {
  assert.equal(verifyCreatedComp(wrong).failedChecks, 1, JSON.stringify(wrong));
}
assert.equal(verifyCreatedComp({}, true).failedChecks, 1);

function verifyAddedLayer(change = () => {}, omit = false) {
  const layer = {id: 901, index: 1, name: "Linked", source: {itemIndex: 8, name: "Source"}, startTime: 2, inPoint: 2, outPoint: 6};
  const comp = {itemIndex: 7, name: "Target", numLayers: 1, layers: [layer]};
  change(comp, layer);
  const steps = [{index: 1, tool: "add_project_item_to_comp", mutatesProject: true, status: "completed",
    args: {compName: "Target", itemName: "Source", name: "Linked", startTime: 2, duration: 4},
    result: {comp: {itemIndex: 7, name: "Target"}, sourceItem: {name: "Source"}, layer: {id: 901, index: 1, name: "Linked"}}}];
  if (!omit) steps.push({index: 2, tool: "get_comp_details", status: "completed", result: comp});
  return buildSemanticVerification({}, {ok: true, dryRun: false, steps});
}
assert.equal(verifyAddedLayer().status, "passed");
for (const change of [(c,l)=>{l.source.name="Wrong";},(c,l)=>{l.outPoint=5;},(c,l)=>{l.id=902;},c=>{c.name="Wrong";}]) {
  assert.equal(verifyAddedLayer(change).failedChecks, 1);
}
assert.equal(verifyAddedLayer(()=>{},true).failedChecks, 1);

async function runClient(failures, eligible = true, tool = "set_layer_metadata") {
  const calls = [], reports = [];
  let serial = 0, realRuns = 0;
  const client = {async call(name, args) {
    calls.push({name, args});
    if (name === "get_bridge_status") return {value: {autonomousSession: {active: true}}};
    if (name === "propose_ai_agent_plan") return {value: {proposal: {actionId: `act_${++serial}`, action: {payloadHash: "payload", previewHash: "preview"}, risk: {level: "medium"}, confirmation: {riskPolicyVersion: "v1"}}}};
    if (args.dryRun) return {value: {ok: true, executedCount: 0}};
    const ok = ++realRuns > failures;
    return {isError: !ok, value: {ok, error: ok ? undefined : "verification_required", repairDirective: {eligible}}};
  }};
  let result, error;
  try { result = await executeTypedStage(client, {summary: "QA", steps: [{tool, args: {compItemIndex: 77, expectedCompName: "CODX_QA_COMP", layerIndices: [1, 2], expectedLayerNames: ["a", "b"], audioEnabled: false}}]}, (event) => reports.push(event)); }
  catch (caught) { error = caught; }
  return {calls, reports, realRuns, result, error};
}
(async () => {
  const repaired = await runClient(1);
  assert(repaired.result.ok);
  const proposals = repaired.calls.filter((call) => call.name === "propose_ai_agent_plan");
  assert.equal(proposals[1].args.parentActionId, "act_1");
  assert.deepEqual(proposals[1].args.plan.steps.map((step) => step.tool), ["get_layer_details", "get_layer_details", "set_layer_metadata", "get_layer_details", "get_layer_details"]);
  assert.equal(repaired.reports.filter((event) => event.phase === "dry_run").length, 2);
  const exhausted = await runClient(5);
  assert(exhausted.error); assert.equal(exhausted.realRuns, 3);
  const forbiddenRepeat = await runClient(1, false);
  assert(forbiddenRepeat.error); assert.equal(forbiddenRepeat.realRuns, 1);
  const raw = await runClient(0, false, "run_extendscript");
  assert(raw.error); assert.equal(raw.realRuns, 0); assert(!raw.calls.some((call) => call.name === "propose_ai_agent_plan"));
  console.log("Autonomous client smoke passed: exact independent comp read-back, corrective inspection, fresh dry-runs, bounded retries, fail closed.");
})().catch((error) => {console.error(error); process.exitCode = 1;});
