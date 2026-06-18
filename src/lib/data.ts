// Build-time data layer for the programmatic-SEO pages.
//
// Fetches the next upcoming UFC card (and everything needed to render it) from
// Supabase at BUILD time using the anon/publishable key. The data tables have
// public-read RLS, so the anon key is sufficient and safe to embed in a static
// build step (no service-role key in the SEO pipeline).
//
// "Next upcoming event" is determined the SAME way the app does (db.js
// getUpcomingEvents): events with event_date >= yesterday-UTC, ordered ascending
// — the first is the next card. Per-fight cards + the model pick come from the
// same cached_matchup_insights / card_scores / prop_scores the app reads, ranked
// by the shared rank_value (ranking.ts). Real data only.

import { createClient } from '@supabase/supabase-js';
import {
  indexCardScores,
  propScoreCard,
  rankFightCards,
  type CardScoreRow,
  type PropScoreRow,
  type RankedFightCards,
} from './ranking';
import { eventSlug, matchupSlug } from './slug';

// Astro/Vite expose .env vars via import.meta.env at build time; real shell env
// (Vercel project vars, `op run`) lands in process.env. Read both, preferring
// the explicit server vars, then the PUBLIC_ ones (same project, same key).
const env: Record<string, string | undefined> = {
  ...(typeof process !== 'undefined' ? process.env : {}),
  ...import.meta.env,
};
const SUPABASE_URL =
  env.SUPABASE_URL || env.PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY =
  env.SUPABASE_ANON_KEY || env.PUBLIC_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing SUPABASE_URL / SUPABASE_ANON_KEY. The SEO build needs the anon ' +
      'key to fetch the upcoming card at build time (run via `op run`).'
  );
}

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

// Number of opening prelims whose model PICK is shown publicly (Cole-confirmed:
// give away the opening 1-2 prelims' picks; lock the rest behind email signup).
// Highest bout_order = earliest prelim. We give away the top 2 by bout_order.
export const FREE_PICK_FIGHTS = 2;

const fullName = (f: any): string =>
  f ? `${f.first_name ?? ''} ${f.last_name ?? ''}`.trim() : '';

const recordOf = (f: any) => ({
  wins: f?.wins ?? f?.fighter_records?.[0]?.wins ?? 0,
  losses: f?.losses ?? f?.fighter_records?.[0]?.losses ?? 0,
  draws: f?.draws ?? 0,
});

/** Yesterday at UTC midnight as YYYY-MM-DD — the app's "upcoming" cutoff. */
function yesterdayDateString(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
}

export interface FighterView {
  id: string;
  name: string;
  nickname: string | null;
  record: { wins: number; losses: number; draws: number };
  // headline stats (only present when the model has them)
  slpm: number | null;
  sapm: number | null;
  // Stored in Supabase as percent strings (e.g. "56%") — rendered verbatim.
  str_acc: string | number | null;
  str_def: string | number | null;
  td_avg: number | null;
}

// Card structure (single source of truth — bout_order semantics live here, not
// scattered across pages/components).
const MAIN_EVENT_BOUT_ORDER = 1; // lowest bout_order = main event
const MAIN_CARD_SIZE = 5; // bout_order <= this = main card, else prelims

export type FightSection = 'main' | 'prelim';

export interface FightView {
  id: string;
  boutOrder: number | null;
  weightClass: string | null;
  red: FighterView;
  blue: FighterView;
  matchupSlug: string;
  /** Whether this fight's model PICK is shown publicly (opening prelims). */
  pickIsFree: boolean;
  /** True for the card's headline bout (lowest bout_order). */
  isMainEvent: boolean;
  /** 'main' (main card) or 'prelim' — computed once, not re-derived in pages. */
  section: FightSection;
  ranked: RankedFightCards;
}

export interface EventView {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  location: string | null;
  venue: string | null;
  slug: string; // event slug, without "-predictions"
  fights: FightView[];
}

function toFighterView(f: any): FighterView {
  const rec = recordOf(f);
  return {
    id: f?.id,
    name: fullName(f),
    nickname: f?.nickname ?? null,
    record: rec,
    slpm: f?.slpm ?? null,
    sapm: f?.sapm ?? null,
    str_acc: f?.str_acc ?? null,
    str_def: f?.str_def ?? null,
    td_avg: f?.td_avg ?? null,
  };
}

/**
 * Determine the next upcoming event id + metadata (db.js getUpcomingEvents
 * ordering: event_date >= yesterday-UTC, ascending → first row).
 */
async function fetchNextEvent(): Promise<{
  id: string;
  name: string;
  event_date: string;
  location: string | null;
  venue: string | null;
} | null> {
  const { data, error } = await sb
    .from('events')
    .select('id, name, event_date, location, venue')
    .gte('event_date', yesterdayDateString())
    .order('event_date', { ascending: true })
    .limit(1);
  if (error) throw error;
  return data && data.length > 0 ? data[0] : null;
}

/** Sort key for bout_order: null = +Infinity (earliest prelim, sorts last). */
const boutKey = (boutOrder: number | null | undefined): number =>
  boutOrder ?? Number.POSITIVE_INFINITY;

