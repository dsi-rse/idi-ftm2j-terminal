import { CornerDownRight, LoaderCircle } from "lucide-react";
import { useEffect, useRef } from "react";

import type { CompanySearchMeta } from "@/domains/companies/stores/companies";
import { formatRelativeTime } from "@/lib/format-relative-time";
import {
  type MatchSegment,
  type SubsidiaryMatch,
  windowToMatch,
} from "@/lib/match-subsidiaries";
import { cn } from "@/lib/utils";

import { CompanyBookmark } from "./company-bookmark";

/**
 * How many matched subsidiaries a row lists before collapsing the rest into a
 * count. Two keeps a row roughly the height it was — a query like `an` matches
 * dozens of subsidiaries under one parent, and listing them all would bury the
 * next result.
 */
const MAX_SUBSIDIARY_LINES = 2;

type SearchResultProps = {
  index: number;
  /**
   * Width of the page's highest rank, in digits. Every rank is held to it so
   * the names line up when a page straddles a digit boundary (91-100).
   */
  rankWidth?: number;
  active?: boolean;
  /** This row's company page is loading: show a spinner in place of the rank. */
  pending?: boolean;
  /**
   * Called with the row's PermID and name when it is picked. The rail owns
   * navigation so it can track one pending selection across every row and
   * tab, and announce it by name.
   */
  onSelect: (permId: string, name: string) => void;
  company: CompanySearchMeta;
  viewedAt?: number;
  /**
   * The subsidiaries that explain why this row matched, pre-segmented for
   * highlighting by `matchSubsidiaries`. Empty or absent for a row matched on
   * the company's own name, ticker or PermID, which renders as it always has.
   */
  matches?: SubsidiaryMatch[];
  /**
   * The company's own name, pre-segmented against the query. When a run is
   * marked, the title carries the same highlight a subsidiary line does; when
   * nothing matched (empty query, or a hit these rules cannot re-derive) it
   * renders as plain text.
   */
  nameSegments?: MatchSegment[];
  /**
   * The country, displayed sector, and per-ticker runs, segmented for the same
   * highlight the name and subsidiaries get. Absent when there is no query, so
   * the row renders plain.
   */
  countrySegments?: MatchSegment[];
  sectorSegments?: MatchSegment[];
  tickerSegments?: MatchSegment[][];
  /**
   * The PermID, segmented. Rendered on its own labeled line when it is the match
   * — the one indexed field not otherwise on the row.
   */
  permIdSegments?: MatchSegment[];
  /**
   * An honest cue for a row nothing else on it explains — see `matchHint` in
   * `use-all-companies-search`. Rendered only when there is no subsidiary line
   * and no name highlight to carry the "why".
   */
  matchHint?: string;
};

/** True when a segmented value has at least one highlighted run. */
function hasHighlight(segments?: MatchSegment[]): boolean {
  return segments?.some((s) => s.matched) ?? false;
}

/**
 * A run of text with the query's hits marked. Shared by the company title and
 * the subsidiary lines so the two highlight identically. Local to this file
 * rather than a shared component: `match-subsidiaries` returns data instead of
 * markup precisely to keep `components/` and `domains/` from importing one
 * shared renderer, and the autocomplete popup keeps its own copy for the same
 * reason.
 *
 * Two cues, neither hard-coding the text color. `text-inherit` is load-bearing:
 * `<mark>` defaults to `color: black` in the UA stylesheet, so without it the run
 * renders black on the tint (invisible in dark mode). Inheriting instead means
 * the text — and the `currentColor` underline that tracks it — carry whatever
 * contrast the surrounding text already has on whatever surface the run lands.
 * The underline also makes the match a shape cue, not a color-only one (WCAG
 * 1.4.1).
 *
 * `tinted={false}` drops the background wash and leaves the underline alone, for
 * runs that already sit on their own colored surface — the unselected ticker
 * chip (`bg-muted/25`), where a 25% tint over the chip's own fill reads muddy.
 * There the underline (currentColor) is the whole cue and stays legible because
 * it inherits the chip's text contrast. A selected row's chip suppresses the cue
 * entirely (see the ticker render), so this never lands on the solid accent.
 */
