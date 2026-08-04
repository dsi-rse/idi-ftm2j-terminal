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
