"use client";

import { useRef } from "react";
import { CloseIcon, MenuIcon } from "./icons";
import { NavLink } from "./nav-link";
import type { NavItem } from "./nav-links";
import { SignOutButton } from "./sign-out-button";

type MobileMenuProps = {
  links: NavItem[];
  signedIn: boolean;
  signIn: NavItem;
  account: NavItem;
  myListings: NavItem;
  bookings: NavItem;
  lend: NavItem;
};

// Uses the native <dialog>: showModal() traps focus, makes the page behind inert,
// and closes on Escape, so no extra dependency or focus-trap code is needed.
export function MobileMenu({
  links,
  signedIn,
  signIn,
  account,
  myListings,
  bookings,
  lend,
}: MobileMenuProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => dialogRef.current?.showModal()}
        className="order-2 ml-auto inline-flex size-11 items-center justify-center rounded-md text-fg hover:bg-surface-muted md:hidden"
      >
        <MenuIcon />
        <span className="sr-only">Open menu</span>
      </button>

      <dialog
        ref={dialogRef}
        aria-label="Main menu"
        // A click on the dialog element itself is a click on the backdrop,
        // because the panel below fills the whole dialog.
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-72 max-w-[85vw] border-0 bg-surface p-0 text-fg-body backdrop:bg-black/50"
      >
        <div className="flex h-full flex-col gap-6 p-4">
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold text-fg">Menu</span>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="inline-flex size-11 items-center justify-center rounded-md text-fg hover:bg-surface-muted"
            >
              <CloseIcon />
              <span className="sr-only">Close menu</span>
            </button>
          </div>

          <nav
            aria-label="Mobile"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a")) {
                dialogRef.current?.close();
              }
            }}
          >
            <ul className="flex flex-col gap-1">
              {links.map((item) => (
                <li
                  key={item.href}
                  className="[&>a]:flex [&>a]:min-h-11 [&>a]:items-center"
                >
                  <NavLink href={item.href}>{item.label}</NavLink>
                </li>
              ))}
              {signedIn ? (
                <>
                  <li className="[&>a]:flex [&>a]:min-h-11 [&>a]:items-center">
                    <NavLink href={bookings.href}>{bookings.label}</NavLink>
                  </li>
                  <li className="[&>a]:flex [&>a]:min-h-11 [&>a]:items-center">
                    <NavLink href={myListings.href}>{myListings.label}</NavLink>
                  </li>
                  <li className="[&>a]:flex [&>a]:min-h-11 [&>a]:items-center">
                    <NavLink href={account.href}>{account.label}</NavLink>
                  </li>
                  <li className="flex min-h-11 flex-col justify-center">
                    <SignOutButton className="text-left" />
                  </li>
                </>
              ) : (
                <li className="[&>a]:flex [&>a]:min-h-11 [&>a]:items-center">
                  <NavLink href={signIn.href}>{signIn.label}</NavLink>
                </li>
              )}
              <li className="pt-2">
                <NavLink href={lend.href} variant="button">
                  {lend.label}
                </NavLink>
              </li>
            </ul>
          </nav>
        </div>
      </dialog>
    </>
  );
}
