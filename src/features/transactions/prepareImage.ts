/**
 * Getting a photo ready for the model.
 *
 * Two reasons this exists, and both are load-bearing:
 *
 * 1. **Format.** An iPhone camera produces HEIC by default and the Messages API
 *    cannot read it. Sending one straight through fails deep inside the model call
 *    with nothing useful to tell the user, so it is converted here.
 *
 * 2. **Cost.** COST-CONTROLS.md §6 — preprocess before the model sees anything. A
 *    12-megapixel photo of a receipt costs far more tokens than a 1600px one and
 *    reads no better: the text is legible either way. Downscaling is the cheapest
 *    saving available on the receipt path.
 */
import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Long edge, in pixels.
 *
 * Anthropic downscales images above roughly 1568px on the long edge anyway, so
 * sending more than this is paying to transmit detail that is discarded. Receipt
 * text stays comfortably legible here.
 */
const MAX_EDGE = 1568;

/** JPEG quality. High enough for small printed totals, low enough to stay cheap. */
const QUALITY = 0.8;

export type PreparedImage = {
  uri: string;
  mimeType: 'image/jpeg';
};

/**
 * Convert to JPEG and downscale. Always returns a JPEG, whatever went in.
 *
 * `width`/`height` are the source dimensions from the picker; when they are not
 * known the image is converted without resizing rather than guessed at.
 */
export async function prepareImageForModel(
  uri: string,
  width?: number,
  height?: number
): Promise<PreparedImage> {
  const longEdge = Math.max(width ?? 0, height ?? 0);
  const needsResize = longEdge > MAX_EDGE;

  const actions: ImageManipulator.Action[] = [];
  if (needsResize && width && height) {
    // Resize by the long edge so the aspect ratio is preserved.
    actions.push(width >= height ? { resize: { width: MAX_EDGE } } : { resize: { height: MAX_EDGE } });
  }

  const result = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: QUALITY,
    // JPEG unconditionally: this is what makes HEIC readable.
    format: ImageManipulator.SaveFormat.JPEG,
  });

  return { uri: result.uri, mimeType: 'image/jpeg' };
}
