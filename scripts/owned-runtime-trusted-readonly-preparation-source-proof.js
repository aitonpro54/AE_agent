"use strict";
// Actual source-preparation functions in a VM, no bridge import or live effects.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), crypto = require("node:crypto");
const { AsyncLocalStorage } = require("node:async_hooks");
const source = fs.readFileSync(path.join(__dirname, "../mcp-server/bridge-daemon.js"), "utf8");
function cut(start, next) { const begin = source.indexOf(start), end = source.indexOf(next, begin); assert(begin >= 0 && end > begin); return source.slice(begin, end); }
const bodies = cut("function ownedReadonlyScriptPreparation(name)", "async function ownedTrustedReadObserve(challenge)")
  + cut("async function runExtendScriptBody(body, timeoutMs)", "function exposedTools()");
function fixture() {
  const scriptPreparationContext = new AsyncLocalStorage(), counters = { guardedCommand: 0, guardedTool: 0, enqueue: 0, ingress: 0, produced: 0 };
  let closed = false, count = 1, hold = null;
  const context = { Buffer, Object, WeakSet, crypto, initialRuntime: { assertIngress() { counters.ingress++; assert.equal(closed, false); },
    assertCommand() { counters.guardedCommand++; throw Error("fixture_command_gate_closed"); },
    assertTool() { counters.guardedTool++; throw Error("fixture_tool_gate_closed"); } },
  trustedReadDaemon: { role: {} }, ownedUiBaseline:require("../mcp-server/owned-runtime-ui-baseline"), scriptPreparationContext, ownedReadonlyScriptPreparations: new WeakSet(),
  lifecycleCommandContext: { getStore: () => null }, placeholderMutationContext: { getStore: () => null }, autonomousCommandContext: { getStore: () => null },
  wrapExtendScriptBody: body => "wrapped-source:" + body, COMMAND_TIMEOUT_MS: 30000,
  enqueueAeCommand() { counters.enqueue++; throw Error("fixture_forbidden_enqueue"); },
  nativeRenderVariant: { validateInput: (_name, args) => args, inspectScript: () => "var inspectionOnly = true;" } };
  const sandbox = vm.createContext(context);
  context.callTool = async name => {
    if (!context.ownedReadonlyScriptPreparation(name)) context.initialRuntime.assertTool();
    counters.produced++; if (hold) await hold;
    for (let i = 0; i < count; i++) await context.runExtendScriptBody("var inspectionOnly = true;", 30000);
  };
  new vm.Script(bodies).runInContext(sandbox);
  return { context, counters, scriptPreparationContext, close: () => { closed = true; }, multiple: () => { count = 2; }, hold: promise => { hold = promise; } };
}
async function main() {
  const cases = []; async function check(name, test) { await test(); cases.push({ name, result: "PASS" }); }
  for (const name of ["get_comp_details", "get_layer_details", "inspect_title_variants"]) await check(name + "_source_only_never_enqueues", async () => {
    const f = fixture(), result = await f.context.ownedTrustedReadonlyScript({ name, args: {}, titleRangeMode: "frozen_literal_range", titleSelectionMode: "exact_named_variants" });
    assert.equal(result.name, name); assert.equal(result.scriptSha25664, crypto.createHash("sha256").update(result.script).digest("hex"));
    assert.equal(f.counters.enqueue, 0); assert.equal(f.scriptPreparationContext.getStore(), undefined);
    assert.equal(f.context.ownedReadonlyScriptPreparation(name), false);
  });
  await check("native_mode_keeps_exact_named_inspection_free_of_first_two_getter",async()=>{
    const exact=fixture(),named=await exact.context.ownedTrustedReadonlyScript({name:"inspect_title_variants",args:{},titleRangeMode:"frozen_literal_range",titleSelectionMode:"exact_named_variants"});
    assert.equal(named.script.includes("ownedTitleInventories"),false);
    const first=fixture(),selected=await first.context.ownedTrustedReadonlyScript({name:"inspect_title_variants",args:{},titleRangeMode:"full_observed_root_range_v1",titleSelectionMode:"first_two_observed_text_states_v1"});
    assert.equal(selected.script.includes("ownedTitleInventories"),true);assert.equal(selected.script.includes("ownedObservedTimings"),true);assert.equal(first.counters.enqueue,0);
  });
  await check("literal_first_two_does_not_capture_observed_range",async()=>{
    const f=fixture(),value=await f.context.ownedTrustedReadonlyScript({name:"inspect_title_variants",args:{},titleRangeMode:"frozen_literal_range",titleSelectionMode:"first_two_observed_text_states_v1"});
    assert.equal(value.script.includes("ownedTitleInventories"),true);assert.equal(value.script.includes("ownedObservedTimings"),false);assert.equal(f.counters.enqueue,0);
  });
  await check("foreign_range_or_exact_named_observed_range_refused",async()=>{
    const f=fixture();for(const request of [{name:"get_comp_details",args:{},titleSelectionMode:"first_two_observed_text_states_v1"},
      {name:"get_comp_details",args:{},titleSelectionMode:"first_two_observed_text_states_v1",titleRangeMode:"caller"},
      {name:"get_comp_details",args:{},titleSelectionMode:"exact_named_variants",titleRangeMode:"full_observed_root_range_v1"}])await assert.rejects(f.context.ownedTrustedReadonlyScript(request));
    assert.equal(f.counters.produced,0);assert.equal(f.counters.enqueue,0);
  });
  await check("missing_or_foreign_native_mode_is_refused",async()=>{
    const f=fixture();for(const request of [{name:"get_comp_details",args:{}},{name:"get_comp_details",args:{},titleSelectionMode:true},{name:"get_comp_details",args:{},titleSelectionMode:"caller"}])await assert.rejects(f.context.ownedTrustedReadonlyScript(request));
    assert.equal(f.counters.produced,0);
  });
  await check("mutating_raw_alias_and_wrong_request_denied_before_generation", async () => {
    const f = fixture(); for (const request of [{ name: "execute_extendscript", args: {} }, { name: "update_text_layer", args: {} },
      { name: "get_comp_details ", args: {} }, { name: "get_comp_details", args: {}, ready: true }, { name: "get_comp_details", args: [] }])
      await assert.rejects(f.context.ownedTrustedReadonlyScript(request));
    assert.equal(f.counters.produced, 0); assert.equal(f.counters.enqueue, 0);
  });
  await check("caller_boolean_preparation_cannot_disable_command_gate", async () => {
    const f = fixture(); await assert.rejects(f.scriptPreparationContext.run({ name: "get_comp_details", ownedInitialReadOnly: true, script: null },
      () => f.context.runExtendScriptBody("arbitrary source", 30000)), /command_gate_closed/);
    assert.equal(f.counters.guardedCommand, 1); assert.equal(f.counters.enqueue, 0);
  });
  await check("ordinary_direct_read_and_raw_keep_their_gate", async () => {
    const f = fixture(); await assert.rejects(f.context.callTool("get_comp_details"), /tool_gate_closed/);
    await assert.rejects(f.context.runExtendScriptBody("arbitrary source", 30000), /command_gate_closed/); assert.equal(f.counters.enqueue, 0);
  });
  await check("two_deliveries_in_one_preparation_refused", async () => {
    const f = fixture(); f.multiple(); await assert.rejects(f.context.ownedTrustedReadonlyScript({ name: "get_comp_details", args: {}, titleRangeMode: "frozen_literal_range", titleSelectionMode: "exact_named_variants" }), /multiple_readonly_scripts_refused/);
    assert.equal(f.counters.enqueue, 0); assert.equal(f.context.ownedReadonlyScriptPreparation(), false);
  });
  await check("post_last_await_source_change_does_not_publish_descriptor", async () => {
    const f = fixture(); let resolve; f.hold(new Promise(yes => { resolve = yes; }));
    const work = f.context.ownedTrustedReadonlyScript({ name: "get_comp_details", args: {}, titleRangeMode: "frozen_literal_range", titleSelectionMode: "exact_named_variants" }); f.close(); resolve();
    await assert.rejects(work); assert.equal(f.counters.enqueue, 0); assert.equal(f.context.ownedReadonlyScriptPreparation(), false);
  });
  return { schema: "ae-agent.trusted-readonly-preparation-source-proof.v1", cases, ok: true, nativeFactoriesInvoked: 0,
    actualAe: false, nativeDeliveryProof: false, productionAuthority: false, actualEffects: 0 };
}
main().then(value => process.stdout.write(JSON.stringify(value) + "\n"), error => { process.stderr.write(error.stack + "\n"); process.exitCode = 1; });
