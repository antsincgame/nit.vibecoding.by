import { useCallback, useRef } from "react";
import { useChatStore } from "~/lib/stores/chatStore";
import { useRoleStore } from "~/lib/stores/roleStore";
import { useProjectStore } from "~/lib/stores/projectStore";
import { IncrementalArtifactParser } from "~/lib/utils/codeParser";
import type { PipelineEvent } from "@shared/types/agentRole";
import { CHAIN_ROLE_ID } from "@shared/types/agentRole";
import { logger } from "~/lib/utils/logger";

type PipelineStreamOptions = {
  projectId: string;
  roleId: string;
  localContext: string;
  projectType: string;
  sessionId?: string;
};

/**
 * Parse SSE buffer line-by-line.
 * Returns: { remaining buffer, done flag, error if pipeline sent error event }
 * Does NOT throw — returns error as data so caller can handle cleanup.
 */
function parsePipelineSSE(
  buffer: string,
  onEvent: (event: PipelineEvent) => void,
): { remaining: string; done: boolean; pipelineError: string | null } {
  let remaining = buffer;
  let done = false;
  let pipelineError: string | null = null;

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
      const parsed = JSON.parse(payload) as PipelineEvent;

      if (parsed.type === "error") {
        // Don't throw — capture error and break cleanly
        pipelineError = parsed.message;
        onEvent(parsed); // Still forward so roleStore updates UI
        break;
      }

      onEvent(parsed);
    } catch {
      // skip malformed JSON
    }
  }

  return { remaining, done, pipelineError };
}

/**
 * Generation counter protects against race conditions:
 * Double-click Generate won't cause gen1's finally to null gen2's controller.
 */
let generationCounter = 0;

/** Module-level abort controller — accessible from outside React for project switch */
let activeAbortController: AbortController | null = null;

/** Abort any active pipeline stream. Safe to call from anywhere. */
export function abortActivePipeline() {
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
}

export function usePipelineStreaming() {
  const abortRef = useRef<AbortController | null>(null);
  const genIdRef = useRef(0);

  const {
    addMessage,
    updateLastAssistantMessage,
    setStreaming,
    updateGeneratedFile,
    persistToDb,
  } = useChatStore();

  const generate = useCallback(
    async (prompt: string, options: PipelineStreamOptions) => {
      // Abort previous request if still running
      if (abortRef.current) abortRef.current.abort();

      const controller = new AbortController();
      abortRef.current = controller;
      activeAbortController = controller;

      const thisGenId = ++generationCounter;
      genIdRef.current = thisGenId;

      useRoleStore.getState().resetPipeline();

      // Tell the store if this is chain mode so UI knows before server events arrive
      if (options.roleId === CHAIN_ROLE_ID) {
        useRoleStore.getState().setChainMode(true);
      }

      addMessage({ id: crypto.randomUUID(), role: "user", content: prompt, timestamp: Date.now() });
      addMessage({ id: crypto.randomUUID(), role: "assistant", content: "", timestamp: Date.now() });

      setStreaming({ isStreaming: true, currentContent: "", error: null });

      // State accumulated across the stream
      let accumulated = "";
      let currentRoleName: string | undefined;
      let currentSelectedBy: string | undefined;
      let currentDuration: number | undefined;
      let currentModel: string | undefined;
      let currentProvider: string | undefined;
      let pipelineError: string | null = null;

      const parser = new IncrementalArtifactParser((filePath, content) => {
        updateGeneratedFile(filePath, content);
      });

      try {
        const response = await fetch("/api/pipeline/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: options.projectId,
            sessionId: options.sessionId,
            roleId: options.roleId,
            message: prompt,
            localContext: options.localContext,
            projectType: options.projectType,
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

          const result = parsePipelineSSE(sseBuffer, (event) => {
            // Forward to role store for UI status
            useRoleStore.getState().handlePipelineEvent(event);

            switch (event.type) {
              case "session_init":
                useRoleStore.getState().setPipelineSessionId(
                  (event as Extract<PipelineEvent, { type: "session_init" }>).sessionId,
                );
                break;
              case "role_selected":
                currentRoleName = event.roleName;
                currentSelectedBy = event.selectedBy;
                break;
              case "step_start":
                currentModel = event.model;
                currentProvider = event.provider;
                break;
              case "text":
                accumulated += event.text;
                parser.push(event.text);
                updateLastAssistantMessage(accumulated);
                setStreaming({ currentContent: accumulated });
                break;
              case "step_complete":
                currentDuration = event.durationMs;
                break;
              case "warning":
                logger.warn("pipeline", event.message);
                break;
              case "done":
                break;
              // "error" is handled by parsePipelineSSE — sets pipelineError
            }
          });

          sseBuffer = result.remaining;

          if (result.pipelineError) {
            pipelineError = result.pipelineError;
            break; // Exit reader loop cleanly
          }
          if (result.done) break;
        }

        // ALWAYS flush parser — even on error, extract whatever files were parsed
        parser.flush();

        // ALWAYS update assistant message metadata
        const chatStore = useChatStore.getState();
        const msgs = [...chatStore.messages];
        const lastIdx = msgs.findLastIndex((m) => m.role === "assistant");
        if (lastIdx >= 0) {
          msgs[lastIdx] = {
            ...msgs[lastIdx]!,
            agentRoleName: currentRoleName,
            selectedBy: currentSelectedBy,
            durationMs: currentDuration,
            model: currentModel,
            agentId: currentProvider,
          };
          useChatStore.setState({ messages: msgs });
        }

        // Set final state based on outcome
        if (pipelineError) {
          setStreaming({ isStreaming: false, error: pipelineError });
        } else if (!accumulated.trim()) {
          setStreaming({
            isStreaming: false,
            error: "Агент не сгенерировал ответ. Проверьте модель и провайдер.",
          });
        } else {
          setStreaming({ isStreaming: false });
        }

        useRoleStore.getState().handlePipelineEvent({ type: "done" });

        const pid = useProjectStore.getState().currentProject?.id;
        if (pid) persistToDb(pid);
      } catch (err) {
        // AbortError = user clicked Stop
        if ((err as Error).name === "AbortError") {
          // Still flush parser for whatever was received
          parser.flush();
          setStreaming({ isStreaming: false });
          useRoleStore.getState().resetPipeline();
          const pid = useProjectStore.getState().currentProject?.id;
          if (pid) persistToDb(pid);
          return;
        }

        // Network error / unexpected error
        parser.flush();
        const errorMessage = err instanceof Error ? err.message : "Pipeline failed";
        setStreaming({ isStreaming: false, error: errorMessage });
        useRoleStore.getState().handlePipelineEvent({ type: "error", message: errorMessage });

        const pid = useProjectStore.getState().currentProject?.id;
        if (pid) persistToDb(pid);
      } finally {
        if (genIdRef.current === thisGenId) {
          abortRef.current = null;
          activeAbortController = null;
        }
      }
    },
    [addMessage, updateLastAssistantMessage, setStreaming, updateGeneratedFile, persistToDb],
  );

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      activeAbortController = null;
      setStreaming({ isStreaming: false });
      useRoleStore.getState().resetPipeline();
    }
  }, [setStreaming]);

  return { generate, stop };
}
