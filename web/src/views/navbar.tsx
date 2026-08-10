"use client";

import { Navbar as NavbarBlock } from "@/blocks/navbar";
import { ThemeToggle } from "@/blocks/theme-toggle";
import { SiteLogo } from "@/components/logo";

/**
 * The navigation bar for the FTM2J Terminal site.
 */
export function Navbar() {
  const links = [
    { href: "/companies", label: "Companies" },
    { href: "/about", label: "About" },
    { href: "/methodology", label: "Methodology" },
    { href: "/downloads", label: "Downloads" },
    { href: "/help", label: "Help" },
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
      </NavbarBlock.List>
      <NavbarBlock.Extras>
        <ThemeToggle />
      </NavbarBlock.Extras>
    </NavbarBlock>
  );
}
