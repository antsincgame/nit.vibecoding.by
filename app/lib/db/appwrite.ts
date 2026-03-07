import { Client, Databases, ID, Query, Permission, Role } from "node-appwrite";
import { logger } from "~/lib/utils/logger";

const SCOPE = "appwrite";

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

let clientInstance: Client | null = null;

function getClient(): Client {
  if (clientInstance) return clientInstance;

  clientInstance = new Client()
    .setEndpoint(requireEnv("APPWRITE_ENDPOINT"))
    .setProject(requireEnv("APPWRITE_PROJECT_ID"))
    .setKey(requireEnv("APPWRITE_API_KEY"));

  return clientInstance;
}

let dbInstance: Databases | null = null;

export function getDb(): Databases {
  if (dbInstance) return dbInstance;
  dbInstance = new Databases(getClient());
  return dbInstance;
}

export function getMasterDbId(): string {
  return requireEnv("APPWRITE_MASTER_DB_ID");
}

export const COLLECTIONS = {
  PROJECTS: "projects",
  CHAT_MESSAGES: "chat_messages",
  VERSIONS: "versions",
  AGENT_ROLES: "agent_roles",
  PROMPT_HISTORY: "prompt_history",
  PIPELINE_LOGS: "pipeline_logs",
} as const;

const PERMISSIONS_ANY = [
  Permission.read(Role.any()),
  Permission.create(Role.any()),
  Permission.update(Role.any()),
  Permission.delete(Role.any()),
];

async function collectionExists(
  db: Databases,
  databaseId: string,
  collectionId: string,
): Promise<boolean> {
  try {
    await db.getCollection({ databaseId, collectionId });
    return true;
  } catch {
    return false;
  }
}

async function databaseExists(
  db: Databases,
  databaseId: string,
): Promise<boolean> {
  try {
    await db.get({ databaseId });
    return true;
  } catch {
    return false;
  }
}

export async function ensureMasterSchema(): Promise<void> {
  const db = getDb();
  const masterDbId = getMasterDbId();

  if (!(await databaseExists(db, masterDbId))) {
    await db.create({ databaseId: masterDbId, name: "NIT Master" });
    logger.info(SCOPE, `Created master database: ${masterDbId}`);
  }

  if (!(await collectionExists(db, masterDbId, COLLECTIONS.PROJECTS))) {
    await db.createCollection({
      databaseId: masterDbId,
      collectionId: COLLECTIONS.PROJECTS,
      name: "Projects",
      permissions: PERMISSIONS_ANY,
    });

    const base = { databaseId: masterDbId, collectionId: COLLECTIONS.PROJECTS };

    await db.createStringAttribute({ ...base, key: "name", size: 256, required: true });
    await db.createStringAttribute({ ...base, key: "description", size: 4096, required: false, xdefault: "" });
    await db.createStringAttribute({ ...base, key: "type", size: 32, required: false, xdefault: "react" });
    await db.createStringAttribute({ ...base, key: "agent_id", size: 128, required: false, xdefault: "" });
    await db.createStringAttribute({ ...base, key: "model_used", size: 128, required: false, xdefault: "" });
    await db.createStringAttribute({ ...base, key: "database_id", size: 64, required: true });
    await db.createStringAttribute({ ...base, key: "created_at", size: 64, required: true });
    await db.createStringAttribute({ ...base, key: "updated_at", size: 64, required: true });
    
    // Wait for attributes to be created
    await new Promise(resolve => setTimeout(resolve, 3000));
    logger.info(SCOPE, "Created projects collection in master DB");
  } else {
    try {
      const base = { databaseId: masterDbId, collectionId: COLLECTIONS.PROJECTS };
      try { await db.createStringAttribute({ ...base, key: "type", size: 32, required: false, xdefault: "react" }); } catch { /* ignore if exists */ }
      try { await db.createStringAttribute({ ...base, key: "agent_id", size: 128, required: false, xdefault: "" }); } catch { /* ignore if exists */ }
      try { await db.createStringAttribute({ ...base, key: "model_used", size: 128, required: false, xdefault: "" }); } catch { /* ignore if exists */ }
      try { await db.createStringAttribute({ ...base, key: "database_id", size: 64, required: true }); } catch { /* ignore if exists */ }
      try { await db.createStringAttribute({ ...base, key: "created_at", size: 64, required: true }); } catch { /* ignore if exists */ }
      try { await db.createStringAttribute({ ...base, key: "updated_at", size: 64, required: true }); } catch { /* ignore if exists */ }
    } catch (err) {
      logger.error(SCOPE, "Error checking/creating attributes", err);
    }
  }

  await ensureAgentRolesSchema();
  await ensurePipelineLogsSchema();
}

