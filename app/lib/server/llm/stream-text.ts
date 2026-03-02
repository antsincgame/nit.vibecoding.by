import { streamText as aiStreamText, type Message, convertToCoreMessages } from "ai";
import { LLMManager } from "~/lib/llm/manager";
import { buildSystemPrompt, buildCompactSystemPrompt } from "./prompts";
import {
  estimateMessagesTokens,
  computeTokenBudget,
  type TokenBudget,
} from "~/lib/utils/tokenEstimator";
import { logger } from "~/lib/utils/logger";

const DEFAULT_CONTEXT_WINDOW = 8192;
const COMPACT_PROMPT_THRESHOLD = 16384;

export type StreamTextParams = {
  messages: Message[];
  provider: string;
  model: string;
  projectType?: string;
  temperature?: number;
  maxTokens?: number;
  contextWindow?: number;
  serverEnv?: Record<string, string>;
  apiKeys?: Record<string, string>;
  providerSettings?: Record<string, { enabled?: boolean; baseUrl?: string }>;
  abortSignal?: AbortSignal;
};

export type StreamTextResult = {
  stream: ReturnType<typeof aiStreamText>;
  tokenBudget: TokenBudget;
};

export async function streamText(params: StreamTextParams): Promise<StreamTextResult> {
  const {
    messages,
    provider: providerName,
    model: modelName,
    projectType = "react",
    temperature = 0.3,
    maxTokens = 8192,
    contextWindow = DEFAULT_CONTEXT_WINDOW,
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

  const useCompact = contextWindow < COMPACT_PROMPT_THRESHOLD;
  const systemPrompt = useCompact
    ? buildCompactSystemPrompt(projectType)
    : buildSystemPrompt(projectType);

  const inputEstimate = estimateMessagesTokens(messages, systemPrompt);
  const tokenBudget = computeTokenBudget(inputEstimate, contextWindow, maxTokens);

  logger.info("stream-text", "Token budget", {
    contextWindow,
    inputEstimate,
    requestedMaxTokens: maxTokens,
    effectiveMaxTokens: tokenBudget.effectiveMaxTokens,
    overflow: tokenBudget.overflow,
    compactPrompt: useCompact,
  });

  if (tokenBudget.overflow) {
    logger.warn("stream-text", `Context overflow: input ${inputEstimate} + safety 256 > context ${contextWindow}. Capping output to minimum.`);
  }

  const stream = aiStreamText({
    model: modelInstance,
    system: systemPrompt,
    messages: convertToCoreMessages(messages),
    temperature,
    maxTokens: tokenBudget.effectiveMaxTokens,
    abortSignal,
  });

  return { stream, tokenBudget };
}
