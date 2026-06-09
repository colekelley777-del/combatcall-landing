# combatcall-landing

Public-facing marketing site for CombatCall — the data-driven UFC analytics tool.

## What this is

A single self-contained `index.html`, no build step, no framework. Deployed to Vercel
as a static site. All CTAs point to the app at `https://app.combatcall.com`.

## Files

- `index.html` — the entire site (HTML, inline CSS, vanilla JS)
- `logo.png` — wordmark used in header and footer
- `mark.png` — octagon mark used in hero and as favicon
- `pattern.png` — subtle background texture on the Fighter Profiles section
- `landing-hero-video.mp4` — muted/looping hero background video

## Preview locally

```
python3 -m http.server 8000
# then open http://localhost:8000
```

## Editing copy

Almost every visible string lives in `index.html` between clearly labeled
section comments (`<!-- SECTION: HERO -->` etc.). Search for:

- A heading you want to change → it's right there in the HTML.
- FAQ items → `<details class="faq-item">` blocks. Duplicate one to add a new Q+A.
- Pricing → two `.plan` blocks. Edit the price, features, and CTA in place.
- CTAs → all `https://app.combatcall.com` (or `/login`, `/terms`, `/privacy`).

## Deploy

This repo is connected to Vercel. Pushes to `main` auto-deploy.

- Production URL (Vercel): set after `vercel link`
- DNS for `combatcall.com` is still pointed at Framer until Cole flips it manually.

## Dependencies (runtime)

- Google Fonts — Sora (sans) and Instrument Serif (display)
- That's it. No JS frameworks, no CDN libraries.
