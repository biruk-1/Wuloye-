/**
 * recommendation.service.js — Personalized recommendation engine (v13).
 *
 * v13 change: feedback-loop optimization.
 *   - interactionAgeDecayWeight: last 24h=1.0, 24h–7d=0.7, 7d+=0.4 applied to
 *     buildRecentAffinityMap and buildInteractionIndex so older behaviour fades.
 *   - detectBehaviorShift: last-10 vs historical mean action score; when shift
 *     detected, longTermAffinityBoost is reduced, recentBoost and session match
 *     boost are amplified.
 *   - balanceLearningSignals: caps long-term / recent / session positive mass
 *     so none exceeds 40% of their combined positive total.
 *   - meta.learning: recencyWeightActive, behaviorShiftDetected.
 *
 * v12 change: expanded AI training pipeline.
 *   - Feature vector expanded from 7 → 10 dimensions, now including
 *     placeTypeIndex, timeOfDayIndex, dayOfWeek, sessionIntentIndex,
 *     domSessTypeIndex, embeddingScore, longTermAffinity, typeAffinityNorm,
 *     placeInteractNorm, placeRating.
 *   - Model persists to Firestore (models/current) as primary store;
 *     data/model.json is kept as a file backup.
 *   - Version increments automatically on every retrain (v1 → v2 → …).
 *   - Retrain interval tightened to every 20 interactions (was 100).
 *   - initModelCache() warms the in-memory model at server startup.
 *   - Rule 25 feature vector updated to match the new 10-dim FEATURE_NAMES.
 *
 * v11 change: real AI / machine-learning layer.
 *   - Linear regression trained via gradient descent; blended 70/30 with rules.
 *
 * v10 change: exploration vs exploitation balance.
 *
 * v9 change: long-term memory + user embedding engine.
 *
 * v8 change: session intelligence + sequential prediction.
 *
 * v7 change: context awareness + intent prediction.
 *
 * v6 change: real-time learning + persistent intelligence.
 *
 * All v4–v11 rules are untouched.
 */

import { db }          from "../config/firebase.js";
import { getUserById }  from "./user.service.js";
import { getAllPlaces }  from "./place.service.js";
import { buildContext } from "../utils/context.js";
import { SEED_PLACES }  from "../data/places.seed.js";
import {
  getSession,
  computeDominantSessionType,
  computeSessionIntent,
  SEQUENCE_BOOST_MAP,
  SESSION_INTENT_OVERRIDE_MIN,
} from "./session.service.js";
import {
  buildPlaceEmbedding,
  cosineSimilarity,
  topEmbeddingEntry,
} from "../utils/embedding.js";
import {
  predict      as modelPredict,
  loadModel,
  isLoaded     as isModelLoaded,
} from "./ai/modelService.js";
import {
  encodeType,
  encodeTimeOfDay,
  encodeIntent,
} from "./ai/trainingDataBuilder.js";
import {
  interactionAgeDecayWeight,
  detectBehaviorShift,
  balanceLearningSignals,
} from "../utils/learning.js";

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
  affinityPositive:       4,   // kept for topInterestType / old path; scoring now uses typeAffinityScore
  affinityNegative:       -4,
  routineTimeOfDayMatch:  2,
  contextTimeOfDay:       3,
  weekendBoost:           2,
  weekdayBoost:           1,
  // v5 rules
  freshnessBoost:         3,
  explorationMax:         2,
  // v6 rules
  typeAffinityMultiplier: 0.5, // profile.typeAffinity[type] * this
  seenPenalty:            -2,  // applied when seenCount > SEEN_PENALTY_THRESHOLD
  // v7 rules
  lateNightGymPenalty:      -3,   // gym places penalised when isLateNight
  lateNightSocialBoost:      2,   // social places boosted at night (adds to contextTimeOfDay)
  intentBoostStrong:         3,   // fitness→gym, social→social
  intentBoostModerate:       2,   // relax→cafe/coffee
  recentAffinityMultiplier:  0.7, // recentAffinity[type] * this
  echoChokePenalty:         -2,   // dominant type (≥ECHO_CHAMBER_THRESHOLD of recent activity)
  // v8 rules
  sessionBoostMatch:         4,   // place.type == dominantSessionType
  sessionBoostMismatch:     -1,   // place.type != dominantSessionType (when session active)
  sequenceBoost:             2,   // place.type is predicted next step after last session action
  typeDiversityPenalty:     -2,   // per-level penalty for consecutive same-type in ranking
  popularityScoreWeight:    0.05, // place.popularityScore * this (cold-start users)
  locationTrendWeight:       0.5, // place.rating * this (cold-start users)
  // v9 rules
  embeddingWeight:           8,   // longTermAffinityBoost = cosineSimilarity * this (max 8 pts)
  // v10 rules
  exploitationBoostStrong:   5,   // userEmbedding[type] > 0.5 → strong match
  exploitationBoostModerate: 2,   // userEmbedding[type] > 0.2 → moderate match
  explorationNewTypeBoost:   3,   // type completely absent from recent interactions
  repeatPenaltyWeight:      -5,   // type seen > REPEAT_PENALTY_THRESHOLD times recently
  diversityBoostWeight:      4,   // underrepresented type in top-N ranked output
  // v11 rules
  modelBlendWeight:         0.3,  // weight of model score in final blend (0 = rules only)
  ruleBlendWeight:          0.7,  // weight of rule-based raw score in final blend
  // v13 rules — behavior shift multipliers
  shiftLongTermMul:         0.65, // reduce long-term influence when behaviour shifts
  shiftShortTermMul:        1.3,  // amplify recent + session match when behaviour shifts
  learningSignalMaxShare:   0.4,  // max share of combined LT+recent+session positive mass
});

