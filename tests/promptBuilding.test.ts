import { describe, it, expect, vi } from "vitest";

vi.mock("~/lib/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("~/lib/server/llm/prompts", () => ({
  buildSystemPrompt: vi.fn(() => "MOCK"),
}));
vi.mock("~/lib/llm/manager", () => ({
  LLMManager: { getInstance: vi.fn(() => ({ getProvider: vi.fn(() => null), getAllProviders: vi.fn(() => []) })) },
}));
vi.mock("ai", () => ({ streamText: vi.fn() }));
vi.mock("~/lib/services/pipelineLogger", () => ({ logPipelineStep: vi.fn(async () => {}) }));
vi.mock("~/lib/services/agentRouter", () => ({ routeToAgent: vi.fn() }));

const SEED_ROLES = [
  { id: "role_analyst", name: "Аналитик", description: "Уточнение требований", systemPrompt: "Ты Аналитик.", providerId: "ollama", modelName: "mistral", order: 1, isActive: true, isLocked: false, timeoutMs: 60000, maxRetries: 2, outputFormat: "freetext" as const, includeNitPrompt: false, temperature: 0.4, createdAt: "2025-01-01", updatedAt: "2025-01-01" },
  { id: "role_architect", name: "Архитектор", description: "Создаёт структуру, навигацию, UX, цвета", systemPrompt: "Ты Архитектор веб-студии. Твоя задача — создать структуру проекта на основе запроса пользователя.", providerId: "ollama", modelName: "mistral", order: 2, isActive: true, isLocked: true, timeoutMs: 60000, maxRetries: 2, outputFormat: "json" as const, includeNitPrompt: false, temperature: 0.3, createdAt: "2025-01-01", updatedAt: "2025-01-01" },
  { id: "role_designer", name: "Дизайнер", description: "Визуальный стиль", systemPrompt: "Ты Дизайнер.", providerId: "ollama", modelName: "mistral", order: 3, isActive: true, isLocked: false, timeoutMs: 60000, maxRetries: 2, outputFormat: "freetext" as const, includeNitPrompt: false, temperature: 0.5, createdAt: "2025-01-01", updatedAt: "2025-01-01" },
  { id: "role_copywriter", name: "Копирайтер", description: "Наполняет страницы текстовым контентом", systemPrompt: "Ты Копирайтер веб-студии. Ты получаешь структуру сайта от Архитектора и наполняешь её контентом.", providerId: "ollama", modelName: "mistral", order: 4, isActive: true, isLocked: false, timeoutMs: 60000, maxRetries: 2, outputFormat: "freetext" as const, includeNitPrompt: false, temperature: 0.7, createdAt: "2025-01-01", updatedAt: "2025-01-01" },
  { id: "role_coder", name: "Кодер", description: "Генерирует HTML/CSS/JS код", systemPrompt: "Ты Кодер веб-студии. Получаешь структуру от Архитектора и контент от Копирайтера и генерируешь код.", providerId: "ollama", modelName: "mistral", order: 5, isActive: true, isLocked: false, timeoutMs: 60000, maxRetries: 2, outputFormat: "freetext" as const, includeNitPrompt: true, temperature: 0.3, createdAt: "2025-01-01", updatedAt: "2025-01-01" },
  { id: "role_tester", name: "Тестировщик", description: "Проверяет код на ошибки", systemPrompt: "Ты Тестировщик веб-студии. Проверяешь сгенерированный код на ошибки, доступность и производительность.", providerId: "ollama", modelName: "mistral", order: 6, isActive: true, isLocked: false, timeoutMs: 60000, maxRetries: 2, outputFormat: "freetext" as const, includeNitPrompt: false, temperature: 0.2, createdAt: "2025-01-01", updatedAt: "2025-01-01" },
];

vi.mock("~/lib/services/roleService", () => ({
  getAllRoles: vi.fn(async (activeOnly = false) => activeOnly ? SEED_ROLES.filter(r => r.isActive) : [...SEED_ROLES]),
  getRoleById: vi.fn(async (id: string) => SEED_ROLES.find(r => r.id === id) ?? null),
  getLockedRole: vi.fn(async () => SEED_ROLES.find(r => r.isLocked) ?? null),
  createRole: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
  reorderRoles: vi.fn(),
  getPromptHistory: vi.fn(async () => []),
}));

