import {
  type MatchSegment,
  matchName,
  matchSubsidiaries,
  type SubsidiaryMatch,
} from "@/lib/match-subsidiaries";
import type { PagefindWordLocation } from "@/types/pagefind";

/**
 * The indexed fields of a company page, in the exact order the hidden
 * `PagefindIndex` block emits them (see `app/companies/[id]/page.tsx`). Each
 * field contributes zero or more whitespace-delimited words to the fragment's
 * `content`, and a matched word's `location` is an index into
 * `content.split(/\s+/)`. This module maps a location back to the field — and,
 * within `subsidiaries`, back to the specific name — that Pagefind matched.
 *
 * Why this exists: Pagefind reports *that* a page matched and *where* in the
 * concatenated body, but not which of the six fields that position belongs to.
 * `matchSubsidiaries`/`matchName` re-derive the hit from the query text and so
 * miss anything Pagefind found through its stemmer (searching `ande` returns a
 * company on the subsidiary `Andaz`, which is neither a prefix of nor an
 * inflection of `ande`). The engine's own `weighted_locations` do not miss it —
 * this reads them, and layers the query-derived highlight over the top so the
 * common case keeps its tighter segmentation.
 */
export type CompanyField =
  | "permId"
  | "name"
  | "country"
  | "ticker"
  | "sectors"
  | "subsidiaries";

/** The field values as indexed, already parsed out of the Pagefind meta. */
export type IndexedFieldValues = {
  permId: string;
  name: string;
  country: string;
  /** One entry per ticker; joined with " " in the index. */
  tickers: string[];
  /** Most-specific-first; joined with " " in the index. */
  sectors: string[];
  /** Disclosure order; joined with ". " in the index. */
  subsidiaries: string[];
};

export type FieldMatch = {
  /**
   * `false` when the reconstructed word count disagrees with the fragment's, so
   * the region boundaries cannot be trusted. Everything below then falls back to
   * the query-derived highlight alone, and `hint` degrades to a vague cue rather
   * than naming a field — the same honesty stance as the length guard in
   * `match-subsidiaries`.
   */
  reliable: boolean;
  /** Which fields held at least one matched word (before the noise filter). */
  fields: Set<CompanyField>;
  /**
   * The PermID, segmented. Off-row like a subsidiary, so a caller shows it on
   * its own labeled line only when it is what the row matched on.
   */
  permId: MatchSegment[];
  /** The company name, segmented for highlighting. Always present. */
  name: MatchSegment[];
  /** HQ country, segmented. */
  country: MatchSegment[];
  /** The displayed (first) sector, segmented. A hit in a non-primary sector is
   *  attributed to `fields` but not highlighted, since that value is off-row. */
  sector: MatchSegment[];
  /** One segmented run per ticker, in `values.tickers` order. */
  tickers: MatchSegment[][];
  /** The subsidiaries that explain the hit, pre-segmented, in disclosure order. */
  subsidiaries: SubsidiaryMatch[];
  /**
   * An honest one-line cue for a row nothing visible on it explains — a hit on
   * the off-row PermID, a subsidiary hit too short to name, or an untrustworthy
   * reconstruction. Absent when a highlight or subsidiary line already says why.
   */
  hint?: string;
};

/**
 * The shortest matched word worth highlighting off Pagefind's locations.
 * Pagefind stems the query, so `ande` matches both the meaningful
 * `Andaz`/`Andares` (length ≥ 5) and the connector `and` (length 3) buried in
 * dozens of names. Four keeps the former and drops the latter; it mirrors
 * `MIN_SHORT_WORD` in `match-subsidiaries`. It only gates the *location-derived*
 * fallback — a short but legitimate query (`hp` → ticker `H`, `spa` → `Spa`) is
 * matched by the query-derived pass first and never reaches this floor.
 */
const MIN_MATCH_WORD = 4;

const WORD = /[\p{L}\p{N}]+/u;
const WHITESPACE = /\s/;

/**
 * Words the way Pagefind counts them: whitespace-delimited, empties dropped.
 *
 * Counts without materializing the split array, so it stays cheap on the
 * ~1,300-word `content` of a large company page — the reliability guard calls it
 * on that whole string every render. Leading and trailing whitespace is trimmed
 * first, so a fragment that arrives padded does not inflate the count and flip
 * `reliable` to false.
 */
