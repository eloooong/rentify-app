import Link from "next/link";
import { SearchIcon } from "./icons";
import { MobileMenu } from "./mobile-menu";
import { NavLink } from "./nav-link";
import { lendLink, primaryLinks, signInLink } from "./nav-links";

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="order-1 text-xl font-bold text-fg focus-visible:rounded-sm"
        >
          Rentify
        </Link>

        <MobileMenu links={primaryLinks} signIn={signInLink} lend={lendLink} />

        {/* One search form: full-width second row on phones, inline from md up. */}
        <form
          role="search"
          action="/listings"
          method="get"
          className="order-3 flex w-full items-center rounded-full border border-brand bg-surface pr-1 pl-4 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-strong md:order-2 md:ml-4 md:max-w-md md:flex-1"
        >
          <label htmlFor="site-search" className="sr-only">
            Search devices
          </label>
          <input
            id="site-search"
            type="search"
            name="q"
            placeholder="Search"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm text-fg placeholder:text-fg-body focus:outline-none"
          />
          <button
            type="submit"
            className="inline-flex size-9 items-center justify-center rounded-full text-brand-strong hover:bg-surface-muted"
          >
            <SearchIcon />
            <span className="sr-only">Search</span>
          </button>
        </form>

        <nav
          aria-label="Primary"
          className="order-3 hidden items-center gap-6 md:ml-auto md:flex"
        >
          {primaryLinks.map((item) => (
            <NavLink key={item.href} href={item.href}>
              {item.label}
            </NavLink>
          ))}
          <NavLink href={signInLink.href}>{signInLink.label}</NavLink>
          <NavLink href={lendLink.href} variant="button">
            {lendLink.label}
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
