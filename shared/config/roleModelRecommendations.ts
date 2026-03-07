/**
 * Рекомендации моделей по ролям.
 * Модели получаются динамически из Ollama и LM Studio (API /api/tags и /v1/models).
 * Матчинг по ключевым словам в имени модели.
 */

export const ROLE_IDS = [
  "role_analyst",
  "role_architect",
  "role_designer",
  "role_copywriter",
  "role_coder",
  "role_tester",
] as const;

export type RoleId = (typeof ROLE_IDS)[number];

const CODER_ROLE_IDS: RoleId[] = ["role_coder", "role_tester"];
const CODER_KEYWORDS = ["coder", "code", "deepseek", "qwen2.5-coder", "codellama"];
const GENERAL_KEYWORDS = ["mistral", "llama", "qwen", "mixtral", "phi"];

function isCoderModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return CODER_KEYWORDS.some((kw) => lower.includes(kw));
}

function isGeneralModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return GENERAL_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Строит рекомендации по ролям из списка доступных моделей.
 * Для coder/tester — приоритет моделям с coder/code/deepseek.
 * Для остальных — приоритет общим моделям (mistral, llama, qwen).
 */
export function getRoleModelRecommendations(
  availableModels: string[],
): Record<RoleId, string[]> {
  const coderModels = availableModels.filter(isCoderModel);
  const generalModels = availableModels.filter(isGeneralModel);
  const otherModels = availableModels.filter(
    (m) => !isCoderModel(m) && !isGeneralModel(m),
  );

  const coderList = [...coderModels, ...generalModels, ...otherModels];
  const generalList = [...generalModels, ...coderModels, ...otherModels];

  const map: Record<RoleId, string[]> = {} as Record<RoleId, string[]>;
  for (const roleId of ROLE_IDS) {
    map[roleId] = CODER_ROLE_IDS.includes(roleId) ? coderList : generalList;
  }
  return map;
}

/** Для обратной совместимости — пустой объект, рекомендации строятся через getRoleModelRecommendations(availableModels). */
export const ROLE_MODEL_RECOMMENDATIONS: Record<RoleId, string[]> = (() => {
  const map: Record<RoleId, string[]> = {} as Record<RoleId, string[]>;
  for (const roleId of ROLE_IDS) {
    map[roleId] = [];
  }
  return map;
})();

/**
 * Выбирает модель для роли из списка доступных.
 * Приоритет: по ключевым словам (coder/code для coder/tester), иначе defaultModel, иначе первая доступная.
 */
export function pickModelForRole(
  roleId: RoleId,
  availableModels: string[],
  defaultModel?: string,
): string | null {
  if (availableModels.length === 0) return null;

  const recommendations = getRoleModelRecommendations(availableModels);
  const recommended = recommendations[roleId] ?? [];

  for (const modelId of recommended) {
    if (availableModels.includes(modelId)) return modelId;
  }

  if (defaultModel && availableModels.includes(defaultModel)) {
    return defaultModel;
  }

  return availableModels[0] ?? null;
}

const DISCOVERY_TIMEOUT = 5000;

async function fetchModelsFromOllama(baseUrl: string): Promise<string[]> {
  try {
    const url = `${baseUrl}/api/tags`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT),
    });
    if (!response.ok) return [];

    const data = (await response.json()) as {
      models?: Array<{ name: string }>;
    };
    return (data.models ?? []).map((m) => m.name);
  } catch {
    return [];
  }
}

async function fetchModelsFromLMStudio(baseUrl: string): Promise<string[]> {
  try {
    const url = `${baseUrl}/v1/models`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT),
    });
    if (!response.ok) return [];

    const data = (await response.json()) as {
      data?: Array<{ id: string }>;
    };
    return (data.data ?? []).map((m) => m.id);
  } catch {
    return [];
  }
}

/**
 * Получает список моделей из Ollama и LM Studio по URL из env.
 */
export async function discoverModelsFromServers(env: {
  ollamaUrl?: string;
  lmStudioUrl?: string;
}): Promise<string[]> {
  const [ollamaModels, lmStudioModels] = await Promise.all([
    fetchModelsFromOllama(env.ollamaUrl ?? "http://localhost:11434"),
    fetchModelsFromLMStudio(env.lmStudioUrl ?? "http://localhost:1234"),
  ]);

  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of [...ollamaModels, ...lmStudioModels]) {
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}
