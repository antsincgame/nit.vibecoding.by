import { z } from "zod";
import { CHAIN_ROLE_ID } from "@shared/types/agentRole";
import type { PipelineEvent } from "@shared/types/agentRole";
import {
  getOrCreateSession,
  selectRole,
  executeStepStreaming,
  executeChain,
} from "~/lib/services/agentPipeline";

const ExecuteSchema = z.object({
  projectId: z.string().min(1),
  sessionId: z.string().optional(),
  roleId: z.string().default(""),
  message: z.string().min(1).max(128_000),
  localContext: z.string().max(10_000).default(""),
  projectType: z.enum(["react", "html", "vue"]).default("react"),
});

function sseEncode(event: PipelineEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function action({ request }: { request: Request }) {
  const rawBody = await request.json().catch(() => null);
  if (!rawBody) {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ExecuteSchema.safeParse(rawBody);
  if (!parsed.success) {
    const detail = parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    return Response.json({ error: detail }, { status: 400 });
  }

  const { projectId, roleId, message, localContext, projectType } = parsed.data;
  const sessionId = parsed.data.sessionId ?? crypto.randomUUID();

  const memory = getOrCreateSession(sessionId, projectId);
  const encoder = new TextEncoder();

  // ─── Chain mode ────────────────────────────────────────
  if (roleId === CHAIN_ROLE_ID) {
    const readable = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(sseEncode({ type: "session_init", sessionId })));
          const gen = executeChain(memory, message, localContext, projectType, request.signal);
          for await (const event of gen) {
            controller.enqueue(encoder.encode(sseEncode(event)));
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          if ((err as Error).name === "AbortError") {
            controller.close();
            return;
          }
          const msg = err instanceof Error ? err.message : "Pipeline error";
          controller.enqueue(encoder.encode(sseEncode({ type: "error", message: msg })));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // ─── Single role mode (STREAMING) ────────────────────────
  const readable = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(sseEncode({ type: "session_init", sessionId })));

        // Select role
        const { role, selectedBy } = await selectRole(sessionId, roleId, message);

        controller.enqueue(
          encoder.encode(
            sseEncode({
              type: "role_selected",
              roleId: role.id,
              roleName: role.name,
              selectedBy,
            }),
          ),
        );

        controller.enqueue(
          encoder.encode(
            sseEncode({
              type: "step_start",
              roleName: role.name,
              model: role.modelName,
              provider: role.providerId,
            }),
          ),
        );

        // Stream step output token-by-token
        const gen = executeStepStreaming(
          role,
          memory,
          message,
          localContext,
          projectType,
          selectedBy,
          request.signal,
        );

        for await (const event of gen) {
          controller.enqueue(encoder.encode(sseEncode(event)));
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          controller.close();
          return;
        }
        const msg = err instanceof Error ? err.message : "Pipeline error";
        controller.enqueue(encoder.encode(sseEncode({ type: "error", message: msg })));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
