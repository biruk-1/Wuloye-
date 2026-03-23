/**
 * recommendation.service.js — Personalized recommendation engine (v5).
 *
 * v5 change: adaptive intelligence layer on top of v4.
 *   - Score normalization   raw → 0-100 bounded score (rawScore preserved)
 *   - Recency weighting     recent interactions count more (weight = 1 / (1 + ageInDays))
 *   - Freshness boost       never-seen places get +3 to encourage discovery
 *   - Exploration boost     low-interaction places get a small random nudge (0–2)
 *   - Diversity injection   interleaved top-N: no two consecutive results share a type
 *
 * All v4 scoring rules are untouched. The five new mechanics are purely additive
 * or post-processing; no existing field is removed or renamed.
 *
 * Scoring rules (cumulative per place):
 *   — Original rules (v4, unchanged) ————————————————————————————————————————
 *   +3  routine activityType matches place.type (per routine)
 *   +2  budget match (profile or any routine; "free" places always match)
 *   +2  location match (profile or any routine; "any" always matches)
 *   +Σ  sum of recency-weighted interaction scores for this exact placeId  ← v5: recency
 *   +5  user has "save" on any place of the same type
 *   -3  user has "dismiss" on any place of the same type
 *   +4  type affinity is positive (Σ type scores > 0)
 *   -4  type affinity is negative (Σ type scores < 0)
 *   +2  place type matches a routine whose timeOfDay fits current hour (legacy)
 *   — Context-aware rules (v4, unchanged) ————————————————————————————————————
 *   +3  place type matches the current time-of-day behaviour pattern
 *   +2  weekend boost: social / outdoor types
 *   +1  weekday boost: gym / coffee types
 *   — Adaptive rules (v5, NEW) ————————————————————————————————————————————
 *   +3  freshness boost: user has never interacted with this place
 *   0–2 exploration boost: low-interaction place gets small random nudge
 *
 * Post-scoring pipeline:
 *   1. Dismiss filter        — remove hard-dismissed places
 *   2. Normalize             — clamp rawScore to 0–100 (preserved as rawScore)
 *   3. Sort by score desc
 *   4. Diversity injection   — interleave so no two consecutive results share type
 *   5. Pin saved             — saved places anchored into top-5
 *
 * Data sources:
 *   Collection "places"        — via place.service.getAllPlaces() (cached)
 *   Collection "users"         — profile (budgetRange, locationPreference)
 *   Collection "routines"      — activityType, timeOfDay, locationPreference, budgetRange
 *   Collection "interactions"  — placeId, actionType, score, createdAt
 */

import { db }          from "../config/firebase.js";
import { getUserById }  from "./user.service.js";
import { getAllPlaces }  from "./place.service.js";
import { buildContext } from "../utils/context.js";
import { SEED_PLACES }  from "../data/places.seed.js";

const ROUTINES_COLLECTION     = "routines";
const INTERACTIONS_COLLECTION = "interactions";

// ─── Scoring weights ──────────────────────────────────────────────────────────

const WEIGHTS = Object.freeze({
  // v4 rules
  routineMatchPerRoutine: 3,
  budgetMatch:            2,
  locationMatch:          2,
  typeSaveSignal:         5,
  typeDismissSignal:      -3,
  affinityPositive:       4,
  affinityNegative:       -4,
  routineTimeOfDayMatch:  2,
  contextTimeOfDay:       3,
  weekendBoost:           2,
  weekdayBoost:           1,
  // v5 rules
  freshnessBoost:         3,
  explorationMax:         2,   // Math.random() * this is added for low-interaction places
});

/** A place is considered "low interaction" if it has fewer than this many events. */
const LOW_INTERACTION_THRESHOLD = 2;

// ─── Context-aware type maps ──────────────────────────────────────────────────

const TIME_OF_DAY_TYPE_MAP = Object.freeze({
  morning:   new Set(["coffee", "gym", "yoga"]),
  afternoon: new Set(["coffee", "restaurant"]),
  evening:   new Set(["social", "restaurant"]),
  night:     new Set(["social"]),
});

const WEEKEND_BOOST_TYPES = new Set(["social", "outdoor"]);
const WEEKDAY_BOOST_TYPES = new Set(["gym", "coffee"]);

