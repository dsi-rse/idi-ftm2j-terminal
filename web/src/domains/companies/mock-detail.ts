import type {
  CompanyData,
  CompanyDetail,
  DebtInstrument,
  OverviewBullet,
  Shareholder,
  TreeEntity,
} from "./types";

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

const INDUSTRY_MAP: Record<string, string> = {
  Banking: "Banking",
  "Financial Services": "Financial Services",
  Mining: "Mining & Metals",
  "Natural Resources": "Natural Resources",
  Oil: "Oil & Gas",
  Energy: "Oil & Gas",
};

function inferIndustry(sectors: string[]): string {
  for (const sector of sectors) {
    if (INDUSTRY_MAP[sector]) return INDUSTRY_MAP[sector];
  }
  return sectors[0] ?? "Diversified";
}

function makeOverviewBullets(
  rng: () => number,
  base: CompanyData,
  primaryIndustry: string,
  marketCapUsd: number,
  revenueUsd: number,
  employees: number,
  treeCount: number,
  shareholderTop: string,
  topStake: number,
  totalDebt: number,
  debtInstrumentCount: number,
): OverviewBullet[] {
  const bullets: OverviewBullet[] = [
    {
      label: "Business",
      text: `${base.country}-based ${primaryIndustry.toLowerCase()} operator with disclosed footprint across ${1 + Math.floor(rng() * 40)}+ countries.`,
    },
    {
      label: "Headquarters",
      text: `Domiciled and incorporated in ${base.country}${base.tickers[0] ? `; listed as ${base.tickers[0]}.` : "."}`,
    },
    {
      label: "Scale",
      text: `${formatUsdShort(revenueUsd)} revenue · ${formatUsdShort(marketCapUsd)} market cap · ${employees.toLocaleString()} employees.`,
    },
    {
      label: "Structure",
      text: `${treeCount} entities in the reconciled ownership tree${base.subsidiaries.length ? `, including ${base.subsidiaries.slice(0, 3).join(", ")}.` : "."}`,
    },
    {
      label: "Ownership",
      text: `${shareholderTop} holds the largest disclosed stake (${topStake.toFixed(2)}%); other institutional holders follow per 13-F filings.`,
    },
    {
      label: "Commercial debt",
      text: `${formatUsdShort(totalDebt)} outstanding across ${debtInstrumentCount} instruments — revolving facilities, term loans, and senior notes.`,
    },
  ];
  const flaggedPool: OverviewBullet[] = [
    {
      label: "Environmental",
      text: "Regional operations flagged for air-quality and water-rights disputes.",
      flag: "environmental",
    },
    {
      label: "Human Rights",
      text: "Civil society allegations of forced displacement near active mining operations.",
      flag: "human-rights",
    },
    {
      label: "Governance",
      text: "Historical settlement with DOJ and UK SFO over bribery-related charges.",
      flag: "governance",
    },
  ];
  const flaggedCount = 1 + Math.floor(rng() * flaggedPool.length);
  return [...bullets, ...flaggedPool.slice(0, flaggedCount)];
}

function makeTree(
  rng: () => number,
  base: CompanyData,
  countryPool: ReadonlyArray<{ name: string; country: string }>,
): TreeEntity[] {
  const root: TreeEntity = {
    name: base.name,
    country: base.country,
    countryCode: base.countryCode,
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
    const name = base.subsidiaries[i] ?? `${base.name.split(" ")[0]} ${suffix}`;
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

function formatUsdShort(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(value >= 10e9 ? 1 : 2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${value.toLocaleString()}`;
}

/**
 * Build a deterministic, illustrative {@link CompanyDetail} from the base
 * {@link CompanyData} record. The same input `permId` yields the same
 * output — safe for static generation.
 *
 * Kept isolated in one file so it can be ripped out cleanly once the real
 * pipeline emits shareholders/debt/tree data.
 */
export function getMockCompanyDetail(base: CompanyData): CompanyDetail {
  const rng = makeRng(base.permId);
  const primaryIndustry = inferIndustry(base.sectors);
  const marketCapUsd = between(rng, 5e9, 200e9);
  const revenueUsd = between(rng, 3e9, 300e9);
  const employees = Math.floor(between(rng, 5_000, 250_000));
  const shareholders = makeShareholders(rng);
  const tree = makeTree(rng, base, HOLDER_POOL);
  const debtInstruments = makeDebtInstruments(rng);
  const totalDebt = debtInstruments.reduce((s, d) => s + d.amountUsd, 0);
  const overviewBullets = makeOverviewBullets(
    rng,
    base,
    primaryIndustry,
    marketCapUsd,
    revenueUsd,
    employees,
    tree.length,
    shareholders[0].name,
    shareholders[0].stakePct,
    totalDebt,
    debtInstruments.length,
  );
  const today = new Date();
  const reconciledAt = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  return {
    ...base,
    headquarters: base.country,
    primaryIndustry,
    marketCapUsd,
    marketCapAsOf: reconciledAt,
    revenueUsd,
    revenueFiscalYearEnd: `${today.getFullYear() - 1}-12-31`,
    employees,
    reconciledAt,
    overviewBullets,
    tree,
    shareholders,
    debtInstruments,
    overviewSource:
      "Synthesized from company facts, the reconciled ownership graph, SEC 13-F holdings, and FTM2J accountability flags. Figures are illustrative for this mock.",
    treeSource:
      "Corporate tree synthesized from ownership graph + EDGAR Exhibit 21 (subsidiaries of registrant) filings, last reconciled with the most recent disclosed filings.",
    shareholdersSource:
      "Aggregated from SEC Form 13-F filings (Q4 2025), supplemented by 13-D / 13-G beneficial ownership filings and SC 13G/A amendments. Sovereign holdings via national disclosure registries where available.",
    debtSource:
      "Bond filings via EDGAR (8-K material event notices), syndicated loan announcements via SDC Platinum, and supplemented from annual report debt schedules. Private debt may not be reflected.",
  };
}

/**
 * Format a large USD figure with a short suffix (`$56.4B`, `$217M`).
 */
export const formatUsdShortValue = formatUsdShort;
