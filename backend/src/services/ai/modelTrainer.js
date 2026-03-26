/**
 * modelTrainer.js — Batch gradient descent linear regression.
 *
 * Model:
 *   ŷ = w · x + b
 *   where w ∈ ℝᴺ is the weight vector and b ∈ ℝ is the bias term.
 *
 * Loss:
 *   L = (1/N) Σ (ŷᵢ − yᵢ)²          (mean squared error)
 *
 * Update rule (batch gradient descent):
 *   ∂L/∂wⱼ = (2/N) Σ (ŷᵢ − yᵢ) · xᵢⱼ
 *   ∂L/∂b  = (2/N) Σ (ŷᵢ − yᵢ)
 *   wⱼ ← wⱼ − α · ∂L/∂wⱼ
 *   b  ← b  − α · ∂L/∂b
 *
 * The constant 2 cancels with the learning rate choice, so the standard
 * formulas without the 2 are used below (equivalent once α is tuned).
 *
 * Input dataset must be already normalized to [0, 1] (use featureNormalizer).
 * Labels are interaction scores: view=1, click=2, save=3, dismiss=−1.
 */

import { FEATURE_COUNT } from "./trainingDataBuilder.js";

const DEFAULT_LEARNING_RATE = 0.05;
const DEFAULT_EPOCHS        = 1_000;

// ─── Private helpers ──────────────────────────────────────────────────────────

/** Computes the linear prediction for one sample. */
const linearPredict = (features, weights, bias) =>
  features.reduce((sum, xi, i) => sum + xi * (weights[i] ?? 0), bias);

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Trains a linear regression model on a normalized dataset.
 *
 * @param {{ features: number[], label: number }[]} dataset  — normalized samples
 * @param {number} [featureCount]    — number of input dimensions
 * @param {number} [learningRate]    — gradient descent step size
 * @param {number} [epochs]          — number of full passes over the dataset
 *
 * @returns {{
 *   weights: number[],   — trained weight vector
 *   bias:    number,     — trained bias term
 *   losses:  number[],   — MSE per epoch (for diagnostics)
 * }}
 */
export const trainModel = (
  dataset,
  featureCount = FEATURE_COUNT,
  learningRate = DEFAULT_LEARNING_RATE,
  epochs       = DEFAULT_EPOCHS
) => {
  if (dataset.length === 0) {
    return {
      weights: new Array(featureCount).fill(0),
      bias:    0,
      losses:  [],
    };
  }

  // Initialize weights to small random values to break symmetry.
  // Using Gaussian-like spread (0 ± 0.05) keeps initial predictions near 0.
  let weights = Array.from(
    { length: featureCount },
    () => (Math.random() - 0.5) * 0.1
  );
  let bias = 0;

  const N      = dataset.length;
  const losses = [];

  for (let epoch = 0; epoch < epochs; epoch++) {
    let totalLoss    = 0;
    const wGrad      = new Array(featureCount).fill(0);
    let   bGrad      = 0;

    for (const { features, label } of dataset) {
      const yHat = linearPredict(features, weights, bias);
      const err  = yHat - label;         // residual

      totalLoss += err * err;

      for (let i = 0; i < featureCount; i++) {
        wGrad[i] += err * features[i];
      }
      bGrad += err;
    }

    // Apply averaged gradients.
    for (let i = 0; i < featureCount; i++) {
      weights[i] -= (learningRate * wGrad[i]) / N;
    }
    bias -= (learningRate * bGrad) / N;

    losses.push(+(totalLoss / N).toFixed(6));
  }

  return { weights, bias, losses };
};
