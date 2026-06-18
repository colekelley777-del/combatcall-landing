// schema.org JSON-LD builders for the SEO pages. Only real data goes in — no
// fabricated fields. Returns plain objects the layout serializes into
// <script type="application/ld+json">.

import type { EventView, FightView } from './data';
import { SITE, eventUrlFromSlug, matchupUrlFromSlug } from './site';

export function breadcrumbSchema(
  crumbs: { name: string; url: string }[]
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.url,
    })),
  };
}

export function faqSchema(
  qa: { q: string; a: string }[]
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: qa.map((x) => ({
      '@type': 'Question',
      name: x.q,
      acceptedAnswer: { '@type': 'Answer', text: x.a },
    })),
  };
}

/** SportsEvent for the whole card, with each fight as a subEvent. */
export function eventSchema(event: EventView): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: event.name,
    sport: 'Mixed Martial Arts',
    startDate: event.date,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    ...(event.location
      ? { location: { '@type': 'Place', name: event.venue || event.location, address: event.location } }
      : {}),
    url: eventUrlFromSlug(event.slug),
    organizer: { '@type': 'Organization', name: 'UFC' },
    subEvent: event.fights.map((f) => ({
      '@type': 'SportsEvent',
      name: `${f.red.name} vs. ${f.blue.name}`,
      url: matchupUrlFromSlug(f.matchupSlug),
      ...(f.weightClass ? { description: `${f.weightClass} bout` } : {}),
      competitor: [
        { '@type': 'Person', name: f.red.name },
        { '@type': 'Person', name: f.blue.name },
      ],
    })),
  };
}

/** SportsEvent for a single matchup page. */
export function matchupSchema(
  event: EventView,
  fight: FightView
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: `${fight.red.name} vs. ${fight.blue.name}`,
    sport: 'Mixed Martial Arts',
    startDate: event.date,
    eventStatus: 'https://schema.org/EventScheduled',
    superEvent: { '@type': 'SportsEvent', name: event.name, url: eventUrlFromSlug(event.slug) },
    ...(fight.weightClass ? { description: `${fight.weightClass} bout at ${event.name}` } : {}),
    url: matchupUrlFromSlug(fight.matchupSlug),
    competitor: [
      { '@type': 'Person', name: fight.red.name },
      { '@type': 'Person', name: fight.blue.name },
    ],
  };
}
