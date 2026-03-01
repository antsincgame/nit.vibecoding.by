import { createOpenAI } from "@ai-sdk/openai";
import { BaseProvider } from "../base-provider";
import type { ModelInfo, GetModelOptions, IProviderSetting } from "../types";
import { logger } from "~/lib/utils/logger";

export class OpenAILikeProvider extends BaseProvider {
  name = "OpenAILike";
  staticModels: ModelInfo[] = [];
  config = {
    baseUrlKey: "CUSTOM_LLM_URL",
    apiTokenKey: "CUSTOM_LLM_API_KEY",
  };

  async getDynamicModels(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv?: Record<string, string>,
  ): Promise<ModelInfo[]> {
    const baseUrl =
      settings?.baseUrl ?? serverEnv?.CUSTOM_LLM_URL ?? "";

    if (!baseUrl) return [];

    try {
      const apiKey = apiKeys?.CUSTOM_LLM_API_KEY ?? serverEnv?.CUSTOM_LLM_API_KEY ?? "";
      const headers: Record<string, string> = {};

      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      const response = await fetch(`${baseUrl}/v1/models`, {
        headers,
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
      logger.warn("OpenAILike", "Model discovery failed", err);
      return [];
    }
  }

  getModelInstance(options: GetModelOptions) {
    const { baseUrl, apiKey } = this.getProviderBaseUrlAndKey(options);

    if (!baseUrl) {
      throw new Error("Custom LLM base URL is not configured");
    }

    const openai = createOpenAI({
      baseURL: `${baseUrl}/v1`,
      apiKey: apiKey || "no-key",
    });

    return openai(options.model);
  }
}
