import { SectionCard } from "@/blocks/section-card";
import type { Company, Source } from "@/types/domain";

type CompanyOverviewSectionProps = {
  company: Company;
};

type Fact = {
  label: string;
  value: string;
};

/**
 * Collect the facts the company-info dataset actually supports. Anything not
 * derivable from a cited source is omitted rather than filled in — an
 * uncited claim on a company page is worse than a missing one.
 */
function collectFacts(company: Company): Fact[] {
  const facts: Fact[] = [];

  if (company.currentIndustry) {
    const broader = company.currentSectors.map((s) => s.name).join(" · ");
    facts.push({
      label: "Classification",
      value: broader
        ? `${company.currentIndustry.name} (${broader})`
        : company.currentIndustry.name,
    });
  }

  if (company.hqCountry) {
    const sameCountry = company.hqCountry === company.incorporatedCountry;
    facts.push({
      label: "Location",
      value:
        sameCountry || !company.incorporatedCountry
          ? `Headquartered in ${company.hqCountry}.`
          : `Headquartered in ${company.hqCountry}; incorporated in ${company.incorporatedCountry}.`,
    });
  }

  const ticker = company.currentListing?.ticker;
  if (ticker) {
    facts.push({ label: "Listing", value: `Trades as ${ticker}.` });
  }

  return facts;
}

function formatSource(sources: Source[]): string | undefined {
  if (sources.length === 0) return undefined;
  const [source] = sources;
  return `${source.name} — ${source.url} (last accessed ${source.lastAccessed}).`;
}

function FactList({ facts }: { facts: Fact[] }) {
  if (facts.length === 0) {
    return (
      <p className="text-sm text-muted leading-relaxed m-0">
        No sourced overview is available for this company yet. A narrative
        description requires the company-facts processor, which extracts it from
        the registrant&apos;s own 10-K.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3 list-none m-0 p-0">
      {facts.map((fact) => (
        <li key={fact.label} className="flex items-start gap-3">
          <span aria-hidden className="mt-1.5 inline-block size-2 shrink-0 bg-muted" />
          <p className="text-sm text-foreground leading-relaxed m-0">
            <span className="font-semibold">{fact.label}.</span>{" "}
            <span className="text-muted">{fact.value}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}

/**
 * The "Overview" section of the company detail page.
 *
 * Every fact here is derived from the company-info dataset and cites its
 * source. The section is deliberately thin: the fuller narrative description
 * the design calls for depends on the company-facts processor, so until that
 * exists the section says as much rather than inventing prose.
 */
export function CompanyOverviewSection({ company }: CompanyOverviewSectionProps) {
  const facts = collectFacts(company);
  const source = formatSource(company.sources);
  const asOf = company.currentIndustry?.asOf ?? company.sources[0]?.lastAccessed;

  return (
    <SectionCard
      id="overview"
      title="Overview"
      subtitle={asOf ? `Company info · as of ${asOf}` : "Company info"}
      info="Identity, classification, and listing details resolved from LSEG PermID. Financial figures and a narrative description require the company-facts processor and are not yet available."
      source={source}
      expanded={
        <div className="max-w-3xl mx-auto text-base">
          <FactList facts={facts} />
          {source ? (
            <p className="mt-8 text-xs text-muted leading-relaxed">
              <span className="font-mono uppercase tracking-wider font-medium mr-2">
                Source.
              </span>
              {source}
            </p>
          ) : null}
        </div>
      }
    >
      <FactList facts={facts} />
    </SectionCard>
  );
}
