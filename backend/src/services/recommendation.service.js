/**
 * recommendation.service.js — Personalized recommendation engine (v2).
 *
 * Improvements over v1:
 *   #1  Type-affinity learning  — sums interaction scores per place-type and
 *       boosts (+4) or penalises (-4) based on the aggregated signal.
 *   #2  Time-of-day matching    — compares server's current hour to routines'
 *       timeOfDay field and adds +2 when there's a match.
 *   #3  Diversity control       — caps results at 3 places per type so the
 *       top-10 list stays varied.
 *   #4  Strong-signal handling  — places the user explicitly saved are pinned
 *       near the top; places they dismissed are excluded entirely.
 *   #5  Score breakdown (debug) — when debug=true each result includes a
 *       scoreBreakdown object with per-rule point totals.
 *   #6  Expanded meta           — adds topInterestType to the meta block.
 *
 * Scoring rules (cumulative per place):
 *   +3  routine activityType matches place.type (per routine)
 *   +2  budget match (profile or any routine; free places always match)
 *   +2  location match (profile or any routine; "any" always matches)
 *   +Σ  sum of raw interaction scores for this exact placeId
 *   +5  user has "save" on any place of the same type
 *   -3  user has "dismiss" on any place of the same type
 *   +4  type affinity is positive (Σ type scores > 0)
 *   -4  type affinity is negative (Σ type scores < 0)
 *   +2  place type matches a routine whose timeOfDay fits current hour
 *
 * Post-scoring filters (applied after sorting):
 *   - Dismissed places are removed from results entirely.
 *   - Saved places are injected into the top-5 regardless of score.
 *   - Max 3 results per type in the final list.
 *
 * Data sources:
 *   Collection "users"         — profile (budgetRange, locationPreference)
 *   Collection "routines"      — activityType, timeOfDay, locationPreference, budgetRange
 *   Collection "interactions"  — placeId, actionType, score
 */

import { db } from "../config/firebase.js";
import { getUserById } from "./user.service.js";

const ROUTINES_COLLECTION     = "routines";
const INTERACTIONS_COLLECTION = "interactions";

// ─── Static Mock Places ───────────────────────────────────────────────────────

export const MOCK_PLACES = Object.freeze([
  { id: "place_1",  name: "Downtown Gym",            type: "gym",      priceLevel: "low",    locationType: "indoor"  },
  { id: "place_2",  name: "City Park",               type: "outdoor",  priceLevel: "free",   locationType: "outdoor" },
  { id: "place_3",  name: "Sunrise Yoga Studio",     type: "yoga",     priceLevel: "medium", locationType: "indoor"  },
  { id: "place_4",  name: "The Coffee Bean",         type: "coffee",   priceLevel: "low",    locationType: "indoor"  },
  { id: "place_5",  name: "Riverside Trail",         type: "walk",     priceLevel: "free",   locationType: "outdoor" },
  { id: "place_6",  name: "Urban Library",           type: "study",    priceLevel: "free",   locationType: "indoor"  },
  { id: "place_7",  name: "Rooftop Bar & Lounge",    type: "social",   priceLevel: "high",   locationType: "outdoor" },
  { id: "place_8",  name: "Budget Fitness Center",   type: "gym",      priceLevel: "low",    locationType: "indoor"  },
  { id: "place_9",  name: "Gourmet Brunch Spot",     type: "coffee",   priceLevel: "high",   locationType: "indoor"  },
  { id: "place_10", name: "Neighbourhood Bookshop",  type: "study",    priceLevel: "medium", locationType: "indoor"  },
  { id: "place_11", name: "Lakeside Picnic Ground",  type: "outdoor",  priceLevel: "free",   locationType: "outdoor" },
  { id: "place_12", name: "Pilates & Wellness Hub",  type: "yoga",     priceLevel: "medium", locationType: "indoor"  },
]);

/** Lookup map: placeId → place object. Built once, reused across the request. */
const PLACE_BY_ID = Object.fromEntries(MOCK_PLACES.map((p) => [p.id, p]));

// ─── Time-of-day helper ───────────────────────────────────────────────────────

/**
 * Maps the current server hour (0–23) to a timeOfDay label.
 *
 * @returns {"morning"|"afternoon"|"evening"}
 */
