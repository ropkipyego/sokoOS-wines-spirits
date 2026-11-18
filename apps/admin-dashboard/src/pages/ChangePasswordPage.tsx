import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Button, Input } from "@sokoos/ui";
import { useAuthStore } from "../stores/auth";
import { useToast } from "../components/ToastProvider";

export function ChangePasswordPage() {
  const changePassword = useAuthStore((s) => s.changePassword);
  const defaultLandingRoute = useAuthStore((s) => s.defaultLandingRoute);
  const navigate = useNavigate();
  const notify = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const passwordChecks = [
    { label: "At least 10 characters", valid: newPassword.length >= 10 },
    { label: "At least one letter", valid: /[A-Za-z]/.test(newPassword) },
    { label: "At least one number", valid: /[0-9]/.test(newPassword) },
  ];
  const strength = passwordChecks.filter((check) => check.valid).length;

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
      if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
        throw new Error("Password must include at least one letter and one number");
      }
      await changePassword(currentPassword, newPassword, confirmPassword);
      notify("Your password has been updated.");
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
            Welcome to SokoOS
          </p>
          <p className="mt-1.5 text-sm text-[var(--soko-color-text-muted)]">
            Before you continue, let's secure your account.
          </p>
        </div>

        <form
          onSubmit={(e) => void onSubmit(e)}
          className="mt-7 space-y-4 rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-6"
        >
          <Input
            label="Current / temporary password"
            type={showPasswords ? "text" : "password"}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <Input
            label="New password"
            type={showPasswords ? "text" : "password"}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
          <Input
            label="Confirm new password"
            type={showPasswords ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
          <div className="space-y-2 rounded-md bg-[var(--soko-color-bg-elevated)] p-3">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold">Password requirements</span>
              <span className="text-[var(--soko-color-text-muted)]">
                {!newPassword ? "Not set" : strength === 3 ? "Meets minimum" : "Needs improvement"}
              </span>
            </div>
            <div className="flex gap-1" aria-hidden="true">
              {passwordChecks.map((check) => (
                <span
                  key={check.label}
                  className={`h-1.5 flex-1 rounded-full ${check.valid ? "bg-emerald-500" : "bg-[var(--soko-color-border)]"}`}
                />
              ))}
            </div>
            <ul className="space-y-1">
              {passwordChecks.map((check) => (
                <li key={check.label} className="flex items-center gap-1.5 text-xs text-[var(--soko-color-text-muted)]">
                  <Check size={13} className={check.valid ? "text-emerald-600" : "opacity-30"} />
                  {check.label}
                </li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-medium text-[var(--soko-color-primary)] hover:bg-[var(--soko-color-primary-muted)] focus-visible:outline-2 focus-visible:outline-[var(--soko-color-focus)]"
            onClick={() => setShowPasswords((visible) => !visible)}
            aria-pressed={showPasswords}
          >
            {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
            {showPasswords ? "Hide passwords" : "Show passwords"}
          </button>
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
