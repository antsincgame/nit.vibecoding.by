/**
 * Agent Router — uses a local LLM to pick the right role for a user message.
 *
 * Uses the existing LLMManager + Vercel AI SDK generateText (non-streaming).
 */

import type { AgentRole, AgentMemory } from "@shared/types/agentRole";
import { LLMManager } from "~/lib/llm/manager";
import { generateText } from "ai";
import { logger } from "~/lib/utils/logger";

const ROUTER_PROVIDER_DEFAULT = process.env.ROUTER_PROVIDER_ID ?? "ollama";
const ROUTER_MODEL_DEFAULT = process.env.ROUTER_MODEL_NAME ?? "mistral";

function buildRouterPrompt(
  roles: AgentRole[],
  memory: AgentMemory,
  userMessage: string,
): string {
  const agentList = roles.map((r) => `- ${r.name}: ${r.description}`).join("\n");

  const lastSteps =
    memory.steps.length > 0
      ? memory.steps
          .slice(-2)
          .map((s) => `[${s.agentName}]: ${s.output.slice(0, 200)}...`)
          .join("\n")
      : "Нет предыдущих шагов.";

  return `Ты роутер агентов веб-студии. Выбери одного агента для обработки запроса.

Доступные агенты:
${agentList}

Последние действия:
${lastSteps}

Запрос: "${userMessage}"

Правила:
- Ответь ТОЛЬКО именем одного агента.
- Никаких пояснений, только имя.
- Структура/дизайн/навигация/UX → Архитектор
- Текст/контент/SEO-текст → Копирайтер
- Генерация кода/создание сайта/вёрстка/программирование → Кодер
- Баги/проверка/тестирование/ревью → Тестировщик

Агент:`;
}

function parseRouterResponse(text: string, roles: AgentRole[]): AgentRole {
  const cleaned = text.trim().toLowerCase();

  // 1. Exact match
  for (const role of roles) {
    if (cleaned === role.name.toLowerCase()) {
      return role;
    }
  }

  // 2. Substring match
  for (const role of roles) {
    if (cleaned.includes(role.name.toLowerCase())) {
      return role;
    }
  }

  // 3. Fallback: first role (lowest order = Architect)
  logger.warn("agentRouter", `Could not parse router response: "${text}", falling back to first role`);
  return roles[0]!;
}

export type RouterOptions = {
  providerId?: string;
  modelName?: string;
};

export async function routeToAgent(
  roles: AgentRole[],
  memory: AgentMemory,
  userMessage: string,
  options?: RouterOptions,
): Promise<AgentRole> {
  if (roles.length === 0) {
    throw new Error("No roles available for routing");
  }

  if (roles.length === 1) {
    return roles[0]!;
  }

  const providerId = options?.providerId ?? ROUTER_PROVIDER_DEFAULT;
  const modelName = options?.modelName ?? ROUTER_MODEL_DEFAULT;

  try {
    const manager = LLMManager.getInstance(process.env as Record<string, string>);
    const provider = manager.getProvider(providerId);

    if (!provider) {
      logger.warn("agentRouter", `Router provider "${providerId}" not found, falling back to first role`);
      return roles[0]!;
    }

    const modelInstance = provider.getModelInstance({
      model: modelName,
      serverEnv: process.env as Record<string, string>,
    });

    const prompt = buildRouterPrompt(roles, memory, userMessage);

    const { text } = await generateText({
      model: modelInstance,
      prompt,
      maxTokens: 50,
      temperature: 0.1,
    });

    const selected = parseRouterResponse(text, roles);
    logger.info("agentRouter", `Routed to: ${selected.name} (raw: "${text.trim()}")`);
    return selected;
  } catch (err) {
    logger.error("agentRouter", "Router LLM failed, falling back to first role", err);
    return roles[0]!;
  }
}
