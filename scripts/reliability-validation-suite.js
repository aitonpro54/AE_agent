#!/usr/bin/env node
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const NODE = process.execPath;
const SCHEMA = "ae-agent-reliability-validation.v1";
const REPORT_DIR = path.join(ROOT, "logs", "reliability-validation");
const BRIDGE_URL = process.env.AE_AGENT_RELIABILITY_BRIDGE_URL || process.env.CEP_PANEL_BRIDGE_URL || "http://127.0.0.1:3456";
const BRIDGE_TOKEN = process.env.AE_AGENT_RELIABILITY_BRIDGE_TOKEN || process.env.CEP_PANEL_BRIDGE_TOKEN || "codex-ae-local";
const CATEGORIES = ["local", "provider-readiness", "read-only-live", "external-provider", "mutating-live"];
const GATES = {
  externalProvider: "--allow-external-provider",
  mutatingLive: "--allow-mutating-live"
};

const READINESS_TARGETS = [
  ["openai-api", process.env.AE_AGENT_RELIABILITY_OPENAI_API_MODEL || "gpt-5.5"],
  ["openai-cli", process.env.AE_AGENT_RELIABILITY_OPENAI_CLI_MODEL || "gpt-5.5"],
  ["gemini-api", process.env.AE_AGENT_RELIABILITY_GEMINI_MODEL || "gemini-2.5-flash"],
  ["claude-api", process.env.AE_AGENT_RELIABILITY_CLAUDE_MODEL || "claude-sonnet-4-20250514"],
  ["openrouter", process.env.AE_AGENT_RELIABILITY_OPENROUTER_MODEL || "openrouter/free", true],
  ["ollama-local", process.env.AE_AGENT_RELIABILITY_OLLAMA_MODEL || process.env.CEP_PANEL_MODEL || "gemma4:latest"]
].map(([agentId, model, freeOnly]) => ({ agentId, model, freeOnly: freeOnly === true }));

function cmd(file, args = []) {
  return {
    cmd: NODE,
    args: [path.join("scripts", file), ...args],
    command: ["node", `scripts\\${file}`, ...args].join(" ")
  };
}

function item(id, category, description, run, opts = {}) {
  return {
    id,
    category,
    description,
    evidence: opts.evidence || [],
    gates: opts.gates || [],
    timeoutMs: opts.timeoutMs || 60000,
    internal: opts.internal || null,
    ...run
  };
}

