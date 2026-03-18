/**
 * recommendation.controller.js — HTTP handler for GET /api/recommendations.
 *
 * Responsibility: parse the request, delegate to the recommendation service,
 * and return a consistent JSON envelope.
 *
 * Supports optional query parameter:
 *   ?debug=true  — includes scoreBreakdown on each result for inspection.
 *
 * No Firestore logic lives here. The service layer owns all data access and
 * scoring. The controller only handles HTTP concerns.
 */

import { getRecommendations } from "../services/recommendation.service.js";

/**
 * GET /api/recommendations[?debug=true]
 *
 * Returns a ranked, diverse list of up to 10 places personalised for the
 * authenticated user based on their profile, routines, and past interactions.
 *
 * Query params:
 *   debug {string} — pass "true" to include per-rule scoreBreakdown on results
 *
 * Error cases:
 *   404 — user profile document does not exist in Firestore
 *   500 — unexpected error (caught by errorHandler.js)
 *
 * @type {import("express").RequestHandler}
 */
export const getRecommendationsHandler = async (req, res, next) => {
  try {
    // Parse debug flag from query string — only "true" (string) enables it.
    const debug = req.query.debug === "true";

    const { recommendations, meta } = await getRecommendations(req.user.uid, debug);

    return res.status(200).json({
      success: true,
      data: recommendations,
      message: "Recommendations generated successfully",
      meta,
    });
  } catch (error) {
    next(error);
  }
};
