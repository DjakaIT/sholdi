/**
 * Merchant normalisation. COST-CONTROLS.md §3 step 1.
 *
 * This is the key into merchant memory, and merchant memory is what makes the app
 * get cheaper the longer someone uses it: a merchant the device already recognises
 * costs nothing to categorise. A normaliser that is even slightly unstable destroys
 * that — the same shop looks new every month and gets paid for again.
 *
 * ARCHITECTURE.md §7 records how this failed on real data, and both cases are
 * tested below:
 *   "MULLER 4983 ZADAR 2" became "muller 2" — the trailing terminal number survived
 *   Spotify kept its reference "p45cd86032"
 * Both would have created duplicate "new" merchants the following month.
 *
 * Hence the blunt rule: strip every token containing a digit. A real merchant name
 * does not need one. "C&A", "dm", "Müller" survive; "4983", "p45cd86032" and
 * "KM/2" do not.
 */

/**
 * Croatian cities and common location suffixes that appear on POS descriptors.
 * A branch is not a different merchant.
 */
const PLACES = new Set([
  'ZAGREB', 'SPLIT', 'RIJEKA', 'OSIJEK', 'ZADAR', 'VELIKA GORICA', 'SLAVONSKI BROD',
  'PULA', 'KARLOVAC', 'SISAK', 'VARAZDIN', 'VARAŽDIN', 'SIBENIK', 'ŠIBENIK',
  'DUBROVNIK', 'BJELOVAR', 'KASTELA', 'KAŠTELA', 'SAMOBOR', 'VINKOVCI',
  'KOPRIVNICA', 'SOLIN', 'VUKOVAR', 'DJAKOVO', 'ĐAKOVO', 'POZEGA', 'POŽEGA',
  'ZAPRESIC', 'ZAPREŠIĆ', 'PETRINJA', 'NIN', 'BIOGRAD', 'HRVATSKA', 'HR', 'CRO',
]);

/**
 * Payment-network and channel noise that says nothing about who was paid.
 */
const NOISE = new Set([
  'POS', 'ATM', 'CARD', 'KARTICA', 'TRGOVINA', 'DOO', 'D.O.O', 'DD', 'D.D',
  'LTD', 'BV', 'GMBH', 'SARL', 'INC', 'COM', 'WWW', 'HTTP', 'HTTPS',
  'PAYPAL', 'SUMUP', 'IZETTLE', 'STRIPE', 'REF', 'ACODE', 'TERMINAL',
]);

/**
 * Normalise a raw statement descriptor into a stable merchant key.
 *
 * Returns an empty string when nothing recognisable survives — the caller should
 * treat that as "no merchant" rather than storing a blank pattern.
 */
export function normaliseMerchant(raw: string): string {
  if (!raw) return '';

  const cleaned = raw
    .toUpperCase()
    // Legal forms go first, while their dots still hold them together. Splitting
    // punctuation first would turn "D.O.O." into "D O O" — three single letters no
    // token filter can safely recognise.
    .replace(/\bJ\s*\.?\s*D\s*\.?\s*O\s*\.?\s*O\s*\.?/g, ' ')
    .replace(/\bD\s*\.?\s*O\s*\.?\s*O\s*\.?/g, ' ')
    .replace(/\bD\s*\.?\s*D\s*\.?(?=\s|$)/g, ' ')
    // Separators become spaces so "KONZUM-4471" splits properly.
    .replace(/[_\-/\\|,.;:*#]+/g, ' ')
    // Drop anything that is not a letter, digit or space. Keeps Croatian diacritics.
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';

  const tokens = cleaned.split(' ').filter((token) => {
    if (!token) return false;
    // The rule from §7: any token carrying a digit is an id, a branch or a
    // reference, never a name.
    if (/\p{N}/u.test(token)) return false;
    if (PLACES.has(token)) return false;
    if (NOISE.has(token)) return false;
    return true;
  });

  if (tokens.length === 0) return '';

  return tokens.join(' ');
}

/**
 * Is this string a usable merchant key?
 *
 * A single letter is not — it is almost certainly debris from a stripped descriptor,
 * and storing it would match half the statement next month.
 */
export function isUsableMerchantKey(key: string): boolean {
  return key.length >= 2;
}
