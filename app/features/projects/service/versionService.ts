import { getDb, generateId } from "~/lib/db/sqlite";
import type { ProjectVersion } from "@shared/types/project";
import { logger } from "~/lib/utils/logger";

interface VersionRow {
  id: string;
  project_id: string;
  code: string;
  prompt: string;
  model: string;
  agent_id: string;
  temperature: number;
  version_number: number;
  created_at: string;
}

function mapRow(row: VersionRow): ProjectVersion {
  let code: Record<string, string> = {};
  try {
    code = JSON.parse(row.code) as Record<string, string>;
  } catch (err) {
    logger.warn(
      "versionService",
      "Failed to parse version code JSON, using raw fallback",
      err,
    );
    code = { "App.tsx": row.code };
  }

  return {
    id: row.id,
    projectId: row.project_id,
    code,
    prompt: row.prompt,
    model: row.model,
    agentId: row.agent_id,
    temperature: row.temperature,
    versionNumber: row.version_number,
    createdAt: row.created_at,
  };
}

export async function listVersions(
  projectId: string,
): Promise<ProjectVersion[]> {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM versions WHERE project_id = ? ORDER BY version_number DESC LIMIT 50",
    )
    .all(projectId) as VersionRow[];
  return rows.map(mapRow);
}

export async function createVersion(data: {
  projectId: string;
  code: Record<string, string>;
  prompt: string;
  model: string;
  agentId: string;
  temperature: number;
}): Promise<ProjectVersion> {
  const db = getDb();
  const id = generateId();
  const now = new Date().toISOString();

  const lastRow = db
    .prepare(
      "SELECT version_number FROM versions WHERE project_id = ? ORDER BY version_number DESC LIMIT 1",
    )
    .get(data.projectId) as { version_number: number } | undefined;

  const nextNumber = lastRow ? lastRow.version_number + 1 : 1;

  db.prepare(
    `INSERT INTO versions (id, project_id, code, prompt, model, agent_id, temperature, version_number, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    data.projectId,
    JSON.stringify(data.code),
    data.prompt,
    data.model,
    data.agentId,
    data.temperature,
    nextNumber,
    now,
  );

  return {
    id,
    projectId: data.projectId,
    code: data.code,
    prompt: data.prompt,
    model: data.model,
    agentId: data.agentId,
    temperature: data.temperature,
    versionNumber: nextNumber,
    createdAt: now,
  };
}

export async function deleteVersion(id: string): Promise<void> {
  const db = getDb();
  db.prepare("DELETE FROM versions WHERE id = ?").run(id);
}
