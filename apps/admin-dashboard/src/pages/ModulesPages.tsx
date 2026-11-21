import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button, Input } from "@sokoos/ui";
import { AppShell, EmptyState } from "../components/AppShell";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useToast } from "../components/ToastProvider";
import { apiRequest } from "../api/client";
import { useAuthStore } from "../stores/auth";
import { formatMoney, parseMoneyToMinor } from "../lib/money";
import { roleDisplayName, sortRolesForPicker } from "../lib/roleLabels";

function useList<T>(path: string) {
  const token = useAuthStore((s) => s.accessToken);
  const [rows, setRows] = useState<T[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<T[] | { data: T[] }>(path, { token });
      setRows(Array.isArray(res) ? res : res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load records");
      throw err;
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void reload().catch(() => undefined);
  }, [token, path]);
  return { rows, error, loading, reload, token };
}

export function BranchesPage() {
  const { rows, error, reload, token } = useList<{ id: string; code: string; name: string; status: string }>("/branches");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await apiRequest("/branches", { method: "POST", token, body: { name, code } });
    setName("");
    setCode("");
    await reload();
  }
  return (
    <AppShell title="Branches" description="Each branch keeps its own stock, receipts, and warehouses.">
      {error ? <p className="text-sm text-[var(--soko-color-danger)]">{error}</p> : null}
      <form onSubmit={onCreate} className="mb-4 flex flex-wrap gap-3">
        <Input label="Code" value={code} onChange={(e) => setCode(e.target.value)} />
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit">Add branch</Button>
      </form>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-[var(--soko-color-text-muted)]"><th className="py-2">Code</th><th>Name</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id} className="border-t border-[var(--soko-color-border)]"><td className="py-2">{b.code}</td><td>{b.name}</td><td>{b.status}</td></tr>
          ))}
        </tbody>
      </table>
    </AppShell>
  );
}