import { buildAgentPrompt, getOrCreateSession } from "~/lib/services/agentPipeline";
import { getAllRoles } from "~/lib/services/roleService";

describe("buildAgentPrompt", () => {
  it("builds correct system prompt with role only (no NIT prompt for seed roles)", async () => {
    const roles = await getAllRoles(true);
    const role = roles[1]!;
    const memory = getOrCreateSession(`prompt-test-${Date.now()}`, "p1");

    const { system, user } = buildAgentPrompt(role, memory, "Создай лендинг", "", "react");

    expect(system).not.toContain("MOCK");
    expect(system).toContain("РОЛЬ: Архитектор");
    expect(system).toContain(role.systemPrompt);
    expect(user).toContain("ЗАПРОС ПОЛЬЗОВАТЕЛЯ");
    expect(user).toContain("Создай лендинг");
    expect(user).not.toContain("КОНТЕКСТ ОТ ПРЕДЫДУЩИХ");
    expect(user).not.toContain("ДОПОЛНИТЕЛЬНЫЙ КОНТЕКСТ");
  });

  it("includes previous agent context", async () => {
    const roles = await getAllRoles(true);
    const role = roles[1]!;
    const memory = getOrCreateSession(`prompt-ctx-${Date.now()}`, "p1");
    memory.steps.push({
      order: 1, agentName: "Архитектор", agentRoleId: "role_architect",
      input: "", output: '{"project_name":"Test","pages":[]}', modelUsed: "mistral",
      providerId: "ollama", durationMs: 1000, selectedBy: "hardcoded",
      status: "success", timestamp: "2025-01-01T00:00:00Z",
    });

    const { user } = buildAgentPrompt(role, memory, "Напиши текст", "", "react");

    expect(user).toContain("КОНТЕКСТ ОТ ПРЕДЫДУЩИХ АГЕНТОВ");
    expect(user).toContain("[Архитектор");
    expect(user).toContain("project_name");
  });

  it("includes local context", async () => {
    const roles = await getAllRoles(true);
    const role = roles[0]!;
    const memory = getOrCreateSession(`prompt-local-${Date.now()}`, "p1");

    const { user } = buildAgentPrompt(role, memory, "Сайт", "Стиль: минимализм", "react");
    expect(user).toContain("ДОПОЛНИТЕЛЬНЫЙ КОНТЕКСТ");
    expect(user).toContain("минимализм");
  });

  it("skips empty local context", async () => {
    const roles = await getAllRoles(true);
    const role = roles[0]!;
    const memory = getOrCreateSession(`prompt-empty-${Date.now()}`, "p1");

    const { user } = buildAgentPrompt(role, memory, "Сайт", "   ", "react");
    expect(user).not.toContain("ДОПОЛНИТЕЛЬНЫЙ КОНТЕКСТ");
  });

  it("includes multiple agent contexts in chain", async () => {
    const roles = await getAllRoles(true);
    const role = roles[2]!;
    const memory = getOrCreateSession(`prompt-chain-${Date.now()}`, "p1");
    memory.steps.push(
      {
        order: 1, agentName: "Архитектор", agentRoleId: "r1", input: "", output: "Структура сайта",
        modelUsed: "m", providerId: "p", durationMs: 0, selectedBy: "hardcoded", status: "success", timestamp: "t1",
      },
      {
        order: 2, agentName: "Копирайтер", agentRoleId: "r2", input: "", output: "Контент страниц",
        modelUsed: "m", providerId: "p", durationMs: 0, selectedBy: "user", status: "success", timestamp: "t2",
      },
    );

    const { user } = buildAgentPrompt(role, memory, "Проверь", "", "react");
    expect(user).toContain("[Архитектор");
    expect(user).toContain("[Копирайтер");
    expect(user).toContain("Структура сайта");
    expect(user).toContain("Контент страниц");
    expect(user).toContain("---");
  });

  it("includes NIT prompt when includeNitPrompt is true", async () => {
    const roles = await getAllRoles(true);
    const role = { ...roles[4]!, includeNitPrompt: true };
    const memory = getOrCreateSession(`prompt-nit-${Date.now()}`, "p1");

    const { system } = buildAgentPrompt(role, memory, "Создай сайт", "", "react");

    expect(system).toContain("MOCK");
    expect(system).toContain("РОЛЬ АГЕНТА: Кодер");
  });
});
