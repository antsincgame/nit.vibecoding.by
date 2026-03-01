import { cn } from "~/lib/utils/cn";

type GlowTextVariant = "gold" | "sacred" | "cyan";

interface GlowTextProps extends React.HTMLAttributes<HTMLElement> {
  as?: "h1" | "h2" | "h3" | "h4" | "span" | "p";
  variant?: GlowTextVariant;
}

const VARIANT_CLASS: Record<GlowTextVariant, string> = {
  gold: "text-gradient-gold",
  sacred: "text-gradient-sacred",
  cyan: "bg-gradient-to-r from-neon-cyan to-neon-violet bg-clip-text [-webkit-text-fill-color:transparent]",
};

export function GlowText({
  as: Tag = "h1",
  variant = "gold",
  className,
  children,
  ...props
}: GlowTextProps) {
  return (
    <Tag
      className={cn(
        "font-display font-bold uppercase tracking-[0.12em]",
        VARIANT_CLASS[variant],
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}
