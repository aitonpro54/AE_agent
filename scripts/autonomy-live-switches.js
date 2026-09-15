"use strict";
const assert = require("assert");
const {createMcpClient, executeTypedStage} = require("./autonomous-plan-client");
async function main() {
  const name = process.argv[2];
  assert(typeof name === "string" && /^CODX_AUTONOMY_QA_[A-Z0-9_-]+_MASTER$/.test(name), "Only a generated autonomy QA master is allowed");
  const client = createMcpClient();
  try {
    const project = await client.call("get_project_info"), inspected = await client.call("get_comp_details", {compName: name, includeLayers: true, layerLimit: 100});
    assert(!project.isError && !inspected.isError);
    const comp = inspected.value;
    const audio = comp.layers.find((layer) => layer.name.startsWith(name.slice(0, -6) + "AUDIO_") && layer.hasAudio === true);
    assert(audio, "Generated audible test layer was not found");
    const compTarget = {compItemIndex: comp.itemIndex, expectedCompName: name};
    const layerTarget = {...compTarget, layerIndices: [audio.index], expectedLayerNames: [audio.name]};
    const readComp = () => ({tool: "get_comp_details", args: {compItemIndex: comp.itemIndex, includeLayers: false}});
    const readLayer = () => ({tool: "get_layer_details", args: {compItemIndex: comp.itemIndex, layerIndex: audio.index, includeProperties: false}});
    const plan = {summary: "Живая проверка независимых motionBlur, видимости и аудио на generated QA", targetProject: {file: project.value.file}, requiresCheckpoint: true,
      steps: [
        {tool: "set_comp_properties", args: {...compTarget, motionBlur: true}}, readComp(),
        {tool: "set_layer_metadata", args: {...layerTarget, enabled: true, audioEnabled: false, motionBlur: true}}, readLayer(),
        {tool: "set_layer_metadata", args: {...layerTarget, enabled: false, audioEnabled: true, motionBlur: false}}, readLayer(),
        {tool: "set_comp_properties", args: {...compTarget, motionBlur: false}}, readComp()
      ]};
    const run = await executeTypedStage(client, plan, (event) => console.log(JSON.stringify(event)));
    console.log(JSON.stringify({ok: run.ok, runId: run.id, comp: name, layer: audio.name, verification: run.semanticVerification}));
  } finally {client.close();}
}
main().catch((error) => {console.error(JSON.stringify({ok: false, error: error.message, result: error.result})); process.exitCode = 1;});
