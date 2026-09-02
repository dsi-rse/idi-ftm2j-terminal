# Architecture

This document captures the architectural conventions used in `web/src/`. It
describes what exists today and codifies the rules that keep the code shape
consistent as it grows. When a rule and the code disagree, the rule is the
target — bring the code back rather than the doc.

Read this before adding a new folder, a new hook, or your first component.

## Stack snapshot

- **Framework:** Next.js 16 (App Router), React 19, TypeScript
- **Rendering:** Static export via `@opennextjs/cloudflare`. Every route is
  build-time static.
- **UI primitives:** `@base-ui/react` (headless)
- **Styling:** Tailwind CSS v4, `clsx` + `tailwind-merge` via `cn()`
- **State:** Zustand (persisted to IndexedDB via `idb-keyval`)
- **Theming:** `next-themes` (class-based `.dark`)
- **Search:** `pagefind` (static full-text index)
- **Visualization:** `visx`, `three`, `three-globe`, `motion`

There is no server runtime, no request-time data fetching, no forms library,
and no test framework yet.

## Layer map

Imports flow strictly downward. Anything higher in the list may import from
anything lower; the reverse is forbidden.

```
  app/          Next.js routes                — thin, static-first
  views/        Page-level composers
  layouts/      Site-wide page shells
  domains/*     Domain bundles (blocks, hooks, stores, types)
  blocks/       Reusable page sections
  components/   Atomic UI primitives (wrap Base UI)
  hooks/        Truly sitewide hooks
  lib/          Sitewide utilities + external-library wrappers
  types/        Sitewide types (ambient .d.ts + shared interfaces)
```

Peer-lateral imports are forbidden inside `components/`, inside `blocks/`, and
across sibling domains. Those three constraints are the load-bearing rules of
the whole system.

## Folder rules

### [components/](../web/src/components/)

Atomic UI primitives. Each file wraps one thing — usually a `@base-ui/react`
primitive — and applies site styling via `cn()`.

- May import: `lib/`, `types/`, external libraries (`@base-ui/react`,
  `lucide-react`).
- Must NOT import: other components, blocks, domains, views, hooks.
- No barrel `index.ts` — import each component by file.

### [blocks/](../web/src/blocks/)

Reusable, domain-agnostic page sections. A block composes several components
plus its own layout/chrome; it never knows about a specific domain.

- May import: `components/`, `lib/`, `types/`, `hooks/` (sitewide only).
- Must NOT import: other blocks, domains, views.
- Barrel `index.ts` — re-exports the public API.

### [domains/&lt;name&gt;/](../web/src/domains/)

Self-contained bundles of everything specific to one business entity. Current
shape (see [domains/companies/](../web/src/domains/companies/)):

```
domains/companies/
  blocks/      domain-specific sections (compose components + top-level blocks)
  hooks/       domain-specific hooks
  stores/      Zustand stores
  types.ts     domain types
  mock-sections.ts / other domain-owned data helpers
```

- A domain may import: `components/`, top-level `blocks/`, `lib/`, `types/`,
  top-level `hooks/`, `layouts/`.
- A domain must NOT import from another domain. Cross-domain composition
  happens one layer up, in `views/` or `app/`.

### [views/](../web/src/views/)

Page-level composers. Wire domain output + blocks + layouts into a full
screen. Views hold layout composition, not business logic.

- May import: everything below (blocks, components, domains, layouts, hooks,
  lib, types).

### [layouts/](../web/src/layouts/)

Site-wide page shells (e.g., `StandardPageLayout`). Provide the outer chrome
that most pages share.

- May import: blocks, components, lib, types.

### [hooks/](../web/src/hooks/)

Only hooks that are genuinely sitewide belong here (currently just
[use-site-search.ts](../web/src/hooks/use-site-search.ts)). A hook does not
graduate to this folder until a second caller from another layer needs it.
Domain-specific hooks live inside their domain.

### [lib/](../web/src/lib/)

Sitewide utilities and thin wrappers over external libraries.
[cn()](../web/src/lib/utils.ts) (clsx + tailwind-merge) and formatters live
here.

### [types/](../web/src/types/)

Ambient `.d.ts` files (e.g., [pagefind.d.ts](../web/src/types/pagefind.d.ts))
and shared TypeScript interfaces used across more than one layer.

## Key patterns

### Compound components

Every non-trivial component in `components/` and `blocks/` exposes its parts
as static properties on the root, attached with `Object.assign`. Each part sets
`displayName` so DevTools shows the compound name.

```tsx
function TableRoot(props: TableRootProps) { /* ... */ }
TableRoot.displayName = "Table.Root";

function TableHead(props: TableHeadProps) { /* ... */ }
TableHead.displayName = "Table.Head";

export const Table = Object.assign(TableRoot, {
  Root: TableRoot,
  Head: TableHead,
  // ...
});
```

Callers compose with dot-access:

```tsx
<Table>
  <Table.Head>{/* ... */}</Table.Head>
  <Table.Body>{/* ... */}</Table.Body>
</Table>
```

Reference implementations: [table.tsx](../web/src/components/table.tsx),
[drawer.tsx](../web/src/components/drawer.tsx),
[modal.tsx](../web/src/components/modal.tsx),
[tabs.tsx](../web/src/components/tabs.tsx),
[tooltip.tsx](../web/src/components/tooltip.tsx).

