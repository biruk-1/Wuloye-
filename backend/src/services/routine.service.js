/**
 * services/routine.service.js — Routine data layer
 *
 * Responsibility: all Firestore read/write operations for the routines
 * collection. Controllers must never touch Firestore directly — every
 * query lives here.
 *
 * Firestore structure:
 *   Collection : routines
 *   Document ID: auto-generated
 *
 *   Fields:
 *     id                 {string}  — copy of the auto-generated document ID
 *     userId             {string}  — Firebase UID of the owning user
 *     weekday            {string}  — e.g. "Monday", "Tuesday"
 *     timeOfDay          {string}  — e.g. "morning", "afternoon", "evening"
 *     activityType       {string}  — e.g. "gym", "coffee", "walk"
 *     locationPreference {string}  — e.g. "indoor", "outdoor", "any"
 *     budgetRange        {string}  — e.g. "low", "medium", "high"
 *     createdAt          {string}  — ISO 8601 creation timestamp
 *     updatedAt          {string}  — ISO 8601 last-update timestamp
 */

import { db } from "../config/firebase.js";

/** Firestore collection name — single source of truth */
const ROUTINES_COLLECTION = "routines";

/**
 * Creates a new routine document for the authenticated user.
 *
 * Uses db.doc() to let Firestore generate the document ID, then stores
 * that ID back into the document so callers never have to manage separate
 * ID references.
 *
 * @param {string} userId — Firebase UID from req.user
 * @param {{
 *   weekday: string,
 *   timeOfDay: string,
 *   activityType: string,
 *   locationPreference: string,
 *   budgetRange: string
 * }} data — validated routine fields from request body
 *
 * @returns {Promise<object>} The newly created routine document
 */
export const createRoutine = async (userId, data) => {
  // Let Firestore generate a unique document ID
  const docRef = db.collection(ROUTINES_COLLECTION).doc();
  const now = new Date().toISOString();

  const routine = {
    id: docRef.id,           // store the auto-generated ID inside the doc
    userId,                  // ownership — always from auth, never from request body
    weekday: data.weekday,
    timeOfDay: data.timeOfDay,
    activityType: data.activityType,
    locationPreference: data.locationPreference,
    budgetRange: data.budgetRange,
    createdAt: now,
    updatedAt: now,
  };

  await docRef.set(routine);
  return routine;
};

/**
 * Returns all routines belonging to a user, newest first.
 *
 * NOTE: Firestore requires a composite index for (userId ASC, createdAt DESC).
 * If the index does not exist yet, the first request will return an error
 * containing a direct link to create it in the Firebase Console.
 *
 * @param {string} userId
 * @returns {Promise<object[]>} Array of routine documents (may be empty)
 */
export const getRoutinesByUser = async (userId) => {
  const snapshot = await db
    .collection(ROUTINES_COLLECTION)
    .where("userId", "==", userId)
    .orderBy("createdAt", "desc")
    .get();

  // Map each document snapshot to its data object
  return snapshot.docs.map((doc) => doc.data());
};

/**
 * Retrieves a single routine by document ID.
 *
 * Returns null when the document does not exist so the controller can
 * issue a clean 404 without relying on thrown exceptions for flow control.
 *
 * @param {string} id — Firestore document ID
 * @returns {Promise<object|null>}
 */
export const getRoutineById = async (id) => {
  const docSnap = await db.collection(ROUTINES_COLLECTION).doc(id).get();

  if (!docSnap.exists) return null;

  return docSnap.data();
};

/**
 * Updates the mutable fields of an existing routine.
 *
 * Only the fields listed in `updates` are written — Firestore's update()
 * performs a partial merge, so untouched fields are preserved.
 * updatedAt is always refreshed regardless of which fields changed.
 *
 * @param {string} id — Document ID of the routine to update
 * @param {{
 *   weekday?: string,
 *   timeOfDay?: string,
 *   activityType?: string,
 *   locationPreference?: string,
 *   budgetRange?: string
 * }} updates — Only allowed mutable fields (validated by the controller)
 *
 * @returns {Promise<object>} The full updated routine document
 */
export const updateRoutine = async (id, updates) => {
  const docRef = db.collection(ROUTINES_COLLECTION).doc(id);

  const changes = {
    ...updates,
    updatedAt: new Date().toISOString(), // always stamp the update time
  };

  // update() merges — only listed keys are overwritten
  await docRef.update(changes);

  // Return the full document so the controller can send it back to the client
  const updatedSnap = await docRef.get();
  return updatedSnap.data();
};

/**
 * Permanently deletes a routine document.
 *
 * Ownership verification is done by the controller before calling this.
 *
 * @param {string} id — Document ID of the routine to delete
 * @returns {Promise<void>}
 */
export const deleteRoutine = async (id) => {
  await db.collection(ROUTINES_COLLECTION).doc(id).delete();
};
