import { useEffect, useState, type FormEvent } from "react";
import { Button, Input } from "@sokoos/ui";
import { AppShell, EmptyState, ProductImage } from "../components/AppShell";
import { apiRequest, mediaUrl } from "../api/client";
import { useAuthStore } from "../stores/auth";
import { formatMoney, parseMoneyToMinor } from "../lib/money";

type Product = {
  id: string;
  sku: string;
  name: string;
  barcode?: string | null;
  categoryId?: string | null;
  brandId?: string | null;
  unitId?: string | null;
  category?: { id: string; name: string } | null;
  brand?: { id: string; name: string } | null;
  unit?: { id: string; name: string; abbreviation: string } | null;
  priceMinor: number;
  costMinor?: number | null;
  wholesalePriceMinor?: number | null;
  taxRateBps?: number;
  size?: string | null;
  abv?: string | null;
  packSize?: number | null;
  caseQuantity?: number | null;
  packagingType?: string | null;
  bottleProductId?: string | null;
  conversionFactor?: number | null;
  supplierId?: string | null;
  status: string;
  featured: boolean;
  minStockQty: number;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
};

type Category = { id: string; name: string };
type Brand = { id: string; name: string };
type Unit = { id: string; name: string; abbreviation: string };
type Supplier = { id: string; name: string };

type ImportValidation = {
  totalRows: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  warningCount: number;
  validRows: Array<{
    row: number;
    sku: string;
    name: string;
    barcode?: string;
    categoryName?: string;
    brandName?: string;
    size?: string;
    packSize: number;
    priceMinor: number;
    costMinor?: number;
  }>;
  invalidRows: Array<{ row: number; sku?: string; error: string }>;
  duplicateRows: Array<{ row: number; sku?: string; barcode?: string; error: string }>;
  warnings: Array<{ row: number; sku: string; warning: string }>;
  errors: Array<{ row: number; sku?: string; error: string }>;
};

const PACKAGING_TYPES = ["bottle", "case", "can", "pack", "keg"] as const;

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const header = splitCsvLine(lines[0]!).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const rec: Record<string, string> = {};
    header.forEach((h, i) => {
      rec[h] = (cols[i] ?? "").trim();
    });
    return rec;
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

