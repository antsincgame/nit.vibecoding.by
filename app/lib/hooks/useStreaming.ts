import { useCallback, useRef } from "react";
import { useChatStore } from "~/lib/stores/chatStore";
import { useAgentStore } from "~/lib/stores/agentStore";
import { useProjectStore } from "~/lib/stores/projectStore";
import { estimateTokens } from "~/lib/utils/tokenEstimator";
import { IncrementalArtifactParser } from "~/lib/utils/codeParser";

type StreamOptions = {
  provider: string;
  model: string;
  projectType?: string;
  temperature?: number;
  maxTokens?: number;
  contextWindow?: number;
};

type SSEPayload = { text?: string; error?: string; warning?: string };

const DEFAULT_CONTEXT_WINDOW = 8192;
const HISTORY_BUDGET_RATIO = 0.4;
const MIN_ASSISTANT_PREVIEW = 200;

function getSelectedContextWindow(): number {
  const { agents, selection } = useAgentStore.getState();
  const agent = agents.find((a) => a.id === selection.agentId);
  if (!agent) return DEFAULT_CONTEXT_WINDOW;
  const model = agent.models.find((m) => m.id === selection.modelId);
  return model?.contextLength ?? DEFAULT_CONTEXT_WINDOW;
}

function buildMessageHistory(contextWindow: number): Array<{ id: string; role: string; content: string }> {
  const all = useChatStore.getState().messages;

  const last = all[all.length - 1];
  const messages = last && last.role === "assistant" && !last.content
    ? all.slice(0, -1)
    : all;

  const historyBudget = Math.floor(contextWindow * HISTORY_BUDGET_RATIO);
  let usedTokens = 0;
  const result: Array<{ id: string; role: string; content: string }> = [];

  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    const contentTokens = estimateTokens(m.content);

    if (usedTokens + contentTokens <= historyBudget) {
      result.unshift({ id: m.id, role: m.role, content: m.content });
      usedTokens += contentTokens;
    } else if (m.role === "user") {
      const remaining = historyBudget - usedTokens;
      if (remaining > 50) {
        const charLimit = Math.floor(remaining * 3.5);
        result.unshift({ id: m.id, role: m.role, content: m.content.slice(0, charLimit) });
      }
      break;
    } else {
      const preview = m.content.slice(0, MIN_ASSISTANT_PREVIEW).trimEnd();
      result.unshift({ id: m.id, role: m.role, content: preview ? `${preview}…[truncated]` : "" });
      usedTokens += estimateTokens(preview) + 5;
      if (usedTokens >= historyBudget) break;
    }
  }

  return result;
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
      if (parsed.warning) {
        console.warn("[NIT.BY]", parsed.warning);
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
  const { addMessage, updateLastAssistantMessage, setStreaming, updateGeneratedFile, persistToDb } = useChatStore();

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

      const parser = new IncrementalArtifactParser((filePath, content) => {
        updateGeneratedFile(filePath, content);
      });

      try {
        const ctxWindow = options.contextWindow ?? getSelectedContextWindow();
        const allMessages = buildMessageHistory(ctxWindow);

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
            contextWindow: ctxWindow,
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
            parser.push(text);
            updateLastAssistantMessage(accumulated);
            setStreaming({ currentContent: accumulated });
          });

          sseBuffer = result.remaining;

          if (result.error) throw new Error(result.error);
          if (result.done) break;
        }

        parser.flush();

        const cleaned = accumulated.replace(/\n*\bterminated\b\s*$/i, "").trimEnd();
        if (cleaned !== accumulated) {
          updateLastAssistantMessage(cleaned);
        }

        if (!cleaned) {
          setStreaming({
            isStreaming: false,
            error: "Модель не сгенерировала ответ. Возможно, контекстное окно слишком мало для данной модели. Попробуйте модель с большим контекстом.",
          });
        } else {
          setStreaming({ isStreaming: false });
        }
        const pid = useProjectStore.getState().currentProject?.id;
        if (pid) persistToDb(pid);
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setStreaming({ isStreaming: false });
          const pid = useProjectStore.getState().currentProject?.id;
          if (pid) persistToDb(pid);
          return;
        }

        const errorMessage = err instanceof Error ? err.message : "Generation failed";
        setStreaming({ isStreaming: false, error: errorMessage });
        const pid = useProjectStore.getState().currentProject?.id;
        if (pid) persistToDb(pid);
      } finally {
        abortRef.current = null;
      }
    },
    [addMessage, updateLastAssistantMessage, setStreaming, updateGeneratedFile, persistToDb],
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
