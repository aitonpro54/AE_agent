#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { searchSolutions, getSolution, knownSolution, reviewedIds } = require("../mcp-server/solution-discovery");
const { BUILD_MONTAGE_PIPELINE_PLAN_TOOL, getMontagePipelineBuilderContract } = require("../mcp-server/montage-tools");

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (error) {
    console.error(`FAIL: ${name} - ${error.message}`);
    throw error;
  }
}

const mockTools = [
  BUILD_MONTAGE_PIPELINE_PLAN_TOOL,
  { name: "propose_ai_agent_plan", inputSchema: {} },
  { name: "run_ai_agent_plan", inputSchema: {} },
  { name: "build_placeholder_visual_review_plan", inputSchema: {} }
];

test("montage-pipeline-plan is present in reviewed IDs", () => {
  const ids = reviewedIds();
  assert.ok(ids.includes("montage-pipeline-plan"), "montage-pipeline-plan must be in reviewedIds");
});

test("searchSolutions surfaces montage-pipeline-plan for Russian and English queries", () => {
  const searchRu = searchSolutions({ query: "монтажный конвейер замена видео" }, mockTools);
  assert.ok(searchRu.results.some(h => h.id === "montage-pipeline-plan"), "Russian query must surface montage-pipeline-plan");

  const searchEn = searchSolutions({ query: "montage pipeline video replacement" }, mockTools);
  assert.ok(searchEn.results.some(h => h.id === "montage-pipeline-plan"), "English query must surface montage-pipeline-plan");
});

test("knownSolution resolves montage-pipeline-plan entry and checks available tools", () => {
  const entry = knownSolution("montage-pipeline-plan", mockTools);
  assert.equal(entry.id, "montage-pipeline-plan");
  assert.equal(entry.status, "recipe");
  assert.deepEqual(entry.execution.preferredTools, [
    "build_montage_pipeline_plan",
    "propose_ai_agent_plan",
    "run_ai_agent_plan",
    "build_placeholder_visual_review_plan"
  ]);
});

test("getSolution returns recipe text, tool contracts, and compilation_units planBuilder contract", () => {
  const res = getSolution({
    id: "montage-pipeline-plan",
    offset: 0,
    limit: 2000,
    toolNames: ["build_montage_pipeline_plan"]
  }, mockTools);

  assert.equal(res.ok, true);
  assert.equal(res.solution.id, "montage-pipeline-plan");
  assert.ok(res.recipe.text.includes("Montage Pipeline Plan"));
  assert.equal(res.toolContracts.length, 1);
  assert.equal(res.toolContracts[0].name, "build_montage_pipeline_plan");

  assert.ok(res.planBuilder, "planBuilder contract must be present at offset 0");
  assert.equal(res.planBuilder.solutionId, "montage-pipeline-plan");
  assert.equal(res.planBuilder.mode, "compilation_units");
  assert.equal(res.planBuilder.outputContract.unitsPerProposal, true);
  assert.equal(res.planBuilder.outputContract.previewOnly, true);
  assert.equal(res.planBuilder.outputContract.mutatesProject, false);
});

test("getSolution paginates recipe text and omits planBuilder when offset > 0", () => {
  const page1 = getSolution({ id: "montage-pipeline-plan", offset: 0, limit: 500 }, mockTools);
  assert.equal(page1.recipe.offset, 0);
  assert.equal(page1.recipe.truncated, true);
  assert.ok(page1.planBuilder !== undefined);

  const page2 = getSolution({ id: "montage-pipeline-plan", offset: 500, limit: 500 }, mockTools);
  assert.equal(page2.recipe.offset, 500);
  assert.equal(page2.planBuilder, undefined, "planBuilder must be omitted on subsequent pages");
});

test("builder contract matches public tool schema exactly", () => {
  const contract = getMontagePipelineBuilderContract();
  assert.deepEqual(contract.inputSchema, BUILD_MONTAGE_PIPELINE_PLAN_TOOL.inputSchema);
  assert.equal(contract.inputSchema.additionalProperties, false);
  assert.deepEqual(contract.inputSchema.required, ["manifest", "preparedMaterials"]);
});

console.log(`PASS: montage-library-smoke (${passed} tests passed)`);
