"use strict";

const assert = require("assert");
const http = require("http");
const {
  selectCepPanelTarget,
  isCepExtensionUrl,
  isUsableWebSocketUrl,
  DEFAULT_EXTENSION_ID,
  DEFAULT_CDP_PORT
} = require("./cep-panel-target");
const { connectToPanel } = require("./cep-panel-cdp-smoke");

function createMockPage(options = {}) {
  const {
    title = "AE Agent 3.3.1",
    url = "file:///C:/Users/Ant/AppData/Roaming/Adobe/CEP/extensions/com.codex.aemcpbridge/client/index.html",
    type = "page",
    id = "TEST_UUID_1234"
  } = options;
  const page = { id, title, type, url };
  page.webSocketDebuggerUrl = Object.prototype.hasOwnProperty.call(options, "webSocketDebuggerUrl")
    ? options.webSocketDebuggerUrl
    : "ws://127.0.0.1:8870/devtools/page/TEST_UUID_1234";
  return page;
}

async function runUnitTests() {
  const reports = [];

  // 1. Realshape unique target amongst other DevTools pages
  {
    const validAeAgentPage = createMockPage();
    const otherPages = [
      {
        id: "DEVTOOLS_1",
        title: "DevTools - file:///C:/Users/Ant/AppData/Roaming/Adobe/CEP/extensions/com.codex.aemcpbridge/client/index.html",
        type: "other",
        url: "chrome-devtools://devtools/bundled/inspector.html?ws=127.0.0.1:8870/devtools/page/TEST_UUID_1234",
        webSocketDebuggerUrl: "ws://127.0.0.1:8870/devtools/page/DEVTOOLS_1"
      },
      {
        id: "OTHER_CEP_1",
        title: "Adobe Core Extension",
        type: "page",
        url: "file:///C:/Program%20Files/Adobe/CEP/extensions/com.adobe.ccx.start/index.html",
        webSocketDebuggerUrl: "ws://127.0.0.1:8870/devtools/page/OTHER_CEP_1"
      },
      {
        id: "BLANK_1",
        title: "",
        type: "page",
        url: "about:blank",
        webSocketDebuggerUrl: "ws://127.0.0.1:8870/devtools/page/BLANK_1"
      },
      createMockPage({ id: "WORKER_1", type: "worker" }),
      validAeAgentPage
    ];

    const selected = selectCepPanelTarget(otherPages, { port: 8870 });
    assert.strictEqual(selected, validAeAgentPage, "Must select the unique valid AE Agent page");
    reports.push({ test: "realshape_unique_target", passed: true });
  }

  // 2. Missing targets (empty array, null, undefined)
  {
    assert.throws(
      () => selectCepPanelTarget([], { port: 8870 }),
      /No DevTools pages found on port 8870/,
      "Must fail closed on empty pages array"
    );
    assert.throws(
      () => selectCepPanelTarget(null, { port: 8870 }),
      /No DevTools pages found on port 8870/,
      "Must fail closed on null pages"
    );
    reports.push({ test: "missing_targets_rejected", passed: true });
  }

  // 3. Foreign targets only (no AE Agent extension page)
  {
    const foreignPages = [
      {
        id: "FOREIGN_1",
        title: "Other CEP Extension",
        type: "page",
        url: "file:///C:/Program%20Files/Adobe/CEP/extensions/com.other.extension/index.html",
        webSocketDebuggerUrl: "ws://127.0.0.1:8870/devtools/page/FOREIGN_1"
      },
      {
        id: "FOREIGN_2",
        title: "DevTools frontend",
        type: "page",
        url: "chrome-devtools://devtools/bundled/inspector.html",
        webSocketDebuggerUrl: "ws://127.0.0.1:8870/devtools/page/FOREIGN_2"
      }
    ];

    assert.throws(
      () => selectCepPanelTarget(foreignPages, { port: 8870 }),
      /AE Agent extension page \(com\.codex\.aemcpbridge\) not found on port 8870\. Found 2 non-matching page\(s\)/,
      "Must reject when only foreign pages are present without falling back to pages[0]"
    );
    reports.push({ test: "foreign_pages_rejected", passed: true });
  }

  // 4. Ambiguous targets (multiple matching AE Agent pages)
  {
    const ambiguousPages = [
      createMockPage({ id: "P1", webSocketDebuggerUrl: "ws://127.0.0.1:8870/devtools/page/P1" }),
      createMockPage({ id: "P2", webSocketDebuggerUrl: "ws://127.0.0.1:8870/devtools/page/P2" })
    ];

    assert.throws(
      () => selectCepPanelTarget(ambiguousPages, { port: 8870 }),
      /Multiple matching AE Agent extension pages \(2\) found for com\.codex\.aemcpbridge on port 8870; target is ambiguous/,
      "Must fail closed on ambiguous multiple matches"
    );
    reports.push({ test: "ambiguous_targets_rejected", passed: true });
  }

  // 5. Malformed or missing WebSocket debugger URL
  {
    const missingWsPage = createMockPage();
    delete missingWsPage.webSocketDebuggerUrl;
    assert.throws(
      () => selectCepPanelTarget([missingWsPage], { port: 8870 }),
      /webSocketDebuggerUrl is missing or invalid: undefined/,
      "Must reject page with undefined webSocketDebuggerUrl"
    );

    const emptyWsPage = createMockPage({ webSocketDebuggerUrl: "" });
    assert.throws(
      () => selectCepPanelTarget([emptyWsPage], { port: 8870 }),
      /webSocketDebuggerUrl is missing or invalid: ""/,
      "Must reject page with empty webSocketDebuggerUrl"
    );

    const httpWsPage = createMockPage({ webSocketDebuggerUrl: "http://127.0.0.1:8870/devtools/page/1" });
    assert.throws(
      () => selectCepPanelTarget([httpWsPage], { port: 8870 }),
      /webSocketDebuggerUrl is missing or invalid: "http:\/\/127\.0\.0\.1:8870\/devtools\/page\/1"/,
      "Must reject page with non-ws webSocketDebuggerUrl"
    );

    const malformedWsPage = createMockPage({ webSocketDebuggerUrl: "not_a_valid_url" });
    assert.throws(
      () => selectCepPanelTarget([malformedWsPage], { port: 8870 }),
      /webSocketDebuggerUrl is missing or invalid: "not_a_valid_url"/,
      "Must reject page with malformed webSocketDebuggerUrl"
    );

    reports.push({ test: "malformed_ws_rejected", passed: true });
  }

  // 6. Spoof defense: title spoof (same title, foreign URL)
  {
    const titleSpoofPage = {
      id: "SPOOF_TITLE",
      title: "AE Agent 3.3.1",
      type: "page",
      url: "file:///C:/Program%20Files/Adobe/CEP/extensions/com.malicious.impostor/index.html",
      webSocketDebuggerUrl: "ws://127.0.0.1:8870/devtools/page/SPOOF_TITLE"
    };

    assert.throws(
      () => selectCepPanelTarget([titleSpoofPage], { port: 8870 }),
      /AE Agent extension page \(com\.codex\.aemcpbridge\) not found/,
      "Must not match target based on title spoof"
    );
    reports.push({ test: "title_spoof_rejected", passed: true });
  }

  // 7. Spoof defense: prefix / suffix extension ID spoof
  {
    const prefixSpoofPage = createMockPage({
      url: "file:///C:/Users/Ant/AppData/Roaming/Adobe/CEP/extensions/com.codex.aemcpbridge.suffix/index.html"
    });
    assert.throws(
      () => selectCepPanelTarget([prefixSpoofPage], { port: 8870 }),
      /not found on port/,
      "Must reject extension ID suffix extension"
    );

    const leadingPrefixPage = createMockPage({
      url: "file:///C:/Users/Ant/AppData/Roaming/Adobe/CEP/extensions/fake_com.codex.aemcpbridge/index.html"
    });
    assert.throws(
      () => selectCepPanelTarget([leadingPrefixPage], { port: 8870 }),
      /not found on port/,
      "Must reject extension ID leading prefix"
    );

    reports.push({ test: "prefix_spoof_rejected", passed: true });
  }

  // 8. Spoof defense: query parameter & hash spoof
  {
    const querySpoofPage = createMockPage({
      url: "file:///C:/Program%20Files/Adobe/CEP/extensions/other/index.html?ext=com.codex.aemcpbridge"
    });
    assert.throws(
      () => selectCepPanelTarget([querySpoofPage], { port: 8870 }),
      /not found on port/,
      "Must reject query parameter substring spoof"
    );

    const hashSpoofPage = createMockPage({
      url: "file:///C:/Program%20Files/Adobe/CEP/extensions/other/index.html#com.codex.aemcpbridge"
    });
    assert.throws(
      () => selectCepPanelTarget([hashSpoofPage], { port: 8870 }),
      /not found on port/,
      "Must reject hash substring spoof"
    );

    reports.push({ test: "query_and_hash_spoof_rejected", passed: true });
  }

  // 9. Protocol defense: non-file URL
  {
    const httpPage = createMockPage({
      url: "http://127.0.0.1:8870/com.codex.aemcpbridge/index.html"
    });
    assert.throws(
      () => selectCepPanelTarget([httpPage], { port: 8870 }),
      /not found on port/,
      "Must reject non-file protocol even if path contains extension ID"
    );
    reports.push({ test: "non_file_protocol_rejected", passed: true });
  }

  // 10. Only a page at the extension root directly below the first CEP/extensions namespace matches.
  {
    const nestedId = createMockPage({
      url: "file:///C:/Program%20Files/Adobe/CEP/extensions/com.other.extension/assets/com.codex.aemcpbridge/index.html"
    });
    const nestedNamespace = createMockPage({
      url: "file:///C:/Program%20Files/Adobe/CEP/extensions/com.other.extension/assets/CEP/extensions/com.codex.aemcpbridge/index.html"
    });
    assert.strictEqual(isCepExtensionUrl(nestedId.url), false);
    assert.strictEqual(isCepExtensionUrl(nestedNamespace.url), false);
    assert.throws(
      () => selectCepPanelTarget([nestedId], { port: 8870 }),
      /not found on port/,
      "Must reject extension ID nested below a foreign extension root"
    );
    assert.throws(
      () => selectCepPanelTarget([nestedNamespace], { port: 8870 }),
      /not found on port/,
      "Must use the first CEP/extensions namespace only"
    );

    const malformedPercent = createMockPage({
      url: "file:///C:/Program%20Files/Adobe/CEP/extensions/com.other.extension/assets/%ZZ/index.html"
    });
    assert.strictEqual(isCepExtensionUrl(malformedPercent.url), false);
    const expectedPage = createMockPage();
    assert.strictEqual(selectCepPanelTarget([malformedPercent, expectedPage], { port: 8870 }), expectedPage);

    const workerOnly = createMockPage({ type: "service_worker" });
    assert.throws(
      () => selectCepPanelTarget([workerOnly], { port: 8870 }),
      /not found on port/,
      "Must reject service workers even when their URL names the extension"
    );
    assert.strictEqual(selectCepPanelTarget([workerOnly, expectedPage], { port: 8870 }), expectedPage);

    const customExtensionPage = createMockPage({
      url: "file:///C:/Program%20Files/Adobe/CEP/extensions/org.example.panel/index.html"
    });
    assert.strictEqual(isCepExtensionUrl(customExtensionPage.url, "org.example.panel"), true);
    reports.push({ test: "first_extension_root_and_page_type_enforced", passed: true });
  }

  // 11. URL parsing helpers validation
  {
    assert.strictEqual(isCepExtensionUrl("file:///a/b/CEP/extensions/com.codex.aemcpbridge/index.html"), true);
    assert.strictEqual(isCepExtensionUrl("file:///a/b/CEP/extensions/com.codex.aemcpbridge"), true);
    assert.strictEqual(isCepExtensionUrl("file:///a/b/CEP/extensions/com.codex.aemcpbridge/"), true);
    assert.strictEqual(isCepExtensionUrl("file:///C:/Adobe/CEP/extensions/com.codex.aemcpbridge/client/index.html?theme=dark"), true);
    assert.strictEqual(isCepExtensionUrl("file:///a/b/com.codex.aemcpbridge-extra/index.html"), false);
    assert.strictEqual(isCepExtensionUrl("file:///a/b/com.codex.aemcpbridge.evil/index.html"), false);
    assert.strictEqual(isCepExtensionUrl("file:///a/b/com.codex.aemcpbridge/index.html"), false);
    assert.strictEqual(isCepExtensionUrl("http://localhost/com.codex.aemcpbridge/index.html"), false);
    assert.strictEqual(isCepExtensionUrl(""), false);
    assert.strictEqual(isCepExtensionUrl(null), false);

    assert.strictEqual(isUsableWebSocketUrl("ws://127.0.0.1:8870/devtools/page/1"), true);
    assert.strictEqual(isUsableWebSocketUrl("wss://localhost:8870/devtools/page/1"), true);
    assert.strictEqual(isUsableWebSocketUrl("ws://localhost:8870/devtools/page/1#fragment"), false);
    assert.strictEqual(isUsableWebSocketUrl("ws://user:pass@localhost:8870/devtools/page/1"), false);
    assert.strictEqual(isUsableWebSocketUrl("http://127.0.0.1:8870/devtools/page/1"), false);
    assert.strictEqual(isUsableWebSocketUrl(""), false);
    assert.strictEqual(isUsableWebSocketUrl(null), false);
    assert.strictEqual(isUsableWebSocketUrl("not_a_url"), false);

    reports.push({ test: "pure_helpers_verified", passed: true });
  }

  return reports;
}

