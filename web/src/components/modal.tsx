"use client";

import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ComponentPropsWithoutRef, PropsWithChildren } from "react";

import { cn } from "@/lib/utils";

type ModalRootProps = ComponentPropsWithoutRef<typeof Dialog.Root>;

/**
 * The root of the {@link Modal} compound component. Wraps Base UI's
 * `Dialog.Root`; use `open` / `onOpenChange` for controlled visibility.
 */
function ModalRoot(props: ModalRootProps) {
  return <Dialog.Root {...props} />;
}
ModalRoot.displayName = "Modal.Root";

const ModalTrigger = Dialog.Trigger;

type ModalContentProps = ComponentPropsWithoutRef<typeof Dialog.Popup> & {
  title: string;
  titleClassName?: string;
};

/**
 * The fullscreen surface for a {@link Modal}. Renders a fixed-position
 * container with a portalled backdrop; both fade in/out.
 *
 * Provide an accessible `title` — it is rendered visually inside
 * {@link ModalHeader} when used, but is required for a11y even without a
 * visible header.
 */
function ModalContent({
  title,
  titleClassName,
  className,
  children,
  ...popupProps
}: PropsWithChildren<ModalContentProps>) {
  return (
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
      <Dialog.Popup
        {...popupProps}
        className={cn(
          "fixed inset-0 z-50 flex flex-col bg-background transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
          className,
        )}
      >
        <Dialog.Title className={cn("sr-only", titleClassName)}>
          {title}
        </Dialog.Title>
        {children}
      </Dialog.Popup>
    </Dialog.Portal>
  );
}
ModalContent.displayName = "Modal.Content";

type ModalHeaderProps = {
  title: string;
  subtitle?: string;
  className?: string;
};

/**
 * The header strip inside a {@link Modal}. Renders a visible title, an
 * optional subtitle, and a close button on the right that dismisses the
 * modal via `Dialog.Close`.
 */
function ModalHeader({ title, subtitle, className }: ModalHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 border-b border-muted/25 px-6 md:px-12 py-4",
        className,
      )}
    >
      <div className="flex flex-col gap-1 min-w-0">
        <h2 className="font-inter-tight tracking-tight text-xl font-semibold text-foreground truncate">
          {title}
        </h2>
        {subtitle ? (
          <p className="font-mono text-[11px] text-muted">{subtitle}</p>
        ) : null}
      </div>
      <Dialog.Close
        aria-label="Close"
        className="p-2 rounded-sm bg-transparent border-0 cursor-pointer text-muted hover:bg-overlay hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <X className="size-4" aria-hidden />
      </Dialog.Close>
    </div>
  );
}
ModalHeader.displayName = "Modal.Header";

type ModalBodyProps = {
  className?: string;
};

/**
 * The scrollable content region inside a {@link Modal}.
 */
function ModalBody({
  className,
  children,
}: PropsWithChildren<ModalBodyProps>) {
  return (
    <div
      className={cn(
        "flex-1 overflow-y-auto px-6 md:px-12 py-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
ModalBody.displayName = "Modal.Body";

/**
 * A generic fullscreen modal built on Base UI's `Dialog`, themed to the
 * site palette. Compose as:
 *
 * ```tsx
 * <Modal open={open} onOpenChange={setOpen}>
 *   <Modal.Trigger render={<button>Expand</button>} />
 *   <Modal.Content title="Shareholders">
 *     <Modal.Header title="Shareholders" subtitle="7 holders" />
 *     <Modal.Body>…</Modal.Body>
 *   </Modal.Content>
 * </Modal>
 * ```
 */
export const Modal = Object.assign(ModalRoot, {
  Root: ModalRoot,
  Trigger: ModalTrigger,
  Content: ModalContent,
  Header: ModalHeader,
  Body: ModalBody,
});
