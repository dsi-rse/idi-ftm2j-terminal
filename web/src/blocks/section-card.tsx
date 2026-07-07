"use client";

import { Maximize2 } from "lucide-react";
import { useState, type PropsWithChildren, type ReactNode } from "react";

import { InfoButton } from "@/blocks/info-button";
import { Modal } from "@/components/modal";
import { Tooltip } from "@/components/tooltip";
import { cn } from "@/lib/utils";

type SectionCardProps = {
  id: string;
  title: string;
  subtitle?: string;
  /** Body of the info tooltip that opens from the (i) button. */
  info: ReactNode;
  /** Aria-label for the info button. Defaults to "About {title}". */
  infoLabel?: string;
  /** Source citation rendered as the small "SOURCE. …" footer inside the card. */
  source?: ReactNode;
  /**
   * Optional expanded body shown inside the fullscreen modal. Falls back to
   * `children` when omitted — use this when the section renders a paginated
   * inline view but a full unpaginated view in the modal.
   */
  expanded?: ReactNode;
  className?: string;
};

/**
 * A section panel used to compose the company detail page: dark card with a
 * title, subtitle, info tooltip, expand-to-fullscreen button, and a source
 * footer.
 *
 * The `expanded` prop lets a section render one variant inline (paginated,
 * compact) and a fuller variant inside the modal.
 */
export function SectionCard({
  id,
  title,
  subtitle,
  info,
  infoLabel,
  source,
  expanded,
  className,
  children,
}: PropsWithChildren<SectionCardProps>) {
  const [isExpanded, setIsExpanded] = useState(false);
  return (
    <section
      id={id}
      className={cn(
        "w-full rounded-md border border-muted/25 bg-overlay/40 p-4 md:p-6 scroll-mt-16",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-4 mb-4">
        <div className="flex flex-col gap-1 min-w-0">
          <h2 className="font-inter-tight tracking-tight text-lg md:text-xl font-semibold text-foreground">
            {title}
          </h2>
          {subtitle ? (
            <p className="text-[11px] md:text-xs text-muted">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Tooltip>
            <Tooltip.Trigger
              render={<InfoButton aria-label={infoLabel ?? `About ${title}`} />}
            />
            <Tooltip.Content title={title}>{info}</Tooltip.Content>
          </Tooltip>
          <Modal open={isExpanded} onOpenChange={setIsExpanded}>
            <Modal.Trigger
              aria-label={`Expand ${title}`}
              className="text-muted cursor-pointer p-1 rounded-sm hover:text-foreground hover:bg-overlay focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Maximize2 className="size-4" aria-hidden />
            </Modal.Trigger>
            <Modal.Content title={title}>
              <Modal.Header title={title} subtitle={subtitle} />
              <Modal.Body>{expanded ?? children}</Modal.Body>
            </Modal.Content>
          </Modal>
        </div>
      </header>
      <div>{children}</div>
      {source ? (
        <footer className="mt-6 pt-4 border-t border-muted/15 text-[10px] md:text-xs text-muted leading-relaxed">
          <span className="uppercase tracking-wider font-medium mr-2">
            Source.
          </span>
          {source}
        </footer>
      ) : null}
    </section>
  );
}
