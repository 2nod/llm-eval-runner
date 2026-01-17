import path from "path";
import { loadConfig } from "../config/schema";
import { PipelineRunner } from "../pipeline/runner";
import { Condition, DatasetSample, RunRecord, conditionOrder } from "../types";

type PromptfooVars = { sample?: DatasetSample; condition?: string; config?: string };
type PromptfooExecOptions = {
  config?: { runtimeConfig?: string; runtimeCondition?: string; outputMode?: string };
};
type PromptfooExecContext = { vars?: PromptfooVars };

function redirectConsoleLogsToStderr() {
  const originalLog = console.log;
  const originalInfo = console.info;
  console.log = (...args: unknown[]) => {
    console.error(...args);
  };
  console.info = (...args: unknown[]) => {
    console.error(...args);
  };
  return () => {
    console.log = originalLog;
    console.info = originalInfo;
  };
}

function parseJson(value: string | undefined): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function readExecArgs(): { vars?: PromptfooVars; options?: PromptfooExecOptions } {
  const argv = process.argv.slice(2);
  if (argv.length < 2) return {};
  const contextRaw = parseJson(argv[argv.length - 1]);
  const optionsRaw = parseJson(argv[argv.length - 2]);
  const context = (contextRaw && typeof contextRaw === "object" ? (contextRaw as PromptfooExecContext) : undefined);
  const options = (optionsRaw && typeof optionsRaw === "object" ? (optionsRaw as PromptfooExecOptions) : undefined);
  return { vars: context?.vars, options };
}

function summarizeRecord(record: RunRecord, recordPath: string) {
  const issues = record.verifier?.issues?.map((issue) => ({
    id: issue.id,
    type: issue.type,
    severity: issue.severity,
    rationale: issue.rationale,
    fixSuggestion: issue.fixSuggestion,
  }));
  const hardChecks = record.verifier?.hardChecks?.map((check) => ({
    id: check.id,
    passed: check.passed,
    description: check.description,
    details: check.details,
  }));
  return {
    runId: record.runId,
    condition: record.condition,
    id: record.id,
    status: record.status,
    final: record.final,
    scores: record.scores,
    state: record.state,
    verifier: { issues, hardChecks },
    usage: record.usage,
    timingMs: record.timingMs,
    constraintsNormalized: record.constraintsNormalized,
    trace: record.trace,
    recordPath,
  };
}

async function main() {
  redirectConsoleLogsToStderr();
  const varsRaw = process.env.PROMPTFOO_VARS;
  const varsFromEnv = parseJson(varsRaw) as PromptfooVars | undefined;
  const { vars: varsFromArgs, options } = readExecArgs();
  const vars = varsFromEnv ?? varsFromArgs;
  if (!vars) {
    throw new Error("PROMPTFOO_VARS missing and no exec args provided");
  }
  const sample: DatasetSample | undefined = vars.sample;
  if (!sample) {
    throw new Error("sample missing in vars");
  }
  const conditionRaw = (vars.condition ?? options?.config?.runtimeCondition ?? process.env.RUNTIME_CONDITION ?? "A3") as string;
  if (!conditionOrder.includes(conditionRaw as any)) {
    throw new Error(`invalid condition ${conditionRaw}`);
  }
  const condition = conditionRaw as Condition;
  const configPath = vars.config ?? options?.config?.runtimeConfig ?? process.env.RUNTIME_CONFIG ?? "configs/mock.yaml";
  const config = loadConfig(configPath);
  const records: RunRecord[] = [];
  const recordPath = path.join(process.cwd(), `.promptfoo-${process.pid}.jsonl`);
  const runner = new PipelineRunner({
    config,
    runId: `promptfoo-${Date.now()}`,
    conditions: [condition],
    outputFile: recordPath,
    dataset: [sample],
    onRecord: (record: RunRecord) => {
      records.push(record);
    },
  });
  await runner.run();
  const record = records[0];
  const outputMode = (options?.config?.outputMode ?? process.env.PROMPTFOO_OUTPUT_MODE ?? "summary").toLowerCase();
  const output = outputMode === "full" ? record : summarizeRecord(record, recordPath);
  process.stdout.write(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
