# Incorporate company info data into the frontend UI

**Issue:** https://github.com/dsi-clinic/idi-ftm2j-terminal/issues/20

## Goal

Replace the mocked company-info fields on `/companies/[id]` with real data from
`s3://{bucket}/database/company-info/latest.parquet`, and make `Company` the
canonical domain concept the app is built around.

Scope is the *company info* slice only — the fields the Notion spec's **Company
Header Info** table defines. Tree, Holders, and Debt sections stay on mock data
until their processors land.

## Decisions

Settled during refinement:

1. **Unsourced fields render as unavailable.** Market Cap, Revenue, Employees,
   and Description have no source in company-info (the spec routes them through
   company-facts / a 10-K join). They render an explicit "not available" state —
   no mock numbers beside real LSEG data.
2. **`Company` becomes the canonical type.** See *Type strategy* below.
3. **The "Country Headquartered" cell uses HQ country parsed from
   `hq_address`.** The last newline-delimited line of `hq_address` is the
   country; it is populated and parses for all 219 rows. This makes the existing
   label accurate with no copy change, and differs from `incorporated_in` for 7
   companies — exactly the offshore-shell and HQ/incorporation-split cases the
   tool exists to surface (Arowana: Australia vs Cayman Islands; Boston
   Carriers: Greece vs Marshall Islands; Versigent: Switzerland vs Jersey; plus
   Magnachip, StimCell, Global SPAC, Waste Connections). `incorporated_in` still
   goes into the record as a scalar; it is simply not what the header shows.
   Search results show HQ country for those 7 — an improvement, not a
   regression.
4. **Spec header fields only.** LEI, addresses, founded date, RIC, activity
   status, and the fuller sector taxonomy are read into the record where the
   type already has a home for them, but nothing new is surfaced in the UI.

## Type strategy

The issue asked which shape real data should land in. Two candidates existed:
the flat `CompanyData`/`CompanyDetail` pair in
[domains/companies/types.ts](../web/src/domains/companies/types.ts) that the UI
imports today, and `Company` in [types/domain.ts](../web/src/types/domain.ts),
which nothing imports but which [transform_companies.py](../jobs/transform_companies.py)
already targets.

**Adopt `Company`.** It is the deliberate domain model — every fact carries
`sources`, and facts are temporal rather than point-in-time. That matches what
FTM2J is for: an advocacy research tool where a claim without a citation is not
usable. `CompanyDetail` cannot get there incrementally, because it conflates
real and illustrative fields in one interface (`marketCapUsd` sits beside
`permId`) and carries provenance as free-text prose strings (`overviewSource`).

`Company` also genuinely belongs in `types/`, not in the companies domain:
shareholders and debt holders are themselves `CompanyReference`s, so the type
crosses domains and the ARCHITECTURE.md colocation rule points outward.

Adopting it requires five fixes to `types/domain.ts` first — it has never been
compiled against real data:

- **Nothing in the file is exported.** Every declaration is a bare `type`, so
  the module currently exports nothing and cannot be imported at all.
- **`Date` and `URL` fields are wrong for this app.** Data arrives via
  `JSON.parse(fs.readFileSync(...))` at build time, so `foundedOn`,
  `lastAccessed`, `maturityDate`, `website`, `Source.url`, and every
  `from`/`to`/`asOf` on the temporal wrappers are strings at runtime, not
  instances. Declare them as ISO-8601 `string` in the serialized shape. This is
  the difference between a type that documents intent and a type that catches
  mistakes.
- **There is nowhere to put country of incorporation.** `Company` carries
  country only inside `historicIncorporationAddresses[].countryCode`, and
  `Address` requires non-nullable `street1` and `city` — so representing
  "incorporated in Cayman Islands" means fabricating an empty street address.
  The parquet gives `incorporated_in` and `domiciled_in` as bare country names,
  not addresses. Add scalar country fields to `Company` rather than relaxing
  `Address`: the data genuinely is a country, and a partial `Address` would
  weaken the type for the real addresses arriving later.
- **`Sector` doesn't fit LSEG data.** It requires `code` plus
  `system: "SIC" | "NAICS"`. LSEG uses TRBC, and only 14 of the 74 distinct
  labels in the parquet map to the existing `SECTOR_TO_SIC_MAP`. Add `"TRBC"` to
  the union and allow an empty `code`.
