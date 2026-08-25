/**
 * Strips diacritics from a string, leaving the base letters — `"Panamá"` →
 * `"Panama"`, `"Farmacéutica"` → `"Farmaceutica"`.
 *
 * Pagefind does no diacritic folding of its own: against a page containing
 * `"Panamá"`, a search for `"Panama"` returns nothing. The index and the query
 * are therefore both folded through this function, which is the only reason a
 * reader who types ASCII finds the 751 subsidiary names that carry an accent.
 * Both callers matter — folding one side and not the other breaks search rather
 * than improving it.
 *
 * Only nonspacing marks are removed. Letters that NFD does not decompose —
 * `ß`, `ł`, `ı`, `Þ` — survive untouched, so the 18 names in the dataset that
 * use them are still only reachable by typing them. Transliterating those is a
 * different and much larger problem than dropping accents.
 *
 * The fold is one code point in, one code point out for every value this site
 * indexes: all 82,682 of them are already NFC, and none changes length when
 * folded. `match-subsidiaries.ts` maps offsets computed on the folded string
 * back onto the original and depends on that, so a change here that folds
 * anything to a different length has to be made there too.
 */
export function foldDiacritics(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .normalize("NFC");
}
