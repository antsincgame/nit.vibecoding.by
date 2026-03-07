import { describe, it, expect, vi, beforeAll } from "vitest";

vi.mock("~/lib/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

type QOp = { type: string; field?: string; value?: unknown; n?: number };

const { store, seedDefaultRoles } = vi.hoisted(() => {
  const store: Record<string, Record<string, Record<string, unknown>[]>> = {};

  function seedDefaultRoles() {
    const now = new Date().toISOString();
    if (!store["test-master-db"]) store["test-master-db"] = {};
    const col: Record<string, unknown>[] = [];
    store["test-master-db"]!["agent_roles"] = col;
    store["test-master-db"]!["prompt_history"] = [];
    const defaults = { provider_id: "ollama", model_name: "mistral", is_active: true, timeout_ms: 60000, max_retries: 2, created_at: now, updated_at: now };
    col.push(
      { $id: "role_architect", ...defaults, name: "Архитектор", description: "Создаёт структуру, навигацию, UX, цвета", order: 1, is_locked: true, output_format: "json", include_nit_prompt: false, temperature: 0.3, system_prompt: "Ты Архитектор веб-студии. Твоя задача — создать структуру проекта на основе запроса пользователя в формате JSON." },
      { $id: "role_copywriter", ...defaults, name: "Копирайтер", description: "Наполняет страницы текстовым контентом", order: 2, is_locked: false, output_format: "freetext", include_nit_prompt: false, temperature: 0.7, system_prompt: "Ты Копирайтер веб-студии. Ты получаешь структуру сайта от Архитектора и наполняешь её живым, продающим контентом." },
      { $id: "role_coder", ...defaults, name: "Кодер", description: "Генерирует HTML/CSS/JS код для компонентов", order: 3, is_locked: false, output_format: "freetext", include_nit_prompt: true, temperature: 0.3, system_prompt: "Ты Кодер веб-студии. Получаешь структуру от Архитектора и контент от Копирайтера и генерируешь рабочий код." },
      { $id: "role_tester", ...defaults, name: "Тестировщик", description: "Проверяет код на ошибки и доступность", order: 4, is_locked: false, output_format: "freetext", include_nit_prompt: false, temperature: 0.2, system_prompt: "Ты Тестировщик веб-студии. Проверяешь сгенерированный код на ошибки, доступность и производительность." },
    );
  }

  return { store, seedDefaultRoles };
});

vi.mock("~/lib/db/appwrite", () => ({
  getDb: () => ({
    listDocuments: vi.fn(async (dbId: string, collId: string, queries: QOp[] = []) => {
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
    }),
    getDocument: vi.fn(async (dbId: string, collId: string, docId: string) => {
      const doc = (store[dbId]?.[collId] ?? []).find(d => d.$id === docId);
      if (!doc) throw new Error(`Document not found: ${docId}`);
      return { ...doc };
    }),
    createDocument: vi.fn(async (dbId: string, collId: string, docId: string, data: Record<string, unknown>) => {
      if (!store[dbId]) store[dbId] = {};
      if (!store[dbId]![collId]) store[dbId]![collId] = [];
      const doc = { $id: docId, ...data };
      store[dbId]![collId]!.push(doc);
      return { ...doc };
    }),
    updateDocument: vi.fn(async (dbId: string, collId: string, docId: string, data: Record<string, unknown>) => {
      const col = store[dbId]?.[collId] ?? [];
      const idx = col.findIndex(d => d.$id === docId);
      if (idx === -1) throw new Error(`Document not found: ${docId}`);
      Object.assign(col[idx]!, data);
      return { ...col[idx]! };
    }),
    deleteDocument: vi.fn(async (dbId: string, collId: string, docId: string) => {
      const col = store[dbId]?.[collId] ?? [];
      const idx = col.findIndex(d => d.$id === docId);
      if (idx === -1) throw new Error(`Document not found: ${docId}`);
      col.splice(idx, 1);
    }),
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

describe("Role lifecycle integration", () => {
  beforeAll(() => {
    seedDefaultRoles();
  });

  it("full CRUD lifecycle", async () => {
    const initial = await getAllRoles();
    expect(initial.length).toBeGreaterThanOrEqual(4);

    const architect = await getLockedRole();
    expect(architect).not.toBeNull();
    expect(architect!.name).toBe("Архитектор");

    const seo = await createRole({
      name: `SEO-${Date.now()}`,
      description: "Проверяет SEO-оптимизацию страниц и мета-теги",
      systemPrompt: "Ты SEO-специалист. Проверяй meta-теги, заголовки, alt-тексты. Формат: список рекомендаций.",
      providerId: "ollama",
      modelName: "mistral",
      order: 5,
      isActive: true,
      isLocked: false,
      timeoutMs: 90000,
      maxRetries: 1,
      outputFormat: "freetext",
      includeNitPrompt: false,
      temperature: 0.5,
    });
    expect(seo.id).toBeTruthy();

    const updated = await updateRole(seo.id, {
      modelName: "mistral",
      temperature: 0.8,
    });
    expect(updated!.modelName).toBe("mistral");
    expect(updated!.temperature).toBe(0.8);
    expect(updated!.name).toBe(seo.name);

    await updateRole(seo.id, {
      systemPrompt: "Обновлённый промпт для SEO-роли. Проверяй meta-теги, заголовки, описания, og-теги и ключевые слова.",
    });
    const history = await getPromptHistory(seo.id);
    expect(history.length).toBe(1);
    expect(history[0]!.version).toBe(1);

    await updateRole(seo.id, {
      systemPrompt: "Второй вариант SEO-промпта. Фокус на техническом SEO: скорость загрузки, мобильная адаптация.",
    });
    const history2 = await getPromptHistory(seo.id);
    expect(history2.length).toBe(2);
    expect(history2[0]!.version).toBe(2);

    const before = await getAllRoles();
    const nonLockedIds = before.filter(r => !r.isLocked).map(r => r.id);
    const reversed = [...nonLockedIds].reverse();
    await reorderRoles(reversed);

    const after = await getAllRoles();
    expect(after[0]!.name).toBe("Архитектор");
    const nonLockedAfter = after.filter(r => !r.isLocked);
    expect(nonLockedAfter[0]!.order).toBeGreaterThan(1);

    expect(await deleteRole("role_architect")).toBe(false);
    expect(await getRoleById("role_architect")).not.toBeNull();

    expect(await deleteRole(seo.id)).toBe(true);
    expect(await getRoleById(seo.id)).toBeNull();

    expect(await getRoleById("role_architect")).not.toBeNull();
    expect(await getRoleById("role_copywriter")).not.toBeNull();
    expect(await getRoleById("role_tester")).not.toBeNull();
  });

  it("provider ID uses valid values", async () => {
    const validProviderIds = ["ollama", "lm-studio", "custom"];
    const roles = await getAllRoles();
    for (const role of roles) {
      expect(validProviderIds).toContain(role.providerId);
    }
  });

  it("Кодер role has includeNitPrompt: true", async () => {
    const coder = await getRoleById("role_coder");
    expect(coder).not.toBeNull();
    expect(coder!.includeNitPrompt).toBe(true);
    expect(coder!.name).toBe("Кодер");

    const architect = await getRoleById("role_architect");
    const copywriter = await getRoleById("role_copywriter");
    const tester = await getRoleById("role_tester");
    expect(architect!.includeNitPrompt).toBe(false);
    expect(copywriter!.includeNitPrompt).toBe(false);
    expect(tester!.includeNitPrompt).toBe(false);
  });

  it("all seed roles have valid system prompts", async () => {
    const roles = await getAllRoles();
    for (const role of roles) {
      expect(role.systemPrompt.length).toBeGreaterThan(50);
      expect(role.description.length).toBeGreaterThan(10);
      expect(role.name.length).toBeGreaterThan(0);
    }
  });

  it("locked role always comes first in sorted list", async () => {
    const roles = await getAllRoles(true);
    const lockedIdx = roles.findIndex(r => r.isLocked);
    expect(lockedIdx).toBe(0);

    for (let i = 1; i < roles.length; i++) {
      expect(roles[i]!.order).toBeGreaterThanOrEqual(roles[0]!.order);
    }
  });

  it("activeOnly filter works", async () => {
    const inactive = await createRole({
      name: `Inactive-${Date.now()}`,
      description: "Неактивная роль для проверки фильтрации",
      systemPrompt: "Эта роль неактивна и не должна появляться в списке активных ролей для тестирования.",
      providerId: "ollama",
      modelName: "mistral",
      order: 99,
      isActive: false,
      isLocked: false,
      timeoutMs: 60000,
      maxRetries: 0,
      outputFormat: "freetext",
      includeNitPrompt: false,
      temperature: 0.5,
    });

    const all = await getAllRoles(false);
    const active = await getAllRoles(true);

    expect(all.length).toBeGreaterThan(active.length);
    expect(active.find(r => r.id === inactive.id)).toBeUndefined();
    expect(all.find(r => r.id === inactive.id)).not.toBeUndefined();

    await deleteRole(inactive.id);
  });
});
