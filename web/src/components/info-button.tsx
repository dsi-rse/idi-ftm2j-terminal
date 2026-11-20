import { Info } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type InfoButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  "aria-label": string;
};

/**
 * An icon-only info button: a circled "i", with no border, background or extra
 * padding, muted until hovered. Composed as a {@link Popover.Trigger} to reveal
 * supplemental info on click or tap; the section cards' titles and the company
 * facts both use it, so every (i) on a page looks and behaves the same.
 *
 * A component rather than a block because it is one control, and so both
 * blocks and domain blocks can import it. The icon is lucide's, not
 * `components/icon`'s, since a component cannot import another component.
 *
 * Forwards its ref so Base UI's `Popover.Trigger` (which uses a render prop)
 * can attach event handlers.
 */
export const InfoButton = forwardRef<HTMLButtonElement, InfoButtonProps>(
  function InfoButton({ className, type = "button", ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        {...props}
        className={cn(
          "inline-flex text-muted cursor-pointer hover:text-foreground",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          className,
        )}
      >
        <Info aria-hidden className={cn("size-4")} />
      </button>
    );
  },
);
