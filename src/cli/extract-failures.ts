import { Command } from "commander";
import path from "path";
import fs from "fs";
import { glob } from "glob";
import { iterateJsonl, writeJsonl } from "../dataset/jsonl";
import { RunRecord } from "../types";

interface ExtractOptions {
  runs: string[];
  output: string;
  threshold?: number;
}

async function collectFailures(paths: string[], threshold: number) {
  const failures: RunRecord[] = [];
  for (const file of paths) {
    for await (const record of iterateJsonl<RunRecord>(file)) {
      const belowThreshold = record.scores.overall < threshold;
      if (record.status === "needs_review" || belowThreshold) {
        failures.push(record);
      }
    }
  }
  return failures;
}

async function main() {
  const program = new Command();
  program
    .requiredOption("-r, --runs <files...>", "Run JSONL files")
    .requiredOption("-o, --output <file>", "Output JSONL for failures")
    .option("-t, --threshold <score>", "Overall score threshold", (value) => parseFloat(value), 0.9);
  program.parse(process.argv);
  const opts = program.opts<ExtractOptions>();
  const resolvedLists = await Promise.all(opts.runs.map((pattern) => glob(pattern)));
  const files = [...new Set(resolvedLists.flat())];
  if (!files.length) {
    throw new Error("No run files found");
  }
  const failures = await collectFailures(files, opts.threshold ?? 0.9);
  const resolvedOut = path.isAbsolute(opts.output) ? opts.output : path.join(process.cwd(), opts.output);
  await writeJsonl(resolvedOut, failures);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
