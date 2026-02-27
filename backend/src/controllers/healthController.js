/**
 * controllers/healthController.js — Health check controller
 *
 * Thin controller: validates / transforms the request then delegates
 * to the service layer. For health checks there is no business logic,
 * so the service call is trivial — but the pattern is established for
 * future controllers.
 */

import { getHealthStatus } from "../services/healthService.js";

/**
 * GET /api/health
 */
export const getHealth = (_req, res) => {
  const payload = getHealthStatus();
  res.status(200).json(payload);
};
