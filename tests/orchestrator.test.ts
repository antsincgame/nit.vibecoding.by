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
vi.mock("~/lib/services/pipelineLogger", () => ({ logPipelineStep: vi.fn(async () => {}) }));
vi.mock("~/lib/services/agentRouter", () => ({ routeToAgent: vi.fn() }));

const SEED_ROLES = [
  { id: "role_analyst", name: "Аналитик", description: "Уточнение требований", systemPrompt: "x".repeat(60), providerId: "ollama", modelName: "mistral", order: 1, isActive: true, isLocked: false, timeoutMs: 60000, maxRetries: 2, outputFormat: "freetext" as const, includeNitPrompt: false, temperature: 0.4, createdAt: "2025-01-01", updatedAt: "2025-01-01" },
  { id: "role_architect", name: "Архитектор", description: "Создаёт структуру", systemPrompt: "x".repeat(60), providerId: "ollama", modelName: "mistral", order: 2, isActive: true, isLocked: true, timeoutMs: 60000, maxRetries: 2, outputFormat: "json" as const, includeNitPrompt: false, temperature: 0.3, createdAt: "2025-01-01", updatedAt: "2025-01-01" },
  { id: "role_designer", name: "Дизайнер", description: "Визуальный стиль", systemPrompt: "x".repeat(60), providerId: "ollama", modelName: "mistral", order: 3, isActive: true, isLocked: false, timeoutMs: 60000, maxRetries: 2, outputFormat: "freetext" as const, includeNitPrompt: false, temperature: 0.5, createdAt: "2025-01-01", updatedAt: "2025-01-01" },
  { id: "role_copywriter", name: "Копирайтер", description: "Наполняет контентом", systemPrompt: "x".repeat(60), providerId: "ollama", modelName: "mistral", order: 4, isActive: true, isLocked: false, timeoutMs: 60000, maxRetries: 2, outputFormat: "freetext" as const, includeNitPrompt: false, temperature: 0.7, createdAt: "2025-01-01", updatedAt: "2025-01-01" },
  { id: "role_coder", name: "Кодер", description: "Генерирует код", systemPrompt: "x".repeat(60), providerId: "ollama", modelName: "mistral", order: 5, isActive: true, isLocked: false, timeoutMs: 60000, maxRetries: 2, outputFormat: "freetext" as const, includeNitPrompt: true, temperature: 0.3, createdAt: "2025-01-01", updatedAt: "2025-01-01" },
  { id: "role_tester", name: "Тестировщик", description: "Проверяет код", systemPrompt: "x".repeat(60), providerId: "ollama", modelName: "mistral", order: 6, isActive: true, isLocked: false, timeoutMs: 60000, maxRetries: 2, outputFormat: "freetext" as const, includeNitPrompt: false, temperature: 0.2, createdAt: "2025-01-01", updatedAt: "2025-01-01" },
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

import { planPipeline } from "~/lib/services/orchestrator";
import { getOrCreateSession } from "~/lib/services/agentPipeline";
import { getAllRoles } from "~/lib/services/roleService";
import { generateText } from "ai";
import { LLMManager } from "~/lib/llm/manager";

describe("testerFoundCriticalErrors detection patterns", () => {
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
    expect(plan.steps.length).toBeGreaterThanOrEqual(6);
    expect(plan.steps[0]!.name).toBe("Аналитик");
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
    } as unknown as LLMManager);

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
    } as unknown as LLMManager);
    vi.mocked(generateText).mockResolvedValueOnce({
      text: '{"needed":["role_coder"],"reasoning":"Только код"}',
    } as unknown as Awaited<ReturnType<typeof generateText>>);

    const plan = await planPipeline(memory, "Поменяй цвет");
    expect(plan.steps.some((r) => r.id === "role_coder")).toBe(true);
    const allActive = await getAllRoles(true);
    expect(plan.steps.length).toBeLessThan(allActive.length);
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
    } as unknown as LLMManager);
    vi.mocked(generateText).mockResolvedValueOnce({
      text: '{"needed":["role_architect"],"reasoning":"Новая структура"}',
    } as unknown as Awaited<ReturnType<typeof generateText>>);

    const plan = await planPipeline(memory, "Переделай структуру");
    expect(plan.steps.some((r) => r.id === "role_architect")).toBe(true);
    expect(plan.steps.some((r) => r.id === "role_coder")).toBe(true);
  });
});
