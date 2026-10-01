"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const panel = fs.readFileSync(path.join(__dirname, "../cep-panel/panel.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../cep-panel/index.html"), "utf8");
const names = ["acceptPlaceholderButton", "releasePlaceholderButton", "mapPlaceholderGroupButton",
  "refreshPlaceholderProtectionButton", "applyPlaceholderConstraintsButton", "placeholderSelectedPropertiesEl",
  "placeholderGroupIdEl", "placeholderDistinctGroupsEl", "placeholderDisallowOverlapEl", "placeholderProtectionStatusEl"];
const calls = [];
const context = { running: true, placeholderProtectionInFlight: false,
  request(method, endpoint, body, callback) { calls.push({ method, endpoint, body, callback }); } };
for (const name of names) context[name] = { disabled: false, checked: false, value: "", textContent: "" };
const start = panel.indexOf("  function renderPlaceholderProtectionControls()");
const end = panel.indexOf("  function getBaseUrl()", start);
assert(start > 0 && end > start);
vm.createContext(context);
vm.runInContext(panel.slice(start, end), context);

for (const name of names) {
  const id = name.replace(/El$/, "");
  assert.strictEqual(html.split('id="' + id + '"').length, 2, "Every control has one actual DOM target: " + id);
}
context.placeholderSelectedPropertiesEl.checked = true;
context.placeholderProtectionAction("accept");
assert.strictEqual(calls.length, 1);
assert.strictEqual(calls[0].endpoint, "/placeholder/protection");
assert.strictEqual(JSON.stringify(calls[0].body), '{"action":"accept","useSelectedProperties":true}');
assert.strictEqual(context.acceptPlaceholderButton.disabled, true);
context.placeholderProtectionAction("release");
assert.strictEqual(calls.length, 1, "Busy state prevents a second request.");
calls[0].callback(new Error("Selected property is animated"));
assert.strictEqual(context.acceptPlaceholderButton.disabled, false);
assert.match(context.placeholderProtectionStatusEl.textContent, /animated/);
assert.strictEqual(calls.length, 1, "Failure never retries acceptance.");

context.placeholderProtectionAction("map_group");
assert.strictEqual(calls.length, 1, "Empty group requires an explicit name.");
context.placeholderGroupIdEl.value = "  Группа 1  ";
context.placeholderProtectionAction("map_group");
assert.strictEqual(calls[1].body.groupId, "Группа 1");
calls[1].callback(null, { ok: true, acceptedCount: 1, groupMappings: [{ groupId: "Группа 1" }] });
assert.strictEqual(calls[2].method, "GET", "Successful action obtains fresh status.");
calls[2].callback(null, { ok: true, acceptedPlaceholders: [{}], groupMappings: [{}],
  constraints: { distinctGroups: true, disallowSourceOverlap: true }, drift: [{ ok: false }] });
assert.strictEqual(context.placeholderDistinctGroupsEl.checked, true);
assert.match(context.placeholderProtectionStatusEl.textContent, /Конфликтов.*1/);

context.placeholderProtectionAction("constraints");
assert.strictEqual(JSON.stringify(calls[3].body), '{"action":"constraints","distinctGroups":true,"disallowSourceOverlap":true}');
calls[3].callback(null, { ok: false, code: "inventory_incomplete" });
assert.match(context.placeholderProtectionStatusEl.textContent, /inventory_incomplete/);
assert.strictEqual(calls.length, 4, "Rejected action never retries or refreshes as success.");
context.running = false;
context.renderPlaceholderProtectionControls();
context.placeholderProtectionAction("release");
context.refreshPlaceholderProtection();
assert.strictEqual(calls.length, 4);
assert.strictEqual(context.releasePlaceholderButton.disabled, true);
assert.match(context.placeholderProtectionStatusEl.textContent, /Подключите/);
console.log("PASS: actual panel functions, explicit acceptance/group/properties, busy/error/disconnected handling; AE calls 0.");
