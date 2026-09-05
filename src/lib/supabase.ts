/**
 * Supabase client. ARCHITECTURE.md §1, §6 step 2.
 *
 * On keys: the Supabase URL and *anon* key belong in `EXPO_PUBLIC_*`. They are
 * designed to be public and are useless without a matching RLS policy — which is
 * why §3 insists RLS is on for every table from the first migration.
 *
 * The rule in §4.1 is about a different key entirely: the Anthropic API key must
 * NEVER appear here or anywhere else on the device. Every AI call goes through an
 * Edge Function that holds it as a server-side secret.
 *
 * The client is created lazily. Importing this module must never crash the app, so
 * a missing config surfaces when something actually tries to talk to the backend
 * rather than at startup.
 */
import { AppState, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** False until a project is wired up. Screens can fall back to mock data on this. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * SecureStore caps a single value at ~2KB, and a Supabase session carrying a JWT
 * regularly exceeds that. So values are split across numbered chunks, with the base
 * key holding the chunk count.
 */
const CHUNK_SIZE = 1800;

const secureStoreAdapter = {
  async getItem(key: string): Promise<string | null> {
    const head = await SecureStore.getItemAsync(key);
    if (head === null) return null;

    const count = Number(head);
    // A plain (unchunked) value written by an older build.
    if (!Number.isInteger(count) || count < 1) return head;

    const parts: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`);
      // A missing chunk means a torn write — treat the session as absent rather
      // than handing back a corrupt JSON fragment.
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    await clearChunks(key);

    const count = Math.ceil(value.length / CHUNK_SIZE);
    for (let i = 0; i < count; i += 1) {
      await SecureStore.setItemAsync(
        `${key}.${i}`,
        value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
      );
    }
    await SecureStore.setItemAsync(key, String(count));
  },

  async removeItem(key: string): Promise<void> {
    await clearChunks(key);
    await SecureStore.deleteItemAsync(key);
  },
};

async function clearChunks(key: string): Promise<void> {
  const head = await SecureStore.getItemAsync(key);
  const count = Number(head);
  if (!Number.isInteger(count) || count < 1) return;
  for (let i = 0; i < count; i += 1) {
    await SecureStore.deleteItemAsync(`${key}.${i}`);
  }
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase is not configured. Copy .env.example to .env and set ' +
        'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.'
    );
  }

  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      // SecureStore has no web implementation; the browser build falls back to the
      // library default (localStorage), which is only used for local dev anyway.
      storage: Platform.OS === 'web' ? undefined : secureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      // No URL-based session detection outside the browser: there is no URL bar.
      detectSessionInUrl: false,
    },
  });

  // Supabase refreshes tokens on a timer, which the OS suspends in the background.
  // Tying the timer to foreground/background stops it firing uselessly and gets a
  // returning user a fresh token immediately.
  if (Platform.OS !== 'web') {
    const active = client;
    AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void active.auth.startAutoRefresh();
      } else {
        void active.auth.stopAutoRefresh();
      }
    });
  }

  return client;
}
