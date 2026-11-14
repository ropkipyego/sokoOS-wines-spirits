import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Wine, ShieldCheck, Sun, Moon } from "lucide-react";
import { Button, Input } from "@sokoos/ui";
import { PRODUCT_EDITION, getEditionConfig } from "@sokoos/types";
import { apiRequest } from "../api/client";
import { useAuthStore } from "../stores/auth";
import { useThemeStore } from "../stores/theme";

const EDITION = getEditionConfig(PRODUCT_EDITION);

export function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      // Standalone product — backend resolves jaywines; never send demo/store code from UI.
      const landing = await login(email, password);
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
    <div className="soko-ui login-atmosphere relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="login-orb login-orb-a" aria-hidden />
      <div className="login-orb login-orb-b" aria-hidden />
      <div className="login-brand-rail" aria-hidden>
        <img src="/brands/whisky-dark.jpg" alt="" />
        <img src="/brands/champagne.jpg" alt="" />
        <img src="/brands/gin-gold.jpg" alt="" />
        <img src="/brands/red-wine.jpg" alt="" />
        <img src="/brands/whiskey-table.jpg" alt="" />
      </div>

      <button
        type="button"
        className="btn-press absolute top-4 right-4 z-10 inline-flex items-center gap-1.5 rounded-[var(--soko-radius-md)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] px-3 py-2 text-sm font-semibold shadow-sm"
        onClick={toggleTheme}
      >
        {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
        {theme === "light" ? "Dark" : "Light"}
      </button>

      <div className="page-fade relative z-10 w-full max-w-md">
        <div className="text-center">
          <div className="brand-mark mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--soko-color-primary)] text-white shadow-lg">
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
          className="soko-card-interactive mt-7 space-y-4 rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)]/95 p-6 backdrop-blur-sm"
        >
          <h1 className="font-display text-xl font-semibold">Sign in</h1>

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

          {error ? (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-[var(--soko-color-danger)]">
              {error}
            </div>
          ) : null}

          <Button type="submit" size="lg" className="btn-press w-full" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
