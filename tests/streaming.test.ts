import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentRole, AgentMemory, PipelineEvent } from "@shared/types/agentRole";

vi.mock("~/lib/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("~/lib/server/llm/prompts", () => ({
  buildSystemPrompt: vi.fn(() => "MOCK_SYSTEM_PROMPT"),
}));

const mockGetModelInstance = vi.fn(() => ({ id: "mock-model" }));
const mockGetProvider = vi.fn(() => ({
  getModelInstance: mockGetModelInstance,
}));

vi.mock("~/lib/llm/manager", () => ({
  LLMManager: {
    getInstance: vi.fn(() => ({
      getProvider: mockGetProvider,
      getAllProviders: vi.fn(() => [{ name: "ollama" }]),
    })),
  },
}));

const mockStreamText = vi.fn();
const mockGenerateText = vi.fn();
vi.mock("ai", () => ({
  streamText: (...args: unknown[]) => mockStreamText(...args),
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));

vi.mock("~/lib/services/pipelineLogger", () => ({
  logPipelineStep: vi.fn(async () => {}),
}));
vi.mock("~/lib/services/agentRouter", () => ({
  routeToAgent: vi.fn(),
}));

const SEED_ROLES: AgentRole[] = [
  { id: "role_architect", name: "Архитектор", description: "Создаёт структуру", systemPrompt: "Ты Архитектор.", providerId: "ollama", modelName: "mistral", order: 1, isActive: true, isLocked: true, timeoutMs: 60000, maxRetries: 2, outputFormat: "json", includeNitPrompt: false, temperature: 0.3, createdAt: "2025-01-01", updatedAt: "2025-01-01" },
  { id: "role_copywriter", name: "Копирайтер", description: "Наполняет контентом", systemPrompt: "Ты Копирайтер.", providerId: "ollama", modelName: "mistral", order: 2, isActive: true, isLocked: false, timeoutMs: 60000, maxRetries: 2, outputFormat: "freetext", includeNitPrompt: false, temperature: 0.7, createdAt: "2025-01-01", updatedAt: "2025-01-01" },
  { id: "role_coder", name: "Кодер", description: "Генерирует код", systemPrompt: "Ты Кодер.", providerId: "ollama", modelName: "mistral", order: 3, isActive: true, isLocked: false, timeoutMs: 60000, maxRetries: 2, outputFormat: "freetext", includeNitPrompt: true, temperature: 0.3, createdAt: "2025-01-01", updatedAt: "2025-01-01" },
  { id: "role_tester", name: "Тестировщик", description: "Проверяет код", systemPrompt: "Ты Тестировщик.", providerId: "ollama", modelName: "mistral", order: 4, isActive: true, isLocked: false, timeoutMs: 60000, maxRetries: 2, outputFormat: "freetext", includeNitPrompt: false, temperature: 0.2, createdAt: "2025-01-01", updatedAt: "2025-01-01" },
];

vi.mock("~/lib/services/roleService", () => ({
  getAllRoles: vi.fn(async (activeOnly = false) =>
    activeOnly ? SEED_ROLES.filter(r => r.isActive) : [...SEED_ROLES],
  ),
  getRoleById: vi.fn(async (id: string) => SEED_ROLES.find(r => r.id === id) ?? null),
  getLockedRole: vi.fn(async () => SEED_ROLES.find(r => r.isLocked) ?? null),
  createRole: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
  reorderRoles: vi.fn(),
  getPromptHistory: vi.fn(async () => []),
}));

import {
  executeStepStreaming,
  getOrCreateSession,
} from "~/lib/services/agentPipeline";
import { executeOrchestrated } from "~/lib/services/orchestrator";

async function collectEvents(gen: AsyncGenerator<PipelineEvent>): Promise<PipelineEvent[]> {
  const events: PipelineEvent[] = [];
  for await (const ev of gen) {
    events.push(ev);
  }
  return events;
}

function makeTextStream(chunks: string[]): { textStream: AsyncIterable<string> } {
  return {
    textStream: {
      async *[Symbol.asyncIterator]() {
        for (const c of chunks) yield c;
      },
    },
  };
}

function freshMemory(suffix: string): AgentMemory {
  return getOrCreateSession(`stream-${suffix}-${Date.now()}`, "proj-test");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetProvider.mockReturnValue({ getModelInstance: mockGetModelInstance });
  mockGetModelInstance.mockReturnValue({ id: "mock-model" });
});

// ─── executeStepStreaming ────────────────────────────────

