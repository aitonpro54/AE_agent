"use strict";
// Scoped fixture: только read-only get_project_info, никогда не AE и не общий исполнитель.
const http = require("http");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const PROJECT_FILE = "C:\\Synthetic\\Autonomy.aep";
function isProjectInfo(command) { return command && command.script.includes("bitsPerChannel: project ? project.bitsPerChannel"); }
function request(port, token, route, payload) {
  return new Promise((resolve, reject) => {
    const req = http.request({hostname: "127.0.0.1", port, path: route, method: payload ? "POST" : "GET",
      headers: {"content-type": "application/json", "x-ae-bridge-token": token}}, (res) => {
      let body = ""; res.on("data", (c) => {body += c;});
      res.on("end", () => {try {resolve(JSON.parse(body));} catch (e) {reject(e);}});
    });
    req.on("error", reject); req.end(payload ? JSON.stringify(payload) : undefined);
  });
}
async function withProjectPanel(port, token, action, owner = "panel-smoke", file = PROJECT_FILE) {
  await request(port, token, "/bridge/next?panelConnectionId=" + owner + "&panelGeneration=1");
  let finished = false;
  const result = Promise.resolve().then(action).finally(() => {finished = true;});
  result.catch(() => {});
  while (!finished) {
    const response = await request(port, token, "/bridge/next?panelConnectionId=" + owner + "&panelGeneration=1");
    if (response.command) {
      if (!isProjectInfo(response.command)) throw new Error("Expected project capture only: " + response.command.script.slice(-500));
      await request(port, token, "/bridge/result", {id: response.command.id, ok: true,
        result: JSON.stringify({ok: true, result: {file, numItems: 2, activeItemName: "Synthetic"}})});
    } else await pause(10);
  }
  return result;
}
module.exports = {withProjectPanel, isProjectInfo, PROJECT_FILE, request};