/** Penalise a place if the user has been exposed to it more than this many times. */
const SEEN_PENALTY_THRESHOLD = 2;

/** A place is considered "low interaction" if it has fewer than this many events. */
const LOW_INTERACTION_THRESHOLD = 2;

// ─── v7 constants ─────────────────────────────────────────────────────────────

/** Number of most-recent interactions used for short-term memory and intent detection. */
const RECENT_INTERACTIONS_WINDOW = 20;

/**
 * Fraction of recent interactions a single type must reach to be considered
 * "dominant" (echo-chamber trigger).  0.4 = 40 %.
 */
const ECHO_CHAMBER_THRESHOLD = 0.4;

/**
 * Fraction of recent interactions required before an intent category fires.
 * e.g. 0.35 means ≥35 % of recent activity must be fitness to return "fitness".
 */
const INTENT_THRESHOLD = 0.35;

/** Place types that contribute to the "fitness" intent bucket. */
const FITNESS_INTENT_TYPES = new Set(["gym", "yoga"]);

/** Place types that contribute to the "social" intent bucket. */
const SOCIAL_INTENT_TYPES  = new Set(["social"]);

/** Place types that contribute to the "relax" intent bucket. */
const RELAX_INTENT_TYPES   = new Set(["coffee", "cafe"]);

// ─── v8 constants ─────────────────────────────────────────────────────────────

/**
 * A user is considered "cold-start" when their total interaction count is below
 * this threshold.  Cold-start users receive popularityScore + locationTrendScore
 * boosts so highly-rated popular places surface in the absence of personal data.
 */
const COLD_START_THRESHOLD = 5;

// ─── v10 constants ─────────────────────────────────────────────────────────────

/**
 * Users with interaction counts at or above this value are considered "active"
 * and switch to exploitation-heavy weighting (they have enough signal to exploit).
 * Below it, the engine favours exploration to help new users discover variety.
 */
const ACTIVE_USER_THRESHOLD = 20;

/** Exploration weight for new users  (interactions < ACTIVE_USER_THRESHOLD). */
const EXPLORATION_WEIGHT_NEW    = 0.6;
/** Exploitation weight for new users. */
const EXPLOITATION_WEIGHT_NEW   = 0.4;
/** Exploration weight for active users (interactions >= ACTIVE_USER_THRESHOLD). */
const EXPLORATION_WEIGHT_ACTIVE = 0.3;
/** Exploitation weight for active users. */
const EXPLOITATION_WEIGHT_ACTIVE = 0.7;

/**
 * If a single place type appears more than this many times in the recent
 * interaction window, that type receives repeatPenalty on every additional
 * place of that type — breaking loop-like recommendation runs.
 */
const REPEAT_PENALTY_THRESHOLD = 5;

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
 * where recencyWeightedScore = Σ (interaction.score * 1/(1 + ageInDays) * ageDecay).
 * v13: ageDecay = interactionAgeDecayWeight (24h=1, 7d=0.7, 7d+=0.4).
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
    const ageDecay   = interactionAgeDecayWeight(interaction.createdAt, now);
    const weight     = (1 / (1 + ageInDays)) * ageDecay;

    entry.count               += 1;
    entry.recencyWeightedScore += (interaction.score ?? 0) * weight;

    index.set(place.id, entry);
  }

  return index;
};

// ─── Seen-count map ───────────────────────────────────────────────────────────

/**
 * Builds a map of { cataloguePlaceId → seenCount } from profile.seenPlaces.
 * seenPlaces is an ordered array so we simply count occurrences.
 *
 * @param {string[]} seenPlaces — profile.seenPlaces array
 * @returns {Map<string, number>}
 */
const buildSeenCountMap = (seenPlaces) => {
  const map = new Map();
  for (const id of (seenPlaces ?? [])) {
    map.set(id, (map.get(id) ?? 0) + 1);
  }
  return map;
};

// ─── v7 Intent + Short-Term Memory Helpers ───────────────────────────────────

/**
 * Builds a per-type affinity map from the user's most recent interactions only.
 * Interactions are expected sorted newest-first; earlier entries in the array
 * (lower index) receive a higher recency weight so that very recent behaviour
 * has a stronger signal than older activity within the window.
 *
 * recentAffinity[type] = Σ (interaction.score * recencyFactor * ageDecay)
 * where recencyFactor = (n − index) / n   →   1.0 for newest, ~0 for oldest.
 * v13: ageDecay = interactionAgeDecayWeight (24h=1, 7d=0.7, 7d+=0.4).
 *
 * @param {object[]} recentInteractions — at most RECENT_INTERACTIONS_WINDOW items, newest-first
 * @param {Map}      placeLookup
 * @param {Date}     [now] — request time for age decay
 * @returns {Map<string, number>}
 */
