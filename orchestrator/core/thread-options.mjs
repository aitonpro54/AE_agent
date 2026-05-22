import path from "node:path";
import process from "node:process";

export function createThreadOptionsFromContract(contract, options = {}) {
  return {
    ...contract,
    workingDirectory: path.resolve(options.cwd || process.cwd()),
  };
}
