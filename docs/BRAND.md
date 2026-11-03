# throttleindex brand guidelines

throttleindex shows whether Claude and Codex limits are shrinking, measured by the developers who hit them. It should feel like a tool a developer built for other developers: direct, a bit cheeky, and never corporate.

Every rule below maps to a token in `dashboard/src/style.css`. Change the token, not the component.

## 1. Voice

- Write like a developer posting on Reddit or HN. Short sentences. Plain words.
- The headline is the complaint people already have: "did they just nerf the limits? again!?" Lowercase is fine there.
- Body copy is calm and factual. Say what the number means, not how to feel about it.
- Never claim a cut the data can't show. Use "lower than last week", not "Anthropic cut your limit".
- No em dashes or en dashes. Use a period, a comma or a hyphen.
- No filler words: "seamless", "unleash", "elevate", "next-gen".

## 2. Logo

- **Mark:** five vertical bars, three filled in accent, two outlined. It is a tiny version of the dashboard bar: some allowance left, some taken away.
- **Wordmark:** `throttleindex` in Geist Sans Bold, lowercase, letter spacing -0.03em.
- **Lockup:** mark on the left, 12 px gap, wordmark on the right. Mark height = 20 px at 22 px wordmark size.
- Do not use any other typeface for the logo. Do not recolour the mark or add effects.

## 3. Colour (dark theme only)

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#0d0d0f` | Page background. Never pure black. |
| `--surface` | `#151518` | Cards: Miso section, posts, dialog |
| `--raised` | `#1c1c21` | Hover, pills, skeletons |
| `--line` | `#26262c` | Card edges, dividers |
| `--line-strong` | `#34343b` | Terminal edge, hover edge |
| `--text` | `#ededf0` | Main text, big numbers |
| `--muted` | `#9a9aa3` | Supporting text |
| `--faint` | `#63636b` | Timestamps, source labels |
| `--accent` | `#e07a5f` | The one accent: Claude bar, cuts, live dot, kicker, `$` prompt, logo |
| `--calm` | `#7fb59a` | OpenAI bar, "better" arrows |
| `--warn` | `#e0b341` | Reserved for "unclear" states |

- One accent. Coral means "Claude" or "something got worse". Green means "OpenAI" or "something got better". Nothing else is coloured.
- Lost allowance is accent at 14% fill with a 38% outline (`--accent-soft`, `--accent-edge`).
- There is no light theme. The page ignores the system setting.

## 4. Type

Two families, never more than three in total.

| Family | Use |
|---|---|
| **Geist Sans** | Logo, headline, provider names, big numbers, body, buttons |
| **Geist Mono** | Data labels: live readings, the install command, kicker, pills, counts in posts |

| Token | Size | Use |
|---|---|---|
| `--t-head` | 40-64 px, Bold, -0.04em | Page headline (one per page) |
| `--t-figure` | 56-88 px, Medium, -0.05em | Big percentages |
| `--t-22` | 22 px, Semibold | Logo, provider names |
| `--t-18` | 18 px, Semibold | Section titles (What folks are saying) |
| `--t-16` | 16 px | Body text, post text |
| `--t-14` | 14 px | Supporting text, buttons |
| `--t-12` | 12 px | Timestamps, pills, mono labels. Nothing smaller. |

- Weights: 400, 500, 600, 700 only.
- Numbers use tabular figures.
- Only one uppercase label (the kicker) on the page.

## 5. Space and shape

- 4-point scale: 4, 8, 12, 16, 24, 32, 48, 64, 96 (`--s-1` to `--s-9`).
- Big gaps separate sections (48-64). Medium gaps separate a title from its content (16-24). Small gaps join related lines (4-12).
- Corner radius: 3 px for bar segments, 8 px for buttons and inputs, 12 px for cards. Pills are fully round.
- Max content width 1200 px. Side padding 20-40 px.
- No shadows for depth. Use a 1 px inset line instead. The only drop shadow is on the dialog.

## 6. Components

**Provider row.** Logo + name (+ change pill) on the left, big percentage on the right. Then a 40-segment bar. Then one line: runway on the left, live reading on the right. Nothing else.

**Bar.** 40 segments. A full bar means "same as last week". Filled segments use the provider colour. Lost segments use the accent soft fill. No data shows outlined empty segments.

**Miso card.** Kicker "For folks on macOS", a title, two sentences of copy, the terminal command with Miso asleep on top, then the contributor count and a quiet download link. One primary action only: the command.

**Miso the cat.** Always the real app sprite, scaled by whole pixels (`image-rendering: pixelated`). On the website Miso is asleep, gently breathing. The animation stops for reduced motion.

**What folks are saying.** Social-style cards: coloured initial avatar, author, source and age, the post text, then comment and point counts in mono. Calm, not loud: no likes animations, no badges.

**Buttons.** Primary: light fill on dark (Star on GitHub). Secondary: text link with underline. The terminal copy button sits inside the terminal.

## 7. Motion

- Only three things move: the live dot pulses, Miso sleeps, cards lift 1 px on hover.
- 150 ms ease for hovers. Everything stops under `prefers-reduced-motion`.

## 8. Never

- A second accent colour, a gradient, a glow or pure black.
- A blackletter, serif or third font family.
- Made-up numbers outside the labelled demo.
- More than one eyebrow label, decorative dots, or em dashes.
