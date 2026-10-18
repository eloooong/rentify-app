import sharp from "sharp";
import { expect, it } from "vitest";
import { MAX_IMAGE_BYTES, normalizeImage } from "./images";
it("leaves multipart headroom below the planned Vercel payload ceiling", () => {
  expect(MAX_IMAGE_BYTES + 65536).toBeLessThan(4500000);
});
it("decodes, resizes and strips metadata rather than trusting filename/MIME", async () => {
  const image = await sharp({
    create: { width: 3000, height: 100, channels: 3, background: "red" },
  })
    .jpeg()
    .withExif({ IFD0: { Artist: "Private metadata" } })
    .toBuffer();
  const normalized = await normalizeImage(image);
  const metadata = await sharp(normalized).metadata();
  expect(metadata.format).toBe("webp");
  expect(metadata.width).toBe(2560);
  expect(metadata.exif).toBeUndefined();
});
it("rejects corrupt data, SVG and oversize inputs", async () => {
  for (const input of [
    Buffer.from("not a photo"),
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
    ),
    Buffer.alloc(MAX_IMAGE_BYTES + 1),
  ])
    await expect(normalizeImage(input)).rejects.toThrow();
});