export async function ensureAgentRolesSchema(): Promise<void> {
  const db = getDb();
  const masterDbId = getMasterDbId();

  if (!(await collectionExists(db, masterDbId, COLLECTIONS.AGENT_ROLES))) {
    await db.createCollection({
      databaseId: masterDbId,
      collectionId: COLLECTIONS.AGENT_ROLES,
      name: "Agent Roles",
      permissions: PERMISSIONS_ANY,
    });

    const base = { databaseId: masterDbId, collectionId: COLLECTIONS.AGENT_ROLES };

    await db.createStringAttribute({ ...base, key: "name", size: 256, required: true });
    await db.createStringAttribute({ ...base, key: "description", size: 4096, required: false, xdefault: "" });
    await db.createStringAttribute({ ...base, key: "system_prompt", size: 51200, required: false, xdefault: "" });
    await db.createStringAttribute({ ...base, key: "provider_id", size: 128, required: false, xdefault: "ollama" });
    await db.createStringAttribute({ ...base, key: "model_name", size: 128, required: false, xdefault: "mistral" });
    await db.createIntegerAttribute({ ...base, key: "order", required: false });
    await db.createBooleanAttribute({ ...base, key: "is_active", required: false, xdefault: true });
    await db.createBooleanAttribute({ ...base, key: "is_locked", required: false, xdefault: false });
    await db.createIntegerAttribute({ ...base, key: "timeout_ms", required: false });
    await db.createIntegerAttribute({ ...base, key: "max_retries", required: false });
    await db.createStringAttribute({ ...base, key: "output_format", size: 32, required: false, xdefault: "freetext" });
    await db.createBooleanAttribute({ ...base, key: "include_nit_prompt", required: false, xdefault: false });
    await db.createFloatAttribute({ ...base, key: "temperature", required: false });
    await db.createStringAttribute({ ...base, key: "created_at", size: 64, required: false, xdefault: "" });
    await db.createStringAttribute({ ...base, key: "updated_at", size: 64, required: false, xdefault: "" });

    await new Promise(resolve => setTimeout(resolve, 3000));
    logger.info(SCOPE, "Created agent_roles collection in master DB");
  }

  if (!(await collectionExists(db, masterDbId, COLLECTIONS.PROMPT_HISTORY))) {
    await db.createCollection({
      databaseId: masterDbId,
      collectionId: COLLECTIONS.PROMPT_HISTORY,
      name: "Prompt History",
      permissions: PERMISSIONS_ANY,
    });

    const base = { databaseId: masterDbId, collectionId: COLLECTIONS.PROMPT_HISTORY };

    await db.createStringAttribute({ ...base, key: "agent_role_id", size: 128, required: true });
    await db.createStringAttribute({ ...base, key: "system_prompt", size: 51200, required: false, xdefault: "" });
    await db.createIntegerAttribute({ ...base, key: "version", required: false });
    await db.createStringAttribute({ ...base, key: "created_at", size: 64, required: false, xdefault: "" });

    await new Promise(resolve => setTimeout(resolve, 3000));
    logger.info(SCOPE, "Created prompt_history collection in master DB");
  }

  await seedDefaultRoles();
}

export async function ensurePipelineLogsSchema(): Promise<void> {
  const db = getDb();
  const masterDbId = getMasterDbId();

  if (!(await collectionExists(db, masterDbId, COLLECTIONS.PIPELINE_LOGS))) {
    await db.createCollection({
      databaseId: masterDbId,
      collectionId: COLLECTIONS.PIPELINE_LOGS,
      name: "Pipeline Logs",
      permissions: PERMISSIONS_ANY,
    });

    const base = { databaseId: masterDbId, collectionId: COLLECTIONS.PIPELINE_LOGS };

    await db.createStringAttribute({ ...base, key: "session_id", size: 128, required: true });
    await db.createStringAttribute({ ...base, key: "project_id", size: 128, required: false, xdefault: "" });
    await db.createStringAttribute({ ...base, key: "agent_name", size: 256, required: false, xdefault: "" });
    await db.createStringAttribute({ ...base, key: "agent_role_id", size: 128, required: false, xdefault: "" });
    await db.createStringAttribute({ ...base, key: "provider_id", size: 128, required: false, xdefault: "" });
    await db.createStringAttribute({ ...base, key: "model_name", size: 128, required: false, xdefault: "" });
    await db.createIntegerAttribute({ ...base, key: "input_length", required: false });
    await db.createIntegerAttribute({ ...base, key: "output_length", required: false });
    await db.createIntegerAttribute({ ...base, key: "duration_ms", required: false });
    await db.createStringAttribute({ ...base, key: "selected_by", size: 64, required: false, xdefault: "" });
    await db.createStringAttribute({ ...base, key: "status", size: 32, required: false, xdefault: "" });
    await db.createStringAttribute({ ...base, key: "error_message", size: 4096, required: false, xdefault: "" });
    await db.createIntegerAttribute({ ...base, key: "retry_count", required: false });
    await db.createStringAttribute({ ...base, key: "timestamp", size: 64, required: false, xdefault: "" });

    await new Promise(resolve => setTimeout(resolve, 3000));
    logger.info(SCOPE, "Created pipeline_logs collection in master DB");
  }
}

