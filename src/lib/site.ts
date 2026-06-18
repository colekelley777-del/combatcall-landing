// Site-wide constants + URL builders — one home for the domain and the
// `/ufc/...` URL convention so they can't drift across pages/schema.

import { eventSlug, matchupSlug } from './slug';

export const SITE = 'https://combatcall.com';

export const OG_IMAGE = `${SITE}/og-image.png`;

/** Absolute URL for an event predictions page, from the event NAME. */
export function eventUrl(eventName: string): string {
  return `${SITE}/ufc/${eventSlug(eventName)}-predictions`;
}

/** Absolute URL for an event predictions page, from an already-built slug. */
export function eventUrlFromSlug(slug: string): string {
  return `${SITE}/ufc/${slug}-predictions`;
}

/** Absolute URL for a matchup prediction page, from two fighter names. */
export function matchupUrl(fighterA: string, fighterB: string): string {
  return `${SITE}/ufc/${matchupSlug(fighterA, fighterB)}-prediction`;
}

/** Absolute URL for a matchup prediction page, from an already-built slug. */
export function matchupUrlFromSlug(slug: string): string {
  return `${SITE}/ufc/${slug}-prediction`;
}
