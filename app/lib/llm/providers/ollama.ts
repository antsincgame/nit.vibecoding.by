import { createOllama } from "ollama-ai-provider";
import { BaseProvider } from "../base-provider";
import type { ModelInfo, GetModelOptions, IProviderSetting } from "../types";
import { logger } from "~/lib/utils/logger";

export class OllamaProvider extends BaseProvider {
  name = "Ollama";
  staticModels: ModelInfo[] = [];
  config = { baseUrlKey: "OLLAMA_BASE_URL" };

  async getDynamicModels(
    _apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv?: Record<string, string>,
  ): Promise<ModelInfo[]> {
    const baseUrl =
      settings?.baseUrl ??
      serverEnv?.OLLAMA_BASE_URL ??
      "http://localhost:11434";

    try {
      const response = await fetch(`${baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) return [];

      const data = (await response.json()) as {
        models: Array<{ name: string; details?: { parameter_size?: string } }>;
      };

      return data.models.map((m) => ({
        name: m.name,
        label: `${m.name} ${m.details?.parameter_size ?? ""}`.trim(),
        provider: this.name,
        maxTokenAllowed: 8192,
      }));
    } catch (err) {
      logger.warn("Ollama", "Model discovery failed", err);
      return [];
    }
  }

  getModelInstance(options: GetModelOptions) {
    const { baseUrl } = this.getProviderBaseUrlAndKey({
      ...options,
      defaultBaseUrlKey: "OLLAMA_BASE_URL",
    });

    const effectiveBaseUrl = baseUrl || "http://localhost:11434";
    const provider = createOllama({ baseURL: `${effectiveBaseUrl}/api` });

    return provider(options.model, { numCtx: 32768 });
  }
}
