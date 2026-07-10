"use client";

import { Button } from "@base-ui/react/button";
import { Dialog } from "@base-ui/react/dialog";
import { NavigationMenu } from "@base-ui/react/navigation-menu";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import React, {
  createContext,
  type Dispatch,
  type PropsWithChildren,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useState,
} from "react";

type NavbarContext = {
  isOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  close: () => void;
  brand: ReactNode;
  setBrand: Dispatch<SetStateAction<ReactNode>>;
  extras: ReactNode;
  setExtras: Dispatch<SetStateAction<ReactNode>>;
};

/**
 * The context for the {@link Navbar} compound component.
 */
const NavbarContext = createContext<NavbarContext | null>(null);

/**
 * Context provider for the {@link Navbar} compound component.
 */
const NavbarProvider = ({ children }: PropsWithChildren) => {
  const [isOpen, setIsOpen] = useState(false);
  const [brand, setBrand] = useState<ReactNode>(null);
  const [extras, setExtras] = useState<ReactNode>(null);
  const close = () => setIsOpen(false);
  return (
    <NavbarContext.Provider
      value={{ isOpen, setIsOpen, close, brand, setBrand, extras, setExtras }}
    >
      {children}
    </NavbarContext.Provider>
  );
};

/**
 * A hook for using navigation bar context within a {@link NavbarProvider} subtree.
 */
function useNavbar() {
  const context = React.useContext(NavbarContext);
  if (context === null) {
    throw new Error("useNavbar must be used within a NavbarProvider");
  }
  return context;
}

type NavbarLinkProps = {
  href: string;
};

/**
 * The root of the {@link Navbar} compound component.
 * Defines a shell that distributes space evenly among
 * its children and applies margin and padding.
 */
function NavbarRoot({ children }: PropsWithChildren) {
  return (
    <NavbarProvider>
      <NavigationMenu.Root className="relative bg-background/95 backdrop-blur">
        <div className="mx-12 py-4 flex items-center gap-4">{children}</div>
      </NavigationMenu.Root>
    </NavbarProvider>
  );
}

/**
 * The navigation bar home page link. Wraps the site brand (e.g., name, logo).
 * Also publishes its content into context so the mobile modal can render a
 * matching copy in its own header.
 */
function NavbarBrand({ children }: PropsWithChildren) {
  const { setBrand } = useNavbar();
  useEffect(() => {
    setBrand(children);
  }, [children, setBrand]);
  return (
    <Link href="/" aria-label="Home page">
      {children}
    </Link>
  );
}
NavbarBrand.displayName = "Navbar.Brand";

/**
 * A trailing slot for auxiliary controls (e.g., a theme toggle).
 *
 * Renders inline on desktop as a peer of {@link NavbarList}. On mobile, the
 * same children are also rendered inside the fullscreen menu modal, below a
 * thin transparent horizontal rule that separates them from the nav links.
 */
function NavbarExtras({ children }: PropsWithChildren) {
  const { setExtras } = useNavbar();
  useEffect(() => {
    setExtras(children);
  }, [children, setExtras]);
  return (
    <div className="hidden lg:flex items-center gap-2 lg:ml-4">{children}</div>
  );
}
NavbarExtras.displayName = "Navbar.Extras";

/**
 * Renders a responsive, unordered list (`ul`) of navigation bar items.
 * On viewports below the `lg` breakpoint, opens the same items inside a
 * fullscreen modal via Base UI's Dialog.
 */
function NavbarList({ children }: PropsWithChildren) {
  const { isOpen, setIsOpen, close, brand, extras } = useNavbar();
  return (
    <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
      <NavigationMenu.List className="hidden lg:flex ml-auto items-center gap-6 text-sm list-none p-0 m-0">
        {children}
      </NavigationMenu.List>
      <Dialog.Trigger
        render={
          <Button
            type="button"
            aria-label={isOpen ? "Close menu" : "Open menu"}
            aria-controls="mobile-nav-menu"
            className="ml-auto p-2 rounded-sm bg-transparent border-0 cursor-pointer text-muted hover:bg-overlay hover:text-foreground lg:hidden"
          />
        }
      >
        {isOpen ? (
          <X className="size-4" aria-hidden />
        ) : (
          <Menu className="size-4" aria-hidden />
        )}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 lg:hidden" />
        <Dialog.Popup
          id="mobile-nav-menu"
          className="fixed inset-0 z-50 flex flex-col bg-background pt-1 transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 lg:hidden"
        >
          <Dialog.Title className="sr-only">Site navigation</Dialog.Title>
          <div className="mx-12 py-4 flex items-center justify-between gap-4">
            <Link href="/" aria-label="Home page" onClick={close}>
              {brand}
            </Link>
            <Dialog.Close
              render={
                <Button
                  type="button"
                  aria-label="Close menu"
                  className="p-2 rounded-sm bg-transparent border-0 cursor-pointer text-muted hover:bg-overlay hover:text-foreground"
                />
              }
            >
              <X className="size-4" aria-hidden />
            </Dialog.Close>
          </div>
          <NavigationMenu.List className="mx-12 py-6 flex flex-col gap-4 text-lg list-none p-0 m-0">
            {children}
          </NavigationMenu.List>
          {extras ? (
            <>
              <hr
                aria-hidden
                className="mx-12 border-0 border-t border-foreground/10"
              />
              <div className="mx-12 py-6 flex items-center justify-between gap-4">
                {extras}
              </div>
            </>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
NavbarList.displayName = "Navbar.List";

/**
 * A navigation bar list item (`li`). Serves as a container for
 * heterogeneous content like links, buttons, dropdowns, etc.
 */
function NavbarListItem({ children }: PropsWithChildren) {
  return <NavigationMenu.Item>{children}</NavigationMenu.Item>;
}
NavbarListItem.displayName = "Navbar.List.Item";

/**
 * A responsive navigation bar link.
 */
function NavbarLink({ href, children }: PropsWithChildren<NavbarLinkProps>) {
  const { close } = useNavbar();
  return (
    <>
      <NavigationMenu.Link
        render={<Link href={href} />}
        className="hidden lg:block py-1 text-muted hover:text-primary"
      >
        {children}
      </NavigationMenu.Link>
      <NavigationMenu.Link
        render={<Link href={href} />}
        onClick={close}
        className="block py-1 text-muted hover:text-primary lg:hidden"
      >
        {children}
      </NavigationMenu.Link>
    </>
  );
}
NavbarLink.displayName = "Navbar.Link";

/**
 * Wraps and customizes the Base UI {@link NavigationMenu} component.
 */
export const Navbar = Object.assign(NavbarRoot, {
  Brand: NavbarBrand,
  List: Object.assign(NavbarList, {
    Item: NavbarListItem,
  }),
  Link: NavbarLink,
  Extras: NavbarExtras,
});
