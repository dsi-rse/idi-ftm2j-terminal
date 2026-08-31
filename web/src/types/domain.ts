/**
 * The FTM2J domain model. `Company` is the central concept — everything else
 * here either identifies a company, cites a fact about one, or describes a
 * relationship between two.
 *
 * **Serialization.** These types describe records as they exist *after*
 * `JSON.parse`. The site is statically generated and reads its data from
 * `INPUT_DATA_FILE_PATH` at build time, so there are no `Date` or `URL`
 * instances anywhere in this file — every date is an ISO-8601 string and every
 * URL is a plain string. Declaring them otherwise would type-check while being
 * false at runtime.
 *
 * **Provenance.** Every substantive fact carries `sources`. FTM2J is a
 * research tool for advocacy; an uncited claim is not usable, so the type
 * system requires the citation rather than trusting callers to remember it.
 *
 * **Current state vs. history.** Some sources (LSEG PermID) report only what
 * is true *now*, with no start date. Those facts use {@link SnapshotEntity}
 * (`asOf`) — see the `current*` fields on {@link Company}. The `historic*`
 * arrays use {@link LonglivedEntity} and are for facts where a real date range
 * is known. Do not populate a `historic*` array by inventing a `from` date.
 */

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

export type Source = {
  name: string;
  /** Absolute URL. */
  url: string;
  /** ISO-8601 date, `YYYY-MM-DD`. */
  lastAccessed: string;
};

/** Every substantive entity must cite one or more sources. */
export type CitedEntity = {
  sources: Source[];
};

// ---------------------------------------------------------------------------
// Temporal patterns
// ---------------------------------------------------------------------------

/**
 * An entity that persists over a known date range. `to` is null if still
 * current. Use this only when `from` is genuinely known — if the source
 * reports current state without a start date, use {@link SnapshotEntity}.
 */
export type LonglivedEntity = {
  /** ISO-8601 date. */
  from: string;
  /** ISO-8601 date, or null if still current. */
  to: string | null;
};

/** An entity that represents a point-in-time observation. */
export type SnapshotEntity = {
  /** ISO-8601 timestamp or date for when this was observed. */
  asOf: string;
};

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export type SnapshotAmount = CitedEntity &
  SnapshotEntity & {
    value: number;
  };

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

/**
 * A lightweight reference to a company by name and permId.
 * permId is null when the company cannot yet be resolved to a known entity.
 */
export type CompanyReference = {
  name: string;
  permId: string | null;
};

// ---------------------------------------------------------------------------
// Name
// ---------------------------------------------------------------------------

export type NameChangeReason =
  | "Rebrand"
  | "Merger"
  | "Acquisition"
  | "Spinoff"
  | "LegalSettlement";

export type Name = CitedEntity & {
  value: string;
  changeReason: NameChangeReason | null;
};

export type HistoricName = Name & LonglivedEntity;

// ---------------------------------------------------------------------------
// Leadership
// ---------------------------------------------------------------------------

export type Leader = CitedEntity & {
  fullName: string;
  title: string;
};

export type HistoricLeader = Leader & LonglivedEntity;

// ---------------------------------------------------------------------------
// Sectors
// ---------------------------------------------------------------------------

/**
 * A sector classification. `system` identifies the taxonomy: SIC and NAICS are
 * code-first, TRBC (LSEG's classification) is label-first and supplies no
 * code, so `code` is empty for TRBC sectors.
 */
export type Sector = CitedEntity & {
  name: string;
  /** Empty string when the taxonomy provides no code — always so for TRBC. */
  code: string;
  system: "SIC" | "NAICS" | "TRBC";
};

export type HistoricSector = Sector & LonglivedEntity;

/** A classification reported as current state, with no known start date. */
export type CurrentSector = Sector & SnapshotEntity;

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------

/**
 * A company's current public listing. Both exchange fields are kept because
 * coverage differs: the MIC is the standard identifier but is absent more
 * often than the source's proprietary code, which serves as a display
 * fallback.
 */
export type CurrentListing = CitedEntity &
  SnapshotEntity & {
    ticker: string | null;
    /** ISO 10383 MIC, e.g. `"XNYS"`. */
    exchangeMic: string | null;
    /** Source-proprietary exchange code, e.g. `"NYS"`. Display fallback. */
    exchangeCode: string | null;
  };

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

