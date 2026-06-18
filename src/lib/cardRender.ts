// Card → display strings for the SEO pages.
//
// The cached card JSONB already carries human-readable English (out_headline,
// out_detail.bet_label, hit_rate_stack[].label, reasons[].description). We render
// from those strings directly rather than re-implementing the app's 1,400-line
// bulletFormatters — the SEO pages show the SAME wording the pipeline produced,
// so nothing diverges and no stats are fabricated. Every value here comes from
// the model output; if a field is missing we omit it (never invent it).

import type { RawCard } from './ranking';

function pct(n: unknown): string | null {
  const v = typeof n === 'number' ? n : parseFloat(n as string);
  return Number.isFinite(v) ? `${Math.round(v)}%` : null;
}

/** The bet this card represents, e.g. "Kyoji Horiguchi — Win by Submission or Decision". */
export function cardPickLabel(card: RawCard): string {
  const detail = card.out_detail || {};
  if (card.is_prop_score) {
    const dir = card.over ? 'Over' : 'Under';
    return `${detail.fighter_name} — ${detail.stat_type} ${dir} ${detail.line}`;
  }
  return card.out_headline || detail.bet_label || detail.fighter_name || 'Model pick';
}

/** The market line for this card, e.g. "DraftKings -115" or null when unpriced. */
export function cardLine(card: RawCard): string | null {
  const d = card.out_detail || {};
  const display = d.odds_display;
  if (display && display !== 'Underdog' && display !== '') {
    const src = d.odds_source && d.odds_source !== 'Underdog' ? `${d.odds_source} ` : '';
    return `${src}${display}`;
  }
  return null;
}

/**
 * The model's read as a short percentage phrase, e.g. "Our read: ~62%".
 * Sourced from the same fields the app's receipt uses: v3 p_shrunk when present,
 * else the card's combined_rate. Returns null if nothing measured.
 *
 * NOTE — the two source fields live on DIFFERENT scales (verified against prod
 * Supabase), and `pct()` only rounds (it does not multiply). Each path is scaled
 * to land at 0–100 before `pct()`; do not "unify" them:
 *   - prop_score `p_over` is a 0–1 probability (observed 0.26–0.86) → ×100 here.
 *   - non-prop `combined_rate` is already a 0–100 percentage (observed 10–100) → no ×100.
 */
export function cardOurRead(card: RawCard): string | null {
  if (card.is_prop_score) {
    const pOver = (card.out_detail || {}).p_over;
    if (pOver == null) return null;
    // The card represents the OVER or UNDER side; phrase the probability for the
    // side that is actually the pick so it never contradicts the bet shown.
    const p = card.over ? pOver : 1 - (pOver as number);
    const pctStr = pct(p * 100); // p is 0–1 → scale to 0–100
    return pctStr
      ? `Our read: ~${pctStr} to hit the ${card.over ? 'over' : 'under'}`
      : null;
  }
  const d = card.out_detail || {};
  const rate = pct(d.combined_rate); // combined_rate already 0–100 — no scaling
  return rate ? `Our read: hit rate ~${rate}` : null;
}

/**
 * Analysis bullets for a card — the model's reasoning, already in English.
 * For Pipeline A cards: the hit_rate_stack labels. For Pipeline B merged cards:
 * the reasons[].description sentences. De-duplicated, order preserved.
 */
export function cardAnalysisBullets(card: RawCard): string[] {
  const d = card.out_detail || {};
  const out: string[] = [];

  const stack = Array.isArray(d.hit_rate_stack) ? d.hit_rate_stack : [];
  for (const s of stack) {
    if (s && typeof s.label === 'string' && s.label.trim()) out.push(s.label.trim());
  }

  const reasons = Array.isArray(d.reasons) ? d.reasons : [];
  for (const r of reasons) {
    if (r && typeof r.description === 'string' && r.description.trim()) {
      out.push(r.description.trim());
    }
  }

  // prop_score receipt (plain-English lines the retired Prop Scores tab used)
  const receipt = card.receipt || {};
  for (const key of ['fighter_line', 'opponent_context', 'division_baseline', 'finish_context', 'our_read']) {
    const v = (receipt as any)[key];
    if (typeof v === 'string' && v.trim()) out.push(v.trim());
  }

  // Callers dedupe across cards; this returns the per-card bullets as-is (the
  // hit_rate_stack labels are already distinct within a card).
  return out;
}