// ─── Field-mapping adapter ────────────────────────────────────────────────────

const resolveLocationType = (place) => (place.isIndoor ? "indoor" : "outdoor");

// ─── Data Fetchers ────────────────────────────────────────────────────────────

const fetchRoutines = async (userId) => {
  const snap = await db.collection(ROUTINES_COLLECTION).where("userId", "==", userId).get();
  return snap.docs.map((d) => d.data());
};

const fetchInteractions = async (userId) => {
  const snap = await db
    .collection(INTERACTIONS_COLLECTION)
    .where("userId", "==", userId)
    .limit(200)
    .get();
  return snap.docs.map((d) => d.data());
};

// ─── Lookup Map ───────────────────────────────────────────────────────────────

/**
 * Builds a map keyed by every known placeId (Firestore doc id + seed id aliases).
 * This ensures interactions stored with "place_1" style ids resolve to catalogue rows.
 */
const buildPlaceLookupMap = (places) => {
  const map = new Map();
  for (const p of places) {
    map.set(String(p.id), p);
  }
  for (const seed of SEED_PLACES) {
    if (!seed.id) continue;
    const match = places.find((pl) => pl.name === seed.name && pl.type === seed.type);
    if (match) map.set(seed.id, match);
  }
  return map;
};

const resolvePlace = (placeLookup, placeId) => {
  if (placeId == null || placeId === "") return undefined;
  return placeLookup.get(String(placeId));
};

// ─── Pre-computation Helpers ──────────────────────────────────────────────────

const buildTypeAffinityMap = (interactions, placeLookup) => {
  const affinityMap = new Map();
  for (const interaction of interactions) {
    const place = resolvePlace(placeLookup, interaction.placeId);
    if (!place) continue;
    affinityMap.set(place.type, (affinityMap.get(place.type) ?? 0) + (interaction.score ?? 0));
  }
  return affinityMap;
};

/**
 * Strong signals: resolve interaction place ids so save/dismiss sets hold live catalogue ids.
 */
const buildStrongSignalSets = (interactions, placeLookup) => {
  const savedIds     = new Set();
  const dismissedIds = new Set();
  for (const interaction of interactions) {
    const place = resolvePlace(placeLookup, interaction.placeId);
    if (!place) continue;
    if (interaction.actionType === "save")    savedIds.add(place.id);
    if (interaction.actionType === "dismiss") dismissedIds.add(place.id);
  }
  return { savedIds, dismissedIds };
};

const deriveTopInterestType = (affinityMap) => {
  let topType  = null;
  let topScore = 0;
  for (const [type, score] of affinityMap.entries()) {
    if (score > topScore) { topScore = score; topType = type; }
  }
  return topType;
};

/**
 * Computes per-place interaction statistics for the recency and freshness rules.
 *
 * Returns a Map<cataloguePlaceId, { count: number, recencyWeightedScore: number }>
 * where recencyWeightedScore = Σ (interaction.score * 1/(1 + ageInDays)).
 *
 * @param {object[]} interactions
 * @param {Map}      placeLookup
 * @param {Date}     now — injectable for testing
 */
const buildInteractionIndex = (interactions, placeLookup, now = new Date()) => {
  const index = new Map(); // placeId → { count, recencyWeightedScore }

  for (const interaction of interactions) {
    const place = resolvePlace(placeLookup, interaction.placeId);
    if (!place) continue;

    const entry = index.get(place.id) ?? { count: 0, recencyWeightedScore: 0 };

    const createdAt  = interaction.createdAt ? new Date(interaction.createdAt) : now;
    const ageInDays  = Math.max(0, (now - createdAt) / (1000 * 60 * 60 * 24));
    const weight     = 1 / (1 + ageInDays);

    entry.count               += 1;
    entry.recencyWeightedScore += (interaction.score ?? 0) * weight;

    index.set(place.id, entry);
  }

  return index;
};

// ─── Score Normalization ──────────────────────────────────────────────────────

/**
 * Clamps a raw score to [0, 100].
 * Negative totals become 0; absurdly high totals are capped at 100.
 */
const normalizeScore = (raw) => Math.min(100, Math.max(0, raw));

