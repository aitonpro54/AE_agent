"use strict";

const assert = require("node:assert/strict");
const { projectPlaceholderLayerEvidence } = require("../mcp-server/placeholder-evidence");
const full = {
  comp: { itemIndex: 2, itemId: 10, name: "Root", frameRate: 30, time: 3, numLayers: 100 },
  layer: { index: 1, id: 11, name: "Image", locked: false,
    source: { itemId: 12, name: "Shot", duration: 4, frameRate: 30, file: "private-path" },
    startTime: 0, inPoint: 0, outPoint: 4, stretch: 100, timeRemapEnabled: false,
    comment: "irrelevant", text: { text: "irrelevant" } },
  transform: { position: new Array(10000).fill(0) },
  effects: new Array(10000).fill({ name: "irrelevant" }),
  masks: new Array(10000).fill({ name: "irrelevant" }),
  propertyTree: new Array(10000).fill({ name: "irrelevant" })
};
const compact = projectPlaceholderLayerEvidence(full);
assert.equal(compact.evidenceView, "placeholder.v1");
assert.equal(compact.layer.source.itemId, 12);
assert.equal(compact.layer.outPoint, 4);
assert.equal(compact.layer.locked, false);
assert.equal(compact.comp.frameRate, 30);
assert.equal(JSON.stringify(compact).includes("irrelevant"), false);
assert.equal(JSON.stringify(compact).includes("private-path"), false);
assert.ok(JSON.stringify(compact).length < JSON.stringify(full).length / 100);
assert.throws(() => projectPlaceholderLayerEvidence({ comp: full.comp }), /incomplete/);
console.log(JSON.stringify({ ok: true, checks: "placeholder field projection; full result and private source path omitted" }));
