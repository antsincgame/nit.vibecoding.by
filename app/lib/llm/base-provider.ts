import type {
  ModelInfo,
  ProviderConfig,
  ProviderInfo,
  GetModelOptions,
  IProviderSetting,
} from "./types";
import type { LanguageModelV1 } from "ai";

export abstract class BaseProvider implements ProviderInfo {
  abstract name: string;
  abstract staticModels: ModelInfo[];
  abstract config: ProviderConfig;

  abstract getModelInstance(options: GetModelOptions): LanguageModelV1;

  getDynamicModels?(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv?: Record<string, string>,
  ): Promise<ModelInfo[]>;

  getProviderBaseUrlAndKey(options: {
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
    serverEnv?: Record<string, string>;
    defaultBaseUrlKey?: string;
    defaultApiTokenKey?: string;
  }): { baseUrl: string; apiKey: string } {
    const { config } = this;
    const { apiKeys, providerSettings, serverEnv } = options;

    const settingsBaseUrl = providerSettings?.[this.name]?.baseUrl;
    const envBaseUrl = config.baseUrlKey ? serverEnv?.[config.baseUrlKey] : undefined;
    const baseUrl = settingsBaseUrl ?? envBaseUrl ?? config.baseUrl ?? "";

    const envApiKey = config.apiTokenKey ? serverEnv?.[config.apiTokenKey] : undefined;
    const cookieApiKey = config.apiTokenKey ? apiKeys?.[config.apiTokenKey] : undefined;
    const apiKey = cookieApiKey ?? envApiKey ?? "";

    return { baseUrl, apiKey };
  }
}
