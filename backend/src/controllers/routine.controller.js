/**
 * controllers/routine.controller.js — Routine CRUD controller
 *
 * Responsibility: handle HTTP request/response concerns for routine routes.
 * No Firestore logic lives here — all data operations are delegated to
 * routine.service.js. Controllers validate input, enforce ownership, and
 * respond with consistent JSON envelopes.
 *
 * JSON response envelope (all routes):
 *   { success: boolean, data: object|null, message: string }
 */

import {
  createRoutine,
  getRoutinesByUser,
  getRoutineById,
  updateRoutine,
  deleteRoutine,
} from "../services/routine.service.js";

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Fields that MUST be present and non-empty when creating a routine.
 * Defined once here so validation and documentation stay in sync.
 */
const REQUIRED_FIELDS = [
  "weekday",
  "timeOfDay",
  "activityType",
  "locationPreference",
  "budgetRange",
];

/**
 * Fields that MAY be updated via PUT /api/routines/:id.
 * Keeping this list explicit prevents clients from overwriting system
 * fields like userId, createdAt, or id.
 */
const UPDATABLE_FIELDS = [
  "weekday",
  "timeOfDay",
  "activityType",
  "locationPreference",
  "budgetRange",
];

/**
 * Validates that all required fields are present, non-empty strings.
 *
 * @param {object} body — req.body
 * @returns {string|null} Error message string, or null if valid
 */
const validateRequiredFields = (body) => {
  const missing = REQUIRED_FIELDS.filter(
    (field) =>
      !body[field] ||
      typeof body[field] !== "string" ||
      body[field].trim() === ""
  );

  if (missing.length > 0) {
    return `Missing or invalid required fields: ${missing.join(", ")}`;
  }

  return null;
};

/**
 * Extracts only the allowed mutable fields from req.body.
 * Unknown or system fields (id, userId, createdAt, etc.) are silently ignored.
 *
 * @param {object} body — req.body
 * @returns {object} Object containing only UPDATABLE_FIELDS keys that were provided
 */
const pickUpdatableFields = (body) => {
  return UPDATABLE_FIELDS.reduce((acc, field) => {
    if (body[field] !== undefined) acc[field] = body[field];
    return acc;
  }, {});
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Creates a new Error with an attached statusCode for use with next(error).
 * The global error handler in errorHandler.js reads err.statusCode.
 *
 * @param {string} message
 * @param {number} statusCode
 */
const createError = (message, statusCode) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * POST /api/routines
 *
 * Creates a new routine for the authenticated user.
 * userId is always taken from the verified token — never from the request body.
 *
 * @type {import("express").RequestHandler}
 */
export const createRoutineHandler = async (req, res, next) => {
  try {
    // Validate all required fields before hitting Firestore
    const validationError = validateRequiredFields(req.body);
    if (validationError) {
      return res.status(400).json({
        success: false,
        data: null,
        message: validationError,
      });
    }

    // Extract only the fields the service layer expects
    const { weekday, timeOfDay, activityType, locationPreference, budgetRange } =
      req.body;

    const routine = await createRoutine(req.user.uid, {
      weekday: weekday.trim(),
      timeOfDay: timeOfDay.trim(),
      activityType: activityType.trim(),
      locationPreference: locationPreference.trim(),
      budgetRange: budgetRange.trim(),
    });

    return res.status(201).json({
      success: true,
      data: routine,
      message: "Routine created successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/routines
 *
 * Returns all routines belonging to the authenticated user, newest first.
 *
 * @type {import("express").RequestHandler}
 */
export const getRoutinesHandler = async (req, res, next) => {
  try {
    const routines = await getRoutinesByUser(req.user.uid);

    return res.status(200).json({
      success: true,
      data: routines,
      message: "Routines retrieved successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/routines/:id
 *
 * Returns a specific routine.
 * Returns 404 if not found, 403 if the routine belongs to another user.
 *
 * @type {import("express").RequestHandler}
 */
export const getRoutineHandler = async (req, res, next) => {
  try {
    const routine = await getRoutineById(req.params.id);

    if (!routine) {
      return next(createError("Routine not found", 404));
    }

    // Ownership check — users must not read other users' routines
    if (routine.userId !== req.user.uid) {
      return next(createError("Forbidden: you do not own this routine", 403));
    }

    return res.status(200).json({
      success: true,
      data: routine,
      message: "Routine retrieved successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/routines/:id
 *
 * Updates the mutable fields of an existing routine owned by the user.
 * Returns 400 if no valid fields were provided, 404 if not found,
 * 403 if not the owner.
 *
 * @type {import("express").RequestHandler}
 */
export const updateRoutineHandler = async (req, res, next) => {
  try {
    // Fetch first to confirm existence and ownership before writing
    const existing = await getRoutineById(req.params.id);

    if (!existing) {
      return next(createError("Routine not found", 404));
    }

    if (existing.userId !== req.user.uid) {
      return next(createError("Forbidden: you do not own this routine", 403));
    }

    // Strip out any fields the client should not be able to set
    const updates = pickUpdatableFields(req.body);

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        data: null,
        message: `No updatable fields provided. Allowed fields: ${UPDATABLE_FIELDS.join(", ")}`,
      });
    }

    const updated = await updateRoutine(req.params.id, updates);

    return res.status(200).json({
      success: true,
      data: updated,
      message: "Routine updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/routines/:id
 *
 * Permanently deletes a routine owned by the authenticated user.
 * Returns 404 if not found, 403 if not the owner.
 *
 * @type {import("express").RequestHandler}
 */
export const deleteRoutineHandler = async (req, res, next) => {
  try {
    const existing = await getRoutineById(req.params.id);

    if (!existing) {
      return next(createError("Routine not found", 404));
    }

    if (existing.userId !== req.user.uid) {
      return next(createError("Forbidden: you do not own this routine", 403));
    }

    await deleteRoutine(req.params.id);

    return res.status(200).json({
      success: true,
      data: null,
      message: "Routine deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
