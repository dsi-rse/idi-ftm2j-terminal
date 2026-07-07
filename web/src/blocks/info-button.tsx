import { forwardRef, type ButtonHTMLAttributes } from "react";

import { InfoIcon } from "@/components/icon";
import { cn } from "@/lib/utils";

type InfoButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  "aria-label": string;
};

/**
 * An icon-only info button — visually just the {@link InfoIcon}, with no
 * border, background, extra padding, or hover recoloring. Commonly composed
 * as a {@link Tooltip.Trigger} to reveal supplemental info on hover
 * (desktop) or on tap (mobile).
 *
 * Forwards its ref so Base UI's `Tooltip.Trigger` (which uses a render prop)
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
          "text-muted cursor-pointer",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          className,
        )}
      >
        <InfoIcon className="size-4" />
      </button>
    );
  },
);
