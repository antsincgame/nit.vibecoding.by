import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("~/lib/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

type QOp = { type: string; field?: string; value?: unknown; n?: number };

const store: Record<string, Record<string, Record<string, unknown>[]>> = {};

vi.mock("~/lib/db/appwrite", () => ({
  getDb: () => ({
    listDocuments: async (dbId: string, collId: string, queries: QOp[] = []) => {
      const col = store[dbId]?.[collId] ?? [];
      let result = [...col];
      for (const q of queries) {
        switch (q.type) {
          case "equal": result = result.filter(d => d[q.field!] === q.value); break;
          case "orderAsc": result.sort((a, b) => String(a[q.field!] ?? "").localeCompare(String(b[q.field!] ?? ""))); break;
          case "orderDesc": result.sort((a, b) => String(b[q.field!] ?? "").localeCompare(String(a[q.field!] ?? ""))); break;
          case "limit": result = result.slice(0, q.n); break;
          case "offset": result = result.slice(q.n); break;
        }
      }
      return { total: result.length, documents: result.map(d => ({ ...d })) };
    },
    createDocument: async (dbId: string, collId: string, docId: string, data: Record<string, unknown>) => {
      if (!store[dbId]) store[dbId] = {};
      if (!store[dbId]![collId]) store[dbId]![collId] = [];
      const doc = { $id: docId, ...data };
      store[dbId]![collId]!.push(doc);
      return { ...doc };
    },
    deleteDocument: async (dbId: string, collId: string, docId: string) => {
      const col = store[dbId]?.[collId] ?? [];
      const idx = col.findIndex(d => d.$id === docId);
      if (idx !== -1) col.splice(idx, 1);
    },
  }),
  getMasterDbId: () => "test-master-db",
  COLLECTIONS: {
    PROJECTS: "projects",
    CHAT_MESSAGES: "chat_messages",
    VERSIONS: "versions",
    AGENT_ROLES: "agent_roles",
    PROMPT_HISTORY: "prompt_history",
    PIPELINE_LOGS: "pipeline_logs",
  },
  ID: { unique: () => `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` },
  Query: {
    limit: (n: number): QOp => ({ type: "limit", n }),
    offset: (n: number): QOp => ({ type: "offset", n }),
    orderAsc: (field: string): QOp => ({ type: "orderAsc", field }),
    orderDesc: (field: string): QOp => ({ type: "orderDesc", field }),
    equal: (field: string, value: unknown): QOp => ({ type: "equal", field, value }),
  },
}));

import { logPipelineStep } from "~/lib/services/pipelineLogger";

describe("pipelineLogger", () => {
  beforeEach(async () => {
    const dbId = "test-master-db";
    if (store[dbId]) store[dbId]!["pipeline_logs"] = [];
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
    it("logs a step without throwing", async () => {
      await expect(logPipelineStep(makelog())).resolves.toBeUndefined();
    });
  });
});
