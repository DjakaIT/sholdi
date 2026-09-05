/**
 * Mock exchange for the §6.6 chat. Replaced by `ask-sholdi` at a later build step.
 *
 * ARCHITECTURE.md §4.5 notes the real function is sent an aggregated summary —
 * monthly totals per category, trends, goals — never the raw expense table. So the
 * answers below are the kind a summary can support, not row-level lookups.
 *
 * Figures agree with the mock month: Eating out 38,815 cents this month against
 * 47,300 last.
 */
export type MockMessage = {
  id: string;
  from: 'user' | 'sholdi';
  text: string;
  /** Optional action pills beneath a reply (§6.6). */
  actions?: string[];
};

export const MOCK_CONVERSATION: MockMessage[] = [
  {
    id: 'm1',
    from: 'user',
    text: 'How am I doing on eating out?',
  },
  {
    id: 'm2',
    from: 'sholdi',
    text: 'Down again — €388 this month against €473 in August. That is two months running, and it is most of the reason your total fell 12%.',
    actions: ['See the month'],
  },
  {
    id: 'm3',
    from: 'user',
    text: 'What about groceries?',
  },
  {
    id: 'm4',
    from: 'sholdi',
    text: 'Up slightly, €774 against €740. It is 42% of the month, which is where it usually sits.',
  },
];
