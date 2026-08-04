/**
 * Scrolls the section with `id` into view, the way in-page navigation behaves
 * everywhere on the company detail page.
 *
 * This exists so there is one definition of "go to a section" rather than one
 * per call site. The tab bar and the Overview's stat cards both navigate to the
 * same four sections, and they sit in sibling `blocks/` files that are not
 * allowed to import each other, so the behaviour has to live a layer down.
 *
 * `scroll-margin-top` on the section cards is what keeps the target clear of the
 * pinned tab bar — `scrollIntoView` honours it, so no pixel offset is applied
 * here.
 *
 * Motion is animated only for readers who have not asked otherwise: `smooth`
 * ignores `prefers-reduced-motion` on its own, so the preference is checked and
 * the scroll falls back to an instant jump.
 *
 * @param id The target element's id, without a leading `#`.
 * @returns Whether an element with that id was found.
 */
export function scrollToSection(id: string): boolean {
  const target = document.getElementById(id);
  if (!target) return false;

  const prefersReducedMotion = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  target.scrollIntoView({
    behavior: prefersReducedMotion ? "auto" : "smooth",
    block: "start",
  });
  return true;
}
