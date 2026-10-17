import type { Metadata } from "next";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rentify",
  description:
    "Your tech sharing solution. Rent gadgets for the moments you need them.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="flex min-h-svh flex-col bg-surface font-sans text-fg-body antialiased">
        <a
          href="#main-content"
          className="sr-only rounded-md bg-brand-strong px-4 py-2 text-sm font-semibold text-brand-foreground focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50"
        >
          Skip to main content
        </a>
        <SiteHeader />
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 focus:outline-none"
        >
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
