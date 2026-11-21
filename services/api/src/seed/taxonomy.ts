import type { TaxClassification } from "@sokoos/types";

export type CategoryTaxonomyNode = {
  name: string;
  defaultTaxClassification: TaxClassification;
  isRegulated?: boolean;
  subcategories?: string[];
};

export const SYSTEM_UNCATEGORIZED_CATEGORY = "Uncategorized";
export const SYSTEM_UNKNOWN_BRAND = "Unknown Brand";

/**
 * Standard Kenyan Wines, Spirits, Beverage & Regulated Products Taxonomy.
 * Designed for compliance with KRA VAT, Excise regulations, and alcoholic beverage retail operations.
 */
export const KENYA_WINES_SPIRITS_TAXONOMY: CategoryTaxonomyNode[] = [
  // --- Alcohol: Wine ---
  {
    name: "Wine",
    defaultTaxClassification: "STANDARD_VAT",
    subcategories: [
      "Red Wine",
      "White Wine",
      "Rosé",
      "Sparkling Wine",
      "Champagne",
      "Prosecco",
      "Dessert Wine",
      "Fortified Wine",
      "Port",
      "Sherry",
      "Sweet Wine",
      "Semi-Sweet Wine",
      "Dry Wine",
      "Organic Wine",
      "Wine Gift Packs",
    ],
  },
  // --- Alcohol: Whisky ---
  {
    name: "Whisky",
    defaultTaxClassification: "STANDARD_VAT",
    subcategories: [
      "Scotch Whisky",
      "Single Malt",
      "Blended Scotch",
      "Irish Whiskey",
      "Bourbon",
      "Tennessee Whiskey",
      "Canadian Whisky",
      "Japanese Whisky",
      "Other Whisky",
    ],
  },
  // --- Alcohol: Vodka ---
  {
    name: "Vodka",
    defaultTaxClassification: "STANDARD_VAT",
    subcategories: [
      "Standard Vodka",
      "Flavoured Vodka",
      "Premium Vodka",
    ],
  },
  // --- Alcohol: Gin ---
  {
    name: "Gin",
    defaultTaxClassification: "STANDARD_VAT",
    subcategories: [
      "London Dry",
      "Dry Gin",
      "Pink Gin",
      "Flavoured Gin",
      "Premium Gin",
    ],
  },
  // --- Alcohol: Rum ---
  {
    name: "Rum",
    defaultTaxClassification: "STANDARD_VAT",
    subcategories: [
      "White Rum",
      "Dark Rum",
      "Spiced Rum",
      "Gold Rum",
    ],
  },
  // --- Alcohol: Brandy & Cognac ---
  {
    name: "Brandy & Cognac",
    defaultTaxClassification: "STANDARD_VAT",
    subcategories: [
      "Brandy",
      "Cognac VS",
      "Cognac VSOP",
      "Cognac XO",
      "Armagnac",
    ],
  },
  // --- Alcohol: Tequila ---
  {
    name: "Tequila",
    defaultTaxClassification: "STANDARD_VAT",
    subcategories: [
      "Blanco",
      "Reposado",
      "Añejo",
      "Extra Añejo",
    ],
  },
  // --- Alcohol: Liqueurs ---
  {
    name: "Liqueurs",
    defaultTaxClassification: "STANDARD_VAT",
    subcategories: [
      "Cream Liqueurs",
      "Coffee Liqueurs",
      "Fruit Liqueurs",
      "Herbal Liqueurs",
      "Orange Liqueurs",
      "Other Liqueurs",
    ],
  },
  // --- Alcohol: Beer & Cider ---
  {
    name: "Beer & Cider",
    defaultTaxClassification: "STANDARD_VAT",
    subcategories: [
      "Lager",
      "Ale",
      "Stout",
      "Cider",
      "Craft Beer",
      "Non-Alcoholic Beer",
      "Malt Beverages",
    ],
  },
  // --- Alcohol: Ready-to-Drink (RTD) ---
  {
    name: "Ready to Drink (RTD)",
    defaultTaxClassification: "STANDARD_VAT",
    subcategories: [
      "RTD Cocktails",
      "Canned Cocktails",
      "Hard Seltzers",
      "Flavoured Alcoholic Beverages",
    ],
  },
  // --- Non-Alcoholic Beverages & Mixers ---
  {
    name: "Non-Alcoholic & Mixers",
    defaultTaxClassification: "STANDARD_VAT",
    subcategories: [
      "Still Water",
      "Sparkling Water",
      "Soda & Soft Drinks",
      "Energy Drinks",
      "Juice & Blends",
      "Tonic Water",
      "Soda Water",
      "Ginger Beer",
      "Cocktail Syrups",
      "Mocktail Mixers",
      "Sports Drinks",
    ],
  },
  // --- Regulated: Tobacco & Nicotine (Flagged for Regulatory Review) ---
  {
    name: "Tobacco & Nicotine",
    defaultTaxClassification: "REVIEW_REQUIRED",
    isRegulated: true,
    subcategories: [
      "Cigarettes",
      "Cigarillos",
      "Cigars",
      "Rolling Tobacco",
      "Pipe Tobacco",
      "Shisha Tobacco",
      "Heated Tobacco Products",
      "Nicotine Pouches",
      "Vapes & E-Cigarettes",
      "Disposable Vapes",
      "Refillable Vape Devices",
      "Vape Pods & Cartridges",
      "E-Liquids",
      "Smoking Accessories",
    ],
  },
  // --- Retail Support & Bar Accessories ---
  {
    name: "Bar Accessories & Retail Support",
    defaultTaxClassification: "STANDARD_VAT",
    subcategories: [
      "Ice",
      "Glassware",
      "Corkscrews & Openers",
      "Gift Bags & Boxes",
      "Cocktail Shakers & Tools",
      "Straws & Napkins",
      "Packaging",
      "Promotional Bundles",
    ],
  },
  // --- System Default Fallback Category ---
  {
    name: SYSTEM_UNCATEGORIZED_CATEGORY,
    defaultTaxClassification: "STANDARD_VAT",
    subcategories: [],
  },
];