function Highlighted({
  segments,
  tinted = true,
}: {
  segments: MatchSegment[];
  tinted?: boolean;
}) {
  return (
    <>
      {segments.map((segment, i) =>
        segment.matched ? (
          <mark
            key={i}
            className={cn(
              "rounded-chip text-inherit underline decoration-2 underline-offset-2",
              // `<mark>` defaults to a solid yellow background in the UA
              // stylesheet; the untinted case must clear it explicitly, not just
              // omit the tint, or that yellow shows through on the chip.
              tinted ? "bg-primary/25" : "bg-transparent",
            )}
          >
            {segment.text}
          </mark>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </>
  );
}

/**
 * The row's one text size. Typography should change only what communication
 * needs, so weight marks the name and the muted colour marks the rest.
 */
const ROW_TEXT = "text-value";

/** The matched subsidiary name, with the query's hits marked. */
function SubsidiaryLine({ match }: { match: SubsidiaryMatch }) {
  // Bring the first hit into view: a match deep in a long name would otherwise
  // truncate off the right edge, leaving the line looking unmatched.
  const { segments, leadingEllipsis } = windowToMatch(match.segments);
  return (
    <p
      className={cn(
        "flex min-w-0 items-baseline gap-1 text-foreground",
        ROW_TEXT,
      )}
    >
      {/* The marker does not shrink, so a long name truncates instead. Only
          the marker takes the accent. The name stays foreground to clear AA. */}
      <CornerDownRight
        aria-hidden
        className={cn("size-3 shrink-0 self-center text-primary")}
      />
      {/* The visible line is windowed to the match; the full name goes to
          assistive tech unabridged. `pb-0.5` keeps `truncate`'s overflow:hidden
          from clipping the match underline, which sits below the baseline. */}
      <span aria-hidden className={cn("truncate pb-0.5")}>
        {leadingEllipsis && "…"}
        <Highlighted segments={segments} />
      </span>
      <span className={cn("sr-only")}>{match.name}</span>
    </p>
  );
}

export function SearchResult({
  index,
  rankWidth = 2,
  active = false,
  pending = false,
  onSelect,
  company,
  viewedAt,
  matches,
  nameSegments,
  countrySegments,
  sectorSegments,
  tickerSegments,
  permIdSegments,
  matchHint,
}: SearchResultProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  // The rail follows the selected company to its page; this brings the row
  // itself into view when that page is longer than the rail.
  useEffect(() => {
    if (active) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const { permId, companyName, sector, country, tickers } = company;
  const shown = matches?.slice(0, MAX_SUBSIDIARY_LINES) ?? [];
  const hidden = (matches?.length ?? 0) - shown.length;
  const nameMatched = nameSegments?.some((segment) => segment.matched) ?? false;
  return (
    <div
      ref={rowRef}
      // Columns are content-sized rather than fixed fractions: the rank grows
      // past two digits deep in the result set and, pinned to one eighth of the
      // panel, would otherwise overrun the name beside it.
      className={cn(
        // Top-aligned throughout: the rank and name share one size and line
        // height, so their first lines coincide, and the ticker chip's top
        // edge sits on the cap line of that text.
        "grid grid-cols-[auto_1fr_auto] items-start gap-2 border-b border-muted/25 p-3 cursor-pointer border-l-2 hover:bg-muted/10",
        // The selected row carries a filled surface as well as the accent
        // border, so it reads as selected at a glance rather than on a 2px edge.
        // A loading row takes the selected surface early, so the click reads
        // as taken while the page arrives.
        active || pending
          ? "border-l-primary bg-overlay"
          : "border-l-transparent",
        pending && "cursor-progress",
      )}
      onClick={() => onSelect(permId, companyName)}
    >
      <div className={cn(ROW_TEXT, "text-muted tabular-nums")}>
        {/* The star centres on the rank's line, which is the name's line too. */}
        <div className={cn("flex flex-row items-center gap-2")}>
          <CompanyBookmark company={company} />
          {/* The spinner sits over the rank rather than replacing it, so the
              column keeps the rank's width and the name does not shift. */}
          <p className={cn("relative type-figure")}>
            <span className={cn(pending && "invisible")}>
              {/* Invisible zeros pad each rank so the names line up. */}
              <span aria-hidden className={cn("invisible")}>
                {"0".repeat(Math.max(0, rankWidth - index.toString().length))}
              </span>
              {index}
            </span>
            {/* Foreground, not the accent: the spinner is the only thing that
                tells a loading row from the selected one, which shares its
                surface and edge, and the accent on that surface is 2.84:1 in
                the light theme, under the 3:1 a state cue needs. Screen
                readers hear the load from the rail's status line instead. */}
            {pending && (
              <span
                className={cn(
                  "absolute inset-0 flex items-center justify-center text-foreground",
                )}
              >
                <LoaderCircle
                  aria-hidden
                  className={cn("size-3 motion-safe:animate-spin")}
                />
              </span>
            )}
          </p>
        </div>
      </div>
      <div className={cn("min-w-0")}>
        <div className={cn("flex flex-col gap-1")}>
          <p className={cn(ROW_TEXT, "font-semibold text-foreground break-words")}>
            {nameMatched && nameSegments ? (
              <Highlighted segments={nameSegments} />
            ) : (
              companyName
            )}
          </p>
          {shown.length > 0 ? (
            // Sector and country give way to the subsidiaries rather than
            // stacking with them: the row is three lines wide either way, and
            // why the company matched is the more useful of the two here.
            <>
              <span className={cn("sr-only")}>Matched subsidiaries:</span>
              {shown.map((match, i) => (
                // Index-qualified: a filing can disclose the same subsidiary
                // name more than once (an entity incorporated in several
                // jurisdictions), so the name alone is not a unique key.
                <SubsidiaryLine key={`${match.name}-${i}`} match={match} />
              ))}
              {hidden > 0 && (
                <p className={cn(ROW_TEXT, "text-muted")}>
                  +{hidden} more subsidiary{" "}
                  {hidden === 1 ? "match" : "matches"}
                </p>
              )}
            </>
          ) : hasHighlight(permIdSegments) && permIdSegments ? (
            // A PermID match takes over the slot the way subsidiaries do:
            // sector and country did not explain this hit, so the ID that did
            // stands alone rather than trailing two lines that are just noise
            // for a lookup by identifier.
            <p className={cn(ROW_TEXT, "text-muted")}>
              PermID: <Highlighted segments={permIdSegments} />
            </p>
          ) : (
            <>
              <p className={cn(ROW_TEXT, "text-muted")}>
                {hasHighlight(sectorSegments) && sectorSegments ? (
                  <Highlighted segments={sectorSegments} />
                ) : (
                  (sector ?? "--")
                )}
              </p>
              <p className={cn(ROW_TEXT, "text-muted")}>
                {hasHighlight(countrySegments) && countrySegments ? (
                  <Highlighted segments={countrySegments} />
                ) : (
                  (country ?? "--")
                )}
              </p>
              {matchHint && (
                <p className={cn(ROW_TEXT, "text-muted")}>
                  {matchHint}
                </p>
              )}
            </>
          )}
          {viewedAt !== undefined && (
            <p className={cn(ROW_TEXT, "text-muted")}>
              {formatRelativeTime(viewedAt)}
            </p>
          )}
        </div>
      </div>
      {tickers && tickers.length > 0 && (
        // Nudged down to the cap line of the name beside it. At 13px/1.4 in
        // DM Sans the caps start about 4px below the top of the line box.
        // Aligned to the box, the chip looks like it floats above the name.
        <div className={cn("justify-self-end leading-none mt-1")}>
          <div className={cn("flex flex-col gap-1")}>
            {tickers.map((ticker, i) => {
              const segments = tickerSegments?.[i];
              return (
                <p
                  key={ticker}
                  className={cn(
                    "inline-block type-chip",
                    // The selected row's ticker picks up the accent too, so the
                    // whole row reads as selected rather than just its left edge.
                    active && "bg-primary text-primary-foreground border-primary",
                  )}
                >
                  {!active && hasHighlight(segments) && segments ? (
                    <Highlighted segments={segments} tinted={false} />
                  ) : (
                    // A selected row shows no match cue on its ticker: the solid
                    // accent chip, the row's accent border, and the highlighted
                    // title already explain the hit, and an underline on three
                    // characters inside the filled pill only reads as noise.
                    ticker
                  )}
                </p>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
