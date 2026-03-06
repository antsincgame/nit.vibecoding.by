import type { BaseProvider } from "./base-provider";
import { OllamaProvider } from "./providers/ollama";
import { LMStudioProvider } from "./providers/lmstudio";
import { OpenAILikeProvider } from "./providers/openai-like";
import { PerplexityProvider } from "./providers/perplexity";

export function createProviderRegistry(): BaseProvider[] {
  return [
    new OllamaProvider(),
    new LMStudioProvider(),
    new OpenAILikeProvider(),
    new PerplexityProvider(),
  ];
}
