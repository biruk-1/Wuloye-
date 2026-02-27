/**
 * routes/health.js — Health check route
 *
 * GET /api/health
 * Used by load balancers, Docker health checks, and uptime monitors
 * to verify the service is alive and responding.
 */

import { Router } from "express";
import { getHealth } from "../controllers/healthController.js";

const router = Router();

router.get("/", getHealth);

export default router;
