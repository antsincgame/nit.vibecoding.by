import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
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

vi.mock("ai", () => ({
  streamText: vi.fn(),
}));

vi.mock("~/lib/services/pipelineLogger", () => ({
  logPipelineStep: vi.fn(),
}));

vi.mock("~/lib/services/agentRouter", () => ({
  routeToAgent: vi.fn(),
}));

import {
  getOrCreateSession,
  getSession,
  selectRole,
  buildAgentPrompt,
} from "~/lib/services/agentPipeline";

import { getAllRoles, getLockedRole } from "~/lib/services/roleService";
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
        order: 1,
        agentName: "test",
        agentRoleId: "r1",
        input: "in",
        output: "out",
        modelUsed: "m",
        providerId: "p",
        durationMs: 100,
        selectedBy: "user",
        status: "success",
        timestamp: new Date().toISOString(),
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
      // Add a step so it's not new
      session.steps.push({
        order: 1,
        agentName: "Архитектор",
        agentRoleId: "role_architect",
        input: "test",
        output: "result",
        modelUsed: "mistral",
        providerId: "ollama",
        durationMs: 1000,
        selectedBy: "hardcoded",
        status: "success",
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
        order: 1,
        agentName: "Архитектор",
        agentRoleId: "role_architect",
        input: "test",
        output: "result",
        modelUsed: "mistral",
        providerId: "ollama",
        durationMs: 1000,
        selectedBy: "hardcoded",
        status: "success",
        timestamp: new Date().toISOString(),
      });

      const mockRole = getAllRoles(true)[1]!; // Copywriter
      vi.mocked(routeToAgent).mockResolvedValueOnce(mockRole);

      const { role, selectedBy } = await selectRole(sessionId, "__auto__", "напиши текст");
      expect(selectedBy).toBe("router_llm");
    });
  });

  describe("buildAgentPrompt", () => {
    it("builds prompt with role and no previous context", () => {
      const role = getAllRoles(true)[0]!; // Architect
      const memory = getOrCreateSession("build-test-1", "proj-1");

      const { system, user } = buildAgentPrompt(
        role,
        memory,
        "Создай лендинг",
        "",
        "react",
      );

      expect(system).toContain("MOCK_SYSTEM_PROMPT");
      expect(system).toContain("РОЛЬ АГЕНТА: Архитектор");
      expect(system).toContain(role.systemPrompt);
      expect(user).toContain("ЗАПРОС ПОЛЬЗОВАТЕЛЯ");
      expect(user).toContain("Создай лендинг");
      expect(user).not.toContain("КОНТЕКСТ ОТ ПРЕДЫДУЩИХ");
    });

    it("includes previous agent context", () => {
      const role = getAllRoles(true)[1]!; // Copywriter
      const memory = getOrCreateSession("build-test-2", "proj-1");
      memory.steps.push({
        order: 1,
        agentName: "Архитектор",
        agentRoleId: "role_architect",
        input: "",
        output: '{"pages": []}',
        modelUsed: "mistral",
        providerId: "ollama",
        durationMs: 1000,
        selectedBy: "hardcoded",
        status: "success",
        timestamp: "2025-01-01T00:00:00Z",
      });

      const { user } = buildAgentPrompt(
        role,
        memory,
        "Напиши контент",
        "",
        "react",
      );

      expect(user).toContain("КОНТЕКСТ ОТ ПРЕДЫДУЩИХ АГЕНТОВ");
      expect(user).toContain("[Архитектор");
      expect(user).toContain('{"pages": []}');
    });

    it("includes local context when provided", () => {
      const role = getAllRoles(true)[0]!;
      const memory = getOrCreateSession("build-test-3", "proj-1");

      const { user } = buildAgentPrompt(
        role,
        memory,
        "Создай сайт",
        "Стиль: минимализм, цвета: чёрный и белый",
        "react",
      );

      expect(user).toContain("ДОПОЛНИТЕЛЬНЫЙ КОНТЕКСТ");
      expect(user).toContain("минимализм");
    });
  });
});
