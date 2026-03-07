import { cn } from "~/lib/utils/cn";

interface SettingsSectionProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function SettingsSection({ title, children, className }: SettingsSectionProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-gold-pure/20 glass p-5",
        "transition-all duration-300 hover:border-gold-pure/30 hover:shadow-[0_0_20px_rgba(255,215,0,0.08)]",
        className,
      )}
    >
      <div className="absolute inset-0 pointer-events-none sacred-card-aura" />
      <div className="relative z-10">
        <h3 className="font-display text-sm font-semibold uppercase tracking-[0.15em] text-gradient-gold mb-4">
          {title}
        </h3>
        <div className="space-y-4">{children}</div>
      </div>
    </div>
  );
}