const buildRecentAffinityMap = (recentInteractions, placeLookup, now = new Date()) => {
  const map = new Map();
  const n   = recentInteractions.length;
  if (n === 0) return map;

  recentInteractions.forEach((interaction, index) => {
    const place = resolvePlace(placeLookup, interaction.placeId);
    if (!place) return;
    // Index 0 = newest → recencyFactor closest to 1; last index → closest to 0.
    const recencyFactor = (n - index) / n;
    const ageDecay      = interactionAgeDecayWeight(interaction.createdAt, now);
    const contribution  = (interaction.score ?? 0) * recencyFactor * ageDecay;
    map.set(place.type, (map.get(place.type) ?? 0) + contribution);
  });

  return map;
};

/**
 * Infers the user's current intent from their most recent interactions.
 *
 * Buckets place types into intent categories, finds which category holds the
 * highest share, and returns its label when it clears INTENT_THRESHOLD.
 * Falls back to "explore" when behaviour is mixed or history is empty.
 *
 * @param {object|null} profile            — user Firestore profile (reserved for future signals)
 * @param {object[]}    recentInteractions — last N interactions, newest-first
 * @param {Map}         placeLookup        — placeId → place document
 * @returns {"fitness"|"social"|"relax"|"explore"}
 */
export const detectUserIntent = (profile, recentInteractions, placeLookup) => {
  if (!recentInteractions || recentInteractions.length === 0) return "explore";

  let fitnessCount = 0;
  let socialCount  = 0;
  let relaxCount   = 0;
  let total        = 0;

  for (const interaction of recentInteractions) {
    const place = resolvePlace(placeLookup, interaction.placeId);
    if (!place) continue;
    if (FITNESS_INTENT_TYPES.has(place.type)) fitnessCount += 1;
    if (SOCIAL_INTENT_TYPES.has(place.type))  socialCount  += 1;
    if (RELAX_INTENT_TYPES.has(place.type))   relaxCount   += 1;
    total += 1;
  }

  if (total === 0) return "explore";

  const maxCount = Math.max(fitnessCount, socialCount, relaxCount);
  if (maxCount / total >= INTENT_THRESHOLD) {
    if (maxCount === fitnessCount) return "fitness";
    if (maxCount === socialCount)  return "social";
    if (maxCount === relaxCount)   return "relax";
  }

  return "explore";
};

/**
 * Returns a Set of place types that are over-represented in recent interactions.
 * A "dominant" type accounts for ≥ ECHO_CHAMBER_THRESHOLD of the window.
 * Places of a dominant type receive echoChokePenalty to surface variety.
 *
 * @param {object[]} recentInteractions — newest-first, already windowed
 * @param {Map}      placeLookup
 * @returns {Set<string>}
 */
const buildDominantTypes = (recentInteractions, placeLookup) => {
  const dominant  = new Set();
  const typeCounts = new Map();
  let total = 0;

  for (const interaction of recentInteractions) {
    const place = resolvePlace(placeLookup, interaction.placeId);
    if (!place) continue;
    typeCounts.set(place.type, (typeCounts.get(place.type) ?? 0) + 1);
    total += 1;
  }

  if (total === 0) return dominant;

  for (const [type, count] of typeCounts.entries()) {
    if (count / total >= ECHO_CHAMBER_THRESHOLD) dominant.add(type);
  }

  return dominant;
};

// ─── v10 Exploration / Exploitation Helpers ──────────────────────────────────

/**
 * Counts how many times each place type appears in a recent interaction list.
 * Used by repeatPenalty (Rule 24) to detect over-represented types.
 *
 * @param {object[]} recentInteractions — newest-first, already windowed
 * @param {Map}      placeLookup
 * @returns {Map<string, number>}
 */
