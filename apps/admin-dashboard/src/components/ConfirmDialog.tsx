import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@sokoos/ui";

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  pending = false,
  danger = false,
  children,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  pending?: boolean;
  danger?: boolean;
  children?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    return () => previousFocus?.focus();
  }, []);

  return (
    <div
      className="soko-modal-backdrop fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onCancel();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !pending) onCancel();
        if (event.key === "Tab") {
          const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
          );
          if (!focusable?.length) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        className="soko-modal-panel w-full max-w-md rounded-xl border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-5 shadow-2xl"
      >
        <h2 id="confirm-dialog-title" className="font-display text-xl font-semibold">{title}</h2>
        <p id="confirm-dialog-description" className="mt-2 text-sm text-[var(--soko-color-text-muted)]">{description}</p>
        {children}
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="rounded-[var(--soko-radius-md)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] px-3 py-2 text-sm font-semibold hover:bg-[var(--soko-color-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--soko-color-focus)] disabled:opacity-60"
          >
            Cancel
          </button>
          <Button
            variant={danger ? "danger" : "primary"}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? "Please wait…" : confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}
