import { useEffect, useRef } from "react";
import { useChatStore } from "~/lib/stores/chatStore";
import { useAgentStore } from "~/lib/stores/agentStore";
import { useProjectStore } from "~/lib/stores/projectStore";
import { useSettingsStore } from "~/lib/stores/settingsStore";
import { useStreaming } from "~/lib/hooks/useStreaming";
import { useProjects } from "~/features/projects/hooks/useProjects";
import { useVersionHistory } from "~/features/projects/hooks/useVersionHistory";
import { parseGeneratedCode, sanitizeVersionCode } from "~/lib/utils/codeParser";
import { MessageList } from "./MessageList";
import { PromptInput } from "./PromptInput";
import { GlowText } from "~/components/ui/GlowText";
import { useT } from "~/lib/utils/i18n";

export function ChatPanel() {
  const { messages, streaming, isChatLoading } = useChatStore();
  const { selection, agents } = useAgentStore();
  const { currentProject } = useProjectStore();
  const { generate, stop } = useStreaming();
  const { create: createProject } = useProjects();
  const { saveVersion } = useVersionHistory();

  const wasStreamingRef = useRef(false);
  const lastPromptRef = useRef("");
  const lastOptionsRef = useRef({ model: "", agentId: "", temperature: 0.3 });

  const t = useT();
  const hasAgent = agents.some((a) => a.id === selection.agentId && a.status === "online");

  useEffect(() => {
    if (wasStreamingRef.current && !streaming.isStreaming) {
      const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && m.content);
      if (!lastAssistant?.content) return;

      const code = parseGeneratedCode(lastAssistant.content);
      const sanitized = sanitizeVersionCode(code);
      if (Object.keys(sanitized).length === 0) return;

      const project = useProjectStore.getState().currentProject;
      if (project) {
        if (useSettingsStore.getState().autoSave) {
          saveVersion({
            code: sanitized,
            prompt: lastPromptRef.current,
            model: lastOptionsRef.current.model,
            agentId: lastOptionsRef.current.agentId,
            temperature: lastOptionsRef.current.temperature,
          });
        }
        useChatStore.getState().saveProjectChat(project.id);
      }
    }
    wasStreamingRef.current = streaming.isStreaming;
  }, [streaming.isStreaming]);

  const handleSubmit = async (prompt: string) => {
    if (!selection.agentId || !selection.modelId) return;

    const agent = agents.find((a) => a.id === selection.agentId);
    if (!agent) return;

    const provider = agent.id;

    lastPromptRef.current = prompt;
    lastOptionsRef.current = {
      model: selection.modelId,
      agentId: agent.id,
      temperature: selection.temperature,
    };

    const { defaultProjectType } = useSettingsStore.getState();

    try {
      if (!currentProject) {
        const projectName = prompt.length > 50 ? prompt.slice(0, 50) + "..." : prompt;
        const created = await createProject({ name: projectName, description: "", type: defaultProjectType });
        if (!created) {
          useChatStore.getState().setStreaming({ error: "Не удалось создать проект" });
          return;
        }
      }

      generate(prompt, {
        provider,
        model: selection.modelId,
        temperature: selection.temperature,
        projectType: currentProject?.type ?? defaultProjectType,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Неизвестная ошибка";
      useChatStore.getState().setStreaming({ error: msg });
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {isChatLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-text-muted text-sm animate-pulse">{t("chat.loading") ?? "Loading chat…"}</p>
        </div>
      ) : messages.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-6 overflow-hidden">
          <div className="text-center max-w-md">
            <GlowText as="h2" variant="gold" className="text-2xl mb-3">
              NIT.BY
            </GlowText>
            <p className="text-text-secondary text-sm mb-6 leading-relaxed whitespace-pre-line">
              {t("chat.welcome.subtitle")}
            </p>
            {!hasAgent && (
              <div className="glass rounded-lg p-3 mb-4 border border-red-400/20">
                <p className="text-red-400 text-xs">
                  {t("chat.no_agents")}
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <MessageList messages={messages} isStreaming={streaming.isStreaming} />
      )}

      {streaming.error && (
        <div className="flex-shrink-0 mx-4 mb-2 glass rounded px-3 py-2 border border-red-400/20">
          <p className="text-red-400 text-xs">{streaming.error}</p>
        </div>
      )}

      <div className="flex-shrink-0 p-4 border-t border-border-subtle">
        <PromptInput
          onSubmit={handleSubmit}
          onStop={stop}
          isStreaming={streaming.isStreaming}
          disabled={!hasAgent}
        />
      </div>
    </div>
  );
}
