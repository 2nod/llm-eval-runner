import { constraintSchema, Constraints, DatasetSample } from "../types";

function mergeArrays<T>(base: T[] | undefined, override: T[] | undefined) {
  return [...(base ?? []), ...(override ?? [])];
}

export class ConstraintNormalizer {
  constructor(private readonly defaults: Partial<Constraints>) {}

  normalize(sample: DatasetSample): Constraints {
    const mergedFormat = {
      ...(this.defaults.format ?? {}),
      ...(sample.constraints?.format ?? {}),
    };
    return constraintSchema.parse({
      ...this.defaults,
      ...sample.constraints,
      format: mergedFormat,
      glossary: mergeArrays(this.defaults.glossary, sample.constraints?.glossary),
      bannedPatterns: mergeArrays(
        this.defaults.bannedPatterns,
        sample.constraints?.bannedPatterns
      ),
      allowJapaneseTokens: mergeArrays(
        this.defaults.allowJapaneseTokens,
        sample.constraints?.allowJapaneseTokens
      ),
    });
  }
}
