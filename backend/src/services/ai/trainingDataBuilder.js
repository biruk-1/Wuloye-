/**
 * trainingDataBuilder.js — Phase 12 training data extractor.
 *
 * Expands Phase 11's 7-feature vector to a 10-dimensional set that captures
 * richer contextual and session signals so the gradient-descent model learns
 * more nuanced ranking patterns.
 *
 * Feature vector (FEATURE_NAMES order):
 *   [0]  placeTypeIndex     — place type encoded as a category index, normalized 0-1
 *   [1]  timeOfDayIndex     — morning/afternoon/evening/night → 0 / 0.33 / 0.67 / 1
 *   [2]  dayOfWeek          — 0 (Sun) … 6 (Sat) normalized /6
 *   [3]  sessionIntentIndex — explore/fitness/social/relax → 0 / 0.33 / 0.67 / 1
 *   [4]  domSessTypeIndex   — dominant session place-type index (same encoding as [0])
 *   [5]  embeddingScore     — cosine(user.embedding, place.embedding)  [0-1]
 *   [6]  longTermAffinity   — user.embedding[placeType] direct value   [0-1]
 *   [7]  typeAffinityNorm   — typeAffinity mapped from [-50,50] → [0,1]
 *   [8]  placeInteractNorm  — min(1, past interactions with this place / 10)
 *   [9]  placeRating        — place.rating / 5                         [0-1]
 *
 * Label:  view=1, click=2, save=3, dismiss=-1
 *
 * NOTE: sessionIntent and dominantSessionType are approximated from the
 * interactions that occurred BEFORE each sample (newest-first slice of the
 * user's prior history) to avoid future-data leakage during training.
 *
 * NOTE: LABEL_SCORES are defined locally (not imported from
 * interaction.service.js) to avoid a circular dependency chain:
 *   interaction.service → retrainModel → trainingDataBuilder → [here]
 */

import { db }               from "../../config/firebase.js";
import { getAllPlaces }      from "../place.service.js";
import { SEED_PLACES }       from "../../data/places.seed.js";
import {
  buildPlaceEmbedding,
  cosineSimilarity,
}                           from "../../utils/embedding.js";

const INTERACTIONS_COLLECTION = "interactions";
const USERS_COLLECTION        = "users";

// ─── Label mapping (mirrors interaction.service ACTION_SCORES) ────────────────

const LABEL_SCORES = Object.freeze({
  view:    1,
  click:   2,
  save:    3,
  dismiss: -1,
});

// ─── Categorical encoding tables ─────────────────────────────────────────────

/**
 * Canonical place-type → integer index map.
 * Unknown types default to index 0 (treated as "gym" for normalization purposes).
 */
const PLACE_TYPE_INDEX = Object.freeze({
  gym:        0,
  yoga:       1,
  coffee:     2,
  cafe:       3,
  restaurant: 4,
  social:     5,
  outdoor:    6,
  park:       7,
});
const PLACE_TYPE_RANGE = Object.keys(PLACE_TYPE_INDEX).length - 1; // 7

const encodeType    = (type)   => (PLACE_TYPE_INDEX[type]   ?? 0)  / PLACE_TYPE_RANGE;

const TIME_OF_DAY_INDEX = Object.freeze({ morning: 0, afternoon: 1, evening: 2, night: 3 });
const encodeTimeOfDay   = (tod)    => (TIME_OF_DAY_INDEX[tod]   ?? 0)  / 3;

const INTENT_INDEX  = Object.freeze({ explore: 0, fitness: 1, social: 2, relax: 3 });
const encodeIntent  = (intent) => (INTENT_INDEX[intent]   ?? 0)  / 3;

const AFFINITY_CAP  = 50; // must match user.service AFFINITY_CAP

// ─── Time helpers ─────────────────────────────────────────────────────────────

