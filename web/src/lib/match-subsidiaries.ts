import { foldDiacritics } from "@/lib/fold-diacritics";

/**
 * One run of a subsidiary name, flagged by whether the query hit it. A caller
 * renders the matched runs however its surface highlights things — this module
 * deliberately returns data rather than markup, because its two consumers sit in
 * `components/` and `domains/` and a shared component would violate the import
 * rules that keep those layers apart.
 */
export type MatchSegment = {
  text: string;
  matched: boolean;
};

export type SubsidiaryMatch = {
  /** The name exactly as disclosed, accents and punctuation intact. */
  name: string;
  /**
   * `name` split into consecutive runs. Concatenating every `text` reproduces
   * `name` exactly. A single unmatched run means "show this name, highlight
   * nothing" — see the offset guard in `segment`.
   */
  segments: MatchSegment[];
};

const WORD = /[\p{L}\p{N}]+/gu;

/**
 * Guards on matching a name word that is *shorter* than the query token — see
 * `wordRanges`.
 *
 * `MIN_SHORT_WORD` keeps a two- or three-letter word from matching a long token:
 * without it, `de` would explain a name containing a bare `d`.
 * `MAX_SHORTFALL` of one character confines the rule to inflection — `medicos`
 * against `Medico`, `connections` against `connection`. At two it would let
 * `farmac` explain a name containing `Farm`, which Pagefind would never have
 * matched, and the row would then blame the wrong subsidiary.
 */
const MIN_SHORT_WORD = 4;
const MAX_SHORTFALL = 1;

/**
 * Search-normalized form: folded first, then lowercased.
 *
 * That order is load-bearing. `"İ"` lowercases to `i` plus a combining dot —
 * two code points from one — which would shift every highlight offset after it
 * in the three names that use it. Folding first strips the dot, so lowercasing
 * only ever sees plain letters.
 */
function normalizeForMatch(value: string): string {
  return foldDiacritics(value).toLowerCase();
}

function tokenize(query: string): string[] {
  return normalizeForMatch(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * Where `token` matches inside `haystack`, as `[start, end)` ranges.
 *
 * The comparison is bidirectional at a word boundary: a word matches when the
 * token is a prefix of it, *or* when it is a prefix of the token.
 *
 * The first direction covers Pagefind's own prefix search — it matches a final
 * search term as a prefix, so typing `farmac` returns the page and the row has to
 * be able to point at `Farmacéutica`. Applying that to every token rather than
 * only the last is deliberately looser than Pagefind, which is the safe direction
 * when the job is to explain a result the engine already returned.
 *
 * The second direction exists because Pagefind also matches words *shorter* than
 * the token, which one-directional prefixing cannot see. Searching `medicos`
 * returns Acelity LP Inc on the strength of `Medico-Hospitalares`; without this,
 * that row rendered as though the company itself matched, which is a claim the
 * data does not support. It is fenced by `MIN_SHORT_WORD` and `MAX_SHORTFALL` so
 * it stays inflection rather than becoming fuzzy matching.
 *
 * Note the word here is the run of letters and digits only, so `Medico` is the
 * word in `Medico-Hospitalares` — the hyphen ends it.
 */
function wordRanges(haystack: string, token: string): [number, number][] {
  const ranges: [number, number][] = [];
  for (const match of haystack.matchAll(WORD)) {
    const word = match[0];
    const at = match.index;
    if (word.startsWith(token)) {
      ranges.push([at, at + token.length]);
      continue;
    }
    if (
      token.startsWith(word) &&
      word.length >= MIN_SHORT_WORD &&
      token.length - word.length <= MAX_SHORTFALL
    ) {
      ranges.push([at, at + word.length]);
    }
  }
  return ranges;
}

/** Merges overlapping and touching ranges so segments never interleave. */
function mergeRanges(ranges: [number, number][]): [number, number][] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
      continue;
    }
    merged.push([start, end]);
  }
  return merged;
}

function segment(name: string, ranges: [number, number][]): MatchSegment[] {
  // Offsets were computed on the normalized string and are applied to the
  // original. That is sound only while normalization is one code point in, one
  // out — true for all 82,682 values this site indexes, none of which changes
  // length when folded. If some future input breaks that, showing the name
  // unhighlighted beats highlighting the wrong characters.
  if (normalizeForMatch(name).length !== name.length) {
    return [{ text: name, matched: false }];
  }
  const segments: MatchSegment[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) {
      segments.push({ text: name.slice(cursor, start), matched: false });
    }
    segments.push({ text: name.slice(start, end), matched: true });
    cursor = end;
  }
  if (cursor < name.length) {
    segments.push({ text: name.slice(cursor), matched: false });
  }
  return segments;
}

