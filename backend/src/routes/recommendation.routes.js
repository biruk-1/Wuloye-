/**
 * recommendation.routes.js — Route definitions for the recommendations resource.
 *
 * All routes require a valid Firebase ID token via the authenticate middleware.
 * Mounted at /api/recommendations in app.js.
 */

import { Router } from "express";

import { authenticate } from "../middleware/auth.middleware.js";
import { getRecommendationsHandler } from "../controllers/recommendation.controller.js";
import { authLimiter } from "../middleware/rateLimiter.js";

const router = Router();

// GET /api/recommendations  — personalised ranked place list
router.get("/", authLimiter, authenticate, getRecommendationsHandler);

export default router;
