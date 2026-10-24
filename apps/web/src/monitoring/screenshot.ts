/** Longest side, in pixels, of a screenshot sent to Sentry. */
export const MAX_SCREENSHOT_SIDE = 1280;
const JPEG_QUALITY = 0.75;

/**
 * Shrinks a screenshot to at most 1280px on its longest side as a JPEG (quality 0.75).
 * An image that is already a small JPEG is returned as it is. Where the browser cannot
 * decode or re-encode the image, the original is returned: the user chose to attach it.
 */
export async function downscaleScreenshot(blob: Blob): Promise<Blob> {
  try {
    if (typeof createImageBitmap !== "function" || typeof document === "undefined") return blob;
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, MAX_SCREENSHOT_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && blob.type === "image/jpeg") {
      bitmap.close();
      return blob;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return blob;
    }
    // JPEG has no alpha; a transparent PNG would otherwise turn black.
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    return jpeg ?? blob;
  } catch {
    return blob;
  }
}
