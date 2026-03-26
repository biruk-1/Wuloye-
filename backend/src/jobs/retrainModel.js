/**
 * retrainModel.js — Phase 12 scheduled model retraining job.
 *
 * Triggered fire-and-forget from interaction.service.js after every
 * interaction is persisted.  Never throws so the caller's response is
 * never blocked or disrupted.
 *
 * Phase 12 changes vs Phase 11:
 *   • RETRAIN_INTERVAL reduced from 100 → 20 (more frequent updates).
 *   • Version number is auto-incremented on each successful retrain
 *     ("v1" → "v2" → … ) so meta.ai.modelVersion reflects freshness.
 *   • saveModel() is now async (writes to Firestore + file backup).
 *   • Pipeline is properly awaited end-to-end.
 *
 * Retrain triggers:
 *   1. Initial train : totalInteractions >= INITIAL_TRAIN_THRESHOLD
 *                      (fires once when enough data first accumulates).
 *   2. Scheduled     : totalInteractions is a multiple of RETRAIN_INTERVAL
 *                      after the initial threshold.
 */

import { db }                          from "../config/firebase.js";
import {
  buildTrainingData,
  FEATURE_COUNT,
  FEATURE_NAMES,
}                                      from "../services/ai/trainingDataBuilder.js";
import { normalizeDataset }             from "../services/ai/featureNormalizer.js";
import { trainModel }                   from "../services/ai/modelTrainer.js";
import {
  saveModel,
  loadModel,
}                                      from "../services/ai/modelService.js";

const INTERACTIONS_COLLECTION = "interactions";

/** Minimum total interactions before the first training run fires. */
export const INITIAL_TRAIN_THRESHOLD = 10;

/**
 * Retrain every N new interactions after the initial run.
 * Phase 12: reduced to 20 for faster model convergence during active use.
 */
export const RETRAIN_INTERVAL = 20;

// ─── Count helper ─────────────────────────────────────────────────────────────

/**
 * Returns the total number of interaction documents in Firestore.
 * Prefers the lightweight count() aggregation; falls back to a limit query
 * for older emulator versions that don't support count().
 *
 * @returns {Promise<number>}
 */
const getTotalInteractionCount = async () => {
  try {
    const agg = await db.collection(INTERACTIONS_COLLECTION).count().get();
    return agg.data().count ?? 0;
  } catch {
    const snap = await db.collection(INTERACTIONS_COLLECTION).limit(10_001).get();
    return snap.size;
  }
};

// ─── Version helper ───────────────────────────────────────────────────────────

/**
 * Returns the next version number (integer) and label ("v2", "v3", …).
 * Reads the current versionNumber from the cached model so no extra Firestore
 * read is required.
 */
const nextVersion = () => {
  const current        = loadModel();
  const currentNum     = typeof current.versionNumber === "number" ? current.versionNumber : 0;
  const versionNumber  = currentNum + 1;
  return { versionNumber, version: `v${versionNumber}` };
};

// ─── Training pipeline ────────────────────────────────────────────────────────

/**
 * Runs the full build → normalize → train → save pipeline.
 * Increments the model version on every successful run.
 *
 * @param {number} totalCount — for logging
 */
const runTrainingPipeline = async (totalCount) => {
  console.log(`[retrain] starting pipeline (${totalCount} total interactions)`);

  const rawDataset = await buildTrainingData();
  if (rawDataset.length < 5) {
    console.warn(`[retrain] only ${rawDataset.length} usable samples — skipping (need >= 5)`);
    return;
  }

  const { normalizedData, mins, maxes } = normalizeDataset(rawDataset);
  const { weights, bias, losses }       = trainModel(normalizedData, FEATURE_COUNT);
  const { versionNumber, version }      = nextVersion();

  const model = {
    weights,
    bias,
    mins,
    maxes,
    featureNames:  [...FEATURE_NAMES],
    version,
    versionNumber,
    trainedAt:     new Date().toISOString(),
    sampleCount:   rawDataset.length,
    finalLoss:     losses.at(-1) ?? null,
  };

  await saveModel(model);   // writes Firestore + file backup, updates cache

  console.log(`[retrain] Model trained on ${rawDataset.length} samples`);

  console.log(
    `[retrain] complete — ${version} | samples=${rawDataset.length} ` +
    `loss=${model.finalLoss} ` +
    `weights=[${weights.map((w) => w.toFixed(4)).join(", ")}]`
  );
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fire-and-forget retrain gate.
 *
 * Usage:
 *   maybeRetrain().catch(console.warn);
 *
 * Never throws — all errors are caught internally.
 */
export const maybeRetrain = async () => {
  try {
    const totalCount = await getTotalInteractionCount();

    const isFirstTrain =
      totalCount >= INITIAL_TRAIN_THRESHOLD &&
      totalCount < INITIAL_TRAIN_THRESHOLD + RETRAIN_INTERVAL;

    const isScheduled =
      totalCount >= INITIAL_TRAIN_THRESHOLD &&
      totalCount % RETRAIN_INTERVAL === 0;

    if (!isFirstTrain && !isScheduled) return;

    await runTrainingPipeline(totalCount);
  } catch (err) {
    console.warn(`[retrain] pipeline error: ${err.message}`);
  }
};
