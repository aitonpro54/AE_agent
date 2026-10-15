"use strict";
const { fail, hex, u64, pin, MARKER } = require("./codec"), path = require("node:path");
const ns = "local_session::", tr = ns + "trusted_read::", pr = ns + "production::";
function exact(value, allowed, required = allowed) { if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(value, key))) fail("production_profile_exact_fields_required"); }
function text(value) { if (typeof value !== "string" || value.includes("\0") || value.length > 1048576) fail("production_profile_text_required"); return JSON.stringify(value).replace(/\\u([a-f0-9]{4})/gi, "\\u$1"); }
const str = value => text(value), wide = value => "L" + text(value);
function ordinaryLaunchLocator(value) {
  if (typeof value !== "string" || !/^[a-z]:[\\/]/i.test(value) || /[\x00-\x1f\x7f]/.test(value) || value.replaceAll("/", "\\").split("\\").some(part => part === "." || part === "..")) fail("production_ordinary_launch_locator_required");
  return path.win32.normalize(value);
}
function bytes(value, size, zero = false) { return "{" + [...hex(value, size, zero)].map(n => "0x" + n.toString(16).padStart(2, "0")).join(",") + "}"; }
const digest = value => bytes(value, 32), id = value => bytes(value, 16), number = value => { if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) fail("production_profile_number_required"); return String(value); }, uint64 = value => { u64(value); return String(value) + "ULL"; }, bool = value => { if (typeof value !== "boolean") fail("production_profile_bool_required"); return String(value); };
const list = (values, convert) => { if (!Array.isArray(values) || values.length > 65535) fail("production_profile_array_required"); return "{" + values.map(convert).join(",") + "}"; };
function objectPin(value) { exact(value, ["volumeGuidHex", "fileIdHex", "serial", "canonicalPath"]); pin(value); if (!/^\\\\\?\\Volume\{[a-f0-9-]{36}\}\\/i.test(value.canonicalPath)) fail("production_canonical_pin_required"); return ns + "ObjectPin{" + [id(value.volumeGuidHex), id(value.fileIdHex), uint64(value.serial), wide(value.canonicalPath)].join(",") + "}"; }
function components(value) { return list(value, part => { if (!part || /[\\/:\x00-\x1f]/.test(part) || part === "." || part === "..") fail("production_component_required"); return wide(part); }); }
function file(value) {
  exact(value, ["components", "pin", "sha256"]); objectPin(value.pin);
  return ns + "reviewed::File{" + components(value.components) + "," + objectPin(value.pin) + "," + bytes(value.sha256, 32, true) + "}";
}
function sourceFile(value) { if (/^0+$/.test(value.sha256)) fail("production_source_sha_required"); return file(value); }
function lateFile(value) { exact(value, ["components", "canonicalPath"]); return "[](){" + ns + "reviewed::File f;f.components=" + components(value.components) + ";f.pin.canonicalPath=" + wide(value.canonicalPath) + ";return f;}()"; }
function enumValue(prefix, values) { return value => { if (!values.includes(value)) fail("production_profile_enum_required"); return prefix + value; }; }
function record(type, value, fields, optional = []) {
  exact(value, Object.keys(fields), Object.keys(fields).filter(key => !optional.includes(key)));
  return "[](){" + type + " p;\n" + Object.keys(fields).filter(key => Object.hasOwn(value, key)).map(key => "p." + key + "=" + fields[key](value[key]) + ";\n").join("") + "return p;}()";
}
const inventory = value => record(ns + "reviewed::Inventory", value, { components, absent: bool, pin: objectPin }, ["pin"]);
const enrollmentFields = { canonicalVolumeAnchor: wide, repositoryComponents: components, runtimeComponents: components, repositoryAncestors: x => list(x, objectPin), runtimeAncestors: x => list(x, objectPin), repository: objectPin, runtime: objectPin, userSid: wide,
  installation: id, lineage: id, launchTarget: id, stopTarget: id, actorTarget: id, authorizationAudit: digest, policyHash: digest, sourceSetHash: digest, policyEpoch: uint64, maximumSessionMs: uint64, maximumLeaseMs: uint64, capabilities: number, enabled: bool,
  sourceFiles: x => list(x, sourceFile), node: sourceFile, controllerImage: sourceFile, inventories: x => list(x, inventory) };
