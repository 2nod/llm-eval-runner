import fs from "fs";
import path from "path";
import { z } from "zod";
import YAML from "yaml";
import { constraintSchema } from "../types";

export const modelConfigSchema = z.object({
  provider: z.enum(["openai", "anthropic", "mock"]).default("mock"),
  name: z.string(),
  temperature: z.number().min(0).max(2).default(0),
  topP: z.number().min(0).max(1).optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  jsonMode: z.boolean().optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
});

export type ModelConfig = z.infer<typeof modelConfigSchema>;

const promptSourceSchema = z
  .object({
    template: z.string().optional(),
    file: z.string().optional(),
    artifact: z.string().optional(),
    artifactField: z
      .enum(["systemPrompt", "userPrompt", "template"])
      .optional(),
  })
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "Prompt source requires at least one property"
  );

export type PromptSource = z.infer<typeof promptSourceSchema>;

const componentSchema = z.object({
  model: modelConfigSchema,
  prompt: promptSourceSchema.optional(),
  params: z.record(z.string(), z.unknown()).optional(),
});

export type ComponentConfig = z.infer<typeof componentSchema>;

const hardCheckDefaults = {
  noDisallowedJapanese: true,
  glossaryStrictMatches: true,
  noMetaTalk: true,
  formatPreserved: true,
} as const;

const runSettingsDefaults = {
  concurrency: 2,
  rpm: undefined,
  tpm: undefined,
  maxRepairs: 1,
  judgeRuns: 3,
  outputDir: "runs",
  cacheDir: ".cache",
  resolvedPromptDir: "runs/prompts",
} as const;

export const configSchema = z.object({
  name: z.string().default("experiment"),
  description: z.string().optional(),
  runSettings: z
    .object({
      concurrency: z.number().int().positive().default(runSettingsDefaults.concurrency),
      rpm: z.number().int().positive().optional(),
      tpm: z.number().int().positive().optional(),
      maxRepairs: z.number().int().nonnegative().default(runSettingsDefaults.maxRepairs),
      judgeRuns: z.number().int().positive().default(runSettingsDefaults.judgeRuns),
      outputDir: z.string().default(runSettingsDefaults.outputDir),
      cacheDir: z.string().default(runSettingsDefaults.cacheDir),
      resolvedPromptDir: z.string().default(runSettingsDefaults.resolvedPromptDir),
    })
    .default(runSettingsDefaults),
  defaults: z
    .object({
      constraints: constraintSchema.partial().default({}),
      hardChecks: z
        .object({
          noDisallowedJapanese: z.boolean().default(true),
          glossaryStrictMatches: z.boolean().default(true),
          maxLength: z.number().int().positive().optional(),
          noMetaTalk: z.boolean().default(true),
          formatPreserved: z.boolean().default(true),
        })
        .default(hardCheckDefaults),
    })
    .default({ constraints: {}, hardChecks: hardCheckDefaults }),
  components: z.object({
    translator: componentSchema,
    translatorWithState: componentSchema.optional(),
    stateBuilder: componentSchema.optional(),
    constraintNormalizer: componentSchema.optional(),
    verifier: componentSchema.optional(),
    repairer: componentSchema.optional(),
    judge: componentSchema.optional(),
  }),
  promptArtifacts: z.record(z.string(), z.string()).default({}),
  langfuse: z
    .object({
      enabled: z.boolean().default(false),
      baseUrl: z.string().default("https://cloud.langfuse.com"),
      datasetName: z.string().optional(),
    })
    .default({ enabled: false, baseUrl: "https://cloud.langfuse.com" }),
});

export type RuntimeConfig = z.infer<typeof configSchema>;

export interface PromptArtifact {
  systemPrompt?: string;
  userPrompt?: string;
  template?: string;
  fewShots?: Array<{ role: "user" | "assistant"; content: string }>;
  params?: Record<string, unknown>;
  provenance?: Record<string, unknown>;
}

export interface ResolvedPrompt {
  system?: string;
  template?: string;
  artifact?: PromptArtifact;
  source?: string;
}

export interface LoadedConfig extends RuntimeConfig {
  baseDir: string;
}

function readConfigFile(filePath: string) {
  const data = fs.readFileSync(filePath, "utf8");
  if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
    return YAML.parse(data);
  }
  return JSON.parse(data);
}

export function loadConfig(configPath: string): LoadedConfig {
  const absolutePath = path.isAbsolute(configPath)
    ? configPath
    : path.join(process.cwd(), configPath);
  const raw = readConfigFile(absolutePath);
  const parsed = configSchema.parse(raw);
  return {
    ...parsed,
    baseDir: path.dirname(absolutePath),
  };
}

export function loadPromptArtifact(baseDir: string, artifactPath: string): PromptArtifact {
  const resolved = path.isAbsolute(artifactPath)
    ? artifactPath
    : path.join(baseDir, artifactPath);
  const data = fs.readFileSync(resolved, "utf8");
  return JSON.parse(data) as PromptArtifact;
}

export function resolvePrompt(
  baseDir: string,
  source: PromptSource | undefined,
  fallback?: () => string
): ResolvedPrompt {
  if (!source) {
    return { template: fallback ? fallback() : undefined };
  }

  if (source.template) {
    return { template: source.template, source: "inline" };
  }

  if (source.file) {
    const resolved = path.isAbsolute(source.file)
      ? source.file
      : path.join(baseDir, source.file);
    return { template: fs.readFileSync(resolved, "utf8"), source: resolved };
  }

  if (source.artifact) {
    const artifact = loadPromptArtifact(baseDir, source.artifact);
    const templateKey = source.artifactField || "template";
    const template = (artifact as Record<string, string | undefined>)[templateKey];
    return {
      template: template || artifact.template || artifact.userPrompt,
      system: artifact.systemPrompt,
      artifact,
      source: source.artifact,
    };
  }

  if (fallback) {
    return { template: fallback() };
  }

  throw new Error("Unable to resolve prompt source");
}
