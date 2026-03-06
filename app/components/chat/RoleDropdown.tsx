import { useRoleStore } from "~/lib/stores/roleStore";
import { CHAIN_ROLE_ID, AUTO_ROLE_ID } from "@shared/types/agentRole";
import { cn } from "~/lib/utils/cn";

export function RoleDropdown() {
  const { roles, selection, pipelineSessionId, pipelineStatus, setRoleSelection } = useRoleStore();

  // New session → lock to chain (Architect is always first step in chain)
  const isNewSession = !pipelineSessionId;
  const isRunning = pipelineStatus === "running" || pipelineStatus === "chain_running";

  const effectiveRoleId = isNewSession ? CHAIN_ROLE_ID : selection.roleId;

  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[8px] font-heading uppercase tracking-[0.2em] text-text-muted">
        Роль
      </label>
      <select
        value={effectiveRoleId}
        onChange={(e) => setRoleSelection(e.target.value)}
        disabled={isNewSession || isRunning}
        className={cn(
          "bg-deep-space border border-border-subtle rounded px-2 py-1 text-[11px] text-text-primary outline-none cursor-pointer",
          "focus:border-gold-pure/40",
          (isNewSession || isRunning) && "opacity-50 cursor-not-allowed",
        )}
      >
        {roles.length === 0 && <option value="">Нет ролей</option>}

        {roles.map((role) => (
          <option key={role.id} value={role.id}>
            {role.isLocked ? "🔒" : ""} {role.name}
          </option>
        ))}

        <option disabled>──────</option>
        <option value={AUTO_ROLE_ID}>🤖 Авто (LLM-роутер)</option>
        <option value={CHAIN_ROLE_ID}>⚡ Цепочка (все по порядку)</option>
      </select>
      {isNewSession && (
        <span className="text-[9px] text-text-muted">
          Первый запрос запускает полную цепочку
        </span>
      )}
    </div>
  );
}
