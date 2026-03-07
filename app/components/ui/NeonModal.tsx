import { useEffect, useRef } from "react";
import { cn } from "~/lib/utils/cn";
import { NeonButton } from "./NeonButton";

interface NeonModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function NeonModal({ open, onClose, title, children, className }: NeonModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => onClose();
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className={cn(
        "glass rounded-lg p-0 backdrop:bg-black/70 backdrop:backdrop-blur-sm",
        "max-w-lg w-full border border-gold-pure/20",
        "animate-fade-in-up",
        "max-h-[90vh] overflow-y-auto",
        className,
      )}
    >
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold uppercase tracking-[0.1em] text-gradient-gold">
            {title}
          </h2>
          <NeonButton variant="ghost" size="sm" onClick={onClose}>
            &times;
          </NeonButton>
        </div>
        {children}
      </div>
    </dialog>
  );
}