/**
 * Build the full EventView for the next upcoming card. Memoized for the build:
 * both page routes' getStaticPaths call this, and Astro evaluates each route's
 * getStaticPaths independently — caching the promise means the upcoming card is
 * fetched ONCE per build instead of once per route.
 */
let _nextEvent: Promise<EventView | null> | undefined;
export function getNextEvent(): Promise<EventView | null> {
  return (_nextEvent ??= buildNextEvent());
}

async function buildNextEvent(): Promise<EventView | null> {
  const ev = await fetchNextEvent();
  if (!ev) return null;

  // Fights on the card (uncancelled), with fighter stat blocks. Mirrors the
  // shape db.js getUpcomingEvents pulls.
  const { data: fightsRaw, error: fightsErr } = await sb
    .from('fights')
    .select(
      `
      id, weight_class, bout_order, cancelled,
      red_fighter:fighters!fighter_red_id(
        id, first_name, last_name, nickname,
        wins, losses, draws,
        slpm, sapm, str_acc, str_def, td_avg,
        fighter_records(wins, losses)
      ),
      blue_fighter:fighters!fighter_blue_id(
        id, first_name, last_name, nickname,
        wins, losses, draws,
        slpm, sapm, str_acc, str_def, td_avg,
        fighter_records(wins, losses)
      )
    `
    )
    .eq('event_id', ev.id);
  if (fightsErr) throw fightsErr;

  const fights = (fightsRaw || []).filter((f: any) => !f.cancelled);
  if (fights.length === 0) {
    return {
      id: ev.id,
      name: ev.name,
      date: ev.event_date,
      location: ev.location,
      venue: ev.venue,
      slug: eventSlug(ev.name),
      fights: [],
    };
  }

  const fightIds = fights.map((f: any) => f.id);

  // Pull the cached cards, card_scores, and scored props for the whole card in
  // parallel — exactly the tables the app's getEventInsightsCached reads.
  const [cachedRes, scoresRes, propsRes] = await Promise.all([
    sb
      .from('cached_matchup_insights')
      .select('fight_id, cards')
      .eq('event_id', ev.id),
    sb
      .from('card_scores')
      .select('fight_id, pipeline, card_type, headline, score_v3, edge, rank_value')
      .in('fight_id', fightIds),
    sb
      .from('prop_scores')
      .select(
        'fighter_id, stat_type, fight_id, opponent_name, player_name, ' +
          'weight_class, scheduled_rounds, line, p_over, edge, rank_value, fighter_n, receipt'
      )
      .eq('event_id', ev.id),
  ]);
  if (cachedRes.error) throw cachedRes.error;
  if (scoresRes.error) throw scoresRes.error;
  if (propsRes.error) throw propsRes.error;

  const cacheByFight = new Map<string, any[]>();
  for (const row of cachedRes.data || []) {
    cacheByFight.set(row.fight_id, Array.isArray(row.cards) ? row.cards : []);
  }
  const scoreMap = indexCardScores((scoresRes.data || []) as CardScoreRow[]);

  const propCardsByFight = new Map<string, ReturnType<typeof propScoreCard>[]>();
  for (const p of (propsRes.data || []) as PropScoreRow[]) {
    if (!p.fight_id) continue;
    if (!propCardsByFight.has(p.fight_id)) propCardsByFight.set(p.fight_id, []);
    propCardsByFight.get(p.fight_id)!.push(propScoreCard(p));
  }

  // Sort once: main event first (lowest bout_order), prelims last. The free
  // picks (opening prelims) are then simply the LAST FREE_PICK_FIGHTS entries —
  // no second descending sort needed.
  const sortedFights = [...fights].sort(
    (a: any, b: any) => boutKey(a.bout_order) - boutKey(b.bout_order)
  );
  const freePickIds = new Set(
    sortedFights.slice(-FREE_PICK_FIGHTS).map((f: any) => f.id)
  );

  const fightViews: FightView[] = sortedFights.map((f: any): FightView => {
    const red = toFighterView(f.red_fighter);
    const blue = toFighterView(f.blue_fighter);
    const ranked = rankFightCards(
      cacheByFight.get(f.id) || [],
      f.id,
      scoreMap,
      propCardsByFight.get(f.id) || []
    );
    const boutOrder = f.bout_order ?? null;
    return {
      id: f.id,
      boutOrder,
      weightClass: f.weight_class ?? null,
      red,
      blue,
      matchupSlug: matchupSlug(red.name, blue.name),
      pickIsFree: freePickIds.has(f.id),
      isMainEvent: boutOrder === MAIN_EVENT_BOUT_ORDER,
      section: boutKey(boutOrder) <= MAIN_CARD_SIZE ? 'main' : 'prelim',
      ranked,
    };
  });

  return {
    id: ev.id,
    name: ev.name,
    date: ev.event_date,
    location: ev.location,
    venue: ev.venue,
    slug: eventSlug(ev.name),
    fights: fightViews,
  };
}