- **Company-info facts are snapshots, not date ranges.** LSEG gives current
  state with no start date. Forcing name/sector/ticker into `LonglivedEntity`
  means inventing a `from` — `transform_companies.py` currently uses
  `1970-01-01`. Model these as `SnapshotEntity` (`asOf`, from `last_processed`)
  or make `LonglivedEntity.from` nullable. Prefer the former: it is accurate
  rather than merely well-typed.

`CompanyDetail` and `mock-detail.ts` survive only as an explicitly-named mock
adapter for the three sections that still need one, and shrink to nothing as
those processors land.

## Requirements

1. `jobs/` reads the parquet directly and emits `Company`-shaped JSON.
2. Every PermID in the parquet gets a statically generated page. No filtering,
   including no filtering on `activity_status`.
3. The header renders Company Name, Primary Industry, Country, Ticker, and
   Exchange from real data. Industry (6 nulls), ticker (53), and exchange (40
   after fallback) are all nullable and need the unavailable state too — this is
   not only about the three unsourced stats.
4. Market Cap, Revenue, Employees, and Description render an unavailable state.
5. Overview bullets that assert unsourced facts are removed rather than mocked.
6. Tree / Holders / Debt keep working, visibly sourced to mock data.
7. `pnpm run build` and the deploy workflow both succeed end to end.

## Acceptance criteria

- [ ] `uv run python build_dataset.py` against `latest.parquet` writes 219
      records, each validating against the serialized `Company` type.
- [ ] Every record's `name`, `permId`, and `sources[0]` are non-empty (all three
      are 219/219 in the parquet, so any gap is a mapping bug).
- [ ] Field coverage in the output matches the parquet: 166 records with a
      ticker, 179 with an exchange (after the `exchange_code` fallback below),
      213 with an industry.
- [ ] PermID `5040054333` (Azure Midstream Partners LP) renders without a crash
      and with no `"undefined"`/`"null"` string in the DOM. It is the strongest
      single test case: null `ticker`, null `exchange`, and null
      `primary_industry_group_label`, but `exchange_code` = `OTC`, so it
      exercises both the unavailable state and the exchange fallback.
- [ ] The 6 records with no industry and the 53 with no ticker render the
      unavailable state, not an empty cell.
- [ ] HQ country parses for all 219 rows and differs from `incorporated_in` for
      exactly 7 (Arowana, Boston Carriers, Versigent, Global SPAC, Magnachip,
      StimCell, Waste Connections). A row whose last address line is not a
      recognized country falls back to `incorporated_in` and emits a warning.
- [ ] All 17 `tr-org:statusInActive` companies still get a page.
- [ ] `generateStaticParams` yields 219 params; the built site has 219 company
      pages.
- [ ] No fabricated financial figure appears anywhere on a company page. After
      cleanup, `grep -rn "marketCapUsd\|revenueUsd" web/src` returns nothing —
      the generators are deleted, not bypassed.
- [ ] Sectors emit as `system: "TRBC"` with the LSEG label and an empty `code`.
      No SIC/NAICS lookup runs, and no warning fires for an unmapped label —
      `SECTOR_TO_SIC_MAP` is gone (see Cleanup).
- [ ] `build_dataset.py` takes exactly one input file. The `COUNTRY_CODES_*` and
      `COMPANY_EXTRAS_*` env vars are gone from the script and the workflow.
- [ ] `pnpm tsc --noEmit` passes with no `any` introduced at the JSON boundary.

## Approach

### 1. Fix `web/src/types/domain.ts`

Export every declaration. Replace `Date`/`URL` with ISO `string`. Add `"TRBC"`
to `Sector.system` and allow empty `code`. Introduce the snapshot variant for
current-state company facts. No behavior change yet — this step is types only,
and `tsc --noEmit` should pass before and after.

### 2. Add `pyarrow` to `jobs/pyproject.toml`

Confirmed missing: the lockfile has numpy and pandas 3.0.1 only, and pyarrow is
still an optional pandas dependency, so `pd.read_parquet` fails without it.

### 3. Rewrite `load_raw_companies` in `jobs/build_dataset.py`

Currently reads JSON and will `KeyError` on the new file — it drops
`original_entity_name`, which the parquet calls `entity_name`. Switch to
`pd.read_parquet` and remap:

