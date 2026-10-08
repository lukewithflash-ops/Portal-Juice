# Portal Juice

**The number moved.**

Lines, juice, streaks. Not a book.

Portal Juice is its own site (portaljuice.app). Near-black `#030306` ground, a
low-contrast swirl, purple foil panels, green when a number moves up, red when
it moves down, off-white when it is unchanged.

Footer on every route: *Lines and prices only. Portal Juice is not a book and
does not take the other side.*

## Routes

| Nav    | Path                         | What it is |
|--------|------------------------------|------------|
| Lines  | `/lines`                     | Today’s games, over/unders, and the read-only prop board. Juice is the largest type on a prop, line second, name third. Tap a line for its print history. |
| Games  | `/games`                     | Same slate: popular games, totals, full schedule. Tap a game for the full page. |
| Props  | `/props`                     | Player prop lines ESPN posted for today. |
| MVP    | `/mvp`                       | MVP futures. Best of the board is the shortest prices by implied chance, not a pick. |
| Trends | `/trends`                    | Last-5 stat averages from ESPN gamelogs. Past results are not a pick. |
| News   | `/news`                      | ESPN headlines, linked out. |
| Board  | `/lines/board`               | Players on a run, teams on a run, hot props, cold props. Hit rate and sample size only. |
| Log    | `/lines/portfolio`           | A device-only log of picks already made somewhere else. Counts only in the tally. |
| App    | `/app`                       | Add to Home Screen. No store wrapper. |
|        | `/games/[league]/[id]`       | One game, plus a share image with the matchup and total when ESPN posted one. |
|        | `/teams/[league]/[team]`     | Record, next game, recent finals, ESPN headlines. |

`/` redirects to `/lines`.

## Where the numbers come from

No odds are invented.

- **Schedule, score, totals, spreads, moneylines:** ESPN public scoreboard
  (`site.api.espn.com`), refreshed about every 60 seconds. The provider name
  ESPN sends (often DraftKings) is shown next to the number. If a game has no
  odds in that payload, the tile says so.
- **Popular:** national TV first, then a ranked team, then ESPN’s own order.
  Not a view count.
- **Line move:** the last total and home spread you saw are stored on this
  device only. A later visit flags the change. Green is up, red is down.
- **Player props:** ESPN core `propBets` for the provider on that game (often DraftKings). The line and the open line are shown only when sent. No juice is invented.
- **MVP:** ESPN season futures (`Regular Season MVP`). Implied chance is computed from the American price. Season stats are the figures ESPN returns for the shortest prices.
- **Trends:** ESPN team leader lists, then that player’s gamelog. The average
  is the mean of up to the last 5 games that actually exist.
- **News:** ESPN news JSON. The headline is theirs; the link leaves this site.
- **Props board:** `LINES_FEED_URL` (+ optional `LINES_FEED_TOKEN`), shaped
  like `LinesSnapshot` in `src/lib/types.ts`. No feed means an empty prop board.
- **Headshots:** `a.espncdn.com` plus any host in `LICENSED_HEADSHOT_HOSTS`.
  Instagram, Google, Pinterest, and Twitter hosts are blocked. Otherwise the
  team mark, then initials.

## Not built

No button that places a wager, no coins, balance, payout, cash out, parlay, or
money won. No store wrapper, account sync, payments, or checkout.

## Dev

```bash
npm install
npm run dev
npm test
npm run build
```

Next.js 16 (App Router), React 19, TypeScript, Tailwind v4.
