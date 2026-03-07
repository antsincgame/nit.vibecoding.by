import { useRef, useState, useEffect, type KeyboardEvent } from "react";
import { NeonButton } from "~/components/ui/NeonButton";
import { cn } from "~/lib/utils/cn";
import { useT } from "~/lib/utils/i18n";

interface PromptInputProps {
  onSubmit: (prompt: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export function PromptInput({ onSubmit, onStop, isStreaming, disabled }: PromptInputProps) {
  const t = useT();
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming || disabled) return;
    onSubmit(trimmed);
    setValue("");
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="glass rounded-lg p-3 border border-border-gold">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={2}
        className={cn(
          "w-full bg-transparent border-none outline-none resize-none",
          "text-text-primary text-sm font-body placeholder:text-text-muted",
        )}
        placeholder={t("chat.placeholder")}
        disabled={isStreaming}
      />

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border-subtle">
        <span className="text-[10px] text-text-muted font-mono">
          {value.length > 0 && `${value.length} ${t("chat.chars")}`}
        </span>

        <div className="flex gap-2">
          {isStreaming ? (
            <NeonButton variant="danger" size="sm" onClick={onStop}>
              {t("chat.stop")}
            </NeonButton>
          ) : (
            <NeonButton
              variant="primary"
              size="sm"
              onClick={handleSubmit}
              disabled={!value.trim() || disabled}
            >
              {t("chat.generate")}
            </NeonButton>
          )}
        </div>
      </div>
    </div>
  );
}