| Company field | Parquet column |
| --- | --- |
| `permId` | `permid_id` |
| `name` | `investor_name` |
| `lei` | `lei` |
| `website` | `url` |
| `cik` | `identifier` where `identifier_type == "cik"` |
| HQ country (header + search) | `hq_address`, last non-empty line |
| incorporated country (record only) | `incorporated_in` |
| industry | `primary_industry_group_label` |
| ticker | `ticker` |
| exchange | `exchange`, falling back to `exchange_code` |
| `sources[].url` | `permid_url` |
| `sources[].lastAccessed` | `last_processed` |

Note the provenance field: the `Source` for every company-info fact is
`permid_url`, not the company's `url`. That is where the record actually came
from, and unlike `url` (173/219) it is populated for every row, so
`sources[0]` is never empty. `build_source()` in `transform_companies.py`
currently cites the company website instead — that is the wrong provenance and
should not be carried over. `url` is `Company.website`, which is a fact about
the company, not a citation for it.

The old ticker logic parsed `identifier` as `ticker:XXX`; in this file
`identifier` is a CIK and `ticker` is its own column. Group by `permid_id`,
collecting tickers and CIKs as lists and taking the first value for scalars.
Today the grain is 1:1 (219 rows, 219 unique PermIDs, 219 unique CIKs), but keep
the grouping — Shareholder Tracker rows will introduce multiple identifiers per
PermID.

`Company.cik` is `string | null`. Set it only when a PermID has exactly one CIK;
when there are several, leave it null pending the Primary CIK selection logic
the spec calls for but does not define. Do not invent a tie-break.

### 4. Emit `Company`-shaped JSON

Every company-info fact gets a real `Source` — name `"LSEG PermID"`, `url` from
`permid_url`, `lastAccessed` from `last_processed`. Arrays with no source yet
(`historicLeadership`, `historicCorporateRelationships`,
`historicCommercialDebt`, `historicSecurities`, `historicProjectAffiliations`)
are emitted empty, not mock-filled.

This lands in `build_dataset.py`; `transform_companies.py` is deleted (see
Cleanup). One script, not two that target the same type.

### 5. Update the web layer

- `loadCompanies()` returns `Company[]`.
- `CompanyHeader` reads real fields; add an `UnavailableStat` treatment for the
  three stat cells and Description.
- Overview drops the bullets that assert unsourced facts; the remainder cite
  their real `Source`.
- Tree / Holders / Debt read from a renamed mock adapter whose section-level
  source text says plainly that it is illustrative.
- Rewire the Pagefind `data-pagefind-meta` block. It currently indexes seven
  fields, but only five are consumed downstream (`permId`, `companyName`,
  `countryName`, `sectors`, `tickers` — see
  [use-all-companies-search.ts](../web/src/domains/companies/hooks/use-all-companies-search.ts)
  and [search.tsx](../web/src/components/search.tsx)). `countryCode` and
  `subsidiaries` are write-only: nothing reads them. Drop both rather than
  finding them a home in `Company`. `sectors` is consumed (it renders the sector
  chip in search results) and maps to `historicSectors[].name`.

### 6. Update deploy config

`aws s3 sync` pulls `${S3_PUBLISHED_DATA_DIR}`. Point it at `database/` so
future processor outputs come along, and set `RAW_COMPANIES_FILE_NAME` to
`company-info/latest.parquet`. Both are GitHub repo variables and must be
changed in repo settings — not in the workflow file.

Also remove the now-unused `COUNTRY_CODES_FILE_PATH` and
`COMPANY_EXTRAS_FILE_PATH` env vars from the `Generate JSON dataset for website`
step, and their `COUNTRY_CODES_FILE_NAME` / `COMPANY_EXTRAS_FILE_NAME`
variables.

## Cleanup

This is the move from mock scaffolding to production code, so the mocks come out
as part of the work rather than in a follow-up. Deleting them is what proves the
real data is actually wired up — code that is still importable will get imported.

### `web/src/domains/companies/mock-detail.ts` (316 lines)

Delete outright:

- `INDUSTRY_MAP` + `inferIndustry` — superseded by
  `primary_industry_group_label`.
- Market cap / revenue / employees generation (`between(rng, 5e9, 200e9)` etc.)
  and `reconciledAt` / `revenueFiscalYearEnd` — those cells become unavailable.
