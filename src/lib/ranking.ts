// Card ranking — a faithful, read-only mirror of the pipeline's
// `compute_event_rows` (combatcall-pipeline scripts/edge/compute_card_edge.py)
// and the app's getEventInsightsCached (combatcall-app src/lib/db.js).
//
// We DO NOT recompute any model math. `card_scores.rank_value` / `.edge` and the
// scored `prop_scores` rows are already computed by the pipeline and stored in
// Supabase — the app reads them, and so do we. This module only reproduces the
// thin top layer the app/pipeline share:
//   1. attach card_scores (rank_value, edge, score_v3) onto each cache card by
//      the (fight_id, pipeline, card_type, headline) tuple,
//   2. drop the v1 strike/TD/fight-time prop cards superseded by prop_scores,
//   3. fold in the scored Underdog prop cards,
//   4. dedupe by bet identity (best rank_value wins),
//   5. rank by rank_value DESC (NULLS LAST), then edge DESC, then v1 score DESC.
//
// The card at rank 0 for a fight is that fight's model "pick" — the exact same
// top card the app's Best Bets surfaces, so the SEO pages never diverge from the
// product.

export interface RawCard {
  out_pipeline?: string | null;
  out_card_type?: string | null;
  out_headline?: string | null;
  out_score?: number | string | null;
  out_sample_size?: number | null;
  out_detail?: Record<string, any> | null;
  // attached below:
  edge?: number | null;
  rank_value?: number | null;
  score_v3?: number | null;
  is_prop_score?: boolean;
  receipt?: Record<string, any>;
  over?: boolean;
}

export interface CardScoreRow {
  fight_id: string;
  pipeline: string | null;
  card_type: string | null;
  headline: string | null;
  score_v3: number | null;
  edge: number | null;
  rank_value: number | null;
}

export interface PropScoreRow {
  fighter_id: string | null;
  stat_type: string | null;
  fight_id: string | null;
  opponent_name: string | null;
  player_name: string | null;
  weight_class: string | null;
  scheduled_rounds: number | null;
  line: number | null;
  p_over: number | null;
  edge: number | null;
  rank_value: number | null;
  fighter_n: number | null;
  receipt: Record<string, any> | null;
}

// Cards the app drops from cache because prop_scores serves them canonically.
const SUPERSEDED_BY_PROP_SCORES = new Set([
  'hit_rate_sig_strikes',
  'hit_rate_takedowns',
  'hit_rate_fight_time',
]);

const EDGE_FLAT_PRIOR = 0.5;

function num(x: unknown): number | null {
  const n = typeof x === 'number' ? x : parseFloat(x as string);
  return Number.isFinite(n) ? n : null;
}

/** Join key matching db.js cardScoreKey / pipeline _card_score_key. */
function cardScoreKey(
  fightId: string,
  pipeline: unknown,
  cardType: unknown,
  headline: unknown
): string {
  return `${fightId}|${String(pipeline ?? '').toUpperCase()}|${cardType ?? ''}|${headline ?? ''}`;
}

/** Build a fight_id-keyed map of cardScoreKey -> score row. */
export function indexCardScores(rows: CardScoreRow[]): Map<string, CardScoreRow> {
  const m = new Map<string, CardScoreRow>();
  for (const r of rows) {
    m.set(cardScoreKey(r.fight_id, r.pipeline, r.card_type, r.headline), r);
  }
  return m;
}

/** Turn a prop_scores row into a synthetic cache-shaped card (db.js propScoreCard). */
export function propScoreCard(p: PropScoreRow): RawCard {
  const e = num(p.edge);
  const po = num(p.p_over);
  const edge = e ?? (po != null ? po - EDGE_FLAT_PRIOR : null);
  const rankValue = num(p.rank_value) ?? edge;
  return {
    out_pipeline: 'A',
    out_card_type: 'prop_score',
    out_headline: `${p.player_name} — ${p.stat_type} o/u ${p.line}`,
    out_detail: {
      fighter_id: p.fighter_id,
      fighter_name: p.player_name,
      opponent_name: p.opponent_name,
      stat_type: p.stat_type,
      line: p.line,
      scheduled_rounds: p.scheduled_rounds,
      weight_class: p.weight_class,
      p_over: po,
    },
    out_score: edge != null ? Math.abs(edge) * 100 : 0,
    out_sample_size: p.fighter_n ?? null,
    edge,
    rank_value: rankValue,
    over: (po ?? 0) >= EDGE_FLAT_PRIOR,
    is_prop_score: true,
    receipt: p.receipt || {},
  };
}

/**
 * Enrich one fight's raw cache cards: attach card_scores (rank_value/edge/v3),
 * drop superseded prop cards, then append the scored Underdog prop cards.
 * Mirrors db.js attachEdge + the prop fold-in.
 */
function enrichFightCards(
  rawCards: RawCard[],
  fightId: string,
  scoreMap: Map<string, CardScoreRow>,
  propCards: RawCard[]
): RawCard[] {
  const enriched: RawCard[] = [];
  for (const card of rawCards || []) {
    if (SUPERSEDED_BY_PROP_SCORES.has(card.out_card_type || '')) continue;
    const hit = scoreMap.get(
      cardScoreKey(fightId, card.out_pipeline, card.out_card_type, card.out_headline)
    );
    enriched.push({
      ...card,
      score_v3: hit?.score_v3 ?? null,
      edge: num(hit?.edge),
      rank_value: num(hit?.rank_value),
    });
  }
  return [...enriched, ...propCards];
}

