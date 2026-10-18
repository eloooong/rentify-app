"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CatalogListing, CatalogPhoto } from "@/lib/catalog/types";
import {
  CONDITIONS,
  freePositions,
  interpretApiError,
  MAX_PHOTOS,
  minorToPesos,
  templateFields,
  updatePayload,
  validateListing,
  type ApiProblem,
  type EditorCategory,
  type EditorField,
  type EditorValues,
  type FieldErrors,
  type ListingStatus,
} from "@/lib/listings/editor";
import { apiRequest as request } from "./api-request";
import { compressImage, ImageError } from "./compress-image";

type NewPhoto = { key: string; blob: Blob; preview: string };

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground aria-[invalid=true]:border-destructive";

function initialValues(listing?: CatalogListing): EditorValues {
  if (!listing)
    return {
      categoryId: "",
      title: "",
      description: "",
      price: "",
      deposit: "",
      condition: "",
      pickupArea: "",
      attributes: {},
    };
  const attributes: Record<string, string> = {};
  for (const [key, value] of Object.entries(
    (listing.attributes ?? {}) as Record<string, unknown>,
  ))
    attributes[key] = String(value);
  return {
    categoryId: listing.category_id,
    title: listing.title,
    description: listing.description,
    price: minorToPesos(listing.daily_price_amount),
    deposit: minorToPesos(listing.deposit_amount),
    condition: listing.condition,
    pickupArea: listing.pickup_area,
    attributes,
  };
}

class SaveError extends Error {
  constructor(public problem: ApiProblem) {
    super(problem.message);
  }
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}

