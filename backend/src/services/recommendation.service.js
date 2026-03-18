/**
 * recommendation.service.js — Personalized recommendation engine (v4).
 *
 * v4 change: fully context-aware scoring.
 *   - Request-time context is built once via buildContext() in utils/context.js
 *     and passed through the entire scoring pipeline.
 *   - Two new scoring rules (weekday/weekend day-part boost) augment the
 *     existing eight rules.
 *   - The context object is returned from getRecommendations() so the
 *     controller can expose it in debug mode.
 *
 * All 8 original scoring rules are unchanged. The two new rules are purely
 * additive — existing scores are never modified.
 *
 * Scoring rules (cumulative per place):
 *   — Original rules (unchanged) ——————————————————————————————————————————
 *   +3  routine activityType matches place.type (per routine)
 *   +2  budget match (profile or any routine; "free" places always match)
 *   +2  location match (profile or any routine; "any" always matches)
 *   +Σ  sum of raw interaction scores for this exact placeId
 *   +5  user has "save" on any place of the same type
 *   -3  user has "dismiss" on any place of the same type
 *   +4  type affinity is positive (Σ type scores > 0)
 *   -4  type affinity is negative (Σ type scores < 0)
 *   +2  place type matches a routine whose timeOfDay fits current hour (legacy)
 *   — New context-aware rules ——————————————————————————————————————————————
 *   +3  place type matches the current time-of-day behaviour pattern
 *         morning   → coffee, gym, yoga
 *         afternoon → coffee, restaurant
 *         evening   → social, restaurant
 *         night     → social
 *   +2  weekend boost: social / outdoor types (+2 on Sat/Sun)
 *   +1  weekday boost: gym / coffee types (+1 on Mon–Fri)
 *
 * Post-scoring filters:
 *   - Dismissed places removed entirely.
 *   - Saved places pinned into top-5.
 *   - Max 3 results per type in the final list.
 *
 * Data sources:
 *   Collection "places"        — via place.service.getAllPlaces() (cached)
 *   Collection "users"         — profile (budgetRange, locationPreference)
 *   Collection "routines"      — activityType, timeOfDay, locationPreference, budgetRange
 *   Collection "interactions"  — placeId, actionType, score
 */

import { db }         from "../config/firebase.js";
import { getUserById } from "./user.service.js";
import { getAllPlaces } from "./place.service.js";
import { buildContext } from "../utils/context.js";

const ROUTINES_COLLECTION     = "routines";
const INTERACTIONS_COLLECTION = "interactions";

// ─── Scoring weights ──────────────────────────────────────────────────────────
// Centralised so all weights can be tuned in one place.

const WEIGHTS = Object.freeze({
  routineMatchPerRoutine: 3,
  budgetMatch:            2,
  locationMatch:          2,
  typeSaveSignal:         5,
  typeDismissSignal:      -3,
  affinityPositive:       4,
  affinityNegative:       -4,
  routineTimeOfDayMatch:  2,  // legacy: routine matches current time
  contextTimeOfDay:       3,  // new: place type fits current time-of-day band
  weekendBoost:           2,  // new: social/outdoor on weekends
  weekdayBoost:           1,  // new: gym/coffee on weekdays
});

// ─── Context-aware type maps ──────────────────────────────────────────────────

/** Place types that are typically preferred in each time-of-day band. */
const TIME_OF_DAY_TYPE_MAP = Object.freeze({
  morning:   new Set(["coffee", "gym", "yoga"]),
  afternoon: new Set(["coffee", "restaurant"]),
  evening:   new Set(["social", "restaurant"]),
  night:     new Set(["social"]),
});

/** Types boosted on weekends. */
const WEEKEND_BOOST_TYPES = new Set(["social", "outdoor"]);

/** Types boosted on weekdays. */
const WEEKDAY_BOOST_TYPES = new Set(["gym", "coffee"]);

// ─── Field-mapping adapter ────────────────────────────────────────────────────

/**
 * Resolves the indoor/outdoor string from the boolean isIndoor field.
 * @param {object} place
 * @returns {"indoor"|"outdoor"}
 */
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

// ─── Pre-computation Helpers ──────────────────────────────────────────────────

const buildTypeAffinityMap = (interactions, placeById) => {
  const affinityMap = new Map();
  for (const interaction of interactions) {
    const place = placeById.get(interaction.placeId);
    if (!place) continue;
    affinityMap.set(place.type, (affinityMap.get(place.type) ?? 0) + (interaction.score ?? 0));
  }
  return affinityMap;
};