export function ProductsPage() {
  const token = useAuthStore((s) => s.accessToken);
  const currency = useAuthStore((s) => s.tenant?.currency) ?? "KES";
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Create form state
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [size, setSize] = useState("750ml");
  const [abv, setAbv] = useState("");
  const [packagingType, setPackagingType] = useState<string>("bottle");
  const [packSize, setPackSize] = useState("1");
  const [bottleProductId, setBottleProductId] = useState("");
  const [price, setPrice] = useState("");
  const [wholesalePrice, setWholesalePrice] = useState("");
  const [cost, setCost] = useState("");
  const [taxRatePct, setTaxRatePct] = useState("16");
  const [minStockQty, setMinStockQty] = useState("6");
  const [featured, setFeatured] = useState(false);
  const [createImage, setCreateImage] = useState<File | null>(null);
  const [createPreview, setCreatePreview] = useState<string | null>(null);

  // Import state
  const [csvText, setCsvText] = useState("");
  const [validation, setValidation] = useState<ImportValidation | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [pRes, cRes, bRes, uRes, sRes] = await Promise.all([
      apiRequest<{ data?: Product[] } | Product[]>("/products?limit=300", { token }),
      apiRequest<{ data?: Category[] } | Category[]>("/categories", { token }).catch(() => []),
      apiRequest<{ data?: Brand[] } | Brand[]>("/brands", { token }).catch(() => []),
      apiRequest<{ data?: Unit[] } | Unit[]>("/units", { token }).catch(() => []),
      apiRequest<{ data?: Supplier[] } | Supplier[]>("/suppliers", { token }).catch(() => []),
    ]);
    const unwrap = <T,>(x: T[] | { data?: T[] }) =>
      Array.isArray(x) ? x : (x.data ?? []);
    setProducts(unwrap(pRes));
    setCategories(unwrap(cRes));
    setBrands(unwrap(bRes));
    setUnits(unwrap(uRes));
    setSuppliers(unwrap(sRes));
  }

  useEffect(() => {
    void load().catch((err: { message?: string }) => setError(err.message ?? "Failed to load"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!createImage) {
      setCreatePreview(null);
      return;
    }
    const url = URL.createObjectURL(createImage);
    setCreatePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [createImage]);

  async function uploadImage(productId: string, file: File) {
    const body = new FormData();
    body.append("file", file);
    await apiRequest(`/products/${productId}/image`, { method: "POST", token, body });
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const parsedPack = Math.max(1, Number(packSize) || 1);
      const created = await apiRequest<Product>("/products", {
        method: "POST",
        token,
        body: {
          sku: sku.trim(),
          name: name.trim(),
          barcode: barcode.trim() || undefined,
          categoryId: categoryId || undefined,
          brandId: brandId || undefined,
          unitId: unitId || undefined,
          supplierId: supplierId || undefined,
          size: size.trim() || undefined,
          abv: abv.trim() || undefined,
          packagingType,
          packSize: parsedPack,
          caseQuantity: packagingType === "case" ? parsedPack : undefined,
          bottleProductId: packagingType === "case" && bottleProductId ? bottleProductId : undefined,
          conversionFactor: packagingType === "case" ? parsedPack : undefined,
          priceMinor: parseMoneyToMinor(price),
          wholesalePriceMinor: wholesalePrice ? parseMoneyToMinor(wholesalePrice) : undefined,
          costMinor: cost ? parseMoneyToMinor(cost) : undefined,
          taxRateBps: Math.round((Number(taxRatePct) || 0) * 100),
          minStockQty: Math.max(0, Number(minStockQty) || 0),
          featured,
        },
      });
      if (createImage) {
        await uploadImage(created.id, createImage);
      }
      setSku("");
      setName("");
      setPrice("");
      setWholesalePrice("");
      setCost("");
      setBarcode("");
      setFeatured(false);
      setPackagingType("bottle");
      setPackSize("1");
      setBottleProductId("");
      setCreateImage(null);
      setInfo(createImage ? "Product created with image." : "Product created.");
      await load();
    } catch (err) {
      setError(
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Create failed",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onImage(product: Product, file: File) {
    setError(null);
    try {
      await uploadImage(product.id, file);
      await load();
    } catch (err) {
      setError(
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Image upload failed",
      );
    }
  }

  async function clearImage(product: Product) {
    await apiRequest(`/products/${product.id}/image`, { method: "DELETE", token });
    await load();
  }

  async function toggleFeatured(product: Product) {
    await apiRequest(`/products/${product.id}`, {
      method: "PATCH",
      token,
      body: { featured: !product.featured },
    });
    await load();
  }

  async function validateCsv(text = csvText) {
    setError(null);
    setInfo(null);
    const rows = parseCsv(text);
    if (!rows.length) {
      setError("CSV is empty — download the template or paste rows first.");
      return;
    }
    try {
      const report = await apiRequest<ImportValidation>("/products/import/validate", {
        method: "POST",
        token,
        body: { rows },
      });
      setValidation(report);
      setInfo(
        `Validation complete: ${report.validCount} valid, ${report.invalidCount} invalid, ${report.duplicateCount} duplicate, ${report.warningCount} warning(s).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation failed");
    }
  }

  async function importCsv(text = csvText) {
    setError(null);
    setInfo(null);
    const rows = parseCsv(text);
    if (!rows.length) {
      setError("CSV is empty — download the template first");
      return;
    }
    const result = await apiRequest<
      ImportValidation & {
        accepted: number;
        rejected: number;
      }
    >("/products/import", { method: "POST", token, body: { rows } });
    setValidation(result);
    const sample = result.errors[0]
      ? ` First issue row ${result.errors[0].row}: ${result.errors[0].error}`
      : "";
    setInfo(`Committed ${result.accepted} SKU(s), skipped/rejected ${result.rejected}.${sample}`);
    await load();
  }

  function downloadTemplate() {
    void apiRequest<string>("/products/import-template.csv", { token, raw: true }).then((csv) => {
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "sokoos-wines-spirits-import-template.csv";
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  const bottleCandidates = products.filter((p) => (p.packagingType ?? "bottle") === "bottle");

  const filtered = products.filter((p) => {
    if (catFilter && p.categoryId !== catFilter) return false;
    if (!q) return true;
    const term = q.toLowerCase();
    return (
      p.name.toLowerCase().includes(term) ||
      p.sku.toLowerCase().includes(term) ||
      (p.barcode ?? "").includes(term) ||
      (p.brand?.name ?? "").toLowerCase().includes(term)
    );
  });

  return (
    <AppShell
      title="Products & Packaging"
      description="Wines, spirits, beer & mixer catalogue with bottle/case packaging relationships, wholesale pricing, barcodes, and validated CSV bulk import."
    >
      {error ? <p className="mb-3 text-sm text-[var(--soko-color-danger)]">{error}</p> : null}
      {info ? <p className="mb-3 text-sm text-[var(--soko-color-success)]">{info}</p> : null}

      <form
        onSubmit={(e) => void onCreate(e)}
        className="mb-6 grid gap-3 rounded-[var(--soko-radius-lg)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-4 md:grid-cols-6"
      >
        <div className="md:col-span-6 flex items-center justify-between">
          <p className="text-sm font-semibold">Add Wines & Spirits Product / Packaging SKU</p>
          <span className="text-xs text-[var(--soko-color-text-muted)]">
            Tip: Model cases as separate SKUs linked to their bottle SKU (e.g. 1 Case = 12 Bottles)
          </span>
        </div>

        <label className="md:row-span-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-[var(--soko-color-border)] bg-[var(--soko-color-surface-muted)] p-3 text-center text-xs">
          {createPreview ? (
            <img src={createPreview} alt="" className="h-24 w-24 rounded object-cover" />
          ) : (
            <span className="text-[var(--soko-color-text-muted)]">
              Bottle / Pack Photo
              <br />
              JPEG / PNG / WebP · max 2MB
            </span>
          )}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => setCreateImage(e.target.files?.[0] ?? null)}
          />
          <span className="font-semibold text-[var(--soko-color-primary)]">
            {createImage ? "Change image" : "Upload image"}
          </span>
        </label>

        <Input label="SKU" placeholder="e.g. JW-BLACK-750ML" value={sku} onChange={(e) => setSku(e.target.value)} required />
        <Input label="Product Name" placeholder="e.g. Johnnie Walker Black Label 750ml" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input label="Barcode / EAN" placeholder="5000267023656" value={barcode} onChange={(e) => setBarcode(e.target.value)} />

        <label className="flex flex-col gap-1 text-sm">
          Category
          <select
            className="rounded border border-[var(--soko-color-border)] bg-transparent px-2 py-1.5"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Select category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Brand
          <select
            className="rounded border border-[var(--soko-color-border)] bg-transparent px-2 py-1.5"
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
          >
            <option value="">Select brand</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Packaging Type
          <select
            className="rounded border border-[var(--soko-color-border)] bg-transparent px-2 py-1.5"
            value={packagingType}
            onChange={(e) => {
              const next = e.target.value;
              setPackagingType(next);
              if (next === "case" && packSize === "1") setPackSize("12");
              if (next === "bottle") setPackSize("1");
            }}
          >
            {PACKAGING_TYPES.map((t) => (
              <option key={t} value={t}>{t.toUpperCase()}</option>
            ))}
          </select>
        </label>

        <Input label="Volume / Size" placeholder="750ml, 1L, 330ml" value={size} onChange={(e) => setSize(e.target.value)} />
        <Input label="Pack / Case Qty" placeholder="1 or 12" value={packSize} onChange={(e) => setPackSize(e.target.value)} />
        <Input label="ABV % (optional)" placeholder="40%" value={abv} onChange={(e) => setAbv(e.target.value)} />

        <label className="flex flex-col gap-1 text-sm">
          Unit of Measure
          <select
            className="rounded border border-[var(--soko-color-border)] bg-transparent px-2 py-1.5"
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
          >
            <option value="">Default (btl/case)</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.abbreviation})</option>
            ))}
          </select>
        </label>

        <Input label={`Retail Price (${currency})`} value={price} onChange={(e) => setPrice(e.target.value)} required />
        <Input label={`Wholesale Price (${currency})`} value={wholesalePrice} onChange={(e) => setWholesalePrice(e.target.value)} />
        <Input label={`Cost Price (${currency})`} value={cost} onChange={(e) => setCost(e.target.value)} />
        <Input label="VAT Tax %" value={taxRatePct} onChange={(e) => setTaxRatePct(e.target.value)} />
        <Input label="Reorder Level" value={minStockQty} onChange={(e) => setMinStockQty(e.target.value)} />

        {packagingType === "case" ? (
          <label className="md:col-span-2 flex flex-col gap-1 text-sm">
            Linked Bottle SKU (for 1 Case = {packSize || 12} Bottles conversion)
            <select
              className="rounded border border-[var(--soko-color-border)] bg-transparent px-2 py-1.5"
              value={bottleProductId}
              onChange={(e) => setBottleProductId(e.target.value)}
            >
              <option value="">None / Select single bottle SKU</option>
              {bottleCandidates.map((bp) => (
                <option key={bp.id} value={bp.id}>
                  {bp.sku} — {bp.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="flex flex-col gap-1 text-sm">
          Preferred Supplier
          <select
            className="rounded border border-[var(--soko-color-border)] bg-transparent px-2 py-1.5"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
          >
            <option value="">Optional supplier</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 pt-5 text-sm">
          <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
          Fast-pick Featured in POS
        </label>

        <div className="md:col-span-6">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save Product SKU"}
          </Button>
        </div>
      </form>

      <details className="mb-6 rounded-[var(--soko-radius-md)] border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] p-4">
        <summary className="cursor-pointer font-semibold">
          Bulk Catalogue Import (CSV / Excel-compatible) with Pre-Commit Validation
        </summary>
        <div className="mt-3 space-y-3 text-sm text-[var(--soko-color-text-muted)]">
          <p>
            <strong className="text-[var(--soko-color-text)]">Supported columns:</strong>{" "}
            <code>sku</code>, <code>barcode</code>, <code>name</code>, <code>category</code>, <code>brand</code>,{" "}
            <code>unit</code>, <code>size</code>, <code>packSize</code>, <code>cost</code>, <code>price</code>,{" "}
            <code>wholesalePrice</code>, <code>tax</code>, <code>reorderLevel</code>, <code>supplier</code>,{" "}
            <code>featured</code>.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={downloadTemplate}>
              Download Wines & Spirits CSV Template
            </Button>
            <label className="inline-flex cursor-pointer items-center rounded-md border border-[var(--soko-color-border)] px-3 py-2 text-sm font-semibold text-[var(--soko-color-text)]">
              Choose CSV File
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  void file.text().then((text) => {
                    setCsvText(text);
                    setValidation(null);
                    setInfo(`Loaded ${file.name}. Click "Validate CSV" to inspect rows before committing.`);
                  });
                }}
              />
            </label>
          </div>
        </div>
        <textarea
          className="mt-3 w-full rounded-md border border-[var(--soko-color-border)] bg-transparent p-2 font-mono text-xs"
          rows={5}
          value={csvText}
          onChange={(e) => {
            setCsvText(e.target.value);
            setValidation(null);
          }}
          placeholder="sku,barcode,name,category,brand,unit,size,packSize,cost,price,wholesalePrice,tax,reorderLevel,supplier,featured"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => void validateCsv()}>
            1. Validate CSV (Dry Run)
          </Button>
          <Button type="button" onClick={() => void importCsv()}>
            2. Commit Valid Rows
          </Button>
        </div>

        {validation ? (
          <div className="mt-4 space-y-3 rounded-md border border-[var(--soko-color-border)] bg-[var(--soko-color-surface-muted)] p-3 text-xs">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <div>
                <span className="text-[var(--soko-color-text-muted)]">Total rows:</span>{" "}
                <strong>{validation.totalRows}</strong>
              </div>
              <div className="text-emerald-600">
                <span>Valid rows:</span> <strong>{validation.validCount}</strong>
              </div>
              <div className="text-red-600">
                <span>Invalid rows:</span> <strong>{validation.invalidCount}</strong>
              </div>
              <div className="text-amber-600">
                <span>Duplicate rows:</span> <strong>{validation.duplicateCount}</strong>
              </div>
              <div className="text-amber-600">
                <span>Warnings:</span> <strong>{validation.warningCount}</strong>
              </div>
            </div>
            {validation.invalidRows.length > 0 ? (
              <div>
                <p className="font-semibold text-red-600">Invalid Rows (will not be imported):</p>
                <ul className="mt-1 list-disc pl-5">
                  {validation.invalidRows.map((r, idx) => (
                    <li key={idx}>
                      Row {r.row} ({r.sku ?? "missing SKU"}): {r.error}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {validation.duplicateRows.length > 0 ? (
              <div>
                <p className="font-semibold text-amber-600">Duplicate Rows (skipped):</p>
                <ul className="mt-1 list-disc pl-5">
                  {validation.duplicateRows.map((r, idx) => (
                    <li key={idx}>
                      Row {r.row} ({r.sku ?? r.barcode}): {r.error}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {validation.warnings.length > 0 ? (
              <div>
                <p className="font-semibold text-amber-600">Warnings:</p>
                <ul className="mt-1 list-disc pl-5">
                  {validation.warnings.map((w, idx) => (
                    <li key={idx}>
                      Row {w.row} ({w.sku}): {w.warning}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </details>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Input label="Search SKU, name, brand, or barcode" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="text-sm">
          Category Filter
          <select
            className="mt-1 block rounded-md border border-[var(--soko-color-border)] bg-transparent px-3 py-2"
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <Button
          variant="secondary"
          type="button"
          onClick={() => {
            void apiRequest<string>("/products/export.csv", { token, raw: true }).then((csv) => {
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "sokoos-wines-spirits-catalogue.csv";
              a.click();
              URL.revokeObjectURL(url);
            });
          }}
        >
          Export Catalogue CSV
        </Button>
      </div>

      {!filtered.length ? (
        <EmptyState title="No products found" body="Add a Wines & Spirits SKU above or import via CSV." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--soko-color-text-muted)]">
                <th className="py-2">Image</th>
                <th>SKU / Barcode</th>
                <th>Product & Brand</th>
                <th>Category</th>
                <th>Packaging</th>
                <th className="text-right">Cost</th>
                <th className="text-right">Retail</th>
                <th className="text-right">Wholesale</th>
                <th>Reorder</th>
                <th>Featured</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-[var(--soko-color-border)]">
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <label className="block cursor-pointer" title="Click to upload / replace image">
                        <ProductImage src={mediaUrl(p.thumbnailUrl ?? p.imageUrl)} alt={p.name} className="h-12 w-12" />
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void onImage(p, file);
                          }}
                        />
                      </label>
                      {p.imageUrl ? (
                        <button
                          type="button"
                          className="text-xs text-[var(--soko-color-danger)]"
                          onClick={() => void clearImage(p)}
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    <div className="font-mono text-xs font-semibold">{p.sku}</div>
                    <div className="font-mono text-xs text-[var(--soko-color-text-muted)]">{p.barcode ?? "No barcode"}</div>
                  </td>
                  <td>
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-xs text-[var(--soko-color-text-muted)]">
                      {[p.brand?.name, p.size, p.abv].filter(Boolean).join(" · ") || "Standard"}
                    </div>
                  </td>
                  <td>{p.category?.name ?? "—"}</td>
                  <td>
                    <span className="rounded bg-[var(--soko-color-surface-muted)] px-2 py-0.5 text-xs font-semibold uppercase">
                      {p.packagingType ?? "bottle"}
                      {p.packSize && p.packSize > 1 ? ` × ${p.packSize}` : ""}
                    </span>
                  </td>
                  <td className="text-right tabular-nums">
                    {p.costMinor != null ? formatMoney(p.costMinor, currency) : "—"}
                  </td>
                  <td className="text-right font-semibold tabular-nums">
                    {formatMoney(p.priceMinor, currency)}
                  </td>
                  <td className="text-right tabular-nums text-[var(--soko-color-text-muted)]">
                    {p.wholesalePriceMinor != null ? formatMoney(p.wholesalePriceMinor, currency) : "—"}
                  </td>
                  <td>{p.minStockQty}</td>
                  <td>
                    <button
                      type="button"
                      className="text-xs font-semibold text-[var(--soko-color-primary)]"
                      onClick={() => void toggleFeatured(p)}
                    >
                      {p.featured ? "Featured" : "Standard"}
                    </button>
                  </td>
                  <td className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (!window.confirm(`Archive ${p.name}?`)) return;
                        void apiRequest(`/products/${p.id}/archive`, { method: "POST", token }).then(load);
                      }}
                    >
                      Archive
                    </Button>
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
