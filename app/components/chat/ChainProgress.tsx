import { useRoleStore } from "~/lib/stores/roleStore";
import { cn } from "~/lib/utils/cn";

export function ChainProgress() {
  const { pipelineStatus, isChainMode, chainSteps, chainCurrent, chainTotal } = useRoleStore();

  // Show when in chain mode and we have steps, regardless of exact pipelineStatus
  const isActive = isChainMode && chainSteps.length > 0 &&
    pipelineStatus !== "idle";

  if (!isActive) return null;

  return (
    <div className="mx-4 mb-2 glass rounded-lg px-3 py-2 border border-gold-pure/10">
      <div className="flex items-center gap-2 text-[10px] text-text-muted mb-2">
        <span>⚡</span>
        <span>Цепочка ({chainCurrent}/{chainTotal})</span>
      </div>
      <div className="space-y-1">
        {chainSteps.map((step, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-4 text-center">
              {step.status === "done" && "✅"}
              {step.status === "running" && <span className="animate-spin inline-block">🔄</span>}
              {step.status === "pending" && "⏳"}
              {step.status === "error" && "❌"}
            </span>
            <span
              className={cn(
                step.status === "done" && "text-text-secondary",
                step.status === "running" && "text-text-primary",
                step.status === "pending" && "text-text-muted",
                step.status === "error" && "text-red-400",
              )}
            >
              {step.roleName}
            </span>
            {step.durationMs != null && (
              <span className="text-text-muted ml-auto">
                {(step.durationMs / 1000).toFixed(1)}с
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
