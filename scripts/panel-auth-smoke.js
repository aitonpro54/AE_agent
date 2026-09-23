"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const source = fs.readFileSync(path.join(__dirname, "../cep-panel/panel.js"), "utf8");
const start = source.indexOf("  function friendlyErrorMessage(error)");
const end = source.indexOf("  function setBridgeConnected()", start);
assert(start >= 0 && end > start);
const observed = {};
const context = vm.createContext({
  BRIDGE_OFFLINE_MESSAGE: "Bridge unreachable",
  isBridgeOfflineError: error => error && error.status === 0,
  setStatus: (text, online) => { observed.status = text; observed.online = online; },
  setBridgeHelp: (text, tone) => { observed.help = text; observed.tone = tone; }
});
vm.runInContext(source.slice(start, end), context);
const secret = "private-credential-must-not-be-displayed";
context.setBridgeOffline({status: 401, message: secret});
assert.strictEqual(observed.status, "Panel authentication failed");
assert.strictEqual(observed.online, false);
assert.strictEqual(observed.tone, "warning");
assert(observed.help.includes("AE_BRIDGE_PANEL_TOKEN"));
assert(observed.help.includes("restart the bridge"));
assert(!observed.help.includes(secret));
context.setBridgeOffline({status: 0, message: "Network error"});
assert.strictEqual(observed.status, "Bridge offline");
assert.strictEqual(observed.help, "Bridge unreachable");
context.setBridgeOffline({status: 500, message: "Server failure"});
assert.strictEqual(observed.help, "Server failure");
assert.strictEqual(context.friendlyErrorMessage(null), "Unknown error");
console.log(JSON.stringify({ok:true,checks:["separate-panel-credential-guidance","auth-not-network","no-credential-echo","offline-and-server-errors"]}));
