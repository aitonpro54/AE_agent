"use strict";
// Read-only проверка реально установленной CEP-панели. Не кликает lease/run и не вызывает AE.
const assert = require("assert");
const http = require("http");
const {createMcpClient} = require("./autonomous-plan-client");
function getJson(url) {
  return new Promise((resolve, reject) => {http.get(url, (response) => {
    let text = ""; response.on("data", (chunk) => {text += chunk;});
    response.on("end", () => {try {resolve(JSON.parse(text));} catch (error) {reject(error);}});
  }).on("error", reject);});
}
async function inspect() {
  const pages = await getJson("http://127.0.0.1:" + (process.env.CEP_PANEL_CDP_PORT || "8870") + "/json/list");
  const page = pages.find((item) => item.url && item.url.includes("com.codex.aemcpbridge"));
  assert(page && page.webSocketDebuggerUrl, "AE Agent CEP page is unavailable");
  const socket = new WebSocket(page.webSocketDebuggerUrl), waiting = new Map();
  let id = 0;
  socket.onmessage = (event) => {const message = JSON.parse(event.data), pending = waiting.get(message.id);
    if (pending) {waiting.delete(message.id); clearTimeout(pending.timer); pending.resolve(message);}};
  await new Promise((resolve, reject) => {socket.onopen = resolve; socket.onerror = reject;});
  const client = createMcpClient();
  try {
    const response = await new Promise((resolve, reject) => {
      const callId = ++id, timer = setTimeout(() => reject(new Error("CEP inspect timeout")), 10000);
      waiting.set(callId, {resolve, timer});
      socket.send(JSON.stringify({id: callId, method: "Runtime.evaluate", params: {returnByValue: true, expression: `(function(){
        var plan=document.getElementById("currentBridgePlan"), run=document.getElementById("runPlanButton"), dry=document.getElementById("dryRunPlanButton");
        return {title:document.title,planText:plan?plan.textContent:null,runDisabled:run?run.disabled:null,dryRunDisabled:dry?dry.disabled:null,
          cards:Array.prototype.map.call(document.querySelectorAll(".inline-plan-actions[data-action-id]"),function(row){
            return {actionId:row.getAttribute("data-action-id"),runDisabled:row.querySelector(".inline-run-plan-button").disabled,
              dryRunDisabled:row.querySelector(".inline-dry-run-button").disabled};})};
      })()`}}));
    });
    if (response.result.exceptionDetails) throw new Error("CEP inspection JavaScript failed");
    const ui = response.result.result.value;
    const server = await client.call("get_current_ai_agent_plan");
    assert(!server.isError, "Current proposal MCP read failed");
    const current = server.value.current;
    assert(ui.planText !== null, "Installed CEP does not contain current plan UI");
    if (current) {
      assert(ui.planText.includes(current.actionId), "CEP is showing a different proposal");
      assert(ui.planText.includes("v" + current.revision), "CEP revision mismatch");
      assert(ui.planText.includes(current.expiresAt), "CEP proposal expiry missing");
      if (current.project.expectedFile) assert(ui.planText.includes(current.project.expectedFile), "CEP project target mismatch");
      for (const card of ui.cards) if (card.actionId !== current.actionId) assert(card.runDisabled && card.dryRunDisabled, "Stale inline proposal remains runnable");
      if (/^(completed|failed|executing|expired|cancelled)$/.test(current.state)) assert(ui.runDisabled, "Terminal/running proposal is still runnable");
    }
    console.log(JSON.stringify({ok: true,actionId:current && current.actionId,revision:current && current.revision,state:current && current.state,
      project:current && current.project,ui}, null, 2));
  } finally {socket.close(); client.close();}
}
inspect().catch((error) => {console.error(error.message); process.exitCode = 1;});
