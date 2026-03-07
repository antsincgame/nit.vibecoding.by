import {
  getDb,
  getMasterDbId,
  COLLECTIONS,
  ensureMasterSchema,
  createProjectDatabase,
  deleteProjectDatabase,
  ID,
  Query,
} from "~/lib/db/appwrite";
import type { Project, CreateProjectInput } from "@shared/types/project";

interface ProjectDoc {
  $id: string;
  name: string;
  description: string;
  type: string;
  agent_id: string;
  model_used: string;
  database_id: string;
  created_at: string;
  updated_at: string;
}

function mapDoc(doc: ProjectDoc): Project {
  return {
    id: doc.$id,
    name: doc.name,
    description: doc.description,
    type: doc.type as Project["type"],
    agentId: doc.agent_id,
    modelUsed: doc.model_used,
    databaseId: doc.database_id,
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
  };
}

let schemaReady = false;

async function ready(): Promise<void> {
  if (schemaReady) return;
  await ensureMasterSchema();
  schemaReady = true;
}

export async function listProjects(): Promise<Project[]> {
  await ready();
  const db = getDb();
  
  // Wait for index/attributes to be ready in Appwrite
  await new Promise(resolve => setTimeout(resolve, 500));
  
  try {
    const result = await db.listDocuments(
      getMasterDbId(),
      COLLECTIONS.PROJECTS,
      [Query.orderDesc("$createdAt"), Query.limit(100)],
    );
    return (result.documents as unknown as ProjectDoc[]).map(mapDoc);
  } catch (e) {
    // Fallback if index isn't ready
    const result = await db.listDocuments(
      getMasterDbId(),
      COLLECTIONS.PROJECTS,
      [Query.limit(100)],
    );
    return (result.documents as unknown as ProjectDoc[]).map(mapDoc);
  }
}

export async function getProject(id: string): Promise<Project> {
  await ready();
  const db = getDb();
  const doc = await db.getDocument({
    databaseId: getMasterDbId(),
    collectionId: COLLECTIONS.PROJECTS,
    documentId: id,
  });
  return mapDoc(doc as unknown as ProjectDoc);
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  await ready();
  const db = getDb();
  const now = new Date().toISOString();
  const projectType = input.type ?? "react";

  const projectDbId = await createProjectDatabase(input.name);

  const doc = await db.createDocument({
    databaseId: getMasterDbId(),
    collectionId: COLLECTIONS.PROJECTS,
    documentId: ID.unique(),
    data: {
      name: input.name,
      description: input.description,
      type: projectType,
      agent_id: "",
      model_used: "",
      database_id: projectDbId,
      created_at: now,
      updated_at: now,
    },
  });

  return mapDoc(doc as unknown as ProjectDoc);
}

export async function updateProject(
  id: string,
  data: Partial<CreateProjectInput & { agentId: string; modelUsed: string }>,
): Promise<Project> {
  await ready();
  const db = getDb();
  const now = new Date().toISOString();

  const updates: Record<string, unknown> = { updated_at: now };

  if (data.name !== undefined) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;
  if (data.type !== undefined) updates.type = data.type;
  if (data.agentId !== undefined) updates.agent_id = data.agentId;
  if (data.modelUsed !== undefined) updates.model_used = data.modelUsed;

  const doc = await db.updateDocument({
    databaseId: getMasterDbId(),
    collectionId: COLLECTIONS.PROJECTS,
    documentId: id,
    data: updates,
  });

  return mapDoc(doc as unknown as ProjectDoc);
}

export async function deleteProject(id: string): Promise<void> {
  await ready();
  const db = getDb();

  const doc = await db.getDocument({
    databaseId: getMasterDbId(),
    collectionId: COLLECTIONS.PROJECTS,
    documentId: id,
  });

  const databaseId = (doc as unknown as ProjectDoc).database_id;

  await db.deleteDocument({
    databaseId: getMasterDbId(),
    collectionId: COLLECTIONS.PROJECTS,
    documentId: id,
  });

  if (databaseId) {
    await deleteProjectDatabase(databaseId);
  }
}
