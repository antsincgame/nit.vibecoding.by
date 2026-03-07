import { useRoleStore } from "~/lib/stores/roleStore";
import { CHAIN_ROLE_ID, AUTO_ROLE_ID } from "@shared/types/agentRole";
import { cn } from "~/lib/utils/cn";
import { useT } from "~/lib/utils/i18n";

export function RoleDropdown() {
  const t = useT();
  const { roles, selection, pipelineSessionId, pipelineStatus, setRoleSelection } = useRoleStore();

  const isNewSession = !pipelineSessionId;
  const isRunning = pipelineStatus === "running" || pipelineStatus === "chain_running";

  return (
    <div className="flex flex-col gap-0.5">
      <label
        htmlFor="role-dropdown"
        className="text-[8px] font-heading uppercase tracking-[0.2em] text-text-muted cursor-pointer"
      >
        {t("role.label")}
      </label>
      <select
        id="role-dropdown"
        value={selection.roleId}
        onChange={(e) => setRoleSelection(e.target.value)}
        disabled={isRunning}
        className={cn(
          "bg-deep-space border border-border-subtle rounded px-2 py-1 text-[11px] text-text-primary outline-none cursor-pointer",
          "focus:border-gold-pure/40",
          isRunning && "opacity-50 cursor-not-allowed",
        )}
      >
        {roles.length === 0 && <option value="">{t("role.no_roles")}</option>}

        {roles.map((role) => (
          <option key={role.id} value={role.id}>
            {role.isLocked ? "🔒" : ""} {role.name}
          </option>
        ))}

        <option disabled>──────</option>
        <option value={AUTO_ROLE_ID}>{t("role.auto")}</option>
        <option value={CHAIN_ROLE_ID}>{t("role.chain")}</option>
      </select>
      {isNewSession && (
        <span className="text-[9px] text-text-muted">
          {t("role.first_request_chain")}
        </span>
      )}
    </div>
  );
}
