import { z } from "zod";
import {
  getRoleById,
  updateRole,
  deleteRole,
  getPromptHistory,
} from "~/lib/services/roleService";

const UpdateRoleSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  description: z.string().min(10).max(500).optional(),
  systemPrompt: z.string().min(50).max(50_000).optional(),
  providerId: z.string().min(1).optional(),
  modelName: z.string().min(1).max(100).optional(),
  order: z.number().positive().optional(),
  isActive: z.boolean().optional(),
  timeoutMs: z.number().int().min(5000).max(300_000).optional(),
  maxRetries: z.number().int().min(0).max(5).optional(),
  outputFormat: z.enum(["freetext", "json"]).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

// GET /api/roles/:id — get role or its prompt history
export async function loader({ request, params }: { request: Request; params: { id: string } }) {
  const url = new URL(request.url);

  // GET /api/roles/:id?history=true → prompt history
  if (url.searchParams.get("history") === "true") {
    const history = getPromptHistory(params.id);
    return Response.json({ history });
  }

  const role = getRoleById(params.id);
  if (!role) {
    return Response.json({ error: "Role not found" }, { status: 404 });
  }
  return Response.json({ role });
}

// PUT/DELETE /api/roles/:id
export async function action({ request, params }: { request: Request; params: { id: string } }) {
  const { id } = params;

  // DELETE
  if (request.method === "DELETE") {
    const role = getRoleById(id);
    if (!role) {
      return Response.json({ error: "Role not found" }, { status: 404 });
    }
    if (role.isLocked) {
      return Response.json({ error: "Cannot delete locked role" }, { status: 403 });
    }
    deleteRole(id);
    return Response.json({ ok: true });
  }

  // PUT
  const rawBody = await request.json().catch(() => null);
  if (!rawBody) {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = UpdateRoleSchema.safeParse(rawBody);
  if (!parsed.success) {
    const detail = parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    return Response.json({ error: detail }, { status: 400 });
  }

  try {
    const updated = updateRole(id, parsed.data);
    if (!updated) {
      return Response.json({ error: "Role not found" }, { status: 404 });
    }
    return Response.json({ role: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update role";
    return Response.json({ error: msg }, { status: 409 });
  }
}
