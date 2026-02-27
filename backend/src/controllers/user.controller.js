/**
 * controllers/user.controller.js — User profile controller
 *
 * Responsibility: handle HTTP request/response concerns for user routes.
 * No Firestore logic lives here — all data operations are delegated to
 * user.service.js. Controllers only orchestrate and respond.
 */

import { findOrCreateUser } from "../services/user.service.js";

/**
 * GET /api/profile
 *
 * Returns the authenticated user's profile document.
 * If the user has never logged in before, their document is created
 * automatically using the data from their Firebase ID token.
 *
 * Requires: authenticate middleware (req.user must be populated)
 *
 * Responses:
 *   200 — { success: true, data: { uid, email, name, createdAt }, message }
 *   500 — forwarded to the global error handler via next(error)
 *
 * @type {import("express").RequestHandler}
 */
export const getProfile = async (req, res, next) => {
  try {
    // req.user is the decoded Firebase ID token set by auth.middleware.js
    const user = await findOrCreateUser(req.user);

    return res.status(200).json({
      success: true,
      data: user,
      message: "Profile retrieved successfully",
    });
  } catch (error) {
    // Delegate to the centralised error handler in errorHandler.js
    next(error);
  }
};
