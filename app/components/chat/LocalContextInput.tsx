import { useState } from "react";
import { useRoleStore } from "~/lib/stores/roleStore";
import { cn } from "~/lib/utils/cn";

export function LocalContextInput() {
  const [isOpen, setIsOpen] = useState(false);
  const { selection, setLocalContext } = useRoleStore();

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-1 text-[10px] text-text-muted hover:text-text-secondary transition-colors",
          isOpen && "text-gold-pure",
        )}
      >
        <span>📎</span>
        <span>Контекст</span>
        {selection.localContext.trim() && (
          <span className="w-1.5 h-1.5 rounded-full bg-gold-pure" />
        )}
      </button>

      {isOpen && (
        <textarea
          value={selection.localContext}
          onChange={(e) => setLocalContext(e.target.value)}
          placeholder="Дополнительные инструкции для агента..."
          rows={3}
          className={cn(
            "w-full bg-deep-space/80 border border-border-subtle rounded px-3 py-2",
            "text-xs text-text-primary placeholder:text-text-muted/50",
            "outline-none focus:border-gold-pure/40 resize-none",
          )}
        />
      )}
    </div>
  );
}
