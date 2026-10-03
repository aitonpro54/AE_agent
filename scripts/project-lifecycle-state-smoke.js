"use strict";

const assert = require("node:assert/strict");
const vm = require("node:vm");
const { getProjectLifecycleStateTool, nativeReadScript, normalizeProjectLifecycleState } = require("../mcp-server/project-lifecycle-state");

assert.deepEqual(getProjectLifecycleStateTool.inputSchema, { type: "object", properties: {}, additionalProperties: false });
const script = nativeReadScript();
const source = script.replace(/^\s+/, "");
let writes = 0;
const forbidden = ["save", "saveAs", "close", "open", "newProject", "activate"];
const project = (file, dirty, revision) => ({ file, dirty, revision,
  ...Object.fromEntries(forbidden.map((name) => [name, () => { writes += 1; throw new Error(`called ${name}`); }])) });
function read(projectValue, version = "25.0") {
  const context = { app: { version, project: projectValue } };
  return vm.runInNewContext(source, context);
}
function readThrowingProject() {
  const app = { version: "25.0" };
  Object.defineProperty(app, "project", { get() { throw new Error("project getter unavailable"); } });
  return vm.runInNewContext(source, { app });
}
function ready(raw) { return normalizeProjectLifecycleState(raw, "2026-10-03T00:00:00.000Z"); }

let state = read(project({ fsName: "C:/work/a.aep" }, false, 3));
assert.equal(state.projectPresent, true);
assert.equal(state.file, "C:/work/a.aep");
assert.equal(state.dirty, false);
assert.equal(state.revision, 3);
assert.equal(ready({ result: state }).project, "named");
assert.equal(ready({ result: state }).lifecycleReady, true);
for (const bad of [undefined, NaN, Infinity, -1, 1.5]) {
  state = read(project(null, true, bad));
  assert.equal(state.revision, null);
  assert.equal(state.supported.revision, false);
}
state = read(project({ fsName: "" }, true, 0));
assert.equal(ready(state).project, "unnamed");
state = read(project(null, true, 0));
assert.equal(ready(state).project, "unnamed");
assert.equal(ready(state).lifecycleReady, false);
state = read(project({ get fsName() { throw new Error("unavailable"); } }, true, 0));
assert.equal(state.file, null);
assert.equal(state.supported.file, false);
state = read(project(null, "false", 0));
assert.equal(state.dirty, null);
assert.equal(state.supported.dirty, false);
assert.equal(ready(state).lifecycleReady, false);
state = read(project(null, true, 0), null);
assert.equal(state.supported.appVersion, false);
assert.equal(state.appVersion, null);
const absentProject = read(undefined);
assert.equal(absentProject.supported.file, false);
assert.equal(absentProject.projectPresent, false);
assert.equal(ready(absentProject).project, "absent");
const throwingProject = readThrowingProject();
assert.equal(throwingProject.projectPresent, null);
assert.equal(ready(throwingProject).project, "unknown");
let fsNameReads = 0;
state = read(project({ get fsName() { fsNameReads += 1; return "C:/work/once.aep"; } }, false, 0));
assert.equal(state.file, "C:/work/once.aep");
assert.equal(fsNameReads, 1);
assert.equal(writes, 0);
assert.ok(!/\.\s*(save|saveAs|close|open|newProject|activate)\s*\(/.test(source));
const malformed = ready({ projectPresent: true, dirty: 1, revision: 1.2, supported: { dirty: true, revision: true, file: true }, file: "x" });
assert.equal(malformed.lifecycleReady, false);
assert.equal(malformed.dirty, null);
assert.equal(malformed.revision, null);
assert.equal(malformed.project, "named");
const validUnnamed = read(project(null, false, 0));
validUnnamed.file = null;
validUnnamed.supported.file = true;
assert.equal(ready(validUnnamed).project, "unnamed");
const cyclic = {};
cyclic.result = cyclic;
assert.equal(ready(cyclic).project, "unknown");
assert.equal(ready([]).lifecycleReady, false);
assert.equal(ready("[]").project, "unknown");
const malformedJson = ready("{broken");
assert.equal(malformedJson.project, "unknown");
assert.equal(malformedJson.lifecycleReady, false);
assert.equal(getProjectLifecycleStateTool.inputSchema.additionalProperties, false);
assert.equal(Object.keys(getProjectLifecycleStateTool.inputSchema.properties).length, 0);
console.log(JSON.stringify({ ok: true, checks: "native lifecycle reads, unavailable and invalid fields, project states, strict read-only boundary" }));
