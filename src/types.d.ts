// Ambient types for the SEO build. (src/env.d.ts is gitignored — Astro
// regenerates it — so project-owned globals live here instead.)

// posthog-js attaches the initialized instance to window.posthog on init().
// analyticsClient.track() fires events through this global so the call works
// from any component <script>, which Astro compiles as a separate module
// instance from the one that ran posthog.init().
// The Meta Pixel base code attaches a global fbq() command queue to window.
// analyticsClient.trackMetaEvent() fires events through it, same window-global
// pattern as posthog above.
declare global {
  interface Window {
    posthog?: {
      capture: (event: string, properties?: Record<string, unknown>) => void;
    };
    fbq?: (
      command: string,
      eventOrId: string,
      properties?: Record<string, unknown>
    ) => void;
    _fbq?: unknown;
  }
}

export {};
