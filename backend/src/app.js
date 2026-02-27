/**
 * app.js — Express application factory
 *
 * Responsibility: configure middleware, mount routes, and attach error handlers.
 * Does NOT call app.listen() — that responsibility belongs to server.js.
 */

import express from "express";
import cors from "cors";

import healthRouter from "./routes/health.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";

const app = express();

// ─── Global Middleware ────────────────────────────────────────────────────────

// Parse incoming JSON request bodies
app.use(express.json());

// Parse URL-encoded bodies (form submissions)
app.use(express.urlencoded({ extended: true }));

// CORS — origins are controlled via the ALLOWED_ORIGINS environment variable
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, Postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS policy: origin ${origin} is not allowed`));
    },
    credentials: true,
  })
);

// ─── Routes ──────────────────────────────────────────────────────────────────

app.use("/api/health", healthRouter);

// Additional feature routers will be mounted here in future sprints:
// app.use("/api/users",   userRouter);
// app.use("/api/auth",    authRouter);

// ─── Error Handlers (must be registered last) ────────────────────────────────

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
