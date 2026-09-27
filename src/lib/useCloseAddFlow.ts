/**
 * Close the whole Add flow, from any sheet inside it.
 *
 * The Add chooser (§6.3) and the sheets it opens — Type it, Say it, Scan, Bank PDF —
 * live in their own stack inside one transparent modal. `router.back()` from a
 * sheet only pops that inner stack, so after "Add it" the user landed on the
 * chooser again, with the thing they just did still apparently unfinished.
 *
 * Going back on the PARENT navigator removes the modal itself, and leaves the user
 * on whichever tab they started from. When there is no parent to go back on (a
 * sheet opened directly, say), it falls back to a plain back.
 */
import { useCallback } from 'react';
import { useNavigation, useRouter } from 'expo-router';

export function useCloseAddFlow(): () => void {
  const navigation = useNavigation();
  const router = useRouter();

  return useCallback(() => {
    const parent = navigation.getParent();
    if (parent?.canGoBack()) {
      parent.goBack();
      return;
    }
    if (router.canGoBack()) router.back();
  }, [navigation, router]);
}
