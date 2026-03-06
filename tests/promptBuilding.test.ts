import { describe, it, expect, vi } from "vitest";

// Mock deps so we can import from agentPipeline
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
vi.mock("~/lib/services/pipelineLogger", () => ({ logPipelineStep: vi.fn() }));
vi.mock("~/lib/services/agentRouter", () => ({ routeToAgent: vi.fn() }));

import { buildAgentPrompt, getOrCreateSession } from "~/lib/services/agentPipeline";
import { getAllRoles } from "~/lib/services/roleService";

describe("buildAgentPrompt", () => {
  it("builds correct system prompt with role only (no NIT prompt for seed roles)", () => {
    const role = getAllRoles(true)[0]!; // Architect — includeNitPrompt: false
    const memory = getOrCreateSession(`prompt-test-${Date.now()}`, "p1");

    const { system, user } = buildAgentPrompt(role, memory, "Создай лендинг", "", "react");

    // Seed roles have includeNitPrompt: false → no NIT prompt
    expect(system).not.toContain("MOCK");
    expect(system).toContain("РОЛЬ: Архитектор");
    expect(system).toContain(role.systemPrompt);

    expect(user).toContain("ЗАПРОС ПОЛЬЗОВАТЕЛЯ");
    expect(user).toContain("Создай лендинг");
    expect(user).not.toContain("КОНТЕКСТ ОТ ПРЕДЫДУЩИХ");
    expect(user).not.toContain("ДОПОЛНИТЕЛЬНЫЙ КОНТЕКСТ");
  });

  it("includes previous agent context", () => {
    const role = getAllRoles(true)[1]!; // Copywriter
    const memory = getOrCreateSession(`prompt-ctx-${Date.now()}`, "p1");
    memory.steps.push({
      order: 1,
      agentName: "Архитектор",
      agentRoleId: "role_architect",
      input: "",
      output: '{"project_name":"Test","pages":[]}',
      modelUsed: "mistral",
      providerId: "ollama",
      durationMs: 1000,
      selectedBy: "hardcoded",
      status: "success",
      timestamp: "2025-01-01T00:00:00Z",
    });

    const { user } = buildAgentPrompt(role, memory, "Напиши текст", "", "react");

    expect(user).toContain("КОНТЕКСТ ОТ ПРЕДЫДУЩИХ АГЕНТОВ");
    expect(user).toContain("[Архитектор");
    expect(user).toContain("project_name");
  });

  it("includes local context", () => {
    const role = getAllRoles(true)[0]!;
    const memory = getOrCreateSession(`prompt-local-${Date.now()}`, "p1");

    const { user } = buildAgentPrompt(role, memory, "Сайт", "Стиль: минимализм", "react");
    expect(user).toContain("ДОПОЛНИТЕЛЬНЫЙ КОНТЕКСТ");
    expect(user).toContain("минимализм");
  });

  it("skips empty local context", () => {
    const role = getAllRoles(true)[0]!;
    const memory = getOrCreateSession(`prompt-empty-${Date.now()}`, "p1");

    const { user } = buildAgentPrompt(role, memory, "Сайт", "   ", "react");
    expect(user).not.toContain("ДОПОЛНИТЕЛЬНЫЙ КОНТЕКСТ");
  });

  it("includes multiple agent contexts in chain", () => {
    const role = getAllRoles(true)[2]!; // Tester
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
    expect(user).toContain("---"); // separator
  });

  it("includes NIT prompt when includeNitPrompt is true", () => {
    const role = { ...getAllRoles(true)[0]!, includeNitPrompt: true };
    const memory = getOrCreateSession(`prompt-nit-${Date.now()}`, "p1");

    const { system } = buildAgentPrompt(role, memory, "Создай сайт", "", "react");

    // NIT prompt (mocked as "MOCK") should be present
    expect(system).toContain("MOCK");
    expect(system).toContain("РОЛЬ АГЕНТА: Архитектор");
  });
});
