/**
 * unitConversion.ts
 * Robust unit conversion utility for restaurant inventory and Bill of Materials (BOM).
 * Handles weight, volume, and count unit conversions with standard culinary multipliers.
 */

// Weight conversion factors to base unit: Grams (g)
const WEIGHT_TO_GRAMS: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  kgs: 1000,
  lb: 453.59237,
  pound: 453.59237,
  pounds: 453.59237,
  lbs: 453.59237,
  oz: 28.349523125,
  ounce: 28.349523125,
  ounces: 28.349523125,
  ozs: 28.349523125,
};

// Volume conversion factors to base unit: Milliliters (ml)
const VOLUME_TO_ML: Record<string, number> = {
  ml: 1,
  milliliter: 1,
  milliliters: 1,
  liter: 1000,
  liters: 1000,
  litre: 1000,
  litres: 1000,
  l: 1000,
  fl_oz: 29.5735,
  floz: 29.5735,
  "fl oz": 29.5735,
  "fluid ounce": 29.5735,
  "fluid ounces": 29.5735,
  cup: 236.588,
  cups: 236.588,
  tbsp: 14.7868,
  tablespoon: 14.7868,
  tablespoons: 14.7868,
  tsp: 4.92892,
  teaspoon: 4.92892,
  teaspoons: 4.92892,
  gallon: 3785.41,
  gallons: 3785.41,
  gal: 3785.41,
  pint: 473.176,
  pints: 473.176,
  quart: 946.353,
  quarts: 946.353,
};

// Count/discrete items aliases
const COUNT_UNITS: Set<string> = new Set([
  "each",
  "ea",
  "piece",
  "pieces",
  "pc",
  "pcs",
  "slice",
  "slices",
  "case",
  "box",
  "pack",
  "portion",
]);

/**
 * Normalizes unit string to standard lowercase format
 */
export function normalizeUnit(unit: string | null | undefined): string {
  if (!unit) return "each";
  const trimmed = unit.toLowerCase().trim();
  if (trimmed === "lbs" || trimmed === "pound" || trimmed === "pounds") return "lb";
  if (trimmed === "ozs" || trimmed === "ounce" || trimmed === "ounces") return "oz";
  if (trimmed === "kgs" || trimmed === "kilogram" || trimmed === "kilograms") return "kg";
  if (trimmed === "grams" || trimmed === "gram") return "g";
  if (trimmed === "liters" || trimmed === "litre" || trimmed === "litres" || trimmed === "l") return "liter";
  if (trimmed === "milliliters" || trimmed === "millilitre" || trimmed === "mls") return "ml";
  if (trimmed === "gallons" || trimmed === "gal") return "gallon";
  if (trimmed === "fl oz" || trimmed === "floz" || trimmed === "fluid ounce" || trimmed === "fluid ounces") return "fl_oz";
  if (trimmed === "ea" || trimmed === "piece" || trimmed === "pieces" || trimmed === "pc" || trimmed === "pcs") return "each";
  return trimmed;
}

/**
 * Converts a quantity from one unit of measurement to another.
 * If units are compatible (both weight or both volume), returns precise converted amount.
 * If units are identical, returns original quantity.
 * If units are across dimensions (e.g. volume to count) and direct density is not defined,
 * returns quantity directly (1:1 fallback).
 */
export function convertUnits(
  quantity: number,
  fromUnitRaw: string | null | undefined,
  toUnitRaw: string | null | undefined
): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;

  const fromUnit = normalizeUnit(fromUnitRaw);
  const toUnit = normalizeUnit(toUnitRaw);

  if (fromUnit === toUnit) {
    return quantity;
  }

  // Check Weight
  if (WEIGHT_TO_GRAMS[fromUnit] !== undefined && WEIGHT_TO_GRAMS[toUnit] !== undefined) {
    const inGrams = quantity * WEIGHT_TO_GRAMS[fromUnit];
    return inGrams / WEIGHT_TO_GRAMS[toUnit];
  }

  // Check Volume
  if (VOLUME_TO_ML[fromUnit] !== undefined && VOLUME_TO_ML[toUnit] !== undefined) {
    const inMl = quantity * VOLUME_TO_ML[fromUnit];
    return inMl / VOLUME_TO_ML[toUnit];
  }

  // Common culinary fluid ounce weight vs volume convenience (for water-density liquids, 1 fl oz ~ 1 oz)
  if (fromUnit === "oz" && toUnit === "fl_oz") return quantity;
  if (fromUnit === "fl_oz" && toUnit === "oz") return quantity;

  // Fallback: incompatible dimensions or count units
  return quantity;
}

/**
 * Calculates the cost of a recipe ingredient based on the inventory ingredient's costPerUnit.
 * Handles automatic unit conversion (e.g. recipe calls for 8 oz, ingredient cost is $12.00 / lb).
 */
export function calculateIngredientLineCost(
  recipeQty: number,
  recipeUnit: string,
  costPerUnit: number | string | null | undefined,
  ingredientStockUnit: string
): number {
  const cost = Number(costPerUnit || 0);
  if (!Number.isFinite(cost) || cost <= 0) return 0;

  const convertedQty = convertUnits(recipeQty, recipeUnit, ingredientStockUnit);
  return Math.round(convertedQty * cost * 100) / 100;
}

/**
 * List of standard supported units for UI dropdowns
 */
export const STANDARD_UNITS = [
  { value: "lb", label: "Pound (lb)", category: "weight" },
  { value: "oz", label: "Ounce (oz)", category: "weight" },
  { value: "kg", label: "Kilogram (kg)", category: "weight" },
  { value: "g", label: "Gram (g)", category: "weight" },
  { value: "gallon", label: "Gallon (gal)", category: "volume" },
  { value: "liter", label: "Liter (L)", category: "volume" },
  { value: "fl_oz", label: "Fluid Ounce (fl oz)", category: "volume" },
  { value: "ml", label: "Milliliter (ml)", category: "volume" },
  { value: "cup", label: "Cup", category: "volume" },
  { value: "tbsp", label: "Tablespoon (tbsp)", category: "volume" },
  { value: "tsp", label: "Teaspoon (tsp)", category: "volume" },
  { value: "each", label: "Each (ea / pc)", category: "count" },
  { value: "case", label: "Case", category: "count" },
  { value: "box", label: "Box", category: "count" },
];
