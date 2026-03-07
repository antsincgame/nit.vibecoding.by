import { useCallback, useEffect, useRef, useState } from "react";
import { useChatStore } from "~/lib/stores/chatStore";
import { useAgentStore } from "~/lib/stores/agentStore";
import { useProjectStore } from "~/lib/stores/projectStore";
import { useSettingsStore } from "~/lib/stores/settingsStore";
import { useRoleStore } from "~/lib/stores/roleStore";
import { usePipelineStreaming } from "~/lib/hooks/usePipelineStreaming";
import { useProjects } from "~/features/projects/hooks/useProjects";
import { useVersionHistory } from "~/features/projects/hooks/useVersionHistory";
import { sanitizeVersionCode } from "~/lib/utils/codeParser";
import { MessageList } from "./MessageList";
import { PromptInput } from "./PromptInput";
import { RoleDropdown } from "./RoleDropdown";
import { LocalContextInput } from "./LocalContextInput";
import { AgentStatusIndicator } from "./AgentStatusIndicator";
import { ChainProgress } from "./ChainProgress";
import { GlowText } from "~/components/ui/GlowText";
import { NeonButton } from "~/components/ui/NeonButton";
import { useT } from "~/lib/utils/i18n";

export function ChatPanel() {
  const { messages, streaming, isChatLoading } = useChatStore();
  const { currentProject } = useProjectStore();
  const { roles, selection, clearLocalContext, pipelineStatus } = useRoleStore();
  const { generate, stop } = usePipelineStreaming();
  const { create: createProject } = useProjects();
  const { saveVersion } = useVersionHistory();

  const wasStreamingRef = useRef(false);
  const lastPromptRef = useRef("");
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);

  const t = useT();
  const settings = useSettingsStore();
  const { selection: agentSelection } = useAgentStore();

  // Check availability: need at least one online provider AND at least one role
  const agents = useAgentStore((s) => s.agents);
  const hasOnlineProvider = agents.some((a) => a.status === "online");
  const hasRoles = roles.length > 0;
  const canGenerate = hasOnlineProvider && hasRoles;

  // Load roles on mount
  useEffect(() => {
    useRoleStore.getState().loadRoles();
  }, []);

  const handleSeedRoles = useCallback(async () => {
    setSeedLoading(true);
    setSeedError(null);
    try {
      const providerId = agentSelection.agentId || settings.defaultAgentId;
      const modelName = agentSelection.modelId || settings.defaultModelId;
      const body: Record<string, string> = {};
      if (providerId && modelName) {
        body.providerId = providerId;
        body.modelName = modelName;
      }
      const res = await fetch("/api/roles/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      const text = await res.text();
      let data: { ok?: boolean; message?: string; error?: string };
      try {
        data = JSON.parse(text) as { ok?: boolean; message?: string; error?: string };
      } catch {
        data = { error: text?.slice(0, 200) || "Ответ сервера не в формате JSON" };
      }
      if (res.ok && data.ok) {
        await useRoleStore.getState().loadRoles();
      } else {
        const msg = data.message ?? data.error ?? "Не удалось создать роли";
        setSeedError(res.status === 409 ? `${msg} Перейдите в Настройки → Агенты для замены.` : msg);
      }
    } catch (e) {
      const msg =
        e instanceof Error && e.name === "AbortError"
          ? "Превышено время ожидания. Проверьте подключение к Appwrite."
          : e instanceof Error
            ? e.message
            : "Ошибка при создании ролей";
      setSeedError(msg);
    } finally {
      setSeedLoading(false);
    }
  }, [agentSelection.agentId, agentSelection.modelId, settings.defaultAgentId, settings.defaultModelId]);

  // Auto-save version when streaming completes
  useEffect(() => {
    if (wasStreamingRef.current && !streaming.isStreaming) {
      // Use generatedCode from store — populated by IncrementalArtifactParser during streaming.
      // Don't re-parse from last message: in chain mode, last message is Tester review, not Coder code.
      const { generatedCode } = useChatStore.getState();
      const sanitized = Object.keys(generatedCode).length > 0
        ? sanitizeVersionCode(generatedCode)
        : {};

      if (Object.keys(sanitized).length === 0) {
        wasStreamingRef.current = streaming.isStreaming;
        return;
      }

      // Read model/agentId from the message that produced code (may not be last in chain)
      const lastAssistant = [...messages].reverse().find(
        (m) => m.role === "assistant" && m.agentRoleName,
      );

      const project = useProjectStore.getState().currentProject;
      if (project) {
        if (useSettingsStore.getState().autoSave) {
          saveVersion({
            code: sanitized,
            prompt: lastPromptRef.current,
            model: lastAssistant?.model ?? "",
            agentId: lastAssistant?.agentId ?? "",
            temperature: useSettingsStore.getState().defaultTemperature,
          });
        }
        useChatStore.getState().saveProjectChat(project.id);
      }
    }
    wasStreamingRef.current = streaming.isStreaming;
  }, [streaming.isStreaming]);

  const handleSubmit = async (prompt: string) => {
    const { defaultProjectType } = useSettingsStore.getState();
    const roleStore = useRoleStore.getState();

    lastPromptRef.current = prompt;

    try {
      let projectId = currentProject?.id;

      if (!projectId) {
        const projectName = prompt.length > 50 ? prompt.slice(0, 50) + "..." : prompt;
        const created = await createProject({ name: projectName, description: "", type: defaultProjectType });
        if (!created) {
          useChatStore.getState().setStreaming({ error: "Не удалось создать проект" });
          return;
        }
        projectId = created.id;
      }

      generate(prompt, {
        projectId: projectId!,
        roleId: roleStore.selection.roleId,
        localContext: roleStore.selection.localContext,
        projectType: currentProject?.type ?? defaultProjectType,
        sessionId: roleStore.pipelineSessionId ?? undefined,
      });

      // Clear local context after sending
      clearLocalContext();
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
            {!canGenerate && (
              <div className="glass rounded-lg p-3 mb-4 border border-red-400/20">
                <p className="text-red-400 text-xs">
                  {!hasOnlineProvider
                    ? t("chat.no_agents")
                    : "Роли агентов не загружены. Проверьте настройки."}
                </p>
                {hasOnlineProvider && !hasRoles && (
                  <div className="mt-3 flex flex-col gap-2">
                    <NeonButton
                      onClick={handleSeedRoles}
                      disabled={seedLoading}
                      size="sm"
                    >
                      {seedLoading ? "Создание…" : "Создать роли по умолчанию"}
                    </NeonButton>
                    {seedError && (
                      <p className="text-red-400 text-xs">{seedError}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <MessageList messages={messages} isStreaming={streaming.isStreaming} />
      )}

      {/* Pipeline status indicators */}
      <ChainProgress />
      <AgentStatusIndicator />

      {/* Show streaming error only when pipeline indicator isn't showing it */}
      {streaming.error && pipelineStatus !== "error" && (
        <div className="flex-shrink-0 mx-4 mb-2 glass rounded px-3 py-2 border border-red-400/20">
          <p className="text-red-400 text-xs">{streaming.error}</p>
        </div>
      )}

      <div className="flex-shrink-0 border-t border-border-subtle">
        {/* Role controls */}
        <div className="px-4 pt-3 pb-1 flex items-end gap-3">
          <RoleDropdown />
          <div className="flex-1" />
          <LocalContextInput />
        </div>

        {/* Prompt input */}
        <div className="px-4 pb-4 pt-1">
          <PromptInput
            onSubmit={handleSubmit}
            onStop={stop}
            isStreaming={streaming.isStreaming}
            disabled={!canGenerate}
          />
        </div>
      </div>
    </div>
  );
}
