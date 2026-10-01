"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const PANEL_FRESHNESS_MS = 15000;
const CAPABILITY = "typed_mutating_plan";
const SCHEMA = "ae-agent.autonomy-preference.v2";

function createAutonomousSessionManager(options = {}) {
  const now = options.now || Date.now;
  const panelState = options.panelState || (() => null);
  const statePath = options.statePath;
  const freshness = options.panelFreshnessMs || PANEL_FRESHNESS_MS;
  let desiredEnabled = false, trustedPanel = null, trustedGeneration = null;
  let enableOnFirstPanel = Boolean(statePath) && !fs.existsSync(statePath);
  let connected = null, persistenceError = null;
  let sessionHash = crypto.randomBytes(24).toString("hex");
  function validGeneration(value) { return typeof value === "string" && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)); }
  if (statePath && fs.existsSync(statePath)) {
    try {
      const stored = JSON.parse(fs.readFileSync(statePath, "utf8"));
      if (stored.schema !== SCHEMA || typeof stored.desiredEnabled !== "boolean" || stored.desiredEnabled &&
          (typeof stored.panelConnectionId !== "string" || !stored.panelConnectionId || !validGeneration(stored.panelGeneration))) throw new Error("invalid_or_legacy_state");
      desiredEnabled = stored.desiredEnabled;
      trustedPanel = stored.panelConnectionId || null;
      trustedGeneration = stored.panelGeneration || null;
    } catch (_) { persistenceError = "invalid_or_legacy_state"; }
  }
  function persist(enabled, identity) {
    const value = {schema: SCHEMA, desiredEnabled: enabled, panelConnectionId: identity && identity.panelConnectionId || null,
      panelGeneration: identity && identity.panelGeneration || null};
    try {
      if (!statePath) throw new Error("state_path_required");
      if (options.writeState) options.writeState(statePath, value);
      else {
        fs.mkdirSync(path.dirname(statePath), {recursive:true});
        const temporary = statePath + "." + crypto.randomUUID() + ".tmp";
        try { fs.writeFileSync(temporary, JSON.stringify(value) + "\n", {encoding:"utf8",mode:0o600}); fs.renameSync(temporary, statePath); }
        finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
      }
      persistenceError = null;
      return true;
    } catch (_) { persistenceError = "autonomy_persistence_failed"; return false; }
  }
  function validateIdentity(input) {
    if (!input || typeof input.panelConnectionId !== "string" || !input.panelConnectionId || !validGeneration(input.panelGeneration)) throw new Error("Panel identity/generation is invalid.");
    if (connected && connected.panelConnectionId === input.panelConnectionId && Number(input.panelGeneration) < Number(connected.panelGeneration)) throw new Error("Stale panel generation.");
  }
  // Called only by the panel-authenticated bridge route, never by automation.
  function observePanel(input) {
    validateIdentity(input);
    // A new installation adopts its first authenticated panel. An explicit off,
    // including one saved before this default changed, remains off on reconnect.
    if (enableOnFirstPanel) {
      enableOnFirstPanel = false;
      // A preference written after startup must not be overwritten by this default.
      if (!fs.existsSync(statePath) && persist(true, input)) {
        desiredEnabled = true;
        trustedPanel = input.panelConnectionId;
        trustedGeneration = input.panelGeneration;
      }
    }
    if (desiredEnabled && trustedPanel !== input.panelConnectionId) throw new Error("Trusted panel identity mismatch.");
    if (desiredEnabled && Number(input.panelGeneration) < Number(trustedGeneration)) throw new Error("Stale panel generation.");
    if (desiredEnabled && input.panelGeneration !== trustedGeneration && !persist(true, input)) {
      connected = null; throw new Error("Cannot persist trusted panel generation.");
    }
    connected = {panelConnectionId:input.panelConnectionId,panelGeneration:input.panelGeneration};
    if (desiredEnabled) trustedGeneration = input.panelGeneration;
    return publicStatus();
  }
  function connectionReady() {
    const panel = panelState() || {};
    return Boolean(connected && panel.panelConnectionId === connected.panelConnectionId && String(panel.panelGeneration) === connected.panelGeneration
      && Number(panel.seenAt) > 0 && now() - Number(panel.seenAt) >= 0 && now() - Number(panel.seenAt) < freshness
      && (!desiredEnabled || trustedPanel === connected.panelConnectionId));
  }
  function publicStatus() {
    const ready = connectionReady();
    return {desiredEnabled,connectionReady:ready,active:desiredEnabled && ready && !persistenceError,
      capability:CAPABILITY,persistenceError,reason:persistenceError ? "persistence_error" : !desiredEnabled ? "not_enabled" : ready ? "active" : "panel_not_connected"};
  }
  function assertActivePanel(input) {
    validateIdentity(input);
    const panel = panelState() || {};
    if (panel.panelConnectionId !== input.panelConnectionId || String(panel.panelGeneration) !== input.panelGeneration
        || !Number(panel.seenAt) || now() - Number(panel.seenAt) >= freshness) throw new Error("The requesting CEP panel is not the active bridge panel.");
  }
  function activate(input) {
    assertActivePanel(input);
    if (!persist(true, input)) { desiredEnabled = false; throw new Error("Cannot persist autonomous setting."); }
    desiredEnabled = true; trustedPanel = input.panelConnectionId; trustedGeneration = input.panelGeneration;
    connected = {panelConnectionId:trustedPanel,panelGeneration:trustedGeneration};
    sessionHash = crypto.randomBytes(24).toString("hex");
    return publicStatus();
  }
  function revoke(input) {
    assertActivePanel(input);
    const revoked = desiredEnabled;
    desiredEnabled = false; sessionHash = crypto.randomBytes(24).toString("hex");
    persist(false, input);
    return {...publicStatus(), revoked};
  }
  function authorization() {
    return publicStatus().active ? {authorized:true,capability:CAPABILITY,sessionHash} : null;
  }
  return {activate, revoke, observePanel, authorization, publicStatus};
}
module.exports = {CAPABILITY, PANEL_FRESHNESS_MS, SCHEMA, createAutonomousSessionManager};
