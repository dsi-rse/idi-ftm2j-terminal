# jobs

Build-time data pipeline for the static web application.

`build_dataset.py` reads the company info, corporate structure, and commercial
debt processors' outputs — five parquet files, because CDT takes three — and
writes JSON records matching the serialized `Company` type in
[`web/src/types/domain.ts`](../web/src/types/domain.ts). That TypeScript type is
the contract; if you change the shape here, change it there in the same commit.

## Running it

```bash
COMPANY_INFO_FILE_PATH=../data/input/latest_company_info.parquet \
CORPORATE_STRUCTURE_FILE_PATH=../data/input/latest_corporate_structure.parquet \
CDT_DEBT_INSTRUMENTS_FILE_PATH=../data/input/latest_cdt.parquet \
CDT_MENTIONS_FILE_PATH=../data/input/latest_cdt_mentions.parquet \
CDT_ITEMS_FILE_PATH=../data/input/latest_cdt_items.parquet \
SHAREHOLDERS_FILE_PATH=../data/input/latest_shareholders_raw.parquet \
OUTPUT_DIR=../data/output \
uv run python build_dataset.py
```

| Variable | Meaning |
| --- | --- |
| `COMPANY_INFO_FILE_PATH` | `company-info/latest.parquet` from the processed layer |
| `CORPORATE_STRUCTURE_FILE_PATH` | `corporate-structure/latest.parquet` from the processed layer |
| `CDT_DEBT_INSTRUMENTS_FILE_PATH` | `cdt/debt-instruments/latest.parquet` |
| `CDT_MENTIONS_FILE_PATH` | `cdt/debt-instrument-mentions/latest.parquet` |
| `CDT_ITEMS_FILE_PATH` | `cdt/items/latest.parquet` |
| `SHAREHOLDERS_FILE_PATH` | `shareholders/latest.parquet` from the processed layer |
| `OUTPUT_DIR` | Directory to write the dataset into (see *Output layout*) |

In CI all seven are set by [`deploy.yaml`](../.github/workflows/deploy.yaml),
which first syncs the processed layer out of S3. The web build then reads the
output via `INPUT_DATA_DIR`.

`data/` is gitignored, so the parquets and the output are local artifacts — not
fixtures committed to the repo.

### Output layout

The script no longer writes one `companies.json` array. With every shareholding
kept, that array is >1 GB — past Node's ~536 MB single-string cap — so the web
reader could not load it. Instead `OUTPUT_DIR` gets:

- `index.ndjson` — one light record per company (`permId`, `name`, `hqCountry`,
  and the three content-depth counts), newline-delimited so the reader parses it
  line by line without ever building one huge string. Page selection reads only
  this.
- `detail/<shard>/<permId>.json` — the full `Company` record, one file each,
  sharded by a two-character `permId` prefix. Each rendered page reads only its
  own file. `index_shard` here and `detailShard` in the web route must agree.

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

One row per `(identifier_type, identifier)`. Rows are either CIK-keyed or
CUSIP-keyed: the CUSIP rows are the issuers the company-info processor resolved
for the Shareholder Tracker, and they are what `attach_shareholders` joins on
(see *Input 6*). A PermID can carry several identifiers, so the script groups by
`permid_id` rather than assuming a 1:1 grain.

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

## Inputs 3, 4, 5 — commercial debt (CDT)

Three files for one section, and that is not an accident of convenience.

`s3://{bucket}/database/cdt/debt-instruments/latest.parquet` holds the
instruments — one row per debt instrument, resolved across the filings that
mention it — and **carries no provenance whatsoever**. Thirteen columns, none of
them a document link, filing date, accession number, or access date. Since every
fact rendered on a company page has to cite its source, that file alone cannot
populate the section. The citation comes from two sibling outputs:

```
debt-instruments.seed_debt_instrument_mention_id
  → debt-instrument-mentions.debt_instrument_mention_id   (amount_json → currency)
  → debt-instrument-mentions.item_id
  → items.item_id                                         (url, date, item)
```

