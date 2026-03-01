import { streamText } from "~/lib/server/llm/stream-text";

export async function action({ request }: { request: Request }) {
  const body = await request.json();
  const { messages, provider, model, projectType, temperature, maxTokens } = body as {
    messages: Array<{ id: string; role: string; content: string }>;
    provider: string;
    model: string;
    projectType?: string;
    temperature?: number;
    maxTokens?: number;
  };

  if (!provider || !model || !messages?.length) {
    return Response.json(
      { error: "Missing required fields: provider, model, messages", code: "INVALID_REQUEST" },
      { status: 400 },
    );
  }

  try {
    const result = await streamText({
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      })),
      provider,
      model,
      projectType,
      temperature,
      maxTokens,
      serverEnv: process.env as Record<string, string>,
      abortSignal: request.signal,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.textStream) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
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
