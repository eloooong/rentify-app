import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-12 sm:px-6 sm:py-16">
      {children}
    </div>
  );
}
