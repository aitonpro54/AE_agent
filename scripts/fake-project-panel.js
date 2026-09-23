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
function panelRoute(owner, file) {
  const query = new URLSearchParams({
    panelConnectionId: owner,
    panelGeneration: "1",
    projectFile: file
  });
  return `/bridge/next?${query.toString()}`;
}
function commandIdentity(command) {
  return {
    id: command.id,
    executionId: command.executionId,
    leaseId: command.leaseId,
    panelConnectionId: command.leaseOwner.panelConnectionId,
    panelGeneration: command.leaseOwner.panelGeneration,
    contractVersion: command.contractVersion
  };
}
async function submitCommand(port, token, command) {
  const identity = commandIdentity(command);
  const submitted = await request(port, token, "/bridge/submitted", identity);
  if (!submitted.ok) throw new Error(`Command submit failed: ${JSON.stringify(submitted)}`);
  return identity;
}
async function postCommandResult(port, token, command, result, identity = commandIdentity(command)) {
  const completed = await request(port, token, "/bridge/result", {
    ...identity,
    ok: true,
    result: JSON.stringify({ok: true, result})
  });
  if (!completed.ok) throw new Error(`Command result failed: ${JSON.stringify(completed)}`);
  return completed;
}
async function completeCommand(port, token, command, result) {
  const identity = await submitCommand(port, token, command);
  return postCommandResult(port, token, command, result, identity);
}
async function failCommand(port, token, command, error) {
  const identity = await submitCommand(port, token, command);
  const failed = await request(port, token, "/bridge/result", {
    ...identity,
    ok: false,
    error: String(error || "Synthetic command failure")
  });
  if (!failed.ok) throw new Error(`Command failure result was rejected: ${JSON.stringify(failed)}`);
  return failed;
}
async function withProjectPanel(port, token, action, owner = "panel-smoke", file = PROJECT_FILE) {
  const route = panelRoute(owner, file);
  await request(port, token, route);
  let finished = false;
  const result = Promise.resolve().then(action).finally(() => {finished = true;});
  result.catch(() => {});
  while (!finished) {
    const response = await request(port, token, route);
    if (response.command) {
      if (!isProjectInfo(response.command)) throw new Error("Expected project capture only: " + response.command.script.slice(-500));
      await completeCommand(port, token, response.command, {file, numItems: 2, activeItemName: "Synthetic"});
    } else await pause(10);
  }
  return result;
}
module.exports = {withProjectPanel, isProjectInfo, PROJECT_FILE, request, panelRoute, commandIdentity,
  submitCommand, postCommandResult, completeCommand, failCommand};
