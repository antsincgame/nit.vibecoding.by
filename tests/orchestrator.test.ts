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
vi.mock("ai", () => ({
  streamText: vi.fn(),
  generateText: vi.fn(),
}));
vi.mock("~/lib/services/pipelineLogger", () => ({ logPipelineStep: vi.fn() }));
vi.mock("~/lib/services/agentRouter", () => ({ routeToAgent: vi.fn() }));

import { planPipeline } from "~/lib/services/orchestrator";
import { getOrCreateSession } from "~/lib/services/agentPipeline";
import { getAllRoles, getRoleById } from "~/lib/services/roleService";
import { generateText } from "ai";
import { LLMManager } from "~/lib/llm/manager";

describe("orchestrator", () => {
  describe("planPipeline", () => {
    it("returns full chain for new session", async () => {
      const memory = getOrCreateSession(`orch-new-${Date.now()}`, "p1");
      // memory.steps.length === 0 → new session

      const plan = await planPipeline(memory, "Создай лендинг");

      expect(plan.steps.length).toBeGreaterThanOrEqual(4);
      expect(plan.steps[0]!.name).toBe("Архитектор");
      expect(plan.reasoning).toContain("Новая сессия");
      expect(Object.keys(plan.skipReasons)).toHaveLength(0);
    });

    it("falls back to full chain when LLM unavailable", async () => {
      const memory = getOrCreateSession(`orch-fallback-${Date.now()}`, "p1");
      memory.steps.push({
        order: 1, agentName: "Архитектор", agentRoleId: "role_architect",
        input: "", output: '{"pages":[]}', modelUsed: "m", providerId: "p",
        durationMs: 0, selectedBy: "hardcoded", status: "success", timestamp: new Date().toISOString(),
      });

      // LLMManager returns null provider → fallback
      vi.mocked(LLMManager.getInstance).mockReturnValue({
        getProvider: vi.fn(() => null),
        getAllProviders: vi.fn(() => []),
      } as any);

      const plan = await planPipeline(memory, "Поменяй цвет");
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.reasoning).toContain("недоступен");
    });

    it("uses LLM plan when available", async () => {
      const memory = getOrCreateSession(`orch-llm-${Date.now()}`, "p1");
      memory.steps.push({
        order: 1, agentName: "Кодер", agentRoleId: "role_coder",
        input: "", output: "<nitArtifact>...</nitArtifact>", modelUsed: "m", providerId: "p",
        durationMs: 0, selectedBy: "user", status: "success", timestamp: new Date().toISOString(),
      });

      const mockModel = {};
      vi.mocked(LLMManager.getInstance).mockReturnValue({
        getProvider: vi.fn(() => ({
          getModelInstance: vi.fn(() => mockModel),
        })),
        getAllProviders: vi.fn(() => []),
      } as any);
      vi.mocked(generateText).mockResolvedValueOnce({
        text: '{"needed": ["role_coder"], "reasoning": "Только исправление кода"}',
      } as any);

      const plan = await planPipeline(memory, "Поменяй цвет кнопки");

      // Should include at least Кодер
      expect(plan.steps.some((r) => r.id === "role_coder")).toBe(true);
      expect(plan.steps.length).toBeLessThan(getAllRoles(true).length);
    });

    it("always adds Кодер if content steps present", async () => {
      const memory = getOrCreateSession(`orch-coder-${Date.now()}`, "p1");
      memory.steps.push({
        order: 1, agentName: "prev", agentRoleId: "r", input: "", output: "x",
        modelUsed: "m", providerId: "p", durationMs: 0, selectedBy: "user",
        status: "success", timestamp: new Date().toISOString(),
      });

      const mockModel = {};
      vi.mocked(LLMManager.getInstance).mockReturnValue({
        getProvider: vi.fn(() => ({
          getModelInstance: vi.fn(() => mockModel),
        })),
        getAllProviders: vi.fn(() => []),
      } as any);
      // LLM says only Architect needed (forgot Coder)
      vi.mocked(generateText).mockResolvedValueOnce({
        text: '{"needed": ["role_architect"], "reasoning": "Нужна новая структура"}',
      } as any);

      const plan = await planPipeline(memory, "Переделай структуру");

      // Safety check: Кодер must be added since Architect produces content
      const hasArchitect = plan.steps.some((r) => r.id === "role_architect");
      const hasCoder = plan.steps.some((r) => r.id === "role_coder");
      expect(hasArchitect).toBe(true);
      expect(hasCoder).toBe(true);
    });
  });
});
