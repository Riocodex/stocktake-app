/**
 * EUR helpers using integer cents to avoid float drift in dish costing.
 * Display still uses two decimal places via formatMoney.
 */

export function eurosToCents(euros: number): number {
  if (!Number.isFinite(euros)) return 0;
  // Avoid binary float noise around .xx5 boundaries (e.g. 1.005 * 100).
  return Math.round(Number((euros * 100).toFixed(8)));
}

export function centsToEuros(cents: number): number {
  return cents / 100;
}

/** Round a euro amount to the nearest cent (as euros). */
export function roundEuros(euros: number): number {
  return centsToEuros(eurosToCents(euros));
}

/**
 * Cost = quantity × unitPrice, rounded to the nearest cent.
 * Quantity may be fractional (e.g. 0.1 kg).
 */
export function multiplyMoney(quantity: number, unitPriceEuros: number): number {
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPriceEuros)) {
    return 0;
  }
  return centsToEuros(Math.round(quantity * unitPriceEuros * 100));
}

/** Percentage with one decimal place, or null when the base is not usable. */
export function percentOf(partEuros: number, wholeEuros: number): number | null {
  if (!Number.isFinite(partEuros) || !Number.isFinite(wholeEuros) || wholeEuros <= 0) {
    return null;
  }
  return Math.round((partEuros / wholeEuros) * 1000) / 10;
}
