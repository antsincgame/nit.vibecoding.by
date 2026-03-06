import type { AIAgent } from "@shared/types/agent";

export const PERPLEXITY_AGENT: AIAgent = {
  id: "perplexity",
  name: "Perplexity",
  type: "perplexity",
  url: "https://api.perplexity.ai",
  status: "online",
  models: [
    { id: "sonar", name: "Sonar", contextLength: 128_000 },
    { id: "sonar-pro", name: "Sonar Pro", contextLength: 200_000 },
    { id: "sonar-reasoning", name: "Sonar Reasoning", contextLength: 128_000 },
  ],
};