export type Address = CitedEntity & {
  street1: string;
  street2: string | null;
  city: string;
  stateOrCountry: string;
  zipCode: string | null;
  isForeignLocation: boolean;
  foreignStateTerritory: string | null;
  country: string;
  countryCode: string;
};

export type HistoricAddress = Address & LonglivedEntity;

// ---------------------------------------------------------------------------
// Corporate structure
// ---------------------------------------------------------------------------

/**
 * A directed parent→child relationship between two companies.
 * Replaces the siblings/subsidiaries arrays on CorporateStructure, making
 * it possible to query all relationships for a company across time without
 * loading every company record.
 */
export type CorporateRelationship = CitedEntity &
  LonglivedEntity & {
    parent: CompanyReference;
    child: CompanyReference;
    relationshipType: "Subsidiary" | "Division" | "JointVenture";
    ownershipPercent: number | null;
  };

/**
 * A parent→child relationship as disclosed in a single filing. Exhibit 21 gives
 * the date the relationship was *disclosed*, not the date it began — a
 * subsidiary listed in a 2017 10-K may have been acquired decades earlier — so
 * this is a {@link SnapshotEntity}. See {@link CorporateRelationship} for the
 * date-ranged form, which needs a source that reports real start dates.
 *
 * `relationshipType` is always `"Subsidiary"` for Exhibit 21 data, whose
 * heading is "Subsidiaries of the Registrant", and `ownershipPercent` is always
 * null because the exhibit reports no percentages. Both fields are kept for
 * GLEIF, which supplies them.
 */
export type CurrentCorporateRelationship = CitedEntity &
  SnapshotEntity & {
    parent: CompanyReference;
    child: CompanyReference;
    relationshipType: "Subsidiary" | "Division" | "JointVenture";
    ownershipPercent: number | null;
    /**
     * Jurisdiction of incorporation as disclosed, verbatim. Mixed granularity
     * and formatting — "Delaware", "DE", and "United Kingdom" all occur. This
     * is deliberately not a country and deliberately not normalized: the value
     * is what the filing says.
     */
    childJurisdiction: string | null;
    /**
     * The registrant CIK whose filing disclosed this. Joins to
     * {@link Company.registrants}. A company with several registrants renders
     * one flat tree, so this is what says which of them is speaking.
     */
    disclosedByCik: string;
  };

// ---------------------------------------------------------------------------
// Equity securities
// ---------------------------------------------------------------------------

export type HistoricShareholder = CitedEntity &
  SnapshotEntity &
  CompanyReference & {
    sharesOwned: number;
    sharesMarketValue: number;
  };

export type HistoricPublicEquityValue = CitedEntity &
  SnapshotEntity & {
    outstandingShares: number;
    shareholders: HistoricShareholder[];
  };

export type HistoricPublicEquitySecurity = CitedEntity &
  LonglivedEntity & {
    symbol: string;
    class: string;
    history: HistoricPublicEquityValue[];
  };

/**
 * A single shareholding as disclosed in one filing (a 13-F, or a pension-fund
 * report). The filing states the holding *as of* a report date, not a range
 * over which it stays authoritative, so this is a {@link SnapshotEntity}. See
 * {@link HistoricShareholder} for the date-ranged, share-class-nested form,
 * which needs the outstanding-share counts and a security start date this
 * source does not carry.
 *
 * `sharesOwned` and `marketValueUsd` are nullable because the source reports
 * them per holding and some rows report neither. Percent-of-outstanding stake
 * is deliberately absent: the numerator (`sharesOwned`) is here, but the
 * denominator (shares outstanding) lives in company-facts, which is not wired
 * in — so a `% stake` column would be a derivation presented as sourced fact.
 */
export type CurrentShareholder = CitedEntity &
  SnapshotEntity & {
    /**
     * The investor. `permId` is currently always null — holders are not linked
     * to their own pages yet, though the CIK resolves for most of them.
     */
    investor: CompanyReference;
    /** "INSTITUTIONAL INVESTOR" | "PENSION FUND", verbatim from the source. */
    investorType: string;
    /** Investor HQ country name, or null when the filing does not state one. */
    investorCountry: string | null;
    /**
     * Security type verbatim, never a classification — "COM", "CL A", … The
     * source has dozens of spellings and no type field; normalizing them is a
     * separate piece of work.
     */
    securityType: string;
    /** Shares held. Null when the filing does not report a count. */
    sharesOwned: number | null;
    /**
     * Market value in USD as produced by the processor. Always USD on today's
     * data. Null when the filing reports no value.
     */
    marketValueUsd: number | null;
  };