// ─── Diversity Injection ──────────────────────────────────────────────────────

/**
 * Interleaves a score-sorted array so that no two consecutive entries share
 * the same place type. Preserves relative ordering within each type.
 *
 * Algorithm:
 *   1. Group by type (preserving per-type rank)
 *   2. Round-robin pick from type buckets, skipping the last-used type
 *   3. When no non-repeating type is available, allow the repeat to avoid
 *      discarding results
 *
 * @param {object[]} sorted    — sorted descending by score, diversity-controlled (max N per type)
 * @param {number}   limit     — max output size
 * @returns {object[]}
 */
const injectDiversity = (sorted, limit) => {
  // Group into per-type buckets (order within bucket preserved).
  const buckets = new Map();
  for (const place of sorted) {
    if (!buckets.has(place.type)) buckets.set(place.type, []);
    buckets.get(place.type).push(place);
  }

  const result = [];
  let lastType = null;

  while (result.length < limit) {
    // Prefer types that are not the same as the previous result.
    let chosen = null;

    // Pass 1: find the highest-score candidate from a *different* type.
    let bestScore    = -Infinity;
    let bestType     = null;
    for (const [type, items] of buckets.entries()) {
      if (items.length === 0)     continue;
      if (type === lastType)      continue;
      if (items[0].score > bestScore) {
        bestScore = items[0].score;
        bestType  = type;
      }
    }

    if (bestType) {
      chosen = bestType;
    } else {
      // Pass 2: all remaining candidates are the same type — allow repeat.
      for (const [type, items] of buckets.entries()) {
        if (items.length > 0) { chosen = type; break; }
      }
    }

    if (!chosen) break; // pool exhausted

    const item = buckets.get(chosen).shift();
    if (buckets.get(chosen).length === 0) buckets.delete(chosen);

    result.push(item);
    lastType = chosen;
  }

  return result;
};

// ─── Scoring Engine ───────────────────────────────────────────────────────────

/**
 * Scores a single place against all user and context signals.
 *
 * v5 additions:
 *   - interactionScore is now recency-weighted (not a raw sum)
 *   - freshnessBoost  (+3 for places with 0 prior interactions)
 *   - explorationBoost (0–2 random, only for low-interaction places)
 *
 * @param {object}             place             — Firestore place document
 * @param {object|null}        profile           — user's Firestore profile
 * @param {object[]}           routines          — user's routines
 * @param {object[]}           interactions      — user's interactions (raw, still used for type rules)
 * @param {Map<string,number>} affinityMap       — pre-built type-affinity map
 * @param {Map<string,object>} placeLookup       — placeId (incl. seed aliases) → place document
 * @param {object}             context           — from buildContext()
 * @param {Map<string,object>} interactionIndex  — per-place { count, recencyWeightedScore }
 *
 * @returns {{ total: number, rawScore: number, breakdown: object }}
 */
