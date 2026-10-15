"use strict";

const assert = require("node:assert/strict");
const vm = require("node:vm");
const adapter = require("../mcp-server/ame-title-jobs");
const acorn = require("internal/deps/acorn/acorn/dist/acorn");

function fixture() {
  const global = {}, sent = [];
  function BridgeTalk() { this.send = function() { sent.push(this); this.onTimeout(); }; }
  BridgeTalk.isRunning = () => true;
  const context = vm.createContext({ $: { global }, BridgeTalk });
  function call(operation, nonce, reconcileRequestNonce) {
    const args = { operation, requestNonce: nonce, targetSpecifier: "ame-26.0", processBinding: "process", operationBinding: operation === "sources" ? "source" : operation + nonce, timeoutMs: 1, ...(reconcileRequestNonce ? { reconcileRequestNonce } : {}) };
    return vm.runInContext("(function(){" + adapter.commandScript(args) + "})()", context);
  }
  return { global, sent, call };
}

const f = fixture();
const legacyMessage = {}, legacy = { requestNonce: "source-old", targetSpecifier: "ame-26.0", processBinding: "process", operationBinding: "source", callback: "timeout", body: null, message: legacyMessage };
f.global.aeAgentAMETitleSendV1 = legacy;
assert.equal(f.call("enqueue", "job-before-classification").code, "previous_request_unresolved");
assert.equal(f.sent.length, 0);
assert.equal(f.call("sources", "unused", "source-old").code, "timeout");
assert.equal(legacy.operation, "sources");
assert.equal(f.call("enqueue", "job-1").code, "timeout");
assert.equal(f.sent.length, 1);
const queue = f.global.aeAgentAMETitleSendV1;
assert.equal(queue.retainedSourceRead, legacy);
assert.equal(legacy.message, legacyMessage);
assert.equal(f.call("start", "start-blocked").code, "previous_request_unresolved");
assert.equal(f.sent.length, 1);
legacy.callback = "result"; legacy.body = "late-original-source-result";
const original = f.call("sources", "unused", "source-old");
assert.equal(original.requestNonce, "source-old");
assert.equal(original.responseBody, "late-original-source-result");
assert.equal(f.global.aeAgentAMETitleSendV1, queue);
assert.equal(queue.callback, "timeout");
assert.equal(f.sent.length, 1);
queue.callback = "result"; queue.body = "own-queue-result";
assert.equal(f.call("status", "status-1").code, "timeout");
assert.equal(f.sent.length, 2);
assert.equal(f.global.aeAgentAMETitleSendV1.retainedSourceRead, legacy);

const second = fixture();
second.call("sources", "new-source");
assert.equal(second.call("sources", "another-source").code, "previous_request_unresolved");
second.call("enqueue", "job-after-read");
assert.equal(second.sent.length, 2);
const secondQueue = second.global.aeAgentAMETitleSendV1;
second.sent[0].onResult({ body: "late-native-source-callback" });
assert.equal(secondQueue.callback, "timeout");
assert.equal(secondQueue.retainedSourceRead.body, "late-native-source-callback");
assert.equal(second.call("sources", "unused", "new-source").responseBody, "late-native-source-callback");
assert.equal(second.global.aeAgentAMETitleSendV1, secondQueue);
secondQueue.retainedSourceRead.callback = "timeout";
second.global.aeAgentAMETitleSendV1.callback = "result";
assert.equal(second.call("sources", "another-source").code, "previous_request_unresolved");
assert.equal(second.sent.length, 2);

acorn.parse(adapter.commandScript({ operation: "sources", requestNonce: "parse" }), { ecmaVersion: 3, allowReturnOutsideFunction: true });
console.log("PASS: source-only timeout retains exact receipt; unknown queue delivery stays fenced; native sender ES3");
