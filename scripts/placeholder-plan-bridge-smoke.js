"use strict";

const assert = require("node:assert/strict");
const { startDaemon } = require("./network-test-fixture");

const comp = { itemId: 10, itemIndex: 2, name: "Generated Root", duration: 12, frameRate: 30 };
const input = { rootComp: comp, targetComp: comp, route: [],
  targetLayer: { id: 11, index: 1, name: "Image", sourceItemId: 12,
    locked: false, stretch: 100, timeRemapEnabled: false },
  sourceItem: { itemId: 13, itemIndex: 3, name: "Generated Shot", type: "footage", duration: 12 },
  rootRange: [0, 4], sourceRange: [0, 4] };

async function main() {
  const fixture = await startDaemon({ automationToken: "placeholder-smoke", panelToken: "placeholder-smoke-panel", devAdmin: false });
  try {
    const call = (name, args) => fixture.request({ path: "/tools/call", method: "POST", token: fixture.automationToken,
      body: { name, arguments: args } });
    const good = await call("build_placeholder_plan", { input });
    assert.equal(good.status, 200);
    assert.equal(good.body.ok, true, JSON.stringify(good.body).slice(0, 1500));
    const built = JSON.parse(good.body.result.content[0].text);
    assert.equal(built.validation.ok, true);
    assert.equal(built.plan.steps[0].args.expectedLayerId, 11);
    const readBack = { comp: { itemIndex: 2, itemId: 10, name: "Generated Root", frameRate: 30 },
      layer: { index: 1, id: 11, name: "Image", source: { itemId: 13, name: "Generated Shot" },
        startTime: 0, inPoint: 0, outPoint: 4, stretch: 100, timeRemapEnabled: false } };
    const verified = await call("verify_placeholder_read_back", { expected: built.expectedReadBack, observed: readBack });
    assert.equal(JSON.parse(verified.body.result.content[0].text).status, "passed");
    const mismatched = await call("verify_placeholder_read_back", { expected: built.expectedReadBack,
      observed: { ...readBack, layer: { ...readBack.layer, source: { itemId: 12, name: "Generated Shot" } } } });
    assert.equal(JSON.parse(mismatched.body.result.content[0].text).status, "needs_review");
    const bad = await call("build_placeholder_plan", { input: { ...input, targetComp: { ...comp, itemId: 99 } } });
    assert.equal(bad.body.result.isError, true);
    assert.equal(JSON.parse(bad.body.result.content[0].text).code, "target_comp_mismatch");
    console.log(JSON.stringify({ ok: true, checks: "isolated daemon local builder, plan validation, stale comp rejection; no AE or model call" }));
  } finally { await fixture.stop(); }
}

main().catch((error) => { console.error(error.stack); process.exitCode = 1; });