Both hops are total on today's data: 1,640 of 1,640 instruments resolve a mention,
and 1,891 of 1,891 mentions resolve an item. An instrument that fails to resolve
**fails the build** — it would otherwise be rendered uncited, which is worse than
not rendering it.

`debt-instrument-mentions` is also the only place the **currency** lives, in
`amount_json.currency`. `debt-instruments.amount` is a bare number.

`items` is read narrow, four columns of sixteen. It is 26.5 MB mostly because of
`text`, the full 8-K section body the extraction ran over, and only ~1,900 of its
~26,000 rows are ever joined.

Populates `Company.currentCommercialDebt`:

| `CurrentCommercialDebt` field | Source column |
| --- | --- |
| `instrumentName` | `debt-instruments.name`, verbatim |
| `lenders` | `debt-instruments.lenders_json`, one label per coreference group |
| `amount` | `debt-instruments.amount` |
| `currency` | `mentions.amount_json` → `currency` |
| `startDate` | `debt-instruments.start_date` |
| `endDate` | `debt-instruments.end_date` |
| `status` | derived from `endDate` vs the build date |
| `asOf` | `items.date` (the filing date) |
| `sources[].name` | `items.item`, e.g. `SEC 8-K Item 1.01` |
| `sources[].url` | `items.url`, verbatim |
| `sources[].lastAccessed` | the pipeline run date |
| (join key) | `debt-instruments.cik`, zero-padded |
| (scope filter) | the three `*_of_debt_instrument_id` lineage columns |

Unused columns: `company_name` on all three files (company-info stays the single
source for company identity, as with corporate structure),
`other_interested_parties_json` (borrowers and guarantors — the same coreference
problem as lenders, with less payoff), everything in `mentions` that
`debt-instruments` already resolves (`name_json`, `start_date_json`,
`end_date_json`, `raw_id`, and the per-mention lineage columns), and everything in
`items` outside the four read — including `item_information`, the gloss for
`item`, which is lowercase and runs to 135 characters and so makes a poor
citation name.

**Both auxiliary files must be de-duplicated before joining.** `mentions` carries
23 duplicate ids (exact repeats within one item) and `items` carries 803 duplicate
`item_id`s in which `company_name` is the only column that varies, because each
co-registrant on one 8-K gets a row. The naive join turns 1,640 instruments into
1,861. The merges also pass `validate="many_to_one"`, so removing the de-duplication
raises rather than quietly inflating.

## Input 6 — shareholders

`s3://{bucket}/database/shareholders/latest.parquet`, produced by the IDI
shareholder-tracker processor from SEC 13-F filings and European pension-fund
reports. One row per disclosed holding.

