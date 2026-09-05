# Sholdi — Design System

This document is the single source of truth for Sholdi's visual language. When implementing any screen, follow this file over your own defaults. If something isn't specified here, ask before inventing it.

---

## 1. The product in one paragraph

Sholdi is a personal expense tracker whose differentiator is that you never set it up manually. You hand it a monthly bank PDF statement and it extracts, categorises and analyses everything automatically. You can also scan receipts, speak, type, or drop any photo. An AI layer ("Sholdi") delivers a small number of calm, useful observations each month — never nagging, never a chatbot demanding attention.

Name origin: *Šoldi* is Dalmatian dialect for money, from Venetian *soldi*. The internationalised spelling drops the caron — **and that caron became the logo.**

---

## 2. Brand mark

**The caron (ˇ) is Sholdi's mark.** Two strokes, a shallow V.

```
SVG path (viewBox "0 0 14 7"):
  M2 1 L7 5.5 L12 1
  fill: none
  stroke: currentColor
  stroke-width: 2.2
  stroke-linecap: round
  stroke-linejoin: round
```

Usage rules:
- **Wordmark:** caron floats above the "S" of Sholdi, coloured ink (`#EFEDEA`).
- **App icon:** caron above a capital S on a `#131114` rounded tile.
- **In-app:** the caron prefixes every line of text spoken by Sholdi (insights, chat replies, the home insight row). It is Sholdi's voice indicator and must never be used decoratively anywhere else.
- Minimum render size 12×6px. It stays legible at 16px.

---

## 3. Typography

**Space Grotesk** — the only typeface. Weights 400 and 500 only.

Install: `npx expo install @expo-google-fonts/space-grotesk expo-font`
Family names: `SpaceGrotesk_400Regular`, `SpaceGrotesk_500Medium`

| Role | Size | Weight | Tracking | Notes |
|---|---|---|---|---|
| Hero amount | 44 | 500 | -0.03em | Integers only at this size |
| Hero currency symbol | 20 | 400 | — | Colour `faint` |
| Hero cents | 17 | 400 | — | Colour `faint` |
| Screen title | 22 | 500 | -0.01em | e.g. "47 expenses found" |
| Index — largest category | 19 | 400 | -0.01em | Scales down with spend |
| Index — smallest category | 13 | 400 | — | Hard floor |
| Body / Sholdi voice | 13.5 | 400 | — | line-height 1.7 |
| Row label | 13.5 | 400 | — | |
| Amount in row | 13 | 400 | — | Tabular figures |
| Secondary / date | 11 | 400 | — | Colour `muted` |
| Eyebrow label | 11 | 400 | 0.14em | UPPERCASE, colour `muted` |
| Delta / micro | 10.5 | 400 | — | |

**All monetary values must use tabular figures.** In React Native:
`fontVariant: ['tabular-nums']` — without it, right-aligned amounts jitter.

Never use a second typeface. Never use italic. Never use weights above 500.

---

## 4. Colour

### 4.1 The rule that governs everything

> **Colour lives in ink, never in surfaces.**

Every background in the app is on a single neutral ramp with a slight warm-plum undertone. Colour appears only in text, icons, dots, and category blocks. Violating this is what makes the app look generic — earlier iterations tinted surfaces and the result read as sickly.

### 4.2 Neutral ramp (dark theme — the default and only shipped theme for v1)

| Token | Hex | Use |
|---|---|---|
| `page` | `#131114` | Screen background |
| `pageDeep` | `#0F0E11` | Background behind a modal sheet |
| `surface` | `#1C1A1E` | Cards, rows, segmented control, chat input |
| `raised` | `#262430` | Input tiles, user chat bubbles, active segment |
| `line` | `#2E2C32` | Borders on outlined buttons and tiles |
| `hairline` | `#232128` | Nav top border, dismissed-state borders |
| `ink` | `#EFEDEA` | Primary text, primary button fill, caron |
| `ink2` | `#DAD8DC` | Body text inside cards |
| `ink3` | `#C9C7CC` | Sholdi's voice text, tertiary |
| `muted` | `#8B8890` | Labels, dates, secondary |
| `faint` | `#5E5C64` | Inactive nav icons, currency symbol, cents |
| `onInk` | `#191715` | Text on top of ink-filled buttons |

The undertone is deliberate and small (~3% plum). Do not "correct" these to pure grays — pure neutral black reads as developer documentation.

### 4.3 Category colours

Each spending category owns a muted natural colour. That colour follows the category **everywhere** it appears: dot on home rows, label in PDF review, block in the mosaic, delta figures.

