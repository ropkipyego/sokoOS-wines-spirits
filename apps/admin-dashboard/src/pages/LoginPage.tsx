import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Wine, ShieldCheck, Sun, Moon } from "lucide-react";
import { Button, Input } from "@sokoos/ui";
import { PRODUCT_EDITION, getEditionConfig } from "@sokoos/types";
import { apiRequest } from "../api/client";
import { useAuthStore } from "../stores/auth";
import { useThemeStore } from "../stores/theme";

const EDITION = getEditionConfig(PRODUCT_EDITION);

/** Local seed accounts only — never rendered in production builds. */
const DEV_DEMO_ACCOUNTS = [
  { label: "Business Owner", slug: "demo", email: "demo@sokoos.local", pass: "Demo123!" },
  { label: "Cashier (POS)", slug: "demo", email: "cashier@sokoos.local", pass: "Cashier123!" },
  { label: "Stock Controller", slug: "demo", email: "stock@sokoos.local", pass: "Stock123!" },
  { label: "Accountant", slug: "demo", email: "accountant@sokoos.local", pass: "Accountant123!" },
] as const;

export function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const [email, setEmail] = useState(import.meta.env.DEV ? "demo@sokoos.local" : "");
  const [password, setPassword] = useState(import.meta.env.DEV ? "Demo123!" : "");
  const [showStoreCode, setShowStoreCode] = useState(import.meta.env.DEV);
  const [tenantSlug, setTenantSlug] = useState(import.meta.env.DEV ? "demo" : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void apiRequest<{ needsSetup: boolean }>("/setup/status")
      .then((data) => {
        if (data.needsSetup) {
          void navigate({ to: "/setup" });
        }
      })
      .catch(() => undefined);
  }, [navigate]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const landing = await login(email, password, tenantSlug.trim() || undefined);
      await navigate({ to: landing });
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Unable to sign in";
      setError(msg);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="soko-ui relative flex min-h-screen items-center justify-center px-4 py-10">
      <button
        type="button"
        className="btn-press absolute top-4 right-4 inline-flex items-center gap-1.5 rounded-[var(--soko-radius-md)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] px-3 py-2 text-sm font-semibold shadow-sm"
        onClick={toggleTheme}
      >
        {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
        {theme === "light" ? "Dark" : "Light"}
      </button>

      <div className="page-fade w-full max-w-md">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--soko-color-primary)] text-white shadow-lg">
            <Wine size={28} />
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] px-3 py-1 text-xs font-bold tracking-wider text-[var(--soko-color-primary)] uppercase">
            <ShieldCheck size={13} />
            {EDITION.shortName} Edition
          </span>
          <p className="mt-3 font-display text-4xl tracking-tight text-[var(--soko-color-primary)]">
            {EDITION.productName}
          </p>
          <p className="mt-1.5 text-sm text-[var(--soko-color-text-muted)]">
            {EDITION.tagline}
          </p>
        </div>

        <form
          onSubmit={(e) => void onSubmit(e)}
          className="soko-card-interactive mt-7 space-y-4 rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-6"
        >
          <div className="flex items-center justify-between">
            <h1 className="font-display text-xl font-semibold">Sign in</h1>
          </div>

          <Input
            label="Email address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />

          {showStoreCode ? (
            <Input
              label="Store code (optional)"
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value)}
              placeholder={import.meta.env.DEV ? "demo" : "jaywines"}
            />
          ) : (
            <button
              type="button"
              className="text-xs font-semibold text-[var(--soko-color-text-muted)] underline-offset-2 hover:underline"
              onClick={() => setShowStoreCode(true)}
            >
              Need a store code?
            </button>
          )}

          {error ? (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-[var(--soko-color-danger)]">
              {error}
            </div>
          ) : null}

          <Button type="submit" size="lg" className="btn-press w-full" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>

          {import.meta.env.DEV ? (
            <div className="border-t border-[var(--soko-color-border)]/70 pt-3">
              <p className="mb-2 text-[11px] font-semibold tracking-wider text-[var(--soko-color-text-muted)] uppercase">
                Development Quick-Fill (hidden in production)
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {DEV_DEMO_ACCOUNTS.map((acc) => (
                  <button
                    key={acc.label}
                    type="button"
                    onClick={() => {
                      setTenantSlug(acc.slug);
                      setEmail(acc.email);
                      setPassword(acc.pass);
                      setShowStoreCode(true);
                      setError(null);
                    }}
                    className={`rounded-md border px-2.5 py-1.5 text-left text-xs font-semibold transition ${
                      email === acc.email
                        ? "border-[var(--soko-color-primary)] bg-[var(--soko-color-primary-muted)] text-[var(--soko-color-primary)]"
                        : "border-[var(--soko-color-border)] bg-[var(--soko-color-bg-elevated)] text-[var(--soko-color-text-muted)] hover:text-[var(--soko-color-text)]"
                    }`}
                  >
                    <div>{acc.label}</div>
                    <div className="truncate font-mono text-[10px] opacity-75">{acc.email}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}
