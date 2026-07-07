const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Coarse relative-time label. Buckets:
 *   < 1 min          → "just now"
 *   < 60 min         → "Nm ago"
 *   < 24 h           → "Nh ago"
 *   < 48 h           → "Yesterday"
 *   < 7 d            → "Nd ago"
 *   this year        → "Mar 14"
 *   earlier          → "Mar 14, 2025"
 */
export function formatRelativeTime(
  from: number,
  now: number = Date.now(),
): string {
  const diff = Math.max(0, now - from);
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 2 * DAY) return "Yesterday";
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;

  const d = new Date(from);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  }).format(d);
}
