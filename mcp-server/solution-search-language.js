"use strict";

// This is a deliberately small vocabulary of AE actions and objects.  It
// translates concepts, rather than mapping complete requests to registry IDs,
// so newly reviewed recipes benefit without maintaining a query catalogue.
const ALIASES = Object.freeze({
  active: ["active", "активный", "активную", "активной", "активном"],
  add: ["add", "adds", "added", "adding", "place", "put", "insert", "добавь", "добавить", "поставь", "поставить"],
  blend: ["blend", "blending", "наложение", "наложения"],
  camera: ["camera", "cameras", "камера", "камеру", "камеры"],
  change: ["change", "changes", "changed", "changing", "update", "updates", "updated", "modify", "modifies", "move", "moves", "изменить", "измени", "поменяй", "перемести"],
  center: ["center", "centre", "centered", "align", "aligned", "выровняй", "выровнять", "центруй", "центрируй", "центрировать", "центре"],
  composition: ["composition", "compositions", "comp", "comps", "композиция", "композицию", "композиции", "компе", "комп"],
  controller: ["controller", "controllers", "control", "rig", "контроллер", "контроллером", "риг"],
  convert: ["convert", "converts", "converted", "conversion", "transform", "transforms", "преобразуй", "преобразовать", "конвертируй"],
  create: ["create", "creates", "created", "creating", "make", "makes", "made", "build", "built", "generate", "generated", "assemble", "собери", "собрать", "создай", "создать", "сделай", "сделать", "создание"],
  difference: ["difference", "разностный", "разность"],
  distribute: ["distribute", "distributes", "distributed", "distribution", "spread", "space", "распредели", "распределить", "разнести", "разложи", "разложить"],
  duration: ["duration", "length", "seconds", "second", "длительность", "секунда", "секунд", "секунды"],
  end: ["end", "ending", "конец", "конце"],
  evenly: ["evenly", "uniformly", "equal", "равномерно", "равными"],
  expression: ["expression", "expressions", "выражение", "выражением", "выражения"],
  keyframe: ["keyframe", "keyframes", "keys", "ключ", "ключи", "ключей", "ключами", "ключевые", "кадр", "кадры"],
  layer: ["layer", "layers", "слой", "слои", "слоев", "слоёв", "слоям", "слоя"],
  loop: ["loop", "loopout", "loopin", "зацикли", "зациклить", "цикл", "циклически"],
  marker: ["marker", "markers", "mark", "marks", "маркер", "маркеры", "маркеров"],
  number: ["number", "numbers", "numbered", "sequence", "numbering", "номер", "номера", "номерами", "нумерацией"],
  queue: ["queue", "renderqueue", "очередь", "очереди"],
  rename: ["rename", "renames", "renamed", "renaming", "переименуй", "переименовать", "назови"],
  render: ["render", "rendering", "рендер", "рендера", "рендеринга"],
  selected: ["selected", "selection", "chosen", "выбранный", "выбранные", "выбранных", "выделенный", "выделенные", "выделенных"],
  set: ["set", "sets", "setting", "apply", "applies", "установи", "установить", "задай", "примени"],
  shape: ["shape", "shapes", "shape-layer", "фигура", "фигуры", "фигур"],
  context: ["context", "show", "display", "summarize", "summary", "inspect", "list", "покажи", "показать", "суммируй", "проверь"],
  start: ["start", "beginning", "начало", "начале"],
  text: ["text", "текст", "текста", "текстовый"],
  work: ["work", "workarea", "work-area", "рабочая", "рабочей", "область", "области"],
  duplicate: ["duplicate", "duplicates", "duplicated", "duplicating", "copy", "copied", "copies", "clone", "cloned", "clones", "cloning", "дубликат", "дубликаты", "дублируй", "дублировать", "продублируй", "копируй", "скопируй"]
});

