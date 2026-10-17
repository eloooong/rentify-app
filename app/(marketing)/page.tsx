import Link from "next/link";

// Temporary placeholder home. The real home page follows the Figma hero and
// featured sections once those designs are confirmed.
export default function HomePage() {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col items-start gap-4 px-4 py-16 sm:px-6">
      <h1 className="text-4xl font-semibold tracking-tight text-fg">
        Where sharing makes sense
      </h1>
      <p className="max-w-xl text-lg">
        Rent the gadgets you need for a few days, or lend the ones sitting idle
        at home. The marketplace is coming soon.
      </p>
      <Link
        href="/listings"
        className="inline-flex items-center justify-center rounded-md bg-brand-strong px-5 py-3 text-sm font-semibold text-brand-foreground hover:brightness-90"
      >
        Browse devices
      </Link>
    </section>
  );
}
