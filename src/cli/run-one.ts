import { Command } from "commander";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";
import { loadConfig } from "../config/schema";
import { PipelineRunner } from "../pipeline/runner";
import { Condition, DatasetSample, RunRecord, conditionOrder } from "../types";

async function readSample(samplePath?: string): Promise<DatasetSample> {
  if (samplePath) {
    const content = await fs.promises.readFile(samplePath, "utf8");
    return JSON.parse(content);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw);
}

async function main() {
  const program = new Command();
  program
    .requiredOption("-c, --config <file>", "Config file")
    .option("-s, --sample <file>", "Sample JSON file (default: stdin)")
    .option("--condition <name>", "Condition (default A3)", "A3")
    .option("--output-format <format>", "text or json", "text");
  program.showHelpAfterError();
  program.parse(process.argv);
  const opts = program.opts<{ config: string; sample?: string; condition: Condition; outputFormat: string }>();

  if (!conditionOrder.includes(opts.condition)) {
    throw new Error(`Invalid condition ${opts.condition}`);
  }

  const sample = await readSample(opts.sample);
  const config = loadConfig(opts.config);
  const records: RunRecord[] = [];
  const runner = new PipelineRunner({
    config,
    runId: `run-one-${nanoid(6)}`,
    conditions: [opts.condition],
    outputFile: path.join(process.cwd(), `.tmp-run-one-${process.pid}.jsonl`),
    dataset: [sample],
    onRecord: (record) => {
      records.push(record);
    },
  });
  await runner.run();

  if (!records.length) {
    throw new Error("No record produced");
  }
  const record = records[0];
  if (opts.outputFormat === "json") {
    process.stdout.write(`${JSON.stringify(record)}\n`);
  } else {
    process.stdout.write(`${record.final.en}\n`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
