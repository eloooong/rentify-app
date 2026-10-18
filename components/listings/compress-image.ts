import { fitWithin, MAX_IMAGE_BYTES } from "@/lib/listings/editor";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

export class ImageError extends Error {}

/**
 * Resizes and re-encodes a photo in the browser before upload, so phone
 * photos fit the catalog's 4 MiB limit and upload faster on slow connections.
 * The server still decodes, rotates, resizes and strips metadata itself
 * (lib/catalog/images.ts); this is only a size optimisation.
 */
export async function compressImage(file: File): Promise<Blob> {
  if (!ACCEPTED.includes(file.type))
    throw new ImageError("Use a JPEG, PNG or WebP photo.");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ImageError("That photo couldn't be read. Try another one.");
  }

  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new ImageError("This browser can't prepare photos.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  for (const quality of [0.85, 0.75, 0.6]) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality),
    );
    // Browsers without WebP encoding fall back to PNG; accept that too.
    if (blob && blob.size <= MAX_IMAGE_BYTES) return blob;
  }
  throw new ImageError("That photo is too large even after resizing.");
}
