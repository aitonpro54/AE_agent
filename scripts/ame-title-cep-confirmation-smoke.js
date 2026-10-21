"use strict";
// Bounded VM extraction of the existing protected plan branch. No browser, CEP,
// credentials, native process or HTTP requests are used by this smoke.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../cep-panel/panel.js"), "utf8");
function extract(name) { const start = source.indexOf("  function " + name + "("); assert(start >= 0); const end = source.indexOf("\n  }\n", start); assert(end > start); return source.slice(start, end + 5); }
let groups = 0;
function fixture(options = {}) {
  const sha = "a".repeat(64), pins = { actionId: "act_fixture", revision: 1 }, requests = [], statuses = [], confirms = [];
  const args = { targetSpecifier: "ame-26.0", expectedProcess: { pid: 77, startedAt: "2026-10-13T00:00:00.000Z" }, batchId: "11111111-1111-4111-8111-111111111111", manualQueueMode: "cep_user_declaration_v2", completedOwnedPrefix: [], manualQueueManifestSha25664: sha };
  const manifest = { schema: "ae-agent-ame-manual-queue-manifest.v2", jobs: [{ jobId: "one", source: { path: "variant.aep", guid: "exact-guid" }, preset: { path: "exact.epr" }, outputPath: "one.mov" }], completedOwnedPrefix: [] };
  const proposal = { actionId: pins.actionId, requestId: "request-fixture", confirmation: { confirmationToken: "private-fixture", surface: "cep-panel", sessionId: "fixture" }, action: { payloadRef: "ref", payloadHash: sha, previewHash: sha }, risk: { level: "mutating" } };
  const context = { console, Date, Object, JSON, activeAmeQueueFrame: null, panelLifecycleEpoch: 1, panelConnectionGeneration: 1, panelConnectionId: "panel", chatInFlight: false, currentBridgePlan: pins,
    lastPlanResult: { plan: { steps: [{ tool: "start_ame_title_batch", args }] }, planValidation: { mutatingCount: 1 } }, lastAcceptedDryRun: { ok: true, runId: "dry-run-fixture", planKey: "key", requestId: proposal.requestId, pins },
    getBaseUrl: () => "http://fixture", getToken: () => "fixture-only", currentBridgePlanMatchesPins: (a, b) => a.actionId === b.actionId && a.revision === b.revision,
    currentBridgePlanPins: () => pins, currentPlanKey: () => "key", m100ActionProposalForResult: () => proposal, currentProposalBlockReason: () => null, classificationBlocksRun: () => false, rawExtendscriptDryRunGateReady: () => false,
    m100ConfirmationSessionId: () => "fixture", setPlanRunStatus: (...values) => statuses.push(values), refreshCurrentBridgePlan: (_args, done) => done(null),
    invokePanelUI: () => { throw Error("unexpected generic route"); }, window: { confirm: value => { confirms.push(value); return options.cancel !== true; } },
    request: (_method, route, body, done) => {
      requests.push({ route, body });
      if (route === "/tools/call") {
        const response = { ok: true, manifestHash: options.hashChanged ? "b".repeat(64) : sha, manifest, declaration: context.AME_QUEUE_DECLARATION };
        if (options.panelChanged) context.panelConnectionGeneration++;
        done(null, { result: { content: [{ text: JSON.stringify(response) }] } });
      } else done(options.unknown ? { status: 0, code: "timeout", message: "unknown transport" } : null, options.unknown ? null : { run: { id: "run-fixture", ok: true } });
    },
    rememberPlanRun: () => {}, setChatBusy: () => {}, updateChatAvailability: () => {}, appendChatMessage: () => {}, formatPlanRun: () => "fixture", showPlanRunFinishedStatus: () => {}, appendOperationUsageReport: () => {}, log: () => {}, currentPlanSyncAt: 0 };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('  var AME_QUEUE_DECLARATION='), source.indexOf("\n", source.indexOf('  var AME_QUEUE_DECLARATION='))) + "\n" + ["ameQueueFrameCurrent", "runLastPlan", "uiPlanAction"].map(extract).join("\n"), context);
  return { context, requests, statuses, confirms };
}
for (const event of [undefined, { isTrusted: false }, { isTrusted: "true" }]) { const f = fixture(); f.context.uiPlanAction(false, null, event); assert.equal(f.requests.length, 0); } groups++;
{
  const f = fixture(); f.context.runLastPlan(false, true, () => {}, { strict: true, prepare: false }); assert.equal(f.requests.length, 0); assert.equal(f.statuses.at(-1)[0].includes("настоящий"), true); groups++;
}
{
  const f = fixture(); f.context.uiPlanAction(false, null, { isTrusted: true }); assert.deepEqual(f.requests.map(r => r.route), ["/tools/call", "/agents/ame/title-start/run"]);
  assert.equal(f.confirms.length, 1); for (const text of ["variant.aep", "exact-guid", "exact.epr", "one.mov", "API полный состав не проверяет"]) assert(f.confirms[0].includes(text));
  const witness = f.requests[1].body.ameManualQueueWitness; assert.equal(witness.trustedGesture, true); assert.equal(witness.acceptedDryRunId, "dry-run-fixture"); assert.equal(f.context.activeAmeQueueFrame.alive, false); groups++;
}
for (const options of [{ cancel: true }, { hashChanged: true }, { panelChanged: true }]) { const f = fixture(options); f.context.uiPlanAction(false, null, { isTrusted: true }); assert.equal(f.requests.length, 1); assert.equal(f.context.activeAmeQueueFrame.alive, false); } groups++;
{
  const f = fixture({ unknown: true }); f.context.uiPlanAction(false, null, { isTrusted: true }); assert.equal(f.requests.filter(r => r.route === "/agents/ame/title-start/run").length, 1); assert.equal(f.context.activeAmeQueueFrame.alive, false); groups++;
}
console.log(JSON.stringify({ status: "passed", groups, proof: "offline CEP protected branch VM only; no actual gesture, transport or AME proof" }));
