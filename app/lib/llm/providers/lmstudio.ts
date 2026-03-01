import { createOpenAI } from "@ai-sdk/openai";
import { BaseProvider } from "../base-provider";
import type { ModelInfo, GetModelOptions, IProviderSetting } from "../types";
import { logger } from "~/lib/utils/logger";

export class LMStudioProvider extends BaseProvider {
  name = "LMStudio";
  staticModels: ModelInfo[] = [];
  config = {
    baseUrlKey: "LMSTUDIO_BASE_URL",
    baseUrl: "http://localhost:1234",
  };

  async getDynamicModels(
    _apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv?: Record<string, string>,
  ): Promise<ModelInfo[]> {
    const baseUrl =
      settings?.baseUrl ??
      serverEnv?.LMSTUDIO_BASE_URL ??
      "http://localhost:1234";

    try {
      const response = await fetch(`${baseUrl}/v1/models`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) return [];

      const data = (await response.json()) as {
        data: Array<{ id: string }>;
      };

      return data.data.map((m) => ({
        name: m.id,
        label: m.id,
        provider: this.name,
        maxTokenAllowed: 8192,
      }));
    } catch (err) {
      logger.warn("LMStudio", "Model discovery failed", err);
      return [];
    }
  }

  getModelInstance(options: GetModelOptions) {
    const { baseUrl } = this.getProviderBaseUrlAndKey({
      ...options,
      defaultBaseUrlKey: "LMSTUDIO_BASE_URL",
    });

    const effectiveBaseUrl = baseUrl || "http://localhost:1234";

    const openai = createOpenAI({
      baseURL: `${effectiveBaseUrl}/v1`,
      apiKey: "lm-studio",
    });

    return openai(options.model);
  }
}
