/**
 * app.js — Express application factory
 *
 * Responsibility: configure middleware, mount routes, and attach error handlers.
 * Does NOT call app.listen() — that responsibility belongs to server.js.
 */

import express from "express";
import cors from "cors";

import healthRouter from "./routes/health.js";
import userRouter from "./routes/user.routes.js";
import routineRouter from "./routes/routine.routes.js";
import interactionRouter from "./routes/interaction.routes.js";
import recommendationRouter from "./routes/recommendation.routes.js";
import devRouter from "./routes/dev.routes.js";
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

// User routes — provides /api/profile and (future) /api/users/* endpoints.
// Mounted at /api so the router controls the full path for each resource.
app.use("/api", userRouter);

// Routine routes — full CRUD under /api/routines
app.use("/api/routines", routineRouter);

// Interaction routes — data collection for AI recommendations under /api/interactions
app.use("/api/interactions", interactionRouter);

// Recommendation routes — personalised ranked place list under /api/recommendations
app.use("/api/recommendations", recommendationRouter);

// Dev routes — seeding and inspection tools, only active outside production
if (process.env.NODE_ENV !== "production") {
  app.use("/api/dev", devRouter);
  console.log("[app] Dev routes mounted at /api/dev (NODE_ENV:", process.env.NODE_ENV ?? "development", ")");
}

// ─── Error Handlers (must be registered last) ────────────────────────────────

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
