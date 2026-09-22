/**
 * Reading a file the user picked.
 *
 * This is far fiddlier than it looks, which is why it is one function with a
 * fallback chain rather than a call site with a single API.
 *
 * There are two file APIs and neither one reads every URI a picker can return:
 *
 *  - The new `File` class takes an absolute path and reads it directly. It cannot
 *    resolve an Android `content://` URI, and fails with
 *    "Missing 'READ' permission for accessing the file".
 *
 *  - The legacy `readAsStringAsync` goes through Android's ContentResolver, so it
 *    *can* resolve `content://`. But inside Expo Go it is sandboxed to the
 *    experience's own scoped directories, and DocumentPicker's cache folder
 *    (`/data/user/0/host.exp.exponent/cache/DocumentPicker/...`) sits outside it —
 *    giving "Location ... isn't readable" for a path that plainly exists.
 *
 * Which one works depends on the picker, the platform, and whether the app is
 * running in Expo Go or a development build. Rather than predict that, both are
 * attempted and the first success wins. If both fail, the error names both causes
 * instead of surfacing whichever happened to be tried last.
 */
import { File } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';

/** Read any picked file as base64, whatever kind of URI it is. */
export async function readAsBase64(uri: string): Promise<string> {
  const failures: string[] = [];

  // A content:// URI can only be resolved by ContentResolver, so try that first
  // when we can see that is what we have.
  const strategies: { name: string; run: () => Promise<string> }[] = uri.startsWith('content://')
    ? [legacyStrategy(uri), fileStrategy(uri)]
    : [fileStrategy(uri), legacyStrategy(uri)];

  for (const strategy of strategies) {
    try {
      const result = await strategy.run();
      if (result) return result;
      failures.push(`${strategy.name}: returned nothing`);
    } catch (error) {
      failures.push(`${strategy.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Could not read that file.\n${failures.join('\n')}`);
}

function fileStrategy(uri: string) {
  return {
    name: 'File.base64',
    run: async () => await new File(uri).base64(),
  };
}

function legacyStrategy(uri: string) {
  return {
    name: 'readAsStringAsync',
    run: async () =>
      await LegacyFileSystem.readAsStringAsync(uri, {
        encoding: LegacyFileSystem.EncodingType.Base64,
      }),
  };
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
