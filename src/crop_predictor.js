/**
 * Browser-compatible inference for crop_model.json.
 * This model approximates labels generated from a synthetic scoring rubric.
 * It is not a validated real-world agronomy model.
 */
export function predictCandidateScore(featureValues, modelData) {
  if (!modelData || modelData.format !== "rf_regressor_tree_ensemble_v1" || !Array.isArray(modelData.trees)) {
    throw new Error("Invalid crop model JSON format.");
  }
  const row = Array.isArray(featureValues)
    ? featureValues.map((x) => Number(x ?? 0))
    : modelData.feature_order.map((name) => Number(featureValues?.[name] ?? 0));
  if (row.length !== modelData.feature_order.length) {
    throw new Error(`Expected ${modelData.feature_order.length} model features; received ${row.length}.`);
  }
  let total = 0;
  for (const tree of modelData.trees) {
    let node = 0;
    let guard = 0;
    while (tree.left[node] >= 0 && tree.right[node] >= 0) {
      const f = tree.feature[node];
      node = row[f] <= tree.threshold[node] ? tree.left[node] : tree.right[node];
      guard += 1;
      if (guard > tree.left.length) throw new Error("Corrupt tree structure.");
    }
    total += tree.value[node];
  }
  return Math.max(0, Math.min(100, total / modelData.trees.length));
}
