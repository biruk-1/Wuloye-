/**
 * learning.js — Phase 13 feedback-loop helpers.
 *
 * Recency decay, behavior-shift detection, and balancing of the three
 * learning signals (long-term embedding boost, recent boost, session boost).
 */

// ─── Recency decay (interaction age) ─────────────────────────────────────────

/**
 * Time-decay weight for a single interaction timestamp.
 *   last 24h   → 1.0
 *   24h–7d     → 0.7
 *   7d+        → 0.4
 *
 * @param {string|Date} createdAt — interaction.createdAt
 * @param {Date}        [now]    — injectable for tests
 * @returns {number} 0.4 | 0.7 | 1.0
 */
export const interactionAgeDecayWeight = (createdAt, now = new Date()) => {
  if (!createdAt) return 0.7;
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return 0.7;
  const ageMs = Math.max(0, now.getTime() - t);
  const hours = ageMs / (1000 * 60 * 60);
  const days  = ageMs / (1000 * 60 * 60 * 24);
  if (hours < 24) return 1.0;
  if (days < 7) return 0.7;
  return 0.4;
};

// ─── Behavior shift detection ────────────────────────────────────────────────

/** Minimum interactions needed to compare recent vs historical. */
const SHIFT_MIN_TOTAL = 15;

/** Last N interactions treated as "recent" for shift detection. */
const SHIFT_RECENT_WINDOW = 10;

/**
 * Mean of interaction numeric scores (view=1, click=2, save=3, dismiss=-1).
 */
const meanActionScore = (interactions) => {
  if (!interactions.length) return 0;
  let s = 0;
  for (const i of interactions) s += i.score ?? 0;
  return s / interactions.length;
};

/**
 * Detects whether recent behaviour diverges strongly from older history.
 * Compares mean action score of the last 10 interactions vs the rest.
 *
 * @param {object[]} interactions — full list, any order (will be sorted newest-first)
 * @returns {{ behaviorShiftDetected: boolean, recentAvg: number, historicalAvg: number }}
 */
export const detectBehaviorShift = (interactions) => {
  if (!interactions || interactions.length < SHIFT_MIN_TOTAL) {
    return { behaviorShiftDetected: false, recentAvg: 0, historicalAvg: 0 };
  }

  const sorted = interactions
    .slice()
    .sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });

  const recent = sorted.slice(0, SHIFT_RECENT_WINDOW);
  const older  = sorted.slice(SHIFT_RECENT_WINDOW);

  const recentAvg    = meanActionScore(recent);
  const historicalAvg = meanActionScore(older);

  const diff = Math.abs(recentAvg - historicalAvg);
  /** Threshold tuned so occasional noise does not flip shift on every request. */
  const SHIFT_THRESHOLD = 0.75;
  const behaviorShiftDetected = diff >= SHIFT_THRESHOLD;

  return { behaviorShiftDetected, recentAvg, historicalAvg };
};

// ─── Signal balancing (40% cap among three signals) ──────────────────────────

/**
 * Ensures no single positive contribution among long-term, recent, and session
 * exceeds `maxShare` (default 40%) of their combined positive mass.
 *
 * Negative portions (e.g. session mismatch penalty) are preserved and not
 * scaled by the 40% rule — only the positive parts are rebalanced.
 *
 * @param {number} longTerm — longTermAffinityBoost
 * @param {number} recent   — recentBoost
 * @param {number} session  — sessionBoost
 * @param {number} [maxShare=0.4]
 * @returns {{ longTerm: number, recent: number, session: number }}
 */
export const balanceLearningSignals = (longTerm, recent, session, maxShare = 0.4) => {
  const negLt = Math.min(0, longTerm);
  const negRb = Math.min(0, recent);
  const negSb = Math.min(0, session);

  let lt = Math.max(0, longTerm);
  let rb = Math.max(0, recent);
  let sb = Math.max(0, session);

  const sum = lt + rb + sb;
  if (sum <= 0) {
    return {
      longTerm: negLt + lt,
      recent:   negRb + rb,
      session:  negSb + sb,
    };
  }

  for (let iter = 0; iter < 8; iter++) {
    const s = lt + rb + sb;
    if (s <= 0) break;
    const cap = maxShare * s;
    let changed = false;
    if (lt > cap) { lt = cap; changed = true; }
    if (rb > cap) { rb = cap; changed = true; }
    if (sb > cap) { sb = cap; changed = true; }
    if (!changed) break;
  }

  return {
    longTerm: negLt + lt,
    recent:   negRb + rb,
    session:  negSb + sb,
  };
};
