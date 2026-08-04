/**
 * View models for the company-detail sections that still render illustrative
 * data — Holders and Debt.
 *
 * These are NOT domain types. The real, cited versions of these concepts live
 * in `@/types/domain` as `HistoricShareholder` and `HistoricCommercialDebt`;
 * each type here retires when its processor lands and its section switches to
 * the domain model. The Corporate Tree already made that move — it reads
 * `CurrentCorporateRelationship` from the domain model.
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
 * The illustrative payload for the two company-detail sections that have no
 * processor yet. Produced by `mock-sections.ts`; every field is sample data, and
 * the `*Source` strings say so where they render.
 */
export interface MockSections {
  shareholders: Shareholder[];
  debtInstruments: DebtInstrument[];
  shareholdersSource: string;
  debtSource: string;
}
