/**
 * The single place the app gets entropy.
 *
 * expo-crypto's getRandomBytes is the platform CSPRNG (SecRandomCopyBytes on iOS,
 * SecureRandom on Android). Math.random is never acceptable here — it is seeded and
 * predictable, and a predictable salt or nonce would undo the encryption entirely.
 */
import * as Crypto from 'expo-crypto';

import type { RandomBytes } from './crypto';

export const secureRandomBytes: RandomBytes = (length) => Crypto.getRandomBytes(length);
