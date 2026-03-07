import { useState, useRef } from "react";
import { useRoleStore } from "~/lib/stores/roleStore";
import { parseContextFile } from "~/lib/utils/parseContextFile";
import { cn } from "~/lib/utils/cn";
import { useT } from "~/lib/utils/i18n";

const ACCEPT = ".txt,.md,.json,.pdf,.docx";

export function LocalContextInput() {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { selection, setLocalContext, clearLocalContext } = useRoleStore();

  const hasContext = selection.localContext.trim().length > 0;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setIsLoading(true);
    setError(null);
    setTruncated(false);

    const result = await parseContextFile(file);

    setIsLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setLocalContext(result.text);
    setTruncated(result.truncated);
    setError(null);
  };

  const handleClear = () => {
    clearLocalContext();
    setError(null);
    setTruncated(false);
  };

  const handleTriggerClick = () => {
    if (hasContext) {
      setIsOpen(!isOpen);
    } else {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        onChange={handleFileSelect}
        className="hidden"
      />
      <button
        type="button"
        onClick={handleTriggerClick}
        disabled={isLoading}
        className={cn(
          "flex items-center gap-1 text-[10px] text-text-muted hover:text-text-secondary transition-colors disabled:opacity-50",
          (hasContext || isLoading) && "text-gold-pure",
        )}
      >
        <span>{isLoading ? "⏳" : "📎"}</span>
        <span>{t("context.label")}</span>
        {hasContext && <span className="w-1.5 h-1.5 rounded-full bg-gold-pure" />}
      </button>

      {isOpen && hasContext && (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] text-text-muted truncate">
              {selection.localContext.length} {t("context.chars")}
            </span>
            <button
              type="button"
              onClick={handleClear}
              className="text-[9px] text-red-400 hover:text-red-300 transition-colors"
            >
              {t("common.clear")}
            </button>
          </div>
          {truncated && (
            <p className="text-[9px] text-amber-400">{t("context.truncated")}</p>
          )}
          {error && (
            <p className="text-[9px] text-red-400">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
