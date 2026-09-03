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
 * Whether rounding `scaled` to `digits` decimals carries it into four figures.
 *
 * The rounding a tier applies can push a value out of that tier: `999.95` at one
 * decimal is `1000.0`, which is a full unit of the tier above. Tier selection
 * asks this first, so a value that rounds up to the next tier is rendered in it
 * rather than as four digits of the tier below. Trillions, having no tier above
 * them, are the one place four digits can still appear.
 */
function carriesToFourDigits(scaled: number, digits: number): boolean {
  return Number(scaled.toFixed(digits)) >= 1000;
}

/**
 * The magnitude half of a formatted amount, with no currency attached.
 *
 * Trillions and billions keep two decimals and millions one, held even when
 * they are zero: `2.63T`, `1.25B`, `1.80B`, `950.0M`. The fixed decimal count
 * is what lets a column of these line up under `tabular-nums` — a mix of `1.8B`
 * and `1.25B` does not. Precision is uniform rather than width-capped, so
 * figures above ten billion render one character wider (`217.55B`). The
 * trillions tier keeps company-facts public floats and revenues from rendering
 * as four-digit billions (`$2628.55B`).
 *
 * A tier is entered either by reaching its threshold or by rounding up to it
 * from just below, because the tier's own rounding is applied after the tier is
 * chosen. Picking on the raw value alone rendered 999,950,000 as `1000.0M`
 * rather than `1.00B`, and 999,995,000,000 as `1000.00B` rather than `1.00T` —
 * the four-digit reading the trillions tier exists to avoid, one boundary down.
 * Only the suffixed tiers promote: below a million there is no suffix to carry
 * into, so 999,999 stays a plain `999,999` and does not become `1.0M`.
 */
function formatMagnitude(value: number): string {
  if (value >= 1e12 || carriesToFourDigits(value / 1e9, 2))
    return `${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9 || carriesToFourDigits(value / 1e6, 1))
    return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  return value.toLocaleString();
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
