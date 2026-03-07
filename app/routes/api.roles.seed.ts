/**
 * POST /api/roles/seed — создать дефолтные роли (только если ролей ещё нет)
 * POST /api/roles/seed?force=1 — удалить все роли и создать 6 по умолчанию
 * Body: { providerId?: string, modelName?: string } — основная LLM для ролей
 */

import { ensureMasterSchema } from "~/lib/db/appwrite";
import { seedOrCreateDefaultRoles, seedOrCreateDefaultRolesForce } from "~/lib/db/appwrite";
import { logger } from "~/lib/utils/logger";

export async function loader({ request }: { request: Request }) {
  if (request.method !== "GET") return null;
  return Response.json({ error: "Method not allowed. Use POST." }, { status: 405 });
}

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";

  let providerId: string | undefined;
  let modelName: string | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    if (body && typeof body === "object") {
      if (typeof body.providerId === "string" && body.providerId.trim()) providerId = body.providerId.trim();
      if (typeof body.modelName === "string" && body.modelName.trim()) modelName = body.modelName.trim();
    }
  } catch {
    // ignore body parse errors
  }

  const llmOptions = providerId && modelName ? { providerId, modelName } : undefined;

  try {
    await ensureMasterSchema();
    const result = force
      ? await seedOrCreateDefaultRolesForce(llmOptions)
      : await seedOrCreateDefaultRoles(llmOptions);
    if (result.seeded) {
      return Response.json({ ok: true, message: result.message }, { status: 201 });
    }
    return Response.json({ ok: false, message: result.message }, { status: 409 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ошибка при создании ролей";
    logger.error("api.roles.seed", "Seed failed", err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
