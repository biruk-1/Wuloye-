/**
 * utils/logger.js — Phase 18 structured logger (winston)
 *
 * Env:
 *   NODE_ENV   — "production" → JSON output; anything else → pretty colorized output.
 *   LOG_LEVEL  — override level (default "info" in production, "debug" in dev).
 *   LOG_FILE   — "true" → also write logs to logs/error.log + logs/combined.log.
 *
 * Usage:
 *   import { logger } from "../utils/logger.js";
 *   logger.info("message", { key: "value" });
 *   logger.warn("..."); logger.error("...", err); logger.debug("...");
 */

import { createLogger, format, transports } from "winston";
import { fileURLToPath } from "url";
import path from "path";

const isProduction = process.env.NODE_ENV === "production";

const LOG_LEVEL = process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug");

// ─── Formats ─────────────────────────────────────────────────────────────────

const productionFormat = format.combine(
  format.timestamp(),
  format.errors({ stack: true }),
  format.json()
);

const developmentFormat = format.combine(
  format.timestamp({ format: "HH:mm:ss" }),
  format.errors({ stack: true }),
  format.colorize(),
  format.printf(({ timestamp, level, message, stack, ...rest }) => {
    const extra = Object.keys(rest).length ? " " + JSON.stringify(rest) : "";
    return `${timestamp} ${level}: ${message}${stack ? "\n" + stack : ""}${extra}`;
  })
);

// ─── Transports ───────────────────────────────────────────────────────────────

const activeTransports = [new transports.Console()];

if (process.env.LOG_FILE === "true") {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname  = path.dirname(__filename);
  const logsDir   = path.join(__dirname, "..", "..", "logs");

  activeTransports.push(
    new transports.File({
      filename: path.join(logsDir, "error.log"),
      level:    "error",
    }),
    new transports.File({
      filename: path.join(logsDir, "combined.log"),
    })
  );
}

// ─── Logger instance ─────────────────────────────────────────────────────────

export const logger = createLogger({
  level:      LOG_LEVEL,
  format:     isProduction ? productionFormat : developmentFormat,
  transports: activeTransports,
});

// Add "http" level (between verbose and info) for morgan request logs.
logger.http = (msg) => logger.log("http", msg);
