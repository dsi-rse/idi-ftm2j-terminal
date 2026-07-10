"use client";

import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type { ComponentPropsWithoutRef } from "react";

type SwitchProps = ComponentPropsWithoutRef<typeof BaseSwitch.Root>;

/**
 * A stylized pill switch built on Base UI's `Switch`.
 *
 * The `children` are rendered inside the thumb so callers can place a small
 * icon (e.g. sun/moon) that slides with the thumb.
 */
export function Switch({ children, className, ...props }: SwitchProps) {
  return (
    <BaseSwitch.Root
      {...props}
      className={[
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full",
        "border border-muted/40 bg-overlay p-0.5 cursor-pointer",
        "transition-colors duration-200",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        "bg-primary data-[checked]:bg-primary/25 border-primary/50",
        "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <BaseSwitch.Thumb
        className={[
          "flex size-5 items-center justify-center rounded-full",
          "bg-background text-foreground shadow-sm",
          "transition-transform duration-200 ease-out",
          "data-[checked]:translate-x-5",
        ].join(" ")}
      >
        {children}
      </BaseSwitch.Thumb>
    </BaseSwitch.Root>
  );
}
