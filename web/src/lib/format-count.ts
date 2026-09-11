/**
 * Whether rounding `scaled` to one decimal carries it into four figures, so a
 * value just under a tier boundary is rendered in the tier above (`999,950` is
 * `1M`, not `1000.0K`). The same carry rule `format-currency` applies to money.
 */
function carriesToFourDigits(scaled: number): boolean {
  return Number(scaled.toFixed(1)) >= 1000;
}

/** One decimal, with a trailing `.0` dropped: `1.7`, `2` — never `2.0`. */
function oneDecimal(scaled: number): string {
  return scaled.toFixed(1).replace(/\.0$/, "");
}

/**
 * A count for a headline: compact once it reaches five figures, exact below.
 *
 * `18,635` → `18.6K`, `287,774` → `287.8K`, `1,701,003` → `1.7M`, `1,129` →
 * `1,129`. Five figures is the threshold because a four-figure count is still
 * legible at a glance and more informative exact than as `1.1K`; past that the
 * digits read as precision a hero statistic does not need. Callers that want
 * the exact figure available should put `toLocaleString()` in a `title`.
 *
 * This is deliberately not {@link formatAmountShort}'s magnitude: money columns
 * keep fixed decimals so figures align, and have no thousands tier. A count on
 * its own line wants the opposite — the shortest honest reading.
 */
export function formatCountShort(value: number): string {
  if (value >= 1e9 || carriesToFourDigits(value / 1e6))
    return `${oneDecimal(value / 1e9)}B`;
  if (value >= 1e6 || carriesToFourDigits(value / 1e3))
    return `${oneDecimal(value / 1e6)}M`;
  if (value >= 1e4) return `${oneDecimal(value / 1e3)}K`;
  return value.toLocaleString("en-US");
}
