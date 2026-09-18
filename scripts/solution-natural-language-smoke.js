"use strict";

const assert = require("assert");

const { buildSolutionHintsForPrompt } = require("../mcp-server/solution-library");
const registry = require("../registry/solutions.json");

const TOP_N = 3;

function retrievalFor(query) {
  return buildSolutionHintsForPrompt(query, { topN: TOP_N }).retrieval;
}

function surfacedIds(retrieval) {
  return [
    ...(retrieval.entries || []),
    ...(retrieval.toolMatches || [])
  ].map((entry) => entry.id);
}

function diagnostic(retrieval) {
  return JSON.stringify({
    entries: (retrieval.entries || []).map((entry) => ({ id: entry.id, score: entry.score, mutating: entry.mutating })),
    toolMatches: (retrieval.toolMatches || []).map((entry) => ({ id: entry.id, score: entry.score, mutating: entry.mutating })),
    omitted: retrieval.omitted
  });
}

function assertExpectedId(query, expectedId) {
  const retrieval = retrievalFor(query);
  assert.strictEqual(retrieval.ok, true, `retrieval failed for ${JSON.stringify(query)}: ${retrieval.error || "unknown error"}`);
  assert(
    surfacedIds(retrieval).includes(expectedId),
    `wrong retrieval for ${JSON.stringify(query)}; expected ${expectedId}; actual=${diagnostic(retrieval)}`
  );
}

function assertReadOnly(query) {
  const retrieval = retrievalFor(query);
  assert.strictEqual(retrieval.ok, true, `retrieval failed for ${JSON.stringify(query)}: ${retrieval.error || "unknown error"}`);
  const mutating = [
    ...(retrieval.entries || []),
    ...(retrieval.toolMatches || [])
  ].filter((entry) => entry.mutating === true).map((entry) => entry.id);
  assert.deepStrictEqual(
    mutating,
    [],
    `read-only query proposed mutating solutions for ${JSON.stringify(query)}: ${diagnostic(retrieval)}`
  );
}

function assertNoMatches(query) {
  const retrieval = retrievalFor(query);
  assert.strictEqual(retrieval.ok, true, `retrieval failed for ${JSON.stringify(query)}: ${retrieval.error || "unknown error"}`);
  assert.deepStrictEqual(
    surfacedIds(retrieval),
    [],
    `nonsense query unexpectedly matched reviewed solutions for ${JSON.stringify(query)}: ${diagnostic(retrieval)}`
  );
}

function run() {
  assert.strictEqual(registry.solutions.length, 181, "natural-language acceptance set expects all 181 registry solutions.");

  const pairs = [
    ["Создай композицию 1920 на 1080 длительностью 10 секунд", "Create a basic composition 1920 by 1080 with duration 10 seconds", "basic-comp-setup-typed-plan"],
    ["Дублируй выделенные слои", "Duplicate selected layers", "bulk-layer-duplicate-typed-tool"],
    ["Создай камеру с контроллером", "Create a camera with controller", "add-camera-with-controller-typed-plan"],
    ["Центрируй композицию", "Center composition", "center-composition-typed-plan"],
    ["Преобразуй текст в фигуры", "Create shapes from text", "create-shapes-from-text-typed-plan"],
    ["Зацикли анимацию выражением", "Add simple loop expression", "add-simple-loop-expression-typed-plan"],
    ["Равномерно распредели ключи по длительности слоя", "Distribute selected keyframes evenly across layer duration", "ar-distributekeyframestolayer-typed-plan"],
    ["Переименуй выделенные слои по номерам", "Rename selected layers with numbers", "rename-selected-layers-with-numbers-typed-plan"],
    ["Поставь маркеры в начале и конце рабочей области", "Add markers at work area start and end", "add-composition-markers-at-work-area-typed-plan"],
    ["Добавь выделенные композиции в очередь рендера", "Add selected compositions to render queue", "add-selected-compositions-to-render-queue-typed-plan"],
    ["Покажи активную композицию и выделенные слои без изменений", "Summarize active comp and selected layers without changing the project", "active-comp-context-review"],
    ["Установи разностный режим наложения", "Set difference blending mode", "difference-blend-mode-typed-plan"]
  ];

  for (const [ru, en, expectedId] of pairs) {
    assertExpectedId(ru, expectedId);
    assertExpectedId(en, expectedId);
  }

  const russianParaphrases = [
    ["Собери новую HD-композицию на десять секунд", "basic-comp-setup-typed-plan"],
    ["Сделай дубликаты всех выбранных слоёв", "bulk-layer-duplicate-typed-tool"],
    ["Привяжи камеру к контроллеру", "add-camera-with-controller-typed-plan"],
    ["Выровняй выбранный прекомп по центру композиции", "center-composition-typed-plan"],
    ["Преврати текстовый слой в слои фигур", "create-shapes-from-text-typed-plan"],
    ["Разложи выбранные ключевые кадры равномерно по времени слоя", "ar-distributekeyframestolayer-typed-plan"]
  ];
  for (const [query, expectedId] of russianParaphrases) assertExpectedId(query, expectedId);

  for (const solution of registry.solutions) {
    const retrieval = retrievalFor(solution.title);
    assert.strictEqual(retrieval.ok, true, `exact-title retrieval failed for ${solution.id}: ${retrieval.error || "unknown error"}`);
    assert(
      surfacedIds(retrieval).includes(solution.id),
      `exact title missed its own top-${TOP_N}: ${JSON.stringify(solution.title)}; expected=${solution.id}; actual=${diagnostic(retrieval)}`
    );
  }

  const readOnlyQueries = [
    "Summarize the active comp and selected layers without changing anything.",
    "Покажи активную композицию и выбранные слои, ничего не изменяй.",
    "Inspect the render queue without starting renders or changing the project.",
    "Проверь очередь рендера без запуска и изменений."
  ];
  for (const query of readOnlyQueries) assertReadOnly(query);

  assertNoMatches("qzxv blorpt nonsense 987654");
  assertNoMatches("абракадабра фывап чушь 987654");

  console.log(JSON.stringify({
    ok: true,
    bilingualPairs: pairs.length,
    russianParaphrases: russianParaphrases.length,
    exactTitleSelfHits: registry.solutions.length,
    readOnlyQueries: readOnlyQueries.length,
    noMatchQueries: 2
  }, null, 2));
}

run();
