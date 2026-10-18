export function DraftBanner({ legal = false }: { legal?: boolean }) {
  return (
    <aside
      aria-label="Draft notice"
      className="rounded-lg border border-brand bg-surface-tint p-4 text-sm"
    >
      <p className="font-semibold text-brand-strong">Draft</p>
      <p className="mt-1">
        {legal
          ? "This text is a draft and is not legal advice. It has not been reviewed yet, and items marked “To be decided” are still open."
          : "This page describes how Rentify is planned to work. Some features are not built yet, and items marked “To be decided” are still open."}
      </p>
    </aside>
  );
}
