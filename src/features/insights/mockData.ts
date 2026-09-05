/**
 * Mock notes for the §6.5 screen. Replaced by the `insights` table at build-order
 * step 8.
 *
 * The copy follows DESIGN.md §7: lead with the win, never moralise, credit the user
 * rather than the app, no exclamation marks, no emoji. The shoes card uses §7's own
 * register line as its closing sentence.
 *
 * The €85 in the celebration is the real difference between Eating out this month
 * and last in the mock month (38,815 vs 47,300 cents), so the screens agree.
 */
export type MockInsight = {
  id: string;
  kind: 'trend' | 'alternative' | 'goal' | 'celebration';
  meta: string;
  body: string;
  actions: { label: string; variant: 'pill' | 'dismiss' }[];
};

export const MOCK_INSIGHTS: MockInsight[] = [
  {
    id: 'ins_shoes',
    kind: 'trend',
    meta: 'Shoes · 3rd month',
    body: 'Three months, three pairs of shoes. No judgement, just worth a glance before pair four.',
    actions: [
      { label: 'Show the three', variant: 'pill' },
      { label: 'Not now', variant: 'dismiss' },
    ],
  },
  {
    id: 'ins_eating_out',
    kind: 'celebration',
    meta: 'Eating out · 2nd month down',
    body: 'Eating out is down for the second month in a row, about €85 back compared with August. Nice work.',
    actions: [
      { label: 'See the month', variant: 'pill' },
      { label: 'Dismiss', variant: 'dismiss' },
    ],
  },
];
