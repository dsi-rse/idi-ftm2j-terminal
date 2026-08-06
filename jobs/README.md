# jobs

Build-time data pipeline for the static web application.

`build_dataset.py` reads the company info and corporate structure processors'
outputs and writes JSON records matching the serialized `Company` type in
[`web/src/types/domain.ts`](../web/src/types/domain.ts). That TypeScript type is
the contract; if you change the shape here, change it there in the same commit.

## Running it

```bash
COMPANY_INFO_FILE_PATH=../data/input/latest_company_info.parquet \
CORPORATE_STRUCTURE_FILE_PATH=../data/input/latest_corporate_structure.parquet \
OUTPUT_FILE_PATH=../data/output/companies.json \
uv run python build_dataset.py
```

| Variable | Meaning |
| --- | --- |
| `COMPANY_INFO_FILE_PATH` | `company-info/latest.parquet` from the processed layer |
| `CORPORATE_STRUCTURE_FILE_PATH` | `corporate-structure/latest.parquet` from the processed layer |
| `OUTPUT_FILE_PATH` | Where to write the JSON the web build consumes |

In CI all three are set by [`deploy.yaml`](../.github/workflows/deploy.yaml), which
first syncs the processed layer out of S3. The web build then reads the output
via `INPUT_DATA_FILE_PATH`.

`data/` is gitignored, so the parquet and the JSON are local artifacts — not
fixtures committed to the repo.

## Fixtures

```bash
uv run python -m fixtures            # every case
uv run python -m fixtures multi_cik  # cases whose name contains "multi_cik"
```

Exits non-zero if any case fails. There is no test framework in this repo, and
[`fixtures/`](fixtures/) is not one — it is a runner over synthetic inputs,
built because some `build_dataset` behavior **cannot be exercised against
production data at all**. No PermID currently carries more than one CIK, so
every multi-CIK path is covered by these cases or by nothing.

A case declares only the columns it cares about and inherits the rest from
`DEFAULT_COMPANY_ROW` / `DEFAULT_STRUCTURE_ROW`, so adding one is a few lines in
[`fixtures/cases.py`](fixtures/cases.py) and never touches the harness. An
override naming a column the real schema lacks raises rather than being
ignored — otherwise a typo'd column silently disables the assertion it was
written to drive.

Cases run the pipeline end to end through `build_dataset.main`, writing real
parquet to a temp dir, because the failures worth catching are in how the stages
compose. `run_build` returns the emitted records plus the captured log, so a
case can assert on a WARNING as easily as on a field.

These live under `jobs/` rather than `data/fixtures/` for the reason stated
above: `data/` is gitignored, and a fixture that is not committed is not
coverage.

## Input 1 — company info

`s3://{bucket}/database/company-info/latest.parquet`, produced by the IDI
company info processor from the LSEG PermID Entity Match and PermID Info APIs.
Schema is defined in the FTM2J Tech Spec under Processed Layer → Company info.

One row per `(identifier_type, identifier)`. Today that is one CIK per PermID,
but the Shareholder Tracker will introduce CUSIP-keyed rows and multiple
identifiers per PermID, so the script groups by `permid_id` rather than assuming
a 1:1 grain.

## Column mapping

| `Company` field | Source column |
| --- | --- |
| `permId` | `permid_id` |
| `cik` | the primary of `registrants`, via `select_primary_cik` |
| `registrants[].cik` | every `identifier` where `identifier_type == "cik"` |
| `registrants[].registrantName` | `entity_name`, from that CIK's most recent row |
| `lei` | `lei` |
| `name` | `investor_name` |
| `foundedOn` | `founded_date` |
| `website` | `url` |
| `hqCountry` | `hq_address`, last non-empty line |
| `incorporatedCountry` | `incorporated_in` |
| `domiciledCountry` | `domiciled_in` |
| `currentIndustry` | `primary_industry_group_label` |
| `currentSectors` | `primary_economic_sector_label`, `primary_business_sector_label` |
| `currentListing.ticker` | `ticker` |
| `currentListing.exchangeMic` | `exchange` |
| `currentListing.exchangeCode` | `exchange_code` |
| `sources[].url` | `permid_url` |
| `sources[].lastAccessed` | `last_processed` |

`input_source` and `last_processed` together partition a PermID's rows into
snapshots. Company-level scalars come from the most recent one rather than from
whichever row parquet happened to put first; `registrants` unions across all of
them, because recency decides field *values*, not which registrants exist. Rows
of a single snapshot disagreeing on a scalar raises a WARNING — they were all
built from one upstream record, so they should agree.

Unused columns: `identifier_type` and
`standard_identifier` (routing only), `registered_address`, `fax_number`,
`phone_number`, `activity_status`, `ric`, and the three `*_comment` fields
(taxonomy descriptions, not company facts).

## Input 2 — corporate structure