function buildCheckCatalog() {
  return [
    item("reliability-suite-catalog", "local", "Self-check reliability suite grouping and gates.", cmd("reliability-validation-suite-smoke.js"), { evidence: ["suite schema", "gate metadata"], timeoutMs: 20000 }),
    item("provider-contract", "local", "Provider metadata and fake OpenAI CLI readiness states.", cmd("provider-contract-smoke.js"), { evidence: ["provider schema", "fake readiness"], timeoutMs: 45000 }),
    item("provider-api-fakes", "local", "Fake Gemini, Claude, OpenRouter and provider-error normalization.", cmd("provider-api-smoke.js"), { evidence: ["fake provider APIs"], timeoutMs: 45000 }),
    item("chatgpt-connector-offline", "local", "Read-only ChatGPT connector and JSX Lab quarantine.", cmd("chatgpt-connector-smoke.js"), { evidence: ["connector allowlist"], timeoutMs: 45000 }),
    item("prompt-optimization", "local", "Prompt Optimization payload and context injection.", cmd("prompt-optimization-smoke.js"), { evidence: ["prompt optimization"], timeoutMs: 45000 }),
    item("project-intent-memory", "local", "Project Intent Memory retrieval, redaction and update rules.", cmd("project-intent-memory-smoke.js"), { evidence: ["project memory"], timeoutMs: 30000 }),
    item("plan-classification", "local", "Agent plan confidence/risk classification.", cmd("plan-classification-smoke.js"), { evidence: ["classification"], timeoutMs: 30000 }),
    item("plan-repair", "local", "Bounded deterministic plan repair.", cmd("plan-repair-smoke.js"), { evidence: ["repair"], timeoutMs: 30000 }),
    item("semantic-verification", "local", "Deterministic post-run semantic outcome checks.", cmd("semantic-verification-smoke.js"), { evidence: ["semantic verification"], timeoutMs: 30000 }),
    item("agent-qa-audit-schema", "local", "Generated QA audit schema and leftover detection.", cmd("agent-qa-audit-smoke.js"), { evidence: ["audit schema"], timeoutMs: 30000 }),
    item("agent-run-report-schema", "local", "Agent run report schema and semantic aggregates.", cmd("agent-scenario-report-smoke.js"), { evidence: ["run reports"], timeoutMs: 30000 }),
    item("planner-corpus-offline", "local", "Accepted Agent scenario corpus through validation and dry-run.", cmd("agent-planner-corpus-smoke.js"), { evidence: ["offline corpus", "dry-run"], timeoutMs: 90000 }),
    item("solution-registry", "local", "Reviewed Solution Library registry metadata.", cmd("solution-registry-smoke.js"), { evidence: ["solution registry"], timeoutMs: 30000 }),
    item("solution-candidate-report", "local", "Candidate report redaction and quarantine guards.", cmd("solution-candidate-report-smoke.js"), { evidence: ["candidate quarantine"], timeoutMs: 30000 }),
    item("solution-promotion", "local", "Explicit solution promotion rules.", cmd("solution-promotion-smoke.js"), { evidence: ["promotion gates"], timeoutMs: 30000 }),
    item("solution-retrieval", "local", "Read-only advisory solution retrieval.", cmd("solution-retrieval-smoke.js"), { evidence: ["solution retrieval"], timeoutMs: 30000 }),
    item("solution-library-validation", "local", "Reviewed Solution Library validation.", cmd("solution-library-validation-smoke.js"), { evidence: ["solution validation"], timeoutMs: 30000 }),
    item("bridge-only", "local", "Bridge daemon isolated health smoke.", cmd("bridge-only-smoke-test.js"), { evidence: ["bridge daemon"], timeoutMs: 45000 }),
    item("repo-smoke", "local", "Broad local daemon/adapter smoke.", cmd("smoke-test.js"), { evidence: ["MCP tools"], timeoutMs: 90000 }),
    item("provider-readiness-matrix", "provider-readiness", "Live bridge readiness matrix with checkModels=0.", {}, { internal: "provider-readiness", evidence: ["readiness endpoint", "no model-list calls"], timeoutMs: 45000 }),
    item("live-cep-inspect", "read-only-live", "Inspect installed CEP CDP target.", cmd("cep-panel-cdp-smoke.js", ["inspect"]), { evidence: ["live CEP"], timeoutMs: 90000 }),
    item("live-cep-readonly-smoke", "read-only-live", "Installed CEP read-only Agent smoke.", cmd("cep-panel-cdp-smoke.js", ["smoke"]), { evidence: ["read-only live run"], timeoutMs: 150000 }),
    item("live-cep-plan-review", "read-only-live", "Plan Review UI live smoke.", cmd("cep-panel-cdp-smoke.js", ["plan-review-smoke"]), { evidence: ["plan review UI"], timeoutMs: 120000 }),
    item("live-generated-qa-audit", "read-only-live", "Read-only audit of generated QA leftovers/checkpoints/sessions.", cmd("cep-panel-cdp-smoke.js", ["agent-scenario-audit"]), { evidence: ["read-only live audit"], timeoutMs: 120000 }),
    item("live-provider-setup-ui", "read-only-live", "Provider setup UI with fake provider data.", cmd("cep-panel-cdp-smoke.js", ["provider-setup-smoke"]), { evidence: ["setup UI"], timeoutMs: 90000 }),
    item("live-provider-self-test-ui", "read-only-live", "Provider self-test UI with fake readiness data.", cmd("cep-panel-cdp-smoke.js", ["provider-self-test-smoke"]), { evidence: ["readiness UI"], timeoutMs: 90000 }),
    item("live-connector-status-ui", "read-only-live", "Connector status UI with fake connector data.", cmd("cep-panel-cdp-smoke.js", ["connector-status-smoke"]), { evidence: ["connector status UI"], timeoutMs: 90000 }),
    item("external-openai-cli-chat", "external-provider", "Live OpenAI CLI panel chat smoke; sends provider prompt.", cmd("cep-panel-cdp-smoke.js", ["openai-cli-smoke"]), { evidence: ["external provider chat"], gates: ["externalProvider"], timeoutMs: 180000 }),
    item("live-protected-mutating-safe-run", "mutating-live", "Protected live Safe Run smoke on generated items.", cmd("cep-panel-cdp-smoke.js", ["mutating-smoke"]), { evidence: ["protected edit session", "cleanup"], gates: ["mutatingLive"], timeoutMs: 180000 }),
    item("live-agent-scenario-local", "mutating-live", "Live Agent scenarios through configured local provider.", cmd("cep-panel-cdp-smoke.js", ["agent-scenario-smoke"]), { evidence: ["protected scenarios", "semantic verification"], gates: ["mutatingLive"], timeoutMs: 360000 }),
    item("live-agent-scenario-openai-cli", "mutating-live", "Live Agent scenarios through OpenAI CLI; external prompts plus live mutations.", cmd("cep-panel-cdp-smoke.js", ["agent-scenario-openai-cli-smoke"]), { evidence: ["external planner", "protected scenarios"], gates: ["externalProvider", "mutatingLive"], timeoutMs: 420000 })
  ];
}

