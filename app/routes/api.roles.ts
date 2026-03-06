import { z } from "zod";
import {
  getAllRoles,
  createRole,
  reorderRoles,
} from "~/lib/services/roleService";

// GET /api/roles — list all roles
export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const activeOnly = url.searchParams.get("active") === "true";
  const roles = getAllRoles(activeOnly);
  return Response.json({ roles });
}

const CreateRoleSchema = z.object({
  name: z.string().min(2).max(50),
  description: z.string().min(10).max(500),
  systemPrompt: z.string().min(50).max(50_000),
  providerId: z.string().min(1),
  modelName: z.string().min(1).max(100),
  order: z.number().positive(),
  isActive: z.boolean().default(true),
  isLocked: z.boolean().default(false),
  timeoutMs: z.number().int().min(5000).max(300_000).default(60_000),
  maxRetries: z.number().int().min(0).max(5).default(2),
  outputFormat: z.enum(["freetext", "json"]).default("freetext"),
  temperature: z.number().min(0).max(2).default(0.7),
});

const ReorderSchema = z.object({
  orderedIds: z.array(z.string()).min(1),
});

// POST /api/roles — create role or reorder
export async function action({ request }: { request: Request }) {
  const rawBody = await request.json().catch(() => null);
  if (!rawBody) {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Check if this is a reorder request
  if ((rawBody as Record<string, unknown>).orderedIds) {
    const parsed = ReorderSchema.safeParse(rawBody);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.message }, { status: 400 });
    }
    reorderRoles(parsed.data.orderedIds);
    return Response.json({ ok: true });
  }

  // Otherwise: create role
  const parsed = CreateRoleSchema.safeParse(rawBody);
  if (!parsed.success) {
    const detail = parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    return Response.json({ error: detail }, { status: 400 });
  }

  try {
    const role = createRole(parsed.data);
    return Response.json({ role }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create role";
    return Response.json({ error: msg }, { status: 409 });
  }
}
