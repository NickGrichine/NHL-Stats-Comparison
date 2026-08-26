# NHL Comparison 🏒

**[View the live site →](https://nickgrichine.github.io/NHL-Stats-Comparison/)**

Compare any NHL skater, goalie or team — from any of the **109 seasons since 1917-18** — on
an era-adjusted radar chart and a side-by-side stats table. Data refreshes itself from the
NHL's public API; nothing here is hand-maintained.

```
Wayne Gretzky 1985-86  vs  Connor McDavid 2024-25
        ↓                          ↓
 ranked against 1985-86     ranked against 2024-25
        └────────── one chart ──────────┘
```

---

## ✨ What it does

- **Every player, every season.** All ~1,000 skaters and ~100 goalies per season, plus every
  team, back to the league's first year. Not a top-100 list.
- **Era-adjusted comparison.** Each stat is shown as a percentile against the players who
  actually shared the ice with that player, in that season, at that position — so 1985 and
  2025 sit on the same 0-100 axis without pretending the eras were the same.
- **Cross-era charts.** Pin different seasons to different players and put them on one radar.
- **Regular season, playoffs, and career totals.**
- **Shareable links.** The whole comparison lives in the URL.
- **Live scoreboard and standings**, refreshed hourly.
- **Honest gaps.** The league did not record hits before 1997-98 or plus/minus before
  1967-68. Those axes disappear rather than being plotted as zero.

---

## 🧩 The interesting problem: CORS

The NHL's stats API is free, keyless and undocumented. It is also **unusable from a
browser**: `api.nhle.com` and `api-web.nhle.com` return `Vary: Origin` but no
`Access-Control-Allow-Origin` for third-party origins, so a `fetch()` from GitHub Pages is
blocked before it leaves the page.

The usual workarounds — a public CORS proxy, or a serverless function — either add a
third-party dependency that rate-limits and goes down, or add a server to a site that does
not otherwise need one.

**This project moves the API call to build time instead.** A scheduled GitHub Actions
workflow calls the NHL API from CI, where there is no browser and therefore no CORS, and
publishes plain JSON that the site loads same-origin. No keys, no proxy, no server, no
runtime dependency on anything but GitHub Pages.

```
GitHub Actions (cron)  ──fetch──▶  NHL stats API
        │
        ├──▶ commits JSON to the `data` branch     (durable, resumable, forkable)
        │
        └──▶ vite build + data/ ──▶ GitHub Pages ──▶ browser (same-origin fetch)
```

Finished seasons never change, so each one is fetched **exactly once** in the project's
lifetime and skipped forever after. Only the current season, the scoreboard and the
standings are refetched.

---

## 📐 Era-adjusted percentiles

The first version of this app scaled every stat against a hardcoded cap tuned to the
2024-25 top 100 — 130 points, 60 goals, and so on. Applied to 1917-18 those caps collapse
every polygon to a dot; applied to a fourth-liner they say nothing at all.

v2 replaces the caps with a **mid-rank percentile against a cohort**:

| | |
|---|---|
| **Same season** | a player is judged by the league he actually played in |
| **Same game type** | playoff runs are not compared to 82-game seasons |
| **Same position group** | a defenceman is ranked against defencemen, not first-line wingers |
| **Minimum games** | a fifth of the schedule, so a three-game call-up does not lead the league in shooting percentage |

Ties count as half a rank, which matters more than it sounds — hundreds of skaters finish a
season with exactly zero power-play goals, and without tie-handling every one of them would
read as the 0th percentile. Stats where a lower number is better (GAA, shots against,
giveaways) are inverted, so a bigger polygon always means a better performance.

A **raw range** toggle scales against the season's best and worst instead, for when you
specifically want to see that Gretzky had nearly twice as many points as anyone else —
information that percentile rank deliberately flattens away.

---

## 🗜️ Columnar data files

A season file is ~1,000 objects that all share the same ~25 keys, which means the key names
are repeated a thousand times. Files are stored as field names once, values as arrays:

```json
{ "v": 1, "kind": "skaters", "seasonId": 20242025,
  "f": ["id", "name", "g", "a", "p"],
  "r": [[8476453, "Nikita Kucherov", 37, 84, 121]] }
```

Measured at **40% of the equivalent array-of-objects JSON** before gzip. Columns that are
null for an entire season are dropped, which is also how the app knows a stat did not exist
yet. Seasons load lazily, so the browser never pulls more than a few hundred KB.

---

## 🛠️ Built with

React 19 · TypeScript · Vite · Chart.js · Vitest · GitHub Actions · GitHub Pages

No state library and no data-fetching library: application state lives in the URL query
string (which is what makes every comparison shareable), and the small loader in
`src/api/datasets.ts` handles caching and de-duplication.

---

## 🚀 Running it locally

```bash
npm install
npm run dev            # http://localhost:5173
```

The dev server serves the dataset from `public/data/`. Either let the deployed workflow
build it, or generate it yourself:

```bash
npm run data:dev                      # writes straight into public/data/
```

A first full backfill is ~650 requests across 109 seasons and takes a few minutes. After
that, a run touches roughly eight files. To try it without waiting, fetch one season:

```bash
npm run data -- --out=public/data --seasons=20242025
npm run data -- --out=public/data --live-only    # scoreboard and standings only
npm run data -- --out=public/data --force        # refetch everything
```

Other scripts:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

---

## 📁 Layout

```
.github/workflows/
  update-and-deploy.yml   cron + push + manual: fetch → commit data → build → deploy
  ci.yml                  typecheck, lint, test, build
scripts/
  nhl-client.mjs          retries, backoff, concurrency cap, honest User-Agent
  endpoints.mjs           NHL field names → ours, in one place
  fetch-data.mjs          incremental orchestrator
shared/                   codec + season helpers, used by both the pipeline and the app
src/
  api/                    typed loaders over the published JSON
  lib/                    percentile engine, metric definitions, formatters, team data
  state/                  URL-backed application state
  components/
tests/
  fixtures/               real API responses, trimmed — so the pipeline is testable offline
```

### Published data

```
data/manifest.json                              seasons, row counts, generatedAt
data/index/players.json                         every player who ever played
data/index/franchises.json
data/season/{seasonId}/{skaters|goalies|teams}-{2|3}.json
data/career/{skaters|goalies}-{2|3}.json
data/live/{scoreboard|standings}.json
```

`2` is the regular season, `3` is the playoffs — the NHL's own `gameTypeId`.

---

## 🧪 Tests

`npm test` covers the parts where a silent wrong answer would be worst:

- the percentile engine — tie handling, inversion, cohort filtering, degenerate cohorts
- the columnar codec — round-tripping, null-column dropping, junk tolerance
- the pipeline's field mapping, run against **real API responses** committed under
  `tests/fixtures/` — including a 1917-18 row, so the era-gap handling is verified rather
  than assumed
- URL state parsing and serialisation, including the cross-era `id@season` syntax

---

## ⚙️ Setting it up on a fork

1. **Settings → Pages → Source: GitHub Actions.**
2. **Actions → Update data and deploy → Run workflow.** The first run backfills every season
   and creates the `data` branch.
3. That's it. The schedule takes over from there.

> GitHub disables scheduled workflows after 60 days of repository inactivity. If the data
> ever goes stale, the **Run workflow** button re-arms it.

---

## 📊 Data

All data comes from the NHL's public stats API (`api.nhle.com/stats/rest` and
`api-web.nhle.com/v1`), which is free and requires no key, but is undocumented and
unsupported — field names can change without notice, which is why `tests/fixtures/` exists.

This project is not affiliated with or endorsed by the National Hockey League.