const rowFile = value => { exact(value, ["code", "file"]); return "{" + number(value.code) + "," + file(value.file) + "}"; }, selector = value => { exact(value, ["code", "components"]); return "{" + number(value.code) + "," + components(value.components) + "}"; };
const definitionFields = { setupNamespace: objectPin, setupComponents: components, anchorComponents: components, setupAncestors: x => list(x, objectPin), fixedProfileHash: digest, staticCodeHash: digest, transportProfileHash: digest, artifacts: x => list(x, selector), dependencies: x => list(x, rowFile), buildInputs: x => list(x, rowFile), automationCredential: sourceFile, panelCredential: sourceFile, buildInputManifest: file };
const nodeSource = value => record(tr + "Source", value, { selector: number, file, compiled: digest, url: str, roles: number, category: enumValue(tr + "SourceCategory::", ["FileDefault", "NodeDefault", "NodeCompileZero", "InternalThis"]), contextSlot: enumValue(tr + "ContextSlot::", ["None", "Default", "Internal"]), endLine: number, endColumn: number, length: number, utf8ByteLength: uint64 }, ["file"]);
const cepSource = value => record(tr + "CepSource", value, { selector: number, url: str, compiled: digest, startLine: number, startColumn: number, endLine: number, endColumn: number, length: number, utf8ByteLength: uint64, diagnostic: bool, hasSourceURL: bool, isModule: bool, isLiveEdit: bool });
const variant = value => record(tr + "VariantSelector", value, { variantId: wide, rootName: wide, compName: wide, workingName: wide, snapshotName: wide, outputName: wide });
const cost = name => tr + "FixedTwoTitleCosts::" + name + "()";
function execution(value) {
  exact(value, ["policyHash", "typedProducerHash", "restorationLeaf", "checkpointLeaf", "cleanCopyLeaf", "ameTargetSpecifier", "variants", "sourceProject", "ame", "preset", "sourceProjectLocator", "snapshotRoot", "outputRoot", "manualQueueReservationRoot", "snapshotLocator", "outputLocator", "ameLocator", "manualQueueReservationLocator", "jobDeadlineMs"]);
  if (value.variants.length !== 2 || !/^ame-\d{1,3}\.\d{1,3}$/.test(value.ameTargetSpecifier) || BigInt(value.jobDeadlineMs) <= 310000n || BigInt(value.jobDeadlineMs) > 28800000n) fail("production_shared_policy_required");
  const fields = { policyHash: digest, typedProducerHash: digest, restorationLeaf: digest, checkpointLeaf: digest, cleanCopyLeaf: digest, ameTargetSpecifier: str, variants: x => list(x, variant), sourceProject: sourceFile, ame: sourceFile, preset: sourceFile,
    sourceProjectLocator: wide, snapshotRoot: objectPin, outputRoot: objectPin, manualQueueReservationRoot: objectPin, snapshotLocator: wide, outputLocator: wide, ameLocator: wide, manualQueueReservationLocator: wide, jobDeadlineMs: uint64 };
  const assignments = Object.keys(fields).map(key => "p." + key + "=" + fields[key](value[key]) + ";\n").join("");
  return "[](){" + tr + "ExecutionPolicy p;\np.enabled=true;p.budgetProfile=" + tr + "ExecutionBudgetProfile::SharedTwoTitleQueue85;p.selectionMode=" + tr + "TitleSelectionMode::FirstTwoObservedTextStatesV1;p.rangeMode=" + tr + "TitleRangeMode::FullObservedRootRangeV1;p.sampleMode=" + tr + "AlphaSampleMode::QuartileFramesV1;\n" + assignments +
    'p.checkpointName=L"titr_all-source-checkpoint.aep";\n' + ["startup:Startup", "initialRead:InitialRead", "preparation:Preparation", "checkpoint:Checkpoint", "cleanCopy:CleanCopy", "stage:Delivery", "enqueued:Delivery", "start:Delivery", "restoration:Delivery", "finalTeardown:Teardown"].map(row => { const [field, method] = row.split(":"); return "p." + field + "=" + cost(method) + ";\n"; }).join("") + "p.poll=" + tr + "FixedSharedQueueCosts::Poll();p.terminal=" + tr + "FixedSharedQueueCosts::Terminal();\nreturn p;}()";
}
const trustedFields = { broker: lateFile, addon: lateFile, adapter: sourceFile, ae: sourceFile, cepImages: x => list(x, sourceFile), panelFiles: x => list(x, sourceFile), nodeSources: x => list(x, nodeSource), controllerSourceBytes: uint64, daemonSourceBytes: uint64, cepSources: x => list(x, cepSource), cepSourceBytes: uint64, cdpTargetUrl: str, cepContextOrigin: str, cepDiagnostic: str,
  panelRoot: objectPin, panelBootstrapRoot: objectPin, transport: sourceFile, repository: wide, brokerLocator: wide, addonLocator: wide, nodeLocator: wide, adapterLocator: wide, aeLocator: wide, panelBootstrapLocator: wide, bridgePort: number, cdpPort: number, panelBootstrapDescriptor: digest, panelBootstrapTemplateHash: digest, projectLeaf: digest, projectScript: str, projectScriptHash: digest, execution };
