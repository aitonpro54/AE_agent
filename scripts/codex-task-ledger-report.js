"use strict";

const os = require("os");
const path = require("path");
const { summarizeTask } = require("./codex-task-ledger");

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("npm.cmd run report:task-usage -- --thread current [--thread UUID ...] [--json]\nЧитает только локальный Codex ledger. Дочерние чаты укажите явно. Модель не вызывается.");
    return;
  }
  const ids = [];
  let json = false;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--json") { json = true; continue; }
    if (args[i] !== "--thread") throw new Error("Неизвестный аргумент. Используйте --help.");
    const id = args[++i];
    ids.push(id === "current" ? process.env.CODEX_THREAD_ID : id);
  }
  const result = await summarizeTask(path.join(os.homedir(), ".codex", "sessions"), ids);
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Ответов модели: ${result.responses}; input ${result.totals.inputTokens} (cache ${result.totals.cachedInputTokens}), output ${result.totals.outputTokens}.`);
    console.log("Оценка задачи в % подписки: неизвестна (нет калибровки). Фактический процент аккаунта: npm.cmd run report:quota.");
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
