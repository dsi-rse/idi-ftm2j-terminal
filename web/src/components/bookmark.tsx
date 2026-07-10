import { Button } from "@base-ui/react";
import { StarIcon } from "lucide-react";
import { useState } from "react";

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
      className="rounded-sm bg-transparent border-0 cursor-pointer"
      onClick={toggleBookmark}
    >
      <StarIcon
        className={`h-3 w-3 stroke-1 ${isSelected ? "fill-primary text-primary" : "text-muted hover:fill-primary stroke-muted"}`}
      />
    </Button>
  );
}
