import { streamText as aiStreamText, type Message, convertToCoreMessages } from "ai";
import { LLMManager } from "~/lib/llm/manager";
import { buildSystemPrompt } from "./prompts";

export type StreamTextParams = {
  messages: Message[];
  provider: string;
  model: string;
  projectType?: string;
  temperature?: number;
  maxTokens?: number;
  serverEnv?: Record<string, string>;
  apiKeys?: Record<string, string>;
  providerSettings?: Record<string, { enabled?: boolean; baseUrl?: string }>;
  abortSignal?: AbortSignal;
};

export async function streamText(params: StreamTextParams) {
  const {
    messages,
    provider: providerName,
    model: modelName,
    projectType = "react",
    temperature = 0.3,
    maxTokens = 16384,
    serverEnv = {},
    apiKeys = {},
    providerSettings = {},
    abortSignal,
  } = params;

  const manager = LLMManager.getInstance(serverEnv);
  const provider = manager.getProvider(providerName);

  if (!provider) {
    throw new Error(`Provider "${providerName}" not found. Available: ${manager.getAllProviders().map((p) => p.name).join(", ")}`);
  }

  const modelInstance = provider.getModelInstance({
    model: modelName,
    serverEnv,
    apiKeys,
    providerSettings,
  });

  const systemPrompt = buildSystemPrompt(projectType);

  return aiStreamText({
    model: modelInstance,
    system: systemPrompt,
    messages: convertToCoreMessages(messages),
    temperature,
    maxTokens,
    abortSignal,
  });
}
