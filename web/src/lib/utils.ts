import { ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge only knows Tailwind's default theme. A custom size such as
 * `text-value` is read as an unknown `text-*` class and lumped in with the text
 * colours, so `cn("text-value", "text-muted")` silently drops the size. The
 * tokens `globals.css` adds are registered here so merging treats them as what
 * they are.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["micro", "value"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
