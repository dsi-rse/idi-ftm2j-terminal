import type { Company } from "@/types/domain";

type CompanyHeaderProps = {
  company: Company;
};

/**
 * The top-of-page header for a company: its name, and nothing else.
 *
 * The facts that used to sit here in bordered cells (industry, HQ country,
 * listing, ticker, public float, revenue) moved into the Overview card in #67,
 * so the page opens on one summary rather than a strip of boxes above a card of
 * boxes. No bottom rule either: the section tab bar right below draws its own.
 */
export function CompanyHeader({ company }: CompanyHeaderProps) {
  return (
    <header className="w-full">
      <h1 className="type-display tracking-tight text-3xl md:text-4xl leading-none">
        {company.name}
      </h1>
    </header>
  );
}
