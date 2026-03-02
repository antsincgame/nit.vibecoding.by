import { useCallback, useRef } from "react";
import { useChatStore } from "~/lib/stores/chatStore";

type StreamOptions = {
  provider: string;
  model: string;
  projectType?: string;
  temperature?: number;
  maxTokens?: number;
};

type SSEPayload = { text?: string; error?: string };

// Max assistant messages kept in history. Each assistant message can be very large
// (full generated code). Keeping too many fills the model's context window → "terminated".
const MAX_ASSISTANT_TURNS = 2;

function buildMessageHistory() {
  const all = useChatStore.getState().messages;

  // Drop trailing empty assistant placeholder (added before stream starts)
  const last = all[all.length - 1];
  const messages = last && last.role === "assistant" && !last.content
    ? all.slice(0, -1)
    : all;

  // Sliding window: keep all user messages but truncate large assistant messages.
  // Strategy: walk from the end, keep the last MAX_ASSISTANT_TURNS assistant turns in full,
  // replace older assistant messages with a short summary to save tokens.
  let assistantCount = 0;
  const windowed = [...messages].reverse().map((m) => {
    if (m.role !== "assistant") return { id: m.id, role: m.role, content: m.content };
    assistantCount++;
    if (assistantCount <= MAX_ASSISTANT_TURNS) {
      return { id: m.id, role: m.role, content: m.content };
    }
    // Older assistant messages: keep only the first 200 chars as context hint
    const preview = m.content.slice(0, 200).trimEnd();
    return { id: m.id, role: m.role, content: preview ? `${preview}…[truncated]` : "" };
  }).reverse();

  return windowed;
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

      let accumulated = "";

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
            maxTokens: options.maxTokens ?? 8192,
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

        // Strip trailing "terminated" that some models (qwen3 variants) append as last token
        const cleaned = accumulated.replace(/\n*\bterminated\b\s*$/i, "").trimEnd();
        if (cleaned !== accumulated) {
          updateLastAssistantMessage(cleaned);
        }

        setStreaming({ isStreaming: false });
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setStreaming({ isStreaming: false });
          return;
        }

        const errorMessage = err instanceof Error ? err.message : "Generation failed";
        setStreaming({ isStreaming: false, error: errorMessage });
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