const buildRecentTypeCounts = (recentInteractions, placeLookup) => {
  const counts = new Map();
  for (const interaction of recentInteractions) {
    const place = resolvePlace(placeLookup, interaction.placeId);
    if (!place) continue;
    counts.set(place.type, (counts.get(place.type) ?? 0) + 1);
  }
  return counts;
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
 * v8 additions:
 *   - sessionBoost      place type matches / mismatches the live session dominant type
 *   - sequenceBoost     place type is the predicted next step after the last session action
 *   - popularityScore   cold-start boost using place.popularityScore and place.rating
 *   - locationTrendScore cold-start quality signal from place.rating
 *   - typeDiversityPenalty: set to 0 here; filled in by the post-sort pass
 *
 * v7 additions:
 *   - lateNightBoost   gym penalty at night; extra social boost at night
 *   - intentBoost      place type aligns with detected user intent
 *   - recentBoost      short-term memory: recentAffinity[type] × 0.7
 *   - echoChoke        dominant-type over-representation penalty
 *
 * v5 additions:
 *   - interactionScore is now recency-weighted (not a raw sum)
 *   - freshnessBoost  (+3 for places with 0 prior interactions)
 *   - explorationBoost (0–2 random, only for low-interaction places)
 *
 * @param {object}             place                — Firestore place document
 * @param {object|null}        profile              — user's Firestore profile
 * @param {object[]}           routines             — user's routines
 * @param {object[]}           interactions         — user's interactions (raw)
 * @param {Map<string,number>} affinityMap          — pre-built type-affinity map
 * @param {Map<string,object>} placeLookup          — placeId → place document
 * @param {object}             context              — from buildContext()
 * @param {Map<string,object>} interactionIndex     — per-place { count, recencyWeightedScore }
 * @param {Map<string,number>} seenCountMap         — per-place seen count
 * @param {string}             [detectedIntent="explore"]  — long-term or session-overridden intent
 * @param {Map<string,number>} [recentAffinityMap=Map()]   — from buildRecentAffinityMap()
 * @param {Set<string>}        [dominantTypes=Set()]       — from buildDominantTypes()
 * @param {string|null}        [dominantSessionType=null]  — most frequent type in session
 * @param {string|null}        [lastSessionType=null]      — type of most recent session action
 * @param {boolean}            [isColdStart=false]         — user has < COLD_START_THRESHOLD interactions
 * @param {Record<string,number>} [userEmbedding={}]       — user's persistent taste vector (Phase 9)
 * @param {number}             [explorationWeight=0.6]     — Phase 10 exploration weight (0-1)
 * @param {number}             [exploitationWeight=0.4]    — Phase 10 exploitation weight (0-1)
 * @param {Map<string,number>} [recentTypeCounts=Map()]    — Phase 10 type frequency in recent interactions
 * @param {boolean}            [behaviorShiftDetected=false] — Phase 13: recent vs historical divergence
 *
 * @returns {{ rawScore: number, breakdown: object }}
 */
export const scorePlaceForUser = (
  place,
  profile,
  routines,
  interactions,
  affinityMap,
  placeLookup,
  context,
  interactionIndex,
  seenCountMap,
  detectedIntent      = "explore",
  recentAffinityMap   = new Map(),
  dominantTypes       = new Set(),
  dominantSessionType = null,
  lastSessionType     = null,
  isColdStart         = false,
  userEmbedding       = {},
  explorationWeight   = EXPLORATION_WEIGHT_NEW,
  exploitationWeight  = EXPLOITATION_WEIGHT_NEW,
  recentTypeCounts    = new Map(),
  behaviorShiftDetected = false
) => {
  const breakdown = {
    // ── v4 fields ─────────────────────────────────────────
    routineMatch:          0,
    budgetMatch:           0,
    locationMatch:         0,
    interactionScore:      0,
    typeSaveSignal:        0,
    typeDismissSignal:     0,
    affinityBoost:         0,
    timeOfDayMatch:        0,
    contextTimeOfDay:      0,
    weekendBoost:          0,
    weekdayBoost:          0,
    // ── v5 fields ─────────────────────────────────────────
    freshnessBoost:        0,
    explorationBoost:      0,
    recencyWeight:         1,
    // ── v6 fields ─────────────────────────────────────────
    typeAffinityScore:     0,
    seenPenalty:           0,
    // ── v7 fields ─────────────────────────────────────────
    lateNightBoost:        0,
    intentBoost:           0,
    detectedIntent,
    recentBoost:           0,
    echoChoke:             0,
    // ── v8 fields ─────────────────────────────────────────
    sessionBoost:          0,   // session dominant type match / mismatch
    sequenceBoost:         0,   // predicted next step from SEQUENCE_BOOST_MAP
    popularityScore:       0,   // cold-start: place.popularityScore * weight
    locationTrendScore:    0,   // cold-start: place.rating * weight
    typeDiversityPenalty:  0,   // filled in post-sort (0 here always)
    dominantSessionType:   dominantSessionType ?? "none",
    sessionIntent:         computeSessionIntent(dominantSessionType),
    // ── v9 fields ─────────────────────────────────────────
    embeddingScore:        0,   // cosine similarity between user and place vectors (0–1)
    longTermAffinityBoost: 0,   // embeddingScore * embeddingWeight (added to rawScore)
    // ── v10 fields ────────────────────────────────────────
    exploitationBoost: 0,   // embedding-alignment reward scaled by exploitationWeight
    repeatPenalty:     0,   // penalty when type is over-represented in recent history
    diversityBoost:    0,   // post-sort: boost for underrepresented types in top-N
    // ── v11 fields ────────────────────────────────────────
    modelScore:        0,   // linear model prediction (0 when untrained)
  };

  const locationType = resolveLocationType(place);
  const { timeOfDay, isWeekend, isLateNight } = context;

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

  // ── Rule 4 (v5/v6): Average recency-weighted interaction score ───────────────
  // v6: uses average (totalScore / count) instead of raw sum so a single
  // high-value save isn't drowned by many low-value views.
  const placeStats = interactionIndex.get(place.id);
  if (placeStats && placeStats.count > 0) {
    breakdown.interactionScore = +(placeStats.recencyWeightedScore / placeStats.count).toFixed(3);
    breakdown.recencyWeight    = +(placeStats.recencyWeightedScore / placeStats.count).toFixed(3);
  }

  // ── Rule 5a/5b: Type-level save (+5) / dismiss (-3) signals ─────────────────
  for (const interaction of interactions) {
    const interactionPlace = resolvePlace(placeLookup, interaction.placeId);
    if (!interactionPlace || interactionPlace.type !== place.type) continue;
    if (interaction.actionType === "save"    && breakdown.typeSaveSignal    === 0) breakdown.typeSaveSignal    = WEIGHTS.typeSaveSignal;
    if (interaction.actionType === "dismiss" && breakdown.typeDismissSignal === 0) breakdown.typeDismissSignal = WEIGHTS.typeDismissSignal;
  }

  // ── Rule 6 (v6): Persistent type-affinity score from profile ────────────────
  // Replaces the old static ±4 affinityBoost for the scoring total.
  // affinityBoost is kept in breakdown at 0 for backward-compat with old tests.
  const persistedAffinity = (profile?.typeAffinity ?? {})[place.type] ?? 0;
  breakdown.typeAffinityScore = +(persistedAffinity * WEIGHTS.typeAffinityMultiplier).toFixed(3);

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

  // ── Rule 13 (v6 NEW): Seen penalty (−2 when seenCount > threshold) ───────────
  // Reduces ranking of places the user has already been exposed to frequently,
  // encouraging the engine to surface fresher content.
  const seenCount = seenCountMap.get(place.id) ?? 0;
  if (seenCount > SEEN_PENALTY_THRESHOLD) {
    breakdown.seenPenalty = WEIGHTS.seenPenalty;
  }

  // ── Rule 14 (v7 NEW): Late-night context adjustment ───────────────────────────
  // Gyms are penalised at night (contextually inappropriate).
  // Social places receive an additional boost at night on top of contextTimeOfDay.
  if (isLateNight) {
    if (place.type === "gym")    breakdown.lateNightBoost = WEIGHTS.lateNightGymPenalty;
    if (place.type === "social") breakdown.lateNightBoost = WEIGHTS.lateNightSocialBoost;
  }

  // ── Rule 15 (v7 NEW): Intent boost ────────────────────────────────────────────
  // Amplifies places that match the user's inferred current intent.
  if (detectedIntent === "fitness" && FITNESS_INTENT_TYPES.has(place.type)) {
    breakdown.intentBoost = WEIGHTS.intentBoostStrong;
  } else if (detectedIntent === "social" && SOCIAL_INTENT_TYPES.has(place.type)) {
    breakdown.intentBoost = WEIGHTS.intentBoostStrong;
  } else if (detectedIntent === "relax" && RELAX_INTENT_TYPES.has(place.type)) {
    breakdown.intentBoost = WEIGHTS.intentBoostModerate;
  }

  // ── Rule 16 (v7 NEW): Short-term memory / recent behavior boost ───────────────
  // Uses the last RECENT_INTERACTIONS_WINDOW interactions only, weighted so
  // the most recent actions carry the strongest signal.
  const recentAffinity = recentAffinityMap.get(place.type) ?? 0;
  breakdown.recentBoost = +(recentAffinity * WEIGHTS.recentAffinityMultiplier).toFixed(3);

  // ── Rule 17 (v7 NEW): Echo-chamber choke ──────────────────────────────────────
  // If the user's recent history is dominated by one type (≥ ECHO_CHAMBER_THRESHOLD),
  // apply a small penalty to that type so other types surface more often.
  if (dominantTypes.has(place.type)) {
    breakdown.echoChoke = WEIGHTS.echoChokePenalty;
  }

  // ── Rule 18 (v8 NEW): Session dominant type boost / mismatch penalty ─────────
  // When the user has an active session, boost the dominant type and lightly
  // penalise everything else so the session's momentum influences ranking.
  if (dominantSessionType) {
    breakdown.sessionBoost = place.type === dominantSessionType
      ? WEIGHTS.sessionBoostMatch
      : WEIGHTS.sessionBoostMismatch;
  }

  // ── Rule 19 (v8 NEW): Sequential prediction boost ────────────────────────────
  // Reward place types that are the natural "next step" after the user's most
  // recent session action (e.g. gym → coffee, restaurant → outdoor).
  if (lastSessionType) {
    const nextLikelyTypes = SEQUENCE_BOOST_MAP[lastSessionType];
    if (nextLikelyTypes && nextLikelyTypes.has(place.type)) {
      breakdown.sequenceBoost = WEIGHTS.sequenceBoost;
    }
  }

  // ── Rule 20 (v8 NEW): Cold-start popularity & quality boost ──────────────────
  // When the user has fewer than COLD_START_THRESHOLD total interactions the
  // engine lacks personal signal.  Surface well-known, high-rated places so
  // the first-run experience still feels curated.
  if (isColdStart) {
    breakdown.popularityScore    = +((place.popularityScore ?? 0) * WEIGHTS.popularityScoreWeight).toFixed(3);
    breakdown.locationTrendScore = +((place.rating          ?? 0) * WEIGHTS.locationTrendWeight).toFixed(3);
  }

  // ── Rule 21 (v9 NEW): Long-term user embedding similarity ────────────────────
  // Computes cosine similarity between the user's persistent taste vector and
  // the place's derived embedding.  A high similarity means the place type and
  // tags align with what the user has consistently engaged with over time.
  // embeddingScore is stored raw (0–1) for transparency; longTermAffinityBoost
  // is its weighted contribution to rawScore (max 8 points).
  const placeEmbedding            = buildPlaceEmbedding(place);
  const similarity                = cosineSimilarity(userEmbedding, placeEmbedding);
  breakdown.embeddingScore        = +similarity.toFixed(4);
  breakdown.longTermAffinityBoost = +(similarity * WEIGHTS.embeddingWeight).toFixed(3);

  // ── Rule 22 (v10 NEW): Exploitation boost — reward known preferences ──────────
  // Amplifies places whose type strongly aligns with the user's long-term taste
  // vector.  The boost is scaled by exploitationWeight so active users (who have
  // confirmed preferences) receive a stronger pull toward familiar types.
  const typeEmbeddingValue = userEmbedding[place.type] ?? 0;
  if (typeEmbeddingValue > 0.5) {
    breakdown.exploitationBoost = +(WEIGHTS.exploitationBoostStrong * exploitationWeight).toFixed(3);
  } else if (typeEmbeddingValue > 0.2) {
    breakdown.exploitationBoost = +(WEIGHTS.exploitationBoostModerate * exploitationWeight).toFixed(3);
  }

  // ── Rule 23 (v10 NEW): Exploration boost — surface novel types ───────────────
  // Extends the v5 random exploration (Rule 12) with a deterministic component:
  // if a place's type is completely absent from the user's recent interaction
  // window, it gets an additional boost scaled by explorationWeight.  This ensures
  // novel types rise naturally even when not picked by the random draw.
  const recentCountForType = recentTypeCounts.get(place.type) ?? 0;
  if (recentCountForType === 0) {
    breakdown.explorationBoost = +(breakdown.explorationBoost +
      WEIGHTS.explorationNewTypeBoost * explorationWeight).toFixed(3);
  }

  // ── Rule 24 (v10 NEW): Repeat penalty — break boring loops ───────────────────
  // If the user has interacted with this type more than REPEAT_PENALTY_THRESHOLD
  // times in their recent window, apply a penalty to push other types up.
  // This is distinct from echoChoke (which uses a fractional threshold) — this
  // uses an absolute count threshold for a stronger anti-loop signal.
  if (recentCountForType > REPEAT_PENALTY_THRESHOLD) {
    breakdown.repeatPenalty = WEIGHTS.repeatPenaltyWeight;
  }

  // ── Phase 13: behaviour-shift adjustment + signal balancing ─────────────────
  // Re-weight long-term vs short-term learning signals when recent activity
  // diverges from historical averages, then cap each positive component at
  // 40% of the combined positive mass (longTerm + recent + session match).
  let ltLearn = breakdown.longTermAffinityBoost;
  let rbLearn = breakdown.recentBoost;
  let sbLearn = breakdown.sessionBoost;

  if (behaviorShiftDetected) {
    ltLearn *= WEIGHTS.shiftLongTermMul;
    rbLearn *= WEIGHTS.shiftShortTermMul;
    const posSb = Math.max(0, sbLearn);
    const negSb = Math.min(0, sbLearn);
    sbLearn = negSb + posSb * WEIGHTS.shiftShortTermMul;
  }

  const balancedLearn = balanceLearningSignals(
    ltLearn,
    rbLearn,
    sbLearn,
    WEIGHTS.learningSignalMaxShare
  );
  breakdown.longTermAffinityBoost = +balancedLearn.longTerm.toFixed(3);
  breakdown.recentBoost           = +balancedLearn.recent.toFixed(3);
  breakdown.sessionBoost          = +balancedLearn.session.toFixed(3);

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
    breakdown.explorationBoost  +
    breakdown.typeAffinityScore +
    breakdown.seenPenalty       +
    breakdown.lateNightBoost    +
    breakdown.intentBoost       +
    breakdown.recentBoost       +
    breakdown.echoChoke         +
    breakdown.sessionBoost      +
    breakdown.sequenceBoost     +
    breakdown.popularityScore   +
    breakdown.locationTrendScore +
    breakdown.longTermAffinityBoost +
    breakdown.exploitationBoost  +
    breakdown.repeatPenalty;

  // ── Rule 25 (v12 UPDATED): AI model score ─────────────────────────────────
  // Builds the 10-dimensional feature vector matching Phase 12's
  // trainingDataBuilder.FEATURE_NAMES exactly.  All values are derived
  // from signals already computed above — zero extra Firestore reads.
  //
  // Feature order (must stay in sync with FEATURE_NAMES):
  //   [0] placeTypeIndex     [1] timeOfDayIndex    [2] dayOfWeek
  //   [3] sessionIntentIndex [4] domSessTypeIndex  [5] embeddingScore
  //   [6] longTermAffinity   [7] typeAffinityNorm  [8] placeInteractNorm
  //   [9] placeRating
  const AFFINITY_CAP_LOCAL = 50; // mirrors user.service AFFINITY_CAP
  const rawAffinity        = (profile?.typeAffinity ?? {})[place.type] ?? 0;

  const modelFeatures = [
    // [0] placeTypeIndex
    encodeType(place.type),
    // [1] timeOfDayIndex
    encodeTimeOfDay(context.timeOfDay),
    // [2] dayOfWeek  (0-6 / 6)
    new Date().getDay() / 6,
    // [3] sessionIntentIndex
    encodeIntent(detectedIntent),
    // [4] domSessTypeIndex
    dominantSessionType ? encodeType(dominantSessionType) : 0,
    // [5] embeddingScore  (already computed in Rule 21)
    breakdown.embeddingScore,
    // [6] longTermAffinity  — direct user embedding value for this type
    (userEmbedding[place.type] ?? 0),
    // [7] typeAffinityNorm  — map [-50,50] → [0,1]
    (rawAffinity + AFFINITY_CAP_LOCAL) / (2 * AFFINITY_CAP_LOCAL),
    // [8] placeInteractNorm — how often user interacted with this place (capped)
    Math.min(1, (interactionIndex.get(place.id)?.count ?? 0) / 10),
    // [9] placeRating
    Math.min(1, (place.rating ?? 0) / 5),
  ];

  const modelOutput = modelPredict(modelFeatures);
  breakdown.modelScore = +modelOutput.toFixed(4);

  // Blend: 0.7 × rule-based + 0.3 × model.  Falls back to rawScore when
  // the model has not been trained yet (predict returns 0, isModelLoaded false).
  const blendedRawScore = isModelLoaded()
    ? WEIGHTS.ruleBlendWeight  * rawScore +
      WEIGHTS.modelBlendWeight * breakdown.modelScore
    : rawScore;

  return { rawScore: blendedRawScore, breakdown };
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

  console.log(`[recommendations] uid=${userId} time=${context.timeOfDay} isWeekend=${context.isWeekend} isLateNight=${context.isLateNight}`);

  const [profile, routines, interactions, places, session] = await Promise.all([
    getUserById(userId),
    fetchRoutines(userId),
    fetchInteractions(userId),
    getAllPlaces(),
    getSession(userId),
  ]);

  if (!profile) {
    const err = new Error("User profile not found");
    err.statusCode = 404;
    throw err;
  }

  const now = new Date();

  // Build lookup structures.
  const placeLookup        = buildPlaceLookupMap(places);
  const affinityMap        = buildTypeAffinityMap(interactions, placeLookup);
  const { savedIds, dismissedIds } = buildStrongSignalSets(interactions, placeLookup);
  const topInterestType    = deriveTopInterestType(affinityMap);
  const interactionIndex   = buildInteractionIndex(interactions, placeLookup, now);
  const seenCountMap       = buildSeenCountMap(profile.seenPlaces ?? []);

  // ── v7: Short-term memory window (newest-first, capped at RECENT_INTERACTIONS_WINDOW) ──
  const recentInteractions = interactions
    .slice()
    .sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta; // newest first
    })
    .slice(0, RECENT_INTERACTIONS_WINDOW);

  // ── v7: Long-term intent + echo-chamber structures ────────────────────────────
  const longTermIntent    = detectUserIntent(profile, recentInteractions, placeLookup);
  const recentAffinityMap = buildRecentAffinityMap(recentInteractions, placeLookup, now);
  const dominantTypes     = buildDominantTypes(recentInteractions, placeLookup);

  // ── v13: behaviour shift (last 10 vs historical mean action score) ───────────
  const { behaviorShiftDetected, recentAvg, historicalAvg } = detectBehaviorShift(interactions);
  if (behaviorShiftDetected) {
    console.log(
      `[recommendations] behaviorShift detected recentAvg=${recentAvg.toFixed(3)} ` +
      `historicalAvg=${historicalAvg.toFixed(3)} — down-weighting long-term, boosting recent/session`
    );
  }

  // ── v8: Session signals ───────────────────────────────────────────────────────
  const recentActions       = session.recentActions ?? [];
  const dominantSessionType = computeDominantSessionType(recentActions);
  const sessionIntent       = computeSessionIntent(dominantSessionType);

  // Session intent overrides the long-term intent when the session has enough
  // data and a non-explore result (avoid overriding with a weak/empty signal).
  const sessionHasSignal =
    recentActions.length >= SESSION_INTENT_OVERRIDE_MIN && sessionIntent !== "explore";
  const detectedIntent = sessionHasSignal ? sessionIntent : longTermIntent;

  // Most recent action type — used by sequenceBoost (Rule 19).
  const lastSessionType = recentActions.length > 0 ? recentActions[0].type : null;

  // Cold-start flag: true when the user has very few personal interactions.
  const isColdStart = interactions.length < COLD_START_THRESHOLD;

  // ── v9: User embedding (long-term taste vector) ───────────────────────────────
  const userEmbedding = profile.embedding ?? {};

  // ── v10: Exploration / exploitation balance ───────────────────────────────────
  // Determine dynamic weights based on how much signal the user has generated.
  // New users explore; active users exploit their confirmed preferences.
  const isActiveUser       = interactions.length >= ACTIVE_USER_THRESHOLD;
  const explorationWeight  = isActiveUser ? EXPLORATION_WEIGHT_ACTIVE : EXPLORATION_WEIGHT_NEW;
  const exploitationWeight = isActiveUser ? EXPLOITATION_WEIGHT_ACTIVE : EXPLOITATION_WEIGHT_NEW;

  // Count per-type frequency in the recent window for Rule 23 + Rule 24.
  const recentTypeCounts = buildRecentTypeCounts(recentInteractions, placeLookup);

  console.log(
    `[recommendations] longTermIntent=${longTermIntent} sessionIntent=${sessionIntent}` +
    ` effectiveIntent=${detectedIntent} dominantSessionType=${dominantSessionType ?? "none"}` +
    ` lastSessionType=${lastSessionType ?? "none"} isColdStart=${isColdStart}` +
    ` explorationW=${explorationWeight} exploitationW=${exploitationWeight}`
  );

  // ── Phase 1: Score every catalogue place ──────────────────────────────────────
  const scored = places.map((place) => {
    const { rawScore, breakdown } = scorePlaceForUser(
      place, profile, routines, interactions,
      affinityMap, placeLookup, context, interactionIndex, seenCountMap,
      detectedIntent, recentAffinityMap, dominantTypes,
      dominantSessionType, lastSessionType, isColdStart,
      userEmbedding, explorationWeight, exploitationWeight, recentTypeCounts,
      behaviorShiftDetected
    );

    const normalizedScore = normalizeScore(rawScore);

    const entry = {
      id:       place.id,
      name:     place.name,
      type:     place.type,
      score:    normalizedScore,
      rawScore: +rawScore.toFixed(3),
    };

    if (debug) entry.scoreBreakdown = breakdown;

    return entry;
  });

  // ── Phase 2: Filter out dismissed places ─────────────────────────────────────
  const withoutDismissed = scored.filter((p) => !dismissedIds.has(p.id));

  // ── Phase 3: Sort descending by normalized score ──────────────────────────────
  withoutDismissed.sort((a, b) => b.score - a.score);

  // ── Phase 3b (v8 NEW): Type-diversity penalty pass ───────────────────────────
  // Walk the sorted list and apply an increasing penalty each time the same
  // type appears consecutively.  This discourages runs of identical types at
  // the top of the ranking without fully discarding them.
  {
    let prevType = null;
    let consec   = 0;
    for (const entry of withoutDismissed) {
      if (entry.type === prevType) {
        consec += 1;
        const pen = WEIGHTS.typeDiversityPenalty * consec;
        entry.rawScore = +(entry.rawScore + pen).toFixed(3);
        entry.score    = normalizeScore(entry.rawScore);
        if (debug && entry.scoreBreakdown) entry.scoreBreakdown.typeDiversityPenalty = pen;
      } else {
        consec = 0;
        if (debug && entry.scoreBreakdown) entry.scoreBreakdown.typeDiversityPenalty = 0;
      }
      prevType = entry.type;
    }
    // Re-sort after penalties.
    withoutDismissed.sort((a, b) => b.score - a.score);
  }

  // ── Phase 3c (v10 NEW): Diversity boost pass ──────────────────────────────────
  // Count how often each type appears in the top portion of the sorted list.
  // Types that appear less than half as often as the average frequency receive a
  // +diversityBoostWeight lift so under-represented categories don't get buried.
  {
    const sampleSize = Math.min(withoutDismissed.length, limit * 2);
    const topSlice   = withoutDismissed.slice(0, sampleSize);

    const typeFreq = new Map();
    for (const entry of topSlice) {
      typeFreq.set(entry.type, (typeFreq.get(entry.type) ?? 0) + 1);
    }

    const distinctTypeCount = typeFreq.size;
    const avgFreq = distinctTypeCount > 0 ? sampleSize / distinctTypeCount : 1;

    for (const entry of withoutDismissed) {
      const freq = typeFreq.get(entry.type) ?? 0;
      if (freq < avgFreq * 0.5) {
        // Underrepresented type — boost it to surface variety.
        const boost = WEIGHTS.diversityBoostWeight;
        entry.rawScore = +(entry.rawScore + boost).toFixed(3);
        entry.score    = normalizeScore(entry.rawScore);
        if (debug && entry.scoreBreakdown) entry.scoreBreakdown.diversityBoost = boost;
      } else {
        if (debug && entry.scoreBreakdown) entry.scoreBreakdown.diversityBoost = 0;
      }
    }
    // Re-sort after boosts.
    withoutDismissed.sort((a, b) => b.score - a.score);
  }

  // ── Phase 4: Diversity — max 3 per type pool, then interleave ────────────────
  const typeCount  = new Map();
  const poolCapped = [];
  for (const p of withoutDismissed) {
    const n = typeCount.get(p.type) ?? 0;
    if (n >= 3) continue;
    typeCount.set(p.type, n + 1);
    poolCapped.push(p);
  }

  const interleaved = injectDiversity(poolCapped, limit * 2);

  // ── Phase 5: Pin saved places into top-5 ─────────────────────────────────────
  const saved   = interleaved.filter((p) =>  savedIds.has(p.id));
  const others  = interleaved.filter((p) => !savedIds.has(p.id));
  const pinned  = saved.slice(0, 5);
  const recommendations = [...pinned, ...others.slice(0, limit - pinned.length)];

  // Final order must match score.
  recommendations.sort((a, b) => b.score - a.score);

  const meta = {
    profileFound:      true,
    routineCount:      routines.length,
    interactionCount:  interactions.length,
    topInterestType,
    placesInCatalogue: places.length,
    detectedIntent,
    session: {
      dominantSessionType: dominantSessionType ?? null,
      sessionIntent,
      recentActionCount:   recentActions.length,
    },
    longTerm: {
      ...topEmbeddingEntry(userEmbedding),
    },
    exploration: {
      explorationWeight,
      exploitationWeight,
      explorationActive: true,
    },
    ai: (() => {
      const m = loadModel();
      return {
        modelActive:    isModelLoaded(),
        modelVersion:   m.version       ?? "v1",
        versionNumber:  m.versionNumber ?? 0,
        lastTrainedAt:  m.trainedAt     ?? null,
        sampleCount:    m.sampleCount   ?? 0,
      };
    })(),
    learning: {
      recencyWeightActive:   true,
      behaviorShiftDetected,
    },
  };
  if (debug) {
    meta.context = context;
  }

  return { recommendations, context, meta };
};
