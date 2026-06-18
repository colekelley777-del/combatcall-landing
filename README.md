# combatcall-landing

Public site for CombatCall — the data-driven UFC analytics tool. Two surfaces,
one Astro static build, one Vercel project, one `combatcall.com` domain:

1. **The marketing site** — the hand-written homepage (`public/index.html`) and
   privacy page (`public/privacy.html`), served verbatim at `/` and `/privacy`.
   These are NOT touched by Astro — they ship exactly as written (hero video and
   all). Edit copy by editing those HTML files directly, same as before.
2. **The programmatic-SEO `/ufc/` pages** — generated at build time from Supabase
   (the Programmatic SEO Engine, Phase 1 — GitHub issue #5).

## Programmatic SEO (Phase 1)

Auto-generated, genuinely-useful prediction pages for the **next upcoming UFC
card**, built to rank for what UFC bettors search and funnel traffic into the
free email tier → paid.

Pages generated each build:

- `/ufc/<event-slug>-predictions` — the next card: every fight's matchup, stats,
  model analysis, line, and the model pick.
- `/ufc/<fighterA>-vs-<fighterB>-prediction` — one per fight on that card.

**Give-away / gate rule (Cole-confirmed):** full analysis + stats are public on
every fight. The model **pick** is shown free for the opening prelims
(`FREE_PICK_FIGHTS` in `src/lib/data.ts`); for every other fight the pick is
rendered server-side (so it's crawlable) but visually locked behind a free email
signup.

### Data — single source of truth, never fabricated

`src/lib/data.ts` fetches the next card at build time with the Supabase **anon**
key (public-read RLS; no service-role key in the SEO build). It reads the SAME
tables the app reads — `cached_matchup_insights`, `card_scores`, `prop_scores` —
and `src/lib/ranking.ts` reproduces the app/pipeline's shared ranking
(`rank_value` DESC, the unified fractional-Kelly key written by the pipeline's
`compute_card_edge.py`). The fight's **pick** is its top-ranked card — the exact
card the app's Best Bets surfaces, so the SEO pages never diverge from the
product. `src/lib/cardRender.ts` renders the model's already-English strings
(headlines, hit-rate stack labels, prop receipts). Real data only.

### Funnel

`src/components/EmailGate.astro` inserts the email into Supabase
`marketing_emails` via the anon key (same destination as the app's
`/api/captureEmail`, public-insert RLS), tagged with a per-page `source`, sets
`localStorage.cc_email_captured`, and fires the PostHog `email_captured` event.
Page views are auto-captured by PostHog (`src/lib/analyticsClient.ts`).

### SEO

Per-page unique `<title>` / meta / canonical / OG, schema.org (SportsEvent +
subEvents, BreadcrumbList, FAQPage) via `src/lib/schema.ts`, event ↔ matchup
internal linking, `sitemap-index.xml` (`@astrojs/sitemap`), `public/robots.txt`,
compliance footer (18+, not gambling advice, 1-800-GAMBLER) on every page.

## Build / preview

```sh
npm install
# build needs the Supabase anon key + URL in env (see .env.example).
# Locally: put them in a gitignored .env. On Vercel: project env vars.
npm run build
npm run preview
```

Required env (see `.env.example`):

- `SUPABASE_URL`, `SUPABASE_ANON_KEY` — build-time fetch (server).
- `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` — client (email capture).
- `PUBLIC_POSTHOG_KEY` (optional) — analytics; no key = no-op.

The anon/publishable keys are public-by-design (they ship in the client bundle;
RLS protects the data) — same posture as the app.

## Deploy

Vercel project `combatcall-landing`, framework **Astro**, build `astro build`,
output `dist/` (see `vercel.json`). Pushes to `main` auto-deploy. Set the
Supabase + PostHog env vars in the Vercel project. Rebuild as new cards approach
(scheduled GHA / redeploy) to refresh the generated pages.

## Layout

- `public/` — `index.html`, `privacy.html`, images, hero video, `robots.txt`
  (served verbatim at the site root).
- `src/pages/ufc/` — the two generated page routes.
- `src/lib/` — `data.ts` (build-time fetch), `ranking.ts` (shared ranking),
  `cardRender.ts` (card → display strings), `schema.ts`, `slug.ts`,
  `analyticsClient.ts`.
- `src/layouts/SeoLayout.astro` — head/meta/schema/brand/nav/compliance-footer.
- `src/components/` — `FightCard.astro`, `EmailGate.astro`.
