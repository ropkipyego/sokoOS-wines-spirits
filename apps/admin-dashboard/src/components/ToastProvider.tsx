import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, CircleAlert, X } from "lucide-react";

type Toast = { id: number; message: string; tone: "success" | "error" };
type ToastContextValue = (message: string, tone?: Toast["tone"]) => void;

const ToastContext = createContext<ToastContextValue>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const notify = useCallback<ToastContextValue>((message, tone = "success") => {
    const id = ++nextId.current;
    setToasts((current) => [...current, { id, message, tone }]);
    timers.current.set(
      id,
      setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
        timers.current.delete(id);
      }, 4000),
    );
  }, []);

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
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
              className="soko-toast flex items-start gap-2 rounded-lg border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-3 text-sm shadow-lg"
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
