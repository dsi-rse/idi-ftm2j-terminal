import { ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge only knows Tailwind's default theme. A custom size such as
 * `text-name` is read as an unknown `text-*` class and lumped in with the text
 * colours, so `cn("text-name", "text-muted")` silently drops the size. The
 * tokens `globals.css` adds are registered here so merging treats them as what
 * they are.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["label", "micro", "caption", "value", "name"] }],
      tracking: [{ tracking: ["label", "label-wide", "label-tight"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
