/**
 * The raw company record as it appears in the input JSON payload (see
 * `data/output/companies.json`). This is the minimal shape driving static
 * generation and Pagefind indexing.
 */
export interface CompanyData {
  permId: string;
  lei?: string;
  name: string;
  country: string;
  countryCode: string;
  url?: string;
  tickers: string[];
  subsidiaries: string[];
  sectors: string[];
}

/**
 * A single Overview bullet on the company detail page. `flag` colors the
 * bullet marker to signal a category (Environmental, Human Rights, Governance).
 */
export interface OverviewBullet {
  label: string;
  text: string;
  flag?: "environmental" | "human-rights" | "governance";
}

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
 * The full company detail payload rendered on the detail page. Extends the
 * raw {@link CompanyData} with illustrative fields (headquarters stats,
 * shareholders, debt, corporate tree, overview bullets).
 */
export interface CompanyDetail extends CompanyData {
  headquarters: string;
  primaryIndustry: string;
  marketCapUsd: number;
  marketCapAsOf: string;
  revenueUsd: number;
  revenueFiscalYearEnd: string;
  employees: number;
  reconciledAt: string;
  overviewBullets: OverviewBullet[];
  tree: TreeEntity[];
  shareholders: Shareholder[];
  debtInstruments: DebtInstrument[];
  overviewSource?: string;
  treeSource?: string;
  shareholdersSource?: string;
  debtSource?: string;
}
