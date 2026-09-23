"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createCodeburnUsageAdapter } = require("../mcp-server/codeburn-usage-adapter");
const { createUsageService } = require("../mcp-server/usage-service");
const { createNativeUsageStore } = require("../mcp-server/native-usage");

async function main() {
  const calls = [];
  const periodLabel = (period) => period === "week" ? "Last 7 Days" : "September 2026";
  const keyed = createCodeburnUsageAdapter({ runner: async (command) => {
    const period = command.args[command.args.indexOf("--period") + 1];
    calls.push(period);
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { exitCode: 0, stdout: JSON.stringify({ period: periodLabel(period), periodKey: period,
      overview: { totalTokens: 1 } }), stderr: "" };
  } });
  const [week, month] = await Promise.all([keyed.refreshReport("week"), keyed.refreshReport("month")]);
  assert.deepEqual(calls.sort(), ["month", "week"], "different periods need separate commands");
  assert.equal(week.report.period, "week");
  assert.equal(month.report.period, "month");
  assert.equal(week.report.periodLabel, "Last 7 Days");
  assert.equal(week.report.periodKey, "week");
  assert.equal(month.report.periodLabel, "September 2026");
  assert.equal(month.report.periodKey, "month");
  const service = createUsageService({ nativeStore: createNativeUsageStore(), codeburnAdapter: keyed });
  const monthView = await service.refresh({ period: "month", includeQuota: false });
  assert.equal(monthView.sources.codeburn.report.period, "month", "month refresh must return month data");

  const mismatch = createCodeburnUsageAdapter({ runner: async () => ({ exitCode: 0,
    stdout: JSON.stringify({ period: "Last 7 Days", periodKey: "week", overview: {} }), stderr: "" }) });
  const wrongPeriod = await mismatch.refreshReport("month");
  assert.equal(wrongPeriod.status, "invalid", "month request cannot claim a week report");

  if (process.platform !== "win32") throw new Error("Windows fake shim coverage requires Windows");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ae-codeburn-fake-"));
  const script = path.join(dir, "fake-cli.js");
  const shim = path.join(dir, "fake-codeburn.cmd");
  fs.writeFileSync(script, `
const { spawn } = require('node:child_process');
const mode = process.env.AE_FAKE_CODEBURN_MODE;
if (mode === 'utf8') {
  const data = Buffer.from(JSON.stringify({period:'week',projects:[{name:'Тест🚀'}]}));
  const split = data.indexOf(Buffer.from('Т')) + 1;
  process.stdout.write(data.subarray(0, split));
  setTimeout(() => { process.stdout.write(data.subarray(split)); process.stderr.write(Buffer.from('ошибка🚀')); }, 10);
} else if (mode === 'timeout') {
  spawn(process.execPath, ['-e', 'setTimeout(() => {}, 1000)'], {stdio:['ignore','inherit','inherit'], windowsHide:true});
} else if (mode === 'limit') {
  process.stdout.write('x'.repeat(4096));
  spawn(process.execPath, ['-e', 'setTimeout(() => {}, 1000)'], {stdio:['ignore','inherit','inherit'], windowsHide:true});
}
`, "utf8");
  fs.writeFileSync(shim, `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`, "utf8");
  try {
    process.env.AE_FAKE_CODEBURN_MODE = "utf8";
    const unicode = await createCodeburnUsageAdapter({ executable: shim, timeoutMs: 1000 }).refreshReport("week");
    assert.equal(unicode.status, "ok", JSON.stringify(unicode));
    assert.equal(unicode.report.projects[0].projectIdentity, "Тест🚀");
    process.env.AE_FAKE_CODEBURN_MODE = "timeout";
    let start = Date.now();
    const timeout = await createCodeburnUsageAdapter({ executable: shim, timeoutMs: 100 }).refreshReport("week");
    assert.equal(timeout.status, "timeout");
    assert(Date.now() - start < 700, "timeout must settle before inherited pipes close");
    process.env.AE_FAKE_CODEBURN_MODE = "limit";
    start = Date.now();
    const limit = await createCodeburnUsageAdapter({ executable: shim, maxOutputBytes: 1024, timeoutMs: 1000 }).refreshReport("week");
    assert.equal(limit.error, "codeburn_output_limit");
    assert(Date.now() - start < 700, "output limit must settle before inherited pipes close");
    console.log(JSON.stringify({ ok: true, cases: ["period isolation", "period mismatch", "Windows shim UTF-8", "timeout settle", "byte limit settle"] }));
  } finally {
    delete process.env.AE_FAKE_CODEBURN_MODE;
    await new Promise((resolve) => setTimeout(resolve, 1200));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error.stack || String(error)); process.exitCode = 1; });
