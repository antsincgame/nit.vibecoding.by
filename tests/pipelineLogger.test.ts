import { describe, it, expect, beforeEach } from "vitest";
import { vi } from "vitest";

vi.mock("~/lib/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  logPipelineStep,
  getSessionLogs,
  getStats,
  clearLogs,
} from "~/lib/services/pipelineLogger";

describe("pipelineLogger", () => {
  beforeEach(() => {
    clearLogs();
  });

  const makelog = (overrides: Record<string, unknown> = {}) => ({
    sessionId: "sess-1",
    projectId: "proj-1",
    agentName: "Архитектор",
    agentRoleId: "role_architect",
    providerId: "ollama",
    modelName: "mistral",
    inputLength: 100,
    outputLength: 500,
    durationMs: 5000,
    selectedBy: "hardcoded" as const,
    status: "success" as const,
    errorMessage: "",
    retryCount: 0,
    timestamp: "2025-06-01T10:00:00Z",
    ...overrides,
  });

  describe("logPipelineStep", () => {
    it("logs a step without throwing", () => {
      expect(() => logPipelineStep(makelog())).not.toThrow();
    });
  });

  describe("getSessionLogs", () => {
    it("returns logs for a session", () => {
      logPipelineStep(makelog({ sessionId: "sess-A" }));
      logPipelineStep(makelog({ sessionId: "sess-B" }));
      logPipelineStep(makelog({ sessionId: "sess-A", agentName: "Копирайтер" }));

      const logs = getSessionLogs("sess-A");
      expect(logs.length).toBe(2);
      expect(logs[0]!.agentName).toBe("Архитектор");
      expect(logs[1]!.agentName).toBe("Копирайтер");
    });

    it("returns empty array for unknown session", () => {
      expect(getSessionLogs("nonexistent")).toEqual([]);
    });
  });

  describe("getStats", () => {
    it("computes stats for a time range", () => {
      logPipelineStep(makelog({ timestamp: "2025-06-01T10:00:00Z", durationMs: 3000 }));
      logPipelineStep(makelog({
        timestamp: "2025-06-01T11:00:00Z",
        durationMs: 7000,
        agentName: "Копирайтер",
        modelName: "codellama",
        providerId: "lm-studio",
      }));
      logPipelineStep(makelog({
        timestamp: "2025-06-01T12:00:00Z",
        durationMs: 1000,
        status: "error",
        errorMessage: "timeout",
      }));

      const stats = getStats("2025-06-01T00:00:00Z", "2025-06-02T00:00:00Z");

      expect(stats.totalRequests).toBe(3);
      expect(stats.successRate).toBeCloseTo(2 / 3);
      expect(stats.avgDurationMs).toBeCloseTo((3000 + 7000 + 1000) / 3);

      // By agent
      expect(stats.byAgent["Архитектор"]!.count).toBe(2);
      expect(stats.byAgent["Копирайтер"]!.count).toBe(1);
      expect(stats.byAgent["Архитектор"]!.errorRate).toBe(0.5);

      // By model
      expect(stats.byModel["mistral@ollama"]!.count).toBe(2);
      expect(stats.byModel["codellama@lm-studio"]!.count).toBe(1);
    });

    it("returns zeros for empty range", () => {
      const stats = getStats("2099-01-01T00:00:00Z", "2099-12-31T00:00:00Z");
      expect(stats.totalRequests).toBe(0);
      expect(stats.successRate).toBe(0);
    });
  });

  describe("clearLogs", () => {
    it("clears all logs", () => {
      logPipelineStep(makelog());
      logPipelineStep(makelog());
      expect(getSessionLogs("sess-1").length).toBe(2);

      clearLogs();
      expect(getSessionLogs("sess-1").length).toBe(0);
    });
  });
});
