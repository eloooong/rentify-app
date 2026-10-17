"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLinkProps = {
  href: string;
  children: React.ReactNode;
  variant?: "link" | "button";
};

const base = "text-sm font-medium transition-colors focus-visible:rounded-sm";
const variants = {
  link: "py-1 text-fg hover:text-brand-strong",
  button:
    "inline-flex items-center justify-center rounded-md bg-brand-strong px-4 py-2 font-semibold text-brand-foreground hover:brightness-90",
} as const;

export function NavLink({ href, children, variant = "link" }: NavLinkProps) {
  const pathname = usePathname();
  const active =
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);
  const activeStyle =
    active && variant === "link"
      ? "text-brand-strong underline underline-offset-4"
      : "";

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${base} ${variants[variant]} ${activeStyle}`}
    >
      {children}
    </Link>
  );
}
