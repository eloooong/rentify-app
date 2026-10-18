import type { ListingOwner } from "@/lib/listings/detail";

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("") || "?"
  );
}

export function OwnerCard({ owner }: { owner: ListingOwner | null }) {
  if (!owner) return null;
  const since = new Intl.DateTimeFormat("en-PH", {
    month: "long",
    year: "numeric",
  }).format(new Date(owner.memberSince));

  return (
    <section
      aria-labelledby="owner-heading"
      className="flex items-center gap-3 rounded-lg border border-border p-4"
    >
      {/* Avatar uploads are a separate feature, so the card shows initials. */}
      <div
        aria-hidden="true"
        className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-tint font-semibold text-brand-strong"
      >
        {initials(owner.displayName)}
      </div>
      <div>
        <h2 id="owner-heading" className="text-sm text-muted-foreground">
          Listed by
        </h2>
        <p className="font-semibold text-fg">{owner.displayName}</p>
        <p className="text-sm text-muted-foreground">
          Member since {since} · No reviews yet
        </p>
      </div>
    </section>
  );
}
