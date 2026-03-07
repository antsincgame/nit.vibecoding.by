import { useCallback, useRef } from "react";
import { useChatStore } from "~/lib/stores/chatStore";
import { useRoleStore } from "~/lib/stores/roleStore";
import { useProjectStore } from "~/lib/stores/projectStore";
import { useSettingsStore } from "~/lib/stores/settingsStore";
import { useAgentStore } from "~/lib/stores/agentStore";
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
        pipelineError = parsed.message;
        onEvent(parsed);
        break;
      }
      onEvent(parsed);
    } catch {
      // skip malformed JSON
    }
  }

  return { remaining, done, pipelineError };
}

let generationCounter = 0;

/** Abort any active pipeline stream. Called from project switch. */
let activeAbortController: AbortController | null = null;
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
      if (abortRef.current) abortRef.current.abort();

      const controller = new AbortController();
      abortRef.current = controller;
      activeAbortController = controller;

      const thisGenId = ++generationCounter;
      genIdRef.current = thisGenId;

      const isChainMode = options.roleId === CHAIN_ROLE_ID;
      useRoleStore.getState().resetPipeline();
      if (isChainMode) useRoleStore.getState().setChainMode(true);

      // User message
      addMessage({ id: crypto.randomUUID(), role: "user", content: prompt, timestamp: Date.now() });

      // First assistant placeholder
      addMessage({ id: crypto.randomUUID(), role: "assistant", content: "", timestamp: Date.now() });

      setStreaming({ isStreaming: true, currentContent: "", error: null });

      // Track per-step state
      let accumulated = "";      // text for CURRENT step
      let currentRoleName: string | undefined;
      let currentSelectedBy: string | undefined;
      let currentDuration: number | undefined;
      let currentModel: string | undefined;
      let currentProvider: string | undefined;
      let stepCount = 0;         // how many role_selected we've seen
      let pipelineError: string | null = null;

      const parser = new IncrementalArtifactParser((filePath, content) => {
        updateGeneratedFile(filePath, content);
      });

      // Helper: finalize current assistant message with metadata
      const finalizeCurrentMessage = () => {
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
      };

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
            useRoleStore.getState().handlePipelineEvent(event);

            switch (event.type) {
              case "session_init":
                useRoleStore.getState().setPipelineSessionId(
                  (event as Extract<PipelineEvent, { type: "session_init" }>).sessionId,
                );
                break;

              case "role_selected":
                // In chain mode: finalize previous message and start new one
                if (isChainMode && stepCount > 0) {
                  finalizeCurrentMessage();
                  // Add new assistant message for next agent
                  addMessage({
                    id: crypto.randomUUID(),
                    role: "assistant",
                    content: "",
                    timestamp: Date.now(),
                  });
                  accumulated = "";
                }
                stepCount++;
                currentRoleName = event.roleName;
                currentSelectedBy = event.selectedBy;
                currentDuration = undefined;
                currentModel = undefined;
                currentProvider = undefined;
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

              case "retry_reset":
                accumulated = "";
                updateLastAssistantMessage("");
                setStreaming({ currentContent: "" });
                logger.warn("pipeline", "Retry: discarding partial text");
                break;

              case "step_complete":
                currentDuration = event.durationMs;
                break;

              case "warning":
                logger.warn("pipeline", event.message);
                break;

              case "awaiting_user":
                logger.info("pipeline", `${event.roleName}: ${event.message}`);
                break;

              case "done":
                break;
            }
          });

          sseBuffer = result.remaining;
          if (result.pipelineError) {
            pipelineError = result.pipelineError;
            break;
          }
          if (result.done) break;
        }

        parser.flush();

        // Finalize the last (or only) assistant message
        finalizeCurrentMessage();

        if (pipelineError) {
          setStreaming({ isStreaming: false, error: pipelineError });
        } else if (!accumulated.trim() && !isChainMode) {
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
        if ((err as Error).name === "AbortError") {
          parser.flush();
          setStreaming({ isStreaming: false });
          useRoleStore.getState().resetPipeline();
          const pid = useProjectStore.getState().currentProject?.id;
          if (pid) persistToDb(pid);
          return;
        }

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
