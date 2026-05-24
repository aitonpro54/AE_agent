"use strict";

const assert = require("assert");
const {
  CATEGORY_ORDER,
  REPORT_SCHEMA_VERSION,
  buildCheckCatalog,
  listCatalog,
  normalizeScope,
  selectedChecks,
  summarizeResults
} = require("./reliability-validation-suite");

function ids(items) {
  return items.map((item) => item.id);
}

const catalog = buildCheckCatalog();
assert(catalog.length > 0, "Catalog must not be empty.");
assert.strictEqual(normalizeScope("live-readonly"), "read-only-live");
assert.strictEqual(normalizeScope("readiness"), "provider-readiness");
assert.strictEqual(normalizeScope("mutating-local"), "mutating-live-local");

for (const category of CATEGORY_ORDER) {
  assert(catalog.some((item) => item.category === category), `Missing category ${category}.`);
}

const local = selectedChecks({ scope: "local" }, catalog);
assert(ids(local).includes("planner-corpus-offline"), "Local suite must include offline corpus.");
assert(ids(local).includes("semantic-verification"), "Local suite must include semantic verification.");
assert(ids(local).includes("provider-contract"), "Local suite must include provider contract readiness coverage.");
assert(local.every((item) => !item.blockedReason), "Local suite must not be approval-gated.");
const semanticVerificationCheck = local.find((item) => item.id === "semantic-verification");
assert(semanticVerificationCheck.evidence.includes("duplicate_layers"), "Semantic verification check must include duplicate_layers evidence.");

const readiness = selectedChecks({ scope: "provider-readiness" }, catalog);
assert.strictEqual(readiness.length, 1, "Readiness suite should be a single matrix check.");
assert.strictEqual(readiness[0].internal, "provider-readiness");

const externalBlocked = selectedChecks({ scope: "external-provider" }, catalog);
assert(externalBlocked.every((item) => item.blockedReason), "External checks must be blocked without approval.");
const externalAllowed = selectedChecks({ scope: "external-provider", allowExternalProvider: true }, catalog);
assert(externalAllowed.every((item) => !item.blockedReason), "External approval must unblock external checks.");

const mutatingBlocked = selectedChecks({ scope: "mutating-live", allowExternalProvider: true }, catalog);
assert(mutatingBlocked.some((item) => item.blockedReason), "Live mutations must require mutation approval.");
const mutatingAllowed = selectedChecks({ scope: "mutating-live", allowExternalProvider: true, allowMutatingLive: true }, catalog);
assert(mutatingAllowed.every((item) => !item.blockedReason), "Approval flags must unblock live mutations.");

const mutatingLocalBlocked = selectedChecks({ scope: "mutating-live-local" }, catalog);
assert(ids(mutatingLocalBlocked).includes("live-protected-mutating-safe-run"), "Local mutating suite must include protected mutation smoke.");
assert(ids(mutatingLocalBlocked).includes("live-agent-scenario-local"), "Local mutating suite must include local Agent scenarios.");
assert(!ids(mutatingLocalBlocked).includes("live-agent-scenario-openai-cli"), "Local mutating suite must exclude OpenAI CLI planner scenarios.");
assert(mutatingLocalBlocked.every((item) => !(item.gates || []).includes("externalProvider")), "Local mutating suite must not include external-provider gates.");
assert(mutatingLocalBlocked.some((item) => item.blockedReason), "Local live mutations still require mutation approval.");
const mutatingLocalAllowed = selectedChecks({ scope: "mutating-live-local", allowMutatingLive: true }, catalog);
assert(mutatingLocalAllowed.every((item) => !item.blockedReason), "Mutating-live-local approval must unblock local live mutations.");

const listed = listCatalog(catalog);
assert.strictEqual(listed.schemaVersion, REPORT_SCHEMA_VERSION);
assert(listed.checks.some((item) => item.id === "live-generated-qa-audit"), "Catalog must include read-only live audit.");
assert(listed.checks.some((item) => item.id === "live-protected-mutating-safe-run"), "Catalog must include protected mutation smoke.");

const summary = summarizeResults([
  { status: "passed", category: "local", durationMs: 2 },
  { status: "blocked", category: "mutating-live", durationMs: 0 },
  { status: "failed", category: "read-only-live", durationMs: 3 }
]);
assert.strictEqual(summary.total, 3);
assert.strictEqual(summary.passed, 1);
assert.strictEqual(summary.blocked, 1);
assert.strictEqual(summary.failed, 1);
assert.strictEqual(summary.byCategory.local.passed, 1);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: REPORT_SCHEMA_VERSION,
  categories: CATEGORY_ORDER,
  checks: catalog.length
}, null, 2));
