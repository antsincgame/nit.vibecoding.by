import { getDb, COLLECTIONS, ID, Query } from "~/lib/db/appwrite";
import type { ChatMessage } from "@shared/types/message";
import { logger } from "~/lib/utils/logger";

interface ChatMessageDoc {
  $id: string;
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

function mapDoc(doc: ChatMessageDoc): ChatMessage {
  return {
    id: doc.$id,
    role: doc.role as ChatMessage["role"],
    content: doc.content,
    timestamp: doc.timestamp,
    model: doc.model ?? undefined,
    agentId: doc.agent_id ?? undefined,
    agentRoleId: doc.agent_role_id ?? undefined,
    agentRoleName: doc.agent_role_name ?? undefined,
    selectedBy: doc.selected_by ?? undefined,
    durationMs: doc.duration_ms ?? undefined,
  };
}

export async function getProjectMessages(
  databaseId: string,
): Promise<ChatMessage[]> {
  const db = getDb();
  try {
    const result = await db.listDocuments(
      databaseId,
      COLLECTIONS.CHAT_MESSAGES,
      [Query.orderAsc("timestamp"), Query.limit(5000)],
    );
    return (result.documents as unknown as ChatMessageDoc[]).map(mapDoc);
  } catch (e) {
    const result = await db.listDocuments(
      databaseId,
      COLLECTIONS.CHAT_MESSAGES,
      [Query.limit(5000)],
    );
    return (result.documents as unknown as ChatMessageDoc[]).map(mapDoc);
  }
}

export async function saveProjectMessages(
  databaseId: string,
  messages: ChatMessage[],
): Promise<void> {
  const db = getDb();

  try {
    const existing = await db.listDocuments(
      databaseId,
      COLLECTIONS.CHAT_MESSAGES,
      [Query.limit(5000)],
    );

    for (const doc of existing.documents) {
      await db.deleteDocument({
        databaseId,
        collectionId: COLLECTIONS.CHAT_MESSAGES,
        documentId: doc.$id,
      });
    }

    for (const msg of messages) {
      await db.createDocument({
        databaseId,
        collectionId: COLLECTIONS.CHAT_MESSAGES,
        documentId: msg.id ?? ID.unique(),
        data: {
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          model: msg.model ?? null,
          agent_id: msg.agentId ?? null,
          agent_role_id: msg.agentRoleId ?? null,
          agent_role_name: msg.agentRoleName ?? null,
          selected_by: msg.selectedBy ?? null,
          duration_ms: msg.durationMs ?? null,
        },
      });
    }
  } catch (err) {
    logger.error("chatService", "Failed to save project messages", err);
    throw err;
  }
}

export async function deleteProjectMessages(
  databaseId: string,
): Promise<void> {
  const db = getDb();
  const existing = await db.listDocuments(
    databaseId,
    COLLECTIONS.CHAT_MESSAGES,
    [Query.limit(5000)],
  );

  for (const doc of existing.documents) {
    await db.deleteDocument({
      databaseId,
      collectionId: COLLECTIONS.CHAT_MESSAGES,
      documentId: doc.$id,
    });
  }
}
