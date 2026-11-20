import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Pencil, RefreshCw, Trash2 } from "lucide-react";
import { Button, Input } from "@sokoos/ui";
import { AppShell, EmptyState, ProductImage } from "../components/AppShell";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useToast } from "../components/ToastProvider";
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
  taxRateBps?: number | null;
  taxReviewRequired?: boolean;
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
    taxReviewRequired: boolean;
  }>;
  invalidRows: Array<{ row: number; sku?: string; error: string }>;
  duplicateRows: Array<{ row: number; sku?: string; barcode?: string; error: string }>;
  warnings: Array<{ row: number; sku: string; warning: string }>;
  errors: Array<{ row: number; sku?: string; error: string }>;
};

type CatalogImportPreview = {
  totalRows: number;
  summary: { matched: number; new: number; duplicate: number; conflict: number; missing: number };
  items: Array<{
    row: number;
    sku: string;
    barcode: string | null;
    name: string;
    category: string | null;
    categoryMapped: boolean;
    brand: string | null;
    brandMapped: boolean;
    unit: string | null;
    unitMapped: boolean;
    size: string | null;
    abv: string | null;
    packagingType: string | null;
    packagingReviewRequired: boolean;
    packSize: number;
    caseBottleSku: string | null;
    actualSupplierCostMinor: number | null;
    suggestedSellMinor: number | null;
    repoKnownCostMinor: number | null;
    repoKnownSellMinor: number | null;
    repoKnownWholesaleMinor: number | null;
    imageFilename: string | null;
    imageSource: string | null;
    imageLicense: string | null;
    imageRightsReviewRequired: boolean;
    imageReviewRequired: boolean;
    taxProfile: string | null;
    taxReviewRequired: boolean;
    taxWarning: string;
    supplier: { name: string; mapped: boolean; id: string | null } | null;
    reconciliation: "MATCHED" | "NEW" | "DUPLICATE" | "CONFLICT" | "MISSING";
    existing: {
      sku: string;
      name: string;
      barcode: string | null;
      priceMinor: number;
      costMinor: number | null;
      imageUrl: string | null;
      archived: boolean;
    } | null;
    conflict: string | null;
    blockers: string[];
    action: "CREATE" | "UPDATE" | "SKIP" | "REVIEW";
  }>;
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
  const canChangePrice = useAuthStore((s) => s.has("products.change_price"));
  const canCreateProducts = useAuthStore((s) => s.has("products.write") || s.has("products.create"));
  const canEditProducts = useAuthStore((s) => s.has("products.write") || s.has("products.edit"));
  const canWriteProducts = useAuthStore((s) => s.has("products.write"));
  const notify = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
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
  const [taxRatePct, setTaxRatePct] = useState("");
  const [minStockQty, setMinStockQty] = useState("6");
  const [featured, setFeatured] = useState(false);
  const [createImage, setCreateImage] = useState<File | null>(null);
  const [createPreview, setCreatePreview] = useState<string | null>(null);
  const [createImageUrl, setCreateImageUrl] = useState("");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editFields, setEditFields] = useState({
    name: "",
    barcode: "",
    categoryId: "",
    brandId: "",
    unitId: "",
    supplierId: "",
    size: "",
    abv: "",
    packagingType: "bottle",
    packSize: "1",
    bottleProductId: "",
    price: "",
    wholesalePrice: "",
    cost: "",
    taxRatePct: "",
    minStockQty: "0",
    imageUrl: "",
  });
  const [editError, setEditError] = useState<string | null>(null);

  // Import state
  const [csvText, setCsvText] = useState("");
  const [validation, setValidation] = useState<ImportValidation | null>(null);
  const [catalogPreview, setCatalogPreview] = useState<CatalogImportPreview | null>(null);
  const [previewActions, setPreviewActions] = useState<Record<number, string>>({});
  const [showImportConfirmation, setShowImportConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [productToArchive, setProductToArchive] = useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  const load = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const [pRes, cRes, bRes, uRes, sRes] = await Promise.all([
        apiRequest<{ data?: Product[] } | Product[]>(
          `/products?limit=300${showArchived ? "&includeArchived=true" : ""}`,
          { token },
        ),
        apiRequest<{ data?: Category[] } | Category[]>("/categories", { token }),
        apiRequest<{ data?: Brand[] } | Brand[]>("/brands", { token }),
        apiRequest<{ data?: Unit[] } | Unit[]>("/units", { token }),
        apiRequest<{ data?: Supplier[] } | Supplier[]>("/suppliers", { token }),
      ]);
      const unwrap = <T,>(x: T[] | { data?: T[] }) => (Array.isArray(x) ? x : (x.data ?? []));
      setProducts(unwrap(pRes));
      setCategories(unwrap(cRes));
      setBrands(unwrap(bRes));
      setUnits(unwrap(uRes));
      setSuppliers(unwrap(sRes));
      setError(null);
      setLastRefreshed(new Date());
    } finally {
      setLoadingProducts(false);
    }
  }, [showArchived, token]);

  async function archiveProduct() {
    if (!productToArchive) return;
    setBusy(true);
    try {
      await apiRequest(`/products/${productToArchive.id}/archive`, { method: "POST", token });
      await load();
      notify(`${productToArchive.name} has been archived. Historical sales are retained.`);
      setProductToArchive(null);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Unable to archive product", "error");
    } finally {
      setBusy(false);
    }
  }

  async function reactivateProduct(product: Product) {
    setBusy(true);
    try {
      await apiRequest(`/products/${product.id}/reactivate`, { method: "POST", token });
      await load();
      notify(`${product.name} has been reactivated.`);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Unable to reactivate product", "error");
    } finally {
      setBusy(false);
    }
  }

  async function deleteProduct() {
    if (!productToDelete) return;
    setBusy(true);
    try {
      await apiRequest(`/products/${productToDelete.id}`, { method: "DELETE", token });
      notify(`${productToDelete.name} was permanently deleted.`);
      setProductToDelete(null);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to delete product";
      notify(message, "error");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load().catch((err: { message?: string }) => setError(err.message ?? "Failed to load"));
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void load().catch((err: { message?: string }) => setError(err.message ?? "Failed to refresh products"));
      }
    }, 30_000);
    const refreshOnFocus = () => {
      if (document.visibilityState === "visible") {
        void load().catch((err: { message?: string }) => setError(err.message ?? "Failed to refresh products"));
      }
    };
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [load]);

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
          imageUrl: createImageUrl.trim() || undefined,
          thumbnailUrl: createImageUrl.trim() || undefined,
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
          ...(taxRatePct.trim()
            ? { taxRateBps: Math.round(Number(taxRatePct) * 100) }
            : {}),
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
      setTaxRatePct("");
      setBarcode("");
      setFeatured(false);
      setPackagingType("bottle");
      setPackSize("1");
      setBottleProductId("");
      setCreateImage(null);
      setCreateImageUrl("");
      setInfo(createImage ? "Product created with image." : "Product created.");
      await load();
      notify("Product created and added to the catalogue.");
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
      notify(`${product.name} image updated.`);
    } catch (err) {
      setError(
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Image upload failed",
      );
    }
  }

  async function clearImage(product: Product) {
    try {
      await apiRequest(`/products/${product.id}/image`, { method: "DELETE", token });
      await load();
      notify(`${product.name} image removed.`);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Image removal failed", "error");
    }
  }

  async function toggleFeatured(product: Product) {
    try {
      await apiRequest(`/products/${product.id}`, {
        method: "PATCH",
        token,
        body: { featured: !product.featured },
      });
      await load();
      notify(`${product.name} ${product.featured ? "removed from" : "added to"} POS featured items.`);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Unable to update product", "error");
    }
  }

  function startEditing(product: Product) {
    setEditingProduct(product);
    setEditError(null);
    setEditFields({
      name: product.name,
      barcode: product.barcode ?? "",
      categoryId: product.categoryId ?? "",
      brandId: product.brandId ?? "",
      unitId: product.unitId ?? "",
      supplierId: product.supplierId ?? "",
      size: product.size ?? "",
      abv: product.abv ?? "",
      packagingType: product.packagingType ?? "bottle",
      packSize: String(product.packSize ?? 1),
      bottleProductId: product.bottleProductId ?? "",
      price: (product.priceMinor / 100).toFixed(2),
      wholesalePrice: product.wholesalePriceMinor == null ? "" : (product.wholesalePriceMinor / 100).toFixed(2),
      cost: product.costMinor == null ? "" : (product.costMinor / 100).toFixed(2),
      taxRatePct: product.taxReviewRequired || product.taxRateBps == null
        ? ""
        : String(product.taxRateBps / 100),
      minStockQty: String(product.minStockQty),
      imageUrl: product.imageUrl ?? "",
    });
  }

  async function saveProductEdits() {
    if (!editingProduct) return;
    setBusy(true);
    setEditError(null);
    try {
      const imageUrl = editFields.imageUrl.trim();
      if (imageUrl && !imageUrl.startsWith("/v1/media/") && new URL(imageUrl).protocol !== "https:") {
        throw new Error("Image links must use HTTPS.");
      }
      const taxRatePct = editFields.taxRatePct.trim();
      const taxRate = taxRatePct ? Number(taxRatePct) : null;
      if (taxRate !== null && (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100)) {
        throw new Error("Enter the approved tax rate from 0% to 100%, or leave it blank for review.");
      }
      await apiRequest(`/products/${editingProduct.id}`, {
        method: "PATCH",
        token,
        body: {
          name: editFields.name.trim(),
          barcode: editFields.barcode.trim() || null,
          categoryId: editFields.categoryId || null,
          brandId: editFields.brandId || null,
          unitId: editFields.unitId || null,
          supplierId: editFields.supplierId || null,
          size: editFields.size.trim() || null,
          abv: editFields.abv.trim() || null,
          packagingType: editFields.packagingType,
          packSize: Math.max(1, Number(editFields.packSize) || 1),
          caseQuantity: editFields.packagingType === "case" ? Math.max(1, Number(editFields.packSize) || 1) : null,
          bottleProductId: editFields.packagingType === "case" ? editFields.bottleProductId || null : null,
          conversionFactor: editFields.packagingType === "case" ? Math.max(1, Number(editFields.packSize) || 1) : null,
          ...(canChangePrice
            ? {
                priceMinor: parseMoneyToMinor(editFields.price),
                wholesalePriceMinor: editFields.wholesalePrice ? parseMoneyToMinor(editFields.wholesalePrice) : null,
                costMinor: editFields.cost ? parseMoneyToMinor(editFields.cost) : null,
              }
            : {}),
          ...(taxRate !== null ? { taxRateBps: Math.round(taxRate * 100) } : {}),
          minStockQty: Math.max(0, Number(editFields.minStockQty) || 0),
          imageUrl: imageUrl || null,
          thumbnailUrl: imageUrl || null,
        },
      });
      setEditingProduct(null);
      notify(`${editingProduct.name} updated.`);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update product";
      setEditError(message);
      notify(message, "error");
    } finally {
      setBusy(false);
    }
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
      const packColumns = Object.keys(rows[0] ?? {});
      if (packColumns.includes("suggested_sell_kes") || packColumns.includes("image_filename")) {
        const preview = await apiRequest<CatalogImportPreview>("/products/import/preview", {
          method: "POST",
          token,
          body: { rows },
        });
        setCatalogPreview(preview);
        setPreviewActions(Object.fromEntries(preview.items.map((item) => [item.row, item.action])));
        setValidation(null);
        setInfo("Read-only catalogue preview complete. No products or prices were changed.");
        return;
      }
      const report = await apiRequest<ImportValidation>("/products/import/validate", {
        method: "POST",
        token,
        body: { rows },
      });
      setValidation(report);
      setCatalogPreview(null);
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
    if (
      !validation ||
      validation.totalRows !== rows.length ||
      validation.validCount !== validation.totalRows ||
      validation.errors.length > 0
    ) {
      setError("Validate the current CSV and resolve every error and duplicate before importing.");
      return;
    }
    setBusy(true);
    try {
      const result = await apiRequest<
        ImportValidation & {
          accepted: number;
          rejected: number;
          dryRun?: boolean;
        }
      >("/products/import", {
        method: "POST",
        token,
        body: { rows, dryRun: false, approved: true },
      });
      setValidation(result);
      setShowImportConfirmation(false);
      if (result.dryRun) {
        setInfo("No products were imported. Explicit approval is required to commit.");
        return;
      }
      setCatalogPreview(null);
      const taxReviewCount = result.validRows.filter((row) => row.taxReviewRequired).length;
      setInfo(
        `Imported ${result.accepted} SKU(s); ${result.rejected} row(s) were rejected; ${taxReviewCount} product(s) need tax review.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
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
      {productToArchive ? (
        <ConfirmDialog
          title="Archive product?"
          description={`${productToArchive.name} will no longer be available for new sales. Historical sales and inventory movements remain unchanged.`}
          confirmLabel="Archive product"
          danger
          pending={busy}
          onCancel={() => setProductToArchive(null)}
          onConfirm={() => void archiveProduct()}
        />
      ) : null}
      {productToDelete ? (
        <ConfirmDialog
          title="Permanently delete unused product?"
          description={`${productToDelete.name} can only be deleted if it has no stock, sales, returns, purchase, or other linked history. If it has history, the system will block deletion and you can archive it instead.`}
          confirmLabel="Delete product"
          danger
          pending={busy}
          onCancel={() => setProductToDelete(null)}
          onConfirm={() => void deleteProduct()}
        />
      ) : null}
      {editingProduct ? (
        <ConfirmDialog
          title={`Edit ${editingProduct.sku}`}
          description="Changes are saved to the live product catalogue. Price and cost changes require the products.change_price permission."
          confirmLabel="Save changes"
          pending={busy}
          onCancel={() => setEditingProduct(null)}
          onConfirm={() => void saveProductEdits()}
        >
          <div className="mt-4 grid max-h-[60vh] gap-3 overflow-y-auto sm:grid-cols-2">
            <Input label="Product name" value={editFields.name} onChange={(e) => setEditFields({ ...editFields, name: e.target.value })} required />
            <Input label="Barcode" value={editFields.barcode} onChange={(e) => setEditFields({ ...editFields, barcode: e.target.value })} />
            <label className="flex flex-col gap-1 text-sm">
              Category
              <select className="rounded border border-[var(--soko-color-border)] bg-transparent px-2 py-2" value={editFields.categoryId} onChange={(e) => setEditFields({ ...editFields, categoryId: e.target.value })}>
                <option value="">No category</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Brand
              <select className="rounded border border-[var(--soko-color-border)] bg-transparent px-2 py-2" value={editFields.brandId} onChange={(e) => setEditFields({ ...editFields, brandId: e.target.value })}>
                <option value="">No brand</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Unit
              <select className="rounded border border-[var(--soko-color-border)] bg-transparent px-2 py-2" value={editFields.unitId} onChange={(e) => setEditFields({ ...editFields, unitId: e.target.value })}>
                <option value="">No unit</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Preferred supplier
              <select className="rounded border border-[var(--soko-color-border)] bg-transparent px-2 py-2" value={editFields.supplierId} onChange={(e) => setEditFields({ ...editFields, supplierId: e.target.value })}>
                <option value="">None</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <Input label="Volume / size" value={editFields.size} onChange={(e) => setEditFields({ ...editFields, size: e.target.value })} />
            <Input label="ABV %" value={editFields.abv} onChange={(e) => setEditFields({ ...editFields, abv: e.target.value })} />
            <label className="flex flex-col gap-1 text-sm">
              Packaging
              <select className="rounded border border-[var(--soko-color-border)] bg-transparent px-2 py-2" value={editFields.packagingType} onChange={(e) => setEditFields({ ...editFields, packagingType: e.target.value })}>
                {PACKAGING_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <Input label="Pack / case quantity" type="number" min="1" value={editFields.packSize} onChange={(e) => setEditFields({ ...editFields, packSize: e.target.value })} />
            {editFields.packagingType === "case" ? (
              <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                Linked bottle product
                <select className="rounded border border-[var(--soko-color-border)] bg-transparent px-2 py-2" value={editFields.bottleProductId} onChange={(e) => setEditFields({ ...editFields, bottleProductId: e.target.value })}>
                  <option value="">No linked bottle</option>{bottleCandidates.filter((candidate) => candidate.id !== editingProduct.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.sku} — {candidate.name}</option>)}
                </select>
              </label>
            ) : null}
            <Input label={`Retail price (${currency})`} value={editFields.price} onChange={(e) => setEditFields({ ...editFields, price: e.target.value })} disabled={!canChangePrice} />
            <Input label={`Wholesale price (${currency})`} value={editFields.wholesalePrice} onChange={(e) => setEditFields({ ...editFields, wholesalePrice: e.target.value })} disabled={!canChangePrice} />
            <Input label={`Cost (${currency})`} value={editFields.cost} onChange={(e) => setEditFields({ ...editFields, cost: e.target.value })} disabled={!canChangePrice} />
            <Input label="Approved tax rate %" type="number" min="0" max="100" step="0.01" value={editFields.taxRatePct} onChange={(e) => setEditFields({ ...editFields, taxRatePct: e.target.value })} placeholder="Use configured rate" />
            {editingProduct.taxReviewRequired ? (
              <p className="text-sm text-amber-700 sm:col-span-2">
                Tax mapping required before tax-compliant sale. Enter the administrator-approved rate from your tax configuration; leave blank to keep this product blocked from sale.
              </p>
            ) : null}
            <Input label="Reorder level" type="number" min="0" value={editFields.minStockQty} onChange={(e) => setEditFields({ ...editFields, minStockQty: e.target.value })} />
            <Input label="Image link (HTTPS)" className="sm:col-span-2" value={editFields.imageUrl} onChange={(e) => setEditFields({ ...editFields, imageUrl: e.target.value })} placeholder="https://example.com/product.jpg" />
            {editError ? <p role="alert" className="text-sm text-[var(--soko-color-danger)] sm:col-span-2">{editError}</p> : null}
          </div>
        </ConfirmDialog>
      ) : null}
      {showImportConfirmation && validation ? (
        <ConfirmDialog
          title="Import reviewed products?"
          description="This will create new products using the validated CSV values. Existing products and their prices will not be updated. Supplied tax values must be approved; products without a tax value will be imported in tax review and blocked from sale until mapped."
          confirmLabel="Import products"
          pending={busy}
          onCancel={() => setShowImportConfirmation(false)}
          onConfirm={() => void importCsv()}
        />
      ) : null}
      {error ? <p role="alert" className="mb-3 text-sm text-[var(--soko-color-danger)]">{error}</p> : null}
      {info ? <p className="mb-3 text-sm text-[var(--soko-color-success)]">{info}</p> : null}

      {canCreateProducts ? <form
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
        <div className="md:row-span-2">
          <Input
            label="Or use an HTTPS image link"
            value={createImageUrl}
            onChange={(e) => {
              setCreateImageUrl(e.target.value);
              if (e.target.value) setCreateImage(null);
            }}
            placeholder="https://example.com/bottle.jpg"
            type="url"
          />
          <p className="mt-1 text-xs text-[var(--soko-color-text-muted)]">
            External links are displayed as provided; they can stop working if the host removes the image.
          </p>
        </div>

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

        <Input
          label={`Retail Price (${currency})`}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
          disabled={!canChangePrice}
        />
        <Input
          label={`Wholesale Price (${currency})`}
          value={wholesalePrice}
          onChange={(e) => setWholesalePrice(e.target.value)}
          disabled={!canChangePrice}
        />
        <Input
          label={`Cost Price (${currency})`}
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          disabled={!canChangePrice}
        />
        {!canChangePrice ? (
          <p className="md:col-span-6 text-xs text-[var(--soko-color-text-muted)]">
            Price fields require the products.change_price permission.
          </p>
        ) : null}
        <Input label="Approved VAT Tax %" type="number" min="0" max="100" step="0.01" value={taxRatePct} onChange={(e) => setTaxRatePct(e.target.value)} />
        <p className="text-xs text-[var(--soko-color-text-muted)]">
          Leave blank to create this product in tax review. No tax rate is assumed.
        </p>
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
      </form> : null}

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
                    setCatalogPreview(null);
                    setPreviewActions({});
                    setInfo(`Loaded ${file.name}. Checking rows against the live catalogue…`);
                    void validateCsv(text);
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
            setCatalogPreview(null);
            setPreviewActions({});
          }}
          placeholder="sku,barcode,name,category,brand,unit,size,packSize,cost,price,wholesalePrice,tax,reorderLevel,supplier,featured"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => void validateCsv()} disabled={busy}>
            1. Validate CSV (Dry Run)
          </Button>
          <Button
            type="button"
            onClick={() => setShowImportConfirmation(true)}
            disabled={
              busy ||
              !validation ||
              validation.validCount !== validation.totalRows ||
              validation.errors.length > 0
            }
          >
            {validation && validation.validCount > 0
              ? `2. Import ${validation.validCount} product${validation.validCount === 1 ? "" : "s"}`
              : "2. Import validated products"}
          </Button>
        </div>

        {catalogPreview ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <p className="font-semibold">Catalogue pack preview — read only</p>
              <p className="mt-1">
                No records or prices have been changed. Missing tax mappings are review warnings and do not block catalogue import; resolve them before a tax-compliant sale.
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span>MATCHED: {catalogPreview.summary.matched}</span>
                <span>NEW: {catalogPreview.summary.new}</span>
                <span>DUPLICATE: {catalogPreview.summary.duplicate}</span>
                <span>CONFLICT: {catalogPreview.summary.conflict}</span>
                <span>MISSING: {catalogPreview.summary.missing}</span>
                <span>Missing cost: {catalogPreview.items.filter((item) => item.actualSupplierCostMinor == null).length}</span>
                <span>Tax review: {catalogPreview.items.filter((item) => item.taxReviewRequired).length}</span>
                <span>Image review: {catalogPreview.items.filter((item) => item.imageReviewRequired || item.imageRightsReviewRequired).length}</span>
                <span>Supplier mapping: {catalogPreview.items.filter((item) => item.supplier && !item.supplier.mapped).length}</span>
              </div>
            </div>
            <div className="overflow-x-auto rounded-md border border-[var(--soko-color-border)]">
              <table className="w-full min-w-[1200px] text-xs">
                <thead className="bg-[var(--soko-color-surface-muted)] text-left">
                  <tr>
                    <th className="p-2">PRODUCT</th>
                    <th className="p-2">SKU</th>
                    <th className="p-2">BARCODE</th>
                    <th className="p-2">CATEGORY</th>
                    <th className="p-2">SIZE</th>
                    <th className="p-2">COST</th>
                    <th className="p-2">SELLING PRICE</th>
                    <th className="p-2">WHOLESALE</th>
                    <th className="p-2">IMAGE</th>
                    <th className="p-2">EXISTING / NEW</th>
                    <th className="p-2">CONFLICT</th>
                    <th className="p-2">ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {catalogPreview.items.map((item) => (
                    <tr key={`${item.row}-${item.sku}`} className="border-t border-[var(--soko-color-border)] align-top">
                      <td className="p-2">{item.name || "Missing name"}</td>
                      <td className="p-2 font-mono">{item.sku || "Missing SKU"}</td>
                      <td className="p-2 font-mono">{item.barcode ?? "—"}</td>
                      <td className="p-2">
                        {item.category ?? "—"}
                        {item.category && !item.categoryMapped ? <span className="block text-amber-700">Category mapping required</span> : null}
                        {item.brand ? <span className="block">{item.brand}{!item.brandMapped ? " · mapping required" : ""}</span> : null}
                        {item.unit ? <span className="block">{item.unit}{!item.unitMapped ? " · mapping required" : ""}</span> : null}
                      </td>
                      <td className="p-2">
                        {item.size ?? "—"}
                        {item.packagingType === "case" ? ` · case of ${item.packSize}` : item.packagingType ? ` · ${item.packagingType}` : " · packaging review"}
                        {item.packagingType === "case" && item.caseBottleSku ? (
                          <span className="block">Bottle link: {item.caseBottleSku}</span>
                        ) : null}
                      </td>
                      <td className="p-2">
                        {item.actualSupplierCostMinor == null
                          ? "Missing verified cost"
                          : formatMoney(item.actualSupplierCostMinor, currency)}
                        {item.repoKnownCostMinor != null ? (
                          <span className="block text-[var(--soko-color-text-muted)]">
                            Repo reference: {formatMoney(item.repoKnownCostMinor, currency)}
                          </span>
                        ) : null}
                      </td>
                      <td className="p-2">
                        {item.suggestedSellMinor == null
                          ? "No suggestion"
                          : `Suggested: ${formatMoney(item.suggestedSellMinor, currency)}`}
                        <span className="block text-[var(--soko-color-text-muted)]">Approval required</span>
                      </td>
                      <td className="p-2">
                        {item.repoKnownWholesaleMinor == null
                          ? "Not provided"
                          : `Repo reference: ${formatMoney(item.repoKnownWholesaleMinor, currency)}`}
                      </td>
                      <td className="p-2">
                        {item.imageFilename ?? "Placeholder"}
                        {item.imageReviewRequired || item.imageRightsReviewRequired ? (
                          <span className="block text-amber-700">IMAGE_REVIEW_REQUIRED</span>
                        ) : (
                          <span className="block text-[var(--soko-color-text-muted)]">Upload to tenant media after approval</span>
                        )}
                      </td>
                      <td className="p-2">
                        {item.reconciliation}
                        {item.existing ? <span className="block">{item.existing.sku}</span> : null}
                      </td>
                      <td className={`p-2 ${item.conflict ? "text-[var(--soko-color-danger)]" : "text-amber-700"}`}>
                        {item.conflict ?? (item.taxReviewRequired ? item.taxWarning : "—")}
                        {item.supplier && !item.supplier.mapped ? (
                          <span className="block">SUPPLIER_MAPPING_REQUIRED</span>
                        ) : null}
                        {item.category && !item.categoryMapped ? <span className="block">CATEGORY_MAPPING_REQUIRED</span> : null}
                        {item.brand && !item.brandMapped ? <span className="block">BRAND_MAPPING_REQUIRED</span> : null}
                        {!item.unitMapped ? <span className="block">UNIT_MAPPING_REQUIRED</span> : null}
                        {item.packagingReviewRequired ? <span className="block">PACKAGING_TYPE_REVIEW_REQUIRED</span> : null}
                        {item.packagingType === "case" && !item.caseBottleSku ? (
                          <span className="block">CASE_BOTTLE_LINK_REQUIRED</span>
                        ) : null}
                      </td>
                      <td className="p-2">
                        <select
                          aria-label={`Action for ${item.sku}`}
                          className="rounded border border-[var(--soko-color-border)] bg-[var(--soko-color-surface)] px-2 py-1"
                          value={previewActions[item.row] ?? item.action}
                          onChange={(event) =>
                            setPreviewActions((current) => ({ ...current, [item.row]: event.target.value }))
                          }
                        >
                          {(["CREATE", "UPDATE", "SKIP", "REVIEW"] as const).map((action) => (
                            <option key={action} value={action}>{action}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {validation ? (
          <div className="mt-4 space-y-3 rounded-md border border-[var(--soko-color-border)] bg-[var(--soko-color-surface-muted)] p-3 text-xs">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
              <div>
                <span className="text-[var(--soko-color-text-muted)]">Total rows:</span>{" "}
                <strong>{validation.totalRows}</strong>
              </div>
              <div className="text-emerald-600">
                <span>Valid rows:</span> <strong>{validation.validCount}</strong>
              </div>
              <div className="text-amber-700">
                <span>Products needing tax review:</span>{" "}
                <strong>{validation.validRows.filter((row) => row.taxReviewRequired).length}</strong>
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
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" disabled={loadingProducts} onClick={() => void load().catch((err) => setError(err instanceof Error ? err.message : "Refresh failed"))}>
            <RefreshCw size={15} className={loadingProducts ? "animate-spin" : ""} />
            <span className="ml-1">{loadingProducts ? "Refreshing…" : "Refresh"}</span>
          </Button>
          {lastRefreshed ? <span className="text-xs text-[var(--soko-color-text-muted)]">Updated {lastRefreshed.toLocaleTimeString()}</span> : null}
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Include archived
        </label>
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
        <EmptyState
          title={showArchived ? "No products found" : "No active products"}
          body={showArchived
            ? "Archived products will appear here when available."
            : "Add a Wines & Spirits SKU above or import via CSV."}
        />
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
                    {p.taxReviewRequired ? (
                      <div className="text-xs font-semibold text-amber-700">
                        Tax mapping required before tax-compliant sale.
                      </div>
                    ) : null}
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
                    <div className="flex items-center justify-end gap-1">
                      {canEditProducts ? (
                        <Button variant="secondary" size="sm" disabled={busy} onClick={() => startEditing(p)} aria-label={`Edit ${p.name}`}>
                          <Pencil size={14} /><span className="ml-1">Edit</span>
                        </Button>
                      ) : null}
                      {canWriteProducts && p.status === "archived" ? (
                        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void reactivateProduct(p)}>
                          Reactivate
                        </Button>
                      ) : canWriteProducts ? (
                        <>
                          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setProductToArchive(p)}>
                            Archive
                          </Button>
                          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setProductToDelete(p)} aria-label={`Delete ${p.name}`}>
                            <Trash2 size={15} />
                          </Button>
                        </>
                      ) : null}
                    </div>
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
