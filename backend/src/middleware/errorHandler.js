/**
 * middleware/errorHandler.js — Centralised error handling
 *
 * Two middleware functions are exported:
 *
 *   1. notFoundHandler  — catches requests that matched no route (404)
 *   2. errorHandler     — catches all errors thrown/passed via next(err)
 *
 * Both must be registered AFTER all routes in app.js.
 *
 * All error responses follow the project-wide JSON envelope:
 *   { success: false, data: null, message: string }
 */

/**
 * 404 — Route not found
 * @type {import("express").RequestHandler}
 */
export const notFoundHandler = (req, res, _next) => {
  res.status(404).json({
    success: false,
    data: null,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};

/**
 * Global error handler
 *
 * Express identifies this as an error-handling middleware because it
 * accepts four parameters (err, req, res, next).
 *
 * Attaching a statusCode (or status) property to any thrown Error lets
 * the caller control the HTTP response code:
 *   const err = new Error("Not allowed");
 *   err.statusCode = 403;
 *   next(err);
 *
 * @type {import("express").ErrorRequestHandler}
 */
export const errorHandler = (err, req, res, _next) => {
  // Respect an explicit HTTP status attached to the error, fall back to 500
  const statusCode = err.statusCode ?? err.status ?? 500;

  // Log the full error in non-production environments for easier debugging
  if (process.env.NODE_ENV !== "production") {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  } else {
    // In production only log the message to avoid leaking stack traces to logs
    console.error(`[error] ${req.method} ${req.originalUrl} — ${err.message}`);
  }

  res.status(statusCode).json({
    success: false,
    data: null,
    message: err.message ?? "Internal Server Error",
    // Stack traces are only included during development to aid debugging
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
};
