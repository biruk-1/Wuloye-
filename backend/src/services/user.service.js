/**
 * services/user.service.js — User profile data layer
 *
 * Responsibility: all Firestore read/write operations for the users collection.
 * Controllers must never touch Firestore directly — every query lives here.
 *
 * Firestore structure:
 *   Collection : users
 *   Document ID: uid  (Firebase Authentication UID)
 *
 *   Fields:
 *     uid       {string}  — Firebase Auth UID
 *     email     {string|null}  — user's email address
 *     name      {string|null}  — display name from the ID token (if set)
 *     createdAt {string}  — ISO 8601 timestamp of first login
 */

import { db } from "../config/firebase.js";

/** Firestore collection name — single source of truth */
const USERS_COLLECTION = "users";

/**
 * Finds an existing user document or creates one on first login.
 *
 * Called every time a verified user hits GET /api/profile.
 * Uses the decoded Firebase ID token as the authoritative source of identity.
 *
 * @param {import("firebase-admin").auth.DecodedIdToken} decodedToken
 *   The verified token payload attached to req.user by auth.middleware.js
 *
 * @returns {Promise<{uid: string, email: string|null, name: string|null, createdAt: string}>}
 *   The persisted user document (existing or freshly created)
 */
export const findOrCreateUser = async (decodedToken) => {
  const { uid, email, name } = decodedToken;

  // Reference to the user's document (keyed by Firebase UID)
  const userRef = db.collection(USERS_COLLECTION).doc(uid);
  const userSnap = await userRef.get();

  // --- Returning user: document already exists ---
  if (userSnap.exists) {
    return userSnap.data();
  }

  // --- First login: create the user document ---
  const newUser = {
    uid,
    email: email ?? null,
    // name is only present in the token if the user set a display name in Firebase Auth
    name: name ?? null,
    createdAt: new Date().toISOString(),
  };

  // set() creates the document (or overwrites — safe here because we checked existence above)
  await userRef.set(newUser);

  return newUser;
};

/**
 * Retrieves a user document by UID.
 *
 * Useful for admin lookups or future inter-service calls.
 *
 * @param {string} uid
 * @returns {Promise<{uid: string, email: string|null, name: string|null, createdAt: string} | null>}
 *   The user object, or null if no document exists for that UID
 */
export const getUserById = async (uid) => {
  const userSnap = await db.collection(USERS_COLLECTION).doc(uid).get();

  if (!userSnap.exists) {
    return null;
  }

  return userSnap.data();
};

/**
 * Updates mutable profile fields for an existing user.
 *
 * Only the keys present in `updates` are written — Firestore's update()
 * performs a partial merge so untouched fields (uid, email, createdAt, etc.)
 * are preserved.
 *
 * Allowed mutable fields:
 *   name               {string}    — display name
 *   interests          {string[]}  — list of activity/interest tags
 *   budgetRange        {string}    — e.g. "low" | "medium" | "high"
 *   locationPreference {string}    — e.g. "indoor" | "outdoor" | "any"
 *
 * @param {string} uid     — Firebase Auth UID (from verified token, never from body)
 * @param {object} updates — validated fields to merge
 *
 * @returns {Promise<object>} The full updated user document
 *
 * @throws {Error} if the user document does not exist
 */
export const updateUserProfile = async (uid, updates) => {
  const userRef  = db.collection(USERS_COLLECTION).doc(uid);
  const userSnap = await userRef.get();

  if (!userSnap.exists) {
    const err = new Error("User profile not found");
    err.statusCode = 404;
    throw err;
  }

  // Merge only the supplied keys — system fields are never overwritten.
  await userRef.update({ ...updates, updatedAt: new Date().toISOString() });

  const updated = await userRef.get();
  return updated.data();
};
