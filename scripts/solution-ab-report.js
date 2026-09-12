"use strict";

const fs = require("fs");

const AB_REPORT_SCHEMA_VERSION = "solution-ab-report.v1";
const VARIANTS = new Set(["raw", "typed", "reuse"]);
const SETTINGS_FIELDS = ["model", "effort", "aeVersion", "baselineId", "language"];
const TRIAL_FIELDS = [
  "caseId",
  "variant",
  "repetition",
  "model",
  "effort",
  "aeVersion",
  "baselineId",
  "language",
  "success",
  "verified",
  "durationMs",
  "usage"
];
const USAGE_FIELDS = ["inputTokens", "outputTokens", "cachedInputTokens"];

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new TypeError(message);
  }
}

function assertNonEmptyString(value, field) {
  assertCondition(typeof value === "string" && value.trim().length > 0,
    `${field} must be a non-empty string.`);
}

function assertNonNegativeNumber(value, field) {
  assertCondition(typeof value === "number" && Number.isFinite(value) && value >= 0,
    `${field} must be a finite non-negative number.`);
}

function assertExactKeys(value, allowed, field) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    assertCondition(allowedSet.has(key), `${field} contains unknown field: ${key}.`);
  }
}

function validateUsage(usage, trialIndex) {
  const field = `trials[${trialIndex}].usage`;
  if (usage === null) {
    return;
  }
  assertCondition(isPlainObject(usage), `${field} must be null or an object.`);
  assertExactKeys(usage, USAGE_FIELDS, field);
  for (const usageField of USAGE_FIELDS) {
    const value = usage[usageField];
    if (value !== null) {
      assertNonNegativeNumber(value, `${field}.${usageField}`);
    }
  }
}

function validateTrial(trial, trialIndex) {
  const field = `trials[${trialIndex}]`;
  assertCondition(isPlainObject(trial), `${field} must be an object.`);
  assertExactKeys(trial, TRIAL_FIELDS, field);
  for (const setting of ["caseId", ...SETTINGS_FIELDS]) {
    assertNonEmptyString(trial[setting], `${field}.${setting}`);
  }
  assertCondition(VARIANTS.has(trial.variant), `${field}.variant must be raw, typed, or reuse.`);
  assertCondition(Number.isInteger(trial.repetition) && trial.repetition > 0,
    `${field}.repetition must be a positive integer.`);
  assertCondition(typeof trial.success === "boolean", `${field}.success must be boolean.`);
  assertCondition(typeof trial.verified === "boolean", `${field}.verified must be boolean.`);
  assertNonNegativeNumber(trial.durationMs, `${field}.durationMs`);
  validateUsage(trial.usage, trialIndex);
}

function validateTrials(trials) {
  assertCondition(Array.isArray(trials), "Input must be a JSON array of completed trials.");
  const duplicateKeys = new Set();
  trials.forEach((trial, index) => {
    validateTrial(trial, index);
    const duplicateKey = JSON.stringify({
      settings: SETTINGS_FIELDS.reduce((settings, field) => {
        settings[field] = trial[field];
        return settings;
      }, {}),
      variant: trial.variant,
      caseId: trial.caseId,
      repetition: trial.repetition
    });
    assertCondition(!duplicateKeys.has(duplicateKey),
      `Duplicate trial for settings, variant, caseId, and repetition at trials[${index}].`);
    duplicateKeys.add(duplicateKey);
  });
}

function groupKeyFor(trial) {
  return JSON.stringify({
    model: trial.model,
    effort: trial.effort,
    aeVersion: trial.aeVersion,
    baselineId: trial.baselineId,
    language: trial.language,
    variant: trial.variant
  });
}

function configurationKeyFor(trial) {
  return JSON.stringify(SETTINGS_FIELDS.reduce((settings, field) => {
    settings[field] = trial[field];
    return settings;
  }, {}));
}

function trialSetFor(group) {
  return new Set(group.trials.map((trial) => `${trial.caseId}\u0000${trial.repetition}`));
}

function hasMatchingTrialSets(groups) {
  if (groups.length < 2) {
    return false;
  }
  const reference = trialSetFor(groups[0]);
  return groups.every((group) => {
    const current = trialSetFor(group);
    return current.size === reference.size && [...reference].every((key) => current.has(key));
  });
}