function countWords(value: string): number {
  const trimmed = value.trim();
  if (trimmed === "") return 0;
  // Trimmed, so the string starts and ends on a non-space: the token count is
  // one plus the number of internal whitespace runs.
  let count = 1;
  let prevWasSpace = false;
  for (let i = 0; i < trimmed.length; i++) {
    const isSpace = WHITESPACE.test(trimmed[i]);
    if (isSpace && !prevWasSpace) count += 1;
    prevWasSpace = isSpace;
  }
  return count;
}

/** The alphanumeric core of a token, for the length filter (`"ANDARES,"` → 7). */
function coreLength(token: string): number {
  return token.match(WORD)?.[0].length ?? 0;
}

/**
 * A value split into runs with the given word positions marked. Positions are
 * word indices within the value (0-based over whitespace-delimited words), which
 * is what a location resolves to once its region offset is subtracted.
 */
function segmentByWord(value: string, matched: Set<number>): MatchSegment[] {
  const parts = value.split(/(\s+)/);
  const segments: MatchSegment[] = [];
  let wordIndex = 0;
  for (const part of parts) {
    if (part === "") continue;
    if (/^\s+$/.test(part)) {
      segments.push({ text: part, matched: false });
      continue;
    }
    segments.push({ text: part, matched: matched.has(wordIndex) });
    wordIndex += 1;
  }
  return segments;
}

/** The location-derived segments for a single value, dropping short noise. */
function noiseFiltered(value: string, hits: Set<number>): MatchSegment[] | null {
  const words = value.split(/\s+/);
  const kept = new Set<number>();
  for (const i of hits) {
    if (coreLength(words[i] ?? "") >= MIN_MATCH_WORD) kept.add(i);
  }
  return kept.size === 0 ? null : segmentByWord(value, kept);
}

/**
 * Segments for one displayed value: the query-derived highlight if it found
 * anything (it carries the tighter prefix/inflection segmentation), otherwise
 * the location-derived one for a stemmed hit the query text could not re-derive,
 * otherwise the plain value.
 */
function layer(
  query: string,
  value: string,
  hits: Set<number>,
): MatchSegment[] {
  const queryDerived = matchName(query, value);
  if (queryDerived.some((s) => s.matched)) return queryDerived;
  return noiseFiltered(value, hits) ?? [{ text: value, matched: false }];
}

/** The all-plain result: every value one unmatched run, nothing attributed. */
function plainFieldMatch(
  values: IndexedFieldValues,
  sector0: string,
): FieldMatch {
  const plain = (text: string): MatchSegment[] => [{ text, matched: false }];
  return {
    reliable: true,
    fields: new Set(),
    permId: plain(values.permId),
    name: plain(values.name),
    country: plain(values.country),
    sector: plain(sector0),
    tickers: values.tickers.map(plain),
    subsidiaries: [],
    hint: undefined,
  };
}

/**
 * Which indexed fields a Pagefind result matched, with each displayed value
 * segmented for highlighting, derived from the fragment's `weighted_locations`
 * rather than re-run against the query.
 *
 * Region boundaries are reconstructed from the field values in index order. If
 * that reconstruction does not total the fragment's own word count, the location
 * data is discarded (`reliable: false`) and every field falls back to its
 * query-derived highlight.
 */
