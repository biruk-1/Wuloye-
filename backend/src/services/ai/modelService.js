/**
 * modelService.js — Phase 12 model persistence and inference layer.
 *
 * Storage strategy (dual-write for reliability):
 *   Primary  : Firestore  models/current  — survives server restarts,
 *              shareable across instances, version-tracked.
 *   Backup   : backend/data/model.json     — available when Firestore is
 *              unreachable at cold-start.
 *
 * Lifecycle:
 *   1. initModelCache()   — called once at server startup (app.js).
 *                           Loads from Firestore; falls back to file.
 *                           Populates _cached so predict() is synchronous.
 *   2. saveModel(model)   — async; writes to Firestore + file, then refreshes
 *                           the in-memory cache.  Called by retrainModel.js.
 *   3. predict(features)  — synchronous; uses _cached.  Returns 0 when
 *                           the model has not been trained yet so the
 *                           rule-based engine operates unmodified.
 *
 * Model document schema (both Firestore and model.json):
 *   {
 *     weights:       number[]   — FEATURE_COUNT weight values
 *     bias:          number     — learned intercept
 *     mins:          number[]   — per-dimension min (from training normalization)
 *     maxes:         number[]   — per-dimension max
 *     featureNames:  string[]   — ordered dimension names
 *     version:       string     — "v1", "v2", …
 *     versionNumber: number     — integer for incrementing (1, 2, …)
 *     trainedAt:     string|null — ISO 8601 timestamp
 *     sampleCount:   number
 *     finalLoss:     number|null
 *   }
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { fileURLToPath }                                       from "url";
import { dirname, join }                                       from "path";
import { db }                                                  from "../../config/firebase.js";
import { logger }                                              from "../../utils/logger.js";

// ─── File path (backup) ───────────────────────────────────────────────────────

const __filename  = fileURLToPath(import.meta.url);
const __dirname   = dirname(__filename);
const MODEL_DIR   = join(__dirname, "..", "..", "..", "data");
const MODEL_PATH  = join(MODEL_DIR, "model.json");

// ─── Firestore path ───────────────────────────────────────────────────────────

const MODELS_COLLECTION  = "models";
const CURRENT_MODEL_DOCID = "current";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true when a model document contains trained weights. */
const isModelTrained = (model) =>
  Array.isArray(model?.weights) && model.weights.length > 0;

/** Schema returned before any training run has completed. */
const DEFAULT_MODEL = Object.freeze({
  weights:       [],
  bias:          0,
  mins:          [],
  maxes:         [],
  featureNames:  [],
  version:       "v1",
  versionNumber: 0,
  trainedAt:     null,
  sampleCount:   0,
  finalLoss:     null,
});

// ─── In-memory cache ──────────────────────────────────────────────────────────

let _cached = null;

// ─── File helpers ─────────────────────────────────────────────────────────────

const loadModelFromFile = () => {
  if (!existsSync(MODEL_PATH)) return null;
  try {
    return JSON.parse(readFileSync(MODEL_PATH, "utf8"));
  } catch {
    return null;
  }
};

const saveModelToFile = (model) => {
  try {
    if (!existsSync(MODEL_DIR)) mkdirSync(MODEL_DIR, { recursive: true });
    writeFileSync(MODEL_PATH, JSON.stringify(model, null, 2), "utf8");
  } catch (err) {
    logger.warn(`[modelService] file backup failed: ${err.message}`);
  }
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Bootstraps the in-memory model cache at server startup.
 *
 * Tries Firestore first; falls back to model.json if Firestore is unavailable.
 * Must be called (and awaited) before the server begins serving requests.
 *
 * @returns {Promise<void>}
 */
export const initModelCache = async () => {
  try {
    const snap = await db.collection(MODELS_COLLECTION).doc(CURRENT_MODEL_DOCID).get();
    if (snap.exists && isModelTrained(snap.data())) {
      _cached = snap.data();
      logger.info(
        `[modelService] init — loaded ${_cached.version} from Firestore ` +
        `(${_cached.sampleCount} samples, trained ${_cached.trainedAt})`
      );
      return;
    }
  } catch (err) {
    logger.warn(`[modelService] Firestore init failed: ${err.message} — trying file backup`);
  }

  // Fall back to file.
  const fileModel = loadModelFromFile();
  if (fileModel && isModelTrained(fileModel)) {
    _cached = fileModel;
    logger.info(
      `[modelService] init — loaded ${_cached.version} from file backup ` +
      `(${_cached.sampleCount} samples)`
    );
    return;
  }

  // No trained model anywhere — use defaults (model will be trained on first trigger).
  _cached = { ...DEFAULT_MODEL };
  logger.info("[modelService] init — no trained model found; using defaults until first training run");
};

/**
 * Returns the current in-memory model synchronously.
 * Falls back to DEFAULT_MODEL when the cache has not been populated yet
 * (e.g. initModelCache() not called or Firestore was unavailable).
 */
export const loadModel = () => _cached ?? { ...DEFAULT_MODEL };

/**
 * Persists a newly trained model to Firestore (primary) and the backup file,
 * then refreshes the in-memory cache.
 *
 * @param {object} model — trained model document (matches schema above)
 * @returns {Promise<void>}
 */
export const saveModel = async (model) => {
  // 1. Firestore (primary)
  try {
    await db
      .collection(MODELS_COLLECTION)
      .doc(CURRENT_MODEL_DOCID)
      .set(model);
    logger.info(
      `[modelService] saved ${model.version} to Firestore ` +
      `(${model.sampleCount} samples, loss=${model.finalLoss})`
    );
  } catch (err) {
    logger.warn(`[modelService] Firestore save failed: ${err.message} — writing to file only`);
  }

  // 2. File backup (synchronous, best-effort)
  saveModelToFile(model);

  // 3. Refresh cache
  _cached = model;
};

/**
 * Clears the in-memory cache so the next loadModel() returns the latest copy.
 * Call this immediately after saveModel() if you want a fresh load on next use.
 * (saveModel already sets _cached, so this is mainly useful for testing.)
 */
export const invalidateModelCache = () => { _cached = null; };

// ─── Inference ────────────────────────────────────────────────────────────────

/**
 * Predicts a relevance score for a raw feature vector.
 *
 * Uses the in-memory cache — fully synchronous, zero I/O per request.
 * Returns 0 when the model is untrained so rule-based scoring is unaffected.
 *
 * @param {number[]} rawFeatures — un-normalized feature values (FEATURE_COUNT long)
 * @returns {number}             — predicted score clamped to [−10, 20]
 */
export const predict = (rawFeatures) => {
  const model = loadModel();
  if (!isModelTrained(model)) return 0;

  const { weights, bias, mins, maxes } = model;

  const features = rawFeatures.map((val, i) => {
    const min   = mins[i]  ?? 0;
    const max   = maxes[i] ?? 1;
    const range = max - min;
    if (range === 0) return 0;
    return Math.min(1, Math.max(0, (val - min) / range));
  });

  const raw = features.reduce(
    (sum, xi, i) => sum + xi * (weights[i] ?? 0),
    bias ?? 0
  );

  return Math.min(20, Math.max(-10, raw));
};

/**
 * Returns whether the cached model has been trained and is active.
 */
export const isLoaded = () => isModelTrained(loadModel());
