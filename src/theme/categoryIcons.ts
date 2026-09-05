/**
 * Category icons.
 *
 * ⚠ PROPOSED, NOT SPECIFIED. DESIGN.md §6.7 requires "a small category icon" in each
 * mosaic block, and §4.3 notes icons act as a second channel so the screen never
 * relies on colour alone — but no document says which icon belongs to which
 * category. These are lucide picks in the established stroke language (§5.2), put in
 * one map so changing them is a single edit. Confirm or replace before launch.
 *
 * Unknown categories fall back to null and the block renders without an icon rather
 * than guessing.
 */
import { Bus, Dumbbell, Fuel, ShoppingBasket, UtensilsCrossed } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

export const categoryIcons: Record<string, LucideIcon> = {
  Groceries: ShoppingBasket,
  Transport: Bus,
  'Eating out': UtensilsCrossed,
  Fuel,
  Fitness: Dumbbell,
};

export function categoryIcon(name: string): LucideIcon | null {
  return categoryIcons[name] ?? null;
}
