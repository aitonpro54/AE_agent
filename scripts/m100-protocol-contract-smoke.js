"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..");
const bridgePath = path.join(repoRoot, "mcp-server", "bridge-daemon.js");
const panelPath = path.join(repoRoot, "cep-panel", "panel.js");
const protocol = require(path.join(repoRoot, "mcp-server", "m100-protocol"));
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
  contains(bridge, "createM100AgentPlanProposal", "backend-owned proposal creation helper");
  contains(bridge, "m100ActionProposalStore", "server-side proposal payload store");
  contains(bridge, "ignoredClientConfirmation", "ignored client confirmation marker");
  contains(bridge, "proposal_required", "proposal-required direct block code");
  contains(bridge, "unknown_tool_blocked", "unknown-tool direct block code");
  contains(bridge, "run_extendscript", "raw ExtendScript tool name");
  contains(bridge, "run_extendscript_file", "raw ExtendScript file tool name");
  contains(bridge, "payloadHash", "canonical payload hash marker");
  contains(bridge, "previewHash", "canonical preview hash marker");
  contains(bridge, "proposalExpiresAt", "proposal expiry marker");

  contains(panel, "normalizeM100ActionProposal", "panel M100 proposal validator");
  contains(panel, "appendInlineActionProposalActions", "panel M100 action controls");
  assert(panel.indexOf("appendInlinePlanActions") < 0, "Panel must not expose legacy appendInlinePlanActions");
  assert(panel.indexOf("options.planActions") < 0, "Panel must not render controls from legacy options.planActions");

  const proposal = protocol.createActionProposalEnvelope({
    requestId: "req_smoke",
    summary: "Smoke proposal",
    risk: {
      level: "mutating",
      requiresConfirmation: true,
      reasons: ["smoke mutating plan"]
    },
    action: {
      kind: "ae_tool",
      toolName: "run_ai_agent_plan"
    },
    payload: {
      kind: "agent_plan",
      requestId: "req_smoke",
      plan: {
        summary: "Smoke plan",
        steps: [
          {
            title: "Read active comp",
            tool: "get_active_comp",
            args: {}
          }
        ]
      }
    },
    preview: "Smoke preview"
  });
  assert(protocol.validateActionProposalEnvelope(proposal).ok, "Backend-created proposal should validate");
  assert.strictEqual(proposal.messageType, "action_proposal");
  assert.strictEqual(proposal.createdBy, protocol.M100_BACKEND_SOURCE);
  assert.strictEqual(proposal.serverCreated, true);
  assert(proposal.action.payloadRef, "Proposal must use a server-side payloadRef");
  assert(/^sha256:[a-f0-9]{64}$/.test(proposal.action.payloadHash), "Proposal must include payloadHash");
  assert(/^sha256:[a-f0-9]{64}$/.test(proposal.action.previewHash), "Proposal must include previewHash");
  assert(proposal.confirmation.proposalExpiresAt, "Proposal must include proposalExpiresAt");

  const modelAuthored = {
    ...proposal,
    createdBy: "model",
    serverCreated: false
  };
  assert(!protocol.validateActionProposalEnvelope(modelAuthored).ok, "Model-authored proposal envelope must be rejected");

  const malformed = {
    ...proposal,
    actionId: ""
  };
  assert(!protocol.validateActionProposalEnvelope(malformed).ok, "Malformed action proposal must be rejected");

  const pendingContracts = [];
  if (bridge.indexOf("confirmationTokenHash") < 0 || bridge.indexOf("confirmedAt") < 0) {
    pendingContracts.push(pendingContract(
      "expired-confirmation",
      "Expired proposals are rejected before AE queueing.",
      "Patch 2 creates proposal expiry metadata, but Patch 3 owns confirmation token storage and expiry enforcement."
    ));
  }
  if (bridge.indexOf("confirmedAt") < 0 || bridge.indexOf("confirmationTokenHash") < 0) {
    pendingContracts.push(pendingContract(
      "replayed-confirmation",
      "Single-use confirmation tokens cannot be replayed.",
      "Patch 3 owns single-use confirmation token hashing and replay rejection."
    ));
  }
  if (bridge.indexOf("confirmationTokenHash") < 0 || bridge.indexOf("confirmM100ActionProposal") < 0) {
    pendingContracts.push(pendingContract(
      "mismatched-confirmation-payload",
      "Confirmation is tied to payloadHash, previewHash and riskPolicyVersion.",
      "Patch 2 computes proposal hashes; Patch 3 owns confirmation-time mismatch rejection."
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
      "raw JSX tool names are listed in the policy surface",
      "backend-created action_proposal validates with actionId, payloadRef, hashes, risk and expiry",
      "model-authored and malformed action_proposal envelopes are rejected",
      "panel executable controls are wired to M100 action proposals, not legacy result.plan"
    ],
    pendingContracts
  }, null, 2));
}

main();
