import { forwardRef } from "react";
import { cn } from "~/lib/utils/cn";

interface NeonInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const NeonInput = forwardRef<HTMLInputElement, NeonInputProps>(
  function NeonInput({ label, error, className, id, ...props }, ref) {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-heading uppercase tracking-[0.15em] text-text-secondary"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "w-full px-4 py-2.5 rounded bg-deep-space/80",
            "border border-border-subtle",
            "text-text-primary font-body text-sm placeholder:text-text-muted",
            "outline-none transition-all duration-300",
            "focus:border-gold-pure/40 focus:shadow-[0_0_12px_rgba(255,215,0,0.15)]",
            error && "border-red-400/50 focus:border-red-400/60",
            className,
          )}
          {...props}
        />
        {error && (
          <span className="text-xs text-red-400">{error}</span>
        )}
      </div>
    );
  },
);
