import { z } from "zod";
import { streamText } from "~/lib/server/llm/stream-text";

const ChatRequestSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  messages: z
    .array(
      z.object({
        id: z.string(),
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().max(128_000),
      }),
    )
    .min(1)
    .max(200),
  projectType: z.enum(["react", "html", "vue"]).optional().default("react"),
  temperature: z.number().min(0).max(2).optional().default(0.3),
  maxTokens: z.number().int().min(256).max(32_768).optional().default(8192),
  contextWindow: z.number().int().min(1024).max(1_000_000).optional().default(8192),
});

export async function action({ request }: { request: Request }) {
  const rawBody = await request.json().catch(() => null);
  if (!rawBody) {
    return Response.json({ error: "Invalid JSON body", code: "INVALID_REQUEST" }, { status: 400 });
  }

  const parsed = ChatRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const detail = parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    return Response.json({ error: detail, code: "INVALID_REQUEST" }, { status: 400 });
  }

  const { messages, provider, model, projectType, temperature, maxTokens, contextWindow } =
    parsed.data;

  try {
    const { stream: result, tokenBudget } = await streamText({
      messages,
      provider,
      model,
      projectType,
      temperature,
      maxTokens,
      contextWindow,
      serverEnv: process.env as Record<string, string>,
      abortSignal: request.signal,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          if (tokenBudget.overflow) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ warning: "Context window nearly full. Consider clearing chat history for better results." })}\n\n`),
            );
          }

          let chunkCount = 0;
          for await (const chunk of result.textStream) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
            chunkCount++;
          }

          if (chunkCount === 0) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ error: "Модель не вернула ответ. Возможно, модель не загружена в LM Studio. Проверьте, что модель активна." })}\n\n`),
            );
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") {
            controller.close();
            return;
          }
          const message = err instanceof Error ? err.message : "Stream error";
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
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
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message, code: "LLM_ERROR" }, { status: 500 });
  }
}
