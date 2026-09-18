"use strict";

// Один текущий proposal на bridge. Проекция не содержит полномочий исполнения.
const CONTRACT_VERSION = "typed-autonomy.v2";
const INSTANCE_ID = require("crypto").randomUUID();
const TERMINAL = new Set(["completed", "failed", "cancelled", "expired", "superseded"]);
function failure(code, message) { return Object.assign(new Error(message), {code}); }
function normalizeProject(file) {
  return typeof file === "string" ? file.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase() : "";
}
function createProposalState() {
  let revision = 0;
  let current = null;
  function register(record, expectedCurrent) {
    if (expectedCurrent && current !== expectedCurrent) {
      throw failure("plan_superseded", "Текущий план изменился во время подготовки. Получите актуальную версию.");
    }
    if (current && ["confirmed", "executing"].includes(current.executionState)) {
      throw failure("plan_execution_in_progress", "Текущий план ещё выполняется. Дождитесь read-back.");
    }
    if (current && !TERMINAL.has(current.executionState)) {
      current.executionState = "superseded";
      current.supersededBy = record.actionId;
    }
    record.revision = ++revision;
    record.contractVersion = CONTRACT_VERSION;
    record.project = {expectedFile: record.payload.plan.targetProject && record.payload.plan.targetProject.file || null, actualFile: null};
    current = record;
  }
  function assertCurrent(record) {
    if (!record || !current || current !== record || record.executionState === "superseded") {
      throw failure("plan_superseded", "План заменён более новой версией. Получите текущий proposal.");
    }
    if (Date.parse(record.proposalExpiresAt) <= Date.now()) throw failure("m100_action_proposal_expired", "Срок действия плана истёк.");
    if (record.contractVersion !== CONTRACT_VERSION) throw failure("plan_contract_changed", "Контракт плана изменился. Создайте новый proposal.");
  }
  function bindProject(record, actualFile) {
    if (!normalizeProject(actualFile)) throw failure("project_save_required", "Сначала сохраните целевой AE-проект.");
    record.project.actualFile = actualFile;
    if (!record.project.expectedFile) record.project.expectedFile = actualFile;
    if (normalizeProject(record.project.expectedFile) !== normalizeProject(actualFile)) {
      throw Object.assign(failure("project_target_mismatch", "Открыт другой AE-проект."), {project: {...record.project}});
    }
  }
  function assertExecution(guard) {
    if (!current || !guard || current.actionId !== guard.actionId || current.executionId !== guard.executionId ||
        !["confirmed", "executing"].includes(current.executionState)) {
      throw failure("plan_execution_owner_changed", "Команда больше не принадлежит текущему запуску плана.");
    }
    assertCurrent(current);
    if (guard.proposalExpiresAt !== current.proposalExpiresAt) {
      throw failure("plan_superseded", "Срок и версия команды не совпадают с текущим proposal.");
    }
  }
  function snapshot() {
    if (!current) return null;
    const record = current;
    const state = Date.parse(record.proposalExpiresAt) <= Date.now() ? "expired"
      : record.executionState === "pending" && record.dryRunCompletedAt ? "dry_run_passed" : record.executionState;
    return {
      instanceId: INSTANCE_ID, revision: record.revision, contractVersion: record.contractVersion, actionId: record.actionId,
      project: {...record.project}, proposal: record.proposal, plan: record.payload.plan,
      state, expiresAt: record.proposalExpiresAt, dryRunCompletedAt: record.dryRunCompletedAt,
      lastRun: record.lastRun || null
    };
  }
  return {register, assertCurrent, assertExecution, bindProject, snapshot, get current() { return current; }};
}

// Только перечисленные поля: никакие args, исходный текст, пути и токены не попадают в статистику.
function obstacleEvent(input) {
  const text = (value) => typeof value === "string" && /^[a-zA-Z0-9_.:-]{1,120}$/.test(value) ? value : null;
  return {
    at: new Date().toISOString(), operation: text(input.operation), proposalId: text(input.proposalId),
    runId: text(input.runId), code: text(input.code), phase: text(input.phase),
    durationMs: Math.max(0, Number(input.durationMs) || 0),
    successfulSteps: Math.max(0, Number(input.successfulSteps) || 0),
    failedSteps: Math.max(0, Number(input.failedSteps) || 0),
    verification: text(input.verification), attempt: Math.max(0, Number(input.attempt) || 0)
  };
}
module.exports = {CONTRACT_VERSION, createProposalState, normalizeProject, obstacleEvent};
