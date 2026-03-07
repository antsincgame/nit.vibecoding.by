import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/lib/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

type QOp = { type: string; field?: string; value?: unknown; n?: number };

const { store } = vi.hoisted(() => {
  const store: Record<string, Record<string, Record<string, unknown>[]>> = {};
  return { store };
});

vi.mock("~/lib/db/appwrite", () => {
  function getCol(dbId: string, collId: string) {
    if (!store[dbId]) store[dbId] = {};
    if (!store[dbId]![collId]) store[dbId]![collId] = [];
    return store[dbId]![collId]!;
  }

  function applyQueries(docs: Record<string, unknown>[], queries: QOp[]) {
    let result = [...docs];
    for (const q of queries) {
      switch (q.type) {
        case "equal": result = result.filter(d => d[q.field!] === q.value); break;
        case "orderAsc": result.sort((a, b) => ((a[q.field!] as number) ?? 0) - ((b[q.field!] as number) ?? 0)); break;
        case "orderDesc": result.sort((a, b) => ((b[q.field!] as number) ?? 0) - ((a[q.field!] as number) ?? 0)); break;
        case "limit": result = result.slice(0, q.n); break;
      }
    }
    return result;
  }

  let idCounter = 0;

  return {
    getDb: () => ({
      listDocuments: async (dbId: string, collId: string, queries: QOp[] = []) => {
        const col = getCol(dbId, collId);
        const result = applyQueries([...col], queries);
        return { total: result.length, documents: result.map(d => ({ ...d })) };
      },
      createDocument: async (opts: { databaseId: string; collectionId: string; documentId: string; data: Record<string, unknown> }) => {
        const col = getCol(opts.databaseId, opts.collectionId);
        const doc = { $id: opts.documentId, ...opts.data };
        col.push(doc);
        return { ...doc };
      },
      deleteDocument: async (opts: { databaseId: string; collectionId: string; documentId: string }) => {
        const col = getCol(opts.databaseId, opts.collectionId);
        const idx = col.findIndex(d => d.$id === opts.documentId);
        if (idx !== -1) col.splice(idx, 1);
      },
    }),
    COLLECTIONS: { CHAT_MESSAGES: "chat_messages" },
    ID: { unique: () => `msg_${++idCounter}` },
    Query: {
      orderAsc: (field: string) => ({ type: "orderAsc", field }),
      orderDesc: (field: string) => ({ type: "orderDesc", field }),
      limit: (n: number) => ({ type: "limit", n }),
      equal: (field: string, value: unknown) => ({ type: "equal", field, value }),
    },
  };
});

import {
  getProjectMessages,
  saveProjectMessages,
  deleteProjectMessages,
} from "~/features/chat/service/chatService";
import type { ChatMessage } from "@shared/types/message";

const DB_ID = "test-project-db";

function makeChatMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m1",
    role: "user",
    content: "Hello",
    timestamp: 1000,
    ...overrides,
  };
}

function seedMessages() {
  const col = store[DB_ID]?.["chat_messages"];
  if (col) col.length = 0;
  if (!store[DB_ID]) store[DB_ID] = {};
  store[DB_ID]!["chat_messages"] = [
    { $id: "m1", role: "user", content: "Hello", timestamp: 1000, model: null, agent_id: null, agent_role_id: null, agent_role_name: null, selected_by: null, duration_ms: null },
    { $id: "m2", role: "assistant", content: "Hi there!", timestamp: 2000, model: "gpt-4", agent_id: "ollama", agent_role_id: "r1", agent_role_name: "Coder", selected_by: "hardcoded", duration_ms: 150 },
  ];
}

describe("chatService", () => {
  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
    seedMessages();
  });

  describe("getProjectMessages", () => {
    it("should return all messages sorted by timestamp", async () => {
      const messages = await getProjectMessages(DB_ID);
      expect(messages).toHaveLength(2);
      expect(messages[0]!.id).toBe("m1");
      expect(messages[0]!.role).toBe("user");
      expect(messages[1]!.id).toBe("m2");
      expect(messages[1]!.content).toBe("Hi there!");
    });

    it("should map optional fields correctly", async () => {
      const messages = await getProjectMessages(DB_ID);
      const userMsg = messages[0]!;
      expect(userMsg.model).toBeUndefined();
      expect(userMsg.agentId).toBeUndefined();

      const assistantMsg = messages[1]!;
      expect(assistantMsg.model).toBe("gpt-4");
      expect(assistantMsg.agentId).toBe("ollama");
      expect(assistantMsg.agentRoleId).toBe("r1");
      expect(assistantMsg.agentRoleName).toBe("Coder");
      expect(assistantMsg.selectedBy).toBe("hardcoded");
      expect(assistantMsg.durationMs).toBe(150);
    });

    it("should return empty array when no messages", async () => {
      for (const key of Object.keys(store)) delete store[key];
      const messages = await getProjectMessages(DB_ID);
      expect(messages).toEqual([]);
    });
  });

  describe("saveProjectMessages", () => {
    it("should replace all existing messages with new ones", async () => {
      const newMessages: ChatMessage[] = [
        makeChatMsg({ id: "n1", content: "New msg", timestamp: 5000 }),
      ];

      await saveProjectMessages(DB_ID, newMessages);

      const result = await getProjectMessages(DB_ID);
      expect(result).toHaveLength(1);
      expect(result[0]!.content).toBe("New msg");
    });

    it("should handle saving empty array", async () => {
      await saveProjectMessages(DB_ID, []);
      const result = await getProjectMessages(DB_ID);
      expect(result).toHaveLength(0);
    });

    it("should preserve optional fields when saving", async () => {
      const msg = makeChatMsg({
        id: "x1",
        role: "assistant",
        model: "llama3",
        agentRoleId: "role1",
        agentRoleName: "Architect",
        selectedBy: "user",
        durationMs: 300,
        timestamp: 9000,
      });

      await saveProjectMessages(DB_ID, [msg]);

      const result = await getProjectMessages(DB_ID);
      expect(result).toHaveLength(1);
      expect(result[0]!.model).toBe("llama3");
      expect(result[0]!.agentRoleId).toBe("role1");
    });
  });

  describe("deleteProjectMessages", () => {
    it("should remove all messages", async () => {
      await deleteProjectMessages(DB_ID);
      const result = await getProjectMessages(DB_ID);
      expect(result).toHaveLength(0);
    });

    it("should handle empty collection", async () => {
      for (const key of Object.keys(store)) delete store[key];
      await expect(deleteProjectMessages(DB_ID)).resolves.toBeUndefined();
    });
  });
});
