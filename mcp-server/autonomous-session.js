"use strict";

const crypto = require("crypto");

const DEFAULT_TTL_MS = 20 * 60 * 1000;
const PANEL_FRESHNESS_MS = 15000;
const CAPABILITY = "typed_mutating_plan";

function requiredText(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function createAutonomousSessionManager(options) {
  const config = options || {};
  const now = typeof config.now === "function" ? config.now : Date.now;
  const randomBytes = typeof config.randomBytes === "function" ? config.randomBytes : crypto.randomBytes;
  const ttlMs = Number.isFinite(config.ttlMs) && config.ttlMs > 0 ? Math.floor(config.ttlMs) : DEFAULT_TTL_MS;
  const panelFreshnessMs = Number.isFinite(config.panelFreshnessMs) && config.panelFreshnessMs > 0
    ? Math.floor(config.panelFreshnessMs)
    : PANEL_FRESHNESS_MS;
  const panelState = typeof config.panelState === "function" ? config.panelState : () => null;
  let session = null;

  function clearExpired(at) {
    if (session && session.expiresAtMs <= at) session = null;
  }

  function currentPanelMatches(at) {
    const panel = panelState() || {};
    return Boolean(session
      && panel.panelConnectionId === session.panelConnectionId
      && String(panel.panelGeneration || "") === session.panelGeneration
      && Number(panel.seenAt || 0) > 0
      && at - Number(panel.seenAt) < panelFreshnessMs);
  }

  function publicStatus() {
    const at = now();
    clearExpired(at);
    if (!session) {
      return {
        active: false,
        capability: CAPABILITY,
        expiresAt: null,
        remainingMs: 0,
        reason: "not_enabled"
      };
    }
    const panelMatches = currentPanelMatches(at);
    return {
      active: panelMatches,
      capability: CAPABILITY,
      expiresAt: new Date(session.expiresAtMs).toISOString(),
      remainingMs: Math.max(0, session.expiresAtMs - at),
      reason: panelMatches ? "active" : "panel_not_connected"
    };
  }

  function activate(input) {
    const at = now();
    const panelConnectionId = requiredText(input && input.panelConnectionId, "panelConnectionId");
    const panelGeneration = requiredText(input && input.panelGeneration, "panelGeneration");
    const panel = panelState() || {};
    if (panel.panelConnectionId !== panelConnectionId
      || String(panel.panelGeneration || "") !== panelGeneration
      || !Number(panel.seenAt)
      || at - Number(panel.seenAt) >= panelFreshnessMs) {
      throw new Error("The requesting CEP panel is not the active bridge panel.");
    }
    const secret = randomBytes(24).toString("hex");
    session = {
      secret,
      sessionHash: crypto.createHash("sha256").update(secret).digest("hex").slice(0, 12),
      panelConnectionId,
      panelGeneration,
      issuedAtMs: at,
      expiresAtMs: at + ttlMs
    };
    return publicStatus();
  }

  function revoke(input) {
    const panelConnectionId = requiredText(input && input.panelConnectionId, "panelConnectionId");
    const panelGeneration = requiredText(input && input.panelGeneration, "panelGeneration");
    const revoked = Boolean(session
      && session.panelConnectionId === panelConnectionId
      && session.panelGeneration === panelGeneration);
    if (revoked) session = null;
    return { ...publicStatus(), revoked };
  }

  function authorization() {
    const status = publicStatus();
    if (!status.active || !session) return null;
    return {
      authorized: true,
      capability: CAPABILITY,
      expiresAt: status.expiresAt,
      sessionHash: session.sessionHash
    };
  }

  return { activate, authorization, publicStatus, revoke };
}

module.exports = {
  CAPABILITY,
  DEFAULT_TTL_MS,
  PANEL_FRESHNESS_MS,
  createAutonomousSessionManager
};
