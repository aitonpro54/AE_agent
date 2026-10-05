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
function assertNoNestedConditionals(ast, name) {
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "ConditionalExpression") {
      assert([node.test, node.consequent, node.alternate].every(child => child.type !== "ConditionalExpression"),
        name + ": nested ternary is unsafe in ExtendScript");
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  }
  visit(ast);
}
assert.throws(() => parse("(function(){return {native:1};})();"), /reserved/);
assert.throws(() => parse("(function(){return {class:1};})();"), /reserved/);
assert.doesNotThrow(() => parse('(function(){return {"native":1};})();'));
// A modern parser/VM accepts these old chains; ExtendScript misassociates them.
const oldClassifiers = [
  'var kind=item instanceof CompItem?"comp":item instanceof FootageItem?"footage":item instanceof FolderItem?"folder":null;',
  'var kind=typeof FileSource!=="undefined" && s instanceof FileSource?"file":typeof SolidSource!=="undefined" && s instanceof SolidSource?"solid":typeof PlaceholderSource!=="undefined" && s instanceof PlaceholderSource?"placeholder":null;'
];
for (const body of oldClassifiers) {
  const ast = parse(wrap(body));
  assert.throws(() => assertNoNestedConditionals(ast, "old classifier control"), /nested ternary is unsafe/);
}
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
  assertNoNestedConditionals(parse(wrapped), name);
  const defective = wrapped.replace(/"native":(?=__lcAfter|__lcResult)/g, "native:");
  if (defective !== wrapped) {
    assert.throws(() => parse(defective), /keyword 'native' is reserved/, name + " negative defect control");
    oldDefects++;
  }
}
assert.equal(oldDefects, 7, "All inventory/phase reserved-key controls must exist");
console.log("Lifecycle strict ES3 PASS", cases.length, "current outputs;", oldDefects,
  "old reserved-key rejects;", oldClassifiers.length, "old classifier-chain rejects; parser", acorn.version,
  "(syntax and static host-compatibility checks only)");
