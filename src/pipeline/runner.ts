import path from "path";
import pLimit from "p-limit";
import { appendJsonl } from "../dataset/jsonl";
import { Condition, RunRecord, DatasetSample, TranslationState, Constraints } from "../types";
import { LoadedConfig, resolvePrompt } from "../config/schema";
import { createLLMClient } from "../llm";
import { StateBuilder, DEFAULT_STATE_TEMPLATE } from "./state";
import { ConstraintNormalizer } from "./constraints";
import { Translator, DEFAULT_TRANSLATOR_TEMPLATE } from "./translator";
import { HardCheckEngine, HardCheckSettings } from "./hardChecks";
import { Verifier, DEFAULT_VERIFIER_TEMPLATE } from "./verifier";
import { Repairer, DEFAULT_REPAIR_TEMPLATE } from "./repairer";
import { Judge, DEFAULT_JUDGE_TEMPLATE } from "./judge";
import { LangfuseTracer } from "../logging/langfuse";
import { logger } from "../utils/logger";
import { RateLimiterOptions } from "../llm/rateLimiter";

interface UsageAccumulator {
  prompt: number;
  completion: number;
}

function createUsageAccumulator(): UsageAccumulator {
  return { prompt: 0, completion: 0 };
}

function addUsage(target: UsageAccumulator, usage?: { promptTokens?: number; completionTokens?: number }) {
  if (!usage) return;
  target.prompt += usage.promptTokens ?? 0;
  target.completion += usage.completionTokens ?? 0;
}

function hardCheckSettings(config: LoadedConfig): HardCheckSettings {
  return {
    noDisallowedJapanese: config.defaults.hardChecks.noDisallowedJapanese ?? true,
    glossaryStrictMatches: config.defaults.hardChecks.glossaryStrictMatches ?? true,
    maxLength: config.defaults.hardChecks.maxLength,
    noMetaTalk: config.defaults.hardChecks.noMetaTalk ?? true,
    formatPreserved: config.defaults.hardChecks.formatPreserved ?? true,
  };
}

function needsState(condition: Condition) {
  return condition === "A1" || condition === "A3";
}

function needsVerify(condition: Condition) {
  return condition === "A2" || condition === "A3";
}

export interface RunnerInit {
  config: LoadedConfig;
  runId: string;
  conditions: Condition[];
  outputFile: string;
  dataset: DatasetSample[];
  onRecord?: (record: RunRecord) => Promise<void> | void;
}