// ── bet-identity dedup (a faithful subset of bulletFormatters.betIdentityKey) ──
// The app dedupes the per-fight pool by a bet-identity key, keeping the card with
// the best rank_value. For the SEO surface we replicate the same collapse so the
// "pick" and the listed cards match the app. We key on the same primary signals
// the app uses; any card type not specially handled falls back to its headline,
// which is the app's behaviour too.

function normText(s: unknown): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function betIdentityKey(card: RawCard, fightId: string): string {
  const detail = card.out_detail || {};
  const cardType = String(card.out_card_type || '');
  const k = (...parts: string[]) => [fightId, ...parts].join('|');

  if (cardType === 'prop_score' || card.is_prop_score) {
    const who = normText(detail.fighter_name) || String(detail.fighter_id ?? '');
    const isOver = card.over ?? (num(detail.p_over) ?? 0) >= 0.5;
    const over = isOver ? 'over' : 'under';
    return k('prop', who, normText(detail.stat_type), String(detail.line ?? ''), over);
  }
  if (cardType === 'hit_rate_moneyline' || cardType.startsWith('merged_ml:')) {
    const who = cardType.startsWith('merged_ml:')
      ? mergedFavoredName(detail)
      : normText(detail.fighter_name);
    if (who) return k('moneyline', who);
  }
  const isGoDistance =
    cardType === 'hit_rate_go_distance' ||
    detail.target_market === 'go_distance' ||
    cardType.startsWith('merged_bet:Fight');
  if (isGoDistance) {
    let isNo: boolean;
    if (typeof detail.is_over === 'boolean') isNo = detail.is_over === false;
    else {
      const label = normText(detail.bet_label || card.out_headline || cardType);
      isNo = /not\s+go|does\s+not|inside/.test(label);
    }
    return k('go_distance', isNo ? 'no' : 'yes');
  }
  if (cardType === 'hit_rate_total_rounds') {
    const over = detail.is_over === false ? 'under' : 'over';
    return k('total_rounds', over, String(detail.line ?? ''));
  }
  const methodToken: Record<string, string> = {
    hit_rate_win_by_decision: 'decision',
    hit_rate_knockouts: 'ko',
    hit_rate_submissions: 'sub',
    hit_rate_finishes: 'finish',
    hit_rate_ko_or_dec: 'ko_or_dec',
    hit_rate_sub_or_dec: 'sub_or_dec',
  };
  const mt = methodToken[cardType];
  if (mt) {
    const who = normText(detail.fighter_name);
    if (who) return k('method', mt, who);
  }
  const rf = /^hit_rate_round_(\d+)_(finish|knockout|submission)$/.exec(cardType);
  if (rf) {
    const method = rf[2] === 'knockout' ? 'ko' : rf[2] === 'submission' ? 'sub' : 'finish';
    const who = normText(detail.fighter_name);
    if (who) return k('round_finish', rf[1], method, who);
  }
  return k('headline', normText(card.out_headline));
}

function mergedFavoredName(detail: Record<string, any>): string {
  const side = detail.favored_fighter_side || detail.favored_side;
  if (side === 'fighter1') return normText(detail.fighter1_name);
  if (side === 'fighter2') return normText(detail.fighter2_name);
  return '';
}

/** Pick the better of two same-identity cards: higher rank_value, then edge. */
function preferCandidate(cand: RawCard, cur: RawCard): boolean {
  const cv = num(cand.rank_value);
  const uv = num(cur.rank_value);
  if (cv !== uv) {
    if (cv == null) return false;
    if (uv == null) return true;
    return cv > uv;
  }
  const ce = num(cand.edge);
  const ue = num(cur.edge);
  if (ce !== ue) {
    if (ce == null) return false;
    if (ue == null) return true;
    return ce > ue;
  }
  return false;
}

/** rank_value DESC, NULLS LAST; tiebreak edge DESC then v1 score DESC. */
function compareRank(a: RawCard, b: RawCard): number {
  const arv = num(a.rank_value);
  const brv = num(b.rank_value);
  const aNull = arv == null ? 1 : 0;
  const bNull = brv == null ? 1 : 0;
  if (aNull !== bNull) return aNull - bNull;
  if (arv != null && brv != null && arv !== brv) return brv - arv;
  const ae = num(a.edge) ?? 0;
  const be = num(b.edge) ?? 0;
  if (ae !== be) return be - ae;
  const av = num(a.out_score) ?? 0;
  const bv = num(b.out_score) ?? 0;
  return bv - av;
}

export interface RankedFightCards {
  /** All ranked, deduped cards for the fight (rank_value DESC). */
  cards: RawCard[];
  /** The fight's model pick = the rank-0 card (or null if no cards). */
  pick: RawCard | null;
}

/**
 * Produce the ranked, deduped card list (and the top "pick") for one fight,
 * matching what the app's Best Bets / MatchupDetail surface for that fight.
 */
export function rankFightCards(
  rawCards: RawCard[],
  fightId: string,
  scoreMap: Map<string, CardScoreRow>,
  propCards: RawCard[]
): RankedFightCards {
  const enriched = enrichFightCards(rawCards, fightId, scoreMap, propCards);

  // dedupe by bet identity, keeping the best card per identity (stable order).
  const bestByKey = new Map<string, RawCard>();
  const order: string[] = [];
  for (const card of enriched) {
    const key = betIdentityKey(card, fightId);
    const cur = bestByKey.get(key);
    if (cur == null) {
      bestByKey.set(key, card);
      order.push(key);
    } else if (preferCandidate(card, cur)) {
      bestByKey.set(key, card);
    }
  }
  const deduped = order.map((k) => bestByKey.get(k)!);
  const cards = [...deduped].sort(compareRank);
  return { cards, pick: cards.length > 0 ? cards[0] : null };
}