**The join key is the issuer's CUSIP, not a CIK — this is the one dataset that
does not follow the per-CIK join contract below.** The file carries no issuer
PermID and no issuer CIK: a holding names the *investor* (by `investor_cik`) and
the *security* (by `security_cusip`), and the company a holding belongs to is the
security's *issuer*. `attach_shareholders` resolves it by looking the
`security_cusip` up in company-info's CUSIP-keyed rows (`identifier_type ==
"cusip"`) to get the issuer's `permid_id`. Coverage is therefore bounded by how
many issuers company-info has resolved, and an unresolved CUSIP drops that
holding silently — only a *total* zero-match fails the build.

Column mapping (`build_shareholder`):

| Field | Source |
| --- | --- |
| (issuer join key) | `security_cusip` → company-info cusip row → `permid_id` |
| `investor.name` | `investor_name` |
| `investor.permId` | always `null` — holders are not linked to their own pages yet |
| `investorType` | `investor_type` (`INSTITUTIONAL INVESTOR` / `PENSION FUND`) |
| `investorCountry` | `investor_country_name` |
| `securityType` | `security_type`, verbatim |
| `sharesOwned` | `stock_number_of_shares` |
| `marketValueUsd` | `security_market_value_amount_usd` (already USD) |
| `asOf` | `document_report_date` |
| `sources[].name` | `SEC Form 13-F` for institutions, else the fund's `source` |
| `sources[].url` | `url` |
| `sources[].lastAccessed` | `last_accessed_date` |

**No percent-of-outstanding stake is shown.** `stock_percent_ownership` is 0%
populated on the resolved rows, so it is not sourced from this dataset. The
denominator (shares outstanding) is now available from company-facts (Input 7)
on the primary registrant, but it is only the annual 10-K / 20-F cover-date
common-share count, which is too stale and share-class-mismatched against a
quarterly 13-F holding to divide safely — so the section leads with USD market
value and derives no `% stake`. A reworked, quarterly-denominator version is
tracked separately (beads `idi-ftm2j-terminal-5y2.15`/`5y2.16`), pending
company-facts processor changes. `stock_percent_*`, the pre-conversion
value/multiplier/rate columns, voting-authority columns, `stock_ticker`,
`security_isin`/`figi`, the `issuer_*` columns, and `text` are all unused.

No recency or dedup step: the file is already a single snapshot (one report date
per investor), so "most recent 13-F per CIK" would remove nothing. The large
holder counts on mega-caps (Alphabet ~9,538) are genuine institutional breadth,
not duplication.

## Input 7 — company facts

`COMPANY_FACTS_FILE_PATH`, produced by the `idi-company-facts` processor from
10-K / 20-F inline XBRL. One row per `(company_cik, accession_number)`, keyed by
the SEC registrant CIK. Wired in by `attach_company_facts`, which hangs each
registrant's most recent filing (by `report_date`, tie-broken on `filing_date`)
off its CIK as `Registrant.facts`.

| `RegistrantFacts` field | Source column |
| --- | --- |
| `publicFloat` (+ currency, as-of) | `market_value` = `dei:EntityPublicFloat` — **public float, not market cap** |
| `revenue` (+ currency, as-of) | `revenue`, the recognized revenue concept |
| `sharesOutstanding` (+ as-of) | `shares_outstanding` = `dei:EntityCommonStockSharesOutstanding` |
| `isShellCompany` | `is_shell_company` |
| `reportDate`, `formType` | `report_date`, `form_type` |
| `sources[0]` | `primary_url` (cited as `SEC {form_type}`), `last_accessed` |

Facts are **per-registrant scalars** — a REIT and its operating partnership have
genuinely different public floats — so they are never summed or maxed across a
company's registrants; the header shows the primary registrant's. Currencies are
carried as reported and **never converted** (20-F filers report in EUR, CNY,
etc.), matching the commercial-debt amount rule. There is no market-cap or
employee-count field: the cover page reports public float, and no headcount is
extracted. The accession prefix also drives primary-CIK selection — see the
company-info primary-selection note above.

The registered-securities columns (`all_tickers`, …) are not consumed yet;
`currentListing` still sources ticker and exchange from company info.

## Decisions worth knowing before you change this

**The CDT scope filter deliberately departs from the tech spec.** The spec admits
an instrument only when its end date is in the future and it has not been
superseded. Superseding is honored. The end date is not, because 63% of rows have
none: strict compliance yields 156 instruments across **55 of 4,832** companies
and silently discards the undated majority. Instruments with no end date are kept
and labelled `Undated`, giving 1,132 across 186 companies. Every row shows the
date its 8-K was filed, so nothing undated is presented as current.

**`lastAccessed` on a debt citation is the build date, and `asOf` is the filing
date.** They are different facts and neither substitutes for the other. Nothing in
the three CDT files records when the document was retrieved — corporate structure
has `date_added` for this and CDT has no equivalent — so the honest available
answer is when the pipeline read it. This makes `lastAccessed` the only
non-deterministic field in the output. Do not "fix" that by using the filing date:
that would assert a 2016 retrieval of a document first read years later.

**Debt amounts are never converted or summed.** No CDT output supplies an FX rate,
so the spec's "Amount USD" cannot be produced. Twelve in-scope instruments are
EUR, CHF, or GBP, and 385 have no amount at all, so any total both mixes
currencies and understates by a third.

**Lender labels ship unfiltered, role words included.** `lenders_json` is a
coreference mention graph, and many groups contain no name anywhere — their
longest span is `lenders`, `underwriters`, or `lenders party thereto`, which is
what the filing said in place of a name. 494 of 1,132 instruments disclose no
lender at all and 638 carry at least one label. Separating roles from names, and
normalizing the names that remain, is its own piece of work; the labels here are
the evidence it needs. `extract_lender_labels` is the single place any such
cleanup belongs.

**Misextracted amounts are passed through.** Six values dataset-wide are below
1,000 and at least three are plainly interest-rate margins the extractor put in
the amount field — `0.875` on a row named `ABR Loan`. No threshold separates those
from a genuine small private note, so nothing is filtered and the fix belongs
upstream.



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

Primary selection is a **three-rung ladder** in `select_primary_cik`, applied by
`assign_primary_registrants` once company facts and corporate structure are
loaded:

1. **Accession prefix.** The prefix of a company-facts filing's accession number
   is the transmitting CIK — on a combined 10-K, normally the parent. Used when
   it is one of the group's own CIKs (~69% of co-registrant groups, and it fixes
   Entergy and Eversource, which the old lowest-CIK stub got wrong).
2. **Structural signal.** When the prefix is a filing agent not in the group,
   the registrant *not* listed as a child in the shared Exhibit 21 / Exhibit 8
   is the parent.
3. **Lowest CIK.** Deterministic terminal fallback, for ties, an inconclusive
   structural signal, and companies with no filing.

Only multi-registrant companies are ever re-decided, and production has none, so
this is exercised by the `registrants_*` and `primary_*` fixtures. Primary
selection matters only for joining per-CIK datasets, for choosing one extraction
per accession, and for which registrant's facts the header shows; it does not
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

**`asOf` is the filing date, and `report_date` is deliberately not surfaced.** A
subsidiary list describes the registrant as of its fiscal period end, so
`report_date` has a claim to being the truer as-of. Filing date wins anyway: it
is the date a reader verifies against EDGAR, and it is what the tree's subtitle
range and the same-day tie-break already sort on. Surfacing both was considered
and dropped as a field the UI would have to explain twice.

That makes the *wording* load-bearing. The gap between the two dates runs 34 to
238 days, median 58, and 113 of the 134 companies with a tree report a fiscal
year different from the year they filed in — FY2016 structures under a 2017
date. So every rendered date says "filed on", never a bare date that a reader
could take for a period end. See `SourceCitation`'s `detail` prop.

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

Corporate structure and commercial debt are per-CIK datasets and join the same
way; the rule is written down once here so a future per-CIK processor does not
invent its own. **Shareholders is the exception — it joins on the issuer's CUSIP,
not a registrant CIK (see *Input 6*) — so none of the four points below apply to
it.**

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

The company universe is set by company-info, currently **18,631 PermIDs** (it
grew sharply as the shareholder-tracker's resolved issuers landed in
company-info). No filtering is applied here, including on `activity_status`:
inactive companies still get records.

Corporate structure gives **4,482 of 18,631** companies a tree, carrying 231,684
subsidiaries between them; the rest render an empty state.

CDT gives **186 of 18,631** companies debt, carrying ~1,130 instruments (~154
active, 976 undated) — the gap from the borrower CIKs is companies whose every
instrument was filtered out as matured or superseded.

Shareholders is the highest-coverage section: **7,211 of 18,631** companies
carry holdings, **1,701,003** in total, resolved from the ~1.7M of 2.2M raw rows
whose issuer CUSIP company-info knows. The other ~505K rows drop silently.

All three ratios move build to build as the processors and company-info fill in,
so re-derive from the run's INFO logs rather than trusting these. Two coverage
losses are silent by nature and logged every run: in-scope debt instruments whose
CIK company-info has not resolved to a PermID, and shareholdings whose issuer
CUSIP it has not resolved.
