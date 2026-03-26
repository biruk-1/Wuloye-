/**
 * session.service.js — Short-term session memory layer (Phase 8).
 *
 * Tracks the last SESSION_MAX_ACTIONS user interactions in a dedicated
 * Firestore "sessions" collection so the recommendation engine can react
 * immediately to behaviour happening within the current session.
 *
 * Session document (keyed by userId):
 *   recentActions: Array<{
 *     placeId:    string,
 *     type:       string,       — resolved place type
 *     actionType: string,       — "view" | "click" | "save" | "dismiss"
 *     timestamp:  number,       — ms since epoch, newest first
 *   }>,
 *   updatedAt: number
 *
 * Design notes:
 *   - FIFO queue: newest action is prepended; array is trimmed to max length.
 *   - updateSession() is called as a side-effect of createInteraction() so
 *     every write to "interactions" also advances the session.
 *   - getSession() returns a safe default when no session document exists yet
 *     (cold-start path).
 */

import { db } from "../config/firebase.js";

const SESSION_COLLECTION  = "sessions";

/** Maximum number of recent actions kept per user session. */
export const SESSION_MAX_ACTIONS = 10;

/**
 * Minimum number of session actions required for the session intent to
 * override the long-term detectedIntent from Phase 7.
 */
export const SESSION_INTENT_OVERRIDE_MIN = 2;

// ─── Type → Session Intent Map ────────────────────────────────────────────────

/**
 * Maps a place type to a session-level intent label.
 * Types not listed fall back to "explore".
 */
export const SESSION_TYPE_INTENT_MAP = Object.freeze({
  gym:        "fitness",
  yoga:       "relax",
  coffee:     "social",
  cafe:       "social",
  restaurant: "social",
  social:     "social",
  park:       "explore",
  outdoor:    "explore",
  walk:       "explore",
});

// ─── Sequence boost map ───────────────────────────────────────────────────────

/**
 * Defines what place types are likely NEXT after a given type in a session.
 * Used by Rule 20 (sequenceBoost) to reward the predicted next step.
 *
 * Designed around the seed catalogue types:
 *   gym, yoga, coffee, restaurant, social, outdoor, walk, park
 */
export const SEQUENCE_BOOST_MAP = Object.freeze({
  gym:        new Set(["coffee", "yoga"]),
  yoga:       new Set(["coffee", "social"]),
  coffee:     new Set(["social", "outdoor"]),
  restaurant: new Set(["outdoor", "social"]),
  social:     new Set(["outdoor", "coffee"]),
  outdoor:    new Set(["social", "coffee"]),
  walk:       new Set(["coffee", "social"]),
  park:       new Set(["social", "outdoor"]),
});

// ─── Core session helpers ─────────────────────────────────────────────────────

/**
 * Fetches the current session document for a user.
 * Returns a default empty session if the document does not yet exist.
 *
 * @param {string} userId
 * @returns {Promise<{ recentActions: object[], updatedAt: number|null }>}
 */
export const getSession = async (userId) => {
  try {
    const snap = await db.collection(SESSION_COLLECTION).doc(userId).get();
    return snap.exists
      ? snap.data()
      : { recentActions: [], updatedAt: null };
  } catch {
    return { recentActions: [], updatedAt: null };
  }
};

/**
 * Pushes a new action to the front of the session queue (newest-first)
 * and trims the array to SESSION_MAX_ACTIONS entries.
 *
 * Called as a side-effect of createInteraction() — must not throw so the
 * interaction write is never blocked or rolled back by session failures.
 *
 * @param {string} userId
 * @param {{ placeId: string, type: string|null, actionType: string }} action
 */
export const updateSession = async (userId, action) => {
  try {
    const ref  = db.collection(SESSION_COLLECTION).doc(userId);
    const snap = await ref.get();
    const prev = snap.exists ? (snap.data().recentActions ?? []) : [];

    const next = [
      { placeId: action.placeId, type: action.type ?? "unknown", actionType: action.actionType, timestamp: Date.now() },
      ...prev,
    ].slice(0, SESSION_MAX_ACTIONS);

    await ref.set({ recentActions: next, updatedAt: Date.now() }, { merge: false });
  } catch (err) {
    // Non-fatal: log and continue so the caller's response is unaffected.
    console.warn(`[session] updateSession failed for uid=${userId}: ${err.message}`);
  }
};

// ─── Derived session signals ──────────────────────────────────────────────────

/**
 * Returns the most frequently occurring place type in a session action list.
 * Ties broken by the type that appears first (most recent).
 *
 * @param {object[]} recentActions
 * @returns {string|null}
 */
export const computeDominantSessionType = (recentActions) => {
  if (!recentActions || recentActions.length === 0) return null;

  const counts = new Map();
  for (const action of recentActions) {
    if (!action.type || action.type === "unknown") continue;
    counts.set(action.type, (counts.get(action.type) ?? 0) + 1);
  }
  if (counts.size === 0) return null;

  let dominant = null;
  let max = 0;
  for (const [type, count] of counts.entries()) {
    if (count > max) { max = count; dominant = type; }
  }
  return dominant;
};

/**
 * Maps a dominant place type to a session intent label.
 * Falls back to "explore" for null or unknown types.
 *
 * @param {string|null} dominantType
 * @returns {"fitness"|"social"|"relax"|"explore"}
 */
export const computeSessionIntent = (dominantType) => {
  if (!dominantType) return "explore";
  return SESSION_TYPE_INTENT_MAP[dominantType] ?? "explore";
};
