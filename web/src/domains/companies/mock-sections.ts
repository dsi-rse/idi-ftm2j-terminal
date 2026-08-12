import type { Company } from "@/types/domain";

import type { MockSections, Shareholder } from "./types";

/**
 * Illustrative data for the one company-detail section whose processor does not
 * exist yet: Holders.
 *
 * NOTHING IN THIS FILE IS REAL. It exists so the page layout can be reviewed
 * before the shareholder-tracker processor lands, and the section that renders
 * it says so in its source footer. Delete the generator as that processor
 * ships — do not extend this file to cover new fields.
 *
 * Company info, the corporate tree, and commercial debt are real and come from
 * the pipeline; they are deliberately absent here.
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



const ILLUSTRATIVE = "Illustrative sample data — not sourced from any filing.";

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


/**
 * Build the deterministic, illustrative payload for the Holders section. Seeded
 * from `permId`, so the same company always renders the same sample — safe for
 * static generation.
 */
export function getMockSections(company: Company): MockSections {
  const rng = makeRng(company.permId);
  return {
    shareholders: makeShareholders(rng),
    shareholdersSource: `${ILLUSTRATIVE} Real holdings will come from SEC Form 13-F via the shareholder-tracker processor.`,
  };
}
