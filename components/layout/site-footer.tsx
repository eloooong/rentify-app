import Link from "next/link";
import { footerLinks } from "./nav-links";

export function SiteFooter() {
  return (
    <footer className="mt-12 bg-surface-muted text-fg-body">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-2">
        <div>
          <p className="text-lg font-semibold text-fg">Rentify</p>
          <p className="mt-2 max-w-md text-sm">
            Your tech sharing solution. Rent gadgets for the moments you need
            them.
          </p>
        </div>

        <nav aria-label="Footer">
          <p className="text-lg font-semibold text-fg">Essential links</p>
          <ul className="mt-2 flex flex-col">
            {footerLinks.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="inline-flex min-h-11 items-center text-sm font-medium text-fg underline-offset-4 hover:text-brand-strong hover:underline focus-visible:rounded-sm"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="border-t border-border">
        <p className="mx-auto w-full max-w-6xl px-4 py-4 text-sm sm:px-6">
          &copy; {new Date().getFullYear()} Rentify
        </p>
      </div>
    </footer>
  );
}
