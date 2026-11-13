import type { ProductRecord } from "./types";

export const SEED_PRODUCTS: ProductRecord[] = [
  { id: "prod_rice", sku: "JW-BLACK-750ML", name: "Johnnie Walker Black Label 750ml", category: "Whisky", size: "750ml", packagingType: "bottle", packSize: 1, priceCents: 360000, wholesalePriceCents: 335000, stock: 40, barcode: "5000267023656", featured: true },
  { id: "prod_oil", sku: "GLENFIDDICH-12Y-750ML", name: "Glenfiddich 12 Year Old 750ml", category: "Whisky", size: "750ml", packagingType: "bottle", packSize: 1, priceCents: 650000, wholesalePriceCents: 610000, stock: 18, barcode: "5010327325125", featured: true },
  { id: "prod_sugar", sku: "JAMESON-750ML", name: "Jameson Irish Whiskey 750ml", category: "Whisky", size: "750ml", packagingType: "bottle", packSize: 1, priceCents: 280000, wholesalePriceCents: 260000, stock: 35, barcode: "5011007003234", featured: true },
  { id: "prod_soap", sku: "GILBEYS-GIN-750ML", name: "Gilbey's London Dry Gin 750ml", category: "Gin", size: "750ml", packagingType: "bottle", packSize: 1, priceCents: 165000, wholesalePriceCents: 150000, stock: 50, barcode: "6161101600456", featured: true },
  { id: "prod_detergent", sku: "TANQUERAY-750ML", name: "Tanqueray London Dry Gin 750ml", category: "Gin", size: "750ml", packagingType: "bottle", packSize: 1, priceCents: 340000, wholesalePriceCents: 315000, stock: 22, barcode: "5000289110884", featured: true },
  { id: "prod_milk", sku: "SMIRNOFF-VODKA-750ML", name: "Smirnoff Red Label Vodka 750ml", category: "Vodka", size: "750ml", packagingType: "bottle", packSize: 1, priceCents: 175000, wholesalePriceCents: 160000, stock: 32, barcode: "5000289925440", featured: true },
  { id: "prod_yogurt", sku: "FOUR-COUSINS-RED-750ML", name: "Four Cousins Sweet Red 750ml", category: "Wine", size: "750ml", packagingType: "bottle", packSize: 1, priceCents: 135000, wholesalePriceCents: 120000, stock: 28, barcode: "6009609860081", featured: true },
  { id: "prod_bread", sku: "MOET-IMPERIAL-750ML", name: "Moët & Chandon Impérial Brut 750ml", category: "Champagne", size: "750ml", packagingType: "bottle", packSize: 1, priceCents: 980000, wholesalePriceCents: 920000, stock: 10, barcode: "3185370001233", featured: false },
  { id: "prod_soda", sku: "TUSKER-LAGER-500ML", name: "Tusker Lager Can 500ml", category: "Beer", size: "500ml", packagingType: "can", packSize: 1, priceCents: 26000, wholesalePriceCents: 23500, stock: 96, barcode: "6161101600128", featured: true },
  { id: "prod_water", sku: "SAVANNA-DRY-330ML", name: "Savanna Dry Cider 330ml", category: "Cider", size: "330ml", packagingType: "bottle", packSize: 1, priceCents: 32000, wholesalePriceCents: 29000, stock: 72, barcode: "6001108001234", featured: false },
  { id: "prod_tea", sku: "SCHWEPPES-TONIC-300ML", name: "Schweppes Indian Tonic Water 300ml", category: "Mixers", size: "300ml", packagingType: "can", packSize: 1, priceCents: 12000, wholesalePriceCents: 10000, stock: 60, barcode: "5449000011527", featured: false },
  { id: "prod_eggs", sku: "JW-BLACK-CASE12", name: "Johnnie Walker Black Label Case (12x750ml)", category: "Whisky", size: "12x750ml", packagingType: "case", packSize: 12, priceCents: 3960000, wholesalePriceCents: 3840000, stock: 8, barcode: "5000267023663", featured: false },
];

export const SEED_CATEGORIES = [
  "All",
  "Whisky",
  "Vodka",
  "Gin",
  "Rum",
  "Brandy",
  "Tequila",
  "Wine",
  "Champagne",
  "Beer",
  "Cider",
  "Liqueurs",
  "Mixers",
  "Soft Drinks",
  "Water",
] as const;
