import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button, Input } from "@sokoos/ui";
import { Eye, EyeOff } from "lucide-react";
import { apiRequest } from "../api/client";

export function ActivatePage() {
  const navigate = useNavigate();
  const initialToken = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("token") ?? "";
  }, []);
  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiRequest("/public/invitations/accept", {
        method: "POST",
        body: { token, password, name: name || undefined },
      });
      void navigate({ to: "/login" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Activation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--soko-color-bg)] p-6">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-6">
        <h1 className="text-xl font-semibold">Activate administrator account</h1>
        <p className="text-sm text-[var(--soko-color-text-muted)]">
          Use your one-time invitation token. SokoOS never emails permanent passwords.
        </p>
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          {error ? <p role="alert" className="text-sm text-[var(--soko-color-danger)]">{error}</p> : null}
          <Input
            label="Invitation token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
            autoComplete="off"
            disabled={busy}
          />
          <Input
            label="Display name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            disabled={busy}
          />
          <div className="relative">
            <Input
              id="activation-password"
              label="New password"
              type={showPassword ? "text" : "password"}
              className="pr-12"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={10}
              autoComplete="new-password"
              disabled={busy}
            />
            <button
              type="button"
              className="absolute right-1 bottom-0 inline-flex h-10 w-10 items-center justify-center rounded-md text-[var(--soko-color-text-muted)] transition hover:bg-[var(--soko-color-surface-muted)] hover:text-[var(--soko-color-text)] focus-visible:outline-2 focus-visible:outline-[var(--soko-color-focus)]"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-controls="activation-password"
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <Button type="submit" disabled={busy || token.length < 16 || password.length < 10}>
            {busy ? "Activating…" : "Set password & activate"}
          </Button>
        </form>
      </div>
    </div>
  );
}
