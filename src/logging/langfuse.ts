import { nanoid } from "nanoid";
import { logger } from "../utils/logger";

export interface LangfuseOptions {
  enabled: boolean;
  baseUrl: string;
}

export interface LangfuseTrace {
  traceId: string;
}

export class LangfuseTracer {
  constructor(private readonly options: LangfuseOptions) {}

  startTrace(metadata?: Record<string, unknown>): LangfuseTrace | undefined {
    if (!this.options.enabled) return undefined;
    const traceId = nanoid();
    logger.debug("langfuse.trace.start", { traceId, metadata });
    return { traceId };
  }

  async logSpan(
    trace: LangfuseTrace | undefined,
    span: { name: string; input?: unknown; output?: unknown; scores?: Record<string, unknown> }
  ) {
    if (!trace || !this.options.enabled) return;
    logger.debug("langfuse.span", { traceId: trace.traceId, ...span });
  }
}
