# combatcall-landing — agent notes

This is CombatCall's static marketing site. It used to be a Framer page; it now lives
here as a single `index.html` with inline CSS and a sprinkle of vanilla JS. The point
is maintainability: Cole isn't technical, so future copy edits are done by Bedivere
(me) editing the HTML directly. No build step, no framework.

## Where to find things in `index.html`

The file is organized into clearly labeled sections — search for the section name
in either the HTML comment marker (`<!-- SECTION: ... -->`) or the CSS comment
(`/* SECTION ... */` style headers). Order in the file:

1. `<head>` — meta, OG tags, fonts, favicon
2. Tokens, reset, primitives (CSS) — colors, fonts, `.btn`, `.section-head`
3. Header / nav
4. Hero (with background `<video>`)
5. Founder quote
6. Fighter profiles
7. Benefits (3 cards)
8. Features (6 cards)
9. Process (3 steps)
10. Pricing (2 plans, no toggle)
11. FAQ (native `<details>` elements)
12. Footer
13. JS — mobile nav toggle, scrolled-header state, reveal-on-scroll

## Brand tokens

- Background: `#06070c` / `#0a0d14` (near-black with a navy lean)
- Brand accent: `#f2c94c` (the yellow from `mark.png`); bright variant `#ffd966`
- Fonts: `Sora` (sans, body + headings) + `Instrument Serif` (italic accents)

## Conventions

- All CTA links point to `https://app.combatcall.com` (or `/login`, `/terms`, `/privacy`)
- Footer "Contact" is `mailto:support@combatcall.com`
- The footer disclaimer is required (18+, 1-800-GAMBLER) — do not remove it
- LLC address (CMK Enterprises) is in the footer — Cole signs off on any change

## What lives outside this file

- DNS: still on Framer until Cole says flip it. Don't touch GoDaddy.
- App pages (`/terms`, `/privacy`, `/login`): hosted by Base44 at `app.combatcall.com`.
  This landing page only links to them.
- Fighter photos: not used on this page anymore. (The older reconstruction had a
  Supabase-hosted fighter grid; the new design replaces it with a stat-block visual.)

## Deploy

- Repo: `https://github.com/colekelley777-del/combatcall-landing`
- Vercel project: `combatcall-landing` (framework: Other / static)
- Auto-deploy on push to `main`
