"use strict";

const os = require("os");
const path = require("path");
const fs = require("fs");
const { summarizeTask } = require("./codex-task-ledger");
const { createCodeburnUsageAdapter } = require("../mcp-server/codeburn-usage-adapter");
const { codexQuota } = require("../mcp-server/subscription-usage");
const { estimateTaskPercent } = require("../mcp-server/task-subscription-estimate");

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("npm.cmd run report:task-usage -- --thread current [--thread UUID ...] [--checkpoint NAME] [--calibration FILE] [--json]\nДочерние чаты укажите явно. --checkpoint сохраняет локальный парный ledger/quota снимок; --calibration применяет проверенные интервалы. Модель не вызывается.");
    return;
  }
  const ids = [];
  let json = false;
  let calibrationFile = null;
  let checkpoint = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--json") { json = true; continue; }
    if (args[i] === "--checkpoint") {
      checkpoint = args[++i];
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(checkpoint || "")) throw new Error("Имя отметки: 1–64 латинских буквы, цифры, _ или -.");
      continue;
    }
    if (args[i] === "--calibration") { calibrationFile = args[++i]; if (!calibrationFile) throw new Error("Нужен путь к файлу калибровки."); continue; }
    if (args[i] !== "--thread") throw new Error("Неизвестный аргумент. Используйте --help.");
    const id = args[++i];
    ids.push(id === "current" ? process.env.CODEX_THREAD_ID : id);
  }
  const result = await summarizeTask(path.join(os.homedir(), ".codex", "sessions"), ids);
  const ledgerObservedAt = new Date().toISOString();
  if (calibrationFile || checkpoint) {
    const calibration = calibrationFile ? JSON.parse(fs.readFileSync(calibrationFile, "utf8")) : null;
    const snapshot = await createCodeburnUsageAdapter().refreshQuota();
    const windows = codexQuota(snapshot);
    result.accountQuota = { status: windows.length ? snapshot.status : "unavailable", windows, warning: snapshot.warning || null };
    if (calibration) {
      const matching = windows.filter((row) => row.label === calibration.windowLabel);
      const estimate = estimateTaskPercent(result, calibration, matching.length === 1 ? matching[0] : null);
      result.taskEstimatePercent = estimate.percent;
      result.estimateStatus = estimate.reason;
      result.estimate = estimate;
    }
    if (checkpoint) {
      const directory = path.join(__dirname, "..", ".codex-runtime", "subscription-usage", "task-checkpoints");
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, `${checkpoint}.json`), JSON.stringify({
        schema: "codex-task-quota-checkpoint.v1", ledgerObservedAt, ledger: result, quota: result.accountQuota
      }, null, 2) + "\n", { flag: "wx" });
      result.checkpoint = checkpoint;
    }
  }
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Ответов модели: ${result.responses}; input ${result.totals.inputTokens} (cache ${result.totals.cachedInputTokens}), output ${result.totals.outputTokens}.`);
    if (result.accountQuota?.windows?.length) for (const window of result.accountQuota.windows) console.log(`Факт аккаунта · ${window.label}: ${window.usedPercent}% использовано.`);
    console.log(result.taskEstimatePercent === null
      ? `Оценка задачи в % подписки: неизвестна (${result.estimateStatus}).`
      : `Оценка задачи: ${result.taskEstimatePercent}% (диапазон ${result.estimate.range.join("–")}%, интервалов ${result.estimate.eligibleIntervals}).`);
    if (!result.accountQuota) console.log("Фактический процент аккаунта: npm.cmd run report:quota.");
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