export function ListingForm({
  categories,
  listing,
}: {
  categories: EditorCategory[];
  listing?: CatalogListing;
}) {
  const router = useRouter();
  const editing = Boolean(listing);
  const status = (listing?.status ?? "draft") as ListingStatus | "hidden";
  const returnTo = listing
    ? `/owner/listings/${listing.id}/edit`
    : "/owner/listings/new";

  const [values, setValues] = useState<EditorValues>(() =>
    initialValues(listing),
  );
  const [existing, setExisting] = useState<CatalogPhoto[]>(
    () => listing?.photos ?? [],
  );
  const [removed, setRemoved] = useState<string[]>([]);
  const [added, setAdded] = useState<NewPhoto[]>([]);
  const [fields, setFields] = useState<FieldErrors>({});
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  const category = categories.find((item) => item.id === values.categoryId);
  const template = useMemo(
    () => templateFields(category?.attributeSchema),
    [category],
  );
  const photoCount = existing.length + added.length;

  // Every preview URL this form created; released when it unmounts.
  // (Removing a photo releases its URL straight away.)
  const previewsRef = useRef<string[]>([]);
  useEffect(() => {
    const previews = previewsRef.current;
    return () => previews.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const set = (field: keyof EditorValues) => (value: string) =>
    setValues((current) => ({ ...current, [field]: value }));
  const setAttribute = (key: string, value: string) =>
    setValues((current) => ({
      ...current,
      attributes: { ...current.attributes, [key]: value },
    }));

  const describe = (field: EditorField, hint?: string) =>
    fields[field] ? `${field}-error` : hint;
  const invalid = (field: EditorField) => (fields[field] ? true : undefined);

  async function onPhotosChosen(files: FileList | null) {
    if (!files?.length) return;
    setPhotoError(null);
    const room = MAX_PHOTOS - photoCount;
    const chosen = Array.from(files).slice(0, room);
    if (files.length > room)
      setPhotoError(`You can add ${MAX_PHOTOS} photos in total.`);
    setPreparing(true);
    const prepared: NewPhoto[] = [];
    for (const file of chosen) {
      try {
        const blob = await compressImage(file);
        const preview = URL.createObjectURL(blob);
        previewsRef.current.push(preview);
        prepared.push({
          key: `${file.name}-${file.lastModified}-${Math.random()}`,
          blob,
          preview,
        });
      } catch (error) {
        setPhotoError(
          error instanceof ImageError
            ? `${file.name}: ${error.message}`
            : `${file.name} couldn't be added.`,
        );
      }
    }
    setAdded((current) => [...current, ...prepared]);
    setPreparing(false);
  }

  function removeExisting(photo: CatalogPhoto) {
    setExisting((current) => current.filter((item) => item.id !== photo.id));
    setRemoved((current) => [...current, photo.id]);
  }

  function removeAdded(photo: NewPhoto) {
    URL.revokeObjectURL(photo.preview);
    setAdded((current) => current.filter((item) => item.key !== photo.key));
  }

  function fail(next: ApiProblem) {
    setProblem(next);
    if (next.fields) setFields(next.fields);
    requestAnimationFrame(() => summaryRef.current?.focus());
  }

  async function save(target: ListingStatus) {
    setProblem(null);
    setFields({});
    const checked = validateListing(values, category);
    if (!checked.ok) {
      fail({
        message: "Please fix the highlighted fields.",
        fields: checked.fields,
      });
      return;
    }
    if (target === "published" && photoCount === 0) {
      fail({ message: "Add at least one photo before publishing." });
      return;
    }

    let id = listing?.id;
    let created = false;
    try {
      // 1. A new listing is created as a draft first.
      if (!id) {
        setSaving("Saving your listing…");
        const response = await request(
          "POST",
          "/api/catalog/listings",
          checked.payload,
        );
        if (!response.ok)
          throw new SaveError(
            interpretApiError(response.status, response.json, returnTo),
          );
        id = (response.json as { data: { id: string } }).data.id;
        created = true;
      }
      const base = `/api/catalog/listings/${id}`;

      // 2. Pause before removing photos: the API refuses to remove a
      //    published listing's last photo.
      if (status === "published" && target !== "published") {
        const response = await request(
          "PATCH",
          base,
          updatePayload(checked.payload, target),
        );
        if (!response.ok)
          throw new SaveError(
            interpretApiError(response.status, response.json, returnTo),
          );
      }

      // 3. Photo removals, then uploads into free positions (0–7).
      for (const photoId of removed) {
        setSaving("Removing photos…");
        const response = await request("DELETE", `${base}/photos/${photoId}`);
        if (!response.ok && response.status !== 404)
          throw new SaveError(
            interpretApiError(response.status, response.json, returnTo),
          );
      }
      const positions = freePositions(
        existing.map((photo) => photo.position),
        added.length,
      );
      for (const [index, photo] of added.entries()) {
        setSaving(`Uploading photo ${index + 1} of ${added.length}…`);
        const form = new FormData();
        form.set(
          "file",
          new File([photo.blob], "photo.webp", { type: photo.blob.type }),
        );
        form.set("position", String(positions[index]));
        const response = await request("POST", `${base}/photos`, form);
        if (!response.ok)
          throw new SaveError(
            interpretApiError(response.status, response.json, returnTo),
          );
      }

      // 4. Save every field with the chosen status (PATCH is never partial).
      if (!(created && target === "draft")) {
        setSaving(target === "published" ? "Publishing…" : "Saving…");
        const response = await request(
          "PATCH",
          base,
          updatePayload(checked.payload, target),
        );
        if (!response.ok)
          throw new SaveError(
            interpretApiError(response.status, response.json, returnTo),
          );
      }

      router.replace(`/owner/listings/${id}/edit?saved=${target}`);
      router.refresh();
    } catch (error) {
      setSaving(null);
      const next =
        error instanceof SaveError
          ? error.problem
          : {
              message:
                "We couldn't reach Rentify. Check your connection and try again.",
            };
      if (created && id) {
        // The draft exists; continue on its edit page so nothing is lost twice.
        router.replace(`/owner/listings/${id}/edit?saved=partial`);
        router.refresh();
        return;
      }
      fail(next);
    }
  }

  const busy = saving !== null || preparing;
  const restricted = status === "hidden";

  return (
    <form
      noValidate
      onSubmit={(event) => event.preventDefault()}
      className="flex flex-col gap-6"
      aria-busy={busy}
    >
      {problem && (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="rounded-lg border border-destructive bg-surface p-4 text-sm"
        >
          <p className="font-semibold text-destructive">{problem.message}</p>
          {problem.action && (
            <Link
              href={problem.action.href}
              className="mt-2 inline-flex font-medium text-fg underline underline-offset-4"
            >
              {problem.action.label}
            </Link>
          )}
        </div>
      )}

      <fieldset disabled={busy || restricted} className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-semibold text-fg">
          The device
        </legend>

        <div className="grid gap-1.5">
          <Label htmlFor="listing-category">Category</Label>
          <select
            id="listing-category"
            value={values.categoryId}
            onChange={(event) => set("categoryId")(event.target.value)}
            aria-invalid={invalid("categoryId")}
            aria-describedby={describe("categoryId")}
            className={selectClass}
          >
            <option value="">Choose a category</option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <FieldError id="categoryId-error" message={fields.categoryId} />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="listing-title">Title</Label>
          <Input
            id="listing-title"
            value={values.title}
            onChange={(event) => set("title")(event.target.value)}
            maxLength={120}
            placeholder="e.g. DJI Mavic Air 2 with 3 batteries"
            aria-invalid={invalid("title")}
            aria-describedby={describe("title")}
          />
          <FieldError id="title-error" message={fields.title} />
        </div>

        {template.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {template.map((field) => {
              const key = `attributes.${field.key}` as EditorField;
              const id = `listing-attr-${field.key}`;
              const value = values.attributes[field.key] ?? "";
              const label = `${field.label}${field.required ? "" : " (optional)"}`;
              return (
                <div key={field.key} className="grid gap-1.5">
                  <Label htmlFor={id}>{label}</Label>
                  {field.type === "select" ? (
                    <select
                      id={id}
                      value={value}
                      onChange={(event) =>
                        setAttribute(field.key, event.target.value)
                      }
                      aria-invalid={invalid(key)}
                      aria-describedby={describe(key)}
                      className={selectClass}
                    >
                      <option value="">Choose</option>
                      {field.options.map((option) => (
                        <option key={option} value={option}>
                          {option.length <= 3
                            ? option.toUpperCase()
                            : option.charAt(0).toUpperCase() + option.slice(1)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id={id}
                      value={value}
                      onChange={(event) =>
                        setAttribute(field.key, event.target.value)
                      }
                      inputMode={
                        field.type === "integer" ? "numeric" : undefined
                      }
                      maxLength={80}
                      aria-invalid={invalid(key)}
                      aria-describedby={describe(key)}
                    />
                  )}
                  <FieldError id={`${key}-error`} message={fields[key]} />
                </div>
              );
            })}
          </div>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="listing-condition">Condition</Label>
          <select
            id="listing-condition"
            value={values.condition}
            onChange={(event) => set("condition")(event.target.value)}
            aria-invalid={invalid("condition")}
            aria-describedby={describe("condition")}
            className={selectClass}
          >
            <option value="">Choose the condition</option>
            {[
              ...new Set([...CONDITIONS, values.condition].filter(Boolean)),
            ].map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <FieldError id="condition-error" message={fields.condition} />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="listing-description">Description (optional)</Label>
          <Textarea
            id="listing-description"
            value={values.description}
            onChange={(event) => set("description")(event.target.value)}
            maxLength={5000}
            rows={5}
            placeholder="What's included, any wear, and anything a renter should know."
            aria-invalid={invalid("description")}
            aria-describedby={describe("description")}
          />
          <FieldError id="description-error" message={fields.description} />
        </div>
      </fieldset>

      <fieldset disabled={busy || restricted} className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-semibold text-fg">
          Price and pickup
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="listing-price">Price per day (₱)</Label>
            <Input
              id="listing-price"
              value={values.price}
              onChange={(event) => set("price")(event.target.value)}
              inputMode="decimal"
              placeholder="500"
              aria-invalid={invalid("price")}
              aria-describedby={describe("price")}
            />
            <FieldError id="price-error" message={fields.price} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="listing-deposit">Deposit (₱)</Label>
            <Input
              id="listing-deposit"
              value={values.deposit}
              onChange={(event) => set("deposit")(event.target.value)}
              inputMode="decimal"
              placeholder="0"
              aria-invalid={invalid("deposit")}
              aria-describedby={describe("deposit", "deposit-hint")}
            />
            <FieldError id="deposit-error" message={fields.deposit} />
            {!fields.deposit && (
              <p id="deposit-hint" className="text-sm text-muted-foreground">
                Held during the rental. Deposit rules are still being decided.
              </p>
            )}
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="listing-pickup">Pickup area</Label>
          <Input
            id="listing-pickup"
            value={values.pickupArea}
            onChange={(event) => set("pickupArea")(event.target.value)}
            maxLength={120}
            placeholder="e.g. Laoag City, near the plaza"
            aria-invalid={invalid("pickupArea")}
            aria-describedby={describe("pickupArea", "pickup-hint")}
          />
          <FieldError id="pickupArea-error" message={fields.pickupArea} />
          {!fields.pickupArea && (
            <p id="pickup-hint" className="text-sm text-muted-foreground">
              A neighbourhood or meeting place, not your home address.
            </p>
          )}
        </div>
      </fieldset>

      <fieldset disabled={busy || restricted} className="flex flex-col gap-3">
        <legend className="mb-2 text-lg font-semibold text-fg">Photos</legend>
        <p id="photos-hint" className="text-sm text-muted-foreground">
          Up to {MAX_PHOTOS} photos. The first one is the cover. You need at
          least one to publish.
        </p>
        {photoCount > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {existing.map((photo, index) => (
              <li
                key={photo.id}
                className="relative overflow-hidden rounded-md border border-border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={`Photo ${index + 1}`}
                  className="aspect-[4/3] w-full object-cover"
                />
                {index === 0 && (
                  <span className="absolute top-1 left-1 rounded bg-surface px-1.5 text-xs font-semibold text-fg">
                    Cover
                  </span>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => removeExisting(photo)}
                  className="absolute right-1 bottom-1"
                >
                  Remove<span className="sr-only"> photo {index + 1}</span>
                </Button>
              </li>
            ))}
            {added.map((photo, index) => {
              const number = existing.length + index + 1;
              return (
                <li
                  key={photo.key}
                  className="relative overflow-hidden rounded-md border border-border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.preview}
                    alt={`New photo ${number}`}
                    className="aspect-[4/3] w-full object-cover"
                  />
                  {number === 1 && (
                    <span className="absolute top-1 left-1 rounded bg-surface px-1.5 text-xs font-semibold text-fg">
                      Cover
                    </span>
                  )}
                  <span className="absolute top-1 right-1 rounded bg-surface-tint px-1.5 text-xs font-semibold text-brand-strong">
                    New
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => removeAdded(photo)}
                    className="absolute right-1 bottom-1"
                  >
                    Remove<span className="sr-only"> photo {number}</span>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {/* The input comes first so the label can show its keyboard focus. */}
          <input
            id="listing-photos"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={photoCount >= MAX_PHOTOS}
            aria-describedby="photos-hint"
            className="peer sr-only"
            onChange={(event) => {
              void onPhotosChosen(event.target.files);
              event.target.value = "";
            }}
          />
          <Label
            htmlFor="listing-photos"
            className={`inline-flex h-9 cursor-pointer items-center rounded-md border border-input px-3 text-sm font-medium text-fg peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring hover:bg-surface-muted ${
              photoCount >= MAX_PHOTOS ? "pointer-events-none opacity-50" : ""
            }`}
          >
            {preparing ? "Preparing photos…" : "Add photos"}
          </Label>
          <span className="text-sm text-muted-foreground">
            {photoCount} of {MAX_PHOTOS}
          </span>
        </div>
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-destructive empty:hidden"
        >
          {photoError ?? ""}
        </p>
        <p className="text-xs text-muted-foreground">
          Photos can&apos;t be reordered yet. To change the cover, remove photos
          and add them again in the order you want.
        </p>
      </fieldset>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-muted-foreground empty:hidden"
        >
          {saving ?? ""}
        </p>
        {!restricted && (
          <div className="flex flex-wrap gap-2">
            {status === "draft" && (
              <>
                <Button
                  type="button"
                  onClick={() => save("published")}
                  disabled={busy}
                >
                  Publish
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => save("draft")}
                  disabled={busy}
                >
                  {editing ? "Save draft" : "Save as draft"}
                </Button>
              </>
            )}
            {status === "published" && (
              <>
                <Button
                  type="button"
                  onClick={() => save("published")}
                  disabled={busy}
                >
                  Save changes
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => save("paused")}
                  disabled={busy}
                >
                  Pause listing
                </Button>
              </>
            )}
            {status === "paused" && (
              <>
                <Button
                  type="button"
                  onClick={() => save("published")}
                  disabled={busy}
                >
                  Publish again
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => save("paused")}
                  disabled={busy}
                >
                  Save changes
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
