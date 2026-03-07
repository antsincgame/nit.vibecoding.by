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
      createDocument: async (dbId: string, collId: string, docId: string, data: Record<string, unknown>) => {
        const col = getCol(dbId, collId);
        const doc = { $id: docId, ...data };
        col.push(doc);
        return { ...doc };
      },
      deleteDocument: async (dbId: string, collId: string, docId: string) => {
        const col = getCol(dbId, collId);
        const idx = col.findIndex(d => d.$id === docId);
        if (idx !== -1) col.splice(idx, 1);
      },
    }),
    COLLECTIONS: { VERSIONS: "versions" },
    ID: { unique: () => `ver_${++idCounter}` },
    Query: {
      orderAsc: (field: string) => ({ type: "orderAsc", field }),
      orderDesc: (field: string) => ({ type: "orderDesc", field }),
      limit: (n: number) => ({ type: "limit", n }),
    },
  };
});

import {
  listVersions,
  createVersion,
  deleteVersion,
} from "~/features/projects/service/versionService";

const DB_ID = "test-project-db";

function seedVersions() {
  if (!store[DB_ID]) store[DB_ID] = {};
  store[DB_ID]!["versions"] = [
    {
      $id: "v1",
      code: JSON.stringify({ "App.tsx": "<div>Hello</div>" }),
      prompt: "Create a hello page",
      model: "gpt-4",
      agent_id: "ollama",
      temperature: 0.7,
      version_number: 1,
      created_at: "2025-01-01T00:00:00.000Z",
    },
    {
      $id: "v2",
      code: JSON.stringify({ "App.tsx": "<div>Updated</div>", "styles.css": "body{}" }),
      prompt: "Update the page",
      model: "llama3",
      agent_id: "openai",
      temperature: 0.3,
      version_number: 2,
      created_at: "2025-01-02T00:00:00.000Z",
    },
  ];
}

describe("versionService", () => {
  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
    seedVersions();
  });

  describe("listVersions", () => {
    it("should return versions sorted by version_number desc", async () => {
      const versions = await listVersions(DB_ID);
      expect(versions).toHaveLength(2);
      expect(versions[0]!.versionNumber).toBe(2);
      expect(versions[1]!.versionNumber).toBe(1);
    });

    it("should parse code JSON correctly", async () => {
      const versions = await listVersions(DB_ID);
      const v2 = versions[0]!;
      expect(v2.code).toEqual({ "App.tsx": "<div>Updated</div>", "styles.css": "body{}" });
    });

    it("should set projectId from databaseId", async () => {
      const versions = await listVersions(DB_ID);
      expect(versions[0]!.projectId).toBe(DB_ID);
    });

    it("should return empty array when no versions", async () => {
      for (const key of Object.keys(store)) delete store[key];
      const versions = await listVersions(DB_ID);
      expect(versions).toEqual([]);
    });

    it("should handle invalid JSON code gracefully", async () => {
      store[DB_ID]!["versions"] = [
        { $id: "bad", code: "not-json", prompt: "p", model: "m", agent_id: "a", temperature: 0.5, version_number: 1, created_at: "2025-01-01T00:00:00.000Z" },
      ];
      const versions = await listVersions(DB_ID);
      expect(versions[0]!.code).toEqual({ "App.tsx": "not-json" });
    });
  });

  describe("createVersion", () => {
    it("should auto-increment version number", async () => {
      const version = await createVersion({
        databaseId: DB_ID,
        code: { "index.html": "<html></html>" },
        prompt: "New version",
        model: "gpt-4",
        agentId: "test-agent",
        temperature: 0.5,
      });

      expect(version.versionNumber).toBe(3);
      expect(version.code).toEqual({ "index.html": "<html></html>" });
      expect(version.prompt).toBe("New version");
    });

    it("should start at version 1 when collection is empty", async () => {
      for (const key of Object.keys(store)) delete store[key];

      const version = await createVersion({
        databaseId: DB_ID,
        code: { "App.tsx": "first" },
        prompt: "First version",
        model: "gpt-4",
        agentId: "test",
        temperature: 0.7,
      });

      expect(version.versionNumber).toBe(1);
    });

    it("should store code as JSON string in document", async () => {
      await createVersion({
        databaseId: DB_ID,
        code: { "a.ts": "content" },
        prompt: "p",
        model: "m",
        agentId: "a",
        temperature: 0.5,
      });

      const col = store[DB_ID]!["versions"]!;
      const lastDoc = col[col.length - 1]!;
      expect(lastDoc["code"]).toBe(JSON.stringify({ "a.ts": "content" }));
    });
  });

  describe("deleteVersion", () => {
    it("should remove a version by id", async () => {
      await deleteVersion(DB_ID, "v1");
      const versions = await listVersions(DB_ID);
      expect(versions).toHaveLength(1);
      expect(versions[0]!.id).toBe("v2");
    });

    it("should not throw when deleting non-existent version", async () => {
      await expect(deleteVersion(DB_ID, "non-existent")).resolves.toBeUndefined();
    });
  });
});
