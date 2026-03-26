/**
 * featureNormalizer.js — Min-max feature normalization for the AI layer.
 *
 * Scales each feature dimension independently to [0, 1] so that dimensions
 * with very different natural ranges (e.g. typeAffinityScore vs. booleans)
 * do not dominate gradient descent.
 *
 * The computed min/max params are stored alongside the model weights in
 * model.json so that the same scaling is applied consistently at both
 * training time and inference time.
 */

// ─── Param computation ────────────────────────────────────────────────────────

/**
 * Computes per-dimension min and max values across the entire dataset.
 *
 * @param {{ features: number[] }[]} dataset
 * @returns {{ mins: number[], maxes: number[] }}
 */
export const computeNormParams = (dataset) => {
  if (dataset.length === 0) return { mins: [], maxes: [] };

  const featureCount = dataset[0].features.length;
  const mins  = new Array(featureCount).fill(Infinity);
  const maxes = new Array(featureCount).fill(-Infinity);

  for (const { features } of dataset) {
    for (let i = 0; i < featureCount; i++) {
      if (features[i] < mins[i])  mins[i]  = features[i];
      if (features[i] > maxes[i]) maxes[i] = features[i];
    }
  }

  return { mins, maxes };
};

// ─── Single-vector normalization ─────────────────────────────────────────────

/**
 * Scales one feature vector using stored min/max params.
 * Dimensions where min === max (constant feature) are mapped to 0.
 * Output values are clamped to [0, 1].
 *
 * @param {number[]} features — raw feature values
 * @param {number[]} mins     — per-dimension minimum (from training set)
 * @param {number[]} maxes    — per-dimension maximum (from training set)
 * @returns {number[]}
 */
export const normalizeFeatures = (features, mins, maxes) =>
  features.map((val, i) => {
    const min   = mins[i]  ?? 0;
    const max   = maxes[i] ?? 1;
    const range = max - min;
    if (range === 0) return 0;
    return Math.min(1, Math.max(0, (val - min) / range));
  });

// ─── Full-dataset normalization ───────────────────────────────────────────────

/**
 * Computes norm params from the dataset and applies them to every sample.
 *
 * Returns:
 *   normalizedData — same shape as input, features rescaled to [0, 1]
 *   mins / maxes   — store these in model.json for inference-time scaling
 *
 * @param {{ features: number[], label: number }[]} dataset
 * @returns {{ normalizedData: { features: number[], label: number }[], mins: number[], maxes: number[] }}
 */
export const normalizeDataset = (dataset) => {
  const { mins, maxes } = computeNormParams(dataset);

  const normalizedData = dataset.map(({ features, label }) => ({
    features: normalizeFeatures(features, mins, maxes),
    label,
  }));

  return { normalizedData, mins, maxes };
};
