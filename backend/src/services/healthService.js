/**
 * services/healthService.js — Health check service
 *
 * Business / data layer for the health check feature.
 * In future sprints, database connectivity and dependency checks
 * can be added here without touching the controller.
 */

/**
 * Returns a status object that describes the current health of the service.
 * @returns {{ status: string, timestamp: string, environment: string }}
 */
export const getHealthStatus = () => ({
  status: "Wuloye Backend Running",
  timestamp: new Date().toISOString(),
  environment: process.env.NODE_ENV ?? "development",
});
