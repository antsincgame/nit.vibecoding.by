import type { LanguageModelV1 } from "ai";

export type ModelInfo = {
  name: string;
  label: string;
  provider: string;
  maxTokenAllowed: number;
  maxCompletionTokens?: number;
};

export type ProviderConfig = {
  baseUrlKey?: string;
  baseUrl?: string;
  apiTokenKey?: string;
};

export type GetModelOptions = {
  model: string;
  serverEnv?: Record<string, string>;
  apiKeys?: Record<string, string>;
  providerSettings?: Record<string, IProviderSetting>;
};

export type IProviderSetting = {
  enabled?: boolean;
  baseUrl?: string;
};

export interface ProviderInfo {
  name: string;
  staticModels: ModelInfo[];
  config: ProviderConfig;
  getModelInstance(options: GetModelOptions): LanguageModelV1;
  getDynamicModels?(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv?: Record<string, string>,
  ): Promise<ModelInfo[]>;
}
