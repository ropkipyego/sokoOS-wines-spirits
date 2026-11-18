import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Wine } from "lucide-react";
import { Button, Input } from "@sokoos/ui";
import { PRODUCT_EDITION, getEditionConfig } from "@sokoos/types";
import { apiRequest } from "../api/client";
import { useAuthStore } from "../stores/auth";

const EDITION = getEditionConfig(PRODUCT_EDITION);

export function SetupPage() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const [businessName, setBusinessName] = useState("JAYWINES");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      if (password !== confirmPassword) {
        throw new Error("Password and confirmation do not match");
      }
      await apiRequest("/setup/business", {
        method: "POST",
        body: {
          businessName,
          ownerName,
          email,
          phone: phone || undefined,
          password,
          confirmPassword,
          tenantSlug: "jaywines",
        },
      });
      const landing = await login(email, password);
      await navigate({ to: landing });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create business");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="soko-ui relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="page-fade w-full max-w-lg">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--soko-color-primary)] text-white shadow-lg">
            <Wine size={28} />
          </div>
          <h1 className="font-display text-3xl tracking-tight text-[var(--soko-color-primary)]">
            Create your business
          </h1>
          <p className="mt-1.5 text-sm text-[var(--soko-color-text-muted)]">
            First-time setup for {EDITION.productName}
          </p>
        </div>

        <form
          onSubmit={(e) => void onSubmit(e)}
          className="mt-7 space-y-3 rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-6"
        >
          <Input
            label="Business name"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            required
          />
          <Input
            label="Owner name"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            required
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <div className="relative">
            <Input
              id="setup-password"
              label="Password"
              type={showPassword ? "text" : "password"}
              className="pr-12"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              disabled={pending}
            />
            <button
              type="button"
              className="absolute right-1 bottom-0 inline-flex h-10 w-10 items-center justify-center rounded-md text-[var(--soko-color-text-muted)] transition hover:bg-[var(--soko-color-surface-muted)] hover:text-[var(--soko-color-text)] focus-visible:outline-2 focus-visible:outline-[var(--soko-color-focus)]"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-controls="setup-password"
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <div className="relative">
            <Input
              id="setup-confirm-password"
              label="Confirm password"
              type={showConfirmPassword ? "text" : "password"}
              className="pr-12"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              disabled={pending}
            />
            <button
              type="button"
              className="absolute right-1 bottom-0 inline-flex h-10 w-10 items-center justify-center rounded-md text-[var(--soko-color-text-muted)] transition hover:bg-[var(--soko-color-surface-muted)] hover:text-[var(--soko-color-text)] focus-visible:outline-2 focus-visible:outline-[var(--soko-color-focus)]"
              onClick={() => setShowConfirmPassword((visible) => !visible)}
              aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"}
              aria-controls="setup-confirm-password"
              aria-pressed={showConfirmPassword}
            >
              {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {error ? (
            <div role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-[var(--soko-color-danger)]">
              {error}
            </div>
          ) : null}
          <Button type="submit" size="lg" className="w-full" disabled={pending || !businessName.trim() || !ownerName.trim() || !email.trim() || !password || !confirmPassword}>
            {pending ? "Creating…" : "Create business"}
          </Button>
        </form>
      </div>
    </div>
  );
}
