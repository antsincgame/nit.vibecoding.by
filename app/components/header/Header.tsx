import { GlowText } from "~/components/ui/GlowText";
import { useUIStore } from "~/lib/stores/uiStore";

export function Header() {
  const { toggleSidebar, toggleSettings } = useUIStore();

  return (
    <header className="flex-shrink-0 flex items-center justify-between h-12 px-3 border-b border-border-subtle bg-deep-space/60 backdrop-blur-md gap-2">
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={toggleSidebar}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-surface transition-colors text-text-secondary hover:text-text-primary"
          aria-label="Toggle sidebar"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        <div className="w-6 h-6 rounded-full bg-gold-pure/20 border border-gold-pure/40 flex items-center justify-center">
          <span className="text-gold-pure text-[10px] font-bold">N</span>
        </div>
        <GlowText as="span" variant="gold" className="text-xs tracking-[0.2em] hidden sm:inline">
          NIT.BY
        </GlowText>
      </div>

      <div className="flex-1 min-w-0" />

      <div className="flex items-center flex-shrink-0">
        <button
          onClick={toggleSettings}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-surface transition-colors text-text-secondary hover:text-gold-pure"
          aria-label="Settings"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M6.5 1.5h3l.5 2 1.5.87 2-.5 1.5 2.6-1.5 1.5v1.76l1.5 1.5-1.5 2.6-2-.5L10 14.5l-.5 2h-3l-.5-2-1.5-.87-2 .5L1 11.73l1.5-1.5V8.47L1 6.97l1.5-2.6 2 .5L6 3.5l.5-2z"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
            <circle cx="8" cy="8.5" r="2" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
    </header>
  );
}
