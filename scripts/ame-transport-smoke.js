"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const transport = require("../mcp-server/ame-transport");
let acorn;
try { acorn = require("internal/deps/acorn/acorn/dist/acorn"); }
catch (error) { throw Error("Strict ES3 parser required: run node --expose-internals. " + error.message); }
const nonce = "11111111-1111-4111-8111-111111111111";
const nextNonce = "22222222-2222-4222-8222-222222222222";
const input = { targetSpecifier: "ame-26.0", expectedSessionNonce: "cold-session", timeoutMs: 1000 };
const args = transport.validateInput(input);
let checks = 0;
function check(name, fn) { fn(); checks++; }
function metadata(names) { return { methods: names.map(name => ({ name })), properties: [{ name: "status" }] }; }
function ameFixture(options = {}) {
  const calls = [], mutators = [];
  const denied = name => () => { mutators.push(name); throw Error("mutation forbidden: " + name); };
  const host = { reflect: metadata(["getFormatList", "getBatchEncoderStatus", "isBatchRunning", "runBatch"]),
    getFormatList() { calls.push("getFormatList"); return ["H.264", "QuickTime"];
    }, getBatchEncoderStatus() { calls.push("getBatchEncoderStatus"); return "stopped"; },
    isBatchRunning() { calls.push("isBatchRunning"); return false; }, runBatch: denied("runBatch"), createEncoderForFormat: denied("createEncoderForFormat") };
  const frontend = { reflect: metadata(["addDLToBatch", "getDLItemsAtRoot"]), addDLToBatch: denied("addDLToBatch"), addItemToBatch: denied("addItemToBatch") };
  const batch = { reflect: metadata(["start", "stop"]), start: denied("start"), stop: denied("stop") };
  const app = { buildNumber: "52", reflect: metadata(["getFrontend", "getEncoderHost", "getBatchEncoder"]),
    getFrontend() { calls.push("getFrontend"); return frontend; }, getEncoderHost() { calls.push("getEncoderHost"); return host; },
    getBatchEncoder() { calls.push("getBatchEncoder"); return batch; } };
  if (options.readError) host.getFormatList = () => { throw Error("backend read failure"); };
  const global = { aeAgentAMEProbeSessionNonce: options.session || "cold-session" };
  const context = vm.createContext({ app, BridgeTalk: { appSpecifier: options.target || "ame-26.0" }, $: { global }, JSON: undefined });
  vm.runInContext("Array.prototype.map=undefined;Array.prototype.includes=undefined;Array.prototype.filter=undefined;", context);
  const body = vm.runInContext(transport.ameMessage(options.nonce || nonce), context);
  return { body, parsed: JSON.parse(body), calls, mutators, global };
}
function senderFixture(options = {}) {
  let clock = 10000, sends = 0, pumps = 0, launchCalls = 0, saveCalls = 0;
  const global = {}, messages = [];
  function DateFixture() { this.getTime = () => clock; }
  const project = { file: { fsName: "C:\\fixture\\source.aep" }, dirty: true, reflect: metadata(["save", "saveWithDialog", "copy"]),
    save() { saveCalls++; }, saveWithDialog() { saveCalls++; } };
  function BridgeTalk() { messages.push(this); }
  BridgeTalk.isRunning = target => { assert.equal(target, input.targetSpecifier); if (options.runningThrows) throw Error("status unavailable"); return options.running !== false; };
  BridgeTalk.launch = () => { launchCalls++; };
  BridgeTalk.pump = () => {
    pumps++;
    if (options.mode === "pump-result" && messages.length) messages[0].onResult({ body: options.body || ameFixture().body });
  };
  BridgeTalk.prototype.send = function (seconds) {
    sends++; assert.equal(seconds, 1); assert.equal(this.timeout, 1); assert.equal(this.target, input.targetSpecifier);
    assert.equal(this.body, transport.ameMessage(nonce));
    if (options.mode === "throw") throw Error("send indeterminate");
    if (options.mode === "result" || options.mode === "false-result") this.onResult({ body: options.body || ameFixture().body });
    if (options.mode === "error") this.onError({ body: "AME evaluation error" });
    if (options.mode === "timeout") this.onTimeout();
    return options.mode !== "false-result";
  };
  const context = vm.createContext({ app: { project }, BridgeTalk, Date: DateFixture, $: { global, sleep(ms) { clock += ms; } }, JSON: undefined });
  vm.runInContext("Array.prototype.map=undefined;Array.prototype.includes=undefined;Array.prototype.filter=undefined;", context);
  return { global, messages, run(a = args, request = nonce) { return JSON.parse(JSON.stringify(vm.runInContext("(function(){" + transport.inspectScript(a, request) + "})();", context))); },
    counts() { return { sends, pumps, launchCalls, saveCalls }; } };
}
function normalized(native, options = {}) { return transport.normalizeResult(native, options.nonce || nonce, options.args || args, Date.now()); }