- `makeOverviewBullets` in full. Every bullet asserts something unsourced
  (country footprint, market cap, ownership share, debt totals), and
  `flaggedPool` invents environmental, human-rights, and governance allegations
  against real named companies. That is the highest-risk code in the repo for an
  advocacy tool and should not survive this issue in any form.

Move out:

- `formatUsdShortValue` → `web/src/lib/`. It is a currency formatter, not mock
  data, but it lives in the mock file and three blocks import it from there
  ([company-header.tsx:1](../web/src/domains/companies/blocks/company-header.tsx),
  [company-shareholders-section.tsx:14](../web/src/domains/companies/blocks/company-shareholders-section.tsx),
  [company-debt-section.tsx:9](../web/src/domains/companies/blocks/company-debt-section.tsx)).
  ARCHITECTURE.md puts formatters in `lib/`. After the move `company-header`
  stops needing it at all.

Keep, renamed: the tree / holders / debt generators, in a file named for what it
is (`mock-sections.ts`) so no future reader mistakes it for a data layer.

### `web/src/domains/companies/types.ts`

- `CompanyData` and `CompanyDetail` retire in favor of `Company`.
- `OverviewBullet` goes with the mock bullets.
- `TreeEntity`, `Shareholder`, `DebtInstrument` stay as the mock sections' prop
  types. They are view models, not domain types, and should not be promoted into
  `types/domain.ts` — the real versions of those concepts already exist there
  (`CorporateRelationship`, `HistoricShareholder`, `HistoricCommercialDebt`).
- The `overviewSource` / `treeSource` / `shareholdersSource` / `debtSource`
  prose strings go for company-info, replaced by real `Source[]`. The three mock
  sections keep theirs until their processors land.

### `jobs/transform_companies.py` (887 lines)

Roughly 700 lines are mock generators and their fixtures — `mock_aliases`,
`mock_founded_on`, `mock_leaders`, `mock_addresses`, `mock_debt`,
`_mock_equity_history`, `_mock_debt_security`, plus `FIRST_NAMES`, `LAST_NAMES`,
`STREET_NAMES`, `COUNTRY_CITIES`, `COUNTRY_SECONDARY_CITIES`,
`INSTITUTIONAL_INVESTORS`, `DEBT_HOLDERS`, `HISTORIC_NAME_PATTERNS`. All of it
goes.

The file is not referenced by the deploy workflow, so it is dead code today.
Resolve the fork rather than leaving two scripts: fold the `Company`-mapping
logic into `build_dataset.py` and delete this file. Only `build_source`,
`_strip_corporate_suffix`, and the sector-mapping shape are worth carrying over,
and `build_source` needs its provenance corrected (see step 4).

`SECTOR_TO_SIC_MAP` (177 entries) also goes, per open question 1 — it resolves
14 of 74 LSEG labels because it is keyed to the old LLM sector names.

### Name collision on `Company`

Once `Company` is the canonical domain type, two local declarations shadow the
concept: [search.tsx:13](../web/src/components/search.tsx) and
[use-all-companies-search.ts:17](../web/src/domains/companies/hooks/use-all-companies-search.ts)
both declare a `Company` describing a *Pagefind search result*, which is a
different thing with different fields. Rename both to `CompanySearchResult`.
Cheap now, confusing later.

### Two pipeline inputs become unnecessary

`build_dataset.py` takes three input files today. After this change it needs
one — the parquet.

- **`COUNTRY_CODES_FILE_PATH`** exists solely to produce `countryCode`, and
  `countryCode` is never rendered. It appears only in type declarations, in
  `mock-detail.ts:164` (setting `TreeEntity.countryCode`, which no component
  reads), and in the write-only Pagefind meta. There are no flag icons. Drop the
  field, the map, and the env var. `countryName` — which *is* consumed by search
  results — is the parsed HQ country name and needs no code lookup.
- **`COMPANY_EXTRAS_FILE_PATH`** supplied `sectors` (now superseded by real LSEG
  data) and `subsidiaries`. After the overview bullets are deleted, the only
  remaining reader of `subsidiaries` is the mock tree's entity naming
  (`mock-detail.ts:180`), which already falls back to a synthetic name. Drop the
  file and its env var rather than keeping an LLM-generated artifact on the
  production path for cosmetic mock labels.

