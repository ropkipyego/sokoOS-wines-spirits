import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, CircleAlert, X } from "lucide-react";

type Toast = { id: number; message: string; tone: "success" | "error"; exiting: boolean };
type ToastContextValue = (message: string, tone?: Toast["tone"]) => void;

const ToastContext = createContext<ToastContextValue>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, { exit: ReturnType<typeof setTimeout>; remove: ReturnType<typeof setTimeout> }>());

  const notify = useCallback<ToastContextValue>((message, tone = "success") => {
    const id = ++nextId.current;
    setToasts((current) => [...current, { id, message, tone, exiting: false }]);
    const exit = setTimeout(() => {
      setToasts((current) => current.map((toast) => toast.id === id ? { ...toast, exiting: true } : toast));
    }, 3_800);
    const remove = setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
      timers.current.delete(id);
    }, 4_000);
    timers.current.set(id, { exit, remove });
  }, []);

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer.exit);
      clearTimeout(timer.remove);
    }
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) {
        clearTimeout(timer.exit);
        clearTimeout(timer.remove);
      }
      timers.current.clear();
    },
    [],
  );

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        {toasts.map((toast) => {
          const Icon = toast.tone === "success" ? CheckCircle2 : CircleAlert;
          return (
            <div
              key={toast.id}
              role={toast.tone === "error" ? "alert" : "status"}
              className={`soko-toast relative flex items-start gap-2 overflow-hidden rounded-lg border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-3 pb-4 text-sm shadow-lg ${toast.exiting ? "soko-toast-exit" : ""}`}
            >
              <Icon
                size={18}
                className={toast.tone === "success" ? "mt-0.5 shrink-0 text-emerald-600" : "mt-0.5 shrink-0 text-[var(--soko-color-danger)]"}
              />
              <span className="min-w-0 flex-1">{toast.message}</span>
              <button
                type="button"
                className="rounded p-1 text-[var(--soko-color-text-muted)] hover:bg-[var(--soko-color-surface-muted)]"
                aria-label="Dismiss notification"
                onClick={() => dismiss(toast.id)}
              >
                <X size={15} />
              </button>
              <span className="soko-toast-countdown" aria-hidden="true" />
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