describe("executeStepStreaming", () => {
  const role = SEED_ROLES[2]!; // Кодер

  it("streams text chunks and yields step_complete on success", async () => {
    mockStreamText.mockReturnValue(makeTextStream(["Hello", " world"]));

    const memory = freshMemory("step-ok");
    const events = await collectEvents(
      executeStepStreaming(role, memory, "Создай кнопку", "", "react", "user"),
    );

    const textEvents = events.filter(e => e.type === "text");
    expect(textEvents).toHaveLength(2);
    expect((textEvents[0] as { text: string }).text).toBe("Hello");
    expect((textEvents[1] as { text: string }).text).toBe(" world");

    const complete = events.find(e => e.type === "step_complete");
    expect(complete).toBeDefined();
    expect((complete as { roleName: string }).roleName).toBe("Кодер");

    expect(memory.steps).toHaveLength(1);
    expect(memory.steps[0]!.status).toBe("success");
    expect(memory.steps[0]!.output).toBe("Hello world");
  });

  it("yields error when provider not found", async () => {
    mockGetProvider.mockReturnValue(null);

    const memory = freshMemory("step-no-provider");
    const events = await collectEvents(
      executeStepStreaming(role, memory, "test", "", "react", "user"),
    );

    const errorEv = events.find(e => e.type === "error");
    expect(errorEv).toBeDefined();
    expect((errorEv as { message: string }).message).toContain("Провайдер");
    expect(memory.steps).toHaveLength(1);
    expect(memory.steps[0]!.status).toBe("error");
  });

  it("yields error when model returns empty response", async () => {
    mockStreamText.mockReturnValue(makeTextStream(["", "  "]));

    const memory = freshMemory("step-empty");
    const events = await collectEvents(
      executeStepStreaming(role, memory, "test", "", "react", "user"),
    );

    const errorEv = events.find(e => e.type === "error");
    expect(errorEv).toBeDefined();
    expect((errorEv as { message: string }).message).toContain("пустой ответ");
  });

  it("retries on error with retry_reset and warning events", async () => {
    let callCount = 0;
    mockStreamText.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        throw new Error("Connection timeout");
      }
      return makeTextStream(["Recovered"]);
    });

    const singleRetryRole = { ...role, maxRetries: 1 };
    const memory = freshMemory("step-retry");
    const events = await collectEvents(
      executeStepStreaming(singleRetryRole, memory, "test", "", "react", "user"),
    );

    const retryResets = events.filter(e => e.type === "retry_reset");
    expect(retryResets).toHaveLength(1);

    const warnings = events.filter(e => e.type === "warning");
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect((warnings[0] as { message: string }).message).toContain("Повтор");

    const complete = events.find(e => e.type === "step_complete");
    expect(complete).toBeDefined();
    expect(memory.steps[0]!.output).toBe("Recovered");
  });

  it("yields error when all retries exhausted", async () => {
    mockStreamText.mockImplementation(() => {
      throw new Error("Persistent failure");
    });

    const noRetryRole = { ...role, maxRetries: 0 };
    const memory = freshMemory("step-exhaust");
    const events = await collectEvents(
      executeStepStreaming(noRetryRole, memory, "test", "", "react", "user"),
    );

    const errorEv = events.find(e => e.type === "error");
    expect(errorEv).toBeDefined();
    expect((errorEv as { message: string }).message).toContain("Persistent failure");
    expect((errorEv as { message: string }).message).toContain("попыток исчерпано");
  });

  it("handles abort signal", async () => {
    const controller = new AbortController();
    controller.abort();

    const memory = freshMemory("step-abort");
    const events = await collectEvents(
      executeStepStreaming(role, memory, "test", "", "react", "user", controller.signal),
    );

    const errorEv = events.find(e => e.type === "error");
    expect(errorEv).toBeDefined();
    expect((errorEv as { message: string }).message).toContain("Отменено");
  });

  it("handles AbortError from stream", async () => {
    mockStreamText.mockImplementation(() => {
      const err = new Error("Aborted");
      err.name = "AbortError";
      throw err;
    });

    const memory = freshMemory("step-abort-err");
    const events = await collectEvents(
      executeStepStreaming(role, memory, "test", "", "react", "user"),
    );

    const errorEv = events.find(e => e.type === "error");
    expect(errorEv).toBeDefined();
    expect((errorEv as { message: string }).message).toContain("Отменено");
  });

  it("parses JSON output for json-format roles", async () => {
    const architectRole = SEED_ROLES[0]!;
    const jsonPayload = '{"pages": [{"name": "home"}]}';
    mockStreamText.mockReturnValue(makeTextStream([jsonPayload]));

    const memory = freshMemory("step-json");
    await collectEvents(
      executeStepStreaming(architectRole, memory, "plan", "", "react", "hardcoded"),
    );

    expect(memory.steps[0]!.outputParsed).toEqual({ pages: [{ name: "home" }] });
  });

  it("does not set outputParsed for freetext roles", async () => {
    mockStreamText.mockReturnValue(makeTextStream(["<nitArtifact>code</nitArtifact>"]));

    const memory = freshMemory("step-freetext");
    await collectEvents(
      executeStepStreaming(role, memory, "code", "", "react", "user"),
    );

    expect(memory.steps[0]!.outputParsed).toBeUndefined();
  });
});

