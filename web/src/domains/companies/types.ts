/**
 * View model for the one company-detail section that still renders illustrative
 * data — Holders.
 *
 * This is NOT a domain type. The real, cited version lives in `@/types/domain`
 * as `HistoricShareholder`; it retires when the shareholder-tracker processor
 * lands and the section switches to the domain model. The Corporate Tree and
 * Commercial Debt already made that move — they read
 * `CurrentCorporateRelationship` and `CurrentCommercialDebt` from the domain
 * model.
 */

/**
 * A single institutional or sovereign shareholder disclosed via 13-F/13-G.
 */
export interface Shareholder {
  name: string;
  type: string;
  country: string;
  stakePct: number;
  deltaPct: number;
  valueUsd: number;
}


/**
 * The illustrative payload for the one company-detail section that has no
 * processor yet. Produced by `mock-sections.ts`; every field is sample data, and
 * `shareholdersSource` says so where it renders.
 */
export interface MockSections {
  shareholders: Shareholder[];
  shareholdersSource: string;
}
