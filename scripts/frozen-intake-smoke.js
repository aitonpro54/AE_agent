"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const guard = require("./frozen-intake-guard");
const helper = require("../orchestrator/bounded-process-result.cjs");
const repo = path.resolve(__dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ae-frozen-"));
try {
  const baseline = guard.verify(repo);
  // Static import/startup boundary only: never load a frozen implementation.
  for (const directory of ["mcp-server", "cep-panel", "chatgpt-connector"]) {
    for (const name of fs.readdirSync(path.join(repo,directory)).filter(name=>/\.(?:js|cjs|mjs)$/.test(name))) {
      const source = fs.readFileSync(path.join(repo,directory,name),"utf8");
      for (const match of source.matchAll(/(?:require\s*\(|from\s*)["']([^"']*orchestrator\/[^"']+)["']/g)) {
        assert(match[1].endsWith("/bounded-process-result.cjs"), `Unexpected frozen import: ${directory}/${name}`);
      }
    }
  }
  const pkg=JSON.parse(fs.readFileSync(path.join(repo,"package.json"),"utf8"));
  for (const [name,command] of Object.entries(pkg.scripts)) {
    if (name === "check:rules" || name.startsWith("smoke:") && name !== "smoke:full-intake") {
      assert(!/node (?:orchestrator\/|scripts\/sdk-generic-repo-|scripts\/full-intake-runtime-cleanup)/.test(command), `Default group runs frozen tooling: ${name}`);
    }
  }
  for (const name of [...Object.keys(guard.inventory(repo)), guard.MANIFEST, guard.LOCK]) {
    fs.mkdirSync(path.dirname(path.join(temp, name)), { recursive: true });
    fs.copyFileSync(path.join(repo, name), path.join(temp, name));
  }
  assert(guard.verify(temp).ok);
  const target = path.join(temp, Object.keys(guard.inventory(temp))[0]);
  const original = fs.readFileSync(target);
  fs.appendFileSync(target, "\nchanged");
  assert.throws(() => guard.verify(temp), /integrity mismatch/);
  fs.writeFileSync(target, original);
  fs.unlinkSync(target);
  assert.throws(() => guard.verify(temp), /integrity mismatch/);
  fs.writeFileSync(target, original);
  fs.renameSync(target, target + ".renamed");
  assert.throws(() => guard.verify(temp), /integrity mismatch/);
  fs.renameSync(target + ".renamed", target);
  const addition = path.join(temp, "orchestrator/new-file.js");
  fs.writeFileSync(addition, "// addition");
  assert.throws(() => guard.verify(temp), /integrity mismatch/);
  fs.unlinkSync(addition);
  fs.writeFileSync(target, original.toString("utf8").replace(/\r?\n/g, "\r\n"));
  assert(guard.verify(temp).ok, "CRLF is normalized");
  fs.appendFileSync(path.join(temp, guard.MANIFEST), " ");
  assert.throws(() => guard.verify(temp), /lock mismatch/);
  const locked = fs.readFileSync(path.join(repo, guard.MANIFEST));
  assert.notStrictEqual(spawnSync(process.execPath, [path.join(__dirname, "frozen-intake-guard.js"), "--update"], {encoding:"utf8"}).status, 0);
  assert.deepStrictEqual(fs.readFileSync(path.join(repo, guard.MANIFEST)), locked);
  const accumulator = helper.createTailAccumulator(2);
  accumulator.push("a\nb\n"); accumulator.push("c\nd");
  assert.deepStrictEqual(accumulator.summary(), { bytes: 7, lineCount: 4, tail: "c\nd", tailLineCount: 2, truncated: true });
  assert.strictEqual(helper.boundedSpawnSyncResult({status:0,stdout:"ok",stderr:""}, {}).ok, true);
  assert.strictEqual(helper.boundedSpawnSyncResult({status:null,error:{code:"ETIMEDOUT",message:"timeout"}}, {}).timedOut, true);
  const compact = path.join(temp, "compact.json"); fs.writeFileSync(compact, '{"ok":true}');
  assert.deepStrictEqual(helper.readCompactJson(compact), {ok:true});
  assert.throws(() => helper.readCompactJson(compact, "fixture", 2), /too-large/);
  console.log(JSON.stringify({...baseline, cases: ["edit", "delete", "rename", "addition", "manifest-lock", "no-update", "CRLF", "active-helper-contract"], intakeExecuted:false}));
} finally { fs.rmSync(temp, { recursive:true, force:true }); }