export const scorePlaceForUser = (
  place,
  profile,
  routines,
  interactions,
  affinityMap,
  placeLookup,
  context,
  interactionIndex
) => {
  const breakdown = {
    // ── v4 fields ─────────────────────────────────────────
    routineMatch:      0,
    budgetMatch:       0,
    locationMatch:     0,
    interactionScore:  0,   // now recency-weighted
    typeSaveSignal:    0,
    typeDismissSignal: 0,
    affinityBoost:     0,
    timeOfDayMatch:    0,
    contextTimeOfDay:  0,
    weekendBoost:      0,
    weekdayBoost:      0,
    // ── v5 fields ─────────────────────────────────────────
    freshnessBoost:    0,
    explorationBoost:  0,
    recencyWeight:     1,   // stored for debug transparency (avg effective weight)
  };

  const locationType = resolveLocationType(place);
  const { timeOfDay, isWeekend } = context;

  // ── Rule 1: Routine activity-type match (+3 per matching routine) ────────────
  for (const routine of routines) {
    if (routine.activityType === place.type) {
      breakdown.routineMatch += WEIGHTS.routineMatchPerRoutine;
    }
  }

  // ── Rule 2: Budget match (+2) ────────────────────────────────────────────────
  const budgetSignals = new Set();
  if (profile?.budgetRange) budgetSignals.add(profile.budgetRange);
  for (const r of routines) { if (r.budgetRange) budgetSignals.add(r.budgetRange); }
  if (place.priceRange === "free" || budgetSignals.has(place.priceRange)) {
    breakdown.budgetMatch = WEIGHTS.budgetMatch;
  }

  // ── Rule 3: Location preference match (+2) ───────────────────────────────────
  const locationSignals = new Set();
  if (profile?.locationPreference) locationSignals.add(profile.locationPreference);
  for (const r of routines) { if (r.locationPreference) locationSignals.add(r.locationPreference); }
  if (locationSignals.has("any") || locationSignals.has(locationType)) {
    breakdown.locationMatch = WEIGHTS.locationMatch;
  }

  // ── Rule 4 (v5): Recency-weighted interaction score ──────────────────────────
  // interactionScore = Σ ( score_i * 1/(1 + ageInDays_i) )
  const placeStats = interactionIndex.get(place.id);
  if (placeStats && placeStats.count > 0) {
    breakdown.interactionScore = placeStats.recencyWeightedScore;
    // Expose the effective average weight for debug transparency.
    breakdown.recencyWeight = +(placeStats.recencyWeightedScore / placeStats.count).toFixed(3);
  }

  // ── Rule 5a/5b: Type-level save (+5) / dismiss (-3) signals ─────────────────
  for (const interaction of interactions) {
    const interactionPlace = resolvePlace(placeLookup, interaction.placeId);
    if (!interactionPlace || interactionPlace.type !== place.type) continue;
    if (interaction.actionType === "save"    && breakdown.typeSaveSignal    === 0) breakdown.typeSaveSignal    = WEIGHTS.typeSaveSignal;
    if (interaction.actionType === "dismiss" && breakdown.typeDismissSignal === 0) breakdown.typeDismissSignal = WEIGHTS.typeDismissSignal;
  }

  // ── Rule 6: Type-affinity boost (+4 / -4) ────────────────────────────────────
  const typeAffinity = affinityMap.get(place.type) ?? 0;
  if (typeAffinity > 0) breakdown.affinityBoost = WEIGHTS.affinityPositive;
  if (typeAffinity < 0) breakdown.affinityBoost = WEIGHTS.affinityNegative;

  // ── Rule 7 (legacy): Routine time-of-day match (+2) ─────────────────────────
  for (const routine of routines) {
    if (routine.activityType === place.type && routine.timeOfDay === timeOfDay) {
      breakdown.timeOfDayMatch = WEIGHTS.routineTimeOfDayMatch;
      break;
    }
  }

  // ── Rule 8: Context time-of-day band match (+3) ───────────────────────────────
  const typesForNow = TIME_OF_DAY_TYPE_MAP[timeOfDay] ?? new Set();
  if (typesForNow.has(place.type)) {
    breakdown.contextTimeOfDay = WEIGHTS.contextTimeOfDay;
  }

  // ── Rule 9: Weekend boost (+2 for social / outdoor) ──────────────────────────
  if (isWeekend && WEEKEND_BOOST_TYPES.has(place.type)) {
    breakdown.weekendBoost = WEIGHTS.weekendBoost;
  }

  // ── Rule 10: Weekday boost (+1 for gym / coffee) ──────────────────────────────
  if (!isWeekend && WEEKDAY_BOOST_TYPES.has(place.type)) {
    breakdown.weekdayBoost = WEIGHTS.weekdayBoost;
  }

  // ── Rule 11 (v5 NEW): Freshness boost (+3 for never-seen places) ─────────────
  const interactionCount = placeStats?.count ?? 0;
  if (interactionCount === 0) {
    breakdown.freshnessBoost = WEIGHTS.freshnessBoost;
  }

  // ── Rule 12 (v5 NEW): Exploration boost (0–2 random for low-interaction) ─────
  // Injects controlled randomness so the same places don't always surface.
  if (interactionCount < LOW_INTERACTION_THRESHOLD) {
    breakdown.explorationBoost = +(Math.random() * WEIGHTS.explorationMax).toFixed(3);
  }

  const rawScore =
    breakdown.routineMatch      +
    breakdown.budgetMatch       +
    breakdown.locationMatch     +
    breakdown.interactionScore  +
    breakdown.typeSaveSignal    +
    breakdown.typeDismissSignal +
    breakdown.affinityBoost     +
    breakdown.timeOfDayMatch    +
    breakdown.contextTimeOfDay  +
    breakdown.weekendBoost      +
    breakdown.weekdayBoost      +
    breakdown.freshnessBoost    +
    breakdown.explorationBoost;

  return { rawScore, breakdown };
};

