import sharp from "sharp";

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const IMAGE_BUCKET = "listing-images";

export async function normalizeImage(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES)
    throw new Error("Invalid image size");
  const image = sharp(bytes, { limitInputPixels: 40000000, failOn: "warning" });
  const metadata = await image.metadata();
  if (
    !["jpeg", "png", "webp"].includes(metadata.format ?? "") ||
    (metadata.pages ?? 1) > 1
  )
    throw new Error("Unsupported image");
  const result = await image
    .rotate()
    .resize({
      width: 2560,
      height: 2560,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 85 })
    .toBuffer();
  if (result.length > MAX_IMAGE_BYTES) throw new Error("Image is too large");
  return result;
}
