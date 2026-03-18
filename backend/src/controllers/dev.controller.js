/**
 * dev.controller.js — Development-only admin tools.
 *
 * These handlers are ONLY mounted when NODE_ENV !== "production".
 * The route guard is enforced in dev.routes.js so even if this controller
 * were accidentally imported in production no data would be mutated.
 */

import { seedPlacesIfEmpty, getAllPlaces } from "../services/place.service.js";
import { SEED_PLACES } from "../data/places.seed.js";

/**
 * POST /api/dev/seed-places
 *
 * Calls seedPlacesIfEmpty() with the canonical seed dataset.
 * Returns how many documents were inserted (or 0 if skipped).
 *
 * Responses:
 *   200 { success: true,  data: { inserted, skipped, existing? }, message }
 *   500 forwarded to the global error handler
 *
 * @type {import("express").RequestHandler}
 */
export const seedPlacesHandler = async (req, res, next) => {
  try {
    const result = await seedPlacesIfEmpty(SEED_PLACES);

    const message = result.skipped
      ? `Seed skipped — collection already has ${result.existing} place(s)`
      : `Seeded ${result.inserted} place(s) successfully`;

    return res.status(200).json({
      success: true,
      data:    result,
      message,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/dev/places
 *
 * Returns all places currently in Firestore (or from cache).
 * Useful for inspecting the seed result without opening the Firebase Console.
 *
 * @type {import("express").RequestHandler}
 */
export const listPlacesHandler = async (req, res, next) => {
  try {
    const places = await getAllPlaces();

    return res.status(200).json({
      success: true,
      data:    places,
      message: `${places.length} place(s) found`,
    });
  } catch (error) {
    next(error);
  }
};
