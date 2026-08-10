import type { Company } from "@/types/domain";

import type { DebtInstrument, MockSections, Shareholder, TreeEntity } from "./types";

/**
 * Illustrative data for the three company-detail sections whose processors do
 * not exist yet: Corporate Tree, Holders, and Debt.
 *
 * NOTHING IN THIS FILE IS REAL. It exists so the page layout can be reviewed
 * before the corporate-structure, shareholder-tracker, and CDT processors
 * land, and every section that renders it says so in its source footer. Delete
 * each generator as its processor ships — do not extend this file to cover new
 * fields.
 *
 * Company info (name, industry, country, ticker, exchange) is real and comes
 * from the pipeline; it is deliberately absent here.
 */

/**
 * Deterministic pseudo-random helpers. Everything below is derived from a
 * single string seed (the company `permId`) so the same company always
 * renders the same illustrative payload across builds and requests.
 */
function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed: string) {
  let state = hashSeed(seed);
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function between(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

const HOLDER_TYPES = [
  "SOVEREIGN / ASSET MGR",
  "INSTITUTIONAL",
  "ASSET MGR",
  "PENSION FUND",
  "MUTUAL FUND",
] as const;

const HOLDER_POOL: ReadonlyArray<{ name: string; country: string }> = [
  { name: "Qatar Holding LLC", country: "Qatar" },
  { name: "BlackRock, Inc.", country: "United States" },
  { name: "The Vanguard Group, Inc.", country: "United States" },
  { name: "Norges Bank Investment Mgmt", country: "Norway" },
  { name: "State Street Global Advisors", country: "United States" },
  { name: "Capital Research & Mgmt", country: "United States" },
  { name: "Fidelity Management & Research", country: "United States" },
  { name: "GIC Private Limited", country: "Singapore" },
  { name: "Abu Dhabi Investment Authority", country: "United Arab Emirates" },
  { name: "Public Investment Fund", country: "Saudi Arabia" },
];

const LENDER_POOL: ReadonlyArray<string> = [
  "JPMorgan Chase Bank, N.A.",
  "Citibank, N.A.",
  "Sumitomo Mitsui Banking Corp.",
  "BNP Paribas S.A.",
  "HSBC Holdings plc",
  "Deutsche Bank AG",
  "Barclays Bank PLC",
  "Bank of America, N.A.",
];

const INSTRUMENTS = [
  "Revolving Credit Facility",
  "Term Loan",
  "Senior Unsecured Notes",
  "Trade Finance Facility",
  "Bridge Loan",
] as const;

const ILLUSTRATIVE = "Illustrative sample data — not sourced from any filing.";

function makeTree(
  rng: () => number,
  company: Company,
  countryPool: ReadonlyArray<{ name: string; country: string }>,
): TreeEntity[] {
  const rootName = company.name;
  const root: TreeEntity = {
    name: rootName,
    country: company.hqCountry ?? "",
    depth: 0,
  };
  const rootCount = 4 + Math.floor(rng() * 4);
  const entities: TreeEntity[] = [root];
  for (let i = 0; i < rootCount; i++) {
    const country = pick(rng, countryPool);
    const suffix = pick(rng, [
      "Holdings",
      "Corp",
      "Mines Ltd",
      "Trading SA",
      "Energy",
      "Resources",
      "Agriculture",
    ]);
    const name = `${rootName.split(" ")[0]} ${suffix}`;
    entities.push({ name, country: country.country, depth: 1 });
    const childCount = Math.floor(rng() * 3);
    for (let j = 0; j < childCount; j++) {
      const child = pick(rng, countryPool);
      const childName = `${name.split(" ")[0]} ${pick(rng, [
        "Mining Ltd",
        "Sarl",
        "Plc",
        "Coal Limited",
        "Copper Mines",
      ])}`;
      entities.push({ name: childName, country: child.country, depth: 2 });
    }
  }
  return entities;
}

function makeShareholders(rng: () => number): Shareholder[] {
  const count = 6 + Math.floor(rng() * 4);
  const shuffled = [...HOLDER_POOL].sort(() => rng() - 0.5).slice(0, count);
  const shareholders = shuffled.map((holder, i) => {
    const stakePct = between(rng, 0.5, i === 0 ? 9 : 6);
    const deltaPct = between(rng, -0.5, 0.6);
    const valueUsd = stakePct * between(rng, 400e6, 800e6);
    return {
      name: holder.name,
      type: pick(rng, HOLDER_TYPES),
      country: holder.country,
      stakePct,
      deltaPct,
      valueUsd,
    };
  });
  return shareholders.sort((a, b) => b.stakePct - a.stakePct);
}

function makeDebtInstruments(rng: () => number): DebtInstrument[] {
  const count = 5 + Math.floor(rng() * 3);
  const shuffled = [...LENDER_POOL].sort(() => rng() - 0.5).slice(0, count);
  return shuffled.map((lender) => {
    const instrument = pick(rng, INSTRUMENTS);
    const rateType: "floating" | "fixed" =
      instrument === "Senior Unsecured Notes" || rng() < 0.35
        ? "fixed"
        : "floating";
    const rate =
      rateType === "fixed"
        ? `${between(rng, 4.25, 6.5).toFixed(3)}% fixed`
        : `SOFR + ${between(rng, 0.75, 1.9).toFixed(2)}%`;
    const maturityYear = 2026 + Math.floor(rng() * 8);
    const maturityMonth = 1 + Math.floor(rng() * 12);
    const maturityDay = 1 + Math.floor(rng() * 28);
    const maturity = `${maturityYear}-${String(maturityMonth).padStart(2, "0")}-${String(maturityDay).padStart(2, "0")}`;
    return {
      lender,
      syndication: rng() < 0.75 ? "syndicated" : "bilateral",
      currency: "USD",
      instrument,
      rate,
      rateType,
      maturity,
      amountUsd: between(rng, 300e6, 3.2e9),
    };
  });
}

/**
 * Build the deterministic, illustrative payload for the Tree, Holders, and
 * Debt sections. Seeded from `permId`, so the same company always renders the
 * same sample — safe for static generation.
 */
export function getMockSections(company: Company): MockSections {
  const rng = makeRng(company.permId);
  return {
    tree: makeTree(rng, company, HOLDER_POOL),
    shareholders: makeShareholders(rng),
    debtInstruments: makeDebtInstruments(rng),
    treeSource: `${ILLUSTRATIVE} Real subsidiaries will come from EDGAR Exhibit 21 via the corporate-structure processor.`,
    shareholdersSource: `${ILLUSTRATIVE} Real holdings will come from SEC Form 13-F via the shareholder-tracker processor.`,
    debtSource: `${ILLUSTRATIVE} Real instruments will come from SEC 8-K filings via the CDT processor.`,
  };
}