const buildStrongSignalSets = (interactions) => {
  const savedIds     = new Set();
  const dismissedIds = new Set();
  for (const interaction of interactions) {
    if (interaction.actionType === "save")    savedIds.add(interaction.placeId);
    if (interaction.actionType === "dismiss") dismissedIds.add(interaction.placeId);
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

// ─── Scoring Engine ───────────────────────────────────────────────────────────

/**
 * Scores a single place against all user and context signals.
 *
 * @param {object}             place        — Firestore place document
 * @param {object|null}        profile      — user's Firestore profile
 * @param {object[]}           routines     — user's routines (may be empty)
 * @param {object[]}           interactions — user's interactions (may be empty)
 * @param {Map<string,number>} affinityMap  — pre-built type-affinity map
 * @param {Map<string,object>} placeById    — placeId → place document
 * @param {object}             context      — built by buildContext() in utils/context.js
 *
 * @returns {{ total: number, breakdown: object }}
 */
export const scorePlaceForUser = (
  place,
  profile,
  routines,
  interactions,
  affinityMap,
  placeById,
  context
) => {
  const breakdown = {
    routineMatch:      0,
    budgetMatch:       0,
    locationMatch:     0,
    interactionScore:  0,
    typeSaveSignal:    0,
    typeDismissSignal: 0,
    affinityBoost:     0,
    timeOfDayMatch:    0,  // legacy: routine-based time match
    contextTimeOfDay:  0,  // new: time-of-day band match
    weekendBoost:      0,  // new
    weekdayBoost:      0,  // new
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

  // ── Rule 4: Direct interaction score (Σ raw scores for this placeId) ─────────
  for (const interaction of interactions) {
    if (interaction.placeId === place.id) {
      breakdown.interactionScore += interaction.score ?? 0;
    }
  }

  // ── Rule 5a/5b: Type-level save (+5) / dismiss (-3) signals ─────────────────
  for (const interaction of interactions) {
    const interactionPlace = placeById.get(interaction.placeId);
    if (!interactionPlace || interactionPlace.type !== place.type) continue;
    if (interaction.actionType === "save"    && breakdown.typeSaveSignal    === 0) breakdown.typeSaveSignal    = WEIGHTS.typeSaveSignal;
    if (interaction.actionType === "dismiss" && breakdown.typeDismissSignal === 0) breakdown.typeDismissSignal = WEIGHTS.typeDismissSignal;
  }

  // ── Rule 6: Type-affinity boost (+4 / -4) ────────────────────────────────────
  const typeAffinity = affinityMap.get(place.type) ?? 0;
  if (typeAffinity > 0) breakdown.affinityBoost = WEIGHTS.affinityPositive;
  if (typeAffinity < 0) breakdown.affinityBoost = WEIGHTS.affinityNegative;

  // ── Rule 7 (legacy): Routine time-of-day match (+2) ─────────────────────────
  // Kept for backward-compatibility with existing test assertions.
  for (const routine of routines) {
    if (routine.activityType === place.type && routine.timeOfDay === timeOfDay) {
      breakdown.timeOfDayMatch = WEIGHTS.routineTimeOfDayMatch;
      break;
    }
  }

  // ── Rule 8 (NEW): Context time-of-day band match (+3) ───────────────────────
  // Boosts place types that are behaviourally appropriate right now,
  // regardless of whether the user has a matching routine.
  const typesForNow = TIME_OF_DAY_TYPE_MAP[timeOfDay] ?? new Set();
  if (typesForNow.has(place.type)) {
    breakdown.contextTimeOfDay = WEIGHTS.contextTimeOfDay;
  }

  // ── Rule 9 (NEW): Weekend boost (+2 for social / outdoor) ───────────────────
  if (isWeekend && WEEKEND_BOOST_TYPES.has(place.type)) {
    breakdown.weekendBoost = WEIGHTS.weekendBoost;
  }

  // ── Rule 10 (NEW): Weekday boost (+1 for gym / coffee) ───────────────────────
  if (!isWeekend && WEEKDAY_BOOST_TYPES.has(place.type)) {
    breakdown.weekdayBoost = WEIGHTS.weekdayBoost;
  }

  const total =
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
    breakdown.weekdayBoost;

  return { total, breakdown };
};

// ─── Diversity Control ────────────────────────────────────────────────────────

const applyDiversityControl = (sorted, maxPerType = 3, limit = 10) => {
  const typeCount = new Map();
  const result    = [];
  for (const place of sorted) {
    if (result.length >= limit) break;
    const count = typeCount.get(place.type) ?? 0;
    if (count >= maxPerType) continue;
    typeCount.set(place.type, count + 1);
    result.push(place);
  }
  return result;
};

// ─── Main Recommendation Function ────────────────────────────────────────────

/**
 * Generates a personalised, context-aware, ranked, and diverse list of places.
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
  // Build request-time context once — all scoring rules read from this object.
  const context = buildContext();

  console.log(`[recommendations] uid=${userId} time=${context.timeOfDay} isWeekend=${context.isWeekend}`);

  // Fetch all data sources concurrently.
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

  // Build fast lookups.
  const placeById = new Map(places.map((p) => [p.id, p]));

  // Pre-compute shared signals.
  const affinityMap              = buildTypeAffinityMap(interactions, placeById);
  const { savedIds, dismissedIds } = buildStrongSignalSets(interactions);
  const topInterestType          = deriveTopInterestType(affinityMap);

  // Score every place in the catalogue.
  const scored = places.map((place) => {
    const { total, breakdown } = scorePlaceForUser(
      place, profile, routines, interactions, affinityMap, placeById, context
    );

    const entry = {
      id:    place.id,
      name:  place.name,
      type:  place.type,
      score: total,
    };

    if (debug) entry.scoreBreakdown = breakdown;

    return entry;
  });

  // Post-processing: dismiss → sort → diversity → pin saved.
  const withoutDismissed = scored.filter((p) => !dismissedIds.has(p.id));
  withoutDismissed.sort((a, b) => b.score - a.score);
  const diversified    = applyDiversityControl(withoutDismissed, 3, limit * 2);
  const saved          = diversified.filter((p) =>  savedIds.has(p.id));
  const others         = diversified.filter((p) => !savedIds.has(p.id));
  const pinned         = saved.slice(0, 5);
  const recommendations = [...pinned, ...others.slice(0, limit - pinned.length)];

  const meta = {
    profileFound:      true,
    routineCount:      routines.length,
    interactionCount:  interactions.length,
    topInterestType,
    placesInCatalogue: places.length,
  };
  if (debug) {
    meta.context = context;  // explicit so clients always receive it when debug=true
  }

  return { recommendations, context, meta };
};