export type SeedLlmOptions = {
  providerId?: string;
  modelName?: string;
};

export async function seedOrCreateDefaultRoles(
  llmOptions?: SeedLlmOptions,
): Promise<{ seeded: boolean; message: string }> {
  const db = getDb();
  const masterDbId = getMasterDbId();

  try {
    const existing = await db.listDocuments(masterDbId, COLLECTIONS.AGENT_ROLES, [Query.limit(1)]);
    if (existing.total > 0) {
      return { seeded: false, message: "Роли уже существуют" };
    }
  } catch {
    return { seeded: false, message: "Ошибка проверки ролей" };
  }

  const now = new Date().toISOString();
  const providerId = llmOptions?.providerId?.trim() || "ollama";
  const modelName = llmOptions?.modelName?.trim() || "mistral";

  const defaults = {
    provider_id: providerId,
    model_name: modelName,
    is_active: true,
    timeout_ms: 60_000,
    max_retries: 2,
    created_at: now,
    updated_at: now,
  };

  const ROLE_IDS = [
    "role_analyst",
    "role_architect",
    "role_designer",
    "role_copywriter",
    "role_coder",
    "role_tester",
  ] as const;

  const seeds: Array<Record<string, unknown> & { name: string; role_id: string }> = [
    {
      ...defaults,
      role_id: ROLE_IDS[0],
      name: "Аналитик",
      description: "Уточнение требований, анализ запроса пользователя",
      order: 1,
      is_locked: false,
      output_format: "freetext",
      include_nit_prompt: false,
      temperature: 0.4,
      system_prompt: `Ты Аналитик веб-студии. Твоя задача — уточнить и структурировать запрос пользователя.

Правила:
1. Выяви цели проекта: что должен делать сайт, кто целевая аудитория.
2. Определи ключевые страницы и функциональность.
3. Укажи ограничения: бюджет, сроки, технические требования (если применимо).
4. Сформулируй чёткий, структурированный бриф для следующих агентов.

Формат ответа (структурированный текст):
- ЦЕЛИ: [что должен достичь сайт]
- АУДИТОРИЯ: [кто пользователи]
- КЛЮЧЕВЫЕ СТРАНИЦЫ: [список]
- ОГРАНИЧЕНИЯ: [если есть]
- РЕКОМЕНДАЦИИ: [что учесть Архитектору]`,
    },
    {
      ...defaults,
      role_id: ROLE_IDS[1],
      name: "Архитектор",
      description: "Создаёт структуру, навигацию, UX, цвета",
      order: 2,
      is_locked: true,
      output_format: "json",
      include_nit_prompt: false,
      temperature: 0.3,
      system_prompt: `Ты Архитектор веб-студии. Твоя задача — создать структуру проекта.

На основе запроса пользователя ты ОБЯЗАН вернуть JSON в формате:

{
  "project_name": "string",
  "pages": [
    {
      "slug": "string",
      "title": "string",
      "purpose": "string",
      "sections": [
        {
          "id": "string",
          "type": "hero | features | cta | content | gallery | form | footer | header | testimonials | pricing | faq",
          "description": "string",
          "notes": "string"
        }
      ]
    }
  ],
  "navigation": {
    "type": "top | sidebar | burger",
    "items": [{"label": "string", "href": "string"}]
  },
  "design": {
    "style": "string",
    "primary_color": "#hex",
    "secondary_color": "#hex",
    "accent_color": "#hex",
    "font_heading": "string",
    "font_body": "string"
  },
  "tech_notes": "string"
}

Никакого свободного текста. Только JSON. Без markdown-блоков.`,
    },
    {
      ...defaults,
      role_id: ROLE_IDS[2],
      name: "Дизайнер",
      description: "Визуальный стиль, цвета, типографика, компоненты",
      order: 3,
      is_locked: false,
      output_format: "freetext",
      include_nit_prompt: false,
      temperature: 0.5,
      system_prompt: `Ты Дизайнер веб-студии. Ты получаешь JSON-структуру от Архитектора и создаёшь визуальную спецификацию.

Правила:
1. Определи палитру: primary, secondary, accent (hex-коды).
2. Подбери шрифты: font_heading, font_body (Google Fonts или системные).
3. Опиши стиль компонентов: кнопки, карточки, формы (скругления, тени, границы).
4. Рекомендации по анимациям: hover, transitions, микро-взаимодействия.
5. Учитывай стиль из структуры Архитектора (design.style).

Формат ответа (структурированный текст):
- ПАЛИТРА: primary #hex, secondary #hex, accent #hex
- ШРИФТЫ: heading, body
- КОМПОНЕНТЫ: [описание стиля]
- АНИМАЦИИ: [рекомендации]`,
    },
    {
      ...defaults,
      role_id: ROLE_IDS[3],
      name: "Копирайтер",
      description: "Наполняет страницы текстовым контентом",
      order: 4,
      is_locked: false,
      output_format: "freetext",
      include_nit_prompt: false,
      temperature: 0.7,
      system_prompt: `Ты Копирайтер веб-студии. Ты получаешь структуру сайта от Архитектора и визуальную спецификацию от Дизайнера (если есть). Наполняешь секции контентом.

Правила:
1. Для каждой секции каждой страницы напиши реальный контент (не lorem ipsum).
2. Учитывай цель секции (hero — цепляющий заголовок, features — описания, cta — призыв к действию).
3. Тексты должны быть связными, в едином tone of voice.
4. Формат ответа: для каждой страницы и секции укажи page slug, section id и текст.
5. Если в структуре указан стиль — адаптируй тональность под него.
6. Учитывай визуальный стиль Дизайнера при выборе тона.`,
    },
    {
      ...defaults,
      role_id: ROLE_IDS[4],
      name: "Кодер",
      description: "Генерирует рабочий код сайта на основе структуры и контента",
      order: 5,
      is_locked: false,
      output_format: "freetext",
      include_nit_prompt: true,
      temperature: 0.3,
      system_prompt: `Ты Кодер веб-студии. Твоя главная задача — сгенерировать полностью рабочий код сайта.

Ты получаешь от предыдущих агентов:
- Структуру проекта от Архитектора (JSON с описанием страниц, секций, навигации, дизайна)
- Визуальную спецификацию от Дизайнера (цвета, шрифты, компоненты)
- Текстовый контент от Копирайтера (тексты для каждой секции)

Правила:
1. Создай ПОЛНЫЙ рабочий код на основе полученной структуры, дизайна и контента.
2. Используй РЕАЛЬНЫЕ тексты от Копирайтера — НЕ placeholder и НЕ lorem ipsum.
3. Следуй дизайну Архитектора и Дизайнера: цвета, шрифты, стиль компонентов.
4. Реализуй ВСЕ секции из структуры.
5. Код должен быть production-ready: hover-эффекты, адаптивность, анимации.
6. Если структура или контент не получены — создай сайт по запросу пользователя самостоятельно.

Используй формат nitArtifact для вывода файлов.`,
    },
    {
      ...defaults,
      role_id: ROLE_IDS[5],
      name: "Тестировщик",
      description: "Проверяет HTML/CSS/JS синтаксис и логику",
      order: 6,
      is_locked: false,
      output_format: "freetext",
      include_nit_prompt: false,
      temperature: 0.2,
      system_prompt: `Ты Тестировщик веб-студии. Ты проверяешь результат работы предыдущих агентов.

Проверь:
1. HTML/CSS валидность — есть ли незакрытые теги, невалидные свойства
2. Семантика — правильно ли использованы теги (h1 один на страницу, alt у img)
3. Доступность (a11y) — контраст цветов, aria-атрибуты
4. SEO — meta title/description, og-теги, структура заголовков
5. Консистентность — совпадает ли контент со структурой Архитектора

Формат ответа:
- КРИТИЧЕСКИЕ ошибки (блокируют запуск)
- ПРЕДУПРЕЖДЕНИЯ (стоит исправить)
- РЕКОМЕНДАЦИИ (улучшения)
- ИТОГО: PASS / FAIL с кратким резюме`,
    },
  ];

  let created = 0;
  for (const seed of seeds) {
    const { role_id, ...data } = seed;
    try {
      await db.createDocument(masterDbId, COLLECTIONS.AGENT_ROLES, role_id, data, PERMISSIONS_ANY);
      created++;
    } catch (err) {
      logger.error(SCOPE, `Failed to seed role: ${seed.name}`, err);
    }
  }

  if (created === 0) {
    return {
      seeded: false,
      message: "Не удалось создать роли. Проверьте подключение к Appwrite и переменные окружения.",
    };
  }

  logger.info(SCOPE, `Seeded ${created}/${seeds.length} default agent roles`);
  return { seeded: true, message: `Создано ${created} ролей по умолчанию` };
}

