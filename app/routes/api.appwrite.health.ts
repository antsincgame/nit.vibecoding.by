/**
 * GET /api/appwrite/health — проверка подключения к Appwrite.
 * Возвращает { ok: boolean, error?: string }.
 */

import { getDb, getMasterDbId } from "~/lib/db/appwrite";

export async function loader() {
  try {
    const db = getDb();
    const masterDbId = getMasterDbId();
    await db.get(masterDbId);
    return Response.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: msg.slice(0, 300) }, { status: 503 });
  }
}
