/**
 * The glyph a currency code prints as, or the code itself when it has none.
 *
 * `currencyDisplay: "symbol"` rather than `"narrowSymbol"` deliberately: narrow
 * renders CAD as a bare `$`, indistinguishable from USD, which is the exact
 * false claim this module exists to avoid. Wide gives `CA$`. A currency with no
 * glyph at all — CHF, and any code ICU does not recognise — comes back as the
 * code, which is an honest fallback rather than a failure.
 *
 * Returns `null` when ICU rejects the input outright. That is reachable: these
 * codes are read out of an NLP-extracted `amount_json` blob, and ICU throws on
 * anything malformed (a two-letter string, an empty one) rather than degrading.
 */
function currencySymbol(code: string): string | null {
  try {
    return (
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: code,
        currencyDisplay: "symbol",
      })
        .formatToParts(1)
        .find((part) => part.type === "currency")?.value ?? null
    );
  } catch {
    return null;
  }
}

/**
 * The magnitude half of a formatted amount, with no currency attached.
 *
 * Billions keep two decimals and millions one, held even when they are zero:
 * `1.25B`, `1.80B`, `950.0M`. The fixed decimal count is what lets a column of
 * these line up under `tabular-nums` — a mix of `1.8B` and `1.25B` does not.
 * Precision is uniform rather than width-capped, so figures above ten billion
 * render one character wider (`217.55B`).
 */
function formatMagnitude(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  return value.toLocaleString();
}

/**
 * A bare count with a short magnitude suffix and no currency: `1.2M`, `950.0M`,
 * `12,345`. Shares a formatter with {@link formatAmountShort} so a Shares column
 * and a Value column line up under `tabular-nums`.
 */
export function formatCountShort(value: number): string {
  return formatMagnitude(value);
}

/**
 * Format a figure with a short magnitude suffix, prefixed with the symbol of
 * the currency it was actually reported in: `$1.25B`, `€1.80B`, `CHF 950.0M`.
 *
 * There is no conversion here or anywhere — no CDT output supplies an FX rate,
 * and commercial debt amounts arrive in USD, EUR, GBP, CHF, and CAD. So a
 * figure keeps the currency its filing reported and never acquires another. A
 * `null` currency yields a bare number: an extraction that found no currency
 * must not be rendered as dollars. Callers render the ISO code alongside.
 *
 * Alphabetic symbols take a trailing space and glyphs do not, matching what
 * `Intl` itself produces for `CHF 500.00` against `CA$500.00`.
 */
export function formatAmountShort(
  value: number,
  currency: string | null,
): string {
  const magnitude = formatMagnitude(value);
  const symbol = currency ? currencySymbol(currency) : null;
  if (!symbol) return magnitude;
  return /\p{L}$/u.test(symbol)
    ? `${symbol} ${magnitude}`
    : `${symbol}${magnitude}`;
}
