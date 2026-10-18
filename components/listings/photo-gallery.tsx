"use client";

import { useRef, useState } from "react";
import type { CatalogPhoto } from "@/lib/catalog/types";

/**
 * Swipeable photo gallery. The track is a horizontal scroll-snap list, so
 * touch swiping works natively; buttons and thumbnails cover mouse and
 * keyboard. Photos use plain <img> because the catalog's access-checked URLs
 * must not go through the image optimizer (lib/catalog/README.md).
 */
export function PhotoGallery({
  photos,
  title,
}: {
  photos: CatalogPhoto[];
  title: string;
}) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [current, setCurrent] = useState(0);

  if (photos.length === 0) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-lg bg-surface-muted text-muted-foreground">
        No photos yet
      </div>
    );
  }

  const show = (index: number) => {
    const track = trackRef.current;
    if (!track) return;
    const next = Math.max(0, Math.min(photos.length - 1, index));
    track.scrollTo({ left: next * track.clientWidth, behavior: "smooth" });
    setCurrent(next);
  };

  const onScroll = () => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    setCurrent(Math.round(track.scrollLeft / track.clientWidth));
  };

  const many = photos.length > 1;

  return (
    <section aria-label={`Photos of ${title}`} className="flex flex-col gap-3">
      <div className="relative">
        <ul
          ref={trackRef}
          onScroll={onScroll}
          className="flex aspect-[4/3] snap-x snap-mandatory overflow-x-auto rounded-lg bg-surface-muted [scrollbar-width:none]"
        >
          {photos.map((photo, index) => (
            <li
              key={photo.id}
              className="w-full shrink-0 snap-center"
              aria-hidden={index !== current}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={`${title}, photo ${index + 1} of ${photos.length}`}
                loading={index === 0 ? "eager" : "lazy"}
                decoding="async"
                className="size-full object-contain"
              />
            </li>
          ))}
        </ul>

        {many && (
          <>
            <button
              type="button"
              onClick={() => show(current - 1)}
              disabled={current === 0}
              className="absolute top-1/2 left-2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-fg shadow disabled:opacity-0"
            >
              <span aria-hidden="true">‹</span>
              <span className="sr-only">Previous photo</span>
            </button>
            <button
              type="button"
              onClick={() => show(current + 1)}
              disabled={current === photos.length - 1}
              className="absolute top-1/2 right-2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-fg shadow disabled:opacity-0"
            >
              <span aria-hidden="true">›</span>
              <span className="sr-only">Next photo</span>
            </button>
          </>
        )}
      </div>

      {many && (
        <>
          <p role="status" aria-live="polite" className="sr-only">
            Photo {current + 1} of {photos.length}
          </p>
          <ul className="flex gap-2 overflow-x-auto">
            {photos.map((photo, index) => (
              <li key={photo.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => show(index)}
                  aria-current={index === current ? "true" : undefined}
                  className={`block size-16 overflow-hidden rounded-md border-2 ${
                    index === current ? "border-primary" : "border-transparent"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="size-full object-cover"
                  />
                  <span className="sr-only">Show photo {index + 1}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
