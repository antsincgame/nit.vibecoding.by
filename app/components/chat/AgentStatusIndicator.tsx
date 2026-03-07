import { useEffect, useState } from "react";
import { useRoleStore } from "~/lib/stores/roleStore";
import { cn } from "~/lib/utils/cn";
import { useT } from "~/lib/utils/i18n";

export function AgentStatusIndicator() {
  const t = useT();
  const {
    pipelineStatus,
    currentRoleName,
    currentModel,
    currentProvider,
    stepStartTime,
    error,
  } = useRoleStore();

  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!stepStartTime) {
      setElapsed(0);
      return;
    }
    const interval = setInterval(() => {
      setElapsed((Date.now() - stepStartTime) / 1000);
    }, 100);
    return () => clearInterval(interval);
  }, [stepStartTime]);

  if (pipelineStatus === "idle") return null;

  if (pipelineStatus === "error" && error) {
    return (
      <div className="mx-4 mb-2 glass rounded-lg px-3 py-2 border border-red-400/20">
        <div className="flex items-center gap-2 text-xs">
          <span>❌</span>
          <span className="text-red-400">
            {currentRoleName ? `${currentRoleName} — ` : ""}
            {error}
          </span>
        </div>
      </div>
    );
  }

  if (pipelineStatus === "selecting") {
    return (
      <div className="mx-4 mb-2 glass rounded-lg px-3 py-2 border border-gold-pure/10">
        <div className="flex items-center gap-2 text-xs text-text-secondary animate-pulse">
          <span>🤖</span>
          <span>{t("role.selecting")}</span>
        </div>
      </div>
    );
  }

  if (pipelineStatus === "running" || pipelineStatus === "chain_running") {
    return (
      <div className="mx-4 mb-2 glass rounded-lg px-3 py-2 border border-gold-pure/10">
        <div className="flex items-center gap-2 text-xs">
          <span className="animate-spin">🔄</span>
          <span className="text-text-primary">{currentRoleName}</span>
          <span className="text-text-muted">
            {currentModel}@{currentProvider}
          </span>
          {elapsed > 0 && (
            <span className="text-text-muted ml-auto">⏱ {elapsed.toFixed(1)}с</span>
          )}
        </div>
      </div>
    );
  }

  return null;
}
