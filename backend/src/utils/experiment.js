/**
 * Phase 17 — A/B experiment helpers for recommendation ranking.
 *
 * Env:
 *   EXPERIMENT_ACTIVE       — "true" to enable assignment + meta.experiment + interaction stamps
 *   EXPERIMENT_B_PERCENT    — 0–100, fraction of users assigned to variant B (default 50)
 *   EXPERIMENT_B_RULE_BLEND — rule weight for variant B (default 0.6)
 *   EXPERIMENT_B_MODEL_BLEND — model weight for variant B (default 0.4)
 *
 * Variant A keeps the production blend (0.7 rule / 0.3 model). Variant B increases model
 * influence unless overrides are set.
 */

import crypto from "crypto";

/** Stable id for this experiment — change when starting a new study. */
export const EXPERIMENT_ID = "rec_rank_v1";

export const VARIANT_A = "A";
export const VARIANT_B = "B";

/** Mirrors recommendation.service WEIGHTS.ruleBlendWeight / modelBlendWeight. */
const DEFAULT_RULE_BLEND = 0.7;
const DEFAULT_MODEL_BLEND = 0.3;

export const isExperimentActive = () => process.env.EXPERIMENT_ACTIVE === "true";

/**
 * Deterministic A/B assignment from user id (no Firestore write).
 *
 * @param {string} userId
 * @returns {"A"|"B"}
 */
export const getVariantForUser = (userId) => {
  const hash = crypto.createHash("sha256").update(`${userId}:${EXPERIMENT_ID}`).digest();
  const n = hash.readUInt32BE(0) % 100;
  const bPct = Math.min(100, Math.max(0, parseInt(process.env.EXPERIMENT_B_PERCENT || "50", 10)));
  return n < bPct ? VARIANT_B : VARIANT_A;
};

/**
 * @param {"A"|"B"} variant
 * @returns {{ ruleBlendWeight: number, modelBlendWeight: number }}
 */
export const getBlendWeightsForVariant = (variant) => {
  if (variant === VARIANT_A) {
    return {
      ruleBlendWeight:  DEFAULT_RULE_BLEND,
      modelBlendWeight: DEFAULT_MODEL_BLEND,
    };
  }

  let rule = parseFloat(process.env.EXPERIMENT_B_RULE_BLEND || "0.6");
  let model = parseFloat(process.env.EXPERIMENT_B_MODEL_BLEND || "0.4");
  const sum = rule + model;
  if (!Number.isFinite(sum) || sum <= 0) {
    rule = 0.6;
    model = 0.4;
  } else if (Math.abs(sum - 1) > 0.001) {
    rule /= sum;
    model /= sum;
  }

  return { ruleBlendWeight: rule, modelBlendWeight: model };
};