/**
 * Integration test proving that connectToPanel uses selectCepPanelTarget BEFORE
 * attempting any WebSocket connection or CDP side effects.
 */
async function runIntegrationTests() {
  const reports = [];

  let serverResponsePages = [];
  const server = http.createServer((req, res) => {
    if (req.url === "/json/list" || req.url === "/json") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(serverResponsePages));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const port = await new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });

  try {
    // Integration 1: Foreign pages only -> fails in selector before socket creation
    serverResponsePages = [
      {
        id: "FOREIGN_1",
        title: "Foreign panel",
        type: "page",
        url: "file:///C:/Program%20Files/Adobe/CEP/extensions/com.other/index.html",
        webSocketDebuggerUrl: "ws://127.0.0.1:9999/devtools/page/fake"
      }
    ];

    let error1 = null;
    try {
      await connectToPanel({ port });
    } catch (err) {
      error1 = err;
    }
    assert(error1, "connectToPanel must reject when only foreign pages are returned");
    assert(
      error1.message.includes("not found on port"),
      `Expected selector not-found error, got: ${error1.message}`
    );
    reports.push({ test: "integration_connectToPanel_rejects_foreign_before_socket", passed: true });

    // Integration 2: Ambiguous pages -> fails in selector before socket creation
    serverResponsePages = [
      createMockPage({ id: "P1", webSocketDebuggerUrl: "ws://127.0.0.1:9999/p1" }),
      createMockPage({ id: "P2", webSocketDebuggerUrl: "ws://127.0.0.1:9999/p2" })
    ];

    let error2 = null;
    try {
      await connectToPanel({ port });
    } catch (err) {
      error2 = err;
    }
    assert(error2, "connectToPanel must reject when ambiguous pages are returned");
    assert(
      error2.message.includes("Multiple matching AE Agent extension pages"),
      `Expected ambiguous selector error, got: ${error2.message}`
    );
    reports.push({ test: "integration_connectToPanel_rejects_ambiguous_before_socket", passed: true });

    // Integration 3: Missing/malformed webSocketDebuggerUrl -> fails before socket creation
    serverResponsePages = [
      createMockPage({ webSocketDebuggerUrl: "http://invalid-scheme/devtools" })
    ];

    let error3 = null;
    try {
      await connectToPanel({ port });
    } catch (err) {
      error3 = err;
    }
    assert(error3, "connectToPanel must reject when webSocketDebuggerUrl is invalid");
    assert(
      error3.message.includes("webSocketDebuggerUrl is missing or invalid"),
      `Expected invalid ws error, got: ${error3.message}`
    );
    reports.push({ test: "integration_connectToPanel_rejects_malformed_ws_before_socket", passed: true });

    // Integration 4: Empty target list -> fails before socket creation
    serverResponsePages = [];
    let error4 = null;
    try {
      await connectToPanel({ port });
    } catch (err) {
      error4 = err;
    }
    assert(error4, "connectToPanel must reject when page list is empty");
    assert(
      error4.message.includes("No DevTools pages found on port"),
      `Expected no pages error, got: ${error4.message}`
    );
    reports.push({ test: "integration_connectToPanel_rejects_empty_before_socket", passed: true });

  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  return reports;
}

