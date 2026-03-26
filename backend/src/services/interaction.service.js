/**
 * interaction.service.js — Firestore data layer for user interactions.
 *
 * Responsibility: all reads/writes to the "interactions" collection.
 * No Express-specific code lives here — controllers call these functions.
 *
 * Score mapping (mirrors the product spec):
 *   view    → +1
 *   click   → +2
 *   save    → +3
 *   dismiss → -1
 *
 * Real-time learning (v6):
 *   After each interaction is persisted, updateUserIntelligence() is called
 *   to update the user's typeAffinity map and seenPlaces list on their profile
 *   document.  This ensures the NEXT recommendation request immediately sees
 *   the updated signals — no cache delay for the learning layer.
 *
 * Session memory (Phase 8):
 *   updateSession() is called concurrently with updateUserIntelligence() so
 *   the short-term session queue is advanced on every interaction.  Failure
 *   is non-fatal — the interaction write and intelligence update are unaffected.
 */

import { db } from "../config/firebase.js";
import { updateUserIntelligence } from "./user.service.js";
import { getAllPlaces }            from "./place.service.js";
import { SEED_PLACES }             from "../data/places.seed.js";
import { updateSession }           from "./session.service.js";
import { maybeRetrain }            from "../jobs/retrainModel.js";

const INTERACTIONS_COLLECTION = "interactions";

/** Allowed actionType values and their corresponding scores. */
export const ACTION_SCORES = Object.freeze({
  view:    1,
  click:   2,
  save:    3,
  dismiss: -1,
});

// ─── Place-type resolver ──────────────────────────────────────────────────────

/**
 * Resolves a placeId to a place type so we can update typeAffinity.
 *
 * Strategy (in order):
 *   1. Check live catalogue (getAllPlaces — cached, fast after first call)
 *   2. Fall back to SEED_PLACES id lookup (handles place_1 style ids)
 *   3. Return null if unresolvable (affinity update is skipped gracefully)
 *
 * @param {string} placeId
 * @returns {Promise<{ catalogueId: string|null, type: string|null }>}
 */
const resolvePlaceInfo = async (placeId) => {
  try {
    const places = await getAllPlaces();

    // Direct match on Firestore doc id.
    let match = places.find((p) => p.id === placeId);

    // Fall back to seed id alias (e.g. "place_1" → "Downtown Gym" → live doc).
    if (!match) {
      const seedEntry = SEED_PLACES.find((s) => s.id === placeId);
      if (seedEntry) {
        match = places.find((p) => p.name === seedEntry.name && p.type === seedEntry.type);
      }
    }

    return match
      ? { catalogueId: match.id, type: match.type }
      : { catalogueId: null,     type: null };
  } catch {
    return { catalogueId: null, type: null };
  }
};

// ─── Core service functions ───────────────────────────────────────────────────

/**
 * Persist a new interaction document and update the user's intelligence model.
 *
 * @param {string} userId     - uid from the verified Firebase token
 * @param {string} placeId    - identifier of the place being interacted with
 * @param {string} actionType - one of the keys in ACTION_SCORES
 * @param {object} [metadata] - optional free-form metadata object
 * @returns {Promise<object>} the saved interaction document
 */
export const createInteraction = async (userId, placeId, actionType, metadata = null) => {
  const docRef = db.collection(INTERACTIONS_COLLECTION).doc();

  const interaction = {
    id: docRef.id,
    userId,
    placeId,
    actionType,
    score:     ACTION_SCORES[actionType],
    metadata:  metadata ?? null,
    createdAt: new Date().toISOString(),
  };

  // Persist the interaction first so it's never lost even if intelligence update fails.
  await docRef.set(interaction);

  // Resolve the place type, then update the user's persistent intelligence
  // and session queue concurrently.  Both are side-effects — neither blocks
  // the caller's response and neither can roll back the interaction write.
  const { catalogueId, type } = await resolvePlaceInfo(placeId);
  const effectivePlaceId = catalogueId ?? placeId;

  await Promise.all([
    updateUserIntelligence(userId, type, effectivePlaceId, actionType),
    updateSession(userId, { placeId: effectivePlaceId, type, actionType }),
  ]);

  // Fire-and-forget: check if a model retrain is due.
  // Never awaited — failures are warned but never surface to the caller.
  maybeRetrain().catch((err) =>
    console.warn(`[interaction] retrainModel check failed: ${err.message}`)
  );

  return interaction;
};

/**
 * Fetch the most recent interactions for a given user.
 *
 * @param {string} userId - uid from the verified Firebase token
 * @param {number} [limit=50] - maximum number of records to return
 * @returns {Promise<object[]>} array of interaction documents, newest first
 */
export const getInteractionsByUser = async (userId, limit = 50) => {
  const snapshot = await db
    .collection(INTERACTIONS_COLLECTION)
    .where("userId", "==", userId)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => doc.data());
};
