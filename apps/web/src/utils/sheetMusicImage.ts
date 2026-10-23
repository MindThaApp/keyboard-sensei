/**
 * Photos of sheet music are sent upright and at a sensible size: phone cameras store
 * many photos sideways with an EXIF "rotate me" tag that the recognition doesn't read,
 * and a 48 MP photo is far more than it needs. The browser applies the EXIF rotation when
 * decoding, so redrawing the photo gives upright pixels; PDFs are sent as they are.
 */

/** Plenty for printed music: a full page at about 400 dpi. */
export const MAX_PHOTO_SIDE = 4000;

/** The size to redraw an image at: never larger, the long side at most `maxSide`. */
export function scaledSize(width: number, height: number, maxSide = MAX_PHOTO_SIDE): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export const isPdf = (file: File): boolean => file.type === "application/pdf" || /\.pdf$/i.test(file.name);

/** The file to upload: a PDF unchanged, an image redrawn upright as JPEG (or unchanged if that fails). */
export async function prepareSheetMusic(file: File): Promise<Blob> {
  if (isPdf(file) || typeof createImageBitmap !== "function") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Not something this browser can decode (e.g. HEIC on some): let the server judge it.
    return file;
  }
  try {
    const { width, height } = scaledSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    return blob ?? file;
  } finally {
    bitmap.close();
  }
}
