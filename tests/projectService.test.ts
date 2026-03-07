import { describe, it, expect, vi, beforeEach } from "vitest";

type QOp = { type: string; field?: string; value?: unknown; n?: number };

const { store } = vi.hoisted(() => {
  const store: Record<string, Record<string, Record<string, unknown>[]>> = {};
  return { store };
});

const MASTER_DB = "test-master-db";
let projectDbCounter = 0;

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
        case "orderAsc": result.sort((a, b) => String(a[q.field!] ?? "").localeCompare(String(b[q.field!] ?? ""))); break;
        case "orderDesc": result.sort((a, b) => String(b[q.field!] ?? "").localeCompare(String(a[q.field!] ?? ""))); break;
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
      getDocument: async (dbId: string, collId: string, docId: string) => {
        const col = getCol(dbId, collId);
        const doc = col.find(d => d.$id === docId);
        if (!doc) throw new Error(`Document not found: ${docId}`);
        return { ...doc };
      },
      createDocument: async (dbId: string, collId: string, docId: string, data: Record<string, unknown>) => {
        const col = getCol(dbId, collId);
        const doc = { $id: docId, ...data };
        col.push(doc);
        return { ...doc };
      },
      updateDocument: async (dbId: string, collId: string, docId: string, data: Record<string, unknown>) => {
        const col = getCol(dbId, collId);
        const doc = col.find(d => d.$id === docId);
        if (!doc) throw new Error(`Document not found: ${docId}`);
        Object.assign(doc, data);
        return { ...doc };
      },
      deleteDocument: async (dbId: string, collId: string, docId: string) => {
        const col = getCol(dbId, collId);
        const idx = col.findIndex(d => d.$id === docId);
        if (idx !== -1) col.splice(idx, 1);
      },
    }),
    getMasterDbId: () => MASTER_DB,
    ensureMasterSchema: async () => {},
    createProjectDatabase: async () => `proj_db_${++projectDbCounter}`,
    deleteProjectDatabase: async () => {},
    COLLECTIONS: { PROJECTS: "projects" },
    ID: { unique: () => `proj_${++idCounter}` },
    Query: {
      orderAsc: (field: string) => ({ type: "orderAsc", field }),
      orderDesc: (field: string) => ({ type: "orderDesc", field }),
      limit: (n: number) => ({ type: "limit", n }),
    },
  };
});

import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
} from "~/features/projects/service/projectService";

function seedProjects() {
  if (!store[MASTER_DB]) store[MASTER_DB] = {};
  store[MASTER_DB]!["projects"] = [
    {
      $id: "p1",
      name: "Landing Page",
      description: "A simple landing",
      type: "react",
      agent_id: "ollama",
      model_used: "gpt-4",
      database_id: "db_p1",
      created_at: "2025-01-01T00:00:00.000Z",
      updated_at: "2025-01-01T00:00:00.000Z",
    },
    {
      $id: "p2",
      name: "Portfolio",
      description: "Personal portfolio",
      type: "html",
      agent_id: "",
      model_used: "",
      database_id: "db_p2",
      created_at: "2025-01-02T00:00:00.000Z",
      updated_at: "2025-01-02T00:00:00.000Z",
    },
  ];
}

describe("projectService", () => {
  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
    seedProjects();
  });

  describe("listProjects", () => {
    it("should return all projects", async () => {
      const projects = await listProjects();
      expect(projects).toHaveLength(2);
    });

    it("should map document fields to Project type", async () => {
      const projects = await listProjects();
      const p = projects.find(p => p.id === "p1")!;
      expect(p.name).toBe("Landing Page");
      expect(p.type).toBe("react");
      expect(p.agentId).toBe("ollama");
      expect(p.modelUsed).toBe("gpt-4");
      expect(p.databaseId).toBe("db_p1");
    });

    it("should return empty array when no projects", async () => {
      for (const key of Object.keys(store)) delete store[key];
      const projects = await listProjects();
      expect(projects).toEqual([]);
    });
  });

  describe("getProject", () => {
    it("should return a project by id", async () => {
      const project = await getProject("p1");
      expect(project.id).toBe("p1");
      expect(project.name).toBe("Landing Page");
    });

    it("should throw when project not found", async () => {
      await expect(getProject("non-existent")).rejects.toThrow("Document not found");
    });
  });

  describe("createProject", () => {
    it("should create a project with correct fields", async () => {
      const project = await createProject({
        name: "New Project",
        description: "Test description",
        type: "vue",
      });

      expect(project.name).toBe("New Project");
      expect(project.description).toBe("Test description");
      expect(project.type).toBe("vue");
      expect(project.databaseId).toBeTruthy();
      expect(project.createdAt).toBeTruthy();
    });

    it("should default type to react when not specified", async () => {
      const project = await createProject({
        name: "Default type",
        description: "",
        type: undefined as unknown as "react",
      });

      expect(project.type).toBe("react");
    });

    it("should add project to the store", async () => {
      await createProject({ name: "Added", description: "d", type: "html" });
      const projects = await listProjects();
      expect(projects).toHaveLength(3);
    });
  });

  describe("updateProject", () => {
    it("should update specified fields", async () => {
      const updated = await updateProject("p1", { name: "Updated Name" });
      expect(updated.name).toBe("Updated Name");
    });

    it("should update agentId and modelUsed", async () => {
      const updated = await updateProject("p1", {
        agentId: "openai",
        modelUsed: "gpt-4o",
      });
      expect(updated.agentId).toBe("openai");
      expect(updated.modelUsed).toBe("gpt-4o");
    });

    it("should always update updated_at", async () => {
      const before = (await getProject("p1")).updatedAt;
      const updated = await updateProject("p1", { name: "X" });
      expect(updated.updatedAt).not.toBe(before);
    });

    it("should throw when project not found", async () => {
      await expect(updateProject("non-existent", { name: "X" })).rejects.toThrow();
    });
  });

  describe("deleteProject", () => {
    it("should remove project from store", async () => {
      await deleteProject("p1");
      const projects = await listProjects();
      expect(projects).toHaveLength(1);
      expect(projects[0]!.id).toBe("p2");
    });

    it("should throw when project not found", async () => {
      await expect(deleteProject("non-existent")).rejects.toThrow();
    });
  });
});
