/**
 * routes/routine.routes.js — Routine CRUD routes
 *
 * Mounted in app.js at /api/routines so the routes below produce:
 *
 *   POST   /api/routines        → create a routine for the current user
 *   GET    /api/routines        → list all routines for the current user
 *   GET    /api/routines/:id    → get one routine (owner only)
 *   PUT    /api/routines/:id    → update a routine (owner only)
 *   DELETE /api/routines/:id    → delete a routine (owner only)
 *
 * Every route is protected by the authenticate middleware. Unauthenticated
 * requests are rejected with 401 before reaching any controller.
 */

import { Router } from "express";

import { authenticate } from "../middleware/auth.middleware.js";
import {
  createRoutineHandler,
  getRoutinesHandler,
  getRoutineHandler,
  updateRoutineHandler,
  deleteRoutineHandler,
} from "../controllers/routine.controller.js";
import { authLimiter } from "../middleware/rateLimiter.js";

const router = Router();

// ─── Collection routes (/api/routines) ───────────────────────────────────────

/**
 * POST /api/routines
 * Create a new routine for the authenticated user.
 * Body: { weekday, timeOfDay, activityType, locationPreference, budgetRange }
 */
router.post("/", authLimiter, authenticate, createRoutineHandler);

/**
 * GET /api/routines
 * Return all routines owned by the authenticated user, sorted newest first.
 */
router.get("/", authLimiter, authenticate, getRoutinesHandler);

// ─── Document routes (/api/routines/:id) ─────────────────────────────────────

/**
 * GET /api/routines/:id
 * Return a single routine. 404 if missing, 403 if not the owner.
 */
router.get("/:id", authLimiter, authenticate, getRoutineHandler);

/**
 * PUT /api/routines/:id
 * Update mutable fields of a routine. 404 if missing, 403 if not the owner.
 * Allowed body fields: weekday, timeOfDay, activityType, locationPreference, budgetRange
 */
router.put("/:id", authLimiter, authenticate, updateRoutineHandler);

/**
 * DELETE /api/routines/:id
 * Permanently delete a routine. 404 if missing, 403 if not the owner.
 */
router.delete("/:id", authLimiter, authenticate, deleteRoutineHandler);

export default router;
