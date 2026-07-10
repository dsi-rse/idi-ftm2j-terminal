import { SectionCard } from "@/blocks/section-card";
import type {
  CompanyDetail,
  OverviewBullet,
} from "@/domains/companies/types";
import { cn } from "@/lib/utils";

type CompanyOverviewSectionProps = {
  detail: CompanyDetail;
};

function BulletMarker({ flag }: { flag?: OverviewBullet["flag"] }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-1.5 inline-block size-2 shrink-0",
        flag ? "bg-primary" : "bg-muted",
      )}
    />
  );
}

function BulletList({ bullets }: { bullets: OverviewBullet[] }) {
  return (
    <ul className="flex flex-col gap-3 list-none m-0 p-0">
      {bullets.map((bullet, i) => (
        <li key={`${bullet.label}-${i}`} className="flex items-start gap-3">
          <BulletMarker flag={bullet.flag} />
          <p className="text-sm text-foreground leading-relaxed m-0">
            <span className="font-semibold">{bullet.label}.</span>{" "}
            <span className="text-muted">{bullet.text}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}

/**
 * The "Overview" section of the company detail page. Renders 3–4+ key
 * facts as a bulleted list. The expanded modal view shows all bullets at
 * a slightly larger scale.
 */
export function CompanyOverviewSection({ detail }: CompanyOverviewSectionProps) {
  return (
    <SectionCard
      id="overview"
      title="Overview"
      subtitle={`Key facts · reconciled ${detail.reconciledAt}`}
      info="A synthesized summary of the company's business, scale, ownership structure, and any accountability flags surfaced by the FTM2J pipeline."
      source={detail.overviewSource}
      expanded={
        <div className="max-w-3xl mx-auto text-base">
          <BulletList bullets={detail.overviewBullets} />
          {detail.overviewSource ? (
            <p className="mt-8 text-xs text-muted leading-relaxed">
              <span className="uppercase tracking-wider font-medium mr-2">
                Source.
              </span>
              {detail.overviewSource}
            </p>
          ) : null}
        </div>
      }
    >
      <BulletList bullets={detail.overviewBullets} />
    </SectionCard>
  );
}