// ---------------------------------------------------------------------------
// Debt securities
// ---------------------------------------------------------------------------

export type HistoricDebtHolder = CitedEntity &
  SnapshotEntity &
  CompanyReference & {
    debtMarketValue: number;
  };

export type HistoricDebtSecurityValue = CitedEntity &
  SnapshotEntity & {
    principalAmount: number;
    debtHolders: HistoricDebtHolder[];
  };

export type HistoricDebtSecurity = CitedEntity &
  LonglivedEntity & {
    symbol: string;
    class: string;
    jurisdiction: string | null;
    history: HistoricDebtSecurityValue[];
  };

// ---------------------------------------------------------------------------
// Commercial debt instruments
// ---------------------------------------------------------------------------

export type HistoricCommercialDebt = CitedEntity &
  LonglivedEntity & {
    instrumentName: string;
    debtHolder: CompanyReference;
    amount: number;
    interestRate: number;
    /** ISO-8601 date. */
    maturityDate: string;
    jurisdiction: string | null;
    type: "Bond" | "Convertible" | "Credit Facility";
  };

/**
 * A commercial debt instrument as disclosed in a single 8-K. The filing states
 * when the instrument was *disclosed*, not a range over which the record stays
 * authoritative, so this is a {@link SnapshotEntity}. See
 * {@link HistoricCommercialDebt} for the date-ranged form, which needs a source
 * that reports one.
 *
 * Almost every field is nullable, and that is a property of the source rather
 * than caution: the CDT processor extracts these from 8-K prose with an NLP
 * model, and a filing that does not state a maturity or an amount yields a row
 * that does not have one. `HistoricCommercialDebt` requires a `from` date, an
 * interest rate, a maturity, a classification, and one named holder; this data
 * supplies none of those reliably and no rate at all, so forcing it into that
 * type would mean inventing a `from` — which this file forbids outright.
 */
export type CurrentCommercialDebt = CitedEntity &
  SnapshotEntity & {
    /**
     * Instrument name verbatim from the filing, e.g. "revolving line of
     * credit". Free text, never a classification: the source has 978 distinct
     * values and no type field, and a regex guess at Bond vs Credit Facility
     * would present a derivation as sourced fact.
     */
    instrumentName: string;
    /**
     * Lender labels as extracted, one per coreference group in the filing.
     * Many are role words rather than names — "lenders", "the underwriters" —
     * because that is what the filing says in place of a name. They are carried
     * unfiltered; separating roles from names, and normalizing the names, is
     * its own piece of work. Empty when the filing discloses no lender at all,
     * which is 44% of instruments.
     */
    lenders: string[];
    /** As reported, in `currency`. Null when the extraction found no amount. */
    amount: number | null;
    /**
     * ISO 4217. Null when the extraction reported none. Never converted — no
     * source supplies an FX rate, so amounts in different currencies are not
     * comparable and must not be summed.
     */
    currency: string | null;
    /** ISO-8601 date. Null when the filing does not state one. */
    startDate: string | null;
    /** ISO-8601 date. Null when the filing does not state one. */
    endDate: string | null;
    /**
     * `Active` when `endDate` is in the future as of the build, `Undated` when
     * the filing states no end date. There is no matured or superseded variant:
     * those are filtered out in the pipeline and never reach the frontend.
     *
     * Stored rather than derived in the view because the `endDate > today`
     * comparison happens at build time, in the same place the filter is
     * applied. Recomputing it in the browser would evaluate "today" at a
     * different moment than the filter did, and the two could disagree on a
     * page served the day an instrument matures.
     */
    status: "Active" | "Undated";
  };

// ---------------------------------------------------------------------------
// Flagged projects
// ---------------------------------------------------------------------------

/**
 * A reference to a harmful development project this company is affiliated
 * with. The full project record lives in its own data structure.
 */
export type ProjectReference = {
  projectId: string;
  name: string;
  /** The nature of the company's involvement, e.g. "Lead Contractor" */
  role: string;
};

