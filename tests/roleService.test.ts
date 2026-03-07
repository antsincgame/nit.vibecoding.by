import { describe, it, expect, vi, beforeAll } from "vitest";

vi.mock("~/lib/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

type QOp = { type: string; field?: string; value?: unknown; n?: number };

const { store, seedDefaultRoles } = vi.hoisted(() => {
  const store: Record<string, Record<string, Record<string, unknown>[]>> = {};
  let idCounter = 0;

  function getCol(dbId: string, collId: string) {
    if (!store[dbId]) store[dbId] = {};
    if (!store[dbId]![collId]) store[dbId]![collId] = [];
    return store[dbId]![collId]!;
  }

  function applyQueries(docs: Record<string, unknown>[], queries: QOp[]) {
    let result = [...docs];
    for (const q of queries) {
      switch (q.type) {
        case "equal":
          result = result.filter(d => d[q.field!] === q.value);
          break;
        case "orderAsc":
          result.sort((a, b) => ((a[q.field!] as number) ?? 0) - ((b[q.field!] as number) ?? 0));
          break;
        case "orderDesc":
          result.sort((a, b) => ((b[q.field!] as number) ?? 0) - ((a[q.field!] as number) ?? 0));
          break;
        case "limit":
          result = result.slice(0, q.n);
          break;
      }
    }
    return result;
  }

  function seedDefaultRoles() {
    const now = new Date().toISOString();
    const col = getCol("test-master-db", "agent_roles");
    col.length = 0;
    const defaults = { provider_id: "ollama", model_name: "mistral", is_active: true, timeout_ms: 60000, max_retries: 2, created_at: now, updated_at: now };
    col.push(
      { $id: "role_architect", ...defaults, name: "Архитектор", description: "Создаёт структуру, навигацию, UX, цвета", order: 1, is_locked: true, output_format: "json", include_nit_prompt: false, temperature: 0.3, system_prompt: "Ты Архитектор веб-студии. Твоя задача — создать структуру проекта на основе запроса пользователя в формате JSON." },
      { $id: "role_copywriter", ...defaults, name: "Копирайтер", description: "Наполняет страницы текстовым контентом", order: 2, is_locked: false, output_format: "freetext", include_nit_prompt: false, temperature: 0.7, system_prompt: "Ты Копирайтер веб-студии. Ты получаешь структуру сайта от Архитектора и наполняешь её живым, продающим контентом." },
      { $id: "role_coder", ...defaults, name: "Кодер", description: "Генерирует HTML/CSS/JS код", order: 3, is_locked: false, output_format: "freetext", include_nit_prompt: true, temperature: 0.3, system_prompt: "Ты Кодер веб-студии. Получаешь структуру от Архитектора и контент от Копирайтера и генерируешь рабочий код." },
      { $id: "role_tester", ...defaults, name: "Тестировщик", description: "Проверяет код на ошибки и доступность", order: 4, is_locked: false, output_format: "freetext", include_nit_prompt: false, temperature: 0.2, system_prompt: "Ты Тестировщик веб-студии. Проверяешь сгенерированный код на ошибки, доступность и производительность." },
    );
  }

  return {
    store,
    getCol,
    applyQueries,
    seedDefaultRoles,
    nextId: () => `role_gen_${++idCounter}`,
  };
});

vi.mock("~/lib/db/appwrite", () => ({
  getDb: () => ({
    listDocuments: async (dbId: string, collId: string, queries: QOp[] = []) => {
      const col = store[dbId]?.[collId] ?? [];
      let result = [...col];
      for (const q of queries) {
        switch (q.type) {
          case "equal": result = result.filter(d => d[q.field!] === q.value); break;
          case "orderAsc": result.sort((a, b) => ((a[q.field!] as number) ?? 0) - ((b[q.field!] as number) ?? 0)); break;
          case "orderDesc": result.sort((a, b) => ((b[q.field!] as number) ?? 0) - ((a[q.field!] as number) ?? 0)); break;
          case "limit": result = result.slice(0, q.n); break;
        }
      }
      return { total: result.length, documents: result.map(d => ({ ...d })) };
    },
    getDocument: async (dbId: string, collId: string, docId: string) => {
      const doc = (store[dbId]?.[collId] ?? []).find(d => d.$id === docId);
      if (!doc) throw new Error(`Document not found: ${docId}`);
      return { ...doc };
    },
    createDocument: async (dbId: string, collId: string, docId: string, data: Record<string, unknown>) => {
      if (!store[dbId]) store[dbId] = {};
      if (!store[dbId]![collId]) store[dbId]![collId] = [];
      const doc = { $id: docId, ...data };
      store[dbId]![collId]!.push(doc);
      return { ...doc };
    },
    updateDocument: async (dbId: string, collId: string, docId: string, data: Record<string, unknown>) => {
      const col = store[dbId]?.[collId] ?? [];
      const idx = col.findIndex(d => d.$id === docId);
      if (idx === -1) throw new Error(`Document not found: ${docId}`);
      Object.assign(col[idx]!, data);
      return { ...col[idx]! };
    },
    deleteDocument: async (dbId: string, collId: string, docId: string) => {
      const col = store[dbId]?.[collId] ?? [];
      const idx = col.findIndex(d => d.$id === docId);
      if (idx === -1) throw new Error(`Document not found: ${docId}`);
      col.splice(idx, 1);
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
  ID: { unique: () => `role_gen_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` },
  Query: {
    limit: (n: number): QOp => ({ type: "limit", n }),
    orderAsc: (field: string): QOp => ({ type: "orderAsc", field }),
    orderDesc: (field: string): QOp => ({ type: "orderDesc", field }),
    equal: (field: string, value: unknown): QOp => ({ type: "equal", field, value }),
  },
}));

import {
  getAllRoles,
  getRoleById,
  getLockedRole,
  createRole,
  updateRole,
  deleteRole,
  reorderRoles,
  getPromptHistory,
} from "~/lib/services/roleService";

describe("roleService", () => {
  beforeAll(() => {
    seedDefaultRoles();
  });

  describe("getAllRoles", () => {
    it("returns seeded roles sorted by order", async () => {
      const roles = await getAllRoles();
      expect(roles.length).toBeGreaterThanOrEqual(4);
      expect(roles[0]!.name).toBe("Архитектор");
      expect(roles[1]!.name).toBe("Копирайтер");
      expect(roles[2]!.name).toBe("Кодер");
      expect(roles[3]!.name).toBe("Тестировщик");

      for (let i = 1; i < roles.length; i++) {
        expect(roles[i]!.order).toBeGreaterThanOrEqual(roles[i - 1]!.order);
      }
    });

    it("filters active only", async () => {
      const all = await getAllRoles();
      const active = await getAllRoles(true);
      expect(active.length).toBe(all.length);
    });
  });

  describe("getRoleById", () => {
    it("returns role by id", async () => {
      const role = await getRoleById("role_architect");
      expect(role).not.toBeNull();
      expect(role!.name).toBe("Архитектор");
    });

    it("returns null for non-existent id", async () => {
      expect(await getRoleById("nonexistent")).toBeNull();
    });
  });

  describe("getLockedRole", () => {
    it("returns the architect (locked role)", async () => {
      const locked = await getLockedRole();
      expect(locked).not.toBeNull();
      expect(locked!.name).toBe("Архитектор");
      expect(locked!.isLocked).toBe(true);
    });
  });

  describe("createRole", () => {
    it("creates a new role with generated id", async () => {
      const role = await createRole({
        name: "SEO-мастер",
        description: "Проверяет SEO-оптимизацию страниц и мета-теги",
        systemPrompt: "Ты SEO-специалист. Проверяй meta-теги, заголовки, alt-тексты и ключевые слова. Формат ответа: список рекомендаций.",
        providerId: "ollama",
        modelName: "mistral",
        order: 5,
        isActive: true,
        isLocked: false,
        timeoutMs: 60000,
        maxRetries: 2,
        outputFormat: "freetext",
        includeNitPrompt: false,
        temperature: 0.5,
      });

      expect(role.id).toBeTruthy();
      expect(role.name).toBe("SEO-мастер");
      expect(role.createdAt).toBeTruthy();
      expect(role.updatedAt).toBeTruthy();

      const found = await getRoleById(role.id);
      expect(found).not.toBeNull();
      expect(found!.name).toBe("SEO-мастер");
    });

    it("throws on duplicate name (case-insensitive)", async () => {
      await expect(
        createRole({
          name: "Архитектор",
          description: "Duplicate architect role for testing",
          systemPrompt: "Ты дубликат архитектора. Это тестовый промпт для проверки уникальности имён ролей.",
          providerId: "ollama",
          modelName: "mistral",
          order: 99,
          isActive: true,
          isLocked: false,
          timeoutMs: 60000,
          maxRetries: 0,
          outputFormat: "freetext",
          includeNitPrompt: false,
          temperature: 0.5,
        }),
      ).rejects.toThrow(/уже существует/);
    });

    it("throws on duplicate name different case", async () => {
      await expect(
        createRole({
          name: "архитектор",
          description: "Lowercase duplicate architect for testing",
          systemPrompt: "Ты дубликат архитектора с маленькой буквы. Тестовый промпт для уникальности.",
          providerId: "ollama",
          modelName: "mistral",
          order: 99,
          isActive: true,
          isLocked: false,
          timeoutMs: 60000,
          maxRetries: 0,
          outputFormat: "freetext",
          includeNitPrompt: false,
          temperature: 0.5,
        }),
      ).rejects.toThrow(/уже существует/);
    });
  });

  describe("updateRole", () => {
    it("updates role fields", async () => {
      const updated = await updateRole("role_copywriter", { description: "Обновлённое описание копирайтера" });
      expect(updated).not.toBeNull();
      expect(updated!.description).toBe("Обновлённое описание копирайтера");
      expect(updated!.name).toBe("Копирайтер");
    });

    it("tracks prompt history on systemPrompt change", async () => {
      const before = await getPromptHistory("role_copywriter");
      const beforeCount = before.length;

      await updateRole("role_copywriter", {
        systemPrompt: "Новый промпт для копирайтера. Ты должен писать тексты в формальном стиле с использованием профессиональной лексики.",
      });

      const after = await getPromptHistory("role_copywriter");
      expect(after.length).toBe(beforeCount + 1);
      expect(after[0]!.systemPrompt).toContain("Новый промпт");
    });

    it("protects locked role order", async () => {
      const updated = await updateRole("role_architect", { order: 99 });
      expect(updated).not.toBeNull();
      expect(updated!.order).toBe(1);
    });

    it("returns null for non-existent id", async () => {
      expect(await updateRole("nonexistent", { name: "test" })).toBeNull();
    });

    it("throws when renaming to existing name", async () => {
      await expect(
        updateRole("role_copywriter", { name: "Архитектор" }),
      ).rejects.toThrow(/уже существует/);
    });

    it("allows keeping same name on update", async () => {
      const result = await updateRole("role_copywriter", { name: "Копирайтер", description: "Обновлённый копирайтер для тестов" });
      expect(result).not.toBeNull();
      expect(result!.name).toBe("Копирайтер");
    });
  });

  describe("deleteRole", () => {
    it("deletes non-locked role", async () => {
      const role = await createRole({
        name: "Temp Role",
        description: "Temporary role for testing deletion functionality",
        systemPrompt: "Ты временная роль. Эта роль будет удалена в тесте. Просто подтверди получение запроса.",
        providerId: "ollama",
        modelName: "mistral",
        order: 99,
        isActive: true,
        isLocked: false,
        timeoutMs: 60000,
        maxRetries: 0,
        outputFormat: "freetext",
        includeNitPrompt: false,
        temperature: 0.5,
      });

      expect(await deleteRole(role.id)).toBe(true);
      expect(await getRoleById(role.id)).toBeNull();
    });

    it("refuses to delete locked role", async () => {
      expect(await deleteRole("role_architect")).toBe(false);
      expect(await getRoleById("role_architect")).not.toBeNull();
    });

    it("returns false for non-existent id", async () => {
      expect(await deleteRole("nonexistent")).toBe(false);
    });
  });

  describe("reorderRoles", () => {
    it("updates order for non-locked roles starting after locked", async () => {
      await reorderRoles(["role_tester", "role_copywriter"]);

      const tester = await getRoleById("role_tester");
      const copywriter = await getRoleById("role_copywriter");
      const architect = await getRoleById("role_architect");

      expect(architect!.order).toBe(1);
      expect(tester!.order).toBe(2);
      expect(copywriter!.order).toBe(3);
    });
  });

  describe("getPromptHistory", () => {
    it("returns empty for role with no changes", async () => {
      const history = await getPromptHistory("role_architect");
      expect(Array.isArray(history)).toBe(true);
    });

    it("returns entries sorted by version desc", async () => {
      await updateRole("role_tester", {
        systemPrompt: "Первое изменение промпта тестировщика. Проверяй всё внимательно. Пиши подробные отчёты.",
      });
      await updateRole("role_tester", {
        systemPrompt: "Второе изменение промпта тестировщика. Новые правила проверки. Будь строже к ошибкам.",
      });

      const history = await getPromptHistory("role_tester");
      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history[0]!.version).toBeGreaterThan(history[1]!.version);
    });
  });
});
