"use client";

import { Maximize2 } from "lucide-react";
import { useState, type PropsWithChildren, type ReactNode } from "react";

import { InfoButton } from "@/components/info-button";
import { Modal } from "@/components/modal";
import { Popover } from "@/components/popover";
import { cn } from "@/lib/utils";

type SectionCardProps = {
  id: string;
  title: string;
  subtitle?: string;
  /**
   * Body of the info popover that opens from the (i) beside the title on click
   * or tap. Omit it for a section whose contents explain themselves; the button
   * is not shown.
   */
  info?: ReactNode;
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
  /**
   * Whether the card offers the expand-to-fullscreen button. Off for a
   * section that fits inline in full and gains nothing from a modal.
   */
  expandable?: boolean;
  className?: string;
};

/**
 * A section panel used to compose the company detail page: dark card with a
 * title, subtitle, optional info popover, expand-to-fullscreen button, and a source
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
  expandable = true,
  className,
  children,
}: PropsWithChildren<SectionCardProps>) {
  const [isExpanded, setIsExpanded] = useState(false);
  // The (i) explains the section, so it sits with the title; expand acts on the
  // whole card, so it keeps the far corner.
  //
  // Click to open, click to close, and nothing on hover: the toggletip pattern
  // (Carbon's Toggletip, Spectrum's ContextualHelp) for an info icon whose
  // content is a few sentences rather than a label. A Tooltip closes when its
  // trigger is clicked and never opens on a tap. Hover-and-click was tried and
  // dropped (#62): a click on a hover-opened popup toggled it shut, so the
  // reader who hovers and then clicks to keep it open lost it instead.
  const infoPopover = info ? (
    <Popover>
      <Popover.Trigger
        render={<InfoButton aria-label={infoLabel ?? `About ${title}`} />}
      />
      <Popover.Content title={title}>{info}</Popover.Content>
    </Popover>
  ) : null;
  return (
    <section
      id={id}
      className={cn(
        "w-full rounded-card border border-muted/25 bg-overlay/40 p-4 scroll-mt-16",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-4 mb-4">
        <Modal.Heading
          title={title}
          subtitle={subtitle}
          titleAddon={infoPopover}
        />
        <div className="flex items-center gap-1 shrink-0">
          {expandable ? (
            <Modal open={isExpanded} onOpenChange={setIsExpanded}>
              <Modal.Trigger
                aria-label={`Expand ${title}`}
                className="text-muted cursor-pointer p-1 rounded-control hover:text-foreground hover:bg-overlay focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <Maximize2 className="size-4" aria-hidden />
              </Modal.Trigger>
              <Modal.Content title={title}>
                <Modal.Header title={title} subtitle={subtitle} />
                <Modal.Body>{expanded ?? children}</Modal.Body>
              </Modal.Content>
            </Modal>
          ) : null}
        </div>
      </header>
      <div>{children}</div>
      {source ? (
        <footer className="mt-4 pt-4 border-t border-muted/15 type-caption">
          <span className="type-label mr-2">
            Source.
          </span>
          {source}
        </footer>
      ) : null}
    </section>
  );
}
