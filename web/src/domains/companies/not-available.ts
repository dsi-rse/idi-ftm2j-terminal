/**
 * Shown wherever a company fact, identifier or count has no value. "Not
 * available" rather than "Not reported": a gap is usually ours, not the
 * company's. Apple reports revenue in every 10-K, but the company-facts
 * processor does not cover it yet, so "not reported" would be false. Company
 * info is sparse too (some companies have no industry or ticker), so this is a
 * normal state, not an error.
 *
 * One constant for the whole company page, so the wording and its reason
 * cannot drift apart between sections.
 */
export const NOT_AVAILABLE = "Not available";
