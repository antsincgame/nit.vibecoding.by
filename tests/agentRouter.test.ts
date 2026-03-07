import { describe, it, expect, vi } from "vitest";

vi.mock("~/lib/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// We need to test the internal parseRouterResponse and buildRouterPrompt functions.
// Since they're not exported, we test through routeToAgent with mocked LLM.

vi.mock("~/lib/llm/manager", () => ({
  LLMManager: {
    getInstance: vi.fn(),
  },
}));

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

import { routeToAgent } from "~/lib/services/agentRouter";
import { LLMManager } from "~/lib/llm/manager";
import { generateText } from "ai";
import type { AgentRole, AgentMemory } from "@shared/types/agentRole";

const mockRoles: AgentRole[] = [
  {
    id: "r1", name: "Архитектор", description: "Структура",
    systemPrompt: "test", providerId: "ollama", modelName: "mistral",
    order: 1, isActive: true, isLocked: true, timeoutMs: 60000,
    maxRetries: 2, outputFormat: "json", includeNitPrompt: false, temperature: 0.3,
    createdAt: "", updatedAt: "",
  },
  {
    id: "r2", name: "Копирайтер", description: "Контент",
    systemPrompt: "test", providerId: "ollama", modelName: "mistral",
    order: 2, isActive: true, isLocked: false, timeoutMs: 60000,
    maxRetries: 2, outputFormat: "freetext", includeNitPrompt: false, temperature: 0.7,
    createdAt: "", updatedAt: "",
  },
  {
    id: "r3", name: "Тестировщик", description: "Тестирование",
    systemPrompt: "test", providerId: "ollama", modelName: "mistral",
    order: 3, isActive: true, isLocked: false, timeoutMs: 60000,
    maxRetries: 2, outputFormat: "freetext", includeNitPrompt: false, temperature: 0.2,
    createdAt: "", updatedAt: "",
  },
];

const mockMemory: AgentMemory = {
  sessionId: "s1",
  projectId: "p1",
  steps: [],
  createdAt: "",
  lastActivity: "",
};

function setupMockLLM(response: string) {
  const mockModel = {};
  const mockProvider = {
    getModelInstance: vi.fn(() => mockModel),
  };
  vi.mocked(LLMManager.getInstance).mockReturnValue({
    getProvider: vi.fn(() => mockProvider),
  } as unknown as LLMManager);
  vi.mocked(generateText).mockResolvedValue({ text: response } as unknown as Awaited<ReturnType<typeof generateText>>);
}

describe("agentRouter", () => {
  it("returns single role if only one available", async () => {
    const result = await routeToAgent([mockRoles[0]!], mockMemory, "anything");
    expect(result.name).toBe("Архитектор");
  });

  it("parses exact match response", async () => {
    setupMockLLM("Копирайтер");
    const result = await routeToAgent(mockRoles, mockMemory, "напиши текст");
    expect(result.name).toBe("Копирайтер");
  });

  it("parses response with extra whitespace", async () => {
    setupMockLLM("  Тестировщик  \n");
    const result = await routeToAgent(mockRoles, mockMemory, "проверь код");
    expect(result.name).toBe("Тестировщик");
  });

  it("parses response as substring match", async () => {
    setupMockLLM("Я думаю, что лучше всего подойдёт Копирайтер для этого.");
    const result = await routeToAgent(mockRoles, mockMemory, "напиши контент");
    expect(result.name).toBe("Копирайтер");
  });

  it("falls back to first role on unparseable response", async () => {
    setupMockLLM("Не могу определить");
    const result = await routeToAgent(mockRoles, mockMemory, "что-то непонятное");
    expect(result.name).toBe("Архитектор"); // first role
  });

  it("falls back to first role on LLM error", async () => {
    vi.mocked(LLMManager.getInstance).mockReturnValue({
      getProvider: vi.fn(() => null),
    } as unknown as LLMManager);

    const result = await routeToAgent(mockRoles, mockMemory, "test");
    expect(result.name).toBe("Архитектор");
  });

  it("case-insensitive matching", async () => {
    setupMockLLM("архитектор");
    const result = await routeToAgent(mockRoles, mockMemory, "сделай структуру");
    expect(result.name).toBe("Архитектор");
  });
});