function observedTokenTotal(trials, field) {
  let total = 0;
  let observed = false;
  for (const trial of trials) {
    if (trial.usage !== null && trial.usage[field] !== null) {
      total += trial.usage[field];
      observed = true;
    }
  }
  return observed ? total : null;
}

function usageIsComplete(trials) {
  return trials.every((trial) => trial.usage !== null && USAGE_FIELDS.every((field) => trial.usage[field] !== null));
}

function buildGroup(settings, variant, trials, matchedTrialSets) {
  const successfulVerified = trials.filter((trial) => trial.success && trial.verified).length;
  const observedInputTokens = observedTokenTotal(trials, "inputTokens");
  const observedOutputTokens = observedTokenTotal(trials, "outputTokens");
  const observedCachedInputTokens = observedTokenTotal(trials, "cachedInputTokens");
  const unknownUsageTrials = trials.filter((trial) => (
    trial.usage === null || USAGE_FIELDS.some((field) => trial.usage[field] === null)
  )).length;
  const costPerSuccessfulTask = successfulVerified > 0 && usageIsComplete(trials)
    ? {
        inputTokens: observedInputTokens / successfulVerified,
        outputTokens: observedOutputTokens / successfulVerified,
        cachedInputTokens: observedCachedInputTokens / successfulVerified
      }
    : null;

  return {
    settings,
    variant,
    matchedTrialSets,
    trials: trials.length,
    successfulVerified,
    successRate: trials.length === 0 ? null : successfulVerified / trials.length,
    totalDurationMs: trials.reduce((total, trial) => total + trial.durationMs, 0),
    observedInputTokens,
    observedOutputTokens,
    observedCachedInputTokens,
    unknownUsageTrials,
    costPerSuccessfulTask
  };
}

function summarizeTrials(trials) {
  validateTrials(trials);
  const grouped = new Map();
  for (const trial of trials) {
    const key = groupKeyFor(trial);
    if (!grouped.has(key)) {
      grouped.set(key, {
        settings: SETTINGS_FIELDS.reduce((settings, field) => {
          settings[field] = trial[field];
          return settings;
        }, {}),
        variant: trial.variant,
        trials: []
      });
    }
    grouped.get(key).trials.push(trial);
  }

  const configurations = new Map();
  for (const group of grouped.values()) {
    const configurationKey = configurationKeyFor({ ...group.settings, variant: group.variant });
    if (!configurations.has(configurationKey)) configurations.set(configurationKey, []);
    configurations.get(configurationKey).push(group);
  }
  const matchedByConfiguration = new Map();
  for (const [configurationKey, groups] of configurations) {
    matchedByConfiguration.set(configurationKey, hasMatchingTrialSets(groups));
  }

  const groups = [...grouped.values()]
    .sort((left, right) => groupKeyFor({ ...left.settings, variant: left.variant }).localeCompare(
      groupKeyFor({ ...right.settings, variant: right.variant })
    ))
    .map((group) => {
      const configurationKey = configurationKeyFor({ ...group.settings, variant: group.variant });
      return buildGroup(group.settings, group.variant, group.trials, matchedByConfiguration.get(configurationKey));
    });

  return {
    schemaVersion: AB_REPORT_SCHEMA_VERSION,
    descriptionRu: "Offline A/B отчёт по завершённым задачам; метрики сгруппированы по настройкам и варианту.",
    limitationsRu: "Отчёт показывает наблюдаемые токены и время, не складывает input и output в стоимость и не заявляет процент экономии.",
    groups
  };
}

function printUsage() {
  console.error("Использование: node scripts/solution-ab-report.js <JSON-файл>");
  console.error("Файл должен содержать JSON-массив завершённых trials одной задачи, включая retries и planner-вызовы.");
}

function main(argv) {
  const args = argv || process.argv.slice(2);
  if (args.length !== 1 || args[0] === "--help" || args[0] === "-h") {
    printUsage();
    if (args.length !== 1 || args[0] !== "--help" && args[0] !== "-h") process.exitCode = 1;
    return;
  }
  let trials;
  try {
    trials = JSON.parse(fs.readFileSync(args[0], "utf8"));
  } catch (error) {
    throw new Error(`Не удалось прочитать JSON-файл: ${error.message}`);
  }
  console.log(JSON.stringify(summarizeTrials(trials), null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  AB_REPORT_SCHEMA_VERSION,
  summarizeTrials,
  validateTrials,
  validateTrial
};
