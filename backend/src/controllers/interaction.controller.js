/**
 * interaction.controller.js — HTTP handlers for the interactions resource.
 *
 * Responsibility: parse/validate the request, call the service layer,
 * and return a consistent JSON response. No Firestore logic lives here.
 */

import {
  createInteraction,
  getInteractionsByUser,
  ACTION_SCORES,
} from "../services/interaction.service.js";

/** Set of valid actionType strings, derived from the service constants. */
const VALID_ACTION_TYPES = new Set(Object.keys(ACTION_SCORES));

/**
 * Create a typed error with an HTTP status code attached.
 * Follows the same pattern used in routine.controller.js.
 */
const createError = (message, statusCode) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

/**
 * POST /api/interactions
 *
 * Body (JSON):
 *   placeId    {string}  required
 *   actionType {string}  required — "view" | "click" | "save" | "dismiss"
 *   metadata   {object}  optional
 *
 * The userId and score are derived automatically; they are never taken
 * from the request body.
 *
 * @type {import("express").RequestHandler}
 */
export const logInteractionHandler = async (req, res, next) => {
  try {
    const { placeId, actionType, metadata } = req.body;

    // ── Validation ───────────────────────────────────────────────────────────

    if (!placeId || typeof placeId !== "string" || placeId.trim() === "") {
      return next(createError("placeId is required and must be a non-empty string", 400));
    }

    if (!actionType || typeof actionType !== "string") {
      return next(createError("actionType is required", 400));
    }

    if (!VALID_ACTION_TYPES.has(actionType)) {
      return next(
        createError(
          `Invalid actionType "${actionType}". Allowed values: ${[...VALID_ACTION_TYPES].join(", ")}`,
          400
        )
      );
    }

    // metadata must be a plain object if provided
    if (metadata !== undefined && metadata !== null && typeof metadata !== "object") {
      return next(createError("metadata must be an object when provided", 400));
    }

    // ── Service call ─────────────────────────────────────────────────────────

    const interaction = await createInteraction(
      req.user.uid,
      placeId.trim(),
      actionType,
      metadata ?? null
    );

    return res.status(201).json({
      success: true,
      data: interaction,
      message: "Interaction logged successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/interactions
 *
 * Returns the last 50 interactions for the authenticated user,
 * sorted by createdAt descending.
 *
 * @type {import("express").RequestHandler}
 */
export const getInteractionsHandler = async (req, res, next) => {
  try {
    const interactions = await getInteractionsByUser(req.user.uid);

    return res.status(200).json({
      success: true,
      data: interactions,
      message: "Interactions retrieved successfully",
    });
  } catch (error) {
    next(error);
  }
};
