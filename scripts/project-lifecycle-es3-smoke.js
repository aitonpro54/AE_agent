"use strict";
const fs = require("fs"), path = require("path"), assert = require("assert/strict");
const ROOT = path.resolve(__dirname, "..");
let acorn;
try { acorn = require("internal/deps/acorn/acorn/dist/acorn"); }
catch (error) { throw new Error("Strict ES3 parser unavailable: run node --expose-internals; no permissive fallback. " + error.message); }
const contract = require("../mcp-server/project-lifecycle-contract");
const state = require("../mcp-server/project-lifecycle-state");
const protection = require("../mcp-server/placeholder-protection");
const source = fs.readFileSync(path.join(ROOT, "mcp-server/bridge-daemon.js"), "utf8");
const start = source.indexOf("function wrapExtendScriptBody(body) {");
const end = source.indexOf("\nconst EXTENDSCRIPT_BODY_LINE_OFFSET", start);
assert(start >= 0 && end > start, "Actual wrapper boundaries unavailable");
const fn = acorn.parse(source.slice(start, end), { ecmaVersion: "latest" }).body[0];
const returned = fn.body.body.find(node => node.type === "ReturnStatement");
const template = returned && returned.argument;
assert(template && template.type === "TemplateLiteral" && template.expressions.length === 1 &&
  template.expressions[0].type === "Identifier" && template.expressions[0].name === "body",
  "Unsupported actual wrapper structure; no execution fallback");
assert(template.quasis.length === 2 && template.quasis.every(q => typeof q.value.cooked === "string"));
const wrap = body => template.quasis[0].value.cooked + body + template.quasis[1].value.cooked;
const profile = { ecmaVersion: 3, allowReserved: "never" };
const parse = text => acorn.parse(text, profile);
assert.throws(() => parse("(function(){return {native:1};})();"), /reserved/);
assert.throws(() => parse("(function(){return {class:1};})();"), /reserved/);
assert.doesNotThrow(() => parse('(function(){return {"native":1};})();'));
const tuple = { file: path.join(ROOT, ".codex-runtime", "es3-source.aep"), dirty: false, revision: 1 };
const destination = path.join(ROOT, ".codex-runtime", "es3-target.aep");
const cases = [
  ["native getter", "return " + state.nativeReadScript()],
  ["inventory pinned", contract.nativeInventoryScript({ expectedNative: tuple, accepted: [] })],
  ["inventory unpinned", contract.nativeInventoryScript({ accepted: [] })],
  ["protected inventory support", protection.aeSupportScript],
  ["protected phase guard support", protection.aeGuardScript(tuple.file, [])]
];
for (const [operation, phase] of [
  ["save_project_as", "save_stage"], ["save_project_as", "open_final"],
  ["create_named_project", "create_stage"], ["create_named_project", "open_final"],
  ["open_project", "open_target"]
]) cases.push([operation + "/" + phase, contract.phaseScript({
  operation, phase, expectedNative: tuple, destinationProjectFile: destination, accepted: []
})]);
let oldDefects = 0;
for (const [name, body] of cases) {
  const wrapped = wrap(body);
  assert.doesNotThrow(() => parse(wrapped), name + " must parse as strict ES3");
  const defective = wrapped.replace(/"native":(?=__lcAfter|__lcResult)/g, "native:");
  if (defective !== wrapped) {
    assert.throws(() => parse(defective), /keyword 'native' is reserved/, name + " negative defect control");
    oldDefects++;
  }
}
assert.equal(oldDefects, 7, "All inventory/phase reserved-key controls must exist");
console.log("Lifecycle strict ES3 PASS", cases.length, "current outputs;", oldDefects,
  "old reserved-key rejects; parser", acorn.version, "(syntax only)");
