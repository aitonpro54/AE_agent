"use strict";
// Offline mapped copies only. No bridge, HTTP, CEP, AE, native launch or reload.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os"), Module = require("node:module");
const ledger = require("../mcp-server/native-fixture-attempt-ledger"), production = require("../mcp-server/native-fixture-admission-refusal-proof");
const ROOT = path.resolve(__dirname, ".."), P = production.PROFILE, clone = ledger.clone, checks = [];
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "ae-refusal-proof-"));
const freeze = path.join(".codex-runtime", "fixture-prephase-session-20261011");
const runRelative = path.join("logs", "evidence", "plan-runs", P.runId + ".json"), receiptRelative = path.join("logs", "cep-panel-control", P.requestId + ".json");
const manifestRelative = path.join(freeze, "freeze-manifest.json"), checkpointRelative = path.join("backups", P.checkpointName);
const sessionRelative = path.join("logs", "edit-sessions.jsonl"), copies = [freeze, runRelative, receiptRelative, checkpointRelative, sessionRelative, path.join(".codex-runtime", "ame-native-fixture-ledger")];
const originalPins = Object.fromEntries([manifestRelative, runRelative, receiptRelative, checkpointRelative].map(file => [file, ledger.hash(fs.readFileSync(path.join(ROOT, file)))]));
const changed = new Map(), created = new Set(), symbolic = new Set(), redirected = new Map();
function underTemporary(file) {
  const absolute = path.resolve(file), relative = path.relative(temporary, absolute);
  assert.ok(relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative), "temporary containment required");
  return absolute;
}
function local(relative) { return underTemporary(path.join(temporary, relative)); }
function toLocal(file) {
  if (typeof file !== "string") return file;
  const relative = path.relative(P.repoRoot, path.resolve(file));
  return relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative) ? local(relative) : file;
}
function fromLocal(file) {
  const relative = path.relative(temporary, path.resolve(file));
  return relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative) ? path.join(P.repoRoot, relative) : file;
}
const mappedFs = Object.create(fs);
for (const name of ["readFileSync", "readdirSync", "existsSync"]) mappedFs[name] = (file, ...args) => fs[name](toLocal(file), ...args);
mappedFs.openSync = (file, flags, ...args) => { assert.equal(flags, "r", "proof may open only for reading"); return fs.openSync(toLocal(file), flags, ...args); };
mappedFs.lstatSync = file => {
  const stat = fs.lstatSync(toLocal(file));
  return symbolic.has(path.resolve(file)) ? new Proxy(stat, {get: (target, key) => key === "isSymbolicLink" ? () => true : typeof target[key] === "function" ? target[key].bind(target) : target[key]}) : stat;
};
mappedFs.realpathSync = file => redirected.get(path.resolve(file)) || fromLocal(fs.realpathSync(toLocal(file)));
for (const name of ["writeFileSync", "appendFileSync", "mkdirSync", "unlinkSync", "renameSync", "rmSync"]) mappedFs[name] = () => assert.fail("read-only proof attempted " + name);
function compiled() {
  function load(relative, extra, importedLedger) {
    const filename = path.join(ROOT, relative), mod = new Module(filename, module); mod.filename = filename; mod.paths = module.paths;
    mod.require = name => name === "node:fs" ? mappedFs : name === "./native-fixture-attempt-ledger" ? importedLedger : require(name);
    mod._compile(fs.readFileSync(filename, "utf8") + (extra || ""), filename); return mod;
  }
  const importedLedger = load("mcp-server/native-fixture-attempt-ledger.js").exports;
  // The production module exposes no injected core/pins. This private compiled
  // seam exists only in this smoke process and cannot be invoked through tools.
  return load("mcp-server/native-fixture-admission-refusal-proof.js", "\nmodule.__offline = {auditCore, pins: FIXED_PINS, callGraph};", importedLedger);
}
function write(relative, bytes) {
  const file = local(relative);
  if (!changed.has(file) && fs.existsSync(file)) changed.set(file, fs.readFileSync(file));
  if (!fs.existsSync(file)) created.add(file);
  fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, bytes);
}
function restore() {
  for (const [file, bytes] of changed) fs.writeFileSync(underTemporary(file), bytes);
  for (const file of created) if (fs.existsSync(file)) fs.unlinkSync(underTemporary(file));
  changed.clear(); created.clear(); symbolic.clear(); redirected.clear();
}
function test(name, action) { try { action(); checks.push(name); } finally { restore(); } }
const reject = (action, code) => assert.throws(action, error => error.code === code);
function rebind({run, receipt, pins: mutatePins} = {}) {
  const pins = clone(loaded.__offline.pins), envelope = JSON.parse(fs.readFileSync(local(runRelative))), transport = JSON.parse(fs.readFileSync(local(receiptRelative))), manifest = JSON.parse(fs.readFileSync(local(manifestRelative)));
  if (run) {
    run(envelope.record.run, envelope.record);
    envelope.sha256 = ledger.hash(envelope.record); pins.recordSha256 = envelope.sha256;
    const bytes = Buffer.from(JSON.stringify(envelope)); pins.run = {bytes: bytes.length, sha256: ledger.hash(bytes)};
    write(runRelative, bytes); write(path.join(freeze, "original-receipts", "plan-runs", P.runId + ".json"), bytes);
    transport.result.run = clone(envelope.record.run);
  }
  if (receipt) receipt(transport);
  if (run || receipt) {
    const bytes = Buffer.from(JSON.stringify(transport)); pins.receipt = {bytes: bytes.length, sha256: ledger.hash(bytes)};
    write(receiptRelative, bytes); write(path.join(freeze, "original-receipts", "cep-panel-control", P.requestId + ".json"), bytes);
  }
  if (mutatePins) mutatePins(pins, envelope.record.run);
  manifest.receipts = [{name: "plan-runs/" + P.runId + ".json", sha256: pins.run.sha256, bytes: pins.run.bytes},
    {name: "cep-panel-control/" + P.requestId + ".json", sha256: pins.receipt.sha256, bytes: pins.receipt.bytes}];
  const bytes = Buffer.from(JSON.stringify(manifest)); pins.manifest = {bytes: bytes.length, sha256: ledger.hash(bytes)}; write(manifestRelative, bytes);
  return () => loaded.__offline.auditCore(P.repoRoot, P.evidenceRoot, pins);
}
let loaded;
try {
  for (const relative of copies) {
    const target = local(relative); fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.cpSync(path.join(ROOT, relative), target, {recursive: true, force: false, errorOnExist: true});
  }
  loaded = compiled(); const proof = loaded.exports;
  assert.deepEqual(Object.keys(production).sort(), ["OUTCOME", "PROFILE", "classify", "select", "selector"].sort());
  test("production entry uses exact frozen 53 modules, receipts, session rows and checkpoint", () => {
    const value = proof.classify();
    assert.deepEqual(Object.fromEntries(Object.keys(production.OUTCOME).map(key => [key, value[key]])), production.OUTCOME);
    assert.equal(value.binding.pins.modules.length, 53); assert.equal(Object.keys(value.binding.pins.callGraphHashes).length, 8);
    assert.equal(value.binding.observedEffects.checkpointCreated, true); assert.equal(value.binding.observedEffects.sessionOutcome, "needs-review");
    assert.deepEqual(value.binding.observedEffects.recordedOperations, []); assert.equal(value.binding.contradictionCheck.role, "contradiction_check_only");
    assert.deepEqual(value.binding.receiptProjection.excludedFields, ["m100Message", "diagnostic"]);
    assert.equal(value.binding.pins.checkpoint.bytes, 31998115); assert.equal(value.binding.pins.checkpoint.sha256, originalPins[checkpointRelative]);
    assert.equal(value.transport.source, "programmatic"); assert.equal(value.transport.delivery, "delivered");
    for (const key of ["aeExecutionProven", "zeroEffects", "projectGraphPreserved", "admissionGuardReleased"]) assert.equal(value[key], undefined);
    assert.deepEqual(proof.select(proof.selector()), proof.selector());
  });
  test("fixed selector rejects other run/request and client proof fields", () => {
    for (const value of [{...proof.selector(), runId: "5a4ac6eb-7b2e-42ce-8af9-7d03e52c17c5"}, {...proof.selector(), requestId: P.proposalRequestId}, {...proof.selector(), pins: {}}]) reject(() => proof.select(value), "fixture_refusal_fixed_selector_required");
  });
  test("production paths cannot select alternate evidence or supply synthetic pins", () => {
    reject(() => proof.classify(temporary, path.join(temporary, "logs")), "fixture_refusal_fixed_paths_required");
    reject(() => proof.classify(P.repoRoot + "\\..\\AE_agent", P.evidenceRoot), "fixture_refusal_fixed_paths_required");
    reject(() => proof.classify({repoRoot: P.repoRoot, evidenceRoot: P.evidenceRoot, pins: {}}), "fixture_refusal_fixed_paths_required");
  });
  for (const relative of [manifestRelative, runRelative, receiptRelative, path.join(freeze, "original-receipts", "plan-runs", P.runId + ".json"),
    path.join(freeze, "original-runtime-source", "mcp-server", "ame-native-fixture-runner.js")]) test("altered full bytes rejected: " + relative, () => {
      write(relative, Buffer.concat([fs.readFileSync(local(relative)), Buffer.from(" ")])); reject(() => proof.classify(), "fixture_refusal_original_bytes_changed");
    });
  test("additional frozen source and path-shaped source rejected", () => {
    write(path.join(freeze, "original-runtime-source", "mcp-server", "extra.js"), "// extra"); reject(() => proof.classify(), "fixture_refusal_source_inventory_changed");
  });
  test("exact source guard and authorize order fail even in offline source seam", () => {
    const dir = path.join(freeze, "original-runtime-source"), manifest = JSON.parse(fs.readFileSync(local(manifestRelative)));
    const sources = Object.fromEntries(manifest.runtime.modules.map(m => [m.name, fs.readFileSync(local(path.join(dir, ...m.name.split("/"))), "utf8")]));
    assert.equal(Object.keys(loaded.__offline.callGraph(sources)).length, 8);
    const runnerName = "mcp-server/ame-native-fixture-runner.js", old = sources[runnerName];
    sources[runnerName] = old.replace('await recovery.bindAdmission(context,deps.prephaseRecoveryReaders())', 'recovery.bindAdmission(context,deps.prephaseRecoveryReaders())');
    reject(() => loaded.__offline.callGraph(sources), "fixture_refusal_old_controlflow_changed");
    sources[runnerName] = old.replace('    deps.assertManualIngress(context);\n    const recovery=', '    await issuer.authorize(context);\n    deps.assertManualIngress(context);\n    const recovery=');
    reject(() => loaded.__offline.callGraph(sources), "fixture_refusal_old_controlflow_changed");
  });
  test("rebound canonical other run, step count, proposal and unknown outcome rejected", () => {
    for (const mutate of [r => { r.id = "5a4ac6eb-7b2e-42ce-8af9-7d03e52c17c5"; }, r => { r.executedCount = 1; }, r => { r.provenance.proposalRevision = 3; }, r => { r.outcome.mutation.status = "not_started"; }]) {
      const action = rebind({run: mutate}); reject(action, "fixture_refusal_canonical_binding_invalid"); restore();
    }
  });
  test("rebound receipt drift preserves strict full projected equivalence", () => {
    for (const mutate of [r => { r.state = "completed"; }, r => { r.source = "ui"; }, r => { r.result.run.steps[0].phase = "execute"; }, r => { r.result.run.checkpoint.sourceFile = "other.aep"; }, r => { r.result.run.m100Action.payloadHash = "sha256:" + "a".repeat(64); }, r => { r.result.run.editSessionFinished.operations.push({tool: "x"}); }]) {
      reject(rebind({receipt: mutate}), "fixture_refusal_transport_binding_invalid"); restore();
    }
  });
  test("session pins do not convert nonempty operations into native refusal evidence", () => {
    reject(rebind({run: r => { r.editSessionFinished.operations = [{tool: "x"}]; r.editSessionFinished.operationCount = 1; }, pins: (pins, r) => { pins.finishedSessionSha256 = ledger.hash(r.editSessionFinished); }}), "fixture_refusal_session_binding_invalid");
  });
  test("checkpoint path cannot be inferred to preserve graph or repointed", () => {
    reject(rebind({run: r => { r.checkpoint.checkpointFile = path.join(P.repoRoot, "backups", "other.aep"); }}), "fixture_refusal_session_binding_invalid");
  });
  test("exact session row edit and extra same-session row rejected", () => {
    const original = fs.readFileSync(local(sessionRelative));
    write(sessionRelative, Buffer.concat([original, Buffer.from(JSON.stringify({session: {id: P.sessionId}, type: "refusal"}) + "\n")])); reject(() => proof.classify(), "fixture_refusal_session_rows_changed");
    restore(); write(sessionRelative, original.toString().replace(P.finishedAt, "2026-10-11T05:42:39.754Z")); reject(() => proof.classify(), "fixture_refusal_session_rows_changed");
  });
  test("unrelated session-log append is permitted", () => {
    write(sessionRelative, Buffer.concat([fs.readFileSync(local(sessionRelative)), Buffer.from('{"type":"unrelated","session":{"id":"offline-other"}}\n')])); assert.equal(proof.classify().authority, production.OUTCOME.authority);
  });
  test("same-size checkpoint content tamper and size drift rejected", () => {
    const bytes = fs.readFileSync(local(checkpointRelative)); bytes[0] ^= 1; write(checkpointRelative, bytes); reject(() => proof.classify(), "fixture_refusal_checkpoint_changed");
    restore(); write(checkpointRelative, "short"); reject(() => proof.classify(), "fixture_refusal_checkpoint_identity");
  });
  test("rebound mixed run/receipt pins remain rejected by production", () => {
    rebind({run: r => { r.provenance.actionId = "act_other"; }}); reject(() => proof.classify(), "fixture_refusal_original_bytes_changed");
  });
  test("ledger absence is only a contradiction check; a linked row rejects", () => {
    write(path.join(".codex-runtime", "ame-native-fixture-ledger", "a".repeat(32), "reservation.json"), JSON.stringify({value: {runId: "foreign", attempt: {selector: proof.selector()}}}));
    reject(() => proof.classify(), "fixture_refusal_linked_native_row_present");
  });
  test("symlink-shaped exact run/source/session/checkpoint and parent are rejected", () => {
    for (const relative of [runRelative, path.join(freeze, "original-runtime-source", "mcp-server", "bridge-daemon.js"), sessionRelative]) {
      symbolic.add(path.join(P.repoRoot, relative)); reject(() => proof.classify(), "fixture_ledger_file_identity"); symbolic.clear();
    }
    symbolic.add(path.join(P.repoRoot, checkpointRelative)); reject(() => proof.classify(), "fixture_refusal_checkpoint_identity"); symbolic.clear();
    symbolic.add(path.join(P.repoRoot, freeze, "original-runtime-source")); reject(() => proof.classify(), "fixture_ledger_directory_identity");
  });
  test("realpath escape is rejected even for exact pinned bytes", () => {
    redirected.set(path.join(P.repoRoot, runRelative), path.join(P.repoRoot, "outside.json")); reject(() => proof.classify(), "fixture_ledger_file_identity");
  });
  for (const [relative, pin] of Object.entries(originalPins)) assert.equal(ledger.hash(fs.readFileSync(path.join(ROOT, relative))), pin, "original file must remain unchanged");
  process.stdout.write(JSON.stringify({ok: true, scope: "offline_fixed_refusal_proof", checks: checks.length, cases: checks}) + "\n");
} finally {
  restore(); assert.ok(path.dirname(path.resolve(temporary)) === path.resolve(os.tmpdir())); fs.rmSync(underTemporary(temporary), {recursive: true, force: true});
}