`s3://{bucket}/database/corporate-structure/latest.parquet`, produced by the IDI
corporate structure processor from Exhibit 21 of 10-K filings and Exhibit 8 of
20-F filings. One row per disclosed subsidiary per filing, and a full historical
record — most registrants appear with more than one filing date.

Populates `Company.currentCorporateRelationships`:

| `CurrentCorporateRelationship` field | Source column |
| --- | --- |
| `child.name` | `name` |
| `childJurisdiction` | `location` |
| `asOf` | `filing_date` |
| `sources[].name` | derived from `form_type` + `exhibit_type` |
| `sources[].url` | `exhibit_url` |
| `sources[].lastAccessed` | `date_added`, date component |
| (join key) | `parent_cik` |
| (tie-break only) | `report_date`, then `accession_number` |

`parent` comes from the `Company` record, not from the dataset's `parent_name`.
`child.permId` is always `None`: Exhibit 21 gives a name and a jurisdiction,
never an identifier.

Unused columns: `parent_name` (except to detect self-listing),
`parent_state_of_incorporation`, the seven `parent_business_*` address fields,
`parent_tickers`, `parent_exchanges`, and `source_quote`. Several of these would
fill gaps in company-info's coverage, but company-info stays the single source
for company identity — reconciling two sources for the same fact is its own
problem, not something to do implicitly here.

## Decisions worth knowing before you change this

**The citation is `permid_url`, not the company website.** The PermID record is
where these facts came from. It is also populated for every row, where `url` is
not, so `sources` is never empty. `website` is a fact *about* the company, not a
citation for it.

**`XXXX` in `exchange` does not mean unlisted.** It is a "no exchange reported"
MIC placeholder, and every row carrying it has a real `exchange_code`. It
normalizes to `None` for `exchangeMic` while `exchangeCode` still carries the
value, so those companies are not silently delisted. Coverage: 163 rows have a
MIC, 179 have a code, and the code set is a superset of the MIC set.

**`cik` is the primary registrant, and every CIK is kept.** A PermID may cover
several SEC registrants — holdco/opco pairs, REIT/operating-partnership pairs,
utility groups. All of them land in `registrants`; `cik` mirrors the one marked
`isPrimary` and is null only when the company has no CIK at all. An earlier
version nulled `cik` whenever a PermID carried more than one, which also cost
those companies their corporate tree.

Primary selection is a **stub** in `select_primary_cik`: lowest CIK, which is
deterministic and demonstrably wrong for some groups — it picks Entergy Arkansas
over Entergy Corp, and NSTAR Electric over Eversource Energy. The docstring
carries the evidence and the intended replacement. It matters only for joining
per-CIK datasets and for choosing one extraction per accession; it does not
decide displayed identity.

**HQ country is positional parsing of free text.** The country is the last line
of `hq_address`. All 219 rows currently end in a country, but nothing guarantees
that, so the parsed value is checked against `KNOWN_COUNTRIES` and falls back to
`incorporated_in` with a warning. Without that check a truncated address would
present a postal code to users as a country. Extend `KNOWN_COUNTRIES` when the
company universe grows.

**Sectors are TRBC labels with an empty `code`.** LSEG classifies by label and
supplies no numeric code. An earlier SIC/NAICS lookup table resolved only 14 of
74 LSEG labels because it was keyed to different sector names, so it was
removed. If a consumer needs SIC — the spec's Shareholder Tracker inputs list
`investor_industry_code` as SIC — that needs a real TRBC→SIC crosswalk, not a
partial map.

**`historic*` arrays are emitted empty.** LSEG reports current state with no
start date, so there is nothing to put a truthful `from` on. Current-state facts
live on the `current*` fields instead. Do not populate a `historic*` array by
inventing a `from` date; that was how the previous mock pipeline worked and it
produced 1970-01-01 everywhere.

**`parent_cik` is unpadded; company-info's CIK is zero-padded to 10.** This is
the one thing here you cannot infer from reading the code, and getting it wrong
does not raise: the naive join matches *zero* rows and every company page renders
an empty Corporate Tree, which looks exactly like "the processor has no data
yet". Both sides are normalized through `normalize_cik` before joining, and an
empty join fails the build rather than shipping 219 blank sections.

**Only the most recent filing per company contributes subsidiaries.** 111 of the
133 matched companies have more than one filing date. Merging rows across filings
would describe a structure no single document supports. Filings are ordered by
`filing_date`, then `report_date`, then `accession_number`.

**Same-day ties are catch-up filings, not amendments, so `report_date` breaks
them.** All three CIKs carrying more than one accession on their latest
`filing_date` are delinquent registrants that filed several years of 10-Ks at
once. Accession number cannot order those: it follows the filer agent and
submission sequence, not the fiscal period. DOC DR, LLC (CIK 1583994) filed its
FY2014 and FY2016 10-Ks on 2017-02-24 through different agents, and the higher
accession is FY2014 — 94 subsidiaries where FY2016 discloses 261. Accession
number stays as the last tie-break, for reproducibility when two filings share
both dates.