export class PipelineRunner {
  private readonly limiter;
  private readonly translator: Translator;
  private readonly translatorWithState?: Translator;
  private readonly stateBuilder?: StateBuilder;
  private readonly constraintNormalizer: ConstraintNormalizer;
  private readonly hardCheckEngine: HardCheckEngine;
  private readonly verifier: Verifier;
  private readonly repairer: Repairer;
  private readonly judge: Judge;
  private readonly tracer: LangfuseTracer;
  private readonly resolvedPrompts: Record<string, string | undefined> = {};
  private readonly modelSummary: Record<string, string | undefined> = {};
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly init: RunnerInit) {
    const runSettings = init.config.runSettings;
    const rateLimiter: RateLimiterOptions = {
      rpm: runSettings.rpm,
      tpm: runSettings.tpm,
    };
    const cacheDir = path.isAbsolute(runSettings.cacheDir)
      ? runSettings.cacheDir
      : path.join(init.config.baseDir, runSettings.cacheDir);

    const translatorPrompt = resolvePrompt(init.config.baseDir, init.config.components.translator.prompt, () => DEFAULT_TRANSLATOR_TEMPLATE);
    this.resolvedPrompts.translator = translatorPrompt.template;
    const translatorModel = createLLMClient(init.config.components.translator.model, { cacheDir, rateLimiter });
    this.translator = new Translator(translatorModel, translatorPrompt);
    this.modelSummary.translator = `${init.config.components.translator.model.provider}:${init.config.components.translator.model.name}`;

    if (init.config.components.translatorWithState) {
      const prompt = resolvePrompt(
        init.config.baseDir,
        init.config.components.translatorWithState.prompt,
        () => DEFAULT_TRANSLATOR_TEMPLATE
      );
      this.resolvedPrompts.translatorWithState = prompt.template;
      const translatorWithStateModel = createLLMClient(init.config.components.translatorWithState.model, { cacheDir, rateLimiter });
      this.translatorWithState = new Translator(translatorWithStateModel, prompt);
      this.modelSummary.translatorWithState = `${init.config.components.translatorWithState.model.provider}:${init.config.components.translatorWithState.model.name}`;
    }

    if (init.config.components.stateBuilder) {
      const prompt = resolvePrompt(init.config.baseDir, init.config.components.stateBuilder.prompt, () => DEFAULT_STATE_TEMPLATE);
      this.resolvedPrompts.stateBuilder = prompt.template;
      const stateModel = createLLMClient(init.config.components.stateBuilder.model, { cacheDir, rateLimiter });
      this.stateBuilder = new StateBuilder(stateModel, prompt);
      this.modelSummary.stateBuilder = `${init.config.components.stateBuilder.model.provider}:${init.config.components.stateBuilder.model.name}`;
    } else {
      this.resolvedPrompts.stateBuilder = DEFAULT_STATE_TEMPLATE;
      this.stateBuilder = new StateBuilder(undefined, { template: DEFAULT_STATE_TEMPLATE });
    }

    this.constraintNormalizer = new ConstraintNormalizer(init.config.defaults.constraints);
    this.hardCheckEngine = new HardCheckEngine(hardCheckSettings(init.config));

    const verifierPrompt = resolvePrompt(init.config.baseDir, init.config.components.verifier?.prompt, () => DEFAULT_VERIFIER_TEMPLATE);
    this.resolvedPrompts.verifier = verifierPrompt.template;
    const verifierClient = init.config.components.verifier
      ? createLLMClient(init.config.components.verifier.model, { cacheDir, rateLimiter })
      : undefined;
    if (init.config.components.verifier) {
      this.modelSummary.verifier = `${init.config.components.verifier.model.provider}:${init.config.components.verifier.model.name}`;
    }
    this.verifier = new Verifier(verifierClient, verifierPrompt, this.hardCheckEngine);

    const repairPrompt = resolvePrompt(init.config.baseDir, init.config.components.repairer?.prompt, () => DEFAULT_REPAIR_TEMPLATE);
    this.resolvedPrompts.repairer = repairPrompt.template;
    const repairClient = init.config.components.repairer
      ? createLLMClient(init.config.components.repairer.model, { cacheDir, rateLimiter })
      : undefined;
    if (init.config.components.repairer) {
      this.modelSummary.repairer = `${init.config.components.repairer.model.provider}:${init.config.components.repairer.model.name}`;
    }
    this.repairer = new Repairer(repairClient, repairPrompt);

    const judgePrompt = resolvePrompt(init.config.baseDir, init.config.components.judge?.prompt, () => DEFAULT_JUDGE_TEMPLATE);
    this.resolvedPrompts.judge = judgePrompt.template;
    const judgeClient = init.config.components.judge
      ? createLLMClient(init.config.components.judge.model, { cacheDir, rateLimiter })
      : undefined;
    if (init.config.components.judge) {
      this.modelSummary.judge = `${init.config.components.judge.model.provider}:${init.config.components.judge.model.name}`;
    }
    this.judge = new Judge(judgeClient, judgePrompt, init.config.runSettings.judgeRuns);

    const langfuseOptions = init.config.langfuse;
    this.tracer = new LangfuseTracer({
      enabled: langfuseOptions.enabled,
      baseUrl: langfuseOptions.baseUrl,
    });

    this.limiter = pLimit(runSettings.concurrency);
  }

  getPrompts() {
    return this.resolvedPrompts;
  }

  private chooseTranslator(condition: Condition) {
    if (needsState(condition) && this.translatorWithState) {
      return this.translatorWithState;
    }
    return this.translator;
  }

  private async processSample(sample: DatasetSample, condition: Condition): Promise<RunRecord> {
    const runSettings = this.init.config.runSettings;
    const usage = createUsageAccumulator();
    const timing: Record<string, number> = {};
    const timingStart = Date.now();
    const trace = this.tracer.startTrace({ sampleId: sample.id, condition });

    const constraints = this.constraintNormalizer.normalize(sample);
    let state: TranslationState | undefined;
    if (needsState(condition)) {
      const stateStart = Date.now();
      state = await this.stateBuilder?.build(sample);
      timing.state = Date.now() - stateStart;
      await this.tracer.logSpan(trace, { name: "state", input: sample, output: state });
    }

    const translator = this.chooseTranslator(condition);
    const translateStart = Date.now();
    const translation = await translator.translate(sample, constraints, state);
    timing.translate = Date.now() - translateStart;
    addUsage(usage, translation.usageTokens);
    await this.tracer.logSpan(trace, { name: "translate", output: translation.draft });

    let current = translation.draft;
    let verificationStart = Date.now();
    let verification = await this.verifier.verify(sample, current, constraints, state);
    timing.verify = Date.now() - verificationStart;
    addUsage(usage, verification.usageTokens);

    const maxRepairs = runSettings.maxRepairs;
    if (needsVerify(condition)) {
      let attempt = 0;
      while (attempt < maxRepairs) {
        const hasCritical = verification.issues.some((issue) => issue.severity === "critical");
        const hardFail = verification.hardChecks.some((hc) => !hc.passed);
        if (!hasCritical && !hardFail) {
          break;
        }
        const repairStart = Date.now();
        const repair = await this.repairer.repair(sample, current, verification.issues, constraints, state);
        timing[`repair_${attempt}`] = Date.now() - repairStart;
        addUsage(usage, repair.usageTokens);
        current = repair.translation;
        verificationStart = Date.now();
        verification = await this.verifier.verify(sample, current, constraints, state);
        timing.verify += Date.now() - verificationStart;
        addUsage(usage, verification.usageTokens);
        attempt += 1;
      }
    }

    const judgeStart = Date.now();
    const judgeResult = await this.judge.score(sample, current, constraints, state);
    timing.judge = Date.now() - judgeStart;
    addUsage(usage, judgeResult.usageTokens);

    const hardScores: Record<string, boolean> = {};
    for (const check of verification.hardChecks) {
      hardScores[check.id] = check.passed;
    }

    const status = verification.issues.some((issue) => issue.severity === "critical") ||
      verification.hardChecks.some((check) => !check.passed)
      ? "needs_review"
      : "ok";

    const translatorModelName = needsState(condition)
      ? this.modelSummary.translatorWithState ?? this.modelSummary.translator
      : this.modelSummary.translator;

    return {
      runId: this.init.runId,
      condition,
      id: sample.id,
      draft: { en: translation.draft },
      final: { en: current },
      verifier: {
        issues: verification.issues,
        hardChecks: verification.hardChecks,
      },
      scores: {
        hard: hardScores,
        judge: judgeResult.scores,
        overall: judgeResult.scores.overall,
      },
      usage: {
        model: {
          translator: translatorModelName,
          stateBuilder: needsState(condition) ? this.modelSummary.stateBuilder : undefined,
          verifier: this.modelSummary.verifier,
          repairer: this.modelSummary.repairer,
          judge: this.modelSummary.judge,
        },
        tokens: {
          prompt: usage.prompt,
          completion: usage.completion,
          total: usage.prompt + usage.completion,
        },
      },
      timingMs: {
        totalMs: Date.now() - timingStart,
        stages: timing,
      },
      state,
      constraintsNormalized: constraints,
      trace: trace ? { langfuseTraceId: trace.traceId } : undefined,
      status,
    };
  }

  async run() {
    const tasks = [] as Array<Promise<void>>;
    for (const sample of this.init.dataset) {
      for (const condition of this.init.conditions) {
        tasks.push(
          this.limiter(async () => {
            const record = await this.processSample(sample, condition);
            if (this.init.onRecord) {
              await this.init.onRecord(record);
            } else {
              this.writeChain = this.writeChain.then(() => appendJsonl(this.init.outputFile, record));
              await this.writeChain;
            }
            logger.info(`sample ${sample.id} condition ${condition} done`, {
              overall: record.scores.overall.toFixed(3),
              status: record.status,
            });
          })
        );
      }
    }
    await Promise.all(tasks);
  }
}
