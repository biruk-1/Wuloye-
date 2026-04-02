/**
 * interaction.routes.js — Route definitions for the interactions resource.
 *
 * All routes are protected by the authenticate middleware, which verifies
 * the Firebase ID token and attaches req.user before the handler runs.
 *
 * Mounted at /api/interactions in app.js.
 */

import { Router } from "express";

import { authenticate } from "../middleware/auth.middleware.js";
import {
  logInteractionHandler,
  logInteractionsBatchHandler,
  getInteractionsHandler,
} from "../controllers/interaction.controller.js";
import { authLimiter } from "../middleware/rateLimiter.js";

const router = Router();

// POST /api/interactions  — log a new interaction
router.post("/", authLimiter, authenticate, logInteractionHandler);

// POST /api/interactions/batch — Phase 15: batch write multiple interactions
router.post("/batch", authLimiter, authenticate, logInteractionsBatchHandler);

// GET  /api/interactions  — fetch the authenticated user's recent interactions
router.get("/", authLimiter, authenticate, getInteractionsHandler);

export default router;
