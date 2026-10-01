"use strict";

const assert = require("assert");
const { normalizeQuota, createCodeburnUsageAdapter } = require("../mcp-server/codeburn-usage-adapter");
const { codexQuota, compareQuota, compareQuotaWindows } = require("../mcp-server/subscription-usage");

async function main() {
  const payload = { providers: [{ id: "codex", available: true, plan: "Example plan", windows: [
    { label: "Weekly", usedPct: 15, resetsAt: "2026-10-04T14:18:39Z" }
  ] }] };
  const normal = normalizeQuota(payload, "2026-09-28T09:00:00Z");
  const before = codexQuota(normal)[0];
  assert.equal(before.usedPercent, 15, "real CodeBurn usedPct field is consumed");
  assert.equal(before.remainingPercent, 85);
  assert.equal(before.plan, "Example plan");
  const after = { ...before, usedPercent: 17, observedAt: "2026-09-28T10:00:00Z" };
  assert.equal(compareQuota(before, after).percentagePoints, 2);
  assert.equal(compareQuota(before, before).percentagePoints, 0);
  assert.equal(compareQuota(before, after).taskAttribution, "unknown");
  assert.equal(compareQuota({ ...before, warning: "baseline-partial" }, after).warnings[0], "baseline-partial");
  assert.equal(compareQuotaWindows([before], [after])[0].percentagePoints, 2);
  assert.equal(compareQuotaWindows([before, before], [after])[0].reason, "ambiguous_window_labels");
  assert.equal(compareQuotaWindows([{ ...before, label: null }], [after])[0].percentagePoints, null);
  assert.equal(compareQuotaWindows([before], [after, { ...after, label: "5h" }])[0].reason, "window_set_changed");
  assert.equal(compareQuota(before, { ...after, resetAt: "2026-10-11T14:18:39Z" }).percentagePoints, null);
  assert.equal(compareQuota(before, { ...after, plan: "Changed plan" }).percentagePoints, null);
  assert.equal(compareQuota(before, { ...after, usedPercent: 1 }).reason, "meter_decreased");
  assert.equal(compareQuota(before, { ...after, observedAt: "2026-10-05T09:00:00Z" }).percentagePoints, null);
  assert.equal(compareQuota(before, { ...after, observedAt: "2026-09-27T09:00:00Z" }).percentagePoints, null);
  assert.equal(compareQuota({ ...before, usedPercent: "15" }, after).reason, "invalid_percentage");
  assert.equal(codexQuota(normalizeQuota({ providers: [{ id: "codex", available: true, windows: [{ usedPct: 15, remainingPct: 99 }] }] }, before.observedAt)).length, 0);
  assert.equal(codexQuota(normalizeQuota({ providers: [{ id: "codex", available: false }] }, before.observedAt)).length, 0);
  const range = normalizeQuota({ providers: [{ id: "codex", available: true, windows: [{ usedPct: 101 }, { usedPct: 0 }] }] }, before.observedAt);
  assert.equal(range.quota.windows[0].usedPercent, null);
  assert.equal(range.quota.windows[1].usedPercent, 0);
  assert.equal(normalizeQuota({ providers: [{ id: "codex", available: true, windows: [{ usedPct: -1 }] }] }, before.observedAt).quota.windows[0].usedPercent, null);

  const assertion = "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\\win\\async.c, line 76";
  const run = async (overrides, kind = "quota") => {
    const adapter = createCodeburnUsageAdapter({ runner: async () => ({ exitCode: 1, stdout: JSON.stringify(payload), stderr: assertion, ...overrides }) });
    return kind === "quota" ? adapter.refreshQuota() : adapter.refreshReport("week");
  };
  const recovered = await run({});
  assert.equal(recovered.status, "partial");
  assert.equal(codexQuota(recovered)[0].usedPercent, 15);
  assert.equal(recovered.warning, "codeburn_shutdown_failed_after_quota_snapshot");
  assert.equal((await run({ stderr: "ordinary failure" })).status, "unavailable", "arbitrary nonzero exit is never accepted");
  assert.equal((await run({ stdout: "{truncated" })).status, "invalid");
  assert.equal((await run({ stdout: '{"providers":[]}' })).status, "unavailable");
  assert.equal((await run({ timedOut: true })).status, "timeout");
  assert.equal((await run({ outputExceeded: true })).status, "invalid");
  assert.equal((await run({}, "report")).status, "unavailable", "recovery applies only to quota snapshots");
  assert(!JSON.stringify(recovered).includes("src\\win"), "stderr remains private");
  console.log(JSON.stringify({ ok: true, checks: "actual quota shape, shutdown recovery boundaries, rounding/unknown, reset/plan/time guards" }));
}

main().catch((error) => { console.error(error.stack); process.exitCode = 1; });