const READ_ONLY_PATTERNS = [
  /\bwithout\s+(?:changing|moving|mutating|modifying)\b/i,
  /\bdo\s+not\s+(?:change|move|mutate|modify)\b/i,
  /\bno\s+(?:selection\s+)?mutation\b/i,
  /\b(?:read[ -]?only|only\s+(?:show|inspect|summarize|list))\b/i,
  /\bwithout\b[^.!,;]{0,80}\b(?:changing|moving|mutating|modifying)\b/i,
  /(?:^|\s)без\s+(?:изменени(?:я|й)|правок)(?=$|\s|[.,!;])/i,
  /(?:^|\s)без\s+[^.!,;]{0,80}изменени(?:я|й)(?=$|\s|[.,!;])/i,
  /(?:^|\s)ничего\s+не\s+изменяй(?=$|\s|[.,!;])/i,
  /(?:^|\s)не\s+(?:изменяя|меняя|трогая)(?=$|\s|[.,!;])/i,
  /(?:^|\s)только\s+(?:покажи|показать|проверь|посмотри)(?=$|\s|[.,!;])/i
];

const READ_ONLY_CLAUSES = [
  /\bwithout\s+(?:changing|moving|mutating|modifying)[^.!,;]*/gi,
  /\bdo\s+not\s+(?:change|move|mutate|modify)[^.!,;]*/gi,
  /\bno\s+(?:selection\s+)?mutation\b/gi,
  /\b(?:read[ -]?only|only\s+(?:show|inspect|summarize|list))\b/gi,
  /\bwithout\b[^.!,;]{0,80}\b(?:changing|moving|mutating|modifying)\b/gi,
  /(?:^|\s)без\s+(?:изменени(?:я|й)|правок)[^.!,;]*/gi,
  /(?:^|\s)без\s+[^.!,;]{0,80}изменени(?:я|й)(?=$|\s|[.,!;])/gi,
  /(?:^|\s)ничего\s+не\s+изменяй(?=$|\s|[.,!;])/gi,
  /(?:^|\s)не\s+(?:изменяя|меняя|трогая)[^.!,;]*/gi,
  /(?:^|\s)только\s+(?:покажи|показать|проверь|посмотри)(?=$|\s|[.,!;])/gi
];

const MUTATING_ACTIONS = new Set([
  "add", "center", "change", "convert", "create", "distribute", "duplicate", "rename", "set"
]);

const aliasIndex = new Map();
for (const [canonical, aliases] of Object.entries(ALIASES)) {
  for (const alias of aliases) aliasIndex.set(alias.toLowerCase(), canonical);
}

function tokenize(value) {
  const text = Array.isArray(value) ? value.join(" ") : String(value || "");
  const matches = text.replace(/[_-]+/g, " ").toLowerCase().match(/[a-z0-9а-яё]+/gi);
  return matches ? matches.map((token) => token.toLowerCase()) : [];
}

function canonicalToken(token) {
  return aliasIndex.get(String(token || "").toLowerCase()) || String(token || "").toLowerCase();
}

function expandSearchTokens(value) {
  const tokens = new Set();
  for (const token of tokenize(value)) {
    tokens.add(token);
    tokens.add(canonicalToken(token));
  }
  return tokens;
}

function canonicalPhrase(value) {
  return tokenize(value).map(canonicalToken).join(" ");
}

function analyzeSearchIntent(value) {
  const text = String(value || "");
  const readOnlyRequested = READ_ONLY_PATTERNS.some((pattern) => pattern.test(text));
  let mutationText = text;
  for (const pattern of READ_ONLY_CLAUSES) mutationText = mutationText.replace(pattern, " ");
  const mutationRequested = Array.from(expandSearchTokens(mutationText)).some((token) => MUTATING_ACTIONS.has(token));
  return {
    tokens: expandSearchTokens(text),
    readOnlyRequested,
    mutationRequested,
    explicitlyMixedIntent: readOnlyRequested && mutationRequested
  };
}

function isExactTitleQuery(title, prompt) {
  const normalizedTitle = canonicalPhrase(title);
  const normalizedPrompt = canonicalPhrase(prompt);
  if (!normalizedTitle || !normalizedPrompt) return false;
  return normalizedTitle === normalizedPrompt || normalizedTitle.replace(/ typed plan$/, "") === normalizedPrompt;
}

module.exports = {
  analyzeSearchIntent,
  canonicalPhrase,
  expandSearchTokens,
  isExactTitleQuery
};
