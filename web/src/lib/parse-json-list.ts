/**
 * Parse a JSON-encoded string array, as Pagefind meta fields carry them.
 *
 * Returns `[]` for anything unusable — missing, malformed, or valid JSON that
 * is not an array. Callers render search results, so a bad value must degrade
 * to "no tickers" rather than throwing and taking the results list down with
 * it.
 */
export function parseJsonList(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