check("strict ES3 for AME, sender and actual bridge wrapper", () => {
  const source = fs.readFileSync(path.join(__dirname, "../mcp-server/bridge-daemon.js"), "utf8");
  const start = source.indexOf("function wrapExtendScriptBody(body) {"), end = source.indexOf("\nconst EXTENDSCRIPT_BODY_LINE_OFFSET", start);
  const node = acorn.parse(source.slice(start, end), { ecmaVersion: "latest" }).body[0];
  const template = node.body.body.find(value => value.type === "ReturnStatement").argument;
  assert.equal(template.type, "TemplateLiteral"); assert.equal(template.expressions.length, 1); assert.equal(template.expressions[0].name, "body");
  const parse = body => acorn.parse(body, { ecmaVersion: 3, allowReserved: "never" });
  const body = transport.inspectScript(args, nonce);
  parse(transport.ameMessage(nonce)); parse("(function(){" + body + "})();"); parse(template.quasis[0].value.cooked + body + template.quasis[1].value.cooked);
  assert.throws(() => parse("var f=()=>1;")); assert.throws(() => parse("var x={native:1};"));
});
check("closed input rejects code, generic target and invalid reconciliation", () => {
  for (const value of [{ ...input, script: "app.quit()" }, { ...input, targetSpecifier: "ame" }, { ...input, targetSpecifier: "aftereffects-26.0" },
    { ...input, timeoutMs: 10001 }, { ...input, expectedSessionNonce: "x';app.quit()" }, { ...input, reconcileRequestNonce: "current" }, { ...input, timeoutMs: 1.5 }]) assert.throws(() => transport.validateInput(value));
});
check("AME fixed reader uses only getters, safe JSON without JSON global", () => {
  const f = ameFixture(); assert.equal(f.parsed.requestNonce, nonce); assert.equal(f.parsed.sessionNonce, "cold-session");
  assert.deepEqual(f.parsed.reads, { isBatchRunning: false, batchEncoderStatus: "stopped", formats: ["H.264", "QuickTime"] });
  assert(f.parsed.frontend.methods.includes("addDLToBatch")); assert.equal(f.mutators.length, 0);
  assert.deepEqual(f.global, { aeAgentAMEProbeSessionNonce: "cold-session" });
});
check("read errors remain metadata, no fallback mutation", () => { const f = ameFixture({ readError: true }); assert(f.parsed.errors.includes("format_list_read_failed")); assert.equal(f.mutators.length, 0); });
check("matching response proves command and existing nonce only", () => {
  const f = senderFixture({ mode: "result" }), raw = f.run(), result = normalized(raw);
  assert.equal(result.ok, true); assert.equal(result.deliveryVerified, true); assert.equal(result.warmSessionVerified, true); assert.equal(result.adapterReady, false);
  assert.equal(raw.snapshotCapabilities.projectDirty, true); assert.equal(raw.snapshotCapabilities.projectFile, "C:\\fixture\\source.aep");
  assert.equal(raw.snapshotCapabilities.save, true); assert.equal(raw.snapshotCapabilities.saveCopy, false); assert.deepEqual(f.counts(), { sends: 1, pumps: 0, launchCalls: 0, saveCalls: 0 });
});
check("asynchronous pump result and send false require callback correlation", () => {
  for (const mode of ["pump-result", "false-result"]) { const f = senderFixture({ mode }); assert.equal(normalized(f.run()).warmSessionVerified, true); assert.equal(f.counts().sends, 1); }
});
check("changed or missing session cannot prove warm delivery", () => {
  for (const session of ["changed", null]) { const response = ameFixture().parsed; response.sessionNonce = session;
    const result = normalized(senderFixture({ mode: "result", body: JSON.stringify(response) }).run()); assert.equal(result.code, "target_session_changed"); assert.equal(result.warmSessionVerified, false); assert.equal(result.deliveryVerified, true); }
});
check("nonce, target and malformed payload fail closed without eval", () => {
  const response = ameFixture().parsed;
  for (const [body, code] of [[JSON.stringify({ ...response, requestNonce: nextNonce }), "request_nonce_mismatch"], [JSON.stringify({ ...response, appSpecifier: "ame-25.0" }), "target_specifier_mismatch"],
    ["app.quit()", "ame_response_invalid_json"], ["null", "ame_response_invalid_json"], ["x".repeat(65537), "ame_response_invalid_json"]]) {
    const result = normalized(senderFixture({ mode: "result", body }).run()); assert.equal(result.code, code); assert.equal(result.deliveryVerified, false);
  }
});
check("absent/unknown target never sends or explicitly launches", () => {
  for (const options of [{ running: false }, { runningThrows: true }]) { const f = senderFixture(options); assert.equal(normalized(f.run()).ok, false); assert.equal(f.counts().sends, 0); assert.equal(f.counts().launchCalls, 0); }
});
check("unknown and timeout retained, another send blocked", () => {
  for (const mode of ["unknown", "timeout", "throw"]) {
    const f = senderFixture({ mode }); assert.equal(normalized(f.run()).ok, false);
    const second = f.run(args, nextNonce); assert.equal(second.code, "previous_request_unresolved"); assert.equal(second.requestNonce, nonce); assert.equal(f.counts().sends, 1);
    assert.equal(f.global[transport.SLOT_NAME].pending.message, f.messages[0]);
  }
});
check("late response reconciles exact retained request without resend", () => {
  const f = senderFixture({ mode: "timeout" }); f.run(); f.messages[0].onResult({ body: ameFixture().body });
  const a = { ...args, reconcileRequestNonce: nonce }, result = normalized(f.run(a, nextNonce), { nonce: nextNonce, args: a });
  assert.equal(result.ok, true); assert.equal(result.native.lateResponse, true); assert.equal(result.requestNonce, nonce); assert.equal(f.counts().sends, 1);
});
check("wrong reconciliation cannot pump or send", () => {
  const f = senderFixture({ mode: "unknown" }); f.run(); const before = f.counts();
  assert.equal(f.run({ ...args, reconcileRequestNonce: nextNonce }, nextNonce).code, "reconciliation_target_mismatch"); assert.deepEqual(f.counts(), before);
});
check("BridgeTalk error never claims success", () => { const f = senderFixture({ mode: "error" }); assert.equal(normalized(f.run()).code, "error"); assert.equal(f.counts().sends, 1); });
check("registration uses exact typed name; raw and unknown gates intact", () => {
  const source = fs.readFileSync(path.join(__dirname, "../mcp-server/bridge-daemon.js"), "utf8");
  assert(source.includes('const ameTransport = require("./ame-transport");')); assert(source.includes("  ameTransport.tool,"));
  assert(source.includes("  if (name === ameTransport.TOOL_NAME) {")); assert(/const PLANNING_TOOL_NAMES = \[\r?\n  ameTransport\.TOOL_NAME,/.test(source));
  assert(source.includes('const amePresets = require("./ame-presets");')); assert(source.includes("  amePresets.listAmePresetsTool,"));
  assert(source.includes("  if (name === amePresets.listAmePresetsTool.name) {"));
  const start = source.indexOf("function classifyM100ToolRisk(name) {"), end = source.indexOf("\nfunction m100DirectEscapeHatchAllowed", start);
  const context = vm.createContext({ tools: [transport.tool, { name: "list_ame_presets" }, { name: "run_extendscript" }, { name: "delete_layer" }],
    M100_RISK_POLICY_VERSION: "test", knownToolNames: () => new Set([transport.TOOL_NAME, "list_ame_presets", "run_extendscript", "delete_layer"]),
    M100_RAW_JSX_TOOL_NAMES: new Set(["run_extendscript", "run_extendscript_file"]), M100_DESTRUCTIVE_TOOL_NAMES: new Set(["delete_layer"]),
    MUTATING_TOOL_NAMES: new Set(), panelBootstrap: { TOOL_NAME: "ensure_ae_agent_panel" } });
  vm.runInContext(source.slice(start, end), context);
  assert.equal(vm.runInContext('classifyM100ToolRisk("inspect_ame_transport").riskLevel', context), "read_only");
  assert.equal(vm.runInContext('classifyM100ToolRisk("list_ame_presets").riskLevel', context), "read_only");
  assert.equal(vm.runInContext('classifyM100ToolRisk("run_extendscript").riskLevel', context), "raw_jsx");
  assert.equal(vm.runInContext('classifyM100ToolRisk("delete_layer").riskLevel', context), "destructive");
  assert.equal(vm.runInContext('classifyM100ToolRisk("inspect_ame_transport_other").requiresProposal', context), true);
});
check("runtime composite includes exact new AME module content hashes", () => {
  const evidence = require("../mcp-server/review-evidence"), root = path.resolve(__dirname, "..");
  const hashes = evidence.runtimeNamedHashSet(root);
  for (const name of ["mcp-server/ame-transport.js", "mcp-server/ame-presets.js"]) {
    const rows = hashes.filter(row => row.name === name); assert.equal(rows.length, 1);
    assert.equal(rows[0].sha256, evidence.sha256(fs.readFileSync(path.join(root, name))));
  }
});

(async () => {
  await transport.execute(input, async () => { throw Error("bridge timeout"); }).then(result => { assert.equal(result.code, "ae_delivery_unknown"); assert.equal(result.automaticRetryAllowed, false); checks++; });
  await assert.rejects(transport.execute({ ...input, script: "arbitrary" }, async () => { throw Error("must not run"); })); checks++;
  console.log("AME transport offline smoke PASS: " + checks + " groups; strict ES3/VM, no live applications or tools.");
})().catch(error => { console.error(error); process.exitCode = 1; });
