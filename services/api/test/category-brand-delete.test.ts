import { describe, it, expect, vi, beforeEach } from "vitest";
import { CatalogService } from "../src/catalog/catalog.service";
import { SYSTEM_UNCATEGORIZED_CATEGORY } from "../src/seed/taxonomy";

describe("Category & Brand Deletion Safety and Price History", () => {
  let catalogService: CatalogService;
  let mockPrisma: any;
  let mockMedia: any;

  beforeEach(() => {
    mockPrisma = {
      category: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      brand: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      product: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        count: vi.fn(),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-1" }),
      },
    };
    mockMedia = {
      removeFile: vi.fn(),
      saveProductImage: vi.fn(),
    };
    catalogService = new CatalogService(mockPrisma as any, mockMedia as any);
  });

  describe("Category Deletion Safety", () => {
    it("reports affected product count before deletion", async () => {
      mockPrisma.category.findFirst.mockResolvedValue({
        id: "cat-1",
        name: "Liqueurs",
        tenantId: "t-1",
      });
      mockPrisma.product.count.mockResolvedValue(15);

      const impact = await catalogService.getCategoryImpact("t-1", "cat-1");
      expect(impact.productCount).toBe(15);
      expect(impact.name).toBe("Liqueurs");
    });

    it("prevents deletion of the system Uncategorized category", async () => {
      mockPrisma.category.findFirst.mockResolvedValue({
        id: "cat-uncat",
        name: SYSTEM_UNCATEGORIZED_CATEGORY,
        tenantId: "t-1",
      });

      await expect(
        catalogService.deleteCategory("t-1", "cat-uncat", "user-1"),
      ).rejects.toThrow(/Uncategorized category cannot be deleted/);
    });

    it("remaps affected products to Uncategorized category and removes category safely", async () => {
      mockPrisma.category.findFirst
        .mockResolvedValueOnce({
          id: "cat-wine",
          name: "Wine",
          tenantId: "t-1",
        })
        .mockResolvedValueOnce({
          id: "cat-uncat",
          name: SYSTEM_UNCATEGORIZED_CATEGORY,
          tenantId: "t-1",
        });

      mockPrisma.product.count.mockResolvedValue(24);
      mockPrisma.product.updateMany.mockResolvedValue({ count: 24 });
      mockPrisma.category.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.category.delete.mockResolvedValue({ id: "cat-wine" });

      const result = await catalogService.deleteCategory("t-1", "cat-wine", "user-1");

      expect(result.ok).toBe(true);
      expect(result.affectedProductCount).toBe(24);
      expect(result.remappedCategoryId).toBe("cat-uncat");

      // Verify products were updated to uncategorized, NOT deleted
      expect(mockPrisma.product.updateMany).toHaveBeenCalledWith({
        where: { tenantId: "t-1", categoryId: "cat-wine" },
        data: { categoryId: "cat-uncat", updatedBy: "user-1" },
      });
      // Verify subcategories were unlinked from parent
      expect(mockPrisma.category.updateMany).toHaveBeenCalledWith({
        where: { tenantId: "t-1", parentId: "cat-wine" },
        data: { parentId: null, updatedBy: "user-1" },
      });
      // Verify category was deleted
      expect(mockPrisma.category.delete).toHaveBeenCalledWith({
        where: { id: "cat-wine" },
      });
      // Verify audit log was recorded
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe("Brand Deletion Safety", () => {
    it("reports brand impact and safely unlinks products without deleting them", async () => {
      mockPrisma.brand.findFirst.mockResolvedValue({
        id: "brand-1",
        name: "Old Brand",
        tenantId: "t-1",
      });
      mockPrisma.product.count.mockResolvedValue(8);
      mockPrisma.product.updateMany.mockResolvedValue({ count: 8 });
      mockPrisma.brand.delete.mockResolvedValue({ id: "brand-1" });

      const impact = await catalogService.getBrandImpact("t-1", "brand-1");
      expect(impact.productCount).toBe(8);

      const result = await catalogService.deleteBrand("t-1", "brand-1", "user-1");
      expect(result.ok).toBe(true);
      expect(result.affectedProductCount).toBe(8);

      // Verify products had brandId set to null, NOT deleted
      expect(mockPrisma.product.updateMany).toHaveBeenCalledWith({
        where: { tenantId: "t-1", brandId: "brand-1" },
        data: { brandId: null, updatedBy: "user-1" },
      });
      expect(mockPrisma.brand.delete).toHaveBeenCalledWith({
        where: { id: "brand-1" },
      });
    });
  });

  describe("Product Pricing Hardening & Price History", () => {
    it("records immutable price history when price changes", async () => {
      let currentProduct: any = {
        id: "prod-1",
        sku: "TEST-SKU",
        name: "Test Product",
        priceMinor: 100_000,
        costMinor: 80_000,
        wholesalePriceMinor: 90_000,
        taxRateBps: 1600,
        version: 1,
        extensions: {
          priceHistory: [],
          wholesalePriceMinor: 90_000,
        },
      };

      mockPrisma.product.findFirst.mockImplementation(() => Promise.resolve(currentProduct));
      mockPrisma.product.update.mockImplementation(({ data }: any) => {
        currentProduct = {
          ...currentProduct,
          ...data,
          extensions: data.extensions,
        };
        return Promise.resolve(currentProduct);
      });

      const updated = await catalogService.updateProduct(
        "t-1",
        "prod-1",
        {
          priceMinor: 120_000,
          wholesalePriceMinor: 105_000,
          costMinor: 85_000,
        },
        "user-admin",
      );

      const history = await catalogService.getPriceHistory("t-1", "prod-1");
      expect(history.length).toBe(3);


      const retailEntry = history.find((h: any) => h.priceType === "retail");
      expect(retailEntry).toBeDefined();
      expect(retailEntry.oldValueMinor).toBe(100_000);
      expect(retailEntry.newValueMinor).toBe(120_000);
      expect(retailEntry.changedBy).toBe("user-admin");

      const wholesaleEntry = history.find((h: any) => h.priceType === "wholesale");
      expect(wholesaleEntry).toBeDefined();
      expect(wholesaleEntry.oldValueMinor).toBe(90_000);
      expect(wholesaleEntry.newValueMinor).toBe(105_000);

      const costEntry = history.find((h: any) => h.priceType === "cost");
      expect(costEntry).toBeDefined();
      expect(costEntry.oldValueMinor).toBe(80_000);
      expect(costEntry.newValueMinor).toBe(85_000);
    });
  });
});