const getCurrentTimeOfDay = () => {
  const hour = new Date().getHours();
  if (hour >= 5  && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "evening";
};

// ─── Data Fetchers ────────────────────────────────────────────────────────────

/** Fetches all routines for a user. No composite index needed (where-only). */
const fetchRoutines = async (userId) => {
  const snap = await db
    .collection(ROUTINES_COLLECTION)
    .where("userId", "==", userId)
    .get();
  return snap.docs.map((d) => d.data());
};

/** Fetches up to 200 recent interactions for a user. No composite index needed. */
const fetchInteractions = async (userId) => {
  const snap = await db
    .collection(INTERACTIONS_COLLECTION)
    .where("userId", "==", userId)
    .limit(200)
    .get();
  return snap.docs.map((d) => d.data());
};

// ─── Pre-computation Helpers ──────────────────────────────────────────────────

/**
 * Builds a map of { placeType → total interaction score } from all user
 * interactions.  Used for type-affinity learning (Improvement #1).
 *
 * @param {object[]} interactions
 * @returns {Map<string, number>}
 */
const buildTypeAffinityMap = (interactions) => {
  const affinityMap = new Map();

  for (const interaction of interactions) {
    const place = PLACE_BY_ID[interaction.placeId];
    if (!place) continue; // unknown placeId — skip

    const current = affinityMap.get(place.type) ?? 0;
    affinityMap.set(place.type, current + (interaction.score ?? 0));
  }

  return affinityMap;
};

/**
 * Returns two Sets: placeIds the user explicitly saved and those dismissed.
 * Used for Improvement #4 (strong-signal handling).
 *
 * @param {object[]} interactions
 * @returns {{ savedIds: Set<string>, dismissedIds: Set<string> }}
 */
const buildStrongSignalSets = (interactions) => {
  const savedIds    = new Set();
  const dismissedIds = new Set();

  for (const interaction of interactions) {
    if (interaction.actionType === "save")    savedIds.add(interaction.placeId);
    if (interaction.actionType === "dismiss") dismissedIds.add(interaction.placeId);
  }

  return { savedIds, dismissedIds };
};

/**
 * Derives the top interest type from the affinity map — the type with the
 * highest positive score.  Returns null when no positive affinity exists.
 *
 * @param {Map<string, number>} affinityMap
 * @returns {string|null}
 */
const deriveTopInterestType = (affinityMap) => {
  let topType  = null;
  let topScore = 0; // only consider positive affinity

  for (const [type, score] of affinityMap.entries()) {
    if (score > topScore) {
      topScore = score;
      topType  = type;
    }
  }

  return topType;
};

// ─── Scoring Engine ───────────────────────────────────────────────────────────

/**
 * Scores a single place against all user context signals and returns the
 * total score plus a per-rule breakdown (for debug mode).
 *
 * @param {object}          place        — one entry from MOCK_PLACES
 * @param {object|null}     profile      — user's Firestore document
 * @param {object[]}        routines     — user's routines (may be empty)
 * @param {object[]}        interactions — user's interactions (may be empty)
 * @param {Map<string,number>} affinityMap — pre-built type-affinity map
 * @param {string}          currentTimeOfDay — "morning" | "afternoon" | "evening"
 *
 * @returns {{ total: number, breakdown: object }}
 */
export const scorePlaceForUser = (
  place,
  profile,
  routines,
  interactions,
  affinityMap,
  currentTimeOfDay
) => {
  const breakdown = {
    routineMatch:     0,
    budgetMatch:      0,
    locationMatch:    0,
    interactionScore: 0,
    typeSaveSignal:   0,
    typeDismissSignal:0,
    affinityBoost:    0,
    timeOfDayMatch:   0,
  };

  // ── Rule 1: Routine activity-type match (+3 per matching routine) ────────────
  for (const routine of routines) {
    if (routine.activityType === place.type) {
      breakdown.routineMatch += 3;
    }
  }

  // ── Rule 2: Budget match (+2) ────────────────────────────────────────────────
  const budgetSignals = new Set();
  if (profile?.budgetRange) budgetSignals.add(profile.budgetRange);
  for (const r of routines) {
    if (r.budgetRange) budgetSignals.add(r.budgetRange);
  }
  if (place.priceLevel === "free" || budgetSignals.has(place.priceLevel)) {
    breakdown.budgetMatch = 2;
  }

  // ── Rule 3: Location preference match (+2) ───────────────────────────────────
  const locationSignals = new Set();
  if (profile?.locationPreference) locationSignals.add(profile.locationPreference);
  for (const r of routines) {
    if (r.locationPreference) locationSignals.add(r.locationPreference);
  }
  if (locationSignals.has("any") || locationSignals.has(place.locationType)) {
    breakdown.locationMatch = 2;
  }

  // ── Rule 4: Direct interaction score (Σ raw scores for this placeId) ─────────
  for (const interaction of interactions) {
    if (interaction.placeId === place.id) {
      breakdown.interactionScore += interaction.score ?? 0;
    }
  }

  // ── Rule 5a: Type-level "save" signal (+5) ───────────────────────────────────
  // ── Rule 5b: Type-level "dismiss" signal (-3) ───────────────────────────────
  for (const interaction of interactions) {
    const interactionPlace = PLACE_BY_ID[interaction.placeId];
    if (!interactionPlace || interactionPlace.type !== place.type) continue;

    if (interaction.actionType === "save"    && breakdown.typeSaveSignal    === 0) breakdown.typeSaveSignal    =  5;
    if (interaction.actionType === "dismiss" && breakdown.typeDismissSignal === 0) breakdown.typeDismissSignal = -3;
  }

  // ── Improvement #1: Type-affinity boost (+4 / -4) ───────────────────────────
  const typeAffinity = affinityMap.get(place.type) ?? 0;
  if (typeAffinity > 0) breakdown.affinityBoost =  4;
  if (typeAffinity < 0) breakdown.affinityBoost = -4;

  // ── Improvement #2: Time-of-day match (+2) ───────────────────────────────────
  // Boost if any routine with this activityType aligns with the current time.
  for (const routine of routines) {
    if (routine.activityType === place.type && routine.timeOfDay === currentTimeOfDay) {
      breakdown.timeOfDayMatch = 2;
      break;
    }
  }

  const total =
    breakdown.routineMatch      +
    breakdown.budgetMatch       +
    breakdown.locationMatch     +
    breakdown.interactionScore  +
    breakdown.typeSaveSignal    +
    breakdown.typeDismissSignal +
    breakdown.affinityBoost     +
    breakdown.timeOfDayMatch;

  return { total, breakdown };
};

// ─── Diversity Control ────────────────────────────────────────────────────────

/**
 * Enforces diversity by allowing at most `maxPerType` places of each type.
 * Preserves the existing sort order within each type bucket.
 *
 * @param {object[]} sorted    — places sorted by score descending
 * @param {number}   maxPerType — cap per type (default 3)
 * @param {number}   limit      — total result cap (default 10)
 * @returns {object[]}
 */
const applyDiversityControl = (sorted, maxPerType = 3, limit = 10) => {
  const typeCount = new Map();
  const result    = [];

  for (const place of sorted) {
    if (result.length >= limit) break;

    const count = typeCount.get(place.type) ?? 0;
    if (count >= maxPerType) continue; // type bucket full — skip

    typeCount.set(place.type, count + 1);
    result.push(place);
  }

  return result;
};

// ─── Main Recommendation Function ────────────────────────────────────────────

/**
 * Generates a personalised, ranked, and diverse list of recommended places.
 *
 * @param {string}  userId — Firebase UID from the verified token
 * @param {boolean} [debug=false] — include scoreBreakdown in each result
 * @param {number}  [limit=10]   — maximum results to return
 *
 * @returns {Promise<{
 *   recommendations: object[],
 *   meta: {
 *     profileFound: boolean,
 *     routineCount: number,
 *     interactionCount: number,
 *     topInterestType: string|null
 *   }
 * }>}
 *
 * @throws {Error} statusCode 404 when no user profile exists
 */
export const getRecommendations = async (userId, debug = false, limit = 10) => {
  // Fetch all data sources concurrently.
  const [profile, routines, interactions] = await Promise.all([
    getUserById(userId),
    fetchRoutines(userId),
    fetchInteractions(userId),
  ]);

  if (!profile) {
    const err = new Error("User profile not found");
    err.statusCode = 404;
    throw err;
  }

  // Pre-compute shared signals once rather than per-place.
  const affinityMap      = buildTypeAffinityMap(interactions);
  const { savedIds, dismissedIds } = buildStrongSignalSets(interactions);
  const currentTimeOfDay = getCurrentTimeOfDay();
  const topInterestType  = deriveTopInterestType(affinityMap);

  // Score every place.
  const scored = MOCK_PLACES.map((place) => {
    const { total, breakdown } = scorePlaceForUser(
      place, profile, routines, interactions, affinityMap, currentTimeOfDay
    );

    const entry = {
      id:    place.id,
      name:  place.name,
      type:  place.type,
      score: total,
    };

    // Improvement #5: attach breakdown only in debug mode.
    if (debug) entry.scoreBreakdown = breakdown;

    return entry;
  });

  // Improvement #4a: Remove dismissed places entirely.
  const withoutDismissed = scored.filter((p) => !dismissedIds.has(p.id));

  // Sort descending by score.
  withoutDismissed.sort((a, b) => b.score - a.score);

  // Improvement #3: Apply diversity control (max 3 per type, keep top 10+saved).
  // We need a pool large enough to accommodate pinned saved places — use 2× limit.
  const diversified = applyDiversityControl(withoutDismissed, 3, limit * 2);

  // Improvement #4b: Pin saved places into the top 5.
  // Extract them in score order, then fill remaining slots with other results.
  const saved   = diversified.filter((p) =>  savedIds.has(p.id));
  const others  = diversified.filter((p) => !savedIds.has(p.id));

  // Take top 5 slots for saved places, pad up to `limit` with others.
  const pinned          = saved.slice(0, 5);
  const remainingSlots  = limit - pinned.length;
  const recommendations = [...pinned, ...others.slice(0, remainingSlots)];

  return {
    recommendations,
    meta: {
      profileFound:     true,
      routineCount:     routines.length,
      interactionCount: interactions.length,
      topInterestType,
    },
  };
};