/**
 * Which of a company's subsidiaries explain why a query returned it.
 *
 * Pagefind says *that* a page matched, never which part of it did. A search for
 * `kellogg canada` returning Kellanova is opaque until the row can point at
 * "Kellogg Canada Inc." — so this re-derives the match client-side against the
 * `subsidiaries` metadata the page carries.
 *
 * Two passes, because Pagefind ANDs its terms across the *whole page* rather
 * than within one field:
 *
 * 1. Names matching every token. This is the common case and the precise one.
 * 2. If none do, names matching any token. `kellogg canada` is satisfied by
 *    `kellogg` in the company name and `canada` in a subsidiary, and no single
 *    name holds both — without this pass a returned row would explain nothing.
 *
 * An empty result means the query matched the company's own name, ticker, or
 * PermID, and the caller should render the row exactly as it did before
 * subsidiaries were indexed.
 *
 * It can still come back empty for a row Pagefind matched some other way, since
 * Pagefind's tokenizer is not reimplemented here — it will match `Medicon`
 * against `medicos`, which is neither a prefix relation nor an inflection. Such a
 * row degrades to its plain form rather than blaming a subsidiary it cannot
 * justify.
 *
 * Results keep the disclosure order they arrived in, so the lines read in the
 * order the filing lists them.
 */
export function matchSubsidiaries(
  query: string,
  subsidiaries: readonly string[] | undefined,
): SubsidiaryMatch[] {
  if (!subsidiaries?.length) return [];
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const all: SubsidiaryMatch[] = [];
  const any: SubsidiaryMatch[] = [];

  for (const name of subsidiaries) {
    const haystack = normalizeForMatch(name);
    const ranges: [number, number][] = [];
    let matchedTokens = 0;
    for (const token of tokens) {
      const hits = wordRanges(haystack, token);
      if (hits.length > 0) matchedTokens += 1;
      ranges.push(...hits);
    }
    if (matchedTokens === 0) continue;
    const match = { name, segments: segment(name, mergeRanges(ranges)) };
    if (matchedTokens === tokens.length) all.push(match);
    else any.push(match);
  }

  return all.length > 0 ? all : any;
}

/**
 * The company's own name, split into matched and unmatched runs for the same
 * highlight treatment a subsidiary line gets.
 *
 * Pagefind can return a company on its own name, and that name used to render
 * unhighlighted while its subsidiaries did not — leaving the *primary* reason a
 * row matched the one thing on it the reader could not see. This re-derives the
 * hit client-side with the exact rules `matchSubsidiaries` uses (`wordRanges`),
 * so "why did this match" reads the same whether the hit was the company or one
 * of its subsidiaries.
 *
 * Returns a single unmatched segment when nothing matches — the empty query, a
 * name Pagefind matched by some route these rules do not cover, or the
 * length-change guard in `segment` — so a caller can always map over the result
 * and a no-match name simply renders plain.
 */
export function matchName(query: string, name: string): MatchSegment[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [{ text: name, matched: false }];
  const haystack = normalizeForMatch(name);
  const ranges: [number, number][] = [];
  for (const token of tokens) {
    ranges.push(...wordRanges(haystack, token));
  }
  return segment(name, mergeRanges(ranges));
}

/**
 * How many characters of context to keep before the first hit. A subsidiary
 * name shows on one truncated line, so this is roughly "how far into the name
 * the match may sit before the front is elided" — small, because the row is
 * narrow and the point is to get the highlight on screen, not to preserve the
 * lead-in.
 */
const LEAD_BUDGET = 16;

/**
 * Repositions a segmented name so its first hit is visible on a single
 * truncated line.
 *
 * The match can sit deep in a long name — `Participacoes` in "1-800-Flowers.com
 * DO Brasil Participacoes LTD" — where CSS truncation drops it off the right
 * edge and the row reads as though it matched nothing. This trims whole words
 * off the *front* until the first hit is within `LEAD_BUDGET`, and reports a
 * `leadingEllipsis` the caller renders as "…". The tail still truncates with
 * CSS; whole words are kept (not a mid-word slice) so the surviving context
 * still reads.
 *
 * Callers keep the full, untrimmed name available to assistive tech (an sr-only
 * copy) — this only moves what a sighted reader sees into view, it does not
 * discard information. A name with no hit, or a hit already near the start,
 * comes back untouched and unflagged.
 */
export function windowToMatch(segments: MatchSegment[]): {
  segments: MatchSegment[];
  leadingEllipsis: boolean;
} {
  const first = segments.findIndex((s) => s.matched);
  if (first <= 0) return { segments, leadingEllipsis: false };

  const leading = segments
    .slice(0, first)
    .map((s) => s.text)
    .join("");
  if (leading.length <= LEAD_BUDGET) return { segments, leadingEllipsis: false };

  // Keep trailing whole words of the lead-in up to the budget. Splitting on the
  // separator (kept) means a word and the space after it stay together, so the
  // trimmed context does not begin mid-word.
  const parts = leading.split(/(\s+)/);
  let kept = "";
  for (let i = parts.length - 1; i >= 0; i--) {
    if (kept && kept.length + parts[i].length > LEAD_BUDGET) break;
    kept = parts[i] + kept;
  }
  return {
    segments: [
      { text: kept.replace(/^\s+/, ""), matched: false },
      ...segments.slice(first),
    ],
    leadingEllipsis: true,
  };
}
