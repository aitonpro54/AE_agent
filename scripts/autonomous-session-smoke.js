"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  CAPABILITY,
  createAutonomousSessionManager
} = require("../mcp-server/autonomous-session");

let now = Date.parse("2026-09-13T10:00:00.000Z");
let panel = {
  panelConnectionId: "panel-smoke",
  panelGeneration: "1",
  seenAt: now
};

function manager() {
  return createAutonomousSessionManager({
    now: () => now,
    ttlMs: 1200,
    panelFreshnessMs: 500,
    panelState: () => panel,
    randomBytes: () => Buffer.alloc(24, 7)
  });
}

const first = manager();
assert.strictEqual(first.publicStatus().active, false);
assert.throws(() => first.activate({panelConnectionId: "other", panelGeneration: "1"}), /not the active/);
const activated = first.activate({panelConnectionId: "panel-smoke", panelGeneration: "1"});
assert.strictEqual(activated.active, true);
assert.strictEqual(activated.capability, CAPABILITY);
const authority = first.authorization();
assert.strictEqual(authority.authorized, true);
assert.strictEqual(Object.prototype.hasOwnProperty.call(authority, "secret"), false);
assert.strictEqual(JSON.stringify(activated).includes("070707"), false);

now += 600;
panel.seenAt = now;
assert.strictEqual(first.publicStatus().active, true);
now += 601;
panel.seenAt = now;
assert.strictEqual(first.publicStatus().active, false, "Lease must expire by TTL.");

const second = manager();
second.activate({panelConnectionId: "panel-smoke", panelGeneration: "1"});
const revoked = second.revoke({panelConnectionId: "panel-smoke", panelGeneration: "1"});
assert.strictEqual(revoked.revoked, true);
assert.strictEqual(second.authorization(), null);

const restarted = manager();
assert.strictEqual(restarted.authorization(), null, "A new daemon manager must start without a lease.");

const stale = manager();
stale.activate({panelConnectionId: "panel-smoke", panelGeneration: "1"});
now += 501;
assert.strictEqual(stale.authorization(), null, "A stale/disconnected panel must not authorize execution.");

const root = path.resolve(__dirname, "..");
const panelHtml = fs.readFileSync(path.join(root, "cep-panel", "index.html"), "utf8");
const panelJs = fs.readFileSync(path.join(root, "cep-panel", "panel.js"), "utf8");
assert(panelHtml.includes("Автономная сессия Codex · 20 мин"));
assert(panelHtml.includes("Raw JSX и удаление требуют обычного подтверждения"));
assert(panelJs.includes('request("POST", "/autonomy/session"'));
assert(panelJs.includes('autonomousSessionButton.addEventListener("click", toggleAutonomousSession)'));
assert(!panelJs.includes('localStorage.setItem("codexAeAutonomous'), "Autonomous consent must not persist in localStorage.");

console.log(JSON.stringify({
  ok: true,
  capability: CAPABILITY,
  expiry: true,
  revoke: true,
  restartClears: true,
  stalePanelBlocks: true,
  authorityNotExposed: true,
  explicitPanelGesture: true,
  panelConsentNotPersistent: true
}, null, 2));
