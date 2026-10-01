"use strict";

const fs = require("fs");
const path = require("path");
const { createCodeburnUsageAdapter } = require("../mcp-server/codeburn-usage-adapter");
const { codexQuota, compareQuotaWindows } = require("../mcp-server/subscription-usage");
const stateDirectory = path.join(__dirname, "..", ".codex-runtime", "subscription-usage", "checkpoints");

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("npm.cmd run report:quota -- [--json] [--start NAME | --since NAME]\nСнимок лимита аккаунта Codex; --start сохраняет начало этапа, --since сравнивает показания. Модель не вызывается.");
    return;
  }
  let start = null;
  let since = null;
  let json = false;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--json") { json = true; continue; }
    if (args[i] !== "--start" && args[i] !== "--since") throw new Error("Неизвестный аргумент. Используйте --help.");
    const flag = args[i];
    const name = args[++i];
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(name || "")) throw new Error("Имя отметки: 1–64 латинских буквы, цифры, _ или -.");
    if (start || since) throw new Error("Выберите одну операцию: --start или --since.");
    if (flag === "--start") start = name;
    else since = name;
  }
  let before = null;
  const checkpointFile = start || since ? path.join(stateDirectory, `${start || since}.json`) : null;
  if (start || since) {
    if (start && fs.existsSync(checkpointFile)) throw new Error("Такая отметка уже есть. Используйте новое имя, чтобы сохранить прежнее начало этапа.");
    if (since) {
      if (!fs.existsSync(checkpointFile)) throw new Error("Отметка не найдена. Сначала выполните --start NAME.");
      before = JSON.parse(fs.readFileSync(checkpointFile, "utf8"));
      if (!Array.isArray(before)) throw new Error("Неверный файл отметки.");
    }
  }
  const snapshot = await createCodeburnUsageAdapter().refreshQuota();
  const windows = codexQuota(snapshot);
  const result = {
    status: windows.length ? snapshot.status : "unavailable",
    observedAt: snapshot.observedAt,
    windows,
    warning: snapshot.warning || null,
    error: snapshot.error || null,
    checkpoint: start || since,
    comparisons: since ? compareQuotaWindows(before, windows) : [],
    taskEstimatePercent: null
  };
  if (start && windows.length) {
    fs.mkdirSync(stateDirectory, { recursive: true });
    // Separate immutable files avoid lost baselines when chats checkpoint in parallel.
    fs.writeFileSync(checkpointFile, JSON.stringify(windows, null, 2) + "\n", { flag: "wx" });
  }
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    if (!windows.length) console.log("Лимит Codex сейчас недоступен; неизвестный расход не считается нулевым.");
    for (const row of windows) console.log(`Codex · ${row.label || "окно"}: использовано ${row.usedPercent}%, осталось ${row.remainingPercent}%; сброс ${row.resetAt || "неизвестен"}.`);
    if (start && windows.length) console.log(`Начало этапа сохранено: ${start}.`);
    for (const delta of result.comparisons) console.log(delta.percentagePoints === null
      ? `${delta.label}: сравнение недоступно (${delta.reason}).`
      : `${delta.label}: индикатор изменился на ${delta.percentagePoints} п.п. с отметки ${since}.`);
    if (result.comparisons.length) console.log("Это весь аккаунт, включая параллельные чаты. Округление и задержка индикатора сохраняются; 0 п.п. не означает нулевой расход. Сравнение предполагает тот же аккаунт: его identity CodeBurn не подтверждает.");
    if (result.warning || result.comparisons.some((row) => row.warnings && row.warnings.length)) console.log("Предупреждение: один из снимков получен из валидного JSON перед ошибкой завершения CodeBurn; сравнение сохраняет эту оговорку.");
  }
  if (!windows.length) process.exitCode = 1;
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