const hourToTimeOfDay = (hour) => {
  if (hour >= 5  && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
};

// ─── Session signal approximation ────────────────────────────────────────────
// These replicate (simplified) the logic in recommendation.service.js so we
// can derive session context from historical interactions at training time.

const FITNESS_TYPES = new Set(["gym", "yoga"]);
const SOCIAL_TYPES  = new Set(["social"]);
const RELAX_TYPES   = new Set(["coffee", "cafe"]);

/**
 * Infers session intent from a slice of prior interactions (newest-first).
 * Uses only the 10 most recent prior interactions, matching the session window.
 *
 * @param {object[]} priorInteractions — user's interactions BEFORE this sample
 * @param {Map}      placeLookup
 * @returns {"explore"|"fitness"|"social"|"relax"}
 */
const computeSessionIntentForSample = (priorInteractions, placeLookup) => {
  const window = priorInteractions.slice(0, 10);
  const counts = { fitness: 0, social: 0, relax: 0, total: 0 };

  for (const ix of window) {
    const place = placeLookup.get(ix.placeId);
    if (!place) continue;
    if (FITNESS_TYPES.has(place.type)) counts.fitness += 1;
    if (SOCIAL_TYPES.has(place.type))  counts.social  += 1;
    if (RELAX_TYPES.has(place.type))   counts.relax   += 1;
    counts.total += 1;
  }

  if (counts.total === 0) return "explore";
  const threshold = 0.35 * counts.total;
  if (counts.fitness >= threshold) return "fitness";
  if (counts.social  >= threshold) return "social";
  if (counts.relax   >= threshold) return "relax";
  return "explore";
};

/**
 * Returns the most-frequent place type in the 5 most-recent prior interactions.
 *
 * @param {object[]} priorInteractions — newest-first
 * @param {Map}      placeLookup
 * @returns {string|null}
 */
const computeDomSessTypeForSample = (priorInteractions, placeLookup) => {
  const window     = priorInteractions.slice(0, 5);
  const typeCounts = new Map();
  for (const ix of window) {
    const place = placeLookup.get(ix.placeId);
    if (!place) continue;
    typeCounts.set(place.type, (typeCounts.get(place.type) ?? 0) + 1);
  }
  let dominant = null;
  let maxCount = 0;
  for (const [type, count] of typeCounts.entries()) {
    if (count > maxCount) { maxCount = count; dominant = type; }
  }
  return dominant;
};

// ─── Feature metadata ─────────────────────────────────────────────────────────

/** Ordered names — index MUST match buildFeatureVector(). */
export const FEATURE_NAMES = Object.freeze([
  "placeTypeIndex",     // [0]
  "timeOfDayIndex",     // [1]
  "dayOfWeek",          // [2]
  "sessionIntentIndex", // [3]
  "domSessTypeIndex",   // [4]
  "embeddingScore",     // [5]
  "longTermAffinity",   // [6]
  "typeAffinityNorm",   // [7]
  "placeInteractNorm",  // [8]
  "placeRating",        // [9]
]);

/** Total dimensions. */
export const FEATURE_COUNT = FEATURE_NAMES.length; // 10

// ─── Place lookup ─────────────────────────────────────────────────────────────

const buildPlaceLookup = (places) => {
  const map = new Map();
  for (const p of places) map.set(p.id, p);
  for (const seed of SEED_PLACES) {
    if (!seed.id) continue;
    const match = places.find((pl) => pl.name === seed.name && pl.type === seed.type);
    if (match) map.set(seed.id, match);
  }
  return map;
};

// ─── Feature vector builder ───────────────────────────────────────────────────

/**
 * Builds the 10-dimensional feature vector for one training sample.
 *
 * @param {object}   interaction      — Firestore interaction document
 * @param {object}   user             — Firestore user profile
 * @param {object}   place            — Firestore place catalogue document
 * @param {object[]} priorInteractions — user's interactions before this one, newest-first
 * @param {Map}      placeLookup      — placeId → place
 * @param {Map}      interactCountMap — placeId → total interaction count
 * @returns {number[]} length-10 array
 */
const buildFeatureVector = (interaction, user, place, priorInteractions, placeLookup, interactCountMap) => {
  const type = place.type;

  // [0] placeTypeIndex
  const placeTypeIndex = encodeType(type);

  // [1] timeOfDayIndex
  const date        = interaction.createdAt ? new Date(interaction.createdAt) : new Date();
  const timeOfDay   = hourToTimeOfDay(date.getHours());
  const timeOfDayIndex = encodeTimeOfDay(timeOfDay);

  // [2] dayOfWeek  (0=Sun … 6=Sat, normalized 0-1)
  const dayOfWeek = date.getDay() / 6;

  // [3] sessionIntentIndex
  const sessionIntent = computeSessionIntentForSample(priorInteractions, placeLookup);
  const sessionIntentIndex = encodeIntent(sessionIntent);

  // [4] domSessTypeIndex
  const domSessType    = computeDomSessTypeForSample(priorInteractions, placeLookup);
  const domSessTypeIndex = domSessType ? encodeType(domSessType) : 0;

  // [5] embeddingScore — cosine similarity user ↔ place vectors
  const userEmbedding  = user.embedding ?? {};
  const placeEmbedding = buildPlaceEmbedding(place);
  const embeddingScore = cosineSimilarity(userEmbedding, placeEmbedding);

  // [6] longTermAffinity — direct embedding value for this place type
  const longTermAffinity = userEmbedding[type] ?? 0;

  // [7] typeAffinityNorm — map typeAffinity from [-50,50] → [0,1]
  const rawAffinity    = (user.typeAffinity ?? {})[type] ?? 0;
  const typeAffinityNorm = (rawAffinity + AFFINITY_CAP) / (2 * AFFINITY_CAP);

  // [8] placeInteractNorm — how many times user has interacted with this place (capped)
  const interactCount    = interactCountMap.get(place.id) ?? 0;
  const placeInteractNorm = Math.min(1, interactCount / 10);

  // [9] placeRating
  const placeRating = Math.min(1, (place.rating ?? 0) / 5);

  return [
    placeTypeIndex,
    timeOfDayIndex,
    dayOfWeek,
    sessionIntentIndex,
    domSessTypeIndex,
    embeddingScore,
    longTermAffinity,
    typeAffinityNorm,
    placeInteractNorm,
    placeRating,
  ];
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches all interactions and builds a labelled training dataset.
 *
 * Session context (sessionIntent, dominantSessionType) is derived from each
 * user's history that preceded the current interaction — avoiding future
 * leakage and producing meaningful sequential signals.
 *
 * @param {number} [limit=10000] — max interactions to scan
 * @returns {Promise<{ features: number[], label: number }[]>}
 */
export const buildTrainingData = async (limit = 10_000) => {
  const interactionSnap = await db
    .collection(INTERACTIONS_COLLECTION)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  const interactions = interactionSnap.docs.map((d) => d.data());
  if (interactions.length === 0) return [];

  const places      = await getAllPlaces();
  const placeLookup = buildPlaceLookup(places);

  // Batch-fetch user profiles
  const userIds   = [...new Set(interactions.map((i) => i.userId))];
  const userSnaps = await Promise.all(
    userIds.map((uid) => db.collection(USERS_COLLECTION).doc(uid).get())
  );
  const userMap = new Map();
  for (const snap of userSnaps) {
    if (snap.exists) userMap.set(snap.id, snap.data());
  }

  // Group and sort interactions per user (newest-first) for session windowing.
  const interactionsByUser = new Map();
  for (const ix of interactions) {
    const arr = interactionsByUser.get(ix.userId) ?? [];
    arr.push(ix);
    interactionsByUser.set(ix.userId, arr);
  }
  for (const [, arr] of interactionsByUser) {
    arr.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
  }

  // Build per-place interaction count map (for placeInteractNorm feature).
  const interactCountMap = new Map();
  for (const ix of interactions) {
    const place = placeLookup.get(ix.placeId);
    if (!place) continue;
    interactCountMap.set(place.id, (interactCountMap.get(place.id) ?? 0) + 1);
  }

  const dataset = [];
  for (const interaction of interactions) {
    const user  = userMap.get(interaction.userId);
    const place = placeLookup.get(interaction.placeId);
    if (!user || !place) continue;

    const label = LABEL_SCORES[interaction.actionType];
    if (label === undefined) continue;

    // Build the "prior interactions" slice: everything the user did BEFORE this one.
    const userIxs  = interactionsByUser.get(interaction.userId) ?? [];
    const selfIdx  = userIxs.findIndex((ix) => ix.id === interaction.id);
    const priorIxs = selfIdx >= 0 ? userIxs.slice(selfIdx + 1) : [];

    dataset.push({
      features: buildFeatureVector(
        interaction, user, place, priorIxs, placeLookup, interactCountMap
      ),
      label,
    });
  }

  console.log(
    `[trainingData] built ${dataset.length} samples from ${interactions.length} interactions ` +
    `(${FEATURE_COUNT} features)`
  );
  return dataset;
};

// ─── Categorical encoders (exported for inference use in recommendation.service) ──

export { encodeType, encodeTimeOfDay, encodeIntent };
