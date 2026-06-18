// Client-side PostHog wrapper for the SEO pages — mirrors the app's
// src/lib/analytics.js contract (lazy init, no-op without a key). The phc_ key
// is public-by-design (ships in the bundle, same as the Supabase anon key).
//
// $pageview is captured automatically (capture_pageview: true), so route loads
// are instrumented without per-page wiring. Use track() for funnel events
// (email_captured, pick_unlock_click, etc.).
//
// track() fires on the GLOBAL `window.posthog` that init() registers — NOT the
// module-local `posthog` import. Astro compiles every component <script> into
// its own module instance with its own scope, so a component calling track()
// runs a different copy than the one SeoLayout initialized. Reading the shared
// window global is what makes a single helper work from any component.

import posthog from 'posthog-js';

let initialized = false;

export function initAnalytics(): void {
  if (initialized) return;
  if (typeof window === 'undefined') return;
  const key = import.meta.env.PUBLIC_POSTHOG_KEY as string | undefined;
  if (!key) return; // no key configured → stay quiet (local/preview)
  const host =
    (import.meta.env.PUBLIC_POSTHOG_HOST as string) || 'https://us.i.posthog.com';
  posthog.init(key, {
    api_host: host,
    capture_pageview: true,
    person_profiles: 'identified_only',
  });
  initialized = true;
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