`filing_date` stays the primary sort rather than `report_date`, so "most recent
filing" keeps meaning what it says and matches the date shown to users. The two
would disagree only for a 10-K filed late for a period older than an on-time
earlier filing; no CIK in the dataset does that. Blank `report_date` (seven
20FR12B rows) loses to any real date and otherwise falls through to accession.

**No recency filter is applied to `filing_date`.** The tech spec says "filings
from the past 2 years", which would currently yield *zero* companies — every
matched company's most recent filing is 2016–2018, because the dataset is a
partial backfill. The UI shows the filing date instead, so a 2017 list is never
presented as current.

**`exhibit_type` is not filtered.** It takes two values and both are subsidiary
lists: `21` is the 10-K's Exhibit 21, `8` is the 20-F's Exhibit 8.1. Filtering to
`21` would silently drop every foreign private issuer. No 20-F filer is in the
current 219-company universe, so that path is correct but unexercised.

**A registrant listing itself is dropped.** Six rows do this. That is the tree's
root, not one of its own subsidiaries — and for one company (SpendSmart Networks)
it was the *only* row, so it correctly ends up with no disclosed structure.

**`location` is a jurisdiction, not a country, and is not normalized.** 317
distinct values mixing US states and countries, with `Delaware`, `DE`, and
`DELAWARE` all present, and 493 blanks — both figures over the 8,807 rows that
actually render, not the whole file. Dataset-wide it is 3,205 distinct values
and 32,076 blanks. Blank becomes `None`. Do not "clean" this into a country
field; the value is what the filing says.

**`last_processed` is compact basic ISO** (`20260801T033040`), unlike the
`YYYY-MM-DD` used elsewhere in the spec. Parsed defensively because the upstream
format is unsettled.

## The per-CIK join contract

Corporate structure is the first per-CIK dataset to land. Shareholders and
commercial debt are both coming, and both join the same way. The rule is written
down once here so those two processors do not each invent their own.

**1. Join on every registrant, not on `Company.cik`.** The join key is all of
`Company.registrants[].cik`. `cik` is a display convenience naming the primary;
using it as the join key silently drops every filing made by a company's other
registrants.

**2. One extraction per `accession_number`.** Co-registrants on a combined
filing are each attributed the same document, so a union across CIKs multiplies
rows — AEP's six CIKs carry the same 22 names, for 132 rows describing 22
subsidiaries. Keep exactly one CIK's rows per accession: the primary's if it is
among them, else the lowest.

Take one *whole* copy rather than merging. The extractions are not identical —
on 68 of the 203 shared accessions the processor reports different row counts
per CIK, and Brixmor reads 619 rows under one CIK and 633 under the other from
one `exhibit_url`. These are LLM parses of a single document with no basis for
ranking them, and merging produces a list neither parse returned (634, in
Brixmor's case).

**3. Stamp `disclosedByCik` on every row.** A company renders one flat list, so
without it the rows lose track of which registrant disclosed them.

**4. Cite the disclosing registrant's document, not the primary's.** Each row's
`sources` points at the exhibit it actually came from.

**Not in the contract: deduping by entity name across documents.** Two
registrants who file separately both contribute in full, so a subsidiary named
in both appears twice. This is deferred rather than decided, because both
obvious keys are wrong in opposite directions. Measured over the rows that
render today:

| Key | Failure |
| --- | --- |
| case-folded `name` | over-merges the **214** duplicate-name groups carrying two genuinely different non-blank jurisdictions |
| `(name, jurisdiction)` | under-merges the **252** groups where one row has a jurisdiction and the other is blank, splitting one subsidiary in two |

Blanks are common enough to matter — 493 of the 8,807 rendered rows, 32,076 of
445,818 file-wide — so any rule keying on the pair has to say what a blank
means. Folding a blank into a filled row of the same name avoids both failures
on this data and is the current front-runner, but it is not a decision.

Two caveats for whoever takes it: those counts are measured *within* one
accession, because that is where duplicate names are observable today, while the
deferred case is *across* accessions where two independent parses also disagree
on spelling and punctuation — a strict key will under-merge more than these
numbers suggest. And extraction noise is already in the counts: both Brixmor
parses carry a literal `Legal Entity Name` row, the exhibit's table header read
as a subsidiary.

`attach_relationships` logs the duplicate-name count surviving across accessions
on every run, so the evidence accumulates without anyone re-deriving it.

## Scope

The company universe is set by company-info, which currently covers only
companies reached via the commercial debt tracker — 219 PermIDs. It grows as the
Shareholder Tracker lands. No filtering is applied here, including on
`activity_status`: inactive companies still get records.

Corporate structure covers 4,652 registrants, but only those that are also in the
company universe get a tree: **133 of 219** companies, carrying 8,807
subsidiaries between them. The other 86 render an empty state. That ratio
improves from both directions as the two processors fill in.