function normalizeScope(scope) {
  const value = String(scope || "local").trim();
  if (value === "live-readonly") return "read-only-live";
  if (value === "readiness") return "provider-readiness";
  if (value === "mutating-local") return "mutating-live-local";
  return value || "local";
}

function categoriesForScope(scope) {
  const value = normalizeScope(scope);
  if (value === "all") return CATEGORIES.slice();
  if (value === "list") return [];
  if (value === "mutating-live-local") return ["mutating-live"];
  if (CATEGORIES.includes(value)) return [value];
  throw new Error(`Unknown reliability validation scope: ${scope}`);
}

function blockedReason(check, opts = {}) {
  for (const gate of check.gates || []) {
    if (gate === "externalProvider" && opts.allowExternalProvider !== true) {
      return `Requires ${GATES.externalProvider} because it can send prompts/project context to an external provider.`;
    }
    if (gate === "mutatingLive" && opts.allowMutatingLive !== true) {
      return `Requires ${GATES.mutatingLive} because it can mutate the live AE project.`;
    }
  }
  return null;
}

function selectedChecks(opts = {}, catalog = buildCheckCatalog()) {
  const scope = normalizeScope(opts.scope);
  const categories = categoriesForScope(opts.scope);
  return catalog
    .filter((check) => categories.includes(check.category))
    .filter((check) => scope !== "mutating-live-local" || !(check.gates || []).includes("externalProvider"))
    .map((check) => ({ ...check, blockedReason: blockedReason(check, opts) }));
}

function tail(value, limit = 2000) {
  const text = String(value || "");
  return text.length > limit ? text.slice(text.length - limit) : text;
}

