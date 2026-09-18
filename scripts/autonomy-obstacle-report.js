"use strict";
const fs = require("fs");
const path = require("path");
const {obstacleEvent} = require("../mcp-server/proposal-state");
const file = path.resolve(__dirname, "../logs/autonomy-obstacles.jsonl");
const events = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).flatMap((line) => {
  try { const raw = JSON.parse(line); return [{...obstacleEvent(raw), at: /^\d{4}-\d\d-\d\dT/.test(raw.at) ? raw.at : null}]; }
  catch (_error) { return []; }
}) : [];
const groups = new Map();
for (const event of events) {
  const key = [event.operation, event.phase, event.code].join("/");
  const group = groups.get(key) || {operation: event.operation, phase: event.phase, code: event.code, count: 0, durationMs: 0};
  group.count++; group.durationMs += event.durationMs; groups.set(key, group);
}
console.log(JSON.stringify({schema: "autonomy-obstacle-report.v1", eventCount: events.length,
  groups: [...groups.values()], recent: events.slice(-12)}, null, 2));
