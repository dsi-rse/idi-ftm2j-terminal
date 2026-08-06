import type { Source } from "@/types/domain";

type SourceCitationProps = {
  source: Source;
  /**
   * How this source was dated, in the wording that fits the fact being cited —
   * e.g. `"filed on 2017-02-13, retrieved 2026-08-03"` for a filing, or
   * `"last accessed 2026-08-01"` for a record that reports no filing date.
   *
   * Name the kind of date. A filing's date is the day it reached EDGAR, not the
   * fiscal period it covers — the two differ by a median of 58 days, and 113 of
   * the 134 companies with a corporate tree filed in a different year than they
   * report on. A bare date invites the reader to assume the wrong one.
   */
  detail?: string;
};

/**
 * A citation for one {@link Source}, rendered as the source's name linked to the
 * document it came from.
 *
 * The URL is deliberately not printed as text. SEC Archives URLs run past a
 * hundred characters and wrap across several lines of a source footer, which
 * buries the name that actually tells a reader what the citation is. The
 * destination stays reachable through the link and its `title`.
 */
export function SourceCitation({ source, detail }: SourceCitationProps) {
  return (
    <>
      <a
        href={source.url}
        title={source.url}
        className="underline hover:text-foreground"
        target="_blank"
        rel="noreferrer"
      >
        {source.name}
      </a>
      {detail ? ` (${detail})` : null}.
    </>
  );
}
