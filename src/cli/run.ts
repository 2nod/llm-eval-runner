import { Command } from "commander";
import path from "path";
import fs from "fs";
import { nanoid } from "nanoid";
import { loadConfig } from "../config/schema";
import { readJsonl } from "../dataset/jsonl";
import { PipelineRunner } from "../pipeline/runner";
import { Condition, conditionOrder, DatasetSample } from "../types";
import { logger } from "../utils/logger";

interface RunOptions {
  config: string;
  input: string;
  output: string;
  conditions?: string;
  runId?: string;
  overwrite?: boolean;
}

function resolveConditions(raw?: string): Condition[] {
  if (!raw) return [...conditionOrder];
  const tokens = raw.split(/[,\s]+/).filter(Boolean);
  const valid = tokens.filter((token): token is Condition =>
    conditionOrder.includes(token as Condition)
  );
  if (!valid.length) {
    throw new Error(`No valid conditions found in ${raw}`);
  }
  return valid;
}

async function main() {
  const program = new Command();
  program
    .requiredOption("-c, --config <file>", "Path to config file")
    .requiredOption("-i, --input <file>", "Dataset JSONL file")
    .requiredOption("-o, --output <file>", "Output JSONL file")
    .option("--conditions <list>", "Comma separated conditions", undefined)
    .option("--run-id <id>", "Override run identifier")
    .option("--overwrite", "Overwrite output file", false);

  program.showHelpAfterError();
  program.parse(process.argv);
  const opts = program.opts<RunOptions>();

  const config = loadConfig(opts.config);
  const dataset = await readJsonl<DatasetSample>(opts.input);
  const conditions = resolveConditions(opts.conditions);
  const runId = opts.runId ?? `run-${new Date().toISOString().replace(/[:.]/g, "")}-${nanoid(6)}`;

  const outputFile = path.isAbsolute(opts.output)
    ? opts.output
    : path.join(process.cwd(), opts.output);
  if (fs.existsSync(outputFile) && !opts.overwrite) {
    throw new Error(`${outputFile} exists. Pass --overwrite to replace.`);
  }
  await fs.promises.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.promises.writeFile(outputFile, "", "utf8");

  logger.info("starting run", { runId, samples: dataset.length, conditions });
  const runner = new PipelineRunner({
    config,
    runId,
    conditions,
    outputFile,
    dataset,
  });
  await runner.run();

  const resolvedDir = path.isAbsolute(config.runSettings.resolvedPromptDir)
    ? config.runSettings.resolvedPromptDir
    : path.join(config.baseDir, config.runSettings.resolvedPromptDir);
  const promptDir = path.join(resolvedDir, runId);
  await fs.promises.mkdir(promptDir, { recursive: true });
  const prompts = runner.getPrompts();
  await Promise.all(
    Object.entries(prompts).map(([name, template]) =>
      fs.promises.writeFile(path.join(promptDir, `${name}.txt`), template ?? "", "utf8")
    )
  );

  logger.info("run complete", { runId, outputFile, promptDir });
}

main().catch((err) => {
  logger.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
