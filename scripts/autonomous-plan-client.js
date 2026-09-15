"use strict";

const path = require("path");
const readline = require("readline");
const {spawn} = require("child_process");

function createMcpClient() {
  const child = spawn(process.execPath, [path.resolve(__dirname, "../mcp-server/mcp-adapter.js")],
    {env: {...process.env, AE_DAEMON_AUTO_START: "0"}, windowsHide: true, stdio: ["pipe", "pipe", "ignore"]});
  let serial = 0;
  const pending = new Map();
  readline.createInterface({input: child.stdout}).on("line", (line) => {
    let message; try {message = JSON.parse(line);} catch (_error) {return;}
    const slot = pending.get(message.id); if (!slot) return;
    pending.delete(message.id); clearTimeout(slot.timer);
    if (message.error) slot.reject(new Error(message.error.message)); else slot.resolve(message.result);
  });
  child.on("exit", () => {for (const slot of pending.values()) {clearTimeout(slot.timer); slot.reject(new Error("MCP adapter exited"));} pending.clear();});
  function rpc(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++serial;
      const timer = setTimeout(() => {pending.delete(id); reject(new Error("MCP result timeout; inspect outcome before retry"));}, 300000);
      pending.set(id, {resolve, reject, timer});
      child.stdin.write(JSON.stringify({jsonrpc: "2.0", id, method, params}) + "\n");
    });
  }
  async function call(name, args = {}) {
    await ready;
    const result = await rpc("tools/call", {name, arguments: args});
    const text = result.content && result.content.find((item) => item.type === "text");
    let value; try {value = JSON.parse(text.text);} catch (_error) {value = {error: text && text.text};}
    return {isError: Boolean(result.isError), value};
  }
  const ready = rpc("initialize", {protocolVersion: "2024-11-05", capabilities: {}, clientInfo: {name: "ae-agent-autonomous-plan-client", version: "3.0.0"}});
  ready.then(() => child.stdin.write(JSON.stringify({jsonrpc: "2.0", method: "notifications/initialized"}) + "\n"), () => {});
  return {rpc, call, close: () => child.kill()};
}

function correctivePlan(plan) {
  const steps = [];
  for (const step of plan.steps) {
    if (/^get_/.test(step.tool)) continue;
    const args = {...step.args};
    delete args.idempotencyKey; delete args.idempotencyScope;
    const indices = args.layerIndices || (args.layerIndex ? [args.layerIndex] : []);
    const reads = indices.length ? indices.map((layerIndex) => ({tool: "get_layer_details", args: {compItemIndex: args.compItemIndex, compName: args.compName, layerIndex}}))
      : [{tool: "get_comp_details", args: {compItemIndex: args.compItemIndex, compName: args.compName}}];
    steps.push(...reads, {...step, args}, ...reads);
  }
  return {...plan, summary: "Проверенная ограниченная корректировка: " + (plan.summary || "typed plan"), steps};
}

async function executeTypedStage(client, plan, report = () => {}) {
  let parentActionId;
  let currentPlan = plan;
  for (let attempt = 0; attempt <= 2; attempt++) {
    const status = (await client.call("get_bridge_status")).value;
    if (!status.autonomousSession || !status.autonomousSession.active) throw new Error("autonomous_session_not_active: включите сессию в CEP");
    if (currentPlan.steps.some((step) => /run_extendscript|delete|cleanup|remove/.test(step.tool))) throw new Error("autonomous_session_scope_blocked");
    const proposed = await client.call("propose_ai_agent_plan", {plan: currentPlan, ...(parentActionId ? {parentActionId} : {})});
    if (proposed.isError) throw Object.assign(new Error(proposed.value.error || "proposal_failed"), {result: proposed.value});
    currentPlan = proposed.value.plan || currentPlan;
    const proposal = proposed.value.proposal;
    const args = {actionId: proposal.actionId, payloadHash: proposal.action.payloadHash, previewHash: proposal.action.previewHash,
      riskLevel: proposal.risk.level, riskPolicyVersion: proposal.confirmation.riskPolicyVersion, maxSteps: 50};
    const preview = await client.call("run_ai_agent_plan", {...args, dryRun: true});
    report({phase: "dry_run", attempt, proposalId: proposal.actionId, run: preview.value});
    if (preview.isError || !preview.value.ok) throw Object.assign(new Error(preview.value.error || "dry_run_failed"), {result: preview.value});
    const executed = await client.call("run_ai_agent_plan", {...args, dryRun: false});
    report({phase: "execution", attempt, proposalId: proposal.actionId, run: executed.value});
    if (!executed.isError && executed.value.ok) return executed.value;
    const directive = executed.value.repairDirective;
    if (!directive || !directive.eligible || attempt >= 2) throw Object.assign(new Error(executed.value.error || "typed_stage_failed"), {result: executed.value});
    parentActionId = proposal.actionId;
    currentPlan = correctivePlan(currentPlan);
  }
  throw new Error("repair_budget_exhausted");
}
module.exports = {createMcpClient, correctivePlan, executeTypedStage};