function validate(document) {
  exact(document, ["schema", "enrollment", "definition", "trustedRead", "build", "census"]);
  if (document.schema !== "ae-agent.shared-queue-production-build-inputs.v1") fail("production_input_schema_required");
  const p = document.enrollment, d = document.definition, t = document.trustedRead;
  if (document.build.msbuild) ordinaryLaunchLocator(document.build.msbuildLocator);
  record(ns + "reviewed::Profile", p, enrollmentFields); record(pr + "SetupDefinition", d, definitionFields); record(tr + "Profile", t, trustedFields);
  if (p.capabilities !== 0x07ff || !p.enabled || String(p.maximumSessionMs) !== "28800000" || String(p.maximumLeaseMs) !== "60000" || p.sourceSetHash !== d.staticCodeHash || t.panelFiles.length !== 8 || t.bridgePort !== 3456 || t.cdpPort !== 8870 || t.nodeSources.length === 0 || t.cepSources.length === 0) fail("production_combined_profile_required");
  const host = d.artifacts.some(a => a.code === 4), mandatory = host ? 7 : 6;
  if (d.artifacts.length < 3 || d.artifacts.slice(0, 3).map(a => a.code).join() !== "1,2,3" || d.dependencies.length < 10 || d.dependencies.length > 157 || d.buildInputs.length < mandatory || d.buildInputs.length > 1024) fail("production_complete_tables_required");
  let previous = 0; const paths = new Set();
  for (const [i, row] of d.buildInputs.entries()) { if (row.code <= previous || (i < mandatory ? row.code !== i + 1 : row.code < 16) || paths.has(row.file.pin.canonicalPath) || row.code <= 3 && !/^0{64}$/.test(row.file.sha256) || row.file.pin.canonicalPath === d.buildInputManifest.pin.canonicalPath) fail("production_build_table_refused"); previous = row.code; paths.add(row.file.pin.canonicalPath); }
  if (!/^0{64}$/.test(d.buildInputManifest.sha256) || d.automationCredential.sha256 === d.panelCredential.sha256) fail("production_manifest_or_credentials_refused");
  return document;
}
function generate(document, anchor = null, generatedHash = "0".repeat(64)) {
  validate(document); hex(generatedHash, 32, true);
  const installation = '#pragma once\n#include "production_artifact_seal.h"\nnamespace local_session_reviewed {\ninline const local_session::reviewed::Profile kProfile=' + record(ns + "reviewed::Profile", document.enrollment, enrollmentFields) + ";\ninline const local_session::production::SetupDefinition kSetupDefinition=[](){auto p=" + record(pr + "SetupDefinition", document.definition, definitionFields) + ";p.enrollment=kProfile;return p;}();\n}\n";
  const trusted = '#pragma once\n#include "local_session_native_client.h"\nnamespace local_session_trusted_read_reviewed {\ninline const local_session::trusted_read::Profile kProfile=' + record(tr + "Profile", document.trustedRead, trustedFields) + ";\n}\n";
  const production = '#pragma once\n#include "local_session_installation_pins.h"\nnamespace local_session_production_reviewed {\n' + MARKER + generatedHash + '";\ninline const local_session::production::Definition kDefinition=[](){local_session::production::Definition p;static_cast<local_session::production::StaticDefinition&>(p)=local_session_reviewed::kSetupDefinition;' + (anchor ? "p.anchor=" + objectPin(anchor) + ";" : "") + "p.generatedBuildInputsHash=local_session::production::DecodeGeneratedBuildInputsHash(kExpectedGeneratedBuildInputsHashHex);return p;}();\n}\n";
  return { "local_session_production_artifact_pins.h": production, "local_session_installation_pins.h": installation, "local_session_trusted_read_pins.h": trusted };
}
module.exports = { validate, generate, objectPin, file, ordinaryLaunchLocator };
