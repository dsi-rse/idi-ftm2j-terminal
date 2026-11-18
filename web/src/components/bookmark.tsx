import { Button } from "@base-ui/react";
import { StarIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

type BookmarkButtonProps = React.SVGProps<SVGSVGElement> & {
  selected: boolean;
  bookmark: () => void;
  clearBookmark: () => void;
};

/*
 * A controlled bookmark button that toggles between selected and
 * unselected bookmark states. Represented by an SVG star icon that
 * is colored primary when selected and muted otherwise.
 */
export function BookmarkButton({
  selected,
  bookmark,
  clearBookmark,
}: BookmarkButtonProps) {
  const [isSelected, setIsSelected] = useState(selected);
  const toggleBookmark = () => {
    if (isSelected) {
      setIsSelected(false);
      clearBookmark();
    } else {
      setIsSelected(true);
      bookmark();
    }
  };
  return (
    <Button
      type="button"
      aria-label="Bookmark"
      className={cn(
        // A 24x24 hit area (WCAG 2.2 SC 2.5.8) around the 12px star. The
        // negative margin takes back the padding, so the button still lays out
        // at the icon's size and the row around it does not grow.
        "inline-flex size-6 -m-1.5 shrink-0 items-center justify-center",
        "rounded-control bg-transparent border-0 cursor-pointer",
      )}
      onClick={(event) => {
        // The star often sits inside a clickable row. Without this, saving a
        // company also opens it.
        event.stopPropagation();
        toggleBookmark();
      }}
    >
      <StarIcon
        className={cn(
          "h-3 w-3 stroke-1",
          isSelected
            ? "fill-primary text-primary"
            : "text-muted hover:fill-primary stroke-muted",
        )}
      />
    </Button>
  );
}