### Controlled import flow

The layer map is a hard rule, not a suggestion. Concretely:

- A file in `components/` must not import from another file in `components/`.
- A file in `blocks/` must not import from another file in `blocks/`.
- A file in `domains/a/` must not import from `domains/b/`.

Layer violations are the leading indicator that a layer is drifting into
another. If two components need shared logic, that logic belongs one layer
down (`lib/`, `hooks/`, `types/`) — not sideways.

## Additional patterns

### App routes are thin orchestrators

Files under `web/src/app/` own Next-specific concerns only: `metadata`,
`generateStaticParams`, `dynamic` / `dynamicParams` config, and build-time data
loading. They then compose views, layouts, and (where needed) domain blocks.
No presentational logic lives in a route file.

Reference: [companies/[id]/page.tsx](../web/src/app/companies/[id]/page.tsx).
App routes are the one layer allowed to reach directly into a domain when a
view would be pure overhead; keep the file thin either way.

### Colocation over centralization

Anything specific to one domain lives inside that domain. Top-level `hooks/`,
`types/`, and `lib/` are reserved for artifacts that are genuinely shared
across layers or domains.

A new hook starts inside its domain
([domains/companies/hooks/](../web/src/domains/companies/hooks/)). Promote it
to top-level `hooks/` only when a caller from another layer actually appears.
Same rule for types and helpers.

### Design tokens + Base UI as the primitive layer

**Tokens.** All colors flow through CSS variables declared in
[app/globals.css](../web/src/app/globals.css) — the `--ftm2j-gray-*` and
`--ftm2j-gold-*` scales plus semantic tokens (`--background`, `--foreground`,
`--primary`, `--muted`, `--overlay`, …). Preference order:

1. Semantic token (`bg-primary`, `text-muted`)
2. Palette token (`bg-[--ftm2j-gold-500]`)
3. Raw hex — avoid; only allowed in `globals.css` where the tokens are defined.

**Composition.** All class strings go through
[cn()](../web/src/lib/utils.ts). Never concatenate class strings by hand.

**Base UI.** Every interactive primitive in `components/` wraps a
`@base-ui/react` headless component. Base UI is the bottom of the stack — its
presence is why `components/` files stay small and never need `forwardRef`
manually (Base UI forwards refs internally).

### File conventions + static-first rendering

**Naming and exports:**

- Filenames: kebab-case (`search-input.tsx`, `use-site-search.ts`,
  `theme-toggle.tsx`).
- Folders: kebab-case.
- Exports: named exports only. No `export default`, except where Next requires
  it (`app/**/page.tsx`, `layout.tsx`, `not-found.tsx`, etc.).
- Component identifiers: PascalCase.
- Hooks: `use-*` filename, `useX` identifier.
- Barrel `index.ts`: yes in `blocks/` and `layouts/`; no in `components/` (each
  component is imported by file, so a stray unused component is obvious).

**Rendering:**

- Routes set `export const dynamic = "force-static"` and
  `export const dynamicParams = false`.
- Data comes from `INPUT_DATA_DIR` at build time: a light `index.ndjson`
  selects and orders the pages to prerender, and each page reads only its own
  `detail/<shard>/<permId>.json`. The access layer lives in
  [domains/companies/dataset.ts](../web/src/domains/companies/dataset.ts).
- There is no server runtime. If you need request-time data, the answer is
  probably "generate more static params" or "move it client-side."

## Do / Don't

**Do**

- Put every class string through `cn()`.
- Colocate a new hook inside its domain first; graduate it later only if
  another layer needs it.
- Reach for a semantic token (`bg-primary`) before a palette value.
- Set `displayName` on every subcomponent of a compound.
- Keep app route files thin — data + metadata + composition, nothing else.

**Don't**

- Import a component from another component.
- Import a block from another block.
- Import from another domain.
- Introduce `export default` outside the Next-required files.
- Hardcode hex colors in JSX or Tailwind arbitrary values.
- Add request-time fetching — the site is static.
- Move a hook to top-level `hooks/` until a second, cross-layer caller exists.

## Verification

Quick spot-checks that the codebase still matches this doc:

```bash
# No cross-domain imports. A domain referencing its OWN path alias is fine, so
# each domain is checked against everything except itself — a bare
# `grep -rn "@/domains/" web/src/domains` reports every intra-domain import as a
# false positive.
for d in web/src/domains/*/; do
  n=$(basename "$d")
  grep -rn "@/domains/" "$d" | grep -v "@/domains/$n/"
done

# No default exports outside app/
grep -rn "export default" web/src/{components,blocks,domains,views,layouts,hooks,lib,types}

# No component-to-component imports (check a few files by hand)
grep -n "from \"\\./" web/src/components/*.tsx

# No block-to-block imports
grep -n "from \"\\./" web/src/blocks/*.tsx
```

Each of the first two commands should return nothing. The last two should only
show non-block sibling imports (types, local helpers), never another
`components/` or `blocks/` file.

To sanity-check theming, run `pnpm dev` in `web/` and toggle light/dark — the
`.dark` class on `<html>` is the only switch; every color reads from a token.