export async function seedOrCreateDefaultRolesForce(
  llmOptions?: SeedLlmOptions,
): Promise<{ seeded: boolean; message: string }> {
  const db = getDb();
  const masterDbId = getMasterDbId();

  try {
    const existing = await db.listDocuments(masterDbId, COLLECTIONS.AGENT_ROLES, [Query.limit(500)]);
    for (const doc of existing.documents) {
      await db.deleteDocument(masterDbId, COLLECTIONS.AGENT_ROLES, doc.$id);
    }
  } catch (err) {
    logger.error(SCOPE, "Failed to delete existing roles", err);
    return { seeded: false, message: "Ошибка при удалении ролей" };
  }

  return seedOrCreateDefaultRoles(llmOptions);
}

async function seedDefaultRoles(): Promise<void> {
  await seedOrCreateDefaultRoles();
}

export async function createProjectDatabase(projectName: string): Promise<string> {
  const db = getDb();
  const dbId = ID.unique();

  await db.create({ databaseId: dbId, name: `Project: ${projectName}` });

  await createProjectCollections(db, dbId);

  logger.info(SCOPE, `Created project database: ${dbId}`);
  return dbId;
}

async function createProjectCollections(db: Databases, dbId: string): Promise<void> {
  await db.createCollection({
    databaseId: dbId,
    collectionId: COLLECTIONS.CHAT_MESSAGES,
    name: "Chat Messages",
    permissions: PERMISSIONS_ANY,
  });

  const msgBase = { databaseId: dbId, collectionId: COLLECTIONS.CHAT_MESSAGES };
  await db.createStringAttribute({ ...msgBase, key: "role", size: 16, required: true });
  await db.createStringAttribute({ ...msgBase, key: "content", size: 1048576, required: true });
  await db.createIntegerAttribute({ ...msgBase, key: "timestamp", required: true });
  await db.createStringAttribute({ ...msgBase, key: "model", size: 128, required: false });
  await db.createStringAttribute({ ...msgBase, key: "agent_id", size: 128, required: false });
  await db.createStringAttribute({ ...msgBase, key: "agent_role_id", size: 128, required: false });
  await db.createStringAttribute({ ...msgBase, key: "agent_role_name", size: 256, required: false });
  await db.createStringAttribute({ ...msgBase, key: "selected_by", size: 64, required: false });
  await db.createIntegerAttribute({ ...msgBase, key: "duration_ms", required: false });

  await db.createCollection({
    databaseId: dbId,
    collectionId: COLLECTIONS.VERSIONS,
    name: "Versions",
    permissions: PERMISSIONS_ANY,
  });

  const verBase = { databaseId: dbId, collectionId: COLLECTIONS.VERSIONS };
  await db.createStringAttribute({ ...verBase, key: "code", size: 1048576, required: true });
  await db.createStringAttribute({ ...verBase, key: "prompt", size: 1048576, required: true });
  await db.createStringAttribute({ ...verBase, key: "model", size: 128, required: true });
  await db.createStringAttribute({ ...verBase, key: "agent_id", size: 128, required: false, xdefault: "" });
  await db.createFloatAttribute({ ...verBase, key: "temperature", required: true });
  await db.createIntegerAttribute({ ...verBase, key: "version_number", required: true });
  await db.createStringAttribute({ ...verBase, key: "created_at", size: 64, required: true });
  
  // Wait for attributes to be created
  await new Promise(resolve => setTimeout(resolve, 3000));
}

export async function deleteProjectDatabase(dbId: string): Promise<void> {
  const db = getDb();
  await db.delete({ databaseId: dbId });
  logger.info(SCOPE, `Deleted project database: ${dbId}`);
}

export { ID, Query };
