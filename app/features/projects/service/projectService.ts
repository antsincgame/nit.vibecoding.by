import { getDb, generateId } from "~/lib/db/sqlite";
import type { Project, CreateProjectInput } from "@shared/types/project";

interface ProjectRow {
  id: string;
  name: string;
  description: string;
  type: string;
  agent_id: string;
  model_used: string;
  created_at: string;
  updated_at: string;
}

function mapRow(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as Project["type"],
    agentId: row.agent_id,
    modelUsed: row.model_used,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listProjects(): Promise<Project[]> {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM projects ORDER BY created_at DESC LIMIT 100")
    .all() as ProjectRow[];
  return rows.map(mapRow);
}

export async function getProject(id: string): Promise<Project> {
  const db = getDb();
  const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as
    | ProjectRow
    | undefined;

  if (!row) {
    throw new Error(`Project not found: ${id}`);
  }

  return mapRow(row);
}

export async function createProject(
  input: CreateProjectInput,
): Promise<Project> {
  const db = getDb();
  const id = generateId();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO projects (id, name, description, type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, input.name, input.description, input.type, now, now);

  return {
    id,
    name: input.name,
    description: input.description,
    type: input.type,
    agentId: "",
    modelUsed: "",
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateProject(
  id: string,
  data: Partial<CreateProjectInput & { agentId: string; modelUsed: string }>,
): Promise<Project> {
  const db = getDb();
  const now = new Date().toISOString();

  const sets: string[] = ["updated_at = ?"];
  const params: unknown[] = [now];

  if (data.name !== undefined) {
    sets.push("name = ?");
    params.push(data.name);
  }
  if (data.description !== undefined) {
    sets.push("description = ?");
    params.push(data.description);
  }
  if (data.type !== undefined) {
    sets.push("type = ?");
    params.push(data.type);
  }
  if (data.agentId !== undefined) {
    sets.push("agent_id = ?");
    params.push(data.agentId);
  }
  if (data.modelUsed !== undefined) {
    sets.push("model_used = ?");
    params.push(data.modelUsed);
  }

  params.push(id);

  db.prepare(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`).run(
    ...params,
  );

  return getProject(id);
}

export async function deleteProject(id: string): Promise<void> {
  const db = getDb();
  db.prepare("DELETE FROM projects WHERE id = ?").run(id);
}
