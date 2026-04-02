/**
 * middleware/metrics.js — Phase 18 in-process monitoring counters
 *
 * Tracks per-request totals and a sliding latency window with no external
 * dependencies.  All data is stored in-memory and is intentionally ephemeral
 * (resets on restart) — suitable for a single-instance dev/staging setup.
 *
 * To upgrade to production-grade observability:
 *   - Swap the in-memory store for prom-client (Prometheus) or hot-shots (StatsD).
 *   - Set up a Grafana / Datadog dashboard to query the metrics endpoint.
 *
 * Exports:
 *   metricsMiddleware   — Express middleware, records latency + status bucket.
 *   getMetrics()        — Returns a snapshot of the current counters.
 *   recordsMetricsPeriodically(intervalMs) — Logs counters to winston every N ms.
 *
 * Endpoint:
 *   GET /api/health/metrics  (mounted in health.js, dev-only recommended)
 */

import { logger } from "../utils/logger.js";

// ─── In-memory store ──────────────────────────────────────────────────────────

const store = {
  requestCount: 0,
  errorCount4xx: 0,
  errorCount5xx: 0,
  latencies: [],      // rolling window of last 1000 response times (ms)
};

const LATENCY_WINDOW = 1000; // keep last N samples

// ─── Percentile helper ────────────────────────────────────────────────────────

const percentile = (arr, p) => {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx    = Math.floor((p / 100) * sorted.length);
  return sorted[Math.min(idx, sorted.length - 1)];
};

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Express middleware that records:
 *   - total request count
 *   - 4xx / 5xx error counts
 *   - response latency (used for p50 / p95 estimates)
 */
export const metricsMiddleware = (req, res, next) => {
  const startMs = Date.now();

  res.on("finish", () => {
    store.requestCount += 1;

    const latencyMs = Date.now() - startMs;
    store.latencies.push(latencyMs);
    if (store.latencies.length > LATENCY_WINDOW) store.latencies.shift();

    if (res.statusCode >= 500) store.errorCount5xx += 1;
    else if (res.statusCode >= 400) store.errorCount4xx += 1;
  });

  next();
};

// ─── Snapshot ─────────────────────────────────────────────────────────────────

/**
 * Returns the current metrics snapshot.
 * Called by the GET /api/health/metrics handler.
 *
 * @returns {{ requestCount, errorCount4xx, errorCount5xx, p50Ms, p95Ms }}
 */
export const getMetrics = () => ({
  requestCount:  store.requestCount,
  errorCount4xx: store.errorCount4xx,
  errorCount5xx: store.errorCount5xx,
  p50Ms:         percentile(store.latencies, 50),
  p95Ms:         percentile(store.latencies, 95),
  sampleCount:   store.latencies.length,
});

// ─── Periodic logger ──────────────────────────────────────────────────────────

/**
 * Logs a metrics summary to winston every `intervalMs` milliseconds.
 * Called once in server.js after app.listen().
 *
 * @param {number} intervalMs — default 60 000 (60 s)
 */
export const recordsMetricsPeriodically = (intervalMs = 60_000) => {
  setInterval(() => {
    logger.info("[metrics]", getMetrics());
  }, intervalMs).unref(); // unref() so the timer doesn't keep the process alive during tests
};
