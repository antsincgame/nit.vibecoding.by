import { describe, it, expect, vi } from "vitest";

vi.mock("~/lib/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("~/lib/server/llm/prompts", () => ({
  buildSystemPrompt: vi.fn(() => "MOCK_SYSTEM_PROMPT"),
}));
vi.mock("~/lib/llm/manager", () => ({
  LLMManager: {
    getInstance: vi.fn(() => ({
      getProvider: vi.fn(() => null),
    })),
  },
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

import {
  getOrCreateSession,
  getSession,
  selectRole,
  buildAgentPrompt,
} from "~/lib/services/agentPipeline";
import { getAllRoles } from "~/lib/services/roleService";
import { routeToAgent } from "~/lib/services/agentRouter";

describe("agentPipeline", () => {
  describe("getOrCreateSession", () => {
    it("creates a new session", () => {
      const session = getOrCreateSession("test-session-1", "project-1");
      expect(session.sessionId).toBe("test-session-1");
      expect(session.projectId).toBe("project-1");
      expect(session.steps).toEqual([]);
      expect(session.createdAt).toBeTruthy();
    });

    it("returns existing session", () => {
      const s1 = getOrCreateSession("test-session-2", "project-1");
      s1.steps.push({
        order: 1, agentName: "test", agentRoleId: "r1", input: "in", output: "out",
        modelUsed: "m", providerId: "p", durationMs: 100, selectedBy: "user",
        status: "success", timestamp: new Date().toISOString(),
      });
      const s2 = getOrCreateSession("test-session-2", "project-1");
      expect(s2.steps.length).toBe(1);
      expect(s2.steps[0]!.agentName).toBe("test");
    });
  });

  describe("getSession", () => {
    it("returns undefined for non-existent session", () => {
      expect(getSession("nonexistent-session")).toBeUndefined();
    });
  });

  describe("selectRole", () => {
    it("selects architect for new session (hardcoded)", async () => {
      const sessionId = `new-session-${Date.now()}`;
      const { role, selectedBy } = await selectRole(sessionId, "", "hello");
      expect(role.isLocked).toBe(true);
      expect(role.name).toBe("Архитектор");
      expect(selectedBy).toBe("hardcoded");
    });

    it("uses user-selected role for existing session", async () => {
      const sessionId = `existing-session-${Date.now()}`;
      const session = getOrCreateSession(sessionId, "proj-1");
      session.steps.push({
        order: 1, agentName: "Архитектор", agentRoleId: "role_architect",
        input: "test", output: "result", modelUsed: "mistral", providerId: "ollama",
        durationMs: 1000, selectedBy: "hardcoded", status: "success",
        timestamp: new Date().toISOString(),
      });

      const { role, selectedBy } = await selectRole(sessionId, "role_copywriter", "write text");
      expect(role.name).toBe("Копирайтер");
      expect(selectedBy).toBe("user");
    });

    it("falls back to router for auto selection", async () => {
      const sessionId = `auto-session-${Date.now()}`;
      const session = getOrCreateSession(sessionId, "proj-1");
      session.steps.push({
        order: 1, agentName: "Архитектор", agentRoleId: "role_architect",
        input: "test", output: "result", modelUsed: "mistral", providerId: "ollama",
        durationMs: 1000, selectedBy: "hardcoded", status: "success",
        timestamp: new Date().toISOString(),
      });

      const roles = await getAllRoles(true);
      vi.mocked(routeToAgent).mockResolvedValueOnce(roles[1]!);

      const { selectedBy } = await selectRole(sessionId, "__auto__", "напиши текст");
      expect(selectedBy).toBe("router_llm");
    });

    it("respects forceRole on new session (bypasses Architect lock)", async () => {
      const sessionId = `force-session-${Date.now()}`;
      getOrCreateSession(sessionId, "proj-1");

      const { role, selectedBy } = await selectRole(sessionId, "role_copywriter", "test", true);
      expect(role.name).toBe("Копирайтер");
      expect(selectedBy).toBe("user");
    });

    it("forceRole false still forces Architect on new session", async () => {
      const sessionId = `no-force-session-${Date.now()}`;
      getOrCreateSession(sessionId, "proj-1");

      const { role, selectedBy } = await selectRole(sessionId, "role_copywriter", "test", false);
      expect(role.name).toBe("Архитектор");
      expect(selectedBy).toBe("hardcoded");
    });
  });

  describe("buildAgentPrompt", () => {
    it("builds prompt with role and no previous context", async () => {
      const roles = await getAllRoles(true);
      const role = roles.find((r) => r.name === "Архитектор")!;
      const memory = getOrCreateSession("build-test-1", "proj-1");

      const { system, user } = buildAgentPrompt(role, memory, "Создай лендинг", "", "react");

      expect(system).not.toContain("MOCK_SYSTEM_PROMPT");
      expect(system).toContain(`РОЛЬ: ${role.name}`);
      expect(system).toContain(role.systemPrompt);
      expect(user).toContain("ЗАПРОС ПОЛЬЗОВАТЕЛЯ");
      expect(user).toContain("Создай лендинг");
      expect(user).not.toContain("КОНТЕКСТ ОТ ПРЕДЫДУЩИХ");
    });

    it("includes previous agent context", async () => {
      const roles = await getAllRoles(true);
      const role = roles[1]!;
      const memory = getOrCreateSession("build-test-2", "proj-1");
      memory.steps.push({
        order: 1, agentName: "Архитектор", agentRoleId: "role_architect",
        input: "", output: '{"pages": []}', modelUsed: "mistral", providerId: "ollama",
        durationMs: 1000, selectedBy: "hardcoded", status: "success",
        timestamp: "2025-01-01T00:00:00Z",
      });

      const { user } = buildAgentPrompt(role, memory, "Напиши контент", "", "react");

      expect(user).toContain("КОНТЕКСТ ОТ ПРЕДЫДУЩИХ АГЕНТОВ");
      expect(user).toContain("[Архитектор");
      expect(user).toContain('{"pages": []}');
    });

    it("includes local context when provided", async () => {
      const roles = await getAllRoles(true);
      const role = roles[0]!;
      const memory = getOrCreateSession("build-test-3", "proj-1");

      const { user } = buildAgentPrompt(role, memory, "Создай сайт", "Стиль: минимализм, цвета: чёрный и белый", "react");

      expect(user).toContain("ДОПОЛНИТЕЛЬНЫЙ КОНТЕКСТ");
      expect(user).toContain("минимализм");
    });
  });
});
