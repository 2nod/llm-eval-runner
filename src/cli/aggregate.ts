import { Command } from "commander";
import path from "path";
import fs from "fs";
import { glob } from "glob";
import { iterateJsonl } from "../dataset/jsonl";
import { RunRecord } from "../types";

interface AggregateOptions {
  runs: string[];
  output: string;
  format?: "json" | "csv";
}

interface SummaryRow {
  runId: string;
  condition: string;
  samples: number;
  avgOverall: number;
  minOverall: number;
  maxOverall: number;
  failureRate: number;
  criticalIssues: number;
}

function toCsv(rows: SummaryRow[]): string {
  const header = "runId,condition,samples,avgOverall,minOverall,maxOverall,failureRate,criticalIssues";
  const body = rows
    .map((row) =>
      [
        row.runId,
        row.condition,
        row.samples,
        row.avgOverall.toFixed(4),
        row.minOverall.toFixed(4),
        row.maxOverall.toFixed(4),
        row.failureRate.toFixed(4),
        row.criticalIssues,
      ].join(",")
    )
    .join("\n");
  return `${header}\n${body}`;
}

async function summarize(paths: string[]): Promise<SummaryRow[]> {
  const rows: SummaryRow[] = [];
  for (const file of paths) {
    const stats = new Map<string, { values: number[]; failures: number; samples: number; critical: number }>();
    for await (const record of iterateJsonl<RunRecord>(file)) {
      const key = `${record.runId}:${record.condition}`;
      if (!stats.has(key)) {
        stats.set(key, { values: [], failures: 0, samples: 0, critical: 0 });
      }
      const bucket = stats.get(key)!;
      bucket.values.push(record.scores.overall);
      bucket.samples += 1;
      if (record.status === "needs_review") {
        bucket.failures += 1;
      }
      const criticalIssues = record.verifier.issues.filter((issue) => issue.severity === "critical").length;
      bucket.critical += criticalIssues;
    }
    for (const [key, bucket] of stats.entries()) {
      const [runId, condition] = key.split(":");
      const avg = bucket.values.reduce((sum, value) => sum + value, 0) / (bucket.samples || 1);
      const min = Math.min(...bucket.values);
      const max = Math.max(...bucket.values);
      rows.push({
        runId,
        condition,
        samples: bucket.samples,
        avgOverall: avg,
        minOverall: min,
        maxOverall: max,
        failureRate: bucket.samples ? bucket.failures / bucket.samples : 0,
        criticalIssues: bucket.critical,
      });
    }
  }
  return rows;
}

async function main() {
  const program = new Command();
  program
    .requiredOption("-r, --runs <files...>", "Run JSONL files (supports glob)")
    .requiredOption("-o, --output <file>", "Output summary file")
    .option("-f, --format <fmt>", "json or csv", "csv");
  program.parse(process.argv);
  const opts = program.opts<AggregateOptions>();
  const resolvedLists = await Promise.all(opts.runs.map((pattern) => glob(pattern)));
  const expanded = [...new Set(resolvedLists.flat())];
  if (!expanded.length) {
    throw new Error("No run files found");
  }
  const rows = await summarize(expanded);
  const resolvedOut = path.isAbsolute(opts.output) ? opts.output : path.join(process.cwd(), opts.output);
  await fs.promises.mkdir(path.dirname(resolvedOut), { recursive: true });
  if (opts.format === "json") {
    await fs.promises.writeFile(resolvedOut, JSON.stringify(rows, null, 2));
  } else {
    await fs.promises.writeFile(resolvedOut, toCsv(rows));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
