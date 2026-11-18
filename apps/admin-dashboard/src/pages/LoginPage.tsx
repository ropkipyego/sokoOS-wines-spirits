import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Wine, ShieldCheck, Sun, Moon, Eye, EyeOff, CircleAlert } from "lucide-react";
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
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupCheckError, setSetupCheckError] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    void apiRequest<{ needsSetup: boolean }>("/setup/status")
      .then((data) => {
        if (active && data.needsSetup) {
          void navigate({ to: "/setup" });
        }
      })
      .catch(() => {
        if (active) setSetupCheckError(true);
      });
    return () => {
      active = false;
    };
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
        className="btn-press absolute top-4 right-4 z-10 inline-flex min-h-11 items-center gap-1.5 rounded-[var(--soko-radius-md)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] px-3 py-2 text-sm font-semibold shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--soko-color-focus)]"
        onClick={toggleTheme}
        aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
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
          <h1 className="mt-3 font-display text-4xl tracking-tight text-[var(--soko-color-primary)]">
            {EDITION.productName}
          </h1>
          <p className="mt-1.5 text-sm text-[var(--soko-color-text-muted)]">
            {EDITION.tagline}
          </p>
        </div>

        <form
          onSubmit={(e) => void onSubmit(e)}
          className="soko-card-interactive mt-7 space-y-4 rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)]/95 p-6 backdrop-blur-sm"
        >
          <h2 className="font-display text-xl font-semibold">Sign in</h2>
          <p className="-mt-2 text-sm text-[var(--soko-color-text-muted)]">
            Use your SokoOS staff account to continue.
          </p>

          <Input
            id="login-email"
            label="Email address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            disabled={pending}
          />
          <div className="relative">
            <Input
              id="login-password"
              label="Password"
              type={showPassword ? "text" : "password"}
              className="pr-12"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              disabled={pending}
            />
            <button
              type="button"
              className="absolute right-1 bottom-0 inline-flex h-10 w-10 items-center justify-center rounded-md text-[var(--soko-color-text-muted)] transition hover:bg-[var(--soko-color-surface-muted)] hover:text-[var(--soko-color-text)] focus-visible:outline-2 focus-visible:outline-[var(--soko-color-focus)] disabled:opacity-50"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-controls="login-password"
              aria-pressed={showPassword}
              disabled={pending}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error ? (
            <div role="alert" className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-[var(--soko-color-danger)]">
              <CircleAlert size={16} className="mt-0.5 shrink-0" />
              {error}
            </div>
          ) : null}
          {setupCheckError ? (
            <p className="text-xs text-[var(--soko-color-text-muted)]">
              Business setup status could not be checked. You can still try signing in.
            </p>
          ) : null}

          <Button type="submit" size="lg" className="btn-press w-full" disabled={pending || !email.trim() || !password}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
          <p className="flex items-center justify-center gap-1.5 pt-1 text-xs text-[var(--soko-color-text-muted)]">
            <ShieldCheck size={14} />
            Your account is protected by SokoOS access controls.
          </p>
        </form>
      </div>
    </div>
  );
}
