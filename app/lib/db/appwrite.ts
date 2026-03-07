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
    // Check if attributes exist, if not create them (for existing collections)
    try {
      const base = { databaseId: masterDbId, collectionId: COLLECTIONS.PROJECTS };
      try { await db.createStringAttribute({ ...base, key: "type", size: 32, required: false, xdefault: "react" }); } catch (e) { /* ignore if exists */ }
      try { await db.createStringAttribute({ ...base, key: "agent_id", size: 128, required: false, xdefault: "" }); } catch (e) { /* ignore if exists */ }
      try { await db.createStringAttribute({ ...base, key: "model_used", size: 128, required: false, xdefault: "" }); } catch (e) { /* ignore if exists */ }
      try { await db.createStringAttribute({ ...base, key: "database_id", size: 64, required: true }); } catch (e) { /* ignore if exists */ }
      try { await db.createStringAttribute({ ...base, key: "created_at", size: 64, required: true }); } catch (e) { /* ignore if exists */ }
      try { await db.createStringAttribute({ ...base, key: "updated_at", size: 64, required: true }); } catch (e) { /* ignore if exists */ }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (err) {
      logger.error(SCOPE, "Error checking/creating attributes", err);
    }
  }
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
