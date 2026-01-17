import { DatasetSample, HardCheckResult, Constraints } from "../types";

export interface HardCheckSettings {
  noDisallowedJapanese: boolean;
  glossaryStrictMatches: boolean;
  maxLength?: number;
  noMetaTalk: boolean;
  formatPreserved: boolean;
}

export interface HardCheckRequest {
  translation: string;
  draft: string;
  sample: DatasetSample;
  constraints: Constraints;
}

function containsJapanese(text: string) {
  return /[\u3040-\u30ff\u4e00-\u9faf]/.test(text);
}

export class HardCheckEngine {
  constructor(private readonly settings: HardCheckSettings) {}

  run(request: HardCheckRequest): HardCheckResult[] {
    const results: HardCheckResult[] = [];
    if (this.settings.noDisallowedJapanese) {
      const whitelist = new Set(request.constraints.allowJapaneseTokens);
      const tokens = request.translation.split(/\s+/);
      const offending = tokens.filter((token) => containsJapanese(token) && !whitelist.has(token));
      results.push({
        id: "noDisallowedJapanese",
        passed: offending.length === 0,
        description: "English output should not include JP tokens unless allowed",
        details: offending.join(", "),
      });
    }

    if (this.settings.glossaryStrictMatches) {
      const missing = request.constraints.glossary
        .filter((entry) => entry.strict)
        .filter((entry) => !request.translation.includes(entry.en));
      results.push({
        id: "glossaryStrictMatches",
        passed: missing.length === 0,
        description: "Strict glossary terms must appear in translation",
        details: missing.map((m) => `${m.ja}->${m.en}`).join(", "),
      });
    }

    const limit = request.constraints.format.maxChars ?? this.settings.maxLength;
    if (limit) {
      results.push({
        id: "maxLength",
        passed: request.translation.length <= limit,
        description: `Translation must be <= ${limit} chars`,
        details: `${request.translation.length}`,
      });
    }

    if (this.settings.noMetaTalk) {
      const meta = /as an ai/i.test(request.translation);
      results.push({
        id: "noMetaTalk",
        passed: !meta,
        description: "Model should not mention itself",
      });
    }

    if (this.settings.formatPreserved && request.constraints.format.keepLineBreaks) {
      const sourceBreaks = (request.sample.ja.text.match(/\n/g) || []).length;
      const targetBreaks = (request.translation.match(/\n/g) || []).length;
      results.push({
        id: "formatPreserved",
        passed: sourceBreaks === targetBreaks,
        description: "Line break count should match source",
        details: `${sourceBreaks} vs ${targetBreaks}`,
      });
    }

    return results;
  }
}
