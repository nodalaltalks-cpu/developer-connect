/**
 * A small, real logistic-regression trainer with a held-out evaluation - and a gate that REFUSES to train on too little
 * data. It exists so that when enough settled history exists (see modelReadiness in intelligence.ts) a lead-conversion
 * model can be fitted and honestly measured instead of guessed. It is NOT used by any screen today: no model is trained,
 * no prediction is shown, and nothing calls this outside its tests until the readiness gate opens and the held-out
 * result clears the bar below.
 *
 * Deterministic: a fixed split by index (no randomness), full-batch gradient descent with L2 regularisation.
 */

export interface Example {
  features: number[];
  label: 0 | 1;
}

export type TrainResult =
  | { status: "INSUFFICIENT_DATA"; needs: string[] }
  | { status: "TRAINED"; weights: number[]; bias: number; heldOut: { n: number; auc: number; brier: number; baseRate: number }; useful: boolean; verdict: string };

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

export function predict(model: { weights: number[]; bias: number }, features: number[]): number {
  let z = model.bias;
  for (let i = 0; i < model.weights.length; i++) z += model.weights[i] * (features[i] ?? 0);
  return sigmoid(z);
}

/** Area under the ROC curve (probability a random positive scores above a random negative; ties count half). null when a class is missing. */
export function auc(scores: number[], labels: number[]): number | null {
  const pos: number[] = [];
  const neg: number[] = [];
  scores.forEach((s, i) => (labels[i] === 1 ? pos : neg).push(s));
  if (pos.length === 0 || neg.length === 0) return null;
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

export const MIN_EXAMPLES = 500;
export const MIN_POSITIVES = 50;
/** A model must beat chance by a clear margin on data it has never seen before anyone is shown its output. */
export const MIN_USEFUL_AUC = 0.65;

export function trainLogistic(examples: readonly Example[], options: { epochs?: number; learningRate?: number; l2?: number } = {}): TrainResult {
  const positives = examples.filter((e) => e.label === 1).length;
  const needs: string[] = [];
  if (examples.length < MIN_EXAMPLES) needs.push(`${MIN_EXAMPLES - examples.length} more labelled examples`);
  if (positives < MIN_POSITIVES) needs.push(`${MIN_POSITIVES - positives} more positive outcomes`);
  if (examples.length - positives < MIN_POSITIVES) needs.push(`${MIN_POSITIVES - (examples.length - positives)} more negative outcomes`);
  if (needs.length > 0) return { status: "INSUFFICIENT_DATA", needs };

  const dims = examples[0].features.length;
  const split = Math.floor(examples.length * 0.8);
  const train = examples.slice(0, split);
  const test = examples.slice(split);
  const { epochs = 400, learningRate = 0.3, l2 = 0.01 } = options;
  const weights = new Array<number>(dims).fill(0);
  let bias = 0;
  for (let epoch = 0; epoch < epochs; epoch++) {
    const grad = new Array<number>(dims).fill(0);
    let gradBias = 0;
    for (const e of train) {
      const err = predict({ weights, bias }, e.features) - e.label;
      for (let i = 0; i < dims; i++) grad[i] += err * e.features[i];
      gradBias += err;
    }
    for (let i = 0; i < dims; i++) weights[i] -= learningRate * (grad[i] / train.length + l2 * weights[i]);
    bias -= learningRate * (gradBias / train.length);
  }
  const scores = test.map((e) => predict({ weights, bias }, e.features));
  const labels = test.map((e) => e.label);
  const heldAuc = auc(scores, labels);
  const brier = scores.reduce((n, s, i) => n + (s - labels[i]) ** 2, 0) / scores.length;
  const baseRate = labels.reduce((n: number, l) => n + l, 0) / labels.length;
  const useful = heldAuc !== null && heldAuc >= MIN_USEFUL_AUC;
  return {
    status: "TRAINED",
    weights,
    bias,
    heldOut: { n: test.length, auc: heldAuc ?? 0.5, brier, baseRate },
    useful,
    verdict: useful ? `Held-out AUC ${(heldAuc ?? 0).toFixed(2)} on ${test.length} unseen leads clears the ${MIN_USEFUL_AUC} bar.` : `Held-out AUC ${(heldAuc ?? 0.5).toFixed(2)} does not clear the ${MIN_USEFUL_AUC} bar: the model is not shown to anyone.`,
  };
}