export function UsersPage() {
  const can = useAuthStore((s) => s.has);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const notify = useToast();
  const { rows, error, reload, token } = useList<{
    id: string;
    name: string;
    email: string;
    phone?: string | null;
    status: string;
    mustChangePassword?: boolean;
    userRoles?: Array<{ id: string; role: { id: string; name: string; key: string } }>;
  }>("/users");
  // role.key used by roleDisplayName
  const { rows: roles } = useList<{ id: string; name: string; key: string; isSystem?: boolean }>("/roles");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [roleId, setRoleId] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [showTempPassword, setShowTempPassword] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusTarget, setStatusTarget] = useState<{ id: string; name: string; status: string } | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const tempPasswordValid =
    tempPassword.length >= 10 && /[A-Za-z]/.test(tempPassword) && /[0-9]/.test(tempPassword);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    setMsg(null);
    try {
      await apiRequest("/users", {
        method: "POST",
        token,
        body: {
          name,
          email,
          phone: phone || undefined,
          password: tempPassword,
          roleId: roleId || undefined,
        },
      });
      setMsg(`Created ${email}. They must change the temporary password on first login.`);
      setName("");
      setEmail("");
      setPhone("");
      setTempPassword("");
      setRoleId("");
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus() {
    if (!statusTarget) return;
    const next = statusTarget.status === "active" ? "disabled" : "active";
    setStatusBusy(true);
    setFormError(null);
    try {
      await apiRequest(`/users/${statusTarget.id}`, { method: "PATCH", token, body: { status: next } });
      notify(`${statusTarget.name} is now ${next}.`);
      setStatusTarget(null);
      await reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update user status";
      setFormError(message);
      notify(message, "error");
    } finally {
      setStatusBusy(false);
    }
  }

  async function resetPassword(id: string) {
    const temporaryPassword = window.prompt("Temporary password (min 10 chars, letter + number)");
    if (!temporaryPassword) return;
    await apiRequest(`/users/${id}/reset-password`, {
      method: "POST",
      token,
      body: { temporaryPassword },
    });
    setMsg("Temporary password set. User must change it on next login.");
    await reload();
  }

  async function assignRole(userId: string) {
    if (!roleId) return;
    await apiRequest(`/users/${userId}/roles`, {
      method: "POST",
      token,
      body: { roleId },
    });
    await reload();
  }

  return (
    <AppShell
      title="Users"
      description="Create staff with a temporary password. First login forces a password change. Backend enforces every permission."
    >
      {error ? <p className="text-sm text-[var(--soko-color-danger)]">{error}</p> : null}
      {formError ? <p className="text-sm text-[var(--soko-color-danger)]">{formError}</p> : null}
      {msg ? <p className="mb-3 text-sm text-[var(--soko-color-accent)]">{msg}</p> : null}
      {can("users.write") || can("users.create") ? (
        <form
          onSubmit={(e) => void onCreate(e)}
          className="mb-6 grid gap-3 rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-4 md:grid-cols-3"
        >
          <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input
            label="Temporary password"
            type={showTempPassword ? "text" : "password"}
            value={tempPassword}
            onChange={(e) => setTempPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
          <div className="-mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--soko-color-text-muted)]">
            <span>At least 10 characters with a letter and a number. The user must change it at first sign-in.</span>
            <button
              type="button"
              className="inline-flex min-h-9 items-center gap-1 rounded px-2 font-semibold text-[var(--soko-color-primary)] focus-visible:outline-2 focus-visible:outline-[var(--soko-color-focus)]"
              onClick={() => setShowTempPassword((visible) => !visible)}
              aria-label={showTempPassword ? "Hide temporary password" : "Show temporary password"}
              aria-pressed={showTempPassword}
            >
              {showTempPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              {showTempPassword ? "Hide" : "Show"}
            </button>
          </div>
          <label className="text-sm">
            <span className="mb-1 block text-[var(--soko-color-text-muted)]">Role</span>
            <select
              className="w-full rounded-[var(--soko-radius-md)] border border-[var(--soko-color-border)] bg-[var(--soko-color-bg)] px-3 py-2"
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
            >
              <option value="">Select role…</option>
              {sortRolesForPicker(roles).map((r) => (
                <option key={r.id} value={r.id}>
                  {roleDisplayName(r.key, r.name)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <Button type="submit" disabled={busy || !tempPasswordValid}>
              {busy ? "Creating…" : "Create user"}
            </Button>
          </div>
        </form>
      ) : null}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[var(--soko-color-text-muted)]">
            <th className="py-2">Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id} className="border-t border-[var(--soko-color-border)]">
              <td className="py-2 font-semibold">
                {u.name}
                {u.mustChangePassword ? (
                  <span className="ml-2 text-xs text-[var(--soko-color-warning)]">must change password</span>
                ) : null}
              </td>
              <td>{u.email}</td>
              <td>
                {(u.userRoles ?? [])
                  .map((ur) => roleDisplayName(ur.role.key, ur.role.name))
                  .join(", ") || "—"}
              </td>
              <td>
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
                    u.status === "active"
                      ? "bg-emerald-500/10 text-emerald-700"
                      : u.status === "disabled"
                        ? "bg-red-500/10 text-red-700"
                        : "bg-amber-500/10 text-amber-700"
                  }`}
                >
                  {u.status === "invited" ? "Pending invite" : u.status}
                </span>
              </td>
              <td className="space-x-2 text-right">
                {(can("users.edit") || can("users.deactivate")) &&
                (u.status === "active" || u.status === "disabled") ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={u.id === currentUserId && u.status === "active"}
                    onClick={() => setStatusTarget({ id: u.id, name: u.name, status: u.status })}
                  >
                    {u.id === currentUserId ? "Current account" : u.status === "active" ? "Deactivate" : "Activate"}
                  </Button>
                ) : null}
                {can("users.reset_password") || can("users.write") ? (
                  <Button size="sm" variant="secondary" onClick={() => void resetPassword(u.id)}>
                    Reset password
                  </Button>
                ) : null}
                {(can("users.assign_roles") || can("users.write")) && roleId ? (
                  <Button size="sm" variant="secondary" onClick={() => void assignRole(u.id)}>
                    Assign selected role
                  </Button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {statusTarget ? (
        <ConfirmDialog
          title={statusTarget.status === "active" ? "Deactivate user?" : "Reactivate user?"}
          description={
            statusTarget.status === "active"
              ? `${statusTarget.name} will no longer be able to sign in. Their audit history and business records will remain intact.`
              : `${statusTarget.name} will be able to sign in again using their existing account.`
          }
          confirmLabel={statusTarget.status === "active" ? "Deactivate user" : "Reactivate user"}
          pending={statusBusy}
          danger={statusTarget.status === "active"}
          onCancel={() => setStatusTarget(null)}
          onConfirm={() => void toggleStatus()}
        />
      ) : null}
    </AppShell>
  );
}

export function CustomersPage() {
  const currency = useAuthStore((s) => s.tenant?.currency) ?? "KES";
  const notify = useToast();
  const { rows, error, loading, reload, token } = useList<{
    id: string;
    name: string;
    phone?: string;
    email?: string;
    creditLimitMinor?: number;
    creditBalanceMinor?: number;
    loyaltyPoints?: number;
  }>("/customers");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [creditLimit, setCreditLimit] = useState("0");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [payRef, setPayRef] = useState("");
  const [statement, setStatement] = useState<{
    customer: { id: string; name: string; phone?: string; email?: string };
    summary: {
      totalPurchasesCount: number;
      totalPurchasedMinor: number;
      totalReturnedMinor?: number;
      totalRepaidMinor?: number;
      creditLimitMinor: number;
      creditBalanceMinor: number;
      loyaltyPoints: number;
    };
    payments?: Array<{ id: string; amountMinor: number; method: string; reference?: string | null; paidAt: string }>;
    sales: Array<{ id: string; receiptNumber: string; occurredAt: string; totalMinor: number }>;
  } | null>(null);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await apiRequest("/customers", {
        method: "POST",
        token,
        body: {
          name,
          phone: phone || undefined,
          email: email || undefined,
          creditLimitMinor: creditLimit ? parseMoneyToMinor(creditLimit) : 0,
        },
      });
      setName("");
      setPhone("");
      setEmail("");
      setCreditLimit("0");
      await reload();
      notify("Customer added successfully.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Unable to add customer", "error");
    }
  }

  async function openStatement(id: string) {
    const res = await apiRequest<NonNullable<typeof statement>>(`/customers/${id}/statement`, { token });
    setStatement(res);
  }

  async function submitRepayment(e: FormEvent) {
    e.preventDefault();
    if (!statement || !payAmount) return;
    try {
      await apiRequest(`/customers/${statement.customer.id}/payments`, {
        method: "POST",
        token,
        body: {
          amountMinor: parseMoneyToMinor(payAmount),
          method: payMethod,
          reference: payRef || undefined,
        },
      });
      setPayAmount("");
      setPayRef("");
      await reload();
      await openStatement(statement.customer.id);
      notify("Customer payment recorded.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Unable to record customer payment", "error");
    }
  }

  return (
    <AppShell
      title="Customers, Credit & Loyalty"
      description="Customer profiles, purchase history, credit limits, credit repayments, and statements."
    >
      {error ? <p className="text-sm text-[var(--soko-color-danger)]">{error}</p> : null}
      <form
        onSubmit={(e) => void onCreate(e)}
        className="mb-6 grid gap-3 rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-4 md:grid-cols-5"
      >
        <Input label="Customer Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input
          label={`Credit Limit (${currency})`}
          value={creditLimit}
          onChange={(e) => setCreditLimit(e.target.value)}
        />
        <div className="flex items-end">
          <Button type="submit">Add Customer</Button>
        </div>
      </form>
      {loading ? (
        <div className="space-y-2" aria-label="Loading customers">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="soko-shimmer h-12 rounded-md border border-[var(--soko-color-border)]" />
          ))}
        </div>
      ) : !rows.length ? (
        <EmptyState title="No customers yet" body="Customer profiles help you track purchase history, loyalty, and credit. Add a customer above or create one during POS checkout." />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--soko-color-text-muted)]">
              <th className="py-2">Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th className="text-right">Credit Limit</th>
              <th className="text-right">Credit Balance</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-[var(--soko-color-border)]">
                <td className="py-2 font-semibold">{c.name}</td>
                <td>{c.phone ?? "—"}</td>
                <td>{c.email ?? "—"}</td>
                <td className="text-right tabular-nums">
                  {formatMoney(c.creditLimitMinor ?? 0, currency)}
                </td>
                <td className="text-right font-semibold tabular-nums">
                  {formatMoney(c.creditBalanceMinor ?? 0, currency)}
                </td>
                <td className="text-right">
                  <Button size="sm" variant="secondary" onClick={() => void openStatement(c.id)}>
                    Statement & Credit
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {statement ? (
        <section className="mt-6 rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl">Statement — {statement.customer.name}</h2>
            <Button size="sm" variant="ghost" onClick={() => setStatement(null)}>
              Close
            </Button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-4 text-sm">
            <div>
              <span className="text-[var(--soko-color-text-muted)]">Purchases:</span>{" "}
              <strong>{statement.summary.totalPurchasesCount}</strong>
            </div>
            <div>
              <span className="text-[var(--soko-color-text-muted)]">Total Spent:</span>{" "}
              <strong>{formatMoney(statement.summary.totalPurchasedMinor, currency)}</strong>
            </div>
            <div>
              <span className="text-[var(--soko-color-text-muted)]">Credit Balance:</span>{" "}
              <strong className="text-[var(--soko-color-primary)]">
                {formatMoney(statement.summary.creditBalanceMinor, currency)}
              </strong>
            </div>
            <div>
              <span className="text-[var(--soko-color-text-muted)]">Loyalty Points:</span>{" "}
              <strong>{statement.summary.loyaltyPoints} pts</strong>
            </div>
          </div>

          <form
            onSubmit={(e) => void submitRepayment(e)}
            className="mt-4 grid gap-3 rounded-md border border-[var(--soko-color-border)] bg-[var(--soko-color-bg-elevated)] p-3 md:grid-cols-4"
          >
            <Input
              label={`Record Credit Repayment (${currency})`}
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder="e.g. 1500.00"
              required
            />
            <label className="text-sm">
              Payment Method
              <select
                className="mt-1 w-full rounded-md border border-[var(--soko-color-border)] bg-transparent p-2"
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
              >
                <option value="cash">Cash</option>
                <option value="mpesa">M-Pesa</option>
                <option value="bank">Bank Transfer</option>
                <option value="card">Card</option>
              </select>
            </label>
            <Input
              label="Reference"
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              placeholder="M-Pesa / Bank ref"
            />
            <div className="flex items-end">
              <Button type="submit">Receive Payment</Button>
            </div>
          </form>

          {statement.payments?.length ? (
            <div className="mt-3">
              <p className="text-xs font-bold uppercase text-[var(--soko-color-text-muted)]">
                Credit Repayments Received
              </p>
              <ul className="mt-1 space-y-1 text-xs">
                {statement.payments.map((p) => (
                  <li key={p.id} className="flex justify-between border-t border-[var(--soko-color-border)] py-1">
                    <span>
                      {new Date(p.paidAt).toLocaleString()} · {p.method.toUpperCase()}{" "}
                      {p.reference ? `(${p.reference})` : ""}
                    </span>
                    <span className="font-semibold text-emerald-600">
                      −{formatMoney(p.amountMinor, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <ul className="mt-3 space-y-1 text-sm">
            {statement.sales.map((s) => (
              <li key={s.id} className="flex justify-between border-t border-[var(--soko-color-border)] py-1.5">
                <span>
                  {s.receiptNumber} · {new Date(s.occurredAt).toLocaleString()}
                </span>
                <span className="font-semibold">{formatMoney(s.totalMinor, currency)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </AppShell>
  );
}

export function SuppliersPage() {
  const currency = useAuthStore((s) => s.tenant?.currency) ?? "KES";
  const can = useAuthStore((s) => s.has);
  const notify = useToast();
  const { rows, error, loading, reload, token } = useList<{
    id: string;
    name: string;
    phone?: string;
    email?: string;
    status: string;
    contactPerson?: string | null;
    taxPin?: string | null;
    paymentTerms?: string | null;
    supplierType?: string;
    registrationNumber?: string | null;
    address?: string | null;
    town?: string | null;
    creditLimitMinor?: number | null;
    notes?: string | null;
    totalBilledMinor?: number;
    paidMinor?: number;
    balanceMinor?: number;
  }>("/suppliers");
  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [taxPin, setTaxPin] = useState("");
  const [supplierType, setSupplierType] = useState("distributor");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [address, setAddress] = useState("");
  const [town, setTown] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("Net 30");
  const [creditLimit, setCreditLimit] = useState("");
  const [notes, setNotes] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("bank");
  const [payRef, setPayRef] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingSupplier, setConfirmingSupplier] = useState<{
    id: string;
    name: string;
    active: boolean;
  } | null>(null);
  const [statement, setStatement] = useState<{
    supplier: {
      id: string;
      name: string;
      status?: string;
      phone?: string | null;
      email?: string | null;
      contactPerson?: string | null;
      taxPin?: string | null;
      supplierType?: string;
      registrationNumber?: string | null;
      address?: string | null;
      town?: string | null;
      paymentTerms?: string | null;
      creditLimitMinor?: number | null;
      notes?: string | null;
    };
    summary: {
      purchaseOrderCount: number;
      totalOrderedMinor: number;
      totalReceivedMinor: number;
      totalPaidMinor: number;
      outstandingBalanceMinor: number;
    };
    payments?: Array<{ id: string; amountMinor: number; method: string; reference?: string | null; paidAt: string }>;
    purchases: Array<{
      id: string;
      lpoNumber?: string | null;
      status: string;
      totalMinor: number;
      createdAt: string;
      items: Array<{
        id: string;
        quantity: number;
        quantityReceived: number;
        unitCostMinor: number;
        product?: { name: string; sku: string } | null;
      }>;
    }>;
    activity: Array<{ id: string; action: string; createdAt: string }>;
  } | null>(null);
  const canWriteSuppliers = can("suppliers.write") || can("suppliers.create");
  const canManageSuppliers = can("suppliers.write") || can("suppliers.edit");
  const canPaySuppliers =
    can("suppliers.write") || can("purchases.approve") || can("expenses.approve");

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      const created = await apiRequest<{ id: string }>("/suppliers", {
        method: "POST",
        token,
        body: {
          name,
          contactPerson,
          phone,
          supplierType,
          email: email || undefined,
          taxPin: taxPin || undefined,
          registrationNumber: registrationNumber || undefined,
          address: address || undefined,
          town: town || undefined,
          paymentTerms: paymentTerms || undefined,
          creditLimitMinor: creditLimit ? parseMoneyToMinor(creditLimit) : undefined,
          notes: notes || undefined,
        },
      });
      setName("");
      setContactPerson("");
      setPhone("");
      setEmail("");
      setTaxPin("");
      setSupplierType("distributor");
      setRegistrationNumber("");
      setAddress("");
      setTown("");
      setPaymentTerms("Net 30");
      setCreditLimit("");
      setNotes("");
      await reload();
      await openStatement(created.id);
      notify("Supplier added successfully.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to add supplier";
      setFormError(message);
      notify(message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function openStatement(id: string) {
    try {
      const res = await apiRequest<NonNullable<typeof statement>>(`/suppliers/${id}/statement`, { token });
      setStatement(res);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load supplier profile";
      notify(message, "error");
    }
  }

  async function submitSupplierPayment(e: FormEvent) {
    e.preventDefault();
    if (!statement || !payAmount) return;
    setBusy(true);
    try {
      await apiRequest(`/suppliers/${statement.supplier.id}/payments`, {
        method: "POST",
        token,
        body: {
          amountMinor: parseMoneyToMinor(payAmount),
          method: payMethod,
          reference: payRef || undefined,
        },
      });
      setPayAmount("");
      setPayRef("");
      await reload();
      await openStatement(statement.supplier.id);
      notify("Supplier payment recorded.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Unable to record supplier payment", "error");
    } finally {
      setBusy(false);
    }
  }

  async function changeSupplierStatus() {
    if (!confirmingSupplier) return;
    setBusy(true);
    try {
      await apiRequest(`/suppliers/${confirmingSupplier.id}/${confirmingSupplier.active ? "deactivate" : "reactivate"}`, {
        method: "POST",
        token,
      });
      await reload();
      if (statement?.supplier.id === confirmingSupplier.id) {
        await openStatement(confirmingSupplier.id);
      }
      notify(
        confirmingSupplier.active
          ? `${confirmingSupplier.name} has been deactivated.`
          : `${confirmingSupplier.name} has been reactivated.`,
      );
      setConfirmingSupplier(null);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Unable to update supplier status", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Suppliers & Balances"
      description="Distributors, importers, and beverage suppliers with LPO history, supplier payments, balances, and statements."
    >
      {error ? <p className="text-sm text-[var(--soko-color-danger)]">{error}</p> : null}
      {canWriteSuppliers ? (
      <>
      <h2 className="mb-2 font-display text-xl">Add Supplier</h2>
      <form
        onSubmit={(e) => void onCreate(e)}
        className="mb-6 grid gap-3 rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <Input label="Supplier / business name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input label="Contact person" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} required />
        <Input label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        <label className="text-sm">
          Supplier type
          <select
            className="mt-1 w-full rounded-md border border-[var(--soko-color-border)] bg-transparent p-2"
            value={supplierType}
            onChange={(e) => setSupplierType(e.target.value)}
          >
            <option value="distributor">Distributor</option>
            <option value="manufacturer">Manufacturer</option>
            <option value="wholesaler">Wholesaler</option>
            <option value="importer">Importer</option>
            <option value="other">Other</option>
          </select>
        </label>
        <Input label="Email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="KRA PIN (optional)" value={taxPin} onChange={(e) => setTaxPin(e.target.value)} />
        <Input label="Registration number (optional)" value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} />
        <Input label="Physical address (optional)" value={address} onChange={(e) => setAddress(e.target.value)} />
        <Input label="Town / city (optional)" value={town} onChange={(e) => setTown(e.target.value)} />
        <Input label="Payment terms" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
        <Input label={`Credit limit (${currency}, optional)`} inputMode="decimal" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} />
        <Input label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        {formError ? <p role="alert" className="sm:col-span-2 lg:col-span-3 text-sm text-[var(--soko-color-danger)]">{formError}</p> : null}
        <div className="flex items-end lg:col-span-3">
          <Button type="submit" disabled={busy}>{busy ? "Adding supplier…" : "+ Add Supplier"}</Button>
        </div>
      </form>
      </>
      ) : null}
      <h2 className="mb-2 font-display text-xl">Your Suppliers</h2>
      {loading ? (
        <div className="space-y-2" aria-label="Loading suppliers">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="soko-shimmer h-12 rounded-md border border-[var(--soko-color-border)]" />
          ))}
        </div>
      ) : !rows.length ? (
        <EmptyState title="No suppliers yet" body="Suppliers are businesses you purchase stock from. Add your first supplier above to link them to purchase orders and track payments." />
      ) : (
        <div className="overflow-x-auto rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)]">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="text-left text-[var(--soko-color-text-muted)]">
                <th className="px-3 py-2">Supplier</th>
                <th>Contact</th>
                <th>Phone / Email</th>
                <th>Status</th>
                <th className="text-right">Billed (LPOs)</th>
                <th className="text-right">Balance Due</th>
                <th className="px-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-t border-[var(--soko-color-border)]">
                  <td className="px-3 py-2 font-semibold">{s.name}</td>
                  <td>{s.contactPerson ?? "—"}</td>
                  <td>{[s.phone, s.email].filter(Boolean).join(" · ") || "—"}</td>
                  <td>
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${s.status === "active" ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-800"}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="text-right tabular-nums">{formatMoney(s.totalBilledMinor ?? 0, currency)}</td>
                  <td className="text-right font-semibold tabular-nums">{formatMoney(s.balanceMinor ?? 0, currency)}</td>
                  <td className="px-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="secondary" onClick={() => void openStatement(s.id)}>
                        Profile
                      </Button>
                      {canManageSuppliers ? (
                        <Button
                          size="sm"
                          variant={s.status === "active" ? "danger" : "secondary"}
                          onClick={() => setConfirmingSupplier({ id: s.id, name: s.name, active: s.status === "active" })}
                        >
                          {s.status === "active" ? "Deactivate" : "Reactivate"}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {statement ? (
        <section className="mt-6 rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold tracking-wider text-[var(--soko-color-primary)] uppercase">Supplier profile</p>
              <h2 className="font-display text-xl">{statement.supplier.name}</h2>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setStatement(null)}>
              Close
            </Button>
          </div>
          <div className="mt-4 grid gap-3 rounded-md border border-[var(--soko-color-border)] p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><span className="text-[var(--soko-color-text-muted)]">Status:</span> <strong className="capitalize">{statement.supplier.status ?? "active"}</strong></div>
            <div><span className="text-[var(--soko-color-text-muted)]">Type:</span> <strong className="capitalize">{statement.supplier.supplierType ?? "Other"}</strong></div>
            <div><span className="text-[var(--soko-color-text-muted)]">Contact:</span> <strong>{statement.supplier.contactPerson ?? "—"}</strong></div>
            <div><span className="text-[var(--soko-color-text-muted)]">Phone:</span> <strong>{statement.supplier.phone ?? "—"}</strong></div>
            <div><span className="text-[var(--soko-color-text-muted)]">Email:</span> <strong>{statement.supplier.email ?? "—"}</strong></div>
            <div><span className="text-[var(--soko-color-text-muted)]">KRA PIN:</span> <strong>{statement.supplier.taxPin ?? "—"}</strong></div>
            <div><span className="text-[var(--soko-color-text-muted)]">Registration:</span> <strong>{statement.supplier.registrationNumber ?? "—"}</strong></div>
            <div><span className="text-[var(--soko-color-text-muted)]">Payment terms:</span> <strong>{statement.supplier.paymentTerms ?? "—"}</strong></div>
            <div><span className="text-[var(--soko-color-text-muted)]">Address:</span> <strong>{[statement.supplier.address, statement.supplier.town].filter(Boolean).join(", ") || "—"}</strong></div>
            <div><span className="text-[var(--soko-color-text-muted)]">Credit limit:</span> <strong>{statement.supplier.creditLimitMinor == null ? "Not set" : formatMoney(statement.supplier.creditLimitMinor, currency)}</strong></div>
            {statement.supplier.notes ? <p className="sm:col-span-2 lg:col-span-4 text-[var(--soko-color-text-muted)]">{statement.supplier.notes}</p> : null}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div>
              <span className="text-[var(--soko-color-text-muted)]">Purchase Orders:</span>{" "}
              <strong>{statement.summary.purchaseOrderCount}</strong>
            </div>
            <div>
              <span className="text-[var(--soko-color-text-muted)]">Received Value:</span>{" "}
              <strong>{formatMoney(statement.summary.totalReceivedMinor, currency)}</strong>
            </div>
            <div>
              <span className="text-[var(--soko-color-text-muted)]">Total Paid:</span>{" "}
              <strong>{formatMoney(statement.summary.totalPaidMinor, currency)}</strong>
            </div>
            <div>
              <span className="text-[var(--soko-color-text-muted)]">Outstanding Balance:</span>{" "}
              <strong className="text-[var(--soko-color-primary)]">
                {formatMoney(statement.summary.outstandingBalanceMinor, currency)}
              </strong>
            </div>
          </div>

          {canPaySuppliers ? <form
            onSubmit={(e) => void submitSupplierPayment(e)}
            className="mt-4 grid gap-3 rounded-md border border-[var(--soko-color-border)] bg-[var(--soko-color-bg-elevated)] p-3 md:grid-cols-4"
          >
            <Input
              label={`Record Supplier Payment (${currency})`}
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder="e.g. 50000.00"
              required
              disabled={busy}
            />
            <label className="text-sm">
              Payment Method
              <select
                className="mt-1 w-full rounded-md border border-[var(--soko-color-border)] bg-transparent p-2"
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
              >
                <option value="bank">Bank Transfer</option>
                <option value="mpesa">M-Pesa</option>
                <option value="cash">Cash</option>
              </select>
            </label>
            <Input
              label="Reference"
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              placeholder="RTGS / EFT / M-Pesa ref"
            />
            <div className="flex items-end">
              <Button type="submit" disabled={busy}>{busy ? "Recording…" : "Record Payment"}</Button>
            </div>
          </form> : null}

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <section>
                <h3 className="font-semibold">Purchase history & products supplied</h3>
                {!statement.purchases.length ? (
                  <p className="mt-2 text-sm text-[var(--soko-color-text-muted)]">No purchase orders recorded for this supplier.</p>
                ) : (
                  <ul className="mt-2 space-y-3 text-sm">
                    {statement.purchases.map((purchase) => (
                      <li key={purchase.id} className="rounded-md border border-[var(--soko-color-border)] p-3">
                        <div className="flex flex-wrap justify-between gap-2">
                          <span className="font-semibold">
                            {purchase.lpoNumber ?? purchase.id.slice(0, 8)} · <span className="uppercase">{purchase.status}</span>
                          </span>
                          <span>{new Date(purchase.createdAt).toLocaleDateString()} · {formatMoney(purchase.totalMinor, currency)}</span>
                        </div>
                        <ul className="mt-2 border-t border-[var(--soko-color-border)] pt-2 text-xs text-[var(--soko-color-text-muted)]">
                          {purchase.items.map((item) => (
                            <li key={item.id} className="flex justify-between gap-2 py-0.5">
                              <span>{item.product?.name ?? item.product?.sku ?? "Product"}</span>
                              <span>Ordered {item.quantity} · Received {item.quantityReceived} · {formatMoney(item.unitCostMinor, currency)} each</span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section>
                <h3 className="font-semibold">Recent activity</h3>
                {!statement.activity.length ? (
                  <p className="mt-2 text-sm text-[var(--soko-color-text-muted)]">No supplier activity recorded yet.</p>
                ) : (
                  <ul className="mt-2 space-y-2 text-sm">
                    {statement.activity.map((activity) => (
                      <li key={activity.id} className="flex justify-between gap-3 border-b border-[var(--soko-color-border)] py-2">
                        <span>{activity.action.replaceAll(".", " ")}</span>
                        <time className="shrink-0 text-[var(--soko-color-text-muted)]">{new Date(activity.createdAt).toLocaleString()}</time>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
        </section>
      ) : null}
      {confirmingSupplier ? (
        <ConfirmDialog
            title={confirmingSupplier.active ? "Deactivate supplier?" : "Reactivate supplier?"}
            description={
              confirmingSupplier.active
                ? `${confirmingSupplier.name} will no longer be available for new purchasing activity. Historical transactions and statements will remain intact.`
                : `${confirmingSupplier.name} will become available for new purchase orders again.`
            }
            confirmLabel={confirmingSupplier.active ? "Deactivate supplier" : "Reactivate supplier"}
            danger={confirmingSupplier.active}
            pending={busy}
            onCancel={() => setConfirmingSupplier(null)}
            onConfirm={() => void changeSupplierStatus()}
        />
      ) : null}
    </AppShell>
  );
}

export function ExpensesPage() {
  const token = useAuthStore((s) => s.accessToken);
  const currency = useAuthStore((s) => s.tenant?.currency) ?? "KES";
  const notify = useToast();
  const { rows, error, reload } = useList<{
    id: string;
    category: string;
    amountMinor: number;
    notes?: string | null;
    approvalStatus?: string;
    paymentMethod?: string | null;
    occurredAt?: string;
    branch?: { name: string } | null;
  }>("/expenses");
  const { rows: branches } = useList<{ id: string; name: string }>("/branches");
  const [category, setCategory] = useState("UTILITIES");
  const [amount, setAmount] = useState("");
  const [branchId, setBranchId] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [filter, setFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await apiRequest("/expenses", {
        method: "POST",
        token,
        body: {
          branchId: branchId || branches[0]?.id,
          category,
          amountMinor: parseMoneyToMinor(amount),
          paymentMethod,
          notes: notes || undefined,
          approvalStatus: "pending",
        },
      });
      setAmount("");
      setNotes("");
      await reload();
      notify("Expense recorded and awaiting approval.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Unable to record expense", "error");
    }
  }

  async function approve(id: string) {
    setBusyId(id);
    try {
      await apiRequest(`/expenses/${id}/approve`, { method: "POST", token });
      await reload();
      notify("Expense approved.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Unable to approve expense", "error");
    } finally {
      setBusyId(null);
    }
  }

  const visible = rows.filter((e) => filter === "all" || (e.approvalStatus ?? "recorded") === filter);
  const totalPending = rows
    .filter((e) => (e.approvalStatus ?? "recorded") === "pending")
    .reduce((s, e) => s + e.amountMinor, 0);
  const totalApproved = rows
    .filter((e) => e.approvalStatus === "approved")
    .reduce((s, e) => s + e.amountMinor, 0);

  return (
    <AppShell title="Expenses" description="Operating costs only — inventory purchases belong on LPOs. Approve pending expenses before they feed financial reports.">
      {error ? <p className="text-sm text-[var(--soko-color-danger)]">{error}</p> : null}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-3">
          <p className="text-xs text-[var(--soko-color-text-muted)]">Pending approval</p>
          <p className="font-display text-xl">{formatMoney(totalPending, currency)}</p>
        </div>
        <div className="rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-3">
          <p className="text-xs text-[var(--soko-color-text-muted)]">Approved</p>
          <p className="font-display text-xl">{formatMoney(totalApproved, currency)}</p>
        </div>
        <div className="rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-3">
          <p className="text-xs text-[var(--soko-color-text-muted)]">Entries</p>
          <p className="font-display text-xl">{rows.length}</p>
        </div>
      </div>
      <form onSubmit={onCreate} className="mb-4 grid gap-3 md:grid-cols-3">
        <select className="rounded-md border border-[var(--soko-color-border)] bg-transparent p-2" value={category} onChange={(e) => setCategory(e.target.value)}>
          {["RENT","UTILITIES","TRANSPORT","SALARIES","MAINTENANCE","SUPPLIES","MARKETING","OTHER"].map((c) => <option key={c}>{c}</option>)}
        </select>
        <Input label="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <select className="rounded-md border border-[var(--soko-color-border)] bg-transparent p-2" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select className="rounded-md border border-[var(--soko-color-border)] bg-transparent p-2" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
          {["cash","mpesa","card","bank"].map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <Input label="Notes / receipt ref" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <Button type="submit">Record expense</Button>
      </form>
      <div className="mb-3 flex flex-wrap gap-2">
        {["all", "pending", "approved", "recorded"].map((f) => (
          <button
            key={f}
            type="button"
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${filter === f ? "bg-[var(--soko-color-primary-muted)] text-[var(--soko-color-primary)]" : "text-[var(--soko-color-text-muted)]"}`}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[var(--soko-color-text-muted)]">
            <th className="py-2">Date</th>
            <th>Category</th>
            <th>Branch</th>
            <th>Method</th>
            <th>Status</th>
            <th className="text-right">Amount</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {visible.map((e) => (
            <tr key={e.id} className="border-t border-[var(--soko-color-border)]">
              <td className="py-2">{e.occurredAt ? new Date(e.occurredAt).toLocaleDateString() : "—"}</td>
              <td>
                <div>{e.category}</div>
                {e.notes ? <div className="text-xs text-[var(--soko-color-text-muted)]">{e.notes}</div> : null}
              </td>
              <td>{e.branch?.name ?? "—"}</td>
              <td>{e.paymentMethod ?? "—"}</td>
              <td>{e.approvalStatus ?? "recorded"}</td>
              <td className="text-right">{formatMoney(e.amountMinor, currency)}</td>
              <td className="text-right">
                {(e.approvalStatus === "pending" || e.approvalStatus === "recorded") ? (
                  <Button size="sm" variant="secondary" disabled={busyId === e.id} onClick={() => void approve(e.id)}>
                    Approve
                  </Button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AppShell>
  );
}

export function DeliveriesPage() {
  const { rows, error, reload, token } = useList<{
    id: string; status: string; address?: string | null; phone?: string | null; feeMinor: number; sale?: { receiptNumber: string };
  }>("/deliveries");
  return (
    <AppShell title="Deliveries" description="Fee is stored separately from product revenue. Status history is append-only.">
      {error ? <p className="text-sm text-[var(--soko-color-danger)]">{error}</p> : null}
      {!rows.length ? <EmptyState title="No deliveries" body="Create a delivery from a completed sale." /> : (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[var(--soko-color-text-muted)]"><th className="py-2">Sale</th><th>Phone</th><th>Status</th><th>Fee</th><th></th></tr></thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className="border-t border-[var(--soko-color-border)]">
                <td className="py-2">{d.sale?.receiptNumber}</td>
                <td>{d.phone}</td>
                <td>{d.status}</td>
                <td>{d.feeMinor}</td>
                <td>
                  {["ASSIGNED","DISPATCHED","DELIVERED","CANCELLED"].map((st) => (
                    <button
                      key={st}
                      type="button"
                      className="mr-2 text-xs text-[var(--soko-color-primary)]"
                      onClick={() => void apiRequest(`/deliveries/${d.id}`, { method: "PATCH", token, body: { status: st } }).then(reload)}
                    >
                      {st}
                    </button>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AppShell>
  );
}

export function MessagesPage() {
  const { rows, error, reload, token } = useList<{ id: string; title: string; body: string; read?: boolean }>("/messages");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  async function send(e: FormEvent) {
    e.preventDefault();
    await apiRequest("/messages", { method: "POST", token, body: { title, body, audience: "all" } });
    setTitle("");
    setBody("");
    await reload();
  }
  return (
    <AppShell title="Messages" description="Announcements stay inside the tenant. Employees mark them read.">
      {error ? <p className="text-sm text-[var(--soko-color-danger)]">{error}</p> : null}
      <form onSubmit={send} className="mb-4 space-y-2">
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="w-full rounded-md border border-[var(--soko-color-border)] bg-transparent p-2" rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
        <Button type="submit">Publish</Button>
      </form>
      <ul className="space-y-2">
        {rows.map((m) => (
          <li key={m.id} className="rounded-md border border-[var(--soko-color-border)] p-3">
            <p className="font-semibold">{m.title} {m.read ? "" : "· unread"}</p>
            <p className="text-sm text-[var(--soko-color-text-muted)]">{m.body}</p>
            {!m.read ? (
              <button type="button" className="mt-1 text-xs text-[var(--soko-color-primary)]" onClick={() => void apiRequest(`/messages/${m.id}/read`, { method: "POST", token }).then(reload)}>
                Mark read
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </AppShell>
  );
}

export function SimplePage({
  title,
  description,
  path,
  columns,
}: {
  title: string;
  description: string;
  path: string;
  columns: string[];
}) {
  const { rows, error } = useList<Record<string, unknown>>(path);
  return (
    <AppShell title={title} description={description}>
      {error ? <p className="text-sm text-[var(--soko-color-danger)]">{error}</p> : null}
      {!rows.length ? <EmptyState title="Nothing here yet" body={description} /> : (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[var(--soko-color-text-muted)]">{columns.map((c) => <th key={c} className="py-2">{c}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={String(row.id ?? i)} className="border-t border-[var(--soko-color-border)]">
                {columns.map((c) => <td key={c} className="py-2">{String(row[c] ?? "—")}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AppShell>
  );
}

export function CategoriesPage() {
  const { rows, error, reload, token } = useList<{ id: string; name: string; status: string }>("/categories");
  const [name, setName] = useState("");
  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await apiRequest("/categories", { method: "POST", token, body: { name } });
    setName("");
    await reload();
  }
  return (
    <AppShell title="Categories" description="Product grouping used on POS chips and reports.">
      {error ? <p className="text-sm text-[var(--soko-color-danger)]">{error}</p> : null}
      <form onSubmit={onCreate} className="mb-4 flex gap-3">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit">Add category</Button>
      </form>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-[var(--soko-color-text-muted)]"><th className="py-2">Name</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-[var(--soko-color-border)]"><td className="py-2">{r.name}</td><td>{r.status}</td></tr>
          ))}
        </tbody>
      </table>
    </AppShell>
  );
}
export function BrandsPage() {
  const { rows, error, reload, token } = useList<{ id: string; name: string; status: string }>("/brands");
  const [name, setName] = useState("");
  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await apiRequest("/brands", { method: "POST", token, body: { name } });
    setName("");
    await reload();
  }
  return (
    <AppShell title="Brands" description="Optional brand on each SKU.">
      {error ? <p className="text-sm text-[var(--soko-color-danger)]">{error}</p> : null}
      <form onSubmit={onCreate} className="mb-4 flex gap-3">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit">Add brand</Button>
      </form>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-[var(--soko-color-text-muted)]"><th className="py-2">Name</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-[var(--soko-color-border)]"><td className="py-2">{r.name}</td><td>{r.status}</td></tr>
          ))}
        </tbody>
      </table>
    </AppShell>
  );
}
export function RolesPage() {
  const can = useAuthStore((s) => s.has);
  const token = useAuthStore((s) => s.accessToken);
  const { rows, error, reload } = useList<{
    id: string;
    key: string;
    name: string;
    isSystem?: boolean;
    rolePermissions?: Array<{ permission: { key: string } }>;
  }>("/roles");
  const { rows: allPerms } = useList<{ key: string; category?: string | null }>("/permissions");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState("");
  const [newKey, setNewKey] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tenantPerms = allPerms.filter((p) => !p.key.startsWith("platform."));

  function openRole(role: (typeof rows)[number]) {
    setSelectedId(role.id);
    setSelectedKeys(new Set((role.rolePermissions ?? []).map((rp) => rp.permission.key)));
  }

  function toggleKey(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function savePermissions() {
    if (!selectedId) return;
    setBusy(true);
    setMsg(null);
    try {
      await apiRequest(`/roles/${selectedId}/permissions`, {
        method: "PUT",
        token,
        body: { permissionKeys: [...selectedKeys] },
      });
      setMsg("Permissions saved.");
      await reload();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function createRole(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const key =
        newKey.trim() ||
        newName
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_|_$/g, "");
      await apiRequest("/roles", {
        method: "POST",
        token,
        body: { key, name: newName.trim(), permissionKeys: [...selectedKeys] },
      });
      setNewName("");
      setNewKey("");
      setMsg("Role created.");
      await reload();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  const grouped = tenantPerms.reduce<Record<string, typeof tenantPerms>>((acc, p) => {
    const cat = p.category || p.key.split(".")[0] || "other";
    (acc[cat] ??= []).push(p);
    return acc;
  }, {});

  return (
    <AppShell
      title="Roles & Permissions"
      description="Custom Role Builder. Select individual permissions — the API enforces them on every request."
    >
      {error ? <p className="text-sm text-[var(--soko-color-danger)]">{error}</p> : null}
      {msg ? <p className="mb-3 text-sm text-[var(--soko-color-accent)]">{msg}</p> : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {sortRolesForPicker(rows).map((role) => (
          <button
            key={role.id}
            type="button"
            onClick={() => openRole(role)}
            className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${
              selectedId === role.id
                ? "border-[var(--soko-color-primary)] bg-[var(--soko-color-primary-muted)] text-[var(--soko-color-primary)]"
                : "border-[var(--soko-color-border)]"
            }`}
          >
            {roleDisplayName(role.key, role.name)}
          </button>
        ))}
      </div>

      {(can("roles.write") || can("roles.create")) && (
        <form onSubmit={(e) => void createRole(e)} className="mb-6 flex flex-wrap gap-3">
          <Input label="New role name" value={newName} onChange={(e) => setNewName(e.target.value)} required />
          <Input
            label="Key (optional)"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="senior_sales_agent"
          />
          <div className="flex items-end">
            <Button type="submit" disabled={busy || !newName.trim()}>
              Create role
            </Button>
          </div>
        </form>
      )}

      {selectedId ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--soko-color-text-muted)]">
              {selectedKeys.size} permissions selected
            </p>
            {(can("roles.write") || can("roles.assign_permissions")) && (
              <Button onClick={() => void savePermissions()} disabled={busy}>
                {busy ? "Saving…" : "Save permissions"}
              </Button>
            )}
          </div>
          {Object.entries(grouped).map(([cat, perms]) => (
            <section
              key={cat}
              className="rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] p-4"
            >
              <h3 className="mb-2 font-display text-base capitalize">{cat}</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {perms.map((p) => (
                  <label key={p.key} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedKeys.has(p.key)}
                      onChange={() => toggleKey(p.key)}
                      disabled={!(can("roles.write") || can("roles.assign_permissions"))}
                    />
                    <span className="font-mono text-xs">{p.key}</span>
                  </label>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--soko-color-text-muted)]">Select a role to edit its permissions.</p>
      )}
    </AppShell>
  );
}
export { CreditNotesPage as ReturnsPage } from "./CreditNotesPage";
export { TransfersPage } from "./TransfersPage";
export function ReportsPage() {
  const token = useAuthStore((s) => s.accessToken);
  const currency = useAuthStore((s) => s.tenant?.currency) ?? "KES";
  const [report, setReport] = useState<{
    summary: {
      salesCount: number;
      grossSalesMinor: number;
      discountsMinor: number;
      returnsMinor: number;
      netSalesMinor: number;
      taxMinor: number;
      cogsMinor: number;
      grossProfitMinor: number;
      marginPercent: number;
      expensesMinor: number;
      netProfitMinor: number;
      stockValuationCostMinor: number;
      stockValuationRetailMinor: number;
      outstandingCustomerCreditMinor?: number;
      outstandingSupplierPayablesMinor?: number;
    };
    salesByCashier: Array<{ cashierId: string; name: string; salesCount: number; totalMinor: number }>;
    salesByBranch: Array<{ branchId: string; name: string; salesCount: number; totalMinor: number }>;
    salesByProduct: Array<{ productId: string; sku: string; name: string; quantity: number; revenueMinor: number; cogsMinor: number; profitMinor: number }>;
    salesByCategory: Array<{ category: string; quantity: number; revenueMinor: number }>;
    salesByPaymentMethod: Array<{ method: string; count: number; amountMinor: number }>;
    purchases: {
      totalPurchaseOrders: number;
      totalOrderedMinor: number;
      supplierBalances: Array<{ supplierId: string; name: string; billedMinor: number; paidMinor: number; balanceMinor: number }>;
    };
    etims: {
      statusCounts: Record<string, number>;
      failedOrPendingTransactions: Array<{ saleId: string; receiptNumber: string; occurredAt: string; totalMinor: number; fiscalStatus: string }>;
    };
  } | null>(null);

  useEffect(() => {
    void apiRequest<NonNullable<typeof report>>("/reports/comprehensive", { token })
      .then(setReport)
      .catch(() => undefined);
  }, [token]);

  return (
    <AppShell
      title="Commercial & Financial Reports"
      description="Database-backed sales, margin, cashier, category, payment method, inventory valuation, supplier balances, and eTIMS compliance reporting."
      action={
        <Button
          onClick={() => {
            void apiRequest<string>("/reports/export.csv", { token, raw: true }).then((csv) => {
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "sokoos-wines-spirits-sales.csv";
              a.click();
            });
          }}
        >
          Export Sales CSV
        </Button>
      }
    >
      {!report ? (
        <p className="text-sm text-[var(--soko-color-text-muted)]">Loading comprehensive report…</p>
      ) : (
        <div className="space-y-8">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Gross Sales", formatMoney(report.summary.grossSalesMinor, currency), `${report.summary.salesCount} receipts`],
              ["Discounts", formatMoney(report.summary.discountsMinor, currency), "Line & cart discounts"],
              ["Returns / Refunds", formatMoney(report.summary.returnsMinor, currency), "Restocked returns"],
              ["Net Sales", formatMoney(report.summary.netSalesMinor, currency), `VAT: ${formatMoney(report.summary.taxMinor, currency)}`],
              ["Gross Profit", formatMoney(report.summary.grossProfitMinor, currency), `Margin: ${report.summary.marginPercent}%`],
              ["COGS", formatMoney(report.summary.cogsMinor, currency), "Cost of goods sold"],
              ["Operating Expenses", formatMoney(report.summary.expensesMinor, currency), "Recorded expenses"],
              ["Net Operating Profit", formatMoney(report.summary.netProfitMinor, currency), "Gross profit − expenses"],
              ["Stock Value (Cost)", formatMoney(report.summary.stockValuationCostMinor, currency), "Cellar & store cost"],
              ["Stock Value (Retail)", formatMoney(report.summary.stockValuationRetailMinor, currency), "Expected retail value"],
              ["Customer Credit Receivable", formatMoney(report.summary.outstandingCustomerCreditMinor ?? 0, currency), "Outstanding customer credit"],
              ["Supplier Payables Due", formatMoney(report.summary.outstandingSupplierPayablesMinor ?? 0, currency), "Unpaid received LPO balance"],
            ].map(([label, val, hint]) => (
              <div
                key={label}
                className="rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-4"
              >
                <p className="text-xs text-[var(--soko-color-text-muted)]">{label}</p>
                <p className="mt-1 font-display text-xl">{val}</p>
                <p className="mt-1 text-xs text-[var(--soko-color-text-muted)]">{hint}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <section className="rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-4">
              <h2 className="font-display text-lg">Sales by Payment Method</h2>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--soko-color-text-muted)]">
                    <th className="py-1">Method</th>
                    <th>Txns</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {report.salesByPaymentMethod.map((m) => (
                    <tr key={m.method} className="border-t border-[var(--soko-color-border)]">
                      <td className="py-1.5 uppercase font-semibold">{m.method}</td>
                      <td>{m.count}</td>
                      <td className="text-right tabular-nums">{formatMoney(m.amountMinor, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-4">
              <h2 className="font-display text-lg">Sales by Cashier</h2>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--soko-color-text-muted)]">
                    <th className="py-1">Cashier</th>
                    <th>Receipts</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {report.salesByCashier.map((c) => (
                    <tr key={c.cashierId} className="border-t border-[var(--soko-color-border)]">
                      <td className="py-1.5 font-semibold">{c.name}</td>
                      <td>{c.salesCount}</td>
                      <td className="text-right tabular-nums">{formatMoney(c.totalMinor, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-4">
              <h2 className="font-display text-lg">Sales by Category & Branch</h2>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--soko-color-text-muted)]">
                    <th className="py-1">Category</th>
                    <th>Units</th>
                    <th className="text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {report.salesByCategory.map((c) => (
                    <tr key={c.category} className="border-t border-[var(--soko-color-border)]">
                      <td className="py-1.5 font-semibold">{c.category}</td>
                      <td>{c.quantity}</td>
                      <td className="text-right tabular-nums">{formatMoney(c.revenueMinor, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          <section className="rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-4">
            <h2 className="font-display text-lg">Product Performance & Margin</h2>
            <div className="overflow-x-auto">
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--soko-color-text-muted)]">
                    <th className="py-1">SKU</th>
                    <th>Product</th>
                    <th className="text-right">Qty Sold</th>
                    <th className="text-right">Revenue</th>
                    <th className="text-right">COGS</th>
                    <th className="text-right">Gross Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {report.salesByProduct.slice(0, 20).map((p) => (
                    <tr key={p.productId} className="border-t border-[var(--soko-color-border)]">
                      <td className="py-1.5 font-mono text-xs">{p.sku}</td>
                      <td className="font-semibold">{p.name}</td>
                      <td className="text-right tabular-nums">{p.quantity}</td>
                      <td className="text-right tabular-nums">{formatMoney(p.revenueMinor, currency)}</td>
                      <td className="text-right tabular-nums">{formatMoney(p.cogsMinor, currency)}</td>
                      <td className="text-right font-semibold tabular-nums">
                        {formatMoney(p.profitMinor, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
export function IntelligencePage() {
  const token = useAuthStore((s) => s.accessToken);
  const currency = useAuthStore((s) => s.tenant?.currency) ?? "KES";
  const [analytics, setAnalytics] = useState<{
    insufficientData: boolean;
    metrics: {
      salesCount: number;
      grossSalesMinor: number;
      netSalesMinor: number;
      returnsMinor: number;
      discountsMinor: number;
      taxMinor: number;
      cogsMinor: number;
      grossProfitMinor: number;
      marginPercent: number;
      unitsSold: number;
      averageTransactionValueMinor: number;
    };
    comparison: { netSalesChangePercent: number | null };
    breakdown: {
      topProducts: Array<{ name: string; quantity: number; revenueMinor: number }>;
      paymentMethods: Array<{ method: string; amountMinor: number }>;
      categories: Array<{ category: string; quantity: number; revenueMinor: number }>;
    };
    diagnostics: Array<{
      severity: string;
      title: string;
      explanation: string;
      evidence: Record<string, unknown>;
      affectedEntity: string;
      recommendedAction: string;
      timestamp: string;
    }>;
  } | null>(null);
  const [period, setPeriod] = useState("today");
  const [comparison, setComparison] = useState("previous_period");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [compareFrom, setCompareFrom] = useState("");
  const [compareTo, setCompareTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<{ widgets: string[]; order: string[] }>({
    widgets: ["sales", "profit", "inventory", "payments", "topProducts", "diagnostics"],
    order: ["sales", "profit", "inventory", "payments", "topProducts", "diagnostics"],
  });

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ period, comparison });
      if (period === "custom") {
        if (from) params.set("from", from);
        if (to) params.set("to", to);
      }
      if (comparison === "custom") {
        if (compareFrom) params.set("compareFrom", compareFrom);
        if (compareTo) params.set("compareTo", compareTo);
      }
      const [analyticsResult, dashboardConfig] = await Promise.all([
        apiRequest<NonNullable<typeof analytics>>(`/reports/analytics?${params.toString()}`, { token }),
        apiRequest<{ widgets: string[]; order: string[] }>("/reports/dashboard-config", { token }),
      ]);
      setAnalytics(analyticsResult);
      setConfig(dashboardConfig);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load analytics");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // Reload only when the explicit period controls change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function saveConfig(next: { widgets: string[]; order: string[] }) {
    setConfig(next);
    try {
      await apiRequest("/reports/dashboard-config", { method: "PUT", token, body: next });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save dashboard configuration");
    }
  }

  async function resetConfig() {
    try {
      const next = await apiRequest<{ widgets: string[]; order: string[] }>(
        "/reports/dashboard-config",
        { method: "DELETE", token },
      );
      setConfig(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset dashboard configuration");
    }
  }

  function moveWidget(widget: string, direction: -1 | 1) {
    const order = [...config.order];
    const index = order.indexOf(widget);
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= order.length) return;
    const current = order[index];
    const next = order[nextIndex];
    if (current === undefined || next === undefined) return;
    order[index] = next;
    order[nextIndex] = current;
    void saveConfig({ ...config, order });
  }

  const periodOptions: Array<{ value: string; label: string }> = [
    { value: "today", label: "Today" }, { value: "yesterday", label: "Yesterday" },
    { value: "current_week", label: "Current week" }, { value: "previous_week", label: "Previous week" },
    { value: "current_month", label: "Current month" }, { value: "previous_month", label: "Previous month" },
    { value: "current_quarter", label: "Current quarter" }, { value: "previous_quarter", label: "Previous quarter" },
    { value: "current_year", label: "Current year" }, { value: "previous_year", label: "Previous year" },
    { value: "custom", label: "Custom date range" },
  ];
  const widgetLabels: Record<string, string> = {
    sales: "Sales",
    profit: "Profit",
    inventory: "Inventory",
    payments: "Payment methods",
    topProducts: "Top products",
    diagnostics: "Smart diagnostics",
  };

  return (
    <AppShell title="Business intelligence" description="Completed cloud sales only — offline tickets are not double-counted after sync.">
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block">Period</span>
          <select className="rounded-lg border px-3 py-2" value={period} onChange={(e) => setPeriod(e.target.value)}>
            {periodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block">Comparison</span>
          <select className="rounded-lg border px-3 py-2" value={comparison} onChange={(e) => setComparison(e.target.value)}>
            <option value="previous_period">Previous period</option>
            <option value="previous_equivalent">Previous equivalent period</option>
            <option value="custom">Custom period</option>
          </select>
        </label>
        {period === "custom" && (
          <>
            <Input type="date" label="From" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input type="date" label="To" value={to} onChange={(e) => setTo(e.target.value)} />
          </>
        )}
        {comparison === "custom" && (
          <>
            <Input type="date" label="Compare from" value={compareFrom} onChange={(e) => setCompareFrom(e.target.value)} />
            <Input type="date" label="Compare to" value={compareTo} onChange={(e) => setCompareTo(e.target.value)} />
          </>
        )}
        <Button onClick={() => void reload()} disabled={loading}>Apply</Button>
      </div>
      {loading ? (
        <p className="text-sm text-[var(--soko-color-text-muted)]">Loading analytics…</p>
      ) : error ? (
        <div>
          <EmptyState title="Unable to load analytics" body={error} />
          <Button className="mt-3" onClick={() => void reload()} variant="secondary">Retry</Button>
        </div>
      ) : !analytics ? (
        <EmptyState title="Insufficient data" body="No recorded analytics are available for this period." />
      ) : analytics.insufficientData ? (
        <EmptyState title="Insufficient data" body="There is no recorded sales or inventory activity for this period." />
      ) : (
        <div>
          <section className="mb-6 rounded-xl border p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg">Dashboard widgets</h2>
              <Button type="button" variant="secondary" onClick={() => void resetConfig()}>Reset</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {config.order.map((widget, index) => (
                <div key={widget} className="flex items-center gap-1 rounded-lg border px-2 py-1 text-sm">
                  <button type="button" onClick={() => void saveConfig({ ...config, widgets: config.widgets.includes(widget) ? config.widgets.filter((item) => item !== widget) : [...config.widgets, widget] })}>
                    {config.widgets.includes(widget) ? "Hide" : "Show"} {widgetLabels[widget]}
                  </button>
                  <button type="button" aria-label={`Move ${widgetLabels[widget]} up`} disabled={index === 0} onClick={() => moveWidget(widget, -1)}>↑</button>
                  <button type="button" aria-label={`Move ${widgetLabels[widget]} down`} disabled={index === config.order.length - 1} onClick={() => moveWidget(widget, 1)}>↓</button>
                </div>
              ))}
            </div>
          </section>
          <div className="grid gap-6 lg:grid-cols-2">
            {config.order.filter((widget) => config.widgets.includes(widget)).map((widget) => {
              if (widget === "sales") return (
                <section key={widget} className="rounded-xl border p-5">
                  <h2 className="font-display text-xl">Sales</h2>
                  <p className="mt-3 text-2xl">{formatMoney(analytics.metrics.netSalesMinor, currency)}</p>
                  <p className="text-sm text-[var(--soko-color-text-muted)]">{analytics.metrics.salesCount} transactions · {analytics.metrics.unitsSold} units</p>
                  {analytics.comparison.netSalesChangePercent !== null && <p className="mt-2 text-sm">Net sales change: {analytics.comparison.netSalesChangePercent}%</p>}
                </section>
              );
              if (widget === "profit") return (
                <section key={widget} className="rounded-xl border p-5">
                  <h2 className="font-display text-xl">Profit</h2>
                  <p className="mt-3 text-2xl">{formatMoney(analytics.metrics.grossProfitMinor, currency)}</p>
                  <p className="text-sm text-[var(--soko-color-text-muted)]">Gross margin {analytics.metrics.marginPercent}%</p>
                </section>
              );
              if (widget === "inventory") return (
                <section key={widget} className="rounded-xl border p-5">
                  <h2 className="font-display text-xl">Inventory</h2>
                  <p className="mt-3 text-sm">COGS: {formatMoney(analytics.metrics.cogsMinor, currency)}</p>
                </section>
              );
              if (widget === "payments") return (
                <section key={widget} className="rounded-xl border p-5">
                  <h2 className="font-display text-xl">Payment methods</h2>
                  <ul className="mt-3 space-y-2 text-sm">
                    {analytics.breakdown.paymentMethods.map((payment) => (
                      <li key={payment.method} className="flex justify-between"><span>{payment.method}</span><span>{formatMoney(payment.amountMinor, currency)}</span></li>
                    ))}
                  </ul>
                </section>
              );
              if (widget === "topProducts") return (
                <section key={widget} className="rounded-xl border p-5">
                  <h2 className="font-display text-xl">Top products</h2>
                  <ul className="mt-3 space-y-2 text-sm">
                    {analytics.breakdown.topProducts.slice(0, 8).map((product) => (
                      <li key={product.name} className="flex justify-between"><span>{product.name}</span><span>{formatMoney(product.revenueMinor, currency)}</span></li>
                    ))}
                  </ul>
                </section>
              );
              return (
                <section key={widget} className="rounded-xl border p-5">
                  <h2 className="font-display text-xl">Smart diagnostics</h2>
                  <ul className="mt-3 space-y-3 text-sm">
                    {analytics.diagnostics.map((diagnostic) => (
                      <li key={diagnostic.title}>
                        <strong>{diagnostic.title}</strong>
                        <p>{diagnostic.explanation}</p>
                        <p className="text-[var(--soko-color-text-muted)]">Action: {diagnostic.recommendedAction}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </AppShell>
  );
}
export function IntegrationsPage() {
  const token = useAuthStore((s) => s.accessToken);
  const [health, setHealth] = useState<
    Array<{ provider: string; configured: boolean; mode: string; notes: string; lastError: string | null }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    void apiRequest<typeof health>("/integrations/health", { token })
      .then(setHealth)
      .catch((e: Error) => setError(e.message));
  }, [token]);

  async function markConfigured(provider: "mpesa" | "etims" | "printer") {
    setError(null);
    setInfo(null);
    const body =
      provider === "mpesa"
        ? { mpesa: { enabled: true, mode: "sandbox", shortcode: "174379", consumerKeySet: true, consumerSecretSet: true, passkeySet: true } }
        : provider === "etims"
          ? { etims: { enabled: true, mode: "sandbox", pin: "P000000000X" } }
          : { printer: { enabled: true, defaultTarget: "usb:pos-80" } };
    const data = await apiRequest<typeof health>("/integrations/settings", {
      method: "PATCH",
      token,
      body,
    });
    setHealth(data);
    setInfo(
      `${provider} settings saved. Live confirmation still requires verified provider callbacks — never faked.`,
    );
  }

  return (
    <AppShell title="Integrations" description="M-Pesa, eTIMS, printers, and notifications — safe boundaries; no fake fiscal or payment confirmations.">
      {error ? <p className="mb-2 text-sm text-[var(--soko-color-danger)]">{error}</p> : null}
      {info ? <p className="mb-2 text-sm text-emerald-700">{info}</p> : null}
      <ul className="space-y-3">
        {health.map((h) => (
          <li key={h.provider} className="rounded-lg border border-[var(--soko-color-border)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold capitalize">{h.provider}</p>
                <p className="text-xs text-[var(--soko-color-text-muted)]">
                  {h.configured ? "configured" : "not configured"} · {h.mode}
                </p>
                <p className="mt-2 text-sm">{h.notes}</p>
                {h.lastError ? <p className="mt-1 text-xs text-[var(--soko-color-danger)]">{h.lastError}</p> : null}
              </div>
              {(["mpesa", "etims", "printer"] as const).includes(h.provider as "mpesa") ? (
                <Button type="button" variant="secondary" onClick={() => void markConfigured(h.provider as "mpesa" | "etims" | "printer")}>
                  Save sandbox flags
                </Button>
              ) : null}
            </div>
          </li>
        ))}
        {!health.length ? <li className="text-sm text-[var(--soko-color-text-muted)]">Loading integration health…</li> : null}
      </ul>
    </AppShell>
  );
}
export function DevicesPage() {
  return <SimplePage title="Devices" description="Registered POS terminals, last seen, sync cursor." path="/auth/devices" columns={["name", "status"]} />;
}
export function NotificationsPage() {
  return <SimplePage title="Notifications" description="Per-user inbox: low stock, sync failures, sales." path="/notifications" columns={["type", "body"]} />;
}

export function WarehousesPage() {
  const { rows: warehouses, error, reload, token } = useList<{
    id: string;
    name: string;
    branchId: string;
    isDefault: boolean;
    status: string;
  }>("/warehouses");
  const { rows: branches } = useList<{ id: string; name: string; code: string }>("/branches");
  const [name, setName] = useState("");
  const [branchId, setBranchId] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const branchMap = new Map(branches.map((b) => [b.id, b]));

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const targetBranch = branchId || branches[0]?.id;
    if (!targetBranch || !name.trim()) return;
    setBusy(true);
    setFormErr(null);
    try {
      await apiRequest("/warehouses", {
        method: "POST",
        token,
        body: { branchId: targetBranch, name: name.trim(), isDefault },
      });
      setName("");
      setIsDefault(false);
      await reload();
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : "Failed to create warehouse");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Warehouses & Cellars"
      description="Branch-bound storage locations for main cellar stock, retail floor stock, and bonded/wholesale stores."
    >
      {error ? <p className="mb-3 text-sm text-[var(--soko-color-danger)]">{error}</p> : null}
      {formErr ? <p className="mb-3 text-sm text-[var(--soko-color-danger)]">{formErr}</p> : null}
      <form
        onSubmit={(e) => void onCreate(e)}
        className="mb-6 grid gap-3 rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-4 md:grid-cols-4"
      >
        <label className="text-sm">
          Branch
          <select
            className="mt-1 w-full rounded-md border border-[var(--soko-color-border)] bg-transparent p-2"
            value={branchId || branches[0]?.id || ""}
            onChange={(e) => setBranchId(e.target.value)}
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} — {b.name}
              </option>
            ))}
          </select>
        </label>
        <Input
          label="Warehouse / Store name"
          placeholder="e.g. Main Cellar or Retail Counter"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <label className="flex items-center gap-2 pt-6 text-sm">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
          />
          Default POS stock source for branch
        </label>
        <div className="flex items-end">
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Add warehouse"}
          </Button>
        </div>
      </form>
      {!warehouses.length ? (
        <EmptyState title="No warehouses" body="Add a default warehouse for each branch to track stock balances." />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--soko-color-text-muted)]">
              <th className="py-2">Warehouse</th>
              <th>Branch</th>
              <th>Default for POS</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {warehouses.map((w) => {
              const b = branchMap.get(w.branchId);
              return (
                <tr key={w.id} className="border-t border-[var(--soko-color-border)]">
                  <td className="py-2 font-semibold">{w.name}</td>
                  <td>{b ? `${b.name} (${b.code})` : w.branchId}</td>
                  <td>{w.isDefault ? "Default" : "Secondary"}</td>
                  <td>{w.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </AppShell>
  );
}

export function AuditPage() {
  const token = useAuthStore((s) => s.accessToken);
  const [rows, setRows] = useState<
    Array<{
      id: string;
      action: string;
      entityType: string;
      entityId?: string | null;
      actorUserId?: string | null;
      deviceId?: string | null;
      metadata?: Record<string, unknown>;
      createdAt: string;
    }>
  >([]);
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const params = new URLSearchParams({ limit: "100" });
    if (actionFilter.trim()) params.set("action", actionFilter.trim());
    if (entityFilter.trim()) params.set("entityType", entityFilter.trim());
    const res = await apiRequest<typeof rows | { data: typeof rows }>(`/audit-logs?${params.toString()}`, {
      token,
    });
    setRows(Array.isArray(res) ? res : res.data);
  }

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <AppShell
      title="Audit Trail"
      description="Immutable tenant security and operational log covering logins, stock movements, price updates, sales, refunds, and eTIMS actions."
    >
      {error ? <p className="mb-3 text-sm text-[var(--soko-color-danger)]">{error}</p> : null}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Input
          label="Filter by action"
          placeholder="e.g. stock, sale, etims, auth"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
        />
        <Input
          label="Entity type"
          placeholder="e.g. sale, stock_movement, product"
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
        />
        <Button type="button" variant="secondary" onClick={() => void load()}>
          Apply filter
        </Button>
      </div>
      {!rows.length ? (
        <EmptyState title="No audit events matched" body="Mutating actions and domain events are recorded automatically." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--soko-color-text-muted)]">
                <th className="py-2">Timestamp</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Actor / Device</th>
                <th>Metadata</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--soko-color-border)]">
                  <td className="py-2 whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="font-mono text-xs font-semibold">{r.action}</td>
                  <td>
                    {r.entityType}
                    {r.entityId ? <span className="ml-1 font-mono text-xs text-[var(--soko-color-text-muted)]">({r.entityId.slice(0, 8)})</span> : null}
                  </td>
                  <td className="font-mono text-xs text-[var(--soko-color-text-muted)]">
                    {r.actorUserId ? r.actorUserId.slice(0, 8) : "system"}
                    {r.deviceId ? ` · dev:${r.deviceId.slice(0, 6)}` : ""}
                  </td>
                  <td className="max-w-md truncate font-mono text-xs text-[var(--soko-color-text-muted)]">
                    {JSON.stringify(r.metadata ?? {})}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}

export function EtimsPage() {
  const token = useAuthStore((s) => s.accessToken);
  const currency = useAuthStore((s) => s.tenant?.currency) ?? "KES";
  const [sales, setSales] = useState<
    Array<{
      id: string;
      receiptNumber: string;
      totalMinor: number;
      taxMinor: number;
      fiscalStatus: string;
      occurredAt: string;
      cashierNameSnapshot?: string | null;
      branchNameSnapshot?: string | null;
    }>
  >([]);
  const [submissions, setSubmissions] = useState<
    Array<{
      saleId: string;
      receiptNumber: string;
      status: string;
      attempts: number;
      fiscalInvoiceNumber: string | null;
      controlUnitId: string | null;
      lastError: string | null;
      updatedAt: string;
    }>
  >([]);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [salesRes, subRes] = await Promise.all([
      apiRequest<typeof sales | { data: typeof sales }>("/sales?limit=100", { token }),
      apiRequest<typeof submissions | { data: typeof submissions }>("/integrations/etims/submissions", { token }).catch(
        () => [] as typeof submissions,
      ),
    ]);
    setSales(Array.isArray(salesRes) ? salesRes : salesRes.data);
    setSubmissions(Array.isArray(subRes) ? subRes : (subRes as { data: typeof submissions }).data ?? []);
  }

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function submitOrRetry(saleId: string, isRetry = false) {
    setBusyId(saleId);
    setError(null);
    setMsg(null);
    try {
      const path = isRetry
        ? `/integrations/etims/sales/${saleId}/retry`
        : `/integrations/etims/sales/${saleId}/submit`;
      const res = await apiRequest<{ status: string; message: string; fiscalInvoiceNumber: string | null }>(path, {
        method: "POST",
        token,
      });
      setMsg(`${res.status}: ${res.message}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "eTIMS submission failed");
    } finally {
      setBusyId(null);
    }
  }

  const subBySale = new Map(submissions.map((s) => [s.saleId, s]));
  const rows = sales.map((s) => {
    const sub = subBySale.get(s.id);
    const normalizedStatus = (sub?.status ?? s.fiscalStatus ?? "not_configured").toUpperCase();
    return {
      ...s,
      normalizedStatus,
      sub,
    };
  });

  const filtered = rows.filter((r) => statusFilter === "ALL" || r.normalizedStatus === statusFilter);
  const counts = {
    ACCEPTED: rows.filter((r) => r.normalizedStatus === "ACCEPTED").length,
    PENDING: rows.filter((r) => r.normalizedStatus === "PENDING" || r.normalizedStatus === "QUEUED").length,
    RETRYING: rows.filter((r) => r.normalizedStatus === "RETRYING").length,
    FAILED: rows.filter((r) => r.normalizedStatus === "FAILED").length,
    NOT_CONFIGURED: rows.filter((r) => r.normalizedStatus === "NOT_CONFIGURED" || r.normalizedStatus === "NOT_SUBMITTED").length,
  };

  return (
    <AppShell
      title="KRA eTIMS Compliance & Queue"
      description="OSCU / VSCU fiscal submission queue. Local POS sales are never lost when eTIMS is unreachable; failed submissions can be retried idempotently."
    >
      {error ? <p className="mb-3 text-sm text-[var(--soko-color-danger)]">{error}</p> : null}
      {msg ? <p className="mb-3 text-sm text-[var(--soko-color-primary)]">{msg}</p> : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-5">
        {(
          [
            ["ACCEPTED", counts.ACCEPTED, "Verified by CU"],
            ["PENDING", counts.PENDING, "Awaiting OSCU/VSCU"],
            ["RETRYING", counts.RETRYING, "Retry in progress"],
            ["FAILED", counts.FAILED, "Needs attention"],
            ["NOT_CONFIGURED", counts.NOT_CONFIGURED, "Unconfigured PIN/CU"],
          ] as const
        ).map(([label, count, hint]) => (
          <button
            key={label}
            type="button"
            onClick={() => setStatusFilter(statusFilter === label ? "ALL" : label)}
            className={`rounded-[var(--soko-radius-lg)] border p-3 text-left transition ${
              statusFilter === label
                ? "border-[var(--soko-color-primary)] bg-[var(--soko-color-primary-muted)]"
                : "border-[var(--soko-color-border)] bg-[var(--soko-color-surface)]"
            }`}
          >
            <p className="text-xs font-semibold uppercase text-[var(--soko-color-text-muted)]">{label}</p>
            <p className="mt-1 font-display text-2xl">{count}</p>
            <p className="text-[11px] text-[var(--soko-color-text-muted)]">{hint}</p>
          </button>
        ))}
      </div>

      {!filtered.length ? (
        <EmptyState title="No transactions in this eTIMS state" body="Complete sales on POS or switch filter above." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--soko-color-text-muted)]">
                <th className="py-2">Receipt</th>
                <th>Date</th>
                <th>Branch / Cashier</th>
                <th className="text-right">Total</th>
                <th className="text-right">Tax</th>
                <th>eTIMS Status</th>
                <th>CU Invoice No.</th>
                <th>Attempts / Error</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-[var(--soko-color-border)]">
                  <td className="py-2 font-mono font-semibold">{r.receiptNumber}</td>
                  <td>{new Date(r.occurredAt).toLocaleString()}</td>
                  <td>
                    {r.branchNameSnapshot ?? "—"} · {r.cashierNameSnapshot ?? "—"}
                  </td>
                  <td className="text-right">{formatMoney(r.totalMinor, currency)}</td>
                  <td className="text-right">{formatMoney(r.taxMinor ?? 0, currency)}</td>
                  <td>
                    <span className="rounded px-2 py-0.5 text-xs font-semibold uppercase bg-[var(--soko-color-surface-muted)]">
                      {r.normalizedStatus}
                    </span>
                  </td>
                  <td className="font-mono text-xs">{r.sub?.fiscalInvoiceNumber ?? "—"}</td>
                  <td className="max-w-xs truncate text-xs text-[var(--soko-color-text-muted)]">
                    {r.sub ? `${r.sub.attempts} attempt(s)` : "0 attempts"}
                    {r.sub?.lastError ? ` · ${r.sub.lastError}` : ""}
                  </td>
                  <td className="text-right">
                    {r.normalizedStatus !== "ACCEPTED" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busyId === r.id}
                        onClick={() =>
                          void submitOrRetry(
                            r.id,
                            r.normalizedStatus === "FAILED" || r.normalizedStatus === "RETRYING",
                          )
                        }
                      >
                        {busyId === r.id
                          ? "Sending…"
                          : r.normalizedStatus === "FAILED" || r.normalizedStatus === "RETRYING"
                            ? "Retry eTIMS"
                            : "Submit eTIMS"}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
