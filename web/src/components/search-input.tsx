"use client";

import { Autocomplete } from "@base-ui/react/autocomplete";
import { CircleX, Search } from "lucide-react";

import { cn } from "@/lib/utils";

type SearchInputProps = {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  className?: string;
};

/**
 * A presentational, controlled search input styled to match the site's search
 * bar. Renders the same magnifier icon + input shell as {@link SearchBar} but
 * without any autocomplete popup, hooks, or navigation. Callers own the value.
 */
export function SearchInput({
  value,
  onValueChange,
  placeholder,
  className,
}: SearchInputProps) {
  return (
    <Autocomplete.Root
      items={[]}
      mode="none"
      value={value}
      onValueChange={onValueChange}
    >
      <div className={cn("relative w-full", className)}>
        <Search
          aria-hidden
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted"
        />
        <Autocomplete.Input
          placeholder={placeholder}
          className="bg-muted-foreground text-xs w-full pl-8 pr-8 py-2 border border-muted/25 rounded-sm outline-none focus:ring-0.5 focus:ring-primary focus:border-primary"
        />
        {value !== "" && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onValueChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary rounded-full"
          >
            <CircleX className="size-4" />
          </button>
        )}
      </div>
    </Autocomplete.Root>
  );
}
