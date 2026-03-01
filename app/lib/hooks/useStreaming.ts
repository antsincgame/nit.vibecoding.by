import { useCallback, useRef } from "react";
import { useChatStore } from "~/lib/stores/chatStore";

type StreamOptions = {
  provider: string;
  model: string;
  projectType?: string;
  temperature?: number;
};

type SSEPayload = { text?: string; error?: string };

function buildMessageHistory() {
  const all = useChatStore.getState().messages;
  const last = all[all.length - 1];
  const filtered = last && last.role === "assistant" && !last.content
    ? all.slice(0, -1)
    : all;
  return filtered.map((m) => ({ id: m.id, role: m.role, content: m.content }));
}

function processSSEBuffer(
  buffer: string,
  onText: (text: string) => void,
): { remaining: string; done: boolean; error: string | null } {
  let remaining = buffer;
  let done = false;
  let error: string | null = null;

  while (true) {
    const newlineIdx = remaining.indexOf("\n");
    if (newlineIdx === -1) break;

    const line = remaining.slice(0, newlineIdx);
    remaining = remaining.slice(newlineIdx + 1);

    const trimmed = line.trim();
    if (!trimmed.startsWith("data: ")) continue;

    const payload = trimmed.slice(6).trim();

    if (payload === "[DONE]") {
      done = true;
      break;
    }

    try {
      const parsed = JSON.parse(payload) as SSEPayload;
      if (parsed.error) {
        error = parsed.error;
        break;
      }
      if (parsed.text) {
        onText(parsed.text);
      }
    } catch (parseErr) {
      if (!(parseErr instanceof SyntaxError)) {
        error = parseErr instanceof Error ? parseErr.message : "Parse error";
        break;
      }
    }
  }

  return { remaining, done, error };
}

export function useStreaming() {
  const abortRef = useRef<AbortController | null>(null);
  const { addMessage, updateLastAssistantMessage, setStreaming } = useChatStore();

  const generate = useCallback(
    async (prompt: string, options: StreamOptions) => {
      if (abortRef.current) {
        abortRef.current.abort();
      }

      const controller = new AbortController();
      abortRef.current = controller;

      const userMessage = {
        id: crypto.randomUUID(),
        role: "user" as const,
        content: prompt,
        timestamp: Date.now(),
      };
      addMessage(userMessage);

      const assistantMessage = {
        id: crypto.randomUUID(),
        role: "assistant" as const,
        content: "",
        timestamp: Date.now(),
        model: options.model,
        agentId: options.provider,
      };
      addMessage(assistantMessage);

      setStreaming({ isStreaming: true, currentContent: "", error: null });

      try {
        const allMessages = buildMessageHistory();

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: allMessages,
            provider: options.provider,
            model: options.model,
            projectType: options.projectType ?? "react",
            temperature: options.temperature ?? 0.3,
            maxTokens: 16384,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: "Request failed" }));
          throw new Error((err as { error?: string }).error ?? `HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let accumulated = "";
        let sseBuffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });

          const result = processSSEBuffer(sseBuffer, (text) => {
            accumulated += text;
            updateLastAssistantMessage(accumulated);
            setStreaming({ currentContent: accumulated });
          });

          sseBuffer = result.remaining;

          if (result.error) throw new Error(result.error);
          if (result.done) break;
        }

        setStreaming({ isStreaming: false });
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setStreaming({ isStreaming: false });
          return;
        }

        const errorMessage = err instanceof Error ? err.message : "Generation failed";
        setStreaming({ isStreaming: false, error: errorMessage });
        updateLastAssistantMessage(`Error: ${errorMessage}`);
      } finally {
        abortRef.current = null;
      }
    },
    [addMessage, updateLastAssistantMessage, setStreaming],
  );

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setStreaming({ isStreaming: false });
    }
  }, [setStreaming]);

  return { generate, stop };
}
