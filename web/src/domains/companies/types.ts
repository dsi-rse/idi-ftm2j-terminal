/**
 * View models for the company-detail sections that still render illustrative
 * data — Corporate Tree, Holders, and Debt.
 *
 * These are NOT domain types. The real, cited versions of these concepts live
 * in `@/types/domain` as `CorporateRelationship`, `HistoricShareholder`, and
 * `HistoricCommercialDebt`; each type here retires when its processor lands and
 * its section switches to the domain model.
 */

/**
 * A single entity in the corporate tree. `depth` is the indentation level;
 * 0 is the root registrant, positive integers indicate descendants.
 */
export interface TreeEntity {
  name: string;
  country: string;
  countryCode?: string;
  depth: number;
}

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
 * A single commercial debt instrument disclosed via EDGAR 8-K or SDC
 * Platinum.
 */
export interface DebtInstrument {
  lender: string;
  syndication: "syndicated" | "bilateral";
  currency: string;
  instrument: string;
  rate: string;
  rateType: "floating" | "fixed";
  maturity: string;
  amountUsd: number;
}

/**
 * The illustrative payload for the three company-detail sections that have no
 * processor yet. Produced by `mock-sections.ts`; every field is sample data, and
 * the `*Source` strings say so where they render.
 */
export interface MockSections {
  tree: TreeEntity[];
  shareholders: Shareholder[];
  debtInstruments: DebtInstrument[];
  treeSource: string;
  shareholdersSource: string;
  debtSource: string;
}