export function matchFields(
  query: string,
  content: string,
  weightedLocations: PagefindWordLocation[],
  values: IndexedFieldValues,
): FieldMatch {
  const sector0 = values.sectors[0] ?? "";

  // The empty-query browse has nothing to attribute: Pagefind returns every page
  // with no weighted locations, and there is no query to derive a highlight
  // from. Skip the offset reconstruction — which splits `content` and counts
  // words across every subsidiary — and hand back the plain shape. Guarded on
  // both so a term search that happens to return no locations still runs the
  // query-derived pass below.
  if (weightedLocations.length === 0 && query.trim() === "") {
    return plainFieldMatch(values, sector0);
  }

  // Cumulative word offsets, in the order PagefindIndex emits the fields.
  const nPerm = countWords(values.permId);
  const nName = countWords(values.name);
  const nCountry = countWords(values.country);
  const nTicker = countWords(values.tickers.join(" "));
  const nSectors = countWords(values.sectors.join(" "));

  const nameStart = nPerm;
  const countryStart = nameStart + nName;
  const tickerStart = countryStart + nCountry;
  const sectorsStart = tickerStart + nTicker;
  const subsStart = sectorsStart + nSectors;

  const subWordCounts = values.subsidiaries.map(countWords);
  const subStarts: number[] = [];
  let cursor = subsStart;
  for (const count of subWordCounts) {
    subStarts.push(cursor);
    cursor += count;
  }
  const reliable = cursor === countWords(content);

  // Per-region matched word indices, local to each region's value.
  const fields = new Set<CompanyField>();
  const permIdHits = new Set<number>();
  const nameHits = new Set<number>();
  const countryHits = new Set<number>();
  const sectorHits = new Set<number>();
  const tickerHits = new Set<number>();
  const subHits = new Map<number, Set<number>>();

  if (reliable) {
    for (const { location } of weightedLocations) {
      if (location < nameStart) {
        fields.add("permId");
        permIdHits.add(location);
      } else if (location < countryStart) {
        fields.add("name");
        nameHits.add(location - nameStart);
      } else if (location < tickerStart) {
        fields.add("country");
        countryHits.add(location - countryStart);
      } else if (location < sectorsStart) {
        fields.add("ticker");
        tickerHits.add(location - tickerStart);
      } else if (location < subsStart) {
        fields.add("sectors");
        sectorHits.add(location - sectorsStart);
      } else {
        fields.add("subsidiaries");
        let lo = 0;
        let hi = subStarts.length - 1;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          if (subStarts[mid] <= location) lo = mid;
          else hi = mid - 1;
        }
        const bucket = subHits.get(lo) ?? new Set<number>();
        bucket.add(location - subStarts[lo]);
        subHits.set(lo, bucket);
      }
    }
  }

  // Displayed values, query-derived highlight layered over location-derived.
  const permId = layer(query, values.permId, permIdHits);
  const name = layer(query, values.name, nameHits);
  const country = layer(query, values.country, countryHits);
  // Only the first sector is on the row; keep hits that land within it.
  const sector0Words = countWords(sector0);
  const sector0Hits = new Set(
    [...sectorHits].filter((i) => i < sector0Words),
  );
  const sector = layer(query, sector0, sector0Hits);

  // Map ticker-region hits back to each ticker's own word indices.
  const tickerRanges: Array<[number, number]> = [];
  let tStart = 0;
  for (const ticker of values.tickers) {
    const c = countWords(ticker);
    tickerRanges.push([tStart, tStart + c]);
    tStart += c;
  }
  const tickers = values.tickers.map((ticker, i) => {
    const [start, end] = tickerRanges[i];
    const local = new Set(
      [...tickerHits].filter((h) => h >= start && h < end).map((h) => h - start),
    );
    return layer(query, ticker, local);
  });

  // Subsidiaries: query-derived first, location-derived for stemmed misses.
  const querySubs = matchSubsidiaries(query, values.subsidiaries);
  const locationSubs: SubsidiaryMatch[] = [];
  for (let i = 0; i < values.subsidiaries.length; i++) {
    const hits = subHits.get(i);
    if (!hits) continue;
    const segments = noiseFiltered(values.subsidiaries[i], hits);
    if (!segments) continue;
    locationSubs.push({ name: values.subsidiaries[i], segments });
  }
  const subsidiaries = querySubs.length > 0 ? querySubs : locationSubs;

  const explained =
    subsidiaries.length > 0 ||
    permId.some((s) => s.matched) ||
    name.some((s) => s.matched) ||
    country.some((s) => s.matched) ||
    sector.some((s) => s.matched) ||
    tickers.some((t) => t.some((s) => s.matched));

  return {
    reliable,
    fields,
    permId,
    name,
    country,
    sector,
    tickers,
    subsidiaries,
    hint: matchHint(query.trim() !== "", explained, reliable, fields),
  };
}

/**
 * The honest cue for a row nothing visible on it explains. `undefined` when the
 * row already shows its reason — a highlighted field, a subsidiary line, or the
 * PermID line — or when the hit is on a field the row displays anyway.
 *
 * A hit reaches the field-specific branches only when `explained` is false, i.e.
 * nothing the row displays lit up. That happens for a subsidiary too short to
 * name, but also for a hit in a field whose *displayed* value did not highlight:
 * a non-primary sector (only `sectors[0]` is on the row) or a ticker that stemmed
 * without the query text re-deriving it. Each earns a cue naming its field rather
 * than leaving the row silent — the anti-goal this module exists to prevent. An
 * untrustworthy reconstruction degrades to a vague "indirect match".
 */
function matchHint(
  hasQuery: boolean,
  explained: boolean,
  reliable: boolean,
  fields: Set<CompanyField>,
): string | undefined {
  if (!hasQuery || explained) return undefined;
  if (!reliable) return "indirect match";
  if (fields.has("subsidiaries")) return "matched a subsidiary";
  if (fields.has("sectors")) return "matched a sector";
  if (fields.has("ticker")) return "matched a ticker";
  return undefined;
}
