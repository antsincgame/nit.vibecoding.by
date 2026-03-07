/**
 * Role Service — CRUD for agent roles via Appwrite.
 */

import type { AgentRole, PromptHistoryEntry } from "@shared/types/agentRole";
import { getDb, getMasterDbId, COLLECTIONS, ID, Query } from "~/lib/db/appwrite";
import { logger } from "~/lib/utils/logger";

type RoleDoc = Record<string, unknown>;

function docToRole(doc: RoleDoc): AgentRole {
  return {
    id: doc.$id as string,
    name: (doc.name as string) ?? "",
    description: (doc.description as string) ?? "",
    systemPrompt: (doc.system_prompt as string) ?? "",
    providerId: (doc.provider_id as string) ?? "ollama",
    modelName: (doc.model_name as string) ?? "mistral",
    order: (doc.order as number) ?? 0,
    isActive: doc.is_active as boolean ?? true,
    isLocked: doc.is_locked as boolean ?? false,
    timeoutMs: (doc.timeout_ms as number) ?? 60_000,
    maxRetries: (doc.max_retries as number) ?? 2,
    outputFormat: (doc.output_format as "freetext" | "json") ?? "freetext",
    includeNitPrompt: doc.include_nit_prompt as boolean ?? false,
    temperature: (doc.temperature as number) ?? 0.5,
    createdAt: (doc.created_at as string) ?? "",
    updatedAt: (doc.updated_at as string) ?? "",
  };
}

function roleToDoc(data: Partial<AgentRole>): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  if (data.name !== undefined) map.name = data.name;
  if (data.description !== undefined) map.description = data.description;
  if (data.systemPrompt !== undefined) map.system_prompt = data.systemPrompt;
  if (data.providerId !== undefined) map.provider_id = data.providerId;
  if (data.modelName !== undefined) map.model_name = data.modelName;
  if (data.order !== undefined) map.order = data.order;
  if (data.isActive !== undefined) map.is_active = data.isActive;
  if (data.isLocked !== undefined) map.is_locked = data.isLocked;
  if (data.timeoutMs !== undefined) map.timeout_ms = data.timeoutMs;
  if (data.maxRetries !== undefined) map.max_retries = data.maxRetries;
  if (data.outputFormat !== undefined) map.output_format = data.outputFormat;
  if (data.includeNitPrompt !== undefined) map.include_nit_prompt = data.includeNitPrompt;
  if (data.temperature !== undefined) map.temperature = data.temperature;
  if (data.createdAt !== undefined) map.created_at = data.createdAt;
  if (data.updatedAt !== undefined) map.updated_at = data.updatedAt;
  return map;
}

export async function getAllRoles(activeOnly = false): Promise<AgentRole[]> {
  const db = getDb();
  const masterDbId = getMasterDbId();

  const queries = [Query.limit(100)];

  try {
    queries.push(Query.orderAsc("order"));
    const result = await db.listDocuments(masterDbId, COLLECTIONS.AGENT_ROLES, queries);
    const roles = result.documents.map(d => docToRole(d as unknown as RoleDoc));
    return activeOnly ? roles.filter(r => r.isActive) : roles;
  } catch {
    const result = await db.listDocuments(masterDbId, COLLECTIONS.AGENT_ROLES, [Query.limit(100)]);
    const roles = result.documents
      .map(d => docToRole(d as unknown as RoleDoc))
      .sort((a, b) => a.order - b.order);
    return activeOnly ? roles.filter(r => r.isActive) : roles;
  }
}

export async function getRoleById(id: string): Promise<AgentRole | null> {
  const db = getDb();
  const masterDbId = getMasterDbId();

  try {
    const doc = await db.getDocument(masterDbId, COLLECTIONS.AGENT_ROLES, id);
    return docToRole(doc as unknown as RoleDoc);
  } catch {
    return null;
  }
}

export async function getLockedRole(): Promise<AgentRole | null> {
  const db = getDb();
  const masterDbId = getMasterDbId();

  try {
    const result = await db.listDocuments(masterDbId, COLLECTIONS.AGENT_ROLES, [
      Query.equal("is_locked", true),
      Query.limit(1),
    ]);
    if (result.documents.length === 0) return null;
    return docToRole(result.documents[0] as unknown as RoleDoc);
  } catch {
    return null;
  }
}

