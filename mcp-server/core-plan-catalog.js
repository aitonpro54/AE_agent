"use strict";
const planTools = [
{name: "get_current_ai_agent_plan", description: "Read the daemon's current canonical proposal, project, revision, expiry, dry-run and last run state. No execution authority or confirmation token is returned.", inputSchema: {type: "object", properties: {}, additionalProperties: false}},
{ name: "build_solution_plan", description: "Build a reviewed deterministic AE plan using a fixed supported builder contract. Observed visual-review builders perform typed read-only inspection; compilation calls no provider and performs no project mutation. Execution retains proposal, dry-run and confirmation gates.",
    inputSchema: {type: "object", properties: {solutionId: {type: "string"}, inputs: {type: "object", description: "Explicit complete inspected evidence per the supported deterministic builder input contract."}}, required: ["solutionId", "inputs"]} },
{ name: "propose_ai_agent_plan", description: "Create a server-owned action proposal for an explicit AE plan without a provider call or AE mutation. Returns a redacted proposal for dry-run and, while the user-enabled CEP Autonomous Codex session is active, proposal-backed typed mutation. Raw JSX and destructive plans retain manual confirmation.",
    inputSchema: {type: "object", properties: {plan: {type: "object"}, requestId: {type: "string"}, parentActionId: {type: "string", description: "Failed proposal eligible for at most two inspected setter corrections. Creation/import/JSX and unknown outcomes cannot be retried this way."}}, required: ["plan"]} }
];
const SUPPORTED_BUILDERS=Object.freeze([...require("./solution-plan-builder").SUPPORTED_SOLUTION_IDS,"guarded-project-lifecycle","published-save-as-state-only-recovery","comp-visual-review-plan","text-visual-review-plan","montage-pipeline-plan"]);
function assertSupportedBuilder(id){if(typeof id!=="string"||!SUPPORTED_BUILDERS.includes(id))throw Object.assign(Error("Unsupported Core plan builder"),{code:"unsupported_core_plan_builder"});return id;}
module.exports=Object.freeze({planTools,SUPPORTED_BUILDERS,assertSupportedBuilder});
