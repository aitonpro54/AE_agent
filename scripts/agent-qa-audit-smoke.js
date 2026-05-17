"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  AUDIT_SCHEMA_VERSION,
  buildAgentQaAuditReport,
  collectAuditPrefixes,
  normalizePrefixes
} = require("./agent-qa-audit");

function withTempReportDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ae-agent-audit-"));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function smoke() {
  assert.deepStrictEqual(
    normalizePrefixes("Codex QA 1.2, Codex QA 1.2,  x ", ["fallback"]),
    ["Codex QA 1.2"]
  );

  withTempReportDir((reportDir) => {
    fs.writeFileSync(path.join(reportDir, "report.json"), JSON.stringify({
      run: { runPrefix: "Codex QA 1.2 12345678" },
      cleanup: {
        scenarios: [
          { cleanupPrefix: "Codex QA 1.2 12345678 Render" }
        ]
      }
    }), "utf8");

    const prefixes = collectAuditPrefixes({
      prefixes: "Codex Test Safe Run",
      reportDir,
      includeReportPrefixes: true
    });
    assert(prefixes.includes("Codex Test Safe Run"));
    assert(prefixes.includes("Codex QA 1.2 12345678"));
    assert(prefixes.includes("Codex QA 1.2 12345678 Render"));
  });

  const audit = buildAgentQaAuditReport({
    generatedAt: "2026-05-15T00:00:00.000Z",
    bridgeUrl: "http://127.0.0.1:3456",
    prefixes: ["Codex QA 1.2", "Codex Test Safe Run"],
    health: { ok: true, version: "1.0.1", panelConnected: true },
    projectInfo: { numItems: 12, activeItemName: "Main" },
    projectSearchResults: [
      {
        prefix: "Codex QA 1.2",
        result: {
          matches: [
            { itemIndex: 7, name: "Codex QA 1.2 12345678 Render", type: "comp", typeName: "Composition" },
            { itemIndex: 8, name: "User asset mentioning Codex QA 1.2", type: "footage", typeName: "Footage" }
          ]
        }
      },
      {
        prefix: "Codex Test Safe Run",
        result: { matches: [] }
      }
    ],
    renderQueue: {
      totalItems: 2,
      returned: 2,
      items: [
        {
          index: 1,
          status: 1,
          comp: { itemIndex: 7, name: "Codex QA 1.2 12345678 Render" },
          outputModules: [{ index: 1, file: "logs/Codex-QA-1.2-12345678-Render.mov" }]
        },
        {
          index: 2,
          status: 1,
          comp: { itemIndex: 3, name: "Client Render" },
          outputModules: [{ index: 1, file: "logs/client-render.mov" }]
        }
      ]
    },
    checkpoints: {
      backupDir: "backups",
      checkpoints: [
        {
          filename: "project-checkpoint-session-ai-plan-abcd1234-2026-05-15T00-00-00-000Z.aep",
          label: "session-ai-plan-abcd1234",
          checkpointFile: "backups/project-checkpoint-session-ai-plan-abcd1234-2026-05-15T00-00-00-000Z.aep",
          bytes: 10,
          createdAt: "2026-05-15T00:00:00.000Z"
        },
        {
          filename: "manual-checkpoint-review-2026-05-15T00-00-00-000Z.aep",
          label: "review",
          checkpointFile: "backups/manual-checkpoint-review-2026-05-15T00-00-00-000Z.aep",
          bytes: 10,
          createdAt: "2026-05-15T00:00:00.000Z"
        }
      ]
    },
    editSessions: {
      active: false,
      sessionsLogFile: "logs/edit-sessions.jsonl",
      sessions: [
        {
          id: "s1",
          label: "ai-plan-abcd1234",
          status: "finished",
          operationCount: 2,
          latestOperation: {
            tool: "create_test_comp",
            ok: true,
            target: { request: { name: "Codex QA 1.2 12345678 Render" } }
          }
        },
        {
          id: "s2",
          label: "manual",
          status: "finished",
          operationCount: 1
        }
      ]
    }
  });

  assert.strictEqual(audit.schemaVersion, AUDIT_SCHEMA_VERSION);
  assert.strictEqual(audit.readOnly, true);
  assert.strictEqual(audit.projectItems.leftoverCount, 1);
  assert.strictEqual(audit.renderQueue.leftoverCount, 1);
  assert.strictEqual(audit.checkpoints.matchedCount, 1);
  assert.strictEqual(audit.editSessions.matchedCount, 1);
  assert.strictEqual(audit.summary.needsReview, true);
  assert.deepStrictEqual(audit.projectItems.byPrefix[0].matches.map((item) => item.name), [
    "Codex QA 1.2 12345678 Render"
  ]);

  const cleanAudit = buildAgentQaAuditReport({
    prefixes: ["Codex QA 1.2"],
    projectSearchResults: [{ prefix: "Codex QA 1.2", result: { matches: [] } }],
    renderQueue: { totalItems: 0, returned: 0, items: [] },
    checkpoints: { checkpoints: [] },
    editSessions: { active: false, sessions: [] }
  });
  assert.strictEqual(cleanAudit.summary.needsReview, false);

  console.log(JSON.stringify({
    ok: true,
    schemaVersion: audit.schemaVersion,
    projectItemLeftovers: audit.summary.projectItemLeftovers,
    renderQueueLeftovers: audit.summary.renderQueueLeftovers,
    checkpointRecords: audit.summary.checkpointRecords,
    editSessionRecords: audit.summary.editSessionRecords
  }, null, 2));
}

smoke();
