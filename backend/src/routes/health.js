/**
 * routes/health.js — Health check routes
 *
 * GET /api/health         — liveness + readiness check (Phase 18: Firestore ping)
 * GET /api/health/metrics — in-process performance counters (Phase 18, dev-only recommended)
 */

import { Router } from "express";
import { getHealth } from "../controllers/healthController.js";
import { getMetricsHandler } from "../controllers/healthController.js";

const router = Router();

router.get("/", getHealth);
router.get("/metrics", getMetricsHandler);

export default router;
