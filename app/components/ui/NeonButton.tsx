import { cn } from "~/lib/utils/cn";

type NeonButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type NeonButtonSize = "sm" | "md" | "lg";

interface NeonButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: NeonButtonVariant;
  size?: NeonButtonSize;
  glow?: boolean;
}

const VARIANT_STYLES: Record<NeonButtonVariant, string> = {
  primary: "text-gold-pure border-gold-pure/50 hover:bg-gold-pure/10 hover:shadow-[0_0_20px_rgba(255,215,0,0.3)]",
  secondary: "text-neon-cyan border-neon-cyan/50 hover:bg-neon-cyan/10 hover:shadow-[0_0_20px_rgba(0,245,255,0.3)]",
  ghost: "text-text-secondary border-border-subtle hover:text-text-primary hover:border-text-muted",
  danger: "text-red-400 border-red-400/50 hover:bg-red-400/10 hover:shadow-[0_0_20px_rgba(248,113,113,0.3)]",
};

const SIZE_STYLES: Record<NeonButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-5 py-2.5 text-sm",
  lg: "px-8 py-3.5 text-base",
};

export function NeonButton({
  children,
  variant = "primary",
  size = "md",
  glow = true,
  className,
  disabled,
  ...props
}: NeonButtonProps) {
  return (
    <button
      className={cn(
        "relative overflow-hidden font-heading font-semibold uppercase tracking-[0.15em]",
        "border bg-transparent transition-all duration-400 cursor-pointer",
        "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none",
        VARIANT_STYLES[variant],
        SIZE_STYLES[size],
        className,
      )}
      disabled={disabled}
      {...props}
    >
      <span className="relative z-10">{children}</span>
      {glow && <span className="neon-btn-shimmer" />}
    </button>
  );
}
