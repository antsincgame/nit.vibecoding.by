import type { AIAgent, AIModel } from "@shared/types/agent";

const DISCOVERY_TIMEOUT = 5000;

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
}

// Ollama sets num_ctx to 2048 by default; our provider overrides to 32768.
const OLLAMA_DEFAULT_CTX = 32768;
// LM Studio doesn't report context_length; modern models support 32K+ minimum.
const LMSTUDIO_DEFAULT_CTX = 32768;

async function discoverOllama(baseUrl: string): Promise<AIAgent | null> {
  try {
    const response = await fetchWithTimeout(`${baseUrl}/api/tags`, DISCOVERY_TIMEOUT);
    if (!response.ok) return null;

    const data = (await response.json()) as {
      models: Array<{ name: string; details?: { parameter_size?: string } }>;
    };

    const models: AIModel[] = data.models.map((m) => ({
      id: m.name,
      name: m.name,
      parameterSize: m.details?.parameter_size,
      contextLength: OLLAMA_DEFAULT_CTX,
    }));

    return {
      id: "ollama",
      name: "Ollama",
      type: "ollama",
      url: baseUrl,
      status: "online",
      models,
      lastChecked: Date.now(),
    };
  } catch {
    return {
      id: "ollama",
      name: "Ollama",
      type: "ollama",
      url: baseUrl,
      status: "offline",
      models: [],
      lastChecked: Date.now(),
    };
  }
}

async function discoverLMStudio(baseUrl: string): Promise<AIAgent | null> {
  try {
    const response = await fetchWithTimeout(`${baseUrl}/v1/models`, DISCOVERY_TIMEOUT);
    if (!response.ok) return null;

    const data = (await response.json()) as {
      data: Array<{
        id: string;
        context_length?: number;
        max_context_length?: number;
      }>;
    };

    const models: AIModel[] = data.data.map((m) => ({
      id: m.id,
      name: m.id,
      contextLength: m.context_length ?? m.max_context_length ?? LMSTUDIO_DEFAULT_CTX,
    }));

    return {
      id: "lm-studio",
      name: "LM Studio",
      type: "lm_studio",
      url: baseUrl,
      status: "online",
      models,
      lastChecked: Date.now(),
    };
  } catch {
    return {
      id: "lm-studio",
      name: "LM Studio",
      type: "lm_studio",
      url: baseUrl,
      status: "offline",
      models: [],
      lastChecked: Date.now(),
    };
  }
}

async function discoverCustom(baseUrl: string, name: string, apiKey: string): Promise<AIAgent | null> {
  if (!baseUrl) return null;

  try {
    const headers: Record<string, string> = {};
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const response = await fetch(`${baseUrl}/v1/models`, {
      headers,
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      data: Array<{ id: string }>;
    };

    const models: AIModel[] = data.data.map((m) => ({
      id: m.id,
      name: m.id,
    }));

    return {
      id: "custom",
      name: name || "Custom LLM",
      type: "openai_compatible",
      url: baseUrl,
      status: "online",
      models,
      lastChecked: Date.now(),
    };
  } catch {
    return {
      id: "custom",
      name: name || "Custom LLM",
      type: "openai_compatible",
      url: baseUrl,
      status: "offline",
      models: [],
      lastChecked: Date.now(),
    };
  }
}

export async function discoverAgents(env: {
  ollamaUrl?: string;
  lmStudioUrl?: string;
  customUrl?: string;
  customName?: string;
  customApiKey?: string;
}): Promise<AIAgent[]> {
  const discoveries = await Promise.allSettled([
    discoverOllama(env.ollamaUrl ?? "http://localhost:11434"),
    discoverLMStudio(env.lmStudioUrl ?? "http://localhost:1234"),
    discoverCustom(env.customUrl ?? "", env.customName ?? "", env.customApiKey ?? ""),
  ]);

  const agents: AIAgent[] = [];

  for (const result of discoveries) {
    if (result.status === "fulfilled" && result.value) {
      agents.push(result.value);
    }
  }

  return agents;
}
