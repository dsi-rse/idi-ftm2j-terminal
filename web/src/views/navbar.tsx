"use client";

import { Search } from "lucide-react";

import { Navbar as NavbarBlock } from "@/blocks/navbar";
import { ThemeToggle } from "@/blocks/theme-toggle";
import { SiteLogo } from "@/components/logo";
import { SEARCH_FOCUS_HREF } from "@/lib/search-focus";

/**
 * The navigation bar for the FTM2J Terminal site.
 */
export function Navbar() {
  const links = [
    { href: "/about", label: "About" },
    { href: "/downloads", label: "Downloads" },
  ];
  return (
    <NavbarBlock>
      <NavbarBlock.Brand>
        <SiteLogo />
      </NavbarBlock.Brand>
      <NavbarBlock.List>
        {links.map((link) => (
          <NavbarBlock.List.Item key={link.href}>
            <NavbarBlock.Link href={link.href}>{link.label}</NavbarBlock.Link>
          </NavbarBlock.List.Item>
        ))}
        {/* Always lands on the home page's search bar, focused and ready to
            type -- including from a company page, whose rail has a search of
            its own. Icon-only on desktop; labelled in the mobile menu. */}
        <NavbarBlock.List.Item>
          <NavbarBlock.Link
            href={SEARCH_FOCUS_HREF}
            icon={<Search className="size-4" aria-hidden />}
            iconOnly
          >
            Search
          </NavbarBlock.Link>
        </NavbarBlock.List.Item>
      </NavbarBlock.List>
      <NavbarBlock.Extras>
        <ThemeToggle />
      </NavbarBlock.Extras>
    </NavbarBlock>
  );
}
