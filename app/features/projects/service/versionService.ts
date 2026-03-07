import { getDb, COLLECTIONS, ID, Query } from "~/lib/db/appwrite";
import type { ProjectVersion } from "@shared/types/project";
import { logger } from "~/lib/utils/logger";

interface VersionDoc {
  $id: string;
  code: string;
  prompt: string;
  model: string;
  agent_id: string;
  temperature: number;
  version_number: number;
  created_at: string;
}

function mapDoc(doc: VersionDoc, databaseId: string): ProjectVersion {
  let code: Record<string, string> = {};
  try {
    code = JSON.parse(doc.code) as Record<string, string>;
  } catch (err) {
    logger.warn(
      "versionService",
      "Failed to parse version code JSON, using raw fallback",
      err,
    );
    code = { "App.tsx": doc.code };
  }

  return {
    id: doc.$id,
    projectId: databaseId,
    code,
    prompt: doc.prompt,
    model: doc.model,
    agentId: doc.agent_id,
    temperature: doc.temperature,
    versionNumber: doc.version_number,
    createdAt: doc.created_at,
  };
}

export async function listVersions(
  databaseId: string,
): Promise<ProjectVersion[]> {
  const db = getDb();
  try {
    const result = await db.listDocuments(
      databaseId,
      COLLECTIONS.VERSIONS,
      [Query.orderDesc("version_number"), Query.limit(50)],
    );
    return (result.documents as unknown as VersionDoc[]).map((d) =>
      mapDoc(d, databaseId),
    );
  } catch (e) {
    const result = await db.listDocuments(
      databaseId,
      COLLECTIONS.VERSIONS,
      [Query.limit(50)],
    );
    return (result.documents as unknown as VersionDoc[]).map((d) =>
      mapDoc(d, databaseId),
    );
  }
}

export async function createVersion(data: {
  databaseId: string;
  code: Record<string, string>;
  prompt: string;
  model: string;
  agentId: string;
  temperature: number;
}): Promise<ProjectVersion> {
  const db = getDb();
  const now = new Date().toISOString();

  const existing = await db.listDocuments(
    data.databaseId,
    COLLECTIONS.VERSIONS,
    [Query.orderDesc("version_number"), Query.limit(1)],
  );

  const lastDoc = existing.documents[0] as unknown as VersionDoc | undefined;
  const nextNumber = lastDoc ? lastDoc.version_number + 1 : 1;

  const doc = await db.createDocument(
    data.databaseId,
    COLLECTIONS.VERSIONS,
    ID.unique(),
    {
      code: JSON.stringify(data.code),
      prompt: data.prompt,
      model: data.model,
      agent_id: data.agentId,
      temperature: data.temperature,
      version_number: nextNumber,
      created_at: now,
    },
  );

  return mapDoc(doc as unknown as VersionDoc, data.databaseId);
}

export async function deleteVersion(
  databaseId: string,
  versionId: string,
): Promise<void> {
  const db = getDb();
  await db.deleteDocument(databaseId, COLLECTIONS.VERSIONS, versionId);
}
