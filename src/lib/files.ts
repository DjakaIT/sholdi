/**
 * Reading a file the user picked.
 *
 * This is fiddlier than it looks on Android, which is why it is one function
 * rather than a call site.
 *
 * A document picker returns a `content://` URI, not a path. Android grants read
 * permission on that URI to the process **transiently** — it is scoped to the
 * picker result and can be gone by the time you read it again. The new
 * `expo-file-system` `File` class expects something it can open directly and
 * rejects a content URI with:
 *
 *   Call to function 'FileSystemFile.base64' has been rejected.
 *   Caused by: Missing 'READ' permission for accessing the file.
 *
 * The legacy `readAsStringAsync` goes through Android's ContentResolver, which is
 * what actually knows how to resolve a content URI, and it handles `file://` on
 * both platforms too. So it is the correct tool here, "legacy" name
 * notwithstanding.
 */
import * as LegacyFileSystem from 'expo-file-system/legacy';

/**
 * Read any picked file as base64.
 *
 * Accepts `file://`, `content://` (Android) and `ph://`-style URIs, because that
 * is what the pickers actually hand back.
 */
export async function readAsBase64(uri: string): Promise<string> {
  return await LegacyFileSystem.readAsStringAsync(uri, {
    encoding: LegacyFileSystem.EncodingType.Base64,
  });
}

/** Size in bytes, or null when the file cannot be stat'd. */
export async function fileSize(uri: string): Promise<number | null> {
  try {
    const info = await LegacyFileSystem.getInfoAsync(uri);
    return info.exists && typeof info.size === 'number' ? info.size : null;
  } catch {
    return null;
  }
}
