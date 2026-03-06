import { createOpenAI } from "@ai-sdk/openai";
import { BaseProvider } from "../base-provider";
import type { ModelInfo, GetModelOptions } from "../types";

const PERPLEXITY_BASE_URL = "https://api.perplexity.ai";

const STATIC_MODELS: ModelInfo[] = [
  { name: "sonar", label: "Sonar", provider: "perplexity", maxTokenAllowed: 128_000 },
  { name: "sonar-pro", label: "Sonar Pro", provider: "perplexity", maxTokenAllowed: 200_000 },
  { name: "sonar-reasoning", label: "Sonar Reasoning", provider: "perplexity", maxTokenAllowed: 128_000 },
];

export class PerplexityProvider extends BaseProvider {
  name = "perplexity";
  staticModels = STATIC_MODELS;
  config = {
    baseUrl: PERPLEXITY_BASE_URL,
    apiTokenKey: "PERPLEXITY_API_KEY",
  };

  getModelInstance(options: GetModelOptions) {
    const { apiKey } = this.getProviderBaseUrlAndKey({
      ...options,
      defaultBaseUrlKey: undefined,
      defaultApiTokenKey: "PERPLEXITY_API_KEY",
    });

    if (!apiKey) {
      throw new Error("Perplexity API key is not configured. Add it in Settings.");
    }

    const openai = createOpenAI({
      baseURL: `${PERPLEXITY_BASE_URL}`,
      apiKey,
    });

    return openai(options.model);
  }
}
