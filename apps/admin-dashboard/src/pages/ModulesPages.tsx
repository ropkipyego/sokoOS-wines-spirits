import { useEffect, useState, type FormEvent } from "react";
import { Button, Input } from "@sokoos/ui";
import { AppShell, EmptyState } from "../components/AppShell";
import { apiRequest } from "../api/client";
import { useAuthStore } from "../stores/auth";
import { formatMoney, parseMoneyToMinor } from "../lib/money";

function useList<T>(path: string) {
  const token = useAuthStore((s) => s.accessToken);
  const [rows, setRows] = useState<T[]>([]);
  const [error, setError] = useState<string | null>(null);
  async function reload() {
    const res = await apiRequest<T[] | { data: T[] }>(path, { token });
    setRows(Array.isArray(res) ? res : res.data);
  }
  useEffect(() => {
    void reload().catch((e: Error) => setError(e.message));
  }, [token, path]);
  return { rows, error, reload, token };
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
  const { rows, error, reload, token } = useList<{ id: string; name: string; email: string; status: string }>("/users");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    setMsg(null);
    try {
      const data = await apiRequest<{
        user: { email: string };
        activationToken: string;
        activateUrl: string;
      }>("/users/invite", { method: "POST", token, body: { name, email } });
      setMsg(
        `Invited ${data.user.email}. One-time activation link issued (also emailed). Token shown once: ${data.activationToken}`,
      );
      setName("");
      setEmail("");
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppShell
      title="Employees"
      description="Invite staff with a one-time activation link. Permanent passwords are never emailed. Backend enforces permissions."
    >
      {error ? <p className="text-sm text-[var(--soko-color-danger)]">{error}</p> : null}
      {formError ? <p className="text-sm text-[var(--soko-color-danger)]">{formError}</p> : null}
      {msg ? <p className="mb-3 break-all text-sm text-[var(--soko-color-accent)]">{msg}</p> : null}
      <form onSubmit={(e) => void onInvite(e)} className="mb-4 grid gap-3 md:grid-cols-3">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <div className="flex items-end">
          <Button type="submit" disabled={busy || !name.trim() || !email.trim()}>
            {busy ? "Sending…" : "Send invitation"}
          </Button>
        </div>
      </form>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[var(--soko-color-text-muted)]">
            <th className="py-2">Name</th>
            <th>Email</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id} className="border-t border-[var(--soko-color-border)]">
              <td className="py-2">{u.name}</td>
              <td>{u.email}</td>
              <td>{u.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AppShell>
  );
}