/**
 * Defect reproduction comparison:
 * Shows how legacy selector permitted silent fallback to pages[0] or accepted spoofed URLs,
 * while selectCepPanelTarget reliably rejects all invalid targets.
 */
function verifyDefectReproduction() {
  const legacySelect = (pages, extensionId) => {
    return pages.find((item) => item.url && item.url.indexOf(extensionId) >= 0) || pages[0];
  };

  const extensionId = DEFAULT_EXTENSION_ID;

  // Case A: Missing AE agent page -> legacy selects pages[0] (SILENT FALLBACK BUG!)
  const foreignOnly = [{ id: "foreign", url: "file:///other/index.html", title: "Unrelated Panel" }];
  const legacyPicked = legacySelect(foreignOnly, extensionId);
  assert.strictEqual(legacyPicked.id, "foreign", "Legacy bug: silently fell back to foreign pages[0]");

  assert.throws(
    () => selectCepPanelTarget(foreignOnly, { extensionId, port: 8870 }),
    /not found on port/,
    "Fixed selector: strictly rejects foreign pages without silent fallback"
  );

  // Case B: Prefix spoof -> legacy accepted prefix spoof
  const prefixSpoof = [{ id: "spoof", url: `file:///extensions/${extensionId}.malicious/index.html` }];
  const legacySpoofPicked = legacySelect(prefixSpoof, extensionId);
  assert.strictEqual(legacySpoofPicked.id, "spoof", "Legacy bug: accepted prefix substring match");

  assert.throws(
    () => selectCepPanelTarget(prefixSpoof, { extensionId, port: 8870 }),
    /not found on port/,
    "Fixed selector: strictly rejects prefix spoof"
  );

  return { defectReproductionProven: true };
}

async function main() {
  const unitResults = await runUnitTests();
  const integrationResults = await runIntegrationTests();
  const defectProof = verifyDefectReproduction();

  const totalPassed = unitResults.length + integrationResults.length + (defectProof.defectReproductionProven ? 1 : 0);

  const report = {
    ok: true,
    suite: "cep-panel-target-smoke",
    totalPassed,
    unitTests: unitResults,
    integrationTests: integrationResults,
    defectProof,
    verifications: {
      silentFallbackRemoved: true,
      exactPathBoundaryEnforced: true,
      titleSpoofDefense: true,
      prefixSpoofDefense: true,
      querySpoofDefense: true,
      malformedWebSocketDefense: true,
      ambiguousTargetsDefense: true,
      socketSideEffectsBlockedBeforeConnection: true
    }
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message || String(error) }, null, 2));
  process.exit(1);
});