| Category | Accent | Mosaic block bg | Block title | Block amount |
|---|---|---|---|---|
| Groceries | `#9DBE8C` sage | `#28331F` | `#D5E6C8` | `#C2D6B4` |
| Transport | `#89A7CC` slate | `#232E42` | `#CBDCF2` | `#B8CCE6` |
| Eating out | `#B58BB1` plum | `#39293C` | `#EAD2E8` | `#DCC0DA` |
| Fuel | `#A8B380` olive | `#333A22` | `#DEE6C4` | `#CFD8B0` |
| Fitness | `#9D8FD0` heather | `#2C2745` | `#DAD2F2` | `#C8BFE8` |

Rules:
- New user-created categories get a colour **auto-assigned from this fixed palette**, cycling. Never offer a free colour picker — the palette is what keeps the app coherent.
- These five differ in lightness as well as hue, so they survive common colour-vision deficiencies. Icons act as a second channel; never rely on colour alone.
- **Goals are not categories and get no category colour.** They render outlined in `ink`/`muted`.

### 4.4 What has been explicitly rejected

Do not introduce: mint green, vermilion/red-orange, iris violet, cyan, amber, yellow, brown, or any saturated neon. Do not add gradient washes. Do not colour primary buttons — the primary button is ivory (`ink`) with dark text.

---

## 5. Components

### 5.1 Buttons

| Variant | Spec |
|---|---|
| Primary | bg `ink`, text `onInk`, weight 500, size 12.5, height **43px fixed**, `borderRadius: 999`, centred via flex |
| Secondary | transparent, 1px border `line`, text `ink`, height 43px, radius 999 |
| Inline pill | same as above but `paddingVertical: 8, paddingHorizontal: 14`, size 12 |
| Dismiss | inline pill with text `muted`, border `hairline` |

**Critical:** buttons use a fixed height with `alignItems: 'center'`, not vertical padding. Padding-based centring caused text to ride up in the container.

### 5.2 Bottom navigation

Flat, edge-to-edge, five icon tabs. No floating pill, no FAB, no labels, no filled squares — all rejected.

- Container: `marginTop: auto`, `borderTopWidth: 1`, colour `hairline`, `justifyContent: 'space-around'`, `paddingBottom: 6`
- Each tab: column, `gap: 9`, width 40
- **Overline indicator** above each icon: 16×2px, radius 1. Active = `ink`, inactive = transparent
- Icon 20px, stroke 1.6. Active `ink`, inactive `faint`
- Tabs in order: Home · Stats · Add · Ask · Index
- The only nav animation: the overline slides horizontally between tabs. Icons never fill, scale, or bounce.

### 5.3 Cards and rows

- Row card: bg `surface`, radius 14, padding `12px 13px`, row layout, space-between
- Insight card: bg `surface`, radius 16, padding `15px 14px`
- Input tile: bg `raised`, radius 14, padding `12px 11px`
- Bottom sheet: bg `surface`, radius `20px 20px 24px 24px`, 32×3px grabber centred with 16px bottom margin
- Chat bubble (user only): bg `raised`, radius `16px 16px 4px 16px`, max-width 82%, aligned right

**Sholdi's chat replies have no bubble** — plain text on the page, prefixed by the caron. This is deliberate: it makes Sholdi the voice of the app rather than a chatbot pasted into it.

### 5.4 Charts

There is no charting library in v1 and none is needed:
- **Sparkline** (home): a single cubic bezier path, stroke `muted` 1.5px, with one 2.5r dot in `ink` at the final point. Render with `react-native-svg`.
- **Proportional bars** (index): plain `View`s with percentage widths. 2px tall, radius 1.
- **Mosaic** (categories): flexbox. Block area maps to spend share.

Only add Victory Native XL if a genuinely interactive chart appears in a later version.

---

## 6. Screens

Seven core screens plus one system surface.

### 6.1 Splash
Centred wordmark with floating caron, 36px/500. Tagline "Money, sorted." in `muted` 12.5px, 12px below.

### 6.2 Home
Top row: segmented month switcher (`surface` pill, active segment `raised`) on the left, notification bell in a 32px circular `surface` button on the right.
Then: eyebrow "SPENT IN SEPTEMBER" → hero amount lockup (`€` faint 20 / `1,842` ink 44/500 / `.60` faint 17, baseline-aligned) → change pill (1px `line` border, radius 999, text `ink3` 11px, e.g. "↓ 12% vs Aug").
Then sparkline. Then two-to-three top category rows, each with its category-coloured dot.
Then one Sholdi insight row: same `surface` card, caron prefix, text `ink3` 12.5px.
Bottom nav.

### 6.3 Universal input (bottom sheet over dimmed home)
Backdrop is the home screen at 35% opacity on `pageDeep`.
Sheet: grabber, title "Add spending" 16px/500, subtitle "Any way you like. Sholdi sorts it out." in `muted` 11.5px.
2×2 grid of equal tiles — **all four weighted identically, no highlighting:**
| Tile | Icon | Sub-label |
|---|---|---|
| Scan | scan | a receipt |
| Say it | microphone | "38 euro, Konzum" |
| Type it | keyboard | plain words work |
| Bank PDF | file-text | whole month at once |
Below: dashed `line` border catch-all, radius 12, centred text "or drop any photo" in `muted` 11.5px.

