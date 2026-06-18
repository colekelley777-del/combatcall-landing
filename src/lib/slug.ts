// URL-slug helpers shared by the data layer and the page routes.
//
// Slugs must be deterministic and stable: the event page, the matchup pages,
// and the internal links between them all derive their URLs from these same
// functions, so a fighter or event named once always maps to one URL.

/** Lowercase, ASCII-fold, strip punctuation, collapse to hyphens. */
export function slugify(input: string): string {
  return (input || '')
    .normalize('NFKD')
    // drop combining marks (accents) so "Bolaños" -> "bolanos".
    // Use the \u escape range (U+0300–U+036F) rather than literal combining
    // characters in source — a literal range is one editor re-encode away from
    // silently breaking and 404ing every accented-name matchup page.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’.]/g, '') // O'Malley -> omalley, "Jr." -> jr
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Event slug from the event name. UFC event names look like
 * "UFC Fight Night: Kape vs. Horiguchi" or "UFC 329: McGregor vs. Holloway 2".
 * The page path is `/ufc/<event-slug>-predictions`, so we strip a leading
 * "ufc-" to avoid `/ufc/ufc-...` and keep the URL readable.
 */
export function eventSlug(eventName: string): string {
  const s = slugify(eventName);
  return s.replace(/^ufc-/, '');
}

/** Matchup slug `<fighterA>-vs-<fighterB>` from two fighter display names. */
export function matchupSlug(fighterA: string, fighterB: string): string {
  return `${slugify(fighterA)}-vs-${slugify(fighterB)}`;
}
