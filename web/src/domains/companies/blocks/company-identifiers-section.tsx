import type { ReactNode } from "react";

import { SectionCard } from "@/blocks/section-card";
import { cn } from "@/lib/utils";
import type { Company } from "@/types/domain";

import { NOT_AVAILABLE } from "../not-available";

const identifierLinkClassName =
  "type-figure underline decoration-dotted underline-offset-2 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/** One labelled identifier: a micro-label over one or more values. */
function Identifier({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1 min-w-0")}>
      <dt className={cn("type-label whitespace-nowrap")}>{label}</dt>
      <dd className={cn("m-0 flex flex-wrap gap-x-3 gap-y-1 type-value")}>
        {children}
      </dd>
    </div>
  );
}

/**
 * The company's stable identifiers. A reader following the money needs the
 * keys other registries use: the PermID this record is built on, every SEC
 * registrant CIK (linked to its EDGAR filing index), and the CUSIPs its
 * securities trade under. CIK absence is a data gap and is said so; CUSIP
 * absence is the norm (most issuers' securities are unresolved) and the pair
 * is simply omitted.
 */
function IdentifiersRow({ company }: { company: Company }) {
  const permIdUrl =
    company.sources[0]?.url ?? `https://permid.org/1-${company.permId}`;
  const several = company.registrants.length > 1;
  return (
    // A description list, so a screen reader announces each label with its
    // value and the group's name. An aria-label on a plain div is inert.
    <dl
      className={cn("m-0 flex flex-wrap gap-x-8 gap-y-3")}
      aria-label="Identifiers"
    >
      <Identifier label="PermID">
        <a
          href={permIdUrl}
          target="_blank"
          rel="noreferrer"
          className={cn(identifierLinkClassName)}
        >
          {company.permId}
        </a>
      </Identifier>
      <Identifier label={several ? "CIKs" : "CIK"}>
        {company.registrants.length === 0 ? (
          <span className={cn("text-muted")}>{NOT_AVAILABLE}</span>
        ) : (
          company.registrants.map((registrant) => (
            <span key={registrant.cik} className={cn("whitespace-nowrap")}>
              <a
                href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${registrant.cik}`}
                target="_blank"
                rel="noreferrer"
                className={cn(identifierLinkClassName)}
              >
                {registrant.cik}
              </a>
              {several && registrant.registrantName ? (
                <span className={cn("text-muted")}>
                  {" "}
                  {registrant.registrantName}
                </span>
              ) : null}
            </span>
          ))
        )}
      </Identifier>
      {company.cusips.length > 0 ? (
        <Identifier label={company.cusips.length > 1 ? "CUSIPs" : "CUSIP"}>
          {company.cusips.map((cusip) => (
            <span key={cusip} className={cn("type-figure")}>
              {cusip}
            </span>
          ))}
        </Identifier>
      ) : null}
    </dl>
  );
}

/**
 * The "Identifiers" section, last on the company page: the keys other
 * registries use for this company. They opened the Overview card until #67;
 * a reader cross-referencing needs them, but they are not the summary, so they
 * moved to the end, below the data they key.
 *
 * No tab in the section bar: four tabs already fill a phone's width, and a
 * fifth would overflow it.
 */
export function CompanyIdentifiersSection({ company }: { company: Company }) {
  return (
    <SectionCard id="identifiers" title="Identifiers" expandable={false}>
      <IdentifiersRow company={company} />
    </SectionCard>
  );
}
