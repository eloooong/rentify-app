import type { Metadata } from "next";
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
      <body>{children}</body>
    </html>
  );
}