The sub-labels are functional, not decorative — "38 euro, Konzum" teaches the user that voice takes plain speech, which removes the "what do I say?" hesitation better than any onboarding.

### 6.4 PDF import review
Eyebrow "AUGUST STATEMENT" → title "47 expenses found" → subtitle "Categories are a suggestion. Tap any to change."
List of extracted rows: merchant name (`ink2` 13px) with category label below it in the category's colour, prefixed by a 5px dot. Amount and date right-aligned.
"and 43 more" in `muted`, centred.
Footer: two buttons in a row — "Review each" (secondary, flex 1) and "Import all 47" (primary, flex 1.4).

### 6.5 AI insight
Eyebrow "NOTES FROM SHOLDI". Two insight cards.
Each card: caron + eyebrow-style meta (`#B6B4B9`), e.g. "SHOES · 3RD MONTH". Body in `ink2` 13px, line-height 1.65. Action pills below.
Footer, centred, `muted` 11.5px: **"2–3 notes a month, max."** — keep this line. It converts the anti-nagging principle into a visible product promise.

### 6.6 Chat
Eyebrow "ASK SHOLDI". Conversation anchored to the bottom.
User messages: bubbles, right. Sholdi: caron + plain text, no bubble, with optional action pills beneath a reply.
Input: `surface` pill, `paddingLeft: 16`, placeholder "Ask anything" in `muted`, and a 34px circular `ink` button with a dark mic icon on the right.

### 6.7 Categories — "the Index" (mosaic)
Header row: eyebrow "INDEX · SEPTEMBER" and a 30px circular `surface` "+" button.
Mosaic where **block area is proportional to spend**:
- Row 1: largest category, full width, height 92
- Row 2: two blocks, height 76, flex weights by spend (e.g. 17 / 14)
- Row 3: two blocks, height 68, flex weights (e.g. 12 / 9)
- Each block: category name + small category icon top row; amount + delta bottom row. Delta in the category's own colour. The largest block also shows "42% of month".
- Goal strip last: full width, height 58, bg `surface`, 1px `#3E3C44` border, no category colour.
Closing line: caron + `ink3` 12px, e.g. **"Eating out is down for the second month in a row — nice work."** This line is what stops the screen being a table. Always end this screen with Sholdi's voice.
Bottom nav, Index tab active.

Clamp rule: block heights and index type sizes must be clamped (type 13–19px) so a single outlier month doesn't dwarf everything.

### 6.8 Payday notification (system lock screen)
Title: **"It's payday. Money's in 🙌"**
Body: **"See what got better since August?"** — always name the real previous month.
App icon: caron-S tile on `#131114`.
Tapping it must deep-link to a month-over-month comparison, **not** the home screen.

Copy pattern for all Sholdi push messages: *statement in the title, single question in the body, twelve words or fewer, name the real month.*

---

## 7. Voice and copy

Sholdi's voice: calm, brief, on the user's side. It observes; it does not instruct.

- Lead with the win: "what got better" before "what to improve".
- Never moralise. "No judgement, just worth a glance before pair four." is the register.
- Credit the user, not the app: "nice work", not "you followed our advice".
- Active voice, sentence case, plain verbs.
- Buttons name what happens: "Import all 47", not "Submit".
- Insight cadence is capped at 2–3 per month and this is stated in the UI.

Never write: "AI", "smart", "powered by", "insights engine", exclamation marks in insight bodies, or emoji anywhere in-app (emoji are for push notifications only).

---

## 8. Motion

Restraint is the rule. Spend the motion budget in four places only:

1. Caron draws itself in on the splash (stroke-dash animation, ~600ms).
2. Hero amount counts up on month change.
3. Bottom sheet springs open; the home screen behind dims to 35%.
4. Nav overline slides between tabs.

Everything else is instant. No fade-and-slide-up on cards, no hover-equivalents, no shimmer loops. The one exception is the AI processing state during extraction, which gets a calm progress treatment — never a spinner with sparkles.

Respect `prefers-reduced-motion` / `AccessibilityInfo.isReduceMotionEnabled()`.

---

## 9. Anti-patterns — do not reintroduce

These were each explicitly rejected during design. Reintroducing them is a regression:

- Icon-tile category grid (the generic AI look)
- Floating pill navigation with a centre FAB
- Labelled flat nav with filled square icons
- Tinted/coloured surfaces (produced a "vomit" feeling)
- Coloured primary buttons
- Colour-filled area under the sparkline
- Highlighting the Bank PDF tile above the other three inputs
- Sholdi's replies in chat bubbles
- Editorial layouts, hairline-rule broadsheet styling, serif display type
- Any second typeface
