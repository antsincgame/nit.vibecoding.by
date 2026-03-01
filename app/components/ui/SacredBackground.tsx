import { cn } from "~/lib/utils/cn";

interface SacredBackgroundProps {
  pattern?: "flower" | "hex";
  glow?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function SacredBackground({
  pattern = "flower",
  glow = true,
  className,
  children,
}: SacredBackgroundProps) {
  return (
    <div
      className={cn(
        "relative bg-void-black",
        pattern === "flower" && "sacred-bg",
        pattern === "hex" && "hex-grid-bg",
        className,
      )}
    >
      {glow && (
        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background:
              "radial-gradient(ellipse at 50% 30%, rgba(255,215,0,0.08) 0%, transparent 60%)",
          }}
        />
      )}
      <div className="relative z-10 flex flex-col h-full min-h-0">{children}</div>
    </div>
  );
}
