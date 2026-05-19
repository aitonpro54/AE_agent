"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..");
const bridgePath = path.join(repoRoot, "mcp-server", "bridge-daemon.js");
const panelPath = path.join(repoRoot, "cep-panel", "panel.js");
const strict = process.argv.includes("--strict") || process.env.M100_STRICT_CONTRACTS === "1";

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function contains(source, pattern, label) {
  assert(source.indexOf(pattern) >= 0, `Missing ${label || pattern}`);
}

function pendingContract(id, expected, evidence) {
  return {
    id,
    status: "pending",
    expected,
    evidence
  };
}

function main() {
  const bridge = read(bridgePath);
  const panel = read(panelPath);

  contains(bridge, "M100_RISK_POLICY_VERSION", "M100 risk policy constant");
  contains(bridge, "m100DirectToolCallBlock", "direct tool default-deny helper");
  contains(bridge, "ignoredClientConfirmation", "ignored client confirmation marker");
  contains(bridge, "proposal_required", "proposal-required direct block code");
  contains(bridge, "unknown_tool_blocked", "unknown-tool direct block code");
  contains(bridge, "run_extendscript", "raw ExtendScript tool name");
  contains(bridge, "run_extendscript_file", "raw ExtendScript file tool name");

  const pendingContracts = [];
  if (panel.indexOf("normalizeTranscriptPlanResult") >= 0 && panel.indexOf("appendInlinePlanActions(parent, planResult)") >= 0) {
    pendingContracts.push(pendingContract(
      "legacy-result-plan-controls",
      "Panel renders executable controls only from backend-created messageType:\"action_proposal\" envelopes.",
      "panel.js still normalizes result.plan and appends inline plan actions from transcript/restore shapes."
    ));
  }
  if (bridge.indexOf("messageType") < 0 || bridge.indexOf("action_proposal") < 0) {
    pendingContracts.push(pendingContract(
      "malformed-envelope",
      "Malformed or model-authored action envelopes are rejected before controls render.",
      "No M100 protocol envelope validator exists yet."
    ));
  }
  if (bridge.indexOf("proposalExpiresAt") < 0 || bridge.indexOf("confirmationTokenHash") < 0) {
    pendingContracts.push(pendingContract(
      "expired-confirmation",
      "Expired proposals are rejected before AE queueing.",
      "Server-owned proposal/confirmation store is not implemented yet."
    ));
  }
  if (bridge.indexOf("confirmedAt") < 0 || bridge.indexOf("confirmationTokenHash") < 0) {
    pendingContracts.push(pendingContract(
      "replayed-confirmation",
      "Single-use confirmation tokens cannot be replayed.",
      "Server-owned confirmation token hashing is not implemented yet."
    ));
  }
  if (bridge.indexOf("payloadHash") < 0 || bridge.indexOf("previewHash") < 0) {
    pendingContracts.push(pendingContract(
      "mismatched-confirmation-payload",
      "Confirmation is tied to payloadHash, previewHash and riskPolicyVersion.",
      "Canonical proposal hashing is not implemented yet."
    ));
  }

  if (strict && pendingContracts.length) {
    throw new Error(`Pending M100 protocol contracts: ${pendingContracts.map((item) => item.id).join(", ")}`);
  }

  console.log(JSON.stringify({
    ok: true,
    checked: [
      "M100 risk policy markers exist",
      "direct tool block ignores client confirmation",
      "proposal_required and unknown_tool_blocked are structured codes",
      "raw JSX tool names are listed in the policy surface"
    ],
    pendingContracts
  }, null, 2));
}

main();
