/**
 * utils/embedding.js — User and place embedding utilities (Phase 9).
 *
 * Provides the math and data-shaping functions that power the long-term
 * memory scoring layer.  Nothing here touches Firestore; all functions are
 * pure (no side-effects) so they are trivially testable and reusable.
 *
 * Embedding design
 * ────────────────
 * Both user and place embeddings are plain objects keyed by dimension name.
 * Dimension values are floats in [0, 1].  Missing keys are treated as 0.
 *
 *   user.embedding  — persisted on the Firestore profile document.
 *                     Updated after every interaction via updateUserIntelligence().
 *   place embedding — derived at scoring time from place.type and place.tags.
 *                     Never stored; always computed fresh so seeding changes
 *                     are picked up automatically.
 *
 * Similarity metric
 * ─────────────────
 * Weighted dot-product / cosine similarity over the shared dimension set.
 * Returns a scalar in [0, 1]: 0 = no overlap, 1 = perfect alignment.
 */

// ─── Tag → dimension map ──────────────────────────────────────────────────────

/**
 * Maps place tag strings to embedding dimensions.
 * Dimensions match the place type vocabulary used across the engine.
 * Tags not listed here have no embedding effect (silently ignored).
 */
const TAG_DIMENSION_MAP = Object.freeze({
  // Fitness / gym
  weights:             "gym",
  cardio:              "gym",
  "personal-training": "gym",
  "basic-equipment":   "gym",
  "open-early":        "gym",
  "locker-room":       "gym",
  // Wellness / yoga
  meditation:          "yoga",
  pilates:             "yoga",
  stretching:          "yoga",
  mindfulness:         "yoga",
  "morning-class":     "yoga",
  "beginner-friendly": "yoga",
  "group-class":       "yoga",
  // Coffee / cafe
  "specialty-coffee":  "coffee",
  cozy:                "coffee",
  "fast-wifi":         "coffee",
  wifi:                "coffee",
  quiet:               "coffee",
  // Social / nightlife
  cocktails:           "social",
  "craft-beer":        "social",
  dj:                  "social",
  "live-music":        "social",
  "open-late":         "social",
  rooftop:             "social",
  // Dining
  ethiopian:           "restaurant",
  vegan:               "restaurant",
  "family-friendly":   "restaurant",
  // Outdoor / nature
  "running-track":     "outdoor",
  hiking:              "outdoor",
  "scenic-view":       "outdoor",
  "sunrise-view":      "outdoor",
  park:                "outdoor",
  // Premium signal (cross-type quality)
  premium:             "premium",
  pool:                "premium",
  sauna:               "premium",
});

// ─── Place embedding builder ──────────────────────────────────────────────────

/**
 * Derives a place's embedding vector from its type, tags, and indoor/outdoor
 * attribute.  The result is a plain object mapping dimension → [0, 1] float.
 *
 * Rules:
 *   - Primary type dimension: always 1.0
 *   - Each mapped tag: +0.5 to its dimension (clamped at 1.0)
 *   - Indoor boolean: +0.7 to "indoor" dimension
 *   - Outdoor (isIndoor === false): +0.5 to "outdoor" dimension (additive with
 *     any tag-derived outdoor value)
 *
 * @param {object} place — Firestore place document
 * @returns {Record<string, number>}
 */
export const buildPlaceEmbedding = (place) => {
  const embedding = {};

  // Primary type dimension.
  if (place.type) embedding[place.type] = 1.0;

  // Tag-derived dimensions.
  for (const tag of (place.tags ?? [])) {
    const dim = TAG_DIMENSION_MAP[tag];
    if (dim) embedding[dim] = Math.min(1.0, (embedding[dim] ?? 0) + 0.5);
  }

  // Indoor / outdoor signal.
  if (place.isIndoor === true)  embedding.indoor  = 0.7;
  if (place.isIndoor === false) embedding.outdoor = Math.min(1.0, (embedding.outdoor ?? 0) + 0.5);

  return embedding;
};

// ─── Cosine similarity ────────────────────────────────────────────────────────

/**
 * Computes cosine similarity between two embedding objects.
 *
 * Both arguments are plain objects keyed by dimension name; missing keys are
 * treated as 0.  Returns a value in [0, 1] (embeddings are always non-negative
 * so negative cosine scores cannot occur).
 *
 * Returns 0 when either vector is the zero vector (no overlap possible).
 *
 * @param {Record<string, number>} a — user embedding
 * @param {Record<string, number>} b — place embedding
 * @returns {number}
 */
export const cosineSimilarity = (a, b) => {
  if (!a || !b) return 0;

  // Union of all dimension keys.
  const dims = new Set([...Object.keys(a), ...Object.keys(b)]);

  let dot   = 0;
  let normA = 0;
  let normB = 0;

  for (const dim of dims) {
    const va = a[dim] ?? 0;
    const vb = b[dim] ?? 0;
    dot   += va * vb;
    normA += va * va;
    normB += vb * vb;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

// ─── Embedding normalization ──────────────────────────────────────────────────

/**
 * Normalizes an embedding vector so that the maximum value is 1.0 and all
 * values remain in [0, 1].  Negative values are clamped to 0 before
 * normalization.
 *
 * Idempotent when the embedding is already normalized.
 * Returns an empty object for a zero or empty vector.
 *
 * @param {Record<string, number>} embedding
 * @returns {Record<string, number>}
 */
export const normalizeEmbedding = (embedding) => {
  if (!embedding) return {};

  const entries = Object.entries(embedding)
    .map(([k, v]) => [k, Math.max(0, v)]);

  if (entries.length === 0) return {};

  const max = Math.max(...entries.map(([, v]) => v));
  if (max === 0) return {};

  const normalized = {};
  for (const [k, v] of entries) {
    normalized[k] = +(v / max).toFixed(4);
  }
  return normalized;
};

// ─── Meta helper ─────────────────────────────────────────────────────────────

/**
 * Returns the dimension with the highest value in an embedding vector,
 * along with that value — used for meta.longTerm reporting.
 *
 * @param {Record<string, number>} embedding
 * @returns {{ topEmbeddingType: string|null, embeddingStrength: number }}
 */
export const topEmbeddingEntry = (embedding) => {
  if (!embedding) return { topEmbeddingType: null, embeddingStrength: 0 };

  const entries = Object.entries(embedding).filter(([, v]) => v > 0);
  if (entries.length === 0) return { topEmbeddingType: null, embeddingStrength: 0 };

  const [topType, topValue] = entries.sort(([, a], [, b]) => b - a)[0];
  return {
    topEmbeddingType:  topType,
    embeddingStrength: +topValue.toFixed(4),
  };
};
