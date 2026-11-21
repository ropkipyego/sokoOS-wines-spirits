import { z } from "zod";

/** Industry / operating profiles a tenant may enable (multi-select). */
export const BUSINESS_TYPES = [
  "wines_spirits",
  "retail",
  "supermarket",
  "restaurant",
  "hotel",
  "bar",
  "wholesale",
  "pharmacy",
  "hardware",
  "electronics",
  "services",
  "mixed",
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const BusinessTypeSchema = z.enum(BUSINESS_TYPES);

/** Commercial product editions built on the SokoOS platform. */
export const PRODUCT_EDITIONS = [
  "WINES_SPIRITS",
  "PHARMACY",
  "RETAIL",
  "RESTAURANT",
  "HOTEL",
  "WHOLESALE",
] as const;

export type ProductEdition = (typeof PRODUCT_EDITIONS)[number];

export const ProductEditionSchema = z.enum(PRODUCT_EDITIONS);

/** Active commercial product edition for this repository. */
export const PRODUCT_EDITION: ProductEdition = "WINES_SPIRITS";

/** Feature packs gated per tenant. */
export const MODULE_KEYS = [
  "wines_spirits",
  "retail",
  "restaurant",
  "hotel",
  "pharmacy",
  "wholesale",
  "hardware",
  "services",
  "accounting",
  "deliveries",
  "e_tims",
  "mpesa",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export const ModuleKeySchema = z.enum(MODULE_KEYS);

export type ModulesEnabled = Partial<Record<ModuleKey, boolean>>;

export type EditionConfig = {
  edition: ProductEdition;
  productName: string;
  shortName: string;
  tagline: string;
  defaultBusinessTypes: BusinessType[];
  modulesAllowed: Record<ModuleKey, boolean>;
  defaultCategories: readonly string[];
  defaultUnits: ReadonlyArray<{ name: string; abbreviation: string }>;
};

export const EDITION_CONFIGS: Record<ProductEdition, EditionConfig> = {
  WINES_SPIRITS: {
    edition: "WINES_SPIRITS",
    productName: "SokoOS Wines & Spirits",
    shortName: "Wines & Spirits",
    tagline:
      "Commercial POS, Inventory Control, Purchasing & eTIMS Operations for Wines, Spirits & Beverage Retail",
    defaultBusinessTypes: ["wines_spirits", "retail", "wholesale"],
    modulesAllowed: {
      wines_spirits: true,
      retail: true,
      wholesale: true,
      accounting: true,
      deliveries: true,
      e_tims: true,
      mpesa: true,
      restaurant: false,
      hotel: false,
      pharmacy: false,
      hardware: false,
      services: false,
    },
    defaultCategories: [
      "Wine",
      "Whisky",
      "Vodka",
      "Gin",
      "Rum",
      "Brandy & Cognac",
      "Tequila",
      "Liqueurs",
      "Beer & Cider",
      "Ready to Drink (RTD)",
      "Non-Alcoholic & Mixers",
      "Tobacco & Nicotine",
      "Bar Accessories & Retail Support",
      "Uncategorized",
    ],
    defaultUnits: [
      { name: "Bottle", abbreviation: "btl" },
      { name: "Case", abbreviation: "case" },
      { name: "Can", abbreviation: "can" },
      { name: "Pack", abbreviation: "pack" },
      { name: "Keg", abbreviation: "keg" },
      { name: "Piece", abbreviation: "pcs" },
    ],
  },
  PHARMACY: {
    edition: "PHARMACY",
    productName: "SokoOS Pharmacy",
    shortName: "Pharmacy",
    tagline: "FEFO Batch, Prescription & Retail Pharmacy Platform",
    defaultBusinessTypes: ["pharmacy", "retail"],
    modulesAllowed: {
      wines_spirits: false,
      retail: true,
      wholesale: false,
      accounting: true,
      deliveries: true,
      e_tims: true,
      mpesa: true,
      restaurant: false,
      hotel: false,
      pharmacy: true,
      hardware: false,
      services: false,
    },
    defaultCategories: ["Prescription", "OTC", "Supplements", "Personal Care"],
    defaultUnits: [
      { name: "Pack", abbreviation: "pack" },
      { name: "Bottle", abbreviation: "btl" },
      { name: "Tablet", abbreviation: "tab" },
    ],
  },
  RETAIL: {
    edition: "RETAIL",
    productName: "SokoOS Retail",
    shortName: "Retail",
    tagline: "General Retail & Supermarket Commerce Platform",
    defaultBusinessTypes: ["retail", "supermarket"],
    modulesAllowed: {
      wines_spirits: false,
      retail: true,
      wholesale: true,
      accounting: true,
      deliveries: true,
      e_tims: true,
      mpesa: true,
      restaurant: false,
      hotel: false,
      pharmacy: false,
      hardware: false,
      services: false,
    },
    defaultCategories: ["Groceries", "Beverages", "Household", "Personal Care"],
    defaultUnits: [
      { name: "Piece", abbreviation: "pcs" },
      { name: "Pack", abbreviation: "pack" },
      { name: "Carton", abbreviation: "ctn" },
    ],
  },
  RESTAURANT: {
    edition: "RESTAURANT",
    productName: "SokoOS Restaurant & Bar",
    shortName: "Restaurant",
    tagline: "Table Service, Kitchen Display & Hospitality POS",
    defaultBusinessTypes: ["restaurant", "bar"],
    modulesAllowed: {
      wines_spirits: false,
      retail: true,
      wholesale: false,
      accounting: true,
      deliveries: true,
      e_tims: true,
      mpesa: true,
      restaurant: true,
      hotel: false,
      pharmacy: false,
      hardware: false,
      services: false,
    },
    defaultCategories: ["Starters", "Mains", "Grills", "Drinks", "Desserts"],
    defaultUnits: [
      { name: "Portion", abbreviation: "ptn" },
      { name: "Bottle", abbreviation: "btl" },
    ],
  },
  HOTEL: {
    edition: "HOTEL",
    productName: "SokoOS Hotel & Hospitality",
    shortName: "Hotel",
    tagline: "Rooms, Folios, Restaurant & Property Operations",
    defaultBusinessTypes: ["hotel", "restaurant", "bar"],
    modulesAllowed: {
      wines_spirits: false,
      retail: true,
      wholesale: false,
      accounting: true,
      deliveries: false,
      e_tims: true,
      mpesa: true,
      restaurant: true,
      hotel: true,
      pharmacy: false,
      hardware: false,
      services: false,
    },
    defaultCategories: ["Accommodation", "Food & Beverage", "Laundry", "Mini Bar"],
    defaultUnits: [{ name: "Night", abbreviation: "night" }],
  },
  WHOLESALE: {
    edition: "WHOLESALE",
    productName: "SokoOS Wholesale & Distribution",
    shortName: "Wholesale",
    tagline: "Tiered Price Lists, Bulk Orders & Multi-Warehouse Distribution",
    defaultBusinessTypes: ["wholesale", "retail"],
    modulesAllowed: {
      wines_spirits: false,
      retail: true,
      wholesale: true,
      accounting: true,
      deliveries: true,
      e_tims: true,
      mpesa: true,
      restaurant: false,
      hotel: false,
      pharmacy: false,
      hardware: false,
      services: false,
    },
    defaultCategories: ["Cases", "Bales", "Cartons", "Bulk"],
    defaultUnits: [
      { name: "Case", abbreviation: "case" },
      { name: "Carton", abbreviation: "ctn" },
      { name: "Piece", abbreviation: "pcs" },
    ],
  },
};

export function getEditionConfig(edition: ProductEdition = PRODUCT_EDITION): EditionConfig {
  return EDITION_CONFIGS[edition];
}

export function isEditionModuleAllowed(
  key: ModuleKey,
  edition: ProductEdition = PRODUCT_EDITION,
): boolean {
  return EDITION_CONFIGS[edition].modulesAllowed[key] === true;
}

/** Default modules implied by business types (union). */
export function defaultModulesForTypes(types: BusinessType[]): ModulesEnabled {
  const enabled: ModulesEnabled = { retail: true };
  for (const t of types) {
    if (t === "wines_spirits") {
      enabled.wines_spirits = true;
      enabled.retail = true;
      enabled.wholesale = true;
      enabled.e_tims = true;
      enabled.mpesa = true;
    }
    if (t === "restaurant" || t === "bar" || t === "hotel") enabled.restaurant = true;
    if (t === "hotel") enabled.hotel = true;
    if (t === "pharmacy") enabled.pharmacy = true;
    if (t === "wholesale") enabled.wholesale = true;
    if (t === "hardware" || t === "electronics") enabled.hardware = true;
    if (t === "services") enabled.services = true;
    if (t === "supermarket" || t === "retail" || t === "mixed") enabled.retail = true;
    if (t === "mixed") {
      enabled.restaurant = true;
      enabled.retail = true;
    }
  }
  return enabled;
}

export function isModuleEnabled(
  modules: ModulesEnabled | null | undefined,
  key: ModuleKey,
  edition?: ProductEdition,
): boolean {
  if (edition && !isEditionModuleAllowed(key, edition)) return false;
  if (!modules) return key === "retail" || key === "wines_spirits";
  if (modules[key] === true) return true;
  if (modules[key] === false) return false;
  return key === "retail";
}

export const TenantProfileSchema = z.object({
  businessTypes: z.array(BusinessTypeSchema).default(["retail"]),
  modulesEnabled: z.record(z.boolean()).default({ retail: true }),
  businessMode: z.enum(["retail", "restaurant", "hybrid"]).optional(),
});

export type TenantProfile = z.infer<typeof TenantProfileSchema>;
