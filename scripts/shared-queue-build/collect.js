"use strict";
// Passive discovery and pure source generation only. This module never loads the
// production addon or imports bridge-daemon/mcp-adapter as executable modules.
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), { fileURLToPath } = require("node:url");
const { sha, domain, fail } = require("./codec");
const canonical = url => url.startsWith("node:") || url === "evalmachine.<anonymous>" ? url : (url.startsWith("file:") ? fileURLToPath(url) : url).replaceAll("/", "\\").toLowerCase();
function mergeCensus(controller, daemon) {
  const rows = new Map(), totals = {};
  for (const [role, document] of [["controller", controller], ["daemon", daemon]]) {
    if (document.schema !== "ae-agent.owned-initial-passive-source-census.v1" || document.role !== role || document.authority !== false || document.nativeFactories !== 0 || document.addonLoaded !== false || document.runtimeVersion !== "v24.19.0" || document.snapshotComplete !== true || document.late !== 0 || Object.values(document.signals).some(v => v !== 0) || document.rows.length !== document.rowCount) fail("production_actual_passive_census_required");
    let total = 0;
    for (const item of document.rows) {
      const m = item.metadata, bytes = Buffer.from(item.sourceUtf8, "utf8"), digest = sha(bytes).toString("hex");
      if (!bytes.length || digest !== item.sha256 || bytes.length !== item.utf8ByteLength || m.hash !== digest || m.length !== item.sourceUtf8.length || m.startLine || m.startColumn || m.hasSourceURL || m.isModule || m.isLiveEdit || m.scriptLanguage !== "JavaScript" || m.sourceMapURL || m.embedderName !== m.url) fail("production_census_metadata_refused");
      let category, contextSlot;
      if (!m.executionContextId) { if (!m.url.startsWith("node:") || Object.hasOwn(m, "executionContextAuxData")) fail("production_census_zero_context_refused"); category = "NodeCompileZero"; contextSlot = "None"; }
      else {
        const context = document.contexts.find(c => c.id === m.executionContextId);
        if (!context || context.origin !== "" || !context.uniqueId || context.auxData?.isDefault !== m.executionContextAuxData?.isDefault) fail("production_census_context_refused");
        if (m.url === "evalmachine.<anonymous>") { if (item.sourceUtf8 !== "this" || context.name !== "internal" || context.auxData?.isDefault !== false) fail("production_census_internal_refused"); category = "InternalThis"; contextSlot = "Internal"; }
        else { if (context.auxData?.isDefault !== true) fail("production_census_default_refused"); category = m.url.startsWith("node:") ? "NodeDefault" : "FileDefault"; contextSlot = "Default"; }
      }
      const key = canonical(m.url), candidate = { compiled: digest, url: m.url, category, contextSlot, endLine: m.endLine, endColumn: m.endColumn, length: m.length, utf8ByteLength: bytes.length };
      const prior = rows.get(key);
      if (prior && JSON.stringify(prior.comparison) !== JSON.stringify({ ...candidate, url: key })) fail("production_role_source_difference_refused");
      if (!prior) rows.set(key, { comparison: { ...candidate, url: key }, row: { ...candidate, roles: 0 }, fileLocator: category === "FileDefault" ? (m.url.startsWith("file:") ? fileURLToPath(m.url) : m.url) : null });
      const saved = rows.get(key), mask = role === "controller" ? 1 : 2;
      if (saved.row.roles & mask) fail("production_duplicate_role_source_refused"); saved.row.roles |= mask; total += bytes.length;
    }
    if (total !== document.totalByteLength) fail("production_census_total_refused"); totals[role + "SourceBytes"] = total;
  }
  return { ...totals, nodeSources: [...rows.entries()].sort((a, b) => a[0].localeCompare(b[0], "en")).map(([, saved], i) => ({ selector: i + 1, ...saved.row, ...(saved.fileLocator ? { fileLocator: saved.fileLocator } : {}) })) };
}
function purePrograms(repository, program) {
  const acorn = require("internal/deps/acorn/acorn/dist/acorn"), mainPath = path.join(repository, "mcp-server/bridge-daemon.js"), source = fs.readFileSync(mainPath, "utf8"), tree = acorn.parse(source, { ecmaVersion: "latest" });
  const names = ["trustedExact", "aeLiteral", "ownedFirstTwoTitleInventory", "ownedObservedRootTiming", "ownedFixedTitleState", "ownedTrustedReadProjectScript", "wrapExtendScriptBody"], functions = [];
  for (const name of names) { const found = tree.body.filter(node => node.type === "FunctionDeclaration" && node.id.name === name); if (found.length !== 1) fail("production_named_factory_source_required"); functions.push({ name, source: source.slice(found[0].start, found[0].end) }); }
  const declarations = tree.body.flatMap(node => node.type === "VariableDeclaration" ? node.declarations : []), body = declarations.filter(node => node.id.name === "OWNED_TRUSTED_PROJECT_BODY");
  if (body.length !== 1 || body[0].init.type !== "TemplateLiteral" || body[0].init.expressions.length) fail("production_fixed_project_body_required");
  const renderPath = path.join(repository, "mcp-server/native-render-variant.js"), uiPath = path.join(repository, "mcp-server/owned-runtime-ui-baseline.js");
  const context = vm.createContext({ Buffer, nativeRenderVariant: require(renderPath), ownedInitialUiBaseline: require(uiPath).captureUiBaseline });
  vm.runInContext("const OWNED_TRUSTED_PROJECT_BODY=" + source.slice(body[0].init.start, body[0].init.end) + ";\n" + functions.map(row => row.source).join("\n"), context, { timeout: 1000 });
  context.program = program; const projectScript = vm.runInContext("ownedTrustedReadProjectScript(program)", context, { timeout: 1000 });
  const nativeSource = fs.readFileSync(path.join(repository, "native/owned-runtime-local-session/local_session_native_client.cpp"), "utf8"), marker = 'constexpr char kPanelBootstrapTemplate[]=R"JSX(', at = nativeSource.indexOf(marker), end = nativeSource.indexOf(')JSX";', at);
  if (at < 0 || end <= at || nativeSource.indexOf(marker, at + 1) !== -1) fail("production_exact_bootstrap_template_required");
  const bootstrap = nativeSource.slice(at + marker.length, end), functionRows = functions.map(row => ({ name: row.name, sha256: sha(Buffer.from(row.source)).toString("hex") }));
  const closure = Buffer.from(JSON.stringify({ functionRows, mainSha256: sha(Buffer.from(source)).toString("hex"), renderSha256: sha(fs.readFileSync(renderPath)).toString("hex"), uiSha256: sha(fs.readFileSync(uiPath)).toString("hex") }));
  return { schema: "ae-agent.shared-queue-pure-source-programs.v1", authority: false, nativeFactories: 0, projectScript, projectScriptHash: sha(Buffer.from(projectScript)).toString("hex"), projectLeaf: domain("ae-agent.shared-queue.project-leaf.v1", Buffer.from(projectScript)).toString("hex"), typedProducerHash: domain("ae-agent.shared-queue.typed-producers.v1", closure).toString("hex"), restorationLeaf: domain("ae-agent.shared-queue.restoration-source.v1", Buffer.from(source)).toString("hex"), checkpointLeaf: domain("ae-agent.shared-queue.checkpoint-source.v1", Buffer.from(nativeSource)).toString("hex"), cleanCopyLeaf: domain("ae-agent.shared-queue.clean-copy-source.v1", Buffer.from(nativeSource)).toString("hex"), panelBootstrapTemplateHash: sha(Buffer.from(bootstrap)).toString("hex"), functionRows };
}
async function cepSources(targetUrl) {
  if (typeof targetUrl !== "string" || !targetUrl.startsWith("file:///")) fail("production_exact_panel_target_url_required");
  const list = await (await fetch("http://127.0.0.1:8870/json/list", { signal: AbortSignal.timeout(5000) })).json(), matches = list.filter(row => row.type === "page" && row.url === targetUrl);
  if (matches.length !== 1 || !/^ws:\/\/127\.0\.0\.1:8870\//.test(matches[0].webSocketDebuggerUrl)) fail("production_exact_panel_cdp_target_required");
  const ws = new WebSocket(matches[0].webSocketDebuggerUrl), pending = new Map(), scripts = new Map(), contexts = new Map(); let sequence = 0, changed = false, collecting = true;
  const deadline = setTimeout(() => { for (const row of pending.values()) row.reject(Error("production_CDP_timeout")); ws.close(); }, 15000);
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  try {
    await new Promise((resolve, reject) => { ws.addEventListener("open", resolve, { once: true }); ws.addEventListener("error", reject, { once: true }); });
    ws.addEventListener("message", event => { const value = JSON.parse(event.data); if (value.id) { const row = pending.get(value.id); if (!row) return; pending.delete(value.id); value.error ? row.reject(Error("production_CDP_method_refused")) : row.resolve(value.result); }
      else if (value.method === "Debugger.scriptParsed") { if (!collecting || scripts.has(value.params.scriptId) || scripts.size >= 128) changed = true; scripts.set(value.params.scriptId, value.params); }
      else if (value.method === "Runtime.executionContextCreated") { const context = value.params.context; if (contexts.has(context.id)) changed = true; contexts.set(context.id, context); }
      else if (["Runtime.executionContextsCleared", "Runtime.executionContextDestroyed", "Debugger.globalObjectCleared", "Debugger.scriptFailedToParse"].includes(value.method)) changed = true;
    });
    await send("Runtime.enable"); await send("Debugger.enable"); collecting = false; const rows = []; let total = 0;
    for (const metadata of scripts.values()) { const result = await send("Debugger.getScriptSource", { scriptId: metadata.scriptId }), raw = Buffer.from(result.scriptSource, "utf8"); if (raw.length > 8 * 1024 * 1024 - total) fail("production_CEP_source_bytes_refused"); total += raw.length; rows.push({ metadata, sourceUtf8: result.scriptSource, sha256: sha(raw).toString("hex"), utf8ByteLength: raw.length }); }
    const sourceContexts = new Set(rows.map(row => row.metadata.executionContextId)), mainContexts = [...contexts.values()].filter(context => context.auxData?.isDefault === true && sourceContexts.has(context.id));
    if (changed || !rows.length || mainContexts.length !== 1 || !mainContexts[0].origin) fail("production_CEP_source_snapshot_changed");
    return { schema: "ae-agent.shared-queue-passive-cep-sources.v1", authority: false, nativeFactories: 0, targetUrl, targetId: matches[0].id, contextOrigin: mainContexts[0].origin, contexts: [...contexts.values()], collectedAt: new Date().toISOString(), rows, totalByteLength: total, pageEvaluation: false, diagnosticInjection: false };
  } finally { clearTimeout(deadline); ws.close(); }
}
module.exports = { mergeCensus, purePrograms, cepSources };
