function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RateLimiterOptions {
  rpm?: number;
  tpm?: number;
}

export class RateLimiter {
  private readonly requestTimes: number[] = [];
  private readonly tokenHistory: Array<{ timestamp: number; tokens: number }> = [];

  constructor(private readonly options: RateLimiterOptions) {}

  private prune(now: number) {
    const windowStart = now - 60_000;
    while (this.requestTimes.length && this.requestTimes[0] < windowStart) {
      this.requestTimes.shift();
    }
    while (this.tokenHistory.length && this.tokenHistory[0].timestamp < windowStart) {
      this.tokenHistory.shift();
    }
  }

  private totalTokens() {
    return this.tokenHistory.reduce((sum, entry) => sum + entry.tokens, 0);
  }

  private async waitForSlot(tokens: number) {
    if (!this.options.rpm && !this.options.tpm) return;
    for (;;) {
      const now = Date.now();
      this.prune(now);
      const rpmOk =
        !this.options.rpm || this.requestTimes.length < (this.options.rpm ?? 0);
      const tpmOk = !this.options.tpm || this.totalTokens() + tokens <= (this.options.tpm ?? 0);
      if (rpmOk && tpmOk) {
        return;
      }
      const nextRequest = this.requestTimes[0] + 60_000;
      const nextTokens = this.tokenHistory[0]?.timestamp
        ? this.tokenHistory[0].timestamp + 60_000
        : now + 1000;
      const waitUntil = Math.min(nextRequest || nextTokens, nextTokens);
      const waitMs = Math.max(waitUntil - now, 50);
      await sleep(waitMs);
    }
  }

  async schedule<T>(tokens: number, fn: () => Promise<T>): Promise<T> {
    await this.waitForSlot(tokens);
    const now = Date.now();
    this.requestTimes.push(now);
    if (this.options.tpm) {
      this.tokenHistory.push({ timestamp: now, tokens });
    }
    try {
      return await fn();
    } finally {
      // tokens accounted already; nothing else to do
    }
  }
}
