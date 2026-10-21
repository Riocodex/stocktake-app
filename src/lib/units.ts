/**
 * Unit conversion helpers for dish recipes (and future costing / availability).
 *
 * Compatible families:
 * - mass: kg ↔ g
 * - volume: litre ↔ ml (aliases: liter, l, L)
 * - discrete: same unit only (bottle↔bottle, unit↔unit, …)
 *
 * Container → each bridging uses `unitsPerStockUnit` (typically InventoryItem.supplierPackQty)
 * when the stock unit is a pack/container and the recipe uses a discrete "each" unit.
 */

export type UnitConversionOptions = {
  /**
   * How many discrete pieces are contained in one stock unit.
   * Example: item stocked in `box`, supplierPackQty/unitsPerStockUnit = 12 →
   * recipe "6 unit" → 0.5 box.
   */
  unitsPerStockUnit?: number | null;
};

export type UnitConversionResult =
  | { ok: true; quantity: number; fromUnit: string; toUnit: string }
  | { ok: false; error: string };

const MASS_TO_GRAMS: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
};

const VOLUME_TO_ML: Record<string, number> = {
  ml: 1,
  millilitre: 1,
  milliliter: 1,
  millilitres: 1,
  milliliters: 1,
  litre: 1000,
  liter: 1000,
  litres: 1000,
  liters: 1000,
  l: 1000,
};

/** Stock units that can mean "a pack of N eaches". */
const CONTAINER_UNITS = new Set([
  "box",
  "case",
  "pack",
  "tray",
  "bag",
  "carton",
  "tin",
  "tub",
  "punnet",
]);

/** Discrete counting units treated as interchangeable "each" for pack bridging. */
const EACH_UNITS = new Set(["unit", "piece", "each", "slice"]);

function normalizeUnit(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase();
}

/** Canonical form used when storing recipe units / comparing to catalogue units. */
export function canonicalUnit(raw: string): string {
  const unit = normalizeUnit(raw);
  if (!unit) return "";
  if (unit === "l" || unit === "liter" || unit === "liters" || unit === "litres") {
    return "litre";
  }
  if (unit === "gram" || unit === "grams") return "g";
  if (unit === "kilogram" || unit === "kilograms") return "kg";
  if (
    unit === "millilitre" ||
    unit === "milliliter" ||
    unit === "millilitres" ||
    unit === "milliliters"
  ) {
    return "ml";
  }
  if (unit === "piece" || unit === "each") return "unit";
  return unit;
}

function roundQty(value: number) {
  // Enough precision for g/ml recipe lines without float noise.
  return Math.round(value * 1_000_000) / 1_000_000;
}

function massInGrams(unit: string): number | null {
  return MASS_TO_GRAMS[normalizeUnit(unit)] ?? null;
}

function volumeInMl(unit: string): number | null {
  return VOLUME_TO_ML[normalizeUnit(unit)] ?? null;
}

function isContainer(unit: string) {
  return CONTAINER_UNITS.has(canonicalUnit(unit));
}

function isEach(unit: string) {
  return EACH_UNITS.has(normalizeUnit(unit)) || canonicalUnit(unit) === "unit";
}

/**
 * Convert a quantity from one unit into another.
 * Returns an error when the pair is incompatible or pack size is missing.
 */
export function convertQuantity(
  quantity: number,
  fromUnitRaw: string,
  toUnitRaw: string,
  options: UnitConversionOptions = {},
): UnitConversionResult {
  if (!Number.isFinite(quantity)) {
    return { ok: false, error: "Quantity must be a number." };
  }
  if (quantity < 0) {
    return { ok: false, error: "Quantity cannot be negative." };
  }

  const fromUnit = canonicalUnit(fromUnitRaw);
  const toUnit = canonicalUnit(toUnitRaw);
  if (!fromUnit || !toUnit) {
    return { ok: false, error: "Both units are required." };
  }

  if (fromUnit === toUnit) {
    return { ok: true, quantity: roundQty(quantity), fromUnit, toUnit };
  }

  const fromMass = massInGrams(fromUnit);
  const toMass = massInGrams(toUnit);
  if (fromMass !== null && toMass !== null) {
    return {
      ok: true,
      quantity: roundQty((quantity * fromMass) / toMass),
      fromUnit,
      toUnit,
    };
  }

  const fromVol = volumeInMl(fromUnit);
  const toVol = volumeInMl(toUnit);
  if (fromVol !== null && toVol !== null) {
    return {
      ok: true,
      quantity: roundQty((quantity * fromVol) / toVol),
      fromUnit,
      toUnit,
    };
  }

  // Container (stock) ↔ each (recipe), using pack size.
  const pack = options.unitsPerStockUnit;
  const packOk =
    pack !== null &&
    pack !== undefined &&
    Number.isFinite(pack) &&
    pack > 0;

  if (isContainer(fromUnit) && isEach(toUnit)) {
    if (!packOk) {
      return {
        ok: false,
        error: `Cannot convert ${fromUnit} to ${toUnit} without a pack size (units per ${fromUnit}).`,
      };
    }
    return {
      ok: true,
      quantity: roundQty(quantity * (pack as number)),
      fromUnit,
      toUnit,
    };
  }

  if (isEach(fromUnit) && isContainer(toUnit)) {
    if (!packOk) {
      return {
        ok: false,
        error: `Cannot convert ${fromUnit} to ${toUnit} without a pack size (units per ${toUnit}).`,
      };
    }
    return {
      ok: true,
      quantity: roundQty(quantity / (pack as number)),
      fromUnit,
      toUnit,
    };
  }

  return {
    ok: false,
    error: `Cannot convert ${fromUnit} to ${toUnit}. Use a compatible unit or set a pack size.`,
  };
}

/**
 * Express a recipe line quantity in the InventoryItem's stock unit.
 * Steps 7 (costing) and 9 (availability) should call this.
 */
export function toStockQuantity(
  recipeQuantity: number,
  recipeUnit: string,
  stockUnit: string,
  options: UnitConversionOptions = {},
): UnitConversionResult {
  return convertQuantity(recipeQuantity, recipeUnit, stockUnit, options);
}

/** Whether recipeUnit can be expressed in stockUnit (with optional pack size). */
export function canConvertUnits(
  recipeUnit: string,
  stockUnit: string,
  options: UnitConversionOptions = {},
): boolean {
  return convertQuantity(1, recipeUnit, stockUnit, options).ok;
}

export function isMassUnit(unit: string) {
  return massInGrams(unit) !== null;
}

export function isVolumeUnit(unit: string) {
  return volumeInMl(unit) !== null;
}
