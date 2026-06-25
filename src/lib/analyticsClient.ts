// Client-side tracking wrappers for the SEO pages — PostHog (product analytics)
// and the Meta Pixel (ad-conversion tracking). Both mirror the app's lazy-init,
// no-op-without-a-key contract. The phc_ key and the Meta pixel ID are both
// public-by-design (they ship in the bundle, same as the Supabase anon key).
//
// $pageview / PageView are captured automatically on init, so route loads are
// instrumented without per-page wiring. Use track() / trackMetaEvent() for
// funnel events (email_captured / Lead, etc.).
//
// track() and trackMetaEvent() fire on the GLOBAL window.posthog / window.fbq
// that init() registers — NOT a module-local import. Astro compiles every
// component <script> into its own module instance with its own scope, so a
// component calling track() runs a different copy than the one SeoLayout
// initialized. Reading the shared window global is what makes a single helper
// work from any component.

import posthog from 'posthog-js';

let initialized = false;
let metaInitialized = false;

export function initAnalytics(): void {
  if (initialized) return;
  if (typeof window === 'undefined') return;
  const key = import.meta.env.PUBLIC_POSTHOG_KEY as string | undefined;
  if (!key) return; // no key configured → stay quiet (local/preview)
  const host =
    (import.meta.env.PUBLIC_POSTHOG_HOST as string) || 'https://us.i.posthog.com';
  // Mark initialized BEFORE init() and guard the call: if init() throws, we must
  // not leave initialized=false (every later call would retry init forever).
  // Analytics must never block the page.
  initialized = true;
  try {
    posthog.init(key, {
      api_host: host,
      capture_pageview: true,
      person_profiles: 'identified_only',
    });
  } catch {
    /* analytics must never throw into caller logic */
  }
}

// Fire a funnel event. Guarded so it's a silent no-op when PostHog isn't loaded
// (no key in local/preview, or init() hasn't run yet). Safe to call from any
// component script.
export function track(event: string, properties?: Record<string, unknown>): void {
  try {
    window.posthog?.capture(event, properties);
  } catch {
    /* analytics must never throw into caller logic */
  }
}

// Meta (Facebook) Pixel — ad-conversion tracking. Loads fbevents.js + fires a
// standard PageView on init. No-op when PUBLIC_META_PIXEL_ID isn't set.
//
// TODO(CAPI for July 11): pair this browser pixel with a server-side Conversions
// API Lead event (event-id dedup) for iOS / ad-blocker resilience at higher spend.
export function initMetaPixel(): void {
  if (metaInitialized) return;
  if (typeof window === 'undefined') return;
  const pixelId = import.meta.env.PUBLIC_META_PIXEL_ID as string | undefined;
  if (!pixelId) return; // no pixel ID configured → stay quiet (local/preview)
  // Mark initialized BEFORE loading so a throw doesn't cause infinite retries.
  metaInitialized = true;
  try {
    // Standard Meta Pixel base code (Meta's installer, minus the trailing
    // init/PageView calls — we drive those from JS so the ID stays env-sourced).
    /* prettier-ignore */
    (function (f: any, b: Document, e: string, v: string) {
      let n: any, t: any, s: any;
      if (f.fbq) return;
      n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', pixelId);
    window.fbq('track', 'PageView');
  } catch {
    /* analytics must never throw into caller logic */
  }
}

// Fire a Meta standard event (e.g. 'Lead'). Silent no-op when the pixel isn't
// loaded. Safe to call from any component script (reads the window.fbq global).
export function trackMetaEvent(
  event: string,
  properties?: Record<string, unknown>
): void {
  try {
    window.fbq?.('track', event, properties);
  } catch {
    /* analytics must never throw into caller logic */
  }
}

// Forward the current page's query string (the campaign UTMs the ad arrived
// with) onto every app.combatcall.com CTA link, so attribution survives the
// landing → app cross-domain hop. Idempotent + safe to call once on load.
// Skips links that already carry a query string.
export function forwardUtmsToAppLinks(): void {
  try {
    if (typeof window === 'undefined') return;
    const search = window.location.search;
    if (!search || search.length <= 1) return; // nothing to forward
    const incoming = new URLSearchParams(search);
    const links = document.querySelectorAll<HTMLAnchorElement>(
      'a[href*="app.combatcall.com"]'
    );
    for (const a of links) {
      const url = new URL(a.href);
      // First-touch wins: don't clobber params the link already sets.
      for (const [k, val] of incoming) {
        if (!url.searchParams.has(k)) url.searchParams.set(k, val);
      }
      a.href = url.toString();
    }
  } catch {
    /* never break navigation over attribution */
  }
}
