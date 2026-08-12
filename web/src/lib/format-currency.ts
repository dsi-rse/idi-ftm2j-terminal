/**
 * Format a USD figure with a short magnitude suffix, for stat cells and table
 * columns where the exact figure matters less than the order of magnitude.
 *
 * Billions keep two decimals below $10B and one above, so the string stays a
 * predictable width as values grow: `$1.25B`, `$56.4B`, `$217M`.
 */
export function formatUsdShort(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(value >= 10e9 ? 1 : 2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${value.toLocaleString()}`;
}

/**
 * Format a figure with a short magnitude suffix and **no currency symbol**, for
 * columns holding amounts in more than one currency.
 *
 * Same magnitude rules as {@link formatUsdShort}, deliberately, so the two read
 * alike where they appear on one page. The symbol is what differs and why this
 * exists: commercial debt amounts arrive in USD, EUR, GBP, CHF, and CAD with no
 * conversion rate anywhere in the source, so prefixing `$` would assert a
 * currency the filing did not report. Callers render the code alongside.
 */
export function formatAmountShort(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(value >= 10e9 ? 1 : 2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(0)}M`;
  return value.toLocaleString();
}
