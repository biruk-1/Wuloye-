/**
 * controllers/healthController.js — Health check controllers (Phase 18)
 *
 * getHealth       — liveness + readiness check (async Firestore probe)
 * getMetricsHandler — in-process performance counters snapshot
 */

import { getHealthStatus } from "../services/healthService.js";
import { getMetrics }      from "../middleware/metrics.js";

/**
 * GET /api/health
 *
 * Returns the standard { success, data, message } envelope.
 * HTTP 200 when Firestore is reachable, 503 when degraded.
 */
export const getHealth = async (_req, res, next) => {
  try {
    const data = await getHealthStatus();
    const ok   = data.status === "ok";
    res.status(ok ? 200 : 503).json({
      success: ok,
      data,
      message: ok ? "Service is healthy" : "Service is degraded — check dependencies",
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/health/metrics
 *
 * Returns in-process performance counters (request count, error rates, latency).
 * Intended for dev/ops use; consider protecting with auth in production.
 */
export const getMetricsHandler = (_req, res) => {
  res.status(200).json({
    success: true,
    data:    getMetrics(),
    message: "Metrics snapshot",
  });
};