// ─── Main Recommendation Function ────────────────────────────────────────────

/**
 * Generates a personalised, context-aware, diverse, and adaptive list of places.
 *
 * @param {string}  userId        — Firebase UID from the verified token
 * @param {boolean} [debug=false] — attach scoreBreakdown to each result
 * @param {number}  [limit=10]    — maximum results to return
 *
 * @returns {Promise<{
 *   recommendations: object[],
 *   context: object,
 *   meta: {
 *     profileFound:      boolean,
 *     routineCount:      number,
 *     interactionCount:  number,
 *     topInterestType:   string|null,
 *     placesInCatalogue: number,
 *     context?:          object   — only when debug=true
 *   }
 * }>}
 *
 * @throws {Error} statusCode 404 when no user profile exists
 */
export const getRecommendations = async (userId, debug = false, limit = 10) => {
  const context = buildContext();

  console.log(`[recommendations] uid=${userId} time=${context.timeOfDay} isWeekend=${context.isWeekend}`);

  const [profile, routines, interactions, places] = await Promise.all([
    getUserById(userId),
    fetchRoutines(userId),
    fetchInteractions(userId),
    getAllPlaces(),
  ]);

  if (!profile) {
    const err = new Error("User profile not found");
    err.statusCode = 404;
    throw err;
  }

  // Build lookup structures.
  const placeLookup        = buildPlaceLookupMap(places);
  const affinityMap        = buildTypeAffinityMap(interactions, placeLookup);
  const { savedIds, dismissedIds } = buildStrongSignalSets(interactions, placeLookup);
  const topInterestType    = deriveTopInterestType(affinityMap);
  const interactionIndex   = buildInteractionIndex(interactions, placeLookup);

  // ── Phase 1: Score every catalogue place ──────────────────────────────────────
  const scored = places.map((place) => {
    const { rawScore, breakdown } = scorePlaceForUser(
      place, profile, routines, interactions,
      affinityMap, placeLookup, context, interactionIndex
    );

    const normalizedScore = normalizeScore(rawScore);

    const entry = {
      id:       place.id,
      name:     place.name,
      type:     place.type,
      score:    normalizedScore,   // 0–100 normalized
      rawScore: +rawScore.toFixed(3),
    };

    if (debug) entry.scoreBreakdown = breakdown;

    return entry;
  });

  // ── Phase 2: Filter out dismissed places ─────────────────────────────────────
  const withoutDismissed = scored.filter((p) => !dismissedIds.has(p.id));

  // ── Phase 3: Sort descending by normalized score ──────────────────────────────
  withoutDismissed.sort((a, b) => b.score - a.score);

  // ── Phase 4: Diversity — max 3 per type pool, then interleave ────────────────
  // Build a pool with at most 3 of each type (keeps order within type).
  const typeCount  = new Map();
  const poolCapped = [];
  for (const p of withoutDismissed) {
    const n = typeCount.get(p.type) ?? 0;
    if (n >= 3) continue;
    typeCount.set(p.type, n + 1);
    poolCapped.push(p);
  }

  // Interleave so no two consecutive results share a type.
  const interleaved = injectDiversity(poolCapped, limit * 2);

  // ── Phase 5: Pin saved places into top-5 ─────────────────────────────────────
  const saved   = interleaved.filter((p) =>  savedIds.has(p.id));
  const others  = interleaved.filter((p) => !savedIds.has(p.id));
  const pinned  = saved.slice(0, 5);
  const recommendations = [...pinned, ...others.slice(0, limit - pinned.length)];

  const meta = {
    profileFound:      true,
    routineCount:      routines.length,
    interactionCount:  interactions.length,
    topInterestType,
    placesInCatalogue: places.length,
  };
  if (debug) {
    meta.context = context;
  }

  return { recommendations, context, meta };
};
