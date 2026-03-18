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
 */

import { db } from "../config/firebase.js";

const INTERACTIONS_COLLECTION = "interactions";

/** Allowed actionType values and their corresponding scores. */
export const ACTION_SCORES = Object.freeze({
  view: 1,
  click: 2,
  save: 3,
  dismiss: -1,
});

/**
 * Persist a new interaction document.
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
    score: ACTION_SCORES[actionType],
    metadata: metadata ?? null,
    createdAt: new Date().toISOString(),
  };

  await docRef.set(interaction);
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