Both can return when a real consumer appears, per the ARCHITECTURE.md rule about
not promoting something until a second caller exists.

### Repo hygiene

- `.gitignore`: add `__pycache__/`. `jobs/__pycache__/` is currently untracked
  and shows up in `git status`. (`data` and `.venv` are already ignored, so
  `data/output/companies.json` is a local artifact, not a committed fixture —
  worth knowing before anyone goes looking for the 847-record file in git.)
- `jobs/README.md` is a stub that breaks off mid-list (`- EIN` / `-`). Replace it
  with the real parquet → `Company` contract, which is the one piece of
  documentation this change genuinely needs.
- Decide whether `plans/` is committed or ignored; it is untracked right now.

## Assumptions

- **"Primary Industry" means `primary_industry_group_label`** — the finest of
  the three TRBC levels, and the closest to the spec's "LSEG Industry".
  `primary_economic_sector_label` (11 clean values) is the better field for
  faceted search later.
- **Exchange displays the MIC from `exchange`, falling back to `exchange_code`.**
  Only 8 distinct MICs exist, so a MIC→label map (`XNYS` → NYSE, `XNGS` →
  Nasdaq) is cheap and worth adding. `exchange` is a strict subset of
  `exchange_code` coverage (163 vs 179 — every row with a MIC also has a code),
  so the fallback lifts effective coverage to 179.

  `XXXX` is **not** a no-exchange marker, which is what it looks like at first
  glance. All 5 rows carrying it have real `exchange_code` values (`NAQ`, `NYQ`,
  `NMQ`, `NYQ`, `NSQ` — Nasdaq and NYSE variants), so those companies are
  listed and only the MIC is missing. Treat `XXXX` as "MIC unknown" and fall
  through to `exchange_code`; treating it as unavailable would discard five
  known exchanges.
- **`investor_name` is the company name.** It is the PermID Info API's field
  name, carried into the spec verbatim; these rows are debt lendees, not
  investors. Renaming it to `company_name` upstream is a separate spec change.
- The company universe drops from 847 to 219 because the parquet is CDT-only.
  Confirmed expected; more rows arrive as processors land.
- No test framework exists, so acceptance criteria are build-time assertions and
  manual checks rather than unit tests.

## Out of scope

- Any filtering, including on `activity_status` (17 inactive companies ship).
- Market Cap / Revenue / Employees / Description — blocked on company-facts.
- Real Tree / Holders / Debt data.
- Parsing `hq_address` beyond its country line; surfacing the street address
  itself, LEI, founded date, RIC, or activity status.
- Primary CIK selection logic.
- OpenFIGI fields (`cusip`, `figi_code`, `isin`) — not implemented upstream.
- The `/companies` list page, which is still a stub.

## Open questions and risks

1. **Dropping SIC/NAICS codes for sectors is a real loss, not just cleanup.**
   `SECTOR_TO_SIC_MAP` resolves 14 of 74 LSEG labels, so keeping it means mostly
   empty codes; dropping it means TRBC labels with no code at all. If anything
   downstream needs SIC — the spec's Shareholder Tracker inputs list
   `investor_industry_code` as SIC — a TRBC→SIC crosswalk becomes real work
   someone has to own. Recommend dropping for this issue and revisiting when a
   consumer actually needs the code.
2. **`last_processed` format is `20260801T033040`**, not the `YYYY-MM-DD` the
   spec uses elsewhere. Parse defensively; the upstream format is unsettled.
3. Three sections still showing mock data on a page whose header is now real is
   a credibility risk. The section-level source text is what carries that
   distinction — it should be unmissable, not a footnote.
4. **HQ country is positional parsing of a free-text blob.** Taking the last
   line of `hq_address` works for all 219 rows today, but nothing guarantees
   LSEG always terminates the address with a country — if it ever omits that
   line, the parser silently returns a state or a postcode and the UI presents
   it as a country. Validate the parsed value and fall back to `incorporated_in`
   with a build warning rather than trusting position alone. Only 13 distinct
   country values appear across `hq_address`, `incorporated_in`, and
   `domiciled_in`, so a validation set is cheap.
5. The three stat cells and Description are the most prominent elements in the
   header, and all four become unavailable. Worth a design look before
   implementation — an unavailable state repeated four times across the top of
   every page may read as a broken page rather than a scoped one.