export type HistoricProjectAffiliation = CitedEntity &
  LonglivedEntity & {
    project: ProjectReference;
  };

// ---------------------------------------------------------------------------
// SEC registrants
// ---------------------------------------------------------------------------

/**
 * One SEC registrant rolling up to a company. A PermID may cover several —
 * holdco/opco pairs, REIT/operating-partnership pairs, and utility groups all
 * file under multiple CIKs that LSEG resolves to one entity.
 *
 * Company-facts fields are the intended next addition here. Facts are scalars
 * reported per registrant — an operating partnership and its REIT have
 * genuinely different market caps — so unlike the list-shaped sections they
 * cannot be collapsed into one array.
 */
export type Registrant = CitedEntity &
  SnapshotEntity & {
    /** Zero-padded to 10 digits, the canonical SEC form. */
    cik: string;
    /**
     * Legal name as reported against this CIK, from company-info's
     * `entity_name`. Differs from the PermID entity name — "Brixmor Operating
     * Partnership LP" against a company named "Brixmor Property Group Inc." —
     * so it is what labels rows grouped by registrant.
     */
    registrantName: string | null;
    /** True for exactly one registrant per company. */
    isPrimary: boolean;
  };

// ---------------------------------------------------------------------------
// Company
// ---------------------------------------------------------------------------

export type Company = CitedEntity & {
  // Stable identifiers
  permId: string;
  /**
   * The primary registrant's CIK, mirroring the {@link Registrant} entry whose
   * `isPrimary` is true. Null only when the company has no CIK at all.
   *
   * This is a denormalized convenience for display code that wants one CIK
   * without scanning `registrants`. It is *not* the join key for per-CIK
   * datasets — those join on every entry in `registrants`.
   */
  cik: string | null;
  /**
   * Every SEC registrant for this company, primary first. Empty if the company
   * has no CIK.
   */
  registrants: Registrant[];
  ein: string | null;
  lei: string | null;

  // Core identity
  name: string;
  aliases: string[];
  description: string;
  /** ISO-8601 date. */
  foundedOn: string | null;
  /** Absolute URL. */
  website: string | null;

  // Country of record. Held as scalar names rather than Addresses because the
  // source reports bare country names; a partial Address would weaken that
  // type for the real addresses arriving later. HQ country and country of
  // incorporation genuinely differ — offshore incorporation is exactly what
  // this project exists to surface — so both are kept.
  hqCountry: string | null;
  incorporatedCountry: string | null;
  domiciledCountry: string | null;

  // Current state, as reported by sources that supply no start date.
  /** Primary industry — the most specific classification available. */
  currentIndustry: CurrentSector | null;
  /** Broader classifications, e.g. TRBC economic and business sector. */
  currentSectors: CurrentSector[];
  currentListing: CurrentListing | null;
  /**
   * Subsidiaries as disclosed in this company's most recent Exhibit 21 (10-K)
   * or Exhibit 8 (20-F). A snapshot rather than a date range — see
   * {@link CurrentCorporateRelationship}.
   */
  currentCorporateRelationships: CurrentCorporateRelationship[];
  /**
   * Commercial debt instruments disclosed in this company's 8-K filings,
   * excluding those that have matured or been superseded. A snapshot rather
   * than a date range — see {@link CurrentCommercialDebt}.
   */
  currentCommercialDebt: CurrentCommercialDebt[];
  /**
   * Institutional and pension-fund holdings in this company, as disclosed in
   * the holders' most recent filings. A snapshot rather than a date range — see
   * {@link CurrentShareholder}. The holding is attached by resolving the
   * issuer's CUSIP to this company's PermID through company-info.
   */
  currentShareholders: CurrentShareholder[];

  // History. Every entry needs a real `from` date; leave these empty rather
  // than inventing one. To get the current CEO, find the HistoricLeader with
  // to === null.
  historicNames: HistoricName[];
  historicLeadership: HistoricLeader[];
  historicSectors: HistoricSector[];
  historicIncorporationAddresses: HistoricAddress[];
  historicDomicileAddresses: HistoricAddress[];
  historicCorporateRelationships: CorporateRelationship[];
  historicCommercialDebt: HistoricCommercialDebt[];
  historicSecurities: (HistoricPublicEquitySecurity | HistoricDebtSecurity)[];
  historicProjectAffiliations: HistoricProjectAffiliation[];
};
