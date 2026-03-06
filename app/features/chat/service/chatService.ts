import { getDb } from "~/lib/db/sqlite";
import type { ChatMessage } from "@shared/types/message";
import { logger } from "~/lib/utils/logger";

interface ChatMessageRow {
  id: string;
  project_id: string;
  role: string;
  content: string;
  timestamp: number;
  model: string | null;
  agent_id: string | null;
  agent_role_id: string | null;
  agent_role_name: string | null;
  selected_by: string | null;
  duration_ms: number | null;
}

function mapRow(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    role: row.role as ChatMessage["role"],
    content: row.content,
    timestamp: row.timestamp,
    model: row.model ?? undefined,
    agentId: row.agent_id ?? undefined,
    agentRoleId: row.agent_role_id ?? undefined,
    agentRoleName: row.agent_role_name ?? undefined,
    selectedBy: row.selected_by ?? undefined,
    durationMs: row.duration_ms ?? undefined,
  };
}

export function getProjectMessages(projectId: string): ChatMessage[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM chat_messages WHERE project_id = ? ORDER BY timestamp ASC")
    .all(projectId) as ChatMessageRow[];
  return rows.map(mapRow);
}

export function saveProjectMessages(
  projectId: string,
  messages: ChatMessage[],
): void {
  const db = getDb();

  const tx = db.transaction(() => {
    db.prepare("DELETE FROM chat_messages WHERE project_id = ?").run(projectId);

    if (messages.length === 0) return;

    const insert = db.prepare(
      `INSERT OR REPLACE INTO chat_messages (id, project_id, role, content, timestamp, model, agent_id, agent_role_id, agent_role_name, selected_by, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const msg of messages) {
      insert.run(
        msg.id,
        projectId,
        msg.role,
        msg.content,
        msg.timestamp,
        msg.model ?? null,
        msg.agentId ?? null,
        msg.agentRoleId ?? null,
        msg.agentRoleName ?? null,
        msg.selectedBy ?? null,
        msg.durationMs ?? null,
      );
    }
  });

  try {
    tx();
  } catch (err) {
    logger.error("chatService", "Failed to save project messages", err);
    throw err;
  }
}

export function deleteProjectMessages(projectId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM chat_messages WHERE project_id = ?").run(projectId);
}
