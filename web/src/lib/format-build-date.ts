const BUILD_DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  // UTC, not the reader's zone: the label names the day the build ran, which
  // must read the same for everyone and match between prerender and hydration.
  timeZone: "UTC",
});

/**
 * Formats a build timestamp (ISO 8601) as "Mar 6, 2026". Returns `null` for a
 * missing or unparseable value so callers can omit the label rather than show
 * "Invalid Date".
 */
export function formatBuildDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : BUILD_DATE_FORMAT.format(date);
}
