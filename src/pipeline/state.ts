import { DatasetSample, TranslationState } from "../types";
import { LLMClient } from "../llm/base";
import { ResolvedPrompt } from "../config/schema";
import { renderTemplate } from "../utils/template";

export const DEFAULT_STATE_TEMPLATE = `You are extracting structured state for a translation task.
Return compact JSON with fields: utterance, speaker, addressee, entities (array of {name, description}), coreMeaning, implicature.
Use English.
# Source
{{text}}
# Context
{{context}}
`;

function heuristicState(sample: DatasetSample): TranslationState {
  return {
    utterance: sample.ja.text.slice(0, 120),
    speaker: "unknown",
    addressee: "unknown",
    entities: [],
    coreMeaning: sample.ja.text,
    implicature: sample.ja.context,
  };
}

export class StateBuilder {
  constructor(
    private readonly llm: LLMClient | undefined,
    private readonly prompt: ResolvedPrompt | undefined
  ) {}

  async build(sample: DatasetSample): Promise<TranslationState> {
    if (!this.llm) {
      return heuristicState(sample);
    }
    const template = this.prompt?.template ?? DEFAULT_STATE_TEMPLATE;
    const rendered = renderTemplate(template, {
      text: sample.ja.text,
      context: sample.ja.context ?? "(none)",
    });

    const response = await this.llm.generate([
      { role: "system", content: this.prompt?.system ?? "You extract structured facts" },
      { role: "user", content: rendered },
    ], {
      responseFormat: "json",
    });

    try {
      const parsed = JSON.parse(response.output);
      return {
        utterance: parsed.utterance ?? sample.ja.text,
        speaker: parsed.speaker ?? "unknown",
        addressee: parsed.addressee,
        entities: parsed.entities ?? [],
        coreMeaning: parsed.coreMeaning ?? sample.ja.text,
        implicature: parsed.implicature,
      };
    } catch (err) {
      return heuristicState(sample);
    }
  }
}