export async function createRole(
  data: Omit<AgentRole, "id" | "createdAt" | "updatedAt">,
): Promise<AgentRole> {
  const db = getDb();
  const masterDbId = getMasterDbId();

  const allRoles = await getAllRoles();
  if (allRoles.some(r => r.name.toLowerCase() === data.name.toLowerCase())) {
    throw new Error(`Роль с именем "${data.name}" уже существует`);
  }

  const now = new Date().toISOString();
  const docData = {
    ...roleToDoc({ ...data, createdAt: now, updatedAt: now }),
  };

  const doc = await db.createDocument(
    masterDbId,
    COLLECTIONS.AGENT_ROLES,
    ID.unique(),
    docData,
  );

  logger.info("roleService", `Created role: ${data.name}`);
  return docToRole(doc as unknown as RoleDoc);
}

export async function updateRole(
  id: string,
  data: Partial<AgentRole>,
): Promise<AgentRole | null> {
  const db = getDb();
  const masterDbId = getMasterDbId();

  let existingDoc;
  try {
    existingDoc = await db.getDocument(masterDbId, COLLECTIONS.AGENT_ROLES, id);
  } catch {
    return null;
  }

  const existing = docToRole(existingDoc as unknown as RoleDoc);

  if (data.name && data.name.toLowerCase() !== existing.name.toLowerCase()) {
    const newName = data.name;
    const allRoles = await getAllRoles();
    if (allRoles.some(r => r.name.toLowerCase() === newName.toLowerCase() && r.id !== id)) {
      throw new Error(`Роль с именем "${newName}" уже существует`);
    }
  }

  if (existing.isLocked) {
    delete data.order;
    delete data.isLocked;
  }

  const prevPrompt = existing.systemPrompt;
  data.updatedAt = new Date().toISOString();

  const updateData = roleToDoc(data);
  const updatedDoc = await db.updateDocument(masterDbId, COLLECTIONS.AGENT_ROLES, id, updateData);

  if (data.systemPrompt && data.systemPrompt !== prevPrompt) {
    try {
      const historyResult = await db.listDocuments(masterDbId, COLLECTIONS.PROMPT_HISTORY, [
        Query.equal("agent_role_id", id),
        Query.limit(1000),
      ]);
      const version = historyResult.total + 1;

      await db.createDocument(masterDbId, COLLECTIONS.PROMPT_HISTORY, ID.unique(), {
        agent_role_id: id,
        system_prompt: data.systemPrompt,
        version,
        created_at: data.updatedAt,
      });
    } catch (err) {
      logger.error("roleService", "Failed to record prompt history", err);
    }
  }

  const updated = docToRole(updatedDoc as unknown as RoleDoc);
  logger.info("roleService", `Updated role: ${updated.name}`);
  return updated;
}

export async function deleteRole(id: string): Promise<boolean> {
  const db = getDb();
  const masterDbId = getMasterDbId();

  let existingDoc;
  try {
    existingDoc = await db.getDocument(masterDbId, COLLECTIONS.AGENT_ROLES, id);
  } catch {
    return false;
  }

  const existing = docToRole(existingDoc as unknown as RoleDoc);
  if (existing.isLocked) {
    logger.warn("roleService", `Cannot delete locked role: ${existing.name}`);
    return false;
  }

  await db.deleteDocument(masterDbId, COLLECTIONS.AGENT_ROLES, id);
  logger.info("roleService", `Deleted role: ${existing.name}`);
  return true;
}

export async function reorderRoles(orderedIds: string[]): Promise<void> {
  const db = getDb();
  const masterDbId = getMasterDbId();

  const allRoles = await getAllRoles();
  const maxLockedOrder = allRoles
    .filter(r => r.isLocked)
    .reduce((max, r) => Math.max(max, r.order), 0);

  const now = new Date().toISOString();

  for (let i = 0; i < orderedIds.length; i++) {
    const roleId = orderedIds[i]!;
    const role = allRoles.find(r => r.id === roleId);
    if (role && !role.isLocked) {
      await db.updateDocument(masterDbId, COLLECTIONS.AGENT_ROLES, roleId, {
        order: maxLockedOrder + i + 1,
        updated_at: now,
      });
    }
  }
}

export async function getPromptHistory(roleId: string): Promise<PromptHistoryEntry[]> {
  const db = getDb();
  const masterDbId = getMasterDbId();

  try {
    const result = await db.listDocuments(masterDbId, COLLECTIONS.PROMPT_HISTORY, [
      Query.equal("agent_role_id", roleId),
      Query.limit(100),
    ]);

    return result.documents
      .map(doc => ({
        id: (doc as unknown as RoleDoc).$id as string,
        agentRoleId: (doc as unknown as RoleDoc).agent_role_id as string,
        systemPrompt: (doc as unknown as RoleDoc).system_prompt as string,
        version: (doc as unknown as RoleDoc).version as number,
        createdAt: (doc as unknown as RoleDoc).created_at as string,
      }))
      .sort((a, b) => b.version - a.version);
  } catch {
    return [];
  }
}
