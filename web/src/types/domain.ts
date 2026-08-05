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
