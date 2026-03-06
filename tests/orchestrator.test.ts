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
import { getAllRoles } from "~/lib/services/roleService";
import { generateText } from "ai";
import { LLMManager } from "~/lib/llm/manager";

// ─── Extract testerFoundCriticalErrors for direct testing ───
// We can't import private function, so we test it through planPipeline
// and through pattern matching unit tests.

describe("testerFoundCriticalErrors detection patterns", () => {
  // We test the logic inline since the function is not exported.
  // Replicate the exact logic here for unit testing.
  function hasCritical(output: string): boolean {
    const lower = output.toLowerCase();
    if (lower.includes("итого: pass") || lower.includes("итого:pass")) return false;
    const noError = [
      "нет ошибок", "без ошибок", "ошибок не обнаружено", "ошибок нет",
      "критических ошибок нет", "критических нет", "0 критических",
    ];
    for (const pat of noError) { if (lower.includes(pat)) return false; }
    if (lower.includes("итого: fail") || lower.includes("итого:fail")) return true;
    const critical = ["критическ", "блокирующ", "critical"];
    for (const pat of critical) { if (lower.includes(pat)) return true; }
    return false;
  }

  it("detects FAIL verdict", () => {
    expect(hasCritical("ИТОГО: FAIL\nНайдены проблемы.")).toBe(true);
  });

  it("detects PASS verdict", () => {
    expect(hasCritical("ИТОГО: PASS\nВсё хорошо.")).toBe(false);
  });

  it("detects критические ошибки", () => {
    expect(hasCritical("КРИТИЧЕСКИЕ ошибки:\n1. Незакрытый тег")).toBe(true);
  });

  it("detects блокирующие", () => {
    expect(hasCritical("Найдены блокирующие проблемы")).toBe(true);
  });

  it("handles 'нет ошибок'", () => {
    expect(hasCritical("Проверка завершена. Нет ошибок.")).toBe(false);
  });

  it("handles 'без ошибок'", () => {
    expect(hasCritical("Код без ошибок, всё работает.")).toBe(false);
  });

  it("handles 'критических ошибок нет'", () => {
    expect(hasCritical("Критических ошибок нет. Только рекомендации.")).toBe(false);
  });

  it("handles '0 критических'", () => {
    expect(hasCritical("0 критических, 2 предупреждения")).toBe(false);
  });

  it("handles 'ошибок не обнаружено'", () => {
    expect(hasCritical("Ошибок не обнаружено при проверке.")).toBe(false);
  });

  it("handles mixed — PASS with warnings", () => {
    expect(hasCritical("Предупреждения: 3\nИТОГО: PASS")).toBe(false);
  });

  it("handles no verdict — no critical patterns → false", () => {
    expect(hasCritical("Рекомендации:\n1. Добавить alt к img\n2. Улучшить контраст")).toBe(false);
  });

  it("handles 'critical' in English", () => {
    expect(hasCritical("Found 2 critical issues")).toBe(true);
  });
});

describe("planPipeline", () => {
  it("returns full chain for new session", async () => {
    const memory = getOrCreateSession(`plan-new-${Date.now()}`, "p1");
    const plan = await planPipeline(memory, "Создай лендинг");
    expect(plan.steps.length).toBeGreaterThanOrEqual(4);
    expect(plan.steps[0]!.name).toBe("Архитектор");
    expect(plan.reasoning).toContain("Новая сессия");
  });

  it("falls back to full chain on LLM error", async () => {
    const memory = getOrCreateSession(`plan-err-${Date.now()}`, "p1");
    memory.steps.push({
      order: 1, agentName: "prev", agentRoleId: "r", input: "", output: "x",
      modelUsed: "m", providerId: "p", durationMs: 0, selectedBy: "hardcoded",
      status: "success", timestamp: new Date().toISOString(),
    });

    vi.mocked(LLMManager.getInstance).mockReturnValue({
      getProvider: vi.fn(() => null),
      getAllProviders: vi.fn(() => []),
    } as any);

    const plan = await planPipeline(memory, "test");
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it("uses LLM-selected subset for existing session", async () => {
    const memory = getOrCreateSession(`plan-llm-${Date.now()}`, "p1");
    memory.steps.push({
      order: 1, agentName: "Кодер", agentRoleId: "role_coder",
      input: "", output: "code...", modelUsed: "m", providerId: "p",
      durationMs: 0, selectedBy: "user", status: "success",
      timestamp: new Date().toISOString(),
    });

    vi.mocked(LLMManager.getInstance).mockReturnValue({
      getProvider: vi.fn(() => ({
        getModelInstance: vi.fn(() => ({})),
      })),
      getAllProviders: vi.fn(() => []),
    } as any);
    vi.mocked(generateText).mockResolvedValueOnce({
      text: '{"needed":["role_coder"],"reasoning":"Только код"}',
    } as any);

    const plan = await planPipeline(memory, "Поменяй цвет");
    expect(plan.steps.some((r) => r.id === "role_coder")).toBe(true);
    expect(plan.steps.length).toBeLessThan(getAllRoles(true).length);
  });

  it("force-adds Кодер when Architect selected but Coder missing", async () => {
    const memory = getOrCreateSession(`plan-force-${Date.now()}`, "p1");
    memory.steps.push({
      order: 1, agentName: "prev", agentRoleId: "r", input: "", output: "x",
      modelUsed: "m", providerId: "p", durationMs: 0, selectedBy: "user",
      status: "success", timestamp: new Date().toISOString(),
    });

    vi.mocked(LLMManager.getInstance).mockReturnValue({
      getProvider: vi.fn(() => ({
        getModelInstance: vi.fn(() => ({})),
      })),
      getAllProviders: vi.fn(() => []),
    } as any);
    vi.mocked(generateText).mockResolvedValueOnce({
      text: '{"needed":["role_architect"],"reasoning":"Новая структура"}',
    } as any);

    const plan = await planPipeline(memory, "Переделай структуру");
    expect(plan.steps.some((r) => r.id === "role_architect")).toBe(true);
    expect(plan.steps.some((r) => r.id === "role_coder")).toBe(true);
  });
});
