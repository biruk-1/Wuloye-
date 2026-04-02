/**
 * middleware/requestLogger.js — Phase 18 HTTP access log (morgan → winston)
 *
 * Morgan writes one line per HTTP request.  The custom `stream` redirects
 * all output to the shared winston logger at the "http" level so that every
 * log entry (request + application) goes through the same pipeline and can
 * be shipped to log aggregators without mixing stdout formats.
 *
 * Mount BEFORE routes in app.js.
 */

import morgan from "morgan";
import { logger } from "../utils/logger.js";

const stream = { write: (msg) => logger.http(msg.trim()) };

/**
 * Logs: METHOD URL STATUS content-length - response-time ms
 * Example: GET /api/recommendations 200 1234 - 45.2 ms
 */
export const requestLogger = morgan(
  ":method :url :status :res[content-length] - :response-time ms",
  { stream }
);
