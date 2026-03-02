import { useAgentStore } from "~/lib/stores/agentStore";
import { cn } from "~/lib/utils/cn";

export function AgentSelector() {
  const { agents, selection, setSelection } = useAgentStore();
  const selectedAgent = agents.find((a) => a.id === selection.agentId);

  return (
    <div className="flex items-center gap-3 overflow-hidden">
      <div className="flex flex-col gap-0.5 min-w-0">
        <label className="text-[8px] font-heading uppercase tracking-[0.2em] text-text-muted">
          Agent
        </label>
        <select
          value={selection.agentId}
          onChange={(e) => {
            const agent = agents.find((a) => a.id === e.target.value);
            setSelection({
              agentId: e.target.value,
              modelId: agent?.models[0]?.id ?? "",
            });
          }}
          className="bg-deep-space border border-border-subtle rounded px-2 py-0.5 text-[11px] text-text-primary outline-none focus:border-gold-pure/40 cursor-pointer w-[100px]"
        >
          {agents.length === 0 && <option value="">No agents</option>}
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.status === "online" ? "\u2713" : "\u2717"} {agent.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <label className="text-[8px] font-heading uppercase tracking-[0.2em] text-text-muted">
          Model
        </label>
        <select
          value={selection.modelId}
          onChange={(e) => setSelection({ modelId: e.target.value })}
          className="bg-deep-space border border-border-subtle rounded px-2 py-0.5 text-[11px] text-text-primary outline-none focus:border-gold-pure/40 cursor-pointer w-full min-w-0"
        >
          {!selectedAgent?.models.length && <option value="">—</option>}
          {selectedAgent?.models.map((model) => {
            const ctxLabel = model.contextLength
              ? ` [${model.contextLength >= 1024 ? `${Math.round(model.contextLength / 1024)}K` : model.contextLength}]`
              : "";
            return (
              <option key={model.id} value={model.id}>
                {model.name}{ctxLabel}
              </option>
            );
          })}
        </select>
      </div>

      <div className="flex flex-col gap-0.5 flex-shrink-0">
        <label className="text-[8px] font-heading uppercase tracking-[0.2em] text-text-muted">
          {selection.temperature.toFixed(1)}
        </label>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={selection.temperature}
          onChange={(e) => setSelection({ temperature: parseFloat(e.target.value) })}
          className={cn(
            "w-16 h-1 appearance-none rounded-full bg-border-subtle cursor-pointer",
            "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5",
            "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gold-pure",
          )}
        />
      </div>
    </div>
  );
}
