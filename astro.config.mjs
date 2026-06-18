// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// CombatCall site — static SSG on Vercel. The hand-written marketing homepage
// and privacy page live untouched in `public/` (served verbatim at the root);
// Astro only *generates* the new programmatic-SEO `/ufc/...` pages. Output is
// pure static HTML so every page is crawlable (no client-only rendering).
export default defineConfig({
  site: 'https://combatcall.com',
  trailingSlash: 'never',
  build: {
    // Emit `/ufc/foo.html` (not `/ufc/foo/index.html`) so URLs match the
    // existing site's `cleanUrls` convention and the canonical tags.
    format: 'file',
  },
  integrations: [
    sitemap({
      // The static homepage + privacy page live in public/ and aren't known to
      // Astro's router, so add them to the sitemap explicitly.
      customPages: [
        'https://combatcall.com/',
        'https://combatcall.com/privacy',
      ],
    }),
  ],
});
