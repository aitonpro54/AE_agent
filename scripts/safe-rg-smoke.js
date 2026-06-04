"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repo = path.resolve(__dirname, "..");
const safeRg = path.join(repo, "scripts", "safe-rg.js");

function run(args, cwd, env = {}) {
  return spawnSync(process.execPath, [safeRg, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function write(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, "utf8");
}

function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "safe-rg-smoke-"));
  try {
    write(path.join(root, "src", "file.txt"), "needle source-hit\n");
    write(path.join(root, ".codex", "handoff.md"), "needle allowed-handoff\n");
    write(path.join(root, ".codex", "sdk", "logs", "old.json"), "needle old-log-hit\n");
    write(path.join(root, ".codex-runtime", "old", "report.json"), "needle runtime-hit\n");
    write(path.join(root, "plans", "archive", "old.md"), "needle archive-hit\n");
    write(path.join(root, "logs", "run.log"), "needle logs-hit\n");
    write(path.join(root, "big.txt"), `${"needle big-hit ".repeat(2000)}\n`);

    const hiddenSearch = run(["--hidden", "needle", "."], root);
    assert.strictEqual(hiddenSearch.status, 0, hiddenSearch.stderr || hiddenSearch.stdout);
    assert(hiddenSearch.stdout.includes("source-hit"), "safe-rg should return normal source hits");
    assert(hiddenSearch.stdout.includes("allowed-handoff"), "safe-rg should allow compact handoff hits");
    assert(!hiddenSearch.stdout.includes("old-log-hit"), "safe-rg must exclude .codex/sdk/logs");
    assert(!hiddenSearch.stdout.includes("runtime-hit"), "safe-rg must exclude .codex-runtime");
    assert(!hiddenSearch.stdout.includes("archive-hit"), "safe-rg must exclude ignored historical roots");
    assert(!hiddenSearch.stdout.includes("logs-hit"), "safe-rg must exclude logs");

    const deniedCodexRoot = run(["needle", ".codex"], root);
    assert.notStrictEqual(deniedCodexRoot.status, 0, "safe-rg must reject broad .codex root");
    assert(deniedCodexRoot.stderr.includes("safe-rg-forbidden-path"), deniedCodexRoot.stderr);

    const exactHandoff = run(["needle", ".codex/handoff.md"], root);
    assert.strictEqual(exactHandoff.status, 0, exactHandoff.stderr || exactHandoff.stdout);
    assert(exactHandoff.stdout.includes("allowed-handoff"), "safe-rg should allow exact .codex/handoff.md");

    const capped = run(["needle", "big.txt"], root, { SAFE_RG_MAX_OUTPUT_BYTES: "512" });
    assert.strictEqual(capped.status, 2, "safe-rg must fail closed when output cap is exceeded");
    assert(capped.stderr.includes("safe-rg-output-limit-exceeded"), capped.stderr);
    assert(Buffer.byteLength(capped.stdout, "utf8") <= 512, "stdout must stay capped");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  console.log(JSON.stringify({ ok: true, smoke: "safe-rg" }, null, 2));
}

main();
