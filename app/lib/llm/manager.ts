import type { BaseProvider } from "./base-provider";
import type { ModelInfo, IProviderSetting } from "./types";
import { createProviderRegistry } from "./registry";

let instance: LLMManager | null = null;

export class LLMManager {
  private providers: Map<string, BaseProvider>;
  private modelList: ModelInfo[] = [];
  private env: Record<string, string>;

  private constructor(env: Record<string, string> = {}) {
    this.env = env;
    this.providers = new Map();

    for (const provider of createProviderRegistry()) {
      this.providers.set(provider.name, provider);
    }
  }

  static getInstance(env?: Record<string, string>): LLMManager {
    if (!instance) {
      instance = new LLMManager(env);
    }
    return instance;
  }

  static resetInstance(): void {
    instance = null;
  }

  getProvider(name: string): BaseProvider | undefined {
    return this.providers.get(name);
  }

  getAllProviders(): BaseProvider[] {
    return Array.from(this.providers.values());
  }

  getModelList(): ModelInfo[] {
    return this.modelList;
  }

  async updateModelList(options: {
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
    serverEnv?: Record<string, string>;
  }): Promise<ModelInfo[]> {
    const { apiKeys, providerSettings, serverEnv } = options;
    const allModels: ModelInfo[] = [];

    const providers = this.getAllProviders();

    const results = await Promise.allSettled(
      providers
        .filter((p) => {
          const settings = providerSettings?.[p.name];
          return settings?.enabled !== false;
        })
        .map(async (provider) => {
          const models: ModelInfo[] = [...provider.staticModels];
          const settings = providerSettings?.[provider.name];

          if (provider.getDynamicModels) {
            const dynamic = await provider.getDynamicModels(apiKeys, settings, serverEnv);
            models.push(...dynamic);
          }

          return models;
        }),
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        allModels.push(...result.value);
      }
    }

    this.modelList = allModels;
    return allModels;
  }
}
