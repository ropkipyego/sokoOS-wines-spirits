import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { Button, Input } from "@sokoos/ui";
import { useAuthStore } from "../stores/auth";

export function ChangePasswordPage() {
  const changePassword = useAuthStore((s) => s.changePassword);
  const defaultLandingRoute = useAuthStore((s) => s.defaultLandingRoute);
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      if (newPassword !== confirmPassword) {
        throw new Error("New password and confirmation do not match");
      }
      if (newPassword.length < 10) {
        throw new Error("Password must be at least 10 characters");
      }
      await changePassword(currentPassword, newPassword, confirmPassword);
      await navigate({ to: defaultLandingRoute() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to change password");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="soko-ui relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="page-fade w-full max-w-md">
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] px-3 py-1 text-xs font-bold tracking-wider text-[var(--soko-color-primary)] uppercase">
            <ShieldCheck size={13} />
            Security
          </span>
          <p className="mt-3 font-display text-3xl tracking-tight text-[var(--soko-color-primary)]">
            Change password
          </p>
          <p className="mt-1.5 text-sm text-[var(--soko-color-text-muted)]">
            You must set a new password before using the application.
          </p>
        </div>

        <form
          onSubmit={(e) => void onSubmit(e)}
          className="mt-7 space-y-4 rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-6"
        >
          <Input
            label="Current / temporary password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <Input
            label="New password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
          <Input
            label="Confirm new password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
          <p className="text-xs text-[var(--soko-color-text-muted)]">
            Minimum 10 characters, with at least one letter and one number.
          </p>
          {error ? (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-[var(--soko-color-danger)]">
              {error}
            </div>
          ) : null}
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? "Saving…" : "Update password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
