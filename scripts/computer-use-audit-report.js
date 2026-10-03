"use strict";

const { auditComputerUse, ID_PATTERN } = require("./computer-use-audit");

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      "npm.cmd run report:cu-audit -- --thread <UUID> [--root <DIR>] [--archived-root <DIR>] [--json]\n" +
      "Аудит использования Computer Use по локальному логу сессии.\n" +
      "Параметр --thread принимает только явный подтверждённый UUID сессии ('current' запрещён).\n" +
      "Выводит агрегированные метрики: попытки CU (прямые и embedded), наблюдаемые вызовы, изображения, намерения и спан."
    );
    return;
  }

  let threadId = null;
  let root = null;
  let archivedRoot = null;
  let json = false;

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--json") {
      json = true;
      continue;
    }
    if (args[i] === "--thread") {
      threadId = args[++i];
      continue;
    }
    if (args[i] === "--root") {
      root = args[++i];
      continue;
    }
    if (args[i] === "--archived-root") {
      archivedRoot = args[++i];
      continue;
    }
    throw new Error(`Неизвестный аргумент: ${args[i]}. Используйте --help.`);
  }

  if (!threadId) {
    throw new Error("Параметр --thread <UUID> обязателен. 'current' запрещён.");
  }
  if (!ID_PATTERN.test(threadId)) {
    throw new Error(`Недопустимый thread ID: ${threadId}. Требуется подтверждённый UUID.`);
  }

  const result = await auditComputerUse({ threadId, root, archivedRoot });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`=== Аудит Computer Use: сессия ${result.threadId} ===`);
    console.log(`Файл лога: ${result.rolloutFileBasename} (session_meta проверен)`);
    console.log(`Попытки CU: всего ${result.attempts.total} (прямые: ${result.attempts.direct.total} [cua: ${result.attempts.direct.cuaRepl}, node: ${result.attempts.direct.nodeRepl}], embedded inner: ${result.attempts.embedded.innerAttempts} [exec wrappers: ${result.attempts.embedded.execWrappers}])`);
    console.log(`Синтаксические observables: click: ${result.observables.click}, keyboard: ${result.observables.keyboard}, windowState: ${result.observables.windowState}, focus: ${result.observables.focus} (всего: ${result.observables.total}, покрытие: ${result.observableCoverage})`);
    console.log(`Изображения: ${result.images.matchedImageBlocks} блоков изображений из ${result.images.matchedToolOutputs} ответов инструментов`);
    console.log(`Эвристические категории намерений:`);
    console.log(`  - project: ${result.intents.project}`);
    console.log(`  - panel: ${result.intents.panel}`);
    console.log(`  - confirmation: ${result.intents.confirmation}`);
    console.log(`  - visual: ${result.intents.visual}`);
    console.log(`  - unknown: ${result.intents.unknown}`);
    console.log(`Временной спан сессии: ${result.timeSpan.session.spanMinutes} мин (${result.timeSpan.session.spanMs} мс) [span proxy, не время блокировки экрана]`);
    if (result.timeSpan.cu.cuSpanMs > 0) {
      console.log(`Временной спан CU вызовов: ${result.timeSpan.cu.cuSpanMinutes} мин (${result.timeSpan.cu.cuSpanMs} мс)`);
    }
    if (result.usage && result.usage.status === "available") {
      const u = result.usage.totals;
      console.log(`Токены (ответы: ${result.usage.responseCount}): input ${u.inputTokens} (cached ${u.cachedInputTokens}), output ${u.outputTokens}`);
    } else if (result.usage && result.usage.status === "partial_unknown") {
      console.log(`Токены: статус partial_unknown (ошибки: ${result.usage.coverageErrors.join(", ")})`);
    } else {
      console.log(`Токены: статус unknown (${result.usage ? result.usage.reason : "нет данных"})`);
    }
  }
}

main().catch((error) => {
  console.error(`Ошибка аудита Computer Use: ${error.message}`);
  process.exitCode = 1;
});
