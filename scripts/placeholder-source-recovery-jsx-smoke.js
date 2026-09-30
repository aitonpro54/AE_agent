#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");
const { prepareToolScript } = require("../mcp-server/bridge-daemon");
const { buildSemanticVerification } = require("../mcp-server/semantic-verification");

class FootageItem {
  constructor(name, file) {
    Object.assign(this, { name, file: file ? { fsName: file } : null, footageMissing: true,
      typeName: "Footage", width: 1920, height: 1080, duration: 10, frameRate: 30, pixelAspect: 1 });
  }
  replace(file) { this.file = { fsName: file.fsName }; this.footageMissing = false; }
}
class FolderItem { constructor(name) { this.name = name; this.typeName = "Folder"; } }
class CompItem {}
class Project {
  constructor() { this._items = []; }
  get numItems() { return this._items.length; }
  item(index) { return this._items[index - 1]; }
  add(item, id) { item.id = id; this._items.push(item); return item; }
}
function execute(prepared, project, file) {
  assert.equal(typeof prepared.script, "string", "actual preparation must return executable JSX");
  const undo = [];
  const sandbox = { app: { project, beginUndoGroup: name => undo.push(["begin", name]), endUndoGroup: () => undo.push(["end"]) },
    FootageItem, FolderItem, CompItem, File: function File(value) { this.fsName = value; this.exists = path.resolve(value) === file; } };
  const raw = vm.runInNewContext(prepared.script, sandbox, { timeout: 2000 });
  assert.equal(typeof raw, "string", "production wrapper must return its real JSON envelope");
  return { ...JSON.parse(raw), undo };
}

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-recovery-jsx-"));
  const file = path.join(temp, "recovered.mp4");
  fs.writeFileSync(file, "synthetic-offline-fixture");
  const old = "C:\\old\\original.mp4";
  const args = { itemId: 42, itemIndex: 1, expectedName: "Original", expectedPreviousFilePath: old, filePath: file };
  try {
    const prepared = await prepareToolScript("relink_footage_source", args);
    const make = (name = "Original", previous = old) => {
      const project = new Project();
      project.add(new FolderItem("Shifted index"), 900);
      const footage = project.add(new FootageItem(name, previous), 42);
      return { project, footage };
    };
    const valid = make();
    const result = execute(prepared, valid.project, file);
    assert.equal(result.ok, true, result.error);
    assert.equal(result.result.itemId, 42);
    assert.equal(result.result.itemIndex, 2, "persistent ID survives stale itemIndex");
    assert.equal(result.result.postVerification.ok, true);
    assert.equal(result.result.item.footageMissing, false);
    assert.deepEqual(result.undo.map(call => call[0]), ["begin", "end"]);

    for (const [name, previous, missing, message] of [
      ["Renamed", old, true, "name mismatch"], ["Original", "C:/wrong/original.mp4", true, "path mismatch"],
      ["Original", null, true, "unavailable"], ["Original", old, false, "not missing"],
      ["Original", old, undefined, "not missing"]
    ]) {
      const guarded = make(name, previous);
      guarded.footage.footageMissing = missing;
      const failure = execute(prepared, guarded.project, file);
      assert.equal(failure.ok, false);
      assert(failure.error.includes(message), failure.error);
      assert.deepEqual(failure.undo, [], "guards run before opening undo group");
      assert.equal(guarded.footage.file && guarded.footage.file.fsName, previous);
    }
    const throwing = make();
    throwing.footage.replace = () => { throw new Error("synthetic replace failure"); };
    const threw = execute(prepared, throwing.project, file);
    assert.equal(threw.ok, false);
    assert(threw.error.includes("synthetic replace failure"));
    assert.deepEqual(threw.undo.map(call => call[0]), ["begin", "end"], "finally closes undo on replace error");
    assert.equal(throwing.footage.file.fsName, old);
    for (const field of ["expectedName", "expectedPreviousFilePath"]) {
      const incomplete = await prepareToolScript("relink_footage_source", { ...args, [field]: undefined });
      assert.equal(incomplete.script, null);
      assert.equal(incomplete.result.isError, true);
    }
    const directory = await prepareToolScript("relink_footage_source", { ...args, filePath: temp });
    assert.equal(directory.script, null);
    assert.equal(directory.result.isError, true);

    // Real compact read addresses an item beyond the first 25; missing is not coerced.
    const readProject = new Project();
    for (let i = 1; i <= 40; i++) readProject.add(new FootageItem("Other " + i, old), 1000 + i);
    const selected = readProject.add(new FootageItem("Original", file), 42);
    selected.footageMissing = false;
    const readArgs = { type: "footage", itemIds: [42], limit: 1 };
    const readPrepared = await prepareToolScript("find_project_items", readArgs);
    const read = execute(readPrepared, readProject, file);
    assert.equal(read.ok, true, read.error);
    assert.equal(read.result.matches.length, 1);
    const row = read.result.matches[0];
    assert.equal(row.itemIndex, 41);
    assert.equal(row.itemId, 42);
    assert.equal(row.file, file);
    assert.equal(row.width, 1920);
    assert.equal(row.height, 1080);
    assert.equal(row.footageMissing, false);
    selected.footageMissing = undefined;
    assert.equal(Object.hasOwn(execute(readPrepared, readProject, file).result.matches[0], "footageMissing"), false);
    const invalidRead = await prepareToolScript("find_project_items", { itemIds: [42, 42] });
    assert.equal(invalidRead.script, null);
    assert.equal(invalidRead.result.isError, true);

    const mutation = (index, itemId = 42, payload = result.result) => ({ index, tool: "relink_footage_source",
      args: { ...args, itemId }, status: "completed", result: payload });
    const readStep = (rows, index = 2, tool = "find_project_items", extra = {}) => ({ index, tool,
      args: readArgs, status: "completed", result: { matches: rows }, ...extra });
    const semantic = (rows, extra = {}) => buildSemanticVerification({ summary: "Offline recovery" },
      { ok: true, dryRun: false, steps: [mutation(1), readStep(rows)], ...extra });
    assert.equal(semantic([row]).ok, true);
    assert.equal(semantic([{ ...row, itemIndex: 100 }]).ok, true);
    assert.equal(semantic([{ ...row, file: "C:/other/recovered.mp4" }]).ok, false, "same basename elsewhere fails");
    assert.equal(semantic([{ ...row, itemId: 999 }]).ok, false);
    for (const footageMissing of [undefined, null, 0, "", "false", true]) assert.equal(semantic([{ ...row, footageMissing }]).ok, false);
    assert.equal(semantic([row, row]).ok, false, "duplicate ID within independent evidence fails");
    assert.equal(semantic([row], { steps: [mutation(1)] }).ok, false, "setter postVerification alone cannot pass");
    assert.equal(semantic([row], { steps: [readStep([row], 1), mutation(2)] }).ok, false, "read must follow mutation");
    assert.equal(semantic([row], { steps: [mutation(1), readStep([row], 2, "get_bridge_status")] }).ok, false);
    assert.equal(semantic([row], { steps: [mutation(1), readStep([row], 2, "find_project_items", { status: "failed" })] }).ok, false);
    assert.equal(semantic([row], { steps: [mutation(1), readStep([row]), readStep([{ ...row, footageMissing: true }], 3)] }).ok, false,
      "later addressed read supersedes earlier success");
    assert.equal(semantic([row], { steps: [mutation(1), readStep([row])], ok: false }).ok, false);
    assert.equal(semantic([row], { steps: [{ ...mutation(1), status: "failed" }, readStep([row])] }).ok, false);

    // One final addressed read verifies all preceding relinks, including the first.
    const secondPayload = { ...result.result, itemId: 43, item: { ...row, itemId: 43 } };
    const batchRead = { ...readStep([row, { ...row, itemId: 43 }], 3), args: { itemIds: [42, 43] } };
    const batch = buildSemanticVerification({}, { ok: true, dryRun: false,
      steps: [mutation(1), mutation(2, 43, secondPayload), batchRead] });
    assert.equal(batch.ok, true, JSON.stringify(batch.checks));
    assert.equal(batch.checks.length, 2);
    console.log("PASS: recovery actual JSX and semantic module — stale guards, throwing replace, addressed IDs, strict independent evidence.");
  } finally {
    assert(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