export function CustomersPage() {
  const currency = useAuthStore((s) => s.tenant?.currency) ?? "KES";
  const { rows, error, reload, token } = useList<{
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
  const [statement, setStatement] = useState<{
    customer: { id: string; name: string; phone?: string; email?: string };
    summary: {
      totalPurchasesCount: number;
      totalPurchasedMinor: number;
      creditLimitMinor: number;
      creditBalanceMinor: number;
      loyaltyPoints: number;
    };
    sales: Array<{ id: string; receiptNumber: string; occurredAt: string; totalMinor: number }>;
  } | null>(null);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
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
  }

  async function openStatement(id: string) {
    const res = await apiRequest<NonNullable<typeof statement>>(`/customers/${id}/statement`, { token });
    setStatement(res);
  }

  return (
    <AppShell
      title="Customers, Credit & Loyalty"
      description="Customer profiles, purchase history, credit limits, and statements."
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
      {!rows.length ? (
        <EmptyState title="No customers" body="Create customer profiles here or during POS checkout." />
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
                <td className="text-right tabular-nums">
                  {formatMoney(c.creditBalanceMinor ?? 0, currency)}
                </td>
                <td className="text-right">
                  <Button size="sm" variant="secondary" onClick={() => void openStatement(c.id)}>
                    Statement
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
              <strong>{formatMoney(statement.summary.creditBalanceMinor, currency)}</strong>
            </div>
            <div>
              <span className="text-[var(--soko-color-text-muted)]">Loyalty Points:</span>{" "}
              <strong>{statement.summary.loyaltyPoints} pts</strong>
            </div>
          </div>
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
  const { rows, error, reload, token } = useList<{
    id: string;
    name: string;
    phone?: string;
    email?: string;
    contactPerson?: string | null;
    taxPin?: string | null;
    paymentTerms?: string | null;
    totalBilledMinor?: number;
    paidMinor?: number;
    balanceMinor?: number;
  }>("/suppliers");
  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [taxPin, setTaxPin] = useState("");
  const [statement, setStatement] = useState<{
    supplier: { id: string; name: string };
    summary: {
      purchaseOrderCount: number;
      totalOrderedMinor: number;
      totalReceivedMinor: number;
      totalPaidMinor: number;
      outstandingBalanceMinor: number;
    };
    purchases: Array<{ id: string; lpoNumber?: string | null; status: string; totalMinor: number; createdAt: string }>;
  } | null>(null);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await apiRequest("/suppliers", {
      method: "POST",
      token,
      body: {
        name,
        contactPerson: contactPerson || undefined,
        phone: phone || undefined,
        email: email || undefined,
        taxPin: taxPin || undefined,
      },
    });
    setName("");
    setContactPerson("");
    setPhone("");
    setEmail("");
    setTaxPin("");
    await reload();
  }

  async function openStatement(id: string) {
    const res = await apiRequest<NonNullable<typeof statement>>(`/suppliers/${id}/statement`, { token });
    setStatement(res);
  }

  return (
    <AppShell
      title="Suppliers & Balances"
      description="Distributors, importers, and beverage suppliers with LPO history, balances, and statements."
    >
      {error ? <p className="text-sm text-[var(--soko-color-danger)]">{error}</p> : null}
      <form
        onSubmit={(e) => void onCreate(e)}
        className="mb-6 grid gap-3 rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-4 md:grid-cols-6"
      >
        <Input label="Supplier / Distributor" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input label="Contact Person" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
        <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="KRA PIN" value={taxPin} onChange={(e) => setTaxPin(e.target.value)} />
        <div className="flex items-end">
          <Button type="submit">Add Supplier</Button>
        </div>
      </form>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[var(--soko-color-text-muted)]">
            <th className="py-2">Supplier</th>
            <th>Contact</th>
            <th>Phone / Email</th>
            <th>KRA PIN</th>
            <th className="text-right">Billed (LPOs)</th>
            <th className="text-right">Balance Due</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="border-t border-[var(--soko-color-border)]">
              <td className="py-2 font-semibold">{s.name}</td>
              <td>{s.contactPerson ?? "—"}</td>
              <td>{[s.phone, s.email].filter(Boolean).join(" · ") || "—"}</td>
              <td className="font-mono text-xs">{s.taxPin ?? "—"}</td>
              <td className="text-right tabular-nums">{formatMoney(s.totalBilledMinor ?? 0, currency)}</td>
              <td className="text-right font-semibold tabular-nums">
                {formatMoney(s.balanceMinor ?? 0, currency)}
              </td>
              <td className="text-right">
                <Button size="sm" variant="secondary" onClick={() => void openStatement(s.id)}>
                  Statement
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {statement ? (
        <section className="mt-6 rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl">Supplier Statement — {statement.supplier.name}</h2>
            <Button size="sm" variant="ghost" onClick={() => setStatement(null)}>
              Close
            </Button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-4 text-sm">
            <div>
              <span className="text-[var(--soko-color-text-muted)]">Purchase Orders:</span>{" "}
              <strong>{statement.summary.purchaseOrderCount}</strong>
            </div>
            <div>
              <span className="text-[var(--soko-color-text-muted)]">Ordered Value:</span>{" "}
              <strong>{formatMoney(statement.summary.totalOrderedMinor, currency)}</strong>
            </div>
            <div>
              <span className="text-[var(--soko-color-text-muted)]">Received Value:</span>{" "}
              <strong>{formatMoney(statement.summary.totalReceivedMinor, currency)}</strong>
            </div>
            <div>
              <span className="text-[var(--soko-color-text-muted)]">Outstanding Balance:</span>{" "}
              <strong>{formatMoney(statement.summary.outstandingBalanceMinor, currency)}</strong>
            </div>
          </div>
          <ul className="mt-3 space-y-1 text-sm">
            {statement.purchases.map((p) => (
              <li key={p.id} className="flex justify-between border-t border-[var(--soko-color-border)] py-1.5">
                <span>
                  {p.lpoNumber ?? p.id.slice(0, 8)} · <span className="uppercase">{p.status}</span> ·{" "}
                  {new Date(p.createdAt).toLocaleDateString()}
                </span>
                <span className="font-semibold">{formatMoney(p.totalMinor, currency)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </AppShell>
  );
}

export function ExpensesPage() {
  const token = useAuthStore((s) => s.accessToken);
  const currency = useAuthStore((s) => s.tenant?.currency) ?? "KES";
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
  }

  async function approve(id: string) {
    setBusyId(id);
    try {
      await apiRequest(`/expenses/${id}/approve`, { method: "POST", token });
      await reload();
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
  const { rows, error } = useList<{
    id: string;
    key: string;
    name: string;
    rolePermissions?: Array<{ permission: { key: string } }>;
  }>("/roles");
  return (
    <AppShell title="Roles" description="Permission templates. Backend enforces every key — hiding a button is not enough.">
      {error ? <p className="text-sm text-[var(--soko-color-danger)]">{error}</p> : null}
      <div className="space-y-4">
        {rows.map((role) => (
          <article key={role.id} className="rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] p-4">
            <h2 className="font-display text-lg">{role.name} <span className="text-sm text-[var(--soko-color-text-muted)]">({role.key})</span></h2>
            <p className="mt-2 text-xs text-[var(--soko-color-text-muted)]">
              {(role.rolePermissions ?? []).map((rp) => rp.permission.key).join(", ") || "Permissions loaded with role detail — assign via API PUT /roles/:id/permissions"}
            </p>
          </article>
        ))}
      </div>
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
  const [dash, setDash] = useState<{
    today: { salesTotalMinor: number; salesCount: number };
    week: { salesTotalMinor: number; salesCount: number };
    month: { salesTotalMinor: number; salesCount: number };
    topProducts: Array<{ nameSnapshot: string; _sum: { quantity: number | null; lineTotalMinor: number | null } }>;
    paymentBreakdown: Array<{ method: string; _sum: { amountMinor: number | null } }>;
  } | null>(null);
  useEffect(() => {
    void apiRequest<NonNullable<typeof dash>>("/reports/dashboard", { token }).then(setDash).catch(() => undefined);
  }, [token]);
  const periods = dash
    ? [
        { label: "Today", value: dash.today.salesTotalMinor, count: dash.today.salesCount },
        { label: "Week", value: dash.week.salesTotalMinor, count: dash.week.salesCount },
        { label: "Month", value: dash.month.salesTotalMinor, count: dash.month.salesCount },
      ]
    : [];
  const max = Math.max(...periods.map((p) => p.value), 1);
  return (
    <AppShell title="Business intelligence" description="Completed cloud sales only — offline tickets are not double-counted after sync.">
      {!dash ? (
        <p className="text-sm text-[var(--soko-color-text-muted)]">Loading…</p>
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          <section>
            <h2 className="font-display text-xl">Sales periods</h2>
            <ul className="mt-4 space-y-3">
              {periods.map((p) => (
                <li key={p.label}>
                  <div className="flex justify-between text-sm">
                    <span>{p.label}</span>
                    <span>{formatMoney(p.value, currency)} · {p.count} txns</span>
                  </div>
                  <div className="mt-1 h-3 overflow-hidden rounded-full bg-[var(--soko-color-surface-muted)]">
                    <div className="h-full rounded-full bg-[var(--soko-color-accent)]" style={{ width: `${Math.round((p.value / max) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="font-display text-xl">Top products</h2>
            <ul className="mt-4 space-y-2 text-sm">
              {dash.topProducts.map((p) => (
                <li key={p.nameSnapshot} className="flex justify-between">
                  <span>{p.nameSnapshot}</span>
                  <span className="text-[var(--soko-color-text-muted)]">{formatMoney(p._sum.lineTotalMinor ?? 0, currency)}</span>
                </li>
              ))}
            </ul>
          </section>
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
