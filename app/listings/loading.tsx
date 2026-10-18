export default function BrowseLoading() {
  return (
    <div
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6"
      aria-busy="true"
    >
      <h1 className="text-3xl font-semibold text-fg">Browse devices</h1>
      <p role="status" className="sr-only">
        Loading devices…
      </p>
      <ul
        aria-hidden="true"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        {Array.from({ length: 8 }, (_, index) => (
          <li
            key={index}
            className="overflow-hidden rounded-lg border border-border"
          >
            <div className="aspect-[4/3] animate-pulse bg-surface-muted" />
            <div className="flex flex-col gap-2 p-3">
              <div className="h-4 w-3/4 animate-pulse rounded bg-surface-muted" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-surface-muted" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-surface-muted" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
