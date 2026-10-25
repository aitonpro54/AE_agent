"use strict";
const crypto = require("crypto");
const CONTRACT_VERSION = 2;
function identityMatches(command, payload) {
  return Boolean(command && payload && payload.contractVersion === CONTRACT_VERSION
    && payload.id === command.id && payload.executionId === command.executionId
    && payload.leaseId === command.leaseId && command.leaseOwner
    && payload.panelConnectionId === command.leaseOwner.panelConnectionId
    && payload.panelGeneration === command.leaseOwner.panelGeneration);
}
function digest(payload) {
  // Only accepted result fields; retries do not depend on object key order.
  return crypto.createHash("sha256").update(JSON.stringify({id:payload.id, executionId:payload.executionId,
    leaseId:payload.leaseId, panelConnectionId:payload.panelConnectionId, panelGeneration:payload.panelGeneration,
    contractVersion:payload.contractVersion, ok:payload.ok, result:payload.result === undefined ? null : payload.result,
    error:payload.error === undefined ? null : payload.error})).digest("hex");
}
function check(command, payload, stage) {
  if (!identityMatches(command, payload)) return "command_identity_mismatch";
  if (command.state !== stage) return "command_stage_mismatch";
  if (stage === "submitted" && (typeof payload.ok !== "boolean" || payload.ok && typeof payload.result !== "string")) return "command_result_invalid";
  return null;
}
module.exports = { CONTRACT_VERSION, identityMatches, digest, check };