function requestJson(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode || 0, body: body ? JSON.parse(body) : {} });
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timed out waiting for ${url}`)));
  });
}

function bridgeUrl(pathname, params, opts = {}) {
  const url = new URL(pathname, opts.bridgeUrl || BRIDGE_URL);
  const token = opts.bridgeToken === undefined ? BRIDGE_TOKEN : opts.bridgeToken;
  if (token) url.searchParams.set("token", token);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function compactCommandCheck(check) {
  if (!check) return null;
  return {
    args: Array.isArray(check.args) ? check.args.slice() : [],
    status: typeof check.status === "number" ? check.status : null,
    signal: check.signal || null,
    errorCode: check.errorCode || null,
    output: tail(check.output, 300) || null
  };
}

function compactReadiness(target, response) {
  const readiness = response && response.readiness;
  if (!readiness) return { agentId: target.agentId, model: target.model, ok: false, error: "Missing readiness payload" };
  const agent = readiness.agent || {};
  const codex = agent.codexStatus || null;
  return {
    agentId: target.agentId,
    model: readiness.model || target.model,
    ok: true,
    status: readiness.status || null,
    configured: readiness.configured === true,
    reachable: readiness.reachable === undefined ? null : readiness.reachable,
    modelAvailable: readiness.modelAvailable === undefined ? null : readiness.modelAvailable,
    modelSource: readiness.modelSource || null,
    canChat: readiness.canChat === true,
    providerGroup: agent.providerGroup || null,
    authMode: agent.authMode || null,
    transport: agent.transport || null,
    setupAction: agent.setupAction || null,
    requiresApiKey: agent.requiresApiKey === true,
    error: readiness.error || null,
    providerError: readiness.providerError ? {
      code: readiness.providerError.code || null,
      status: readiness.providerError.status || null,
      phase: readiness.providerError.phase || null,
      message: readiness.providerError.message || null,
      retryable: readiness.providerError.retryable === true
    } : null,
    codexStatus: codex ? {
      installed: Boolean(codex.installed),
      loggedIn: Boolean(codex.loggedIn),
      version: codex.version || null,
      status: codex.status || null,
      error: codex.error || null,
      versionCheck: compactCommandCheck(codex.versionCheck),
      loginStatusCheck: compactCommandCheck(codex.loginStatusCheck)
    } : null
  };
}

async function runProviderReadinessMatrix(check, opts = {}) {
  const startedAt = Date.now();
  let health = null;
  let healthError = null;
  try {
    const response = await requestJson(new URL("/health", opts.bridgeUrl || BRIDGE_URL).toString(), 8000);
    health = response.body || null;
  } catch (error) {
    healthError = error.message || String(error);
  }

  const providers = [];
  for (const target of READINESS_TARGETS) {
    try {
      const response = await requestJson(bridgeUrl("/agents/readiness", {
        agentId: target.agentId,
        model: target.model,
        freeOnly: target.freeOnly ? "1" : "0",
        checkModels: "0",
        timeoutMs: "8000"
      }, opts), 10000);
      providers.push(response.status === 200 && response.body && response.body.ok === true
        ? compactReadiness(target, response.body)
        : { agentId: target.agentId, model: target.model, ok: false, error: response.body && response.body.error || `HTTP ${response.status}` });
    } catch (error) {
      providers.push({ agentId: target.agentId, model: target.model, ok: false, error: error.message || String(error) });
    }
  }

  const failed = providers.filter((provider) => provider.ok !== true);
  const report = {
    ok: !healthError && failed.length === 0,
    bridge: { url: opts.bridgeUrl || BRIDGE_URL, health, healthError },
    checkModels: false,
    providers,
    summary: {
      total: providers.length,
      structured: providers.length - failed.length,
      configured: providers.filter((provider) => provider.configured === true).length,
      canChat: providers.filter((provider) => provider.canChat === true).length,
      setupNeeded: providers.filter((provider) => provider.ok === true && provider.configured === false).length,
      failed: failed.length
    }
  };
  return {
    id: check.id,
    category: check.category,
    command: "internal:provider-readiness",
    status: report.ok ? "passed" : "failed",
    durationMs: Date.now() - startedAt,
    stdoutTail: JSON.stringify(report, null, 2),
    stderrTail: "",
    error: report.ok ? null : healthError || `${failed.length} readiness checks failed`,
    providerReadiness: report
  };
}

function runSpawned(check) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let child;
    const done = (status, exitCode, signal, error) => resolve({
      id: check.id,
      category: check.category,
      command: check.command,
      status,
      exitCode,
      signal: signal || null,
      durationMs: Date.now() - startedAt,
      timedOut,
      stdoutTail: tail(stdout),
      stderrTail: tail(stderr),
      error: error || null
    });
    const timer = setTimeout(() => {
      timedOut = true;
      if (child) child.kill();
    }, Math.max(1000, Number(check.timeoutMs || 60000)));
    try {
      child = spawn(check.cmd, check.args || [], { cwd: ROOT, env: process.env, windowsHide: true });
    } catch (error) {
      clearTimeout(timer);
      done("failed", null, null, error.message || String(error));
      return;
    }
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      clearTimeout(timer);
      done("failed", null, null, error.message || String(error));
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      done(code === 0 && !timedOut ? "passed" : "failed", code, signal);
    });
  });
}

async function runCheck(check, opts) {
  if (check.blockedReason) return { id: check.id, category: check.category, command: check.command || `internal:${check.internal}`, status: "blocked", durationMs: 0, stdoutTail: "", stderrTail: "", error: check.blockedReason };
  if (opts.dryRun) return { id: check.id, category: check.category, command: check.command || `internal:${check.internal}`, status: "planned", durationMs: 0, stdoutTail: "", stderrTail: "", error: null };
  if (check.internal === "provider-readiness") return runProviderReadinessMatrix(check, opts);
  return runSpawned(check);
}

function summarizeResults(results) {
  const summary = { total: results.length, passed: 0, failed: 0, blocked: 0, planned: 0, durationMs: 0, byCategory: {} };
  for (const result of results) {
    summary[result.status] = (summary[result.status] || 0) + 1;
    summary.durationMs += Number(result.durationMs || 0);
    summary.byCategory[result.category] = summary.byCategory[result.category] || { total: 0, passed: 0, failed: 0, blocked: 0, planned: 0 };
    summary.byCategory[result.category].total += 1;
    summary.byCategory[result.category][result.status] = (summary.byCategory[result.category][result.status] || 0) + 1;
  }
  return summary;
}

function buildReport(opts, checks, results) {
  return {
    schemaVersion: SCHEMA,
    generatedAt: new Date().toISOString(),
    scope: normalizeScope(opts.scope),
    dryRun: opts.dryRun === true,
    bridge: { url: opts.bridgeUrl || BRIDGE_URL, tokenProvided: Boolean(opts.bridgeToken === undefined ? BRIDGE_TOKEN : opts.bridgeToken) },
    gates: { externalProviderAllowed: opts.allowExternalProvider === true, mutatingLiveAllowed: opts.allowMutatingLive === true },
    checks: checks.map((check) => ({ id: check.id, category: check.category, command: check.command || `internal:${check.internal}`, description: check.description, evidence: check.evidence, gates: check.gates, blockedReason: check.blockedReason || null })),
    results,
    summary: summarizeResults(results)
  };
}

function safeFilePart(value) {
  return String(value || "reliability-validation").replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96) || "reliability-validation";
}

function writeReport(report, opts = {}) {
  const outputDir = opts.outputDir || REPORT_DIR;
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `${safeFilePart(report.generatedAt.replace(/[:]/g, "-"))}-${safeFilePart(report.scope)}.json`);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2) + "\n", "utf8");
  return filePath;
}

function listCatalog(catalog = buildCheckCatalog()) {
  return {
    schemaVersion: SCHEMA,
    categories: CATEGORIES,
    checks: catalog.map((check) => ({ id: check.id, category: check.category, command: check.command || `internal:${check.internal}`, description: check.description, evidence: check.evidence, gates: check.gates }))
  };
}

function parseArgs(argv) {
  const opts = {
    scope: "local",
    dryRun: false,
    writeReport: false,
    outputDir: null,
    allowExternalProvider: false,
    allowMutatingLive: false,
    continueOnFail: true,
    bridgeUrl: BRIDGE_URL,
    bridgeToken: BRIDGE_TOKEN
  };
  let scopeSet = false;
  for (const arg of argv || []) {
    if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--write-report") opts.writeReport = true;
    else if (arg === "--allow-external-provider") opts.allowExternalProvider = true;
    else if (arg === "--allow-mutating-live") opts.allowMutatingLive = true;
    else if (arg === "--stop-on-fail") opts.continueOnFail = false;
    else if (arg === "--continue-on-fail") opts.continueOnFail = true;
    else if (arg.startsWith("--output-dir=")) opts.outputDir = path.resolve(ROOT, arg.slice("--output-dir=".length));
    else if (arg.startsWith("--bridge-url=")) opts.bridgeUrl = arg.slice("--bridge-url=".length);
    else if (arg.startsWith("--bridge-token=")) opts.bridgeToken = arg.slice("--bridge-token=".length);
    else if (!arg.startsWith("--") && !scopeSet) {
      opts.scope = normalizeScope(arg);
      scopeSet = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  categoriesForScope(opts.scope);
  return opts;
}

function usage() {
  return [
    "Usage: node scripts\\reliability-validation-suite.js [scope] [options]",
    "Scopes: local, provider-readiness, read-only-live, external-provider, mutating-live, mutating-live-local, all, list.",
    "Options: --dry-run, --write-report, --allow-external-provider, --allow-mutating-live, --stop-on-fail.",
    "Live readiness uses checkModels=0. External provider and live mutation checks stay gated; mutating-live-local excludes external-provider/OpenAI CLI planner checks."
  ].join("\n");
}

async function runSuite(opts = {}) {
  const catalog = buildCheckCatalog();
  if (normalizeScope(opts.scope) === "list") return { report: listCatalog(catalog), exitCode: 0 };
  const checks = selectedChecks(opts, catalog);
  const results = [];
  for (const check of checks) {
    const result = await runCheck(check, opts);
    results.push(result);
    if (opts.continueOnFail === false && result.status === "failed") break;
  }
  const report = buildReport(opts, checks, results);
  if (opts.writeReport) report.reportPath = writeReport(report, opts);
  const summary = report.summary;
  return { report, exitCode: summary.failed > 0 ? 1 : (summary.blocked > 0 ? 2 : 0) };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(usage());
    return;
  }
  const { report, exitCode } = await runSuite(opts);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = exitCode;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exit(1);
  });
}

module.exports = {
  CATEGORY_ORDER: CATEGORIES,
  REPORT_SCHEMA_VERSION: SCHEMA,
  PROVIDER_READINESS_TARGETS: READINESS_TARGETS,
  buildCheckCatalog,
  categoriesForScope,
  listCatalog,
  normalizeScope,
  parseArgs,
  runProviderReadinessMatrix,
  runSuite,
  selectedChecks,
  summarizeResults
};
