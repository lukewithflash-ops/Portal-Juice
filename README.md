# Portal Juice

**The number moved.**

Lines, juice, streaks. Not a book.

Portal Juice is its own product and its own site. It is **not** Rip Portal
(ripsportal.com) and is not linked from it — no shared routes, nav, links, or
wordmark. It borrows the Portal *look* only: near-black `#030306` ground, a
low-contrast swirl behind the cards, purple foil panels, green for a move for
that side, red against, off-white unchanged.

Footer on every route: *Lines and prices only. Portal Juice is not a book and
does not take the other side.*

## Routes

| Nav   | Path               | What it is |
|-------|--------------------|------------|
| Lines | `/lines`           | Read-only board. Sport rail (NFL → NBA → MLB → NHL → Soccer, chip only when a sport has real rows), then **Moved**, **Props**, **Sides**. Juice is the largest type, line second, name third. Tap a card → print history only. Juice pulses once on change; stale rows are labelled and never pulse. Polls `/api/lines` every 30 s. |
| Board | `/lines/board`     | Players on a run, Teams on a run, Hot props, Cold props. Hit rate + sample size only — no money. Cold hides anyone under 8 lines (section hidden if nobody qualifies). Each section ends "Past hits are not a pick." |
| Log   | `/lines/portfolio` | "Log a pick." for picks already made at a book: sport, player/side, line, odds, stake, book, date, status (open / win / loss / push). Open, Settled, and a sticky Tally of **counts only**. `localStorage` on the device; nothing leaves the browser. |

`/` redirects to `/lines`. `GET /api/lines` is the only API route; there is no write route.

## Data: empty until real rows

No odds are seeded, invented, or sampled. The odds vendor is not chosen yet.

- `LINES_FEED_URL` (+ optional `LINES_FEED_TOKEN`) → JSON matching
  `LinesSnapshot` in `src/lib/types.ts`. Rows that break the contract are
  dropped, not patched. No feed / failed pull → empty board ("No rows." /
  "Waiting on a real print.").
- Headshots render only from hosts in `LICENSED_HEADSHOT_HOSTS` (licensed feed
  or league-approved). Instagram, Google, Pinterest, Twitter CDNs are always
  blocked. Otherwise: team mark, then initials. No scraped or hotlinked faces.
- `/lines/board` reads `src/data/history.ts` — graded lines (closing line +
  final result). It ships empty; streaks appear only from real stored lines.

## Not built (on purpose)

No bet button, coins, balance, payout, cash out, parlay, money won. No mascot,
wizard, cartoon. No App Store, account sync, payments, VIP checkout, bet
placement, odds invention.

## Instagram (ops, not code)

Second account **@portaljuice** — not @ripsportal. Bio: *Lines, juice,
streaks. Not a book.* Bio link → `/lines` on the Portal Juice domain (never the
Pokémon/pack site). Grid is the prop card and the line move; no pack rips.

## Domain

`portaljuice.com` is registered to a third party (since 2024, not on our Vercel
account) and `portaljuice.io` is not ours either. Set `NEXT_PUBLIC_SITE_URL`
once a Portal Juice domain is secured. Never `ripsportal.com/betting`.

## Dev

```bash
npm install
npm run dev      # http://localhost:3000/lines
npm test         # board math, headshot policy, forbidden-copy + no-seed checks
npm run build
```

Next.js 16 (App Router), React 19, TypeScript, Tailwind v4.