// ─── executeOrchestrated ─────────────────────────────────

describe("executeOrchestrated", () => {
  it("plans and executes steps for new session (full chain)", async () => {
    mockStreamText.mockReturnValue(makeTextStream(["result"]));

    const memory = freshMemory("orch-new");
    const events = await collectEvents(
      executeOrchestrated(memory, "Создай лендинг", "ctx", "react"),
    );

    const warning = events.find(e => e.type === "warning" && (e as { message: string }).message.includes("Оркестратор"));
    expect(warning).toBeDefined();

    const roleSelectedEvents = events.filter(e => e.type === "role_selected");
    expect(roleSelectedEvents.length).toBeGreaterThanOrEqual(4);

    expect(events.find(e => e.type === "done")).toBeDefined();
  });

  it("yields error when no active roles", async () => {
    const { getAllRoles: mockGetAllRoles } = await import("~/lib/services/roleService");
    vi.mocked(mockGetAllRoles).mockResolvedValueOnce([]);

    const memory = freshMemory("orch-empty");
    const events = await collectEvents(
      executeOrchestrated(memory, "test", "", "react"),
    );

    const errorEv = events.find(e => e.type === "error");
    expect(errorEv).toBeDefined();
    expect((errorEv as { message: string }).message).toContain("Нет активных ролей");
  });

  it("handles abort during orchestrated execution", async () => {
    const controller = new AbortController();
    controller.abort();

    const memory = freshMemory("orch-abort");
    const events = await collectEvents(
      executeOrchestrated(memory, "test", "", "react", controller.signal),
    );

    const errorEv = events.find(e => e.type === "error");
    expect(errorEv).toBeDefined();
  });

  it("triggers fix cycle when tester detects critical errors", async () => {
    let stepCallIdx = 0;
    const roleOrder: string[] = [];

    mockStreamText.mockImplementation((opts: { system: string }) => {
      stepCallIdx++;
      const sys = opts.system ?? "";

      if (sys.includes("Тестировщик") && stepCallIdx <= 5) {
        roleOrder.push("tester-fail");
        return makeTextStream(["ИТОГО: FAIL\nКритическая ошибка"]);
      }
      if (sys.includes("Тестировщик")) {
        roleOrder.push("tester-pass");
        return makeTextStream(["ИТОГО: PASS\nВсё хорошо"]);
      }

      if (sys.includes("Кодер") || sys.includes("MOCK_SYSTEM_PROMPT")) {
        roleOrder.push("coder");
        return makeTextStream(["<nitArtifact>fixed code</nitArtifact>"]);
      }

      roleOrder.push("other");
      return makeTextStream(["output"]);
    });

    const memory = freshMemory("orch-fix");
    const events = await collectEvents(
      executeOrchestrated(memory, "Создай сайт", "", "react"),
    );

    const fixWarnings = events.filter(
      e => e.type === "warning" && (e as { message: string }).message.includes("Критические ошибки"),
    );
    expect(fixWarnings.length).toBeGreaterThanOrEqual(1);

    expect(events.find(e => e.type === "done")).toBeDefined();
  });

  it("limits fix cycles to MAX_FIX_CYCLES", async () => {
    mockStreamText.mockImplementation((opts: { system: string }) => {
      const sys = opts.system ?? "";
      if (sys.includes("Тестировщик")) {
        return makeTextStream(["ИТОГО: FAIL\nКритическая ошибка: всё сломано"]);
      }
      if (sys.includes("MOCK_SYSTEM_PROMPT") || sys.includes("Кодер")) {
        return makeTextStream(["<nitArtifact>code</nitArtifact>"]);
      }
      return makeTextStream(["output"]);
    });

    const memory = freshMemory("orch-max-fix");
    const events = await collectEvents(
      executeOrchestrated(memory, "Создай сайт", "", "react"),
    );

    const fixWarnings = events.filter(
      e => e.type === "warning" && (e as { message: string }).message.includes("Критические ошибки"),
    );
    expect(fixWarnings.length).toBeLessThanOrEqual(2);

    expect(events.find(e => e.type === "done")).toBeDefined();
  });

  it("emits validation warnings for invalid step output", async () => {
    mockStreamText.mockImplementation((opts: { system: string }) => {
      const sys = opts.system ?? "";
      if (sys.includes("Архитектор") || (sys.includes("РОЛЬ: Архитектор"))) {
        return makeTextStream(["not valid json at all"]);
      }
      return makeTextStream(["output"]);
    });

    const memory = freshMemory("orch-validate");
    const events = await collectEvents(
      executeOrchestrated(memory, "Создай сайт", "", "react"),
    );

    const validationWarnings = events.filter(
      e => e.type === "warning" && (e as { message: string }).message.includes("JSON"),
    );
    expect(validationWarnings.length).toBeGreaterThanOrEqual(1);
  });
});
